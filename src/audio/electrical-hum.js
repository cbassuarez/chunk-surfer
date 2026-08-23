import { POWER_CIRCUIT, POWER_CIRCUIT_IDS, livePowerCircuits, powerCircuitDefinition } from '../game/conservatory-power.js';

// Audible ballast clusters, in authored building metres. These are not sound
// events and never enter the HUSH noise envelope: they are continuous room tone.
const ELECTRICAL_HUM_LAYOUT = Object.freeze({
  [POWER_CIRCUIT.SP01]: Object.freeze([
    Object.freeze({ id: 'sp01-plant', x: 37.2, z: 30.0, radius: 20, gain: .28 }),
  // In B2, where the wing's lit fitting is. It used to sit at z:41, which is off
  // the south edge of the authored sub-basement entirely — the wing's own hum
  // was emitting from solid rock and only ever clipped the far side of room 5.
    Object.freeze({ id: 'sp01-dance', x: 32.0, z: 16.0, radius: 13, gain: .20 }),
  ]),
  [POWER_CIRCUIT.SP02]: Object.freeze([Object.freeze({ id: 'sp02-pool', x: 91.5, z: 42.0, radius: 24, gain: .25 })]),
  [POWER_CIRCUIT.SP03]: Object.freeze([Object.freeze({ id: 'sp03-foh', x: 92.0, z: 15.5, radius: 21, gain: .23 })]),
  [POWER_CIRCUIT.SP04]: Object.freeze([Object.freeze({ id: 'sp04-practice', x: 56.0, z: 43.5, radius: 27, gain: .22 })]),
  [POWER_CIRCUIT.SP05]: Object.freeze([Object.freeze({ id: 'sp05-academic', x: 59.5, z: 39.5, radius: 30, gain: .22 })]),
});

export const ELECTRICAL_HUM_SOURCES = Object.freeze(POWER_CIRCUIT_IDS.flatMap((circuit)=>(
  ELECTRICAL_HUM_LAYOUT[circuit]||[]
).map((source)=>Object.freeze({...source,circuit}))));

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function electricalHumAt(power, listener, {
  occlusionDb = null,
  minAudible = .008,
} = {}) {
  const live = livePowerCircuits(power);
  const x = Number(listener?.x) || 0;
  const z = Number(listener?.z ?? listener?.y) || 0;
  const heard = [];
  for (const source of ELECTRICAL_HUM_SOURCES) {
    if (!live.has(source.circuit)) continue;
    const distance = Math.hypot(source.x - x, source.z - z);
    if (distance >= source.radius) continue;
    const air = Math.pow(1 - distance / source.radius, 2);
    const lossDb = Math.max(0, Number(occlusionDb?.(listener, source)) || 0);
    const occlusion = Math.pow(10, -lossDb / 20);
    const gain = source.gain * air * occlusion;
    if (gain < minAudible) continue;
    heard.push({
      ...source,
      distance,
      gain,
      pan: clamp((source.x - x) / Math.max(4, source.radius * .55), -1, 1),
      label: powerCircuitDefinition(source.circuit)?.label || source.circuit.toUpperCase(),
    });
  }
  heard.sort((a, b) => b.gain - a.gain);
  const circuits = [...new Set(heard.map((entry) => entry.circuit))];
  return {
    audible: heard.length > 0,
    gain: clamp(heard.reduce((sum, entry) => sum + entry.gain, 0), 0, .5),
    pan: heard.length ? heard.reduce((sum, entry) => sum + entry.pan * entry.gain, 0) / heard.reduce((sum, entry) => sum + entry.gain, 0) : 0,
    circuits,
    primary: heard[0] || null,
    sources: heard,
  };
}

export function createElectricalHumRuntime({ context, destination } = {}) {
  if (!context || !destination) return { update() {}, stop() {} };
  const out = context.createGain();
  const pan = context.createStereoPanner();
  const low = context.createBiquadFilter();
  low.type = 'lowpass'; low.frequency.value = 480; low.Q.value = .7;
  out.gain.value = 0;
  low.connect(pan); pan.connect(out); out.connect(destination);
  const oscillators = [50, 100, 150].map((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = index === 0 ? 'sine' : 'triangle';
    oscillator.frequency.value = frequency;
    gain.gain.value = [.34, .11, .035][index];
    oscillator.connect(gain); gain.connect(low); oscillator.start();
    return oscillator;
  });
  return {
    update(frame = {}, now = context.currentTime) {
      out.gain.cancelScheduledValues(now);
      out.gain.linearRampToValueAtTime(clamp(Number(frame.gain) || 0, 0, .22), now + .12);
      pan.pan.cancelScheduledValues(now);
      pan.pan.linearRampToValueAtTime(clamp(Number(frame.pan) || 0, -1, 1), now + .12);
    },
    stop() {
      const now = context.currentTime;
      out.gain.cancelScheduledValues(now); out.gain.linearRampToValueAtTime(0, now + .08);
      for (const oscillator of oscillators) { try { oscillator.stop(now + .1); } catch (_) {} }
    },
  };
}
