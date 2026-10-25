import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {YARD_SERVICE_RANGES} from '../src/data/exterior-district.js';
import {YARD_RANGE_FRONTAGES,YARD_RANGE_FRONTAGE_CONTRACT as C} from '../src/data/yard-range-frontages.js';
import {buildYardRangeBody,addYardRangeWestFrontage,YARD_RANGE_MATERIALS} from '../tools/chunk_surfer/yard-range-frontage-geometry.mjs';
function fixture(){
  const materials=[],shapes=[];
  const api={materials,addBox(m,center,size,material){shapes.push({mesh:m.name,kind:'box',center,size,material});},addBeam(m,a,b,width,material){shapes.push({mesh:m.name,kind:'beam',a,b,width,material});},addCylinder(m,center,radius,height,material,sides){shapes.push({mesh:m.name,kind:'cylinder',center,radius,height,material,sides});},addQuad(m,a,b,c,d,material){shapes.push({mesh:m.name,kind:'quad',points:[a,b,c,d],material});}};
  const reports=YARD_RANGE_FRONTAGES.map(spec=>{const range=YARD_SERVICE_RANGES.find(r=>r.id===spec.id),m={name:spec.mesh},bodyReport=buildYardRangeBody(api,m,{range,kind:spec.kind});return addYardRangeWestFrontage(api,m,{range,kind:spec.kind,bodyReport});});
  return{materials,shapes,reports,api};
}
function corners(p){
  if(p.kind==='quad')return p.points;
  if(p.kind==='box')return[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>p.center.map((v,k)=>v+[x,y,z][k]*p.size[k]/2))));
  if(p.kind==='beam')return[p.a,p.b].flatMap(q=>[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>q.map((v,k)=>v+[x,y,z][k]*p.width/Math.SQRT2)))));
  return[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>[p.center[0]+x*p.radius,p.center[1]+y*p.height/2,p.center[2]+z*p.radius])));
}
const contains=(p,q)=>p.kind==='box'&&q.every((v,k)=>Math.abs(v-p.center[k])<p.size[k]/2-1e-8);
const normal=([a,b,c])=>{const u=b.map((v,k)=>v-a[k]),v=c.map((n,k)=>n-a[k]);return[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];};
test('four existing ranges keep their actual origins, roof scope and body clearance envelopes',()=>{
  const{reports}=fixture();let triangles=0;
  for(const report of reports){
    const range=YARD_SERVICE_RANGES.find(r=>r.id===report.id);assert.deepEqual(report.origin,range.physical);assert.equal(report.faceX,-range.w/2);
    for(const part of report.parts)for(const[x,y,z]of corners(part)){
      assert.ok(Number.isFinite(x+y+z));assert.ok(y>=-.00001,`${report.kind}:${part.id} below ground`);
      assert.ok(z>=-range.d/2-.10&&z<=range.d/2+.10,`${report.kind}:${part.id} left its existing west bay`);
      if(y<=2.05)assert.ok(x>=report.faceX-C.maximumBodyProjection-.00001,`${report.kind}:${part.id} body projection ${(report.faceX-x).toFixed(3)}`);
      assert.ok(x>=report.faceX-C.maximumCanopyProjection-.00001,`${report.kind}:${part.id} exceeds upper envelope`);
      assert.ok(x<=range.w/2+.00001,`${report.kind}:${part.id} extends beyond opposite wall`);
      if(part.role==='canopy')assert.ok(y>=C.minimumCanopyHeight,`${part.id} obstructs heads`);
    }
    assert.ok(Object.values(report.preserved).filter(v=>typeof v==='boolean').every((v,k)=>k<4?v:true));
    triangles+=report.triangles;
  }
  assert.ok(triangles<=C.maximumAddedTriangles,`${triangles} total helper triangles`);
});
test('caretaker and laundry windows are real apertures with furniture and at least .88m parallax',()=>{
  for(const report of fixture().reports.filter(r=>r.openings.some(o=>o.type==='window'))){
    const body=report.parts.filter(p=>p.role==='masonry'||p.role==='body');
    for(const opening of report.openings)for(const u of[.05,.40,.85])for(const z of[-.30,0,.30]){
      const q=[report.faceX+u,(opening.y0+opening.y1)/2,opening.z+z];assert.equal(body.some(p=>contains(p,q)),false,`${report.kind}:${opening.id} blocked by body`);
    }
    for(const opening of report.openings.filter(o=>o.type==='window')){
      const back=report.parts.find(p=>p.id===opening.id+'-room-back'),frame=report.parts.find(p=>p.id===opening.id+'-mullion');
      assert.ok(back.center[0]-frame.center[0]>=C.minimumWindowBackDepth);assert.equal(opening.roomDepth,C.roomDepth);
      assert.ok(report.parts.some(p=>p.role==='furniture'&&Math.abs(p.center?.[2]-opening.z)<opening.width));
    }
  }
});
test('each building conveys its existing function through different physical construction',()=>{
  const byKind=Object.fromEntries(fixture().reports.map(r=>[r.kind,r]));
  for(const id of['blocked-hay-door-infill','hay-opening-sill','retained-hoist-stub','caretaker-window-key-cabinet'])assert.ok(byKind.stable.parts.some(p=>p.id===id),id);
  for(const id of['rehearsal-acoustic-door-closed-leaf','acoustic-gasket--1','acoustic-labyrinth-vent-baffle-0','retained-old-door-order-voussoir-0'])assert.ok(byKind.rehearsal.parts.some(p=>p.id===id),id);
  for(const id of['laundry-window-folded-linen-0-0','plant-gauge-case','plant-elbow','plant-louvre-baffle-0'])assert.ok(byKind.baths.parts.some(p=>p.id===id),id);
  for(const id of['stores-goods-leaf--1','stores-goods-leaf-1','stores-door-head','stores-canopy','stores-canopy-brace--1'])assert.ok(byKind.stores.parts.some(p=>p.id===id),id);
});
test('the caretaker light is a small physically housed battery lamp; other rooms and surfaces have no power',()=>{
  const{reports,materials}=fixture();
  const emitting=materials.filter(m=>m.emissiveFactor?.some(v=>v>0));assert.equal(emitting.length,1);assert.equal(emitting[0].name,YARD_RANGE_MATERIALS.batteryLens.name);
  const lamp=reports[0].parts.filter(p=>p.role==='portable-lamp');assert.ok(lamp.some(p=>p.id.endsWith('cell-compartment')));assert.ok(lamp.some(p=>p.id.endsWith('handle-top')));
  const diffuser=lamp.find(p=>p.material==='batteryLens');assert.ok(diffuser.size[1]<=.12&&diffuser.size[2]<=.13);
  assert.equal(reports.slice(1).some(r=>r.parts.some(p=>p.material==='batteryLens')),false);
  assert.ok(materials.every(m=>!m.alphaMode&&!m.pbrMetallicRoughness.baseColorTexture));
  assert.ok(reports.every(r=>r.preserved.mainsPower===false&&r.preserved.interactive===false));
});
test('existing corrugated and modern skins back closed assemblies; no false windows are hidden behind them',()=>{
  for(const report of fixture().reports.filter(r=>r.backing)){
    assert.equal(report.openings.length,0);assert.equal(report.parts.some(p=>p.role==='room-back'),false);
    const leaves=report.parts.filter(p=>p.role==='closed-door');assert.ok(leaves.length);
    for(const leaf of leaves)assert.ok(leaf.center[0]-leaf.size[0]/2<report.faceX-report.backing.westProjection-.015,'actual closed leaf sits outward of retained skin');
    assert.ok(report.parts.filter(p=>p.id.includes('gasket')||p.id.includes('leaf-rib')).length>1);
  }
});
test('arch fronts face the west observer; every exported quad contains proper triangles',()=>{
  for(const report of fixture().reports)for(const part of report.parts.filter(p=>p.kind==='quad')){
    for(const tri of[part.points.slice(0,3),[part.points[0],part.points[2],part.points[3]]])assert.ok(Math.hypot(...normal(tri))>1e-7,`${part.id} degenerates`);
    if(part.id.includes('voussoir'))assert.ok(normal(part.points)[0]<0,`${part.id} faces away from west`);
  }
});
test('build-props retains existing roofs/long elevations/drains and replaces only its west body/end treatment',()=>{
  const text=readFileSync(new URL('../tools/chunk_surfer/build-props.mjs',import.meta.url),'utf8'),fn=text.slice(text.indexOf('function buildYardRange('),text.indexOf('const rangeById='));
  assert.match(fn,/buildYardRangeBody\(exteriorApi,m/);assert.match(fn,/addYardRangeWestFrontage\(exteriorApi,m/);
  assert.match(fn,/if\(side===1\)/);assert.match(fn,/addPitchedRoof/);assert.match(fn,/addRoofLantern/);assert.match(fn,/drain shoe/);
  assert.equal(fixture().reports.length,4);assert.deepEqual(fixture().reports,fixture().reports,'construction/metadata deterministic');
});
