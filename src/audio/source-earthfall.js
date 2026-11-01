import {createDoorAudio} from './door-audio.js';
import {createSourceEarthfallGagAudio} from './source-earthfall-gag.js';
import {SOURCE_ELLERY_ASIDE_ASSET} from '../data/generated/source-earthfall-ellery-aside.js';
import { assetUrl } from '../platform/paths.js';
import { SOURCE_DEMOLITION_AUDIO_DIR, SOURCE_DEMOLITION_AUDIO_CLIPS } from '../data/source-demolition-audio.js';
import { earthfallRumbleBuffer, earthfallRumbleDuration } from './source-earthfall-rumble.js';
import { earthfallChargePlan, earthfallReportBuffers, earthfallRoarBuffer } from './source-earthfall-demolition.js';
import { SOURCE_EARTHFALL_ELLERY_ASIDE as ASIDE } from '../data/source-earthfall-ellery-aside.js';
import { earthfallChaseWorldPoint } from '../data/source-earthfall-chase.js';

// Reuses the accepted CC0 material bank. There is no new recording, loop,
// score, synthetic fall wind or impact punishment. Each context can share this
// small subset between earthfall instances; the first omen keeps its own bank.
export const SOURCE_EARTHFALL_AUDIO = Object.freeze({
  maxVoices: 4, maxEncodedBytes: 1000000, maxDecodedBytes: 8000000,
  maxEventAge: .16, arrivalSpeed: 343, maxArrivalDelay: .45,
  masterGain: .62, residualGain: .13, reducedResidualGain: .42,
  initiationSeconds: 1.1,
  initiationSplit: .55,
  // The record-driven ground bed (source-earthfall-rumble.js), under the
  // material clips. It thins and darkens with depth as the surface recedes.
  rumbleGain: .85, reducedRumbleGain: .55,
  // The aside's implosion (source-earthfall-demolition.js): the charge ripple
  // and the dust roar, which closes in and muffles as the dust reaches him.
  chargeGain: .6, roarGain: .7,
});
const CONFIG = SOURCE_EARTHFALL_AUDIO;
const MATERIALS = new Set(['restraint', 'failure-body', 'stone-spall']);
const TYPES = new Set(['strain', 'fracture', 'load-transfer', 'footing-loss', 'catch', 'land','catch-return','land-return','stratum-0','stratum-1','stratum-2']);
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
  urlFor = file => assetUrl(`${SOURCE_DEMOLITION_AUDIO_DIR}/${file}`), fetcher = globalThis.fetch,createAsideDoorAudio=createDoorAudio,
  createAsideGagAudio=createSourceEarthfallGagAudio,gagFetcher,gagUrlFor,
} = {}) {
  let graph = null, sequenceId = null, runId = null, disposed = false, enabled = false, effects = true, reduced = false;
  let observedActive = false, rumble = null;
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
  let demolition = { charges: [], roar: null };
  function stopDemolition() {
    for (const voice of [...demolition.charges, demolition.roar]) {
      if (!voice) continue;
      try { voice.source.stop(); } catch {}
      for (const node of voice.nodes) { try { node.disconnect?.(); } catch {} }
    }
    demolition = { charges: [], roar: null };
  }
  // The reports are already built; this is only scheduling, so firing them
  // costs the frame nothing. Nothing replays if the cue is late.
  function playCharges(event, listener) {
    const g = graph, buffers = earthfallReportBuffers(g.ctx);
    if (!buffers) return false;
    const now = g.ctx.currentTime + .005, plan = earthfallChargePlan(event.charges || [], listener);
    plan.forEach((shot, index) => {
      const source = g.ctx.createBufferSource(), filter = g.ctx.createBiquadFilter(), pan = g.ctx.createStereoPanner?.(), gain = g.ctx.createGain();
      source.buffer = buffers[index % buffers.length]; filter.type = 'lowpass'; filter.frequency.value = shot.cutoff;
      gain.gain.value = CONFIG.chargeGain * shot.gain;
      if (pan) { pan.pan.value = shot.pan; source.connect(filter).connect(pan).connect(gain); } else source.connect(filter).connect(gain);
      gain.connect(g.master);
      const at = shot.at - (event.age || 0);
      source.start(now + Math.max(0, at), Math.max(0, -at));
      demolition.charges.push({ source, nodes: [source, filter, pan, gain].filter(Boolean) });
    });
    return true;
  }
  // The roar runs on the aside's clock from the moment the first wall's base
  // crushes, and restarts if the two drift apart.
  function syncRoar(frame, active) {
    const g = graph, start = ASIDE.wallsAt.north - .3, seconds = (Number(frame.elapsed) || 0) - start;
    const buffer = active && g ? earthfallRoarBuffer(g.ctx) : null;
    if (!buffer || seconds < 0 || (frame.blackoutAlpha || 0) >= 1 || seconds >= buffer.duration - .05) {
      if (demolition.roar) { try { demolition.roar.source.stop(); } catch {} for (const node of demolition.roar.nodes) { try { node.disconnect?.(); } catch {} } demolition.roar = null; }
      return;
    }
    const now = g.ctx.currentTime;
    let roar = demolition.roar;
    if (roar && Math.abs(roar.offset + (now - roar.at) - seconds) > .25) { try { roar.source.stop(); } catch {} roar = demolition.roar = null; }
    if (!roar) {
      const source = g.ctx.createBufferSource(), filter = g.ctx.createBiquadFilter(), gain = g.ctx.createGain();
      source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = 2600; gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(g.master); source.start(now, seconds);
      roar = demolition.roar = { source, filter, gain, at: now, offset: seconds, nodes: [source, filter, gain] };
    }
    const cover = clamp(frame.dust?.cover, 0, 1);
    target(roar.gain.gain, CONFIG.roarGain * Math.min(1, seconds / 1.5) * (1 - (frame.blackoutAlpha || 0)), g.ctx, .08);
    target(roar.filter.frequency, 2600 - 2200 * cover, g.ctx, .15);
  }
  function stopRumble() {
    if (!rumble) return;
    try { rumble.source.stop(); } catch {}
    for (const node of [rumble.source, rumble.filter, rumble.gain]) { try { node.disconnect?.(); } catch {} }
    rumble = null;
  }
  // The rumble is the record itself, so it stays on the record's clock: it
  // starts at the committed record time and restarts if the two drift apart.
  function syncRumble(frame) {
    const g = graph, seconds = frame.quake?.seconds, buffer = g && earthfallRumbleBuffer(g.ctx);
    if (!buffer || !frame.committed || !Number.isFinite(seconds) || seconds >= earthfallRumbleDuration() - .05) { stopRumble(); return; }
    const now = g.ctx.currentTime;
    if (rumble && Math.abs(rumble.offset + (now - rumble.at) - seconds) > .2) stopRumble();
    if (!rumble) {
      const source = g.ctx.createBufferSource(), filter = g.ctx.createBiquadFilter(), gain = g.ctx.createGain();
      source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = 1400; gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(g.master); source.start(now, seconds);
      rumble = { source, filter, gain, at: now, offset: seconds };
    }
    const depth = clamp((Number(frame.physicalDepth) || 0) / 100, 0, 1);
    target(rumble.gain.gain, (reduced ? CONFIG.reducedRumbleGain : CONFIG.rumbleGain) * (1 - .7 * depth), g.ctx, .08);
    target(rumble.filter.frequency, 1400 - 1000 * depth, g.ctx, .2);
  }
  function cut() {
    if (!graph) return;
    stopRumble(); stopDemolition();
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
      followAnchor: id === 'failure-body' ? 'fallingMaterial' : ['catch','catch-return'].includes(event.type) ? 'catch' : null,
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
      aside:asideDoors?{...asideDoors.snapshot?.(),materialHistory:[...asideMaterialHistory],gag:asideGag?.snapshot()||null,gagReady:!!asideGag?.ready()}:null,
      rumble: rumble ? { playing: true, offset: rumble.offset, startedAt: rumble.at } : { playing: false },
      sourceBank: `${SOURCE_DEMOLITION_AUDIO_DIR}/manifest.json`,
      bankSubset: [...MATERIALS],
      residualMethod: 'filtered send from the one playing failure source; no replay, synthetic wind or new performance',
      order: 'three disjoint chronological support segments; local loading then main body only at footing-loss',
      voices: voices.flatMap(voice => [{ id: voice.id, eventId: voice.eventId, kind: 'material',
        position: voice.path.position, mix: voice.path.mix, startedAt: voice.at, sourceEnd: voice.sourceEnd,
        sourceOffset: voice.sourceOffset, sourceDuration: voice.sourceDuration,
        until: voice.until, followsMaterial: voice.followMaterial, followsAnchor: voice.followAnchor }, ...(voice.residual ? [{
        id: `${voice.id}:residual`, eventId: voice.residual.eventId, kind: 'residual', derivedSend: true,
        position: voice.residual.path.position, mix: voice.residual.path.mix, startedAt: voice.residual.at,
        sourceEnd: voice.sourceEnd, until: voice.until }] : [])]) };
  }
  function update(frame = {}, options = {}) {
    asideGag?.stop();
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
    if ((active || frame.preload) && g) { void load(g); earthfallRumbleBuffer(g.ctx); }
    if (!enabled) cut();
    else {
      target(g.master.gain, CONFIG.masterGain, g.ctx, .025);
      target(g.residualBus.gain, effects ? reduced ? CONFIG.reducedResidualGain : 1 : 0, g.ctx, effects ? .10 : .006);
      if (!effects) removeResiduals();
      for (const voice of [...g.voices]) {
        if (voice.until <= g.ctx.currentTime) detach(voice);
        else place(voice, frame, options);
      }
      syncRumble(frame);
    }
    for (const event of (Array.isArray(frame.events) ? frame.events : []).map(item => eventInfo(item, frame)).filter(Boolean)) {
      if (seen.has(event.id) || seenTypes.has(event.type)) continue;
      seen.add(event.id); seenTypes.add(event.type); receipts.push(event.id);
      let reason = !enabled ? 'protected-or-outside' : initialCommitted || frame.restored || frame.replayed || event.suppressed ? 'restored-baseline'
        : event.age > CONFIG.maxEventAge ? 'stale-no-backlog' : !g?.bank?.loaded ? 'bank-not-ready-no-backlog'
          : !event.position ? 'missing-world-anchor' : event.type.startsWith('stratum-') ? 'depth-receipt-no-material-failure'
          : event.type === 'footing-loss' && !effects ? 'residual-effects-off' : null;
      let didPlay = false;
      if (!reason) {
        // Non-overlapping intervals of the same recording remain earned by
        // their actual event even when render and audio clocks diverge. No raw
        // interval or tail is replayed, and no explosive pulse is manufactured.
        if (event.type === 'strain') didPlay = material('restraint', event, frame, options, .45, CONFIG.initiationSplit);
        if (event.type === 'fracture') didPlay = material('restraint', event, frame, options, .495,
          CONFIG.initiationSeconds - CONFIG.initiationSplit, CONFIG.initiationSplit);
        // Finish the existing recording's unplayed tail as the bearings load;
        // the initial two segments remain disjoint and are never restarted.
        if(event.type==='load-transfer')didPlay=material('restraint',event,frame,options,.42,Infinity,CONFIG.initiationSeconds);
        if (event.type === 'footing-loss') {
          didPlay = material('failure-body', event, frame, options, .76);
          if (didPlay && effects) addResidual(event, frame, options);
        }
        if (event.type === 'catch'||event.type==='catch-return') didPlay = material('stone-spall',event,frame,options,valid(options.earthfallImpactGain)?clamp(options.earthfallImpactGain,0,1):.7);
        if (event.type === 'land'||event.type==='land-return') didPlay = material('stone-spall',event,frame,options,valid(options.earthfallSettleGain)?clamp(options.earthfallSettleGain,0,1):.18);
      }
      if (didPlay) played++; else skipped++;
      history.push({ id: event.id, type: event.type, age: event.age, reason: didPlay ? 'played' : reason || 'voice-budget' });
      if (history.length > 32) history.shift();
    }
    last = { active, muted: !enabled, audible: enabled && !!g?.bank?.loaded,
      reason: !active ? 'outside-earthfall' : !enabled ? 'recording-playback-or-suspended' : 'earthfall' };
    return snapshot();
  }
  let asideDoors=null,asideGag=null,asideSeen=new Set(),asideRun=null,asideMaterialHistory=[],asideChaseObserved=false;
  const asidePortals=SOURCE_ELLERY_ASIDE_ASSET.doors.map(d=>({id:'earthfall-ellery:'+d.id,archetype:d.archetype,definition:{archetype:d.archetype}}));
  const ensureAsideDoors=()=>asideDoors||(asideDoors=createAsideDoorAudio({getAudio,fetchImpl:fetcher}));
  const ensureAsideGag=()=>asideGag||(asideGag=createAsideGagAudio({getAudio,maxEventAge:CONFIG.maxEventAge,
    ...(gagFetcher?{fetcher:gagFetcher}:{}),...(gagUrlFor?{urlFor:gagUrlFor}:{})}));
  async function prepareAside(){
    const d=ensureAsideDoors(),gag=ensureAsideGag();
    d.update({active:true,listener:{x:65.15,y:1.62,z:11.65,yaw:-.75},nearDoors:asidePortals});
    try{const [doorReady,gagReady]=await Promise.all([d.whenReady(),gag.prepare()]);return doorReady!==false&&gagReady===true;}
    finally{d.pause('aside-prepared');gag.stop();}
  }
  function updateAside(frame={},options={}){
    // The remembered room is not on the shaking ground; its own sound owns it.
    stopRumble();
    // Built here, in the still of the waking, not on the frame that needs them.
    if(graph){earthfallReportBuffers(graph.ctx);earthfallRoarBuffer(graph.ctx);}
    const d=ensureAsideDoors(),active=!!frame.active&&frame.blackoutAlpha<.95&&!options.protected&&!options.suspended&&!options.hidden&&options.focused!==false;
    if(asideRun!==frame.runId){asideRun=frame.runId;asideSeen.clear();asideMaterialHistory=[];asideChaseObserved=false;}
    d.update({active,listener:{x:frame.eye?.[0]??0,y:frame.eye?.[1]??1.62,z:frame.eye?.[2]??0,yaw:frame.yaw??0},nearDoors:asidePortals});
    for(const event of options.events||[]){if(String(event.type||'').startsWith('threshold-gag-'))continue;if(asideSeen.has(event.id))continue;asideSeen.add(event.id);if(!active)continue;const door=frame.doors?.[event.doorIndex],portal=asidePortals[event.doorIndex];if(!door||!portal)continue;d.event({type:event.type,portal,fromClosed:event.type==='opening-start',fraction:door.fraction},door.anchor);}
    ensureAsideGag().update(frame,options);
    // Every sound here has a source in the remembered room: the charges at
    // their piers, the core's bearing, its floor, the walls at their pieces,
    // and the roar of the dust. No earthquake bed is laid under it, and
    // resuming never replays missed failures.
    const g=ensureGraph(),listener={x:frame.eye?.[0]??0,y:frame.eye?.[1]??1.62,z:frame.eye?.[2]??0,yaw:frame.yaw??0};
    const materialActive=active&&g?.bank?.loaded&&!['suspended','interrupted','closed'].includes(g?.ctx?.state);
    if(!materialActive)cut();
    else{
      target(g.master.gain,CONFIG.masterGain,g.ctx,.025);
      target(g.residualBus.gain,0,g.ctx,.01);
      for(const voice of [...g.voices]){if(voice.until<=g.ctx.currentTime)detach(voice);else place(voice,{},{listener});}
    }
    syncRoar(frame,materialActive);
    // Four widely separated restraint failures come from actual room piers.
    // They use the retained credited material recording, at its original pitch;
    // these authored placements are not a measured room response. A restored
    // compressed room establishes a baseline and never replays missed attacks.
    const compression=Number(frame.chase?.compression)||0;
    const piers=[[ASIDE.room.minX,ASIDE.center.z],[ASIDE.center.x,ASIDE.room.maxZ],[ASIDE.room.maxX,ASIDE.center.z],[ASIDE.center.x,ASIDE.room.minZ]];
    for(let i=0;i<4;i++){
      const threshold=i*.25,id=`earthfall-chase:${frame.runId}:restraint:${i}`;
      if(!['chase','contact','collapse'].includes(frame.chase?.phase)||compression+1e-7<threshold||asideSeen.has(id))continue;
      asideSeen.add(id);
      const p=earthfallChaseWorldPoint({x:piers[i][0],z:piers[i][1],feet:1.4},frame.chase),position={x:p.x,y:p.feet,z:p.z};
      const reason=!asideChaseObserved?'restored-baseline':!materialActive?'protected-or-bank-not-ready':null;
      const didPlay=!reason&&material('restraint',{id,position,age:0,gain:1},{},{listener},.23+i*.035,.75,i%2?.65:0);
      asideMaterialHistory.push({id,type:'chase-restraint',position,reason:didPlay?'played':reason||'voice-budget'});
    }
    asideChaseObserved=true;
    for(const event of frame.materialEvents||[]){
      if(event.age<0||asideSeen.has(event.id))continue;asideSeen.add(event.id);
      const reason=!materialActive?'protected-or-bank-not-ready':event.age>CONFIG.maxEventAge?'stale-no-backlog':!point(event.position)?'missing-world-anchor':null;
      let played=false;
      if(!reason){
        if(event.type==='charges')played=playCharges(event,listener);
        else if(event.type==='masonry-bond')played=material('restraint',{...event,gain:.55},{},{listener},.47,.55,0);
        else if(event.type==='roof-bearing')played=material('restraint',{...event,gain:.5},{},{listener},.43,1.15,1.1);
        else if(event.type==='floor-bond')played=material('stone-spall',{...event,gain:.5},{},{listener},.38,.9,0);
      }
      asideMaterialHistory.push({id:event.id,type:event.type,position:event.position,age:event.age,reason:played?'played':reason||'voice-budget'});
      if(asideMaterialHistory.length>8)asideMaterialHistory.shift();
    }
    return {...d.snapshot(),gag:asideGag.snapshot(),gagReady:asideGag.ready()};
  }
  function stopAside(){asideDoors?.pause('aside-stopped');asideGag?.stop();stopDemolition();cut();}
  function stop() { stopAside();cut(); enabled = false; last = { ...last, active: false, muted: true, audible: false, reason: 'stopped' }; }
  function reset() { stop();asideGag?.destroy();asideGag=null;asideSeen.clear();asideRun=null;asideChaseObserved=false; sequenceId = null; runId = null; observedActive = false; seen.clear(); seenTypes.clear(); receipts = []; history.length = 0; played = 0; skipped = 0; }
  function destroy() { stop();asideDoors?.dispose();asideGag?.destroy(); disposed = true; graph?.master.disconnect?.(); graph?.residualBus.disconnect?.(); graph = null; }
  return { update, updateAside,prepareAside,asideGagReady:()=>!!asideGag?.ready(),stopAside,asideSnapshot:()=>asideDoors?{...asideDoors.snapshot(),gag:asideGag?.snapshot()||null,gagReady:!!asideGag?.ready()}:null, ready: () => load(), stop, reset, snapshot, destroy };
}
