// Six metronomes on the practice floor, set to ratios of the wing's clock, that
// settle onto it and ruin takes until they are quieted. This pins the ratios,
// the shared downbeat before they settle, the lock once they have, where they
// stand and which doors shut them in, what a tick does to a take, the restart
// odds, and that none of it is ever a sound the player made.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BATTLE_BPM } from '../src/audio/battle-music.js';
import { METRONOME_FIELD, createMetronomeFieldRuntime } from '../src/audio/metronome-field.js';
import { ROOM_TONE } from '../src/config.js';
import { CONSERVATORY_PROPS } from '../src/data/conservatory-props.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { MESH_SURFACE, MESH_TOP, PROP_BOUNDS } from '../src/data/generated/prop-geometry.js';
import {
  METRONOME_REFERENCE_INDEX, METRONOME_RESTART, METRONOME_SETTLE, PRACTICE_METRONOMES,
  advanceMetronomesSilently, coincidentTicks, freshMetronomeState, metronomeRestartChance,
  metronomeSettleEase, metronomeTempo, metronomeTickLevel, metronomeVoiceAt, practiceMetronomeById, stepMetronomes,
} from '../src/game/practice-metronomes.js';
import { practiceRoomAt, practiceRoomById } from '../src/game/practice-rooms.js';
import * as FP from '../src/world/floorplan.js';

const near = (a, b, tol, message) => assert.ok(Math.abs(a - b) <= tol, `${message} (${a} vs ${b})`);

FP.compile(conservatory.levels, {
  width: conservatory.width,
  height: conservatory.height,
  widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [],
  edgePortals: conservatory.edgePortals || [],
  doors: conservatory.doors || [],
});

// ── the ratios ────────────────────────────────────────────────────────────
assert.equal(BATTLE_BPM, 168);
assert.deepEqual(
  PRACTICE_METRONOMES.map((voice) => Number(metronomeTempo(voice.ratio, 0).toFixed(1))),
  [112, 126, 134.4, 168, 224, 252],
  'unsettled, they run at 2/3, 3/4, 4/5, 1, 4/3 and 3/2 of the clock',
);
assert.equal(PRACTICE_METRONOMES[METRONOME_REFERENCE_INDEX].ratio, 1);
for (const voice of PRACTICE_METRONOMES) {
  near(metronomeTempo(voice.ratio, 1), BATTLE_BPM, 1e-9, `${voice.id} ends on the clock`);
  let previous = metronomeTempo(voice.ratio, 0);
  for (let e = 0.1; e <= 1.0001; e += 0.1) {
    const now = metronomeTempo(voice.ratio, e);
    assert.ok(Math.abs(now - BATTLE_BPM) <= Math.abs(previous - BATTLE_BPM) + 1e-9, `${voice.id} only ever draws closer`);
    previous = now;
  }
  assert.equal(practiceMetronomeById(voice.id), voice);
  assert.equal(voice.label, practiceRoomById(voice.roomId).label, `${voice.id} is named for its room`);
}
assert.equal(practiceMetronomeById('practice-piano-1'), null);
assert.equal(metronomeSettleEase(0), 0);
assert.equal(metronomeSettleEase(METRONOME_SETTLE.seconds), 1);
assert.equal(metronomeSettleEase(METRONOME_SETTLE.seconds * 4), 1);
assert.ok(metronomeSettleEase(METRONOME_SETTLE.seconds / 2) > 0.4 && metronomeSettleEase(METRONOME_SETTLE.seconds / 2) < 0.6);

// ── before they settle: one shared downbeat every sixty beats ─────────────────
{
  const beat = 60 / BATTLE_BPM;
  const period = 60 * beat;                  // ~21.43 s
  let state = freshMetronomeState();
  const dt = 0.004;
  const allTogether = [];
  let t = 0;
  while (t < period * 2 + 0.5) {
    const { state: next, ticks } = stepMetronomes(state, dt, 0);
    state = next; t += dt;
    if (new Set(ticks.map((tick) => tick.index)).size === PRACTICE_METRONOMES.length) allTogether.push(t);
  }
  assert.equal(allTogether.length, 2, `all six land together twice in two periods (${allTogether.map((x) => x.toFixed(2)).join(', ')})`);
  near(allTogether[0], period, dt * 2, 'the first shared tick is sixty beats in');
  near(allTogether[1], period * 2, dt * 2, 'and the next one sixty beats after that');
}

