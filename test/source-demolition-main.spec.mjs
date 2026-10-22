import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
function production(name) {
  const from = main.indexOf(`function ${name}(`);
  assert.ok(from >= 0, `production helper exists: ${name}`);
  const lineEnd = main.indexOf('\n', from);
  if (main.slice(from, lineEnd).trimEnd().endsWith('}')) return main.slice(from, lineEnd);
  const to = main.indexOf('\n}\n', lineEnd);
  assert.ok(to > from, `production helper is complete: ${name}`);
  return main.slice(from, to + 3);
}

function harness() {
  const h = {
    px: 20, py: -2000, CELL: .5, paused: false, hushRunActive: false,
    sourceDriveSession: null, sourcePubScene: null, sourceContinuationScene: null,
    sourceDemolitionAudio: null, sourceDemolitionAudioRuntime: null, sourceDemolitionComparison: 'final',
    assetLoaded: true, mode: 'full', reducedDread: false, yaw: .37, floor: 15.2,
    recording: false, listening: false, playback: false,
    domFocus: true, nativeFocus: null, IS_TAURI: true, blocked: false, inputBlocked: false,
    actx: { id: 'test-audio-context' }, sfxGain: { id: 'test-world-bus' },
    frame: { active: true, preload: true, assetsReady:true, visible:true, blackness: 0 },
    runtimeTicks: [], managers: [], order: [],
  };
  h.REC = { isRecording: () => h.recording, isListening: () => h.listening };
  h.PB = { isPlaying: () => h.playback };
  h.document = { hidden: false, visibilityState: 'visible', hasFocus: () => h.domFocus };
  h.pointerMode = { status: () => ({ nativeBackend: { focused: h.nativeFocus } }) };
  h.scenes = { blocksWorld: () => h.blocked, blocksInput: () => h.inputBlocked };
  h.R3 = { r3dFacing: () => 2, r3dLookAngles: () => ({ yaw: h.yaw, pitch: -.2 }),
    r3dSourceDemolitionStats: () => ({ loaded: h.assetLoaded }) };
  h.flashMode = () => h.mode;
  h.getSave = () => ({ settings: { reduceDread: h.reducedDread } });
  h.makeRuntime = id => ({ id,
    geometry: { floorAt: (x, y) => { assert.equal(x, h.px); assert.equal(y, h.py); return h.floor; } },
    tickDemolition(dt, options) {
      h.order.push('demolition'); h.runtimeTicks.push({ id, dt, options: copy(options) });
      // The real runtime's asset-ready fallback is tested independently. This
      // fake records main's input and returns an already computed world frame.
      return h.frame;
    },
    demolitionFrame: () => h.frame,
  });
  h.chunkSurfRuntime = h.makeRuntime('A');
  h.createSourceDemolitionAudio = options => {
    const manager = { updates: [], stops: 0, resets: 0, destroys: 0, options,
      update(frame, presentation) { this.updates.push({ frame, presentation: copy(presentation) }); },
      stop() { this.stops++; h.order.push('demolition-stop'); },
      reset() { this.resets++; h.order.push('demolition-reset'); },
      destroy() { this.destroys++; h.order.push('demolition-destroy'); },
    };
    h.managers.push(manager); return manager;
  };
  vm.createContext(h);
  for (const name of ['usingSourceSpace', 'gameplayInputLifecycleActive', 'sourceDemolitionProtected',
    'sourceDemolitionSuspended', 'sourceDemolitionBlackActive', 'sourceDemolitionMediumFrame', 'tickSourceDemolition']) {
    vm.runInContext(production(name), h, { filename: `src/main.js:${name}` });
  }
  return h;
}

