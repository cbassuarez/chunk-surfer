import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {UK_ROAD_MARKINGS,ukRoadMarkingMeshAt} from '../src/data/uk-road-markings.js';
import {STREET_PILOT,STREET_PILOT_MESHES,streetPilotFloorAt} from '../src/data/street-pilot.js';
import {streetPilotStaticInstances,streetPilotSafetyFrame} from '../src/game/street-pilot.js';
import {makeDriveScene} from '../src/game/source-drive/scene.js';
import {applyOpeningRoadScene,openingRoadAt} from '../src/game/source-drive/opening-road.js';
import {createDrive} from '../src/game/source-drive/drive-state.js';
import {worldAt} from '../src/game/source-drive/road.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url));
function glb(path){const bytes=read(path),size=bytes.readUInt32LE(12);return{doc:JSON.parse(bytes.subarray(20,20+size)),bin:bytes.subarray(28+size)};}
function array(g,id){const a=g.doc.accessors[id],v=g.doc.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],size={5126:4,5125:4,5123:2,5121:1}[a.componentType],get={5126:'readFloatLE',5125:'readUInt32LE',5123:'readUInt16LE',5121:'readUInt8'}[a.componentType];return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,j)=>g.bin[get]((v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||n*size)+j*size)));}
function triangles(g,name){const m=g.doc.meshes.find(m=>m.name===name);assert.ok(m,name);return m.primitives.flatMap(p=>{const v=array(g,p.attributes.POSITION),ix=array(g,p.indices).flat();return Array.from({length:ix.length/3},(_,i)=>ix.slice(i*3,i*3+3).map(k=>v[k]));});}
function points(g,name){return triangles(g,name).flat();}
function bounds(p){return{min:[0,1,2].map(k=>Math.min(...p.map(v=>v[k]))),max:[0,1,2].map(k=>Math.max(...p.map(v=>v[k])))};}
const near=(a,b,t=2e-6)=>assert.ok(Math.abs(a-b)<t,`${a} differs from ${b}`);
const street=glb('public/assets/street-pilot.glb'),roads=glb('public/assets/source-drive/cut/cut-roadside.glb');
const metrics=JSON.parse(read('public/assets/source-drive/geometry/metrics.json'));
function components(tris){const rows=[],owner=new Map();for(const t of tris){let hits=[];for(const p of t){const k=p.map(v=>v.toFixed(5)).join(',');if(owner.has(k))hits.push(owner.get(k));}let row=hits[0]??rows.length;if(!rows[row])rows[row]=new Map();for(const other of new Set(hits))if(other!==row){for(const[k,p]of rows[other]){rows[row].set(k,p);owner.set(k,row);}rows[other].clear();}for(const p of t){const k=p.map(v=>v.toFixed(5)).join(',');rows[row].set(k,p);owner.set(k,row);}}return rows.filter(r=>r.size).map(r=>[...r.values()]);}

test('actual exterior stop paint spans the whole half carriageway and preserves a3m clear stand-off',()=>{
 const parts=components(triangles(street,'street_pilot_markings'));
 const stops=parts.filter(p=>{const b=bounds(p),cx=(b.max[0]+b.min[0])/2;return Math.abs(Math.abs(cx)-4.55)<.001&&b.max[2]-b.min[2]>1.9;});
 assert.equal(stops.length,4,'moving lane and parking strip on both approaches');
 for(const side of[-1,1]){const p=stops.filter(p=>Math.sign((bounds(p).min[0]+bounds(p).max[0])/2)===side).flat(),b=bounds(p);near(b.max[2]-b.min[2],5);near(b.max[0]-b.min[0],.20);near(Math.min(...p.map(v=>Math.abs(v[0])))-1.45,3);}
 for(const direction of[1,-1]){const v=STREET_PILOT.vehicles.find(v=>v.direction===direction);near(v.stopLineX,direction>0?STREET_PILOT.stopLines.eastbound:STREET_PILOT.stopLines.westbound);const primary=STREET_PILOT.vehicleSignals.find(p=>p.id===(direction>0?'eastbound-primary':'westbound-primary'));near(Math.abs(primary.x-v.stopLineX),2.5);}
});

