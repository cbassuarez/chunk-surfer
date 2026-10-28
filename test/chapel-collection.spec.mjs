import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NodeIO} from '@gltf-transform/core';
import {chapelCollectionFrame,chapelCollectionReceiver,CHAPEL_COLLECTION} from '../src/game/chapel-collection.js';
import {chapelDressingWorldPlacements} from '../src/game/chapel-dressing.js';
import * as FP from '../src/world/floorplan.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';

const state={status:'departing',route:'inversion'};
const p={id:'existing-congregant',kind:'presence',role:'congregant',figure:'kneeling',x:0,y:0,z:0,yaw:0,scale:1,zone:1};
const listener={x:.8,y:0,z:.7,yaw:Math.atan2(-.8,.7)};
const position=v=>({x:v[12],y:v[13],z:v[14]});

test('receiving is bounded to an active ordinary chapel departure, never other cast or chosen stay',()=>{
  for(const bad of [null,{status:'dormant',route:null},{status:'armed',route:null},{status:'complete',route:'inversion'},{status:'departing',route:'tower'},{status:'departing',route:'sacrifice'}]){
    assert.deepEqual(chapelCollectionFrame({placements:[p],state:bad,listener}),{instances:[],replaceIds:[],receiver:null,warnings:[]});
  }
  const other=[{...p,id:'ceiling',role:'ceiling'},{...p,id:'acolyte',role:'acolyte'},{...p,id:'paint',kind:'writing'},{...p,id:'other-floor',y:3}];
  assert.equal(chapelCollectionFrame({placements:other,state,listener}).instances.length,0);
  for(const route of ['surfaced','inversion'])assert.ok(chapelCollectionFrame({placements:[p],state:{...state,route},listener}).instances.length>0);
});

test('real hands must reach the case, and stone or another floor prevents taking',()=>{
  const receiver=chapelCollectionReceiver([p],listener,{canSee:()=>true});
  assert.equal(receiver.id,p.id);assert.ok(receiver.distanceM<CHAPEL_COLLECTION.reachM);assert.equal(receiver.group,'upper');
  assert.ok(Object.values(receiver.anchor).every(Number.isFinite));
  assert.equal(chapelCollectionReceiver([p],listener,{canSee:()=>false}),null);
  assert.equal(chapelCollectionReceiver([p],{...listener,x:3}),null);
  assert.equal(chapelCollectionReceiver([{...p,y:4}],listener),null);
  assert.equal(chapelCollectionReceiver([p],{...listener,caseTarget:{x:0,y:6,z:0}}),null,'unreachable high case is not claimed');
});

test('offers replace folded arms, remain attached to original stations, and preserve all input data',()=>{
  const placements=Array.from({length:14},(_,i)=>({...p,id:'congregant-'+i,x:(i%4)*.2,z:Math.floor(i/4)*.2}));
  const before=JSON.stringify(placements),f=chapelCollectionFrame({placements,state,listener,timeSec:3});
  assert.equal(f.warnings.length,6);assert.equal(f.instances.length,6*8);assert.equal(f.replaceIds.length,6*3);
  assert.ok(f.replaceIds.every(id=>/:upper$|:head$|:jaw$/.test(id)));
  for(const instance of f.instances){assert.equal(instance.blocks,false);assert.equal(instance.interactive,false);assert.ok([...instance.matrix].every(Number.isFinite));}
  assert.equal(JSON.stringify(placements),before,'no person is moved or mutated');
  const first=f.warnings[0].id,original=placements.find(p=>p.id===first),torso=f.instances.find(i=>i.id===`${first}:collection:torso`);
  assert.ok(Math.abs(torso.x-original.x)<1e-6);assert.ok(Math.abs(torso.z-original.z)<1e-6);
});

