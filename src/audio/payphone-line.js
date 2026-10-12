// THE LINE, AS HE HEARS IT IN THE HANDSET — AND THE BOX AROUND IT.
//
// Synthesised to the UK standard (src/game/payphone.js UK_TONES, DTMF), not
// played from samples: a dial tone is two sines and a cadence, and an exact one
// is more convincing than a recording of somebody else's exchange.
//
// EVERYTHING ON THE LINE goes through one handset path, which is what makes a
// voice, a tone and hold music the same small cheap thing:
//
//   input ─ 300 Hz HP ─ 3.4 kHz LP ×2 ─ μ-law compress ─ 8-bit steps ─ μ-law
//   expand ─ carbon soft clip ─ (+ 50 Hz hum, line hiss) ─ earpiece ─ one ear
//
// The companding is G.711's curve (μ = 255) quantised to 256 levels, done with
// waveshapers rather than a worklet: the grit of a digital trunk is the
// quantisation noise riding the signal, loud where the voice is loud, and that
// is what the steps produce. The handset is at one ear; the world (behind the
// glazing, main's job) is in both.
//
// THE BOX is not on the line: the handset lifting, the keys springing back, the
// tape going into the slot and things landing in the return are in the kiosk,
// and go to `box` (the room), not through the earpiece. So is anything heard
// across the road — the lodge phone's bell — and down it (his own mobile).
import { DTMF, UK_TONES } from '../game/payphone.js';
import { createSamDialogVoice } from './sam-voice.js';

const MU = 255;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));

function curve(size, fn) {
  const c = new Float32Array(size);
  for (let i = 0; i < size; i += 1) c[i] = fn((i / (size - 1)) * 2 - 1);
  return c;
}
const compress = (x) => Math.sign(x) * Math.log1p(MU * Math.abs(x)) / Math.log1p(MU);
const expand = (y) => Math.sign(y) * (Math.pow(1 + MU, Math.abs(y)) - 1) / MU;
// Finer than G.711's 8 bits: a 1988 local loop was copper, and the coarse steps
// made every tone gritty and every chord a whine.
const steps = (x) => Math.round(x * 511.5) / 511.5;
const carbon = (x) => Math.tanh(x * 1.6) / Math.tanh(1.6);

export const PAYPHONE_LINE_CURVES = Object.freeze({ compress, expand, steps, carbon });

