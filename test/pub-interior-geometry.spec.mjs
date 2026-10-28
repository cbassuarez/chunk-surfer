import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPubInterior,PUB_INTERIOR_LAYOUT as layout,PUB_FURNITURE_COLLIDERS,PUB_LIGHT_ANCHORS} from '../tools/chunk_surfer/pub-interior-geometry.mjs';
import {EXTERIOR_PUB} from '../src/data/exterior-pub.js';
import {PUB_INTERIOR_LAYOUT as runtimeLayout,PUB_FURNITURE_COLLIDERS as runtimeColliders,PUB_LIGHT_ANCHORS as runtimeLights} from '../src/data/exterior-pub-furnishings.js';

const EPS=1e-8;
const sharedNames=['dark wood','worn wood','brass','black lacquer','ivory','oxidised bronze','dull terracotta','academic plaster','municipal glazed brick'];
const seed=()=>sharedNames.map(name=>({name,pbrMetallicRoughness:{baseColorFactor:[.2,.2,.2,1]}}));
const triangles=s=>s.kind==='quad'?2:s.kind==='cylinder'?s.args[4]*4:12;
function record(materials=seed()){
  const shapes=[],meshes=[],api={materials,mesh(name){const m={name};meshes.push(m);return m;}};
  for(const kind of['Box','Beam','Cylinder','Quad'])api[`add${kind}`]=(m,...args)=>shapes.push({owner:m.name,kind:kind.toLowerCase(),args});
  const report=buildPubInterior(api);
  let cursor=0;
  const byFixture=new Map(report.fixtures.map(f=>{
    const group=[];let count=0;
    while(count<f.triangles){const shape=shapes[cursor++];group.push(shape);count+=triangles(shape);}
    assert.equal(count,f.triangles,'reported fixture boundaries align with emitted primitive geometry');
    return[f.id,group];
  }));
  assert.equal(cursor,shapes.length);
  return{api,shapes,meshes,report,byFixture};
}
function localPoints({kind,args}){
  if(kind==='quad')return args.slice(0,4);
  if(kind==='box'){
    const[c,s,,yaw=0]=args,out=[],co=Math.cos(yaw),si=Math.sin(yaw);
    for(const x of[-s[0]/2,s[0]/2])for(const y of[-s[1]/2,s[1]/2])for(const z of[-s[2]/2,s[2]/2])out.push([c[0]+x*co-z*si,c[1]+y,c[2]+x*si+z*co]);
    return out;
  }
  if(kind==='cylinder'){
    const[c,r,h,,sides]=args,out=[];
    for(let i=0;i<sides;i++)for(const y of[-h/2,h/2])out.push([c[0]+Math.cos(i/sides*Math.PI*2)*r,c[1]+y,c[2]+Math.sin(i/sides*Math.PI*2)*r]);
    return out;
  }
  const[a,b,w]=args,v=b.map((q,i)=>q-a[i]),len=Math.hypot(...v),u=v.map(q=>q/len),ref=Math.abs(u[1])<.9?[0,1,0]:[1,0,0];
  const cross=(p,q)=>[p[1]*q[2]-p[2]*q[1],p[2]*q[0]-p[0]*q[2],p[0]*q[1]-p[1]*q[0]];
  const side=cross(u,ref),sideLen=Math.hypot(...side),s=side.map(q=>q/sideLen),t=cross(s,u),out=[];
  for(const p of[a,b])for(const ds of[-1,1])for(const dt of[-1,1])out.push(p.map((q,i)=>q+s[i]*ds*w/2+t[i]*dt*w/2));
  return out;
}
const rowPoints=s=>localPoints(s).map(p=>p.map((v,i)=>v+[layout.meshOriginInRow.x,layout.meshOriginInRow.y,layout.meshOriginInRow.z][i]));
function bounds(s){const p=rowPoints(s);return{min:[0,1,2].map(i=>Math.min(...p.map(v=>v[i]))),max:[0,1,2].map(i=>Math.max(...p.map(v=>v[i])))};}
const parts=(out,kind)=>out.report.parts.filter(part=>part.kind===kind);
const partShapes=(out,part)=>out.shapes.slice(part.primitiveStart,part.primitiveStart+part.primitiveCount);
function partBounds(out,part){const points=partShapes(out,part).flatMap(rowPoints);return{min:[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...points.map(p=>p[i])))};}
const boxesIntersect=(a,b)=>a.min.every((value,i)=>value<b.max[i]-EPS&&a.max[i]>b.min[i]+EPS);
const overlap=(s,r,y0=.035,y1=2.2)=>{
  const b=bounds(s);return b.min[0]<r.x1-EPS&&b.max[0]>r.x0+EPS&&b.min[2]<r.z1-EPS&&b.max[2]>r.z0+EPS&&b.min[1]<y1-EPS&&b.max[1]>y0+EPS;
};
function assertClear(out,r,label){for(const[f,shapes]of out.byFixture)for(const s of shapes)assert.equal(overlap(s,r),false,`${label}: ${f} ${s.kind}`);}

