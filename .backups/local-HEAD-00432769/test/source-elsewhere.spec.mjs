// SOMEWHERE ELSE: the worlds behind the door-field doors, the crossing into
// them, the light and sound they leak, and the locked doors that answer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ELSEWHERE_CROSSING, ELSEWHERE_CROSSING_SECONDS, ELSEWHERE_WORLDS, LOCKED_DOOR_ANSWER_LINES,
  elsewhereCrossingFrame, lockedDoorAnswer,
} from '../src/data/elsewhere-worlds.js';
import { ELSEWHERE_GLSL, ELSEWHERE_WORLD_COUNT } from '../src/render/elsewhere-glsl.js';
import {
  ELSEWHERE_CROSSING_LOWPASS_HZ, ELSEWHERE_OPEN_LOWPASS_HZ, ELSEWHERE_SHUT_LOWPASS_HZ, elsewhereBedMix,
} from '../src/audio/elsewhere-beds.js';
import { SOURCE_CHAPEL_OUTSKIRTS } from '../src/data/source-level.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { buildBellsGodPreset, buildChapelOutskirtsGodPreset } from '../src/game/chunk-surf-god.js';

// ── The worlds ─────────────────────────────────────────────────────────────
assert.equal(ELSEWHERE_WORLD_COUNT, ELSEWHERE_WORLDS.length);
assert.ok(ELSEWHERE_WORLDS.length >= 6, 'too few worlds for sixteen doors');
assert.equal(new Set(ELSEWHERE_WORLDS.map((world) => world.id)).size, ELSEWHERE_WORLDS.length);
for (let v = 1; v < ELSEWHERE_WORLDS.length; v += 1) {
  assert.match(ELSEWHERE_GLSL, new RegExp(`v==${v}`), `world ${ELSEWHERE_WORLDS[v].id} is never drawn`);
}
assert.match(ELSEWHERE_GLSL, /float ewTrace\(/, 'the worlds are not marched, so they have no depth');
assert.match(ELSEWHERE_GLSL, /if\(key>\.5\)\{[\s\S]*ewTower\(/, 'a key door\'s world has no tower in it');
assert.doesNotMatch(ELSEWHERE_GLSL, /ewStormFlash|bolt/, 'the glass storm keeps a lightning clock of its own');
assert.match(ELSEWHERE_GLSL, /uniform float uStormFlash;[\s\S]*v==4\?uStormFlash/, 'the glass storm does not strike when the night\'s storm does');
{
  const beds = readFileSync(new URL('../src/audio/elsewhere-beds.js', import.meta.url), 'utf8');
  assert.doesNotMatch(beds, /parts\.thunder/, 'a door bed makes up its own thunder');
}
assert.doesNotMatch(ELSEWHERE_GLSL, /\bhalf\b|\bsample\b/, 'a GLSL reserved word is used as a name');

const props = readFileSync(new URL('../src/render/props3d.js', import.meta.url), 'utf8');
const portalFrag = props.slice(props.indexOf('const PORTAL_FRAG'), props.indexOf('let portalProgram'));
assert.match(portalFrag, /\$\{ELSEWHERE_GLSL\}/, 'the openings do not draw the worlds');
assert.match(portalFrag, /elsewhereScene\(/);
assert.match(portalFrag, /if\(dot\(ray,vNormal\)>=0\.0\)discard;/, 'the back of an open door shows elsewhere');
assert.match(props, /export function renderSourceCrossing\(/, 'there is no crossing pass');
assert.match(props, /PORTAL_LIMIT=4/, 'every open door in range is marched at once');
assert.match(props, /gl\.uniform1f\(PU\('uStormFlash'\)/, 'the storm never reaches the openings');

const r3d = readFileSync(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
const voidFrag = r3d.slice(r3d.indexOf('const SOURCE_VOID_PHYSICAL_FRAG'), r3d.indexOf('}`;', r3d.indexOf('const SOURCE_VOID_PHYSICAL_FRAG')));
assert.match(voidFrag, /uniform vec4 uDoorA\[3\];/, 'no door light reaches the ground');
assert.doesNotMatch(voidFrag, /fract\(/);
const draw = r3d.slice(r3d.indexOf('function drawSourceVoidPhysical'), r3d.indexOf('function drawTextSpace'));
assert.ok(draw.indexOf('P3.renderSourceCrossing') > draw.indexOf("sourceVoidPhysicalU('uRain')")
  && draw.indexOf('P3.renderSourceCrossing') < draw.indexOf('presentThroughPost('), 'the crossing is not drawn over the composed void');

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
assert.match(main, /doorFieldLeaks\?\.\(x,y\)/, 'main never asks what the doors leak');
assert.match(main, /doorCrossingFrame\?\.\(\)/, 'main never asks about a crossing');
assert.match(main, /createElsewhereBeds\(/, 'the worlds are silent');
assert.match(main, /answerOutskirtDoor\(result\)/, 'a locked door never answers');

// ── The crossing, pure ─────────────────────────────────────────────────────
{
  const crossing = { startedAt: 10 };
  assert.equal(elsewhereCrossingFrame(crossing, 9.9), null);
  const opening = elsewhereCrossingFrame(crossing, 10 + ELSEWHERE_CROSSING.open / 2);
  assert.equal(opening.phase, 'open');
  assert.ok(opening.reveal > 0 && opening.reveal < 1);
  assert.equal(elsewhereCrossingFrame(crossing, 10 + ELSEWHERE_CROSSING.open + 1).reveal, 1);
  assert.equal(elsewhereCrossingFrame(crossing, 10 + ELSEWHERE_CROSSING.open + 1).phase, 'hold');
  const folding = elsewhereCrossingFrame(crossing, 10 + ELSEWHERE_CROSSING_SECONDS - .1);
  assert.equal(folding.phase, 'fold');
  assert.ok(folding.reveal < .2, 'the fold does not close');
  assert.equal(elsewhereCrossingFrame(crossing, 10 + ELSEWHERE_CROSSING_SECONDS), null, 'a crossing never ends');
  assert.ok(ELSEWHERE_CROSSING_SECONDS >= 2 && ELSEWHERE_CROSSING_SECONDS <= 5, 'a crossing is not a few seconds');
}

// ── Locked doors answer, pure ──────────────────────────────────────────────
{
  const seeds = Array.from({ length: 200 }, (_, i) => (i + .5) / 200);
  assert.ok(seeds.every((seed) => lockedDoorAnswer(seed, 1) === null), 'a locked door answers the first try');
  const answers = seeds.map((seed) => lockedDoorAnswer(seed, 2));
  const occupied = answers.filter(Boolean);
  assert.ok(occupied.length > 60 && occupied.length < 140, 'about half the locked doors are not occupied');
  assert.ok(occupied.some((a) => a.kind === 'rattle') && occupied.some((a) => a.kind === 'knock'));
  for (const answer of occupied) {
    assert.ok(answer.delayMs >= 700 && answer.delayMs <= 1600);
    assert.ok(LOCKED_DOOR_ANSWER_LINES[answer.kind].includes(answer.line));
  }
  assert.deepEqual(lockedDoorAnswer(seeds[3], 4), lockedDoorAnswer(seeds[3], 4), 'answers are not deterministic');
  for (const seed of seeds) assert.equal(!!lockedDoorAnswer(seed, 2), !!lockedDoorAnswer(seed, 5), 'a door is occupied on one try and empty on another');
}

// ── What you hear through a door, pure ─────────────────────────────────────
{
  const shut = elsewhereBedMix({ distanceM: 3, open: false });
  const open = elsewhereBedMix({ distanceM: 3, open: true });
  assert.equal(shut.lowpassHz, ELSEWHERE_SHUT_LOWPASS_HZ);
  assert.equal(open.lowpassHz, ELSEWHERE_OPEN_LOWPASS_HZ);
  assert.ok(open.gain > shut.gain * 2, 'an open door is not much louder than a shut one');
  assert.ok(elsewhereBedMix({ distanceM: 25, open: true }).gain < open.gain / 4, 'distance does not quieten a door');
  assert.ok(elsewhereBedMix({ bearing: Math.PI / 2, open: true }).pan > .5, 'a door to the right is not heard on the right');
  const inside = elsewhereBedMix({ distanceM: 3, bearing: 1, open: true, crossing: 1 });
  assert.equal(inside.lowpassHz, ELSEWHERE_CROSSING_LOWPASS_HZ);
  assert.equal(inside.pan, 0, 'inside a world it still comes from one side');
  assert.ok(inside.gain > open.gain);
}

// ── In the runtime ─────────────────────────────────────────────────────────
const inChapelField = (seed) => {
  const built = buildChapelOutskirtsGodPreset(SOURCE_CHAPEL_OUTSKIRTS.from - SOURCE_CHAPEL_OUTSKIRTS.doorsFrom + 40, { seed, marbleEyes: 'returned' });
  const runtime = createSourceSpaceRuntime({ initialState: built.state });
  runtime.setPlayerPosition(built.position);
  return { runtime, position: built.position };
};
const middleOf = (door) => ({ x: (door.threshold[0].x + door.threshold[1].x) / 2, y: (door.threshold[0].y + door.threshold[1].y) / 2 });
const outFrom = (door, cells) => { const m = middleOf(door); return { x: m.x + door.normal[0] * cells, y: m.y + door.normal[2] * cells }; };
{
  const { runtime } = inChapelField(4417);
  const doors = runtime.doorFieldDoors();
  assert.ok(doors.filter((door) => !door.route).every((door) => door.variant >= 0 && door.variant < ELSEWHERE_WORLDS.length), 'a door opens onto a world that does not exist');
  assert.ok(new Set(doors.filter((door) => !door.route).map((door) => door.variant)).size >= 4, 'the doors all show the same few worlds');
  const [first, second] = doors.filter((door) => !door.route && !door.shut);
  const standing = outFrom(first, 3);
  runtime.setPlayerPosition({ ...standing, facing: 0 });

  // Light leaks from a shut door, and more from an open one.
  const before = runtime.doorFieldLeaks(standing.x, standing.y);
  assert.ok(before.length > 0 && before.length <= 3, 'no door leaks light, or too many do');
  assert.ok(before.every((leak, i) => i === 0 || leak.distanceM >= before[i - 1].distanceM), 'leaks are not nearest first');
  assert.ok(before.every((leak) => leak.distanceM <= 30));
  const shutLeak = before.find((leak) => leak.id === first.id);
  assert.ok(shutLeak && shutLeak.open === false && shutLeak.strength < .5, 'a shut door leaks as much as an open one');
  assert.deepEqual(shutLeak.colour, [...ELSEWHERE_WORLDS[first.variant].leak]);

  runtime.openDoorFieldDoor(first.id);
  runtime.openDoorFieldDoor(second.id);
  const openLeak = runtime.doorFieldLeaks(standing.x, standing.y).find((leak) => leak.id === first.id);
  assert.equal(openLeak.open, true);
  assert.ok(openLeak.strength > shutLeak.strength);

  // The opening carries its frame, so its world sits behind it.
  const portal = runtime.outskirtPortals(standing.x, standing.y).find((entry) => entry.id === first.id);
  assert.ok(portal, 'an opened door shows nothing');
  const [bl, br] = portal.corners;
  assert.deepEqual(portal.origin.map((value) => +value.toFixed(6)), [(bl[0] + br[0]) / 2, (bl[1] + br[1]) / 2, (bl[2] + br[2]) / 2].map((value) => +value.toFixed(6)));
  assert.equal(portal.key, false, 'a chapel door is a tower key');

  // Walking through is a short crossing into that world, then the door is gone.
  assert.equal(runtime.doorCrossingFrame(), null);
  const front = outFrom(first, 1.5), back = outFrom(first, -1.5);
  runtime.onStep(front, back);
  const crossing = runtime.doorCrossingFrame();
  assert.ok(crossing, 'walking through an open door is not a crossing');
  assert.equal(crossing.id, first.id);
  assert.equal(crossing.variant, first.variant);
  assert.equal(crossing.phase, 'inside');
  assert.ok(crossing.realm && Number.isFinite(crossing.realm.pose.x), 'crossing has no actual realm position');
  assert.ok(runtime.doorFieldDoors().find((door) => door.id === first.id).erased, 'the door is still there during its crossing');
  assert.ok(!runtime.doorFieldLeaks(standing.x, standing.y).some((leak) => leak.id === first.id), 'an erased door still leaks');
  const f = crossing.forward, n = first.normal;
  assert.ok(Math.abs(f[0] + n[0]) < 1e-9 && Math.abs(f[1] + n[2]) < 1e-9, 'the crossing does not face into the world');
  // A second door cannot be consumed without starting its own saved visit.
  runtime.onStep(outFrom(second, 1.5), outFrom(second, -1.5));
  assert.equal(runtime.doorCrossingFrame().id, first.id, 'one crossing interrupted another');
  assert.equal(runtime.doorFieldDoors().find((door) => door.id === second.id).erased, false, 'a held crossing consumed another door without its visit');
  const t0 = crossing.startedAt;
  assert.equal(runtime.doorCrossingFrame(t0 + 60).phase, 'inside', 'waiting spent the walking allowance');
  for (let step = 0; runtime.stationRealmFrame().stage === 'inside' && step < 1000; step += 1)
    runtime.moveStationRealm({ dx: Math.floor(step / 8) % 2 ? -.085 : .085 });
  assert.equal(runtime.doorCrossingFrame().phase, 'decohering');
  runtime.advanceStationTime(1.2);
  assert.equal(runtime.doorCrossingFrame(), null);
  assert.equal(runtime.doorCrossingFrame(t0 + 1), null, 'a finished crossing comes back');
}
{
  // A locked door is tried; some of them try back, never on the first go, and
  // none of them open for it.
  let heard = null;
  for (let seed = 4417; seed < 4437 && !heard; seed += 1) {
    const { runtime } = inChapelField(seed);
    for (const door of runtime.doorFieldDoors().filter((entry) => !entry.route && entry.shut)) {
      const first = runtime.openDoorFieldDoor(door.id);
      assert.equal(first.answer ?? null, null, 'a locked door answered the first try');
      assert.ok(first.position && Number.isFinite(first.position.x), 'a locked door does not say where it is');
      const second = runtime.openDoorFieldDoor(door.id);
      assert.deepEqual(second.answer ?? null, lockedDoorAnswer(door.seed, 2));
      assert.equal(second.opened, false);
      assert.equal(runtime.doorFieldDoors().find((entry) => entry.id === door.id).opened, false, 'an answer opened the door');
      if (second.answer) heard = second.answer;
    }
  }
  assert.ok(heard, 'no locked door in twenty fields ever answers');
}
{
  // The tower's two key doors have the tower in their worlds; nothing else does,
  // and the locked tower door itself never answers.
  const built = buildBellsGodPreset(440, { seed: 4417, marbleEyes: 'returned' });
  const runtime = createSourceSpaceRuntime({ initialState: built.state });
  runtime.setPlayerPosition(built.position);
  const doors = runtime.doorFieldDoors();
  const keys = doors.filter((door) => door.key);
  assert.equal(keys.length, 2);
  for (const door of doors.filter((entry) => !entry.route && !entry.shut)) {
    runtime.openDoorFieldDoor(door.id);
    const at = middleOf(door);
    const portal = runtime.outskirtPortals(at.x, at.y).find((entry) => entry.id === door.id);
    assert.ok(portal, `${door.id} shows nothing when open`);
    assert.equal(portal.key, door.key, `${door.id} ${door.key ? 'hides' : 'shows'} the tower`);
  }
  const tower = doors.find((door) => door.route === 'tower');
  for (let i = 0; i < 3; i += 1) assert.equal(runtime.openDoorFieldDoor(tower.id).answer ?? null, null, 'the tower door answered');
}

console.log('source elsewhere specs passed');
