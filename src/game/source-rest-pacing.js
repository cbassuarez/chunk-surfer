// Music positions stay in performed source seconds; reading uses eligible
// listening seconds, independently of the pitch-preserving transport rate.
export const SOURCE_REST_BLACK_CUE_SECONDS=510;
export const SOURCE_REST_BLACK_PROGRESS=.96;
export const SOURCE_REST_CUES=Object.freeze({arrival:0,ornaments:.15,organ:.28,voice:.42,distance:.56,return:.73,last:.96});
export const SOURCE_REST_CATCH_CLOCK_OPTIONS=Object.freeze({blackCueRatio:.72,majorEndRatio:.78,minimumLeadRatio:.61,
  afterBlack:35,fallbackDuration:843.157125});
export const SOURCE_REST_TEMPO=Object.freeze({minimum:.96,walkingStart:.98,walkingEnd:.96,seatedMinimum:1,maximum:1,changePerSecond:.12});
const limit=(n,a,b)=>Math.max(a,Math.min(b,n)),numeric=n=>typeof n==='number'&&Number.isFinite(n);
const smooth=x=>{const p=limit(x,0,1);return p*p*(3-2*p);};
const relative=(ratio,seconds,length)=>numeric(ratio)?limit(ratio,0,1)*length:seconds;
const phaseOptions=phase=>phase==='catch'?SOURCE_REST_CATCH_CLOCK_OPTIONS:{};
function profile(options={},length){return{
  cue:limit(relative(options.blackCueRatio,options.blackCue??510,length),0,length),
  majorEnd:limit(relative(options.majorEndRatio,options.majorEnd??550,length),0,length),
  lead:Math.max(1,relative(options.minimumLeadRatio,options.minimumLead??435,length)),
  tail:Math.max(1,Number(options.afterBlack)||35),
};}

// A recommendation, never a seek or another pass. Arbitrarily late arrival
// cannot be made to fit by a moderate rate: report that budget honestly.
export function planSourceRestTempo({phase='wrong-return',currentTime=0,duration=phase==='catch'?843.157125:716.4,
  progress=0,seated=false,nearSeat=false,finishing=false,decisionHeld=false,pitchPreserving=true,clockOptions=null}={}){
  const length=numeric(duration)&&duration>0?duration:phase==='catch'?843.157125:716.4,
    position=limit(Number(currentTime)||0,0,length),p=limit(Number(progress)||0,0,1),
    // Reading at the bench never slows the performance. A late readable arc
    // must use the existing post-performance tail rather than inventing time.
    score=profile(clockOptions||phaseOptions(phase),length),minimum=1,
    remaining=score.lead*limit((SOURCE_REST_BLACK_PROGRESS-p)/SOURCE_REST_BLACK_PROGRESS,0,1),
    reserve=score.tail*minimum,latest=Math.max(position,length-reserve);
  let target=score.cue,mode='preferred';
  if(target-position<remaining*minimum){
    if(score.majorEnd-position>=remaining*minimum){target=Math.max(target,position+remaining*minimum);mode='within-major';}
    else{target=Math.min(latest,Math.max(position,position+remaining*minimum));mode='late-arrival';}
  }
  if(position>=length){target=length;mode='finished';}
  const walking=SOURCE_REST_TEMPO.walkingStart
    -(SOURCE_REST_TEMPO.walkingStart-SOURCE_REST_TEMPO.walkingEnd)*smooth(position/(length*.6));
  const unity=seated||nearSeat||finishing||position>=length,requestedRate=unity?1:walking;
  return{rate:pitchPreserving===false?1:requestedRate,requestedRate,pitchPreserving:pitchPreserving!==false,
    mode:position>=length?'finished':finishing?'finishing':seated?mode:nearSeat?'near-seat':'walking',targetPlayhead:target,minimumRemainingSeconds:remaining,
    sourceRemainingSeconds:Math.max(0,length-position),
    budgetExhausted:remaining>0&&length-position+1e-7<remaining*minimum+reserve,
    fallback:pitchPreserving===false?'PITCH_PRESERVATION_UNAVAILABLE':null};
}

