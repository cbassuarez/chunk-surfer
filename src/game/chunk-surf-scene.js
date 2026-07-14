import * as scenes from './scenes.js';
import { uiCenter, uiDraw, uiFill, uiLine, uiScrim, uiSize, uiText, uiWrap } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { loadStoryArtImage, resolveStoryArt } from './story-art.js';
import {
  CHUNK_SURF_ROOMS,
  createChunkSurfState,
  currentChunkSurfRoom,
  inspectChunkSurf,
  moveChunkSurf,
  recordChunkSurf,
  redactChunkSurf,
  tuneChunkSurf,
  turnChunkSurf,
  chunkSurfCompletion,
  chunkSurfProbe,
} from './chunk-surf-state.js';

const TONE = Object.freeze({
  primary: 'ui-primary',
  secondary: 'ui-secondary',
  danger: 'ui-danger',
  green: 'ui-green',
  blue: 'ui-blue',
});

const redactionKeys = ['1', '2', '3'];

function inputName(e) {
  return String(e.key || e.code || '').toLowerCase();
}

function drawVoid({ t, state, room, cols, rows }) {
  uiFill(0, 0, cols, rows, '#020304');
  const depth = Math.min(1, (state.visited.length - 1) / Math.max(1, CHUNK_SURF_ROOMS.length - 1));
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 70; i++) {
      const h = ((i * 2654435761) ^ Math.floor(t * 18) * 40503 ^ state.roomId.length * 911) >>> 0;
      const z = ((h & 255) / 255);
      const x = ((h >>> 8) % Math.max(1, cols)) * cellW * dpr;
      const y = ((h >>> 17) % Math.max(1, rows)) * cellH * dpr;
      const w = (1 + ((h >>> 27) % 9)) * cellW * dpr * (0.2 + depth);
      const a = 0.025 + z * 0.055 + depth * 0.03;
      ctx.globalAlpha = a;
      ctx.fillStyle = room.kind === 'final' ? '#ff6a64' : depth > 0.55 ? '#78e39a' : '#ffc247';
      ctx.fillRect(x, y, w, Math.max(1, dpr));
    }
    ctx.restore();
  });
}

function drawPerspectiveText({ body, state, room, t }) {
  const tuned = state.tuned.includes(room.id);
  const lines = tuned && room.tunedLines ? room.tunedLines : room.lines;
  const cx = body.x + Math.floor(body.w / 2);
  const top = body.y + 2;
  const wallW = Math.max(24, Math.min(body.w - 6, 54));
  const wallX = cx - Math.floor(wallW / 2);
  const shimmer = state.hasFork ? 0.08 + Math.sin(t * 11) * 0.035 : 0.035;

  uiLine(body.x + 1, body.y + body.h - 3, cx - 4, body.y + Math.floor(body.h * 0.52), UI_COLOR.frame, 0.42);
  uiLine(body.x + body.w - 1, body.y + body.h - 3, cx + 4, body.y + Math.floor(body.h * 0.52), UI_COLOR.frame, 0.42);
  uiLine(cx - 4, body.y + Math.floor(body.h * 0.52), cx + 4, body.y + Math.floor(body.h * 0.52), UI_COLOR.frame, 0.3);

  uiText(wallX, top, `ROOM ${room.id.toUpperCase()}`.slice(0, wallW), 'ui-label', 0.75);
  lines.slice(0, Math.max(1, body.h - 9)).forEach((line, i) => {
    const cls = tuned ? (line.includes('SURFER') || line.includes('BODY') ? 'ui-danger' : 'ui-primary') : 'ui-secondary';
    const drift = Math.round(Math.sin(t * 2.7 + i * 1.9) * shimmer * 4);
    uiText(wallX + Math.max(-2, Math.min(2, drift)), top + 2 + i * 2, String(line).slice(0, wallW), cls, tuned ? 0.96 : 0.64);
  });

  const exits = Object.entries(room.exits || {});
  const y = body.y + body.h - 4;
  const exitText = exits.length
    ? exits.map(([dir, id]) => `${dir.toUpperCase()}:${id}`).join('  ')
    : 'NO EXIT DECLARED';
  uiText(body.x + 2, y, exitText.slice(0, body.w - 4), exits.length ? 'ui-blue' : 'ui-danger', 0.82);
}

function drawLog(body, log) {
  const start = body.y + body.h - 11;
  uiLine(body.x, start - 1, body.x + body.w, start - 1, UI_COLOR.frame, 0.42);
  const lines = (log || []).slice(-5);
  lines.forEach((entry, i) => {
    uiWrap(entry.text, body.w - 2).slice(0, 1).forEach((line) => {
      uiText(body.x + 1, start + i * 2, line.slice(0, body.w - 2), TONE[entry.tone] || 'ui-primary', 0.92);
    });
  });
}

