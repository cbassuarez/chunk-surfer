import assert from 'node:assert/strict';

import { conservatory } from '../src/data/floorplan/conservatory.js';
import { ZONE } from '../src/data/floorplan/legend.js';
import { DOOR_STATE } from '../src/game/door-runtime.js';
import * as FP from '../src/world/floorplan.js';
import { canBeginGetInDoorEntry, getInEntryHasHappened, getInGoodsDoorAim, getInSessionAction } from '../src/game/get-in-door-entry.js';

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

const arrivalFlags={prologueDone:true};
for(const yOffset of[-1.1,0,1.1]){
  for(const x of [grey.cx-4,grey.cx-.5,grey.cx]){
    const position={x,y:grey.cy+yOffset};
    const dx=grey.cx-position.x,dy=grey.cy-position.y;
    const length=Math.hypot(dx,dy);
    const focus=FP.doorNear(position.x,position.y,length?[dx/length,dy/length]:[1,0],5);
    assert.equal(focus?.portal.id,grey.id,'both real goods leaves resolve from the outer threshold');
    assert.equal(canBeginGetInDoorEntry({portal:focus.portal,position,zone:FP.zoneAt(position.x,position.y),
      storyMode:true,inPlan:true,flags:arrivalFlags}),true,
    `arrival owns actual exterior/aperture position ${x},${position.y}, even without a room zone`);
  }
}
assert.equal(FP.zoneAt(grey.cx,grey.cy),ZONE.none,'regression fixture really stands in the unzoned aperture');
for(const leaf of[-2.4,-1.1,0,1.1,2.4]){
  assert.ok(getInGoodsDoorAim(grey,{x:grey.cx-.5,y:grey.cy+leaf},[1,0]),
    'an ordinary normal view can focus either wide leaf up close without pointing at the other leaf');
  assert.ok(getInGoodsDoorAim(grey,{x:grey.cx,y:grey.cy+leaf},[1,0]),'a restored threshold body can still reach its canonical pair');
}
assert.equal(getInGoodsDoorAim(grey,{x:grey.cx-.5,y:grey.cy},[-1,0]),null,'looking away never focuses a leaf behind the head');
assert.equal(getInGoodsDoorAim(grey,{x:grey.cx-.5,y:grey.cy+3.5},[1,0]),null,'adjacent masonry does not become a door target');
assert.equal(getInGoodsDoorAim(grey,{x:grey.cx-.5,y:grey.cy},[0,1]),null,'looking along the facade does not select the goods pair');
for(const [position,zone,patch] of [
  [{x:grey.cx+4,y:grey.cy},ZONE.getIn,{}],
  [{x:grey.cx+.5,y:grey.cy},ZONE.none,{}],
  [{x:grey.cx-4,y:grey.cy},ZONE.dock,{flags:{prologueDone:true,'title.shown':true}}],
  [{x:grey.cx-4,y:grey.cy},ZONE.dock,{flags:{}}],
  [{x:grey.cx-4,y:grey.cy},ZONE.dock,{retired:true}],
  [{x:grey.cx-4,y:grey.cy},ZONE.dock,{setupComplete:true}],
  [{x:grey.cx-4,y:grey.cy},ZONE.dock,{inSpecialSpace:true}],
  [{x:grey.cx-4,y:grey.cy},ZONE.dock,{active:true}],
  [{x:grey.cx-4,y:grey.cy},ZONE.dock,{portal:{...grey,id:'another-door'}}],
])assert.equal(canBeginGetInDoorEntry({portal:grey,position,zone,storyMode:true,inPlan:true,flags:arrivalFlags,...patch}),false,
  'inside, later memories, other doors and already completed commitments retain their own behavior');
assert.equal(canBeginGetInDoorEntry({portal:{id:grey.id,cx:8,cy:12,widthAxis:'x',insideSide:-1},
  position:{x:8,y:16},zone:ZONE.dock,storyMode:true,inPlan:true,flags:arrivalFlags}),true,
  'exterior ownership follows the authored portal normal and inside sign');

assert.equal(getInSessionAction({atGetIn:false,flags:arrivalFlags}),'outside',
  'CONTINUE after talking to the lodge must not begin the indoor torch/recorder lesson');
assert.equal(getInSessionAction({atGetIn:true,flags:arrivalFlags}),'title',
  'a pre-setup save already inside from the old bypass recovers its missing title and drive');
for(const patch of [{hasRealTake:true},{flags:{...arrivalFlags,'setup.levels':true}},
  {flags:{...arrivalFlags,'combat.trained':true}},
  {flags:{...arrivalFlags,'title.shown':true}}]){
  assert.equal(getInSessionAction({atGetIn:true,flags:arrivalFlags,...patch}),'tutorial',
    'existing progressed or intentionally skipped runs never replay the arrival title');
}
assert.equal(getInSessionAction({atGetIn:true,flags:{...arrivalFlags,'dock.departed':true}}),'title',
  'a stale departure inferred from an outdoor detour cannot impersonate indoor progress');
assert.equal(getInEntryHasHappened({flags:{prologueDone:true,'dock.departed':true}}),false);
assert.equal(getInEntryHasHappened({flags:{'setup.levels':true}}),true);
assert.equal(getInEntryHasHappened({hasRealTake:true}),true);
const pendingFlags={...arrivalFlags,'title.shown':true,'opening.driveTeaser.pending':true};
assert.equal(getInSessionAction({atGetIn:true,flags:pendingFlags}),'drive','interrupted title resumes its pending drive');
assert.equal(getInSessionAction({atGetIn:false,flags:pendingFlags}),'outside','no drive scene starts from an exterior save');
assert.equal(getInSessionAction({atGetIn:true,flags:{...pendingFlags,'opening.driveTeaser.consumed':true}}),'tutorial',
  'an interrupted or completed consumed memory does not replay on CONTINUE');
assert.equal(getInSessionAction({atGetIn:true,flags:arrivalFlags,handoffStarted:true}),'complete');
assert.equal(getInSessionAction({atGetIn:true,flags:arrivalFlags,setupComplete:true}),'complete');

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
