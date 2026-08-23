// Ordinary motion around Ellery. These figures are presentation only: the
// floorplan owns collision and none of these instances can obstruct a route.

import { EXTERIOR_AMBIENT_NODES } from '../data/exterior-district.js';
import { ZONE } from '../data/floorplan/legend.js';

const clamp01=(value)=>Math.max(0,Math.min(1,Number(value)||0));
const smoothstep=(value)=>{
  const t=clamp01(value);
  return t*t*(3-2*t);
};

function routeProgress(timeSec,period,{vehicle=false}={}){
  const phase=((Number(timeSec)||0)/Math.max(1,Number(period)||1))%1;
  const wrapped=phase<0?phase+1:phase;
  // A long pause off camera at either end prevents traffic from reading as a
  // mechanical pendulum when the player waits at a corner.
  if(wrapped<.10)return 0;
  if(wrapped>.90)return 1;
  const travel=clamp01((wrapped-.10)/.80);
  // Engines hold road speed. Pedestrians and the cyclist ease their weight
  // into the route; applying that same curve to traffic made every car surge
  // and brake continuously like a showroom turntable.
  return vehicle?travel:smoothstep(travel);
}

export function exteriorAmbientInstances({timeSec=0,reducedMotion=false}={}){
  return EXTERIOR_AMBIENT_NODES.map((node)=>{
    const moving=node.route!=='still';
    const t=moving
      ?routeProgress(((Number(timeSec)||0)+Number(node.phase||0)*node.period)*(reducedMotion?.55:1),node.period,{vehicle:node.kind==='vehicle'})
      :0;
    const x=node.from.x+(node.to.x-node.from.x)*t;
    const z=node.from.z+(node.to.z-node.from.z)*t;
    const dx=node.to.x-node.from.x,dz=node.to.z-node.from.z;
    return{
      id:`exterior-ambient:${node.id}`,
      mesh:node.mesh,
      x,y:0,z,
      // Traffic meshes are authored with their lamps/windscreen at local -Z.
      // Under the prop matrix local -Z becomes [sin(yaw), -cos(yaw)], so this
      // angle points the actual front—not merely the instance axis—down-route.
      yaw:moving?(node.kind==='vehicle'?Math.atan2(dx,-dz):Math.atan2(dx,dz)):0,
      scale:1,
      zone:ZONE.street,
      structural:false,
      ambient:true,
      headlights:!!node.headlights,
    };
  });
}

// The lamps are not metadata. The warm-glass primitives make the two lenses
// visible on the vehicle, while these short-lived point lights put the moving
// pools on wet tarmac. Only the nearest two vehicles contribute so the fixed
// eight-light architectural rig keeps its slots in the renderer's 12-light
// budget.
export function exteriorHeadlightLights({
  timeSec=0,
  reducedMotion=false,
  origin={x:0,z:0},
  maxVehicles=2,
  maxDistance=48,
}={}){
  const ox=Number(origin?.x)||0,oz=Number(origin?.z)||0;
  const vehicles=exteriorAmbientInstances({timeSec,reducedMotion})
    .filter(({headlights})=>headlights)
    .map((vehicle)=>({...vehicle,distance:Math.hypot(vehicle.x-ox,vehicle.z-oz)}))
    .filter(({distance})=>distance<=Math.max(1,Number(maxDistance)||48))
    .sort((a,b)=>a.distance-b.distance)
    .slice(0,Math.max(0,Number(maxVehicles)||0));
  return vehicles.flatMap((vehicle)=>{
    const forwardX=Math.sin(vehicle.yaw),forwardZ=-Math.cos(vehicle.yaw);
    const rightX=Math.cos(vehicle.yaw),rightZ=Math.sin(vehicle.yaw);
    return[-.62,.62].map((side,index)=>({
      id:`${vehicle.id}:headlight-${index+1}`,
      headlightOf:vehicle.id,
      x:vehicle.x+forwardX*3.20+rightX*side,
      y:.72,
      z:vehicle.z+forwardZ*3.20+rightZ*side,
      color:[1,.78,.43],
      intensity:.52,
      radius:9.5,
      penetration:.08,
      spilling:false,
      kind:'fitting',
      circuit:null,
      maintained:true,
      nominalIntensity:.52,
      emissiveScale:1,
      castsShadow:false,
      zone:ZONE.street,
    }));
  });
}

export function exteriorAmbientSnapshot(timeSec=0,options={}){
  return Object.fromEntries(exteriorAmbientInstances({timeSec,...options}).map((instance)=>[
    instance.id,{x:instance.x,z:instance.z,yaw:instance.yaw},
  ]));
}
