import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {SOURCE_CONTINUATION as C,continuationSurfaces,continuationSolids,continuationSurfaceY,continuationCatchFloor,continuationSupportAt,continuationDoors,continuationProps,continuationSurfaceContains,CONTINUATION_CATCH_STAGES,CONTINUATION_ASSEMBLIES} from '../src/data/source-continuation.js';
import {freshSourceContinuation,sourceContinuationFrame,stepSourceContinuation} from '../src/game/source-continuation.js';
import {sourceContinuationGeometry,sourceContinuationEdges,sourceContinuationEdgeGeometry,sourceContinuationMeshPayload,installSourceContinuationMeshes,finishSourceContinuationArchitecture,prewarmSourceContinuationAssets,sourceContinuationCamera,sourceContinuationRenderFrame,createSourceContinuationRenderer,SOURCE_CONTINUATION_ARCHITECTURE,SOURCE_CONTINUATION_LIGHTING,sourceContinuationLighting} from '../src/render/source-continuation-renderer.js';
import {doorAssembly} from '../src/data/source-door-fields.js';
import {PROP_BOUNDS} from '../src/data/generated/prop-geometry.js';
import {SOURCE_PRINT_SURFACE} from '../src/render/physical-source-print.js';
import {SOURCE_BLUEPRINT_PRINT_SURFACE} from '../src/render/source-blueprint-contract.js';
import {cameraBasis} from '../src/render/camera-basis.js';
import {sourceSurroundingsGeometryLibrary} from '../src/render/source-surroundings-geometry.js';
import * as R3 from '../src/render/r3d.js';
import {createPropRangeController} from '../src/render/prop-range.js';
import {pressureInstances,pressureSurfaceInstances} from '../src/render/pressure-volume.js';
import {CELL} from '../src/data/floorplan/legend.js';
import {JOURNEY_SURFACES,JOURNEY_JOINT_SOLIDS} from '../src/data/source-continuation-journey.js';

const fresh=()=>({...freshSourceContinuation({runId:'render-proof',returnPose:{x:12,y:34,yaw:.7,pitch:-.1}}),status:'active'});
test('the relocated fake-Ellery apparatus is absent from the exposed Source II route, even in an old gag checkpoint',async()=>{
  const s={...fresh(),x:0,z:-20,feet:8.4,thresholdGag:{available:true,phase:'spent',elapsed:5,emitted:31}},frame=sourceContinuationRenderFrame(s);
  assert.equal(frame.props.some(p=>String(p.mesh).startsWith('ellery_threshold_')),false);
  const h=fixture();await h.owner.initialize();h.owner.render(s);
  assert.equal(h.calls.some(c=>c.name==='pack'&&c.args[0].endsWith('assets/ellery-threshold-gag.glb')),false);
  h.owner.dispose();
});
function catchState(level=0,extra={}){const s=CONTINUATION_CATCH_STAGES[level];const a=(s.startAngle+s.endAngle)/2,r=(s.innerRadius+s.outerRadius)/2;return{...fresh(),phase:'catch',x:C.catch.center.x+Math.cos(a)*r,z:C.catch.center.z+Math.sin(a)*r,feet:s.y,level,...extra};}
const transform=(m,p)=>[0,1,2].map(a=>m[a]*p[0]+m[a+4]*p[1]+m[a+8]*p[2]+m[a+12]);
function baseAsset(){const b=readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url)),jsonLength=b.readUInt32LE(12);return{buffer:b,json:JSON.parse(b.subarray(20,20+jsonLength)),binOffset:28+jsonLength};}
function triangleY(points,x,z){
  const[a,b,c]=points,den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(den)<1e-9)return null;
  const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den,w=1-u-v;
  return Math.min(u,v,w)<-1e-6?null:u*a[1]+v*b[1]+w*c[1];
}
function fakeGl(){
  let current=null,currentVao=null,serial=0;const buffers=[],vaos=[];
  const gl={ARRAY_BUFFER:34962,ELEMENT_ARRAY_BUFFER:34963,STATIC_DRAW:35044,FLOAT:5126,UNSIGNED_INT:5125,TEXTURE_2D:3553,ACTIVE_TEXTURE:34016,TEXTURE_BINDING_2D:32873,UNPACK_FLIP_Y_WEBGL:37440,UNPACK_PREMULTIPLY_ALPHA_WEBGL:37441,SRGB8_ALPHA8:35907,RGBA8:32856,RGBA:6408,UNSIGNED_BYTE:5121,LINEAR_MIPMAP_LINEAR:9987,LINEAR:9729,REPEAT:10497,CLAMP_TO_EDGE:33071,
    createBuffer(){const b={id:++serial};buffers.push(b);return b;},createVertexArray(){const vao={id:++serial};vaos.push(vao);return vao;},createTexture:()=>({texture:++serial}),
    bindBuffer(_target,b){current=b;},bufferData(_target,data){if(current)current.data=data.slice();},bindVertexArray(vao){currentVao=vao;},enableVertexAttribArray(){},disableVertexAttribArray(){},vertexAttribPointer(location){if(currentVao){currentVao.attributes??={};currentVao.attributes[location]=current;}},vertexAttribDivisor(){},vertexAttrib1f(){},bindTexture(){},pixelStorei(){},texImage2D(){},generateMipmap(){},texParameteri(){},activeTexture(){},getParameter:()=>0};
  return{gl,buffers,vaos};
}
function fixture({baseGate=null,doorGate=null,bodyGate=null,missingBase=[],omitCustom=false,failDoors=false,failBody=false,failVehicle=false,getTorch=()=>({on:false,look:{power:0}}),getLighting=()=>null,getReducedMotion=()=>false}={}){
  const calls=[],catalog=new Map(['instrument_case','grand_piano','open_instrument_case','ending_body_standing','tower_bell_04','tower_clapper_04'].filter(m=>!missingBase.includes(m)).map(m=>[m,{}])),g=fakeGl();let releases=0;
  const renderer=Object.fromEntries(Object.keys(R3).filter(k=>typeof R3[k]==='function').map(k=>[k,(...args)=>{calls.push({name:k,args});return k==='r3dFrame'?true:undefined;}]));
  renderer.r3dBasePropsReady=async()=>{calls.push({name:'base',args:[]});return baseGate?await baseGate:true;};renderer.r3dViewCamera=()=>({width:1280,height:720});
  let bodyReady=false;
  renderer.r3dPrepareHushBody=async()=>{calls.push({name:'prepare-body',args:[]});if(bodyGate)await bodyGate;if(failBody)throw Error('pressure body failed');bodyReady=true;return true;};
  renderer.r3dHushBodyReady=()=>bodyReady;
  const maps={texture:{source:true},normalTexture:{normal:true},ormTexture:{orm:true},letteringFinish:{version:1}};
  const props={propMeshCatalog:()=>[...catalog.keys()],setAuthoredPropRange(owner,far){assert.equal(typeof owner,'symbol');calls.push({name:'range',args:[far]});return()=>calls.push({name:'range-release',args:[]});},setPressureInstances:next=>calls.push({name:'pressure',args:[next]}),setPressureSurfaceInstances:next=>calls.push({name:'pressure-surface',args:[next]}),installAuthoredPropMeshes(installer){calls.push({name:'install',args:[]});return installer(g.gl,{catalog});},async addPropPack(url){
    calls.push({name:'pack',args:[url]});
    if(url.endsWith('assets/source-continuation-architecture.glb')){
      for(const n of SOURCE_CONTINUATION_ARCHITECTURE.meshes)catalog.set(n,{});
    }else if(url.endsWith('assets/source-demolition.glb'))catalog.set('source_demolition_retained',{});
    else if(url.endsWith('assets/source-vehicle-interior.glb')){
      if(failVehicle)throw Error('optional vehicle memory failed');
      for(const name of ['opening_drive_cabin','opening_drive_radio','opening_drive_wheel','opening_drive_wiper','opening_drive_vehicle_body'])catalog.set(name,{});
    }
    else if(url.endsWith('assets/ellery-public-front.glb'))for(const name of ['ellery_public_front','ellery_public_forecourt'])catalog.set(name,{});
    else if(url.endsWith('assets/conservatory-doors.glb')){
      if(doorGate)await doorGate;if(failDoors)throw Error('door pack failed');
      const door=doorAssembly('bay-goods-pair',{activeLeaves:'all'});for(const name of[door.frameMesh,door.leafMesh,door.freeStandingHeadMesh].filter(Boolean))catalog.set(name,{});
    }else throw Error('Unexpected fixture asset pack: '+url);
  }};
  props.setSourceSurroundingsPressure=value=>calls.push({name:'surroundings-pressure',args:[value]});
  const options={renderer,props,getTorch,getLighting,getReducedMotion,resolveAsset:url=>'fixture:'+url,installMeshes:(gl,pack)=>{const names=installSourceContinuationMeshes(gl,pack,{maps});if(omitCustom)pack.catalog.delete(names[0]);return names;},onRelease:()=>{releases++;calls.push({name:'release',args:[]});}};
  const owner=createSourceContinuationRenderer(options);
  return{owner,options,calls,catalog,g,releases:()=>releases,loseBody:()=>{bodyReady=false;}};
}

