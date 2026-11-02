import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {ACADEMIC_ATRIUM_LIGHT as A} from '../src/data/academic-atrium-light.js';
import {ACADEMIC_ROOF,roofPointToPhysical} from '../src/data/academic-roof.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {CELL} from '../src/data/floorplan/legend.js';
import * as FP from '../src/world/floorplan.js';
import {localLightConeDescriptor} from '../src/render/local-light-cone.js';
import {academicAtriumLightEnabled as enabled,academicAtriumLightSample as sample,academicAtriumLightRayInterval as interval,
  academicAtriumLightVolume as volume,academicAtriumRoofRayEnd as roofEnd,ACADEMIC_ATRIUM_LIGHT_GLSL as glsl} from '../src/render/academic-atrium-light.js';
const active={enabled:true},near=(a,b,tolerance=.00001)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const r3d=read('src/render/r3d.js'),props=read('src/render/props3d.js'),main=read('src/main.js');
function source(text,name){const start=text.indexOf(`function ${name}(`),end=text.indexOf('\n}',start);assert.ok(start>=0&&end>start);return text.slice(start,end+2);}
const normalize=p=>{const l=Math.hypot(p.x,p.y,p.z);return{x:p.x/l,y:p.y/l,z:p.z/l};};
const fromRoof=(x,z,y)=>({x:x+A.direction.x*(A.roofY-y),y,z:z+A.direction.z*(A.roofY-y)});
FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors||[],edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});
const spans=(x,z)=>(FP.physicalSpanData().cells.get(`${Math.floor(x/CELL)},${Math.floor(z/CELL)}`)||[]);
const bytes=fs.readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url)),doc=await new NodeIO().readBinary(bytes);
const glazing=doc.getRoot().listMeshes().find(m=>m.getName()==='academic_roof_glazing');
// Courtyard clipping leaves unused vertices in the retained accessor. Only
// indexed triangles are submitted, and the real loader owns their byte stride.
const positions=material=>{
 const primitive=glazing.listPrimitives().find(p=>p.getMaterial().getName()===material),p=primitive.getAttribute('POSITION').getArray();
 return Array.from(primitive.getIndices().getArray()).flatMap(i=>Array.from(p.slice(i*3,i*3+3)));
};

test('strict building context cannot illuminate Source or a matching physical coordinate by default',()=>{
 for(const group of A.contextGroups)assert.equal(enabled({academicAtriumLight:true,group}),true);
 for(const context of[{},null,{academicAtriumLight:true,group:'source'},{academicAtriumLight:true,group:'upper'},{academicAtriumLight:'true',group:'academic'},{group:'academic'}])assert.equal(enabled(context),false);
 assert.equal(sample({x:84,y:10,z:14}).strength,0);assert.ok(Object.isFrozen(A.leadPatches[0]));
});

test('aperture matches the current roof address and every submitted pane stops at the courtyard',()=>{
 const lo=roofPointToPhysical({x:ACADEMIC_ROOF.glass.x0,y:ACADEMIC_ROOF.glass.y0}),hi=roofPointToPhysical({x:ACADEMIC_ROOF.glass.x1,y:ACADEMIC_ROOF.glass.y1});
 assert.deepEqual(A.aperture,{x0:lo.x,x1:hi.x,z0:lo.y,z1:hi.y});assert.equal(A.roofY,ACADEMIC_ROOF.base);
 const glass=positions('wired roof glass'),panes=new Map();assert.ok(glass.length>0);
 for(let i=0;i<glass.length;i+=9){
  const vertices=Array.from({length:3},(_,n)=>[glass[i+n*3]+84,glass[i+n*3+1]+17,glass[i+n*3+2]+14.5]);
  const centre=[0,1,2].map(k=>vertices.reduce((sum,p)=>sum+p[k],0)/3),column=Math.round((centre[0]-A.panes.firstX)/A.panes.stepX),row=Math.round((centre[2]-A.panes.firstZ)/A.panes.stepZ);
  assert.ok(column>=0&&column<A.panes.columns&&row>=0&&row<A.panes.rows);
  const cx=A.panes.firstX+column*A.panes.stepX,cz=A.panes.firstZ+row*A.panes.stepZ,key=column+':'+row;
  const points=panes.get(key)||[];points.push(...vertices);panes.set(key,points);
  for(const[x,y,z]of vertices){assert.ok(x>=cx-A.panes.width/2-.00001&&x<=cx+A.panes.width/2+.00001);assert.ok(z>=cz-A.panes.depth/2-.00001&&z<=cz+A.panes.depth/2+.00001);assert.ok(z>=A.aperture.z0-.00001&&z<=A.aperture.z1+.00001,'no removed south pane can be submitted');assert.ok(y>=16.95799&&y<=16.99801);}
 }
 const survivingRows=Math.ceil((A.aperture.z1-A.aperture.z0)/A.panes.stepZ);assert.equal(panes.size,A.panes.columns*survivingRows);
 for(let column=0;column<A.panes.columns;column++)for(let row=0;row<survivingRows;row++){
  const points=panes.get(column+':'+row);assert.ok(points?.length);const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),zs=points.map(p=>p[2]),cz=A.panes.firstZ+row*A.panes.stepZ;
  near((Math.min(...xs)+Math.max(...xs))/2,A.panes.firstX+column*A.panes.stepX);near(Math.max(...xs)-Math.min(...xs),A.panes.width);
  near(Math.min(...zs),Math.max(A.aperture.z0,cz-A.panes.depth/2));near(Math.max(...zs),Math.min(A.aperture.z1,cz+A.panes.depth/2));near(Math.max(...ys),16.998);
 }
});

