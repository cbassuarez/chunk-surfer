// The keepsake held in the hands, voiced from Seb's real recording. The tune is
// one of the full phrase playthroughs (assets/music-box/phrases/), replayed at
// the player's crank speed — slow when turned slowly, fast when turned hard.
// The per-note one-shots (assets/music-box/samples/) voice only what the phrase
// cannot: the backward rake of the slam, snapped-tine ticks and sheared-pin
// holes, plus the winding clicks and gear lurches. Nothing is synthesised into
// the melody; the mechanical bits are short filtered-noise bursts.
//
// This owner borrows presentation only. The winding state is advanced by the
// caller (see game/coastal-memory/winding.js); here we only turn its events
// into sound. One phrase source carries the tune; every other event is a short
// one-shot, so a pin meeting a tine on screen is the same note that sounds.
import { assetUrl } from '../platform/paths.js';
import { COASTAL_MUSIC_BOX_PHRASE_BANK, coastalMusicBoxPhrasePosition, coastalMusicBoxPhraseRate } from '../data/coastal-music-box-phrases.js';
import { COASTAL_MUSIC_BOX_NOTE_BANK, coastalMusicBoxVoiceForEvent } from '../data/coastal-music-box-notes.js';
import { WINDING_PHASE, WINDING_TUNING, windingWearGain } from '../game/coastal-memory/winding.js';

export const COASTAL_WINDING_AUDIO = Object.freeze({
  phrase: 'phrase_5',
  phraseGain: .85, voiceGain: .6, tickGain: .3, clickGain: .16, lurchGain: .28, slamGain: .5,
  maxEncodedBytes: 4_000_000, maxDecodedSeconds: 60,
  crushBits: 10,
});

const finite = (v, d = 0) => Number.isFinite(v) ? v : d;
const clamp = (v, a, b) => Math.max(a, Math.min(b, finite(v, a)));
const safe = (node, method, ...args) => { try { node?.[method]?.(...args); } catch {} };
const set = (param, value, time) => { if (param?.setTargetAtTime) param.setTargetAtTime(value, time, .02); else if (param) param.value = value; };

function shapedCrush(bits) {
  const steps = 2 ** (bits - 1) - 1, curve = new Float32Array(2049);
  for (let i = 0; i < curve.length; i++) { const x = i / (curve.length - 1) * 2 - 1; curve[i] = Math.round(x * steps) / steps; }
  return curve;
}

// A short filtered-noise burst for the non-melodic mechanism sounds.
function burstPcm(sampleRate, seconds, { low = 0, tone = .5, decay = .12, seed = 1 } = {}) {
  const length = Math.max(1, Math.round(sampleRate * seconds)), out = new Float32Array(length);
  let s = seed >>> 0, lp = 0;
  for (let i = 0; i < length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const noise = s / 2147483648 - 1; lp += (noise - lp) * (low ? low : tone);
    out[i] = (noise - lp) * Math.exp(-i / (sampleRate * decay));
  }
  return out;
}