// These replace the former six-square-floor snapshots with proofs of the
// persistent architecture. The archived pre-realignment tests remain in the
// task evidence; no unearned native or player validation is inferred here.
test('actual uploaded triangles agree with rectangular treads and real annular supports',()=>{
  let samples=0;
  for(const piece of sourceContinuationGeometry(fresh())){
    const q=sourceContinuationMeshPayload(piece),d=piece.descriptor;
    assert.ok([...q.positions,...q.normals,...q.uvs].every(Number.isFinite));if(piece.kind!=='surface')continue;
    const points=[];
    if(d.kind==='sector')for(let a=1;a<8;a++)for(let r=1;r<6;r++){const angle=d.startAngle+(d.endAngle-d.startAngle)*a/8,radius=d.innerRadius+(d.outerRadius-d.innerRadius)*r/6;points.push([d.center.x+Math.cos(angle)*radius,d.center.z+Math.sin(angle)*radius]);}
    else for(let a=1;a<4;a++)for(let b=1;b<4;b++)points.push([d.minX+(d.maxX-d.minX)*a/4,d.minZ+(d.maxZ-d.minZ)*b/4]);
    for(const[x,z]of points){let found=false;for(let i=0;i<q.positions.length;i+=9)if(q.normals[i+1]>.9){const ps=[0,1,2].map(k=>[0,1,2].map(axis=>q.positions[i+k*3+axis]+q.bounds.center[axis])),y=triangleY(ps,x,z);if(y!=null&&Math.abs(y-continuationSurfaceY(d,x,z))<1e-5)found=true;}assert.ok(found,d.id);samples++;}
  }
  assert.ok(samples>700);
});
test('radial catch holes have no uploaded floor and each sector has a distinct physical outline',()=>{
  const sectors=sourceContinuationGeometry(fresh()).filter(p=>p.descriptor.kind==='sector'&&p.role==='catch');assert.equal(sectors.length,4);
  assert.equal(new Set(sectors.map(p=>[p.descriptor.innerRadius,p.descriptor.outerRadius,p.descriptor.startAngle,p.descriptor.endAngle].join(':'))).size,4);
  for(const p of sectors){const q=sourceContinuationMeshPayload(p),d=p.descriptor;const radius=d.innerRadius*.65,a=(d.startAngle+d.endAngle)/2,x=d.center.x+Math.cos(a)*radius,z=d.center.z+Math.sin(a)*radius;
    for(let k=0;k<q.positions.length;k+=9)if(q.normals[k+1]>.9){const ps=[0,1,2].map(j=>[0,1,2].map(ax=>q.positions[k+j*3+ax]+q.bounds.center[ax]));assert.equal(triangleY(ps,x,z),null,'central void must remain a real aperture');}
  }
});
test('physical print installation is bounded and idempotent with all material channels retained',()=>{
  const g=fakeGl(),pack={catalog:new Map()},maps={texture:{},normalTexture:{},ormTexture:{},letteringFinish:{}};
  const names=installSourceContinuationMeshes(g.gl,pack,{maps}),count=g.buffers.length;
  const surroundings=new Map(sourceSurroundingsGeometryLibrary().map(piece=>[piece.name,piece])),originalNames=names.filter(name=>!surroundings.has(name));
  const journeyNames=originalNames.filter(name=>name.includes('-journey-'));
  assert.equal(journeyNames.length,JOURNEY_SURFACES.length+JOURNEY_JOINT_SOLIDS.length,'every added journey support/frame has one inspectable mesh');
  const retainedOriginal=originalNames.filter(name=>!name.includes('-journey-')&&!name.startsWith('source-continuation-rest-'));
  assert.ok(retainedOriginal.length>80&&retainedOriginal.length<240,'the retained original asset budget is unchanged; listening-place geometry has its own bounded tests');
  assert.equal(names.length,originalNames.length+surroundings.size,'the added catalogue is exactly the declared static surroundings library');
  assert.deepEqual(installSourceContinuationMeshes(g.gl,pack,{maps}),names);assert.equal(g.buffers.length,count);
  for(const entry of pack.catalog.values()){
    const p=entry.primitives[0],added=surroundings.get(entry.name);
    if(added){assert.equal(p.materialRole,added.materialRole);assert.deepEqual(p.emissive,added.emissive);assert.equal(entry.extras.triangles,added.triangles);}
    else{
      assert.ok(['source-continuation','quiet-metal'].includes(p.materialRole));
      // Only declared listening-place practicals, weather and flood shells
      // own self-light; all other retained continuation material stays dark.
      const restEmission={
        'source-continuation-rest-lamp-light':[.22,.15,.08],
        'source-continuation-rest-sky-wire':[.025,.035,.025],
        'source-continuation-rest-vault-wire':[.03,.035,.02],
        'source-continuation-rest-light-strip':[.24,.14,.045],
        'source-continuation-rest-rain':[.07,.10,.095],
        'source-continuation-rest-rain-ring':[.035,.05,.045],
        'source-continuation-rest-road-mark':[.08,.07,.05],
        'source-continuation-rest-sky-mote':[.45,.36,.22],
        'source-continuation-rest-note-keystone':[.085,.055,.018],
        'source-continuation-rest-flood-bubble':[.013,.025,.028],
        'source-continuation-rest-judgment-lightning':[1.2,1.4,1.6],
      };
      assert.deepEqual(p.emissive,restEmission[entry.name]||[0,0,0]);
    }
    assert.ok(entry.extras.triangles>0);
    if(p.printedSurface){assert.ok([SOURCE_PRINT_SURFACE,SOURCE_BLUEPRINT_PRINT_SURFACE].includes(p.printedSurface));assert.equal(p.texture,maps.texture);assert.equal(p.normalTexture,maps.normalTexture);assert.equal(p.ormTexture,maps.ormTexture);}
  }
});
test('remote construction has bounded blueprint, pale stock and dark backs; only native joint paint emits',()=>{
  const g=fakeGl(),pack={catalog:new Map()},maps={blueprint:true,texture:{},normalTexture:{},ormTexture:{},letteringFinish:{}};
  installSourceContinuationMeshes(g.gl,pack,{maps});let joints=0,printed=0,stock=0,backs=0;
  for(const piece of sourceSurroundingsGeometryLibrary()){
    const material=pack.catalog.get(piece.name).primitives[0];assert.equal(material.materialRole,piece.materialRole);
    assert.deepEqual(material.emissive,piece.emissive);
    if(piece.layer==='edge'){
      joints++;assert.deepEqual(material.emissive,[1.1,1.7,1.8]);assert.ok(material.emissive.every(v=>v>=0&&v<=1.8));
      assert.equal(material.texture,null);assert.equal(material.printedSurface,null);
    }else{
      assert.deepEqual(material.emissive,[0,0,0]);
      if(piece.layer==='print'){printed++;assert.equal(material.printedSurface,SOURCE_BLUEPRINT_PRINT_SURFACE);assert.deepEqual(material.base,[1,1,1,1]);}
      else if(piece.layer==='stock'){stock++;assert.equal(material.printedSurface,SOURCE_PRINT_SURFACE);assert.deepEqual(material.base,piece.base);}
      else{backs++;assert.equal(piece.layer,'back');assert.equal(material.printedSurface,null);assert.equal(material.texture,null);assert.ok(material.base.slice(0,3).every(v=>v<.06));}
    }
  }
  assert.equal(joints,12);assert.equal(printed,12);assert.equal(stock,12);assert.equal(backs,12);
  for(const state of[fresh(),catchState(0)]){
    const frame=sourceContinuationRenderFrame(state);
    assert.ok(frame.lights.length<=SOURCE_CONTINUATION_ARCHITECTURE.maxLights);
    assert.ok(frame.lights.every(light=>!String(light.id).startsWith('source-surroundings-')),'emissive joints add no dynamic lights');
  }
});
test('actual bundled bell and clapper meshes exist and missing sender residency remains a preparation error',async()=>{
  const asset=baseAsset();for(const name of['tower_bell_04','tower_clapper_04']){
    const mesh=asset.json.meshes.find(mesh=>mesh.name===name);assert.ok(mesh,name);
    assert.ok(mesh.primitives.every(p=>asset.json.accessors[p.attributes.POSITION].count>0&&asset.json.accessors[p.indices].count>0));
    assert.ok(asset.json.nodes.some(node=>node.mesh===asset.json.meshes.indexOf(mesh)&&node.name===name));
  }
  const h=fixture({missingBase:['tower_bell_04']});await assert.rejects(h.owner.initialize(),/tower_bell_04/);h.owner.dispose();
});
test('blueprint substitution changes stock rather than support geometry or native instrument materials',()=>{
  const make=blueprint=>{const g=fakeGl(),pack={catalog:new Map()};installSourceContinuationMeshes(g.gl,pack,{maps:{blueprint,texture:{},normalTexture:{},ormTexture:{},letteringFinish:{}}});return pack;};
  const current=make(true),control=make(false);let physical=0;
  for(const[name,entry]of current.catalog){const p=entry.primitives[0],old=control.catalog.get(name).primitives[0];assert.deepEqual([...p.vao.attributes[0].data],[...old.vao.attributes[0].data]);if(p.printedSurface){if(p.printedSurface===SOURCE_BLUEPRINT_PRINT_SURFACE)assert.deepEqual(p.base,[1,1,1,1]);else assert.deepEqual(p.base,old.base);assert.deepEqual(old.printedSurface,SOURCE_PRINT_SURFACE);}else{physical++;assert.deepEqual(p.base,old.base);}}
  assert.ok(physical>10);
});
test('broad Source sheets retain pale printed mass while construction joints preserve cyanotype',()=>{
  const g=fakeGl(),pack={catalog:new Map()},maps={blueprint:true,texture:{},normalTexture:{},ormTexture:{},letteringFinish:{}};installSourceContinuationMeshes(g.gl,pack,{maps});let sheets=0;
  for(const piece of sourceContinuationGeometry(fresh())){const p=pack.catalog.get(piece.name).primitives[0];if(!p.printedSurface)continue;if(piece.kind==='surface'&&piece.role!=='inherited-earthfall'){sheets++;assert.equal(p.printedSurface,SOURCE_PRINT_SURFACE);assert.notDeepEqual(p.base,[1,1,1,1]);}else assert.equal(p.printedSurface,SOURCE_BLUEPRINT_PRINT_SURFACE);assert.deepEqual(p.emissive,[0,0,0]);assert.equal(p.texture,maps.texture);assert.equal(p.normalTexture,maps.normalTexture);assert.equal(p.ormTexture,maps.ormTexture);}
  for(const id of['wrong-entry','wrong-ground-cross','wrong-upper-west']){const piece=sourceContinuationGeometry(fresh()).find(p=>p.id===id);assert.equal(pack.catalog.get(piece.name).primitives[0].printedSurface,SOURCE_PRINT_SURFACE,id);}
  assert.ok(sheets>0,'load-bearing sheets must retain physical printed stock');
});
test('the dedicated architecture preserves actual native finishes and maps only explicit printed joints',()=>{
  const b=readFileSync(new URL('../public/assets/source-continuation-architecture.glb',import.meta.url)),length=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+length)),pack={catalog:new Map()},before=new Map(),maps={blueprint:true,texture:{},normalTexture:{},ormTexture:{},letteringFinish:{}};
  for(const mesh of j.meshes){const primitives=mesh.primitives.map(primitive=>{const material=j.materials[primitive.material],p=material.pbrMetallicRoughness;return{base:p.baseColorFactor,roughness:p.roughnessFactor,metallic:p.metallicFactor,materialName:material.name,emissive:material.emissiveFactor||[0,0,0],mainFactors:{authored:true}};});pack.catalog.set(mesh.name,{primitives});before.set(mesh.name,structuredClone(primitives));}
  finishSourceContinuationArchitecture(null,pack,{maps});let native=0,joints=0;
  for(const[name,entry]of pack.catalog)for(const[p,index]of entry.primitives.map((p,i)=>[p,i])){if(p.materialName.includes('source-cut joint stock')){joints++;assert.equal(p.printedSurface,SOURCE_BLUEPRINT_PRINT_SURFACE);assert.equal(p.texture,maps.texture);assert.equal(p.normalTexture,maps.normalTexture);assert.equal(p.ormTexture,maps.ormTexture);assert.equal(p.mainFactors,undefined);}else{native++;assert.deepEqual(p,before.get(name)[index]);}assert.deepEqual(p.emissive,[0,0,0]);}
  assert.ok(native>10&&joints>0);
});
test('both physical regions persist while departed Catch shelves have an accountable cutaway',()=>{
  const start=sourceContinuationRenderFrame(fresh()),ids=sourceContinuationGeometry(fresh()).filter(p=>p.kind==='surface').map(p=>p.id).sort();
  assert.ok(start.props.filter(p=>p.physicalKind==='surface'&&!p.portalDestination).every(p=>(p.chartId??0)===0),'ordinary submitted floors belong to the active chart');
  assert.ok(start.props.filter(p=>p.portalDestination).every(p=>p.portalClipPlanes?.length===5),'neighbor floors enter only through a finite aperture');
  assert.equal(start.props.find(p=>p.upperRemnant).y,100);assert.ok(start.props.some(p=>p.orientation==='sideways'));assert.ok(start.props.some(p=>p.orientation==='inverted'));
  for(let level=0;level<4;level++){const f=sourceContinuationRenderFrame(catchState(level));assert.deepEqual(f.geometry.surfaces.map(p=>p.id).sort(),ids);assert.deepEqual(f.hiddenAbove,Array.from({length:level},(_,k)=>k));assert.deepEqual(f.architecture.persistentRegions,['wrong-return','catch']);assert.deepEqual([...new Set(f.props.filter(p=>!p.portalDestination).map(p=>p.region).filter(Boolean))],['catch']);assert.equal(f.props.some(p=>!p.portalDestination&&(p.upperRemnant||p.region==='wrong-return')),false);assert.ok(f.props.filter(p=>p.region==='wrong-return').every(p=>p.portalDestination&&p.portalClipPlanes?.length===5),'earlier charts remain visible only through a real portal');
    assert.ok(f.lights.every(light=>!f.hiddenAbove.includes(light.level)),'cutaway fixtures cannot retain invisible upper-shelf lights');
    for(let shelf=0;shelf<4;shelf++){assert.equal(f.props.some(p=>p.physicalKind==='surface'&&p.level===shelf),shelf>=level);if(shelf<level)assert.ok(f.props.some(p=>p.catchRim&&p.level===shelf&&p.cutawayOutline));}}
});
test('drawn simulation boxes share exact collision bounds; asset poles and arch piers avoid proxy duplication',()=>{
  const s={...fresh(),closure:{mode:'closing',elapsed:20,frontX:7}},f=sourceContinuationRenderFrame(s);
  for(const d of continuationSolids(s)){const p=f.props.find(p=>p.physicalKind==='solid'&&p.descriptorId===d.id);if(['spindle','arch-pier'].includes(d.role)){assert.equal(p,undefined);continue;}assert.ok(p,d.id);const g=sourceContinuationGeometry(s).find(p=>p.kind==='solid'&&p.id===d.id),q=sourceContinuationMeshPayload(g);for(const[a,lo,hi]of[[0,d.minX,d.maxX],[1,d.minY,d.maxY],[2,d.minZ,d.maxZ]]){let values=[];for(let k=0;k<q.positions.length;k+=3)values.push(transform(p.matrix,[...q.positions.slice(k,k+3)])[a]);assert.ok(Math.abs(Math.min(...values)-lo)<1e-5);assert.ok(Math.abs(Math.max(...values)-hi)<1e-5);}}
});
test('II retains first person while Catch has a strict north-fixed overhead map and physical operator',()=>{
  const ii={...fresh(),yaw:.63,pitch:-.78},first=sourceContinuationRenderFrame(ii);assert.deepEqual(first.eye,[ii.x,ii.feet+C.eyeHeight,ii.z]);assert.equal(first.pitch,-.78);assert.equal(first.yaw,.63);assert.equal(first.strictOverhead,false);assert.equal(first.counts.body,0);
  for(let level=0;level<4;level++){const s=catchState(level,{yaw:.63,pitch:-.78,heading:1.1}),f=sourceContinuationRenderFrame(s),body=f.props.find(p=>p.playerBody);assert.equal(f.pitch,-Math.PI/2);assert.equal(f.yaw,0);assert.equal(f.strictOverhead,true);assert.deepEqual(cameraBasis(f.yaw,f.pitch).right,[1,0,0]);assert.ok(f.eye[1]>=s.feet+14.8);assert.ok(f.eye[1]<s.feet+23);assert.equal(f.cameraAimTarget[1],s.feet);assert.equal(f.counts.body,1);assert.ok(Math.abs(body.x-s.x)<1e-5);assert.ok(Math.abs(body.y-s.feet)<1e-5);assert.ok(Math.abs(body.z-s.z)<1e-5);assert.ok(Math.abs(Math.atan2(body.matrix[2],body.matrix[0])-1.1)<1e-6);}
});
test('closer overhead frustum contains both bodies, available edges and their receiving catches at wide and portrait sizes',()=>{
  for(const aspect of[16/9,3/4])for(let level=0;level<4;level++){
    const state=catchState(level);state.hush={...state.hush,active:true,x:state.x+6,z:state.z-5,feet:state.feet};
    const frame=sourceContinuationRenderFrame(state,{viewportAspect:aspect}),basis=cameraBasis(frame.yaw,frame.pitch);
    const project=point=>{const delta=point.map((v,k)=>v-frame.eye[k]),dot=b=>delta.reduce((n,v,k)=>n+v*b[k],0),depth=dot(basis.forward);return[dot(basis.right)/(depth*.95*aspect),dot(basis.up)/(depth*.95)];};
    for(const actor of[{...state,feet:state.feet},state.hush])for(const height of[0,1.8])assert.ok(project([actor.x,actor.feet+height,actor.z]).every(v=>Math.abs(v)<.9),'the actual bodies retain a view margin');
    for(const lip of continuationProps().filter(p=>p.kind==='release-lip'&&p.level===level)){
      const points=[[lip.x,state.feet,lip.z],[lip.x+lip.dx*1.1,continuationCatchFloor(level+1),lip.z+lip.dz*1.1]];
      for(const point of points)assert.ok(project(point).every(v=>Math.abs(v)<.95),`${aspect} stage ${level} ${lip.id}: readable departure and receiving floor`);
    }
    assert.ok(frame.props.some(p=>p.physicalKind==='surface'&&p.level===level));if(level<3)assert.ok(frame.props.some(p=>p.physicalKind==='surface'&&p.level===level+1));
  }
});
test('one actual density core and fitted return preserve saved identity, material phase and portal transforms',()=>{
  const actor={id:'source-continuation-hush',active:true,x:-31,z:-10,feet:2.4,heading:.7,mode:'follow',animationClock:1.25,
    density:{version:1,phase:.37,traction:.8,compression:.5,event:'travel',eventTime:0,seed:0}},state=catchState(1,{hush:actor}),anchor={x:12,y:4,z:-8},rotation=Math.PI/2;
  const plain=sourceContinuationRenderFrame(state,{anchor}),turned=sourceContinuationRenderFrame(state,{anchor,studyRotation:rotation}),instances=pressureInstances(turned.hush,null);
  assert.equal(instances.length,1);assert.equal(instances[0].mesh,'hush_density_core');assert.equal(instances[0].densitySurface,true);assert.equal(plain.hush.id,actor.id);assert.equal(turned.hush.id,actor.id);assert.equal(turned.counts.hush,1);
  assert.ok(Math.abs((plain.hush.x+.5)*CELL-(anchor.x+actor.x))<1e-5);assert.ok(Math.abs((plain.hush.y+.5)*CELL-(anchor.z+actor.z))<1e-5);assert.equal(plain.hush.floorH,anchor.y+actor.feet);
  assert.ok(Math.abs(instances[0].x-(anchor.x+C.catch.center.x-(actor.z-C.catch.center.z)))<1e-5);assert.ok(Math.abs(instances[0].z-(anchor.z+C.catch.center.z+(actor.x-C.catch.center.x)))<1e-5);assert.equal(instances[0].y,anchor.y+actor.feet);
  assert.equal(turned.hush.performance.clip,'pressure_approach');assert.equal(turned.hush.performance.time,actor.animationClock/2.36*2.4);assert.ok(Math.abs(turned.hush.performance.heading-(actor.heading+rotation))<1e-6);
  assert.equal(instances[0].character.time,actor.density.phase*2.4,'canonical material phase wins over the legacy human clock');
  assert.equal(instances[0].character.support,undefined);assert.ok(instances[0].character.joints.fold_B_3);
  const returns=pressureSurfaceInstances(turned.pressureInstances);assert.equal(returns.length,turned.pressureInstances.length);
  for(let i=0;i<returns.length;i++){
    const core=turned.pressureInstances[i],surface=returns[i];assert.equal(surface.mesh,'hush_density_return');
    assert.deepEqual([...surface.matrix],[...core.matrix]);assert.deepEqual(surface.character,core.character);
    assert.deepEqual(surface.portalClipPlanes,core.portalClipPlanes);assert.deepEqual(surface.portalExcludePlanes,core.portalExcludePlanes);
  }
  assert.equal(sourceContinuationRenderFrame({...state,hush:{...actor,mode:'yield'}}).hush.performance.clip,'pressure_hold');
});
test('overhead cuts the near-camera spindle cap, hoist and prior world while retaining real receiving geometry and remote pressure',()=>{
  for(let level=0;level<4;level++){
    const frame=sourceContinuationRenderFrame(catchState(level)),spindle=frame.props.find(p=>p.continuousSpindle);
    assert.ok(Math.abs(transform(spindle.matrix,[0,17,0])[1]-(continuationCatchFloor(level)+2.4))<1e-5);assert.ok(Math.abs(transform(spindle.matrix,[0,-25,0])[1]+25)<1e-5);
    assert.ok(frame.eye[1]-spindle.cutawayTop>10);assert.equal(frame.props.some(p=>p.hoistRail||p.hoistTrolley||p.counterweightCable),false);
    assert.ok(frame.props.some(p=>p.surroundings),'the huge pressure world remains actual submitted geometry');assert.ok(frame.geometry.surfaces.some(s=>s.region==='wrong-return'),'cutaway never removes physical II');
  }
  const state=catchState(0,{x:-26,z:-12,hush:{id:'source-continuation-hush',active:true,x:-16,z:-12,feet:8.4,heading:-Math.PI/2,mode:'follow'}}),crossing=sourceContinuationRenderFrame(state);
  assert.ok(crossing.props.some(p=>p.physicalKind==='surface'&&p.region==='wrong-return'&&p.physicalBounds.min[0]<=-16&&p.physicalBounds.max[0]>=-16),'the nearby pursuer retains its actual previous-world support during the doorway crossing');
  assert.equal(crossing.props.some(p=>p.assemblyId&&p.region==='wrong-return'),false,'one retained physical footway does not restore the towering previous-world banks');
});
test('falling below departure slabs cuts them before landing and follows the body while a rising jump retains its supported reference',()=>{
  const start=catchState(0),feet=start.feet-.8,fall={x:start.x,z:start.z,feet,vx:0,vz:0,vy:-2,fromLevel:0,fromPhase:'catch',trigger:'step-off',elapsed:.2,unsupported:true},air=sourceContinuationRenderFrame({...start,feet,fall}),ground=sourceContinuationRenderFrame(start);
  assert.equal(air.source.level,0,'a render cutaway cannot invent a landing');assert.deepEqual(air.hiddenAbove,[0]);assert.equal(air.props.some(p=>p.physicalKind==='surface'&&p.level===0),false);assert.ok(air.props.some(p=>p.physicalKind==='surface'&&p.level===1));assert.ok(Math.abs(air.eye[1]-(ground.eye[1]-.8))<1e-6);assert.ok(Math.abs(air.props.find(p=>p.playerBody).y-feet)<1e-5);
  const rising=sourceContinuationRenderFrame({...start,feet:start.feet+.8,fall:{...fall,feet:start.feet+.8,vy:2,trigger:'jump'}});assert.equal(rising.eye[1],ground.eye[1]);
  const lowerFeet=-5.6,skipping=sourceContinuationRenderFrame({...start,feet:lowerFeet,fall:{...fall,feet:lowerFeet,vy:-10}});assert.deepEqual(skipping.hiddenAbove,[0,1,2]);assert.equal(skipping.source.level,0);assert.ok(skipping.props.some(p=>p.physicalKind==='surface'&&p.level===3));
  const shadow=skipping.props.find(p=>p.contactShadow&&p.actorId==='operator');assert.ok(shadow);assert.equal(shadow.receiverY,continuationCatchFloor(3),'a full ray finds the first actual lower support, not the departed floor');
});
test('operator canvas is physical non-emissive cloth and both bodies have grounded contact shadows',()=>{
  const g=fakeGl(),pack={catalog:new Map()},maps={texture:{},normalTexture:{},ormTexture:{},letteringFinish:{}};installSourceContinuationMeshes(g.gl,pack,{maps});
  const material=pack.catalog.get('source-continuation-operator-jacket').primitives[0];assert.equal(material.texture,null);assert.equal(material.printedSurface,null);assert.deepEqual(material.emissive,[0,0,0]);assert.equal(material.metallic,0);assert.ok(material.base[0]>.8&&material.base[2]<.4,'warm canvas differs from the cold floor without repainting the world');
  const state=catchState(1);state.hush={...state.hush,active:true,x:state.x+.7,z:state.z,feet:state.feet};const frame=sourceContinuationRenderFrame(state);
  assert.equal(frame.props.filter(p=>p.physicalCanvas).length,1);assert.equal(frame.counts.hush,1);for(const id of['operator','hush']){const p=frame.props.find(p=>p.contactShadow&&p.actorId===id);assert.ok(p);assert.ok(Math.abs(p.y-(state.feet+.018))<1e-5);}
  assert.equal(frame.lights.filter(l=>l.shelfPractical&&l.level===state.level).length,3);assert.ok(frame.lights.every(l=>l.region!=='wrong-return'));
});
test('door hardware stays with the actual saved leaf swing, including partially open doors',()=>{
  const d=continuationDoors().find(d=>d.id==='wrong-onward'),s={...fresh(),x:d.x+1.2,z:d.z,feet:d.y,yaw:-Math.PI/2};
  const closed=sourceContinuationRenderFrame(s),partial=sourceContinuationRenderFrame({...s,elapsed:.325,doorOpen:{[d.id]:true},doorMotion:{[d.id]:{from:0,to:1,startedAt:0,duration:.65}}}),open=sourceContinuationRenderFrame({...s,doorOpen:{[d.id]:true}});
  const id='source-continuation-door-'+d.id+'-leaf-0',get=f=>f.props.find(p=>p.id===id);
  assert.notDeepEqual([...get(closed).matrix],[...get(partial).matrix]);assert.notDeepEqual([...get(partial).matrix],[...get(open).matrix]);assert.ok(partial.props.some(p=>p.doorHandle&&p.doorId===d.id&&p.focused));
});
test('42 real stair treads and their stringers retain physically open sides',()=>{
  const f=sourceContinuationRenderFrame(fresh());assert.equal(f.architecture.stairTreads,42);assert.equal(f.props.filter(p=>p.stairStructure).length,3);assert.equal(f.props.some(p=>p.handrail||p.baluster),false,'open stair edges have no decorative ghost barriers');const cut=sourceContinuationRenderFrame(catchState(3));assert.equal(cut.architecture.stairTreads,42);assert.equal(cut.props.some(p=>p.stairId),false);
  const treads=continuationSurfaces().filter(p=>p.role==='stair');assert.equal(new Set(treads.map(p=>p.stairId)).size,3);for(const id of new Set(treads.map(p=>p.stairId))){const heights=treads.filter(p=>p.stairId===id).map(p=>p.y).sort((a,b)=>a-b);for(let k=1;k<heights.length;k++)assert.ok(Math.abs(heights[k]-heights[k-1]-.3)<1e-6);}
});
test('native macro architecture has supported tops and no source model appears as an invisible collision cube',()=>{
  const f=sourceContinuationRenderFrame(fresh());for(const a of CONTINUATION_ASSEMBLIES){const p=f.props.find(p=>p.assemblyId===a.id);assert.ok(p);assert.equal(p.mesh,a.mesh);assert.ok(p.matrix.every(Number.isFinite));}
  assert.ok(f.props.some(p=>p.originalModel==='source_ii_case_floor'));assert.ok(f.props.some(p=>p.originalModel==='source_ii_piano_soundboard'));assert.ok(f.props.some(p=>p.originalModel==='grand_piano'));assert.ok(f.props.some(p=>p.originalModel==='open_instrument_case'));
});
test('lights belong to fixed architectural fixtures rather than following the current floor',()=>{
  const a=sourceContinuationRenderFrame(fresh()),b=sourceContinuationRenderFrame({...fresh(),x:10,z:-3});
  const fixed=f=>f.props.filter(p=>p.practical&&!Number.isInteger(p.level)).map(p=>[p.id,p.x,p.y,p.z]);assert.deepEqual(fixed(a),fixed(b));assert.ok(a.lights.length<=8&&b.lights.length<=8);assert.ok([...a.lights,...b.lights].every(p=>p.penetration===0));
});
test('the continuous spindle and each partial catch have visible bearing and tension members',()=>{
  const f=sourceContinuationRenderFrame(catchState(2));assert.equal(f.props.filter(p=>p.continuousSpindle).length,1);assert.equal(f.props.filter(p=>p.bearing).length,2);assert.equal(f.props.filter(p=>p.catchConstruction).length,2);assert.equal(f.props.filter(p=>p.tensionMember).length,4);
});
test('the final doorway previews the measured existing6.5m service road without a new progression owner',()=>{
  const f=sourceContinuationRenderFrame(catchState(3)),p=f.props.find(p=>p.previewOf==='existing-source-drive'),d=C.catch.finalDoor;assert.ok(p);assert.ok(Math.abs(p.y-d.y)<1e-5);assert.equal(p.matrix[10],6.5);assert.ok(p.x>d.x);assert.equal(f.props.filter(p=>p.onwardPreview&&p.kerb).length,2);
});
test('the disclosed transfer study rotates the entire persistent construction rigidly',()=>{
  const s={...catchState(1),yaw:.7},a=sourceContinuationRenderFrame(s),b=sourceContinuationRenderFrame(s,{studyRotation:Math.PI});assert.ok(Math.abs(b.eye[0]-(2*C.catch.center.x-a.eye[0]))<1e-5);assert.ok(Math.abs(b.eye[2]-(2*C.catch.center.z-a.eye[2]))<1e-5);assert.ok(Math.abs(b.yaw-Math.PI)<1e-6);assert.equal(a.props.length,b.props.length);
});
test('asset preparation coalesces and does not borrow the active scene before readiness',async()=>{
  let resolve;const h=fixture({baseGate:new Promise(r=>resolve=r)}),a=prewarmSourceContinuationAssets(h.options),b=prewarmSourceContinuationAssets(h.options);assert.equal(a,b);await Promise.resolve();assert.equal(h.calls.some(c=>c.name==='r3dSetPlan'),false);resolve(true);await a;assert.ok(h.catalog.has('source_iii_spindle'));assert.ok(h.catalog.has('source_demolition_retained'));assert.equal(h.calls.some(c=>c.name==='r3dSetProps'),false);
});
test('the original vehicle memories preload when available, but their absence never blocks Source',async()=>{
  const present=fixture();await prewarmSourceContinuationAssets(present.options);
  assert.ok(present.catalog.has('opening_drive_wheel'));assert.ok(present.catalog.has('opening_drive_wiper'));
  const missing=fixture({failVehicle:true});await prewarmSourceContinuationAssets(missing.options);
  assert.ok(!missing.catalog.has('opening_drive_wheel'));assert.ok(missing.catalog.has('source_ii_ellery_bay'));
});
test('an unresolved or failed real Hush body prevents readiness and scene acquisition',async()=>{
  let resolve;const h=fixture({bodyGate:new Promise(r=>resolve=r)}),pending=h.owner.initialize();
  await new Promise(r=>setTimeout(r,0));assert.equal(h.owner.ready(),false);assert.equal(h.calls.some(c=>c.name==='r3dSetPlan'),false);assert.equal(h.owner.render(fresh()),false);
  resolve(true);await pending;assert.equal(h.owner.ready(),true);h.owner.render(fresh());const submitted=h.calls.findLast(c=>c.name==='r3dFrame').args[0];assert.equal(submitted.hushSecondary,null);
  h.loseBody();assert.equal(h.owner.ready(),false);h.owner.render(fresh());await new Promise(r=>setTimeout(r,0));assert.equal(h.owner.ready(),true);h.owner.dispose();
  const failed=fixture({failBody:true});await assert.rejects(failed.owner.initialize(),/pressure body failed/);assert.equal(failed.owner.ready(),false);assert.equal(failed.calls.some(c=>c.name==='r3dSetPlan'),false);failed.owner.dispose();
});
test('the actual shared pressure preparation coalesces and verifies density layers plus separate human-reference residency',async()=>{
  const source=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8'),start=source.indexOf('export function r3dHushBodyReady()'),end=source.indexOf('export const HUSH_BODY_MODES',start);
  assert.ok(start>0&&end>start);let release,loads=0,fail=false;const installed=new Set(),density=['hush_density_core','hush_density_return','hush_density_volume'];
  const gate=new Promise(resolve=>release=resolve),scope=vm.createContext({hushBodyReady:false,hushBodyLoadError:null,hushBodyPackLoad:null,hushBodyPackBase:null,basePropPackLoad:{generation:1},HUSH_BODY_ASSET:'assets/hush-density.glb',HUSH_BODY_MESHES:[...density,'pressure_body'],assetUrl:value=>value,r3dBasePropsReady:async()=>true,
    P3:{characterStats:()=>({meshes:[...installed]}),addCharacterPack:async path=>{assert.ok(['assets/hush-density.glb','assets/pressure-character.glb'].includes(path));loads++;await gate;if(fail)throw Error('decode failed');for(const name of path.endsWith('hush-density.glb')?density:['pressure_body'])installed.add(name);}}});
  vm.runInContext(source.slice(start,end).replaceAll('export ',''),scope);
  const first=scope.r3dPrepareHushBody(),second=scope.r3dPrepareHushBody();assert.equal(first,second);assert.equal(scope.r3dHushBodyReady(),false);release();assert.equal(await first,true);assert.equal(loads,2);assert.equal(scope.r3dHushBodyReady(),true);
  installed.delete('hush_density_return');assert.equal(scope.r3dHushBodyReady(),false);await scope.r3dPrepareHushBody();assert.equal(loads,4,'losing a fitted layer repairs the complete character residency');
  installed.clear();fail=true;await assert.rejects(scope.r3dPrepareHushBody(),/decode failed/);assert.equal(scope.r3dHushBodyReady(),false);assert.match(scope.hushBodyLoadError,/decode failed/);
  fail=false;await scope.r3dPrepareHushBody();assert.equal(scope.r3dHushBodyReady(),true);assert.equal(loads,7);
});
test('the renderer leases the actual distant projection and returns it once on release',async()=>{
  const range=createPropRangeController(),h=fixture();
  h.options.props.setAuthoredPropRange=(owner,far)=>range.acquire(owner,far);
  assert.equal(range.current(),90);await h.owner.initialize();assert.equal(range.current(),300);
  h.owner.render(fresh());assert.equal(range.current(),300);
  h.owner.dispose();assert.equal(range.current(),90);h.owner.dispose();assert.equal(range.current(),90);
});
test('the actual renderer uploads travelling fronts and eligibility, then clears them for reduced motion and release',async()=>{
  let reduced=false;const h=fixture({getReducedMotion:()=>reduced});await h.owner.initialize();
  h.owner.render({...fresh(),elapsed:12});
  const live=h.calls.findLast(c=>c.name==='surroundings-pressure').args[0];
  assert.ok(live.waves.some(w=>w.world==='fall'));assert.ok(live.waves.some(w=>w.world==='centre'));
  for(const piece of sourceSurroundingsGeometryLibrary()){
    const primitive=h.catalog.get(piece.name).primitives[0];
    assert.equal(primitive.sourceSurroundingsPressure,true);
    assert.equal(primitive.sourceSurroundingsArcRadius,piece.sourceSurroundingsArcRadius);
  }
  reduced=true;h.owner.render({...fresh(),elapsed:18});
  const held=h.calls.findLast(c=>c.name==='surroundings-pressure').args[0];assert.equal(held.reducedMotion,true);assert.deepEqual(held.waves,[]);
  h.owner.dispose();assert.equal(h.calls.findLast(c=>c.name==='surroundings-pressure').args[0],null);
});
test('the adapter preserves torch state and authentic optical parameters through final dither',async()=>{
  let torch={on:false,look:{power:0,reach:0}};const h=fixture({getTorch:()=>torch});await h.owner.initialize();h.owner.render(fresh());let c=h.calls.findLast(p=>p.name==='r3dFrame').args[0];assert.equal(c.light,0);assert.deepEqual(c.torchLook,torch.look);
  torch={on:true,look:{power:.43,reach:.35,optics:'throw'}};h.owner.render(fresh());c=h.calls.findLast(p=>p.name==='r3dFrame').args[0];assert.equal(c.light,1);assert.deepEqual(c.torchLook,torch.look);assert.equal(c.authoredPropRange,SOURCE_CONTINUATION_ARCHITECTURE.far);assert.ok(c.authoredPropRange<=300,'remote surrounds retain the bounded authored clipping range');assert.equal(c.sensoryProfile,'story');assert.equal(c.sourceVoidPhysical,false);
  const lighting=h.calls.findLast(p=>p.name==='r3dSetLightingContext').args[0];assert.equal(lighting.ambientIntensity,SOURCE_CONTINUATION_LIGHTING.ambientIntensity,'the actual context must carry the selected architectural diffuse level');assert.equal(lighting.captureExposure,SOURCE_CONTINUATION_LIGHTING.captureExposure);h.owner.dispose();assert.equal(h.releases(),1);h.owner.dispose();assert.equal(h.releases(),1);
});
test('late catalogue loss repairs asset residency without reacquiring the plan or moving the body',async()=>{
  const h=fixture();await h.owner.initialize();const s=catchState(2),before=JSON.stringify(s);h.owner.render(s);const plans=h.calls.filter(c=>c.name==='r3dSetPlan').length;h.catalog.delete('source_iii_spindle');assert.equal(h.owner.ready(),false);h.owner.render(s);await new Promise(r=>setTimeout(r,0));assert.equal(h.owner.ready(),true);assert.equal(h.calls.filter(c=>c.name==='r3dSetPlan').length,plans);assert.equal(JSON.stringify(s),before);h.owner.dispose();
});
test('failed preparation remains recoverable and a late promise cannot reacquire a disposed view',async()=>{
  const failure=fixture({failDoors:true});await assert.rejects(failure.owner.initialize(),/door pack failed/);assert.equal(failure.owner.ready(),false);failure.owner.dispose();
  let release;const late=fixture({baseGate:new Promise(r=>release=r)}),pending=late.owner.initialize();late.owner.dispose();release(true);await pending;assert.equal(late.owner.ready(),false);assert.equal(late.calls.some(c=>c.name==='r3dSetPlan'),false);
});

