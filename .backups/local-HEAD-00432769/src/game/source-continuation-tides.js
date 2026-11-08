import {SOURCE_CONTINUATION as C} from '../data/source-continuation.js';
import {SOURCE_REST_HORIZON} from './source-rest-horizon.js';
import {SOURCE_REST_SEATS} from './source-rest-seat.js';
import {windVector} from '../world/wind.js';

// Each Source hangs beside something devouring: Source II's black hole, and
// over Source III the black sun eating the blood moon. Its tide is felt by a
// body that stays put: the pull gathers while you stand still and slides you
// toward it, off the edge, into the construction's own loop (Source II) or
// down through the islands (Source III). Walking keeps it shallow but never
// absent, and the night's wind gusts across both. Seated is the one place
// nothing pulls. The pull is horizontal: falling is still ordinary gravity.
const seatII=SOURCE_REST_SEATS.find(s=>s.phase==='wrong-return'),pivot=SOURCE_REST_HORIZON.pivot;
export const SOURCE_TIDES=Object.freeze({
  wells:Object.freeze({
    // The Ophanim horizon above the far gate, where Source II already draws it.
    // `swallow` is the radius inside which drawn things are gone.
    'wrong-return':Object.freeze({x:seatII.x+pivot[0],y:seatII.feet+pivot[1],z:seatII.z+pivot[2],chartId:0,swallow:1.4}),
    // Source III's black sun, low in the southern sky, so its pull crosses
    // the east-west causeways instead of leading to bench or door.
    catch:Object.freeze({x:-180,y:40,z:58,chartId:0,swallow:24}),
  }),
  // Seconds of stillness before the tide starts, and before it is full.
  graceSeconds:1.8,gatherSeconds:6,recoverRate:3,
  // Metres per second. Walking speed is C.walkSpeed (3.2).
  still:1.75,moving:.34,swirl:.38,reach:45,farShare:.55,settleSeconds:.7,
  // A walking body braces into the gust; one standing still takes all of it.
  wind:Object.freeze({gust:.85,braced:.4,bearing:.6,veer:.45,veerRate:.031,depth:1.2}),
});
const finite=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,finite(v,a)));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};

export const freshSourceTide=()=>({still:0,vx:0,vz:0});
export function normalizeSourceTide(value){
  return{still:clamp(value?.still,0,60),vx:clamp(value?.vx,-C.walkSpeed,C.walkSpeed),vz:clamp(value?.vz,-C.walkSpeed,C.walkSpeed)};
}
export function sourceTideWell(state){
  const well=SOURCE_TIDES.wells[state?.phase];
  return well&&(state.chartId??0)===well.chartId?well:null;
}
// The night's wind, from the same gust clock as the opening's leaves and rain.
export function sourceTideWind(time){
  const W=SOURCE_TIDES.wind;
  return windVector(finite(time),{bearing:W.bearing,veer:W.veer,veerRate:W.veerRate,depth:W.depth,push:W.gust});
}
/** The tide's target velocity for a body at rest for `still` seconds, or
 * walking. Pure: same state and clock give the same answer. */
export function sourceTideField(state,{still=0,moving=false,time=finite(state?.elapsed),well=sourceTideWell(state)}={}){
  if(!well)return{active:false,x:0,z:0,pull:0,wind:{x:0,z:0,gust:0,bearing:0},well:null};
  const S=SOURCE_TIDES,dx=well.x-finite(state.x),dz=well.z-finite(state.z),d=Math.hypot(dx,dz)||1,
    near=S.farShare+(1-S.farShare)/(1+(d/S.reach)**2),
    gathered=smooth((still-S.graceSeconds)/S.gatherSeconds),
    // A soft well lets a body settle at its middle instead of hunting across it.
    pull=near*(moving?S.moving:S.moving+(S.still-S.moving)*gathered)*(well.soft?Math.min(1,d/well.soft):1),
    radial=[dx/d,dz/d],tangent=[-radial[1],radial[0]],gust=sourceTideWind(time),share=moving?S.wind.braced:1,wind={...gust,x:gust.x*share,z:gust.z*share};
  return{active:true,pull,gathered,distance:d,well,wind,
    x:pull*(radial[0]+S.swirl*tangent[0])+wind.x,z:pull*(radial[1]+S.swirl*tangent[1])+wind.z};
}
/** Advance the tide one fixed step; returns the displacement the body owes. */
export function advanceSourceTide(state,dt,{moving=false,anchored=false,well=sourceTideWell(state)}={}){
  const tide=state.tide||(state.tide=freshSourceTide()),S=SOURCE_TIDES;
  if(anchored||!well){Object.assign(tide,freshSourceTide());return{dx:0,dz:0,field:null};}
  tide.still=moving?Math.max(0,tide.still-S.recoverRate*dt):tide.still+dt;
  const field=sourceTideField(state,{still:tide.still,moving,well}),k=1-Math.exp(-dt/S.settleSeconds);
  tide.vx+=(field.x-tide.vx)*k;tide.vz+=(field.z-tide.vz)*k;
  return{dx:tide.vx*dt,dz:tide.vz*dt,field};
}
