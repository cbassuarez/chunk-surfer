// node --experimental-vm-modules test/conversation-vfd-choices.test.mjs
// Set CONVERSATION_SOURCE_ROOT to test a source-only visual prototype.
// Production layout/rendering is exercised with only browser drawing sinks mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = process.env.CONVERSATION_SOURCE_ROOT || fileURLToPath(new URL('../src/', import.meta.url));
const nothing = () => {};
const plain = value => JSON.parse(JSON.stringify(value));
const wrap = (value, width) => {
  const lines = [], words = String(value).split(/\s+/); let line = '';
  for (const word of words) {
    if (line && line.length + word.length + 1 > width) { lines.push(line); line = ''; }
    line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
};

async function fixture({ cols = 120, rows = 40, body = { x: 4, y: 4, w: 44, h: 9 } } = {}) {
  const state = { text: [], recorderText: [], review: [], fills: [], caps: 0, physicalRadio: 0, instruments: 0 };
  const context = vm.createContext({ console, performance: { now: () => 1000 } });
  const mocks = new Map(), loaded = new Map();
  const mock = (relative, exports) => mocks.set(path.join(root, relative), exports);
  const text = (x, y, value, role, alpha = 1) => state.text.push({ x, y, value: String(value), role, alpha });
  const canvas = { save: nothing, restore: nothing, beginPath: nothing, rect: nothing, clip: nothing,
    fillRect: nothing, createLinearGradient: () => ({ addColorStop: nothing }) };
  mock('render/ui.js', { uiText: text, uiItalicText: text, uiGlyph: text, uiWrap: wrap,
    uiSize: () => ({ cols, rows }), uiScrim: nothing,
    uiFill: (x, y, w, h, color) => state.fills.push({ x, y, w, h, color }),
    uiDraw: draw => draw({ ctx: canvas, dpr: 1, cellW: 8, cellH: 20 }),
    uiCellMetrics: () => ({ cellW: 8, cellH: 20 }), uiCurrentScale: () => 1 });
  mock('render/presentation.js', { drawLampButton: () => { state.caps++; return {}; } });
  mock('narrative/obscured-name.js', { obscuredGlyphAt: () => '', obscuredShape: () => null });
  mock('game/access.js', { visualEffectsEnabled: () => false });
  mock('game/local-text-review.js', {
    registerReviewRegion: (target, rectangle) => state.review.push({ target, ...rectangle }),
  });
  mock('render/radio-contact-performance.js', { RADIO_DESK_CHANNEL: 2, radioContactFrame: () => ({ dead: false }) });
  mock('render/radio-contact-3d.js', {
    drawRadioContact3D: () => { state.physicalRadio++; return true; },
    radioContact3DDiagnostics: () => ({}),
    radioContactControlRects: ({ width, height }) => ({ ptt: {
      x: width * .7, y: height * .4, w: 15, h: 20,
      center: { x: width * .7 + 7.5, y: height * .4 + 10 },
    } }),
  });
  mock('game/bindings.js', { promptLine: parts => parts.map(p => typeof p === 'string' ? p : `[${p.action}] ${p.label || ''}`).join(' · ') });
  mock('render/recorder-instrument.js', {
    drawRecorderInstrument: (view, { drawContent } = {}) => {
      state.instruments++; drawContent?.({ body, transcriptRect: body }); return body;
    },
    recorderFaceLayout: () => ({ body, transcriptRect: body, buttonSlots: [] }),
    recorderDisplayPalette: () => ({}), drawRecorderCheckMeter: nothing,
    drawRecorderDisplayText: (x, y, value, options) => state.recorderText.push({ x, y, value, ...options }),
  });
  mock('render/dual-trace-display.js', { drawTraceVfdText: nothing });
  mock('render/palette.js', { uiBrightness: () => 1 });
  async function load(filename) {
    if (loaded.has(filename)) return loaded.get(filename);
    if (mocks.has(filename)) {
      const values = mocks.get(filename);
      const module = new vm.SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      }, { context, identifier: filename });
      loaded.set(filename, module); return module;
    }
    const module = new vm.SourceTextModule(await readFile(filename, 'utf8'), { context, identifier: filename });
    loaded.set(filename, module);
    await module.link((specifier, owner) => load(path.resolve(path.dirname(owner.identifier), specifier)));
    return module;
  }
  async function evaluate(relative) {
    const module = await load(path.join(root, relative));
    if (module.status !== 'evaluated') await module.evaluate();
    return module.namespace;
  }
  const transcript = await evaluate('render/transcript.js');
  return { state, transcript, body, evaluate };
}

const view = (options, index = 0, spent = () => false) => ({ pending: { kind: 'branch', options, index }, spent });
const response = (text, extra = {}) => ({ text, ...extra });
function draw(f, choices, width = 44) {
  f.transcript.drawTranscriptChoices(choices, { x: 10, y: 5, width });
  return f.state.text;
}
function layout(f, current, width = 44) {
  return f.transcript.layoutTranscriptChoices(current, width, { lane: { x: 0, w: width, align: 'left' } });
}

