import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_WINDOWS } from '../src/data/building-windows.js';
import { BUILDING_WINDOW_MESHES, BUILDING_WINDOW_PROPS, buildingWindowMeshName } from '../src/data/building-window-fittings.js';
import { BUILDING_WINDOW_CUT_TUNNELS, BUILDING_WINDOW_HOST_ORIGINS, buildBuildingWindows, subtractBuildingWindowBoxes } from '../tools/chunk_surfer/building-window-geometry.mjs';

const record=()=>{
  const materials=[],meshes=new Map(),api={materials,mesh(name){const m={name,shapes:[]};meshes.set(name,m);return m;}};
  for(const kind of['Box','Beam','Ellipsoid','Quad'])api[`add${kind}`]=(m,...args)=>m.shapes.push({kind,args});
  buildBuildingWindows(api);return {materials,meshes};
};
const volume=box=>box.size.reduce((a,v)=>a*v,1);
const bbox=box=>({min:box.center.map((v,i)=>v-box.size[i]/2),max:box.center.map((v,i)=>v+box.size[i]/2)});
const intersects=(a,b)=>a.min.every((v,i)=>v<b.max[i]-1e-9&&a.max[i]>b.min[i]+1e-9);

test('the existing civic pilaster is cut at the actual foyer head instead of hanging across the sash',()=>{
  const origin=BUILDING_WINDOW_HOST_ORIGINS.front_atrium_perimeter_relief;
  const original={center:[.15,3.48,-11.455],size:[.30,2.12,.09]};
  const pieces=subtractBuildingWindowBoxes(original.center,original.size,{origin});
  assert.equal(pieces.length,1);
  assert.ok(Math.abs(pieces[0].center[1]-pieces[0].size[1]/2-3.45)<1e-8);
  assert.ok(volume(pieces[0])<volume(original));
  const cut=BUILDING_WINDOW_CUT_TUNNELS.find(c=>c.id==='W3-foyer-north');
  for(const p of pieces)assert.equal(intersects(bbox({center:p.center.map((v,i)=>v+origin[i]),size:p.size}),cut),false);
});

test('facade subtraction preserves volume, disjointness and coordinates for a complete six-sided cut',()=>{
  const original={center:[2,3,4],size:[10,8,12]},cut={min:[1,2,3],max:[3,4,5]};
  const pieces=subtractBuildingWindowBoxes(original.center,original.size,{origin:[0,0,0],cuts:[cut]});
  assert.equal(pieces.length,6);
  assert.ok(Math.abs(pieces.reduce((n,p)=>n+volume(p),0)-(volume(original)-8))<1e-8);
  for(let i=0;i<pieces.length;i++) {
    assert.ok(!intersects(bbox(pieces[i]),cut));
    for(let j=i+1;j<pieces.length;j++)assert.ok(!intersects(bbox(pieces[i]),bbox(pieces[j])));
  }
  assert.deepEqual(subtractBuildingWindowBoxes(original.center,original.size,{origin:[0,0,0],cuts:[{min:[20,20,20],max:[22,22,22]}]}),[original]);
});

test('every approved tunnel cuts the full facade interval and preserves the separate north service doorway',()=>{
  for(const cut of BUILDING_WINDOW_CUT_TUNNELS) {
    const box={center:cut.min.map((v,i)=>(v+cut.max[i])/2),size:cut.min.map((v,i)=>cut.max[i]-v)};
    const local=box.center.map((v,i)=>v-[50,0,7.5][i]);
    assert.deepEqual(subtractBuildingWindowBoxes(local,box.size),[],`${cut.id} is a complete through cut`);
  }
  const gate={center:[44,11.5,-5.4],size:[2.4,3,1]};
  assert.deepEqual(subtractBuildingWindowBoxes(gate.center,gate.size),[gate],'roof-access service doorway is outside all four window cuts');
});

