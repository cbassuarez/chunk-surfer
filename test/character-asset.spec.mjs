import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHARACTER_DEFORM_GLSL, parseCharacterAsset, sampleCharacterPose } from '../src/render/character-asset.js';

// A small real GLB, not a mocked sampler: hierarchy, inverse binds, integer
// influences, a normal corrective and sparse/linear/step/cubic clip channels.
import { characterFixture as fixture } from './fixtures/character-glb.mjs';

const asset=parseCharacterAsset(fixture()),entry=asset.entries[0],primitive=entry.primitives[0];
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-5,`${message}: ${a} != ${b}`);
assert.equal(asset.clips.size,4);assert.equal(entry.morphNames[0],'rib_compression');
near(primitive.weights[8]+primitive.weights[9],1,'normalized integer influence sum');
const rest=sampleCharacterPose(asset,entry,{});
for(let j=0;j<2;j++){near(rest.bones[j*16+12],0,'rest inverse bind X');near(rest.bones[j*16+13],0,'rest inverse bind Y');}
const early=sampleCharacterPose(asset,entry,{clip:'fold',time:.25}),mid=sampleCharacterPose(asset,entry,{clip:'fold',time:1}),end=sampleCharacterPose(asset,entry,{clip:'fold',time:99});
near(early.bones[28],.25,'first independent actor');near(mid.bones[28],1,'second independent actor');near(end.bones[28],2,'clamped clip');near(mid.morphs[0],.5,'animated corrective');
near(sampleCharacterPose(asset,entry,{clip:'fold',time:2.5,loop:true}).bones[28],.5,'per-layer loop');
const blend=sampleCharacterPose(asset,entry,{clips:[{name:'fold',time:1,weight:.25},{name:'idle',time:1,weight:.75}]});
near(blend.bones[28],.25,'sparse channel blends toward rest');near(blend.morphs[0],.125,'morphs blend toward default');
near(sampleCharacterPose(asset,entry,{clip:'fold',time:1,blend:{clip:'idle',time:1,weight:.75}}).bones[28],.25,'secondary shorthand');
const rotated=sampleCharacterPose(asset,entry,{clip:'turn',time:1});
near(rotated.bones[0],0,'quaternion halfway cosine');near(rotated.bones[1],1,'quaternion shortest path');
near(sampleCharacterPose(asset,entry,{clip:'idle',time:1.99}).bones[0],1,'STEP holds key');
near(sampleCharacterPose(asset,entry,{clip:'writhe',time:1}).bones[28],1,'CUBICSPLINE tangent sampling');
const descriptor={clip:'fold',time:1,joints:{Neck:{translation:[.3,0,0]}},morphs:{rib_compression:9}},before=JSON.stringify(descriptor),override=sampleCharacterPose(asset,entry,descriptor);
near(override.bones[28],1.3,'additive local contact correction');near(override.morphs[0],2,'bounded corrective');assert.equal(JSON.stringify(descriptor),before);near(early.bones[28],.25,'later pose does not mutate earlier palette');

// Every actually skinned point must fit the conservative animated envelope,
// including blended influences, negative correctives and hierarchy rotations.
for(const pose of [rest,mid,rotated,override,sampleCharacterPose(asset,entry,{clip:'turn',time:.7,morphs:{rib_compression:-2}})])for(let v=0;v<primitive.vertexCount;v++){
  const p=Array.from(primitive.positions.subarray(v*3,v*3+3));for(let k=0;k<3;k++)p[k]+=primitive.targets[0].positions[v*3+k]*pose.morphs[0];
  const world=[0,0,0];for(let j=0;j<4;j++){const at=primitive.joints[v*4+j]*16,w=primitive.weights[v*4+j];for(let k=0;k<3;k++)world[k]+=(pose.bones[at+k]*p[0]+pose.bones[at+4+k]*p[1]+pose.bones[at+8+k]*p[2]+pose.bones[at+12+k])*w;}
  for(let k=0;k<3;k++)assert.ok(world[k]>=pose.bounds.min[k]-1e-5&&world[k]<=pose.bounds.max[k]+1e-5,'animated bounds contain deformed point');
}
assert.throws(()=>sampleCharacterPose(asset,entry,{clip:'missing'}),/unknown clip/);
assert.throws(()=>sampleCharacterPose(asset,entry,{clip:'fold',time:Infinity}),/non-finite/);
assert.throws(()=>sampleCharacterPose(asset,entry,{clips:[{},{},{}]}),/two clip layers/);
assert.throws(()=>parseCharacterAsset(fixture(j=>j.skins[0].joints=Array.from({length:49},()=>0))),/invalid skin/);
assert.throws(()=>parseCharacterAsset(fixture(j=>j.meshes[0].primitives[0].targets=Array(5).fill(j.meshes[0].primitives[0].targets[0]))),/morph limit/);
assert.throws(()=>parseCharacterAsset(fixture(j=>j.accessors[0].sparse={})),/accessor/);
assert.throws(()=>parseCharacterAsset(fixture(j=>j.accessors[0].count=999)),/exceeds buffer/);
assert.throws(()=>parseCharacterAsset(fixture(j=>j.nodes[1].children=[0])),/cyclic/);
assert.throws(()=>parseCharacterAsset(fixture(j=>j.extensionsUsed=['KHR_draco_mesh_compression'])),/extensions/);
assert.throws(()=>parseCharacterAsset(fixture().slice(0,-4)),/GLB 2/);
const shaderSource=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
assert.equal(shaderSource.split('${CHARACTER_DEFORM_GLSL}').length-1,2,'main and shadow share exact deformation code');
assert.match(CHARACTER_DEFORM_GLSL,/transpose\(inverse\(s\)\)/,'deformed normals use skin inverse transpose');
assert.match(shaderSource,/json\.animations\|\|json\.skins/,'ordinary prop packs remain static-only');
console.log('character-asset: real GLB parsing, independent/blended skeletal poses, correctives, animated bounds and shared pass deformation passed');
