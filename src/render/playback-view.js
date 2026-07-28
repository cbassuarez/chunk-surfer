// A sealed-take return on the recorder itself. Playback is not a generic HUD
// progress bar: it is a small, physical transport whose reels, counter, trace,
// printed sources and cue marks all describe the tape currently in the cans.

import { uiDraw, uiFill, uiLine, uiStrokeRect, uiText } from './ui.js';
import { UI_COLOR } from './palette.js';
import { drawMachinePanel, drawVfdCounter, drawVfdText } from './presentation.js';

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

function fit(text, width) {
  const value = String(text ?? '');
  const size = Math.max(1, Math.floor(width));
  return value.length <= size ? value : `${value.slice(0, Math.max(1, size - 1))}…`;
}

export function formatPlaybackTime(seconds = 0) {
  const whole = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

export function buildPlaybackViewModel(snapshot, { roomTitle = 'SEALED TAKE', takeNumber = 0 } = {}) {
  if (!snapshot) return null;
  return {
    ...snapshot,
    roomTitle: String(roomTitle || 'sealed take').toUpperCase(),
    takeLabel: takeNumber > 0 ? `TAKE ${String(takeNumber).padStart(2, '0')}` : 'SEALED TAKE',
    elapsedLabel: formatPlaybackTime(snapshot.elapsedSec),
    remainingLabel: `-${formatPlaybackTime(snapshot.remainingSec)}`,
    printLabel: `${snapshot.sourceCount} SOURCE${snapshot.sourceCount === 1 ? '' : 'S'}`
      + (snapshot.eventCount ? ` · ${snapshot.eventCount} EVENT${snapshot.eventCount === 1 ? '' : 'S'}` : ''),
  };
}

function drawTransportBay(rect, view) {
  const progress = clamp01(view.progress);
  const drift = clamp01(view.tapeDrift);
  uiFill(rect.x, rect.y, rect.w, rect.h, 'rgba(0,3,3,0.94)');
  uiStrokeRect(rect.x, rect.y, rect.w, rect.h, UI_COLOR.frame, .42, 1);

  // A narrow waveform is a reading of the print, not an audio visualizer. The
  // late double trace is deliberately unlabelled: the machine never explains
  // the thing the player is hearing.
  const traceX = rect.x + 6;
  const traceW = Math.max(4, rect.w - 12);
  const mid = rect.y + rect.h * .52;
  const bins = Math.max(6, Math.floor(traceW));
  for (let index = 0; index < bins; index += 1) {
    const p = index / Math.max(1, bins - 1);
    const phase = p * 22 + progress * 7.4;
    const envelope = .18 + .82 * Math.abs(Math.sin(phase) * Math.cos(phase * .37));
    const amp = Math.min(rect.h * .32, (.18 + (view.signalLeft + view.signalRight) * .38) * envelope);
    const x = traceX + p * traceW;
    uiLine(x, mid - amp, x, mid + amp, UI_COLOR.green, index / bins <= progress ? .76 : .16, 1);
    if (drift > .04) {
      const offset = drift * (index % 3 === 0 ? .42 : -.22);
      uiLine(x + offset, mid - amp * .72, x + offset, mid + amp * .72, UI_COLOR.amber, drift * .28, 1);
    }
  }

  for (const marker of view.markers || []) {
    const x = traceX + clamp01(marker.position) * traceW;
    uiLine(x, rect.y + .25, x, rect.y + rect.h - .25, UI_COLOR.counter, .72, 1);
  }
  const headX = traceX + progress * traceW;
  uiLine(headX, rect.y + .1, headX, rect.y + rect.h - .1, UI_COLOR.amber, 1, 1.5);

  // Twin reel windows and capstan spokes make this read as a machine, even at
  // the smallest supported HUD scale.
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const toX = (cell) => cell * cellW * dpr;
    const toY = (cell) => cell * cellH * dpr;
    const radius = Math.min(cellW * 1.34, cellH * .88) * dpr;
    const centers = [rect.x + 2.8, rect.x + rect.w - 2.8];
    ctx.save();
    for (let reelIndex = 0; reelIndex < centers.length; reelIndex += 1) {
      const cx = toX(centers[reelIndex]);
      const cy = toY(rect.y + rect.h * .51);
      ctx.strokeStyle = UI_COLOR.frame;
      ctx.globalAlpha = .68;
      ctx.lineWidth = Math.max(1, dpr);
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, radius * .28, 0, Math.PI * 2); ctx.stroke();
      const rotation = progress * Math.PI * (reelIndex ? 15 : 21) * (reelIndex ? -1 : 1);
      for (let spoke = 0; spoke < 3; spoke += 1) {
        const angle = rotation + spoke * Math.PI * 2 / 3;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * radius * .30, cy + Math.sin(angle) * radius * .30);
        ctx.lineTo(cx + Math.cos(angle) * radius * .82, cy + Math.sin(angle) * radius * .82);
        ctx.stroke();
      }
    }
    ctx.restore();
  });
}

