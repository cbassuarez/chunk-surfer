import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as scenes from '../src/game/scenes.js';
import { makeReturnReportScene, returnAccountLines } from '../src/game/return-report.js';
import { makeCreditsScene } from '../src/game/credits.js';
import { drawReturnExposure, returnExposureIdentity, returnExposureLayout } from '../src/render/outcome-return-view.js';
import { uiWrap } from '../src/render/ui.js';
import { freshMeta } from '../src/progression/schema.js';
import { withTransientGameState } from '../src/game/save.js';

const summary = (endingId = 'tower-lost', extra = {}) => ({
  id: 'return:last-exposure-test', runId: 'last-exposure-test', endingId,
  completedAt: 1000, startedAt: 0, durationSeconds: 100,
  rules: { startedPreset: 'contract' }, integrity: {},
  takes: { completed: 2, spoiled: 1, rooms: ['main_b3', 'the_tub'], contaminated: [], unfinishedRooms: ['amplifications'] },
  injuries: 2, disclosures: { found: 1 }, documents: { read: 3 },
  equipment: { issued: 4, returned: 3, missing: ['recorder'] },
  unlockedAchievements: [], newlyUnlockedFeatures: [], endingsAtCompletion: 1,
  ...extra,
});
const press = (scene, key) => { scene.key({ key, repeat: false }); scene.keyup?.({ key }); };
const withState = async (runSummary, fn) => withTransientGameState({ meta: {
  ...freshMeta(),
  returns: { records: { [runSummary.id]: runSummary }, history: [runSummary.id] },
  presentation: { pendingReports: [runSummary.id] },
} }, async (scope) => {
  scenes.clear();
  try { return await fn(scope); } finally { scenes.clear(); }
});

test('all nine endings and Century Stay retain their full identities without treating victory as survival', () => {
  const titles = {
    sacrifice: 'THE SEAL', helped: 'HE TRIED TO HELP', inversion: 'THE OTHER DOOR',
    drugged: 'COLD, BITTER, GONE', surfaced: 'THE OTHER RECORDIST',
    'contact-won': 'OPEN CHANNEL', 'contact-lost': 'NO RETURN',
    'tower-won': 'EXIT THROUGH THE GIFT SHOP', 'tower-lost': 'THE FULL PEAL',
  };
  for (const [id, title] of Object.entries(titles)) {
    const view = returnExposureIdentity(summary(id), 'saved');
    assert.equal(view.endingTitle, title);
    assert.equal(view.title, ['contact-lost', 'tower-lost'].includes(id) ? 'GAME OVER' : 'THE END');
    assert.equal(view.state, ['contact-lost', 'tower-lost'].includes(id) ? 'GAME OVER' : 'THE END');
    assert.equal(view.save, 'PROGRESS SAVED');
  }
  assert.match(returnExposureIdentity(summary('contact-won')).residue, /did not survive/);
  const century = returnExposureIdentity(summary('sacrifice', { endingVariant: 'century-stay' }));
  assert.equal(century.endingTitle, 'A HUNDRED MORE YEARS');
  assert.equal(century.title, 'THE END');
  assert.match(century.residue, /stayed for one hundred years/);
  assert.equal(century.state, 'THE END');
  assert.doesNotMatch(century.residue, /demolished|collapsed/);
  assert.equal(returnExposureIdentity(summary(), 'failed').save, 'PROGRESS COULD NOT BE SAVED');
  assert.equal(returnExposureIdentity(summary(), 'unknown').save, '');
});

test('GAME OVER follows actual failure while completed branches keep THE END even when the player dies', () => {
  for (const id of ['sacrifice', 'helped']) {
    assert.equal(returnExposureIdentity(summary(id, { endingArrival: 'agreed' })).state, 'THE END');
    assert.equal(returnExposureIdentity(summary(id, { endingArrival: 'defeated' })).state, 'GAME OVER');
    assert.equal(returnExposureIdentity(summary(id, { endingArrival: 'timed-out' })).state, 'GAME OVER');
    assert.equal(returnExposureIdentity(summary(id)).state, 'THE END', 'missing legacy arrival is not evidence of defeat');
  }
  for (const id of ['inversion', 'drugged', 'surfaced', 'tower-won', 'contact-won']) {
    assert.equal(returnExposureIdentity(summary(id)).state, 'THE END');
  }
  assert.equal(returnExposureIdentity(summary('tower-lost')).state, 'GAME OVER');
  assert.equal(returnExposureIdentity(summary('contact-lost')).state, 'GAME OVER');
  assert.equal(returnExposureIdentity(summary('contact-won')).residue, 'You stopped it. You did not survive.');
});

