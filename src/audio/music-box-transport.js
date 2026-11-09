import { assetUrl } from '../platform/paths.js';
import { MUSIC_BOX_REFERENCE } from '../data/music-box-reference.js';

const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, finite(v, lo)));
const safe = (node, method, ...args) => { try { node?.[method]?.(...args); } catch {} };
const decoded = new WeakMap();

// Decoding is shared; playback ownership never is. A failed request is removed
// so re-entering the scene can retry rather than retaining a rejected promise.
export function loadMusicBoxReference(context, {
  fetcher = (...args) => globalThis.fetch(...args), urlFor = assetUrl,
  file = MUSIC_BOX_REFERENCE.file,
} = {}) {
  if (!context?.decodeAudioData || typeof fetcher !== 'function') return Promise.resolve(null);
  const url = urlFor(file);
  let bank = decoded.get(context);
  if (!bank) { bank = new Map(); decoded.set(context, bank); }
  if (bank.has(url)) return bank.get(url);
  const promise = Promise.resolve().then(() => fetcher(url)).then(async response => {
    if (!response || response.ok === false) throw Error(`Music box reference unavailable${response?.status ? ` (${response.status})` : ''}`);
    const bytes = await response.arrayBuffer();
    if (!bytes?.byteLength || bytes.byteLength > MUSIC_BOX_REFERENCE.maxEncodedBytes) throw Error('Music box reference exceeds its encoded budget');
    const buffer = await context.decodeAudioData(bytes);
    if (!buffer || !(buffer.duration > 0) || buffer.duration > MUSIC_BOX_REFERENCE.maxDecodedSeconds)
      throw Error('Music box reference exceeds its decoded budget');
    promise.buffer = buffer;
    return buffer;
  }).catch(reason => { if (bank.get(url) === promise) bank.delete(url); throw reason; });
  bank.set(url, promise);
  return promise;
}

export function peekMusicBoxReference(context, { file = MUSIC_BOX_REFERENCE.file, urlFor = assetUrl } = {}) {
  // Kept separate from the async loader: consumers must never mistake a silent
  // procedural placeholder for the decoded authored recording.
  const promise = decoded.get(context)?.get(urlFor(file));
  return promise?.buffer ?? null;
}

export function createMusicBoxTransport({
  context, destination, fetcher, urlFor = assetUrl, file = MUSIC_BOX_REFERENCE.file,
  gain = MUSIC_BOX_REFERENCE.gain,
} = {}) {
  if (!context || !destination) return null;
  const out = context.createGain(); out.gain.value = clamp(gain, 0, 2); out.connect(destination);
  let buffer = peekMusicBoxReference(context, { file, urlFor }), source = null, pending = null, error = null, disposed = false;
  let offset = 0, sourceAt = 0, looping = false, wanted = false, status = 'stopped';
  let requestedAt = null;
  const seconds = () => buffer?.duration || MUSIC_BOX_REFERENCE.durationSeconds;
  const normalized = (value, loop = looping) => {
    const length = seconds(), position = Math.max(0, finite(value));
    return loop ? position % length : Math.min(position, length);
  };
  function position() {
    return normalized(offset + (source ? Math.max(0, context.currentTime - sourceAt) : 0));
  }
  function detach() {
    if (!source) return;
    const old = source; source = null;
    old.onended = null;
    safe(old, 'stop'); safe(old, 'disconnect');
  }
  function start() {
    if (disposed || !wanted || !buffer || source || context.state === 'closed') return false;
    offset = normalized(offset);
    if (!looping && offset >= seconds() - .00001) { wanted = false; status = 'ended'; return false; }
    const current = context.createBufferSource(); current.buffer = buffer; current.loop = looping;
    // Tempo changes never transpose the steel comb. The irregular timing is
    // already present in the authentic reference performance.
    if (current.playbackRate) current.playbackRate.value = 1;
    current.connect(out);
    sourceAt = Math.max(context.currentTime, finite(requestedAt, context.currentTime));
    requestedAt = null;
    current.onended = () => {
      if (source !== current) return;
      source = null; safe(current, 'disconnect');
      if (!looping) { offset = seconds(); wanted = false; status = 'ended'; }
    };
    source = current; status = 'playing';
    current.start(sourceAt, offset);
    return true;
  }
  function initialize() {
    if (disposed) return Promise.resolve(false);
    if (buffer) return Promise.resolve(true);
    if (pending) return pending;
    pending = loadMusicBoxReference(context, { fetcher, urlFor, file }).then(result => {
      if (disposed) return false;
      buffer = result; error = null; start(); return !!buffer;
    }).catch(reason => {
      if (!disposed) { error = String(reason?.message || reason); status = 'error'; }
      return false;
    }).finally(() => { pending = null; });
    return pending;
  }
  function play({ offset: next = 0, loop = false, when = null } = {}) {
    if (disposed) return false;
    detach(); looping = !!loop; offset = normalized(next, looping);
    wanted = true; requestedAt = when; status = buffer ? 'playing' : 'loading';
    if (buffer) return start();
    void initialize(); return true;
  }
  function pause() {
    if (disposed) return false;
    offset = position(); wanted = false; detach(); status = 'paused'; requestedAt = null;
    return true;
  }
  function resume() {
    if (disposed) return false;
    wanted = true; status = buffer ? 'playing' : 'loading';
    if (buffer) return start();
    void initialize(); return true;
  }
  function stop() {
    if (disposed) return false;
    wanted = false; detach(); offset = 0; requestedAt = null; status = 'stopped'; return true;
  }
  function sync({ position: next = position(), playing = false, loop = false } = {}) {
    if (disposed) return false;
    const desired = normalized(next, loop);
    if (!playing) {
      if (source || wanted) pause();
      offset = desired; looping = !!loop; return false;
    }
    const actual = position(), drift = loop ? Math.min(Math.abs(actual - desired), Math.abs(seconds() - Math.abs(actual - desired))) : Math.abs(actual - desired);
    if (!wanted || looping !== !!loop || drift > .15) return play({ offset: desired, loop });
    return source ? true : (buffer ? start() : (void initialize(), true));
  }
  return {
    out, initialize, play, pause, resume, stop, sync,
    ready: () => !!buffer && !disposed,
    error: () => error,
    get source() { return source; },
    get buffer() { return buffer; },
    sample() { return { ready: !!buffer && !disposed, error, running: !!source && context.state === 'running' && context.currentTime >= sourceAt,
      position: position(), seconds: seconds(), state: disposed ? 'disposed' : status }; },
    dispose() { if (disposed) return; stop(); disposed = true; buffer = null; safe(out, 'disconnect'); },
  };
}

