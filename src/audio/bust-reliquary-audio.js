// Short physical contacts for the Bronze Reliquary. The performance controller
// supplies every cue; Web Audio schedules only the tail of a contact already
// reached in scene time. Pausing cancels those tails rather than running a
// second ceremony clock.

const clamp = (value, lo, hi, fallback = 0) => Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : fallback));
const hash = text => {
  let seed = 2166136261;
  for (let i = 0; i < text.length; i++) seed = Math.imul(seed ^ text.charCodeAt(i), 16777619);
  return seed >>> 0;
};
const PROFILES = Object.freeze({
  'shutter-left-unlock': { tone: [910, 1517, 2430], duration: .16, noise: .08, filter: 1900 },
  'shutter-right-unlock': { tone: [855, 1463, 2360], duration: .18, noise: .08, filter: 1800 },
  'eye-left-seat': { tone: [265, 492, 1183], duration: .24, noise: .12, filter: 950 },
  'eye-right-seat': { tone: [247, 465, 1121], duration: .25, noise: .12, filter: 900 },
  'case-eye-knock': { tone: [173, 357, 811], duration: .2, noise: .08, filter: 720, double: true },
  'neck-takes-weight': { tone: [72, 149, 417], duration: .5, noise: .4, filter: 390, friction: true },
  'neck-locks': { tone: [213, 451, 997], duration: .24, noise: .12, filter: 920 },
  'seal-contact': { tone: [391, 721], duration: .18, noise: .16, filter: 1250, cloth: true },
  'seal-depresses': { tone: [181, 377, 802], duration: .35, noise: .27, filter: 560, friction: true },
  'linkage-takes-weight': { tone: [77, 163, 463], duration: .5, noise: .42, filter: 430, friction: true },
  'bearing-turns': { tone: [61, 131, 389], duration: .65, noise: .6, filter: 340, friction: true },
  'bearing-locks': { tone: [196, 419, 933], duration: .3, noise: .13, filter: 840 },
});

