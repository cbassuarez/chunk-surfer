import {SOURCE_REST_SEATS,sourceRestEyePosition} from './source-rest-seat.js';
import {SOURCE_REST_ALCOVE} from '../data/source-rest-alcove.js';
import {SOURCE_REST_ROUTE_GROUPS,SOURCE_REST_ROUTE_BEATS} from '../data/source-rest-route-composition.js';
const seat=SOURCE_REST_SEATS[0],unit=(id,mesh,x,y,z,sx,sy,sz,yaw=0)=>({id,mesh:'source-continuation-rest-'+mesh,x,y,z,sx,sy,sz,yaw,chartId:seat.chartId});
export const SOURCE_REST_TREATMENTS=Object.freeze([
  Object.freeze({id:'loggia',title:'The last music room',reason:'A worn, sheltered music-room bay behind the return; a generous northern turn reveals the upholstered settle, fitted joinery and a deep western opening over drowned terraces.'}),
  Object.freeze({id:'practice-bay',title:'The room left open',reason:'A close domestic bay around the same seat; more enclosed and explanatory.'}),
  Object.freeze({id:'tidal-seat',title:'The tidal observatory',reason:'A low stone surround; quieter near surfaces, but less shelter and less contrast with the exposed Source.'}),
]);
// Four batches carry fifty small edge details. All Source II slabs coexist;
// keeping their construction visible also makes the view back accountable.
export function sourceRestRouteComposition(state={phase:'wrong-return',chartId:0}){
  if(state.phase!=='wrong-return'||(state.chartId??0)!==0)return{parts:[],beats:[]};
  return{parts:SOURCE_REST_ROUTE_GROUPS.map(group=>({...unit('route-'+group.id,group.mesh.replace(/^rest-/,''),
    group.anchor.x,group.anchor.y,group.anchor.z,1,1,1),routeComposition:true,routeArchitecture:true,supportIds:group.pieces.map(p=>p.supportId)})),beats:SOURCE_REST_ROUTE_BEATS};
}
// The screen and window are authoritative solids in source-rest-alcove.
// These fitted pieces dress that real enclosure and add no floor.
export function sourceRestPlaceStudy(treatment='loggia'){
  const parts=[],add=(id,mesh,dx,y,dz,sx,sy,sz,yaw=0)=>parts.push(unit(id,mesh,seat.x+dx,seat.feet+y,seat.z+dz,sx,sy,sz,yaw));
  add('floor-boards','study-floor-oak',0,0,0,1,1,1);
  add('floor-border','study-floor-copper',0,0,0,1,1,1);
  // Real floor joints lead around the screened corner. The seat is found by
  // following the material around an opening, not by spotting a point light.
  add('entrance-threshold','stone',-.29,.012,-1.44,1.32,.028,.13);
  if(treatment==='practice-bay'){
    add('bay-soundboard','oak',.52,.10,-.22,.10,2.45,2.62);
    add('bay-head','oak',-.25,2.57,-.22,1.58,.18,2.75);
  }else if(treatment==='tidal-seat'){
    for(const side of[-1,1])add('tidal-wing-'+side,'stone',.13,.15,side*.99,.75,.58,.20);
    add('tidal-cap','copper',.45,1.17,-.20,.25,.055,2.42);
  }else{
    for(const side of[-1,1]){
      const z=side<0?-.84:.64;
      add('loggia-post-'+side,'oak',.47,.04,z,.12,2.53,.12);
      add('loggia-foot-'+side,'stone',.47,.015,z,.21,.17,.21);
      add('loggia-cap-'+side,'copper',.47,2.48,z,.23,.085,.23);
    }
    // The slightly falling roof gathers the eye toward the window. Broad
    // quiet planes read through the dither, with narrow dark joints between.
    add('ceiling-panel-batch','study-roof-glass',0,0,0,1,1,1);
    add('ceiling-rib-batch','study-roof-oak',0,0,0,1,1,1);
    add('rear-cornice','oak',.48,2.49,-.10,.16,.18,1.75);
    add('rear-dado','oak',.535,.03,-.10,.105,.76,1.67);
    add('rear-dado-cap','copper',.535,.79,-.10,.14,.035,1.67);
    add('rear-ledge','oak',.49,.825,-.10,.21,.055,1.56);
    // A shallow cabinet turns the blank back into a music room. It sits
    // behind the settle, leaving both the northern turn and the view through
    // the west opening completely clear. The irregular divisions suggest
    // stored folios rather than a repeated texture or another glowing sign.
    // Joinery and folios are merged by material. Their individual members
    // keep their actual shapes but don't crowd the dimensional receiver's
    // limited native draw budget when viewed through the fall seam.
    add('cabinet-joinery-oak','study-joinery-oak',0,0,0,1,1,1);
    add('cabinet-joinery-copper','study-joinery-copper',0,0,0,1,1,1);
    add('coffer-joinery-oak','study-coffer-oak',0,0,0,1,1,1);
    add('coffer-joinery-copper','study-coffer-copper',0,0,0,1,1,1);
    for(const side of [-1,1]){
      const z=side<0?-.79:.59;
      add('end-panel-'+side,'oak',.12,1.63,z,.66,.66,.07);
      add('end-panel-cap-'+side,'copper',.12,2.29,z,.69,.035,.09);
    }
    for(const material of ['copper','stone','glass'])
      add('cabinet-folios-'+material,'folios-'+material,.405,0,0,1,1,1);
    // A deep reveal at the real west window composes the horizon instead of
    // placing another freestanding arch in the void.
    const w=SOURCE_REST_ALCOVE.window,centre=(w.minZ+w.maxZ)/2-seat.z,length=w.maxZ-w.minZ;
    add('window-sill','stone',w.x-seat.x,.275,centre,.32,.10,length+.18);
    add('window-sill-edge','copper',w.x-seat.x+.12,.364,centre,.025,.012,length+.16);
    add('window-head','oak',w.x-seat.x,2.35,centre,.23,.14,length+.19);
    for(const side of[-1,1]){
      const z=(side<0?w.minZ-.052:w.maxZ+.052)-seat.z;
      add('window-reveal-'+side,'oak',w.x-seat.x,.38,z,.25,1.97,.104);
      add('window-reveal-inlay-'+side,'copper',w.x-seat.x+.126,.46,z,.018,1.78,.026);
    }
    add('window-inner-eave','light-strip',w.x-seat.x+.135,2.49,centre,.018,.012,length-.10);
  }
  const route=sourceRestRouteComposition();parts.push(...route.parts);
  return{treatment,parts,routeBeats:route.beats,views:{approach:{eye:[seat.discovery.x,seat.feet+1.62,seat.discovery.z],yaw:seat.discovery.yaw,pitch:0},seated:{eye:sourceRestEyePosition(seat),...seat.view}}};
}
export function sourceRestVista(degradation=0,signal=0,{reducedMotion=false}={}){
  const parts=[],smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);},drift=smooth(.48,.86,degradation),
    add=(id,mesh,x,y,z,sx,sy,sz,yaw=0)=>parts.push({...unit(id,mesh,x,y,z,sx,sy,sz,yaw),vista:true});
  // Existing Source II stairs and return bridges supply the foreground and
  // middle distance. Water and banks begin beyond that real structure; the
  // actual clouded sky is responsible for the upper horizon.
  const waterY=seat.feet-4.58-drift*9;
  add('still-water','water',seat.x-40,waterY,seat.z,48,.05,58);
  for(let tier=0;tier<3;tier++){
    const x=seat.x-21-tier*11,z=seat.z+(tier===1?2.4:-1.8),y=seat.feet-4.45-tier*.25-drift*(7+tier),length=19+tier*4;
    // A drowned quadrangle, made of the same patient stone courses as the
    // refuge. Low paired uprights leave the musical organism's central field
    // open; they are neither another floating arch nor a second spectacle.
    add('garden-island-'+tier,'stone',x,y,z,8+tier*6,.35,length);
    add('garden-retaining-'+tier,'stone',x-3.4-tier*2.6,y+.35,z,.42,1.08,length);
    for(const side of[-1,1])add('garden-pier-'+tier+'-'+side,'stone',x+2.9+tier,y+.35,z+side*(length/2-.8),.52,1.74+tier*.16,.72);
    add('garden-cypress-'+tier,'green',x-.7,y+.36,z+(tier%2?-1:1)*(length/2-2.3),1.12,2.20+tier*.16,1.16);
  }
  const sway=reducedMotion?0:signal*.035;
  for(let n=0;n<4;n++)add('water-light-'+n,'light-strip',seat.x-23-n*8,waterY+.025,seat.z+n*1.3-2,4+n*1.2,.008,.024+sway);
  return parts;
}
