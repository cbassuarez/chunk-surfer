import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SOURCE_EARTHFALL as C,SOURCE_EARTHFALL_MATERIAL_CELL,earthfallExitDoorHeight} from '../src/data/source-earthfall.js';
import {freshSourceEarthfall,sourceEarthfallFrame,sourceEarthfallSupportAt,stepSourceEarthfall} from '../src/game/source-earthfall.js';
import {sourceEarthfallGeometry,sourceEarthfallRenderFrame,installSourceEarthfallMeshes,createSourceEarthfallRenderer,SOURCE_EARTHFALL_RENDER_BUDGET as BUDGET} from '../src/render/source-earthfall-renderer.js';
import {sourceContinuationMeshPayload} from '../src/render/source-continuation-renderer.js';
import {PROP_BOUNDS} from '../src/data/generated/prop-geometry.js';
import {SOURCE_DEMOLITION_GEOMETRY as DEMO} from '../src/data/generated/source-demolition-geometry.js';
import {ST_BRENDANS_PRESENCE_MESH} from '../src/data/st-brendans-presences.js';
import {doorAssembly} from '../src/data/source-door-fields.js';
import {parseGlb} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';
import {readAccessor} from '../tools/chunk_surfer/build-st-brendans-treatment.mjs';

const fresh=()=>freshSourceEarthfall({runId:'earthfall-render-proof'});
const transform=(m,p)=>[0,1,2].map(a=>m[a]*p[0]+m[a+4]*p[1]+m[a+8]*p[2]+m[a+12]);
function triangleHeight(points,x,z){
  const[a,b,c]=points,den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(den)<1e-9)return null;
  const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den,w=1-u-v;
  return Math.min(u,v,w)<-1e-6?null:u*a[1]+v*b[1]+w*c[1];
}
function uploadedTriangles(piece,instance){
  const payload=sourceContinuationMeshPayload(piece),rows=[];
  for(let i=0;i<payload.positions.length;i+=9)rows.push([0,1,2].map(k=>transform(instance.matrix,[...payload.positions.slice(i+k*3,i+k*3+3)])));
  return rows;
}
const pieces=new Map(sourceEarthfallGeometry().map(p=>[p.name,p]));

test('the actual upper earth triangles form the exact finite controller support before release',()=>{
  for(const elapsed of[0,.61,2.99]){
    const state={...fresh(),committed:elapsed>0,committedAt:0,clock:elapsed,elapsed,phase:elapsed?'fracturing':'intact'},frame=sourceEarthfallRenderFrame(state);
    const triangles=frame.props.filter(p=>p.earthfallRole==='earth').flatMap(p=>uploadedTriangles(pieces.get(p.mesh),p));
    let samples=0;
    for(let x=C.earth.minX+.17;x<C.earth.maxX;x+=7.31)for(let z=C.earth.minZ+.19;z<C.earth.maxZ;z+=7.37){
      const expected=sourceEarthfallSupportAt(x,z,state);assert.equal(expected.y,100);
      assert.ok(triangles.some(points=>{const y=triangleHeight(points,x,z);return y!=null&&Math.abs(y-expected.y)<2e-5;}),`unsupported visible point ${x},${z} at ${elapsed}`);samples++;
    }
    assert.ok(samples>300);
  }
  assert.equal(sourceEarthfallRenderFrame(fresh()).counts.earth,120);
});

test('every fragment face has outward winding and finite physically scaled Source coordinates',()=>{
  let triangles=0;
  for(const piece of sourceEarthfallGeometry()){
    const p=sourceContinuationMeshPayload(piece);assert.ok([...p.positions,...p.normals,...p.uvs].every(Number.isFinite));
    for(let i=0;i<p.positions.length;i+=9){
      const centroid=[0,1,2].map(a=>(p.positions[i+a]+p.positions[i+3+a]+p.positions[i+6+a])/3);
      assert.ok(centroid.reduce((n,v,a)=>n+v*p.normals[i+a],0)>0,'a fractured edge faces inward');triangles++;
    }
  }
  assert.equal(triangles,BUDGET.customTriangles);assert.ok(triangles<1600);
});

