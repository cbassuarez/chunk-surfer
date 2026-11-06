import { CLAIR_DE_LUNE_EVENTS, CLAIR_DE_LUNE_SCORE_SECONDS } from '../data/clair-de-lune-music-box.js';
import { COASTAL_MEMORY_CUE, COASTAL_MEMORY_TAKE, COASTAL_MEMORY_SECONDS } from '../game/coastal-memory.js';
import { COASTAL_MUSIC_BOX_CLICKS, COASTAL_MUSIC_BOX_COMB, COASTAL_MUSIC_BOX_LURCHES, COASTAL_MUSIC_BOX_PLUCKS,
  COASTAL_MUSIC_BOX_SPRING_RELEASE, COASTAL_MUSIC_BOX_STALL, COASTAL_MUSIC_BOX_WIND_SLIP, coastalMusicBoxRateAt } from '../game/coastal-memory/mechanism.js';

export { COASTAL_MEMORY_CUE, COASTAL_MEMORY_TAKE, COASTAL_MEMORY_SECONDS };
const hz = (pitch, cents = 0) => 440 * 2 ** ((pitch - 69 + cents / 100) / 12);
// What each tine actually sounds at, bends included (snapped tines sound none).
export const COASTAL_MEMORY_NOTES = Object.freeze(COASTAL_MUSIC_BOX_COMB.filter((t) => t.state !== 'snapped').map((t) => +hz(t.pitch, t.cents).toFixed(2)));
// The box's opening third (Ab over F), two octaves down: what the belfry rings back.
export const COASTAL_MEMORY_BELLS = Object.freeze([+hz(56).toFixed(2), +hz(53).toFixed(2)]);
export const COASTAL_MEMORY_AUDIO_PROVENANCE = Object.freeze({
  kind: 'authored-procedural-pcm', revision: 2, durationSeconds: COASTAL_MEMORY_SECONDS,
  material: 'Broken cylinder music box playing Clair de lune (Debussy, public domain score): comb, pins, spring, gear and governor, all synthesised.',
  ambience: 'Procedural wind and distant sea placeholder; no recorded location or performer claimed.',
});
const buffers = new WeakMap(), airBuffers = new WeakMap();
const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
const offsetOf = v => ((Number.isFinite(v) ? v : 0) % COASTAL_MEMORY_SECONDS + COASTAL_MEMORY_SECONDS) % COASTAL_MEMORY_SECONDS;
const TAU = Math.PI * 2;

// A resonator rung once: sum of damped sinusoids, rendered by recursion (no
// per-sample trig). modes: [frequency, gain, decay seconds].
function ring(out, rate, start, modes, gain, pan = 0) {
  const [left, right] = out, l = gain * (1 - pan) * .5 + gain * .5 * (1 - Math.abs(pan)), r = gain * (1 + pan) * .5 + gain * .5 * (1 - Math.abs(pan));
  const i0 = Math.max(0, Math.round(start * rate));
  for (const [f, amp, decay] of modes) {
    if (!(f > 0) || f > rate * .45 || amp <= 0) continue;
    const n = Math.min(left.length - i0, Math.ceil(decay * 7 * rate)), w = TAU * f / rate, k = Math.exp(-1 / (decay * rate));
    const c = 2 * k * Math.cos(w), kk = k * k;
    let y1 = 0, y2 = -amp * Math.sin(w) / k;
    for (let j = 0; j < n; j++) {
      const y = c * y1 - kk * y2; y2 = y1; y1 = y;
      // A pin plucks: no click-free fade in; the tine starts from a release.
      left[i0 + j] += y * l; right[i0 + j] += y * r;
    }
  }
}
function burst(out, rate, start, seconds, gain, seed, tone = .5, pan = 0) {
  const [left, right] = out, i0 = Math.max(0, Math.round(start * rate)), n = Math.min(left.length - i0, Math.ceil(seconds * rate));
  let s = seed >>> 0, lp = 0;
  for (let j = 0; j < n; j++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const noise = s / 2147483648 - 1; lp += (noise - lp) * tone;
    const v = (noise - lp) * gain * Math.exp(-j / (seconds * rate * .22));
    left[i0 + j] += v * (1 - pan * .5); right[i0 + j] += v * (1 + pan * .5);
  }
}