test('window units retain open pane interiors, tactile catches and cords, with a shared nine-material kit',()=>{
  const {materials,meshes}=record();assert.equal(materials.length,9);
  assert.deepEqual([...meshes.keys()].sort(),Object.keys(BUILDING_WINDOW_MESHES).sort());
  for(const w of BUILDING_WINDOWS) {
    const m=meshes.get(buildingWindowMeshName(w.id)),h=w.head-w.sill,baths=w.wall==='south';
    assert.equal(m.extras.opticalRefraction,false);assert.equal(m.extras.glazingRepresentation,'edge-and-rain-lines');
    assert.equal(m.shapes.filter(s=>s.kind==='Beam'&&s.args[2]===.004).length,w.bayCount*2,'one sparse water line per pane');
    assert.equal(m.shapes.filter(s=>s.kind==='Beam'&&s.args[2]===.015).length,w.bayCount,'one actual sash catch per bay');
    assert.equal(m.shapes.filter(s=>s.kind==='Beam'&&s.args[2]===.009).length,baths?0:w.bayCount*2,'sash cords belong to the dry public/staff rooms');
    assert.equal(m.shapes.filter(s=>s.kind==='Quad').length,baths?0:20,'curtains are pulled to both sides, with actual pleated surfaces');
    assert.ok(m.shapes.filter(s=>s.kind==='Box'&&(s.args[2]===7||s.args[2]===8)).every(s=>s.args[1][0]<.02||s.args[1][1]<.02),
      'glazing geometry contains narrow edges only, never an opaque full pane');
    if(w.id==='W1-chamber-north')assert.ok(w.sill+h+.215<13.35,'the pole and finials stop below the existing fresco');
  }
});

test('actual window members fit the registry including projecting sills, pleated hems and curtain finials',()=>{
  const {meshes}=record();
  for(const [name,m] of meshes) {
    const points=[];
    for(const {kind,args:a} of m.shapes) {
      if(kind==='Quad'){points.push(...a.slice(0,4));continue;}
      if(kind==='Beam') {
        const pad=a[2]*Math.SQRT2/2;
        for(const p of[a[0],a[1]])for(const x of[-pad,pad])for(const y of[-pad,pad])for(const z of[-pad,pad])
          points.push([p[0]+x,p[1]+y,p[2]+z]);
        continue;
      }
      const radii=kind==='Ellipsoid'?a[1]:a[1].map(v=>v/2);
      for(const x of[-1,1])for(const y of[-1,1])for(const z of[-1,1])
        points.push(a[0].map((v,i)=>v+[x,y,z][i]*radii[i]));
    }
    const extent=[0,1,2].map(i=>Math.max(...points.map(p=>p[i]))-Math.min(...points.map(p=>p[i]))),spec=BUILDING_WINDOW_MESHES[name];
    assert.ok(extent[0]<=spec.w+1e-8,`${name} real width ${extent[0]} <= ${spec.w}`);
    assert.ok(extent[1]<=spec.h+1e-8,`${name} real height ${extent[1]} <= ${spec.h}`);
    assert.ok(extent[2]<=spec.d+1e-8,`${name} real depth ${extent[2]} <= ${spec.d}`);
  }
});

test('placements put the reveal origin on the inside cut face with the manifest sill and inward normal',()=>{
  assert.equal(BUILDING_WINDOW_PROPS.length,4);
  for(const p of BUILDING_WINDOW_PROPS) {
    const w=BUILDING_WINDOWS.find(w=>w.id===p.windowId),n=w.inwardNormal;
    assert.equal(p.floorOverride,w.sill);assert.equal(p.blocks,false);
    assert.ok(Math.abs(-Math.sin(p.yaw)-n.x)<1e-8&&Math.abs(Math.cos(p.yaw)-n.z)<1e-8);
    const x=w.physical.x0+p.x-w.logical.x0+p.renderOffsetX;
    const z=w.physical.z0+p.y-w.logical.y0+p.renderOffsetZ;
    assert.ok(Math.abs(x-(n.x>0?w.physical.x1:n.x<0?w.physical.x0:(w.physical.x0+w.physical.x1)/2))<1e-8);
    assert.ok(Math.abs(z-(n.z>0?w.physical.z1:n.z<0?w.physical.z0:(w.physical.z0+w.physical.z1)/2))<1e-8);
  }
});
