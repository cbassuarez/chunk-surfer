// Source continuation rest places, in the same local metres as the world.
// Seat positions share the real physical supports and refuge checks.
import {continuationDoors,continuationRefugeAt,continuationSupportAt,CONTINUATION_SEAT_ISLAND,SOURCE_CONTINUATION} from '../data/source-continuation.js';
import {SOURCE_REST_ALCOVE} from '../data/source-rest-alcove.js';
const freeze=Object.freeze;
const catchSeatAngle=Math.atan2(CONTINUATION_SEAT_ISLAND.z-SOURCE_CONTINUATION.catch.center.z,CONTINUATION_SEAT_ISLAND.x-SOURCE_CONTINUATION.catch.center.x);
export const SOURCE_REST_SEATS=freeze([
  freeze({id:'source-rest-ii',phase:'wrong-return',chartId:SOURCE_REST_ALCOVE.chartId,level:0,...SOURCE_REST_ALCOVE.seat,feet:SOURCE_REST_ALCOVE.feet,yaw:Math.PI,
    approach:SOURCE_REST_ALCOVE.approach,discovery:SOURCE_REST_ALCOVE.discovery,view:freeze({yaw:-Math.PI/2,pitch:-.04})}),
  // A separate island beyond the counterarc, reached by a narrow causeway.
  freeze({id:'source-rest-iii',phase:'catch',...CONTINUATION_SEAT_ISLAND,yaw:Math.PI-catchSeatAngle,
    approach:freeze({x:-192.3,z:-106}),view:freeze({yaw:catchSeatAngle-Math.PI/2+.35,pitch:.27})}),
]);
export const SOURCE_REST_MESH='yard_look_bench';
export const SOURCE_REST_II_MESH='source-continuation-rest-settle-frame';
export const SOURCE_REST_III_MESH='source-continuation-rest-harpsichord-seat';
export const SOURCE_REST_II_SCALE_Z=.78;
// The authored bench spans 3.18m on local Z. Shortening just that axis keeps
// its familiar seat, back and arms while fitting the actual refuge platform.
export const SOURCE_REST_SCALE=freeze({x:1,y:1,z:.55});
export const SOURCE_REST_FOCUS_DISTANCE=.72;
// The former 1.04m eye left only 43cm above the Catch seat, compressing the
// seated torso and putting unsupported hands across the forward view. These
// heights share a relaxed adult torso above each actual sitting surface.
export const SOURCE_REST_EYE_HEIGHT=1.23;
export const sourceRestEyeHeight=seat=>seat?.phase==='catch'?1.27:SOURCE_REST_EYE_HEIGHT;
export const SOURCE_REST_EYE_FORWARD=.18;
export function sourceRestEyePosition(seat){
  if(!seat)return null;
  // Eyes sit ahead of the pelvis. The previous over-hip camera looked through
  // the player's own chest and hid the supported hands when looking down.
  const yaw=(seat.phase==='catch'?-1:1)*seat.yaw;
  return [seat.x+Math.cos(yaw)*SOURCE_REST_EYE_FORWARD,seat.feet+sourceRestEyeHeight(seat),seat.z+Math.sin(yaw)*SOURCE_REST_EYE_FORWARD];
}
export function sourceRestSeatForState(state){
  if(!state||state.status!=='active'||state.fall||state.recovery||state.reveal||state.cameraTransit||state.bodyTransit)return null;
  return SOURCE_REST_SEATS.find(s=>s.phase===state.phase&&s.chartId===(state.chartId??0)
    &&(s.phase!=='catch'||s.level===state.level)&&Math.abs((Number(state.feet)||0)-s.feet)<.4)||null;
}
export function sourceRestBenchProps(){
  return SOURCE_REST_SEATS.map(s=>({id:s.id,mesh:s.phase==='wrong-return'?SOURCE_REST_II_MESH:SOURCE_REST_III_MESH,phase:s.phase,region:s.phase,chartId:s.chartId,level:s.level,
    x:s.x,y:s.feet,z:s.z,yaw:s.yaw,scaleX:SOURCE_REST_SCALE.x,scaleY:SOURCE_REST_SCALE.y,scaleZ:s.phase==='wrong-return'?SOURCE_REST_II_SCALE_Z:SOURCE_REST_SCALE.z,
    role:'rest-seat',structural:false,interactive:true}));
}
export function sourceRestFocus(state){
  const seat=sourceRestSeatForState(state);if(!seat)return null;
  // The actor remains at their real approach position while seated. Never
  // offer a long conversation to a person just outside the protected pocket.
  if(!sourceRestPositionProtected(state))return null;
  const dx=seat.x-state.x,dz=seat.z-state.z,distance=Math.hypot(dx,dz);
  if(!Number.isFinite(distance)||distance>(seat.phase==='wrong-return'?1.05:SOURCE_REST_FOCUS_DISTANCE))return null;
  // A real return door wins at its existing interaction distance.
  if(continuationDoors().some(d=>(d.chartId??0)===seat.chartId&&d.phase===seat.phase
      &&Math.abs(d.y-seat.feet)<.55&&Math.hypot(d.x-state.x,d.z-state.z)<=1.7))return null;
  if(state.phase!=='catch'&&distance>.1&&(Math.sin(state.yaw||0)*dx-Math.cos(state.yaw||0)*dz)/distance<=.1)return null;
  return {id:seat.id,type:'source-rest',title:'SIT AND LISTEN',text:'A place to sit.',x:seat.x,z:seat.z,y:seat.feet,
    position:{x:seat.x,y:seat.feet+.6,z:seat.z},distance};
}
export function sourceRestSeatGeometry(seat){
  if(!seat)return null;
  const c=Math.cos(seat.yaw),s=Math.sin(seat.yaw),point=(x,z)=>({x:seat.x+x*c+z*s,z:seat.z-x*s+z*c});
  const half=seat.phase==='wrong-return'?.94*SOURCE_REST_II_SCALE_Z:.89;
  return{center:{x:seat.x,z:seat.z},corners:[[-.36,-half],[-.36,half],[.36,-half],[.36,half]].map(([x,z])=>point(x,z)),approach:{...seat.approach}};
}
export function sourceRestSeatHasSupport(seat){
  const geom=sourceRestSeatGeometry(seat);if(!geom)return false;
  return [geom.center,...geom.corners,geom.approach].every(p=>!!continuationSupportAt(p.x,p.z,seat));
}
export function sourceRestApproachProtected(seat){
  return !!seat&&sourceRestPositionProtected({...seat,...seat.approach});
}
export function sourceRestPositionProtected(state){
  if(!state)return false;const refuge=continuationRefugeAt(state),radius=state.phase==='catch'||state.feet<8?1.28:(state.chartId??0)===0?3.0:2.5;
  return (refuge.chartId??0)===(state.chartId??0)&&Math.abs(refuge.feet-state.feet)<.4
    &&Math.hypot(refuge.x-state.x,refuge.z-state.z)<radius;
}
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const smooth=t=>t*t*(3-2*t);
const angle=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
// Blend from the actual rendered camera, including the Catch overhead, into a
// human-height seat. The caller keeps the original to reverse on standing.
// The player's physical x/z/feet stay on their real supported approach cell.
export function sourceRestCamera(seat,original,t,look={}){
  if(!seat||!Array.isArray(original?.eye)||original.eye.length!==3)return null;
  const k=smooth(clamp(Number(t)||0,0,1));
  const start=original.eye.map(Number),end=sourceRestEyePosition(seat);
  const yaw=Number.isFinite(look.yaw)?look.yaw:seat.view.yaw,pitch=Number.isFinite(look.pitch)?look.pitch:seat.view.pitch;
  return {eye:start.map((v,i)=>v+(end[i]-v)*k),yaw:angle(Number(original.yaw)||0,yaw,k),
    pitch:(Number(original.pitch)||0)+(pitch-(Number(original.pitch)||0))*k,
    strictOverhead:false,restOverride:true,aimTarget:null,revealProgress:null,progress:k};
}
