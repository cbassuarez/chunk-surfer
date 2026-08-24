// The get-in has two lives: an ordinary load-out room and one impossible
// return.  The scare is deliberately driven by space, not time: a load, warp,
// or debug placement can never accidentally become an authored threshold.
//
// WHY EVERYTHING IN HERE IS STILL CALLED `dock`.
//
// This room used to be the loading dock, which it never was — it is sealed, and
// no lorry has ever been in it. The real loading bay is now authored outside it,
// past the grey door, and this room is presented as the Scene Dock.
//
// The identifiers did not follow, on purpose. `dock-foyer-service`,
// `dock.departed`, the `dockHaunting` save key and every `dock-*` prop id are
// written into player saves — they are a wire format, not prose. Renaming them
// buys a nicer grep and costs a migration for every existing run. So the file
// name and the player-facing labels say Scene Dock, the persisted strings say dock,
// and everything genuinely belonging to the new bay outside is prefixed `bay-`.
// If you are reading a `dock` string here, it means this room.

export const DOCK_PORTAL = Object.freeze({
  FOYER: 'dock-foyer-service',
  SERVICE: 'dock-inner-service',
});

export const DOCK_HAUNTING_VARIANT = Object.freeze({
  WEST_DESK: 'west-desk',
  NORTH_CAGE: 'north-cage',
});

export const DOCK_HAUNTING_STATUS = Object.freeze({
  IDLE: 'idle',
  ACTIVE: 'active',
  RESOLVED: 'resolved',
});

export const DOCK_ACOUSTIC_PROP_IDS = Object.freeze([
  'dock-road-case',
  'dock-cable-reel',
  'dock-shutter-bar',
]);

export const DOCK_HERO_PROP_IDS = Object.freeze([
  'dock-work-order-clipboard',
  'dock-desk-1',
  'dock-crew-board',
  'acq-maintenance-searchlight-dock',
  'dock-hand-truck',
  'dock-freight-crates',
  'dock-road-case',
  'dock-cable-reel',
  'dock-shutter-bar',
  'dock-chandelier-frame',
]);

export const DOCK_HAUNTING_PRESSURE = Object.freeze({
  outerMeters: 9,
  contactMeters: .55,
});

// These are crossed once, persisted, and never replayed after a reload.  The
// first two are isolated; the close milestones overlap into a small swarm.
export const DOCK_HAUNTING_MILESTONES = Object.freeze([.08, .25, .43, .59, .73, .84, .92, .975]);

const RETURN_PORTALS = new Set(Object.values(DOCK_PORTAL));
const EFFECTS = new Set(['full', 'reduced', 'off']);
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function isDockReturnPortal(id) {
  return RETURN_PORTALS.has(String(id || ''));
}

export function normalizeDockEffects(value) {
  const id = String(value || 'full').toLowerCase();
  return EFFECTS.has(id) ? id : 'full';
}

export function dockVariantFor({ entryPortal = null } = {}) {
  return entryPortal === DOCK_PORTAL.FOYER
    ? DOCK_HAUNTING_VARIANT.WEST_DESK
    : DOCK_HAUNTING_VARIANT.NORTH_CAGE;
}

export function dockHauntingStaging({ entryPortal = null, variant = null } = {}) {
  const selected = Object.values(DOCK_HAUNTING_VARIANT).includes(variant)
    ? variant
    : dockVariantFor({ entryPortal });
  return selected === DOCK_HAUNTING_VARIANT.WEST_DESK
    ? { variant: selected, x: 59, y: 5.6, yaw: Math.PI / 2, concealment: 'west signing desk and searchlight' }
    : { variant: selected, x: 69, y: 5.55, yaw: Math.PI, concealment: 'north side of the chandelier cage' };
}

export const DOCK_HAUNTING_GUIDANCE_ID = 'story:hush-compliance';
export const DOCK_HAUNTING_ACTION_LABEL = 'COME CLOSER';

const DOCK_GUIDANCE_OFFSETS = Object.freeze({
  [DOCK_HAUNTING_VARIANT.WEST_DESK]: Object.freeze([
    Object.freeze({ x: 0, y: 0 }), Object.freeze({ x: 1, y: 0 }),
    Object.freeze({ x: 0, y: 1 }), Object.freeze({ x: .5, y: -.5 }),
    Object.freeze({ x: 0, y: 0 }),
  ]),
  [DOCK_HAUNTING_VARIANT.NORTH_CAGE]: Object.freeze([
    Object.freeze({ x: 0, y: 0 }), Object.freeze({ x: -1, y: 0 }),
    Object.freeze({ x: .5, y: .5 }), Object.freeze({ x: 1, y: 0 }),
    Object.freeze({ x: 0, y: 0 }),
  ]),
});

