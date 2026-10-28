import * as scenes from './scenes.js';
import { uiFill, uiSize, uiText, uiWrap } from '../render/ui.js';
import {
  withMachinePanel, drawVfdText,
} from '../render/presentation.js';
import { drawVfdGlyph } from '../render/vfd-font.js';
import { fitText } from '../render/fit-text.js';

const filedCount = () => Object.keys(getMeta()?.knowledge?.documents || {}).length;
import { UI_COLOR } from '../render/palette.js';
import { tapeQualifies } from '../causal/tape.js';
import { achievementDefinition } from '../progression/achievements.js';
import { consumeReturnReport } from '../progression/runtime.js';
import { formatDuration, returnDefinition, returnUnlockDefinition } from '../progression/report.js';
import * as AUDIO from '../audio/story-audio.js';
import { promptLine } from './bindings.js';
import { createHitRegions } from '../render/hit-regions.js';
import { drawReturnExposure, returnExposureIdentity } from '../render/outcome-return-view.js';
import { getMeta } from './save.js';
import { roomLabel } from '../audio/manifest-map.js';
import {
  FEATURE_COPY,
  NEXT_ENDING_HINTS,
  POST_RUN_ACTIONS,
  POST_RUN_STAGE_COPY,
  dispatchPostRunAction,
  endingHintForEnding,
  transferRoomCopy,
} from './post-run-copy.js';

const chunk = (values, size) => {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
};

// THE RETURN, AS W. ELLERY RECEIVES IT.
//
// This was eleven label/value pairs. buildRunSummary hands over far more than
// that and the form threw nearly all of it away: the entire signal-combat record
// (battles started/won/lost), WHICH rooms were taken rather than how many, the
// documents read, what came back from the equipment issue and what did not.
// A works order that came back with kit missing says so on the form; that is
// what the form is for.
//
// Grouped into sections, because a form has sections. Each entry is
// [label, value] and a bare string is a section heading.
function reportSections(summary) {
  const ret = returnDefinition(summary.endingId, summary);
  const contaminated = summary.takes?.contaminated || [];
  const rooms = summary.takes?.rooms || [];
  const battles = summary.battles || {};
  const equipment = summary.equipment || {};
  const missing = equipment.missing || [];

  const engagements = Number(battles.started) || 0;
  const sections = [
    ['THE JOB', [
      ['DISPOSITION', ret?.title || String(summary.endingId || '').toUpperCase()],
      ...(ret?.variantTitle ? [['ACCOUNT', ret.variantTitle], ['STAY OF DESTRUCTION', '100 YEARS'], ['LIVING GUARANTOR', 'THE RECORDIST']] : []),
      ['CLASSIFICATION', ret?.classification || 'UNCLASSIFIED'],
      ['TERMS', String(summary.rules?.startedPreset || 'contract').replaceAll('-', ' ').toUpperCase()],
      ['TIME ON SITE', formatDuration(summary.durationSeconds)],
      ...(summary.interference?.caseId ? [['CASE', `${summary.interference.caseId} / ${summary.interference.classification || 'UNRESOLVED'}`]] : []),
    ]],
    ['TAKES', [
      ['ACCEPTED', `${summary.takes.completed} OF 5`],
      ['SPOILED', String(summary.takes.spoiled)],
      ['STOPPED EARLY', String(summary.takes.aborted||0)],
      ['WORK ORDER', summary.takes.assessment||'INCOMPLETE'],
      ...(summary.takes.unfinishedRooms?.length?[['RETAKES DUE',summary.takes.unfinishedRooms.map(roomLabel).join(', ')]]:[]),
      ['CONTAMINATED', String(contaminated.length)],
      // WHICH rooms, not how many. The count was all the form ever printed and
      // the room list has been in the summary the whole time.
      ...(rooms.length ? [['ROOMS FILED', rooms.map((id) => roomLabel(id).toUpperCase()).join(', ')]] : []),
      ...(contaminated.length ? [['AFFECTED', contaminated.map((id) => roomLabel(id).toUpperCase()).join(', ')]] : []),
    ]],
  ];

  // The night's fighting was completely invisible on this form. It is only
  // printed when there was any — a quiet return should not carry an empty
  // section about violence.
  if (engagements > 0) {
    sections.push(['ENGAGEMENTS', [
      ['ENCOUNTERED', String(engagements)],
      ['RESOLVED', String(Number(battles.won) || 0)],
      ['LOST', String(Number(battles.lost) || 0)],
      ...(Number(battles.firstPassWon) ? [['CLEAN AT FIRST PASS', String(battles.firstPassWon)]] : []),
    ]]);
  }

  sections.push(['THE RECORDIST', [
    ['INJURIES CARRIED', String(summary.injuries)],
    ['DISCLOSURES FOUND', String(summary.disclosures.found)],
    ...(Number(summary.documents?.read) ? [['DOCUMENTS READ', String(summary.documents.read)]] : []),
  ]]);

  sections.push(['EQUIPMENT', [
    ['RETURNED', `${equipment.returned} OF ${equipment.issued}`],
    // A works order does not shrug about missing kit. Name it.
    ...(missing.length ? [['NOT RETURNED', missing.map((id) => String(id).toUpperCase()).join(', ')]] : []),
    ...(Number(equipment.recovered) ? [['RECOVERED ON SITE', String(equipment.recovered)]] : []),
  ]]);

  return sections;
}

