import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {STUDENT_STRIKE_FILM as FILM,STUDENT_STRIKE_CUES} from '../src/data/student-strike-film.js';
import {studentStrikeFrame,nativeStudentStrikeActors} from '../src/game/student-strike-timeline.js';
import {studentStrikeWorldView,studentStrikeGate,studentStrikeActors,studentStrikeDynamicProps,studentStrikeStaticProps,studentStrikeLighting,
  prepareStudentStrikeAssets} from '../src/render/student-strike-staging.js';
import {sampleStrikePlateOffer} from '../src/render/student-strike-performance.js';
import * as FP from '../src/world/floorplan.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';

test('production film has the reviewed65-second refusal, evidence, care and return chronology',()=>{
  assert.equal(FILM.durationSeconds,65);assert.equal(FILM.shots.length,12);assert.equal(STUDENT_STRIKE_CUES.length,13);
  assert.deepEqual(FILM.shots.map(s=>s.id),['S00','S02','S03','S04','R00','D00','S05','D01','R01','R02','G00','S07']);
  assert.match(STUDENT_STRIKE_CUES.find(c=>c.id==='ST01').text,/Not another rehearsal/);
  assert.match(STUDENT_STRIKE_CUES.find(c=>c.id==='N03').text,/Afterwards/);
  assert.match(STUDENT_STRIKE_CUES.find(c=>c.id==='N07').text,/Later/);
  assert.match(STUDENT_STRIKE_CUES.find(c=>c.id==='N09').text,/cannot tell you/);
  assert.equal(studentStrikeFrame(59).nativeReturn,true);
  assert.equal(studentStrikeFrame(NaN).seconds,0);
});

test('authored cameras resolve the actual group/floor and reject cross-group fallback',()=>{
  FP.compile(conservatory.levels,conservatory);
  for(const shot of FILM.shots.filter(s=>s.start<59))for(const u of[0,.08,.5,.92,.999]){
    const frame=studentStrikeFrame(shot.start+(shot.end-shot.start)*u);
    const view=studentStrikeWorldView(frame,{aspect:16/9});
    assert.ok(Number.isFinite(view.x)&&Number.isFinite(view.y));assert.equal(view.renderGroup,shot.renderGroup);
    assert.equal(view.floorH,frame.camera.eye[1]-1.62);assert.ok(Math.abs(view.observerFloor-shot.floorH)<1e-6);
    assert.equal(view.authoredCamera.tanHalfFov,frame.camera.tanHalfFov*1.125);
  }
  assert.throws(()=>studentStrikeWorldView(studentStrikeFrame(12),{fp:{logicalAtPhysical:()=>({x:1,y:1,floor:10,ceil:15,renderGroup:'ground'}),isSolid:()=>false}}),/no supported/);
});

test('the live return releases historical staging and retains the supplied exact camera',()=>{
  const pose={eye:[70,11.62,32],yaw:1.23,pitch:-.42,tanHalfFov:.91,lens:null};
  const frame=studentStrikeFrame(59,{returnPose:pose});assert.deepEqual(frame.camera.eye,pose.eye);assert.equal(frame.camera.yaw,pose.yaw);assert.equal(frame.camera.pitch,pose.pitch);
  assert.equal(studentStrikeWorldView(frame),null);assert.equal(studentStrikeStaticProps(frame),null);assert.deepEqual(studentStrikeActors(frame),[]);
  const context={id:'ordinary'},lights=[{id:'ordinary'}];assert.deepEqual(studentStrikeLighting(frame,{ordinaryContext:context,ordinaryLights:lights}),{active:false,context,lights});
});

test('reduced motion holds camera position and the native gate preserves2:1 extraction',()=>{
  const a=studentStrikeFrame(10.3,{reducedMotion:true}),b=studentStrikeFrame(18.7,{reducedMotion:true});assert.deepEqual(a.camera.eye,b.camera.eye);
  const gate=studentStrikeGate(a,{width:1920,height:1080});assert.deepEqual(gate.activeRect,{x:0,y:60,width:1920,height:960});assert.equal(gate.bars.length,2);
  assert.equal(studentStrikeGate(studentStrikeFrame(59),{width:1920,height:1080}).active,false);
});

