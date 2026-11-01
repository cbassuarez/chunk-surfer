import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveNativeStillnessReceivers,attachedNativeStillnessReceiver,nativeSegmentObstruction} from '../src/render/stillness-native-receivers.js';
import {stillnessSurfaceEligible} from '../src/render/stillness-presentation.js';

const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const near=(a,b,epsilon=1e-7)=>assert.ok(Math.abs(a-b)<epsilon,`${a} should be ${b}`);
const dot=(a,b)=>a.reduce((sum,v,k)=>sum+v*b[k],0);
function wall({x0=-2,x1=2,y0=0,y1=3,z=0,uvShift=0}={}){
  return{positions:[x0,y0,z,x1,y0,z,x1,y1,z,x0,y1,z],normals:[0,0,1,0,0,1,0,0,1,0,0,1],
    uvs:[x0*.2+uvShift,y0*.3,x1*.2+uvShift,y0*.3,x1*.2+uvShift,y1*.3,x0*.2+uvShift,y1*.3],indices:[0,1,2,0,2,3]};
}
function join(...pieces){const result={positions:[],normals:[],uvs:[],indices:[]};for(const p of pieces){const offset=result.positions.length/3;
  result.positions.push(...p.positions);result.normals.push(...p.normals);result.uvs.push(...p.uvs);result.indices.push(...p.indices.map(i=>i+offset));}return result;}
function gridWall(xs,ys,missing){const pieces=[];for(let x=0;x<xs.length-1;x++)for(let y=0;y<ys.length-1;y++)if(!missing(x,y))pieces.push(wall({x0:xs[x],x1:xs[x+1],y0:ys[y],y1:ys[y+1]}));return join(...pieces);}
const primitive=(geometry,materialName='native retained plaster',extra={})=>({nativeReceiverGeometry:geometry,materialName,...extra});
function scene(primitives=[primitive(wall())],extra={}){const mesh={name:'source_pub_wall',nodeMatrix:identity(),primitives,...extra};
  return{catalog:new Map([[mesh.name,mesh]]),instances:[{id:'wall-A',mesh:mesh.name,x:0,y:0,z:0}],mesh};}
const camera={eye:[0,1.5,1.5]};
function resolve(s,options={}){return resolveNativeStillnessReceivers({...s,camera,...options});}
function corners(r){return[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,y])=>r.origin.map((v,k)=>v+r.right[k]*r.widthM*x/2+r.up[k]*r.heightM*y/2));}

test('native triangle receivers keep the exact donor material, UV phase and human aspect',()=>{
  const s=scene(),before=JSON.stringify(s.mesh),result=resolve(s);assert.equal(result.receivers.length,1);
  const r=result.receivers[0];assert.equal(r.nativeMesh,'source_pub_wall');assert.equal(r.nativePrimitiveIndex,0);assert.equal(r.donorPrimitiveIndex,0);assert.equal(r.donorMaterial,true);
  near(r.origin[2],0);near(r.distanceM,1.5);near(r.heightM/r.widthM,1.4);near(r.uvOrigin[0],r.origin[0]*.2);near(r.uvOrigin[1],r.origin[1]*.3);
  for(const p of corners(r)){
    const dx=dot(p.map((v,k)=>v-r.origin[k]),r.right),dy=dot(p.map((v,k)=>v-r.origin[k]),r.up);
    near(r.uvOrigin[0]+r.uvRight[0]*dx+r.uvUp[0]*dy,p[0]*.2);near(r.uvOrigin[1]+r.uvRight[1]*dx+r.uvUp[1]*dy,p[1]*.3);
  }
  assert.equal(JSON.stringify(s.mesh),before,'retained native geometry and material metadata are immutable');
});

test('the first actual opaque surface wins even when it is protected or deforms',()=>{
  const behind=primitive(wall({z:-1})),paper=primitive(wall(), 'physical print paper',{printedSurface:{version:1}});
  const s=scene([paper,behind],{name:'pub_interior'});s.catalog=new Map([[s.mesh.name,s.mesh]]);s.instances[0].mesh=s.mesh.name;
  const result=resolve(s);assert.equal(result.receivers.length,0);assert.ok(result.rejected.some(r=>r.reason==='protected-material'&&r.nativePrimitiveIndex===0));
  const pressure=scene([primitive(wall(),'source stock',{sourceSurroundingsPressure:true}),behind]);
  const q=resolve(pressure);assert.equal(q.receivers.length,0);assert.ok(q.rejected.some(r=>r.reason==='deforming-host'));
  const coplanar=scene([primitive(wall()),primitive(wall(),'portrait surface',{portrait:true})]);
  assert.equal(resolve(coplanar).receivers.length,0,'coplanar protected identity wins an ambiguous equal-depth hit');
});

