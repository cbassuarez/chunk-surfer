import {assetUrl} from '../platform/paths.js';
import {createStandingTearImpulse} from './standing-tear-dsp.js';
import {createSourceRestAfflictionAudio} from './source-rest-affliction.js';
import {createSourceRestPlayback} from './source-rest-playback.js';

// The performance remains a long, stereo stream: it is not decoded into the
// short surroundings buffer bank or processed by its quantizer. A single
// media element feeds the game's existing music bus for this seat only.
export const SOURCE_REST_MUSIC_URL='audio/source-rest/seb-bach-chaconne-105.mp3';
export const SOURCE_REST_MUSIC_MIX=Object.freeze({reverbSeconds:6.8,dry:.72,wet:.86,signalScale:8});

export function createSourceRestMusic({getAudio=()=>null,protectedAudio=()=>false,
  createElement=()=>document.createElement('audio'),urlFor=assetUrl,onError=()=>{}}={}){
  let element=null,source=null,context=null,destination=null,desired=false,held=false,
    playing=false,failed=null,pending=false,disposed=false,version=0,listeners=[],
    completedFirstPass=false,playedSeconds=0,finishAtEnd=false,ended=false,
    graphNodes=[],outputGate=null,convolver=null,impulse=null,wetGain=null,analyser=null,signalSamples=null,signal=0,lastSignalAt=null,
    affliction=null,afflictionWanted=false,buffering=false;
  const transport=createSourceRestPlayback({getMedia:()=>element,getContext:()=>context,getOutputGain:()=>outputGate});
  const protectedNow=()=>{try{return !!protectedAudio();}catch{return true;}};
  const notify=error=>{if(failed)return;failed=String(error?.message||error||'The recording could not be played.');playing=false;
    pause();try{onError(error instanceof Error?error:new Error(failed));}catch{}};
  function detach(){
    version++;pending=false;playing=false;buffering=false;transport.resetSampling();signal=0;lastSignalAt=null;
    affliction?.dispose();affliction=null;
    if(element){for(const [name,fn] of listeners)element.removeEventListener?.(name,fn);listeners=[];
      try{element.pause();}catch{}try{element.removeAttribute?.('src');element.load?.();}catch{}}
    if(convolver)convolver.buffer=null;
    for(const node of graphNodes)try{node.disconnect();}catch{}
    graphNodes=[];outputGate=null;convolver=null;impulse=null;wetGain=null;analyser=null;signalSamples=null;
    try{source?.disconnect();}catch{}element=null;source=null;context=null;destination=null;
  }
  // The analyser observes the real pre-reverb performance; it never alters or
  // replaces the stereo output. Time-based smoothing keeps visuals steady at
  // variable frame rates, and no signal is invented while audio is held.
  function measuredSignal(){
    if(!playing||!element||element.paused||held||protectedNow()||!analyser||!signalSamples){signal=0;lastSignalAt=null;return 0;}
    try{analyser.getFloatTimeDomainData(signalSamples);}catch{signal=0;lastSignalAt=null;return 0;}
    let sum=0;for(const sample of signalSamples)sum+=sample*sample;
    const target=Math.min(1,Math.sqrt(sum/signalSamples.length)*SOURCE_REST_MUSIC_MIX.signalScale),now=Number(context?.currentTime);
    const dt=Number.isFinite(now)&&lastSignalAt!==null?Math.max(0,Math.min(1,now-lastSignalAt)):.05;
    if(Number.isFinite(now))lastSignalAt=now;
    signal+=(target-signal)*(1-Math.exp(-dt/(target>signal?.08:.4)));
    return signal;
  }
  function sampleProgress({ending=false}={}){
    const value=transport.sample({eligible:playing&&(!element?.paused||ending)&&!held&&!protectedNow()&&!buffering&&!element?.seeking,ended:ending});
    playedSeconds=value.playedSeconds;
  }
  function create(pair){
    const ctx=pair?.ctx||pair?.context,out=pair?.destination||pair?.musicGain;
    if(!ctx||!out||typeof ctx.createMediaElementSource!=='function')return false;
    const media=createElement();if(!media||typeof media.play!=='function'||typeof media.pause!=='function')throw Error('Streaming audio is unavailable.');
    media.preload='auto';media.loop=false;media.src=urlFor(SOURCE_REST_MUSIC_URL);
    const node=ctx.createMediaElementSource(media);
    if(typeof ctx.createGain==='function'){
      outputGate=ctx.createGain();outputGate.gain.value=1;outputGate.connect(out);graphNodes.push(outputGate);
      const dry=ctx.createGain();dry.gain.value=SOURCE_REST_MUSIC_MIX.dry;graphNodes.push(dry);
      let feed=node;
      if(typeof ctx.createAnalyser==='function'){
        analyser=ctx.createAnalyser();analyser.fftSize=1024;signalSamples=new Float32Array(analyser.fftSize);
        graphNodes.push(analyser);node.connect(analyser);feed=analyser;
      }
      affliction=createSourceRestAfflictionAudio({context:ctx,source:feed,getState:()=>({currentTime:media.currentTime,duration:media.duration,
        playing:playing&&!media.paused&&!held&&!protectedNow(),paused:held,protected:protectedNow(),
        buffering:buffering||Number.isFinite(media.readyState)&&media.readyState<3,seeking:!!media.seeking})});
      affliction.setActive(afflictionWanted);feed=affliction.output||feed;feed.connect(dry);
      dry.connect(outputGate);
      if(typeof ctx.createConvolver==='function'&&typeof ctx.createBuffer==='function'){
        try{
          convolver=ctx.createConvolver();wetGain=ctx.createGain();graphNodes.push(convolver,wetGain);
          impulse=createStandingTearImpulse(ctx,{decaySeconds:SOURCE_REST_MUSIC_MIX.reverbSeconds});
          convolver.normalize=false;convolver.buffer=impulse;wetGain.gain.value=SOURCE_REST_MUSIC_MIX.wet;
          feed.connect(convolver);convolver.connect(wetGain);wetGain.connect(outputGate);
        }catch{
          // The original performance remains available if this device cannot
          // allocate the room impulse; discard any partial wet graph.
          try{convolver?.disconnect();wetGain?.disconnect();}catch{}
          graphNodes=graphNodes.filter(n=>n!==convolver&&n!==wetGain);convolver=null;wetGain=null;impulse=null;
        }
      }
    }else node.connect(out);
    element=media;source=node;context=ctx;destination=out;transport.bind();
    const error=()=>notify(Error(media.error?.message||'The recording could not be loaded.'));
    const time=()=>sampleProgress(),onEnded=()=>{
      if(!desired)return;
      sampleProgress({ending:true});ended=true;playing=false;pending=false;transport.resetSampling();completedFirstPass=true;transport.resetSampling();endAffliction();
    };
    const wait=()=>{buffering=true;transport.resetSampling();affliction?.pause();},flow=()=>{buffering=false;transport.resetSampling();affliction?.update();},seek=()=>{transport.resetSampling();affliction?.pause();};
    for(const [name,fn] of [['error',error],['timeupdate',time],['ended',onEnded],['waiting',wait],['playing',flow],['seeking',seek],['seeked',flow]]){media.addEventListener?.(name,fn);listeners.push([name,fn]);}
    return true;
  }
  function endAffliction(){affliction?.pause();if(afflictionWanted){if(convolver)convolver.buffer=null;if(wetGain)wetGain.gain.value=0;}}
  function pause(){affliction?.pause();if(!element)return;sampleProgress();playing=false;transport.resetSampling();signal=0;lastSignalAt=null;
    // Retire any reflection tail on focus/recording holds; do not leak audio
    // into a recording or replay the old tail when the listener returns.
    if(convolver)convolver.buffer=null;if(wetGain)wetGain.gain.value=0;
    try{element.pause();}catch{}}
  function reconcile(){
    if(disposed||!desired||failed||ended)return false;
    if(held||protectedNow()){pause();return false;}
    let pair;try{pair=getAudio();}catch(error){notify(error);return false;}
    if(!pair?.ctx&&!pair?.context){pause();return false;}
    const ctx=pair.ctx||pair.context,out=pair.destination||pair.musicGain;
    if(!out||ctx.state&&ctx.state!=='running'){pause();return false;}
    // Do not create two MediaElementAudioSourceNodes for one element. If the
    // game's audio context changes, retire its element before making another.
    if(element&&(context!==ctx||destination!==out)){const position=Number(element.currentTime)||0;sampleProgress();detach();try{if(!create(pair))return false;element.currentTime=position;transport.resetSampling();}catch(error){notify(error);return false;}}
    try{if(!element&&!create(pair))return false;}catch(error){notify(error);return false;}
    if(convolver&&!convolver.buffer&&impulse)convolver.buffer=impulse;
    if(wetGain)wetGain.gain.value=SOURCE_REST_MUSIC_MIX.wet;
    // The browser can expose ended before dispatching its event. Never call
    // play() on that terminal element: doing so would start the piece again.
    if(element.ended){ended=true;playing=false;pending=false;transport.resetSampling();completedFirstPass=true;endAffliction();return false;}
    if(playing&&!element.paused){sampleProgress();transport.applyRate();affliction?.update();return true;}
    if(pending)return false;
    const media=element,serial=version;pending=true;
    let request;try{request=media.play();}catch(error){pending=false;notify(error);return false;}
    Promise.resolve(request).then(()=>{
      if(serial!==version||media!==element||disposed)return;
      pending=false;
      if(!desired||held||protectedNow()||ended){pause();return;}
      playing=!media.paused;sampleProgress();affliction?.update();
    }).catch(error=>{if(serial!==version||media!==element||disposed||ended)return;pending=false;
      // Pausing an in-flight play request during focus or recording changes
      // legitimately rejects with AbortError. The next active tick can retry.
      if(error?.name==='AbortError'){playing=false;return;}notify(error);});
    return false;
  }
  function start(){
    if(disposed)return false;
    // Starting invokes play() in the interaction handler itself, preserving
    // the native/browser user gesture; no async setup precedes that call.
    if(!desired){detach();failed=null;completedFirstPass=false;playedSeconds=0;finishAtEnd=false;ended=false;desired=true;held=false;}
    reconcile();return !failed;
  }
  function update({active,paused=false}={}){
    if(active===false){stop();return snapshot();}
    held=!!paused;reconcile();return snapshot();
  }
  // Keep the current playback position and existing media node; the ongoing
  // pass will finish naturally rather than silently starting over at the end.
  function finishAfterCycle(){if(disposed||!desired||ended)return false;finishAtEnd=true;if(element)element.loop=false;return true;}
  function setAfflictionActive(value){if(disposed)return false;afflictionWanted=!!value;affliction?.setActive(afflictionWanted);return afflictionWanted;}
  function stop(){desired=false;held=false;afflictionWanted=false;detach();transport.reset();failed=null;completedFirstPass=false;playedSeconds=0;finishAtEnd=false;ended=false;return true;}
  function dispose(){if(disposed)return false;stop();disposed=true;return true;}
  function snapshot(){const protectedState=protectedNow(),audible=!!(playing&&element&&!element.paused&&!held&&!protectedState&&!buffering&&!element.seeking);
    const level=audible?measuredSignal():0;
    return {active:desired,playing:audible,paused:!!(desired&&(held||protectedState)),protected:protectedState,signal:level,
      atmosphere:!!convolver,reverbSeconds:convolver?SOURCE_REST_MUSIC_MIX.reverbSeconds:0,affliction:affliction?.snapshot()||{supported:false,enabled:afflictionWanted},
      loading:!!(desired&&!failed&&!ended&&!audible&&!held&&!protectedState),buffering,pending,failed,disposed,ended,finishAtEnd,completedFirstPass,completedFirstCycle:completedFirstPass,playedSeconds,
    ...transport.snapshot(),audioTime:Number(context?.currentTime)||0,currentTime:Number.isFinite(element?.currentTime)?element.currentTime:null,
    duration:Number.isFinite(element?.duration)?element.duration:null,loop:!!element?.loop};}
  return Object.freeze({start,update,setAfflictionActive,finishAfterCycle,stop,dispose,snapshot,
    setPlaybackRate:(value,options)=>{if(disposed)return false;sampleProgress();return transport.setPlaybackRate(value,options);},
    setProgrammeDuck:(value,options)=>disposed?false:transport.setProgrammeDuck(value,options)});
}
