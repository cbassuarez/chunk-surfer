import { uiDraw } from '../render/ui.js';

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

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

    if (frame.staticAlpha > 0.002) {
      const seed = Math.floor(nowMs / 47);
      ctx.fillStyle = `rgba(170,225,208,${frame.staticAlpha})`;
      const count = Math.floor(18 + frame.hiss * 76);
      for (let index = 0; index < count; index++) {
        const x = ((seed * 73 + index * 199) % 997) / 997 * width;
        const y = ((seed * 151 + index * 83) % 991) / 991 * height;
        const length = (2 + ((seed + index * 17) % 29)) * dpr;
        ctx.fillRect(x, y, length, Math.max(1, dpr * 0.55));
      }
      ctx.fillStyle = `rgba(112,255,230,${frame.scanAlpha})`;
      const scanY = ((nowMs * (0.04 + frame.hiss * 0.08)) % (height + 24 * dpr)) - 12 * dpr;
      ctx.fillRect(0, scanY, width, Math.max(1, dpr));
    }
    ctx.restore();
  });
  return frame;
}
