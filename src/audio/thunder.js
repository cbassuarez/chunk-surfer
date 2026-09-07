// THE THUNDER VOICE.
//
// All of the physics is next door in thunder-channel.js, which is pure and has
// no Web Audio in it. This file is only the part that has to touch the graph:
// take a strike, get a rendered buffer for it, and play it once at the right
// level with the right tilt for where the player is standing.
//
// WHAT DISTANCE DOES is no longer a set of curves written here. It used to be —
// a lowpass swept by distance, a length, an attack, a crack layer — and those
// were good guesses, but they were guesses, and the published listening test of
// synthesised thunder says guesses are exactly what listeners hear as "too
// perfect". Now distance is real: the channel is kilometres of tortuous geometry,
// the delays are its path lengths, and the top of the spectrum is eaten by a
// tabulated ISO 9613-1 absorption over each of those path lengths. The crack, the
// roll and the length of the tail are consequences rather than parameters.
//
// RENDER AT THE FLASH, PLAY AT THE THUNDER. `prepare()` is called when the sky
// lights up and `strike()` when the sound arrives, and between them is
// distance/343 seconds — 1.2s at 400m, 20s at 7km. The render is a couple of
// milliseconds, but it should not be a couple of milliseconds on the frame the
// player is listening to. If nothing prepared it, strike() renders inline; that
// is the god menu's path and the credits' path, and it is fine.
import { makeChannel, renderThunder, thunderFar, thunderGain } from './thunder-channel.js';

export { thunderGain, thunderFar, thunderIndoorBands } from './thunder-channel.js';

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || 0));

// The band tilt is applied HERE rather than baked into the buffer, because the
// buffer is rendered at the flash and the player has up to twenty seconds to
// walk indoors before it lands. Two shelves are exactly the three-band split the
// pure renderer does offline: everything below LOW_HZ, everything above HIGH_HZ,
// and the middle left alone.
const LOW_HZ = 120, HIGH_HZ = 800;
const asDb = (ratio) => 20 * Math.log10(Math.max(0.0001, ratio));

// Buffers are megabytes each and two strikes can overlap. Keep only enough to
// cover the flash-to-thunder gap of the strikes actually in the air.
const CACHE_MAX = 6;

export function createThunderVoice({ context, destination } = {}) {
  if (!context || !destination) return { strike() { return false; }, prepare() {}, stop() {} };

  const cache = new Map();
  const live = new Set();
  let stopped = false;

  function render(event) {
    const seed = (Math.floor(Number(event?.seed) || 0) >>> 0) || 1;
    const cached = cache.get(seed);
    if (cached) return cached;
    const channel = makeChannel(seed, {
      distance: event?.distance,
      bearing: event?.bearing,
      energy: event?.energy,
    });
    // The listener stands at the origin at ear height; the channel was built
    // around them. Bands are left flat — the tilt is two shelves at play time.
    const rendered = renderThunder(channel, { sampleRate: context.sampleRate, seed });
    const buffer = context.createBuffer(1, rendered.samples.length, context.sampleRate);
    buffer.getChannelData(0).set(rendered.samples);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(seed, buffer);
    return buffer;
  }

  return {
    // Called when the sky lights up, while the sound is still on its way.
    prepare(event) {
      if (stopped || !event) return false;
      try { render(event); return true; } catch (_) { return false; }
    },

    strike(event = {}) {
      if (stopped) return false;
      const { distance = 1200, energy = 0.7, bearing = 0, bands = null } = event;
      let buffer;
      try { buffer = render(event); } catch (_) { return false; }
      if (!buffer || !buffer.length) return false;

      const now = context.currentTime;
      const far = thunderFar(distance);
      const src = context.createBufferSource();
      src.buffer = buffer;

      const gain = context.createGain();
      // The render is peak-normalised, so the whole distance law lives here and
      // in one place. The ceiling is 0.17 and it stays: 0.34 was a mastering
      // level, not a weather level, and a close crack arrived beside UI and
      // dialogue at nearly half scale before the SFX bus. A better-sounding
      // thunder is not a louder one.
      gain.gain.setValueAtTime(thunderGain(distance, energy) * (bands ? clamp(bands.mid, 0, 1) : 1), now);

      const panner = context.createStereoPanner?.();
      if (panner) panner.pan.value = clamp(Math.sin(bearing) * (1 - far) * 0.7, -1, 1);

      // Two shelves, only when there is something to tilt. Feature-detected and
      // bypassed cleanly, the way the bell rig guards its optional nodes.
      const shelves = [];
      if (bands && typeof context.createBiquadFilter === 'function') {
        const low = context.createBiquadFilter();
        low.type = 'lowshelf'; low.frequency.value = LOW_HZ;
        low.gain.value = asDb(bands.low / Math.max(0.0001, bands.mid));
        const high = context.createBiquadFilter();
        high.type = 'highshelf'; high.frequency.value = HIGH_HZ;
        high.gain.value = asDb(bands.high / Math.max(0.0001, bands.mid));
        shelves.push(low, high);
      }

      const chain = [src, ...shelves, gain, ...(panner ? [panner] : [])];
      for (let i = 0; i < chain.length - 1; i += 1) chain[i].connect(chain[i + 1]);
      chain[chain.length - 1].connect(destination);

      try { src.start(now); } catch (_) { return false; }
      live.add(chain);
      src.onended = () => {
        live.delete(chain);
        for (const node of chain) { try { node.disconnect(); } catch (_) {} }
      };
      return true;
    },

    stop() {
      stopped = true;
      cache.clear();
      for (const chain of live) {
        for (const node of chain) { try { node.stop?.(); } catch (_) {} try { node.disconnect(); } catch (_) {} }
      }
      live.clear();
    },
  };
}
