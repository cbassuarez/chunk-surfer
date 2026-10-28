import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

globalThis.__LOCAL_TEXT_REVIEW__ = true;
const REVIEW = await import('../src/game/local-text-review.js');
const { createConversation } = await import('../src/game/conversation.js');
const TRANSCRIPT = await import('../src/render/transcript.js');
const { planThoughtTextPanel } = await import('../src/game/thoughts.js');
const scenes = await import('../src/game/scenes.js');
const { uiWrap } = await import('../src/render/ui.js');
const { TYPE_GAIN, TYPE_LEVEL } = await import('../src/audio/story-audio.js');
const { freshStoryArtShotState, resolveStoryArtShot } = await import('../src/game/story-art-shot.js');

let session;
test.beforeEach(() => {
  scenes.clear();
  const storage = new Map();
  session = REVIEW.configureLocalTextReview({ location: { protocol: 'http:', hostname: '127.0.0.1' },
    storage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } });
  assert.equal(REVIEW.setTextReviewEnabled(true), true);
});
test.afterEach(() => scenes.clear());

const frozen = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
};
const edit = (target, field, value) => {
  const selected = target.fields.find(item => item.key.endsWith(`:${field}`));
  assert.ok(selected, `missing ${field} field`);
  session.saveFields(target, { [selected.key]: value });
};
// Execute complete production modules with only their external audio/drawing/
// scene boundaries supplied. No alternate conversation or layout logic lives here.
function moduleAt(file, scope, exports) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    .replace(/^import\s[\s\S]*?;\s*$/gm, '').replace(/^export /gm, '');
  return vm.runInNewContext(`${source}\n({${exports.join(',')}})`, scope);
}

test('picker and spoken text edit independently, refresh without callbacks, and retain immutable authored originals across history/reopen', () => {
  const calls = [], graph = frozen({ start: { lines: [
    { if: () => false, who: 'direction', text: 'Hidden line.' },
    { sourceId: 'document.start.line.2', who: 'me', prompt: 'Ask briefly.', text: 'The complete spoken question.', voice: false, cue: 'click' },
    { who: 'guard', text: 'A reply.', voice: false },
  ] } });
  const snapshot = JSON.stringify(graph);
  const options = { sceneId: 'review-conversation', nodes: graph, onLine: line => calls.push(['line', line.sourceId]), cue: cue => calls.push(['cue', cue]) };
  const conversation = createConversation(options);
  conversation.start();
  let view = conversation.view();
  const target = view.pending.options[0].reviewTarget;
  assert.equal(target.sourceId, 'document.start.line.2');
  assert.equal(target.authoredIndex, 1, 'identity uses the unfiltered authored slot');
  assert.equal(target.fields.length, 2);
  edit(target, 'prompt', 'A shorter picker.');
  view = conversation.view();
  assert.equal(view.pending.options[0].text, 'A shorter picker.');
  assert.equal(view.line.text, 'The complete spoken question.');
  assert.equal(view.typed, 0, 'editing a picker cannot make the unchosen line speak');
  edit(target, 'text', 'The revised full spoken question.');
  assert.deepEqual(calls, []);
  conversation.key({ key: 'Enter' });
  assert.deepEqual(calls, [['cue', 'click'], ['line', 'document.start.line.2']]);
  conversation.update(.3);
  const serial = conversation.view().lineSerial;
  edit(target, 'text', 'Another revision while the same line is active.');
  view = conversation.view();
  assert.equal(view.line.text, 'Another revision while the same line is active.');
  assert.equal(view.typed, view.line.text.length);
  assert.equal(view.lineSerial, serial);
  assert.equal(calls.length, 2, 'refresh cannot replay the authored cue or onLine hook');
  conversation.key({ key: 'Enter' });
  assert.equal(conversation.view().history[0].reviewTarget, target);
  edit(target, 'text', 'A history revision.');
  assert.equal(conversation.view().history[0].text, 'A history revision.');
  const reopened = createConversation(options); reopened.start();
  assert.equal(reopened.view().pending.options[0].text, 'A shorter picker.');
  assert.equal(reopened.view().line.text, 'A history revision.');
  assert.equal(reopened.view().line.reviewTarget.id, target.id);
  session.resetTarget(target);
  assert.equal(conversation.view().history[0].text, 'The complete spoken question.');
  assert.equal(reopened.view().pending.options[0].text, 'Ask briefly.');
  assert.equal(JSON.stringify(graph), snapshot);
  conversation.stop(); reopened.stop();
});