test('a real window remains open: a ray through it can acquire the farther wall, never an invented front plane',()=>{
  const frame=gridWall([-2,-.5,.5,2],[0,.7,2.3,3],(x,y)=>x===1&&y===1);
  const s=scene([primitive(frame),primitive(wall({z:-2}))]);
  const result=resolve(s);assert.equal(result.receivers.length,1);assert.equal(result.receivers[0].nativePrimitiveIndex,1);
  near(result.receivers[0].origin[2],-2);near(result.receivers[0].distanceM,3.5);
});

test('an aperture smaller than the support grid still cannot be bridged by the face rectangle',()=>{
  const g=gridWall([-2,.37,.43,2],[0,1.77,1.83,3],(x,y)=>x===1&&y===1),r=resolve(scene([primitive(g)])).receivers[0];
  assert.ok(r,'there is still a smaller supported head beside the tiny aperture');
  const c=corners(r),minX=Math.min(...c.map(p=>p[0])),maxX=Math.max(...c.map(p=>p[0])),minY=Math.min(...c.map(p=>p[1])),maxY=Math.max(...c.map(p=>p[1]));
  assert.ok(maxX<=.37||minX>=.43||maxY<=1.77||minY>=1.83,'whole-footprint boundary proof catches holes between all sample points');
  near(r.heightM/r.widthM,1.4);
});

test('a material boundary, UV island, detached coplanar island and small host do not become a combined wall',()=>{
  const split=scene([primitive(wall({x0:-2,x1:0})),primitive(wall({x0:0,x1:2}),'different native stone')]);
  const r=resolve(split,{camera:{eye:[-.2,1.5,1.5]}}).receivers[0];assert.ok(r);assert.ok(r.host.max[0]<=0);
  const island=join(wall({x0:-2,x1:0}),wall({x0:0,x1:2,uvShift:4}));
  const uv=resolve(scene([primitive(island)]),{camera:{eye:[-.2,1.5,1.5]}}).receivers[0];assert.ok(uv);assert.ok(uv.host.max[0]<0);
  const detached=join(wall({x0:-2,x1:-.2}),wall({x0:.2,x1:2}));
  const q=resolve(scene([primitive(detached)]),{camera:{eye:[-.3,1.5,1.5]}}).receivers[0];assert.ok(q);assert.ok(q.host.max[0]<-.2);
  const small=resolve(scene([primitive(wall({x0:-.15,x1:.15}))]));assert.equal(small.receivers.length,0);assert.ok(small.rejected.some(q=>q.reason==='no-continuous-human-patch'));
});

test('world orientation and UVs follow instance * node transforms, including initially nonuniform native scale',()=>{
  const s=scene();s.mesh.nodeMatrix=[2,0,0,0,0,1.5,0,0,0,0,1,0,.2,0,.4,1];
  s.instances[0]={...s.instances[0],x:2,z:3,yaw:Math.PI/2};
  const result=resolve(s,{camera:{eye:[.2,1.5,3.2]}});assert.equal(result.receivers.length,1);const r=result.receivers[0];
  near(r.origin[0],1.6);near(r.normal[0],-1);near(r.normal[2],0);near(r.uvOrigin[1],r.origin[1]/1.5*.3);
  // Native local x maps to world z, and node translation remains inside root.
  near(r.uvOrigin[0],((r.origin[2]-3)-.2)/2*.2);
  const same=attachedNativeStillnessReceiver(r,{instance:s.instances[0],mesh:s.mesh});assert.ok(same);
  r.origin.forEach((v,k)=>near(same.origin[k],v));near(same.widthM,r.widthM);near(same.heightM,r.heightM);
  const moved={...s.instances[0],x:5,z:7};const pose=attachedNativeStillnessReceiver(r,{instance:moved,mesh:s.mesh});assert.ok(pose);
  near(pose.origin[0],r.origin[0]+3);near(pose.origin[2],r.origin[2]+4);assert.deepEqual(pose.uvOrigin,r.uvOrigin);
  assert.equal(attachedNativeStillnessReceiver(r,{instance:{...moved,id:'replacement'},mesh:s.mesh}),null);
  assert.equal(attachedNativeStillnessReceiver(r,{instance:{...moved,scale:2},mesh:s.mesh}),null,'new scale is not a rigid pose update');
});

