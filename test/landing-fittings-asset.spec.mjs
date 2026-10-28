import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {CORRIDOR_LETTERING_FACES} from '../src/data/corridor-lettering.js';
import {LANDING_FITTING_REAR_PLANES,LANDING_FITTING_ENVELOPES} from '../tools/chunk_surfer/build-landing-fittings.mjs';

const root=new URL('../',import.meta.url),read=file=>fs.readFileSync(new URL(file,root));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const pack=read('public/assets/conservatory-landing-fittings.glb');
const stats=JSON.parse(read('public/assets/conservatory-landing-fittings.stats.json'));
const credits=JSON.parse(read('public/assets/conservatory-landing-fittings.credits.json'));
const doc=await new NodeIO().readBinary(pack),meshes=doc.getRoot().listMeshes();
const byName=new Map(meshes.map(mesh=>[mesh.getName(),mesh]));
const close=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((s,n,k)=>s+n*b[k],0),sub=(a,b)=>a.map((n,k)=>n-b[k]);
function triangles(mesh,part){
  const primitive=mesh.listPrimitives().find(p=>p.getMaterial().getName()===part.material);
  assert.ok(primitive,part.material);
  const positions=primitive.getAttribute('POSITION').getArray(),indices=primitive.getIndices(),out=[];
  for(let t=part.startTriangle;t<part.startTriangle+part.triangles;t++)
    out.push([0,1,2].map(n=>{const v=indices.getScalar(t*3+n);return [0,1,2].map(a=>positions[v*3+a]);}));
  return out;
}
const overlaps=(a,b)=>[0,1,2].every(k=>a.min[k]<=b.max[k]+1e-7&&b.min[k]<=a.max[k]+1e-7);

test('the small isolated replacement pack binds exact hashes and preserves shared source assets',()=>{
  assert.deepEqual([...byName.keys()].sort(),Object.keys(LANDING_FITTING_REAR_PLANES).sort());
  assert.equal(stats.sha256,hash(pack));assert.equal(credits.pack.sha256,hash(pack));
  assert.equal(stats.bytes,pack.length);assert.equal(credits.pack.bytes,pack.length);
  assert.ok(stats.totalTriangles>500&&stats.totalTriangles<4000);
  for(const[file,expected]of Object.entries(stats.sourceSha256))assert.equal(hash(read(file)),expected,file);
  for(const[file,expected]of Object.entries(stats.protectedSha256))assert.equal(hash(read(file)),expected,file);
  assert.equal(doc.getRoot().listTextures().length,0,'existing glyph atlas is reused outside this pack');
  assert.ok(doc.getRoot().listMaterials().every(m=>!m.getDoubleSided()),'closed solids need no hidden backface workaround');
});