// Same-phase revisits retain the unread graph's clock, not the elapsed walk
// away. Natural completion owns an explicit active tail, not a playing-only
// deadlock or a hidden restart. The caller retains each actual dialogue line.
export function createSourceRestClock(getMusicState,options={}){
  const restored=options.resumeFrom||{},afterBlack=Math.max(1,Number(options.afterBlack)||35);
  let heard=Math.max(0,Number(restored.heardSeconds)||0),progress=limit(Number(restored.progress)||0,0,1),
    held=!!restored.held,tailSeconds=Math.max(0,Number(restored.tailSeconds)||0,
      (progress-SOURCE_REST_BLACK_PROGRESS)/(1-SOURCE_REST_BLACK_PROGRESS)*afterBlack),
    lastPlayed=null,lastWall=null,untilBlack=null,duration=null,failed=false,presentationTail=false,flowing=false,
    latest=null,plan=null,anchorProgress=progress,segmentSeconds=0,segmentSource=0,minimumRemaining=0,sourceBudget=0,initialised=false;
  function beginSegment(media){
    const length=numeric(media?.duration)&&media.duration>0?media.duration:options.fallbackDuration||716.4;
    duration=length;anchorProgress=progress;segmentSeconds=0;segmentSource=0;
    const position=numeric(media?.currentTime)?media.currentTime:media?.ended?length:0;
    plan=planSourceRestTempo({currentTime:position,duration:length,progress,seated:true,
      pitchPreserving:media?.tempoSupported??media?.pitchPreservationSupported,clockOptions:options});
    minimumRemaining=plan.minimumRemainingSeconds;sourceBudget=Math.max(0,plan.targetPlayhead-position);
    const rate=numeric(media?.playbackRate)&&media.playbackRate>0?media.playbackRate:1;
    untilBlack=progress>=SOURCE_REST_BLACK_PROGRESS?heard:heard+Math.max(minimumRemaining,sourceBudget/rate,1);
    initialised=true;
  }
  function update(dt=0){
    let media;try{media=getMusicState?.()||{};}catch(error){media={failed:String(error?.message||error)};}latest=media;
    failed||=!!media.failed;presentationTail||=media.ended===true;
    const eligible=!media.paused&&!media.protected&&!media.buffering&&!media.seeking;
    flowing=eligible&&(failed||presentationTail||media.playing===true);
    const played=media.playedSeconds,wall=media.audibleWallSeconds??media.playedWallSeconds;
    if(!initialised&&flowing&&(failed||presentationTail||numeric(played)&&numeric(media.currentTime)&&numeric(media.duration)&&media.duration>0)){
      beginSegment(media);lastPlayed=numeric(played)?played:null;lastWall=numeric(wall)?wall:null;
      if(!failed)return snapshot();
    }
    if(!initialised){flowing=false;return snapshot();}
    let sourceDelta=0,delta=0;
    if(numeric(played)){
      if(lastPlayed!==null&&played>=lastPlayed&&flowing&&!presentationTail)sourceDelta=played-lastPlayed;
      lastPlayed=played;
    }
    if(presentationTail){if(flowing)delta=Math.min(.25,Math.max(0,Number(dt)||0));}
    else if(failed){if(flowing)delta=Math.max(0,Number(dt)||0);}
    else if(numeric(wall)){
      if(lastWall!==null&&wall>=lastWall&&flowing)delta=wall-lastWall;
    }else if(flowing){const rate=numeric(media.playbackRate)&&media.playbackRate>0?media.playbackRate:1;delta=sourceDelta/rate;}
    if(numeric(wall))lastWall=wall;
    if(initialised&&flowing){
      heard+=delta;
      if(!held){
        if(progress<SOURCE_REST_BLACK_PROGRESS){
          segmentSeconds+=delta;segmentSource+=sourceDelta;
          const readable=minimumRemaining>0?limit(segmentSeconds/minimumRemaining,0,1):1,
            musical=presentationTail?1:failed?limit(segmentSeconds/Math.max(minimumRemaining,sourceBudget),0,1)
              :sourceBudget>0?limit(segmentSource/sourceBudget,0,1):1;
          progress=Math.max(progress,anchorProgress+(SOURCE_REST_BLACK_PROGRESS-anchorProgress)*Math.min(readable,musical));
          if(progress>=SOURCE_REST_BLACK_PROGRESS-1e-9){progress=SOURCE_REST_BLACK_PROGRESS;untilBlack=heard;}
        }else{tailSeconds+=delta;progress=Math.max(progress,SOURCE_REST_BLACK_PROGRESS+(1-SOURCE_REST_BLACK_PROGRESS)*limit(tailSeconds/afterBlack,0,1));}
      }
    }
    return snapshot();
  }
  function hold(){held=true;return snapshot();}
  function resume(){if(!held)return snapshot();held=false;if(initialised)beginSegment(latest||{});return snapshot();}
  // Only a real natural end can release a now-impossible musical cue gate.
  // Readable lines and choices remain under the transcript's ordinary owner.
  function advanceTailCue(value){
    const next=limit(Number(value)||0,0,1);
    if(presentationTail&&flowing&&!held&&next>progress){progress=next;if(initialised)beginSegment(latest||{});}
    return snapshot();
  }
  function checkpoint(){return{version:1,progress,heardSeconds:heard,held,tailSeconds};}
  function snapshot(){const recommendation=latest&&duration?planSourceRestTempo({currentTime:latest.currentTime,duration,progress,seated:true,decisionHeld:held,
    pitchPreserving:latest.tempoSupported??latest.pitchPreservationSupported,clockOptions:options}):plan;
    return{progress,heardSeconds:heard,untilBlack,duration,failed,held,flowing,presentationTail,
      cueMode:plan?.mode||null,targetPlayhead:plan?.targetPlayhead??null,budgetExhausted:!!recommendation?.budgetExhausted,tempoPlan:recommendation?{...recommendation}:null};}
  return Object.freeze({update,snapshot,hold,resume,advanceTailCue,checkpoint});
}
