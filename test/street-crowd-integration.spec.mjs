import test from 'node:test';
import assert from 'node:assert/strict';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {CONSERVATORY_PROPS} from '../src/data/conservatory-props.js';
import {VIGIL_CROWD,vigilParts} from '../src/data/exterior-vigil.js';
import {exteriorLoreConversation} from '../src/data/exterior-lore.js';

FP.compile(conservatory.levels,conservatory);
PROPS.propsInit(FP);
const render=new Map(PROPS.renderInstances({inscriptions:false}).map(p=>[p.id,p]));
// These are the emitted locations before the character replacement. Authored
// vigil coordinates are quantized by the yard plan; district locals are not.
const baseline={
  'district-mews-neighbor':['exterior_mews_neighbor',-13,26,Math.PI/2,.82,.60,false],
  'district-pub-driver':['exterior_pub_driver',18,105,Math.PI,.88,.66,false],
  'vigil-crowd-east-1':['vigil_figure_placard_a',28,53.5,3.05,1.42,.76,true],
  'vigil-crowd-east-2':['vigil_figure_umbrella_a',30,51.5,3,1.06,.98,true],
  'vigil-crowd-east-3':['vigil_figure_pamphlets_a',30.5,53.5,2.75,1.42,.78,true],
  'vigil-crowd-east-4':['vigil_figure_seated_a',27.5,55,3.17,.82,.90,true],
  'vigil-crowd-west-1':['vigil_figure_umbrella_b',1.5,54.5,3.05,1.06,.98,true],
  'vigil-crowd-west-2':['vigil_figure_flask_a',3.5,55,3.12,.86,.76,true],
  'vigil-crowd-west-3':['vigil_figure_seated_b',7.5,54,2.95,.84,.92,true],
  'vigil-crowd-verge-1':['vigil_figure_placard_b',17.5,24.5,1.55,1.42,.76,true],
  'vigil-crowd-verge-2':['vigil_figure_umbrella_a',17.5,30,1.45,1.06,.98,true],
  'vigil-crowd-verge-3':['vigil_figure_flask_b',17.5,42,1.5,1.42,.78,true],
  'vigil-crowd-verge-4':['vigil_figure_pamphlets_b',17.5,45,1.55,.88,.76,true],
  'vigil-crowd-knot-1':['vigil_figure_camera_a',38,40.5,1.5,.96,.86,true],
  'vigil-crowd-knot-2':['vigil_figure_umbrella_b',41.5,46,1.35,1.06,.98,true],
  'vigil-crowd-knot-3':['vigil_figure_seated_a',44,41.5,1.6,.82,.90,true],
  'vigil-crowd-knot-4':['vigil_figure_placard_a',36.5,46,1.45,1.42,.76,true],
  'vigil-crowd-porch-1':['vigil_figure_umbrella_a',37.5,62.5,-1.5,1.06,.98,true],
  'vigil-crowd-porch-2':['vigil_figure_flask_b',39,66.5,-1.4,1.42,.78,true],
  'vigil-crowd-porch-3':['vigil_figure_camera_b',40.5,64,-1.55,.98,.88,true],
};

test('the twenty replacements preserve emitted locations, stable IDs and collision footprints',()=>{
  assert.equal(VIGIL_CROWD.length,18);
  assert.equal(Object.keys(baseline).length,20);
  for(const[id,[mesh,x,z,yaw,w,d,blocks]]of Object.entries(baseline)){
    assert.equal(CONSERVATORY_PROPS.filter(p=>p.id===id).length,1,id+' authored once');
    const prop=PROPS.propById(id),body=render.get(id);
    assert.ok(prop&&body,id+' survives floorplan compilation');
    assert.deepEqual([body.mesh,body.x,body.z,body.yaw,prop.w,prop.d,prop.blocks],[mesh,x,z,yaw,w,d,blocks],id+' physical contract');
    assert.equal(body.scale,1,id+' scales only its visual rig, not the physical world instance');
  }
});

test('the mews neighbor and pub driver retain their existing repeatable lore interactions',()=>{
  for(const id of['district-mews-neighbor','district-pub-driver']){
    const prop=PROPS.propById(id);
    assert.equal(prop.action,'exterior-lore');assert.equal(prop.loreId,id);
    assert.equal(prop.interactionPriority,3);
    const first=exteriorLoreConversation(id),again=exteriorLoreConversation(id,{revisited:true});
    assert.ok(first?.tree?.start?.lines?.length,id+' established dialogue remains reachable');
    assert.ok(again?.tree,id+' repeat interaction remains valid');
  }
  for(const actor of VIGIL_CROWD){
    const prop=PROPS.propById(actor.id);
    assert.equal(prop.interactive,false,actor.id+' remains background company');
    assert.equal(prop.blocks,true,actor.id+' remains a physical occupant');
    assert.equal(prop.action,undefined,actor.id+' does not acquire a placeholder conversation');
  }
});

test('the vigil keeps its linked signs and their exact body-relative placement',()=>{
  const expected=[
    ['vigil-crowd-east-1','vigil_part_sign_save'],
    ['vigil-crowd-east-3','vigil_part_sign_record'],
    ['vigil-crowd-verge-1','vigil_part_sign_strike'],
    ['vigil-crowd-knot-4','vigil_part_sign_chapel'],
    ['vigil-crowd-porch-2','vigil_part_sign_signed'],
  ];
  const links=vigilParts().filter(p=>p.actorId?.startsWith('vigil-crowd-'));
  assert.deepEqual(links.map(p=>[p.actorId,p.mesh]),expected);
  for(const part of links){
    const body=render.get(part.actorId),prop=PROPS.propById(part.id),piece=render.get(part.id);
    assert.ok(piece,part.id+' still emitted');
    assert.deepEqual([piece.x,piece.y,piece.z,piece.yaw],[body.x,body.y,body.z,body.yaw]);
    assert.equal(prop.blocks,false);assert.equal(prop.interactive,false);
  }
});
