import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave } from '../src/game/save.js';
import { freshRunRecord } from '../src/progression/schema.js';
import { BENCH_PACK_GROUPS } from '../src/game/bench-preparation.js';
import { DesktopStorage, MemoryFileAdapter } from '../src/platform/storage/desktopStorage.js';
import { prepareVanReferenceKit, vanPreparationSaveProjection, vanPreparationSaveMatches,
  persistVanPreparation,offeredVanPreparation,prepareVanCaseTake,vanWorkbenchNotesTree } from '../src/game/van-workbench-preparation.js';
import { readFileSync } from 'node:fs';

const snapshot = () => {
  const save = freshSave({ run: freshRunRecord({ now: 1000, id: 'bench-receipt' }) });
  save.flags = { 'van.preparation.v1': true, 'van.bench.v2': true, 'van.difficulty.pending': true,
    'bag.taken': true, 'kit.taken': true };
  return save;
};

test('offering a complete case is pure and defaults only to an authored available shift',()=>{
  const save=snapshot();delete save.flags['bag.taken'];delete save.flags['kit.taken'];
  const before=structuredClone(save),offer=offeredVanPreparation(save);
  assert.equal(offer.caseClaimed,false);assert.equal(offer.difficulty.preset,'contract');
  for(const group of BENCH_PACK_GROUPS)assert.equal(offer.flags[`van.packed.${group}`],true);
  for(const flag of ['bag.taken','kit.taken','map.taken'])assert.equal(offer.flags[flag],true);
  assert.deepEqual(save,before);assert.deepEqual(offeredVanPreparation(save),offer);
  for(const preset of ['dead-air','custom','invented']){
    save.settings.lastDifficulty=preset;assert.equal(offeredVanPreparation(save).difficulty.preset,'contract');
  }
  save.settings.lastDifficulty='night';assert.equal(offeredVanPreparation(save).difficulty.preset,'night');
  save.settings.lastDifficulty='dead-air';assert.equal(offeredVanPreparation(save,{endingsSeen:['helped']}).difficulty.preset,'dead-air');
  save.settings.lastDifficulty='custom';save.settings.customShiftRules={combatAssistance:'guided'};
  assert.equal(offeredVanPreparation(save,{challengeCompletions:{deadAir:true}}).difficulty.values.combatAssistance,'guided');
});

test('offered preparation preserves packed specialists, legacy issued equipment, cosmetic ownership and a saved shift draft',()=>{
  const save=snapshot();save.fieldKit.headphones='closed';save.flags['van.packed.headphones']=true;
  save.fieldKit.microphone='wide';save.vanPreparation={schema:1,difficulty:{preset:'story'}};
  assert.equal(offeredVanPreparation(save).fieldKit.headphones,'closed');
  assert.equal(offeredVanPreparation(save).fieldKit.microphone,'reference');
  assert.equal(offeredVanPreparation(save).difficulty.preset,'story');
  const legacy={...save,flags:{'bag.taken':true}};
  assert.equal(offeredVanPreparation(legacy).fieldKit.microphone,'wide');
  assert.equal(offeredVanPreparation(legacy).difficultyLocked,true);
  assert.equal(offeredVanPreparation(legacy).difficulty.preset,save.run.rules.currentPreset);
  save.fieldKit.cosmetics.faceplate='witness';
  assert.equal(offeredVanPreparation(save).fieldKit.cosmetics.faceplate,'aluminum');
  assert.equal(offeredVanPreparation(save,{endingsSeen:['helped','sacrifice']}).fieldKit.cosmetics.faceplate,'witness');
});

test('one take patch acquires the complete case and finalizes once without mutating its offered source',()=>{
  const save=snapshot();delete save.flags['bag.taken'];delete save.flags['kit.taken'];
  save.settings.lastDifficulty='night';const before=structuredClone(save);
  const result=prepareVanCaseTake(save,null,2500);
  assert.equal(result.ok,true);assert.equal(result.event.type,'run.started');
  assert.equal(result.patch.run.id,save.run.id);assert.equal(result.patch.run.ledger.seq,1);
  assert.equal(result.patch.run.rules.startedPreset,'night');assert.equal(result.patch.flags['kit.fitted'],true);
  for(const flag of ['bag.taken','kit.taken','map.taken'])assert.equal(result.patch.flags[flag],true);
  assert.deepEqual(save,before);
  const committed={...save,...result.patch},again=prepareVanCaseTake(committed,null,3000);
  assert.equal(again.ok,true);assert.equal(again.event,null);assert.deepEqual(again.patch.fieldKit,result.patch.fieldKit);
  assert.equal(again.patch.run,undefined);assert.equal(again.patch.flags['van.run-started'],true);
  assert.equal(prepareVanCaseTake({...committed,flags:{...committed.flags,'van.closed':true}}).reason,'VAN_CLOSED');
});

