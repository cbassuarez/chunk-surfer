import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as scenes from '../src/game/scenes.js';
import * as controller from '../src/game/controller.js';
import * as BINDINGS from '../src/game/bindings.js';
import { makeColdOpenScene } from '../src/game/coldopen.js';
import { ENDING_CUTSCENES } from '../src/data/endings.js';
import { createEndingCutsceneState, advanceEndingCutscene } from '../src/game/ending-cutscene.js';
import { createEndingEmbodimentState, reduceEndingEmbodiment, ENDING_FINAL_ACTION_MODE } from '../src/game/ending-embodiment.js';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const block = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `missing production block ${start}`);
  return source.slice(from, to);
};
const modalActions = new Function('modal', 'activeEndingCutscene',
  block('const modalControllerActions = (() => {', 'CONTROLLER.gamepadTick({') + ';return modalControllerActions;');

function runtime() {
  scenes.clear(); controller.controllerResetForTest();
  const spec = ENDING_CUTSCENES['tower-lost'];
  const active = { spec, state: createEndingCutsceneState(spec), embodiment: createEndingEmbodimentState('tower-lost'), startedMs: 0 };
  const draws = [], shakes = [];
  let clock = 1000;
  const factory = new Function('active', 'scenes', 'makeColdOpenScene', 'BINDINGS', 'reduceEndingEmbodiment', 'advanceEndingCutscene', 'ENDING_FINAL_ACTION_MODE', 'clock', 'draws', 'shakes', `
    let activeEndingCutscene=active;
    const performance={now:clock},ensureCtx=()=>{},STORY={},actx=null,dialogGain=null,master=null;
    const fireCue=()=>{},CR={fx:{shake:(...args)=>shakes.push(args)}},createReplayService=()=>null;
    const endingCutsceneWorldView=()=>null,applyStoryChoice=()=>{},shakeMode=()=> 'full';
    const uiSize=()=>({cols:100,rows:40}),uiText=(...args)=>draws.push(args);
    const endingCutsceneAnchors=()=>({}),px=0,py=0,escape=null;
    const applyEndingCutsceneEvents=(events)=>{for(const event of events)if(event.type==='beat')active.embodiment=reduceEndingEmbodiment(active.embodiment,event);};
    ${block('function expressTowerResistance(event){', 'function presentEndingFinalAction(')}
    ${block('function presentFinale(content,', 'function finaleHasFork()')}
    ${block('function advanceActiveEndingCutscene(input={}){', 'function applyEndingCutsceneEvents(')}
    ${block('function presentEndingFinalAction(', 'function presentEndingFinalHold(')}
    return {presentFinale,expressTowerResistance,drawTowerResistancePrompt,presentEndingCutsceneResolution};
  `);
  return { ...factory(active, scenes, makeColdOpenScene, BINDINGS, reduceEndingEmbodiment, advanceEndingCutscene, ENDING_FINAL_ACTION_MODE, () => clock, draws, shakes),
    active, draws, shakes, setTime: (value) => { clock = value; } };
}
function pad(buttons = {}) {
  return { id: 'Xbox Wireless Controller', mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 18 }, (_, index) => ({ pressed: !!buttons[index], value: buttons[index] ? 1 : 0 })) };
}
function emitPad(buttons, rt, target) {
  controller.setControllerNavigatorForTest({ getGamepads: () => [pad(buttons)] });
  const actions = [];
  controller.gamepadTick({ menuContext: true, modalActions: modalActions(target, rt.active),
    onPress: (action) => {
      actions.push(action);
      const event = action === 'recorder' ? { key: 'r', code: 'KeyR', controllerAction: action }
        : action === 'confirm' ? { key: 'Enter', code: 'Enter', controllerAction: action } : { key: '', controllerAction: action };
      target.key(event);
    } });
  return actions;
}

