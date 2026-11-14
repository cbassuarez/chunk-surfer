// A photosensitivity advisory, durable profile consent and a separate,
// session-only microphone choice. Permission choices never imply one another.

import * as scenes from './scenes.js';
import { uiSize, uiFill, uiText, uiWrap, uiCellMetrics } from '../render/ui.js';
import { withMachinePanel, drawVfdText, drawVfdSprite, machinePanelBody, machinePanelAperture } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { layoutTranscriptChoices, drawTranscriptChoices } from '../render/transcript.js';
import { createHitRegions } from '../render/hit-regions.js';
import { fitText } from '../render/fit-text.js';
import { vfdMicrophoneFrame, VFD_MIC_DOTS } from '../render/vfd-microphone.js';
import { promptLine, activeInputPromptDevice } from './bindings.js';
import { hardwareMotionReduced } from '../render/hardware-material.js';

const WARNINGS = [
  'This game contains flashing lights and high-contrast patterns.',
  '',
  'These may trigger seizures or discomfort in people with photosensitivity.',
  'If you feel unwell, stop playing and consult a medical professional.',
  'Visual effects can be reduced in Settings.',
];

const PROFILE = [
  'THIS GAME MEASURES YOU PSYCHOLOGICALLY.',
  '',
  'PROFILE ON permits these local-only modules:',
  '• Room-microphone loudness during declared authored moments, subject to',
  '  the separate microphone choice. No speech recognition.',
  '• Steam display name only—never Steam ID, friends, or account enumeration.',
  '• OS username, computer hostname, and selected microphone label.',
  '• Measurement of choices, noise, HUSH contacts, battle responses, and',
  '  emergency fireball-surface closes to build a fictional local response profile.',
  '• Authored main-frame motion, four combat panes, and up to eight silent media panes during',
  '  battles and the post-FOH Source crossing. They never show personal data.',
  '• AUDIOCORP field-return files in Chunk Surfer’s local game-data folder.',
  '',
  'Processing is local. Nothing is uploaded. Profiling never stores raw audio.',
  'Names never affect psychological scoring and are not written to returns.',
  'Settings can disable any module, restore the game window, reset inference, open the',
  'return folder, or erase all profile data and artifacts.',
  '',
  'PROFILE OFF enables none of these profiling modules.',
  'The complete game remains available.',
  '',
  'Choose PROFILE ON or PROFILE OFF.',
];

const MICROPHONE = [
  'Allow microphone use for this session?',
  '',
  'Room noise can expose you to HUSH. You can also record a short',
  'spoken slate with a take; that audio stays on this device.',
  'No speech recognition is used and audio is not uploaded.',
  '',
  'You can play without a microphone.',
];

// Reserve the decision and its input legend before fitting the copy. The true
// aperture is smaller than machinePanelBody, especially without a metal footer.
const TITLE_ROWS = 3;
const ACTION_ROWS = 5; // separation, ordinary picker heading, two numbered replies, legend
const GLASS_CLEARANCE = 0.65;

const cardClass = (line) => /^(THIS GAME|Choose PROFILE|REQUESTING|MICROPHONE|NO MICROPHONE)/.test(line)
  ? 'ui-amber'
  : /^(Processing|Names never|Settings can|PROFILE OFF|The complete)/.test(line)
    ? 'ui-blue'
    : 'ui-secondary';

// The copy keeps hard line breaks from when it was laid out for one width. A
// line that starts indented or in lower case continues the one before it, so
// it is joined back, then wrapped to the width the panel really has; bullets
// keep a hanging indent.
export function warningCardRows(lines, width) {
  const logical = [];
  for (const line of lines) {
    if (line && logical.length && logical[logical.length - 1] && /^(\s|[a-z])/.test(line)) {
      logical[logical.length - 1] += ` ${line.trim()}`;
    } else logical.push(line);
  }
  const out = [];
  for (const line of logical) {
    if (!line) { out.push({ text: '', cls: 'ui-secondary' }); continue; }
    const cls = cardClass(line);
    const bullet = line.startsWith('• ');
    const parts = uiWrap(bullet ? line.slice(2) : line, Math.max(8, width - (bullet ? 2 : 0)));
    parts.forEach((text, i) => out.push({ text: bullet ? `${i ? '  ' : '• '}${text}` : text, cls }));
  }
  return out;
}

