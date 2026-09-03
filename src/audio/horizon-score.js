// THE SCORE, SCRUBBED BY HIS FEET.
//
// Out on the tape, position IS the playhead. Walking plays the piece, stopping
// stops it, and walking back up the tape runs it backwards. Nothing here has a
// transport of its own: there is no play(), no pause(), and no clock. There is
// only where the body is standing, handed in every frame.
//
// WHY GRANULAR AND NOT A BUFFER SOURCE. An AudioBufferSourceNode has a clock —
// it starts, and from then on IT decides where in the file you are, and the best
// you can do is nudge playbackRate to chase the body. That is a servo, and it
// audibly hunts. A grain stream has no clock at all: every grain is a fresh
// window read from wherever the body happens to be, so the position is exact by
// construction and a standing body simply gets the same window again, which is a
// held drone rather than a stall.
//
// The method — Hann-windowed grains scheduled by setValueCurveAtTime, no attack
// and no release, only a shape — is whisper-grains.js's, and the reasoning there
// about grain size applies here. What differs is the only thing that matters:
// that module scatters grains at RANDOM offsets to dissolve speech into surface,
// and this one reads offsets from a position to hold a recording together.
//
// A theremin is played by proximity. So is this.

const ENVELOPE_POINTS = 48;
const HANN = new Float32Array(ENVELOPE_POINTS);
for (let i = 0; i < ENVELOPE_POINTS; i += 1) {
  HANN[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (ENVELOPE_POINTS - 1)));
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
const finite = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

// Grain length and spacing. Long enough to carry pitch — this is a sustained
// instrument, not a voice, and forty milliseconds of theremin is a click — and
// overlapped three deep so the seam between two grains is never a gap.
const GRAIN_MS = 150;
const INTERVAL_MS = 52;
// Grains overlap about three deep by construction (GRAIN_MS / INTERVAL_MS), so
// the seam between two is never a gap. Kept as documentation of the intended
// density; the lookahead scheduler bounds polyphony by the interval itself.
const OVERLAP = Math.ceil(GRAIN_MS / INTERVAL_MS);
// How far ahead of the audio clock grains are booked, and the ceiling on how
// many one tick may book. The window is comfortably longer than a slow frame
// and far shorter than a musical gesture, so scrubbing still feels immediate.
const LOOKAHEAD_S = 0.18;
const MAX_PER_TICK = 6;
// How long the playhead takes to catch a step, and the jump above which it
// stops trying to walk and simply arrives.
const GLIDE_SECONDS = 0.20;
const SNAP_SECONDS = 4;

// HOW FAST THE TAPE GOES BY AT A WALK, in tape-seconds per real second.
// 259.375s of recording over the ~70s the crossing takes at HORIZON_PACE 3.
// Everything expressive is measured against this, so "moving" means moving the
// way a body actually moves out there rather than a raw number.
const NOMINAL_RATE = 3.7;

// STOPPING HAS TO SOUND LIKE STOPPING.
//
// The playhead was always a real scrub, but the grain scheduler was a second,
// free-running clock: it advanced off ctx.currentTime and booked ~19 grains a
// second forever, at a level that never moved. So standing still did not stop
// the piece, it converted it into the most sustained, most fatiguing version of
// itself — the same 150ms window held indefinitely at full level. That is the
// "too much when not moving" complaint exactly, and it is why the module's own
// note about a stopped body getting "a held drone rather than a stall" was
// describing a fault as a feature.
//
// Standing now thins the stream and drops the level to a held tone: one
// sustained voice instead of the full stream. Not silence — the recording is
// still under the feet — but a texture the player changes with their legs.
const STILL_LEVEL = 0.18;
const STILL_INTERVAL_MULT = 3.4;
// How quickly stillness is believed. Slow enough that a step-to-step gap on the
// grid is not heard as stopping, fast enough that stopping is heard as stopping.
const MOTION_LERP = 2.2;

