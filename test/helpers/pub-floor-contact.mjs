import fs from 'node:fs';
import crypto from 'node:crypto';
export function pubFloorContacts({rendered,thresholds,bounds,packPath=new URL('../../public/assets/conservatory-props.glb',import.meta.url)}){
 const bytes=fs.readFileSync(packPath),jsonLength=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+jsonLength)),binStart=20+jsonLength+8;
 const accessor=index=>{const a=gltf.accessors[index],v=gltf.bufferViews[a.bufferView],components={SCALAR:1,VEC3:3}[a.type],size={5123:2,5125:4,5126:4}[a.componentType],read={5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType];
  if(!components||!size||!read)throw Error('Unexpected pub floor accessor');
  const start=binStart+(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||size*components;
  return Array.from({length:a.count},(_,i)=>Array.from({length:components},(_,j)=>bytes[read](start+i*stride+j*size)));
 };
 const mesh=gltf.meshes.find(m=>m.name==='exterior_pub_interior'),host=rendered.get('pub-complete-interior');if(!mesh||!host)throw Error('Missing packed pub floor or runtime host');
 const c=Math.cos(host.yaw),s=Math.sin(host.yaw),triangles=[];
 for(const p of mesh.primitives){const positions=accessor(p.attributes.POSITION),indices=p.indices==null?positions.map((_,i)=>[i]):accessor(p.indices);
  for(let i=0;i<indices.length;i+=3){const points=indices.slice(i,i+3).map(([index])=>{const[x,y,z]=positions[index];return[host.x+c*x-s*z,host.y+y,host.z+s*x+c*z];});
   if(Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))<1e-6&&points[0][1]>.12&&points[0][1]<.15)triangles.push(points);
  }
 }
 const floorAt=(x,z)=>{let top=-Infinity;for(const [a,b,c]of triangles){const den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(den)<1e-10)continue;
  const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den;
  if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7)top=Math.max(top,a[1]);
 }return Number.isFinite(top)?top:null;};
 const contacts=thresholds.map(p=>{const r=rendered.get(p.id),b=bounds[p.mesh],bottom=r.y+b.min[1],top=r.y+b.max[1];
  // Five samples just inside the real pub/WC edge, including the main span.
  const samples=[-.35,-.175,0,.175,.35].map(dx=>{const point=[r.x+dx,r.z+.06],floor=floorAt(...point);return{point,floor,bottom,top,contact:floor!==null&&bottom<=floor+.001&&top>=floor-.001&&top-floor<=.004};});
  return{id:p.id,passed:samples.every(s=>s.contact),samples};
 });
 return{packSha256:crypto.createHash('sha256').update(bytes).digest('hex'),mesh:mesh.name,horizontalFloorTriangles:triangles.length,contacts};
}