function drawChannelMeter(x, y, width, level, label) {
  uiText(x, y, label, 'ui-label', .62);
  const segments = Math.max(3, Math.floor(width - 2));
  const lit = Math.round(clamp01(level) * segments);
  for (let index = 0; index < segments; index += 1) {
    uiFill(x + 2 + index, y + .25, .72, .42,
      index < lit ? 'rgba(119,224,187,0.82)' : 'rgba(119,224,187,0.09)');
  }
}

export function drawPlaybackOverlay({ snapshot, cols, rows, roomTitle, takeNumber = 0 } = {}) {
  const view = buildPlaybackViewModel(snapshot, { roomTitle, takeNumber });
  if (!view) return false;
  const width = Math.max(42, Math.min(78, cols - 6));
  const height = rows < 28 ? 11 : 14;
  const x = Math.floor((cols - width) / 2);
  const y = Math.max(2, rows - height - 5);
  const body = drawMachinePanel(x, y, width, height, {
    wordmark: 'hi ta chi', model: 'DA-1000', label: 'TAPE RETURN',
    source: 'HEADPHONES', meter: false, theme: 'green', footer: ' ',
    footerParts: [{ action: 'playback', label: 'STOP' }],
  });

  const compact = width < 58 || height < 13;
  const counterX = body.x;
  uiText(counterX, body.y, view.takeLabel, 'ui-blue', .82);
  drawVfdCounter(counterX, body.y + 1.15, view.elapsedLabel, { scale: compact ? .82 : 1, theme: 'green' });
  uiText(counterX, body.y + (compact ? 2.6 : 3.0), view.remainingLabel, 'ui-secondary', .70);

  const deckX = body.x + (compact ? 11 : 14);
  const deckW = Math.max(18, body.w - (deckX - body.x));
  drawTransportBay({ x: deckX, y: body.y, w: deckW, h: compact ? 3.4 : 4.4 }, view);

  const infoY = body.y + (compact ? 4.0 : 5.0);
  drawVfdText(body.x, infoY, fit(view.roomTitle, Math.floor(body.w * .58)), {
    scale: compact ? .62 : .72, theme: 'green', alpha: .94,
  });
  uiText(body.x, infoY + 1, fit(`SEALED PRINT · ${view.printLabel}`, Math.floor(body.w * .62)), 'ui-primary', .72);
  uiText(body.x, infoY + 2, 'IN THE CANS ONLY', 'ui-blue', .72);

  const meterW = Math.max(10, Math.floor(body.w * .28));
  const meterX = body.x + body.w - meterW;
  drawChannelMeter(meterX, infoY + .1, meterW, view.signalLeft, 'L');
  drawChannelMeter(meterX, infoY + 1.15, meterW, view.signalRight, 'R');
  return true;
}
