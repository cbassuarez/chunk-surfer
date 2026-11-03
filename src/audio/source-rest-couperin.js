import {assetUrl} from '../platform/paths.js';
import {createStandingTearImpulse} from './standing-tear-dsp.js';
import {createSourceRestPlayback} from './source-rest-playback.js';
import {sourceAcousticCoordinates} from './source-surroundings.js';
import {SOURCE_REST_SEATS} from '../game/source-rest-seat.js';
import {SOURCE_CONTINUATION} from '../data/source-continuation.js';

// A single encoded stereo stream carries two aligned mono stems: acoustic
// left, electronic right. One decoder/clock prevents independent player drift.
export const SOURCE_REST_COUPERIN_URL='audio/source-rest/couperin/couperin-revoiced-pair.mp3';
export const SOURCE_REST_COUPERIN_DURATION=843.157120181406;
export const SOURCE_REST_COUPERIN_MIX=Object.freeze({reverbSeconds:6.8,dry:.72,wet:.86});
export const SOURCE_REST_COUPERIN_BLEND=Object.freeze({maximumElectronic:.72,settleSeconds:5.5,maximumAmountPerSecond:.035,controlIntervalSeconds:.10,rampSeconds:.16});
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
  const electronic=clamp(amount*breathing*(.96+.04*f))*SOURCE_REST_COUPERIN_BLEND.maximumElectronic;
  return {electronic,acousticGain:Math.cos(electronic*Math.PI/2),electronicGain:Math.sin(electronic*Math.PI/2)};
}
export function advanceSourceRestCouperinBlend(amount,target,seconds){
  const dt=Math.max(0,Math.min(.25,Number(seconds)||0)),wanted=clamp(target),current=clamp(amount),delta=(wanted-current)*(1-Math.exp(-dt/SOURCE_REST_COUPERIN_BLEND.settleSeconds)),limit=dt*SOURCE_REST_COUPERIN_BLEND.maximumAmountPerSecond;
  return clamp(current+Math.max(-limit,Math.min(limit,delta)));
}

// Two aligned versions inhabit different places in the Catch. Their apparent
// positions wander slowly, while their relative presence follows the listener
// through the islands. The transport is still a single, sample-locked stream.
export function sourceRestCouperinSpace(state,frame,time=0){
  if(state?.phase!=='catch'||!Number.isFinite(state.x)||!Number.isFinite(state.z))return null;
  const seat=SOURCE_REST_SEATS.find(s=>s.phase==='catch'),door=SOURCE_CONTINUATION.catch.finalDoor,t=Number.isFinite(time)?time:0;
  const acoustic={x:seat.x+4*Math.sin(t/29),y:seat.feet+2,z:seat.z+4*Math.cos(t/29)};
  const electronic={x:door.x+7*Math.sin(t/23),y:door.y+2.6,z:door.z+7*Math.cos(t/31)};
  const a=sourceAcousticCoordinates(acoustic,state,frame,{chartId:0}),e=sourceAcousticCoordinates(electronic,state,frame,{chartId:0});
  const pan=v=>clamp(v.relativeXYZ[0]/Math.max(3,v.distance),-1,1);
  // Broad overlapping fields avoid dead spots; a slow interference pattern
  // makes stillness subtly unstable without detuning either performance.
  const distanceBlend=clamp(.5+(a.distance-e.distance)/85);
  const shimmer=.5+.5*Math.sin((state.x+172)*.085+(state.z+92)*.105+t/19);
  return {electronic:clamp(.12+.63*(.72*distanceBlend+.28*shimmer)),acousticPan:pan(a),electronicPan:pan(e)};
}

