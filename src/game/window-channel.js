import { PARRY_IMPACT_SECONDS } from './combat-parry.js';

// The haunted desktop is authored with the fight. It is not a random diagnostic
// window and it is not allowed to infer new facts about the player. These five
// profiles are the complete story-combat cast; the loading-bay drill and the
// optional practice-room ambush deliberately stay on their existing paths.
export const WINDOW_CHANNEL_BATTLE_IDS = Object.freeze([
  'natatorium',
  'hall',
  'practice',
  'chapel',
  'source-final',
]);

export const WINDOW_CHANNEL_RESULT = Object.freeze({
  CUT: 'cut',
  RETURN: 'return',
  TIMEOUT: 'timeout',
  CANCEL: 'cancel',
  SKIP: 'skip',
});

const STRUCK_KINDS = new Set(['broadcast', 'overload', 'loop']);
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

const SCENE = Object.freeze({
  natatorium: Object.freeze({
    title: 'NATATORIUM / BLACK-WATER RETURN',
    palette: ['#071416', '#78beb8', '#cbd8c0', '#171f21'],
    motifs: ['waterline', 'reflection', 'tape', 'held-take'],
    movements: Object.freeze({
      room: Object.freeze({ channels: 1, aperture: 'pool-reflection', caption: 'THE EMPTY ROOM IS UNDER THE GLASS', layout: [0.05, 0.29, 0.90, 0.46], attack: [0.02, 0.48, 0.78, 0.42] }),
      voice: Object.freeze({ channels: 2, aperture: 'pool-reflection', caption: 'THE VOICE COMES BACK BELOW ITS MOUTH', layout: [0.07, 0.22, 0.76, 0.58], attack: [0.20, 0.39, 0.76, 0.50] }),
      hold: Object.freeze({ channels: 3, aperture: 'undertow', caption: 'THE FOURTH TAKE HOLDS THE WINDOW DOWN', layout: [0.12, 0.34, 0.72, 0.54], attack: [0.03, 0.55, 0.66, 0.38] }),
    }),
  }),
  hall: Object.freeze({
    title: 'CONCERT HALL / HOUSE RETURN',
    palette: ['#120d0b', '#b68656', '#d4be8c', '#2c1512'],
    motifs: ['seating-tier', 'watching-heads', 'empty-seat', 'applause'],
    movements: Object.freeze({
      seated: Object.freeze({ channels: 1, aperture: 'proscenium', caption: 'THE HOUSE IS ALREADY LOOKING THIS WAY', layout: [0.13, 0.08, 0.74, 0.82], attack: [0.28, 0.10, 0.68, 0.80] }),
      attention: Object.freeze({ channels: 2, aperture: 'missing-seat', caption: 'EVERY HEAD TURNS ACROSS THE BEZELS', layout: [0.08, 0.06, 0.70, 0.86], attack: [0.01, 0.12, 0.62, 0.78] }),
      applause: Object.freeze({ channels: 3, aperture: 'standing-house', caption: 'THE APPLAUSE ARRIVES FROM ALL SIDES', layout: [0.18, 0.10, 0.78, 0.78], attack: [0.30, 0.04, 0.66, 0.84] }),
    }),
  }),
  practice: Object.freeze({
    title: 'PRACTICE RANGE / SCORE RETURN',
    palette: ['#0b0c0a', '#9fa77c', '#d8d4af', '#251d17'],
    motifs: ['wrong-instrument', 'music-stand', 'empty-chair', 'cross-window-score'],
    movements: Object.freeze({
      instrument: Object.freeze({ channels: 1, aperture: 'music-stand', caption: 'THE WRONG PART IS OPEN ON THE STAND', layout: [0.16, 0.08, 0.70, 0.84], attack: [0.06, 0.18, 0.62, 0.76] }),
      player: Object.freeze({ channels: 2, aperture: 'empty-chair', caption: 'THE ABSENT PLAYER CROSSES THE FRAME', layout: [0.08, 0.12, 0.76, 0.76], attack: [0.32, 0.08, 0.62, 0.82] }),
      score: Object.freeze({ channels: 3, aperture: 'score-line', caption: 'THE SCORE CONTINUES IN THE NEXT WINDOW', layout: [0.12, 0.20, 0.82, 0.62], attack: [0.03, 0.34, 0.72, 0.54] }),
    }),
  }),
  chapel: Object.freeze({
    title: 'CHAPEL / CONTESTED HANDOFF',
    palette: ['#090708', '#9b6e64', '#d4bcb0', '#241017'],
    motifs: ['nave', 'lancet', 'contract-clause', 'recordist', 'source'],
    movements: Object.freeze({
      room: Object.freeze({ channels: 1, aperture: 'lancet', caption: 'THE ROOM WRITES A BODY INTO ITS NAVE', layout: [0.20, 0.08, 0.60, 0.84], attack: [0.31, 0.06, 0.54, 0.86] }),
      recordist: Object.freeze({ channels: 2, aperture: 'borrowed-body', caption: 'THE PREVIOUS RECORDIST OCCUPIES ANOTHER PANE', layout: [0.12, 0.07, 0.64, 0.85], attack: [0.04, 0.16, 0.58, 0.76] }),
      surfer: Object.freeze({ channels: 2, aperture: 'surfer-print', caption: 'THE WORD SURFER WILL NOT STAY IN ONE FRAME', layout: [0.22, 0.10, 0.66, 0.80], attack: [0.36, 0.08, 0.56, 0.82] }),
      contract: Object.freeze({ channels: 3, aperture: 'contract', caption: 'THE CLAUSE CONTINUES WHERE THE WINDOW ENDS', layout: [0.16, 0.12, 0.66, 0.76], attack: [0.03, 0.24, 0.58, 0.66] }),
      source: Object.freeze({ channels: 3, aperture: 'source-mouth', caption: 'THE SOURCE PRESSES THROUGH EVERY RETURN', layout: [0.24, 0.08, 0.62, 0.84], attack: [0.38, 0.04, 0.56, 0.88] }),
    }),
  }),
  'source-final': Object.freeze({
    title: 'SOURCE / RETURN VALUE',
    palette: ['#05070b', '#7889ad', '#d1d7e4', '#141527'],
    motifs: ['call-site', 'recursive-frame', 'borrowed-body', 'final-clause'],
    movements: Object.freeze({
      'call-site': Object.freeze({ channels: 2, aperture: 'call-site', caption: 'THE CALL ORIGINATES OUTSIDE ITS OWN FRAME', layout: [0.10, 0.12, 0.80, 0.76], attack: [0.02, 0.20, 0.62, 0.68] }),
      'borrowed-body': Object.freeze({ channels: 3, aperture: 'recursive-body', caption: 'THE BODY RETURNS AT THREE ADDRESSES', layout: [0.18, 0.10, 0.68, 0.80], attack: [0.32, 0.06, 0.58, 0.86] }),
      'final-clause': Object.freeze({ channels: 3, aperture: 'final-clause', caption: 'THE RETURN VALUE IS STILL SPEAKING', layout: [0.10, 0.16, 0.72, 0.70], attack: [0.38, 0.12, 0.54, 0.76] }),
    }),
  }),
});

