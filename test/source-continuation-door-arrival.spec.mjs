import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_CONTINUATION as C,continuationSupportAt,continuationBodyClearAt} from '../src/data/source-continuation.js';
import {freshSourceContinuation,normalizeSourceContinuation,stepSourceContinuation,sourceContinuationFrame,sourceContinuationDoorFraction,sourceContinuationThreatTelemetry} from '../src/game/source-continuation.js';
import {SOURCE_CONNECTOR_REVIEW_POSES,SOURCE_CONNECTOR_REVIEW_STATES} from '../src/data/source-connector-corridor.js';
import {continuationPursuitOrigin} from '../src/game/source-continuation-arrival.js';

const fresh=()=>({...freshSourceContinuation({runId:'door-arrival'}),status:'active'});
const tick=(state,input={},events=[])=>{const r=stepSourceContinuation(state,{dt:1/60,...input});events.push(...r.events);return r.state;};
const xyz=a=>({x:a.x,z:a.z,feet:a.feet});
function until(state,predicate,{events=[],input={},max=1800}={}){for(let i=0;i<max&&!predicate(state);i++)state=tick(state,input,events);assert.ok(predicate(state),'bounded arrival outcome: '+JSON.stringify({phase:state.phase,x:state.x,z:state.z,feet:state.feet,elapsed:state.elapsed,recovery:state.recovery?.reason,hushMode:state.hush?.mode}));return state;}

test('II keeps one hidden supported body behind the real leaf until six accepted seconds; pause, loading and reload retain its clock',()=>{
  let state=fresh();const origin=continuationPursuitOrigin(),events=[];
  assert.deepEqual(xyz(state.hush),xyz(origin));assert.equal(state.hush.active,false);
  assert.equal(sourceContinuationFrame(state).hush.active,false);
  assert.ok(continuationSupportAt(origin.x,origin.z,origin));assert.ok(continuationBodyClearAt(origin));
  for(let n=0;n<120;n++)state=tick(state,{},events);
  const before=JSON.parse(JSON.stringify(state));
  for(const hold of[{paused:true},{renderReady:false}])assert.deepEqual(tick(state,{...hold,dt:.25}),state);
  state=normalizeSourceContinuation(before);assert.deepEqual(state.hush,before.hush);
  state=until(state,s=>s.elapsed>=C.hush.entryDelaySeconds-.02,{events});
  assert.equal(state.hush.active,false);assert.equal(state.doorOpen['wrong-entry-return'],undefined);
  state=until(state,s=>s.hush.active,{events});
  assert.ok(Math.abs(state.elapsed-6)<.02);assert.deepEqual(xyz(state.hush),xyz(origin));
  assert.equal(state.hush.armed,true,'no staircase or height milestone can indefinitely disarm the chase');
  assert.equal(state.hush.elapsed,0,'activation does not spend the visible warning');
  assert.equal(events.filter(e=>e.type==='hush-arrival').length,1);
  const leaf=events.find(e=>e.type==='door');assert.equal(leaf.actor,state.hush.id);assert.equal(leaf.id,'wrong-entry-return');
  assert.equal(sourceContinuationDoorFraction(state,'wrong-entry-return'),0,'the leaf starts its actual hinge motion');
  const arrival=state.hush.arrivals[0];assert.equal(arrival.chapter,'II');assert.equal(arrival.doorId,leaf.id);
});

test('II warning is complete and physical waiting can be captured, then recovery gives a usable departure',()=>{
  let state=until(fresh(),s=>s.hush.active),events=[],origin=xyz(state.hush);
  state=until(state,s=>s.hush.elapsed>=C.hush.warningSeconds-.025,{events});
  assert.deepEqual(xyz(state.hush),origin);assert.equal(state.hush.mode,'warning');
  state=until(state,s=>!!s.recovery,{events});assert.equal(state.recovery.reason,'hush-pressure');
  assert.equal(state.recovery.repaired,false);assert.ok(state.elapsed>10.5&&state.elapsed<12);
  assert.equal(events.filter(e=>e.type==='hush-warning').length,1);
  const actor=xyz(state.hush);
  for(let n=0;state.recovery&&n<1800;n++){state=tick(state,{},events);assert.deepEqual(xyz(state.hush),actor);}
  assert.equal(state.recovery,null,'recovery returns control within its finite fixture budget');
  assert.ok(state.grace>2.9);const start=xyz(state);
  for(let n=0;n<60;n++)state=tick(state,{forward:1},events);
  assert.equal(state.recovery,null);assert.ok(Math.hypot(state.x-start.x,state.z-start.z)>3);
});

