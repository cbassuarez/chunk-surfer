import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  SETUP_HANDOFF, beginSetupHandoff, beginSetupSkillsHandoff,
  setupHandoffStage, advanceSetupHandoff, setupHandoffGuide,
  setupHandoffBlocksMovement as setupCaseBlocksMovement,
} from '../src/game/setup-handoff.js';
import { makeSetupHandoffScene } from '../src/game/setup-handoff-scene.js';
import * as REC from '../src/game/recordist.js';
import { normalizeCombatBuild } from '../src/game/combat-progression.js';
import { trainingCombatBattle } from '../src/data/combat-definitions.js';
import { createCombatTutorialDirector } from '../src/game/combat-tutorial.js';
import { advanceDreamFigure, freshDreamFigure, DREAM_FIGURE_PHASE } from '../src/game/dream-figure.js';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

// Run the production integration functions with observable boundaries. These
// tests intentionally avoid importing the browser entry point and launching its
// renderer; no copied gate or resumption algorithm stands in for production.
function mainFunction(name) {
  const start = main.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `production function ${name} exists`);
  const end = main.indexOf('\n}', start) + 2;
  assert.ok(end > start, `production function ${name} has a complete body`);
  return main.slice(start, end);
}

function sceneStack() {
  const stack = [];
  return {
    stack,
    push(scene) { stack.push(scene); scene.enter?.(); return scene; },
    remove(sceneOrId) {
      const index = typeof sceneOrId === 'string'
        ? stack.findIndex(scene => scene.id === sceneOrId) : stack.indexOf(sceneOrId);
      if (index < 0) return null;
      const [scene] = stack.splice(index, 1);
      scene.exit?.();
      return scene;
    },
    pop() { const scene = stack.pop(); scene?.exit?.(); return scene; },
    top() { return stack.at(-1) || null; },
    has(id) { return stack.some(scene => scene.id === id); },
    blocksWorld() { return stack.some(scene => scene.blocksWorld); },
    blocksInput() { return stack.some(scene => scene.blocksInput); },
  };
}

const copy = value => JSON.parse(JSON.stringify(value));

