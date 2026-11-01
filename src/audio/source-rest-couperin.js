import {assetUrl} from '../platform/paths.js';
import {createStandingTearImpulse} from './standing-tear-dsp.js';

// A single encoded stereo stream carries two aligned mono stems: acoustic
// left, electronic right. One decoder/clock prevents independent player drift.
export const SOURCE_REST_COUPERIN_URL='audio/source-rest/couperin/couperin-revoiced-pair.mp3';
export const SOURCE_REST_COUPERIN_DURATION=843.157120181406;
export const SOURCE_REST_COUPERIN_MIX=Object.freeze({reverbSeconds:6.8,dry:.72,wet:.86});
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,Number(x)||0));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a,b,t)=>a+(b-a)*t;
const POINTS=Object.freeze([[0,0],[.13,0],[.25,.58],[.38,.07],[.54,.98],[.67,.20],[.80,.99],[.91,.30],[1,.68]]);

// An authored interpretation of the arrangement, not a clinical faculty model.
// Musical phase affects the electronic return, never pitch or source position.
export function sourceRestCouperinMix({progress=0,faculty=null,currentTime=0}={}){
  const p=clamp(progress),f=faculty==null?p:clamp(faculty);
  let amount=0;
  for(let i=1;i<POINTS.length;i++)if(p<=POINTS[i][0]){
    const [a,x]=POINTS[i-1],[b,y]=POINTS[i];amount=mix(x,y,smooth((p-a)/(b-a)));break;
  }
  // Slow, continuous entry/recession leaves the human articulation perceptible.
  const breathing=.94+.06*Math.sin((Number(currentTime)||0)*Math.PI/11.3)**2;
  const electronic=clamp(amount*breathing*(.96+.04*f));
  return {electronic,acousticGain:Math.cos(electronic*Math.PI/2),electronicGain:Math.sin(electronic*Math.PI/2)};
}

