// A bounded, CPU-generated study. Fixed sounds and synthetic door obstruction
// isolate existing production controllers. These are not real-level playthroughs.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import * as PRES from '../../src/game/presence.js';
import { createPressurePerformance } from '../../src/game/pressure-performance.js';
import { pressureInstances } from '../../src/render/pressure-volume.js';
import { createTractionPerformance } from '../../artifacts/hush-motion-study/traction-performance.js';
import { freshPressureGait, stepPressureGait } from '../../src/game/pressure-gait.js';

const output = new URL('../../artifacts/hush-motion-study/', import.meta.url);
mkdirSync(new URL('authority/', output), { recursive: true });
const dt = 1 / 50, fixtures = [];
const clone = v => JSON.parse(JSON.stringify(v));
const rawActor = (p, driver, seconds) => driver.tick(seconds, { primary: {
  id: 'fixture-presence', role: 'live-pressure', x: p.x, y: p.y, floorH: 0, heightM: 2.18,
  widthM: .68, strength: 1, radiusM: 5.2, velocityX: p.velocityX, velocityY: p.velocityY,
  gait: clone(p.gait), heading: p.gait.heading,
  motion: p.behaviorMode === 'chase' ? 'hunt' : ['listen', 'limp', 'investigate'].includes(p.behaviorMode) ? p.behaviorMode : 'idle',
} }).primary;
const sample = (t, actor, candidate, extra = {}, elapsed = dt) => ({ t, actor: clone(actor),
  instance: clone(pressureInstances(actor, null)[0] || null), candidate: candidate.tick(elapsed, actor), ...extra });

let now = 100000, random = 4417;
const previousPerformance = globalThis.performance, previousRandom = Math.random;
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
Math.random = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random / 4294967296; };
try {
  for (const blocked of [false, true]) {
    PRES.loadPresenceState({ awareness: 0, caughtCount: 0 });
    PRES.spawnAtCell(-.5, 5.5, { sector: 'study-clear-floor', gaitSeed: 4417 });
    const driver = createPressurePerformance(), candidate = createTractionPerformance();
    const frames = [], seconds = 20;
    const navigation = { resolveMove(from, target, budget) {
      if (blocked && now >= 103020 && now < 106000) return from;
      const d = Math.hypot(target.x - from.x, target.y - from.y), move = Math.min(budget, d);
      return d > 1e-10 ? { x: from.x + (target.x - from.x) / d * move, y: from.y + (target.y - from.y) / d * move } : from;
    } };
    for (let i = 0; i <= seconds / dt; i++) {
      const t = i * dt; now = 100000 + t * 1000;
      const p = PRES.presenceState();
      if (i === 0) {
        PRES.offerSoundTarget({ position: { x: -.5, y: -20 }, confidence: 1, priority: .96, level: 1,
          expiresAt: now + 30000, reason: 'STUDY_FIXED_SOUND' });
        // Explicit initial diagnostic state. The real director owns its2s expiry.
        p.behaviorMode = 'listen'; p.phaseUntil = now + 2000;
      }
      if (blocked && i === 300) PRES.offerSoundTarget({ position: { x: 20, y: p.y }, confidence: 1,
        priority: 1, level: 1, expiresAt: now + 30000, reason: 'STUDY_FIXED_SECOND_SOUND' });
      if (i > 0 && i % 150 === 0 && (!blocked || i < 300)) PRES.offerSoundTarget({ position: { x: -.5, y: -20 },
        confidence: 1, priority: .96, level: 1, expiresAt: now + 30000, reason: 'STUDY_FIXED_SOUND' });
      PRES.updatePresence(i ? dt : 0, 10, 10, null, { navigation, suppressContact: true });
      const actor = rawActor(p, driver, i ? dt : 0);
      frames.push(sample(t, actor, candidate, { diagnostics: { mode: p.behaviorMode, target: { x: p.targetX, y: p.targetY },
        syntheticDoorClosed: blocked && t >= 3.02 && t < 6, controller: 'actual-Presence', stagedInitialListen: true } }));
    }
    fixtures.push({ id: blocked ? 'blocked-turn' : 'listening-initiation', label: blocked ? 'Committed step / blocked recovery /90° redirect' : 'Listening / load / first approach',
      seconds, qualification: 'Actual Presence and presentation controller on clear floor; fixed sound offers, explicitly staged initial listen and synthetic closed-door resolver. Not real-level or earned encounter.', frames });
  }
} finally {
  PRES.despawn(); Math.random = previousRandom;
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: previousPerformance });
}

