import { COASTAL_MEMORY_CUE, COASTAL_MEMORY_TAKE, COASTAL_MEMORY_SECONDS } from '../game/coastal-memory.js';
import { COASTAL_MUSIC_BOX_CLICKS, COASTAL_MUSIC_BOX_PLUCKS, COASTAL_MUSIC_BOX_STALL } from '../game/coastal-memory/mechanism.js';

export { COASTAL_MEMORY_CUE, COASTAL_MEMORY_TAKE, COASTAL_MEMORY_SECONDS };
export const COASTAL_MEMORY_NOTES = Object.freeze([196, 261.63]);
export const COASTAL_MEMORY_AUDIO_PROVENANCE = Object.freeze({
  kind: 'authored-procedural-pcm', revision: 1, durationSeconds: COASTAL_MEMORY_SECONDS,
  material: 'Broken two-tine music box: mechanism, two plucks, spring and casing resonance.',
  ambience: 'Procedural wind and distant sea placeholder; no recorded location or performer claimed.',
});
const buffers = new WeakMap(), airBuffers = new WeakMap();
const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
const offsetOf = v => ((Number.isFinite(v) ? v : 0) % COASTAL_MEMORY_SECONDS + COASTAL_MEMORY_SECONDS) % COASTAL_MEMORY_SECONDS;

// A new immutable master, not a substitute for the old hall/chair recording.
// Both the object and its received tape resolve these exact stereo samples.
export function coastalMemoryRecordingBuffer(context) {
  if (!context?.createBuffer || !Number.isFinite(context.sampleRate)) return null;
  if (buffers.has(context)) return buffers.get(context);
  const rate = context.sampleRate, buffer = context.createBuffer(2, Math.ceil(rate * COASTAL_MEMORY_SECONDS), rate);
  const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
  let seed = 0x434f4153, low = 0, metal = 0;
  for (let i = 0; i < left.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1, t = i / rate;
    low += (noise - low) * (1 - Math.exp(-35 / rate));
    metal += (noise - metal) * (1 - Math.exp(-3100 / rate));
    let sound = low * .008 + (noise - metal) * .0009;
    for (const at of COASTAL_MUSIC_BOX_CLICKS) {
      const d = t - at;
      if (d >= 0 && d < .08) sound += ((noise - metal) * .035 + Math.sin(d * Math.PI * 2 * 830) * .022) * Math.exp(-d * 86);
    }
    // Two bent tines caught by the same damaged cylinder; the second barely
    // releases. Inharmonic high partials decay before the wooden casing does.
    for (let n = 0; n < 2; n++) {
      const d = t - COASTAL_MUSIC_BOX_PLUCKS[n];
      if (d < 0 || d > 6.5) continue;
      const f = COASTAL_MEMORY_NOTES[n], attack = Math.min(1, d * 700), strength = n ? .061 : .075;
      for (const [ratio, gain, decay] of [[1, 1, 1.25], [2.756, .37, .62], [5.404, .13, .24]])
        sound += Math.sin(d * Math.PI * 2 * f * ratio + Math.sin(d * 17) * .009) * strength * gain * attack * Math.exp(-d / decay);
      sound += Math.sin(d * Math.PI * 2 * (n ? 157 : 142)) * .012 * attack * Math.exp(-d / 1.7);
    }
    const stall = t - COASTAL_MUSIC_BOX_STALL;
    if (stall > 0 && stall < .5) sound += Math.sin(stall * Math.PI * 2 * (81 - stall * 40)) * .018 * Math.exp(-stall * 15);
    const fade = Math.min(1, t / .04, (COASTAL_MEMORY_SECONDS - t) / .2);
    left[i] = clamp(sound * fade, -.7, .7);
    right[i] = clamp((sound * .965 + low * .003) * fade, -.7, .7);
  }
  buffers.set(context, buffer); return buffer;
}

function coastalAirBuffer(context) {
  if (airBuffers.has(context)) return airBuffers.get(context);
  const rate = context.sampleRate, buffer = context.createBuffer(2, rate * 4, rate);
  let seed = 0x53454131, slow = 0, drift = 0;
  for (let i = 0; i < buffer.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    slow += (noise - slow) * (1 - Math.exp(-650 / rate));
    drift += (noise - drift) * (1 - Math.exp(-38 / rate));
    const t = i / rate, edge = Math.sin(t / 4 * Math.PI) ** 2;
    buffer.getChannelData(0)[i] = (slow * .3 + drift * .45) * edge;
    buffer.getChannelData(1)[i] = (slow * .28 - drift * .4) * edge;
  }
  airBuffers.set(context, buffer); return buffer;
}

export function playCoastalMemoryRecording({ context, destination, when, gain = 1, loop = false, offset = 0 } = {}) {
  if (!context || !destination) return null;
  const buffer = coastalMemoryRecordingBuffer(context); if (!buffer) return null;
  const source = context.createBufferSource(), out = context.createGain();
  source.buffer = buffer; source.loop = loop; out.gain.value = clamp(gain, 0, 2);
  source.connect(out); out.connect(destination);
  source.start(Math.max(context.currentTime, when ?? context.currentTime), offsetOf(offset));
  let stopped = false;
  const stop = () => { if (stopped) return; stopped = true; try { source.stop(); } catch {} source.disconnect(); out.disconnect(); };
  source.onended = () => { if (!loop) stop(); };
  return { source, out, stop, provenance: COASTAL_MEMORY_AUDIO_PROVENANCE };
}