test('surviving opaque repair and primary beam bounds come from actual submitted vertices',()=>{
 const lead=positions('roof dull lead glazing repairs'),points=Array.from({length:lead.length/3},(_,i)=>[lead[i*3]+84,lead[i*3+1]+17,lead[i*3+2]+14.5]);
 assert.ok(points.length>0);assert.ok(points.every(p=>p[2]<=A.aperture.z1+.00001),'the old south repair is not submitted over open sky');
 for(const r of A.leadPatches){
  for(const x of[r.x0,r.x1])for(const z of[r.z0,r.z1])assert.ok(points.some(p=>Math.hypot(p[0]-x,p[2]-z)<.00001),'each retained repair corner has a real mesh vertex');
  assert.equal(sample({x:(r.x0+r.x1)/2,y:17,z:(r.z0+r.z1)/2},active).strength,0);
 }
 let broadFaces=0;for(let i=0;i<points.length;i+=3){const[a,b,c]=points.slice(i,i+3),area=Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))/2;if(area<.25)continue;broadFaces++;
  const x=(a[0]+b[0]+c[0])/3,z=(a[2]+b[2]+c[2])/3;assert.ok(A.leadPatches.some(r=>x>=r.x0-.00001&&x<=r.x1+.00001&&z>=r.z0-.00001&&z<=r.z1+.00001),'every broad physical repair has a matching opaque light mask');
 }assert.ok(broadFaces>=2);
 const iron=positions('roof charcoal bronze and iron');
 for(const x of A.beams.xs)for(const z of[A.beams.z0,A.beams.z1])for(const y of[A.beams.y-A.beams.halfWidth,A.beams.y+A.beams.halfWidth]){
  const distance=Math.min(...Array.from({length:iron.length/3},(_,i)=>Math.hypot(iron[i*3]+84-x,iron[i*3+1]+17-y,iron[i*3+2]+14.5-z)));
  assert.ok(distance<.096,`real primary beam missing at ${x},${y},${z}: ${distance}`);
 }
});

test('compiled north atrium, enclosed greenhouse and open court retain their distinct physical sections',()=>{
 for(const[x,z]of[[84,10],[85,8.5],[88.5,13.5]]){const list=spans(x,z);assert.ok(list.some(s=>s.floor===0&&s.ceil===17));assert.ok(list.some(s=>s.floor===17));assert.equal(list.some(s=>s.floor===10),false);}
 const sanitary=spans(79.5,8.5);assert.ok(sanitary.some(s=>s.floor===0&&s.ceil===3.5&&s.owner==='public-sanitary-core-air'),'the actual enclosed sanitary core is not misreported as an unbroken atrium');
 for(const[x,z]of[[80,20],[90,20]]){const list=spans(x,z);assert.ok(list.some(s=>s.floor===0&&s.ceil>=40));assert.equal(list.some(s=>s.floor===10||s.floor===17),false,'the courtyard has actual sky rather than an invisible academic/roof slab');}
 const greenhouse=spans(84,20);assert.ok(greenhouse.some(s=>s.floor===0&&Math.abs(s.ceil-5.2)<.00001));assert.equal(greenhouse.some(s=>s.floor===10||s.floor===17),false);
 const list=spans(78.5,13.5);assert.ok(list.some(s=>s.floor===0&&s.ceil===9.5));assert.ok(list.some(s=>s.floor===10&&s.ceil===17));assert.equal(A.deck.top,10);assert.equal(A.deck.bottom,9.5);
});

