import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {CONSERVATORY_PROPS} from '../src/data/conservatory-props.js';
import {ARRIVAL_COURT as C,ARRIVAL_COURT_COLLIDERS} from '../src/data/arrival-court.js';
import {OPENING_STREET_PROPS} from '../src/data/opening-street.js';
import {pubExteriorLogicalAt} from '../src/data/exterior-pub.js';
import {buildArrivalCourt} from '../tools/chunk_surfer/arrival-court-geometry.mjs';
import {parseGlb} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';
import {readExteriorAccessor} from '../tools/chunk_surfer/build-exterior-collision.mjs';
import {courtyardWalk} from './helpers/exterior-pub-route.mjs';
FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
const body=(x,z)=>({x:(50+x)*2-.5,y:(200+z)*2-.5});
const vec=({x,y})=>[x,y];
const rendered=()=>PROPS.renderInstances({inscriptions:false});
const pack=parseGlb(fs.readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url)));
function record(){
  const materials=[],shapes=[];const api={materials,mesh:name=>({name})};
  for(const kind of['Box','Beam','Quad'])api['add'+kind]=(owner,...args)=>shapes.push({kind,mesh:owner.name,args});
  const result=buildArrivalCourt(api);return{materials,shapes,result};
}
const cross=(a,b,c)=>{const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);return[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];};

test('actual old bench geometry crosses the north wire sheet, and the real old drive collider blocks its promised road',()=>{
  const mesh=pack.json.meshes.find(m=>m.name==='district_bench');let crossings=0;
  for(const primitive of mesh.primitives){
    const vertices=readExteriorAccessor(pack,primitive.attributes.POSITION).map(([x,y,z])=>[21.5+z,y+.02,1.5-x]);
    const indices=readExteriorAccessor(pack,primitive.indices).flat();
    for(let i=0;i<indices.length;i+=3){
      const tri=indices.slice(i,i+3).map(n=>vertices[n]),cuts=[];
      for(let k=0;k<3;k++){const a=tri[k],b=tri[(k+1)%3],da=a[2]-1.5,db=b[2]-1.5;if(da*db<0){const t=da/(da-db);cuts.push(a.map((v,j)=>v+(b[j]-v)*t));}}
      if(cuts.length>=2&&cuts.some(([x,y])=>x>=21&&x<=45&&y>=.125&&y<=2.175))crossings++;
    }
  }
  assert.ok(crossings>0,'the regression starts with a real mesh intersection, not a guessed box');
  const from=body(19.25,7.25),to=body(19.75,7.25);
  assert.equal(FP.canStep(from.x,from.y,to.x,to.y).ok,true);
  try{
    PROPS.propsInit(FP,[{id:'old-drive-crossing-fence',mesh:'yard_fence_run',x:70,y:210,yaw:0,scale:1,blocks:true}]);
    assert.equal(PROPS.propCanOccupy(to.x,to.y,{from}),false,'old x20 fence rejects the ordinary road step');
  }finally{PROPS.propsInit(FP);}
  assert.equal(PROPS.propCanOccupy(to.x,to.y,{from}),true,'the current single boundary leaves the same real step open');
});

test('one connected civic boundary replaces both conflicting fences and preserves the literal gate opening',()=>{
  assert.equal(PROPS.propById('yard-fence-west'),null);assert.equal(PROPS.propById('yard-fence-north'),null);
  const gate=rendered().find(p=>p.id==='yard-gate-piers');assert.equal(gate.mesh,C.meshes.boundary);
  assert.deepEqual([gate.x,gate.z],[27.5,7.5]);assert.ok(Math.abs(C.opening.z1-C.opening.z0-C.opening.width)<1e-9);
  for(const z of[5.75,6.25,7.25,8.25,9.25])for(let x=20.75;x<=30.25;x+=.5){
    const a=body(x-.5,z),b=body(x,z);
    assert.equal(FP.canStep(a.x,a.y,b.x,b.y).ok,true,`actual grade ${x},${z}`);
    assert.equal(PROPS.propCanOccupy(b.x,b.y,{from:a}),true,`clear drive ${x},${z}`);
  }
  for(const[x,z]of[[27.5,3.25],[27.5,16.25],[34.5,1.5]]){const p=body(x,z);assert.equal(PROPS.propCanOccupy(p.x,p.y),false,'visible wall/rail has a real individual body');}
  assert.equal(ARRIVAL_COURT_COLLIDERS.some(c=>c.physical.width>5&&c.physical.depth>5),false,'no single blocking box seals the whole L-shaped assembly');
});

