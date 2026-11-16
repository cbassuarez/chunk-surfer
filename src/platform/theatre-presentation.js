import { isTauriRuntime } from './detect.js';

async function loadApi() {
  if (!isTauriRuntime()) return null;
  const [{ invoke }, { listen }] = await Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/api/event')]);
  return { invoke, listen };
}

// The backdrop is presentation only. Never wait for it on the boot/readiness
// path, and never replay a stale scene after a newer scene has taken ownership.
export function createTheatrePresentation({ api, onFillRequest = () => {}, onError = () => {} } = {}) {
  let connection, disposed = false, release, scene = { kind: 'house' }, serial = 0;
  const report = error => { if (!disposed) onError(error); };
  function connect() {
    if (!connection) connection = Promise.resolve(api || loadApi()).then(async bridge => {
      if (!bridge || disposed) return null;
      const stop = await bridge.listen('chunk-display:fullscreen-redirect', () => { if (!disposed) onFillRequest(); });
      if (disposed) { stop(); return null; }
      release = stop;
      await bridge.invoke('chunk_theatre_set', { enabled: true });
      return bridge;
    }).catch(error => { release?.(); release = null; report(error); connection = null; return null; });
    return connection;
  }
  async function dress(next = { kind: 'house' }) {
    scene = next; const owner = ++serial;
    const bridge = await connect();
    if (!bridge || disposed || owner !== serial) return false;
    try { await bridge.invoke('chunk_theatre_scene', { sceneState: next }); return true; }
    catch (error) { report(error); return false; }
  }
  return {
    start: () => dress(scene),
    scene: dress,
    composition(event = {}) {
      if (event.type === 'restore') return dress();
      // Authored full desktop Source/Chapel surfaces remain above the house.
      // Other window scenes share the loose-window palette and may supply an
      // explicit backdrop; ordinary play always returns to dithered house dark.
      if (['plan', 'composition'].includes(event.type) && event.native) {
        return dress(event.plan?.backdrop || { kind: 'wash', frontEnd: event.plan?.purpose === 'title', intensity: .16 });
      }
      return Promise.resolve(false);
    },
    dispose() { disposed = true; ++serial; release?.(); release = null; },
  };
}
