import test from 'node:test';
import assert from 'node:assert/strict';
import { makeVanWorkbenchScene } from '../src/game/van-workbench.js';
import { freshFieldKit, FIELD_KIT_OPTIONS } from '../src/game/field-kit.js';
import { vanWorkbenchLayout, vanWorkbenchReady, vanWorkbenchEffectRows, vanWorkbenchOptions,
  VAN_WORKBENCH_GROUPS } from '../src/render/van-workbench-view.js';
import { witnessEditionStatus } from '../src/progression/unlocks.js';
import { controlMechanicsSnapshot } from '../src/game/control-mechanics.js';
import { createVanWorkbenchStage, vanWorkbenchModelIds, clipStageTarget, VAN_RECORDER_CANVAS_FLIP_Y } from '../src/render/van-workbench-stage.js';

const size = { cols: 75, rows: 20 };
function fixture(overrides = {}, hooks = {}) {
  let state = { bagTaken: false, mapTaken: false, difficultyConfirmed: false,
    difficultyLabel: 'CONTRACT', fieldKit: freshFieldKit(), ...overrides };
  const calls = [], witnessInspections = [];
  const scene = makeVanWorkbenchScene({ getState: () => state,
    onTakeCase: () => { calls.push('case'); state = { ...state, bagTaken: true }; },
    onTakeMap: () => { calls.push('map'); state = { ...state, mapTaken: true }; },
    onChooseDifficulty: () => { calls.push('difficulty'); },
    onKitChange: kit => { calls.push(['kit', kit]); if(hooks.onKitChange?.(kit)===false)return false;state = { ...state, fieldKit: kit }; },
    onInspectWitness: context => { calls.push(['inspect-witness',context]);witnessInspections.push(context); },
    onInspect: id => calls.push(['inspect', id]), onContinue: () => calls.push('continue'), onClose: () => calls.push('close') });
  scene.enter(); scene.render(size);
  const click = id => {
    const hit = scene.debugState().hitRegions.find(region => region.id === id);
    assert.ok(hit, `rendered hit ${id}`);
    const event = { pointerId: 7, button: 0, cellX: hit.x + hit.w / 2, cellY: hit.y + hit.h / 2 };
    scene.pointer({ ...event, type: 'pointerdown' }); scene.pointer({ ...event, type: 'pointerup' }); scene.render(size);
  };
  return { scene, calls, click, witnessInspections, state: () => state, set: update => { state = { ...state, ...update }; } };
}

test('van workbench requires independent case, survey indicator, and explicit shift selection', () => {
  const f = fixture();
  assert.equal(f.scene.handlesEscape,true,'Escape belongs to the workbench, not the global pause menu');
  f.click('van:continue'); assert.equal(f.calls.includes('continue'), false);
  f.click('van:map'); assert.equal(f.state().mapTaken, true); assert.equal(f.state().bagTaken, false);
  f.click('van:map'); assert.equal(f.calls.filter(call => call === 'map').length, 1, 'acquisition is not repeated');
  f.click('van:continue'); assert.equal(f.calls.includes('continue'), false);
  f.click('van:case'); assert.equal(f.state().bagTaken, true);
  f.click('van:difficulty'); assert.equal(f.calls.at(-1), 'difficulty');
  f.click('van:continue'); assert.equal(f.calls.includes('continue'), false, 'opening shift selection is not confirming it');
  f.set({ difficultyConfirmed: true, difficultyLabel: 'GUIDED' }); f.scene.resume(); f.scene.render(size);
  f.click('van:continue'); assert.equal(f.calls.filter(call => call === 'continue').length, 1);
  f.click('van:continue'); assert.equal(f.calls.filter(call => call === 'continue').length, 1, 'continuation cannot double-fire while its child owns the stack');
  assert.equal(f.scene.debugState().continuationPending, true);
  f.scene.resume(); f.click('van:difficulty'); assert.equal(f.calls.at(-1), 'difficulty', 'confirmed difficulty remains revisable');
  f.scene.exit();
});

