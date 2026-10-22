import test from 'node:test';
import assert from 'node:assert/strict';
import {roofGateEligibility} from '../src/game/roof-access.js';
const keys=(...ids)=>new Set(ids);

test('the gallery service word opens the roof without any recording requirement',()=>{
 assert.equal(roofGateEligibility(keys('master'),'VESPER').canOpen,true);
 assert.equal(roofGateEligibility(keys('master'),' vesper ').canOpen,true);
});
test('accepted take counts no longer replace the roof word',()=>{
 for(const takes of [0,1,2,5,100])assert.equal(roofGateEligibility(keys('master'),takes).canOpen,false);
 for(const word of ['',null,'VESPA','VESPERX'])assert.equal(roofGateEligibility(keys('master'),word).canOpen,false);
});
test('the school master key remains distinct from Ren’s later service-ladder key',()=>{
 assert.equal(roofGateEligibility(keys(),'VESPER').canOpen,false);
 assert.equal(roofGateEligibility(keys('ren-service'),'VESPER').canOpen,false);
 assert.equal(roofGateEligibility(keys('master','ren-service'),'VESPER').canOpen,true);
});
