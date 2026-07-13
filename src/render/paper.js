//
//  paper.js
//  
//
//  Created by Sebastian Suarez-Solis on 7/12/26.
//

// Physical paper identity for in-game documents.
//
// Deterministic rule: doc id + page index produces the same sheet every time.
// document.js owns pagination and text. paper.js owns the page as an object:
// tone, tooth, folds, stains, stamps, damage, clerk marks, and scan artifacts.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

const textureCache = new Map();

const PAPER_BASES = Object.freeze({
  cleanCopy: {
    tone: '#D8CFB8',
    grain: 0.10,
    edge: 0.14,
    fade: 0.00,
    skew: -0.10,
  },
  handledCopy: {
    tone: '#D2C6A9',
    grain: 0.16,
    edge: 0.22,
    fade: 0.07,
    skew: 0.16,
  },
  badPhotocopy: {
    tone: '#CFC3A6',
    grain: 0.22,
    edge: 0.30,
    fade: 0.14,
    skew: -0.26,
  },
  damagedCopy: {
    tone: '#C7B894',
    grain: 0.27,
    edge: 0.36,
    fade: 0.20,
    skew: 0.32,
  },
});

export function hashString(value = '') {
  let h = 2166136261 >>> 0;
  const s = String(value);

  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return h >>> 0;
}

export function rand(seed = 1) {
  let s = seed >>> 0;

  return function next() {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function range(r, lo, hi) {
  return lerp(lo, hi, r());
}

function pageSeed(doc, pageIndex) {
  return hashString(`${doc?.id || doc?.title || 'document'}:${pageIndex}`);
}

function baseProfileName(pageIndex, totalPages, doc) {
  if ((doc?.decay || 0) > 0.55) return 'damagedCopy';
  if (pageIndex <= 0) return 'cleanCopy';
  if (pageIndex === 1) return 'handledCopy';
  if (pageIndex >= Math.max(2, totalPages - 1) && totalPages > 2) return 'damagedCopy';
  return 'badPhotocopy';
}

function forPage(items = [], pageIndex) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => item?.page === pageIndex || item?.page === 'all');
}

function validStampText(text) {
  return String(text || 'COPY').toUpperCase().trim() || 'COPY';
}

function autoFolds(r, pageIndex, totalPages) {
  const folds = [];

  folds.push({
    axis: 'x',
    at: range(r, 0.47, 0.54),
    strength: pageIndex === 0 ? range(r, 0.032, 0.046) : range(r, 0.048, 0.076),
    width: range(r, 0.018, 0.034),
    waviness: range(r, 0.006, 0.020),
  });

  if (pageIndex > 0 || totalPages > 2) {
    folds.push({
      axis: 'y',
      at: range(r, 0.39, 0.46),
      strength: range(r, 0.028, 0.060),
      width: range(r, 0.016, 0.030),
      waviness: range(r, 0.006, 0.018),
    });
  }

  return folds;
}

function autoStains(r, pageIndex, totalPages, doc) {
  const stains = [];

  if (pageIndex === 0) {
    stains.push({
      type: 'binderBruise',
      x: range(r, 0.095, 0.145),
      y: range(r, 0.080, 0.140),
      rx: range(r, 0.050, 0.080),
      ry: range(r, 0.026, 0.045),
      alpha: range(r, 0.045, 0.075),
    });
  }

  if (pageIndex === 1 || (pageIndex > 1 && r() > 0.45)) {
    stains.push({
      type: 'thumbSmudge',
      x: range(r, 0.72, 0.88),
      y: range(r, 0.68, 0.88),
      rx: range(r, 0.090, 0.150),
      ry: range(r, 0.030, 0.070),
      rotate: range(r, -18, 18),
      alpha: range(r, 0.035, 0.075),
    });
  }

  const wantsCoffee = pageIndex >= 2 || (doc?.decay || 0) > 0.45;
  if (wantsCoffee && (pageIndex === totalPages - 1 || r() > 0.38)) {
    stains.push({
      type: 'coffeeEdge',
      side: r() > 0.55 ? 'right' : 'bottom',
      at: range(r, 0.55, 0.88),
      spread: range(r, 0.11, 0.21),
      alpha: range(r, 0.050, 0.110),
    });
  }

  if ((doc?.decay || 0) > 0.35 && r() > 0.40) {
    stains.push({
      type: 'waterBloom',
      x: range(r, 0.12, 0.84),
      y: range(r, 0.16, 0.82),
      rx: range(r, 0.10, 0.22),
      ry: range(r, 0.06, 0.16),
      alpha: range(r, 0.025, 0.060),
    });
  }

  return stains;
}

