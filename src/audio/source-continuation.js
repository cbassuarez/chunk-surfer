// Physical contact and machinery, through the shared world SFX bus. Simulation
// events own impacts; friction and ratchets follow actual mechanical travel.
// No score, fetch bank, wall-clock scheduler or repeating proximity alarm.
export const SOURCE_CONTINUATION_AUDIO = Object.freeze({ maxVoices: 10, maxSources: 22, noiseSeconds: 1.93 });
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
const number = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const body = state => ({ x: number(state?.x), y: number(state?.feet) + .95, z: number(state?.z) });
const point = (v, fallback) => ({ x: number(v?.x, fallback.x), y: number(v?.y, fallback.y), z: number(v?.z, fallback.z) });

// Catch keeps the body's location but uses the overhead camera's north-up
// orientation. A stored first-person yaw cannot reverse its stereo image.
export function sourceContinuationPlacement(source, state = {}) {
  const listener = body(state), at = point(source, listener), yaw = state.phase === 'catch' ? 0 : number(state.yaw);
  const dx = at.x - listener.x, dy = at.y - listener.y, dz = at.z - listener.z;
  const horizontal = Math.hypot(dx, dz), distance = Math.hypot(dx, dy, dz);
  const front = horizontal > .01 ? (Math.sin(yaw) * dx - Math.cos(yaw) * dz) / horizontal : 1;
  return { distance, pan: clamp((dx * Math.cos(yaw) + dz * Math.sin(yaw)) / Math.max(1.5, horizontal) * .88, -.88, .88),
    gain: 1 / (1 + (distance / 10) ** 1.22), cutoff: clamp(6600 / (1 + distance / 19) - Math.max(0, -front) * 1500, 600, 6600) };
}

