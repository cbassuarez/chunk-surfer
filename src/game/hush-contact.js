// HUSH contact direction and body-warning dialogue assembly.
//
// This module owns no world state, audio, DOM, canvas, saves, or visible copy.
// It receives an authored runtime tree and returns an ordinary conversation
// tree. Keeping the dice here makes the contact mix and the deliberately
// unstable answer meanings cheap to prove without booting the game.

export const HUSH_CONTACT_KIND = Object.freeze({
  HARD: 'hard',
  TAKEN: 'taken',
  BRUSH: 'brush',
});

export const HUSH_SENSATION_MODE = Object.freeze({
  PROXIMITY: 'proximity',
  BRUSH: 'brush',
});

export const HUSH_BRUSH_OUTCOME = Object.freeze({
  RELEASE: 'release',
  HARD: 'hard',
});

export const HUSH_CONTACT_LIMITS = Object.freeze({
  brushBaseChance: 0.25,
  brushDroughtChance: 0.50,
  brushDroughtRaiseAt: 3,
  brushDroughtForceAt: 4,
  brushMaxPerRun: 4,
  brushCooldownMs: 75_000,
  warningMaxPerRun: 3,
  warningCooldownMs: 120_000,
  warningArmPressure: 0.25,
  warningTriggerPressure: 0.45,
});

// Contact dialogue belongs to the instant in which the player has to decide
// whether the body sensation was real. It is incoherent when HUSH has been
// plainly charging through the centre of the frame. The broad rear hemisphere
// always qualifies; the slim side-surprise allowance is only a little tighter,
// but additionally requires a quiet approach with no prior warning.
export const HUSH_DIALOGUE_APPROACH = Object.freeze({
  behindDotMax: -0.08,
  surpriseDotMax: 0.30,
  surprisePriorityMax: 0.88,
});

const KINDS = new Set(Object.values(HUSH_CONTACT_KIND));
const OUTCOMES = new Set(Object.values(HUSH_BRUSH_OUTCOME));
const unit = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const whole = (value, max = 1_000_000) => Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));

export function classifyHushContactApproach({
  player = null,
  contact = null,
  forward = null,
  behaviorMode = 'stand',
  targetPriority = 0,
  warned = false,
  forced = false,
} = {}) {
  const px = Number(player?.x);
  const py = Number(player?.y);
  const hx = Number(contact?.x);
  const hy = Number(contact?.y);
  const fx = Number(forward?.x);
  const fy = Number(forward?.y);
  const distance = Math.hypot(hx - px, hy - py);
  const forwardLength = Math.hypot(fx, fy);
  if (![px, py, hx, hy, fx, fy].every(Number.isFinite) || distance < 1e-5 || forwardLength < 1e-5) {
    return Object.freeze({
      fromBehind: false,
      bySurprise: false,
      dialogueEligible: false,
      facingDot: 1,
    });
  }

  const facingDot = ((hx - px) / distance) * (fx / forwardLength)
    + ((hy - py) / distance) * (fy / forwardLength);
  const fromBehind = facingDot <= HUSH_DIALOGUE_APPROACH.behindDotMax;
  const mode = String(behaviorMode || 'stand');
  const bySurprise = !forced
    && !warned
    && Number(targetPriority || 0) < HUSH_DIALOGUE_APPROACH.surprisePriorityMax
    && mode !== 'chase'
    && mode !== 'listen'
    && facingDot <= HUSH_DIALOGUE_APPROACH.surpriseDotMax;
  return Object.freeze({
    fromBehind,
    bySurprise,
    dialogueEligible: !forced && (fromBehind || bySurprise),
    facingDot,
  });
}

export function freshHushContactDirectorState() {
  return {
    schema: 1,
    lastKind: null,
    eligibleSinceBrush: 0,
    brushesShown: 0,
    warningsShown: 0,
    recentContentIds: [],
  };
}

export function normalizeHushContactDirectorState(value = {}) {
  const base = freshHushContactDirectorState();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return base;
  return {
    schema: 1,
    lastKind: KINDS.has(value.lastKind) ? value.lastKind : null,
    eligibleSinceBrush: whole(value.eligibleSinceBrush, 99),
    brushesShown: whole(value.brushesShown, HUSH_CONTACT_LIMITS.brushMaxPerRun),
    warningsShown: whole(value.warningsShown, HUSH_CONTACT_LIMITS.warningMaxPerRun),
    recentContentIds: [...new Set((Array.isArray(value.recentContentIds) ? value.recentContentIds : [])
      .filter((id) => typeof id === 'string' && id.length <= 128))].slice(-18),
  };
}

