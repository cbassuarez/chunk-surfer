import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  SETUP_HANDOFF as F, advanceSetupHandoff, beginSetupHandoff, beginSetupSkillsHandoff,
  recoverSetupHandoff, setupCanLeave, setupHandoffGuide,
  setupHandoffObjective, setupHandoffStage, setupSkillsReady, setupHandoffBlocksMovement,
} from '../src/game/setup-handoff.js';
import { makeSetupHandoffScene, makeSetupLevelHoldScene } from '../src/game/setup-handoff-scene.js';
import { machinePanelBody } from '../src/render/presentation.js';
import { uiSize } from '../src/render/ui.js';

const calibrated = () => ({ 'setup.levels': true, 'bag.taken': true });
const trained = () => ({ ...calibrated(), 'combat.trained': true });
const stock = (pins = 0, patched = false) => ({ pinsEarned: pins, unspent: pins - (patched ? 1 : 0), techniques: patched ? ['afterimage'] : [] });
const saveRoundTrip = (value) => JSON.parse(JSON.stringify(value));
function mainFunction(name) {
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const start=source.indexOf(`function ${name}(`),end=source.indexOf('\n}',start)+2;
  assert.ok(start>=0&&end>start,`production function ${name} exists`);
  return source.slice(start,end);
}
function walkthrough() {
  let flags = beginSetupHandoff(calibrated());
  let context = { markedRoom: null, atStudio: false };
  const stages = [];
  const checkpoint = () => {
    const stage = setupHandoffStage(flags, context);
    stages.push({ stage, flags: saveRoundTrip(flags), context: saveRoundTrip(context) });
    return stage;
  };
  const advance = (event, extra = {}) => { context = { ...context, ...extra }; flags = advanceSetupHandoff(flags, event, context); return checkpoint(); };
  assert.equal(checkpoint(), 'open-bag');
  assert.equal(advance({ type: 'bag-opened' }), 'map-tab');
  assert.equal(advance({ type: 'section-selected', sectionId: 'map' }), 'mark');
  flags = { ...flags, 'setup.waypoint': true };
  context.markedRoom = 'main_b3';
  assert.equal(checkpoint(), 'close');
  assert.equal(advance({ type: 'close' }), 'follow');
  assert.equal(advance({ type: 'arrived' }, { atStudio: true }), 'done');
  return { flags, context, stages };
}

test('recording route teaches Bag, Map, a B3 mark and physical arrival without awarding combat or Skills', () => {
  const { flags, stages } = walkthrough();
  assert.deepEqual(stages.map((entry) => entry.stage), ['open-bag', 'map-tab', 'mark', 'close', 'follow', 'done']);
  assert.equal(flags[F.mode], 'recording');
  for(const key of[F.started,F.opened,F.mapOpened,F.closed,F.arrived])assert.equal(flags[key],true);
  for(const key of['combat.trained',F.skillsOpened,F.skillsDone,F.skillsCaseOpened,F.skillsClosed])assert.equal(flags[key],undefined,key);
});

test('recording route requires explicit case and Map openings even with a preexisting B3 bearing', () => {
  let flags = beginSetupHandoff(calibrated());
  const context = { workingBuild: stock(2, true), markedRoom: 'main_b3', atStudio: true };
  flags = { ...flags, 'setup.waypoint': true };
  for (const event of [{ type: 'close' }, { type: 'continue' }, { type: 'arrived' }, { type: 'section-selected', sectionId: 'skills' }]) {
    assert.equal(advanceSetupHandoff(flags, event, context), flags, 'nothing except opening Bag satisfies the opening stage');
  }
  flags = advanceSetupHandoff(flags, { type: 'bag-opened' }, context);
  for (const event of [{ type: 'continue' }, { type: 'close' }, { type: 'section-selected', sectionId: 'skills' }, { type: 'section-selected', sectionId: 'kit' }]) {
    assert.equal(advanceSetupHandoff(flags, event, context), flags, 'a remembered bearing does not replace opening Map');
  }
  assert.equal(setupHandoffGuide(flags, context).kind, 'section');
  assert.equal(setupHandoffGuide(flags, context).section, 'map');
  assert.equal(setupHandoffGuide(flags, context).mode, 'recording');
  assert.equal(setupHandoffGuide(flags, context).allowClose, false);
  flags=advanceSetupHandoff(flags,{type:'section-selected',sectionId:'map'},context);
  assert.equal(setupHandoffStage(flags,context),'close');
});

test('deferred Skills requires genuine training and never supplies combat completion or starter stock', () => {
  const {flags:route}=walkthrough();
  for(const value of[undefined,false,'true',1]){
    const flags={...route,'combat.trained':value};
    assert.equal(beginSetupSkillsHandoff(flags),flags,'a missing or invalid trained receipt cannot begin Skills');
  }
  const original={...route,'combat.trained':true},before=saveRoundTrip(original);
  const flags=beginSetupSkillsHandoff(original);
  assert.equal(flags[F.mode],'skills');
  assert.equal(setupHandoffStage(flags),'open-bag','the previous route case opening does not stand in for opening the case now');
  assert.equal(flags[F.skillsDone],undefined);
  assert.equal(flags.combatBuild,undefined);
  assert.deepEqual(original,before,'starting deferred teaching does not mutate the prior checkpoint');
  assert.equal(beginSetupSkillsHandoff(flags),flags,'reentering cannot reset a lesson in progress');
});

