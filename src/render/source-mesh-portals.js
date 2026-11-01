// Actual mesh views through a finite aperture. Destination instances are
// rigidly transformed into the source chart, then clipped to this eye's cone.
// They retain normal raster depth and receive acquisition once with the world.
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a);if(n<1e-10)throw Error('Degenerate portal frame.');return a.map(v=>v/n);};
export const portalIdentity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
export function portalTransformPoint(m,p){return[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);}
export function portalTransformVector(m,p){return[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]);}
export function portalMultiply(a,b){const m=Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)m[c*4+r]+=a[k*4+r]*b[c*4+k];return m;}
export function portalInverse(m){
  const n=[m[0],m[4],m[8],0,m[1],m[5],m[9],0,m[2],m[6],m[10],0,0,0,0,1];
  const t=portalTransformVector(n,[m[12],m[13],m[14]]);for(let k=0;k<3;k++)n[12+k]=-t[k];return n;
}
export function portalCorners(p){
  const centre=[p.x,p.y??p.feet+1.6,p.z],right=unit(p.right),up=unit(p.up),w=p.halfWidth??1.6,h=p.halfHeight??1.6;
  return[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>centre.map((v,k)=>v+right[k]*w*x+up[k]*h*y));
}
export function portalClipPlanes(p,eye){
  const corners=portalCorners(p),centre=corners[0].map((v,k)=>(v+corners[2][k])/2),toward=sub(centre,eye);
  let n=unit(p.normal);const eyeSide=dot(n,sub(eye,centre));if(eyeSide>=0)n=n.map(v=>-v);
  // At the crossing plane the aperture cone opens to a half-space. Avoid
  // unstable edge planes while the observer lies exactly in that plane.
  if(Math.abs(eyeSide)<.001){
    const relative=sub(eye,centre),inside=Math.abs(dot(relative,unit(p.right)))<=(p.halfWidth??1.6)+1e-7&&Math.abs(dot(relative,unit(p.up)))<=(p.halfHeight??1.6)+1e-7;
    return[[0,0,0,inside?0:-1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[...n,-dot(n,centre)-.0001]];
  }
  const planes=corners.map((a,k)=>{
    let n=unit(cross(sub(a,eye),sub(corners[(k+1)%4],eye)));
    if(dot(n,toward)<0)n=n.map(v=>-v);return[...n,-dot(n,eye)];
  });
  planes.push([...n,-dot(n,centre)-.0001]);return planes;
}
export function transformPortalPlanes(planes,m){
  return planes.map(p=>{const n=portalTransformVector(m,p);return[...n,p[3]-dot(n,[m[12],m[13],m[14]])];});
}
export function portalClipArray(value){
  if(!Array.isArray(value)&&!ArrayBuffer.isView(value))return null;
  const flat=Array.from(value).flat();return flat.length===20&&flat.every(Number.isFinite)?flat:null;
}
export function portalExcludeArray(value){
  if(!Array.isArray(value)&&!ArrayBuffer.isView(value))return null;
  const flat=Array.from(value).flat(3);return[20,40,60].includes(flat.length)&&flat.every(Number.isFinite)?flat:null;
}
export function portalBatchKey(instance,cache=null){
  const part=(value,normalizer)=>{
    if(!value||typeof value!=='object')return null;
    if(cache?.has(value))return cache.get(value);
    const flat=normalizer(value),key=flat?flat.join(','):null;cache?.set(value,key);return key;
  };
  const p=part(instance?.portalClipPlanes,portalClipArray),e=part(instance?.portalExcludePlanes,portalExcludeArray);
  return p||e?'\0mesh-portal:'+String(instance.portalClipId||'')+':'+(p||'all')+'!'+(e||'none'):'';
}
export const SOURCE_MESH_PORTAL_CLIP_GLSL=`
uniform int uMeshPortalClipCount;
uniform vec4 uMeshPortalClipPlanes[5];
uniform int uMeshPortalExcludeCount;
uniform vec4 uMeshPortalExcludePlanes[15];
void clipMeshPortal(vec3 world){
  for(int i=0;i<5;i++){
    if(i>=uMeshPortalClipCount)break;
    if(dot(uMeshPortalClipPlanes[i],vec4(world,1.0))<-.00001)discard;
  }
  for(int portal=0;portal<3;portal++){
    if(portal>=uMeshPortalExcludeCount)break;
    bool inside=true;
    for(int edge=0;edge<5;edge++){
      if(dot(uMeshPortalExcludePlanes[portal*5+edge],vec4(world,1.0))<-.00001)inside=false;
    }
    if(inside)discard;
  }
}
`;
