import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  SETUP_HANDOFF as F, advanceSetupHandoff, beginSetupHandoff,
  recoverSetupHandoff, setupCanLeave, setupHandoffGuide,
  setupHandoffObjective, setupHandoffStage, setupSkillsReady,
} from '../src/game/setup-handoff.js';
import { makeSetupHandoffScene, makeSetupLevelHoldScene } from '../src/game/setup-handoff-scene.js';
import { machinePanelBody } from '../src/render/presentation.js';
import { uiSize } from '../src/render/ui.js';

const trained = () => ({ 'setup.levels': true, 'combat.trained': true, 'bag.taken': true });
const stock = (pins = 0, patched = false) => ({ pinsEarned: pins, unspent: pins - (patched ? 1 : 0), techniques: patched ? ['afterimage'] : [] });
const saveRoundTrip = (value) => JSON.parse(JSON.stringify(value));
function mainFunction(name) {
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const start=source.indexOf(`function ${name}(`),end=source.indexOf('\n}',start)+2;
  assert.ok(start>=0&&end>start,`production function ${name} exists`);
  return source.slice(start,end);
}
function walkthrough(pins = 0) {
  let flags = beginSetupHandoff(trained());
  let context = { markedRoom: null, workingBuild: stock(pins), atStudio: false };
  const stages = [];
  const checkpoint = () => {
    const stage = setupHandoffStage(flags, context);
    stages.push({ stage, flags: saveRoundTrip(flags), context: saveRoundTrip(context) });
    return stage;
  };
  const advance = (event, extra = {}) => { context = { ...context, ...extra }; flags = advanceSetupHandoff(flags, event, context); return checkpoint(); };
  assert.equal(checkpoint(), 'open-bag');
  assert.equal(advance({ type: 'bag-opened' }), 'skills-tab');
  assert.equal(advance({ type: 'section-selected', sectionId: 'skills' }), 'skills');
  if (pins) context.workingBuild = stock(pins, true);
  assert.equal(advance({ type: 'continue' }), 'map-tab');
  assert.equal(advance({ type: 'section-selected', sectionId: 'map' }), 'mark');
  flags = { ...flags, 'setup.waypoint': true };
  context.markedRoom = 'main_b3';
  assert.equal(checkpoint(), 'close');
  assert.equal(advance({ type: 'close' }), 'follow');
  assert.equal(advance({ type: 'arrived' }, { atStudio: true }), 'done');
  return { flags, context, stages };
}

test('training requires an explicit Bag opening, Skills visit, continue, mark and physical arrival', () => {
  for (const pins of [0, 1, 2]) {
    const { flags, stages } = walkthrough(pins);
    assert.deepEqual(stages.map((entry) => entry.stage), ['open-bag', 'skills-tab', 'skills', 'map-tab', 'mark', 'close', 'follow', 'done']);
    assert.equal(flags[F.arrived], true);
    assert.ok(Object.values(F).every((key) => flags[key] === true));
  }
});

test('every required stage ignores unrelated actions and cannot skip the Skills visit', () => {
  let flags = beginSetupHandoff(trained());
  const context = { workingBuild: stock(2, true), markedRoom: 'main_b3', atStudio: true };
  flags = { ...flags, 'setup.waypoint': true };
  for (const event of [{ type: 'close' }, { type: 'continue' }, { type: 'arrived' }, { type: 'section-selected', sectionId: 'skills' }]) {
    assert.equal(advanceSetupHandoff(flags, event, context), flags, 'nothing except opening Bag satisfies the opening stage');
  }
  flags = advanceSetupHandoff(flags, { type: 'bag-opened' }, context);
  for (const event of [{ type: 'continue' }, { type: 'close' }, { type: 'section-selected', sectionId: 'map' }, { type: 'section-selected', sectionId: 'kit' }]) {
    assert.equal(advanceSetupHandoff(flags, event, context), flags, 'preexisting build/waypoint does not replace the Skills visit');
  }
  assert.equal(setupHandoffGuide(flags, context).kind, 'section');
  assert.equal(setupHandoffGuide(flags, context).section, 'skills');
  assert.equal(setupHandoffGuide(flags, context).allowClose, false);
});

