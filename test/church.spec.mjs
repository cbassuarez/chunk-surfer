import assert from 'node:assert/strict';

import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { conservatory as d } from '../src/data/floorplan/conservatory.js';
import { F, ZONE, ZONE_WORLD } from '../src/data/floorplan/legend.js';
import {
  CHURCH, CHURCH_BOUNDS, CHURCH_BUTTRESSES, CHURCH_COLLIDERS,
  CHURCH_HEIGHTS, CHURCH_LEVELS, churchDoorAt, churchRoomAt, churchWallAt,
} from '../src/data/st-brendans.js';
import { PROP_BOUNDS } from '../src/data/generated/prop-geometry.js';
import { STRUCTURAL_COLLIDERS } from '../src/data/conservatory-props.js';
import { ROOMS } from '../src/audio/manifest-map.js';
import { TARGETS } from '../src/data/conservatory-script.js';

FP.compile(d.levels,d);
PROPS.propsInit(FP);

// Cathedral modules have stable logical addresses and one shared physical plan.
const G=(x,y)=>FP.toRuntimePoint({x:112+x,y:125+y});
const L=(x,y)=>FP.toRuntimePoint({x:140+x,y:183+y});
const B=(x,y)=>FP.toRuntimePoint({x:170+x,y:169+y});
const Y=(x,y)=>FP.toRuntimePoint({x:50+x,y:200+y});
const key=(x,y)=>`${Math.floor(x)},${Math.floor(y)}`;

function flood(start,{props=false,limit=250000}={}){
  const queue=[[Math.floor(start.x),Math.floor(start.y)]],seen=new Set([key(...queue[0])]);
  for(let i=0;i<queue.length&&i<limit;i+=1){
    const[x,y]=queue[i];
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const step=FP.canStep(x,y,x+dx,y+dy,{keys:new Set()});
      if(!step.ok)continue;
      const nx=Math.floor(step.redirect?.x??x+dx),ny=Math.floor(step.redirect?.y??y+dy),k=key(nx,ny);
      if(seen.has(k)||(props&&!PROPS.propCanOccupy(nx,ny)))continue;
      seen.add(k);queue.push([nx,ny]);
    }
  }
  return seen;
}
const reached=(seen,p,radius=1)=>[...seen].some((entry)=>{
  const[x,y]=entry.split(',').map(Number);return Math.hypot(x-p.x,y-p.y)<=radius;
});

// Compact, layered ground plan with a separate identity from Ellery's chapel.
for(const[name,point,height]of[
  ['west nave',G(16,60),CHURCH_HEIGHTS.nave],
  ['crossing',G(16,73),CHURCH_HEIGHTS.crossing],
  ['choir',G(16,80),CHURCH_HEIGHTS.choir],
  ['side chapel',G(10,79),CHURCH_HEIGHTS.aisle],
  ['sacristy',G(22,79),CHURCH_HEIGHTS.aisle],
]){
  const cell=FP.cellAt(point.x,point.y),physical=FP.logicalToPhysical(point.x,point.y);
  assert.ok(cell,name);assert.equal(cell.zone,ZONE.church,name);assert.equal(cell.floor,0,name);
  assert.ok(Math.abs(cell.ceil-height)<.01,`${name} height`);
  assert.equal(physical.spaceId,CHURCH_LEVELS.ground.id,name);
}
assert.equal(ZONE_WORLD[ZONE.church],'st_brendans');
assert.notEqual(ZONE_WORLD[ZONE.church],ZONE_WORLD[ZONE.chapel]);
assert.notEqual(ZONE_WORLD[ZONE.church],ZONE_WORLD[ZONE.bellTower]);
assert.equal(ROOMS.st_brendans.world,'lux_nova');
assert.ok(ROOMS.st_brendans.roomTone.character>ROOMS.lux_nova.roomTone.character);
assert.equal(TARGETS.includes('st_brendans'),false,'the cathedral is not a take target');

// The exterior slice retains continuous tarmac under a mesh-owned building.
{
  const observer=Y(16,45),slice=FP.physicalRenderPlanFor(observer.x,observer.y);
  const sample=(point)=>{
    const physical=FP.logicalToPhysical(point.x,point.y);
    const i=(Math.round(physical.z)-slice.originY)*slice.w+(Math.round(physical.x)-slice.originX);
    assert.ok(i>=0&&i<slice.w*slice.h);
    return{solid:slice.solid[i],floor:slice.floor[i],ceil:slice.ceil[i],flags:slice.flags[i]};
  };
  for(const[point,row]of[[G(16,60),60],[G(16,73),73],[G(16,80),80],[G(9,72),72]]){
    const cell=sample(point),yard=sample(Y(34,row));
    assert.equal(cell.solid,0);assert.ok(cell.floor>-1);assert.equal(cell.ceil,yard.ceil);
    assert.ok(cell.flags&F.SKY);
  }
}

