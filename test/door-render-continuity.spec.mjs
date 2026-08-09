import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const props3d=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
const r3d=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');

const leaves=main.match(/function rebuildDoorLeafVisuals\(\)\{[\s\S]*?\n\}/)?.[0]||'';
const thresholds=main.match(/function doorRenderInstances\(\{leaves=false\}=\{\}\)\{[\s\S]*?\n\}/)?.[0]||'';

assert.match(leaves,/FP\.forEachDoor\(\(portal\)=>\{/,'every dynamic door leaf is submitted to the prop pass');
assert.doesNotMatch(leaves,/renderGroup|renderGroups/,'door leaves are never hidden by the observer render group');
assert.match(main,/if\(!doorLeafVisualCache\.ready\)rebuildDoorLeafVisuals\(\);/,
  'crossing a render-group boundary does not rebuild the door leaf set');
assert.match(thresholds,/for\(const door of FP\.doorState\(\)\)/,'every frame and head is submitted');
assert.match(thresholds,/for\(const scar of FP\.sealedDoorways\(\)\)/,'sealed thresholds use the same continuous rule');
assert.doesNotMatch(thresholds,/renderGroup|renderGroups/,'structural thresholds are never hidden by the observer render group');

assert.match(props3d,/if\(!propInstanceVisible\(i,eye,maxDistance\)\)continue;/,
  'the shared prop pass still distance-culls submitted thresholds');
assert.match(r3d,/if\(propView < archView \+ 0\.015\)\{ col = prop\.rgb; zView = propView; \}/,
  'ray-marched architecture still depth-occludes submitted thresholds');

console.log('door render continuity contracts passed');
