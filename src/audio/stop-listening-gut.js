// THE EAR ROOM'S SOUND. Wet, and moving, like something digesting.
//
// Real recordings (data/stop-listening.js STOP_LISTENING_SOURCES), cut into
// events and two murmuring beds by tools/chunk_surfer/build-stop-listening-audio.mjs,
// which also bakes the dominant 8–10-bit / 22.05–32 kHz grain. This module does the two things that
// depend on the night: WHERE it is (each heap is a point; panned by his head,
// darker behind him and further off, the plant pipe's and the horizon score's
// rules) and WHAT ROOM it is in (a synthetic tail sized to the room: B3 is
// treated and nearly dead, the pool is tile and goes on).
//
// It stops when he listens. The monitor open, or a take rolling, and the room
// is quiet; take the cans off and it comes back up. Nothing here is noise to the
// recordist: it never reaches the acoustic emitter or the take's spoil check.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export const STOP_LISTENING_AUDIO = Object.freeze({
  radius: 18,          // metres; it is meant to be heard from the door
  gain: 0.62,
  bedGain: 0.30,
  gutShare: 0.74,      // the rest are the wet ones
  muteSeconds: 0.08,   // time constant down when he listens
  resumeSeconds: 0.9,  // and back up when he stops
});

export const STOP_LISTENING_REVERB = Object.freeze({
  main_b3: Object.freeze({ seconds: 0.45, wet: 0.14, preDelay: 0.006 }),
  the_tub: Object.freeze({ seconds: 3.6, wet: 0.46, preDelay: 0.034 }),
  amplifications: Object.freeze({ seconds: 2.5, wet: 0.36, preDelay: 0.024 }),
  soundnoisemusic: Object.freeze({ seconds: 1.0, wet: 0.22, preDelay: 0.012 }),
});

// One point, heard from where he stands. `dx`/`dz` are metres in the renderer's
// frame; forward is (sin yaw, -cos yaw), the convention the horizon score uses.
export function stopListeningVoiceMix({ dx = 0, dz = 0 } = {}, yaw = 0, { radius = STOP_LISTENING_AUDIO.radius } = {}) {
  const distance = Math.hypot(dx, dz);
  const bearing = distance < 1e-6 ? 0 : wrap(Math.atan2(dx, -dz) - yaw);
  const s = Math.sin(bearing), rear = Math.max(0, -Math.cos(bearing));
  // Inside a metre and a half it is simply here; past that it falls away.
  const reach = clamp((distance - 1.5) / Math.max(1, radius - 1.5), 0, 1);
  const near = (1 - reach) ** 1.6;
  // Up close a point stops being a direction: pan relaxes toward the middle.
  const spread = clamp(distance / 2.5, 0, 1);
  return {
    distance, bearing, rear,
    gain: near,
    pan: clamp(Math.sign(s) * Math.abs(s) ** 0.7 * spread, -1, 1),
    cutoff: Math.max(700, 8200 * (1 - 0.7 * rear) * (1 - 0.6 * reach)),
  };
}

// A room's tail, made, not measured: decaying noise, two channels, a handful of
// early reflections, and a tail that darkens as it goes, as air and tile do.
export function stopListeningImpulse(context, { seconds, preDelay }, random = Math.random) {
  const rate = context.sampleRate, length = Math.max(1, Math.round((seconds + preDelay) * rate));
  const ir = context.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    let lp = 0;
    for (let i = Math.round(preDelay * rate); i < length; i++) {
      const t = i / rate - preDelay;
      const decay = Math.exp(-6.9 * t / seconds);
      const darkening = clamp(0.92 - 0.75 * (t / seconds), 0.12, 0.92);
      lp += darkening * ((random() * 2 - 1) - lp);
      data[i] = lp * decay;
    }
    for (let k = 0; k < 7; k++) {
      const at = Math.round((preDelay + 0.004 + random() * 0.05) * rate);
      if (at < length) data[at] += (random() < 0.5 ? -1 : 1) * (0.5 - k * 0.05);
    }
  }
  return ir;
}