test('the plate and the giver share one supported motion, and the voice owner governs the native jaw',()=>{
  const options={approach:[1.5,2.4],slide:[2.4,3.6],release:[6.1,7.4]};
  for(const t of[31,32.7,34,36,37.7,39.5]){
    const f=studentStrikeFrame(t,{voiceActorId:''}),plate=f.objects.find(p=>p.id==='offered-bread'),expected=sampleStrikePlateOffer(t-31,options);
    assert.deepEqual([plate.x,plate.y,plate.z],expected.position);
    const giver=nativeStudentStrikeActors(f,{voiceActorId:''}).find(p=>p.studentStrikeActorId==='strike-student-d');
    assert.deepEqual(giver.strikeArticulation.plate.position,expected.position);assert.equal(giver.studentStrikePerformance.speaking,false);
    const submitted=studentStrikeDynamicProps(f,'').find(p=>p.id==='offered-bread');assert.deepEqual([submitted.x,submitted.y,submitted.z],expected.position);
  }
  const f=studentStrikeFrame(20,{voiceActorId:'strike-student-b'}),actors=nativeStudentStrikeActors(f,{voiceActorId:'strike-student-b'});
  assert.equal(actors.find(a=>a.studentStrikeActorId==='strike-student-b').studentStrikePerformance.speaking,true);
  assert.equal(actors.find(a=>a.studentStrikeActorId==='strike-student-a').studentStrikePerformance.speaking,false);
  const p0=studentStrikeDynamicProps(studentStrikeFrame(33.3),'').find(p=>p.id==='offered-bread'),p1=studentStrikeDynamicProps(studentStrikeFrame(34.7),'').find(p=>p.id==='offered-bread');
  assert.ok(Math.abs(p1.x-p0.x)>.09,'moving plate is submitted each frame, independent of a static scene rebuild');
});

test('native preparation is shared, cached, retryable and independent of review files',async()=>{
  const paths=['academic-gallery','conservatory-doors','conservatory-textiles','academic-society-characters','exterior-frontages','exterior-stationers','exterior-street-fabric','ellery-public-front','ellery-exterior-roofline','opening-street','vegetation'];
  const all=[];for(const name of paths){const b=fs.readFileSync(new URL('../public/assets/'+name+'.glb',import.meta.url));const n=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+n));all.push(...j.meshes.map(m=>m.name));}
  const names=new Set([...all,'upright_piano','piano_bench','school_desk','instrument_case','ending_body_prone','loose_note','student_strike_recovery_cloth','student_strike_bread_plate',...FILM.records.map(r=>r.mesh)]);
  let installs=0,loads=0;const renderer={propMeshCatalog:()=>[...names],addPropPack:async()=>{loads++;},addCharacterPack:async()=>{loads++;},installAuthoredPropMeshes:()=>{installs++;return{ready:true};}};
  await Promise.all([prepareStudentStrikeAssets({propsRenderer:renderer}),prepareStudentStrikeAssets({propsRenderer:renderer})]);assert.equal(installs,1);assert.equal(loads,0);
  await prepareStudentStrikeAssets({propsRenderer:renderer});assert.equal(installs,1);
  assert.equal(studentStrikeStaticProps(studentStrikeFrame(34),[]).some(p=>p.id==='offered-bread'),false);
  const failed={propMeshCatalog:()=>['base'],addPropPack:async()=>{throw Error('load unavailable');},addCharacterPack:async()=>{throw Error('load unavailable');}};
  await assert.rejects(prepareStudentStrikeAssets({propsRenderer:failed}),/load unavailable/);
  failed.propMeshCatalog=()=>[...names];failed.installAuthoredPropMeshes=()=>({ready:true});await prepareStudentStrikeAssets({propsRenderer:failed});
  for(const name of['data/student-strike-film.js','game/student-strike-timeline.js','render/student-strike-staging.js','render/student-strike-props.js','render/student-strike-performance.js'])assert.doesNotMatch(fs.readFileSync(new URL('../src/'+name,import.meta.url),'utf8'),/from\s+['"][^'"]*artifacts|fetch\([^)]*artifacts/);
});