test('the owned receiving palm stays at its saved contact point across time and reload',()=>{
  const receiver=chapelCollectionReceiver([p],listener);
  const caught={status:'caught',route:'inversion',catch:{kind:'congregation',receiverId:p.id,anchor:receiver.anchor}};
  const frames=[0,1,100].map(timeSec=>chapelCollectionFrame({placements:[p],state:JSON.parse(JSON.stringify(caught)),listener,timeSec}));
  for(const f of frames){
    for(const hand of f.instances.filter(i=>i.mesh==='tape_demand_receiver_hand')){
      // Fingers end at local Y .17, including body scale in the matrix.
      const at=position(hand.matrix),tip={x:at.x+hand.matrix[4]*.17,y:at.y+hand.matrix[5]*.17,z:at.z+hand.matrix[6]*.17};
      assert.ok(Math.hypot(tip.x-receiver.anchor.x,tip.y-receiver.anchor.y,tip.z-receiver.anchor.z)<1e-6);
    }
    assert.equal(f.warnings[0].gesture,'holding');
  }
});

test('reduced motion fixes the offer and the existing chapel yields no invented C17 receiver',()=>{
  const a=chapelCollectionFrame({placements:[p],state,listener,timeSec:0,reducedMotion:true});
  const b=chapelCollectionFrame({placements:[p],state,listener,timeSec:73,reducedMotion:true});
  assert.deepEqual(a.instances,b.instances);
  FP.compile(conservatory.levels,conservatory);
  const actual=chapelDressingWorldPlacements(FP),at=FP.logicalToPhysical(186,117),entry={x:at.x*.5,y:at.y,z:at.z*.5,yaw:Math.PI};
  assert.equal(chapelCollectionReceiver(actual,entry),null,'the first pews are genuinely too far inside the chapel');
  assert.equal(actual.filter(i=>i.kind==='presence'&&i.role==='congregant').length,45,'reuse the existing congregation');
  const approach=FP.logicalToPhysical(181,126),near={x:approach.x*.5,y:approach.y,z:approach.z*.5,yaw:-1.4973990008932898};
  assert.equal(chapelCollectionReceiver(actual,near,{canSee:(a,b)=>{
    const spans=FP.physicalSpanData().cells,distance=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
    for(let s=.15;s<distance-.15;s+=.15){const t=s/distance,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,z=a.z+(b.z-a.z)*t;if(!spans.get(`${Math.floor(x*2)},${Math.floor(z*2)}`)?.some(v=>y>v.floor-.05&&y<v.ceil+.05))return false;}return true;
  }}).id,'chapel-dressing:presence-2','actual accessible first-row aisle pose yields an unobstructed receiver');
});

test('a saved owner remains attached at the original station outside the warning radius and across floors',()=>{
  const receiver=chapelCollectionReceiver([p],listener),caught={status:'caught',route:'inversion',catch:{kind:'congregation',receiverId:p.id,anchor:receiver.anchor,holder:'anchor'}};
  const f=chapelCollectionFrame({placements:[p],state:caught,listener:{...listener,x:20,y:4,z:20},canSee:()=>false});
  assert.equal(f.warnings[0].id,p.id);assert.equal(f.warnings[0].gesture,'holding');
  const torso=f.instances.find(i=>i.mesh==='tape_demand_receiver_torso');assert.equal(torso.x,p.x);assert.equal(torso.z,p.z);
});

test('the original isolated pack contains opaque articulated receiving geometry within budget',async()=>{
  const bytes=fs.readFileSync(new URL('../public/assets/chapel-tape-demand.glb',import.meta.url));
  const doc=await new NodeIO().readBinary(bytes),meshes=doc.getRoot().listMeshes();
  for(const name of ['tape_demand_receiver_torso','tape_demand_receiver_sleeve','tape_demand_receiver_hand']){
    const mesh=meshes.find(m=>m.getName()===name);assert.ok(mesh,name);
    for(const primitive of mesh.listPrimitives())assert.equal(primitive.getMaterial().getAlphaMode(),'OPAQUE');
  }
  const hand=meshes.find(m=>m.getName()==='tape_demand_receiver_hand');
  assert.ok(hand.listPrimitives().reduce((n,p)=>n+p.getIndices().getCount()/3,0)>=200,'palm, thumb and separately modeled fingers');
  assert.ok(bytes.length<900000);
});