function autoDamage(r, pageIndex, totalPages, doc) {
  const damage = [];
  const decay = doc?.decay || 0;

  if (pageIndex > 0 || decay > 0.25) {
    damage.push({
      type: 'cornerWear',
      corner: ['tl', 'tr', 'br', 'bl'][Math.floor(r() * 4)],
      size: range(r, 0.030, 0.075),
      alpha: range(r, 0.045, 0.090),
    });
  }

  if (pageIndex >= 2 || decay > 0.45) {
    damage.push({
      type: 'edgeAbrasion',
      side: r() > 0.5 ? 'right' : 'bottom',
      alpha: range(r, 0.030, 0.075),
      count: Math.floor(range(r, 4, 9)),
    });
  }

  if (pageIndex === totalPages - 1 && totalPages > 2) {
    damage.push({
      type: 'bottomCurl',
      alpha: range(r, 0.040, 0.070),
      height: range(r, 0.055, 0.095),
    });
  }

  return damage;
}

function autoStamps(r, pageIndex, totalPages, doc) {
  const stamps = [];
  const id = String(doc?.id || '').toLowerCase();
  const title = String(doc?.title || '').toLowerCase();
  const isWorkOrder = id.includes('work-order') || title.includes('work order');
  const decay = doc?.decay || 0;

  if (pageIndex === 0) {
    stamps.push({
      text: 'RECEIVED',
      x: range(r, 0.66, 0.76),
      y: range(r, 0.095, 0.145),
      rotate: range(r, -7, 3),
      scale: range(r, 0.88, 1.06),
      alpha: range(r, 0.18, 0.28),
      color: r() > 0.35 ? '#6F302A' : '#3F3348',
    });
  }

  if (totalPages > 1 && pageIndex === 1) {
    stamps.push({
      text: 'ARCHIVAL COPY',
      x: range(r, 0.11, 0.20),
      y: range(r, 0.81, 0.89),
      rotate: range(r, -4, 4),
      scale: range(r, 0.78, 0.94),
      alpha: range(r, 0.10, 0.18),
      color: '#4A3C57',
    });
  }

  if (isWorkOrder && pageIndex >= 2) {
    stamps.push({
      text: 'ACCOUNT OPEN',
      x: range(r, 0.55, 0.78),
      y: range(r, 0.74, 0.88),
      rotate: range(r, -3, 8),
      scale: range(r, 0.86, 1.08),
      alpha: range(r, 0.16, 0.28),
      color: '#723024',
    });
  } else if (pageIndex >= 2 && decay < 0.62 && r() > 0.58) {
    stamps.push({
      text: 'COPY',
      x: range(r, 0.68, 0.92),
      y: range(r, 0.10, 0.24),
      rotate: range(r, -8, 7),
      scale: range(r, 0.76, 0.98),
      alpha: range(r, 0.08, 0.16),
      color: '#4A3C57',
    });
  }

  if (doc?.paper?.void || decay > 0.72) {
    stamps.push({
      text: 'VOID',
      x: range(r, 0.48, 0.68),
      y: range(r, 0.56, 0.72),
      rotate: range(r, -10, 10),
      scale: range(r, 1.00, 1.26),
      alpha: range(r, 0.08, 0.16),
      color: '#6F302A',
      boxed: false,
    });
  }

  return stamps;
}

