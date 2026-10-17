import { fireballSurfaceContains,fireballSurfacePose } from './fireball-surface-pose.js';

const STRIKEABLE_STATES=new Set(['outbound']);

// The external webview is deliberately stupid: it may report only the opaque
// cast id and the fixed surface index it was given. The main combat window owns
// the real cast id, the ray, charge, damage, and every gameplay consequence.
function surfaceIdentity(cast){
  if(!cast)return null;
  const castId=String(cast.castId||'');
  const surfaceIndex=Number(cast.surfaceIndex);
  if(!/^cast-[0-9a-f]{8}$/i.test(castId)||!Number.isInteger(surfaceIndex)||surfaceIndex<0||surfaceIndex>3)return null;
  if(!Array.isArray(cast.rays)||!cast.rays[0])return null;
  return Object.freeze({castId,surfaceIndex});
}

export function fireballSurfaceHitPayload(cast){
  if(!STRIKEABLE_STATES.has(String(cast?.state||'')))return null;
  return surfaceIdentity(cast);
}

// Resolve locally on the first visible-tile press while the main window owns
// charge and damage. Padding reports its identity as a miss without consuming it.
export function strikeFireballSurface(cast,emitHit=()=>{},{x,y,width,height,pose:poseOverride=null}={}){
  const payload=fireballSurfaceHitPayload(cast);
  const pose=poseOverride||fireballSurfacePose(cast,{width,height});
  if(!payload||!fireballSurfaceContains(pose,{x,y})){
    const identity=surfaceIdentity(cast);
    return Object.freeze({hit:false,miss:!!identity,cast,payload:identity});
  }
  const next=Object.freeze({...cast,state:'deflected'});
  void Promise.resolve().then(()=>emitHit(payload)).catch(()=>null);
  return Object.freeze({hit:true,miss:false,cast:next,payload});
}
