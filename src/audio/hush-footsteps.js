// One body, one place in the room. The real footstep contacts for whatever floor it
// is on, slowed until they carry weight, with a felt thump under them and a floor
// that takes the load first. Presentation only: it emits no noise and spoils nothing.
//
// The bank is the player's own shoes on the player's own floors, played wrong.
import { assetUrl } from '../platform/paths.js';

const MAX_CLIPS = 4;
// One common output trim covers heel, scrape, room return and synthetic weight.
// Gameplay hearing and the monitor needle keep their existing authority.
export const HUSH_FOOTSTEP_OUTPUT_GAIN = 10 ** (-10 / 20);
// The bank's floors are recorded at very different levels. Its weight shouldn't be.
const HEEL_PEAK_DB = -8, MAX_TRIM = 3;

export function createHushFootstepPlayer({ getContext, getDestination, fetcher = (...args) => fetch(...args), urlFor = assetUrl, manifestUrl = 'audio/footsteps/manifest.json' } = {}) {
  let chain = null, manifest = null, manifestPending = null, noise = null;
  const clips = new Map(), wanted = new Set();
  const uses = new Map();

  function roomAnswer(ctx) {
    // A short, dark, deterministic room. Only the far steps send much into it.
    const seconds = 1.2, length = Math.ceil(ctx.sampleRate * seconds), buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let a = 0x51ce + channel * 7919, held = 0;
      for (let i = 0; i < length; i++) {
        a = a + 0x6d2b79f5 >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        held += (((t ^ t >>> 14) >>> 0) / 4294967296 * 2 - 1 - held) * .22;
        data[i] = held * Math.exp(-5.2 * i / length);
      }
    }
    return buffer;
  }
  function emitter() {
    const ctx = getContext?.(), destination = getDestination?.();
    if (!ctx || !destination) return null;
    if (chain?.ctx === ctx && chain.destination === destination) return chain;
    const input = ctx.createGain(), highpass = ctx.createBiquadFilter(), lowpass = ctx.createBiquadFilter();
    const wetSend = ctx.createGain(), output = ctx.createGain();
    highpass.type = 'highpass'; lowpass.type = 'lowpass'; lowpass.Q.value = .5;
    input.connect(highpass); highpass.connect(lowpass);
    let panner = null, stereo = null;
    if (ctx.createPanner) {
      panner = ctx.createPanner();
      if ('panningModel' in panner) panner.panningModel = 'HRTF';
      // Distance is already in the plan; the panner only says where.
      panner.distanceModel = 'inverse'; panner.refDistance = 1; panner.rolloffFactor = 0;
      lowpass.connect(panner); panner.connect(output);
    } else if (ctx.createStereoPanner) {
      stereo = ctx.createStereoPanner(); lowpass.connect(stereo); stereo.connect(output);
    } else lowpass.connect(output);
    lowpass.connect(wetSend);
    if (ctx.createConvolver) {
      const room = ctx.createConvolver(); room.buffer = roomAnswer(ctx);
      wetSend.connect(room); room.connect(output);
    }
    output.gain.value = HUSH_FOOTSTEP_OUTPUT_GAIN;
    output.connect(destination);
    chain = { ctx, destination, input, highpass, lowpass, wetSend, panner, stereo };
    return chain;
  }
  async function loadManifest() {
    if (manifest) return manifest;
    manifestPending ||= fetcher(urlFor(manifestUrl)).then(response => response.ok ? response.json() : null).catch(() => null)
      .then(data => { manifest = data?.banks && data?.clips ? data : null; manifestPending = null; return manifest; });
    return manifestPending;
  }
  const bankFor = surface => manifest?.banks?.[surface] || manifest?.banks?.concrete || manifest?.banks?.tile || null;
  const ids = (surface, clip) => {
    const bank = bankFor(surface);
    const named = bank?.[clip]?.length ? bank[clip] : bank?.walk || [];
    return named.slice(0, MAX_CLIPS);
  };
  async function load(ctx, id) {
    if (wanted.has(id) || !manifest?.clips?.[id]) return;
    wanted.add(id);
    try {
      const response = await fetcher(urlFor(manifest.clips[id].url));
      if (!response.ok) throw new Error(String(response.status));
      const peakDb = Number(manifest.clips[id].samplePeakDbfs);
      clips.set(id, { buffer: await ctx.decodeAudioData(await response.arrayBuffer()), trim: Math.min(MAX_TRIM, Number.isFinite(peakDb) ? 10 ** ((HEEL_PEAK_DB - peakDb) / 20) : 1) });
    } catch (_) { wanted.delete(id); }
  }
  function pick(surface, clip) {
    const choices = ids(surface, clip).filter(id => clips.has(id));
    if (!choices.length) return null;
    const key = `${surface}:${clip}`, used = uses.get(key) || 0;
    uses.set(key, used + 1);
    return clips.get(choices[used % choices.length]);
  }
  function sample(c, clip, at, gain, rate) {
    if (!clip || gain <= 0) return;
    const source = c.ctx.createBufferSource(), env = c.ctx.createGain();
    source.buffer = clip.buffer; source.playbackRate.setValueAtTime(rate, at); env.gain.setValueAtTime(gain * clip.trim, at);
    source.connect(env); env.connect(c.input); source.start(at);
    source.onended = () => { try { source.disconnect(); env.disconnect(); } catch (_) {} };
  }
  function thump(c, at, { peak, fromHz, toHz, seconds }) {
    if (peak <= 0) return;
    const osc = c.ctx.createOscillator(), env = c.ctx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(fromHz, at); osc.frequency.exponentialRampToValueAtTime(toHz, at + seconds * .6);
    env.gain.setValueAtTime(.0001, at); env.gain.linearRampToValueAtTime(peak, at + .012); env.gain.exponentialRampToValueAtTime(.0001, at + seconds);
    osc.connect(env); env.connect(c.input); osc.start(at); osc.stop(at + seconds + .02);
    osc.onended = () => { try { osc.disconnect(); env.disconnect(); } catch (_) {} };
  }
  function noiseBuffer(ctx) {
    if (noise?.sampleRate === ctx.sampleRate) return noise;
    const length = ctx.sampleRate, buffer = ctx.createBuffer(1, length, ctx.sampleRate), data = buffer.getChannelData(0);
    let a = 0x7ea5;
    for (let i = 0; i < length; i++) { a = a + 0x6d2b79f5 >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); data[i] = ((t ^ t >>> 14) >>> 0) / 4294967296 * 2 - 1; }
    noise = buffer; return buffer;
  }
  // The floor taking the load: a narrow groan that gathers, then cuts off.
  function creak(c, at, { peak, seconds, fromHz, toHz }) {
    if (peak <= 0) return;
    const source = c.ctx.createBufferSource(), band = c.ctx.createBiquadFilter(), env = c.ctx.createGain();
    source.buffer = noiseBuffer(c.ctx); source.loop = true;
    band.type = 'bandpass'; band.Q.value = 7; band.frequency.setValueAtTime(fromHz, at); band.frequency.exponentialRampToValueAtTime(toHz, at + seconds);
    env.gain.setValueAtTime(.0001, at); env.gain.exponentialRampToValueAtTime(peak, at + seconds * .86); env.gain.linearRampToValueAtTime(.0001, at + seconds);
    source.connect(band); band.connect(env); env.connect(c.input); source.start(at); source.stop(at + seconds + .02);
    source.onended = () => { try { source.disconnect(); band.disconnect(); env.disconnect(); } catch (_) {} };
  }
  return {
    // Fetching is never permission to play: a slow load misses a step, it doesn't delay one.
    async prepare(surface) {
      const ctx = getContext?.();
      // Now, not on the first footfall: the browser's HRTF data arrives late, and a
      // panner built on the step itself would swallow it.
      emitter();
      if (!ctx || !await loadManifest()) return false;
      await Promise.all(['slow', 'scuff'].flatMap(clip => ids(surface, clip)).map(id => load(ctx, id)));
      return true;
    },
    play(plan, { surface = 'concrete' } = {}) {
      if (!plan?.audible) return false;
      const c = emitter();
      if (!c || (c.ctx.state && c.ctx.state !== 'running')) return false;
      const now = c.ctx.currentTime;
      c.highpass.frequency.setValueAtTime(plan.highpassHz, now);
      c.lowpass.frequency.setValueAtTime(plan.lowpassHz, now);
      c.wetSend.gain.setValueAtTime(plan.wet, now);
      if (c.panner) {
        const p = plan.position;
        if (c.panner.positionX) { c.panner.positionX.setValueAtTime(p.x, now); c.panner.positionY.setValueAtTime(p.y, now); c.panner.positionZ.setValueAtTime(p.z, now); }
        else c.panner.setPosition(p.x, p.y, p.z);
      } else if (c.stereo) c.stereo.pan.setValueAtTime(Math.max(-1, Math.min(1, plan.position.x / Math.max(1, Math.hypot(plan.position.x, plan.position.z)))), now);
      if (plan.creak) creak(c, now, plan.creak);
      if (plan.dryGain > 0) sample(c, pick(surface, plan.clip), now, plan.dryGain, plan.rate);
      if (plan.thump) thump(c, now + plan.thump.delay, plan.thump);
      if (plan.body) thump(c, now + plan.body.delay, plan.body);
      if (plan.drag) sample(c, pick(surface, 'scuff'), now + plan.drag.delay, plan.drag.gain, plan.drag.rate);
      return true;
    },
  };
}
