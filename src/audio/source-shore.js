import { sourceShoreSensoryFrame } from '../game/source-sensory.js';

// A small graph for things that physically exist at the first void's edges.
// There is no void bed, score, voice, or recorder route. The caller supplies the
// ordinary SFX bus; mute and foreground ownership remain the game's policy.
export function createSourceShoreAudio({ getAudio = () => null } = {}) {
  let context = null, destination = null, buffer = null, disposed = false;
  let previous = null, current = sourceShoreSensoryFrame(), room = null, motor = null;
  let roomPan = 0, liftPan = 0, suspended = false, audible = false;
  const voices = new Set();
  const bound = (value, limit = 1) => Math.max(-limit, Math.min(limit, Number(value) || 0));

  function detach(voice) {
    voice.source.onended = null;
    for (const node of voice.nodes) { try { node.disconnect(); } catch (_) {} }
    voices.delete(voice);
  }
  function end(voice, immediate = false) {
    if (!voice || (voice.ending && !immediate)) return;
    voice.ending = true;
    const now = context?.currentTime || 0;
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, .025);
      voice.source.stop(now + (immediate ? 0 : .12));
    } catch (_) {}
    // Suspended clocks cannot be trusted to call onended. Cancellation must
    // detach immediately, including finite returns scheduled but not yet heard.
    if (immediate) detach(voice);
  }
  function clear() {
    for (const voice of [...voices]) end(voice, true);
    room = null; motor = null;
  }
  function audio() {
    const next = getAudio();
    if (!next?.ctx || !next.destination || next.ctx.state === 'closed') return false;
    if (next.ctx.state === 'suspended' || next.ctx.state === 'interrupted') { clear(); return false; }
    if (context !== next.ctx || destination !== next.destination) {
      clear(); context = next.ctx; destination = next.destination; buffer = null;
    }
    return true;
  }
  function noise() {
    if (buffer) return buffer;
    const rate = Number(context.sampleRate) || 48000;
    buffer = context.createBuffer(1, Math.floor(rate * 2.63), rate);
    const data = buffer.getChannelData(0); let seed = 0x4417, body = 0;
    for (let i = 0; i < data.length; i += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      body = (body + ((seed / 0xffffffff) * 2 - 1) * .025) / 1.025;
      const seam = Math.max(0, Math.min(1, i / (rate * .02), (data.length - 1 - i) / (rate * .02)));
      data[i] = body * 4 * seam;
    }
    return buffer;
  }
  function voice({ frequency = 180, q = .5, tone = false, gain = 0, pan = 0, duration = null, delay = 0 } = {}) {
    const source = tone ? context.createOscillator() : context.createBufferSource();
    if (tone) { source.type = 'sine'; source.frequency.value = frequency; }
    else { source.buffer = noise(); source.loop = duration === null; }
    const filter = tone ? null : context.createBiquadFilter(), amp = context.createGain();
    const panner = context.createStereoPanner?.();
    const nodes = [source, filter, amp, panner].filter(Boolean);
    if (filter) {
      filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = q;
      source.connect(filter); filter.connect(amp);
    } else source.connect(amp);
    if (panner) { panner.pan.value = bound(pan, .90); amp.connect(panner); panner.connect(destination); }
    else amp.connect(destination);
    const record = { source, gain: amp, panner, nodes, ending: false }; voices.add(record);
    source.onended = () => detach(record);
    const at = context.currentTime + Math.max(0, delay);
    amp.gain.setValueAtTime(0, context.currentTime);
    amp.gain.setValueAtTime(0, at);
    amp.gain.linearRampToValueAtTime(Math.max(0, gain), at + .008);
    if (duration !== null) {
      amp.gain.exponentialRampToValueAtTime(.00001, at + duration);
    }
    source.start(at);
    if (duration !== null) source.stop(at + duration + .01);
    return record;
  }
  function set(voice, gain, pan) {
    const now = context.currentTime;
    voice.gain.gain.setTargetAtTime(gain, now, .09);
    voice.panner?.pan.setTargetAtTime(bound(pan, .90), now, .06);
  }
  function contact(gain) {
    if (gain <= .00005) return;
    voice({ tone: true, frequency: 680, gain: gain * .65, duration: .12, pan: liftPan });
    voice({ frequency: 1450, q: 4.5, gain: gain * .35, duration: .075, pan: liftPan });
  }
  function update(frame, { roomPan: nextRoomPan = 0, liftPan: nextLiftPan = 0, suspended: nextSuspended = false } = {}) {
    if (disposed) return false;
    const next = sourceShoreSensoryFrame(frame), before = previous;
    previous = next; current = next;
    roomPan = nextRoomPan; liftPan = nextLiftPan;
    const wasSuspended = suspended, wasAudible = audible, oldContext = context;
    suspended = nextSuspended; audible = false;
    if (!next.active || suspended) { clear(); return false; }
    if (!audio()) return false;
    audible = true;
    if (next.roomLeak > .001) {
      room ||= voice({ frequency: 180, gain: .006 * next.roomLeak, pan: roomPan });
      set(room, .006 * next.roomLeak, roomPan);
    } else { end(room); room = null; }
    if (next.liftMoving && next.liftGain > .001) {
      motor ||= voice({ frequency: 205, q: 2.2, gain: .014 * next.liftGain, pan: liftPan });
      set(motor, .014 * next.liftGain, liftPan);
    } else { end(motor); motor = null; }
    // An observed arrival earns one small ordinary stop. Loading a waiting
    // platform, repeated uploads and returning focus never manufacture it.
    if (wasAudible && context === oldContext && !wasSuspended && before?.active && before.liftMoving && !next.liftMoving) contact(.018 * next.liftGain);
    return true;
  }
  function footstep() {
    if (disposed || suspended || !current.active || current.metalReturn <= .001 || !audio()) return false;
    // The first distant material answer belongs to a footstep near that
    // material. It never becomes an ambient chime or a timed attention cue.
    voice({ tone: true, frequency: 1170, gain: .005 * current.metalReturn,
      duration: .13, delay: .035, pan: liftPan });
    return true;
  }
  function pause() { suspended = true; audible = false; clear(); }
  function stop() { if (disposed) return; clear(); disposed = true; previous = null; buffer = null; }
  return {
    update, footstep, pause, stop,
    snapshot: () => ({ disposed, suspended, voices: voices.size, room: !!room, motor: !!motor,
      roomLeak: current.roomLeak, metalReturn: current.metalReturn }),
  };
}