test('deferred Skills teaches the rack and closes without reopening Map or the completed B3 route', () => {
  const route=walkthrough().flags;
  let flags=beginSetupSkillsHandoff({...route,'combat.trained':true});
  const context={markedRoom:null,workingBuild:stock(1),atStudio:false},stages=[];
  const checkpoint=()=>{stages.push(setupHandoffStage(flags,context));};
  checkpoint();
  for(const event of[{type:'bag-opened'},{type:'section-selected',sectionId:'skills'}]){
    flags=advanceSetupHandoff(flags,event,context);checkpoint();
  }
  assert.equal(advanceSetupHandoff(flags,{type:'close'},context),flags,'the case remains open until Skills is accepted');
  context.workingBuild=stock(1,true);
  flags=advanceSetupHandoff(flags,{type:'continue'},context);checkpoint();
  const close=setupHandoffGuide(flags,context);
  assert.equal(close.kind,'close');assert.equal(close.section,'skills');assert.equal(close.allowClose,true);
  assert.equal(close.mode,'skills','the bag tour can distinguish deferred close from the recording route');
  assert.equal(setupCanLeave(flags),true,'deferred teaching never revokes the completed recording route');
  assert.equal(setupHandoffBlocksMovement(flags,context),true,'the active lesson still owns movement until its case closes');
  flags=advanceSetupHandoff(flags,{type:'close'},context);checkpoint();
  assert.deepEqual(stages,['open-bag','skills-tab','skills','close','done']);
  assert.equal(flags[F.skillsClosed],true);
  assert.equal(setupHandoffBlocksMovement(flags,context),false);
  assert.equal(setupHandoffGuide(flags,context),null);
  assert.equal(setupHandoffObjective(flags,context),null);
  for(const key of[F.opened,F.mapOpened,F.closed,F.arrived,'setup.waypoint'])assert.equal(flags[key],route[key],key);
  assert.equal(beginSetupSkillsHandoff(flags),flags,'a completed lesson is never replayed');
});

test('deferred Skills preserves zero-stock teaching and one-or-two-lead patch mechanics without imaginary stock', () => {
  assert.equal(setupSkillsReady(stock(0)), true);
  assert.equal(setupSkillsReady(stock(1)), false);
  assert.equal(setupSkillsReady(stock(2)), false);
  assert.equal(setupSkillsReady(stock(1, true)), true);
  assert.equal(setupSkillsReady(stock(2, true)), true, 'the second lead can stay spare');
  assert.equal(setupSkillsReady({}), false, 'missing build information is not a zero-stock shift');
  const flags = { ...beginSetupSkillsHandoff(trained()), [F.skillsCaseOpened]: true, [F.skillsOpened]: true };
  for (const pins of [0, 1, 2]) {
    const build = stock(pins), before = saveRoundTrip(build), context = { workingBuild: build };
    const guide = setupHandoffGuide(flags, context);
    assert.equal(guide.kind, 'skills');
    assert.equal(guide.continueLabel,'CONTINUE','Skills no longer promises an unrelated Map lesson');
    assert.equal(guide.continueEnabled, pins === 0);
    assert.equal(guide.allowClose, false);
    assert.deepEqual(build, before, 'reading the lesson does not issue or consume a cable');
    const next = advanceSetupHandoff(flags, { type: 'continue' }, context);
    assert.equal(next[F.skillsDone] === true, pins === 0);
  }
});

test('deferred Skills requires Continue after patching and ignores unrelated map events', () => {
  const flags = { ...beginSetupSkillsHandoff(trained()), [F.skillsCaseOpened]: true, [F.skillsOpened]: true };
  const context = { workingBuild: stock(1, true), markedRoom: 'main_b3' };
  assert.equal(setupHandoffStage(flags, context), 'skills');
  assert.equal(advanceSetupHandoff(flags, { type: 'patch' }, context), flags);
  assert.equal(advanceSetupHandoff(flags, { type: 'section-selected',sectionId:'map' }, context), flags);
  const afterContinue = advanceSetupHandoff(flags, { type: 'continue' }, context);
  assert.equal(setupHandoffStage(afterContinue, context), 'close');
  assert.equal(setupHandoffGuide(afterContinue, context).section, 'skills');
  assert.equal(afterContinue[F.mapOpened],undefined);
});

