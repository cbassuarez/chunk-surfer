import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
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
const bytes=fs.readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url)),jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength)),bin=28+jsonLength;
function accessor(index){const a=json.accessors[index],v=json.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],offset=bin+(v.byteOffset||0)+(a.byteOffset||0),T={5126:Float32Array,5123:Uint16Array,5125:Uint32Array}[a.componentType];return new T(bytes.buffer,bytes.byteOffset+offset,a.count*n);}
const glazing=json.meshes.find(m=>m.name==='academic_roof_glazing'),positions=material=>accessor(glazing.primitives.find(p=>json.materials[p.material].name===material).attributes.POSITION);

test('strict building context cannot illuminate Source or a matching physical coordinate by default',()=>{
 for(const group of A.contextGroups)assert.equal(enabled({academicAtriumLight:true,group}),true);
 for(const context of[{},null,{academicAtriumLight:true,group:'source'},{academicAtriumLight:true,group:'upper'},{academicAtriumLight:'true',group:'academic'},{group:'academic'}])assert.equal(enabled(context),false);
 assert.equal(sample({x:84,y:10,z:14}).strength,0);assert.ok(Object.isFrozen(A.leadPatches[0]));
});

test('aperture is exactly the retained fourth-floor glass address transformed to physical metres',()=>{
 const lo=roofPointToPhysical({x:ACADEMIC_ROOF.glass.x0,y:ACADEMIC_ROOF.glass.y0}),hi=roofPointToPhysical({x:ACADEMIC_ROOF.glass.x1,y:ACADEMIC_ROOF.glass.y1});
 assert.deepEqual(A.aperture,{x0:lo.x,x1:hi.x,z0:lo.y,z1:hi.y});assert.equal(A.roofY,ACADEMIC_ROOF.base);
 const glass=positions('wired roof glass');assert.equal(glass.length/3,30*24);
 for(let column=0;column<5;column++)for(let row=0;row<6;row++){
  const i=(column*6+row)*24*3,verts=Array.from({length:24},(_,n)=>Array.from(glass.slice(i+n*3,i+n*3+3))),xs=verts.map(p=>p[0]+84),ys=verts.map(p=>p[1]+17),zs=verts.map(p=>p[2]+14.5);
  near((Math.min(...xs)+Math.max(...xs))/2,A.panes.firstX+column*A.panes.stepX);
  near((Math.min(...zs)+Math.max(...zs))/2,A.panes.firstZ+row*A.panes.stepZ);
  near(Math.max(...xs)-Math.min(...xs),A.panes.width);near(Math.max(...zs)-Math.min(...zs),A.panes.depth);near(Math.max(...ys),16.998);
 }
});

test('both opaque repairs and primary under-glass beams are measured from retained mesh vertices',()=>{
 const lead=positions('roof dull lead glazing repairs');
 // Two slender reflection rakes precede the two broad repair boxes in this primitive.
 for(let i=0;i<2;i++){
  const start=(2+i)*24*3,verts=Array.from({length:24},(_,n)=>Array.from(lead.slice(start+n*3,start+n*3+3))),xs=verts.map(p=>p[0]+84),zs=verts.map(p=>p[2]+14.5),r=A.leadPatches[i];
  near(Math.min(...xs),r.x0);near(Math.max(...xs),r.x1);near(Math.min(...zs),r.z0);near(Math.max(...zs),r.z1);
  assert.equal(sample({x:(r.x0+r.x1)/2,y:17,z:(r.z0+r.z1)/2},active).strength,0);
 }
 const iron=positions('roof charcoal bronze and iron');
 for(const x of A.beams.xs)for(const z of[A.beams.z0,A.beams.z1])for(const y of[A.beams.y-A.beams.halfWidth,A.beams.y+A.beams.halfWidth]){
  const distance=Math.min(...Array.from({length:iron.length/3},(_,i)=>Math.hypot(iron[i*3]+84-x,iron[i*3+1]+17-y,iron[i*3+2]+14.5-z)));
  // Beam cross sections use a .19m square, so exact corners lie half-width sideways.
  assert.ok(distance<.096,`real primary beam missing at ${x},${y},${z}: ${distance}`);
 }
});

test('compiled atrium has an unbroken17m central void and a real .5m third-floor slab around it',()=>{
 for(const[x,z]of[[84,14],[79.5,8.5],[88.5,20.5]]){const list=spans(x,z);assert.ok(list.some(s=>s.floor===0&&s.ceil===17));assert.ok(list.some(s=>s.floor===17));assert.equal(list.some(s=>s.floor===10),false);}
 const list=spans(78.5,14);assert.ok(list.some(s=>s.floor===0&&s.ceil===9.5));assert.ok(list.some(s=>s.floor===10&&s.ceil===17));assert.equal(A.deck.top,10);assert.equal(A.deck.bottom,9.5);
});

test('fixed pane rays transmit while iron grid, opaque repair, beam and outside bounds refuse',()=>{
 assert.ok(sample({x:80,y:17,z:9.0833},active).strength>.99);
 assert.equal(sample({x:81,y:17,z:9.0833},active).reason,'iron-grid');
 assert.equal(sample({x:82,y:17,z:13.4167},active).reason,'lead-repair');
 assert.equal(sample(fromRoof(83.10,9.0833,15),active).reason,'primary-beam');
 for(const p of[{x:84,y:17.01,z:14},{x:84,y:-.01,z:14},{x:NaN,y:10,z:14},{x:72,y:10,z:10}])assert.equal(sample(p,active).strength,0);
 const a=sample(fromRoof(84,15.5834,16),active),b=sample(fromRoof(84,15.5834,12),active);near(a.roof.x,b.roof.x);near(a.roof.z,b.roof.z);assert.deepEqual(a.pane,b.pane);
});

test('light reaches actual Late Guest head and gallery top but never leaks below that opaque deck',()=>{
 const late=sample({x:78.2,y:11.6,z:6.4},active);assert.ok(late.strength>.8);assert.deepEqual(late.pane,{column:0,row:0});
 assert.ok(sample({x:78.2,y:10,z:6.4},active).strength>.8);
 assert.equal(sample({x:78.2,y:9.9,z:6.4},active).reason,'gallery-deck');
 assert.ok(sample({x:82,y:0,z:10},active).strength>.6);
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
