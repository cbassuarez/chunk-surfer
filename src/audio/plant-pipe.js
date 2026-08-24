// THE PIPE THAT WILL NOT LET HIM WORK.
//
// A heating pipe under the building is losing steam past a valve gland, and it
// is on every channel in every room until somebody shuts it. That is the whole
// mechanic — he will not put a hissing take on tape, because a spoiled take is a
// second unpaid drive back to this building — so the sound has one job: to be
// unmistakably a PIPE, and to be present whether or not he is standing near it.
//
// WHAT THIS REPLACES, AND WHY. updateAudio() used to call STORY.startTapeHiss()
// for this — the recorder's own noise-floor generator, a sampled tape loop
// through a 90Hz-9.2kHz band, at a different gain. So the building's broken pipe
// and the tape's own hiss were literally the same sound, and no amount of level
// tuning was ever going to make one read as the other. Tape hiss is flat and
// broadband; escaping steam is narrow, high, and under pressure.
//
// THREE PATHS, ONE TIMBRE. The pipe is a thing in a room — positional, loud in
// the plant room, a rumour along the basement corridor — AND it is on the
// monitor everywhere, because that is what makes it a problem rather than a
// location. A normally silent HRTF rear path belongs only to the isolation
// interaction. All three come off the same synthesis, which is why the false
// source can plausibly inherit the pipe while remaining gameplay-inert.
//
// Modelled on fountain-water.js, which is the closest precedent in the codebase:
// a positional continuous synthesised bed with a distance falloff, a runtime
// that only ever takes a frame, and an identity in the acoustic catalogue.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// The isolation valve, in building metres — the same space
// ELECTRICAL_HUM_SOURCES uses. Resolved from the prop's own authored address
// (logical 33, 37.45) through logicalToPhysical; see currentPlantPipeFrame in
// main.js for the conversion the listener goes through to match.
export const PLANT_PIPE_SOURCE = Object.freeze({
  id: 'plant-heating-header',
  x: 33.5,
  z: 38.0,
  // Generous. Steam under pressure in a hard concrete room carries down the
  // corridor and up the stair, and finding it by ear is meant to be possible.
  radius: 30,
  gain: 0.30,
});

// What it puts on the monitor, everywhere, regardless of distance. This is the
// half that blocks recording: it does not fall off, because it is not being
// heard through the air — it is in the signal.
const MONITOR_GAIN = 0.16;

export function plantPipeAt(listener, { hissing = true } = {}) {
  if (!hissing) return { audible: false, world: 0, monitor: 0, pan: 0, distance: Infinity };
  const x = Number(listener?.x) || 0;
  const z = Number(listener?.z ?? listener?.y) || 0;
  const distance = Math.hypot(PLANT_PIPE_SOURCE.x - x, PLANT_PIPE_SOURCE.z - z);
  const within = distance < PLANT_PIPE_SOURCE.radius;
  // Steam is a thin sound and it does not fall off like a bass hum: a squarer
  // curve keeps it audible further out, which is what makes it findable.
  const air = within ? (1 - distance / PLANT_PIPE_SOURCE.radius) ** 1.4 : 0;
  const dx = PLANT_PIPE_SOURCE.x - x;
  const spread = clamp(distance / 7, 0, 1);
  return {
    audible: true,
    world: PLANT_PIPE_SOURCE.gain * air,
    monitor: MONITOR_GAIN,
    pan: within ? clamp((dx / Math.max(1, distance)) * spread, -1, 1) : 0,
    distance,
  };
}

