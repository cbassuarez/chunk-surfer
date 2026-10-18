import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRoofPalatialIronwork,ROOF_PALATIAL_IRONWORK as contract} from '../tools/chunk_surfer/roof-palatial-ironwork.mjs';
import {buildRoofFormalPromenades,ROOF_FORMAL_PROMENADES} from '../tools/chunk_surfer/roof-formal-promenade.mjs';

const shapes=[];
const result=buildRoofPalatialIronwork({m:{},roofQuietIron:0,oldBronze:1,
  addBeam(_,...args){shapes.push({kind:'beam',args});},addQuad(_,...args){shapes.push({kind:'quad',args});}});
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>{const l=Math.hypot(...v);return v.map(x=>x/l);};
const vertices=shape=>{
  if(shape.kind==='quad')return shape.args.slice(0,4);
  const[a,b,w]=shape.args,u=unit(sub(b,a)),ref=Math.abs(u[1])<.9?[0,1,0]:[1,0,0],s=unit(cross(u,ref)),t=cross(s,u);
  return[a,b].flatMap(p=>[-1,1].flatMap(q=>[-1,1].map(r=>p.map((v,i)=>v+s[i]*q*w/2+t[i]*r*w/2))));
};
test('the south lantern foundry crest has genuine open scrolls above player headroom',()=>{
  const points=shapes.flatMap(vertices);
  assert.ok(points.length>1000);
  for(const[x,y,z]of points){
    assert.ok(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z));
    assert.ok(Math.abs(x)<=contract.halfWidth&&y>=contract.minY&&y<=contract.maxY);
    assert.ok(Math.abs(z-contract.z)<.10,'all iron belongs to the existing south lantern rib');
  }
  assert.ok(points.some(p=>p[0]<-3.7)&&points.some(p=>p[0]>3.7),'large counter-curves read across the lantern');
  assert.ok(points.some(p=>p[1]>4.2),'the forged crown is legible against the open sky');
  assert.equal(result.newMaterials,0);
  assert.equal(result.newMeshes,0);
  const actual=shapes.reduce((n,s)=>n+(s.kind==='beam'?12:2),0);
  assert.equal(result.triangles,actual);
  assert.ok(actual<=contract.maximumTriangles);
  assert.ok(shapes.every(s=>[0,1].includes(s.args.at(-1))),'reuse only quiet iron and existing bronze');
});

test('the rosette forecourts tessellate the actual existing stone area with no hidden glass overlay',()=>{
  const quads=[],materials=[];
  buildRoofFormalPromenades({m:{},materials,addQuad(_,...args){quads.push(args);}});
  let total=0;
  const counts=new Map(ROOF_FORMAL_PROMENADES.map(p=>[p.id,0]));
  for(const q of quads){
    const p=q.slice(0,4),a=p[0],b=p[1],c=p[2],d=p[3];
    assert.ok(p.every(v=>v[1]===.032&&v.every(Number.isFinite)));
    const triangle=(a,b,c)=>cross(sub(b,a),sub(c,a))[1]/2;
    const area=triangle(a,b,c)+triangle(a,c,d);
    assert.ok(triangle(a,b,c)>0&&triangle(a,c,d)>0,'both actual triangles face upward without degeneracy');
    const field=ROOF_FORMAL_PROMENADES.find(f=>p.every(v=>v[0]>=f.x-f.w/2-1e-8&&v[0]<=f.x+f.w/2+1e-8&&v[2]>=f.z-f.d/2-1e-8&&v[2]<=f.z+f.d/2+1e-8));
    assert.ok(field,'every piece remains on an existing promenade, outside central glass');
    counts.set(field.id,counts.get(field.id)+area);total+=area;
  }
  for(const f of ROOF_FORMAL_PROMENADES)assert.ok(Math.abs(counts.get(f.id)-f.w*f.d)<1e-8,`${f.id} stone area is conserved`);
  assert.ok(Math.abs(total-125.5)<1e-8);
  assert.ok(quads.length<400,'broad inlays retain a bounded surface budget');
});
