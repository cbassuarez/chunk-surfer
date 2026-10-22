import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SOURCE_CONTINUATION as C,continuationSurfaces,continuationSolids,continuationSurfaceY,continuationCatchFloor} from '../src/data/source-continuation.js';
import {freshSourceContinuation,sourceContinuationFrame,stepSourceContinuation} from '../src/game/source-continuation.js';
import {sourceContinuationGeometry,sourceContinuationMeshPayload,installSourceContinuationMeshes,sourceContinuationRenderFrame,createSourceContinuationRenderer} from '../src/render/source-continuation-renderer.js';
import {doorAssembly} from '../src/data/source-door-fields.js';
import {PROP_BOUNDS} from '../src/data/generated/prop-geometry.js';
import {SOURCE_PRINT_SURFACE} from '../src/render/physical-source-print.js';
import * as R3 from '../src/render/r3d.js';

const fresh=()=>({...freshSourceContinuation({runId:'render-proof',returnPose:{x:12,y:34,yaw:.7,pitch:-.1}}),status:'active'});
function catchState(level=0,extra={}){return{...fresh(),phase:'catch',x:-19,z:0,feet:continuationCatchFloor(level),level,...extra};}
const transform=(m,p)=>[0,1,2].map(a=>m[a]*p[0]+m[a+4]*p[1]+m[a+8]*p[2]+m[a+12]);
function baseAsset(){const b=readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url)),jsonLength=b.readUInt32LE(12);return{buffer:b,json:JSON.parse(b.subarray(20,20+jsonLength)),binOffset:28+jsonLength};}
function triangleY(points,x,z){
  const[a,b,c]=points,den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(den)<1e-9)return null;
  const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den,w=1-u-v;
  return Math.min(u,v,w)<-1e-6?null:u*a[1]+v*b[1]+w*c[1];
}
function fakeGl(){
  let current=null,serial=0;const buffers=[],vaos=[];
  const gl={ARRAY_BUFFER:34962,ELEMENT_ARRAY_BUFFER:34963,STATIC_DRAW:35044,FLOAT:5126,UNSIGNED_INT:5125,TEXTURE_2D:3553,ACTIVE_TEXTURE:34016,TEXTURE_BINDING_2D:32873,UNPACK_FLIP_Y_WEBGL:37440,UNPACK_PREMULTIPLY_ALPHA_WEBGL:37441,SRGB8_ALPHA8:35907,RGBA8:32856,RGBA:6408,UNSIGNED_BYTE:5121,LINEAR_MIPMAP_LINEAR:9987,LINEAR:9729,REPEAT:10497,CLAMP_TO_EDGE:33071,
    createBuffer(){const b={id:++serial};buffers.push(b);return b;},createVertexArray(){const vao={id:++serial};vaos.push(vao);return vao;},createTexture:()=>({texture:++serial}),
    bindBuffer(_target,b){current=b;},bufferData(_target,data){if(current)current.data=data.slice();},bindVertexArray(){},enableVertexAttribArray(){},disableVertexAttribArray(){},vertexAttribPointer(){},vertexAttribDivisor(){},vertexAttrib1f(){},bindTexture(){},pixelStorei(){},texImage2D(){},generateMipmap(){},texParameteri(){},activeTexture(){},getParameter:()=>0};
  return{gl,buffers,vaos};
}
function fixture({baseGate=null,doorGate=null,missingBase=[],omitCustom=false,failDoors=false}={}){
  const calls=[],catalog=new Map(['instrument_case','grand_piano','ending_body_standing'].filter(m=>!missingBase.includes(m)).map(m=>[m,{}])),g=fakeGl();let releases=0;
  const renderer=Object.fromEntries(Object.keys(R3).filter(k=>typeof R3[k]==='function').map(k=>[k,(...args)=>{calls.push({name:k,args});return k==='r3dFrame'?true:undefined;}]));
  renderer.r3dBasePropsReady=async()=>{calls.push({name:'base',args:[]});return baseGate?await baseGate:true;};renderer.r3dViewCamera=()=>({width:1280,height:720});
  const maps={texture:{source:true},normalTexture:{normal:true},ormTexture:{orm:true},letteringFinish:{version:1}};
  const props={propMeshCatalog:()=>[...catalog.keys()],setPressureInstances:next=>calls.push({name:'pressure',args:[next]}),installAuthoredPropMeshes(installer){calls.push({name:'install',args:[]});return installer(g.gl,{catalog});},async addPropPack(url){calls.push({name:'pack',args:[url]});if(doorGate)await doorGate;if(failDoors)throw Error('door pack failed');const door=doorAssembly('bay-goods-pair',{activeLeaves:'all'});for(const name of[door.frameMesh,door.leafMesh,door.freeStandingHeadMesh].filter(Boolean))catalog.set(name,{});}};
  const owner=createSourceContinuationRenderer({renderer,props,resolveAsset:url=>'fixture:'+url,installMeshes:(gl,pack)=>{const names=installSourceContinuationMeshes(gl,pack,{maps});if(omitCustom)pack.catalog.delete(names[0]);return names;},onRelease:()=>{releases++;calls.push({name:'release',args:[]});}});
  return{owner,calls,catalog,g,releases:()=>releases};
}

