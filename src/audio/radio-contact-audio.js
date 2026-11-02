import { assetUrl } from '../platform/paths.js';

// The retained original is an authored, lossy mix, not an unprocessed recording.
// This 7.5–9.7 s fragment was selected from its measured rise before the later
// overloaded crest. Listening acceptance remains pending. The original stays
// untouched. This is receive-only audio: no authored global cue, shake, threat,
// injury, transmission or gameplay event is dispatched here.
export const RADIO_CONTACT_EGG = Object.freeze({
  path:'audio/game/radio_breaks-scream.mp3',
  offset:7.5,seconds:2.2,gain:.22,attack:.025,release:.14,
  highpassHz:320,lowpassHz:3400,
});
export const RADIO_CONTACT_VOICE_LIMIT = 4;

// No raw switch recordings are retained for these controls. Their restrained
// damped contact/noise foley is a procedural surrogate, not measured hardware.
const CONTACTS = Object.freeze({
  press:{seconds:.045,gain:.038,frequency:1400},
  // The authored key sinks without an owning user press/release pair. Its
  // finite contact cannot acquire the latch used to deduplicate held inputs.
  fault:{seconds:.045,gain:.038,frequency:1400},
  release:{seconds:.038,gain:.029,frequency:1800},
  channel:{seconds:.036,gain:.026,frequency:2200},
  battery:{seconds:.075,gain:.048,frequency:1000},
  denied:{seconds:.055,gain:.019,frequency:700},
});
const ALIASES=Object.freeze({'ptt-down':'press','ptt-up':'release',tune:'channel'});

async function fetchBuffer(url,context,{signal}={}) {
  const response=await fetch(url,{signal});
  if(!response.ok)throw new Error(`Radio fragment unavailable: ${response.status}`);
  return context.decodeAudioData(await response.arrayBuffer());
}

/**
 * Owns a foreground radio's finite audio graph, supplied mixer destination and
 * decode lifetime. getProtected returns a Boolean; the scene must call pause or
 * stopEgg when protection/focus changes during playback. No timer, AudioContext
 * resume, hardware destination, global cue dispatcher or progression mutation.
 * loadBuffer, when supplied, receives (url, context, {signal}).
 */
