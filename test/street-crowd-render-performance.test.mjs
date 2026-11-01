import test from 'node:test';
import assert from 'node:assert/strict';
// Separate module instances give each sequence a fresh grip cache.
import * as fullFirst from '../src/render/street-crowd-performance.js?full-first';
import * as renderFirst from '../src/render/street-crowd-performance.js?render-first';

// Cold solves and reconstructed warm grasps differ only by roundoff.
function close(actual,expected,path='result'){
  if(typeof expected==='number')assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<1e-9,`${path}: ${actual} != ${expected}`);
  else if(Array.isArray(expected)||ArrayBuffer.isView(expected)){assert.equal(actual.length,expected.length,path);for(let i=0;i<expected.length;i++)close(actual[i],expected[i],`${path}[${i}]`);}
  else if(expected&&typeof expected==='object'){assert.deepEqual(Object.keys(actual).sort(),Object.keys(expected).sort(),path);for(const key of Object.keys(expected))close(actual[key],expected[key],`${path}.${key}`);}
  else assert.equal(actual,expected,path);
}

test('render-first caching retains the full animated pose and contact data',()=>{
  const actions=[null,'weight-shift','chair-settle','umbrella-settle','cup-handoff','page-turn','camera-check','placard-lower'];
  for(const d of Object.values(fullFirst.STREET_CROWD_DESIGNS))for(const action of actions)for(const progress of [0,.3,.7,1])for(const reducedMotion of [false,true]){
    const instance={id:d.id,mesh:d.legacyMesh,x:15,y:0,z:30,yaw:1.3},frame={action,progress,part:{dx:.03,dy:.02,dz:-.1,dyaw:.02}},conversation={active:true,weight:.7,speakingWeight:.8,headYaw:.32};
    const opts={frame,timeSec:17+progress*15,reducedMotion,conversation},poseOpts={...opts,yaw:instance.yaw};
    const full=fullFirst.streetCrowdPose(d.id,poseOpts);
    const actual=renderFirst.streetCrowdRenderInstance(instance,opts);
    close(actual,fullFirst.streetCrowdRenderInstance(instance,opts),`${d.id}/${action}: render output`);
    close(actual.character.joints,full.joints,`${d.id}/${action}: renderer retains complete joints`);
    close(renderFirst.streetCrowdPose(d.id,poseOpts),full,`${d.id}/${action}: full contacts after render-first`);
  }
});
