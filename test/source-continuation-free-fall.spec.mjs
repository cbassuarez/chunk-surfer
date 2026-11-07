import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_CONTINUATION as C,continuationSupportAt} from '../src/data/source-continuation.js';
import {freshSourceContinuation,normalizeSourceContinuation,stepSourceContinuation,sourceContinuationFrame} from '../src/game/source-continuation.js';
import {continuationBallisticStep,continuationFreeBody} from '../src/game/source-continuation-physics.js';

function at(x,z,feet,phase='wrong-return',level=0,chartId=0) {
  const fresh=freshSourceContinuation({runId:'free-fall'});
  return normalizeSourceContinuation({...fresh,status:'active',x,z,feet,phase,level,chartId,lastSafe:{x,z,feet,phase,level,chartId,yaw:0,pitch:0},hush:{...fresh.hush,active:false}});
}
function tick(state,input={},events=[]) {const result=stepSourceContinuation(state,{dt:1/120,...input});events.push(...result.events);return result.state;}
function until(state,predicate,events=[],maximum=2400) {for(let k=0;k<maximum&&!predicate(state);k++)state=tick(state,{},events);assert.ok(predicate(state),'bounded physical outcome');return state;}

test('Space jumps anywhere grounded, preserves momentum and cannot repeat or double jump',()=>{
  let state=at(8,-3,0);const events=[];
  state=tick(state,{dt:0,jump:true,side:1},events);assert.equal(state.fall.trigger,'jump');assert.equal(state.fall.vx,C.walkSpeed);
  let highest=0;
  for(let k=0;k<150&&state.fall;k++){state=tick(state,{jump:true,side:-1,forward:1},events);highest=Math.max(highest,state.feet);}
  assert.ok(highest>.99&&highest<1.03);assert.equal(state.fall,null);assert.ok(state.x>9.2,'held opposite input cannot steer ballistic momentum');
  state=tick(state,{jump:true},events);assert.equal(state.fall,null,'holding Space cannot jump on landing');
  assert.equal(events.filter(e=>e.type==='drop').length,1);
  state=tick(state,{jump:false});state=tick(state,{dt:0,jump:true},events);assert.equal(state.fall.trigger,'jump');
  assert.equal(state.knowledge.some(k=>k.startsWith('catch-')),false,'II landings do not award Catch knowledge');
});

test('ordinary II edges permit walking off without a marker or E and lower II floors retain first person',()=>{
  let state=at(-8,-27.03,8.4),events=[];
  for(let k=0;k<20&&!state.fall;k++)state=tick(state,{forward:1,look:{yaw:Math.PI}},events);
  assert.equal(state.fall?.trigger,'step-off');assert.ok(state.fall.vz>1.19);
  state=until(state,s=>!s.fall,events);
  assert.equal(state.recovery,null);assert.equal(state.feet,4.2);assert.equal(state.phase,'wrong-return');assert.equal(sourceContinuationFrame(state).camera.mode,'first-person');
  assert.equal(events.find(e=>e.type==='land').trigger,'step-off');
});

test('the half-metre split is an authorized jump shortcut with no knowledge lock',()=>{
  let state=at(6,-12,8.4),events=[];
  state=tick(state,{dt:0,jump:true,forward:1,look:{yaw:-Math.PI/2}},events);
  state=until(state,s=>!s.fall,events);
  assert.equal(state.recovery,null);assert.ok(state.x<3.2);assert.equal(state.feet,8.4);assert.equal(state.phase,'wrong-return');
  assert.equal(state.knowledge.includes('false-return-porch'),false);
});

test('unmarked Catch edges can skip a receiving stage and use the actual lower landing',()=>{
  let state=at(C.catch.center.x+4.23,C.catch.center.z,2.4,'catch',1),events=[];
  for(let k=0;k<100&&!state.fall;k++)state=tick(state,{side:-.2},events);
  assert.equal(state.fall?.trigger,'step-off');assert.ok(Math.abs(state.fall.vx+.28)<1e-12);
  state=until(state,s=>!s.fall,events);
  assert.equal(state.recovery,null);assert.equal(state.phase,'catch');assert.equal(state.level,3);assert.equal(state.feet,-12.6);
  assert.match(events.find(e=>e.type==='land').surface,/catch-3/);
});

test('a real receiving-floor landing chooses Catch from the surface without a door flag',()=>{
  // Bounded receiving-bridge fixture isolates physical region recognition;
  // chart/portal entry itself is covered by the full normal-input journey.
  let state=at(C.catch.center.x+13.1,C.catch.center.z,8.4),events=[];
  state=tick(state,{dt:0,jump:true,forward:1,look:{yaw:-Math.PI/2}},events);
  state=until(state,s=>!s.fall,events);
  assert.equal(state.phase,'catch');assert.equal(state.level,0);assert.ok(events.some(e=>e.type==='phase'&&e.via==='landing'));
  assert.equal(state.counterweight.active,false,'a level standing jump does not start an unseen descent deadline');
});

