import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { EVENT_TYPES } from '../src/progression/events.js';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
function hostFunction(name) {
  const start = main.indexOf(`function ${name}(`), end = main.indexOf('\n}\n', start);
  assert.ok(start >= 0 && end > start, name);
  return main.slice(start, end + 2);
}

function radioFixture({ reduced = false, budget = true } = {}) {
  const events = [], flags = {}, profile = { completion: { secrets: {} } };
  let options, callback, reserved = 0, quiet;
  const gain = () => ({ connect() {}, disconnect() {}, gain: { value: 1,cancelScheduledValues(){},setTargetAtTime(){} } });
  const context = {
    storyMode: true, NO_THINK: false, paused: false, EVENT_TYPES, ensureCtx() {},
    R3: { r3dLookAngles: () => ({ yaw: 0, pitch: 0 }) },
    actx: { createGain: gain, currentTime: 0 }, dialogGain: {}, sfxDirectGain: {}, master: {},
    REC: { isMonitoring: () => false }, PB: { isPlaying: () => false },
    document: { hidden: false, hasFocus: () => true },
    getMeta: () => profile, getSave: () => ({ settings: { reduceDread: reduced, volume: 0, sfx: 0 } }),
    itemLost: () => false,
    RADIO: { isDropped: () => false, radioPhase: () => 'live', RADIO_PHASE: { LIVE: 'live' } },
    STAB: { externalScareBudgetReady: () => budget, reserveExternalScare: () => { reserved++; return true; } },
    createRadioContactAudio: () => ({ warm: async () => true,control() {},
      egg: async value => { callback = value.onComplete; quiet = value.quiet; return true; } }),
    makeRadioScene: value => { options = value; return { view: () => ({ radio: { instrument: { channel: 13, volume: .75 } } }), radioEggEnded() {} }; },
    STORY: {}, createReplayService: () => null, fireCue() {}, shakeMode: () => 'full',
    flagSet: id => { flags[id] = true; }, emitProgress: (type, payload) => events.push({ type, payload }),
    scenes: { top: () => current, push: scene => { current = scene; return scene; } },
  };
  let current = null; vm.createContext(context); vm.runInContext(hostFunction('presentRadio'), context);
  context.presentRadio('review', {});
  return { options: () => options, complete: () => callback(), events, flags, quiet: () => quiet, reserved: () => reserved };
}

test('actual portable radio host awards only a finished transmission, with a captioned quiet path when dread is reduced', async () => {
  const f = radioFixture({ reduced: true });
  assert.equal(await f.options().onEgg(), true);
  assert.equal(f.quiet(), true); assert.equal(f.reserved(), 0);
  assert.equal(f.events.filter(e=>e.type===EVENT_TYPES.SECRET_DISCOVERED).length, 0); assert.equal(f.flags['radio.hidden-channel.heard'], undefined);
  assert.equal(f.events[0].type,EVENT_TYPES.RADIO_USED);assert.equal(f.events[0].payload.kind,'listening');
  f.complete();
  assert.equal(f.flags['radio.hidden-channel.heard'], true);
  assert.equal(f.events.filter(e=>e.type===EVENT_TYPES.SECRET_DISCOVERED).length, 1);
  assert.equal(f.events.at(-1).payload.id, 'off-air');
});

test('an exhausted ambient budget uses the quiet discovery and does not make completion unreachable', async () => {
  const f = radioFixture({ budget: false });
  assert.equal(await f.options().onEgg(), true);
  assert.equal(f.quiet(), true); assert.equal(f.reserved(), 0);
  f.complete(); assert.equal(f.events.at(-1).payload.id, 'off-air');
});

test('the ordinary hidden transmission spends its bounded startle opportunity once', async () => {
  const f = radioFixture(); assert.equal(await f.options().onEgg(), true);
  assert.equal(f.quiet(), false); assert.equal(f.reserved(), 1); assert.equal(f.events.filter(e=>e.type===EVENT_TYPES.SECRET_DISCOVERED).length, 0);
});

test('ordinary tuning and volume count deliberate listening once per opened set; viewing requests alone does not', () => {
  const f=radioFixture();
  assert.equal(f.events.length,0);
  f.options().onInstrumentControl('battery',{id:'battery'});
  f.options().onInstrumentControl('press',{id:'confirm'});
  assert.equal(f.events.length,0);
  f.options().onInstrumentControl('channel',{id:'channel',direction:1});
  f.options().onInstrumentControl('press',{id:'volume'});
  assert.equal(f.events.length,1);assert.equal(f.events[0].payload.kind,'listening');
  const quiet=radioFixture();
  quiet.options().onVolume(0);
  quiet.options().onInstrumentControl('channel',{id:'channel',direction:1});
  assert.equal(quiet.events.length,0,'silencing the set and silent tuning do not count as listening');
  quiet.options().onVolume(.25);
  assert.equal(quiet.events.length,1,'deliberately restoring receive volume counts');
});