export function createSourceRestCouperin({getAudio=()=>null,protectedAudio=()=>false,
  createElement=()=>document.createElement('audio'),urlFor=assetUrl,onError=()=>{}}={}){
  let element=null,source=null,context=null,destination=null,splitter=null,acoustic=null,electronic=null,
    programme=null,outputGate=null,wet=null,convolver=null,impulse=null,analyser=null,samples=null;
  let desired=false,held=false,playing=false,buffering=false,pending=false,disposed=false,failed=null,
    version=0,ended=false,finishAtEnd=false,playedSeconds=0,completedFirstCycle=false,lastSample=null,
    progress=0,faculty=null,signal=0,lastMix=null,listeners=[],nodes=[];
  const protectedNow=()=>{try{return !!protectedAudio();}catch{return true;}};
  const track=node=>{if(node)nodes.push(node);return node;};
  const at=()=>Number(context?.currentTime)||0;
  function parameter(param,value,time=at(),seconds=.06){
    if(!param)return;
    try{if(typeof param.cancelAndHoldAtTime==='function')param.cancelAndHoldAtTime(time);
      else{param.cancelScheduledValues?.(time);param.setValueAtTime?.(param.value,time);}
      if(seconds>0&&param.linearRampToValueAtTime)param.linearRampToValueAtTime(value,time+seconds);
      else if(param.setValueAtTime)param.setValueAtTime(value,time);else param.value=value;
    }catch{param.value=value;}
  }
  function measureProgress(){
    const clock=at(),position=Number(element?.currentTime),duration=Number(element?.duration);
    if(!playing||element?.paused||!Number.isFinite(position)||!Number.isFinite(duration)||duration<=0){lastSample=null;return;}
    if(lastSample&&clock>=lastSample.clock){
      const dt=clock-lastSample.clock,previous=lastSample.position;
      const advance=position>=previous?position-previous:duration-previous+position;
      // Ignore seeks and lifecycle stalls. A loop is earned by actual elapsed
      // audio time, not by a negative media-position jump alone.
      if(Math.abs(dt-advance)<=Math.max(.35,dt*.02)){
        playedSeconds+=advance;
        if(position<previous)completedFirstCycle=true;
      }
    }
    lastSample={clock,position};
  }
  function pause(){
    measureProgress();held=true;playing=false;pending=false;lastSample=null;signal=0;
    parameter(outputGate?.gain,0,at(),0);
    // Genuine lifecycle/protected holds retire reflections; ordinary mix
    // changes share the same tail and do not reset the room or either stem.
    if(convolver)convolver.buffer=null;
    try{element?.pause();}catch{}
    return true;
  }
  function detach(){
    version++;pending=false;playing=false;lastSample=null;
    for(const [name,fn]of listeners)element?.removeEventListener?.(name,fn);listeners=[];
    try{element?.pause();element?.removeAttribute?.('src');element?.load?.();}catch{}
    for(const node of nodes)try{node.disconnect?.();}catch{}
    nodes=[];element=source=context=destination=splitter=acoustic=electronic=programme=outputGate=wet=convolver=impulse=analyser=samples=null;
  }
  function fail(error){if(failed||disposed)return;failed=String(error?.message||error||'The Couperin recording could not be played.');pause();
    try{onError(error instanceof Error?error:new Error(failed));}catch{}}
  function applyMix(immediate=false){
    lastMix=sourceRestCouperinMix({progress,faculty,currentTime:Number(element?.currentTime)||0});
    parameter(acoustic?.gain,lastMix.acousticGain,at(),immediate?0:.08);
    parameter(electronic?.gain,lastMix.electronicGain,at(),immediate?0:.08);
  }
  function create(pair){
    const ctx=pair?.ctx||pair?.context,out=pair?.destination||pair?.musicGain;
    if(!ctx||!out||typeof ctx.createMediaElementSource!=='function'||typeof ctx.createChannelSplitter!=='function')throw Error('Aligned Couperin playback is unavailable.');
    const media=createElement();if(!media?.play||!media?.pause)throw Error('Streaming audio is unavailable.');
    context=ctx;destination=out;element=media;
    media.preload='auto';media.loop=!finishAtEnd;media.src=urlFor(SOURCE_REST_COUPERIN_URL);
    source=track(ctx.createMediaElementSource(media));splitter=track(ctx.createChannelSplitter(2));
    acoustic=track(ctx.createGain());electronic=track(ctx.createGain());programme=track(ctx.createGain());outputGate=track(ctx.createGain());
    acoustic.channelCount=electronic.channelCount=1;acoustic.channelCountMode=electronic.channelCountMode='explicit';
    source.connect(splitter);splitter.connect(acoustic,0);splitter.connect(electronic,1);acoustic.connect(programme);electronic.connect(programme);
    const dry=track(ctx.createGain());dry.gain.value=SOURCE_REST_COUPERIN_MIX.dry;programme.connect(dry);dry.connect(outputGate);
    if(ctx.createConvolver&&ctx.createBuffer){
      convolver=track(ctx.createConvolver());wet=track(ctx.createGain());
      impulse=createStandingTearImpulse(ctx,{decaySeconds:SOURCE_REST_COUPERIN_MIX.reverbSeconds});
      convolver.normalize=false;convolver.buffer=impulse;wet.gain.value=SOURCE_REST_COUPERIN_MIX.wet;
      programme.connect(convolver);convolver.connect(wet);wet.connect(outputGate);
    }
    if(ctx.createAnalyser){analyser=track(ctx.createAnalyser());analyser.fftSize=1024;samples=new Float32Array(1024);outputGate.connect(analyser);analyser.connect(out);}
    else outputGate.connect(out);
    outputGate.gain.value=0;applyMix(true);
    const done=()=>{if(desired&&finishAtEnd&&!media.loop){measureProgress();ended=true;playing=false;pending=false;completedFirstCycle=true;lastSample=null;}};
    const error=()=>fail(Error(media.error?.message||'The Couperin recording could not be loaded.'));
    const wait=()=>{buffering=true;parameter(outputGate?.gain,0,at(),0);lastSample=null;};
    const flow=()=>{buffering=false;if(desired&&!held&&!protectedNow()){parameter(outputGate?.gain,1,at(),.025);lastSample=null;}};
    const seek=()=>{parameter(outputGate?.gain,0,at(),0);lastSample=null;};
    for(const [name,fn]of [['ended',done],['error',error],['waiting',wait],['playing',flow],['seeking',seek],['seeked',flow],['timeupdate',measureProgress]]){
      media.addEventListener?.(name,fn);listeners.push([name,fn]);
    }
  }
  function reconcile(){
    if(disposed||!desired||failed||ended)return false;
    let pair;try{pair=getAudio();}catch(error){fail(error);return false;}
    const ctx=pair?.ctx||pair?.context,out=pair?.destination||pair?.musicGain;
    if(held||protectedNow()||!ctx||!out||ctx.state&&ctx.state!=='running'){pause();return false;}
    try{if(element&&(ctx!==context||out!==destination)){
      // Preserve actual position when a context is replaced; no old events or
      // separately decoded stem can catch up in the replacement context.
      const position=Number(element.currentTime)||0;detach();create(pair);element.currentTime=position;
    }
    if(!element)create(pair);}catch(error){fail(error);return false;}
    if(finishAtEnd&&element.ended){ended=true;playing=false;completedFirstCycle=true;return false;}
    if(convolver&&!convolver.buffer&&impulse)convolver.buffer=impulse;
    applyMix();
    if(playing&&!element.paused){measureProgress();if(!buffering&&!element.seeking)parameter(outputGate?.gain,1,at(),.025);return true;}
    if(pending)return false;
    const media=element,serial=version;pending=true;
    let request;try{request=media.play();}catch(error){pending=false;fail(error);return false;}
    Promise.resolve(request).then(()=>{
      if(serial!==version||media!==element||disposed)return;pending=false;
      if(held||!desired||protectedNow()){pause();return;}
      playing=!media.paused;lastSample=null;if(playing&&!buffering)parameter(outputGate?.gain,1,at(),.025);
    }).catch(error=>{if(serial!==version||disposed)return;pending=false;if(error?.name==='AbortError'){playing=false;return;}fail(error);});
    return false;
  }
  function start(){if(disposed)return false;if(!desired){desired=true;failed=null;held=false;ended=false;finishAtEnd=false;playedSeconds=0;completedFirstCycle=false;}reconcile();return !failed;}
  function update({active,paused=false,progress:next=progress,faculty:nextFaculty=faculty}={}){
    if(active===false){stop();return snapshot();}progress=clamp(next);faculty=nextFaculty==null?null:clamp(nextFaculty);held=!!paused;reconcile();return snapshot();
  }
  function finishAfterCycle(){if(disposed||!desired||ended)return false;finishAtEnd=true;if(element)element.loop=false;return true;}
  function stop(){desired=false;held=false;detach();failed=null;ended=false;finishAtEnd=false;playedSeconds=0;completedFirstCycle=false;buffering=false;progress=0;faculty=null;signal=0;lastMix=null;return true;}
  function dispose(){if(disposed)return false;stop();disposed=true;return true;}
  function snapshot(){
    const protect=protectedNow(),audible=!!(playing&&element&&!element.paused&&!held&&!protect&&!buffering&&!element.seeking&&!ended);
    if(audible&&analyser&&samples){try{analyser.getFloatTimeDomainData(samples);signal=clamp(Math.sqrt(samples.reduce((s,x)=>s+x*x,0)/samples.length)*8);}catch{signal=0;}}else signal=0;
    return {active:desired,playing:audible,paused:!!(desired&&(held||protect)),holding:!!(desired&&(held||protect)),protected:protect,
      currentTime:Number.isFinite(element?.currentTime)?element.currentTime:null,duration:Number.isFinite(element?.duration)?element.duration:null,
      playedSeconds,audibleSeconds:playedSeconds,ended,finishAtEnd,completedFirstPass:completedFirstCycle,completedFirstCycle,
      loading:!!(desired&&!failed&&!ended&&!audible&&!held&&!protect),pending,buffering,failed,disposed,loop:!!element?.loop,signal,
      atmosphere:!!convolver,reverbSeconds:convolver?SOURCE_REST_COUPERIN_MIX.reverbSeconds:0,
      revoicing:{...lastMix,progress,faculty,sampleLocked:!!splitter,sourceChannels:2,voices:'inferred polyphonic additive/FM revoicing'}};
  }
  return Object.freeze({start,update,pause,finishAfterCycle,stop,dispose,snapshot});
}