function mergeAuthoredPaper(profile, paper, pageIndex) {
  if (!paper) return profile;

  return {
    ...profile,
    ...(paper.tone ? { tone: paper.tone } : null),
    ...(Number.isFinite(paper.grain) ? { grain: paper.grain } : null),
    ...(Number.isFinite(paper.edge) ? { edge: paper.edge } : null),
    ...(Number.isFinite(paper.fade) ? { fade: paper.fade } : null),
    ...(Number.isFinite(paper.skew) ? { skew: paper.skew } : null),
    folds: [...profile.folds, ...forPage(paper.folds, pageIndex)],
    stains: [...profile.stains, ...forPage(paper.stains, pageIndex)],
    stamps: [...profile.stamps, ...forPage(paper.stamps, pageIndex)].map((s) => ({ ...s, text: validStampText(s.text) })),
    marks: [...profile.marks, ...forPage(paper.marks, pageIndex)],
    damage: [...profile.damage, ...forPage(paper.damage, pageIndex)],
  };
}

export function paperProfile(doc, pageIndex = 0, totalPages = 1) {
  const seed = pageSeed(doc, pageIndex);
  const r = rand(seed);
  const baseName = doc?.paper?.profile || baseProfileName(pageIndex, totalPages, doc);
  const base = PAPER_BASES[baseName] || PAPER_BASES.handledCopy;

  const profile = {
    ...base,
    seed,
    profile: baseName,

    grain: clamp(base.grain + range(r, -0.025, 0.025), 0.02, 0.40),
    edge: clamp(base.edge + range(r, -0.035, 0.045), 0.04, 0.46),
    fade: clamp(base.fade + range(r, -0.025, 0.040), 0, 0.32),
    skew: base.skew + range(r, -0.12, 0.12),

    folds: autoFolds(r, pageIndex, totalPages),
    stains: autoStains(r, pageIndex, totalPages, doc),
    stamps: autoStamps(r, pageIndex, totalPages, doc),
    marks: [],
    damage: autoDamage(r, pageIndex, totalPages, doc),
  };

  return mergeAuthoredPaper(profile, doc?.paper, pageIndex);
}

function hexToRgb(hex) {
  const s = String(hex || '#D8CFB8').replace('#', '');
  const v = s.length === 3 ? s.split('').map((c) => c + c).join('') : s.padEnd(6, '0');

  return [
    parseInt(v.slice(0, 2), 16) || 0,
    parseInt(v.slice(2, 4), 16) || 0,
    parseInt(v.slice(4, 6), 16) || 0,
  ];
}