test('zero leads teach the rack without imaginary stock; one or two require a patch but not spending every lead', () => {
  assert.equal(setupSkillsReady(stock(0)), true);
  assert.equal(setupSkillsReady(stock(1)), false);
  assert.equal(setupSkillsReady(stock(2)), false);
  assert.equal(setupSkillsReady(stock(1, true)), true);
  assert.equal(setupSkillsReady(stock(2, true)), true, 'the second lead can stay spare');
  assert.equal(setupSkillsReady({}), false, 'missing build information is not a zero-stock shift');
  const flags = { ...beginSetupHandoff(trained()), [F.opened]: true, [F.skillsOpened]: true };
  for (const pins of [0, 1, 2]) {
    const build = stock(pins), before = saveRoundTrip(build), context = { workingBuild: build };
    const guide = setupHandoffGuide(flags, context);
    assert.equal(guide.kind, 'skills');
    assert.equal(guide.continueEnabled, pins === 0);
    assert.equal(guide.allowClose, false);
    assert.deepEqual(build, before, 'reading the lesson does not issue or consume a cable');
    const next = advanceSetupHandoff(flags, { type: 'continue' }, context);
    assert.equal(next[F.skillsDone] === true, pins === 0);
  }
});

test('a patch alone is not Continue and a remembered map selection is not opening Map', () => {
  const flags = { ...beginSetupHandoff(trained()), [F.opened]: true, [F.skillsOpened]: true };
  const context = { workingBuild: stock(1, true), markedRoom: 'main_b3' };
  assert.equal(setupHandoffStage(flags, context), 'skills');
  assert.equal(advanceSetupHandoff(flags, { type: 'patch' }, context), flags);
  const afterContinue = advanceSetupHandoff(flags, { type: 'continue' }, context);
  assert.equal(setupHandoffStage(afterContinue, context), 'map-tab');
  assert.equal(advanceSetupHandoff(afterContinue, { type: 'close' }, context), afterContinue);
  assert.equal(setupHandoffGuide(afterContinue, context).section, 'map');
});

