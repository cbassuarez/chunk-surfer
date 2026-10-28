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
const propWinner=r3d.match(/if\(propView\s*<\s*archView\s*\+\s*0\.015[^)]*\)\{([\s\S]*?)\n\s*\}/)?.[1]||'';
assert.match(propWinner,/col\s*=\s*texture\(uPropColor,propUv\)\.rgb;\s*zView\s*=\s*propView;/,
  'the winning nearer prop still replaces the architectural colour and depth');
assert.match(r3d,/!paneTop/,'coplanar roof panes do not inherit an opaque depth claim');
assert.match(r3d,/litBody\s*<\s*\.5/,'hollow body transmission retains its independent material ownership');

console.log('door render continuity contracts passed');
