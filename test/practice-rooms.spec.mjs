// The practice suite deals four haunts across eight authored rooms. The rects
// in practice-rooms.js are a second, independent description of a floorplan the
// dressing already describes through `roomHistory`, so the load-bearing check
// here is that the two agree about every prop in the wing.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { CONSERVATORY_PROPS } from '../src/data/conservatory-props.js';
import { ROOM_CELLS, TALISMAN_STAND } from '../src/data/conservatory-script.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {
  DRIFTABLE_MESHES,
  HAUNT_FORBIDDEN_ROOMS,
  PRACTICE_HAUNT,
  PRACTICE_HAUNT_DEAL,
  PRACTICE_ROOMS,
  PRACTICE_ROOM_IDS,
  assignPracticeHaunts,
  chairDriftFor,
  freshPracticeHauntState,
  markPracticeHauntFired,
  normalizePracticeHauntState,
  practiceHauntFor,
  practiceRoomAt,
  practiceRoomById,
  tenantDoorSideX,
  tenantStandCandidates,
} from '../src/game/practice-rooms.js';
import { practiceRoomHushBattle } from '../src/data/combat-definitions.js';

FP.compile(conservatory.levels, {
  width: conservatory.width,
  height: conservatory.height,
  widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [],
  edgePortals: conservatory.edgePortals || [],
  doors: conservatory.doors || [],
});
for (const door of FP.doorState()) FP.setDoorOpen(door.id, true);
PROPS.loadPropState({});
PROPS.propsInit(FP);

// ── the rects agree with the dressing ───────────────────────────────────────
const tagged = CONSERVATORY_PROPS.filter((prop) => prop.roomHistory);
assert.ok(tagged.length > 60, 'the practice suite is dressed with roomHistory tags');
for (const prop of tagged) {
  assert.equal(practiceRoomAt(prop.x, prop.y), prop.roomHistory,
    `${prop.id} at ${prop.x},${prop.y} falls in the rect its roomHistory names`);
}

// Every authored room is actually dressed, and the rects do not overlap.
for (const id of PRACTICE_ROOM_IDS) {
  assert.ok(tagged.some((prop) => prop.roomHistory === id), `${id} has dressing`);
}
for (const a of PRACTICE_ROOMS) {
  for (const b of PRACTICE_ROOMS) {
    if (a.id === b.id) continue;
    const overlaps = a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
    assert.ok(!overlaps, `${a.id} and ${b.id} do not overlap`);
  }
}

// The stair landing dressing is deliberately outside every room.
assert.equal(practiceRoomAt(53.0, 54.2), null, 'the landing desks belong to no room');

// Every room has at least two things you can put a hand on, or a room could draw
// a haunt the player has no way to trigger.
for (const id of PRACTICE_ROOM_IDS) {
  const reachable = tagged.filter((prop) => prop.roomHistory === id && prop.interactive !== false);
  assert.ok(reachable.length >= 2, `${id} has ${reachable.length} inspectable props`);
}

// ── the deal ────────────────────────────────────────────────────────────────
const tally = (assignment) => Object.values(assignment).reduce((acc, haunt) => {
  acc[haunt] = (acc[haunt] || 0) + 1; return acc;
}, {});