function catchApproach(){
  const state=fresh(),at={x:-151.5,z:-92,feet:8.4,chartId:4,level:0,phase:'wrong-return'};
  return normalizeSourceContinuation({...state,...at,yaw:-Math.PI/2,lastSafe:{...at,yaw:-Math.PI/2,pitch:0},doorOpen:{'journey-catch-gate':true},
    hush:{...state.hush,active:true,armed:true,warningAnnounced:true,mode:'follow',elapsed:40,x:-149.8,z:-92,feet:8.4,chartId:4,
      trail:[{kind:'walk',...at}],lastRecorded:at}});
}

test('III receives the same actor through the actual gate fold after restored agency, with persistent provenance and a finite visible warning',()=>{
  let state=catchApproach(),events=[];
  state=until(state,s=>s.phase==='catch',{events,input:{forward:1}});
  const enteredAt=state.elapsed,id=state.hush.id;
  assert.equal(state.hush.arrivals.some(r=>r.chapter==='III'),false);
  for(let n=0;n<120;n++)state=tick(state,{},events);
  assert.equal(state.hush.chartId,4,'the real body waits outside the gate, rather than spawning inside');
  assert.deepEqual(tick(state,{paused:true,dt:.25}),state);
  state=until(state,s=>s.hush.arrivals.some(r=>r.chapter==='III'),{events});
  const arrival=state.hush.arrivals.find(r=>r.chapter==='III');
  assert.equal(state.hush.id,id);assert.equal(arrival.portalId,'catch-closure');assert.equal(arrival.doorId,'journey-catch-gate');
  assert.ok(arrival.at-enteredAt>=C.hush.thresholdArrivalDelaySeconds-.02);
  assert.ok(Math.abs(arrival.x-C.wrongReturn.threshold.x)<.04);assert.equal(arrival.chartId,0);
  assert.equal(state.hush.fall,null,'an upright supported threshold does not slide the actor away from its reveal');
  assert.equal(state.hush.mode,'notice');assert.ok(state.hush.notice>C.hush.thresholdNoticeSeconds-.02);
  assert.ok(events.some(e=>e.type==='hush-fold'&&e.id===arrival.portalId&&e.serial===arrival.serial));
  assert.ok(events.some(e=>e.type==='hush-warning'&&e.chapter==='III'&&e.doorId===arrival.doorId));
  state=normalizeSourceContinuation(JSON.parse(JSON.stringify(state)));
  for(let n=0;n<240;n++)state=tick(state,{},events);
  assert.equal(state.hush.arrivals.filter(r=>r.chapter==='III').length,1);
  assert.equal(events.filter(e=>e.type==='hush-arrival'&&e.chapter==='III').length,1);
  assert.equal(state.recovery,null,'the existing entry refuge remains a safe place to understand the new view');
});

test('III preserves the captured entry refuge wait, then physically pursues continued walking onto the Catch',t=>{
  let state=catchApproach(),events=[];
  state=until(state,s=>s.phase==='catch',{events,input:{forward:1}});
  for(let n=0;n<60*8;n++)state=tick(state,{},events);
  // This is the exact stop in the native inspection. It is still on the
  // intentionally safe entry bridge, not on the exposed catching surface.
  state=until(state,s=>s.x<=-157.23333333333423,{events,input:{forward:1}});
  const refugeActor=xyz(state.hush);
  for(let n=0;n<60*30;n++)state=tick(state,{},events);
  assert.equal(sourceContinuationThreatTelemetry(state,{horizonSeconds:0}).refuge,true);
  assert.deepEqual(xyz(state.hush),refugeActor);assert.equal(state.recovery,null);
  assert.equal(state.hush.phase,'catch','supported settlement assigns the destination region to the actual actor');
  assert.equal(state.hush.sheltered,true);assert.equal(state.hush.trail.length,0);
  // Forward follows the same west-facing body across the threshold. The old
  // overhead-only lateral mapping now strafes north, away from this route.
  for(let n=0;state.x>-162.45&&n<1800;n++){const before=xyz(state.hush);state=tick(state,{forward:1},events);assert.ok(Math.hypot(state.hush.x-before.x,state.hush.z-before.z)<=C.hush.speed/60+.001);}
  assert.ok(state.x<=-162.45,'first-person walking must reach the original supported waiting place: '+JSON.stringify(xyz(state)));
  assert.equal(state.phase,'catch');assert.equal(state.recovery,null);
  assert.equal(sourceContinuationThreatTelemetry(state,{horizonSeconds:0}).refuge,false);
  assert.equal(state.hush.sheltered,false);assert.ok(state.hush.x<refugeActor.x-2,'leaving the safe bridge reconnects supported pursuit');
  state=until(state,s=>!!s.recovery,{events,max:1800});
  assert.equal(state.recovery.reason,'hush-pressure');assert.equal(state.hush.chartId,0);
  assert.equal(state.hush.arrivals.filter(r=>r.chapter==='III').length,1);
  assert.equal(events.some(e=>e.type==='hush-arrival'&&e.chapter==='II'),false,'an existing approaching actor never restarts II');
  t.diagnostic('III_REFUGE_CONTINUATION '+JSON.stringify({nativeStop:{x:-157.23333333333423,z:-92},refugeWaitSeconds:30,refugeActor,exposedPlayer:xyz(state),pursuerAtCapture:xyz(state.hush),sameActor:state.hush.id,arrivalCount:state.hush.arrivals.length}));
});

