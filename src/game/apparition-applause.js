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
  schedulingVersion: 'audio-clock-v1',
  minimumObservedPulses: 3,
  minimumObservedLitMs: 3500,
  reactionDelayMs: 65,
  responseWindowMs: 3200,
  armFacingRadians: 35 * Math.PI / 180,
  lookTurnRadians: 37 * Math.PI / 180,
  lookOffAxisRadians: 60 * Math.PI / 180,
  lookHoldMs: 60,
  retreatDistanceM: .65,
  retreatDisplacementM: .55,
  maximumPlayerStepM: 1.5,
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
const copyListener = (value) => value && ['x', 'y', 'yaw'].every((key) => Number.isFinite(value[key]))
  ? { x: value.x, y: value.y, yaw: value.yaw } : null;
const angleDistance = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const stationDistance = (listener, origin) => Math.hypot(origin.x - listener.x, origin.z - listener.y);
const stationAngle = (listener, origin) => angleDistance(listener.yaw,
  Math.atan2(origin.x - listener.x, -(origin.z - listener.y)));
const copyStation = (station) => ({ ...station, origin: copyOrigin(station.origin) });

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
 * `listener` is the real world position (x, world-Z as y) and rendered yaw.
 * `witnessPointVisible` proves the old station is projected and unoccluded,
 * including when an absence leaves no body there. `voluntaryLook` and
 * `voluntaryMove` require actual recent player input, never a scripted camera.
 * `inEncounter` stays true only inside the existing Hall room. A pending answer
 * may survive a different hero lamp there; it never alters the visual frame.
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
  let lastSample = null;
  const consumed = new Set();

  function cancel(reason = 'cancelled') {
    const hadPending = !!pending;
    pending = null;
    track = null;
    lastSample = null;
    lastCancellation = String(reason);
    return hadPending;
  }

  function observe(input = {}) {
    const now = input.nowMs;
    if (!Number.isFinite(now) || now < 0) { cancel('clock'); return null; }
    const blocked = blockedBy(input);
    if (blocked) { cancel(blocked); return null; }
    if (input.inEncounter !== true) { cancel('left-encounter'); return null; }
    const listener = copyListener(input.listener);
    if (!listener) { cancel('player-pose'); return null; }
    const frame = input.frame;
    const elapsedSample = lastSample ? now - lastSample.at : 0;
    const jumped = lastSample && Math.hypot(listener.x - lastSample.listener.x,
      listener.y - lastSample.listener.y) > APPARITION_APPLAUSE.maximumPlayerStepM;
    if (lastSample && (elapsedSample < 0 || elapsedSample > APPARITION_APPLAUSE.maximumSampleGapMs || jumped)) {
      cancel(jumped ? 'player-jump' : 'discontinuity');
      const cue = cueOf(frame);
      if (cue && targetFrame(frame)) consumed.add(`${run}|${frame.director.stageKey}|${frame.lightId}|${frame.contract.pulseIndex}|${cue.cause}|${cue.index}`);
      return null;
    }
    lastSample = { at: now, listener };

    // Once an actual change has been witnessed, its old station owns this
    // short answer. Turning can select another real Hall practical; that must
    // neither cancel the answer nor pin or synthesize a visual frame.
    if (pending) {
      if (input.budgetReady !== true) { cancel('budget'); return null; }
      if (now > pending.expiresAtMs) { cancel('response-expired'); return null; }
      if (pending.dueAtMs == null) {
        const turned = input.voluntaryLook === true
          && angleDistance(listener.yaw, pending.listenerAtArm.yaw) >= APPARITION_APPLAUSE.lookTurnRadians
          && stationAngle(listener, pending.origin) >= APPARITION_APPLAUSE.lookOffAxisRadians;
        if (turned) pending.lookAwaySinceMs ??= now;
        else pending.lookAwaySinceMs = null;
        const retreat = input.voluntaryMove === true
          && stationDistance(listener, pending.origin) - pending.distanceAtArmM >= APPARITION_APPLAUSE.retreatDistanceM
          && Math.hypot(listener.x - pending.listenerAtArm.x, listener.y - pending.listenerAtArm.y)
            >= APPARITION_APPLAUSE.retreatDisplacementM;
        const lookAway = turned && now - pending.lookAwaySinceMs >= APPARITION_APPLAUSE.lookHoldMs;
        if (retreat || lookAway) {
          pending.response = retreat ? 'retreat' : 'look-away';
          pending.responseAtMs = now;
          pending.responseListener = listener;
          pending.dueAtMs = now + APPARITION_APPLAUSE.reactionDelayMs;
        }
      }
      if (pending.responseAtMs == null) return null;
      // Hand the earned answer over on this input sample. The AudioContext
      // schedules its 65 ms delay; waiting for another visual frame loses real
      // responses whenever an otherwise legal frame takes more than 185 ms.
      const event = { ...pending, origin: copyOrigin(pending.origin),
        listenerAtArm: { ...pending.listenerAtArm }, responseListener: { ...pending.responseListener },
        reaction: { kind: pending.response, atMs: pending.responseAtMs, listener: { ...pending.responseListener } },
        schedulingVersion: APPARITION_APPLAUSE.schedulingVersion,
        lightingState: frame?.lightingState || null, emittedAtMs: now, delayMs: APPARITION_APPLAUSE.reactionDelayMs,
        cooldownMs: APPARITION_APPLAUSE.sharedCooldownMs, claimsSharedBudget: true };
      pending = null;
      emitted += 1;
      lastEventAt = now;
      return event;
    }
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
      lastSample = { at: now, listener };
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
        const ready = observed && witnessedChange && previousStation && input.witnessPointVisible === true
          && stationAngle(listener, previousStation.origin) <= APPARITION_APPLAUSE.armFacingRadians
          && input.budgetReady === true
          && !pending && emitted < APPARITION_APPLAUSE.maximumEventsPerRun
          && now - lastEventAt >= APPARITION_APPLAUSE.sharedCooldownMs
          && track.observedPulses.size >= APPARITION_APPLAUSE.minimumObservedPulses
          && track.observedLitMs >= APPARITION_APPLAUSE.minimumObservedLitMs;
        if (ready) pending = {
          id: `apparition-applause:${cueKey}`,
          stageKey, lightId, pulseIndex, cause: cue.cause, stationIndex: cue.index,
          origin: copyOrigin(previousStation.origin), sourceHeight: previousStation.sourceHeight,
          poseId: previousStation.poseId, variant,
          armedAtMs: now, expiresAtMs: now + APPARITION_APPLAUSE.responseWindowMs,
          armedLightingState: lightingState, listenerAtArm: listener,
          distanceAtArmM: stationDistance(listener, previousStation.origin),
          dueAtMs: null, responseAtMs: null, response: null, responseListener: null, lookAwaySinceMs: null,
        };
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

    return null;
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
      witnessedStations: [...(track?.stations.values() || [])].map(copyStation),
      pending: pending ? { ...pending, origin: copyOrigin(pending.origin), listenerAtArm: { ...pending.listenerAtArm },
        responseListener: pending.responseListener ? { ...pending.responseListener } : null } : null };
  }

  return { observe, cancel, reset, inspect };
}
