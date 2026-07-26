import assert from 'node:assert/strict';
import { electricalHumAt } from '../src/audio/electrical-hum.js';

assert.equal(electricalHumAt(null,{x:37,z:30}).audible,false);
const near=electricalHumAt({live:['sp01']},{x:37,z:30});
assert.equal(near.audible,true);assert.deepEqual(near.circuits,['sp01']);assert.equal(near.primary.label,'S/P-01');
const blocked=electricalHumAt({live:['sp01']},{x:37,z:30},{occlusionDb:()=>36});
assert.ok(blocked.gain<near.gain*.03,'door/wall loss attenuates the real source');
assert.equal(electricalHumAt({live:['sp01']},{x:100,z:80}).audible,false,'a live basement is inaudible in the tower');
assert.equal(electricalHumAt({live:['sp02']},{x:91,z:42}).circuits[0],'sp02');
console.log('electrical hum contracts passed');
