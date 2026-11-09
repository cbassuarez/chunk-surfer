// Bounded native mesh images of the fixed Source-II/III address lattice. These
// views never move an actor, choose a landing, advance a clock or add a light.
import {continuationVoidDomain} from '../data/source-continuation-void.js';
import {portalClipPlanes,portalMultiply,portalTransformPoint,portalInverse,transformPortalPlanes} from './source-mesh-portals.js';

export const SOURCE_VOID_VIEW_LIMITS=Object.freeze({cells:9,copiesPerCell:760,upperCopies:760,props:760,lights:18,pressure:4});
const finite=(v,d=0)=>Number.isFinite(v)?v:d;
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const translation=(x,y,z)=>{const m=identity();m[12]=x;m[13]=y;m[14]=z;return m;};
const chart=p=>p?.chartId??0;

export function sourceContinuationVoidDomain(state){
 if(state?.phase==='catch')return continuationVoidDomain(state?.fall?.voidLoop)||continuationVoidDomain('source-iii-void:catch');
 return continuationVoidDomain(state?.fall?.voidLoop)||continuationVoidDomain(state);
}
function aperture(domain,x,z,y,normal){return{x,y,z,chartId:domain.chartId,
 right:[1,0,0],up:[0,0,1],normal,halfWidth:domain.periodX/2,halfHeight:domain.periodZ/2};}
function visible(endpoint,eye,basis){
 const delta=[endpoint.x-eye[0],endpoint.y-eye[1],endpoint.z-eye[2]],r=Math.hypot(endpoint.halfWidth,endpoint.halfHeight);
 return dot(endpoint.normal,eye.map((v,k)=>v-[endpoint.x,endpoint.y,endpoint.z][k]))>=-.001
  &&(!basis||dot(delta,basis.forward)>-r);
}

export function sourceContinuationVoidViews(state,{eye,basis,aspect=16/9},domain=sourceContinuationVoidDomain(state)){
 if(!domain||chart(state)!==domain.chartId)return{domain:null,lower:[],upper:[],excludes:[]};
 const cx=(domain.minX+domain.maxX)/2,cz=(domain.minZ+domain.maxZ)/2,
  tileX=Math.floor((eye[0]-domain.minX)/domain.periodX),tileZ=Math.floor((eye[2]-domain.minZ)/domain.periodZ),lower=[];
 for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
  const x=tileX+dx,z=tileZ+dz,endpoint=aperture(domain,cx+x*domain.periodX,cz+z*domain.periodZ,domain.exitY,[0,1,0]);
  if(!visible(endpoint,eye,basis))continue;
  lower.push({id:`void:${domain.id}:below:${x}:${z}`,kind:'lower',domainId:domain.id,tileX:x,tileZ:z,endpoint,
   toCurrent:translation(x*domain.periodX,-domain.translationY,z*domain.periodZ),
   planes:portalClipPlanes(endpoint,eye),eye:[...eye],basis,aspect,distance:Math.hypot(endpoint.x-eye[0],endpoint.y-eye[1],endpoint.z-eye[2])});
 }
 lower.sort((a,b)=>a.distance-b.distance);
 const receipt=state.lastSpaceWrap?.domainId===domain.id?state.lastSpaceWrap:null,
  x=finite(receipt?.tileX),z=finite(receipt?.tileZ),endpoint=aperture(domain,cx,cz,domain.entryY,[0,-1,0]);
 const upper=visible(endpoint,eye,basis)?[{id:`void:${domain.id}:above:${x}:${z}`,kind:'upper',domainId:domain.id,tileX:x,tileZ:z,endpoint,
  toCurrent:translation(-x*domain.periodX,domain.translationY,-z*domain.periodZ),
  planes:portalClipPlanes(endpoint,eye),eye:[...eye],basis,aspect,distance:Math.hypot(endpoint.x-eye[0],endpoint.y-eye[1],endpoint.z-eye[2])}]:[];
 return{domain,lower,upper,excludes:upper.map(v=>v.planes)};
}

