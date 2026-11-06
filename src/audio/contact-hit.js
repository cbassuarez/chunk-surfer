// The catch's impact, under the Hush's own recording. A crack the instant it has
// you, then a thump on the flash, then a short high ringing while the room comes
// back dull. Synthesised and deterministic; the recording stays the voice.
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function contactHitPlan({ reduced = false, flashAt = 0, pan = 0, intensity = 1, plain = false } = {}) {
  const scale = clamp(finite(intensity, 1), 0, 1) * (reduced ? .5 : 1);
  return Object.freeze({
    allowed: scale > 0,
    flashAt: clamp(finite(flashAt, 0), 0, .3), pan: clamp(finite(pan, 0), -1, 1),
    // A broad, abrupt onset is what the startle reflex answers. The body band is
    // for the speakers that can't reproduce the sub.
    crack: { peak: .52 * scale, attack: .0015, end: .09, highpassHz: 1800 },
    thump: { peak: .72 * scale, fromHz: 110, toHz: 42, sweep: .13, attack: .004, end: .36 },
    body: { peak: .34 * scale, fromHz: 230, toHz: 88, sweep: .11, attack: .003, end: .22 },
    // The ringing and the dull room are the real catch's alone.
    ring: reduced || plain ? null : { peak: .012, hz: 6100, end: 1.5 },
    dull: reduced || plain ? null : { hz: 520, end: 1.5 },
  });
}

export function createContactHitPlayer({ getContext, getDestination, getDull = () => null } = {}) {
  let noise = null, noiseContext = null;
  const noiseBuffer = context => {
    if (noise && noiseContext === context) return noise;
    const length = Math.ceil(context.sampleRate * .12), buffer = context.createBuffer(1, length, context.sampleRate), data = buffer.getChannelData(0);
    let a = 0x51ace;
    for (let i = 0; i < length; i++) { a = a + 0x6d2b79f5 >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); data[i] = (((t ^ t >>> 14) >>> 0) / 4294967296) * 2 - 1; }
    noise = buffer; noiseContext = context; return buffer;
  };
  const envelope = (gain, at, peak, attack, end) => {
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(Math.max(.0002, peak), at + attack);
    gain.gain.exponentialRampToValueAtTime(.0001, at + end);
  };
  const sweep = (context, out, at, { peak, fromHz, toHz, sweep: seconds, attack, end }) => {
    const osc = context.createOscillator(), gain = context.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(fromHz, at); osc.frequency.exponentialRampToValueAtTime(toHz, at + seconds);
    envelope(gain, at, peak, attack, end);
    osc.connect(gain); gain.connect(out); osc.start(at); osc.stop(at + end + .02);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  };
  return {
    play(options = {}) {
      const context = getContext?.(), destination = getDestination?.(), plan = contactHitPlan(options);
      if (!plan.allowed || !context || !destination || (context.state && context.state !== 'running')) return false;
      const now = context.currentTime, hit = now + plan.flashAt;
      const pan = context.createStereoPanner(); pan.pan.setValueAtTime(plan.pan, now); pan.connect(destination);
      const crack = context.createBufferSource(), band = context.createBiquadFilter(), crackGain = context.createGain();
      crack.buffer = noiseBuffer(context); band.type = 'highpass'; band.frequency.setValueAtTime(plan.crack.highpassHz, now);
      envelope(crackGain, now, plan.crack.peak, plan.crack.attack, plan.crack.end);
      crack.connect(band); band.connect(crackGain); crackGain.connect(pan); crack.start(now);
      crack.onended = () => { crack.disconnect(); band.disconnect(); crackGain.disconnect(); };
      sweep(context, pan, hit, plan.thump);
      sweep(context, pan, hit, plan.body);
      if (plan.ring) {
        const osc = context.createOscillator(), gain = context.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(plan.ring.hz, hit);
        envelope(gain, hit, plan.ring.peak, .02, plan.ring.end);
        osc.connect(gain); gain.connect(destination); osc.start(hit); osc.stop(hit + plan.ring.end + .02);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      }
      const dull = plan.dull && getDull?.();
      if (dull) {
        dull.frequency.cancelScheduledValues(hit);
        dull.frequency.setValueAtTime(plan.dull.hz, hit);
        dull.frequency.exponentialRampToValueAtTime(20000, hit + plan.dull.end);
      }
      setTimeout(() => { try { pan.disconnect(); } catch (_) {} }, (plan.flashAt + 1) * 1000);
      return true;
    },
  };
}
