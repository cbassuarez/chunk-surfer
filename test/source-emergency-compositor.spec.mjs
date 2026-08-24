import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { sourceEmergencyFrame } from '../src/data/source-landing.js';

const r3d=await readFile(new URL('../src/render/r3d.js',import.meta.url),'utf8');
const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');

const full=[.1,.3,.55,1.1].map((time)=>sourceEmergencyFrame(time));
assert.ok(new Set(full.map((frame)=>frame.cycle)).size>2,'full effects expose the contactor cycle');
assert.ok(full.every((frame)=>frame.wash>=.5&&frame.lightScale>=.7),'the red circuit never falls to black');
assert.deepEqual(sourceEmergencyFrame(0,{reducedEffects:true}),sourceEmergencyFrame(50,{reducedEffects:true}),
  'reduced effects steady presentation without changing availability');

const post=r3d.slice(r3d.indexOf('const POST_FRAG'),r3d.indexOf('// Source Space is a deliberately separate proof'));
assert.match(post,/uSourceEmergency/);
assert.ok(post.indexOf('float eWash=')>post.indexOf('c+=g*(recordingAmp+eyeAmp)'),
  'the physical Source wash is applied after glass, fear and acquisition grain');
const text=r3d.slice(r3d.indexOf('const TEXT_SPACE_FRAG'),r3d.indexOf('const COPY_FRAG'));
assert.match(text,/uSourceEmergency/);
assert.ok(text.indexOf('float eWash=')>text.indexOf('vec3 composed=mix(darkScene,paperScene,lightMix)'),
  'Text Space applies red after the paper/void compositor');
assert.match(r3d,/gl\.uniform1f\(postU\('uSourceEmergency'\),sourceEmergencyStrength\)/);
assert.match(r3d,/gl\.uniform1f\(textSpaceU\('uSourceEmergency'\),sourceEmergencyStrength\)/);
const datamosh=r3d.slice(r3d.indexOf('const DATAMOSH_FRAG'),r3d.indexOf('// ── the possession burst'));
assert.ok(datamosh.indexOf('float eWash=')>datamosh.indexOf('vec3 carried='),
  'motion retention cannot lay an old non-red frame over the Source wash');
assert.match(datamosh,/uSourceEmergency/);

const sync=main.slice(main.indexOf('function syncSourceRender'),main.indexOf('// ── ARRIVING IN THE BELFRY'));
assert.match(sync,/r3dSetSourceEmergency\?\.\(\{enabled:true,strength:/);
assert.match(main,/function clearSourceRuntime\(\)[\s\S]*?r3dSetSourceEmergency\?\.\(0\)/,
  'leaving Source cannot leak the red wash into the conservatoire');

console.log('Source emergency compositor specs passed');
