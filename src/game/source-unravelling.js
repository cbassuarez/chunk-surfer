// The recording wears out in lived time as well as distance. Neither clock can
// run backwards; the visible amount is committed before any sector disappears.
export const SOURCE_UNRAVELLING_START_METRES = -50;
export const SOURCE_UNRAVELLING_END_METRES = 256;
export const SOURCE_UNRAVELLING_HALF_WIDTH_CELLS = 240;
export const SOURCE_UNRAVELLING_AMOUNT_STEP = .005;
const MARKERS = new Set(['street-unravels', 'street-erased']);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const smoothstep = (lo, hi, value) => { const t = clamp((value - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); };
const quantize = (amount) => Math.floor((amount + 1e-10) / SOURCE_UNRAVELLING_AMOUNT_STEP) * SOURCE_UNRAVELLING_AMOUNT_STEP;

function amountAt(furthestMetres, elapsedSeconds) {
  const spatial = .92 * smoothstep(SOURCE_UNRAVELLING_START_METRES, SOURCE_UNRAVELLING_END_METRES, furthestMetres);
  const temporal = .22 * (1 - Math.exp(-elapsedSeconds / 180));
  return quantize(Math.min(.96, spatial + temporal * (1 - spatial)));
}

export function normalizeSourceUnravelling(value = null, { legacyDepthCells = 0 } = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const legacyMetres = value == null && finite(legacyDepthCells) > 0 ? finite(legacyDepthCells) * .5 : SOURCE_UNRAVELLING_START_METRES;
  const furthestMetres = clamp(finite(source.furthestMetres, legacyMetres), SOURCE_UNRAVELLING_START_METRES, SOURCE_UNRAVELLING_END_METRES);
  const elapsedSeconds = clamp(finite(source.elapsedSeconds), 0, 86400);
  const active = !!source.active || furthestMetres > SOURCE_UNRAVELLING_START_METRES || elapsedSeconds > 0;
  return {
    active, furthestMetres, elapsedSeconds,
    amount: active ? Math.max(quantize(clamp(finite(source.amount), 0, .96)), amountAt(furthestMetres, elapsedSeconds)) : 0,
    markers: [...new Set(Array.isArray(source.markers) ? source.markers : [])].filter(id => MARKERS.has(id)),
  };
}

export function advanceSourceUnravelling(value, { metres, dt = 0 } = {}) {
  const previous = normalizeSourceUnravelling(value);
  const position = finite(metres, SOURCE_UNRAVELLING_START_METRES - 1);
  const active = previous.active || position >= SOURCE_UNRAVELLING_START_METRES;
  if (!active) return previous;
  return normalizeSourceUnravelling({
    ...previous, active,
    furthestMetres: Math.max(previous.furthestMetres, position),
    elapsedSeconds: previous.elapsedSeconds + clamp(finite(dt), 0, .1),
  });
}

export function sourceUnravellingFrame(value) {
  const state = normalizeSourceUnravelling(value);
  const { active, amount, furthestMetres, elapsedSeconds } = state;
  const loss = smoothstep(.5, .96, amount);
  const bodyResidue = 1 - smoothstep(.12, .45, amount);
  return { active, amount, furthestMetres, elapsedSeconds,
    street: 1 - smoothstep(.05, .65, amount),
    splats: smoothstep(0, .28, amount) * (1 - .85 * loss),
    loss,
    bodyResidue,
  };
}

// Stable removal thresholds make missing street objects stay missing on a
// retreat or reload. The small surviving fraction lasts into the recording.
export function sourceStreetRemnantVisible(id, amount) {
  let hash = 2166136261;
  for (const char of String(id)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  // Avalanche the suffix too: neighbouring lamp/road ids must not all vanish
  // together just because their final character is the only difference.
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35) >>> 0;
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return finite(amount) < .12 + (hash / 4294967295) * .58;
}
