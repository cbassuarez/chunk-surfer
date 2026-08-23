import assert from 'node:assert/strict';
import { ELECTRICAL_HUM_SOURCES, electricalHumAt } from '../src/audio/electrical-hum.js';
import { POWER_CIRCUIT_IDS } from '../src/game/conservatory-power.js';

assert.equal(electricalHumAt(null,{x:37,z:30}).audible,false);
assert.deepEqual([...new Set(ELECTRICAL_HUM_SOURCES.map((source)=>source.circuit))],POWER_CIRCUIT_IDS,
  'every canonical switchable circuit owns a local hum source');
const near=electricalHumAt({live:['sp01']},{x:37,z:30});
assert.equal(near.audible,true);assert.deepEqual(near.circuits,['sp01']);assert.equal(near.primary.label,'S/P-01');
const blocked=electricalHumAt({live:['sp01']},{x:37,z:30},{occlusionDb:()=>36});
assert.ok(blocked.gain<near.gain*.03,'door/wall loss attenuates the real source');
assert.equal(electricalHumAt({live:['sp01']},{x:100,z:80}).audible,false,'a live basement is inaudible in the tower');
assert.equal(electricalHumAt({live:['sp02']},{x:91,z:42}).circuits[0],'sp02');
assert.equal(electricalHumAt({live:['sp04']},{x:56,z:43.5}).primary.label,'S/P-04');
assert.equal(electricalHumAt({live:['sp05']},{x:59.5,z:39.5}).primary.label,'S/P-05');
assert.equal(electricalHumAt({live:['sp03']},{x:102,z:27}).sources.some((source)=>source.id==='sp03-hall'),false,
  'the maintained concert hall is not secretly fed by the FOH breaker');
console.log('electrical hum contracts passed');
