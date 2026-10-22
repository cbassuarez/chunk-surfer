import test from 'node:test';
import assert from 'node:assert/strict';
import * as scenes from '../src/game/scenes.js';
import {makeRoofPasswordScene} from '../src/game/roof-password-scene.js';
import {roofWordLockLayout} from '../src/render/roof-word-lock.js';

test.afterEach(()=>scenes.clear());
const key=(scene,value,rest={})=>scene.key({key:value,preventDefault(){},...rest});
const type=(scene,word)=>{for(const value of word)key(scene,value);};
function mounted(options={}){
  const scene=makeRoofPasswordScene({reducedMotion:()=>false,...options});
  const world={id:'world'};scenes.replace(world);scenes.push(scene);
  return {scene,world};
}
function pointer(scene,type,p,extra={}){
  const v=scene.view().viewport;
  const event={type,pointerId:9,button:0,cellX:p.x/v.width*v.cols,cellY:p.y/v.height*v.rows,preventDefault(){},...extra};
  assert.equal(scene.pointer(event),true);return event;
}
const centre=rect=>({x:rect.x+rect.w/2,y:rect.y+rect.h/2});
const wheel=(scene,index)=>scene.view().layout.wheels[index];

test('the six-wheel scene exposes the same default viewport and picking geometry as the actual renderer',()=>{
  const {scene}=mounted();
  assert.deepEqual(scene.view().viewport,{width:960,height:600,cols:120,rows:30});
  assert.deepEqual(scene.view().layout,roofWordLockLayout(960,600));
  assert.equal(scene.view().word,'AAAAAA');
  assert.equal(scene.blocksInput,true);assert.equal(scene.blocksWorld,true);assert.equal(scene.allowsLook,false);
});

test('trackpad deltas accumulate at the pointed wheel without advancing the active selection',()=>{
  const {scene}=mounted(),p=centre(wheel(scene,2));let prevented=0;
  const scroll=(dy,rest={})=>pointer(scene,'wheel',p,{deltaY:dy,preventDefault(){prevented++;},...rest});
  scroll(13);scroll(13);assert.equal(scene.view().word,'AAAAAA');assert.equal(scene.view().cursor,2);
  scroll(12);assert.equal(scene.view().word,'AABAAA');assert.equal(scene.view().cursor,2);
  scroll(-38);assert.equal(scene.view().word,'AAAAAA');assert.equal(scene.view().cursor,2);
  scroll(2,{deltaMode:1});assert.equal(scene.view().word,'AAAAAA');scroll(6);assert.equal(scene.view().word,'AABAAA');
  assert.equal(prevented,6);
  pointer(scene,'wheel',centre(wheel(scene,5)),{deltaY:37});assert.equal(scene.view().letters[5],'A');
  pointer(scene,'wheel',centre(wheel(scene,1)),{deltaY:1});assert.equal(scene.view().letters[1],'A','changing wheels does not transfer partial scroll debt');
});

test('upper and lower arrow targets turn their own drum in the indicated keyboard direction',()=>{
  const {scene}=mounted(),r=wheel(scene,4),x=r.x+r.w/2;
  pointer(scene,'pointerdown',{x,y:r.y-16});
  assert.equal(scene.view().letters[4],'B');assert.equal(scene.view().cursor,4);assert.equal(scene.view().dragging,false);
  pointer(scene,'pointerdown',{x,y:r.y+r.h+16});
  assert.equal(scene.view().letters[4],'A');assert.equal(scene.view().turns[4],0);assert.equal(scene.view().cursor,4);
});

test('dragging uses accumulated physical detents and stops on release or cancellation',()=>{
  const {scene}=mounted(),r=wheel(scene,1),p=centre(r),pitch=Math.max(13,r.h*.18);
  pointer(scene,'pointerdown',p);assert.equal(scene.view().dragging,true);assert.equal(scene.view().cursor,1);
  pointer(scene,'pointermove',{x:p.x,y:p.y-pitch*.55});assert.equal(scene.view().letters[1],'A');
  pointer(scene,'pointermove',{x:p.x,y:p.y-pitch*2.15});assert.equal(scene.view().letters[1],'C');
  pointer(scene,'pointerup',{x:p.x,y:p.y-pitch*2.15});assert.equal(scene.view().dragging,false);
  pointer(scene,'pointermove',{x:p.x,y:p.y-pitch*4});assert.equal(scene.view().letters[1],'C');
  pointer(scene,'pointerdown',p);pointer(scene,'pointermove',{x:p.x,y:p.y+pitch*1.2});assert.equal(scene.view().letters[1],'B');
  pointer(scene,'pointercancel',p);assert.equal(scene.view().dragging,false);
  pointer(scene,'pointermove',{x:p.x,y:p.y+pitch*3});assert.equal(scene.view().letters[1],'B');
});