test('filtered branch keys and revisit-line keys stay authored and edits never choose, apply flags, or change routes', () => {
  const effects = [], graph = frozen({
    start: { lines: [{ text: 'Greeting.', voice: false }], revisitLines: [
      { if: () => false, text: 'Hidden return.' }, { text: 'Welcome back.', voice: false },
    ], choices: [
      { if: () => false, text: 'Hidden question.' },
      { text: 'Ask the question.', goto: 'answer', set: ['asked=true'], hideWhenAsked: true },
      { text: 'Stay here.', goto: 'start' },
    ] },
    answer: { lines: [{ text: 'The answer.', voice: false }], goto: 'start' },
  });
  const snapshot = JSON.stringify(graph), conversation = createConversation({ sceneId: 'review-hub', nodes: graph,
    onChoice: choice => effects.push({ goto: choice.goto, set: choice.set }) });
  conversation.start(); conversation.update(2); conversation.key({ key: 'Enter' });
  const [ask, stay] = conversation.view().pending.options;
  assert.equal(ask.reviewTarget.speaker, 'me', 'picker ownership stays local even when the node belongs to another speaker');
  assert.equal(ask.reviewTarget.authoredIndex, 1);
  assert.equal(stay.reviewTarget.authoredIndex, 2);
  edit(ask.reviewTarget, 'text', 'Ask differently.');
  assert.equal(conversation.view().pending.options[0].text, 'Ask differently.');
  assert.deepEqual(effects, []);
  conversation.key({ key: 'Enter' });
  assert.deepEqual(effects, [{ goto: 'answer', set: ['asked=true'] }]);
  conversation.update(2); conversation.key({ key: 'Enter' });
  const returned = conversation.view();
  assert.equal(returned.line.text, 'Welcome back.');
  assert.equal(returned.line.reviewTarget.collection, 'revisitLines');
  assert.equal(returned.line.reviewTarget.authoredIndex, 1);
  edit(returned.line.reviewTarget, 'text', 'A revised return.');
  assert.equal(conversation.view().line.text, 'A revised return.');
  assert.equal(effects.length, 1);
  conversation.update(2); conversation.key({ key: 'Enter' });
  assert.equal(conversation.view().pending.options.length, 1, 'the asked hidden option remains spent');
  assert.equal(conversation.view().pending.options[0].reviewTarget.id, stay.reviewTarget.id);
  assert.equal(JSON.stringify(graph), snapshot);
  conversation.stop();
});

test('an implicit say label stays separate from the spoken override and grouped history keeps each authored target', () => {
  const conversation = createConversation({ sceneId: 'implicit-prompt', nodes: { start: {
    lines: [{ who: 'me', text: 'An unprompted line.', voice: false }],
  } } });
  conversation.start();
  const target = conversation.view().line.reviewTarget;
  edit(target, 'text', 'A different spoken line.');
  assert.equal(conversation.view().pending.options[0].text, '"An unprompted line."');
  edit(target, 'prompt', 'A separately revised picker.');
  assert.equal(conversation.view().pending.options[0].text, 'A separately revised picker.');
  assert.equal(conversation.view().line.text, 'A different spoken line.');
  const earlier = { ...target, id: 'earlier' }, latest = { ...target, id: 'latest' };
  const layout = TRANSCRIPT.layoutTranscript({
    history: [{ who: 'guard', text: 'First history.', serial: 1, reviewTarget: earlier },
      { who: 'guard', text: 'Second history.', serial: 2, reviewTarget: latest }],
    line: { text: 'Active line.', reviewTarget: target }, who: 'guard', typed: 12, lineSerial: 3, lineAge: 1,
  }, { width: 60, maxRows: 20 });
  assert.equal(layout.blocks.length, 1, 'one speaker groups the three distinct authored segments');
  REVIEW.beginReviewFrame(); TRANSCRIPT.drawTranscript(layout, { x: 3, y: 4, width: 60 });
  assert.deepEqual(session.regions().map(region => region.target.id), ['earlier', 'latest', target.id]);
  assert.deepEqual(session.regions().map(region => region.active), [false, false, true]);
  conversation.stop();
});