test('only a live Studio B3 bearing allows close; Get In and a sticky saved flag do not', () => {
  const flags = { ...beginSetupHandoff(trained()), [F.opened]: true, [F.skillsOpened]: true, [F.skillsDone]: true, [F.mapOpened]: true, 'setup.waypoint': true };
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

test('leaving the dock, acoustic main_b3 and false arrival do not complete the physical walk', () => {
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

test('each stage survives serialization and recovery never restarts an existing handoff', () => {
  for (const pins of [0, 1, 2]) {
    for (const { stage, flags, context } of walkthrough(pins).stages) {
      const loaded = saveRoundTrip(flags), loadedContext = saveRoundTrip(context);
      assert.equal(setupHandoffStage(loaded, loadedContext), stage);
      assert.equal(recoverSetupHandoff(loaded, { atGetIn: true, hasRealTake: false }), loaded);
      assert.equal(beginSetupHandoff(loaded), loaded);
      assert.deepEqual(setupHandoffGuide(loaded, loadedContext), setupHandoffGuide(flags, context));
    }
  }
});

test('legacy recovery is limited to completed training in Get In with no real takes', () => {
  const flags = trained();
  assert.equal(recoverSetupHandoff(flags), flags);
  assert.equal(recoverSetupHandoff(flags, { atGetIn: false, hasRealTake: false }), flags);
  assert.equal(recoverSetupHandoff(flags, { atGetIn: true, hasRealTake: true }), flags);
  for (const missing of ['setup.levels', 'combat.trained', 'bag.taken']) {
    const incomplete = { ...flags, [missing]: false };
    assert.equal(recoverSetupHandoff(incomplete, { atGetIn: true }), incomplete);
  }
  const recovered = recoverSetupHandoff(flags, { atGetIn: true, hasRealTake: false });
  assert.equal(setupHandoffStage(recovered), 'open-bag');
  assert.equal(flags[F.started], undefined, 'migration does not mutate its input');
});

test('exit readiness has no trained-only bypass and does not require impossible pre-exit arrival', () => {
  assert.equal(setupCanLeave(trained()), false);
  assert.equal(setupCanLeave({ 'combat.trained': true }), false);
  assert.equal(setupCanLeave({ ...trained(), 'setup.waypoint': true }), true, 'legacy setup without a new handoff remains compatible');
  const { stages } = walkthrough();
  for (const { stage, flags } of stages) assert.equal(setupCanLeave(flags), ['follow', 'done'].includes(stage), stage);
  assert.equal(setupCanLeave({}, { hasRealTake: true }), true, 'a progressed legacy run is never sent back through opening gates');
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

test('the real dream-ripple entry waits for clean tape before exactly one training handoff', () => {
  const stack=[],flags={},state={recording:true,takeElapsed:4.5,spoiled:false,stalled:false};
  let levels=0,stops=0,training=0,interruptions=0;
  const context={
    daydreamRunning:false,storyMode:true,
    flagTest:(id)=>!!flags[id],TUT:{LEVEL_CHECK_SECONDS:6},
    REC:{recState:()=>state,isRecording:()=>state.recording,isStalled:()=>state.stalled},
    scenes:{
      has:(id)=>stack.some(scene=>scene.id===id),push:(scene)=>stack.push(scene),
      remove(scene){const at=stack.indexOf(scene);if(at>=0){stack.splice(at,1);scene.exit?.();}},
    },
    makeSetupLevelHoldScene,
    onLevelsSet(){assert.equal(context.daydreamRunning,true,'the ready callback retains the daydream latch');flags['setup.levels']=true;levels++;},
    stopTake(){state.recording=false;state.takeElapsed=0;stops++;},
    applyLensPreset(){},CR:{fx:{glitch(){},flash(){}}},CUES:{CUE:{recorder:'recorder'},playCue(){}},
    makeBoothDownbeatHoldScene:(options)=>({id:'booth-downbeat-hold',...options}),
    openTrainingBattle:()=>training++,BINDINGS:{inputPrompt:()=> '[R]'},SPEECH:{say:()=>interruptions++},
  };
  const enter=runInNewContext(`(${mainFunction('dreamRippleIntoDrill')})`,context);
  enter();enter();
  assert.equal(stack.length,1,'repeated entry cannot duplicate the clean-measurement hold');
  assert.equal(stack[0].id,'setup-level-hold');
  assert.deepEqual([levels,stops,training],[0,0,0]);
  const hold=stack[0];
  hold.key({key:'Enter',repeat:true});hold.update(500);
  assert.deepEqual([levels,stops,training],[0,0,0]);
  state.takeElapsed=6;hold.update(0);
  assert.deepEqual([levels,stops,training],[1,1,0]);
  assert.equal(context.daydreamRunning,false);
  assert.equal(stack.length,1);assert.equal(stack[0].id,'booth-downbeat-hold');
  assert.equal(stack[0].duration,1.1);
  hold.update(0);hold.update(1);
  assert.deepEqual([levels,stops,training],[1,1,0],'the completed measurement never reenters its callback');
  stack[0].onDone();assert.equal(training,1);
  assert.equal(interruptions,0);

  // A failed measurement stays recoverable on R and never awards rehearsal.
  stack.splice(0);delete flags['setup.levels'];state.recording=true;state.takeElapsed=2;state.spoiled=true;
  enter();stack[0].update(0);
  assert.equal(stack.length,0);assert.equal(context.daydreamRunning,false);
  assert.deepEqual([levels,stops,training,interruptions],[1,2,1,1]);
});

test('stopping a completed Get In calibration cannot seal or count a job take', () => {
  const calls=[],context={
    finishRecordingSlate(){},takeRoom:'loading_dock',LEVEL_CHECK_ROOM:'loading_dock',activeTakeContamination:null,activeTakeWitnessed:false,
    activeSourceReplayTake:{id:'must-be-discarded'},
    REC:{isRecording:()=>true,stopRecording:()=>({completed:true,elapsed:45,spoiled:false}),saveRecState:()=>({tapes:[]})},
    cancelControlScope(){},liveRecordingPointerControls:{clear(){}},recordingHallucinations:{clear(){}},clearInstrument(){},
    CUES:{CUE:{recorder:'recorder'},playCue(){}},emitRecorderTransport(){},STORY:{stopTapeHiss(){}},updateAudio(){},
    PB:{abortTake:(room)=>calls.push(['abort',room]),sealTake:()=>assert.fail('calibration cannot be sealed')},
    emitProgress:()=>assert.fail('calibration cannot publish job progression'),
    saveCommit:(save)=>calls.push(['save',save.rec]),
  };
  runInNewContext(`(${mainFunction('stopTake')})`,context)();
  assert.deepEqual(calls,[['abort','loading_dock'],['save',{tapes:[]}]]);
  assert.equal(context.activeSourceReplayTake,null);
  assert.equal(context.takeRoom,null);
  const tick=mainFunction('tickRecorder');
  const guard=tick.indexOf('if(room===LEVEL_CHECK_ROOM)'),add=tick.indexOf('stopTake();',guard+tick.slice(guard).indexOf('return;')+7);
  assert.ok(guard>=0&&guard<add,'calibration exits the completion branch before counting a room');
  assert.match(tick.slice(guard,add),/onLevelsSet\(\);.*stopTake\(\);return;/s);
});

test('rolling a calibration never summons Presence or publishes a room start, even with the old tutorial inactive', () => {
  let dreams=0;
  const context={
    ensureTapeAudio(){},PB:{isPlaying:()=>false,cueTapeEnd:()=>false},PLANT:{plantRecordingBlocked:()=>false},REC:{isSlating:()=>false,recState:()=>({takes:[]}),startRecording:()=>true},
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
  assert.equal(dreams,1);
  assert.equal(context.activeSourceReplayTake,null);
});

test('main wires a persisted immediate handoff and physically identifies Studio B3', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const fn = (name) => {
    const start = main.indexOf(`function ${name}(`);
    assert.ok(start >= 0, name);
    const end = main.indexOf('\nfunction ', start + 1);
    return main.slice(start, end < 0 ? undefined : end);
  };
  const handoff = fn('finishSetupRehearsal');
  assert.match(handoff, /saveCommit\(\{flags:beginSetupHandoff/);
  assert.match(handoff, /holdForSetupBag\(\)/);
  assert.doesNotMatch(handoff, /converse\(/, 'no dialogue consumes B between the training result and the case');
  assert.match(fn('setupHandoffContext'), /FP\.zoneAt\(px,py\)===ZONE\.studio/);
  assert.match(fn('setupHandoffContext'), /!usingSpecialSpace\(\)/);
  assert.doesNotMatch(fn('setupHandoffContext'), /currentWorld\(\)/);
  assert.match(fn('setupComplete'), /setupCanLeave/);
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
  let flags = { ...beginSetupHandoff(trained()), [F.opened]: true, [F.skillsOpened]: true };
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
  assert.deepEqual(writes[0].combatBuild, accepted, 'reloading on Map retains the cable which satisfied Skills');
  assert.equal(normalized[0], accepted);
  handle({ type: 'continue', workingBuild: accepted });
  assert.equal(writes.length, 1, 'duplicate Continue cannot rewrite the accepted rig');
});
