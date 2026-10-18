import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {CONSERVATORY_PROPS} from '../src/data/conservatory-props.js';

const bytes=fs.readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url));
const jsonLength=bytes.readUInt32LE(12),glb=JSON.parse(bytes.subarray(20,20+jsonLength).toString()),bin=20+jsonLength+8;
const accessor=id=>{const a=glb.accessors[id],v=glb.bufferViews[a.bufferView],width=a.type==='VEC3'?3:1,size={5121:1,5123:2,5125:4,5126:4}[a.componentType];assert.ok(size);const read={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType],start=bin+(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||size*width;return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,k)=>bytes[read](start+i*stride+k*size)));};
const mesh=name=>{const m=glb.meshes.find(m=>m.name===name);assert.ok(m,name);return m;};
const points=name=>mesh(name).primitives.flatMap(p=>accessor(p.attributes.POSITION));
const triangles=name=>mesh(name).primitives.flatMap(p=>{const ps=accessor(p.attributes.POSITION),is=p.indices===undefined?ps.map((_,i)=>i):accessor(p.indices).flat(),out=[];for(let i=0;i<is.length;i+=3)out.push(is.slice(i,i+3).map(k=>ps[k]));return out;});
const inside=(p,t)=>{const[a,b,c]=t,v0=[b[0]-a[0],b[2]-a[2]],v1=[c[0]-a[0],c[2]-a[2]],v2=[p[0]-a[0],p[2]-a[2]],den=v0[0]*v1[1]-v1[0]*v0[1];if(Math.abs(den)<1e-9)return false;const u=(v2[0]*v1[1]-v1[0]*v2[1])/den,v=(v0[0]*v2[1]-v2[0]*v0[1])/den;return u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6;};
const world=(q,r)=>{const c=Math.cos(r.yaw),s=Math.sin(r.yaw),u=r.scale||1;return[r.x+u*(c*q[0]-s*q[2]),r.y+u*q[1],r.z+u*(s*q[0]+c*q[2])];};
const local=(q,r)=>{const c=Math.cos(r.yaw),s=Math.sin(r.yaw),u=r.scale||1,x=(q[0]-r.x)/u,z=(q[2]-r.z)/u;return[c*x+s*z,(q[1]-r.y)/u,-s*x+c*z];};

test('exam metronome rests across actual packed piano-lid triangles and follows its host height',()=>{
  FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors||[],edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});
  const source=CONSERVATORY_PROPS.find(p=>p.id==='practice-metronome-exam'),host=CONSERVATORY_PROPS.find(p=>p.id==='practice-piano-1');
  assert.equal(source.on,host.id,'a typed height alone lets the metronome hang beside the piano again');
  const ps=points(source.mesh),bottom=Math.min(...ps.map(p=>p[1])),xs=ps.map(p=>p[0]),zs=ps.map(p=>p[2]);
  const feet=[[-1,-1],[-1,1],[1,-1],[1,1],[0,0]].map(([x,z])=>[x?Math[x<0?'min':'max'](...xs):0,bottom,z?Math[z<0?'min':'max'](...zs):0]);
  const surface=triangles(host.mesh).filter(t=>t.every(p=>Math.abs(p[1]-t[0][1])<1e-6)&&t[0][1]>1.3).sort((a,b)=>b[0][1]-a[0][1]);
  assert.ok(surface.length,'no actual top lid triangles');
  for(const scale of[1,1.1]){
    const placed=PROPS.propsInit(FP,[{...host,scale},source]),r=new Map(PROPS.renderInstances({inscriptions:false}).map(p=>[p.id,p])),m=placed.find(p=>p.id===source.id);
    assert.equal(m.restsOn,host.id);
    for(const foot of feet){const at=local(world(foot,r.get(source.id)),r.get(host.id)),support=surface.find(t=>inside(at,t));assert.ok(support,'actual metronome base corner overhangs the lid');assert.ok(Math.abs(at[1]-support[0][1])<=.004,'metronome floats above or penetrates its actual support');}
  }
});