export function normalizeHushContactContext(context = {}) {
  return {
    tutorial: !!context.tutorial,
    sourceSpace: !!context.sourceSpace,
    recording: !!context.recording,
    thoughtOpen: !!context.thoughtOpen,
    brushOpen: !!context.brushOpen,
    takeBreak: !!context.takeBreak,
    forceDirect: !!context.forceDirect,
    dialogueEligible: context.dialogueEligible !== false,
    takenEligible: context.takenEligible !== false,
    cooldownReady: context.cooldownReady !== false,
    state: normalizeHushContactDirectorState(context.state),
  };
}

function brushChanceFor(context = {}) {
  const ctx = normalizeHushContactContext(context);
  const state = ctx.state;
  const eligible = !ctx.tutorial
    && !ctx.sourceSpace
    && !ctx.recording
    && !ctx.thoughtOpen
    && !ctx.brushOpen
    && !ctx.takeBreak
    && !ctx.forceDirect
    && ctx.dialogueEligible
    && ctx.cooldownReady
    && state.lastKind !== HUSH_CONTACT_KIND.BRUSH
    && state.brushesShown < HUSH_CONTACT_LIMITS.brushMaxPerRun;
  if (!eligible) return { eligible: false, chance: 0 };
  if (state.eligibleSinceBrush >= HUSH_CONTACT_LIMITS.brushDroughtForceAt) return { eligible: true, chance: 1 };
  if (state.eligibleSinceBrush >= HUSH_CONTACT_LIMITS.brushDroughtRaiseAt) {
    return { eligible: true, chance: HUSH_CONTACT_LIMITS.brushDroughtChance };
  }
  return { eligible: true, chance: HUSH_CONTACT_LIMITS.brushBaseChance };
}

export function hushContactWeights(context = {}) {
  const ctx = normalizeHushContactContext(context);
  const brush = brushChanceFor(ctx);
  const remainder = 1 - brush.chance;
  const dialogueKindEligible = ctx.dialogueEligible && !ctx.forceDirect;
  return Object.freeze({
    brush: brush.chance,
    taken: dialogueKindEligible && ctx.takenEligible ? remainder * 0.5 : 0,
    hard: dialogueKindEligible && ctx.takenEligible ? remainder * 0.5 : remainder,
  });
}

function nextDirectorState(state, kind, brushEligible) {
  const next = normalizeHushContactDirectorState(state);
  next.lastKind = kind;
  if (kind === HUSH_CONTACT_KIND.BRUSH) {
    next.eligibleSinceBrush = 0;
    next.brushesShown = Math.min(HUSH_CONTACT_LIMITS.brushMaxPerRun, next.brushesShown + 1);
  } else if (brushEligible) {
    next.eligibleSinceBrush = Math.min(99, next.eligibleSinceBrush + 1);
  }
  return next;
}

export function chooseHushContactExperience(context = {}, options = {}) {
  const ctx = normalizeHushContactContext(context);
  const rng = typeof options.rng === 'function' ? options.rng : Math.random;
  const brush = brushChanceFor(ctx);
  const weights = hushContactWeights(ctx);
  const roll = unit(rng());
  let kind = HUSH_CONTACT_KIND.HARD;
  if (roll < weights.brush) kind = HUSH_CONTACT_KIND.BRUSH;
  else if (roll < weights.brush + weights.taken) kind = HUSH_CONTACT_KIND.TAKEN;
  return {
    kind,
    seed: Math.floor(unit(rng()) * 0x1_0000_0000) >>> 0,
    weights,
    state: nextDirectorState(ctx.state, kind, brush.eligible),
  };
}

export function updateHushWarningSchedule(schedule = {}, context = {}) {
  const state = normalizeHushContactDirectorState(context.state);
  const now = Math.max(0, Number(context.now) || 0);
  const pressure = unit(context.pressure);
  let armed = schedule.armed !== false;
  if (pressure < HUSH_CONTACT_LIMITS.warningArmPressure) armed = true;
  const eligible = armed
    && state.warningsShown < HUSH_CONTACT_LIMITS.warningMaxPerRun
    && now >= Math.max(0, Number(schedule.readyAt) || 0)
    && pressure > HUSH_CONTACT_LIMITS.warningTriggerPressure
    && Number(context.distance) > Number(context.recoilDistance)
    && !context.recording
    && !context.dialogueOpen
    && !context.sourceSpace
    && !context.tutorial;
  return {
    shouldOpen: !!eligible,
    armed: eligible ? false : armed,
    readyAt: eligible ? now + HUSH_CONTACT_LIMITS.warningCooldownMs : Math.max(0, Number(schedule.readyAt) || 0),
  };
}

