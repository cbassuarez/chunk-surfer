import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {ACADEMIC_ATRIUM_LIGHT as A} from '../src/data/academic-atrium-light.js';
import {ACADEMIC_ROOF,roofCourtGlazingLayout,roofPointToPhysical} from '../src/data/academic-roof.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {CELL,F} from '../src/data/floorplan/legend.js';
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

const courtPanes=roofCourtGlazingLayout().panes.map(({c,s})=>({x0:c[0]+84-s[0]/2,x1:c[0]+84+s[0]/2,z0:c[2]+14.5-s[2]/2,z1:c[2]+14.5+s[2]/2}));
const originalPanes=Array.from({length:A.panes.columns*A.panes.rows},(_,i)=>{
 const cx=A.panes.firstX+Math.floor(i/A.panes.rows)*A.panes.stepX,cz=A.panes.firstZ+(i%A.panes.rows)*A.panes.stepZ;
 return{x0:cx-A.panes.width/2,x1:cx+A.panes.width/2,z0:cz-A.panes.depth/2,z1:cz+A.panes.depth/2};
});

test('aperture matches the current roof address; the whole pane is back and its bays run on over the courts',()=>{
 const lo=roofPointToPhysical({x:ACADEMIC_ROOF.glass.x0,y:ACADEMIC_ROOF.glass.y0}),hi=roofPointToPhysical({x:ACADEMIC_ROOF.glass.x1,y:ACADEMIC_ROOF.glass.y1});
 assert.deepEqual(A.aperture,{x0:lo.x,x1:hi.x,z0:lo.y,z1:hi.y});assert.equal(A.roofY,ACADEMIC_ROOF.base);
 const glass=positions('wired roof glass'),panes=new Map();assert.ok(glass.length>0);
 for(let i=0;i<glass.length;i+=9){
  const vertices=Array.from({length:3},(_,n)=>[glass[i+n*3]+84,glass[i+n*3+1]+17,glass[i+n*3+2]+14.5]);
  const centre=[0,1,2].map(k=>vertices.reduce((sum,p)=>sum+p[k],0)/3),column=Math.round((centre[0]-A.panes.firstX)/A.panes.stepX),row=Math.round((centre[2]-A.panes.firstZ)/A.panes.stepZ);
  if(column>=0&&column<A.panes.columns&&row>=0&&row<A.panes.rows){
   const key=column+':'+row,points=panes.get(key)||[];points.push(...vertices);panes.set(key,points);continue;
  }
  assert.ok(vertices.every(([x,,z])=>courtPanes.some(r=>x>=r.x0-.0001&&x<=r.x1+.0001&&z>=r.z0-.0001&&z<=r.z1+.0001)),'all other glass is a laid-out pane over the courts');
 }
 assert.equal(panes.size,A.panes.columns*A.panes.rows,'every original pane is restored, not only those north of the courts');
 for(let column=0;column<A.panes.columns;column++)for(let row=0;row<A.panes.rows;row++){
  const points=panes.get(column+':'+row);assert.ok(points?.length);const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),zs=points.map(p=>p[2]),cz=A.panes.firstZ+row*A.panes.stepZ;
  near((Math.min(...xs)+Math.max(...xs))/2,A.panes.firstX+column*A.panes.stepX);near(Math.max(...xs)-Math.min(...xs),A.panes.width);
  near(Math.min(...zs),cz-A.panes.depth/2,.0001);near(Math.max(...zs),cz+A.panes.depth/2,.0001);near(Math.max(...ys),16.998);
 }
});

test('the skylight leaves no hole: every point over the courts is under a pane or its rib',()=>{
 const rects=[...originalPanes,...courtPanes],{x0,x1,z0,z1}=ACADEMIC_ROOF.courtGlass,rib=.0501;let checked=0;
 for(let z=z0;z<=z1;z+=.2)for(let x=x0;x<=x1;x+=.2){
  // The kerb covers the outermost rib's width at the court's edge.
  if(x<x0+.12||x>x1-.12||z<z0+.12||z>z1-.12)continue;
  assert.ok(rects.some(r=>x>=r.x0-rib&&x<=r.x1+rib&&z>=r.z0-rib&&z<=r.z1+rib),`no glass at ${x.toFixed(2)},${z.toFixed(2)}`);checked++;
 }
 assert.ok(checked>4000);
 const iron=positions('roof charcoal bronze and iron');
 for(const x of[-5,-1,3,5,x0-84,x1-84])assert.ok(Array.from({length:iron.length/3},(_,i)=>i).some(i=>Math.hypot(iron[i*3]-x,iron[i*3+1]+.31,iron[i*3+2]-12.5)<.15),`a primary beam reaches the court's far edge at local x ${x}`);
});

