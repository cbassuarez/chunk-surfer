// Exercise the actual asset builder callbacks, without baking shared assets.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { buildBuildingAmenities, buildStaffCounterSink, buildStaffCounterKettle } from '../tools/chunk_surfer/building-amenities-geometry.mjs';
import { BUILDING_AMENITY_PROPS, BUILDING_AMENITY_MESHES } from '../src/data/building-amenities.js';

const primitives = [], materials = [];
const MAT = Object.fromEntries(['black','poolBlue','steel','wood','paper','ivory','agedWhite','cloth','navy','stone','brass','rust'].map((name,i) => [name,100+i]));
const record = type => (m, ...args) => primitives.push({mesh:m.name,type,args});
buildBuildingAmenities({mesh:name => ({name}),materials,MAT,
  addBox:record('box'),addBeam:record('beam'),addEllipsoid:record('ellipsoid'),addCylinder:record('cylinder'),addQuad:record('quad')});
const counter = primitives.filter(p => p.mesh === 'amenity_staff_counter');
const sub = (a,b) => a.map((v,i) => v-b[i]);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot = (a,b) => a.reduce((s,v,i) => s+v*b[i],0);
const near = (a,b,t=1e-7) => Math.abs(a-b)<t;
// Exact triangle-plane intersection with a downward vertical ray. Tests use
// empty work areas, so the tap, mugs and kettle cannot mask the measured bowl.
const triangleHeight = (x,z,a,b,c) => {
  const n=cross(sub(b,a),sub(c,a));
  if(Math.abs(n[1])<1e-10)return null;
  const y=a[1]-(n[0]*(x-a[0])+n[2]*(z-a[2]))/n[1], p=[x,y,z];
  const v0=sub(b,a),v1=sub(c,a),v2=sub(p,a);
  const d00=dot(v0,v0),d01=dot(v0,v1),d11=dot(v1,v1),d20=dot(v2,v0),d21=dot(v2,v1),den=d00*d11-d01*d01;
  if(Math.abs(den)<1e-12)return null;
  const u=(d11*d20-d01*d21)/den,v=(d00*d21-d01*d20)/den;
  return u>=-1e-7 && v>=-1e-7 && u+v<=1+1e-7 ? y : null;
};
const hits = (x,z) => counter.flatMap(p => {
  const [a,b,c,d] = p.args;
  if(p.type==='box') {
    assert.ok(!p.args[3] && !p.args[4], 'counter boxes remain axis-aligned for this geometric probe');
    return Math.abs(x-a[0])<=b[0]/2+1e-8 && Math.abs(z-a[2])<=b[2]/2+1e-8 ? [a[1]+b[1]/2] : [];
  }
  if(p.type==='quad')return [triangleHeight(x,z,a,b,c),triangleHeight(x,z,a,c,d)].filter(y => y!==null);
  return [];
}).filter(y => y>.7 && y<1.1);

test('staff sink has a real worktop opening and at least 145mm of usable bowl depth',()=>{
  for(const [x,z] of [[-.73,0],[-.59,.10],[-.43,.045]]) {
    const y=Math.max(...hits(x,z));
    assert.ok(Number.isFinite(y),`bowl surface exists under ${x},${z}`);
    assert.ok(.9525-y>=.145,`first visible surface at ${x},${z} is recessed, measured y=${y}`);
  }
  for(const [x,z] of [[-.94,0],[.38,.22],[-.59,.27]]) {
    const y=Math.max(...hits(x,z));
    assert.ok(near(y,.9425),`surrounding worktop remains supported at y=.9425, got ${y}`);
  }
});

test('drain is an actual opening, with no plate or wood sealing its bore',()=>{
  const inBore=hits(-.59,0).filter(y=>y>.77);
  assert.equal(inBore.length,0,`drain centre has no cap above outlet; found ${inBore}`);
  const [x,z]=[-.59+.024,0];
  const rim=hits(x,z).filter(y=>y>.775 && y<.79);
  assert.ok(rim.length,'a metal drain rim surrounds the open centre');
});

