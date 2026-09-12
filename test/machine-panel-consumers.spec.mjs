import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { machinePanelAperture, machinePanelBody } from '../src/render/presentation.js';

const gameSource = (file) => readFileSync(new URL(`../src/game/${file}.js`, import.meta.url), 'utf8');
const consumers = {
  'achievement-notice': 1, archive: 1, 'bell-peal-scene': 1, 'beta-notice': 1,
  coldopen: 2, 'controller-settings': 1, dialogue: 1, 'difficulty-select': 1,
  'eula-scene': 1, 'god-menu': 1, 'hush-audio-lab': 1, 'hush-run': 5,
  pause: 1, 'progression-lab': 1, 'return-index': 1, 'return-report': 2,
  settings: 1, 'setup-handoff-scene': 2, 'source-contact-scene': 1,
  speech: 1, 'story-art-preview': 1, thoughts: 1, title: 1, 'transfer-room': 1, warning: 1,
};

function factory(file, name, globals) {
  const source = gameSource(file);
  const start = source.indexOf(`export function ${name}(`);
  const close = source.slice(start).match(/\n}(?:\r?\n|$)/);
  const end = close ? start + close.index + 2 : -1;
  assert.ok(start >= 0 && end > start, `${file} exposes ${name}`);
  return runInNewContext(`(${source.slice(start, end).replace(/^export /, '')})`, globals);
}

// The renderer's optical-stack tests exercise real clipping/material layers.
// These presenter tests prove the actual content is submitted inside that
// scope, and that synchronous callback completion preserves input geometry.
function surfaceHarness(extra = {}) {
  const events = [], panels = [], lamps = [];
  let depth = 0;
  const electronic = (kind) => (...args) => {
    assert.equal(depth, 1, `${kind} must be behind the front cover`);
    events.push({ kind, args });
  };
  const outer = (kind) => (...args) => {
    assert.equal(depth, 0, `${kind} must not be clipped to the display`);
    events.push({ kind, args });
  };
  const globals = {
    uiSize: () => ({ cols: 112, rows: 48 }),
    uiWrap: (text) => [String(text)],
    uiText: electronic('text'), uiLine: electronic('line'),
    drawVfdText: electronic('vfd'),
    uiFill: outer('fill'), uiScrim: outer('scrim'),
    inputPrompt: (action) => action.toUpperCase(),
    promptLine: (parts) => parts.map((part) => part.label).join(' / '),
    UI_COLOR: { glass: '#030503', amber: '#d9ab73', frame: '#555', primary: '#bfd2bc' },
    withMachinePanel(x, y, w, h, options, drawContent) {
      assert.equal(depth, 0, 'one presenter may not start a second display inside its first');
      assert.equal(typeof drawContent, 'function');
      const body = machinePanelBody(x, y, w, h, { footer: options.footer || options.footerParts?.length ? 'CONTROLS' : '' });
      panels.push({ x, y, w, h, options, body });
      events.push({ kind: 'back' });
      depth++;
      try { drawContent(body); }
      finally { depth--; events.push({ kind: 'cover' }); }
      return body;
    },
    drawLampButton(...args) {
      assert.equal(depth, 0, 'the handoff button is physical hardware, not a display pixel');
      assert.equal(events.at(-1)?.kind, 'cover');
      lamps.push(args);
      events.push({ kind: 'lamp' });
    },
    ...extra,
  };
  return { events, panels, lamps, globals, electronic };
}

function assertTextFitsWell(harness) {
  assert.equal(harness.panels.length, 1);
  const { x, y, w, h } = harness.panels[0];
  const aperture = machinePanelAperture(x, y, w, h);
  for (const event of harness.events.filter((entry) => entry.kind === 'text')) {
    const [tx, ty, text] = event.args;
    assert.ok(tx >= aperture.x && tx + String(text).length <= aperture.x + aperture.w, `full line fits well width: ${text}`);
    assert.ok(ty >= aperture.y && ty + 1 <= aperture.y + aperture.h, `full glyph row clears well lip: ${text}`);
  }
}

