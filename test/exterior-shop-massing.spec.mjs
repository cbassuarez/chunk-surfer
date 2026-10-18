import test from 'node:test';
import assert from 'node:assert/strict';
import {addSouthShopDeed,SOUTH_SHOP_MASSING as C} from '../tools/chunk_surfer/exterior-shop-massing.mjs';

function build(){
 const shapes=[],materials=[],m={name:'district_civic_frontage'};
 const api={materials,addBox(owner,center,size,material){shapes.push({kind:'box',center,size,material});},addBeam(owner,a,b,width,material){shapes.push({kind:'beam',a,b,width,material});},addCylinder(owner,center,radius,height,material,sides){shapes.push({kind:'cylinder',center,radius,height,material,sides});},addQuad(owner,a,b,c,d,material){shapes.push({kind:'quad',points:[a,b,c,d],material});}};
 const reports=C.deeds.map(deed=>addSouthShopDeed(api,m,{deed,z:-28+deed*8,h:[12.8,12.8,14.6,14.6,11.8,13.2,13.2,11.6][deed]}));
 return{reports,shapes,materials,api,m};
}
function corners(p){
 if(p.kind==='quad')return p.points;
 if(p.kind==='box'){const out=[];for(const x of[-1,1])for(const y of[-1,1])for(const z of[-1,1])out.push(p.center.map((v,i)=>v+[x,y,z][i]*p.size[i]/2));return out;}
 if(p.kind==='beam'){const out=[];for(const q of[p.a,p.b])for(const x of[-1,1])for(const y of[-1,1])for(const z of[-1,1])out.push(q.map((v,i)=>v+[x,y,z][i]*p.width/Math.SQRT2));return out;}
 const out=[];for(const x of[-1,1])for(const y of[-1,1])for(const z of[-1,1])out.push([p.center[0]+x*p.radius,p.center[1]+y*p.height/2,p.center[2]+z*p.radius]);return out;
}
const contains=(p,q)=>p.kind==='box'&&q.every((v,i)=>Math.abs(v-p.center[i])<=p.size[i]/2+1e-7);
const normal=([a,b,c])=>{const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);return[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];};
const area=([a,b,c])=>{const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);return Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;};

test('six shops stay in their original deeds and actual volumes; pub/sign carriers remain outside helper bounds',()=>{
 const{reports}=build();let total=0;
 for(const r of reports){
  total+=r.triangles;assert.ok(r.triangles<=C.maximumTrianglesPerDeed);
  for(const p of r.parts)for(const[x,y,z]of corners(p)){
   assert.ok(Number.isFinite(x+y+z));
   assert.ok(x>=-5.4-1e-7&&x<=C.frontProjection,`deed${r.deed} part${p.id} x${x}`);
   assert.ok(z>=r.centreZ-4-1e-7&&z<=r.centreZ+4+1e-7,`deed${r.deed} part${p.id} z${z}`);
   assert.ok(z>=C.protectedPub.z1-1e-7,'no geometry enters either pub deed or its sign carriers');
   assert.ok(y>=-1e-7&&y<=r.height+3.2,'roof and attached stacks retain the bounded pre-existing height range');
  }
  const body=r.parts.find(p=>p.id==='occupied-back-volume');
  assert.equal(body.size[0],5.4-C.wallDepth);assert.equal(body.size[1],r.height);
  assert.ok(contains(body,[-5.3,r.height/2,r.centreZ]),'occupied upper structure has real lot depth');
  assert.equal(r.parts.filter(p=>p.id.startsWith('party-return-')).length,2,'both lot boundaries have real returns');
 }
 assert.ok(total<=C.maximumTriangles);assert.equal(total,8832);
});

