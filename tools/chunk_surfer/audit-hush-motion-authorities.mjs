// CPU-only, read-only production audit. It writes bounded evidence artifacts;
// it does not change controller rules, generated assets or the playable build.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { freshPressureGait, stepPressureGait, PRESSURE_GAIT } from '../../src/game/pressure-gait.js';
import { createPressurePerformance } from '../../src/game/pressure-performance.js';
import { createSourceHushFollow, SOURCE_HUSH_FOLLOW } from '../../src/game/source-hush-follow.js';
import { freshContinuationHush, advanceContinuationHush } from '../../src/game/source-continuation-hush.js';
import { SOURCE_CONTINUATION } from '../../src/data/source-continuation.js';
import { CELL } from '../../src/data/floorplan/legend.js';
import * as PRES from '../../src/game/presence.js';

const output = new URL('../../artifacts/hush-motion-study/authority/', import.meta.url);
mkdirSync(output, { recursive: true });
const dt = 1 / 60;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const round = n => Number(n.toFixed(7));
const max = rows => Math.max(0, ...rows);
const sum = rows => rows.reduce((a, b) => a + b, 0);
const percentile = (rows, p) => [...rows].sort((a, b) => a - b)[Math.floor((rows.length - 1) * p)] ?? 0;
const fingerprint = path => createHash('sha256').update(readFileSync(new URL('../../' + path, import.meta.url))).digest('hex');
const write = (name, value) => writeFileSync(new URL(name, output), JSON.stringify(value, null, 2) + '\n');
const columns = ['seconds', 'xMetres', 'zMetres', 'headingRadians', 'acceptedSpeedMps', 'phaseOrIntent', 'clipTimeSeconds', 'withinContact'];

function ordinary({ name, ratio, proximity = 0, seconds = 60 }) {
  let state = { x: 0, y: 0, gait: freshPressureGait({ seed: 4417 }) };
  const driver = createPressurePerformance(), rows = [], durations = {}, steps = new Set();
  let travel = 0, peakSpeed = 0, firstMovement = null, yawJump = 0;
  for (let i = 1; i <= seconds / dt; i++) {
    const before = state;
    state = stepPressureGait(state.gait, { ...state, dt, targetX: 0, targetY: -10000, speed: ratio * 1000 / 45, proximity });
    const displacement = Math.hypot(state.x - before.x, state.y - before.y) * CELL;
    travel += displacement; peakSpeed = Math.max(peakSpeed, displacement / dt);
    yawJump = Math.max(yawJump, Math.abs(wrap(state.gait.heading - before.gait.heading)));
    if (displacement > 1e-8 && firstMovement === null) firstMovement = i * dt;
    if (displacement > 1e-8) steps.add(state.gait.cycle);
    durations[state.gait.phase] = (durations[state.gait.phase] || 0) + dt;
    const frame = driver.tick(dt, { primary: { id: 'ordinary', role: 'live-pressure', ...state, gait: state.gait, motion: name === 'chase' ? 'hunt' : name } });
    if (i % 3 === 0) rows.push([round(i * dt), round(state.x * CELL), round(state.y * CELL), round(state.gait.heading), round(displacement / dt), state.gait.phase, round(frame.primary.performance.time), false]);
  }
  return { kind: 'isolated-real-gait-controller', name, proximity, intendedSpeedMps: ratio * 1000 / 45 * CELL,
    seconds, travelMetres: round(travel), averageSpeedMps: round(travel / seconds), peakSpeedMps: round(peakSpeed),
    firstMovementSeconds: round(firstMovement), steps: steps.size, maximumHeadingJumpRadians: round(yawJump),
    phaseSeconds: Object.fromEntries(Object.entries(durations).map(([k, v]) => [k, round(v)])), columns, rows };
}

