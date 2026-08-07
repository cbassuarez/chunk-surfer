import { isTauriRuntime } from './detect.js';

const SIDE_LABEL = 'interference-monitor';
const TITLE = 'Chunk Surfer';
const HOLD_MS = 1200;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function substantiallyOnscreenPosition({ position, size, monitor, dx = 0, dy = 0 } = {}) {
  const next = { x: Number(position?.x) || 0, y: Number(position?.y) || 0 };
  if (!monitor?.position || !monitor?.size || !size) return { x: next.x + dx, y: next.y + dy };
  const minVisibleX = Math.round((Number(size.width) || 0) * .8);
  const minVisibleY = Math.round((Number(size.height) || 0) * .8);
  const left = monitor.position.x - size.width + minVisibleX;
  const right = monitor.position.x + monitor.size.width - minVisibleX;
  const top = monitor.position.y - size.height + minVisibleY;
  const bottom = monitor.position.y + monitor.size.height - minVisibleY;
  return {
    x: Math.max(left, Math.min(right, next.x + dx)),
    y: Math.max(top, Math.min(bottom, next.y + dy)),
  };
}

export function createPersonalizedWindowEffects({
  onEmergency = () => {},
  now = () => Date.now(),
  runtimeApi = null,
  mainWindow = null,
  sleep = wait,
} = {}) {
  let api = runtimeApi;
  let main = mainWindow;
  let sidecar = null;
  let snapshot = null;
  let active = false;
  let intensity = 'standard';
  let reducedMotion = false;
  let queue = Promise.resolve();
  let lastKind = null;
  let holdStarted = 0;
  let holdTimer = null;
  let keyInstalled = false;

  const safe = (task) => Promise.resolve().then(task).catch(() => null);

  async function loadApi() {
    if (api) return api;
    if (!isTauriRuntime()) return null;
    try {
      const windowApi = await import('@tauri-apps/api/window');
      const webviewApi = await import('@tauri-apps/api/webviewWindow');
      const eventApi = await import('@tauri-apps/api/event');
      api = { ...windowApi, ...webviewApi, ...eventApi };
      main = windowApi.getCurrentWindow();
    } catch (_) { api = null; }
    return api;
  }

  async function capture() {
    if (!await loadApi()) return null;
    return {
      title: await main.title(),
      position: await main.outerPosition(),
      size: await main.outerSize(),
      fullscreen: await main.isFullscreen(),
      minimized: await main.isMinimized(),
      alwaysOnTop: await main.isAlwaysOnTop(),
    };
  }

  function installEmergencyKey() {
    if (keyInstalled || typeof window === 'undefined') return;
    keyInstalled = true;
    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.repeat || !active) return;
      holdStarted = now();
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => {
        if (!active || !holdStarted || now() - holdStarted < HOLD_MS - 25) return;
        void emergencyRestore();
      }, HOLD_MS);
    }, true);
    window.addEventListener('keyup', (event) => {
      if (event.key !== 'Escape') return;
      holdStarted = 0;
      clearTimeout(holdTimer);
    }, true);
  }

  async function begin(options = {}) {
    intensity = ['low', 'standard', 'hostile'].includes(options.intensity) ? options.intensity : 'standard';
    reducedMotion = !!options.reducedMotion;
    active = true;
    installEmergencyKey();
    if (!snapshot) snapshot = await capture();
    return !!snapshot;
  }

  async function ensureSidecar(payload = {}) {
    if (!active || intensity === 'low' || !await loadApi()) return null;
    sidecar = await api.WebviewWindow.getByLabel(SIDE_LABEL);
    if (!sidecar) {
      sidecar = new api.WebviewWindow(SIDE_LABEL, {
        url: 'interference-monitor.html',
        title: 'AUDIOCORP / MONITOR RETURN',
        width: 460,
        height: 290,
        minWidth: 380,
        minHeight: 230,
        resizable: true,
        center: true,
        focus: false,
        alwaysOnTop: intensity === 'hostile',
      });
      await new Promise((resolve) => {
        let settled = false;
        const done = () => { if (!settled) { settled = true; resolve(); } };
        sidecar.once('tauri://created', done);
        sidecar.once('tauri://error', done);
        setTimeout(done, 800);
      });
    }
    await safe(() => api.emitTo(SIDE_LABEL, 'interference-sidecar', payload));
    return sidecar;
  }

  async function restoreMain() {
    if (!main || !snapshot) return;
    await safe(() => main.show());
    if (await safe(() => main.isMinimized())) await safe(() => main.unminimize());
    if (await safe(() => main.isFullscreen()) !== snapshot.fullscreen) await safe(() => main.setFullscreen(snapshot.fullscreen));
    await safe(() => main.setAlwaysOnTop(snapshot.alwaysOnTop));
    await safe(() => main.setSize(new api.PhysicalSize(snapshot.size.width, snapshot.size.height)));
    await safe(() => main.setPosition(new api.PhysicalPosition(snapshot.position.x, snapshot.position.y)));
    await safe(() => main.setTitle(snapshot.title || TITLE));
    if (snapshot.minimized) await safe(() => main.minimize());
  }

  async function boundedPosition(dx, dy) {
    const monitor = await safe(() => main.currentMonitor());
    const position = await main.outerPosition();
    const size = await main.outerSize();
    const next = substantiallyOnscreenPosition({ position, size, monitor, dx, dy });
    return new api.PhysicalPosition(next.x, next.y);
  }

  async function perform(kind, payload = {}) {
    if (!active || !await loadApi()) return false;
    if (!snapshot) snapshot = await capture();
    const focused = await safe(() => main.isFocused());
    if (!focused) await safe(() => main.requestUserAttention(2));
    const effectiveKind = kind === 'loop' ? (lastKind || 'broadcast') : kind;
    const title = String(payload.title || `AUDIOCORP / ${String(kind || 'RETURN').toUpperCase()}`).slice(0, 96);
    await safe(() => main.setTitle(title));
    if (effectiveKind === 'broadcast') await ensureSidecar(payload);
    if (intensity !== 'low' && !reducedMotion) {
      if (effectiveKind === 'overload') {
        const size = await main.outerSize();
        await safe(() => main.setSize(new api.PhysicalSize(Math.max(960, Math.round(size.width * .88)), Math.max(600, Math.round(size.height * .9)))));
        await safe(async () => main.setPosition(await boundedPosition(28, 18)));
        if (sidecar) await safe(() => sidecar.setAlwaysOnTop(false));
        await safe(() => main.setAlwaysOnTop(true));
      } else if (effectiveKind === 'conceal' && intensity === 'hostile') {
        await safe(() => main.hide()); await sleep(420); await safe(() => main.show());
      } else if (effectiveKind === 'silence') {
        if (sidecar) await safe(() => sidecar.hide());
        if (intensity === 'hostile') await safe(() => main.minimize());
        await sleep(520);
        if (sidecar) await safe(() => sidecar.show());
        if (intensity === 'hostile') await safe(() => main.unminimize());
      }
    }
    lastKind = effectiveKind;
    await sleep(kind === 'silence' ? 580 : 720);
    await restoreMain();
    if (sidecar) await safe(() => sidecar.setAlwaysOnTop(intensity === 'hostile'));
    return true;
  }

  function apply(kind, payload = {}) {
    queue = queue.then(() => perform(kind, payload), () => perform(kind, payload));
    return queue;
  }

  function reject(payload = {}) {
    lastKind = 'reject';
    queue = queue.then(async () => {
      await restoreMain();
      if (sidecar && api) await safe(() => api.emitTo(SIDE_LABEL, 'interference-sidecar', { ...payload, state: 'REJECTED' }));
      return true;
    });
    return queue;
  }

  async function end({ closeSidecar = true } = {}) {
    active = false;
    clearTimeout(holdTimer); holdStarted = 0;
    await queue.catch(() => null);
    await restoreMain();
    if (closeSidecar && sidecar) await safe(() => sidecar.close());
    sidecar = null; snapshot = null; lastKind = null;
  }

  async function emergencyRestore() {
    await end({ closeSidecar: true });
    onEmergency();
  }

  return {
    begin,
    apply,
    reject,
    end,
    emergencyRestore,
    active: () => active,
    statusLine: () => active ? 'HOLD ESC · RESTORE WINDOWS / DISABLE INTERFERENCE' : '',
  };
}
