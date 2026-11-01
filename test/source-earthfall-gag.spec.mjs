import test from 'node:test';
import assert from 'node:assert/strict';
import {EARTHFALL_GAG as G,earthfallGagPoint,sourceEarthfallGagFrame,earthfallGagPenetration} from '../src/data/source-earthfall-gag.js';
import {THRESHOLD_GAG,thresholdGagTiming} from '../src/data/threshold-gag.js';
import {SOURCE_EARTHFALL_ELLERY_ASIDE as C} from '../src/data/source-earthfall-ellery-aside.js';
import {SOURCE_ELLERY_ASIDE_ASSET as A} from '../src/data/generated/source-earthfall-ellery-aside.js';
import {freshSourceEarthfallElleryAside as fresh,normalizeSourceEarthfallElleryAside as normalize,stepSourceEarthfallElleryAside as step,sourceEarthfallElleryAsideFrame as frame,sourceElleryAsidePanelMatrix as panel,sourceElleryAsideCanStand as canStand} from '../src/game/source-earthfall-ellery-aside.js';
import {freshSourceEarthfall} from '../src/game/source-earthfall.js';
import {createSourceEarthfallScene} from '../src/game/source-earthfall-scene.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const near=(a,b,epsilon=1e-7)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} != ${b}`);
const gagEvents=events=>events.filter(event=>event.type.startsWith('threshold-gag-'));
function aimed(state=fresh({runId:'second-gag'}),away=false){
  const target=earthfallGagPoint(THRESHOLD_GAG.revealLocal),dx=target.x-state.x,dz=target.z-state.z;
  return {...state,yaw:Math.atan2(dx,-dz)+(away?Math.PI:0),pitch:Math.atan2(target.y-(state.feet+C.eyeHeight),Math.hypot(dx,dz))};
}
function advance(value,seconds,input={},rate=120){
  let state=value;const events=[];
  for(let tick=0;tick<Math.round(seconds*rate);tick++){
    const result=step(state,{dt:1/rate,...input});state=result.state;events.push(...result.events);
  }
  return {state,events};
}

test('the second apparatus leaves a stable, freely playable room before its familiar performance',()=>{
  const start=aimed(),waiting=advance(start,G.releaseAt-C.fixedStep),f=frame(waiting.state);
  near(waiting.state.elapsed,0);assert.equal(waiting.state.gag.complete,false);
  assert.equal(gagEvents(waiting.events).length,0);assert.equal(f.materialEvents.length,0);
  assert.equal(f.dust.puffs.length,0);assert.equal(f.blackoutAlpha,0);
  for(const piece of A.panels)assert.deepEqual(panel(piece.id,waiting.state.elapsed),panel(piece.id,0));
  assert.deepEqual(f.doors.map(door=>door.fraction),frame(start).doors.map(door=>door.fraction));
  const moved=advance(start,.5,{side:1,look:{yaw:0,pitch:-.2}}).state;
  assert.ok(Math.hypot(moved.x-start.x,moved.z-start.z)>.5);near(moved.pitch,-.2);
  near(moved.elapsed,0);assert.equal(moved.gag.complete,false);
  const post=earthfallGagPoint([.245,-.5,.015]);
  assert.ok(earthfallGagPenetration(post.x,post.z,start)>0,'the reused apparatus has a physical supporting post');
  assert.equal(canStand(post.x,post.z,start),false,'ordinary movement cannot pass through its post');
  assert.equal(canStand(start.x,start.z,start),true,'its original arrival remains usable');
});

test('the human boo follows a real stop while the retained trace helper stays world anchored and fresh play stays quiet',()=>{
  const clock=thresholdGagTiming(false),run=advance(aimed(),G.completeAt),events=gagEvents(run.events);
  assert.deepEqual(events.map(event=>event.type),['threshold-gag-release','threshold-gag-stop','threshold-gag-rattle','threshold-gag-speaker-click','threshold-gag-boo']);
  const expected=[0,clock.contact,clock.rattle,clock.click,clock.boo];
  for(let i=0;i<events.length;i++){
    near(events[i].at,G.releaseAt+expected[i]);assert.ok(Object.values(events[i].position).every(Number.isFinite));
  }
  assert.ok(events.at(-1).at>events[1].at+.3,'the human delivery arrives after mechanical contact');
  assert.ok(events.at(-1).at<G.shadowAt,'familiarity precedes the violation');
  const early={...aimed(),gag:{...fresh().gag,elapsed:G.shadowAt-.01}},later={...early,gag:{...early.gag,elapsed:G.shadowAt+G.shadowArcSeconds+.5}};
  assert.equal(sourceEarthfallGagFrame(early).shadow,null);
  const f=sourceEarthfallGagFrame(later);assert.ok(f.shadow);near(f.angle,0);
  const armEnd=earthfallGagPoint([-.68,-1.15,.075]);
  assert.ok(Math.hypot(f.shadow.x-armEnd.x,f.shadow.z-armEnd.z)>.3,'presence has left the honest mechanical stop');
  assert.deepEqual(sourceEarthfallGagFrame({...later,yaw:later.yaw+1,pitch:1}).shadow,f.shadow,'looking changes the observer, not the world-space shadow');
  near(run.state.elapsed,0);assert.equal(run.state.gag.complete,true);
  const quiet=advance(run.state,C.chargeAt).state;near(quiet.elapsed,0);assert.equal(quiet.chase.phase,'quiet');assert.equal(frame(quiet).gag.shadow,null,'fresh quiet play cannot inherit the former automatic detached-pressure sequence');
});

