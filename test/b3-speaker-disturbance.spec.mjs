import test from 'node:test';
import assert from 'node:assert/strict';
import * as REC from '../src/game/recordist.js';
import {createB3SpeakerDisturbance,B3_SPEAKER_FLAGS,holdB3RecordingForLifecycle} from '../src/game/b3-speaker-disturbance.js';

function setup({scale=1}={}){
  if(REC.isRecording())REC.stopRecording();
  if(REC.isListening())REC.stopListening();
  REC.setLoudNoiseSink(null);REC.loadRecState({battery:1});
  REC.configureDifficulty({takeSecondsScale:scale,spoilNoiseScale:1,spoilToleranceScale:1,recordingNoiseScale:1,minorNoise:'spoil'});
  assert.equal(REC.startListening(),true);assert.equal(REC.startRecording(),true);
  let flags={},wakes=0,silences=0;
  const puzzle=createB3SpeakerDisturbance({onPersist:p=>Object.assign(flags,p),onWake:()=>wakes++,onSilence:()=>silences++});
  return{puzzle,get flags(){return flags;},get wakes(){return wakes;},get silences(){return silences;}};
}
function tick(puzzle,dt=.1,transmission=1){
  const state=REC.recState();
  puzzle.step({dt,enabled:true,recording:REC.isRecording(),slating:REC.isSlating(),roomId:'main_b3',
    takeElapsed:state.takeElapsed,minimumSeconds:REC.minimumTakeDuration()});
  puzzle.reportToRecorder(REC,{x:40,y:21,transmission});
  return REC.tickRecording(dt);
}

test('a real B3 take gets a warning and can be stopped at its first usable point',()=>{
  const {puzzle,wakes}=setup();let sawWarning=false;
  while(REC.recState().takeElapsed<REC.minimumTakeDuration()){
    const result=tick(puzzle);assert.notEqual(result,'spoiled');
    if(puzzle.snapshot().warning)sawWarning=true;
  }
  assert.ok(sawWarning,'actual room sound precedes first usable stop');
  assert.equal(REC.usableTake(),true);assert.equal(REC.stopRecording().completed,true);
  assert.equal(puzzle.snapshot().active,true,'speaker persists after early stop');
  const before=puzzle.snapshot().noiseRatio;
  puzzle.step({dt:1,enabled:false,recording:false});
  assert.ok(puzzle.snapshot().noiseRatio>before,'sound continues to grow after early stop');
});

test('B3 recording clock holds across pause, focus loss and a hidden window',()=>{
  const {puzzle}=setup();
  tick(puzzle,.1);
  const before=REC.recState().takeElapsed;
  for(const lifecycle of [{paused:true},{focused:false},{hidden:true}]){
    const held=holdB3RecordingForLifecycle({recording:REC.isRecording(),roomId:'main_b3',...lifecycle});
    assert.equal(held,true);
    if(!held)tick(puzzle,1);
    assert.equal(REC.recState().takeElapsed,before);
    assert.equal(puzzle.snapshot().phase,'dormant');
  }
  assert.equal(holdB3RecordingForLifecycle({recording:true,roomId:'main_b3',paused:false,focused:true,hidden:false}),false);
  tick(puzzle,.1);assert.ok(REC.recState().takeElapsed>before,'the same take resumes without catching up');
  assert.equal(holdB3RecordingForLifecycle({recording:true,roomId:'other',focused:false}),false,'other rooms retain existing lifecycle behaviour');
  assert.equal(holdB3RecordingForLifecycle({recording:false,roomId:'main_b3',focused:false}),false);
  REC.stopRecording();
});

test('losing focus after the speakers wake freezes both clocks until return',()=>{
  const {puzzle}=setup();
  while(!puzzle.snapshot().active)tick(puzzle,.1);
  const elapsed=REC.recState().takeElapsed,age=puzzle.snapshot().age;
  const held=holdB3RecordingForLifecycle({recording:true,roomId:'main_b3',focused:false});
  if(!held)tick(puzzle,10);
  assert.equal(REC.recState().takeElapsed,elapsed);
  assert.equal(puzzle.snapshot().age,age);
  tick(puzzle,.1);
  assert.ok(Math.abs(REC.recState().takeElapsed-elapsed-.1)<1e-7);
  assert.ok(Math.abs(puzzle.snapshot().age-age-.1)<1e-7);
  REC.stopRecording();
});

test('leaving the source sounding produces a genuine ambient recording spoil',()=>{
  const f=setup();let result='running',minReached=false;
  for(let i=0;i<600&&result!=='spoiled';i++){
    if(REC.recState().takeElapsed>=REC.minimumTakeDuration())minReached=true;
    result=tick(f.puzzle);
  }
  assert.equal(minReached,true,'spoil cannot precede the first valid stop');
  assert.equal(result,'spoiled');assert.equal(REC.recState().spoilReason,'the B3 control-room speakers');
  assert.equal(REC.recState().spoilMeta.sourceId,'b3-control-speakers');
  assert.equal(REC.stopRecording().completed,false);
  assert.equal(f.puzzle.snapshot().active,true,'failed recording does not turn the speakers off');
  assert.equal(f.wakes,1);
});

