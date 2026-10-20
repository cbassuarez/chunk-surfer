import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceHushFollow, normalizeSourceHushFollow, SOURCE_HUSH_FOLLOW as F } from '../src/game/source-hush-follow.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET as P } from '../src/game/chunk-surf-god.js';
import { reduceChunkSurf, normalizeChunkSurfState } from '../src/game/chunk-surf-state.js';
import { SOURCE_HANGING_SHORE } from '../src/data/source-hanging-shore.js';
import { SOURCE_DIVIDE_ARRIVAL } from '../src/data/source-braided-divide.js';

const DT = 1 / 60;
function follower(seed = 7) {
  const f = createSourceHushFollow(null, { seed, lineClear: () => true });
  let player = { x: 0, z: -20, floor: 0 };
  f.begin({ x: 0, z: 0, floor: 0, player });
  const run = (seconds, move, options = {}) => {
    let closest = Infinity;
    for (let i = 0; i < seconds / DT; i++) {
      player = move(player);
      f.record(player); f.tick(DT, { player, ...options });
      closest = Math.min(closest, f.frame(player).distance);
    }
    return closest;
  };
  const away = (p) => ({ ...p, z: p.z - 4.8 * DT });
  const toward = (stop = 0) => (p) => {
    const h = f.frame(p), dx = h.x - p.x, dz = h.z - p.z, d = Math.hypot(dx, dz);
    return d > stop ? { ...p, x: p.x + dx / d * 4.8 * DT, z: p.z + dz / d * 4.8 * DT } : p;
  };
  return { f, run, away, toward, player: () => player };
}

test('he follows at his own distance and never closes it on his own', () => {
  const { f, run, away, player } = follower();
  run(10, away);
  const following = f.frame(player());
  assert.ok(following.distance > following.gap - 1, `he closed in while following: ${following.distance}`);
  assert.ok(following.distance < following.gap + 14, 'he was left behind');
  // Standing still, he comes no closer than his distance.
  const closest = run(8, (p) => p);
  assert.ok(closest > f.frame(player()).gap - 1.5, `he crept up on a still player: ${closest}`);
});

test('he is late: a turn toward him is not answered on the same step', () => {
  const { f, run, away, toward, player } = follower();
  run(10, away); run(4, (p) => p);
  const before = f.frame(player());
  run(.3, toward(), { proper: true });
  assert.notEqual(f.frame(player()).intent, 'meet', 'he answered a fresh approach at once');
  assert.ok(before.intent !== 'meet');
});

test('before the lift he gives ground; he never closes in, however you come at him', () => {
  const { f, run, away, toward, player } = follower();
  run(10, away); run(4, (p) => p);
  const closest = run(8, toward());
  assert.ok(closest > F.yield.floor - 1.5, `you reached ${closest.toFixed(2)}m in the nothingness`);
  assert.equal(f.frame(player()).withinContact, false);
  // When you stop, he does not come back at you.
  const still = f.frame(player()).distance;
  run(5, (p) => p);
  assert.ok(f.frame(player()).distance >= still - .3);
});

test('in Source proper you close the distance together, and it stays closed', () => {
  const { f, run, away, toward, player } = follower(31);
  run(10, away); run(3, (p) => p);
  const start = f.frame(player()).distance;
  let travelled = 0, last = player();
  for (let i = 0; i < 8 / DT; i++) {
    const before = player();
    run(DT, toward(2.6), { proper: true });
    travelled += Math.hypot(player().x - before.x, player().z - before.z);
    last = player();
  }
  const met = f.frame(last);
  assert.ok(met.withinContact, `no contact after closing: ${met.distance}`);
  assert.ok(met.distance > 1.5, 'he walked into the body');
  assert.ok(start - met.distance > travelled + 1, 'he did not come to meet you');
  // Walk away now and he keeps the closer distance rather than reopening his old one.
  run(4, away, { proper: true });
  assert.ok(f.frame(player()).gap < 6);
});

test('after a talk he steps back and gives you room', () => {
  const { f, run, away, toward, player } = follower(31);
  run(10, away); run(3, (p) => p);
  run(10, toward(2.6), { proper: true });
  assert.ok(f.frame(player()).withinContact);
  f.release();
  run(6, (p) => p, { proper: true });
  assert.ok(f.frame(player()).distance > 5, 'he did not withdraw');
  assert.equal(f.frame(player()).withinContact, false);
  assert.ok(f.frame(player()).gap >= F.gap.afterTalk);
});