// Prescribed accepted-speed sweep: a causal presentation fixture, not AI/route.
{
  const driver = createPressurePerformance(), candidate = createTractionPerformance(), frames = [];
  let z = 0;
  for (let i = 0; i <= 15 / dt; i++) {
    const t = i * dt, speed = t < 2 ? 0 : t < 7 ? 3.4 : t < 11 ? 6.3 : t < 12 ? 6.3 * (12 - t) : 0;
    z -= speed * (i ? dt : 0);
    const actor = driver.tick(i ? dt : 0, { primary: { id: 'source-speed-sweep', role: 'court-trace', x: -.5,
      y: z / .5 - .5, floorH: 0, heading: 0, heightM: 1.83, widthM: .68, strength: 1, radiusM: 5.2,
      velocityX: 0, velocityY: -speed / .5, motion: speed > .001 ? 'hunt' : 'idle' } }).primary;
    frames.push(sample(t, actor, candidate, { diagnostics: { requestedAcceptedSpeedMps: speed, controller: 'prescribed-root/production-presentation' } }));
  }
  fixtures.push({ id: 'source-speed-sweep', label: 'Continuous Source /3.4m/s /6.3m/s / brake / stillness', seconds: 15,
    qualification: 'Prescribed accepted root sweep through real production presentation. This isolates pose/phase; it does not prove real Source AI or navigation.', frames });
}

// Actual continuation controller trace from the independent authority audit.
{
  const trace = JSON.parse(readFileSync(new URL('authority/source-II-corner.json', output))), candidate = createTractionPerformance();
  const frames = trace.rows.map(([t, x, z, heading, speed, mode, time], index) => {
    const actor = { id: 'source-II-corner', x: x / .5 - .5, y: z / .5 - .5, floorH: 0, heightM: 2.18,
      widthM: .68, strength: 1, radiusM: 5.2, performance: { version: 1, role: 'source-rear', heading,
        clip: mode === 'follow' ? 'pressure_approach' : 'pressure_hold', time, loop: true, seed: 0, manifestation: 1,
        motion: mode === 'follow' ? 'hunt' : 'idle', cue: null, reducedMotion: false } };
    return { ...sample(t, actor, candidate, {}, index ? t - trace.rows[index - 1][0] : 0), diagnostics: { controller: 'actual-Source-continuation-supported-corner', acceptedSpeedMps: speed } };
  });
  fixtures.push({ id: 'source-II-corner', label: 'Source continuation / supported90° corner', seconds: 2,
    qualification: 'Actual continuation actor on existing supported ground; renderer-equivalent raw actor. Initial position and route are an isolated diagnostic fixture.', frames });
}

