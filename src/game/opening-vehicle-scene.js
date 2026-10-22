import { uiFill, uiSize, uiText } from '../render/ui.js';
import { promptLine } from './bindings.js';
import { OPENING_VEHICLE, openingVehicleExitFrame, openingVehiclePoint } from '../data/opening-vehicle.js';

export const OPENING_VEHICLE_SCENE = 'opening-vehicle';
export function makeOpeningVehicleScene({
  getAnchor = () => null, getAssetStatus = () => ({ loaded: false }),
  toWorldView = eye => eye, getLook = () => ({ yaw: 0, pitch: -.04 }),
  reducedMotion = false, onReady = () => {}, onDoor = () => {},
  onDone = () => {}, onExit = () => {},
} = {}) {
  let phase = 'loading', anchor = null, elapsed = 0, reveal = 0, startYaw = 0, exited = false, completed = false, error = null;
  const frame = () => anchor && (phase === 'exiting'
    ? openingVehicleExitFrame(anchor, elapsed, { reducedMotion, startYaw })
    : { eye: openingVehiclePoint(anchor, OPENING_VEHICLE.eye), doorOpen: 0, fade: 0 });
  function leave() {
    if (phase !== 'seated' || completed || exited) return;
    phase = 'exiting'; elapsed = 0; startYaw = Number(getLook()?.yaw) || anchor.yaw;
    scene.allowsLook = false; onDoor();
  }
  const scene = {
    id: OPENING_VEHICLE_SCENE, blocksInput: true, blocksWorld: true, suppressesHud: true,
    allowsLook: false, handlesEscape: false, worldPresentation: 'visible', lookProfile: 'calm',
    update(dt) {
      if (exited || completed) return;
      const step = Math.max(0, Number(dt) || 0);
      if (phase === 'loading') {
        const status = getAssetStatus(); error = status?.error || null; anchor = getAnchor();
        if (!anchor || (!status?.loaded && !error)) return;
        phase = 'seated'; scene.allowsLook = true; onReady(anchor);
        return;
      }
      if (phase === 'seated') { reveal = Math.min(1, reveal+step/.85); return; }
      elapsed += step;
      if (frame().done) { completed = true; onDone(frame()); }
    },
    worldView() {
      const view = frame(); if (!view) return null;
      return { ...toWorldView(view.eye), suppressActors: true,
        ...(phase === 'exiting' ? { yaw: view.yaw, pitch: view.pitch } : {}) };
    },
    view() { return { phase, elapsed, reveal, error, completed, ...frame() }; },
    key(event = {}) {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return true;
      const key = String(event.code || event.key || '').toLowerCase();
      if (['keye', 'e', 'enter', 'space', ' '].includes(key)
        || ['interact', 'confirm'].includes(event.controllerAction)) leave();
      // Escape passes to the ordinary pause menu. It never skips the exit.
      return !['escape'].includes(key) && event.controllerAction !== 'back';
    },
    exit() { if (exited) return; exited = true; scene.allowsLook = false; onExit({ completed }); },
    render() {
      const { cols, rows } = uiSize(), view = frame();
      const veil = phase === 'loading' ? 1 : phase === 'exiting' ? view.fade : 1-reveal;
      if (veil > .001) uiFill(0, 0, cols, rows, `rgba(4,5,7,${veil.toFixed(3)})`);
      if (phase !== 'seated') return;
      const prompt = promptLine([{ action: 'interact', label: 'STEP OUT OF THE VAN' }]);
      uiText(Math.max(2, Math.floor((cols-prompt.length)/2)), rows-3, prompt, 'ui-primary', Math.min(1, reveal*1.5));
      if (error) uiText(2, rows-5, 'CABIN UNAVAILABLE · STEP OUT TO CONTINUE', 'ui-secondary', .8);
    },
  };
  return scene;
}
