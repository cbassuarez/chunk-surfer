import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAIN_STAIR_GEOMETRY as S,gridDrawnHeight} from '../src/data/main-stair-geometry.js';

// Read the packed geometry rather than accepting a successful builder exit or
// its metadata as proof that the newel, coil and rounded starter actually exist.
const bytes=readFileSync(process.env.CS_STAIR_TEST_ASSET||new URL('../public/assets/conservatory-main-stair.glb',import.meta.url));
const stats=JSON.parse(readFileSync(process.env.CS_STAIR_TEST_STATS||new URL('../public/assets/conservatory-main-stair.stats.json',import.meta.url),'utf8'));
const jl=bytes.readUInt32LE(12),g=JSON.parse(bytes.subarray(20,20+jl)),bin=28+jl,J=stats.design.joinery;
const read=index=>{
  const a=g.accessors[index],v=g.bufferViews[a.bufferView],n=a.type==='VEC3'?3:1,start=bin+(v.byteOffset||0)+(a.byteOffset||0),fn=a.componentType===5126?'readFloatLE':'readUInt32LE';
  return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,k)=>bytes[fn](start+(i*n+k)*4)));
};
const vertices={},triangles=[];
for(const mesh of g.meshes)for(const p of mesh.primitives){
  const material=g.materials[p.material].name,positions=read(p.attributes.POSITION),normals=read(p.attributes.NORMAL),ix=read(p.indices).flat();
  vertices[material]??=[];vertices[material].push(...positions);
  for(let i=0;i<ix.length;i+=3)triangles.push({material,p:ix.slice(i,i+3).map(k=>positions[k]),n:ix.slice(i,i+3).map(k=>normals[k])});
}
const inPolygon=([x,z],p)=>{let c=false;for(let i=0,j=p.length-1;i<p.length;j=i++){if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])c=!c;}return c;};
function hit({p:[a,b,c]},x,z){
  const den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(den)<1e-10)return null;
  const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den;
  return u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6?u*a[1]+v*b[1]+(1-u-v)*c[1]:null;
}
const nearest=(material,p)=>Math.min(...(vertices[material]||[]).map(q=>Math.hypot(...q.map((v,i)=>v-p[i]))));

test('bourgeois joinery preserves the four-flight navigation contract and existing newel centre stations',()=>{
  assert.ok(J,'the asset contains the joinery pass');assert.equal(stats.design.geometryRevision,4);assert.equal(stats.design.finishRevision,4);
  assert.deepEqual([S.widthM,S.innerRadiusM,S.outerRadiusM,S.collisionOuterRadiusM,S.flights.map(f=>f.rises)],[2,.65,2.65,3,[14,14,15,15]]);
  const at=(r,a)=>[Math.sin(a)*r,-Math.cos(a)*r];
  const expected=[[.7,0,0],[2.6,0,0],[2.6,Math.PI*2,gridDrawnHeight(4.8)],
    [2.6,S.flights[2].theta0,gridDrawnHeight(4.8)],[2.6,S.flights[3].theta0+S.flights[3].sweep,gridDrawnHeight(10)],
    [.7,S.flights[3].theta0,gridDrawnHeight(10)]];
  assert.equal(J.newels.length,expected.length);
  expected.forEach(([r,a,h],i)=>{const [x,z]=at(r,a),n=J.newels[i];assert.ok(Math.hypot(n.x-x,n.z-z)<1e-10);assert.equal(n.floor,h);assert.equal(n.maximumFootRadiusM,.07);});
});

test('rounded curtail is real closed-depth tread geometry in the spare outer strip, flush with the drawn ground',()=>{
  assert.ok(J,'joinery metadata exists');const c=J.curtail,top=gridDrawnHeight(0),bottom=top-S.slabDepthM;
  assert.equal(c.firstTreadHeightM,0);assert.equal(c.drawnCapHeightM,top);assert.equal(c.slabDepthM,.18);
  assert.ok(c.outline.length>50,'the return is curved rather than a rectangular plinth');
  for(const [x,z] of c.outline){assert.ok(Math.hypot(x,z)>=S.outerRadiusM+.0009);assert.ok(Math.hypot(x,z)<=3);assert.ok(x>=-3&&x<=3&&z>=-3&&z<=3);}
  const tops=triangles.filter(t=>t.material==='warm terrazzo'&&t.n.every(n=>n[1]>.99)&&t.p.every(p=>Math.abs(p[1]-top)<1e-5));
  const bottoms=triangles.filter(t=>t.material==='cast concrete'&&t.n.every(n=>n[1]<-.99)&&t.p.every(p=>Math.abs(p[1]-bottom)<1e-5));
  let checked=0;
  for(let x=-.45;x<.68;x+=.035)for(let z=-2.99;z<-2.57;z+=.035){
    if(!inPolygon([x,z],c.outline))continue;checked++;
    assert.ok(tops.some(t=>{const y=hit(t,x,z);return y!==null&&Math.abs(y-top)<1e-5;}),`missing curtail top at ${x},${z}`);
    assert.ok(bottoms.some(t=>{const y=hit(t,x,z);return y!==null&&Math.abs(y-bottom)<1e-5;}),`missing curtail underside at ${x},${z}`);
  }
  assert.ok(checked>100,'measure the full rounded support, not one convenient point');
});

test('volute is rendered in oak and joins the existing rail as one sweep, with supported iron beneath it',()=>{
  assert.ok(J);const v=J.volute;assert.equal(v.continuousSweep,true);assert.ok(v.turns>=1);assert.deepEqual(v.neck.at(-1),v.railJoin);
  for(const p of v.coil){
    assert.ok(Math.hypot(p[0],p[2])-.048>=S.outerRadiusM-.002,'coil stays outside the walking ribbon');
    assert.ok(Math.hypot(p[0],p[2])+.048<=3.001,'coil and grip stay in the stairwell strip');
    const d=nearest('dark oak',p);assert.ok(d<.060,'actual tapered oak grip surrounds every sampled coil station, including its closed tip cap');
  }
  const join=v.railJoin;assert.ok(nearest('dark oak',join)<.060,'the packed grip reaches the original rail start');
  assert.equal(v.supports.length,2);
  for(const p of v.supports){
    assert.equal(p.bottom,gridDrawnHeight(0));assert.ok(inPolygon([p.x,p.z],J.curtail.outline),'each support is actually over the curtail');
    assert.ok(nearest('blackened steel',[p.x,p.bottom,p.z])<.015);
    assert.ok(nearest('blackened steel',[p.x,p.top,p.z])<.015);
    assert.ok(nearest('dark oak',[p.x,p.top,p.z])<.006,'each iron support makes contact with the tapered oak instead of stopping below it');
  }
});

test('six oak newels and restrained iron scroll panels survive the bounded seven-material tread finish',()=>{
  assert.ok(J);assert.ok(J.scrollPanels>=12&&J.scrollPanels<=80);
  for(const n of J.newels)for(const h of[.36,.77])assert.ok(nearest('dark oak',[n.x,n.floor+h,n.z])<.065,'an oak shaft is packed at every original newel station');
  assert.equal(g.meshes.length,1);assert.equal(g.meshes[0].primitives.length,7);
  assert.ok(stats.totalTriangles<=50000);assert.ok(bytes.length<1851504);
  assert.match(J.caracole,/existing open-well winding helix/);
});
