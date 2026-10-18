// Regression coverage for the real underfoot layout and existing yard props.
// These checks would fail the old one-metre paths, dry basin corners, benches
// facing across the water and arrival lawn that existed only in its receiver.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { MATERIAL, ZONE, CELL } from '../src/data/floorplan/legend.js';
import { EXTERIOR_FOREGROUND as FG, foregroundYardLogicalPoint } from '../src/data/exterior-foreground.js';
import { YARD_PARK_PROPS } from '../src/data/yard-park.js';
import { OPENING_STREET_PARK } from '../src/data/opening-street.js';
import { computeWaterBodies, waterBodyAt } from '../src/game/water-bodies.js';
import { exteriorRainMaterialMixAt } from '../src/data/exterior-district.js';
import { PROP_BOUNDS } from '../src/data/generated/prop-geometry.js';
import { PROP_MESH } from '../src/data/conservatory-props.js';

FP.compile(conservatory.levels,conservatory);
PROPS.propsInit(FP);
const yard=(x,z)=>FP.toRuntimePoint(foregroundYardLogicalPoint({x,z}),{center:false});
const material=(x,z)=>{const p=yard(x,z);return FP.materialAt(p.x,p.y);};
const floor=(x,z)=>{const p=yard(x,z);return FP.floorAt(p.x,p.y);};
const eachCell=(r,fn)=>{for(let z=r.z0;z<r.z1;z+=CELL)for(let x=r.x0;x<r.x1;x+=CELL)fn(x,z,yard(x,z));};
const clear=(p,label)=>{
  assert.equal(FP.isSolid(p.x,p.y),false,`${label} has walkable ground`);
  assert.ok(PROPS.propCanOccupy(p.x,p.y),`${label} clears existing prop collision`);
};

// Keep independent expected basin rows. A widened dry apron must never turn
// the octagon into a square, cap its water, or move the pickup into dry land.
test('the original 37-cell wet basin and eyes survive the dry path widening',()=>{
  const expected=new Set();
  for(const [z,x0,x1] of [[33,9,11],[34,8,12],[35,7,13],[36,7,13],[37,7,13],[38,8,12],[39,9,11]]){
    for(let x=x0;x<=x1;x++)expected.add(`${x},${z}`);
  }
  const actual=new Set();
  for(let z=22;z<=50;z++)for(let x=1;x<=19;x++)if(material(x,z)===MATERIAL.wetTile)actual.add(`${x},${z}`);
  assert.deepEqual([...actual].sort(),[...expected].sort());
  assert.equal(actual.size,37);
  for(const key of actual){const [x,z]=key.split(',').map(Number);assert.ok(Math.abs(floor(x,z)+.3)<1e-6);}
  const eyes=YARD_PARK_PROPS.find(p=>p.id==='yard-park-eyes');
  assert.deepEqual([eyes.x,eyes.y],[61.4,237.4]);
  assert.equal(eyes.action,undefined);
  assert.equal(material(11.4,37.4),MATERIAL.wetTile);
  const bodies=computeWaterBodies(FP),at=yard(11.4,37.4);
  assert.equal(waterBodyAt(bodies,at.x,at.y,null)?.id,'park-fountain');
  assert.equal(bodies.find(b=>b.id==='park-fountain').blocks,false);
});

test('three-metre paths and at least two-metre dry bypasses have real civic flags and clear height',()=>{
  for(const r of [
    {x0:9,x1:12,z0:22,z1:30},
    {x0:9,x1:12,z0:43,z1:49},
    {x0:2,x1:4,z0:35,z1:38},
    {x0:17,x1:19,z0:35,z1:38},
    // Dry two-metre strips beyond the measured fountain projections. The
    // retained lamp occupies the far northeast corner, outside these lanes.
    {x0:4,x1:6,z0:33,z1:40},
    {x0:15,x1:17,z0:33,z1:40},
    {x0:7,x1:12,z0:30,z1:32},
    {x0:7,x1:14,z0:41,z1:43},
  ])eachCell(r,(x,z,p)=>{
    assert.equal(material(x,z),MATERIAL.wetPaving,`dry civic-flag lane ${x},${z}`);
    assert.equal(floor(x,z),0,`level lane ${x},${z}`);
    assert.ok(FP.ceilAt(p.x,p.y)-FP.floorAt(p.x,p.y)>=1.8);
    clear(p,`lane ${x},${z}`);
  });
  // Ordinary half-metre steps enter, pass beside the water and return to the
  // central path. Neither movement nor water entry needs a new interaction.
  const route=[[10,21],[10,30],[5,30],[5,42],[10,42],[10,49]];
  for(let i=1;i<route.length;i++){
    let [x,z]=route[i-1];const [tx,tz]=route[i];
    while(x!==tx||z!==tz){
      const nx=x+Math.sign(tx-x)*CELL,nz=z+Math.sign(tz-z)*CELL,a=yard(x,z),b=yard(nx,nz);
      assert.ok(FP.canStep(a.x,a.y,b.x,b.y).ok,`step ${x},${z} to ${nx},${nz}`);
      clear(b,`route ${nx},${nz}`);x=nx;z=nz;
    }
  }
});