function fixture({ recording = true, trained = false, skillsClosed = false } = {}) {
  const events = [], battles = [], scenes = sceneStack(), cleared = new Set();
  REC.loadRecState({ battery: .73, takes: ['main_b3'] });
  Object.assign(REC.recState(), {
    phase: recording ? 'recording' : 'idle', light: false, takeElapsed: 14.25,
    takeTapeElapsed: 16.5, takeDurationSeconds: 60, takeEvents: [],
    spoiled: false, spoilReason: '', spoilMeta: null, noise: 0, stalled: false,
  });
  const flags = {
    ...beginSetupHandoff({ 'setup.levels': true, 'setup.waypoint': true, 'bag.taken': true }),
    [SETUP_HANDOFF.opened]: true, [SETUP_HANDOFF.mapOpened]: true,
    [SETUP_HANDOFF.closed]: true, [SETUP_HANDOFF.arrived]: true,
    ...(trained ? { 'combat.trained': true } : {}),
    ...(skillsClosed ? { [SETUP_HANDOFF.skillsClosed]: true } : {}),
  };
  const save = { flags, run: { id: 'opening-test-run', ledger: {} }, encounters: { cleared: [] } };
  const normalizeBuild = () => {
    save.combatBuild = normalizeCombatBuild(save.combatBuild, save.encounters.cleared, save.flags, {
      tutorialComplete: save.flags['combat.trained'] === true, combatAssistance: 'standard',
    });
  };
  normalizeBuild();
  const host = {
    console, scenes, REC, SETUP_HANDOFF, beginSetupHandoff, beginSetupSkillsHandoff,
    setupHandoffStage, advanceSetupHandoff, trainingCombatBattle, createCombatTutorialDirector,
    advanceDreamFigure, freshDreamFigure, DREAM_FIGURE_PHASE,
    storyMode: true, usingPlan: () => true, usingSpecialSpace: () => false,
    usingSourceSpace: () => false, usingStairAnomaly: () => false,
    godBattleOpen: false, activeBattleId: null,
    deferredCombatRequest: null, combatRehearsalOwner: null, daydreamRunning: false,
    dreamFigure: null, dreamFigureFrozen: false, paused: false, document: { hidden: false },
    gameplayInputLifecycleActive: () => true,
    px: 40, py: 40, getSave: () => save,
    flagTest: key => save.flags[key] === true,
    flagSet: key => { save.flags[key] = true; },
    saveCommit: patch => { Object.assign(save, patch); normalizeBuild(); events.push({ type: 'save' }); return save; },
    resetMotionInput: () => events.push({ type: 'reset-motion' }),
    beginDaydream: () => { host.daydreamRunning = true; events.push({ type: 'daydream' }); return true; },
    tickDreamFigure: () => {},
    fireCue: () => {}, holdForSetupBag: () => events.push({ type: 'skills-case' }),
    SPEECH: { say: () => {}, clearSpeech: () => events.push({ type: 'clear-speech' }) },
    CUES: { CUE: { recorder: 'recorder', light: 'light' }, playCue: () => {} },
    CR: { fx: { glitch: () => {}, flash: () => {} } },
    applyLensPreset: () => {}, itemLost: () => false, once: (_id, fn) => fn(),
    framedLine: (_kind, line) => line, LINES: { lightOn: 'On.', lightOff: 'Off.' },
    stopTake: () => assert.fail('rehearsal cannot stop the suspended real take'),
    makeSetupLevelHoldScene: () => assert.fail('rehearsal cannot request another real measurement'),
    ENCOUNTERS: {
      encounterCleared: id => cleared.has(id),
      clearEncounter: id => cleared.add(id),
      saveEncounterState: () => ({ cleared: [...cleared] }),
    },
    EVENT_TYPES: { BATTLE_STARTED: 'battle-started', BATTLE_FINISHED: 'battle-finished' },
    emitProgress: (type, payload) => events.push({ type, ...payload }),
    causalRecorder: { elapsedMs: 3000, recordAnchor: value => events.push({ type: 'anchor', ...value }) },
    sourceReplayPoseWindow: () => [], currentWorld: () => 'soundnoisemusic',
    currentSourceReplayManifest: () => ({}), noteSourceReplayBattle: () => ({}),
    commitSourceReplayManifest: () => {},
    combatBuild: () => save.combatBuild,
    openCombatCalibration: () => events.push({ type: 'post-win-case' }),
    openBattle: (battle, options) => { const opened = { battle, options }; battles.push(opened); return opened; },
    practiceHaunts: { fired: [] },
    markPracticeHauntFired: (state, roomId) => ({ ...state, fired: [...state.fired, roomId] }),
    commitPracticeHaunts: () => events.push({ type: 'haunt-commit' }),
    commitPsychObservation: () => events.push({ type: 'psych-observation' }),
    stopHeldPropPlay: () => events.push({ type: 'stop-held-prop' }),
    practiceRoomHushBattle: () => ({ id: 'practice-hush', combat: { id: 'practice' } }),
    FP: { toRuntimePoint: point => point }, ROOM_CELLS: { soundnoisemusic: { x: 40, y: 40 }, rehearsal: { x: 42, y: 40 } },
  };
  vm.createContext(host);
  const install = names => vm.runInContext(names.map(mainFunction).join('\n\n'), host);
  install([
    'ensureCombatRehearsal', 'finishCombatRehearsal', 'finishSetupRehearsal',
    'openEncounterBattle', 'openPracticeRoomHush', 'openTrainingBattle', 'toggleTorchAction',
  ]);
  const encounter = { id: 'room-response', combat: { id: 'practice' } };
  const completeTraining = (result = 'win') => {
    host.openTrainingBattle();
    const drill = battles.at(-1);
    assert.equal(drill.options.bench, true);
    drill.options[result === 'lose' ? 'onLose' : 'onWin']({ result });
    return drill;
  };
  const closeSkills = () => {
    let flags = save.flags;
    const context = { workingBuild: { pinsEarned: 1, techniques: ['afterimage'] } };
    for (const event of [
      { type: 'bag-opened' }, { type: 'section-selected', sectionId: 'skills' },
      { type: 'continue' }, { type: 'close' },
    ]) flags = advanceSetupHandoff(flags, event, context);
    save.flags = flags;
    assert.equal(flags[SETUP_HANDOFF.skillsClosed], true);
  };
  return { host, save, events, battles, scenes, encounter, install, completeTraining, closeSkills };
}