test('a different pointer cannot move or release the active drum drag',()=>{
  const {scene}=mounted(),r=wheel(scene,3),p=centre(r),pitch=Math.max(13,r.h*.18);
  pointer(scene,'pointerdown',p,{pointerId:4});
  pointer(scene,'pointermove',{x:p.x,y:p.y-pitch*2},{pointerId:8});assert.equal(scene.view().letters[3],'A');
  pointer(scene,'pointerup',p,{pointerId:8});assert.equal(scene.view().dragging,true);
  pointer(scene,'pointermove',{x:p.x,y:p.y-pitch*1.1},{pointerId:4});assert.equal(scene.view().letters[3],'B');
  pointer(scene,'pointerup',p,{pointerId:4});assert.equal(scene.view().dragging,false);
});

test('Tab and controller previous-tab navigate physical controls without typing their transport key',()=>{
  const {scene}=mounted();
  key(scene,'Tab');assert.equal(scene.view().cursor,1);assert.equal(scene.view().word,'AAAAAA');
  key(scene,'q',{controllerAction:'tabPrev'});assert.equal(scene.view().cursor,0);assert.equal(scene.view().word,'AAAAAA');
  key(scene,'q',{controllerAction:'tabPrev'});assert.equal(scene.view().focus,'handle');assert.equal(scene.view().word,'AAAAAA');
  key(scene,'Tab');assert.equal(scene.view().focus,'wheel');assert.equal(scene.view().cursor,0);
  key(scene,'q');assert.equal(scene.view().word,'QAAAAA','a genuine Q remains available as an alphabet face');
  key(scene,'ArrowLeft');key(scene,'ArrowLeft');assert.equal(scene.view().cursor,0);
});

test('held letter keys cannot fill the lock but deliberate directional repeat turns a drum',()=>{
  const {scene}=mounted();
  key(scene,'v',{repeat:true});assert.equal(scene.view().word,'AAAAAA');assert.equal(scene.view().cursor,0);
  key(scene,'v');assert.equal(scene.view().word,'VAAAAA');assert.equal(scene.view().cursor,1);
  key(scene,'v',{repeat:true});assert.equal(scene.view().word,'VAAAAA');assert.equal(scene.view().cursor,1);
  key(scene,'ArrowUp',{repeat:true});key(scene,'ArrowUp',{repeat:true});assert.equal(scene.view().word,'VCAAAA');assert.equal(scene.view().cursor,1);
});

test('a wrong handle pull grants nothing and cannot be spammed during its refusal movement',()=>{
  let attempts=0,opened=0;const {scene}=mounted({verify:()=>{attempts++;return false;},onOpen:()=>opened++});
  const p=centre(scene.view().layout.handle);
  pointer(scene,'pointerdown',p);assert.equal(attempts,1);assert.equal(opened,0);assert.equal(scene.view().phase,'refused');
  key(scene,'Enter');pointer(scene,'pointerdown',p);scene.update(.44);key(scene,'Enter');assert.equal(attempts,1);
  scene.update(.02);key(scene,'Enter',{repeat:true});assert.equal(attempts,1);
  key(scene,'Enter');assert.equal(attempts,2);assert.equal(opened,0);assert.equal(scene.view().phase,'refused');
});

test('accepted handle movement settles before opening once and forbids edits or duplicate submission',()=>{
  let opened=0,attempts=0,cancelled=0;const {scene,world}=mounted({verify:word=>{attempts++;return word==='VESPER';},onOpen:()=>opened++,onCancel:()=>cancelled++});
  type(scene,'VESPER');pointer(scene,'pointerdown',centre(scene.view().layout.handle));
  assert.equal(scene.view().phase,'released');assert.equal(opened,0);assert.equal(scenes.top(),scene);
  key(scene,'A');key(scene,'Enter');pointer(scene,'wheel',centre(wheel(scene,0)),{deltaY:76});
  assert.equal(scene.view().word,'VESPER');assert.equal(attempts,1);
  scene.update(.61);assert.equal(opened,0);scene.update(.02);assert.equal(opened,1);assert.equal(cancelled,0);assert.equal(scenes.top(),world);
  scene.update(1);key(scene,'Enter');assert.equal(opened,1);assert.equal(attempts,1);
});

test('reduced motion opens on the accepted pull without waiting for decorative travel',()=>{
  let opened=0;const {scene,world}=mounted({verify:word=>word==='VESPER',onOpen:()=>opened++,reducedMotion:()=>true});
  type(scene,'VESPER');assert.deepEqual(scene.view().positions,scene.view().turns);
  key(scene,'Enter');assert.equal(opened,1);assert.equal(scenes.top(),world);assert.equal(scene.view().closed,true);
  scene.update(1);key(scene,'Enter');assert.equal(opened,1);
});

test('an external scene removal cancels pending release and cannot open the roof afterward',()=>{
  let opened=0;const {scene,world}=mounted({verify:()=>true,onOpen:()=>opened++});
  type(scene,'VESPER');key(scene,'Enter');assert.equal(scene.view().phase,'released');assert.equal(opened,0);
  scenes.pop();assert.equal(scenes.top(),world);assert.equal(scene.view().closed,true);
  scene.update(1);key(scene,'Escape');pointer(scene,'pointerdown',centre(scene.view().layout.handle));assert.equal(opened,0);
});
