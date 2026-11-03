import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import * as scenes from '../src/game/scenes.js';
import {SOURCE_CONTINUATION as C,continuationRadialPoint,continuationCatchFloor,continuationSupportAt} from '../src/data/source-continuation.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {createSourceContinuationScene} from '../src/game/source-continuation-scene.js';
import {installSourceRest} from '../src/game/source-rest-runtime.js';
import {SOURCE_REST_SEATS,sourceRestSeatForState,sourceRestFocus} from '../src/game/source-rest-seat.js';

const renderer=()=>({initialize:async()=>true,ready:()=>true,render:()=>true,dispose(){}});
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);

test('the Source III resting place is unavailable on entry and only belongs to its actual counterarc level',()=>{
  const seat=SOURCE_REST_SEATS[1],base={...freshSourceContinuation(),status:'active',phase:'catch'};
  assert.equal(seat.level,2);assert.equal(seat.feet,continuationCatchFloor(2));
  for(const at of[{x:-159.1,z:-92},{...seat.approach}]){
    const entry={...base,...at,level:0,feet:continuationCatchFloor(0)};
    assert.equal(sourceRestSeatForState(entry),null);assert.equal(sourceRestFocus(entry),null);
  }
  assert.equal(sourceRestFocus({...base,...seat,...seat.approach})?.id,seat.id);
});

