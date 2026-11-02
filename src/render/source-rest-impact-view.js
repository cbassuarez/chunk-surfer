import {cameraBasis} from './camera-basis.js';
const dot=(a,b)=>a.reduce((sum,v,k)=>sum+v*b[k],0);

// This is a conservative submitted-geometry/frustum receipt, not an occlusion
// query or proof that a person noticed the contact. No offscreen clock alone
// can charge composure. Native output still needs perceptual review.
export function sourceRestImpactInView(impact,{eye,yaw=0,pitch=0,aspect=16/9,tanHalfFov=.95}={},props=[]){
  if(!impact?.contact||!Array.isArray(impact.point)||!Array.isArray(eye))return false;
  if(!props.some(p=>p.id===impact.chipId&&!p.portalDestination)||!props.some(p=>p.id===impact.bodyPart&&!p.portalDestination))return false;
  const relative=impact.point.map((v,k)=>v-eye[k]);
  if(!relative.every(Number.isFinite))return false;
  const basis=cameraBasis(yaw,pitch),depth=dot(relative,basis.forward),radius=.055;
  if(depth<.05||depth>2.4)return false;
  return Math.abs(dot(relative,basis.right))+radius<depth*tanHalfFov*aspect
    &&Math.abs(dot(relative,basis.up))+radius<depth*tanHalfFov;
}
