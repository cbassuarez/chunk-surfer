import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {PRACTICE_METRONOMES} from '../src/game/practice-metronomes.js';
import {practiceMetronomeGeometry,practiceMetronomePlacement} from '../src/render/practice-metronome-model.js';

const HOSTS=Object.freeze({
  'practice-metronome-lesson':'practice-piano-2',
  'practice-metronome-claimed':'practice-piano-4',
  'practice-metronome-rehearsal':'practice-piano-5',
  'practice-metronome-paper':'practice-piano-6',
  'practice-metronome-emptied':'practice-piano-7',
  'practice-metronome-ensemble':'practice-ensemble-marimba',
});
const CONTACT_TOLERANCE=.004;
const assetPath=new URL('../public/assets/conservatory-props.glb',import.meta.url),bytes=fs.readFileSync(assetPath);
function parseGLB(data){
  assert.equal(data.readUInt32LE(0),0x46546c67);assert.equal(data.readUInt32LE(4),2);
  let json,bin;
  for(let offset=12;offset<data.length;){
    const length=data.readUInt32LE(offset),type=data.readUInt32LE(offset+4),chunk=data.subarray(offset+8,offset+8+length);
    if(type===0x4e4f534a)json=JSON.parse(chunk.toString());else if(type===0x004e4942)bin=chunk;offset+=8+length;
  }
  assert.ok(json&&bin);return{json,bin};
}
const{json:glb,bin}=parseGLB(bytes);
function accessor(index){
  const a=glb.accessors[index],v=glb.bufferViews[a.bufferView],width={SCALAR:1,VEC3:3}[a.type],size={5121:1,5123:2,5125:4,5126:4}[a.componentType],
    getter={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType];
  assert.ok(width&&size&&!a.sparse,'ordinary packed positions and indices');
  const offset=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||width*size;
  return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,k)=>bin[getter](offset+i*stride+k*size)));
}
const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
// Same glTF TRS convention as the ordinary P3 pack loader, including authored
// node transforms. Production placements below come directly from PROPS.
function nodeMatrix(node={}){
  if(node.matrix)return new Float32Array(node.matrix);
  const t=node.translation||[0,0,0],s=node.scale||[1,1,1],[x,y,z,w]=node.rotation||[0,0,0,1];
  return new Float32Array([(1-2*y*y-2*z*z)*s[0],(2*x*y+2*w*z)*s[0],(2*x*z-2*w*y)*s[0],0,
    (2*x*y-2*w*z)*s[1],(1-2*x*x-2*z*z)*s[1],(2*y*z+2*w*x)*s[1],0,
    (2*x*z+2*w*y)*s[2],(2*y*z-2*w*x)*s[2],(1-2*x*x-2*y*y)*s[2],0,...t,1]);
}
const transform=(matrix,p)=>[0,1,2].map(k=>matrix[k]*p[0]+matrix[4+k]*p[1]+matrix[8+k]*p[2]+matrix[12+k]);
function packedTriangles(name){
  const index=glb.meshes.findIndex(mesh=>mesh.name===name);assert.ok(index>=0,name);
  const mesh=glb.meshes[index],node=glb.nodes.find(node=>node.mesh===index),matrix=node?nodeMatrix(node):identity();
  return mesh.primitives.flatMap((primitive,pi)=>{
    assert.ok(primitive.mode===undefined||primitive.mode===4);
    const positions=accessor(primitive.attributes.POSITION).map(p=>transform(matrix,p)),indices=primitive.indices===undefined?positions.map((_,i)=>i):accessor(primitive.indices).flat();
    return Array.from({length:indices.length/3},(_,ti)=>({id:`${name}:primitive${pi}:triangle${ti}`,material:glb.materials[primitive.material]?.name||null,points:indices.slice(ti*3,ti*3+3).map(i=>positions[i])}));
  });
}
const packed=new Map(['upright_piano','marimba'].map(name=>[name,packedTriangles(name)]));
const signedArea=poly=>poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2;
function triangleHeight(x,z,points){
  const[a,b,c]=points,dx=b[0]-a[0],dz=b[2]-a[2],ex=c[0]-a[0],ez=c[2]-a[2],den=dx*ez-ex*dz;
  if(Math.abs(den)<1e-10)return null;
  const u=((x-a[0])*ez-ex*(z-a[2]))/den,v=(dx*(z-a[2])-(x-a[0])*dz)/den;
  if(u< -1e-7||v< -1e-7||u+v>1+1e-7)return null;
  return a[1]+u*(b[1]-a[1])+v*(c[1]-a[1]);
}
function clippedArea(polygon,triangle){
  let out=polygon.map(p=>[...p]),clip=triangle.map(p=>[p[0],p[2]]);
  if(signedArea(clip)<0)clip=clip.reverse();
  for(let edge=0;edge<3;edge++){
    const a=clip[edge],b=clip[(edge+1)%3],cross=p=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]),input=out;out=[];
    if(!input.length)break;
    for(let i=0;i<input.length;i++){
      const p=input[i],q=input[(i+1)%input.length],dp=cross(p),dq=cross(q),pin=dp>=-1e-10,qin=dq>=-1e-10;
      if(pin)out.push(p);
      if(pin!==qin){const t=dp/(dp-dq);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
    }
  }
  return out.length<3?0:Math.abs(signedArea(out));
}
function footPolygons(){
  const mesh=practiceMetronomeGeometry().find(p=>p.name==='practice_metronome_ink');assert.ok(mesh);
  const bottom=Math.min(...mesh.p.filter((_,i)=>i%3===1)),unique=new Map();
  for(let at=0;at<mesh.p.length;at+=3){const p=mesh.p.slice(at,at+3);if(Math.abs(p[1]-bottom)<1e-9)unique.set(p.join(','),p);}
  const groups=new Map();
  for(const p of unique.values()){const key=`${p[0]<0?'left':'right'}-${p[2]<0?'front':'back'}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}
  assert.equal(groups.size,4,'four literal rubber contact patches');
  return[...groups].map(([id,points])=>{
    const center=[0,1,2].map(k=>points.reduce((sum,p)=>sum+p[k],0)/points.length);
    points.sort((a,b)=>Math.atan2(a[2]-center[2],a[0]-center[0])-Math.atan2(b[2]-center[2],b[0]-center[0]));
    return{id,center,points};
  });
}
const feet=footPolygons();
function analyze(instance,host){
  const matrix=practiceMetronomePlacement(instance),hostMatrix=practiceMetronomePlacement(host),triangles=packed.get(host.mesh).map(t=>({...t,points:t.points.map(p=>transform(hostMatrix,p))}));
  const footResults=feet.map(foot=>{
    const corners=foot.points.map(p=>transform(matrix,p)),center=transform(matrix,foot.center),y=center[1],polygon=corners.map(p=>[p[0],p[2]]),area=Math.abs(signedArea(polygon));
    const contactTriangles=triangles.filter(t=>t.points.every(p=>Math.abs(p[1]-y)<=CONTACT_TOLERANCE));
    const supportArea=contactTriangles.reduce((sum,t)=>sum+clippedArea(polygon,t.points),0);
    const samples=[...corners,center].map(p=>{
      const hit=triangles.map(t=>({id:t.id,material:t.material,y:triangleHeight(p[0],p[2],t.points)})).filter(t=>Number.isFinite(t.y)).sort((a,b)=>b.y-a.y)[0]||null;
      return{world:p,support:hit,gap:hit?p[1]-hit.y:null};
    });
    return{id:foot.id,worldCenter:center,corners,area,supportArea,supportRatio:supportArea/area,samples,
      supported:samples.every(p=>p.gap!==null&&Math.abs(p.gap)<=CONTACT_TOLERANCE)&&Math.abs(supportArea/area-1)<.0001};
  });
  return{id:instance.id,hostId:host.id,instance,host,feet:footResults,supported:footResults.every(f=>f.supported)};
}
FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
  connectors:conservatory.connectors||[],edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});
PROPS.propsInit(FP);
const normalized=new Map(PROPS.renderSelectedHosts({group:'upper',select:p=>p.id in HOSTS||Object.values(HOSTS).includes(p.id)}).map(p=>[p.id,p]));
const receipts=Object.entries(HOSTS).map(([id,host])=>{assert.ok(normalized.has(id)&&normalized.has(host));return analyze(normalized.get(id),normalized.get(host));});
const hashFile=url=>crypto.createHash('sha256').update(fs.readFileSync(url)).digest('hex');
if(process.env.METRONOME_SUPPORT_RECEIPT){
  const filename=path.resolve(process.env.METRONOME_SUPPORT_RECEIPT);fs.mkdirSync(path.dirname(filename),{recursive:true});
  fs.writeFileSync(filename,JSON.stringify({method:'production FP.compile + PROPS.propsInit + renderSelectedHosts; actual detailed foot contact polygons clipped against actual packed host top triangles',scope:'CPU geometry support proof; no native traversal or visual acceptance',toleranceM:CONTACT_TOLERANCE,
    sourceHashes:{'public/assets/conservatory-props.glb':hashFile(assetPath),'src/data/conservatory-props.js':hashFile(new URL('../src/data/conservatory-props.js',import.meta.url)),'src/render/practice-metronome-model.js':hashFile(new URL('../src/render/practice-metronome-model.js',import.meta.url)),'src/game/props.js':hashFile(new URL('../src/game/props.js',import.meta.url))},receipts},null,2)+'\n');
}

test('all six detailed instruments and their real production-normalized hosts are present',()=>{
  assert.deepEqual(Object.keys(HOSTS).sort(),PRACTICE_METRONOMES.map(v=>v.id).sort());
  assert.equal(receipts.length,6);assert.equal(feet.length,4);
  assert.ok(receipts.every(r=>r.feet.every(f=>f.corners.length===8)),'eight actual bevel-contact vertices per foot');
});
for(const receipt of receipts)test(`${receipt.id}: all four physical feet rest on actual packed ${receipt.host.mesh} top triangles`,()=>{
  for(const foot of receipt.feet){
    const gaps=foot.samples.map(p=>p.gap),reason=`${foot.id}: ${(foot.supportRatio*100).toFixed(2)}% support area; gaps ${gaps.map(g=>g===null?'no host below':(g*1000).toFixed(3)+'mm').join(', ')}`;
    assert.ok(foot.supported,reason);
  }
});
