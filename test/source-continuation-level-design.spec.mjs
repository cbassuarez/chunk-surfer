import test from 'node:test';
import assert from 'node:assert/strict';
import * as layout from '../src/data/source-continuation.js';
import * as controller from '../src/game/source-continuation.js';
import {continuationSupportedPath,continuationWalkSegment,recordContinuationHushWalk} from '../src/game/source-continuation-hush.js';
import {sceneWalkSpeed} from '../src/game/locomotion.js';

const C=layout.SOURCE_CONTINUATION;
const fresh=()=>controller.resumeSourceContinuation(controller.freshSourceContinuation({runId:'level-design'}));
const close=(a,b,t=.001)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
function tick(state,input={},events=[]) {
  const result=controller.stepSourceContinuation(state,{dt:.05,renderReady:true,...input});
  events.push(...result.events);
  const actor=result.state.hush;
  if(actor.active&&!actor.fall)assert.ok(layout.continuationSupportAt(actor.x,actor.z,{feet:actor.feet,chartId:actor.chartId}),`Hush needs floor at ${actor.x},${actor.z},${actor.feet}`);
  assert.ok(Math.hypot(actor.x-state.hush.x,actor.z-state.hush.z)<=C.hush.speed*.05+.001,'no relocation or geometric shortcut');
  return result.state;
}
function walk(state,x,z,events=[]) {
  // The planned walks jog: the route must arrive before the Hush's clock does.
  const speed=sceneWalkSpeed('interior',true);
  for(let n=0;n<1600;n++) {
    const dx=x-state.x,dz=z-state.z,d=Math.hypot(dx,dz);
    if(d<.04&&!state.fall&&!state.recovery)return state;
    assert.equal(state.recovery,null,`ordinary planned walk captured at ${state.x},${state.z}: ${state.recovery?.reason}`);
    const amount=Math.min(1,d/(speed*.05));
    state=tick(state,{forward:amount,run:true,look:{yaw:Math.atan2(dx,-dz)}},events);
  }
  assert.fail(`cannot walk to ${x},${z}; at ${state.x},${state.z},${state.feet}`);
}
const radial=(radius,angle)=>layout.continuationRadialPoint(radius,angle);
function arc(state,angle,events=[],radius=null) {
  const stage=layout.continuationStage(state.level),r=radius??(stage.innerRadius+stage.outerRadius)/2;
  let from=Math.atan2(state.z-C.catch.center.z,state.x-C.catch.center.x);while(from<stage.startAngle)from+=2*Math.PI;
  let p=radial(r,from);state=walk(state,p.x,p.z,events);
  const count=Math.max(1,Math.ceil(Math.abs(angle-from)/.1));
  for(let k=1;k<=count;k++){p=radial(r,from+(angle-from)*k/count);state=walk(state,p.x,p.z,events);}
  return state;
}
function drop(state,lip,events=[]) {
  state=walk(state,lip.x,lip.z,events);state=tick(state,{interact:true},events);
  assert.ok(state.fall,'a chosen release starts real gravity');
  for(let frame=0;frame<600&&state.fall;frame++)state=tick(state,{},events);
  assert.equal(state.fall,null,'the chosen release finds its physical receiving support within30 simulated seconds');
  assert.equal(state.recovery,null,'the chosen visible receiving footprint must be safe');
  return state;
}
const pathLength=path=>path.slice(1).reduce((sum,p,k)=>sum+Math.hypot(p.x-path[k].x,p.z-path[k].z,p.feet-path[k].feet),0);

test('II offers the high return reversal while open edges and the outward departure remain playable under pursuit',t=>{
  let state=fresh();const events=[];
  for(const [x,z]of layout.SOURCE_CONTINUATION_ROUTES.main.slice(1,11))state=walk(state,x,z,events);
  assert.equal(state.feet,8.4);
  const before=state;
  for(let n=0;n<100&&!state.fall;n++)state=tick(state,{forward:1,run:true,look:{yaw:Math.PI}},events);
  assert.equal(state.fall?.trigger,'step-off','the shortened west arm is a freely usable edge');
  assert.equal(state.phase,'wrong-return');
  state=before;
  for(const [x,z]of layout.SOURCE_CONTINUATION_ROUTES.main.slice(11))state=walk(state,x,z,events);
  assert.ok(state.knowledge.includes('false-return-porch'));
  assert.ok(state.knowledge.includes('upper-return-is-different'));
  assert.ok(state.hush.armed);
  assert.equal(controller.sourceContinuationCanOccupy(4.75,-12,state),false,'the half-metre split has no floor, and a free jump can bridge it');
  assert.equal(state.phase,'wrong-return');assert.equal(state.chartId,0);
  close(state.x,-16.5,.04);close(state.z,-12,.04);
  assert.equal(events.filter(e=>e.type==='capture').length,0,'the original U and outward departure never require a capture');
  assert.equal(events.filter(e=>e.type==='hush-warning').length,1);
  // The charted outward journey and all Catch shelves are exercised continuously
  // by the ordinary-key guided-review proof, rather than the removed old bridge.
  t.diagnostic(`Original II and outward departure ${state.elapsed.toFixed(3)}s; same armed Hush, no captures.`);
});

