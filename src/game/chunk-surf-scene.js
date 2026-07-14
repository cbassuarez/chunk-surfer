import * as scenes from './scenes.js';
import { uiDraw, uiSize } from '../render/ui.js';
import {
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
import { activeInputPromptDevice, promptLine } from './bindings.js';
import { chunkSurfVisualModel } from './chunk-surf-visual.js';

const redactionKeys = ['1', '2', '3'];
const TONE = Object.freeze({
  cold: '#8b8f95',
  visited: '#c8c2ad',
  tuned: '#1dff70',
  recorded: '#22baff',
  redaction: '#ff6358',
  schematic: '#f6f0df',
});

function inputName(e) {
  return String(e.key || e.code || '').toLowerCase();
}

function paintText(ctx, text, x, y, {
  color = '#d8dedc',
  alpha = 1,
  size = 15,
  weight = 700,
  align = 'left',
  maxWidth = undefined,
  blur = 0,
  rotate = 0,
} = {}) {
  const s = String(text || '');
  if (!s) return;
  ctx.save();
  ctx.translate(x, y);
  if (rotate) ctx.rotate(rotate);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.font = `${weight} ${Math.max(7, size)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, 0, 0, maxWidth);
  ctx.restore();
}

function paintChromaticText(ctx, text, x, y, options = {}) {
  const spread = options.spread || 3;
  paintText(ctx, text, x - spread, y, { ...options, color: '#ff234a', alpha: (options.alpha ?? 1) * 0.38, blur: 0 });
  paintText(ctx, text, x + spread, y + spread * 0.25, { ...options, color: '#00f6ff', alpha: (options.alpha ?? 1) * 0.42, blur: 0 });
  paintText(ctx, text, x, y, options);
}

function paintVoid(ctx, model, w, h, time) {
  ctx.save();
  ctx.fillStyle = '#000102';
  ctx.fillRect(0, 0, w, h);
  const gradient = ctx.createRadialGradient(w * 0.5, h * 0.76, h * 0.05, w * 0.5, h * 0.45, h * 0.9);
  gradient.addColorStop(0, 'rgba(22,38,42,.52)');
  gradient.addColorStop(0.42, 'rgba(2,5,7,.76)');
  gradient.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 54; i++) {
    const phase = (i * 0.618 + time * 0.025) % 1;
    const y = h * phase;
    ctx.globalAlpha = 0.025 + (i % 7 === 0 ? 0.065 : 0);
    ctx.fillStyle = model.glitch.bsod > 0.18 && i % 11 === 0 ? '#1027d8' : '#d7f3ef';
    ctx.fillRect(0, y, w, Math.max(1, h * 0.0016));
  }

  if (model.glitch.bsod > 0.08) {
    ctx.globalAlpha = model.glitch.bsod;
    ctx.fillStyle = '#061fbd';
    ctx.fillRect(w * 0.66, 0, w * 0.34, h);
    paintText(ctx, 'A FATAL EXCEPTION HAS OCCURRED IN SOURCE SPACE', w * 0.70, h * 0.43, {
      color: '#dbe5ff', alpha: 0.72, size: Math.max(12, h * 0.018), weight: 800, maxWidth: w * 0.27,
    });
  }
  ctx.restore();
}

function paintSchematics(ctx, model) {
  for (const plane of model.schematics) {
    ctx.save();
    ctx.globalAlpha = plane.alpha;
    ctx.translate(plane.x, plane.y);
    ctx.rotate(plane.kind === 'bsod-plane' ? -0.08 : 0.11);
    const size = 190 * plane.scale;
    ctx.strokeStyle = plane.kind === 'bsod-plane' ? '#f4f6ff' : '#fbf7df';
    ctx.lineWidth = Math.max(1, 2 * plane.scale);
    ctx.strokeRect(-size * 0.5, -size * 0.32, size, size * 0.64);
    for (let i = 0; i < 7; i++) {
      const yy = -size * 0.24 + i * size * 0.08;
      ctx.beginPath();
      ctx.moveTo(-size * 0.45, yy);
      ctx.lineTo(-size * 0.12, yy);
      ctx.lineTo(-size * 0.06, yy - size * 0.045);
      ctx.lineTo(size * 0.38, yy - size * 0.045);
      ctx.stroke();
      ctx.strokeRect(-size * 0.05 + i * size * 0.06, yy - size * 0.09, size * 0.07, size * 0.07);
    }
    paintText(ctx, plane.label, -size * 0.45, size * 0.38, { color: '#fbf7df', alpha: 0.8, size: 12 * plane.scale, maxWidth: size });
    ctx.restore();
  }
}

function paintCodeArchitecture(ctx, model, time) {
  for (const row of model.floor) {
    const color = TONE[row.tone] || TONE.cold;
    const size = 22 * row.scale;
    const x = row.x - row.width * 0.5;
    const wave = Math.sin(time * 3.2 + row.z) * model.glitch.chromatic * 8;
    paintChromaticText(ctx, row.text, x + wave, row.y, {
      color,
      alpha: row.alpha,
      size,
      maxWidth: row.width,
      spread: model.glitch.chromatic * 5,
      rotate: -0.02 + row.z * 0.002,
    });
  }

  for (const wall of [...model.leftWall, ...model.rightWall]) {
    const color = TONE[wall.tone] || TONE.cold;
    paintChromaticText(ctx, wall.text, wall.x, wall.y, {
      color,
      alpha: wall.alpha,
      size: 17 * wall.scale,
      maxWidth: model.viewport.width * 0.34,
      rotate: wall.side === 'left' ? -0.28 : 0.28,
      spread: model.glitch.chromatic * 3,
    });
  }

  for (const tower of model.towers) {
    const color = TONE[tower.tone] || TONE.visited;
    const lineStep = 15 * tower.scale;
    const x = tower.x;
    const y = tower.y;
    paintText(ctx, tower.token, x, y - lineStep * (tower.height + 0.6), {
      color,
      alpha: 0.86,
      size: Math.max(12, 24 * tower.scale),
      align: 'center',
      blur: tower.tone === 'tuned' ? 8 : 2,
      maxWidth: 260 * tower.scale,
    });
    tower.lines.slice(0, tower.height).forEach((line, index) => {
      paintChromaticText(ctx, line, x, y - index * lineStep, {
        color,
        alpha: Math.max(0.16, 0.72 - index * 0.06),
        size: Math.max(8, 13 * tower.scale),
        align: 'center',
        maxWidth: 230 * tower.scale,
        spread: tower.tone === 'tuned' ? 4 : 1.8,
      });
    });
  }
}

function paintPortals(ctx, model, time) {
  for (const portal of model.portals) {
    const isForward = portal.kind === 'forward';
    const width = (isForward ? 290 : 210) * portal.scale;
    const height = (isForward ? 145 : 110) * portal.scale;
    const pulse = 0.6 + Math.sin(time * 5 + portal.x * 0.01) * 0.15;
    ctx.save();
    ctx.globalAlpha = portal.alpha;
    ctx.translate(portal.x, portal.y);
    ctx.strokeStyle = portal.visited ? '#1dff70' : isForward ? '#f6f0df' : '#22baff';
    ctx.fillStyle = isForward ? 'rgba(246,240,223,.045)' : 'rgba(34,186,255,.035)';
    ctx.lineWidth = Math.max(1, 3 * portal.scale);
    ctx.beginPath();
    ctx.moveTo(-width * 0.5, height * 0.5);
    ctx.lineTo(-width * 0.32, -height * 0.5);
    ctx.lineTo(width * 0.32, -height * 0.5);
    ctx.lineTo(width * 0.5, height * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = Math.max(0.18, pulse);
    ctx.beginPath();
    ctx.moveTo(0, height * 0.48);
    ctx.lineTo(0, -height * 0.48);
    ctx.stroke();
    ctx.restore();
    paintChromaticText(ctx, portal.label, portal.x - width * 0.5, portal.y + height * 0.68, {
      color: portal.visited ? '#1dff70' : '#f6f0df',
      alpha: portal.alpha,
      size: Math.max(9, 13 * portal.scale),
      maxWidth: width * 1.15,
      spread: 2.2,
    });
  }
}

function paintFinalRedaction(ctx, model) {
  if (!model.finalChoices.length) return;
  const w = model.viewport.width;
  const h = model.viewport.height;
  paintText(ctx, 'FINAL REDACTION: BLACK OUT THE COMFORTING LINE', w * 0.5, h * 0.22, {
    color: '#ff6358', alpha: 0.92, size: Math.max(18, h * 0.036), weight: 900, align: 'center', maxWidth: w * 0.92, blur: 10,
  });
  for (const choice of model.finalChoices) {
    const cardW = Math.min(w * 0.27, 380);
    const cardH = Math.min(h * 0.22, 170);
    ctx.save();
    ctx.globalAlpha = choice.selected ? 0.94 : 0.48;
    ctx.fillStyle = choice.selected ? 'rgba(255,99,88,.15)' : 'rgba(246,240,223,.05)';
    ctx.strokeStyle = choice.selected ? '#ff6358' : '#786f6a';
    ctx.lineWidth = choice.selected ? 3 : 1.5;
    ctx.fillRect(choice.x - cardW * 0.5, choice.y - cardH * 0.5, cardW, cardH);
    ctx.strokeRect(choice.x - cardW * 0.5, choice.y - cardH * 0.5, cardW, cardH);
    ctx.restore();
    paintText(ctx, choice.label, choice.x - cardW * 0.45, choice.y - cardH * 0.28, {
      color: choice.selected ? '#ffaaa4' : '#d8dedc', alpha: 0.92, size: Math.max(10, h * 0.018), maxWidth: cardW * 0.9,
    });
    paintChromaticText(ctx, choice.sourceText, choice.x - cardW * 0.45, choice.y + cardH * 0.10, {
      color: choice.selected ? '#f6f0df' : '#8b8f95', alpha: choice.selected ? 0.95 : 0.62, size: Math.max(9, h * 0.015), maxWidth: cardW * 0.9,
      spread: choice.selected ? 5 : 1.5,
    });
  }
}

function paintHud(ctx, model, state, inputDevice, log) {
  const w = model.viewport.width;
  const h = model.viewport.height;
  const controls = inputDevice === 'controller'
    ? promptLine([{ action: 'select', label: 'MOVE/TURN' }, { action: 'light', label: 'TUNE' }, { action: 'recorder', label: 'RECORD' }, { action: 'interact', label: 'INSPECT' }])
    : '[W/S] MOVE  [A/D] TURN  [F] TUNE  [R] RECORD  [E] INSPECT';
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.58)';
  ctx.fillRect(0, h - 78, w, 78);
  ctx.restore();
  paintText(ctx, `${model.room.title} :: ${model.sector.title}`, 22, h - 54, {
    color: model.status.hasFork ? '#1dff70' : '#f6f0df', alpha: 0.92, size: 16, maxWidth: w * 0.58,
  });
  paintText(ctx, `FACING ${model.camera.facing.toUpperCase()}  FORK ${model.status.hasFork ? 'LIVE' : 'ABSENT'}  SOURCE LINES ${model.sector.sourceLineCount}`, 22, h - 30, {
    color: '#8b8f95', alpha: 0.9, size: 12, maxWidth: w * 0.58,
  });
  paintText(ctx, controls, w - 24, h - 30, {
    color: '#22baff', alpha: 0.9, size: 12, align: 'right', maxWidth: w * 0.38,
  });
  const lines = (log || state.log || []).slice(-2);
  lines.forEach((entry, index) => paintText(ctx, entry.text, w * 0.50, h - 55 + index * 18, {
    color: entry.tone === 'danger' ? '#ff6358' : entry.tone === 'green' ? '#1dff70' : entry.tone === 'blue' ? '#22baff' : '#d8dedc',
    alpha: 0.88,
    size: 12,
    maxWidth: w * 0.46,
  }));
}

function paintScare(ctx, model, time) {
  const w = model.viewport.width;
  const h = model.viewport.height;
  ctx.save();
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = '#050000';
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 38; i++) {
    const x = (i * 97 + Math.sin(time * 31 + i) * 50) % w;
    const y = (i * 43 + time * 800) % h;
    paintChromaticText(ctx, 'return hush(operator);', x, y, {
      color: i % 3 === 0 ? '#ff6358' : '#f6f0df',
      alpha: 0.52,
      size: 12 + (i % 5) * 2,
      spread: 8,
      rotate: (i % 2 ? -1 : 1) * 0.08,
    });
  }
  ctx.restore();
  paintText(ctx, 'IT FOUND THE BACK OF YOU.', w * 0.5, h * 0.76, {
    color: '#ff6358', alpha: 0.98, size: Math.max(22, h * 0.055), weight: 900, align: 'center', maxWidth: w * 0.9, blur: 14,
  });
}

function paintChunkSurf({ state, time, redactionIndex }) {
  const { cols, rows } = uiSize();
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const viewport = { width: cols * cellW * dpr, height: rows * cellH * dpr };
    const model = chunkSurfVisualModel({ state, viewport, time, redactionIndex });
    paintVoid(ctx, model, viewport.width, viewport.height, time);
    paintSchematics(ctx, model);
    paintCodeArchitecture(ctx, model, time);
    paintPortals(ctx, model, time);
    paintFinalRedaction(ctx, model);
    if (state.scare) paintScare(ctx, model, time);
    paintHud(ctx, model, state, activeInputPromptDevice(), state.log);
  });
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
    render() { paintChunkSurf({ state, time: t, redactionIndex }); },
  };
}