// ── once settled, the floor pulls them into one tick ─────────────────────────
{
  let state = { phases: [0.1, 0.45, 0.8, 0, 0.3, 0.62] };
  for (let i = 0; i < 20 / 0.01; i += 1) state = stepMetronomes(state, 0.01, 1).state;
  const reference = state.phases[METRONOME_REFERENCE_INDEX];
  for (const [index, phase] of state.phases.entries()) {
    const gap = Math.abs(((phase - reference + 0.5) % 1 + 1) % 1 - 0.5);
    assert.ok(gap < 0.01, `voice ${index} has locked to the reference after twenty settled seconds (gap ${gap.toFixed(4)})`);
  }
  // Phases a hair either side of the tick land a whole beat apart if you only
  // take each voice's first tick, so compare every reference tick with the
  // nearest tick of each voice instead: all of them within 15 ms.
  let s = state; let t = 0; const times = PRACTICE_METRONOMES.map(() => []);
  while (t < 2) {
    const r = stepMetronomes(s, 0.001, 1); s = r.state; t += 0.001;
    for (const tick of r.ticks) times[tick.index].push(t - tick.ago);
  }
  const referenceTicks = times[METRONOME_REFERENCE_INDEX].filter((at) => at > 0.5 && at < 1.5);
  assert.ok(referenceTicks.length >= 2, 'the reference ticked');
  let worst = 0;
  for (const at of referenceTicks) {
    for (const voice of times) worst = Math.max(worst, Math.min(...voice.map((v) => Math.abs(v - at))));
  }
  assert.ok(worst < 0.015, `the settled tick is shared (worst ${(worst * 1000).toFixed(1)} ms)`);
}
{
  // Unsettled, there is no pull at all.
  const { state } = stepMetronomes({ phases: [0.4, 0.4, 0.4, 0, 0.4, 0.4] }, 0.1, 0);
  near(state.phases[METRONOME_REFERENCE_INDEX], BATTLE_BPM / 60 * 0.1, 1e-9, 'reference advances at the clock');
  near(state.phases[0], 0.4 + 112 / 60 * 0.1, 1e-9, 'a voice with no pull keeps its own tempo');
}
{
  const { ticks } = stepMetronomes({ phases: [0.99, 0.99, 0.99, 0.99, 0.99, 0.99] }, 0.02, 0);
  assert.equal(ticks.length, 6);
  for (const tick of ticks) assert.ok(tick.ago >= 0 && tick.ago <= 0.02);
  // A long gap moves them on without anybody hearing it.
  const quiet = advanceMetronomesSilently(freshMetronomeState(), 3, 0);
  const loud = (() => { let st = freshMetronomeState(); for (let i = 0; i < 60; i += 1) st = stepMetronomes(st, 0.05, 0).state; return st; })();
  for (const [index, phase] of quiet.phases.entries()) near(phase, loud.phases[index], 1e-6, 'silent catch-up keeps time');
}