test('a fade-reveal press and held Enter cannot leave the ending or start another game', async () => {
  const record = summary();
  await withState(record, async () => {
    let title = 0, replay = 0;
    const scene = makeReturnReportScene({ summary: record, getCausalStatus: () => ({ status: 'not-qualified' }), onTitle: () => title++, onReopen: () => replay++ });
    scenes.push(scene);
    assert.equal(scene.view().action, 'title');
    scene.key({ key: 'Enter', repeat: true });
    assert.equal(scene.view().elapsed, 0);
    scene.key({ key: 'Enter', repeat: false });
    assert.equal(scene.view().elapsed, 2.2);
    for (let i = 0; i < 5; i++) scene.key({ key: 'Enter', repeat: true });
    scene.key({ key: 'Enter', repeat: false });
    assert.deepEqual([title, replay], [0, 0]);
    scene.keyup({ key: 'Enter' });
    press(scene, 'Enter');
    assert.deepEqual([title, replay], [1, 0]);
  });
});

test('NEW GAME requires a separate cancel-default confirmation and never dispatches twice', async () => {
  const record = summary();
  await withState(record, async () => {
    let replay = 0;
    const scene = makeReturnReportScene({ summary: record, getCausalStatus: () => ({ status: 'not-qualified' }), onReopen: () => replay++ });
    scenes.push(scene); scene.update(2.3);
    press(scene, 'ArrowDown'); press(scene, 'ArrowDown'); press(scene, 'Enter');
    assert.equal(scene.view().stage, 'restart-confirm');
    assert.equal(scene.view().restartChoice, 'cancel');
    scene.key({ key: 'Enter', repeat: true });
    assert.equal(replay, 0);
    press(scene, 'Enter');
    assert.equal(scene.view().stage, 'residue', 'default confirmation cancels');
    press(scene, 'Enter'); press(scene, 'ArrowRight'); press(scene, 'Enter');
    assert.equal(replay, 1);
    scene.key({ key: 'Enter' }); scene.pointer({ type: 'pointerdown', cellX: 0, cellY: 0 });
    assert.equal(replay, 1);
  });
});

test('consumption removes only its own scene and leaves unrelated overlays intact', async () => {
  const record = summary();
  await withState(record, async (scope) => {
    let done = 0;
    const scene = makeReturnReportScene({ summary: record, getCausalStatus: () => ({ status: 'not-qualified' }), onTitle: () => done++ });
    const overlay = { id: 'unrelated-overlay' };
    scenes.push(scene); scenes.push(overlay); scene.update(2.3);
    press(scene, 'Enter'); press(scene, 'Enter');
    assert.equal(done, 1);
    assert.equal(scenes.top(), overlay);
    assert.equal(scope.meta.presentation.pendingReports.includes(record.id), false);
    assert.equal(scope.writes.filter((entry) => entry.type === 'meta').length, 1);
  });
});

test('VIEW RUN is optional and closes back to the retained ending without consuming the return', async () => {
  const record = summary();
  await withState(record, async (scope) => {
    let opened = 0, closed = 0;
    const scene = makeReturnReportScene({ summary: record, getCausalStatus: () => ({ status: 'not-qualified' }), onAccountOpen: () => opened++, onAccountRead: () => closed++ });
    scenes.push(scene); scene.update(2.3);
    press(scene, 'ArrowDown'); press(scene, 'Enter');
    assert.equal(scene.view().stage, 'details');
    assert.equal(opened, 1);
    press(scene, 'Escape');
    assert.equal(scene.view().stage, 'residue');
    assert.equal(closed, 1);
    assert.equal(scene.view().title, 'GAME OVER');
    assert.equal(scope.writes.length, 0);
  });
});

test('filing cannot be bypassed and its completion preserves the actual ending', () => {
  let status = 'filing', title = 0;
  const scene = makeReturnReportScene({ summary: summary('contact-won'), getCausalStatus: () => ({ status }), onTitle: () => title++ });
  scene.update(3);
  press(scene, 'Enter'); press(scene, 'Escape');
  assert.equal(scene.view().stage, 'filing'); assert.equal(title, 0);
  status = 'ready'; scene.update(0);
  assert.equal(scene.view().stage, 'residue');
  assert.equal(scene.view().title, 'THE END');
});

test('optional account keeps equipment, unfinished rooms and complete unlock instructions at narrow widths', () => {
  for (const width of [18, 32, 52, 88]) {
    const rows = returnAccountLines(summary('surfaced', { newlyUnlockedFeatures: ['cosmetic:witness'], battles: { started: 1, won: 0, lost: 1 } }), { width, causalStatus: { status: 'not-qualified' } });
    assert.ok(rows.every((entry) => entry.text.length <= width));
    const text = rows.map((entry) => entry.text).join(' ');
    assert.match(text, /WITNESS EDITION/);
    assert.match(text, /PERMANENT RECORDER FINISH/);
    assert.match(text, /FIT AT THE VAN\./);
    assert.match(text, /NOT RETURNED\s+RECORDER/);
    assert.match(text, /RETAKES DUE/);
    assert.match(text, /ENGAGEMENTS/);
  }
});