test('fitters use only manifest options, preserve other groups, and colors cannot change hardware effects', () => {
  const f = fixture({ bagTaken: true });
  f.click('van:kit:headphones:closed');
  assert.equal(f.state().fieldKit.headphones, 'closed');
  f.click('van:group:microphone'); f.click('van:kit:microphone:directional');
  f.click('van:group:recorder'); f.click('van:kit:recorder:headroom');
  const before = vanWorkbenchEffectRows(f.state().fieldKit);
  assert.match(before[0], /MONITOR \+15%.*OUTSIDE -10%/);
  assert.match(before[1], /NOISE -15%.*TAKE TIME \+10%/);
  assert.match(before[2], /OVERLOAD \+10%.*CELL \+15%/);
  for (const [group, option] of [['faceplate', 'olive'], ['buttons', 'sea-glass'], ['vfd', 'ice']]) {
    f.click(`van:group:${group}`); f.click(`van:kit:${group}:${option}`);
    assert.equal(f.state().fieldKit.cosmetics[group], option);
  }
  assert.deepEqual(vanWorkbenchEffectRows(f.state().fieldKit), before);
  assert.equal(f.state().fieldKit.headphones, 'closed');
  assert.equal(f.state().fieldKit.microphone, 'directional');
  assert.equal(f.state().fieldKit.recorder, 'headroom');
  assert.equal(f.scene.debugState().state.fieldKit.schema, 1); f.scene.exit();
});

test('unowned gear cannot be fitted and hover cannot acquire anything', () => {
  const f = fixture();
  f.click('van:kit:headphones:closed'); assert.equal(f.calls.length, 0);
  assert.match(f.scene.debugState().notice, /Take the field case/);
  const map = f.scene.debugState().hitRegions.find(region => region.id === 'van:map');
  f.scene.pointer({ type: 'pointermove', cellX: map.x + map.w / 2, cellY: map.y + map.h / 2 });
  assert.equal(f.calls.length, 0); assert.equal(f.scene.debugState().focusId, 'van:map');
  f.scene.exit();
});

test('inspection and back delegate without closing or replacing the workbench and resume sees fresh state', () => {
  const f = fixture({ bagTaken: true });
  f.click('van:group:buttons'); f.click('van:kit:buttons:signal'); f.click('van:inspect:recorder');
  assert.deepEqual(f.calls.at(-1), ['inspect', 'recorder']);
  f.set({ difficultyConfirmed: true, difficultyLabel: 'DEAD AIR' }); f.scene.resume();
  assert.equal(f.scene.debugState().selectedGroup, 'buttons');
  assert.equal(f.scene.debugState().state.fieldKit.cosmetics.buttons, 'signal');
  assert.equal(f.scene.debugState().state.difficultyLabel, 'DEAD AIR');
  f.click('van:inspect:map'); assert.deepEqual(f.calls.at(-1), ['inspect', 'map']);
  f.scene.key({ key: 'Escape', code: 'Escape' }); assert.equal(f.calls.at(-1), 'close');
  f.scene.resume(); f.scene.render(size); assert.equal(f.scene.debugState().selectedGroup, 'buttons'); f.scene.exit();
});