test('under-counter waste has a water-seal dip and feed branches meet the existing service starts',()=>{
  const pipeQuads=counter.filter(p=>p.type==='quad' && p.args.slice(0,4).every(v=>v[0]>-.63 && v[0]<-.55 && v[1]>.45 && v[1]<.77));
  assert.ok(pipeQuads.length>=72,'rounded waste path has actual tube surfaces through its return');
  const low=Math.min(...pipeQuads.flatMap(p=>p.args.slice(0,4).map(v=>v[1])));
  assert.ok(low<=.50,`trap has a substantial return below its .59m outlet; low=${low}`);
  const wasteEnds=pipeQuads.flatMap(p=>p.args.slice(0,4)).filter(v=>near(v[2],-.19));
  assert.ok(wasteEnds.length>=12,'waste reaches the unchanged service junction at local z=-.19');
  const mean=i=>wasteEnds.reduce((s,p)=>s+p[i],0)/wasteEnds.length;
  assert.ok(near(mean(0),-.59) && near(mean(1),.59),'waste outlet centre meets existing service route');
  const endpoints=counter.filter(p=>p.type==='beam').flatMap(p=>p.args.slice(0,2));
  for(const expected of [[-.70,.72,-.30],[-.50,.82,-.30]])assert.ok(endpoints.some(p=>p.every((v,i)=>near(v,expected[i]))),`supply starts at existing service ${expected}`);
});

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const baseline = JSON.parse(fs.readFileSync(new URL('./fixtures/staff-sink-preservation.json',import.meta.url)));
const sink = [];
const sinkRecord = type => (_m,...args) => sink.push({mesh:'amenity_staff_counter',type,args});
buildStaffCounterSink({m:{},MAT,nickel:2,inner:1,addBox:sinkRecord('box'),addBeam:sinkRecord('beam'),addCylinder:sinkRecord('cylinder'),addQuad:sinkRecord('quad')});
const same = (a,b) => a.every((v,i)=>near(v,b[i]));
const tapMain = p => p.type==='cylinder' && same(p.args[0],[-.59,1.06,-.20]) && near(p.args[2],.22)
  || p.type==='beam' && same(p.args[0],[-.59,1.16,-.20]) && same(p.args[1],[-.59,1.16,-.06]);
const wood = p => p.type==='box' && p.args[2]===MAT.wood && near(p.args[0][1],.91);
const sinkStart=counter.findIndex(p=>JSON.stringify(p)===JSON.stringify(sink[0]));

test('the real amenities pipeline includes the sink while preserving kettle, other counter parts and materials',()=>{
  assert.ok(sinkStart>=0,'the new helper is actually invoked by the main asset builder');
  assert.deepEqual(counter.slice(sinkStart,sinkStart+sink.length),sink);
  const retained=counter.filter((p,i)=>!wood(p) && (i<sinkStart || i>=sinkStart+sink.length || tapMain(p)));
  assert.equal(retained.length,baseline.unchangedCounterPrimitiveCount);
  assert.equal(hash(retained),baseline.unchangedCounterSha256,'every unrelated counter primitive, including the complete kettle, retains its sequence and values');
  assert.equal(hash(primitives.filter(p=>p.mesh!=='amenity_staff_counter')),baseline.otherMeshesSha256);
  assert.equal(hash(materials),baseline.materialsSha256,'no material added, reordered or altered');
  const kettle=[],record=type=>(_m,...args)=>kettle.push({type,args});
  buildStaffCounterKettle({m:{},MAT,enamel:8,nickel:2,inner:1,addBox:record('box'),addBeam:record('beam'),addEllipsoid:record('ellipsoid'),addQuad:record('quad')});
  assert.equal(hash(kettle),baseline.kettlePrimitiveSha256,'frozen kettle emitted geometry hash');
  const source=fs.readFileSync(new URL('../tools/chunk_surfer/building-amenities-geometry.mjs',import.meta.url),'utf8');
  const kettleSource=source.slice(source.indexOf('export function buildStaffCounterKettle'),source.indexOf('// A small later-fit metal sink'));
  assert.equal(crypto.createHash('sha256').update(kettleSource).digest('hex'),baseline.kettleSourceSha256);
});

test('the actual placements join both feeds and waste to the existing separate services and tap',()=>{
  const pose=BUILDING_AMENITY_PROPS.find(p=>p.id==='amenity-staff-tea-counter');
  const servicePose=BUILDING_AMENITY_PROPS.find(p=>p.id==='amenity-staff-service-connections');
  const world=(p,at)=>[p.x+at[0]*Math.cos(p.yaw||0)-at[2]*Math.sin(p.yaw||0),(p.floorOverride||0)+at[1],p.y+at[0]*Math.sin(p.yaw||0)+at[2]*Math.cos(p.yaw||0)];
  const services=primitives.filter(p=>p.mesh===servicePose.mesh && p.type==='beam');
  const feedStarts=sink.filter(p=>p.type==='beam' && near(p.args[0][2],-.30));
  const feeds=services.filter(p=>near(p.args[2],.017));
  assert.equal(feedStarts.length,2);assert.equal(feeds.length,2);
  for(const feed of feedStarts) {
    assert.ok(feeds.some(p=>same(world(pose,feed.args[0]),world(servicePose,p.args[0]))),'real transformed feed joints coincide');
    const queue=[feed.args[0]],seen=new Set(),tap=sink.find(p=>p.type==='cylinder'&&near(p.args[2],.22));
    const target=[tap.args[0][0],tap.args[0][1]-tap.args[2]/2,tap.args[0][2]];
    let reached=false;
    while(queue.length) {
      const at=queue.pop(),key=at.join(',');if(seen.has(key))continue;seen.add(key);
      if(same(at,target))reached=true;
      for(const beam of sink.filter(p=>p.type==='beam'))for(let i=0;i<2;i++)if(same(beam.args[i],at))queue.push(beam.args[1-i]);
    }
    assert.ok(reached,'each physical feed branch terminates at the actual tap stem bottom');
  }
  const outlet=sink.filter(p=>p.type==='quad').flatMap(p=>p.args.slice(0,4)).filter(v=>near(v[2],-.19));
  assert.ok(outlet.length>=12);
  const centre=[0,1,2].map(i=>outlet.reduce((sum,p)=>sum+p[i],0)/outlet.length);
  const waste=services.find(p=>near(p.args[2],.044));
  assert.ok(same(world(pose,centre),world(servicePose,waste.args[0])),'round trap outlet joins existing waste exactly after both true placements');
});

