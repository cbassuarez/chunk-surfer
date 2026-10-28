import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sourceShoreBounds } from '../src/data/source-hanging-shore.js';
import { sourceStrataEntryAt } from '../src/data/source-exposed-strata.js';
import { horizonCamera } from '../src/render/horizon3d.js';
import { SOURCE_SHORE_RANGE,SOURCE_SHORE_AIR,SOURCE_SHORE_COMPOSITE_FRAG,SOURCE_SHORE_MATERIAL_FRAG,
  sourceShoreGeometry,sourceShoreRenderActive,sourceShoreBoundaryVisible,
  sourceShoreApertureRay } from '../src/render/source-shore3d.js';

const frame=(extra={})=>({...sourceShoreBounds({x:22,y:-104}),active:true,outside:true,proper:false,...extra});
function rayBox(origin,dir,b){
  let near=0,far=Infinity;
  for(const [i,lo,hi]of [[0,'minX','maxX'],[1,'minY','maxY'],[2,'minZ','maxZ']]){
    if(Math.abs(dir[i])<1e-9){if(origin[i]<b[lo]||origin[i]>b[hi])return null;continue;}
    let a=(b[lo]-origin[i])/dir[i],c=(b[hi]-origin[i])/dir[i];if(a>c)[a,c]=[c,a];
    near=Math.max(near,a);far=Math.min(far,c);if(near>far)return null;
  }
  return near;
}
function rayPieces(origin,dir,pieces){
  const sub=(a,b)=>a.map((v,i)=>v-b[i]);
  const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  let nearest=Infinity;
  for(const piece of pieces)for(let j=0;j<piece.i.length;j+=3){
    const [a,b,c]=piece.i.slice(j,j+3).map(index=>piece.p.slice(index*3,index*3+3));
    const edge1=sub(b,a),edge2=sub(c,a),h=cross(dir,edge2),det=dot(edge1,h);
    if(Math.abs(det)<1e-9)continue;
    const s=sub(origin,a),u=dot(s,h)/det;if(u<0||u>1)continue;
    const q=cross(s,edge1),v=dot(dir,q)/det;if(v<0||u+v>1)continue;
    const distance=dot(edge2,q)/det;
    if(distance>1e-7)nearest=Math.min(nearest,distance);
  }
  return Number.isFinite(nearest)?nearest:null;
}
function transform(m,p){return [0,1,2,3].map(row=>m[row]*p[0]+m[4+row]*p[1]+m[8+row]*p[2]+m[12+row]);}

test('the two shores stay at fixed world addresses while the lift alone receives its floor offset',()=>{
  const a=frame({player:{x:0,z:0},progress:0}),b=frame({player:{x:100,z:-300},progress:1});
  a.lift={...a.lift,floor:0};b.lift={...b.lift,floor:4.2};
  assert.deepEqual(sourceShoreGeometry(a),sourceShoreGeometry(b),'walking cannot scale, drag or replace a shore');
  const geometry=sourceShoreGeometry(a);
  assert.equal(a.bank.maxX-a.bank.minX,84);
  assert.ok(geometry.boxes.filter(x=>x.moving).every(x=>x.id.startsWith('lift-')));
  assert.ok(geometry.hardware.filter(x=>x.moving).every(x=>x.id.startsWith('lift-')));
  assert.ok(geometry.pieces.length>0,'the fixed bank has real geological triangles');
  for(const name of ['tower_catwalk','tower_loft_rail','tower_bulkhead','tower_winch'])
    assert.ok(geometry.hardware.some(x=>x.name===name),`${name} supplies real familiar mechanical geometry`);
});

test('the finite exposed bank supports an open-sky cleft and conceals Source until the inner turn',()=>{
  const f=frame(),g=sourceShoreGeometry(f),b=f.bank;
  const world=([x,y,z])=>[x+f.originMetres.x,y,z+f.originMetres.z];
  const hit=(origin,dir)=>rayPieces(world(origin),dir,g.pieces);
  assert.ok(Math.abs(hit([0,0,-398],[0,1,0])-b.underside)<1e-8,'the full bank retains its real underside');
  assert.ok(hit([-45,8,-395],[1,0,0])!==null,'the western end has a finite cut face');
  assert.ok(hit([45,8,-395],[-1,0,0])!==null,'the eastern end has a finite cut face');
  assert.ok(hit([4,5.85,-388],[0,0,-1])!==null,'the lift cannot look straight through the cliff');
  const baffle=hit([10,5.85,-389],[0,0,-1]);
  assert.ok(baffle>3&&baffle<5,'the geological tongue blocks the outer mouth at ordinary eye height');
  assert.equal(hit([4,5.85,-396],[0,0,-1]),null,'the inner turn opens an unobstructed view into Source');
  for(const origin of [[10,5.85,-392],[4,5.85,-396],[4,5.85,-399]])
    assert.equal(hit(origin,[0,1,0]),null,'walking the cleft keeps the sky open overhead');
  for(let n=0;n<=80;n++){
    const t=n/80,x=10-6*t,z=-392-4*t;
    assert.equal(sourceStrataEntryAt(x,z),hit([x,5.85,z],[0,0,-1])===null,
      `Source release must follow the actual tongue sightline at ${x},${z}`);
  }
  for(const [x,z]of [[7,-390.3],[8,-391],[9,-392.2]]){
    assert.equal(hit([x,5.85,z],[0,0,-1]),null,'the broad western mouth already exposes the field');
    assert.equal(sourceStrataEntryAt(x,z),true,'an unobstructed west-mouth view cannot wait for a depth quota');
  }
  assert.ok(!g.boxes.some(x=>/^bank-(back|entry-lintel)$/.test(x.id)),'the geological entry has no enclosing building shell');
  assert.deepEqual(sourceShoreGeometry({...f,active:false,outside:false,proper:true}),g,'looking back from Source retains the same finite bank');
});