export function createCoastalWindingAudio({ context, destination, fetcher = (...a) => globalThis.fetch(...a), urlFor = assetUrl, phrase = COASTAL_WINDING_AUDIO.phrase } = {}) {
  let ctx = context, out = destination, disposed = false, ready = false, paused = true;
  let phraseBuffer = null, noteBuffers = new Map(), pending = null, error = null;
  let phraseSource = null, phraseGain = null, crush = null, voiceBus = null, outGain = null;
  const nodes = [], voices = new Set();
  const own = (n) => { if (n) nodes.push(n); return n; };

  const phraseDef = COASTAL_MUSIC_BOX_PHRASE_BANK.phrases.find((p) => p.id === phrase) ?? COASTAL_MUSIC_BOX_PHRASE_BANK.phrases[0];

  function decode(url, budgetBytes) {
    if (!ctx?.decodeAudioData || typeof fetcher !== 'function') return Promise.resolve(null);
    return Promise.resolve().then(() => fetcher(urlFor(url)))
      .then(async (response) => {
        if (!response) return null;
        if (response.ok === false) throw Error(`HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > budgetBytes) throw Error('Encoded asset exceeds budget');
        return ctx.decodeAudioData(bytes);
      });
  }

  function load() {
    if (pending) return pending;
    if (disposed || !ctx) return Promise.resolve(false);
    pending = Promise.all([
      decode(phraseDef.file, COASTAL_WINDING_AUDIO.maxEncodedBytes),
      ...COASTAL_MUSIC_BOX_NOTE_BANK.notes.map((n) => decode(n.file, COASTAL_WINDING_AUDIO.maxEncodedBytes).then((b) => b && noteBuffers.set(n.midi, b))),
    ]).then((results) => {
      const phraseDecoded = results[0];
      if (!phraseDecoded || noteBuffers.size < 6) throw Error('The keepsake recording did not fully decode.');
      if ([...noteBuffers.values()].reduce((sum, b) => sum + b.duration, 0) + phraseDecoded.duration > COASTAL_WINDING_AUDIO.maxDecodedSeconds)
        throw Error('Decoded keepsake budget exceeded');
      phraseBuffer = phraseDecoded; ready = true; error = null;
      return true;
    }).catch((reason) => { error = String(reason?.message || reason); return false; })
      .finally(() => { pending = null; });
    return pending;
  }

  function graph() {
    if (outGain) return true;
    if (!ctx || !out) return false;
    outGain = own(ctx.createGain()); outGain.gain.value = 0; outGain.connect(out);
    voiceBus = own(ctx.createGain()); voiceBus.gain.value = COASTAL_WINDING_AUDIO.voiceGain;
    if (ctx.createWaveShaper) { crush = own(ctx.createWaveShaper()); crush.curve = shapedCrush(COASTAL_WINDING_AUDIO.crushBits); crush.oversample = 'none'; voiceBus.connect(crush); crush.connect(outGain); }
    else voiceBus.connect(outGain);
    phraseGain = own(ctx.createGain()); phraseGain.gain.value = COASTAL_WINDING_AUDIO.phraseGain; phraseGain.connect(outGain);
    return true;
  }

  function stopPhrase() {
    if (phraseSource) { try { phraseSource.stop(); } catch {} try { phraseSource.disconnect(); } catch {} phraseSource = null; }
  }
  function stopVoices() { for (const v of [...voices]) { try { v.source.stop(); } catch {} try { v.source.disconnect(); } catch {} try { v.gain.disconnect(); } catch {} voices.delete(v); } }

  function ensurePhrase(rate, offset) {
    if (!phraseBuffer) return;
    if (!phraseSource) {
      phraseSource = ctx.createBufferSource(); phraseSource.buffer = phraseBuffer; phraseSource.loop = true;
      phraseSource.connect(phraseGain);
      phraseSource.start(ctx.currentTime, clamp(offset, 0, Math.max(0, phraseBuffer.duration - .01)));
    }
    if (phraseSource.playbackRate) set(phraseSource.playbackRate, clamp(rate, 0, 4), ctx.currentTime);
  }

  function voice(buffer, { rate = 1, gain = 1, seconds = null } = {}) {
    if (!buffer || !voiceBus) return;
    const source = ctx.createBufferSource(); source.buffer = buffer;
    if (source.playbackRate) source.playbackRate.value = clamp(rate, .25, 4);
    const g = ctx.createGain(); g.gain.value = clamp(gain, 0, 2);
    source.connect(g); g.connect(voiceBus);
    source.onended = () => { voices.delete(v); safe(source, 'disconnect'); safe(g, 'disconnect'); };
    source.start(ctx.currentTime);
    if (seconds != null && buffer.duration > seconds) source.stop(ctx.currentTime + seconds);
    else source.stop(ctx.currentTime + buffer.duration + .02);
    voices.add({ source, gain: g });
  }

  function burst(kind) {
    if (!voiceBus || !ctx.createBuffer) return;
    const rate = ctx.sampleRate || 44100, seconds = kind === 'slam' ? .5 : kind === 'lurch' ? .18 : .012;
    const pcm = burstPcm(rate, seconds, kind === 'slam' ? { low: 1, decay: .22 } : kind === 'lurch' ? { low: 1, decay: .09 } : { tone: .5, decay: .008 });
    const buffer = ctx.createBuffer(1, pcm.length, rate); buffer.getChannelData(0).set(pcm);
    voice(buffer, { gain: kind === 'slam' ? COASTAL_WINDING_AUDIO.slamGain : kind === 'lurch' ? COASTAL_WINDING_AUDIO.lurchGain : COASTAL_WINDING_AUDIO.clickGain });
  }

  function update(input = {}) {
    if (disposed || paused || !ready || !graph() || ctx.state === 'closed') return false;
    const state = input.state || {}, events = input.events || [], turn = finite(input.turn, 0);
    const cranking = state.phase === WINDING_PHASE.CRANKING && turn !== 0 && input.held !== false;
    const crankRate = clamp(turn * WINDING_TUNING.scorePerTurn, -WINDING_TUNING.governorMax, WINDING_TUNING.governorMax);

    if (cranking) {
      const offset = coastalMusicBoxPhrasePosition(state.score, phraseDef.seconds);
      ensurePhrase(coastalMusicBoxPhraseRate(crankRate, phraseDef.seconds), offset);
    } else if (state.phase === WINDING_PHASE.SLAMMING || state.phase === WINDING_PHASE.REST) {
      stopPhrase();
    }

    for (const event of events) {
      if (event.type === 'pluck' && event.direction === -1) {
        const spec = coastalMusicBoxVoiceForEvent(event);
        if (spec && noteBuffers.has(spec.sample.midi)) voice(noteBuffers.get(spec.sample.midi), { rate: spec.playbackRate, gain: windingWearGain(state.wear) });
      } else if (event.type === 'tick') {
        const spec = coastalMusicBoxVoiceForEvent(event);
        if (spec && noteBuffers.has(spec.sample.midi)) voice(noteBuffers.get(spec.sample.midi), { rate: spec.playbackRate, gain: COASTAL_WINDING_AUDIO.tickGain });
      } else if (event.type === 'wind-click') {
        burst('click');
      } else if (event.type === 'lurch') {
        burst('lurch');
      } else if (event.type === 'slam-start') {
        burst('slam');
      }
    }
    if (outGain) set(outGain.gain, paused ? 0 : 1, ctx.currentTime);
    return true;
  }

  return Object.freeze({
    initialize() { if (!ctx) return Promise.resolve(false); graph(); return load(); },
    ready: () => ready && !error && !disposed,
    error: () => error,
    update,
    setPaused(value) { paused = !!value; if (!ctx || !outGain) return; set(outGain.gain, paused ? 0 : 1, ctx.currentTime); if (paused) { stopPhrase(); stopVoices(); } },
    sample() {
      if (!ready || paused || !phraseSource) return { audibleSeconds: 0, audioRunning: false, left: 0, right: 0 };
      return { audibleSeconds: 1 / 60, audioRunning: ctx.state !== 'suspended', left: .5, right: .5 };
    },
    dispose() {
      if (disposed) return; disposed = true; stopPhrase(); stopVoices();
      for (const n of nodes) safe(n, 'disconnect'); nodes.length = 0;
      noteBuffers.clear(); phraseBuffer = null; ready = false;
    },
  });
}
