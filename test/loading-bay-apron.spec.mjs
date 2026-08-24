import test from 'node:test';
import assert from 'node:assert/strict';
import { ZONE } from '../src/data/floorplan/legend.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { shouldHideCrossEnvelopeProp } from '../src/game/prop-visibility.js';

FP.compile(conservatory.levels,{
  width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,
  connectors:conservatory.connectors,edgePortals:conservatory.edgePortals,
  doors:conservatory.doors,
});
const placed=PROPS.propsInit(FP);
const byId=new Map(placed.map((prop)=>[prop.id,prop]));
const rendered=new Map(PROPS.renderInstances({group:'ground'}).map((prop)=>[prop.id,prop]));
const ids=[
  'bay-apron-route-board','bay-apron-conduit-north','bay-apron-bulkhead-north',
  'bay-apron-loading-notice','bay-apron-conduit-south','bay-apron-bulkhead-south',
  'bay-apron-bay-number','bay-apron-isolator',
];

test('loading-bay apron has fixed dressing on every closed wall',()=>{
  for(const id of ids){
    const prop=byId.get(id),instance=rendered.get(id);
    assert.ok(prop,`${id} is placed`);
    assert.ok(prop.wallContact,`${id} resolves onto floorplan masonry`);
    assert.equal(prop.blocks,false,`${id} cannot obstruct the arrival route`);
    assert.ok(instance,`${id} is submitted in the ground render group`);
    assert.equal(shouldHideCrossEnvelopeProp(instance,{observerZone:ZONE.dock}),false,
      `${id} survives the exterior sightline filter`);
  }
  assert.deepEqual(new Set(ids.map((id)=>`${byId.get(id).wallContact.nx},${byId.get(id).wallContact.ny}`)),
    new Set(['0,1','0,-1','-1,0']),
    'north, south and door-return walls all carry fixtures');
});

test('loading-bay access is two broad stair flights, never one hidden connector tile',()=>{
  const access=FP.edgePortalState().filter((portal)=>portal.id.startsWith('loading-bay-'));
  assert.deepEqual(access.map(({id,width,lanes})=>({id,width,lanes})),[
    {id:'loading-bay-north-steps',width:2,lanes:4},
    {id:'loading-bay-goods-steps',width:3,lanes:6},
  ]);
  assert.equal(FP.connectorDestination(100,22),null,'the retired single-cell apron keyhole is gone');

  for(const portal of access)for(const pair of portal.pairs){
    const out=FP.canStep(pair.from.x,pair.from.y,pair.from.x-1,pair.from.y);
    assert.equal(out.ok,true,`${portal.id} lane leaves the apron`);
    assert.deepEqual(out.redirect,pair.to,`${portal.id} lane lands on its matching stair head`);
    const back=FP.canStep(pair.to.x,pair.to.y,pair.to.x+1,pair.to.y);
    assert.equal(back.ok,true,`${portal.id} lane returns from the yard`);
    assert.deepEqual(back.redirect,pair.from,`${portal.id} lane returns to the matching apron cell`);
    assert.ok(Math.abs(FP.floorAt(pair.from.x,pair.from.y)-FP.floorAt(pair.to.x,pair.to.y))<.45,
      `${portal.id} lane stays within an ordinary riser`);
  }
});

test('the goods-door stair becomes a clear, straight pedestrian approach',()=>{
  const goods=FP.edgePortalState().find((portal)=>portal.id==='loading-bay-goods-steps');
  const door=FP.doorState().find((portal)=>portal.id==='dock-grey-exterior');
  assert.ok(goods&&door);
  FP.setDoorOpen(door.id,true);
  for(const pair of goods.pairs){
    for(let x=pair.from.x;x<=Math.floor(door.cx)-1;x+=1){
      assert.ok(FP.cellAt(x,pair.from.y),`lane ${pair.from.y} remains authored at ${x}`);
      assert.equal(PROPS.propCanOccupy(x,pair.from.y),true,`lane ${pair.from.y} remains uncluttered at ${x}`);
      if(x>pair.from.x)assert.equal(FP.canStep(x-1,pair.from.y,x,pair.from.y,{keys:new Set(['master'])}).ok,true,
        `lane ${pair.from.y} walks directly toward the goods doors`);
    }
  }
});

test('visible dock access construction matches the collision-owned flights',()=>{
  const access=byId.get('yard-dock-access'),instance=rendered.get('yard-dock-access');
  assert.ok(access&&instance,'the two stair flights have visible construction');
  assert.equal(access.mesh,'yard_dock_access');
  assert.equal(access.structural,true);
  assert.equal(access.blocks,false,'the mesh never adds a second collision envelope');
  assert.equal(access.elevation,.85,'the mesh origin is lifted from yard floor to apron datum');
  assert.equal(shouldHideCrossEnvelopeProp(instance,{observerZone:ZONE.dock}),false,
    'stair nosings and handrails survive the loading-bay sightline filter');
});
