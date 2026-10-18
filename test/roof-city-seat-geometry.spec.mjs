import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRoofCitySeatGeometry,ROOF_CITY_SEAT_GEOMETRY as dimensions} from '../tools/chunk_surfer/roof-city-seat-geometry.mjs';
import {ROOF_CITY_SEAT,ACADEMIC_ROOF} from '../src/data/academic-roof.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import * as P from '../src/game/props.js';

const materials=[{name:'provided limestone'},{name:'provided bronze'}],shapes=[];
const api={materials,carvedStone:0,oldBronze:1,mesh(name){return{name};}};
for(const kind of['Box','Beam','Ellipsoid','Cylinder','Quad'])
  api[`add${kind}`]=(_m,...args)=>shapes.push({kind,args});
buildRoofCitySeatGeometry(api);

test('a real low-backed stone seat fits its solid footprint and leaves the backward view open',()=>{
  for(const{kind,args:a}of shapes){
    const r=kind==='Box'?a[1].map(v=>v/2):kind==='Ellipsoid'?a[1]:null;
    const points=r?[-1,1].map(sign=>a[0].map((v,i)=>v+sign*r[i])):
      a.slice(0,2).flatMap(p=>[-1,1].map(sign=>p.map(v=>v+sign*a[2]/Math.SQRT2)));
    for(const[x,y,z]of points){
      assert.ok(Math.abs(x)<=dimensions.width/2&&Math.abs(z)<=dimensions.depth/2);
      assert.ok(y>=0&&y<=dimensions.height);
    }
  }
  assert.ok(shapes.some(s=>s.kind==='Box'&&Math.abs(s.args[0][1]+s.args[1][1]/2-.43)<1e-10));
  assert.equal(dimensions.backTop,1.03);
  assert.ok(1.62-ROOF_CITY_SEAT.eyeDrop>dimensions.backTop+.12,
    'the city eye and the later backward look clear the actual back');
  assert.equal(materials.length,2,'reuse existing nonemissive roof materials');
});

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors,
  edgePortals:conservatory.edgePortals,doors:conservatory.doors});
P.propsInit(FP);

test('compiled prop and borrowed camera share the intended east edge anchor',()=>{
  const bench=P.propById(ROOF_CITY_SEAT.id),render=P.renderInstances({group:'academicRoof'}).find(p=>p.id===bench.id);
  assert.ok(bench&&render);assert.equal(bench.blocks,true);
  assert.deepEqual([bench.rx,bench.ry],[424,580]);
  assert.deepEqual([render.x,render.y,render.z],[95,17,22]);
  const at=FP.logicalToPhysical(bench.rx,bench.ry);
  assert.deepEqual([(at.x+.5)*.5,FP.floorAt(bench.rx,bench.ry)+1.62-ROOF_CITY_SEAT.eyeDrop,(at.z+.5)*.5],
    [95.25,18.16,22.25]);
  assert.equal(render.yaw,-Math.PI/2,'bench +Z faces east, out from the roof');
  assert.equal(ROOF_CITY_SEAT.yaw,1.50,'camera avoids the east guard upright');
  assert.equal(ROOF_CITY_SEAT.pitch,-.21);
  const forward=[Math.sin(ROOF_CITY_SEAT.yaw),-Math.cos(ROOF_CITY_SEAT.yaw)];
  assert.ok(forward[0]>.99&&Math.abs(forward[1])<.08,'view faces away from the school roof');
});

test('safe approach remains walkable and focusable while ladder, vent and rehearsal rest stay clear',()=>{
  const bench=P.propById(ROOF_CITY_SEAT.id);
  const x=ROOF_CITY_SEAT.approach.x*2,y=ROOF_CITY_SEAT.approach.y*2;
  assert.equal(FP.floorAt(x,y),17);assert.equal(P.propCanOccupy(x,y),true);
  assert.equal(P.propCanOccupy(bench.rx,bench.ry),false,'the authored stone bench has real collision');
  const focus=P.pickProp(x,y,1,2,{yaw:1.5,pitch:-.55,eyeHeight:1.62});
  assert.equal(focus?.id,ROOF_CITY_SEAT.id,'the approach reaches this bench through ordinary E focus');
  const footprint=p=>{
    const c=Math.abs(Math.cos(p.yaw||0)),s=Math.abs(Math.sin(p.yaw||0));
    const rx=(p.w*c+p.d*s)/2,rz=(p.w*s+p.d*c)/2;
    return{x0:p.x-rx,x1:p.x+rx,z0:p.y-rz,z1:p.y+rz};
  };
  const b=footprint(bench);
  for(const id of['roof-shortcut-top','roof-listening-vent','roof-rehearsal-rest']){
    const p=P.propById(id);assert.ok(p);
    const other=footprint(p);
    assert.ok(b.x1<other.x0||b.x0>other.x1||b.z1<other.z0||b.z0>other.z1,`${id} has no overlapping furniture`);
  }
  const chair={x:ROOF_CITY_SEAT.at.x-7,y:ROOF_CITY_SEAT.at.y};
  assert.equal(FP.floorAt(chair.x*2,chair.y*2),17);
  assert.equal(P.propCanOccupy(chair.x*2,chair.y*2),true,'the later figure/chair can occupy the real forecourt');
  assert.ok(chair.y>ACADEMIC_ROOF.glass.y1,'the behind location stays off the glass');
});