test('generic choices use electronic numbers, caret and archive mark without hardware caps', async () => {
  const f = await fixture();
  const current = view([response('First reply'), response('Selected reply', { archiveSignal: true })], 1);
  const choices = layout(f, current), before = plain(choices);
  draw(f, choices);
  assert.equal(f.state.caps, 0);
  assert.deepEqual(plain(choices), before, 'rendering cannot mutate choice state or layout');
  const number = f.state.text.find(item => item.value === '2');
  const caret = f.state.text.find(item => item.value === '▸');
  const archive = f.state.text.find(item => item.value === '◆');
  const prose = f.state.text.find(item => item.value === 'Selected reply');
  assert.equal(caret.x, 10); assert.equal(number.x, 12); assert.equal(archive.x, 13); assert.equal(prose.x, 15);
  assert.equal(number.y, prose.y); assert.equal(caret.y, prose.y); assert.equal(archive.y, prose.y);
  assert.equal(number.role, 'ui-amber'); assert.equal(number.alpha, 1);
  assert.equal(archive.role, 'ui-blue'); assert.equal(archive.alpha, .9);
});

test('selected, spent and archive responses retain their existing emphasis', async () => {
  const f = await fixture();
  const options = [response('Selected spent'), response('Spent'), response('Archive', { archiveSignal: true }), response('Normal')];
  draw(f, layout(f, view(options, 0, item => options.indexOf(item) < 2)));
  for (const [value, role, alpha] of [
    ['Selected spent', 'ui-amber', 1], ['Spent', 'ui-secondary', .48], ['Archive', 'ui-blue', .9], ['Normal', 'ui-primary', .82],
    ['1', 'ui-amber', 1], ['2', 'ui-secondary', .48], ['3', 'ui-blue', .9], ['4', 'ui-primary', .82],
  ]) {
    const drawn = f.state.text.find(item => item.value === value);
    assert.equal(drawn?.role, role); assert.equal(drawn?.alpha, alpha);
  }
});

test('ordinary recorder row formatting, wrapped continuation spacing and tags remain exact', async () => {
  const f = await fixture();
  const options = Array.from({ length: 12 }, (_, index) => response(`Response ${index + 1} has several words to wrap`, {
    archiveSignal: index === 9, tag: index === 9 ? 'hearing' : undefined,
  }));
  const choices = layout(f, view(options, 9), 24);
  assert(choices.rows.some(row => row.kind === 'choice' && !row.firstLine));
  for (const row of choices.rows) assert.equal(f.transcript.transcriptChoiceText(row), row.text);
  const tagged = choices.rows.find(row => row.choiceIndex === 9 && row.firstLine);
  assert(tagged.text.startsWith('▸ 10◆ [HEARING]'));
  assert(choices.rows.filter(row => row.kind === 'choice').every(row => row.text.length <= 24));
});

for (const capacity of [1, 4]) {
  test(`a scrolled long response retains its identifier at capacity ${capacity}`, async () => {
    const f = await fixture();
    const options = [response('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty',
      { archiveSignal: true, reviewTarget: { id: 'long-reply' } })];
    const choices = layout(f, view(options), 20);
    const fitted = f.transcript.fitTranscriptChoices(choices, capacity, { selectedOffset: 2 });
    assert.equal(fitted.selectedOffset, 2);
    const first = fitted.rows.find(row => row.kind === 'choice');
    assert.equal(first.firstLine, true);
    assert(first.text.startsWith('     '), 'fixture begins on a source continuation row');
    assert.equal(f.transcript.transcriptChoiceText(first), `▸ 1◆ ${first.bodyText}`);
    draw(f, fitted, 20);
    assert.equal(f.state.text.filter(item => item.value === '1').length, 1);
    assert.equal(f.state.text.filter(item => item.value === '▸').length, 1);
    assert.equal(f.state.text.filter(item => item.value === '◆').length, 1);
    assert.equal(f.state.text.find(item => item.value === first.bodyText)?.x, 15);
    assert(f.state.review.every(item => item.x === 10 && item.w <= 20 && item.target.id === 'long-reply'));
  });
}

for (const count of [10, 100]) {
  test(`${count} numbered choices fit the cursor, number and marker without overlapping prose`, async () => {
    const f = await fixture();
    const options = Array.from({ length: count }, (_, index) => response(`response-${index + 1}`, { archiveSignal: index === count - 1 }));
    const choices = f.transcript.fitTranscriptChoices(layout(f, view(options, count - 1)), 3);
    draw(f, choices);
    const gutter = count < 100 ? 5 : 6;
    const number = f.state.text.find(item => item.value === String(count));
    const archive = f.state.text.find(item => item.value === '◆');
    const prose = f.state.text.find(item => item.value === `response-${count}`);
    assert.equal(number.x, 11); assert.equal(archive.x, 10 + gutter - 2); assert.equal(prose.x, 10 + gutter);
    assert(number.x + number.value.length <= archive.x);
    assert(choices.rows.filter(row => row.kind === 'choice').every(row => row.gutterWidth === gutter));
  });
}