test('actual uploaded top triangles agree with every controller support surface, including the ramp',()=>{
  let sampled=0,triangles=0;
  for(const phase of['wrong-return','catch'])for(const piece of sourceContinuationGeometry({phase})){
    const payload=sourceContinuationMeshPayload(piece),d=piece.descriptor;triangles+=payload.triangles;
    assert.ok([...payload.positions,...payload.normals,...payload.uvs].every(Number.isFinite));
    for(let i=0;i<payload.positions.length;i+=9){const points=[0,1,2].map(k=>[0,1,2].map(a=>payload.positions[i+k*3+a]+payload.bounds.center[a])),centroid=[0,1,2].map(a=>points.reduce((n,p)=>n+p[a],0)/3),normal=[...payload.normals.slice(i,i+3)];
      assert.ok(normal.reduce((n,v,a)=>n+v*(centroid[a]-payload.bounds.center[a]),0)>0,'triangle winding points away from the solid rather than into it');
    }
    if(piece.kind!=='surface')continue;
    for(let a=1;a<5;a++)for(let b=1;b<5;b++){
      const x=d.minX+(d.maxX-d.minX)*a/5,z=d.minZ+(d.maxZ-d.minZ)*b/5,ys=[];
      for(let i=0;i<payload.positions.length;i+=9)if(payload.normals[i+1]>.1){const points=[0,1,2].map(k=>[0,1,2].map(axis=>payload.positions[i+k*3+axis]+payload.bounds.center[axis])),y=triangleY(points,x,z);if(y!=null)ys.push(y);}
      assert.ok(ys.some(y=>Math.abs(y-continuationSurfaceY(d,x,z))<1e-5),d.id);sampled++;
    }
  }
  assert.ok(sampled>500);assert.ok(triangles>700);
});

test('runtime-installed physical print meshes are bounded, idempotent and retain all source material channels',()=>{
  const g=fakeGl(),pack={catalog:new Map()},maps={texture:{},normalTexture:{},ormTexture:{},letteringFinish:{}};
  const names=installSourceContinuationMeshes(g.gl,pack,{maps}),buffers=g.buffers.length;assert.ok(names.length>60&&names.length<120);
  assert.deepEqual(installSourceContinuationMeshes(g.gl,pack,{maps}),names);assert.equal(g.buffers.length,buffers,'no per-frame or repeated-entry allocations for resident shapes');
  for(const entry of pack.catalog.values()){assert.ok(entry.extras.bounds.min.every(Number.isFinite));assert.ok(entry.extras.triangles>0);const p=entry.primitives[0];assert.equal(p.materialRole,'source-continuation');assert.equal(p.emissive.reduce((n,v)=>n+v,0),0);if(p.printedSurface){assert.deepEqual(p.printedSurface,SOURCE_PRINT_SURFACE);assert.equal(p.texture,maps.texture);assert.equal(p.normalTexture,maps.normalTexture);assert.equal(p.ormTexture,maps.ormTexture);}}
});

