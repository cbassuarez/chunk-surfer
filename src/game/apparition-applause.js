// One audio observation of an existing Hall continuity error. This does not
// direct figures, alter poses, place a new actor, or play/schedule AudioNodes.
// The caller supplies the frame actually submitted to the renderer and owns
// visibility/occlusion checks, the shared dread budget, and the sound renderer.

export const APPARITION_APPLAUSE = Object.freeze({
  compositionId: 'hall-aisle-breadth',
  lightIds: Object.freeze([
    'hall-entrance-maintained-north',
    'hall-entrance-maintained-south',
    'hall-stage-door-maintained',
    'hall-galleria-west-foot',
    'hall-galleria-east-foot',
  ]),
  conditions: Object.freeze(['silent', 'ordinary', 'treatment']),
  minimumObservedPulses: 3,
  minimumObservedLitMs: 3500,
  darkDelayMs: 65,
  sharedCooldownMs: 150000,
  maximumSampleGapMs: 500,
  maximumLateMs: 120,
  maximumEventsPerRun: 1,
});

const ON = 'emergency-on';
const DARK = new Set(['emergency-off', 'unlit']);
const indexOf = (value) => Number.isInteger(value) && value >= 0 && value < 3 ? value : null;
const conditionOf = (value) => APPARITION_APPLAUSE.conditions.includes(value) ? value : 'treatment';
const copyOrigin = (value) => value ? { x: value.x, y: value.y, z: value.z } : null;

function stationOf(instance) {
  if (!instance || instance.shadowOnly || !['x', 'y', 'z'].every((axis) => Number.isFinite(instance[axis]))) return null;
  const index = indexOf(instance.apparitionIndex);
  return index == null ? null : {
    index,
    origin: copyOrigin(instance),
    sourceHeight: 1.1 * (Number.isFinite(instance.scaleY) ? instance.scaleY : 1),
    poseId: typeof instance.poseId === 'string' ? instance.poseId : null,
  };
}

function cueOf(frame) {
  const card = frame?.director?.card;
  if (['absence', 'substitution'].includes(card?.kind) && indexOf(card.index) != null) {
    return { cause: card.kind, index: card.index };
  }
  const index = indexOf(frame?.director?.hardRevealIndex);
  return index == null ? null : { cause: 'hard', index };
}

function blockedBy(input) {
  if (input.active === false || input.enabled === false || input.suppressed) return 'inactive';
  if (input.paused) return 'paused';
  if (input.hidden || input.focused === false) return 'away';
  if (input.recording || input.listening) return 'recorder';
  if (input.modal || input.battle) return 'occupied';
  if (input.reduceDread || (input.effectsMode ?? 'full') !== 'full') return 'effects';
  return null;
}

function targetFrame(frame) {
  return frame?.composition?.id === APPARITION_APPLAUSE.compositionId
    && APPARITION_APPLAUSE.lightIds.includes(frame.lightId)
    && typeof frame.director?.stageKey === 'string' && frame.director.stageKey.length > 0
    && Number.isInteger(frame.contract?.pulseIndex) && frame.contract.pulseIndex >= 0
    && (frame.contract.effectsMode ?? 'full') === 'full'
    && (frame.lightingState === ON || DARK.has(frame.lightingState))
    && Array.isArray(frame.instances);
}

/**
 * `observedIndices` must contain the actual on-screen, unoccluded identities,
 * not every submitted figure. `observed:false` can explicitly withhold a sample.
 * Keep supplying the real dark frame when bodies become sparse.
 *
 * `budgetReady` is a fail-closed handshake with the existing stab director.
 * The caller must reserve the shared >=150s budget for EVERY returned event,
 * including silent control. Denied/cancelled cues are consumed, never queued.
 * Conditions change only the returned variant, never observation or timing.
 */