for (let seed = 0; seed < 200; seed++) {
  const assignment = assignPracticeHaunts(seed);
  assert.deepEqual(tally(assignment), { chairs: 2, hush: 1, tenant: 1 }, `seed ${seed} deals the budget`);
  assert.equal(Object.keys(assignment).length, PRACTICE_HAUNT_DEAL.length, `seed ${seed} touches four rooms`);
  for (const id of Object.keys(assignment)) {
    assert.ok(PRACTICE_ROOM_IDS.includes(id), `seed ${seed} deals only to real rooms`);
  }
  // Neither loud haunt may land on the talisman room: a fight opens over the
  // line, and a body in the room means nobody is looking for a reflection.
  for (const haunt of [PRACTICE_HAUNT.HUSH, PRACTICE_HAUNT.TENANT]) {
    const room = Object.keys(assignment).find((id) => assignment[id] === haunt);
    assert.ok(room, `seed ${seed} places the ${haunt}`);
    assert.ok(!HAUNT_FORBIDDEN_ROOMS.includes(room),
      `seed ${seed} keeps the ${haunt} out of the talisman room`);
  }
}
for (const adaptiveBand of [-1, 0, 1]) {
  const assignment = assignPracticeHaunts(991, { adaptiveBand });
  assert.deepEqual(tally(assignment), { chairs: 2, hush: 1, tenant: 1 }, `band ${adaptiveBand} preserves the exact budget`);
  for (const haunt of [PRACTICE_HAUNT.HUSH, PRACTICE_HAUNT.TENANT]) {
    const room = Object.keys(assignment).find((id) => assignment[id] === haunt);
    assert.ok(!HAUNT_FORBIDDEN_ROOMS.includes(room), `band ${adaptiveBand} preserves forbidden-room rules`);
  }
}
assert.notDeepEqual(
  assignPracticeHaunts(991, { adaptiveBand: -1 }),
  assignPracticeHaunts(991, { adaptiveBand: 1 }),
  'the bounded band changes deterministic placement and exclusive reveal order',
);

// Deterministic across calls, and neighbouring run ids must not deal the same
// night — xorshift32 correlates on small seeds without the scramble.
assert.deepEqual(assignPracticeHaunts(4242), assignPracticeHaunts(4242), 'the deal is deterministic');
const nights = new Set();
for (let seed = 0; seed < 64; seed++) nights.add(JSON.stringify(assignPracticeHaunts(seed)));
assert.ok(nights.size >= 48, `64 run ids deal ${nights.size} distinct nights`);

// ── firing accounting ───────────────────────────────────────────────────────
{
  const assignment = assignPracticeHaunts(7);
  const roomId = Object.keys(assignment)[0];
  let state = { ...freshPracticeHauntState(7), assignment };
  assert.equal(practiceHauntFor(state, roomId), assignment[roomId]);
  const undealt = PRACTICE_ROOM_IDS.find((id) => !(id in assignment));
  assert.equal(practiceHauntFor(state, undealt), null, 'the four rooms that drew nothing stay scenery');
  assert.equal(practiceHauntFor(state, 'not-a-room'), null);
  assert.equal(practiceHauntFor(freshPracticeHauntState(), roomId), null, 'nothing fires before the night is dealt');
  state = markPracticeHauntFired(state, roomId);
  assert.equal(practiceHauntFor(state, roomId), null, 'a fired room never fires twice');
}

// ── the chair drift ─────────────────────────────────────────────────────────
for (const id of PRACTICE_ROOM_IDS) {
  const rect = practiceRoomById(id);
  const props = PROPS.allProps().filter((prop) => prop.roomHistory === id);
  const poses = chairDriftFor(id, props, 0xbeef);
  assert.ok(Object.keys(poses).length >= 2, `${id} has seating to move`);
  for (const [propId, pose] of Object.entries(poses)) {
    const prop = props.find((p) => p.id === propId);
    assert.ok(DRIFTABLE_MESHES.includes(prop.mesh), `${propId} is furniture, not the upright`);
    const x = prop.x + pose.dx;
    const y = prop.y + pose.dz;
    assert.ok(x >= rect.x0 && x <= rect.x1, `${propId} drifts to x${x.toFixed(2)} inside ${id}`);
    assert.ok(y >= rect.y0 && y <= rect.y1, `${propId} drifts to y${y.toFixed(2)} inside ${id}`);
    assert.ok(Math.abs(pose.dyaw) <= 1.45, `${propId} turns, it does not spin`);
  }
  // Uprights are the datum the drift is legible against and must never move.
  assert.ok(!Object.keys(poses).some((propId) => propId.startsWith('practice-piano-')),
    `${id} leaves its upright where it was authored`);
}
assert.deepEqual(chairDriftFor('nowhere', [], 1), {}, 'an unknown room drifts nothing');

