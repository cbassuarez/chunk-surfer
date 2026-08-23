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
