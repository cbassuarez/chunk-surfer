import test from 'node:test';
import assert from 'node:assert/strict';

// Exercise the native command boundary without claiming OS-window acceptance.
globalThis.window = { __TAURI_INTERNALS__: {} };
const { createWindowChoreographyDirector } = await import('../src/platform/window-choreography.js');
const { createPracticeDrill, practiceDrillCue, performPracticeMove } = await import('../src/game/practice-drill.js');
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture({ prepare = async () => true, show = async () => true } = {}) {
  const calls = [], shown = []; let serial = 0, activeCue = null, fullscreen = true;
  const ctx = new Proxy({}, {get:() => () => {}});
  const documentApi = {createElement:() => ({getContext:() => ctx,toDataURL:() => 'data:image/png;base64,test'})};
  const director = createWindowChoreographyDirector({
    documentApi, tokenFactory: () => 'practice-test',
    runtimeApi: { invoke: async command => {
      calls.push(command);
      if(command==='chunk_window_choreography_begin')fullscreen=false;
      return command === 'chunk_window_metrics' ? { native_fullscreen: fullscreen } : true;
    } },
    releaseFullscreen: async transition => { calls.push('advisory'); return transition(); },
    effects: {
      ensure: () => calls.push('ensure'),
      prepareMedia: async () => { calls.push('prepare'); return prepare(); },
      registerSnapshot: () => `snapshot-practice-${serial++}`,
      showComposition: async (plan, meta) => { activeCue=plan.cueId; calls.push('show'); shown.push({panes:plan.surfaces,meta}); return show(); },
      hideComposition: async () => { activeCue=null; calls.push('hide'); },
      debug: () => ({activeCompositionCue:activeCue}),
    },
  });
  return { director, calls, shown, enterFullscreen:()=>{fullscreen=true;} };
}

test('practice prewarms, runs the fullscreen advisory, then holds and updates both clues in one transaction', async () => {
  const {director,calls,shown} = fixture();
  let state = createPracticeDrill({seed:2});
  const first = await director.showPracticeCue(practiceDrillCue(state));
  assert.equal(first.native,true);
  assert.deepEqual(calls,['ensure','prepare','chunk_window_metrics','advisory','chunk_window_choreography_begin','show']);
  assert.equal(shown[0].panes.length,4);
  assert.ok(shown[0].panes.slice(0,2).every(p => p.content.kind==='snapshot'));
  assert.ok(shown[0].panes.slice(2).every(p => p.shader==='nvme-sector')); 
  await flush();
  assert.ok(!calls.includes('hide'),'clues persist while the player reads');
  state = performPracticeMove(state,state.sequence[0]);
  await director.showPracticeCue(practiceDrillCue(state));
  assert.equal(calls.filter(c => c === 'advisory').length,1);
  assert.notDeepEqual(shown[1].panes.slice(0,2).map(p => p.content.token),shown[0].panes.slice(0,2).map(p => p.content.token));
  assert.deepEqual(shown[1].panes.map(p => p.id),shown[0].panes.map(p => p.id),'update the same two stable surfaces');
  await director.finishBattle({battleId:'practice',result:'win'});
  assert.equal(calls.at(-1),'chunk_window_choreography_restore');
  assert.ok(calls.includes('hide'));
});

test('a partially opened composition is hidden and reports unavailable without an in-game substitute', async () => {
  const {director,calls} = fixture({show:async () => false});
  const result = await director.showPracticeCue(practiceDrillCue(createPracticeDrill()));
  assert.equal(result.native,false); assert.equal(result.unavailable,true);
  assert.deepEqual(calls.slice(-2),['show','hide']);
  await director.restore();
});

test('failed prewarm reports unavailable without requesting an unnecessary fullscreen transition', async () => {
  const {director,calls} = fixture({prepare:async () => false});
  const result = await director.showPracticeCue(practiceDrillCue(createPracticeDrill()));
  assert.equal(result.native,false);
  assert.deepEqual(calls,['ensure','prepare']);
});

test('ending during prewarm never opens delayed clue windows', async () => {
  let release;
  const {director,calls} = fixture({prepare:() => new Promise(resolve => {release=resolve;})});
  const pending = director.showPracticeCue(practiceDrillCue(createPracticeDrill()));
  await flush(); await director.finishBattle(); release(true);
  assert.equal(await pending,null);
  assert.ok(!calls.includes('show'));
  assert.ok(!calls.includes('advisory'));
});

test('ending during native placement hides any surface that finishes opening late', async () => {
  let release;
  const {director,calls} = fixture({show:() => new Promise(resolve => {release=resolve;})});
  const pending = director.showPracticeCue(practiceDrillCue(createPracticeDrill()));
  await flush(); assert.equal(typeof release,'function');
  await director.finishBattle(); release(true);
  assert.equal(await pending,null);
  assert.equal(calls.at(-1),'hide');
  assert.equal(director.active(),false);
});

test('pausing hides the practice composition; resuming can restore the same clue snapshots', async () => {
  const {director,calls,shown}=fixture();
  const cue=practiceDrillCue(createPracticeDrill());
  await director.showPracticeCue(cue);
  director.suspend(); await flush();
  assert.equal(calls.at(-1),'hide');
  await director.showPracticeCue(cue);
  assert.deepEqual(shown[1].panes.slice(0,2).map(p=>p.content.token),shown[0].panes.slice(0,2).map(p=>p.content.token));
  await director.finishBattle();
});

test('re-entering fullscreen mid-exercise invokes a fresh advisory before the next clue', async () => {
  const {director,calls,enterFullscreen}=fixture();
  const state=createPracticeDrill(),cue=practiceDrillCue(state);
  await director.showPracticeCue(cue); enterFullscreen();
  const result=await director.showPracticeCue(cue);
  assert.equal(result.native,true);
  assert.equal(calls.filter(call=>call==='advisory').length,2);
  assert.equal(calls.filter(call=>call==='chunk_window_choreography_restore').length,1);
  await director.finishBattle();
});