// Lyle's box, broken. The same deterministic mechanism the cylinder on screen
// follows: every pluck here is a pin crossing a tine there.
export function coastalMemoryRecordingBuffer(context) {
  if (!context?.createBuffer || !Number.isFinite(context.sampleRate)) return null;
  if (buffers.has(context)) return buffers.get(context);
  const rate = context.sampleRate, buffer = context.createBuffer(2, Math.ceil(rate * COASTAL_MEMORY_SECONDS), rate);
  const left = buffer.getChannelData(0), right = buffer.getChannelData(1), out = [left, right];
  const comb = COASTAL_MUSIC_BOX_COMB, last = comb.length - 1;
  for (const [n, p] of COASTAL_MUSIC_BOX_PLUCKS.entries()) {
    const tine = comb[p.tine], u = p.tine / Math.max(1, last), pan = (u - .5) * .3, back = p.direction < 0;
    const gain = (p.voice === 'tune' ? .07 : .044) * (back ? .22 : 1);
    // The pin releasing the tine ticks against it.
    burst(out, rate, p.at, .004, (back ? .02 : .05) * (p.state === 'snapped' ? 1.6 : 1), 0x7135 + n * 977, .35, pan);
    if (p.state === 'snapped') {
      // Only a stub: stiff, tiny, a dry tick with no note in it.
      ring(out, rate, p.at, [[5400 + 300 * u, 1, .006], [8100, .4, .003]], gain * .5, pan); continue;
    }
    const f = hz(tine.pitch, tine.cents), decay = (.62 - .3 * u) * (back ? .35 : 1);
    // A clamped steel cantilever: inharmonic upper modes that die quickly.
    const modes = [[f, 1, decay], [f * 6.267, .24, decay * .12], [f * 17.55, .07, decay * .035]];
    // Bent tines twist as they ring: a second, near fundamental beats against the first.
    if (tine.state === 'bent') modes.push([f * 1.0068, .55, decay * .8]);
    ring(out, rate, p.at, modes, gain, pan);
    // The case answers every note, briefly.
    ring(out, rate, p.at, [[228, .16, .05], [341, .08, .035]], gain, 0);
    if (tine.state === 'buzz') {
      // Bb5 rattles against its neighbour while it swings wide: a rasp at its
      // own frequency that stops as the note falls below the gap.
      const i0 = Math.round(p.at * rate), n2 = Math.min(left.length - i0, Math.round(decay * 1.4 * rate)), w = TAU * f / rate;
      let s = 0x5a17 + n;
      for (let j = 0; j < n2; j++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        const env = Math.exp(-j / (decay * rate)), contact = Math.sin(w * j) > .55 ? 1 : 0, over = Math.max(0, env - .3);
        const v = contact * over * (s / 2147483648 - 1) * gain * .9;
        left[i0 + j] += v; right[i0 + j] += v;
      }
    }
  }
  // Winding: the ratchet clicks, slips (three teeth back in a whirr), clicks on.
  for (const [k, at] of COASTAL_MUSIC_BOX_CLICKS.entries()) {
    burst(out, rate, at - .16, .16, .006, 0x10 + k, .08, -.4);
    burst(out, rate, at, .02, .05, 0x20 + k, .55, -.4);
    ring(out, rate, at, [[2350, 1, .012], [3900, .5, .006]], .03, -.4);
  }
  for (let k = 0; k < 3; k++) {
    const at = COASTAL_MUSIC_BOX_WIND_SLIP + k * .042;
    burst(out, rate, at, .015, .04, 0x40 + k, .6, -.4); ring(out, rate, at, [[2100 - k * 140, 1, .008]], .025, -.4);
  }
  ring(out, rate, COASTAL_MUSIC_BOX_WIND_SLIP + .14, [[96, 1, .05], [1200, .3, .01]], .05, -.4);
  // Each gear catch: it binds, groans, and the cylinder lurches on with a clunk.
  for (const [k, lurch] of COASTAL_MUSIC_BOX_LURCHES.entries()) {
    // Binding is stick-slip: a creak of tiny releases, quickening as it loads.
    for (let at = lurch.at - .4, j = 0; at < lurch.at - .01; j++) { ring(out, rate, at, [[520 + 40 * (j % 3), 1, .004]], .012 + .0006 * j, .4); at += 1 / (34 + 70 * (at - lurch.at + .4)); }
    ring(out, rate, lurch.at, [[72, 1, .07], [1650, .35, .012], [2890, .2, .006]], .07, .4);
  }
  // The run-down shudder, the spring letting go, and the stop.
  const stall = COASTAL_MUSIC_BOX_STALL, release = COASTAL_MUSIC_BOX_SPRING_RELEASE;
  ring(out, rate, stall, [[81, 1, .08], [1890, .2, .01]], .03, .4);
  burst(out, rate, release, .9, .03, 0x77, .2, 0);
  ring(out, rate, release + .95, [[88, 1, .09], [1300, .45, .015], [3400, .2, .005]], .08, 0);
  // Running: the governor fan whirrs with speed, one bent blade scrapes once a
  // turn, and sand in the train crackles. Then the air of the place.
  let seed = 0x434f4153, low = 0, metal = 0, band = 0, fan = 0, scrape = 0;
  for (let i = 0; i < left.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1, t = i / rate;
    low += (noise - low) * (1 - Math.exp(-35 / rate));
    metal += (noise - metal) * (1 - Math.exp(-3100 / rate));
    band += ((noise - metal) - band) * .18;
    const speed = Math.abs(coastalMusicBoxRateAt(t)), run = Math.min(1, speed);
    fan += TAU * 2.6 * speed / rate * 2;
    const blade = .5 + .5 * Math.cos(fan), turn = Math.cos(fan * .5);
    if (turn > .995 && run > .05) scrape = 1; scrape *= Math.exp(-260 / rate);
    let sound = low * .008 + (noise - metal) * .0009;
    sound += band * run * (.004 + .005 * blade) + (noise - metal) * scrape * .012 * run;
    if (run > .02 && (seed & 0x3fff) < 4 * run) sound += (noise - metal) * .05;
    const fade = Math.min(1, t / .04, (COASTAL_MEMORY_SECONDS - t) / .2);
    left[i] = clamp((left[i] + sound) * fade, -.7, .7);
    right[i] = clamp((right[i] + sound * .965 + low * .003) * fade, -.7, .7);
  }
  buffers.set(context, buffer); return buffer;
}