test('garden benches face the water from recesses beyond the protected apron',()=>{
  const basin=FG.garden.fountain;
  for(const spec of FG.garden.benches){
    const bench=YARD_PARK_PROPS.find(p=>p.id===spec.id);
    assert.ok(bench&&PROPS.propById(spec.id));
    assert.equal(bench.blocks,false);assert.equal(bench.interactive,false);assert.equal(bench.action,undefined);
    const x=bench.x-50,z=bench.y-200;
    assert.ok(x<4||x>=17,'bench remains outside the apron');
    const toward={x:Math.sin(bench.yaw),z:-Math.cos(bench.yaw)};
    const dx=basin.x-x,dz=basin.z-z;
    const actual=PROP_BOUNDS.district_bench;
    const halfAlongPath=Math.max(Math.abs(actual.min[0]),Math.abs(actual.max[0]));
    assert.ok(z+halfAlongPath<=35||z-halfAlongPath>=38,'actual bench body clears the full cross path');
    assert.ok((toward.x*dx+toward.z*dz)/Math.hypot(dx,dz)>.94,'open seat face aims at the water');
  }
});

test('cathedral greens leave an actual two-metre route beside existing scaffolds and preserve both exit landings',()=>{
  for(const r of FG.cathedral.greens)eachCell(r,(x,z,p)=>{
    assert.equal(material(x,z),MATERIAL.wetGrass,`${r.id} is grass underfoot`);
    assert.ok(Math.abs(floor(x,z)-.02)<1e-6);
    assert.equal(FP.zoneAt(p.x,p.y),ZONE.dock);clear(p,`${r.id} ${x},${z}`);
  });
  eachCell({x0:3,x1:5,z0:57,z1:84},(x,z,p)=>{
    assert.equal(material(x,z),MATERIAL.wetTarmac,`cathedral through route ${x},${z}`);
    assert.equal(floor(x,z),0);clear(p,`cathedral through route ${x},${z}`);
  });
  for(const [x,z] of [[16,52],[16,53],[16,54],[25,73]]){
    const p=FP.logicalAtPhysical(x/CELL,z/CELL,{floor:0});
    assert.ok(p,`exit landing ${x},${z} retains physical floor`);
    assert.equal(FP.floorAt(p.x,p.y),0);assert.equal(FP.materialAt(p.x,p.y),MATERIAL.wetTarmac);
    clear(p,`exit landing ${x},${z}`);
  }
});

test('arrival lawns acquire grass semantics within their actual footprint without moving the road or spawn',()=>{
  assert.deepEqual(OPENING_STREET_PARK.bounds,{x0:62,x1:76,y0:200,y1:203});
  for(const r of [{x0:12,x1:18,z0:0,z1:3},{x0:20,x1:26,z0:0,z1:3}])eachCell(r,(x,z,p)=>{
    assert.equal(material(x,z),MATERIAL.wetGrass);assert.equal(FP.zoneAt(p.x,p.y),ZONE.dock);
    assert.ok(Math.abs(floor(x,z)-.02)<1e-6);
  });
  eachCell({x0:18,x1:20,z0:0,z1:3},(x,z)=>assert.equal(material(x,z),MATERIAL.wetTarmac));
  assert.deepEqual(conservatory.spawn,{x:57,y:207});
  for(const [x,z] of [[7,7],[19,7],[28,7],[35,7]])assert.equal(material(x,z),MATERIAL.wetTarmac,`protected drive ${x},${z}`);
  assert.ok(exteriorRainMaterialMixAt(10,36).foliage>exteriorRainMaterialMixAt(30,60).foliage*2,'garden rain still reads the established foliage zone');
});


