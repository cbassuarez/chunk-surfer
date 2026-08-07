// The whisper bed, as a tide.
//
// Thirteen takes of one sentence run underneath the whole night from the moment
// he walks off the dock. This module owns no audio — it answers one question,
// continuously: given how much of the work order is done and how long the run
// has been going, what should the bed be doing right now.
//
// THE PROBLEM. The bed has to escalate across the night and the player must
// never once catch it escalating. Those are not in tension if you are willing to
// do the arithmetic, because "noticing an escalation" means finding a moment
// that is louder than a moment you remember. So:
//
//   MAKE THE WAVE BIGGER THAN THE STEP.
//
//                     take 1        take 2        take 3
//    peak     ╱‾╲      ╱‾╲   ╱‾╲     ╱‾╲   ╱‾╲     ╱‾╲
//          ╲_╱   ╲_╱‾╲╱   ╲_╱   ╲_╱‾╲╱   ╲_╱   ╲_╱‾╲╱
//    trough         ↑ every trough after a take is BELOW the peak
//                     before it, so no pair of moments is evidence
//
// If the swell's peak-to-trough exceeds the per-take increment, then for any two
// moments the player can hold in their head, the later one is as likely to be
// quieter as louder. The rise is real, it is monotonic, and it is unfalsifiable
// from the inside. `WHISPER_TIDE.waveOverStep` is that ratio and the suite
// asserts it.
//
// The second half of the trick is the slew: the take count jumps, the bed does
// not. A sealed take moves a target that the applied value chases over minutes,
// so the seal itself — the one moment the player is definitely paying attention
// to the game's state — is not an audible event.
//
// WHAT ELSE MOVES. Level is the least of it. Across the night the passband opens
// (texture → nearly words), the voices converge from hard random panning toward
// the centre, and the detune spread narrows toward unison. The Other starts as a
// property of the whole building and slowly acquires a direction. Where that
// convergence is going is the loading dock, where a body says the same sentence
// out loud (see issueDockCommand in main.js).

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const lerp = (a, b, t) => a + (b - a) * clamp01(t);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

// Deliberately not frozen, for the same reason stabs.js leaves STABS open: the
// level of this bed cannot be derived from anything and has to be found by ear,
// so __probe.whisperTune writes here live. The nested arrays stay frozen because
// their endpoints are authored intent rather than tuning.
export const WHISPER_TIDE = {
  // Linear gain, applied to files mastered at -25 dBFS RMS. These two numbers
  // are the whole audibility question and they are a starting point, not an
  // answer: the game's room tone is brown noise lowpassed at 180 Hz and the bed
  // lives at 180 Hz-2.2 kHz, so there is no masker in this band and the level
  // has to be set by ear in a quiet room. See __probe.whisperTune.
  floor: 0.020,
  ceiling: 0.085,

  // Three periods with no small common multiple, so the sum does not repeat
  // inside any session anybody will play. 47 x 113 x 269 seconds is just under
  // sixteen and a half days.
  wavePeriodsSec: Object.freeze([47, 113, 269]),
  waveWeights: Object.freeze([0.5, 0.3, 0.2]),
  // Spend more of the night absent than present. A bed that is mostly there is
  // wallpaper within ten minutes; one that is mostly not there stays a question.
  waveShape: 1.6,
  // Below this the wave outputs exactly zero — the barred Other. Real silences,
  // a few seconds long, which also stop the ear adapting to the bed.
  waveZeroBelow: 0.06,

  // The invariant. Peak-to-trough must exceed one take's worth of rise by this
  // factor or the escalation becomes findable.
  waveOverStep: 2,

  takeCount: 5,
  // Seconds for the applied progress to travel the full 0..1. One take's step is
  // a fifth of that — 180 s — which is nearly four times the shortest wave
  // period, so the step is buried under two full swells before it completes.
  slewSecondsFullRange: 900,

  // The passband opens as the night goes on. Low end walks down toward the room
  // tone's shoulder; top end walks up toward the band where consonants live.
  bandLowHz: Object.freeze([300, 180]),
  bandHighHz: Object.freeze([1200, 2200]),

  // Everywhere and nowhere, to somewhere.
  panSpread: Object.freeze([0.95, 0.10]),
  detuneCents: Object.freeze([120, 25]),

  // Concurrent utterances, and the gap between starts. Never fewer than two
  // overlapping once the night is underway, so no single take is ever exposed
  // long enough to be parsed as a sentence.
  voices: Object.freeze([1.2, 5.0]),
  gapMsAt: Object.freeze([5200, 1300]),
  minOverlapProgress: 0.4,

  // THE PEAK IS A DIFFERENT LAYER, NOT A LOUDER ONE.
  //
  // Five overlapping takes at 1.3s is a room with people in it. It is not what
  // the end of this should be. Lansky's method in Idle Chatter was granular —
  // speech chopped below the word and rebuilt as a choir — and no amount of
  // raising `voices` gets there, because the grain size is wrong. Words stay
  // words however many of them you stack.
  //
  // So: a fourth stratum that does not exist at all until the night is nearly
  // over, and then arrives as a change of TEXTURE rather than of volume. Onset
  // and mid are untouched; `startsAtProgress` is a hard gate, not a fade from
  // zero, because the whole point is that this was not there before.
  grains: {
    startsAtProgress: 0.62,
    // Below a word and above a click. Short enough that no grain is a syllable
    // you could name, long enough to keep the voice's own grain and not become
    // a buzz.
    lengthMsAt: Object.freeze([120, 40]),
    // Grains in the air at once, and the interval between starts. The interval
    // is what makes it pulse rather than hiss; jitter is applied at the caller.
    densityAt: Object.freeze([3, 26]),
    intervalMsAt: Object.freeze([210, 46]),
    // Loose quantisation to a slow pulse. Not a beat — a tendency.
    pulseMs: 340,
    pulseBiasAt: Object.freeze([0.15, 0.55]),
    // Grains are transposed apart so the choir has width without any grain
    // being recognisable as the take it came from.
    detuneCentsAt: Object.freeze([90, 340]),
    spreadAt: Object.freeze([0.35, 0.95]),
    // Held under the bed's own level: the takes remain the thing you are
    // hearing, and the grains are what has happened to the room around them.
    levelScaleAt: Object.freeze([0.0, 0.62]),
  },
};

