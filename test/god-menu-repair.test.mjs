// Run with Node 22+: node --test test/god-menu-repair.test.mjs
// Production owners and floorplan are imported directly. main.js orchestration
// is evaluated unchanged in a VM with explicit platform/rendering dependencies;
// this source-only archive has no browser assets or generated content bundle.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as PB from '../src/game/playback.js';
import * as REC from '../src/game/recordist.js';
import * as PLANT from '../src/game/plant-incident.js';
import * as HEAD from '../src/game/marble-head.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import * as SCENES from '../src/game/scenes.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { GOD_LOCATION_HOOKS, GOD_DOOR_HOOKS, GOD_PLACE_SECTIONS, godDoorHook } from '../src/data/god-hooks.js';
import { FIELD_KIT_OPTIONS, fieldKitEffects, fieldKitInspection, resolveFieldKit } from '../src/game/field-kit.js';
import { resolveBagOwnership, resolveBagItemAction, BAG_AUTOMATIC_USE, bagKeyFacts } from '../src/game/bag-items.js';
import { BENCH_PACK_GROUPS, workbenchPackingComplete } from '../src/game/bench-preparation.js';
import { mapAcquired } from '../src/game/map-ownership.js';
import { SHEET_MUSIC } from '../src/data/sheet-music.js';
import { CELL } from '../src/data/floorplan/legend.js';
import { godActionRow, godStopRows, godRowSelectable, validateGodTabs } from '../src/game/god-menu-actions.js';
import { createGodWarpController, resolveGodHook, godLocationValue } from '../src/game/god-warp.js';
import { createGodInventory } from '../src/game/god-inventory.js';
import { authoredCameraFrame } from '../src/render/authored-camera.js';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const renderer = readFileSync(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const turn = () => new Promise(resolve => setImmediate(resolve));
const noop = () => {};
function functionSource(name, source = main) {
  // Top-level production functions close in column zero. No copied logic.
  const start = source.search(new RegExp(`^(?:export )?(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, `Missing production function ${name}`);
  const end = source.indexOf('\n}', start);
  assert.ok(end > start, `Missing closing brace for ${name}`);
  return source.slice(start, end + 2).replace(/^export /, '');
}
function context(functions, globals = {}, source = main) {
  const ctx = vm.createContext({ console, Promise, Map, Set, Date, Math, performance, ...globals });
  vm.runInContext(functions.map(name => functionSource(name, source)).join('\n'), ctx);
  return ctx;
}
function moduleURL(path, stubs) {
  const url = new URL(path, import.meta.url);
  const data = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
  const source = readFileSync(url, 'utf8').replace(/from\s*(['"])(\.[^'"]+)\1/g,
    (_, quote, relative) => `from ${quote}${relative in stubs ? (stubs[relative]?.url || data(stubs[relative])) : new URL(relative, url).href}${quote}`);
  return data(source);
}
const isolatedModule = (path, stubs) => import(moduleURL(path, stubs));
const contactURL = moduleURL('../src/game/source-contact.js', {
  '../narrative/generated-content.js': 'export const authoringDocumentsById={};',
});
const stateURL = moduleURL('../src/game/chunk-surf-state.js', { './source-contact.js': {url:contactURL} });
const { normalizeChunkSurfState, CHUNK_SURF_PHASE } = await import(stateURL);
const PRESETS = await isolatedModule('../src/game/chunk-surf-god.js', { './chunk-surf-state.js': {url:stateURL} });
const MENU = await isolatedModule('../src/game/god-menu.js', {
  '../render/ui.js': 'export const uiSize=()=>({cols:120,rows:50}),uiText=()=>{},uiScrim=()=>{};',
  '../render/presentation.js': 'export const withMachinePanel=()=>{};',
  '../audio/story-audio.js': 'export const menuMove=()=>{},menuConfirm=()=>{},menuBack=()=>{};',
});
const RADIO = await isolatedModule('../src/game/radio.js', {
  // The fear director imports the absent content bundle. Radio scheduling,
  // persistence, cues and progression remain the actual production module.
  './terror.js': 'export const dreadAllowed=()=>true;',
});
const storySource = readFileSync(new URL('../src/data/conservatory-script.js', import.meta.url), 'utf8');
const TARGETS = Array.from(vm.runInNewContext(storySource.match(/export const TARGETS = (\[[^;]+);/)[1]));
const ROOM_CELLS = clone(vm.runInNewContext('(' + storySource.match(/export const ROOM_CELLS = (\{[\s\S]*?\n\});/)[1] + ')'));
function wireTapeSink() {
  // Read the real wiring rather than testing the recorder with a mock sink.
  const start = main.indexOf('REC.setTakeSink({');
  const end = main.indexOf('\n  });', start);
  assert.ok(start > 0 && end > start);
  vm.runInNewContext(main.slice(start, end + 6), { REC, PB });
}
function resetOwners() {
  REC.stopRecording(); REC.stopListening(); REC.setTakeSink(null);
  PB.loadTakes([]); REC.loadRecState({}); REC.configureDifficulty({});
  PLANT.resetPlantIncident(); HEAD.resetMarbleHead(); RADIO.resetRadioState();
  wireTapeSink();
}
beforeEach(resetOwners);
FP.compile(conservatory.levels, conservatory); PROPS.propsInit(FP);

function inventoryFixture(flags = {}) {
  let saved = { flags: { ...flags }, items: [], fieldKit: resolveFieldKit(), rec: REC.saveRecState(),
    plantIncident: PLANT.savePlantIncident(), marbleHead: HEAD.saveMarbleHead(), radio: RADIO.saveRadioState() };
  const changes = [], notices = [], keys = new Set();
  let busy = '', where = { x: 123, y: 45, roomId: 'fixture', floorId: 'upper' };
  const inventory = createGodInventory({
    getSave: () => saved, commit: patch => { saved = { ...saved, ...clone(patch) }; },
    recorder: REC, plant: PLANT, marble: HEAD, radio: RADIO, keys, sheets: SHEET_MUSIC,
    guard: () => busy, location: () => where, onChange: id => changes.push(id),
    notify: message => notices.push(message), clearLost: () => { saved.flags['god.lost.item'] = null; },
  });
  return { ...inventory, saved: () => saved, changes, notices, keys,
    busy: value => { busy = value; }, where: value => { where = value; } };
}

// ---------- Contract and actual menu dispatch ----------
test('invalid callbacks, duplicate IDs, and unmarked information are rejected', () => {
  for (const row of [
    { label: 'bad', run: noop }, { id: 'bad', label: 'bad' },
    { id: 'bad', activate: 'noop' }, { id: 'bad', adjust: noop, closeMenu: true },
  ]) assert.throws(() => validateGodTabs([{ id: 'a', rows: [row] }]));
  const row = godActionRow({ id: 'same', label: 'Action', activate: noop });
  assert.throws(() => validateGodTabs([{ id: 'a', rows: [row, row] }]), /Duplicate/);
  assert.throws(() => validateGodTabs([{ id: 'a', rows: [] }, { id: 'a', rows: [] }]), /duplicate/);
  assert.equal(godRowSelectable({ kind: 'info', id: 'info', value: 'read only' }), false);
});

test('async dispatch runs once, closes once, and reports rejected handlers', async () => {
  let calls = 0, closes = 0, release;
  const errors = [];
  const scene = MENU.makeGodMenuScene({ tabs: [{ id: 'one', rows: [godActionRow({ id: 'fire', label: 'Fire', closeMenu: true,
    activate: () => { calls++; return new Promise((_, reject) => { release = reject; }); } })] }],
    onClose: () => closes++, onError: error => errors.push(error.message) });
  scene.key({ key: 'Enter' }); scene.key({ key: 'Enter' }); scene.key({ key: 'Escape' });
  assert.equal(calls, 1); assert.equal(closes, 1);
  release(new Error('fixture failure')); await turn();
  assert.deepEqual(errors, ['fixture failure']);
});

test('non-closing asynchronous action is single-flight and becomes usable again', async () => {
  let calls = 0, release;
  const scene = MENU.makeGodMenuScene({ tabs: [{ id: 'one', rows: [godActionRow({ id: 'fire', label: 'Fire',
    activate: () => { calls++; return new Promise(resolve => { release = resolve; }); } })] }] });
  scene.key({ key: 'Enter' }); scene.key({ key: 'Enter' }); assert.equal(calls, 1);
  release(true); await turn(); scene.key({ key: 'Enter' }); assert.equal(calls, 2);
  release(true); await turn();
});

function sourceFixture() {
  let saved = { flags: {}, chunkSurf: null }, calls = 0, snaps = 0, prepared = 0, releases = 0;
  const functions = ['godEnterSourceReview', 'godEnterPreTape', 'godEnterBells', 'godEnterChapelOutskirts', 'godEnterHorizon'];
  const ctx = context(functions, {
    ...PRESETS, normalizeChunkSurfState, CHUNK_SURF_PHASE, REC, PB, godSourceReviewPending: false, godWarpController: null, CHAPEL_OUTER_CHECKPOINT: { x: 3, y: 4, facing: 0 },
    CELL,px:0,py:0,trail:[],renderMove:null,motionRig:null,chunkSurfRuntime:null,
    godEnsureTestRun: async () => { prepared++; return true; },
    godReleaseViewForWarp: () => { releases++; },
    flagTest: flag => !!saved.flags[flag], getSave: () => saved,
    saveCommit: patch => { saved = { ...saved, ...patch }; },
    activateSourceSpace: (state,{position}={}) => {
      calls++;ctx.chunkSurfRuntime={state:()=>state,setPlayerPosition:noop};
      if(position){ctx.px=position.x;ctx.py=position.y;}
    }, syncSourceRender: noop, pushEvent: noop, placeHorizonBust: noop,
    R3: { r3dSnapCameraOnNextFrame: () => snaps++, r3dLoadHorizon: noop, r3dSetLookAngles:noop, r3dFacing:()=>0 },
  });
  return { ctx, saved: () => saved, counts: () => ({ calls, snaps, prepared, releases }) };
}
const families = [
  [PRESETS.PRE_TAPE_GOD_STOPS, 'godEnterPreTape', PRESETS.buildPreTapeGodPreset],
  [PRESETS.BELLS_GOD_STOPS, 'godEnterBells', PRESETS.buildBellsGodPreset],
  [PRESETS.CHAPEL_OUTSKIRTS_GOD_STOPS, 'godEnterChapelOutskirts', PRESETS.buildChapelOutskirtsGodPreset],
  [PRESETS.HORIZON_GOD_STOPS, 'godEnterHorizon', PRESETS.buildHorizonGodPreset],
];
for (const [stops, name, builder] of families) for (const stop of stops) {
  test(`Source actual handler + dispatcher: ${stop.label}`, async () => {
    const f = sourceFixture(), row = godStopRows([stop], f.ctx[name])[0];
    let closes = 0;
    const errors = [];
    const scene = MENU.makeGodMenuScene({ tabs: [{ id: 'source', rows: [row] }],
      onClose: () => closes++, onError: error => errors.push(error) });
    assert.equal(row.id, stop.id); scene.key({ key: 'Enter' }); scene.key({ key: 'Enter' }); await turn();
    assert.deepEqual(errors, []); assert.equal(closes, 1);
    assert.deepEqual(f.counts(), { calls: 1, snaps: stop.across == null ? 1 : 2, prepared: 1, releases: 1 },
      'lateral pre-tape positioning needs a second final camera snap, other stops remain single-snap');
    const expected = builder(stop.depth, { drankCoffee: false, hasRig: false, marbleEyes: 'returned',
      seed: normalizeChunkSurfState(null).seed || 4417, returnPoint: { x: 3, y: 4, facing: 0 } });
    assert.deepEqual(clone(f.saved().chunkSurf), clone(expected.state));
    // Three pre-tape camera review stops deliberately move laterally from
    // the base fixture; their final saved location is not the initial preset.
    const finalX=expected.position.x+(stop.across==null?0:stop.across/CELL);
    assert.equal(f.saved().px, finalX); assert.equal(f.saved().py, expected.position.y);
    assert.equal(f.ctx.px, finalX);
    assert.equal(f.saved().area, 'source-space');
  });
}

test('Source entry refuses an active recording before preparation or teardown', async () => {
  const f = sourceFixture(); REC.startListening(); REC.startRecording();
  assert.equal(await f.ctx.godEnterPreTape(0, 'busy'), false);
  assert.deepEqual(f.counts(), { calls: 0, snaps: 0, prepared: 0, releases: 0 });
});

// ---------- Authoritative tape integration ----------
test('normal markTake remains strict; debug setter grants all five rooms with production sink', () => {
  assert.equal(PB.markTake(TARGETS[0]), false);
  for (const id of TARGETS) assert.equal(REC.setTake(id, true), true);
  assert.deepEqual(REC.recState().takes, TARGETS);
  assert.equal(PB.tapeTakes().length, 5); assert.equal(PB.sealedTakes().length, 5);
  const saved = REC.saveRecState(); assert.equal(saved.tapes.length, 5);
  for (let i = 0; i < 5; i++) {
    const tape = saved.tapes[i];
    assert.equal(tape.status, 'accepted'); assert.equal(tape.counted, true); assert.equal(tape.debug, true);
    assert.equal(tape.ordinal, i + 1); assert.equal(tape.startSeconds, i * REC.takeDuration());
    assert.equal(tape.endSeconds, (i + 1) * REC.takeDuration());
  }
  assert.equal(PB.tapeTransport().headSeconds, 5 * REC.takeDuration());
});

test('debug grant is idempotent and preserves a real tape and its evidence byte-for-byte', () => {
  PB.beginTake(TARGETS[0], { x: 8, y: 9 }, { durationSeconds: 60 }); PB.startTapeTake(TARGETS[0], { label: 'real slate' });
  PB.notePresence(TARGETS[0], .76, 9);
  PB.finishTapeTake(TARGETS[0], { completed: true, elapsed: 60, tapeElapsed: 62 });
  PB.markTake(TARGETS[0], { contaminated: true, place: 'Beside the pool' }); REC.syncTakes();
  const real = PB.tapeTakes()[0], before = JSON.stringify(PB.serializeTakes()), transport = PB.tapeTransport();
  assert.equal(REC.setTake(TARGETS[0], true), true);
  assert.strictEqual(PB.tapeTakes()[0], real); assert.equal(JSON.stringify(PB.serializeTakes()), before);
  assert.deepEqual(PB.tapeTransport(), transport); assert.equal(REC.takeIsContaminated(TARGETS[0]), true);
  PB.debugSetTakes(TARGETS, true); REC.syncTakes();
  assert.deepEqual(PB.serializeTakes()[0], JSON.parse(before)[0]);
});

test('remove, re-grant and reload preserve unrelated history and nonoverlapping transport', () => {
  PB.debugSetTakes(TARGETS, true, {durationSeconds:REC.takeDuration()}); REC.syncTakes();
  const unrelated = PB.serializeTakes().filter(t => t.roomId !== TARGETS[0]);
  assert.equal(REC.setTake(TARGETS[0], false), true); assert.equal(REC.hasTake(TARGETS[0]), false);
  assert.equal(REC.setTake(TARGETS[0], true), true);
  assert.deepEqual(PB.serializeTakes().filter(t => t.roomId !== TARGETS[0]), unrelated);
  const saved = clone(REC.saveRecState()); PB.loadTakes([]); REC.loadRecState(saved);
  PB.loadTakes(saved.tapes); PB.loadTapeTransport(saved.tapeTransport); REC.syncTakes();
  assert.equal(REC.recState().takes.length, 5); assert.equal(PB.tapeTakes().length, 6);
  assert.equal(PB.tapeTakes()[0].voided, true); assert.equal(PB.tapeTakes()[5].debug, true);
  const history = PB.tapeTakes();
  for (let i = 1; i < history.length; i++) assert.ok(history[i].startSeconds >= history[i - 1].endSeconds);
  assert.equal(PB.tapeTransport().endSeconds, 6 * REC.takeDuration());
});

test('bad batches and a busy deck cannot partially grant or remove takes', () => {
  for (const ids of [null, ['room', ''], ['room', 4]]) assert.equal(PB.debugSetTakes(ids).ok, false);
  assert.equal(PB.debugSetTakes(['a', 'b'], true, { cells: { a: { x: 1, y: 2 }, b: { x: NaN, y: 2 } } }).ok, false);
  assert.equal(PB.tapeTakes().length, 0);
  PB.beginTake('open', { x: 1, y: 1 }); PB.startTapeTake('open'); PB.advanceTape('open', 8);
  let before = clone(PB.serializeTakes());
  assert.equal(PB.debugSetTakes(TARGETS).ok, false); assert.equal(PB.debugSetTakes(['open'], false).ok, false);
  assert.deepEqual(PB.serializeTakes(), before); PB.abortTake('open');
  PB.debugSetTakes(TARGETS); PB.loadTapeTransport({ headSeconds: 0 }); PB.cueTapeEnd();
  assert.equal(PB.isPlaying(), true); before = clone(PB.serializeTakes());
  assert.equal(PB.debugSetTakes(TARGETS, false).ok, false); assert.deepEqual(PB.serializeTakes(), before);
});

// ---------- Inventory owner adapters ----------
test('inventory coverage, stable IDs and state-aware field-ready preset', () => {
  const f = inventoryFixture({ 'has.coffee': true, 'drank.coffee': false, 'god.lost.item': 'torch' });
  const ids = new Set(f.entries.map(e => e.id));
  for (const id of ['field-case','survey-indicator','kit-fitted','kit-headphones','kit-microphone','kit-recorder','kit-flashlight',
    'interface','tuning-fork','plant-spanner','marble-eyes','film-badge','master-key','chapel-key','services-key',
    'chapel-key-identified','coffee-owned','coffee','cells','battery','radio-phase','radio-deployed']) assert.ok(ids.has(id), id);
  assert.equal(ids.size, f.entries.length); validateGodTabs([{ id: 'inventory', rows: f.rows() }]);
  for (const sheet of SHEET_MUSIC) assert.ok(ids.has(`sheet-${sheet.id}`));
  const marble = HEAD.saveMarbleHead(); assert.equal(f.fieldReady(), true);
  assert.equal(workbenchPackingComplete(f.saved().flags), true); assert.equal(f.saved().flags['kit.fitted'], true);
  assert.equal(mapAcquired(f.saved().flags), true); assert.equal(f.saved().flags['god.lost.item'], null);
  assert.deepEqual(HEAD.saveMarbleHead(), marble); assert.equal(f.saved().flags['has.coffee'], true);
  assert.equal(f.saved().flags['drank.coffee'], false); assert.equal(PLANT.hasPlantSpanner(), false);
});

test('models and packing use authoritative field-kit data without bypassing locked cosmetics', () => {
  const f = inventoryFixture({ 'bag.taken': true });
  f.set('kit-fitted', true);
  for (const group of BENCH_PACK_GROUPS) for (const option of FIELD_KIT_OPTIONS[group]) {
    assert.equal(f.set(`kit-${group}`, option.id), true);
    assert.equal(resolveFieldKit(f.saved().fieldKit)[group], option.id);
  }
  assert.equal(f.set('kit-microphone', 'directional'), true);
  assert.equal(fieldKitEffects(f.saved().fieldKit).takeDurationScale, 1.1);
  assert.equal(f.set('packed-microphone', false), true);
  assert.equal(f.saved().flags['kit.fitted'], false); assert.equal(f.saved().flags['van.packed.microphone'], false);
  assert.equal(f.set('kit-fitted', true), true); assert.equal(workbenchPackingComplete(f.saved().flags), true);
  const before = clone(f.saved().fieldKit);
  assert.equal(f.set('kit-faceplate', 'not-unlocked-or-valid'), false); assert.deepEqual(f.saved().fieldKit, before);
});

test('map debug removal beats legacy fallback, but a real pickup reacquires it', () => {
  const f = inventoryFixture({ 'bag.taken': true }); assert.equal(mapAcquired(f.saved().flags), true);
  f.set('survey-indicator', false); assert.equal(mapAcquired(f.saved().flags), false);
  assert.equal(mapAcquired(clone(f.saved()).flags), false);
  assert.equal(mapAcquired({ ...f.saved().flags, 'map.taken': true }), true);
  f.set('survey-indicator', true); assert.equal(mapAcquired(f.saved().flags), true);
});

test('keys, fork and coffee edit their own states without consuming or completing other items', () => {
  const f = inventoryFixture();
  for (const [id, key, item] of [['chapel-key','chapel','chapel_key'], ['services-key','services-core','services_core_key'], ['ren-service-key','ren-service','ren-service-key']]) {
    assert.equal(f.set(id, true), true); assert.ok(f.keys.has(key)); assert.ok(f.saved().items.includes(item));
    assert.equal(f.set(id, false), true); assert.ok(!f.keys.has(key)); assert.ok(!f.saved().items.includes(item));
  }
  f.set('master-key', false); assert.equal(f.saved().flags['god.master-key'], false);
  f.set('tuning-fork', true); assert.equal(f.saved().flags['has.fork'], true); assert.equal(f.saved().flags['source.fork'], true);
  f.set('coffee-owned', true); assert.equal(f.saved().flags['drank.coffee'], undefined);
  f.set('coffee', true); assert.equal(f.saved().flags['has.coffee'], true);
  f.set('film-badge', true); assert.equal(f.saved().flags['badge.taken'], true);
});

test('spanner mutation preserves incident state and refuses active-tool removal', () => {
  const f = inventoryFixture(); PLANT.loadPlantIncident({ phase: 'hissing', triggerTakeOrdinal: 2, heavyMode: 'dropped', heavyPosition: { x: 4, y: 8 } });
  const before = PLANT.savePlantIncident(); assert.equal(f.set('plant-spanner', true), true);
  assert.deepEqual(PLANT.savePlantIncident(), { ...before, spannerOwned: true });
  PLANT.loadPlantIncident({ ...before, phase: 'isolating', activeTool: 'spanner', spannerOwned: true });
  const active = PLANT.savePlantIncident(); assert.equal(f.set('plant-spanner', false), false);
  assert.deepEqual(PLANT.savePlantIncident(), active);
});

test('marble quest debug states remain explicit and serialize through their owner', () => {
  const f = inventoryFixture();
  for (const phase of Object.values(HEAD.MARBLE_HEAD_PHASE)) {
    assert.equal(f.set('marble-eyes', phase), true); assert.equal(HEAD.marbleHeadState().phase, phase);
    HEAD.loadMarbleHead(clone(f.saved().marbleHead)); assert.equal(HEAD.marbleHeadState().phase, phase);
  }
  f.set('marble-eyes', HEAD.MARBLE_HEAD_PHASE.IN_THE_WATER);
  assert.equal(HEAD.marbleHeadState().toldWhereTheKeyIs, false);
});

test('named sheets are reversible and idempotent, not duplicate count grants', () => {
  const f = inventoryFixture();
  for (const sheet of SHEET_MUSIC) {
    const id = `sheet-${sheet.id}`;
    for (let i = 0; i < 2; i++) assert.equal(f.set(id, 'carried'), true);
    assert.equal(REC.carriedSheets().filter(s => s === sheet.id).length, 1);
    f.set(id, 'spent'); assert.equal(REC.sheetTaken(sheet.id), true); assert.equal(REC.carriedSheets().includes(sheet.id), false);
    f.set(id, 'uncollected'); assert.equal(REC.sheetTaken(sheet.id), false);
    f.set(id, 'carried');
  }
  const saved = clone(f.saved().rec); REC.loadRecState(saved);
  assert.deepEqual(REC.carriedSheets(), SHEET_MUSIC.map(s => s.id));
});

test('radio state/deployment is real, persistent, and does not replay a queued cue', () => {
  const f = inventoryFixture(); const milestones = RADIO.radioMilestones();
  for (const phase of Object.values(RADIO.RADIO_PHASE)) {
    assert.equal(f.set('radio-phase', phase), true); assert.equal(RADIO.radioPhase(), phase);
    assert.deepEqual(RADIO.radioMilestones(), milestones); assert.equal(RADIO.pendingRadioCue(), null);
  }
  assert.equal(f.set('radio-deployed', true), true); assert.equal(RADIO.isDropped(), true);
  const saved = clone(f.saved().radio); RADIO.loadRadioState(saved); assert.equal(RADIO.isDropped(), true);
  assert.equal(RADIO.radioLocation().floorId, 'upper');
  assert.equal(f.set('radio-deployed', false), true); assert.equal(RADIO.isDropped(), false);
  f.where({ x: 1, y: 2, unavailable: true }); assert.equal(f.set('radio-deployed', true), false);
  RADIO.resetRadioState(); const cue = Object.values(RADIO.RADIO_CUES)[0]; RADIO.queueRadioCue(cue);
  assert.ok(RADIO.pendingRadioCue()); assert.equal(f.set('radio-phase', 'dead'), false);
});

test('busy inventory is unchanged; battery uses actual capacity and save projection', () => {
  const f = inventoryFixture(); f.busy('STOP RECORDING FIRST'); const saved = clone(f.saved());
  assert.equal(f.set('coffee', true), false); assert.equal(f.fieldReady(), false); assert.deepEqual(f.saved(), saved);
  f.busy(''); assert.equal(f.set('battery', 2), true); assert.equal(REC.batteryLevel(), 2);
  assert.equal(f.saved().rec.battery, 2); assert.equal(f.set('battery', 3), false);
});

// ---------- Authored floor/collision and transactional warp ----------
for (const [id, hook] of Object.entries(GOD_LOCATION_HOOKS)) test(`location anchor ${id} is collision-clear and floor/component correct`, () => {
  const point = resolveGodHook(hook, FP, PROPS); assert.ok(point, id);
  const physical = FP.logicalToPhysical(point.x, point.y);
  assert.equal(physical.spaceId, hook.component); assert.equal(physical.renderGroup, hook.group);
  assert.ok(Math.abs(physical.y - hook.floor) < .12); assert.equal(PROPS.propCanOccupy(point.x, point.y), true);
  assert.ok(godLocationValue(hook).includes(`${hook.floor}m`));
});

test('overlapping hall balconies remain independently addressable', () => {
  const a = resolveGodHook(GOD_LOCATION_HOOKS['hall-lower-balcony'], FP, PROPS);
  const b = resolveGodHook(GOD_LOCATION_HOOKS['hall-upper-balcony'], FP, PROPS);
  const pa = FP.logicalToPhysical(a.x,a.y), pb = FP.logicalToPhysical(b.x,b.y);
  assert.equal(pa.x, pb.x); assert.equal(pa.z, pb.z); assert.notEqual(pa.y, pb.y); assert.notDeepEqual(a, b);
  assert.equal(resolveGodHook({ ...GOD_LOCATION_HOOKS['hall-lower-balcony'], floor: 7.06 }, FP, PROPS), null);
});

for (const [id, hook] of Object.entries(GOD_DOOR_HOOKS)) test(`door review anchor ${id} resolves on its authored floor`, () => {
  const door = FP.doorState().find(entry => entry.id === hook.doorId); assert.ok(door);
  const at = { x: FP.toAuthoredCoord(door.cx) + hook.normal[0] * hook.distance,
    y: FP.toAuthoredCoord(door.cy) + hook.normal[1] * hook.distance };
  assert.ok(resolveGodHook({ ...hook, at }, FP, PROPS), `${id}: ${JSON.stringify(at)}`);
});

test('cold warp prepares and executes in one activation, suppressing concurrent requests', async () => {
  const events = []; let live = false, release;
  const controller = createGodWarpController({ getHook: id => GOD_LOCATION_HOOKS[id], ready: () => live,
    ensureReady: () => { events.push('prepare'); return new Promise(resolve => { release = () => { live = true; resolve(true); }; }); },
    resolve: hook => { events.push('resolve'); return resolveGodHook(hook, FP, PROPS); },
    commit: () => { events.push('commit'); return true; } });
  const first = controller.warp('studio-b3'); assert.equal(controller.pending(), true);
  assert.equal(await controller.warp('chapel'), false); release(); assert.equal(await first, true);
  assert.deepEqual(events, ['prepare','resolve','commit']); assert.equal(controller.pending(), false);
});

test('unknown, invalid, blocked and failed loads never commit a warp', async () => {
  let commits = 0, prepared = 0, live = true, busy = '', fail = false, bad = false;
  const controller = createGodWarpController({ getHook: id => GOD_LOCATION_HOOKS[id], ready: () => live,
    ensureReady: async () => { prepared++; if (fail) throw new Error('load failed'); live = true; return true; },
    resolve: hook => bad ? null : resolveGodHook(hook, FP, PROPS), commit: () => { commits++; }, blocked: () => busy });
  assert.equal(await controller.warp('missing'), false); assert.equal(await controller.warp(null), false);
  bad = true; assert.equal(await controller.warp('chapel'), false);
  bad = false; busy = 'RECORDING'; assert.equal(await controller.warp('chapel'), false);
  busy = ''; fail = true; live = false; assert.equal(await controller.warp('chapel'), false);
  assert.equal(commits, 0); assert.equal(prepared, 1); assert.equal(controller.pending(), false);
});

test('scene handoff exits without intermediate resume and relinquishes worldView', () => {
  SCENES.clear(); const events = [];
  for (const id of ['old-camera','dialogue','menu']) SCENES.push({ id, worldView: () => ({ id }),
    exit: () => events.push(`exit:${id}`), resume: () => events.push(`resume:${id}`) });
  assert.ok(SCENES.worldView()); SCENES.clear();
  assert.deepEqual(events, ['exit:menu','exit:dialogue','exit:old-camera']); assert.equal(SCENES.worldView(), null);
});

test('restoring a pickup preserves its authored contact and does not reinitialize other props', () => {
  for (const id of ['van-adjustable-spanner', 'yard-park-eyes']) {
    const original = clone(PROPS.propById(id)); assert.ok(original);
    const unrelated = PROPS.allProps().find(p => p.id !== id);
    PROPS.setPropDrift(unrelated.id, { x: .2, z: .3 }); const other = clone(unrelated);
    PROPS.setLooseProp(id, null); assert.equal(PROPS.propById(id), null);
    assert.deepEqual(PROPS.restoreAuthoredProp(id), original);
    assert.deepEqual(unrelated, other); assert.strictEqual(PROPS.restoreAuthoredProp(id), PROPS.propById(id));
  }
});

test('actual renderer consumes one warp snap; ordinary floor movement stays eased', () => {
  const sentinel = new Error('camera complete'); let time = 1000, resets = 0;
  const ctx = context(['r3dFrame'], {
    gl: {}, P3:{setDriveStudyFrame:noop},authoredCameraFrame, cameraSnapPending: true, lastBeacons: null, lastT: .95,
    performance: { now: () => time }, drainMarkQueue: noop, horizonState: { active: false },
    vfdPreviousX: 0, vfdPreviousZ: 0, vfdMovement: 0, camX: 0, camZ: 0, camY: -10,
    towerCaptureInProgress:false,
    yaw: 0, yawTarget: 1, planYaw: 0, planYawTarget: 0, leanEase: .9, pitch: 0, pitchTarget: .1,
    EYE_METERS: 1.65, CELL, r3dResetVfdMemory: () => resets++,
  }, renderer);
  const state = { px: 50, py: 60, floorH: 10, lean: 0, yawOffset: .4, get light() { throw sentinel; } };
  assert.throws(() => ctx.r3dFrame(state), error => error === sentinel);
  assert.equal(ctx.camY, (10 + 1.65) / CELL); assert.equal(ctx.yaw, 1); assert.equal(ctx.pitch, .1);
  assert.equal(ctx.planYaw, .4); assert.equal(ctx.leanEase, 0); assert.equal(ctx.cameraSnapPending, false);
  assert.equal(resets, 1); time += 16;
  state.floorH = 11;
  assert.throws(() => ctx.r3dFrame(state), error => error === sentinel);
  assert.ok(ctx.camY > (10 + 1.65) / CELL && ctx.camY < (11 + 1.65) / CELL);
  ctx.gl = null; ctx.cameraSnapPending = true; ctx.r3dFrame(state); assert.equal(ctx.cameraSnapPending, true);
});

// ---------- main.js integration, not hand-copied row factories ----------
function tabsFixture() {
  const f = sourceFixture(), inventory = inventoryFixture();
  const ctx = f.ctx;
  // Unrelated encounter/presentation callbacks are not invoked by this suite.
  const callbacks = ['closeGodMenu','godRearmStairRun','godResetStairGlobal','godSourceTowerCrossing','godToggleFocusedDoor',
    'godRunDoorClosers','godToggleDoorDebug','godResetDoors','godResetFx','beginTaken','godColdOpen','godPostDoorRuntime',
    'godOpenCausalReturnFork','openCredits','godAbortBattle','beginConfrontation','openEndingChoice','restartDesktopAudio',
    'natatoriumBattle','practiceBattle','hallBattle','godCycleHushBody',
    'godSetRoofAccess','godCycleRenStage','godResetRen','godResetEarRoom',
    'godOpeningVehicle','godGetInDriveTeaser','godCoastalMemory','godSourceEarthfall','godPracticeStudent',
    'godRoofWordLock','godRoofCitySeat','godDaydream','godDreamFigure','godArrivalTitle','openTransferRoom',
    'nukeStableDiffusion','scanStableDiffusionProcesses'];
  for (const name of callbacks) ctx[name] = noop;
  Object.assign(ctx, { godActionRow, godStopRows, godLocationValue, GOD_LOCATION_HOOKS, storyMode: true, inRogue: true, FP,
    SCENE_DOCK_LABEL: 'GET-IN', godInventory: () => inventory, LOSABLE: ['recorder','torch','map','radio'],
    TARGETS, roomLabel:id=>id, LOOK_PROFILE_IDS: ['explore','calm','source'], PRACTICE_HAUNT: {CHAIRS:'chairs',HUSH:'hush',TENANT:'tenant'},
    ENDING_ARRIVAL: {AGREED:'agreed',DEFEATED:'defeated',TIMED_OUT:'timed-out',ESCAPED:'escaped',CARRIED:'carried'},
    CHUNK_SURF_ENDING_ID:'surfaced', endingManifest: () => ({cutscene:{beats:[{id:'fixture'}]}}), ENDING_AUDIO_TODO:[],
    godRoofGateCheck: () => 'WOULD OPEN', godEarRoomValue: () => 'AFTER B3', roofRenState: () => ({ stage: 'new' }),
    GOD_PLACE_SECTIONS, GOD_DEV_ROWS: true, godSourceDriveValue: () => 'NONE SAVED', sdLastNuke: null,
    BUST_TREES: { 'academic-bust-1': 'talk', 'academic-bust-fragment-6': 'fragment' },
    stableDiffusionOff: () => false, stableDiffusionReport: () => ({ client: false, textureBytes: 0, jsHeapBytes: null }),
  });
  vm.runInContext(functionSource('godTabs'), ctx);
  return { ...f, inventory, tabs: () => ctx.godTabs() };
}

test('complete production God-menu tabs validate, enumerate all stops, and dispatch their real rows', async () => {
  const f = tabsFixture(), tabs = f.tabs(); validateGodTabs(tabs);
  assert.ok(tabs.length >= 10);
  const sourceRows = tabs.find(tab => tab.id === 'source-space').rows;
  const ids = new Set(sourceRows.map(row => row.id));
  for (const [stops] of families) for (const stop of stops) assert.ok(ids.has(stop.id), stop.id);
  const source = MENU.makeGodMenuScene({ tabs: [tabs.find(tab => tab.id === 'source-space')] });
  const exposed = source.view().tabs[0].rows;
  for (const [stops] of families) for (const stop of stops) assert.ok(exposed.includes(stop.id));
  const row = sourceRows.find(row => row.id === PRESETS.PRE_TAPE_GOD_STOPS[0].id);
  await row.activate(); assert.equal(f.counts().calls, 1);
  assert.equal(tabs.find(tab=>tab.id==='audio').rows.find(row=>row.id==='sample-gate').kind, 'info');
});

test('production location rows route a cold click to the requested destination, including bay', async () => {
  const f = tabsFixture(), destinations = []; f.ctx.storyMode = false; f.ctx.inRogue = false;
  f.ctx.godWarpToHook = async id => { destinations.push(id); return true; };
  for (const row of f.tabs().find(tab => tab.id === 'session').rows.filter(row => row.id?.startsWith('warp-'))) {
    assert.ok(row.value().startsWith('[START + WARP]')); await row.activate();
  }
  assert.ok(destinations.includes('loading-bay')); assert.ok(destinations.includes('studio-b3'));
  assert.ok(destinations.includes('hall-lower-balcony')); assert.equal(destinations.length, 13);
  assert.equal(f.counts().prepared, 0); // Preparation belongs to the warp, not an either/or row.
});

test('production take row grants both single rooms and the work order through the real deck', () => {
  const f = tabsFixture(); let saved = {};
  Object.assign(f.ctx, { ROOM_CELLS, godInventoryBlocked: () => '', takePlaceAt: (x,y) => `mark ${x},${y}`, reconcileChapelTowerTakes: () => false,
    syncStopListeningProps: () => {},
    saveCommit: patch => { saved = { ...saved, ...patch }; } });
  vm.runInContext(functionSource('godSetTakes') + '\nfunction godSetAllTakes(on){return godSetTakes(TARGETS,on);}', f.ctx);
  const rows = f.tabs().find(tab => tab.id === 'inventory').rows;
  rows.find(row => row.id === `take-${TARGETS[0]}`).adjust();
  assert.equal(REC.hasTake(TARGETS[0]), true); assert.ok(PB.takePlace(TARGETS[0]).startsWith('mark '));
  rows.find(row => row.id === 'all-takes').adjust(1); assert.equal(REC.recState().takes.length, 5);
  assert.equal(saved.rec.tapes.length, 5); assert.equal(rows.find(row=>row.id==='all-takes').value(),'5 / 5');
  const first = PB.tapeTakes()[0]; assert.deepEqual(clone(first.cell), clone(FP.toRuntimePoint(ROOM_CELLS[TARGETS[0]])));
  rows.find(row => row.id === 'all-takes').adjust(-1); assert.equal(REC.recState().takes.length, 0);
  rows.find(row => row.id === 'all-takes').adjust(1); assert.equal(REC.recState().takes.length, 5);
});

function mainWarpFixture() {
  let special = true, saved = { area:'source-space', chunkSurf:{active:true}, flags:{} };
  const events = [],notices=[];
  SCENES.clear(); SCENES.push({id:'old-view',worldView:()=>({floorH:-999})});
  const badBelfry = { ...GOD_LOCATION_HOOKS['cathedral-belfry'], at:{x:185,y:241} };
  const ctx = context(['godHookPoint','godReleaseViewForWarp','godWarpToHook'], {
    createGodWarpController, resolveGodHook, godDoorHook, GOD_LOCATION_HOOKS:{...GOD_LOCATION_HOOKS,blocked:badBelfry},
    FP, PROPS, REC, PB, scenes:SCENES, storyMode:true, inRogue:true, buildingLoadPromise:null,
    godWarpController:null, godSourceReviewPending:false,
    px:3000,py:4000,trail:[1],renderMove:{old:true},motionRig:{old:true},
    frontEndSession:{markLive:()=>events.push('live')},frontEndPromotionPending:true,frontEndMismatchPending:true,frontEndPlateOverride:'old',
    activeBattleId:'old-battle',godBattleOpen:true,finaleActive:true,escape:{},endingTimeline:{},activeEndingCutscene:{},pendingContactEndingReturn:{},
    towerEndingPlayback:null,
    R3:{r3dSetFrontEndPlate:()=>events.push('plate'),r3dSetFacing:()=>events.push('facing'),r3dSnapCameraOnNextFrame:()=>events.push('snap')},
    endBootWeather:noop,SPEECH:{clearSpeech:noop},STORY:{stopTapeHiss:noop},resetMotionInput:noop,setGameplayPaused:noop,
    godRestoreBuildingWorld:()=>{events.push('restore');special=false;saved.chunkSurf.active=false;},
    godSyncBuildingRender:()=>events.push('render'),syncDoorDynamicProps:noop,pushEvent:message=>notices.push(message),
    saveCommit:patch=>{saved={...saved,...patch};},
    godEnsureTestRun:async()=>true,
  });
  return {ctx,events,notices,saved:()=>saved,special:()=>special};
}

test('production warp rejects the old colliding belfry without destroying Source or its scene', async () => {
  const f = mainWarpFixture(); assert.equal(await f.ctx.godWarpToHook('blocked'), false);
  assert.equal(f.special(), true); assert.equal(f.saved().area, 'source-space');
  assert.equal(f.ctx.px, 3000); assert.deepEqual(f.events, []); assert.equal(SCENES.top().id, 'old-view');
});

test('production warp hands off scene, runtime, saved pose and camera only after a valid destination', async () => {
  const f = mainWarpFixture(); assert.equal(await f.ctx.godWarpToHook('academic-gallery'), true, f.notices.join(' | '));
  const expected = FP.toRuntimePoint(GOD_LOCATION_HOOKS['academic-gallery'].at);
  assert.equal(f.ctx.px, expected.x); assert.equal(f.ctx.py, expected.y); assert.equal(f.special(), false);
  assert.equal(SCENES.worldView(), null); assert.equal(SCENES.depth(), 0); assert.equal(f.ctx.finaleActive, false);
  assert.equal(f.ctx.escape, null); assert.equal(f.ctx.motionRig, null); assert.equal(f.ctx.renderMove, null);
  assert.equal(f.saved().area,'conservatory'); assert.equal(f.saved().px,expected.x);
  assert.ok(f.events.indexOf('restore') < f.events.indexOf('facing')); assert.ok(f.events.includes('snap'));
});

test('production cold warp awaits readiness, then commits the requested pose', async () => {
  const f = mainWarpFixture(); f.ctx.storyMode = false; f.ctx.inRogue = false; let release;
  f.ctx.godEnsureTestRun = () => new Promise(resolve => { release=()=>{f.ctx.storyMode=true;f.ctx.inRogue=true;resolve(true);}; });
  const request=f.ctx.godWarpToHook('studio-b3'); assert.deepEqual(f.events, []); release();
  assert.equal(await request,true, f.notices.join(' | ')); assert.equal(f.ctx.px,FP.toRuntimePoint(ROOM_CELLS.main_b3).x);
});

test('building load barrier waits for older builds even when the latest build finishes first', async () => {
  const deferred=[];
  const ctx=context(['loadBuilding'],{buildingLoadPromise:null,loadBuildingRuntime:()=>new Promise(resolve=>deferred.push(resolve))});
  const old=ctx.loadBuilding(), latest=ctx.loadBuilding();
  deferred[1](true); assert.equal(await latest,true); await turn(); assert.ok(ctx.buildingLoadPromise);
  deferred[0](true); assert.equal(await old,true); await turn(); assert.equal(ctx.buildingLoadPromise,null);
});

test('Source review blocks concurrent Source and facility relocations while awaiting readiness', async () => {
  const f=sourceFixture(); let release;
  f.ctx.godEnsureTestRun=()=>new Promise(resolve=>{release=resolve;});
  const first=f.ctx.godEnterPreTape(0,'first');
  assert.equal(await f.ctx.godEnterBells(0,'second'),false);
  assert.equal(f.ctx.godSourceReviewPending,true); release(true); assert.equal(await first,true);
  assert.equal(f.ctx.godSourceReviewPending,false); assert.equal(f.counts().calls,1);
  const warp=mainWarpFixture();warp.ctx.godSourceReviewPending=true;
  assert.equal(await warp.ctx.godWarpToHook('chapel'),false);assert.deepEqual(warp.events,[]);
});

test('recordist debug setter rejects recording even before the deck opens its take', () => {
  REC.startListening(); REC.startRecording(); assert.equal(REC.setTake(TARGETS[0],true),false);
  assert.equal(PB.tapeTakes().length,0);
});

test('actual bag lists granted hardware, tools, keys, named sheets and radio deployment', () => {
  const f=inventoryFixture(); f.fieldReady();
  for(const id of ['interface','tuning-fork','plant-spanner','chapel-key','services-key','master-key','film-badge','coffee-owned']) f.set(id,true);
  f.set('marble-eyes','carried');f.set(`sheet-${SHEET_MUSIC[0].id}`,'carried');
  const ctx=context(['bagEquipment'],{
    PLANT,HEAD,REC,RADIO,resolveBagOwnership,resolveBagItemAction,BAG_AUTOMATIC_USE,bagKeyFacts,fieldKitInspection,
    flagTest:id=>!!f.saved().flags[id],getSave:f.saved,CHUNK_SURF_FLAGS:{fork:'source.fork'},playerKeys:f.keys,
    itemLost:()=>false,chapelKeyIsIdentified:()=>false,activeBattleId:null,scenes:{top:()=>null},usingSpecialSpace:()=>false,
    stationRelics:()=>[],
    SPEECH:{isSpeaking:()=>false},sheetMusicById:id=>SHEET_MUSIC.find(sheet=>sheet.id===id),
  });
  let bag=ctx.bagEquipment();let ids=bag.map(item=>item.id);
  for(const id of ['light','recorder','headphones-reference','microphone-reference','amp-reference','interface','tuning-fork','map','radio','plant-spanner','marble-eyes','keyring','coffee','sheet-music','badge']) assert.ok(ids.includes(id),id);
  f.set('radio-deployed',true);bag=ctx.bagEquipment();assert.equal(bag.find(item=>item.id==='radio').present,false);
  f.set('packed-headphones',false);assert.ok(!ctx.bagEquipment().some(item=>item.id.startsWith('headphones-')));
  f.set('coffee',true);assert.ok(!ctx.bagEquipment().some(item=>item.id==='coffee'));
  f.set('field-case',false);assert.equal(ctx.bagEquipment().length,0);
});

test('equipment refresh applies actual fitted-kit recording modifiers and refreshes relevant props', () => {
  const f=inventoryFixture(); f.fieldReady(); f.set('kit-microphone','directional'); const effects=fieldKitEffects(f.saved().fieldKit);
  const calls=[];
  const ctx=context(['applyCurrentRunDifficulty','godInventoryChanged'],{
    getSave:f.saved,getMeta:()=>({}),flagTest:id=>!!f.saved().flags[id],fieldKitEffects,resolveFieldKit,
    currentDifficulty:()=>({values:{presencePressure:'standard'},presence:{},recording:{},torch:{drainScale:1}}),
    currentProfileInfluence:()=>({adaptiveBand:0}),RULE_OPTIONS:{presencePressure:['standard']},
    activeDifficulty:null,activeKitEffects:null,PRES:{configurePresence:noop},REC,
    witnessEditionStatus:()=>({endingIds:[]}),setRecorderAppearance:()=>calls.push('appearance'),applyAudioSettings:()=>calls.push('audio'),
    FP,planName:'conservatory',syncKeyCabinetProps:()=>calls.push('keys'),syncStoryObjectProps:()=>calls.push('story'),
    syncSheetMusicProps:()=>calls.push('sheets'),syncPlantIncidentProps:()=>calls.push('plant'),syncMarbleHeadProps:()=>calls.push('marble'),syncStopListeningProps:()=>calls.push('ear-room'),
    syncDroppedRadioProp:()=>calls.push('radio'),facilityMapCache:{},usingSourceSpace:()=>false,usingSpecialSpace:()=>false,
    refreshWorldProps:()=>calls.push('render'),
  });
  ctx.godInventoryChanged('kit-microphone');
  assert.equal(REC.recordistDifficulty().takeSecondsScale,effects.takeDurationScale);
  assert.equal(REC.recordistDifficulty().recordingNoiseScale,effects.recordingNoiseScale);
  assert.deepEqual(calls,['appearance','audio','keys','story','sheets','plant','marble','radio','ear-room','render']);
  f.set('kit-fitted',false);ctx.godInventoryChanged('kit-fitted');assert.equal(REC.recordistDifficulty().takeSecondsScale,1);
});

test('debug item save round-trip preserves named acquisition order and unknown tape location', () => {
  const f=inventoryFixture();for(const sheet of SHEET_MUSIC)f.set(`sheet-${sheet.id}`,'carried');
  const before=clone(REC.saveRecState()); f.set(`sheet-${SHEET_MUSIC[0].id}`,'carried');
  assert.deepEqual(REC.saveRecState(),before);
  REC.setTake(TARGETS[0],true); const saved=clone(REC.saveRecState());
  PB.loadTakes(saved.tapes);PB.loadTapeTransport(saved.tapeTransport);REC.loadRecState(saved);REC.syncTakes();
  assert.deepEqual(REC.saveRecState(),saved);
});

test('actual test-run preparation enters the world runtime on a genuinely cold boot', async () => {
  for(const storyAlreadyEntered of [false,true]){
    const f=mainWarpFixture();const started=[];
    Object.assign(f.ctx,{
      storyMode:storyAlreadyEntered,inRogue:false,getSave:f.saved,flagApply:noop,
      newGame:()=>started.push('new-game'),beginRunProgression:noop,setGameChrome:noop,silenceSampleField:noop,sampleFieldEnabled:false,
      enterStory:()=>{started.push('story');f.ctx.storyMode=true;},
      enterRogue:()=>{started.push('runtime');f.ctx.inRogue=true;},
    });
    vm.runInContext(functionSource('godEnsureTestRun'),f.ctx);
    assert.equal(await f.ctx.godEnsureTestRun(),true);assert.ok(started.includes('runtime'));
    assert.equal(f.ctx.storyMode,true);assert.equal(f.ctx.inRogue,true);
    assert.equal(started.includes('story'),!storyAlreadyEntered);
  }
});
