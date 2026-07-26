// Deterministic screen-body detail for the 2D compositor. Everything expensive
// is baked when the backing canvas changes size; drawGlassPass only composites
// those stable layers and, when allowed, one very slow service crawl.

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

function mulberry32(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function offscreen(width, height) {
  const doc = globalThis.document;
  if (!doc?.createElement) return null;
  const layer = doc.createElement('canvas');
  layer.width = width;
  layer.height = height;
  return layer;
}

function bakeSmudges(layer, rng, width, height, dpr) {
  const c = layer?.getContext?.('2d');
  if (!c) return;
  const count = Math.max(5, Math.min(18, Math.round((width * height) / 190000)));
  for (let index = 0; index < count; index += 1) {
    const edgeBias = rng() < 0.62;
    const x = edgeBias
      ? (rng() < 0.5 ? rng() * width * 0.24 : width * (0.76 + rng() * 0.24))
      : rng() * width;
    const y = edgeBias
      ? (rng() < 0.5 ? rng() * height * 0.22 : height * (0.78 + rng() * 0.22))
      : rng() * height;
    const radius = (22 + rng() * 72) * dpr;
    const gradient = c.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(182,202,198,${0.024 + rng() * 0.018})`);
    gradient.addColorStop(0.55, 'rgba(154,174,170,0.010)');
    gradient.addColorStop(1, 'rgba(120,136,134,0)');
    c.fillStyle = gradient;
    c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
}

function bakeScratches(layer, rng, width, height, dpr) {
  const c = layer?.getContext?.('2d');
  if (!c) return;
  c.save();
  c.lineCap = 'butt';
  const count = Math.max(8, Math.min(32, Math.round((width + height) / 90)));
  for (let index = 0; index < count; index += 1) {
    const x = rng() * width;
    const y = rng() * height;
    const length = (12 + rng() * 86) * dpr;
    const diagonal = (rng() - 0.5) * 0.26;
    c.strokeStyle = `rgba(205,222,218,${0.018 + rng() * 0.022})`;
    c.lineWidth = Math.max(0.5, dpr * (0.32 + rng() * 0.28));
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(Math.min(width, x + length), Math.max(0, Math.min(height, y + length * diagonal)));
    c.stroke();
  }
  c.restore();
}

function bakeDust(layer, rng, width, height, dpr) {
  const c = layer?.getContext?.('2d');
  if (!c) return;
  const count = Math.max(32, Math.min(180, Math.round((width * height) / 13000)));
  for (let index = 0; index < count; index += 1) {
    const x = Math.floor(rng() * width);
    const y = Math.floor(rng() * height);
    const size = Math.max(0.5, dpr * (0.28 + rng() * 0.42));
    c.fillStyle = `rgba(198,216,210,${0.025 + rng() * 0.035})`;
    c.fillRect(x, y, size, size);
  }
}

function bakeEdgeGrime(layer, rng, width, height) {
  const c = layer?.getContext?.('2d');
  if (!c) return;
  const horizontal = c.createLinearGradient(0, 0, width, 0);
  horizontal.addColorStop(0, `rgba(4,7,7,${0.18 + rng() * 0.035})`);
  horizontal.addColorStop(0.08, 'rgba(4,7,7,0)');
  horizontal.addColorStop(0.91, 'rgba(4,7,7,0)');
  horizontal.addColorStop(1, `rgba(4,7,7,${0.16 + rng() * 0.035})`);
  c.fillStyle = horizontal;
  c.fillRect(0, 0, width, height);

  const vertical = c.createLinearGradient(0, 0, 0, height);
  vertical.addColorStop(0, 'rgba(3,5,5,0.20)');
  vertical.addColorStop(0.10, 'rgba(3,5,5,0)');
  vertical.addColorStop(0.88, 'rgba(3,5,5,0)');
  vertical.addColorStop(1, 'rgba(3,5,5,0.24)');
  c.fillStyle = vertical;
  c.fillRect(0, 0, width, height);
}

export function createGlassPass({ width = 1, height = 1, dpr = 1, seed = 4417 } = {}) {
  const safeWidth = Math.max(1, Math.floor(Number(width) || 1));
  const safeHeight = Math.max(1, Math.floor(Number(height) || 1));
  const safeDpr = Math.max(0.5, Number(dpr) || 1);
  const rng = mulberry32(seed);
  const pass = {
    width: safeWidth,
    height: safeHeight,
    dpr: safeDpr,
    seed: Number(seed) || 4417,
    smudgeCanvas: offscreen(safeWidth, safeHeight),
    scratchCanvas: offscreen(safeWidth, safeHeight),
    dustCanvas: offscreen(safeWidth, safeHeight),
    edgeGrimeCanvas: offscreen(safeWidth, safeHeight),
  };
  bakeSmudges(pass.smudgeCanvas, rng, safeWidth, safeHeight, safeDpr);
  bakeScratches(pass.scratchCanvas, rng, safeWidth, safeHeight, safeDpr);
  bakeDust(pass.dustCanvas, rng, safeWidth, safeHeight, safeDpr);
  bakeEdgeGrime(pass.edgeGrimeCanvas, rng, safeWidth, safeHeight);
  return Object.freeze(pass);
}

export function drawGlassPass(ctx, pass, {
  now = globalThis.performance?.now?.() ?? Date.now(),
  alpha = 1,
  reducedMotion = false,
  visualEffects = true,
} = {}) {
  if (!ctx || !pass || !visualEffects || clamp01(alpha) <= 0) return false;
  const opacity = clamp01(alpha);
  ctx.save();
  if (pass.smudgeCanvas) {
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = opacity * 0.42;
    ctx.drawImage(pass.smudgeCanvas, 0, 0);
  }
  if (pass.scratchCanvas) {
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = opacity * 0.58;
    ctx.drawImage(pass.scratchCanvas, 0, 0);
  }
  if (pass.dustCanvas) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = opacity * 0.55;
    ctx.drawImage(pass.dustCanvas, 0, 0);
  }
  if (pass.edgeGrimeCanvas) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = opacity * 0.72;
    ctx.drawImage(pass.edgeGrimeCanvas, 0, 0);
  }
  if (!reducedMotion) {
    const crawl = ((Math.max(0, Number(now) || 0) * 0.0027) % (pass.height + 18 * pass.dpr)) - 9 * pass.dpr;
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = opacity * 0.026;
    ctx.fillStyle = 'rgba(178,218,207,1)';
    ctx.fillRect(0, crawl, pass.width, Math.max(1, pass.dpr * 0.5));
  }
  ctx.restore();
  return true;
}
