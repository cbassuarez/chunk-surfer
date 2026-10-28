import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SOURCE_CONTINUATION_ARCHITECTURE,sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';
import {CONTINUATION_ASSEMBLIES,CONTINUATION_CATCH_STAGES,SOURCE_CONTINUATION_ROUTES,continuationSupportAt} from '../src/data/source-continuation.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
const dir=new URL('../public/assets/',import.meta.url);
function glb(file){const bytes=readFileSync(new URL(file,dir)),size=bytes.readUInt32LE(12);return{bytes,json:JSON.parse(bytes.subarray(20,20+size)),base:28+size};}
function values(asset,id){const a=asset.json.accessors[id],v=asset.json.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],size={5126:4,5125:4,5123:2,5121:1}[a.componentType],method={5126:'readFloatLE',5125:'readUInt32LE',5123:'readUInt16LE',5121:'readUInt8'}[a.componentType],stride=v.byteStride||n*size,start=asset.base+(v.byteOffset||0)+(a.byteOffset||0);return Array.from({length:a.count},(_,k)=>Array.from({length:n},(_,i)=>asset.bytes[method](start+k*stride+i*size)));}
const authored=glb('source-continuation-architecture.glb');
const stats=JSON.parse(readFileSync(new URL('source-continuation-architecture.stats.json',dir)));
const main=glb('conservatory-props.glb');
function mesh(asset,name){return asset.json.meshes.find(m=>m.name===name);}
function triangles(asset,name){const m=mesh(asset,name);return m.primitives.flatMap(p=>{const ps=values(asset,p.attributes.POSITION),ids=values(asset,p.indices).flat();return Array.from({length:ids.length/3},(_,k)=>ids.slice(k*3,k*3+3).map(i=>ps[i]));});}
const xyz=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
function hitY(ps,x,z){const[a,b,c]=ps,den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(den)<1e-10)return null;const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den,w=1-u-v;return Math.min(u,v,w)<-1e-6?null:u*a[1]+v*b[1]+w*c[1];}
test('dedicated Blender export has exact named residency and remains within the declared independent asset budget',()=>{
 assert.deepEqual(authored.json.meshes.map(m=>m.name).sort(),[...SOURCE_CONTINUATION_ARCHITECTURE.meshes].sort());assert.ok(stats.triangles<30000);assert.ok(authored.bytes.length<2*1024*1024);assert.equal(stats.sha256,createHash('sha256').update(authored.bytes).digest('hex'));assert.ok(statSync(new URL('../'+stats.editable,import.meta.url)).size>100000);
 assert.ok(stats.meshes.find(p=>p.mesh==='source_ii_ellery_bay').triangles>1000);assert.ok(stats.meshes.find(p=>p.mesh==='source_ii_chapel_buttress').triangles>1000);
});
test('editable construction exports finite actual geometry, metre UVs, material variation and no emitted light',()=>{
 let primitiveCount=0;const colours=new Set();for(const m of authored.json.meshes)for(const p of m.primitives){primitiveCount++;const positions=values(authored,p.attributes.POSITION);assert.ok(positions.flat().every(Number.isFinite));assert.ok(positions.length>=3);assert.ok(p.attributes.TEXCOORD_0!=null||m.name.startsWith('source_ii_'));const mat=authored.json.materials[p.material];assert.ok(!mat.emissiveFactor||mat.emissiveFactor.every(v=>v===0));colours.add(JSON.stringify(mat.pbrMetallicRoughness.baseColorFactor));}assert.ok(primitiveCount>30);assert.ok(colours.size>10);
});
test('case, soundboard and tower caps retain their native model support heights and exclude the removed head obstacles',()=>{
 const byName=Object.fromEntries(stats.meshes.map(m=>[m.mesh,m]));assert.ok(Math.abs(byName.source_ii_case_floor.bounds.max[1]-.2225)<1e-5);assert.ok(byName.source_ii_case_floor.bounds.min[1]>=-.0001);assert.ok(Math.abs(byName.source_ii_piano_soundboard.bounds.max[1]-1.1375)<1e-5);assert.ok(byName.source_ii_piano_soundboard.bounds.min[1]>=1.0599);assert.ok(byName.source_ii_tower_cap.bounds.min[1]>=2.4999);
 for(const a of CONTINUATION_ASSEMBLIES.filter(a=>a.supportId)){const m=byName[a.mesh];assert.ok(m,a.mesh);const y=a.y+m.bounds.max[1]*a.scaleY;const support=continuationSupportAt(a.x,a.z,{feet:y},{minY:y-.01,maxY:y+.01});assert.ok(support,a.supportId);assert.ok(Math.abs(support.y-y)<1e-5,a.id);}
});
test('catch framing has distinct fabrication and stays below the physical sector surface',()=>{
 for(const stage of CONTINUATION_CATCH_STAGES){const row=stats.meshes.find(m=>m.mesh==='source_iii_catch_frame_'+stage.level);assert.ok(row);assert.ok(row.bounds.max[1]<=0);assert.ok(row.bounds.min[1]<-1);assert.ok(row.triangles>1000);}const s=stats.meshes.find(m=>m.mesh==='source_iii_spindle');assert.ok(s.bounds.min[1]<=-25&&s.bounds.max[1]>=17);
});
test('required II circulation has no authored macro model ceiling intruding into standing headroom',()=>{
 const state={...freshSourceContinuation(),status:'active'},f=sourceContinuationRenderFrame(state),instances=f.props.filter(p=>p.assemblyId||p.opening),modelTriangles=new Map();for(const p of instances){const asset=mesh(authored,p.mesh)?authored:main;const world=triangles(asset,p.mesh).map(ps=>ps.map(q=>xyz(p.matrix,q)));modelTriangles.set(p.id,world);}
 let samples=0;for(const[id,path]of Object.entries(SOURCE_CONTINUATION_ROUTES)){
  let feet=id==='upperReturn'||id==='stairLoop'?8.4:0;
  for(let k=1;k<path.length;k++){const a=path[k-1],b=path[k],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.45);
   for(let q=0;q<=steps;q++){const t=q/steps,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t,support=continuationSupportAt(x,z,{feet},{minY:feet-.46,maxY:feet+.46});if(!support)continue;feet=support.y;samples++;
    for(const [name,rows]of modelTriangles)for(const ps of rows){if(Math.max(...ps.map(p=>p[1]))<=feet+.35||Math.min(...ps.map(p=>p[1]))>=feet+1.90)continue;if(x<Math.min(...ps.map(p=>p[0]))||x>Math.max(...ps.map(p=>p[0]))||z<Math.min(...ps.map(p=>p[2]))||z>Math.max(...ps.map(p=>p[2])))continue;const y=hitY(ps,x,z);assert.ok(y==null||y<=feet+.35||y>=feet+1.90,`${id}: ${name} cuts standing body at${x},${z}, floor${feet}, hit${y}`);}
   }
  }
 }assert.ok(samples>500);
});
