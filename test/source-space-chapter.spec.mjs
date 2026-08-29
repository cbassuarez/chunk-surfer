import assert from 'node:assert/strict';
import {
  SOURCE_FINAL_OUTCOME,
  SOURCE_PURSUIT_BEAT,
  freshChunkSurfState,
  normalizeChunkSurfState,
  reduceChunkSurf,
} from '../src/game/chunk-surf-state.js';
import { SOURCE_LANDMARK_OFFSETS, createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';

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

function landscapeState({injuries=1}={}){
  let state=freshChunkSurfState({drankCoffee:true,hasRig:true,seed:4417,returnPoint:{x:10,y:20,facing:1}});
  // The night took him once before he came in here. That is the first gate on
  // the fault now — see sourceBossAvailable().
  state=apply(state,'SOURCE_ENTERED',{returnPoint:state.returnPoint,injuries});
  state=apply(state,'HALL_ADVANCED',{distance:112});
  state=apply(state,'HAYSTACK_REACHED',{origin:{x:0,y:-224},slot:0});
  state=apply(state,'HAYSTACK_PAGE_FOUND',{landscapeOrigin:ORIGIN});
  state=apply(state,'TRANSFORMATION_COMPLETED');
  return apply(state,'SOURCE_LANDING_DOOR_OPENED');
}

function reachable(runtime,start,goal,maxVisited=180000){
  const key=(x,y)=>`${x},${y}`;
  const queue=[[Math.round(start.x),Math.round(start.y)]];
  const visited=new Set([key(queue[0][0],queue[0][1])]);
  let index=0;
  while(index<queue.length&&index<maxVisited){
    const [x,y]=queue[index++];
    if(Math.hypot(x-goal.x,y-goal.y)<=2)return true;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,ny=y+dy,k=key(nx,ny);
      if(visited.has(k)||!runtime.geometry.canStep(x,y,nx,ny).ok)continue;
      visited.add(k);queue.push([nx,ny]);
    }
  }
  return false;
}

{
  // Exploration-first: the whole field is walkable the moment it opens — no fork
  // gate, no tune-to-unlock. Every landmark and the horizon are reachable from a
  // fresh, untuned state, so nothing action-gates the walk.
  const state=landscapeState();
  const runtime=createSourceSpaceRuntime({initialState:state});
  assert.equal('tuneFocused' in runtime,false);
  assert.equal('recordFocused' in runtime,false);
  assert.equal(runtime.sourceObjective().schema,2);
  assert.equal('optionalProgress' in runtime.sourceObjective(),false);
  assert.equal(reachable(runtime,POINTS.entry,POINTS.fork),true,'the entry spine reaches the Fork Gate');
  assert.notEqual(runtime.geometry.cellAt(0,-330),null,'the field is open for exploration from the start — no action walls the downstream source');
  assert.equal(reachable(runtime,POINTS.fork,POINTS.surfer),true,'the Surfer Origin loop is reachable without tuning');
  assert.equal(reachable(runtime,POINTS.fork,POINTS.work),true,'the Work Order loop is reachable without tuning');
  assert.equal(reachable(runtime,POINTS.fork,POINTS.recordist),true,'the central spine is reachable without tuning');
  assert.equal(reachable(runtime,POINTS.recordist,POINTS.body),true,'Body Return is reachable without tuning');
  assert.equal(reachable(runtime,POINTS.body,POINTS.final),true,'the final causeway reaches the horizon without tuning');
  // THE SPINE IS TIERED NOW. "Every step is within the movement limit" was the
  // old contract and it is exactly what made the field a lawn; the contract now
  // is that every cliff on the spine is crossable — the runtime's own canStep
  // answers yes, via a ladder or a chute — so the player is constrained but
  // never stuck. (The reachability assertions above already prove the whole
    // route end to end through that same canStep.)
  for(let y=POINTS.entry.y;y>=POINTS.body.y;y-=1){
    const here=runtime.geometry.cellAt(0,y),next=runtime.geometry.cellAt(0,y-1);
    if(!here||!next)continue;
    if(Math.abs(here.floor-next.floor)<=.45)continue;
    const step=runtime.geometry.canStep(0,y,0,y-1);
    assert.ok(step.ok,`spine cliff at ${y} has no staircase on it`);
    // Nothing in the field is ridden any more. The lifts are gone and every
    // connector is an `ascendable` staircase, so a cliff is crossed by ordinary
    // walking or it is not crossed at all — `via` must stay absent.
    assert.equal(step.via,undefined,`spine cliff at ${y} committed a ride instead of being walked`);
  }
}

