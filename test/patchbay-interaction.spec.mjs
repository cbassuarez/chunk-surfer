import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBagScene } from '../src/game/bag.js';
import { normalizeCombatBuild, PIN_SOURCES } from '../src/game/combat-progression.js';
import { TECHNIQUE } from '../src/game/combat-state.js';
import { sampleControl } from '../src/game/control-mechanics.js';

function fixture({build=normalizeCombatBuild(null,PIN_SOURCES.encounters),onApplySkills=()=>{}}={}) {
  const bag=makeBagScene({getBuild:()=>build,hasRig:()=>true,focus:{sectionId:'skills',entryId:`skill:${TECHNIQUE.AFTERIMAGE}`},onApplySkills});
  bag.enter();bag.render();return bag;
}
const state=bag=>bag.debugState();
const region=(bag,id)=>{const hit=state(bag).hitRegions.find(r=>r.id===id);assert.ok(hit,`visible target ${id}`);return hit;};
const input=id=>`bag:patch:input:skill:${id}`;
const output=id=>`bag:patch:output:skill:${id}`;
const supply=branch=>`bag:patch:supply:${branch}`;
function pointer(bag,type,hit,pointerId=7) {
  bag.pointer({type,pointerId,button:0,cellX:hit.x+hit.w*.5,cellY:hit.y+hit.h*.5});
}
function drag(bag,from,to) {
  pointer(bag,'pointerdown',region(bag,from));
  assert.ok(state(bag).patchDrag,'a real available cable is picked up');
  pointer(bag,'pointermove',region(bag,to));
  pointer(bag,'pointerup',region(bag,to));bag.render();
}

test('body labels inspect; dragging supply to input unlocks exactly one skill and its output',()=>{
  const bag=fixture();
  assert.equal(bag.allowsLook,false);
  const body=region(bag,`bag:skill:skill:${TECHNIQUE.AFTERIMAGE}`);
  bag.pointer({type:'pointerdown',pointerId:7,button:0,cellX:body.x+body.w*.5,cellY:body.y+.1});
  assert.deepEqual(state(bag).workingBuild.techniques,[]);
  assert.ok(!state(bag).hitRegions.some(r=>r.id===output(TECHNIQUE.AFTERIMAGE)));
  drag(bag,supply('torch'),input(TECHNIQUE.AFTERIMAGE));
  assert.deepEqual(state(bag).workingBuild.techniques,[TECHNIQUE.AFTERIMAGE]);
  assert.equal(state(bag).workingBuild.unspent,2);
  region(bag,output(TECHNIQUE.AFTERIMAGE));
  drag(bag,output(TECHNIQUE.AFTERIMAGE),input(TECHNIQUE.WHITEOUT));
  assert.deepEqual(state(bag).workingBuild.techniques,[TECHNIQUE.AFTERIMAGE,TECHNIQUE.WHITEOUT]);
  bag.exit();
});

test('wrong color, wrong prerequisite and off-panel drops leave the build untouched',()=>{
  const bag=fixture(),before=state(bag).workingBuild;
  drag(bag,supply('torch'),input(TECHNIQUE.PUNCH_IN));
  assert.deepEqual(state(bag).workingBuild,before);
  drag(bag,supply('torch'),input(TECHNIQUE.WHITEOUT));
  assert.deepEqual(state(bag).workingBuild,before);
  pointer(bag,'pointerdown',region(bag,supply('torch')));
  bag.pointer({type:'pointerup',pointerId:7,cellX:-100,cellY:-100});
  assert.deepEqual(state(bag).workingBuild,before);assert.equal(state(bag).patchDrag,null);
  bag.exit();
});

test('plug rerouting is atomic and returning a parent to spares refunds its complete chain',()=>{
  const bag=fixture();
  drag(bag,supply('torch'),input(TECHNIQUE.AFTERIMAGE));
  drag(bag,output(TECHNIQUE.AFTERIMAGE),input(TECHNIQUE.WHITEOUT));
  const before=state(bag).workingBuild;
  drag(bag,input(TECHNIQUE.AFTERIMAGE),input(TECHNIQUE.AFTERIMAGE));
  assert.deepEqual(state(bag).workingBuild,before,'same socket must retain downstream patches');
  drag(bag,input(TECHNIQUE.AFTERIMAGE),input(TECHNIQUE.PUNCH_IN));
  assert.deepEqual(state(bag).workingBuild,before,'invalid reroute cannot pull a chain');
  drag(bag,input(TECHNIQUE.AFTERIMAGE),'bag:patch:return');
  assert.deepEqual(state(bag).workingBuild.techniques,[]);assert.equal(state(bag).workingBuild.unspent,3);
  drag(bag,supply('recorder'),input(TECHNIQUE.PUNCH_IN));
  assert.deepEqual(state(bag).workingBuild.techniques,[TECHNIQUE.PUNCH_IN]);bag.exit();
});