function paperTexture(w, h, profile) {
  const key = `${Math.round(w)}x${Math.round(h)}:${profile.tone}:${profile.grain.toFixed(3)}:${profile.seed}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(w));
  canvas.height = Math.max(2, Math.round(h));

  const ctx = canvas.getContext('2d');
  const [r0, g0, b0] = hexToRgb(profile.tone);
  const rng = rand(profile.seed ^ 0xC0FFEE);
  const img = ctx.createImageData(canvas.width, canvas.height);
  const data = img.data;
  const grain = profile.grain * 28;

  for (let i = 0; i < data.length; i += 4) {
    const n = (rng() - 0.5) * grain;
    const fiber = (rng() < 0.018) ? (rng() - 0.5) * grain * 1.8 : 0;

    data[i + 0] = clamp(r0 + n + fiber, 0, 255);
    data[i + 1] = clamp(g0 + n * 0.88 + fiber, 0, 255);
    data[i + 2] = clamp(b0 + n * 0.62 + fiber, 0, 255);
    data[i + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);

  const gx = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gx.addColorStop(0, 'rgba(255,255,255,0.035)');
  gx.addColorStop(0.48, 'rgba(255,255,255,0)');
  gx.addColorStop(1, `rgba(70,48,20,${0.035 + profile.fade * 0.16})`);
  ctx.fillStyle = gx;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (textureCache.size > 48) textureCache.clear();
  textureCache.set(key, canvas);
  return canvas;
}

function fillBand(ctx, rect, axis, at, width, gradient) {
  if (axis === 'x') {
    const x = rect.x + rect.w * at;
    const w = Math.max(1, rect.w * width);
    ctx.fillStyle = gradient;
    ctx.fillRect(x - w, rect.y, w * 2, rect.h);
  } else {
    const y = rect.y + rect.h * at;
    const h = Math.max(1, rect.h * width);
    ctx.fillStyle = gradient;
    ctx.fillRect(rect.x, y - h, rect.w, h * 2);
  }
}

function drawBrokenHairline(ctx, {
  x1, y1, x2, y2, seed, color, waviness = 0, axis = 'x', width = 0.75,
}) {
  const r = rand(seed ^ 0xA53A9);
  const steps = 48;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();

  let drawing = false;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const visible = r() > 0.17;
    const wave = Math.sin(t * Math.PI * 7 + (seed % 31)) * waviness;

    const x = lerp(x1, x2, t) + (axis === 'x' ? wave : 0);
    const y = lerp(y1, y2, t) + (axis === 'y' ? wave : 0);

    if (!visible) {
      drawing = false;
      continue;
    }

    if (!drawing) {
      ctx.moveTo(x, y);
      drawing = true;
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
  ctx.restore();
}

function drawVerticalFold(ctx, rect, fold, seed) {
  const x = rect.x + rect.w * fold.at;
  const w = Math.max(1, rect.w * fold.width);
  const s = fold.strength;

  const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
  g.addColorStop(0.00, 'rgba(255,255,255,0)');
  g.addColorStop(0.34, `rgba(255,255,255,${s * 0.60})`);
  g.addColorStop(0.49, `rgba(80,56,25,${s * 0.16})`);
  g.addColorStop(0.62, `rgba(35,24,12,${s})`);
  g.addColorStop(1.00, 'rgba(0,0,0,0)');

  fillBand(ctx, rect, 'x', fold.at, fold.width, g);

  drawBrokenHairline(ctx, {
    x1: x,
    y1: rect.y + rect.h * 0.035,
    x2: x,
    y2: rect.y + rect.h * 0.965,
    color: `rgba(48,35,18,${s * 0.58})`,
    seed: seed ^ Math.round(fold.at * 10000),
    waviness: rect.w * fold.waviness,
    axis: 'x',
  });
}

function drawHorizontalFold(ctx, rect, fold, seed) {
  const y = rect.y + rect.h * fold.at;
  const h = Math.max(1, rect.h * fold.width);
  const s = fold.strength;

  const g = ctx.createLinearGradient(0, y - h, 0, y + h);
  g.addColorStop(0.00, 'rgba(255,255,255,0)');
  g.addColorStop(0.34, `rgba(255,255,255,${s * 0.52})`);
  g.addColorStop(0.50, `rgba(75,52,24,${s * 0.14})`);
  g.addColorStop(0.64, `rgba(35,24,12,${s * 0.92})`);
  g.addColorStop(1.00, 'rgba(0,0,0,0)');

  fillBand(ctx, rect, 'y', fold.at, fold.width, g);

  drawBrokenHairline(ctx, {
    x1: rect.x + rect.w * 0.035,
    y1: y,
    x2: rect.x + rect.w * 0.965,
    y2: y,
    color: `rgba(48,35,18,${s * 0.52})`,
    seed: seed ^ Math.round(fold.at * 12000) ^ 0x55AA,
    waviness: rect.h * fold.waviness,
    axis: 'y',
  });
}

function drawEdgeDarkening(ctx, rect, profile) {
  const a = profile.edge;

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';

  const left = ctx.createLinearGradient(rect.x, 0, rect.x + rect.w * 0.13, 0);
  left.addColorStop(0, `rgba(62,43,19,${a * 0.34})`);
  left.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = left;
  ctx.fillRect(rect.x, rect.y, rect.w * 0.14, rect.h);

  const right = ctx.createLinearGradient(rect.x + rect.w, 0, rect.x + rect.w * 0.86, 0);
  right.addColorStop(0, `rgba(62,43,19,${a * 0.38})`);
  right.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = right;
  ctx.fillRect(rect.x + rect.w * 0.86, rect.y, rect.w * 0.14, rect.h);

  const bottom = ctx.createLinearGradient(0, rect.y + rect.h, 0, rect.y + rect.h * 0.82);
  bottom.addColorStop(0, `rgba(62,43,19,${a * 0.42})`);
  bottom.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = bottom;
  ctx.fillRect(rect.x, rect.y + rect.h * 0.82, rect.w, rect.h * 0.18);

  const top = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h * 0.10);
  top.addColorStop(0, `rgba(62,43,19,${a * 0.24})`);
  top.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = top;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h * 0.10);

  ctx.restore();
}

function drawCopierFade(ctx, rect, profile) {
  if (profile.fade <= 0) return;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const g = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
  g.addColorStop(0, `rgba(255,255,255,${profile.fade * 0.20})`);
  g.addColorStop(0.55, `rgba(255,255,255,${profile.fade * 0.06})`);
  g.addColorStop(1, `rgba(255,255,255,${profile.fade * 0.14})`);
  ctx.fillStyle = g;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

function drawEllipseStain(ctx, rect, stain, seed, color = 'rgba(57,38,16,1)') {
  const x = rect.x + rect.w * (stain.x ?? 0.5);
  const y = rect.y + rect.h * (stain.y ?? 0.5);
  const rx = rect.w * (stain.rx ?? 0.12);
  const ry = rect.h * (stain.ry ?? 0.06);
  const alpha = stain.alpha ?? 0.05;
  const rotate = ((stain.rotate || 0) * Math.PI) / 180;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotate);

  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, color.replace('1)', `${alpha})`));
  g.addColorStop(0.62, color.replace('1)', `${alpha * 0.35})`));
  g.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.scale(rx, ry);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();

  const r = rand(seed ^ 0xB10B);
  ctx.globalCompositeOperation = 'screen';
  ctx.strokeStyle = `rgba(255,248,225,${alpha * 0.70})`;
  ctx.lineWidth = 1 / Math.max(rx, ry);

  for (let i = 0; i < 9; i++) {
    const a = r() * TAU;
    const rr = r() * 0.8;
    const sx = Math.cos(a) * rr;
    const sy = Math.sin(a) * rr;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + range(r, -0.08, 0.08), sy + range(r, -0.05, 0.05));
    ctx.stroke();
  }

  ctx.restore();
}

function drawCoffeeEdge(ctx, rect, stain) {
  const side = stain.side || 'bottom';
  const a = stain.alpha ?? 0.08;
  const spread = stain.spread ?? 0.16;

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';

  if (side === 'right') {
    const g = ctx.createLinearGradient(rect.x + rect.w, 0, rect.x + rect.w * (1 - spread), 0);
    g.addColorStop(0, `rgba(116,68,25,${a})`);
    g.addColorStop(0.42, `rgba(156,92,34,${a * 0.45})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(rect.x + rect.w * (1 - spread), rect.y, rect.w * spread, rect.h);
  } else {
    const g = ctx.createLinearGradient(0, rect.y + rect.h, 0, rect.y + rect.h * (1 - spread));
    g.addColorStop(0, `rgba(116,68,25,${a})`);
    g.addColorStop(0.42, `rgba(156,92,34,${a * 0.45})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(rect.x, rect.y + rect.h * (1 - spread), rect.w, rect.h * spread);
  }

  ctx.restore();
}

function drawStains(ctx, rect, profile) {
  for (let i = 0; i < (profile.stains || []).length; i++) {
    const stain = profile.stains[i];
    const seed = profile.seed ^ (i * 0x9E3779B9);

    if (stain.type === 'coffeeEdge') drawCoffeeEdge(ctx, rect, stain);
    else if (stain.type === 'waterBloom') drawEllipseStain(ctx, rect, stain, seed, 'rgba(88,70,38,1)');
    else if (stain.type === 'binderBruise') drawEllipseStain(ctx, rect, stain, seed, 'rgba(48,32,18,1)');
    else drawEllipseStain(ctx, rect, stain, seed, 'rgba(57,38,16,1)');
  }
}

function drawCornerWear(ctx, rect, damage) {
  const c = damage.corner || 'br';
  const s = Math.min(rect.w, rect.h) * (damage.size || 0.05);
  const a = damage.alpha ?? 0.06;
  const x = c.includes('r') ? rect.x + rect.w : rect.x;
  const y = c.includes('b') ? rect.y + rect.h : rect.y;
  const sx = c.includes('r') ? -1 : 1;
  const sy = c.includes('b') ? -1 : 1;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  const g = ctx.createRadialGradient(x, y, 0, x, y, s * 1.3);
  g.addColorStop(0, `rgba(255,248,224,${a})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + sx * s, y);
  ctx.lineTo(x, y + sy * s);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawEdgeAbrasion(ctx, rect, damage, seed) {
  const r = rand(seed ^ 0xED9E);
  const side = damage.side || 'right';
  const count = damage.count || 6;
  const a = damage.alpha ?? 0.05;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.strokeStyle = `rgba(255,248,224,${a})`;
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';

  for (let i = 0; i < count; i++) {
    const t = range(r, 0.08, 0.92);
    const len = range(r, 0.015, 0.05);
    ctx.beginPath();

    if (side === 'right') {
      const x = rect.x + rect.w - range(r, 1, rect.w * 0.015);
      const y = rect.y + rect.h * t;
      ctx.moveTo(x, y);
      ctx.lineTo(x - rect.w * len, y + range(r, -2, 2));
    } else {
      const x = rect.x + rect.w * t;
      const y = rect.y + rect.h - range(r, 1, rect.h * 0.015);
      ctx.moveTo(x, y);
      ctx.lineTo(x + range(r, -2, 2), y - rect.h * len);
    }

    ctx.stroke();
  }

  ctx.restore();
}

function drawBottomCurl(ctx, rect, damage) {
  const a = damage.alpha ?? 0.05;
  const h = rect.h * (damage.height || 0.07);

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';

  const g = ctx.createLinearGradient(0, rect.y + rect.h - h, 0, rect.y + rect.h);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.50, `rgba(88,61,30,${a * 0.55})`);
  g.addColorStop(1, `rgba(42,28,14,${a})`);

  ctx.fillStyle = g;
  ctx.fillRect(rect.x, rect.y + rect.h - h, rect.w, h);

  ctx.restore();
}

