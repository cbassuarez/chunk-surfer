import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SOURCE_EARTHFALL as C} from '../src/data/source-earthfall.js';
import {sourceEarthfallFaultLayout} from '../src/data/source-earthfall-faults.js';
import {freshSourceEarthfall} from '../src/game/source-earthfall.js';
import {sourceContinuationMeshPayload} from '../src/render/source-continuation-renderer.js';
import {sourceEarthfallFaultGeometry,sourceEarthfallRenderFrame,sourceEarthfallShakenFrame,installSourceEarthfallMeshes} from '../src/render/source-earthfall-renderer.js';

const geometry=sourceEarthfallFaultGeometry(),byName=new Map(geometry.map(piece=>[piece.name,piece]));
const faults=frame=>frame.props.filter(prop=>prop.earthfallRole==='chunk-fault');
const matrices=frame=>faults(frame).map(prop=>[prop.id,prop.mesh,[...prop.matrix]]);
const transform=(matrix,point)=>[0,1,2].map(axis=>matrix[axis]*point[0]+matrix[axis+4]*point[1]+matrix[axis+8]*point[2]+matrix[axis+12]);
const triangleKey=points=>points.map(point=>point.map(value=>value.toFixed(6)).join(',')).sort().join('|');
function triangles(positions,indices){
  return Array.from({length:indices.length/3},(_,triangle)=>[0,1,2].map(corner=>{
    const offset=indices[triangle*3+corner]*3;return Array.from(positions.slice(offset,offset+3));
  }));
}
function stateAt(elapsed,phase,feet=C.upperFloor,extra={}){
  return{...freshSourceEarthfall({runId:'flat-earthfall-fault-renderer'}),committed:elapsed>0,committedAt:0,clock:elapsed,elapsed,phase,feet,...extra};
}
function installerFixture(){
  let current=null,created=0;
  const attributes=[],catalog=new Map();
  const gl={ARRAY_BUFFER:34962,ELEMENT_ARRAY_BUFFER:34963,STATIC_DRAW:35044,FLOAT:5126,UNSIGNED_INT:5125,
    createBuffer:()=>{created++;return{};},createVertexArray:()=>({}),bindVertexArray(){},bindBuffer(_target,buffer){current=buffer;},
    bufferData(_target,data){current.data=data.slice();},enableVertexAttribArray(){},disableVertexAttribArray(){},
    vertexAttribPointer(...args){attributes.push(args);},vertexAttribDivisor(){},vertexAttrib1f(){}};
  const maps={texture:{source:true},normalTexture:{normal:true},ormTexture:{orm:true},letteringFinish:{version:1}};
  return{gl,catalog,attributes,maps,created:()=>created};
}

test('batched fault meshes contain exactly the authored flat triangles without extrusion or duplicate backs',()=>{
  const expected=sourceEarthfallFaultLayout().flatMap(piece=>triangles(piece.vertices.flat(),piece.indices));
  const actual=geometry.flatMap(piece=>triangles(piece.p,piece.i));
  assert.ok(expected.length>0);assert.ok(geometry.length>0);
  assert.deepEqual(actual.map(triangleKey).sort(),expected.map(triangleKey).sort(),'batching must neither thicken the sheets nor invent or omit faces');
  assert.equal(new Set(actual.map(triangleKey)).size,actual.length,'two-sided drawing must not duplicate coincident triangles');
  for(const piece of geometry){
    assert.equal(piece.kind,'chunk-fault');assert.ok(piece.p.every(Number.isFinite));
    assert.ok(piece.i.every(index=>Number.isInteger(index)&&index>=0&&index<piece.p.length/3));
    for(const [a,b,c] of triangles(piece.p,piece.i)){
      const u=b.map((value,index)=>value-a[index]),v=c.map((value,index)=>value-a[index]);
      assert.ok(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>1e-7,'every fault face needs finite nonzero area');
    }
  }
});

test('fault uploads use opaque ordinary indexed meshes and preserve the authored sheets exactly',()=>{
  const fixture=installerFixture(),{gl,catalog,maps}=fixture;
  const names=installSourceEarthfallMeshes(gl,{catalog},{maps});
  for(const piece of geometry){
    assert.ok(names.includes(piece.name));
    const mesh=catalog.get(piece.name),payload=sourceContinuationMeshPayload(piece);
    assert.ok(mesh);assert.equal(mesh.primitives.length,1);assert.equal(mesh.extras?.vegetationWind,undefined,'world-fixed faults cannot acquire clock-driven vertex wind');
    const primitive=mesh.primitives[0];
    assert.equal(primitive.indexType,gl.UNSIGNED_INT);assert.equal(primitive.count,payload.indices.length);
    assert.deepEqual(primitive.nativeReceiverGeometry.positions,payload.positions);
    assert.deepEqual(primitive.nativeReceiverGeometry.indices,payload.indices);
    assert.equal(primitive.base[3],1);assert.equal(primitive.alphaCut,0);
    if(piece.palette==='black'){
      assert.equal(primitive.materialRole,'quiet-metal');assert.ok(primitive.emissive.every(value=>value===0));
    }else assert.equal(primitive.materialRole,'source-chunk-error');
    if(!['silver'].includes(piece.palette))assert.equal(primitive.texture,null,'colored and black faults must not borrow Source code textures');
  }
  const before=fixture.created();
  assert.deepEqual(installSourceEarthfallMeshes(gl,{catalog},{maps}),names);
  assert.equal(fixture.created(),before,'residency checks must reuse immutable fault buffers');
});