function transport() {
  const { phase, takeElapsed, takeTapeElapsed, takeDurationSeconds, spoiled, spoilReason, battery } = REC.recState();
  return { phase, takeElapsed, takeTapeElapsed, takeDurationSeconds, spoiled, spoilReason, battery };
}

test('a first threat defers before encounter ownership, events, callbacks or starter grants', () => {
  const h = fixture(), before = transport();
  let started = 0;
  assert.equal(h.host.openEncounterBattle('recording-2', h.encounter, { onStart: () => started++ }), true);
  assert.equal(h.host.activeBattleId, null);
  assert.equal(started, 0);
  assert.equal(h.battles.length, 0);
  assert.equal(h.events.some(event => event.type === 'battle-started'), false);
  assert.equal(h.save.flags['combat.trained'], undefined);
  assert.equal(h.save.flags[SETUP_HANDOFF.skillsCaseOpened], undefined);
  assert.equal(h.save.combatBuild.tutorialGrant, null);
  assert.equal(h.save.combatBuild.unspent, 0);
  assert.deepEqual(transport(), before);
  assert.equal(h.scenes.top().blocksWorld, true);
  assert.equal(h.scenes.top().blocksInput, true);
  assert.equal(h.scenes.top().allowsLook, true);
  h.host.openEncounterBattle('pre-recording-4', { id: 'different-request' });
  assert.equal(h.scenes.stack.length, 1, 'a repeated threat cannot stack another rehearsal');
  assert.equal(h.host.deferredCombatRequest.id, 'recording-2', 'the original request remains authoritative');
});

test('actual drill completion waits for Skills acceptance and close, then resumes original callbacks once', () => {
  const h = fixture(), before = transport(), wins = [], starts = [];
  const onWin = metrics => wins.push(metrics), onLose = () => assert.fail('win cannot call original loss');
  const onStart = () => starts.push('start');
  h.host.openEncounterBattle('recording-2', h.encounter, { onWin, onLose, onStart });
  assert.equal(h.host.finishCombatRehearsal(), false, 'a request is not training');
  h.completeTraining();
  assert.equal(h.save.flags['combat.trained'], true);
  assert.equal(h.save.combatBuild.tutorialGrant.combatAssistance, 'standard');
  assert.equal(h.save.combatBuild.unspent, 1, 'actual completion issues the real starter grant once');
  assert.equal(h.host.finishCombatRehearsal(), false, 'training alone does not complete the case lesson');
  assert.equal(h.battles.length, 1, 'only the bench drill has opened');
  h.closeSkills();
  const owner = h.scenes.top();
  h.scenes.push({ id: 'pause', blocksWorld: true });
  assert.equal(h.host.finishCombatRehearsal(), false, 'the encounter cannot open under another modal owner');
  h.scenes.pop();
  assert.equal(h.host.finishCombatRehearsal(), true);
  assert.equal(h.host.deferredCombatRequest, null);
  assert.equal(h.scenes.stack.includes(owner), false);
  assert.equal(h.battles.length, 2);
  assert.equal(h.battles[1].battle, h.encounter, 'resume uses the exact original definition');
  assert.deepEqual(starts, ['start']);
  assert.equal(h.events.filter(event => event.type === 'battle-started').length, 1);
  assert.equal(h.host.finishCombatRehearsal(), false);
  assert.equal(h.battles.length, 2, 'repeated completion cannot replay the encounter');
  const metrics = { turns: 3, missedCounters: 0 };
  h.battles[1].options.onWin(metrics);
  assert.equal(wins.length, 1); assert.equal(wins[0], metrics);
  assert.deepEqual(transport(), before, 'neither rehearsal nor its handoff changes the real transport');
});

