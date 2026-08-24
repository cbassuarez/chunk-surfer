import assert from 'node:assert/strict';

import {
  GET_IN_DOOR_ENTRY,
  getInDoorEntryFrame,
  getInDoorEntryPose,
} from '../src/game/get-in-door-entry.js';

const goods={cx:114.5,cy:20.5,widthAxis:'y',insideSide:1};
const origin={x:110.5,y:20,yaw:0,pitch:.08};
const entry=getInDoorEntryPose(goods,origin);
assert.equal(entry.x,118.5,'the landing clears the closer by four runtime cells');
assert.equal(entry.y,20.5,'the body walks through the centre of the three-metre aperture');
assert.ok(Math.abs(entry.yaw-Math.PI/2)<1e-9,'the authored look faces east into the Get-In');

const held=getInDoorEntryFrame({origin,entry,elapsed:GET_IN_DOOR_ENTRY.openingHold*.8});
assert.equal(held.x,origin.x,'the body waits on the weather side while the heavy leaves clear');
assert.equal(held.phase,'opening');
const crossing=getInDoorEntryFrame({origin,entry,elapsed:2.2});
assert.equal(crossing.phase,'crossing');
assert.ok(crossing.x>origin.x&&crossing.x<entry.x,'the world view physically crosses the threshold');
const done=getInDoorEntryFrame({origin,entry,elapsed:GET_IN_DOOR_ENTRY.duration});
assert.equal(done.done,true);
assert.equal(done.x,entry.x);
assert.equal(done.y,entry.y);

const reduced=getInDoorEntryFrame({origin,entry,elapsed:2.2,reducedMotion:true});
assert.equal(reduced.floorOffset,0,'reduced motion removes stride bob without changing path or timing');
assert.equal(reduced.x,crossing.x);

const northDoor=getInDoorEntryPose({cx:8,cy:12,widthAxis:'x',insideSide:-1},{x:8,y:16});
assert.deepEqual({x:northDoor.x,y:northDoor.y},{x:8,y:8},'the helper follows authored axis and inside side rather than hard-coded Get-In coordinates');

console.log('get-in door entry motion contracts passed');