// ONE SECTION OF THE ACCOUNT, RASTERISED FOR A PANE.
//
// The window panes cannot draw text — window-media-surface.js is a WebGL shader
// with an image sampler and a handful of procedural forms, and no glyph path at
// all. A `text` pane therefore renders in the in-canvas simulation and comes up
// BLACK on the desktop, which is the wrong way round for a feature whose whole
// point is the desktop.
//
// So each section is drawn here, offscreen, in the same 5x7 ROM the rest of the
// interface uses, and handed over as an image. The composition's own
// nvme-sector fault then chews on it exactly as it chews on the footage — the
// account degrades along with everything else in the shot, which is a better
// result than clean text would have been.
function renderSectionImage(heading, entries, { width = 320, height = 210 } = {}) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Flat black glass, like every other panel in the game.
  ctx.fillStyle = '#05070A';
  ctx.fillRect(0, 0, width, height);

  const cellW = 11, cellH = 15, pad = 12;
  const put = (text, col, row, color, alpha = 1) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    [...String(text)].forEach((ch, i) => {
      drawVfdGlyph(ctx, ch, pad + (col + i) * cellW, pad + row * cellH, cellW, cellH,
        { color, dim: null, blur: 3.2, dpr: 1, alpha: 1 });
    });
    ctx.restore();
  };
  const cols = Math.floor((width - pad * 2) / cellW);

  put(String(heading).toUpperCase().slice(0, cols), 0, 0, UI_COLOR.amber);
  ctx.save();
  ctx.globalAlpha = 0.34; ctx.fillStyle = UI_COLOR.amber;
  ctx.fillRect(pad, pad + cellH + 2, width - pad * 2, 1);
  ctx.restore();

  entries.slice(0, Math.floor((height - pad * 2) / cellH) - 2).forEach(([label, value], index) => {
    const row = index + 2;
    const name = String(label).toUpperCase();
    const shown = fitText(String(value), Math.max(3, cols - name.length - 1));
    put(name.slice(0, cols), 0, row, UI_COLOR.secondary || '#9A7B3F', 0.8);
    put(shown, Math.max(0, cols - shown.length), row, UI_COLOR.primary || '#F2A81E');
  });

  try { return canvas.toDataURL('image/webp', 0.82); } catch (_) { return null; }
}

// The whole account, one image per section, for the surfaces.
export function returnSectionImages(summary) {
  return reportSections(summary)
    .map(([heading, entries]) => ({ label: heading, image: renderSectionImage(heading, entries) }))
    .filter((page) => !!page.image);
}