test('each alternate receives a separate safe wrong catch and a supported longer outer return',()=>{
  for(let sourceLevel=0;sourceLevel<3;sourceLevel++) {
    const landings=[];
    for(const lip of layout.continuationDropLips({level:sourceLevel})) {
      let state=controller.normalizeSourceContinuation({...fresh(),phase:'catch',level:sourceLevel,x:lip.x,z:lip.z,feet:layout.continuationCatchFloor(sourceLevel),lastSafe:{...lip,feet:layout.continuationCatchFloor(sourceLevel)},hush:{...fresh().hush,active:false}});
      state=drop(state,lip);
      landings.push(state);
    }
    const [direct,wrong]=landings,level=sourceLevel+1;
    assert.equal(layout.continuationSupportAt(direct.x,direct.z,direct).surface.role,'catch');
    assert.equal(layout.continuationSupportAt(wrong.x,wrong.z,wrong).surface.role,'wrong-catch');
    const target=level<3?{...layout.CONTINUATION_DROP_LIPS[level],feet:layout.continuationCatchFloor(level)}:C.catch.finalApproach;
    const directPath=continuationSupportedPath(direct,target),wrongPath=continuationSupportedPath(wrong,target);
    assert.ok(directPath&&wrongPath,'both consequences have real supported routes onward');
    assert.ok(pathLength(wrongPath)>pathLength(directPath)+5,`stage ${level}: wrong catch must cost a meaningful reposition`);
    const branch=layout.CONTINUATION_RETURN_CATCHES[sourceLevel],stage=layout.continuationStage(level),r=stage.outerRadius-.7;
    let state=wrong,p=radial(r,branch.angle);state=walk(state,p.x,p.z);
    const count=Math.ceil(Math.abs(branch.joinAngle-branch.angle)/.08);
    for(let k=1;k<=count;k++){p=radial(r,branch.angle+(branch.joinAngle-branch.angle)*k/count);state=walk(state,p.x,p.z);}
    assert.equal(layout.continuationSupportAt(state.x,state.z,state).surface.role,'catch');
    const recovery=controller.sourceContinuationRecoveryPlan(wrong,'hush-pressure');
    assert.equal(recovery.repaired,false,'a wrong catch has a physical local recovery, not a repair teleport');
  }
});

