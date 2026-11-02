import {EXTERIOR_PUB,pubPhysicalFromLocal,pubPhysicalAt} from '../data/exterior-pub.js';
import {PUB_SERVICE_PLACEMENTS} from '../render/pub-service-presentation.js';
import {PUB_ACTORS} from '../data/pub-population.js';

// A presentation attempt, not knowledge, help, injury or ending progress.
export const PUB_PRESSURE_STARTED='pub.uncanny.glassPressure.started';
const at=pubPhysicalFromLocal(PUB_SERVICE_PLACEMENTS.find(p=>p.id==='pub-water-ed'));
export const PUB_PRESSURE_GLASS=Object.freeze({...at,y:EXTERIOR_PUB.floor+.85});
const physicalActors=PUB_ACTORS.map(actor=>({...actor,...pubPhysicalAt(actor)}));

// Attention is required before spending the one attempt. This is framing,
// not an occlusion test: the host also requires the actual table/room ready.
export function pubPressureAttended(camera,point=PUB_PRESSURE_GLASS){
  const eye=camera?.eye;
  if(!eye||!point||![eye.x,eye.y,eye.z,camera.yaw,camera.pitch,point.x,point.y,point.z].every(Number.isFinite))return false;
  const dx=point.x-eye.x,dy=point.y-eye.y,dz=point.z-eye.z;
  if(Math.hypot(dx,dy,dz)>2.2)return false;
  const sy=Math.sin(camera.yaw),cy=Math.cos(camera.yaw),sp=Math.sin(camera.pitch),cp=Math.cos(camera.pitch);
  const forward=dx*sy*cp+dy*sp-dz*cy*cp,right=dx*cy+dz*sy,up=-dx*sy*sp+dy*cp+dz*cy*sp;
  const tan=Number.isFinite(camera.tanHalfFov)?Math.max(.1,camera.tanHalfFov):.95;
  if((camera.width!=null&&!Number.isFinite(camera.width))||(camera.height!=null&&!Number.isFinite(camera.height)))return false;
  const aspect=camera.width>0&&camera.height>0?camera.width/camera.height:16/9;
  return forward>.05&&Math.abs(right)<forward*tan*aspect*.64&&Math.abs(up)<forward*tan*.64;
}

// A conservative body clearance check, separate from optical framing. These
// patrons have fixed seat/station roots; do not spend the attempt through a
// neighbour's back merely because the glass projects near the screen centre.
export function pubPressureClearSight(camera,point=PUB_PRESSURE_GLASS,actors=physicalActors){
  const eye=camera?.eye;if(!eye||!point||![eye.x,eye.y,eye.z,point.x,point.y,point.z].every(Number.isFinite))return false;
  if(!Array.isArray(actors)||actors.some(a=>!a||![a.x,a.z,a.floor??0].every(Number.isFinite)))return false;
  const dx=point.x-eye.x,dz=point.z-eye.z,length=dx*dx+dz*dz;if(length<1e-8)return false;
  for(const actor of actors){
    const t=((actor.x-eye.x)*dx+(actor.z-eye.z)*dz)/length;
    if(t<=0||t>=1)continue;
    const y=eye.y+(point.y-eye.y)*t;
    if(y<(actor.floor||0)+.25||y>(actor.floor||0)+1.85)continue;
    if(Math.hypot(eye.x+dx*t-actor.x,eye.z+dz*t-actor.z)<.37)return false;
  }
  return true;
}
