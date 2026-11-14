import test from 'node:test';
import assert from 'node:assert/strict';
import { CELL } from '../src/data/floorplan/legend.js';
import { SOURCE_PRE_TAPE } from '../src/data/source-level.js';
import { OUTSKIRTS_VAN_CRASH as CRASH, outskirtsVanCrashPose } from '../src/data/outskirts-van-crash.js';
import { outskirtsPassLayout } from '../src/data/source-outskirts-arrival.js';
import { buildPreTapeGodPreset } from '../src/game/chunk-surf-god.js';
import { GAIT_SPEED } from '../src/game/locomotion.js';
import { DOOR_DRIVE_TEASER, DOOR_DRIVE_WATER_ENTRY, doorDriveTeaserPoseAt } from '../src/game/source-drive/door-teaser.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';

function fixture() {
  const built = buildPreTapeGodPreset(SOURCE_PRE_TAPE.stillLength, { seed: 4417, marbleEyes: 'returned' });
  let runtime = createSourceSpaceRuntime({ initialState: built.state });
  runtime.setPlayerPosition(built.position);
  const wreck = runtime.outskirtsPiece(`r${CRASH.pass}-van`);
  const at = (across, along) => ({ x: (wreck.x + across - CRASH.rest.across) / CELL - .5,
    y: (wreck.z - along + CRASH.rest.along) / CELL - .5, facing: 0 });
  let position = at(0, -.85), time = 0;
  runtime.setPlayerPosition(position);
  const events = [];
  const frame = (dt, options = {}) => {
    time += dt;
    runtime.tickOutskirtsCharacters(dt, options);
    const street = runtime.outskirtsStreetFrame({ time, ...options });
    events.push(...street.events);
    return street.vanCrash;
  };
  return { at, frame, events, get runtime() { return runtime; },
    props: options => runtime.propInstances(position.x, position.y, { time, viewYaw: 0, ...options }),
    step(dt, options) {
      const next = { ...position, y: position.y - 1 };
      const move = runtime.geometry.canStep(position.x, position.y, next.x, next.y);
      assert.ok(move.ok, `crash blocks the lane at y=${position.y}: ${move.why}`);
      assert.equal(move.redirect, undefined);
      runtime.setPlayerPosition(next);
      runtime.onStep(position, next);
      position = next;
      return frame(dt, options);
    },
    reload() {
      runtime = createSourceSpaceRuntime({ initialState: JSON.parse(JSON.stringify(runtime.state())) });
      runtime.setPlayerPosition(position);
    },
  };
}

test('the falling van, asphalt contact, sprung doors and spill share one playable road beat', () => {
  const f = fixture(), dt = CELL / GAIT_SPEED.sprint;
  const wreckId = `r${CRASH.pass}-van`;
  assert.equal(f.frame(0)?.phase, 'waiting');
  assert.ok(!f.props().some(p => p.id === wreckId), 'the wreck is already in place on approach');
  let frame;
  for (let i = 0; i < 3; i++) frame = f.step(dt);
  assert.equal(frame.phase, 'fall');
  assert.ok(f.props().some(p => p.mesh === 'drive_vehicle_body' && p.id === 'outskirts-van-crash:body'));
  assert.ok(f.props().some(p => p.mesh === 'drive_cabin'));
  assert.ok(f.props().some(p => p.id === 'outskirts-van-crash:body:service-paint'));
  assert.equal(f.props().filter(p => p.id.startsWith('outskirts-van-crash:headlamp-')).length, 2);
  const startZ = frame.z, startHeight = frame.y;
  while (frame.phase === 'fall') frame = f.step(dt);
  assert.equal(frame.phase, 'impact');
  assert.ok(frame.z < startZ - 6 && startHeight - frame.y > 14, 'the nose-first descent must also travel forward');
  assert.ok(f.props().some(p => p.id.startsWith('outskirts-van-crash:spark-')));
  while (!frame.wreck) frame = f.step(dt);
  assert.equal(frame.door, 0);
  const closed = f.props().find(p => p.id === `${wreckId}:rearDoorFar`).matrix;
  while (frame.door < 1) frame = f.step(dt);
  const open = f.props().find(p => p.id === `${wreckId}:rearDoorFar`).matrix;
  assert.notDeepEqual(Array.from(open), Array.from(closed));
  assert.ok(f.props().some(p => p.id === 'outskirts-van-spill:sheet-main'));
  assert.ok(!f.props().some(p => p.mesh === 'source_return_fish_body'), 'fish preceded the first wash');
  while (frame.spillElapsed < .5) frame = f.frame(dt);
  assert.ok(f.props().some(p => p.mesh === 'source_return_fish_body'));
  assert.ok(f.props().some(p => p.id === wreckId && p.mesh === 'van_wreck_hull'));
  assert.ok(!f.props().some(p => p.id === 'outskirts-van-crash:body'));
  assert.deepEqual(f.events.filter(e => e.id.startsWith('van-crash:')).map(e => e.cue),
    ['van-crash-approach', 'van-crash-impact', 'van-crash-settle', 'van-crash-spill']);
  for (const event of f.events.filter(e => e.id.startsWith('van-crash:'))) {
    assert.ok(Number.isFinite(event.x) && Number.isFinite(event.y) && Number.isFinite(event.z));
  }
  const verge = f.at(CRASH.rest.across, CRASH.rest.along);
  assert.equal(f.runtime.geometry.canStep(verge.x, verge.y + 1, verge.x, verge.y).ok, false, 'the grounded wreck has no collision');
  const lane = f.at(0, CRASH.rest.along);
  assert.equal(f.runtime.geometry.canStep(lane.x, lane.y + 1, lane.x, lane.y).ok, true);
});

