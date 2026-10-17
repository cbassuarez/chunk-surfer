import test from 'node:test';
import assert from 'node:assert/strict';
import { installTowerPersonalMeshes, towerPersonalGeometry } from '../src/render/tower-personal-meshes.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { buildBellsGodPreset } from '../src/game/chunk-surf-god.js';
import { PROP_BOUNDS } from '../src/data/generated/prop-geometry.js';
import { towerPersonalWorldPieces } from '../src/render/tower-personal-worlds.js';
import { normalizeTowerPersonalJourney } from '../src/game/tower-personal-journey.js';

test('the recordist circuit has finite grounded geometry with complete surface attributes', () => {
  const pieces=towerPersonalGeometry();
  for (const piece of pieces) {
    assert.ok(piece.groups.length>0,piece.name);
    for (const g of piece.groups) {
      assert.ok(g.positions.every(Number.isFinite),`${piece.name} positions`);
      assert.equal(g.normals.length,g.positions.length);
      assert.equal(g.uvs.length,g.positions.length/3*2);
      assert.ok(g.uvs.every(Number.isFinite));
      assert.ok(g.indices.every(i=>Number.isInteger(i)&&i>=0&&i<g.positions.length/3));
      for(let i=0;i<g.normals.length;i+=3) assert.ok(Math.abs(Math.hypot(...g.normals.slice(i,i+3))-1)<1e-8,`${piece.name} nondegenerate surface`);
    }
    assert.ok(piece.cullRadius>0&&Number.isFinite(piece.cullRadius));
  }
  const find=name=>pieces.find(p=>p.name===name);
  assert.ok(find('tower_personal_boy').bounds.max[1]<1.2);
  assert.ok(find('tower_personal_handover').bounds.max[1]>1.75);
  assert.ok(find('tower_personal_recordist_working').bounds.max[1]>1.3);
  assert.ok(find('tower_personal_mast').bounds.max[1]>10);
  assert.ok(find('tower_personal_tape_lead').bounds.min[2]<-11.99);
  const reel=find('tower_personal_tape_reel');
  assert.ok(reel.bounds.max[1]>1.65&&reel.bounds.max[1]<1.75);
  assert.ok(reel.bounds.max[0]-reel.bounds.min[0]>1.6);
  assert.ok(reel.bounds.max[2]-reel.bounds.min[2]<.4);
});

test('one continuous tape strand covers the hall without floor-spanning geometry', () => {
  const tape=towerPersonalGeometry().find(p=>p.name==='tower_personal_tape_lead');
  assert.ok(tape.bounds.max[0]-tape.bounds.min[0]<.8);
  assert.ok(tape.bounds.max[1]<.08);
  const g=tape.groups[0];
  for(let z=-11.9;z<-.1;z+=.1) {
    const close=[];
    for(let i=0;i<g.positions.length;i+=3)if(Math.abs(g.positions[i+2]-z)<.12)close.push(g.positions[i]);
    assert.ok(close.length>0,`tape reaches ${z.toFixed(1)} metres`);
  }
});

test('the roof guarantor is a complete living contractor installed in the ordinary prop pack', () => {
  const body=towerPersonalGeometry().find(piece=>piece.name==='ending_roof_guarantor');
  assert.ok(body.bounds.max[1]>1.7&&body.bounds.max[1]<1.9);
  assert.ok(body.bounds.max[0]-body.bounds.min[0]>.7,'attached arms separate from the rounded torso');
  for(const material of ['skin','hair','cloth','navy','black'])
    assert.ok(body.groups.some(group=>group.material===material),`ordinary ${material} surface exists`);
  const skin=body.groups.find(group=>group.material==='skin');
  const hands=[];
  for(let i=0;i<skin.positions.length;i+=3)if(skin.positions[i+1]<1)
    hands.push(skin.positions[i]);
  assert.ok(hands.some(x=>x<-.25)&&hands.some(x=>x>.25),'both complete hands belong to the body');
});

test('snow and ash are tiny physical double-sided facets', () => {
  for(const name of ['tower_personal_snowflake','tower_personal_ashflake']) {
    const p=towerPersonalGeometry().find(piece=>piece.name===name);
    assert.ok(p.bounds.max[0]-p.bounds.min[0]<=.03);
    assert.ok(p.bounds.max[1]-p.bounds.min[1]<=.03);
    assert.equal(p.groups[0].indices.length,36);
  }
});

