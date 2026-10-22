import { assetUrl } from '../platform/paths.js';
import { SOURCE_DEMOLITION_AUDIO as CONFIG, SOURCE_DEMOLITION_AUDIO_DIR } from '../data/source-demolition-audio.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));
const validNumber = n => n !== null && n !== undefined && Number.isFinite(Number(n));
const point = p => Array.isArray(p) ? point({ x: p[0], y: p[1], z: p[2] })
  : p && [p.x, p.y, p.z].every(validNumber) ? { x: Number(p.x), y: Number(p.y), z: Number(p.z) } : null;
const TYPES = new Set(['strain', 'infill', 'course', 'roof', 'release', 'consumed']);

export function sourceDemolitionVoiceMix(source, listener = {}) {
  const dx = source.x - (Number(listener.x) || 0), dy = source.y - (Number(listener.y) || 0), dz = source.z - (Number(listener.z) || 0);
  const yaw = Number(listener.yaw) || 0, distance = Math.hypot(dx, dy, dz), bearing = Math.atan2(dx, -dz) - yaw;
  return { distance, localX: dx * Math.cos(yaw) + dz * Math.sin(yaw), localY: dy,
    localZ: -dx * Math.sin(yaw) + dz * Math.cos(yaw),
    pan: clamp(Math.sin(bearing) * Math.min(1, Math.hypot(dx, dz) / 2) * .9, -.9, .9),
    gain: (1 + distance / 24) ** -.82,
    cutoff: clamp(9800 / (1 + distance / 65) - Math.max(0, -Math.cos(bearing)) * 1800, 700, 9800),
    arrivalDelay: Math.min(CONFIG.maxArrivalDelay, distance / CONFIG.arrivalSpeed) };
}

// Three short facade returns, explicitly synthetic/unmeasured. There is no
// cathedral-sized convolution tail or manufactured collapse rumble here.
export function sourceDemolitionReflections(context) {
  const buffer = context.createBuffer(2, Math.ceil(CONFIG.reflectionSeconds * context.sampleRate), context.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (const [at, gain] of [[.027, .60], [.063, .28], [.118, .11]])
      data[Math.min(data.length - 1, Math.round((at + ch * .0023) * context.sampleRate))] = gain;
  }
  return buffer;
}

function eventInfo(event, frame) {
  if (typeof event === 'string') event = { type: event };
  const type = String(event?.type || event?.kind || '');
  if (!TYPES.has(type)) return null;
  const age = validNumber(event.age) ? Math.max(0, Number(event.age))
    : validNumber(event.at) ? Math.max(0, (Number(frame.clock ?? frame.elapsed) || 0) - Number(event.at)) : 0;
  const anchor = event.position || event.anchor || frame.anchors?.[type];
  return { ...event, id: String(event.id || `${type}:${event.at ?? event.elapsed ?? 0}`), type, age,
    position: point(typeof anchor === 'string' ? frame.anchors?.[anchor] : anchor), gain: clamp(event.gain ?? 1, 0, 1) };
}

