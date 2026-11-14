import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createHushBattleBody, fieldSignalCage, usesHushBattleBody } from '../src/render/hush-battle-body.js';
import { hushBattleBodyCamera } from '../src/render/hush-battle-camera.js';
import { HUSH_FALLBACK_SOURCE_SHA256 } from '../src/render/hush-battle-fallback-data.js';
import { makeEncounterStartScene } from '../src/game/encounter-start.js';
import { signalBeingGeometry } from '../src/render/combat-view.js';
import * as scenes from '../src/game/scenes.js';

const battle = (id, art) => ({ id, art, combat: { id } });
const hold = { x: 100, y: 30, w: 260, h: 240 };
const fixture = () => {
  const calls = [];
  const canvas = {};
  const ctx = {
    canvas: { height: 600 }, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
    drawImage(...args) { calls.push(['blit', ...args]); },
    fillRect(...args) { calls.push(['fallback', this.fillStyle, ...args]); },
  };
  const host = { dataset: {} };
  const document = { createElement: () => canvas, getElementById: () => host };
  return { calls, canvas, ctx, document, host };
};

test('only HUSH uses the body; the Hall roster, human vessels and bench keep their identity', () => {
  for (const id of ['natatorium', 'practice', 'practice-room-hush', 'source-final']) {
    assert.equal(usesHushBattleBody(battle(id)), true);
  }
  assert.equal(usesHushBattleBody(battle('source-final', 'surfer')), true, 'retired placeholder cannot claim Source');
  for (const id of ['hall', 'training', 'chapel', 'tower-final', 'guard', 'unknown']) {
    assert.equal(createHushBattleBody(battle(id)), null);
  }
  assert.equal(fieldSignalCage(battle('hall')), 'hall');
  assert.equal(fieldSignalCage(battle('practice-room-hush')), 'practice');
  assert.equal(fieldSignalCage(battle('natatorium', { id:'surfer' })), null, 'authored human art has priority outside Source');
});

test('the live cages preserve their exact procedural return without generating the three-fold core', () => {
  for (const id of ['natatorium', 'practice', 'hall']) {
    for (const intentKind of ['broadcast', 'overload', 'loop', 'silence']) {
      const options = { intentKind, movementIndex: 2, now: 7.2, reducedMotion: false };
      const cage = signalBeingGeometry(id, { ...options, cageOnly:true });
      const old = signalBeingGeometry(id, options);
      // The three-fold points used to perturb overload by consuming its
      // particle indices. All non-loop cage points already preceded them.
      assert.deepEqual(cage.points, old.points.filter(point => !point.core && !point.pressureReturn));
      assert.ok(cage.points.length > 0);
    }
  }
});

test('fallback coverage is generated from the paired model and retains the full black held body', () => {
  const bytes = readFileSync(new URL('../public/assets/hush-density.glb', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), HUSH_FALLBACK_SOURCE_SHA256);
  for (const size of [[1200, 800], [950, 160], [260, 240], [120, 300]]) {
    const [w,h] = size;
    const { span, halfWidth } = hushBattleBodyCamera(w,h);
    assert.ok(span >= 2.85 && halfWidth * 2 >= 1.35 - 1e-9);
  }
  const { calls, ctx, host } = fixture();
  const view = createHushBattleBody(battle('source-final'), { host });
  assert.equal(view.paint(ctx, hold), false);
  assert.equal(host.dataset.hushBattleBodyState, 'fallback');
  const coverage = calls.filter(([, ink]) => ink === '#000');
  assert.ok(coverage.length > 40);
  assert.ok(coverage.every(([, , x, y, w, h]) => x >= hold.x && x+w <= hold.x+hold.w && y >= hold.y && y+h <= hold.y+hold.h));
  view.dispose();
});

test('ready dither frames blit at exact physical coordinates and retire before desktop ownership', async () => {
  const { calls, canvas, ctx, document, host } = fixture();
  let disposed = 0;
  const view = createHushBattleBody(battle('natatorium'), {
    document, createView:() => ({
      ready:Promise.resolve(true),
      draw(...args) { calls.push(['render', ...args]); return true; },
      dispose() { disposed++; }, debug() { return { renderCount:1 }; },
    }),
  });
  assert.equal(await view.warm(), true);
  assert.equal(view.paint(ctx, hold, { clock:99, intentKind:'loop', resolveProgress:.25, reducedMotion:true }), true);
  assert.equal(host.dataset.hushBattleBodyState, 'ready');
  assert.deepEqual(calls, [
    ['render',260,240,{phase:'contained',clock:0,intent:{kind:'loop',progress:.25},reducedMotion:true,reduceFlash:false},false,1,[100,330]],
    ['blit',canvas,100,30,260,240],
  ]);
  view.desktop();
  assert.equal(host.dataset.hushBattleBodyState, 'desktop');
  view.dispose();
  assert.equal(disposed, 1);
  assert.equal(host.dataset.hushBattleBodyState, undefined);
  assert.equal(view.paint(ctx, hold), false);
});

test('load failure and context loss both preserve the held fallback and retire GPU resources', async () => {
  for (const ready of [false,true]) {
    const { ctx, document, host, calls } = fixture();
    let disposed = 0;
    const view = createHushBattleBody(battle('practice'), {
      document, createView:() => ({
        ready: ready ? Promise.resolve(true) : Promise.reject(new Error('texture missing')),
        draw() { return false; }, dispose() { disposed++; },
      }),
    });
    assert.equal(await view.warm(), ready);
    assert.equal(view.paint(ctx, hold), false);
    assert.equal(host.dataset.hushBattleBodyState, 'fallback');
    assert.ok(calls.some(([kind]) => kind === 'fallback'));
    assert.equal(disposed, 1);
    assert.ok(view.debug().error);
    view.dispose();
    assert.equal(disposed, 1);
  }
});

test('splash transfers the warmed body once and abort does not transfer ownership', () => {
  const handed = [];
  const run = aborted => {
    const scene = makeEncounterStartScene({
      battle:battle('source-final'), onConfirm:body => { handed.push(body); return true; },
    });
    scenes.push(scene);
    if (aborted) scenes.remove(scene);
    for (let index=0; index<120; index++) scene.update(1/60);
  };
  try {
    run(true);
    run(false);
    assert.equal(handed.length,1);
    assert.ok(handed[0].paint);
    assert.equal(handed[0].debug().released,false);
    handed[0].dispose();
  } finally { scenes.clear(); }
});