// World lookup stays in main; ranking and presentation stay deterministic here
// so a remote note can be tested without booting WebGL or the floorplan. Each
// candidate is { id, point:{x,y}, occlusion, valid }.
export function chooseHushReleaseDestination({
  player = { x: 0, y: 0 },
  currentRoom = null,
  candidates = [],
  minimumDistance = 18,
  seed = 1,
} = {}) {
  const px = Number(player.x) || 0;
  const py = Number(player.y) || 0;
  const minimum = Math.max(0, Number(minimumDistance) || 0);
  const ranked = (Array.isArray(candidates) ? candidates : [])
    .filter((entry) => entry?.valid !== false && entry?.id !== currentRoom
      && Number.isFinite(Number(entry?.point?.x)) && Number.isFinite(Number(entry?.point?.y)))
    .map((entry) => ({
      ...entry,
      point: { x: Number(entry.point.x), y: Number(entry.point.y) },
      distance: Math.hypot(Number(entry.point.x) - px, Number(entry.point.y) - py),
      occlusion: Math.max(0, Number(entry.occlusion) || 0),
    }))
    .filter((entry) => entry.distance >= minimum)
    .sort((a, b) => (b.occlusion - a.occlusion)
      || (b.distance - a.distance)
      || String(a.id || '').localeCompare(String(b.id || '')));
  const occluded = ranked.filter((entry) => entry.occlusion >= 6);
  const preferred = (occluded.length ? occluded : ranked).slice(0, 2);
  return preferred.length ? preferred[(Number(seed) >>> 0) % preferred.length] : null;
}

export function buildHushReleaseNote({
  target,
  player = { x: 0, y: 0 },
  right = { x: 1, y: 0 },
  seed = 1,
} = {}) {
  if (!target?.point) return null;
  const dx = Number(target.point.x) - (Number(player.x) || 0);
  const dy = Number(target.point.y) - (Number(player.y) || 0);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const pan = Math.max(-0.92, Math.min(0.92,
    (dx * (Number(right.x) || 0) + dy * (Number(right.y) || 0)) / distance));
  const occlusion = Math.max(0, Number(target.occlusion) || 0);
  const cueId = `violin.mischief.${String(1 + ((Number(seed) >>> 0) % 3)).padStart(2, '0')}`;
  return {
    cueId,
    audio: {
      gainScale: Math.max(0.16, Math.min(0.42, 28 / distance)),
      pan,
      lowpassHz: Math.max(420, 1800 - occlusion * 42),
      skipEffects: true,
    },
    event: {
      kind: 'hush_brush_release_note',
      level: 0.12,
      source: { kind: 'hush', id: cueId },
      semantics: {
        playerGenerated: false,
        deliberate: true,
        audibleToHush: false,
        audibleToMonitor: true,
        audibleInWorld: true,
        canBeMimicked: false,
        canSpoilTake: false,
        family: 'instrument',
        tags: ['hush', 'elsewhere'],
      },
      provenance: { system: 'hush-contact', cueId, roomId: target.id || null },
    },
    caption: '[a single note, elsewhere]',
  };
}

