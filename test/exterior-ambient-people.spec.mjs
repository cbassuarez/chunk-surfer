import test from 'node:test';
import assert from 'node:assert/strict';
import {exteriorAmbientPeoplePose as pose,exteriorAmbientPeopleInstances as instances,exteriorCyclePedals} from '../src/render/exterior-ambient-people.js';
import {exteriorAmbientInstances} from '../src/game/exterior-ambient.js';

const near=(a,b,tolerance=1e-6)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<tolerance,`${a} should match ${b}`);
const point=(m,p)=>[0,1,2].map(row=>m[12+row]+p.reduce((sum,v,col)=>sum+v*m[col*4+row],0));
const basePoint=(instance,p)=>{const c=Math.cos(instance.yaw),s=Math.sin(instance.yaw);return[instance.x+c*p[0]-s*p[2],(instance.y||0)+p[1],instance.z+s*p[0]+c*p[2]];};

test('ambient replacement is gated and preserves routes, identity and equipment ownership',()=>{
  const original={id:'exterior-ambient:cyclist',mesh:'ambient_cyclist',x:9,y:.12,z:7,yaw:.7,scale:1,travelMetres:8.2,speedMps:2.1,zone:23};
  assert.deepEqual(instances(original,{ready:false}),[original]);
  const unknown={...original,mesh:'ambient_car'};assert.deepEqual(instances(unknown),[unknown]);
  const [equipment,body,crank]=instances(original);
  assert.equal(equipment.mesh,'exterior_cycle_equipment');assert.equal(body.mesh,'district_pub_driver');assert.equal(crank.mesh,'exterior_cycle_crank');
  for(const part of [equipment,body,crank])for(const key of ['x','y','z','yaw','travelMetres','speedMps','zone'])assert.equal(part[key],original[key]);
  near([...body.matrix.slice(12,15)],[9,.12,7]);
  const forward=point(body.matrix,[0,0,-1]),origin=point(body.matrix,[0,0,0]);
  near(forward.map((v,i)=>v-origin[i]),[-Math.sin(.7)*1.05,0,Math.cos(.7)*1.05]);
});

test('cyclist feet and rotating crank share exact physical pedals at every phase and yaw',()=>{
  for(const travelMetres of [0,.13,.8,1.025,2.05,3.075,8.7])for(const yaw of [0,.7,Math.PI,-Math.PI/2]){
    const original={id:'cycle',mesh:'ambient_cyclist',x:12,y:.07,z:-5,yaw,travelMetres,speedMps:2};
    const p=pose('cyclist',original),[,body,crank]=instances(original),pedals=exteriorCyclePedals(p.phase);
    for(const [side,localPedal]of [['L',[-.18,0,.17]],['R',[.18,0,-.17]]])near(point(crank.matrix,localPedal),basePoint(original,pedals[side]),2e-6);
    for(const side of ['L','R']){
      const sole=p.feet[side].sole,worldSole=point(body.matrix,sole.map((v,i)=>v/p.scale[i])),target=p.feet[side].pedal;
      near(worldSole,basePoint(original,[target[0],target[1]+.04,target[2]]),2e-6);
      assert.ok(p.contacts.find(c=>c.kind==='pedal'&&c.side===side).error<1e-6);
    }
  }
});

test('both movers have anatomical finite joints, reachable contacts and fixed working hands',()=>{
  for(const kind of ['cyclist','dog-walker'])for(let i=0;i<52;i++){
    const p=pose(kind,{travelMetres:i*.073,speedMps:1.3});
    for(const j of Object.values(p.joints)){
      assert.ok([...j.translation,...j.rotation].every(Number.isFinite));
      assert.ok(Math.abs(Math.hypot(...j.rotation)-1)<1e-7);
    }
    for(const c of p.contacts)if(c.kind!=='finger'||c.gripped)assert.ok(c.error<1e-5,`${kind} ${c.kind}/${c.side} target must be reachable`);
    if(kind==='dog-walker')near(p.hands.L,[-.17,.92,-.02]);
    else for(const sign of [-1,1])near(p.hands[sign===-1?'L':'R'],[sign*.22,1.075,-.453]);
  }
});

test('walker stance shoe stays planted as root advances and swing clears the road',()=>{
  // Same left stance, 0.04m later: route advances -Z in the skin frame.
  const a=pose('dog-walker',{travelMetres:.08,speedMps:1}),b=pose('dog-walker',{travelMetres:.12,speedMps:1});
  assert.ok(a.feet.L.stance&&b.feet.L.stance);
  near(a.feet.L.sole,b.feet.L.sole.map((v,i)=>v-(i===2?.04:0)));
  near(a.joints.street_male_pelvis.translation,b.joints.street_male_pelvis.translation);
  const swing=pose('dog-walker',{travelMetres:1.30*.77,speedMps:1});
  assert.equal(swing.feet.L.stance,false);assert.ok(swing.feet.L.ankle[1]>.14);
  const original={id:'walk',mesh:'ambient_dog_walker',x:3,y:0,z:8,yaw:.9,travelMetres:.08,speedMps:1};
  near([...instances(original)[1].matrix.slice(12,15)],basePoint(original,[-.32,0,0]));
});

test('actual route metadata drives locomotion and endpoint pauses without a wall-clock phase',()=>{
  for(const timeSec of [0,4,12,28,45,58])for(const original of exteriorAmbientInstances({timeSec}).filter(i=>['ambient_cyclist','ambient_dog_walker'].includes(i.mesh))){
    assert.ok(Number.isFinite(original.travelMetres)&&Number.isFinite(original.speedMps));
    const a=instances(original,{timeSec:1}),b=instances(original,{timeSec:999});
    assert.deepEqual(a[1].character,b[1].character,'no clock drift while route is paused');
    if(original.speedMps>0){const c=Math.cos(original.yaw),s=Math.sin(original.yaw);const later=exteriorAmbientInstances({timeSec:timeSec+.01}).find(i=>i.id===original.id);assert.ok((later.x-original.x)*(-s)+(later.z-original.z)*c>0,'equipment +Z faces actual travel');}
  }
});
test('holding the exterior presentation clock freezes the actual walking and cycling routes',()=>{
  const a=exteriorAmbientInstances({timeSec:12,peopleTimeSec:4}),b=exteriorAmbientInstances({timeSec:20,peopleTimeSec:4});
  for(const mesh of['ambient_dog_walker','ambient_cyclist']){
    const before=a.find(p=>p.mesh===mesh),after=b.find(p=>p.mesh===mesh);
    assert.deepEqual(before,after);assert.deepEqual(instances(before),instances(after));
  }
  assert.notDeepEqual(a.find(p=>p.mesh==='city_moving_car'),b.find(p=>p.mesh==='city_moving_car'),'ordinary traffic keeps its existing clock owner');
});
