// The B3 desk has no mains. Its impossible monitor is a real sound source, not
// recorder failure: it begins just before the earliest valid stop and continues
// until channel 3 is lowered, even when the player stops or leaves the take.
export const B3_SPEAKER_FLAGS=Object.freeze({
  woken:'b3.speakers.woken',silenced:'b3.speakers.silenced',power:'b3.speakers.power',
  age:'b3.speakers.age',spoilAt:'b3.speakers.spoilAt',
  faderPrefix:'b3.speakers.fader.',
});
export const B3_SPEAKER_CHANNEL=3;
// Authoring coordinates of the visible b3-speaker-1 cabinet, not the console.
export const B3_SPEAKER_SOURCE=Object.freeze({x:20,z:7,floor:-4});
// A take and the source that can spoil it must use the same lifecycle clock.
// This deliberately leaves all other recording rooms on their existing path.
export function holdB3RecordingForLifecycle({recording=false,roomId=null,paused=false,focused=true,hidden=false}={}){
  return !!recording&&roomId==='main_b3'&&(!!paused||!focused||!!hidden);
}
const WORKING_FADER=.75;
const clamp=(n,lo=0,hi=1)=>Math.min(hi,Math.max(lo,Number.isFinite(Number(n))?Number(n):lo));
const faderKey=channel=>`${B3_SPEAKER_FLAGS.faderPrefix}${channel}`;

/** Host merges onPersist patches into the canonical save. Call step once per
 * world tick, including after a take stops. enabled means a genuine, as-yet
 * uncompleted B3 take, never a level check. suspended covers pause/blur, not an
 * open console. roomId is the latched recording room. On wake channel three
 * rises once; thereafter the player has control. */