test('recording route only allows close with a live Studio B3 bearing, never Get In or a sticky flag', () => {
  const flags = { ...beginSetupHandoff(calibrated()), [F.opened]: true, [F.mapOpened]: true, 'setup.waypoint': true };
  for (const markedRoom of [null, '', 'get-in', 'space:get-in', 'loading_dock', 'the_tub']) {
    const context = { markedRoom };
    assert.equal(setupHandoffStage(flags, context), 'mark');
    assert.equal(advanceSetupHandoff(flags, { type: 'close' }, context), flags);
    assert.equal(setupHandoffGuide(flags, context).allowClose, false);
  }
  assert.equal(setupHandoffStage({ ...flags, 'setup.waypoint': false }, { markedRoom: 'main_b3' }), 'mark');
  assert.equal(setupHandoffStage(flags, { markedRoom: 'main_b3' }), 'close');
  assert.equal(setupHandoffGuide(flags, { markedRoom: 'main_b3' }).allowClose, true);
  const closed = advanceSetupHandoff(flags, { type: 'close' }, { markedRoom: 'main_b3' });
  assert.equal(closed[F.closed], true);
  assert.equal(setupHandoffStage(closed, { markedRoom: null }), 'mark', 'clearing the bearing reopens the mark obligation');
  assert.equal(setupHandoffStage(closed, { markedRoom: 'the_tub' }), 'mark', 'replacing the bearing cannot bypass the lesson');
});

test('recording route requires physical Studio B3 arrival, not acoustic main_b3 or leaving the dock', () => {
  const { stages } = walkthrough();
  const { flags } = stages.find((entry) => entry.stage === 'follow');
  for (const context of [
    { markedRoom: 'main_b3', leftDock: true },
    { markedRoom: 'main_b3', currentWorld: 'main_b3', zone: 'get-in', atStudio: false },
    { markedRoom: 'main_b3', currentWorld: 'main_b3', zone: 'stair', atStudio: false },
    { markedRoom: 'main_b3', atStudio: 'true' },
  ]) {
    assert.equal(advanceSetupHandoff(flags, { type: 'arrived' }, context), flags);
    assert.equal(setupHandoffStage(flags, context), 'follow');
    assert.equal(setupHandoffObjective(flags, context), 'FOLLOW THE BEARING TO STUDIO B3');
  }
  const arrived = advanceSetupHandoff(flags, { type: 'arrived' }, { markedRoom: 'main_b3', atStudio: true });
  assert.equal(setupHandoffStage(arrived, { markedRoom: null }), 'done', 'arrival remains completed after later waypoint changes');
  assert.equal(setupHandoffObjective(arrived), null);
  assert.equal(setupHandoffGuide(arrived), null);
});

test('recording route checkpoints survive serialization and recovery never restarts an existing handoff', () => {
  for (const { stage, flags, context } of walkthrough().stages) {
    const loaded = saveRoundTrip(flags), loadedContext = saveRoundTrip(context);
    assert.equal(setupHandoffStage(loaded, loadedContext), stage);
    assert.equal(recoverSetupHandoff(loaded, { atGetIn: true, hasRealTake: false }), loaded);
    assert.equal(beginSetupHandoff(loaded), loaded);
    assert.deepEqual(setupHandoffGuide(loaded, loadedContext), setupHandoffGuide(flags, context));
  }
});

test('recording route recovery needs only calibration and the case in Get In, with no real takes', () => {
  const flags = calibrated();
  assert.equal(recoverSetupHandoff(flags), flags);
  assert.equal(recoverSetupHandoff(flags, { atGetIn: false, hasRealTake: false }), flags);
  assert.equal(recoverSetupHandoff(flags, { atGetIn: true, hasRealTake: true }), flags);
  for (const missing of ['setup.levels', 'bag.taken']) {
    const incomplete = { ...flags, [missing]: false };
    assert.equal(recoverSetupHandoff(incomplete, { atGetIn: true }), incomplete);
  }
  const recovered = recoverSetupHandoff(flags, { atGetIn: true, hasRealTake: false });
  assert.equal(setupHandoffStage(recovered), 'open-bag');
  assert.equal(recovered['combat.trained'],undefined);
  assert.equal(flags[F.started], undefined, 'migration does not mutate its input');
});

test('recording route exit readiness requires calibration, B3 mark and case close without combat completion', () => {
  assert.equal(setupCanLeave(calibrated()), false);
  assert.equal(setupCanLeave({ 'combat.trained': true }), false);
  assert.equal(setupCanLeave({ ...calibrated(), 'setup.waypoint': true }), true, 'legacy setup without a new handoff remains compatible');
  const { stages } = walkthrough();
  for (const { stage, flags,context } of stages){
    assert.equal(setupCanLeave(flags), ['follow', 'done'].includes(stage), stage);
    assert.equal(setupHandoffBlocksMovement(flags,context),!['follow','done'].includes(stage),stage);
  }
  assert.equal(setupHandoffBlocksMovement({}),false);
  assert.equal(setupCanLeave({}, { hasRealTake: true }), true, 'a progressed legacy run is never sent back through opening gates');
});

