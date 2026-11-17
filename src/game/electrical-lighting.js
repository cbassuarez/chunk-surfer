// Normalized supply envelopes, not sampled AC carriers. All timestamps are
// seconds on the caller's clock; querying a frame never advances any state.
export const ELECTRICAL_PHASES = Object.freeze({ sp01: 'A', sp02: 'B', sp03: 'C', sp04: 'A', sp05: 'B' });
export const QUAKE_FLICKER = 'mmamamamaamamamammmaamamamamaaammmama';
const WINDOW = 120;
const clamp = (v, lo = 0, hi = 1.6) => Math.max(lo, Math.min(hi, v));
const seconds = v => Number.isFinite(v) ? Math.max(0, v) : 0;
const hash = value => {
  let h = 2166136261;
  for (const c of String(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const randomFrom = value => {
  let s = hash(value) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
};
const freezeSteps = steps => Object.freeze(steps.map(s => Object.freeze(s)));
function atStep(steps, t) {
  let lo = 0, hi = steps.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (steps[mid].at <= t) lo = mid + 1; else hi = mid; }
  return steps[lo - 1] || null;
}

export function lightstyleAt(pattern = QUAKE_FLICKER, timeSec = 0, { hz = 10, offset = 0 } = {}) {
  if (typeof pattern !== 'string' || !/^[a-z]+$/.test(pattern) || !Number.isFinite(hz) || hz <= 0) return 1;
  const tick = Math.floor(seconds(timeSec) * hz) + (Number.isFinite(offset) ? Math.floor(offset) : 0);
  const index = ((tick % pattern.length) + pattern.length) % pattern.length;
  return (pattern.charCodeAt(index) - 97) / 12;
}

// Irregular durations are generated once per bout, with real quiet between
// bouts. Repeated sampling has no random calls and never eases the output.
export function createContactBurst({ seed = 'contact', start = 0, count = null } = {}) {
  const random = randomFrom(seed), steps = [];
  let t = seconds(start);
  const cuts = Number.isFinite(count) ? Math.max(1, Math.min(24, Math.floor(count))) : 3 + Math.floor(random() * 5);
  for (let i = 0; i < cuts; i++) {
    steps.push({ at: t, level: random() < .85 ? 0 : .12 + random() * .2 });
    t += .023 + random() ** 2 * .15;
    steps.push({ at: t, level: 1 });
    t += .019 + random() ** 2 * .21;
  }
  return freezeSteps(steps);
}

// Explicit faults can be directed by a scene or a review. Automatic atmosphere
// never creates a permanent lockout or changes the saved breaker positions.
export function createPowerFault({ type = 'sag', start = 0, duration = 1, circuit = null, phase = null,
  seed = 'fault', intervals = [.85, 2.7], closedSeconds = .12, lockout = false } = {}) {
  const begin = seconds(start), length = Number.isFinite(duration) && duration > 0 ? duration : 1;
  let steps;
  switch (type) {
    case 'contact': steps = createContactBurst({ seed, start: begin }); break;
    case 'phase-loss':
    case 'outage': steps = [{ at: begin, level: 0 }, { at: begin + length, level: 1 }]; break;
    case 'swell': steps = [{ at: begin, level: 1.23 }, { at: begin + length * .15, level: 1.12 },
      { at: begin + length * .62, level: 1.04 }, { at: begin + length, level: 1 }]; break;
    case 'neutral': steps = [.18, .26, .11, .22].map((n, i) => ({ at: begin + length * i / 4,
      level: 1, phases: Object.freeze({ A: 1 + n, B: 1 - n * 1.3, C: .99 }) }));
      steps.push({ at: begin + length, level: 1 }); break;
    case 'recloser': {
      steps = [{ at: begin, level: 0 }];
      let t = begin;
      const delays = Array.isArray(intervals) && intervals.length && intervals.every(v => Number.isFinite(v) && v > 0)
        ? intervals.slice(0, 4) : [.85, 2.7];
      const hold = Number.isFinite(closedSeconds) && closedSeconds > 0 ? closedSeconds : .12;
      delays.forEach((delay, i) => {
        t += delay; steps.push({ at: t, level: 1 });
        if (i < delays.length - 1 || lockout) { t += hold; steps.push({ at: t, level: 0 }); }
      });
      break;
    }
    case 'sag': steps = [{ at: begin, level: .52 }, { at: begin + length * .08, level: .68 },
      { at: begin + length * .24, level: .81 }, { at: begin + length * .5, level: .92 },
      { at: begin + length * .8, level: .97 }, { at: begin + length, level: 1 }]; break;
    default: throw new Error(`Unknown electrical fault: ${type}`);
  }
  return Object.freeze({ type, circuit, phase: phase || (type === 'phase-loss' ? 'B' : null), steps: freezeSteps(steps) });
}

export function samplePowerSupply(faults = [], timeSec = 0, { circuit = null, phase = ELECTRICAL_PHASES[circuit] || 'A' } = {}) {
  const t = seconds(timeSec);
  let voltage = 1, fault = null;
  for (const event of faults) {
    if (event.circuit && event.circuit !== circuit || event.phase && event.phase !== phase) continue;
    const step = atStep(event.steps, t);
    const level = step ? step.phases?.[phase] ?? step.level : 1;
    voltage *= level;
    if (level !== 1) fault = event.type;
  }
  return { voltage: clamp(voltage), phase, fault };
}

function lampValue(segment, t) {
  if (!segment) return 1;
  if (!segment.tau || t - segment.at > .5) return segment.level;
  return segment.level + (segment.from - segment.level) * Math.exp(-(t - segment.at) / segment.tau);
}

// Compile threshold crossings and restart attempts rather than stepping a
// simulation once per rendered frame. Arc/driver changes remain discontinuous.
export function compileLampResponse(voltageSteps, { lamp = 'fluorescent', seed = 'lamp' } = {}) {
  const out = [], random = randomFrom(seed);
  let warm = true, running = true, previousVoltage = 1, lowSince = null, pending = [];
  const emit = (at, level, extra = {}) => {
    const next = { at, level, ...extra };
    if (out.at(-1)?.at === at) out[out.length - 1] = next;
    else out.push(next);
  };
  const flush = until => {
    while (pending.length && pending[0].at <= until) {
      const cue = pending.shift();
      if (cue.action === 'cold') warm = false;
      else { if (cue.action === 'ready') { warm = true; running = true; } if (cue.action === 'off') running = false; emit(cue.at, cue.level); }
    }
  };
  for (const input of voltageSteps) {
    const { at, level: voltage } = input;
    flush(at);
    if (lamp === 'incandescent') {
      const level = clamp(voltage ** 3.4), from = lampValue(out.at(-1), at);
      emit(at, level, { from, tau: level > from ? .018 : .045 });
    } else if (lamp === 'led') {
      if (voltage < .5) {
        lowSince ??= at;
        if (running) pending = [{ at: lowSince + .06, level: 0, action: 'off' }];
        else pending = [];
      } else {
        lowSince = null;
        if (running) { pending = []; emit(at, 1); }
        else if (voltage >= .62 && !pending.length) pending = [{ at: at + .16, level: 1, action: 'ready' }];
        else if (voltage < .62) pending = [];
      }
    } else if (lamp === 'fluorescent') {
      if (voltage < .68) {
        if (previousVoltage >= .68) lowSince = at;
        lowSince ??= at;
        emit(at, 0);
        pending = warm ? [{ at: Math.max(at, lowSince + .18), action: 'cold' }] : [];
      } else {
        lowSince = null;
        if (warm) { pending = []; emit(at, voltage < .86 ? .74 : 1); }
        else if (voltage >= .86 && !pending.some(cue => cue.action === 'ready')) {
          pending = [];
          let age = .08 + random() * .09;
          const attempts = 3 + Math.floor(random() * 3);
          for (let attempt = 0; attempt < attempts; attempt++) {
            pending.push({ at: at + age, level: 1 }); age += .022 + random() * .065;
            pending.push({ at: at + age, level: .015 }); age += .1 + random() * .18;
          }
          pending.push({ at: at + age + .15, level: 1, action: 'ready' });
          emit(at, .015);
        } else if (voltage < .86) { pending = []; emit(at, 0); }
      }
    } else throw new Error(`Unknown lamp response: ${lamp}`);
    previousVoltage = voltage;
  }
  flush(Infinity);
  return freezeSteps(out);
}

export function sampleLampResponse(program, timeSec = 0) {
  const t = seconds(timeSec);
  return clamp(lampValue(atStep(program, t), t));
}

function localSteps(profile, seed, begin) {
  if (!profile.fault) return [];
  const random = randomFrom(`${seed}:quiet`), steps = [];
  const quiet = Array.isArray(profile.quiet) && profile.quiet.length === 2
    && profile.quiet.every(v => Number.isFinite(v) && v > 0) && profile.quiet[1] >= profile.quiet[0]
    ? profile.quiet : [18, 42];
  let t = begin + 6 + random() * 8;
  while (t < begin + WINDOW - 8) {
    const burst = createContactBurst({ seed: `${seed}:${t}`, start: t });
    steps.push(...burst);
    t = burst.at(-1).at + quiet[0] + random() * (quiet[1] - quiet[0]);
  }
  return steps;
}

export function createElectricalLighting({ seed = 'ellery-grid', automatic = true, faults = [] } = {}) {
  const cache = new Map(), supplyCache = new Map();
  let directed = [...faults];
  function supplies(window) {
    if (supplyCache.has(window)) return supplyCache.get(window);
    const events = [...directed], begin = window * WINDOW;
    if (automatic) {
      for (const circuit of Object.keys(ELECTRICAL_PHASES)) {
        const random = randomFrom(`${seed}:${window}:${circuit}`);
        events.push(createPowerFault({ type: random() < .85 ? 'sag' : 'swell', circuit,
          start: begin + 14 + random() * 76, duration: .6 + random() * .6 }));
      }
      const random = randomFrom(`${seed}:${window}:feeder`);
      if (random() < .06) events.push(createPowerFault({ type: 'recloser', start: begin + 40 + random() * 30 }));
      else if (random() < .12) events.push(createPowerFault({ type: 'phase-loss', phase: ['A', 'B', 'C'][Math.floor(random() * 3)],
        start: begin + 40 + random() * 30, duration: .7 + random() * .6 }));
    }
    supplyCache.set(window, events);
    if (supplyCache.size > 3) supplyCache.delete(supplyCache.keys().next().value);
    return events;
  }
  function compile(light, window) {
    const profile = light.electrical || {}, begin = window * WINDOW;
    const phase = profile.phase || ELECTRICAL_PHASES[light.circuit] || 'A';
    const grid = light.powerMode === 'circuit';
    const events = grid ? supplies(window) : [];
    const local = localSteps(profile, `${seed}:${window}:${light.id}`, begin);
    const edges = new Set([Math.max(0, begin - 5)]);
    for (const event of events) for (const step of event.steps) if (step.at >= begin - 5 && step.at <= begin + WINDOW) edges.add(step.at);
    if (profile.fault === 'contact') for (const step of local) edges.add(step.at);
    const scope = { circuit: light.circuit, phase };
    const input = [...edges].sort((a, b) => a - b).map(at => ({ at,
      level: samplePowerSupply(events, at, scope).voltage * (profile.fault === 'contact' ? atStep(local, at)?.level ?? 1 : 1) }));
    return { phase, events, local, lamp: compileLampResponse(input, { lamp: profile.lamp, seed: `${seed}:${light.id}` }) };
  }
  return {
    sample(light, timeSec = 0, { effectsMode = 'full', powered = true } = {}) {
      const profile = light.electrical;
      const phase = profile?.phase || ELECTRICAL_PHASES[light.circuit] || null;
      if (!powered || !profile || effectsMode !== 'full') return { power: powered ? 1 : 0, voltage: powered ? 1 : 0,
        phase, fault: null, color: light.color };
      const t = seconds(timeSec), window = Math.floor(t / WINDOW), key = `${window}:${light.id}`;
      let program = cache.get(key);
      if (!program) {
        program = compile(light, window); cache.set(key, program);
        if (cache.size > 192) cache.delete(cache.keys().next().value);
      }
      const supply = samplePowerSupply(program.events, t, { circuit: light.circuit, phase: program.phase });
      const local = atStep(program.local, t)?.level ?? 1;
      let power = sampleLampResponse(program.lamp, t);
      if (profile.fault === 'ballast') power *= local;
      if (profile.style) power *= lightstyleAt(profile.style, t, { hz: profile.hz ?? 10, offset: hash(light.id) });
      power = clamp(power);
      const warmth = profile.lamp === 'incandescent' ? (1 - Math.min(1, power)) * .65 : 0;
      return { power, ...supply, phase: light.powerMode === 'circuit' ? program.phase : null,
        voltage: supply.voltage * (profile.fault === 'contact' ? local : 1),
        fault: local !== 1 ? profile.fault : supply.fault,
        color: warmth ? light.color.map((v, i) => v + ([1, .56, .24][i] - v) * warmth) : light.color };
    },
    setFaults(next = []) { directed = [...next]; cache.clear(); supplyCache.clear(); },
  };
}

const systems = new Map();
export function electricalLightingFor(seed = 'ellery-grid') {
  const key = String(seed);
  if (!systems.has(key)) {
    systems.set(key, createElectricalLighting({ seed: key }));
    if (systems.size > 4) systems.delete(systems.keys().next().value);
  }
  return systems.get(key);
}