test('hesitation on ground, middle, stairs and high return is reachable by the same supported Hush; recovery stays on that floor network',()=>{
  let state=fresh();const routes=layout.SOURCE_CONTINUATION_ROUTES.main;
  for(const [x,z]of routes.slice(1,6))state=walk(state,x,z);
  let ground=state;
  for(const [x,z]of [[-8,-30],[-8,-7],[11,-7],[11,-30],[20,-30],[20,-7],[16,-7],[16,-22]])ground=walk(ground,x,z);
  assert.equal(ground.feet,0);assert.equal(ground.hush.armed,true,'ground pressure follows an earned middle landing and actual return down the east stair');
  for(const [x,z]of [[-8,-30],[-8,-7]])state=walk(state,x,z);
  const samples=[ground,state];
  state=walk(state,-12,-7);
  state=walk(state,-12,-18);samples.push(state);
  state=walk(state,-12,-30);state=walk(state,-16,-30);samples.push(state);
  for(const sample of samples) {
    let waiting=sample,events=[];
    for(let n=0;n<2000&&!waiting.recovery;n++)waiting=tick(waiting,{},events);
    assert.equal(waiting.recovery?.reason,'hush-pressure','an ordinary supported pose is not an immunity island');
    assert.equal(waiting.recovery.repaired,false);
    assert.equal(waiting.recovery.kind,'guided-return');
    assert.ok(waiting.recovery.path.slice(1).every((p,k)=>continuationWalkSegment(waiting.recovery.path[k],p)));
    const actor={x:waiting.hush.x,z:waiting.hush.z,feet:waiting.hush.feet};
    for(let frame=0;frame<1200&&waiting.recovery;frame++){waiting=tick(waiting);assert.deepEqual({x:waiting.hush.x,z:waiting.hush.z,feet:waiting.hush.feet},actor);assert.ok(layout.continuationSupportAt(waiting.x,waiting.z,waiting),'carried return follows ground and treads');}
    assert.equal(waiting.recovery,null,'the supported return completes within its bounded60s fixture');
    assert.ok(waiting.grace>2.9);
    const anchor=waiting.recoveryAnchor;close(waiting.x,anchor.x);close(waiting.z,anchor.z);close(waiting.feet,anchor.feet);
    const departure=[[3.3,0],[-3.3,0],[0,3.3],[0,-3.3]].map(([dx,dz])=>({...anchor,x:anchor.x+dx,z:anchor.z+dz})).find(p=>continuationWalkSegment(anchor,p)&&controller.sourceContinuationCanOccupy(p.x,p.z,waiting));
    assert.ok(departure,'the actually earned landing has a real supported departure');waiting=walk(waiting,departure.x,departure.z);
    assert.equal(waiting.recovery,null,'recovery grace supplies a usable physical departure');
  }
});

test('a real refuge holds Hush outside its neck and a fresh departure gets a finite notice interval',()=>{
  let state=fresh();const events=[];
  for(const [x,z]of layout.SOURCE_CONTINUATION_ROUTES.main.slice(1,19))state=walk(state,x,z,events);
  // The route array now includes the full outgoing overlook arm. Its former
  // index18 endpoint is the refuge's outer crossing, not the protected body
  // position; walk the retained approach into the actual refuge before wait.
  state=walk(state,0,-20,events);state=walk(state,C.wrongReturn.refuge.x,C.wrongReturn.refuge.z,events);
  for(let n=0;n<2000;n++)state=tick(state,{},events);
  assert.equal(state.recovery,null);assert.equal(state.hush.mode,'yield');
  const refuge=layout.continuationRefugeAt(state);
  assert.ok(Math.hypot(state.hush.x-refuge.x,state.hush.z-refuge.z)>=Math.max(C.hush.refugeStandOff,refuge.standOff||0)-.01);
  const queued=structuredClone(state.hush.trail),last=structuredClone(state.hush.lastRecorded);
  for(let n=0;n<5000;n++) {
    const pose={x:refuge.x+.6*Math.sin(n*.2),z:refuge.z+.6*Math.cos(n*.2),feet:refuge.feet,level:0};
    assert.ok(layout.continuationSupportAt(pose.x,pose.z,pose));
    recordContinuationHushWalk(state.hush,pose,{protectedRefuge:true});
  }
  assert.deepEqual(state.hush.trail,queued,'protected wandering cannot accumulate an obsolete pursuit backlog');
  assert.deepEqual(state.hush.lastRecorded,last,'the future reconnect starts from the last real recorded position');
  state=controller.normalizeSourceContinuation(JSON.parse(JSON.stringify(state)));
  state=walk(state,0,-12,events);state=walk(state,-7,-12,events);
  assert.equal(state.recovery,null);assert.ok(events.some(e=>e.type==='hush-notice'));
});

