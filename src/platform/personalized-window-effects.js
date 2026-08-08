import { isTauriRuntime } from './detect.js';
import {
  WINDOW_ECHO_LABELS,
  compileWindowChoreography,
} from './window-choreography.js';

const SIDE_LABEL = 'interference-monitor';
const TITLE = 'Chunk Surfer';
const HOLD_MS = 1200;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Retained as a pure compatibility helper for the existing monitor-layout lab.
export function substantiallyOnscreenPosition({ position, size, monitor, dx = 0, dy = 0 } = {}) {
  const next = { x: Number(position?.x) || 0, y: Number(position?.y) || 0 };
  if (!monitor?.position || !monitor?.size || !size) return { x: next.x + dx, y: next.y + dy };
  const minVisibleX = Math.round((Number(size.width) || 0) * 0.8);
  const minVisibleY = Math.round((Number(size.height) || 0) * 0.8);
  return {
    x: Math.max(monitor.position.x - size.width + minVisibleX,
      Math.min(monitor.position.x + monitor.size.width - minVisibleX, next.x + dx)),
    y: Math.max(monitor.position.y - size.height + minVisibleY,
      Math.min(monitor.position.y + monitor.size.height - minVisibleY, next.y + dy)),
  };
}

function makeToken(cryptoApi = globalThis.crypto) {
  const raw = cryptoApi?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `session-${String(raw).replace(/[^a-z0-9-]/giu, '').slice(0, 80)}`;
}

