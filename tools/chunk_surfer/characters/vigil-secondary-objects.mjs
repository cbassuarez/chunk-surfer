// Small hand-bound articles, distinct from each actor's independent main prop.
// Owen's old keys have real open bows, cut bits and a split ring. Their rigid
// hand weighting uses the same frame as the live thumb/index pinch targets.
import {OWEN_KEY_RING,vigilHandFrame,vigilHandPoint} from '../../../src/data/vigil-secondary-object-layout.js';
import {ShapeUtils,Vector2} from 'three';
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,n)=>a.map(v=>v*n);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>mul(a,1/(Math.hypot(...a)||1));
function geometry(name,material,points,faces,frame,bone){
  const positions=points.flatMap(p=>vigilHandPoint(frame,p)),indices=faces.flatMap(face=>{const out=[];for(let i=1;i<face.length-1;i++)out.push(face[0],face[i],face[i+1]);return out;}),normals=new Array(positions.length).fill(0);
  for(let i=0;i<indices.length;i+=3){const ids=indices.slice(i,i+3),p=ids.map(v=>positions.slice(v*3,v*3+3)),n=cross(sub(p[1],p[0]),sub(p[2],p[0]));for(const v of ids)for(let j=0;j<3;j++)normals[v*3+j]+=n[j];}
  for(let i=0;i<normals.length;i+=3)normals.splice(i,3,...unit(normals.slice(i,i+3)));
  return{name,material,positions,normals,indices,skinIndex:points.flatMap(()=>[bone,0,0,0]),skinWeight:points.flatMap(()=>[1,0,0,0])};
}
function torus(name,material,center,radius,wire,frame,bone,{segments=40,sides=8,start=0,end=Math.PI*2,rise=0}={}){
  const points=[],faces=[];
  for(let i=0;i<=segments;i++){const t=i/segments,a=start+(end-start)*t;for(let j=0;j<sides;j++){const b=j*Math.PI*2/sides,r=radius+Math.cos(b)*wire;points.push(add(center,[Math.sin(a)*r,-Math.cos(a)*r,Math.sin(b)*wire+rise*(t-.5)]));if(i)faces.push([(i-1)*sides+j,i*sides+j,i*sides+(j+1)%sides,(i-1)*sides+(j+1)%sides]);}}
  if(end-start<Math.PI*2-.001||rise){faces.push(Array.from({length:sides},(_,i)=>i));faces.push(Array.from({length:sides},(_,i)=>segments*sides+sides-1-i));}
  return geometry(name,material,points,faces,frame,bone);
}
function extruded(name,material,polygon,thickness,frame,bone,transform=p=>p){
  const n=polygon.length,points=[-1,1].flatMap(side=>polygon.map(([x,y])=>transform([x,y,side*thickness/2]))),triangles=ShapeUtils.triangulateShape(polygon.map(p=>new Vector2(...p)),[]),faces=triangles.flatMap(t=>[[t[2],t[1],t[0]],t.map(i=>i+n)]);
  for(let i=0;i<n;i++)faces.push([i,(i+1)%n,(i+1)%n+n,i+n]);
  return geometry(name,material,points,faces,frame,bone);
}
export function secondaryVigilObjects(id,bones,materials){
  if(id!=='owen')return[];
  const bone=bones.findIndex(b=>b.name==='hand_L');if(bone<0)throw Error('Owen keys require hand_L');
  const frame=vigilHandFrame(bones,'L'),ring=OWEN_KEY_RING,out=[torus('old steel split keyring',materials.metal,ring.center,ring.radius,ring.wire,frame,bone,{segments:56,start:-.13,end:Math.PI*2+.13,rise:.0048})];
  const patterns=[
    {angle:-.30,z:-.003,length:.048,width:.0062,bit:[0,.005,.011,.016]},
    {angle:.03,z:.002,length:.058,width:.0068,bit:[0,.009,.014,.019]},
    {angle:.31,z:.006,length:.043,width:.0058,bit:[0,.004,.013,.018]},
  ];
  for(const [i,p]of patterns.entries()){
    const origin=add(ring.center,[Math.sin(p.angle)*ring.radius*.58,ring.radius*.73,p.z]),cs=Math.cos(p.angle),sn=Math.sin(p.angle),transform=([x,y,z])=>add(origin,[x*cs-y*sn,x*sn+y*cs,z]);
    out.push(torus('old key '+i+' open bow',materials.metal,origin,.0077,.0019,frame,bone,{segments:28,sides:8}));
    // The shoulder overlaps the bow at its low arc. Uneven cut teeth belong to
    // a solid extruded outline rather than loose floating cubes.
    const y=.0056,w=p.width/2,end=p.length,b=p.bit;
    const outline=[[-w,y],[w,y],[w,end-.019],[w+.0037,end-.019+b[0]],[w+.0037,end-.015],[w,end-.015],[w,end-.012],[w+.0027,end-.012],[w+.0027,end-.008],[w,end-.008],[w,end-.005],[w+.0047,end-.005],[w+.0047,end],[ -w,end]];
    // Different notches/lengths keep the three worn keys individually legible.
    outline[4][1]-=b[1]*.20;outline[8][1]-=b[2]*.12;outline[12][1]-=b[3]*.08;
    out.push(extruded('old key '+i+' cut blade',materials.metal,outline,.0026,frame,bone,transform));
    out.push(extruded('old key '+i+' dark blade groove',materials.ink,[[-.00045,.012],[.00045,.012],[.00045,end-.021],[-.00045,end-.021]],.00025,frame,bone,p=>transform([p[0]-.0007,p[1],p[2]-.00143])));
  }
  return out;
}
