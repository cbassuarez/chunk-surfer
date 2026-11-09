import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_III_ARCHIPELAGO as A, ARCHIPELAGO_MAIN_ROUTE as route,
  ARCHIPELAGO_ISLANDS as islands, ARCHIPELAGO_REFUGES as refuges} from '../src/data/source-continuation-archipelago.js';
import {freshSourceContinuation, normalizeSourceContinuation, stepSourceContinuation,
  sourceContinuationGait} from '../src/game/source-continuation.js';
import {freshContinuationHush, continuationSupportedPath, recordContinuationHushWalk,
  advanceContinuationHush, continuationWalkSegment} from '../src/game/source-continuation-hush.js';
import {archipelagoChase, archipelagoExitReady} from '../src/game/source-archipelago-progress.js';

test('the authored navigation graph reconnects negative-height islands through body-clear supported stairs', () => {
  const from = islands.find(i => i.id === 'iii-binding-garden');
  const to = islands.find(i => i.id === 'iii-deep-arcade');
  const path = continuationSupportedPath(from, to, {phase: 'catch', chartId: 0});
  assert.ok(path?.length > 5);
  assert.deepEqual([path[0].x, path[0].z, path[0].feet], [from.x, from.z, from.feet]);
  assert.deepEqual([path.at(-1).x, path.at(-1).z, path.at(-1).feet], [to.x, to.z, to.feet]);
  for (let i = 1; i < path.length; i++) assert.equal(continuationWalkSegment(path[i - 1], path[i]), true);
  assert.ok(path.some(p => p.feet <= -12.6));
});

test('a long refuge rest cannot spend the notice needed to pass its waiting pursuer', () => {
  const refuge = refuges.find(r => r.id === 'iii-refuge-harbour');
  const player = {...refuge, elapsed: 0, doorOpen: {}, doorMotion: {}};
  const actor = {...freshContinuationHush({...refuge, z: refuge.z - 4.1}),
    armed: true, warningAnnounced: true, mode: 'follow', elapsed: 8,
    trail: [{...refuge, kind: 'walk'}], lastRecorded: {...refuge}};
  for (let i = 0; i < 100; i++) {
    recordContinuationHushWalk(actor, player, {protectedRefuge: true});
    assert.equal(advanceContinuationHush(actor, {dt: .05, player, refuge,
      protectedRefuge: true, pace: 5.6}), false);
  }
  // Walk across the bay boundary and past the stationary body. A spent notice
  // would turn this ordinary departure into immediate involuntary contact.
  for (let i = 0; i < 18; i++) {
    player.z -= .26;
    const protectedRefuge = Math.abs(player.z - refuge.z) < refuge.radius;
    recordContinuationHushWalk(actor, player, {protectedRefuge});
    assert.equal(advanceContinuationHush(actor, {dt: .05, player, refuge,
      protectedRefuge, pace: 5.6}), false, 'passing the body retains the departure warning');
  }
  assert.equal(actor.mode, 'notice');
  assert.ok(actor.notice > 1.9);
});

