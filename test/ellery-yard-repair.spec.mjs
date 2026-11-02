import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ELLERY_PUBLIC_FRONT as C,ELLERY_YARD_HERO_REPAIR as R,ELLERY_PUBLIC_FRONT_REVISION as REV} from '../src/data/ellery-public-front.js';
import {elleryMassingAt} from '../src/data/exterior-district.js';
import {heroConnectedParts,heroPartRepair,repairHeroYard,appendHeroRainwaterConnections} from '../tools/chunk_surfer/ellery-yard-repair.mjs';

const source=process.env.ELLERY_PUBLIC_SOURCE_PACK||new URL('../public/assets/conservatory-props.glb',import.meta.url),io=new NodeIO();
const sourceBytes=fs.readFileSync(source),nativeBytes=fs.readFileSync(new URL('../public/assets/ellery-public-front.glb',import.meta.url));
const original=await io.readBinary(sourceBytes),fixed=await io.readBinary(sourceBytes),native=await io.readBinary(nativeBytes);
const mesh=doc=>doc.getRoot().listMeshes().find(m=>m.getName()===C.hero.mesh);
const before=mesh(original),changed=mesh(fixed),submitted=mesh(native),analysis=heroConnectedParts(before);
const receipt=repairHeroYard(fixed,changed,fixed.getRoot().listBuffers()[0]);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const near=(a,b,e=2e-5)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const world=p=>[p[0]+C.hero.anchor.x,p[1],p[2]+C.hero.anchor.z];
const attributes=(primitive,index)=>['POSITION','NORMAL','TEXCOORD_0'].map(name=>primitive.getAttribute(name).getElement(index,[]));
const triangles=mesh=>mesh.listPrimitives().flatMap(primitive=>{const ids=primitive.getIndices().getArray(),out=[];for(let i=0;i<ids.length;i+=3)out.push({material:primitive.getMaterial().getName(),vertices:[ids[i],ids[i+1],ids[i+2]].map(index=>attributes(primitive,index))});return out;});
const key=t=>JSON.stringify([t.material,t.vertices]);
const nativeTriangles=new Map();for(const t of triangles(submitted)){const k=key(t);nativeTriangles.set(k,(nativeTriangles.get(k)||0)+1);}
const sub=(a,b)=>a.map((v,k)=>v-b[k]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0);
function rayTriangle(o,d,a,b,c){const e1=sub(b,a),e2=sub(c,a),h=cross(d,e2),det=dot(e1,h);if(Math.abs(det)<1e-9)return null;const inv=1/det,s=sub(o,a),u=inv*dot(s,h);if(u<0||u>1)return null;const q=cross(s,e1),v=inv*dot(d,q);if(v<0||u+v>1)return null;const t=inv*dot(e2,q);return t>1e-5?t:null;}
function rayHits(mesh,origin,direction,limit){const hits=[];for(const t of triangles(mesh)){const distance=rayTriangle(origin,direction,...t.vertices.map(v=>world(v[0])));if(distance!==null&&distance<limit)hits.push({distance,material:t.material});}return hits.sort((a,b)=>a.distance-b.distance);}
const box=p=>({min:p.center.map((v,k)=>v-p.size[k]/2),max:p.center.map((v,k)=>v+p.size[k]/2)});
const overlaps=(a,b)=>a.min.every((v,k)=>v<=b.max[k]+1e-5&&a.max[k]>=b.min[k]-1e-5);

