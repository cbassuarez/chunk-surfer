// Recorded hands and measured room responses, scheduled on the existing world
// SFX bus. The encounter owns when a cue is allowed; this module owns only its
// audible graph and releases every convolution tail when that cue is cancelled.

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, low, high, fallback = low) => Math.max(low, Math.min(high, finite(value, fallback)));
const point = (value = {}, previous = { x: 0, y: 0, yaw: 0 }) => ({
  x: finite(value.x, previous.x), y: finite(value.y ?? value.z, previous.y), yaw: finite(value.yaw, previous.yaw),
});
const entries = value => Array.isArray(value) ? value.map(entry => [entry.id, entry]) : Object.entries(value || {});
const describeAsset = (id, entry) => typeof entry === 'string' ? { id, url: entry } : { ...entry, id };

function setParameter(param, value, now, smooth = false) {
  if (!param) return;
  if (smooth && typeof param.setTargetAtTime === 'function') param.setTargetAtTime(value, now, .018);
  else if (typeof param.setValueAtTime === 'function') param.setValueAtTime(value, now);
  else param.value = value;
}

function disconnect(node) { try { node?.disconnect(); } catch (_) { /* Context already closed. */ } }

export function createApparitionApplauseAudio({
  getAudio = () => null,
  emitAcoustic = () => {},
  fetchAsset = (...args) => globalThis.fetch(...args),
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = timer => clearTimeout(timer),
} = {}) {
  const sources = new Map(), impulses = new Map(), live = new Set(), receipts = new Set(), history = [];
  let listener = point(), ready = false, loading = false, disposed = false, generation = 0, lastContext = null;
  let played = 0, cancelled = 0, errors = 0, lastCancelReason = null, failedAssets = [], loadPromise = null;

  function getExistingAudio() {
    try { return getAudio(); } catch (_) { errors++; return null; }
  }

  function releaseVoice(performance, voice, stop = false) {
    if (!performance.voices.has(voice)) return;
    performance.voices.delete(voice);
    if (voice.timer != null) clearTimer(voice.timer);
    if (voice.source) voice.source.onended = null;
    if (stop) try { voice.source?.stop(); } catch (_) { /* Source already ended. */ }
    for (const node of voice.nodes) disconnect(node);
    if (performance.voices.size === 0) {
      disconnect(performance.bus);
      live.delete(performance);
    }
  }

  function cancel(reason = 'cancelled') {
    let count = 0;
    for (const performance of [...live]) for (const voice of [...performance.voices]) {
      count++; releaseVoice(performance, voice, true);
    }
    cancelled += count;
    lastCancelReason = String(reason);
    return count;
  }

  async function preload(manifest = {}) {
    if (disposed) return { ready: false, error: 'disposed' };
    if (loading) return loadPromise;
    const audio = getExistingAudio(), ctx = audio?.ctx;
    if (!ctx || ctx.state === 'closed' || typeof ctx.decodeAudioData !== 'function') return { ready: false, error: 'audio-unavailable' };
    const token = ++generation;
    ready = false; loading = true; failedAssets = [];
    const load = async (kind, id, input) => {
      const entry = describeAsset(id, input);
      if (!id || !entry.url) throw new Error(`${kind}:${id || '?'}:missing-url`);
      const response = await fetchAsset(entry.url);
      if (!response?.ok) throw new Error(`${kind}:${id}:http-${response?.status ?? '?'}`);
      const bytes = await response.arrayBuffer();
      const buffer = await ctx.decodeAudioData(bytes);
      if (!(buffer?.duration > 0)) throw new Error(`${kind}:${id}:empty-buffer`);
      return { kind, id, buffer, metadata: { ...entry, duration: buffer.duration, channels: buffer.numberOfChannels, sampleRate: buffer.sampleRate } };
    };
    loadPromise = (async () => {
      const jobs = [...entries(manifest.sources).map(([id, entry]) => ['source', id, entry]), ...entries(manifest.impulses).map(([id, entry]) => ['impulse', id, entry])];
      if (!jobs.some(([kind]) => kind === 'source')) {
        loading = false; return { ready: false, error: 'no-sources' };
      }
      const results = await Promise.allSettled(jobs.map(job => load(...job)));
      if (token !== generation || disposed) return { ready: false, error: 'superseded' };
      loading = false;
      failedAssets = results.flatMap((result, index) => result.status === 'rejected' ? [{ kind: jobs[index][0], id: jobs[index][1], error: String(result.reason?.message || result.reason) }] : []);
      if (failedAssets.length) {
        errors += failedAssets.length;
        return { ready: false, sourceCount: 0, impulseCount: 0, failedAssets: failedAssets.map(entry => ({ ...entry })) };
      }
      cancel('asset-reload'); sources.clear(); impulses.clear();
      for (const result of results) {
        const asset = result.value;
        (asset.kind === 'source' ? sources : impulses).set(asset.id, asset);
      }
      ready = true;
      return { ready: true, sourceCount: sources.size, impulseCount: impulses.size };
    })();
    return loadPromise;
  }

  function place(voice, now, smooth = false) {
    const dx = voice.position.x - listener.x, dy = voice.position.y - listener.y;
    const distance = Math.hypot(dx, dy), right = dx * Math.cos(listener.yaw) + dy * Math.sin(listener.yaw);
    const pan = clamp(right / Math.max(1, distance), -1, 1);
    const beyond = Math.max(0, distance - voice.referenceDistance);
    const attenuation = 1 / (1 + voice.rolloff * beyond);
    const wetAttenuation = 1 / (1 + voice.wetRolloff * beyond);
    setParameter(voice.dryGain.gain, voice.dry * attenuation, now, smooth);
    setParameter(voice.dryPan?.pan, pan, now, smooth);
    if (voice.wetGain) {
      setParameter(voice.wetGain.gain, voice.wet * wetAttenuation, now, smooth);
      // Keep the measured stereo response broad, while its origin still moves
      // across the listener's head when they turn. Never alter the global listener.
      setParameter(voice.wetPan?.pan, pan * voice.wetPanWidth, now, smooth);
    }
    Object.assign(voice, { pan, distance, attenuation, wetAttenuation });
  }

  function prepareEvent(input, index, fallbackPosition) {
    const asset = sources.get(input?.source);
    if (!asset || !Number.isFinite(input.time) || input.time < 0) throw new Error(`invalid-score-event:${index}`);
    const rate = clamp(input.playbackRate, .5, 2, 1);
    const offset = clamp(input.offset, 0, asset.buffer.duration);
    const duration = Math.min(asset.buffer.duration - offset, finite(input.duration, asset.buffer.duration - offset));
    if (!(duration > 0)) throw new Error(`empty-score-event:${index}`);
    const wet = clamp(input.wet, 0, 4), impulse = wet > 0 ? impulses.get(input.impulse) : null;
    if (wet > 0 && !impulse) throw new Error(`missing-impulse:${input.impulse || '?'}`);
    return {
      id: String(input.id || `hand-${index}`), asset, impulse, offset, duration, rate,
      time: input.time, position: point(input.position || fallbackPosition), gain: clamp(input.gain, 0, 4, 1),
      dry: clamp(input.dry, 0, 4, 1), wet, preDelay: clamp(input.preDelay, 0, 2),
      fadeIn: clamp(input.fadeIn, 0, duration / rate / 2), fadeOut: clamp(input.fadeOut, 0, duration / rate / 2),
      referenceDistance: clamp(input.referenceDistance, 0, 100, 2), rolloff: clamp(input.rolloff, 0, 10, .12),
      wetRolloff: clamp(input.wetRolloff, 0, 10, .06), wetPanWidth: clamp(input.wetPanWidth, 0, 1, .35),
    };
  }

  function scheduleVoice(performance, data, begin) {
    const { ctx } = performance;
    const at = begin + data.time, duration = data.duration / data.rate;
    const voice = { ...data, source: null, dryGain: null, dryPan: null, nodes: [], timer: null,
      startsAt: at, endsAt: at + duration + (data.impulse ? data.preDelay + data.impulse.buffer.duration : 0) };
    performance.voices.add(voice);
    try {
      const own = node => { voice.nodes.push(node); return node; };
      const source = voice.source = own(ctx.createBufferSource());
      const envelope = own(ctx.createGain()), dryGain = voice.dryGain = own(ctx.createGain());
      const dryPan = voice.dryPan = typeof ctx.createStereoPanner === 'function' ? own(ctx.createStereoPanner()) : null;
      source.buffer = data.asset.buffer;
      setParameter(source.playbackRate, data.rate, at);
      source.connect(envelope); envelope.connect(dryGain);
      dryGain.connect(dryPan || performance.bus);
      if (dryPan) dryPan.connect(performance.bus);
      // Establish the pre-automation value too. At fractional start times some
      // renderers can start the source one sample before the gain breakpoint.
      envelope.gain.value = data.fadeIn > 0 ? 0 : data.gain;
      setParameter(envelope.gain, data.fadeIn > 0 ? 0 : data.gain, at);
      if (data.fadeIn > 0) envelope.gain.linearRampToValueAtTime(data.gain, at + data.fadeIn);
      if (data.fadeOut > 0) {
        setParameter(envelope.gain, data.gain, at + duration - data.fadeOut);
        envelope.gain.linearRampToValueAtTime(0, at + duration);
      }
      if (data.impulse) {
        if (typeof ctx.createConvolver !== 'function') throw new Error('convolution-unavailable');
        const convolver = own(ctx.createConvolver()), send = own(ctx.createGain()), wetGain = own(ctx.createGain());
        const wetPan = typeof ctx.createStereoPanner === 'function' ? own(ctx.createStereoPanner()) : null;
        Object.assign(voice, { wetGain, wetPan });
        // Preserve measured IR level; automatic ConvolverNode normalization
        // would make the browser render differ from the authored comparison.
        convolver.normalize = false;
        convolver.buffer = data.impulse.buffer;
        send.gain.value = 1;
        envelope.connect(send);
        if (data.preDelay > 0) {
          if (typeof ctx.createDelay !== 'function') throw new Error('predelay-unavailable');
          const delay = own(ctx.createDelay(2));
          delay.delayTime.value = data.preDelay; send.connect(delay); delay.connect(convolver);
        } else send.connect(convolver);
        convolver.connect(wetGain); wetGain.connect(wetPan || performance.bus);
        if (wetPan) wetPan.connect(performance.bus);
      }
      place(voice, ctx.currentTime);
      source.start(at, data.offset, data.duration);
      source.stop(at + duration + .001);
      // This timer only collects the exhausted graph. The AudioContext clock
      // schedules all audible contacts; cancelling stops scheduled sources too.
      voice.timer = setTimer(() => releaseVoice(performance, voice), Math.max(0, voice.endsAt - ctx.currentTime + .05) * 1000);
      return voice;
    } catch (error) { releaseVoice(performance, voice, true); throw error; }
  }

  function play(event = {}, options = {}) {
    if (disposed || !ready || loading) return false;
    const audio = getExistingAudio(), ctx = audio?.ctx, destination = audio?.destination;
    // OfflineAudioContext begins suspended and must receive its graph before
    // startRendering. This explicit diagnostic opt-in never resumes game audio.
    const offlineScheduling = options.offlineRendering === true && typeof ctx?.startRendering === 'function' && ctx.state === 'suspended';
    if (!ctx || !destination || (ctx.state !== 'running' && !offlineScheduling)) return false;
    if (lastContext && lastContext !== ctx) cancel('context-change');
    lastContext = ctx;
    const condition = String(options.condition || event.condition || 'treatment');
    if (!['silent', 'ordinary', 'treatment'].includes(condition)) return false;
    const score = options.score || event.score;
    if (!score || !Array.isArray(score.events) || score.events.length > 512) return false;
    const receipt = event.receipt || event.id;
    if (receipt && receipts.has(receipt)) return false;
    listener = point(options.listener || listener, listener);
    let prepared;
    try { prepared = score.events.map((input, index) => prepareEvent(input, index, event.at || event.position)); }
    catch (_) { errors++; return false; }
    if (condition !== 'silent' && prepared.length === 0) return false;
    const begin = ctx.currentTime + clamp(options.leadTime, 0, 1, .012);
    const record = { receipt: receipt || null, score: String(score.id || 'unlabelled'), condition, startsAt: begin, voiceCount: condition === 'silent' ? 0 : prepared.length, events: [] };
    const performance = { ctx, destination, voices: new Set(), bus: null };
    if (condition !== 'silent') {
      try {
        performance.bus = ctx.createGain();
        setParameter(performance.bus.gain, clamp(score.gain, 0, 4, 1) * clamp(options.gain, 0, 4, 1), begin);
        performance.bus.connect(destination); live.add(performance);
        for (const data of prepared) {
          const voice = scheduleVoice(performance, data, begin);
          record.events.push({ id: voice.id, source: voice.asset.id, impulse: voice.impulse?.id || null, position: { ...voice.position },
            startsAt: voice.startsAt, endsAt: voice.endsAt, dry: voice.dry, wet: voice.wet, gain: voice.gain, pan: voice.pan, distance: voice.distance,
            offset: voice.offset, duration: voice.duration, playbackRate: voice.rate, preDelay: voice.preDelay });
        }
      } catch (_) {
        errors++;
        for (const voice of [...performance.voices]) releaseVoice(performance, voice, true);
        disconnect(performance.bus); live.delete(performance);
        return false;
      }
    }
    if (receipt) { receipts.add(receipt); if (receipts.size > 128) receipts.delete(receipts.values().next().value); }
    history.push(record); if (history.length > 32) history.shift(); played++;
    if (condition !== 'silent') {
      const durationMs = Math.max(1, Math.ceil((Math.max(...record.events.map(voice => voice.endsAt)) - ctx.currentTime) * 1000));
      try {
        emitAcoustic({
          kind: 'apparition_applause', source: { kind: 'environment', id: event.sourceId || 'apparition-audience' },
          spatial: { ...(event.spatial || {}), position: point(event.at || event.position || prepared[0].position) },
          acoustic: { ...(event.acoustic || {}), levelDb: finite(event.acoustic?.levelDb, -30), durationMs },
          semantics: { playerGenerated: false, deliberate: false, audibleToHush: false, audibleToMonitor: false, audibleInWorld: true,
            canBeMimicked: false, canSpoilTake: false, family: 'apparition', tags: ['apparition-applause', condition] },
          provenance: { ...(event.provenance || {}), score: record.score, condition, recordedHands: true, measuredConvolution: prepared.some(voice => voice.impulse) },
        });
      } catch (_) { errors++; }
    }
    return true;
  }

  function updateListener(next = {}) {
    if (disposed) return;
    listener = point(next, listener);
    const audio = getExistingAudio();
    if (!audio?.ctx || audio.ctx.state !== 'running' || (lastContext && audio.ctx !== lastContext)) { cancel('context-not-running'); return; }
    for (const performance of live) for (const voice of performance.voices) place(voice, audio.ctx.currentTime, true);
  }

  function inspect() {
    const voices = [...live].flatMap(performance => [...performance.voices].map(voice => ({
      id: voice.id, source: voice.asset.id, impulse: voice.impulse?.id || null, position: { ...voice.position },
      startsAt: voice.startsAt, endsAt: voice.endsAt, pan: voice.pan, distance: voice.distance,
      attenuation: voice.attenuation, wetAttenuation: voice.wetAttenuation,
    })));
    return { ready, loading, disposed, played, cancelled, errors, lastCancelReason, contextState: lastContext?.state ?? null,
      listener: { ...listener }, activeVoices: voices.length, activePerformances: live.size, voices,
      assets: { sources: [...sources.values()].map(asset => ({ ...asset.metadata })), impulses: [...impulses.values()].map(asset => ({ ...asset.metadata })) },
      failedAssets: failedAssets.map(entry => ({ ...entry })), history: history.map(record => ({ ...record, events: record.events.map(event => ({ ...event, position: { ...event.position } })) })),
    };
  }

  function dispose() {
    cancel('disposed'); disposed = true; ready = false; loading = false; generation++;
    sources.clear(); impulses.clear(); receipts.clear();
  }

  return { preload, play, updateListener, cancel, inspect, dispose };
}