test('keyboard and controller use stable fittings and real confirm, with release/cancel cleanup', () => {
  const f = fixture({ bagTaken: true, mapTaken: true, difficultyConfirmed: true });
  f.scene.key({ key: '4', code: 'Digit4' }); assert.equal(f.scene.debugState().selectedGroup, 'faceplate');
  f.scene.key({ controller: true, controllerAction: 'tabNext' }); assert.equal(f.scene.debugState().selectedGroup, 'buttons');
  f.scene.key({ controller: true, controllerAction: 'tabPrev' }); assert.equal(f.scene.debugState().selectedGroup, 'faceplate');
  // Fitting filmstrip is now below the object stage; move up into its controls.
  f.scene.key({ key: 'ArrowUp', code: 'ArrowUp' });
  const variant = f.scene.debugState().hitRegions.find(hit => hit.id === 'van:kit:faceplate:black');
  f.scene.pointer({ type: 'pointermove', cellX: variant.x + variant.w / 2, cellY: variant.y + variant.h / 2 });
  const selected = f.scene.debugState().focusId;
  f.scene.key({ key: 'Enter', code: 'Enter', controller: true, controllerAction: 'confirm' });
  assert.ok(controlMechanicsSnapshot().ids.includes(selected));
  assert.equal(f.scene.keyup({ key: 'Enter', code: 'Enter', controller: true }), true);
  f.scene.pointer({ type: 'pointercancel' });
  assert.ok(!controlMechanicsSnapshot().ids.some(id => id.startsWith('van:')));
  f.scene.key({ key: 'Enter', code: 'Enter', repeat: true });
  assert.ok(!controlMechanicsSnapshot().ids.some(id => id.startsWith('van:')), 'repeat cannot acquire a new held switch');
  f.scene.exit();
});

test('all workbench controls and the actual preview fit normal, compact, and enlarged UI bounds', () => {
  for (const dimensions of [{ cols: 150, rows: 38 }, { cols: 113, rows: 30 }, { cols: 75, rows: 20 }]) {
    for (const group of VAN_WORKBENCH_GROUPS) {
      const layout = vanWorkbenchLayout(dimensions, { bagTaken: true }, group.id);
      const ids = layout.regions.map(region => region.id);
      assert.equal(new Set(ids).size, ids.length);
      for (const region of [...layout.regions, layout.recorder, layout.description]) {
        assert.ok(region.x >= 0 && region.y >= 0 && region.w > 0 && region.h > 0);
        assert.ok(region.x + region.w <= dimensions.cols + 1e-8, `${group.id}: horizontal ${region.id}`);
        assert.ok(region.y + region.h <= dimensions.rows + 1e-8, `${group.id}: vertical ${region.id}`);
      }
      assert.ok(layout.description.y >= layout.variants[0].y + layout.variants[0].h);
      assert.ok(layout.description.y + layout.description.h < layout.footerY);
      assert.ok(layout.recorder.x >= layout.fittings.x);
      assert.ok(layout.recorder.x + layout.recorder.w <= layout.fittings.x + layout.fittings.w);
      assert.equal(layout.showRecorder, ['faceplate', 'buttons', 'vfd'].includes(group.id), 'amp and flashlight use their own physical closeups');
      assert.ok(layout.recorder.y + layout.recorder.h < layout.footerY);
      assert.deepEqual(layout.variants.map(item => item.optionId), vanWorkbenchOptions(group.id, { bagTaken: true }).map(item => item.id));
    }
  }
});

test('every authored option has its full tradeoff description and readiness is never inferred from a default', () => {
  for (const options of [FIELD_KIT_OPTIONS.headphones, FIELD_KIT_OPTIONS.microphone, FIELD_KIT_OPTIONS.recorder,
    ...Object.values(FIELD_KIT_OPTIONS.cosmetics)]) for (const option of options) assert.ok(option.description.length > 20);
  assert.equal(vanWorkbenchReady({ bagTaken: true, mapTaken: true, difficultyLabel: 'CONTRACT' }), false);
  assert.deepEqual(vanWorkbenchEffectRows(freshFieldKit()), ['REFERENCE SIGNAL PATH / NO MODIFIERS']);
});