export function createB3SpeakerDisturbance({savedFlags={},onPersist=()=>{},onWake=()=>{},onSilence=()=>{}}={}){
  let woken=!!savedFlags[B3_SPEAKER_FLAGS.woken],silenced=!!savedFlags[B3_SPEAKER_FLAGS.silenced];
  let powerOn=savedFlags[B3_SPEAKER_FLAGS.power]!==false;
  const fader=Array.from({length:16},(_,i)=>{
    const saved=savedFlags[faderKey(i+1)];return Number.isFinite(Number(saved))&&saved!==undefined?clamp(saved):WORKING_FADER;
  });
  // Missing legacy timing resumes at the warning, without wall-clock catch-up.
  // The bounded age stops persistence churn once the gain has reached its cap.
  function savedTiming(flags,active){
    const savedSpoil=flags[B3_SPEAKER_FLAGS.spoilAt];
    const limit=typeof savedSpoil==='number'&&Number.isFinite(savedSpoil)?clamp(savedSpoil,.5,30):6;
    const savedAge=flags[B3_SPEAKER_FLAGS.age];
    const elapsed=active&&typeof savedAge==='number'&&Number.isFinite(savedAge)?clamp(savedAge,0,limit+5):0;
    return {elapsed,limit};
  }
  let timing=savedTiming(savedFlags,woken&&!silenced);
  let age=timing.elapsed,spoilAt=timing.limit,checkpointAge=age,dirty={},dirtyTime=0;
  function restore(flags={}){
    woken=!!flags[B3_SPEAKER_FLAGS.woken];silenced=!!flags[B3_SPEAKER_FLAGS.silenced];
    powerOn=flags[B3_SPEAKER_FLAGS.power]!==false;
    for(let i=0;i<16;i++){
      const value=flags[faderKey(i+1)];
      fader[i]=value!==undefined&&Number.isFinite(Number(value))?clamp(value):WORKING_FADER;
    }
    timing=savedTiming(flags,woken&&!silenced);age=timing.elapsed;spoilAt=timing.limit;
    checkpointAge=age;dirty={};dirtyTime=0;
    return snapshot();
  }
  function persist(patch){if(Object.keys(patch).length)onPersist(patch);}
  function flush(){
    if(woken&&!silenced&&age>checkpointAge+1e-6){
      dirty[B3_SPEAKER_FLAGS.age]=age;dirty[B3_SPEAKER_FLAGS.spoilAt]=spoilAt;checkpointAge=age;
    }
    if(Object.keys(dirty).length){const patch=dirty;dirty={};dirtyTime=0;persist(patch);}return snapshot();
  }
  function snapshot(){
    const active=woken&&!silenced,over=Math.max(0,age-spoilAt);
    // Its rise is restrained through the first usable point even inside the
    // booth, then becomes much louder. That later rise can reach the live-room
    // microphone through a genuinely attenuating two-pane window.
    const raw=active?Math.min(8,.23+.77*age/Math.max(.5,spoilAt)+.32*over*over):0;
    const channelGain=clamp(fader[2]/WORKING_FADER,0,1.33),ratio=raw*channelGain;
    return{phase:silenced?'silenced':active?'sounding':'dormant',active,channel:3,
      fader:[...fader],powerOn,age,spoilAt,noiseRatio:ratio,intensity:active?clamp((.15+.85*raw/8)*channelGain):0,
      warning:active&&ratio<1,readyToSpoil:active&&ratio>1};
  }
  function wake(minimum,ch3Manipulated=false){
    woken=true;age=0;checkpointAge=0;spoilAt=clamp(minimum*.11+1,.5,30);
    // The uncanny first movement cannot pull a fader out of someone's hand.
    // A player already on CH3 can preempt the source by holding it at zero.
    if(!ch3Manipulated)fader[2]=Math.max(fader[2],WORKING_FADER);
    if(ch3Manipulated&&fader[2]<=.015)silenced=true;
    // A just-dragged, unflushed pre-wake setting must not later overwrite the
    // one authoritative first-wake movement in the saved flags.
    delete dirty[faderKey(3)];
    persist({[B3_SPEAKER_FLAGS.woken]:true,[B3_SPEAKER_FLAGS.age]:age,[B3_SPEAKER_FLAGS.spoilAt]:spoilAt,[faderKey(3)]:fader[2],
      ...(silenced?{[B3_SPEAKER_FLAGS.silenced]:true}:{})});
    if(!silenced)onWake(snapshot());
  }
  function step({dt=0,enabled=false,recording=false,slating=false,roomId=null,
    takeElapsed=0,minimumSeconds=45,suspended=false,ch3Manipulated=false}={}){
    const delta=Math.max(0,Math.min(1,Number(dt)||0));
    if(suspended)return snapshot();
    const min=Math.max(1,Number(minimumSeconds)||45);
    if(!woken&&!silenced&&enabled&&recording&&!slating&&roomId==='main_b3'&&takeElapsed>=min*.89)wake(min,ch3Manipulated);
    if(woken&&!silenced){age=Math.min(spoilAt+5,age+delta);if(age-checkpointAge>=2)flush();}
    if(Object.keys(dirty).length){dirtyTime+=delta;if(dirtyTime>=.4)flush();}
    return snapshot();
  }
  function setFader(channel,value){
    const n=Math.trunc(Number(channel));if(n<1||n>16||!Number.isFinite(Number(value)))return snapshot();
    const next=clamp(value);if(fader[n-1]===next)return snapshot();
    fader[n-1]=next;dirty[faderKey(n)]=next;dirtyTime=0;
    if(n===3&&woken&&!silenced&&next<=.015){
      silenced=true;dirty[B3_SPEAKER_FLAGS.silenced]=true;flush();onSilence(snapshot());
    }
    return snapshot();
  }
  function setPower(on){const next=!!on;if(next!==powerOn){powerOn=next;dirty[B3_SPEAKER_FLAGS.power]=next;dirtyTime=0;}return snapshot();}
  // Actual ambient meter and spoil rule; x/y are the real speaker position.
  // The host supplies measured room transmission and invokes this only for a
  // rolling B3 take. Audio playback and semantic events are separate outputs.
  function reportToRecorder(recorder,{x,y,transmission=1}={}){
    const ratio=snapshot().noiseRatio*clamp(transmission,0,1);
    if(!(ratio>0)||!recorder?.emitRoomSourceNoise)return 0;
    const unit=Number(recorder.recordingInputLevel?.(1))||1,threshold=Number(recorder.spoilThreshold?.())||.18;
    const level=threshold/unit*ratio;
    recorder.emitRoomSourceNoise(level,x,y,'the B3 control-room speakers',{
      sourceId:'b3-control-speakers',kind:'instrument_note',continuous:true,
    });
    return level;
  }
  return Object.freeze({step,setFader,setPower,snapshot,flush,restore,reportToRecorder});
}
