import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {freshHushDensityPose,normalizeHushDensityPose,stepHushDensityPose,hushDensityCharacter,hushDensityTravelPacket} from '../src/game/hush-density-performance.js';
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

test('the delivered body contains the new authored chase and retains its nonhuman physical envelope',()=>{
 const bytes=readFileSync(new URL('../public/assets/hush-density.glb',import.meta.url)),asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 assert.ok(asset.clips.has('density_chase'));assert.equal(asset.clips.get('density_chase').duration,Math.fround(2.4));
 const stats=JSON.parse(readFileSync(new URL('../public/assets/hush-density/stats.json',import.meta.url),'utf8'));
 assert.equal(stats.modelRevision,'density-raked-load-2');assert.equal(stats.joints.length,19);assert.equal(stats.triangles,44000);
 assert.deepEqual(stats.restBounds,{min:[-.45,0,-.35],max:[.45,2.05,.35]});
 assert.equal(stats.topology.connectedComponents,1);assert.equal(stats.topology.boundaryEdges,0);assert.equal(stats.topology.openChannels,2);
 assert.equal(stats.baseContact.maximumRootRelativeBaseDriftM,0);
 assert.equal(asset.nodes.some(n=>/head|foot|thigh|pelvis/.test(n.name||'')),false);
});