test('review suspension stops the old voice once and resumes an edited line without reuttering or earning dwell', () => {
  const voices = [], events = [];
  const { createConversation: create } = moduleAt('../src/game/conversation.js', {
    reviewText: REVIEW.reviewText, reviewTarget: REVIEW.reviewTarget, TYPE_GAIN, TYPE_LEVEL,
    flagTest: expression => expression == null || expression === '', textCps: value => value,
    freshStoryArtShotState, resolveStoryArtShot, performance: { now: () => 1000 }, clearTimeout, setTimeout,
    isVoiced: () => true, createSamDialogVoice: () => ({ warm() {}, start(text) {
      const handle = { text, stops: 0, stop() { this.stops++; }, done: () => false, charsFor: () => 2, progress: () => .1 };
      voices.push(handle); return handle;
    } }),
  }, ['createConversation']);
  const conversation = create({ sceneId: 'voiced-review', beats: [{ sourceId: 'voiced.1', who: 'guard', text: 'An old sentence.', cue: 'click' }],
    onLine: () => events.push('line'), cue: () => events.push('cue'), onDone: () => events.push('done') });
  conversation.start(); conversation.update(.1);
  const target = conversation.view().line.reviewTarget;
  conversation.textReviewSuspend();
  assert.equal(voices[0].stops, 1);
  edit(target, 'text', 'A new sentence.');
  conversation.update(100); conversation.key({ key: 'Enter' });
  assert.equal(conversation.view().lineAge, .1);
  conversation.textReviewResume();
  assert.equal(conversation.view().line.text, 'A new sentence.');
  assert.equal(voices.length, 1);
  assert.deepEqual(events, ['cue', 'line']);
  REVIEW.setTextReviewEnabled(false);
  assert.equal(conversation.view().line.text, 'An old sentence.');
  assert.deepEqual(events, ['cue', 'line']);
  conversation.stop();
});

test('transcript hit regions follow only visible wrapped rows, selected pages, and clipped choice rows', () => {
  const target = { id: 'long-line', sceneId: 'paged', speaker: 'me', fields: [{ key: 'long:text', original: 'Long text', label: 'Text' }] };
  const text = Array.from({ length: 150 }, (_, i) => `word${i}`).join(' ');
  const view = { history: [], line: { text, reviewTarget: target }, who: 'me', typed: text.length, lineSerial: 1, lineAge: 1 };
  const page = planThoughtTextPanel({ view, width: 50, rows: 23, page: 1 });
  assert.ok(page.pages > 1); assert.equal(page.page, 1);
  REVIEW.beginReviewFrame();
  TRANSCRIPT.drawTranscript(page.transcript, { x: 5, y: 8, width: page.contentW, maxRows: 2 });
  const block = page.transcript.blocks[0], row = block.rows[0], regions = session.regions();
  assert.equal(regions.length, 1, 'a label and one body row fit; no region covers the label or other pages');
  assert.deepEqual({ x: regions[0].x, y: regions[0].y, w: regions[0].w, h: regions[0].h },
    { x: 5 + block.lane.x + row.x, y: 9, w: Math.min(row.text.length, block.lane.w - row.x), h: 1 });
  assert.equal(regions[0].target, target);
  assert.equal(regions[0].active, true);
  const choices = TRANSCRIPT.layoutTranscriptChoices({ pending: { kind: 'branch', index: 0, options: [
    { text: text, reviewTarget: target }, { text: 'Hidden below the clip.', reviewTarget: { ...target, id: 'other-choice' } },
  ] } }, 40);
  REVIEW.beginReviewFrame();
  TRANSCRIPT.drawTranscriptChoices(choices, { x: 4, y: 12, width: 40, maxRows: 2 });
  assert.equal(session.regions().length, 1);
  assert.equal(session.regions()[0].y, 13);
  assert.equal(session.regions()[0].selected, true);
  assert.equal(session.regions()[0].w, Math.min(choices.rows[1].text.length, choices.lane.w));
  assert.equal(session.hit(4 + choices.lane.x, 12), null, 'YOU / SELECT is not an editable blank-panel target');
  assert.equal(session.hit(4 + choices.lane.x, 13), target);
  REVIEW.beginReviewFrame();
  TRANSCRIPT.drawTranscript({ blocks: [{ ...block, rows: [{ ...row, text: '   ' }] }], lineAge: 1 }, { x: 5, y: 8, width: 40 });
  assert.deepEqual(session.regions(), [], 'blank rows are not selectable');
});

test('the real scene render stack removes covered text regions before an opaque modal and preserves visible overlays', () => {
  const underneath = { id: 'underneath', speaker: 'me', fields: [{ key: 'under:text', original: 'Underneath', label: 'Text' }] };
  const above = { id: 'above', speaker: 'guard', fields: [{ key: 'above:text', original: 'Above', label: 'Text' }] };
  scenes.push({ id: 'visible-dialogue', blocksInput: true, render() {
    REVIEW.registerReviewRegion(underneath, { x: 2, y: 3, w: 10, h: 1, active: true });
  } });
  scenes.push({ id: 'transparent-overlay', overlay: true, blocksInput: true, render() {} });
  REVIEW.beginReviewFrame(); scenes.render();
  assert.equal(session.hit(3, 3), underneath);
  scenes.pop();
  scenes.push({ id: 'opaque-menu', blocksInput: true, render() {} });
  REVIEW.beginReviewFrame(); scenes.render();
  assert.deepEqual(session.regions(), [], 'an opaque menu cannot leave selectable dialogue behind it');
  scenes.pop();
  scenes.push({ id: 'new-dialogue', blocksInput: true, render() {
    REVIEW.registerReviewRegion(above, { x: 4, y: 5, w: 5, h: 1, active: true });
  } });
  REVIEW.beginReviewFrame(); scenes.render();
  assert.equal(session.hit(3, 3), null);
  assert.equal(session.hit(4, 5), above);
});

