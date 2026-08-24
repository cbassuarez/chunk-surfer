import { MATERIAL, ZONE } from '../data/floorplan/legend.js';
import { computeWaterBounds, pointInBounds } from './water-bodies.js';
import { lastReturnRecord } from '../progression/return-history.js';

export const NATATORIUM_WATER_STATES = Object.freeze({
  DRAINED: 'drained',
  MURKY: 'murky',
});

export const NATATORIUM_ROUTE_TRUNKS = Object.freeze({
  BASELINE: 'baseline',
  FLOODED_SEAL: 'flooded-seal',
  FLOODED_SURFACE: 'flooded-surface',
  DRY_INVERSION: 'dry-inversion',
  UNCERTAIN: 'uncertain',
});

export const NATATORIUM_WATER_BIASES = Object.freeze({
  SEAL: 'seal',
  SURFACE: 'surface',
  INVERSION: 'inversion',
});

export const DEFAULT_NATATORIUM_WATER_ENVIRONMENT = Object.freeze({
  natatoriumWater: NATATORIUM_WATER_STATES.DRAINED,
  routeTrunk: NATATORIUM_ROUTE_TRUNKS.BASELINE,
});

export const DEFAULT_NATATORIUM_WATER_LEDGER = Object.freeze({
  seen: false,
  choice: null,
  routeBias: null,
  rippleSerial: 0,
  soaked: false,
  defeats: 0,
  batteryLost: 0,
});

const VALID_WATER = new Set(Object.values(NATATORIUM_WATER_STATES));
const VALID_TRUNKS = new Set(Object.values(NATATORIUM_ROUTE_TRUNKS));
const VALID_BIASES = new Set(Object.values(NATATORIUM_WATER_BIASES));

const objectOr = (value, fallback = {}) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : fallback
);

function lastEnding(meta = null) {
  const lastRecord = lastReturnRecord(meta);
  if (typeof lastRecord?.endingId === 'string') return lastRecord.endingId;
  const seen = Array.isArray(meta?.endingsSeen) ? meta.endingsSeen : [];
  return typeof seen.at(-1) === 'string' ? seen.at(-1) : null;
}

