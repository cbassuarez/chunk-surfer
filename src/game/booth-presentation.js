import {BOOTH_GUARD_STAGE} from '../data/booth-guard-rig.js';
import {boothGuardDescriptor} from '../render/booth-guard-performance.js';

export const BOOTH_POSE=Object.freeze({IDLE:'idle',LEDGER:'ledger',HANDOFF:'handoff'});

// The man later seen in Wrong Fold, before anything has happened to him.
// The idle clip is upright with relaxed arms; even frame zero of fold is
// already seated and braced. Stand on the lodge plinth beside the chair,
// facing the public approach through the clear window light. The retained
// facial anatomy sits under a real projecting cap and its baked brim shade;
// only his Source counterpart has the physical facial absence.
const GUARD_AT=Object.freeze({x:BOOTH_GUARD_STAGE.origin[0],y:BOOTH_GUARD_STAGE.origin[1],z:BOOTH_GUARD_STAGE.origin[2]});
export function boothGuardRenderInstance(instance,options={}){
  if(!/^yard-booth-guard-(idle|ledger|handoff)$/.test(instance?.id||''))return instance;
  const yaw=instance.yaw||0,c=Math.cos(yaw),s=Math.sin(yaw),scale=instance.scale||1;
  return{...instance,mesh:'overworld_booth_guard',fallbackMesh:instance.mesh,
    fallbackTransform:{x:instance.x,y:instance.y,z:instance.z,yaw:instance.yaw},
    x:instance.x+(GUARD_AT.x*c-GUARD_AT.z*s)*scale,
    y:instance.y+GUARD_AT.y*scale,
    z:instance.z+(GUARD_AT.x*s+GUARD_AT.z*c)*scale,
    yaw:yaw+Math.PI,
    character:boothGuardDescriptor({pose:instance.id.slice('yard-booth-guard-'.length),...options}),
  };
}

export function boothPoseForSourceId(sourceId=''){
  const id=String(sourceId||'');
  if(id==='threshold.line.5'||id.startsWith('coffee.'))return BOOTH_POSE.HANDOFF;
  if(id==='start.line.6'||id==='start.line.7'||id.includes('order')||id.startsWith('threshold.line.name')||/^threshold\.line\.(?:[1-4])$/.test(id)||id.startsWith('threshold.line.returned'))return BOOTH_POSE.LEDGER;
  return BOOTH_POSE.IDLE;
}

export function boothCameraFrame({origin,target,startedAt=0,nowMs=0,durationMs=720,targetPitch=-.035}={}){
  const from=origin||{x:0,y:0,yaw:0,pitch:0},look=target||from;
  const targetYaw=Math.atan2((look.x||0)-(from.x||0),-((look.y||0)-(from.y||0)));
  const yawDelta=Math.atan2(Math.sin(targetYaw-(from.yaw||0)),Math.cos(targetYaw-(from.yaw||0)));
  const raw=Math.max(0,Math.min(1,(Number(nowMs)-Number(startedAt))/Math.max(1,Number(durationMs)||720)));
  const eased=raw*raw*(3-2*raw);
  return{x:from.x,y:from.y,yaw:(from.yaw||0)+yawDelta*eased,pitch:(from.pitch||0)+(targetPitch-(from.pitch||0))*eased};
}
