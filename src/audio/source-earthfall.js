import { assetUrl } from '../platform/paths.js';
import { SOURCE_DEMOLITION_AUDIO_DIR, SOURCE_DEMOLITION_AUDIO_CLIPS } from '../data/source-demolition-audio.js';

// Reuses the accepted CC0 material bank. There is no new recording, loop,
// score, synthetic fall wind or impact punishment. Each context can share this
// small subset between earthfall instances; the first omen keeps its own bank.
export const SOURCE_EARTHFALL_AUDIO = Object.freeze({
  maxVoices: 4, maxEncodedBytes: 1000000, maxDecodedBytes: 8000000,
  maxEventAge: .16, arrivalSpeed: 343, maxArrivalDelay: .45,
  masterGain: .62, residualGain: .13, reducedResidualGain: .42,
  initiationSeconds: 1.1,
  initiationSplit: .55,
});
const CONFIG = SOURCE_EARTHFALL_AUDIO;
const MATERIALS = new Set(['restraint', 'failure-body', 'stone-spall']);
const TYPES = new Set(['strain', 'fracture', 'footing-loss', 'catch', 'land']);
const cache = new WeakMap();
const valid = value => value !== null && value !== undefined && Number.isFinite(Number(value));
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || 0));
const point = value => value && ['x', 'y', 'z'].every(key => valid(value[key]))
  ? { x: Number(value.x), y: Number(value.y), z: Number(value.z) } : null;

export function sourceEarthfallVoiceMix(source, listener = {}) {
  const dx = source.x - (Number(listener.x) || 0), dy = source.y - (Number(listener.y) || 0), dz = source.z - (Number(listener.z) || 0);
  const yaw = Number(listener.yaw) || 0, distance = Math.hypot(dx, dy, dz), bearing = Math.atan2(dx, -dz) - yaw;
  return { distance, localX: dx * Math.cos(yaw) + dz * Math.sin(yaw), localY: dy,
    localZ: -dx * Math.sin(yaw) + dz * Math.cos(yaw),
    pan: clamp(Math.sin(bearing) * Math.min(1, Math.hypot(dx, dz) / 2) * .9, -.9, .9),
    gain: (1 + distance / 22) ** -.88,
    cutoff: clamp(9200 / (1 + distance / 55) - Math.max(0, -Math.cos(bearing)) * 1300, 600, 9200),
    arrivalDelay: Math.min(CONFIG.maxArrivalDelay, distance / CONFIG.arrivalSpeed) };
}

function eventInfo(event, frame) {
  if (!event || !TYPES.has(event.type)) return null;
  const age = valid(event.age) ? Math.max(0, Number(event.age))
    : valid(event.at) && valid(frame.clock ?? frame.elapsed)
      ? Math.max(0, Number(frame.clock ?? frame.elapsed) - Number(event.at)) : Infinity;
  return { ...event, id: String(event.id || `${frame.sequenceId || 'earthfall'}:${event.type}`), age,
    position: point(event.position || frame.anchors?.[event.type] || frame.anchors?.earth),
    gain: clamp(event.gain ?? 1, 0, 1) };
}

