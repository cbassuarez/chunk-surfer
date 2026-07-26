import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { MATERIAL } from '../src/data/floorplan/legend.js';
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
  { minX: 156, minY: 66, maxX: 180, maxY: 98 },
  'water basin bounds are derived from authored W cells',
);
assert.equal(bounds.count, 768);

for (const y of [29, 30, 31, 32]) {
  const point = FP.toRuntimePoint({ x: 84, y });
  assert.equal(FP.materialAt(point.x, point.y), MATERIAL.poolTile, `lead deck cell ${y} stays dry before the pool`);
  assert.equal(point.y < bounds.minY, true);
}
assert.equal(FP.materialAt(...Object.values(FP.toRuntimePoint({x:84,y:33}))),MATERIAL.wetTile,'pool begins only after the lead deck');

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
assert.equal(natatoriumWaterBlocks(murkyRun, bounds.minX, bounds.minY, bounds), false);
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
const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
assert.match(rendererSource, /const WATER_FRAG/);
assert.match(rendererSource, /uWaterHeight/);
assert.match(rendererSource, /uWaterBounds/);
assert.match(rendererSource, /cur\.mat == MAT_WET/);
assert.match(rendererSource, /surf = 4/);
assert.match(rendererSource, /DEPTH RIDES IN THE ALPHA CHANNEL/);
// The roof spill moved out of main.js into the authored rig
// (src/data/conservatory-lights.js). Assert the lights themselves rather than a
// string in the hub: the natatorium is one of only two places in the building with
// real sky, and that is what makes the drained tile read.
const { allAuthoredLights, LIGHT_KIND } = await import('../src/data/conservatory-lights.js');
const natatoriumLights = allAuthoredLights().filter((light) => light.id.startsWith('natatorium-'));
const spill = natatoriumLights.filter((light) => light.kind === LIGHT_KIND.SKY);
assert.equal(spill.length, 5, 'four roof spills and the end window');
assert.ok(spill.every((light) => light.kind === LIGHT_KIND.SKY),
  'the broad pool exposure is daylight through a failed roof, not a powered fitting');
assert.ok(spill.every((light) => light.circuit === null), 'and it needs no mains');
assert.ok(spill.some((light) => light.id === 'natatorium-roof-spill-north'));
assert.ok(spill.some((light) => light.id === 'natatorium-roof-spill-south'));
const emergency = natatoriumLights.filter((light) => light.kind === LIGHT_KIND.EMERGENCY);
assert.equal(emergency.length, 4, 'the maintained egress route has four wall-mounted emergency fittings');
assert.ok(emergency.every((light) => light.maintained && light.circuit === null && light.anchorPropId),
  'egress lights stay maintained and resolve from their visible wall casings');

console.log('natatorium water tests ok');
