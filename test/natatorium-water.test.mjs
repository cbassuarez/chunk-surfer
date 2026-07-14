import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import {
  applyNatatoriumWaterTextVariant,
  computeNatatoriumBasinBounds,
  decideNatatoriumWaterEnvironment,
  makeNatatoriumRippleSources,
  natatoriumWaterBlocks,
  recordNatatoriumWaterChoice,
  waterUvForPoint,
} from '../src/game/natatorium-water.js';
import { freshRunRecord, normalizeRun } from '../src/progression/schema.js';
import { runtimeBattle, runtimeTree } from '../src/narrative/runtime-content.js';

FP.compile(conservatory.levels, {
  width: conservatory.width,
  height: conservatory.height,
  widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [],
});

const bounds = computeNatatoriumBasinBounds(FP);
assert.deepEqual(
  { minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY },
  { minX: 152, minY: 70, maxX: 184, maxY: 88 },
  'water basin bounds are derived from authored W cells',
);
assert.equal(bounds.count, 540);

const firstRun = freshRunRecord({ id: 'run_first', meta: { endingsSeen: [] }, now: 1000 });
assert.equal(firstRun.environment.natatoriumWater, 'drained');
assert.equal(firstRun.environment.routeTrunk, 'baseline');

for (const endingId of ['sacrifice', 'helped']) {
  const env = decideNatatoriumWaterEnvironment({
    meta: { endingsSeen: [endingId], returns: { history: [{ endingId }] } },
    runId: `run_${endingId}`,
    now: 2000,
  });
  assert.equal(env.natatoriumWater, 'murky');
  assert.equal(env.routeTrunk, 'flooded-seal');
}

assert.deepEqual(
  decideNatatoriumWaterEnvironment({
    meta: { endingsSeen: ['surfaced'], returns: { history: [{ endingId: 'surfaced' }] } },
    runId: 'run_surface',
    now: 2000,
  }),
  { natatoriumWater: 'murky', routeTrunk: 'flooded-surface' },
);
assert.deepEqual(
  decideNatatoriumWaterEnvironment({
    meta: { endingsSeen: ['inversion'], returns: { history: [{ endingId: 'inversion' }] } },
    runId: 'run_inversion',
    now: 2000,
  }),
  { natatoriumWater: 'drained', routeTrunk: 'dry-inversion' },
);

const druggedA = decideNatatoriumWaterEnvironment({
  meta: { endingsSeen: ['drugged'], returns: { history: [{ endingId: 'drugged' }] } },
  runId: 'drugged-a',
  now: 2000,
});
const druggedB = decideNatatoriumWaterEnvironment({
  meta: { endingsSeen: ['drugged'], returns: { history: [{ endingId: 'drugged' }] } },
  runId: 'drugged-b',
  now: 2000,
});
assert.equal(druggedA.routeTrunk, 'uncertain');
assert.equal(druggedB.routeTrunk, 'uncertain');
assert.ok(['murky', 'drained'].includes(druggedA.natatoriumWater));
assert.ok(['murky', 'drained'].includes(druggedB.natatoriumWater));

const oldRun = normalizeRun({ id: 'old', status: 'active', ledger: {} });
assert.equal(oldRun.environment.natatoriumWater, 'drained', 'old saves repair to drained baseline');
assert.equal(oldRun.ledger.natatoriumWater.seen, false);

const murkyRun = freshRunRecord({
  id: 'murky',
  meta: { endingsSeen: ['surfaced'], returns: { history: [{ endingId: 'surfaced' }] } },
  now: 3000,
});
assert.equal(natatoriumWaterBlocks(murkyRun, bounds.minX, bounds.minY, bounds), true);
assert.equal(natatoriumWaterBlocks(murkyRun, bounds.minX - 1, bounds.minY, bounds), false);
assert.equal(natatoriumWaterBlocks(firstRun, bounds.minX, bounds.minY, bounds), false);

const uv = waterUvForPoint((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2, bounds);
assert.ok(Math.abs(uv.u - 0.5) < 0.001);
assert.ok(Math.abs(uv.v - 0.5) < 0.001);

const ripples = makeNatatoriumRippleSources({
  run: murkyRun,
  bounds,
  player: { x: bounds.minX - 1, y: bounds.minY + 2 },
  now: 12000,
  audio: 0.5,
});
assert.ok(ripples.length >= 2, 'swell and player proximity both create sources');
assert.ok(ripples.every((source) => Number.isFinite(source.u) && Number.isFinite(source.strength)));
const reduced = makeNatatoriumRippleSources({
  run: murkyRun,
  bounds,
  player: { x: bounds.minX - 1, y: bounds.minY + 2 },
  now: 12000,
  audio: 0.5,
  reduceMotion: true,
});
assert.ok(reduced[0].strength < ripples[0].strength, 'reduced motion suppresses wave energy');

const biased = recordNatatoriumWaterChoice(murkyRun, 'record');
assert.equal(biased.ledger.natatoriumWater.seen, true);
assert.equal(biased.ledger.natatoriumWater.routeBias, 'surface');
assert.equal(biased.ledger.natatoriumWater.rippleSerial, 1);

const listen = applyNatatoriumWaterTextVariant(runtimeTree('room-listen.the_tub', { label: 'THE NATATORIUM' }), murkyRun);
assert.doesNotMatch(JSON.stringify(listen), /no water|empty pool/i);
assert.match(JSON.stringify(listen), /black-green water|water it should not have/i);

const battle = applyNatatoriumWaterTextVariant(runtimeBattle('battle.natatoriumbattle.unnamed'), murkyRun);
assert.doesNotMatch(JSON.stringify(battle.intro), /no water/i);
assert.match(JSON.stringify(battle.intro), /black-green water/i);

const playback = applyNatatoriumWaterTextVariant(runtimeTree('playback.natatoriumplayback.unnamed'), murkyRun);
assert.doesNotMatch(JSON.stringify(playback), /drained pool|basin remains empty/i);
assert.match(JSON.stringify(playback), /filled pool|surface keeps moving/i);

const rendererSource = readFileSync(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
assert.match(rendererSource, /const WATER_FRAG/);
assert.match(rendererSource, /uWaterHeight/);
assert.match(rendererSource, /uWaterBounds/);
assert.match(rendererSource, /surf = 4/);
assert.match(rendererSource, /DEPTH RIDES IN THE ALPHA CHANNEL/);

console.log('natatorium water tests ok');
