import test from 'node:test';
import assert from 'node:assert/strict';
import {atriumAccessReport,atriumBodyRoute} from '../tools/chunk_surfer/audit-atrium-access.mjs';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {PUBLIC_SANITARY_CORE} from '../src/data/building-amenities.js';
import {GARDEN_LAYOUTS} from '../src/game/garden-drift.js';
import {HALL_STAGE_SERVICE_STAIR as S,hallServiceTreadHeight} from '../src/data/atrium-circulation.js';
import {buildHallServiceStair} from '../tools/chunk_surfer/hall-service-stair-geometry.mjs';

const report=atriumAccessReport();
test('every usable foyer doorway has an ordinary outward and return body path through its own leaf',()=>{
  for(const route of report.routes){
    assert.equal(route.reachable,true,`${route.id}: outward`);
    assert.equal(route.returnable,true,`${route.id}: return`);
    assert.equal(route.throughDoor,true,`${route.id}: a detour through a different door cannot validate this leaf`);
    for(const edge of route.path){
      assert.equal(FP.canStep(edge.from.x,edge.from.y,edge.to.x,edge.to.y,{keys:new Set(['master'])}).ok,true);
      assert.equal(PROPS.propCanOccupy(edge.to.x,edge.to.y,{from:edge.from}),true);
    }
  }
  assert.deepEqual(report.rearAisle.blocked,[],'the complete2m rear cross aisle is protected, not just a shortest-path centreline');
  assert.equal((PUBLIC_SANITARY_CORE.x1-PUBLIC_SANITARY_CORE.x0)*(PUBLIC_SANITARY_CORE.y1-PUBLIC_SANITARY_CORE.y0),24.5,
    'turning the core preserves the full sanitary accommodation');
  const directory=PROPS.propById('atrium-public-directory'),at={x:159,y:17};
  const dx=directory.interactionX-(at.x+.5)*.5,dy=directory.interactionY-(at.y+.5)*.5;
  const pitch=Math.atan2(directory.elevation+(directory.h||.55)*.5-1.58,Math.hypot(dx,dy));
  assert.equal(PROPS.propCanOccupy(at.x,at.y),true);
  assert.equal(PROPS.pickProp(at.x,at.y,0,2,{yaw:Math.atan2(dx,-dy),pitch})?.id,directory.id,
    'the public directory is readable from the public promenade, rather than trapped inside the WC');
});

test('WC privacy, staff key and front closure survive the circulation repair',()=>{
  for(const id of['public-wc-large','public-wc-standard']){
    const door=FP.doorState().find(d=>d.id===id),cell=door.cells[0];
    FP.setDoorOpen(id,false);
    assert.equal(FP.canStep(cell.x+1,cell.y,cell.x,cell.y,{keys:new Set(['master'])}).ok,false,`${id}: closed privacy leaf`);
    FP.setDoorOpen(id,true);
  }
  FP.setDoorOpen('foh-office',false);
  assert.equal(atriumBodyRoute(report.start,report.routes.find(r=>r.id==='box-office').at),null,
    'the stage service passage cannot bypass the keyed office frontage');
  FP.setDoorOpen('foh-office',true);
  const front=FP.doorState().find(d=>d.id==='front-main');
  assert.equal(front.open,false);assert.equal(front.keyId,'closure-order');
  const hall=FP.doorState().find(d=>d.id==='hall-vestibule');
  assert.deepEqual(hall.activeLeaves,[0,1],'both visible public leaves open, matching the full passage');
});

test('every unobserved garden arrangement clears the WC and protected rear aisle',()=>{
  const planter=PROPS.propById('academic-garden-planter-west');
  for(const layout of GARDEN_LAYOUTS){
    const pose=layout.poses[planter.id],yaw=planter.yaw+pose.dyaw;
    const x=planter.x+pose.dx,y=planter.y+pose.dz;
    const rx=Math.abs(Math.cos(yaw))*planter.w/2+Math.abs(Math.sin(yaw))*planter.d/2;
    const ry=Math.abs(Math.sin(yaw))*planter.w/2+Math.abs(Math.cos(yaw))*planter.d/2;
    assert.ok(y+ry+.2<12,`${layout.id}: the visible planter cannot drift into the public cross aisle`);
    assert.ok(x-rx-.2>PUBLIC_SANITARY_CORE.x1,`${layout.id}: no WC intersection after the player looks away`);
  }
});

test('stage service treads and rails are real geometry at the actual collision heights',()=>{
  const meshes=new Map(),add=kind=>(m,...args)=>m.parts.push({kind,args});
  buildHallServiceStair({mesh:name=>{const m={name,parts:[]};meshes.set(name,m);return m;},
    MAT:{wood:0,dark:1,brass:2},addBox:add('box'),addBeam:add('beam')});
  const mesh=meshes.get(S.mesh);assert.ok(mesh);
  const tops=mesh.parts.filter(p=>p.kind==='box'&&p.args[1][1]===.05);
  assert.equal(tops.length,8);
  for(let i=0;i<8;i++){
    const x=200+i,h=FP.floorAt(x,21);
    assert.ok(Math.abs(h-hallServiceTreadHeight(i))<1e-6);
    assert.ok(Math.abs(tops[i].args[0][1]+.025-h)<1e-6);
    assert.ok(FP.ceilAt(x,21)-h>2.6);
    if(i)assert.ok(Math.abs(h-FP.floorAt(x-1,21))<.22,'each ordinary riser is under220mm');
  }
  assert.equal(FP.floorAt(199,22),0,'the outer leaf has a flush guarded landing');
  assert.equal(FP.floorAt(208,21),-1.5,'the run joins the unchanged actual stage');
  assert.ok(mesh.parts.some(p=>p.kind==='beam'),'the drop is guarded by visible handrails');
});
