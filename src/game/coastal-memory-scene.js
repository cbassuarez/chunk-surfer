import { COASTAL_MEMORY_LAYOUT, COASTAL_NOTE_COPY } from '../data/coastal-memory.js';
import { beginCoastalMemory, normalizeCoastalMemory, stepCoastalMemory, coastalMemoryFrame,
  requestCoastalReturn, acknowledgeCoastalRecording, acknowledgeCoastalReturn } from './coastal-memory.js';
import { createCoastalMemoryAudio } from '../audio/coastal-memory.js';

const copy = value => structuredClone(value);
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, finite(value, lo)));
const keyOf = event => String(event?.key || event?.code || '').toLowerCase().replace(/^key/, '');
const movement = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
const supportHeight = support => typeof support === 'number' ? support : support?.height ?? support?.y ?? support?.feet ?? support?.floor;

// Swept metre-scale walking shares the exact authored visible support and rim
// barriers. Rejected motion slides along a real contact instead of teleporting.
export function walkCoastalMemoryPose(pose, { dt = 0, forward = 0, side = 0 } = {}, layout = COASTAL_MEMORY_LAYOUT) {
  const next = { ...pose }, seconds = clamp(dt, 0, .25), length = Math.max(1, Math.hypot(forward, side));
  const amount = finite(layout.walkSpeed, 2.1) * seconds / length;
  const dx = (Math.sin(next.yaw) * forward + Math.cos(next.yaw) * side) * amount;
  const dz = (-Math.cos(next.yaw) * forward + Math.sin(next.yaw) * side) * amount;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .1));
  function attempt(x, z) {
    if (layout.canOccupy && !layout.canOccupy(x, z, next.feet)) return false;
    const support = layout.supportAt ? layout.supportAt(x, z, next.feet) : next.feet;
    const height = supportHeight(support);
    if (!Number.isFinite(height) || support?.walkable === false || Math.abs(height - next.feet) > .4) return false;
    next.x = x; next.z = z; next.feet = height; return true;
  }
  for (let i = 0; i < steps; i++) {
    const x = next.x + dx / steps, z = next.z + dz / steps;
    if (!attempt(x, z)) { attempt(x, next.z); attempt(next.x, z); }
  }
  return next;
}

