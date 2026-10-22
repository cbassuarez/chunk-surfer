import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {conservatory as C} from '../src/data/floorplan/conservatory.js';
import {MAIN_STAIR_GEOMETRY as STAIR} from '../src/data/main-stair-geometry.js';
import * as FP from '../src/world/floorplan.js';

FP.compile(C.levels,{width:C.width,height:C.height,widenCorridors:C.widenCorridors,
  connectors:C.connectors,edgePortals:C.edgePortals,doors:C.doors});

test('every academic stair exit lane continues into the loggia beyond the portal',()=>{
  const exit=FP.edgePortalState().find(p=>p.id==='academic-floor-landing-to-loggia');
  assert.equal(exit.pairs.length,4,'the arrival retains a two-metre clear mouth');
  for(const pair of exit.pairs){
    let {x,y}=pair.to;
    const slice=FP.physicalRenderPlanFor(x,y);
    for(let step=0;step<10;step++){
      const next=FP.canStep(x,y,x-1,y);
      assert.equal(next.ok,true,`exit lane ${pair.to.y} is blocked ${step/2}m beyond its seam: ${next.why}`);
      assert.ok(Math.abs(next.floor-10)<.001,'the west apron remains on the academic floor');
      x--;
      const p=FP.logicalToPhysical(x,y),i=(Math.floor(p.z)-slice.originY)*slice.w+Math.floor(p.x)-slice.originX;
      assert.equal(slice.solid[i],0,'the final depth slice must show the same open route');
      assert.ok(Math.abs(slice.floor[i]-10)<.001,'the visible route has the real landing height');
    }
  }
});

test('the turned landing mouth stays south of the open well and inside the existing landing',()=>{
  const exit=FP.edgePortalState().find(p=>p.id==='academic-floor-landing-to-loggia');
  for(const pair of exit.pairs){
    const p=FP.logicalToPhysical(pair.from.x,pair.from.y);
    assert.ok(p.z/2>=37.5&&p.z/2<39.5,'the westward route clears the inner well rather than crossing it');
  }
});

const bytes=readFileSync(process.env.CS_STAIR_TEST_ASSET||new URL('../public/assets/conservatory-main-stair.glb',import.meta.url));
const jl=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+jl)),bin=28+jl;
const read=(index)=>{
  const a=gltf.accessors[index],v=gltf.bufferViews[a.bufferView],n=a.type==='VEC3'?3:1;
  const fn=a.componentType===5126?'readFloatLE':'readUInt32LE',start=bin+(v.byteOffset||0)+(a.byteOffset||0);
  return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,k)=>bytes[fn](start+i*n*4+k*4)));
};
const surfaces=[];
for(const mesh of gltf.meshes)for(const primitive of mesh.primitives){
  const p=read(primitive.attributes.POSITION),normals=read(primitive.attributes.NORMAL),ids=read(primitive.indices).flat();
  for(let i=0;i<ids.length;i+=3)surfaces.push({
    material:gltf.materials[primitive.material].name,
    p:ids.slice(i,i+3).map(index=>p[index]),n:ids.slice(i,i+3).map(index=>normals[index]),
  });
}
function verticalHit({p:[a,b,c]},x,z){
  const den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
  if(Math.abs(den)<1e-10)return null;
  const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den;
  const v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den;
  if(u<-.00001||v<-.00001||u+v>1.00001)return null;
  return u*a[1]+v*b[1]+(1-u-v)*c[1];
}

test('packed concrete retains structural depth below every tread centre',()=>{
  const undersides=surfaces.filter(s=>s.material==='cast concrete'&&s.n.every(n=>n[1]<-.2));
  const failed=[];
  for(const f of STAIR.flights)for(let i=0;i<f.rises;i++){
    const a=f.theta0+f.sweep*(i+.5)/f.rises,r=(STAIR.innerRadiusM+STAIR.outerRadiusM)/2;
    const top=f.fromH+(f.toH-f.fromH)*i/f.rises;
    const hits=undersides.map(t=>verticalHit(t,Math.sin(a)*r,-Math.cos(a)*r)).filter(y=>y!==null&&y<top-.001);
    const underside=Math.max(...hits);
    if(!Number.isFinite(underside)||top-underside<STAIR.slabDepthM-.0001)failed.push({flight:f.id,tread:i,top,underside});
  }
  assert.deepEqual(failed,[],'pitched concrete cannot taper to paper-thin wedges beneath the noses');
});

test('packed academic head has a level westward surface rather than a bare terminal nose',()=>{
  const floor=surfaces.filter(s=>s.material==='warm terrazzo'&&s.n.every(n=>n[1]>.9));
  for(const x of[-1.3,-.8,0,.8,1.8])for(const z of[1.6,2.1,2.6]){
    const y=Math.max(...floor.map(t=>verticalHit(t,x,z)).filter(y=>y!==null&&y<10.02));
    assert.ok(Math.abs(y-10.008)<.0001,`turned apron is missing at local (${x},${z}): ${y}`);
  }
});

test('finished hero stair remains one bounded static pack',()=>{
  assert.equal(gltf.meshes.length,1,'the architectural repair adds no prop dispatches');
  assert.equal(gltf.meshes[0].primitives.length,6,'material draw batches remain unchanged');
  const triangles=gltf.meshes[0].primitives.reduce((n,p)=>n+gltf.accessors[p.indices].count/3,0);
  assert.ok(triangles<=40000,'the continuous rails and turned head have a fixed triangle budget');
  assert.ok(bytes.length<1851504,'the packed repair stays smaller than its original 1.85MB GLB');
});