export function canonicalWindowChannelBattleId(value = '') {
  const id = String(value || '').toLowerCase();
  if (id === 'source' || id === 'source-final') return 'source-final';
  return WINDOW_CHANNEL_BATTLE_IDS.includes(id) ? id : null;
}

function geometry(values) {
  const [x, y, width, height] = values;
  return Object.freeze({ x, y, width, height });
}

export function windowChannelDeadlineMs({ battleId = '', movementIndex = 0, windowScale = 1 } = {}) {
  const firstLesson = canonicalWindowChannelBattleId(battleId) === 'natatorium' && Number(movementIndex) === 0;
  const base = firstLesson ? 7000 : 5000;
  return Math.round(base * clamp(windowScale, 0.7, 1.6));
}

// Window cutting and the ordinary parry share one phrase. The desktop portion
// consumes the same fraction of the combat approach that it consumed of its own
// assistance-scaled deadline; timing out spends the phrase completely.
export function channelElapsedToParrySeconds(elapsedMs, deadlineMs) {
  const ratio = clamp(elapsedMs / Math.max(1, Number(deadlineMs) || 1), 0, 1);
  return ratio * PARRY_IMPACT_SECONDS;
}

export function compileWindowChannelScene({
  battleId = '', movementId = '', movementIndex = 0, movementTitle = '',
  intentId = '', intentLabel = '', intentKind = '', windowScale = 1,
} = {}) {
  const canonical = canonicalWindowChannelBattleId(battleId);
  const battle = canonical ? SCENE[canonical] : null;
  const movement = battle?.movements?.[String(movementId || '')] || null;
  if (!battle || !movement || !STRUCK_KINDS.has(String(intentKind || ''))) return null;
  const deadlineMs = windowChannelDeadlineMs({ battleId: canonical, movementIndex, windowScale });
  return Object.freeze({
    schema: 1,
    battleId: canonical,
    movementId: String(movementId),
    movementIndex: Math.max(0, Math.floor(Number(movementIndex) || 0)),
    movementTitle: String(movementTitle || movementId).slice(0, 64),
    intentId: String(intentId || '').slice(0, 64),
    intentLabel: String(intentLabel || '').slice(0, 96),
    intentKind: String(intentKind),
    title: battle.title,
    caption: movement.caption,
    palette: Object.freeze([...battle.palette]),
    motifs: Object.freeze([...battle.motifs]),
    aperture: movement.aperture,
    channelCount: Math.max(1, Math.min(3, movement.channels)),
    layout: geometry(movement.layout),
    attackLayout: geometry(movement.attack),
    deadlineMs,
    phase: 'attack',
    timing: Object.freeze({ deadlineMs, windowScale: clamp(windowScale, 0.7, 1.6) }),
    resolution: null,
    firstLesson: canonical === 'natatorium' && Number(movementIndex) === 0,
    returnEligible: canonical !== 'natatorium',
  });
}