test('falling uses actual player pose and catches on the visible12m sheet through its full settlement',()=>{
  let state={...fresh(),committed:true,committedAt:0,clock:3,elapsed:3,phase:'falling'};let caught=false,landed=false,samples=0;
  for(let i=0;i<1000&&!landed;i++){
    state=stepSourceEarthfall(state,{dt:1/120}).state;const frame=sourceEarthfallRenderFrame(state),sheet=frame.props.find(p=>p.earthfallRole==='catch');
    const triangles=uploadedTriangles(pieces.get(sheet.mesh),sheet),tops=triangles.map(p=>triangleHeight(p,state.x,state.z)).filter(y=>y!=null),top=Math.max(...tops);
    assert.ok(Math.abs(top-frame.source.catchSurfaceY)<1e-5);
    const path=frame.props.find(p=>p.earthfallRole==='path'),pathTriangles=uploadedTriangles(pieces.get(path.mesh),path),pathTop=Math.max(...pathTriangles.map(p=>triangleHeight(p,0,-21)).filter(y=>y!=null));
    assert.ok(Math.abs(pathTop-(top+.004))<1e-5,'the finite paper route must remain on the visibly compressing support');
    assert.ok(sheet.cullRadius>=128,'the expanded safety apron cannot disappear at its edges');
    assert.deepEqual(frame.authoredCamera.eye,[state.x,state.feet+C.eyeHeight,state.z]);
    if(state.phase==='catching'){caught=true;assert.ok(Math.abs(top-state.feet)<1e-5);samples++;}
    if(state.phase==='landed'){landed=true;assert.equal(top,0);assert.equal(frame.props.filter(p=>p.earthfallRole==='path').length,1);}
  }
  assert.ok(caught&&landed&&samples>100);
});

test('fractures open only after footing loss, remain deterministic, and never borrow the camera',()=>{
  const state={...fresh(),committed:true,committedAt:0,clock:4.5,elapsed:4.5,phase:'falling',feet:89};
  const a=sourceEarthfallRenderFrame(state),b=sourceEarthfallRenderFrame({...state,yaw:1.8,pitch:-.8});
  assert.deepEqual(a.props.map(p=>[p.id,[...p.matrix]]),b.props.map(p=>[p.id,[...p.matrix]]));
  assert.ok(a.props.filter(p=>p.earthfallRole==='earth').every(p=>p.matrix[13]<99));
  assert.ok(a.props.filter(p=>p.earthfallRole==='residue').every(p=>p.apparitionVariant===14&&p.emissive.slice(0,3).every(v=>v===0)));
  const off=sourceEarthfallRenderFrame(state,{effectsMode:'off'}),reduced=sourceEarthfallRenderFrame(state,{reducedMotion:true});
  assert.equal(off.counts.presences,0);assert.ok(reduced.counts.presences<=12);assert.equal(off.counts.earth,120);
  assert.deepEqual(reduced.props.filter(p=>p.earthfallRole==='earth').map(p=>[p.cell,[...p.matrix]]),a.props.filter(p=>p.earthfallRole==='earth').map(p=>[p.cell,[...p.matrix]]),'essential bearing folds must keep the same real aperture in reduced mode');
  assert.equal(sourceEarthfallRenderFrame({...state,elapsed:2.5,clock:2.5,phase:'fracturing',feet:100}).props.filter(p=>p.earthfallRole==='tear').length>200,true);
});

test('the moving material sound anchor stays on the actual shared central fragment top pivot',()=>{
  const material=SOURCE_EARTHFALL_MATERIAL_CELL,piece=pieces.get('source-earthfall-'+material.id),data=sourceContinuationMeshPayload(piece);
  for(const elapsed of[0,2.99,3,3.07,3.5,5.2,8.7]){
    const state={...fresh(),committed:true,committedAt:0,clock:elapsed,elapsed,phase:elapsed<3?'fracturing':'falling'},f=sourceEarthfallRenderFrame(state),instance=f.props.find(p=>p.cell===material.index);
    const topPivot=transform(instance.matrix,[material.center.x-data.bounds.center[0],material.center.y-data.bounds.center[1],material.center.z-data.bounds.center[2]]),anchor=f.source.anchors.fallingMaterial;
    assert.ok(topPivot.every((v,k)=>Math.abs(v-[anchor.x,anchor.y,anchor.z][k])<2e-5),'sound follows a synthetic point rather than actual released material');
  }
});

