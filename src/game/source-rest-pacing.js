// The D-major passage is inferred from measured pitch classes in this exact
// recording (conservatively 361–554 s). The listening/score review still owns
// the final musical judgement; these cues are explicit and inspectable.
export const SOURCE_REST_BLACK_CUE_SECONDS=510;
export const SOURCE_REST_BLACK_PROGRESS=.96;
export const SOURCE_REST_CUES=Object.freeze({arrival:0,ornaments:.15,organ:.28,voice:.42,distance:.56,return:.73,last:.96});
// Source III shares the same clock owner, with its own full-length recording.
// Ratios resolve against the audible source duration, never a frame estimate.
export const SOURCE_REST_CATCH_CLOCK_OPTIONS=Object.freeze({blackCueRatio:.72,majorEndRatio:.78,minimumLeadRatio:.61,
  afterBlack:35,fallbackDuration:843.157125});
const limit=(n,a,b)=>Math.max(a,Math.min(b,n));
const numeric=n=>typeof n==='number'&&Number.isFinite(n);

/** A sitting has one audible clock and never asks the track to start again.
 * A late arrival may miss the preferred musical cue. Keep the whole readable
 * encounter and report that tradeoff, rather than waiting an extra full pass.
 * A deliberate decision can hold the narrative while the recording continues. */
export function createSourceRestClock(getMusicState,{blackCue=SOURCE_REST_BLACK_CUE_SECONDS,majorEnd=550,minimumLead=435,afterBlack=35,
  blackCueRatio=null,majorEndRatio=null,minimumLeadRatio=null,fallbackDuration=716.4}={}){
  let heard=0,last=null,untilBlack=null,duration=null,failed=false,progress=0,
    anchorHeard=0,anchorProgress=0,held=false,cueMode=null,targetPlayhead=null,latest=null;
  const relative=(ratio,seconds,length)=>numeric(ratio)?limit(ratio,0,1)*length:seconds,
    leadFor=length=>relative(minimumLeadRatio,minimumLead,length);
  function schedule(position,length,minimumRemaining){
    const cue=limit(Number(relative(blackCueRatio,blackCue,length))||0,0,Math.max(0,length-.01)),
      end=limit(Number(relative(majorEndRatio,majorEnd,length))||cue,cue,Math.max(cue,length-.01));
    const preferred=cue-position;
    let remaining;
    if(preferred>=minimumRemaining){remaining=preferred;cueMode='preferred';}
    else if(end-position>=minimumRemaining){remaining=minimumRemaining;cueMode='within-major';}
    else{remaining=minimumRemaining;cueMode='late-arrival';}
    anchorHeard=heard;anchorProgress=progress;untilBlack=heard+Math.max(1,remaining);
    targetPlayhead=((position+remaining)%length+length)%length;
  }
  function update(dt=0){
    let media;try{media=getMusicState?.();}catch(error){media={failed:String(error?.message||error)};}
    latest=media;
    const playing=!!media?.playing&&!media?.paused&&!media?.protected;
    const played=media?.playedSeconds,position=media?.currentTime,length=media?.duration;
    if(untilBlack===null&&playing&&numeric(played)&&numeric(position)&&numeric(length)&&length>0){
      duration=length;schedule(position,length,leadFor(length));last=played;
    }
    if(untilBlack!==null&&numeric(played)){
      if(last===null||played<last)last=played;
      else{if(playing)heard+=played-last;last=played;}
    }
    // Loading and a held/paused track cannot invent musical progress. A real
    // error permits an escapable fallback, with its state explicitly reported.
    if(media?.failed){failed=true;if(untilBlack===null){duration=numeric(fallbackDuration)&&fallbackDuration>0?fallbackDuration:716.4;
      schedule(0,duration,leadFor(duration));last=numeric(played)?played:null;}heard+=Math.max(0,Number(dt)||0);}
    if(untilBlack!==null&&!held){
      const span=Math.max(.01,untilBlack-anchorHeard),first=anchorProgress+(SOURCE_REST_BLACK_PROGRESS-anchorProgress)*limit((heard-anchorHeard)/span,0,1);
      const tail=(1-SOURCE_REST_BLACK_PROGRESS)*limit((heard-untilBlack)/Math.max(1,afterBlack),0,1);
      progress=Math.max(progress,first+tail);
    }
    return snapshot();
  }
  function hold(){held=true;return snapshot();}
  function resume(){
    if(!held)return snapshot();held=false;
    const position=latest?.currentTime,length=latest?.duration;
    const remaining=leadFor(numeric(length)&&length>0?length:duration||716.4)*limit((SOURCE_REST_BLACK_PROGRESS-progress)/SOURCE_REST_BLACK_PROGRESS,0,1);
    // Keep the already chosen end if it still leaves readable room. Crossing
    // a natural media loop must not accidentally aim at another 510s cue.
    const planned=untilBlack===null?null:untilBlack-heard;
    if(numeric(planned)&&planned+1e-7>=remaining){anchorHeard=heard;anchorProgress=progress;}
    else if(numeric(position)&&numeric(length)&&length>0)schedule(position,length,remaining);
    else{anchorHeard=heard;anchorProgress=progress;untilBlack=heard+Math.max(1,remaining);cueMode=failed?'failed':'late-arrival';}
    return snapshot();
  }
  function snapshot(){return{progress,heardSeconds:heard,untilBlack,duration,failed,held,cueMode,targetPlayhead};}
  return Object.freeze({update,snapshot,hold,resume});
}
