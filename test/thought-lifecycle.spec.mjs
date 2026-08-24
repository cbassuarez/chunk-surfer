import test from 'node:test';
import assert from 'node:assert/strict';

import * as scenes from '../src/game/scenes.js';
import { makeThoughtScene } from '../src/game/thoughts.js';

function resetStack(){
  while(scenes.depth())scenes.pop();
}

test.afterEach(resetStack);

test('Escape cancels an optional small-shell action without completing its chain', () => {
  let completed=0,cancelled=0,exited=0;
  const scene=makeThoughtScene({
    id:'inspect-drawer',
    nodes:{start:{lines:[{who:'you',text:'The drawer sticks.'},{who:'direction',text:'Inside it, something turns.'}]}},
    onDone:()=>completed++,onCancel:()=>cancelled++,onExit:()=>exited++,
  });
  scenes.push(scene);
  assert.equal(scene.handlesEscape,true);
  assert.equal(scene.key({key:'Escape'}),true);
  assert.equal(scenes.depth(),0);
  assert.equal(completed,0,'the abandoned tail never calls onDone');
  assert.equal(cancelled,1);
  assert.equal(exited,1);
});

test('required dialogue swallows Escape and remains active', () => {
  const scene=makeThoughtScene({
    id:'required-handoff',escapable:false,
    nodes:{start:{lines:[{who:'guard',text:'Keys when you sign.'}]}},
  });
  scenes.push(scene);
  assert.equal(scene.handlesEscape,false);
  assert.equal(scene.key({key:'Escape'}),true);
  assert.equal(scenes.top(),scene);
});