// The swell. Deterministic in elapsed time only — it must not touch Math.random,
// because the bed runs for the entire session and would otherwise perturb the
// stream the scare director and combat share.
export function whisperWave(elapsedMs = 0, tide = WHISPER_TIDE) {
  const seconds = finite(elapsedMs, 0) / 1000;
  const weights = tide.waveWeights;
  let sum = 0;
  let total = 0;
  tide.wavePeriodsSec.forEach((period, i) => {
    const weight = finite(weights[i], 0);
    sum += weight * Math.sin((2 * Math.PI * seconds) / Math.max(0.001, period));
    total += weight;
  });
  const normalized = clamp01((sum / Math.max(0.0001, total)) * 0.5 + 0.5);
  if (normalized < tide.waveZeroBelow) return 0;
  // Re-span above the zero threshold so the shaping curve still reaches 1.
  const above = (normalized - tide.waveZeroBelow) / Math.max(0.0001, 1 - tide.waveZeroBelow);
  return Math.pow(clamp01(above), tide.waveShape);
}

// The take count jumps; this does not. Returns the progress to apply this frame.
export function slewProgress(applied, target, dtMs = 0, tide = WHISPER_TIDE) {
  const from = clamp01(applied);
  const to = clamp01(target);
  const step = (Math.max(0, finite(dtMs, 0)) / 1000) / Math.max(0.001, tide.slewSecondsFullRange);
  if (Math.abs(to - from) <= step) return to;
  return clamp01(from + Math.sign(to - from) * step);
}

// THE SLEW HIDES A TAKE. IT IS NOT A TOLL ON PROGRESS YOU ALREADY HAVE.
//
// The rate is full-range over `slewSecondsFullRange`, and for the thing it was
// built for that is exactly right: one take is a fifth of the range, so sealing
// one arrives over 180 seconds, buried under two full swells.
//
// Applied to a jump of more than one take it is just slow, and none of the ways
// that happens is a moment anybody is listening to: loading a save with four
// takes already done (the bed restarted from silence and spent twelve minutes
// re-earning a night the player had had — a real bug, and why a reload sounded
// wrong), or granting the work order at once (a seven-second gap for a quarter
// of an hour before anything could be heard).
//
// THE TEST IS ON THE TARGET, NOT ON THE GAP. The applied value legitimately
// trails its target by up to a full step during ordinary play, so comparing the
// two makes an ordinary second take look like a leap and snaps it — which is the
// one thing the slew exists to prevent. What matters is whether the WORK ORDER
// moved by more than a room.
export function shouldSnapProgress(previousTarget, target, tide = WHISPER_TIDE) {
  if (previousTarget == null || !Number.isFinite(Number(previousTarget))) return true;
  const oneTake = 1 / Math.max(1, tide.takeCount);
  return Math.abs(clamp01(target) - clamp01(previousTarget)) > oneTake * 1.5;
}

export function whisperProgressFor(takesCompleted = 0, tide = WHISPER_TIDE) {
  return clamp01(Math.max(0, finite(takesCompleted, 0)) / Math.max(1, tide.takeCount));
}

// The level curve, split out so the suite can assert the invariant against the
// same function the runtime uses rather than against a restatement of it.
export function whisperLevelAt(progress = 0, wave = 0, tide = WHISPER_TIDE) {
  const span = tide.ceiling - tide.floor;
  const step = span / Math.max(1, tide.takeCount);
  // The swell is the larger motion; the tide only lifts its mean. Amplitude is
  // pinned to a multiple of one take's rise, which is what makes the escalation
  // unfindable, so it is derived here and never authored as a free number.
  const amplitude = Math.min(span, step * tide.waveOverStep);
  const mean = tide.floor + clamp01(progress) * (span - amplitude) + amplitude / 2;
  return Math.max(0, mean + (clamp01(wave) - 0.5) * amplitude);
}