test('bowl surfaces face the void, all added quads are sound, and the repair fits the existing counter envelope',()=>{
  for(const p of sink.filter(p=>p.type==='quad')) {
    const [a,b,c,d]=p.args;
    assert.ok(Math.hypot(...cross(sub(b,a),sub(c,a)))>1e-10);
    assert.ok(Math.hypot(...cross(sub(c,a),sub(d,a)))>1e-10);
    assert.ok([a,b,c,d].flat().every(Number.isFinite));
  }
  const innerWalls=sink.filter(p=>p.type==='quad' && p.args.slice(0,4).some(v=>near(v[1],.9525)));
  assert.equal(innerWalls.length,4);
  for(const p of innerWalls) {
    const vertices=p.args.slice(0,4),centre=[0,1,2].map(i=>vertices.reduce((s,v)=>s+v[i],0)/4);
    assert.ok(dot(cross(sub(vertices[1],vertices[0]),sub(vertices[2],vertices[0])),[-.59-centre[0],.90-centre[1],-centre[2]])>0,'each sloped face is visible from inside the bowl');
  }
  const trap=sink.filter(p=>p.type==='quad' && p.args.slice(0,4).every(v=>v[0]>-.63 && v[0]<-.55 && v[1]>.45 && v[1]<.77));
  assert.equal(trap.length%12,0);
  const centres=[];
  for(let first=0;first<trap.length;first+=12) {
    const span=trap.slice(first,first+12),ring=indices=>[0,1,2].map(i=>span.reduce((sum,p)=>sum+indices.reduce((s,j)=>s+p.args[j][i],0),0)/24);
    const start=ring([0,3]),end=ring([1,2]);centres.push(start,end);
    const axis=sub(end,start),lengthSquared=dot(axis,axis);
    for(const p of span) {
      const points=p.args.slice(0,4),centre=[0,1,2].map(i=>points.reduce((s,v)=>s+v[i],0)/4),t=dot(sub(centre,start),axis)/lengthSquared;
      const radial=sub(centre,start.map((v,i)=>v+axis[i]*t));
      assert.ok(dot(cross(sub(points[1],points[0]),sub(points[2],points[0])),radial)>0,'tube sides face outward through each curved return');
    }
  }
  assert.ok(near(Math.min(...centres.map(p=>p[1])),.495),'actual tube rings preserve the intended95mm return below the .59m outlet');
  // Beam end faces are at their endpoints: unlike a generic expanded AABB,
  // width does not extend the feed past its z=-.30 service junction.
  const points=counter.flatMap(p=>{
    const [a,b,c]=p.args;
    if(p.type==='quad')return p.args.slice(0,4);
    if(p.type==='box')return [[a[0]-b[0]/2,a[1]-b[1]/2,a[2]-b[2]/2],[a[0]+b[0]/2,a[1]+b[1]/2,a[2]+b[2]/2]];
    if(p.type==='cylinder')return [[a[0]-b,a[1]-c/2,a[2]-b],[a[0]+b,a[1]+c/2,a[2]+b]];
    if(p.type==='ellipsoid')return [a.map((v,i)=>v-b[i]),a.map((v,i)=>v+b[i])];
    const direction=sub(b,a),length=Math.hypot(...direction),u=direction.map(v=>v/length),ref=Math.abs(u[1])<.9?[0,1,0]:[1,0,0];
    const side=cross(u,ref),sl=Math.hypot(...side),s=side.map(v=>v/sl),t=cross(s,u);
    return [a,b].flatMap(end=>[-1,1].flatMap(ds=>[-1,1].map(dt=>end.map((v,i)=>v+s[i]*ds*c/2+t[i]*dt*c/2))));
  });
  const registered=BUILDING_AMENITY_MESHES.amenity_staff_counter;
  assert.ok(points.every(p=>Math.abs(p[0])<=registered.w/2+1e-7 && Math.abs(p[2])<=registered.d/2+1e-7),'no new silhouette or plumbing beyond the existing counter footprint');
  const triangles=p=>({box:12,beam:12,quad:2,cylinder:p.args[4]*4,ellipsoid:(p.args[3]||8)*(p.args[4]||12)*2}[p.type]);
  const retained=counter.filter((p,i)=>!wood(p) && (i<sinkStart || i>=sinkStart+sink.length || tapMain(p)));
  const baselineTriangles=retained.reduce((sum,p)=>sum+triangles(p),0)+72;
  const added=counter.reduce((sum,p)=>sum+triangles(p),0)-baselineTriangles;
  assert.ok(added>0 && added<800,`bounded geometry cost: ${added} added triangles`);
});
