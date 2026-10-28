import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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

const fresh=()=>({...freshSourceContinuation({runId:'render-proof',returnPose:{x:12,y:34,yaw:.7,pitch:-.1}}),status:'active'});
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
function fixture({baseGate=null,doorGate=null,missingBase=[],omitCustom=false,failDoors=false,getTorch=()=>({on:false,look:{power:0}}),getLighting=()=>null}={}){
  const calls=[],catalog=new Map(['instrument_case','grand_piano','open_instrument_case','ending_body_standing','tower_bell_04','tower_clapper_04'].filter(m=>!missingBase.includes(m)).map(m=>[m,{}])),g=fakeGl();let releases=0;
  const renderer=Object.fromEntries(Object.keys(R3).filter(k=>typeof R3[k]==='function').map(k=>[k,(...args)=>{calls.push({name:k,args});return k==='r3dFrame'?true:undefined;}]));
  renderer.r3dBasePropsReady=async()=>{calls.push({name:'base',args:[]});return baseGate?await baseGate:true;};renderer.r3dViewCamera=()=>({width:1280,height:720});
  const maps={texture:{source:true},normalTexture:{normal:true},ormTexture:{orm:true},letteringFinish:{version:1}};
  const props={propMeshCatalog:()=>[...catalog.keys()],setAuthoredPropRange(owner,far){assert.equal(typeof owner,'symbol');calls.push({name:'range',args:[far]});return()=>calls.push({name:'range-release',args:[]});},setPressureInstances:next=>calls.push({name:'pressure',args:[next]}),installAuthoredPropMeshes(installer){calls.push({name:'install',args:[]});return installer(g.gl,{catalog});},async addPropPack(url){calls.push({name:'pack',args:[url]});if(doorGate)await doorGate;if(failDoors)throw Error('door pack failed');if(url.includes('source-continuation-architecture'))for(const n of SOURCE_CONTINUATION_ARCHITECTURE.meshes)catalog.set(n,{});if(url.includes('source-demolition'))catalog.set('source_demolition_retained',{});const door=doorAssembly('bay-goods-pair',{activeLeaves:'all'});for(const name of[door.frameMesh,door.leafMesh,door.freeStandingHeadMesh].filter(Boolean))catalog.set(name,{});}};
  const options={renderer,props,getTorch,getLighting,resolveAsset:url=>'fixture:'+url,installMeshes:(gl,pack)=>{const names=installSourceContinuationMeshes(gl,pack,{maps});if(omitCustom)pack.catalog.delete(names[0]);return names;},onRelease:()=>{releases++;calls.push({name:'release',args:[]});}};
  const owner=createSourceContinuationRenderer(options);
  return{owner,options,calls,catalog,g,releases:()=>releases};
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
  const sectors=sourceContinuationGeometry(fresh()).filter(p=>p.descriptor.kind==='sector');assert.equal(sectors.length,4);
  assert.equal(new Set(sectors.map(p=>[p.descriptor.innerRadius,p.descriptor.outerRadius,p.descriptor.startAngle,p.descriptor.endAngle].join(':'))).size,4);
  for(const p of sectors){const q=sourceContinuationMeshPayload(p),d=p.descriptor;const radius=d.innerRadius*.65,a=(d.startAngle+d.endAngle)/2,x=d.center.x+Math.cos(a)*radius,z=d.center.z+Math.sin(a)*radius;
    for(let k=0;k<q.positions.length;k+=9)if(q.normals[k+1]>.9){const ps=[0,1,2].map(j=>[0,1,2].map(ax=>q.positions[k+j*3+ax]+q.bounds.center[ax]));assert.equal(triangleY(ps,x,z),null,'central void must remain a real aperture');}
  }
});
test('physical print installation is bounded and idempotent with all material channels retained',()=>{
  const g=fakeGl(),pack={catalog:new Map()},maps={texture:{},normalTexture:{},ormTexture:{},letteringFinish:{}};
  const names=installSourceContinuationMeshes(g.gl,pack,{maps}),count=g.buffers.length;
  const surroundings=new Map(sourceSurroundingsGeometryLibrary().map(piece=>[piece.name,piece])),originalNames=names.filter(name=>!surroundings.has(name));
  assert.ok(originalNames.length>80&&originalNames.length<180);
  assert.equal(names.length,originalNames.length+surroundings.size,'the added catalogue is exactly the declared static surroundings library');
  assert.deepEqual(installSourceContinuationMeshes(g.gl,pack,{maps}),names);assert.equal(g.buffers.length,count);
  for(const entry of pack.catalog.values()){
    const p=entry.primitives[0],added=surroundings.get(entry.name);
    if(added){assert.equal(p.materialRole,added.materialRole);assert.deepEqual(p.emissive,added.emissive);assert.equal(entry.extras.triangles,added.triangles);}
    else{assert.ok(['source-continuation','quiet-metal'].includes(p.materialRole));assert.deepEqual(p.emissive,[0,0,0]);}
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
test('both complete regions and the upper remnants persist across every Catch stage',()=>{
  const start=sourceContinuationRenderFrame(fresh()),ids=start.props.filter(p=>p.physicalKind==='surface').map(p=>p.descriptorId).sort();
  for(let level=0;level<4;level++){const f=sourceContinuationRenderFrame(catchState(level));assert.deepEqual(f.props.filter(p=>p.physicalKind==='surface').map(p=>p.descriptorId).sort(),ids);assert.deepEqual(f.hiddenAbove,[]);assert.deepEqual(f.architecture.persistentRegions,['wrong-return','catch']);assert.equal(f.props.find(p=>p.upperRemnant).y,100);assert.ok(f.props.some(p=>p.assemblyId==='ii-ellery-overhead'&&p.orientation==='sideways'));assert.ok(f.props.some(p=>p.orientation==='inverted'));}
});
test('drawn simulation boxes share exact collision bounds; asset poles and arch piers avoid proxy duplication',()=>{
  const s={...fresh(),closure:{mode:'closing',elapsed:20,frontX:7}},f=sourceContinuationRenderFrame(s);
  for(const d of continuationSolids(s)){const p=f.props.find(p=>p.physicalKind==='solid'&&p.descriptorId===d.id);if(['spindle','arch-pier'].includes(d.role)){assert.equal(p,undefined);continue;}assert.ok(p,d.id);const g=sourceContinuationGeometry(s).find(p=>p.kind==='solid'&&p.id===d.id),q=sourceContinuationMeshPayload(g);for(const[a,lo,hi]of[[0,d.minX,d.maxX],[1,d.minY,d.maxY],[2,d.minZ,d.maxZ]]){let values=[];for(let k=0;k<q.positions.length;k+=3)values.push(transform(p.matrix,[...q.positions.slice(k,k+3)])[a]);assert.ok(Math.abs(Math.min(...values)-lo)<1e-5);assert.ok(Math.abs(Math.max(...values)-hi)<1e-5);}}
});
test('first-person camera follows valid body support and retains ordinary yaw and pitch',()=>{
  for(const base of[fresh(),...Array.from({length:4},(_,k)=>catchState(k))]){const s={...base,yaw:.63,pitch:-.78},f=sourceContinuationRenderFrame(s);assert.deepEqual(f.eye,[s.x,s.feet+C.eyeHeight,s.z]);assert.equal(f.pitch,-.78);assert.equal(f.yaw,.63);assert.equal(f.strictOverhead,false);assert.equal(f.props.some(p=>p.playerBody),false);}
});
test('door hardware stays with the actual saved leaf swing, including partially open doors',()=>{
  const d=continuationDoors().find(d=>d.id==='wrong-onward'),s={...fresh(),x:d.x+1.2,z:d.z,feet:d.y,yaw:-Math.PI/2};
  const closed=sourceContinuationRenderFrame(s),partial=sourceContinuationRenderFrame({...s,elapsed:.325,doorOpen:{[d.id]:true},doorMotion:{[d.id]:{from:0,to:1,startedAt:0,duration:.65}}}),open=sourceContinuationRenderFrame({...s,doorOpen:{[d.id]:true}});
  const id='source-continuation-door-'+d.id+'-leaf-0',get=f=>f.props.find(p=>p.id===id);
  assert.notDeepEqual([...get(closed).matrix],[...get(partial).matrix]);assert.notDeepEqual([...get(partial).matrix],[...get(open).matrix]);assert.ok(partial.props.some(p=>p.doorHandle&&p.doorId===d.id&&p.focused));
});
test('42 real stair treads, stringers and rails remain in the world at every elevation',()=>{
  const f=sourceContinuationRenderFrame(catchState(3));assert.equal(f.architecture.stairTreads,42);assert.equal(f.props.filter(p=>p.stairStructure).length,3);assert.equal(f.props.filter(p=>p.handrail).length,6);assert.equal(f.props.filter(p=>p.baluster).length,48);
  const treads=continuationSurfaces().filter(p=>p.role==='stair');assert.equal(new Set(treads.map(p=>p.stairId)).size,3);for(const id of new Set(treads.map(p=>p.stairId))){const heights=treads.filter(p=>p.stairId===id).map(p=>p.y).sort((a,b)=>a-b);for(let k=1;k<heights.length;k++)assert.ok(Math.abs(heights[k]-heights[k-1]-.3)<1e-6);}
});
test('native macro architecture has supported tops and no source model appears as an invisible collision cube',()=>{
  const f=sourceContinuationRenderFrame(fresh());for(const a of CONTINUATION_ASSEMBLIES){const p=f.props.find(p=>p.assemblyId===a.id);assert.ok(p);assert.equal(p.mesh,a.mesh);assert.ok(p.matrix.every(Number.isFinite));}
  assert.ok(f.props.some(p=>p.originalModel==='source_ii_case_floor'));assert.ok(f.props.some(p=>p.originalModel==='source_ii_piano_soundboard'));assert.ok(f.props.some(p=>p.originalModel==='grand_piano'));assert.ok(f.props.some(p=>p.originalModel==='open_instrument_case'));
});
test('lights belong to fixed architectural fixtures rather than following the current floor',()=>{
  const a=sourceContinuationRenderFrame(fresh()),b=sourceContinuationRenderFrame(catchState(3));
  const fixed=f=>f.props.filter(p=>p.practical).map(p=>[p.id,p.x,p.y,p.z]);assert.deepEqual(fixed(a),fixed(b));assert.ok(a.lights.length<=8&&b.lights.length<=8);assert.ok([...a.lights,...b.lights].every(p=>p.penetration===0));
});
test('the continuous spindle and each partial catch have visible bearing and tension members',()=>{
  const f=sourceContinuationRenderFrame(catchState(2));assert.equal(f.props.filter(p=>p.continuousSpindle).length,1);assert.equal(f.props.filter(p=>p.bearing).length,4);assert.equal(f.props.filter(p=>p.catchConstruction).length,4);assert.equal(f.props.filter(p=>p.tensionMember).length,8);
});
test('the final doorway previews the measured existing6.5m service road without a new progression owner',()=>{
  const f=sourceContinuationRenderFrame(catchState(3)),p=f.props.find(p=>p.previewOf==='existing-source-drive'),d=C.catch.finalDoor;assert.ok(p);assert.ok(Math.abs(p.y-d.y)<1e-5);assert.equal(p.matrix[10],6.5);assert.ok(p.x>d.x);assert.equal(f.props.filter(p=>p.onwardPreview&&p.kerb).length,2);
});
test('the disclosed transfer study rotates the entire persistent construction rigidly',()=>{
  const s={...catchState(1),yaw:.7},a=sourceContinuationRenderFrame(s),b=sourceContinuationRenderFrame(s,{studyRotation:Math.PI});assert.ok(Math.abs(b.eye[0]-(2*C.catch.center.x-a.eye[0]))<1e-5);assert.ok(Math.abs(b.eye[2]-(2*C.catch.center.z-a.eye[2]))<1e-5);assert.ok(Math.abs(b.yaw-(.7-Math.PI))<1e-6);assert.equal(a.props.length,b.props.length);
});
test('asset preparation coalesces and does not borrow the active scene before readiness',async()=>{
  let resolve;const h=fixture({baseGate:new Promise(r=>resolve=r)}),a=prewarmSourceContinuationAssets(h.options),b=prewarmSourceContinuationAssets(h.options);assert.equal(a,b);await Promise.resolve();assert.equal(h.calls.some(c=>c.name==='r3dSetPlan'),false);resolve(true);await a;assert.ok(h.catalog.has('source_iii_spindle'));assert.ok(h.catalog.has('source_demolition_retained'));assert.equal(h.calls.some(c=>c.name==='r3dSetProps'),false);
});
test('the renderer leases the actual distant projection and returns it once on release',async()=>{
  const range=createPropRangeController(),h=fixture();
  h.options.props.setAuthoredPropRange=(owner,far)=>range.acquire(owner,far);
  assert.equal(range.current(),90);await h.owner.initialize();assert.equal(range.current(),300);
  h.owner.render(fresh());assert.equal(range.current(),300);
  h.owner.dispose();assert.equal(range.current(),90);h.owner.dispose();assert.equal(range.current(),90);
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
  assert.ok(a.props.some(p=>p.id==='source-continuation-practical-piano-key-joint'));assert.ok(b.props.some(p=>p.id==='source-continuation-practical-counterarc-bearing'));assert.ok([...a.lights,...b.lights].every(l=>l.penetration===0));
  for(const row of fixtures(a)){const matching=fixtures(b).find(l=>l[0]===row[0]);if(matching)assert.deepEqual(row,matching);}
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
