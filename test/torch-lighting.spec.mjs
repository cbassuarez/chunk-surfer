import assert from 'node:assert/strict';
import { resolveTorchLook, TORCH_BAND } from '../src/render/lighting-model.js';

assert.equal(resolveTorchLook({on:false,battery:1}).band,TORCH_BAND.OFF);
assert.equal(resolveTorchLook({on:true,battery:.8}).band,TORCH_BAND.CLEAN);
const warm=resolveTorchLook({on:true,battery:.3});
const failing=resolveTorchLook({on:true,battery:.1,timeSec:2});
assert.equal(warm.band,TORCH_BAND.WARM);assert.ok(warm.reach<1);assert.ok(warm.color[2]<.82);
assert.equal(failing.band,TORCH_BAND.FAILING);assert.ok(failing.reach<warm.reach);
assert.deepEqual(resolveTorchLook({on:true,battery:.1,timeSec:2,reducedEffects:true}),resolveTorchLook({on:true,battery:.1,timeSec:9,reducedEffects:true}),
  'reduced effects removes flicker but preserves brownout');
assert.equal(resolveTorchLook({on:true,battery:0}).power,0);
console.log('torch lighting contracts passed');