test('legacy handoff receipts remain compatible without manufacturing skipped Skills completion', () => {
  const legacy={...trained(),[F.started]:true,[F.opened]:true,[F.skillsOpened]:true};
  const before=saveRoundTrip(legacy);
  assert.equal(setupHandoffStage(legacy),'map-tab','a pending legacy route now reaches the recording job first');
  assert.equal(setupHandoffGuide(legacy).mode,'recording','legacy absent-mode guides keep recording-route presentation');
  assert.equal(legacy[F.skillsDone],undefined);
  assert.deepEqual(legacy,before);
  const completed={...legacy,[F.skillsDone]:true,[F.mapOpened]:true,[F.closed]:true,[F.arrived]:true,'setup.waypoint':true};
  assert.equal(setupHandoffStage(completed),'done');
  assert.equal(beginSetupSkillsHandoff(completed),completed,'the old genuine Skills acceptance and case close remain authoritative');
  const partial={...legacy,[F.mapOpened]:true,[F.closed]:true,[F.arrived]:true,'setup.waypoint':true};
  let skills=beginSetupSkillsHandoff(partial);
  skills=advanceSetupHandoff(skills,{type:'bag-opened'});
  assert.equal(setupHandoffStage(skills),'skills','an actual earlier Skills-tab visit is retained');
  assert.equal(skills[F.skillsDone],undefined,'a visit is not acceptance');
});

test('deferred Skills checkpoints survive reload without reopening the recording route', () => {
  let flags=beginSetupSkillsHandoff({...walkthrough().flags,'combat.trained':true});
  const context={workingBuild:stock(2,true),markedRoom:null};
  for(const event of[null,{type:'bag-opened'},{type:'section-selected',sectionId:'skills'},{type:'continue'},{type:'close'}]){
    if(event)flags=advanceSetupHandoff(flags,event,context);
    const loaded=saveRoundTrip(flags);
    assert.equal(setupHandoffStage(loaded,context),setupHandoffStage(flags,context));
    for(const hasRealTake of[false,true])assert.equal(recoverSetupHandoff(loaded,{atGetIn:false,hasRealTake}),loaded);
    assert.equal(beginSetupSkillsHandoff(loaded),loaded);
    assert.equal(loaded[F.arrived],true);
  }
});

test('deferred Skills recovery closes the training-to-case save gap even after a real take', () => {
  const route=walkthrough().flags;
  for(const original of[
    {...route,'combat.trained':true},
    {'bag.taken':true,'setup.levels':true,'combat.trained':true},
  ]){
    const before=saveRoundTrip(original),recovered=recoverSetupHandoff(original,{atGetIn:false,hasRealTake:true});
    assert.equal(recovered[F.mode],'skills');
    assert.equal(setupHandoffStage(recovered),'open-bag');
    assert.equal(recovered[F.skillsDone],undefined,'recovery restores the lesson, never its acceptance');
    assert.equal(recovered[F.skillsClosed],undefined);
    assert.deepEqual(original,before);
    assert.equal(recoverSetupHandoff(recovered,{hasRealTake:true}),recovered,'recovery cannot reset active Skills');
  }
  const untrained={...route};
  assert.equal(recoverSetupHandoff(untrained,{hasRealTake:true}),untrained,'a real take is not combat training');
  const legacyComplete={...route,'combat.trained':true,[F.skillsDone]:true};
  delete legacyComplete[F.mode];
  assert.equal(recoverSetupHandoff(legacyComplete,{hasRealTake:true}),legacyComplete,'earned legacy completion still skips replay');
});

test('a Skills detour cannot consume the independent physical Studio B3 arrival receipt', () => {
  const {flags:route}=walkthrough().stages.find(entry=>entry.stage==='follow');
  assert.equal(route[F.arrived],undefined);
  let flags=beginSetupSkillsHandoff({...route,'combat.trained':true});
  const context={workingBuild:stock(1,true),markedRoom:null,atStudio:false};
  for(const event of[{type:'bag-opened'},{type:'section-selected',sectionId:'skills'},{type:'continue'},{type:'close'}]){
    flags=advanceSetupHandoff(flags,event,context);
  }
  assert.equal(setupHandoffStage(flags,context),'done');
  assert.equal(flags[F.arrived],undefined,'finishing Skills did not pretend to reach Studio B3');
  assert.equal(advanceSetupHandoff(flags,{type:'arrived'},context),flags,'being elsewhere cannot complete the route');
  const arrived=advanceSetupHandoff(flags,{type:'arrived'},{...context,atStudio:true});
  assert.equal(arrived[F.arrived],true);
  assert.equal(arrived[F.skillsClosed],true);
  assert.equal(setupHandoffStage(arrived,context),'done','real arrival does not reopen Map or Skills');
  assert.equal(advanceSetupHandoff(arrived,{type:'arrived'},{atStudio:true}),arrived,'the physical receipt is one-shot');

  const active=beginSetupSkillsHandoff({...route,'combat.trained':true});
  const arrivedWhileActive=advanceSetupHandoff(active,{type:'arrived'},{atStudio:true});
  assert.equal(arrivedWhileActive[F.arrived],true);
  assert.equal(setupHandoffStage(arrivedWhileActive),'open-bag','arrival cannot accept the pending Skills lesson');
  const preClose={...active,[F.closed]:false};
  assert.equal(advanceSetupHandoff(preClose,{type:'arrived'},{atStudio:true}),preClose,'physical arrival before route case-close cannot bypass the lesson');
});