test('fixed pane rays transmit while iron grid, opaque repair, beam and outside bounds refuse',()=>{
 assert.ok(sample({x:80,y:17,z:9.0833},active).strength>.99);
 assert.equal(sample({x:81,y:17,z:9.0833},active).reason,'iron-grid');
 assert.equal(sample({x:82,y:17,z:13.4167},active).reason,'lead-repair');
 assert.equal(sample(fromRoof(83.10,9.0833,15),active).reason,'primary-beam');
 for(const p of[{x:84,y:17.01,z:14},{x:84,y:-.01,z:14},{x:NaN,y:10,z:14},{x:72,y:10,z:10}])assert.equal(sample(p,active).strength,0);
 const a=sample(fromRoof(84,13.4167,16),active),b=sample(fromRoof(84,13.4167,12),active);near(a.roof.x,b.roof.x);near(a.roof.z,b.roof.z);assert.deepEqual(a.pane,b.pane);
});

test('light reaches actual Late Guest head and gallery top but never leaks below that opaque deck',()=>{
 const late=sample({x:78.2,y:11.6,z:6.4},active);assert.ok(late.strength>.8);assert.deepEqual(late.pane,{column:0,row:0});
 assert.ok(sample({x:78.2,y:10,z:6.4},active).strength>.8);
 assert.equal(sample({x:78.2,y:9.9,z:6.4},active).reason,'gallery-deck');
 assert.ok(sample({x:82,y:0,z:8},active).strength>.6,'a surviving north pane still reaches real atrium grade');
 assert.equal(sample({x:82,y:0,z:10},active).reason,'outside-aperture','the removed south glazing no longer manufactures a pane-filtered shaft');
 for(const y of[0,4,9.49])assert.equal(sample(fromRoof(80,9.0833,y),active).strength,0);
});

test('volume is strictly depth-clipped and exact parallel rays match the aperture bounds',()=>{
 const origin={x:74,y:12,z:10},direction={x:1,y:0,z:0};assert.equal(volume(origin,direction,1,active),0);assert.ok(volume(origin,direction,10,active)>0);
 assert.equal(interval({x:74,y:18,z:10},direction,100),null);
 assert.equal(volume(origin,direction,10),0);assert.equal(volume(origin,direction,NaN,active),0);
 assert.equal(volume({x:NaN,y:12,z:10},direction,10,active),0);
 for(const d of[{x:1,y:0,z:0},{x:0,y:-1,z:0},{x:0,y:0,z:1}]){const result=interval({x:84,y:12,z:14},d,100);assert.ok(result&&Number.isFinite(result.far));assert.ok(volume({x:84,y:12,z:14},d,100,active)<=A.volumeCap);}
});

test('roof accepted-pane extension terminates at the first real deck or grade, never above opaque repairs',()=>{
 near(roofEnd({x:84,y:19,z:14},{x:0,y:-1,z:0},active),19);
 const origin={x:81.2,y:19,z:9.0833},d=normalize({x:-.6,y:-1,z:0});near(origin.y+d.y*roofEnd(origin,d,active),10);
 assert.equal(roofEnd({x:82,y:19,z:13.4167},{x:0,y:-1,z:0},active),0);
 assert.equal(roofEnd({x:84,y:16,z:14},{x:0,y:-1,z:0},active),0);
 assert.equal(roofEnd({x:84,y:19,z:14},{x:0,y:1,z:0},active),0);assert.equal(roofEnd({x:84,y:19,z:14},{x:0,y:-1,z:0}),0);
});

test('actual main context gate uses current building, special-space and render group rather than a coordinate shortcut',()=>{
 const fn=source(main,'syncArchitecturalLocalLights'),start=fn.indexOf('const viewContext='),end=fn.indexOf(';',start);assert.ok(start>=0&&end>start);
 const get=Function('context','roofGateSky','planName','usingSpecialSpace','group','sourceRepriseWorldLease',fn.slice(start,end+1)+';return viewContext;');
 for(const group of A.contextGroups)assert.equal(enabled({...get({group},false,'conservatory',()=>false,group),group}),true);
 for(const[plan,special,group]of[['source',false,'academic'],['conservatory',true,'academic'],['conservatory',false,'source'],['conservatory',false,'upper']])assert.equal(get({group},false,plan,()=>special,group).academicAtriumLight,false);
 assert.equal(get({group:'academic'},true,'conservatory',()=>false,'academic').roofSkyRecovery,.95,'existing roof-gate sky is preserved');
 assert.equal(get({group:'academic'},false,'conservatory',()=>false,'academic',{active:true}).academicAtriumLight,false,'active Source reprise lease opts out even if runtime is between spaces');
});