test('no spare cable creates no drag preview; cancellation and foreign pointer release never spend',()=>{
  const empty=fixture({build:normalizeCombatBuild()});
  pointer(empty,'pointerdown',region(empty,supply('torch')));
  assert.equal(state(empty).patchDrag,null);empty.exit();
  for(const type of ['pointercancel','lostpointercapture']) {
    const bag=fixture();pointer(bag,'pointerdown',region(bag,supply('torch')));
    pointer(bag,'pointerup',region(bag,input(TECHNIQUE.AFTERIMAGE)),88);
    assert.ok(state(bag).patchDrag);assert.deepEqual(state(bag).workingBuild.techniques,[]);
    bag.pointer({type,pointerId:7});assert.equal(state(bag).patchDrag,null);
    assert.deepEqual(state(bag).workingBuild.techniques,[]);bag.exit();
  }
  const bag=fixture();pointer(bag,'pointerdown',region(bag,supply('torch')));
  bag.pointer({type:'pointercancel'});assert.equal(state(bag).patchDrag,null);bag.exit();
});

test('keyboard/controller patch and pull the same circuit; staged reconfiguration applies only on exit',()=>{
  let saved=null;
  const bag=fixture({onApplySkills:build=>{saved=build;}});
  bag.key({key:'Enter',code:'Enter'});bag.keyup({key:'Enter',code:'Enter'});
  assert.ok(state(bag).workingBuild.techniques.includes(TECHNIQUE.AFTERIMAGE));assert.equal(saved,null);
  bag.key({key:' ',code:'Space'});
  assert.deepEqual(state(bag).workingBuild.techniques,[]);
  bag.key({controllerAction:'confirm',controller:true});
  assert.ok(state(bag).workingBuild.techniques.includes(TECHNIQUE.AFTERIMAGE));
  bag.exit();assert.ok(saved.techniques.includes(TECHNIQUE.AFTERIMAGE));
});

test('global cancellation during a cable drag also clears a held selector without waiting for keyup',t=>{
  let now=0;t.mock.method(performance,'now',()=>now);
  const bag=fixture(),key={key:'4',code:'Digit4'};
  bag.key(key);now=100;assert.equal(sampleControl('bag:tab:skills').travel,1);
  pointer(bag,'pointerdown',region(bag,supply('torch')));
  assert.ok(state(bag).patchDrag);
  bag.pointer({type:'pointercancel'});
  assert.equal(state(bag).patchDrag,null);
  bag.key(key);now=200;
  assert.equal(sampleControl('bag:tab:skills').travel,1,'fresh press is not swallowed by stale local ownership');
  assert.deepEqual(state(bag).workingBuild.techniques,[]);bag.exit();
});

test('tab buttons are momentary through pointer, digit, and controller selection',t=>{
  let now=0;t.mock.method(performance,'now',()=>now);
  const bag=fixture();
  pointer(bag,'pointerdown',region(bag,'bag:tab:map'));
  assert.equal(state(bag).nav.sectionId,'map');now=100;
  assert.equal(sampleControl('bag:tab:map').travel,1);
  bag.pointer({type:'pointerup',pointerId:7,cellX:-100,cellY:-100});now=250;
  assert.equal(sampleControl('bag:tab:map').travel,0);
  bag.key({key:'4',code:'Digit4'});now=350;assert.equal(sampleControl('bag:tab:skills').travel,1);
  bag.keyup({key:'4',code:'Digit4'});now=500;assert.equal(sampleControl('bag:tab:skills').travel,0);
  bag.key({controllerAction:'tabNext',controller:true});now=600;assert.equal(state(bag).nav.sectionId,'kit');
  assert.equal(sampleControl('bag:tab:kit').travel,1);
  bag.keyup({controllerAction:'tabNext',controller:true});now=750;assert.equal(sampleControl('bag:tab:kit').travel,0);bag.exit();
});