test('the opening hold blocks movement/look/world, leaves Pause available and opens only once', () => {
  let calls = 0;
  const scene = makeSetupHandoffScene({ onOpen: () => { calls++; }, cables: 2 });
  assert.equal(scene.id, 'setup-field-case');
  assert.equal(scene.blocksInput, true);
  assert.equal(scene.blocksWorld, true);
  assert.equal(scene.allowsLook, false);
  assert.equal(calls, 0, 'constructing the hold never auto-opens Bag');
  for (const event of [{ key: 'w', code: 'KeyW' }, { key: 'ArrowUp' }, { key: 'e', code: 'KeyE' }, { controllerAction: 'move_up' }, { key: 'b', repeat: true }]) {
    assert.equal(scene.key(event), true);
    assert.equal(calls, 0);
  }
  assert.equal(scene.key({ key: 'Escape', code: 'Escape' }), false, 'Escape passes to the run-level Pause handler rather than dismissing the lesson');
  assert.equal(calls, 0);
  scene.key({ key: 'b', code: 'KeyB' });
  assert.equal(calls, 1);
  scene.key({ key: 'Enter' });
  scene.key({ controllerAction: 'confirm' });
  assert.equal(calls, 1, 'one handoff cannot open duplicate cases');
  for (const event of [{ key: 'Enter' }, { controllerAction: 'confirm' }, { controllerAction: 'bag' }]) {
    let opened = 0;
    makeSetupHandoffScene({ onOpen: () => { opened++; } }).key(event);
    assert.equal(opened, 1);
  }
});

test('the rendered hold button accepts a left press but not pointer movement or an outside/right click', () => {
  let calls = 0;
  const scene = makeSetupHandoffScene({ onOpen: () => { calls++; } });
  // uiDraw is inert without a canvas in Node; geometry still uses the exact
  // production uiSize + machine-body calculation rather than a guessed target.
  scene.render();
  const { cols, rows } = uiSize(), w = Math.min(80, cols - 4), h = Math.min(13, rows - 2);
  const body = machinePanelBody((cols - w) / 2, Math.max(1, rows - h - 2), w, h);
  const point = { cellX: body.x + Math.min(30, body.w) / 2, cellY: body.y + 4.5 + 1.25 };
  scene.pointer({ type: 'pointermove', ...point });
  scene.pointer({ type: 'pointerdown', button: 2, ...point });
  scene.pointer({ type: 'pointerdown', button: 0, cellX: -100, cellY: -100 });
  assert.equal(calls, 0);
  scene.pointer({ type: 'pointerdown', button: 0, ...point });
  assert.equal(calls, 1);
});

test('a hurried level-check conversation waits for six actual clean recorder seconds, not UI time or Continue', () => {
  let state={recording:true,takeElapsed:4.5,spoiled:false,stalled:false},ready=0,interrupted=0;
  const scene=makeSetupLevelHoldScene({getReading:()=>state,onReady:()=>ready++,onInterrupted:()=>interrupted++});
  assert.equal(scene.id,'setup-level-hold');
  assert.equal(scene.blocksInput,true);
  assert.equal(scene.blocksWorld,false,'the real recording must keep ticking beneath the hold');
  assert.equal(scene.allowsLook,false);
  for(const event of [{key:'Enter'},{key:'Enter',repeat:true},{controllerAction:'confirm'},{key:'b',code:'KeyB'},{key:'r',code:'KeyR'},{key:'w',code:'KeyW'}]){
    assert.equal(scene.key(event),true);
  }
  assert.equal(scene.key({key:'Escape',code:'Escape'}),false,'Pause is a run-level command, not a skip');
  assert.equal(scene.pointer({type:'pointerdown',cellX:10,cellY:10}),true);
  assert.equal(scene.pointer({type:'pointerup',cellX:10,cellY:10}),true);
  scene.update(3600);
  assert.deepEqual([ready,interrupted],[0,0],'even a large scene dt cannot manufacture recorded time');
  state={...state,takeElapsed:5.999};scene.update(1);
  assert.deepEqual([ready,interrupted],[0,0]);
  state={...state,takeElapsed:6};scene.update(0);
  assert.deepEqual([ready,interrupted],[1,0]);
  state={recording:false,takeElapsed:0};scene.update(1);scene.update(1);
  assert.deepEqual([ready,interrupted],[1,0],'stopping the transport in onReady cannot subsequently interrupt the same hold');
});

test('level-check hold honors a saved measurement and rejects interrupted or invalid tape readings exactly once', () => {
  let ready=0;
  const saved=makeSetupLevelHoldScene({getReading:()=>({levelChecked:true,recording:false,takeElapsed:0}),onReady:()=>ready++});
  saved.update(0);saved.update(1);assert.equal(ready,1);
  for(const state of [
    {recording:false,takeElapsed:6},
    {recording:true,spoiled:true,takeElapsed:6},
    {recording:true,stalled:true,takeElapsed:6},
    {levelChecked:'true',recording:false,takeElapsed:0},
  ]){
    let pass=0,fail=0;
    const scene=makeSetupLevelHoldScene({getReading:()=>state,onReady:()=>pass++,onInterrupted:()=>fail++});
    scene.update(0);scene.update(100);
    assert.deepEqual([pass,fail],[0,1],JSON.stringify(state));
  }
  for(const takeElapsed of [undefined,NaN,Infinity,-6]){
    let pass=0,fail=0;
    const scene=makeSetupLevelHoldScene({getReading:()=>({recording:true,takeElapsed}),onReady:()=>pass++,onInterrupted:()=>fail++});
    scene.update(100);
    assert.deepEqual([pass,fail],[0,0],'invalid elapsed values cannot satisfy a clean measurement');
  }
});