test('one continuous controller walk visits the whole archipelago with two real pursuits, shelter and save/reload', () => {
  // This is the sole staging write: the real supported Catch arrival, with the
  // same physical pursuer behind it. Every later pose is ordinary controller
  // movement; no invulnerability, grace extension, scene jumps or warps.
  const entry = route[0];
  let state = normalizeSourceContinuation({...freshSourceContinuation({runId: 'archipelago-continuous'}),
    ...entry, status: 'active', grace: 0,
    hush: {...freshContinuationHush({...entry, x: -157.8}),
      armed: true, mode: 'follow', elapsed: 8, warningAnnounced: true,
      trail: [{...entry, kind: 'walk'}], lastRecorded: {...entry}},
  });
  const events = [], gaits = new Set(), shelterVisits = [], followerLevels = new Set();
  const followerDistance = [];
  let acceptedMetres = 0, didReload = false, ticks = 0;
  function advance(input = {}) {
    const result = stepSourceContinuation(state, {dt: .1, ...input});
    state = result.state; acceptedMetres += result.acceptedTravelMetres || 0;
    events.push(...result.events); ticks++;
    assert.equal(state.recovery, null, 'route cannot depend on a capture or recovery');
    assert.equal(state.fall, null, 'the authored expedition is physically walked, including its treads');
    assert.equal(state.phase, 'catch');
    assert.equal(state.hush.active, true, 'the same physical actor remains present');
    if (state.hush.animationClock > 0) followerLevels.add(Math.round(state.hush.feet * 10) / 10);
    followerDistance.push(Math.hypot(state.x - state.hush.x, state.z - state.hush.z));
    return result;
  }
  function walk(target, {complete = false} = {}) {
    for (let iteration = 0; iteration < 5000; iteration++) {
      if (state.completed) {assert.equal(complete, true); return;}
      const dx = target.x - state.x, dz = target.z - state.z, d = Math.hypot(dx, dz);
      if (d < .065) {
        assert.ok(Math.abs(state.feet - target.feet) <= .31,
          `supported arrival elevation ${target.x},${target.z}: ${state.feet} vs ${target.feet}`);
        return;
      }
      const running = !!archipelagoChase(state), gait = sourceContinuationGait(state, {run: running});
      gaits.add(gait.gait);
      advance({dt: Math.max(1 / 120, Math.min(.1, d / gait.speed)), forward: 1, run: running,
        look: {yaw: Math.atan2(dx, -dz), pitch: -.08}});
    }
    assert.fail(`stuck walking to ${target.x},${target.z} from ${state.x},${state.z},${state.feet}`);
  }
  // Tread centres are navigation graph vertices. A person holds W through a
  // straight flight instead of braking to visit every 75cm tread centre.
  const guide = route.filter((p, i, rows) => {
    if (!i || i === rows.length - 1 || p.islandId) return true;
    const a = rows[i - 1], b = rows[i + 1];
    return Math.abs((p.x - a.x) * (b.z - p.z) - (p.z - a.z) * (b.x - p.x)) > 1e-5;
  });
  for (const target of guide.slice(1)) {
    walk(target);
    if (target.islandId === 'iii-binding-garden') {
      const before = {visited: [...state.expedition.visited], x: state.x, z: state.z,
        hush: {x: state.hush.x, z: state.hush.z, feet: state.hush.feet}};
      state = normalizeSourceContinuation(JSON.parse(JSON.stringify(state)));
      assert.deepEqual(state.expedition.visited, before.visited);
      assert.deepEqual({x: state.hush.x, z: state.hush.z, feet: state.hush.feet}, before.hush);
      assert.equal(state.x, before.x); assert.equal(state.z, before.z);
      didReload = true;
    }
    if (['iii-soundboard-harbour', 'iii-counterweight-yard'].includes(target.islandId)) {
      const refuge = refuges.find(r => r.islandId === target.islandId);
      walk(refuge);
      const before = state.breath.reserve;
      for (let i = 0; i < 60; i++) advance();
      assert.ok(state.breath.reserve > before || state.breath.reserve >= .99,
        'standing in a real refuge restores the shared breath reserve');
      assert.ok(state.hush.animationClock > 0, 'the pursuer has physically travelled');
      shelterVisits.push({id: refuge.id, playerFeet: state.feet, hushFeet: state.hush.feet,
        separation: Math.hypot(state.x - state.hush.x, state.z - state.hush.z),
        mode: state.hush.mode, breath: state.breath.reserve});
      walk(target);
    }
  }
  assert.equal(didReload, true);
  assert.equal(archipelagoExitReady(state), true);
  for (let i = 0; i < 10; i++) advance();
  walk({x: -126, z: -92, feet: 8.4}, {complete: true});
  assert.equal(state.completed, true, 'the same walk physically clears the unlocked onward door');
  assert.equal(events.filter(e => e.type === 'complete').length, 1);
  assert.ok(A.mainIslandIds.every(id => state.expedition.visited.includes(id)));
  assert.deepEqual(state.expedition.chases, A.chaseSections.map(s => s.id));
  assert.equal(events.filter(e => e.type === 'hush-warning' && e.section).length, 2);
  assert.equal(events.filter(e => e.type === 'pursuit-shelter').length, 2);
  assert.equal(events.some(e => ['capture', 'recovered', 'fold', 'space-wrap'].includes(e.type)), false);
  assert.ok(gaits.has('walk') && gaits.has('sprint') && gaits.has('run'));
  assert.ok(followerLevels.has(8.4) && followerLevels.has(2.4)
    && followerLevels.has(-4.8) && followerLevels.has(-12.6), 'HUSH traverses the real ascending and descending floors');
  assert.ok(acceptedMetres > 1350 && acceptedMetres < 1550);
  assert.ok(state.hush.animationClock > 1200, 'the pursuer cannot remain at entry while the route completes');
  console.log(JSON.stringify({proof: 'continuous-source-controller-archipelago-route',
    elapsedSeconds: state.elapsed, acceptedMetres, followerMetres: state.hush.animationClock,
    playerInputTicks: ticks, visited: state.expedition.visited,
    pursuits: state.expedition.chases, shelterVisits,
    minimumHorizontalSeparation: Math.min(...followerDistance),
    limit: 'Source-controlled physical route with live HUSH and breath; no render, native perception, human discovery or 10-12 minute acceptance claim.'}));
});