test('ordinary accepted movement still reaches the lodge, both bay stair approaches and both pub doors',()=>{
  const start=[conservatory.spawn.x*2,conservatory.spawn.y*2],window=vec(body(25.75,14.25));
  assert.ok(courtyardWalk(FP,PROPS,start,window),'van-side start reaches unchanged public window');
  for(const target of[body(45.75,4.75),body(45.75,10.75)])assert.ok(courtyardWalk(FP,PROPS,window,vec(target)),'public window reaches real bay stair approach through the actual open gate');
  for(const id of['pub-west-entry','pub-east-entry']){const p=pubExteriorLogicalAt(id),goal=[Math.floor(p.x*2),Math.floor(p.y*2)];assert.ok(courtyardWalk(FP,PROPS,start,goal),id);}
  const lodge=CONSERVATORY_PROPS.find(p=>p.id==='yard-booth');
  assert.deepEqual([lodge.x,lodge.y,lodge.yaw],[74,214,-Math.PI/2]);assert.deepEqual(lodge.inspectAt,{x:75.7,y:214});assert.equal(lodge.action,'gate-lodge');
  for(const id of['yard-booth-interior','yard-booth-practicals','yard-booth-glazing','yard-booth-guard-idle','yard-booth-guard-ledger','yard-booth-guard-handoff','yard-booth-handoff']){
    const p=CONSERVATORY_PROPS.find(p=>p.id===id);assert.deepEqual([p.x,p.y,p.yaw],[74,214,-Math.PI/2],id);
  }
});

test('only the two original arrival benches use fitted iron/oak seating, with clear fronts and a clear central path',()=>{
  const seats=OPENING_STREET_PROPS.filter(p=>p.mesh===C.meshes.bench);assert.equal(seats.length,2);
  for(const spec of C.benches){const p=rendered().find(p=>p.id===spec.id);assert.deepEqual([p.x,p.z,p.yaw],[spec.x,spec.z,spec.yaw]);
    const front={x:Math.sin(p.yaw),z:-Math.cos(p.yaw)};assert.ok(front.x*(19-p.x)>0,'seat opens toward the middle path');
    const blocked=body(spec.x,spec.z),stand=body(spec.x+front.x,spec.z+front.z);assert.equal(PROPS.propCanOccupy(blocked.x,blocked.y),false,'a real bench body cannot be walked through');assert.equal(PROPS.propCanOccupy(stand.x,stand.y),true,'standing in front is clear');
  }
  for(const x of[18.25,18.75,19.25,19.75])for(const z of[.25,.75,1.25,1.75,2.25,2.75]){const p=body(x,z);assert.equal(PROPS.propCanOccupy(p.x,p.y),true,`central path ${x},${z}`);}
  const laurel=rendered().find(p=>p.id==='opening-street-park-laurel');assert.deepEqual([laurel.x,laurel.z],[13.75,1.25]);
  const vegetation=parseGlb(fs.readFileSync(new URL('../public/assets/vegetation.glb',import.meta.url))),mesh=vegetation.json.meshes.find(m=>m.name==='opening_park_laurel'),c=Math.cos(laurel.yaw),s=Math.sin(laurel.yaw);
  const points=mesh.primitives.flatMap(p=>readExteriorAccessor(vegetation,p.attributes.POSITION)).map(([x,y,z])=>[laurel.x+x*c-z*s,y,laurel.z+x*s+z*c]);
  assert.ok(Math.max(...points.map(p=>p[0]))<15,'actual canopy clears both bench and x18..20 route');
});

test('ornament is open geometry, cap quads have sound winding, and the placed assemblies stay within budget',()=>{
  const {materials,shapes,result}=record();assert.ok(result.placedTriangles<=16000);assert.equal(result.placedTriangles,result.meshes[C.meshes.boundary].triangles+2*result.meshes[C.meshes.bench].triangles);
  assert.ok(materials.every(m=>!m.alphaMode&&!m.emissiveFactor&&m.pbrMetallicRoughness.baseColorFactor[3]===1));
  assert.ok(!materials.some(m=>/wire|glass|barbed/i.test(m.name)));
  for(const shape of shapes.filter(s=>s.kind==='Quad')){const[a,b,c,d]=shape.args;assert.ok(Math.hypot(...cross(a,b,c))>1e-10);assert.ok(Math.hypot(...cross(a,c,d))>1e-10);}
  const seat=result.parts.filter(p=>p.id.startsWith('bench-oak-seat-slat-'));assert.equal(seat.length,5);assert.ok(Math.abs(Math.max(...seat.map(p=>p.center[1]+p.size[1]/2))-.47215)<.001,'actual supporting oak top stays near the460mm sitting datum');
  assert.ok(result.parts.some(p=>p.id.includes('limestone-cope'))&&result.parts.some(p=>p.id.includes('scroll'))&&result.parts.some(p=>p.id.includes('fixing'))&&result.parts.some(p=>p.id.includes('mineral-foot')));
  const lower=result.parts.find(p=>p.id==='gate-north-panel-0-s-left-lower-tie'),upper=result.parts.find(p=>p.id==='gate-north-panel-0-s-left-upper-tie');assert.equal(lower.b[1],C.iron.bottom);assert.equal(upper.b[1],C.iron.top,'scroll load paths physically join the panel rails');
});
