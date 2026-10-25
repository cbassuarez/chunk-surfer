import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/van-bench-fixture.mjs';
import {vanWorkbenchComparison,vanWorkbenchOptionPresentation} from '../src/render/van-workbench-guidance.js';
import {freshFieldKit} from '../src/game/field-kit.js';

test('pending Apply blocks Back, competing actions and repeated confirmation until the owner acknowledges',async()=>{
 let resolve;const first=new Promise(done=>resolve=done);const f=fixture({}, {kit:()=>first});
 f.point('van:object:variant:microphone:directional');f.point('van:apply');assert.equal(f.scene.debugState().pending,true);
 f.scene.key({key:'Escape'});f.scene.key({key:'Enter'});f.scene.key({key:'Enter',repeat:true});assert.equal(f.count('kit'),1);assert.equal(f.count('close'),0);
 resolve({ok:true});await f.scene.whenSettled();assert.equal(f.scene.debugState().pending,false);f.scene.exit();
});
test('failed Apply uses persistence Retry rather than replaying its transaction, blocking departure and notes',async()=>{
 const f=fixture({}, {kit:()=>({ok:false})});f.point('van:object:variant:headphones:closed');f.point('van:apply');await f.scene.whenSettled();
 assert.equal(f.scene.debugState().saveFailure,true);assert.equal(f.state().fieldKit.headphones,'closed','session retains its failed choice');
 f.scene.key({key:'Escape'});f.point('van:object:case');assert.equal(f.count('continue'),0);
 f.point('van:object:difficulty');f.point('van:inspect');assert.equal(f.count('notes'),0);f.point('van:retry');await f.scene.whenSettled();
 assert.equal(f.count('retry'),1);assert.equal(f.count('kit'),1);assert.equal(f.scene.debugState().saveFailure,false);f.scene.exit();
});
test('failed Take and rapid repeats use one continuation call and owner Retry',async()=>{
 let resolve;const first=new Promise(done=>resolve=done);const f=fixture({}, {continue:()=>first});f.scene.key({key:'Enter'});f.scene.key({key:'Enter'});
 assert.equal(f.count('continue'),1);resolve({ok:false});await f.scene.whenSettled();assert.equal(f.scene.debugState().focusId,'van:retry');
 f.scene.key({key:'Enter'});await f.scene.whenSettled();assert.equal(f.count('retry'),1);assert.equal(f.count('continue'),1);f.scene.exit();
});
test('rejected promise, synchronous throw and later owner saveError expose the same guarded recovery',async()=>{
 for(const bad of [()=>Promise.reject(new Error('disk')),()=>{throw Error('disk');}]){
  const f=fixture({}, {kit:bad});f.point('van:object:variant:headphones:closed');f.point('van:apply');await f.scene.whenSettled();assert.equal(f.scene.debugState().saveFailure,true);f.scene.exit();
 }
 const f=fixture();f.set({saveError:true});assert.equal(f.scene.debugState().saveFailure,true);assert.equal(f.scene.debugState().focusId,'van:retry');f.scene.exit();
});
test('late promise resolution cannot revive or mutate an exited interface',async()=>{
 let resolve;const f=fixture({}, {continue:()=>new Promise(done=>resolve=done)});f.scene.key({key:'Enter'});f.scene.exit();resolve({ok:true});await f.scene.whenSettled();
 assert.equal(f.life.dispose,1);assert.equal(f.scene.key({key:'Enter'}),false);assert.equal(f.count('continue'),1);
});
test('suspend and resume retain the handled object without inventing a commitment',()=>{
 const f=fixture();f.point('van:object:variant:microphone:directional');f.scene.suspend();f.scene.resume();assert.equal(f.life.suspend,1);assert.equal(f.life.resume,1);assert.equal(f.scene.debugState().selection.optionId,'directional');assert.equal(f.count('kit'),0);f.scene.exit();
});
test('right click and pointer cancellation never apply a highlighted candidate',()=>{
 const f=fixture();f.point('van:object:variant:microphone:directional','pointermove');const r=f.scene.debugState().hitRegions.find(r=>r.id==='van:object:variant:microphone:directional');
 f.scene.pointer({type:'pointerdown',button:2,cellX:r.x+1,cellY:r.y+1});f.scene.pointer({type:'pointercancel'});assert.equal(f.scene.debugState().selection,null);assert.equal(f.count('kit'),0);f.scene.exit();
});
test('all consequential beam and battery comparisons survive the shorter action surface',()=>{
 const state={fieldKit:freshFieldKit()};const rows=vanWorkbenchComparison(state,'flashlight','throw');assert.equal(rows.length,3);assert.ok(rows.every(row=>Number.isFinite(row.current)&&Number.isFinite(row.preview)));
 const candidate=vanWorkbenchOptionPresentation(state,'microphone','directional');assert.equal(candidate.currentId,'reference');assert.equal(candidate.option.id,'directional');
});