test('a failed or stale image decode never replaces the current ending image', () => {
  const previous = globalThis.Image, pending = [];
  globalThis.Image = class { constructor() { pending.push(this); } set src(value) { this.source = value; } };
  try {
    let source = 'first';
    const scene = makeReturnReportScene({ summary: summary(), getSnapshot: () => source, getCausalStatus: () => ({ status: 'not-qualified' }) });
    assert.equal(scene.view().imageReady, false);
    source = 'second'; assert.equal(scene.view().imageReady, false);
    pending[0].onload(); assert.equal(scene.view().imageReady, false);
    pending[1].onload(); assert.equal(scene.view().imageReady, true);
    source = 'third'; scene.view(); scene.exit();
    pending[2].onload(); assert.equal(scene.view().imageReady, false);
  } finally { globalThis.Image = previous; }
});

test('plain outcome heroes fit compact and wide game grids without ellipsis', () => {
  const actions = [{ label: 'QUIT TO TITLE' }, { label: 'VIEW RUN' }, { label: 'NEW GAME' }];
  for (const size of [{ cols: 26, rows: 22 }, { cols: 80, rows: 30 }, { cols: 144, rows: 64 }]) {
    const title = 'GAME OVER';
    const layout = returnExposureLayout({ ...size, title, actions });
    assert.equal(layout.titleLines.join(' '), title);
    assert.ok(layout.titleLines.every((line) => line.length * layout.scale <= layout.width));
    assert.ok(layout.actionsY + actions.length < size.rows);
    assert.ok(layout.textY >= 0);
  }
});

test('the actual primary renderer draws its outcome once and keeps named endings in VIEW RUN', () => {
  for (const record of [summary('tower-lost'), summary('tower-won'), summary('contact-won'), summary('sacrifice', { endingVariant: 'century-stay' })]) {
    const drawn = [];
    const ctx = { canvas: { width: 1280, height: 720 }, fillRect() {}, createLinearGradient: () => ({ addColorStop() {} }) };
    const render = vm.runInNewContext(`(${drawReturnExposure.toString()})`, {
      uiSize: () => ({ cols: 80, rows: 30 }), uiFill() {}, uiDraw: draw => draw({ ctx }),
      uiText: (x, y, text) => drawn.push(text), drawVfdText: (x, y, text) => drawn.push(text),
      returnExposureIdentity, returnExposureLayout, uiWrap,
      clamp01: value => Math.max(0, Math.min(1, Number(value) || 0)),
      UI_COLOR: { primary: '#eee' },
    });
    render({ summary: record, elapsed: 3, saveStatus: 'unknown', actions: [{ id: 'title', label: 'QUIT TO TITLE' }] });
    const identity = returnExposureIdentity(record), primary = drawn.join(' ');
    assert.equal(drawn.filter(text => text === identity.title).length, 1, 'one clear outcome hero');
    assert.ok(!primary.includes(identity.endingTitle), 'the primary screen does not name the ending');
    assert.ok(!primary.includes('ENDING REACHED'));
    const account = returnAccountLines(record, { width: 80 }).map(row => row.text).join(' ');
    assert.ok(account.includes(identity.endingTitle), 'the full ending name remains available in the optional account');
  }
});

test('credits ignore inherited/repeated confirmation and release website ownership before another press', () => {
  let website = 0;
  const scene = makeCreditsScene({ onWebsite: () => website++ });
  scene.key({ key: 'Enter', repeat: true });
  assert.equal(website, 0);
  scene.key({ key: 'Enter' }); scene.key({ key: 'Enter' });
  assert.equal(website, 1);
  scene.keyup({ key: 'Enter' }); scene.key({ key: 'Enter' });
  assert.equal(website, 2);
});

test('skipped ending credits release quote and black audio owners in the same order, exactly once', () => {
  const calls = [];
  const scene = makeCreditsScene({ context: 'ending', onQuote: () => calls.push('quote'), onBlack: () => calls.push('black'), onDone: () => calls.push('done') });
  scene.key({ key: 'Escape', repeat: true }); assert.deepEqual(calls, []);
  press(scene, 'Escape'); press(scene, 'Escape'); scene.update(10000);
  assert.deepEqual(calls, ['quote', 'black', 'done']);
});