test('the original backstage assemblies move rigidly with every cap, index, split normal and UV retained',()=>{
  const moved=receipt.parts.filter(p=>p.repair.kind==='backstage');
  assert.equal(moved.length,39);assert.equal(moved.reduce((n,p)=>n+p.triangles,0),420);
  assert.equal(receipt.parts.filter(p=>p.repair.kind==='pipe').length,2);
  assert.equal(receipt.addedTriangles,0,'moving existing assemblies does not replace their closed geometry');
  const parts=new Map(receipt.parts.map(p=>[p.id,p.repair]));let untouched=0,movedVertices=0;
  for(const[index,row]of analysis.primitives.entries()){
    const source=row.primitive,target=changed.listPrimitives()[index];
    assert.deepEqual(target.getIndices().getArray(),source.getIndices().getArray(),'no face, cap, triangle winding or seam is removed');
    assert.deepEqual(target.getAttribute('TEXCOORD_0').getArray(),source.getAttribute('TEXCOORD_0').getArray());
    for(let vertex=0;vertex<row.parts.length;vertex++){
      const repair=parts.get(row.parts[vertex]),position=source.getAttribute('POSITION').getElement(vertex,[]),normal=source.getAttribute('NORMAL').getElement(vertex,[]);
      const actual=target.getAttribute('POSITION').getElement(vertex,[]),actualNormal=target.getAttribute('NORMAL').getElement(vertex,[]);
      if(!repair){assert.deepEqual(actual,position);assert.deepEqual(actualNormal,normal);untouched++;continue;}
      movedVertices++;
      const expected=position.map((v,k)=>Math.fround(v*(k===1?repair.scaleY||1:1)+(repair.translation[k]||0)));
      assert.deepEqual(actual,expected);
      if(repair.kind==='backstage')assert.deepEqual(actualNormal,normal,'rigid translation cannot alter a split surface normal');
      else{const transformed=[normal[0],normal[1]/repair.scaleY,normal[2]],length=Math.hypot(...transformed);actualNormal.forEach((v,k)=>near(v,transformed[k]/length,1e-6));}
    }
    const ids=source.getIndices().getArray();
    for(let i=0;i<ids.length;i+=3){if(!parts.has(row.parts[ids[i]]))continue;
      const t={material:target.getMaterial().getName(),vertices:[ids[i],ids[i+1],ids[i+2]].map(v=>attributes(target,v))};
      assert.ok(nativeTriangles.get(key(t))>0,'the final dedicated pack contains the entire transformed source triangle, with original winding and UV');
    }
  }
  assert.ok(untouched>10000&&movedVertices>400);
  // The two large brick solids are closed in the source. All twelve faces'
  // triangles above must remain in the final pack, not just their street side.
  const brickVolumes=moved.filter(p=>p.materials.includes('ellery red brick')&&p.triangles===12&&p.max[1]-p.min[1]>8);
  assert.equal(brickVolumes.length,2);
  for(const part of moved){near(part.after.min[0]-part.min[0],7.2);near(part.after.max[0]-part.max[0],7.2);assert.equal(part.after.min[1],part.min[1]);assert.equal(part.after.max[1],part.max[1]);assert.ok(part.after.min[0]+C.hero.anchor.x>49.1);}
});

test('actual generated geometry clears the garden corridor that the original backstage faces obstructed',()=>{
  const clear=R.backstage.clearPhysical;let negativeControls=0;
  for(const z of[30.2,35,38.5,43,48.5,51.5])for(const y of[.35,1.1,1.8]){
    const origin=[clear.x0+.01,y,z],limit=clear.x1-origin[0];
    if(rayHits(before,origin,[1,0,0],limit).length)negativeControls++;
    assert.deepEqual(rayHits(submitted,origin,[1,0,0],limit),[],`body-height air is open across the garden corridor at z${z},y${y}`);
  }
  assert.ok(negativeControls>=12,'negative control: these same measured rays meet real source geometry');
  assert.ok(receipt.parts.filter(p=>p.repair.kind==='backstage').some(p=>p.min[0]+C.hero.anchor.x<43),'the original westward range really occupied the public yard');
});

