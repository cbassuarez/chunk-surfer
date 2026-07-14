import { uiDraw } from '../render/ui.js';

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function seededUnit(index, salt = 0) {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

// Credits live in darkness, not in an illustrated room. The only animation is
// the exposure of a soft optical bloom and restrained, frame-stable grain.
export function creditAtmosphereFrame(time = 0, { alpha = 1, intensity = 1 } = {}) {
  const t = Math.max(0, Number(time) || 0);
  const visible = clamp01(alpha);
  const strength = Math.max(0, Number(intensity) || 0);
  return {
    time: t,
    alpha: visible,
    exposure: (0.055 + Math.sin(t * 0.29 + 0.6) * 0.012) * strength * visible,
    bloom: (0.15 + Math.sin(t * 0.17 + 1.1) * 0.018) * strength * visible,
    grain: (0.030 + Math.sin(t * 0.41) * 0.004) * strength * visible,
    vignette: 0.76 + Math.sin(t * 0.11 + 2.0) * 0.018,
  };
}

export function renderCreditAtmosphere(frame = creditAtmosphereFrame(0)) {
  uiDraw(({ ctx, dpr }) => {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const alpha = clamp01(frame.alpha ?? 1);

    ctx.save();
    ctx.fillStyle = '#010203';
    ctx.fillRect(0, 0, width, height);

    const wash = ctx.createLinearGradient(0, 0, 0, height);
    wash.addColorStop(0, 'rgba(3,5,6,0.98)');
    wash.addColorStop(0.50, `rgba(12,13,12,${clamp01(frame.exposure)})`);
    wash.addColorStop(1, 'rgba(1,2,3,1)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);

    const bloom = ctx.createRadialGradient(
      width * 0.5,
      height * 0.45,
      Math.min(width, height) * 0.02,
      width * 0.5,
      height * 0.48,
      Math.max(width, height) * 0.52,
    );
    bloom.addColorStop(0, `rgba(207,194,144,${clamp01(frame.bloom) * alpha})`);
    bloom.addColorStop(0.32, `rgba(86,82,67,${clamp01(frame.bloom) * 0.22 * alpha})`);
    bloom.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';

    const vignette = ctx.createRadialGradient(
      width * 0.5,
      height * 0.48,
      Math.min(width, height) * 0.18,
      width * 0.5,
      height * 0.50,
      Math.max(width, height) * 0.72,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, `rgba(0,0,0,${clamp01(frame.vignette)})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    const salt = Math.floor((Number(frame.time) || 0) * 10);
    ctx.globalAlpha = clamp01(frame.grain) * alpha;
    ctx.fillStyle = '#e1dcc8';
    for (let i = 0; i < 72; i++) {
      if (seededUnit(i, salt) < 0.52) continue;
      ctx.fillRect(
        seededUnit(i, 17 + salt) * width,
        seededUnit(i, 31 + salt) * height,
        dpr,
        dpr,
      );
    }
    ctx.restore();
  });
}
