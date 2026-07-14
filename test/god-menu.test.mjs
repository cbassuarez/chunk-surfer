import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGodMenuScene, resolveGodRowValue } from '../src/game/god-menu.js';

test('god menu accepts both dynamic and literal row values', () => {
  assert.equal(resolveGodRowValue({value:()=> 'READY'}),'READY');
  assert.equal(resolveGodRowValue({value:'[RESUME]'}),'[RESUME]');
  assert.equal(resolveGodRowValue({activate(){}}),'[FIRE]');
});

test('god menu exposes tabbed conditions and closes with F10', () => {
  let value = 0;
  let closed = 0;
  const scene = makeGodMenuScene({
    tabs: [
      { id:'session', name:'Session', rows:[
        { kind:'section', label:'Run' },
        { id:'start', label:'Start', activate:()=>{} },
      ] },
      { id:'conditions', name:'Conditions', rows:[
        { id:'fear', label:'Fear', value:()=>value, adjust:(delta)=>{ value+=delta; } },
      ] },
    ],
    onClose:()=>{closed++;},
  });

  assert.deepEqual(scene.view().tabs.map((tab)=>tab.id), ['session','conditions']);
  scene.key({key:'Tab',preventDefault(){}});
  assert.equal(scene.view().tab, 'conditions');
  scene.key({key:'ArrowRight',preventDefault(){}});
  assert.equal(value, 1);
  scene.key({key:'F10',preventDefault(){}});
  assert.equal(closed, 1);
});

test('god menu scene blocks both player input and world simulation', () => {
  const scene = makeGodMenuScene({tabs:[{id:'one',rows:[{id:'fire',activate(){}}]}]});
  assert.equal(scene.id, 'god-menu');
  assert.equal(scene.blocksInput, true);
  assert.equal(scene.blocksWorld, true);
});
