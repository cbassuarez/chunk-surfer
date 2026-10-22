import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{buildMainStairUse,MAIN_STAIR_RUNNER_MESH}from'../tools/chunk_surfer/main-stair-use-geometry.mjs';
import{MAIN_STAIR_GEOMETRY as STAIR}from'../src/data/main-stair-geometry.js';
import{CONSERVATORY_PROPS,PROP_MESH}from'../src/data/conservatory-props.js';
import{conservatory as C}from'../src/data/floorplan/conservatory.js';import*as FP from'../src/world/floorplan.js';import*as P from'../src/game/props.js';
const materials=[],quads=[],names=[];
const stats=buildMainStairUse({mesh(name){names.push(name);return{};},materials,addQuad(_m,a,b,c,d,mat){quads.push({points:[a,b,c,d],mat});}});
const bytes=fs.readFileSync(new URL('../public/assets/conservatory-main-stair.glb',import.meta.url)),jl=bytes.readUInt32LE(12),g=JSON.parse(bytes.subarray(20,20+jl)),bin=28+jl;
function read(index){const a=g.accessors[index],v=g.bufferViews[a.bufferView],n={VEC3:3,SCALAR:1}[a.type],size={5123:2,5125:4,5126:4}[a.componentType],fn={5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType],start=bin+(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*size;return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,d)=>bytes[fn](start+i*stride+d*size)));}
const treadTriangles=[];for(const p of g.meshes.find(m=>m.name==='main_open_well_stair').primitives){if(g.materials[p.material].name!=='warm terrazzo')continue;const pos=read(p.attributes.POSITION),idx=read(p.indices);for(let i=0;i<idx.length;i+=3){const tri=idx.slice(i,i+3).map(([i])=>pos[i]);if(Math.max(...tri.map(p=>p[1]))-Math.min(...tri.map(p=>p[1]))<1e-5)treadTriangles.push(tri);}}
function floorAt(x,z,y){let highest=-Infinity;for(const[a,b,c]of treadTriangles){if(a[1]>y+.0001)continue;const den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(den)<1e-10)continue;const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den;if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6)highest=Math.max(highest,a[1]);}return highest;}

test('fitted runner has one shared opaque mesh on all fifty-eight real treads and stays within the existing stair width',()=>{
 assert.deepEqual(names,[MAIN_STAIR_RUNNER_MESH]);assert.equal(stats.treads.length,58);assert.equal(materials.length,3);assert.ok(materials.every(m=>!m.emissiveFactor&&!m.doubleSided));
 const pts=quads.flatMap(q=>q.points);assert.ok(pts.every(p=>p.every(Number.isFinite)));assert.ok(pts.every(([x,,z])=>Math.hypot(x,z)>=STAIR.innerRadiusM+.5&&Math.hypot(x,z)<=STAIR.outerRadiusM-.5));
 assert.ok(Math.min(...pts.map(p=>p[1]))>=.001-1e-8);assert.ok(Math.max(...pts.map(p=>p[1]))<=10.007+1e-8);
 assert.ok(stats.triangles<6000,'one bounded existing runner, not a second structural stair');
});

test('every runner tread sample sits seven millimetres above the actual packed terrazzo surface',()=>{
 const failed=[];for(const t of stats.treads)for(const s of t.samples){const[x,y,z]=s.point,floor=floorAt(x,z,y);if(!Number.isFinite(floor)||Math.abs(y-floor-.007)>.00001)failed.push({flight:t.flight,index:t.index,point:s.point,packedFloor:floor});}
 assert.ok(treadTriangles.length>0);assert.deepEqual(failed,[],'contact is measured against the actual unchanged hero GLB, not merely repeated analytic formulas');
});

test('wear follows the tread centre while bound edges and the ascending riser wrap remain physically distinct',()=>{
 const worn=quads.filter(q=>materials[q.mat].name==='main stair compressed worn centre');
 assert.equal(worn.length,stats.treads.reduce((n,t)=>n+t.samples.length,0));
 for(const q of worn){assert.ok(q.points.every(p=>Math.abs(p[1]-q.points[0][1])<1e-10),'compression is on walked tread tops');const r=q.points.map(([x,,z])=>Math.hypot(x,z));assert.ok(Math.min(...r)>1.45&&Math.max(...r)<1.85,'wear follows the centre line instead of random marks');
  const[a,b,c]=q.points,u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);assert.ok(u[2]*v[0]-u[0]*v[2]>0,'walked surfaces face upward');}
 assert.ok(quads.some(q=>Math.max(...q.points.map(p=>p[1]))-Math.min(...q.points.map(p=>p[1]))>.16),'runner turns up the existing risers');
});

test('only the existing runner placement changes visual mesh and pivot; acoustic and blocking behaviour stay unchanged',()=>{
 const runner=CONSERVATORY_PROPS.find(p=>p.id==='main-stair-runner');assert.equal(runner.mesh,MAIN_STAIR_RUNNER_MESH);assert.equal(runner.renderOffsetX,1);assert.equal(runner.renderOffsetZ,2);assert.deepEqual(runner.renderGroups,['ground','upper','academic']);assert.equal(runner.blocks,false);assert.equal(runner.interactive,false);
 for(const k of['w','d','softFloor','blocks','mount'])assert.equal(PROP_MESH[MAIN_STAIR_RUNNER_MESH][k],PROP_MESH.textile_stair_runner[k]);
 FP.compile(C.levels,{width:C.width,height:C.height,widenCorridors:C.widenCorridors,connectors:C.connectors,edgePortals:C.edgePortals,doors:C.doors});
 const baseline=CONSERVATORY_PROPS.map(p=>p.id===runner.id?{...p,mesh:'textile_stair_runner',renderOffsetX:0,renderOffsetZ:0}:p);
 const sample=placements=>{P.propsInit(FP,placements);const result=[];for(let dx=-3;dx<=3;dx+=.125)for(let dy=-3;dy<=3;dy+=.125)result.push([P.softFloorPropAt((runner.x+dx)*2-.5,(runner.y+dy)*2-.5),P.propCanOccupy((runner.x+dx)*2-.5,(runner.y+dy)*2-.5)]);return result;};
 assert.deepEqual(sample(CONSERVATORY_PROPS),sample(baseline));
});
