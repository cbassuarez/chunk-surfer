export const STAIR_ANOMALY_STATUS = Object.freeze({
  ARMED: 'armed',
  ACTIVE: 'active',
  COMPLETED: 'completed',
});

export const STAIR_ANOMALY_VARIANT = Object.freeze({
  BASELINE: 'baseline',
  SEAL: 'flooded-seal',
  SURFACE: 'flooded-surface',
  INVERSION: 'dry-inversion',
  UNCERTAIN: 'uncertain',
});

export const STAIR_ANOMALY_STAGE = Object.freeze({
  COMMITMENT: 0,
  REPETITION: 1,
  SHADOW: 2,
  RESOLUTION: 3,
  COMPLETE: 4,
});

const VALID_STAIRS = new Set(['upper', 'basement']);
const VALID_TRAVEL = new Set(['up', 'down']);
const VALID_VARIANTS = new Set(Object.values(STAIR_ANOMALY_VARIANT));
const VALID_STATUS = new Set(Object.values(STAIR_ANOMALY_STATUS));

const objectOr = (value, fallback = {}) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : fallback
);

export function stairAnomalyHash(value) {
  const source = String(value || '');
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

export const DEFAULT_STAIR_ANOMALY_ENVIRONMENT = Object.freeze({
  stairId: 'upper',
  travel: 'up',
  visualSlope: 'up',
  variant: STAIR_ANOMALY_VARIANT.BASELINE,
  seed: 4417,
});

export const FRESH_STAIR_ANOMALY_LEDGER = Object.freeze({
  status: STAIR_ANOMALY_STATUS.ARMED,
  stage: STAIR_ANOMALY_STAGE.COMMITMENT,
  progress: 0,
  checkpoint: 0,
});

export const LEGACY_STAIR_ANOMALY_LEDGER = Object.freeze({
  status: STAIR_ANOMALY_STATUS.COMPLETED,
  stage: STAIR_ANOMALY_STAGE.COMPLETE,
  progress: 1,
  checkpoint: STAIR_ANOMALY_STAGE.COMPLETE,
});

export function decideStairAnomalyEnvironment({ routeTrunk = 'baseline', runId = '', now = 0 } = {}) {
  const seed = stairAnomalyHash(`${runId}:${now}:stair-anomaly`) || 4417;
  if (routeTrunk === 'flooded-seal') {
    return { stairId: 'basement', travel: 'down', visualSlope: 'down', variant: STAIR_ANOMALY_VARIANT.SEAL, seed };
  }
  if (routeTrunk === 'flooded-surface') {
    return { stairId: 'basement', travel: 'up', visualSlope: 'up', variant: STAIR_ANOMALY_VARIANT.SURFACE, seed };
  }
  if (routeTrunk === 'dry-inversion') {
    return { stairId: 'upper', travel: 'up', visualSlope: 'down', variant: STAIR_ANOMALY_VARIANT.INVERSION, seed };
  }
  if (routeTrunk === 'uncertain') {
    const basement = (seed & 1) === 1;
    return {
      stairId: basement ? 'basement' : 'upper',
      travel: basement ? 'down' : 'up',
      visualSlope: basement ? 'down' : 'up',
      variant: STAIR_ANOMALY_VARIANT.UNCERTAIN,
      seed,
    };
  }
  return { ...DEFAULT_STAIR_ANOMALY_ENVIRONMENT, seed };
}

export function normalizeStairAnomalyEnvironment(value, fallback = DEFAULT_STAIR_ANOMALY_ENVIRONMENT) {
  const source = objectOr(value);
  const base = objectOr(fallback, DEFAULT_STAIR_ANOMALY_ENVIRONMENT);
  const stairId = VALID_STAIRS.has(source.stairId) ? source.stairId : base.stairId;
  const travel = VALID_TRAVEL.has(source.travel) ? source.travel : base.travel;
  const visualSlope = VALID_TRAVEL.has(source.visualSlope) ? source.visualSlope : base.visualSlope;
  const variant = VALID_VARIANTS.has(source.variant) ? source.variant : base.variant;
  const seed = Math.max(1, Math.floor(Number(source.seed) || Number(base.seed) || 4417)) >>> 0;
  return { stairId, travel, visualSlope, variant, seed };
}

export function freshStairAnomalyLedger() {
  return { ...FRESH_STAIR_ANOMALY_LEDGER };
}

export function normalizeStairAnomalyLedger(value, { missing = 'completed' } = {}) {
  if (!value || typeof value !== 'object') {
    return missing === 'armed' ? freshStairAnomalyLedger() : { ...LEGACY_STAIR_ANOMALY_LEDGER };
  }
  const source = value;
  const status = VALID_STATUS.has(source.status) ? source.status : STAIR_ANOMALY_STATUS.COMPLETED;
  const stage = Math.max(0, Math.min(STAIR_ANOMALY_STAGE.COMPLETE, Math.floor(Number(source.stage) || 0)));
  const progress = Math.max(0, Math.min(1, Number(source.progress) || 0));
  const checkpoint = Math.max(0, Math.min(STAIR_ANOMALY_STAGE.COMPLETE, Math.floor(Number(source.checkpoint) || 0)));
  if (status === STAIR_ANOMALY_STATUS.COMPLETED) return { ...LEGACY_STAIR_ANOMALY_LEDGER };
  if (status === STAIR_ANOMALY_STATUS.ARMED) return freshStairAnomalyLedger();
  return { status, stage: Math.max(stage, checkpoint), progress, checkpoint: Math.min(checkpoint, stage) };
}

export function reduceStairAnomaly(value, event = {}) {
  const current = normalizeStairAnomalyLedger(value, { missing: 'armed' });
  switch (event.type) {
    case 'ENTER':
      if (current.status !== STAIR_ANOMALY_STATUS.ARMED) return current;
      return { status: STAIR_ANOMALY_STATUS.ACTIVE, stage: 0, progress: 0, checkpoint: 0 };
    case 'ADVANCE': {
      if (current.status !== STAIR_ANOMALY_STATUS.ACTIVE) return current;
      const progress = Math.max(current.progress, Math.min(1, Number(event.progress) || 0));
      const stage = Math.max(current.stage, Math.min(3, Math.floor(Number(event.stage) || 0)));
      const checkpoint = event.checkpoint
        ? Math.max(current.checkpoint, stage)
        : current.checkpoint;
      return { ...current, progress, stage, checkpoint };
    }
    case 'RESUME':
      if (current.status !== STAIR_ANOMALY_STATUS.ACTIVE) return current;
      return { ...current, stage: current.checkpoint, progress: Math.max(current.progress, current.checkpoint / 4) };
    case 'COMPLETE':
      if (current.status !== STAIR_ANOMALY_STATUS.ACTIVE) return current;
      return { ...LEGACY_STAIR_ANOMALY_LEDGER };
    default:
      return current;
  }
}

export function stairAnomalyTriggerMatches(environment, { stairId, travel } = {}) {
  const selected = normalizeStairAnomalyEnvironment(environment);
  return selected.stairId === stairId && selected.travel === travel;
}
