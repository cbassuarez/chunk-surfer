import assert from 'node:assert/strict';
import { ZONE } from '../src/data/floorplan/legend.js';
import fs from 'node:fs';
import { CONSERVATORY_PROPS, PROP_MESH } from '../src/data/conservatory-props.js';
import {
  OPENING_STREET_ASSETS,
  OPENING_STREET_CAPTURE_PRESETS,
  OPENING_STREET_MESHES,
  OPENING_STREET_PARK,
  OPENING_STREET_PROPS,
  OPENING_STREET_REVIEW_INSTANCE,
} from '../src/data/opening-street.js';
import { shouldHideCrossEnvelopeProp } from '../src/game/prop-visibility.js';

const stats=JSON.parse(fs.readFileSync('public/assets/opening-street.stats.json','utf8'));
assert.equal(Object.keys(OPENING_STREET_ASSETS).length,13);
assert.equal(Object.keys(OPENING_STREET_MESHES).length,4);
assert.equal(OPENING_STREET_PROPS.length,11);
assert.equal(OPENING_STREET_CAPTURE_PRESETS.length,5);
assert.deepEqual(OPENING_STREET_CAPTURE_PRESETS.map((preset)=>preset.id),[
  'arrival','frontage','service-lane-entrance','service-yard','modern-annex',
]);
assert.ok(OPENING_STREET_PROPS.every((prop)=>prop.blocks===false&&prop.interactive===false));
assert.equal(OPENING_STREET_PROPS.filter((prop)=>prop.mesh==='opening_street_tree_small').length,1);
assert.deepEqual(OPENING_STREET_PARK.bounds,{x0:62,x1:76,y0:195.5,y1:203});
assert.equal(OPENING_STREET_PARK.blocks,false);
assert.equal(OPENING_STREET_PARK.treeId,'opening-street-municipal-tree');
for(const id of OPENING_STREET_PARK.furnitureIds){
  assert.ok(OPENING_STREET_PROPS.some((prop)=>prop.id===id&&prop.blocks===false),`${id} is missing from the non-blocking park`);
}
assert.equal(OPENING_STREET_PROPS.filter((prop)=>prop.mesh==='district_bench').length,2,'the pocket park has two ordinary municipal benches');
assert.equal(OPENING_STREET_PROPS.filter((prop)=>prop.mesh.startsWith('vegetation_')).length,4,'groundcover is sparse and authored rather than a lawn-wide scatter');
assert.equal(OPENING_STREET_PROPS.find((prop)=>prop.id==='opening-street-park-laurel').mesh,'opening_park_laurel','the pocket park uses a compact specimen rather than an eleven-metre hedge');
assert.equal(OPENING_STREET_REVIEW_INSTANCE.mesh,'opening_street_review_plate');
assert.ok(!OPENING_STREET_PROPS.some((prop)=>prop.mesh===OPENING_STREET_REVIEW_INSTANCE.mesh));
for(const [name,contract] of Object.entries(OPENING_STREET_MESHES)){
  assert.deepEqual(PROP_MESH[name],contract);
}
for(const prop of OPENING_STREET_PROPS){
  assert.ok(CONSERVATORY_PROPS.some((entry)=>entry.id===prop.id&&entry===prop));
}

const ground=stats.materialAreas.opening_street_ground;
const groundArea=Object.values(ground).reduce((sum,value)=>sum+value,0);
const groundStats=stats.meshes.find((mesh)=>mesh.name==='opening_street_ground');
assert.equal(OPENING_STREET_MESHES.opening_street_ground.w,groundStats.bounds.max[0]-groundStats.bounds.min[0]);
assert.equal(OPENING_STREET_MESHES.opening_street_ground.d,groundStats.bounds.max[2]-groundStats.bounds.min[2]);
assert.ok(ground.asphalt/groundArea>=.80,'at least 80 percent of the new ground is asphalt');
assert.ok(ground.cobbles<ground.asphalt*.2,'cobble remains a narrow service treatment');
assert.ok(ground.grass>=70&&ground.grass<=90,'the pocket park lawn stays bounded rather than becoming a meadow');

const frontage=stats.materialAreas.opening_street_frontage;
const frontageArea=Object.values(frontage).reduce((sum,value)=>sum+value,0);
assert.ok(frontage.weatheredRender/frontageArea<.2,'weathered render remains a minority repair');
assert.ok(frontage.brick>frontage.weatheredRender);
assert.ok(frontage.roughStone>frontage.weatheredRender);

const service=stats.materialAreas.opening_street_service_history;
const rustDetail=service.rustyMetal03+service.rustyMetal04;
assert.ok(rustDetail<service.corrugatedIron*.1,'detail rust remains localized');
assert.ok(service.rustyPaintedMetal<service.corrugatedIron*.2,'painted rust remains subordinate');
assert.deepEqual(Object.keys(service).filter((role)=>['modernCladding','boxProfile'].includes(role)).sort(),['boxProfile','modernCladding']);
assert.equal(OPENING_STREET_PROPS.filter((prop)=>prop.mesh==='opening_street_service_history').length,1,'one modern intervention shares one authored layer');

const tree=OPENING_STREET_PROPS.find((prop)=>prop.mesh==='opening_street_tree_small');
assert.equal(tree.y,201,'the municipal tree is placed inside the mapped park edge');
assert.ok(Math.abs(tree.x-OPENING_STREET_PARK.entrance.x)>=2,'the tree clears the park entrance path');
assert.ok(tree.x>=OPENING_STREET_PARK.bounds.x0&&tree.x<=OPENING_STREET_PARK.bounds.x1&&tree.y>=OPENING_STREET_PARK.bounds.y0&&tree.y<=OPENING_STREET_PARK.bounds.y1,'the one tree belongs to the pocket park');
for(const point of [{id:'arrival route',x:57,y:207},{id:'bench overlook',x:52.5,y:205},{id:'service approach',x:78,y:214}]){
  assert.ok(Math.hypot(tree.x-point.x,tree.y-point.y)>=2,`${point.id} clears the tree by two metres`);
}
assert.equal(shouldHideCrossEnvelopeProp({mesh:'opening_street_frontage',x:50,z:7.5},{observerZone:ZONE.dock}),false,'the exterior frontage survives cross-envelope culling');

const main=fs.readFileSync('src/main.js','utf8');
assert.equal((main.match(/opening_street_/g)||[]).length,0,'opening mesh names do not create gameplay conditionals in main.js');
assert.match(main,/propDiagnostics:/);
assert.match(main,/x:physical\.x\*CELL.*z:physical\.z\*CELL/s,'diagnostic authored coordinates convert runtime-grid values to metres');

console.log('opening street layout contracts passed');