// The microphone's box in cells, beside the text. Its dots stay square, so the
// width follows from the height and the cell's own aspect. Narrow panels give
// the words the room first: the picture shrinks, then goes.
export function warningMicArt(bodyW, { aspect = uiCellMetrics().aspect, minText = 36, maxHeight = 9 } = {}) {
  const ratio = VFD_MIC_DOTS.cols / VFD_MIC_DOTS.rows;
  for (let h = Math.min(9, Math.floor(maxHeight)); h >= 5; h--) {
    const w = Math.ceil(h * ratio / Math.max(0.2, aspect || 0.45));
    if (bodyW - w - 3 >= minText) return { w, h };
  }
  return null;
}

const CARD_LINES = Object.freeze({ warning: WARNINGS, profile: PROFILE, microphone: MICROPHONE });

// Choices stay on the glass while only the explanatory copy scrolls. A phase
// change keeps the original card's footprint, so a permission result cannot
// move a control under a held pointer. Single actions occupy the decline slot.
export function warningCardLayout(card, { cols, rows, footer = '', aspect, lines } = {}) {
  const w = Math.min(92, cols - 4);
  const x = Math.floor((cols - w) / 2);
  const probe = machinePanelBody(0, 0, w, 100, { footer });
  const probeGlass = machinePanelAperture(0, 0, w, 100);
  const safeBottom = box => Math.floor(box.y + box.h - GLASS_CLEARANCE + 1e-7);
  const chrome = 100 - (safeBottom(probeGlass) - probe.y);
  const contentRows = rows - 2 - chrome - ACTION_ROWS;
  let art = card === 'microphone' ? warningMicArt(probe.w, {
    ...(aspect == null ? {} : { aspect }), maxHeight: contentRows,
  }) : null;
  // At large UI scale, give the permission explanation the illustration's
  // space first, then remove empty paragraph rows. The actual words stay intact.
  if (art && TITLE_ROWS + warningCardRows(CARD_LINES[card], probe.w - art.w - 5).length > contentRows) art = null;
  const textX = art ? art.w + 3 : 0, textW = probe.w - textX;
  let baseline = warningCardRows(CARD_LINES[card] || [], textW - 2);
  const compact = card === 'microphone' && TITLE_ROWS + baseline.length > contentRows;
  if (compact) baseline = baseline.filter(row => row.text);
  let out = lines ? warningCardRows(lines, textW - 2) : baseline;
  if (compact) out = out.filter(row => row.text);
  // The compact card already names MICROPHONE in its physical header. Spend
  // the repeated title's rows on the complete disclosure and vertical replies.
  const titleRows = compact ? 0 : TITLE_ROWS;
  const wanted = Math.max(titleRows + Math.max(out.length, baseline.length), art ? art.h : 0) + ACTION_ROWS;
  const h = Math.max(chrome + titleRows + ACTION_ROWS + 1, compact ? rows - 2 : Math.min(rows - 2, wanted + chrome));
  const y = Math.max(0, Math.floor((rows - h) / 2));
  const body = machinePanelBody(x, y, w, h, { footer });
  const aperture = machinePanelAperture(x, y, w, h);
  const actionY = safeBottom(aperture) - 3;
  const visible = Math.max(1, actionY - 2 - (body.y + titleRows));
  const actions = [0, 1].map(index => ({
    index, x: body.x, y: actionY + index - 0.15,
    w: body.w, h: 1, textY: actionY + index,
  }));
  return {
    x, y, w, h, body, aperture, art, compact, titleRows, textX, textW, out, visible,
    actions: card === 'warning' ? [actions[1]] : actions,
    textRect: { x: body.x + textX, y: body.y + titleRows, w: textW, h: visible },
    choiceY: actionY - 1,
    hint: { x: body.x, y: actionY + 2, w: body.w },
    scrollMax: Math.max(0, out.length - visible),
  };
}

