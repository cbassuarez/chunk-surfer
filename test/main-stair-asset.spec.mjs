import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CONSERVATORY_PROPS, PROP_MESH } from '../src/data/conservatory-props.js';

const assetUrl=new URL('../public/assets/conservatory-main-stair.glb',import.meta.url);
const stats=JSON.parse(readFileSync(new URL('../public/assets/conservatory-main-stair.stats.json',import.meta.url),'utf8'));
const credits=JSON.parse(readFileSync(new URL('../public/assets/conservatory-main-stair.credits.json',import.meta.url),'utf8'));
const bytes=readFileSync(assetUrl);

assert.equal(bytes.readUInt32LE(0),0x46546c67,'hero stair is a binary glTF');
assert.equal(bytes.readUInt32LE(4),2,'hero stair uses glTF 2');
assert.equal(bytes.readUInt32LE(8),bytes.length,'declared GLB length matches the file');
assert.equal(stats.bytes,bytes.length,'asset stats describe the checked-in GLB');
assert.equal(credits.pack.sha256,crypto.createHash('sha256').update(bytes).digest('hex'),'credits hash pins the generated asset');

assert.deepEqual({
  curvilinear:stats.design.curvilinear,
  flights:stats.design.halfTurnFlights,
  width:stats.design.flightWidthM,
  well:stats.design.openWellWidthM,
  lower:stats.design.lowerRisers,
  upper:stats.design.upperRisers,
  going:stats.design.goingM,
},{curvilinear:true,flights:4,width:2,well:1.3,lower:28,upper:30,going:.28});
assert.ok(stats.totalTriangles>30000,'rails, soffits, nosings, and treads are construction rather than a block proxy');

const prop=CONSERVATORY_PROPS.find((entry)=>entry.id==='main-open-well-stair');
assert.equal(prop?.mesh,'main_open_well_stair');
assert.equal(PROP_MESH.main_open_well_stair.blocks,false,'authored floorplan collision—not the display mesh—owns walking');
assert.ok(PROP_MESH.main_open_well_stair.w>=12.5&&PROP_MESH.main_open_well_stair.h>=14.6,
  'visibility bounds contain all three full-size floor landings and the upper rails');

const rendererSource=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
assert.match(rendererSource,/conservatory-main-stair\.glb/,'the renderer loads the dedicated hero pack');

console.log('main stair asset contracts passed');
