import { uiDraw } from '../render/ui.js';
import { UI_COLOR } from '../render/palette.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function smooth01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function cinematicConservatoryFrame(time = 0, {
  duration = 22,
  intensity = 1,
  reveal = 1,
  reduceMotion = false,
  variant = 'title',
} = {}) {
  const t = Math.max(0, Number(time) || 0);
  const d = Math.max(0.1, Number(duration) || 22);
  const progress = clamp01(t / d);
  const motion = reduceMotion ? 0.22 : 1;
  const breath = Math.sin(t * 0.38) * motion;
  const drift = Math.sin(t * 0.17 + 0.8) * motion;
  const revealAmount = smooth01(reveal);
  const cameraX = drift * 0.72 * intensity;
  const cameraY = (Math.sin(t * 0.21 + 1.4) * 0.34 - progress * 0.18) * motion * intensity;
  return {
    id: 'cinematic-conservatory',
    variant,
    time: t,
    duration: d,
    progress,
    reveal: revealAmount,
    reduceMotion,
    camera: {
      x: cameraX,
      y: cameraY,
      push: (progress * 0.9 + smooth01(t / 8) * 0.35) * motion * intensity,
      focus: 0.55 + 0.08 * breath,
    },
    light: {
      x: 0.46 + 0.035 * drift,
      y: 0.38 + 0.025 * Math.sin(t * 0.23 + 2.1) * motion,
      radius: 0.34 + 0.025 * breath,
      alpha: (0.22 + 0.08 * breath) * intensity * revealAmount,
    },
    atmosphere: {
      fog: (0.46 + 0.06 * Math.sin(t * 0.19 + 0.2) * motion) * revealAmount,
      grain: (reduceMotion ? 0.08 : 0.18) * intensity,
      dust: (reduceMotion ? 0.12 : 0.45) * intensity * revealAmount,
      vignette: 0.82 - 0.16 * revealAmount,
    },
  };
}

