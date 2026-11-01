import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
function productionFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf('\n}\n', start);
  assert.ok(start >= 0 && end > start, `missing ${name}`);
  return source.slice(start, end + 3);
}

test('hiding preserves a lit torch and its recording; exiting releases concealment', () => {
  const state = { active:false, cover:null, openings:null, lean:0, enteredAt:0, nextRustleAt:0 };
  const calls = [];
  const context = {
    coverState:state, coverHere:()=>({wallCell:{x:3,y:2},nx:-1,ny:0}),
    coverOpenings:()=>({positive:0,negative:null}), coverPlan:{},
    performance:{now:()=>1000}, REC:{setHidden:value=>calls.push(['hidden',value]),lightOn:()=>true},
    toggleTorchAction:()=>calls.push(['torch']),
    resetMotionInput:reason=>calls.push(['motion',reason]),
  };
  vm.createContext(context);
  vm.runInContext(`${productionFunction('enterCover')}\n${productionFunction('exitCover')}\nglobalThis.api={enterCover,exitCover}`,context);
  assert.equal(context.api.enterCover(),true);
  assert.equal(state.active,true);
  assert.deepEqual(calls,[['hidden',true],['motion','cover-enter']], 'entry does not touch the torch');
  assert.equal(context.api.exitCover(),true);
  assert.equal(state.active,false);
  assert.deepEqual(calls.slice(2),[['hidden',false],['motion','cover-exit']]);
});