export function createSourceEarthfallAudio({ getAudio = () => null,
  urlFor = file => assetUrl(`${SOURCE_DEMOLITION_AUDIO_DIR}/${file}`), fetcher = globalThis.fetch,
} = {}) {
  let graph = null, sequenceId = null, runId = null, disposed = false, enabled = false, effects = true, reduced = false;
  let observedActive = false;
  let seen = new Set(), seenTypes = new Set(), receipts = [], played = 0, skipped = 0;
  let last = { active: false, muted: true, reason: 'outside-earthfall' };
  const history = [];
  const target = (param, value, ctx, seconds = .04) => {
    if (param?.setTargetAtTime) param.setTargetAtTime(value, ctx.currentTime, seconds);
    else if (param) param.value = value;
  };
  function zero(param, ctx) {
    param.cancelScheduledValues?.(ctx.currentTime);
    if (param.setValueAtTime) param.setValueAtTime(0, ctx.currentTime);
    else param.value = 0;
  }
  function detach(voice) {
    if (!graph) return;
    voice.source.onended = null;
    try { voice.source.stop(graph.ctx.currentTime); } catch {}
    for (const node of voice.nodes) { try { node.disconnect?.(); } catch {} }
    graph.voices.delete(voice);
  }
  function cut() {
    if (!graph) return;
    zero(graph.master.gain, graph.ctx);
    for (const voice of [...graph.voices]) detach(voice);
    // Delay buffers belong to the detached voices. None can survive a hard
    // recording/focus/pause/scene boundary and return when the gate reopens.
  }
  function ensureGraph() {
    if (disposed) return null;
    let pair; try { pair = getAudio(); } catch { return null; }
    const ctx = pair?.ctx || pair?.context, destination = pair?.destination;
    if (!ctx || !destination || ctx.state === 'closed') return null;
    if (graph?.ctx === ctx && graph.destination === destination) return graph;
    if (graph) { cut(); graph.master.disconnect?.(); graph.residualBus.disconnect?.(); }
    const master = ctx.createGain(), residualBus = ctx.createGain();
    master.gain.value = 0; residualBus.gain.value = 0;
    master.connect(destination); residualBus.connect(master);
    graph = { ctx, destination, master, residualBus, voices: new Set(), bank: null, failed: null };
    return graph;
  }
  async function load(g = ensureGraph()) {
    if (!g) return false;
    let contexts = cache.get(g.ctx);
    if (!contexts) { contexts = new Map(); cache.set(g.ctx, contexts); }
    const key = urlFor('manifest.json');
    if (!contexts.has(key)) {
      const entry = { loaded: false, failed: null, buffers: new Map(), clips: new Map() };
      entry.promise = (async () => {
        const response = await fetcher(key);
        if (!response.ok) throw new Error(`Earthfall material manifest ${response.status}`);
        const manifest = await response.json();
        if (manifest.version !== 1 || !Array.isArray(manifest.clips) || manifest.clips.length > 6)
          throw new Error('Invalid earthfall material bank');
        const clips = manifest.clips.filter(clip => MATERIALS.has(clip.id));
        if (clips.length !== MATERIALS.size || new Set(clips.map(clip => clip.id)).size !== MATERIALS.size)
          throw new Error('Missing earthfall physical material');
        let bytes = 0, decoded = 0;
        for (const clip of clips) {
          const authored = SOURCE_DEMOLITION_AUDIO_CLIPS.find(item => item.id === clip.id);
          if (!authored || clip.file !== authored.file || !Number.isInteger(clip.bytes) || clip.bytes <= 0
            || !valid(clip.gain) || clip.gain < 0 || clip.gain > 1 || !(clip.duration > 0)
            || Math.abs(clip.duration - (authored.to - authored.from)) > .08)
            throw new Error('Invalid earthfall material identity');
          bytes += clip.bytes; decoded += clip.duration * g.ctx.sampleRate * 4;
        }
        if (bytes > CONFIG.maxEncodedBytes || decoded > CONFIG.maxDecodedBytes)
          throw new Error('Earthfall decode budget exceeded');
        const values = await Promise.all(clips.map(async clip => {
          const response = await fetcher(urlFor(clip.file));
          if (!response.ok) throw new Error(`Earthfall ${clip.file} ${response.status}`);
          const bytes = await response.arrayBuffer();
          if (bytes.byteLength !== clip.bytes) throw new Error('Earthfall encoded-byte identity mismatch');
          const buffer = await g.ctx.decodeAudioData(bytes);
          if (buffer.numberOfChannels !== 1 || Math.abs(buffer.duration - clip.duration) > .08)
            throw new Error('Invalid decoded earthfall material');
          return { clip, buffer };
        }));
        for (const { clip, buffer } of values) { entry.clips.set(clip.id, clip); entry.buffers.set(clip.id, buffer); }
        entry.loaded = true; return true;
      })().catch(error => { entry.failed = String(error?.message || error); entry.buffers.clear(); entry.clips.clear(); return false; });
      contexts.set(key, entry);
    }
    g.bank = contexts.get(key);
    return g.bank.promise;
  }
  function spatialNodes(ctx) {
    const distance = ctx.createGain(), lowpass = ctx.createBiquadFilter(), delay = ctx.createDelay?.(CONFIG.maxArrivalDelay);
    const panner = ctx.createPanner?.(), pan = !panner ? ctx.createStereoPanner?.() : null;
    lowpass.type = 'lowpass'; lowpass.Q.value = .35;
    if (panner) { panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse'; panner.refDistance = 1; panner.rolloffFactor = 0; panner.maxDistance = 1000; }
    lowpass.connect(distance);
    let output = distance;
    if (delay) { output.connect(delay); output = delay; }
    if (panner || pan) { output.connect(panner || pan); output = panner || pan; }
    return { lowpass, distance, delay, panner, pan, input: lowpass, output,
      nodes: [lowpass, distance, delay, panner, pan].filter(Boolean) };
  }
  function positionSpatial(path, position, listener, { residual = false, initial = false } = {}) {
    const ctx = graph.ctx, mix = sourceEarthfallVoiceMix(position, listener);
    target(path.distance.gain, mix.gain, ctx);
    target(path.lowpass.frequency, residual ? Math.min(3900, mix.cutoff) : mix.cutoff, ctx);
    if (path.delay) {
      if (initial) path.delay.delayTime.value = mix.arrivalDelay;
      else target(path.delay.delayTime, mix.arrivalDelay, ctx, .035);
    }
    if (path.pan) target(path.pan.pan, mix.pan, ctx);
    if (path.panner?.positionX) {
      target(path.panner.positionX, mix.localX, ctx); target(path.panner.positionY, mix.localY, ctx); target(path.panner.positionZ, mix.localZ, ctx);
    } else path.panner?.setPosition?.(mix.localX, mix.localY, mix.localZ);
    path.mix = mix; path.position = { ...position };
  }
  function place(voice, frame, options, initial = false) {
    const position = voice.followAnchor ? point(frame.anchors?.[voice.followAnchor]) || voice.origin : voice.origin;
    positionSpatial(voice.path, position, options.listener, { initial });
    if (voice.residual) {
      const front = point(frame.anchors?.presence || frame.anchors?.front) || voice.residual.origin;
      positionSpatial(voice.residual.path, front, options.listener, { residual: true, initial });
    }
  }
  function material(id, event, frame, options, amplitude, duration = Infinity, offset = 0) {
    const g = graph, clip = g.bank?.clips.get(id), buffer = g.bank?.buffers.get(id);
    if (!buffer || !event.position || g.voices.size >= CONFIG.maxVoices) return false;
    const source = g.ctx.createBufferSource(), level = g.ctx.createGain(), path = spatialNodes(g.ctx);
    source.buffer = buffer; source.playbackRate.value = 1;
    const origin = id === 'failure-body' ? point(frame.anchors?.fallingMaterial) || event.position : event.position;
    const firstMix = sourceEarthfallVoiceMix(origin, options.listener);
    const at = g.ctx.currentTime + .005 + (path.delay ? 0 : firstMix.arrivalDelay);
    const seconds = Math.min(buffer.duration - offset, duration);
    if (seconds <= .025) return false;
    const volume = clip.gain * event.gain * amplitude, release = Math.min(.22, seconds * .25);
    level.gain.setValueAtTime(0, at); level.gain.linearRampToValueAtTime(volume, at + .008);
    level.gain.setValueAtTime(volume, at + seconds - release); level.gain.linearRampToValueAtTime(0, at + seconds);
    source.connect(level).connect(path.input); path.output.connect(g.master);
    const voice = { id, type: event.type, eventId: event.id, source, level, path,
      origin: { ...origin }, followMaterial: id === 'failure-body',
      followAnchor: id === 'failure-body' ? 'fallingMaterial' : event.type === 'catch' ? 'catch' : null,
      amplitude: volume, at, sourceEnd: at + seconds, until: at + seconds + CONFIG.maxArrivalDelay,
      sourceOffset: offset, sourceDuration: seconds,
      sourceEnded: false, residual: null, nodes: [source, level, ...path.nodes] };
    source.onended = () => { voice.sourceEnded = true; };
    place(voice, frame, options, true); g.voices.add(voice); source.start(at, offset, seconds);
    return true;
  }
  function addResidual(event, frame, options) {
    const g = graph, voice = [...g.voices].find(item => item.id === 'failure-body'
      && !item.sourceEnded && item.sourceEnd > g.ctx.currentTime);
    if (!voice || voice.residual || !event.position) return false;
    const highpass = g.ctx.createBiquadFilter(), level = g.ctx.createGain(), path = spatialNodes(g.ctx);
    highpass.type = 'highpass'; highpass.frequency.value = 850; highpass.Q.value = .32;
    level.gain.value = 0;
    voice.level.connect(highpass).connect(level).connect(path.input); path.output.connect(g.residualBus);
    const nodes = [highpass, level, ...path.nodes]; voice.nodes.push(...nodes);
    voice.residual = { origin: { ...event.position }, eventId: event.id, highpass, level, path, nodes,
      at: g.ctx.currentTime };
    target(level.gain, CONFIG.residualGain * event.gain, g.ctx, .18);
    place(voice, frame, options, true); return true;
  }
  function removeResiduals() {
    if (!graph) return;
    for (const voice of graph.voices) if (voice.residual) {
      zero(voice.residual.level.gain, graph.ctx);
      try { voice.level.disconnect(voice.residual.highpass); } catch {}
      for (const node of voice.residual.nodes) { try { node.disconnect?.(); } catch {} }
      voice.residual = null;
    }
  }
  function snapshot() {
    const g = graph, voices = g ? [...g.voices] : [];
    return { ...last, sequenceId, runId, loaded: !!g?.bank?.loaded, failed: g?.bank?.failed || null,
      sourceCount: voices.filter(voice => !voice.sourceEnded && voice.sourceEnd > g.ctx.currentTime).length,
      propagationTails: voices.filter(voice => voice.sourceEnded || voice.sourceEnd <= g.ctx.currentTime).length,
      graphVoices: voices.length, residualCount: voices.filter(voice => voice.residual).length,
      played, skipped, receipts: [...receipts], history: [...history], reducedDread: reduced,
      positionMethod: g?.ctx.createPanner ? 'world HRTF' : 'world stereo fallback; elevation changes distance/filter',
      propagationMethod: g?.ctx.createDelay ? 'bounded physical travel DelayNode; continuous distance update' : 'onset travel delay only; DelayNode unavailable',
      sourceBank: `${SOURCE_DEMOLITION_AUDIO_DIR}/manifest.json`,
      bankSubset: [...MATERIALS],
      residualMethod: 'filtered send from the one playing failure source; no replay, synthetic wind or new performance',
      order: 'disjoint chronological support segments; held interval; main body only at footing-loss',
      voices: voices.flatMap(voice => [{ id: voice.id, eventId: voice.eventId, kind: 'material',
        position: voice.path.position, mix: voice.path.mix, startedAt: voice.at, sourceEnd: voice.sourceEnd,
        sourceOffset: voice.sourceOffset, sourceDuration: voice.sourceDuration,
        until: voice.until, followsMaterial: voice.followMaterial, followsAnchor: voice.followAnchor }, ...(voice.residual ? [{
        id: `${voice.id}:residual`, eventId: voice.residual.eventId, kind: 'residual', derivedSend: true,
        position: voice.residual.path.position, mix: voice.residual.path.mix, startedAt: voice.residual.at,
        sourceEnd: voice.sourceEnd, until: voice.until }] : [])]) };
  }
  function update(frame = {}, options = {}) {
    if (disposed) return { ...snapshot(), active: false, muted: true };
    const nextId = String(frame.sequenceId || sequenceId || 'source-earthfall');
    const nextRun = String(frame.runId ?? runId ?? '');
    if (nextId !== sequenceId || nextRun !== runId) {
      cut(); sequenceId = nextId; runId = nextRun;
      seen = new Set(); seenTypes = new Set(); receipts = []; observedActive = false;
    }
    const active = !!frame.active, g = active || frame.preload ? ensureGraph() : graph;
    // The real scene exposes intact, active frames before arming. A controller
    // first observed already committed is a restored baseline, even when a
    // frozen save contains a receipt with age zero. No fresh attack is earned.
    const initialCommitted = active && !observedActive && !!frame.committed;
    if (active) observedActive = true;
    const contextReady = g && !['suspended', 'interrupted', 'closed'].includes(g.ctx.state);
    enabled = active && !!contextReady && !options.protected && !options.suspended && !options.hidden
      && options.focused !== false && !frame.protected;
    effects = options.effectsMode !== 'off'; reduced = !!options.reducedDread || options.effectsMode === 'reduced';
    if ((active || frame.preload) && g) void load(g);
    if (!enabled) cut();
    else {
      target(g.master.gain, CONFIG.masterGain, g.ctx, .025);
      target(g.residualBus.gain, effects ? reduced ? CONFIG.reducedResidualGain : 1 : 0, g.ctx, effects ? .10 : .006);
      if (!effects) removeResiduals();
      for (const voice of [...g.voices]) {
        if (voice.until <= g.ctx.currentTime) detach(voice);
        else place(voice, frame, options);
      }
    }
    for (const event of (Array.isArray(frame.events) ? frame.events : []).map(item => eventInfo(item, frame)).filter(Boolean)) {
      if (seen.has(event.id) || seenTypes.has(event.type)) continue;
      seen.add(event.id); seenTypes.add(event.type); receipts.push(event.id);
      let reason = !enabled ? 'protected-or-outside' : initialCommitted || frame.restored || frame.replayed || event.suppressed ? 'restored-baseline'
        : event.age > CONFIG.maxEventAge ? 'stale-no-backlog' : !g?.bank?.loaded ? 'bank-not-ready-no-backlog'
          : !event.position ? 'missing-world-anchor' : event.type === 'footing-loss' && !effects ? 'residual-effects-off' : null;
      let didPlay = false;
      if (!reason) {
        // Non-overlapping intervals of the same recording remain earned by
        // their actual event even when render and audio clocks diverge. No raw
        // interval or tail is replayed, and no explosive pulse is manufactured.
        if (event.type === 'strain') didPlay = material('restraint', event, frame, options, .45, CONFIG.initiationSplit);
        if (event.type === 'fracture') didPlay = material('restraint', event, frame, options, .495,
          CONFIG.initiationSeconds - CONFIG.initiationSplit, CONFIG.initiationSplit);
        if (event.type === 'footing-loss') {
          didPlay = material('failure-body', event, frame, options, .76);
          if (didPlay && effects) addResidual(event, frame, options);
        }
        if (event.type === 'catch') didPlay = material('stone-spall', event, frame, options, .30);
        if (event.type === 'land') didPlay = material('stone-spall', event, frame, options, .42);
      }
      if (didPlay) played++; else skipped++;
      history.push({ id: event.id, type: event.type, age: event.age, reason: didPlay ? 'played' : reason || 'voice-budget' });
      if (history.length > 32) history.shift();
    }
    last = { active, muted: !enabled, audible: enabled && !!g?.bank?.loaded,
      reason: !active ? 'outside-earthfall' : !enabled ? 'recording-playback-or-suspended' : 'earthfall' };
    return snapshot();
  }
  function stop() { cut(); enabled = false; last = { ...last, active: false, muted: true, audible: false, reason: 'stopped' }; }
  function reset() { stop(); sequenceId = null; runId = null; observedActive = false; seen.clear(); seenTypes.clear(); receipts = []; history.length = 0; played = 0; skipped = 0; }
  function destroy() { stop(); disposed = true; graph?.master.disconnect?.(); graph?.residualBus.disconnect?.(); graph = null; }
  return { update, ready: () => load(), stop, reset, snapshot, destroy };
}