test('released real triangles separate from the falling body and open a visible seam promptly',()=>{
  let state={...fresh(),committed:true,committedAt:0,clock:3,elapsed:3,phase:'falling'};
  for(let i=0;i<90;i++)state=stepSourceEarthfall(state,{dt:1/120}).state;
  const f=sourceEarthfallRenderFrame(state),cell=f.props.find(p=>p.cell===78),triangles=uploadedTriangles(pieces.get(cell.mesh),cell),highest=Math.max(...triangles.flat().map(p=>p[1]));
  assert.ok(state.feet-highest>3,`nearby printed earth is still riding beneath the body: separation ${state.feet-highest}m`);
  for(const age of[.3,.6]){
    const frame=sourceEarthfallRenderFrame({...state,clock:3+age,elapsed:3+age}),a=frame.props.find(p=>p.cell===77),b=frame.props.find(p=>p.cell===78),pa=pieces.get(a.mesh),pb=pieces.get(b.mesh),ba=sourceContinuationMeshPayload(pa).bounds,bb=sourceContinuationMeshPayload(pb).bounds;
    const common=pa.points.filter(p=>pb.points.some(q=>p.every((v,i)=>v===q[i])));assert.equal(common.length,2);
    for(const point of common){
      const left=transform(a.matrix,point.map((v,i)=>v-ba.center[i])),right=transform(b.matrix,point.map((v,i)=>v-bb.center[i]));
      assert.ok(Math.hypot(...left.map((v,i)=>v-right[i]))>.07,'adjacent controlled hinges still occupy exactly the same seam');
    }
  }
});

test('support cuts initiate in order while every supported top stays held, and model mass settles finitely inward',()=>{
  let previousCount=0;
  for(const elapsed of[.59,.65,1,1.4,1.8,2.1]){
    const f=sourceEarthfallRenderFrame({...fresh(),committed:true,committedAt:0,clock:elapsed,elapsed,phase:'fracturing'}),cuts=f.props.filter(p=>p.earthfallRole==='tear');
    assert.ok(cuts.length>=previousCount);previousCount=cuts.length;
    assert.ok(cuts.every(p=>p.initiationAt<=elapsed&&Math.abs(p.y-100.002)<.00001));
    if(elapsed===.59)assert.equal(cuts.length,0);
    if(elapsed===.65){assert.ok(cuts.length>0&&cuts.length<120);assert.ok(cuts.every(p=>p.supportBand===0));}
  }
  const landed=elapsed=>sourceEarthfallRenderFrame({...fresh(),committed:true,committedAt:0,clock:elapsed,elapsed,phase:'landed',feet:0}).props.filter(p=>p.earthfallRole==='model');
  const end=landed(12),later=landed(40);assert.deepEqual(end.map(p=>[...p.matrix]),later.map(p=>[...p.matrix]),'settled loads must not continue spinning with scene time');
  for(const p of end){
    const topLean=[p.matrix[4],p.matrix[6]],towardSpine=[-p.x,-21-p.z];
    assert.ok(topLean[0]*towardSpine[0]+topLean[1]*towardSpine[1]>0,'heavy models tip coherently inward instead of random splaying');
    assert.equal(p.supportY,0);
  }
});

test('native model feet carry each finite inward pose without floating or penetrating its moving support',()=>{
  const pack=parseGlb(readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url))),vertices=new Map(['grand_piano','instrument_case'].map(name=>[name,pack.json.meshes.find(m=>m.name===name).primitives.flatMap(p=>{const v=readAccessor(pack,p.attributes.POSITION);return Array.from({length:v.length/3},(_,i)=>v.slice(i*3,i*3+3));})]));
  for(const elapsed of[0,2.99,3.2,3.7,4.5,7.7,12]){
    const f=sourceEarthfallRenderFrame({...fresh(),committed:true,committedAt:0,clock:elapsed,elapsed,phase:elapsed<3?'fracturing':elapsed>8?'landed':'falling',feet:elapsed>8?0:80});
    for(const p of f.props.filter(p=>p.earthfallRole==='model')){
      const points=vertices.get(p.mesh).map(v=>transform(p.matrix,v)),lowest=Math.min(...points.map(v=>v[1]));
      assert.ok(Math.abs(lowest-p.supportY)<.001,`${p.id} has no actual current foot contact: ${lowest} vs ${p.supportY}`);
      assert.ok(points.every(v=>Math.abs(v[0])>C.passage.halfWidth),`${p.id} obscures the lower path during inward settling`);
    }
  }
});

