// A real practical below the parked van's dome fitting. No authored-coordinate
// fallback: a removed fitting or a shut van must never leave an invisible lamp.
import {VAN_REAR_CARGO_LIGHT as CARGO} from '../data/van-rear-design.js';
import {isOutdoorZone} from '../data/floorplan/legend.js';

export function vanRearCargoLight({group,zone,anchor,listener,open=0}={}){
  if(group!=='ground'||!isOutdoorZone(zone)||!anchor||!listener)return null;
  if(![anchor.x,anchor.y,anchor.z,listener.x,listener.z,open].every(Number.isFinite)||open<=0)return null;
  if(Math.hypot(listener.x-anchor.x,listener.z-anchor.z)>6)return null;
  // The visible lamp stays steady while the leaves swing over it; the final
  // small aperture closes the remaining spill. This uses the actual door pose.
  const aperture=Math.min(1,open/.12);
  // The metal-backed dome fitting emits below its diffuser. A point source
  // washed the nearby roof white while leaving its working surfaces dark.
  // Aim slightly inward from the rear work edge; never illuminate above it.
  const yaw=Number.isFinite(anchor.yaw)?anchor.yaw:0;
  const [lx,ly,lz]=CARGO.direction;
  const direction=[Math.cos(yaw)*lx-Math.sin(yaw)*lz,ly,Math.sin(yaw)*lx+Math.cos(yaw)*lz];
  return{id:'yard-van-cargo-practical',anchorPropId:'yard-van-lamp',
    x:anchor.x,y:anchor.y-.10,z:anchor.z,color:[...CARGO.color],
    intensity:5.4*aperture,radius:CARGO.radius,penetration:0,spilling:false,
    direction,coneOuterCos:CARGO.coneOuterCos,coneInnerCos:CARGO.coneInnerCos,
    kind:'fitting',maintained:true,circuit:null,floorY:anchor.floorY??anchor.y-2.30,
    castsShadow:false,shadowReveal:0,emergencyPulse:null};
}
