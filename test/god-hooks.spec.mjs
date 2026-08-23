import test from 'node:test';
import assert from 'node:assert/strict';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {GOD_DOOR_HOOKS,GOD_LOCATION_HOOKS} from '../src/data/god-hooks.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors||[],edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});
PROPS.propsInit(FP);

test('every God location is one authored scale conversion with its exact facing and context',()=>{
  assert.equal(Object.keys(GOD_LOCATION_HOOKS).length,19);
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