test('there are exactly two authored doors and surrounding original models clear the corridor',()=>{
  const frame=sourceEarthfallRenderFrame(fresh()),doors=frame.props.filter(p=>p.earthfallRole==='door'&&p.mesh===doorAssembly('bay-goods-pair',{activeLeaves:'all'}).frameMesh);
  assert.equal(doors.length,2);assert.deepEqual(doors.map(p=>[p.y,p.z]),[[100,0],[100,-42]],'both physical doors begin on the upper corridor');
  const landed=sourceEarthfallRenderFrame({...fresh(),committed:true,committedAt:0,clock:10,elapsed:10,phase:'landed',feet:0});
  assert.deepEqual(landed.props.filter(p=>p.earthfallRole==='door'&&p.mesh===doorAssembly('bay-goods-pair',{activeLeaves:'all'}).frameMesh).map(p=>[p.y,p.z]),[[100,0],[0,-42]]);
  for(const elapsed of[3.2,4.5,6,8.5]){
    const moving=sourceEarthfallRenderFrame({...fresh(),committed:true,committedAt:0,clock:elapsed,elapsed,phase:'falling',feet:40});
    const exit=moving.props.find(p=>p.earthfallRole==='door'&&p.mesh===doorAssembly('bay-goods-pair',{activeLeaves:'all'}).frameMesh&&p.doorId==='source-earthfall-exit');
    assert.ok(Math.abs(exit.y-earthfallExitDoorHeight(elapsed))<1e-5,'the actual forward-door frame must follow its shared material-height contract');
  }
  for(const instance of frame.props.filter(p=>p.earthfallRole==='model')){
    const b=PROP_BOUNDS[instance.mesh],xs=[];
    for(const x of[b.min[0],b.max[0]])for(const y of[b.min[1],b.max[1]])for(const z of[b.min[2],b.max[2]])xs.push(transform(instance.matrix,[x,y,z])[0]);
    assert.ok(Math.max(...xs)<-C.passage.halfWidth||Math.min(...xs)>C.passage.halfWidth,`${instance.id} enters clear spine`);
  }
  const file=readFileSync(new URL('../public/assets/source-demolition.glb',import.meta.url)),length=file.readUInt32LE(12),json=JSON.parse(file.subarray(20,20+length));
  const instance=frame.props.find(p=>p.earthfallRole==='ellery'),mesh=json.meshes.find(p=>p.name===instance.mesh);
  for(const primitive of mesh.primitives){const a=json.accessors[primitive.attributes.POSITION];const xs=[];for(const x of[a.min[0],a.max[0]])for(const y of[a.min[1],a.max[1]])for(const z of[a.min[2],a.max[2]])xs.push(transform(instance.matrix,[x,y,z])[0]);assert.ok(Math.max(...xs)<-C.passage.halfWidth);}
});

