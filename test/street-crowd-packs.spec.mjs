import test from 'node:test';
import assert from 'node:assert/strict';
import {createStreetCrowdPackLoader} from '../src/render/street-crowd-packs.js';
import {STREET_CROWD_CHARACTER_MESHES} from '../src/data/street-crowd-characters.js';
const kit=['street_crowd_folding_chair','street_crowd_camera_tripod'];
function fixture({gate=null,missing=false,reject=false}={}){
  const calls=[],errors=[];
  const props={addCharacterPack:async url=>{calls.push(url);if(gate)await gate;if(reject)throw Error('decode failed');},addPropPack:async url=>{calls.push(url);if(gate)await gate;},characterStats:()=>({meshes:missing?STREET_CROWD_CHARACTER_MESHES.slice(1):STREET_CROWD_CHARACTER_MESHES}),propMeshCatalog:()=>kit};
  return{loader:createStreetCrowdPackLoader({props,onError:error=>errors.push(error.message)}),calls,errors};
}
test('body replacement waits for both real character and fixed-kit packs',async()=>{
  const f=fixture();assert.equal(f.loader.status().ready,false);await f.loader.load();assert.deepEqual(f.loader.status(),{characters:true,props:true,error:null,ready:true});assert.equal(f.calls.length,2);
});
test('a failed decode or missing skin retains legacy bodies and reset permits a later retry',async()=>{
  for(const options of[{missing:true},{reject:true}]){const f=fixture(options);await f.loader.load();assert.equal(f.loader.status().ready,false);assert.ok(f.loader.status().error);assert.equal(f.errors.length,1);f.loader.reset();assert.deepEqual(f.loader.status(),{characters:false,props:false,error:null,ready:false});}
});
test('a renderer reset rejects stale callbacks and an obsolete parent load cannot reacquire readiness',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve),f=fixture({gate}),old=f.loader.reset(),loading=f.loader.load(old);
  const current=f.loader.reset();release();await loading;assert.equal(f.loader.status().ready,false);assert.equal(f.loader.status().characters,false);
  const callCount=f.calls.length;await f.loader.load(old);assert.equal(f.calls.length,callCount);await f.loader.load(current);assert.equal(f.loader.status().ready,true);
});