function noiseBuffer(ctx, seconds, seed) {
  const buffer = ctx.createBuffer(1, Math.max(1, Math.ceil(ctx.sampleRate * seconds)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let value = seed || 1, previous = 0;
  for (let i = 0; i < data.length; i++) {
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    const white = ((value >>> 0) / 4294967295) * 2 - 1;
    // Slightly correlated grain avoids a harsh white-noise spray at contact.
    previous = previous * .42 + white * .58;
    data[i] = previous;
  }
  return buffer;
}

function envelope(param, now, duration, level, attack = .004) {
  param.setValueAtTime(0, now);
  param.linearRampToValueAtTime(level, now + attack);
  param.exponentialRampToValueAtTime(.00001, now + duration);
}

export function createBustReliquaryAudio({ getAudio = () => null } = {}) {
  const voices = new Set(), playedReceipts = new Set();
  let disposed = false, suspended = false, played = 0, errors = 0, lastCue = null, lastPan = 0, lastContext = null;

  function cancelVoice(voice) {
    if (!voices.has(voice)) return;
    voices.delete(voice);
    for (const node of voice.sources) {
      node.onended = null;
      try { node.stop(); } catch (_) { /* Already-ended contact. */ }
    }
    for (const node of voice.nodes) try { node.disconnect(); } catch (_) { /* Closed audio graph. */ }
  }

  function suspend() {
    suspended = true;
    for (const voice of [...voices]) cancelVoice(voice);
  }

  function contact(ctx, destination, cue, options) {
    const profile = PROFILES[cue.id];
    if (!profile) return false;
    const panInput = typeof options.pan === 'function' ? options.pan(cue) : options.pan;
    const gainInput = typeof options.gain === 'function' ? options.gain(cue) : options.gain;
    const distanceInput = typeof options.distance === 'function' ? options.distance(cue) : options.distance;
    const pan = clamp(panInput, -1, 1), distance = clamp(distanceInput, 0, 1000);
    const level = clamp(gainInput, 0, 2, 1) / (1 + (distance / 8) ** 2);
    if (level <= 0) return false;
    const now = ctx.currentTime, duration = profile.duration;
    const voice = { sources: [], nodes: [], pending: 0 };
    const master = ctx.createGain();
    master.gain.setValueAtTime(.18 * level, now);
    voice.nodes.push(master);
    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(pan, now);
      master.connect(panner); panner.connect(destination); voice.nodes.push(panner);
    } else master.connect(destination);
    const register = (source, nodes, end) => {
      voice.sources.push(source); voice.nodes.push(source, ...nodes); voice.pending++;
      source.onended = () => {
        if (!voices.has(voice)) return;
        voice.pending--;
        if (voice.pending === 0) {
          voices.delete(voice);
          for (const node of voice.nodes) try { node.disconnect(); } catch (_) { /* Context closed. */ }
        }
      };
      source.start(now); source.stop(now + end + .015);
    };
    voices.add(voice);
    try {
      profile.tone.forEach((frequency, i) => {
        const oscillator = ctx.createOscillator(), gain = ctx.createGain();
        oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, now);
        oscillator.connect(gain); gain.connect(master);
        const toneLevel = (profile.friction ? .13 : .55) / (1 + i * 1.1);
        envelope(gain.gain, now, duration * (1 - i * .13), toneLevel);
        if (profile.double) {
          gain.gain.setValueAtTime(.00001, now + .052);
          gain.gain.linearRampToValueAtTime(toneLevel * .58, now + .058);
          gain.gain.exponentialRampToValueAtTime(.00001, now + duration);
        }
        register(oscillator, [gain], duration);
      });
      const noise = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), noiseGain = ctx.createGain();
      noise.buffer = noiseBuffer(ctx, duration + .02, hash(`${cue.phase || ''}:${cue.id}`));
      filter.type = profile.cloth ? 'lowpass' : 'bandpass';
      filter.frequency.setValueAtTime(profile.filter, now);
      filter.Q.setValueAtTime(profile.friction ? .6 : .9, now);
      noise.connect(filter); filter.connect(noiseGain); noiseGain.connect(master);
      envelope(noiseGain.gain, now, duration, profile.noise, profile.friction ? .035 : .005);
      register(noise, [filter, noiseGain], duration);
      lastPan = pan;
      return true;
    } catch (error) {
      cancelVoice(voice);
      throw error;
    }
  }

  function play(cues, options = {}) {
    if (disposed || !Array.isArray(cues) || !cues.length) return { played: 0, skipped: Array.isArray(cues) ? cues.length : 0 };
    let audio;
    try { audio = getAudio(); } catch (_) { errors++; return { played: 0, skipped: cues.length }; }
    const ctx = audio?.ctx, destination = audio?.destination ?? ctx?.destination;
    if (!ctx || !destination || ctx.state === 'closed' || ctx.state === 'suspended') return { played: 0, skipped: cues.length };
    if (lastContext && lastContext !== ctx) suspend();
    lastContext = ctx;
    suspended = false;
    let count = 0;
    for (const cue of cues) {
      if (!cue || !PROFILES[cue.id]) continue;
      const receipt = cue.receipt || `${cue.phase || 'contact'}:${cue.id}`;
      if (playedReceipts.has(receipt)) continue;
      try {
        if (!contact(ctx, destination, cue, options)) continue;
        playedReceipts.add(receipt);
        // The controller has fewer than twenty receipts; keep malformed caller
        // input from making this optional protection grow for an entire run.
        if (playedReceipts.size > 128) playedReceipts.delete(playedReceipts.values().next().value);
        count++; played++; lastCue = cue.id;
      } catch (_) { errors++; }
    }
    return { played: count, skipped: cues.length - count };
  }

  function dispose() { suspend(); disposed = true; playedReceipts.clear(); }
  function snapshot() { return { played, voices: voices.size, lastCue, lastPan, suspended, disposed, errors, contextState: lastContext?.state ?? null }; }
  return { play, suspend, dispose, snapshot };
}