test('smooth curved surfaces are rejected even though each raster triangle itself is planar',()=>{
  const g=wall();g.normals=[-.25,0,.968,.25,0,.968,.25,0,.968,-.25,0,.968];
  const result=resolve(scene([primitive(g)]));assert.equal(result.receivers.length,0);assert.ok(result.rejected.some(r=>r.reason==='curved-or-discontinuous-host'));
});

test('two cardinal hits on one diagonal connected wall keep one head at the nearer acquisition',()=>{
  const s=scene([primitive(wall({x0:-6,x1:6}))]);s.instances[0]={...s.instances[0],x:2,z:-2,yaw:Math.PI/6};
  const result=resolve(s,{maxDistance:10,camera:{eye:[0,1.5,0]}});assert.equal(result.receivers.length,1);
  assert.ok(result.receivers[0].distanceM<4,'the later nearer hit replaces the first farther hit on the same plane');
});

test('real portal clipping applies to both acquisition and the entire attached patch',()=>{
  const s=scene();s.instances[0].portalClipPlanes=[[1,0,0,.1],[0,1,0,0],[0,-1,0,3],[0,0,0,0],[0,0,0,0]];
  const r=resolve(s).receivers[0];assert.ok(r);assert.ok(r.host.min[0]>=-.1-1e-5);
  const hidden=scene();hidden.instances[0].portalClipPlanes=[[0,0,0,-1]];assert.equal(resolve(hidden).receivers.length,0);
  const excluded=scene();excluded.instances[0].portalExcludePlanes=[[1,0,0,-.37],[-1,0,0,.43],[0,1,0,-1.77],[0,-1,0,1.83],[0,0,1,.01]];
  const q=resolve(excluded).receivers[0];assert.ok(q);const c=corners(q);
  assert.ok(Math.max(...c.map(p=>p[0]))<=.37||Math.max(...c.map(p=>p[1]))<=1.77||Math.min(...c.map(p=>p[0]))>=.43||Math.min(...c.map(p=>p[1]))>=1.83);
});

test('shared POSITION accessors use actual primitive indices for broad bounds and nearest material',()=>{
  const one=wall(),far=wall({x0:20,x1:24}),g=join(one,far),indices=g.indices.slice(6);
  const glass={...primitive({...g,indices},'glass'),nativeReceiverBounds:{min:[-2,0,0],max:[24,3,0]}};
  const s=scene([glass,primitive({...g,indices:g.indices.slice(0,6)})]);
  const result=resolve(s);assert.equal(result.receivers.length,1);assert.equal(result.receivers[0].nativePrimitiveIndex,1);
});

test('incomplete protected data fails conservatively, invalid inputs remain finite, and look does not relatch an attachment',()=>{
  const s=scene([{materialName:'glass',nativeReceiverBounds:{min:[-2,0,.5],max:[2,3,.6]}},primitive(wall())]);
  assert.equal(resolve(s).receivers.length,0);assert.ok(resolve(s).rejected.some(r=>r.reason==='conservative-protected-bounds'));
  for(const eye of[[NaN,0,0],[0,Infinity,0]])assert.equal(resolve(scene(),{camera:{eye}}).receivers.length,0);
  const wallScene=scene(),a=resolve(wallScene,{maxDistance:NaN,width:Infinity,height:Infinity}).receivers[0];assert.ok(a);
  const b=resolve(wallScene,{camera:{...camera,yaw:Math.PI,pitch:1.1}}).receivers[0];assert.deepEqual(a.origin,b.origin);
  for(const r of[a,b])assert.ok([...r.origin,...r.normal,...r.uvOrigin,...r.uvRight,...r.uvUp].every(Number.isFinite));
});

test('segment visibility finds the translated native wall before its target without mutating geometry',()=>{
  const s=scene();s.mesh.nodeMatrix[12]=.25;s.mesh.nodeMatrix[14]=.5;
  s.instances[0]={...s.instances[0],x:4,z:6};
  const before=JSON.stringify(s),result=nativeSegmentObstruction({...s,eye:[4.25,1.5,8.5],target:{x:4.25,y:1.5,z:5.5}});
  assert.equal(result.blocked,true);assert.equal(result.hit.id,'wall-A');assert.equal(result.hit.mesh,s.mesh.name);
  near(result.hit.distance,2);assert.equal(result.hit.conservative,false);assert.equal(JSON.stringify(s),before);
});