export function createSourceContinuationAudio({ getAudio = () => null } = {}) {
  let context = null, destination = null, noiseBuffer = null, mechanism = null, active = false, disposed = false;
  let listener = {}, lastBody = null, lastMachine = null, footTravel = 0, toothTravel = 0, lastFocus = null;
  let focusClock = -Infinity, clock = 0, eventCount = 0, played = 0, skipped = 0, footIndex = 0;
  let diagnostic = { phase: null, mode: 'silent', source: null, mix: null, mechanicalGain: 0, focus: null };
  const voices = new Set();
  function target(param, value, seconds = .055, immediate = false) {
    if (!param) return;
    if (!immediate && param.setTargetAtTime) param.setTargetAtTime(value, context.currentTime, seconds);
    else if (param.setValueAtTime) param.setValueAtTime(value, context.currentTime);
    else param.value = value;
  }
  function release(v) {
    if (!v || v.dead) return;
    v.dead = true;
    for (const source of v.sources) { source.onended = null; try { source.stop(context?.currentTime || 0); } catch {} }
    for (const node of v.nodes) try { node.disconnect(); } catch {}
    voices.delete(v);
  }
  function stop() {
    for (const v of [...voices]) release(v);
    mechanism = null; active = false; lastBody = lastMachine = lastFocus = null; footTravel = toothTravel = 0;
    diagnostic = { ...diagnostic, mode: 'silent', mechanicalGain: 0, focus: null };
  }
  function available() {
    if (disposed) return false;
    let pair; try { pair = getAudio(); } catch { stop(); return false; }
    if (!pair?.ctx || pair.ctx.state !== 'running' || !pair.destination) { stop(); return false; }
    if (context !== pair.ctx || destination !== pair.destination) {
      const changedContext = context !== pair.ctx; stop(); context = pair.ctx; destination = pair.destination;
      if (changedContext) noiseBuffer = null;
    }
    return typeof context.createBufferSource === 'function' && typeof context.createOscillator === 'function';
  }
  function noise() {
    if (noiseBuffer) return noiseBuffer;
    const rate = number(context.sampleRate, 48000), length = Math.max(2, Math.floor(rate * SOURCE_CONTINUATION_AUDIO.noiseSeconds));
    noiseBuffer = context.createBuffer(1, length, rate);
    const data = noiseBuffer.getChannelData(0); let seed = 0x28310719, previous = 0;
    for (let i = 0; i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      previous = previous * .28 + (seed / 0xffffffff * 2 - 1) * .72;
      data[i] = previous * Math.min(1, i / (rate * .006), (length - i - 1) / (rate * .006));
    }
    return noiseBuffer;
  }
  function sourceCount() { let count = 0; for (const voice of voices) count += voice.sources.length; return count; }
  function record(place, gain, kind) {
    const v = { sources: [], nodes: [], dead: false, place, gain, kind, until: Infinity };
    v.own = node => { v.nodes.push(node); return node; };
    v.amp = v.own(context.createGain()); v.lowpass = v.own(context.createBiquadFilter()); v.lowpass.type = 'lowpass';
    v.pan = context.createStereoPanner ? v.own(context.createStereoPanner()) : null;
    v.lowpass.connect(v.amp); if (v.pan) v.amp.connect(v.pan).connect(destination); else v.amp.connect(destination);
    voices.add(v); position(v, true); return v;
  }
  function position(v, immediate = false) {
    const mix = sourceContinuationPlacement(v.place, listener);
    target(v.amp.gain, v.gain * mix.gain, .065, immediate);
    target(v.lowpass.frequency, mix.cutoff, .07, immediate);
    if (v.pan) target(v.pan.pan, mix.pan, .06, immediate);
    v.mix = mix;
  }
  function layer(v, { hz = null, frequency = 1100, q = .8, gain = 1, duration = null, delay = 0, attack = .006, endHz = null } = {}) {
    const source = v.own(hz === null ? context.createBufferSource() : context.createOscillator());
    v.sources.push(source);
    if (hz === null) { source.buffer = noise(); source.loop = duration === null; }
    else { source.type = 'sine'; source.frequency.value = hz; }
    const filter = v.own(context.createBiquadFilter()), amp = v.own(context.createGain());
    filter.type = hz === null ? 'bandpass' : 'lowpass'; filter.frequency.value = frequency; if (filter.Q) filter.Q.value = q;
    source.connect(filter).connect(amp).connect(v.lowpass);
    const at = context.currentTime + delay;
    amp.gain.setValueAtTime(duration === null ? gain : .00001, context.currentTime);
    if (duration !== null) {
      amp.gain.setValueAtTime(.00001, at); amp.gain.exponentialRampToValueAtTime(Math.max(.00001, gain), at + attack);
      amp.gain.exponentialRampToValueAtTime(.00001, at + Math.max(attack + .005, duration));
      if (hz !== null && endHz !== null) source.frequency.exponentialRampToValueAtTime(endHz, at + duration);
      v.until = Math.max(Number.isFinite(v.until) ? v.until : 0, at + duration + .03);
    }
    source.start(at); if (duration !== null) source.stop(at + duration + .025);
    return { source, amp, filter };
  }
  function strike(place, gain, parts, kind) {
    // Input events can arrive before the first update. Reserve the one record
    // and two sources needed by the continuing mechanism in that ordering too.
    const reserve = mechanism ? 0 : 1;
    if (voices.size >= SOURCE_CONTINUATION_AUDIO.maxVoices - reserve || sourceCount() + parts.length > SOURCE_CONTINUATION_AUDIO.maxSources - reserve * 2) { skipped++; return false; }
    const v = record(place, gain, kind), layers = parts.map(part => layer(v, part)); let remaining = layers.length;
    for (const { source } of layers) source.onended = () => { if (--remaining === 0) release(v); };
    played++; return true;
  }
  function mechanismAt(state) {
    if (state.phase === 'catch') return point(state.counterweight, { x: -17.6, y: 3, z: -4.5 });
    return { x: 6, y: 3.65, z: number(state.closure?.frontZ, -4.5) };
  }
  function startMechanism(place) {
    const v = record(place, 0, 'mechanism');
    v.rub = layer(v, { frequency: 1150, q: 1.8, gain: .7 });
    v.resonance = layer(v, { hz: 93, frequency: 550, gain: .12 });
    return v;
  }
  function event(event, state = listener) {
    if (!available()) return false;
    listener = state || {}; const type = String(event?.type || '');
    const machine = mechanismAt(listener), here = body(listener);
    const place = point(event?.position || (Number.isFinite(event?.x) ? event : null),
      /^counterweight|^closure/.test(type) ? machine : type === 'door' && lastFocus ? point(lastFocus.position || lastFocus, here) : here);
    let gain, parts;
    if (type === 'closure-warning') {
      gain = .055; parts = [{ frequency: 2700, gain: .8, duration: .13 }, { hz: 118, endHz: 103, frequency: 800, gain: .65, duration: .95 }, { hz: 307, frequency: 1300, gain: .2, duration: .4 }];
    } else if (type === 'counterweight-lands') {
      gain = .065; parts = [{ frequency: 380, q: .5, duration: .2 }, { hz: 61, endHz: 48, frequency: 300, gain: .8, duration: .62 }, { hz: 181, frequency: 700, gain: .25, duration: .38 }];
    } else if (type === 'counterweight-lowering-warning') {
      gain = .047; parts = [{ frequency: 1850, q: 2.1, duration: .12 }, { hz: 231, endHz: 189, frequency: 1200, gain: .34, duration: .65 }, { frequency: 570, gain: .24, duration: .5, attack: .06 }];
    } else if (/^counterweight-(?:moves|return|rewind|hoist|traverse|lower|cycle|turn|strain|release)$/.test(type)) {
      gain = .032; parts = [{ frequency: 2350, q: 2, duration: .11 }, { hz: 393, endHz: 307, frequency: 1500, gain: .25, duration: .33 }];
    } else if (type === 'drop') {
      gain = .030; parts = [{ frequency: 1450, gain: .8, duration: .2, attack: .022 }, { hz: 276, endHz: 183, frequency: 800, gain: .18, duration: .26 }];
    } else if (type === 'land') {
      gain = .038; parts = [{ frequency: 320, q: .45, duration: .18 }, { hz: 84, endHz: 63, frequency: 340, gain: .7, duration: .29 }];
    } else if (type === 'capture') {
      gain = .042; parts = [{ frequency: event.reason === 'closing-front' ? 760 : 420, q: .5, duration: .27, attack: .014 }, { hz: 73, endHz: 51, frequency: 280, gain: .5, duration: .4 }];
    } else if (type === 'recovered') {
      gain = .020; parts = [{ frequency: 660, q: .45, duration: .42, attack: .07 }, { frequency: 1900, gain: .22, duration: .15 }];
    } else if (type === 'door' || type === 'return' || type === 'complete') {
      gain = .032; parts = [{ frequency: 2400, q: 1.2, duration: .065 }, { hz: event.open === false ? 153 : 167, endHz: 132, frequency: 700, gain: .2, duration: .38 }, { frequency: 630, gain: .35, duration: .48, attack: .035, delay: .04 }];
    } else if (type === 'phase') {
      gain = .023; parts = [{ frequency: 460, q: 2.8, duration: .9, attack: .07 }, { hz: 107, endHz: 93, frequency: 400, gain: .24, duration: 1.1, attack: .09 }];
    } else return false;
    eventCount++; return strike(place, gain, parts, type);
  }
  function update({ dt = 0, state, focus = null, paused = false, ready = false } = {}) {
    if (paused || !ready || !state || !available()) { stop(); return false; }
    active = true; listener = state;
    const delta = clamp(dt, 0, .25); clock += delta;
    for (const voice of [...voices]) if (voice !== mechanism && voice.until <= context.currentTime) release(voice);
    const place = mechanismAt(state), mode = state.phase === 'catch' ? state.counterweight?.active ? state.counterweight.mode || 'warning' : 'tension' : state.closure?.mode || 'dormant';
    mechanism ||= startMechanism(place); mechanism.place = place;
    const warning = mode === 'warning' || mode === 'lowering-warning';
    const winding = /hoist|return|rewind/.test(mode), lowering = mode === 'lowering';
    const moving = ['walking', 'closing', 'falling', 'hoisting', 'returning', 'rewinding', 'traversing', 'lowering'].includes(mode);
    const pulse = .5 + .5 * Math.sin(number(state.elapsed, clock) * (warning ? 3.2 : 9.1));
    let gain = mode === 'dormant' ? 0 : warning ? .007 + .002 * pulse : moving ? .015 + .003 * pulse : .0018;
    if (state.recovery) gain *= .42;
    mechanism.gain = gain;
    target(mechanism.rub.filter.frequency, mode === 'rewinding' ? 2300 : winding ? 1720 : mode === 'traversing' ? 2050 : mode === 'falling' || lowering ? 760 : mode === 'closing' ? 440 : 1190);
    target(mechanism.resonance.source.frequency, mode === 'rewinding' ? 173 : winding ? 147 : mode === 'traversing' ? 121 : mode === 'closing' ? 78 : lowering ? 87 : 93);
    for (const voice of voices) position(voice);
    if (lastMachine?.phase === state.phase && moving) {
      const travel = Math.hypot(place.x - lastMachine.x, place.y - lastMachine.y, place.z - lastMachine.z);
      if (travel < 1.6) toothTravel += travel; else toothTravel = 0;
      if (toothTravel > .64) {
        toothTravel %= .64;
        strike(place, .021, [{ frequency: winding || mode === 'traversing' ? 3100 : 2150, q: 2.1, duration: .055 }, { hz: 387, frequency: 1200, gain: .22, duration: .12 }], 'ratchet');
      }
    } else toothTravel = 0;
    lastMachine = { ...place, phase: state.phase };
    const here = body(state), hadBody = lastBody?.phase === state.phase;
    if (hadBody && !state.fall && !state.recovery && !state.reveal) {
      const travel = Math.hypot(here.x - lastBody.x, here.z - lastBody.z);
      if (travel < 1.3) footTravel += travel; else footTravel = 0;
      if (footTravel >= .92) {
        footTravel %= .92; footIndex++;
        strike({ ...here, y: number(state.feet), x: here.x + (footIndex % 2 ? -.11 : .11) }, .019,
          [{ frequency: state.phase === 'catch' ? 430 : state.feet > 2.7 ? 650 : 310, q: .5, duration: .095 }, { hz: footIndex % 2 ? 91 : 97, endHz: 66, frequency: 300, gain: .28, duration: .13 }], 'footstep');
      }
    } else footTravel = 0;
    lastBody = { ...here, phase: state.phase };
    if (hadBody && focus && !state.fall && !state.recovery && !state.reveal && focus.id !== lastFocus?.id && clock - focusClock > 1.4) {
      const at = point(focus.position || focus, here), drop = focus.type === 'drop';
      strike(at, drop ? .014 : .017, drop
        ? [{ frequency: 1380, q: .6, duration: .18, attack: .03 }]
        : [{ frequency: 2300, q: 2, duration: .045 }, { hz: 427, endHz: 373, frequency: 1500, gain: .22, duration: .18 }], drop ? 'edge-contact' : 'handle-contact');
      focusClock = clock;
    }
    lastFocus = focus;
    diagnostic = { phase: state.phase, mode, source: { ...place }, mix: { ...mechanism.mix }, mechanicalGain: gain, focus: focus?.id || null };
    return true;
  }
  return { event, update, pause: stop, stop,
    dispose() { stop(); disposed = true; noiseBuffer = null; },
    snapshot: () => ({ active, voices: voices.size, sources: sourceCount(), events: eventCount, played, skipped, kind: 'source-continuation',
      ...diagnostic, layers: [...voices].map(v => ({ kind: v.kind, source: { ...v.place }, mix: { ...v.mix }, gain: v.gain })) }),
  };
}
