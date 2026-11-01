import { assetUrl } from '../platform/paths.js';
import { HEARTBEAT_AUDIO_ASSETS } from '../data/heartbeat-audio-assets.js';
import { createStandingTearProcessedBuffer } from './standing-tear-dsp.js';

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const bounded = (rows, value, maximum = 256) => { rows.push(value); if (rows.length > maximum) rows.splice(0, rows.length - maximum); };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const WORKLET_URL = new URL('./heartbeat-worklet.js?no-inline', import.meta.url);

// One cancellable owner. The audio worklet, rather than drawing or key-repeat,
// owns complete recorded pairs and their inter-cycle timing.
export function createHeartbeatPlayer({
  manifest = HEARTBEAT_AUDIO_ASSETS,
  fetcher = (...args) => fetch(...args),
  nodeFactory = (context, url) => new AudioWorkletNode(context, 'chunk-surfer-heartbeat', {
    numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
    channelCount: 1, channelCountMode: 'explicit',
  }),
  urlFor = value => assetUrl(value),
  wallNow = () => typeof performance === 'undefined' ? Date.now() : performance.now(),
} = {}) {
  let context = null, destination = null, node = null, lowpass = null, output = null;
  let generation = 0, wanted = false, paused = false, level = 0, ready = false, preparing = null;
  let attempt = 0, retryAt = 0, controller = null, cancelReady = null, disposed = false;
  let state = {}, clockMode = 'unavailable', lastSentPressure = null;
  const events = [], errors = [], clips = new Map();
  const trace = value => bounded(events, { ...value, generation });
  function fail(error) {
    const message = String(error?.message || error);
    if (errors.at(-1)?.message !== message) bounded(errors, { message, time: context?.currentTime || 0 }, 16);
  }
  function release() {
    controller?.abort(); controller = null;
    cancelReady?.(false); cancelReady = null;
    try { node?.port?.postMessage({ type: 'dispose' }); } catch { }
    if (node?.port) node.port.onmessage = null;
    if (node) node.onprocessorerror = null;
    for (const item of [node, lowpass, output]) { try { item?.disconnect(); } catch { } }
    node = lowpass = output = null; ready = false; preparing = null; clips.clear(); state = {};
  }
  function command(value) { try { node?.port.postMessage(value); } catch (error) { fail(error); } }
  function applyDesired() {
    if (!ready) return;
    command({ type: 'pressure', level }); lastSentPressure = level;
    command({ type: 'pause', paused });
    command({ type: wanted ? 'start' : 'stop', fadeSeconds: 0 });
  }
  function init(nextContext, nextDestination) {
    if (context === nextContext && destination === nextDestination && !disposed) return;
    generation++; wanted = false; paused = false; level = 0; lastSentPressure = null;
    release(); context = nextContext || null; destination = nextDestination || null;
    disposed = false; attempt = 0; retryAt = 0; clockMode = 'unavailable';
    trace({ type: 'init', time: context?.currentTime || 0, available: !!context });
  }
  async function prepare() {
    if (disposed || !context || !destination || context.state === 'closed') return false;
    if (ready) return true;
    if (preparing) return preparing;
    if (wallNow() < retryAt) return false;
    if (!context.audioWorklet?.addModule) {
      fail(Error('Heartbeat AudioWorklet is unavailable in this audio context.'));
      retryAt = wallNow() + 30000; return false;
    }
    const owner = generation, ctx = context;
    const abort = new AbortController(); controller = abort;
    const promise = Promise.resolve().then(async () => {
      try {
        if (!Array.isArray(manifest.clips) || manifest.clips.length < 2 || manifest.clips.length > 24) throw Error('Invalid heartbeat bank manifest.');
        const decoded = new Array(manifest.clips.length);
        let cursor = 0, bytes = 0;
        async function worker() {
          while (cursor < manifest.clips.length) {
            const index = cursor++, row = manifest.clips[index];
            const response = await fetcher(urlFor(row.url), { signal: abort.signal });
            if (!response.ok) throw Error(`Heartbeat asset ${response.status}: ${row.url}`);
            const original = await ctx.decodeAudioData(await response.arrayBuffer());
            if (generation !== owner || disposed) return;
            if (!original?.getChannelData || original.numberOfChannels !== 1 || original.duration > 1.2) throw Error(`Invalid complete heartbeat performance: ${row.id}`);
            const processed = createStandingTearProcessedBuffer(ctx, original, manifest.dsp);
            if (processed.diagnostics.invalidSamples || processed.diagnostics.clippedSamples) throw Error(`Invalid heartbeat PCM: ${row.id}`);
            const pcm = new Float32Array(processed.buffer.getChannelData(0));
            bytes += pcm.byteLength;
            if (bytes > 32 * 1024 * 1024) throw Error('Heartbeat decoded bank exceeds its memory bound.');
            // Visual phase follows the actual crushed samples, using one common
            // envelope reference across the entire bank, not per-variant gain.
            const stride = Math.max(1, Math.round(processed.buffer.sampleRate * .005));
            const envelope = new Float32Array(Math.ceil(pcm.length / stride));
            for (let at = 0; at < pcm.length; at += stride) {
              let sum = 0; const end = Math.min(pcm.length, at + stride);
              for (let n = at; n < end; n++) sum += pcm[n] * pcm[n];
              envelope[Math.floor(at / stride)] = Math.sqrt(sum / (end - at));
            }
            decoded[index] = { ...row, pcm, sampleRate: processed.buffer.sampleRate,
              durationSeconds: processed.buffer.duration, envelope, envelopeStepSeconds: stride / processed.buffer.sampleRate,
              dsp: processed.diagnostics };
          }
        }
        await Promise.all(Array.from({ length: Math.min(4, manifest.clips.length) }, worker));
        if (generation !== owner || disposed || abort.signal.aborted) return false;
        let reference = 0;
        for (const row of decoded) for (const sample of row.envelope) reference = Math.max(reference, sample);
        for (const row of decoded) {
          if (reference > 0) for (let n = 0; n < row.envelope.length; n++) row.envelope[n] /= reference;
          clips.set(row.id, row);
        }
        await ctx.audioWorklet.addModule(WORKLET_URL.href);
        if (generation !== owner || disposed || abort.signal.aborted) return false;
        const created = nodeFactory(ctx, WORKLET_URL.href);
        node = created;
        created.onprocessorerror = () => {
          if (generation !== owner || node !== created || disposed) return;
          fail(Error('Heartbeat audio processor failed.'));
          attempt++; retryAt = wallNow() + Math.min(30000, 1000 * 2 ** Math.min(5, attempt - 1));
          release();
        };
        lowpass = ctx.createBiquadFilter(); lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(1800, ctx.currentTime);
        output = ctx.createGain(); output.gain.setValueAtTime(1, ctx.currentTime);
        created.connect(lowpass); lowpass.connect(output); output.connect(destination);
        let resolveReady, readyTimer;
        const configured = new Promise(resolve => { resolveReady = resolve; });
        cancelReady = resolveReady;
        created.port.onmessage = ({ data }) => {
          if (generation !== owner || node !== created || disposed) return;
          if (data?.type === 'ready') {
            ready = true; attempt = 0; retryAt = 0; clearTimeout(readyTimer);
            state = { ...state, ...data }; resolveReady(true); cancelReady = null;
            trace({ ...data, time: ctx.currentTime }); applyDesired();
          } else if (data?.type === 'status') state = { ...state, ...data };
          else if (data?.type === 'error') { fail(data.message); resolveReady(false); }
          else if (data?.type === 'cycle' || data?.type === 'clock-resync') trace(data);
        };
        readyTimer = setTimeout(() => resolveReady(false), 3000);
        const rows = decoded.map(row => ({ id: row.id, family: row.family, pcm: row.pcm,
          sampleRate: row.sampleRate, firstPeakSeconds: row.firstPeakSeconds, secondPeakSeconds: row.secondPeakSeconds }));
        created.port.postMessage({ type: 'configure', clips: rows });
        const configuredOK = await configured; clearTimeout(readyTimer);
        if (!configuredOK && generation === owner && !disposed) throw Error('Heartbeat worklet did not configure.');
        return configuredOK && generation === owner && !disposed;
      } catch (error) {
        if (generation === owner && !disposed && !abort.signal.aborted) {
          fail(error); attempt++; retryAt = wallNow() + Math.min(30000, 1000 * 2 ** Math.min(5, attempt - 1));
          // Release failed graphs and buffers; preserve the current context and
          // desired request so only a later caller after backoff can retry.
          release();
        }
        return false;
      } finally {
        if (preparing === promise) preparing = null;
        if (controller === abort) controller = null;
      }
    });
    preparing = promise;
    return promise;
  }
  function start() {
    if (disposed || !context || !destination) return false;
    if (!wanted) { wanted = true; if (ready) command({ type: 'start' }); }
    if (!ready) void prepare();
    return ready;
  }
  function setPressure(value) {
    level = clamp01(value);
    if (ready && (lastSentPressure === null || Math.abs(level - lastSentPressure) > .0001)) {
      command({ type: 'pressure', level }); lastSentPressure = level;
    }
  }
  function setPaused(value) {
    const next = !!value; if (next === paused) return;
    paused = next; if (ready) command({ type: 'pause', paused });
    trace({ type: paused ? 'pause' : 'resume', time: context?.currentTime || 0 });
  }
  function stop({ fade = .6 } = {}) {
    wanted = false;
    if (ready) command({ type: 'stop', fadeSeconds: Math.max(0, Math.min(1.5, Number(fade) || 0)) });
    trace({ type: 'stop', time: context?.currentTime || 0 });
  }
  function heardTime() {
    if (!context) return 0;
    const now = context.currentTime;
    try {
      const stamp = context.getOutputTimestamp?.();
      if (finite(stamp?.contextTime) && finite(stamp?.performanceTime) && stamp.contextTime > 0) {
        clockMode = 'output-timestamp';
        return Math.max(0, Math.min(now, stamp.contextTime + Math.max(0, wallNow() - stamp.performanceTime) / 1000));
      }
    } catch { }
    clockMode = 'reported-latency';
    return Math.max(0, now - Math.max(0, Number(context.outputLatency) || Number(context.baseLatency) || 0));
  }
  function frame() {
    const available = !!(ready && context?.state !== 'closed'), time = heardTime();
    const active = available && wanted && !paused && context?.state === 'running' && level > .0001;
    let cycle = null;
    for (let index = events.length - 1; index >= 0; index--) {
      const event = events[index];
      if (event.type === 'cycle' && event.generation === generation && event.time <= time) { cycle = event; break; }
    }
    let pulse = 0, phase = 0;
    if (active && cycle) {
      const elapsed = time - cycle.time, clip = clips.get(cycle.id);
      phase = Math.max(0, Math.min(1, elapsed / cycle.interval));
      if (clip && elapsed >= 0 && elapsed < clip.durationSeconds) {
        const at = elapsed / clip.envelopeStepSeconds, index = Math.floor(at), fraction = at - index;
        pulse = (clip.envelope[index] || 0) * (1 - fraction) + (clip.envelope[index + 1] || 0) * fraction;
      }
    }
    return { available, active, paused, phase, pulse: clamp01(pulse), level, audioTime: time,
      cycle: cycle?.serial || 0, cycleStartedAt: cycle?.time ?? null, interval: cycle?.interval ?? null,
      firstPeakAt: cycle?.firstPeakAt ?? null, secondPeakAt: cycle?.secondPeakAt ?? null,
      clipId: cycle?.id || null, family: cycle?.family || null, clockMode };
  }
  function snapshot() {
    return { kind: 'sampled-heartbeat', ready, preparing: !!preparing, wanted, paused, level,
      generation, contextState: context?.state || 'unavailable', audioTime: context?.currentTime || 0,
      worklet: state, clipCount: clips.size, decodedBytes: [...clips.values()].reduce((sum, clip) => sum + clip.pcm.byteLength, 0),
      bitcrushing: { ...manifest.dsp, implementation: 'standing-tear-dsp', application: 'once on decoded PCM before fixed-rate playback',
        clips: [...clips.values()].map(clip => ({ id: clip.id, ...clip.dsp })) },
      events: events.map(value => ({ ...value })), errors: errors.map(value => ({ ...value })), retryAt, clock: frame() };
  }
  function dispose() { generation++; wanted = false; disposed = true; release(); context = destination = null; }
  return { init, prepare, start, setPressure, setPaused, stop, frame, snapshot, dispose,
    output: () => ({ context, source: output }) };
}