test('long saved trails compact through supported paths without losing a queued gravity release or its destination',()=>{
  const lip=layout.CONTINUATION_DROP_LIPS[0],landing={x:C.catch.center.x+5.313333333333155,z:C.catch.center.z,feet:2.4,level:1};
  const before=Array.from({length:3500},(_,n)=>({kind:'walk',x:lip.x+.12*Math.sin(n),z:lip.z+.12*Math.cos(n),feet:8.4,level:0}));
  const after=Array.from({length:3500},(_,n)=>({kind:'walk',x:C.catch.center.x+6+Math.sin(n)*.1,z:C.catch.center.z+Math.cos(n)*.1,feet:2.4,level:1}));
  const target=after.at(-1);
  let state=controller.normalizeSourceContinuation({...fresh(),phase:'catch',level:1,...target,lastSafe:{...target,yaw:0,pitch:0},hush:{...fresh().hush,active:true,x:lip.x,z:lip.z,feet:8.4,armed:true,mode:'follow',elapsed:10,
    trail:[...before,{kind:'drop',x:lip.x,z:lip.z,feet:8.4,level:0,vx:-.8,vz:0},{kind:'walk',...landing},...after],lastRecorded:target}});
  assert.ok(state.hush.trail.length<512);assert.equal(state.hush.trail.filter(p=>p.kind==='drop').length,1);
  assert.deepEqual(state.hush.lastRecorded,{x:target.x,z:target.z,feet:target.feet,chartId:0,level:target.level});
  close(state.hush.x,lip.x);close(state.hush.z,lip.z);close(state.hush.feet,8.4);
  const events=[];
  for(let n=0;n<200&&state.hush.level===0;n++)state=tick(state,{},events);
  assert.equal(events.filter(e=>e.type==='hush-drop').length,1);assert.equal(events.filter(e=>e.type==='hush-land').length,1);assert.equal(state.hush.level,1);
});

test('Hush opens a shut ordinary leaf with its real swing before crossing its occupied plane',()=>{
  let state={...fresh(),phase:'wrong-return',level:0,x:-26.5,z:-12,feet:8.4,lastSafe:{x:-26.5,z:-12,feet:8.4,level:0,yaw:0,pitch:0},
    hush:{...fresh().hush,active:true,x:-17.3,z:-12,feet:8.4,armed:true,mode:'follow',elapsed:10,trail:[{kind:'walk',x:-26.5,z:-12,feet:8.4,level:0}],lastRecorded:{x:-26.5,z:-12,feet:8.4,level:0}}};
  const events=[];let openedAt=null;
  for(let n=0;n<100&&state.hush.x>-18.5;n++) {
    state=tick(state,{},events);
    if(openedAt===null&&events.some(e=>e.type==='door'&&e.actor===state.hush.id))openedAt=state.elapsed;
    if(controller.sourceContinuationDoorFraction(state,'wrong-onward')<C.doorPassFraction)assert.ok(state.hush.x>-18+C.hush.radius,'closed leaf retains physical Hush occupancy');
  }
  assert.ok(openedAt!==null);assert.ok(state.elapsed-openedAt>=C.doorSwingSeconds*C.doorPassFraction-.05);assert.ok(state.hush.x<-18.5);
});

test('pause/reload retains actor route and gravity exactly; version two keeps its earned four-stage level',()=>{
  // A bounded real Catch support fixture isolates the serialized chase drop;
  // the end-to-end chart journey is covered by the ordinary-key route proof.
  const lip=layout.CONTINUATION_DROP_LIPS[0];
  let state=controller.normalizeSourceContinuation({...fresh(),phase:'catch',level:0,x:lip.x,z:lip.z,feet:8.4,lastSafe:{...lip,feet:8.4,level:0},
    hush:{...fresh().hush,x:lip.x+4,z:lip.z,feet:8.4,level:0,armed:true,mode:'follow',elapsed:10,trail:[{kind:'walk',...lip,feet:8.4,level:0}],lastRecorded:{...lip,feet:8.4,level:0}}});
  state=drop(state,lip);
  for(let n=0;n<400&&!state.hush.fall;n++)state=tick(state);
  assert.ok(state.hush.fall,'the pursuer reaches the recorded release');
  const saved=JSON.parse(JSON.stringify(state));
  assert.deepEqual(controller.stepSourceContinuation(saved,{dt:.25,paused:true}).state,saved);
  assert.deepEqual(controller.stepSourceContinuation(saved,{dt:.25,renderReady:false}).state,saved);
  assert.deepEqual(controller.stepSourceContinuation(saved,{dt:.05}).state,controller.stepSourceContinuation(state,{dt:.05}).state);
  for(let level=0;level<4;level++) {
    const current=layout.continuationRefugeAt({phase:'catch',level});
    const at={...current,x:current.x+134,z:current.z+80};
    const migrated=controller.normalizeSourceContinuation({...fresh(),layoutVersion:2,phase:'catch',level,...at,lastSafe:{...at,yaw:0,pitch:0}});
    assert.equal(migrated.layoutVersion,C.layoutVersion);assert.equal(migrated.level,level);assert.ok(layout.continuationSupportAt(migrated.x,migrated.z,migrated));
    assert.deepEqual(controller.normalizeSourceContinuation(migrated),migrated);
  }
});