test('the tape field has immense upright reels and physically slack overhead strands', () => {
  const pieces=towerPersonalWorldPieces('tape-field').filter(prop=>prop.mesh==='tower_personal_tape_reel');
  assert.ok(pieces.length>=12);
  const geometry=towerPersonalGeometry().find(piece=>piece.name==='tower_personal_tape_reel');
  assert.ok(pieces.some(piece=>piece.scaleY*geometry.bounds.max[1]>20));
  const strand=towerPersonalGeometry().find(piece=>piece.name==='tower_personal_tape_hanging');
  assert.ok(strand.bounds.min[1]>2.4,'overhead tape blocks a standing player');
  assert.ok(strand.bounds.max[1]-strand.bounds.min[1]>1.3,'suspended tape is a rigid straight beam');
});

test('the physical level bar moves on the actual recorder panel, including the shared LED origin offset', () => {
  const preset=buildBellsGodPreset(440,{seed:4417}).state;
  const personal=normalizeTowerPersonalJourney({version:2,active:true,stage:'ash-room',
    returnPose:{x:0,y:-4200,yaw:0,pitch:0},pose:{x:5,z:-48,yaw:0,pitch:0}});
  const runtime=createSourceSpaceRuntime({initialState:{...preset,station:{...preset.station,personal}}});
  const frame=runtime.towerLandFrame(),floor=runtime.geometry.floorAt(frame.pose.x,frame.pose.y);
  const target=frame.targets.recordist,bounds=PROP_BOUNDS.radio_carrier_led;
  const extents=time=>{
    const piece=runtime.propInstances(undefined,undefined,{time}).find(prop=>prop.id==='land-recorder-level'),m=piece.matrix;
    const points=[];
    for(const x of [bounds.min[0],bounds.max[0]])for(const y of [bounds.min[1],bounds.max[1]])for(const z of [bounds.min[2],bounds.max[2]]) {
      const p=[m[0]*x+m[4]*y+m[8]*z+m[12]-target.x*.5,m[1]*x+m[5]*y+m[9]*z+m[13]-floor,m[2]*x+m[6]*y+m[10]*z+m[14]-target.y*.5];
      assert.ok(p[0]>=-.108&&p[0]<=.018,'level bar misses the top-panel width');
      assert.ok(p[1]>.974&&p[1]<.980,'level bar is hidden in/below the tabletop');
      assert.ok(p[2]>=-.576&&p[2]<=-.534,'level bar misses the recorder face');
      points.push(p);
    }
    return {left:Math.min(...points.map(p=>p[0])),width:Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0]))};
  };
  const quiet=extents(0),bell=extents(3.1);
  assert.ok(bell.width>quiet.width*2,'the working machine has a fixed visual meter');
  assert.ok(Math.abs(quiet.left-bell.left)<.00002,'the level must grow from a fixed left edge');
});

test('personal props install once into the shared pack with the normal instance layout and useful cull bounds', () => {
  let id=0,buffers=0;
  const divisors=[],strides=[];
  const gl={ARRAY_BUFFER:1,ELEMENT_ARRAY_BUFFER:2,STATIC_DRAW:3,FLOAT:4,UNSIGNED_INT:5,
    createBuffer:()=>{buffers++;return ++id;},createVertexArray:()=>++id,
    bindVertexArray:()=>{},bindBuffer:()=>{},bufferData:()=>{},enableVertexAttribArray:()=>{},
    vertexAttribPointer:(_location,_size,_type,_normalized,stride)=>strides.push(stride),
    vertexAttribDivisor:(location,divisor)=>divisors.push([location,divisor]),
  };
  const pack={catalog:new Map()};
  const names=installTowerPersonalMeshes(gl,pack),firstBuffers=buffers;
  assert.equal(names.length,towerPersonalGeometry().length);
  assert.equal(pack.catalog.size,names.length);
  for(const name of ['tower_personal_boy_body','tower_personal_hand_support','tower_personal_hall_roof','tower_personal_portal_leaf','ending_roof_guarantor'])assert.ok(pack.catalog.has(name));
  installTowerPersonalMeshes(gl,pack);
  assert.equal(buffers,firstBuffers);
  assert.ok(strides.includes(29*4));
  assert.ok(divisors.some(([location,divisor])=>location===15&&divisor===1));
  for(const mesh of pack.catalog.values()) {
    assert.ok(mesh.extras.bounds);
    assert.ok(mesh.primitives.every(p=>p.materialRole==='tower-personal-prop'));
  }
  for(const name of ['tower_personal_boy','tower_personal_handover','tower_personal_recordist_working']) {
    for(const primitive of pack.catalog.get(name).primitives) {
      if(primitive.materialName!=='vfd green glass')assert.deepEqual(primitive.emissive,[0,0,0]);
    }
  }
});
