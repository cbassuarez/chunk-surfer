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
import { freshWinding } from './coastal-memory/winding.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
const finite = (v, d = 0) => Number.isFinite(v) ? v : d;
const keyOf = (e) => String(e?.key || e?.code || '').toLowerCase().replace(/^key/, '');

export const COASTAL_HANDS = Object.freeze({ crankTurnsPerSecond: 1.4, orbitPerSecond: 2.2, shakeKey: 'q' });

export function createCoastalHandsScene({
  eye = [0, 1.62, 0], yaw = 0, pitch = 0, worldFromLocal = null,
  context = null, destination = null, createAudio = createCoastalWindingAudio,
  renderer = null, baseFrame = null, startHandling = false, initialWinding = null, recorderHeld: initialRecorderHeld = false,
  onAudioSample = () => {}, onMonitorChange = () => {}, onExit = () => {}, onTrace = () => {},
} = {}) {
  let interaction = freshHandsInteraction();
  interaction.hands.winding={...freshWinding(),...initialWinding,phase:'rest',held:false,wind:0,playbackRate:0};
  let audio = null, closed = false, ready = false, error = null, paused = false, blurred = false, initializing = null;
  let pinHeld = false, shake = 0, recorderHeld = initialRecorderHeld === true;
  let inspectionDistance=.14;
  const keys = new Set();
  const trace = (v) => { try { onTrace(structuredClone(v)); } catch {} };
  const frame = () => {
    const base = handsInteractionFrame(interaction);
    const held = base.handling && worldFromLocal ? coastalHandsHeldLocal({ eye, yaw, pitch, boxPose: base.boxPose, shake: base.shakeLevel, worldFromLocal,distance:inspectionDistance }) : null;
    return { ...base, heldLocal: held, ready, error, recorderHeld,inspectionDistance,
      ui: { ...base.ui, pickup: null } };
  };
  function apply(input, dt) {
    // A missing comb/release asset must not silently spend a turn. Inspection
    // and lowering remain available even if sound preparation failed.
    const voiced = audio?.ready?.() !== false;
    const r = stepHandsInteraction(interaction, voiced ? input : { ...input, pinHeld: false, crankDelta: 0 }, dt);
    interaction = r.state;
    if (audio) {
      audio.update({ state: interaction.hands.winding, events: r.events, turn: interaction.hands.crankRate, held: interaction.hands.pinHeld });
    }
    return r;
  }
  const frozen = () => closed || !ready || paused || blurred;
  function flushAudio() { if(frozen()||!audio?.sample)return;try{onAudioSample({...audio.sample(),recorderHeld});}catch(reason){error=String(reason?.message||reason);} }
  function clearInput() { keys.clear(); pinHeld = false; shake = 0; }
  function sound() { audio?.setPaused?.(frozen()); }
  return {
    id: 'coastal-hands', blocksWorld: true, blocksInput: true, suppressesHud: true, handlesEscape: false,
    get allowsLook() { return !frozen(); },
    initialize() {
      if (ready) return Promise.resolve(true);
      if(initializing)return initializing;
      initializing=Promise.resolve().then(async () => {
        if (context && destination && !audio) {
          audio = createAudio({ context, destination });
          await audio.initialize?.();
        }
        if(closed)return false;
        ready = true; error = null;
        if (startHandling && interaction.mode !== 'handling') apply({ pickUp: true }, 0);
        sound();if(startHandling)audio?.rattle?.(.25);return true;
      }).catch((reason) => { error = String(reason?.message || reason); ready = false; return false; });
      return initializing;
    },
    enter() { void this.initialize(); },
    update(dt) {
      if (frozen()) return;
      flushAudio();
      const seconds = clamp(dt, 0, 0.25);
      // Crank from held keys; shake decays after a Q press.
      const vertical = Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'));
      const crankDelta = pinHeld ? vertical * COASTAL_HANDS.crankTurnsPerSecond * seconds : 0;
      const orbit = (Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'))) * COASTAL_HANDS.orbitPerSecond * seconds;
      const roll = (Number(keys.has(']')) - Number(keys.has('['))) * COASTAL_HANDS.orbitPerSecond * seconds;
      apply({ pinHeld, crankDelta, shake, lookDelta: { yaw: orbit, pitch: pinHeld?0:vertical*COASTAL_HANDS.orbitPerSecond*seconds, roll } }, seconds);
      shake = 0;
      sound();
    },
    view: frame, serialize: () => structuredClone(interaction),
    lookAngles: () => ({ yaw: interaction.boxYaw, pitch: interaction.boxPitch }),
    lookBy(yawDelta = 0, pitchDelta = 0) {
      if (frozen()) return false;
      apply({ pinHeld, lookDelta: { yaw: finite(yawDelta), pitch: finite(pitchDelta) } }, 0);
      return true;
    },
    key(event = {}) {
      if (frozen()) return true;
      const key = keyOf(event);
      if (key === 'escape' || event.controllerAction === 'back') return false;
      const down = !event.repeat && event.type !== 'keyup';
      if (key === 'e' && down) {
        const handling = interaction.mode === 'handling';
        apply(handling ? { putDown: true } : { pickUp: true }, 0.016);
        trace({ type: handling ? 'put-down' : 'pick-up', mode: interaction.mode });
        if(handling)this.exit({ releaseTail: true });
      } else if (key === 'f' && event.type === 'keydown') {
        pinHeld = true;
        // Catch the key on the input edge, including a catch/release between
        // simulation frames. This does not manufacture winding or tune time.
        apply({ pinHeld: true, crankDelta: 0 }, 0);
      } else if (key === COASTAL_HANDS.shakeKey && down) {
        shake = 1;
      } else if (key === 'r' && down) {
        flushAudio();recorderHeld=!recorderHeld;onMonitorChange(recorderHeld);
      } else if (key === 'home' && down) {
        inspectionDistance=.14;apply({resetView:true,pinHeld},0);
      } else if (['w', 'a', 's', 'd', '[', ']', 'bracketleft', 'bracketright', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        const code=key==='bracketleft'?'[':key==='bracketright'?']':key;
        if (event.type === 'keydown') keys.add(code); else keys.delete(code);
      }
      return true;
    },
    keyup(event = {}) {
      const key = keyOf(event);
      if (key === 'f') pinHeld = false;
      keys.delete(key==='bracketleft'?'[':key==='bracketright'?']':key);
      if (!frozen()) apply({ pinHeld, crankDelta: 0 }, 0);
      return true;
    },
    pointer(event = {}) {
      if (frozen()) return true;
      // The broken spring restraint only permits a supported manual turn.
      // Letting go releases the key and stops the tune; it does not repair it.
      if (event.type === 'pointerdown') {
        pinHeld = true; keys.add('w');
        apply({ pinHeld: true, crankDelta: 0 }, 0);
        sound();
        return true;
      }
      if (['pointerup', 'pointercancel', 'lostpointercapture'].includes(event.type)) {
        pinHeld = false; keys.delete('w');
        apply({ pinHeld: false, crankDelta: 0 }, 0);
        sound(); return true;
      }
      // Pointer drag orbits the box in hand.
      if (event.type === 'pointermove' && event.movementX != null) {
        // Viewing motion neither releases the held key nor advances its clock.
        apply({ pinHeld, crankDelta: 0, lookDelta: { yaw: finite(event.movementX) * 0.008, pitch: -finite(event.movementY) * 0.006 } }, 0);
      }
      return true;
    },
    wheel(event={}) {if(frozen())return true;inspectionDistance=clamp(inspectionDistance*Math.exp(finite(event.deltaY)*.001),.10,.3);return true;},
    render() {
      if (closed) return false;
      const value = frame();
      if (renderer) {
        try {
          // Reuse the coastal renderer: forward its base frame (pose/elapsed/
          // recordingOffset/wreck lights) plus the hands so the box draws in hand.
          renderer.render({ ...(baseFrame || {}), hands: { handling: value.handling, winding: value.winding, boxPose: value.boxPose, shakeLevel: value.shakeLevel, heldLocal: value.heldLocal } });
        } catch (reason) { error = String(reason?.message || reason); }
      }
      return ready;
    },
    pause() { flushAudio();paused = true; clearInput(); sound(); return true; },
    resume() { paused = false; clearInput(); sound(); return true; },
    blur() { flushAudio();blurred = true; clearInput(); sound(); },
    focus() { blurred = false; clearInput(); sound(); },
    exit({ releaseTail = false } = {}) {
      if (closed) return false;
      flushAudio();
      const keepRelease = releaseTail && !paused && !blurred && ready;
      clearInput();apply({ putDown: true }, 0);closed = true;
      if (!keepRelease) sound();
      audio?.dispose?.({ releaseTail: keepRelease });onExit({ interaction: structuredClone(interaction),recorderHeld,intentionalLowering:releaseTail===true });
      return true;
    },
    diagnostics: () => ({ ready, error, mode: interaction.mode, paused, blurred, pinHeld, keys: [...keys] }),
  };
}
