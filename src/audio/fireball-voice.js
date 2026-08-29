// THE FIREBALL IS A NOTE.
//
// Everything the Surfer throws is made of the recordist's own tape -- chopped
// takes, borrowed instruments, a scream off a session that was never meant to
// leave the room. The ranged exchange had no voice of its own at all: the
// comets crossed the stage in silence and the only sound in the beat was the
// menu blip that acknowledged a click. Four of them arriving at once was four
// silent sprites.
//
// So they are pitched, and the pitch is the point. A cast is an arpeggio -- one
// degree per comet, in the order they leave, which is why they leave a beat
// apart -- and a volley is the same degrees struck as a chord. Deflecting one
// answers it a fifth up. The third deflection, the one that arms the RETURN,
// lands on the tonic two octaves down, and it is the only time in the exchange
// anything sounds resolved.
//
// WHY SYNTHESISED. Same reason as the practice-room click: there is no bell in
// the sample bank, and a struck-metal note is four partials and an envelope, so
// it is built here rather than waited for. Built means every number in it was
// chosen. It also means a cast can be in tune with the battle music instead of
// being whatever pitch a recorded sample happens to sit at.

// A minor pentatonic on A, which is the scale the surfer's own weapon stems sit
// against. Degrees ascend, so a four-comet volley is a chord that opens upward
// rather than a cluster.
export const FIREBALL_SCALE_HZ = Object.freeze([220.00, 261.63, 293.66, 329.63, 392.00, 440.00]);
export const FIREBALL_TONIC_HZ = 110.00;

// Struck metal: a fundamental with three inharmonic partials above it, each
// quieter and shorter than the last. The ratios are deliberately not integers
// -- an integer stack is an organ, and this has to have been hit.
const PARTIALS = Object.freeze([
  Object.freeze({ ratio: 1,     gain: 1,    decay: 1 }),
  Object.freeze({ ratio: 2.76,  gain: .38,  decay: .62 }),
  Object.freeze({ ratio: 5.40,  gain: .17,  decay: .34 }),
  Object.freeze({ ratio: 8.93,  gain: .07,  decay: .19 }),
]);

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const finite = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

export function fireballDegreeHz(degree = 0) {
  const index = Math.max(0, Math.floor(Number(degree) || 0));
  const octave = Math.floor(index / FIREBALL_SCALE_HZ.length);
  return FIREBALL_SCALE_HZ[index % FIREBALL_SCALE_HZ.length] * (2 ** octave);
}

export function createFireballVoice({ getAudio = null, gain = .16 } = {}) {
  let master = null;
  let ctx = null;

  function rig() {
    const next = getAudio?.();
    if (!next?.ctx) return null;
    if (ctx !== next.ctx || !master) {
      ctx = next.ctx;
      master = ctx.createGain();
      master.gain.value = Math.max(0, Number(gain) || 0);
      master.connect(next.destination || ctx.destination);
    }
    return { ctx, master };
  }

  // One struck note. `bright` opens the tone filter (a hard strike rings up top;
  // a distant one does not), `body` is how much of the low end survives.
  function strike(hz, { level = 1, seconds = .9, bright = 1, body = 1, detune = 0, delay = 0 } = {}) {
    const audio = rig();
    if (!audio || !(hz > 0)) return false;
    const at = audio.ctx.currentTime + Math.max(0, Number(delay) || 0);
    const life = Math.max(.08, Number(seconds) || .9);
    const tone = audio.ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.setValueAtTime(Math.max(400, 1200 + 5200 * clamp01(bright)), at);
    tone.frequency.exponentialRampToValueAtTime(Math.max(300, 700 * clamp01(bright) + 220), at + life);
    tone.Q.value = .6;
    tone.connect(audio.master);
    for (const partial of PARTIALS) {
      const osc = audio.ctx.createOscillator();
      const amp = audio.ctx.createGain();
      osc.type = partial.ratio === 1 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(hz * partial.ratio, at);
      osc.detune.setValueAtTime(finite(detune, 0), at);
      const peak = Math.max(.0002, partial.gain * clamp01(level) * (partial.ratio === 1 ? clamp01(body) : 1));
      amp.gain.setValueAtTime(.0001, at);
      amp.gain.exponentialRampToValueAtTime(peak, at + .006);
      amp.gain.exponentialRampToValueAtTime(.0001, at + life * partial.decay);
      osc.connect(amp); amp.connect(tone);
      osc.start(at);
      osc.stop(at + life * partial.decay + .05);
    }
    return true;
  }

  return {
    // The comet leaving the Surfer's hand. Degree by launch order, so a
    // staggered cast is an arpeggio and a volley is that chord struck at once.
    cast(degree = 0, { volley = false, level = 1 } = {}) {
      return strike(fireballDegreeHz(degree), {
        level: .82 * clamp01(level) * (volley ? .74 : 1),
        seconds: volley ? .7 : .95,
        bright: .58,
        body: .9,
        detune: volley ? (degree % 2 ? 7 : -7) : 0,
      });
    },
    // Answering one. A fifth above the note it was thrown at: the exchange is
    // a call and a response, not a cancel.
    deflect(degree = 0) {
      return strike(fireballDegreeHz(degree) * 1.5, { level: .58, seconds: .5, bright: 1, body: .35 });
    },
    // The third one. The only resolved sound in the fight.
    arm() {
      strike(FIREBALL_TONIC_HZ, { level: 1, seconds: 1.9, bright: .34, body: 1 });
      return strike(FIREBALL_TONIC_HZ * 2, { level: .5, seconds: 1.3, bright: .5, body: .7, detune: -4, delay: .012 });
    },
    // It arrives back at the thing that threw it. Small, because a RETURN is
    // worth one point and should sound like one point.
    returned() {
      return strike(FIREBALL_TONIC_HZ * 3, { level: .42, seconds: .62, bright: .9, body: .4 });
    },
    // Nobody touched it. A semitone under the degree it was thrown at, which is
    // the one interval in here that does not belong to the scale.
    land(degree = 0) {
      strike(fireballDegreeHz(degree) * 0.5 * 0.9439, { level: .9, seconds: 1.1, bright: .22, body: 1 });
      return strike(fireballDegreeHz(degree) * 0.9439, { level: .34, seconds: .42, bright: .4, body: .5, detune: 24 });
    },
    dispose() {
      try { master?.disconnect?.(); } catch (_) { /* already gone */ }
      master = null; ctx = null;
    },
  };
}
