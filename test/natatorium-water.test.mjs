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
  natatoriumDefeatBattery,
  natatoriumWaterBlocks,
  normalizeNatatoriumWaterLedger,
  recordNatatoriumDefeat,
  recordNatatoriumWaterChoice,
  waterUvForPoint,
} from '../src/game/natatorium-water.js';
import { WATER_BODIES } from '../src/game/water-bodies.js';
import * as PROPS from '../src/game/props.js';
import { freshRunRecord, normalizeRun } from '../src/progression/schema.js';
import { runtimeBattle, runtimeTree } from '../src/narrative/runtime-content.js';

FP.compile(conservatory.levels, {
  width: conservatory.width,
  height: conservatory.height,
  widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [],
  edgePortals: conservatory.edgePortals || [],
});

const bounds = computeNatatoriumBasinBounds(FP);
assert.deepEqual(
  { minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY },
  { minX: 156, minY: 66, maxX: 180, maxY: 98 },
  'water basin bounds are derived from authored W cells',
);
assert.equal(bounds.count, 768);
assert.equal(WATER_BODIES.find((body) => body.id === 'natatorium').levelM, -.12);

assert.equal(FP.floorAt(168, 82), -2, 'the existing basin footprint now sits two metres below deck');
const stairFloors = Array.from({ length: 11 }, (_, index) => FP.floorAt(156, 66 + index));
assert.equal(stairFloors.length - 1, 10, 'the west access stair has ten risers');
assert.ok(stairFloors.every((floor, index) => Math.abs(floor - index * -.2) < 1e-5));
for (let index = 0; index < stairFloors.length - 1; index += 1) {
  assert.ok(Math.abs(stairFloors[index + 1] - stairFloors[index]) <= .45);
  assert.equal(FP.canStep(156, 66 + index, 156, 67 + index).ok, true);
  assert.equal(FP.canStep(156, 67 + index, 156, 66 + index).ok, true);
}

function reachable(from, to) {
  const queue = [from];
  const visited = new Set([from.join(',')]);
  for (let index = 0; index < queue.length; index += 1) {
    const [x, y] = queue[index];
    if (x === to[0] && y === to[1]) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = [x + dx, y + dy];
      const key = next.join(',');
      if (visited.has(key) || !FP.canStep(x, y, next[0], next[1]).ok) continue;
      visited.add(key);
      queue.push(next);
    }
  }
  return false;
}
FP.setDoorOpen('pool-lobby', true);
assert.equal(reachable([168, 52], [156, 77]), true, 'the open lobby pair reaches the basin bottom by ordinary walking');
assert.equal(reachable([156, 77], [168, 52]), true, 'the same stair returns from bottom to deck and lobby');

const poolProps = PROPS.propsInit(FP).filter((prop) => prop.id.startsWith('pool-') || prop.id.startsWith('natatorium-'));
const prop = (id) => poolProps.find((entry) => entry.id === id);
assert.equal(prop('pool-lane-markings').floor, -2, 'lane markings follow the basin bottom');
assert.equal(prop('pool-drain-1').floor, -2, 'drains follow the basin bottom');
assert.equal(prop('pool-flags-near').floor, 0, 'flags remain deck anchored');
assert.equal(prop('pool-ladder-west').floor, 0, 'ladders remain deck anchored');
assert.equal(prop('natatorium-roof-structure').floor, 0, 'the roof envelope remains deck anchored');
assert.equal(prop('pool-lane-ropes').floor, -2, 'drained lane ropes rest on the bottom');
assert.equal(prop('pool-lane-ropes').waterlineBody, 'natatorium', 'filled lane ropes opt into waterline anchoring');
assert.equal(poolProps.filter((entry) => entry.id.startsWith('pool-start-')).length, 5);
assert.ok(poolProps.filter((entry) => entry.id.startsWith('pool-start-')).every((entry) => entry.x > 80),
  'all five starting blocks remain clear of the two-metre west stair');

for (const y of [29, 30, 31, 32]) {
  const point = FP.toRuntimePoint({ x: 84, y });
  assert.equal(FP.materialAt(point.x, point.y), MATERIAL.poolTile, `lead deck cell ${y} stays dry before the pool`);
  assert.equal(point.y < bounds.minY, true);
}
assert.equal(FP.materialAt(...Object.values(FP.toRuntimePoint({x:84,y:33}))),MATERIAL.wetTile,'pool begins only after the lead deck');


// THE FIXTURES DID NOT MATCH WHAT THE GAME ACTUALLY STORES.
//
// `returns.history` is an array of summary ID STRINGS and `returns.records` maps
// those ids to summaries — see runtime.js. These fixtures passed history as
// objects (`[{ endingId }]`), which normalizeReturnHistory discards entirely, so
// every assertion below was really being satisfied by the `endingsSeen` fallback
// and the real lookup path was never exercised once. `endingsSeen` is unique
// DISCOVERY order, not the latest return, so a fixture that never leaves it
// cannot catch the thing this file exists to catch.
//
// metaAfter() builds the shape the runtime writes. It also proves the ordering
// rule: the LAST return decides the water, not the first time you saw an ending.
const metaAfter = (...endingIds) => ({
  endingsSeen: [...new Set(endingIds)],
  returns: {
    history: endingIds.map((_, i) => `return:run_${i}`),
    records: Object.fromEntries(endingIds.map((endingId, i) => [`return:run_${i}`, { id: `return:run_${i}`, endingId }])),
  },
});