// All coordinates below are coastal LOCAL metres. The host owns the shared
// context/listener and passes the real body pose; this owner never resumes or
// suspends the global context. One phase-coherent source feeds both routes.
export function createCoastalMemoryAudio({ context, destination, layout } = {}) {
  if (!context || !destination || !layout?.musicBox) return null;
  const bus = context.createGain(), worldFilter = context.createBiquadFilter(), worldGain = context.createGain();
  const worldPan = context.createStereoPanner(), monitorGain = context.createGain(), airGain = context.createGain();
  worldFilter.type = 'lowpass'; worldFilter.frequency.value = 4200; worldFilter.Q.value = .45;
  worldGain.gain.value = 0; monitorGain.gain.value = 0; airGain.gain.value = 0;
  bus.connect(worldFilter); worldFilter.connect(worldGain); worldGain.connect(worldPan); worldPan.connect(destination);
  bus.connect(monitorGain); monitorGain.connect(destination); airGain.connect(destination);
  const splitter = context.createChannelSplitter(2), analysers = [context.createAnalyser(), context.createAnalyser()];
  monitorGain.connect(splitter);
  const samples = analysers.map((node, channel) => { node.fftSize = 256; splitter.connect(node, channel); return new Float32Array(node.fftSize); });
  let source = null, airSource = null, sourceAt = 0, sourceOffset = 0, last = context.currentTime;
  let pending = 0, monitor = false, monitorAt = Infinity, paused = false, disposed = false, initialized = false, current = {};
  const target = (param, value, tau = .035) => { param.setTargetAtTime(value, context.currentTime, tau); };
  function position() {
    const pose = current.pose || current.state?.localPose || current.state?.pose;
    if (!pose || ![pose.x, pose.z].every(Number.isFinite)) return { distance: Infinity, pan: 0 };
    const box = layout.musicBox, dx = box.x - pose.x, dz = box.z - pose.z;
    const feet = Number.isFinite(pose.feet) ? pose.feet : layout.spawn?.feet || 0;
    const distance = Math.hypot(dx, dz, box.y - feet - (layout.eyeHeight ?? 1.62));
    const yaw = Number.isFinite(pose.yaw) ? pose.yaw : 0;
    return { distance, pan: clamp((dx * Math.cos(yaw) + dz * Math.sin(yaw)) / Math.max(.1, Math.hypot(dx, dz)), -1, 1) };
  }
  function settle() {
    const now = context.currentTime;
    if (source && monitor && context.state === 'running') pending += Math.max(0, now - Math.max(last, monitorAt));
    last = now;
  }
  function stopSources() {
    if (source) { sourceOffset = offsetOf(sourceOffset + Math.max(0, context.currentTime - sourceAt)); source.stop(); source = null; }
    if (airSource) { try { airSource.stop(); } catch {} airSource.disconnect(); airSource = null; }
    monitor = false; monitorAt = Infinity;
  }
  function reconcile() {
    const state = current.state;
    const active = state?.active === true && state.status === 'active';
    const held = paused || current.paused || current.hidden || current.interrupted || current.renderReady === false;
    const play = active && !held && context.state === 'running';
    if (!play) { stopSources(); target(worldGain.gain, 0); target(monitorGain.gain, 0); target(airGain.gain, 0); return; }
    if (!source) {
      sourceAt = context.currentTime;
      source = playCoastalMemoryRecording({ context, destination: bus, loop: true, offset: sourceOffset });
      airSource = context.createBufferSource(); airSource.buffer = coastalAirBuffer(context); airSource.loop = true;
      airSource.connect(airGain); airSource.start(context.currentTime, sourceOffset % 4);
    }
    const p = position(), nextMonitor = !!source && current.recorderHeld === true && p.distance <= (layout.listenRadius ?? 5.4);
    if (nextMonitor && !monitor) monitorAt = context.currentTime + .04;
    if (!nextMonitor) monitorAt = Infinity;
    monitor = nextMonitor;
    // Listening folds the same source into the headphones, rather than adding
    // a second copy of the master to the nearby object.
    target(monitorGain.gain, monitor ? .8 : 0);
    target(worldGain.gain, monitor ? 0 : .48 / (1 + p.distance * p.distance * .13));
    target(worldPan.pan, p.pan, .06); target(worldFilter.frequency, 1500 + 2700 / (1 + p.distance * .18));
    target(airGain.gain, monitor ? .016 : .024, .3);
  }
  function update(input = {}) {
    if (disposed) return false;
    settle(); current = { ...input };
    if (!initialized) { sourceOffset = offsetOf(input.state?.recordingOffset); initialized = true; }
    reconcile(); return !!source;
  }
  function sample() {
    if (disposed) return { audibleSeconds: 0, recordingOffset: sourceOffset, sourceReady: false, audioRunning: false, left: 0, right: 0 };
    settle();
    const audibleSeconds = pending; pending = 0;
    const running = !!source && monitor && context.state === 'running';
    const levels = running ? analysers.map((node, i) => {
      node.getFloatTimeDomainData(samples[i]); let square = 0;
      for (const value of samples[i]) square += value * value;
      return Math.min(1, Math.sqrt(square / samples[i].length) * 9);
    }) : [0, 0];
    return { audibleSeconds, recordingOffset: source ? offsetOf(sourceOffset + Math.max(0, context.currentTime - sourceAt)) : sourceOffset,
      sourceReady: !!source, audioRunning: context.state === 'running', left: levels[0], right: levels[1] };
  }
  return { initialize: update, update, sample,
    setPaused(value) { if (disposed) return; settle(); paused = !!value; current.paused = paused; reconcile(); },
    dispose() { if (disposed) return; settle(); disposed = true; pending = 0; stopSources();
      [bus, worldFilter, worldGain, worldPan, monitorGain, airGain, splitter, ...analysers].forEach(node => node.disconnect()); },
  };
}