function seeded(seed = 1) {
  let state = (Number(seed) || 1) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function shuffled(values, rng) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(unit(rng()) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function chooseOne(values, rng) {
  if (!values.length) return null;
  return values[Math.min(values.length - 1, Math.floor(unit(rng()) * values.length))];
}

function sourceId(value = {}) { return String(value.sourceId || value.id || ''); }
function linesByRole(node, role) { return (node?.lines || []).filter((line) => line.hushRole === role); }

function preferUnseen(pool, recent) {
  const unseen = pool.filter((item) => !recent.has(sourceId(item)));
  return unseen.length ? unseen : pool;
}

function responseLines(authoredTree, choice, role, rng) {
  const response = authoredTree?.[choice.goto];
  const candidates = linesByRole(response, role);
  if (!candidates.length) throw new Error(`HUSH response ${choice.goto || '(missing)'} has no ${role} line`);
  const selected = chooseOne(candidates, rng);
  const line = { ...selected };
  delete line.hushRole;
  return [line];
}

export function buildHushSensationTree({
  mode = HUSH_SENSATION_MODE.PROXIMITY,
  authoredTree,
  seed = 1,
  recentContentIds = [],
} = {}) {
  if (!authoredTree?.start) throw new Error('HUSH authored catalogue requires a start node');
  const actualMode = mode === HUSH_SENSATION_MODE.BRUSH ? mode : HUSH_SENSATION_MODE.PROXIMITY;
  const rng = seeded(seed);
  const recent = new Set(Array.isArray(recentContentIds) ? recentContentIds : []);
  const openers = linesByRole(authoredTree.start, 'opener');
  const frames = linesByRole(authoredTree.start, 'frame');
  const choicePool = authoredTree.start.choices || [];
  if (openers.length < 8 || frames.length < 6 || choicePool.length < 12) {
    throw new Error('HUSH authored catalogue is incomplete');
  }

  const opener = chooseOne(preferUnseen(openers, recent), rng);
  const frame = chooseOne(preferUnseen(frames, recent), rng);
  const total = rng() < 0.5 ? 3 : 4;
  const availableChoices = preferUnseen(choicePool, recent);
  const selected = shuffled(availableChoices, rng).slice(0, total);
  if (selected.length < total) {
    const used = new Set(selected.map(sourceId));
    selected.push(...shuffled(choicePool.filter((choice) => !used.has(sourceId(choice))), rng).slice(0, total - selected.length));
  }
  const displayed = shuffled(selected, rng);
  const savingCount = actualMode === HUSH_SENSATION_MODE.BRUSH
    ? (total === 3 ? 1 : (rng() < 0.5 ? 1 : 2))
    : 0;
  const savingIndexes = new Set(shuffled(displayed.map((_, index) => index), rng).slice(0, savingCount));
  const nodes = {};
  const choices = displayed.map((choice, index) => {
    const outcome = savingIndexes.has(index) ? HUSH_BRUSH_OUTCOME.RELEASE : HUSH_BRUSH_OUTCOME.HARD;
    const responseRole = actualMode === HUSH_SENSATION_MODE.PROXIMITY ? 'proximity' : outcome;
    const goto = `response-${index}`;
    nodes[goto] = {
      speaker: '',
      lines: responseLines(authoredTree, choice, responseRole, rng),
    };
    const runtimeChoice = {
      ...choice,
      goto,
      hushChoiceId: sourceId(choice),
    };
    // Proximity thoughts are only thoughts. Giving their answers even a hidden
    // failure value makes diagnostics imply a transaction which does not exist.
    // Mechanical outcomes are attached after shuffling only for an actual
    // brush attempt.
    if (actualMode === HUSH_SENSATION_MODE.BRUSH) runtimeChoice.hushOutcome = outcome;
    return runtimeChoice;
  });
  const cleanLine = (line) => {
    const out = { ...line };
    delete out.hushRole;
    return out;
  };
  const usedContentIds = [sourceId(opener), sourceId(frame), ...displayed.map(sourceId)].filter(Boolean);
  return {
    tree: {
      start: {
        speaker: '',
        lines: [cleanLine(opener), cleanLine(frame)],
        choices,
      },
      ...nodes,
    },
    usedContentIds,
    choiceCount: total,
    savingCount,
  };
}

export function resolveHushSensationChoice(choice) {
  return {
    outcome: OUTCOMES.has(choice?.hushOutcome) ? choice.hushOutcome : HUSH_BRUSH_OUTCOME.HARD,
    choiceId: String(choice?.hushChoiceId || choice?.sourceId || 'unknown'),
  };
}

export function rememberHushContent(state, ids = []) {
  const next = normalizeHushContactDirectorState(state);
  // A generated thought consumes at most six catalogue IDs (opener, frame,
  // four answers). Twelve therefore retains the complete previous two scenes,
  // rather than accidentally forgetting the first scene's opener and frame.
  next.recentContentIds = [...new Set([...next.recentContentIds, ...(Array.isArray(ids) ? ids : [])])].slice(-12);
  return next;
}

export function noteHushWarningShown(state, ids = []) {
  const next = rememberHushContent(state, ids);
  next.warningsShown = Math.min(HUSH_CONTACT_LIMITS.warningMaxPerRun, next.warningsShown + 1);
  return next;
}
