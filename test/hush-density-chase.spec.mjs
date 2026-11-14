import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {freshHushDensityPose,normalizeHushDensityPose,stepHushDensityPose,hushDensityCharacter,hushDensityTravelPacket} from '../src/game/hush-density-performance.js';
import {createHash} from 'node:crypto';
import {HUSH_POSTURE_REVISION,HUSH_POSTURE_ASSET_SHA256} from '../src/data/generated/hush-last-posture-support.js';
import {parseCharacterAsset} from '../src/render/character-asset.js';

test('chase loading is earned by accepted travel and survives save without another root or target',()=>{
 let d=freshHushDensityPose(39);assert.equal(d.drive,0);
 const early=stepHushDensityPose(d,{dt:.02,acceptedMetres:.06});
 assert.ok(early.drive>0&&early.drive<.2,'the chase posture loads instead of snapping');
 for(let n=0;n<60;n++)d=stepHushDensityPose(d,{dt:.02,acceptedMetres:.06,cameraYaw:n,target:[900,900]});
 assert.ok(d.drive>.98);assert.ok(d.phase>0);assert.equal(d.target,undefined);assert.equal(d.cameraYaw,undefined);
 assert.deepEqual(normalizeHushDensityPose(JSON.parse(JSON.stringify(d))),d);
 const b=hushDensityCharacter({density:d}).blend;assert.equal(b.clip,'density_chase');assert.ok(b.weight>.7);
 const still=hushDensityCharacter({density:freshHushDensityPose(39)});assert.notEqual(still.blend?.clip,'density_chase');
});

test('stopping holds the accepted travel phase while one finite chase load releases',()=>{
 let d=freshHushDensityPose(6);for(let n=0;n<30;n++)d=stepHushDensityPose(d,{dt:.02,acceptedMetres:.08});
 const stopped=stepHushDensityPose(d,{dt:.02}),phase=d.phase;
 assert.equal(stopped.phase,phase);assert.ok(stopped.drive<d.drive&&stopped.drive>d.drive*.8);
 for(let n=0;n<700;n++)d=stepHushDensityPose(d,{dt:.02});
 assert.equal(d.phase,phase);assert.equal(d.drive,0);assert.equal(d.traction,0);
 const pose=hushDensityCharacter({density:d});
 for(let n=0;n<30;n++)d=stepHushDensityPose(d,{dt:.02});
 assert.deepEqual(hushDensityCharacter({density:d}),pose,'a stopped density must not walk or sway in place');
});

test('secondary traction has a finite catch, hold and release rather than a sine oscillation',()=>{
 assert.equal(hushDensityTravelPacket(.05,.05),0);
 assert.equal(hushDensityTravelPacket(.25,.05),1);
 assert.ok(hushDensityTravelPacket(.5,.05)>0);
 assert.equal(hushDensityTravelPacket(.7,.05),0);
 for(const x of[.01,.17,.43,.79,.99])assert.ok(Math.abs(hushDensityTravelPacket(x,.22)-hushDensityTravelPacket(x+1,.22))<1e-12);
});

test('the delivered body retains a collapsed adult anatomical envelope and authored gathering chase',()=>{
 const bytes=readFileSync(process.env.HUSH_POSTURE_TEST_ASSET||new URL('../public/assets/hush-density.glb',import.meta.url)),asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 assert.ok(asset.clips.has('density_chase'));assert.equal(asset.clips.get('density_chase').duration,Math.fround(2.4));
 const stats=JSON.parse(readFileSync(process.env.HUSH_POSTURE_TEST_STATS||new URL('../public/assets/hush-density/stats.json',import.meta.url),'utf8'));
 assert.equal(stats.modelRevision,HUSH_POSTURE_REVISION);
 assert.equal(stats.modelRevision,asset.json.extras.modelRevision);
 assert.equal(stats.sha256,HUSH_POSTURE_ASSET_SHA256);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),HUSH_POSTURE_ASSET_SHA256);assert.equal(stats.identity,'The Last Posture');
 assert.equal(stats.joints.length,43);const triangles=asset.entries.find(entry=>entry.name==='hush_density_volume').primitives[0].indices.length/3;
 assert.equal(stats.triangles,triangles);assert.ok(triangles>0&&triangles<=stats.visibleTriangleBudget);
 const volume=asset.entries.find(e=>e.name==='hush_density_volume');assert.equal(volume.skin.joints.length,43);
 assert.equal(volume.primitives.reduce((n,p)=>n+p.indices.length/3,0),stats.triangles);
 assert.ok(Math.abs(stats.restBounds.min[1])<2e-6);
 assert.ok(Math.abs(stats.restBounds.max[1]-stats.restBounds.min[1]-asset.json.extras.heightM)<2e-6);
 assert.ok(stats.restBounds.max[2]-stats.restBounds.min[2]<.65,'adult anatomical depth remains credible without globally flattening the torso');
 assert.equal(stats.topology.boundaryEdges,0);assert.equal(stats.topology.nonManifoldEdges,0);
 assert.equal(stats.supportContract.worldPlantingClaim,false,'an in-place clip cannot promise world support');
 for(const name of['head','pelvis','thigh_L','thigh_R','foot_L','foot_R'])assert.ok(asset.nodes.some(n=>n.name===name));
 assert.equal(asset.nodes.some(n=>/^fold_/.test(n.name||'')),false);
});
