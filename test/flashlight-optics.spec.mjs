import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveTorchFrame,normalizeTorchOptics,torchAngularSample,torchFalloffSample,torchReceiveSample} from '../src/render/torch-optics.js';
import {resolveTorchLook,applyPhysicalTorchProfile,applySourceEmergencyTorch} from '../src/render/lighting-model.js';
import {applyFieldKitTorchLook} from '../src/render/field-kit-torch.js';
import {applyHushTorchInterference} from '../src/game/hush-field.js';
import {fieldKitEffects} from '../src/game/field-kit.js';

const close=(actual,expected,tolerance=1e-10)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const vectorClose=(actual,expected)=>actual.forEach((value,i)=>close(value,expected[i]));
const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);

test('the carried emitter stays right and below the eye without camera motion, pitch bob or optical aim drift',()=>{
  const eye=[12.5,1.62,-43.25],original=[...eye];
  for(const yaw of[0,Math.PI/2,Math.PI,-Math.PI/2,1.13])for(const pitch of[-Math.PI/2,-.62,0,.62,Math.PI/2])for(const yawOffset of[-.4,0,.4]){
    const frame=resolveTorchFrame({eye,yaw,pitch,yawOffset});
    vectorClose(frame.origin,[eye[0]+Math.cos(yaw)*.12,eye[1]-.08,eye[2]+Math.sin(yaw)*.12]);
    vectorClose(frame.forward,[Math.sin(yaw+yawOffset)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw+yawOffset)*Math.cos(pitch)]);
    for(const axis of[frame.forward,frame.right,frame.up])close(dot(axis,axis),1);
    close(dot(frame.forward,frame.right),0);close(dot(frame.forward,frame.up),0);close(dot(frame.right,frame.up),0);
    const translated=resolveTorchFrame({eye:eye.map((v,i)=>v+[200,-31,70][i]),yaw,pitch,yawOffset});
    vectorClose(translated.origin.map((v,i)=>v-frame.origin[i]),[200,-31,70]);
    vectorClose(translated.forward,frame.forward);
    assert.deepEqual(resolveTorchFrame({eye,yaw,pitch,yawOffset}),frame,'a stationary lamp has no private clock or lag');
  }
  assert.deepEqual(eye,original,'resolving light must not move the body/camera');
});

test('normalization preserves real fitted angles, reduced reach and explicit controlled zeros',()=>{
  for(const profile of['hall','church'])for(const flashlight of['reference','throw','flood']){
    const fitted=applyFieldKitTorchLook(resolveTorchLook(),fieldKitEffects({flashlight}));
    const physical=applyPhysicalTorchProfile(fitted,{profile}),before=structuredClone(physical),optics=normalizeTorchOptics(physical);
    for(const key of['reach','coneInner','coneOuter','spill','shoulder'])close(optics[key],physical[key]);
    assert.deepEqual(physical,before);
  }
  for(const reach of[.01,.275,.75,1,1.25,2.875,4])close(normalizeTorchOptics({reach}).reach,reach);
  const zero=normalizeTorchOptics({coneInner:0,coneOuter:.1,spill:0,shoulder:0});
  assert.equal(zero.coneInner,0);assert.equal(zero.coneOuter,.1);assert.equal(zero.spill,0);assert.equal(zero.shoulder,0);
  assert.equal(normalizeTorchOptics().shoulder,.65,'ordinary surfaces receive the shared highlight shoulder');
});

test('invalid optical values cannot create NaN uniforms or a reversed smoothstep',()=>{
  for(const value of[NaN,Infinity,-Infinity,undefined,null,-1e6,1e6]){
    const optics=normalizeTorchOptics({reach:value,coneInner:value,coneOuter:value,spill:value,shoulder:value});
    assert.ok(Object.values(optics).every(Number.isFinite));
    assert.ok(optics.reach>=.01&&optics.reach<=4);
    assert.ok(optics.coneInner>=-.99&&optics.coneOuter<=.9999&&optics.coneInner<optics.coneOuter);
    assert.ok(optics.spill>=0&&optics.shoulder>=0);
  }
  const reversed=normalizeTorchOptics({coneInner:.98,coneOuter:.7});
  assert.ok(reversed.coneInner<reversed.coneOuter,'malformed input is repaired before GLSL');
});