test('the trail loses its loops when you walk back over your own path', () => {
  const f = createSourceHushFollow(null, { seed: 3, lineClear: () => false });
  f.begin({ x: 0, z: 0, floor: 0, player: { x: 0, z: -20, floor: 0 } });
  for (let z = -1; z >= -30; z -= .5) f.record({ x: 0, z, floor: 0 });
  const out = f.frame().trail;
  for (let z = -30; z <= -10; z += .5) f.record({ x: 0, z, floor: 0 });
  assert.ok(f.frame().trail < out - 30, 'walking back did not shorten the trail');
});

test('his state saves and restores, and nonsense does not', () => {
  assert.equal(normalizeSourceHushFollow({ active: true, x: 'a' }).active, false);
  const f = createSourceHushFollow(null, { seed: 1 });
  f.begin({ x: 4, z: -8, floor: 0, player: { x: 4, z: -30, floor: 0 } });
  const back = createSourceHushFollow(JSON.parse(JSON.stringify(f.snapshot())), { seed: 1 });
  assert.deepEqual(back.snapshot(), f.snapshot());
});

// ── Runtime: the room is taken back and he takes the door's place ──────────

function landing() {
  const built = buildChunkSurfGodPreset(P.LANDING, { seed: 4417 });
  const runtime = createSourceSpaceRuntime({ initialState: reduceChunkSurf(built.state, { type: 'SOURCE_LANDING_DOOR_OPENED' }) });
  const o = runtime.state().landscapeOrigin;
  let at = { x: o.x + SOURCE_HANGING_SHORE.portal.x / .5, y: o.y + (SOURCE_HANGING_SHORE.portal.z + .25) / .5, facing: 0 };
  runtime.setPlayerPosition(at);
  const step = (dy) => {
    const to = { ...at, y: at.y + dy };
    const move = runtime.geometry.canStep(at.x, at.y, to.x, to.y);
    if (move.ok) { runtime.onStep(at, to); runtime.setPlayerPosition(to); at = to; }
    runtime.tick(DT, { px: at.x, py: at.y, facing: 0 });
    return move.ok;
  };
  return { runtime, o, step, at: () => at };
}

test('walking out of the open door, the Scene Dock is taken back and HUSH stands where its door was', () => {
  const { runtime, o, step, at } = landing();
  const take = SOURCE_HANGING_SHORE.roomTake;
  // Every piece of the room, its leaf included, has a real transform before it goes.
  const before = runtime.propInstances(at().x, at().y);
  assert.ok(before.some((p) => String(p.id).includes('door-leaf')), 'the FOH leaf is not drawn');
  assert.ok(before.every((p) => p.matrix.every(Number.isFinite)), 'a room piece has a broken transform');
  while (runtime.sourceShoreFrame().distanceFromRoomMetres < take.distance - 1) step(-.16);
  assert.equal(runtime.sourceShoreFrame().roomTaken, 0, 'the room went before he was far enough out');
  assert.equal(runtime.hushFollowFrame().visible, false);
  while (runtime.sourceShoreFrame().roomTaken === 0) step(-.16);
  for (let i = 0; i < (take.seconds + 1) / DT; i++) runtime.tick(DT, { px: at().x, py: at().y, facing: 0 });
  assert.equal(runtime.sourceShoreFrame().roomTaken, 1);
  const hush = runtime.hushFollowFrame();
  assert.equal(hush.visible, true);
  assert.ok(hush.strength > .9);
  const portal = SOURCE_HANGING_SHORE.portal;
  assert.ok(Math.hypot((hush.x - o.x) * .5 - portal.x, (hush.y - o.y) * .5 - portal.z) < 1, 'he is not where the door was');
  // The room and the hall behind it are gone: nothing stands, nothing is furnished.
  assert.equal(runtime.propInstances(at().x, at().y).filter((p) => !String(p.id).startsWith('source-shore-piece:')).length, 0, 'the room\'s things are still there');
  const roomCell = runtime.geometry.cellAt(o.x, o.y);
  assert.ok(!roomCell?.sourceLanding, 'the room\'s floor is still the room');
  assert.equal(runtime.sourceVoidFrame().sceneDock, false);
  // It does not come back.
  const reload = createSourceSpaceRuntime({ initialState: normalizeChunkSurfState(JSON.parse(JSON.stringify(runtime.state()))) });
  reload.setPlayerPosition(at());
  assert.equal(reload.sourceShoreFrame().roomTaken, 1);
  assert.equal(reload.hushFollowFrame().visible, true);
  // Before the lift there is no contact, however close you try to get.
  for (let i = 0; i < 600; i++) step(.16);
  assert.equal(runtime.hushMode().contactAvailable, false);
  assert.ok(runtime.hushFollowFrame().distanceMetres > F.yield.floor - 2);
});