export function createApparitionApplauseDirector({ runId = 'run', condition = 'treatment' } = {}) {
  let run = String(runId || 'run');
  let variant = conditionOf(condition);
  let track = null;
  let pending = null;
  let emitted = 0;
  let lastEventAt = -Infinity;
  let lastCancellation = null;
  const consumed = new Set();

  function cancel(reason = 'cancelled') {
    const hadPending = !!pending;
    pending = null;
    track = null;
    lastCancellation = String(reason);
    return hadPending;
  }

  function observe(input = {}) {
    const now = input.nowMs;
    if (!Number.isFinite(now) || now < 0) { cancel('clock'); return null; }
    const blocked = blockedBy(input);
    if (blocked) { cancel(blocked); return null; }
    const frame = input.frame;
    if (!targetFrame(frame)) { cancel('other-stage'); return null; }
    const stageKey = frame.director.stageKey;
    const lightId = frame.lightId;
    const pulseIndex = frame.contract.pulseIndex;
    const lightingState = frame.lightingState;
    const key = `${stageKey}|${lightId}`;

    if (track?.key !== key) {
      cancel('stage-change');
      track = { key, stageKey, lightId, lastAt: now, lastPulse: pulseIndex,
        lastLighting: lightingState, lastObserved: false, observedPulses: new Set(),
        observedLitMs: 0, stations: new Map() };
    }
    const elapsed = now - track.lastAt;
    if (elapsed < 0 || elapsed > APPARITION_APPLAUSE.maximumSampleGapMs
      || pulseIndex < track.lastPulse || pulseIndex > track.lastPulse + 1) {
      cancel('discontinuity');
      // Rebasing is deliberately a silent sample. The incoming cue identity is
      // consumed below so that an active card cannot restart after a hitch.
      const cue = cueOf(frame);
      if (cue) consumed.add(`${run}|${key}|${pulseIndex}|${cue.cause}|${cue.index}`);
      return null;
    }

    const observedIndices = new Set((Array.isArray(input.observedIndices) ? input.observedIndices : [])
      .filter((index) => indexOf(index) != null));
    const witnessed = frame.instances.filter((instance) => observedIndices.has(instance.apparitionIndex) && stationOf(instance));
    const observed = input.observed !== false && lightingState === ON && witnessed.length > 0;
    if (observed) {
      track.observedPulses.add(pulseIndex);
      if (track.lastObserved && track.lastLighting === ON) track.observedLitMs += elapsed;
    }

    const cue = cueOf(frame);
    if (cue) {
      const cueKey = `${run}|${key}|${pulseIndex}|${cue.cause}|${cue.index}`;
      if (!consumed.has(cueKey)) {
        consumed.add(cueKey);
        // Use the last observed, actually submitted station. In an absence the
        // selected index no longer exists in the new frame; its old position is
        // the evidence. Neither a virtual near-camera source nor a new figure.
        const previousStation = track.stations.get(cue.index);
        const witnessedChange = cue.cause === 'absence'
          ? !frame.instances.some((instance) => instance.apparitionIndex === cue.index)
          : witnessed.some((instance) => instance.apparitionIndex === cue.index);
        const ready = observed && witnessedChange && previousStation && input.budgetReady === true
          && !pending && emitted < APPARITION_APPLAUSE.maximumEventsPerRun
          && now - lastEventAt >= APPARITION_APPLAUSE.sharedCooldownMs
          && track.observedPulses.size >= APPARITION_APPLAUSE.minimumObservedPulses
          && track.observedLitMs >= APPARITION_APPLAUSE.minimumObservedLitMs;
        if (ready) pending = {
          id: `apparition-applause:${cueKey}`,
          stageKey, lightId, pulseIndex, cause: cue.cause, stationIndex: cue.index,
          origin: copyOrigin(previousStation.origin), sourceHeight: previousStation.sourceHeight,
          poseId: previousStation.poseId, variant,
          armedAtMs: now, dueAtMs: null, darkAtMs: null, lightingState: null,
        };
      }
    }

    if (pending) {
      if (pulseIndex !== pending.pulseIndex || input.budgetReady !== true) {
        pending = null;
        lastCancellation = 'budget-or-beat';
      } else if (track.lastLighting === ON && DARK.has(lightingState)) {
        pending.darkAtMs = now;
        pending.dueAtMs = now + APPARITION_APPLAUSE.darkDelayMs;
        pending.lightingState = lightingState;
      } else if (pending.dueAtMs != null && lightingState === ON) {
        pending = null;
        lastCancellation = 'light-returned';
      }
    }

    // Cache after cue resolution: substitution must retain the old observed
    // station and pose; absence must not remove the missing index from memory.
    if (observed) for (const instance of witnessed) {
      const station = stationOf(instance);
      if (station) track.stations.set(station.index, station);
    }
    track.lastAt = now;
    track.lastPulse = pulseIndex;
    track.lastLighting = lightingState;
    track.lastObserved = observed;

    if (!pending || pending.dueAtMs == null || now < pending.dueAtMs) return null;
    if (now - pending.dueAtMs > APPARITION_APPLAUSE.maximumLateMs) {
      pending = null;
      lastCancellation = 'late';
      return null;
    }
    const event = { ...pending, origin: copyOrigin(pending.origin),
      lightingState, emittedAtMs: now, delayMs: APPARITION_APPLAUSE.darkDelayMs,
      cooldownMs: APPARITION_APPLAUSE.sharedCooldownMs, claimsSharedBudget: true };
    pending = null;
    emitted += 1;
    lastEventAt = now;
    return event;
  }

  function reset(options = {}) {
    run = String(options.runId ?? run);
    variant = conditionOf(options.condition ?? variant);
    cancel('reset');
    consumed.clear();
    emitted = 0;
    lastEventAt = -Infinity;
    return inspect();
  }

  function inspect() {
    return { runId: run, condition: variant, emitted, lastEventAtMs: Number.isFinite(lastEventAt) ? lastEventAt : null,
      consumedCues: consumed.size, lastCancellation,
      observedPulses: track?.observedPulses.size || 0,
      observedLitMs: track?.observedLitMs || 0,
      stageKey: track?.stageKey || null,
      pending: pending ? { ...pending, origin: copyOrigin(pending.origin) } : null };
  }

  return { observe, cancel, reset, inspect };
}
