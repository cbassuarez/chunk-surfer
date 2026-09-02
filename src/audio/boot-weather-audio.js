import { createThunderVoice } from './thunder.js';
// THE WEATHER YOU HEAR THE CREDITS THROUGH.
//
// The opening credits were silent — not by design so much as by nobody having
// put anything there. Weather that you can see and cannot hear is a screensaver;
// the whole reason to have rain on the credits is that the quote about machines
// and silence arrives out of it.
//
// Synthesised, not sampled, for the same reason as fountain-water.js: a loop of
// broadband noise shaped by what the noise is falling on costs nothing to load
// and never lands on the loop point, and this has to be up within a frame of
// boot with no asset race in front of it. Same construction as that module —
// one noise buffer, two bandpass layers, a slow oscillator between them — so
// the two ambient beds in this game are built the same way.
//
// THE GUST IS SHARED WITH THE PICTURE. `update` takes the same wind term the
// simulation is using (boot-weather.js), so a surge you hear is the surge you
// are watching. Driving them from two oscillators would put the sound a beat
// off the leaves and there is nothing subtle about that.
//
// A per-particle "blow-by" one-shot was tried here and cut: a synthesised swish
// does not sound like a leaf going past, it sounds like a synthesised swish,
// and one bad transient every 160ms is worse than none. If this ever wants
// individual passes they need to be recorded, not built out of a filter sweep.

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || 0));

// Peak gain per weather. THE REFERENCE IS THE MENU HISS, which is the only
// other ambient bed on this screen and runs at 0.018 (story-audio.js,
// startMenuHiss). Weather sits a little above it — present, not mixed — and the
// two overlap at the handoff, so these are the levels the hiss has to come up
// through rather than levels chosen in isolation. Rain is dense and constant so
// it reads at the lowest number; leaves are almost all gust and need the
// headroom to be heard between them.
const VOICES = Object.freeze({
  rain: Object.freeze({
    // RAIN IS CONSTANT, AND CONSTANT IS LOUD. At the same linear gain as the
    // other two it read as several times their level, because they spend most
    // of their time between gusts and rain never does. It is the one weather
    // that sits UNDER the menu hiss rather than a little over it.
    gain: 0.011,
    body: { freq: 1150, q: 0.5, gain: 0.9 },      // the mass of it on stone
    air: { freq: 4600, q: 0.7, gain: 0.30 },      // the hiss off the top
    wobbleHz: 0.13, wobbleDepth: 190,
    gustDepth: 0.10,                              // rain barely surges
  }),
  leaves: Object.freeze({
    gain: 0.020,
    body: { freq: 2600, q: 1.5, gain: 0.85 },     // dry, papery, high
    air: { freq: 6200, q: 1.1, gain: 0.22 },
    wobbleHz: 0.23, wobbleDepth: 620,
    gustDepth: 0.78,                              // almost all of it is gust
  }),
  sheets: Object.freeze({
    gain: 0.020,
    body: { freq: 1080, q: 1.1, gain: 0.88 },     // bigger, slower, lower
    air: { freq: 3400, q: 0.9, gain: 0.26 },
    wobbleHz: 0.17, wobbleDepth: 340,
    gustDepth: 0.62,
  }),
});

export function bootWeatherVoice(kind) {
  return VOICES[String(kind || '')] || null;
}

export function createBootWeatherAudio({ context, destination, kind = 'rain' } = {}) {
  const voice = bootWeatherVoice(kind);
  if (!context || !destination || !voice) {
    return { update() {}, strike() { return false; }, stop() {}, active: () => false };
  }

  // THE STORM HAS BEEN STRIKING INTO A QUEUE NOBODY DRAINED. stepBootWeather has
  // always ticked a storm and pushed its events onto state.thunder, and
  // drainBootThunder has always existed to take them — and nothing anywhere
  // called it, so the opening credits have had lightning weather with no thunder
  // in it. The voice was written and only ever wired in-game.
  //
  // It hangs off the same destination as the bed, so it is one weather on one
  // bus, and it goes through the output analyser like everything else — which is
  // what lets the title's meter jump on a crack rather than only breathe on rain.
  const thunder = createThunderVoice({ context, destination });

  // Two seconds of noise, looped — long enough that the seam is not a rhythm,
  // short enough not to be worth streaming.
  const seconds = 2;
  const buffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate * seconds)), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;

  const out = context.createGain();
  out.gain.value = 0;
  out.connect(destination);

  const band = (spec) => {
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = spec.freq;
    filter.Q.value = spec.q;
    const gain = context.createGain();
    gain.gain.value = spec.gain;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    return filter;
  };
  const body = band(voice.body);
  band(voice.air);

  // The band wanders. Without it this is a hiss with a filter on it, and the
  // ear finds the filter in about four seconds.
  const wobble = context.createOscillator();
  wobble.type = 'sine';
  wobble.frequency.value = voice.wobbleHz;
  const wobbleDepth = context.createGain();
  wobbleDepth.gain.value = voice.wobbleDepth;
  wobble.connect(wobbleDepth);
  wobbleDepth.connect(body.frequency);

  let stopped = false;
  try { noise.start(); wobble.start(); } catch (_) { /* a context that will not run is silence, not an error */ }

  return {
    active: () => !stopped,
    // One drained storm event. Bearing, distance and energy are the same three
    // numbers that drive the picture (see game/storm.js), so the flash and the
    // clap cannot disagree about where it was.
    strike(event = {}) {
      if (stopped) return false;
      return thunder.strike({
        distance: Number(event.distance) || 1200,
        energy: Number(event.energy) || 0.7,
        bearing: Number(event.bearing) || 0,
      });
    },
    // `wind` is the simulation's own gust term, ~1 ± its kind's depth. Presence
    // is the same curve the particle count rides, so the bed thickens with the
    // field and empties with it.
    update({ presence = 0, wind = 1 } = {}, now = context.currentTime) {
      if (stopped) return;
      const gust = 1 + (clamp(wind, 0, 2) - 1) * voice.gustDepth;
      const target = voice.gain * clamp(presence, 0, 1) * clamp(gust, 0.2, 1.8);
      out.gain.cancelScheduledValues(now);
      out.gain.linearRampToValueAtTime(clamp(target, 0, 1), now + 0.18);
    },
    stop({ fade = 0.6, thunderTail = 5.5 } = {}) {
      if (stopped) return;
      stopped = true;
      const now = context.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.linearRampToValueAtTime(0, now + Math.max(0.05, fade));
      const at = now + Math.max(0.05, fade) + 0.12;
      try { noise.stop(at); } catch (_) {}
      try { wobble.stop(at); } catch (_) {}
      const tailMs=Math.max(0,Number(thunderTail)||0)*1000;
      if(tailMs>0)globalThis.setTimeout?.(()=>{try{thunder.stop();}catch(_){}},tailMs);
      else try { thunder.stop(); } catch (_) {}
    },
  };
}