export function createPlantPipeRuntime({ context, worldDestination, monitorDestination } = {}) {
  if (!context || !worldDestination) return { update() {}, stop() {} };

  // Two seconds of white noise, looped. The character is entirely in the
  // filtering — noise is just the raw material for anything escaping under
  // pressure.
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;

  // THE JET. A narrow, resonant band high up is what makes a leak read as
  // pressurised rather than as a room being noisy. Q is deliberately steep: this
  // is a whistle, not a wash, and it is the single thing that distinguishes this
  // from the tape hiss it replaces.
  const jet = context.createBiquadFilter();
  jet.type = 'bandpass'; jet.frequency.value = 5200; jet.Q.value = 4.2;
  const jetGain = context.createGain(); jetGain.gain.value = 0.9;

  // THE BODY. Underneath the whistle, the broader rush of the escape itself, and
  // the pipe it is escaping from ringing very slightly with it.
  const body = context.createBiquadFilter();
  body.type = 'bandpass'; body.frequency.value = 1350; body.Q.value = 0.8;
  const bodyGain = context.createGain(); bodyGain.gain.value = 0.42;

  // Turbulence. A leak is not steady — the gland shifts, the note wanders a
  // little and comes back. Without this it is a sine-ish tone and reads as
  // equipment rather than as a fault.
  const wander = context.createOscillator();
  wander.type = 'sine';
  wander.frequency.value = 0.13;
  const wanderDepth = context.createGain();
  wanderDepth.gain.value = 320;
  wander.connect(wanderDepth);
  wanderDepth.connect(jet.frequency);

  noise.connect(jet); jet.connect(jetGain);
  noise.connect(body); body.connect(bodyGain);

  // The world path: panned, and attenuated by distance.
  const worldGain = context.createGain();
  const worldPan = context.createStereoPanner();
  worldGain.gain.value = 0;
  jetGain.connect(worldPan); bodyGain.connect(worldPan);
  worldPan.connect(worldGain);
  worldGain.connect(worldDestination);

  // THE SOURCE BEHIND THE HEAD.
  //
  // The isolation interaction crossfades the genuine header into this separate
  // subjective path.  HRTF placement makes it a rear source rather than a
  // louder copy of the pipe on the wall.  It is deliberately local to the
  // renderer: it emits no gameplay noise and has no Presence counterpart.
  const rearGain = context.createGain();
  rearGain.gain.value = 0;
  const rearSpatial = context.createPanner?.() || context.createStereoPanner();
  if ('panningModel' in rearSpatial) rearSpatial.panningModel = 'HRTF';
  if ('distanceModel' in rearSpatial) rearSpatial.distanceModel = 'inverse';
  if (rearSpatial.positionX) {
    rearSpatial.positionX.value = 0;
    rearSpatial.positionY.value = 0;
    rearSpatial.positionZ.value = 1;
  } else if (typeof rearSpatial.setPosition === 'function') rearSpatial.setPosition(0, 0, 1);
  else if (rearSpatial.pan) rearSpatial.pan.value = 0;
  // As it transfers, the jet loses its mechanical whistle and keeps the wet,
  // breath-width band underneath it. It is still close enough to the pipe that
  // the player can misattribute it until the handwheel stops.
  const rearVeil = context.createBiquadFilter();
  rearVeil.type = 'bandpass'; rearVeil.frequency.value = 2050; rearVeil.Q.value = .62;
  jetGain.connect(rearVeil); bodyGain.connect(rearVeil); rearVeil.connect(rearSpatial);
  rearSpatial.connect(rearGain);
  rearGain.connect(worldDestination);

  // The monitor path: flat, everywhere, because it is in the signal rather than
  // in the air. Only connected if the caller gave it somewhere to go.
  const monitorGain = context.createGain();
  monitorGain.gain.value = 0;
  if (monitorDestination) {
    jetGain.connect(monitorGain);
    bodyGain.connect(monitorGain);
    monitorGain.connect(monitorDestination);
  }

  noise.start();
  wander.start();

  return {
    update(frame = {}, { monitorOpen = false } = {}, now = context.currentTime) {
      worldGain.gain.cancelScheduledValues(now);
      worldGain.gain.linearRampToValueAtTime(clamp(Number(frame.world) || 0, 0, 0.30), now + 0.18);
      worldPan.pan.cancelScheduledValues(now);
      worldPan.pan.linearRampToValueAtTime(clamp(Number(frame.pan) || 0, -1, 1), now + 0.18);
      monitorGain.gain.cancelScheduledValues(now);
      monitorGain.gain.linearRampToValueAtTime(
        monitorOpen ? clamp(Number(frame.monitor) || 0, 0, 0.30) : 0, now + 0.12);
      rearGain.gain.cancelScheduledValues(now);
      rearGain.gain.linearRampToValueAtTime(clamp(Number(frame.rear) || 0, 0, .38), now + 0.12);
    },
    stop() {
      const now = context.currentTime;
      for (const g of [worldGain, monitorGain, rearGain]) {
        g.gain.cancelScheduledValues(now);
        g.gain.linearRampToValueAtTime(0, now + 0.1);
      }
      try { noise.stop(now + 0.12); } catch (_) {}
      try { wander.stop(now + 0.12); } catch (_) {}
    },
  };
}