test('looking away can delay recognition only within the bounded twelve-second opportunity',()=>{
  const hidden=aimed(fresh({runId:'unseen'}),true),before=advance(hidden,G.maximumRecognitionSeconds-C.fixedStep);
  assert.equal(gagEvents(before.events).length,0);assert.equal(before.state.gag.complete,false);near(before.state.elapsed,0);
  const released=advance(before.state,C.fixedStep*2);
  assert.equal(gagEvents(released.events).filter(event=>event.type==='threshold-gag-release').length,1);
  const done=advance(released.state,G.completeAt-G.releaseAt+.1);
  assert.equal(done.state.gag.complete,true);near(done.state.elapsed,0);assert.equal(done.state.chase.phase,'quiet');
  assert.ok(before.state.gag.waited<=G.maximumRecognitionSeconds);
});

test('fixed-step cue order and movement are unchanged at 60 and 120 submitted frames per second',()=>{
  const start=aimed(),a=advance(start,G.completeAt+.5,{},60),b=advance(start,G.completeAt+.5,{},120);
  assert.deepEqual(a.state,b.state);assert.deepEqual(a.events,b.events);
  const walkA=advance(start,.5,{side:1},60),walkB=advance(start,.5,{side:1},120);
  assert.deepEqual(walkA.state,walkB.state);
});

test('pause, protected media, missing assets and audio, focus loss and suspension freeze the new clocks and look',()=>{
  const start=advance(aimed(),1).state;
  for(const guard of [{paused:true},{protected:true},{hidden:true},{suspended:true},{focused:false},{assetsReady:false},{gagAudioReady:false}]){
    const result=step(start,{dt:.2,forward:1,look:{yaw:2,pitch:1},...guard});
    assert.deepEqual(result.state,normalize(start),JSON.stringify(guard));assert.deepEqual(result.events,[]);
  }
});

test('save/reload preserves waiting, swing and quiet exploration without replaying earlier one-shot cues',()=>{
  for(const seconds of [2,G.releaseAt+.1,G.shadowAt+.5,G.completeAt+C.coreAt+.1]){
    const original=advance(aimed(),seconds),saved=normalize(copy(original.state)),a=advance(original.state,.5),b=advance(saved,.5);
    assert.deepEqual(b,a,`resume at ${seconds}s`);
    const previous=new Set(gagEvents(original.events).map(event=>event.type));
    assert.ok(gagEvents(b.events).every(event=>!previous.has(event.type)),`cue replay at ${seconds}s`);
  }
});

test('legacy v2 bodies continue their existing demolition and consumed saves never acquire a new gag',()=>{
  for(const elapsed of [0,1.4,3.6,C.duration]){
    const body={version:2,id:'source-earthfall:ellery-aside-v2',runId:'legacy',status:elapsed===C.duration?'completed':'active',
      elapsed,accumulator:0,x:66.2,z:10.4,feet:-.17,velocityY:-.4,yaw:.6,pitch:-.2,
      consumed:elapsed===C.duration,receipts:[{id:'old-door',type:'closed',at:2.3,doorIndex:1}]};
    const saved=normalize(body,{runId:'legacy'});
    for(const key of ['x','z','feet','velocityY','yaw','pitch','elapsed','receipts','status','consumed'])assert.deepEqual(saved[key],body[key],`${key} at ${elapsed}`);
    assert.equal(saved.gag.legacy,true);assert.equal(saved.gag.complete,true);near(saved.gag.elapsed,G.completeAt);
    assert.equal(sourceEarthfallGagFrame(saved).enabled,false);assert.equal(sourceEarthfallGagFrame(saved).shadow,null);
    const after=advance(saved,.1);assert.deepEqual(gagEvents(after.events),[]);
    if(body.consumed)assert.deepEqual(after.state,saved);
    else assert.ok(after.state.elapsed>elapsed);
  }
});