test('repeated II and corridor waiting captures still leave a usable physical departure, even when the Hush has reached the restored body',t=>{
  for(const location of['II','corridor']){
    let state=fresh(),events=[];
    if(location==='II')state.yaw=Math.PI;
    else{
      const pose=SOURCE_CONNECTOR_REVIEW_POSES[0],at={x:pose.x,z:pose.z,feet:pose.feet,chartId:pose.chartId,level:0,phase:'wrong-return'};
      state=normalizeSourceContinuation({...state,...at,yaw:pose.yaw,pitch:pose.pitch,lastSafe:{...at,yaw:pose.yaw,pitch:pose.pitch},
        recoveryAnchor:{id:'dev-corridor-approach',...at},corridor:{...SOURCE_CONNECTOR_REVIEW_STATES.approach},
        hush:{...state.hush,active:true,armed:true,warningAnnounced:true,mode:'follow',elapsed:90,x:-151,z:-61,feet:8.4,chartId:4,
          trail:[{kind:'walk',x:-146,z:-61,feet:8.4,chartId:4,level:0,phase:'wrong-return'},{kind:'walk',...at}],lastRecorded:at}});
      state=until(state,s=>s.z<=-70.96,{events,input:{forward:1}});
    }
    for(let capture=0;capture<2;capture++){
      state=until(state,s=>!!s.recovery,{events,max:2400});assert.equal(state.recovery.reason,'hush-pressure');
      state=until(state,s=>!s.recovery,{events,max:Math.ceil((C.recoveryMaximumSeconds+1)*60)});
    }
    assert.ok(Math.hypot(state.x-state.hush.x,state.z-state.hush.z)<.05,'the repeated-wait fixture exercises an already coincident actor');
    const start=xyz(state),actor=state.hush.id,captures=events.filter(e=>e.type==='capture').length;
    if(location==='II'){
      assert.ok(Math.abs(state.yaw)<1e-8,'the earned entry anchor restores its ordinary route-facing view');
      for(let n=0;n<90;n++)state=tick(state,{forward:1},events);
    }
    else{
      for(let n=0;n<66;n++)state=tick(state,{forward:1},events);
      for(let n=0;n<11;n++)state=tick(state,{side:1},events);
      for(let n=0;n<90;n++)state=tick(state,{forward:1},events);
      assert.ok(state.z<-78.2,'the ordinary recovery departure can reach the real cabinet bypass');
      assert.ok(state.x>-146&&state.x<-144.9);assert.equal(state.corridor.phase,'settled');
    }
    assert.equal(state.recovery,null);assert.equal(state.hush.id,actor);
    assert.equal(events.filter(e=>e.type==='capture').length,captures,'accepted departure is not a repeated capture lock');
    assert.ok(Math.hypot(state.x-start.x,state.z-start.z)>4.5);
    t.diagnostic('RECOVERY_DEPARTURE '+JSON.stringify({location,capturesBeforeDeparture:captures,from:start,to:xyz(state),graceRemaining:state.grace,pursuer:xyz(state.hush),input:location==='II'?'forward in the restored route-facing view':'forward, sidestep into visible bypass, forward'}));
  }
});

test('explicitly disabled diagnostic actors stay disabled and ordinary existing actors do not acquire an arrival reset',()=>{
  let state=fresh();state.hush={...state.hush,arrival:null,active:false};
  for(let n=0;n<60*15;n++)state=tick(state);
  assert.equal(state.hush.active,false);assert.deepEqual(state.hush.arrivals,[]);
  const existing=normalizeSourceContinuation({...fresh(),hush:{...fresh().hush,active:true,x:7,z:-3,feet:0,mode:'follow',armed:true,elapsed:45}});
  assert.equal(existing.hush.arrival.stage,'entered');assert.equal(existing.hush.x,7);assert.equal(existing.hush.elapsed,45);
});