export function createPayphoneLine({ context = null, destination = null, box = null, earPan = 0.55, mono = false } = {}) {
  if (!context) return null;
  const ctx = context;
  const now = () => ctx.currentTime;
  const nodes = new Set();
  const own = (node) => { nodes.add(node); return node; };

  // ── the handset path ─────────────────────────────────────────────────────
  const input = own(ctx.createGain());
  const voiceInput = own(ctx.createGain()); voiceInput.gain.value = 1.4; voiceInput.connect(input);
  const high = own(ctx.createBiquadFilter()); high.type = 'highpass'; high.frequency.value = 300; high.Q.value = 0.7;
  const low1 = own(ctx.createBiquadFilter()); low1.type = 'lowpass'; low1.frequency.value = 3400; low1.Q.value = 0.9;
  const low2 = own(ctx.createBiquadFilter()); low2.type = 'lowpass'; low2.frequency.value = 3600; low2.Q.value = 0.6;
  const shaper = (fn, size = 8192) => { const s = own(ctx.createWaveShaper()); s.curve = curve(size, fn); s.oversample = 'none'; return s; };
  const muIn = shaper(compress), quant = shaper(steps, 16384), muOut = shaper(expand), clip = shaper(carbon, 2048);
  const ear = own(ctx.createGain()); ear.gain.value = 0.85;
  const panner = typeof ctx.createStereoPanner === 'function' ? own(ctx.createStereoPanner()) : null;
  if (panner) panner.pan.value = mono ? 0 : clamp(earPan, -1, 1);
  input.connect(high); high.connect(low1); low1.connect(low2); low2.connect(muIn); muIn.connect(quant);
  quant.connect(muOut); muOut.connect(clip); clip.connect(ear);
  const out = own(ctx.createGain()); out.gain.value = 0.9;
  if (panner) { ear.connect(panner); panner.connect(out); } else ear.connect(out);
  if (destination) out.connect(destination);
  const boxOut = box || destination;

  // What is coming out of the earpiece, for the sidetone guard.
  const meter = own(ctx.createAnalyser()); meter.fftSize = 512; ear.connect(meter);
  const meterData = new Float32Array(meter.fftSize);
  function outputLevel() {
    meter.getFloatTimeDomainData(meterData);
    let sum = 0; for (let i = 0; i < meterData.length; i += 1) sum += meterData[i] * meterData[i];
    return Math.sqrt(sum / meterData.length);
  }

  let floor = null;        // hum + hiss, while the handset is up
  let voices = [];         // tones
  let hold = null, far = null, bleed = [], held = new Map();
  let sidetone = null, recorder = null, announcer = null;
  let spool = null, breath = null, selfLoop = null;
  const worldBells = new Set();

  function noiseBuffer(seconds = 2, colour = 0) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b = 0;
    for (let i = 0; i < length; i += 1) { const w = Math.random() * 2 - 1; b = b * colour + w * (1 - colour); data[i] = b * 0.5; }
    return buffer;
  }

  function lineFloor() {
    if (floor) return;
    const hiss = ctx.createBufferSource(); hiss.buffer = noiseBuffer(2); hiss.loop = true;
    const hissGain = ctx.createGain(); hissGain.gain.value = 0.0035;
    const hum = ctx.createOscillator(); hum.frequency.value = 50;
    const humGain = ctx.createGain(); humGain.gain.value = 0.0025;
    const hum3 = ctx.createOscillator(); hum3.frequency.value = 150;
    const hum3Gain = ctx.createGain(); hum3Gain.gain.value = 0.0015;
    hiss.connect(hissGain); hissGain.connect(input);
    hum.connect(humGain); humGain.connect(input); hum3.connect(hum3Gain); hum3Gain.connect(input);
    hiss.start(); hum.start(); hum3.start();
    floor = { stop() { for (const n of [hiss, hum, hum3]) { try { n.stop(); } catch (_) {} } for (const n of [hissGain, humGain, hum3Gain]) { try { n.disconnect(); } catch (_) {} } } };
  }

  // Tones end on a short fall, never a cut: a hard gate is a click in the ear.
  function stopVoices(at = now()) {
    for (const voice of voices) {
      try { voice.gain.gain.cancelScheduledValues(at); voice.gain.gain.setTargetAtTime(0, at, 0.008); } catch (_) {}
      for (const osc of voice.oscillators) { try { osc.stop(at + 0.08); } catch (_) {} }
    }
    voices = [];
  }

  // Sines at hz, gated by a cadence (on, off, on, off…) repeated `cycles` times.
  function sines(hz, { level = 0.16, cadence = null, cycles = 1, startAt = null, to = input, type = 'sine', seconds = null } = {}) {
    const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(to);
    const start = startAt ?? now();
    const oscillators = hz.map((f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(gain); o.start(start); return o; });
    const per = level / hz.length;
    let end = Infinity;
    // Every on and off is a few milliseconds of slope, the way a relay's contacts
    // and a carbon earpiece soften it, rather than a square edge.
    const slope = (value, t) => gain.gain.setTargetAtTime(value, t, value > 0 ? 0.005 : 0.012);
    gain.gain.setValueAtTime(0, start);
    if (cadence) {
      let t = start;
      for (let c = 0; c < cycles; c += 1) cadence.forEach((s, i) => { slope(i % 2 === 0 ? per : 0, t); t += s; });
      slope(0, t); end = t + 0.06;
    } else if (seconds != null) {
      slope(per, start); slope(0, start + seconds); end = start + seconds + 0.06;
    } else slope(per, start);
    if (Number.isFinite(end)) for (const o of oscillators) o.stop(end + 0.05);
    const voice = { gain, oscillators };
    voices.push(voice);
    return { voice, seconds: end - start };
  }

  // ── the network ──────────────────────────────────────────────────────────
  // How loud each tone sits in the earpiece: under the voices, not over them.
  const TONE_LEVEL = { dial: 0.09, ringing: 0.085, engaged: 0.075, unobtainable: 0.05, paytone: 0.07 };
  function tone(kind, { level = null, cycles = 40, startAt = null } = {}) {
    lineFloor();
    stopVoices();
    level = level ?? TONE_LEVEL[kind] ?? 0.08;
    if (kind === 'dial') {
      // The 1988 exchange's dial tone: not a clean chord but a low purr, a 400 Hz
      // tone shaken at 33 Hz. The sound of a line that is there.
      const start = startAt ?? now();
      const { voice } = sines([400], { level: level * 0.6, startAt: start });
      const lfo = ctx.createOscillator(); lfo.frequency.value = 33;
      const depth = ctx.createGain(); depth.gain.value = level * 0.6 * 0.45;
      lfo.connect(depth); depth.connect(voice.gain.gain); lfo.start(start);
      voice.oscillators.push(lfo);
      return Infinity;
    }
    if (kind === 'howler') {
      // "Please replace the handset", and then the thing that makes you: a
      // loud warble climbing until you do.
      const start = startAt ?? now();
      const { voice } = sines([2400, 3000], { level: 0.02, startAt: start });
      voice.gain.gain.cancelScheduledValues(start);
      voice.gain.gain.setValueAtTime(0.01, start);
      voice.gain.gain.linearRampToValueAtTime(0.12, start + 20);
      return Infinity;
    }
    // Pay on answer's rapid pips: for as long as nobody has paid.
    if (kind === 'paytone') return sines([400], { level, cadence: [0.125, 0.125], cycles, startAt }).seconds;
    const spec = UK_TONES[kind];
    if (!spec) return 0;
    const played = sines(spec.hz, { level, cadence: spec.cadence, cycles, startAt });
    // Number unobtainable does not go on at you forever: it gives up into the hiss.
    if (kind === 'unobtainable') played.voice.gain.gain.setTargetAtTime(0, (startAt ?? now()) + 7, 1.5);
    return played.seconds;
  }

  const ringSeconds = (rings) => rings * UK_TONES.ringing.cadence.reduce((a, b) => a + b, 0);

  // A keypad tone lasts as long as the key is down, and never less than 70 ms.
  function dtmfDown(key) {
    const pair = DTMF[key];
    if (!pair || held.has(key)) return;
    stopVoices();
    lineFloor();
    const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(input);
    const t = now();
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.1, t + 0.004);
    // Standard twist: the high group a couple of dB above the low.
    const oscillators = pair.map((hz, i) => { const o = ctx.createOscillator(); o.frequency.value = hz; const g = ctx.createGain(); g.gain.value = i ? 0.56 : 0.44; o.connect(g); g.connect(gain); o.start(t); return o; });
    held.set(key, { gain, oscillators, t });
    mechanism('key');
  }
  function dtmfUp(key) {
    const h = held.get(key);
    if (!h) return;
    held.delete(key);
    const end = Math.max(now(), h.t + 0.07);
    h.gain.gain.setValueAtTime(0.1, end); h.gain.gain.linearRampToValueAtTime(0, end + 0.004);
    for (const o of h.oscillators) { try { o.stop(end + 0.02); } catch (_) {} }
    mechanism('key-return', { at: end });
  }
  function dtmf(key) { dtmfDown(key); dtmfUp(key); }

  // After the last digit: a pause with the exchange's small clicks in it.
  function exchange(seconds = 1.8) {
    stopVoices();
    lineFloor();
    const t = now();
    const clicks = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < clicks; i += 1) click({ at: t + 0.2 + Math.random() * (seconds - 0.3), level: 0.08 + Math.random() * 0.08, to: input });
    return seconds;
  }

  function click({ at = now(), level = 0.3, hz = 1800, q = 1.5, length = 0.018, to = input } = {}) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(length, 0);
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = hz; band.Q.value = q;
    const gain = ctx.createGain(); gain.gain.value = level;
    source.connect(band); band.connect(gain); gain.connect(to);
    source.start(at);
  }

  // THE FAR END: the ring-trip click when it is answered, and the room it was
  // answered in, until it is put down.
  const ROOMS = {
    // 1988: the van's cab with rain on the windscreen, a party down a hall of
    // residence, his flat's answering machine, and directory enquiries.
    'van-cab': { hz: 260, q: 0.6, level: 0.05, colour: 0.95, rain: true },
    'hall-party': { hz: 340, q: 0.5, level: 0.06, colour: 0.9, party: true },
    'flat-machine': { hz: 1800, q: 0.4, level: 0.02, colour: 0.4 },
    'enquiries-room': { hz: 1100, q: 0.3, level: 0.02, colour: 0.6 },
    'sarah-hall': { hz: 460, q: 0.5, level: 0.04, colour: 0.92 },
    hallway: { hz: 520, q: 0.5, level: 0.05, colour: 0.9 },
    'office-room': { hz: 900, q: 0.4, level: 0.03, colour: 0.8 },
    'lodge-room': { hz: 700, q: 0.6, level: 0.05, colour: 0.85, radio: true },
    'operator-room': { hz: 1200, q: 0.3, level: 0.018, colour: 0.6 },
    'practice-room': { hz: 380, q: 0.7, level: 0.04, colour: 0.92 },
    voicemail: { hz: 1000, q: 0.3, level: 0.012, colour: 0.5 },
    hold: { hz: 1000, q: 0.3, level: 0.01, colour: 0.5 },
  };
  function answer(room = 'hallway') {
    stopVoices();
    lineFloor();
    click({ level: 0.4, hz: 1200 });
    click({ at: now() + 0.05, level: 0.15, hz: 700 });
    farRoom(room);
  }
  function farRoom(room) {
    stopFar();
    const spec = ROOMS[room] || ROOMS.hallway;
    const source = ctx.createBufferSource(); source.buffer = noiseBuffer(3, spec.colour); source.loop = true;
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = spec.hz; band.Q.value = spec.q;
    const gain = ctx.createGain(); gain.gain.value = 0; gain.gain.linearRampToValueAtTime(spec.level, now() + 0.08);
    source.connect(band); band.connect(gain); gain.connect(input);
    source.start();
    const parts = [source, band, gain];
    if (spec.radio) {
      // The booth radio under the breathing: a talk station with the words gone.
      const r = ctx.createBufferSource(); r.buffer = noiseBuffer(3, 0.3); r.loop = true;
      const rb = ctx.createBiquadFilter(); rb.type = 'bandpass'; rb.frequency.value = 1400; rb.Q.value = 3;
      const rg = ctx.createGain(); rg.gain.value = 0.012;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 3.1; const lg = ctx.createGain(); lg.gain.value = 0.01;
      lfo.connect(lg); lg.connect(rg.gain); r.connect(rb); rb.connect(rg); rg.connect(input); r.start(); lfo.start();
      parts.push(r, rb, rg, lfo, lg);
    }
    if (spec.rain) {
      // Rain on a windscreen: a hiss of it, and drops landing unevenly.
      const r = ctx.createBufferSource(); r.buffer = noiseBuffer(3, 0.2); r.loop = true;
      const rb = ctx.createBiquadFilter(); rb.type = 'bandpass'; rb.frequency.value = 2600; rb.Q.value = 0.9;
      const rg = ctx.createGain(); rg.gain.value = 0.02;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.7; const lg = ctx.createGain(); lg.gain.value = 0.008;
      lfo.connect(lg); lg.connect(rg.gain); r.connect(rb); rb.connect(rg); rg.connect(input); r.start(); lfo.start();
      parts.push(r, rb, rg, lfo, lg);
    }
    if (spec.party) {
      // A party down a corridor: a bass line through two doors, and people.
      const bass = ctx.createOscillator(); bass.type = 'square'; bass.frequency.value = 55;
      const bl = ctx.createBiquadFilter(); bl.type = 'lowpass'; bl.frequency.value = 170;
      const bg = ctx.createGain(); bg.gain.value = 0;
      const beat = ctx.createOscillator(); beat.type = 'square'; beat.frequency.value = 2; const beatDepth = ctx.createGain(); beatDepth.gain.value = 0.018;
      beat.connect(beatDepth); beatDepth.connect(bg.gain); bass.connect(bl); bl.connect(bg); bg.connect(input); bass.start(); beat.start();
      const crowd = ctx.createBufferSource(); crowd.buffer = noiseBuffer(3, 0.7); crowd.loop = true;
      const cb = ctx.createBiquadFilter(); cb.type = 'bandpass'; cb.frequency.value = 700; cb.Q.value = 0.8;
      const cg = ctx.createGain(); cg.gain.value = 0.03;
      crowd.connect(cb); cb.connect(cg); cg.connect(input); crowd.start();
      parts.push(bass, bl, bg, beat, beatDepth, crowd, cb, cg);
    }
    far = { room, parts };
  }
  function stopFar() {
    if (!far) return;
    for (const n of far.parts) { try { n.stop?.(); } catch (_) {} try { n.disconnect(); } catch (_) {} }
    far = null;
  }
  // Put down at the other end: a click, and then only the line.
  function farClear() { stopFar(); click({ level: 0.35, hz: 1000 }); }

  // The voicemail beep: 1 kHz, four tenths.
  function beep() { lineFloor(); return sines([1000], { level: 0.14, seconds: 0.4 }).seconds; }

  // The speaking clock's three pips, a second apart. Returns when the third lands.
  function pips({ delay = 0.35, late = 0 } = {}) {
    lineFloor();
    const t = now() + delay;
    for (let i = 0; i < 3; i += 1) sines([1000], { level: 0.16, seconds: i === 2 ? 0.12 : 0.1, startAt: t + i + (i === 2 ? late : 0) });
    return delay + 2 + late;
  }

  // ── the dial ─────────────────────────────────────────────────────────────
  // Loop-disconnect pulses: the dial breaks the line `count` times, ten a second,
  // on its way back to rest. Heard in the earpiece as clicks, which is what a
  // rotary dial sounded like to the person using it.
  function pulses(count = 1, { at = now() + 0.12 } = {}) {
    lineFloor();
    stopVoices();
    for (let i = 0; i < count; i += 1) click({ at: at + i * 0.1, level: 0.2, hz: 900, q: 0.8, length: 0.012 });
    mechanism('dial-return', { at: at - 0.1 });
    return 0.12 + count * 0.1;
  }

  // ── the tape, in the box ─────────────────────────────────────────────────
  // The coinbox's own motor pulling the swallowed tape through. In the box, not
  // on the line.
  function startSpool() {
    if (spool || !boxOut) return;
    const motor = ctx.createOscillator(); motor.type = 'sawtooth'; motor.frequency.value = 38;
    const ml = ctx.createBiquadFilter(); ml.type = 'lowpass'; ml.frequency.value = 380;
    const mg = ctx.createGain(); mg.gain.value = 0; mg.gain.linearRampToValueAtTime(0.03, now() + 0.4);
    const hiss = ctx.createBufferSource(); hiss.buffer = noiseBuffer(2, 0.1); hiss.loop = true;
    const hb = ctx.createBiquadFilter(); hb.type = 'bandpass'; hb.frequency.value = 3200; hb.Q.value = 1.2;
    const hg = ctx.createGain(); hg.gain.value = 0.008;
    motor.connect(ml); ml.connect(mg); mg.connect(boxOut); hiss.connect(hb); hb.connect(hg); hg.connect(boxOut);
    motor.start(); hiss.start();
    spool = { parts: [motor, ml, mg, hiss, hb, hg], gain: mg };
  }
  function stopSpool() {
    if (!spool) return;
    const s = spool; spool = null;
    try { s.gain.gain.setTargetAtTime(0, now(), 0.15); } catch (_) {}
    setTimeout?.(() => { for (const n of s.parts) { try { n.stop?.(); } catch (_) {} try { n.disconnect(); } catch (_) {} } }, 700);
  }

  // ── himself, on the line ─────────────────────────────────────────────────
  // Breathing, and this same box's rain on its glass, a few seconds behind.
  // HEARD FROM UNDERNEATH: a low pass and a slow wobble in the delay, the way a
  // sound comes up through wet tarmac. Returns the node to send into, and its parts.
  function murk(to, { wobble = true } = {}) {
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 520; low.Q.value = 0.9;
    const sway = ctx.createDelay(1); sway.delayTime.value = 0.06;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.37;
    const depth = ctx.createGain(); depth.gain.value = wobble ? 0.018 : 0;
    lfo.connect(depth); depth.connect(sway.delayTime); lfo.start();
    low.connect(sway); sway.connect(to);
    return { entry: low, parts: [low, sway, lfo, depth] };
  }
  function breathing({ delay = 2.6, seconds = 90, underwater = false } = {}) {
    stopBreathing();
    lineFloor();
    const t = now();
    const air = ctx.createBufferSource(); air.buffer = noiseBuffer(3, 0.6); air.loop = true;
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 900; band.Q.value = 0.6;
    const gain = ctx.createGain(); gain.gain.value = 0;
    const under = underwater ? murk(input) : null;
    const sink = under ? under.entry : input;
    air.connect(band); band.connect(gain); gain.connect(sink); air.start(t);
    for (let at = t + 0.6; at < t + seconds; at += 3.4 + Math.random() * 0.8) {
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.05, at + 1.2);   // in
      gain.gain.linearRampToValueAtTime(0.012, at + 1.5);
      gain.gain.linearRampToValueAtTime(0.04, at + 2.1);   // out
      gain.gain.linearRampToValueAtTime(0, at + 3.2);
    }
    const rain = ctx.createBufferSource(); rain.buffer = noiseBuffer(3, 0.15); rain.loop = true;
    const rb = ctx.createBiquadFilter(); rb.type = 'bandpass'; rb.frequency.value = 3000; rb.Q.value = 0.8;
    const late = ctx.createDelay(Math.max(1, delay + 1)); late.delayTime.value = delay;
    const rg = ctx.createGain(); rg.gain.value = 0.014;
    rain.connect(rb); rb.connect(late); late.connect(rg); rg.connect(sink); rain.start(t);
    breath = { parts: [air, band, gain, rain, rb, late, rg, ...(under ? under.parts : [])] };
  }
  function stopBreathing() {
    if (!breath) return;
    for (const n of breath.parts) { try { n.stop?.(); } catch (_) {} try { n.disconnect(); } catch (_) {} }
    breath = null;
  }
  // His live voice, coming back down the line late and smaller each time round.
  function selfDelay({ seconds = 2.2, feedback = 0.45, underwater = false } = {}) {
    stopSelfDelay();
    if (!sidetone) return false;
    const late = ctx.createDelay(Math.max(1, seconds + 1)); late.delayTime.value = seconds;
    const loop = ctx.createGain(); loop.gain.value = clamp(feedback, 0, 0.8);
    const dark = ctx.createBiquadFilter(); dark.type = 'lowpass'; dark.frequency.value = 2400;
    const out = ctx.createGain(); out.gain.value = 0.8;
    const under = underwater ? murk(input) : null;
    if (underwater) dark.frequency.value = 900;
    sidetone.source.connect(late); late.connect(dark); dark.connect(loop); loop.connect(late); dark.connect(out); out.connect(under ? under.entry : input);
    selfLoop = { parts: [late, loop, dark, out, ...(under ? under.parts : [])] };
    return true;
  }
  function stopSelfDelay() {
    if (!selfLoop) return;
    try { sidetone?.source.disconnect(selfLoop.parts[0]); } catch (_) {}
    for (const n of selfLoop.parts) { try { n.disconnect(); } catch (_) {} }
    selfLoop = null;
  }

  // ── the announcer on the network ─────────────────────────────────────────
  function announce(text) {
    if (!announcer) announcer = createSamDialogVoice({ volume: 0.24, getAudio: () => ({ ctx, destination: voiceInput }) });
    lineFloor();
    return announcer.start(String(text || ''), { speaker: 'line' });
  }

  // ── in the box ───────────────────────────────────────────────────────────
  function mechanism(kind = 'lift', { at = now() } = {}) {
    const to = boxOut;
    if (!to) return;
    const hit = (offset, { hz, q, level, length = 0.05, decay = 0.12 }) => {
      const len = Math.floor(ctx.sampleRate * length);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * decay));
      const source = ctx.createBufferSource(); source.buffer = buffer;
      const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = hz; band.Q.value = q;
      const gain = ctx.createGain(); gain.gain.value = level;
      source.connect(band); band.connect(gain); gain.connect(to);
      source.start(at + offset);
    };
    switch (kind) {
      case 'lift': hit(0, { hz: 900, q: 1.2, level: 0.5 }); hit(0.09, { hz: 2400, q: 3, level: 0.12, length: 0.02 }); break;
      case 'cradle': hit(0, { hz: 700, q: 1, level: 0.7, length: 0.08 }); hit(0.03, { hz: 3000, q: 4, level: 0.2, length: 0.03 }); break;
      case 'key': hit(0, { hz: 2600, q: 2.2, level: 0.08, length: 0.015, decay: 0.3 }); break;
      case 'key-return': hit(0, { hz: 3400, q: 3, level: 0.04, length: 0.012, decay: 0.3 }); break;
      case 'tape-in':
        for (let i = 0; i < 6; i += 1) hit(i * 0.035, { hz: 1500 + i * 120, q: 0.8, level: 0.06, length: 0.03 });
        hit(0.26, { hz: 1100, q: 2, level: 0.4, length: 0.04 });   // the latch
        break;
      case 'return-tape': hit(0, { hz: 800, q: 1.5, level: 0.5, length: 0.06 }); hit(0.07, { hz: 1300, q: 2, level: 0.3 }); break;
      case 'return-key': for (const [o, hz] of [[0, 2600], [0.05, 3900], [0.11, 3100], [0.16, 4400], [0.2, 3600]]) hit(o, { hz, q: 7, level: 0.28, length: 0.06, decay: 0.3 }); break;
      case 'return-page': hit(0, { hz: 600, q: 0.7, level: 0.25, length: 0.09, decay: 0.4 }); hit(0.08, { hz: 1800, q: 0.6, level: 0.08, length: 0.1, decay: 0.5 }); break;
      case 'door': hit(0, { hz: 180, q: 0.9, level: 0.9, length: 0.14, decay: 0.2 }); hit(0.04, { hz: 1400, q: 5, level: 0.15, length: 0.05 }); break;
      case 'dial-grab': hit(0, { hz: 2000, q: 2, level: 0.06, length: 0.02, decay: 0.3 }); break;
      case 'dial-return': for (let i = 0; i < 12; i += 1) hit(i * 0.045, { hz: 2800 + (i % 3) * 300, q: 6, level: 0.025, length: 0.01, decay: 0.3 }); break;
      case 'swing': hit(0, { hz: 520, q: 1.2, level: 0.35, length: 0.05 }); hit(0.45, { hz: 540, q: 1.2, level: 0.18, length: 0.05 }); break;
      case 'slot-shut': hit(0, { hz: 1900, q: 3, level: 0.1, length: 0.02, decay: 0.3 }); break;
      default: hit(0, { hz: 1200, q: 1, level: 0.3 });
    }
  }

  // Down the line from the office: a key ring coming off a hook onto a counter.
  function keyHook() {
    const t = now();
    for (const [o, hz, l] of [[0, 3200, 0.1], [0.04, 4100, 0.08], [0.5, 2600, 0.22], [0.54, 3800, 0.16], [0.58, 3000, 0.12]]) click({ at: t + o, level: l, hz, q: 6, length: 0.05 });
  }

  // His own mobile ringing somewhere down the road, and the lodge's bell across
  // it: in the world, placed by pan and distance, through the glazing.
  function worldVoice({ pan = 0, distance01 = 0.5, to = boxOut } = {}) {
    const gain = ctx.createGain(); gain.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200 - 3600 * clamp(distance01, 0, 1);
    const p = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
    gain.connect(lp);
    if (p) { p.pan.value = clamp(pan, -1, 1); lp.connect(p); if (to) p.connect(to); } else if (to) lp.connect(to);
    return { gain, lp, panner: p };
  }
  // A 1988 car phone in a parked van: a soft two-note warble through the shut
  // cab, a second of it and two of nothing. Not the square-wave chirp of a pager.
  function ringNearby({ pan = 0, distance01 = 0.5, rings = 6, destination: world = boxOut } = {}) {
    const t = now();
    const { gain, lp, panner: p } = worldVoice({ pan, distance01, to: world });
    lp.frequency.value = Math.min(lp.frequency.value, 2600);
    const level = 0.1 * (1 - 0.7 * clamp(distance01, 0, 1));
    const tone = ctx.createOscillator(); tone.type = 'triangle'; tone.frequency.value = 880;
    const warble = ctx.createOscillator(); warble.type = 'square'; warble.frequency.value = 12;
    const spread = ctx.createGain(); spread.gain.value = 90;
    warble.connect(spread); spread.connect(tone.frequency);
    tone.connect(gain); tone.start(t); warble.start(t);
    let at = t;
    gain.gain.setValueAtTime(0, t);
    for (let ring = 0; ring < rings; ring += 1) {
      gain.gain.setTargetAtTime(level, at, 0.03); gain.gain.setTargetAtTime(0, at + 1.0, 0.05);
      at += 3.0;
    }
    for (const o of [tone, warble]) o.stop(at + 0.2);
    return { panner: p, stop: () => { for (const o of [tone, warble]) { try { o.stop(); } catch (_) {} } }, seconds: at - t };
  }
  // A GPO bell: two gongs struck by a hammer at ~20 Hz, on the UK double ring.
  // partials → hammer amp (a 20 Hz square scaled by the cadence) → the world
  // voice's gate, filter and pan.
  function bell({ pan = 0, distance01 = 0.5, rings = 3, destination: world = boxOut, gain = 1 } = {}) {
    const t = now();
    const { gain: gate, lp, panner: p } = worldVoice({ pan, distance01, to: world });
    const level = 0.11 * (1 - 0.6 * clamp(distance01, 0, 1)) * clamp(gain, 0, 4);
    const amp = ctx.createGain(); amp.gain.value = 0; amp.connect(gate);
    const bellNodes = [gate, lp, p, amp].filter(Boolean);
    const partials = [1150, 1612, 2380, 3170].map((hz, i) => {
      const o = ctx.createOscillator(); o.frequency.value = hz;
      const g = ctx.createGain(); g.gain.value = [1, 0.6, 0.35, 0.2][i];
      bellNodes.push(o, g);
      o.connect(g); g.connect(amp); o.start(t); return o;
    });
    const hammer = ctx.createOscillator(); hammer.type = 'square'; hammer.frequency.value = 20;
    const depth = ctx.createGain(); depth.gain.value = level;
    bellNodes.push(hammer, depth);
    hammer.connect(depth); depth.connect(amp.gain); hammer.start(t);
    const oscillators = [...partials, hammer];
    let disposed = false, ended = 0;
    const detach = () => {
      if (disposed) return;
      disposed = true;
      for (const o of oscillators) o.onended = null;
      for (const node of bellNodes) { try { node.disconnect(); } catch (_) {} }
      worldBells.delete(handle);
    };
    const handle = { panner: p, stop: () => {
      if (disposed) return;
      for (const o of oscillators) { try { o.stop(); } catch (_) {} }
      detach();
    }, seconds: 0 };
    worldBells.add(handle);
    for (const o of oscillators) o.onended = () => { if (++ended === oscillators.length) detach(); };
    let at = t;
    // The gongs ring on a little after the hammer stops.
    gate.gain.setValueAtTime(0, t);
    for (let r = 0; r < rings; r += 1) UK_TONES.ringing.cadence.forEach((s, i) => { gate.gain.setTargetAtTime(i % 2 === 0 ? 1 : 0, at, i % 2 === 0 ? 0.004 : 0.09); at += s; });
    gate.gain.setTargetAtTime(0, at, 0.09);
    for (const o of oscillators) o.stop(at + 0.4);
    handle.seconds = at - t;
    return handle;
  }

  // A phone box heard from another space keeps its GPO double ring. The caller
  // may put it through its own wall and facing graph instead of the kiosk bus.
  function ringBellNearby(options = {}) { return bell({ rings: 1, ...options }); }

  // ── hold music, and the tape in the slot ─────────────────────────────────
  function holdMusic(buffer, { level = 0.5, loop = true, onEnded = null } = {}) {
    stopHold();
    if (!buffer) return 0;
    lineFloor();
    const source = ctx.createBufferSource(); source.buffer = buffer; source.loop = loop;
    const gain = ctx.createGain(); gain.gain.value = level;
    source.connect(gain); gain.connect(input);
    if (!loop && onEnded) source.onended = () => { if (hold?.source === source) { hold = null; onEnded(); } };
    source.start();
    hold = { source, gain };
    return buffer.duration;
  }
  function stopHold() {
    if (!hold) return;
    const h = hold; hold = null;
    try { h.source.onended = null; h.source.stop(); } catch (_) {}
  }

  // What is recorded under the tape head, coming down the line with the call.
  function setBleed(list = []) {
    stopBleed();
    for (const { buffer, gain: level = 0.05, rate = 1 } of list) {
      if (!buffer) continue;
      const source = ctx.createBufferSource(); source.buffer = buffer; source.loop = true; source.playbackRate.value = rate;
      const gain = ctx.createGain(); gain.gain.value = 0; gain.gain.linearRampToValueAtTime(clamp(level, 0, 0.4), now() + 0.6);
      source.connect(gain); gain.connect(input);
      source.start(now(), Math.random() * Math.max(0.01, buffer.duration - 0.1));
      bleed.push({ source, gain });
    }
  }
  function stopBleed() {
    for (const b of bleed) { try { b.gain.gain.setTargetAtTime(0, now(), 0.08); b.source.stop(now() + 0.4); } catch (_) {} }
    bleed = [];
  }

  // A bad stretch of tape getting into a good bit: the recording cut below the
  // word, transposed, loosely pulsed, for `seconds`.
  function grains(buffers = [], { seconds = 1.6, level = 0.14 } = {}) {
    const pool = buffers.filter(Boolean);
    const t = now();
    const hann = curve(48, (x) => 0.5 * (1 - Math.cos(Math.PI * (x + 1))));
    let at = t;
    while (at < t + seconds) {
      const dur = 0.04 + Math.random() * 0.08;
      const g = ctx.createGain(); g.gain.value = 0; g.connect(input);
      let source;
      if (pool.length) {
        const buffer = pool[Math.floor(Math.random() * pool.length)];
        source = ctx.createBufferSource(); source.buffer = buffer; source.playbackRate.value = 0.6 + Math.random() * 0.9;
        source.connect(g); source.start(at, Math.random() * Math.max(0.01, buffer.duration - dur - 0.01), dur * 2);
      } else {
        source = ctx.createBufferSource(); source.buffer = noiseBuffer(dur, 0.8);
        const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 400 + Math.random() * 1600; band.Q.value = 4;
        source.connect(band); band.connect(g); source.start(at);
      }
      try { g.gain.setValueCurveAtTime(hann.map((v) => v * level), at, dur); } catch (_) {}
      at += dur * (0.5 + Math.random() * 0.9);
    }
  }

  // ── the other way: sidetone, and what goes onto the voicemail ────────────
  function connectMic(stream) {
    if (!stream || sidetone) return !!sidetone;
    try {
      const source = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain(); gain.gain.value = 0;
      source.connect(gain); gain.connect(input);
      sidetone = { source, gain, stream };
      return true;
    } catch (_) { return false; }
  }
  function setSidetone(level = 0) {
    if (!sidetone) return;
    try { sidetone.gain.gain.setTargetAtTime(clamp(level, 0, 0.5), now(), 0.03); } catch (_) {}
  }

  // The message, recorded through the same band and codec as the line, so it
  // is kept already sounding like a phone. Resolves with a Blob (or null).
  function recordVoicemail() {
    if (!sidetone || typeof MediaRecorder === 'undefined' || typeof ctx.createMediaStreamDestination !== 'function') return null;
    stopRecording();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400;
    const a = shaper(compress), q = shaper(steps, 16384), b = shaper(expand);
    const sink = ctx.createMediaStreamDestination();
    sidetone.source.connect(hp); hp.connect(lp); lp.connect(a); a.connect(q); q.connect(b); b.connect(sink);
    let media;
    try { media = new MediaRecorder(sink.stream); } catch (_) { return null; }
    const chunks = [];
    media.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    const done = new Promise((resolve) => { media.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: media.mimeType || 'audio/webm' }) : null); });
    media.start();
    recorder = { media, done, parts: [hp, lp, a, q, b, sink], startedAt: now() };
    return recorder;
  }
  function stopRecording() {
    if (!recorder) return null;
    const r = recorder; recorder = null;
    try { if (r.media.state !== 'inactive') r.media.stop(); } catch (_) {}
    try { sidetone?.source.disconnect(r.parts[0]); } catch (_) {}
    return r.done.then((blob) => ({ blob, seconds: now() - r.startedAt }));
  }

  return {
    input, voiceInput, output: out, outputLevel,
    tone, ringSeconds, dtmf, dtmfDown, dtmfUp, exchange, answer, farRoom, farClear, beep, pips, announce,
    mechanism, keyHook, ringNearby, ringBellNearby, bell, holdMusic, stopHold, setBleed, stopBleed, grains,
    connectMic, setSidetone, recordVoicemail, stopRecording,
    pulses, startSpool, stopSpool, breathing, stopBreathing, selfDelay, stopSelfDelay,
    recording: () => !!recorder,
    offHook() { lineFloor(); },
    silence() { stopVoices(); },
    stop() {
      for (const ring of [...worldBells]) ring.stop();
      stopVoices(); stopHold(); stopFar(); stopBleed(); announcer?.stop?.();
      stopSpool(); stopBreathing(); stopSelfDelay();
      for (const key of [...held.keys()]) dtmfUp(key);
      floor?.stop(); floor = null;
    },
    destroy() {
      this.stop();
      stopRecording();
      if (sidetone) { try { sidetone.source.disconnect(); sidetone.gain.disconnect(); } catch (_) {} sidetone = null; }
      announcer?.dispose?.(); announcer = null;
      for (const n of nodes) { try { n.disconnect(); } catch (_) {} }
      nodes.clear();
    },
  };
}
