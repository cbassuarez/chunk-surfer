import test from 'node:test';
import assert from 'node:assert/strict';
import { pressureInstances } from '../src/render/pressure-volume.js';
import { setPressureInstances } from '../src/render/props3d.js';

const body=(extra={})=>({id:'rear:7',x:8,y:-12,floorH:4.2,strength:.9,heightM:2.18,widthM:.68,
  performance:{version:1,role:'source-rear',heading:.7,clip:'pressure_idle',time:2.8,loop:true,seed:17,
    manifestation:.8,motion:'idle',reducedMotion:false,cue:null},...extra});
const cue=(name,elapsed=1)=>body({performance:{...body().performance,cue:{name,elapsed}}});
const frozen=(value)=>{assert.equal(Object.isFrozen(value),true);for(const child of Object.values(value))if(child&&typeof child==='object')frozen(child);};

test('Pressure adapter preserves captured root, heading, clip and time in actual mesh instances',()=>{
  const input=body(),before=structuredClone(input),[instance]=pressureInstances(input,null);
  assert.equal(instance.mesh,'pressure_body');assert.equal(instance.x,4.25);assert.equal(instance.z,-5.75);assert.equal(instance.y,4.2);
  assert.ok(Math.abs(instance.yaw-.7)<1e-8);assert.equal(instance.scale,1);
  assert.equal(instance.character.clip,'pressure_idle');assert.equal(instance.character.time,2.8);assert.equal(instance.character.loop,true);
  assert.ok(Math.abs(instance.pressure.strength-.72)<1e-8);assert.equal(instance.pressure.seed,17);
  assert.deepEqual(input,before,'adapter mutated captured actor');
  frozen(pressureInstances(input,null));
  assert.equal(setPressureInstances(pressureInstances(input,null)),1,'descriptor is not accepted by actual P3 submission boundary');
  for(let i=0;i<20;i++)assert.deepEqual(pressureInstances(input,null),[instance],'sampling advances time or reads a wall clock');
});

test('body cues use actual root movement and restrained named-joint rotations without scaling anatomy',()=>{
  const [neutral]=pressureInstances(body(),null);
  for(const name of ['lean','lean-in','recoil','step-in','step-back','step-side','turn']){
    const [instance]=pressureInstances(cue(name),null);
    assert.equal(instance.scale,neutral.scale,`${name} scales the actor like a card`);
    assert.equal(instance.character.time,neutral.character.time,`${name} advances authored animation time`);
    const joints=instance.character.joints;
    for(const joint of ['chest','neck','head','clavicle_L','clavicle_R']){
      const q=joints[joint].rotation;assert.equal(q.length,4);assert.ok(q.every(Number.isFinite));
      assert.ok(Math.abs(Math.hypot(...q)-1)<1e-9,'non-unit rotation');
      assert.ok(Math.abs(q[3])>.99,'cue applies an anatomically excessive local correction');
    }
    assert.ok(Object.values(instance.character.morphs).every(weight=>weight>=0&&weight<=1));
    if(name.startsWith('step-')||name==='recoil')assert.ok(Math.hypot(instance.x-neutral.x,instance.z-neutral.z)>.05,`${name} does not move a physical body`);
    if(name==='turn')assert.ok(Math.abs(instance.yaw-neutral.yaw)>.5,'turn does not rotate actual geometry');
    if(name==='lean')assert.notDeepEqual(joints.chest,neutral.character.joints.chest,'lean only changes a screen mask');
  }
});

test('double and mirror submit separate real mesh palettes and stay within the two-actor/four-volume budget',()=>{
  for(const name of ['double','mirror']){
    const a=cue(name),b={...cue(name),id:'front:7',x:-8};
    const instances=pressureInstances(a,b);assert.equal(instances.length,4);
    assert.equal(new Set(instances.map(instance=>instance.id)).size,4);
    for(const instance of instances)assert.equal(instance.mesh,'pressure_body');
    assert.notEqual(instances[0].x,instances[1].x);assert.notEqual(instances[0].character.time,instances[1].character.time);
    assert.ok(instances[1].pressure.strength<instances[0].pressure.strength);
    assert.equal(setPressureInstances(instances),4);
    assert.equal(pressureInstances(cue(name,6),null).length,1,'finished cue retains extra geometry');
  }
});