function drawDamage(ctx, rect, profile) {
  for (let i = 0; i < (profile.damage || []).length; i++) {
    const d = profile.damage[i];
    const seed = profile.seed ^ (i * 0x517CC1B7);

    if (d.type === 'cornerWear') drawCornerWear(ctx, rect, d);
    else if (d.type === 'edgeAbrasion') drawEdgeAbrasion(ctx, rect, d, seed);
    else if (d.type === 'bottomCurl') drawBottomCurl(ctx, rect, d);
  }
}

function stampFont(rect, scale = 1) {
  const px = clamp(rect.h * 0.030 * scale, 11, 22);
  return `bold ${Math.round(px)}px "Courier New", Courier, ui-monospace, monospace`;
}

function measureTracked(ctx, text, tracking = 0) {
  const s = String(text ?? '');
  if (!s) return 0;
  return ctx.measureText(s).width + Math.max(0, s.length - 1) * tracking;
}

function drawRoughLine(ctx, x1, y1, x2, y2, seed, passes = 1) {
  const r = rand(seed);

  for (let p = 0; p < passes; p++) {
    ctx.beginPath();

    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = lerp(x1, x2, t) + range(r, -0.9, 0.9);
      const y = lerp(y1, y2, t) + range(r, -0.9, 0.9);

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.stroke();
  }
}

