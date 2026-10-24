import test from 'node:test';
import assert from 'node:assert/strict';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {GOD_DOOR_HOOKS,GOD_LOCATION_HOOKS,GOD_PLACE_HOOKS,GOD_PLACE_SECTIONS} from '../src/data/god-hooks.js';
import {FACILITY_SPACES} from '../src/data/building-map.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors||[],edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});
PROPS.propsInit(FP);

test('Hall hook creates the physical render plan used by live study entry',()=>{
  const at=FP.toRuntimePoint(GOD_LOCATION_HOOKS['concert-hall'].at);
  const plan=FP.physicalRenderPlanFor(at.x,at.y);
  assert.equal(plan.group,'hall');
  assert.ok(plan.w>0&&plan.h>0);
  assert.equal(plan.rgba.length,plan.w*plan.h*4);
});

test('every God location is one authored scale conversion with its exact facing and context',()=>{
  assert.equal(Object.keys(GOD_LOCATION_HOOKS).length,82);
  for(const[id,hook]of Object.entries(GOD_LOCATION_HOOKS)){
    const at=FP.toRuntimePoint(hook.at),physical=FP.logicalToPhysical(at.x,at.y);
    assert.equal(FP.isSolid(at.x,at.y),false,id);
    assert.equal(PROPS.propCanOccupy(at.x,at.y),true,id);
    assert.equal(FP.zoneAt(at.x,at.y),hook.zone,id);
    assert.equal(physical.renderGroup,hook.group,id);
    assert.equal(physical.spaceId,hook.component,id);
    assert.ok(Math.abs(FP.floorAt(at.x,at.y)-hook.floor)<.12,id);
    assert.ok([0,1,2,3].includes(hook.facing),id);
    const twice=FP.toRuntimePoint(at);
    assert.notDeepEqual(twice,at,`${id} rejects the old double-scale path`);
  }
});

test('door showcases resolve stable ids on their authored circulation side',()=>{
  const doors=new Map(FP.doorState().map((door)=>[door.id,door]));
  assert.equal(Object.keys(GOD_DOOR_HOOKS).length,8);
  for(const hook of Object.values(GOD_DOOR_HOOKS)){
    const door=doors.get(hook.doorId);assert.ok(door,hook.doorId);
    const authored={x:FP.toAuthoredCoord(door.cx)+hook.normal[0]*hook.distance,y:FP.toAuthoredCoord(door.cy)+hook.normal[1]*hook.distance};
    const at=FP.toRuntimePoint(authored),physical=FP.logicalToPhysical(at.x,at.y);
    assert.equal(FP.isSolid(at.x,at.y),false,hook.doorId);
    assert.equal(FP.zoneAt(at.x,at.y),hook.zone,hook.doorId);
    assert.equal(physical.renderGroup,hook.group,hook.doorId);
    assert.equal(physical.spaceId,hook.component,hook.doorId);
    assert.equal(PROPS.propCanOccupy(at.x,at.y),true,hook.doorId);
    assert.ok(Math.abs(FP.floorAt(at.x,at.y)-hook.floor)<.12,hook.doorId);
  }
});

test('the PLACES tab lists every place hook once, and every room on the map has a warp',()=>{
  const listed=GOD_PLACE_SECTIONS.flatMap((section)=>section.hooks.map(([id])=>id));
  assert.deepEqual([...listed].sort(),Object.keys(GOD_PLACE_HOOKS).sort());
  assert.equal(new Set(listed).size,listed.length);
  for(const section of GOD_PLACE_SECTIONS)for(const [id,label] of section.hooks){
    assert.ok(GOD_LOCATION_HOOKS[id],id);assert.ok(label&&label===label.toUpperCase(),id);
  }
  // A room the map can name but the menu cannot reach is the gap this closes.
  for(const space of FACILITY_SPACES){
    const id=space.id.slice('space:'.length);
    const covered=GOD_LOCATION_HOOKS[id]||GOD_LOCATION_HOOKS[`place-${id}`]
      ||['loading-bay','get-in','atrium','academic-gallery','academic-roof','plant-room'].includes(id);
    assert.ok(covered,`${id} has no God warp`);
  }
});