// Outside starts cannot enter, even after a debug command forces both leaves
// open. The hidden yard copy of every occupied cathedral cell is also solid,
// so the player cannot noclip through the mesh while staying on the yard layer.
for(let y=CHURCH_BOUNDS.y0;y<=CHURCH_BOUNDS.y1;y+=1){
  for(let x=CHURCH_BOUNDS.x0;x<=CHURCH_BOUNDS.x1;x+=1){
    if(churchRoomAt(x,y)||churchDoorAt(x,y)||churchWallAt(x,y)){
      const yard=Y(x,y);
      assert.equal(FP.isSolid(yard.x,yard.y),true,`yard underlay open at ${x},${y}`);
    }
  }
}
FP.setAllDoorsOpen(true);
{
  const outside=flood(Y(16,53));
  assert.ok(reached(outside,Y(16,54)),'the yard reaches the west threshold');
  for(const point of[G(16,57),G(22,73),G(16,60),G(16,73)]){
    assert.equal(reached(outside,point),false,'yard flood entered St Brendan\'s');
  }
}

// Conversely an interior hook reaches every ground room, both upper walks, the
// belfry and both outbound yard landings. This proves the opposing stair route,
// not merely isolated debug destinations.
{
  const inside=flood(G(16,60));
  for(const[name,point]of[
    ['crossing',G(16,73)],['choir',G(16,80)],['side chapel',G(10,79)],['sacristy',G(22,79)],
    ['organ loft',L(16,59)],['north triforium',L(10,68)],['south triforium',L(21,78)],['belfry',B(15,72)],
    ['west yard',Y(16,54)],['south porch yard',Y(25,73)],
  ])assert.ok(reached(inside,point,2),`${name} is outside the cathedral circuit`);
}

// Direction is enforced at both interaction and traversal boundaries. An open
// save cannot reverse through the leaf, and leaving arms the closer.
for(const door of FP.doorState().filter((entry)=>entry.id.startsWith('brendan-'))){
  assert.equal(door.access,'exit-only',door.id);assert.ok([-1,1].includes(door.insideSide),door.id);
  const axis=door.widthAxis==='x'?'y':'x',cross=axis==='x'?'y':'x';
  const inside={x:Math.round(door.cx),y:Math.round(door.cy)};
  const outside={...inside};
  inside[axis]+=door.insideSide*2;outside[axis]-=door.insideSide*2;
  inside[cross]=outside[cross]=Math.round(door[cross==='x'?'cx':'cy']);
  assert.equal(FP.canStep(outside.x,outside.y,Math.round(door.cx),Math.round(door.cy)).why,'exit-only',door.id);
  assert.equal(FP.canStep(inside.x,inside.y,Math.round(door.cx),Math.round(door.cy)).ok,true,door.id);
  assert.equal(FP.canStep(Math.round(door.cx),Math.round(door.cy),inside.x,inside.y).why,'exit-only',door.id);
  assert.equal(FP.canStep(Math.round(door.cx),Math.round(door.cy),outside.x,outside.y).ok,true,door.id);
  const facing=door.widthAxis==='x'?[0,door.insideSide]:[door.insideSide,0];
  assert.equal(FP.interactDoor(outside.x,outside.y,facing,new Set()).why,'exit-only',door.id);
}

// Every projected stone element has a live height-aware collider. Furnishings
// leave each God-hook cell clear; the hero prop's broad bounds block nothing.
for(const buttress of CHURCH_BUTTRESSES){
  assert.ok(CHURCH_COLLIDERS.some((entry)=>entry.id===`cathedral-buttress-${buttress.id}`),buttress.id);
  assert.ok(STRUCTURAL_COLLIDERS.some((entry)=>entry.id===`cathedral-buttress-${buttress.id}`),buttress.id);
  assert.ok(STRUCTURAL_COLLIDERS.some((entry)=>entry.id===`cathedral-buttress-${buttress.id}-yard`),`${buttress.id} yard collision`);
}
assert.equal(PROPS.propById('brendan-church').blocks,false);

// Mesh envelope and hierarchy: under 19 x 32 x 17.5m, with a central crossing
// tower/spire higher than the nave but no oversized west-work.
{
  const bounds=PROP_BOUNDS.st_brendan_church;assert.ok(bounds);
  const size=bounds.max.map((value,i)=>value-bounds.min[i]);
  assert.ok(size[0]<=19,`cathedral width ${size[0]}m`);
  assert.ok(size[2]<=32,`cathedral length ${size[2]}m`);
  assert.ok(bounds.max[1]<=17.5,`cathedral height ${bounds.max[1]}m`);
  assert.ok(bounds.max[1]>=CHURCH_HEIGHTS.spire-.01);
  assert.ok(CHURCH_HEIGHTS.belfry>CHURCH_HEIGHTS.nave);
  assert.equal(CHURCH.id,'st_brendan_church');
  assert.ok(CHURCH_BOUNDS.x1-CHURCH_BOUNDS.x0+1<=19);
  assert.ok(CHURCH_BOUNDS.y1-CHURCH_BOUNDS.y0+1<=32);
}

console.log("st brendan's cathedral specs passed");