function drawRoughRect(ctx, x, y, w, h, seed) {
  drawRoughLine(ctx, x, y, x + w, y, seed ^ 1);
  drawRoughLine(ctx, x + w, y, x + w, y + h, seed ^ 2);
  drawRoughLine(ctx, x + w, y + h, x, y + h, seed ^ 3);
  drawRoughLine(ctx, x, y + h, x, y, seed ^ 4);
}

function drawStampText(ctx, text, x, y, tracking, seed) {
  const r = rand(seed ^ 0x57A4);
  let cx = x;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const w = ctx.measureText(ch).width;

    if (ch !== ' ') {
      const a = 0.70 + r() * 0.30;
      ctx.globalAlpha *= a;
      ctx.fillText(ch, cx + range(r, -0.35, 0.35), y + range(r, -0.35, 0.35));
      ctx.globalAlpha /= a;
    }

    cx += w + tracking;
  }
}

function drawStamp(ctx, rect, stamp, seed) {
  const text = validStampText(stamp.text);
  const x = rect.x + rect.w * (stamp.x ?? 0.72);
  const y = rect.y + rect.h * (stamp.y ?? 0.16);
  const scale = stamp.scale ?? 1;
  const tracking = rect.w * 0.0048 * scale;
  const color = stamp.color || (text === 'VOID' ? '#6F302A' : '#4A3C57');
  const alpha = clamp(stamp.alpha ?? 0.18, 0, 0.45);
  const rotate = ((stamp.rotate || 0) * Math.PI) / 180;
  const boxed = stamp.boxed !== false;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotate);
  ctx.font = stampFont(rect, scale);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, rect.w * 0.0018);
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'multiply';

  const w = measureTracked(ctx, text, tracking);
  const h = clamp(rect.h * 0.052 * scale, 20, 42);
  const padX = rect.w * 0.014 * scale;

  if (boxed) drawRoughRect(ctx, -padX, -h / 2, w + padX * 2, h, seed);
  drawStampText(ctx, text, 0, 1, tracking, seed);

  ctx.restore();
}

