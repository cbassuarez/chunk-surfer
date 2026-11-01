import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRestDestructionGeometryLibrary,sourceRestDestructionFragments} from '../src/render/source-rest-destruction-models.js';
import {sourceRestNoteGeometryLibrary} from '../src/render/source-rest-note-models.js';
import {applySourceRestDestruction} from '../src/render/source-rest-destruction.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
const seat=SOURCE_REST_SEATS[0],matrix=(x,y,z)=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1];
const part=(id,extra={})=>({id,mesh:'source-continuation-rest-note-oculus',matrix:matrix(seat.x-21,seat.feet+.55,seat.z-2),restNoteArchitecture:true,noteKind:'note-monument',...extra});
const cue=(time,more={})=>({active:true,time,unwrappedTime:time,pain:0,strain:.7,destruction:.5,facultyLoss:.3,...more});

test('fracture meshes conserve the actual arch triangles and remain solid volumetric pieces',()=>{
  const models=sourceRestDestructionGeometryLibrary(),source=sourceRestNoteGeometryLibrary();
  for(const name of['oculus','grand-return','vault','window','stair','return','landing','bridge']){
    const pieces=sourceRestDestructionFragments(name);assert.ok(pieces.length>=3);
    assert.equal(pieces.reduce((n,p)=>n+p.triangles,0),source['rest-note-'+name].i.length/3);
    for(const piece of pieces){const model=models[piece.mesh.replace('source-continuation-','')];assert.ok(model.p.every(Number.isFinite));assert.ok(model.i.every(i=>i>=0&&i<model.p.length/3));assert.equal(piece.center.length,3);}
  }
  assert.ok(sourceRestDestructionFragments('oculus').length>20,'the masonry comes apart block by block');
});

test('hard passages split the existing arch, leave missing fabric after release and never alter input support',()=>{
  const original=[part('note-monument:oculus'),part('support',{restNoteArchitecture:false,physicalKind:'surface',physicalBounds:{min:[-4,8,-23],max:[4,8.4,-13]}})],copy=structuredClone(original);
  const before=applySourceRestDestruction(original,{cue:cue(200,{destruction:.05}),time:200,seat});assert.equal(before.debris.length,0);
  const during=applySourceRestDestruction(original,{cue:cue(236),time:236,seat});assert.equal(during.props.some(p=>p.id==='note-monument:oculus'),false);
  assert.ok(during.debris.length>20);assert.ok(during.debris.some(p=>p.fractureState==='falling'||p.fractureState==='fallen'));
  const after=applySourceRestDestruction(original,{cue:cue(260,{strain:0}),time:260,seat});assert.equal(after.props.some(p=>p.id==='note-monument:oculus'),false);assert.ok(after.debris.every(p=>p.fractureState==='fallen'));
  assert.equal(after.props.find(p=>p.id==='support'),original[1]);assert.deepEqual(original,copy);assert.equal(after.diagnostics.physicalCollisionChanged,false);
  assert.ok(after.debris.length+after.body.length<=80);
});

test('the shelter remains exact while departure is available, then physically detaches',()=>{
  const window=part('source-continuation-window-head',{mesh:'source-continuation-rest-oak',restNoteArchitecture:false,restPlace:true});
  const early=applySourceRestDestruction([window],{cue:cue(468,{destruction:.8}),time:468,seat,canLeave:true});assert.equal(early.props[0],window);assert.equal(early.debris.length,0);
  const late=applySourceRestDestruction([window],{cue:cue(468,{destruction:.8}),time:468,seat,canLeave:false});assert.equal(late.props.length,0);assert.equal(late.debris.length,3);
});

test('a detached block tumbles around its own centre rather than orbiting world zero',()=>{
  const original=part('note-monument:oculus'),preview=applySourceRestDestruction([original],{cue:cue(217),time:217,seat}),piece=preview.debris.find(p=>p.fractureState==='intact');
  assert.ok(piece);const at=piece.fractureAt;
  const a=applySourceRestDestruction([original],{cue:cue(at-.0001),time:at-.0001,seat}).debris.find(p=>p.id===piece.id),
    b=applySourceRestDestruction([original],{cue:cue(at+.10),time:at+.10,seat}).debris.find(p=>p.id===piece.id);
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<.3,'one tenth of a second cannot move a block metres sideways around the scene origin');
});