export function createStopListeningGutRuntime({ context, destination, urlFor, random = Math.random, fetcher = globalThis.fetch } = {}) {
  const idle = { audible: false, voices: [], loaded: false };
  if (!context || !destination || typeof urlFor !== 'function') return { update() { return idle; }, stop() {}, frame: () => idle };

  const master = context.createGain();
  master.gain.value = 0;
  master.connect(destination);
  const reverbIn = context.createGain();
  const convolver = context.createConvolver();
  convolver.normalize = true;
  const wet = context.createGain();
  wet.gain.value = 0;
  reverbIn.connect(convolver).connect(wet).connect(master);

  let manifest = null, loading = null, failed = null;
  const buffers = new Map();
  const voices = new Map();
  let room = null, last = idle, fired = 0;

  async function decode(file) {
    const response = await fetcher(urlFor(file));
    if (!response.ok) throw new Error(`stop-listening audio ${file}: ${response.status}`);
    return context.decodeAudioData(await response.arrayBuffer());
  }
  function load() {
    if (loading) return loading;
    loading = (async () => {
      const response = await fetcher(urlFor('manifest.json'));
      if (!response.ok) throw new Error(`stop-listening manifest: ${response.status}`);
      manifest = await response.json();
      // Beds first: they are what makes the room sound occupied from the door.
      for (const bed of manifest.beds) buffers.set(bed.file, await decode(bed.file));
      for (const event of manifest.events) buffers.set(event.file, await decode(event.file));
    })().catch((err) => { failed = String(err?.message || err); });
    return loading;
  }

  function voiceFor(id) {
    let v = voices.get(id);
    if (v) return v;
    const input = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 6000; filter.Q.value = 0.5;
    const dry = context.createGain(); dry.gain.value = 0;
    const panner = context.createStereoPanner();
    const send = context.createGain(); send.gain.value = 0;
    input.connect(filter);
    filter.connect(dry).connect(panner).connect(master);
    filter.connect(send).connect(reverbIn);
    v = { id, input, filter, dry, panner, send, bed: null, nextAt: 0, burst: 0 };
    voices.set(id, v);
    return v;
  }

  function play(v, file, { at, gain = 1, rate = 1, fadeIn = 0.004, offset = 0, duration = null } = {}) {
    const buffer = buffers.get(file);
    if (!buffer) return null;
    const src = context.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = context.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + fadeIn);
    src.connect(g).connect(v.input);
    src.start(at, offset, duration ?? undefined);
    src.onended = () => { try { src.disconnect(); g.disconnect(); } catch { /* already gone */ } };
    return { src, g };
  }

  // A bed is restarted before it runs out and crossfaded with itself, so an
  // encoder's padding at the end of a file can never be heard as a loop point.
  function keepBed(v, bedIndex, now) {
    if (!manifest?.beds?.length) return;
    const bed = manifest.beds[bedIndex % manifest.beds.length];
    const buffer = buffers.get(bed.file);
    if (!buffer) return;
    if (v.bed && now < v.bed.until) return;
    const fade = 2.2, offset = random() * Math.max(0, buffer.duration - 8);
    const length = Math.min(buffer.duration - offset, 6 + random() * 6);
    const voice = play(v, bed.file, { at: now, gain: STOP_LISTENING_AUDIO.bedGain, fadeIn: fade, offset, duration: length });
    if (!voice) return;
    voice.g.gain.setValueAtTime(STOP_LISTENING_AUDIO.bedGain, now + Math.max(fade, length - fade));
    voice.g.gain.linearRampToValueAtTime(0, now + length);
    v.bed = { until: now + length - fade };
  }

  function fireEvent(v, now) {
    const gut = random() < STOP_LISTENING_AUDIO.gutShare;
    const pool = manifest.events.filter((e) => (e.role === 'gut') === gut);
    const event = pool[Math.floor(random() * pool.length)] || manifest.events[0];
    if (!event) return;
    play(v, event.file, { at: now + 0.01, gain: 0.55 + random() * 0.45, rate: 0.84 + random() * 0.26 });
    fired += 1;
    // Mostly a slow, uneven churn; now and then several at once, the way a gut
    // moves in runs.
    if (v.burst > 0) { v.burst -= 1; v.nextAt = now + 0.18 + random() * 0.35; return; }
    if (random() < 0.16) v.burst = 1 + Math.floor(random() * 3);
    v.nextAt = now + 0.9 + random() * 2.8;
  }

  function setRoom(roomId) {
    if (roomId === room) return;
    room = roomId;
    const shape = STOP_LISTENING_REVERB[roomId];
    if (shape) convolver.buffer = stopListeningImpulse(context, shape, random);
  }

  // input: { active, roomId, muted, yaw, voices: [{ id, dx, dz, gain }] }
  function update(input = {}) {
    const now = context.currentTime;
    const active = !!input.active && !!input.roomId;
    if (!active) {
      master.gain.setTargetAtTime(0, now, 0.25);
      last = { ...idle, loaded: !!manifest && !failed, failed };
      return last;
    }
    void load();
    setRoom(input.roomId);
    const shape = STOP_LISTENING_REVERB[input.roomId] || { wet: 0.2 };
    const muted = !!input.muted;
    master.gain.setTargetAtTime(muted ? 0 : STOP_LISTENING_AUDIO.gain, now,
      muted ? STOP_LISTENING_AUDIO.muteSeconds : STOP_LISTENING_AUDIO.resumeSeconds);
    wet.gain.setTargetAtTime(shape.wet, now, 0.3);
    const ready = !!manifest && buffers.size === (manifest.events.length + manifest.beds.length);
    const report = [];
    (input.voices || []).forEach((point, index) => {
      const v = voiceFor(point.id);
      const mix = stopListeningVoiceMix(point, input.yaw || 0);
      const level = mix.gain * (Number(point.gain) || 1);
      v.dry.gain.setTargetAtTime(level, now, 0.06);
      v.panner.pan.setTargetAtTime(mix.pan, now, 0.05);
      v.filter.frequency.setTargetAtTime(mix.cutoff, now, 0.08);
      // Further off is more room and less source.
      v.send.gain.setTargetAtTime((0.35 + 0.65 * Math.sqrt(level)) * (Number(point.gain) || 1), now, 0.1);
      if (ready && !muted && level > 0.002) {
        if (index < 2) keepBed(v, index, now);
        if (now >= v.nextAt) fireEvent(v, now);
      }
      report.push({ id: point.id, gain: +level.toFixed(3), pan: +mix.pan.toFixed(3), rear: +mix.rear.toFixed(3), cutoff: Math.round(mix.cutoff) });
    });
    last = { audible: !muted && report.some((v) => v.gain > 0.002), muted, roomId: input.roomId, loaded: ready, failed, fired, voices: report };
    return last;
  }

  function stop() {
    const now = context.currentTime;
    master.gain.setTargetAtTime(0, now, 0.1);
  }

  return { update, stop, frame: () => last };
}