{
  let state=landscapeState();
  state=apply(state,'SOURCE_LIFT_COMPLETED',{id:'lift-fork',checkpointId:'landing-fork'});
  const runtime=createSourceSpaceRuntime({initialState:state});
  assert.equal(runtime.sourceObjective().label,'REACH THE FINAL HORIZON',
    'the post-lift objective names the destination without an equipment verb');
  const diagonal={x:-22,y:-56};
  const tangent={x:-44,y:-28};
  const length=Math.hypot(tangent.x,tangent.y);
  const normal={x:-tangent.y/length,y:tangent.x/length};
  const width=Array.from({length:17},(_,index)=>index-8)
    .filter((offset)=>runtime.geometry.cellAt(ORIGIN.x+diagonal.x+normal.x*offset,ORIGIN.y+diagonal.y+normal.y*offset)).length;
  assert.ok(width>=8,'optional causeways remain at least eight runtime cells wide');
  const criticalWidth=Array.from({length:19},(_,index)=>index-9)
    .filter((offset)=>runtime.geometry.cellAt(offset,ORIGIN.y-24)).length;
  assert.ok(criticalWidth>=10,'the critical spine remains at least ten runtime cells wide');
}

{
  // The landing tableau is safe. The first completed lift is the explicit
  // pursuit activation seam; ordinary landscape movement cannot arm it early.
  let state=landscapeState();
  const runtime=createSourceSpaceRuntime({initialState:state});
  assert.equal(runtime.hushMode().landingTableau,true);
  assert.equal(runtime.hushMode().colliding,false);
  state=apply(state,'SOURCE_LIFT_COMPLETED',{id:'lift-fork',checkpointId:'landing-fork'});
  const active=createSourceSpaceRuntime({initialState:state});
  assert.equal(active.state().pursuitBeat,SOURCE_PURSUIT_BEAT.BODY_RUN);
  assert.equal(active.hushMode().colliding,true,'the first lift activates ordinary pursuit');
}

{
  let state=landscapeState();
  state=apply(state,'SOURCE_LIFT_COMPLETED',{id:'lift-fork',checkpointId:'landing-fork'});
  state=apply(state,'LANDMARK_VISITED',{id:'body-room'});
  const runtime=createSourceSpaceRuntime({initialState:state});
  assert.equal(runtime.sourceObjective().label,'REACH THE FINAL HORIZON');
  // Step onto the final page wherever the field currently puts it.
  runtime.onStep({x:POINTS.final.x-10,y:POINTS.final.y+12},{...POINTS.final,facing:0});
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
  state=apply(state,'SOURCE_CONTACT_RESOLVED',{checkpointId:'landing-return',contact:{
    captures:3,
    insights:['music-human-name','surfer-vessel','borrowed-body-return'],
    seenBeats:['music-1','vessel-1','body-1'],
    lastChoiceId:'body-1.return',
  }});
  state=apply(state,'PURSUIT_STARTED',{id:SOURCE_PURSUIT_BEAT.FINAL_RUN});
  const runtime=createSourceSpaceRuntime({initialState:state});
  // Step onto the final page wherever the field currently puts it.
  runtime.onStep({x:POINTS.final.x-10,y:POINTS.final.y+12},{...POINTS.final,facing:0});
  assert.equal(runtime.state().phase,'final');
  assert.equal(runtime.hushMode().colliding,false,'the final endpoint suspends HUSH collision');
  const attempts=runtime.state().attempts;
  runtime.handleHushContact();
  assert.equal(runtime.state().attempts,attempts,'protected final interactions cannot reset the player');
  assert.equal(runtime.finalEncounterRequest().adapter,null,'the optional battle never begins merely by reaching the horizon');
  assert.equal(runtime.finalEncounterRequest().normalExitAvailable,true);
  assert.equal(runtime.requestBossBattle().available,true);
  assert.equal(runtime.finalEncounterRequest().adapter,null,'the warning does not silently commit Contact');
  assert.equal(runtime.commitContact().handled,true);
  assert.equal(runtime.finalEncounterRequest().adapter,'combat-v1','accepting NO RETURN opens the shared deterministic combat contract');
  const result=runtime.resolveFinalEncounter({outcome:SOURCE_FINAL_OUTCOME.RESCUE,won:true,channels:{rescue:4,contain:1,submit:0},turns:9,compatibility:{fightVersion:'signal-combat'}});
  assert.equal(result.handled,true);
  assert.equal(runtime.state().completed,true);
  assert.equal(runtime.state().finalEncounter.compatibility.fightVersion,'signal-combat');
  assert.deepEqual(runtime.state().finalEncounter.channels,{rescue:4,contain:1,submit:0});
  assert.equal(runtime.state().finalEncounter.rescuedRecordist,true,'rig and three acquired insights unlock the Source-side rescue condition');
  assert.equal(runtime.sourceLook().sunrise,1,'encounter resolution completes the white-paper sunrise');
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