test('a training abort and owner removal grant nothing and cannot resume the deferred threat', () => {
  const h = fixture(), before = transport();
  h.host.openEncounterBattle('natatorium-approach', h.encounter);
  h.host.openTrainingBattle();
  h.battles[0].options.onAbort();
  assert.equal(h.save.flags['combat.trained'], undefined);
  assert.equal(h.save.combatBuild.tutorialGrant, null);
  h.scenes.remove(h.host.combatRehearsalOwner);
  assert.equal(h.host.deferredCombatRequest, null);
  assert.equal(h.host.combatRehearsalOwner, null);
  assert.equal(h.host.finishCombatRehearsal(), false);
  assert.equal(h.events.some(event => event.type === 'battle-started'), false);
  assert.equal(h.host.activeBattleId, null);
  assert.deepEqual(transport(), before);
  assert.equal(h.host.openEncounterBattle('natatorium-approach', h.encounter), true, 'a later real approach can request training again');
  assert.ok(h.host.combatRehearsalOwner);
});

test('an owner from another run cannot launch its old encounter', () => {
  const h = fixture();
  h.host.openEncounterBattle('recording-2', h.encounter);
  h.completeTraining(); h.closeSkills();
  h.save.run = { id: 'a-new-run', ledger: {} };
  assert.equal(h.host.finishCombatRehearsal(), false);
  assert.equal(h.host.deferredCombatRequest, null);
  assert.equal(h.host.combatRehearsalOwner, null);
  assert.equal(h.battles.length, 1);
  assert.equal(h.events.some(event => event.type === 'battle-started'), false);
});

test('discarding a stale owner cannot change the new run\'s actual torch', () => {
  const h = fixture();
  h.host.openEncounterBattle('recording-2', h.encounter);
  const owner = h.host.combatRehearsalOwner;
  h.save.run = { id: 'a-new-run', ledger: {} };
  REC.recState().phase = 'idle';
  REC.recState().light = true;
  owner.update(.05);
  assert.equal(h.host.deferredCombatRequest, null);
  assert.equal(h.host.combatRehearsalOwner, null);
  assert.equal(REC.lightOn(), true, 'an old suspended-take receipt has no authority over the new body');
  assert.equal(h.events.some(event => event.type === 'battle-started'), false);
});

test('practice HUSH stays unspent across deferral and abort; only the resumed real start consumes it', () => {
  const h = fixture({ recording: false });
  h.host.openPracticeRoomHush('rehearsal');
  assert.deepEqual(copy(h.host.practiceHaunts.fired), []);
  assert.equal(h.events.some(event => ['haunt-commit', 'anchor', 'psych-observation'].includes(event.type)), false);
  h.scenes.remove(h.host.combatRehearsalOwner);
  assert.deepEqual(copy(h.host.practiceHaunts.fired), []);
  h.host.openPracticeRoomHush('rehearsal');
  h.completeTraining('lose'); h.closeSkills();
  assert.equal(h.host.finishCombatRehearsal(), true);
  assert.deepEqual(copy(h.host.practiceHaunts.fired), ['rehearsal']);
  assert.equal(h.events.filter(event => event.type === 'haunt-commit').length, 1);
  assert.equal(h.events.filter(event => event.type === 'psych-observation').length, 1);
  assert.equal(h.events.filter(event => event.type === 'anchor').length, 1);
  assert.equal(h.events.filter(event => event.type === 'battle-started').length, 1);
});

test('a reloaded trained run recovers unfinished Skills at the next threat without another dream or grant', () => {
  const h = fixture({ trained: true }), beforeBuild = copy(h.save.combatBuild);
  const route = Object.fromEntries([SETUP_HANDOFF.closed, SETUP_HANDOFF.arrived, 'setup.waypoint'].map(key => [key, h.save.flags[key]]));
  h.host.openEncounterBattle('pre-recording-4', h.encounter);
  assert.equal(h.events.some(event => event.type === 'daydream'), false);
  assert.equal(h.events.filter(event => event.type === 'skills-case').length, 1);
  assert.equal(h.battles.length, 0);
  assert.equal(h.save.flags[SETUP_HANDOFF.mode], 'skills');
  assert.deepEqual(copy(h.save.combatBuild), beforeBuild);
  assert.equal(h.host.finishCombatRehearsal(), false);
  h.closeSkills();
  assert.equal(h.host.finishCombatRehearsal(), true);
  assert.equal(h.battles.length, 1);
  for (const [key, value] of Object.entries(route)) assert.equal(h.save.flags[key], value, key);
  assert.deepEqual(copy(h.save.combatBuild), beforeBuild, 'recovering the case cannot issue a second starter grant');
});