test('display and upper-window apertures are holes in the front masonry with real shallow depth',()=>{
 const{reports}=build();
 for(const r of reports){
  const masonry=r.parts.filter(p=>p.id.startsWith('split-front-'));
  const display=r.apertures.find(a=>a.id==='recessed-shop-display');
  for(const aperture of r.apertures)for(const fraction of[.2,.5,.8]){
   const q=[-.10,(aperture.y0+aperture.y1)/2,r.centreZ+aperture.z0+(aperture.z1-aperture.z0)*fraction];
   assert.equal(masonry.some(p=>contains(p,q)),false,`${aperture.id} is not merely painted on a solid facade`);
  }
  assert.ok(display.z1-display.z0>4,'large traditional display is proportioned against the 1.1m doorway');
  const back=r.parts.find(p=>p.id==='display-back'),mullion=r.parts.find(p=>p.id==='display-mullion--0.71');
  assert.ok(mullion.center[0]-back.center[0]>.30,'deep shadow and actual joinery separate display from its rear plane');
  assert.equal(r.parts.filter(p=>p.id.startsWith('display-stock-')).length,4,'display back plane is broken by quiet physical objects');
  const door=r.parts.find(p=>p.id==='closed-door-leaf');assert.equal(door.size[2],C.closedDoorWidth);
  assert.ok(contains(door,[-.145,1.43,r.centreZ+(r.deed%2?-1:1)*2.7]),'shop door remains physically closed');
  for(const aperture of r.apertures.filter(a=>a.id.startsWith('upper-'))){
   const backing=r.parts.find(p=>p.id===aperture.id+'-back'),frame=r.parts.find(p=>p.id===aperture.id+'-frame--1');
   assert.ok(frame.center[0]-backing.center[0]>.25,'sash sits ahead of actual recessed upper glazing');
  }
 }
});

test('roof planes form deliberate full-depth silhouettes; gable caps have no degenerate triangles',()=>{
 const{reports}=build();assert.equal(new Set(reports.map(r=>r.roof)).size,2);
 for(const r of reports){
  const planes=r.parts.filter(p=>p.kind==='quad'&&p.id.startsWith('roof-'));assert.equal(planes.length,2);
  for(const p of r.parts.filter(p=>p.kind==='quad')){
   assert.ok(area(p.points.slice(0,3))>.0001&&area([p.points[0],p.points[2],p.points[3]])>.0001,'every exported quad contains two proper triangles');
  }
  for(const p of planes)assert.ok(normal(p.points)[1]>0,'roof faces the sky for correct lighting');
  for(const p of r.parts.filter(p=>p.kind==='quad'&&p.id.startsWith('front-gable')))assert.ok(normal(p.points)[0]>0,'front masonry faces the street');
  for(const p of r.parts.filter(p=>p.kind==='quad'&&p.id.startsWith('back-gable')))assert.ok(normal(p.points)[0]<0,'back masonry faces away from the street');
  for(const side of[-1,1])for(const p of r.parts.filter(p=>p.kind==='quad'&&p.id.startsWith('party-roof-gable-'+side+'-')))assert.ok(normal(p.points)[2]*side>0,'party gable faces outside its lot');
  assert.ok(r.parts.some(p=>p.id==='roof-ridge'));
  const stack=r.parts.find(p=>p.id==='attached-chimney-stack');
  if(stack){assert.ok(stack.center[0]<-3);assert.ok(stack.center[1]-stack.size[1]/2<r.height+1.5,'chimney extends down into its roof rather than floating above it');}
  const pipe=r.parts.find(p=>p.id==='downpipe');assert.ok(pipe.center[1]-pipe.height/2<.05&&pipe.center[1]+pipe.height/2>r.height-.3,'rainwater goods span the actual storeys');
 }
});

test('geometry is deterministic, reuses ordinary palette and rejects pub/other footprint inputs',()=>{
 const a=build(),b=build();assert.deepEqual(a.reports,b.reports);assert.deepEqual(a.shapes,b.shapes);
 assert.ok(a.reports.slice(1).every(r=>r.newMaterials===0));
 assert.ok(a.materials.every(m=>!m.alphaMode&&!m.extras&&!m.pbrMetallicRoughness.baseColorTexture),'no alpha, renderer category or texture dependency');
 for(const deed of[0,1,8])assert.throws(()=>addSouthShopDeed(a.api,a.m,{deed,z:-28+deed*8,h:12.8}));
 assert.throws(()=>addSouthShopDeed(a.api,a.m,{deed:2,z:-12,h:14.6,depth:8}));
 assert.throws(()=>addSouthShopDeed(a.api,a.m,{deed:2,z:-11,h:14.6}));
});
