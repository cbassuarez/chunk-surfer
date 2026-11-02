import {createStaticTexture,STATIC_TEXTURE} from './static-texture.js';
const finite=(n,d=0)=>Number.isFinite(Number(n))?Number(n):d;
const clamp=n=>Math.max(0,Math.min(1,finite(n)));
const smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
export const ENDING_STATIC=Object.freeze({windowSeconds:60,maxGain:.14,releaseSeconds:4,tickMs:20});
export function endingStaticFrame({currentTime=0,duration=0,windowSeconds=ENDING_STATIC.windowSeconds,releaseAge=null,releaseSeconds=ENDING_STATIC.releaseSeconds,releaseToGain=0}={}){
  const length=Math.max(0,finite(duration)),position=Math.max(0,finite(currentTime)),start=Math.max(0,length-windowSeconds),u=length>0?smooth((position-start)/Math.max(.001,length-start)):0;
  const release=releaseAge===null?1:1-clamp(releaseAge/Math.max(.01,releaseSeconds));
  return{start,progress:u,dryMix:1-u,filteredMix:u,programmeGain:(1-u)**2,cutoffHz:450+19550*(1-u)**2,
    staticGain:releaseAge===null?ENDING_STATIC.maxGain*Math.pow(u,.7):releaseToGain+(ENDING_STATIC.maxGain*Math.pow(u,.7)-releaseToGain)*release,
    phase:releaseAge!==null?(release>0?'releasing':'spent'):u>=1?'holding-credits':u>0?'consuming':'waiting'};
}
/** Neutral bridge, ending-scoped carrier. Place input after the final limiter,
 * destination at the global output gain. Static bypasses programme attenuation
 * but still respects global mute and SFX settings. No parallel dry route. */