test('an established legacy trained and completed case starts its encounter without replaying rehearsal', () => {
  const h = fixture({ trained: true });
  h.save.flags[SETUP_HANDOFF.skillsDone] = true;
  assert.equal(h.save.flags[SETUP_HANDOFF.skillsClosed], undefined, 'legacy saves predate the separate close receipt');
  assert.equal(h.host.openEncounterBattle('recording-2', h.encounter), true);
  assert.equal(h.host.combatRehearsalOwner, null);
  assert.equal(h.battles.length, 1);
  assert.equal(h.events.some(event => ['daydream', 'skills-case'].includes(event.type)), false);
});

test('the relocated count and ripple neither inspect a calibration clock nor stop a real job take', () => {
  const h = fixture(), before = transport();
  let conversation, hold;
  h.host.DAYDREAM_DRIFT = ['drift one', 'drift two', 'drift three'];
  h.host.DAYDREAM_SILLY = ['silly thought'];
  h.host.converse = (_id, nodes, options) => { conversation = { nodes, options }; return true; };
  h.host.makeBoothDownbeatHoldScene = options => { hold = { id: 'dream-ripple', ...options }; return hold; };
  h.host.beginDreamFigure = () => false;
  h.install(['shufflePick', 'daydreamBeat', 'beginDaydream', 'dreamRippleIntoDrill']);
  h.host.openEncounterBattle('recording-2', h.encounter);
  const counts = conversation.nodes.start.lines.filter(line => line.resolveText).map(line => line.resolveText());
  assert.deepEqual(Array.from(counts), ['1.', '2.', '3.', '4.', '5.', '6.']);
  assert.deepEqual(transport(), before);
  conversation.options.onDone();
  assert.ok(hold);
  h.scenes.remove(hold); hold.onDone();
  assert.equal(h.battles.length, 1); assert.equal(h.battles[0].options.bench, true);
  assert.deepEqual(transport(), before);
  assert.equal(h.save.flags['combat.trained'], undefined, 'showing the dream is not a completed tutorial');
});

test('the rehearsal owner advances the figure once while the blocked world and other modal surfaces do not', () => {
  const h = fixture();
  h.install(['tickDreamFigure']);
  h.host.openEncounterBattle('recording-2', h.encounter);
  const owner = h.host.combatRehearsalOwner;
  h.host.dreamFigure = { state: freshDreamFigure({ at: { x: 40, y: 26 }, player: { x: 40, y: 40 } }) };
  owner.update(.05);
  const afterOwner = h.host.dreamFigure.state;
  assert.ok(afterOwner.elapsedMs > 0);
  h.host.tickDreamFigure(.05);
  assert.equal(h.host.dreamFigure.state, afterOwner, 'a blocked ordinary recorder tick cannot double-advance the figure');
  h.scenes.push({ id: 'pause', blocksWorld: true });
  owner.update(.05);
  assert.equal(h.host.dreamFigure.state, afterOwner, 'an overlaid modal owns the clock');
  h.scenes.pop(); h.host.document.hidden = true;
  owner.update(.05);
  assert.equal(h.host.dreamFigure.state, afterOwner, 'focus loss freezes the authored figure');
  h.host.document.hidden = false; h.host.gameplayInputLifecycleActive = () => false;
  owner.update(.05);
  assert.equal(h.host.dreamFigure.state, afterOwner, 'inactive gameplay input freezes the figure even without a hidden document');
});

test('rehearsal light handling protects the real recorder and restores its original darkness', () => {
  const h = fixture(), before = transport();
  h.host.openEncounterBattle('recording-2', h.encounter);
  const owner = h.host.combatRehearsalOwner;
  owner.key({ key: 'f', code: 'KeyF', repeat: false });
  assert.equal(REC.lightOn(), true); assert.deepEqual(transport(), before);
  owner.key({ key: 'f', code: 'KeyF', repeat: true });
  assert.equal(REC.lightOn(), true, 'held key repeat cannot toggle again');
  h.scenes.remove(owner);
  assert.equal(REC.lightOn(), false); assert.deepEqual(transport(), before);
  h.host.toggleTorchAction();
  assert.equal(REC.recState().spoiled, true, 'ordinary real light handling retains its recording consequence');
  assert.equal(REC.recState().spoilReason, 'you reached for the light');
});