// Explicit gameplay timing proposal. This intentionally changes accepted root
// timing; it is never installed in Presence or represented as the same rules.
{
  const seconds = 20, frames = [], candidate = createTractionPerformance();
  const beforeDriver = createPressurePerformance(), afterDriver = createPressurePerformance();
  let before = { x: -.5, y: 5.5, gait: freshPressureGait({ seed: 4417 }) };
  let after = clone(before), burstStep = 0, waiting = 0, waitDuration = 0, started = false;
  const transitions = [], target = { x: -.5, y: -5.9 }, observer = { x: -.5, y: -7.5 };
  const resolveMove = (from, to, budget) => {
    const distance = Math.hypot(to.x - from.x, to.y - from.y), amount = Math.min(distance, budget);
    return distance < 1e-10 ? from : { x: from.x + (to.x - from.x) / distance * amount,
      y: from.y + (to.y - from.y) / distance * amount };
  };
  const load = gait => ({ ...gait, phase: 'load', elapsed: 0, duration: .14, travelMetres: 0, progress: 0,
    pivot: false, redirect: false, blocked: false, blockedElapsed: 0, recoveryReset: false });
  const actorAt = (state, previous, driver, id, elapsed) => driver.tick(elapsed, { primary: {
    id, role: 'live-pressure', x: state.x, y: state.y, floorH: 0, heightM: 2.18, widthM: .68,
    strength: 1, radiusM: 5.2, heading: state.gait.heading, gait: state.gait, motion: 'hunt',
    velocityX: elapsed ? (state.x - previous.x) / elapsed : 0, velocityY: elapsed ? (state.y - previous.y) / elapsed : 0,
  } }).primary;
  for (let i = 0; i <= seconds / dt; i++) {
    const t = i * dt, elapsed = i ? dt : 0, soundHeard = t >= 3;
    const oldBefore = clone(before), oldAfter = clone(after);
    before = stepPressureGait(before.gait, { ...before, dt: elapsed, targetX: target.x, targetY: target.y,
      speed: soundHeard ? 100 : 0, resolveMove });
    let proposalSpeed = soundHeard ? 100 : 0;
    if (soundHeard && !started) { after.gait = load(after.gait); started = true; transitions.push({ t, event: 'heard-fixed-sound/first-burst' }); }
    if (waiting > 0) {
      waiting = Math.max(0, waiting - elapsed); proposalSpeed = 0;
      if (waiting === 0 && Math.hypot(target.x - after.x, target.y - after.y) > .001) {
        after.gait = load(after.gait); proposalSpeed = 100; transitions.push({ t, event: 'next-burst', waitDuration });
      }
    }
    if (after.gait.phase === 'advance' && !after.gait.pivot && !after.gait.redirect) {
      after.gait = { ...after.gait, duration: .28, stepSpeed: after.gait.stepDistanceMetres / .5 / .28 };
    }
    const priorPhase = after.gait.phase;
    after = stepPressureGait(after.gait, { ...after, dt: elapsed, targetX: target.x, targetY: target.y,
      speed: proposalSpeed, resolveMove });
    if (after.gait.phase === 'load') after.gait.duration = .14;
    if (after.gait.phase === 'advance' && !after.gait.pivot && !after.gait.redirect) {
      after.gait.duration = .28; after.gait.stepSpeed = after.gait.stepDistanceMetres / .5 / .28;
    }
    if (priorPhase === 'advance' && after.gait.phase === 'arrest') {
      burstStep++; transitions.push({ t, event: 'accepted-step-complete', burstStep, x: after.x, y: after.y });
      if (burstStep < 3 && Math.hypot(target.x - after.x, target.y - after.y) > .001) after.gait = load(after.gait);
      else {
        burstStep = 0; waitDuration = .8 + (((Math.imul(after.gait.cycle + 1, 2654435761) ^ 4417) >>> 0) / 4294967296) * 1.3;
        waiting = waitDuration; after.gait.duration = waitDuration; after.gait.elapsed = 0;
      }
    }
    const beforeActor = actorAt(before, oldBefore, beforeDriver, 'pursuit-before', elapsed);
    const afterActor = actorAt(after, oldAfter, afterDriver, 'pursuit-proposal', elapsed);
    const result = { t, actor: clone(beforeActor), instance: clone(pressureInstances(beforeActor, null)[0] || null) };
    // Deliberate different root: this fixture is a timing-rule proposal, unlike
    // all animation-only comparisons. Retain both bodies and exact distances.
    result.candidate = candidate.tick(elapsed, afterActor);
    result.proposedActor = clone(afterActor);
    result.diagnostics = { ruleProposal: true, altersGameplayTiming: true, productionInstalled: false,
      baselineRoot: { x: before.x, y: before.y }, proposedRoot: { x: after.x, y: after.y },
      baselineDistanceMetres: Math.hypot(observer.x - before.x, observer.y - before.y) * .5,
      proposedDistanceMetres: Math.hypot(observer.x - after.x, observer.y - after.y) * .5,
      loadSeconds: .14, advanceSeconds: .28, strideMetres: .42, stepsPerBurst: 3,
      waitSeconds: waitDuration, sameResolver: true, contactRangeChanged: false, stopsOutsideContact: true,
      controller: 'actual-stepPressureGait-with-explicit-study-only-duration/speed-proposal' };
    frames.push(result);
  }
  fixtures.push({ id: 'pursuit-burst-study', label: 'RULE PROPOSAL / three-step closing burst', seconds,
    qualification: 'Explicit gameplay-timing proposal, not installed. Baseline actor uses unchanged scheduler; candidate uses same stride/resolver/support but .14s load/.28s advance, three steps then .8–2.1s arrest. Fixed heard target at3s; stop.8m from observer. Contact transactions are not exercised. Requires separate difficulty and fresh-player review.',
    ruleProposal: true, transitions, frames });
}
for (const fixture of fixtures) {
  assert.ok(fixture.frames.every(frame => frame.actor && Number.isFinite(frame.t)));
  assert.ok(fixture.frames.every((frame, i, rows) => !i || frame.t > rows[i - 1].t));
}
writeFileSync(new URL('fixtures.json', output), JSON.stringify(fixtures) + '\n');
console.log(JSON.stringify(fixtures.map(({ id, seconds, frames }) => ({ id, seconds, frames: frames.length })), null, 2));
