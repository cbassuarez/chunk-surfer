// Approved local test inputs. Every accepted action enters the host's ordinary
// key/controller handlers or relative-look sampler. There are no game-state,
// award, camera-position, save, focus or clock setters in this module.
export const COMPLETION_CONTROL_PATH = '/__completion_control';
// DEV transport tolerates a heavy presented frame without turning network
// jitter into an input-owner change. This never lengthens an accepted input.
export const COMPLETION_CONTROL_TIMING=Object.freeze({requestTimeoutMs:2000,heartbeatMs:3000,
  clientLeaseMs:4000,pollIntervalMs:80,expiryIntervalMs:20,queueTtlMs:2500});
export const COMPLETION_CONTROL_KEYS = Object.freeze([
  ...Array.from({ length: 26 }, (_, i) => `Key${String.fromCharCode(65 + i)}`),
  ...Array.from({ length: 10 }, (_, i) => `Digit${i}`),
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Space', 'Escape',
  'Tab', 'ShiftLeft', 'ShiftRight', 'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown', 'F6',
]);
export const COMPLETION_CONTROL_ACTIONS = Object.freeze([
  'move_up', 'move_down', 'move_left', 'move_right', 'run', 'hide', 'light', 'bag',
  'recorder', 'radio', 'interact', 'playback', 'mark', 'menu', 'confirm', 'back',
  'tabPrev', 'tabNext', 'mapFloorPrev', 'mapFloorNext', 'mapLocate', 'mapFile', 'mapConsole',
]);
const codes = new Set(COMPLETION_CONTROL_KEYS), actions = new Set(COMPLETION_CONTROL_ACTIONS);
const pauseKeys = new Set(['Escape', 'Enter', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'PageUp', 'PageDown', 'Home', 'End']);
const pauseActions = new Set(['menu', 'confirm', 'back', 'tabPrev', 'tabNext', 'move_up', 'move_down', 'move_left', 'move_right']);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const clone = value => JSON.parse(JSON.stringify(value));
export function validateCompletionControlCommand(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const allowed = value.kind === 'key' ? ['kind', 'code', 'durationMs']
    : value.kind === 'controller' ? ['kind', 'action', 'durationMs']
      : value.kind === 'look' ? ['kind', 'turnX', 'lookY', 'durationMs'] : value.kind === 'release' ? ['kind'] : [];
  if (!allowed.length || Object.keys(value).some(key => !allowed.includes(key))) return null;
  if (value.kind === 'release') return { kind: 'release' };
  const durationMs = value.durationMs === undefined ? value.kind === 'look' ? 100 : 60 : value.durationMs;
  if (!finite(durationMs) || durationMs < 20 || durationMs > (value.kind === 'look' ? 1000 : 2000)) return null;
  if (value.kind === 'key') return codes.has(value.code) ? { kind: 'key', code: value.code, durationMs } : null;
  if (value.kind === 'controller') return actions.has(value.action) ? { kind: 'controller', action: value.action, durationMs } : null;
  const turnX = value.turnX ?? 0, lookY = value.lookY ?? 0;
  if (!finite(turnX) || !finite(lookY) || Math.abs(turnX) > 1 || Math.abs(lookY) > 1) return null;
  return { kind: 'look', turnX, lookY, durationMs };
}

export function completionControlContext(value = {}) {
  return { runId: typeof value.runId === 'string' ? value.runId : null,
    sceneId: typeof value.sceneId === 'string' ? value.sceneId : null,
    focused: value.focused === true, hidden: value.hidden === true, paused: value.paused === true };
}
function keyboardEvent(code, type, time, shift, target = null) {
  const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5)
    : code === 'Space' ? ' ' : code.startsWith('Shift') ? 'Shift' : code;
  return { type, code, key, repeat: false, metaKey: false, ctrlKey: false, altKey: false,
    shiftKey: shift, target, timeStamp: time, isTrusted: false,
    completionTestRelay: true, preventDefault() {}, stopPropagation() {} };
}

