// THE MESSAGE HE LEFT LYLE, KEPT ON THIS DEVICE.
//
// Recorded from the player's own microphone at the phone box, only with the
// microphone on and the psychological profile's local-data consent given
// (src/game/payphone-duplex.js voicemailAllowed). It never leaves the browser:
// one Blob per run in IndexedDB, next to the causal tape's database, and it is
// deleted with the rest of the local dossier when that consent is withdrawn.

const DB = 'chunk-surfer-voicemail-v1';
const STORE = 'messages';

function open() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    let request;
    try { request = globalThis.indexedDB.open(DB, 1); } catch (_) { resolve(null); return; }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function run(mode, fn) {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, mode);
    let result = null;
    const request = fn(tx.objectStore(STORE));
    if (request) request.onsuccess = () => { result = request.result ?? null; };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); resolve(null); };
    tx.onabort = () => { db.close(); resolve(null); };
  });
}

// { blob, seconds, atTapeSeconds, recordedAt, runId }
export function putVoicemail(runId, record) {
  if (!runId || !record?.blob) return Promise.resolve(false);
  return run('readwrite', (store) => store.put({ ...record, runId: String(runId) }, String(runId))).then(() => true);
}
export function getVoicemail(runId) {
  if (!runId) return Promise.resolve(null);
  return run('readonly', (store) => store.get(String(runId)));
}
export function deleteVoicemail(runId) {
  if (!runId) return Promise.resolve(false);
  return run('readwrite', (store) => store.delete(String(runId))).then(() => true);
}
export function clearVoicemails() {
  return run('readwrite', (store) => store.clear()).then(() => true);
}