test('the lobe has a graded penumbra, finite near-axis energy and no light behind the emitter',()=>{
  const optics=normalizeTorchOptics(),sample=(axis,azimuth=0)=>torchAngularSample({axis,azimuth,...optics});
  for(const azimuth of[0,.4,Math.PI/2,Math.PI,Math.PI*2]){
    close(sample(-1,azimuth),0);close(sample(0,azimuth),0);
    const core=sample(1,azimuth),feather=sample((optics.coneInner+optics.coneOuter)/2,azimuth),edge=sample(optics.coneInner,azimuth);
    assert.ok(core>feather&&feather>edge,'core, feather and edge remain distinct at ordinary angles');
    assert.ok(Number.isFinite(core)&&core>0&&core<2,'normalization cannot form an unbounded hotspot');
    const values=Array.from({length:201},(_,i)=>sample(optics.coneInner+(optics.coneOuter-optics.coneInner)*i/200,azimuth));
    for(let i=1;i<values.length;i++){
      assert.ok(values[i]>=values[i-1]-1e-8,'the transition has no brighter ring outside its core');
      assert.ok(Math.abs(values[i]-values[i-1])<core*.04,'the beam edge is a smooth transition');
    }
  }
});

test('near response is bounded, falloff decays beyond the softened close field and fitted reach stays ordered',()=>{
  for(const reach of[.01,.275,.75,1,1.25,4]){
    const distances=[0,.001,.05,.25,.5,1,2,5,10,30,100],values=distances.map(d=>torchFalloffSample(d,reach));
    assert.ok(values.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
    assert.ok(values[0]<=.5,'contact has no inverse-square singularity or close flashbulb');
    const far=[1.4,2,5,10,30,100].map(d=>torchFalloffSample(d,reach));
    for(let i=1;i<far.length;i++)assert.ok(far[i]<far[i-1]);
    assert.ok(values[0]>values.at(-1));
  }
  for(const distance of[.5,2,5,10,30])assert.ok(torchFalloffSample(distance,1.25)>torchFalloffSample(distance,1)&&torchFalloffSample(distance,1)>torchFalloffSample(distance,.75));
});

test('received highlights stay ordered and bounded without inventing energy in darkness',()=>{
  for(const shoulder of[.65,.75,.9,2]){
    close(torchReceiveSample(0,shoulder),0);
    let previous=0;
    for(const value of[.001,.02,.2,1,4,20,1e6]){
      const received=torchReceiveSample(value,shoulder);
      assert.ok(Number.isFinite(received)&&received>previous&&received<=value&&received<1/shoulder);
      previous=received;
    }
  }
  for(const value of[0,.2,1,4])close(torchReceiveSample(value,0),value);
});

test('off and depleted lamps remain dark through fitted optics, HUSH, Source profiles and received-light evaluation',()=>{
  for(const on of[false,true])for(const battery of[0,.08,.3,1,1.5])for(const flashlight of['reference','throw','flood'])for(const absorption of[0,.68,1])for(const profile of[null,'hall','dock','shore','proper','church']){
    const base=resolveTorchLook({on,battery,perception:.4,reducedEffects:true});
    const fitted=applyFieldKitTorchLook(base,fieldKitEffects({flashlight}));
    const interference=applyHushTorchInterference(fitted,{active:absorption>0,absorption:{light:absorption},pulse:.8});
    const received=profile==='church'?applyPhysicalTorchProfile(interference,{profile}):applySourceEmergencyTorch(interference,{profile});
    const normalized=normalizeTorchOptics(received);
    assert.equal(received.health,base.health);assert.equal(received.band,base.band);assert.equal(received.perception,base.perception);
    assert.ok(received.power<=fitted.power+1e-12,'context cannot restore absorbed power');
    const energy=torchReceiveSample(torchAngularSample({axis:1,...normalized})*torchFalloffSample(2,normalized.reach)*received.power,normalized.shoulder);
    assert.ok(Number.isFinite(energy)&&energy>=0);
    if(!on||battery===0){assert.equal(received.power,0);assert.equal(energy,0);}
  }
});