test('actual main forwards asset readiness and creates one lazy audio manager only for a preload frame', () => {
  const h = harness(); h.assetLoaded = false; h.frame = { ...h.frame, active: false, preload: false };
  h.tickSourceDemolition(.05);
  assert.equal(h.runtimeTicks.at(-1).options.demolitionAssetsReady, false);
  assert.equal(h.managers.length, 0);
  h.assetLoaded = true; h.sourceDemolitionComparison = 'baseline'; h.tickSourceDemolition(.05);
  assert.equal(h.runtimeTicks.at(-1).options.demolitionAssetsReady, false);
  assert.equal(h.managers.length, 0);
  h.sourceDemolitionComparison = 'final'; h.frame = { ...h.frame, active: true, preload: true };
  h.tickSourceDemolition(.05); h.tickSourceDemolition(.05);
  assert.equal(h.runtimeTicks.at(-1).options.demolitionAssetsReady, true);
  assert.equal(h.managers.length, 1); assert.equal(h.managers[0].updates.length, 2);
  const bus = h.managers[0].options.getAudio();
  assert.equal(bus.ctx, h.actx); assert.equal(bus.destination, h.sfxGain);
  assert.deepEqual(h.runtimeTicks.at(-1).options, { px: 20, py: -2000, facing: 2, yaw: .37,
    demolitionAssetsReady: true, protectedPresentation: false, suspendedPresentation: false });
  const presentation = h.managers[0].updates.at(-1).presentation;
  assert.deepEqual(presentation.listener, { x: 10.25, y: 16.8, z: -999.75, yaw: .37 });
  assert.equal(presentation.effectsMode, 'full'); assert.equal(presentation.reducedDread, false);
  h.reducedDread = true; h.mode = 'reduced'; h.tickSourceDemolition(.05);
  assert.equal(h.managers[0].updates.at(-1).presentation.reducedDread, true);
  assert.equal(h.managers[0].updates.at(-1).presentation.effectsMode, 'reduced');
  h.actx = null; assert.equal(h.managers[0].options.getAudio(), null,
    'the lazy destination cannot return a stale context after shutdown');
});

test('recording, monitoring, playback, HUSH and the existing Source scenes reach both real protection gates', () => {
  for (const [flag, value] of [['recording', true], ['listening', true], ['playback', true],
    ['hushRunActive', true], ['sourcePubScene', {}], ['sourceDriveSession', {}], ['sourceContinuationScene', {}]]) {
    const h = harness(); h.tickSourceDemolition(.05); h[flag] = value;
    assert.equal(h.sourceDemolitionProtected(), true, flag);
    h.tickSourceDemolition(.05);
    assert.equal(h.runtimeTicks.at(-1).options.protectedPresentation, true, flag);
    assert.equal(h.managers[0].updates.at(-1).presentation.protected, true, flag);
    h[flag] = typeof value === 'boolean' ? false : null; h.tickSourceDemolition(.05);
    assert.equal(h.runtimeTicks.at(-1).options.protectedPresentation, false, flag);
    assert.equal(h.managers[0].updates.at(-1).presentation.protected, false, flag);
  }
});

test('pause, hidden state, real DOM/native focus and world scenes suspend both clock and sound inputs', () => {
  const changes = [
    ['pause', h => { h.paused = true; }],
    ['document hidden', h => { h.document.hidden = true; }],
    ['visibility hidden', h => { h.document.visibilityState = 'hidden'; }],
    ['DOM focus lost', h => { h.domFocus = false; }],
    ['native focus lost despite DOM focus', h => { h.nativeFocus = false; h.domFocus = true; }],
    ['world-blocking scene', h => { h.blocked = true; }],
  ];
  for (const [label, set] of changes) {
    const h = harness(); set(h); h.tickSourceDemolition(.05);
    assert.equal(h.sourceDemolitionSuspended(), true, label);
    assert.equal(h.runtimeTicks.at(-1).options.suspendedPresentation, true, label);
    assert.equal(h.managers[0].updates.at(-1).presentation.suspended, true, label);
  }
  const h = harness(); h.inputBlocked = true; h.tickSourceDemolition(.05);
  assert.equal(h.sourceDemolitionSuspended(), false, 'an input-only conversation does not suspend the world');
  h.domFocus = false; h.nativeFocus = true; h.tickSourceDemolition(.05);
  assert.equal(h.sourceDemolitionSuspended(), false,
    'confirmed native focus preserves input lifecycle despite delayed DOM truth');
});