test('the remembered room has one true front aperture and a finite closed back',()=>{
  const f=frame(),g=sourceShoreGeometry(f),d=f.doorway,r=f.room;
  const from=[d.centreX,r.floor+1.65,d.doorZ-2],dir=[0,0,1];
  assert.ok(!g.boxes.filter(b=>/^room-front-|^room-door-head/.test(b.id)).some(b=>rayBox(from,dir,b)!==null));
  assert.ok(g.boxes.some(b=>b.id==='room-back'&&rayBox([r.minX-2,2,r.maxZ+2],[1,0,0],b)===null));
  assert.ok(g.boxes.some(b=>b.id==='room-back'&&rayBox([d.centreX,2,r.maxZ+2],[0,0,-1],b)!==null));
  const slab=g.boxes.find(b=>b.id==='room-underside');assert.equal(slab.minZ,r.minZ);assert.equal(slab.maxZ,r.maxZ);
});

test('the camera retains the distant bank and distant room without changing the ordinary tape camera',()=>{
  const f=frame(),d=f.doorway;
  for(const [eye,target,yaw]of [
    [[d.centreX,1.65,d.doorZ-1],[(f.bank.minX+f.bank.maxX)/2,10,f.bank.frontZ],0],
    [[d.centreX,5.85,f.lift.minZ],[d.centreX,2.5,d.doorZ],Math.PI],
  ]){
    const c=horizonCamera({camX:eye[0],camY:eye[1],camZ:eye[2],yaw,aspect:1.6,...SOURCE_SHORE_RANGE});
    const p=transform(c.projection,transform(c.view,target));
    assert.ok(Math.abs(p[0]/p[3])<1&&Math.abs(p[1]/p[3])<1&&Math.abs(p[2]/p[3])<1,'fixed architecture stays inside clip range');
  }
  const ordinary=horizonCamera(),explicit=horizonCamera({near:.05,far:120});assert.deepEqual(ordinary.projection,explicit.projection);
});

test('void optics are scoped outside and boundary geometry can persist independently inside',()=>{
  assert.equal(sourceShoreRenderActive(frame()),true);
  for(const change of [{outside:false},{proper:true},{active:false}])assert.equal(sourceShoreRenderActive(frame(change)),false);
  assert.equal(sourceShoreBoundaryVisible(frame({active:false,outside:false,proper:true,visible:true})),true);
  assert.equal(sourceShoreBoundaryVisible(frame({active:false,outside:false,proper:true,visible:false})),false);
  assert.equal(SOURCE_SHORE_AIR.length,3);
  assert.doesNotMatch(SOURCE_SHORE_COMPOSITE_FRAG.replace(/\/\/[^\n]*/g,''),/uTorch|uRain|uPitch|rayY|horizon|sin\(/,'empty pixels have no directional or torch-dependent treatment');
  assert.match(SOURCE_SHORE_COMPOSITE_FRAG,/mix\(uAir,material,coverage\)/);
  assert.match(SOURCE_SHORE_MATERIAL_FRAG,/vec3 toLamp=uTorchOrigin-vWorld;float lampDistance=length\(toLamp\)/,
    'the surface beam measures from the actual lamp origin');
  assert.match(SOURCE_SHORE_MATERIAL_FRAG,/1\.0-smoothstep\(reach\*\.62,reach,lampDistance\)/,'the actual surface beam has a finite range');
});

test('the walk is printed by the shared acquisition and post, like the room it leaves',()=>{
  const r3d=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
  const body=r3d.slice(r3d.indexOf('function drawSourceShore('),r3d.indexOf('function drawSourceVoidPhysical('));
  assert.match(body,/presentThroughPost\(runPixelMeshPass\(voidState,now\)\)/,'the shore no longer presents its encoded frame through post');
  assert.doesNotMatch(r3d,/uSourceShore\b/,'the post pass still has a shore bypass');
  assert.doesNotMatch(SOURCE_SHORE_COMPOSITE_FRAG,/uWhiteout|received/,'the composite still repaints smooth colour or a crossing veil over the encode');
});

test('the room-side opening hides distant terrain while preserving a leaf, jamb and threshold in front',()=>{
  const f=frame({outside:false}),d=f.doorway,r=f.room;
  const eye=[d.centreX,r.floor+1.65,d.doorZ+2],ray=[0,0,-1],forward=ray;
  const sample=(changes={})=>sourceShoreApertureRay({frame:f,eye,ray,forward,surfaceView:30,...changes});
  assert.deepEqual(sample(),{view:2,hit:[d.centreX,r.floor+1.65,d.doorZ]},'the fixed doorway replaces the distant old scene');
  assert.equal(sample({surfaceView:1.8}),null,'an opening or closed leaf before the plane retains its real material');
  assert.equal(sample({surfaceView:2.01}),null,'near threshold and frame depth keep their small physical tolerance');
  assert.equal(sample({eye:[d.centreX+d.width*.5+.01,eye[1],eye[2]]}),null,'the jamb and adjacent wall are never included');
  assert.equal(sample({eye:[d.centreX,r.floor+d.height+.01,eye[2]]}),null,'the lintel remains real architecture');
  assert.equal(sample({ray:[0,-1,-1],surfaceView:1.65}),null,'a downward view keeps the threshold floor before the plane');
  assert.equal(sample({eye:[d.centreX,eye[1],d.doorZ-1],ray:[0,0,1],forward:[0,0,1]}),null,'outside lookback retains the real remembered room');
  assert.equal(sample({frame:{...f,proper:true}}),null,'the aperture override cannot affect later Source');
});