const dockGuidanceSeed = (value) => {
  let hash = 2166136261;
  for (const char of String(value || 'run')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

// An authored lure, never a read of HUSH's general simulation position. The
// marker is allowed to lie by one nearby cell because the thing in the room is
// issuing the command; collision/contact continue to use the real staged body.
export function dockHauntingGuidance({
  active = false,
  staging = null,
  pressure = 0,
  nowMs = 0,
  runId = 'run',
  effects = 'full',
} = {}) {
  if (!active || !staging || !Number.isFinite(Number(staging.x)) || !Number.isFinite(Number(staging.y))) return null;
  const mode = normalizeDockEffects(effects);
  const variant = Object.values(DOCK_HAUNTING_VARIANT).includes(staging.variant)
    ? staging.variant
    : DOCK_HAUNTING_VARIANT.NORTH_CAGE;
  const offsets = DOCK_GUIDANCE_OFFSETS[variant];
  const seed = dockGuidanceSeed(`${runId}:${variant}`);
  const cadence = mode === 'full' ? 430 : 760;
  const phase = mode === 'off' ? 0 : (Math.floor(Math.max(0, finite(nowMs)) / cadence) + seed) % offsets.length;
  const offset = mode === 'off' ? offsets[0] : offsets[phase];
  const labels = mode === 'off'
    ? [`[ ${DOCK_HAUNTING_ACTION_LABEL} ]`]
    : [DOCK_HAUNTING_ACTION_LABEL, 'COME CLOS—', ' ', 'COME  CLOSER', DOCK_HAUNTING_ACTION_LABEL];
  return Object.freeze({
    id: DOCK_HAUNTING_GUIDANCE_ID,
    label: labels[phase % labels.length],
    coordinateSpace: 'authored',
    authored: Object.freeze({ x: Number(staging.x) + offset.x, y: Number(staging.y) + offset.y }),
    kind: 'hush-lure',
    required: true,
    corrupted: true,
    glitchPhase: phase,
    suppressExactDistance: true,
    pressure: clamp01(pressure),
  });
}

// The setup gate always blocks an early exit, but its explanatory line belongs
// only to a deliberate forward press through a real leaf.
export function dockExitAttemptShouldSpeak({ forwardIntent = 0, hasDoor = false } = {}) {
  return !!hasDoor && Number(forwardIntent) > .72;
}

export function deriveDockHauntingEligibility({
  departed = false,
  spent = false,
  transitionKind = 'step',
  entryPortal = null,
} = {}) {
  if (spent) return { eligible: false, reason: 'spent', variant: null };
  if (!departed) return { eligible: false, reason: 'not-departed', variant: null };
  if (transitionKind !== 'step') return { eligible: false, reason: 'not-a-step', variant: null };
  if (!isDockReturnPortal(entryPortal)) return { eligible: false, reason: 'unknown-portal', variant: null };
  return { eligible: true, reason: 'eligible', variant: dockVariantFor({ entryPortal }) };
}

export function freshDockTransitState({ inside = true } = {}) {
  return { inside: !!inside, crossingPortal: null };
}

export function reduceDockTransit(value, event = {}) {
  const state = {
    inside: value?.inside !== false,
    crossingPortal: isDockReturnPortal(value?.crossingPortal) ? value.crossingPortal : null,
  };
  if (event.kind !== 'step') return { ...state, departedNow: false, enteredNow: false, entryPortal: null };
  const fromPortal = isDockReturnPortal(event.fromPortal) ? event.fromPortal : null;
  const toPortal = isDockReturnPortal(event.toPortal) ? event.toPortal : null;
  const crossingPortal = toPortal || fromPortal || state.crossingPortal;
  let inside = state.inside;
  let departedNow = false;
  let enteredNow = false;
  let entryPortal = null;

  if (inside && fromPortal && !toPortal && !event.toDock) {
    inside = false;
    departedNow = true;
  } else if (!inside && !event.fromDock && event.toDock) {
    inside = true;
    enteredNow = true;
    entryPortal = crossingPortal;
  }

  return { inside, crossingPortal: inside ? null : crossingPortal, departedNow, enteredNow, entryPortal };
}

// HAVING LEFT THE DOCK IS A FACT ABOUT THE WORLD, NOT AN EVENT YOU CAN MISS.
//
// It used to be recorded only by catching one specific step — out of a portal
// door cell into a non-dock cell — with a single self-heal that ran on loading
// a save and never again. Miss that step and `dock.departed` stayed false for
// the rest of the run, which silently withheld the dock haunting (see
// deriveDockHauntingEligibility, which refuses with 'not-departed') and
// anything else keyed on it, in a save that had already recorded four takes.
//
// So it is derived instead: the player has walked, and they are not on the dock.
// That cannot be missed, only satisfied late.
//
// It deliberately does NOT also require setup to be complete. That extra term
// looked like cheap insurance and was the whole fault: main.js refuses the step
// out of the dock zone until setupComplete(), so being off the dock ALREADY
// proves setup finished — everywhere the wall applies. Everywhere it does not
// (skiptut, a debug warp, a run outside story mode, a save predating the
// tutorial) the term is not insurance, it is a permanent veto: the player is
// standing in the building, four takes deep, and departure can never record.
// Redundant when true, silently destructive when false.
export function dockDepartureIsEvident({
  departed = false,
  steps = 0,
  inDockZone = true,
} = {}) {
  if (departed) return false;          // already recorded; nothing to do
  if (inDockZone) return false;        // standing on it is not leaving it
  return Number(steps) > 0;            // and a spawn is not a walk
}

export function dockHauntingPressure(distanceMeters) {
  const distance = finite(distanceMeters, Infinity);
  const span = DOCK_HAUNTING_PRESSURE.outerMeters - DOCK_HAUNTING_PRESSURE.contactMeters;
  const linear = clamp01((DOCK_HAUNTING_PRESSURE.outerMeters - distance) / span);
  // Smoothstep has no visible kink when the player crosses the outer boundary.
  return linear * linear * (3 - 2 * linear);
}

// One spatial curve owns the Scene Dock's visual compliance beat.  The world
// and the instrument chrome disappear together, while the command itself stays
// readable; contact tears the active frame down and therefore restores both on
// that same update.  Reduced-effects modes keep the authored spatial cue but
// leave progressively more visual context at the closest point.
export function dockHauntingVisibility(snapshot = null, effects = snapshot?.effects) {
  if (!snapshot || snapshot.resolved) {
    return { pressure: 0, worldFade: 0, hudAlpha: 1, promptAlpha: 1 };
  }
  const pressure = clamp01(snapshot.effectPressure ?? snapshot.pressure);
  const onset = clamp01((pressure - .04) / .96);
  const fade = onset * onset * (3 - 2 * onset);
  const mode = normalizeDockEffects(effects);
  const worldPeak = mode === 'full' ? .985 : mode === 'reduced' ? .92 : .82;
  const hudPeak = mode === 'full' ? .97 : mode === 'reduced' ? .88 : .72;
  return {
    pressure,
    worldFade: fade * worldPeak,
    hudAlpha: 1 - fade * hudPeak,
    promptAlpha: 1,
  };
}

export function dockHauntingMoveScale(pressure) {
  const p = clamp01(pressure);
  return 1 + 3 * p * p;
}

export function dockHauntingMilestonesCrossed(pressure, fired = []) {
  const seen = new Set((Array.isArray(fired) ? fired : []).map(Number));
  return DOCK_HAUNTING_MILESTONES.filter((milestone) => pressure >= milestone && !seen.has(milestone));
}

const validStatus = (value) => Object.values(DOCK_HAUNTING_STATUS).includes(value)
  ? value
  : DOCK_HAUNTING_STATUS.IDLE;
const normalizeDoorEndpoint = (value) => ({
  state: value?.state === 'open' ? 'open' : 'closed',
  wedge: !!value?.wedge,
  closerArmed: !!value?.closerArmed,
});

// Only behavior needed to resume a held HUSH is accepted.  Absolute clock
// values are intentionally absent; the snapshot stores bounded remaining time.
export function normalizeDockPresenceSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const point = (x, y) => Number.isFinite(Number(x)) && Number.isFinite(Number(y));
  if (!point(value.x, value.y)) return null;
  const remaining = value.remaining && typeof value.remaining === 'object' ? value.remaining : {};
  const boundedTimer = (timer) => Math.max(0, Math.min(120000, finite(timer, 0)));
  return {
    schema: 1,
    active: !!value.active,
    x: finite(value.x), y: finite(value.y),
    targetX: finite(value.targetX), targetY: finite(value.targetY),
    hasTarget: !!value.hasTarget,
    targetLevel: clamp01(value.targetLevel), targetConfidence: clamp01(value.targetConfidence),
    targetReason: typeof value.targetReason === 'string' ? value.targetReason.slice(0, 96) : null,
    targetPriority: clamp01(value.targetPriority),
    targetAgeMs: boundedTimer(value.targetAgeMs), lastHeardAgeMs: boundedTimer(value.lastHeardAgeMs),
    lastEngagedAgeMs: boundedTimer(value.lastEngagedAgeMs), lastCatchAgeMs: boundedTimer(value.lastCatchAgeMs),
    spawnedAgeMs: boundedTimer(value.spawnedAgeMs),
    externalTargetPriority: clamp01(value.externalTargetPriority),
    lastSoundX: finite(value.lastSoundX), lastSoundY: finite(value.lastSoundY), hasSearchOrigin: !!value.hasSearchOrigin,
    prowlX: finite(value.prowlX), prowlY: finite(value.prowlY), hasProwl: !!value.hasProwl,
    velocityX: finite(value.velocityX), velocityY: finite(value.velocityY), speed: Math.max(0, finite(value.speed)),
    escapeDir: Array.isArray(value.escapeDir)&&value.escapeDir.length===2
      ? [finite(value.escapeDir[0]),finite(value.escapeDir[1])]
      : null,
    motionMode: typeof value.motionMode === 'string' ? value.motionMode.slice(0, 32) : 'idle',
    behaviorMode: typeof value.behaviorMode === 'string' ? value.behaviorMode.slice(0, 32) : 'stand',
    directorIntent: typeof value.directorIntent === 'string' ? value.directorIntent.slice(0, 32) : 'IGNORE',
    tauntRequested: !!value.tauntRequested,
    spawnSector: typeof value.spawnSector === 'string' ? value.spawnSector.slice(0, 64) : null,
    contactDirector: value.contactDirector && typeof value.contactDirector === 'object'
      ? {
          schema: 1,
          lastKind: typeof value.contactDirector.lastKind === 'string' ? value.contactDirector.lastKind.slice(0, 24) : null,
          eligibleSinceBrush: Math.max(0, Math.min(99, Math.floor(finite(value.contactDirector.eligibleSinceBrush)))),
          brushesShown: Math.max(0, Math.min(4, Math.floor(finite(value.contactDirector.brushesShown)))),
          warningsShown: Math.max(0, Math.min(3, Math.floor(finite(value.contactDirector.warningsShown)))),
          recentContentIds: (Array.isArray(value.contactDirector.recentContentIds) ? value.contactDirector.recentContentIds : [])
            .filter((id) => typeof id === 'string').slice(-18).map((id) => id.slice(0, 128)),
        }
      : null,
    remaining: {
      externalTarget: boundedTimer(remaining.externalTarget),
      prowl: boundedTimer(remaining.prowl), dwell: boundedTimer(remaining.dwell),
      phase: boundedTimer(remaining.phase), chase: boundedTimer(remaining.chase),
      nextLightListen: boundedTimer(remaining.nextLightListen),
    },
  };
}

export function freshDockHauntingState() {
  return {
    schema: 1,
    status: DOCK_HAUNTING_STATUS.IDLE,
    entryPortal: null,
    variant: null,
    firedMilestones: [],
    doorEndpoints: {},
    presenceSnapshot: null,
    doorAttempted: false,
    coffee: false,
  };
}

export function normalizeDockHauntingState(value) {
  const base = freshDockHauntingState();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return base;
  const entryPortal = isDockReturnPortal(value.entryPortal) ? value.entryPortal : null;
  let variant = Object.values(DOCK_HAUNTING_VARIANT).includes(value.variant) ? value.variant : null;
  // Normalize the pre-tableau timed variants by their authored entry door.
  if (!variant && entryPortal) variant = dockVariantFor({ entryPortal });
  const fired = new Set((Array.isArray(value.firedMilestones) ? value.firedMilestones : [])
    .map(Number).filter((n) => DOCK_HAUNTING_MILESTONES.includes(n)));
  const endpoints = value.doorEndpoints && typeof value.doorEndpoints === 'object'
    ? Object.fromEntries(Object.values(DOCK_PORTAL).filter((id) => value.doorEndpoints[id])
      .map((id) => [id, normalizeDoorEndpoint(value.doorEndpoints[id])]))
    : {};
  const status = validStatus(value.status);
  if (status === DOCK_HAUNTING_STATUS.ACTIVE && (!entryPortal || !variant)) return base;
  return {
    schema: 1,
    status,
    entryPortal,
    variant,
    firedMilestones: [...fired].sort((a, b) => a - b),
    doorEndpoints: endpoints,
    presenceSnapshot: normalizeDockPresenceSnapshot(value.presenceSnapshot),
    doorAttempted: !!value.doorAttempted,
    coffee: !!value.coffee,
  };
}

export function makeLoadingDockHauntingScene({
  variant = DOCK_HAUNTING_VARIANT.NORTH_CAGE,
  entryPortal = null,
  effects = 'full',
  coffee = false,
  firedMilestones = [],
  distanceMeters = () => Infinity,
  onMilestone = null,
  onUpdate = null,
  onContact = null,
  onRender = null,
  onExit = null,
} = {}) {
  const fired = new Set((Array.isArray(firedMilestones) ? firedMilestones : []).map(Number));
  let resolved = false;
  let exited = false;
  const frame = () => {
    const distance = Math.max(0, finite(distanceMeters?.(), Infinity));
    const pressure = dockHauntingPressure(distance);
    return {
      variant, entryPortal, effects: normalizeDockEffects(effects), coffee: !!coffee,
      distanceMeters: distance, pressure,
      // Coffee alters perception, not geometry or compliance.  The distance
      // contract and movement resistance remain honest while the audiovisual
      // pressure arrives earlier and runs hotter.
      effectPressure: clamp01(pressure * (coffee ? 1.16 : 1)),
      moveScale: dockHauntingMoveScale(pressure),
      contact: distance <= DOCK_HAUNTING_PRESSURE.contactMeters,
      firedMilestones: [...fired].sort((a, b) => a - b), resolved,
    };
  };
  const resolve = () => {
    if (resolved) return false;
    resolved = true;
    onContact?.(frame());
    return true;
  };
  const scene = {
    id: 'get-in-haunting',
    blocksInput: false,
    blocksWorld: false,
    allowsLook: true,
    lookProfile: 'hush',
    update() {
      if (resolved) return;
      const current = frame();
      for (const milestone of dockHauntingMilestonesCrossed(current.pressure, [...fired])) {
        fired.add(milestone);
        onMilestone?.(milestone, frame());
      }
      const next = frame();
      onUpdate?.(next);
      if (next.contact) resolve();
    },
    render() { onRender?.(frame()); },
    key() { return false; },
    pointer() { return false; },
    contact: resolve,
    exit() {
      if (exited) return;
      exited = true;
      onExit?.(frame());
    },
    view: frame,
  };
  return scene;
}

// A cool rim refuses total silhouette loss at peak pressure.  Architectural
// lighting and torch reach are absorbed by the ordinary HUSH field.
export function dockHauntingLights(snapshot = null, staging = null, baseLights = []) {
  if (!snapshot || !staging) return [];
  const p = clamp01(snapshot.effectPressure ?? snapshot.pressure);
  const absorbed = (Array.isArray(baseLights) ? baseLights : []).map((light) => ({
    ...light,
    intensity: Math.max(0, Number(light.intensity) || 0) * (1 - p * .94),
    radius: Math.max(.4, Number(light.radius) || 1) * (1 - p * .68),
  }));
  return [...absorbed, {
    id: 'dock-hush-readable-rim', x: staging.x, z: staging.y, y: 1.15,
    color: [.18, .25, .3], intensity: .16 + p * .08, radius: 2.2 - p * .45,
  }];
}

export function dockEndingBeat({ spent = false, variant = null, supernatural = true, drankCoffee = false, endingId = null } = {}) {
  if (!spent) return [];
  const place = variant === DOCK_HAUNTING_VARIANT.WEST_DESK ? 'the west signing desk' : 'the north cage';
  const reading = supernatural
    ? `At ${place}, the empty dock told me to come closer. I crossed every warning, touched it, and it let me go.`
    : `At ${place}, I heard come closer and kept walking. ${drankCoffee ? 'The coffee made the ordinary explanation easier, not true.' : 'There was no ordinary source left to blame.'}`;
  const consequence = endingId === 'surfaced' ? 'The second recordist remembers it too.'
    : endingId === 'inversion' ? 'That was the first exit that happened before I chose it.'
      : endingId === 'drugged' ? 'The contaminant report calls that consent.'
        : endingId === 'helped' ? 'The operator annotation calls it an intervention.'
          : endingId === 'sacrifice' ? 'The sealed ledger already had me returned.' : '';
  return [{ who: 'you', text: `${reading}${consequence ? ` ${consequence}` : ''}` }];
}
