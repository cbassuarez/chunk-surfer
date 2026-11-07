import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {continuationSupportAt,continuationSurfaces} from '../src/data/source-continuation.js';
import {SOURCE_TIDES,sourceTideField} from '../src/game/source-continuation-tides.js';
import {SOURCE_RIFT,sourceRiftFaultClear,sourceRiftFaultTouched,sourceRiftLips} from '../src/game/source-rift.js';
import {freshSourceContinuation,normalizeSourceContinuation,stepSourceContinuation} from '../src/game/source-continuation.js';
import {createSourceContinuationScene} from '../src/game/source-continuation-scene.js';
import {sourceFaultFrame} from '../src/game/source-faults.js';
import {freshStandingTear,stepStandingTear} from '../src/game/standing-tear.js';
import {sourceContinuationGeometry,sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';
import {standingTearOmens} from '../src/render/standing-tear-omens.js';
import {standingTearGeometry,standingTearRenderFrame,standingTearThresholdProps} from '../src/render/standing-tear-renderer.js';
import {STANDING_TEAR_LAYOUT as TEAR} from '../src/data/standing-tear.js';
import {seamBeatHz} from '../src/game/practice-seams.js';

const [faultII,faultIII]=SOURCE_RIFT.faults;
// Each is approached from the deck side: Source II's arm ends just past its fault.
const approachZ=fault=>fault===faultII?fault.z-3:fault.z+3;
const body=(fault,extra={})=>({...freshSourceContinuation({runId:'rift'}),status:'active',phase:fault.phase,chartId:fault.chartId,level:fault.level,
  x:fault.x,z:approachZ(fault),feet:fault.feet,yaw:0,pitch:0,lastSafe:{x:fault.x,z:approachZ(fault),feet:fault.feet,level:fault.level,chartId:fault.chartId,phase:fault.phase},...extra});
function walk(state,seconds,input){
  const events=[];
  for(let t=0;t<seconds;t+=1/30){const r=stepSourceContinuation(state,{dt:1/30,...(typeof input==='function'?input(state):input)});state=r.state;events.push(...r.events);}
  return{state,events};
}

test('the faults keep the practice wing\'s own beat and bar',()=>{
  assert.equal(SOURCE_RIFT.beatHz,seamBeatHz());assert.equal(SOURCE_RIFT.beatHz,4);
  assert.equal(SOURCE_RIFT.barSeconds,TEAR.barSeconds);
  const starts=[];let previous=false;
  for(let timeMs=0;timeMs<=30000;timeMs+=5){
    const frame=sourceFaultFrame({sourcePhase:true,proper:true,timeMs,seed:193});
    if(frame.overflowActive&&!previous)starts.push(timeMs);previous=frame.overflowActive;
  }
  assert.ok(starts.length>=6);
  const bar=SOURCE_RIFT.barSeconds*1000;
  for(const at of starts)assert.ok(Math.min(at%bar,bar-at%bar)<=5,`a bad-sector run began between bars at ${at}ms`);
});

test('one ink: Source\'s chunk errors and the rift room\'s tears are cut from the same colours, and the hall tear wears none',()=>{
  const catchMeshes=sourceContinuationGeometry({phase:'catch'}).filter(g=>/chunk-error-\d$/.test(g.name||g.id||''));
  for(const mesh of catchMeshes)assert.ok(SOURCE_RIFT.ink.some(rgb=>rgb.every((v,k)=>v===mesh.base?.[k])));
  const tear=new Map(standingTearGeometry().map(piece=>[piece.id,piece]));
  SOURCE_RIFT.ink.forEach((rgb,index)=>{
    assert.deepEqual(tear.get('rift-tears-'+index).base.slice(0,3),[...rgb]);assert.equal(tear.get('rift-tears-'+index).materialRole,'source-chunk-error');
  });
  // Ellery Proper wears no fault ink: nothing in the building may read as a cause.
  assert.ok(!standingTearThresholdProps(TEAR.site).some(p=>/rift-|chunk-error/.test(p.mesh)),'the practice hall tear stays plain');
  assert.ok(![...tear.keys()].some(id=>id.startsWith('rift-lip-')));
});

test('each opening fault stands on a real deck, in a quiet place, in reach of its own omen',()=>{
  for(const fault of SOURCE_RIFT.faults){
    const support=continuationSupportAt(fault.x,fault.z,{phase:fault.phase,chartId:fault.chartId,feet:fault.feet,level:fault.level},{margin:.22});
    assert.ok(support,`${fault.id} floats`);assert.equal(support.y,fault.feet);
  }
  assert.equal(continuationSupportAt(faultII.x,faultII.z,{chartId:0,feet:faultII.feet}).id,'wrong-upper-west');
  assert.equal(continuationSupportAt(faultIII.x,faultIII.z,{chartId:0,feet:faultIII.feet}).id,'catch-far-satellite');
  const hole=SOURCE_TIDES.wells['wrong-return'];
  assert.ok(Math.hypot(hole.x-faultII.x,hole.z-faultII.z)<4,'Source II\'s fault stands beneath the hole');
  const field=sourceTideField(body(faultII),{still:30,time:0});
  const pull=[field.x-field.wind.x,field.z-field.wind.z];
  assert.ok(pull[1]>0,'and the hole\'s tide leans the arm toward it');
});

test('walking into a fault opens it once; a body returned beside it must walk clear first',()=>{
  for(const fault of SOURCE_RIFT.faults){
    const start=body(fault),input=s=>({forward:1,environment:true,look:{yaw:Math.atan2(fault.x-s.x,-(fault.z-s.z)),pitch:0}});
    const first=walk(start,3,input),opened=first.events.filter(e=>e.type==='rift-fault');
    assert.deepEqual(opened.map(e=>e.id),[fault.id]);assert.equal(first.state.riftLatch,fault.id);
    assert.ok(Math.hypot(first.state.x-fault.x,first.state.z-fault.z)<SOURCE_RIFT.width,'it opened at the sheet');
    assert.equal(walk(start,3,s=>({...input(s),environment:false})).events.filter(e=>e.type==='rift-fault').length,0,'pure physics never opens one');
    // The saved checkpoint keeps the latch, so a reload cannot reopen it underfoot.
    const saved=normalizeSourceContinuation(JSON.parse(JSON.stringify(first.state)));assert.equal(saved.riftLatch,fault.id);
    assert.equal(sourceRiftFaultTouched(saved)?.id,fault.id);assert.equal(sourceRiftFaultClear(saved,fault.id),false);
    assert.equal(walk(saved,.5,{environment:true}).events.filter(e=>e.type==='rift-fault').length,0,'standing there does nothing');
    const away=walk(saved,2,s=>({forward:1,environment:true,look:{yaw:Math.atan2(s.x-fault.x,-(s.z-fault.z)),pitch:0}}));
    assert.equal(away.state.riftLatch,null,'walking clear releases it');
    assert.equal(walk(away.state,3,input).events.filter(e=>e.type==='rift-fault').length,1,'and it opens again');
  }
});

test('the scene hands a touched fault to its host once, and a declining host leaves the body playing',async()=>{
  const renderer={initialize:async()=>true,ready:()=>true,render:()=>true,dispose(){}};
  const run=async answer=>{
    const asked=[];const fault=faultII;
    const scene=createSourceContinuationScene({checkpoint:body(fault,{z:fault.z+.75}),renderer,tides:true,onRiftFault:value=>{asked.push(value);return answer;}});
    await scene.initialize();scene.key({key:'w'});
    for(let n=0;n<30;n++)scene.update(1/30);
    await new Promise(resolve=>setTimeout(resolve));
    return{asked,view:scene.view()};
  };
  const taken=await run(true);
  assert.equal(taken.asked.length,1);assert.equal(taken.asked[0].id,faultII.id);assert.equal(taken.asked[0].checkpoint.riftLatch,faultII.id);
  assert.equal(taken.view.leaving,true,'the host now owns the handoff');
  const declined=await run(false);
  assert.equal(declined.asked.length,1,'the latch keeps it from asking again');assert.equal(declined.view.leaving,false);
});

test('Source draws only its own standing fault, outside the architecture budget, in ink',()=>{
  const inII=sourceContinuationRenderFrame(body(faultII,{elapsed:30})),inIII=sourceContinuationRenderFrame(body(faultIII,{elapsed:30}));
  for(const [frame,fault] of [[inII,faultII],[inIII,faultIII]]){
    assert.ok(frame.riftFaults.length===1+sourceRiftLips().length);
    assert.ok(frame.riftFaults.every(p=>p.riftFault===fault.id&&p.matrix.length===16&&Array.from(p.matrix).every(Number.isFinite)));
    assert.ok(!frame.props.some(p=>p.riftFault),'kept apart from the void-copied architecture');
    assert.ok(frame.riftFaults.filter(p=>/chunk-error-\d$/.test(p.mesh)).length===sourceRiftLips().length);
  }
  assert.equal(sourceContinuationRenderFrame({...freshSourceContinuation(),status:'active',phase:'wrong-return',chartId:3,x:0,z:0,feet:0}).riftFaults.length,0);
});

const memory=(id,seconds,pressure=.2)=>({id,awake:seconds>0,awakeSeconds:seconds,pressure});
test('each woken piece opens its own omen over the room, and nothing before it wakes',()=>{
  const none=standingTearOmens([memory('solo',0),memory('ensemble',0),memory('couperin',0)],{elapsed:5});
  assert.equal(none.props.length,0);assert.equal(none.horizon,null);
  const solo=standingTearOmens([memory('solo',20,1),memory('ensemble',0),memory('couperin',0)],{elapsed:20});
  assert.deepEqual(solo.props.map(p=>p.mesh),SOURCE_RIFT.ink.map((_,k)=>'rift-tears-'+k));assert.equal(solo.horizon,null);
  const hole=standingTearOmens([memory('solo',0),memory('ensemble',20),memory('couperin',0)],{elapsed:20});
  assert.equal(hole.props.length,0);assert.ok(hole.horizon?.active);
  assert.deepEqual(hole.horizon.centre,[SOURCE_RIFT.room.hole.x,SOURCE_RIFT.room.hole.y,SOURCE_RIFT.room.hole.z]);
  assert.ok(hole.horizon.radius>.85*SOURCE_RIFT.room.hole.size*.99,'fully open');
  assert.ok(standingTearOmens([memory('ensemble',18)],{elapsed:18}).horizon.diagnostics.eyesClosed>0,'its marked mistakes close the eyes here too');
  assert.equal(standingTearOmens([memory('ensemble',2)],{elapsed:2}).horizon?.diagnostics.eyesClosed??0,0,'but not before the first has been heard');
  const sun=standingTearOmens([memory('solo',0),memory('ensemble',0),memory('couperin',20)],{elapsed:20});
  assert.deepEqual(sun.props.map(p=>p.mesh).sort(),['omen-corona','omen-moon','omen-stream','omen-sun']);
  assert.ok(sun.props.every(p=>Array.from(p.matrix).every(Number.isFinite)));
  const held=standingTearOmens([memory('couperin',20)],{elapsed:20,stillOmens:true}).props.find(p=>p.mesh==='omen-moon');
  assert.deepEqual(Array.from(held.matrix),Array.from(standingTearOmens([memory('couperin',20)],{elapsed:99,stillOmens:true}).props.find(p=>p.mesh==='omen-moon').matrix),'reduced motion holds the moon');
  const frame=standingTearRenderFrame({elapsed:20,phase:'reference',memories:[memory('ensemble',20),memory('couperin',20)],camera:{eye:[0,1.62,16],yaw:0,pitch:0}});
  assert.ok(frame.horizon?.active);assert.ok(frame.props.some(p=>p.standingTearRole==='omen-black-sun'));
  assert.ok(frame.props.filter(p=>String(p.standingTearRole).startsWith('omen-')).every(p=>!p.physicalBoundary),'overhead only, never a floor or wall');
});

test('in the room a still body drifts toward the middle once a piece has woken, without earning anything',()=>{
  const step=(state,input,seconds)=>{for(let t=0;t<seconds;t+=.05)state=stepStandingTear(state,{dt:.05,renderReady:true,environment:true,...input}).state;return state;};
  let state=freshStandingTear({runId:'rift',returnPose:{x:0,y:0,floor:0,yaw:0,pitch:0}});
  const start={...state.pose};state=step(state,{},4);
  assert.deepEqual([state.pose.x,state.pose.z],[start.x,start.z],'an unopened room does not pull');
  state.pose={...state.pose,x:-9,z:4};
  const walked=step(state,{forward:1,lookYaw:0},1.2);
  assert.ok(walked.memories.find(m=>m.id==='solo').awake,'walking wakes the piece');
  const settled=step(walked,{},8),distanceBefore=Math.hypot(walked.pose.x-SOURCE_RIFT.room.well.x,walked.pose.z-SOURCE_RIFT.room.well.z),
    distanceAfter=Math.hypot(settled.pose.x-SOURCE_RIFT.room.well.x,settled.pose.z-SOURCE_RIFT.room.well.z);
  assert.ok(distanceAfter<distanceBefore-1,`${distanceBefore} -> ${distanceAfter}`);
  assert.equal(settled.moving,false,'drift is not walking');assert.equal(settled.liveMemoryId,null,'it starts no voice');
  assert.equal(settled.memories.find(m=>m.id==='solo').metres,walked.memories.find(m=>m.id==='solo').metres,'and earns no pressure');
  const still=step(walked,{environment:false},4);assert.deepEqual([still.pose.x,still.pose.z],[walked.pose.x,walked.pose.z],'pure physics never drifts');
});

test('the host routes a Source fault through the room and back, and the room keeps no save of its own',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/onRiftFault:\(\{id,checkpoint:value\}\)=>enterRiftFromSourceFault\(scene,value,id\)/);
  assert.match(main,/async function enterRiftFromSourceFault[\s\S]{0,700}setContinuationCheckpoint\(checkpoint\)[\s\S]{0,300}releaseSourceContinuation\(\{restore:false\}\)/);
  assert.match(main,/onCheckpoint:value=>\{if\(!sourceReturn&&standingTearScene===scene/);
  assert.match(main,/if\(!sourceReturn\)saveCommit\(\{standingTear:scene\.serialize\(\)\}\)/);
  assert.match(main,/onRestore:\(\{returnPose:pose\}\)=>sourceReturn\?leaveForSource\(\):restoreStandingTearOperator\(pose\)/);
  assert.ok(continuationSurfaces({phase:'catch'}).some(s=>s.id==='catch-far-satellite'));
});
