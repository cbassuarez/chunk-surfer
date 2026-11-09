import test from 'node:test';
import assert from 'node:assert/strict';
import {makeOpeningPrologueScene} from '../src/game/opening-prologue-scene.js';

function host({live=true,presented=true}={}){
  const calls={start:0,update:0,frames:[],omen:[],beats:[],done:0,looks:[]};
  let time=0,paused=false,yaw=0,pitch=-.035;
  const pose=()=>[1,0,0,0,0,1,0,0,0,0,1,0,20,0,120-time*13,1];
  const driver={start(){calls.start++;},update(dt){if(!paused){time+=dt;calls.update++;}},
    frame(){return{timeSec:time,scene:{eye:[20,1.6,120-time*13],body:pose(),props:[{id:'cab',mesh:'drive_cabin',matrix:pose()}],lamps:[],cut:{lights:[]},mirrors:[]},look:{yaw,pitch},driveState:{heading:0,speed:13}};},
    snapshot:()=>({timeSec:time,driveState:{heading:0,speed:13},look:{yaw,pitch}}),
    lookAngles:()=>({yaw,pitch}),lookBy(dy,dp){yaw+=dy;pitch+=dp;calls.looks.push([dy,dp]);return true;},setPaused(v){paused=v;}};
  const scene=makeOpeningPrologueScene({drive:driver,driveMetrics:{ready:true},driveLive:()=>live,getReady:()=>true,getPresentationReady:()=>true,
    onDriveFrame:frame=>{calls.frames.push(frame);return presented;},setOmen:frame=>calls.omen.push(frame),onBeat:b=>calls.beats.push(b),onDone:()=>calls.done++,audio:{},getAudio:()=>null});
  scene.enter();for(let k=0;k<3;k++)scene.update(1/30);
  return{scene,calls,setLive:v=>{live=v;},setPresented:v=>{presented=v;}};
}
const advance=(scene,seconds)=>{for(let t=0;t<seconds;t+=1/30)scene.update(1/30);};

test('the first film frame is presented by the moving-drive owner before dialogue begins',()=>{
  const h=host();assert.equal(h.scene.view().phase,'film');assert.equal(h.calls.start,1);
  assert.equal(h.calls.frames[0].driveState.speed,13);assert.equal(h.scene.worldPresentation,'hidden');
  assert.equal(h.calls.frames[0].prologue.renderOwner,'opening-drive');assert.equal(h.scene.worldView(),null);h.scene.exit();
});

test('late readiness and a rejected first frame cannot reveal a different camera or advance dialogue',()=>{
  const h=host({live:false});assert.equal(h.scene.view().phase,'awaiting-frame');assert.equal(h.calls.start,0);
  h.setLive(true);h.setPresented(false);advance(h.scene,1);assert.equal(h.scene.view().phase,'awaiting-frame');assert.equal(h.calls.start,1);
  h.setPresented(true);advance(h.scene,.1);assert.equal(h.scene.view().phase,'film');assert.equal(h.calls.start,1);assert.equal(h.scene.worldView(),null);h.scene.exit();
});

test('a rejected frame after the opening starts holds dialogue, driving and direction until the same owner recovers',()=>{
  const h=host();advance(h.scene,.4);h.setPresented(false);h.scene.update(1/30);
  const before=h.scene.view();assert.equal(before.phase,'film');assert.equal(before.presentationReady,false);
  const pending={node:before.nodeId,line:before.lineSerial,typed:before.typed,lineAge:before.lineAge};
  h.scene.key({key:'Enter'});advance(h.scene,1.5);const held=h.scene.view();
  assert.equal(held.drive.timeSec,before.drive.timeSec);assert.equal(held.stage.time,before.stage.time);assert.equal(held.journey.age,before.journey.age);assert.equal(held.journey.clock,before.journey.clock);
  assert.deepEqual({node:held.nodeId,line:held.lineSerial,typed:held.typed,lineAge:held.lineAge},pending);
  assert.equal(h.scene.worldView(),null);assert.equal(h.calls.start,1);assert.deepEqual(h.calls.beats,['drive']);
  h.setPresented(true);advance(h.scene,.1);const resumed=h.scene.view();assert.equal(resumed.presentationReady,true);assert.ok(resumed.drive.timeSec>before.drive.timeSec);assert.ok(resumed.stage.time>before.stage.time);assert.equal(h.calls.start,1);h.scene.exit();
});