test('exiting a level-check hold cancels its callbacks and its rendered progress stays factual', () => {
  let ready=0,interrupted=0;
  const scene=makeSetupLevelHoldScene({getReading:()=>({recording:true,takeElapsed:6}),onReady:()=>ready++,onInterrupted:()=>interrupted++});
  scene.exit();scene.update(0);
  assert.deepEqual([ready,interrupted],[0,0],'scene exit cannot leak a delayed tutorial transition');

  const source=readFileSync(new URL('../src/game/setup-handoff-scene.js',import.meta.url),'utf8');
  const factory=source.slice(source.indexOf('export function makeSetupLevelHoldScene')).replace(/^export /,'');
  const labels=[];
  const make=runInNewContext(`(${factory})`,{
    uiSize:()=>({cols:100,rows:40}),
    drawMachinePanel(x,y,w,h,options){labels.push(options.label);return{x:x+3,y:y+4,w:w-6,h:h-5};},
    // The scene draws through the scoped form now — see presentation.js: the
    // faceplate's theme must not outlive the faceplate.
    withMachinePanel(x,y,w,h,options,body){
      labels.push(options.label);
      const rect={x:x+3,y:y+4,w:w-6,h:h-5};
      return body?body(rect):rect;
    },
    uiText(x,y,text){labels.push(text);},
  });
  make({getReading:()=>({recording:true,takeElapsed:4.5})}).render();
  assert.deepEqual(labels,['HOLD STILL','LEVEL CHECK  4.5 / 6.0 s']);
});

test('the imagined ripple preserves a running job take and hands off once to its figure or training fallback', () => {
  const holdSource=readFileSync(new URL('../src/game/coldopen.js',import.meta.url),'utf8');
  const start=holdSource.indexOf('export function makeBoothDownbeatHoldScene'),end=holdSource.indexOf('\n}',start)+2;
  assert.ok(start>=0&&end>start,'the actual timed ripple hold is available');
  for(const figureAvailable of[true,false]){
    const stack=[],flags={},state={recording:true,takeElapsed:18.25,takeTapeElapsed:22.5,completed:false,spoiled:false,takes:['main_b3']};
    const before=saveRoundTrip(state),effects=[];
    let figures=0,training=0;
    const forbidden=()=>assert.fail('imagined rehearsal cannot change, stop, seal or complete the actual recorder');
    const scenes={has:(id)=>stack.some(scene=>scene.id===id),push:(scene)=>stack.push(scene),pop:()=>stack.pop()};
    const context={
      storyMode:true,flagTest:(id)=>!!flags[id],scenes,
      REC:{recState:()=>state,isRecording:()=>state.recording,stopRecording:forbidden,startRecording:forbidden,addTake:forbidden},
      stopTake:forbidden,onLevelsSet:forbidden,saveCommit:forbidden,makeSetupLevelHoldScene:forbidden,
      PB:{finishTapeTake:forbidden,abortTake:forbidden},emitProgress:forbidden,
      applyLensPreset:(name)=>effects.push(['lens',name]),
      CR:{fx:{glitch:()=>effects.push(['glitch']),flash:()=>effects.push(['flash'])}},
      CUES:{CUE:{recorder:'recorder'},playCue:()=>effects.push(['cue'])},
      openTrainingBattle:()=>training++,beginDreamFigure:()=>{figures++;return figureAvailable;},
    };
    context.makeBoothDownbeatHoldScene=runInNewContext(`(${holdSource.slice(start,end).replace(/^export /,'')})`,{scenes});
    const enter=runInNewContext(`(${mainFunction('dreamRippleIntoDrill')})`,context);
    enter();enter();
    assert.equal(stack.length,1,'repeated entry cannot duplicate the ripple');
    assert.equal(stack[0].id,'booth-downbeat-hold');
    assert.deepEqual(effects,[['lens','rupture'],['glitch'],['flash'],['cue']]);
    const hold=stack[0];
    hold.key({key:'Enter',repeat:true});hold.update(.5);
    assert.deepEqual([figures,training],[0,0],'the authored ripple retains its actual duration');
    hold.update(.6);hold.update(20);
    assert.equal(stack.length,0);
    assert.deepEqual([figures,training],[1,figureAvailable?0:1],'the timed hold hands off only once');
    assert.deepEqual(state,before,'the real take is still running at its original elapsed time and remains uncompleted');
    assert.deepEqual(flags,{},'the imagined scene cannot manufacture calibration or trained receipts');
    flags['combat.trained']=true;
    enter();
    assert.equal(stack.length,0,'genuinely completed training suppresses later ripple entry');
    assert.equal(effects.length,4);
  }
});