test('every drawn controller solid has the same finite world bounds while the closure moves',()=>{
  for(const state of[fresh(),{...fresh(),closure:{mode:'closing',elapsed:8,frontZ:.3}},catchState(0),catchState(3),catchState(6)]){
    const frame=sourceContinuationRenderFrame(state);for(const solid of continuationSolids(state)){
      const drawn=frame.props.find(p=>p.descriptorId===solid.id);if(solid.role==='furniture'||solid.level!=null&&solid.level<frame.activeLevel){assert.equal(drawn,undefined);continue;}assert.ok(drawn,solid.id);
      const geom=sourceContinuationGeometry(state).find(p=>p.id===solid.id&&p.kind==='solid'),payload=sourceContinuationMeshPayload(geom),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
      for(let i=0;i<payload.positions.length;i+=3){const p=transform(drawn.matrix,[...payload.positions.slice(i,i+3)]);for(let a=0;a<3;a++){min[a]=Math.min(min[a],p[a]);max[a]=Math.max(max[a],p[a]);}}
      for(const[a,lo,hi]of[[0,solid.minX,solid.maxX],[1,solid.minY,solid.maxY],[2,solid.minZ,solid.maxZ]]){assert.ok(Math.abs(min[a]-lo)<1e-5,solid.id);assert.ok(Math.abs(max[a]-hi)<1e-5,solid.id);}
    }
  }
});

test('Wrong Return retains first person and real opening leaf movement without mutating state or look targets',async()=>{
  const state={...fresh(),x:0,feet:3,z:-1,yaw:1.2,pitch:-1.1,doorOpen:{'wrong-onward':true}},before=JSON.stringify(state),frame=sourceContinuationRenderFrame(state),closed=sourceContinuationRenderFrame({...state,doorOpen:{}});
  assert.equal(frame.strictOverhead,false);assert.deepEqual(frame.eye,[0,4.62,-1]);assert.equal(frame.authoredCamera.pitch,-1.1);assert.equal(frame.props.some(p=>p.playerBody),false);
  assert.notDeepEqual([...frame.props.find(p=>p.id.includes('wrong-onward-leaf-0')).matrix],[...closed.props.find(p=>p.id.includes('wrong-onward-leaf-0')).matrix]);assert.equal(JSON.stringify(state),before);
  assert.equal(frame.props.filter(p=>p.matchingSeam&&p.role==='original-clue').length,3);assert.equal(frame.props.filter(p=>p.matchingSeam&&p.role==='matching-clue').length,3);
  const h=fixture();await h.owner.initialize();h.owner.render(state);assert.ok(!h.calls.some(c=>c.name==='r3dSetLookAngles'||c.name==='r3dSetCinematicLook'),'the presentation uses a frame-only eye rather than borrowing persistent Source aim');assert.equal(h.calls.findLast(c=>c.name==='r3dFrame').args[0].authoredCamera.pitch,-1.1);h.owner.dispose();
});

test('strict north-up Catch shows a body and actual lower shelves, with upper decks cut away at every depth',()=>{
  for(let level=0;level<=6;level++){
    const frame=sourceContinuationRenderFrame(catchState(level));assert.equal(frame.pitch,-Math.PI/2);assert.equal(frame.yaw,0);assert.equal(frame.strictOverhead,true);assert.equal(frame.counts.body,1);assert.equal(frame.props.filter(p=>p.playerBody).length,1);
    assert.ok(frame.props.filter(p=>p.physicalKind==='surface').every(p=>p.level>=level));for(let next=level;next<=Math.min(6,level+2);next++)assert.ok(frame.shownLevels.includes(next));
    assert.ok(frame.props.some(p=>p.doorId===`catch-return-${level}`));assert.ok(frame.props.some(p=>p.shaftDepth));assert.ok(frame.lights.length<=8);assert.ok(frame.props.every(p=>[...p.matrix].every(Number.isFinite)));assert.ok(frame.counts.props<200);
  }
});

