import { isTauriRuntime } from './detect.js';
import {
  WINDOW_ECHO_LABELS,
  compileWindowChoreography,
} from './window-choreography.js';

const SIDE_LABEL = 'interference-monitor';
const CHANNEL_LABELS = Object.freeze([SIDE_LABEL, ...WINDOW_ECHO_LABELS.slice(0, 2)]);
const TITLE = 'Chunk Surfer';
const HOLD_MS = 1200;
const RETURN_MS = 3000;
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
  let emergencyUnlisten = null;
  let channelUnlisten = null;
  let controlsInstalling = null;
  let queue = Promise.resolve();

  const safe = (task) => Promise.resolve().then(task).catch(() => null);
  const eventTarget = () => documentApi?.defaultView || globalThis.window || null;

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
      layer.classList.remove('active', 'interactive', 'reacquire');
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
      #window-choreography-layer{position:fixed;inset:0;z-index:2147483000;pointer-events:none;opacity:0;transition:opacity 90ms linear;overflow:hidden;font:12px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace}
      #window-choreography-layer.active{opacity:1}
      #window-choreography-layer.interactive{pointer-events:auto;background:rgba(0,3,4,.56)}
      #window-choreography-layer .arch{position:absolute;left:calc(var(--x)*100%);top:calc(var(--y)*100%);width:calc(var(--w)*100%);height:calc(var(--h)*100%);border:2px solid rgba(197,224,214,.7);box-shadow:0 0 0 100vmax rgba(0,4,4,.58),inset 0 0 54px rgba(188,232,216,.18);transition:all 357ms cubic-bezier(.2,.8,.2,1)}
      #window-choreography-layer[data-aperture*="pool"] .arch,#window-choreography-layer[data-aperture="undertow"] .arch{border-radius:48% 48% 10% 10%/28% 28% 8% 8%}
      #window-choreography-layer[data-aperture="proscenium"] .arch{border-width:12px 3px 3px;clip-path:polygon(0 0,100% 0,96% 100%,4% 100%)}
      #window-choreography-layer[data-aperture="lancet"] .arch{border-radius:50% 50% 4% 4%/34% 34% 3% 3%}
      #window-choreography-layer[data-aperture="occluded"] .arch{background:repeating-linear-gradient(90deg,rgba(0,0,0,.94) 0 21%,transparent 21% 29%)}
      #window-choreography-layer .echo{position:absolute;top:9%;bottom:9%;width:18%;border:1px solid rgba(194,220,211,.55);background:linear-gradient(165deg,rgba(192,225,215,.12),rgba(0,0,0,.78));box-shadow:0 0 36px rgba(141,205,190,.1)}
      #window-choreography-layer .echo:nth-child(2){left:3%}#window-choreography-layer .echo:nth-child(3){right:3%}
      #window-choreography-layer .channel-pane{position:absolute;top:12%;bottom:12%;width:min(28vw,390px);padding:18px;border:1px solid var(--channel-fg);background:radial-gradient(circle at 50% 15%,color-mix(in srgb,var(--channel-fg) 15%,var(--channel-bg)),var(--channel-bg) 62%);box-shadow:0 0 50px rgba(0,0,0,.75),inset 0 0 70px rgba(0,0,0,.48);color:var(--channel-hi);display:flex;flex-direction:column;justify-content:space-between;transform:rotate(var(--channel-tilt))}
      #window-choreography-layer .channel-pane[data-at="0"]{left:4%}#window-choreography-layer .channel-pane[data-at="1"]{left:50%;transform:translateX(-50%) rotate(var(--channel-tilt))}#window-choreography-layer .channel-pane[data-at="2"]{right:4%}
      #window-choreography-layer .channel-title{letter-spacing:.15em;color:var(--channel-fg);border-bottom:1px solid currentColor;padding-bottom:8px}
      #window-choreography-layer .channel-motif{font-size:clamp(18px,3vw,46px);letter-spacing:.18em;overflow:hidden;opacity:.72;white-space:pre-line;text-align:center}
      #window-choreography-layer .channel-caption{color:var(--channel-hi);min-height:3em;white-space:pre-line}
      #window-choreography-layer .channel-cut{align-self:center;border:1px solid var(--channel-fg);background:rgba(0,0,0,.72);color:var(--channel-hi);padding:12px 18px;font:inherit;letter-spacing:.12em;cursor:pointer}
      #window-choreography-layer .channel-cut:hover,#window-choreography-layer .channel-cut:focus{outline:2px solid var(--channel-hi)}
      #window-choreography-layer .channel-lesson,#window-choreography-layer .channel-reacquire{position:absolute;left:50%;bottom:3%;transform:translateX(-50%);padding:8px 14px;background:#050707e8;border:1px solid #b8874e;color:#e8c486;letter-spacing:.08em;white-space:nowrap}
      #window-choreography-layer.reacquire{pointer-events:none;background:rgba(0,0,0,.34)}
      #window-choreography-layer .channel-reacquire{bottom:7%;font-size:14px}
    `;
    layer = documentApi.createElement('div');
    layer.id = 'window-choreography-layer';
    documentApi.head?.append(style);
    documentApi.body.append(layer);
    return layer;
  }

  function applyScenePalette(layer, scene) {
    const palette = Array.isArray(scene?.palette) ? scene.palette : ['#030606', '#74a49b', '#d5d0a3', '#160707'];
    layer.style?.setProperty?.('--channel-bg', palette[0]);
    layer.style?.setProperty?.('--channel-fg', palette[1]);
    layer.style?.setProperty?.('--channel-hi', palette[2]);
    layer.style?.setProperty?.('--channel-wound', palette[3]);
  }

  async function renderInternalPlan(plan) {
    const layer = ensureInternalLayer();
    if (!layer) {
      if (!plan.hold) await sleep(plan.timing.durationMs);
      return false;
    }
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
    const CustomEventCtor = eventTarget()?.CustomEvent || globalThis.CustomEvent;
    if (CustomEventCtor) eventTarget()?.dispatchEvent?.(new CustomEventCtor('chunk-surfer:window-choreography', { detail: plan }));
    if (!plan.hold) {
      await sleep(plan.timing.durationMs);
      if (current?.token === plan.token && !current?.channel) clearInternal();
    }
    return true;
  }

  function internalMotif(scene, index) {
    const motif = scene.motifs[index % scene.motifs.length].toUpperCase().replaceAll('-', ' ');
    const rule = scene.battleId === 'hall' ? '●  ●  ●\n  ●  ●\n●  ●  ●'
      : scene.battleId === 'practice' ? '━━╱━━╱━━\n  ━━╱━━'
        : scene.battleId === 'chapel' ? '  ╱╲\n ╱  ╲\n╱____╲'
          : scene.battleId === 'source-final' ? '[ [ [ ] ] ]\n  RETURN()'
            : '~~~~~~~~~~~\n  ▯ TAPE ▯\n~~~~~~~~~~~';
    return `${motif}\n${rule}`;
  }

  function renderInternalChannel(scene, { mode = 'attack', tier = 0 } = {}) {
    const layer = ensureInternalLayer();
    if (!layer || !current?.channel) return false;
    applyScenePalette(layer, scene);
    layer.dataset.aperture = scene.aperture;
    layer.replaceChildren();
    layer.classList.add('active', 'interactive');
    const count = mode === 'return' ? 1 : scene.channelCount;
    for (let index = 0; index < count; index += 1) {
      const pane = documentApi.createElement('section');
      pane.className = 'channel-pane';
      pane.dataset.at = count === 1 ? '1' : String(index);
      pane.style.setProperty('--channel-tilt', `${(index - (count - 1) / 2) * 1.5}deg`);
      const title = documentApi.createElement('div');
      title.className = 'channel-title';
      title.textContent = mode === 'return' ? `RETURN / ${tier}-PASS CHARGE` : `${scene.title} / ${index + 1}`;
      const motif = documentApi.createElement('div');
      motif.className = 'channel-motif';
      motif.textContent = internalMotif(scene, index);
      const caption = documentApi.createElement('div');
      caption.className = 'channel-caption';
      caption.textContent = mode === 'return'
        ? (tier >= 3 ? 'THREE CLEAN PASSES. SEND THE FULL CHANNEL BACK.' : 'TWO CLEAN PASSES. RETURN IT NOW, OR HOLD FOR THREE.')
        : `${scene.caption}\n${scene.intentLabel}`;
      const button = documentApi.createElement('button');
      button.className = 'channel-cut';
      button.type = 'button';
      button.textContent = mode === 'return' ? 'RETURN SIGNAL' : 'CUT THIS CHANNEL';
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        handleChannelResponse({
          sessionToken: current?.token,
          attackId: current?.channel?.attackId,
          channelId: mode === 'return' ? 'return' : `internal-${index}`,
          action: mode === 'return' ? 'return' : 'cut',
        });
      });
      pane.append(title, motif, caption, button);
      layer.append(pane);
    }
    if (scene.firstLesson && mode === 'attack') {
      const lesson = documentApi.createElement('div');
      lesson.className = 'channel-lesson';
      lesson.textContent = 'CLICK OR CLOSE EVERY CHANNEL · CLICK BACK HERE · PARRY';
      layer.append(lesson);
    }
    return true;
  }

  function renderReacquirePrompt() {
    const layer = ensureInternalLayer();
    if (!layer) return;
    layer.replaceChildren();
    layer.classList.remove('interactive');
    layer.classList.add('active', 'reacquire');
    const prompt = documentApi.createElement('div');
    prompt.className = 'channel-reacquire';
    prompt.textContent = 'CLICK BACK INTO THE SIGNAL · THEN PARRY';
    layer.append(prompt);
  }

  async function ready(webview) {
    await new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => done(), 800);
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      webview.once?.('tauri://created', done);
      webview.once?.('tauri://error', done);
    });
  }

  async function ensureSidecar(payload = {}, { show = true } = {}) {
    if (!current || current.intensity === 'low' || !await loadApi() || !api.WebviewWindow) return null;
    sidecar = await api.WebviewWindow.getByLabel(SIDE_LABEL);
    if (!sidecar) {
      sidecar = new api.WebviewWindow(SIDE_LABEL, {
        url: 'interference-monitor.html?mode=monitor',
        title: 'AUDIOCORP / MONITOR RETURN',
        width: 460, height: 420, minWidth: 360, minHeight: 300,
        resizable: true, center: true, focus: false, alwaysOnTop: false, skipTaskbar: true,
      });
      await ready(sidecar);
    }
    if (show) await safe(() => sidecar.show());
    if (payload && Object.keys(payload).length) await safe(() => api.emitTo(SIDE_LABEL, 'interference-sidecar', payload));
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

  async function auxiliaryByLabel(label) {
    if (label === SIDE_LABEL) return ensureSidecar({}, { show: false });
    return prewarmEcho(label);
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

  async function hideAuxiliary() {
    const all = [sidecar, ...echoes.values()].filter(Boolean);
    await Promise.all(all.map((webview) => safe(() => webview.hide())));
  }

  async function closeAuxiliary() {
    const all = [sidecar, ...echoes.values()].filter(Boolean);
    sidecar = null;
    echoes.clear();
    await Promise.all(all.map((webview) => safe(() => webview.close())));
  }

  function finishChannel(outcome, extra = {}) {
    const channel = current?.channel;
    if (!channel || channel.settled) return false;
    channel.settled = true;
    clearTimeout(channel.timer);
    channel.removeReacquire?.();
    const result = {
      outcome,
      elapsedMs: Math.max(0, now() - channel.startedAt),
      cutCount: channel.cut.size,
      requiredCount: channel.required.size,
      ...extra,
    };
    current.channel = null;
    clearInternal();
    void hideAuxiliary();
    channel.resolve(result);
    return true;
  }

  function installMainReacquire() {
    const channel = current?.channel;
    const target = eventTarget();
    if (!channel || !target?.addEventListener) {
      finishChannel('skip');
      return;
    }
    renderReacquirePrompt();
    const handler = (event) => {
      if (current?.channel !== channel || channel.state !== 'reacquire') return;
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      event.stopPropagation?.();
      finishChannel('cut', { reacquiredMain: true });
    };
    target.addEventListener('pointerdown', handler, true);
    channel.removeReacquire = () => target.removeEventListener?.('pointerdown', handler, true);
  }

  function handleChannelResponse(payload = {}) {
    const channel = current?.channel;
    if (!channel || channel.settled) return false;
    if (payload.sessionToken !== current.token || payload.attackId !== channel.attackId) return false;
    if (channel.mode === 'return') {
      if (payload.action === 'return') return finishChannel('return', { tier: channel.tier });
      if (payload.action === 'cut' || payload.action === 'decline') return finishChannel('cut', { held: true, tier: channel.tier });
      return false;
    }
    if (channel.state !== 'cut' || payload.action !== 'cut' || !channel.required.has(payload.channelId)) return false;
    channel.cut.add(payload.channelId);
    if (channel.cut.size < channel.required.size) return true;
    channel.state = 'reacquire';
    void hideAuxiliary();
    installMainReacquire();
    return true;
  }

  function installControls() {
    const target = eventTarget();
    if (!keyInstalled && target?.addEventListener) {
      keyInstalled = true;
      target.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || event.repeat || !current) return;
        holdStarted = now();
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
          if (current && holdStarted && now() - holdStarted >= HOLD_MS - 25) void emergencyRestore();
        }, HOLD_MS);
      }, true);
      target.addEventListener('keyup', (event) => {
        if (event.key !== 'Escape') return;
        holdStarted = 0;
        clearTimeout(holdTimer);
      }, true);
    }
    if (!api?.listen || emergencyUnlisten && channelUnlisten) return Promise.resolve();
    if (controlsInstalling) return controlsInstalling;
    controlsInstalling = Promise.all([
      emergencyUnlisten ? null : safe(async () => {
        emergencyUnlisten = await api.listen('interference-emergency-restore', () => { void emergencyRestore(); });
      }),
      channelUnlisten ? null : safe(async () => {
        channelUnlisten = await api.listen('window-channel-response', ({ payload }) => handleChannelResponse(payload));
      }),
    ]).finally(() => { controlsInstalling = null; });
    return controlsInstalling;
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
      channel: null,
      movementScene: null,
      lastChannelScene: null,
    };
    await loadApi();
    await installControls();
    current.originalTitle = await safe(() => main?.title?.()) || TITLE;
    if (api?.invoke && intensity !== 'low' && !current.fullscreen) {
      const capabilities = await safe(() => api.invoke('chunk_window_choreography_capabilities'));
      current.nativePositioning = capabilities?.nativePositioning !== false;
      if (current.nativePositioning) {
        current.nativePositioning = !!await safe(() => api.invoke('chunk_window_choreography_begin', { token }));
      }
    }
    const prewarmCount = intensity === 'hostile' && ['handoff', 'finale'].includes(current.stage) ? 2 : 0;
    for (let index = 0; index < prewarmCount; index += 1) void prewarmEcho(WINDOW_ECHO_LABELS[index]);
    return token;
  }

  async function executePlan(plan, { fallback = true } = {}) {
    if (!plan || current?.token !== plan.token) return false;
    if (plan.displayMode === 'native' && api?.invoke) {
      const executed = await safe(() => api.invoke('chunk_window_choreography_execute', { plan }));
      if (executed) return true;
      if (!fallback || current?.token !== plan.token) return false;
    }
    return renderInternalPlan({ ...plan, displayMode: 'internal' });
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
    const executed = await executePlan(plan);
    await hideAuxiliary();
    if (current?.token !== session.token) return false;
    await safe(() => main?.setTitle?.(session.originalTitle || TITLE));
    session.lastCue = cueId;
    return executed;
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

  function arrangeMovement(scene, payload = {}) {
    const token = current?.token;
    if (!token || !scene?.layout) return Promise.resolve(false);
    current.movementScene = scene;
    queue = queue.then(async () => {
      const session = current;
      if (!session || session.token !== token || session.channel) return false;
      const plan = compileWindowChoreography({
        token,
        stage: session.stage,
        encounterId: session.encounterId,
        cueId: 'broadcast',
        intensity: session.intensity,
        fullscreen: session.fullscreen || !!payload.forceInternal,
        nativePositioning: session.nativePositioning,
        inputLocked: true,
        mainGeometry: scene.layout,
        hold: true,
      });
      return executePlan(plan);
    }, () => false);
    return queue;
  }

  async function showNativeChannelWindows(scene, channel) {
    const labels = CHANNEL_LABELS.slice(0, scene.channelCount);
    channel.required = new Set(labels);
    const windows = [];
    for (let index = 0; index < labels.length; index += 1) {
      const label = labels[index];
      const webview = await auxiliaryByLabel(label);
      if (!webview) return false;
      windows.push(webview);
      await safe(() => api.invoke('chunk_window_choreography_place_echo', {
        label, index, count: labels.length,
      }));
      await safe(() => api.emitTo(label, 'window-channel-scene', {
        ...scene,
        interaction: 'cut',
        sessionToken: current.token,
        attackId: channel.attackId,
        channelId: label,
        channelIndex: index,
      }));
    }
    await safe(() => windows[0]?.setFocus?.());
    return true;
  }

  async function runWindowChannel(scene, payload = {}) {
    const session = current;
    if (!session || !scene?.attackLayout || (payload.token && payload.token !== session.token)) {
      return { outcome: 'skip', elapsedMs: 0, cutCount: 0, requiredCount: 0 };
    }
    if (session.channel) finishChannel('cancel');
    const forceInternal = !!payload.forceInternal || session.fullscreen || session.intensity === 'low';
    const plan = compileWindowChoreography({
      token: session.token,
      stage: session.stage,
      encounterId: session.encounterId,
      cueId: scene.intentKind === 'loop' ? 'loop' : 'overload',
      intensity: session.intensity,
      fullscreen: forceInternal,
      nativePositioning: session.nativePositioning,
      inputLocked: true,
      mainGeometry: scene.attackLayout,
      hold: true,
    });
    if (!plan) return { outcome: 'skip', elapsedMs: 0, cutCount: 0, requiredCount: 0 };
    await safe(() => main?.setTitle?.(String(scene.title || TITLE).slice(0, 96)));
    await executePlan(plan);
    if (current?.token !== session.token) return { outcome: 'cancel', elapsedMs: 0, cutCount: 0, requiredCount: 0 };

    const result = new Promise((resolve) => {
      session.channel = {
        mode: 'attack', state: 'cut', settled: false,
        attackId: `${session.token}-m${scene.movementIndex}`,
        scene, startedAt: now(), resolve,
        required: new Set(), cut: new Set(), removeReacquire: null, timer: null,
      };
    });
    const channel = session.channel;
    channel.timer = setTimeout(() => finishChannel('timeout'), Math.max(750, Number(scene.deadlineMs) || 5000));
    const useNative = plan.displayMode === 'native' && api?.emitTo && api?.invoke;
    if (useNative) {
      const shown = await showNativeChannelWindows(scene, channel);
      if (!shown && current?.channel === channel) {
        channel.required = new Set(Array.from({ length: scene.channelCount }, (_, index) => `internal-${index}`));
        if (!renderInternalChannel(scene)) finishChannel('skip');
      }
    } else {
      channel.required = new Set(Array.from({ length: scene.channelCount }, (_, index) => `internal-${index}`));
      if (!renderInternalChannel(scene)) finishChannel('skip');
    }
    return result;
  }

  function beginWindowChannel(scene, payload = {}) {
    const token = current?.token;
    queue = queue.then(
      () => current?.token === token ? runWindowChannel(scene, payload) : { outcome: 'cancel', elapsedMs: 0 },
      () => current?.token === token ? runWindowChannel(scene, payload) : { outcome: 'cancel', elapsedMs: 0 },
    );
    return queue;
  }

  async function runReturnOffer(scene, { tier = 2, token = null, forceInternal = false } = {}) {
    const session = current;
    if (!session || !scene || (token && token !== session.token)) return { outcome: 'skip', tier: 0 };
    if (session.channel) finishChannel('cancel');
    const result = new Promise((resolve) => {
      session.channel = {
        mode: 'return', state: 'return', tier, settled: false,
        attackId: `${session.token}-return-${now()}`,
        scene, startedAt: now(), resolve,
        required: new Set(['return']), cut: new Set(), removeReacquire: null, timer: null,
      };
    });
    const channel = session.channel;
    channel.timer = setTimeout(() => finishChannel('cut', { held: true, tier }), RETURN_MS);
    const useNative = !forceInternal && !session.fullscreen && session.intensity !== 'low' && session.nativePositioning && api?.emitTo;
    if (useNative) {
      const webview = await ensureSidecar({}, { show: true });
      if (webview) {
        await safe(() => api.invoke('chunk_window_choreography_place_echo', { label: SIDE_LABEL, index: 0, count: 1 }));
        await safe(() => api.emitTo(SIDE_LABEL, 'window-channel-scene', {
          ...scene, interaction: 'return', tier,
          sessionToken: session.token, attackId: channel.attackId, channelId: 'return', channelIndex: 0,
        }));
        await safe(() => webview.setFocus?.());
      } else if (!renderInternalChannel(scene, { mode: 'return', tier })) finishChannel('skip');
    } else if (!renderInternalChannel(scene, { mode: 'return', tier })) finishChannel('skip');
    return result;
  }

  function offerWindowReturn(scene, payload = {}) {
    const token = current?.token;
    queue = queue.then(
      () => current?.token === token ? runReturnOffer(scene, payload) : { outcome: 'cancel', tier: 0 },
      () => current?.token === token ? runReturnOffer(scene, payload) : { outcome: 'cancel', tier: 0 },
    );
    return queue;
  }

  async function noteWindowChannelEvent(scene, payload = {}) {
    const session = current;
    if (!session || !scene || (payload.token && payload.token !== session.token)) return false;
    session.lastChannelScene = scene;
    const CustomEventCtor = eventTarget()?.CustomEvent || globalThis.CustomEvent;
    if (CustomEventCtor) {
      eventTarget()?.dispatchEvent?.(new CustomEventCtor('chunk-surfer:window-channel-event', { detail: scene }));
    }
    if (api?.emitTo) {
      const labels = [sidecar ? SIDE_LABEL : null, ...echoes.keys()].filter(Boolean);
      await Promise.all(labels.map((label) => safe(() => api.emitTo(label, 'window-channel-event', scene))));
    }
    return true;
  }

  // Controller-only play uses the same in-frame attack contract. One confirm
  // cuts one pane, the next confirm explicitly reacquires the game surface,
  // and the ordinary combat confirm that follows is the parry itself.
  function channelInput(action = 'confirm') {
    const channel = current?.channel;
    if (!channel || channel.settled) return false;
    if (channel.mode === 'return') {
      return handleChannelResponse({
        sessionToken: current.token,
        attackId: channel.attackId,
        channelId: 'return',
        action: action === 'decline' ? 'decline' : 'return',
      });
    }
    if (action === 'decline') return false;
    if (channel.state === 'reacquire') return finishChannel('cut', { reacquiredMain: true, controller: true });
    const channelId = [...channel.required].find((id) => !channel.cut.has(id));
    if (!channelId) return false;
    return handleChannelResponse({
      sessionToken: current.token,
      attackId: channel.attackId,
      channelId,
      action: 'cut',
    });
  }

  async function resolveWindowChannel(scene = current?.movementScene, payload = {}) {
    const arranged = await arrangeMovement(scene, payload);
    const session = current;
    if (session) await safe(() => main?.setTitle?.(session.originalTitle || TITLE));
    return arranged;
  }

  async function end(tokenOrOptions = null) {
    const expectedToken = typeof tokenOrOptions === 'string' ? tokenOrOptions : null;
    const closeSidecar = typeof tokenOrOptions === 'object' && tokenOrOptions !== null
      ? tokenOrOptions.closeSidecar !== false
      : true;
    const session = current;
    if (!session || (expectedToken && expectedToken !== session.token)) return false;
    if (session.channel) finishChannel('cancel');
    // Cancel first. Native animation and queued JS work see the stale token
    // before any restoration or window close is awaited.
    current = null;
    clearTimeout(holdTimer);
    holdStarted = 0;
    clearInternal();
    await safe(() => main?.setTitle?.(session.originalTitle || TITLE));
    if (api?.invoke) await safe(() => api.invoke('chunk_window_choreography_restore', { token: session.token }));
    await hideAuxiliary();
    if (closeSidecar) await closeAuxiliary();
    return true;
  }

  async function emergencyRestore({ notify = true } = {}) {
    const session = current;
    if (session?.channel) finishChannel('cancel');
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

  async function previewChannel(scene, payload = {}) {
    const token = await begin({
      stage: payload.stage || 'recognition',
      encounterId: scene?.battleId === 'source-final' ? 'source-final' : '',
      intensity: payload.intensity || 'standard',
      fullscreen: !!payload.forceInternal,
    });
    try {
      return await beginWindowChannel(scene, { token, forceInternal: !!payload.forceInternal });
    } finally {
      await end(token);
    }
  }

  return {
    begin,
    apply,
    reject,
    arrangeMovement,
    beginWindowChannel,
    offerWindowReturn,
    noteWindowChannelEvent,
    channelInput,
    resolveWindowChannel,
    previewChannel,
    end,
    emergencyRestore,
    active: () => !!current,
    sessionToken: () => current?.token || null,
    statusLine: () => current?.channel?.mode === 'attack'
      ? (current.channel.state === 'reacquire' ? 'CLICK BACK · THEN PARRY' : 'CUT EVERY WINDOW CHANNEL')
      : current ? 'HOLD ESC · RESTORE ALL GAME WINDOWS' : '',
  };
}