test('legacy dialogue refreshes snapshotted/interpolated lines and clips review targets to actual visible choice rows without applying effects', () => {
  const draws = [], effects = [], stack = [], seen = new Map();
  let interpolations = 0;
  const scope = {
    ...REVIEW, uiWrap, uiSize: () => ({ cols: 74, rows: 30 }),
    uiText: (x, y, text) => draws.push({ x, y, text: String(text) }), uiGlyph() {}, uiScrim() {}, drawVfdText() {},
    withMachinePanel: (x, y, w, h, options, body) => body({ x: x + 3, y: y + 3, w: w - 6, h: h - 6 }),
    portrait: () => null, degrade: value => value, textCps: value => value,
    drawStoryArtCard() {}, planStoryArtSideBySide: () => ({ show: false }), planStoryArtInPanel: () => ({ show: false }),
    storyArtRows: () => 0, storyArtSideBySidePanelRows: () => 0, resolveStoryArt: () => null,
    freshStoryArtShotState, resolveStoryArtShot, promptLine: () => '',
    interpolate: text => { interpolations++; return String(text).replace('{steps}', '17'); },
    flagTest: expression => expression !== 'hidden', flagGet: key => seen.get(key),
    flagBump: key => { seen.set(key, (seen.get(key) || 0) + 1); effects.push('visit'); },
    flagApply: (set, clear) => effects.push({ set, clear }),
    scenes: { push: scene => { stack.push(scene); return scene; }, pop: () => { effects.push('pop'); return stack.pop(); } },
  };
  const api = moduleAt('../src/game/dialogue.js', scope, ['loadScript', 'startDialogue', 'dialogueInit']);
  const graph = frozen({ legacy: { speaker: 'GUARD', register: 'ironic', set: ['finished'], effects: ['effect'],
    lines: [{ if: 'hidden', text: 'Not visible.' }, { sourceId: 'legacy.line.2', text: 'Count {steps}.' }],
    choices: [{ if: 'hidden', text: 'Hidden.' }, ...Array.from({ length: 6 }, (_, i) => ({
      sourceId: `legacy.choice.${i}`, text: Array(24).fill(`choice${i}`).join(' '), aside: `aside ${i}`, set: [`picked${i}`],
    }))],
  } });
  const snapshot = JSON.stringify(graph); api.dialogueInit({ effects: effect => effects.push(effect) }); api.loadScript(graph);
  const scene = api.startDialogue('legacy'); scene.update(2);
  REVIEW.beginReviewFrame(); scene.render();
  const lineTarget = session.regions()[0].target;
  assert.equal(lineTarget.authoredIndex, 1);
  assert.equal(lineTarget.fields[0].original, 'Count 17.');
  edit(lineTarget, 'text', 'An edited count.');
  scene.textReviewSuspend(); scene.key({ key: 'Enter' }); scene.update(99); scene.textReviewResume();
  draws.length = 0; REVIEW.beginReviewFrame(); scene.render();
  assert.ok(draws.some(draw => draw.text === 'An edited count.'));
  assert.equal(interpolations, 1, 'refresh never evaluates the quoted save value again');
  assert.deepEqual(effects, []);
  scene.key({ key: 'Enter' });
  draws.length = 0; REVIEW.beginReviewFrame(); scene.render();
  const choices = session.regions();
  assert.ok(choices.length > 0);
  assert.ok(choices.every(region => region.target.sourceId !== 'legacy.choice.0' && region.target.sourceId !== 'legacy.choice.5'),
    'clipped top rows and the sixth undisplayed option have no hit region');
  for (const region of choices) assert.ok(draws.some(draw => draw.x === region.x && draw.y === region.y && draw.text.length === region.w),
    'every region matches one actual visible text/aside draw');
  const choiceTarget = choices[0].target;
  assert.equal(choiceTarget.speaker, 'me');
  edit(choiceTarget, 'text', 'A revised choice.'); edit(choiceTarget, 'aside', 'A revised aside.');
  scene.render(); assert.deepEqual(effects, []);
  scene.key({ key: 'Enter' });
  assert.equal(seen.get('__seen.legacy'), 1);
  assert.equal(effects.filter(effect => effect === 'effect').length, 1);
  const reopened = api.startDialogue('legacy'); reopened.update(2);
  draws.length = 0; REVIEW.beginReviewFrame(); reopened.render();
  assert.ok(draws.some(draw => draw.text === 'An edited count.'));
  assert.equal(JSON.stringify(graph), snapshot);
});
