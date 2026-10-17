import assert from 'node:assert/strict';
import { roofGateEligibility } from '../src/game/roof-access.js';

const keys=(...ids)=>new Set(ids);
assert.deepEqual(roofGateEligibility(keys(),0),{schoolKey:false,recorderCheck:false,canOpen:false});
assert.equal(roofGateEligibility(keys('master'),0).canOpen,false);
assert.equal(roofGateEligibility(keys(),2).canOpen,false);
assert.equal(roofGateEligibility(keys('ren-service'),2).canOpen,false,
  'Ren’s later ladder key is not a substitute for school access');
assert.equal(roofGateEligibility(keys('master'),1).canOpen,true);
assert.equal(roofGateEligibility(keys('master','ren-service'),2).canOpen,true);
console.log('roof access: school key and accepted take are both required');