test('generated zigzags contain48true2m marks,500mm guide bands and six600x200mm terminals',()=>{
 const parts=components(triangles(street,'street_pilot_markings')).filter(p=>p.length===4&&Math.abs(bounds(p).max[1]-bounds(p).min[1])<1e-7);
 const lengths=p=>{const d=[];for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)d.push(Math.hypot(...p[i].map((v,k)=>v-p[j][k])));return d.sort((a,b)=>a-b);};
 const strokes=parts.filter(p=>{const e=lengths(p);return Math.abs(e[0]-.1)<.00001&&Math.abs(e[2]-2)<.00001;});assert.equal(strokes.length,48);
 for(const p of strokes)near(bounds(p).max[2]-bounds(p).min[2],.5);
 const terminals=parts.filter(p=>{const b=bounds(p);return Math.abs(b.max[0]-b.min[0]-.2)<.00001&&Math.abs(b.max[2]-b.min[2]-.6)<.00001;});assert.equal(terminals.length,6);
 for(const t of triangles(street,'street_pilot_markings')){const a=t[1].map((v,i)=>v-t[0][i]),b=t[2].map((v,i)=>v-t[0][i]);if(t.every(p=>Math.abs(p[1]-t[0][1])<1e-7)&&Math.abs(t[0][0])>4.7)assert.ok(a[2]*b[0]-a[0]*b[2]>0,'horizontal paint faces upward');}
});

test('the red tactile field has right-hand L-tails and two reachable1.05m button/cone housings',()=>{
 const b=bounds(points(street,'street_pilot_tactile'));near(b.min[2],-7);near(b.max[2],7);
 const buttons=streetPilotStaticInstances().filter(p=>p.mesh===STREET_PILOT_MESHES.pedestrianButton);assert.equal(buttons.length,2);
 const node=street.doc.nodes.find(n=>n.name===STREET_PILOT_MESHES.pedestrianButton),detail=JSON.parse(node.extras.streetPilot);near(detail.buttonCentreHeightM,1.05);assert.equal(detail.modeledTactileCone,true);assert.equal(detail.interactive,false,'visual hardware does not invent a new gameplay verb');
 for(const button of buttons){assert.ok(Math.abs(button.x-78)>1.4);near(button.y,streetPilotFloorAt(button.x,button.z)-.003);}
});

test('paint meshes have real100mm white strokes and a2m dash for the existing2.08m receiver scale',()=>{
 assert.equal(UK_ROAD_MARKINGS.centreDiagram,'1008');assert.equal(UK_ROAD_MARKINGS.markM,2);assert.equal(UK_ROAD_MARKINGS.gapM,4);
 const edge=components(triangles(roads,'drive_uk_edge_markings'));assert.equal(edge.length,2);for(const p of edge)near(bounds(p).max[0]-bounds(p).min[0],.1);
 const all=components(triangles(roads,'drive_uk_centre_and_edges')),centre=all.find(p=>Math.abs((bounds(p).min[0]+bounds(p).max[0])/2)<.01);assert.ok(centre);const b=bounds(centre);near(b.max[0]-b.min[0],.1);near((b.max[2]-b.min[2])*2.08,2);
 for(const d of[-18,-12,-6,0,6,12,18])assert.equal(ukRoadMarkingMeshAt(d),'drive_uk_centre_and_edges');for(const d of[-16,-14,2,4,8,10])assert.equal(ukRoadMarkingMeshAt(d),'drive_uk_edge_markings');
});

test('actual driving submits road-fixed paint, leaves impossible roads unmarked, and never widens its stroke with an apron',()=>{
 for(const distance of[24,540,850,1200]){const at=worldAt(distance),state=Object.assign(createDrive(),{x:at.x,z:at.z,heading:at.heading}),scene=makeDriveScene(state,metrics,{showHands:false});const p=scene.props.find(p=>p.id===`drive-uk-paint-${distance}`);assert.ok(p);assert.equal(p.mesh,ukRoadMarkingMeshAt(distance));near(Math.hypot(p.matrix[0],p.matrix[1],p.matrix[2]),1);}
 for(const distance of[250,1060]){const at=worldAt(distance),scene=makeDriveScene(Object.assign(createDrive(),{x:at.x,z:at.z,heading:at.heading}),metrics,{showHands:false});assert.ok(!scene.props.some(p=>p.id===`drive-uk-paint-${distance}`));}
 const at=-40,scene=applyOpeningRoadScene({props:[],colliders:[]},{...createDrive(),x:0,z:40}),base=scene.props.find(p=>p.id===`opening-asphalt-${at}`),paint=scene.props.find(p=>p.id===`opening-uk-paint-${at}`);assert.ok(base&&paint);assert.ok(openingRoadAt(at).leftWidth>3.25);near(Math.hypot(paint.matrix[0],paint.matrix[1],paint.matrix[2]),1);assert.ok(Math.hypot(base.matrix[0],base.matrix[1],base.matrix[2])>1);
});

test('new stop positions keep whole moving vehicles outside both walking and blackout phases',()=>{
 for(let time=0;time<108;time+=.05){const s=streetPilotSafetyFrame(time);assert.equal(s.pedestrianConflict,false);assert.equal(s.clearanceConflict,false);}
});
