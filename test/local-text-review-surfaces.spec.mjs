import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.__LOCAL_TEXT_REVIEW__ = true;
const REVIEW = await import('../src/game/local-text-review.js');
const SPEECH = await import('../src/game/speech.js');
const { createConversation } = await import('../src/game/conversation.js');
const { drawRadioScene, radioSceneLayout } = await import('../src/render/radio-scene.js');
const { drawRecorderFace, TRANSPORT } = await import('../src/render/recorder-view.js');
const { recorderFaceLayout } = await import('../src/render/recorder-instrument.js');
const { createAcademicBouncers } = await import('../src/game/academic-bouncers.js');
const { makeAcademicBouncerScene, renderAcademicBouncerSocialScene } = await import('../src/game/academic-bouncer-scene.js');
const { uiInit, uiSize } = await import('../src/render/ui.js');
const scenes = await import('../src/game/scenes.js');

// Real layout/draw functions still execute their content callbacks without a
// graphics backend. The shared UI owns the viewport and cell conversion.
const previous = new Map(['document', 'window', 'getComputedStyle'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
try {
  globalThis.document = { createElement: () => ({ style: {}, getContext: () => null }) };
  globalThis.window = { devicePixelRatio: 1, addEventListener() {} };
  globalThis.getComputedStyle = () => ({ position: 'relative' });
  uiInit({ clientWidth: 1200, clientHeight: 800, appendChild() {} });
} finally {
  for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}

let session;
test.beforeEach(() => {
  const values = new Map();
  session = REVIEW.configureLocalTextReview({location: {protocol: 'http:', hostname: '127.0.0.1'},
    storage: {getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value)}});
  REVIEW.setTextReviewEnabled(true);
  SPEECH.clearSpeech(); scenes.clear();
  SPEECH.speechInit({now: () => 0, context: () => 'hall'});
});
test.afterEach(() => { SPEECH.clearSpeech(); scenes.clear(); });

function conversation({text = 'The channel is quiet.', who = 'direction', prompt, choices} = {}) {
  const nodes = Object.freeze({start: Object.freeze({lines: Object.freeze([
    Object.freeze({who, text, ...(prompt ? {prompt} : {}), voice: false}),
  ]), ...(choices ? {choices: Object.freeze(choices.map(Object.freeze))} : {})})});
  const convo = createConversation({sceneId: 'review-surface', nodes});
  convo.start();
  return {convo, nodes};
}

test('speech review identity survives dispatch serials, separates original/context/role and never repeats a cue', () => {
  const source = Object.freeze({who: 'you', text: 'That is the landing.', voice: false, cue: 'look'});
  let cues = 0, stops = 0;
  SPEECH.speechInit({cue: () => cues++, typing: {stopTyping: () => stops++}});
  SPEECH.say(source); SPEECH.updateSpeech(.1);
  const target = SPEECH.speaking().reviewTarget, key = target.fields[0].key;
  SPEECH.textReviewSuspend();
  session.saveFields(target, {[key]: 'That is the upper landing.'});
  assert.equal(SPEECH.speaking().text, 'That is the upper landing.');
  assert.equal(cues, 1); assert.ok(stops > 0);
  assert.equal(source.text, 'That is the landing.');
  SPEECH.clearSpeech(); SPEECH.say(source); SPEECH.updateSpeech(.1);
  assert.equal(SPEECH.speaking().reviewTarget.id, target.id);
  assert.equal(SPEECH.speaking().text, 'That is the upper landing.');
  for (const line of [{...source, text: 'Another landing.'}, {...source, who: 'direction'}]) {
    SPEECH.clearSpeech(); SPEECH.say(line); SPEECH.updateSpeech(.1);
    assert.notEqual(SPEECH.speaking().reviewTarget.id, target.id);
  }
  SPEECH.clearSpeech(); SPEECH.speechInit({context: () => 'basement'});
  SPEECH.say(source); SPEECH.updateSpeech(.1);
  assert.notEqual(SPEECH.speaking().reviewTarget.id, target.id);
  session.flag(target, 'tune', 'Make the thought more precise.');
  assert.equal(session.snapshot().flags[0].target.speaker, 'you');
});

test('speech registers only painted body rows and stops registering when review is off', () => {
  SPEECH.say({who: 'you', text: 'The door is still open. '.repeat(7), voice: false});
  SPEECH.updateSpeech(.1); SPEECH.skipSpeech();
  session.beginFrame(); SPEECH.drawSpeech();
  const regions = session.regions(), target = SPEECH.speaking().reviewTarget;
  assert.ok(regions.length > 1);
  assert.ok(regions.every(region => region.target === target && region.w > 0 && region.h === 1));
  assert.equal(new Set(regions.map(region => region.y)).size, regions.length);
  REVIEW.setTextReviewEnabled(false); SPEECH.drawSpeech();
  assert.deepEqual(session.regions(), []);
});

test('direct radio rows retain real line and independent picker metadata through clipping', () => {
  const {convo, nodes} = conversation({text: 'A long spoken answer. '.repeat(90), who: 'me', prompt: 'Answer the radio.'});
  const before = JSON.stringify(nodes), picker = convo.view().pending.options[0];
  assert.equal(picker.reviewTarget.fields.length, 2);
  session.saveFields(picker.reviewTarget, {[picker.reviewTarget.fields[1].key]: 'Give an answer.'});
  let view = convo.view();
  assert.equal(view.pending.options[0].text, 'Give an answer.');
  assert.equal(view.line.text, nodes.start.lines[0].text);
  session.beginFrame(); drawRadioScene(view);
  assert.ok(session.regions().some(region => region.target.id === picker.reviewTarget.id));
  convo.key({key: 'Enter'}); convo.key({key: 'Enter'});
  view = convo.view(); const layout = radioSceneLayout(uiSize(), view);
  session.beginFrame(); drawRadioScene(view);
  const regions = session.regions();
  assert.equal(regions.length, layout.textRows);
  assert.equal(regions[0].x, layout.x); assert.equal(regions[0].y, layout.textY);
  assert.ok(regions.every(region => region.target.id === view.line.reviewTarget.id && region.w <= layout.w));
  assert.equal(JSON.stringify(nodes), before); convo.stop();
});

test('recorder guide registers the real compressed history and branch rows rather than hidden labels', () => {
  const {convo} = conversation({text: 'The first take is waiting.', choices: [{id: 'roll', text: 'Roll the tape.'}]});
  convo.update(2); convo.key({key: 'Enter'});
  const guide = convo.view(), rect = {x: 4, y: 3, w: 66, h: 21};
  assert.equal(guide.pending.kind, 'branch');
  session.beginFrame(); drawRecorderFace({rect, mode: TRANSPORT.LISTEN, guide});
  const regions = session.regions(), body = recorderFaceLayout(rect).transcriptRect;
  const expected = [guide.history[0].reviewTarget.id, guide.pending.options[0].reviewTarget.id];
  assert.deepEqual([...new Set(regions.map(region => region.target.id))].sort(), expected.sort());
  assert.ok(regions.every(region => region.h > 0 && region.h <= 1 && region.x >= body.x
    && region.x + region.w <= body.x + body.w + 1e-8 && region.y >= body.y));
  convo.stop();
});

test('bouncer dialog and social override retain review targets without changing the controller or replaying its voice', () => {
  const controller = createAcademicBouncers(), played = [], stopped = [], delivered = [];
  const scene = makeAcademicBouncerScene({controller, onLine: line => {if(line)delivered.push(line);}, createVoice: () => ({warm() {},
    start: text => {played.push(text); return {done: () => false};}, stop: () => stopped.push(true), dispose() {}})});
  scenes.push(scene);
  const view = scene.view(), target = view.currentLine.reviewTarget;
  const original = controller.view().attempt.currentLine.text;
  scene.textReviewSuspend(); scene.setSuspended(true);
  session.saveFields(target, {[target.fields[0].key]: 'The reception is still opening.'});
  scene.setSuspended(false);
  assert.equal(played.length, 1, 'editing never restarts the interrupted voice');
  assert.equal(delivered.length, 1, 'editing never refires the authored delivery hook');
  assert.equal(scene.view().currentLine.text, 'The reception is still opening.');
  assert.equal(controller.view().attempt.currentLine.text, original);
  session.beginFrame(); scene.render();
  const ids = new Set(session.regions().map(region => region.target.id));
  assert.ok(ids.has(target.id));
  for (const option of scene.view().attempt.options) assert.ok(ids.has(option.reviewTarget.id));
  const {convo} = conversation({text: 'A social reply.', who: 'me', prompt: 'Reply.'});
  session.beginFrame(); renderAcademicBouncerSocialScene(convo.view());
  assert.ok(session.regions().every(region => region.target.id === convo.view().line.reviewTarget.id));
  assert.ok(session.regions().length > 0); convo.stop();
});

test('F8 resolves each directly painted selected option ahead of other choices, active speech and old player history', () => {
  const {convo} = conversation({who: 'me', text: 'I have a question.', choices: [
    {id: 'first', text: 'Ask the first question.'}, {id: 'second', text: 'Ask the second question.'},
  ]});
  convo.key({key: 'Enter'}); convo.update(2); convo.key({key: 'Enter'});
  assert.equal(convo.view().pending.kind, 'branch');
  const draws = [view => drawRadioScene(view),
    guide => drawRecorderFace({rect: {x: 4, y: 3, w: 66, h: 21}, mode: TRANSPORT.LISTEN, guide}),
    view => renderAcademicBouncerSocialScene(view)];
  for (const draw of draws) for (const index of [1, 0]) {
    convo.selectChoice(index, {sound: false});
    const view = convo.view(); session.beginFrame(); draw(view);
    assert.equal(session.latestPlayerTarget().id, view.pending.options[index].reviewTarget.id,
      'selection wins even when an unselected option or a player history line is also painted');
  }
  convo.stop();
  const controller = createAcademicBouncers();
  const scene = makeAcademicBouncerScene({controller, createVoice: () => ({warm() {},
    start: () => ({done: () => false}), stop() {}, dispose() {}})});
  scenes.push(scene);
  for (const move of [false, true]) {
    if (move) scene.key({key: 'ArrowDown'});
    session.beginFrame(); scene.render();
    const view = scene.view();
    assert.equal(session.latestPlayerTarget().id, view.attempt.options[view.selected].reviewTarget.id);
  }
  const oldPlayer = {id: 'old-player', speaker: 'me', fields: [{key: 'old', original: 'Earlier.'}]};
  SPEECH.say({who: 'radio', text: 'The current radio line.', voice: false});
  SPEECH.updateSpeech(.1); SPEECH.skipSpeech();
  session.beginFrame(); session.register(oldPlayer, {x: 0, y: 0, w: 8, h: 1}); SPEECH.drawSpeech();
  assert.equal(session.latestPlayerTarget().id, SPEECH.speaking().reviewTarget.id);
});