function source({ pace, proper, seconds = 45, onward = false, turnAt = null }) {
  const controller = createSourceHushFollow(null, { seed: 4417, lineClear: () => true });
  const player = { x: 0, z: -20, floor: 0 };
  controller.begin({ x: 0, z: 0, floor: 0, player });
  if (onward) controller.beginOnward(80);
  const driver = createPressurePerformance(), rows = [], speeds = [], headingJumps = [], distances = [];
  let accepted = 0, closest = Infinity, contactFrames = 0;
  for (let i = 1; i <= seconds / dt; i++) {
    const before = controller.frame(player);
    if (turnAt !== null && i * dt >= turnAt) player.x += pace * dt;
    else player.z -= pace * dt;
    controller.record(player); controller.tick(dt, { player, proper });
    const frame = controller.frame(player), displacement = Math.hypot(frame.x - before.x, frame.z - before.z);
    accepted += displacement; speeds.push(displacement / dt); distances.push(frame.distance);
    closest = Math.min(closest, frame.distance); if (frame.withinContact) contactFrames++;
    headingJumps.push(Math.abs(wrap(frame.heading - before.heading)));
    const presentation = driver.tick(dt, { primary: { id: 'source-follow', role: 'court-trace', x: frame.x / CELL,
      y: frame.z / CELL, heading: frame.heading, heightM: 1.83, motion: frame.speed > .02 ? 'hunt' : 'idle' } });
    if (i % 3 === 0) rows.push([round(i * dt), round(frame.x), round(frame.z), round(frame.heading), round(displacement / dt), frame.intent, round(presentation.primary.performance.time), !!frame.withinContact]);
  }
  return { kind: 'isolated-real-source-follower', pace, proper, onward, turnAt, seconds, acceptedMetres: round(accepted),
    peakSpeedMps: round(max(speeds)), p95SpeedMps: round(percentile(speeds, .95)), averageSpeedMps: round(sum(speeds) / speeds.length),
    settledMeanGapMetres: round(sum(distances.slice(30 / dt)) / distances.slice(30 / dt).length), closestMetres: round(closest),
    contactFrames, maximumHeadingJumpRadians: round(max(headingJumps)), peakAuthoredCyclesPerSecond: round(max(speeds) / .50),
    fullHeightAuthoredCycleMetres: .50, displayedHeightMetres: 1.83, nominalScaledCycleMetres: .50 * 1.83 / 2.18, columns, rows };
}

function sourceRestore() {
  const live = createSourceHushFollow(null, { seed: 4417, lineClear: () => true });
  const player = { x: 0, z: -20, floor: 0 }; live.begin({ x: 0, z: 0, floor: 0, player });
  for (let i = 0; i < 10 / dt; i++) { player.z -= 11.111111 * dt; live.record(player); live.tick(dt, { player, proper: true }); }
  const before = live.frame(player), snapshot = JSON.parse(JSON.stringify(live.snapshot()));
  const restored = createSourceHushFollow(snapshot, { seed: 4417, lineClear: () => true }), after = restored.frame(player);
  let maxDivergence = 0;
  const rows = [];
  for (let i = 1; i <= 3 / dt; i++) {
    player.z -= 11.111111 * dt;
    for (const c of [live, restored]) { c.record(player); c.tick(dt, { player, proper: true }); }
    const a = live.frame(player), b = restored.frame(player), divergence = Math.hypot(a.x - b.x, a.z - b.z);
    maxDivergence = Math.max(maxDivergence, divergence);
    if (i % 3 === 0) rows.push([round(i * dt), round(a.speed), round(b.speed), round(divergence)]);
  }
  return { kind: 'real-source-follower-snapshot-reconstruction', snapshot,
    before: { speed: before.speed, intent: before.intent }, after: { speed: after.speed, intent: after.intent },
    firstThreeSecondsMaximumPositionDivergenceMetres: round(maxDivergence),
    conclusion: 'Position, bearing, gap and breadcrumbs persist; velocity, intent, clocks, pause/notice/filter state and PRNG position do not.',
    columns: ['secondsAfterRestore', 'continuedSpeed', 'restoredSpeed', 'positionDivergenceMetres'], rows };
}

function sourceIICorner() {
  const actor = freshContinuationHush({ x: 0, z: -3, feet: 0 });
  Object.assign(actor, { mode: 'follow', armed: true, elapsed: 10, heading: -Math.PI / 2, warningAnnounced: true,
    trail: [{ kind: 'walk', x: -2, z: -3, feet: 0, chartId: 0 }, { kind: 'walk', x: -2, z: -3.8, feet: 0, chartId: 0 }] });
  const player = { x: 16, z: -3, feet: 0, chartId: 0, phase: 'wrong-return', elapsed: 10, doorOpen: {}, doorMotion: {} };
  const rows = [], jumps = [];
  for (let i = 1; i <= 2 / dt; i++) {
    const before = { x: actor.x, z: actor.z, heading: actor.heading };
    const contact = advanceContinuationHush(actor, { dt, player, events: [] });
    jumps.push(Math.abs(wrap(actor.heading - before.heading)));
    rows.push([round(i * dt), round(actor.x), round(actor.z), round(actor.heading),
      round(Math.hypot(actor.x - before.x, actor.z - before.z) / dt), actor.mode,
      round(actor.animationClock / 2.36 * 2.4), contact]);
  }
  return { kind: 'real-source-II-supported-corner', controlSpeedMps: SOURCE_CONTINUATION.hush.speed,
    maximumHeadingJumpRadians: round(max(jumps)), largestTurnDegrees: round(max(jumps) * 180 / Math.PI),
    rendererCycleMetres: 2.36, generatedClipCycleMetres: .50, impliedSupportDistanceMultiplier: 2.36 / .50,
    columns, rows };
}