export function whisperTideAt({ progress = 0, elapsedMs = 0, tide = WHISPER_TIDE } = {}) {
  const p = clamp01(progress);
  const wave = whisperWave(elapsedMs, tide);
  const level = whisperLevelAt(p, wave, tide);
  const voices = lerp(tide.voices[0], tide.voices[1], p);
  return {
    wave,
    level,
    bandLowHz: lerp(tide.bandLowHz[0], tide.bandLowHz[1], p),
    bandHighHz: lerp(tide.bandHighHz[0], tide.bandHighHz[1], p),
    panSpread: lerp(tide.panSpread[0], tide.panSpread[1], p),
    detuneCents: lerp(tide.detuneCents[0], tide.detuneCents[1], p),
    // Density follows the swell as well as the tide, so a trough is thinner as
    // well as quieter — the bed recedes as a whole rather than just fading.
    voices: Math.max(p >= tide.minOverlapProgress ? 2 : 1, Math.round(voices * (0.55 + 0.45 * wave))),
    gapMs: lerp(tide.gapMsAt[0], tide.gapMsAt[1], p) / Math.max(0.35, 0.55 + 0.45 * wave),
    silent: wave <= 0,
  };
}

// The infrasonic layer is the one genuinely sub-perceptual technique with
// experimental support behind it (Wiseman's 2003 Purcell Room study: 17 Hz under
// music, 22% of ~700 people reporting unease they could not attribute; Tandy's
// 18.98 Hz extractor fan). It rides the same tide, starts late, and is silent
// whenever reduce-dread is on — terror.js's dreadAllowed() exists to gate
// exactly this class of effect.
// THE GRAIN LAYER, as a function of the same two numbers everything else uses.
//
// `progress` past the gate is renormalised to 0..1 so every curve below spans
// its full authored range in the last third of the night rather than creeping.
// The swell multiplies density and level exactly as it does for the bed, so a
// trough is thinner here too and the two layers breathe together instead of
// crossfading against each other.
export function whisperGrainsAt({ progress = 0, wave = 0, tide = WHISPER_TIDE } = {}) {
  const grains = tide.grains;
  const gate = finite(grains?.startsAtProgress, 1);
  const p = clamp01(progress);
  if (!grains || p < gate) return { active: false, level: 0, density: 0, intervalMs: Infinity };
  const t = gate >= 1 ? 1 : clamp01((p - gate) / (1 - gate));
  const w = clamp01(wave);
  const swell = 0.5 + 0.5 * w;
  return {
    active: true,
    t,
    level: lerp(grains.levelScaleAt[0], grains.levelScaleAt[1], t) * swell,
    lengthMs: lerp(grains.lengthMsAt[0], grains.lengthMsAt[1], t),
    density: Math.max(1, Math.round(lerp(grains.densityAt[0], grains.densityAt[1], t) * swell)),
    intervalMs: lerp(grains.intervalMsAt[0], grains.intervalMsAt[1], t) / Math.max(0.4, swell),
    pulseMs: finite(grains.pulseMs, 340),
    pulseBias: lerp(grains.pulseBiasAt[0], grains.pulseBiasAt[1], t),
    detuneCents: lerp(grains.detuneCentsAt[0], grains.detuneCentsAt[1], t),
    spread: lerp(grains.spreadAt[0], grains.spreadAt[1], t),
  };
}

export const WHISPER_INFRASOUND = Object.freeze({
  hz: 18.5,
  startsAtProgress: 0.15,
  gainAt: Object.freeze([0, 0.055]),
});

export function whisperInfrasoundAt({ progress = 0, wave = 0, allowed = true, infrasound = WHISPER_INFRASOUND } = {}) {
  if (!allowed) return { hz: infrasound.hz, gain: 0 };
  const p = clamp01(progress);
  if (p < infrasound.startsAtProgress) return { hz: infrasound.hz, gain: 0 };
  const ramp = (p - infrasound.startsAtProgress) / Math.max(0.0001, 1 - infrasound.startsAtProgress);
  const gain = lerp(infrasound.gainAt[0], infrasound.gainAt[1], ramp) * (0.45 + 0.55 * clamp01(wave));
  return { hz: infrasound.hz, gain: Math.max(0, gain) };
}

// 'full' | 'reduced' | 'off' — the accessibility scale the other HUSH audio
// settings already use.
export function whisperSettingScale(mode = 'full') {
  const id = String(mode || 'full').toLowerCase();
  if (id === 'off') return 0;
  if (id === 'reduced') return 0.45;
  return 1;
}
