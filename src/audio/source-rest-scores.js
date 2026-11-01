import {createSourceRestMusic} from './source-rest-music.js';
import {createSourceRestCouperin} from './source-rest-couperin.js';

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
  let phase='wrong-return',restActive=false,progress=0,faculty=null,
    wanted=false,held=false,disposed=false,handoffPending=false;
  const current=()=>scores[phase];
  const noErrorColour=()=>bach.setAfflictionActive?.(false);
  noErrorColour();
  const supportsPhase=value=>PHASES.includes(value);
  function snapshot(){const state=current().snapshot();return {...state,phase,restActive,
    restProgress:progress,faculty,disposed:disposed||!!state.disposed};}
  function setRestProgress(value,active,{faculty:nextFaculty=null}={}){
    if(disposed)return snapshot();
    progress=clamp(value);restActive=!!active;faculty=nextFaculty==null?null:clamp(nextFaculty);
    // active here means seated, not permission to stop/start the performance.
    // Preserve a lifecycle hold while changing its timbral interpretation.
    noErrorColour();current().update({progress,faculty,paused:held});return snapshot();
  }
  function selectPhase(value){
    if(disposed||!supportsPhase(value)||value===phase)return false;
    current().stop();phase=value;restActive=false;progress=0;faculty=null;noErrorColour();
    // Carry the caller's playback intent into the newly selected full score.
    // Repeated selection of the same phase never creates another decoder.
    handoffPending=wanted&&held;
    if(wanted){if(!held)current().start();current().update({paused:held,progress,faculty});}
    return true;
  }
  function start(){
    if(disposed)return false;wanted=true;held=false;handoffPending=false;noErrorColour();
    const result=current().start();current().update({paused:false,progress,faculty});return result;
  }
  function update(value={}){
    if(disposed)return snapshot();
    if(value.active===false){wanted=false;restActive=false;handoffPending=false;}
    else if(value.active===true)wanted=true;
    held=!!value.paused;noErrorColour();
    if(handoffPending&&wanted&&!held){handoffPending=false;current().start();}
    current().update({...value,paused:held,progress,faculty});return snapshot();
  }
  function pause(){
    if(disposed)return false;held=true;
    if(typeof current().pause==='function')current().pause();
    else current().update({paused:true,progress,faculty});
    return true;
  }
  function finishAfterCycle(){if(disposed)return false;return current().finishAfterCycle();}
  function stop(){
    if(disposed)return false;wanted=false;held=false;handoffPending=false;restActive=false;progress=0;faculty=null;
    current().stop();noErrorColour();return true;
  }
  function dispose(){
    if(disposed)return false;wanted=false;restActive=false;held=false;handoffPending=false;disposed=true;
    for(const score of new Set(Object.values(scores)))score.dispose();return true;
  }
  // Deliberate bodily/structural consequences live outside this music owner.
  // Performed mistakes remain audible as performed music, never glitch SFX.
  function setAfflictionActive(){noErrorColour();return false;}
  return Object.freeze({supportsPhase,selectPhase,setRestProgress,start,update,pause,
    finishAfterCycle,stop,dispose,snapshot,setAfflictionActive});
}