test('the courts keep their sky through the glass, and the roof looks down through all of it',()=>{
 const props=read('src/render/props3d.js'),world=read('src/render/r3d.js');
 assert.match(props,/if\(uRoofGlass>\.5&&uEye\.y<vWorld\.y&&vWorld\.z>=\$\{ELLERY_COURTYARD_SKY\.z0\.toFixed\(1\)\}\)\{[^}]*glassPick>\.34[^}]*discard;/,'from below, only the court panes give way to the sky, keeping a few highlight strokes');
 assert.match(world,/vec2 courtGlass=glassLocal-vec2\(1\.5,6\.5\);/,'the through-pane view covers the court glass as well as the original pane');
 assert.match(world,/voidCourt=abs\(atGallery-vec2\(85\.5,21\.0\)\)-vec2\(8\.5,6\.0\)/,'it shows the gallery void as it now stands');
 near(ACADEMIC_ROOF.courtGlass.x0,85.5-8.5);near(ACADEMIC_ROOF.courtGlass.x1,85.5+8.5);near(ACADEMIC_ROOF.courtGlass.z0,21-6);near(ACADEMIC_ROOF.courtGlass.z1,21+6);
});

test('surviving opaque repair and primary beam bounds come from actual submitted vertices',()=>{
 const lead=positions('roof dull lead glazing repairs'),points=Array.from({length:lead.length/3},(_,i)=>[lead[i*3]+84,lead[i*3+1]+17,lead[i*3+2]+14.5]);
 assert.ok(points.length>0);
 for(const r of A.leadPatches){
  for(const x of[r.x0,r.x1])for(const z of[r.z0,r.z1])assert.ok(points.some(p=>Math.hypot(p[0]-x,p[2]-z)<.00001),'each retained repair corner has a real mesh vertex');
  assert.equal(sample({x:(r.x0+r.x1)/2,y:17,z:(r.z0+r.z1)/2},active).strength,0);
 }
 let broadFaces=0;for(let i=0;i<points.length;i+=3){const[a,b,c]=points.slice(i,i+3),area=Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))/2;if(area<.25)continue;
  // The atrium's light only passes the aperture; the south repair stands over the open court.
  const x=(a[0]+b[0]+c[0])/3,z=(a[2]+b[2]+c[2])/3;if(z>A.aperture.z1)continue;broadFaces++;assert.ok(A.leadPatches.some(r=>x>=r.x0-.00001&&x<=r.x1+.00001&&z>=r.z0-.00001&&z<=r.z1+.00001),'every broad physical repair has a matching opaque light mask');
 }assert.ok(broadFaces>=2);
 const iron=positions('roof charcoal bronze and iron');
 // Each beam's real ends: its run past the aperture is the original pane's south end.
 for(const x of A.beams.xs)for(const z of[A.beams.z0,21])for(const y of[A.beams.y-A.beams.halfWidth,A.beams.y+A.beams.halfWidth]){
  const distance=Math.min(...Array.from({length:iron.length/3},(_,i)=>Math.hypot(iron[i*3]+84-x,iron[i*3+1]+17-y,iron[i*3+2]+14.5-z)));
  assert.ok(distance<.096,`real primary beam missing at ${x},${y},${z}: ${distance}`);
 }
});

test('compiled north atrium, enclosed greenhouse and open court retain their distinct physical sections',()=>{
 for(const[x,z]of[[84,10],[85,8.5],[88.5,13.5]]){const list=spans(x,z);assert.ok(list.some(s=>s.floor===0&&s.ceil===17));assert.ok(list.some(s=>s.floor===17));assert.equal(list.some(s=>s.floor===10),false);}
 const sanitary=spans(79.5,8.5);assert.ok(sanitary.some(s=>s.floor===0&&s.ceil===3.5&&s.owner==='public-sanitary-core-air'),'the actual enclosed sanitary core is not misreported as an unbroken atrium');
 for(const[x,z]of[[80,20],[90,20]]){const list=spans(x,z);assert.ok(list.some(s=>s.floor===0&&s.ceil>=16.7&&(s.flags&F.SKY)),'the court keeps its sky, below the glass');assert.equal(list.some(s=>s.floor===10),false,'no academic slab hides over the courtyard');assert.ok(list.some(s=>s.floor===17&&s.owner==='academic_roof'),'the roof runs on over it in glass');}
 const greenhouse=spans(84,20);assert.ok(greenhouse.some(s=>s.floor===0&&Math.abs(s.ceil-5.2)<.00001));assert.equal(greenhouse.some(s=>s.floor===10),false);assert.ok(greenhouse.some(s=>s.floor===17&&s.owner==='academic_roof'));
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
