import { ZONE } from '../data/floorplan/legend.js';
import { ST_BRENDANS_PRESENCES, ST_BRENDANS_PRESENCE_ORIGINS, ST_BRENDANS_PRESENCE_BUDGET } from '../data/st-brendans-presences.js';
import { APPARITION_RENDER_VARIANT, APPARITION_LIGHT_STATE } from './emergency-light-runtime.js';

export function stBrendansPresenceWorldPlacements(plan){
  if(!plan?.isLoaded?.())return [];
  const result=[];
  for(const p of ST_BRENDANS_PRESENCES){
    const origin=ST_BRENDANS_PRESENCE_ORIGINS[p.level];
    // Stations describe continuous physical metre positions. Sample the cell
    // containing the feet; rounding would choose the wall beside an otherwise
    // valid station near a half-metre boundary (for example the east belfry).
    const lx=origin.x+p.x,lz=origin.z+p.z,rx=Math.floor(lx*2),ry=Math.floor(lz*2);
    if(plan.isSolid(rx,ry)||plan.zoneAt(rx,ry)!==ZONE.church)continue;
    const at=plan.logicalToPhysical(rx,ry),floor=plan.floorAt(rx,ry);
    if(!at||Math.abs(floor-origin.height)>.05)continue;
    result.push({...p,x:at.x*.5+lx-rx*.5,y:floor,z:at.z*.5+lz-ry*.5,
      zone:ZONE.church,structural:false,noShadow:true,blocks:false,interactive:false});
  }
  return result;
}

// A belfry practical cannot charge bodies through ten metres of stone. Use
// actual 3D light reach, retaining the same three established family states.
export function stBrendansPresenceLightState(p,{lights=[],torchOn=false}={}){
  for(const l of lights){
    const radius=Number(l.radius)||0,intensity=Number(l.intensity)||0;
    if(radius<=0||intensity<=.06)continue;
    const distance=Math.hypot(p.x-(Number(l.x)||0),p.y+.95-(Number(l.y)||0),p.z-(Number(l.z)||0));
    if(distance>=radius||intensity*(1-distance/radius)**2<.018)continue;
    if(l.kind!=='emergency'||Number(l.shadowReveal)>.08)return APPARITION_LIGHT_STATE.ON;
  }
  return torchOn?APPARITION_LIGHT_STATE.OFF:APPARITION_LIGHT_STATE.UNLIT;
}

export function stBrendansPresenceRenderInstances(placements,{
  group=null,zone=null,lights=[],torchOn=false,listener=null,
  suppressActors=false,effectsMode='full',ending=false,
}={}){
  if(!['ground','cathedral'].includes(group)||zone!==ZONE.church||suppressActors||effectsMode==='off'||ending)return [];
  return (placements||[]).filter(p=>!listener||Math.hypot(p.x-listener.x,p.y+.95-listener.y,p.z-listener.z)<=ST_BRENDANS_PRESENCE_BUDGET.maxDistance).map(p=>{
    const state=stBrendansPresenceLightState(p,{lights,torchOn});
    return {...p,apparitionVariant:APPARITION_RENDER_VARIANT[state],emissive:[.65,.78,.82,state===APPARITION_LIGHT_STATE.ON?.14:.06]};
  });
}