test('controlled lighting diagnostics change only the measured context and preserve authoritative optics',async()=>{
  let lighting=null;const torch={on:true,look:{power:.31,reach:.22,optics:'reference'}},h=fixture({getTorch:()=>torch,getLighting:()=>lighting});
  await h.owner.initialize();h.owner.render(fresh());h.owner.render(fresh());assert.equal(h.calls.filter(c=>c.name==='r3dSetLightingContext').length,1,'unchanged context is not rewritten every frame');
  assert.equal(h.owner.diagnostics().lighting.ambientIntensity,.45);assert.equal(h.owner.diagnostics().lighting.captureExposure,1.6);
  lighting={ambientIntensity:.035,captureExposure:3.65,light:1,torchLook:{power:1,reach:1}};h.owner.render(fresh());const context=h.calls.findLast(c=>c.name==='r3dSetLightingContext').args[0],frame=h.calls.findLast(c=>c.name==='r3dFrame').args[0];
  assert.equal(context.ambientIntensity,.035);assert.equal(context.captureExposure,3.65);assert.equal(context.light,undefined);assert.equal(context.torchLook,undefined);assert.deepEqual(frame.torchLook,torch.look);assert.equal(frame.light,1);
  assert.equal(h.owner.diagnostics().frame.lighting.captureExposure,3.65);h.owner.dispose();
});
test('fixed grazing fixtures are attached to architectural joints with no floor-following fill',()=>{
  const a=sourceContinuationRenderFrame(fresh()),b=sourceContinuationRenderFrame(catchState(3));const fixtures=f=>f.lights.filter(l=>l.attachedTo).map(l=>[l.id,l.x,l.y,l.z,l.attachedTo]);
  assert.ok(a.props.some(p=>p.id==='source-continuation-practical-piano-key-joint'));assert.equal(b.props.some(p=>p.id==='source-continuation-practical-counterarc-bearing'),false,'the departed fixture participates in the overhead cutaway');assert.ok(b.props.some(p=>p.shelfPractical&&p.level===3));assert.ok([...a.lights,...b.lights].every(l=>l.penetration===0));
  for(const row of fixtures(a)){const matching=fixtures(b).find(l=>l[0]===row[0]);if(matching)assert.deepEqual(row,matching);}
  const bank=CONTINUATION_ASSEMBLIES.find(p=>p.id==='ii-whole-piano-bank'),joint=a.props.find(p=>p.id==='source-continuation-practical-piano-key-joint'),light=a.lights.find(l=>l.attachedTo==='ii-whole-piano-bank');
  assert.ok(Math.abs(joint.z-(bank.z+6.2))<1e-5,'decorative-bank relocation carries its attached practical');if(light)assert.ok(Math.abs(light.z-joint.z)<1e-5);
});
test('looking back retains the Earthfall construction and its original translated lower fixtures',async()=>{
  const g=fakeGl(),pack={catalog:new Map()};installSourceContinuationMeshes(g.gl,pack,{maps:{blueprint:true,texture:{},normalTexture:{},ormTexture:{},letteringFinish:{}}});
  const frame=sourceContinuationRenderFrame({...fresh(),z:3,yaw:Math.PI}),pieces=sourceContinuationGeometry(fresh()).filter(p=>p.role==='inherited-earthfall');
  assert.equal(pieces.length,2);for(const piece of pieces){assert.ok(frame.props.some(p=>p.descriptorId===piece.id));const material=pack.catalog.get(piece.name).primitives[0];if(piece.material==='earthfall-backing'){assert.deepEqual(material.base,[.035,.045,.039,1]);assert.equal(material.texture,null);assert.equal(material.printedSurface,null);assert.equal(material.metallic,0);assert.equal(material.roughness,1);assert.equal(material.materialRole,'quiet-metal');}else assert.deepEqual(material.printedSurface,SOURCE_BLUEPRINT_PRINT_SURFACE);}
  const {sourceEarthfallRenderFrame}=await import('../src/render/source-earthfall-renderer.js'),{freshSourceEarthfall}=await import('../src/game/source-earthfall.js'),{SOURCE_EARTHFALL}=await import('../src/data/source-earthfall.js');
  const original=sourceEarthfallRenderFrame(freshSourceEarthfall()),offset=continuationDoors(fresh()).find(d=>d.id==='wrong-entry-return').z-SOURCE_EARTHFALL.passage.exitZ;
  const rear=sourceContinuationRenderFrame({...fresh(),z:24,yaw:Math.PI}),retained=rear.lights.filter(l=>l.inheritedEarthfall);assert.equal(retained.length,2);assert.ok(frame.lights.some(l=>l.inheritedEarthfall&&l.id.endsWith('lower-spine')));for(const lamp of retained){const old=original.lights.find(l=>lamp.id.endsWith(l.id.replace('source-earthfall-','')));assert.ok(old,lamp.id);for(const key of['x','y','radius','intensity'])assert.equal(lamp[key],old[key]);assert.deepEqual(lamp.color,old.color);assert.equal(lamp.z,old.z+offset);assert.equal(lamp.penetration,0);}
  assert.ok(frame.lights.length<=SOURCE_CONTINUATION_ARCHITECTURE.maxLights);
});
test('the overlook guard is visibly open with narrow actual rails and body-sized gaps excluded',()=>{
  const rows=continuationSolids().filter(p=>p.role==='overlook-rail'),posts=rows.filter(p=>p.id.includes('-post-')).sort((a,b)=>a.minZ-b.minZ),rails=rows.filter(p=>!p.id.includes('-post-'));
  assert.equal(posts.length,14);assert.equal(rails.length,3);assert.ok(rails.filter(p=>p.id.includes('toprail')).every(p=>p.maxZ<=2.93||p.minZ>=3.32),'the deliberate observation window extends through the top rail');
  for(let k=1;k<posts.length;k++)assert.ok(posts[k].minZ-posts[k-1].maxZ<C.bodyRadius*2,'a whole standing body cannot pass through the authored baluster gap');
  assert.ok(rails.every(p=>p.maxY-p.minY<.061));assert.ok(posts.every(p=>p.maxZ-p.minZ<.061));
  const height=Math.max(...rows.map(p=>p.maxY))-Math.min(...rows.map(p=>p.minY)),area=rows.reduce((n,p)=>n+(p.maxZ-p.minZ)*(p.maxY-p.minY),0);assert.ok(area<5*height*.4,'over60percent of the guard view remains an actual opening');
  const f=sourceContinuationRenderFrame(fresh());for(const p of rows){const drawn=f.props.find(q=>q.descriptorId===p.id);assert.ok(drawn,p.id);assert.equal(drawn.role,'overlook-rail');}
  assert.equal(f.props.some(p=>p.descriptorId==='wrong-overlook-rail'),false,'the previous opaque panel must not remain behind the bars');
});


test('an observed portal serial clears acquisition history once while retaining the one loaded scene and actual body instances',async()=>{
  const h=fixture();await h.owner.initialize();const s=fresh();h.owner.render(s);const before=h.calls.filter(c=>c.name==='r3dResetVfdMemory').length,plans=h.calls.filter(c=>c.name==='r3dSetPlan').length;
  const crossed={...s,foldSerial:1,lastFold:{serial:1,id:'first-return',side:'a'}};h.owner.render(crossed);h.owner.render(crossed);
  assert.equal(h.calls.filter(c=>c.name==='r3dResetVfdMemory').length,before+1);assert.equal(h.calls.filter(c=>c.name==='r3dSetPlan').length,plans);const call=h.calls.filter(c=>c.name==='r3dFrame').at(-1);assert.ok(call.args[0].sourcePressureInstances.every(p=>p.mesh==='hush_density_core'&&p.densitySurface&&p.matrix?.length===16));h.owner.dispose();
  assert.deepEqual(h.calls.findLast(c=>c.name==='pressure-surface').args[0],[],'release cannot leak fitted density surfaces into the next scene');
});