test('assisted minor-noise pauses do not turn the continuous speaker into a permanently held take',()=>{
  const f=setup();REC.configureDifficulty({minorNoise:'pause',pauseSeconds:.7});
  let result='running',usable=false;
  for(let i=0;i<700&&result!=='spoiled';i++){
    if(REC.usableTake())usable=true;
    result=tick(f.puzzle);
  }
  assert.equal(usable,true,'the player still has an early-stop opportunity');
  assert.equal(result,'spoiled','a sustained growing source eventually exceeds assisted minor noise');
});

test('both booth and heavily muffled live-room positions keep a fair window and can spoil',()=>{
  // A .3 transmission is roughly -10.5dB in amplitude. It models a strongly
  // attenuating glass partition; it is not a claim about a measured real booth.
  for(const transmission of [1,.3]){
    const f=setup();let result='running',usable=false;
    for(let i=0;i<700&&result!=='spoiled'&&result!=='complete';i++){
      if(REC.usableTake())usable=true;
      result=tick(f.puzzle,.1,transmission);
    }
    assert.equal(usable,true,`usable stop survives with transmission ${transmission}`);
    assert.equal(result,'spoiled',`source can spoil through transmission ${transmission}`);
    assert.equal(REC.recState().spoilReason,'the B3 control-room speakers');
  }
});

test('warning and fair usable-stop window scale with the selected microphone',()=>{
  for(const scale of [.8,1.2]){
    const f=setup({scale});let firstWake=null,result='running',usable=false;
    for(let i=0;i<900&&result!=='spoiled'&&result!=='complete';i++){
      if(REC.usableTake())usable=true;
      result=tick(f.puzzle,.1,.3);
      if(firstWake==null&&f.puzzle.snapshot().active)firstWake=REC.recState().takeElapsed;
    }
    assert.ok(firstWake>=REC.minimumTakeDuration()*.89&&firstWake<REC.minimumTakeDuration());
    assert.equal(usable,true);assert.equal(result,'spoiled');
  }
});

test('power does nothing; CH3 changes the source and zero silences it once',()=>{
  const f=setup();for(let i=0;i<405;i++)tick(f.puzzle);
  assert.equal(f.puzzle.snapshot().active,true);
  const volume=f.puzzle.snapshot().noiseRatio;
  f.puzzle.setPower(false);assert.equal(f.puzzle.snapshot().noiseRatio,volume);
  f.puzzle.setFader(2,0);assert.equal(f.puzzle.snapshot().noiseRatio,volume);
  f.puzzle.setFader(3,.25);assert.ok(f.puzzle.snapshot().noiseRatio<volume);
  f.puzzle.setFader(3,0);assert.equal(f.puzzle.snapshot().phase,'silenced');
  assert.equal(f.flags[B3_SPEAKER_FLAGS.silenced],true);assert.equal(f.silences,1);
  f.puzzle.setFader(3,.8);assert.equal(f.puzzle.snapshot().active,false);
  f.puzzle.step({dt:1,enabled:true,recording:true,roomId:'main_b3',takeElapsed:50,minimumSeconds:45});
  assert.equal(f.wakes,1,'silenced does not retrigger');
  assert.equal(f.silences,1);
});

test('reload preserves an active fader; wake gesture happens only once',()=>{
  const f=setup();f.puzzle.setFader(3,0);
  f.puzzle.step({dt:.1,enabled:true,recording:true,roomId:'main_b3',takeElapsed:41,minimumSeconds:45});
  assert.equal(f.puzzle.snapshot().fader[2],.75,'the single wake gesture is visible');
  f.puzzle.flush();assert.equal(f.flags[`${B3_SPEAKER_FLAGS.faderPrefix}3`],.75,'an unflushed pre-wake drag cannot overwrite the wake gesture');
  f.puzzle.setFader(3,.3);f.puzzle.flush();
  const reloaded=createB3SpeakerDisturbance({savedFlags:f.flags});
  assert.equal(reloaded.snapshot().active,true);assert.equal(reloaded.snapshot().fader[2],.3);
  reloaded.step({dt:1,enabled:true,recording:true,roomId:'main_b3',takeElapsed:42,minimumSeconds:45});
  assert.equal(reloaded.snapshot().fader[2],.3,'reload never fights the player');
  reloaded.restore({});assert.equal(reloaded.snapshot().phase,'dormant','fresh run resets state');
});