export function makeWarningScene({
  onDone = () => {},
  onProfileOn = () => {},
  onProfileOff = () => {},
  onMicAllow = () => {},
  onMicDeny = () => {},
  getMicSnapshot = null,
  showWarning = true,
  askProfile = true,
  askMic = false,
} = {}) {
  const cards = [showWarning && 'warning', askProfile && 'profile', askMic && 'microphone'].filter(Boolean);
  const hits = createHitRegions();
  const heldActivation = new Set();
  let index = 0;
  let answered = false, closed = false, selected = 1;
  let scroll = 0, scrollMax = 0;
  let phase = 'choice', micResult = null, requestGeneration = 0, ownsMicRequest = false;
  let revision = 0, armedPointer = null, lastLayout = null, wheelRemainder = 0;
  let artTime = 0;

  const card = () => cards[index];
  const keyToken = e => e.controllerAction ? `pad:${e.controllerAction}` : e.code || e.key;
  const clearPressed = () => { armedPointer = null; heldActivation.clear(); };

  function resetTargets() {
    revision++;
    hits.reset();
    armedPointer = null;
    lastLayout = null;
    wheelRemainder = 0;
  }

  function choices() {
    if (card() === 'warning') return [{ id: 'continue', label: 'CONTINUE' }];
    if (card() === 'profile') return [
      { id: 'allow', label: 'PROFILE ON' }, { id: 'deny', label: 'PROFILE OFF' },
    ];
    const decline = { id: 'deny', label: 'PLAY WITHOUT MIC' };
    return phase === 'requesting' ? [decline]
      : [{ id: 'allow', label: canUseDefaultMic() ? 'USE DEFAULT MIC' : phase === 'failure' ? 'TRY AGAIN' : 'ALLOW MICROPHONE' }, decline];
  }

  function canUseDefaultMic() {
    return phase === 'failure' && (micResult?.reason === 'selected-device-missing'
      || micResult?.failedConstraint === 'deviceId');
  }

  function microphoneLines() {
    if (phase === 'requesting') return [
      'REQUESTING MICROPHONE ACCESS', '',
      'Respond to the system or browser permission prompt if it appears.', '',
      'The game will continue when access is granted.',
      'You can also play without a microphone.',
    ];
    if (phase !== 'failure') return MICROPHONE;
    const recovery = {
      'selected-device-missing': [
        'THE SAVED MICROPHONE IS NOT AVAILABLE.',
        'Choose USE DEFAULT MIC to try the system input instead.',
      ],
      'insecure-context': [
        'MICROPHONE ACCESS NEEDS A SECURE PAGE.',
        'Open a secure (HTTPS) version of the game, then try again.',
      ],
      'microphone-policy-blocked': [
        'MICROPHONE ACCESS IS BLOCKED IN THIS VIEW.',
        'Open the game directly, or enable microphone access in its host.',
      ],
      'no-media-devices': [
        'THIS VIEW CANNOT ACCESS A MICROPHONE.',
        'Try a current browser or update the installed game.',
      ],
      'no-audio-context': [
        'GAME AUDIO COULD NOT START.',
        'Check your audio device and restart the game, then try again.',
      ],
      'audio-context-closed': [
        'GAME AUDIO HAS STOPPED.',
        'Restart the game to reconnect audio, then try again.',
      ],
      'audio-setup-failed': [
        'MICROPHONE AUDIO COULD NOT START.',
        'Access was granted, but audio could not start. Restart the game, then try again.',
      ],
      'capture-disabled': [
        'MICROPHONE ACCESS IS DISABLED.',
        'Enable microphone access for this app in your system or browser settings.',
      ],
      'capture-aborted': [
        'MICROPHONE START WAS INTERRUPTED.',
        'Check that the input device is ready, then try again.',
      ],
      'inactive-document': [
        'RETURN TO THE GAME TO USE THE MICROPHONE.',
        'Bring this window to the front, then try again.',
      ],
      'no-audio-track': [
        'THE MICROPHONE DID NOT PROVIDE AUDIO.',
        'Reconnect or enable the input device, then try again.',
      ],
    };
    const guidance = recovery[micResult?.reason]
      || (canUseDefaultMic() ? recovery['selected-device-missing'] : null);
    if (guidance) return [guidance[0], '', guidance[1], '', 'You can play without a microphone.'];
    if (micResult?.state === 'denied') return [
      'MICROPHONE ACCESS WAS NOT GRANTED.', '',
      'You can play without a microphone.',
      'To try again, allow access in your system or browser settings.',
    ];
    return [
      micResult?.state === 'unavailable' ? 'NO MICROPHONE IS AVAILABLE.' : 'MICROPHONE COULD NOT START.', '',
      micResult?.reason === 'device-busy'
        ? 'Check whether another application is using the microphone, then try again.'
        : 'Check your input device and its permissions, then try again.', '',
      'You can play without a microphone.',
    ];
  }

  function finish() {
    if (closed) return;
    closed = true;
    scenes.remove(scene);
    onDone();
  }

  function next() {
    resetTargets();
    requestGeneration++;
    phase = 'choice';
    micResult = null;
    if (++index >= cards.length) finish();
    else { answered = false; selected = 1; scroll = 0; scrollMax = 0; }
  }

  function settleMicrophone(result, generation) {
    if (closed || generation !== requestGeneration || phase !== 'requesting') return;
    if (result?.state === 'asking') return;
    if (result?.active === true || result?.state === 'on' || result?.state === 'test') {
      ownsMicRequest = false;
      next();
      return;
    }
    micResult = result && ['denied', 'unavailable', 'error'].includes(result.state)
      ? result : { state: 'error', reason: 'microphone-not-started' };
    phase = 'failure';
    answered = false;
    selected = 1;
    scroll = 0;
    resetTargets();
  }

  function requestMicrophone() {
    if (answered || phase === 'requesting') return;
    // A failed exact device selection never silently switches microphones.
    // The recovery choice explicitly names the input it will request.
    const useDefault = canUseDefaultMic();
    answered = true;
    phase = 'requesting';
    ownsMicRequest = true;
    selected = 0;
    scroll = 0;
    resetTargets();
    const generation = ++requestGeneration;
    try {
      // Invoke synchronously on the user's activation, before any await. The
      // OS grant and this session's in-game consent remain separate decisions.
      const result = useDefault ? onMicAllow({ deviceId: 'default', lastDeviceLabel: '' }) : onMicAllow();
      if (result && typeof result.then === 'function') {
        Promise.resolve(result).then(
          snapshot => settleMicrophone(snapshot, generation),
          () => settleMicrophone({ state: 'error' }, generation),
        );
      } else settleMicrophone(result ?? getMicSnapshot?.(), generation);
    } catch (_) { settleMicrophone({ state: 'error' }, generation); }
  }

  function activate(id) {
    if (closed) return;
    if (card() === 'microphone') {
      if (id === 'allow') { requestMicrophone(); return; }
      if (id !== 'deny') return;
      // micStop (owned by the caller) invalidates any late OS result as well.
      requestGeneration++;
      ownsMicRequest = false;
      onMicDeny();
      next();
      return;
    }
    if (answered) return;
    answered = true;
    if (card() === 'profile') (id === 'allow' ? onProfileOn : onProfileOff)();
    next();
  }

  function scrollCopy(delta) {
    scroll = Math.max(0, Math.min(scrollMax, scroll + delta));
  }

  function inputLegend(width, count) {
    const parts = [
      ...(count > 1 ? [{ action: 'select', label: 'CHOOSE' }] : []),
      { action: 'confirm', label: count > 1 ? 'CONFIRM' : 'SELECT' },
    ];
    const essential = promptLine(parts);
    const more = scrollMax ? activeInputPromptDevice()==='controller'
      ? promptLine([{action:'tabPrev',label:'PREV'},{action:'tabNext',label:'MORE'}]) : 'PGUP / PGDN MORE' : '';
    if (!more) return fitText(essential, width);
    if (essential.length + more.length + 3 <= width) return `${essential} · ${more}`;
    // Direction glyphs work for keys and a D-pad; the actual confirm button
    // still comes from the active controller family/remapping.
    return fitText([
      ...(count > 1 ? ['↑↓ CHOOSE'] : []),
      promptLine([{ action: 'confirm', label: count > 1 ? 'CONFIRM' : 'SELECT' }]),
      more,
    ].join(' · '), width);
  }

  const scene = {
    id: 'warning',
    blocksInput: true,
    blocksWorld: true,
    handlesEscape: true,
    worldPresentation: 'hidden',
    lensPreset: 'calm',
    blur: clearPressed,
    enter() {
      globalThis.addEventListener?.('blur', clearPressed);
      if (!cards.length) finish();
    },
    exit() {
      closed = true;
      requestGeneration++;
      resetTargets();
      clearPressed();
      globalThis.removeEventListener?.('blur', clearPressed);
      if (ownsMicRequest) {
        ownsMicRequest = false;
        onMicDeny();
      }
    },
    update(dt = 0) {
      artTime += Math.max(0, Math.min(.25, Number(dt) || 0));
      // micInit may return early for a request already in flight. Observing its
      // snapshot covers that case without launching a second native prompt.
      if (closed || phase !== 'requesting' || !getMicSnapshot) return;
      try {
        const snapshot = getMicSnapshot();
        if (snapshot && snapshot.state !== 'idle') settleMicrophone(snapshot, requestGeneration);
      } catch (_) { settleMicrophone({ state: 'error' }, requestGeneration); }
    },

    key(e) {
      if (e.metaKey || e.ctrlKey || e.altKey || closed) return true;
      const key = (e.key || '').toLowerCase();
      const code = e.code || '';
      const direction = /^(Arrow(Up|Down|Left|Right)|Tab|PageUp|PageDown|Home|End|Escape|Enter)$/.test(code) ? code : e.key || code;
      const page = Math.max(1, (lastLayout?.visible || 5) - 1);
      e.preventDefault?.();
      armedPointer = null;
      const scrollBy = direction === 'PageUp' || e.controllerAction==='tabPrev' ? -page
        : direction === 'PageDown' || e.controllerAction==='tabNext' ? page : 0;
      if (scrollBy) {
        scrollCopy(scrollBy);
        return true;
      }
      if (direction === 'Home' || direction === 'End') {
        scroll = direction === 'Home' ? 0 : scrollMax;
        return true;
      }
      const items = choices();
      const previous = direction === 'ArrowUp' || key === 'w' || ['up', 'move_up'].includes(e.controllerAction),
        following = direction === 'ArrowDown' || key === 's' || ['down', 'move_down'].includes(e.controllerAction);
      if (previous || following || direction === 'Tab') {
        selected = (selected + (previous || e.shiftKey ? -1 : 1) + items.length) % items.length;
        return true;
      }
      const direct = /^[1-9]$/.test(key) && Number(key) <= items.length ? Number(key) - 1 : -1;
      const yes = key === 'y' || code === 'KeyY';
      const no = key === 'n' || code === 'KeyN' || direction === 'Escape' || e.controllerAction === 'back';
      const confirm = direction === 'Enter' || code === 'Enter' || key === ' ' || code === 'Space' || e.controllerAction === 'confirm';
      if (!(yes || no || confirm || direct >= 0 || card() === 'warning' && key === 'z')) return true;
      if (card() === 'warning' && !(confirm || key === 'z' || direct >= 0)) return true;
      if (e.repeat || heldActivation.has(keyToken(e))) return true;
      if (phase === 'requesting' && yes) return true;
      heldActivation.add(keyToken(e));
      activate(card() === 'warning' ? 'continue' : no ? 'deny' : yes ? 'allow' : items[direct >= 0 ? direct : Math.min(selected, items.length - 1)].id);
      return true;
    },
    keyup(e) { heldActivation.delete(keyToken(e)); return true; },

    pointer(e) {
      if (closed) return true;
      if (e.type === 'pointercancel') { armedPointer = null; return true; }
      if (e.type === 'wheel') {
        const text = lastLayout?.textRect;
        if (!text || !scrollMax || e.cellX < text.x || e.cellX >= text.x + text.w
          || e.cellY < text.y || e.cellY >= text.y + text.h) return true;
        e.preventDefault?.();
        const units = e.deltaMode === 1 ? 1 : e.deltaMode === 2 ? text.h : 1 / (uiCellMetrics().cellH || 20);
        wheelRemainder += (Number(e.deltaY) || 0) * units;
        const lines = Math.trunc(wheelRemainder);
        if (lines) { scrollCopy(lines); wheelRemainder -= lines; }
        return true;
      }
      if (e.isPrimary === false || e.originalEvent?.isPrimary === false) return true;
      if (e.type === 'pointermove') { hits.handle(e, { click: false }); return true; }
      if ((e.button ?? 0) !== 0 || e.originalEvent?.ctrlKey || e.originalEvent?.metaKey) return true;
      const target = hits.hit(e.cellX, e.cellY);
      if (e.type === 'pointerdown') {
        armedPointer = target && !target.disabled ? { id: target.id, pointerId: e.pointerId, revision } : null;
        target?.onHover?.(target, e);
      } else if (e.type === 'pointerup') {
        const armed = armedPointer;
        armedPointer = null;
        if (armed && armed.revision === revision && armed.pointerId === e.pointerId && armed.id === target?.id) {
          target.onClick?.(target, e);
        }
      }
      return true;
    },

    render() {
      if (closed) return;
      hits.reset();
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, UI_COLOR.glass);
      const currentCard = card();
      const layout = warningCardLayout(currentCard, {
        cols, rows, ...(currentCard === 'microphone' ? { lines: microphoneLines() } : {}),
      });
      const { art, textX, textW, out, visible } = layout;
      lastLayout = layout;
      scrollMax = layout.scrollMax;
      scroll = Math.min(scroll, scrollMax);
      const items = choices();
      selected = Math.min(selected, items.length - 1);
      const renderedRevision = revision;

      withMachinePanel(layout.x, layout.y, layout.w, layout.h, {
        theme: 'amber',
        wordmark: 'AUDIOCORP',
        label: currentCard === 'warning' ? 'PHOTOSENSITIVITY' : currentCard === 'profile' ? 'PSYCHOLOGICAL PROFILE' : 'MICROPHONE',
        source: currentCard === 'warning' ? 'READ THIS' : currentCard === 'profile' ? 'LOCAL DOSSIER' : 'THIS SESSION',
        footer: '',
        meter: false,
      }, (panel) => {
        if (art) {
          const contentHeight = layout.actions[0].textY - 1 - panel.y;
          const top = panel.y + Math.max(0, Math.floor((contentHeight - art.h) / 2));
          drawVfdSprite(panel.x, top, art.w, art.h, vfdMicrophoneFrame({t:artTime,live:false,
            mode:phase==='requesting'?'requesting':phase==='failure'?'blocked':'standby',reduced:hardwareMotionReduced()}));
        }
        const tx = panel.x + textX;
        if(layout.titleRows)drawVfdText(tx, panel.y, currentCard === 'warning' ? 'BEFORE YOU START' : currentCard === 'profile' ? 'CONSENT REQUIRED' : 'YOUR MICROPHONE', { max: textW });
        out.slice(scroll, scroll + visible).forEach((row, i) => {
          if (row.text) uiText(tx, layout.textRect.y + i, row.text, row.cls, 1, textW - 2);
        });
        for (const [direction, visibleArrow, y, label] of [
          [-1, scroll > 0, layout.textRect.y, '▲'],
          [1, scroll < scrollMax, layout.textRect.y + visible - 1, '▼'],
        ]) {
          if (!visibleArrow) continue;
          const x = tx + textW - 1;
          uiText(x, y, label, 'ui-amber');
          hits.add({ id: `${revision}:scroll:${direction}`, kind: 'warning-scroll', x: x - 0.5, y: y - 0.2, w: 1.5, h: 1.4,
            onClick: () => { if (revision === renderedRevision) scrollCopy(direction * Math.max(1, visible - 1)); } });
        }
        items.forEach((item, i) => {
          const region = items.length === 1 ? layout.actions.at(-1) : layout.actions[i];
          const id = `${revision}:choice:${item.id}`;
          hits.add({ ...region, id, kind: 'warning-choice', label: item.label, selected: i === selected,
            onHover: () => { if (revision === renderedRevision) selected = i; },
            onClick: () => { if (revision === renderedRevision) activate(item.id); } });
        });
        const reply = layoutTranscriptChoices({pending:{kind:currentCard==='warning'?'say':'branch',index:selected,
          options:items.map(item=>({text:item.label}))}},layout.body.w,{lane:{x:0,w:layout.body.w,align:'left'}});
        // A pending OS prompt retains the opt-out's original physical row.
        // Its displayed number still matches the sole available input choice.
        if(items.length===1)reply.rows.splice(1,0,{kind:'label',text:'',selected:false});
        drawTranscriptChoices(reply,{x:layout.body.x,y:layout.choiceY,width:layout.body.w});
        uiText(layout.hint.x, layout.hint.y, inputLegend(layout.hint.w, items.length), 'ui-secondary', 0.75, layout.hint.w);
      });
    },
  };
  return scene;
}
