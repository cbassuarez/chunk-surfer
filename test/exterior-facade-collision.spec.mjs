import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {parseGlb,meshFingerprint} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';
import {EXTERIOR_COLLISION_ASSETS} from '../tools/chunk_surfer/build-exterior-collision.mjs';
import {EXTERIOR_COLLISION_GEOMETRY,EXTERIOR_COLLISION_SOURCE} from '../src/data/generated/exterior-collision.js';
import {exteriorFacadeCanOccupy,exteriorFacadeCanStep} from '../src/world/exterior-facade-collision.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {districtLogicalAt} from '../src/data/exterior-district.js';
import {EXTERIOR_PUB,pubLogicalAt} from '../src/data/exterior-pub.js';

const pack=parseGlb(fs.readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url)));
const openingPack=parseGlb(fs.readFileSync(new URL('../public/assets/opening-street.glb',import.meta.url)));
const sourcePacks=new Map([['public/assets/conservatory-props.glb',pack],['public/assets/opening-street.glb',openingPack]]);
const sourceFor=name=>{
  const spec=EXTERIOR_COLLISION_ASSETS.find(source=>source.meshes.includes(name));
  assert.ok(spec,`${name} has an authoritative collision asset source`);
  if(!sourcePacks.has(spec.asset))sourcePacks.set(spec.asset,parseGlb(fs.readFileSync(new URL(`../${spec.asset}`,import.meta.url))));
  return sourcePacks.get(spec.asset);
};
FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
const instances=PROPS.renderInstances({inscriptions:false}).filter(p=>EXTERIOR_COLLISION_GEOMETRY[p.mesh]);
const instance=id=>{const p=instances.find(i=>i.id===id);assert.ok(p,id);return p;};
const step=(from,to,list=instances,extra={})=>exteriorFacadeCanStep({from:{feet:0,...from},to:{feet:0,...to},...extra},list);
const body=p=>{const q=FP.logicalToPhysical(p[0],p[1]);return{x:(q.x+.5)*.5,z:(q.z+.5)*.5,feet:q.y};};

// Deliberately independent of the collision generator: intersect the player's
// eye-height walk segment with original GLB triangles, not generated walls.
const originalTriangles=new Map();
function originalMeshTriangles(name){
  if(originalTriangles.has(name))return originalTriangles.get(name);
  const source=sourceFor(name);
  const mesh=source.json.meshes.find(m=>m.name===name),triangles=[];
  const read=id=>{
    const a=source.json.accessors[id],v=source.json.bufferViews[a.bufferView],components=a.type==='SCALAR'?1:3;
    const size={5126:4,5125:4,5123:2,5121:1}[a.componentType],method={5126:'readFloatLE',5125:'readUInt32LE',5123:'readUInt16LE',5121:'readUInt8'}[a.componentType];
    const offset=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||components*size;
    return Array.from({length:a.count},(_,i)=>Array.from({length:components},(_,j)=>source.bin[method](offset+i*stride+j*size)));
  };
  for(const p of mesh.primitives){const points=read(p.attributes.POSITION),indices=read(p.indices).flat();for(let i=0;i<indices.length;i+=3)triangles.push(indices.slice(i,i+3).map(k=>points[k]));}
  originalTriangles.set(name,triangles);return triangles;
}
const subtract=(a,b)=>a.map((v,i)=>v-b[i]);
const cross3=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
function originalTriangleCrossing(from,to,placed){
  const c=Math.cos(placed.yaw||0),s=Math.sin(placed.yaw||0),scale=placed.scale||1;
  const local=p=>{const dx=p.x-placed.x,dz=p.z-placed.z;return[(dx*c+dz*s)/(scale*(placed.scaleX??1)),((p.feet||0)+1.45-(placed.y||0))/(scale*(placed.scaleY??1)),(-dx*s+dz*c)/(scale*(placed.scaleZ??1))];};
  const origin=local(from),direction=subtract(local(to),origin);
  return originalMeshTriangles(placed.mesh).some(([a,b,c])=>{
    const e1=subtract(b,a),e2=subtract(c,a),p=cross3(direction,e2),det=dot(e1,p);if(Math.abs(det)<1e-9)return false;
    const tvec=subtract(origin,a),u=dot(tvec,p)/det;if(u<0||u>1)return false;
    const q=cross3(tvec,e1),v=dot(direction,q)/det;if(v<0||u+v>1)return false;
    const distance=dot(e2,q)/det;return distance>1e-6&&distance<1-1e-6;
  });
}