test('runtime and render consume one frozen row-coordinate furnishings contract',()=>{
  assert.equal(layout,runtimeLayout);assert.equal(PUB_FURNITURE_COLLIDERS,runtimeColliders);assert.equal(PUB_LIGHT_ANCHORS,runtimeLights);
  assert.ok(Object.isFrozen(layout.furniture[0].bounds));assert.ok(Object.isFrozen(PUB_FURNITURE_COLLIDERS[0].min));
  const out=record();
  assert.deepEqual(out.report.colliders,runtimeColliders);assert.deepEqual(out.report.lightAnchors,runtimeLights);
  assert.equal(out.meshes.length,1);assert.equal(out.meshes[0].name,'exterior_pub_interior');
  // The installed prop origin and row transform agree at several asymmetric points.
  for(const[x,z]of[[-5.2,-31.2],[-.2,-22.75],[-2.7,-17.25]]){
    const lx=x-layout.meshOriginInRow.x,lz=z-layout.meshOriginInRow.z,co=Math.cos(layout.worldTransform.yaw),si=Math.sin(layout.worldTransform.yaw);
    assert.ok(Math.abs(layout.worldTransform.anchorX+lx*co-lz*si-(EXTERIOR_PUB.rowAnchor.x+z))<EPS);
    assert.ok(Math.abs(layout.worldTransform.anchorZ+lx*si+lz*co-(EXTERIOR_PUB.rowAnchor.z-x))<EPS);
  }
});

test('every emitted primitive fits the existing shell, floor and ceiling after recentering',()=>{
  const out=record(),r=layout.bounds;
  for(const s of out.shapes){
    assert.equal(s.owner,layout.mesh);
    for(const[x,y,z]of rowPoints(s)){
      assert.ok(Number.isFinite(x+y+z));
      assert.ok(x>=r.x0-EPS&&x<=r.x1+EPS,`existing depth x=${x}`);
      assert.ok(z>=r.z0-EPS&&z<=r.z1+EPS,`existing deeds z=${z}`);
      assert.ok(y>=-EPS&&y<=layout.ceilingLocalY+EPS,`floor-to-ceiling y=${y}`);
    }
    if(s.kind==='box')assert.ok(s.args[1].every(n=>n>0));
    if(s.kind==='beam')assert.ok(Math.hypot(...s.args[1].map((v,i)=>v-s.args[0][i]))>0);
  }
});

test('two actual entrance routes and the continuous public and staff aisles remain clear below head height',()=>{
  const out=record();
  assert.equal(layout.doorways.length,2);assert.deepEqual(layout.doorways.map(d=>d.z),[-30.75,-22.75]);
  for(const d of layout.doorways){assert.equal(d.width,1.95);assertClear(out,d.clear,'main entry');}
  assert.ok(layout.publicAisle.clearWidth>=1.4);
  assert.equal(layout.publicAisle.x1-layout.publicAisle.x0,layout.publicAisle.clearWidth);
  assertClear(out,layout.publicAisle,'continuous public aisle');
  assertClear(out,layout.staffAisle,'staff working aisle');assertClear(out,layout.staffReturn,'counter end access');
  assert.ok(layout.staffAisle.clearWidth>=.88,'the actual staff gap is stated accurately');
  for(const c of PUB_FURNITURE_COLLIDERS){
    const r=layout.publicAisle;
    assert.equal(c.min[0]<r.x1-EPS&&c.max[0]>r.x0+EPS&&c.min[2]<r.z1-EPS&&c.max[2]>r.z0+EPS,false,`${c.id} runtime footprint stays out of public aisle`);
  }
});

