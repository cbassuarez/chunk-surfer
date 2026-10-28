import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceHushFollow, normalizeSourceHushFollow, SOURCE_HUSH_FOLLOW as F } from '../src/game/source-hush-follow.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET as P } from '../src/game/chunk-surf-god.js';
import { reduceChunkSurf, normalizeChunkSurfState } from '../src/game/chunk-surf-state.js';
import { SOURCE_HANGING_SHORE } from '../src/data/source-hanging-shore.js';
import { SOURCE_DIVIDE_ARRIVAL } from '../src/data/source-braided-divide.js';
import { readFileSync } from 'node:fs';

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

test('the real Source controller pace cannot leave him hundreds of metres behind', () => {
  for (const pace of [2.1, 4.8, .5/.045, Math.SQRT2*.5/.045]) for (let seed=1;seed<=32;seed++) {
    const f=createSourceHushFollow(null,{seed,lineClear:()=>true});
    const p={x:0,z:-20,floor:15.2};f.begin({x:0,z:0,floor:15.2,player:p});
    let settledDistance=0,settledFrames=0;
    for(let i=0;i<45/DT;i++){
      p.z-=pace*DT;f.record(p);const before=f.frame(p);
      f.tick(DT,{player:p,proper:true});const after=f.frame(p);
      assert.ok(Math.hypot(after.x-before.x,after.z-before.z)<=Math.max(F.pace.max,F.properPace.max+F.properPace.catchup)*DT+1e-8,'root jumped');
      assert.equal(after.withinContact,false,'ordinary forward travel forced contact');
      if(i>=30/DT){settledDistance+=after.distance;settledFrames++;}
    }
    assert.ok(settledDistance/settledFrames<32,`${pace}m/s seed ${seed}: left at ${settledDistance/settledFrames}m mean`);
  }
});

test('onward gains are finite, physical, saved, and stop outside involuntary contact', () => {
  for(let seed=1;seed<=16;seed++){
    const f=createSourceHushFollow(null,{seed,lineClear:()=>true});
    const p={x:0,z:-20,floor:0};f.begin({x:0,z:0,floor:0,player:p});f.beginOnward(80);
    const run=(seconds,moving)=>{for(let i=0;i<seconds/DT;i++){
      if(moving)p.z-=11.11*DT;f.record(p);f.tick(DT,{player:p,proper:true,exitDistance:80-(-p.z-20)});
      assert.equal(f.frame(p).withinContact,false);
    }};
    run(3,true);
    assert.equal(f.frame(p).gap,14,'did not spend the two3m gains');
    assert.equal(f.beginOnward(80),false,'re-entering replayed the gains');
    run(12,false);
    assert.ok(f.frame(p).distance>=13.5-1e-8,'a stop spent more than the finite gain');
    const snapshot=JSON.parse(JSON.stringify(f.snapshot()));
    const restored=createSourceHushFollow(snapshot,{seed,lineClear:()=>true});
    assert.deepEqual(restored.snapshot(),snapshot);
    assert.equal(restored.beginOnward(80),false,'reload replayed the gains');
    const before=restored.snapshot();
    for(let i=0;i<600;i++)restored.tick(DT,{player:p,proper:true,busy:true,exitDistance:0});
    assert.deepEqual(restored.snapshot(),before,'blocked presentation moved the body or spent a gain');
  }
});

test('wrong-door sidesteps and waiting do not become an unannounced attack', () => {
  const f=createSourceHushFollow(null,{seed:11,lineClear:()=>true});
  const p={x:0,z:-20,floor:0};f.begin({x:0,z:0,floor:0,player:p});f.beginOnward(40);
  for(let i=0;i<12/DT;i++){
    const t=i*DT;if(t<2)p.z-=10*DT;else if(t<3)p.x+=10.4*DT;else if(t>=6&&t<7)p.x-=10.4*DT;
    f.record(p);f.tick(DT,{player:p,proper:true,exitDistance:40-(-p.z-20)});
    assert.equal(f.frame(p).withinContact,false);
    assert.ok(f.frame(p).distance>=F.onward.floor-1e-8);
  }
  assert.ok(Math.abs(f.frame(p).onward.progress-40.8)<.2,'the real lateral walk was omitted or waiting spent a gain');
  assert.equal(f.frame(p).gap,14,'wrong-door searching exceeded the six-metre budget');
  // Deliberately turning back and approaching retains the warned meeting.
  for(let i=0;i<10/DT&&!f.frame(p).withinContact;i++){
    const h=f.frame(p),d=h.distance,step=Math.min(Math.max(0,d-2.6),4.8*DT);
    p.x+=(h.x-p.x)/d*step;p.z+=(h.z-p.z)/d*step;
    f.record(p);f.tick(DT,{player:p,proper:true,exitDistance:40-(-p.z-20)});
  }
  assert.equal(f.frame(p).withinContact,true,'voluntary meeting was removed');
});