// OVERLAP-ADD COMPENSATION. Hann grains at GRAIN_MS/INTERVAL_MS overlap about
// three deep, which sums to roughly 1.5x the source amplitude — so the score
// played back LOUDER than the file it reads, and nothing anywhere subtracted it.
// The caller's trim was doing duty as both mix level and this, and was undersized
// for it. Two jobs, two numbers: this one is the engine's, the caller's is the mix.
const DENSITY_TRIM = 1 / (0.5 * OVERLAP);

// Cents of detune per tape-second-per-second of pace. At a walk this lands
// around +118 and the +-220 clamp is a limit again rather than the normal case:
// the bend used to saturate the instant a key went down, which made the one
// expressive parameter in the module a switch.
const BEND_CENTS_PER_RATE = 32;

export function createHorizonScore(ctx, {
  destination = null,
  url = '',
  // Decoding the whole piece at the context rate costs about 50MB of float32 for
  // four and a half minutes. That is affordable on the desktop build and it is
  // the honest default; reduceMemory decodes through a 24kHz offline context
  // instead, which halves it at the cost of the top octave.
  reduceMemory = false,
  random = Math.random,
} = {}) {
  if (!ctx || !url) return null;

  const output = ctx.createGain();
  output.gain.value = 0;
  if (destination) output.connect(destination);

  let buffer = null;
  let loading = null;
  let failed = false;
  const live = new Set();
  let nextAt = 0;
  // Where the body is, in seconds of tape, and how fast it is getting there.
  let position = 0;
  let velocity = 0;
  // The last position the CALLER handed in, so pace can be measured from the
  // body rather than from the glide's own residual (see tick).
  let lastNext = null;
  // 0 standing, 1 walking. Smoothed, and the only thing that decides how much
  // of the piece is playing. Starts at 1: the body arrives on the tape walking,
  // and a score that swells up from a held tone over the first second would be
  // announcing itself. Stopping is the event, not starting.
  let motion = 1;
  // Where it is standing across the corridor (-1..1) and which way it is
  // looking, so the score knows the same two things the picture does. Both are
  // smoothed: a grid step is a jump, and a jump in the pan is a click.
  let pan = 0;
  let panTarget = 0;
  // How dark the tape sounds. The far end of a recording should not be as
  // present as the slice underfoot, and the collapse should take the top off
  // as well as the level.
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 18000;
  tone.Q.value = 0.4;
  tone.connect(output);

  function release(grain) {
    live.delete(grain);
    for (const node of grain.nodes) { try { node.disconnect(); } catch (_) {} }
  }

  async function decode(bytes) {
    if (!reduceMemory) return ctx.decodeAudioData(bytes);
    const OfflineCtx = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    if (!OfflineCtx) return ctx.decodeAudioData(bytes);
    // decodeAudioData DETACHES the buffer it is given, so the fallback has to
    // hand over a copy or it throws on an empty ArrayBuffer and the whole load
    // lands in the outer catch — silence, and a warning that names the wrong
    // cause. Taken before the first attempt, because after it there is nothing
    // left to copy.
    const spare = bytes.slice(0);
    try {
      return await new OfflineCtx(1, 1, 24000).decodeAudioData(bytes);
    } catch (_) {
      return ctx.decodeAudioData(spare);
    }
  }

  function load() {
    if (buffer || failed) return loading;
    if (!loading) {
      loading = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`horizon score ${r.status}`))))
        .then(decode)
        .then((decoded) => { buffer = decoded; return decoded; })
        .catch((error) => {
          // The tape can be walked in silence. It should not take the space down.
          console.warn('horizon score unavailable:', error?.message || error);
          failed = true;
          return null;
        });
    }
    return loading;
  }

  function scatter(level, at = 0) {
    if (!buffer) return;
    const grainNodes = [];
    const lengthSec = GRAIN_MS / 1000;
    const span = Math.max(0, buffer.duration - lengthSec);
    if (span <= 0) return;

    // THE OFFSET IS THE BODY. Everything else in this function is dressing.
    //
    // A small jitter is essential rather than decorative: a stationary body would
    // otherwise read the identical window forty times a second, and identical
    // windows sum into a metallic buzz at the grain rate. Smearing them across a
    // few tens of milliseconds turns that back into a held note.
    const jitter = (random() * 2 - 1) * 0.045;
    const offset = clamp(position + jitter, 0, span);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    // PACE BENDS PITCH. The offset already carries the time-scrub, so this is
    // free to be purely expressive — and on a theremin piece, proximity
    // controlling pitch is not an artefact, it is the instrument. Walking on
    // lifts it; backing up drops it under.
    const bend = clamp(velocity * BEND_CENTS_PER_RATE, -220, 220);
    if (source.detune) source.detune.value = bend;
    else source.playbackRate.value = 2 ** (bend / 1200);

    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    // A GRAIN LANDS SOMEWHERE. The picture is a hundred and twenty-eight metres
    // wide and the body walks across it, and none of that reached the ears: the
    // score was a mono bed into a bare gain, identical whichever way you faced.
    //
    // whisper-grains.js — the engine this was forked from — pans every grain,
    // and the fork dropped it. Each grain is placed near the body's own offset
    // across the corridor with a little scatter, so the field has width rather
    // than a single moving point, which is what a room full of a drone does.
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = clamp(pan + (random() * 2 - 1) * 0.28, -1, 1);
      gain.connect(panner);
      panner.connect(tone);
      grainNodes.push(panner);
    } else {
      gain.connect(tone);
    }

    const now = Math.max(ctx.currentTime, at || 0);
    const peak = Math.max(0.00001, level * DENSITY_TRIM * (0.8 + random() * 0.2));
    const curve = new Float32Array(ENVELOPE_POINTS);
    for (let i = 0; i < ENVELOPE_POINTS; i += 1) curve[i] = HANN[i] * peak;
    try {
      gain.gain.setValueCurveAtTime(curve, now, lengthSec);
    } catch (_) {
      gain.gain.setValueAtTime(peak, now);
      gain.gain.linearRampToValueAtTime(0, now + lengthSec);
    }

    const grain = { nodes: [source, gain, ...grainNodes] };
    live.add(grain);
    source.onended = () => release(grain);
    try { source.start(now, offset, lengthSec); } catch (_) { release(grain); }
  }

  return {
    load,
    ready: () => !!buffer,
    /**
     * @param seconds  where the body is on the tape
     * @param dtMs     frame delta
     * @param level    0..1, already scaled by the caller's mix and accessibility
     */
    tick(seconds, dtMs, level = 1, room = {}) {
      const next = Math.max(0, finite(seconds, position));
      const dt = Math.max(1, finite(dtMs, 16)) / 1000;

      // THE BODY MOVES ON A GRID; THE PLAYHEAD MUST NOT.
      //
      // Position comes off the snapped cell, so it arrives as a staircase — one
      // jump of about half a second of tape every step, while the camera glides
      // between the same two cells. Consecutive 150ms grains were being read
      // from windows half a second apart, which is a stutter in a piece that is
      // supposed to be continuous.
      //
      // Gliding the playhead between steps costs a little lag and buys a smooth
      // scrub. A large jump — a warp, or dropping in from the god menu — is not
      // a walk and snaps, or the score would audibly slide across the tape to
      // catch up.
      if (Math.abs(next - position) > SNAP_SECONDS) position = next;
      else position += (next - position) * Math.min(1, dt / GLIDE_SECONDS);

      // PACE IS MEASURED FROM THE BODY, NOT FROM THE GLIDE'S OWN LAG.
      //
      // This used to be `(next - position) / dt` — the residual left after the
      // glide above had already moved `position` toward `next`. At steady state
      // that residual is about `rate * GLIDE_SECONDS`, so the figure came out
      // around eleven times the true tape rate AND scaled with the frame time:
      // the same walk reported a different pace at 30fps and 120fps. Since the
      // only consumer clamps at +-220 cents, the bend sat pinned at its limit
      // whenever a key was down and at zero whenever it was not, which is a
      // switch rather than the gesture it is documented to be.
      //
      // Frame-to-frame delta of what the caller actually handed in is the pace.
      const instant = lastNext === null ? 0 : (next - lastNext) / dt;
      lastNext = next;
      // Smoothed, because a per-frame position delta is noisy enough to make the
      // pitch bend chatter. This is the only state the module keeps that is not
      // simply "where he is".
      velocity += (instant - velocity) * Math.min(1, dt * 6);

      // And how much of a walk that is, 0..1. Everything expressive hangs off
      // this: the level, the density, and how much of the piece is playing.
      const moving = clamp(Math.abs(velocity) / NOMINAL_RATE, 0, 1);
      motion += (moving - motion) * Math.min(1, dt * MOTION_LERP);

      // WHERE HE IS STANDING, AND WHICH WAY HE IS LOOKING.
      //
      // `lateral` is -1..1 across the corridor and `facing` is the head's yaw.
      // Turning has to move the field or the ears are told nothing at all —
      // stand still, turn a full circle, and the old score was bit-identical.
      // Rotating the offset by the yaw is the cheap correct version of that.
      panTarget = clamp(finite(room.lateral, 0) * Math.cos(finite(room.facing, 0)), -1, 1);
      pan += (panTarget - pan) * Math.min(1, dt * 3.5);

      // The tail takes the top off as well as the level, and distance from the
      // head of the tape darkens it a little throughout — the far end of a
      // recording should not be as present as the slice underfoot.
      const collapse = clamp(finite(room.collapse, 0), 0, 1);
      const target = 18000 * (1 - collapse * 0.93) * (1 - clamp(finite(room.depth01, 0), 0, 1) * 0.25);
      tone.frequency.value += (Math.max(220, target) - tone.frequency.value) * Math.min(1, dt * 2);

      if (level <= 0.0001) { output.gain.value = 0; return { active: false, live: live.size }; }
      if (!buffer) { load(); output.gain.value = 0; return { active: false, live: live.size, loading: !failed }; }

      // THE HELD TONE. Level and density both follow the legs: at a walk this is
      // the full stream at the caller's level, and stopped it is STILL_LEVEL of
      // it through a stream thinned by STILL_INTERVAL_MULT — one voice, held.
      const carried = level * (STILL_LEVEL + (1 - STILL_LEVEL) * motion);
      const interval = INTERVAL_MS * (1 + (STILL_INTERVAL_MULT - 1) * (1 - motion));

      output.gain.value = 1;
      // SCHEDULE AHEAD OF THE GRAPH, NOT WITH IT.
      //
      // This fired at most one grain per animation frame, so grain timing
      // inherited frame timing: below about nineteen frames a second the stream
      // could not keep up with its own 52ms interval and opened audible gaps in
      // a piece that is supposed to be continuous. Filling a short window each
      // tick decouples the two — a dropped frame costs nothing because the
      // grains for the next fiftieth of a second are already booked.
      const now = ctx.currentTime;
      if (nextAt < now) nextAt = now;
      let scheduled = 0;
      while (nextAt < now + LOOKAHEAD_S && scheduled < MAX_PER_TICK) {
        scatter(carried, nextAt);
        nextAt += (interval / 1000) * (0.85 + random() * 0.3);
        scheduled += 1;
      }
      return {
        active: true, live: live.size, position, velocity, pan,
        motion, carried, interval, tone: tone.frequency.value,
      };
    },
    output,
    destroy() {
      for (const grain of [...live]) { try { grain.nodes[0].stop(); } catch (_) {} release(grain); }
      try { output.disconnect(); } catch (_) {}
      buffer = null;
    },
  };
}