test('collision freshness follows exact selected mesh bytes, independently of unrelated props',()=>{
  assert.equal(EXTERIOR_COLLISION_SOURCE.meshCount,10);
  for(const[name,data]of Object.entries(EXTERIOR_COLLISION_GEOMETRY)){
    const source=sourceFor(name);
    assert.equal(data.sha256,meshFingerprint(source,source.json.meshes.find(m=>m.name===name)),`${name}: rebuild exterior collision after changing this actual mesh`);
    assert.ok(data.walls.length+data.triangles.length>0);
    const meshIndex=source.json.meshes.findIndex(m=>m.name===name);
    for(const node of source.json.nodes.filter(n=>n.mesh===meshIndex)){
      assert.deepEqual(node.translation??[0,0,0],[0,0,0]);assert.deepEqual(node.rotation??[0,0,0,1],[0,0,0,1]);assert.deepEqual(node.scale??[1,1,1],[1,1,1]);
      assert.equal(node.matrix,undefined,'authored source nodes remain baked before the placed-instance transform');
    }
  }
});

test('the actual standalone service sheet blocks a sweep only when its optional pack is visible',()=>{
  const a=[167.5,489],b=[167.5,490],from=body(a),to=body(b),placed=instance('opening-street-service-history');
  assert.ok(FP.canStep(...a,...b,{keys:new Set()}).ok);
  assert.ok(originalTriangleCrossing(from,to,placed),'the original rusty sheet crosses a real half-metre eye segment');
  assert.equal(step(from,to,[placed]).ok,false);
  PROPS.setColliderGroupEnabled('opening-street',false);
  assert.equal(PROPS.propCanOccupy(...b,{from:{x:a[0],y:a[1]}}),true,'unloaded optional material receiver leaves no invisible wall');
  assert.equal(PROPS.propCanOccupy(193,533,{from:{x:192,y:533}}),false,'mandatory original Ellery skin remains solid');
  try{
    PROPS.setColliderGroupEnabled('opening-street',true);
    assert.equal(PROPS.propCanOccupy(...b,{from:{x:a[0],y:a[1]}}),false,'a visible sheet refuses an actual continuous crossing');
    assert.equal(PROPS.propCanOccupy(...b),true,'both endpoints can stand clear of this thin surface; the sweep catches it');
  }finally{PROPS.setColliderGroupEnabled('opening-street',false);}
});

const regressions=[
  ['west school projection','bay-west-elevation',[192,533],[193,533]],
  ['east institutional bay','bay-west-elevation',[355,680],[354,680]],
  ['east court side wall','district-east-court-walls',[400,716],[400,717]],
  ['west court side wall','district-west-court-walls',[60,732],[60,733]],
  ['north court side wall','district-north-court-walls',[260,632],[261,632]],
];
for(const[label,id,a,b]of regressions)test(`the original GLB ${label} blocks an admitted half-metre plan step`,()=>{
  const from=body(a),to=body(b);
  assert.ok(FP.canStep(...a,...b,{keys:new Set()}).ok,'the original logical floor admits this real step');
  assert.ok(originalTriangleCrossing(from,to,instance(id)),'the real rendered wall crosses the centred player eye segment');
  assert.equal(step(from,to,[instance(id)]).ok,false,'the placed source surface refuses that crossing');
  assert.equal(step(to,from,[instance(id)]).ok,false,'the crossing is solid from both sides');
  assert.equal(PROPS.propCanOccupy(b[0],b[1],{from:{x:a[0],y:a[1]}}),false,'production movement applies the centred physical sweep');
  assert.equal(PROPS.propCanOccupy(a[0],a[1],{from:{x:b[0],y:b[1]}}),false,'production reverse movement cannot cross either');
});

test('all four court mouths and centre walks remain open through the exact shared skins',()=>{
  for(const[from,to]of[
    [{x:-14,z:24},{x:-29.5,z:24}], [{x:142,z:16},{x:162.5,z:16}],
    [{x:78,z:-14},{x:78,z:-27.5}], [{x:86,z:106},{x:86,z:122.5}],
  ])assert.equal(step({...from,feet:.12},{...to,feet:.12}).ok,true,JSON.stringify({from,to}));
});

