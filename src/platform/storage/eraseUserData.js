// Delete only this game's WebView data; other origins and databases are untouched.
export const GAME_DATABASES = Object.freeze([
  'chunk-surfer-causal-v1', 'chunk-surfer-take-slates',
  'chunk-surfer-source-drive-audio', 'chunk-surfer-voicemail-v1',
]);
export function eraseGameKeys(store) {
  if (!store) return;
  const keys = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key?.startsWith('chunk-surfer:') || key?.startsWith('chunk-surfer.')) keys.push(key);
  }
  for (const key of keys) store.removeItem(key);
}
export async function eraseGameWebData({ local = globalThis.localStorage, session = globalThis.sessionStorage, idb = globalThis.indexedDB } = {}) {
  eraseGameKeys(local);
  eraseGameKeys(session);
  if (!idb) return;
  for (const name of GAME_DATABASES) {
    await new Promise((resolve, reject) => {
      const request = idb.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error(`Unable to erase ${name}`));
      request.onblocked = () => reject(new Error(`Close other game windows to erase ${name}`));
    });
  }
}
