import assert from 'node:assert/strict';
import {openingCabDoorTarget} from '../../src/game/opening-cab-inspection.js';

// Use the production door's measured target, then verify the actual focus ray.
// This stages only the player's look; it cannot set focus or invoke the exit.
export function aimOpeningCabDoor(scene){
 const frame=scene.view(),target=openingCabDoorTarget(frame.anchor),point=target.position,
  dx=point.x-frame.eye.x,dz=point.z-frame.eye.z,
  yaw=Math.atan2(dx,-dz),pitch=Math.atan2(point.y-frame.eye.y,Math.hypot(dx,dz));
 scene.lookBy(Math.atan2(Math.sin(yaw-frame.yaw),Math.cos(yaw-frame.yaw)),pitch-frame.pitch);
 assert.equal(scene.view().focus?.type,'exit');assert.equal(scene.view().focus?.id,target.id);
 return scene.view();
}