test('actual selected component IDs survive keyboard inspection and sidegrade changes', () => {
  const f = fixture({ bagTaken: true });
  f.click('van:kit:headphones:open'); f.scene.key({ key: 'i' });
  assert.deepEqual(f.calls.at(-1), ['inspect', 'headphones-open']);
  f.scene.resume(); f.click('van:group:microphone'); f.click('van:kit:microphone:wide'); f.scene.key({ key: 'i' });
  assert.deepEqual(f.calls.at(-1), ['inspect', 'microphone-wide']);
  assert.equal(vanWorkbenchModelIds(f.state().fieldKit).recorder, 'field-recorder', 'approved standalone recorder, never the old recorder-plus-headphones composite');
  assert.equal(vanWorkbenchModelIds(f.state().fieldKit).radio, 'radio');
  assert.equal(vanWorkbenchModelIds(f.state().fieldKit).light, 'light'); f.scene.exit();
});

test('stage targets clip to their rendered viewport and no-DOM disposal is safe and final', () => {
  assert.deepEqual(clipStageTarget({ x: -2, y: 0, w: 20, h: 30 }, { x: 1, y: 2, w: 10, h: 10 }), { x: 1, y: 2, w: 10, h: 10 });
  const stage = createVanWorkbenchStage(); stage.suspend(); assert.equal(stage.snapshot().suspended, true);
  stage.resume(); stage.dispose(); stage.dispose();
  assert.equal(stage.snapshot().disposed, true); assert.equal(stage.snapshot().rendererCount, 0);
  assert.deepEqual(stage.snapshot().models, {});
});

test('physical recorder CanvasTexture follows the actual authored plane UV orientation', async () => {
  const { NodeIO } = await import('@gltf-transform/core');
  const doc = await new NodeIO().read(new URL('../public/assets/items/field-recorder.glb', import.meta.url).pathname);
  const plane = doc.getRoot().listNodes().find(node => node.getName() === 'recorder-display-substrate');
  assert.ok(plane, 'separate physical readout substrate is present');
  const primitive = plane.getMesh().listPrimitives()[0], positions = primitive.getAttribute('POSITION').getArray();
  const uv = primitive.getAttribute('TEXCOORD_0').getArray();
  for (let i = 0; i < positions.length / 3; i++) assert.equal(uv[i * 2 + 1], positions[i * 3 + 1] > 0 ? 1 : 0);
  assert.equal(VAN_RECORDER_CANVAS_FLIP_Y, true, 'canvas top must map to v=1, not the default convention of unrelated glTF assets');
});

const witnessState = endingsSeen => {
  const cosmeticMeta={endingsSeen,cosmetics:{unlocked:[]}};
  return{cosmeticMeta,witness:witnessEditionStatus(cosmeticMeta)};
};
test('WITNESS is withheld before an ending and a focusable, non-fitting preview after one',()=>{
  const first=fixture({bagTaken:true});first.click('van:group:faceplate');
  assert.ok(!first.scene.debugState().hitRegions.some(region=>region.id==='van:kit:faceplate:witness'));
  first.scene.exit();
  const f=fixture({...witnessState(['helped'])});f.click('van:group:faceplate');
  const hit=f.scene.debugState().hitRegions.find(region=>region.id==='van:kit:faceplate:witness');
  assert.equal(hit.enabled,true,'locked edition is reachable even before case acquisition');
  assert.equal(hit.locked,true);assert.equal(hit.fittable,false);assert.match(hit.displayLabel,/1\/2/);
  f.scene.pointer({type:'pointermove',cellX:hit.x+hit.w/2,cellY:hit.y+hit.h/2});f.scene.render(size);
  assert.equal(f.scene.debugState().layout.previewFinish,'witness');
  assert.equal(f.state().fieldKit.cosmetics.faceplate,'aluminum','hover preview does not fit or save');
  assert.equal(f.witnessInspections.length,0);
  f.click('van:kit:faceplate:witness');
  const context=f.witnessInspections.at(-1);assert.equal(context.owned,false);assert.equal(context.count,1);assert.equal(context.required,2);
  assert.equal(context.onFit(),false,'even a called hidden fit action must recheck ownership');
  assert.equal(f.calls.filter(call=>Array.isArray(call)&&call[0]==='kit').length,0);
  assert.match(f.scene.debugState().notice,/2 DIFFERENT ENDINGS.*1 OF 2/);
  assert.doesNotMatch(f.scene.debugState().notice,/Take the field case/);
  f.scene.exit();
});

