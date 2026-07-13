// Orchestrates semantic noise, HUSH belief, playful misdirection, proximity
// absorption, and sanitized offers to the existing presence AI.

import { onAcousticEvent } from '../audio/acoustic-events.js';
import { propagateNoise, isAudibleToHush } from '../audio/acoustic-propagation.js';
import { freshHushAudition, ingestHeardNoise, normalizeHushAudition, tickHushAudition } from './hush-audition.js';
import { chooseHushIntent } from './hush-director.js';
import { applyFieldPresentationPolicy, computeHushField, effectiveTorchScale, inactiveHushField } from './hush-field.js';
import { commitMischiefCue, freshMischiefState, normalizeMischiefState, selectMischiefCue } from './hush-mischief.js';
import { hushAudioPolicyForDifficulty } from './hush-sensory-policy.js';

const nowDefault = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

export function createHushAudioRuntime({
  presence,
  playerSpatial,
  enrichSourceSpatial = null,
  occlusionDb = null,
  roomLossDb = null,
  maskingDb = null,
  difficulty = () => null,
  settings = () => ({}),
  context = () => ({}),
  effects = null,
  onField = null,
  onHeard = null,
  onIntent = null,
  onMischief = null,
  clock = nowDefault,
  random = Math.random,
} = {}) {
  let policy = hushAudioPolicyForDifficulty(difficulty());
  let audition = freshHushAudition(policy);
  let mischief = freshMischiefState();
  let field = inactiveHushField();
  let lastPropagation = null;
  let lastEvent = null;
  let lastIntent = { kind: 'IGNORE' };
  let enabled = true;
  let contactBeganAt = null;
  let contactCapped = false;

  function limitContactExposure(value, now) {
    const strength = value?.absorption?.monitor || 0;
    if (strength < .72) {
      contactBeganAt = null;
      contactCapped = false;
      return value;
    }
    if (strength >= .92 && contactBeganAt == null) contactBeganAt = now;
    if (contactBeganAt != null && now - contactBeganAt >= policy.fullAbsorptionMaxMs) {
      contactCapped = true;
    }
    if (!contactCapped) return value;
    // Full vacuum is a brief punctuation. If the HUSH remains on top of the
    // operator, hold the sensory field at “engulf” until physical separation
    // instead of sustaining a painful near-mute indefinitely.
    return {
      ...value,
      stage: 'engulf',
      absorption: {
        audio: Math.min(.84, value.absorption.audio),
        light: Math.min(.88, value.absorption.light),
        monitor: Math.min(.89, value.absorption.monitor),
      },
    };
  }

  function publicPresence() {
    const value = presence?.publicSnapshot?.() || {};
    return {
      active: !!value.active,
      position: value.position || (Number.isFinite(value.x) && Number.isFinite(value.y) ? { x: value.x, y: value.y } : null),
      roomId: value.roomId || null,
      floorId: value.floorId || null,
      hasTarget: !!value.hasTarget,
    };
  }

  const unsubscribe = onAcousticEvent((event) => {
    if (!enabled) return;
    const hush = publicPresence();
    if (!hush.active || !hush.position) return;
    const enriched = typeof enrichSourceSpatial === 'function' ? enrichSourceSpatial(event) : event;
    const listener = { position: hush.position, roomId: hush.roomId, floorId: hush.floorId };
    const propagation = propagateNoise({
      event: enriched,
      listener,
      occlusionDb: typeof occlusionDb === 'function' ? occlusionDb(enriched.spatial, listener) : 0,
      roomLossDb: typeof roomLossDb === 'function' ? roomLossDb(enriched.spatial, listener) : 0,
      maskingDb: typeof maskingDb === 'function' ? maskingDb(enriched.spatial, listener) : 0,
    });
    lastPropagation = propagation;
    lastEvent = enriched;
    policy = hushAudioPolicyForDifficulty(difficulty());
    if (!isAudibleToHush(propagation, policy)) return;
    audition = ingestHeardNoise(audition, { event: enriched, propagation, now: clock(), policy });
    presence?.offerSoundTarget?.({
      position: enriched.spatial.position,
      level: Math.max(0, Math.min(1, (propagation.effectiveLevelDb - policy.hearingThresholdDb) / 24)),
      confidence: Math.max(0, 1 - propagation.uncertainty),
      expiresAt: clock() + Math.max(1800, policy.certaintyHalfLife * 320),
      priority: .65,
      reason: 'ACOUSTIC_EVENT',
    });
    onHeard?.({ event: enriched, propagation, audition: structuredClone(audition) });
  });

  function tick(dt) {
    policy = hushAudioPolicyForDifficulty(difficulty());
    audition = tickHushAudition(audition, Math.max(0, Number(dt) || 0), policy);
    const hush = publicPresence();
    const operator = playerSpatial?.() || {};
    const ctx = context?.() || {};
    const fieldOcclusion = hush.position && operator.position && typeof occlusionDb === 'function'
      ? Math.max(0, Math.min(1, occlusionDb(operator, hush) / 24))
      : 0;
    field = computeHushField({
      hush,
      operator,
      fieldScale: policy.fieldScale,
      occlusion: fieldOcclusion,
      now: clock(),
    });
    field = limitContactExposure(field, clock());
    field = applyFieldPresentationPolicy(field, settings?.() || {});

    lastIntent = chooseHushIntent({
      audition,
      field,
      cooldowns: { mischiefReady: clock() >= mischief.lastCueAt + Math.max(5000, 12000 / Math.max(.2, policy.mischiefFrequency)) },
      narrative: { enabled: enabled && hush.active, allowMischief: ctx.allowMischief !== false },
      random,
    });

    if (lastIntent.kind === 'INVESTIGATE' || lastIntent.kind === 'STALK') {
      const target = lastIntent.target;
      if (target?.position) {
        presence?.offerSoundTarget?.({
          position: target.position,
          confidence: target.confidence,
          expiresAt: clock() + (lastIntent.kind === 'STALK' ? 4800 : 2800),
          priority: lastIntent.kind === 'STALK' ? .72 : .55,
          reason: lastIntent.kind,
        });
      }
    } else if (lastIntent.kind === 'PLAY') {
      const cue = selectMischiefCue({
        context: {
          interest: audition.interest,
          certainty: audition.certainty,
          agitation: audition.agitation,
          recording: !!ctx.recording,
          blocked: !!ctx.blocked,
          finale: !!ctx.finale,
          battle: !!ctx.battle,
        },
        state: mischief,
        now: clock(),
        random,
      });
      if (cue) {
        const pan = Math.max(-.95, Math.min(.95, (lastIntent.target?.position?.x ?? hush.position?.x ?? 0) - (operator.position?.x ?? 0)) / 12);
        if (effects?.playMischief?.(cue, { intensity: lastIntent.intensity, pan, random })) {
          mischief = commitMischiefCue(mischief, cue, clock());
          onMischief?.({ cue, pan, intensity: lastIntent.intensity });
        }
      }
    }

    const s = settings?.() || {};
    effects?.applyField?.(field, s, {
      monitorGain: s.monitorGain ?? 1,
      monitorOpen: ctx.monitorOpen !== false,
    });
    effects?.maybeResidue?.(field, { random });
    onField?.({ field: structuredClone(field), torchScale: effectiveTorchScale(field), audition: structuredClone(audition) });
    onIntent?.(lastIntent);
    return field;
  }

  return {
    tick,
    setEnabled(value) { enabled = !!value; if (!enabled) effects?.reset?.(); },
    // Hot-path read-only accessors. Rendering and mix integration should not
    // clone the bounded noise-memory ledger every frame; the full snapshot is
    // reserved for probes, labs, and diagnostics.
    currentField() { return field; },
    currentAudition() { return audition; },
    snapshot() {
      return {
        enabled,
        policy: { ...policy },
        audition: structuredClone(audition),
        field: structuredClone(field),
        mischief: structuredClone(mischief),
        lastIntent: structuredClone(lastIntent),
        lastEvent: lastEvent ? structuredClone(lastEvent) : null,
        lastPropagation: lastPropagation ? structuredClone(lastPropagation) : null,
      };
    },
    save() {
      return {
        schema: 1,
        audition: {
          interest: audition.interest,
          certainty: audition.certainty,
          agitation: audition.agitation,
          playfulness: audition.playfulness,
          lastHeard: audition.lastHeard,
          hypotheses: audition.hypotheses,
          pressure: audition.pressure,
          // Sample IDs and semantic metadata only; never raw microphone audio.
          noiseMemory: audition.noiseMemory.slice(-8),
        },
        mischief: {
          lastCueAgeMs: Math.max(0, clock() - mischief.lastCueAt),
          familyRemaining: Object.fromEntries(Object.entries(mischief.familyUntil).map(([id, at]) => [id, Math.max(0, at - clock())])),
          cueRemaining: Object.fromEntries(Object.entries(mischief.cueUntil).map(([id, at]) => [id, Math.max(0, at - clock())])),
          cueCounts: mischief.cueCounts,
          history: mischief.history.map((entry) => ({ id: entry.id, family: entry.family, ageMs: Math.max(0, clock() - entry.at) })),
        },
      };
    },
    load(value) {
      policy = hushAudioPolicyForDifficulty(difficulty());
      audition = normalizeHushAudition(value?.audition, policy);
      const savedMischief = value?.mischief || {};
      const at = clock();
      mischief = normalizeMischiefState({
        lastCueAt: Number.isFinite(savedMischief.lastCueAgeMs) ? at - Math.max(0, savedMischief.lastCueAgeMs) : -1e12,
        familyUntil: Object.fromEntries(Object.entries(savedMischief.familyRemaining || {}).map(([id, remaining]) => [id, at + Math.max(0, Number(remaining) || 0)])),
        cueUntil: Object.fromEntries(Object.entries(savedMischief.cueRemaining || {}).map(([id, remaining]) => [id, at + Math.max(0, Number(remaining) || 0)])),
        cueCounts: savedMischief.cueCounts || {},
        history: Array.isArray(savedMischief.history) ? savedMischief.history.map((entry) => ({ id: entry.id, family: entry.family, at: at - Math.max(0, Number(entry.ageMs) || 0) })) : [],
      });
      field = inactiveHushField();
      contactBeganAt = null;
      contactCapped = false;
      effects?.reset?.();
    },
    destroy() {
      unsubscribe();
      effects?.reset?.();
    },
  };
}