function drawScare({ cols, rows, t }) {
  uiScrim(0.88);
  const art = resolveStoryArt({ id: 'surfer', mode: 'boss' });
  const rec = loadStoryArtImage(art?.src);
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const w = cols * cellW * dpr;
    const h = rows * cellH * dpr;
    ctx.save();
    if (rec?.loaded && rec.image) {
      const scale = Math.max(w / rec.image.naturalWidth, h / rec.image.naturalHeight) * (1.08 + Math.sin(t * 28) * 0.025);
      const iw = rec.image.naturalWidth * scale;
      const ih = rec.image.naturalHeight * scale;
      const x = (w - iw) / 2 + Math.sin(t * 53) * 12 * dpr;
      const y = (h - ih) / 2 + Math.cos(t * 47) * 8 * dpr;
      ctx.globalAlpha = 0.82;
      ctx.drawImage(rec.image, x, y, iw, ih);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.30;
      ctx.drawImage(rec.image, x + 8 * dpr, y, iw, ih);
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#ff2219';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (let y = 0; y < rows; y += 2) {
      ctx.globalAlpha = 0.18 + ((y + Math.floor(t * 90)) % 7 === 0 ? 0.32 : 0);
      ctx.fillStyle = '#ff6a64';
      ctx.fillRect(0, y * cellH * dpr, w, Math.max(1, dpr));
    }
    ctx.restore();
  });
  uiCenter(Math.floor(rows * 0.78), 'IT FOUND THE BACK OF YOU.', 'ui-danger', 0.96);
}

export function makeChunkSurfScene({
  drankCoffee = false,
  hasRig = false,
  endingsSeen = [],
  seed = 4417,
  onComplete = () => {},
  onScare = () => {},
} = {}) {
  let state = createChunkSurfState({ drankCoffee, hasRig, endingsSeen, seed });
  let t = 0;
  let redactionIndex = 0;

  function finish() {
    const completion = chunkSurfCompletion(state);
    scenes.pop();
    onComplete(completion, state);
  }

  function apply(next) {
    state = next || state;
    if (state.scare) onScare(state.scare, state);
  }

  return {
    id: 'chunk-surf',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'rupture',
    enter() { loadStoryArtImage(resolveStoryArt('surfer')?.src); },
    update(dt) {
      t += dt;
      if (state.scare && t > 1.15) {
        state = { ...state, scare: null, roomId: 'approach', facing: 'north' };
      }
    },
    key(e) {
      const k = inputName(e);
      const room = currentChunkSurfRoom(state);
      if (state.scare) return true;
      if (room.kind === 'final') {
        if (k === 'arrowup' || k === 'w' || k === 'keyw') { redactionIndex = (redactionIndex - 1 + room.redactions.length) % room.redactions.length; return true; }
        if (k === 'arrowdown' || k === 's' || k === 'keys') { redactionIndex = (redactionIndex + 1) % room.redactions.length; return true; }
        const direct = redactionKeys.indexOf(k);
        if (direct >= 0 && room.redactions[direct]) redactionIndex = direct;
        if (k === 'enter' || k === ' ' || k === 'space' || direct >= 0) {
          apply(redactChunkSurf(state, room.redactions[redactionIndex]?.id));
          if (state.completed) finish();
          return true;
        }
      }
      if (k === 'arrowleft' || k === 'a' || k === 'keya') { state = turnChunkSurf(state, 'left'); return true; }
      if (k === 'arrowright' || k === 'd' || k === 'keyd') { state = turnChunkSurf(state, 'right'); return true; }
      if (k === 'arrowup' || k === 'w' || k === 'keyw') { apply(moveChunkSurf(state, 'forward')); return true; }
      if (k === 'arrowdown' || k === 's' || k === 'keys') { apply(moveChunkSurf(state, 'back')); return true; }
      if (k === 'e' || k === 'keye') { apply(inspectChunkSurf(state)); return true; }
      if (k === 'f' || k === 'keyf' || k === 't' || k === 'keyt') { apply(tuneChunkSurf(state)); return true; }
      if (k === 'r' || k === 'keyr') { apply(recordChunkSurf(state)); return true; }
      return true;
    },
    view() { return chunkSurfProbe(state); },
    render() {
      const { cols, rows } = uiSize();
      const room = currentChunkSurfRoom(state);
      drawVoid({ t, state, room, cols, rows });
      if (state.scare) {
        drawScare({ cols, rows, t });
        return;
      }
      const w = Math.min(98, cols - 4);
      const h = Math.min(42, rows - 4);
      const x = Math.floor((cols - w) / 2);
      const y = Math.floor((rows - h) / 2);
      const body = drawMachinePanel(x, y, w, h, {
        label: 'SOURCE FAULT',
        source: state.profile?.mandatory ? 'COFFEE' : 'OPTIONAL',
        footer: '[W/S] MOVE · [A/D] TURN · [F] TUNE · [R] RECORD · [E] INSPECT',
        theme: state.hasFork ? 'green' : 'amber',
        meter: true,
        scrim: false,
      });
      drawVfdText(body.x, body.y, room.title, { color: room.kind === 'final' ? UI_COLOR.danger : UI_COLOR.amber, max: body.w });
      uiText(body.x, body.y + 2, `FACING ${state.facing.toUpperCase()} · FORK ${state.hasFork ? 'LIVE' : 'ABSENT'}`, state.hasFork ? 'ui-green' : 'ui-secondary', 0.82);
      drawPerspectiveText({ body, state, room, t });
      if (room.kind === 'final') {
        const ry = body.y + body.h - 18;
        uiText(body.x + 2, ry, 'FINAL REDACTION', 'ui-danger');
        room.redactions.forEach((entry, i) => {
          uiText(body.x + 4, ry + 2 + i * 2, `${i === redactionIndex ? '▸' : ' '} ${i + 1} ${entry.label}`.slice(0, body.w - 8), i === redactionIndex ? 'ui-amber' : 'ui-secondary');
        });
        uiText(body.x + 2, ry + 9, '[ENTER] BLACK OUT SELECTED LINE', 'ui-label', 0.82);
      }
      drawLog(body, state.log);
    },
  };
}