// ── where they stand, and what shuts them in ────────────────────────────────
{
  const byId = new Map(CONSERVATORY_PROPS.map((prop) => [prop.id, prop]));
  const hosts = {
    'practice-metronome-lesson': 'practice-piano-2',
    'practice-metronome-claimed': 'practice-piano-4',
    'practice-metronome-rehearsal': 'practice-piano-5',
    'practice-metronome-paper': 'practice-piano-6',
    'practice-metronome-emptied': 'practice-piano-7',
    'practice-metronome-ensemble': 'practice-ensemble-marimba',
  };
  const doors = FP.doorState().filter((door) => /^practice-/.test(door.id));
  const roomsOfDoor = (door) => {
    const ax = FP.toAuthoredCoord(door.cx), ay = FP.toAuthoredCoord(door.cy);
    return new Set([[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => practiceRoomAt(ax + dx * 1.2, ay + dy * 1.2)).filter(Boolean));
  };
  const rooms = new Set();
  for (const voice of PRACTICE_METRONOMES) {
    const prop = byId.get(voice.id);
    assert.ok(prop, `${voice.id} is placed`);
    assert.equal(prop.mesh, 'metronome');
    assert.equal(prop.action, 'practice-metronome', `${voice.id} can be stopped by hand`);
    assert.notEqual(prop.interactive, false);
    assert.equal(prop.blocks, false);
    assert.equal(prop.roomHistory, voice.roomId);
    assert.equal(practiceRoomAt(prop.x, prop.y), voice.roomId, `${voice.id} stands in its room`);
    const host = byId.get(hosts[voice.id]);
    const surface = host.mesh === 'marimba' ? MESH_TOP.marimba : MESH_SURFACE[host.mesh];
    near(prop.elevation, surface, 0.01, `${voice.id} rests on top of ${host.id}`);
    const c = Math.cos(-host.yaw), s = Math.sin(-host.yaw);
    const dx = prop.x - host.x, dy = prop.y - host.y;
    const lx = dx * c - dy * s, lz = dx * s + dy * c;
    const b = PROP_BOUNDS[host.mesh];
    assert.ok(lx > b.min[0] + 0.1 && lx < b.max[0] - 0.1 && lz > b.min[2] + 0.1 && lz < b.max[2] - 0.1,
      `${voice.id} is inside ${host.id}'s footprint (local ${lx.toFixed(2)}, ${lz.toFixed(2)})`);
    // Every door into the room is on the list, and nothing else is.
    const actual = doors.filter((door) => roomsOfDoor(door).has(voice.roomId)).map((door) => door.id).sort();
    assert.deepEqual([...voice.doors].sort(), actual, `${voice.roomId} is shut in by exactly its own doors`);
    rooms.add(voice.roomId);
  }
  assert.equal(rooms.size, 6, 'one metronome to a room');
  assert.ok(!rooms.has('piano-maintenance'), 'the service room keeps the fork to itself');
  assert.ok(!rooms.has('exam-preparation'), 'the exam room metronome is the one that stopped');
  assert.equal(practiceMetronomeById('practice-metronome-claimed').doors.length, 2, 'the claimed room has two ways in');
}

// ── what a tick does to a take ────────────────────────────────────────────
{
  const spoil = ROOM_TONE.spoilNoise;
  const nearBand = spoil * 0.25;
  // Recording in a metronome's own room: spoiled on the first tick.
  assert.ok(metronomeTickLevel({ distance: 3, sameRoom: true }) > spoil, 'a tick in the same room spoils');
  // From the corridor mark, each running metronome alone lands under the line
  // but on the tape; any two landing together are over it.
  const mark = { x: 60, y: 65 };
  const byId = new Map(CONSERVATORY_PROPS.map((prop) => [prop.id, prop]));
  const fromMark = PRACTICE_METRONOMES.map((voice) => {
    const prop = byId.get(voice.id);
    return metronomeTickLevel({ distance: Math.hypot(prop.x - mark.x, prop.y - mark.y), sameRoom: false });
  });
  for (const [index, level] of fromMark.entries()) {
    assert.ok(level < spoil && level > nearBand, `${PRACTICE_METRONOMES[index].id} alone marks the take from the corridor without spoiling it (${level.toFixed(3)})`);
  }
  const quietestPair = [...fromMark].sort((a, b) => a - b).slice(0, 2).reduce((a, b) => a + b, 0);
  assert.ok(quietestPair > spoil, `any two landing together spoil (${quietestPair.toFixed(3)})`);
  // Shut in, all six at once from the mark are under the line.
  const allShut = PRACTICE_METRONOMES.map((voice) => {
    const prop = byId.get(voice.id);
    return metronomeTickLevel({ distance: Math.hypot(prop.x - mark.x, prop.y - mark.y), sameRoom: false, shutIn: true });
  }).reduce((a, b) => a + b, 0);
  assert.ok(allShut < spoil, `a wing shut in is quiet enough even settled (${allShut.toFixed(3)})`);
  assert.ok(metronomeTickLevel({ distance: 2, sameRoom: true, shutIn: true }) < metronomeTickLevel({ distance: 2, sameRoom: true }));

  // Ticks close together are one event; ticks apart are not.
  const groups = coincidentTicks([
    { index: 0, ago: 0.050, level: 0.1 },
    { index: 1, ago: 0.040, level: 0.1 },
    { index: 2, ago: 0.001, level: 0.1 },
    { index: 3, ago: 0.030, level: 0 },
  ]);
  assert.equal(groups.length, 2);
  near(groups[0].level, 0.2, 1e-9, 'two within the window add up');
  assert.deepEqual([...groups[0].indices].sort(), [0, 1]);
  assert.deepEqual(groups[1].indices, [2]);
}

// ── the restart ───────────────────────────────────────────────────────────
{
  assert.equal(metronomeRestartChance({ injuries: 3, anyStopped: true }), 0, 'three injuries is not enough');
  assert.equal(metronomeRestartChance({ injuries: 4, anyStopped: false }), 0, 'nothing stopped, nothing to restart');
  assert.equal(metronomeRestartChance({ injuries: 4, anyStopped: true }), 0.5, 'the first take after the fourth injury: even odds');
  assert.equal(metronomeRestartChance({ injuries: 6, anyStopped: true, rolledBefore: true }), 0.1, 'every take after that: one in ten');
  assert.ok(METRONOME_RESTART.from > 0 && METRONOME_RESTART.to < 1 && METRONOME_RESTART.from < METRONOME_RESTART.to);
}

// ── the voice ─────────────────────────────────────────────────────────────
{
  assert.equal(metronomeVoiceAt({ x: 0, z: 0 }, { x: 20, z: 0 }).gain, 0, 'out of range');
  assert.ok(metronomeVoiceAt({ x: 0, z: 0 }, { x: 2, z: 0 }).gain > metronomeVoiceAt({ x: 0, z: 0 }, { x: 8, z: 0 }).gain);
  assert.ok(metronomeVoiceAt({ x: 0, z: 0 }, { x: 5, z: 0 }).pan > 0, 'to the right is on the right');
}
{
  const starts = [];
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
  const node = (extra = {}) => ({ connect() {}, disconnect() {}, ...extra });
  const context = {
    currentTime: 10,
    createGain: () => node({ gain: param() }),
    createStereoPanner: () => node({ pan: param() }),
    createOscillator: () => node({ type: '', frequency: param(), start: (at) => starts.push(at), stop() {} }),
  };
  const runtime = createMetronomeFieldRuntime({ context, destination: node() });
  const frame = { active: true, voices: PRACTICE_METRONOMES.map((_, i) => ({ gain: i === 5 ? 0 : 0.03, pan: 0, running: i !== 4 })) };
  runtime.update(frame, 10);
  const placed = runtime.sound([
    { index: 0, ago: 0.010 },
    { index: 4, ago: 0.005 },   // stopped
    { index: 5, ago: 0.002 },   // out of earshot
  ], frame, 10);
  assert.equal(placed, 1, 'only a running, audible metronome is voiced');
  assert.equal(starts.length, 2, 'a click and its partition return');
  near(starts[0], 10 + METRONOME_FIELD.lookahead - 0.010, 1e-9, 'placed ahead of the clock by the lookahead, less how long ago it landed');
  assert.equal(runtime.sound([{ index: 0, ago: 0 }], { ...frame, active: false }, 10), 0, 'a fight silences them');
  assert.equal(createMetronomeFieldRuntime({}).sound([{ index: 0, ago: 0 }], frame), 0, 'no audio, nothing voiced, nothing thrown');
}

// ── it is never the player ────────────────────────────────────────────────
{
  const recordist = readFileSync('src/game/recordist.js', 'utf8');
  const fn = recordist.slice(recordist.indexOf('export function emitRoomSourceNoise'), recordist.indexOf('// A discrete burst that STACKS'));
  assert.match(fn, /playerGenerated: false/, 'a room source is never the player');
  assert.match(fn, /audibleToHush: false/, 'and never sends anything after him');
  assert.doesNotMatch(fn, /noiseFloor\(\)/, 'and does not carry his injury');
  const main = readFileSync('src/main.js', 'utf8');
  assert.match(main, /setLoudNoiseSink\?\.\(\(level,reason,meta\)=>\{if\(meta\?\.audibleToHush===false\)return;/, 'the take hunter ignores what the HUSH does not hear');
}
for (const file of ['src/audio/metronome-field.js', 'src/game/practice-metronomes.js']) {
  const text = readFileSync(file, 'utf8');
  assert.doesNotMatch(text, /emitAcoustic|hushNoise|emitNoise/i, `${file} must not reach the noise envelope itself`);
  assert.doesNotMatch(text, /\bhold|\bheld/i, `${file} uses a ruled-out word`);
}

console.log('practice metronomes: ok');