test('segment visibility passes through actual native apertures and respects rendered clipping',()=>{
  const frame=gridWall([-2,-.5,.5,2],[0,.7,2.3,3],(x,y)=>x===1&&y===1),s=scene([primitive(frame)]);
  assert.deepEqual(nativeSegmentObstruction({...s,eye:[0,1.5,1],target:[0,1.5,-1]}),{blocked:false,hit:null},'a real window opening remains open');
  assert.equal(nativeSegmentObstruction({...s,eye:[1,1.5,1],target:[1,1.5,-1]}).blocked,true,'the frame beside the same aperture remains solid');
  const clipped=scene();clipped.instances[0].portalClipPlanes=[[1,0,0,-.5]];
  assert.equal(nativeSegmentObstruction({...clipped,eye:[0,1.5,1],target:[0,1.5,-1]}).blocked,false,'triangles excluded from the actual render do not become hidden occluders');
});

test('a UV-less room retains its real opening even when its primitive bounds contain the camera',()=>{
  for(const missingUV of[null,undefined]){
    const front=gridWall([-2,-.5,.5,2],[0,.7,2.3,3],(x,y)=>x===1&&y===1);
    const geometry={...join(front,wall({z:2})),uvs:missingUV},s=scene([primitive(geometry)]),before=JSON.stringify(s.mesh);
    const eye=[0,1.5,1],target=[0,1.5,-1];
    assert.ok(eye[2]>0&&eye[2]<2,'the room primitive spans both sides of this interior camera');
    assert.deepEqual(nativeSegmentObstruction({...s,eye,target}),{blocked:false,hit:null},'a missing optional UV attribute is not an opaque room-sized box');
    const wallHit=nativeSegmentObstruction({...s,eye:[1,1.5,1],target:[1,1.5,-1]});
    assert.equal(wallHit.blocked,true);assert.equal(wallHit.hit.conservative,false);near(wallHit.hit.distance,1);
    assert.strictEqual(s.mesh.primitives[0].nativeReceiverGeometry,geometry);assert.strictEqual(geometry.uvs,missingUV);
    assert.equal(JSON.stringify(s.mesh),before,'the renderer metadata never acquires the query-local zero-UV buffer');
  }
});

test('truncated supplied UVs and missing normals still use conservative native bounds',()=>{
  const front=gridWall([-2,-.5,.5,2],[0,.7,2.3,3],(x,y)=>x===1&&y===1),room=join(front,wall({z:2}));
  for(const patch of[{uvs:new Float32Array(1)},{uvs:null,normals:null}]){
    const s=scene([primitive({...room,...patch})]),result=nativeSegmentObstruction({...s,eye:[0,1.5,1],target:[0,1.5,-1]});
    assert.equal(result.blocked,true);assert.equal(result.hit.conservative,true);near(result.hit.distance,0);
  }
});

test('only the exact target instance is ignored; glazing and another wall still obstruct',()=>{
  const s=scene([primitive(wall({z:.06}),'glass')]);s.instances[0].id='target-glass';
  const query={...s,eye:[0,1.5,2],target:[0,1.5,0]};
  assert.equal(nativeSegmentObstruction(query).blocked,true,'glazing is reported geometrically rather than filtered by stillness eligibility');
  assert.deepEqual(nativeSegmentObstruction({...query,ignoreIds:['target-glass']}),{blocked:false,hit:null});
  s.instances.push({id:'wall-between',mesh:s.mesh.name,z:1});
  const result=nativeSegmentObstruction({...query,ignoreIds:['target-glass']});
  assert.equal(result.blocked,true);assert.equal(result.hit.id,'wall-between','ignoring the vessel cannot ignore another instance sharing its mesh/material');
});

test('the target clearance margin does not admit a wall farther than two centimetres in front',()=>{
  const query=z=>nativeSegmentObstruction({...scene([primitive(wall({z}))]),eye:[0,1.5,1],target:[0,1.5,0]});
  for(const z of[-.3,0,.019,.02])assert.equal(query(z).blocked,false,`surface z=${z} is beyond or inside the target margin`);
  assert.equal(query(.021).blocked,true,'a distinct wall outside the target margin remains an obstruction');
});

