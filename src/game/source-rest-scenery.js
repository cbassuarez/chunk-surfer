// A distant, non-colliding observatory of interrupted arcs and little pieces
// of light.  Its location is in the refuge's own chart, not the other side of
// a portal.  The player's analyzed recording can make it breathe, but no
// invented beat or fixed score timing is attributed to the performance.
import {SOURCE_REST_SEATS,SOURCE_REST_II_SCALE_Z} from './source-rest-seat.js';
import {sourceRestPlaceStudy,sourceRestVista} from './source-rest-place.js';
import {sourceRestMemories} from './source-rest-memories.js';
import {sourceRestWeather} from './source-rest-weather.js';
import {sourceRestNoteArchitecture} from './source-rest-note-architecture.js';
import {sourceRestBellProps} from '../render/source-rest-bells.js';
import {sourceRestFlood} from './source-rest-flood.js';
import {sourceRestCatchScenery} from './source-rest-catch-scenery.js';

export const SOURCE_REST_SKY=Object.freeze({chartId:SOURCE_REST_SEATS[0].chartId,phase:'wrong-return',
  distance:46,centerHeight:6.8,innerRadius:7.8,outerRadius:12.5,arcSegments:32,motes:48,
  vaults:5,vaultSegments:12});
const clamp=n=>Math.min(1,Math.max(0,Number.isFinite(Number(n))?Number(n):0));
const hash=n=>{const v=Math.sin(n*127.1+78.233)*43758.5453;return v-Math.floor(v);};
const smooth=(a,b,n)=>{const t=clamp((n-a)/(b-a));return t*t*(3-2*t);};

export function sourceRestScenery(state,{reducedMotion=false,noteScore=null,couperinNoteScore=null,flashMode='full'}={}){
  if(state?.phase==='catch')return sourceRestCatchScenery(state,{reducedMotion,flashMode,noteScore:couperinNoteScore});
  if(state?.phase!==SOURCE_REST_SKY.phase||(state.chartId??0)!==SOURCE_REST_SKY.chartId)return null;
  const seat=SOURCE_REST_SEATS[0],raw=clamp(state?.sourceRestView?.musicSignal),signal=reducedMotion?0:raw,
    degradation=clamp(state?.sourceRestView?.degradation),
    // A last, warm gathering, not a strobe or a camera shake. Its rise and
    // fall follow the authored life rather than inventing a beat in the music.
    rally=smooth(.79,.83,degradation)*(1-smooth(.88,.92,degradation));
  const centre={x:seat.x-SOURCE_REST_SKY.distance,y:seat.feet+SOURCE_REST_SKY.centerHeight,z:seat.z};
  const lamps=[-.59,.59].map((z,i)=>({id:`rest-lamp-${i}`,x:seat.x+.15,y:seat.feet,z:seat.z+z,chartId:seat.chartId}));
  const carpet={id:'rest-carpet',x:seat.x-.18,y:seat.feet+.009,z:seat.z,chartId:seat.chartId};
  // The previous wire hoops competed with the music and became little more
  // than white outlines in the recording pass. Broad stone reveals now carry
  // the view; isolated sparks are reserved for the late rally.
  const arcs=[],motes=[],vaults=[];
  // The rally briefly returns a few suspended fragments to the listener, then
  // lets the last of them go before the host's complete-black final exchange.
  const rallyFragments=[];
  if(!reducedMotion&&rally>.01)for(let i=0;i<16;i++){
    const h=hash(701+i),k=hash(801+i),j=hash(901+i);
    rallyFragments.push({id:`rest-rally-${i}`,x:seat.x-14-h*35,y:seat.feet+2+k*16,
      z:seat.z+(j-.5)*38,size:(.12+h*.15)*rally,chartId:seat.chartId});
  }
  const flood=sourceRestFlood(state,{reducedMotion});
  const memories=sourceRestMemories(state,{reducedMotion,submersion:flood.submersion,floodActive:flood.active});
  const weather=sourceRestWeather(state,{reducedMotion,flashMode});
  const noteArchitecture=sourceRestNoteArchitecture({notes:noteScore?.notes||[],duration:noteScore?.duration,
    currentTime:state.sourceRestView?.musicTime||0,playedSeconds:state.sourceRestView?.audibleSeconds||0,
    progress:degradation,signal:raw,reducedMotion,seat});
  const study=sourceRestPlaceStudy(state?.sourceRestView?.studyTreatment||'loggia'),vista=sourceRestVista(degradation,signal,{reducedMotion});
  return{carpet,lamps,centre,arcs,motes,vaults,rallyFragments,signal,degradation,rally,place:study.parts,vista,treatment:study.treatment,
    upholstery:{x:seat.x,y:seat.feet,z:seat.z,yaw:seat.yaw,chartId:seat.chartId,scaleZ:SOURCE_REST_II_SCALE_Z},memories,weather,noteArchitecture,
    bells:sourceRestBellProps(state,{reducedMotion}),flood};
}