test('suspending holds the pose, pre-impact reload preserves the fall, and post-impact reload preserves the wreck', () => {
  const f = fixture();
  for (let i = 0; i < 4; i++) f.step(.16, { reducedMotion: true });
  const before = f.frame(.3, { reducedMotion: true });
  assert.equal(before.phase, 'fall');
  assert.deepEqual(f.frame(1.5, { suspended: true, reducedMotion: true }), before);
  f.reload();
  const resumed = f.frame(.1, { reducedMotion: true });
  assert.equal(resumed.phase, 'fall');
  f.frame(CRASH.impactAt, { reducedMotion: true });
  assert.equal(f.events.filter(e => e.cue === 'van-crash-impact').length, 1);
  f.reload();
  const restored = f.frame(.1, { reducedMotion: true });
  assert.equal(restored.phase, 'wreck');
  assert.equal(restored.fired, true);
  assert.ok(f.props().some(p => p.id === `r${CRASH.pass}-van` && p.mesh === 'van_wreck_hull'));
  const { puddle } = f.runtime.outskirtsReflection();
  assert.ok(puddle[2] > 2 && puddle[0] > restored.outlet.x, 'the spill remains as a road reflection after reload');
  assert.equal(f.props().filter(p => p.mesh === 'source_return_fish_body').length, 7);
  assert.ok(!f.props().some(p => p.id === 'outskirts-van-spill:sheet-main'));
  assert.deepEqual(f.events.filter(e => e.id.startsWith('van-crash:')).map(e => e.cue),
    ['van-crash-approach', 'van-crash-approach', 'van-crash-impact']);
});

test('the crash clock can advance on a slow render without accelerating the underlying street', () => {
  const f = fixture();
  for (let i = 0; i < 3; i++) f.step(.04, { crashDt: .14 });
  const before = f.runtime.outskirtsCharacterFrame().clock;
  assert.equal(f.frame(.04, { crashDt: .14 }).elapsed, .14);
  assert.ok(Math.abs(f.runtime.outskirtsCharacterFrame().clock - before - .04) < .00001);
});

test('a rearward look preserves the crash and an overlapping save can escape toward the lanes', () => {
  const f = fixture();
  for (let i = 0; i < 4; i++) f.step(.1, { viewYaw: Math.PI });
  assert.equal(f.frame(0).phase, 'waiting');
  for (let i = 0; i < 3; i++) f.step(.1, { viewYaw: Math.PI });
  assert.equal(f.frame(0).phase, 'fall');
  f.frame(CRASH.duration, { viewYaw: Math.PI });
  assert.equal(f.events.filter(event => event.cue === 'van-crash-impact').length, 1);

  const inside = f.at(CRASH.rest.across, CRASH.rest.along);
  const { geometry } = f.runtime;
  assert.ok(geometry.canStep(inside.x, inside.y, inside.x + 1, inside.y).ok);
  assert.equal(geometry.canStep(inside.x, inside.y, inside.x - 1, inside.y).ok, false);
  const outside = f.at(CRASH.rest.across + 1.65, CRASH.rest.along);
  assert.equal(geometry.canStep(outside.x, outside.y, outside.x - 1, outside.y).ok, false);
});

test('reduced motion preserves the plunge, the road strike and the authored resting pose', () => {
  const f = fixture();
  for (let i = 0; i < 3; i++) f.step(.1);
  const {contact} = f.frame(CRASH.impactAt);
  const p = f.at(0, 15.1);
  assert.ok(Math.abs(contact.y - (f.runtime.geometry.floorAt(p.x, p.y) + .025)) < .012, 'the lowest bumper corner misses the road surface');
  const settled = outskirtsVanCrashPose(CRASH.duration);
  const authored = outskirtsPassLayout(CRASH.pass).find(piece => piece.id === 'van');
  for (const key of ['across', 'along', 'yaw', 'y', 'pitch', 'roll']) {
    assert.ok(Math.abs(settled[key] - authored[key]) < .00001, `${key} jumps when the wreck stops moving`);
  }
  assert.deepEqual(outskirtsVanCrashPose(CRASH.duration, true), settled);
  assert.deepEqual(outskirtsVanCrashPose(1, true), outskirtsVanCrashPose(1));
  const reduced = outskirtsVanCrashPose(2.02, true), full = outskirtsVanCrashPose(2.02);
  assert.equal(reduced.across, full.across);
  assert.equal(reduced.along, full.along);
  assert.ok(reduced.roll < full.roll);
});

test('the M62 fall retains the bluff’s heading and the relative timing of its pitch and drop', () => {
  const start = doorDriveTeaserPoseAt(DOOR_DRIVE_TEASER.fallStart);
  const end = doorDriveTeaserPoseAt(DOOR_DRIVE_WATER_ENTRY);
  const middle = doorDriveTeaserPoseAt((DOOR_DRIVE_TEASER.fallStart + DOOR_DRIVE_WATER_ENTRY) / 2);
  const first = outskirtsVanCrashPose(0), half = outskirtsVanCrashPose(CRASH.impactAt / 2);
  const ratio = (start, middle, end) => (middle - start) / (end - start);
  assert.ok(Math.abs(ratio(first.pitch, half.pitch, CRASH.impact.pitch) - ratio(start.pitch, middle.pitch, end.pitch)) < 1e-9);
  assert.ok(Math.abs(ratio(first.y, half.y, CRASH.impact.y) - ratio(start.position.y, middle.position.y, end.position.y)) < 1e-9);
  assert.ok(Math.abs(first.yaw - CRASH.impact.yaw) < .03);
});
