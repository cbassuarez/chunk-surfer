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

export const STAIR_ANOMALY_DARK_ESCAPE_MS = 20_000;

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
  stairId: 'basement',
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
  // ALWAYS THE WEST STAIR, ALWAYS THE CLIMB OUT OF THE BASEMENT.
  //
  // Two rules, and the variant only chooses the atmosphere between them.
  //
  //   NOT THE SPIRAL. The main open-well stair is a helix — every flight sweeps
  //   180 degrees around the well (see MAIN_STAIR_GEOMETRY). A helix that goes
  //   on too long reads as a camera stuck in a turn, not as a building that has
  //   grown; you lose your bearings on the second revolution and after that the
  //   length means nothing. A straight flight can be impossibly long and STILL
  //   be legible as a straight flight, which is the whole effect.
  //
  //   NOT THE DESCENT. The way down to the basement is the route to studio B3 —
  //   the first room on the order, walked before the player has done anything —
  //   and an impossible stair there reads as the game being broken rather than
  //   the building being wrong. So the seal variant's atmosphere stays wrong on
  //   the way out; only its geometry honours the ascent you chose.
  const on = (variant) => ({ stairId: 'basement', travel: 'up', visualSlope: 'up', variant, seed });
  if (routeTrunk === 'flooded-seal') return on(STAIR_ANOMALY_VARIANT.SEAL);
  if (routeTrunk === 'flooded-surface') return on(STAIR_ANOMALY_VARIANT.SURFACE);
  if (routeTrunk === 'dry-inversion') return on(STAIR_ANOMALY_VARIANT.INVERSION);
  if (routeTrunk === 'uncertain') return on(STAIR_ANOMALY_VARIANT.UNCERTAIN);
  return { ...DEFAULT_STAIR_ANOMALY_ENVIRONMENT, seed };
}

export function normalizeStairAnomalyEnvironment(value, fallback = DEFAULT_STAIR_ANOMALY_ENVIRONMENT) {
  const source = objectOr(value);
  const base = objectOr(fallback, DEFAULT_STAIR_ANOMALY_ENVIRONMENT);
  // 'upper' — the spiral — is still accepted as a stored value so an old save
  // parses, but it is migrated rather than honoured: see the note in
  // decideStairAnomalyEnvironment for why the helix cannot carry this.
  const stored = VALID_STAIRS.has(source.stairId) ? source.stairId : base.stairId;
  const stairId = stored === 'upper' ? 'basement' : stored;
  const travel = VALID_TRAVEL.has(source.travel) ? source.travel : base.travel;
  // The anomaly can make a flight impossibly long; it cannot contradict the
  // direction the player chose at its threshold. This also repairs old saves
  // whose inversion variants persisted an opposing visual slope.
  const visualSlope = travel;
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