test('the compact city shelter and bench fit the pavement edge and leave a genuine two-metre open route',()=>{
  const rendered=PROPS.renderInstances({inscriptions:false});
  const shelter=rendered.find(p=>p.id==='city-bus-shelter');
  const bench=rendered.find(p=>p.id==='city-bus-shelter-bench');
  assert.equal(shelter.mesh,'city_bus_shelter_compact');
  assert.ok(Math.abs(shelter.x+13.8)<1e-9,'rendered shelter keeps its exact fractional-metre anchor');
  assert.ok(Math.abs(bench.x+14.1)<1e-9,'rendered bench keeps its exact fractional-metre anchor');
  assert.equal(PROPS.propById(shelter.id).blocks,false,'waiting space is not a solid bounding box');
  assert.equal(PROP_MESH.city_bus_shelter_compact.w,1.4);
  assert.ok(shelter.x-.7>=-14.5-1e-9,'roof fits the exterior pavement edge');
  assert.ok(shelter.x+.7<=-13.1+1e-9,'roof ends before the protected route');
  const b=PROP_BOUNDS.yard_look_bench;
  assert.ok(bench.x+b.min[0]>=-14.5,'actual bench body stays inside the pavement');
  assert.ok(bench.x+b.max[0]<shelter.x+.7,'bench body stays within the shelter depth');
  let previous=null;
  for(let z=13.5;z<=18.5;z+=CELL){
    for(let x=-13;x<-11;x+=CELL){
      const p=FP.logicalAtPhysical(x/CELL,z/CELL,{floor:0});
      assert.ok(p);clear(p,`city shelter through route ${x},${z}`);
      assert.ok(Math.abs(FP.floorAt(p.x,p.y)-.12)<1e-6,'the complete two-metre route has level pavement');
      assert.equal(FP.materialAt(p.x,p.y),MATERIAL.wetPaving);
      if(previous&&x===-13)assert.ok(FP.canStep(previous.x,previous.y,p.x,p.y).ok,'ordinary steps follow the open strip');
      if(x===-13)previous=p;
    }
  }
  for(const [fromZ,toZ] of [[11.5,12],[12,11.5],[19.5,20],[20,19.5]]){
    const a=FP.logicalAtPhysical(-11.5/CELL,fromZ/CELL,{floor:0});
    const b=FP.logicalAtPhysical(-11.5/CELL,toZ/CELL,{floor:0});
    assert.ok(Math.abs(FP.floorAt(a.x,a.y)-FP.floorAt(b.x,b.y))<=.095001,'end step remains at most 95mm');
    assert.ok(FP.canStep(a.x,a.y,b.x,b.y).ok,'ordinary movement crosses each end step both ways');
  }
  const gutter=FP.logicalAtPhysical(-11/CELL,16/CELL,{floor:0});
  assert.ok(Math.abs(FP.floorAt(gutter.x,gutter.y)-.025)<1e-6,'sett gutter beside the pad remains at its existing height');
  assert.equal(PROPS.propById('yard-bus-shelter').mesh,'city_bus_shelter','arrival shelter retains its original mesh');
});


test('foreground mesh owners stand at yard grade even when their anchor lies in the sunken basin',()=>{
  const rendered=PROPS.renderInstances({inscriptions:false});
  for(const id of ['exterior-garden-hardscape','exterior-garden-planting','exterior-arrival-planting']){
    const prop=PROPS.propById(id),r=rendered.find(p=>p.id===id);
    assert.ok(prop&&r,`${id} survives source placement`);
    assert.equal(prop.floorOverride,0,`${id} explicitly owns grade`);
    assert.equal(prop.floor,0,`${id} does not inherit the basin or lawn height`);
    assert.equal(r.y,0,`${id} renders its local grade correctly`);
    assert.equal(r.structural,true);
  }
  for(const id of ['exterior-garden-hardscape','exterior-garden-planting']){
    const r=rendered.find(p=>p.id===id);
    assert.deepEqual([r.x,r.z],[10.5,36.5],'garden mesh anchor preserves exact half-metre coordinates');
  }
});