test('a failed presentation still permits the dedicated held skip without invisible journey progress',()=>{
  const h=host();h.setPresented(false);h.scene.update(1/30);const at=h.scene.view().drive.timeSec;
  h.scene.key({key:'e',code:'KeyE'});advance(h.scene,1.2);assert.equal(h.calls.done,1);assert.equal(h.scene.view().drive.timeSec,at);h.scene.exit();
});

test('the first wheels and the cinematic departure remain in one submitted coordinate frame',()=>{
  const h=host();h.scene.seekStage('woken');h.scene.update(1/30);
  const first=h.calls.omen.at(-1);assert.ok(first.horizon?.active);assert.deepEqual(first.horizon.centre,[0,14,-115]);assert.ok(first.horizon.radius>1.5);
  h.scene.seekStage('inner');h.scene.update(1/30);const frame=h.calls.frames.at(-1);
  assert.equal(frame.journey.intent,'wheels');assert.equal(frame.prologue.renderOwner,'opening-drive');assert.equal(h.scene.worldView(),null);
  assert.ok(frame.scene.props.some(p=>p.id==='opening-memory:ellery-actual-public-front'));
  assert.deepEqual(h.calls.beats,['drive']);assert.equal(h.scene.view().beatVeil,0);h.scene.exit();
});

test('ordinary driving continues beneath every school, question and fate view',()=>{
  const h=host();let previous=h.scene.view().drive.timeSec;
  for(const key of['inner','whole','ellery','school','boy','notice','roll','fate3','margin','gone']){
    h.scene.seekStage(key);advance(h.scene,.2);const v=h.scene.view();assert.ok(v.drive.timeSec>previous,key);previous=v.drive.timeSec;
    assert.equal(v.beat,'drive');assert.equal(h.scene.worldPresentation,'hidden');assert.equal(h.scene.worldView(),null);
    assert.ok(h.calls.frames.at(-1).scene.eye.every(Number.isFinite));
  }
  h.scene.exit();
});

test('look remains responsive throughout the departure without handing over the pedals',()=>{
  const h=host();for(const key of['dark','inner','school','fate3','gone']){
    h.scene.seekStage(key);h.scene.update(1/30);assert.equal(h.scene.allowsLook,true);assert.equal(h.scene.lookBy(.1,-.02),true);
    for(const code of['w','a','s','d'])assert.equal(h.scene.key({key:code}),true);
  }
  assert.equal(h.calls.looks.length,5);h.scene.exit();
});

test('pause holds the exact road and camera clocks and cancels a partial skip',()=>{
  const h=host();h.scene.seekStage('inner');advance(h.scene,1);h.scene.key({key:'e'});advance(h.scene,.5);h.scene.pause();
  const before=h.scene.view();advance(h.scene,6);const after=h.scene.view();assert.equal(after.drive.timeSec,before.drive.timeSec);assert.equal(after.stage.time,before.stage.time);assert.equal(after.skip,0);
  h.scene.resume();advance(h.scene,1.2);assert.equal(h.calls.done,0);assert.ok(h.scene.view().drive.timeSec>before.drive.timeSec);h.scene.exit();
});

test('the final warning prepares a return to the actual cab and does not create another renderer',()=>{
  const h=host();h.scene.seekStage('fate3');h.scene.update(1/30);h.scene.seekStage('gone');h.scene.update(1/30);
  const frame=h.calls.frames.at(-1);assert.equal(frame.journey.intent,'return');assert.equal(frame.journey.musicPhase,'return');
  assert.ok(frame.scene.eye[1]<2);assert.equal(h.scene.worldView(),null);assert.deepEqual(h.calls.beats,['drive']);h.scene.exit();
});