test('an eye on or inside native wall geometry cannot look through it by losing the first near-zero hit',()=>{
  const on=scene();const touching=nativeSegmentObstruction({...on,eye:[0,1.5,0],target:[0,1.5,-1]});
  assert.equal(touching.blocked,true);near(touching.hit.distance,0);
  const within=scene([primitive(join(wall({z:-.03}),wall({z:.03})))]);
  const result=nativeSegmentObstruction({...within,eye:[0,1.5,0],target:[0,1.5,-1]});
  assert.equal(result.blocked,true);near(result.hit.distance,.03);
  const bounds=scene([{materialName:'unknown opaque/glazed host',nativeReceiverBounds:{min:[-2,0,-.04],max:[2,3,.04]}}]);
  const conservative=nativeSegmentObstruction({...bounds,eye:[0,1.5,0],target:[0,1.5,-1]});
  assert.equal(conservative.blocked,true);assert.equal(conservative.hit.conservative,true);near(conservative.hit.distance,0);
});

test('invalid segment geometry and unavailable native meshes fail closed',()=>{
  const s=scene(),query={...s,eye:[0,1.5,1],target:[0,1.5,-1]};
  for(const point of[null,{},[0,NaN,0],[0,Infinity,0]])for(const key of['eye','target']){
    const result=nativeSegmentObstruction({...query,[key]:point});assert.equal(result.blocked,true);assert.equal(result.hit,null);
  }
  assert.equal(nativeSegmentObstruction({...query,target:query.eye}).blocked,true,'an undefined direction cannot establish visibility');
  for(const patch of[{instances:null},{instances:[null]},{catalog:null},{catalog:new Map()},{ignoreIds:null},{ignoreIds:[{}]},
    {instances:[{...s.instances[0],x:NaN}]},{instances:[{...s.instances[0],matrix:Array(16).fill(0)}]}]){
    const result=nativeSegmentObstruction({...query,...patch});assert.equal(result.blocked,true);assert.equal(result.hit,null);
  }
  const damaged=scene([primitive({...wall(),positions:[0,NaN,0]})]);
  assert.equal(nativeSegmentObstruction({...query,...damaged}).blocked,true,'damaged retained geometry cannot silently become open space');
  assert.deepEqual(nativeSegmentObstruction({...query,instances:[]}),{blocked:false,hit:null},'an explicit known empty list is distinct from unavailable geometry');
});

test('a distant procedural primitive uses its native whole-mesh bounds without rejecting a clear segment',()=>{
  const s=scene([primitive(wall({z:-3}))]);
  const procedural={name:'native_case',nodeMatrix:identity(),primitives:[{materialName:'case trim'}],
    cullBounds:{min:[-.6,.01,-.26],max:[.6,.358,.21]},cullBoundsValid:true};
  const before=JSON.stringify(procedural);s.catalog.set(procedural.name,procedural);
  s.instances.push({id:'distant-case',mesh:procedural.name,x:25,y:0,z:0});
  const result=nativeSegmentObstruction({...s,eye:[0,.2,1],target:[0,.2,-1]});
  assert.deepEqual(result,{blocked:false,hit:null},'the real bound misses this finite segment; unavailable trim triangles are not a global obstruction');
  assert.equal(JSON.stringify(procedural),before,'fallback geometry is local to the query, not installed into the native catalog');
  assert.equal(procedural.primitives[0].nativeReceiverBounds,undefined);
});

test('a nearby case without retained primitive triangles conservatively blocks at its transformed native bounds',()=>{
  const s=scene([primitive(wall({z:-3}))]);
  const node=identity();node[14]=.05;
  const procedural={name:'native_case',nodeMatrix:node,primitives:[{materialName:'case trim'}],
    cullBounds:{min:[-.6,.01,-.26],max:[.6,.358,.21]}};
  s.catalog.set(procedural.name,procedural);s.instances.push({id:'near-case',mesh:procedural.name,x:0,y:0,z:.2});
  const result=nativeSegmentObstruction({...s,eye:[0,.2,1],target:[0,.2,-1]});
  assert.equal(result.blocked,true);assert.equal(result.hit.id,'near-case');assert.equal(result.hit.conservative,true);
  assert.equal(result.hit.boundsSource,'mesh.cullBounds');assert.equal(result.hit.primitiveIndex,0);near(result.hit.distance,.54);
  delete procedural.cullBounds;procedural.extras={bounds:{min:[-.6,.01,-.26],max:[.6,.358,.21]}};
  const extra=nativeSegmentObstruction({...s,eye:[0,.2,1],target:[0,.2,-1]});
  assert.equal(extra.blocked,true);assert.equal(extra.hit.boundsSource,'mesh.extras.bounds');near(extra.hit.distance,.54);
});

