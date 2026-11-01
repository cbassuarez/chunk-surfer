import test from 'node:test';
import assert from 'node:assert/strict';
import {vigilCharacterPose} from '../src/render/vigil-character-performance.js';
import {VIGIL_CHARACTER_RIGS} from '../src/data/vigil-character-rigs.js';

// Compare every output, including fingertip targets and rotations, against the
// production solver with its cache disabled. No pose or contact may be lost.
function close(actual,expected,path='pose'){
  if(typeof expected==='number'){
    assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<1e-8,`${path}: ${actual} != ${expected}`);
  }else if(Array.isArray(expected)){
    assert.ok(Array.isArray(actual),path);assert.equal(actual.length,expected.length,path);
    expected.forEach((value,i)=>close(actual[i],value,`${path}[${i}]`));
  }else if(expected&&typeof expected==='object'){
    assert.deepEqual(Object.keys(actual).sort(),Object.keys(expected).sort(),path);
    for(const key of Object.keys(expected))close(actual[key],expected[key],`${path}.${key}`);
  }else assert.equal(actual,expected,path);
}
const ids=['ruth','leila','owen','denise','malcolm','kit'];
const actions=[null,'binder-page','weight-shift','flask-check','window-look','umbrella-settle','key-check','photos-sort','map-fold','camera-check'];

test('cached hands reproduce full continuous poses and contacts across actions and conversations',()=>{
  // Seed all hands from idle, then exercise handoffs, action transitions,
  // speech, and moving gaze in changing order.
  for(const id of ids)vigilCharacterPose(id,{timeSec:0});
  for(const id of ids)for(const action of actions)for(const progress of [0,.2,.5,.9,1])for(const reducedMotion of [false,true]){
    const options={action,progress,reducedMotion,timeSec:17+progress*13,conversation:{active:true,speaking:true,weight:.72,speakingWeight:.83,headYaw:.31,elapsedSec:1.2}};
    close(vigilCharacterPose(id,options),vigilCharacterPose(id,{...options,cacheFingers:false}),`${id}/${action}/${progress}/${reducedMotion}`);
  }
});

test('paper-slide actions and custom rigs bypass invariant grasp cache',()=>{
  for(const id of ids){
    const rig=structuredClone(VIGIL_CHARACTER_RIGS[id]);
    const index=rig.find(bone=>bone.name==='index_R');index.tail[0]+=.009;
    for(const action of ['binder-page','photos-sort',null]){
      const options={action,progress:.5,timeSec:26,rig,conversation:{active:true,speaking:true,weight:1,speakingWeight:1,headYaw:-.2}};
      close(vigilCharacterPose(id,options),vigilCharacterPose(id,{...options,cacheFingers:false}),`${id}/${action}/custom`);
    }
  }
});