// Pure input lease: monotonic real time expires every down. Changes of scene,
// run, pause or actual focus release held controls before another can begin.
export function createCompletionControlRelay({
  now = () => performance.now(), getContext = () => ({}), getTarget = () => null,
  onKeyDown = () => {}, onKeyUp = () => {}, onControllerDown = () => {}, onControllerUp = () => {},
  onLook = () => {}, clearLook = () => {}, onInput = () => {},
} = {}) {
  const held = new Map();
  function readContext() { try { return completionControlContext(getContext()); } catch { return completionControlContext(); } }
  let previous = readContext(), connected = false, disposed = false, lookUntil = 0, inputEpoch = 0;
  function note(value) { try { onInput({ kind: 'test-control-relay-input', source: 'local-test-api', ...value }); } catch { /* Observer failure cannot retain controls. */ } }
  function invoke(fn, value) {
    try { fn(value); return true; } catch { note({ phase: 'handler-error' }); return false; }
  }
  function releaseOne(id, reason) {
    const item = held.get(id); if (!item) return;
    held.delete(id);
    if (item.kind === 'key') invoke(onKeyUp, keyboardEvent(item.code, 'keyup', now(), held.has('key:ShiftLeft') || held.has('key:ShiftRight'), getTarget()));
    else invoke(onControllerUp, item.action);
    note({ phase: 'up', reason, commandId: item.commandId, input: item.kind === 'key' ? { code: item.code } : { action: item.action } });
  }
  function clear(reason = 'cleared') {
    for (const id of [...held.keys()]) releaseOne(id, reason);
    if (lookUntil) { invoke(clearLook); lookUntil = 0; }
    note({ phase: 'clear', reason });
  }
  function sync() {
    const current = readContext();
    const changed = current.runId !== previous.runId ? 'run-owner-changed'
      : current.sceneId !== previous.sceneId ? 'scene-owner-changed'
        : current.paused !== previous.paused ? 'pause-changed'
          : current.hidden !== previous.hidden || current.focused !== previous.focused ? 'focus-changed' : null;
    previous = current;
    if (changed) { inputEpoch++; clear(changed); }
    return current;
  }
  return {
    connect() { if (!disposed) { connected = true; sync(); } },
    disconnect(reason = 'transport-disconnected') {
      // A lost heartbeat can be observed every expiry tick. Only the actual
      // loss is an input boundary; already-idle loss cannot write another
      // trace, re-release controls or manufacture another owner generation.
      if(!connected&&!held.size&&!lookUntil)return;
      if (connected) inputEpoch++;
      connected = false; clear(reason);
    },
    receive(value, { commandId = null, owner = null } = {}) {
      const command = validateCompletionControlCommand(value), current = sync();
      const pauseAllowed = command?.kind === 'release' || command?.kind === 'key' && pauseKeys.has(command.code)
        || command?.kind === 'controller' && pauseActions.has(command.action);
      const ownerChanged = owner && (owner.runId !== current.runId || owner.sceneId !== current.sceneId || owner.inputEpoch !== inputEpoch);
      const reason = !command ? 'invalid-command' : disposed ? 'disposed' : !connected ? 'disconnected' : ownerChanged ? 'input-owner-changed'
        : !current.focused || current.hidden ? 'actual-focus-unavailable' : current.paused && !pauseAllowed ? 'paused' : null;
      if (reason) { note({ phase: 'rejected', reason, commandId }); return { accepted: false, reason }; }
      if (command.kind === 'release') { clear('command-release'); return { accepted: true }; }
      if (command.kind === 'look') {
        if (!invoke(onLook, { turnX: command.turnX, lookY: command.lookY, durationMs: command.durationMs })) {
          invoke(clearLook); return { accepted: false, reason: 'handler-error' };
        }
        lookUntil = now() + command.durationMs;
        note({ phase: 'look', commandId, input: clone(command) });
      } else {
        const id = `${command.kind}:${command.code || command.action}`;
        if (held.has(id)) { note({ phase: 'rejected', reason: 'already-held', commandId }); return { accepted: false, reason: 'already-held' }; }
        held.set(id, { ...command, commandId, until: now() + command.durationMs });
        const delivered = command.kind === 'key'
          ? invoke(onKeyDown, keyboardEvent(command.code, 'keydown', now(), held.has('key:ShiftLeft') || held.has('key:ShiftRight'), getTarget()))
          : invoke(onControllerDown, command.action);
        if (!delivered) { releaseOne(id, 'handler-error'); return { accepted: false, reason: 'handler-error' }; }
        note({ phase: 'down', commandId, input: clone(command) });
      }
      // A press can synchronously open a menu or hand off a scene. Its held
      // state cannot leak into the newly-owned body or instrument.
      sync();
      return { accepted: true };
    },
    tick() {
      sync();
      for (const [id, item] of held) if (now() >= item.until) releaseOne(id, 'duration-complete');
      if (lookUntil && now() >= lookUntil) { invoke(clearLook); lookUntil = 0; }
    },
    clear,
    status: () => ({ connected, disposed, inputEpoch, context: clone(previous), held: [...held.values()].map(({ kind, code, action, until, commandId }) => ({ kind, ...(code ? { code } : { action }), until, commandId })), lookUntil }),
    dispose() { clear('disposed'); connected = false; disposed = true; },
  };
}

