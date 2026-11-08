import test from 'node:test';
import assert from 'node:assert/strict';
import {createCrashDebris,CRASH_DEBRIS} from '../src/game/source-drive/crash-debris.js';

const near=(a,b,e=1e-6,msg)=>assert.ok(Math.abs(a-b)<e,`${msg||'near'}: ${a} != ${b}`);
const anchor={x:-4.7,y:8.1,z:-303.2};
const run=(d,{step=1/60,seconds=3}={})=>{for(let t=0;t<seconds-1e-9;t+=step){
  const f=Math.max(0,t);
  d.step({fallSeconds:f,waterSeconds:t>2?t-2:-1,sceneAnchor:anchor,position:[anchor.x,anchor.y-20,anchor.z+2]});
}};

test('nothing before the fall, dust the moment it starts',()=>{
  const d=createCrashDebris();
  assert.equal(d.step({fallSeconds:-1,waterSeconds:-1,sceneAnchor:anchor}).length,0);
  const first=d.step({fallSeconds:0,waterSeconds:-1,sceneAnchor:anchor,position:[anchor.x,anchor.y,anchor.z]});
  assert.equal(first.filter(p=>p.mesh==='wind_leaf_blade_pale').length,CRASH_DEBRIS.dust.count);
  assert.ok(first.every(p=>Math.abs(p.x-anchor.x)<6&&Math.abs(p.z-anchor.z)<7),'dust starts at the snapped rail');
});

test('gravel joins at its beat, arcing under gravity',()=>{
  const d=createCrashDebris();
  d.step({fallSeconds:.14,waterSeconds:-1,sceneAnchor:anchor});
  assert.equal(d.step({fallSeconds:.15,waterSeconds:-1,sceneAnchor:anchor}).filter(p=>p.mesh==='dp_cliff_mass').length,CRASH_DEBRIS.gravel.count);
  // Gravel is ballistic: a frame's positions come from the closed form. The
  // chunks arc off the edge and are below the rail by two seconds in.
  d.step({fallSeconds:1.9,waterSeconds:-1,sceneAnchor:anchor});
  const rocks=d.step({fallSeconds:2.0,waterSeconds:-1,sceneAnchor:anchor}).filter(p=>p.mesh==='dp_cliff_mass');
  assert.ok(rocks.every(p=>p.y<anchor.y-1),'rocks have fallen');
});

test('the water entry throws the spray crown and foam from the entry point',()=>{
  const d=createCrashDebris();
  d.step({fallSeconds:2,waterSeconds:-1,sceneAnchor:anchor,position:[anchor.x,anchor.y-20,anchor.z]});
  const at=d.step({fallSeconds:2,waterSeconds:0,sceneAnchor:anchor,position:[anchor.x,anchor.y-20,anchor.z]});
  assert.equal(at.filter(p=>p.mesh==='wind_leaf_lobed_pale').length,CRASH_DEBRIS.spray.count,'spray crown');
  assert.equal(at.filter(p=>p.mesh==='wind_leaf_curled_pale').length,CRASH_DEBRIS.foam.count,'foam');
  const entry=[anchor.x,anchor.y-20,anchor.z+2];
  assert.ok(at.filter(p=>p.mesh!=='wind_leaf_blade_pale'&&p.mesh!=='dp_cliff_mass').every(p=>Math.abs(p.y-entry[1])<10),'bursts at the entry point');
});

test('the same film second always throws the same dust, whatever the frame rate',()=>{
  const a=createCrashDebris();run(a,{step:1/60});
  const b=createCrashDebris();run(b,{step:1/120});
  const pa=a.step({fallSeconds:1.5,waterSeconds:-1,sceneAnchor:anchor});
  const pb=b.step({fallSeconds:1.5,waterSeconds:-1,sceneAnchor:anchor});
  assert.equal(pa.length,pb.length);
  for(let i=0;i<pa.length;i++){
    near(pa[i].x,pb[i].x,1e-6,`x[${i}]`);near(pa[i].y,pb[i].y,1e-6,`y[${i}]`);near(pa[i].z,pb[i].z,1e-6,`z[${i}]`);
  }
});

test('the field empties after the last foam dies',()=>{
  const d=createCrashDebris();run(d,{seconds:8});
  assert.equal(d.step({fallSeconds:8,waterSeconds:6,sceneAnchor:anchor}).length,0);
});