test('rehearsal light access cannot manufacture power or a missing torch', () => {
  const h = fixture();
  h.host.openEncounterBattle('recording-2', h.encounter);
  const owner = h.host.combatRehearsalOwner;
  REC.recState().battery = 0;
  owner.key({ key: 'f', code: 'KeyF' });
  assert.equal(REC.lightOn(), false); assert.equal(REC.batteryLevel(), 0);
  REC.recState().battery = .4; h.host.itemLost = () => true;
  owner.key({ controllerAction: 'light' });
  assert.equal(REC.lightOn(), false); assert.equal(REC.batteryLevel(), .4);
});

function installCaseBoundary(h) {
  const host = h.host, noop = () => {};
  Object.assign(host, {
    setupCaseBlocksMovement, setupHandoffGuide, makeSetupHandoffScene, normalizeCombatBuild,
    setupHandoffContext: (snapshot = {}) => ({ markedRoom: 'main_b3', workingBuild: snapshot.workingBuild, atStudio: false }),
    ensureCtx: noop, bagFocus: () => null,
    makeBagScene: options => ({ id: 'bag', blocksInput: true, blocksWorld: true, options }),
  });
  for (const name of [
    'bagEquipment', 'inspectCarriedWitness', 'moveBagCombatEquipment',
    'assignBagCombatEquipmentSlot', 'reorderBagCombatEquipment', 'bagJob',
    'bagJournal', 'bagHint', 'applyCalibrationBuild', 'dispatchBagItemAction',
    'markRoom', 'markMapSpace', 'setMapTarget', 'clearMapTarget',
  ]) host[name] = noop;
  h.install(['setupHandoffBlocksMovement', 'handleSetupGuideEvent', 'holdForSetupBag', 'tickSetupHandoff', 'openBag']);
}

test('the actual case handoff opens above its rehearsal owner during a suspended real take', () => {
  const h = fixture(), before = transport(), beforeNoise = REC.currentNoise();
  installCaseBoundary(h);
  h.host.openEncounterBattle('recording-2', h.encounter);
  const owner = h.host.combatRehearsalOwner;
  assert.equal(h.save.flags[SETUP_HANDOFF.skillsCaseOpened], undefined);
  h.completeTraining();
  const hold = h.scenes.top();
  assert.equal(hold.id, 'setup-field-case', 'the world owner cannot prevent the case lesson from opening');
  assert.equal(h.save.flags[SETUP_HANDOFF.skillsCaseOpened], undefined, 'offering the case is not an actual Bag opening');
  hold.key({ key: 'b', code: 'KeyB', repeat: false });
  const bag = h.scenes.top();
  assert.equal(bag.id, 'bag', 'the real rolling state cannot reject the narrowly suspended case');
  assert.equal(h.save.flags[SETUP_HANDOFF.skillsCaseOpened], true);
  assert.equal(bag.options.getGuide({ workingBuild: h.save.combatBuild }).section, 'skills');
  assert.equal(REC.currentNoise(), beforeNoise, 'imagined case handling cannot emit real rummage noise');
  assert.deepEqual(transport(), before);
  bag.options.onGuideEvent({ type: 'section-selected', sectionId: 'skills' });
  bag.options.onGuideEvent({ type: 'continue', workingBuild: { ...h.save.combatBuild, techniques: ['afterimage'] } });
  assert.equal(h.host.finishCombatRehearsal(), false, 'the actual Bag still owns input until closed');
  bag.options.onGuideEvent({ type: 'close' }); h.scenes.remove(bag);
  assert.equal(h.scenes.top(), owner);
  h.host.tickSetupHandoff();
  assert.equal(h.host.combatRehearsalOwner, null);
  assert.equal(h.host.activeBattleId, 'recording-2');
  assert.equal(h.battles.length, 2, 'only the drill and original threat have opened');
  assert.deepEqual(transport(), before);
});

