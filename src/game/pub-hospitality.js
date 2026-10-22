// A warm replacement belongs to this one ordinary room. The Source encounter
// has its own meshes and must never acquire it through a shared mesh alias.
import {PUB_HOSPITALITY_MESH} from '../data/pub-hospitality.js';
export function pubHospitalityReady(assets){return assets?.hospitality===true;}
export function pubHospitalityInstance(instance,{assets,source=false}={}){
  return !source&&pubHospitalityReady(assets)&&instance.id==='pub-complete-interior'&&instance.mesh==='exterior_pub_interior'
    ?{...instance,mesh:PUB_HOSPITALITY_MESH}:instance;
}
export function pubHospitalityInput({enabled=false,special=false,zoneIsPub=false,listener=null,doorOpen=false,busy=false,paused=false,bounds}={}){
  const ordinary=enabled&&!special&&!!listener;
  const distance=ordinary&&bounds?Math.hypot(Math.max(bounds.x0-listener.x,0,listener.x-bounds.x1),Math.max(bounds.z0-listener.z,0,listener.z-bounds.z1)):Infinity;
  return{listener,inPub:ordinary&&zoneIsPub,nearPub:ordinary&&distance<9,doorOpen:ordinary&&doorOpen,busy,paused:paused||!ordinary};
}
