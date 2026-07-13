// SAM-backed speech voice.
//
// The real renderer is loaded lazily from sam-js when available. That package
// exposes `buf8()` / `buf32()` sample buffers and carries SAM's reciter plus
// phoneme-to-speech pass. We do not vendor it here because the upstream repo's
// README does not publish a normal OSS license. If it is unavailable, a small
// local formant fallback keeps story text timing deterministic instead of failing.

const SAM_CDN = 'https://cdn.jsdelivr.net/npm/sam-js@0.3.1/dist/samjs.esm.min.js';
const SAM_RATE = 22050;
const LOAD_TIMEOUT_MS = 1200;

let providerPromise = null;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function query() {
  try { return new URLSearchParams(globalThis.location?.search || ''); }
  catch (_) { return new URLSearchParams(); }
}

function shouldLoadSam() {
  if (typeof document === 'undefined') return false;
  const q = query();
  const mode = (q.get('sam') || '').toLowerCase();
  return mode !== '0' && mode !== 'off' && mode !== 'fallback';
}

// SAM CANNOT DO A LEEDS ACCENT, and it is worth being honest about why: it is
// a 1982 American formant synth (Software Automatic Mouth, Commodore 64), and
// its reciter only knows American-English letter-to-phoneme rules. There is no
// regional mode to switch on. What the constructor DOES expose is the shape of
// the vocal tract — pitch, mouth, throat — so we build it lower and flatter
// than the factory "announcer" preset, which pulls it away from California and
// toward something you would not be surprised to hear in a portakabin. It is
// not Yorkshire. It is just less Los Angeles. `?voice=pitch,mouth,throat`
// overrides it for tuning by ear.
//
// SAM defaults are pitch 64 / mouth 128 / throat 128 / speed 72.
const SAM_OPTS = (() => {
  const d = { pitch: 72, mouth: 105, throat: 118, speed: 72 };
  const raw = query().get('voice');
  if (raw) {
    const [pitch, mouth, throat, speed] = raw.split(',').map(Number);
    if (Number.isFinite(pitch)) d.pitch = pitch;
    if (Number.isFinite(mouth)) d.mouth = mouth;
    if (Number.isFinite(throat)) d.throat = throat;
    if (Number.isFinite(speed)) d.speed = speed;
  }
  return d;
})();

async function loadSamProvider() {
  if (!shouldLoadSam()) return null;
  if (providerPromise) return providerPromise;
  providerPromise = (async () => {
    try {
      const GlobalSam = globalThis.SamJs || globalThis.SAMJS || globalThis.Sam;
      if (typeof GlobalSam === 'function') return new GlobalSam({ ...SAM_OPTS });

      const url = query().get('samUrl') || SAM_CDN;
      const mod = await import(/* @vite-ignore */ url);
      const SamJs = mod?.default || mod?.SamJs || mod?.SAM || mod;
      return typeof SamJs === 'function' ? new SamJs({ ...SAM_OPTS }) : null;
    } catch (err) {
      console.warn('SAM dialog voice unavailable; using local fallback.', err);
      return null;
    }
  })();
  return providerPromise;
}

