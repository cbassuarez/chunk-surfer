import assert from 'node:assert/strict';
import test from 'node:test';
import { CELL } from '../src/data/floorplan/legend.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { ACADEMIC_ROOF } from '../src/data/academic-roof.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { createInteractionLatch } from '../src/game/interaction-latch.js';

const syntheticPlan={
  isSolid:()=>false,
  floorAt:x=>x>=6?17:10,
  zoneAt:()=>0,
};
const aim=(px,py,x,y)=>Math.atan2(x-(px+.5)*CELL,-(y-(py+.5)*CELL));
const stacked=(reach=null)=>[
  {id:'lower-fixture',mesh:'tower_plaque',x:3,y:2,floorOverride:10,
    ...(reach==null?{}:{interactionFloorReach:reach})},
  {id:'upper-fixture',mesh:'tower_plaque',x:3,y:2,floorOverride:17},
];

test('stacked props only acquire from their reachable height, even at identical map coordinates',()=>{
  PROPS.propsInit(syntheticPlan,stacked());
  assert.equal(PROPS.pickProp(5,7,0,3.2,{yaw:aim(5,7,3,2),pitch:0})?.id,'lower-fixture');
  assert.equal(PROPS.pickProp(6,7,0,3.2,{yaw:aim(6,7,3,2),pitch:0})?.id,'upper-fixture');
  PROPS.propsInit(syntheticPlan,[stacked()[0]]);
  assert.equal(PROPS.pickProp(6,7,0,3.2,{yaw:aim(6,7,3,2),pitch:0}),null,
    'a visible fixture seven metres below cannot supply a roof prompt');
});

test('floor changes invalidate a retained target, while nearby stair-height fixtures remain eligible',()=>{
  PROPS.propsInit(syntheticPlan,[stacked()[0]]);
  const direct=PROPS.pickProp(5,7,0,3.2,{yaw:aim(5,7,3,2),pitch:0});
  const latch=createInteractionLatch();
  assert.equal(latch.update(direct,{nowMs:100})?.id,'lower-fixture');
  assert.equal(latch.update(null,{nowMs:200,resolve:id=>{
    const live=PROPS.propById(id);
    return PROPS.propWithinVerticalReach(6,7,live)?live:null;
  }}),null,'the grace period cannot carry an old-floor prompt through a shortcut');

  PROPS.propsInit(syntheticPlan,[{id:'stair-fixture',mesh:'tower_plaque',x:3,y:2,floorOverride:12.4}]);
  assert.equal(PROPS.pickProp(5,7,0,3.2,{yaw:aim(5,7,3,2),pitch:0})?.id,'stair-fixture',
    'an intermediate tread remains reachable from the lower landing');
  PROPS.propsInit(syntheticPlan,[stacked(7)[0]]);
  assert.equal(PROPS.pickProp(6,7,0,3.2,{yaw:aim(6,7,3,2),pitch:0})?.id,'lower-fixture',
    'an intentionally cross-level fixture can declare its reach');
});

test('Ren is acquired from the front and west approaches, and both ladder ends stay reachable',()=>{
  FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
    widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors,
    edgePortals:conservatory.edgePortals,doors:conservatory.doors});
  PROPS.propsInit(FP);
  for(const point of [{x:211,y:275},{x:208,y:275}]){
    const player=FP.toRuntimePoint(point),yaw=Math.atan2(ACADEMIC_ROOF.ren.x-point.x,
      -(ACADEMIC_ROOF.ren.y-point.y));
    assert.equal(FP.floorAt(player.x,player.y),17);
    assert.equal(PROPS.pickProp(player.x,player.y,0,3.2,{yaw,pitch:0})?.id,'roof-ren',
      `Ren's body owns the reticle from ${point.x},${point.y}`);
  }
  for(const [id,point] of [
    ['roof-gate',{x:44,y:243}],
    ['roof-shortcut-bottom',{x:44,y:265}],
    ['roof-shortcut-top',{x:211,y:294}],
  ]){
    const player=FP.toRuntimePoint(point),target=PROPS.propById(id);
    assert.equal(PROPS.pickProp(player.x,player.y,0,3.2,{
      yaw:aim(player.x,player.y,target.interactionX,target.interactionY),pitch:0,
    })?.id,id,`${id} remains focusable at its own landing`);
  }
});