test('stopping a completed Get In calibration cannot seal or count a job take', () => {
  const calls=[],pressureEvents=[],recordingPressureVoices=new Set([
    {stop:()=>pressureEvents.push('voice-1-stop')},{stop:()=>pressureEvents.push('voice-2-stop')},
  ]);
  let recording=true;
  const context={
    finishRecordingSlate(){},takeRoom:'loading_dock',LEVEL_CHECK_ROOM:'loading_dock',activeTakeContamination:null,activeTakeWitnessed:false,
    activeSourceReplayTake:{id:'must-be-discarded'},
    REC:{isRecording:()=>recording,stopRecording:()=>{pressureEvents.push('transport-stop');recording=false;return{completed:true,elapsed:45,spoiled:false};},saveRecState:()=>({tapes:[]})},
    recordingPressureVoices,recordingPressurePerformance:{reset:()=>pressureEvents.push('pressure-reset')},
    cancelControlScope(){},liveRecordingPointerControls:{clear(){}},recordingHallucinations:{clear(){}},clearInstrument(){},
    CUES:{CUE:{recorder:'recorder'},playCue(){}},emitRecorderTransport(){},STORY:{stopTapeHiss(){}},updateAudio(){},
    PB:{abortTake:(room)=>calls.push(['abort',room]),sealTake:()=>assert.fail('calibration cannot be sealed')},
    emitProgress:()=>assert.fail('calibration cannot publish job progression'),
    saveCommit:(save)=>calls.push(['save',save.rec]),
  };
  const stop=runInNewContext(`${mainFunction('cancelRecordingPressureAudio')}\n(${mainFunction('stopTake')})`,context);
  stop();
  assert.deepEqual(pressureEvents,['voice-1-stop','voice-2-stop','pressure-reset','transport-stop'],
    'calibration releases every owned pressure voice and resets its scheduler before stopping the transport');
  assert.equal(recordingPressureVoices.size,0);
  stop();
  assert.equal(pressureEvents.length,4,'an already stopped recorder cannot repeat cancellation or scheduler reset');
  assert.deepEqual(calls,[['abort','loading_dock'],['save',{tapes:[]}]]);
  assert.equal(context.activeSourceReplayTake,null);
  assert.equal(context.takeRoom,null);
  const tick=mainFunction('tickRecorder');
  const guard=tick.indexOf('if(room===LEVEL_CHECK_ROOM)'),add=tick.indexOf('stopTake();',guard+tick.slice(guard).indexOf('return;')+7);
  assert.ok(guard>=0&&guard<add,'calibration exits the completion branch before counting a room');
  assert.match(tick.slice(guard,add),/onLevelsSet\(\);.*stopTake\(\);return;/s);
});

test('rolling a calibration never starts a dream, summons Presence or publishes a room start', () => {
  let dreams=0;
  const context={
    cancelApparitionApplause(){},rollMetronomeRestart(){},ensureTapeAudio(){},PB:{isPlaying:()=>false,cueTapeEnd:()=>false},PLANT:{plantRecordingBlocked:()=>false},REC:{isSlating:()=>false,recState:()=>({takes:[]}),startRecording:()=>true},
    takeRoom:'loading_dock',LEVEL_CHECK_ROOM:'loading_dock',armedTakeContamination:null,px:0,py:0,
    PROPS:{savePropState:()=>({})},saveCommit(){},ensureCtx(){},params:()=>new URLSearchParams('nomic=1'),
    MIC:{micIgnoreSpoilFor(){}},CUES:{CUE:{recorder:'recorder'},playCue(){}},emitRecorderTransport(){},updateAudio(){},
    STORY:{startTapeHiss(){}},TAKE_HISS:{min:0},SPEECH:{say(){}},framedLine:(_,line)=>line,LINES:{recStart:'Rolling.'},
    TUT:{tutorialActive:()=>false},flagTest:()=>false,beginDaydream:()=>dreams++,
    beginSourceReplayTake:()=>assert.fail('calibration cannot seed a Source reprise'),
    emitProgress:()=>assert.fail('calibration cannot publish TAKE_STARTED'),
    summonPresence:()=>assert.fail('a setup measurement cannot summon Presence'),
  };
  runInNewContext(`(${mainFunction('roll')})`,context)();
  assert.equal(dreams,0,'a real calibration hands to the recording route without compulsory dream combat');
  assert.equal(context.activeSourceReplayTake,null);
});