test('global pre-world pass really ticks demolition before the Horizon-specific early return', () => {
  const h = harness(), loop = production('loop');
  const outer = loop.indexOf('if(inRogue){'), begin = outer + 'if(inRogue){'.length;
  const end = loop.indexOf('if(!scenes.blocksWorld()){', begin);
  assert.ok(outer > 0 && end > begin);
  const prefix = loop.slice(begin, end);
  assert.equal((prefix.match(/tickSourceDemolition\(dt\)/g) || []).length, 1,
    'the encounter belongs to one global pre-world tick');
  assert.ok(loop.indexOf('tickSourceDemolition(dt)') < loop.indexOf('tickSourceSpace(dt)'));
  for (const name of ['ensureInteractionFocus', 'tickIndependentLook', 'tickHeldTurning', 'tickHeldMovement',
    'tickPracticePropMotion', 'tickKeyCabinetMotion', 'tickOpeningSceneBed', 'tickHorizonBustPerformance',
    'tickStopListeningAudio', 'tickChapelServiceAudio', 'tickPubRoomAudio', 'tickStBrendansSound',
    'tickAcademicAdversaries', 'tickAcademicBouncers', 'tickAcademicSocietyPresentation', 'tickAcademicCrowdDread']) h[name] = () => {};
  h.tick = 1; h.nowLoopMs = 1000;
  Object.assign(h, {
    tickTowerPersonal: () => false, endSourceHaystackMosh() {}, endSourceBracketPresence() {},
    PRES: { isActive: () => false }, sourceFearFloor: 0,
    tickHorizonScore: () => h.order.push('score'), speakHorizonMarker() {},
    syncOutskirtsNight() {}, tickPayphone() {}, syncSourceRender: () => h.order.push('render'),
    shakeMode: () => 'full',
  });
  Object.assign(h.chunkSurfRuntime, {
    bellsFrame: () => ({ active: false }), horizonFrame: () => ({ active: true }),
    tickHorizon: dt => { h.order.push('horizon'); assert.equal(dt, .05); },
    setPlayerPosition() {}, tick() { assert.fail('the Horizon early return must bypass the generic Source tick'); },
  });
  vm.runInContext(`function actualPreWorldPass(dt){${prefix}}\n${production('tickSourceSpace')}`, h);
  h.actualPreWorldPass(.05); h.tickSourceSpace(.05);
  assert.equal(h.runtimeTicks.length, 1);
  assert.deepEqual(h.order, ['demolition', 'horizon', 'score', 'render']);
  h.blocked = true; h.actualPreWorldPass(.05);
  assert.equal(h.runtimeTicks.length, 2, 'pre-world work remains reachable while a scene blocks generic work');
  assert.equal(h.runtimeTicks.at(-1).options.suspendedPresentation, true);
});

test('runtime change destroys old audio once; outside-source helper stops a stranded manager', () => {
  const h = harness(); h.tickSourceDemolition(.05); const first = h.managers[0];
  h.chunkSurfRuntime = h.makeRuntime('B'); h.tickSourceDemolition(.05);
  assert.equal(first.destroys, 1); assert.equal(h.managers.length, 2);
  assert.equal(first.updates.length, 1); assert.equal(h.managers[1].updates.length, 1);
  h.tickSourceDemolition(.05); assert.equal(first.destroys, 1);
  const second = h.managers[1]; h.chunkSurfRuntime = null; h.tickSourceDemolition(.05);
  assert.equal(second.destroys, 1); assert.equal(h.sourceDemolitionAudio, null);
  assert.equal(h.sourceDemolitionAudioRuntime, null);
  const stranded = h.createSourceDemolitionAudio({}); h.sourceDemolitionAudio = stranded;
  const calls = h.runtimeTicks.length; h.tickSourceDemolition(.05);
  assert.equal(stranded.stops, 1); assert.equal(h.runtimeTicks.length, calls);
});