export function createRadioContactAudio({getAudio=()=>null,getControlAudio=null,loadBuffer=fetchBuffer,
  getProtected=()=>false}={}) {
  let context=null,destination=null,decoded=null,pending=null,abort=null,epoch=0;
  let disposed=false,paused=false,eggVoice=null,eggRequested=false,eggStarted=false;
  let held=false,controlBuffer=null,lastContactAt=-Infinity,completed=false;
  const voices=new Set();

  function protectedNow(){try{return !!getProtected();}catch(_){return true;}}
  function disconnect(voice,{cancel=false}={}){
    if(!voice||!voices.has(voice))return;
    voice.cancelled=voice.cancelled||cancel;
    voices.delete(voice);voice.source.onended=null;
    if(cancel)try{voice.source.stop(context?.currentTime||0);}catch(_){}
    for(const node of voice.nodes)try{node.disconnect();}catch(_){}
    if(eggVoice===voice)eggVoice=null;
  }
  function invalidate(){
    epoch++;abort?.abort();abort=null;pending=null;eggRequested=false;
  }
  function clear(){for(const voice of [...voices])disconnect(voice,{cancel:true});held=false;}
  function audio({loading=false}={}){
    if(disposed||paused||(!loading&&protectedNow()))return null;
    let next;try{next=getAudio();}catch(_){return null;}
    if(!next?.ctx||!next.destination||next.ctx.state!=='running')return null;
    if(typeof next.ctx.createBufferSource!=='function'||typeof next.ctx.createGain!=='function'
      ||typeof next.ctx.createBiquadFilter!=='function')return null;
    if(context!==next.ctx||destination!==next.destination){
      invalidate();clear();decoded=null;controlBuffer=null;
      context=next.ctx;destination=next.destination;lastContactAt=-Infinity;
    }
    return {context,destination};
  }
  function warm(){
    const owner=audio({loading:true});if(!owner)return Promise.resolve(false);
    if(decoded)return Promise.resolve(true);
    if(pending)return pending;
    const token=epoch,ctx=owner.context;
    const controller=typeof AbortController==='function'?new AbortController():null;
    abort=controller;
    const job=Promise.resolve().then(()=>{
      if(disposed||paused||token!==epoch)return null;
      return loadBuffer(assetUrl(RADIO_CONTACT_EGG.path),ctx,{signal:controller?.signal});
    }).then(buffer=>{
      if(disposed||paused||token!==epoch||context!==ctx||ctx.state!=='running')return false;
      if(!buffer||!Number.isFinite(buffer.duration)||buffer.duration<RADIO_CONTACT_EGG.offset+RADIO_CONTACT_EGG.seconds)return false;
      decoded=buffer;return true;
    }).catch(()=>false).finally(()=>{
      if(pending===job)pending=null;
      if(abort===controller)abort=null;
    });
    pending=job;return job;
  }
  function buildVoice({buffer,offset=0,seconds,gain,attack,release,highpassHz,lowpassHz,
    frequency=null,rate=1,onComplete=null,isEgg=false}={}){
    const ctx=context,nodes=[];
    let source,voice;
    const own=node=>{nodes.push(node);return node;};
    try{
      while(voices.size>=RADIO_CONTACT_VOICE_LIMIT){
        const expendable=[...voices].find(v=>!v.isEgg);if(!expendable)return null;
        disconnect(expendable,{cancel:true});
      }
      source=own(ctx.createBufferSource());source.buffer=buffer;source.loop=false;
      if(source.playbackRate?.setValueAtTime)source.playbackRate.setValueAtTime(rate,ctx.currentTime);
      else if(source.playbackRate)source.playbackRate.value=rate;
      let tail=source;
      if(isEgg){
        // A single close speaker cannot retain the old mix's stereo width.
        // Web Audio's explicit speakers-mode downmix averages L/R to mono.
        const mono=own(ctx.createGain());mono.gain.value=1;
        mono.channelCount=1;mono.channelCountMode='explicit';mono.channelInterpretation='speakers';
        tail.connect(mono);tail=mono;
      }
      for(const [type,hz] of (frequency?[['bandpass',frequency]]:[['highpass',highpassHz],['lowpass',lowpassHz]])){
        const filter=own(ctx.createBiquadFilter());filter.type=type;
        filter.frequency.value=hz;filter.Q.value=type==='bandpass'?.7:.707;
        tail.connect(filter);tail=filter;
      }
      const amp=own(ctx.createGain()),now=ctx.currentTime;
      const controlOutput=!isEgg&&getControlAudio?.();
      tail.connect(amp);amp.connect(controlOutput?.ctx===ctx&&controlOutput.destination?controlOutput.destination:destination);
      amp.gain.setValueAtTime(0,now);
      amp.gain.linearRampToValueAtTime(gain,now+attack);
      amp.gain.setValueAtTime(gain,now+Math.max(attack,seconds-release));
      amp.gain.linearRampToValueAtTime(0,now+seconds);
      voice={source,nodes,isEgg,cancelled:false};voices.add(voice);
      source.onended=()=>{
        if(voice.cancelled||!voices.has(voice))return;
        disconnect(voice);
        if(isEgg){completed=true;try{onComplete?.();}catch(_){} }
      };
      source.start(now,offset,seconds*rate);
      source.stop(now+seconds+.004);
      return voice;
    }catch(_){
      if(voice)disconnect(voice,{cancel:true});
      else{source&&(source.onended=null);try{source?.stop(ctx.currentTime);}catch(_){}for(const node of nodes)try{node.disconnect();}catch(_){}}
      return null;
    }
  }
  function contactBuffer(){
    if(controlBuffer)return controlBuffer;
    const rate=Number(context.sampleRate)||48000,length=Math.max(1,Math.floor(rate*.09));
    controlBuffer=context.createBuffer(1,length,rate);const data=controlBuffer.getChannelData(0);
    let seed=0x4417;
    for(let i=0;i<length;i++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const t=i/rate,envelope=Math.exp(-t*85),noise=(seed/0xffffffff)*2-1;
      data[i]=(noise*.65+Math.sin(t*Math.PI*2*210)*.35)*envelope;
    }
    return controlBuffer;
  }
  function control(kind,{direction=1}={}){
    kind=Object.hasOwn(ALIASES,kind)?ALIASES[kind]:kind;
    if(!Object.hasOwn(CONTACTS,kind)||!audio())return false;
    if(kind==='press'&&held||kind==='release'&&!held)return false;
    if(kind==='press')held=true;
    if(kind==='release')held=false;
    const now=context.currentTime;
    // Physical detents may be quick, but input repetition cannot create a wall
    // of contacts. This clock never advances while the AudioContext is held.
    if(kind==='channel'&&now-lastContactAt<.035)return false;
    const recipe=CONTACTS[kind];
    try{
      const voice=buildVoice({buffer:contactBuffer(),...recipe,attack:.002,release:.012,
        rate:kind==='channel'?(direction<0?.94:1.06):kind==='release'?1.15:1});
      if(voice){lastContactAt=now;return true;}
    }catch(_){}
    return false;
  }
  async function egg({onComplete,quiet=false}={}){
    if(eggStarted||eggRequested||!audio())return false;
    eggRequested=true;const token=epoch;
    const ready=await warm();
    if(!ready||token!==epoch||disposed||paused||protectedNow()||!audio()||token!==epoch){
      if(token===epoch)eggRequested=false;return false;
    }
    const voice=buildVoice({buffer:decoded,...RADIO_CONTACT_EGG,gain:quiet?0:RADIO_CONTACT_EGG.gain,onComplete,isEgg:true});
    eggRequested=false;
    if(!voice)return false;
    eggVoice=voice;eggStarted=true;return true;
  }
  function stopEgg({retry=false}={}){invalidate();if(eggVoice)disconnect(eggVoice,{cancel:true});if(retry&&!completed)eggStarted=false;}
  function pause(){if(disposed||paused)return false;paused=true;invalidate();clear();return true;}
  function resume(){if(disposed||!paused)return false;paused=false;return true;}
  function stop(){if(disposed)return;disposed=true;invalidate();clear();decoded=null;controlBuffer=null;context=null;destination=null;}
  function snapshot(){return {disposed,paused,loading:!!pending,ready:!!decoded,voices:voices.size,
    nodes:[...voices].reduce((n,v)=>n+v.nodes.length,0),eggRequested,eggStarted,
    eggPlaying:!!eggVoice,eggCompleted:completed,held,surrogateControls:true};}
  return {warm,control,egg,stopEgg,pause,resume,stop,snapshot};
}