test('sign faces and local origin remain exact while the real rear board supplies a wall plane',()=>{
  const panel=CORRIDOR_LETTERING_FACES.landing;
  for(const node of doc.getRoot().listNodes()){
    assert.deepEqual(node.getTranslation(),[0,0,0]);assert.deepEqual(node.getRotation(),[0,0,0,1]);assert.deepEqual(node.getScale(),[1,1,1]);
  }
  for(const[name,mesh]of byName){
    const m=stats.meshes[name],rear=LANDING_FITTING_REAR_PLANES[name],extras=mesh.getExtras();
    assert.equal(extras.frontAxis,'-z');assert.deepEqual(extras.localOrigin,[0,0,0]);
    assert.deepEqual(extras.letteringFace,panel);assert.deepEqual(stats.letteringFace,panel);
    assert.equal(m.rearContact.coordinate,rear);assert.deepEqual(m.rearContact.normal,[0,0,1]);
    const carrier=m.parts.find(p=>p.id==='original-sign-panel'),board=m.parts.find(p=>p.id==='continuous-backboard');
    for(let k=0;k<3;k++){
      close(carrier.bounds.min[k],panel.panelCenter[k]-panel.panelSize[k]/2);
      close(carrier.bounds.max[k],panel.panelCenter[k]+panel.panelSize[k]/2);
    }
    close(board.bounds.max[2],rear);close(board.bounds.max[0]-board.bounds.min[0],3.02,2e-7);
    const rearTriangles=triangles(mesh,board).filter(tri=>tri.every(p=>Math.abs(p[2]-rear)<1e-7));
    assert.equal(rearTriangles.length,2,'continuous planar masonry contact, not isolated feet');
    const area=rearTriangles.reduce((s,[a,b,c])=>s+Math.hypot(...cross(sub(b,a),sub(c,a)))/2,0);
    close(area,3.02*.40,2e-7);
    const standoffs=m.parts.filter(p=>p.role==='integral-panel-standoff');assert.equal(standoffs.length,4);
    for(const stand of standoffs){assert.ok(overlaps(stand.bounds,board.bounds));assert.ok(overlaps(stand.bounds,carrier.bounds));}
    for(const foot of m.parts.filter(p=>p.role==='lamp-wall-foot'))assert.ok(overlaps(foot.bounds,board.bounds));
    for(const part of m.parts.filter(p=>p.role.startsWith('localized-'))){
      const b=part.bounds;
      assert.ok(b.max[2]>panel.center[2]+.001||b.min[0]>panel.widthM/2||b.max[0]<-panel.widthM/2
        ||b.min[1]>panel.center[1]+panel.heightM/2||b.max[1]<panel.center[1]-panel.heightM/2,
      `${part.id} must leave the central ink rectangle intact`);
    }
  }
});

test('every actual closed part has consistent outward winding, finite unit normals and truthful bounds',()=>{
  let triangleCount=0;
  for(const[name,mesh]of byName){
    const actual={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
    for(const primitive of mesh.listPrimitives()){
      const p=primitive.getAttribute('POSITION').getArray(),n=primitive.getAttribute('NORMAL').getArray(),ids=primitive.getIndices().getArray();
      assert.equal(p.length,n.length);assert.ok([...p,...n].every(Number.isFinite));
      for(let i=0;i<p.length;i+=3){close(Math.hypot(n[i],n[i+1],n[i+2]),1,1e-6);for(let k=0;k<3;k++){actual.min[k]=Math.min(actual.min[k],p[i+k]);actual.max[k]=Math.max(actual.max[k],p[i+k]);}}
      for(let i=0;i<ids.length;i+=3){const v=[0,1,2].map(k=>Array.from(p.slice(ids[i+k]*3,ids[i+k]*3+3))),normal=cross(sub(v[1],v[0]),sub(v[2],v[0]));
        assert.ok(Math.hypot(...normal)>1e-12);assert.ok(dot(normal,Array.from(n.slice(ids[i]*3,ids[i]*3+3)))>0);triangleCount++;}
    }
    assert.deepEqual(actual,stats.meshes[name].bounds);
    const envelope=LANDING_FITTING_ENVELOPES[name];for(let k=0;k<3;k++){assert.ok(actual.min[k]>=envelope.min[k]-1e-7);assert.ok(actual.max[k]<=envelope.max[k]+1e-7);}
    for(const part of stats.meshes[name].parts){
      const edges=new Map(),key=p=>p.map(v=>Math.round(v*1e8)).join(',');let volume=0;
      for(const[a,b,c]of triangles(mesh,part)){
        volume+=dot(a,cross(b,c))/6;
        for(const[u,v]of[[a,b],[b,c],[c,a]]){const x=key(u),y=key(v),id=[x,y].sort().join('|'),edge=edges.get(id)||{count:0,balance:0};edge.count++;edge.balance+=x<y?1:-1;edges.set(id,edge);}
      }
      assert.ok(volume>0,part.id+' outward volume');
      for(const edge of edges.values())assert.deepEqual(edge,{count:2,balance:0},part.id+' closed, coherently wound edges');
    }
  }
  assert.equal(triangleCount,stats.totalTriangles);
});