test('actual black helper requires Source, black world state, enabled effects and every protection clear', () => {
  const h = harness();
  for (const blackness of [0, .5, .99]) {
    h.frame.blackness = blackness; assert.equal(h.sourceDemolitionBlackActive(), false);
  }
  h.frame.blackness = 1; assert.equal(h.sourceDemolitionBlackActive(), true);
  h.frame.assetsReady=false;assert.equal(h.sourceDemolitionBlackActive(),false,'missing asset retains the ordinary scene instead of filtering it empty');h.frame.assetsReady=true;
  h.frame.visible=false;assert.equal(h.sourceDemolitionBlackActive(),false);h.frame.visible=true;
  h.mode = 'off'; assert.equal(h.sourceDemolitionBlackActive(), false);
  h.mode = 'reduced'; assert.equal(h.sourceDemolitionBlackActive(), true);
  for (const flag of ['recording', 'listening', 'playback', 'hushRunActive', 'sourcePubScene', 'sourceDriveSession', 'sourceContinuationScene']) {
    h[flag] = true; assert.equal(h.sourceDemolitionBlackActive(), false, flag); h[flag] = false;
  }
  h.chunkSurfRuntime = null; assert.equal(h.sourceDemolitionBlackActive(), false);
});

function attachResetDependencies(h) {
  Object.assign(h, {
    towerBellDirector: null, bellTowerRuntime: null, bellTowerAudio: null,
    electricalHumRuntime: null, fountainWaterRuntime: null, forkToneRuntime: null,
    metronomeFieldRuntime: null, plantPipeRuntime: null, stopListeningGut: null, stopListeningAudioFrame: null,
    chapelServiceAudio: null, chapelServiceAudioFrame: null, chapelServiceOcclusionKey: '', chapelServiceOcclusion: new Map(),
    brendanBellAudio: null, brendanSoundFrame: null, brendanSoundOcclusionKey: '', brendanSoundOcclusion: new Map(),
    personalWindowEffects: { end() {} }, STAB: { reportThreat() {} },
    SPEECH: { clearSpeech() {} }, CUES: { stopAllCues() {} },
    STORY: { stopAll() {}, stopTapeHiss() {} }, RT: { setBed() {} },
    sourceBellFieldAudio: null, sourceFaultTransitionStartedAt: 0,
    windowChoreography: { leaveSource: () => h.order.push('leave-source') },
    stairAttentionScene: null, stairAnomalyRuntime: null, stairPresenceSnapshot: null,
    sourceExitSnapshot: null, sourcePresenceWasActive: false,
    bellTowerImpactActive: false, bellTowerCollisionEnabled: true,
    PRES: { despawn() {} }, frontEndSession: null, openingVehicleScene: null,
    activeBattleId: null, godBattleOpen: false,
    newGame: options => { h.order.push('new-run'); h.newGameOptions = copy(options); },
    params: () => new URLSearchParams('at=van'),
    enterSelectedRun: options => { h.order.push('selected'); h.selectedOptions = copy(options); },
    flagSet() {}, saveCommit() {},
  });
  for (const name of ['releaseSourceDrive', 'releaseSourcePub', 'cancelApparitionApplause',
    'clearStationPresentation', 'stopOutskirtsStreetAudio', 'resetOutskirtsLastLight', 'stopBellTowerRuntime',
    'clearInstrument', 'stopHushAudioRuntime', 'stopAllVoices', 'stopWorldLayerVoice', 'silenceAmbientDrone',
    'silenceSampleField', 'pushEvent', 'stopSourceDockDoorAudio', 'stopSourceShoreAudio', 'endHorizonScore',
    'clearStairEnvironmentalTimers', 'endSourceHaystackMosh', 'resetMotionInput']) h[name] = () => {};
  for (const name of ['r3dSetHorizon', 'r3dSetSourceShore', 'r3dSetSourceEmergency', 'r3dSetSourceWhiteout',
    'r3dSetSourceFault', 'r3dSetIndoorRain', 'r3dSetLocalLights', 'r3dSetSourceScene', 'r3dSetSourceSurface']) h.R3[name] = () => {};
  for (const name of ['resetRunAudio', 'clearSourceRuntime', 'godClearSpecialWorlds', 'beginNewGameFlow']) {
    vm.runInContext(production(name), h, { filename: `src/main.js:${name}` });
  }
}