test('actual retained operator vertices fit both wide and narrow strict overhead views, including entry bridge',()=>{
  const bounds=PROP_BOUNDS.ending_body_standing;assert.ok(bounds);const asset=baseAsset(),mesh=asset.json.meshes.find(m=>m.name==='ending_body_standing'),points=mesh.primitives.flatMap(p=>{const a=asset.json.accessors[p.attributes.POSITION],v=asset.json.bufferViews[a.bufferView];return Array.from({length:a.count},(_,i)=>[0,1,2].map(k=>asset.buffer.readFloatLE(asset.binOffset+(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||12)+k*4)));});let vertices=0;
  for(const aspect of[.65,.75,1,16/9,2.4])for(const[x,z]of[[-13.25,-1],[-30.5,7.5],[-31.6,-8.6],[-14.4,8.6],[-25.2,0]]){
    const frame=sourceContinuationRenderFrame(catchState(3,{x,z}),{viewportAspect:aspect}),body=frame.props.find(p=>p.playerBody);
    for(const a of bounds.min.map((_,i)=>i))assert.ok(Number.isFinite(bounds.max[a]));
    for(const point of points){const p=transform(body.matrix,point),depth=frame.eye[1]-p[1],nx=(p[0]-frame.eye[0])/(depth*.95*aspect),ny=(p[2]-frame.eye[2])/(depth*.95);assert.ok(depth>.1);assert.ok(Math.abs(nx)<.99&&Math.abs(ny)<.99,`${aspect}/${x}/${z}: body clipped`);vertices++;}
  }
  assert.equal(vertices,points.length*25);assert.ok(points.length>30,'sample every actual retained-body position, not a proxy marker');
});

test('counterweight body, warning and shadow use the real deterministic threat pose',()=>{
  const state=catchState(1,{counterweight:{...fresh().counterweight,active:true,mode:'warning',x:-17,z:0,y:3,level:0,elapsed:1}}),frame=sourceContinuationRenderFrame(state),w=frame.props.find(p=>p.counterweight);
  assert.ok(w);assert.equal(w.x,state.counterweight.x);assert.equal(w.y,state.counterweight.y);assert.equal(w.z,state.counterweight.z);assert.equal(w.collisionRadius,C.catch.counterweightRadius);assert.ok(frame.props.some(p=>p.counterweightWarning));assert.ok(frame.props.some(p=>p.threatShadow&&Math.abs(p.y-state.feet-.012)<1e-6));assert.ok(frame.props.some(p=>p.counterweightCable));
  const moved=sourceContinuationRenderFrame({...state,counterweight:{...state.counterweight,mode:'walking',x:-18.2,z:1.7,y:state.feet,level:1}}).props.find(p=>p.counterweight);assert.ok(Math.abs(moved.x+18.2)<1e-5);assert.ok(Math.abs(moved.z-1.7)<1e-6);
});

test('the architectural front is announced above clear headroom before its actual collision height arms',()=>{
  const state={...fresh(),x:6,z:-3,feet:3,closure:{mode:'warning',elapsed:1,frontZ:-4.5}},warning=sourceContinuationRenderFrame(state),closing=sourceContinuationRenderFrame({...state,closure:{...state.closure,mode:'closing'}});
  const suspended=warning.props.find(p=>p.closureSuspended);assert.ok(suspended);assert.ok(warning.props.some(p=>p.closureWarning));assert.ok(warning.props.some(p=>p.closureCable));assert.equal(warning.props.some(p=>p.physicalKind==='solid'&&p.role==='closure'),false);
  const model=sourceContinuationGeometry({...state,closure:{...state.closure,mode:'closing'}}).find(p=>p.role==='closure'),data=sourceContinuationMeshPayload(model);let minY=Infinity;for(let i=0;i<data.positions.length;i+=3)minY=Math.min(minY,transform(suspended.matrix,[...data.positions.slice(i,i+3)])[1]);assert.ok(minY>state.feet+1.7,'the visible warning front cannot imply a false wall through the body');
  assert.ok(closing.props.some(p=>p.physicalKind==='solid'&&p.role==='closure'));assert.equal(closing.props.some(p=>p.closureSuspended),false);
});

test('ordinary GLB landmarks and operator really exist in the retained base catalog',()=>{
  const {json}=baseAsset(),catalog=new Set(json.meshes.map(m=>m.name));
  for(const mesh of['instrument_case','grand_piano','ending_body_standing'])assert.ok(catalog.has(mesh),mesh);
});