test('optional notes retain the order, survey note and badge while replacing the departure exit',()=>{
  const authored=JSON.parse(readFileSync(new URL('../content/narrative/conservatory.van_kit.story.json',import.meta.url),'utf8')).nodes;
  const before=structuredClone(authored),notes=vanWorkbenchNotesTree(authored);
  assert.match(notes.hub.choices.find(choice=>choice.goto==='leave').text,/back to the workbench/);
  assert.doesNotMatch(JSON.stringify(notes.leave),/shoulder|door|buckle/i);
  for(const id of ['order','survey_note','badge','badge_taken'])assert.deepEqual(notes[id],authored[id]);
  assert.deepEqual(authored,before);
});

test('explicit reference kit fills only unpacked bays and preserves the current cosmetic and shift choices', () => {
  const save = snapshot();
  save.flags['van.packed.headphones'] = true;
  save.flags['unrelated.choice'] = true;
  Object.assign(save.fieldKit, { headphones: 'closed', microphone: 'wide', recorder: 'headroom', flashlight: 'throw' });
  save.fieldKit.cosmetics.faceplate = 'witness';
  save.vanPreparation = { schema: 1, difficulty: { preset: 'night' } };
  const before = structuredClone(save), result = prepareVanReferenceKit(save);
  assert.deepEqual(result.groups, ['microphone', 'recorder', 'flashlight']);
  assert.equal(result.changed, true);
  assert.equal(result.fieldKit.headphones, 'closed');
  for (const group of result.groups) assert.equal(result.fieldKit[group], 'reference');
  assert.deepEqual(result.fieldKit.cosmetics, save.fieldKit.cosmetics);
  assert.equal(result.flags['unrelated.choice'], true);
  for (const group of BENCH_PACK_GROUPS) assert.equal(result.flags[`van.packed.${group}`], true);
  assert.equal(result.flags['kit.fitted'], undefined);
  assert.equal(result.flags['van.difficulty.pending'], true);
  assert.deepEqual(save, before, 'construction does not commit or mutate the source');
  const again = prepareVanReferenceKit(result);
  assert.equal(again.changed, false); assert.deepEqual(again.groups, []);
  assert.deepEqual(again.fieldKit, result.fieldKit); assert.deepEqual(again.flags, result.flags);
});

test('reference packing remains deliberate on an empty bench and retains all previously packed specialist equipment', () => {
  const fresh = prepareVanReferenceKit();
  assert.deepEqual(fresh.groups, BENCH_PACK_GROUPS);
  const save = snapshot();
  Object.assign(save.fieldKit, { headphones: 'open', microphone: 'directional', recorder: 'low-draw', flashlight: 'flood' });
  for (const group of BENCH_PACK_GROUPS) save.flags[`van.packed.${group}`] = true;
  assert.deepEqual(prepareVanReferenceKit(save).fieldKit, save.fieldKit);
});

test('readback matches preparation facts while ignoring unrelated movement and key ordering', () => {
  const expected = snapshot(), actual = structuredClone(expected);
  actual.px += 2; actual.playSeconds += 30; actual.flags['unrelated.event'] = true;
  actual.run.rules.values = Object.fromEntries(Object.entries(actual.run.rules.values).reverse());
  assert.equal(vanPreparationSaveMatches(expected, actual), true);
  assert.equal(vanPreparationSaveMatches(expected, null), false);
  assert.equal(vanPreparationSaveProjection(null), null);
  for (const change of [
    save => { save.fieldKit.microphone = 'wide'; },
    save => { save.flags['van.packed.microphone'] = true; },
    save => { save.flags['map.taken'] = true; },
    save => { save.flags['van.closed'] = true; },
    save => { save.vanPreparation = { schema: 1, difficulty: { preset: 'story' } }; },
    save => { save.run.id = 'other-run'; },
    save => { save.run.ledger.seq++; },
    save => { save.run.integrity.deadAir.eligible = true; },
    save => { save.plantIncident = { spannerOwned: true }; },
    save => { save.settings.lastDifficulty = 'night'; },
  ]) {
    const changed = structuredClone(expected); change(changed);
    assert.equal(vanPreparationSaveMatches(expected, changed), false);
  }
});

