import {SOURCE_REST_SEATS} from './source-rest-seat.js';
import {SOURCE_REST_ALCOVE} from '../data/source-rest-alcove.js';
const seat=SOURCE_REST_SEATS[0],unit=(id,mesh,x,y,z,sx,sy,sz,yaw=0)=>({id,mesh:'source-continuation-rest-'+mesh,x,y,z,sx,sy,sz,yaw,chartId:seat.chartId});
export const SOURCE_REST_TREATMENTS=Object.freeze([
  Object.freeze({id:'loggia',title:'The window behind the return',reason:'A screened upper-refuge corner; the seat is found after the turn, and its west window reveals the existing Source stair lattice and distant wet horizon.'}),
  Object.freeze({id:'practice-bay',title:'The room left open',reason:'A close domestic bay around the same seat; more enclosed and explanatory.'}),
  Object.freeze({id:'tidal-seat',title:'The tidal observatory',reason:'A low stone surround; quieter near surfaces, but less shelter and less contrast with the exposed Source.'}),
]);
// The screen and window are authoritative solids in source-rest-alcove.
// These fitted pieces dress that real enclosure and add no floor.
export function sourceRestPlaceStudy(treatment='loggia'){
  const parts=[],add=(id,mesh,dx,y,dz,sx,sy,sz,yaw=0)=>parts.push(unit(id,mesh,seat.x+dx,seat.feet+y,seat.z+dz,sx,sy,sz,yaw));
  for(let k=0;k<7;k++)add('floor-'+k,'oak',-.22,.017,-1.10+k*.28,1.60,.025,.26);
  for(const side of[-1,1])add('border-'+side,'copper',side<0?-1.0:.53,.04,-.25,.035,.035,2);
  // A tiny spill at the hidden entrance rewards looking around the return.
  // No beacon or arrow announces the seat from the main route.
  add('entrance-spill','light-strip',-1.02,.035,-1.64,.14,.012,.055);
  if(treatment==='practice-bay'){
    add('bay-soundboard','oak',.52,.10,-.22,.10,2.45,2.62);
    add('bay-head','oak',-.25,2.57,-.22,1.58,.18,2.75);
  }else if(treatment==='tidal-seat'){
    for(const side of[-1,1])add('tidal-wing-'+side,'stone',.13,.15,side*.99,.75,.58,.20);
    add('tidal-cap','copper',.45,1.17,-.20,.25,.055,2.42);
  }else{
    for(const side of[-1,1]){
      const z=side<0?-1.15:.65;
      add('loggia-post-'+side,'oak',.44,.04,z,.11,2.53,.11);
      add('loggia-foot-'+side,'stone',.44,.02,z,.20,.16,.20);
      add('loggia-cap-'+side,'copper',.44,2.49,z,.22,.10,.22);
      add('loggia-side-'+side,'oak',-.22,2.52,z,1.58,.13,.11);
    }
    for(let n=0;n<4;n++){
      const x=.18-n*.42,y=2.62-n*.08;
      add('ceiling-panel-'+n,'roof-glass',x,y,-.25,.39,.10,2);
      add('ceiling-rib-'+n,'oak',x-.205,y-.10,-.25,.045,.13,2.05);
    }
    add('rear-cornice','oak',.48,2.48,-.25,.16,.19,2.05);
    // A deep reveal at the real west window composes the horizon instead of
    // placing another freestanding arch in the void.
    const w=SOURCE_REST_ALCOVE.window,centre=(w.minZ+w.maxZ)/2-seat.z,length=w.maxZ-w.minZ;
    add('window-sill','stone',-.88,.36,centre,.35,.09,length+.16);
    add('window-head','oak',-1.0,2.32,centre,.20,.14,length+.14);
    for(const z of[w.minZ-seat.z,w.maxZ-seat.z])add('window-reveal-'+z,'oak',-1.0,.41,z,.20,1.92,.075);
    for(const side of[-1,1]){
      add('side-table-'+side,'oak',.02,.02,side*.59,.27,.55,.24);
      add('side-table-top-'+side,'copper',.02,.57,side*.59,.31,.035,.28);
    }
  }
  return{treatment,parts,views:{approach:{eye:[seat.discovery.x,seat.feet+1.62,seat.discovery.z],yaw:seat.discovery.yaw,pitch:0},seated:{eye:[seat.x,seat.feet+1.04,seat.z],...seat.view}}};
}
export function sourceRestVista(degradation=0,signal=0,{reducedMotion=false}={}){
  const parts=[],smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);},drift=smooth(.48,.86,degradation),
    add=(id,mesh,x,y,z,sx,sy,sz,yaw=0)=>parts.push({...unit(id,mesh,x,y,z,sx,sy,sz,yaw),vista:true});
  // Existing Source II stairs and return bridges supply the foreground and
  // middle distance. Water and banks begin beyond that real structure; the
  // actual clouded sky is responsible for the upper horizon.
  add('still-water','water',seat.x-42,seat.feet-4.3-drift*9,seat.z-3,42,.05,40);
  for(let tier=0;tier<3;tier++){
    const x=seat.x-30-tier*10,z=seat.z+(tier%2?-1:1)*(9+tier*3),y=seat.feet-4.0-tier*.45-drift*(7+tier);
    add('garden-island-'+tier,'stone',x,y,z,13+tier*5,.35,13+tier*4,Math.sin(tier)*.13);
    for(let clump=0;clump<3;clump++)add('garden-cypress-'+tier+'-'+clump,'green',x+2-clump*2.5,y+.36,z-3+clump*3,1.0,1.8+(clump===1?1.3:0)+tier*.2,1.15);
  }
  const sway=reducedMotion?0:signal*.035;
  for(let n=0;n<4;n++)add('water-light-'+n,'light-strip',seat.x-25-n*9,seat.feet-4.2-drift*9,seat.z+n*2-3,4+n*2,.012,.035+sway);
  return parts;
}
