import test from 'node:test';
import assert from 'node:assert/strict';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { CONSERVATORY_RIFT_OPTIONS, resolveConservatoryRiftSites } from '../src/data/conservatory-rift.js';
import { freshConservatoryRift, normalizeConservatoryRift, stepConservatoryRift, conservatoryRiftFrame, candidateStudyFrame } from '../src/game/conservatory-rift.js';
import { createConservatoryRiftAudio } from '../src/audio/conservatory-rift.js';

FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
const doorsBefore=FP.saveDoorState(),propsBefore=JSON.stringify(PROPS.allProps()),sites=resolveConservatoryRiftSites(FP,PROPS.allProps());
const fresh=id=>freshConservatoryRift({optionId:id,runId:'one-night',returnPose:{x:123,y:456,yaw:.72,feet:4.8},sites});
const step=(state,input)=>stepConservatoryRift(state,input,{sites});
const near=(a,b,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} != ${b}`);

test('three candidates resolve current compiled anchors, not logical authored positions',()=>{
  assert.equal(CONSERVATORY_RIFT_OPTIONS.length,3);
  const rendered=PROPS.renderInstances({inscriptions:false});
  for(const option of CONSERVATORY_RIFT_OPTIONS){
    const real=rendered.find(prop=>prop.id===option.anchorId),at=sites[option.id].anchor;
    near(at.x,real.x);near(at.z,real.z);near(at.feet,4.8,1e-5);
    assert.equal(option.trigger.propId,option.anchorId);assert.equal(option.trigger.consent,'E');
    assert.ok(option.identity&&option.exit&&option.staging);
  }
  assert.notEqual(sites['bad-bar'].anchor.z,PROPS.propById('practice-piano-1').y);
  const c=conservatoryRiftFrame(fresh('fifth-chair'),{sites});
  assert.equal(c.camera.pitch,-Math.PI/2);near(c.camera.eye[1]-c.miniature.board.y,.60);
  assert.equal(c.gameplayHud.length,0);
});

test('the review beats are reachable with normal controls and retain the exact simulation state',()=>{
  for(const option of CONSERVATORY_RIFT_OPTIONS){
    const expected=['entry','embodied','leak','return'];
    for(let i=0;i<4;i++){
      const frame=candidateStudyFrame(option.id,i,sites);
      assert.equal(frame.phase,expected[i],`${option.id} beat ${i}`);
      const actual=conservatoryRiftFrame(frame.studyState,{sites});
      assert.deepEqual({...frame,studyState:undefined,studyBeat:undefined},{...actual,studyState:undefined,studyBeat:undefined});
      assert.equal(frame.caption,null);assert.deepEqual(frame.gameplayHud,[]);
      assert.ok(frame.camera.eye.every(Number.isFinite));
    }
    assert.equal(candidateStudyFrame(option.id,3,sites).completed,true);
  }
});

test('the recovered-part review looks at its compiled score with ordinary look input',()=>{
  const f=candidateStudyFrame('after-company',2,sites),target=sites['after-company'].paperView;
  const dx=target.x-f.pose.x,dz=target.z-f.pose.z;
  near(f.camera.yaw,Math.atan2(dx,-dz));
  near(f.camera.pitch,Math.atan2(target.y-f.camera.eye[1],Math.hypot(dx,dz)));
  assert.ok(f.camera.pitch<0,'the score is below the standing eye');
});

test('withholding a piano action has a real separate continuing reference; waiting is not an imposed quota',()=>{
  let state=fresh('bad-bar');const original=structuredClone(state);
  for(let i=0;i<200;i++)state=step(state,{dt:.25}).state;
  assert.equal(state.phase,'entry');assert.equal(state.performances,0);
  for(let i=0;i<12;i++)state=step(state,{dt:.2,held:true}).state;
  const release=step(state,{held:false});
  assert.equal(release.state.phase,'leak');assert.equal(release.state.held,false);
  assert.ok(release.events.some(event=>event.type==='reference-continues'));
  assert.equal(conservatoryRiftFrame(release.state,{sites}).audio.reference,true);
  const returned=step(release.state,{forward:-1});
  assert.equal(returned.state.phase,'return');assert.equal(returned.events.filter(event=>event.type==='return').length,1);
  assert.deepEqual(returned.state.returnPose,original.returnPose);
  assert.equal(step(returned.state,{forward:-1,dt:1}).events.length,0);
  assert.deepEqual(original,fresh('bad-bar'),'the reducer does not mutate its argument');
});

test('early physical retreat stays available in all three scenes and grants no completed understanding',()=>{
  const a=step(fresh('bad-bar'),{forward:-1}).state;
  let c=fresh('fifth-chair');for(let i=0;i<7;i++)c=step(c,{forward:-1,dt:.2}).state;
  const b=step(fresh('after-company'),{stop:true}).state;
  for(const state of [a,b,c]){assert.equal(state.phase,'return');assert.equal(state.completed,false);assert.ok(state.returnReceipt);}
});

test('actual room collision blocks masonry and local shut leaves, while the full route returns continuously',()=>{
  const site=sites['after-company'],state=fresh('after-company'),door=site.doors.find(value=>value.id==='practice-east-4');
  assert.equal(site.canOccupy(63.25,68.25,state),false,'masonry at the room boundary is not a walkable decorative line');
  assert.equal(site.canOccupy(door.x,door.z,state),true,'the ordinary open aperture is supported');
  assert.equal(site.canOccupy(door.x,door.z,{...state,doorOpen:{...state.doorOpen,[door.id]:false}}),false);
  const f=candidateStudyFrame('after-company',3,sites);
  assert.equal(f.phase,'return');assert.ok(f.studyState.distance>40&&f.studyState.distance<60);
  assert.ok(Math.hypot(f.pose.x-site.arrival.x,f.pose.z-site.arrival.z)<1);
  assert.equal(f.studyState.heardPaper,true);assert.equal(f.studyState.leftEnsemble,true);
  const still=step(state,{dt:.25}).state;near(still.pose.x,state.pose.x);near(still.pose.z,state.pose.z);near(still.pose.yaw,state.pose.yaw);
});

test('a closed memory door never mutates the ordinary door or trap a body in its own plane',()=>{
  let state=fresh('after-company');const door=sites['after-company'].doors.find(value=>value.id==='practice-east-4');
  state.pose={...state.pose,x:door.x+.7,z:door.z};
  state=step(state,{interact:true}).state;assert.equal(state.doorOpen[door.id],false);
  state=step(state,{interact:true}).state;assert.equal(state.doorOpen[door.id],true);
  state.pose.x=door.x;const obstruction=step(state,{interact:true});assert.equal(obstruction.state.doorOpen[door.id],true);
  assert.deepEqual(FP.saveDoorState(),doorsBefore);assert.equal(JSON.stringify(PROPS.allProps()),propsBefore);
});

test('overhead marking needs distinct spatial entrances, anticipates the next mark, and withdraws over the physical edge',()=>{
  let state=fresh('fifth-chair');
  state=step(state,{interact:true}).state;state=step(state,{interact:true}).state;
  assert.equal(state.marks.length,1,'repeating one E press is not four entrances');
  state=step(state,{interact:true,mark:{x:.39,z:.5}}).state;
  assert.deepEqual(state.issuedMarks,[2]);assert.equal(state.phase,'embodied');
  const idle=step(state,{dt:.25}).state;assert.deepEqual(idle.token,state.token,'no absent input drifts the pencil');
  state=step(state,{interact:true,mark:{x:.61,z:.5}}).state;assert.equal(state.phase,'leak');
  const frame=conservatoryRiftFrame(state,{sites});assert.equal(frame.label.text,'CHUNK SURFER');assert.equal(frame.label.isBirthName,false);
  for(let i=0;i<7;i++)state=step(state,{forward:-1,dt:.2}).state;
  assert.equal(state.phase,'return');assert.ok(state.token.z>=.97);assert.equal(state.completed,true);
});

test('pause, render failure, run mismatch and serialized resume do not fabricate a performance or identity receipt',()=>{
  for(const option of CONSERVATORY_RIFT_OPTIONS){
    const state=fresh(option.id);
    for(const hold of [{paused:true},{hidden:true},{renderReady:false}])assert.deepEqual(step(state,{...hold,dt:.25,held:true,interact:true,stop:true}).state,state);
    const json=JSON.parse(JSON.stringify(candidateStudyFrame(option.id,2,sites).studyState));
    const resumed=normalizeConservatoryRift(json,{sites,optionId:option.id,runId:'rift-study'});
    assert.equal(resumed.phase,'leak');
    const other=normalizeConservatoryRift(json,{sites,optionId:option.id,runId:'different-night'});
    assert.equal(other.phase,'entry');assert.equal(other.returnReceipt,null);
  }
  const fake={...fresh('bad-bar'),phase:'return',completed:true};
  assert.equal(normalizeConservatoryRift(fake,{sites}).completed,false);
});

function audioFixture(){
  const nodes=[],destination={},context={currentTime:10,
    createGain(){return{gain:{value:1,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};},
    createStereoPanner(){return{pan:{value:0},connect(){},disconnect(){}};},
    createOscillator(){const node={frequency:{setValueAtTime(hz){node.hz=hz;}},connect(){},start(at){node.at=at;},stop(at){if(Number.isFinite(at))node.scheduledStop=at;else node.stopped=true;}};nodes.push(node);return node;}};
  return{nodes,destination,context};
}

test('candidate audio separates live and reference and releases only its own nodes',()=>{
  const f=audioFixture(),audio=createConservatoryRiftAudio({getAudio:()=>({ctx:f.context,destination:f.destination})});
  const frame=candidateStudyFrame('bad-bar',2,sites);
  audio.event({type:'live-start'},frame);assert.equal(f.nodes.length,4);
  const live=[...f.nodes];audio.event({type:'reference-continues'},frame);assert.equal(f.nodes.length,10);
  audio.event({type:'live-stop'},frame);assert.ok(live.every(node=>node.stopped));
  assert.ok(f.nodes.slice(4).every(node=>!node.stopped));
  assert.equal(audio.snapshot().source,'non-player');
  audio.update({...frame,phase:'return'},{dt:.25});assert.equal(audio.snapshot().active,0);
  audio.destroy();audio.destroy();assert.equal(audio.snapshot().closed,true);
  assert.equal(audio.event({type:'live-start'},frame),false);
});