test('receipt snapshots the applied session and uses queued writes before authoritative readback', async () => {
  const save = snapshot(), meta = { cosmetics: { selected: 'olive', unlocked: ['witness', 'witness'] }, stats: { runsStarted: 1 } };
  const calls = []; let writtenSave, writtenMeta;
  const pending = persistVanPreparation({ save, meta,
    saveProfile: async value => { calls.push('profile-write'); writtenMeta = value; return true; },
    saveGame: async value => { calls.push('save-write'); writtenSave = value; return true; },
    loadSave: async () => { calls.push('save-read'); return writtenSave; },
    loadProfile: async () => { calls.push('profile-read'); return { cosmetics: { selected: 'olive', unlocked: ['witness'] }, stats: { runsStarted: 9 } }; },
  });
  save.fieldKit.microphone = 'wide'; meta.cosmetics.selected = 'black';
  assert.deepEqual(await pending, { ok: true });
  assert.deepEqual(calls, ['profile-write', 'save-write', 'save-read', 'profile-read']);
  assert.equal(writtenSave.fieldKit.microphone, 'reference');
  assert.equal(writtenMeta.cosmetics.selected, 'olive');
  assert.equal(save.fieldKit.microphone, 'wide', 'receipt never rolls back current session state');
});

test('failed, swallowed and mismatched saves remain failed receipts and can be retried unchanged', async () => {
  const save = snapshot(), before = structuredClone(save); let disk = null, fail = true;
  const io = { save, saveGame: async value => { if (fail) throw new Error('disk full'); disk = value; return true; }, loadSave: async () => disk };
  assert.deepEqual(await persistVanPreparation(io), { ok: false, reason: 'SAVE_WRITE_FAILED', error: 'disk full' });
  assert.deepEqual(save, before);
  fail = false; assert.deepEqual(await persistVanPreparation(io), { ok: true });
  assert.deepEqual(await persistVanPreparation({ ...io, saveGame: async () => undefined }), { ok: false, reason: 'SAVE_NOT_ACKNOWLEDGED' });
  assert.deepEqual(await persistVanPreparation({ ...io, loadSave: async () => null }), { ok: false, reason: 'SAVE_MISMATCH' });
  assert.deepEqual(await persistVanPreparation({ ...io, loadSave: async () => { throw new Error('unreadable'); } }),
    { ok: false, reason: 'SAVE_READ_FAILED', error: 'unreadable' });
});

test('optional cosmetic receipt rejects failed profile writes and stale selections without comparing unrelated statistics', async () => {
  const save = snapshot(), meta = { cosmetics: { selected: 'witness', unlocked: ['witness'] } };
  const io = { save, meta, saveGame: async () => true, loadSave: async () => save,
    saveProfile: async () => true, loadProfile: async () => ({ cosmetics: { selected: 'aluminum', unlocked: ['witness'] } }) };
  assert.deepEqual(await persistVanPreparation(io), { ok: false, reason: 'PROFILE_MISMATCH' });
  assert.deepEqual(await persistVanPreparation({ ...io, saveProfile: async () => false }), { ok: false, reason: 'PROFILE_NOT_ACKNOWLEDGED' });
  assert.deepEqual(await persistVanPreparation({ ...io, saveProfile: async () => { throw new Error('read only'); } }),
    { ok: false, reason: 'PROFILE_WRITE_FAILED', error: 'read only' });
  assert.deepEqual(await persistVanPreparation({ ...io, loadProfile: undefined }), { ok: false, reason: 'STORAGE_UNAVAILABLE' });
  assert.deepEqual(await persistVanPreparation({}), { ok: false, reason: 'NO_SAVE' });
});

test('actual desktop adapter write failure and silently blocked schema cannot produce a successful receipt', async () => {
  const adapter = new MemoryFileAdapter();
  const desktop = new DesktopStorage({ adapter, gameVersion: 'BENCH-TEST',
    paths: { appData: '/fake/data', appConfig: '/fake/config', appLog: '/fake/log' } });
  await desktop.init();
  const save = snapshot();
  const io = { save,
    saveGame: async value => { await desktop.saveGame('autosave', value); return true; },
    loadSave: () => desktop.loadSave('autosave'),
  };
  assert.deepEqual(await persistVanPreparation(io), { ok: true });
  save.fieldKit.headphones = 'closed';
  desktop.blockedPaths.add('saves/autosave.json');
  assert.deepEqual(await persistVanPreparation(io), { ok: false, reason: 'SAVE_MISMATCH' },
    'an adapter silently refusing to overwrite a newer schema still fails authoritative comparison');
  desktop.blockedPaths.clear();
  const write = adapter.writeText.bind(adapter);
  adapter.writeText = async (path, ...args) => {
    if (path === 'saves/autosave.json.tmp') throw new Error('no disk space');
    return write(path, ...args);
  };
  assert.deepEqual(await persistVanPreparation(io), { ok: false, reason: 'SAVE_WRITE_FAILED', error: 'no disk space' });
  adapter.writeText = write;
  assert.deepEqual(await persistVanPreparation(io), { ok: true });
  assert.equal((await desktop.loadSave('autosave')).fieldKit.headphones, 'closed');
});
