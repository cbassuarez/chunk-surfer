import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ribPose,heldWavePose} from '../src/game/source-drive/cut/landscape-motion.js';
test('landscape poses are bounded, anchored and checkpoint deterministic',()=>{
 for(let t=0;t<600;t+=.137){const input={timeSec:t,furthest:940,distance:814,id:'left-rib-814'},pose=ribPose(input);assert.deepEqual(pose,ribPose(JSON.parse(JSON.stringify(input))));for(const v of Object.values(pose.morphs))assert(v>=0&&v<=1);assert.deepEqual(pose.motion.rootTranslation,[0,0,0]);assert.deepEqual(pose.joints,{});}
});
test('all effort boundaries and reveal distances remain continuous',()=>{
 let maximum=0;for(let t=0;t<360;t+=.011){const a=ribPose({timeSec:t,furthest:950}),b=ribPose({timeSec:t+.001,furthest:950});for(const k in a.morphs)maximum=Math.max(maximum,Math.abs(a.morphs[k]-b.morphs[k]));}assert(maximum<.004);
 for(const d of [590,650,695,810,880,890]){const a=ribPose({timeSec:20,furthest:d-.0001}),b=ribPose({timeSec:20,furthest:d+.0001});for(const k in a.morphs)assert(Math.abs(a.morphs[k]-b.morphs[k])<.00001);}
});
test('parked movement continues while a paused programme clock freezes exactly',()=>{
 const a=ribPose({timeSec:10,furthest:850}),b=ribPose({timeSec:17,furthest:850});assert.notDeepEqual(a.morphs,b.morphs);assert.deepEqual(a,ribPose({timeSec:10,furthest:850}));assert.deepEqual(ribPose({timeSec:10,furthest:500}).morphs,{tension:0,shear:0,breath:0,recoil:0});
});
test('study and production landscape controllers are identical',async()=>{assert.equal(await readFile('src/game/source-drive/cut/landscape-motion.js','utf8'),await readFile('artifacts/source-drive-study/cut/landscape-motion.js','utf8'));});
test('held wave macro curl cannot ebb with the effort or reverse once revealed',()=>{for(let t=0;t<240;t+=.1)assert.equal(heldWavePose({timeSec:t,furthest:950}).morphs.breath,1);let previous=0;for(let d=600;d<1000;d++){const p=heldWavePose({timeSec:20,furthest:d});assert(p.morphs.breath>=previous);previous=p.morphs.breath;}assert.equal(heldWavePose({timeSec:20,furthest:950,evolution:{wave:.72}}).morphs.breath,.72);});
