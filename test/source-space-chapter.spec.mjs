import assert from 'node:assert/strict';
import {
  SOURCE_FINAL_OUTCOME,
  SOURCE_PURSUIT_BEAT,
  freshChunkSurfState,
  normalizeChunkSurfState,
  reduceChunkSurf,
} from '../src/game/chunk-surf-state.js';
import { SOURCE_LANDMARK_OFFSETS, createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { SOURCE_BRAIDED_REVIEW_WALK, SOURCE_DIVIDE_GAP_FLOOR } from '../src/data/source-braided-divide.js';

const ORIGIN={x:0,y:-252};
// Derived from the real landmark table rather than re-hardcoded. These were
// absolute world coordinates copied by hand, and the approach extension moved
// every one of them by 120 cells — the sort of drift that turns a reachability
// proof into a test of nothing.
const L=SOURCE_LANDMARK_OFFSETS;
const at=(offset)=>({x:ORIGIN.x+offset.x,y:ORIGIN.y+offset.y});
const POINTS={
  entry:{x:ORIGIN.x,y:ORIGIN.y},
  fork:at(L['fork-room']),
  surfer:at(L['surfer-origin']),
  work:at(L['work-order-loop']),
  recordist:at(L['recordist-loop']),
  body:at(L['body-room']),
  final:at(L['final-page']),
};
const apply=(state,type,details={})=>reduceChunkSurf(state,{type,...details});

function landscapeState({injuries=0}={}){
  let state=freshChunkSurfState({drankCoffee:true,hasRig:true,seed:4417,returnPoint:{x:10,y:20,facing:1}});
  // A fresh, uninjured arrival has the same physical route and contact choice.
  state=apply(state,'SOURCE_ENTERED',{returnPoint:state.returnPoint,injuries});
  state=apply(state,'HALL_ADVANCED',{distance:112});
  state=apply(state,'HAYSTACK_REACHED',{origin:{x:0,y:-224},slot:0});
  state=apply(state,'HAYSTACK_PAGE_FOUND',{landscapeOrigin:ORIGIN});
  state=apply(state,'TRANSFORMATION_COMPLETED');
  return apply(state,'SOURCE_LANDING_DOOR_OPENED');
}

// Walk at HUSH until he is within reach; he comes the rest of the way.
function closeOn(runtime){
  const o=runtime.state().landscapeOrigin,body=runtime.probe().divide;
  let at={x:o.x+body.x/.5,y:o.y+body.z/.5,facing:0};
  for(let n=0;n<900&&!runtime.hushMode().contactAvailable;n++){
    const him=runtime.hushFollowFrame(),dx=him.x-at.x,dy=him.y-at.y,d=Math.hypot(dx,dy);
    if(d>9){
      const to={x:at.x+dx/d*.16,y:at.y+dy/d*.16,facing:0};
      assert.equal(runtime.geometry.canStep(at.x,at.y,to.x,to.y).ok,true,'the way to him is blocked');
      runtime.onStep(at,to);runtime.setPlayerPosition(to);at=to;
    }
    runtime.tick(1/60,{px:at.x,py:at.y,facing:0});
  }
  assert.equal(runtime.hushMode().contactAvailable,true,'walking at him never brought him into reach');
}

function walk(runtime,points){
  const origin=runtime.state().landscapeOrigin;
  const world=(point)=>({x:origin.x+point.x/.5,y:origin.y+point.z/.5,facing:0});
  let from=world(points[0]);
  runtime.setPlayerPosition(from);
  const floors=new Map();
  for(const target of points.slice(1)){
    const end=world(target),start={...from};
    const steps=Math.ceil(Math.hypot(end.x-from.x,end.y-from.y)/.6);
    for(let index=1;index<=steps;index++){
      const to={x:start.x+(end.x-start.x)*index/steps,y:start.y+(end.y-start.y)*index/steps,facing:0};
      const result=runtime.geometry.canStep(from.x,from.y,to.x,to.y);
      assert.equal(result.ok,true,`${target.id}: blocked at ${JSON.stringify(from)} (${result.why})`);
      assert.equal(result.via,undefined,'ordinary Source ground never starts a ride');
      runtime.onStep(from,to);
      runtime.tick(.1,{px:to.x,py:to.y,facing:0});
      from=to;
    }
    // Descending belongs to the vertical clock. Never assign the target floor
    // or ask canStep about distant cells with an unrelated body height.
    for(let tick=0;tick<60&&(tick<10||runtime.state().sourceDivide?.falling);tick++)runtime.tick(.05,{px:from.x,py:from.y,facing:0});
    const feet=runtime.state().sourceDivide?.feet;
    if(target.floor!=null)assert.ok(Math.abs(feet-target.floor)<.025,`${target.id}: body is at ${feet}, expected ${target.floor}`);
    floors.set(target.id,feet);
  }
  return floors;
}

{
  // The opaque turn opens one freely explored field. Walk the actual ramps,
  // both model faces and both underpasses with one durable body height.
  const state=apply(landscapeState(),'SOURCE_LIFT_COMPLETED',{id:'lift-fork',checkpointId:'landing-fork'});
  const runtime=createSourceSpaceRuntime({initialState:state});
  assert.equal('tuneFocused' in runtime,false);
  assert.equal('recordFocused' in runtime,false);
  assert.equal(runtime.sourceObjective().schema,2);
  assert.equal('optionalProgress' in runtime.sourceObjective(),false);
  const floors=walk(runtime,SOURCE_BRAIDED_REVIEW_WALK);
  assert.equal(floors.get('case-over'),9);
  assert.equal(floors.get('case-under'),4.2,'passing below the case cannot acquire its top');
  assert.equal(floors.get('piano-over'),15.2);
  assert.equal(floors.get('piano-under'),4.2,'passing below the piano cannot acquire its lid');
  assert.equal(floors.get('listening-court'),4.2);
  assert.equal(floors.get('grey-door-approach'),15.2);
  assert.equal(runtime.state().sourceContacts.talks,0,'exploring every level does not require a conversation');
  assert.equal(runtime.state().finale.route,null,'walking the architecture never commits an ending');
}

{
  let state=landscapeState();
  state=apply(state,'SOURCE_LIFT_COMPLETED',{id:'lift-fork',checkpointId:'landing-fork'});
  const runtime=createSourceSpaceRuntime({initialState:state});
  assert.equal(runtime.sourceObjective().label,'REACH THE FINAL HORIZON',
    'the post-lift objective names the destination without an equipment verb');
  walk(runtime,[
    {id:'forecourt-west',x:-44,z:-410,floor:4.2},
    {id:'forecourt-east',x:44,z:-410,floor:4.2},
    {id:'forecourt-return',x:-44,z:-410,floor:4.2},
    {id:'lower-street',x:0,z:-410,floor:4.2},
    {id:'lane-stub-end',x:0,z:-429.5,floor:4.2},
  ]);
  // The floor does not run straight on: the stub ends in the drop.
  const o=runtime.state().landscapeOrigin,end={x:o.x,y:o.y-859},beyond={x:o.x,y:o.y-863};
  const off=runtime.geometry.canStep(end.x,end.y,beyond.x,beyond.y);
  assert.equal(off.ok,true,'walking off the end of the stub is refused');
  assert.equal(runtime.geometry.cellAt(beyond.x,beyond.y).floor,SOURCE_DIVIDE_GAP_FLOOR,'the floor runs on past the stub');
  // Past the gap, the lane runs to the court, the rise and the grey doors.
  walk(runtime,[
    {id:'case-under',x:0,z:-440,floor:4.2},
    {id:'court-street',x:0,z:-465,floor:4.2},
    {id:'piano-under',x:0,z:-498,floor:4.2},
    {id:'final-rise-foot',x:0,z:-508,floor:4.2},
    {id:'grey-door-approach',x:0,z:-539,floor:15.2},
    {id:'return-to-lower-ground',x:0,z:-508,floor:4.2},
  ]);
  assert.equal(runtime.state().sourceContacts.talks,0,'the lane route needs no tour or talk count');
  assert.equal(runtime.state().finale.route,null,'the grey-door approach remains reversible');
}

{
  // The landing tableau is safe. The first completed lift is the explicit
  // meeting activation seam; ordinary landscape movement cannot arm combat.
  let state=landscapeState();
  const runtime=createSourceSpaceRuntime({initialState:state});
  assert.equal(runtime.hushMode().landingTableau,true);
  assert.equal(runtime.hushMode().colliding,false);
  state=apply(state,'SOURCE_LIFT_COMPLETED',{id:'lift-fork',checkpointId:'landing-fork'});
  const active=createSourceSpaceRuntime({initialState:state});
  assert.equal(active.state().pursuitBeat,SOURCE_PURSUIT_BEAT.BODY_RUN);
  assert.equal(active.hushMode().colliding,false,'the meeting is not a damaging pursuit');
  assert.equal(active.hushMode().meeting,true,'the first lift makes HUSH present');
  assert.equal(active.hushMode().contactAvailable,false,'the first lift cannot open remote dialogue');
  active.tick(1/60,{px:active.state().landscapeOrigin.x,py:active.state().landscapeOrigin.y-798,facing:0});
  const him=active.hushFollowFrame();
  assert.equal(him.visible,true,'HUSH did not follow into Source proper');
  active.setPlayerPosition({x:him.x,y:him.y+5,facing:0});
  assert.equal(active.hushMode().contactAvailable,true,'walking into his reach offers voluntary contact');
}

{
  let state=landscapeState();
  state=apply(state,'SOURCE_LIFT_COMPLETED',{id:'lift-fork',checkpointId:'landing-fork'});
  state=apply(state,'LANDMARK_VISITED',{id:'body-room'});
  state={...state,sourceDivide:{version:1,feet:15.2,fallVelocity:0,falling:false}};
  const runtime=createSourceSpaceRuntime({initialState:state});
  assert.equal(runtime.sourceObjective().label,'REACH THE FINAL HORIZON');
  const finalX=(POINTS.final.x-ORIGIN.x)*.5,finalZ=(POINTS.final.y-ORIGIN.y)*.5;
  walk(runtime,[{id:'upper-final-approach',x:finalX-10,z:finalZ,floor:15.2},{id:'final-page',x:finalX,z:finalZ,floor:15.2}]);
  assert.equal(runtime.state().phase,'final','the final page is tool-independent');
  runtime.setPlayerPosition(POINTS.final);
  assert.equal(runtime.finalEncounterRequest().bodyReturnAssist,true,
    'visiting Body Return still earns its optional combat assist');
}

{
  let state=landscapeState();
  state=apply(state,'SOURCE_LIFT_COMPLETED',{id:'lift-fork',checkpointId:'landing-fork'});
  for(const id of ['fork-room','recordist-loop','surfer-origin','work-order-loop','body-room']){
    state=apply(state,'LANDMARK_VISITED',{id});
  }
  // Battle is available without a talk count; only warned confirmation commits it.
  state=apply(state,'PURSUIT_STARTED',{id:SOURCE_PURSUIT_BEAT.FINAL_RUN});
  state={...state,sourceDivide:{version:1,feet:15.2,fallVelocity:0,falling:false}};
  const runtime=createSourceSpaceRuntime({initialState:state});
  const finalX=(POINTS.final.x-ORIGIN.x)*.5,finalZ=(POINTS.final.y-ORIGIN.y)*.5;
  walk(runtime,[{id:'upper-final-approach',x:finalX-10,z:finalZ,floor:15.2},{id:'final-page',x:finalX,z:finalZ,floor:15.2}]);
  assert.equal(runtime.state().phase,'final');
  assert.equal(runtime.hushMode().colliding,false,'the final endpoint suspends HUSH collision');
  assert.deepEqual(runtime.state().sourceContacts.insights,[],'no contact answers were collected en route');
  assert.equal(runtime.finalEncounterRequest().adapter,null,'the optional battle never begins merely by reaching the horizon');
  assert.equal(runtime.finalEncounterRequest().normalExitAvailable,true);
  assert.equal(runtime.requestBossBattle().available,true);
  assert.equal(runtime.finalEncounterRequest().adapter,null,'the warning does not silently commit Contact');
  // The court remains an ordinary place to return to after reaching the upper
  // field. Descend the final rise instead of teleporting an elevated body down.
  walk(runtime,[
    {id:'final-page',x:(POINTS.final.x-ORIGIN.x)*.5,z:(POINTS.final.y-ORIGIN.y)*.5,floor:15.2},
    {id:'upper-bank-return',x:40,z:-537,floor:15.2},
    {id:'final-rise-return',x:0,z:-537,floor:15.2},
    {id:'lower-ground-return',x:0,z:-508,floor:4.2},
    {id:'court-street-return',x:0,z:-465,floor:4.2},
    {id:'service-court-return',x:-12,z:-465,floor:4.2},
  ]);
  // He followed you back down. Contact is walking at him until he meets you.
  closeOn(runtime);
  assert.ok(runtime.beginHushContact());
  assert.equal(runtime.resolveHushContactChoice('contact.warning').combat,false);
  assert.equal(runtime.resolveHushContactChoice('contact.confirm').combat,true);
  assert.equal(runtime.finalEncounterRequest().adapter,'combat-v1','accepting NO RETURN opens the shared deterministic combat contract');
  const battles=new Set();
  for(let cycle=0;cycle<3;cycle++){
    if(cycle){
      closeOn(runtime);
      assert.ok(runtime.beginHushContact(),'each new fight requires a separate voluntary return conversation');
      assert.equal(runtime.resolveHushContactChoice('contact.confirm').handled,false,'the earlier fight cannot supply consent');
      assert.equal(runtime.resolveHushContactChoice('contact.warning').combat,false);
      assert.equal(runtime.resolveHushContactChoice('contact.confirm').combat,true);
    }
    const request=runtime.finalEncounterRequest();
    battles.add(request.battleAttemptId);
    const result=runtime.resolveFinalEncounter({battleAttemptId:request.battleAttemptId,outcome:SOURCE_FINAL_OUTCOME.RESCUE,won:true,channels:{rescue:4,contain:1,submit:0},turns:9,compatibility:{fightVersion:'signal-combat'}});
    assert.equal(result.handled,true);
    assert.equal(runtime.state().finalEncounter.victories,cycle+1);
    assert.equal(runtime.state().completed,cycle===2,'only three separately won battles finish Contact');
    if(cycle<2){
      assert.equal(runtime.finalEncounterRequest(),null,'the next fight does not start automatically');
      assert.equal(runtime.state().finale.route,null,'the field can still be left between fights');
    }
  }
  assert.equal(battles.size,3,'the proof used three independent battle identities');
  assert.equal(runtime.state().completed,true);
  assert.equal(runtime.state().finalEncounter.compatibility.fightVersion,'signal-combat');
  assert.deepEqual(runtime.state().finalEncounter.channels,{rescue:4,contain:1,submit:0});
  assert.equal(runtime.state().finalEncounter.rescuedRecordist,true,'the qualifying rig enables rescue after three voluntary victories without a contact quiz');
  assert.equal(runtime.sourceLook().roomMemoryActive,true,'the resolved field remains in the building\'s recording medium');
  assert.equal(runtime.sourceLook().sunrise,0,'encounter resolution does not recolour proper with a global sunrise');
  assert.equal(runtime.sourceLook().paper,0,'encounter resolution does not replace the surviving rooms with white paper');
}

{
  const runtime=createSourceSpaceRuntime({initialState:landscapeState()});
  runtime.tick(.1,{...POINTS.entry,facing:0});
  const first=runtime.sourceScene({px:0,py:-252,time:0});
  const second=runtime.sourceScene({px:4,py:-250,time:1});
  assert.equal(first.key,second.key,'movement inside a spatial chunk reuses one static Source scene');
  assert.equal(first.staticInstances,second.staticInstances,'static source architecture is cached by chunk and state key');
  assert.notEqual(first.dynamicInstances,second.dynamicInstances,'interaction and HUSH layers remain independently dynamic');
  runtime.tick(6.1,{...POINTS.entry,facing:0});
  runtime.tick(6.1,{...POINTS.entry,facing:0});
  assert.equal(runtime.sourceObjective().alignmentPulse,true,'stalled navigation exposes a restrained alignment pulse without dialogue spam');
}

{
  let armed=landscapeState();
  for(const id of ['fork-room','recordist-loop'])armed=apply(armed,'LANDMARK_VISITED',{id});
  armed=apply(armed,'CHECKPOINT_SET',{id:'recordist-loop'});
  armed=apply(armed,'PURSUIT_STARTED',{id:SOURCE_PURSUIT_BEAT.BODY_RUN});
  let final=armed;
  for(const id of ['surfer-origin','work-order-loop','body-room'])final=apply(final,'LANDMARK_VISITED',{id});
  final=apply(final,'PURSUIT_CLEARED',{id:SOURCE_PURSUIT_BEAT.BODY_RUN});
  final=apply(final,'PURSUIT_STARTED',{id:SOURCE_PURSUIT_BEAT.FINAL_RUN});
  const ready=apply(final,'FINAL_REACHED');
  const resolved=apply(ready,'FINAL_ENCOUNTER_RESOLVED',{result:{outcome:SOURCE_FINAL_OUTCOME.RESCUE,won:true,compatibility:{fightVersion:'future'}}});
  for(const snapshot of [landscapeState(),armed,final,ready,resolved,apply(resolved,'SOURCE_COMPLETED')]){
    const reloaded=normalizeChunkSurfState(JSON.parse(JSON.stringify(snapshot)));
    assert.equal(reloaded.phase,snapshot.phase);
    assert.equal(reloaded.checkpoint.id,snapshot.checkpoint.id);
    assert.equal(reloaded.pursuitBeat,snapshot.pursuitBeat);
    assert.deepEqual(reloaded.optionalTraces,snapshot.optionalTraces);
    assert.equal(reloaded.finalEncounter.status,snapshot.finalEncounter.status);
  }
}

console.log('source-space finished chapter specs passed');