export function createSourceRestCouperin({getAudio=()=>null,protectedAudio=()=>false,
  createElement=()=>document.createElement('audio'),urlFor=assetUrl,onError=()=>{}}={}){
  let element=null,source=null,context=null,destination=null,splitter=null,acoustic=null,electronic=null,
    programme=null,programmeDuck=null,outputGate=null,wet=null,convolver=null,impulse=null,analyser=null,samples=null,acousticPan=null,electronicPan=null;
  let desired=false,held=false,playing=false,buffering=false,pending=false,disposed=false,failed=null,
    version=0,ended=false,finishAtEnd=false,playedSeconds=0,completedFirstCycle=false,
    progress=0,faculty=null,signal=0,lastMix=null,listeners=[],nodes=[],blendAmount=0,lastMixClock=null,lastAutomationAt=null,spatialState=null,spatialFrame=null;
  const parameterTargets=new WeakMap();
  const transport=createSourceRestPlayback({getMedia:()=>element,getContext:()=>context,getOutputGain:()=>programmeDuck});
  const protectedNow=()=>{try{return !!protectedAudio();}catch{return true;}};
  const track=node=>{if(node)nodes.push(node);return node;};
  const at=()=>Number(context?.currentTime)||0;
  function parameter(param,value,time=at(),seconds=.06){
    if(!param)return;
    if(Math.abs((parameterTargets.get(param)??Infinity)-value)<1e-6)return;
    parameterTargets.set(param,value);
    try{if(typeof param.cancelAndHoldAtTime==='function')param.cancelAndHoldAtTime(time);
      else{param.cancelScheduledValues?.(time);param.setValueAtTime?.(param.value,time);}
      if(seconds>0&&param.linearRampToValueAtTime)param.linearRampToValueAtTime(value,time+seconds);
      else if(param.setValueAtTime)param.setValueAtTime(value,time);else param.value=value;
    }catch{param.value=value;}
  }
  function measureProgress({ending=false}={}){
    const value=transport.sample({eligible:playing&&(!element?.paused||ending)&&!held&&!protectedNow()&&!buffering&&!element?.seeking,ended:ending});
    playedSeconds=value.playedSeconds;
  }
  function pause(){
    measureProgress();held=true;playing=false;pending=false;transport.resetSampling();signal=0;
    lastMixClock=lastAutomationAt=null;
    parameter(outputGate?.gain,0,at(),0);
    // Genuine lifecycle/protected holds retire reflections; ordinary mix
    // changes share the same tail and do not reset the room or either stem.
    if(convolver)convolver.buffer=null;
    try{element?.pause();}catch{}
    return true;
  }
  function detach(){
    version++;pending=false;playing=false;transport.resetSampling();transport.resetSampling();
    lastMixClock=lastAutomationAt=null;
    for(const [name,fn]of listeners)element?.removeEventListener?.(name,fn);listeners=[];
    try{element?.pause();element?.removeAttribute?.('src');element?.load?.();}catch{}
    for(const node of nodes)try{node.disconnect?.();}catch{}
    nodes=[];element=source=context=destination=splitter=acoustic=electronic=programme=programmeDuck=outputGate=wet=convolver=impulse=analyser=samples=acousticPan=electronicPan=null;
  }
  function fail(error){if(failed||disposed)return;failed=String(error?.message||error||'The Couperin recording could not be played.');pause();
    try{onError(error instanceof Error?error:new Error(failed));}catch{}}
  function applyMix(immediate=false){
    const musicTime=Number(element?.currentTime)||0,space=sourceRestCouperinSpace(spatialState,spatialFrame,musicTime),target=sourceRestCouperinMix({progress,faculty,currentTime:musicTime}),clock=at();
    // The island field supplies a floor while walking; narrative peaks can
    // still take the revoicing all the way to their authored level at the seat.
    if(space)target.electronic=Math.max(.72*space.electronic,target.electronic);
    if(!immediate&&lastMixClock!==null)blendAmount=advanceSourceRestCouperinBlend(blendAmount,target.electronic,clock-lastMixClock);
    lastMixClock=clock;
    lastMix={electronic:blendAmount,targetElectronic:target.electronic,acousticGain:Math.cos(blendAmount*Math.PI/2),electronicGain:Math.sin(blendAmount*Math.PI/2),space};
    // Dialogue/narrative gates may jump. The room and the human performance
    // continue while the revoicing travels slowly toward that new intention.
    // A bounded control rate avoids restarting two 80ms ramps every game frame.
    if(!immediate&&lastAutomationAt!==null&&clock-lastAutomationAt<SOURCE_REST_COUPERIN_BLEND.controlIntervalSeconds)return;
    lastAutomationAt=clock;
    parameter(acoustic?.gain,lastMix.acousticGain,clock,immediate?0:SOURCE_REST_COUPERIN_BLEND.rampSeconds);
    parameter(electronic?.gain,lastMix.electronicGain,clock,immediate?0:SOURCE_REST_COUPERIN_BLEND.rampSeconds);
    parameter(acousticPan?.pan,space?.acousticPan??0,clock,immediate?0:SOURCE_REST_COUPERIN_BLEND.rampSeconds);
    parameter(electronicPan?.pan,space?.electronicPan??0,clock,immediate?0:SOURCE_REST_COUPERIN_BLEND.rampSeconds);
  }
  function create(pair){
    const ctx=pair?.ctx||pair?.context,out=pair?.destination||pair?.musicGain;
    if(!ctx||!out||typeof ctx.createMediaElementSource!=='function'||typeof ctx.createChannelSplitter!=='function')throw Error('Aligned Couperin playback is unavailable.');
    const media=createElement();if(!media?.play||!media?.pause)throw Error('Streaming audio is unavailable.');
    context=ctx;destination=out;element=media;
    media.preload='auto';media.loop=false;media.src=urlFor(SOURCE_REST_COUPERIN_URL);
    source=track(ctx.createMediaElementSource(media));splitter=track(ctx.createChannelSplitter(2));
    acoustic=track(ctx.createGain());electronic=track(ctx.createGain());programme=track(ctx.createGain());programmeDuck=track(ctx.createGain());outputGate=track(ctx.createGain());programmeDuck.connect(outputGate);
    acoustic.channelCount=electronic.channelCount=1;acoustic.channelCountMode=electronic.channelCountMode='explicit';
    source.connect(splitter);splitter.connect(acoustic,0);splitter.connect(electronic,1);
    if(ctx.createStereoPanner){acousticPan=track(ctx.createStereoPanner());electronicPan=track(ctx.createStereoPanner());acoustic.connect(acousticPan);electronic.connect(electronicPan);acousticPan.connect(programme);electronicPan.connect(programme);}
    else{acoustic.connect(programme);electronic.connect(programme);}
    const dry=track(ctx.createGain());dry.gain.value=SOURCE_REST_COUPERIN_MIX.dry;programme.connect(dry);dry.connect(programmeDuck);
    if(ctx.createConvolver&&ctx.createBuffer){
      convolver=track(ctx.createConvolver());wet=track(ctx.createGain());
      impulse=createStandingTearImpulse(ctx,{decaySeconds:SOURCE_REST_COUPERIN_MIX.reverbSeconds});
      convolver.normalize=false;convolver.buffer=impulse;wet.gain.value=SOURCE_REST_COUPERIN_MIX.wet;
      programme.connect(convolver);convolver.connect(wet);wet.connect(programmeDuck);
    }
    if(ctx.createAnalyser){analyser=track(ctx.createAnalyser());analyser.fftSize=1024;samples=new Float32Array(1024);outputGate.connect(analyser);analyser.connect(out);}
    else outputGate.connect(out);
    outputGate.gain.value=0;applyMix(true);transport.bind();
    const done=()=>{if(desired){measureProgress({ending:true});ended=true;playing=false;pending=false;completedFirstCycle=true;transport.resetSampling();}};
    const error=()=>fail(Error(media.error?.message||'The Couperin recording could not be loaded.'));
    const wait=()=>{buffering=true;parameter(outputGate?.gain,0,at(),0);transport.resetSampling();};
    const flow=()=>{buffering=false;if(desired&&!held&&!protectedNow()){parameter(outputGate?.gain,1,at(),.025);transport.resetSampling();}};
    const seek=()=>{parameter(outputGate?.gain,0,at(),0);transport.resetSampling();};
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
    if(element.ended){ended=true;playing=false;completedFirstCycle=true;return false;}
    if(convolver&&!convolver.buffer&&impulse)convolver.buffer=impulse;
    applyMix();
    if(playing&&!element.paused){measureProgress();transport.applyRate();if(!buffering&&!element.seeking)parameter(outputGate?.gain,1,at(),.025);return true;}
    if(pending)return false;
    const media=element,serial=version;pending=true;
    let request;try{request=media.play();}catch(error){pending=false;fail(error);return false;}
    Promise.resolve(request).then(()=>{
      if(serial!==version||media!==element||disposed)return;pending=false;
      if(held||!desired||protectedNow()){pause();return;}
      playing=!media.paused;transport.resetSampling();measureProgress();if(playing&&!buffering)parameter(outputGate?.gain,1,at(),.025);
    }).catch(error=>{if(serial!==version||disposed)return;pending=false;if(error?.name==='AbortError'){playing=false;return;}fail(error);});
    return false;
  }
  function start(){if(disposed)return false;if(!desired){desired=true;failed=null;held=false;ended=false;finishAtEnd=false;playedSeconds=0;completedFirstCycle=false;}reconcile();return !failed;}
  function update({active,paused=false,progress:next=progress,faculty:nextFaculty=faculty,spatialState:nextState=spatialState,acousticFrame:nextFrame=spatialFrame}={}){
    if(active===false){stop();return snapshot();}progress=clamp(next);faculty=nextFaculty==null?null:clamp(nextFaculty);spatialState=nextState;spatialFrame=nextFrame;held=!!paused;reconcile();return snapshot();
  }
  function finishAfterCycle(){if(disposed||!desired||ended)return false;finishAtEnd=true;if(element)element.loop=false;return true;}
  function stop(){desired=false;held=false;detach();transport.reset();failed=null;ended=false;finishAtEnd=false;playedSeconds=0;completedFirstCycle=false;buffering=false;progress=0;faculty=null;signal=0;lastMix=null;blendAmount=0;lastMixClock=lastAutomationAt=spatialState=spatialFrame=null;return true;}
  function dispose(){if(disposed)return false;stop();disposed=true;return true;}
  function snapshot(){
    const protect=protectedNow(),audible=!!(playing&&element&&!element.paused&&!held&&!protect&&!buffering&&!element.seeking&&!ended);
    if(audible&&analyser&&samples){try{analyser.getFloatTimeDomainData(samples);signal=clamp(Math.sqrt(samples.reduce((s,x)=>s+x*x,0)/samples.length)*8);}catch{signal=0;}}else signal=0;
    return {active:desired,playing:audible,paused:!!(desired&&(held||protect)),holding:!!(desired&&(held||protect)),protected:protect,
      ...transport.snapshot(),audioTime:Number(context?.currentTime)||0,currentTime:Number.isFinite(element?.currentTime)?element.currentTime:null,duration:Number.isFinite(element?.duration)?element.duration:null,
      playedSeconds,audibleSeconds:playedSeconds,ended,finishAtEnd,completedFirstPass:completedFirstCycle,completedFirstCycle,
      loading:!!(desired&&!failed&&!ended&&!audible&&!held&&!protect),pending,buffering,failed,disposed,loop:!!element?.loop,signal,
      atmosphere:!!convolver,reverbSeconds:convolver?SOURCE_REST_COUPERIN_MIX.reverbSeconds:0,
      revoicing:{...lastMix,progress,faculty,sampleLocked:!!splitter,sourceChannels:2,voices:'user-edited Live electronic revoicing'}};
  }
  return Object.freeze({start,update,pause,finishAfterCycle,stop,dispose,snapshot,
    setPlaybackRate:(value,options)=>{if(disposed)return false;measureProgress();return transport.setPlaybackRate(value,options);},
    setProgrammeDuck:(value,options)=>disposed?false:transport.setProgrammeDuck(value,options)});
}
