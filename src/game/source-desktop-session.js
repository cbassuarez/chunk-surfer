import { createSourceDesktopView } from '../render/source-desktop-view.js';

// Presentation lease only. The combat scene supplies every clock, decision and
// outcome; neither this view nor the passive native webview can advance combat.
export function createSourceDesktopSession({
  director, host = globalThis.document?.getElementById('wrap'),
  pressurePresentation = null, createView = createSourceDesktopView,
  accessibility = () => ({}),
} = {}) {
  let view = null, container = null, ready = false, ended = false;
  let mode = 'fallback', revision = 0, last = null, starting = null;
  let lastStage = null, lastSize = '';
  let token = '', reason = '', placement = null;
  function refreshMode() {
    const native = director?.sourceDesktopState?.();
    if (mode === 'native' && native?.mode === 'fallback') {
      mode = 'fallback'; reason = native.reason || 'restored-to-window';
    }
    return mode;
  }
  function ensureView() {
    if (view || ended || !host) return view;
    container = host.ownerDocument.createElement('div');
    container.dataset.sourceDesktop = 'contained';
    container.style.cssText = 'position:absolute;z-index:7;pointer-events:none;overflow:hidden;background:#030606;display:none;';
    host.appendChild(container);
    view = createView({ container, onError:() => { ready=false;reason='presentation-unavailable'; } });
    Promise.resolve(view.ready).then(() => { if (!ended) ready = true; }).catch(() => { reason = 'presentation-unavailable'; });
    return view;
  }
  function snapshot(frame = last || {}) {
    return { ...frame, ...accessibility(), version:1, token, revision:++revision,
      mode, pressurePresentation, paused:!!frame.paused || !!globalThis.document?.hidden };
  }
  function frame(value, stage = null) {
    if (ended) return { mode, ready:false };
    refreshMode();
    last = value;
    if (stage) lastStage = stage;
    stage = lastStage;
    ensureView();
    const current = snapshot(value);
    if (container) {
      container.dataset.sourceDesktop = current.phase || 'contained';
      container.style.display = mode === 'native' || !stage || !ready ? 'none' : 'block';
      if (stage) {
        Object.assign(container.style, { left:`${stage.x}px`, top:`${stage.y}px`, width:`${stage.w}px`, height:`${stage.h}px` });
        const scale = globalThis.devicePixelRatio || 1;
        const size = `${stage.w}:${stage.h}:${scale}`;
        if (lastSize !== size) { view?.resize?.(stage.w, stage.h, scale); lastSize = size; }
      }
    }
    if (mode === 'native') void Promise.resolve(director?.updateSourceDesktop?.(current)).catch(() => null);
    else view?.update?.(current);
    return { mode, ready, reason, placement };
  }
  async function begin(value) {
    if (ended) return {mode:'fallback',reason:'scene-ended'};
    if (starting) return starting;
    last = value;
    starting = (async () => {
      const local = ensureView();
      // A model failure is an honest in-window fallback, never an invisible
      // desktop combat surface that could still cost the player a turn.
      try { await local?.ready; } catch { reason = 'presentation-unavailable'; }
      if (ended) return {mode:'fallback',reason:'scene-ended'};
      const report = reason ? null : await director?.beginSourceDesktop?.(snapshot(value));
      if (ended) { await director?.endSourceDesktop?.('scene-ended'); return {mode:'fallback'}; }
      mode = report?.mode === 'native' ? 'native' : 'fallback';
      token = report?.token || token;
      reason = report?.reason || reason;
      placement = report?.placement || null;
      frame(value);
      return {mode,token,reason,placement};
    })().catch(() => { mode = 'fallback'; reason = 'native-unavailable'; return {mode,reason}; });
    return starting;
  }
  async function end(outcome = 'abort') {
    if (ended) return;
    ended = true;
    view?.dispose?.(); view = null;
    container?.remove(); container = null;
    await director?.endSourceDesktop?.(outcome);
  }
  return { frame, begin, end, mode:refreshMode,
    debug:() => ({mode,ready,ended,token,reason,placement,renderer:view?.debug?.() || null}) };
}