function localBounds(p,origin){
 const b=p.physicalBounds;
 if(b?.min?.length===3&&b?.max?.length===3)return b;
 const at=[finite(p.x)-origin.x,finite(p.y)-origin.y,finite(p.z)-origin.z],radius=Math.max(.15,finite(p.cullRadius,.5));
 return{min:at.map(v=>v-radius),max:at.map(v=>v+radius)};
}
function intersectsCone(p,view,origin,b=localBounds(p,origin)){
 const planes=view.testPlanes||(view.testPlanes=[...view.planes]);
 if(view.basis&&!view.frustumReady){
  const {forward,right,up}=view.basis;
  for(const [axis,width]of [[right,.95*view.aspect],[up,.95]])for(const side of [-1,1]){
   const n=forward.map((v,k)=>v*width+axis[k]*side);planes.push([...n,-dot(n,view.eye)]);
  }
  planes.push([...forward,-dot(forward,view.eye)-.005]);view.frustumReady=true;
 }
 // These images are fixed translations, never rotations or scale. Test the
 // most positive AABB corner analytically instead of allocating eight points
 // for every mesh in every visible cell on every frame.
 const tx=view.toCurrent[12],ty=view.toCurrent[13],tz=view.toCurrent[14];
 for(const plane of planes){
  const x=plane[0],y=plane[1],z=plane[2];
  if(plane[3]+x*((x>=0?b.max:b.min)[0]+tx)+y*((y>=0?b.max:b.min)[1]+ty)+z*((z>=0?b.max:b.min)[2]+tz)<-.0001)return false;
 }
 return true;
}
// Existing physical bounds are exact model-space AABBs. Only these may be
// dropped from the canonical draw list when the observer is below the world;
// unknown dressing retains its ordinary renderer culling contract.
export function sourceContinuationVoidVisibility({eye,basis,aspect=16/9},origin={x:0,y:0,z:0}){
 // The camera cone is common to this frame. It must not be rebuilt for every
 // canonical prop; no camera, geometry or result survives into the next frame.
 const view={toCurrent:identity(),planes:[],eye,basis,aspect};
 return p=>{
  if(!p.physicalBounds||p.restAffliction||p.restDrift||p.restDetached||p.restFracture||p.restPainRattle||p.restRebuilt)return true;
  return intersectsCone(p,view,origin);
 };
}
export function sourceContinuationVoidInFrustum(p,presentation,origin={x:0,y:0,z:0}){
 return sourceContinuationVoidVisibility(presentation,origin)(p);
}
function imageFrame(view,origin){
 return{map:portalMultiply(translation(origin.x,origin.y,origin.z),portalMultiply(view.toCurrent,translation(-origin.x,-origin.y,-origin.z))),
  planes:transformPortalPlanes(view.planes,translation(origin.x,origin.y,origin.z))};
}
function voidInstance(p,view,{map,planes}){
 const position=portalTransformPoint(map,[p.x,p.y,p.z]);
 return{...p,id:`${p.id}:through:${view.id}`,canonicalId:p.canonicalId||p.id,matrix:portalMultiply(map,p.matrix||translation(p.x,p.y,p.z)),
  x:position[0],y:position[1],z:position[2],...((p.surroundings||p.sourceWorldMatrix)?{sourceWorldMatrix:portalMultiply(map,p.sourceWorldMatrix||identity())}:{}),portalClipPlanes:planes,
  portalExcludePlanes:null,portalClipId:view.id,portalDestination:true,voidImage:true,voidDomainId:view.domainId,voidImageKind:view.kind,
  noShadow:true,noReflection:true};
}
export function sourceContinuationVoidInstance(p,view,origin={x:0,y:0,z:0}){
 return voidInstance(p,view,imageFrame(view,origin));
}

