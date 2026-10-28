import test from 'node:test';
import assert from 'node:assert/strict';
import { DesktopStorage, MemoryFileAdapter } from '../src/platform/storage/desktopStorage.js';
import { eraseGameWebData, GAME_DATABASES } from '../src/platform/storage/eraseUserData.js';

function webStorage(entries) {
  const data = new Map(entries);
  return { get length() { return data.size; }, key: i => [...data.keys()][i], getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k), data };
}
test('erase includes legacy game keys and private recordings, leaving unrelated origin data intact', async () => {
  const local = webStorage([['chunk-surfer:save:v4','old'], ['chunk-surfer:meta:v2','old'], ['chunk-surfer.sd-off','1'], ['other-app','safe']]);
  const session = webStorage([['chunk-surfer:sample','old'], ['unrelated','safe']]);
  const deleted = [];
  const idb = { deleteDatabase(name) { deleted.push(name); const req = {}; queueMicrotask(() => req.onsuccess()); return req; } };
  await eraseGameWebData({ local, session, idb });
  assert.deepEqual([...local.data.keys()], ['other-app']);
  assert.deepEqual([...session.data.keys()], ['unrelated']);
  assert.deepEqual(deleted, GAME_DATABASES);
});
test('a blocked database is reported instead of claiming the erase succeeded', async () => {
  const idb = { deleteDatabase() { const req = {}; queueMicrotask(() => req.onblocked()); return req; } };
  await assert.rejects(eraseGameWebData({ local: null, session: null, idb }), /Close other game windows/);
});
test('desktop deletion removes backups, pending writes, migration and private field returns', async () => {
  const adapter = new MemoryFileAdapter();
  for (const [dir, path] of [['data','saves/autosave.json'], ['data','saves/backup/autosave.previous.json'], ['data','causal/latest.json.tmp'], ['data','migration/localstorage-import-v1.json'], ['data','field_returns/a/field_audio.wav'], ['data','profile.previous.json'], ['config','settings.json.tmp'], ['config','personalized-interference.key']]) await adapter.writeText(path,'old',dir);
  await adapter.writeText('unrelated','safe','data');
  const storage = new DesktopStorage({adapter});
  await storage.deleteAllUserData();
  assert.deepEqual([...adapter.files.keys()], ['data:unrelated']);
  const reinstalled = new DesktopStorage({adapter});
  await reinstalled.init();
  assert.equal(await reinstalled.loadSave(), null);
  assert.equal((await reinstalled.loadProfile()).runs || 0, 0);
});
test('desktop erase propagates removal errors', async () => {
  const adapter = new MemoryFileAdapter();
  adapter.remove = async () => { throw new Error('permission denied'); };
  await assert.rejects(new DesktopStorage({adapter}).deleteAllUserData(), /permission denied/);
});

test('title memory requires a second confirmation and the in-game menu does not expose erase', async () => {
  const { makeSettingsScene } = await import('../src/game/settings.js');
  let calls = 0;
  const hooks = { eraseAllForUninstall: () => { calls++; } };
  const title = makeSettingsScene({ initialTab:'memory', hooks });
  for (let i = 0; i < 8; i++) title.key({key:'ArrowDown'});
  title.key({key:'Enter'});
  assert.equal(calls, 0);
  title.key({key:'Enter'});
  assert.equal(calls, 1);
  const duringRun = makeSettingsScene({ inGame:true, initialTab:'memory', hooks });
  for (let i = 0; i < 8; i++) duringRun.key({key:'ArrowDown'});
  duringRun.key({key:'Enter'});
  duringRun.key({key:'Enter'});
  assert.equal(calls, 1);
});


test('production reset drains prior writes, blocks late saves and reloads without legacy progress', async () => {
  const oldLocal = globalThis.localStorage, oldSession = globalThis.sessionStorage;
  const local = webStorage([['chunk-surfer:meta:v2', JSON.stringify({ runs: 9, achievements: { past: true } })], ['chunk-surfer:save:v4', JSON.stringify({ version:4, flags:{ seenBefore:true } })]]);
  globalThis.localStorage = local; globalThis.sessionStorage = webStorage([]);
  try {
    const service = await import('../src/platform/storage/storageService.js');
    const { BrowserStorage } = await import('../src/platform/storage/browserStorage.js');
    await service.initGameStorage({kind:'browser'});
    await service.saveProfileQueued({runs:7});
    await service.deleteAllUserData();
    assert.equal(await service.saveProfileQueued({runs:99}), false);
    const reopened = new BrowserStorage(); await reopened.init();
    assert.equal((await reopened.loadProfile()).runs || 0, 0);
    assert.equal(await reopened.loadSave(), null);
    assert.equal(local.getItem('chunk-surfer:meta:v2'), null);
    assert.equal(local.getItem('chunk-surfer:save:v4'), null);
  } finally {
    if (oldLocal === undefined) delete globalThis.localStorage; else globalThis.localStorage = oldLocal;
    if (oldSession === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = oldSession;
  }
});

test('the reset invalidates audio operations waiting to open their databases', async () => {
  const { storeSlateAudio, invalidateSlateAudio } = await import('../src/audio/take-slate.js');
  const { storeSourceDriveAudio, invalidateSourceDriveAudio } = await import('../src/audio/source-drive-recording.js');
  const old = globalThis.indexedDB; const requests = []; let closed = 0;
  globalThis.indexedDB = { open() { const request = { result: { close() { closed++; }, transaction() { throw new Error('obsolete writes must not start'); } } }; requests.push(request); return request; } };
  try {
    const slate = storeSlateAudio('slate', new Blob(['old']));
    const field = storeSourceDriveAudio({key:'field'}, new Blob(['old']));
    invalidateSlateAudio(); invalidateSourceDriveAudio();
    requests.forEach(request => request.onsuccess());
    assert.equal(await slate, null);
    await assert.rejects(field, error => error.code === 'FIELD_RUN_CLEARED');
    assert.equal(closed, 2);
  } finally { if (old === undefined) delete globalThis.indexedDB; else globalThis.indexedDB = old; }
});