export function returnAccountLines(summary, { width = 64, causalStatus = {} } = {}) {
  const result = [];
  const add = (text, cls = 'ui-primary') => {
    for (const line of uiWrap(String(text), Math.max(8, width))) result.push({ text: line, cls });
  };
  for (const [heading, entries] of reportSections(summary)) {
    add(heading, 'ui-amber');
    for (const [label, value] of entries) add(`${label}  ${value}`);
    result.push({ text: '', cls: 'ui-primary' });
  }
  const achievementIds = [...(summary.unlockedAchievements || [])];
  if (causalStatus?.status === 'ready' && !achievementIds.includes('ACH_SECOND_TRACK')) achievementIds.push('ACH_SECOND_TRACK');
  if (achievementIds.length) {
    add(POST_RUN_STAGE_COPY.achievements.title, 'ui-amber');
    for (const id of achievementIds) {
      const def = achievementDefinition(id);
      if (!def) continue;
      add(def.name.toUpperCase(), 'ui-amber'); add(def.description);
    }
    result.push({ text: '', cls: 'ui-primary' });
  }
  if (summary.newlyUnlockedFeatures?.length) {
    add(POST_RUN_STAGE_COPY.unlocks.title, 'ui-amber');
    for (const id of summary.newlyUnlockedFeatures) {
      const feature = returnUnlockDefinition(id) || FEATURE_COPY[id];
      add(feature?.label || (id.startsWith('cosmetic:') ? `DISPLAY / ${id.slice(9).replaceAll('-', ' ').toUpperCase()}` : id.toUpperCase()), 'ui-amber');
      const description = feature?.description;
      if (description) for (const line of uiWrap(description, Math.max(8, width))) result.push({ text: line, cls: 'ui-primary' });
    }
    result.push({ text: '', cls: 'ui-primary' });
  }
  add('ENDING HINTS · OPTIONAL', 'ui-amber');
  const unseen = Math.max(0, Object.keys(NEXT_ENDING_HINTS).length - Math.max(1, Number(summary.endingsAtCompletion) || 1));
  add(unseen ? endingHintForEnding(summary.endingId) || 'Try changing a major choice near the end of the story.' : 'All endings found. You can replay with different difficulty or play THE HUSH from a qualifying completed run.');
  add(`${unseen} ENDING${unseen === 1 ? '' : 'S'} STILL UNSEEN`, 'ui-secondary');
  return result;
}

