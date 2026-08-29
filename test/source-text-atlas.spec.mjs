import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import { reduceChunkSurf } from '../src/game/chunk-surf-state.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import {
  SOURCE_TEXT_VISIBLE_CAP,
  sourceTextAtlasLayout,
  sourceTextCorpusTransition,
  sourceTextVisibleBudget,
} from '../src/render/props3d.js';

assert.equal(sourceTextAtlasLayout(1).size,256);
assert.equal(sourceTextAtlasLayout(10).size,512);
assert.equal(sourceTextAtlasLayout(37).size,1024);
assert.equal(sourceTextAtlasLayout(181).size,2048);
assert.equal(sourceTextAtlasLayout(730,2048).capacity,730);

// 2048 IS A HARD GPU BUDGET, NOT A REQUEST.
//
// The landing/corpus identity fault made FIRST LIFT request 797 resident card
// variants instead of the canonical corpus. Growing to 4096 at that boundary
// stalled or lost the WebGL context on the target renderer. A large reported
// MAX_TEXTURE_SIZE must never broaden this chapter's resource budget.
const guarded=sourceTextAtlasLayout(739,4096);
assert.equal(guarded.size,2048,'Source allocated a 4096px transition atlas');
assert.equal(guarded.capacity,730);
assert.equal(guarded.entries,730);
assert.equal(guarded.overflow,9,'overflow is bounded and explicit');

const over=sourceTextAtlasLayout(999999,4096);
assert.ok(over.overflow>0,'a genuinely over-capacity corpus reports what it lost');
assert.equal(over.entries,over.capacity,'and clamps to what it can hold');
assert.doesNotThrow(()=>sourceTextAtlasLayout(999999,4096),
  'an over-capacity corpus must never take the renderer down with it');

const built=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_CONTACT,{seed:4417});
const runtime=createSourceSpaceRuntime({initialState:built.state});
runtime.setPlayerPosition(built.position);
const corpus=runtime.sourceScene({px:built.position.x,py:built.position.y,time:0}).corpus;
const layout=sourceTextAtlasLayout(new Set(corpus).size);
assert.ok(layout.entries<=layout.capacity);
assert.ok(layout.size<=2048,'the live Source corpus never asks for the old 4096px allocation');
assert.equal(sourceTextVisibleBudget(5326),SOURCE_TEXT_VISIBLE_CAP,'the first post-lift frame has a fixed upload ceiling');
assert.equal(sourceTextVisibleBudget(27),27);

// FIRST LIFT IS A RENDERER HANDOFF, NOT JUST A REDUCER FLAG.
//
// The landing needs a wake-only Source scene so the rear HUSH can exist before
// Text Space. That empty scene used to claim the same atlas key as the populated
// first-lift scene. The renderer then rejected the real 605-line corpus and
// rasterised 797 resident card variants on the first rendered frame instead,
// growing the atlas to 4096px and presenting raw prop polygons before the
// compositor stalled or lost its WebGL context.
const firstLift=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_LIFT,{seed:4417});
const landingRuntime=createSourceSpaceRuntime({initialState:firstLift.state});
landingRuntime.setPlayerPosition(firstLift.position);
const landingScene=landingRuntime.sourceScene({px:firstLift.position.x,py:firstLift.position.y,time:0});
assert.equal(landingScene.corpus.length,0);
assert.equal(landingScene.atlasKey,'','the wake-only landing scene must not reserve the Source corpus key');

const activeState=reduceChunkSurf(firstLift.state,{
  type:'SOURCE_LIFT_COMPLETED',id:'lift-fork',checkpointId:'landing-fork',
});
const activeRuntime=createSourceSpaceRuntime({initialState:activeState});
activeRuntime.setPlayerPosition({x:firstLift.position.x,y:firstLift.position.y-20});
const activeScene=activeRuntime.sourceScene({px:firstLift.position.x,py:firstLift.position.y-20,time:0});
assert.ok(activeScene.atlasKey);
assert.equal(activeScene.corpus.length,corpus.length,'the first-lift scene submits the canonical corpus');
const residentUnique=new Set([...activeScene.staticInstances,...activeScene.dynamicInstances]
  .map((entry)=>String(entry.text||entry.source?.text||'')).filter(Boolean));
assert.ok(residentUnique.size>activeScene.corpus.length,
  'this fixture still exercises the dangerous resident-card fallback');

let transition=sourceTextCorpusTransition({},landingScene);
assert.deepEqual(transition,{key:'',corpus:[],changed:false},
  'an empty landing scene cannot poison corpus initialization');
transition=sourceTextCorpusTransition(transition,activeScene);
assert.equal(transition.key,activeScene.atlasKey);
assert.equal(transition.corpus.length,activeScene.corpus.length);
assert.equal(sourceTextAtlasLayout(new Set(transition.corpus).size).size,2048,
  'FIRST LIFT initializes the bounded canonical atlas rather than a 4096px fallback');

const rendererSource=await readFile(new URL('../src/render/props3d.js',import.meta.url),'utf8');
const atlasBuilder=rendererSource.slice(rendererSource.indexOf('function ensureTextAtlas'),rendererSource.indexOf('function renderSourceText'));
assert.doesNotMatch(atlasBuilder,/4096|unique\.slice/,'the renderer neither over-allocates nor silently truncates the corpus');
assert.match(rendererSource,/visible\.length=sourceTextVisibleBudget\(visible\.length\)/,'the cap is applied after view culling and interaction priority');

console.log(`source text atlas specs passed (${layout.entries}/${layout.capacity} at ${layout.size}x${layout.size})`);
