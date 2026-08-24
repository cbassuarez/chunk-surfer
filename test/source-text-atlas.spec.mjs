import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { SOURCE_TEXT_VISIBLE_CAP, sourceTextAtlasLayout, sourceTextVisibleBudget } from '../src/render/props3d.js';

assert.equal(sourceTextAtlasLayout(1).size,256);
assert.equal(sourceTextAtlasLayout(10).size,512);
assert.equal(sourceTextAtlasLayout(37).size,1024);
assert.equal(sourceTextAtlasLayout(181).size,2048);
assert.equal(sourceTextAtlasLayout(730).capacity,730);
assert.throws(()=>sourceTextAtlasLayout(731),/Source text atlas overflow/,
  'an over-capacity corpus fails explicitly instead of losing its last entries');

const built=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_CONTACT,{seed:4417});
const runtime=createSourceSpaceRuntime({initialState:built.state});
runtime.setPlayerPosition(built.position);
const corpus=runtime.sourceScene({px:built.position.x,py:built.position.y,time:0}).corpus;
const layout=sourceTextAtlasLayout(new Set(corpus).size);
assert.ok(layout.entries<=layout.capacity);
assert.ok(layout.size<=2048,'the live Source corpus never asks for the old 4096px allocation');
assert.equal(sourceTextVisibleBudget(5326),SOURCE_TEXT_VISIBLE_CAP,'the first post-lift frame has a fixed upload ceiling');
assert.equal(sourceTextVisibleBudget(27),27);

const rendererSource=await readFile(new URL('../src/render/props3d.js',import.meta.url),'utf8');
const atlasBuilder=rendererSource.slice(rendererSource.indexOf('function ensureTextAtlas'),rendererSource.indexOf('function renderSourceText'));
assert.doesNotMatch(atlasBuilder,/4096|unique\.slice/,'the renderer neither over-allocates nor silently truncates the corpus');
assert.match(rendererSource,/visible\.length=sourceTextVisibleBudget\(visible\.length\)/,'the cap is applied after view culling and interaction priority');

console.log(`source text atlas specs passed (${layout.entries}/${layout.capacity} at ${layout.size}x${layout.size})`);
