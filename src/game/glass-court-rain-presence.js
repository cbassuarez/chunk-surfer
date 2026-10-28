// The two existing planted bodies acquire expressions in the wet glass.
// This owns ephemeral perception only: no encounter, save, damage or input.
import {GLASS_COURT as C} from '../data/glass-court.js';
import {GLASS_COURT_PRESENCES} from '../data/glass-court-presences.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finitePoint=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const smooth=(a,b,v)=>{const q=clamp((v-a)/(b-a),0,1);return q*q*(3-2*q);};

export const GLASS_COURT_RAIN_FACES=Object.freeze(GLASS_COURT_PRESENCES.map(body=>Object.freeze({
  id:`${body.id}:rain`,sourceId:body.id,
  // Keep the expression above its existing planted figure, on the actual
  // inward north pane. The eye-height band is hidden by nursery foliage.
  // These are the lowest nearby sites with all eight facial-feature rays
  // clear in the production GLB from the unobstructed walking lane.
  x:body.x+(body.id==='glass-court-planted-stoop'?-1:0),
  y:body.id==='glass-court-planted-stoop'?3.2:3.25,z:C.origin.z+.004,
  width:.84,height:1.10,normal:Object.freeze([0,0,1]),
})));

export function createGlassCourtRainPresence(){
  let clock=0,suspended=false;
  const states=GLASS_COURT_RAIN_FACES.map(()=>({attention:0,unattended:0}));
  function reset(){clock=0;suspended=false;for(const state of states){state.attention=0;state.unattended=0;}}
  function update({dtSec=0,eye=null,forward=null,ready=false,paused=false,focused=true,
    reducedMotion=false,flashMode='full',rainAmount=1}={}){
    const hold=paused||!focused;
    // Discard a lost interval, including the first resume sample. A stalled
    // frame cannot complete a stare or advance a face while the player is away.
    const dt=!hold&&!suspended&&Number.isFinite(dtSec)&&dtSec>=0&&dtSec<=.25?Math.min(dtSec,.05):0;
    suspended=hold;
    const valid=finitePoint(eye),inside=!!ready&&valid&&eye.x>C.bounds.x0+.04&&eye.x<C.bounds.x1-.04
      &&eye.z>C.bounds.z0+.06&&eye.z<C.bounds.z1-.06&&eye.y>C.drawnFloor+.40&&eye.y<C.drawnFloor+3.7;
    const length=forward?Math.hypot(forward.x,forward.y,forward.z):0;
    const direction=Number.isFinite(length)&&length>.001?{x:forward.x/length,y:forward.y/length,z:forward.z/length}:null;
    const wet=clamp(Number(rainAmount)||0,0,1);
    clock+=dt;
    const faces=GLASS_COURT_RAIN_FACES.map((face,index)=>{
      const state=states[index];
      let attended=false,distance=Infinity,gaze=0;
      if(inside&&direction&&direction.z<-.04){
        const ray=(face.z-eye.z)/direction.z;
        const hx=eye.x+direction.x*ray,hy=eye.y+direction.y*ray;
        distance=Math.hypot(eye.x-face.x,eye.y-face.y,eye.z-face.z);
        attended=ray>0&&ray<8&&Math.abs(hx-face.x)<face.width*.7&&Math.abs(hy-face.y)<face.height*.65;
        gaze=clamp((eye.x-face.x)/Math.max(1,distance)*.075,-.045,.045);
      }
      if(dt>0){
        if(attended){state.attention=clamp(state.attention+dt,0,3.2);state.unattended=0;}
        else{state.unattended+=dt;if(state.unattended>1.35)state.attention=Math.max(0,state.attention-dt*.65);}
      }
      const coherence=inside&&wet>.01?smooth(.65,2.75,state.attention)*wet:0;
      return{...face,coherence,gaze,attended,distance,
        phase:coherence<=.001?'rain':coherence<.7?'forming':'recognised'};
    });
    const motionless=reducedMotion||flashMode!=='full';
    return{coordinateSpace:'physical-metres',active:inside&&wet>.01,suspended:hold,
      clockSec:clock,motionSec:motionless?0:clock,flowAmplitude:motionless?0:1,faces,
      shader:{active:inside&&wet>.01?1:0,faces:faces.map(f=>[f.x,f.y,f.z,f.coherence]),
        motion:[motionless?0:clock,faces[0]?.gaze||0,faces[1]?.gaze||0,motionless?0:1]}};
  }
  return{update,reset};
}
