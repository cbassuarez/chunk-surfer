import test from 'node:test';
import assert from 'node:assert/strict';
import * as REC from '../src/game/recordist.js';
import {createB3SpeakerDisturbance,holdB3RecordingForLifecycle} from '../src/game/b3-speaker-disturbance.js';
const sourceId='b3-control-speakers';
function take(protectedSourceId=null){
  if(REC.isRecording())REC.stopRecording();if(REC.isListening())REC.stopListening();
  REC.loadRecState({battery:1});REC.configureDifficulty({takeSecondsScale:1,spoilNoiseScale:1,spoilToleranceScale:1,recordingNoiseScale:1,minorNoise:'pause'});
  REC.startListening();REC.startRecording({protectedSourceId});
}
test('music ruins B3 before a usable stop on both sides of the glass, including assisted recordings',()=>{
  for(const transmission of [1,.4]){
    take(sourceId);let writes={},status='running';
    const p=createB3SpeakerDisturbance({onPersist:patch=>Object.assign(writes,patch)});
    for(let n=0;n<600&&status!=='spoiled'&&status!=='complete';n++){
      p.step({dt:.1,enabled:true,recording:true,roomId:'main_b3',takeElapsed:REC.recState().takeElapsed,minimumSeconds:REC.minimumTakeDuration()});
      p.reportToRecorder(REC,{x:32,y:14,transmission});status=REC.tickRecording(.1);
    }
    assert.equal(status,'spoiled');assert.equal(REC.usableTake(),false);
    assert.equal(REC.recState().spoilMeta.sourceId,sourceId);
    assert.ok(REC.recState().takeElapsed<REC.minimumTakeDuration());
    assert.equal(p.snapshot().active,true);REC.stopRecording();
  }
});
test('protected introductory B3 records handling/mic movement without player-caused spoil or hunter; later rooms restore normal rules',()=>{
  take(sourceId);let calls=0;REC.setLoudNoiseSink(()=>calls++);
  REC.emitNoise(2,0,0,'you made a sound',{sourceKind:'player',sourceId:'room-mic'});
  REC.spoilTake('you reached for the light',{sourceId:'player'});
  assert.notEqual(REC.tickRecording(.1),'spoiled');assert.equal(REC.takeEvents().length,0);assert.equal(calls,0);
  REC.emitRoomSourceNoise(REC.spoilThreshold()*2,0,0,'the speakers',{sourceId});
  assert.equal(REC.recState().spoiled,true);REC.stopRecording();
  take();REC.emitNoise(2,0,0,'you moved');assert.equal(REC.recState().spoiled,true);assert.ok(calls>0);
  REC.stopRecording();REC.setLoudNoiseSink(null);
});
test('all faders down and unplugging prove the pre-fader feed; both tests must precede trace and disconnection',()=>{
  const saved={};let silenced=0;
  const p=createB3SpeakerDisturbance({onPersist:x=>Object.assign(saved,x),onSilence:()=>silenced++});
  p.step({dt:.1,enabled:true,recording:true,roomId:'main_b3',takeElapsed:12});
  assert.equal(p.inspectReturn(),false);assert.equal(p.disconnectReturn(),false);
  p.setPower(false);assert.equal(p.snapshot().active,true);assert.equal(p.inspectReturn(),false);
  for(let i=1;i<=16;i++)p.setFader(i,0);
  assert.ok(p.snapshot().noiseRatio>0);assert.equal(p.snapshot().active,true);
  const reloaded=createB3SpeakerDisturbance({savedFlags:saved,onSilence:()=>silenced++});
  assert.equal(reloaded.snapshot().powerTried,true);assert.equal(reloaded.snapshot().faderTried,true);
  assert.equal(reloaded.disconnectReturn(),false);assert.equal(reloaded.inspectReturn(),true);
  assert.equal(reloaded.disconnectReturn(),true);assert.equal(reloaded.snapshot().active,false);assert.equal(silenced,1);
  assert.equal(reloaded.disconnectReturn(),false);
});
test('pause, hidden and focus loss freeze B3 transport and source without catch-up',()=>{
  const p=createB3SpeakerDisturbance();p.step({enabled:true,recording:true,roomId:'main_b3',takeElapsed:12});
  const before=p.snapshot();
  for(const flags of [{paused:true},{hidden:true},{focused:false}]){
    assert.equal(holdB3RecordingForLifecycle({recording:true,roomId:'main_b3',...flags}),true);
    p.step({dt:100,suspended:true});assert.deepEqual(p.snapshot(),before);
  }
});
test('solved B3 never wakes again after reload or another take',()=>{
  const flags={'b3.speakers.silenced':true,'b3.speakers.woken':true};
  const p=createB3SpeakerDisturbance({savedFlags:flags});
  p.step({enabled:true,recording:true,roomId:'main_b3',takeElapsed:50});assert.equal(p.snapshot().active,false);
});