function drawStamps(ctx, rect, profile) {
  const stamps = profile.stamps || [];

  for (let i = 0; i < stamps.length; i++) {
    const s = stamps[i];
    if (!s) continue;
    drawStamp(ctx, rect, s, profile.seed ^ (i * 0x6C8E9CF5));
  }
}

function pencilColor(mark) {
  return mark.color || '#9B2F25';
}

function drawPencilUnderline(ctx, rect, mark, seed) {
  const x = rect.x + rect.w * (mark.x ?? 0.18);
  const y = rect.y + rect.h * (mark.y ?? 0.70);
  const w = rect.w * (mark.w ?? 0.38);

  ctx.save();
  ctx.strokeStyle = pencilColor(mark);
  ctx.globalAlpha = clamp(mark.alpha ?? 0.58, 0, 0.85);
  ctx.lineWidth = Math.max(1, rect.h * 0.0028);
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'multiply';

  drawRoughLine(ctx, x, y, x + w, y + rect.h * 0.003, seed, 2);

  ctx.restore();
}

function drawPencilCircle(ctx, rect, mark, seed) {
  const x = rect.x + rect.w * (mark.x ?? 0.5);
  const y = rect.y + rect.h * (mark.y ?? 0.5);
  const w = rect.w * (mark.w ?? 0.18);
  const h = rect.h * (mark.h ?? 0.055);
  const r = rand(seed ^ 0xC1C1E);

  ctx.save();
  ctx.strokeStyle = pencilColor(mark);
  ctx.globalAlpha = clamp(mark.alpha ?? 0.50, 0, 0.85);
  ctx.lineWidth = Math.max(1, rect.h * 0.0026);
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'multiply';

  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();

    for (let i = 0; i <= 48; i++) {
      const t = (i / 48) * TAU;
      const px = x + Math.cos(t) * w * 0.5 + range(r, -0.8, 0.8);
      const py = y + Math.sin(t) * h * 0.5 + range(r, -0.8, 0.8);

      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }

    ctx.stroke();
  }

  ctx.restore();
}

function drawPencilNote(ctx, rect, mark, seed) {
  const text = String(mark.text || '?');
  const x = rect.x + rect.w * (mark.x ?? 0.66);
  const y = rect.y + rect.h * (mark.y ?? 0.18);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(((mark.rotate ?? -5) * Math.PI) / 180);
  ctx.font = `bold ${Math.round(clamp(rect.h * 0.032, 12, 21))}px "Courier New", Courier, ui-monospace, monospace`;
  ctx.fillStyle = pencilColor(mark);
  ctx.globalAlpha = clamp(mark.alpha ?? 0.62, 0, 0.85);
  ctx.globalCompositeOperation = 'multiply';

  const r = rand(seed ^ 0xF00D);
  let cx = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    ctx.fillText(ch, cx + range(r, -0.4, 0.4), range(r, -0.4, 0.4));
    cx += ctx.measureText(ch).width + rect.w * 0.0015;
  }

  ctx.restore();
}