function fixture({gate=null,missingBase=false}={}){
  const calls=[],catalog=new Map((missingBase?['grand_piano']:['grand_piano','instrument_case']).map(n=>[n,{}]));let ranges=0,rangeReleases=0,releases=0;
  const renderer=new Proxy({}, {get:(_,key)=>(...args)=>{calls.push({key,args});return key==='r3dBasePropsReady'?(gate||Promise.resolve(true)):key==='r3dFrame'?true:undefined;}});
  const props={propMeshCatalog:()=>[...catalog.keys()],setPressureInstances:()=>{},installAuthoredPropMeshes(){for(const p of sourceEarthfallGeometry())catalog.set(p.name,{});return true;},
    async addPropPack(url){const names=url.includes('source-demolition')?[DEMO.staticMesh,...DEMO.parts.map(p=>p.mesh)]:url.includes('presences')?Object.values(ST_BRENDANS_PRESENCE_MESH):(()=>{const d=doorAssembly('bay-goods-pair',{activeLeaves:'all'});return[d.frameMesh,d.leafMesh,d.freeStandingHeadMesh].filter(Boolean);})();for(const n of names)catalog.set(n,{});},
    setAuthoredPropRange(owner,far){ranges++;assert.equal(typeof owner,'symbol');assert.equal(far,240);let freed=false;return()=>{if(freed)return false;freed=true;rangeReleases++;return true;};}};
  const owner=createSourceEarthfallRenderer({renderer,props,resolveAsset:u=>u,onRelease:()=>releases++});
  return{owner,calls,catalog,ranges:()=>ranges,rangeReleases:()=>rangeReleases,releases:()=>releases};
}
test('adapter uses normal shared3D/dither, repairs residency and releases the range exactly once',async()=>{
  const h=fixture();assert.equal(await h.owner.initialize(),true);assert.equal(h.owner.ready(),true);assert.equal(h.ranges(),1);
  assert.equal(h.owner.render(fresh()),true);const draw=h.calls.findLast(c=>c.key==='r3dFrame').args[0];assert.equal(draw.textSpace,true);assert.equal(draw.sourceVoidPhysical,false);assert.equal(draw.authoredPropRange,240);assert.equal(draw.authoredCamera.eye[1],101.62);
  h.catalog.delete(DEMO.staticMesh);assert.equal(h.owner.ready(),false);h.owner.render(fresh());await new Promise(r=>setImmediate(r));assert.equal(h.owner.ready(),true);assert.equal(h.ranges(),1);
  assert.equal(h.owner.dispose(),true);assert.equal(h.owner.dispose(),false);assert.equal(h.rangeReleases(),1);assert.equal(h.releases(),1);assert.equal(h.owner.render(fresh()),false);
});
test('late initialization cannot acquire the world or range after disposal; missing original assets fail clearly',async()=>{
  let resolve;const h=fixture({gate:new Promise(r=>resolve=r)}),loading=h.owner.initialize();h.owner.dispose();resolve(true);assert.equal(await loading,false);assert.equal(h.ranges(),0);assert.equal(h.calls.some(c=>c.key==='r3dSetPlan'),false);
  const missing=fixture({missingBase:true});await assert.rejects(missing.owner.initialize(),/instrument_case/);assert.equal(missing.owner.ready(),false);assert.equal(missing.ranges(),0);missing.owner.dispose();
});

test('installer uploads the tested finite triangles through the normal physical Source material and instance layout',()=>{
  let current=null;const buffers=[],catalog=new Map(),attributes=[];
  const gl={ARRAY_BUFFER:34962,ELEMENT_ARRAY_BUFFER:34963,STATIC_DRAW:35044,FLOAT:5126,UNSIGNED_INT:5125,
    createBuffer:()=>{const b={};buffers.push(b);return b;},createVertexArray:()=>({}),bindVertexArray(){},bindBuffer(_target,b){current=b;},bufferData(_target,data){current.data=data.slice();},enableVertexAttribArray(){},disableVertexAttribArray(){},vertexAttribPointer(...args){attributes.push(args);},vertexAttribDivisor(){},vertexAttrib1f(){}};
  const maps={texture:{source:true},normalTexture:{normal:true},ormTexture:{orm:true},letteringFinish:{version:1}};
  const names=installSourceEarthfallMeshes(gl,{catalog},{maps});assert.equal(names.length,124);
  assert.equal(catalog.size,124);assert.equal(buffers.filter(b=>b.data instanceof Float32Array).length,124*3);
  assert.equal([...catalog.values()].reduce((n,m)=>n+m.primitives[0].count/3,0),BUDGET.customTriangles);
  const p=catalog.get('source-earthfall-earth-0').primitives[0];assert.equal(p.texture,maps.texture);assert.equal(p.printedSurface.process,'source-fragments');assert.ok(attributes.some(a=>a[0]===12&&a[1]===4&&a[4]===29*4&&a[5]===100));
  const backing=catalog.get('source-earthfall-catch').primitives[0],path=catalog.get('source-earthfall-path').primitives[0];
  assert.equal(backing.texture,null,'bright repeated source stock must not fill every opened hole');assert.equal(backing.materialRole,'quiet-metal');assert.equal(backing.metallic,0);assert.equal(backing.roughness,1);
  assert.ok(backing.base.slice(0,3).every((v,i)=>v<path.base[i]/10));assert.equal(path.texture,maps.texture);assert.equal(path.printedSurface.process,'source-fragments');
  const pathGeometry=pieces.get('source-earthfall-path'),bounds=sourceContinuationMeshPayload(pathGeometry).bounds;
  assert.equal(bounds.max[0]-bounds.min[0],14);assert.equal(bounds.max[2]-bounds.min[2],45);
  const before=buffers.length;assert.deepEqual(installSourceEarthfallMeshes(gl,{catalog},{maps}),names);assert.equal(buffers.length,before,'residency checks must not duplicate immutable GPU meshes');
});