test('fault world coordinates stay fixed through the walk, rupture, 100m fall, quake and reduced motion',()=>{
  const start=sourceEarthfallRenderFrame(stateAt(0,'intact')),expected=matrices(start);
  assert.equal(expected.length,geometry.length);
  for(const [elapsed,phase,feet] of [[0,'intact',100],[.8,'fracturing',100],[2.9,'fracturing',100],[4,'falling',90],[6,'falling',45],[8,'falling',8],[12,'landed',0],[1000,'landed',0]]){
    for(const presentation of [{},{reducedMotion:true},{shakeMode:'off'},{effectsMode:'off'}]){
      const frame=sourceEarthfallRenderFrame(stateAt(elapsed,phase,feet,{x:3,z:-18,yaw:2.7,pitch:-.9}),presentation);
      assert.deepEqual(matrices(frame),expected,`${phase} at ${elapsed}s cannot move faults with the body, clock, look or effects settings`);
      assert.deepEqual(matrices(sourceEarthfallShakenFrame(frame)),expected,'faults are errors in the fixed world and do not inherit ground quake motion');
    }
  }
  const quaking=sourceEarthfallShakenFrame(sourceEarthfallRenderFrame(stateAt(2,'fracturing')));
  assert.equal(quaking.quake.still,false,'the quake invariance check must exercise actual ground motion');
  for(const prop of faults(start)){
    assert.equal(prop.worldAnchored,true);const piece=byName.get(prop.mesh),payload=sourceContinuationMeshPayload(piece),matrix=prop.matrix;
    const determinant=matrix[0]*(matrix[5]*matrix[10]-matrix[9]*matrix[6])-matrix[4]*(matrix[1]*matrix[10]-matrix[9]*matrix[2])+matrix[8]*(matrix[1]*matrix[6]-matrix[5]*matrix[2]);
    assert.ok(Math.abs(determinant)>1e-6,'zero thickness belongs to the mesh, not a singular matrix that destroys normals');
    for(let vertex=0;vertex<payload.positions.length/3;vertex++){
      const world=transform(matrix,payload.positions.slice(vertex*3,vertex*3+3)),sourceIndex=piece.i[vertex]*3;
      world.forEach((value,axis)=>assert.ok(Math.abs(value-piece.p[sourceIndex+axis])<3e-5,'centering and instance placement must reconstruct the authored world vertex'));
    }
  }
});

test('the actual physical prop pass draws flat fault faces from both sides with opaque depth writes',()=>{
  const source=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
  const pass=source.slice(source.indexOf('export function renderPropPass('),source.indexOf('export function propPackStats('));
  const start=pass.indexOf('gl.bindFramebuffer('),end=pass.indexOf('gl.useProgram(',start),setup=pass.slice(start,end);
  assert.ok(start>=0&&end>start);
  const enabled=new Set(),state={},gl={FRAMEBUFFER:'framebuffer',DEPTH_TEST:'depth',LEQUAL:'lequal',BLEND:'blend',CULL_FACE:'cull',COLOR_ATTACHMENT0:0,COLOR_ATTACHMENT2:2,NONE:-1,COLOR_BUFFER_BIT:1,DEPTH_BUFFER_BIT:2,
    bindFramebuffer(){},viewport(){},enable(key){enabled.add(key);},disable(key){enabled.delete(key);},depthMask(value){state.depthMask=value;},depthFunc(value){state.depthFunc=value;},drawBuffers(){},clearColor(){},clearDepth(){},clear(){}};
  new Function('gl','reflection','reflFbo','fbo','reflW','width','reflH','height',setup)(gl,false,{}, {},64,64,64,64);
  assert.ok(enabled.has(gl.DEPTH_TEST));assert.equal(state.depthMask,true);assert.equal(state.depthFunc,gl.LEQUAL);
  assert.ok(!enabled.has(gl.BLEND));assert.ok(!enabled.has(gl.CULL_FACE),'single zero-thickness faces remain visible from either side');
  const beforeDraw=pass.slice(end,pass.indexOf('gl.drawElementsInstanced',end));
  assert.doesNotMatch(beforeDraw,/gl\.(?:enable\(gl\.(?:BLEND|CULL_FACE)|disable\(gl\.DEPTH_TEST)|depthMask\(false/,'opaque depth and two-sided state must survive until the indexed mesh draw');
});