// The same box before the crash: wound properly, every tine whole, every pin
// there. It plays the eight bars once at tempo and runs down on the last chord.
const intactBuffers = new WeakMap();
export const COASTAL_MUSIC_BOX_INTACT_LEAD = 1.3;
export const COASTAL_MUSIC_BOX_INTACT_SECONDS = COASTAL_MUSIC_BOX_INTACT_LEAD + CLAIR_DE_LUNE_SCORE_SECONDS + 3;
export function coastalMusicBoxIntactBuffer(context) {
  if (!context?.createBuffer || !Number.isFinite(context.sampleRate)) return null;
  if (intactBuffers.has(context)) return intactBuffers.get(context);
  const rate = context.sampleRate, buffer = context.createBuffer(2, Math.ceil(rate * COASTAL_MUSIC_BOX_INTACT_SECONDS), rate);
  const left = buffer.getChannelData(0), right = buffer.getChannelData(1), out = [left, right], lead = COASTAL_MUSIC_BOX_INTACT_LEAD;
  const pitches = [...new Set(CLAIR_DE_LUNE_EVENTS.map((e) => e.pitch))].sort((a, b) => a - b), last = pitches.length - 1;
  for (const [k, at] of [.12, .38, .62, .86].entries()) {
    burst(out, rate, at, .02, .045, 0x90 + k, .55, -.4); ring(out, rate, at, [[2350, 1, .012], [3900, .5, .006]], .028, -.4);
  }
  for (const [n, e] of CLAIR_DE_LUNE_EVENTS.entries()) {
    const u = pitches.indexOf(e.pitch) / Math.max(1, last), pan = (u - .5) * .3, at = lead + e.at, gain = e.voice === 'tune' ? .07 : .044, f = hz(e.pitch), decay = .62 - .3 * u;
    burst(out, rate, at, .004, .045, 0x3000 + n * 131, .35, pan);
    ring(out, rate, at, [[f, 1, decay], [f * 6.267, .24, decay * .12], [f * 17.55, .07, decay * .035]], gain, pan);
    ring(out, rate, at, [[228, .16, .05], [341, .08, .035]], gain, 0);
  }
  let seed = 0x1a7e, metal = 0, band = 0, fan = 0;
  const end = lead + CLAIR_DE_LUNE_SCORE_SECONDS;
  for (let i = 0; i < left.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1, t = i / rate;
    metal += (noise - metal) * (1 - Math.exp(-3100 / rate)); band += ((noise - metal) - band) * .18;
    const run = t < lead - .2 ? 0 : t < lead ? (t - lead + .2) / .2 : t < end ? 1 : Math.max(0, 1 - (t - end) / .6);
    fan += TAU * 2.6 * run / rate * 2;
    const sound = band * run * (.0035 + .003 * (.5 + .5 * Math.cos(fan)));
    const fade = Math.min(1, t / .04, (COASTAL_MUSIC_BOX_INTACT_SECONDS - t) / .3);
    left[i] = clamp((left[i] + sound) * fade, -.7, .7); right[i] = clamp((right[i] + sound * .97) * fade, -.7, .7);
  }
  intactBuffers.set(context, buffer); return buffer;
}
export function playCoastalMusicBoxIntact({ context, destination, gain = 1 } = {}) {
  if (!context || !destination) return null;
  const buffer = coastalMusicBoxIntactBuffer(context); if (!buffer) return null;
  const source = context.createBufferSource(), out = context.createGain();
  source.buffer = buffer; out.gain.value = clamp(gain, 0, 2); source.connect(out); out.connect(destination);
  source.start(context.currentTime);
  let stopped = false;
  const stop = () => { if (stopped) return; stopped = true; try { source.stop(); } catch {} source.disconnect(); out.disconnect(); };
  source.onended = stop;
  return { source, out, stop, get done() { return stopped; } };
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
