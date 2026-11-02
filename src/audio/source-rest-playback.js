import {SOURCE_REST_TEMPO} from '../game/source-rest-pacing.js';
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0));
export const SOURCE_REST_AUDIBLE_RATE_STEP=.001;
// Shared control for the two single-decoder scores. It never plays, seeks or
// resumes a context. Counters distinguish performed seconds from listening
// wall time, including WebKit's coarse batches of media positions.
export function createSourceRestPlayback({getMedia,getContext,getOutputGain=()=>null}={}){
  let media=null,pitch=null,tempoSupported=true,fallback=null,requested=1,actual=1,controlRate=1,duck=1,
    last=null,rateAt=null,playedSeconds=0,audibleWallSeconds=0;
  let duckTargets=new WeakMap();
  const now=()=>Math.max(0,Number(getContext?.()?.currentTime)||0);
  function duckTo(seconds=.08,{force=false}={}){const p=getOutputGain?.()?.gain;if(!p)return;
    const initialized=duckTargets.has(p);
    // Repeating the return target must leave its existing ramp running.
    // Weak keys cannot retain a retired context's AudioParams. A new output
    // parameter receives the actual intended level before it becomes audible.
    if(!force&&initialized&&duckTargets.get(p)===duck)return;
    if(force||!initialized)seconds=0;
    const at=now();try{p.cancelAndHoldAtTime?.(at);if(!p.cancelAndHoldAtTime){p.cancelScheduledValues?.(at);p.setValueAtTime?.(p.value,at);}
      if(seconds>0&&p.linearRampToValueAtTime)p.linearRampToValueAtTime(duck,at+seconds);else if(p.setValueAtTime)p.setValueAtTime(duck,at);else p.value=duck;
    }catch{p.value=duck;}duckTargets.set(p,duck);}
  function bind(){
    const next=getMedia?.();if(!next||next===media)return;
    media=next;last=null;rateAt=null;pitch=false;tempoSupported=true;fallback=null;
    for(const key of ['preservesPitch','webkitPreservesPitch','mozPreservesPitch'])if(key in media){try{media[key]=true;if(media[key]===true)pitch=true;}catch{}}
    if(!pitch)fallback='PITCH_PRESERVATION_UNAVAILABLE';
    applyRate(true);duckTo(0,{force:true});
  }
  function applyRate(immediate=false){
    if(!media)return;
    const target=pitch&&tempoSupported?requested:1,at=now(),dt=rateAt===null?0:Math.max(0,Math.min(.25,at-rateAt));
    const observed=Number(media.playbackRate);
    if(observed>0&&Math.abs(observed-actual)>1e-7)controlRate=observed;
    actual=observed>0?observed:actual;
    const step=SOURCE_REST_TEMPO.changePerSecond*dt,
      next=immediate||!pitch||!tempoSupported?target:controlRate+clamp(target-controlRate,-step,step);
    controlRate=clamp(next,SOURCE_REST_TEMPO.minimum,1);
    // Keep the slew's fractional remainder so rounding cannot stall it at
    // high frame rates. Only the audible assignment is quantized to0.1%:
    // the distant planner's microscopic changes must not rebuild WebKit's
    // time stretcher on every frame. Unity remains exactly1 immediately.
    const value=clamp(Math.round(controlRate/SOURCE_REST_AUDIBLE_RATE_STEP)*SOURCE_REST_AUDIBLE_RATE_STEP,SOURCE_REST_TEMPO.minimum,1);
    // WebKit can reconfigure time stretching on assignment even if the
    // number is unchanged. Stable targets (especially unity at the seat)
    // must not keep writing the media transport every rendered frame.
    try{if(Math.abs(actual-value)>1e-7)media.playbackRate=value;actual=Number(media.playbackRate)||value;
      if(Math.abs(actual-value)>.001){tempoSupported=false;fallback='RATE_UNAVAILABLE';media.playbackRate=1;actual=controlRate=1;}}
    catch{tempoSupported=false;fallback='RATE_UNAVAILABLE';try{media.playbackRate=1;}catch{}actual=controlRate=1;}
    if(last&&Math.abs(last.at-at)<1e-7)last.rate=actual;
    rateAt=at;
  }
  function sample({eligible=false,ended=false}={}){
    bind();if(!media||!eligible){last=null;return snapshot();}
    const at=now(),position=Number(media.currentTime),duration=Number(media.duration),rate=Number(media.playbackRate)||actual;
    if(!Number.isFinite(position)||!Number.isFinite(duration)||duration<=0){last=null;return snapshot();}
    if(last&&at>=last.at&&position>=last.position){
      const dt=at-last.at,advance=position-last.position,expected=dt*last.rate,tolerance=Math.max(.35,expected*.02),
        atEnd=(ended||media.ended===true)&&position>=duration-.05;
      if(Math.abs(advance-expected)<=tolerance||atEnd&&advance<=expected+tolerance){
        playedSeconds+=advance;
        audibleWallSeconds+=atEnd?Math.min(dt,advance/Math.max(.01,last.rate)):dt;
      }
    }
    last={at,position,rate};return snapshot();
  }
  function setPlaybackRate(value,{immediate=false}={}){requested=clamp(value,SOURCE_REST_TEMPO.minimum,1);bind();applyRate(immediate);return snapshot();}
  function setProgrammeDuck(value,{seconds=.08}={}){duck=typeof value==='number'&&Number.isFinite(value)?clamp(value):1;duckTo(Math.max(0,Number(seconds)||0));return snapshot();}
  function resetSampling(){last=null;rateAt=now();}
  function reset(){media=null;pitch=null;tempoSupported=true;fallback=null;requested=actual=controlRate=duck=1;last=null;rateAt=null;playedSeconds=audibleWallSeconds=0;duckTargets=new WeakMap();}
  function snapshot(){return{playbackRate:actual,requestedPlaybackRate:requested,pitchPreservationSupported:pitch,
    tempoSupported:pitch===null?null:!!pitch&&tempoSupported,tempoFallback:fallback,programmeDuck:duck,programmeDuckSupported:!!getOutputGain?.(),playedSeconds,audibleWallSeconds,playedWallSeconds:audibleWallSeconds};}
  return Object.freeze({bind,applyRate,sample,setPlaybackRate,setProgrammeDuck,resetSampling,reset,snapshot});
}
