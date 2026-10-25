import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseGlb} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';
import {readExteriorAccessor} from '../tools/chunk_surfer/build-exterior-collision.mjs';
import {ARRIVAL_COURT as C} from '../src/data/arrival-court.js';
import {buildArrivalCourt} from '../tools/chunk_surfer/arrival-court-geometry.mjs';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {YARD_RANGE_FRONTAGES} from '../src/data/yard-range-frontages.js';
import {YARD_SERVICE_RANGES} from '../src/data/exterior-district.js';
const pack=parseGlb(fs.readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url)));
const points=name=>{
  const mesh=pack.json.meshes.find(m=>m.name===name);assert.ok(mesh,`rebuild global prop pack for ${name}`);
  return mesh.primitives.flatMap(p=>readExteriorAccessor(pack,p.attributes.POSITION));
};
const world=(ps,at,yaw=0)=>{const c=Math.cos(yaw),s=Math.sin(yaw);return ps.map(([x,y,z])=>[at.x+x*c-z*s,at.y+y,at.z+x*s+z*c]);};
const bounds=ps=>({min:[0,1,2].map(i=>Math.min(...ps.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...ps.map(p=>p[i])))});
const cross=(a,b,c)=>{const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);return[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];};

test('built boundary and both oak seats stay physically separate from each other and the retained tree canopy',()=>{
  const boundary=bounds(world(points(C.meshes.boundary),{x:C.origin.x,y:0,z:C.origin.z}));
  for(const seat of C.benches){const b=bounds(world(points(C.meshes.bench),{x:seat.x,y:.02,z:seat.z},seat.yaw));assert.ok(b.max[0]<boundary.min[0]-.5,'actual bench vertices stay on the public side, without any triangle intersection');assert.ok(b.min[1]<.03&&b.max[1]<1.12);}
  const treePack=parseGlb(fs.readFileSync(new URL('../public/assets/opening-street.glb',import.meta.url))),tree=treePack.json.meshes.find(m=>m.name==='opening_street_tree_small');
  const b=bounds(world(tree.primitives.flatMap(p=>readExteriorAccessor(treePack,p.attributes.POSITION)),{x:24,y:.02,z:1},-.24));
  assert.ok(b.max[0]<boundary.min[0]-1,'the actual retained canopy is fully public-side as well');
});

test('actual packed surfaces have outward source normals and the literal drive aperture contains no body-height geometry',()=>{
  let total=0;
  for(const name of Object.values(C.meshes)){
    const mesh=pack.json.meshes.find(m=>m.name===name);assert.ok(mesh,name);let triangles=0;
    for(const p of mesh.primitives){const v=readExteriorAccessor(pack,p.attributes.POSITION),n=readExteriorAccessor(pack,p.attributes.NORMAL),indices=readExteriorAccessor(pack,p.indices).flat();triangles+=indices.length/3;
      for(const normal of n)assert.ok(Math.abs(Math.hypot(...normal)-1)<2e-5,`${name}: real source normal remains unit length`);
      for(let i=0;i<indices.length;i+=3){const ids=indices.slice(i,i+3),normal=cross(...ids.map(id=>v[id])),area=Math.hypot(...normal);assert.ok(area>1e-10,'no zero-area source triangles');assert.ok(ids.reduce((sum,id)=>sum+normal.reduce((s,x,k)=>s+x*n[id][k],0),0)>0,'visible source winding and normals agree');}
    }
    total+=triangles*(name===C.meshes.bench?2:1);
  }
  assert.ok(total<=16000,'budget includes both real seat instances');
  const physical=world(points(C.meshes.boundary),{x:C.origin.x,y:0,z:C.origin.z});
  for(const[x,y,z]of physical)if(y>.08&&y<1.9)assert.ok(z<=C.opening.z0+1e-6||z>=C.opening.z1-1e-6,'nothing projects into the4.6m drive at body height');
  // Producer and packed triangle counts agree; no stale shape can pass merely
  // because it fits the same broad placement bounds.
  const report=buildArrivalCourt({materials:[],mesh:name=>({name}),addBox(){},addBeam(){},addQuad(){}});
  assert.equal(total,report.placedTriangles);
});