export function advanceWindowChannelScene(scene, {
  phase = 'impact', outcome = '', parried = false, damage = 0,
  returnTier = 0, returnHits = 0, phaseBreak = false,
} = {}) {
  if (!validateWindowChannelScene(scene)) return null;
  const safePhase = [
    'attack', 'cut', 'reacquire', 'impact', 'parry', 'damage',
    'return', 'phase-break', 'restored',
  ].includes(phase) ? phase : 'impact';
  return Object.freeze({
    ...scene,
    phase: safePhase,
    resolution: Object.freeze({
      outcome: String(outcome || '').slice(0, 24),
      parried: !!parried,
      damage: Math.max(0, Math.floor(Number(damage) || 0)),
      returnTier: returnTier >= 3 ? 3 : returnTier >= 2 ? 2 : 0,
      returnHits: Math.max(0, Math.min(2, Math.floor(Number(returnHits) || 0))),
      phaseBreak: !!phaseBreak,
    }),
  });
}

export function movementWindowTableau({ battleId = '', movementId = '' } = {}) {
  const canonical = canonicalWindowChannelBattleId(battleId);
  const battle = canonical ? SCENE[canonical] : null;
  const movement = battle?.movements?.[String(movementId || '')] || null;
  if (!battle || !movement) return null;
  return Object.freeze({
    schema: 1,
    battleId: canonical,
    movementId: String(movementId),
    title: battle.title,
    caption: movement.caption,
    palette: Object.freeze([...battle.palette]),
    motifs: Object.freeze([...battle.motifs]),
    aperture: movement.aperture,
    layout: geometry(movement.layout),
  });
}

export function freshWindowChannelProgress(battleId = '', raw = {}) {
  const canonical = canonicalWindowChannelBattleId(battleId);
  const rawBattle = canonicalWindowChannelBattleId(raw?.battleId);
  const canRestore = !!canonical && rawBattle === canonical;
  return {
    battleId: canonical,
    charge: canRestore ? Math.max(0, Math.min(3, Math.floor(Number(raw?.charge) || 0))) : 0,
    returned: canRestore && !!raw?.returned,
  };
}

export function chargeWindowReturn(progress, { defended = false } = {}) {
  const next = freshWindowChannelProgress(progress?.battleId, progress);
  if (!defended || !next.battleId || next.battleId === 'natatorium' || next.returned) return next;
  next.charge = Math.min(3, next.charge + 1);
  return next;
}

export function availableWindowReturnTier(progress) {
  const state = freshWindowChannelProgress(progress?.battleId, progress);
  if (state.returned || state.battleId === 'natatorium' || state.charge < 2) return 0;
  return state.charge >= 3 ? 3 : 2;
}

export function spendWindowReturn(progress) {
  const next = freshWindowChannelProgress(progress?.battleId, progress);
  const tier = availableWindowReturnTier(next);
  if (!tier) return { state: next, tier: 0, hits: 0 };
  next.returned = true;
  return { state: next, tier, hits: tier === 3 ? 2 : 1 };
}

export function validateWindowChannelScene(value) {
  return !!value
    && value.schema === 1
    && WINDOW_CHANNEL_BATTLE_IDS.includes(value.battleId)
    && Number.isInteger(value.channelCount)
    && value.channelCount >= 1
    && value.channelCount <= 3
    && Array.isArray(value.palette)
    && value.palette.length === 4
    && Array.isArray(value.motifs)
    && value.motifs.length >= 3
    && ['layout', 'attackLayout'].every((field) => ['x', 'y', 'width', 'height'].every((key) => (
      Number.isFinite(value[field]?.[key]) && value[field][key] >= 0 && value[field][key] <= 1
    )));
}