test('a long single-digit reply in a 100-option bank loses no letters and its review bounds cover every glyph', async () => {
  const f = await fixture(), width = 20;
  const original = 'Every last word survives. Nothing is lost.';
  const options = Array.from({ length: 100 }, (_, index) => response(index ? `Option ${index + 1}` : original,
    index ? {} : { reviewTarget: { id: 'long-first-reply' } }));
  const choices = layout(f, view(options), width);
  const firstRows = choices.rows.filter(row => row.choiceIndex === 0);
  assert(firstRows.length > 1);
  assert.equal(firstRows.map(row => row.bodyText).join(' '), original);
  assert(firstRows.every(row => row.bodyText.length <= width - 6));
  draw(f, choices, width);
  choices.rows.forEach((row, index) => {
    if (row.choiceIndex !== 0) return;
    const y = 5 + index;
    const body = f.state.text.find(item => item.x === 16 && item.y === y);
    assert.equal(body?.value, row.bodyText, 'the renderer must retain the complete wrapped row');
    const review = f.state.review.find(item => item.y === y && item.target.id === 'long-first-reply');
    assert(review.x + review.w >= body.x + body.value.length, 'the last glyph remains editable');
    assert(review.x + review.w <= 10 + width, 'the review region stays within the lane');
  });
});

test('the recorder renders normal guide rows unchanged and restores a scrolled identifier', async () => {
  const f = await fixture(), recorder = await f.evaluate('render/recorder-view.js');
  let guide = view([response('What am I recording?'), response('Set the levels')], 1);
  let choices = recorder.recorderGuideLayout(f.body, guide).choices;
  recorder.drawRecorderFace({ rect: f.body, mode: recorder.TRANSPORT.LISTEN, guide });
  assert.deepEqual(f.state.recorderText.map(item => item.value), Array.from(choices.rows, row => row.text));
  assert.equal(f.state.caps, 0);
  f.state.recorderText = [];
  guide = { ...view([response(Array.from({ length: 85 }, (_, i) => `word${i}`).join(' '), { archiveSignal: true })]), choiceScrollOffset: 2 };
  choices = recorder.recorderGuideLayout(f.body, guide).choices;
  const first = choices.rows.find(row => row.kind === 'choice');
  assert.equal(choices.selectedOffset, 2);
  recorder.drawRecorderFace({ rect: f.body, mode: recorder.TRANSPORT.LISTEN, guide });
  assert(f.state.recorderText.some(item => item.value === `▸ 1◆ ${first.bodyText}`));
  assert.equal(f.state.instruments, 2, 'the recorder still owns the physical chassis and transport');
});

function radioView(extra = {}) {
  return { ...view([response('First reply'), response('Keep the contact still', { archiveSignal: true })], 1),
    who: 'radio', line: { text: 'Can you hear me?' }, typed: 100,
    radio: { ready: true, contact: false, instrument: { channel: 2 }, ...extra } };
}

test('radio reply numbers share the text baseline and preserve physical controls and response rectangles', async () => {
  const f = await fixture(), radio = await f.evaluate('render/radio-scene.js'), current = radioView();
  const before = radio.radioSceneLayout({ cols: 120, rows: 40 }, current);
  assert(before.controls.ptt);
  radio.drawRadioScene(current);
  assert.deepEqual(plain(radio.radioSceneLayout({ cols: 120, rows: 40 }, current)), plain(before));
  assert.equal(f.state.caps, 0); assert.equal(f.state.physicalRadio, 1);
  const selected = before.choices[1];
  const number = f.state.text.find(item => item.value === '2');
  const caret = f.state.text.find(item => item.value === '▸');
  const prose = f.state.text.find(item => item.value.includes('Keep the contact still'));
  assert.equal(caret.x, selected.x); assert.equal(number.x, selected.x + 2); assert.equal(prose.x, selected.x + 4);
  assert.equal(number.y, selected.y + .1); assert.equal(prose.y, number.y);
  assert.equal(number.alpha, 1); assert.equal(number.role, 'ui-amber');
});

test('radio inactive selection remains visible without suggesting an enabled action', async () => {
  const f = await fixture(), radio = await f.evaluate('render/radio-scene.js');
  radio.drawRadioScene(radioView({ instrument: { channel: 3 } }));
  assert.equal(f.state.text.find(item => item.value === '2')?.alpha, .48);
  assert.equal(f.state.text.find(item => item.value === '▸')?.alpha, .48);
  assert.equal(f.state.caps, 0);
});

test('radio contact retains its hold-to-transmit instructions and original progress geometry', async () => {
  const f = await fixture(), radio = await f.evaluate('render/radio-scene.js');
  const current = radioView({ contact: true, hold: .325, holdDuration: .65 });
  const selected = radio.radioSceneLayout({ cols: 120, rows: 40 }, current).choices[1];
  radio.drawRadioScene(current);
  assert(radio.radioChoiceFooter(current).includes('HOLD TO TRANSMIT'));
  assert(radio.radioChoiceFooter(current).includes('1–2 SELECT'));
  const progress = f.state.fills.find(item => item.color === '#d8b36c');
  assert.equal(progress.x, selected.x + 4); assert.equal(progress.y, selected.y + selected.h - .14);
  assert.equal(progress.w, (selected.w - 4) * .5);
});
