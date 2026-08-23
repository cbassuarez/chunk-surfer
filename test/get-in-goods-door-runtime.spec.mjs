import assert from 'node:assert/strict';

import { conservatory } from '../src/data/floorplan/conservatory.js';
import { ZONE } from '../src/data/floorplan/legend.js';
import { DOOR_STATE } from '../src/game/door-runtime.js';
import * as FP from '../src/world/floorplan.js';

FP.compile(conservatory.levels,{
  width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
  connectors:conservatory.connectors,edgePortals:conservatory.edgePortals,doors:conservatory.doors,
});
FP.resetDoors();

const grey=FP.doorState().find((door)=>door.id==='dock-grey-exterior');
const greyState=()=>FP.doorState().find((door)=>door.id===grey.id);
assert.ok(grey);
assert.deepEqual(grey.activeLeaves,[0,1],'both goods leaves share the canonical interaction portal');
assert.equal(grey.closer,'standard');

const outside={x:grey.cx-4,y:grey.cy};
const opened=FP.interactDoor(outside.x,outside.y,[1,0],new Set(['master']));
assert.equal(opened?.id,grey.id);
assert.equal(opened.opened,true);
FP.tickDoors(2,{playerX:outside.x,playerY:outside.y});
assert.equal(greyState().state,DOOR_STATE.OPEN,'the closer waits while the player remains on the arrival side');

const inside={x:grey.cx+4,y:grey.cy};
assert.equal(FP.zoneAt(inside.x,inside.y),ZONE.getIn,'the cleared side is Get In');
const closingEvents=FP.tickDoors(.01,{playerX:inside.x,playerY:inside.y});
assert.ok(closingEvents.some((event)=>event.id===grey.id&&event.type==='closing'),
  'fully clearing the threshold into Get In arms the standard crossing closer');
FP.tickDoors(3,{playerX:inside.x,playerY:inside.y});
assert.equal(greyState().state,DOOR_STATE.CLOSED,'both leaves close behind the player');

for(const yOffset of[-1.1,0,1.1]){
  const player={x:grey.cx+4,y:grey.cy+yOffset};
  const dx=grey.cx-player.x,dy=grey.cy-player.y,length=Math.hypot(dx,dy);
  assert.equal(FP.doorNear(player.x,player.y,[dx/length,dy/length],5)?.portal?.id,grey.id,
    `the Get In reticle resolves the goods pair from approach offset ${yOffset}`);
}

console.log('get-in goods door runtime contracts passed');