export function createEndingStaticMix({context:ctx,destination,getState=()=>({}),getSfxLevel=()=>1,onFinished=()=>{},
  windowSeconds=ENDING_STATIC.windowSeconds,scheduleTimer=fn=>setInterval(fn,ENDING_STATIC.tickMs),cancelTimer=clearInterval,makeTexture=createStaticTexture}={}){
  if(!ctx||!destination)return null;
  const input=ctx.createGain(),dry=ctx.createGain(),filter=ctx.createBiquadFilter(),filtered=ctx.createGain(),programme=ctx.createGain();filter.type='lowpass';filter.frequency.value=20000;filter.Q.value=.45;programme.gain.value=1;dry.gain.value=1;filtered.gain.value=0;
  input.connect(dry).connect(programme).connect(destination);input.connect(filter).connect(filtered).connect(programme);
  let texture=null,timer=null,disposed=false,held=false,releaseAge=null,releaseSeconds=ENDING_STATIC.releaseSeconds,
    lastAt=null,lastFrame=endingStaticFrame(),eligible=false,carriers=0,mediaEnded=false,finishRequested=false,releaseScheduled=false,completed=false,failure=null,failureFrame=null,menuHandoff=false,transferred=false;
  const set=(p,value,tau=.045)=>{const at=finite(ctx.currentTime);if(p.cancelAndHoldAtTime)p.cancelAndHoldAtTime(at);else p.cancelScheduledValues?.(at);if(p.setTargetAtTime)p.setTargetAtTime(value,at,tau);else if(p.setValueAtTime)p.setValueAtTime(value,at);else p.value=value;};
  const stopTimer=()=>{if(timer!==null){cancelTimer(timer);timer=null;}};
  function reset(){eligible=false;held=false;releaseAge=null;lastAt=null;mediaEnded=false;finishRequested=false;releaseScheduled=false;completed=false;failure=null;failureFrame=null;menuHandoff=false;transferred=false;stopTimer();texture?.dispose();texture=null;set(programme.gain,1,.06);set(dry.gain,1,.06);set(filtered.gain,0,.06);lastFrame=endingStaticFrame();}
  function hold(){if(!held){if(releaseAge!==null&&lastAt!==null)releaseAge+=Math.max(0,finite(ctx.currentTime)-lastAt);texture?.cancelFade?.();}held=true;releaseScheduled=false;lastAt=null;texture?.mute(true);}
  function update(){
    if(disposed)return false;let state;try{state=getState()||{};}catch{hold();return false;}
    if(transferred)return false;
    if(!state.eligible){if(eligible||texture)reset();return false;}eligible=true;
    const at=finite(ctx.currentTime),position=finite(state.currentTime),duration=finite(state.duration);
    if(state.failed&&!failure){
      failure=String(state.failed?.message||state.failed);failureFrame={...lastFrame,staticGain:texture?lastFrame.staticGain:0};
      finishRequested=true;releaseAge=0;releaseScheduled=false;lastAt=at;
    }
    if(duration<=0&&!failure){hold();return false;}
    const actualHold=state.paused||state.hidden||state.protected||ctx.state!=='running';
    if(actualHold||!failure&&(state.buffering||state.seeking||(!state.playing&&!state.ended))){hold();return false;}
    held=false;if(!failure)mediaEnded=mediaEnded||!!state.ended||position>=duration;
    if(failure||mediaEnded&&finishRequested){if(releaseAge===null)releaseAge=0;else if(lastAt!==null)releaseAge+=Math.max(0,at-lastAt);}
    lastAt=at;
    lastFrame=failure?{...failureFrame,staticGain:failureFrame.staticGain*(1-clamp(releaseAge/releaseSeconds)),phase:releaseAge>=releaseSeconds?'spent':'failed-release'}:
      endingStaticFrame({currentTime:mediaEnded?duration:position,duration,releaseAge,releaseSeconds,windowSeconds,releaseToGain:menuHandoff?STATIC_TEXTURE.menuGain:0});
    if(lastFrame.phase==='spent'){
      if(!completed){completed=true;if(!menuHandoff||failure){texture?.dispose();texture=null;}else{lastFrame.phase='front-end-ready';texture?.setLevel(STATIC_TEXTURE.menuGain,.015);}stopTimer();set(programme.gain,1,.06);set(dry.gain,1,.06);set(filtered.gain,0,.06);try{onFinished();}catch{}}
      if(menuHandoff&&!failure&&texture)lastFrame.phase='front-end-ready';
      return true;
    }
    if(lastFrame.programmeGain===0){programme.gain.cancelScheduledValues?.(at);programme.gain.setValueAtTime?.(0,at);}else set(programme.gain,lastFrame.programmeGain);
    set(dry.gain,lastFrame.dryMix);set(filtered.gain,lastFrame.filteredMix);set(filter.frequency,lastFrame.cutoffHz,.1);
    if(lastFrame.staticGain>0&&!texture){texture=makeTexture({context:ctx,destination,gain:0,seed:STATIC_TEXTURE.seed});carriers++;}
    texture?.setOutputLevel(clamp(getSfxLevel()));
    if(releaseAge===null)texture?.setLevel(lastFrame.staticGain,.06);
    else if(texture&&!releaseScheduled){texture.fadeTo({seconds:Math.max(.001,releaseSeconds-releaseAge),level:lastFrame.staticGain,to:menuHandoff&&!failure?STATIC_TEXTURE.menuGain:0});releaseScheduled=true;}
    if(timer===null){timer=scheduleTimer(update);timer?.unref?.();}
    return true;
  }
  function finish({seconds=ENDING_STATIC.releaseSeconds,toMenu=false}={}){finishRequested=true;menuHandoff=menuHandoff||!!toMenu;releaseSeconds=Math.max(.05,Math.min(20,finite(seconds,ENDING_STATIC.releaseSeconds)));update();return true;}
  function takeCarrier(){
    if(disposed||!texture)return null;
    const next=texture;texture=null;transferred=true;stopTimer();next.cancelFade();
    set(programme.gain,1,.06);set(dry.gain,1,.06);set(filtered.gain,0,.06);
    return next;
  }
  return Object.freeze({input,update,hold,finish,reset,takeCarrier,snapshot:()=>({eligible,held,mediaEnded,finishRequested,releaseAge,completed,failure,menuHandoff,transferred,...lastFrame,carrier:texture?.snapshot?.()||null,carriers}),
    dispose(){if(disposed)return;reset();disposed=true;for(const node of[input,dry,filter,filtered,programme])try{node.disconnect();}catch{}}});
}
