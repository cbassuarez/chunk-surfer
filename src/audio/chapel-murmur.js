// THE CONGREGATION'S MURMUR: what the watchers are saying, and what a take hears.
//
// Not a new recording and not a new crowd. It is the service's own recitation,
// cut into grains a third of a second to a second long, slowed or quickened a
// little and put through a low-pass so no word survives, each grain played from
// wherever the bodies murmuring at you are. The game decides how loud that is
// (game/chapel-apparitions.js); this only voices it.
//
// It has its own master because its rule is the opposite of the service's: the
// service goes quiet for a take, the murmur is exactly what a take is fighting,
// so recording and listening never mute it. Pause, menus, a fight and playback do.

import { chapelServiceImpulse } from './chapel-service.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export const CHAPEL_MURMUR = Object.freeze({
  clips: Object.freeze(['priest-pater-address', 'priest-pater-bread', 'priest-pater-deliverance',
    'priest-communion-invitation', 'priest-communion-blessing', 'response-amen']),
  slots: 8,
  maxGrains: 18,
  grainSeconds: Object.freeze([.35, 1.1]),
  rate: Object.freeze([.82, 1.12]),
  // Seconds between grain onsets in one mouth: sparse when it is faint, a
  // steady babble once it reaches the spoil level.
  onsetSeconds: Object.freeze([.62, .16]),
  highpassHz: 190,
  cutoffHz: 1400,
  gain: .62,
  dialogueGain: .3,
  send: .55,
  lookaheadSeconds: .12,
  fadeInSeconds: .6,
  fadeOutSeconds: .05,
});

// Where one murmuring cluster sits for the listener. `gain` arrives already
// heard (distance and sight are the game's), normalised so 1 is the spoil level.
export function chapelMurmurMix(voice = {}, listener = {}, yaw = 0) {
  const dx = (voice.x || 0) - (listener.x || 0), dz = (voice.z || 0) - (listener.z || 0);
  const distance = Math.hypot(dx, dz);
  const bearing = distance < .001 ? 0 : wrap(Math.atan2(dx, -dz) - yaw);
  const rear = Math.max(0, -Math.cos(bearing));
  // Overhead is darker too: the ceiling crawlers are heard through the vault.
  const above = clamp(((voice.y || 0) - (listener.y || 0)) / 6, 0, 1);
  return {
    distance, bearing,
    gain: clamp(Number(voice.gain) || 0, 0, 1.6) * .5,
    pan: clamp(Math.sin(bearing) * Math.min(1, distance / 3) * .88, -.88, .88),
    cutoff: clamp(CHAPEL_MURMUR.cutoffHz - rear * 420 - above * 380, 520, CHAPEL_MURMUR.cutoffHz),
  };
}

// The gap before a mouth's next grain, by how loud it is.
export function chapelMurmurOnsetGap(gain, random = Math.random) {
  const [sparse, dense] = CHAPEL_MURMUR.onsetSeconds;
  const k = clamp(Number(gain) || 0, 0, 1);
  return (sparse + (dense - sparse) * k) * (.6 + .8 * random());
}

