// One conspicuous unfinished guest wants the living visitor's attention.
// No input, camera, audio or consent ownership. All clocks are active time.
import { ACADEMIC_FLOOR_HOLLOWS } from '../data/academic-floor-population.js';
const lateGuest=ACADEMIC_FLOOR_HOLLOWS.find(actor=>actor.dreadVariant);
export const ACADEMIC_CROWD_DREAD=Object.freeze({actorId:'academic-hollow-late-guest',
  at:Object.freeze({x:lateGuest.x,y:lateGuest.y}),range:7.5,noticeSeconds:1.8,warningSeconds:4.5,
  lookAwaySeconds:.35,composureCost:3});
const T=ACADEMIC_CROWD_DREAD;
const outcomes=new Set(['escaped','marked']);
export function createAcademicCrowdDread(saved){
  let outcome=outcomes.has(saved?.outcome)?saved.outcome:null;
  let phase=outcome?'done':'idle',elapsed=0,away=0,suspended=false;
  const save=()=>({version:1,outcome});
  const reset=()=>{phase=outcome?'done':'idle';elapsed=0;away=0;suspended=false;};
  function resolve(next){outcome=next;phase='done';elapsed=0;away=0;
    return[{type:'resolved',outcome,composureCost:next==='marked'?T.composureCost:0,stateChanged:true}];}
  function tick(dt,input={}){
    if(!input.inside){reset();return[];}
    if(outcome)return[];
    const blocked=input.suspended||input.speechBusy||input.loanBusy||input.threatBusy||!input.ready;
    if(blocked){suspended=true;return[];}
    if(suspended){suspended=false;if(phase==='warning'){elapsed=0;away=0;}}
    const delta=Math.max(0,Math.min(.1,Number(dt)||0));
    if(phase==='warning'){
      // No unseen warning time, including fixed updates before first paint.
      if(input.aware!==true){elapsed=0;away=0;return[];}
      away=input.lookingAt&&input.near?0:away+delta;
      if(away>=T.lookAwaySeconds)return resolve('escaped');
      elapsed+=delta;
      if(elapsed>=T.warningSeconds)return resolve('marked');
      return[];
    }
    if(input.near&&input.lookingAt){
      phase='watching';elapsed+=delta;
      if(elapsed>=T.noticeSeconds){phase='warning';elapsed=0;away=0;return[{type:'noticed'}];}
    }else{phase='idle';elapsed=0;}
    return[];
  }
  function view(){return{...save(),phase,elapsed,away,suspended,
    attention:phase==='warning'?1:phase==='watching'?Math.min(1,elapsed/T.noticeSeconds):0,
    cue:phase==='warning'?{source:'THE LATE GUEST',
      text:'The empty face keeps turning towards you. Nearby conversations stop.',
      instruction:'TURN AWAY OR LEAVE. Do not keep looking at the empty face.',
      remaining:Math.max(0,T.warningSeconds-elapsed)}:null};}
  return Object.freeze({tick,view,save,load(next){outcome=outcomes.has(next?.outcome)?next.outcome:null;reset();return save();}});
}