// The room event must traverse the poses over time. The pure layout above owns
// the destination; main owns the short-lived renderer tween that gets there.
{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const start=main.indexOf('function driftPracticeRoom(roomId)');
  const end=main.indexOf('// ── the tenant',start);
  const event=main.slice(start,end);
  assert.match(event,/beginPracticePropMotion\(poses\)/,'the haunt starts a motion rather than writing its destination');
  assert.doesNotMatch(event,/PROPS\.setPropDrift/,'the firing frame must not snap furniture to the final pose');
  assert.match(main,/tickPracticePropMotion\(nowLoopMs\)/,'the frame clock advances the furniture motion');
  assert.match(main,/const PRACTICE_PROP_MOVE_MS=1380/,'the move has enough duration to be seen and heard');
}

// The drift is render-only: applying it must leave the collision cell alone, or
// a rearranged room could wall the player in.
{
  const before = PROPS.allProps().filter((p) => p.roomHistory === 'chamber-spillover')
    .map((p) => ({ id: p.id, rx: p.rx, ry: p.ry, x: p.x, y: p.y }));
  const poses = chairDriftFor('chamber-spillover', PROPS.allProps().filter((p) => p.roomHistory === 'chamber-spillover'), 3);
  for (const [id, pose] of Object.entries(poses)) PROPS.setPropDrift(id, pose);
  for (const snapshot of before) {
    const prop = PROPS.propById(snapshot.id);
    assert.equal(prop.rx, snapshot.rx, `${snapshot.id} keeps its collision cell`);
    assert.equal(prop.ry, snapshot.ry, `${snapshot.id} keeps its collision cell`);
    assert.equal(prop.x, snapshot.x, `${snapshot.id} keeps its interaction point`);
    assert.equal(prop.y, snapshot.y, `${snapshot.id} keeps its interaction point`);
  }
}

// ── save normalization ──────────────────────────────────────────────────────
{
  const fresh = freshPracticeHauntState();
  assert.deepEqual(normalizePracticeHauntState(undefined), fresh);
  assert.deepEqual(normalizePracticeHauntState('nonsense'), fresh);
  assert.deepEqual(normalizePracticeHauntState([1, 2]), fresh);
  const dirty = normalizePracticeHauntState({
    seed: 12, assignment: { 'copied-parts': 'chairs', 'not-a-room': 'chairs' },
    fired: ['cello-lesson', 'not-a-room', 'cello-lesson'], armed: { roomId: 'not-a-room', at: 5 }, stabsFired: 99,
  });
  assert.equal(dirty.assignment, null, 'an assignment naming a room that does not exist is discarded whole');
  assert.deepEqual(dirty.fired, ['cello-lesson'], 'the fired list is filtered and deduped');
  assert.equal(dirty.armed, undefined, 'the stab arming is gone from the state shape');
  assert.equal(dirty.stabsFired, undefined, 'the stab counter is gone from the state shape');
  assert.equal(dirty.seed, 12);

  // A save dealt before the tenant existed carries `stab` rooms. Dropping only
  // those entries would leave a half night, so the whole assignment goes and the
  // seed re-deals it — deterministically, and rooms already fired stay quiet.
  const legacy = normalizePracticeHauntState({
    schema: 1, seed: 4242,
    assignment: { 'copied-parts': 'stab', 'cello-lesson': 'stab', 'exam-preparation': 'chairs', 'coat-and-bag-drop': 'hush' },
    fired: ['exam-preparation'], armed: null, stabsFired: 1,
  });
  assert.equal(legacy.assignment, null, 'a night containing the retired stab haunt is discarded');
  assert.equal(legacy.seed, 4242, 'the seed survives, so the re-deal is the same night every time');
  assert.deepEqual(legacy.fired, ['exam-preparation'], 'rooms already spent stay spent');
  const redealt = { ...legacy, assignment: assignPracticeHaunts(legacy.seed) };
  assert.equal(practiceHauntFor(redealt, 'exam-preparation'), null,
    'a spent room fires nothing even if the re-deal hands it a new haunt');

  const round = normalizePracticeHauntState({ ...freshPracticeHauntState(9), assignment: assignPracticeHaunts(9) });
  assert.deepEqual(round.assignment, assignPracticeHaunts(9), 'a real state round-trips');
}