function hashString(value) {
  const s = String(value || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function decideNatatoriumWaterEnvironment({ meta = null, runId = '', now = 0 } = {}) {
  const endingsSeen = Array.isArray(meta?.endingsSeen) ? meta.endingsSeen.length : 0;
  if (endingsSeen <= 0) return { ...DEFAULT_NATATORIUM_WATER_ENVIRONMENT };

  const ending = lastEnding(meta);
  if (ending === 'sacrifice' || ending === 'helped') {
    return {
      natatoriumWater: NATATORIUM_WATER_STATES.MURKY,
      routeTrunk: NATATORIUM_ROUTE_TRUNKS.FLOODED_SEAL,
    };
  }
  if (ending === 'surfaced') {
    return {
      natatoriumWater: NATATORIUM_WATER_STATES.MURKY,
      routeTrunk: NATATORIUM_ROUTE_TRUNKS.FLOODED_SURFACE,
    };
  }
  if (ending === 'inversion') {
    return {
      natatoriumWater: NATATORIUM_WATER_STATES.DRAINED,
      routeTrunk: NATATORIUM_ROUTE_TRUNKS.DRY_INVERSION,
    };
  }
  if (ending === 'drugged') {
    return {
      natatoriumWater: (hashString(`${runId}:${now}:drugged`) % 2) === 0
        ? NATATORIUM_WATER_STATES.MURKY
        : NATATORIUM_WATER_STATES.DRAINED,
      routeTrunk: NATATORIUM_ROUTE_TRUNKS.UNCERTAIN,
    };
  }
  return { ...DEFAULT_NATATORIUM_WATER_ENVIRONMENT };
}

export function normalizeNatatoriumWaterEnvironment(value, fallback = DEFAULT_NATATORIUM_WATER_ENVIRONMENT) {
  const source = objectOr(value);
  const routeTrunk = VALID_TRUNKS.has(source.routeTrunk) ? source.routeTrunk : fallback.routeTrunk;
  const natatoriumWater = VALID_WATER.has(source.natatoriumWater)
    ? source.natatoriumWater
    : fallback.natatoriumWater;
  return { natatoriumWater, routeTrunk };
}

export function normalizeNatatoriumWaterLedger(value) {
  const source = objectOr(value);
  const routeBias = VALID_BIASES.has(source.routeBias) ? source.routeBias : null;
  return {
    seen: !!source.seen,
    choice: typeof source.choice === 'string' && source.choice ? source.choice.slice(0, 48) : null,
    routeBias,
    rippleSerial: Math.max(0, Math.floor(Number(source.rippleSerial) || 0)),
    soaked: !!source.soaked,
    defeats: Math.max(0, Math.floor(Number(source.defeats) || 0)),
    batteryLost: Math.max(0, Number(source.batteryLost) || 0),
  };
}

export function natatoriumWaterActive(run = null) {
  return run?.environment?.natatoriumWater === NATATORIUM_WATER_STATES.MURKY;
}

// The bath's own bounds. The scan that used to live here is now
// computeWaterBounds in water-bodies.js, with its two constants lifted into
// arguments so a second body could use it; this is the natatorium asking that
// scan its own question. Kept so every existing caller reads the same as before.
export function computeNatatoriumBasinBounds(fp) {
  return computeWaterBounds(fp, { zone: ZONE.natatorium, material: MATERIAL.wetTile });
}

export function pointInNatatoriumBasin(x, y, bounds) {
  return pointInBounds(x, y, bounds);
}

export function waterUvForPoint(x, y, bounds) {
  if (!bounds) return null;
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  return {
    u: Math.max(0, Math.min(1, (Number(x) - bounds.minX) / w)),
    v: Math.max(0, Math.min(1, (Number(y) - bounds.minY) / h)),
  };
}

export function natatoriumWaterBlocks(run, x, y, bounds) {
  // Water is presentation and narrative state, never a collision volume.
  void run; void x; void y; void bounds;
  return false;
}

export function makeNatatoriumRippleSources({
  run = null,
  player = null,
  bounds = null,
  now = 0,
  audio = 0,
  reduceMotion = false,
} = {}) {
  if (!natatoriumWaterActive(run) || !bounds) return [];
  const sources = [];
  const ledger = normalizeNatatoriumWaterLedger(run?.ledger?.natatoriumWater);
  const strengthScale = reduceMotion ? 0.18 : 1;
  const centre = {
    x: (bounds.minX + bounds.maxX) * 0.5,
    y: (bounds.minY + bounds.maxY) * 0.5,
  };
  const t = Number(now) || 0;
  sources.push({
    kind: 'swell',
    u: 0.5 + Math.sin(t * 0.00017) * 0.08,
    v: 0.5 + Math.cos(t * 0.00013) * 0.08,
    strength: (0.010 + Math.max(0, Math.min(1, Number(audio) || 0)) * 0.012) * strengthScale,
    radius: 0.38,
  });
  if (player && Number.isFinite(Number(player.x)) && Number.isFinite(Number(player.y))) {
    const dx = Math.max(bounds.minX - player.x, 0, player.x - bounds.maxX);
    const dy = Math.max(bounds.minY - player.y, 0, player.y - bounds.maxY);
    const dist = Math.hypot(dx, dy);
    if (dist <= 3.0) {
      const uv = waterUvForPoint(
        Math.max(bounds.minX, Math.min(bounds.maxX - 0.001, player.x)),
        Math.max(bounds.minY, Math.min(bounds.maxY - 0.001, player.y)),
        bounds,
      );
      sources.push({
        kind: 'proximity',
        u: uv.u,
        v: uv.v,
        strength: (0.045 * (1 - dist / 3.05)) * strengthScale,
        radius: 0.10,
      });
    }
  }
  if (ledger.seen && ledger.rippleSerial > 0) {
    sources.push({
      kind: 'beckon',
      u: 0.5 + Math.sin(ledger.rippleSerial * 1.7) * 0.16,
      v: 0.5 + Math.cos(ledger.rippleSerial * 1.1) * 0.12,
      strength: 0.16 * strengthScale,
      radius: 0.18,
      serial: ledger.rippleSerial,
      x: centre.x,
      y: centre.y,
    });
  }
  return sources.filter((source) => (
    Number.isFinite(source.u)
    && Number.isFinite(source.v)
    && Number.isFinite(source.strength)
    && Number.isFinite(source.radius)
  ));
}

export function recordNatatoriumWaterChoice(run, choice) {
  const next = { ...(run || {}) };
  const ledger = { ...(next.ledger || {}) };
  const water = normalizeNatatoriumWaterLedger(ledger.natatoriumWater);
  const normalizedChoice = typeof choice === 'string' ? choice : 'approach';
  const routeBias = normalizedChoice === 'record'
    ? NATATORIUM_WATER_BIASES.SURFACE
    : normalizedChoice === 'refuse'
      ? NATATORIUM_WATER_BIASES.INVERSION
      : NATATORIUM_WATER_BIASES.SEAL;
  ledger.natatoriumWater = {
    ...water,
    seen: true,
    choice: normalizedChoice,
    routeBias,
    rippleSerial: water.rippleSerial + 1,
  };
  next.ledger = ledger;
  return next;
}

export function natatoriumDefeatBattery(charge) {
  const before=Math.max(0,Number(charge)||0);
  const after=Math.max(0,before-1);
  return {before,after,lost:before-after,torchOff:after<=0};
}

export function recordNatatoriumDefeat(run,{batteryLost=0}={}) {
  const next={...(run||{})},ledger={...(next.ledger||{})};
  const water=normalizeNatatoriumWaterLedger(ledger.natatoriumWater);
  ledger.natatoriumWater={
    ...water,
    soaked:true,
    defeats:water.defeats+1,
    batteryLost:water.batteryLost+Math.max(0,Number(batteryLost)||0),
  };
  next.ledger=ledger;
  return next;
}

function replaceNatatoriumWaterText(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace('six metres of tile and no water', 'six metres of tile under black-green water')
    .replace('Six metres of tile, no water', 'Six metres of tile under black-green water')
    .replace('the empty pool', 'the water')
    .replace('The drained pool', 'The filled pool')
    .replace('a basin that has been dry since April', 'a basin that should have been dry since April')
    .replace('The basin remains empty.', 'The surface keeps moving after the tape stops.')
    .replace('A pool with no water is just a very clean room that is the wrong shape.', 'A pool with water it should not have is still a room that is the wrong shape.');
}

function mapNatatoriumText(value) {
  if (Array.isArray(value)) return value.map(mapNatatoriumText);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = key === 'text' ? replaceNatatoriumWaterText(child) : mapNatatoriumText(child);
  }
  return out;
}

export function applyNatatoriumWaterTextVariant(content, run = null) {
  if (!natatoriumWaterActive(run)) return content;
  return mapNatatoriumText(content);
}