export function installCompletionControlRelay(options = {}) {
  const location = options.location || globalThis.location;
  const query = new URLSearchParams(location?.search || '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(location?.hostname)
    || query.get('completionPass') !== '1' || query.get('completionInput') !== '1') return null;
  const document = options.document || globalThis.document, window = options.window || globalThis.window;
  const fetcher = options.fetch || globalThis.fetch.bind(globalThis);
  const clock = options.now || (() => performance.now());
  const relay = createCompletionControlRelay({ ...options, getTarget: options.getTarget || (() => document.activeElement || null) }), clientId = globalThis.crypto.randomUUID();
  let token = null, sessionId = null, disposed = false, polling = false, lastSuccess = 0, receipts = [], sessionPending = false;
  const base = COMPLETION_CONTROL_PATH;
  const onInput = options.onInput || (() => {});
  function failure(reason) { relay.disconnect(reason); }
  async function request(path, body, authenticated = true) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), COMPLETION_CONTROL_TIMING.requestTimeoutMs);
    try {
      const response = await fetcher(base + path, { method: 'POST', cache: 'no-store', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body), signal: controller.signal });
      if (!response.ok) throw new Error(`completion relay HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  async function establish() {
    if (disposed || sessionPending || token) return;
    sessionPending = true;
    try {
      const session = await request('/session', { clientId }, false);
      if (disposed || typeof session.token !== 'string' || !session.token) return;
      token = session.token; sessionId = session.sessionId; lastSuccess = clock(); relay.connect();
      onInput({ kind: 'test-control-relay-connected', source: 'local-test-api', sessionId });
    } catch { failure('transport-unavailable'); } finally { sessionPending = false; }
  }
  async function poll() {
    if (disposed || polling) return;
    if (!token) { await establish(); return; }
    polling = true;
    const sent = receipts; receipts = [];
    try {
      relay.tick();
      const status = relay.status();
      const requestedAt=clock();
      const response = await request('/poll', { clientId, sessionId, context: status.context, inputEpoch: status.inputEpoch, receipts: sent });
      if (disposed) return;
      lastSuccess = clock(); relay.connect();
      for (const row of (Array.isArray(response.commands) ? response.commands : []).slice(0, 16)) {
        // Queue freshness includes a slow HTTP response, not just the server's
        // dequeue instant. Use elapsed monotonic time, never compare the page's
        // performance clock with the server's wall clock.
        if(Number.isFinite(row.expiresInMs)&&clock()-requestedAt>=row.expiresInMs){
          receipts.push({id:row.id,accepted:false,reason:'queue-expired'});continue;
        }
        const result = relay.receive(row.command, { commandId: row.id, owner: row.owner });
        receipts.push({ id: row.id, ...result });
      }
    } catch {
      receipts.unshift(...sent); receipts = receipts.slice(-32); failure('transport-disconnected');
      token = null; sessionId = null;
    } finally { polling = false; }
  }
  const blur = () => relay.clear('actual-focus-loss');
  const visibility = () => relay.clear('visibility-change');
  const timer = setInterval(() => {
    relay.tick();
    if (token && clock() - lastSuccess > COMPLETION_CONTROL_TIMING.heartbeatMs) failure('heartbeat-expired');
  }, COMPLETION_CONTROL_TIMING.expiryIntervalMs);
  const pollingTimer = setInterval(() => { void poll(); }, COMPLETION_CONTROL_TIMING.pollIntervalMs);
  window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
  void poll();
  return {
    clear: reason => relay.clear(reason), status: () => ({ ...relay.status(), sessionId, relayed: true }),
    dispose() {
      if (disposed) return; disposed = true;
      clearInterval(timer); clearInterval(pollingTimer);
      window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility);
      relay.dispose();
      if (token) void fetcher(base + '/release', { method: 'POST', keepalive: true, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ clientId, sessionId }) }).catch(() => {});
    },
  };
}