function timeout(ms) {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

function cleanText(text) {
  return String(text || '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function samplesFromSam(raw) {
  if (!raw || !raw.length) return null;
  const out = new Float32Array(raw.length);
  if (raw instanceof Float32Array || raw instanceof Float64Array || Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i++) out[i] = clamp(Number(raw[i]) || 0, -1, 1);
    return out;
  }
  if (raw instanceof Uint8Array || raw instanceof Uint8ClampedArray) {
    for (let i = 0; i < raw.length; i++) out[i] = clamp((raw[i] - 128) / 128, -1, 1);
    return out;
  }
  return null;
}

async function renderWithSam(text) {
  const provider = await Promise.race([loadSamProvider(), timeout(LOAD_TIMEOUT_MS)]);
  if (!provider) return null;
  try {
    if (typeof provider.buf32 === 'function') {
      const samples = samplesFromSam(provider.buf32(text));
      if (samples) return { samples, sampleRate: SAM_RATE, provider: 'sam-js' };
    }
    if (typeof provider.buf8 === 'function') {
      const samples = samplesFromSam(provider.buf8(text));
      if (samples) return { samples, sampleRate: SAM_RATE, provider: 'sam-js' };
    }
  } catch (err) {
    console.warn('SAM dialog render failed; using local fallback.', err);
  }
  return null;
}

const CLUSTERS = [
  ['TH', 'th'], ['SH', 'sh'], ['CH', 'ch'], ['NG', 'ng'], ['OO', 'oo'],
  ['EE', 'ee'], ['EA', 'ee'], ['AI', 'ae'], ['AY', 'ae'], ['OI', 'oi'],
  ['OW', 'ow'], ['OU', 'ow'], ['ER', 'er'], ['AR', 'ar'], ['OR', 'or'],
];

const VOWELS = {
  A: 'ae', E: 'eh', I: 'ih', O: 'oh', U: 'uh', Y: 'ih',
};

const FORMANTS = {
  ae: [720, 1240, 2520], eh: [530, 1840, 2480], ih: [390, 1990, 2550],
  oh: [570, 840, 2410], uh: [440, 1020, 2240], oo: [300, 870, 2240],
  ee: [270, 2290, 3010], ow: [470, 760, 2420], oi: [430, 1260, 2600],
  er: [490, 1350, 1690], ar: [650, 1100, 2500], or: [500, 900, 2400],
  th: [700, 1800, 3200], sh: [520, 2100, 3600], ch: [650, 1800, 3000],
  ng: [300, 1200, 2500], n: [300, 1350, 2550], m: [280, 1200, 2400],
  s: [600, 2400, 4200], f: [500, 1800, 3400], h: [420, 1500, 2800],
  stop: [360, 1300, 2700],
};

function phonemeUnits(text) {
  const src = cleanText(text).toUpperCase();
  const units = [];
  for (let i = 0; i < src.length;) {
    const ch = src[i];
    if (/\s/.test(ch)) { units.push({ kind: 'pause', dur: 0.045 }); i++; continue; }
    if (/[,.!?;:]/.test(ch)) { units.push({ kind: 'pause', dur: /[.!?]/.test(ch) ? 0.19 : 0.105 }); i++; continue; }
    let matched = false;
    for (const [pat, ph] of CLUSTERS) {
      if (src.startsWith(pat, i)) {
        units.push({ kind: 'voice', ph, dur: 0.085 + (ph.length * 0.012) });
        i += pat.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    if (VOWELS[ch]) { units.push({ kind: 'voice', ph: VOWELS[ch], dur: 0.092 }); i++; continue; }
    if (/[MNRL]/.test(ch)) { units.push({ kind: 'voice', ph: ch === 'M' ? 'm' : 'n', dur: 0.065 }); i++; continue; }
    if (/[SZX]/.test(ch)) { units.push({ kind: 'noise', ph: 's', dur: 0.06 }); i++; continue; }
    if (/[FV]/.test(ch)) { units.push({ kind: 'noise', ph: 'f', dur: 0.055 }); i++; continue; }
    if (ch === 'H') { units.push({ kind: 'noise', ph: 'h', dur: 0.05 }); i++; continue; }
    if (/[BCDGJKPQTW]/.test(ch)) { units.push({ kind: 'voice', ph: 'stop', dur: 0.046 }); i++; continue; }
    i++;
  }
  return units.length ? units : [{ kind: 'pause', dur: 0.2 }];
}

function speakerSeed(speaker) {
  const s = String(speaker || 'sam');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function fallbackRender(text, { speaker } = {}) {
  const units = phonemeUnits(text);
  const seed = speakerSeed(speaker);
  const basePitch = 78 + seed * 42;
  const total = Math.max(1, Math.floor(units.reduce((n, u) => n + u.dur, 0) * SAM_RATE));
  const samples = new Float32Array(total);
  let p = 0;
  let rnd = Math.floor(seed * 2147483647) || 1;
  const noise = () => {
    rnd = (rnd * 48271) % 2147483647;
    return (rnd / 1073741823.5) - 1;
  };

  for (const u of units) {
    const len = Math.max(1, Math.floor(u.dur * SAM_RATE));
    const f = FORMANTS[u.ph] || FORMANTS.stop;
    for (let i = 0; i < len && p + i < samples.length; i++) {
      const t = i / SAM_RATE;
      // Half-sine attack/release reaches and sustains 1. The previous full-sine
      // used sin(PI*1), making every sample after the short attack exactly zero;
      // the offline fallback therefore had duration but effectively no sound.
      const a = Math.sin(Math.PI * 0.5 * clamp(i / Math.min(120, len), 0, 1))
        * Math.sin(Math.PI * 0.5 * clamp((len - 1 - i) / Math.min(180, len), 0, 1));
      if (u.kind === 'pause') {
        samples[p + i] = 0;
        continue;
      }
      const buzz = Math.sign(Math.sin(2 * Math.PI * (basePitch + Math.sin(t * 19) * 3) * t));
      const voiced = (
        Math.sin(2 * Math.PI * f[0] * t) * 0.58 +
        Math.sin(2 * Math.PI * f[1] * t) * 0.28 +
        Math.sin(2 * Math.PI * f[2] * t) * 0.14
      ) * buzz;
      const fric = noise() * (u.kind === 'noise' ? 0.85 : 0.18);
      samples[p + i] = clamp((voiced * 0.30 + fric * 0.18) * a, -0.65, 0.65);
    }
    p += len;
  }
  return { samples, sampleRate: SAM_RATE, provider: 'fallback' };
}

const renderCache = new Map();

export async function renderSamSamples(text, opts = {}) {
  const clean = cleanText(text);
  if (!clean) return { samples: new Float32Array(1), sampleRate: SAM_RATE, provider: 'silent' };
  const sam = await renderWithSam(clean);
  const key = `${sam ? 'sam' : 'fallback'}:${opts.speaker || ''}:${clean}`;
  if (renderCache.has(key)) return renderCache.get(key);
  const rendered = sam || fallbackRender(clean, opts);
  renderCache.set(key, rendered);
  if (renderCache.size > 96) renderCache.delete(renderCache.keys().next().value);
  return rendered;
}

// ── who is speaking, and through what ────────────────────────────────────────
// SAM gives us one voice. The characters are made by what the voice is heard
// THROUGH, which is the correct way round for a game about recording rooms:
//
//   me         you, out loud, now. The only person in this game who is not
//              heard through something: no glass, no channel, no tape. Dry,
//              wide, and close, because you are standing where the microphone
//              would be.
//   guard      a man behind glass, in a lit booth, at one in the morning
//   radio      band-limited to a channel, clipped, and slightly too loud
//   recordist  a man on a tape, with the tape's hiss and the tape's wobble
//   surfer     whatever is on the tape with him. Lower, and it does not stop
//              when it stops.
//
// `rate` is playbackRate, so it is pitch and pace at once, which is how a
// formant synth wants to be transposed anyway.
export const VOICE_PROFILES = {
  me: { rate: 1.0, gain: 1.0, hp: 90, lp: 6000 },
  // Sarah. Heard the way you hear someone you are straining to remember the
  // sound of: a little band-limited, a little far, a smear on the tail so it
  // does not quite land in the room with you. Never in front of him.
  sarah: { rate: 1.02, gain: 0.95, hp: 200, lp: 3400, smear: { time: 0.11, feedback: 0.30, mix: 0.35 } },
  guard: { rate: 1.0, gain: 1.0, hp: 190, lp: 3600 },
  radio: { rate: 0.94, gain: 1.15, hp: 420, lp: 2600, drive: 0.55, squelch: 0.012 },
  recordist: { rate: 0.98, gain: 0.95, hp: 120, lp: 5200, hiss: 0.010, wobble: 0.006 },
  surfer: { rate: 0.80, gain: 1.05, hp: 60, lp: 1500, smear: { time: 0.19, feedback: 0.42, mix: 0.5 } },
  client: { rate: 0.96, gain: 1.0, hp: 300, lp: 3000, drive: 0.3 },
  default: { rate: 1.0, gain: 1.0 },
};

export function profileFor(speaker) {
  return VOICE_PROFILES[speaker] || VOICE_PROFILES.default;
}

// A soft clip. Radios do not distort politely and neither does this.
function driveCurve(amount) {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = amount * 40;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

// Builds { input, output, extras } for a speaker. `extras` are continuous beds
// (tape hiss, radio squelch floor) that live as long as the line does.
function buildChain(ctx, speaker) {
  const p = profileFor(speaker);
  const input = ctx.createGain();
  let node = input;

  if (p.hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = p.hp; f.Q.value = 0.6; node.connect(f); node = f; }
  if (p.drive) { const s = ctx.createWaveShaper(); s.curve = driveCurve(p.drive); s.oversample = '2x'; node.connect(s); node = s; }
  if (p.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = p.lp; f.Q.value = 0.7; node.connect(f); node = f; }

  const output = ctx.createGain();
  output.gain.value = p.gain ?? 1;
  node.connect(output);

  // It does not stop when it stops.
  if (p.smear) {
    const dly = ctx.createDelay(1.0);
    dly.delayTime.value = p.smear.time;
    const fb = ctx.createGain();
    fb.gain.value = p.smear.feedback;
    const wet = ctx.createGain();
    wet.gain.value = p.smear.mix;
    node.connect(dly); dly.connect(fb); fb.connect(dly); dly.connect(wet); wet.connect(output);
  }

  return { input, output, profile: p };
}

// A bed of noise that runs for exactly as long as a line does: tape hiss under
// the recordist, a carrier floor under the radio.
function startBed(ctx, dest, level, lp) {
  const len = Math.floor(ctx.sampleRate * 1.5);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = lp;
  const g = ctx.createGain();
  g.gain.value = level;
  src.connect(f); f.connect(g); g.connect(dest);
  try { src.start(); } catch (_) { return null; }
  return { src, g, f };
}

export function createSamDialogVoice({ volume = 0.22, getAudio = null } = {}) {
  let ctx = null;
  let gain = null;
  let dest = null;
  let current = null;
  let seq = 0;
  let chains = new Map();

  function ensureContext() {
    const provided = typeof getAudio === 'function' ? getAudio() : null;
    if (provided?.ctx) {
      const nextCtx = provided.ctx;
      const nextDest = provided.destination || provided.bus || nextCtx.destination;
      if (ctx !== nextCtx || dest !== nextDest || !gain) {
        try { gain?.disconnect(); } catch (_) {}
        ctx = nextCtx;
        dest = nextDest;
        chains = new Map();
        gain = ctx.createGain();
        gain.gain.value = volume;
        gain.connect(dest);
      }
      return ctx;
    }
    if (ctx) return ctx;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    dest = ctx.destination;
    chains = new Map();
    gain = ctx.createGain();
    gain.gain.value = volume;
    gain.connect(dest);
    return ctx;
  }

  function chainFor(speaker) {
    const key = speaker || 'default';
    if (!chains.has(key)) {
      const c = buildChain(ctx, key);
      c.output.connect(gain);
      chains.set(key, c);
    }
    return chains.get(key);
  }

  function stopCurrent() {
    if (!current) return;
    current.stop();
    current = null;
  }

  function timerOnly(handle, duration) {
    handle.started = true;
    handle.startMs = performance.now();
    handle.duration = Math.max(0.08, duration);
  }

  function start(text, opts = {}) {
    stopCurrent();
    const clean = cleanText(text);
    const id = ++seq;
    const handle = {
      id,
      text: clean,
      source: null,
      started: false,
      ended: false,
      startTime: null,
      startMs: 0,
      duration: Math.max(0.25, clean.length / 13),
      progress() {
        if (this.ended) return 1;
        if (!this.started) return 0;
        const c = ctx;
        const elapsed = c && this.startTime != null && c.state === 'running'
          ? c.currentTime - this.startTime
          : (performance.now() - this.startMs) / 1000;
        return clamp(elapsed / Math.max(0.08, this.duration), 0, 1);
      },
      charsFor() {
        return Math.min(clean.length, Math.floor(clean.length * this.progress()));
      },
      done() {
        return this.ended || this.progress() >= 1;
      },
      finish() {
        this.ended = true;
        this.stop();
      },
      stop() {
        try { this.source?.stop(); } catch (_) {}
        try { this.source?.disconnect(); } catch (_) {}
        this.source = null;
        // The bed that ran under the line stops with it. Except the smear,
        // which is in the chain and is allowed to keep going.
        try { this.bed?.src.stop(); this.bed?.g.disconnect(); } catch (_) {}
        this.bed = null;
      },
    };
    current = handle;
    if (!clean) {
      timerOnly(handle, 0.08);
      return handle;
    }

    renderSamSamples(clean, opts).then(({ samples, sampleRate }) => {
      if (current !== handle || id !== seq || handle.ended) return;
      const c = ensureContext();
      if (!c) {
        timerOnly(handle, handle.duration);
        return;
      }
      try { c.resume?.(); } catch (_) {}
      try {
        const chain = chainFor(opts.speaker);
        const p = chain.profile;
        const buffer = c.createBuffer(1, samples.length, sampleRate);
        buffer.copyToChannel(samples, 0);
        const src = c.createBufferSource();
        src.buffer = buffer;
        const speed = clamp((Number(opts.rate) || 1) * (p.rate ?? 1), 0.35, 2.0);
        src.playbackRate.setValueAtTime(speed, c.currentTime);
        // Tape does not hold pitch. Neither does the man on it.
        if (p.wobble) {
          const lfo = c.createOscillator();
          const depth = c.createGain();
          lfo.frequency.value = 0.7 + Math.random() * 0.5;
          depth.gain.value = speed * p.wobble;
          lfo.connect(depth); depth.connect(src.playbackRate);
          lfo.start();
          src.onended = () => { try { lfo.stop(); lfo.disconnect(); depth.disconnect(); } catch (_) {} };
        }
        src.connect(chain.input);
        if (p.hiss) handle.bed = startBed(c, chain.output, p.hiss, 8000);
        else if (p.squelch) handle.bed = startBed(c, chain.output, p.squelch, 3000);
        const prevEnded = src.onended;
        src.onended = () => {
          prevEnded?.();
          handle.ended = true;
          try { handle.bed?.src.stop(); handle.bed?.g.disconnect(); } catch (_) {}
          handle.bed = null;
          if (current === handle) current = null;
        };
        handle.source = src;
        handle.duration = buffer.duration / speed;
        handle.started = true;
        handle.startTime = c.currentTime;
        handle.startMs = performance.now();
        src.start();
      } catch (_) {
        timerOnly(handle, handle.duration);
      }
    });
    return handle;
  }

  return {
    start,
    stop: stopCurrent,
    warm: () => { loadSamProvider(); },
  };
}

// A MOUTH SPEAKS; A MIND TYPES.
//
// `me` is the recordist talking out loud — to the guard, into the radio. `you`
// is the same man thinking, and thinking is typed, because nobody in the room
// can hear it. Stage directions are typed for the same reason: nobody is
// saying them. A stage direction read aloud by a robot is the game explaining
// itself, which is the one thing this game does not do.
export const VOICED = new Set(['me', 'guard', 'radio', 'recordist', 'surfer', 'client', 'sarah']);
export const isVoiced = (who) => VOICED.has(who);