test('collision envelopes contain the real furniture rather than descriptive placeholder dimensions',()=>{
  const out=record();
  assert.equal(PUB_FURNITURE_COLLIDERS.length,layout.furniture.length);
  for(const collider of PUB_FURNITURE_COLLIDERS){
    const shapes=out.byFixture.get(collider.id);assert.ok(shapes?.length);
    for(const s of shapes)for(const p of rowPoints(s))for(let i=0;i<3;i++)assert.ok(p[i]>=collider.min[i]-EPS&&p[i]<=collider.max[i]+EPS,`${collider.id} axis${i}: ${p[i]} within collision envelope`);
  }
});

test('joinery part receipts describe the actual emitted primitive bounds',()=>{
  const out=record();assert.ok(out.report.parts.length>80);
  for(const part of out.report.parts){
    assert.ok(part.primitiveCount>0,part.id);
    assert.ok(out.byFixture.has(part.fixtureId),part.id);
    const actual=partBounds(out,part);
    for(const key of['min','max'])for(let i=0;i<3;i++)assert.ok(Math.abs(actual[key][i]-part[key][i])<EPS,`${part.id} ${key}${i}`);
  }
});

test('all shelf bottles stand on real shelves in clear bays beneath the cornice',()=>{
  const out=record(),bottles=parts(out,'shelf-bottle'),stiles=parts(out,'shelf-stile').map(p=>partBounds(out,p)).sort((a,b)=>a.min[2]-b.min[2]);
  const shelves=parts(out,'shelf-surface').map(p=>partBounds(out,p)),cornice=partBounds(out,parts(out,'shelf-cornice')[0]);
  assert.equal(bottles.length,42);assert.equal(stiles.length,4);assert.equal(shelves.length,3);
  const heights=new Set();let labels=0;
  for(const part of bottles){
    const b=partBounds(out,part),shelf=shelves[part.row],shapes=partShapes(out,part),cylinders=shapes.filter(s=>s.kind==='cylinder');
    heights.add((b.max[1]-b.min[1]).toFixed(5));
    assert.ok(Math.abs(b.min[1]-shelf.max[1])<EPS,`${part.id} foot meets the actual shelf`);
    assert.ok(b.min[0]>=shelf.min[0]&&b.max[0]<=shelf.max[0],`${part.id} is supported across its full foot`);
    assert.ok(b.min[2]>stiles[part.bay].max[2]+.10&&b.max[2]<stiles[part.bay+1].min[2]-.10,`${part.id} retains visible bay clearance`);
    for(const stile of stiles)assert.equal(boxesIntersect(b,stile),false,`${part.id} cannot pierce an upright`);
    assert.ok(b.max[1]<=cornice.min[1]-.015,`${part.id} cap clears the cornice`);
    assert.ok(cylinders.length>=4,`${part.id} has a distinct foot, body, neck and cap`);
    const cap=cylinders.find(s=>s.args[3]===out.report.materials.black),glass=cylinders.filter(s=>[out.report.materials.bottleGreen,out.report.materials.bottleBrown].includes(s.args[3]));
    assert.ok(cap&&glass.length>=3);assert.ok(bounds(cap).min[1]<=Math.max(...glass.map(s=>bounds(s).max[1]))+EPS,`${part.id} cap meets its neck`);
    labels+=cylinders.filter(s=>s.args[3]===out.report.materials.ivory).length;
  }
  assert.equal(heights.size,4,'four legible bottle proportions replace the uniform peg row');
  assert.ok(labels>0&&labels<=14,'sparse blank bands leave most bottle shoulders and bodies visible');
});