function drawMarks(ctx, rect, profile) {
  const marks = profile.marks || [];

  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    const seed = profile.seed ^ (i * 0xA11CE);

    if (mark.type === 'circle') drawPencilCircle(ctx, rect, mark, seed);
    else if (mark.type === 'note') drawPencilNote(ctx, rect, mark, seed);
    else drawPencilUnderline(ctx, rect, mark, seed);
  }
}

export function applyPaperTransform(ctx, rect, profile) {
  const deg = Number(profile?.skew || 0);
  if (!Number.isFinite(deg) || Math.abs(deg) < 0.001) return;

  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;

  ctx.translate(cx, cy);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.translate(-cx, -cy);
}

export function drawPaperSheet(ctx, rect, profile) {
  if (!ctx || !rect || !profile) return;

  const r = {
    x: rect.x,
    y: rect.y,
    w: Math.max(1, rect.w),
    h: Math.max(1, rect.h),
  };
  const dpr = rect.dpr || 1;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 18 * dpr;
  ctx.shadowOffsetX = 3 * dpr;
  ctx.shadowOffsetY = 6 * dpr;
  ctx.fillStyle = '#000';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();

  ctx.save();

  const tex = paperTexture(r.w, r.h, profile);
  ctx.drawImage(tex, r.x, r.y, r.w, r.h);

  drawStains(ctx, r, profile);
  drawEdgeDarkening(ctx, r, profile);

  for (const fold of profile.folds || []) {
    if (fold.axis === 'y') drawHorizontalFold(ctx, r, fold, profile.seed);
    else drawVerticalFold(ctx, r, fold, profile.seed);
  }

  drawDamage(ctx, r, profile);
  drawCopierFade(ctx, r, profile);
  drawStamps(ctx, r, profile);
  drawMarks(ctx, r, profile);

  ctx.globalAlpha = 0.10 + profile.edge * 0.08;
  ctx.strokeStyle = '#20180F';
  ctx.lineWidth = dpr;
  ctx.strokeRect(r.x + 0.5 * dpr, r.y + 0.5 * dpr, r.w - dpr, r.h - dpr);

  ctx.restore();
}

export function drawPaperOverlay(ctx, rect, profile) {
  if (!ctx || !rect || !profile) return;

  const r = rand(profile.seed ^ 0xD057);
  const count = Math.round(34 + profile.grain * 170 + profile.fade * 120);

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';

  for (let i = 0; i < count; i++) {
    const x = rect.x + r() * rect.w;
    const y = rect.y + r() * rect.h;
    const a = range(r, 0.010, 0.038) + profile.fade * 0.025;
    const w = range(r, 0.35, 1.35) * (rect.dpr || 1);

    ctx.fillStyle = `rgba(30,22,12,${a})`;
    ctx.fillRect(x, y, w, w);
  }

  ctx.strokeStyle = `rgba(35,25,12,${0.018 + profile.fade * 0.030})`;
  ctx.lineWidth = 0.75 * (rect.dpr || 1);
  ctx.lineCap = 'round';

  for (let i = 0; i < 4; i++) {
    const x = rect.x + range(r, 0.06, 0.94) * rect.w;
    const y = rect.y + range(r, 0.04, 0.92) * rect.h;
    const len = range(r, 0.04, 0.16) * rect.h;
    drawRoughLine(ctx, x, y, x + range(r, -2, 2), y + len, profile.seed ^ i ^ 0x9911);
  }

  ctx.restore();
}

export function drawPaperGuides(ctx, rect, profile) {
  if (!ctx || !rect || !profile) return;

  ctx.save();
  ctx.strokeStyle = 'rgba(155,47,37,0.45)';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);

  for (const fold of profile.folds || []) {
    ctx.beginPath();

    if (fold.axis === 'y') {
      const y = rect.y + rect.h * fold.at;
      ctx.moveTo(rect.x, y);
      ctx.lineTo(rect.x + rect.w, y);
    } else {
      const x = rect.x + rect.w * fold.at;
      ctx.moveTo(x, rect.y);
      ctx.lineTo(x, rect.y + rect.h);
    }

    ctx.stroke();
  }

  ctx.restore();
}
