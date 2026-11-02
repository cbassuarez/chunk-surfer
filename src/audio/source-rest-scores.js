import {createSourceRestMusic} from './source-rest-music.js';
import {createSourceRestCouperin} from './source-rest-couperin.js';
import {planSourceRestTempo} from '../game/source-rest-pacing.js';

const PHASES=Object.freeze(['wrong-return','catch']);
const clamp=value=>Math.max(0,Math.min(1,Number(value)||0));

/** One selected score owner survives scene -> black -> credits handoff.
 * Factory injection is for focused tests; ordinary callers pass the same
 * audio/lifecycle options used by createSourceRestMusic.
 */
export function createSourceRestScores({createBach=createSourceRestMusic,
  createCouperin=createSourceRestCouperin,...options}={}){
  const bach=createBach(options),couperin=createCouperin(options);
  const scores={'wrong-return':bach,catch:couperin};
  let phase='wrong-return',restActive=false,nearSeat=false,progress=0,faculty=null,endingCommitted=false,
    wanted=false,held=false,disposed=false,handoffPending=false,decisionHeld=false,programmeDuck=1,rateOverride=null,tempoPlan=null,lastRate=null;
  const current=()=>scores[phase];
  const noErrorColour=()=>bach.setAfflictionActive?.(false);
  noErrorColour();
  const supportsPhase=value=>PHASES.includes(value);
  function applyTempo({immediate=false}={}){
    const state=current().snapshot();
    const unity=restActive||nearSeat||endingCommitted||state.ended===true||state.completedFirstPass===true;
    tempoPlan=planSourceRestTempo({phase,currentTime:state.currentTime,duration:state.duration,progress,seated:restActive,nearSeat,finishing:endingCommitted,decisionHeld,
      pitchPreserving:state.tempoSupported??state.pitchPreservationSupported??true});
    const rate=unity?1:rateOverride??tempoPlan.rate;
    const forceUnity=unity&&Number.isFinite(state.playbackRate)&&Math.abs(state.playbackRate-1)>1e-7;
    const forceImmediate=immediate&&Number.isFinite(state.playbackRate)&&Math.abs(state.playbackRate-rate)>1e-7;
    if(lastRate!==rate||forceUnity||forceImmediate){current().setPlaybackRate?.(rate,{immediate:immediate||unity});lastRate=rate;}
    return tempoPlan;
  }
  function snapshot(){const state=current().snapshot();return {...state,phase,restActive,nearSeat,decisionHeld,endingCommitted,tempoPlan:tempoPlan?{...tempoPlan}:null,
    restProgress:progress,faculty,disposed:disposed||!!state.disposed};}
  function setRestProgress(value,active,{faculty:nextFaculty=null,decisionHeld:nextDecisionHeld=false,nearSeat:nextNearSeat=false}={}){
    if(disposed)return snapshot();
    progress=clamp(value);restActive=!!active;nearSeat=!!nextNearSeat;decisionHeld=!!nextDecisionHeld;faculty=nextFaculty==null?null:clamp(nextFaculty);
    // active here means seated, not permission to stop/start the performance.
    // Preserve a lifecycle hold while changing its timbral interpretation.
    noErrorColour();applyTempo();current().update({progress,faculty,paused:held});return snapshot();
  }
  function selectPhase(value){
    if(disposed||!supportsPhase(value)||value===phase)return false;
    current().stop();phase=value;restActive=false;nearSeat=false;endingCommitted=false;programmeDuck=1;progress=0;faculty=null;decisionHeld=false;rateOverride=null;tempoPlan=null;lastRate=null;noErrorColour();
    // Carry the caller's playback intent into the newly selected full score.
    // Repeated selection of the same phase never creates another decoder.
    handoffPending=wanted&&held;
    if(wanted){applyTempo({immediate:true});current().setProgrammeDuck?.(programmeDuck,{seconds:0});if(!held)current().start();current().update({paused:held,progress,faculty});}
    return true;
  }
  function start(){
    if(disposed)return false;wanted=true;held=false;handoffPending=false;noErrorColour();
    applyTempo({immediate:!current().snapshot().active});current().setProgrammeDuck?.(programmeDuck,{seconds:0});
    const result=current().start();current().update({paused:false,progress,faculty});return result;
  }
  function update(value={}){
    if(disposed)return snapshot();
    if(value.active===false){wanted=false;restActive=false;nearSeat=false;endingCommitted=false;handoffPending=false;lastRate=null;}
    else if(value.active===true)wanted=true;
    held=!!value.paused;noErrorColour();
    if(value.active!==false)applyTempo();
    if(handoffPending&&wanted&&!held){handoffPending=false;current().start();}
    current().update({...value,paused:held,progress,faculty});return snapshot();
  }
  function pause(){
    if(disposed)return false;held=true;
    if(typeof current().pause==='function')current().pause();
    else current().update({paused:true,progress,faculty});
    return true;
  }
  function finishAfterCycle(){if(disposed)return false;endingCommitted=true;applyTempo({immediate:true});return current().finishAfterCycle();}
  function stop(){
    if(disposed)return false;wanted=false;held=false;handoffPending=false;restActive=false;nearSeat=false;progress=0;faculty=null;
    current().stop();endingCommitted=false;decisionHeld=false;rateOverride=null;tempoPlan=null;lastRate=null;programmeDuck=1;noErrorColour();return true;
  }
  function dispose(){
    if(disposed)return false;wanted=false;restActive=false;nearSeat=false;held=false;handoffPending=false;lastRate=null;disposed=true;
    for(const score of new Set(Object.values(scores)))score.dispose();return true;
  }
  function setPlaybackRate(value,options){if(disposed)return false;rateOverride=value==null?null:Math.max(.96,Math.min(1,Number(value)||1));applyTempo(options);return snapshot();}
  function setProgrammeDuck(value,options){if(disposed)return false;programmeDuck=typeof value==='number'&&Number.isFinite(value)?clamp(value):1;current().setProgrammeDuck?.(programmeDuck,options);return snapshot();}
  // Deliberate bodily/structural consequences live outside this music owner.
  // Performed mistakes remain audible as performed music, never glitch SFX.
  function setAfflictionActive(){noErrorColour();return false;}
  return Object.freeze({supportsPhase,selectPhase,setRestProgress,start,update,pause,
    finishAfterCycle,stop,dispose,snapshot,setAfflictionActive,setPlaybackRate,setProgrammeDuck});
}
