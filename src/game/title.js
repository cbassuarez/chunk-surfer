// Title screen. Also the audio gate: nothing may call ensureCtx() until a key
// has been pressed here, which satisfies browser autoplay policy and gives the
// first sound of the piece a deliberate moment of silence to arrive out of.
//
// The title keeps a stable case-file layout in every profile state. Empty
// archives/endings are still available; their panels explain that nothing is
// filed yet instead of changing the top-level menu shape.

import * as scenes from './scenes.js';
import { uiSize, uiCenter, uiFill, uiText, uiWithAlpha } from '../render/ui.js';
import { drawLocationIndicator, drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { createHitRegions } from '../render/hit-regions.js';
import { drawVfdRow, vfdRowStyle } from '../render/vfd-select.js';
import { UI_COLOR, activeTheme } from '../render/palette.js';
import { getMeta, hasActiveRun } from './save.js';
import * as AUDIO from '../audio/story-audio.js';
import { monitorProgramMeasurement, monitorSnapshotForRms } from '../audio/monitor.js';
import { promptLine } from './bindings.js';
import { bootWeather, bootWeatherAudio, drainBootThunder, renderBootWeather, stepBootWeatherTitleTail } from './boot-weather.js';
import { transferRoomCopy } from './post-run-copy.js';

const TITLE_CONFIRM_PROMPT = 'START NEW RUN? PRESS ENTER AGAIN';
const TITLE_MENU_TWO_COLUMN_MIN_W = 64;

function titleMenuColumnCount(bodyW, itemCount) {
  return bodyW >= TITLE_MENU_TWO_COLUMN_MIN_W && itemCount > 4 ? 2 : 1;
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function drawRightText(xRight, y, text, role = 'ui-label', alpha = 1) {
  const s = String(text || '').toUpperCase();
  if (!s) return;
  uiText(Math.round(xRight - s.length + 1), y, s, role, alpha);
}

function titleMenuLayout(body, itemCount) {
  const colCount = titleMenuColumnCount(body.w, itemCount);
  const twoColumns = colCount > 1;

  if (!twoColumns) {
    const x = body.x + 7;
    const w = Math.max(1, body.w - 14);
    return {
      colCount: 1,
      rowCount: itemCount,
      colX: [x],
      colW: [w],
      confirmW: w,
    };
  }

  const leftX = body.x + 4;
  const rightX = Math.min(
    body.x + body.w - 22,
    Math.max(body.x + 40, Math.floor(body.x + body.w * 0.58)),
  );
  const gap = 4;
  const leftW = Math.max(
    TITLE_CONFIRM_PROMPT.length + 2,
    rightX - leftX - gap,
  );
  const rightW = Math.max(18, body.x + body.w - rightX - 3);

  return {
    colCount,
    rowCount: Math.ceil(itemCount / colCount),
    colX: [leftX, rightX],
    colW: [leftW, rightW],
    confirmW: leftW,
  };
}

// The strip is a 0..1 position, and the levels out here are tiny — the menu
// hiss sits at 0.018 linear and the rain bed at 0.011, which is about -35 to
// -39 dBFS. Mapped linearly, the whole menu would live in the first segment.
// This is the window the instrument is scaled to: quiet-but-present at the
// bottom, a thunder crack near the top.
const STRIP_FLOOR_DB = -62;
const STRIP_CEIL_DB = -14;

export function envelopeToStrip(rms) {
  const value = Number(rms) || 0;
  if (!(value > 0)) return 0;
  const db = 20 * Math.log10(value);
  const t = (db - STRIP_FLOOR_DB) / (STRIP_CEIL_DB - STRIP_FLOOR_DB);
  return Math.max(0, Math.min(1, t));
}

// WHAT THIS PROFILE IS. Facts about the save, in the order they are actionable:
// a run you can resume outranks a count of runs you have finished.
//
// THE HUSH LINE IS GONE. `meta.hushMet` is set once by once('hush-met') and is
// never cleared, so "THE HUSH HAS YOUR SIGNAL." appeared on every title screen
// for the rest of that profile's life — a sentence written as a personal threat,
// worn down into wallpaper by being permanent. It also outranked the unfinished
// run, which is a fact that expires and that the player can act on. The flag
// itself stays; terror.js still reads it. Nothing draws it any more.
export function titleStateLine(meta = {}, { activeRun = false, filed = 0 } = {}) {
  if (activeRun || meta?.leftMidRun) return { text: 'UNFINISHED RUN SAVED.', role: 'ui-amber' };
  const returns = meta?.endingsSeen?.length || 0;
  if (!returns) return { text: 'THE CASE FILE IS EMPTY.', role: 'ui-secondary' };
  // A count, not an advert. The archive and the endings are rows on this screen;
  // telling the player they are available while they are looking at them was the
  // line doing nothing at all.
  const parts = [`${returns} RETURN${returns === 1 ? '' : 'S'} FILED`];
  if (filed > 0) parts.push(`${filed} SHEET${filed === 1 ? '' : 'S'}`);
  return { text: parts.join('  \u00b7  '), role: 'ui-secondary' };
}

// WHAT THE ROW UNDER THE CURSOR DOES. One line each, in the register the rest of
// the panel uses. The transfer room defers to post-run-copy so its two states
// are still authored in one place.
const TITLE_ROW_HELP = Object.freeze({
  'continue': 'RESUME THE NIGHT YOU LEFT.',
  'new-run': 'START A NEW NIGHT.',
  'archive': 'ACHIEVEMENTS, RUN HISTORY AND ARCHIVED DOCUMENTS.',
  'return-index': 'THE ENDINGS YOU HAVE REACHED, AND THE ONES YOU HAVE NOT.',
  'beta-notice': 'WHAT THIS BUILD IS, AND WHAT IT IS NOT YET.',
  'settings': 'AUDIO, DISPLAY, CONTROLS AND ACCESSIBILITY.',
});

export function titleRowHelp(item, { filed = 0 } = {}) {
  if (!item) return '';
  if (item.id === 'transfer-room') return transferRoomCopy({ filed }).short;
  if (item.id === 'continue' && item.disabled) return 'NO RUN IN PROGRESS.';
  return TITLE_ROW_HELP[item.id] || '';
}

export function makeTitleScene({
  buildLabel = '',
  onNewGame,
  onContinue,
  onTransferRoom = () => {},
  onSettings,
  onArchive = () => {},
  onReturnIndex = () => {},
  onBetaNotice = () => {},
  onAudioGate = () => {},
  onSelectionChange = () => {},
  presentationState = () => null,
} = {}) {
  const meta = getMeta();
  const replay = (meta.endingsSeen?.length || 0) > 0;
  const filed = Object.keys(meta.knowledge?.documents || {}).length;
  const transferRoomOpen = replay || filed > 0;
  const activeRun = hasActiveRun();

  const items = [
    { id: 'continue', label: 'continue', run: onContinue, disabled: !activeRun, stay: true },
    { id: 'new-run', label: 'new run', run: onNewGame, confirms: true, stay: true },
    { id: 'archive', label: 'achievements', stay: true, run: onArchive },
    { id: 'return-index', label: 'endings', stay: true, run: onReturnIndex },
    // THE OFFICE YOU COME BACK TO. It appears the moment there is any reason to
    // go there — the first sheet you read, or the first night you finish — and
    // never before, because an empty file is a worse introduction than no row.
    ...(transferRoomOpen ? [{ id: 'transfer-room', label: 'the transfer room', stay: true, run: onTransferRoom }] : []),
    { id: 'beta-notice', label: 'beta notice', stay: true, run: onBetaNotice },
    { id: 'settings', label: 'settings', stay: true, run: onSettings },
  ];

  let sel = activeRun ? 0 : 1;
  let previousSel = sel;
  let previousSelUntil = 0;
  let audioPrimed = false;
  // What the instrument is actually hearing, and a slow envelope of it. See the
  // block where they are drawn.
  let programRms = 0;
  let programEnvelope = 0;
  let programPeak = 0;
  let programClipped = false;
  let confirmNewRun = false;
  let t = 0;
  let menuColumns = 1;
  const hits = createHitRegions();
  let a11yStatus=null;
  function ensureA11y(){
    const map=document.querySelector('.map')||document.querySelector('#map');
    if(map){map.setAttribute('role','application');map.setAttribute('aria-label','Chunk Surfer case select. Use arrow keys to move and Enter or Space to confirm.');}
    let node=document.getElementById('title-a11y-status');
    if(!node){node=document.createElement('div');node.id='title-a11y-status';node.setAttribute('role','status');node.setAttribute('aria-live','polite');Object.assign(node.style,{position:'fixed',width:'1px',height:'1px',overflow:'hidden',clip:'rect(0 0 0 0)',clipPath:'inset(50%)',whiteSpace:'nowrap'});document.body.appendChild(node);}
    a11yStatus=node;
  }
  function announceSelection(){if(!a11yStatus)return;const item=items[sel];a11yStatus.textContent=`${item?.label||'Menu item'}.${item?.disabled?' Unavailable.':''} ${titleRowHelp(item,{filed})}`;}

  const columns = () => menuColumns;
  const rowsPerColumn = () => Math.ceil(items.length / columns());

  function primeAudio() {
    if (audioPrimed) return;
    audioPrimed = true;
    onAudioGate();
    AUDIO.startMenuHiss();
  }

  function disarm() {
    confirmNewRun = false;
  }

  function select(index, { sound = true } = {}) {
    if (index < 0 || index >= items.length) return false;
    if (items[index]?.disabled) return false;
    if (sel === index) return true;
    previousSel = sel;
    previousSelUntil = nowMs() + 90;
    sel = index;
    disarm();
    if (sound) AUDIO.menuMove();
    onSelectionChange(items[sel]?.id||'',sel);
    announceSelection();
    return true;
  }

  function moveSelection(index) {
    const next = (index + items.length) % items.length;
    if (next !== sel) {
      previousSel = sel;
      previousSelUntil = nowMs() + 90;
      sel = next;
      onSelectionChange(items[sel]?.id||'',sel);
      announceSelection();
    }
    disarm();
    AUDIO.menuMove();
  }

  function activateCurrent() {
    const item = items[sel];
    if (!item) return true;

    if (item.disabled || item.locked) {
      AUDIO.menuMove();
      item.run?.();
      disarm();
      return true;
    }

    if (item.confirms && !confirmNewRun) {
      confirmNewRun = true;
      AUDIO.menuConfirm();
      return true;
    }

    AUDIO.menuConfirm();
    if (item.stay) {
      item.run?.();
      disarm();
      return true;
    }

    scenes.pop();
    item.run?.();
    return true;
  }

  function pointer(e) {
    primeAudio();
    if (e.type === 'pointermove') {
      hits.handle(e, { click: false });
      return true;
    }
    if (e.type === 'pointerdown') {
      hits.handle(e);
      return true;
    }
    return true;
  }

  return {
    id: 'title',
    blocksInput: true,
    blocksWorld: true,
    worldPresentation: 'visible',
    lensPreset: 'calm',

    enter() {
      document.body.classList.add('title-screen');
      primeAudio();
      const map = document.querySelector('.map') || document.querySelector('#map');
      try { map?.setAttribute('tabindex', '0'); map?.focus({ preventScroll: true }); } catch (_) {}
      ensureA11y();
      onSelectionChange(items[sel]?.id||'',sel);
      announceSelection();
    },

    exit() {
      document.body.classList.remove('title-screen');
      const map=document.querySelector('.map')||document.querySelector('#map');map?.removeAttribute('role');map?.removeAttribute('aria-label');a11yStatus?.remove?.();a11yStatus=null;
      AUDIO.stopMenuHiss();
    },

    // Overlay menus stop their own transport bed on exit. Re-acquire the title
    // bed when the title becomes the top scene again without replaying enter().
    resume() {
      primeAudio();
      AUDIO.startMenuHiss();
    },

    pointer,

    key(e) {
      primeAudio();
      const k = String(e.key || '').toLowerCase();
      const code = e.code || '';

      if (e.key === 'ArrowUp' || k === 'w' || code === 'KeyW') {
        moveSelection(sel - 1);
        return true;
      }

      if (e.key === 'ArrowDown' || k === 's' || code === 'KeyS') {
        moveSelection(sel + 1);
        return true;
      }

      if (e.key === 'ArrowLeft' || k === 'a' || code === 'KeyA') {
        if (columns() > 1) {
          moveSelection(sel - rowsPerColumn());
        }
        return true;
      }

      if (e.key === 'ArrowRight' || k === 'd' || code === 'KeyD') {
        if (columns() > 1) {
          moveSelection(sel + rowsPerColumn());
        }
        return true;
      }

      if (
        e.key === 'Enter' || code === 'Enter' ||
        e.key === ' ' || code === 'Space' ||
        k === 'z' || code === 'KeyZ'
      ) {
        return activateCurrent();
      }

      return true;
    },

    update(dt) {
      t += dt;
      // ── THE INSTRUMENT READS THE ROOM IT IS STANDING IN ────────────────────
      //
      // Both meters on this panel were lying, in opposite directions. The header
      // bargraph asked monitorSnapshot(), which measures SEMANTIC player noise
      // and is flat zero outside a story run, so it never moved. The location
      // strip below ran a 0.32Hz triangle off the scene clock, so it moved and
      // meant nothing.
      //
      // There is real audio here — the menu hiss and the boot weather's rain —
      // and there has been an AnalyserNode inline on the output bus the whole
      // time: outputMonitor, between outGain and the destination, read by
      // monitorProgramMeasurement(). It was being computed every frame for the
      // self-audio mask and shown to nobody.
      //
      // monitorSnapshot is deliberately NOT program audio (see the header of
      // audio/monitor.js — the exposure meter must never read the game's own
      // output), so this does not repoint it. It hands the panel a different
      // reading for a different question: not "how exposed are you", which is
      // meaningless in a menu, but "what is on the input".
      const program = monitorProgramMeasurement?.();
      programRms = program?.active ? (Number(program.rms) || 0) : 0;
      // Fast up, slow down — an envelope follower, so a thunder crack reads as a
      // hit that decays rather than a spike gone by the next frame. dt-scaled so
      // it is the same shape whatever the frame rate.
      const attack = 1 - Math.exp(-dt * 14);
      const release = 1 - Math.exp(-dt * 1.6);
      programEnvelope += (programRms - programEnvelope)
        * (programRms > programEnvelope ? attack : release);
      programPeak = Math.max(programRms, Number(program?.peak) || 0);
      programClipped = !!program?.clipped;

      // Weather is a launch bridge now, not a credits-only decoration. Keep
      // the same storm transport alive under CASE SELECT and hand it to the
      // world acoustics when play begins.
      const weather=bootWeather();
      if(!weather)return;
      // CASE SELECT owns no emitter. The exact particles that survived the
      // credits keep their normal trajectories while one shared presentation
      // envelope eases their visibility away.
      stepBootWeatherTitleTail(weather,dt,{stormActive:true});
      bootWeatherAudio()?.update?.({presence:.78,wind:weather.wind});
      for(const thunder of drainBootThunder(weather))bootWeatherAudio()?.strike?.(thunder);
    },

    render() {
      const presentationAlpha=Math.max(0,Math.min(1,Number(presentationState?.()?.menuAlpha??1)));
      return uiWithAlpha(presentationAlpha,()=>{
      hits.reset();

      const weather=bootWeather();
      if(weather)renderBootWeather(weather,{alpha:weather.presentationAlpha});

      const { cols, rows } = uiSize();
      const w = Math.min(78, cols - 4);
      const estimatedBodyW = Math.max(1, w - 6);
      const estimatedColumns = titleMenuColumnCount(estimatedBodyW, items.length);
      const estimatedRows = Math.ceil(items.length / estimatedColumns);
      const bodyRowsNeeded = 15 + Math.max(0, estimatedRows - 1) * 2;
      const h = Math.min(Math.max(28, bodyRowsNeeded + 7), rows - 4);
      const x = Math.floor((cols - w) / 2);
      const y = Math.floor((rows - h) / 2);
      const body = drawMachinePanel(x, y, w, h, {
        label: 'CASE SELECT',
        source: '4417-C',
        footerParts: [{ action: 'select', label: 'SELECT' }, { action: 'confirm', label: 'CONFIRM' }],
        meter: true,
        // Real level, through the same dB mapping, ballistics and peak hold the
        // recorder's meter uses (render/meter.js) — so the title shows the same
        // machine behaving the same way, which is what it was always claiming.
        meterSnapshot: monitorSnapshotForRms(programRms, {
          peak: programPeak,
          clipped: programClipped,
        }),
      });

      const display = 'CHUNK SURFER';
      const titleScale = cols < 82 ? 1.42 : 1.58;
      const titleX = Math.max(body.x, Math.floor((cols - display.length * titleScale) / 2));
      const warmStep = Math.min(16, Math.floor(t * 38));
      const pwm = Math.pow(warmStep / 16, 0.78);
      const scanPhase = (Math.floor(t * 120) % 9) === 0 ? 0.92 : 1;
      const blank = (t % 4.25) < 0.035 ? 0.68 : 1;
      if (t < 1.0) {
        drawVfdText(titleX + 0.32, body.y + 1, display, {
          scale: titleScale,
          alpha: Math.max(0.08, pwm * 0.18),
        });
      }
      drawVfdText(titleX, body.y + 1, display, {
        scale: titleScale,
        alpha: Math.max(0.82, Math.max(0.18, pwm) * scanPhase * blank),
      });
      // The strip. There used to be a row of ░▒▓ shade glyphs above it, chasing
      // left to right — at 0.20 alpha it read as noise sitting on top of the
      // instrument rather than as part of it. The indicator's own graduations
      // occupy that row now, so the title screen shows the same machine the
      // recorder does instead of a decorated cousin of it.
      //
      // AND IT IS NO LONGER SWEEPING ON A TIMER. drawLocationIndicator has no dB
      // mapping and no ballistics of its own — it lights everything left of a
      // mark — so it is handed the ENVELOPE rather than the raw level, and the
      // envelope is what keeps a noise floor from reading as jitter across two
      // segments. Weather moves it; silence lets it fall back.
      //
      // Quantised, because the widget is a row of graduations and a mark that
      // slides continuously between two of them reads as a rendering fault.
      const level = envelopeToStrip(programEnvelope);
      drawLocationIndicator(
        Math.max(body.x + 8, Math.floor((cols - 28) / 2)),
        body.y + 4,
        28,
        Math.floor(level * 16) / 16,
        { theme: 'amber', rows: 2 },
      );
      uiCenter(body.y + 7, 'FIVE ROOM TONES. ONE BUILDING LISTENING.', 'ui-primary');

      // ── TWO LINES, TWO JOBS ────────────────────────────────────────────────
      //
      // This used to be ONE row resolving five unrelated things by if/else
      // order: help for the hovered row, a HUSH warning, a save fact, an advert
      // for two menu rows that were already on screen, and an empty state. They
      // suppressed each other. Hovering the transfer room hid the warning;
      // meeting the HUSH hid the fact that you had a run in progress.
      //
      // So: the upper line is WHAT THIS PROFILE IS, the lower is WHAT THE ROW
      // UNDER THE CURSOR DOES, and every row has one now rather than the
      // transfer room being the only one that answered.
      //
      // The warm-up occupies the same two rows rather than its own, so the band
      // does not change shape at 0.85s. The machine says what it is, and then it
      // says where you are.
      if (t < 0.85) {
        uiCenter(body.y + 9, 'STANDBY / CASE FILE / SOURCE 4417-C', 'ui-label', 0.78);
        uiCenter(body.y + 10, 'AUDIOCORP LOCAL MONITOR READY', 'ui-secondary', 0.78);
      } else {
        const state = titleStateLine(meta, { activeRun, filed });
        uiCenter(body.y + 9, state.text, state.role);
        uiCenter(body.y + 10, titleRowHelp(items[sel], { filed }), 'ui-secondary');
      }

      const menuY = body.y + 12;
      const layout = titleMenuLayout(body, items.length);
      menuColumns = layout.colCount;
      const rowCount = rowsPerColumn();
      const renderNow = nowMs();

      items.forEach((item, i) => {
        const on = i === sel;
        const armed = item.confirms && confirmNewRun;
        const labelText = armed ? TITLE_CONFIRM_PROMPT : item.label.toUpperCase();
        const col = Math.floor(i / rowCount);
        const row = i % rowCount;
        const itemX = layout.colX[col] ?? layout.colX[0];
        const itemY = menuY + row * 2;
        const rowW = armed
          ? layout.confirmW
          : (layout.colW[col] ?? layout.colW[0]);
        const safeLabel = labelText.slice(0, Math.max(1, rowW - 2));
        const drawnLabel = `${on ? '▸ ' : '  '}${safeLabel}`;
        const hitW = Math.min(rowW, drawnLabel.length + 2);

        hits.add({
          id: `title:${item.id}`,
          kind: 'title-item',
          x: itemX,
          y: itemY - 0.35,
          w: hitW,
          h: 1.4,
          disabled: item.disabled,
          selected: on,
          danger: armed,
          label: item.label,
          data: { index: i, item },
          onHover: () => select(i),
          onClick: () => {
            if (!select(i, { sound: false }) && !item.disabled) return;
            activateCurrent();
          },
        });

        if (i === previousSel && i !== sel && renderNow < previousSelUntil) {
          uiText(itemX - 1, itemY, `▸ ${safeLabel}`.slice(0, rowW), 'ui-amber', 0.12);
        }

        // One indicator, driven by pointer and keyboard alike: inverse video
        // for the committed cursor, a duty-factor step for the pointer alone.
        const style = vfdRowStyle({
          hovered: hits.isHovered(`title:${item.id}`),
          selected: on,
          disabled: item.disabled,
          editing: armed,
          nowMs: renderNow,
        });
        drawVfdRow({ uiFill, uiText, theme: activeTheme, inverseColor: armed ? activeTheme().danger : null }, {
          x: itemX,
          y: itemY,
          w: hitW,
          label: safeLabel,
          style,
          role: item.disabled ? 'ui-secondary' : armed ? 'ui-danger' : on ? 'ui-amber' : 'ui-secondary',
        });
      });

      if (buildLabel) {
        const maxBuildW = Math.max(1, body.w - 2);
        const buildText = String(buildLabel).toUpperCase().slice(0, maxBuildW);
        const buildXRight = body.x + body.w - 1;
        const buildY = Math.max(body.y + 1, y + h - 5);
        drawRightText(buildXRight, buildY, buildText, 'ui-label', 0.62);
      }
      });
    },
  };
}