test('owned WITNESS is inspected before explicit fitting, preserves hardware, and saves once',()=>{
  const kit=freshFieldKit();kit.headphones='open';kit.microphone='directional';kit.recorder='headroom';
  kit.cosmetics.buttons='sea-glass';kit.cosmetics.vfd='ice';
  const f=fixture({bagTaken:true,fieldKit:kit,...witnessState(['helped','drugged'])});
  f.click('van:group:faceplate');f.click('van:kit:faceplate:witness');
  assert.equal(f.state().fieldKit.cosmetics.faceplate,'aluminum','opening an owned sleeve still does not fit it');
  const context=f.witnessInspections.at(-1);assert.equal(context.owned,true);
  f.scene.suspend();assert.equal(context.onFit(),true,'explicit fit may complete while inspection owns the stack');
  assert.equal(f.state().fieldKit.cosmetics.faceplate,'witness');
  assert.deepEqual({...f.state().fieldKit,cosmetics:{...f.state().fieldKit.cosmetics,faceplate:'aluminum'}},kit);
  assert.equal(context.onFit(),false,'a repeated inspector callback cannot write twice');
  assert.equal(f.calls.filter(call=>Array.isArray(call)&&call[0]==='kit').length,1);
  f.scene.resume();f.scene.render(size);
  assert.equal(f.scene.debugState().selectedGroup,'faceplate');
  assert.equal(f.scene.debugState().focusId,'van:kit:faceplate:witness');
  assert.equal(f.scene.debugState().layout.witnessFitted,true);
  assert.match(f.scene.debugState().notice,/WITNESS EDITION FITTED/);
  f.scene.exit();
});

test('WITNESS fitting rechecks current ownership, actual case, save acceptance, and scene lifetime',()=>{
  let accept=false;
  const f=fixture({bagTaken:true,...witnessState(['helped','drugged'])},{onKitChange:()=>accept});
  f.click('van:group:faceplate');f.click('van:kit:faceplate:witness');const context=f.witnessInspections.at(-1);
  // Keep the old state.witness/rectangle to prove the current profile is authority.
  f.set({cosmeticMeta:{endingsSeen:['helped'],cosmetics:{unlocked:[]}}});
  assert.equal(context.onFit(),false);assert.equal(f.state().fieldKit.cosmetics.faceplate,'aluminum');
  f.set({...witnessState(['helped','drugged']),bagTaken:false});assert.equal(context.onFit(),false);
  assert.match(f.scene.debugState().notice,/Take the field case/);
  f.set({bagTaken:true});assert.equal(context.onFit(),false,'rejected save leaves the fitting retryable');
  assert.equal(f.state().fieldKit.cosmetics.faceplate,'aluminum');assert.match(f.scene.debugState().notice,/NOT SAVED/);
  accept=true;assert.equal(context.onFit(),true);
  f.click('van:kit:faceplate:witness');const stale=f.witnessInspections.at(-1);f.scene.exit();
  assert.equal(stale.onFit(),false,'closed workbench cannot be mutated by its old inspector');
});

test('canceled and replaced WITNESS inspectors cannot fit through stale callbacks',()=>{
  const f=fixture({bagTaken:true,...witnessState(['helped','drugged'])});
  f.click('van:group:faceplate');f.click('van:kit:faceplate:witness');
  const canceled=f.witnessInspections.at(-1);
  f.scene.suspend();f.scene.resume();
  assert.equal(canceled.onFit(),false,'returning without fitting retires the canceled inspection');
  f.click('van:kit:faceplate:witness');const replaced=f.witnessInspections.at(-1);
  f.click('van:kit:faceplate:witness');const current=f.witnessInspections.at(-1);
  assert.notEqual(current,replaced);assert.equal(replaced.onFit(),false,'only the current inspection may fit');
  assert.equal(f.calls.filter(call=>Array.isArray(call)&&call[0]==='kit').length,0);
  f.scene.suspend();assert.equal(current.onFit(),true,'current explicit fit works before inspector is popped');
  assert.equal(f.calls.filter(call=>Array.isArray(call)&&call[0]==='kit').length,1);
  f.scene.resume();assert.equal(current.onFit(),false);f.scene.exit();
});