test('both original rainwater pipes meet their own roof datums and the final fittings form supported chains to gullies',()=>{
  const extras=submitted.getExtras(),connections=extras.rainwaterConnections?.parts;
  assert.equal(extras.publicFrontRevision,REV);assert.ok(connections?.length>=20);
  const actual=heroConnectedParts(submitted),find=id=>connections.find(p=>p.id===id);
  for(const pipe of R.pipes){
    const band=elleryMassingAt(pipe.worldZ);assert.equal(pipe.roofHeight,band.height);
    const body=[...actual.parts.values()].filter(p=>p.materials.length===1&&p.materials[0]==='painted steel'
      &&Math.abs((p.min[0]+p.max[0])/2+C.hero.anchor.x-pipe.worldX)<1e-4
      &&Math.abs((p.min[2]+p.max[2])/2+C.hero.anchor.z-pipe.worldZ)<1e-4
      &&Math.abs(p.min[1])<1e-4&&Math.abs(p.max[1]-pipe.height)<1e-4);
    assert.equal(body.length,1,'one original cylindrical pipe survives in the generated pack');
    const bounds={min:world(body[0].min),max:world(body[0].max)};
    assert.ok(bounds.max[1]<band.height&&band.height-bounds.max[1]<.11,'the pipe stops below its own roof rather than a global fixed height');
    assert.ok(rayHits(before,[49.2,band.height+.1,pipe.worldZ],[1,0,0],2).some(hit=>hit.material==='chapel stone'),'independent source geometry contains the associated parapet/coping datum');
    for(const fitting of connections.filter(p=>p.id.startsWith(pipe.id+'-wall-clamp-'))){
      assert.ok(overlaps(box(fitting),bounds),'the clamp grips the actual pipe body');
      const wall=rayHits(before,[49.2,fitting.center[1],pipe.worldZ],[1,0,0],2)[0];assert.ok(wall);
      assert.ok(box(fitting).max[0]>=49.2+wall.distance,'the clamp reaches the actual source wall skin');
    }
    const hopper=box(find(pipe.id+'-hopper')),neck=box(find(pipe.id+'-roof-neck')),shoe=box(find(pipe.id+'-shoe')),gully=box(find(pipe.id+'-gully-frame'));
    assert.ok(overlaps(hopper,bounds)&&overlaps(neck,hopper),'head and roof neck form one physical connection');
    assert.ok(hopper.max[1]<=band.height+.001&&neck.max[1]<band.height);
    assert.ok(overlaps(shoe,bounds)&&overlaps(shoe,gully),'the shoe reaches the receiving gully');
    assert.ok(gully.max[1]<.06,'the ground fitting cannot become an invisible body-height obstacle');
    const bars=connections.filter(p=>p.id.startsWith(pipe.id+'-gully-bar-'));assert.equal(bars.length,5);
    assert.ok(bars.every(p=>overlaps(box(p),gully)));
  }
  assert.ok(R.pipes[0].sourceHeight-elleryMassingAt(R.pipes[0].worldZ).height>4,'negative control: the old service pipe projected substantially above its roof');
});

test('new fitting faces have finite unit outward normals and the shared source pack remains byte-for-byte unchanged',async()=>{
  const doc=await io.readBinary(sourceBytes),m=mesh(doc),oldCount=m.listPrimitives().length;
  appendHeroRainwaterConnections(doc,m,doc.getRoot().listBuffers()[0]);
  for(const primitive of m.listPrimitives().slice(oldCount)){
    const pos=primitive.getAttribute('POSITION'),norm=primitive.getAttribute('NORMAL'),ids=primitive.getIndices().getArray();
    for(let i=0;i<ids.length;i+=3){const ps=[ids[i],ids[i+1],ids[i+2]].map(k=>pos.getElement(k,[])),n=norm.getElement(ids[i],[]),geometric=cross(sub(ps[1],ps[0]),sub(ps[2],ps[0]));assert.ok(ps.flat().every(Number.isFinite));near(Math.hypot(...n),1,1e-6);assert.ok(dot(geometric,n)>1e-8,'the face winding points toward its declared outward normal');}
  }
  const stats=JSON.parse(fs.readFileSync(new URL('../public/assets/ellery-public-front.stats.json',import.meta.url)));
  assert.equal(stats.revision,REV);assert.equal(sha(nativeBytes),stats.sha256);
  assert.equal(sha(sourceBytes),stats.sourcePack.sha256);assert.equal(stats.sourcePack.unchangedDuringBuild,true);
  assert.equal(sha(fs.readFileSync(source)),sha(sourceBytes),'repair analysis and isolated generation never write the shared pack');
});