test('a player already manipulating CH3 keeps control at the wake boundary',()=>{
  const f=setup();f.puzzle.setFader(3,.3);
  f.puzzle.step({dt:.1,enabled:true,recording:true,roomId:'main_b3',takeElapsed:41,minimumSeconds:45,ch3Manipulated:true});
  assert.equal(f.puzzle.snapshot().active,true);assert.equal(f.puzzle.snapshot().fader[2],.3);
  assert.equal(f.flags[`${B3_SPEAKER_FLAGS.faderPrefix}3`],.3);
  assert.equal(f.wakes,1);
  const silent=setup();silent.puzzle.setFader(3,0);
  silent.puzzle.step({dt:.1,enabled:true,recording:true,roomId:'main_b3',takeElapsed:41,minimumSeconds:45,ch3Manipulated:true});
  assert.equal(silent.puzzle.snapshot().phase,'silenced','holding zero can preempt the source');
  assert.equal(silent.flags[B3_SPEAKER_FLAGS.woken],true);
  assert.equal(silent.flags[B3_SPEAKER_FLAGS.silenced],true);
  assert.equal(silent.wakes,0,'do not announce a sound which never started');
  assert.equal(silent.silences,0,'do not announce stopping an already silent source');
  assert.equal(createB3SpeakerDisturbance({savedFlags:silent.flags}).snapshot().phase,'silenced');
});

test('slate, other rooms, pauses and giant frames cannot spoil before first valid stop',()=>{
  const f=setup();const p=f.puzzle;
  for(const input of [{enabled:true,recording:true,slating:true,roomId:'main_b3'},
    {enabled:true,recording:true,roomId:'the_tub'},{enabled:false,recording:true,roomId:'main_b3'}]){
    p.step({...input,dt:99,takeElapsed:50,minimumSeconds:45});assert.equal(p.snapshot().active,false);
  }
  p.step({dt:99,enabled:true,recording:true,roomId:'main_b3',takeElapsed:44,minimumSeconds:45});
  assert.ok(p.snapshot().noiseRatio<1,'large dt only advances one second on wake');
  const before=p.snapshot().age;p.step({dt:99,suspended:true});assert.equal(p.snapshot().age,before);
});

test('save and reload preserve the source buildup without paused or wall-clock catch-up',()=>{
  const saved={};let writes=0;
  const p=createB3SpeakerDisturbance({onPersist:patch=>{writes++;Object.assign(saved,patch);}});
  p.step({dt:.1,enabled:true,recording:true,roomId:'main_b3',takeElapsed:41,minimumSeconds:45});
  for(let i=0;i<17;i++)p.step({dt:.1});
  p.setFader(3,.4);p.flush();
  const before=p.snapshot(), reloaded=createB3SpeakerDisturbance({savedFlags:saved,onPersist:()=>writes++});
  assert.equal(reloaded.snapshot().age,before.age);
  assert.equal(reloaded.snapshot().spoilAt,before.spoilAt);
  assert.equal(reloaded.snapshot().noiseRatio,before.noiseRatio);
  const count=writes;reloaded.step({dt:99,suspended:true});
  assert.equal(reloaded.snapshot().age,before.age);assert.equal(writes,count);
  reloaded.step({dt:.1});assert.ok(Math.abs(reloaded.snapshot().age-before.age-.1)<1e-8);
});

test('timing checkpoints are bounded and a fresh run discards unflushed state',()=>{
  const patches=[];const p=createB3SpeakerDisturbance({onPersist:patch=>patches.push({...patch})});
  p.step({dt:0,enabled:true,recording:true,roomId:'main_b3',takeElapsed:41,minimumSeconds:45});
  for(let i=0;i<10;i++)p.step({dt:.5});
  const checkpoints=patches.filter(patch=>B3_SPEAKER_FLAGS.age in patch);
  assert.deepEqual(checkpoints.map(patch=>patch[B3_SPEAKER_FLAGS.age]),[0,2,4]);
  for(let i=0;i<100;i++)p.step({dt:1});
  const settled=patches.length;for(let i=0;i<10;i++)p.step({dt:1});
  assert.equal(patches.length,settled,'fully grown source stops saving checkpoints');
  p.setFader(2,.2);p.restore({});p.flush();
  assert.equal(patches.length,settled,'new run does not persist old pending adjustments');
  assert.equal(p.snapshot().phase,'dormant');
});

test('legacy and invalid saved timings resume conservatively without another wake gesture',()=>{
  let wakes=0;
  const p=createB3SpeakerDisturbance({savedFlags:{[B3_SPEAKER_FLAGS.woken]:true,
    [`${B3_SPEAKER_FLAGS.faderPrefix}3`]:.4},onWake:()=>wakes++});
  assert.equal(p.snapshot().age,0);assert.equal(p.snapshot().spoilAt,6);
  assert.ok(p.snapshot().noiseRatio<.23);assert.equal(p.snapshot().fader[2],.4);
  p.step({dt:.5});assert.equal(wakes,0);assert.equal(p.snapshot().fader[2],.4);
  p.restore({[B3_SPEAKER_FLAGS.woken]:true,[B3_SPEAKER_FLAGS.age]:Infinity,[B3_SPEAKER_FLAGS.spoilAt]:null});
  assert.equal(p.snapshot().age,0);assert.equal(p.snapshot().spoilAt,6);
});
