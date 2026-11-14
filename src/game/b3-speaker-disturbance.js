// B3's first failed take belongs to the live-room monitor return. The desk
// cannot remove a pre-fader feed, and switching its mains off proves that.
export const B3_SPEAKER_FLAGS=Object.freeze({
  woken:'b3.speakers.woken',silenced:'b3.speakers.silenced',power:'b3.speakers.power',
  age:'b3.speakers.age',spoilAt:'b3.speakers.spoilAt',faderPrefix:'b3.speakers.fader.',
  powerTried:'b3.speakers.powerTried',faderTried:'b3.speakers.faderTried',returnTraced:'b3.speakers.returnTraced',
});
export const B3_SPEAKER_CHANNEL=3;
export const B3_SPEAKER_SOURCE=Object.freeze({x:16,z:7,floor:-4});
export function holdB3RecordingForLifecycle({recording=false,roomId=null,paused=false,focused=true,hidden=false}={}){
  return !!recording&&roomId==='main_b3'&&(!!paused||!focused||!!hidden);
}
const clamp=(n,lo=0,hi=1)=>Math.min(hi,Math.max(lo,Number.isFinite(Number(n))?Number(n):lo));
const faderKey=n=>`${B3_SPEAKER_FLAGS.faderPrefix}${n}`;
export function createB3SpeakerDisturbance({savedFlags={},onPersist=()=>{},onWake=()=>{},onSilence=()=>{}}={}){
  let woken,silenced,powerOn,powerTried,faderTried,returnTraced,age,spoilAt,dirty={},checkpointAge=0;
  const fader=Array(16).fill(.75);
  function restore(flags={}){
    woken=!!flags[B3_SPEAKER_FLAGS.woken];silenced=!!flags[B3_SPEAKER_FLAGS.silenced];powerOn=flags[B3_SPEAKER_FLAGS.power]!==false;
    powerTried=!!flags[B3_SPEAKER_FLAGS.powerTried];faderTried=!!flags[B3_SPEAKER_FLAGS.faderTried];returnTraced=!!flags[B3_SPEAKER_FLAGS.returnTraced];
    for(let i=0;i<16;i++)fader[i]=flags[faderKey(i+1)]===undefined?.75:clamp(flags[faderKey(i+1)]);
    spoilAt=clamp(flags[B3_SPEAKER_FLAGS.spoilAt]??6,3,8);age=woken&&!silenced?clamp(flags[B3_SPEAKER_FLAGS.age]??0,0,spoilAt+5):0;
    checkpointAge=age;dirty={};return snapshot();
  }
  function snapshot(){
    const active=woken&&!silenced;
    // A measurable pre-fader floor remains even when all sixteen caps are down.
    const channelGain=.45+.55*clamp(fader[2]/.75,0,1.33);
    const raw=active?Math.min(8,.25+7.75*age/Math.max(1,spoilAt)):0;
    const ratio=raw*channelGain;
    return{phase:silenced?'silenced':active?'sounding':'dormant',active,channel:3,fader:[...fader],powerOn,powerTried,faderTried,returnTraced,
      age,spoilAt,sourceRatio:raw,noiseRatio:ratio,intensity:active?clamp(.2+.8*ratio/8):0,warning:active&&ratio<1,readyToSpoil:active&&ratio>1};
  }
  function flush(){
    if(woken&&!silenced&&age>checkpointAge+1e-6){dirty[B3_SPEAKER_FLAGS.age]=age;dirty[B3_SPEAKER_FLAGS.spoilAt]=spoilAt;checkpointAge=age;}
    if(Object.keys(dirty).length){const patch=dirty;dirty={};onPersist(patch);}return snapshot();
  }
  function step({dt=0,enabled=false,recording=false,slating=false,roomId=null,takeElapsed=0,minimumSeconds=45,suspended=false}={}){
    if(suspended)return snapshot();
    if(!woken&&!silenced&&enabled&&recording&&!slating&&roomId==='main_b3'&&takeElapsed>=Math.min(12,Math.max(3,minimumSeconds*.28))){
      woken=true;age=0;spoilAt=clamp(minimumSeconds*.14,3,8);
      dirty[B3_SPEAKER_FLAGS.woken]=true;dirty[B3_SPEAKER_FLAGS.spoilAt]=spoilAt;flush();onWake(snapshot());
    }
    if(woken&&!silenced){age=Math.min(spoilAt+5,age+clamp(dt,0,.25));if(age-checkpointAge>=2)flush();}
    return snapshot();
  }
  function setFader(channel,value){
    const n=Math.trunc(Number(channel));if(n<1||n>16||!Number.isFinite(Number(value)))return snapshot();
    fader[n-1]=clamp(value);dirty[faderKey(n)]=fader[n-1];
    if(woken&&n===3&&fader[n-1]<=.1){faderTried=true;dirty[B3_SPEAKER_FLAGS.faderTried]=true;}flush();return snapshot();
  }
  function setPower(on){powerOn=!!on;dirty[B3_SPEAKER_FLAGS.power]=powerOn;if(woken&&!powerOn){powerTried=true;dirty[B3_SPEAKER_FLAGS.powerTried]=true;}flush();return snapshot();}
  function inspectReturn(){if(!woken||silenced||!powerTried||!faderTried)return false;returnTraced=true;dirty[B3_SPEAKER_FLAGS.returnTraced]=true;flush();return true;}
  function disconnectReturn(){if(!returnTraced||silenced)return false;silenced=true;dirty[B3_SPEAKER_FLAGS.silenced]=true;flush();onSilence(snapshot());return true;}
  function reportToRecorder(recorder,{x,y,transmission=1}={}){
    const ratio=snapshot().noiseRatio*clamp(transmission);
    if(!(ratio>0)||!recorder?.emitRoomSourceNoise)return 0;
    const unit=Number(recorder.recordingInputLevel?.(1))||1,threshold=Number(recorder.spoilThreshold?.())||.18;
    const level=threshold/unit*ratio;
    recorder.emitRoomSourceNoise(level,x,y,'music from the B3 live-room speakers',{sourceId:'b3-control-speakers',kind:'instrument_note',continuous:true,interruption:'authored'});return level;
  }
  restore(savedFlags);
  return Object.freeze({step,setFader,setPower,inspectReturn,disconnectReturn,snapshot,flush,restore,reportToRecorder});
}