test('banquette plinths meet parquet and chairs keep their real seats beneath framed backs',()=>{
  const out=record(),floor=layout.floorFinish.topY;
  assert.equal(parts(out,'banquette-plinth').length,2);
  for(const p of parts(out,'banquette-plinth')){
    const b=partBounds(out,p);assert.ok(Math.abs(b.min[1]-floor)<EPS);assert.ok(b.max[1]>=.04+EPS,'plinth joins the bench base');
  }
  for(const f of layout.furniture.filter(f=>f.kind==='chair')){
    const shapes=out.byFixture.get(f.id),seat=bounds(shapes[0]),stiles=parts(out,'chair-stile').filter(p=>p.fixtureId===f.id),crest=parts(out,'chair-crest').find(p=>p.fixtureId===f.id);
    assert.ok(Math.abs(seat.max[1]-.4925)<EPS,'the fitted patron seat stays exact');assert.equal(stiles.length,2);assert.ok(crest);
    const c=partBounds(out,crest);assert.ok(c.max[1]<=1.14+EPS);assert.ok(c.max[1]-c.min[1]>.075,'the crest has an actual curved silhouette');
    for(const p of stiles){const b=partBounds(out,p);assert.ok(b.min[1]<seat.max[1]&&b.max[1]>c.min[1],'rear stiles join seat and crest');}
    assert.equal(shapes.some(s=>s.kind==='box'&&s.args[1][1]>.5&&s.args[1][2]>.45),false,'no full-height rectangular back slab remains');
  }
});

test('table collars and rounded bar fittings join their actual supports without changing service heights',()=>{
  const out=record();
  for(const p of parts(out,'table-top')){
    const b=partBounds(out,p),pedestal=partBounds(out,parts(out,'table-pedestal').find(q=>q.fixtureId===p.fixtureId));
    assert.ok(Math.abs(b.max[1]-.790)<EPS,'table dressing and seated hand contacts stay at their original height');
    const collar=out.byFixture.get(p.fixtureId).find(s=>s.kind==='cylinder'&&Math.abs(s.args[1]-.40)<EPS),cb=bounds(collar);
    assert.ok(pedestal.max[1]>cb.min[1]&&cb.max[1]>b.min[1],'turned pedestal and underside collar remain joined');
    assert.ok(partShapes(out,p).some(s=>s.kind==='quad'),'the tabletop perimeter has a modeled bevel');
  }
  const run=parts(out,'footrail-run')[0],r=partBounds(out,run),sockets=parts(out,'footrail-socket'),brackets=parts(out,'footrail-bracket');
  assert.equal(sockets.length,6);assert.equal(brackets.length,6);assert.ok(partShapes(out,run).every(s=>s.kind==='quad'),'the footrail has a closed round section');
  const body=bounds(out.byFixture.get('pub-counter')[0]);
  for(let i=0;i<brackets.length;i++){
    const socket=partBounds(out,sockets[i]),bracket=partBounds(out,brackets[i]);
    assert.equal(boxesIntersect(socket,body),true,'socket is seated in the cabinet face');
    assert.equal(boxesIntersect(socket,bracket),true,'bracket enters its socket');assert.equal(boxesIntersect(bracket,r),true,'bracket reaches the round rail');
    if(i)assert.ok(Math.abs(socket.min[2]-partBounds(out,sockets[i-1]).min[2])<=1.11,'no two-metre unsupported visual spans remain');
  }
  assert.ok(Math.abs(partBounds(out,parts(out,'counter-arris')[0]).max[1]-1.140)<EPS,'bar tray and lamp support stay exact');
});

test('WC planes fit the runtime contract and leave the entire standard dynamic door opening and swing clear',()=>{
  const out=record(),wc=layout.wc,parts=out.byFixture.get('pub-wc-partitions');
  assert.deepEqual(wc.bounds,{x0:-5.25,x1:-2.70,z0:-18,z1:-16.30});assert.equal(wc.wallThickness,.12);
  assert.equal(wc.doorway.x,-2.7);assert.equal(wc.doorway.z,-17.25);assert.equal(wc.doorway.width,1);assert.equal(wc.doorway.openingHeight,3.4);
  // Strictly inside the wall plane; test both jamb sides and high above the leaf.
  for(const x of[-2.75,-2.7,-2.65])for(const z of[-17.74,-17.25,-16.76])for(const y of[.1,1.6,2.3,3.39]){
    assert.equal(parts.some(s=>{const b=bounds(s);return[x,y,z].every((n,i)=>n>b.min[i]+EPS&&n<b.max[i]-EPS);}),false,'no static leaf, head or custom frame seals the standard opening');
  }
  assert.equal(wc.doorway.swing,'escape');
  assertClear(out,{x0:-2.7,x1:-1.7,z0:-17.75,z1:-16.75},'WC outward door sweep');
  const room=wc.bounds;
  for(const f of layout.furniture.filter(f=>['toilet','basin'].includes(f.kind))){
    assert.ok(f.bounds.x0>room.x0&&f.bounds.x1<room.x1&&f.bounds.z0>room.z0&&f.bounds.z1<room.z1);
  }
});