function actualPresence() {
  const previousPerformance = globalThis.performance, previousRandom = Math.random;
  let now = 100000, random = 4417;
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
  Math.random = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random / 4294967296; };
  try {
    PRES.loadPresenceState({ awareness: 0, caughtCount: 0 });
    PRES.spawnAtCell(-.5, 5.5, { sector: 'hush-authority-study', gaitSeed: 4417 });
    const driver = createPressurePerformance(); const rows = [], transitions = [];
    let lastPhase = null;
    for (let i = 0; i <= 24 / dt; i++) {
      const t = i * dt; now = 100000 + t * 1000;
      if (i % 180 === 0) PRES.offerSoundTarget({ position: { x: t < 12 ? -.5 : 5.5, y: -2.5 }, level: 1,
        confidence: 1, priority: .96, expiresAt: now + 4500, reason: 'AUDIT_FIXED_ACOUSTIC_EVENT' });
      PRES.updatePresence(i ? dt : 0, -.5, -7.5, null, { suppressContact: true });
      const p = PRES.presenceState(), gait = structuredClone(p.gait);
      const frame = driver.tick(i ? dt : 0, { primary: { id: 'audit-presence', role: 'live-pressure', x: p.x, y: p.y,
        velocityX: p.velocityX, velocityY: p.velocityY, gait, heading: gait.heading, motion: p.behaviorMode === 'chase' ? 'hunt' : p.behaviorMode } });
      const phase = `${gait.cycle}:${gait.phase}`;
      if (phase !== lastPhase) transitions.push({ seconds: round(t), phase, mode: p.behaviorMode,
        target: [p.targetX, p.targetY], root: [p.x, p.y], heading: gait.heading });
      if (i % 3 === 0) rows.push([round(t), round(p.x * CELL), round(p.y * CELL), round(gait.heading), round(p.speed * CELL), gait.phase, round(frame.primary.performance.time), false]);
      lastPhase = phase;
    }
    return { kind: 'actual-Presence-clear-floor-acoustic-fixture', seconds: 24, seed: 4417,
      warning: 'No actual level geometry, player controls or earned encounter. Sound sources refreshed every 3 seconds; observer never supplies target.',
      columns, rows, transitions };
  } finally {
    PRES.despawn(); Math.random = previousRandom;
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: previousPerformance });
  }
}

const ordinaryTraces = [];
for (const proximity of [0, 1]) for (const [name, ratio] of Object.entries({ stalk: .20, chase: .56, investigate: .28, limp: .14, feint: .20 * .82 })) ordinaryTraces.push(ordinary({ name, ratio, proximity }));
const sourceTraces = [];
for (const proper of [false, true]) for (const pace of [2.1, 4.8, CELL / .045, Math.SQRT2 * CELL / .045]) sourceTraces.push(source({ pace, proper, onward: proper }));
sourceTraces.push(source({ pace: CELL / .045, proper: true, turnAt: 20, onward: true }));
write('ordinary-traces.json', ordinaryTraces);
write('source-traces.json', sourceTraces);
write('source-save-restore.json', sourceRestore());
write('source-II-corner.json', sourceIICorner());
write('presence-acoustic-fixture.json', actualPresence());
const withoutRows = value => Object.fromEntries(Object.entries(value).filter(([k]) => !['rows', 'columns'].includes(k)));
const files = ['src/game/pressure-gait.js', 'src/game/presence.js', 'src/game/pressure-performance.js', 'src/game/source-hush-follow.js',
  'src/game/source-continuation-hush.js', 'src/render/source-continuation-renderer.js', 'src/render/pressure-volume.js', 'public/assets/pressure-character.glb'];
const summary = { schema: 1, scope: 'CPU controller audit, not player, render, packaged-native or human validation', dtSeconds: dt,
  fingerprints: Object.fromEntries(files.map(path => [path, fingerprint(path)])), ordinary: ordinaryTraces.map(withoutRows), source: sourceTraces.map(withoutRows),
  sourceRestore: withoutRows(sourceRestore()), sourceII: withoutRows(sourceIICorner()), constants: { ordinary: PRESSURE_GAIT, source: SOURCE_HUSH_FOLLOW } };
write('summary.json', summary);
console.log(JSON.stringify({ output: fileURLToPath(output), ordinary: summary.ordinary, source: summary.source,
  sourceRestore: summary.sourceRestore, sourceII: summary.sourceII }, null, 2));