export function createPersonalizedWindowEffects({
  onEmergency = () => {},
  now = () => Date.now(),
  runtimeApi = null,
  mainWindow = null,
  sleep = wait,
  tokenFactory = makeToken,
  documentApi = globalThis.document,
} = {}) {
  let api = runtimeApi;
  let main = mainWindow;
  let sidecar = null;
  const echoes = new Map();
  let current = null;
  let holdStarted = 0;
  let holdTimer = null;
  let keyInstalled = false;
  let eventUnlisten = null;
  let queue = Promise.resolve();

  const safe = (task) => Promise.resolve().then(task).catch(() => null);

  async function loadApi() {
    if (api) return api;
    if (!isTauriRuntime()) return null;
    try {
      const windowApi = await import('@tauri-apps/api/window');
      const webviewApi = await import('@tauri-apps/api/webviewWindow');
      const eventApi = await import('@tauri-apps/api/event');
      const coreApi = await import('@tauri-apps/api/core');
      api = { ...windowApi, ...webviewApi, ...eventApi, ...coreApi };
      main = windowApi.getCurrentWindow();
    } catch (_) { api = null; }
    return api;
  }

  function clearInternal() {
    const layer = documentApi?.getElementById?.('window-choreography-layer');
    if (layer) {
      layer.classList.remove('active');
      layer.replaceChildren();
    }
    if (documentApi?.documentElement?.dataset) delete documentApi.documentElement.dataset.windowChoreography;
  }

  function ensureInternalLayer() {
    if (!documentApi?.createElement || !documentApi?.body) return null;
    let layer = documentApi.getElementById('window-choreography-layer');
    if (layer) return layer;
    const style = documentApi.createElement('style');
    style.id = 'window-choreography-style';
    style.textContent = `
      #window-choreography-layer{position:fixed;inset:0;z-index:2147483000;pointer-events:none;opacity:0;transition:opacity 90ms linear;overflow:hidden}
      #window-choreography-layer.active{opacity:1}
      #window-choreography-layer .arch{position:absolute;left:calc(var(--x)*100%);top:calc(var(--y)*100%);width:calc(var(--w)*100%);height:calc(var(--h)*100%);border:2px solid rgba(197,224,214,.7);box-shadow:0 0 0 100vmax rgba(0,4,4,.72),inset 0 0 54px rgba(188,232,216,.18);transition:all 357ms cubic-bezier(.2,.8,.2,1)}
      #window-choreography-layer[data-aperture="pool-reflection"] .arch{border-radius:48% 48% 10% 10%/28% 28% 8% 8%;box-shadow:0 0 0 100vmax rgba(0,5,7,.75),inset 0 -34px 46px rgba(153,216,210,.18)}
      #window-choreography-layer[data-aperture="proscenium"] .arch{border-width:12px 3px 3px;clip-path:polygon(0 0,100% 0,96% 100%,4% 100%)}
      #window-choreography-layer[data-aperture="lancet"] .arch{border-radius:50% 50% 4% 4%/34% 34% 3% 3%}
      #window-choreography-layer[data-aperture="occluded"] .arch{background:repeating-linear-gradient(90deg,rgba(0,0,0,.94) 0 21%,transparent 21% 29%)}
      #window-choreography-layer .echo{position:absolute;top:9%;bottom:9%;width:18%;border:1px solid rgba(194,220,211,.55);background:linear-gradient(165deg,rgba(192,225,215,.12),rgba(0,0,0,.78));box-shadow:0 0 36px rgba(141,205,190,.1)}
      #window-choreography-layer .echo:nth-child(2){left:3%}#window-choreography-layer .echo:nth-child(3){right:3%}#window-choreography-layer .echo:nth-child(4){left:41%}
    `;
    layer = documentApi.createElement('div');
    layer.id = 'window-choreography-layer';
    documentApi.head?.append(style);
    documentApi.body.append(layer);
    return layer;
  }

  async function renderInternal(plan) {
    const layer = ensureInternalLayer();
    if (!layer) { await sleep(plan.timing.durationMs); return; }
    const target = plan.main[1];
    const arch = documentApi.createElement('div');
    arch.className = 'arch';
    arch.style.setProperty('--x', target.geometry.x);
    arch.style.setProperty('--y', target.geometry.y);
    arch.style.setProperty('--w', target.geometry.width);
    arch.style.setProperty('--h', target.geometry.height);
    layer.dataset.aperture = target.aperture;
    layer.replaceChildren(arch);
    for (const echo of plan.echoes) {
      const pane = documentApi.createElement('div');
      pane.className = 'echo';
      pane.dataset.silhouette = echo.silhouette;
      layer.append(pane);
    }
    documentApi.documentElement.dataset.windowChoreography = plan.stage;
    layer.classList.add('active');
    globalThis.window?.dispatchEvent?.(new CustomEvent('chunk-surfer:window-choreography', { detail: plan }));
    await sleep(plan.timing.durationMs);
    if (current?.token === plan.token) clearInternal();
  }

  async function ready(webview) {
    await new Promise((resolve) => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; resolve(); } };
      webview.once?.('tauri://created', done);
      webview.once?.('tauri://error', done);
      setTimeout(done, 800);
    });
  }

  async function ensureSidecar(payload = {}) {
    if (!current || current.intensity === 'low' || !await loadApi() || !api.WebviewWindow) return null;
    sidecar = await api.WebviewWindow.getByLabel(SIDE_LABEL);
    if (!sidecar) {
      sidecar = new api.WebviewWindow(SIDE_LABEL, {
        url: 'interference-monitor.html?mode=monitor',
        title: 'AUDIOCORP / MONITOR RETURN',
        width: 460, height: 290, minWidth: 380, minHeight: 230,
        resizable: true, center: true, focus: false, alwaysOnTop: false,
      });
      await ready(sidecar);
    }
    await safe(() => sidecar.show());
    await safe(() => api.emitTo(SIDE_LABEL, 'interference-sidecar', payload));
    return sidecar;
  }

  async function prewarmEcho(label, silhouette = 'return') {
    if (!current || !await loadApi() || !api.WebviewWindow || !WINDOW_ECHO_LABELS.includes(label)) return null;
    const token = current.token;
    let echo = await api.WebviewWindow.getByLabel(label);
    if (!echo) {
      echo = new api.WebviewWindow(label, {
        url: `interference-monitor.html?mode=echo&silhouette=${encodeURIComponent(silhouette)}`,
        title: 'AUDIOCORP / ARCHITECTURAL RETURN',
        width: 360, height: 560, minWidth: 260, minHeight: 320,
        resizable: false, visible: false, focus: false, alwaysOnTop: false, skipTaskbar: true,
      });
      await ready(echo);
    }
    if (current?.token !== token) { await safe(() => echo.close()); return null; }
    echoes.set(label, echo);
    await safe(() => echo.hide());
    return echo;
  }

  async function showEchoes(plan, payload) {
    if (plan.displayMode !== 'native' || !plan.echoes.length) return;
    for (const entry of plan.echoes) await prewarmEcho(entry.label, entry.silhouette);
    for (const entry of plan.echoes) {
      await safe(() => api.invoke('chunk_window_choreography_place_echo', {
        label: entry.label, index: entry.index, count: plan.echoes.length,
      }));
      await safe(() => api.emitTo(entry.label, 'interference-sidecar', {
        ...payload, state: entry.silhouette.toUpperCase(), echo: true,
      }));
    }
  }

  async function hideEchoes() {
    await Promise.all([...echoes.values()].map((echo) => safe(() => echo.hide())));
  }

  async function closeAuxiliary() {
    const all = [sidecar, ...echoes.values()].filter(Boolean);
    sidecar = null;
    echoes.clear();
    await Promise.all(all.map((webview) => safe(() => webview.close())));
  }

  function installEmergencyControls() {
    if (!keyInstalled && typeof window !== 'undefined') {
      keyInstalled = true;
      window.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || event.repeat || !current) return;
        holdStarted = now();
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
          if (current && holdStarted && now() - holdStarted >= HOLD_MS - 25) void emergencyRestore();
        }, HOLD_MS);
      }, true);
      window.addEventListener('keyup', (event) => {
        if (event.key !== 'Escape') return;
        holdStarted = 0;
        clearTimeout(holdTimer);
      }, true);
    }
    if (!eventUnlisten && api?.listen) {
      safe(async () => {
        eventUnlisten = await api.listen('interference-emergency-restore', () => { void emergencyRestore(); });
      });
    }
  }

  async function begin(options = {}) {
    if (current) await emergencyRestore({ notify: false });
    const token = tokenFactory();
    const intensity = ['low', 'standard', 'hostile'].includes(options.intensity) ? options.intensity : 'standard';
    current = {
      token,
      intensity,
      stage: options.encounterId === 'source-final' ? 'finale' : options.stage || 'recognition',
      encounterId: options.encounterId || '',
      fullscreen: !!options.fullscreen,
      nativePositioning: false,
      originalTitle: null,
      lastCue: null,
    };
    await loadApi();
    installEmergencyControls();
    current.originalTitle = await safe(() => main?.title?.()) || TITLE;
    if (api?.invoke && intensity !== 'low' && !current.fullscreen) {
      const capabilities = await safe(() => api.invoke('chunk_window_choreography_capabilities'));
      current.nativePositioning = capabilities?.nativePositioning !== false;
      if (current.nativePositioning) {
        current.nativePositioning = !!await safe(() => api.invoke('chunk_window_choreography_begin', { token }));
      }
    }
    const prewarmCount = intensity === 'hostile'
      ? (current.stage === 'finale' ? 3 : current.stage === 'handoff' ? 2 : 0)
      : 0;
    for (let index = 0; index < prewarmCount; index += 1) void prewarmEcho(WINDOW_ECHO_LABELS[index]);
    return token;
  }

  async function perform(kind, payload = {}) {
    const session = current;
    if (!session || (payload.token && payload.token !== session.token)) return false;
    const cueId = kind === 'loop' && session.lastCue ? 'loop' : kind;
    const plan = compileWindowChoreography({
      token: session.token,
      stage: payload.stage || session.stage,
      encounterId: session.encounterId,
      cueId,
      intensity: session.intensity,
      fullscreen: session.fullscreen,
      nativePositioning: session.nativePositioning,
      inputLocked: payload.inputLocked === true,
      variant: payload.variant || 0,
    });
    if (!plan || current?.token !== session.token) return false;
    const focused = await safe(() => main?.isFocused?.());
    if (focused === false) await safe(() => main?.requestUserAttention?.(2));
    await safe(() => main?.setTitle?.(String(payload.title || `AUDIOCORP / ${cueId.toUpperCase()}`).slice(0, 96)));
    if (cueId === 'broadcast' && plan.stage !== 'foreshadow') await ensureSidecar(payload);
    await showEchoes(plan, payload);
    if (plan.displayMode === 'native' && api?.invoke) {
      const executed = await safe(() => api.invoke('chunk_window_choreography_execute', { plan }));
      if (!executed && current?.token === session.token) await renderInternal({ ...plan, displayMode: 'internal' });
    } else {
      await renderInternal(plan);
    }
    await hideEchoes();
    if (current?.token !== session.token) return false;
    await safe(() => main?.setTitle?.(session.originalTitle || TITLE));
    session.lastCue = cueId;
    return true;
  }

  function apply(kind, payload = {}) {
    const token = current?.token;
    queue = queue.then(
      () => current?.token === token ? perform(kind, payload) : false,
      () => current?.token === token ? perform(kind, payload) : false,
    );
    return queue;
  }

  function reject(payload = {}) {
    return apply('reject', { ...payload, inputLocked: true });
  }

  async function end(tokenOrOptions = null) {
    const expectedToken = typeof tokenOrOptions === 'string' ? tokenOrOptions : null;
    const closeSidecar = typeof tokenOrOptions === 'object' && tokenOrOptions !== null
      ? tokenOrOptions.closeSidecar !== false
      : true;
    const session = current;
    if (!session || (expectedToken && expectedToken !== session.token)) return false;
    // Cancel first. Native animation and queued JS work see the stale token
    // before any restoration or window close is awaited.
    current = null;
    clearTimeout(holdTimer);
    holdStarted = 0;
    clearInternal();
    await safe(() => main?.setTitle?.(session.originalTitle || TITLE));
    if (api?.invoke) await safe(() => api.invoke('chunk_window_choreography_restore', { token: session.token }));
    await hideEchoes();
    if (closeSidecar) await closeAuxiliary();
    return true;
  }

  async function emergencyRestore({ notify = true } = {}) {
    const session = current;
    // State is invalidated before the first await: hold-Escape is an immediate
    // abort, not another item at the back of the choreography queue.
    current = null;
    clearTimeout(holdTimer);
    holdStarted = 0;
    clearInternal();
    await safe(() => main?.setTitle?.(session?.originalTitle || TITLE));
    if (api?.invoke) await safe(() => api.invoke('chunk_window_choreography_restore', { token: null }));
    await closeAuxiliary();
    if (notify) onEmergency();
    return true;
  }

  return {
    begin,
    apply,
    reject,
    end,
    emergencyRestore,
    active: () => !!current,
    sessionToken: () => current?.token || null,
    statusLine: () => current ? 'HOLD ESC · RESTORE ALL GAME WINDOWS' : '',
  };
}
