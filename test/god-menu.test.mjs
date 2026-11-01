import test from 'node:test';
import assert from 'node:assert/strict';
import { godTabLines, makeGodMenuScene, resolveGodRowDanger, resolveGodRowValue } from '../src/game/god-menu.js';

test('god menu accepts both dynamic and literal row values', () => {
  assert.equal(resolveGodRowValue({value:()=> 'READY'}),'READY');
  assert.equal(resolveGodRowValue({value:'[RESUME]'}),'[RESUME]');
  assert.equal(resolveGodRowValue({activate(){}}),'[FIRE]');
});

test('god menu accepts dynamic danger rows', () => {
  let active = false;
  assert.equal(resolveGodRowDanger({danger:()=>active}), false);
  active = true;
  assert.equal(resolveGodRowDanger({danger:()=>active}), true);
  assert.equal(resolveGodRowDanger({danger:true}), true);
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

test('god menu tabs wrap onto further lines instead of running off the panel', () => {
  // The fifteen production tab names at the panel's 92-cell body width.
  const names = ['SESSION','PLACES','DRIVES','CATHEDRAL','ROOF','SOURCE','TOWER','DOORS','CONDITIONS',
    'LOOK STACK','ITEMS','GAME PARTS','SIDE QUESTS','THIRD FLOOR','AUDIO'];
  const lines = godTabLines(names, 92);
  assert.ok(lines.length >= 2);
  assert.deepEqual(lines.flat().map(({ index }) => index), names.map((_, index) => index));
  for (const line of lines) {
    const cells = line.reduce((sum, { name }) => sum + name.length + 2, 0) - 1;
    assert.ok(cells <= 92, `line of ${cells} cells`);
  }
  assert.equal(godTabLines(['SESSION', 'PLACES'], 92).length, 1);
  assert.deepEqual(godTabLines(['A-VERY-LONG-TAB'], 4).map((line) => line.length), [1]);
});