test('both actual pub apertures and the loading-bay goods mouth remain clear',()=>{
  for(const d of EXTERIOR_PUB.doors){
    const x=d.x,from={x,z:EXTERIOR_PUB.frontWorldZ-.5,feet:.12},to={x,z:EXTERIOR_PUB.frontWorldZ+1.25,feet:.12};
    assert.equal(originalTriangleCrossing(from,to,instance('pub-complete-frontage')),false,'the original pub aperture contains no static wall');
    assert.equal(step(from,to).ok,true,'ordinary dynamic doors retain sole ownership of their openings');
  }
  const from={x:48,z:7.5,feet:-.85},to={x:51,z:7.5,feet:0};
  assert.equal(originalTriangleCrossing(from,to,instance('bay-west-elevation')),false,'the original goods mouth is an actual source opening');
  assert.equal(step(from,to).ok,true);
});

test('production body collision retains ordinary movement through both real pub doors',()=>{
  const at=(x,z)=>{const p=pubLogicalAt(x-.25,z-.25);return{x:p.x*2,y:p.y*2};};
  for(const door of EXTERIOR_PUB.doors){
    FP.setDoorOpen(door.id,true);
    const route=Array.from({length:5},(_,i)=>at(door.x,EXTERIOR_PUB.frontWorldZ-.5+i*.5));
    for(let i=1;i<route.length;i++){
      const previous=route[i-1],next=route[i];
      assert.ok(FP.canStep(previous.x,previous.y,next.x,next.y,{keys:new Set()}).ok,`${door.id}: actual open throat`);
      assert.equal(PROPS.propCanOccupy(next.x,next.y,{from:previous}),true,`${door.id}: source-derived collision leaves the real opening free`);
      assert.equal(PROPS.propCanOccupy(previous.x,previous.y,{from:next}),true,`${door.id}: ordinary exit remains clear`);
    }
  }
});

test('the ordinary perimeter street stays open on all four sides',()=>{
  const ring=[{x:-7,z:-7},{x:135,z:-7},{x:135,z:99},{x:-7,z:99},{x:-7,z:-7}];
  for(let i=1;i<ring.length;i++)assert.equal(step({...ring[i-1],feet:0},{...ring[i],feet:0}).ok,true,`street ${i}`);
});

test('continuous swept body contact rejects a thin wall even with clear endpoints',()=>{
  const placed=instance('bay-west-elevation'),from={x:45.9,z:66.75,feet:0},to={x:47.3,z:66.75,feet:0};
  assert.equal(originalTriangleCrossing(from,to,placed),true);
  assert.equal(step(from,to,[placed],{radius:0}).ok,false,'a longer accepted step cannot tunnel through the source face');
});

test('body height excludes toes and overhead fabric and respects actual instance transforms',()=>{
  const placed=instance('district-west-row-a');
  assert.equal(exteriorFacadeCanOccupy({x:-12,z:24,feet:0,height:1.7},[placed]).ok,true,'court bridge stays overhead');
  assert.equal(exteriorFacadeCanOccupy({x:-12,z:24,feet:30,height:1.7},[placed]).ok,true,'a ground facade never blocks an unrelated higher floor');
  const shifted={...instance('bay-west-elevation'),x:150,z:107.5,y:10,scale:2,yaw:Math.PI/2};
  // Original local school face(-3.4,59.25) becomes world(31.5,100.7).
  assert.equal(step({x:31.5,z:100,feet:10},{x:31.5,z:101.2,feet:10},[shifted]).ok,false,'matrix applies actual anchor, rotation, scale and floor');
});

test('fixed local buckets keep an ordinary walking query bounded',()=>{
  // Warm indexes before timing; these are operation counts plus an intentionally
  // loose smoke ceiling, not a frame-rate claim on a contended workstation.
  step({x:-7,z:0},{x:-7,z:.5});
  const started=performance.now();
  for(let i=0;i<500;i++)assert.equal(step({x:-7,z:(i%100)*.5},{x:-7,z:(i%100)*.5+.5}).ok,true);
  assert.ok(performance.now()-started<10000,'500 ordinary half-metre queries must not scan every source triangle');
});