test('a truly unbounded native primitive still fails closed and identifies the unresolved owner',()=>{
  const s=scene([primitive(wall({z:-3}))]);
  const procedural={name:'unbounded_native',nodeMatrix:identity(),primitives:[{materialName:'unknown procedural surface'}]};
  s.catalog.set(procedural.name,procedural);s.instances.push({id:'unbounded-procedural',mesh:procedural.name,x:100,y:0,z:0});
  const result=nativeSegmentObstruction({...s,eye:[0,.2,1],target:[0,.2,-1]});
  assert.equal(result.blocked,true);assert.equal(result.hit,null);assert.equal(result.reason,'native-geometry-unavailable');
  assert.deepEqual(result.unresolved,{id:'unbounded-procedural',mesh:'unbounded_native',primitiveIndex:0},'distance cannot establish a miss without actual native bounds');
  procedural.cullBounds={min:[NaN,0,0],max:[1,1,1]};
  assert.equal(nativeSegmentObstruction({...s,eye:[0,.2,1],target:[0,.2,-1]}).blocked,true,'nonfinite bounds are not permission to skip the unknown primitive');
});

function actualPub(){
  const bytes=readFileSync(new URL('../public/assets/pub-hospitality.glb',import.meta.url)),jsonSize=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonSize)),bin=bytes.subarray(28+jsonSize);
  const access=id=>{const a=json.accessors[id],v=json.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],size=a.componentType===5126||a.componentType===5125?4:2,view=new DataView(bin.buffer,bin.byteOffset,bin.byteLength),result=[];
    for(let i=0;i<a.count;i++)for(let k=0;k<n;k++){const off=(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||n*size)+k*size;result.push(a.componentType===5126?view.getFloat32(off,true):size===4?view.getUint32(off,true):view.getUint16(off,true));}return result;};
  const source=json.meshes.find(m=>m.name==='pub_warm_interior');assert.ok(source);
  const mesh={name:source.name,nodeMatrix:identity(),primitives:source.primitives.map(p=>{const material=json.materials[p.material],positions=access(p.attributes.POSITION);return{
    materialName:material.name,materialRole:material.extras?.materialRole,alphaCut:material.alphaMode==='MASK'?(material.alphaCutoff??.5):0,
    nativeReceiverGeometry:{positions,normals:access(p.attributes.NORMAL),uvs:p.attributes.TEXCOORD_0==null?Array(positions.length/3*2).fill(0):access(p.attributes.TEXCOORD_0),indices:access(p.indices)}};})};
  return{mesh,catalog:new Map([[mesh.name,mesh]]),instances:[{id:'real-pub',mesh:mesh.name,x:0,y:0,z:0}]};
}

test('the shipped pub wall produces a native material donor from real GLB triangles',()=>{
  const s=actualPub();
  const result=resolve(s,{camera:{eye:[0,1.6,4]}});
  assert.ok(result.receivers.length,'the current pub has a real eligible near wall');
  for(const r of result.receivers){const p=s.mesh.primitives[r.nativePrimitiveIndex];
    assert.equal(stillnessSurfaceEligible(s.mesh,p),true);assert.equal(r.materialId,p.materialName);assert.equal(r.donorName,'pub_warm_interior');
    assert.ok(r.host.triangleCount>=2);assert.ok(r.distanceM<=5);near(r.heightM/r.widthM,1.4);
  }
  const plaster=result.receivers.find(r=>r.materialId==='pub warmth / academic plaster');assert.ok(plaster);
  near(plaster.origin[2],5.94,1e-6);assert.equal(plaster.nativePrimitiveIndex,3);
});

test('segment obstruction reads the shipped pub wall triangles as well as artificial wall fixtures',()=>{
  const s=actualPub(),result=nativeSegmentObstruction({...s,eye:[0,1.6,4],target:[0,1.6,8]});
  assert.equal(result.blocked,true);assert.equal(result.hit.id,'real-pub');assert.equal(result.hit.mesh,'pub_warm_interior');
  assert.ok(result.hit.distance>0&&result.hit.distance<4-.02);assert.equal(result.hit.conservative,false);
});
