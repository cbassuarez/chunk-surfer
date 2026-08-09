export const BOOTH_POSE=Object.freeze({IDLE:'idle',LEDGER:'ledger',HANDOFF:'handoff'});

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