test('reload preserves the walked corner instead of cutting a straight line through it', () => {
  const f=createSourceHushFollow(null,{seed:8,lineClear:()=>false});
  const p={x:0,z:-20,floor:0};f.begin({x:0,z:0,floor:0,player:p});
  // A real trail around a corner; the legacy single-point start cannot imply it.
  for(let z=0;z>=-20;z-=.5)f.record({x:0,z,floor:0});
  for(let x=.5;x<=12;x+=.5)f.record({x,z:-20,floor:0});p.x=12;
  const restored=createSourceHushFollow(JSON.parse(JSON.stringify(f.snapshot())),{seed:8,lineClear:()=>false});
  for(let i=0;i<20/DT;i++){
    restored.record(p);restored.tick(DT,{player:p,proper:true});const h=restored.frame(p);
    assert.ok(Math.abs(h.x)<.01||Math.abs(h.z+20)<.36,'saved follower cut diagonally through the wall');
  }
  const legacy=createSourceHushFollow({active:true,x:0,z:0,floor:0},{lineClear:()=>false});
  legacy.record(p);for(let i=0;i<600;i++)legacy.tick(DT,{player:p,proper:true});
  assert.equal(legacy.frame(p).x,0);assert.equal(legacy.frame(p).z,0,'legacy missing route invented a shortcut');
});

test('choosing onward preserves the physical body, gaze, doors and contact consent', () => {
  const built=buildChunkSurfGodPreset(P.FINAL,{seed:4417});
  const o=built.state.landscapeOrigin;
  const runtime=createSourceSpaceRuntime({initialState:{...built.state,sourceHushFollow:{active:true,x:37.5,z:-507,floor:15.2}}});
  const at={x:o.x+75,y:o.y-1054,facing:3};runtime.setPlayerPosition(at);
  const before=runtime.state(),door=runtime.edgeDoorFrame();
  const result=runtime.beginEdgeDoorApproach();assert.equal(result.handled,true);
  assert.equal(result.position.x,at.x);assert.equal(result.position.y,at.y);assert.equal(result.position.facing,3);
  assert.deepEqual(runtime.edgeDoorFrame(),door);
  assert.deepEqual(runtime.state().sourceContacts,before.sourceContacts);
  assert.equal(runtime.state().finale.route,before.finale.route);
  assert.equal(runtime.hushMode().colliding,false);
  assert.notEqual(at.x,runtime.edgeDoorApproach().x,'fixture accidentally started at the true pair');
  const suspended=runtime.state().sourceHushFollow;
  for(let i=0;i<300;i++)runtime.tick(DT,{px:at.x,py:at.y,facing:3,followerSuspended:true});
  assert.deepEqual(runtime.state().sourceHushFollow,suspended,'background time spent the follower approach');
  // The final landmark's long damage grace is not a freeze of the physical
  // follower. Pauses/dialogue freeze the world owner instead.
  runtime.protectMoment(30);
  const rear=runtime.hushFollowFrame();
  for(let i=1;i<=80;i++){
    const next={...at,y:at.y-i*.16};runtime.setPlayerPosition(next);
    runtime.tick(DT,{px:next.x,py:next.y,facing:3});
  }
  for(let i=0;i<240;i++)runtime.tick(DT,{px:at.x,py:at.y-12.8,facing:3});
  assert.ok(Math.hypot(runtime.hushFollowFrame().x-rear.x,runtime.hushFollowFrame().y-rear.y)>.2,'landmark damage grace froze the entire approach');
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/followerSuspended:paused\|\|document.hidden\|\|!gameplayInputLifecycleActive\(\)/,'native focus does not suspend the physical follower');
  const onward=main.slice(main.indexOf('function walkToEdgeDoor(){'),main.indexOf('// ── THE PHONE BOX'));
  assert.doesNotMatch(onward,/px\s*=|py\s*=|r3dSetFacing|r3dSetLookAngles/,'onward still chooses position or gaze');
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
  // This traversal starts at the forecourt, so use its actual entry trail.
  // FIRST_CONTACT's review body is sixty metres ahead at the separate court;
  // silently shortcutting the gaps between those two places is not following.
  const runtime = createSourceSpaceRuntime({ initialState: {...built.state,sourceHushFollow:{
    active:true,x:10,z:-392,floor:4.2,gap:14,
    trail:[{x:10,z:-392,floor:4.2},{x:4,z:-396,floor:4.2},{x:4,z:-399,floor:4.2}],
  }} });
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