test('in Source proper, closing on him opens contact; a fall through the floor is cut to the forecourt', () => {
  const built = buildChunkSurfGodPreset(P.FIRST_CONTACT, { seed: 4417, injuries: 0, hasRig: false });
  const runtime = createSourceSpaceRuntime({ initialState: built.state });
  const o = built.state.landscapeOrigin;
  let at = { x: o.x + SOURCE_DIVIDE_ARRIVAL.x / .5, y: o.y + SOURCE_DIVIDE_ARRIVAL.z / .5, facing: 0 };
  runtime.setPlayerPosition(at);
  const go = (x, z, ticks = 1) => {
    const to = { x: o.x + x / .5, y: o.y + z / .5, facing: 0 };
    const d = Math.hypot(to.x - at.x, to.y - at.y), n = Math.max(1, Math.ceil(d / .16));
    const from = { ...at };
    for (let i = 1; i <= n; i++) {
      const next = { x: from.x + (to.x - from.x) * i / n, y: from.y + (to.y - from.y) * i / n, facing: 0 };
      const move = runtime.geometry.canStep(at.x, at.y, next.x, next.y);
      assert.ok(move.ok, JSON.stringify(move));
      runtime.onStep(at, next); runtime.setPlayerPosition(next); at = next;
      for (let t = 0; t < ticks; t++) runtime.tick(DT, { px: at.x, py: at.y, facing: 0 });
    }
  };
  runtime.tick(DT, { px: at.x, py: at.y, facing: 0 });
  assert.equal(runtime.hushFollowFrame().visible, true, 'Source proper arrived without him');
  // Walk in, stop, then go back toward him: he comes to meet you.
  go(4, -420, 2);
  for (let i = 0; i < 300; i++) runtime.tick(DT, { px: at.x, py: at.y, facing: 0 });
  assert.equal(runtime.hushMode().contactAvailable, false);
  for (let i = 0; i < 600 && !runtime.hushMode().contactAvailable; i++) {
    const h = runtime.hushFollowFrame(), dx = h.x - at.x, dy = h.y - at.y, d = Math.hypot(dx, dy);
    if (d > 5.5) go((at.x - o.x) * .5 + dx / d * .08, (at.y - o.y) * .5 + dy / d * .08, 2);
    else runtime.tick(DT, { px: at.x, py: at.y, facing: 0 });
  }
  assert.equal(runtime.hushMode().contactAvailable, true, 'closing on him did not open contact');
  // Off the end of the lane stub and down: the fall is cut, once.
  go(0, -424); go(0, -431);
  for (let i = 0; i < 240 && !runtime.state().sourceDivide?.falling; i++) go(0, (at.y - o.y) * .5 - .08);
  let cut = null;
  for (let i = 0; i < 300 && !cut; i++) { runtime.tick(DT, { px: at.x, py: at.y, facing: 0 }); cut = runtime.takeFallCut(); }
  assert.ok(cut, 'falling through the floor was never cut');
  assert.equal(runtime.takeFallCut(), null, 'the cut was handed out twice');
  assert.ok(Math.abs((cut.x - o.x) * .5 - SOURCE_DIVIDE_ARRIVAL.x) < 1e-6 && Math.abs((cut.y - o.y) * .5 - SOURCE_DIVIDE_ARRIVAL.z) < 1e-6);
  assert.equal(runtime.state().sourceDivide.feet, SOURCE_DIVIDE_ARRIVAL.floor);
  assert.equal(runtime.state().sourceDivide.falling, false);
  const behind = runtime.hushFollowFrame();
  assert.ok(behind.visible && (behind.y - o.y) * .5 > SOURCE_DIVIDE_ARRIVAL.z, 'he was not put back behind you in the strata');
});