test('all 32 scoped electronic panels submit their body through the optical callback', () => {
  let count = 0;
  for (const [file, expected] of Object.entries(consumers)) {
    const source = gameSource(file);
    assert.match(source, /import\s*\{[^}]*\bwithMachinePanel\b[^}]*\}\s*from ['"]\.\.\/render\/presentation\.js['"]/, file);
    assert.doesNotMatch(source, /\bdrawMachinePanel\s*\(/, `${file} cannot paint its content after a completed cover`);
    const calls = [...source.matchAll(/\bwithMachinePanel\s*\(/g)].length;
    assert.equal(calls, expected, file);
    count += calls;
  }
  assert.equal(count, 32);
  assert.doesNotMatch(gameSource('document'), /\bwithMachinePanel\s*\(/, 'physical documents remain paper rather than electronic displays');
});

test('setup text is covered once and the physical OPEN button retains its exact pointer target', () => {
  const h = surfaceHarness();
  const make = factory('setup-handoff-scene', 'makeSetupHandoffScene', h.globals);
  let opens = 0;
  const scene = make({ cables: 2, onOpen: () => opens++ });
  scene.render();
  assert.deepEqual(h.events.map((event) => event.kind), ['scrim', 'back', 'text', 'text', 'cover', 'lamp']);
  assert.match(h.events.find((event) => event.kind === 'text').args[2], /2 spare leads/);
  const [x, y, w, height, options] = h.lamps[0];
  const body = h.panels[0].body;
  assert.deepEqual([x, y, w, height], [body.x, body.y + 4.5, Math.min(30, body.w), 2.5]);
  assert.equal(options.latched, false);
  scene.pointer({ type: 'pointermove', cellX: x + 1, cellY: y + 1 });
  scene.pointer({ type: 'pointerdown', button: 2, cellX: x + 1, cellY: y + 1 });
  scene.pointer({ type: 'pointerdown', button: 0, cellX: x - 1, cellY: y + 1 });
  assert.equal(opens, 0);
  scene.pointer({ type: 'pointerdown', button: 0, cellX: x + 1, cellY: y + 1 });
  scene.key({ key: 'Enter' });
  assert.equal(opens, 1);
});

test('real recorder hold readout is covered without substituting scene time or painting after exit', () => {
  const h = surfaceHarness();
  let value = { recording: true, takeElapsed: 4.5 }, ready = 0;
  const make = factory('setup-handoff-scene', 'makeSetupLevelHoldScene', h.globals);
  const scene = make({ getReading: () => value, requiredSeconds: 6, onReady: () => ready++ });
  scene.render();
  assert.deepEqual(h.events.map((event) => event.kind), ['back', 'text', 'cover']);
  assert.match(h.events[1].args[2], /4\.5 \/ 6\.0 s/);
  assertTextFitsWell(h);
  scene.update(1000);
  assert.equal(ready, 0);
  value = { recording: true, takeElapsed: 6 };
  scene.update(0);
  assert.equal(ready, 1);
  scene.exit();
  const before = h.events.length;
  scene.render();
  assert.equal(h.events.length, before);
});

test('tiny achievement and tutorial readouts retain every glyph inside the real aperture at normal and compact sizes', () => {
  for (const size of [{ cols: 112, rows: 48 }, { cols: 64, rows: 32 }]) {
    const h = surfaceHarness({
      uiSize: () => size, uiWrap: (text) => String(text).split('\n'),
      resolveNotice: () => ({ title: 'Listening', body: 'First line.\nSecond line.\nThird line.' }),
    });
    const scene = factory('achievement-notice', 'makeAchievementNoticeScene', h.globals)({ notice: { id: 'test' } });
    scene.render();
    assert.equal(h.events.filter((entry) => entry.kind === 'text').length, 4);
    assert.equal(h.panels[0].h, 13);
    assertTextFitsWell(h);

    const hold = surfaceHarness({ uiSize: () => size });
    factory('setup-handoff-scene', 'makeSetupLevelHoldScene', hold.globals)({ getReading: () => ({ recording: true, takeElapsed: 4.5 }) }).render();
    assert.equal(hold.panels[0].h, 8);
    assertTextFitsWell(hold);
  }
});

test('Source dialogue early return still closes the cover and does not resolve a choice', () => {
  let pops = 0, outcomes = [];
  const h = surfaceHarness({ scenes: { pop: () => pops++ } });
  const make = factory('source-contact-scene', 'makeSourceContactScene', h.globals);
  const scene = make({
    encounter: { id: 'material-test', lines: [{ who: 'surfer', text: 'A live line.' }], choices: [{ id: 'listen', text: 'Listen.', aligns: true }], insightId: 'listen' },
    onResolve: (...args) => outcomes.push(args),
  });
  scene.render();
  assert.deepEqual(h.events.map((event) => event.kind), ['scrim', 'back', 'text', 'cover']);
  assert.equal(outcomes.length, 0);
  scene.key({ key: 'Enter' });
  scene.render();
  assert.equal(h.events.at(-1).kind, 'cover');
  assert.equal(h.events.filter((event) => event.kind === 'cover').length, 2);
  assert.equal(h.events.filter((event) => event.kind === 'text').length, 3);
  scene.key({ key: 'Enter' });
  scene.key({ key: 'Enter' });
  assert.equal(pops, 1);
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0][0], 'listen');
  assert.equal(outcomes[0][1].aligned, true);
});

test('empty Archive and empty history keep all explanatory text inside the cover', () => {
  const h = surfaceHarness({
    achievementEntries: () => [], returnFileEntries: () => [],
    CATEGORY_ORDER: ['work'], CATEGORY_LABEL: { work: 'STORY' },
    AUDIO: { menuMove() {}, menuPage() {}, menuBack() {} },
  });
  const scene = factory('archive', 'makeArchiveScene', h.globals)();
  scene.render();
  assert.equal(h.events.at(-1).kind, 'cover');
  assert.ok(h.events.some((event) => event.args?.[2] === 'NO ENTRIES IN THIS CATEGORY'));
  scene.key({ key: 'Tab' });
  scene.render();
  assert.equal(h.panels.length, 2);
  assert.equal(h.events.at(-1).kind, 'cover');
  assert.ok(h.events.some((event) => event.args?.[2] === 'NO COMPLETED RUNS'));
});

test('speech text and typing cursor share one covered surface with unchanged placement', () => {
  const h = surfaceHarness({ cur: { who: 'you', text: 'Testing speech.' }, typed: 7, BAND_W: 78, WHO: { you: { tag: 'YOU', cls: 'ui-primary', alpha: 1 } } });
  factory('speech', 'drawSpeech', h.globals)();
  assert.deepEqual(h.events.map((event) => event.kind), ['back', 'text', 'text', 'cover']);
  const body = h.panels[0].body;
  assert.equal(h.events[1].args[2], 'Testing');
  assert.equal(h.events[2].args[2], '▌');
  assert.deepEqual(h.events[1].args.slice(0, 2), [body.x + 1, body.y - 1]);
  assert.deepEqual(h.events[2].args.slice(0, 2), [body.x + 8, body.y - 1]);
});

test('opening transcript normal and side-by-side branches paint behind one cover without glazing the world', () => {
  for (const sideBySide of [false, true]) {
    const h = surfaceHarness({
      PANEL: { padX: 2, headerRows: 2, footerRows: 2 }, COL_W: 86, KEEP: 12,
      createConversation: () => ({ view: () => ({ who: 'guard', speaker: 'GUARD', art: sideBySide ? 'test' : null }) }),
      resolveStoryArt: (value) => value ? { mode: 'compact' } : null,
      storyArtSideBySidePanelRows: () => 25,
      transcriptSource: () => 'GUARD',
      layoutTranscript: () => ({ height: 3 }),
      layoutTranscriptChoices: () => ({ height: 2 }),
      planStoryArtSideBySide: () => ({ show: sideBySide, artCols: 24, textCols: 36, gap: 2, rows: 20 }),
      planStoryArtInPanel: () => ({ show: false }),
      fixedTranscriptLanes: () => ({ right: { x: 26, w: 36 } }),
      storyArtSideBySideTextLayout: () => ({ transcriptRows: 10, choicesOffset: 12, choicesRows: 2 }),
    });
    h.globals.drawTranscriptHeader = (geometry) => { h.electronic('transcript-header')(geometry); return { y: geometry.y + 1, rows: 1 }; };
    h.globals.drawTranscript = h.electronic('transcript');
    h.globals.drawTranscriptChoices = h.electronic('choices');
    h.globals.drawStoryArtCard = h.electronic('story-art');
    const scene = factory('coldopen', 'makeColdOpenScene', h.globals)({ presentation: 'monitor' });
    scene.render();
    assert.equal(h.events[0].kind, 'fill');
    assert.equal(h.events.at(-1).kind, 'cover');
    assert.equal(h.panels.length, 1);
    assert.equal(h.events.filter((event) => event.kind === 'transcript').length, 1);
    assert.equal(h.events.filter((event) => event.kind === 'choices').length, 1);
    assert.equal(h.events.filter((event) => event.kind === 'story-art').length, Number(sideBySide));
  }
});

test('PROGRAM display does not capture the preceding world iris and keeps its authored timing', () => {
  let restored = 0, pops = 0, completed = 0;
  const h = surfaceHarness({ scenes: { pop: () => pops++ } });
  const scene = factory('coldopen', 'makeWorldTitleScene', h.globals)({
    turn: 1, iris: 1, duration: 12,
    camera: { pose: () => ({ yaw: .5 }), turn() {}, restore: () => restored++ },
    onDone: () => completed++,
  });
  scene.enter();
  scene.update(1.5);
  scene.render();
  assert.equal(h.panels.length, 0);
  assert.equal(h.events.length, 4);
  assert.ok(h.events.every((event) => event.kind === 'fill'));
  scene.update(.5);
  scene.render();
  assert.equal(h.panels.length, 1);
  assert.equal(h.panels[0].options.label, 'PROGRAM');
  assert.deepEqual(h.events.slice(-5).map((event) => event.kind), ['back', 'vfd', 'text', 'text', 'cover']);
  assert.equal(completed, 0);
  scene.key({ key: 'Enter' });
  assert.equal(completed, 0);
  scene.update(12);
  assert.equal(completed, 1);
  assert.equal(pops, 1);
  assert.equal(restored, 1);
});