test('the actual van phone host distinguishes completing its exchange from cancelling it', () => {
  for (const finish of ['onCancel', 'onDone']) {
    const events = []; let options;
    const context = { phoneWorld: { van: {} }, ensureCtx() {}, phoneWorldLine: () => ({ stopBreathing() {}, farClear() {} }),
      saveCommit() {}, getSave: () => ({ flags: {} }), PAYPHONE_STORY: {},
      converse: (_id, _nodes, value) => { options = value; return true; },
      emitProgress: (type, payload) => events.push({ type, payload }), EVENT_TYPES };
    vm.createContext(context); vm.runInContext(hostFunction('payphoneAnswerVan'), context);
    assert.equal(context.payphoneAnswerVan(), true); assert.equal(events.length, 0);
    options[finish](); assert.equal(events.length, finish === 'onDone' ? 1 : 0);
    if (events.length) assert.equal(events[0].payload.id, 'call-yourself');
  }
});

test('actual disclosure cancellation stays replayable and only the completed scene grants its receipt', () => {
  const events = [], seen = new Set(['playback-the_tub']), profile = { completion: { disclosures: {} } };
  const flags={};
  let options;
  const context = { PLAYBACK_DIALOGS: { the_tub: () => ({ start: {} }) }, getMeta: () => profile,
    thoughtHad: id => seen.has(id), unmarkThought: id => seen.delete(id), flagGet: () => null,
    flagTest:id=>!!flags[id],flagSet:id=>{flags[id]=true;},getSave:()=>({flags}),
    think: (id, _nodes, value) => { seen.add(id); options = value; return true; },
    emitProgress: (type, payload) => { events.push({ type, payload }); if (type === EVENT_TYPES.DISCLOSURE_HEARD) profile.completion.disclosures[payload.id] = {}; },
    EVENT_TYPES, saveCommit() {}, saveThoughtState: () => [...seen] };
  vm.createContext(context); vm.runInContext(hostFunction('maybePlaybackDialog'), context);
  context.maybePlaybackDialog('the_tub');
  assert.equal(events.some(event => event.type === EVENT_TYPES.DISCLOSURE_HEARD), false);
  options.onCancel(); assert.equal(seen.has('playback-the_tub'), false);
  context.maybePlaybackDialog('the_tub'); options.onDone();
  assert.equal(events.filter(event => event.type === EVENT_TYPES.DISCLOSURE_HEARD).length, 1);
  const count = events.length; context.maybePlaybackDialog('the_tub'); assert.equal(events.length, count);
  // A new night retains the receipt but resets its narrative completion.
  delete flags['playback.disclosure.complete.the_tub'];seen.clear();
  context.maybePlaybackDialog('the_tub');
  assert.ok(events.length>count,'a previous profile receipt cannot suppress the new night');
  options.onDone();
  assert.equal(flags['playback.disclosure.complete.the_tub'],true);
});

test('the actual Chapel host files its authored manifest slot exactly once before combat, without a fake take event', () => {
  const events=[],takes=new Set();
  const save={run:{ledger:{reference:{breadth:1}}}};
  const context={R3:{r3dPrepareRecordistRelease:()=>Promise.resolve(true)},normalizeChunkSurfState:()=>({finale:{}}),getSave:()=>save,
    SOURCE_FINALE_ROUTE:{CHAPEL:'chapel'},chapelTowerState:()=>({phase:'other'}),
    CHAPEL_TOWER_PHASE:{TOWER_CLEARED:'cleared'},recordStorySpine(){},finaleActive:false,
    ENCOUNTERS:{encounterCleared:()=>false},flagGet:()=>null,
    REC:{hasTake:id=>takes.has(id),addTake:id=>takes.add(id),saveRecState:()=>({takes:[...takes]})},
    saveCommit(){},EVENT_TYPES,emitProgress:(type,payload)=>events.push({type,payload}),
    chapelBoss:()=>({}),openEncounterBattle:()=>{
      assert.equal(events.at(-1)?.type,EVENT_TYPES.MANIFEST_SLOT_COMPLETED);
    }};
  vm.createContext(context);vm.runInContext(hostFunction('beginConfrontation'),context);
  context.beginConfrontation();context.beginConfrontation();
  assert.equal(events.length,1);assert.equal(events[0].payload.roomId,'lux_nova');
  assert.ok(takes.has('lux_nova'));
});

test('rereading a previously collected hosted paper still uses the tracked document path',()=>{
  const read=[],page={id:'work-order-carbon'};
  const context={HOSTED_PAGES:new Map([['drawer',page]]),OBJ:{objState:()=>({read:[page.id]})},
    readDocumentTracked:p=>read.push(p.id),DOC:{readDocument:()=>assert.fail('untracked reread')}};
  vm.createContext(context);vm.runInContext(hostFunction('takeHostedPage'),context);
  assert.equal(context.takeHostedPage('drawer'),true);assert.deepEqual(read,[page.id]);
});
