// The keepsake handled in the hands: the live scene controller that owns the
// interaction, routes input into it, voices it through the winding audio owner,
// and hands a frame to the renderer. It is entered from the plinth scene when
// the player is at the box and presses interact, and returns there on lower.
//
// Input contract (keyboard/pointer, no wheel):
//   E            pick the box up / put it down
//   F (hold)     grab the winding pin
//   W / ArrowUp  crank forward  (only while the pin is held)
//   S / ArrowDown crank backward
//   A / D        orbit the box   (pointer drag also orbits)
//   Q            shake the box
//
// This controller never touches the DOM, the renderer or the shared AudioContext
// directly — those are injected — so the whole input→state→frame→audio chain is
// testable. The pure state machine lives in coastal-memory/hands-scene.js.
import { freshHandsInteraction, stepHandsInteraction, handsInteractionFrame, coastalHandsHeldLocal } from './coastal-memory/hands-scene.js';
import { createCoastalWindingAudio } from '../audio/coastal-memory-winding.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
const finite = (v, d = 0) => Number.isFinite(v) ? v : d;
const keyOf = (e) => String(e?.key || e?.code || '').toLowerCase().replace(/^key/, '');

export const COASTAL_HANDS = Object.freeze({ crankTurnsPerSecond: 1.4, orbitPerSecond: 2.2, shakeKey: 'q' });

export function createCoastalHandsScene({
  eye = [0, 1.62, 0], yaw = 0, pitch = 0, worldFromLocal = null,
  context = null, destination = null, createAudio = createCoastalWindingAudio,
  renderer = null, baseFrame = null, onExit = () => {}, onTrace = () => {},
} = {}) {
  let interaction = freshHandsInteraction();
  let audio = null, closed = false, ready = false, error = null;
  let pinHeld = false, shake = 0;
  const keys = new Set();
  const trace = (v) => { try { onTrace(structuredClone(v)); } catch {} };
  const frame = () => {
    const base = handsInteractionFrame(interaction);
    const held = base.handling && worldFromLocal ? coastalHandsHeldLocal({ eye, yaw, pitch, boxPose: base.boxPose, shake: base.shakeLevel, worldFromLocal }) : null;
    return { ...base, heldLocal: held, ready, error,
      ui: { ...base.ui, pickup: !base.handling ? 'E · PICK UP' : null } };
  };
  function apply(input, dt) {
    const r = stepHandsInteraction(interaction, input, dt);
    interaction = r.state;
    if (audio && r.events.length) {
      audio.update({ state: interaction.hands.winding, events: r.events, turn: interaction.hands.crankRate, held: interaction.hands.pinHeld });
    }
    return r;
  }
  function sound() { audio?.setPaused?.(closed || !ready); }
  return {
    id: 'coastal-hands', blocksWorld: true, blocksInput: true, suppressesHud: true, handlesEscape: false,
    get allowsLook() { return ready && !closed; },
    initialize() {
      if (ready) return Promise.resolve(true);
      return Promise.resolve().then(async () => {
        if (context && destination && !audio) {
          audio = createAudio({ context, destination });
          await audio.initialize?.();
        }
        ready = true; error = null; sound(); return true;
      }).catch((reason) => { error = String(reason?.message || reason); ready = false; return false; });
    },
    enter() { void this.initialize(); },
    update(dt) {
      if (closed || !ready) return;
      const seconds = clamp(dt, 0, 0.25);
      // Crank from held keys; shake decays after a Q press.
      const crankDelta = (Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'))) * COASTAL_HANDS.crankTurnsPerSecond * seconds;
      const orbit = (Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'))) * COASTAL_HANDS.orbitPerSecond * seconds;
      apply({ pinHeld, crankDelta, shake, lookDelta: { yaw: orbit, pitch: 0 } }, seconds);
      shake = 0;
      sound();
    },
    view: frame, serialize: () => structuredClone(interaction),
    key(event = {}) {
      if (closed) return true;
      const key = keyOf(event);
      if (key === 'escape' || event.controllerAction === 'back') return false;
      const down = !event.repeat && event.type !== 'keyup';
      if (key === 'e' && down) {
        const handling = interaction.mode === 'handling';
        apply(handling ? { putDown: true } : { pickUp: true }, 0.016);
        trace({ type: handling ? 'put-down' : 'pick-up', mode: interaction.mode });
      } else if (key === 'f' && event.type === 'keydown') {
        pinHeld = true;
      } else if (key === COASTAL_HANDS.shakeKey && down) {
        shake = 1;
      } else if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        if (event.type === 'keydown') keys.add(key); else keys.delete(key);
      }
      return true;
    },
    keyup(event = {}) {
      const key = keyOf(event);
      if (key === 'f') pinHeld = false;
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) keys.delete(key);
      return true;
    },
    pointer(event = {}) {
      if (closed || event.type === 'pointerdown') return true;
      // Pointer drag orbits the box in hand.
      if (event.type === 'pointermove' && event.movementX != null) {
        apply({ lookDelta: { yaw: finite(event.movementX) * 0.008, pitch: -finite(event.movementY) * 0.006 } }, 0.016);
      }
      return true;
    },
    render() {
      if (closed) return false;
      const value = frame();
      if (renderer) {
        try {
          // Reuse the coastal renderer: forward its base frame (pose/elapsed/
          // recordingOffset/wreck lights) plus the hands so the box draws in hand.
          renderer.render({ ...(baseFrame || {}), hands: { handling: value.handling, winding: value.winding, boxPose: value.boxPose, shakeLevel: value.shakeLevel } });
        } catch (reason) { error = String(reason?.message || reason); }
      }
      return ready;
    },
    pause() { sound(); return true; },
    resume() { sound(); return true; },
    blur() { sound(); },
    focus() { sound(); },
    exit() {
      if (closed) return false;
      closed = true; apply({ putDown: true }, 0.016); sound(); audio?.dispose?.(); onExit({ interaction: structuredClone(interaction) });
      return true;
    },
    diagnostics: () => ({ ready, error, mode: interaction.mode, pinHeld, keys: [...keys] }),
  };
}