test('reduced dread retains ordinary control and a usable quiet departure without automatic destruction',()=>{
  const r=advance(aimed(),G.shadowAt+.5,{reducedMotion:true,reducedDread:true}),f=sourceEarthfallGagFrame(r.state);
  assert.equal(f.shadow,null);assert.equal(f.reduced,true);assert.equal(f.reducedDread,true);
  const moved=advance(r.state,.2,{side:1,look:{yaw:0,pitch:.3},reducedMotion:true,reducedDread:true}).state;
  assert.ok(Math.hypot(moved.x-r.state.x,moved.z-r.state.z)>.2);near(moved.pitch,.3);
  const waiting=advance(moved,G.completeAt+C.duration+.5,{reducedMotion:true,reducedDread:true});
  assert.equal(waiting.state.status,'active');near(waiting.state.elapsed,0);assert.equal(waiting.state.chase.phase,'quiet');
  // Staged arrival at the real grey door isolates accessible departure.
  const atDoor={...waiting.state,x:58.2,z:10.25,yaw:-Math.PI/2},opened=step(atDoor,{dt:0,interact:true,reducedMotion:true,reducedDread:true}).state;
  const done=advance(opened,2,{forward:1,reducedMotion:true,reducedDread:true});assert.equal(done.state.status,'completed');assert.equal(done.state.consumed,true);assert.equal(done.state.exitKind,'quiet');assert.equal(done.state.chase.catches,0);
});

test('the actual Earthfall scene can hold/reload the quiet prologue, then cross its ordinary door before one resumed impact',async()=>{
  let presentation={},audioReady=true;const sounds=[],traces=[];
  const renderer={initialize:async()=>true,ready:()=>true,render:()=>true,renderAside:()=>true,dispose(){}};
  const audio={ready:async()=>true,prepareAside:async()=>true,asideGagReady:()=>audioReady,stop(){},stopAside(){},update(){},updateAside(f,o){sounds.push(...(o.events||[]));}};
  const outer=freshSourceEarthfall({runId:'scene-gag'});
  Object.assign(outer,{committed:true,phase:'catching',clock:12,elapsed:12,committedAt:0,feet:0,catchElapsed:.12,z:-18,
    receipts:[{id:'initial-catch',type:'catch',at:11.88,position:{x:0,y:0,z:-18},gain:.5}],elleryAside:aimed(fresh({runId:'scene-gag'}))});
  const create=checkpoint=>createSourceEarthfallScene({checkpoint,renderer,audio,presentation:()=>presentation,onTrace:value=>traces.push(value)});
  let scene=create(outer);await scene.initialize();
  for(const hold of [{hidden:true},{focused:false},{suspended:true},{protected:true}]){
    presentation=hold;const before=scene.serialize();scene.update(.2);assert.deepEqual(scene.serialize(),before);
  }
  presentation={};audioReady=false;const silent=scene.serialize();scene.update(.2);assert.deepEqual(scene.serialize(),silent);audioReady=true;
  scene.update(.2);const saved=copy(scene.serialize());scene.exit();scene=create(saved);await scene.initialize();
  assert.deepEqual(scene.serialize().elleryAside,saved.elleryAside);assert.equal(scene.allowsLook,true);
  const outerTime=scene.serialize().elapsed;
  for(let tick=0;tick<(G.maximumRecognitionSeconds+G.completeAt+5)*60;tick++){assert.equal(scene.serialize().elapsed,outerTime,'the 100m fall clock holds while inhabiting the copied room');scene.update(1/60);}
  assert.equal(scene.serialize().impactPass,0);assert.equal(scene.serialize().elleryAside.chase.phase,'quiet');near(scene.serialize().elleryAside.elapsed,0);
  // This test stages the final approach; full chase delivery is independently
  // exercised through the parent noise/rendered-contact protocol.
  const exit=copy(scene.serialize());Object.assign(exit.elleryAside,{x:58.2,z:10.25,yaw:-Math.PI/2});scene.exit();scene=create(exit);await scene.initialize();scene.key({key:'e'});scene.key({key:'w'});
  for(let tick=0;tick<180&&scene.serialize().impactPass===0;tick++){scene.update(1/60);scene.render();}scene.keyup({key:'w'});
  const resumed=scene.serialize();assert.equal(resumed.impactPass,1);assert.equal(resumed.elleryAsideCompleted,true);assert.equal(resumed.elleryAside.consumed,true);
  assert.equal(resumed.phase,'falling');near(resumed.feet,-resumed.velocityY*C.resumeFallSeconds,.001);
  for(let tick=0;tick<300&&scene.serialize().phase!=='landed';tick++)scene.update(1/60);
  const landed=scene.serialize();assert.equal(landed.phase,'landed');assert.equal(scene.view().aside,null);
  for(const type of ['catch','catch-return','land-return'])assert.equal(landed.receipts.filter(event=>event.type===type).length,1,type);
  assert.equal(traces.filter(trace=>trace.type==='fall-resume').length,1);
  assert.equal(gagEvents(sounds).filter(event=>event.type==='threshold-gag-boo').length,1);
  assert.ok(!sounds.some(event=>/injur|damage|penalty/.test(event.type)));
  scene.exit();
});