test('the trimmed real hedge clears the caretaker window eye band while retaining its walking collision',()=>{
  FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
  const poses=PROPS.renderInstances({inscriptions:false}),hedge=poses.find(p=>p.id==='yard-hedge-near');
  const range=poses.find(p=>p.id==='yard-former-stables'),spec=YARD_RANGE_FRONTAGES.find(p=>p.id===range.id);
  const opening=spec.openings.find(p=>p.id==='caretaker-window'),mass=YARD_SERVICE_RANGES.find(p=>p.id===range.id);
  const mesh=pack.json.meshes.find(m=>m.name===hedge.mesh);assert.ok(mesh,'the assertion reads the actual packed hedge');
  const transformed=(p,scaleY)=>{
    const c=Math.cos(hedge.yaw),s=Math.sin(hedge.yaw),scale=hedge.scale||1;
    const x=p[0]*scale*(hedge.scaleX??1),z=p[2]*scale*(hedge.scaleZ??1);
    return[hedge.x+x*c-z*s,hedge.y+p[1]*scale*scaleY,hedge.z+x*s+z*c];
  };
  const triangles=scaleY=>mesh.primitives.flatMap(primitive=>{
    const vertices=readExteriorAccessor(pack,primitive.attributes.POSITION),ids=readExteriorAccessor(pack,primitive.indices).flat(),out=[];
    for(let i=0;i<ids.length;i+=3)out.push(ids.slice(i,i+3).map(n=>transformed(vertices[n],scaleY)));
    return out;
  });
  const old=triangles(1),current=triangles(hedge.scaleY??1),sill=range.y+opening.y0;
  assert.ok(Math.max(...current.flat().map(p=>p[1]))<sill-.04,'the real foliage crown stays below the sill, not merely below the middle of the glass');
  // Segment/triangle intersection against the actual original foliage. This
  // reproduces the screen obstruction from a legal ordinary courtyard stand.
  const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),crossV=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const hits=(eye,target,triangle)=>{
    const[a,b,c]=triangle,d=sub(target,eye),e1=sub(b,a),e2=sub(c,a),h=crossV(d,e2),det=dot(e1,h);if(Math.abs(det)<1e-9)return false;
    const s=sub(eye,a),u=dot(s,h)/det;if(u<0||u>1)return false;
    const q=crossV(s,e1),v=dot(d,q)/det;if(v<0||u+v>1)return false;
    const t=dot(e2,q)/det;return t>0&&t<1;
  };
  const runtime=[148,436],body=FP.logicalToPhysical(...runtime),eye=[(body.x+.5)*.5,FP.floorAt(...runtime)+1.58,(body.z+.5)*.5];
  assert.equal(FP.isSolid(...runtime),false);assert.equal(PROPS.propCanOccupy(...runtime),true,'the broad courtyard observation stand is genuinely occupiable');
  let oldObstructed=0;
  for(const y of[1.35,1.58,1.85,2.10])for(const across of[.15,.35,.65,.85]){
    const target=[range.x-mass.w/2,range.y+y,range.z+opening.z+opening.width*(across-.5)];
    if(old.some(tri=>hits(eye,target,tri)))oldObstructed++;
    assert.equal(current.some(tri=>hits(eye,target,tri)),false,'actual scaled foliage leaves every sampled eye-band ray clear');
  }
  assert.ok(oldObstructed>0,'the same packed foliage at the old height really blocked the opening');
  const bodyProp=PROPS.propById(hedge.id);
  assert.equal(PROPS.propCanOccupy(bodyProp.rx,bodyProp.ry),false,'trimming the crown does not permit walking through the planted bed');
  assert.equal(PROPS.propCanOccupy(bodyProp.rx,bodyProp.ry,{ignoreId:hedge.id}),true,'the retained hedge body is the collision, rather than an unrelated blocker');
  for(const p of[[152,428],[155,414]])assert.equal(PROPS.propCanOccupy(...p),true,'lodge window and gate approach remain clear');
  assert.equal(poses.find(p=>p.id==='yard-hedge-far').scaleY,undefined,'the outer hedge retains its height');
});