test('retained piano and case vertices fit their real collision footprints without rendering proxy boxes',()=>{
  const asset=baseAsset(),frame=sourceContinuationRenderFrame(fresh());let sampled=0,expected=0;
  for(const[id,solidId]of[['wrong-piano','wrong-piano-footprint'],['wrong-case-hinge','wrong-case-footprint']]){
    const instance=frame.props.find(p=>p.id===`source-continuation-prop-${id}`),solid=continuationSolids(fresh()).find(s=>s.id===solidId);assert.ok(instance&&solid);assert.equal(frame.props.some(p=>p.descriptorId===solidId),false);
    for(const primitive of asset.json.meshes.find(m=>m.name===instance.mesh).primitives){const a=asset.json.accessors[primitive.attributes.POSITION],v=asset.json.bufferViews[a.bufferView];expected+=a.count;for(let i=0;i<a.count;i++){
      const point=[0,1,2].map(k=>asset.buffer.readFloatLE(asset.binOffset+(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||12)+k*4)),world=transform(instance.matrix,point);
      for(const[k,lo,hi]of[[0,solid.minX,solid.maxX],[1,solid.minY,solid.maxY],[2,solid.minZ,solid.maxZ]])assert.ok(world[k]>=lo-.001&&world[k]<=hi+.001,`${id}/${k} outside actual collider`);sampled++;
    }}
  }
  assert.equal(sampled,expected);assert.ok(expected>100,'the proof samples every actual piano and case vertex');
});

test('adapter waits for the base pack, uses the shared 3D/dither path and releases once',async()=>{
  let release;const h=fixture({baseGate:new Promise(r=>release=r)}),loading=h.owner.initialize();await Promise.resolve();assert.equal(h.calls.some(c=>c.name==='install'),false);release(true);await loading;assert.equal(h.owner.ready(),true);
  h.owner.render(catchState(2));const scene=h.calls.find(c=>c.name==='r3dSetSourceScene').args[0],call=h.calls.findLast(c=>c.name==='r3dFrame').args[0];assert.equal(scene.look.roomMemoryActive,true);assert.equal(call.textSpace,true);assert.equal(call.sourceVoidPhysical,false);assert.equal(call.authoredCamera.pitch,-Math.PI/2);assert.equal(h.owner.diagnostics().frame.strictOverhead,true);
  assert.ok(h.owner.diagnostics().triangles<3000);assert.equal(h.owner.dispose(),true);assert.equal(h.owner.dispose(),false);assert.equal(h.releases(),1);assert.equal(h.owner.render(fresh()),false);assert.equal(h.calls.at(-1).name,'release');
  const source=readFileSync(new URL('../src/render/source-continuation-renderer.js',import.meta.url),'utf8');assert.doesNotMatch(source,/getContext\(|requestAnimationFrame\(|new\s+(?:WebGLRenderer|Worker)/);
});

test('late catalog loss repairs residency without reacquiring the plan or resetting a falling body',async()=>{
  const h=fixture();await h.owner.initialize();const plans=h.calls.filter(c=>c.name==='r3dSetPlan').length;for(const key of h.catalog.keys())if(key.startsWith('source-continuation-')||key.startsWith('door_'))h.catalog.delete(key);
  const state=catchState(2,{fall:{x:-26,z:2,feet:-4.5,vx:.8,vz:0,vy:-2,fromLevel:2,elapsed:.3,unsupported:true},feet:-4.5});assert.equal(h.owner.ready(),false);assert.equal(h.owner.render(state),true);assert.equal(h.owner.render(state),true);await new Promise(r=>setImmediate(r));assert.equal(h.owner.ready(),true);h.owner.render(state);
  assert.equal(h.calls.filter(c=>c.name==='r3dSetPlan').length,plans);assert.equal(h.owner.diagnostics().frame.eye[1],state.feet+14);assert.equal(h.calls.filter(c=>c.name==='install').length,2);h.owner.dispose();
});

test('failed residency or initial packs expose recoverable errors, and late initialization cannot reacquire a released scene',async()=>{
  for(const options of[{missingBase:['ending_body_standing']},{omitCustom:true},{failDoors:true}]){const h=fixture(options);await assert.rejects(h.owner.initialize());assert.equal(h.owner.ready(),false);assert.ok(h.owner.diagnostics().error);assert.equal(h.calls.some(c=>c.name==='r3dSetPlan'),false);h.owner.dispose();}
  let release;const h=fixture({doorGate:new Promise(r=>release=r)}),loading=h.owner.initialize();await Promise.resolve();await Promise.resolve();h.owner.dispose();const count=h.calls.length;release();assert.equal(await loading,false);assert.equal(h.owner.ready(),false);assert.equal(h.calls.length,count);assert.equal(h.calls.some(c=>c.name==='r3dSetPlan'),false);
});
