// Quiet carrier is the production CASE SELECT header. The other compositions
// remain available to the review tool. All draw inside withMachinePanel,
// before its cover-glass pass, using the shared VFD glyphs and optics.
import {uiText, uiCellMetrics} from './ui.js';
import {atlasDpr} from './atlas.js';
import {drawVfdText, drawVfdMeter} from './presentation.js';

export const TITLE_HEADER_DIRECTIONS = Object.freeze(['wideband', 'split-register', 'quiet-carrier']);

// The menu already exposes archive/history availability. The header needs only
// the title and the current action; Continue carries the saved-night state.
export function titleHeaderAction(item = {}) {
  const copy = {
    'new-run': 'START A NEW NIGHT.',
    continue: item.disabled ? 'NO SAVED NIGHT.' : 'CONTINUE THE NIGHT.',
    archive: 'THE CASE FILE.',
    'return-index': 'ENDINGS.',
    'transfer-room': 'WALK THE FIELDS AGAIN.',
    settings: 'SETTINGS.',
    about: 'ABOUT CHUNK SURFER.',
    quit: 'QUIT.',
  };
  return copy[item.id] || '';
}

// Integer framebuffer origins and integer character advances, without changing
// the ROM's dots, aspect ratio, or the shared 8.45 × 20 character-grid metrics.
export function titleHeaderLayout(direction, {body, metrics, action}) {
  if (!TITLE_HEADER_DIRECTIONS.includes(direction)) throw new Error(`Unknown title header: ${direction}`);
  const {cellW, cellH, dpr = 1} = metrics;
  const ops = [], left = body.x + 4, right = body.x + body.w - 4, width = right - left;
  const snapX = value => Math.round(value * cellW * dpr) / (cellW * dpr);
  const snapY = value => Math.round(value * cellH * dpr) / (cellH * dpr);
  function text(value, y, {x = left, scale = 1, alpha = 1, role = 'ui-primary', align = 'left', atlas = false} = {}) {
    // Atlas text retains its existing cell pitch; larger type has a whole-pixel
    // pitch, keeping every character in the word at the same raster phase.
    const actualScale = atlas ? 1 : Math.round(cellW * dpr * scale) / (cellW * dpr);
    const w = value.length * actualScale;
    const at = align === 'center' ? left + (width - w) / 2 : align === 'right' ? right - w : x;
    ops.push({kind: atlas ? 'atlas' : 'text', text: value, x: snapX(at), y: snapY(body.y + y), w, h: Math.min(cellW * 1.42, cellH) / cellH * actualScale, scale: actualScale, alpha, role});
  }
  function meter(x, y, w) {
    ops.push({kind: 'meter', x: snapX(x), y: snapY(body.y + y), w, h: 2, rows: 2});
  }
  if (direction === 'wideband') {
    text('CHUNK SURFER', 1, {scale: 3.8});
    meter(left, 5.4, width);
    text(action, 10, {scale: 1.3});
  } else if (direction === 'split-register') {
    text('CHUNK', .8, {scale: 4.7, align: 'center'});
    text('SURFER', 4, {scale: 4.7, align: 'center'});
    ops.push({kind:'meter',x:snapX(left+(width-24)/2),y:snapY(body.y+8),w:24,h:1,rows:1});
    text(action, 10, {scale: 1.3, align: 'center'});
  } else {
    text('CHUNK SURFER', 3, {scale: 4, align: 'center'});
    text(action, 8, {scale: 1.3, align: 'center'});
  }
  return ops;
}

export function drawTitleHeaderDirection(direction, {body, item, signal, metrics = {...uiCellMetrics(), dpr: atlasDpr()}}) {
  const ops = titleHeaderLayout(direction, {body, metrics,
    action: titleHeaderAction(item)});
  for (const op of ops) {
    if (op.kind === 'atlas') uiText(op.x, op.y, op.text, op.role, op.alpha);
    else if (op.kind === 'text') drawVfdText(op.x, op.y, op.text, op);
    else drawVfdMeter(op.x, op.y, op.w, signal, {rows: op.rows, id: 'title-header-study-program'});
  }
  return ops;
}
