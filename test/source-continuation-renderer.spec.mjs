import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SOURCE_CONTINUATION as C,continuationSurfaces,continuationSolids,continuationSurfaceY,continuationCatchFloor,continuationSupportAt,continuationDoors,continuationProps} from '../src/data/source-continuation.js';
import {freshSourceContinuation,sourceContinuationFrame,stepSourceContinuation} from '../src/game/source-continuation.js';
import {sourceContinuationGeometry,sourceContinuationEdges,sourceContinuationEdgeGeometry,sourceContinuationMeshPayload,installSourceContinuationMeshes,prewarmSourceContinuationAssets,sourceContinuationCamera,sourceContinuationRenderFrame,createSourceContinuationRenderer} from '../src/render/source-continuation-renderer.js';
import {doorAssembly} from '../src/data/source-door-fields.js';
import {PROP_BOUNDS} from '../src/data/generated/prop-geometry.js';
import {SOURCE_PRINT_SURFACE} from '../src/render/physical-source-print.js';
import {cameraBasis} from '../src/render/camera-basis.js';
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
  let current=null,currentVao=null,serial=0;const buffers=[],vaos=[];
  const gl={ARRAY_BUFFER:34962,ELEMENT_ARRAY_BUFFER:34963,STATIC_DRAW:35044,FLOAT:5126,UNSIGNED_INT:5125,TEXTURE_2D:3553,ACTIVE_TEXTURE:34016,TEXTURE_BINDING_2D:32873,UNPACK_FLIP_Y_WEBGL:37440,UNPACK_PREMULTIPLY_ALPHA_WEBGL:37441,SRGB8_ALPHA8:35907,RGBA8:32856,RGBA:6408,UNSIGNED_BYTE:5121,LINEAR_MIPMAP_LINEAR:9987,LINEAR:9729,REPEAT:10497,CLAMP_TO_EDGE:33071,
    createBuffer(){const b={id:++serial};buffers.push(b);return b;},createVertexArray(){const vao={id:++serial};vaos.push(vao);return vao;},createTexture:()=>({texture:++serial}),
    bindBuffer(_target,b){current=b;},bufferData(_target,data){if(current)current.data=data.slice();},bindVertexArray(vao){currentVao=vao;},enableVertexAttribArray(){},disableVertexAttribArray(){},vertexAttribPointer(location){if(currentVao){currentVao.attributes??={};currentVao.attributes[location]=current;}},vertexAttribDivisor(){},vertexAttrib1f(){},bindTexture(){},pixelStorei(){},texImage2D(){},generateMipmap(){},texParameteri(){},activeTexture(){},getParameter:()=>0};
  return{gl,buffers,vaos};
}
function fixture({baseGate=null,doorGate=null,missingBase=[],omitCustom=false,failDoors=false}={}){
  const calls=[],catalog=new Map(['instrument_case','grand_piano','ending_body_standing'].filter(m=>!missingBase.includes(m)).map(m=>[m,{}])),g=fakeGl();let releases=0;
  const renderer=Object.fromEntries(Object.keys(R3).filter(k=>typeof R3[k]==='function').map(k=>[k,(...args)=>{calls.push({name:k,args});return k==='r3dFrame'?true:undefined;}]));
  renderer.r3dBasePropsReady=async()=>{calls.push({name:'base',args:[]});return baseGate?await baseGate:true;};renderer.r3dViewCamera=()=>({width:1280,height:720});
  const maps={texture:{source:true},normalTexture:{normal:true},ormTexture:{orm:true},letteringFinish:{version:1}};
  const props={propMeshCatalog:()=>[...catalog.keys()],setPressureInstances:next=>calls.push({name:'pressure',args:[next]}),installAuthoredPropMeshes(installer){calls.push({name:'install',args:[]});return installer(g.gl,{catalog});},async addPropPack(url){calls.push({name:'pack',args:[url]});if(doorGate)await doorGate;if(failDoors)throw Error('door pack failed');const door=doorAssembly('bay-goods-pair',{activeLeaves:'all'});for(const name of[door.frameMesh,door.leafMesh,door.freeStandingHeadMesh].filter(Boolean))catalog.set(name,{});}};
  const options={renderer,props,resolveAsset:url=>'fixture:'+url,installMeshes:(gl,pack)=>{const names=installSourceContinuationMeshes(gl,pack,{maps});if(omitCustom)pack.catalog.delete(names[0]);return names;},onRelease:()=>{releases++;calls.push({name:'release',args:[]});}};
  const owner=createSourceContinuationRenderer(options);
  return{owner,options,calls,catalog,g,releases:()=>releases};
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
  const names=installSourceContinuationMeshes(g.gl,pack,{maps}),buffers=g.buffers.length;assert.ok(names.length>60&&names.length<140);
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

test('reachable doors answer through attached worn handles and lights on the approach side',()=>{
  const state={...fresh(),x:-2.2,feet:3,z:-1,yaw:-Math.PI/2},frame=sourceContinuationRenderFrame(state),away=sourceContinuationRenderFrame({...state,yaw:Math.PI/2}),door=continuationDoors(state).find(d=>d.id==='wrong-onward');
  const handle=frame.props.find(p=>p.doorHandle&&p.doorId===door.id),rest=away.props.find(p=>p.id===handle.id),light=frame.lights.find(p=>p.id.endsWith(door.id));
  assert.ok(handle.focused&&handle.reach>0);assert.notDeepEqual([...handle.matrix],[...rest.matrix]);assert.equal(rest.focused,false);assert.ok(frame.props.some(p=>p.doorWear&&p.doorId===door.id));
  assert.ok((light.x-door.x)*(state.x-door.x)+(light.z-door.z)*(state.z-door.z)>.5,'the key light reaches the visible face instead of grazing the door plane');assert.ok(light.focusPractical);
  const opened=sourceContinuationRenderFrame({...state,doorOpen:{[door.id]:true}});assert.notDeepEqual([...opened.props.find(p=>p.id===handle.id).matrix],[...handle.matrix],'hardware stays with its moving leaf');
  const closing=sourceContinuationRenderFrame({...state,x:6,closure:{mode:'closing',elapsed:6,frontZ:-2}});assert.ok(closing.props.some(p=>p.closureBearing));assert.ok(closing.lights.filter(p=>p.closurePractical).every(p=>p.z>-2));
});

test('the finite reveal starts in the real first-person pose and clears the deck before reaching exact overhead',()=>{
  const from={x:-13.21,z:-1,feet:3,yaw:-Math.PI/2,pitch:-.08},frame={phase:'catch',player:{x:from.x,z:from.z,y:from.feet,yaw:from.yaw,pitch:from.pitch},camera:{eye:[-23,17,0]},reveal:{elapsed:0,duration:1.2,from}},first=sourceContinuationCamera(frame),last=sourceContinuationCamera({...frame,reveal:{...frame.reveal,elapsed:1.2}});
  assert.deepEqual(first.eye,[from.x,4.62,from.z]);assert.equal(first.yaw,from.yaw);assert.equal(first.pitch,from.pitch);assert.equal(first.strictOverhead,false);assert.deepEqual(last.eye,[-23,17,0]);assert.equal(last.yaw,0);assert.equal(last.pitch,-Math.PI/2);assert.equal(last.strictOverhead,true);
  let priorY=first.eye[1];for(let k=0;k<=120;k++){const input={...frame,reveal:{...frame.reveal,elapsed:k/100}},camera=sourceContinuationCamera(input);assert.deepEqual(sourceContinuationCamera(input),camera,'presentation has no private wall clock');assert.ok(camera.eye[1]>=priorY-1e-8);priorY=camera.eye[1];
    assert.ok(!continuationSolids(catchState()).some(s=>camera.eye[0]>s.minX&&camera.eye[0]<s.maxX&&camera.eye[1]>s.minY&&camera.eye[1]<s.maxY&&camera.eye[2]>s.minZ&&camera.eye[2]<s.maxZ),'the crane never passes through an upper rail');assert.ok(camera.eye[1]>3+1.5);
    if(k<=18)assert.equal(camera.eye[0],from.x,'rise above the bridge before moving across its edge');}
});

test('the crane keeps actual body vertices on screen through its formerly blank midpoint for forward, adverse and rotated entry views',()=>{
  const asset=baseAsset(),mesh=asset.json.meshes.find(m=>m.name==='ending_body_standing'),points=mesh.primitives.flatMap(p=>{const a=asset.json.accessors[p.attributes.POSITION],v=asset.json.bufferViews[a.bufferView];return Array.from({length:a.count},(_,i)=>[0,1,2].map(k=>asset.buffer.readFloatLE(asset.binOffset+(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||12)+k*4)));});let samples=0;
  for(const studyRotation of[0,Math.PI])for(const aspect of[.65,1,16/9,2.4])for(const yaw of[-Math.PI/2,Math.PI/2,Math.PI-.01])for(const pitch of[-1.1,-.08,.62])for(const elapsed of[.15,.3,.5,.7,.9]){
    const from={x:-13.21,z:-1,feet:3,yaw,pitch},state=catchState(0,{x:from.x,z:from.z,yaw,pitch,reveal:{from,duration:1.2,elapsed}}),frame=sourceContinuationRenderFrame(state,{viewportAspect:aspect,studyRotation}),body=frame.props.find(p=>p.playerBody),basis=cameraBasis(frame.yaw,frame.pitch);assert.ok(body&&frame.cameraAimTarget);
    for(const point of points){const world=transform(body.matrix,point),delta=world.map((v,k)=>v-frame.eye[k]),dot=v=>v.reduce((n,x,k)=>n+x*delta[k],0),depth=dot(basis.forward),nx=dot(basis.right)/(depth*.95*aspect),ny=dot(basis.up)/(depth*.95);assert.ok(depth>.1,`${elapsed}/${yaw}/${pitch}: body behind crane`);assert.ok(Math.abs(nx)<.93&&Math.abs(ny)<.93,`${elapsed}/${yaw}/${pitch}/${aspect}: body left frame (${nx},${ny})`);samples++;}
  }
  assert.equal(samples,points.length*2*4*3*3*5);
});

test('door leaves and their hardware follow the saved finite swing and reverse without snapping',()=>{
  const initial={...fresh(),x:-2.2,z:-1,feet:3,yaw:-Math.PI/2},id='wrong-onward',closed=sourceContinuationRenderFrame(initial),started=stepSourceContinuation(initial,{interact:true}).state,start=sourceContinuationRenderFrame(started),leafId=`source-continuation-door-${id}-leaf-0`,leaf=frame=>frame.props.find(p=>p.id===leafId);
  assert.equal(start.source.geometry.doors.find(p=>p.id===id).openFraction,0);assert.deepEqual([...leaf(start).matrix],[...leaf(closed).matrix],'intent alone cannot instantly move the leaf');
  const middle=stepSourceContinuation(started,{dt:.225}).state,mid=sourceContinuationRenderFrame(middle),full=sourceContinuationRenderFrame({...initial,doorOpen:{[id]:true}}),hinge=transform(leaf(closed).matrix,[0,0,0]),free=[1.48,0,0],door=mid.source.geometry.doors.find(p=>p.id===id),sx=door.width/doorAssembly('bay-goods-pair').opening.width,vector=frame=>{const v=transform(leaf(frame).matrix,free).map((n,k)=>n-hinge[k]);return[(Math.cos(door.yaw)*v[0]+Math.sin(door.yaw)*v[2])/sx,v[1],-Math.sin(door.yaw)*v[0]+Math.cos(door.yaw)*v[2]];},a=vector(closed),b=vector(mid),c=vector(full),angleBetween=(u,v)=>Math.acos(Math.max(-1,Math.min(1,u.reduce((n,x,k)=>n+x*v[k],0)/(Math.hypot(...u)*Math.hypot(...v)))));
  assert.ok(Math.abs(angleBetween(a,b)-angleBetween(a,c)/2)<1e-5,'the actual free edge is halfway through its hinge swing, accounting for the door-frame scale');assert.ok(mid.props.some(p=>p.doorHandle&&p.doorId===id));
  const frozen=stepSourceContinuation(middle,{dt:.25,paused:true}).state;assert.deepEqual([...leaf(sourceContinuationRenderFrame(frozen)).matrix],[...leaf(mid).matrix]);
  const reversed=stepSourceContinuation(middle,{interact:true}).state;assert.deepEqual([...leaf(sourceContinuationRenderFrame(reversed)).matrix],[...leaf(mid).matrix],'reversing starts from the present fraction');const finished=stepSourceContinuation(reversed,{dt:.225}).state;assert.ok([...leaf(sourceContinuationRenderFrame(finished)).matrix].every((n,k)=>Math.abs(n-leaf(closed).matrix[k])<1e-6));
});

test('the saved production crossing drives the reveal without a renderer clock or a second body transform',()=>{
  let state=stepSourceContinuation({...fresh(),x:-13.19,z:-1,feet:3,yaw:-Math.PI/2,doorOpen:{'wrong-onward':true}},{dt:.1,forward:1}).state;assert.ok(state.reveal);const first=sourceContinuationRenderFrame(state);assert.equal(first.strictOverhead,false);assert.equal(first.counts.body,0);assert.equal(first.eye[0],state.reveal.from.x);
  const frozen=stepSourceContinuation(state,{dt:.25,paused:true}).state;assert.deepEqual(sourceContinuationRenderFrame(frozen),first);
  for(let i=0;i<200&&state.reveal;i++){const snapshot=JSON.stringify(state),frame=sourceContinuationRenderFrame(state);assert.equal(JSON.stringify(state),snapshot);assert.ok(frame.eye.every(Number.isFinite));state=stepSourceContinuation(state,{dt:.01}).state;}
  assert.equal(state.reveal,null);const final=sourceContinuationRenderFrame(state);assert.equal(final.strictOverhead,true);assert.equal(final.pitch,-Math.PI/2);assert.equal(final.yaw,0);assert.equal(final.counts.body,1);
});

test('saved sling recovery renders the authoritative carried body and a continuous hoist meets its real rail',()=>{
  let state=stepSourceContinuation(catchState(0,{x:-23,z:-3.45}),{interact:true}).state;
  for(let i=0;i<600&&!state.recovery;i++)state=stepSourceContinuation(state,{dt:.02}).state;
  assert.equal(state.recovery?.kind,'sling');const target={...state.recovery.target};let samples=0;
  for(let i=0;i<500&&state.recovery;i++){const frame=sourceContinuationRenderFrame(state),body=frame.props.find(p=>p.playerBody);assert.ok(frame.props.some(p=>p.recoverySling));assert.equal(frame.props.filter(p=>p.recoveryCable).length,2);assert.ok(Math.abs(body.x-state.x)<1e-5&&Math.abs(body.y-state.feet)<1e-5&&Math.abs(body.z-state.z)<1e-5,'rendering does not interpolate the carried pose twice');assert.equal(frame.pitch,-Math.PI/2);samples++;state=stepSourceContinuation(state,{dt:.025}).state;}
  assert.equal(state.recovery,null);assert.ok(samples>10);assert.ok(Math.abs(state.x-target.x)<1e-7&&Math.abs(state.z-target.z)<1e-7);assert.equal(sourceContinuationRenderFrame(state).props.some(p=>p.recoverySling),false);
  const g=fakeGl(),pack={catalog:new Map()};installSourceContinuationMeshes(g.gl,pack,{maps:{texture:{},normalTexture:{},ormTexture:{},letteringFinish:{}}});
  for(const mode of['hoisting','traversing','lowering-warning','lowering']){const h=C.catch.hoist,w={...fresh().counterweight,active:true,mode,x:mode==='hoisting'?h.shaft.x:h.start.x,z:mode==='hoisting'?h.shaft.z:mode==='traversing'?h.shaft.z:h.start.z,y:mode==='hoisting'?1:h.travelY,level:6,elapsed:.5},frame=sourceContinuationRenderFrame(catchState(0,{x:-30.5,z:7.5,counterweight:w})),weight=frame.props.find(p=>p.counterweight),cable=frame.props.find(p=>p.counterweightCable),trolley=frame.props.find(p=>p.hoistTrolley);
    assert.ok(weight&&cable&&trolley);assert.equal(frame.props.filter(p=>p.hoistRail).length,2);assert.equal(frame.props.some(p=>p.counterweightPractical),false,'a following lamp cannot cut through floors during the hoist');assert.ok(Math.abs(weight.x-w.x)<1e-5&&Math.abs(weight.y-w.y)<1e-5&&Math.abs(weight.z-w.z)<1e-5);
    for(const p of[cable,trolley]){const positions=pack.catalog.get(p.mesh).primitives[0].vao.attributes[0].data;let maxY=-Infinity;for(let k=0;k<positions.length;k+=3)maxY=Math.max(maxY,transform(p.matrix,positions.slice(k,k+3))[1]);assert.ok(Math.abs(maxY-h.railY)<1e-5,'cable and trolley terminate at the same physical rail');}
    if(mode==='lowering-warning'){const marker=frame.props.find(p=>p.loweringWarning);assert.ok(marker);assert.ok(Math.abs(marker.y-C.catch.top-.008)<1e-5,'the lowering warning is on the receiving floor, not floating beside the drum');}
  }
});

test('the transfer study rigidly rotates the full Catch while keeping north-up and the old room unchanged',()=>{
  const state=catchState(0,{x:-19.55,z:0}),before=JSON.stringify(state),base=sourceContinuationRenderFrame(state),rotated=sourceContinuationRenderFrame(state,{studyRotation:Math.PI});
  assert.equal(rotated.authoredCamera.yaw,0);assert.equal(rotated.authoredCamera.pitch,-Math.PI/2);assert.equal(rotated.strictOverhead,true);assert.equal(JSON.stringify(state),before);
  for(const p of base.props){const r=rotated.props.find(q=>q.id===p.id);assert.ok(r);if(p.studyFixed){assert.deepEqual([...r.matrix],[...p.matrix]);continue;}
    for(const point of[[0,0,0],[.3,.8,-.2]]){const a=transform(p.matrix,point),b=transform(r.matrix,point);assert.ok(Math.abs(b[0]-(-46-a[0]))<1e-5);assert.ok(Math.abs(b[1]-a[1])<1e-5);assert.ok(Math.abs(b[2]+a[2])<1e-5);}}
  for(const light of base.lights){const r=rotated.lights.find(p=>p.id===light.id);assert.ok(r);assert.ok(Math.abs(r.x-(-46-light.x))<1e-5);assert.ok(Math.abs(r.z+light.z)<1e-5);}
  for(const role of['releaseTread','playerBody','counterweight'])assert.ok(rotated.props.some(p=>p[role]));assert.ok(rotated.props.some(p=>p.doorId==='catch-return-0'));assert.ok(rotated.props.some(p=>p.physicalKind==='surface'));
  const wrong=sourceContinuationRenderFrame(fresh());assert.deepEqual(sourceContinuationRenderFrame(fresh(),{studyRotation:Math.PI}),wrong);
});

test('prewarming coalesces bounded asset preparation and cannot alter the active presentation',async()=>{
  let release;const h=fixture({baseGate:new Promise(r=>release=r)}),a=prewarmSourceContinuationAssets(h.options),b=prewarmSourceContinuationAssets(h.options);assert.equal(a,b);assert.equal(h.owner.ready(),false);release(true);assert.equal(await a,true);
  assert.ok(h.calls.every(c=>['base','install','pack'].includes(c.name)),'no plan, props, light, pressure, camera, frame or scene mutations while Source still owns the view');assert.equal(h.calls.filter(c=>c.name==='pack').length,1);
  const buffers=h.g.buffers.length;await prewarmSourceContinuationAssets(h.options);assert.equal(h.g.buffers.length,buffers);assert.equal(h.calls.filter(c=>c.name==='pack').length,1);assert.equal(h.owner.ready(),false);
  await h.owner.initialize();assert.equal(h.owner.ready(),true);assert.equal(h.g.buffers.length,buffers);h.owner.dispose();
});

test('strict north-up Catch shows a body and actual lower shelves, with upper decks cut away at every depth',()=>{
  for(let level=0;level<=6;level++){
    const frame=sourceContinuationRenderFrame(catchState(level));assert.equal(frame.pitch,-Math.PI/2);assert.equal(frame.yaw,0);assert.equal(frame.strictOverhead,true);assert.equal(frame.counts.body,1);assert.equal(frame.props.filter(p=>p.playerBody).length,1);
    assert.ok(frame.props.filter(p=>p.physicalKind==='surface').every(p=>p.level>=level));for(let next=level;next<=Math.min(6,level+2);next++)assert.ok(frame.shownLevels.includes(next));
    assert.ok(frame.props.some(p=>p.doorId===`catch-return-${level}`));assert.ok(frame.props.some(p=>p.shaftDepth));assert.ok(frame.lights.length<=8);assert.ok(frame.props.every(p=>[...p.matrix].every(Number.isFinite)));assert.ok(frame.counts.props<240,'the top view also retains the previous room and finite door hardware');
  }
});

test('steel rims trace the exposed support union, stay inset and keep their real undersides during cutaway',()=>{
  const state=catchState(),edges=sourceContinuationEdges(state),pieces=sourceContinuationEdgeGeometry(state);let topSamples=0;
  for(const edge of edges){const along=(edge.start+edge.end)/2,x=edge.axis==='x'?along:edge.at,z=edge.axis==='z'?along:edge.at;
    const supported=continuationSupportAt(x-edge.normal[0]*.06,z-edge.normal[1]*.06,state,{maxY:edge.y+.01,minY:edge.y-.01});
    assert.ok(supported,'every rim is on real floor');assert.equal(continuationSupportAt(x+edge.normal[0]*.04,z+edge.normal[1]*.04,state,{maxY:edge.y+.01,minY:edge.y-.01}),null,'shared rectangle joins do not become false rims');
  }
  for(const piece of pieces.filter(p=>p.material==='edge-steel')){const payload=sourceContinuationMeshPayload(piece);
    assert.ok(Math.abs(payload.bounds.min[1]-piece.elevation+.265)<1e-5);assert.ok(Math.abs(payload.bounds.max[1]-piece.elevation-.008)<1e-5);
    for(let k=0;k<payload.positions.length;k+=9)if(payload.normals[k+1]>.9){const center=[0,1,2].map(a=>(payload.positions[k+a]+payload.positions[k+3+a]+payload.positions[k+6+a])/3+payload.bounds.center[a]);
      assert.ok(continuationSupportAt(center[0],center[2],state,{maxY:piece.elevation+.01,minY:piece.elevation-.01}),piece.id);topSamples++;}
  }
  for(const feet of[3,2.1,1.2,.4,-.6,-2.4,-4.2,-15]){const frame=sourceContinuationRenderFrame({...state,feet,fall:{x:state.x,z:state.z,feet,vx:0,vz:0,vy:-1,fromLevel:0,elapsed:.2,unsupported:true}});assert.equal(frame.floorH,feet);
    assert.ok(frame.props.filter(p=>p.catchRim).every(p=>p.elevation<=feet+.48),'upper fascia is cut away with its upper support');
    for(const p of frame.props.filter(p=>p.catchRim)){assert.equal(p.mesh.endsWith('-next'),!p.currentFootprint);assert.ok(p.undersideDepth>.22);}
  }
  assert.ok(edges.length>70&&edges.length<150);assert.ok(topSamples>=edges.length*2);
});

test('release treads provide painted direction on actual floor and supported shadows on lower footprints',()=>{
  const state=catchState(),frame=sourceContinuationRenderFrame(state),g=fakeGl(),pack={catalog:new Map()};installSourceContinuationMeshes(g.gl,pack,{maps:{texture:{},normalTexture:{},ormTexture:{},letteringFinish:{}}});
  const luminance=base=>base[0]*.2126+base[1]*.7152+base[2]*.0722,tread=pack.catalog.get('source-continuation-lip-tread').primitives[0],paint=pack.catalog.get('source-continuation-lip-paint').primitives[0];
  assert.ok(luminance(paint.base)>luminance(tread.base)*8,'the painted cue has a dark physical backing');assert.equal(tread.printedSurface,null);assert.equal(paint.printedSurface,null);assert.deepEqual(paint.emissive,[0,0,0]);
  for(const lip of continuationProps(state).filter(p=>p.kind==='release-lip')){
    const plate=frame.props.find(p=>p.releaseTread&&p.lipId===lip.id),ink=frame.props.find(p=>p.releasePaint&&p.lipId===lip.id);assert.ok(plate&&ink);
    const direction=transform(plate.matrix,[0,0,-1]).map((v,k)=>v-plate.matrix[12+k]);assert.ok(direction[0]*lip.dx+direction[2]*lip.dz>.999,'the physical chevron points through its authored lip');
    const positions=pack.catalog.get(plate.mesh).primitives[0].vao.attributes[0].data;
    for(let k=0;k<positions.length;k+=3){const p=transform(plate.matrix,positions.slice(k,k+3));assert.ok(continuationSupportAt(p[0],p[2],state,{maxY:lip.y+.1,minY:lip.y-.1}),'the large tread does not manufacture a landing over void');}
  }
  for(const p of frame.props.filter(p=>p.landingShadow)){const positions=pack.catalog.get(p.mesh).primitives[0].vao.attributes[0].data;
    for(let k=0;k<positions.length;k+=3){const v=transform(p.matrix,positions.slice(k,k+3)),support=continuationSupportAt(v[0],v[2],state,{maxY:p.y+.01,minY:p.y-.02});assert.ok(support&&support.id===p.receiverId,'every shadow vertex has an actual lower receiver');}
  }
  assert.equal(frame.props.filter(p=>p.releaseTread).length,10);assert.equal(frame.props.filter(p=>p.landingShadow).length,10);
  for(const door of continuationDoors(state)){const threshold=frame.props.find(p=>p.threshold&&p.doorId===door.id);assert.ok(threshold);const positions=pack.catalog.get(threshold.mesh).primitives[0].vao.attributes[0].data;
    for(let k=0;k<positions.length;k+=3){const p=transform(threshold.matrix,positions.slice(k,k+3));assert.ok(continuationSupportAt(p[0],p[2],state,{maxY:door.y+.1,minY:door.y-.1}),`${door.id} threshold needs a real footing`);}
  }
});

test('drop focus turns the small body toward the edge with supported physical toes and a readable garment',()=>{
  const g=fakeGl(),pack={catalog:new Map()};installSourceContinuationMeshes(g.gl,pack,{maps:{texture:{},normalTexture:{},ormTexture:{},letteringFinish:{}}});
  for(const lip of continuationProps('catch').filter(p=>p.kind==='release-lip')){const state=catchState(lip.level,{x:lip.x,z:lip.z}),frame=sourceContinuationRenderFrame(state),body=frame.props.find(p=>p.playerBody),toes=frame.props.find(p=>p.playerToes),garment=frame.props.find(p=>p.playerGarment);
    assert.ok(body.lean<0&&toes.readyToDrop&&garment);assert.ok(Math.sin(body.bodyYaw)*lip.dx-Math.cos(body.bodyYaw)*lip.dz>.999);
    const primitive=pack.catalog.get(toes.mesh).primitives[0],positions=primitive.vao.attributes[0].data;for(let k=0;k<positions.length;k+=3){const p=transform(toes.matrix,positions.slice(k,k+3));assert.ok(continuationSupportAt(p[0],p[2],state,{maxY:state.feet+.1,minY:state.feet-.1}),'the visible toes stay on the real tread approach');assert.ok(p[1]>state.feet);}
    const cloth=pack.catalog.get(garment.mesh).primitives[0];assert.ok(cloth.base[0]>.5&&cloth.base[1]>.5);assert.deepEqual(cloth.emissive,[0,0,0]);
  }
});

test('actual retained operator vertices fit both wide and narrow strict overhead views, including entry bridge',()=>{
  const bounds=PROP_BOUNDS.ending_body_standing;assert.ok(bounds);const asset=baseAsset(),mesh=asset.json.meshes.find(m=>m.name==='ending_body_standing'),points=mesh.primitives.flatMap(p=>{const a=asset.json.accessors[p.attributes.POSITION],v=asset.json.bufferViews[a.bufferView];return Array.from({length:a.count},(_,i)=>[0,1,2].map(k=>asset.buffer.readFloatLE(asset.binOffset+(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||12)+k*4)));});let vertices=0;
  for(const aspect of[.65,.75,1,16/9,2.4])for(const[level,x,z]of[[0,-13.25,-1],[3,-30.5,7.5],[3,-28.9,-3.9],[3,-17.1,7.8],[5,-25.2,0]]){
    const frame=sourceContinuationRenderFrame(catchState(level,{x,z}),{viewportAspect:aspect}),body=frame.props.find(p=>p.playerBody);assert.equal(frame.source.player.x,x,'a camera fixture must be on real support, not silently normalized to refuge');assert.equal(frame.source.player.z,z);
    for(const a of bounds.min.map((_,i)=>i))assert.ok(Number.isFinite(bounds.max[a]));
    for(const point of points){const p=transform(body.matrix,point),depth=frame.eye[1]-p[1],nx=(p[0]-frame.eye[0])/(depth*.95*aspect),ny=(p[2]-frame.eye[2])/(depth*.95);assert.ok(depth>.1);assert.ok(Math.abs(nx)<.99&&Math.abs(ny)<.99,`${aspect}/${x}/${z}: body clipped`);vertices++;}
  }
  assert.equal(vertices,points.length*25);assert.ok(points.length>30,'sample every actual retained-body position, not a proxy marker');
});

test('counterweight body, warning and shadow use the real deterministic threat pose',()=>{
  const state=catchState(1,{counterweight:{...fresh().counterweight,active:true,mode:'warning',x:-20,z:0,y:3,level:0,elapsed:1}}),frame=sourceContinuationRenderFrame(state),w=frame.props.find(p=>p.counterweight);
  assert.ok(w);assert.equal(w.x,state.counterweight.x);assert.equal(w.y,state.counterweight.y);assert.equal(w.z,state.counterweight.z);assert.equal(w.collisionRadius,C.catch.counterweightRadius);assert.ok(frame.props.some(p=>p.counterweightWarning));assert.ok(frame.props.some(p=>p.threatShadow&&Math.abs(p.y-state.feet-.012)<1e-6));assert.ok(frame.props.some(p=>p.counterweightCable));
  const moved=sourceContinuationRenderFrame({...state,counterweight:{...state.counterweight,mode:'walking',x:-20.5,z:1.7,y:state.feet,level:1}}).props.find(p=>p.counterweight);assert.ok(Math.abs(moved.x+20.5)<1e-5);assert.ok(Math.abs(moved.z-1.7)<1e-6);
  const g=fakeGl(),pack={catalog:new Map()};installSourceContinuationMeshes(g.gl,pack,{maps:{texture:{},normalTexture:{},ormTexture:{},letteringFinish:{}}});
  for(const instance of[w,frame.props.find(p=>p.counterweightCable)]){const positions=pack.catalog.get(instance.mesh).primitives[0].vao.attributes[0].data,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let k=0;k<positions.length;k+=3){const p=transform(instance.matrix,positions.slice(k,k+3));for(let a=0;a<3;a++){min[a]=Math.min(min[a],p[a]);max[a]=Math.max(max[a],p[a]);}}
    assert.ok(Math.abs(min[1]-(instance.counterweight?state.counterweight.y:state.counterweight.y+1.4))<1e-5,'the uploaded cylinder/cable begins at its physical anchor');
    if(instance.counterweight){assert.ok(Math.abs(max[1]-state.counterweight.y-1.4)<1e-5);assert.ok(Math.abs(max[0]-min[0]-C.catch.counterweightRadius*2)<1e-5);}
  }
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
  assert.ok(h.owner.diagnostics().triangles<5000,'the bounded catalog includes both current and distant rim material variants');assert.equal(h.owner.dispose(),true);assert.equal(h.owner.dispose(),false);assert.equal(h.releases(),1);assert.equal(h.owner.render(fresh()),false);assert.equal(h.calls.at(-1).name,'release');
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