test('the actual finale wrapper leaves controller confirm for prose and routes RT to optional resistance', () => {
  const rt = runtime();
  try {
    rt.presentFinale([{ who: 'direction', text: 'One.' }, { who: 'direction', text: 'Two.' }], { embodied: true, cutscene: rt.active.spec });
    const scene = scenes.top();
    scene.update(1);
    assert.equal(scene.view().line.text, 'One.');
    assert.deepEqual(emitPad({ 0: true }, rt, scene), ['confirm']);
    assert.equal(scene.view().line.text, 'Two.');
    assert.equal(rt.active.resistedAtMs, undefined, 'continuing prose accidentally resisted');
    emitPad({}, rt, scene);
    assert.deepEqual(emitPad({ 7: true }, rt, scene), ['recorder']);
    assert.equal(scene.view().line.text, 'Two.', 'resistance advanced the dialogue');
    assert.equal(rt.active.embodiment.finalActionId, 'resist-eighth-strike');
    assert.equal(rt.active.resistedAtMs, 1000);
    assert.equal(rt.shakes.length, 1);
    scene.key({ key: 'e', code: 'KeyE' });
    assert.equal(rt.shakes.length, 1, 'the one optional gesture repeated');
  } finally { scenes.clear(); controller.controllerResetForTest(); }
});

test('the resistance prompt renders over dialogue, uses RT on controller, and retires after the gesture', () => {
  const rt = runtime();
  try {
    rt.presentFinale([{ who: 'direction', text: 'The bells begin.' }], { embodied: true, cutscene: rt.active.spec });
    const scene = scenes.top();
    BINDINGS.setActiveInputDevice('keyboard', { viable: true });
    scene.render();
    assert.match(rt.draws.at(-1)[2], /E.*RESIST.*OPTIONAL/);
    controller.setControllerNavigatorForTest({ getGamepads: () => [pad({ 7: true })] });
    controller.gamepadTick({ menuContext: true, modalActions: [] });
    scene.render();
    assert.ok(rt.draws.at(-1)[2].startsWith(BINDINGS.inputPrompt('recorder')));
    assert.notEqual(BINDINGS.inputPrompt('recorder'), BINDINGS.inputPrompt('confirm'));
    scene.key({ key: 'e', code: 'KeyE' });
    const count = rt.draws.length;
    scene.render();
    assert.equal(rt.draws.length, count, 'the consumed gesture prompt remained visible');
  } finally { scenes.clear(); controller.controllerResetForTest(); }
});

test('resistance submits a distinct player pose at every possession stage, then restores the authored pose', () => {
  const start = source.indexOf("if(id==='tower-lost'){");
  const from = source.indexOf('const poses=', start);
  const end = source.indexOf("add(endingPropInstance('tower-lost-surfer'", from);
  assert.ok(from > start && end > from);
  const poses = source.slice(from, end);
  const deviation = block('const resistingPose=', "add(endingPropInstance('tower-lost-player'");
  const choose = new Function('embodied', 'active', 'performance', poses + deviation + ';return {pose,playerPose};');
  for (let syncStage = 0; syncStage <= 8; syncStage += 1) {
    const resisting = choose({ syncStage }, { resistedAtMs: 1000 }, { now: () => 1200 });
    assert.notEqual(resisting.playerPose, resisting.pose, `strike ${syncStage} did not deviate`);
    const settled = choose({ syncStage }, { resistedAtMs: 1000 }, { now: () => 1800 });
    assert.equal(settled.playerPose, settled.pose);
  }
});

test('the actual resolution scene completes the peal without E or a controller gesture', () => {
  const rt = runtime();
  try {
    let completed = 0;
    rt.presentEndingCutsceneResolution({ id: 'tower-lost', cutscene: rt.active.spec }, () => { completed += 1; });
    assert.equal(scenes.top().id, 'ending-resolution:tower-lost');
    assert.deepEqual(modalActions(scenes.top(), rt.active), ['recorder']);
    rt.setTime(10000);
    scenes.update(.1);
    assert.equal(rt.active.state.complete, true);
    assert.equal(rt.active.state.fired.length, 8);
    assert.equal(rt.active.resistedAtMs, undefined);
    assert.equal(completed, 1);
    assert.equal(scenes.depth(), 0, 'the optional action opened a blocking hold');
    scenes.update(1);
    assert.equal(completed, 1);
  } finally { scenes.clear(); controller.controllerResetForTest(); }
});