test('each bodily impulse changes actual hands and sleeves; clock holds and reduced motion are deterministic',()=>{
  const plain=applySourceRestDestruction([],{cue:cue(35,{pain:0,strain:0,destruction:0}),time:35,seat}),hurt=applySourceRestDestruction([],{cue:cue(35,{pain:1,strain:0,destruction:0}),time:35,seat});
  assert.equal(plain.body.length,12);assert.notDeepEqual(plain.body.find(p=>p.id.endsWith('hand-left')).character.morphs,hurt.body.find(p=>p.id.endsWith('hand-left')).character.morphs);
  assert.deepEqual(hurt,applySourceRestDestruction([],{cue:cue(35,{pain:1,strain:0,destruction:0}),time:35,seat}));
  const p=[part('note-monument:oculus')],a=applySourceRestDestruction(p,{cue:cue(255),time:255,seat,reducedMotion:true}),b=applySourceRestDestruction(p,{cue:cue(256),time:256,seat,reducedMotion:true});
  assert.deepEqual(a.debris,b.debris,'reduced motion retains the same missing masonry without flight or spin');
  const inactive=applySourceRestDestruction(p,{cue:{active:false},seat});assert.equal(inactive.props,p);assert.equal(inactive.body.length,0);
  const standing=applySourceRestDestruction(p,{cue:cue(255,{embodied:false,bodyProgress:0}),time:255,seat});assert.equal(standing.body.length,0);assert.ok(standing.debris.length>0,'standing preserves already detached architecture without leaving floating arms');
  assert.equal(applySourceRestDestruction([],{cue:cue(35,{bodyProgress:0}),time:35,seat}).body.length,0);
  const lowering=applySourceRestDestruction([],{cue:cue(35,{bodyProgress:.4}),time:35,seat});assert.ok(lowering.body.find(p=>p.id.endsWith('hand-left')).y>plain.body.find(p=>p.id.endsWith('hand-left')).y,'sitting lowers the body from its approaching pose into actual support');
  assert.equal(applySourceRestDestruction(p,{cue:cue(400),seat:SOURCE_REST_SEATS[1]}).body.length,0,'Source III cannot acquire the treatment');
});


test('the angel loses complete wheel-eye-wing bearings at human-marked passages while its inner wheel remains',()=>{
  const pivot=[-19.5,15.55,-22],members=[];
  for(let wheel=0;wheel<3;wheel++)for(const [kind,offset] of [['wheel',0],['wheel-watch',0],['wing-left',-7],['wing-right',7]]){
    const position=[pivot[0],pivot[1],pivot[2]+offset];members.push(part(`angel-${wheel}:${kind}`,{mesh:'source-continuation-rest-note-cube-'+kind,
      angelAssemblyId:'note-cube:angel',wheelId:wheel,cubePivot:pivot,matrix:matrix(...position),x:position[0],y:position[1],z:position[2]}));
  }
  const before=applySourceRestDestruction(members,{cue:cue(454),time:454,seat});assert.equal(before.diagnostics.detachedStructures,0);
  const middle=applySourceRestDestruction(members,{cue:cue(461),time:461,seat}),end=applySourceRestDestruction(members,{cue:cue(470),time:470,seat});
  assert.equal(middle.diagnostics.detachedStructures,4);assert.equal(end.diagnostics.detachedStructures,8);
  assert.ok(end.props.filter(p=>p.wheelId===0).every(p=>!p.restDetached));
  for(const frame of [middle,end])for(const wheel of [1,2]){
    const parts=frame.props.filter(p=>p.wheelId===wheel),ring=parts[0],eyes=parts[1],left=parts[2],right=parts[3];
    assert.deepEqual(ring.matrix,eyes.matrix);assert.equal(ring.fractureAt,left.fractureAt);assert.equal(ring.fractureAt,right.fractureAt);
    const distance=(a,b)=>Math.hypot(...[12,13,14].map(k=>a.matrix[k]-b.matrix[k]));
    assert.ok(Math.abs(distance(left,right)-14)<.00002,'one parent transform preserves the full paired-wing span');
  }
  assert.equal(end.diagnostics.physicalCollisionChanged,false);
});