test('real first-person walking and E releases reach the listening island and then the door island',async()=>{
  scenes.clear();const events=[],traceEvents=[],poses=[],seat=SOURCE_REST_SEATS[1];let completed=0,returned=0;
  // No immunity or position corrections are applied after this actual Catch
  // entry. The ordinary HUSH/counterweight clocks continue throughout. Their
  // capture/balance coverage remains in the dedicated threat suites.
  const checkpoint={...freshSourceContinuation({runId:'rest-level-route'}),status:'active',phase:'catch',chartId:0,level:0,
    x:-159.1,z:-92,feet:8.4,yaw:-Math.PI/2,pitch:0};
  const device=renderer(),scene=createSourceContinuationScene({checkpoint,renderer:device,onAcceptedTravel(){},
    onComplete(){completed++;return true;},onReturn(){returned++;return true;},
    onTrace:value=>{if(value.type==='event'){events.push(value.event);traceEvents.push(value);}}});
  installSourceRest(scene,device,{paintPrompt(){},conversationOptions:{
    getMusicState:()=>({active:true,playing:true,currentTime:200,duration:843.15712,playedSeconds:200,audibleWallSeconds:200,playbackRate:1}),
  }});
  scenes.push(scene);await scene.initialize();
  const advance=dt=>{
    scene.update(dt);const s=scene.serialize();poses.push({elapsed:s.elapsed,x:s.x,z:s.z,feet:s.feet,level:s.level,fall:!!s.fall,
      grace:s.grace,hush:{active:s.hush.active,x:s.hush.x,z:s.hush.z,feet:s.hush.feet,mode:s.hush.mode},
      counterweight:{active:s.counterweight.active,x:s.counterweight.x,z:s.counterweight.z,y:s.counterweight.y,mode:s.counterweight.mode}});
    assert.equal(s.recovery,null,'the route cannot rely on a capture or position repair');
    assert.equal(s.phase,'catch');assert.equal(s.chartId,0);return s;
  };
  function walk(target,{complete=false}={}){
    for(let i=0;i<1200;i++){
      const s=scene.serialize(),dx=target.x-s.x,dz=target.z-s.z,d=Math.hypot(dx,dz);
      if(s.completed){assert.equal(complete,true,'only the final threshold can end a walk early');scene.keyup({key:'w'});return;}
      if(d<.04){scene.keyup({key:'w'});assert.equal(s.fall,null,'a walking waypoint needs real support');return;}
      assert.equal(s.fall,null,'walking never skips a release');
      scene.setLook({yaw:Math.atan2(dx,-dz),pitch:-.12});scene.key({key:'w'});advance(Math.min(.04,d/C.walkSpeed));
    }
    assert.fail(`blocked walking to ${target.x},${target.z} from ${scene.serialize().x},${scene.serialize().z}`);
  }
  function arc(radius,from,to){
    const count=Math.ceil(Math.abs(to-from)/.08);
    for(let i=1;i<=count;i++)walk(continuationRadialPoint(radius,from+(to-from)*i/count));
  }
  function release(nextLevel){
    scene.keyup({key:'w'});assert.equal(scene.view().focus?.type,'drop');
    const count=events.filter(e=>e.type==='drop').length;scene.key({key:'e'});
    assert.ok(scene.serialize().fall,'E begins the real physical release');
    for(let i=0;i<900&&scene.serialize().fall;i++)advance(1/60);
    const landed=scene.serialize();assert.equal(landed.fall,null);assert.equal(landed.level,nextLevel);near(landed.feet,continuationCatchFloor(nextLevel));
    assert.ok(continuationSupportAt(landed.x,landed.z,landed));
    assert.equal(events.filter(e=>e.type==='drop').length,count+1);
    assert.ok(events.some(e=>e.type==='land'&&e.level===nextLevel));
  }
  try{
    assert.equal(scene.allowsLook,true);assert.equal(scene.sourceRest.focus(),null);
    walk({x:-165.54,z:-92});release(1);
    walk(continuationRadialPoint(7.6,0));arc(7.6,0,Math.PI-.06);
    walk(continuationRadialPoint(4.7,Math.PI-.04));release(2);
    walk(continuationRadialPoint(7.5,Math.PI+.04));arc(7.5,Math.PI+.04,4.13);
    walk(continuationRadialPoint(9.7,3.8));
    walk({x:-180,z:-98});walk({x:-189,z:-98});walk({x:-189,z:-102});walk({x:-192.3,z:-102});walk(seat.approach);
    assert.equal(scene.sourceRest.focus()?.id,seat.id,'the actual island approach discovers the seat');
    const before=scene.serialize();scenes.key({key:'e'});
    assert.equal(scene.sourceRest.view().mode,'sitting');assert.equal(scenes.top()?.id,'source-rest:catch');
    for(let i=0;i<5;i++)advance(.2);
    assert.equal(scene.sourceRest.view().mode,'seated');
    scenes.key({key:'e'});for(let i=0;i<5;i++)advance(.2);
    const after=scene.serialize();assert.equal(scene.sourceRest.view().mode,'idle');
    near(after.x,before.x);near(after.z,before.z);near(after.feet,before.feet);
    assert.equal(after.completed,false);assert.equal(after.exitReceipt,null);assert.equal(completed,0);assert.equal(returned,0);
    // Retrace the causeway before descending to the door island.
    walk({x:-192.3,z:-102});walk({x:-189,z:-102});walk({x:-189,z:-98});walk({x:-180,z:-98});
    walk(continuationRadialPoint(9.7,3.8));walk(continuationRadialPoint(7.5,3.8));arc(7.5,3.8,4.13);arc(7.5,4.13,2.6);
    walk(continuationRadialPoint(2.86,2.6));release(3);
    walk(continuationRadialPoint(5,2.6));arc(5,2.6,0);walk(C.catch.finalApproach);
    assert.equal(scene.view().focus?.id,'catch-final');scene.key({key:'e'});
    assert.equal(scene.serialize().completed,false,'opening remains distinct from crossing the final pair');
    for(let i=0;i<5;i++)advance(.15);
    walk({x:C.catch.finalDoor.x+C.bodyRadius+.20,z:C.catch.finalDoor.z},{complete:true});
    for(let i=0;i<3;i++)advance(.2);
    const final=scene.serialize();assert.equal(final.completed,true);assert.equal(final.status,'completed');assert.equal(completed,1);assert.equal(returned,0);
    assert.equal(events.filter(e=>e.type==='complete').length,1);assert.equal(events.some(e=>['capture','recovered','fold','space-wrap'].includes(e.type)),false);
    assert.ok(poses.some(p=>p.level===0)&&poses.some(p=>p.level===1)&&poses.some(p=>p.level===2)&&poses.some(p=>p.level===3));
    assert.ok(final.elapsed>20,'the fixture traverses the level rather than staging isolated endpoints');
    if(process.env.SOURCE_REST_ROUTE_TRACE)writeFileSync(process.env.SOURCE_REST_ROUTE_TRACE,JSON.stringify({
      proof:'Source-tested continuous scene controls; no native or human observation',
      controls:'setLook + W walking; E releases, sits, stands and opens the final door',
      clocks:'Ordinary simulation, HUSH and counterweight clocks; no immunity, grace extension or intermediate position writes',
      dialogue:'Existing rest adapter/conversation with a fixed music-clock fixture, used only for an early optional seat departure',
      initial:{x:checkpoint.x,z:checkpoint.z,feet:checkpoint.feet,phase:checkpoint.phase,level:checkpoint.level,grace:checkpoint.grace},
      outcome:{status:final.status,completed:final.completed,exitReceipt:final.exitReceipt,elapsed:final.elapsed,completionCallbacks:completed},
      events:traceEvents,poses,
    },null,2)+'\n');
  }finally{scenes.clear();}
});