test('actual full-body airborne crossings dispatch return, onward phase and final receipt once',()=>{
  let state=at(0,2.4,0),events=[];state.doorOpen['wrong-entry-return']=true;
  state=tick(state,{dt:0,jump:true,forward:1,run:true,look:{yaw:Math.PI}},events);
  state=until(state,s=>s.status==='returned',events);
  assert.ok(state.fall);assert.equal(events.filter(e=>e.type==='return').length,1);assert.equal(events.find(e=>e.type==='return').airborne,true);
  const gate=C.wrongReturn.threshold;
  state=at(gate.x+.04,gate.z,gate.y,'wrong-return',0,4);events=[];state.doorOpen[gate.doorId]=true;
  state=tick(state,{dt:0,jump:true,forward:1,run:true,look:{yaw:-Math.PI/2}},events);
  state=until(state,s=>s.phase==='catch',events);assert.ok(events.some(e=>e.type==='fold'),'the threshold crossing dispatches while airborne');
  state=at(C.catch.finalDoor.x-.04,C.catch.finalDoor.z,-12.6,'catch',3);events=[];state.doorOpen['catch-final']=true;
  state=tick(state,{dt:0,jump:true,side:1,run:true},events);state=until(state,s=>s.completed,events);
  assert.equal(events.filter(e=>e.type==='complete').length,1);assert.equal(events.find(e=>e.type==='complete').airborne,true);
  assert.equal(stepSourceContinuation(state,{dt:.25,jump:true,side:1}).events.length,0);
});

test('swept bodies hit real ceilings, solids and closed leaves without tunneling',()=>{
  let state=at(-12,-13.98,5.4),highest=state.feet;
  state=tick(state,{dt:0,jump:true});
  for(let frame=0;frame<2400&&state.fall;frame++){state=tick(state);highest=Math.max(highest,state.feet);}
  assert.equal(state.fall,null,'the ceiling-arrested jump settles within20 simulated seconds');
  assert.ok(highest<=8.4-.35-C.bodyHeight+1e-5,'the upper cross underside stops the head');
  state=at(-17.3,-12,8.4);state=tick(state,{dt:0,jump:true,forward:1,look:{yaw:-Math.PI/2}});
  state=until(state,s=>!s.fall);assert.ok(state.x>=-18+.12+C.bodyRadius-1e-4,'a closed leaf cannot be jumped through');
  const fall={x:C.catch.center.x+1.5,z:C.catch.center.z,feet:0,vx:-3.2,vz:0,vy:0,fromLevel:2,fromPhase:'catch',trigger:'step-off',lastSupport:{feet:0},elapsed:0,unsupported:true};
  continuationBallisticStep(fall,.25,{});continuationBallisticStep(fall,.25,{});
  assert.ok(fall.x>=C.catch.center.x+.42+C.bodyRadius-1e-4,'the thin spindle arrests horizontal momentum');assert.ok(continuationFreeBody(fall,{}));
});

test('Source-II void motion uses its fixed spatial loop and a real same-floor landing without blackout',()=>{
  let state=at(0,-22.95,8.4),events=[];
  for(let k=0;k<70&&!state.fall;k++)state=tick(state,{forward:1,run:true},events);
  state=until(state,s=>!!s.lastSpaceWrap,events);
  assert.ok(state.fall);assert.equal(state.recovery,null);assert.ok(state.fall.vy<0);
  assert.equal(sourceContinuationFrame(state).blackoutAlpha,0);
  state=until(state,s=>!s.fall,events);
  assert.equal(state.feet,8.4);assert.equal(state.grace,0);assert.ok(continuationSupportAt(state.x,state.z,state));
  assert.equal(events.some(e=>e.type==='capture'||e.type==='recovered'),false);
  assert.equal(events.some(e=>e.reason==='unsupported-save-repair'),false);
});

test('free jump latches, arbitrary fall metadata and motion survive pause and reload',()=>{
  let state=at(25.8,-31,8.4);state=tick(state,{dt:0,jump:true,side:1});
  for(let k=0;k<100;k++)state=tick(state);
  // Resume a finite airborne save beyond the expanded atlas extents. This is
  // serializer coverage, separate from the ordinary route traversal proofs.
  state=normalizeSourceContinuation({...state,x:C.bounds.maxX+2,fall:{...state.fall,x:C.bounds.maxX+2}});
  assert.ok(state.fall);assert.ok(state.x>C.bounds.maxX);
  const saved=JSON.parse(JSON.stringify(state));assert.deepEqual(normalizeSourceContinuation(saved),saved);
  for(const gate of [{paused:true},{renderReady:false}])assert.deepEqual(stepSourceContinuation(saved,{...gate,dt:.25,jump:true}).state,saved);
  assert.deepEqual(tick(saved),tick(state));assert.equal(saved.fall.fromPhase,'wrong-return');assert.equal(saved.fall.lastSupport.feet,8.4);
});

