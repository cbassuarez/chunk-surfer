import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHitRegions } from '../src/render/hit-regions.js';
import { visiblePresets, cycleRuleValue, normalizeRuleValues } from '../src/progression/difficulty.js';
import { RULE_HELP, RULE_LABELS, VALUE_LABELS } from '../src/progression/difficulty-defs.js';
import { deriveUnlocks } from '../src/progression/unlocks.js';
import { ENDING_IDS } from '../src/progression/schema.js';
import { machinePanelBody } from '../src/render/presentation.js';

// Run the actual scene source with drawing/audio boundaries stubbed. Production
// hit testing and authored presets remain real; no browser or renderer needed.
const source = readFileSync(new URL('../src/game/difficulty-select.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '')
  .replace('export function makeDifficultySelectScene', 'function makeDifficultySelectScene');
function fixture({ preparation = true, confirm = () => true, size = { cols: 120, rows: 40 }, endings = [] } = {}) {
  const calls = { confirmed: [], cancelled: 0, removed: [], popped: 0, panels: [], printed: [] };
  const audio = { menuMove() {}, menuConfirm() {}, menuBack() {}, startMenuHiss() {}, stopMenuHiss() {} };
  const context = { Promise, RULE_HELP, RULE_LABELS, VALUE_LABELS, visiblePresets, cycleRuleValue, normalizeRuleValues, deriveUnlocks, createHitRegions,
    AUDIO: audio, UI_COLOR: {}, uiCenter() {}, uiLine() {}, uiScrim() {}, uiSize: () => size, uiText() {}, uiWrap: text => [String(text)], drawLocationIndicator() {}, drawVfdText() {}, drawLampButton() {}, promptLine: () => '',
    drawPrintedText: (...args) => calls.printed.push(args),
    withMachinePanel: (x,y,w,h,options,draw) => { calls.panels.push({x,y,w,h,...options}); draw(machinePanelBody(x,y,w,h,options)); },
    scenes: { pop: () => { calls.popped++; scene.exit(); }, remove: value => { calls.removed.push(value); scene.exit(); } },
  };
  vm.createContext(context); vm.runInContext(source, context);
  const scene = context.makeDifficultySelectScene({ preparation, meta: { endingsSeen: endings },
    onConfirm: selection => { calls.confirmed.push(selection); return confirm(selection); },
    onCancel: () => { calls.cancelled++; } });
  scene.enter(); scene.render();
  function point(id, type = 'pointerdown') { const r = scene.view().hitRegions.find(r => r.id === id); assert.ok(r, id); scene.pointer({ type, button: 0, cellX: r.x+r.w/2, cellY: r.y+r.h/2 }); scene.render(); }
  return { scene, calls, point, size };
}
function deferred() { let resolve, reject; const promise = new Promise((yes,no) => { resolve=yes; reject=no; }); return { promise, resolve, reject }; }

test('van rows only preview; dedicated confirmation remains open until async save acknowledges', async () => {
  const write = deferred(), f = fixture({ confirm: () => write.promise });
  assert.equal(f.calls.panels.at(-1).label, 'CHOOSE SHIFT'); assert.equal(f.calls.panels.at(-1).source, 'VAN');
  f.point('difficulty:story', 'pointermove'); f.point('difficulty:story');
  assert.equal(f.scene.view().selected, 'story'); assert.equal(f.calls.confirmed.length, 0); assert.equal(f.calls.removed.length, 0);
  const confirmHit=f.scene.view().hitRegions.find(r=>r.id==='difficulty:confirm');
  f.scene.pointer({type:'pointerdown',button:2,cellX:confirmHit.x+.2,cellY:confirmHit.y+.2});assert.equal(f.calls.confirmed.length,0,'secondary mouse button cannot confirm a shift');
  f.point('difficulty:confirm'); assert.equal(f.scene.view().pending, true); assert.equal(f.calls.confirmed.length, 1); assert.equal(f.calls.removed.length, 0);
  f.point('difficulty:confirm'); f.scene.key({key:'Enter'}); f.scene.key({key:'Escape'}); f.point('difficulty:back');
  assert.equal(f.calls.confirmed.length, 1); assert.equal(f.calls.cancelled, 0); assert.equal(f.scene.view().selected, 'story');
  write.resolve({ok:true}); await f.scene.whenSettled(); assert.equal(f.calls.removed.length, 1); assert.equal(f.calls.popped, 0);
});

test('failed shift save remains visible, labels Retry and repeats only on deliberate confirmation', async () => {
  let attempts = 0; const f = fixture({ confirm: () => ++attempts === 1 ? Promise.reject(Error('disk full')) : Promise.resolve(true) });
  f.scene.key({key:'Enter',repeat:true}); assert.equal(attempts, 0);
  f.scene.key({key:'Enter'}); await f.scene.whenSettled(); f.scene.render();
  assert.equal(f.scene.view().pending, false); assert.match(f.scene.view().error, /could not be saved/); assert.equal(f.calls.removed.length, 0);
  assert.equal(f.scene.view().hitRegions.find(r => r.id === 'difficulty:confirm').label, 'RETRY CONFIRMATION');
  f.scene.key({controllerAction:'confirm',repeat:true}); assert.equal(attempts, 1);
  f.scene.key({controllerAction:'confirm'}); await f.scene.whenSettled(); assert.equal(attempts, 2); assert.equal(f.calls.removed.length, 1);
});

test('negative and missing acknowledgements stay in van selector; Back after failure returns to preparation', async () => {
  for (const result of [false, {ok:false,reason:'SAVE_MISMATCH'}, undefined]) {
    const f = fixture({ confirm: () => result }); f.point('difficulty:confirm'); await f.scene.whenSettled();
    assert.match(f.scene.view().error, /Retry/); assert.equal(f.calls.removed.length, 0);
    f.scene.key({controllerAction:'back'}); assert.equal(f.calls.cancelled, 1); assert.equal(f.calls.removed.length, 1);
  }
});

test('failed confirmation freezes the exact preset or custom rules until Retry or Back',async()=>{
  for(const custom of [false,true]){
    let fail=true;const f=fixture({endings:ENDING_IDS,confirm:()=>!fail});
    f.point(custom?'difficulty:custom':'difficulty:night');
    if(custom){f.point('difficulty:confirm');f.scene.key({key:'ArrowRight'});}
    f.point('difficulty:confirm');await f.scene.whenSettled();f.scene.render();
    const attempted=structuredClone(f.calls.confirmed[0]),view=f.scene.view();
    f.point('difficulty:story');f.point('difficulty:story','pointermove');
    f.scene.key({key:'ArrowDown'});f.scene.key({controllerAction:'move_right'});f.scene.key({key:'ArrowLeft'});
    if(custom)f.point('difficulty-rule:presencePressure');
    assert.equal(f.scene.view().selected,view.selected);assert.equal(f.scene.view().mode,view.mode);
    fail=false;f.point('difficulty:confirm');await f.scene.whenSettled();
    assert.deepEqual(structuredClone(f.calls.confirmed[1]),attempted,'Retry cannot substitute another failed-save candidate');
    assert.equal(f.calls.removed.length,1);
  }
});

test('cancelling a changed preview never invokes save; custom editing also remains a draft', async () => {
  const f = fixture({endings:['sacrifice','helped']});
  f.point('difficulty:night'); f.point('difficulty:back'); assert.equal(f.calls.confirmed.length, 0); assert.equal(f.calls.cancelled, 1);
  const custom = fixture({endings:ENDING_IDS}); custom.point('difficulty:custom');
  assert.equal(custom.scene.view().mode,'select'); custom.point('difficulty:confirm'); assert.equal(custom.scene.view().mode,'custom'); assert.equal(custom.calls.confirmed.length,0);
  custom.scene.key({controllerAction:'move_right'}); custom.scene.key({key:'Escape'}); assert.equal(custom.scene.view().mode,'select'); assert.equal(custom.calls.confirmed.length,0);
  custom.scene.key({key:'Escape'}); assert.equal(custom.calls.cancelled,1);
});

test('preparation callback completion after teardown cannot remove a later scene', async () => {
  const write=deferred(), f=fixture({confirm:()=>write.promise});f.scene.key({key:'Enter'});f.scene.exit();write.resolve(true);await f.scene.whenSettled();
  assert.equal(f.calls.removed.length,0);assert.equal(f.calls.popped,0);
});

test('van shift hit controls fit compact75x20 and normal120x40 layouts', () => {
  for (const size of [{cols:75,rows:20},{cols:120,rows:40}]) {
    const f=fixture({size,endings:ENDING_IDS}); const hits=f.scene.view().hitRegions;
    assert.ok(hits.some(r=>r.id==='difficulty:confirm'));assert.ok(hits.some(r=>r.id==='difficulty:back'));
    for(const r of hits){assert.ok(r.x>=0&&r.y>=0&&r.w>0&&r.h>0,r.id);assert.ok(r.x+r.w<=size.cols&&r.y+r.h<=size.rows,`${size.cols}x${size.rows} ${r.id}`);}
    const buttons=hits.filter(r=>['confirm','back'].includes(r.kind));
    for(const b of buttons)for(const r of hits.filter(r=>r.kind==='difficulty-preset'))assert.ok(b.y>=r.y+r.h,`${b.id} does not overlap ${r.id}`);
  }
});

test('non-preparation selector retains its existing one-click immediate confirmation', () => {
  const f=fixture({preparation:false,confirm:()=>Promise.resolve(false)});f.point('difficulty:night');
  assert.equal(f.calls.popped,1);assert.equal(f.calls.confirmed.length,1);assert.equal(f.calls.confirmed[0].preset,'night');
  assert.equal(f.calls.removed.length,0);assert.equal(f.scene.view().pending,false);assert.equal(f.calls.panels[0].source,'SETUP');
});
