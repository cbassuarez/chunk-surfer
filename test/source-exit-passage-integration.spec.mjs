import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_CONTINUATION as WORLD,continuationSupportAt} from '../src/data/source-continuation.js';
import {SOURCE_III_ARCHIPELAGO} from '../src/data/source-continuation-archipelago.js';
import {SOURCE_EXIT_PASSAGE as EXIT} from '../src/data/source-exit-passage.js';
import {freshSourceContinuation,normalizeSourceContinuation,stepSourceContinuation} from '../src/game/source-continuation.js';
import {freshContinuationHush} from '../src/game/source-continuation-hush.js';
import {continuationFreeBody} from '../src/game/source-continuation-physics.js';
import {createSourceContinuationScene} from '../src/game/source-continuation-scene.js';

const DT=.1,clone=value=>JSON.parse(JSON.stringify(value));
const near=(a,b,epsilon=1e-7)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const pose=(progress,extra={})=>({phase:'catch',chartId:0,level:0,x:EXIT.door.x+progress,z:EXIT.door.z,
 feet:EXIT.door.y,yaw:Math.PI/2,pitch:0,...extra});
// DEVELOPER FIXTURE: the completed expedition is seeded only to isolate this
// later threshold. These tests do not claim to earn any island or chase route.
// From this initial supported pose onward, only actual controller movement is
// used; no body writes or injected passage receipts move the test player.
function fixture({progress=-.8,hush=false,z=EXIT.door.z}={}){
 const fresh=freshSourceContinuation({runId:'exit-passage-integration',returnPose:{x:9,y:13,yaw:.2,pitch:-.1}});
 const at=pose(progress,{z}),state=normalizeSourceContinuation({...fresh,...at,status:'active',elapsed:100,
  expedition:{...fresh.expedition,visited:[...SOURCE_III_ARCHIPELAGO.mainIslandIds],chases:SOURCE_III_ARCHIPELAGO.chaseSections.map(section=>section.id)},
  doorOpen:{'catch-final':true},doorMotion:{},lastSafe:{...at},recoveryAnchor:{...at,kind:'landing',supportId:'catch-door-island',earnedAt:100}});
 state.counterweight.active=false;
 if(hush){
  const actorPose=pose(-2.8);
  state.hush={...freshContinuationHush(actorPose),id:'source-continuation-hush',active:true,armed:true,mode:'follow',
   warningAnnounced:true,elapsed:100,notice:0,arrival:null,catchEntry:null,
   trail:[{kind:'walk',...at}],lastRecorded:{...at}};
 }else{state.hush.active=false;state.hush.arrival=null;state.hush.catchEntry=null;}
 return state;
}
function tick(state,input={},events=[]){
 const result=stepSourceContinuation(state,{dt:DT,renderReady:true,...input});
 events.push(...result.events);return result.state;
}
function walkUntil(state,predicate,{forward=1,side=0,max=100,events=[]}={}){
 for(let n=0;n<max&&!predicate(state);n++){
  assert.equal(state.recovery,null,'the supported test route cannot substitute recovery transport');
  assert.equal(state.fall,null,'the supported test route cannot substitute a fall');
  state=tick(state,{forward,side},events);
 }
 assert.ok(predicate(state),'actual controller movement did not reach the requested passage position');
 return state;
}
const renderer=()=>({initialize:async()=>true,ready:()=>true,render:()=>true,dispose(){}});

test('actual scene walks the original open door, retains agency through the passage and delivers the original onward receipt once',async t=>{
 let contacts=0;const deliveries=[],traces=[];
 const scene=createSourceContinuationScene({checkpoint:fixture(),renderer:renderer(),audio:{update(){},event(){},stop(){}},
  getContactStatus:chapter=>({chapter,battleAvailable:true,repeatAvailable:false,won:false,activeBattleId:null}),
  onContact(){contacts++;return true;},onComplete(request){deliveries.push(clone(request.checkpoint));return true;},
  onAcceptedTravel(){},onTrace:event=>traces.push(event)});
 await scene.initialize();scene.key({key:'w',code:'KeyW',type:'keydown'});
 for(let i=0;i<25&&scene.serialize().x<EXIT.door.x+.3;i++)scene.update(DT);
 const entered=scene.serialize();assert.ok(entered.x>EXIT.door.x+WORLD.bodyRadius);
 assert.equal(entered.completed,false);assert.equal(entered.status,'active');assert.equal(entered.exitPassage.enteredReason,'door');
 assert.equal(deliveries.length,0);assert.equal(contacts,0);assert.equal(scene.allowsLook,true);
 for(let i=0;i<120&&scene.serialize().status==='active';i++)scene.update(DT);
 const completed=scene.serialize();scene.keyup({key:'w',code:'KeyW'});
 assert.equal(completed.status,'completed');assert.equal(completed.exitPassage.phase,'complete');
 assert.ok(completed.x>EXIT.completionX+WORLD.bodyRadius&&completed.x<EXIT.floorEndX);
 assert.ok(continuationSupportAt(completed.x,completed.z,completed));
 // The existing finite ownership handoff still follows the physical crossing.
 for(let i=0;i<8;i++)scene.update(DT);
 await Promise.resolve();await Promise.resolve();
 assert.equal(deliveries.length,1);assert.equal(contacts,0,'walking onward must not invoke Contact');
 assert.equal(deliveries[0].exitReceipt.id,'exit-passage-integration:source-continuation-exit');
 assert.equal(deliveries[0].exitReceipt.delivered,false);assert.deepEqual(deliveries[0].returnPose,{x:9,y:13,yaw:.2,pitch:-.1});
 assert.equal(traces.filter(row=>row.type==='event'&&row.event?.type==='complete').length,1);
 t.diagnostic('SOURCE_EXIT_ROUTE '+JSON.stringify({fixture:'expedition seeded, route movement real',enteredX:entered.x,completedX:completed.x,commitmentX:EXIT.completionX,receipt:deliveries[0].exitReceipt,contacts}));
 scene.exit();
});