test('WITNESS preview remains available through keyboard and semantic controller confirmation',()=>{
  const f=fixture({bagTaken:true,...witnessState(['helped'])});
  f.scene.key({key:'4',code:'Digit4'});
  for(let i=0;i<40&&f.scene.debugState().focusId!=='van:kit:faceplate:witness';i++)f.scene.key({key:'Tab',code:'Tab'});
  assert.equal(f.scene.debugState().focusId,'van:kit:faceplate:witness');
  f.scene.key({controller:true,controllerAction:'confirm',key:'Enter',code:'Enter'});
  assert.equal(f.witnessInspections.length,1);assert.equal(f.witnessInspections[0].owned,false);
  f.scene.resume();f.scene.key({key:'i',code:'KeyI'});assert.equal(f.witnessInspections.length,2,'inspect key follows the focused edition');
  assert.equal(f.state().fieldKit.cosmetics.faceplate,'aluminum');f.scene.exit();
});

test('four faceplate choices, lock explanation, preview, and inspection stay separated at compact sizes',()=>{
  const intersects=(a,b)=>a.x<b.x+b.w-1e-8&&a.x+a.w>b.x+1e-8&&a.y<b.y+b.h-1e-8&&a.y+a.h>b.y+1e-8;
  for(const dimensions of [{cols:150,rows:38},{cols:113,rows:30},{cols:75,rows:20},{cols:63,rows:16}]) {
    const state={bagTaken:true,...witnessState(['helped'])};
    const layout=vanWorkbenchLayout(dimensions,state,'faceplate');
    assert.equal(layout.variants.length,4);
    const inspect=layout.regions.find(region=>region.id==='van:inspect:recorder');
    const blocks=[...layout.variants,layout.preview,layout.description,inspect];
    for(let i=0;i<blocks.length;i++) {
      const rect=blocks[i];assert.ok(rect.y>=layout.fittings.y&&rect.y+rect.h<=layout.fittings.y+layout.fittings.h+1e-8);
      assert.ok(rect.x>=layout.fittings.x&&rect.x+rect.w<=layout.fittings.x+layout.fittings.w+1e-8);
      for(let j=i+1;j<blocks.length;j++)assert.equal(intersects(rect,blocks[j]),false,`${dimensions.cols}x${dimensions.rows}: ${rect.id||'content'} overlaps ${blocks[j].id||'content'}`);
    }
    if(dimensions.rows>=20)assert.ok(layout.description.h>=1.74,'locked reason retains two readable rows');
  }
});

test('physical WITNESS sleeve hit follows the actual stage target only when owned and not fitted',()=>{
  const target={x:12,y:3,w:9,h:6},state={bagTaken:true,fieldKit:freshFieldKit(),...witnessState(['helped','drugged'])};
  const layout=vanWorkbenchLayout(size,state,'faceplate',{witness:target});
  const hit=layout.regions.find(region=>region.id==='van:inspect:witness');
  assert.ok(hit);assert.equal(hit.kind,'inspect-witness');
  for(const key of ['x','y','w','h'])assert.equal(hit[key],target[key]);
  const locked=vanWorkbenchLayout(size,{...state,...witnessState(['helped'])},'faceplate',{witness:target});
  assert.ok(!locked.regions.some(region=>region.id==='van:inspect:witness'));
  state.fieldKit.cosmetics.faceplate='witness';
  assert.ok(!vanWorkbenchLayout(size,state,'faceplate',{witness:target}).regions.some(region=>region.id==='van:inspect:witness'));
});
