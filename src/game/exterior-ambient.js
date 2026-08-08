// Ordinary motion around Ellery. These figures are presentation only: the
// floorplan owns collision and none of these instances can obstruct a route.

import { EXTERIOR_AMBIENT_NODES } from '../data/exterior-district.js';
import { ZONE } from '../data/floorplan/legend.js';

const clamp01=(value)=>Math.max(0,Math.min(1,Number(value)||0));
const smoothstep=(value)=>{
  const t=clamp01(value);
  return t*t*(3-2*t);
};

function routeProgress(timeSec,period){
  const phase=((Number(timeSec)||0)/Math.max(1,Number(period)||1))%1;
  const wrapped=phase<0?phase+1:phase;
  // A long pause off camera at either end prevents traffic from reading as a
  // mechanical pendulum when the player waits at a corner.
  if(wrapped<.10)return 0;
  if(wrapped>.90)return 1;
  return smoothstep((wrapped-.10)/.80);
}

export function exteriorAmbientInstances({timeSec=0,reducedMotion=false}={}){
  return EXTERIOR_AMBIENT_NODES.map((node)=>{
    const moving=node.route!=='still';
    const t=moving
      ?routeProgress((Number(timeSec)||0)*(reducedMotion?.55:1),node.period)
      :0;
    const x=node.from.x+(node.to.x-node.from.x)*t;
    const z=node.from.z+(node.to.z-node.from.z)*t;
    const dx=node.to.x-node.from.x,dz=node.to.z-node.from.z;
    return{
      id:`exterior-ambient:${node.id}`,
      mesh:node.mesh,
      x,y:0,z,
      yaw:moving?Math.atan2(dx,dz):0,
      scale:1,
      zone:ZONE.street,
      structural:false,
      ambient:true,
    };
  });
}

export function exteriorAmbientSnapshot(timeSec=0,options={}){
  return Object.fromEntries(exteriorAmbientInstances({timeSec,...options}).map((instance)=>[
    instance.id,{x:instance.x,z:instance.z,yaw:instance.yaw},
  ]));
}