export function createSourceDemolitionAudio({ getAudio = () => null,
  urlFor = file => assetUrl(`${SOURCE_DEMOLITION_AUDIO_DIR}/${file}`), fetcher = globalThis.fetch,
} = {}) {
  let graph = null, generation = 0, sequenceId = null, consumedAt = null, disposed = false;
  let seen = new Set(), receiptOrder = [], played = 0, skipped = 0, lastEnabled = false, lastResidualEnabled = false;
  let last = { active: false, audible: false, muted: true, loaded: false, sourceCount: 0, receipts: [] };
  const history = [];
  const ramp = (param, value, ctx, seconds = .055) => {
    if (param?.setTargetAtTime) param.setTargetAtTime(value, ctx.currentTime, Math.max(.006, seconds));
    else if (param) param.value = value;
  };
  const zero = (param, ctx) => {
    param.cancelScheduledValues?.(ctx.currentTime);
    if (param.setValueAtTime) param.setValueAtTime(0, ctx.currentTime);
    else param.value = 0;
  };
  function note(event, reason) {
    history.push({ id: event.id, type: event.type, age: event.age, reason });
    if (history.length > 48) history.shift();
  }
  function receipt(event) {
    if (seen.has(event.id)) return false;
    seen.add(event.id); receiptOrder.push(event.id);
    // The authored encounter has six semantic cues. This guard bounds an
    // invalid streaming caller without growing memory across an entire run.
    if (receiptOrder.length > 128) { const old = receiptOrder.shift(); seen.delete(old); }
    return true;
  }
  function stopVoices({ residualOnly = false } = {}) {
    if (!graph) return;
    for (const voice of [...graph.voices]) {
      if (residualOnly) {
        if (voice.residual) {
          zero(voice.residual.level.gain, graph.ctx);
          try { voice.level.disconnect(voice.residual.highpass); } catch {}
          for (const node of voice.residual.nodes) { try { node.disconnect?.(); } catch {} }
          voice.residual = null;
        }
        continue;
      }
      try { voice.level.gain.cancelScheduledValues?.(graph.ctx.currentTime); ramp(voice.level.gain, 0, graph.ctx, .006); voice.source.stop(graph.ctx.currentTime + .025); } catch {}
      graph.voices.delete(voice);
    }
  }
  function clearTail() {
    if (!graph) return;
    graph.convolver.buffer = null; graph.convolver.buffer = graph.impulse;
  }
  function disconnectGraph() {
    if (!graph) return;
    stopVoices(); clearTail();
    for (const n of [graph.master, graph.residualBus, graph.wet, graph.convolver]) n.disconnect?.();
    graph.buffers.clear(); graph = null; generation++;
  }
  function ensureGraph() {
    if (disposed) return null;
    let pair; try { pair = getAudio(); } catch { return null; }
    const ctx = pair?.ctx || pair?.context, destination = pair?.destination;
    // Never silently bypass the normal SFX bus to context.destination.
    if (!ctx || !destination) return null;
    if (graph && graph.ctx === ctx && graph.destination === destination) return graph;
    disconnectGraph(); const current = ++generation;
    const master = ctx.createGain(), residualBus = ctx.createGain(), wet = ctx.createGain(), convolver = ctx.createConvolver();
    master.gain.value = 0; residualBus.gain.value = 0; wet.gain.value = .6;
    const impulse = sourceDemolitionReflections(ctx); convolver.normalize = false; convolver.buffer = impulse;
    master.connect(destination); residualBus.connect(master); convolver.connect(wet).connect(master);
    graph = { ctx, destination, master, residualBus, wet, convolver, impulse, voices: new Set(), buffers: new Map(), clips: new Map(), loading: null, loaded: false, failed: null, generation: current };
    return graph;
  }
  async function load(g = ensureGraph()) {
    if (!g) return false;
    if (g.loading) return g.loading;
    g.loading = (async () => {
      const response = await fetcher(urlFor('manifest.json')); if (!response.ok) throw new Error(`Source demolition manifest ${response.status}`);
      const m = await response.json();
      if (m.version !== 1 || !Array.isArray(m.clips) || !m.clips.length || m.clips.length > 6) throw new Error('Invalid demolition material bank');
      const ids = new Set(); let bytes = 0, seconds = 0;
      for (const c of m.clips) {
        if (!/^[a-z0-9-]+\.mp3$/.test(c.file) || !c.id || ids.has(c.id)
          || !(c.duration > 0) || c.duration > 12 || !Number.isInteger(c.bytes) || c.bytes <= 0
          || !validNumber(c.gain) || c.gain < 0 || c.gain > 1) throw new Error('Invalid demolition clip');
        ids.add(c.id); seconds += c.duration; bytes += Number(c.bytes) || 0;
      }
      if (bytes > CONFIG.maxEncodedBytes || seconds * g.ctx.sampleRate * 4 > CONFIG.maxDecodedBytes) throw new Error('Demolition decode budget exceeded');
      const decoded = await Promise.all(m.clips.map(async c => {
        const response = await fetcher(urlFor(c.file)); if (!response.ok) throw new Error(`Demolition ${c.file} ${response.status}`);
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength !== c.bytes) throw new Error('Demolition encoded-byte identity mismatch');
        const buffer = await g.ctx.decodeAudioData(bytes);
        if (buffer.numberOfChannels !== 1 || Math.abs(buffer.duration - c.duration) > .08) throw new Error('Invalid decoded demolition clip');
        return { clip: c, buffer };
      }));
      if (disposed || !graph || graph.generation !== g.generation) return false;
      for (const { clip, buffer } of decoded) { g.clips.set(clip.id, clip); g.buffers.set(clip.id, buffer); }
      g.loaded = true; return true;
    })().catch(error => { g.failed = String(error?.message || error); g.loaded = false; g.buffers.clear(); g.clips.clear(); return false; });
    return g.loading;
  }
  function positionPanner(panner, pan, mix) {
    if (pan) ramp(pan.pan, mix.pan, graph.ctx);
    if (panner) {
      if (panner.positionX) { ramp(panner.positionX, mix.localX, graph.ctx); ramp(panner.positionY, mix.localY, graph.ctx); ramp(panner.positionZ, mix.localZ, graph.ctx); }
      else panner.setPosition?.(mix.localX, mix.localY, mix.localZ);
    }
  }
  function place(voice, options, frame) {
    const g = graph, position = voice.position, mix = sourceDemolitionVoiceMix(position, options.listener);
    const black = clamp(frame.blackness ?? frame.black ?? frame.consumption ?? 0, 0, 1), off = options.effectsMode === 'off';
    const bodyLoss = 1 - black * .78;
    ramp(voice.distance.gain, mix.gain * bodyLoss, g.ctx);
    ramp(voice.lowpass.frequency, mix.cutoff * (1 - black * .83), g.ctx);
    ramp(voice.send.gain, off ? 0 : .17 * (1 - black), g.ctx);
    positionPanner(voice.panner, voice.pan, mix);
    voice.mix = mix; voice.currentPosition = position;
    if (voice.residual) {
      const branch = voice.residual, follow = point(frame.flowPosition || frame.anchors?.front) || branch.origin;
      branch.mix = sourceDemolitionVoiceMix(follow, options.listener); branch.currentPosition = follow;
      ramp(branch.distance.gain, branch.mix.gain, g.ctx);
      ramp(branch.lowpass.frequency, 5400 - black * 2400, g.ctx);
      positionPanner(branch.panner, branch.pan, branch.mix);
    }
  }
  function residualBranch(event, options, frame) {
    const g = graph, voice = g && [...g.voices].find(v => v.id === 'failure-body' && v.until > g.ctx.currentTime);
    if (!voice || voice.residual || !event.position) return false;
    const highpass = g.ctx.createBiquadFilter(), lowpass = g.ctx.createBiquadFilter(), level = g.ctx.createGain(), distance = g.ctx.createGain();
    const panner = g.ctx.createPanner?.(), pan = !panner ? g.ctx.createStereoPanner?.() : null;
    highpass.type = 'highpass'; highpass.frequency.value = 1050; highpass.Q.value = .32;
    lowpass.type = 'lowpass'; lowpass.frequency.value = 5400; lowpass.Q.value = .35;
    if (panner) { panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse'; panner.refDistance = 1; panner.rolloffFactor = 0; panner.maxDistance = 1000; }
    level.gain.value = 0;
    // A send of the already-running source preserves chronology and microtiming.
    // No second BufferSource, shifted tail, extra performance or invented air.
    voice.level.connect(highpass).connect(lowpass).connect(level).connect(distance);
    if (panner) distance.connect(panner).connect(g.residualBus);
    else if (pan) distance.connect(pan).connect(g.residualBus); else distance.connect(g.residualBus);
    const nodes = [highpass, lowpass, level, distance, panner, pan].filter(Boolean);
    voice.nodes.push(...nodes);
    voice.residual = { eventId: event.id, origin: { ...event.position }, highpass, lowpass, level, distance, panner, pan, nodes, startedAt: g.ctx.currentTime };
    ramp(level.gain, CONFIG.residualSendGain * event.gain, g.ctx, CONFIG.residualAttackSeconds);
    place(voice, options, frame); return true;
  }
  function material(id, event, options, frame, { gain = 1, offset = 0, duration = Infinity } = {}) {
    const g = graph, buffer = g?.buffers.get(id), clip = g?.clips.get(id);
    if (!g?.loaded || !buffer || !event.position || !(gain > 0)) return false;
    const remain = Math.min(duration, buffer.duration - offset); if (remain <= .025) return false;
    if (g.voices.size >= CONFIG.maxVoices) {
      const old = [...g.voices].sort((a, b) => a.startedAt - b.startedAt)[0];
      try { ramp(old.level.gain, 0, g.ctx, .006); old.source.stop(g.ctx.currentTime + .025); } catch {}
      g.voices.delete(old);
    }
    const source = g.ctx.createBufferSource(), level = g.ctx.createGain(), distance = g.ctx.createGain(), lowpass = g.ctx.createBiquadFilter(), send = g.ctx.createGain();
    const panner = g.ctx.createPanner?.(), pan = !panner ? g.ctx.createStereoPanner?.() : null;
    source.buffer = buffer; source.playbackRate.value = 1; lowpass.type = 'lowpass'; lowpass.Q.value = .35;
    if (panner) { panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse'; panner.refDistance = 1; panner.rolloffFactor = 0; panner.maxDistance = 1000; }
    const mix = sourceDemolitionVoiceMix(event.position, options.listener), at = g.ctx.currentTime + .005 + mix.arrivalDelay;
    const amplitude = (Number(clip.gain) || 0) * gain * event.gain, release = Math.min(.22, remain * .3), attack = .008;
    level.gain.setValueAtTime(0, at); level.gain.linearRampToValueAtTime(amplitude, at + attack);
    level.gain.setValueAtTime(amplitude, at + Math.max(attack, remain - release)); level.gain.linearRampToValueAtTime(0, at + remain);
    source.connect(level).connect(lowpass);
    lowpass.connect(distance); const target = g.master;
    if (panner) distance.connect(panner).connect(target); else if (pan) distance.connect(pan).connect(target); else distance.connect(target);
    distance.connect(send).connect(g.convolver);
    const voice = { id, eventId: event.id, kind: 'material', source, level, distance, lowpass, send, panner, pan,
      position: { ...event.position }, startedAt: at, until: at + remain,
      nodes: [source, level, distance, lowpass, send, panner, pan].filter(Boolean), residual: null };
    place(voice, options, frame); g.voices.add(voice);
    source.onended = () => { g.voices.delete(voice); for (const node of voice.nodes) { try { node.disconnect?.(); } catch {} } };
    source.start(at, offset, remain); return true;
  }
  function play(event, options, frame) {
    if (event.type === 'strain') return material('restraint', event, options, frame);
    if (event.type === 'infill') return material('failure-body', event, options, frame);
    if (event.type === 'course') return material('stone-spall', event, options, frame);
    if (event.type === 'roof') return material('joint-fracture', event, options, frame);
    if (event.type === 'release' && options.effectsMode !== 'off') return residualBranch(event, options, frame);
    return false;
  }
  function update(frame = {}, options = {}) {
    if (disposed) return { ...last, active: false, audible: false, sourceCount: 0 };
    const nextId = String(frame.sequenceId || sequenceId || 'source-demolition');
    if (nextId !== sequenceId) { stopVoices(); clearTail(); sequenceId = nextId; seen = new Set(); receiptOrder = []; consumedAt = null; }
    const active = !!frame.active, protectedAudio = !!options.protected || !!options.suspended;
    const enabled = active && !protectedAudio, g = active || frame.preload ? ensureGraph() : graph;
    if ((active || frame.preload) && g) void load(g);
    const events = (Array.isArray(frame.events) ? frame.events : []).map(event => eventInfo(event, frame)).filter(Boolean);
    for (const event of events) {
      if (!receipt(event)) continue;
      if (event.type === 'consumed') {
        consumedAt = g ? g.ctx.currentTime - Math.min(CONFIG.consumedTailSeconds, event.age) : -Infinity;
        note(event, enabled && event.age <= CONFIG.maxEventAge && !frame.restored && !frame.replayed ? 'drain-material-tail' : 'consumed-baseline');
        continue;
      }
      let reason = !enabled ? 'protected-or-outside' : frame.restored || frame.replayed || event.suppressed ? 'restored-baseline'
        : event.age > CONFIG.maxEventAge ? 'stale-no-backlog' : consumedAt != null ? 'after-consumption'
          : !g?.loaded ? 'bank-not-ready-no-backlog' : !event.position ? 'missing-world-anchor'
            : event.type === 'release' && options.effectsMode === 'off' ? 'residual-effects-off'
              : event.type === 'release' && ![...g.voices].some(v => v.id === 'failure-body' && v.until > g.ctx.currentTime) ? 'no-playing-material-no-backlog' : null;
      if (!reason && play(event, options, frame)) { played++; note(event, 'played'); }
      else { skipped++; note(event, reason || 'voice-budget'); }
    }
    if (frame.consumed && consumedAt == null) consumedAt = g ? g.ctx.currentTime - CONFIG.consumedTailSeconds : -Infinity;
    if (g) {
      const remaining = consumedAt == null ? 1 : clamp(1 - (g.ctx.currentTime - consumedAt) / CONFIG.consumedTailSeconds, 0, 1);
      const residualEnabled = enabled && options.effectsMode !== 'off';
      const reducedDread = !!options.reducedDread || options.effectsMode === 'reduced';
      // Recording/playback/focus/exit boundaries must not leak a fading former
      // source into the protected interval. Internal retirement can stay soft
      // because this output gate is already exactly zero.
      if (!enabled || remaining <= 0) zero(g.master.gain, g.ctx);
      else ramp(g.master.gain, CONFIG.masterGain * remaining, g.ctx, .035);
      ramp(g.residualBus.gain, residualEnabled ? reducedDread ? .45 : 1 : 0, g.ctx, residualEnabled ? .12 : .006);
      ramp(g.wet.gain, residualEnabled ? reducedDread ? .35 : .6 : 0, g.ctx, residualEnabled ? .08 : .006);
      if (!enabled) { stopVoices(); if (lastEnabled) clearTail(); }
      else if (!residualEnabled && lastResidualEnabled) { stopVoices({ residualOnly: true }); clearTail(); }
      if (remaining <= 0 && g.voices.size) { stopVoices(); clearTail(); }
      for (const voice of [...g.voices]) {
        if (voice.until < g.ctx.currentTime) g.voices.delete(voice); else place(voice, options, frame);
      }
      lastEnabled = enabled; lastResidualEnabled = residualEnabled;
    }
    last = { active, audible: enabled && !!g?.loaded && (consumedAt == null || g.ctx.currentTime < consumedAt + CONFIG.consumedTailSeconds), muted: !enabled,
      reason: !active ? 'outside-demolition' : protectedAudio ? 'recording-playback-or-suspended' : 'demolition',
      loaded: !!g?.loaded, failed: g?.failed || null, sequenceId, played, skipped, sourceCount: g?.voices.size || 0,
      residualCount: g ? [...g.voices].filter(v => v.residual).length : 0,
      consumed: consumedAt != null, reducedDread: !!options.reducedDread || options.effectsMode === 'reduced', receipts: [...receiptOrder], history: [...history],
      positioning: g?.ctx.createPanner ? 'fixed-world HRTF; residual follows visible front' : 'fixed-world stereo; height affects attenuation',
      residualMode: 'filtered send of the same running body source; no replayed tail',
      voices: g ? [...g.voices].flatMap(v => [{ id: v.id, eventId: v.eventId, kind: v.kind, position: v.currentPosition, startedAt: v.startedAt, until: v.until, mix: v.mix },
        ...(v.residual ? [{ id: `${v.id}:residual-send`, eventId: v.residual.eventId, kind: 'residual', derivedSend: true,
          position: v.residual.currentPosition, startedAt: v.residual.startedAt, until: v.until, mix: v.residual.mix }] : [])]) : [] };
    return last;
  }
  function stop() {
    if (graph) { zero(graph.master.gain, graph.ctx); zero(graph.residualBus.gain, graph.ctx); stopVoices(); clearTail(); }
    lastEnabled = false; lastResidualEnabled = false;
    last = { ...last, active: false, audible: false, muted: true, sourceCount: 0, residualCount: 0, voices: [] };
  }
  function reset() {
    stop(); sequenceId = null; seen.clear(); receiptOrder = []; consumedAt = null;
    history.length = 0; played = 0; skipped = 0;
    last = { ...last, sequenceId: null, consumed: false, played: 0, skipped: 0, receipts: [], history: [] };
  }
  return { update, ready: () => load(), stop, reset,
    snapshot: () => ({ ...last, sourceCount: graph?.voices.size || 0 }),
    destroy() { stop(); disposed = true; disconnectGraph(); } };
}