test('the rehearsal exception leaves ordinary rolling Bag refusal and modal ownership intact', () => {
  const h = fixture(), before = transport(); installCaseBoundary(h);
  h.host.openBag();
  assert.equal(h.scenes.top(), null, 'ordinary rolling cannot open Bag');
  assert.equal(h.save.flags[SETUP_HANDOFF.skillsCaseOpened], undefined);
  h.host.openEncounterBattle('recording-2', h.encounter);
  h.scenes.push({ id: 'pause', blocksInput: true, blocksWorld: true });
  h.completeTraining();
  assert.equal(h.scenes.top().id, 'pause', 'a pause above the rehearsal cannot be bypassed by the case hold');
  assert.equal(h.scenes.has('setup-field-case'), false);
  h.scenes.pop(); h.host.tickSetupHandoff();
  assert.equal(h.scenes.top().id, 'setup-field-case');
  assert.deepEqual(transport(), before);
});

test('the actual developer abort releases its drill and rehearsal owner without grants or a delayed encounter', () => {
  const h = fixture(), before = transport();
  h.host.STORY = { stopTapeHiss: () => {} };
  h.host.pushEvent = message => h.events.push({ type: 'diagnostic', message });
  h.install(['godAbortBattle']);
  h.host.openEncounterBattle('recording-2', h.encounter);
  h.host.openTrainingBattle();
  h.scenes.push({ id: 'battle:training', blocksWorld: true, exit: h.battles[0].options.onAbort });
  assert.equal(h.host.godAbortBattle(), true);
  assert.equal(h.host.deferredCombatRequest, null);
  assert.equal(h.host.combatRehearsalOwner, null);
  assert.equal(h.scenes.blocksWorld(), false, 'the abandoned lesson cannot leave the world frozen');
  assert.equal(h.save.flags['combat.trained'], undefined);
  assert.equal(h.save.combatBuild.tutorialGrant, null);
  assert.equal(h.host.finishCombatRehearsal(), false);
  assert.equal(h.host.godAbortBattle(), false, 'cleanup is idempotent');
  assert.equal(h.events.some(event => event.type === 'battle-started'), false);
  assert.deepEqual(transport(), before);
});

for (const outcome of ['win', 'lose']) {
  test(`the actual second-recording trigger spends its story event only on real start and retains its ${outcome} callback`, () => {
    const h = fixture(), before = transport(), factoryCalls = [];
    Object.assign(h.host, {
      planName: 'conservatory', recordableRoomAt: () => 'amplifications',
      RECORDING_BATTLES: { amplifications: (named, occasion) => { factoryCalls.push({ named, occasion }); return h.encounter; } },
      recordStorySpine: (id, payload) => h.events.push({ type: 'story-spine', id, ...payload }),
      injuryScareGate: { commit: () => null }, lastDefeatInjuryScare: null,
      wakeAfterDefeat: () => {}, pushEvent: () => {},
    });
    h.install(['maybeBattle']);
    h.host.maybeBattle();
    assert.deepEqual(factoryCalls, [{ named: null, occasion: 'recording-2' }]);
    assert.equal(h.host.deferredCombatRequest.id, 'recording-2');
    assert.equal(h.host.activeBattleId, null);
    assert.equal(h.events.some(event => ['story-spine', 'battle-started'].includes(event.type)), false);
    assert.deepEqual(transport(), before);
    h.host.maybeBattle();
    assert.equal(factoryCalls.length, 1, 'the blocking owner prevents a second world trigger');
    h.completeTraining(); h.closeSkills();
    assert.equal(h.host.finishCombatRehearsal(), true);
    const spine = h.events.filter(event => event.type === 'story-spine');
    assert.equal(spine.length, 1);
    assert.equal(spine[0].id, 'spine:second-recording');
    assert.equal(spine[0].roomId, 'amplifications');
    assert.equal(spine[0].payload.takeSlot, 2);
    assert.equal(spine[0].payload.origin, 'monitor-return');
    assert.equal(h.battles[1].battle, h.encounter);
    assert.deepEqual(transport(), before, 'actually opening the encounter still does not complete its take');
    h.battles[1].options[outcome === 'win' ? 'onWin' : 'onLose']({ turns: 3 });
    if (outcome === 'win') {
      assert.equal(REC.recState().takeElapsed, REC.takeDuration(), 'the actual victory retains the held-take result');
      assert.equal(REC.recState().spoiled, false);
    } else {
      assert.equal(REC.recState().spoiled, true, 'the actual loss retains the recording consequence');
      assert.equal(REC.recState().spoilReason, 'you moved');
    }
    assert.equal(h.events.filter(event => event.type === 'story-spine').length, 1);
  });
}
