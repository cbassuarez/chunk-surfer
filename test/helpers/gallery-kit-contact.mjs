import fs from'node:fs';
import crypto from'node:crypto';
import{PROP_BOUNDS}from'../../src/data/generated/prop-geometry.js';
export function loadGalleryGeometry(){
 const bytes=fs.readFileSync(new URL('../../public/assets/academic-gallery.glb',import.meta.url)),jl=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+jl)),bin=28+jl;
 const accessor=index=>{const a=j.accessors[index],v=j.bufferViews[a.bufferView],size={5123:2,5125:4,5126:4}[a.componentType],dim={SCALAR:1,VEC3:3}[a.type],read={5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType],start=bin+(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||size*dim;
  return Array.from({length:a.count},(_,i)=>Array.from({length:dim},(_,d)=>bytes[read](start+i*stride+d*size)));};
 const meshes=new Map(j.meshes.map(m=>{const triangles=[],points=[];for(const p of m.primitives){const v=accessor(p.attributes.POSITION),indices=p.indices==null?v.map((_,i)=>[i]):accessor(p.indices);points.push(...v);for(let i=0;i<indices.length;i+=3)triangles.push(indices.slice(i,i+3).map(([k])=>v[k]));}return[m.name,{triangles,bounds:{min:[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...points.map(p=>p[i])))}}];}));
 return{sha256:crypto.createHash('sha256').update(bytes).digest('hex'),meshes};
}
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function hit(from,to,tri){const dir=sub(to,from),e1=sub(tri[1],tri[0]),e2=sub(tri[2],tri[0]),h=cross(dir,e2),det=dot(e1,h);if(Math.abs(det)<1e-10)return null;const inv=1/det,s=sub(from,tri[0]),u=inv*dot(s,h);if(u<0||u>1)return null;const q=cross(s,e1),v=inv*dot(dir,q);if(v<0||u+v>1)return null;const t=inv*dot(e2,q);return t>1e-7&&t<1-1e-7?t:null;}
export function galleryFixtureFrontObstructions(rendered,{fixtures=null,eyes=null,geometry=loadGalleryGeometry()}={}){
 const transform=(p,[x,y,z])=>{const scale=p.scale||1,c=Math.cos(p.yaw),s=Math.sin(p.yaw);x*=scale*(p.scaleX||1);y*=scale*(p.scaleY||1);z*=scale*(p.scaleZ||1);return[p.x+c*x-s*z,p.y+y,p.z+s*x+c*z];};
 const owners=rendered.filter(p=>p.id.startsWith('gallery-treatment-')&&/bench|planter|console|wall_bay/.test(p.mesh)).map(p=>({id:p.id,triangles:geometry.meshes.get(p.mesh).triangles.map(t=>t.map(v=>transform(p,v)))}));
 const kit=fixtures||rendered.filter(p=>p.id.startsWith('architecture-space-academic-gallery-')&&!p.id.endsWith('-detector'));
 return kit.map(p=>{const b=PROP_BOUNDS[p.mesh],c=Math.cos(p.yaw),s=Math.sin(p.yaw),n=[-s,0,c],samples=[];
  for(const x of[b.min[0]*.7,0,b.max[0]*.7])for(const t of[.2,.5,.8]){const y=b.min[1]+(b.max[1]-b.min[1])*t,z=b.max[2],target=[p.x+c*x-s*z,p.y+y,p.z+s*x+c*z],from=target.map((v,i)=>v+n[i]*.9),eye=eyes?.[p.id];
   const blockers=owners.filter(o=>o.triangles.some(tr=>hit(from,target,tr)!==null)).map(o=>o.id),cameraBlockers=eye?owners.filter(o=>o.triangles.some(tr=>hit(eye,target,tr)!==null)).map(o=>o.id):[];
   samples.push({target,blockers,cameraBlockers});
  }return{id:p.id,mesh:p.mesh,position:[p.x,p.y,p.z],samples};
 });
}