export function createChapelMurmurRuntime({ context, destination, bufferFor, ready, random = Math.random } = {}) {
  const idle = { active: false, audible: false, loaded: false, grains: 0, mouths: [] };
  if (!context || !destination || typeof bufferFor !== 'function') return {
    update: () => idle, frame: () => idle, stop() {}, dispose() {},
  };
  const master = context.createGain(); master.gain.value = 0;
  master.connect(destination);
  const convolver = context.createConvolver(); convolver.normalize = true;
  convolver.buffer = chapelServiceImpulse(context, random);
  const wet = context.createGain(); wet.gain.value = .4;
  convolver.connect(wet).connect(master);

  const slots = [];
  for (let i = 0; i < CHAPEL_MURMUR.slots; i++) {
    const input = context.createGain(), high = context.createBiquadFilter(), low = context.createBiquadFilter();
    high.type = 'highpass'; high.frequency.value = CHAPEL_MURMUR.highpassHz; high.Q.value = .5;
    low.type = 'lowpass'; low.frequency.value = CHAPEL_MURMUR.cutoffHz; low.Q.value = .7;
    const dry = context.createGain(); dry.gain.value = 0;
    const pan = context.createStereoPanner(), send = context.createGain(); send.gain.value = 0;
    input.connect(high).connect(low);
    low.connect(dry).connect(pan).connect(master);
    low.connect(send).connect(convolver);
    slots.push({ id: null, gain: 0, nextAt: 0, nodes: { input, high, low, dry, pan, send } });
  }

  const grains = new Set();
  let last = idle, disposed = false, asked = false, scheduled = 0;

  function grain(slot, at) {
    if (grains.size >= CHAPEL_MURMUR.maxGrains) return;
    const clips = CHAPEL_MURMUR.clips;
    const buffer = bufferFor(clips[Math.floor(random() * clips.length) % clips.length]);
    if (!buffer) return;
    const [shortest, longest] = CHAPEL_MURMUR.grainSeconds, [slowest, fastest] = CHAPEL_MURMUR.rate;
    const seconds = shortest + (longest - shortest) * random(), rate = slowest + (fastest - slowest) * random();
    const span = seconds * rate;
    if (buffer.duration <= span + .05) return;
    const offset = random() * (buffer.duration - span);
    const source = context.createBufferSource(), envelope = context.createGain();
    source.buffer = buffer; source.playbackRate.value = rate;
    const level = .6 + .4 * random();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(level, at + seconds * .3);
    envelope.gain.linearRampToValueAtTime(0, at + seconds);
    source.connect(envelope).connect(slot.nodes.input);
    const live = { source, envelope };
    grains.add(live);
    source.onended = () => {
      grains.delete(live);
      try { source.disconnect(); envelope.disconnect(); } catch { /* disposed */ }
    };
    source.start(at, offset, span);
    source.stop(at + seconds + .02);
    scheduled++;
  }

  // Keeps each mouth on the same cluster while it stays among the loudest, so a
  // grain in flight never jumps across the room.
  function assign(voices) {
    const wanted = new Map(voices.map(v => [v.id, v]));
    const kept = new Set();
    for (const slot of slots) if (slot.id && wanted.has(slot.id)) kept.add(slot.id);
    const free = slots.filter(slot => !slot.id || !wanted.has(slot.id));
    for (const voice of voices) {
      if (kept.has(voice.id)) continue;
      const slot = free.shift();
      if (!slot) break;
      slot.id = voice.id; slot.nextAt = 0; kept.add(voice.id);
    }
    for (const slot of free) slot.id = null;
    return wanted;
  }

  function update(input = {}) {
    if (disposed) return idle;
    const now = context.currentTime, active = !!input.active;
    if (active && !asked && typeof ready === 'function') { asked = true; void ready(); }
    const loaded = CHAPEL_MURMUR.clips.some(id => !!bufferFor(id));
    const audible = active && loaded && !input.muted;
    const target = audible ? CHAPEL_MURMUR.gain * (input.dialogue ? CHAPEL_MURMUR.dialogueGain : 1) : 0;
    master.gain.setTargetAtTime(target, now, audible ? CHAPEL_MURMUR.fadeInSeconds : CHAPEL_MURMUR.fadeOutSeconds);
    const voices = audible ? (input.voices || []).slice(0, CHAPEL_MURMUR.slots) : [];
    const wanted = assign(voices), mouths = [];
    for (const slot of slots) {
      const voice = slot.id ? wanted.get(slot.id) : null;
      const mix = voice ? chapelMurmurMix(voice, input.listener || {}, input.yaw || 0) : { gain: 0, pan: 0, cutoff: CHAPEL_MURMUR.cutoffHz };
      const n = slot.nodes;
      n.dry.gain.setTargetAtTime(mix.gain, now, .08);
      n.send.gain.setTargetAtTime(mix.gain * CHAPEL_MURMUR.send, now, .12);
      n.pan.pan.setTargetAtTime(mix.pan, now, .07);
      n.low.frequency.setTargetAtTime(mix.cutoff, now, .1);
      slot.gain = mix.gain;
      if (!voice || mix.gain < .01) continue;
      mouths.push({ id: slot.id, ...mix });
      if (slot.nextAt < now) slot.nextAt = now + random() * .2;
      while (slot.nextAt < now + CHAPEL_MURMUR.lookaheadSeconds) {
        grain(slot, Math.max(now + .005, slot.nextAt));
        slot.nextAt += chapelMurmurOnsetGap(Number(voice.gain) || 0, random);
      }
    }
    if (!audible && grains.size) endGrains(now);
    last = { active, audible, loaded, muted: !!input.muted, reason: input.reason || null,
      grains: grains.size, scheduled, mouths };
    return last;
  }

  function endGrains(now) {
    for (const live of grains) {
      try {
        live.envelope.gain.cancelScheduledValues(now);
        live.envelope.gain.setTargetAtTime(0, now, .015);
        live.source.stop(now + .06);
      } catch { /* already ended */ }
    }
    grains.clear();
  }

  function stop() {
    const now = context.currentTime;
    master.gain.setTargetAtTime(0, now, CHAPEL_MURMUR.fadeOutSeconds);
    endGrains(now);
    for (const slot of slots) slot.id = null;
    last = { ...last, active: false, audible: false, grains: 0, mouths: [] };
  }
  function dispose() {
    stop(); disposed = true;
    for (const slot of slots) for (const node of Object.values(slot.nodes)) node.disconnect?.();
    master.disconnect(); convolver.disconnect(); wet.disconnect();
  }
  return { update, frame: () => last, stop, dispose };
}