const firstRun = freshRunRecord({ id: 'run_first', meta: { endingsSeen: [] }, now: 1000 });
assert.equal(firstRun.environment.natatoriumWater, 'drained');
assert.equal(firstRun.environment.routeTrunk, 'baseline');

for (const endingId of ['sacrifice', 'helped']) {
  const env = decideNatatoriumWaterEnvironment({
    meta: metaAfter(endingId),
    runId: `run_${endingId}`,
    now: 2000,
  });
  assert.equal(env.natatoriumWater, 'murky');
  assert.equal(env.routeTrunk, 'flooded-seal');
}

// AND IT IS THE LATEST RETURN THAT DECIDES, NOT THE FIRST ONE SEEN. This is the
// assertion the object-shaped fixtures could never have made: endingsSeen is in
// discovery order, so a player who saw the inversion first and then sealed the
// building would have got a dry natatorium for the rest of time.
assert.equal(
  decideNatatoriumWaterEnvironment({ meta: metaAfter('inversion', 'sacrifice'), runId: 'run_latest', now: 2000 }).routeTrunk,
  'flooded-seal',
  'the most recent return decides the water, not the first ending discovered',
);
assert.equal(
  decideNatatoriumWaterEnvironment({ meta: metaAfter('sacrifice', 'inversion'), runId: 'run_latest2', now: 2000 }).routeTrunk,
  'dry-inversion',
);

assert.deepEqual(
  decideNatatoriumWaterEnvironment({
    meta: metaAfter('surfaced'),
    runId: 'run_surface',
    now: 2000,
  }),
  { natatoriumWater: 'murky', routeTrunk: 'flooded-surface' },
);
assert.deepEqual(
  decideNatatoriumWaterEnvironment({
    meta: metaAfter('inversion'),
    runId: 'run_inversion',
    now: 2000,
  }),
  { natatoriumWater: 'drained', routeTrunk: 'dry-inversion' },
);

const druggedA = decideNatatoriumWaterEnvironment({
  meta: metaAfter('drugged'),
  runId: 'drugged-a',
  now: 2000,
});
const druggedB = decideNatatoriumWaterEnvironment({
  meta: metaAfter('drugged'),
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
assert.deepEqual(
  normalizeNatatoriumWaterLedger(oldRun.ledger.natatoriumWater),
  { seen: false, choice: null, routeBias: null, rippleSerial: 0, soaked: false, defeats: 0, batteryLost: 0 },
  'old saves safely acquire the defeat ledger fields',
);

for (const [before, after, lost] of [[1, 0, 1], [1.5, .5, 1], [.4, 0, .4], [0, 0, 0]]) {
  assert.deepEqual(natatoriumDefeatBattery(before), { before, after, lost, torchOff: after === 0 });
}
const defeatedOnce = recordNatatoriumDefeat(firstRun, { batteryLost: 1 });
const defeatedTwice = recordNatatoriumDefeat(defeatedOnce, { batteryLost: .4 });
assert.equal(defeatedTwice.ledger.natatoriumWater.soaked, true);
assert.equal(defeatedTwice.ledger.natatoriumWater.defeats, 2);
assert.equal(defeatedTwice.ledger.natatoriumWater.batteryLost, 1.4);

const murkyRun = freshRunRecord({
  id: 'murky',
  meta: metaAfter('surfaced'),
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

const battle = applyNatatoriumWaterTextVariant(runtimeBattle('battle.natatorium'), murkyRun);
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
assert.match(rendererSource, /uWaterCamera/);
assert.match(rendererSource, /water\.soaked/);
assert.match(mainSource, /submersionDepthM/);
assert.match(mainSource, /ms\*=1\.45/);
assert.match(mainSource, /RT\.waterFootstep/);
assert.match(mainSource, /applyNatatoriumBattleDefeat/);
assert.match(mainSource, /battle\.combat\?\.id==='natatorium'/,
  'only a live natatorium encounter routes through the soaked battery consequence');
assert.match(mainSource, /SOAKED/);
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
assert.equal(emergency.length, 4, 'the egress route has four wall-mounted emergency fittings');
// NOT battery-backed. `maintained: true` is reserved for the fittings that
// survive a dead house circuit (the atrium exit, the hall entrance pair); the
// pool's egress route was deliberately put on sp02, so killing the pool breaker
// takes its emergency lamps with it — which is the whole point of the beat that
// happens in here. Every one of them still resolves from a visible casing, so
// moving the fitting moves its light.
assert.ok(emergency.every((light) => !light.maintained && light.circuit === 'sp02' && light.anchorPropId),
  'egress lights are fed by the pool circuit and resolve from their wall casings');

console.log('natatorium water tests ok');