// Mechanical recordings share cancellation ownership with the melody. Motion
// feedback is quiet, rate-limited and capped; orbiting cannot produce a storm.
export function createMusicBoxContacts({ context, destination, fetcher = (...args) => globalThis.fetch(...args), urlFor = assetUrl } = {}) {
  if (!context || !destination) return null;
  const buffers = new Map(), voices = new Set(), last = new Map();
  const entries = [['key', MUSIC_BOX_REFERENCE.keyContactFile], ['release', MUSIC_BOX_REFERENCE.releaseFile], ['rattle', MUSIC_BOX_REFERENCE.rattleFile]].filter(([, file]) => !!file);
  let pending = null, disposed = false, error = null;
  function initialize() {
    if (disposed) return Promise.resolve(false);
    if (entries.every(([kind]) => buffers.has(kind))) { error = null; return Promise.resolve(true); }
    if (pending) return pending;
    pending = Promise.all(entries.map(([kind, file]) => {
      if (buffers.has(kind)) return true;
      return Promise.resolve().then(() => fetcher(urlFor(file))).then(async response => {
        if (!response || response.ok === false) return false;
        const bytes = await response.arrayBuffer(); if (bytes.byteLength > 500_000) return false;
        const decoded = await context.decodeAudioData(bytes);
        if (!disposed && decoded?.duration > 0 && decoded.duration < 1) buffers.set(kind, decoded);
        return buffers.has(kind);
      }).catch(() => false);
    })).then(() => {
      const complete = entries.every(([kind]) => buffers.has(kind));
      if (!disposed) error = !buffers.has('release') ? 'The pitched music box release could not be loaded.' : !complete ? 'The music box handling recording could not be loaded.' : null;
      return complete;
    }).finally(() => { pending = null; });
    return pending;
  }
  function stopVoice(voice) {
    voice.source.onended = null; safe(voice.source, 'stop'); safe(voice.source, 'disconnect'); safe(voice.gain, 'disconnect'); voices.delete(voice);
  }
  function stop() { for (const voice of [...voices]) stopVoice(voice); }
  function play(kind, { when = context.currentTime, gain = .3 } = {}) {
    const buffer = buffers.get(kind), at = Math.max(context.currentTime, finite(when, context.currentTime));
    if (disposed || !buffer || context.state === 'closed') return false;
    const cooldown = kind === 'rattle' ? .16 : .12;
    // Each genuine key release must have a pitched attack, including a rapid
    // catch/release. Only incidental handling contacts have a cooldown.
    if (kind !== 'release' && at - finite(last.get(kind), -Infinity) < cooldown) return false;
    if (voices.size >= 3) {
      if (kind !== 'release') return false;
      const incidental = [...voices].find(voice => voice.kind !== 'release');
      stopVoice(incidental || voices.values().next().value);
    }
    last.set(kind, at);
    const source = context.createBufferSource(), volume = context.createGain(); source.buffer = buffer;
    if (source.playbackRate) source.playbackRate.value = 1;
    volume.gain.value = clamp(gain, 0, 1); source.connect(volume); volume.connect(destination);
    const voice = { source, gain: volume, kind }; voices.add(voice);
    source.onended = () => { voices.delete(voice); safe(source, 'disconnect'); safe(volume, 'disconnect'); };
    source.start(at); return true;
  }
  return {
    initialize,
    ready: () => !disposed && buffers.has('release'),
    error: () => error,
    play: options => play('key', options),
    playRelease: options => play('release', options),
    playRattle({ amount = 1, when } = {}) {
      const strength = clamp(amount, 0, 1);
      return strength >= .04 && play('rattle', { when, gain: .12 + strength * .3 });
    },
    stop,
    dispose({ releaseTail = false } = {}) {
      if (disposed) return;
      disposed = true;
      if (releaseTail) {
        // Intentional lowering can finish only already-started pitched voices.
        // Their existing onended callbacks release nodes; no delayed task can
        // start a new voice, and stop() still cancels these on pause/blur.
        for (const voice of [...voices]) if (voice.kind !== 'release') stopVoice(voice);
      } else stop();
      buffers.clear();
    },
  };
}
