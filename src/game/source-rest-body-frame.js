// Measured contacts on the furniture that is actually submitted. F is the
// bench's front, U is height above its feet and R follows its long seat axis.
// Head yaw, pain and camera composition never move this physical frame.
import {SOURCE_REST_II_SCALE_Z,SOURCE_REST_SCALE} from './source-rest-seat.js';

const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
export const SOURCE_REST_BODY_BENCHES=freeze({
  'wrong-return':{mesh:'source-continuation-rest-settle-frame',seatHeight:.57,
    seatContacts:[['seat-left',.02,.57,-.14],['seat-right',.02,.57,.14]],
    leftArm:['armrest-left',.18,.71,-.67],rightArm:['armrest-right',.18,.71,.67],
    evidence:'src/render/source-rest-models.js: cushion top .57; padded frame arm tops .71; local Z scaled .78'},
  catch:{mesh:'source-continuation-rest-harpsichord-seat',seatHeight:.6075,
    // The case settle retains the player's measured contact plane.
    seatContacts:[['seat-left-front',.08,.6075,-.14],['seat-left-rear',-.08,.6075,-.14],
      ['seat-right-front',.08,.6075,.14],['seat-right-rear',-.08,.6075,.14]],
    leftArm:null,rightArm:null,
    evidence:'src/render/source-rest-harpsichord-models.js: measured case-settle contact pad .6075; existing thigh-supported hand poses retained'},
});

export function sourceRestBodyFrame(seat,{origin={}}={}){
  if(!seat||!SOURCE_REST_BODY_BENCHES[seat.phase])return null;
  const spec=SOURCE_REST_BODY_BENCHES[seat.phase],benchYaw=(seat.phase==='catch'?-1:1)*finite(seat.yaw),
    c=Math.cos(benchYaw),s=Math.sin(benchYaw),forward=[c,0,s],right=[-s,0,c],up=[0,1,0],
    at=[finite(origin.x)+finite(seat.x),finite(origin.y)+finite(seat.feet),finite(origin.z)+finite(seat.z)],
    point=(f=0,u=0,r=0)=>[at[0]+forward[0]*finite(f)+right[0]*finite(r),at[1]+finite(u),at[2]+forward[2]*finite(f)+right[2]*finite(r)],
    contact=row=>row?freeze({id:row[0],local:row.slice(1),point:point(...row.slice(1))}):null;
  return freeze({seatId:seat.id,phase:seat.phase,origin:at,forward,right,up,benchYaw,seatHeight:spec.seatHeight,
    benchMesh:spec.mesh,benchScaleZ:seat.phase==='catch'?SOURCE_REST_SCALE.z:SOURCE_REST_II_SCALE_Z,
    contacts:{seat:spec.seatContacts.map(contact),leftArm:contact(spec.leftArm),rightArm:contact(spec.rightArm)},point});
}