// ── where somebody stands ───────────────────────────────────────────────────
// The tenant is placed by walking these candidates and taking the first that is
// clear. Two things have to hold or the beat silently never happens: the first
// candidate is at the BACK of the room (so they are the length of the room away
// when you come through the door), and at least one candidate in every room is
// actually standable in the real, dressed building.
for (const id of PRACTICE_ROOM_IDS) {
  const rect = practiceRoomById(id);
  const candidates = tenantStandCandidates(id);
  assert.ok(candidates.length >= 3, `${id} offers somewhere to stand`);

  const doorX = tenantDoorSideX(id);
  assert.ok(Math.abs(candidates[0].x - doorX) > (rect.x1 - rect.x0) / 2,
    `${id} stands at the back, not by the door`);

  for (const c of candidates) {
    assert.ok(c.x >= rect.x0 && c.x <= rect.x1, `${id} candidate x${c.x.toFixed(2)} is inside the room`);
    assert.ok(c.y >= rect.y0 && c.y <= rect.y1, `${id} candidate y${c.y.toFixed(2)} is inside the room`);
    // Giving ground must never carry them past the door and out of the room.
    assert.ok(Math.abs(c.x - doorX) >= Math.abs(candidates[0].x - doorX) - 1.01,
      `${id} candidate stays in the back half`);
  }

  // The load-bearing one: somebody can actually stand in this room tonight.
  const standable = candidates.filter((c) => {
    const at = FP.toRuntimePoint(c);
    return !FP.isSolid(at.x, at.y) && PROPS.propCanOccupy(at.x, at.y);
  });
  assert.ok(standable.length > 0, `${id} has clear floor for somebody to stand on`);
  // And the point the placement picks is inside the room it was dealt for, which
  // is what the despawn-on-leaving test compares against every frame.
  const chosen = FP.toRuntimePoint(standable[0]);
  assert.equal(practiceRoomAt(FP.toAuthoredCoord(chosen.x), FP.toAuthoredCoord(chosen.y)), id,
    `${id} stands somebody inside ${id}, not over a rect boundary`);
}
assert.deepEqual(tenantStandCandidates('nowhere'), [], 'an unknown room has nobody in it');

// ── the fight ───────────────────────────────────────────────────────────────
{
  const battle = practiceRoomHushBattle();
  assert.equal(battle.id, 'practice-room-hush');
  assert.equal(battle.combat.movements.length, 2, 'shorter than the recording battle');
  assert.ok(battle.intro.length && battle.win.length && battle.lose.length, 'the fight is authored in full');
  assert.equal(battle.art, null, 'no boss card: this is a room, not a set piece');
}

// ── the talisman is where the take is ───────────────────────────────────────
{
  const stand = PROPS.propById(TALISMAN_STAND);
  assert.ok(stand, `${TALISMAN_STAND} exists`);
  assert.equal(stand.interactive, false, 'the stand cannot steal the reticle from the fork');
  const room = practiceRoomAt(stand.x, stand.y);
  assert.ok(HAUNT_FORBIDDEN_ROOMS.includes(room), 'the loud haunts are kept out of the room the fork is in');

  const fork = PROPS.setLooseProp('story-tuning-fork', {
    mesh: 'tuning_fork', rx: stand.rx, ry: stand.ry, elevation: 1.21, scale: .38,
    yaw: stand.yaw, blocks: false, action: 'story-tuning-fork',
    inspectAt: { x: stand.interactionX, y: stand.interactionY },
  });
  assert.ok(fork, 'the fork places');
  assert.equal(fork.interactionX, stand.interactionX, 'the fork is aimed at where it is drawn');
  assert.ok(fork.elevation > 1, 'the fork is at chest height, not lost on the floor');

  const mark = FP.toRuntimePoint(ROOM_CELLS.soundnoisemusic);
  const metres = (cell) => (cell + .5) * .5;
  const distance = Math.hypot(fork.x - metres(mark.x), fork.y - metres(mark.y));
  assert.ok(distance < 7, `the fork is ${distance.toFixed(1)}m from the practice mark`);
  assert.ok(PROPS.pathToProp(mark.x, mark.y, 'story-tuning-fork', new Set(['master'])),
    'you can walk from the mark to the fork on the master key');
}

console.log('# practice suite tests ok');
