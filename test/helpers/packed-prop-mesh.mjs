import fs from 'node:fs';
import crypto from 'node:crypto';

// Read actual packed positions, not the rounded generated metadata bounds.
export function packedPropMeshes() {
  const bytes=fs.readFileSync(new URL('../../public/assets/conservatory-props.glb',import.meta.url));
  const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength)),bin=28+jsonLength;
  const read=index=>{
    const a=json.accessors[index],v=json.bufferViews[a.bufferView],n={VEC3:3,SCALAR:1}[a.type];
    const size={5123:2,5125:4,5126:4}[a.componentType],fn={5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType];
    const start=bin+(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*size;
    return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,d)=>bytes[fn](start+i*stride+d*size)));
  };
  const meshes=new Map();
  for(const m of json.meshes)meshes.set(m.name,()=>{
    const triangles=[],vertices=[];
    for(const p of m.primitives){const v=read(p.attributes.POSITION),indices=p.indices==null?v.map((_,i)=>[i]):read(p.indices);for(const point of v)vertices.push(point);for(let i=0;i<indices.length;i+=3)triangles.push(indices.slice(i,i+3).map(([i])=>v[i]));}
    return {vertices,triangles};
  });
  return {sha256:crypto.createHash('sha256').update(bytes).digest('hex'),mesh(name){const get=meshes.get(name);if(!get)throw Error('Missing packed mesh '+name);return get();}};
}

export function placedMesh(p,geometry) {
  const scale=p.scale||1,c=Math.cos(p.yaw),s=Math.sin(p.yaw);
  const transform=([x,y,z])=>{x*=scale*(p.scaleX||1);y*=scale*(p.scaleY||1);z*=scale*(p.scaleZ||1);return[p.x+c*x-s*z,p.y+y,p.z+s*x+c*z];};
  const vertices=geometry.vertices.map(transform),triangles=geometry.triangles.map(t=>t.map(transform));
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(const v of vertices)for(let i=0;i<3;i++){bounds.min[i]=Math.min(bounds.min[i],v[i]);bounds.max[i]=Math.max(bounds.max[i],v[i]);}
  return {id:p.id,vertices,triangles,bounds};
}

export function segmentHitsTriangle(from,to,tri) {
  const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const direction=sub(to,from),e1=sub(tri[1],tri[0]),e2=sub(tri[2],tri[0]),h=cross(direction,e2),det=dot(e1,h);
  if(Math.abs(det)<1e-10)return false;
  const inv=1/det,s=sub(from,tri[0]),u=inv*dot(s,h);if(u<0||u>1)return false;
  const q=cross(s,e1),v=inv*dot(direction,q);if(v<0||u+v>1)return false;
  const t=inv*dot(e2,q);return t>1e-6&&t<1-1e-6;
}