function rgba(hex, alpha) {
  const value = String(hex || '#000000').replace('#', '');
  const n = Number.parseInt(value.length === 3 ? value.split('').map((c) => c + c).join('') : value, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${clamp01(alpha)})`;
}

function seededUnit(index, salt = 0) {
  const x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function cinematicConservatoryLayout({ cols = 80, rows = 30, frame = cinematicConservatoryFrame(0) } = {}) {
  const c = Math.max(20, Math.floor(cols));
  const r = Math.max(8, Math.floor(rows));
  const lowerBandH = clamp(Math.round(r * 0.28), 7, 13);
  const horizon = clamp(Math.round(r * (0.42 + frame.camera.y * 0.01)), 5, r - lowerBandH - 2);
  return {
    cols: c,
    rows: r,
    horizon,
    lowerBand: {
      x: 0,
      y: r - lowerBandH,
      w: c,
      h: lowerBandH,
    },
    titleBand: {
      y: clamp(Math.round(r * 0.27 + frame.camera.y), 2, Math.max(2, r - lowerBandH - 4)),
    },
  };
}

export function renderCinematicConservatory(frame, { band = false, panel = false } = {}) {
  uiDraw(({ ctx, dpr, cellW, cellH, cols, rows }) => {
    const width = cols * cellW * dpr;
    const height = rows * cellH * dpr;
    const layout = cinematicConservatoryLayout({ cols, rows, frame });
    const reveal = frame.reveal ?? 1;
    const cx = frame.camera?.x || 0;
    const cy = frame.camera?.y || 0;
    const push = frame.camera?.push || 0;

    ctx.save();
    ctx.fillStyle = '#010203';
    ctx.fillRect(0, 0, width, height);

    const room = ctx.createLinearGradient(0, 0, 0, height);
    room.addColorStop(0, rgba('#05080a', 0.98));
    room.addColorStop(0.48, rgba('#0d1112', 0.92));
    room.addColorStop(1, rgba('#020303', 1));
    ctx.fillStyle = room;
    ctx.fillRect(0, 0, width, height);

    const horizonPx = layout.horizon * cellH * dpr;
    ctx.globalAlpha = 0.22 * reveal;
    ctx.strokeStyle = '#33413d';
    ctx.lineWidth = Math.max(1, 1.1 * dpr);
    const vpX = width * (0.5 + cx * 0.006);
    const vpY = horizonPx + cy * cellH * dpr;
    for (let i = -8; i <= 8; i++) {
      const x = width * 0.5 + i * width * 0.085 + cx * cellW * dpr;
      ctx.beginPath();
      ctx.moveTo(x, height);
      ctx.lineTo(vpX, vpY);
      ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const p = i / 11;
      const y = vpY + Math.pow(p, 1.7) * (height - vpY);
      ctx.globalAlpha = (0.08 + p * 0.18) * reveal;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.18 * reveal;
    ctx.strokeStyle = '#52625a';
    const archCount = cols < 70 ? 4 : 6;
    for (let i = 0; i < archCount; i++) {
      const p = (i + 0.5) / archCount;
      const archX = width * p + cx * cellW * dpr * (0.6 - p);
      const archW = width / archCount * (0.52 + push * 0.04);
      const archH = height * 0.42;
      const y = horizonPx - archH * 0.42;
      ctx.beginPath();
      ctx.moveTo(archX - archW * 0.5, horizonPx);
      ctx.quadraticCurveTo(archX, y, archX + archW * 0.5, horizonPx);
      ctx.stroke();
      ctx.globalAlpha = 0.10 * reveal;
      ctx.beginPath();
      ctx.moveTo(archX - archW * 0.5, horizonPx);
      ctx.lineTo(archX - archW * 0.5, height);
      ctx.moveTo(archX + archW * 0.5, horizonPx);
      ctx.lineTo(archX + archW * 0.5, height);
      ctx.stroke();
      ctx.globalAlpha = 0.18 * reveal;
    }

    const beam = ctx.createRadialGradient(
      width * frame.light.x,
      height * frame.light.y,
      width * 0.04,
      width * frame.light.x,
      height * frame.light.y,
      width * frame.light.radius,
    );
    beam.addColorStop(0, rgba('#d8d0ad', frame.light.alpha));
    beam.addColorStop(0.42, rgba('#776f54', frame.light.alpha * 0.30));
    beam.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = beam;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';

    ctx.globalAlpha = frame.atmosphere.dust;
    ctx.fillStyle = rgba('#d8d0ad', 0.55);
    const dustCount = rows < 24 ? 26 : 42;
    for (let i = 0; i < dustCount; i++) {
      const x = seededUnit(i, 2) * width + Math.sin(frame.time * 0.12 + i) * cellW * dpr;
      const y = seededUnit(i, 7) * height * 0.78 + height * 0.08;
      const s = (0.4 + seededUnit(i, 11) * 1.2) * dpr;
      ctx.fillRect(x, y, s, s);
    }

    ctx.globalAlpha = frame.atmosphere.fog * 0.34;
    const fog = ctx.createLinearGradient(0, horizonPx - height * 0.08, 0, height);
    fog.addColorStop(0, 'rgba(30,36,34,0)');
    fog.addColorStop(0.55, rgba('#29312d', 0.32));
    fog.addColorStop(1, rgba('#050606', 0.72));
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, width, height);

    if (band) {
      const bandY = layout.lowerBand.y * cellH * dpr;
      const g = ctx.createLinearGradient(0, bandY, 0, height);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.28, 'rgba(2,3,3,0.58)');
      g.addColorStop(1, 'rgba(0,0,0,0.88)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.fillRect(0, bandY - cellH * dpr, width, height - bandY + cellH * dpr);
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = UI_COLOR.secondary;
      ctx.beginPath();
      ctx.moveTo(width * 0.08, bandY + 0.5 * dpr);
      ctx.lineTo(width * 0.92, bandY + 0.5 * dpr);
      ctx.stroke();
    }

    if (panel) {
      const pad = cols < 58 ? 2 : 4;
      const x = pad * cellW * dpr;
      const y = (layout.lowerBand.y - 2) * cellH * dpr;
      const w = width - pad * 2 * cellW * dpr;
      const h = Math.min(height - y - cellH * dpr, 42 * cellH * dpr);
      ctx.globalAlpha = 0.76;
      ctx.fillStyle = '#030404';
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 0.34;
      ctx.strokeStyle = '#536059';
      ctx.strokeRect(x + 0.5 * dpr, y + 0.5 * dpr, w - dpr, h - dpr);
    }

    const vignette = ctx.createRadialGradient(
      width * 0.5,
      height * 0.48,
      Math.min(width, height) * 0.12,
      width * 0.5,
      height * 0.52,
      Math.max(width, height) * 0.70,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, `rgba(0,0,0,${clamp01(frame.atmosphere.vignette)})`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    if (frame.atmosphere.grain > 0) {
      ctx.globalAlpha = frame.atmosphere.grain;
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      for (let i = 0; i < 90; i++) {
        if (seededUnit(i, Math.floor(frame.time * 6)) < 0.48) continue;
        ctx.fillRect(seededUnit(i, 17) * width, seededUnit(i, 19) * height, dpr, dpr);
      }
    }
    ctx.restore();
  });
}