test('captured manifestation and cue elapsed govern identity, while current comfort settings can suppress recorded flicker',()=>{
  assert.equal(pressureInstances(body({performance:{...body().performance,manifestation:0}}),null).length,0);
  assert.equal(pressureInstances(body(),null,{mode:'off'}).length,0);
  assert.equal(pressureInstances(body({mode:'off'}),null).length,0);
  const flicker=cue('flicker',.6),bright=pressureInstances(cue('flicker',.5),null)[0];
  const dark=pressureInstances(flicker,null)[0];assert.ok(dark.pressure.strength<bright.pressure.strength);
  const held=body({performance:{...flicker.performance,reducedMotion:true}});
  const [reduced]=pressureInstances(held,null);assert.ok(Math.abs(reduced.pressure.strength-.72)<1e-8,'reduced motion retains a flashing volume');
  const [dim]=pressureInstances(cue('dim'),null);assert.ok(dim.pressure.strength<.3);
  for(const comfort of[{reducedMotion:true},{reduceFlash:true},{reducedMotion:true,reduceFlash:true}]){
    const [safe]=pressureInstances(flicker,null,comfort);
    assert.ok(Math.abs(safe.pressure.strength-.72)<1e-8,'a recorded full-motion cue bypasses current comfort settings');
    for(const key of['x','y','z','yaw','scale'])assert.equal(safe[key],dark[key],`comfort changes the saved ${key}`);
    assert.equal(safe.character.clip,'pressure_idle');assert.equal(safe.character.time,2.8);
  }
  const [savedReduced]=pressureInstances(held,null,{reducedMotion:false,reduceFlash:false});
  assert.ok(Math.abs(savedReduced.pressure.strength-.72)<1e-8,'current settings re-enable flicker absent from the recording');
  assert.deepEqual(pressureInstances(body(),null,{reducedMotion:true}),pressureInstances(body(),null),'comfort rewrites a captured performance without an active cue');
});

test('current reduced motion softens recorded local articulation without changing its physical route, bearing or clip clock',()=>{
  for(const name of['lean','lean-in','step-in','step-side','turn','mirror']){
    const recorded=cue(name,.6),before=structuredClone(recorded);
    const full=pressureInstances(recorded,null),safe=pressureInstances(recorded,null,{reducedMotion:true});
    assert.equal(safe.length,full.length);
    for(let i=0;i<full.length;i++){
      for(const key of['x','y','z','yaw','scale'])assert.equal(safe[i][key],full[i][key],`${name} changed saved ${key}`);
      for(const key of['clip','time','loop'])assert.equal(safe[i].character[key],full[i].character[key],`${name} replaced recorded ${key}`);
      assert.ok(safe[i].character.morphs.sternum_sink<=full[i].character.morphs.sternum_sink);
    }
    if(name==='lean')assert.notDeepEqual(safe[0].character.joints.chest,full[0].character.joints.chest,'current reduced motion did not soften the captured articulation');
    assert.deepEqual(recorded,before,'comfort rewrote the saved descriptor');
    assert.deepEqual(pressureInstances(recorded,null,{reduceFlash:true}),full,'reduce flash changes a cue without flashing');
  }
});

test('legacy callers receive a bounded static volume and invalid actors cannot break an independent valid actor',()=>{
  const legacy={x:2,y:4,floorH:3,strength:1};
  const [instance]=pressureInstances(legacy,null);
  assert.equal(instance.character.clip,'pressure_hold');assert.equal(instance.character.time,0);assert.equal(instance.yaw,0);
  assert.equal(instance.x,1.25);assert.equal(instance.z,2.25);assert.equal(instance.y,3);
  const mixed=pressureInstances({x:NaN,y:0},body());assert.equal(mixed.length,1);
  assert.equal(pressureInstances(null,null).length,0);assert.equal(pressureInstances({x:2,y:3,performance:{}},null).length,0);
  frozen(mixed);
});