test('executed production light setters replace only the unbounded skylight when strictly enabled and reset on leaving',()=>{
 const practical=[],run=Function('academicAtriumLightEnabled','P3','LIGHT_KIND','localLightConeDescriptor',`
 let lightingAcademicAtriumLight=false,lightingAmbientColor,lightingAmbientIntensity,lightingWhitePointScale,lightingCaptureExposure,lightingRoofSkyRecovery=0,pitchTarget=0,lightingScreenId,lightingBounceColor,lightingBounceIntensity;
 let localLightCount=0,localShadowIndex=-1,localShadowLight=null;const MAX_LOCAL_LIGHTS=12,municipalLightPower=1,isScreen=()=>false;
 const localLightPositions=new Float32Array(48),localLightColors=new Float32Array(48),localLightBaseIntensity=new Float32Array(12),localLightMunicipal=new Float32Array(12),localLightPenetrations=new Float32Array(12),localLightEmergency=new Float32Array(12);
 const localLightDirections=new Float32Array(48),localLightConeInner=new Float32Array(12).fill(1);
 ${source(r3d,'r3dSetLightingContext')}\n${source(r3d,'r3dSetLocalLights')}
 return {context:r3dSetLightingContext,lights:r3dSetLocalLights,enabled:()=>lightingAcademicAtriumLight};`)(enabled,{setPracticalLightFrame:l=>practical.push(l)},{EMERGENCY:'emergency'},localLightConeDescriptor);
 const lights=[{id:'academic-skylight-spill',x:85},{id:'actual-lamp',x:84}];
 assert.equal(run.lights(lights),2);run.context({group:'academic',academicAtriumLight:true});assert.equal(run.enabled(),true);assert.equal(run.lights(lights),1);assert.equal(practical.at(-1)[0].id,'actual-lamp');assert.equal(lights.length,2,'caller data not mutated');
 run.context({group:'source',academicAtriumLight:true});assert.equal(run.enabled(),false);assert.equal(run.lights(lights),2);
 run.context({});assert.equal(run.enabled(),false);
});

test('actual surface and composed-depth bindings share the same GLSL and preserve Source and portrait paths',()=>{
 assert.equal((r3d.match(/\$\{ACADEMIC_ATRIUM_LIGHT_GLSL\}/g)||[]).length,1);assert.equal((props.match(/\$\{ACADEMIC_ATRIUM_LIGHT_GLSL\}/g)||[]).length,1);
 assert.match(r3d,/academicAtriumSurfaceLight\(posM,n\)/);assert.match(props,/academicAtriumSurfaceLight\(vWorld,n\)/);
 assert.match(props,/uAcademicAtriumLight'\),academicAtriumLight&&!sourceRoomLighting\?1:0/);
 const ordinaryPass=r3d.slice(r3d.indexOf('  P3.renderPropPass({',r3d.indexOf('const waterTex = updateWaterField')));assert.match(ordinaryPass,/academicAtriumLight:lightingAcademicAtriumLight/);
 assert.match(r3d,/academicRayEnd=zView\/max\(\.001,dot\(rd,fwd\)\)/);assert.ok(r3d.indexOf('academicAtriumSkyVolume(ro*CELL_METERS')>r3d.indexOf('float zView ='));
 assert.match(r3d,/academicRoofPaneTransmission=0\.0; \/\/ real ribs/);
 assert.match(glsl,/abs\(direction\[axis\]\)<\.000001/);assert.doesNotMatch(glsl,/safeDirection/);assert.match(glsl,/for\(int i=0;i<16;i\+\+\)/);
 assert.ok(props.indexOf('if(vPortrait>9.5')<props.indexOf('academicAtriumSurfaceLight(vWorld,n)'),'existing apparition material branch still owns itself');
 assert.ok(Object.keys(A).every(key=>!['time','camera','actor','listener'].includes(key)));
});