export function makeReturnReportScene({
  summary,
  snapshot = null,
  getSnapshot = () => snapshot,
  getSaveStatus = () => 'unknown',
  onReopen = () => {},
  onTransferRoom = () => {},
  onArchive = () => {},
  onTitle = () => {},
  getCausalStatus = () => summary.causalTape || { status: tapeQualifies(summary.injuries) ? 'filing' : 'not-qualified' },
  sectionsOnPanes = () => false,
  onAccountOpen = () => {},
  onAccountRead = () => {},
} = {}) {
  const actions = [
    { id: 'title', label: 'QUIT TO TITLE' },
    { id: 'account', label: 'VIEW RUN' },
    { id: 'replay', label: 'NEW GAME' },
  ];
  const hits = createHitRegions(), held = new Set();
  let stage = getCausalStatus()?.status === 'filing' ? 'filing' : 'residue';
  let action = 0, page = 0, entered = 0, consumed = false, exited = false, restartChoice = 0;
  let accountOpen = false, loadedSource = null, loadedImage = null, imageGeneration = 0;
  let detailPageCount = 1;
  const FADE_IN = 2.2;

  function availableActions() {
    const transfer = transferRoomCopy({ filed: filedCount() });
    return [
      ...actions,
      ...(stage === 'details' ? [
        { id: 'transfer-room', label: 'THE TRANSFER ROOM', disabled: !transfer.enabled },
        { id: 'archive', label: 'ACHIEVEMENTS & RUN HISTORY' },
      ] : []),
    ];
  }

  function image() {
    const source = getSnapshot?.();
    if (source && typeof source !== 'string') return source;
    if (source === loadedSource) return loadedImage;
    loadedSource = source;
    loadedImage = null;
    const generation = ++imageGeneration;
    if (!source || typeof Image === 'undefined') return null;
    const pending = new Image();
    pending.onload = () => {
      if (!exited && generation === imageGeneration) loadedImage = pending;
    };
    // A failed/missing retained image is an honest black field. Never substitute
    // a different ending or a generic HUSH portrait on a completed run.
    pending.onerror = () => {};
    pending.src = source;
    return null;
  }

  function closeAccount() {
    if (accountOpen) {
      accountOpen = false;
      onAccountRead();
    }
  }

  function finish(actionId) {
    if (consumed || exited) return;
    if (!POST_RUN_ACTIONS.some((entry) => entry.id === actionId)) return;
    if (actionId === 'transfer-room' && !transferRoomCopy({ filed: filedCount() }).enabled) return;
    consumed = true;
    closeAccount();
    consumeReturnReport(summary.id);
    scenes.remove(scene);
    dispatchPostRunAction(actionId, { onReopen, onTransferRoom, onArchive, onTitle });
  }

  function choose(id) {
    if (exited || consumed || stage === 'filing') return;
    if (id === 'account') {
      if (stage === 'details') {
        closeAccount(); stage = 'residue'; action = 1;
      } else {
        stage = 'details'; page = 0; action = 0;
        accountOpen = true;
        onAccountOpen();
      }
      AUDIO.menuConfirm();
      return;
    }
    if (id === 'replay') {
      stage = 'restart-confirm'; restartChoice = 0;
      AUDIO.menuConfirm();
      return;
    }
    AUDIO.menuConfirm();
    finish(id);
  }


  function drawDetails() {
    const { cols, rows } = uiSize();
    uiFill(0, 0, cols, rows, 'rgba(2,4,3,.97)');
    const w = Math.min(88, cols - 2), h = Math.max(8, rows - 2);
    const x = (cols - w) / 2, y = (rows - h) / 2;
    // The optional account remains a physical display. No portion of the run's
    // facts relies on desktop panes; all wrapped lines are paged here.
    withMachinePanel(x, y, w, h, {
      label: 'COMPLETED RUN', source: '4417-C', wordmark: '', model: '', meter: false,
      footer: promptLine([{ action: 'select', label: 'PAGES' }, { action: 'back', label: 'BACK' }]),
    }, (body) => {
      const lines = returnAccountLines(summary, { width: Math.floor(body.w), causalStatus: getCausalStatus() });
      const footerRows = body.w < 44 ? 3 : 1;
      const capacity = Math.max(1, Math.floor(body.h - footerRows - 4));
      const pages = chunk(lines, capacity);
      detailPageCount = Math.max(1, pages.length);
      page = Math.max(0, Math.min(page, detailPageCount - 1));
      drawVfdText(body.x, body.y, `VIEW RUN ${page + 1}/${detailPageCount}`, { scale: 1, max: body.w, color: UI_COLOR.primary });
      for (const [index, row] of (pages[page] || []).entries()) uiText(body.x, body.y + 2 + index, row.text, row.cls, 1, body.w);
      const links = [
        { id: 'account', label: 'BACK' },
        { id: 'transfer-room', label: 'TRANSFER ROOM', disabled: !transferRoomCopy({ filed: filedCount() }).enabled },
        { id: 'archive', label: 'RUN HISTORY' },
      ];
      let foot = body.y + body.h - footerRows - 1, cx = body.x;
      for (const link of links) {
        const label = `[${link.label}]`;
        if (cx + label.length > body.x + body.w) { cx = body.x; foot++; }
        uiText(cx, foot, label, link.disabled ? 'ui-secondary' : 'ui-amber', link.disabled ? .4 : .9);
        hits.add({ id: link.id, x: cx, y: foot - .15, w: label.length, h: 1.1, disabled: link.disabled, label: link.label });
        cx += label.length + 2;
      }
    });
  }

  function drawFiling() {
    const { cols, rows } = uiSize();
    const w = Math.min(66, cols - 2), h = Math.min(16, rows - 2);
    const x = (cols - w) / 2, y = (rows - h) / 2;
    withMachinePanel(x, y, w, h, { label: 'PREPARING HUSH PLAYBACK', source: '', wordmark: '', model: '', meter: false }, (body) => {
      const lines = uiWrap('Preparing your completed run for THE HUSH.', body.w);
      lines.forEach((line, index) => uiText(body.x, body.y + index, line, 'ui-primary'));
      uiWrap('This does not start another game.', body.w).forEach((line, index) => uiText(body.x, body.y + lines.length + 2 + index, line, 'ui-secondary'));
    });
  }

  function drawRestartConfirmation() {
    const { cols, rows } = uiSize();
    uiFill(0, 0, cols, rows, 'rgba(2,4,3,.95)');
    const x = cols < 42 ? 2 : Math.floor(cols * .12), width = Math.max(12, cols - x * 2);
    let y = rows < 16 ? 0 : Math.max(1, Math.floor(rows * .32));
    for (const line of uiWrap('START A NEW GAME?', width)) uiText(x, y++, line, 'ui-primary');
    y++;
    if (rows >= 16) for (const line of uiWrap('Start again from the beginning.', width)) uiText(x, y++, line, 'ui-secondary');
    y++;
    for (const [index, entry] of [{ id: 'cancel-restart', label: 'CANCEL' }, { id: 'confirm-restart', label: 'START NEW GAME' }].entries()) {
      uiText(x, y, `${index === restartChoice ? '▸' : ' '} ${entry.label}`, index === restartChoice ? 'ui-amber' : 'ui-secondary');
      hits.add({ id: entry.id, x, y: y - .15, w: width, h: 1.1 });
      y += 1.5;
    }
  }

  const scene = {
    id: 'return-report', blocksInput: true, blocksWorld: true, suppressesHud: true, worldPresentation: 'hidden', handlesEscape: true, lensPreset: 'calm',
    enter() { exited = false; },
    exit() { exited = true; imageGeneration++; loadedImage = null; closeAccount(); held.clear(); },
    resume() { held.clear(); if (stage === 'restart-confirm') restartChoice = 0; },
    update(dt = 0) {
      if (exited || consumed) return;
      entered += Math.max(0, Number(dt) || 0);
      if (stage === 'filing' && getCausalStatus()?.status !== 'filing') stage = 'residue';
    },
    key(e = {}) {
      if (exited || consumed) return true;
      const key = String(e.key || e.code || '').toLowerCase();
      if (e.repeat || held.has(key)) return true;
      held.add(key);
      // A fade-reveal press cannot also select NEW GAME or leave the ending.
      if (entered < FADE_IN) { entered = FADE_IN; return true; }
      if (stage === 'filing') return true;
      const back = key === 'escape' || key === 'backspace';
      if (stage === 'restart-confirm') {
        if (back) { stage = 'residue'; restartChoice = 0; AUDIO.menuBack(); }
        else if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) { restartChoice = 1 - restartChoice; AUDIO.menuMove(); }
        else if (key === 'enter' || key === ' ' || key === 'z') {
          if (restartChoice === 1) finish('replay');
          else { stage = 'residue'; restartChoice = 0; AUDIO.menuBack(); }
        }
        return true;
      }
      if (stage === 'details') {
        if (back) choose('account');
        else if (key === 'arrowright' || key === 'd' || key === 'enter' || key === ' ' || key === 'z') { page = Math.min(detailPageCount - 1, page + 1); AUDIO.menuPage(); }
        else if (key === 'arrowleft' || key === 'a') { page = Math.max(0, page - 1); AUDIO.menuPage(); }
        else if (key === 'h') choose('archive');
        else if (key === 't') choose('transfer-room');
        return true;
      }
      if (back) { action = 0; AUDIO.menuBack(); return true; }
      const list = availableActions();
      if (['arrowup', 'w', 'arrowleft', 'a'].includes(key)) { action = (action + list.length - 1) % list.length; AUDIO.menuMove(); }
      else if (['arrowdown', 's', 'arrowright', 'd'].includes(key)) { action = (action + 1) % list.length; AUDIO.menuMove(); }
      else if (key === 'enter' || key === ' ' || key === 'z') choose(list[action]?.id || 'title');
      return true;
    },
    keyup(e = {}) { held.delete(String(e.key || e.code || '').toLowerCase()); return true; },
    pointer(e = {}) {
      if (exited || consumed || e.button > 0) return true;
      if (e.type !== 'pointerdown') return true;
      if (entered < FADE_IN) { entered = FADE_IN; return true; }
      if (stage === 'filing') return true;
      const hit = hits.hit(e.cellX, e.cellY);
      if (!hit || hit.disabled) return true;
      if (stage === 'restart-confirm') {
        if (hit.id === 'cancel-restart') { stage = 'residue'; restartChoice = 0; AUDIO.menuBack(); }
        else if (hit.id === 'confirm-restart') finish('replay');
        return true;
      }
      const list = availableActions(), index = list.findIndex((entry) => entry.id === hit.id);
      if (index >= 0) action = index;
      choose(hit.id);
      return true;
    },
    view() {
      return { id: 'return-report', system: 'last-exposure', stage, elapsed: entered, action: availableActions()[action]?.id, restartChoice: restartChoice ? 'start' : 'cancel', page, pages: detailPageCount, consumed, title: returnExposureIdentity(summary, getSaveStatus()).title, endingTitle: returnExposureIdentity(summary,getSaveStatus()).endingTitle, saveStatus: getSaveStatus(), imageReady: !!image() };
    },
    render() {
      if (exited) return;
      hits.reset();
      drawReturnExposure({ summary, snapshot: image(), elapsed: entered, saveStatus: getSaveStatus(), actions: stage === 'residue' ? availableActions() : [], selected: action, hitRegions: hits });
      if (stage === 'details') drawDetails();
      else if (stage === 'filing' && entered >= FADE_IN) drawFiling();
      else if (stage === 'restart-confirm') drawRestartConfirmation();
    },
  };
  return scene;
}
