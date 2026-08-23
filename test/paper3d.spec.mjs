import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { paper3dDebugShaders, paper3dProbe } from '../src/render/paper3d.js';
import { PAPER_ATLAS_HANDLING, PAPER_DOCUMENTS } from '../src/generated/paper-catalog.js';

const shader=paper3dDebugShaders();
assert.match(shader.vertex,/MESH|uHandling|uShape|crease|turn/i);
assert.match(shader.fragment,/uMaterial|rough|transmission|discard/);
assert.match(shader.fragment,/vec2 tuv=vUv/,'front paper art samples upright DOM texture coordinates');
assert.doesNotMatch(shader.fragment,/1\.0-vUv\.y/,'Paper3D does not vertically invert the printed front');
assert.equal(paper3dProbe().ready,false,'Node import remains browser-safe and lazy');
assert.ok(Array.isArray(PAPER_ATLAS_HANDLING));
assert.equal(PAPER_ATLAS_HANDLING.length,Object.values(PAPER_DOCUMENTS).reduce((n,d)=>n+d.pages.length,0));
for(const vector of PAPER_ATLAS_HANDLING){assert.equal(vector.length,4);}
const reader=readFileSync('src/game/document.js','utf8');
assert.match(reader,/paper3dRender/);
assert.match(reader,/paperMaterialState/);
assert.match(reader,/frame\)/);
const props=readFileSync('src/render/props3d.js','utf8');
assert.match(props,/aPaperHandling/);
assert.match(props,/PAPER_ATLAS_HANDLING/);
assert.match(props,/Float32Array\(list\.length\*28\)/);
console.log('paper3d contracts passed');