test('Hush repeats arbitrary jump momentum and obeys the same Source-II spatial loop',()=>{
  let state=at(0,-22.95,8.4),events=[];
  state.hush={...state.hush,active:true,x:0,z:-21,feet:8.4,phase:'wrong-return',mode:'follow',elapsed:10,armed:true,trail:[{kind:'walk',x:0,z:-22.95,feet:8.4,phase:'wrong-return',level:0}],lastRecorded:{x:0,z:-22.95,feet:8.4,phase:'wrong-return',level:0}};
  for(let k=0;k<30&&!state.fall;k++)state=tick(state,{forward:1,run:true},events);
  const edge=state.hush.trail.find(p=>p.kind==='drop');assert.ok(edge);assert.equal(edge.trigger,'step-off');assert.equal(edge.vz,-2.6);
  for(let k=0;k<2200&&!events.some(e=>e.type==='hush-space-wrap');k++)state=tick(state,{},events);
  assert.ok(events.some(e=>e.type==='hush-space-wrap'));
  assert.equal(events.some(e=>e.type==='hush-recovery'&&e.reason==='void-fall'),false);
  assert.equal(state.hush.recovery,null);
  for(let k=0;k<120&&state.hush.fall;k++)state=tick(state,{},events);
  assert.ok(continuationSupportAt(state.hush.x,state.hush.z,{feet:state.hush.feet,chartId:state.hush.chartId}));
});

test('Hush repeats a Space jump with its actual initial upward velocity and landing',()=>{
  let state=at(8,-3,0),events=[];
  state.hush={...state.hush,active:true,x:6,z:-3,feet:0,mode:'follow',elapsed:10,armed:true,trail:[{kind:'walk',x:8,z:-3,feet:0,level:0}],lastRecorded:{x:8,z:-3,feet:0,level:0}};
  state=tick(state,{dt:0,jump:true,side:1},events);
  const edge=state.hush.trail.find(p=>p.kind==='drop');assert.equal(edge.trigger,'jump');assert.equal(edge.vy,C.jumpSpeed);assert.equal(edge.vx,C.walkSpeed);
  let highest=0;
  for(let n=0;n<400&&!events.some(e=>e.type==='hush-land');n++){state=tick(state,{},events);highest=Math.max(highest,state.hush.feet);}
  assert.ok(highest>.99&&highest<1.03);assert.ok(events.some(e=>e.type==='hush-drop'&&e.trigger==='jump'));assert.ok(events.some(e=>e.type==='hush-land'&&e.trigger==='jump'));
  assert.ok(Math.abs(state.hush.x-state.x)<.04);assert.equal(state.hush.feet,0);
});

test('a missed upper-west edge follows the fixed same-floor gluing without unlocking an unvisited refuge',()=>{
  let state=at(-16,-30,8.4),events=[];
  for(let k=0;k<800&&!state.fall;k++)state=tick(state,{forward:1,look:{yaw:Math.PI}},events);
  const departure=structuredClone(state.fall.lastSupport);
  assert.ok(departure.z<=-22);
  state=until(state,s=>!!s.lastSpaceWrap,events);
  assert.equal(state.recovery,null);assert.ok(state.fall.vz>0);
  state=until(state,s=>!s.fall,events);
  assert.equal(state.feet,departure.feet);
  assert.notDeepEqual([state.x,state.z],[departure.x,departure.z],'void law snaps to the remembered departure');
  assert.equal(state.phase,'wrong-return');assert.equal(state.knowledge.includes('false-return-porch'),false);assert.equal(state.doorOpen['wrong-onward'],undefined);
  for(let k=0;k<24;k++)state=tick(state,{forward:1,look:{yaw:0}},events);
  assert.equal(state.fall,null,'a fresh inward input makes a usable retry');assert.ok(state.z<departure.z-.5);
});

test('Catch voids retry the exact earned floor departure instead of granting a remote refuge or final approach',()=>{
  for(const [level,angle,radius]of [[1,.45,12.47],[3,2.6,9.77]]) {
    const x=C.catch.center.x+Math.cos(angle)*radius,z=C.catch.center.z+Math.sin(angle)*radius,feet=level===1?2.4:-12.6;
    let state=at(x,z,feet,'catch',level),events=[];
    for(let k=0;k<80&&!state.fall;k++)state=tick(state,{side:Math.cos(angle),forward:-Math.sin(angle)},events);
    assert.ok(state.fall);const departure=structuredClone(state.fall.lastSupport);
    state=until(state,s=>!!s.recovery,events);
    assert.deepEqual([state.recovery.target.x,state.recovery.target.z,state.recovery.target.feet],[departure.x,departure.z,departure.feet]);
    state=until(state,s=>!s.recovery,events);
    assert.equal(state.phase,'catch');assert.equal(state.level,level);assert.equal(state.completed,false);assert.equal(state.doorOpen['catch-final'],undefined);
    assert.deepEqual([state.x,state.z,state.feet],[departure.x,departure.z,departure.feet]);
    for(let k=0;k<24;k++)state=tick(state,{side:-Math.cos(angle),forward:Math.sin(angle)},events);
    assert.equal(state.fall,null);assert.ok(continuationSupportAt(state.x,state.z,state));
  }
});
