import { uiDraw } from '../render/ui.js';
import { visualEffectsEnabled } from './access.js';

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const REDUCED_MOTION = typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

function edgePoint(seed, index, width, height, inset) {
  const side = (seed + index * 7) % 4;
  const along = (((seed * 47 + index * 131) % 997) / 997);
  if (side === 0) return { x: along * width, y: inset };
  if (side === 1) return { x: width - inset, y: along * height };
  if (side === 2) return { x: along * width, y: height - inset };
  return { x: inset, y: along * height };
}

function drawPeripheralPrickle(ctx, frame, nowMs, width, height, dpr) {
  const amount = clamp01(frame.dread * 0.7 + frame.hiss * 0.4);
  if (amount <= 0.08) return;
  const seed = REDUCED_MOTION ? 4417 : Math.floor(nowMs / 260);
  const count = Math.floor(7 + amount * 19);
  ctx.save();
  ctx.strokeStyle = `rgba(196,221,213,${0.025 + amount * 0.075})`;
  ctx.lineWidth = Math.max(0.6, dpr * 0.52);
  for (let index = 0; index < count; index += 1) {
    const point = edgePoint(seed, index, width, height, 2.5 * dpr);
    const horizontal = point.y < height * 0.1 || point.y > height * 0.9;
    const length = (2 + ((seed + index * 11) % 7)) * dpr;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(point.x + (horizontal ? length : 0), point.y + (horizontal ? 0 : length));
    ctx.stroke();
  }
  ctx.restore();
}

function drawColdFlecks(ctx, frame, nowMs, width, height, dpr) {
  if (frame.hiss <= 0.08) return;
  const seed = REDUCED_MOTION ? 194 : Math.floor(nowMs / 310);
  const count = Math.floor(3 + frame.hiss * 13);
  ctx.save();
  ctx.fillStyle = `rgba(155,228,217,${0.025 + frame.hiss * 0.08})`;
  for (let index = 0; index < count; index += 1) {
    const point = edgePoint(seed * 3, index, width, height, (5 + (index % 3) * 3) * dpr);
    const length = (1 + ((seed + index * 17) % 4)) * dpr;
    ctx.fillRect(point.x, point.y, length, Math.max(0.7, dpr * 0.48));
  }
  ctx.restore();
}

function drawPulseCorners(ctx, frame, width, height, dpr) {
  if (frame.pulse <= 0.02) return;
  const reach = Math.max(18 * dpr, Math.min(width, height) * 0.08);
  ctx.save();
  ctx.fillStyle = `rgba(24,1,2,${frame.pulse * 0.065})`;
  for (const [x, y] of [[0, 0], [width - reach, 0], [0, height - reach], [width - reach, height - reach]]) {
    ctx.fillRect(x, y, reach, reach * 0.28);
    ctx.fillRect(x, y, reach * 0.28, reach);
  }
  ctx.restore();
}

export function fearOverlayFrame(pressure = {}, nowMs = 0) {
  const heartbeat = clamp01(pressure.heartbeat);
  const hiss = clamp01(pressure.monitorHiss);
  const dread = clamp01(pressure.visualDread);
  const phase = ((Math.max(0, Number(nowMs) || 0) / 1000) * (0.82 + heartbeat * 1.18)) % 1;
  const firstBeat = Math.exp(-Math.pow((phase - 0.08) / 0.055, 2));
  const secondBeat = Math.exp(-Math.pow((phase - 0.24) / 0.075, 2)) * 0.68;
  const pulse = clamp01(Math.max(firstBeat, secondBeat) * heartbeat);
  return Object.freeze({
    heartbeat,
    hiss,
    dread,
    pulse,
    edgeAlpha: clamp01(dread * 0.22 + pulse * 0.16),
    staticAlpha: clamp01(hiss * 0.13),
    scanAlpha: clamp01(hiss * 0.10 + pulse * 0.035),
  });
}

export function drawFearOverlay(pressure, nowMs = performance.now()) {
  const frame = fearOverlayFrame(pressure, nowMs);
  if (!visualEffectsEnabled()) return frame;
  if (frame.edgeAlpha < 0.002 && frame.staticAlpha < 0.002) return frame;

  uiDraw(({ ctx, dpr, cellW, cellH, cols, rows }) => {
    const width = cols * cellW * dpr;
    const height = rows * cellH * dpr;
    ctx.save();

    if (frame.edgeAlpha > 0.002) {
      const gradient = ctx.createRadialGradient(
        width * 0.5, height * 0.48, Math.min(width, height) * 0.18,
        width * 0.5, height * 0.48, Math.max(width, height) * 0.68,
      );
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(0.7, `rgba(36,3,2,${frame.edgeAlpha * 0.32})`);
      gradient.addColorStop(1, `rgba(42,2,1,${frame.edgeAlpha})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }

    drawPeripheralPrickle(ctx, frame, nowMs, width, height, dpr);
    drawColdFlecks(ctx, frame, nowMs, width, height, dpr);
    drawPulseCorners(ctx, frame, width, height, dpr);

    if (frame.staticAlpha > 0.002) {
      ctx.fillStyle = `rgba(112,255,230,${frame.scanAlpha})`;
      const scanY = REDUCED_MOTION
        ? height * 0.16
        : ((nowMs * (0.04 + frame.hiss * 0.08)) % (height + 24 * dpr)) - 12 * dpr;
      const span = width * 0.16;
      ctx.fillRect(0, scanY, span, Math.max(1, dpr));
      ctx.fillRect(width - span, scanY, span, Math.max(1, dpr));
    }
    ctx.restore();
  });
  return frame;
}
