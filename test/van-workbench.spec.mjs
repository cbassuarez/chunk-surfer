import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,size} from './helpers/van-bench-fixture.mjs';
import {createVanWorkbenchStage,clipStageTarget,VAN_RECORDER_CANVAS_FLIP_Y} from '../src/render/van-workbench-stage.js';
import {fieldKitEffects} from '../src/game/field-kit.js';

test('a fresh offered case leaves with one deliberate action, with no browsing or entry writes',()=>{
 const f=fixture();assert.equal(f.calls.length,0);assert.equal(f.scene.debugState().focusId,'van:continue');
 f.scene.key({key:'Enter'});assert.equal(f.count('continue'),1);assert.equal(f.count('kit'),0);assert.equal(f.scene.debugState().mode,'bench');f.scene.exit();
});
test('select and examine an actual shelf object without changing inventory; named Swap commits once',()=>{
 const f=fixture();f.point('van:object:variant:microphone:directional');assert.equal(f.count('kit'),0);assert.equal(f.state().fieldKit.microphone,'reference');
 f.point('van:inspect');assert.equal(f.calls.at(-1).args[0],'microphone-directional');f.scene.resume();
 assert.equal(f.scene.debugState().selection.optionId,'directional');f.point('van:apply');assert.equal(f.state().fieldKit.microphone,'directional');assert.equal(f.count('kit'),1);
 f.point('van:apply');assert.equal(f.count('kit'),1,'same carried item has no second commit');f.scene.exit();
});
test('hover and keyboard travel cannot replace the deliberately handled object',()=>{
 const f=fixture();f.point('van:object:variant:headphones:closed');f.point('van:object:variant:microphone:wide','pointermove');
 assert.equal(f.scene.debugState().selection.optionId,'closed');for(let i=0;i<7;i++)f.scene.key({key:'Tab'});
 assert.equal(f.scene.debugState().selection.group,'headphones');assert.equal(f.count('kit'),0);f.point('van:apply');assert.equal(f.state().fieldKit.headphones,'closed');f.scene.exit();
});
test('return from inspection retains selection, Back puts it down, second Back leaves bench',()=>{
 const f=fixture();f.point('van:object:variant:microphone:wide');f.point('van:inspect');f.scene.resume();assert.equal(f.scene.debugState().selection.optionId,'wide');
 f.scene.key({key:'Escape'});assert.equal(f.scene.debugState().selection,null);assert.equal(f.count('close'),0);f.scene.key({key:'Escape'});assert.equal(f.count('close'),1);assert.equal(f.count('kit'),0);f.scene.exit();
});
test('recorder-only finishes remain available without a global appearance page and preserve effects',()=>{
 const f=fixture();const before=fieldKitEffects(f.state().fieldKit);f.point('van:object:recorder');f.point('van:finish:buttons:signal');assert.equal(f.count('kit'),0);f.point('van:apply');
 assert.equal(f.state().fieldKit.cosmetics.buttons,'signal');assert.deepEqual(fieldKitEffects(f.state().fieldKit),before);
 f.point('van:customize:vfd');f.point('van:finish:vfd:amber');f.point('van:apply');assert.equal(f.state().fieldKit.cosmetics.vfd,'amber');f.scene.exit();
});
test('torch finish belongs to the torch and cannot replace its hardware selection',()=>{
 const f=fixture();f.point('van:object:variant:flashlight:throw');f.point('van:apply');f.point('van:customize:flashlightHousing');f.point('van:finish:flashlightHousing:ivory');f.point('van:apply');
 assert.equal(f.state().fieldKit.flashlight,'throw');assert.equal(f.state().fieldKit.cosmetics.flashlightHousing,'ivory');f.scene.exit();
});
test('locked WITNESS is visible only with earned visibility and inspection never fits it',()=>{
 const fresh=fixture();assert.equal(fresh.scene.debugState().hitRegions.some(r=>r.id==='van:object:witness'),false);fresh.scene.exit();
 const f=fixture({cosmeticMeta:{endingsSeen:['helped']}});f.point('van:object:witness');f.point('van:apply');assert.equal(f.count('kit'),0);f.point('van:inspect');assert.equal(f.count('witness'),1);assert.equal(f.state().fieldKit.cosmetics.faceplate,'aluminum');f.scene.exit();
});
test('owned WITNESS revalidates live ownership at Fit and preserves hardware',()=>{
 const f=fixture({cosmeticMeta:{endingsSeen:['helped','drugged']}});f.point('van:object:witness');f.set({cosmeticMeta:{endingsSeen:['helped']}});f.point('van:apply');assert.equal(f.count('kit'),0);
 f.set({cosmeticMeta:{endingsSeen:['helped','drugged']}});f.point('van:apply');assert.equal(f.count('kit'),1);assert.equal(f.state().fieldKit.cosmetics.faceplate,'witness');assert.equal(f.state().fieldKit.microphone,'reference');f.scene.exit();
});
test('work order alone owns optional shift selection and notes; no shift action is mandatory',()=>{
 const f=fixture();f.point('van:object:difficulty');assert.equal(f.count('shift'),0);f.point('van:apply');assert.equal(f.count('shift'),1);f.scene.resume();f.point('van:inspect');assert.equal(f.count('notes'),1);assert.equal(f.count('continue'),0);f.scene.exit();
});
test('stage targets clip to their rendered viewport and no-DOM disposal is safe and final',()=>{assert.deepEqual(clipStageTarget({x:-2,y:0,w:20,h:30},{x:1,y:2,w:10,h:10}),{x:1,y:2,w:10,h:10});const stage=createVanWorkbenchStage();stage.suspend();assert.equal(stage.snapshot().suspended,true);stage.resume();stage.dispose();stage.dispose();assert.equal(stage.snapshot().disposed,true);assert.equal(stage.snapshot().rendererCount,0);assert.deepEqual(stage.snapshot().models,{});});

test('physical recorder CanvasTexture follows the authored plane UV orientation',async()=>{const{NodeIO}=await import('@gltf-transform/core');const doc=await new NodeIO().read(new URL('../public/assets/items/field-recorder.glb',import.meta.url).pathname);const plane=doc.getRoot().listNodes().find(n=>n.getName()==='recorder-display-substrate');assert.ok(plane);const primitive=plane.getMesh().listPrimitives()[0],positions=primitive.getAttribute('POSITION').getArray(),uv=primitive.getAttribute('TEXCOORD_0').getArray();for(let i=0;i<positions.length/3;i++)assert.equal(uv[i*2+1],positions[i*3+1]>0?1:0);assert.equal(VAN_RECORDER_CANVAS_FLIP_Y,true);});