test('real audio reset and teardown clear demolition ownership, including the explicit new-run path', () => {
  const h = harness(); attachResetDependencies(h); h.tickSourceDemolition(.05);
  const manager = h.managers[0]; h.resetRunAudio('test-reset');
  assert.equal(manager.resets, 1); assert.equal(manager.destroys, 0);
  assert.equal(h.sourceDemolitionAudio, manager);
  assert.equal(h.clearSourceRuntime({ preserveWindows: true }), true);
  assert.equal(manager.destroys, 1); assert.equal(h.chunkSurfRuntime, null);
  assert.equal(h.sourceDemolitionAudio, null); assert.equal(h.sourceDemolitionAudioRuntime, null);
  assert.equal(h.order.includes('leave-source'), false, 'preserveWindows remains respected');
  assert.equal(h.clearSourceRuntime(), false); assert.equal(manager.destroys, 1);
  const next = harness(); attachResetDependencies(next); next.tickSourceDemolition(.05);
  const old = next.managers[0]; next.order.length = 0; next.beginNewGameFlow();
  assert.equal(old.destroys, 1); assert.equal(next.sourceDemolitionAudio, null);
  assert.equal(next.chunkSurfRuntime, null);
  assert.ok(next.order.indexOf('demolition-destroy') < next.order.indexOf('new-run'),
    'the real new-run flow relinquishes the previous encounter before replacing the run');
  assert.deepEqual(next.newGameOptions, { prepareInVan: true, launchPlan: null });
  assert.deepEqual(next.selectedOptions, { matched: false, mismatch: false });
  assert.match(production('enterStory'), /resetRunAudio\('enter-story'\)/,
    'run entry explicitly invokes the tested audio reset');
});

test('the early omen cannot change the later Outskirts scrawl or optional window decay',()=>{
 const calls=[],h={phoneFlurry:1,black:true,sourceDriveSession:null,
   sourceDemolitionBlackActive:()=>h.black,
   flurryLinesFor:()=>['existing line'],chunkSurfRuntime:{outskirtsPassAt:()=>25,horizonFrame:()=>({active:true,preTape:true,preTapeProgress:.84})},
   performance:{now:()=>1000},SPEECH:{bandTop:()=>30},uiText:()=>calls.push('text'),
   windowChoreography:{sourceDecay:p=>calls.push(['decay',p]),leaveSource:()=>calls.push('leave')},};
 const context=vm.createContext(h);vm.runInContext(production('drawOutskirtsFlurryScrawl')+production('syncSourceWindowDecay'),context);
 context.drawOutskirtsFlurryScrawl(100,40);context.syncSourceWindowDecay();
 assert.equal(h.phoneFlurry,1);assert.ok(calls.includes('text'));assert.deepEqual(calls.at(-1),['decay',.84]);
});
test('the real audio listener stays at first-shore floor zero instead of falling back to the late-road height',()=>{
 const h=harness();h.floor=0;h.tickSourceDemolition(.05);
 assert.equal(h.managers[0].updates.at(-1).presentation.listener.y,1.6);
});

test('the gathering shadow is a bounded world medium gated by actual occupancy, assets and all recording/effects protections',()=>{
 const h=harness();assert.equal(h.sourceDemolitionMediumFrame(),null);
 h.frame={...h.frame,consumed:true,released:false,consumption:.5,blackPocket:{from:8,to:38,halfWidth:18},roadOrigin:{x:4,z:-134},origin:{y:0}};
 assert.deepEqual(copy(h.sourceDemolitionMediumFrame()),{progress:.5,min:[-14.4,-.4,-172.4],max:[22.4,40.4,-141.6]});
 for(const k of ['recording','listening','playback','hushRunActive','sourceDriveSession','sourcePubScene','sourceContinuationScene']){h[k]=true;assert.equal(h.sourceDemolitionMediumFrame(),null,k);h[k]=false;}
 h.mode='off';assert.equal(h.sourceDemolitionMediumFrame(),null);h.mode='full';h.frame.released=true;assert.equal(h.sourceDemolitionMediumFrame(),null);
 h.frame.released=false;h.frame.assetsReady=false;assert.equal(h.sourceDemolitionMediumFrame(),null);
});
