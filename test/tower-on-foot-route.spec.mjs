import assert from 'node:assert/strict';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { DOOR_BY_ID } from '../src/data/conservatory-doors.js';
import { MAIN_EXIT_CELL, PAGES } from '../src/data/conservatory-script.js';
import {
  BELL_CHAMBER_ANCHOR,
  BELL_RELAY_CLAMP_AUTHORED,
  CHAPEL_SCREEN_AUTHORED,
  RINGING_ROOM_ANCHOR,
  SHUTTER_WINCH_AUTHORED,
} from '../src/data/bell-tower-layout.js';
import { STORY_ROUTE_DOOR_IDS, doorWinsWorldInteraction } from '../src/game/interaction-focus.js';
import * as PROPS from '../src/game/props.js';
import * as FP from '../src/world/floorplan.js';

FP.compile(conservatory.levels,{
  width:conservatory.width,
  height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,
  connectors:conservatory.connectors,
  edgePortals:conservatory.edgePortals,
  doors:conservatory.doors,
});
PROPS.propsInit(FP);
FP.setSpawn(conservatory.spawn.x,conservatory.spawn.y);
FP.resetDoors();

const expectedKeys={
  'pool-lobby':null,
  'foh-office':'master',
  'chapel-c17':'chapel',
  'tower-hatch':'tower-live',
  'bell-chamber-entry':'tower-live',
  'organ-loft-service':'tower-cleared',
  'organ-loft-nave':'tower-cleared',
};
assert.deepEqual([...STORY_ROUTE_DOOR_IDS].sort(),Object.keys(expectedKeys).sort());
for(const [id,key] of Object.entries(expectedKeys)){
  assert.equal(DOOR_BY_ID[id]?.key??null,key,`${id} has the intended route-door access`);
}

assert.equal(doorWinsWorldInteraction(
  {aimScore:.20},
  {aimScore:.50,portal:{id:'bell-chamber-entry'}},
),true,'a route door beats the plaque beside it inside the protected tie range');
assert.equal(doorWinsWorldInteraction(
  {aimScore:.20},
  {aimScore:.50,portal:{id:'ordinary-door'}},
),false,'ordinary prop inspection retains precise reticle priority');

const key=(x,y)=>`${Math.round(x)},${Math.round(y)}`;
function walkByPlayerInteraction(from,to,keys,{radius=3,maxVisited=520000}={}){
  const start={x:Math.round(from.x),y:Math.round(from.y)};
  const goal={x:Math.round(to.x),y:Math.round(to.y)};
  const queue=[start],seen=new Set([key(start.x,start.y)]),opened=[];
  for(let index=0;index<queue.length&&index<maxVisited;index+=1){
    const at=queue[index];
    if(Math.hypot(at.x-goal.x,at.y-goal.y)<=radius)return{at,opened,visited:index+1};
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=at.x+dx,ny=at.y+dy;
      let move=FP.canStep(at.x,at.y,nx,ny,{keys});
      if(!move.ok&&(move.why==='closed'||move.why==='locked')){
        const portal=FP.doorAt(nx,ny);
        if(portal&&(!portal.keyId||keys.has(portal.keyId))){
          const result=FP.interactDoor(at.x,at.y,[dx,dy],keys);
          if(result?.ok&&result.id===portal.id){
            FP.tickDoors(3,{playerX:at.x,playerY:at.y});
            opened.push(result.id);
            move=FP.canStep(at.x,at.y,nx,ny,{keys});
          }
        }
      }
      if(!move.ok)continue;
      const next=move.redirect||{x:nx,y:ny};
      const nextKey=key(next.x,next.y);
      if(seen.has(nextKey)||!PROPS.propCanOccupy(next.x,next.y))continue;
      seen.add(nextKey);queue.push(next);
    }
  }
  assert.fail(`normal player route failed from ${key(from.x,from.y)} to ${key(to.x,to.y)} with keys ${[...keys].join(',')}`);
}

const runtime=(authored)=>FP.toRuntimePoint(authored);
const interactionPoint=(id)=>{
  const prop=PROPS.propById(id);
  assert.ok(prop,`${id} is present`);
  return{x:prop.interactionRx,y:prop.interactionRy};
};
const doorIsOpen=(id)=>FP.doorState().find((door)=>door.id===id)?.open===true;

let position=FP.spawn();
let keys=new Set(['master']);

// Page 6 is physically reachable, then the FOH office can be entered and the
// literal C-17 ring can be reached without a debug spawn.
let leg=walkByPlayerInteraction(position,runtime(PAGES.find((page)=>page.id==='page-6').at),keys);
position=leg.at;
leg=walkByPlayerInteraction(position,interactionPoint('box-office-ledger'),keys,{radius:1});
assert.equal(doorIsOpen('foh-office'),true,'the standard master key opens the FOH office through the public door interaction');
position=leg.at;
position=walkByPlayerInteraction(position,interactionPoint('box-office-key-ring-c17'),keys,{radius:1}).at;

// Taking the physical ring issues the chapel key in gameplay; model that inventory
// result, then keep walking through C-17 and the inner screen.
keys=new Set([...keys,'chapel']);
leg=walkByPlayerInteraction(position,runtime(CHAPEL_SCREEN_AUTHORED),keys);
assert.equal(doorIsOpen('chapel-c17'),true,'C-17 opens from the acquired chapel keyring');
position=leg.at;

// Source completion issues tower-live. Every tower threshold is opened by the
// same interaction function the player uses, and every walked cell is prop-clear.
keys=new Set([...keys,'tower-live']);
position=walkByPlayerInteraction(position,runtime(RINGING_ROOM_ANCHOR),keys).at;
leg=walkByPlayerInteraction(position,runtime(BELL_CHAMBER_ANCHOR),keys);
assert.equal(doorIsOpen('tower-hatch'),true,'the tower hatch is player-opened');
assert.equal(doorIsOpen('bell-chamber-entry'),true,'the bell chamber entry is player-opened');
position=leg.at;
position=walkByPlayerInteraction(position,runtime(BELL_RELAY_CLAMP_AUTHORED),keys,{radius:4}).at;
position=walkByPlayerInteraction(position,runtime(SHUTTER_WINCH_AUTHORED),keys).at;

// Relay completion issues tower-cleared, but does not teleport or force doors
// open. The player operates both descent leaves and reaches the chapel.
keys=new Set([...keys,'tower-cleared']);
leg=walkByPlayerInteraction(position,runtime({x:98,y:82}),keys);
assert.equal(doorIsOpen('organ-loft-service'),true,'the service stair is player-opened after the relay');
assert.equal(doorIsOpen('organ-loft-nave'),true,'the nave threshold is player-opened after the relay');
position=leg.at;
walkByPlayerInteraction(position,runtime(MAIN_EXIT_CELL),keys);

console.log('complete non-God tower route passed');
