// One physical recorder in every transport state. The approved instrument owns
// the faceplate, display stack and three bottom housings; this adapter owns
// scene layout and authored content, never a second transport illustration.
import { uiFill, uiCellMetrics, uiCurrentScale } from './ui.js';
import { fitText } from './fit-text.js';
import { layoutTranscript, layoutTranscriptChoices } from './transcript.js';
import { obscuredGlyphAt, obscuredShape } from '../narrative/obscured-name.js';
import { visualEffectsEnabled } from '../game/access.js';
import { drawRecorderInstrument, recorderFaceLayout, drawRecorderDisplayText, drawRecorderCheckMeter } from './recorder-instrument.js';

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
export const TRANSPORT = Object.freeze({
  MONITOR: 'monitor', RECORD: 'record', PLAY: 'play', BROWSE: 'browse', CHECK: 'check', LISTEN: 'listen',
});
const LABEL = Object.freeze({ monitor: 'MONITOR', record: 'RECORD', play: 'TAPE RETURN',
  browse: 'TAKES', check: 'MIC CHECK', listen: 'LISTEN / PRE-ROLL' });
export function formatTakeTime(seconds = 0) {
  const whole = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

// Physical dimensions, not a row budget inherited from the previous deck.
// Uniform shrinkage keeps the display and keys in frame above speech/letterbox.
export const RECORDER_PANEL = Object.freeze({ width: 736, height: 405, lift: 1 });
export function recorderPanelRect({ cols, rows, progress = 0, clearBottom = 0 }) {
  const { cellW, cellH } = uiCellMetrics(), scale = uiCurrentScale();
  const bar = 2 + Math.round(clamp01(progress) * 3);
  const top = bar + .5, bottom = Math.max(bar, clearBottom) + RECORDER_PANEL.lift;
  const availableW = Math.max(1, (cols - 2) * cellW);
  const availableH = Math.max(1, (rows - top - bottom) * cellH);
  const unit = Math.min(scale, availableW / RECORDER_PANEL.width, availableH / RECORDER_PANEL.height);
  const w = RECORDER_PANEL.width * unit / cellW, h = RECORDER_PANEL.height * unit / cellH;
  return { x: (cols - w) / 2, y: Math.max(top, rows - bottom - h), w, h, bar, compact: false };
}

export function recorderButtons(rect, buttons) { return buttons ? { ...buttons, w: 0 } : null; }
export function recordingOverlayButtons({ held = false, assisted = false, rolling = false } = {}) {
  return { keys: [
    { id: 'rec', label: 'REC', lit: rolling, color: 'red', latched: true, controlId: 'recording:rec', held: held || assisted },
    { id: 'stop', label: 'STOP', color: 'white', controlId: 'recording:stop' },
    { id: 'takes', label: 'TAKES', color: 'white', controlId: 'recording:takes' },
  ] };
}
export function playbackOverlayButtons() {
  return { keys: recordingOverlayButtons().keys.map(key => ({ ...key, enabled: key.id !== 'rec', latched: false })) };
}
export function recorderControlRegions(rect, buttons = {}) {
  const layout = recorderFaceLayout(rect);
  if (!layout) return [];
  return (buttons?.keys || []).slice(0, 3).map((key, index) => ({
    kind: 'transport', id: key.id || key.controlId || String(index), index,
    controlId: key.controlId || `recorder:${key.id || index}`,
    ...layout.buttonSlots[index], enabled: key.enabled !== false,
  }));
}
// Compatibility helper: the complete aperture belongs to data, not a side bank.
export function recorderInstrumentLayout(body) {
  return { usableW: body.w, counterW: body.w * .43, bayX: body.x + body.w * .49,
    bayW: body.w * .51, channelsW: 0, channelsX: body.x + body.w };
}
export function recorderTranscriptRect(body) { return { ...body }; }
function guideLayout(body, guide) {
  const choices = layoutTranscriptChoices(guide, body.w), step = Math.min(1, body.h / 9);
  return { choices, step, choiceY: body.y + body.h - choices.height * step,
    maxRows: Math.max(0, Math.floor(body.h / step - (choices.height ? choices.height + 1 : 0))) };
}
function takeListLayout(body, view) {
  const capacity = Math.max(1, Math.floor(body.h - 2));
  const selected = Math.max(0, Number(view.selected) || 0);
  const start = Math.max(0, Math.min(selected - capacity + 1, (view.rows?.length || 0) - capacity));
  return { ...body, y: body.y + 1.5, h: body.h - 1.5, capacity, start };
}
export function recorderHitRegions(view = {}) {
  const layout = recorderFaceLayout(view.rect);
  if (!layout) return [];
  const regions = recorderControlRegions(view.rect, view.buttons);
  if (view.mode === TRANSPORT.BROWSE) {
    const list = takeListLayout(layout.body, view);
    (view.rows || []).slice(list.start, list.start + list.capacity).forEach((take, offset) => {
      const index = list.start + offset;
      regions.push({ kind: 'take', id: take.roomId || String(index), index,
        x: list.x, y: list.y + offset, w: list.w, h: 1 });
    });
  }
  if (view.mode === TRANSPORT.LISTEN) {
    const content = layout.transcriptRect, { choices, step, choiceY } = guideLayout(content, view.guide || {});
    choices.rows.forEach((choice, index) => {
      if (choice.kind === 'choice') regions.push({ kind: 'choice', index: choice.choiceIndex,
        x: content.x + choices.lane.x, y: choiceY + index * step,
        w: choices.lane.w, h: step });
    });
    regions.push({ kind: 'guide', ...content });
  }
  return regions;
}

const write = (x, y, value, width, color = '#8fcd87', alpha = 1) =>
  drawRecorderDisplayText(x, y, value, { width, color, alpha, size: 12 });
function drawTakeList(body, view) {
  write(body.x, body.y, 'SEALED TAKES · SELECT TO LISTEN', body.w, '#b4f4e6');
  if (!view.rows?.length) { write(body.x, body.y + 2, 'NO TAPES ON THIS MACHINE', body.w); return; }
  const list = takeListLayout(body, view);
  view.rows.slice(list.start, list.start + list.capacity).forEach((row, offset) => {
    const selected = list.start + offset === view.selected, y = list.y + offset;
    if (selected) uiFill(list.x - .25, y, list.w + .5, 1, 'rgba(180,244,230,.08)');
    const statusW = Math.max(4, Math.min(17, Math.floor(list.w * .28))), nameW = Math.max(1, list.w - statusW - 7);
    write(list.x, y, `${selected ? '›' : ' '} ${row.ordinal || String(list.start + offset + 1).padStart(2, '0')}`, 5,
      selected ? '#b4f4e6' : '#8fcd87');
    write(list.x + 5, y, fitText(row.label, nameW), nameW, selected ? '#b4f4e6' : '#8fcd87');
    write(list.x + list.w - statusW, y, fitText(row.status, statusW), statusW, row.warn ? '#e4bd78' : '#8fcd87');
  });
}
function drawGuide(body, view) {
  const guide = view.guide || {}, { choices, step, choiceY, maxRows } = guideLayout(body, guide);
  const prose = (x, y, value, width, color, alpha = 1) => drawRecorderDisplayText(x, y, value,
    { width, color, alpha, lineHeight: step, size: Math.min(12, step * 16) });
  const transcript = layoutTranscript(guide, { width: body.w, maxRows, keep: 4 });
  let y = body.y, used = 0;
  for (const block of transcript.blocks || []) {
    const x = body.x + block.lane.x, color = block.role.side === 'right' ? '#e4bd78' : '#b4f4e6';
    if (block.labelRows && used < maxRows) {
      prose(x, y, block.role.speaker, block.lane.w, color, block.active ? 1 : .65); y += step; used++;
    }
    for (const row of block.rows) {
      if (used >= maxRows) break;
      let value = row.text;
      // The authored mask still supplies visible shapes/accessibility captions.
      const shape = row.mask && visualEffectsEnabled() ? obscuredShape(row.mask) : null;
      if (shape) value = Array.from({ length: Math.min(shape.length, Math.ceil((row.reveal ?? 1) * (shape.length + 2))) },
        (_, i) => obscuredGlyphAt(shape, i, row.reveal ?? 1) || ' ').join('');
      prose(x + row.x, y, value + (row.typing ? ' ▏' : ''), block.lane.w - row.x,
        block.role.side === 'center' ? '#8fcd87' : color, block.active ? 1 : .65); used++;
      y += step;
    }
    if (used < maxRows) { y += step; used++; }
  }
  choices.rows.forEach((row, i) => {
    const selected = row.choiceIndex === guide.pending?.index;
    prose(body.x + choices.lane.x, choiceY + i * step, row.text, choices.lane.w, selected ? '#e4bd78' : '#8fcd87');
  });
}
function drawCheck(body, view) {
  const check = view.check || {};
  write(body.x, body.y, check.prompt || 'SAY: “CHECK, ONE TWO”', body.w, '#e4bd78');
  const meterW = Math.min(38, body.w * .7);
  drawRecorderCheckMeter(body.x, body.y + 1.5, meterW, view.roomMeter, { thresholdDb: -12 });
  [-48, -36, -24, -12, 0].forEach((db, i) => write(body.x + i * (meterW - 2) / 4, body.y + 2.5, String(db), 4));
  write(body.x + meterW + 1, body.y + 1.5, check.heard ? 'LEVEL OK' : check.note || '', body.w - meterW - 1, '#b4f4e6');
  write(body.x, body.y + Math.min(4, body.h - 2), fitText(check.line || '', body.w), body.w);
  write(body.x, body.y + body.h - 1, 'NOTHING IS RECORDING. NOTHING IS KEPT.', body.w, '#b4f4e6');
}
export function drawRecorderFace(view = {}) {
  if (!view.rect) return null;
  const mode = view.mode || TRANSPORT.RECORD;
  const special = mode === TRANSPORT.BROWSE ? drawTakeList : mode === TRANSPORT.LISTEN ? drawGuide : mode === TRANSPORT.CHECK ? drawCheck : null;
  return drawRecorderInstrument({ ...view, label: view.label || LABEL[mode] },
    special ? { drawContent: layout => special(layout.body, view) } : {});
}
