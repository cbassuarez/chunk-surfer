import assert from 'node:assert/strict';
import fs from 'node:fs';

import { props3dDebugShaders, vegetationLodForDistance } from '../src/render/props3d.js';

const lod={mediumDistanceM:28,farDistanceM:55,hysteresisM:3};
assert.equal(vegetationLodForDistance(27,null,lod),'near');
assert.equal(vegetationLodForDistance(28,null,lod),'medium');
assert.equal(vegetationLodForDistance(55,null,lod),'far');
assert.equal(vegetationLodForDistance(30,'near',lod),'near','near holds until the upper hysteresis edge');
assert.equal(vegetationLodForDistance(31,'near',lod),'medium');
assert.equal(vegetationLodForDistance(26,'medium',lod),'medium','medium holds until the lower hysteresis edge');
assert.equal(vegetationLodForDistance(24.9,'medium',lod),'near');
assert.equal(vegetationLodForDistance(57,'medium',lod),'medium','medium holds before the far upper edge');
assert.equal(vegetationLodForDistance(58,'medium',lod),'far');
assert.equal(vegetationLodForDistance(53,'far',lod),'far','far holds before the lower edge');
assert.equal(vegetationLodForDistance(51.9,'far',lod),'medium');

const shaders=props3dDebugShaders();
for(const source of [shaders.vertex,shaders.shadowVertex]){
  assert.match(source,/uTimeSec/);
  assert.match(source,/uReducedMotion/);
  assert.match(source,/uVegetationWind/);
  assert.match(source,/windPhase/);
}
for(const source of [shaders.fragment,shaders.shadowFragment]){
  assert.match(source,/fwidth\(/,'main and shadow alpha use the same derivative-aware coverage rule');
  assert.match(source,/coverageWidth/);
}
assert.match(shaders.fragment,/wrappedLeaf/);
assert.match(shaders.fragment,/vegetationSheen/);

const renderer=fs.readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
const world=fs.readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
const props=fs.readFileSync(new URL('../src/game/props.js',import.meta.url),'utf8');
assert.match(renderer,/instance\.fallbackMesh&&pack\.catalog\.has\(instance\.fallbackMesh\)/);
assert.match(renderer,/renderShadowPass\(eye,yaw,pitch,light,shadowLight,\{timeSec,reducedMotion,lodEye:eye\}\)/);
assert.match(props,/fallbackMesh:p\.fallbackMesh\|\|null/);
assert.match(world,/opening-street\.glb'[\s\S]*vegetation\.glb'[\s\S]*source-structures\.glb'/,'vegetation loads after the exterior fallback and before later structural packs');
assert.equal((world.match(/timeSec:now,reducedMotion:pixelMeshSettings\.reduceMotion/g)||[]).length,2);

console.log('vegetation renderer contracts passed');
