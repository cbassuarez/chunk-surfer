// These bodies occupy the planting, not the player's route. They do not own
// Contact, navigation, a capture trigger, a reward or a camera instruction.
import {GLASS_COURT as C} from './glass-court.js';

const figures=[
  {id:'glass-court-planted-head',mesh:'apparition_pose_head_turn',x:5.6,z:.60,yaw:Math.PI},
  {id:'glass-court-planted-stoop',mesh:'apparition_pose_stoop',x:18.2,z:.60,yaw:Math.PI},
];
export const GLASS_COURT_PRESENCES=Object.freeze(figures.map(f=>{
  const p={x:C.logicalOrigin.x+f.x,y:C.logicalOrigin.y+f.z};
  return Object.freeze({id:f.id,mesh:f.mesh,...p,yaw:f.yaw,worldAligned:true,
    floorOverride:C.floor,elevation:C.drawnFloor-C.floor+.04,
    renderOffsetX:p.x-Math.round(p.x*2)/2,renderOffsetZ:p.y-Math.round(p.y*2)/2,
    interactive:false,structural:true,blocks:false,colliderGroup:'glass-court',renderGroups:['ground'],
  });
}));