export function sourceContinuationVoidCopies({views,canonicalProps,canonicalLights=[],origin={x:0,y:0,z:0},remaining=SOURCE_VOID_VIEW_LIMITS.props}){
 const {domain}=views;if(!domain)return{props:[],lights:[],diagnostics:{active:false}};
 const props=[],lights=[],candidates=canonicalProps.filter(p=>chart(p)===domain.chartId&&!p.playerBody&&!p.operatorClothing),
  owner=candidates.find(p=>p.descriptorId===domain.surfaceId),all=[...views.lower,...views.upper],
  bounds=new Map(candidates.map(p=>[p,localBounds(p,origin)]));
 const budget=Math.max(0,Math.min(SOURCE_VOID_VIEW_LIMITS.props,remaining));
 let omittedCells=0,upperCandidates=0,upperCopied=0,visibleCandidates=0,omittedVisible=0;
 // Exact native geometry is selected by both the physical aperture and the
 // ordinary camera frustum. The old six-part miniature was not continuous:
 // its missing architecture appeared when the eye crossed the seam.
 for(const view of all){
  const sourceEye=portalTransformPoint(portalInverse(view.toCurrent),view.eye),distance=p=>{
   const b=bounds.get(p);return Math.hypot(sourceEye[0]-Math.max(b.min[0],Math.min(b.max[0],sourceEye[0])),
    sourceEye[1]-Math.max(b.min[1],Math.min(b.max[1],sourceEye[1])),sourceEye[2]-Math.max(b.min[2],Math.min(b.max[2],sourceEye[2])));};
  // Stable distance order and owner priority are unchanged. Resolve each key
  // once instead of allocating bounds and point arrays in every comparator.
  const rows=candidates.filter(p=>intersectsCone(p,view,origin,bounds.get(p)))
   .map(p=>({p,distance:p===owner?-1e6:distance(p)})).sort((a,b)=>a.distance-b.distance).map(row=>row.p);
  visibleCandidates+=rows.length;if(view.kind==='upper')upperCandidates+=rows.length;
  const room=Math.max(0,budget-props.length),taken=rows.slice(0,room);
  if(rows.length&&!taken.length)omittedCells++;
  omittedVisible+=rows.length-taken.length;
  if(taken.length){const image=imageFrame(view,origin);for(const p of taken)props.push(voidInstance(p,view,image));}
  if(view.kind==='upper')upperCopied+=taken.length;
 }
 for(const view of all)for(const light of canonicalLights){
  if(lights.length>=SOURCE_VOID_VIEW_LIMITS.lights||chart(light)!==domain.chartId)continue;
  const x=light.x-origin.x,z=light.z-origin.z,y=light.y-origin.y;
  if(x<domain.minX-5||x>domain.maxX+5||z<domain.minZ-5||z>domain.maxZ+5||y<domain.elevation-.5||y>domain.entryY+3)continue;
  const q=portalTransformPoint(view.toCurrent,[x,y,z]);lights.push({...light,id:`${light.id}:through:${view.id}`,x:q[0]+origin.x,y:q[1]+origin.y,z:q[2]+origin.z,voidImage:true,portalClipId:view.id});
 }
 return{props,lights,diagnostics:{active:true,domainId:domain.id,cells:views.lower.length,upperViews:views.upper.length,
  candidates:candidates.length,visibleCandidates,omittedVisible,upperCandidates,upperCopied,copies:props.length,lights:lights.length,omittedCells,budget,
  policy:'Actual support plus fixed local native geometry; no repeated simulation, new asset, dark cover or material substitution.'}};
}

export function sourceContinuationVoidAcousticPoint(views,eye,point){
 if(!views?.domain)return{...point};
 let best=[point.x,point.y,point.z],distance=Math.hypot(...best.map((v,k)=>v-eye[k]));
 for(const view of[...views.lower,...views.upper]){
  const q=portalTransformPoint(view.toCurrent,[point.x,point.y,point.z]),d=Math.hypot(...q.map((v,k)=>v-eye[k]));
  if(d<distance&&view.planes.every(p=>dot(p.slice(0,3),q)+p[3]>=-.0001)){best=q;distance=d;}
 }
 return{x:best[0],y:best[1],z:best[2]};
}