test('the real calibration callback stops its measurement and opens only the recording-route case', () => {
  let flags={'bag.taken':true},recording=true,stops=0,holds=0,skips=0;
  const context={
    flagTest:(id)=>!!flags[id],flagApply:(ids)=>ids.forEach(id=>{flags[id]=true;}),flagSet:(id)=>{flags[id]=true;},
    OBJ:{targetRoom:()=>null},REC:{isRecording:()=>recording},
    stopTake(){recording=false;stops++;},getSave:()=>({flags}),saveCommit:(patch)=>{flags=patch.flags;},
    beginSetupHandoff,fireCue(){},TUT:{skipTutorial:()=>skips++},performance:{now:()=>1000},
    holdForSetupBag:()=>holds++,beginDaydream:()=>assert.fail('calibration must not open the dream'),
  };
  runInNewContext(`${mainFunction('onLevelsSet')}\n${mainFunction('finishSetupCalibration')}\nonLevelsSet();onLevelsSet();`,context);
  assert.deepEqual([stops,holds,skips],[1,1,1],'one clean measurement produces one case handoff');
  assert.equal(flags['setup.levels'],true);
  assert.equal(flags[F.mode],'recording');
  assert.equal(setupHandoffStage(flags),'open-bag');
  for(const key of['combat.trained',F.skillsOpened,F.skillsDone,F.skillsClosed])assert.equal(flags[key],undefined,key);
  assert.equal(context.waypointBriefShownAt,1000);
});

test('main wires independent calibration and rehearsal handoffs and physically identifies Studio B3', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const fn = (name) => {
    const start = main.indexOf(`function ${name}(`);
    assert.ok(start >= 0, name);
    const end = main.indexOf('\nfunction ', start + 1);
    return main.slice(start, end < 0 ? undefined : end);
  };
  const calibration = fn('finishSetupCalibration'),rehearsal=fn('finishSetupRehearsal');
  assert.match(calibration, /saveCommit\(\{flags:beginSetupHandoff/);
  assert.match(rehearsal, /saveCommit\(\{flags:beginSetupSkillsHandoff/);
  for(const handoff of[calibration,rehearsal]){
    assert.match(handoff, /holdForSetupBag\(\)/);
    assert.doesNotMatch(handoff, /converse\(/, 'the case surface owns its own lesson');
  }
  assert.match(fn('setupHandoffContext'), /FP\.zoneAt\(px,py\)===ZONE\.studio/);
  assert.match(fn('setupHandoffContext'), /!usingSpecialSpace\(\)/);
  assert.doesNotMatch(fn('setupHandoffContext'), /currentWorld\(\)/);
  assert.match(fn('setupComplete'), /setupCanLeave/);
  assert.match(fn('setupHandoffBlocksMovement'), /setupCaseBlocksMovement/,'the separate movement hold delegates to the mode-aware reducer');
  assert.match(fn('step'), /setupHandoffBlocksMovement\(\)/);
  assert.match(fn('tickHeldMovement'), /setupHandoffBlocksMovement\(\)/);
  assert.match(fn('openBag'), /onGuideEvent:handleSetupGuideEvent/);
  assert.match(main, /id === 'setup-field-case' \|\| id === 'bag'\) return \['bag'\]/,
    'the advertised controller Bag binding passes through both modal scenes');
  const training = fn('openTrainingBattle');
  assert.match(training, /onWin:done, onLose:done/);
  assert.doesNotMatch(training, /onAbort:done/, 'an aborted rehearsal cannot award trained status or starter leads');
  const aborted = training.slice(training.indexOf('onAbort:'));
  assert.doesNotMatch(aborted, /flagSet\(|finishSetupRehearsal\(/);
  assert.match(main, /TUT\.tickTutorial\(dt, tutorialCtx\(\)\);\s*tickSetupHandoff\(\);/,
    'the persisted handoff shares the tutorial clock which runs while Bag blocksWorld');
  assert.match(fn('tutorialCtx'), /levelChecked:.*flagTest\('setup\.levels'\)/,
    'the old process-only measurement gets its persisted level fact');
});

test('Skills Continue atomically checkpoints the accepted build with its completed lesson', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = main.indexOf('function handleSetupGuideEvent(');
  const body = main.slice(start, main.indexOf('\nfunction ', start + 1));
  const writes = [], normalized = [];
  let flags = { ...beginSetupSkillsHandoff(trained()), [F.skillsCaseOpened]: true, [F.skillsOpened]: true };
  const handle = runInNewContext(`(${body}\n)`, {
    setupHandoffContext: (event) => ({ workingBuild: event.workingBuild, markedRoom: null }),
    getSave: () => ({ flags, encounters: { cleared: [] } }),
    advanceSetupHandoff, setupHandoffStage, SETUP_HANDOFF: F,
    normalizeCombatBuild(build) { normalized.push(build); return saveRoundTrip(build); },
    saveCommit(patch) { writes.push(patch); flags = patch.flags; },
    resetMotionInput() {}, SPEECH: { say() {} },
  });
  handle({ type: 'continue', workingBuild: stock(1) });
  assert.equal(writes.length, 0, 'an unpatched stocked shift cannot checkpoint completion');
  const accepted = stock(2, true);
  handle({ type: 'continue', workingBuild: accepted });
  assert.equal(writes.length, 1, 'build and completed stage share one persistence operation');
  assert.equal(writes[0].flags[F.skillsDone], true);
  assert.deepEqual(writes[0].combatBuild, accepted, 'reloading before case-close retains the cable which satisfied Skills');
  assert.equal(normalized[0], accepted);
  handle({ type: 'continue', workingBuild: accepted });
  assert.equal(writes.length, 1, 'duplicate Continue cannot rewrite the accepted rig');
});