test('actual movement can retreat through the original door and reload a mid-passage checkpoint without spending the ending',()=>{
 const events=[];let state=walkUntil(fixture(),s=>s.x>=EXIT.door.x+5,{events});
 const saved=clone(state),resumed=normalizeSourceContinuation(saved);
 near(resumed.x,state.x);near(resumed.z,state.z);near(resumed.yaw,state.yaw);assert.deepEqual(resumed.exitPassage,state.exitPassage);
 assert.equal(resumed.status,'active');assert.equal(resumed.exitReceipt,null);
 state=walkUntil(resumed,s=>s.x<EXIT.door.x-.3,{forward:-1,max:80,events});
 assert.equal(state.exitPassage.phase,'backed-out');assert.equal(state.exitPassage.enteredReason,'door');assert.equal(state.completed,false);
 state=walkUntil(state,s=>s.x>=EXIT.door.x+1,{events});
 assert.equal(state.exitPassage.phase,'entered');assert.equal(state.exitReceipt,null);
 assert.equal(events.filter(e=>e.type==='source-exit-entered').length,1,'re-entry retains the same durable threshold receipt');
 assert.equal(events.some(e=>e.type==='complete'),false);
});

test('the real passage edges permit both ordinary step-off and a player-initiated jump without a jump point',()=>{
 for(const jump of[false,true]){
  let state=fixture({progress:9,z:EXIT.door.z+EXIT.halfWidth-.18});const events=[];
  assert.ok(continuationSupportAt(state.x,state.z,state));assert.equal(continuationFreeBody(state,state),true);
  for(let i=0;i<6&&!state.fall;i++)state=tick(state,{side:1,jump:jump&&i===0},events);
  assert.ok(state.fall,'a supported edge does not impose an invisible path clamp');
  assert.equal(state.fall.trigger,jump?'jump':'step-off');assert.equal(state.recovery,null);assert.equal(state.completed,false);
  assert.ok(events.some(e=>e.type==='drop'&&e.trigger===(jump?'jump':'step-off')));
 }
});

test('the same canonical Hush physically follows through the original door and can catch a waiting undefeated player in the exit passage',t=>{
 let state=fixture({hush:true});const id=state.hush.id,events=[],trace=[];
 const move=forward=>{
  const before=clone(state.hush);state=tick(state,{forward},events);
  assert.equal(state.hush.id,id);assert.equal(state.hush.chartId,0);
  assert.ok(continuationSupportAt(state.hush.x,state.hush.z,{...state,feet:state.hush.feet}),'the following actor stays on actual support');
  assert.equal(continuationFreeBody(state.hush,state,{radius:WORLD.hush.radius}),true,'the follower respects the same walls and leaf');
  if(!before.fall&&!state.hush.fall&&!before.recovery&&!state.hush.recovery)
   assert.ok(Math.hypot(state.hush.x-before.x,state.hush.z-before.z,state.hush.feet-before.feet)<=Math.max(6.2,WORLD.hush.chaseSpeed)*DT+.001,'the same actor cannot relocate to manufacture pursuit');
  trace.push({playerX:state.x,hushX:state.hush.x,mode:state.hush.mode});
 };
 for(let i=0;i<70&&state.x<EXIT.door.x+6&&!state.recovery;i++)move(1);
 assert.equal(state.recovery,null);assert.ok(state.x>=EXIT.door.x+6);assert.equal(state.exitPassage.enteredReason,'door');
 for(let i=0;i<120&&!state.recovery;i++)move(0);
 assert.ok(trace.some(p=>p.hushX>EXIT.door.x+WORLD.hush.radius),'Hush must traverse the original door, rather than remain atmospheric outside');
 assert.equal(state.recovery?.reason,'hush-pressure','ordinary deliberate waiting remains physically consequential after entering the passage');
 assert.ok(state.hush.x>EXIT.retainedIslandEndX+WORLD.hush.radius,'physical capture requires the same actor to traverse the added passage support beyond the old island');
 assert.equal(state.recovery?.contact,undefined,'the local controller does not commit a Contact battle');
 assert.ok(events.some(e=>e.type==='capture'&&e.reason==='hush-pressure'));
 assert.equal(state.completed,false);assert.equal(events.some(e=>e.type==='complete'),false);
 t.diagnostic('SOURCE_EXIT_PURSUIT '+JSON.stringify({fixture:'one supported canonical actor; expedition seeded',actor:id,entryX:EXIT.door.x,last:trace.at(-1),capture:state.recovery?.reason,poseWritesAfterStart:0}));
});