// This owner borrows presentation only. The real Source body and its physical
// tape stay with the host; success callbacks must explicitly acknowledge them.
export function createCoastalMemoryScene({ checkpoint, runId, entryDoorId, returnPose,
  layout = COASTAL_MEMORY_LAYOUT, renderer: suppliedRenderer, createRenderer,
  context, destination, audio: suppliedAudio, reducedMotion = false,
  isHidden = () => globalThis.document?.hidden === true, isHeld = () => false,
  paintOverlay = () => {}, onCheckpoint = () => {}, onRecording = () => false,
  onReturn = () => false, onTorch = () => false, onExit = () => {}, onError = () => {}, onTrace = () => {},
} = {}) {
  const options = { layout, runId, entryDoorId, returnPose };
  let state = normalizeCoastalMemory(checkpoint, options);
  if (!state.active && !state.completed) state = beginCoastalMemory(state, options) || state;
  let renderer = suppliedRenderer, audio = suppliedAudio || null, initializing = null;
  let ready = false, closed = false, paused = false, hidden = false, blurred = false, heldExternal = false, rendererDisposed = false;
  let leaving = false, error = null, noteOpen = false, recorderHeld = false, drag = null;
  let entryElapsed = 0, clock = 0, saveClock = 0, traceClock = 0;
  let recordingInFlight = false, returnInFlight = false, returnFailed = false, recordingRetryAt = 0;
  const keys = new Set(), snapshot = () => copy(state), clear = () => { keys.clear(); drag = null; };
  const frozen = () => paused || hidden || heldExternal;
  const renderReady = () => ready && renderer?.ready?.() !== false;
  const live = () => renderReady() && !closed && !leaving && !frozen();
  const trace = value => onTrace(copy(value));
  const disposeRenderer = () => { if (renderer && !rendererDisposed) { rendererDisposed = true; renderer.dispose?.(); } };
  function report(reason) { error = String(reason?.message || reason); onError(reason); }
  function save(reason) {
    const value = snapshot();
    try { onCheckpoint(value, { reason }); } catch (reason) { report(reason); }
    return value;
  }
  function frame() {
    const value = coastalMemoryFrame(state, { layout });
    const entryCover = ready ? 1 - clamp(entryElapsed / .65, 0, 1) : 1;
    const errorReturn = !!error && !renderReady() && (state.status === 'active' || returnFailed);
    return { ...value, ready: renderReady(), closed, paused, hidden, leaving, error, recorderHeld, noteOpen,
      coverAlpha: Math.max(entryCover, value.returnCover),
      ui: { instruction: !noteOpen && value.canInspectNote && value.status === 'active' ? 'E · READ NOTE' : null,
        noteOpen, noteCopy: noteOpen ? COASTAL_NOTE_COPY : null, noteClose: noteOpen ? 'E · CLOSE' : null,
        error, canReturn: errorReturn, errorReturn: errorReturn ? 'X · RETURN' : null,
        canRetryReturn: returnFailed, recorderHeld },
    };
  }
  function sound() {
    audio?.update?.({ state, pose: state.pose, recorderHeld, paused: frozen(), hidden,
      renderReady: renderReady() && !closed && !leaving });
  }
  function reconcileRecording() {
    const receipt = state.recordingReceipt;
    if (closed || recordingInFlight || !receipt || receipt.delivered || clock < recordingRetryAt) return;
    recordingInFlight = true; save('recording-ready');
    const succeed = result => {
      recordingInFlight = false;
      if (result !== true) { recordingRetryAt = clock + 1; return false; }
      const next = acknowledgeCoastalRecording(state, receipt.id, { layout });
      if (next) { state = next; save('recording-committed'); }
      return true;
    };
    try {
      const result = onRecording({ checkpoint: snapshot(), receipt: copy(receipt) });
      if (result?.then) Promise.resolve(result).then(succeed).catch(reason => {
        recordingInFlight = false; recordingRetryAt = clock + 1; if (!closed) report(reason);
      });
      else succeed(result);
    } catch (reason) { recordingInFlight = false; recordingRetryAt = clock + 1; report(reason); }
  }
  function dispatchReturn() {
    const value = coastalMemoryFrame(state, { layout });
    if (closed || frozen() || returnInFlight || returnFailed || !value.returnReady) return false;
    returnInFlight = true; leaving = true; clear(); audio?.setPaused?.(true); save('covered-return-ready');
    const fail = reason => { returnInFlight = false; leaving = false; returnFailed = true; if (!closed) report(reason); return false; };
    const succeed = result => {
      if (result !== true) return fail(Error('The Source position has not been restored.'));
      const next = acknowledgeCoastalReturn(state, value.returnReceipt.id, { layout });
      if (next) { state = next; save('returned'); }
      returnInFlight = false; return true;
    };
    try {
      const result = onReturn({ checkpoint: snapshot(), returnPose: copy(state.returnPose), receipt: copy(state.returnReceipt) });
      if (result?.then) Promise.resolve(result).then(succeed).catch(fail); else succeed(result);
    } catch (reason) { fail(reason); }
    return true;
  }
  function apply(input = {}) {
    const result = stepCoastalMemory(state, input, { layout }); state = result.state;
    if (result.events.length) {
      for (const event of result.events) trace({ type: 'event', event, elapsed: state.elapsed, pose: state.pose });
      save('interaction');
    }
    reconcileRecording(); dispatchReturn(); return result;
  }
  // Flush before moving/lowering/pausing, so the interval is judged at the
  // actual pose and monitor route that carried it, never the next frame's pose.
  function flush() {
    if (!audio?.sample || closed || frozen() || !renderReady() || state.status !== 'active') return;
    apply({ dt: 0, recorderHeld, ...audio.sample() });
  }
  function syncVisibility() {
    const nextHidden = blurred || !!isHidden(), nextHeld = !!isHeld();
    if (nextHidden === hidden && nextHeld === heldExternal) return;
    if (nextHidden || nextHeld) flush();
    hidden = nextHidden; heldExternal = nextHeld; clear(); audio?.setPaused?.(frozen()); sound();
    if (frozen()) save('held');
  }
  function look(value) {
    if (!live() || noteOpen || state.status !== 'active') return false;
    const yaw = finite(value?.yaw, state.pose.yaw), pitch = clamp(value?.pitch ?? state.pose.pitch, -1.3, .8);
    flush(); apply({ dt: 0, pose: { ...state.pose, yaw, pitch } }); sound(); return true;
  }
  const scene = {
    id: 'coastal-memory', blocksWorld: true, blocksInput: true, suppressesHud: true,
    allowsLook: false, handlesEscape: false, worldPresentation: 'hidden', lookProfile: 'explore',
    initialize() {
      if (initializing) return initializing;
      save('loading');
      initializing = Promise.resolve().then(async () => {
        if (!renderer) {
          const factory = createRenderer || (await import('../render/coastal-memory-renderer.js')).createCoastalMemoryRenderer;
          if (closed) return false; renderer = factory({ reducedMotion });
        }
        if (typeof renderer?.render !== 'function') throw Error('The coastal view is unavailable.');
        const acquired = await renderer.initialize?.();
        if (closed) { disposeRenderer(); return false; }
        if (acquired === false) throw Error('The coastal view has not resolved.');
        ready = true; error = null; hidden = blurred || !!isHidden(); heldExternal = !!isHeld();
        if (!audio && context && destination) audio = createCoastalMemoryAudio({ context, destination, layout });
        audio?.initialize?.({ state, pose: state.pose, recorderHeld, paused: frozen(), hidden, renderReady: true });
        audio?.setPaused?.(frozen()); save('entry-or-resume'); reconcileRecording(); return true;
      }).catch(reason => { if (!closed) { ready = false; clear(); audio?.setPaused?.(true); report(reason); } return false; });
      return initializing;
    },
    enter() { void scene.initialize(); },
    update(dt) {
      if (closed) return; syncVisibility();
      if (!live()) {
        clear(); if (!leaving) audio?.setPaused?.(true);
        // A failed picture remains opaque. X can still take the normal covered
        // retreat rail; only that durable fade advances, with no world/audio.
        if (!closed && !leaving && !frozen() && error && !renderReady() && state.status === 'return-pending')
          apply({ dt: clamp(dt, 0, .25), renderReady: true });
        return;
      }
      audio?.setPaused?.(false); flush(); if (closed || leaving) return;
      const seconds = clamp(dt, 0, .25); clock += seconds; entryElapsed = Math.min(.65, entryElapsed + seconds);
      let pose = state.pose;
      if (!noteOpen && state.status === 'active') {
        const turn = Number(keys.has('arrowright')) - Number(keys.has('arrowleft'));
        if (turn) pose = { ...pose, yaw: pose.yaw + turn * seconds * 1.8 };
        pose = walkCoastalMemoryPose(pose, { dt: seconds,
          forward: Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown')),
          side: Number(keys.has('d')) - Number(keys.has('a')) }, layout);
      }
      apply({ dt: seconds, pose, renderReady: true });
      if (closed || leaving) return; sound();
      saveClock += seconds; traceClock += seconds;
      if (saveClock >= 1) { saveClock = 0; save('position'); }
      if (traceClock >= .1) { traceClock = 0; trace({ type: 'pose', elapsed: state.elapsed, pose: state.pose,
        recorderHeld, noteOpen, wreckNoticed: state.wreckNoticed, wreckLightsElapsed: state.wreckLightsElapsed }); }
    },
    view: frame, serialize: snapshot, snapshot, checkpoint: () => save('requested'),
    setLook: look,
    // Explicit technical placement; ordinary controls never call this seam.
    // It still requires the same visible support, occupancy and height tests.
    setPose(value = {}) {
      if (!live() || noteOpen || state.status !== 'active') return false;
      if (!value || !['x', 'z', 'feet', 'yaw', 'pitch'].every(key => value[key] == null || Number.isFinite(value[key]))) return false;
      const target = { ...state.pose, ...value };
      const support = layout.supportAt ? layout.supportAt(target.x, target.z, target.feet) : target.feet;
      const height = supportHeight(support);
      if (!Number.isFinite(height) || support?.walkable === false || value.feet != null && Math.abs(value.feet - height) > .4) return false;
      target.feet = height;
      if (layout.canOccupy && !layout.canOccupy(target.x, target.z, target.feet)) return false;
      target.pitch = clamp(target.pitch, -1.3, .8); flush();
      apply({ dt: 0, pose: target }); sound(); save('technical-pose');
      trace({ type: 'technical-pose-assignment', pose: state.pose, elapsed: state.elapsed }); return true;
    },
    setPaused(value) {
      if (closed) return false; if (!!value === paused) return true;
      if (value) flush(); paused = !!value; clear(); audio?.setPaused?.(frozen()); sound();
      if (paused) save('pause'); return true;
    },
    pause() { return scene.setPaused(true); }, resume() { return scene.setPaused(false); },
    blur() { flush(); blurred = true; hidden = true; clear(); audio?.setPaused?.(true); save('hidden'); },
    focus() { blurred = false; hidden = !!isHidden(); clear(); audio?.setPaused?.(frozen()); sound(); },
    requestReturn() {
      const errorRail = !closed && !leaving && !frozen() && !!error && !renderReady();
      if ((!live() && !errorRail) || state.status !== 'active') return false;
      flush(); recorderHeld = false; noteOpen = false; clear(); state = requestCoastalReturn(state, { layout, reason: 'retreat' });
      save('return-requested'); sound(); return true;
    },
    retryReturn() { if (closed || !returnFailed || frozen()) return false; returnFailed = false; error = null; return dispatchReturn(); },
    key(event = {}) {
      const key = keyOf(event);
      if (key === 'escape' || event.controllerAction === 'back') { flush(); clear(); save('pause-request'); return false; }
      if (closed || leaving || event.ctrlKey || event.metaKey || event.altKey) return true;
      syncVisibility(); if (!live()) {
        clear();
        if (!event.repeat && !frozen() && key === 'x' && error && !renderReady()) {
          if (returnFailed) scene.retryReturn(); else scene.requestReturn();
        } else if (!event.repeat && key === 'e' && returnFailed) scene.retryReturn();
        return true;
      }
      if (noteOpen) { if (!event.repeat && (key === 'e' || key === 'enter' || key === ' ' || event.controllerAction === 'interact')) noteOpen = false; return true; }
      if (movement.has(key)) { if (!event.repeat && state.status === 'active') keys.add(key); return true; }
      if (!event.repeat && key === 'r' && state.status === 'active') {
        flush(); recorderHeld = !recorderHeld; trace({ type: 'recorder-held', held: recorderHeld, elapsed: state.elapsed }); sound();
      }
      if (!event.repeat && key === 'l' && state.status === 'active') {
        try { onTorch(); trace({ type: 'torch-input', elapsed: state.elapsed }); } catch (reason) { report(reason); }
      }
      if (!event.repeat && (key === 'e' || key === 'enter' || event.controllerAction === 'interact')) {
        if (returnFailed) scene.retryReturn();
        else if (coastalMemoryFrame(state, { layout }).canInspectNote) { flush(); apply({ dt: 0, inspectNote: true }); noteOpen = true; clear(); }
      }
      return true;
    },
    keyup(event = {}) { keys.delete(keyOf(event)); return true; },
    pointer(event = {}) {
      if (!live() || noteOpen || state.status !== 'active') { drag = null; return true; }
      if (event.type === 'pointerdown' && (event.button === 2 || event.buttons === 2)) {
        drag = { x: finite(event.clientX ?? event.x), y: finite(event.clientY ?? event.y) }; event.preventDefault?.();
      }
      if (event.type === 'pointerup' || event.type === 'pointercancel') drag = null;
      if (event.type === 'pointermove') {
        if (event.pointerLocked || globalThis.document?.pointerLockElement) {
          look({ yaw: state.pose.yaw + finite(event.movementX) * .004, pitch: state.pose.pitch - finite(event.movementY) * .003 });
        } else if (drag) {
          const x = finite(event.clientX ?? event.x), y = finite(event.clientY ?? event.y);
          look({ yaw: state.pose.yaw + (x - drag.x) * .004, pitch: state.pose.pitch - (y - drag.y) * .003 }); drag = { x, y };
        }
      }
      return true;
    },
    render() {
      if (closed) return false; syncVisibility();
      let value = frame();
      if (renderReady()) {
        try { if (renderer.render(value, { time: clock, recorderHeld }) === false) throw Error('The coastal view is unavailable.'); }
        catch (reason) { flush(); ready = false; clear(); audio?.setPaused?.(true); report(reason); value = frame(); }
      }
      paintOverlay(value); return ready;
    },
    exit() {
      if (closed) return false; flush(); closed = true; clear();
      if (!leaving) save('interrupted'); audio?.dispose?.(); disposeRenderer(); onExit({ checkpoint: snapshot() }); return true;
    },
  };
  return scene;
}
