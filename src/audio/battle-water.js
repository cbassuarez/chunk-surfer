// Procedural water for the Natatorium fight. No sample fetch, decoder burst or
// world-noise emission: this is a bounded presentation rig owned by one combat
// scene and torn down with it.

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value) || 0));

function safeStop(node) {
  try { node?.stop?.(); } catch (_) { /* already stopped */ }
  try { node?.disconnect?.(); } catch (_) { /* already disconnected */ }
}

export function createBattleWaterAudio({ enabled = false, getAudio = null, random = Math.random } = {}) {
  let ctx = null;
  let destination = null;
  let surface = null;
  let pressure = null;
  let stopped = false;
  let phase = 'dry';
  let serial = -1;
  let surfaceBreathSerial = -1;
  let wetExperienced = false;
  const transients = new Set();
  const events = [];

  function audio() {
    if (!enabled || stopped) return null;
    const provided = typeof getAudio === 'function' ? getAudio() : null;
    if (!provided?.ctx) return null;
    ctx = provided.ctx;
    destination = provided.destination || provided.bus || ctx.destination;
    return ctx && destination ? { ctx, destination } : null;
  }

  function noiseBuffer(seconds = 1.5) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let low = 0;
    for (let index = 0; index < length; index += 1) {
      low = low * .91 + (random() * 2 - 1) * .09;
      data[index] = low;
    }
    return buffer;
  }

  function makeBed({ type, hz, q, gain }) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = hz;
    filter.Q.value = q;
    const level = ctx.createGain();
    level.gain.value = gain;
    src.connect(filter);
    filter.connect(level);
    level.connect(destination);
    src.start();
    return { src, filter, gain: level };
  }

  function ensureBeds() {
    if (!audio()) return false;
    if (!surface) surface = makeBed({ type: 'bandpass', hz: 480, q: .52, gain: 0 });
    if (!pressure) pressure = makeBed({ type: 'lowpass', hz: 240, q: .72, gain: 0 });
    return true;
  }

  function ramp(param, target, seconds = .25) {
    const at = Number(ctx?.currentTime) || 0;
    try {
      param.cancelScheduledValues(at);
      param.setValueAtTime(Math.max(.0001, Number(param.value) || .0001), at);
      param.linearRampToValueAtTime(Math.max(.0001, target), at + Math.max(.02, seconds));
    } catch (_) { param.value = target; }
  }

  function burst({ hz = 520, gain = .11, seconds = .2, pan = 0, lowpass = false } = {}) {
    if (!audio()) return false;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(Math.max(.08, seconds));
    const filter = ctx.createBiquadFilter();
    filter.type = lowpass ? 'lowpass' : 'bandpass';
    filter.frequency.value = hz;
    filter.Q.value = lowpass ? .65 : .9;
    const level = ctx.createGain();
    const at = ctx.currentTime;
    level.gain.setValueAtTime(.0001, at);
    level.gain.linearRampToValueAtTime(gain, at + .012);
    level.gain.exponentialRampToValueAtTime(.0001, at + seconds);
    src.connect(filter);
    let out = filter;
    let panner = null;
    if (ctx.createStereoPanner) {
      panner = ctx.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      filter.connect(panner);
      out = panner;
    }
    out.connect(level);
    level.connect(destination);
    const voice = { src, filter, panner, gain: level };
    transients.add(voice);
    src.onended = () => {
      transients.delete(voice);
      for (const node of [src, filter, panner, level]) {
        try { node?.disconnect?.(); } catch (_) {}
      }
    };
    try { src.start(at); src.stop(at + seconds + .02); } catch (_) { return false; }
    return true;
  }

  function phaseEdge(next, snapshot) {
    events.push({ kind: 'phase', phase: next, serial: snapshot?.serial ?? serial });
    if (next === 'half') {
      wetExperienced = true;
      if (!ensureBeds()) return;
      ramp(surface.gain.gain, .052, .45);
      ramp(pressure.gain.gain, .008, .45);
      burst({ hz: 620, gain: .16, seconds: .34, pan: -.18 });
    } else if (next === 'full') {
      wetExperienced = true;
      if (!ensureBeds()) return;
      ramp(surface.gain.gain, .018, .5);
      ramp(pressure.gain.gain, .078, .65);
      burst({ hz: 360, gain: .22, seconds: .62, lowpass: true });
      burst({ hz: 980, gain: .075, seconds: .28, pan: .22 });
    } else if (next === 'dry' && (surface || pressure)) {
      const wasWet = phase !== 'dry';
      ramp(surface.gain.gain, 0, .72);
      ramp(pressure.gain.gain, 0, .9);
      if (wasWet) {
        burst({ hz: 760, gain: .12, seconds: .48, pan: .12 });
      }
    }
  }

  function setPhase(snapshot = {}) {
    if (!enabled || stopped || !snapshot.enabled) return snapshot;
    const next = snapshot.targetPhase || snapshot.phase || 'dry';
    if (snapshot.serial !== serial) {
      serial = snapshot.serial;
      phaseEdge(next, snapshot);
    }
    phase = snapshot.phase || next;
    if (wetExperienced && next === 'dry' && snapshot.settled && surfaceBreathSerial !== snapshot.serial) {
      surfaceBreathSerial = snapshot.serial;
      events.push({ kind:'breath', phase:'dry', serial:snapshot.serial });
      burst({ hz:1250, gain:.055, seconds:.22, pan:-.08 });
    }
    return snapshot;
  }

  function impact({ received = 0, parried = false } = {}, snapshot = {}) {
    if (!enabled || stopped || snapshot.wetMix <= .001) return false;
    events.push({ kind: parried ? 'parry' : 'impact', phase: snapshot.targetPhase, received: Math.max(0, Number(received) || 0) });
    if (snapshot.targetPhase === 'half') {
      return burst({ hz: parried ? 920 : 620, gain: parried ? .08 : .11, seconds: .2, pan: parried ? .28 : -.2 });
    }
    return burst({ hz: parried ? 1080 : 330, gain: parried ? .09 : .15, seconds: parried ? .22 : .34, pan: parried ? .32 : -.12, lowpass: !parried });
  }

  function stop() {
    if (stopped) return false;
    stopped = true;
    for (const bed of [surface, pressure]) {
      safeStop(bed?.src);
      for (const node of [bed?.filter, bed?.gain]) {
        try { node?.disconnect?.(); } catch (_) {}
      }
    }
    surface = null;
    pressure = null;
    for (const voice of [...transients]) safeStop(voice.src);
    transients.clear();
    return true;
  }

  function snapshot() {
    return Object.freeze({ enabled: !!enabled, phase, serial, stopped, activeBeds: [surface, pressure].filter(Boolean).length, activeTransients: transients.size, events: events.map((event) => ({ ...event })) });
  }

  return Object.freeze({ setPhase, impact, stop, snapshot });
}
