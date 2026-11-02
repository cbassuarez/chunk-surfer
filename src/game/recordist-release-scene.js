import { advanceRecordistRelease, normalizeRecordistRelease, recordistReleaseView } from './recordist-release.js';
import { inputPrompt } from './bindings.js';
import { uiSize, uiText } from '../render/ui.js';

const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
const interact = event => event?.controllerAction === 'interact' || event?.code === 'KeyE' || String(event?.key || '').toLowerCase() === 'e';
const seconds = dt => Math.min(.1, Math.max(0, Number.isFinite(dt) ? dt : 0));

// This is an interaction overlay on the ordinary chapel, not a borrowed camera
// or a second locomotion authority. The host supplies actual ownership, aim,
// range, focus and render readiness. It also owns removal and the carry handoff.
export function makeRecordistReleaseScene({
  getState = () => null, commitState = () => {}, getContext = () => ({}),
  assetsReady = () => false, requestAssets = () => false,
  onCue = () => {}, onCarry = () => {}, onError = () => {},
} = {}) {
  let state = normalizeRecordistRelease(getState()), held = false, closed = false, paused = false;
  let loading = null, loadError = null, saveError = null, saveClock = 0, retryClock = 0;
  let pendingSave = false, pendingCarry = false, handedOff = false;

  function report(error, operation) {
    try { onError(error, { operation }); } catch { /* Error reporting cannot grant an interaction. */ }
  }
  function ready() {
    try { return assetsReady() === true; } catch (error) { loadError = String(error?.message || error); return false; }
  }
  function context() {
    try { return getContext(recordistReleaseView(state)) || {}; }
    catch (error) { report(error, 'context'); return { blocked: true }; }
  }
  function present(ctx) { return !!state && !closed && (!Object.hasOwn(ctx, 'runId') || ctx.runId === state.runId); }
  function suspended(ctx) { return paused || ctx.paused === true || ctx.focused === false || ctx.hidden === true || ctx.blocked === true; }
  function persist(reason, stageChanged = false) {
    // A New Game or replaced host may invalidate the owner before the old
    // scene receives exit(). Its last hold must never enter the new save.
    if (!state || !present(context())) return false;
    try {
      const committed = commitState(copy(state), { reason, stageChanged });
      if (committed === false) throw new Error('The release checkpoint could not be saved.');
      pendingSave = false; saveError = null; saveClock = 0; retryClock = 0;
      return true;
    } catch (error) {
      pendingSave = true; saveError = String(error?.message || error); retryClock = 0;
      report(error, 'checkpoint'); return false;
    }
  }
  function handoff() {
    if (!pendingCarry || pendingSave || handedOff || closed) return;
    handedOff = true; pendingCarry = false; held = false;
    try { onCarry(copy(state)); } catch (error) { report(error, 'carry'); }
  }
  function interrupt(reason) {
    held = false;
    if (!state || state.stage === 'carried') return;
    const result = advanceRecordistRelease(state, { dt: 0, paused: true });
    state = result.state;
    if (result.changed) persist(reason);
  }
  function load() {
    if (closed || ready()) return Promise.resolve(!closed && ready());
    if (loading) return loading;
    loadError = null;
    // Readiness is the host renderer's fact, not a promise resolving or the E
    // key being pressed. A failed model load never allows an invisible rescue.
    loading = Promise.resolve().then(() => requestAssets()).then(() => {
      if (closed) return false;
      if (!ready()) throw new Error('The recordist model is not ready.');
      loadError = null; return true;
    }).catch(error => {
      if (!closed) { loadError = String(error?.message || error); report(error, 'assets'); }
      return false;
    }).finally(() => { loading = null; });
    return loading;
  }
  const scene = {
    id: 'recordist-release', blocksInput: false, blocksWorld: false, allowsLook: true,
    suppressesHud: false, handlesEscape: false, worldPresentation: 'visible',
    enter() {
      closed = false; held = false;
      state = normalizeRecordistRelease(getState());
      interrupt('enter'); void load();
    },
    initialize: load,
    update(dt) {
      if (closed || !state || handedOff) return;
      const ctx = context(), step = seconds(dt);
      if (!present(ctx)) {
        held = false;
        state = advanceRecordistRelease(state, { dt: 0, paused: true }).state;
        return;
      }
      if (pendingSave) {
        held = false; retryClock += step;
        if (retryClock + 1e-7 >= .25 && persist('checkpoint-retry')) handoff();
        return;
      }
      if (state.stage === 'carried') return; // Reload handoff belongs to the host.
      const before = state, usable = ready(), frozen = suspended(ctx) || !usable;
      if (frozen) held = false;
      const result = advanceRecordistRelease(state, {
        dt: step, interactHeld: held,
        inRange: ctx.inRange === true, facing: ctx.facing === true,
        hasRig: ctx.hasRig === true, hasFork: ctx.hasFork === true,
        paused: frozen, focused: ctx.focused !== false, hidden: ctx.hidden === true, blocked: ctx.blocked === true,
      });
      state = result.state;
      if (!result.changed) return;
      const stageChanged = before.stage !== state.stage;
      const interrupted = before.holdSeconds > 0 && state.holdSeconds === 0 && !stageChanged;
      const releaseChanged = before.requiresRelease !== state.requiresRelease;
      saveClock += step;
      const activeWork = state.holdSeconds > 0 || state.stage === 'settling';
      if (stageChanged || interrupted || releaseChanged || activeWork && saveClock + 1e-7 >= .25)
        persist(stageChanged ? 'stage' : interrupted ? 'interrupted' : releaseChanged ? 'key-release' : 'progress', stageChanged);
      for (const cue of result.cues) {
        try { onCue(copy(cue), copy(state)); } catch (error) { report(error, 'cue'); }
      }
      if (result.carryReady) { pendingCarry = true; handoff(); }
    },
    key(event = {}) {
      if (!interact(event) || closed || !state || state.stage === 'carried') return false;
      const ctx = context();
      if (!present(ctx) || suspended(ctx) || ctx.inRange !== true || ctx.facing !== true) return false;
      if (event.ctrlKey || event.metaKey || event.altKey) return false;
      if (!event.repeat && !pendingSave) {
        if (!ready()) { held = false; void load(); }
        else held = true;
      }
      return true;
    },
    keyup(event = {}) {
      if (!interact(event)) return false;
      const consumed = held; held = false; return consumed;
    },
    blur() { interrupt('blur'); },
    pause() { paused = true; interrupt('pause'); },
    resume() { paused = false; interrupt('resume'); },
    exit() {
      if (closed) return;
      interrupt('exit');
      if (state && !pendingSave) persist('exit');
      held = false; closed = true;
    },
    serialize: () => copy(state),
    view() {
      const base = recordistReleaseView(state), ctx = context(), usable = ready();
      const near = present(ctx) && ctx.inRange === true, aimed = ctx.facing === true;
      const owns = base.tool === 'rig' ? ctx.hasRig === true : base.tool === 'fork' ? ctx.hasFork === true : true;
      const canInteract = base.active && usable && near && aimed && owns && !suspended(ctx) && !pendingSave && base.stage !== 'settling';
      let prompt = '';
      if (base.active && near && aimed) {
        const button = inputPrompt('interact');
        if (saveError) prompt = 'SAVING THE RELEASE…';
        else if (!usable) prompt = loadError ? `${button} RETRY THE RECORDIST MODEL` : 'PREPARING THE RECORDIST…';
        else if (!owns) prompt = base.tool === 'rig' ? 'THE BENT RIG IS NEEDED' : 'THE TUNING FORK IS NEEDED';
        else if (base.stage !== 'settling') prompt = base.requiresRelease && held ? `RELEASE ${button}`
          : `${button} HOLD · ${base.actionLabel}${base.progress > 0 ? ` · ${Math.round(base.progress * 100)}%` : ''}`;
      }
      return { ...base, ready: usable, inRange: near, facing: aimed, canInteract, held,
        prompt, status: saveError ? 'checkpoint-error' : usable ? 'ready' : loadError ? 'asset-error' : 'loading',
        error: saveError || loadError || null };
    },
    render() {
      const view = scene.view(), { cols, rows } = uiSize();
      if (!view.active || !view.inRange || cols < 1 || rows < 1) return;
      // Two ordinary VFD lines leave the physical body and the normal world
      // visible. No scrim, full-screen panel or independent shader is added.
      if (view.caption) uiText(2, rows - 3, view.caption, 'ui-secondary', .9, Math.max(1, cols - 4));
      if (view.prompt) uiText(2, rows - 1.7, view.prompt, 'ui-primary', .95, Math.max(1, cols - 4));
    },
  };
  // The scene can also be driven by a host without a scene-stack enter hook.
  interrupt('initialize');
  return scene;
}