test('the room contains fitted furniture, sanitary fixtures and complete joined finishes with practical headroom',()=>{
  const out=record(),count=kind=>layout.furniture.filter(f=>f.kind===kind).length;
  assert.equal(count('banquette'),2);for(const kind of['table','chair','stool'])assert.equal(count(kind),3);
  for(const kind of['counter','backbar','stove','toilet','basin'])assert.equal(count(kind),1);
  assert.equal(out.report.bottles,42);assert.equal(PUB_LIGHT_ANCHORS.length,4);
  for(const id of['pub-basketweave-parquet','pub-panelling-skirts-and-rails','pub-ceiling-coving-and-roses','pub-wc-tiled-floor','pub-wc-mirror','pub-wc-ceiling-practical'])assert.ok(out.byFixture.get(id).length>0);
  for(const p of layout.pendants){
    const shapes=out.byFixture.get(p.id);assert.ok(shapes.length>8);
    assert.ok(Math.min(...shapes.flatMap(s=>rowPoints(s).map(v=>v[1])))>=layout.minimumPendantY);
    const light=PUB_LIGHT_ANCHORS.find(l=>l.x===p.x&&l.z===p.z);assert.ok(light,'a real light has a physical fitting');
    assert.equal(light.intensity,{'pub-entry-light':1.35,'pub-snug-light':1.45,'pub-bar-light':1.50}[light.id],'fitted pendants use the reviewed furniture-readable practical intensities');
  }
  const wcLight=PUB_LIGHT_ANCHORS.find(l=>l.id==='pub-wc-light');
  assert.deepEqual(wcLight,{id:'pub-wc-light',x:-3.80,y:2.98,z:-16.70,radius:2.4,intensity:1.05,color:[1,.83,.61]});
  for(const p of out.byFixture.get('pub-wc-ceiling-practical').flatMap(rowPoints)){
    assert.ok(p[1]>=2.96&&p[1]<=layout.ceilingLocalY+EPS,'WC practical is above head height and joins the ceiling');
    assert.ok(p[0]>layout.wc.bounds.x0&&p[0]<layout.wc.bounds.x1&&p[2]>layout.wc.bounds.z0&&p[2]<layout.wc.bounds.z1,'WC practical stays inside the private room');
  }
  for(const s of out.shapes.filter(s=>s.kind==='quad'&&s.args.slice(0,4).every(p=>Math.abs(p[1]-s.args[0][1])<EPS))){
    const[a,b,c]=rowPoints(s),u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
    assert.ok(u[2]*v[0]-u[0]*v[2]>0,'one-sided horizontal floors and ceramic rims face upward');
  }
});

test('geometry is deterministic and stays inside the reviewed ordinary opaque material and triangle budgets',()=>{
  const a=record(),b=record();assert.deepEqual(a.shapes,b.shapes);assert.deepEqual(a.report,b.report);
  assert.equal(a.report.newMaterials,4);assert.equal(a.api.materials.length,sharedNames.length+4);
  assert.ok(a.api.materials.every(m=>m.alphaMode!=='BLEND'&&!m.emissiveFactor&&!m.extras&&!m.pbrMetallicRoughness.baseColorTexture));
  const count=a.shapes.reduce((n,s)=>n+triangles(s),0);assert.equal(count,a.report.triangles);assert.ok(count<=12000);
  assert.equal(a.report.triangles,a.report.fixtures.reduce((n,f)=>n+f.triangles,0));
  const reused=record(a.api.materials);assert.equal(reused.report.newMaterials,0);assert.deepEqual(reused.shapes,a.shapes);
});
