// WHAT YOU HEAR THROUGH A DOOR.
//
// Each world behind the door-field doors has a bed of its own — fire under a red
// sun, a still sea, wind, sand, a storm — built here from noise, filters and a
// drone or two, so there is nothing to load. A shut door lets it through low and
// muffled; an open one lets it through whole; a crossing puts you in it. Only
// two doors sound at once, with a crossing taking the first place.
import { ELSEWHERE_WORLDS } from '../data/elsewhere-worlds.js';
import { stationHomePresentation } from '../game/station-home.js';
import { HOME_BEDROOM, HOME_COMFORT_LOOP_SECONDS, homeComfortPhase } from '../data/childhood-bedroom.js';

export const ELSEWHERE_SHUT_LOWPASS_HZ = 320;
export const ELSEWHERE_OPEN_LOWPASS_HZ = 12000;
export const ELSEWHERE_CROSSING_LOWPASS_HZ = 16000;
export const ELSEWHERE_MAX_BEDS = 2;
const CROSSING_GAIN = 0.42;
const HOME_WINDOW_BED_ID = 'station-home-window';

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

// The realm looks along +z. Its room sounds come through the glazed opening,
// including when the player sidesteps far enough for the wall to occlude them.
export function homeWindowAudioMix({ listener, window = HOME_BEDROOM.window, anchor = HOME_BEDROOM.anchors.window } = {}) {
  if (!listener) return { gainFactor: 1, pan: 0, lowpassHz: 4200, occluded: false };
  const eye = { x: Number(listener.x) || 0, y: Number(listener.y) || 1.62, z: Number(listener.z) || 0 };
  const aperture = { ...HOME_BEDROOM.window, ...window };
  const dx = aperture.x - eye.x, dz = aperture.z - eye.z;
  const distance = Math.hypot(dx, dz);
  const plane = (aperture.z - eye.z) / (anchor.z - eye.z || .0001);
  const crossX = eye.x + (anchor.x - eye.x) * plane;
  const crossY = eye.y + (anchor.y - eye.y) * plane;
  const occluded = plane < 0 || plane > 1 || Math.abs(crossX - aperture.x) > aperture.halfWidth
    || crossY < aperture.bottom || crossY > aperture.top;
  // Diffraction keeps a quiet room audible beside the reveal; the wall never
  // turns into a second opening. The transmitted bearing stays at the pane.
  const transmittedX = Math.max(aperture.x - aperture.halfWidth, Math.min(aperture.x + aperture.halfWidth, crossX));
  const bearing = Math.atan2(transmittedX - eye.x, dz) - (Number(listener.yaw) || 0);
  return {
    gainFactor: (occluded ? .22 : 1) / (1 + (distance / 4) ** 2),
    pan: Math.sin(bearing) * .8,
    lowpassHz: occluded ? 750 : 4200,
    occluded,
  };
}

// One finite, deterministic recording per room mechanism. It really repeats
// the same waveform, rather than re-rolling noise or contacts each time around.
function comfortBuffer(context, kind) {
  const sampleRate = Math.min(22050, context.sampleRate);
  const length = Math.round(HOME_COMFORT_LOOP_SECONDS * sampleRate);
  const buffer = context.createBuffer(1, length, sampleRate), samples = buffer.getChannelData(0);
  let seed = kind === 'clock' ? 1701 : kind === 'radiator' ? 2701 : 3701;
  const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
  const contact = (at, duration, wave) => {
    const start = Math.round(at * sampleRate), count = Math.round(duration * sampleRate);
    for (let i = 0; i < count && start + i < length; i++) samples[start + i] += wave(i / sampleRate, noise());
  };
  if (kind === 'clock') {
    for (let second = 0; second < HOME_COMFORT_LOOP_SECONDS; second++) {
      const pitch = second % 2 ? 1450 : 1850;
      contact(second, .075, (time, grain) => .19 * Math.exp(-time * 125)
        * (grain * .55 + Math.sin(time * pitch * Math.PI * 2) * .45));
    }
  } else if (kind === 'radiator') {
    for (const [at, level] of [[2.10, .13], [2.70, .085]]) contact(at, .42, (time, grain) => level
      * (Math.exp(-time * 100) * grain * .3 + Math.exp(-time * 16)
        * (Math.sin(time * 550 * Math.PI * 2) + .45 * Math.sin(time * 1100 * Math.PI * 2))));
  } else {
    let air = 0;
    contact(7.2, 1.2, (time, grain) => {
      air += (grain - air) * .14;
      return air * .17 * Math.sin(Math.PI * time / 1.2) ** 2;
    });
  }
  return buffer;
}

// Pure: how one door's world should sound from where you stand. `bearing` is the
// door's direction relative to where you are looking (radians, + is right).
export function elsewhereBedMix({ distanceM = 0, bearing = 0, open = false, crossing = 0, strength = 1 } = {}) {
  const inside = clamp01(crossing);
  const near = 1 / (1 + (Math.max(0, Number(distanceM) || 0) / 6) ** 2);
  const envelope = Math.max(0, Math.min(2, Number(strength) || 0));
  const through = (open ? 0.24 : 0.08) * near * envelope;
  const doorway = open ? ELSEWHERE_OPEN_LOWPASS_HZ : ELSEWHERE_SHUT_LOWPASS_HZ;
  return {
    gain: through + (CROSSING_GAIN - through) * inside,
    pan: Math.max(-1, Math.min(1, Math.sin(Number(bearing) || 0) * 0.8 * (1 - inside))),
    lowpassHz: Math.round(doorway + (ELSEWHERE_CROSSING_LOWPASS_HZ - doorway) * inside),
  };
}

function bedKind(leak) {
  // A route door has no elsewhere variant. It carries the building's own air
  // instead, explicitly identified by the runtime rather than a fake world.
  if (leak?.bed === 'building' || leak?.world === 'building' || leak?.route === 'chapel') return 'building';
  if (leak?.bed === 'home-window') return 'home-window';
  return Number.isInteger(leak?.variant) ? ELSEWHERE_WORLDS[leak.variant]?.bed || null : null;
}

// The runtime's saved decoherence progress drives the occupied world's sound,
// rather than starting another audio timer. Ordinary doorway leaks still use
// their independent, slower take-back envelope.
export function elsewhereDecoherenceEnvelope(crossing) {
  return crossing?.phase === 'decohering' ? 1 - clamp01(crossing.progress ?? crossing.decoherenceProgress) : 1;
}

const progressPulse = (progress, start, end) => {
  if (progress <= start || progress >= end) return 0;
  return Math.sin(Math.PI * (progress - start) / (end - start)) ** 2;
};

// These are envelopes over the saved visit, not scheduled sound effects. A
// resumed visit starts at its current material failure instead of replaying a
// submerged contact or fracture from the beginning. Stereo can suggest a wrong
// side; the inverted world's rising grit supplies its vertical cue in pitch.
export function elsewhereDecoherenceSignature(crossing) {
  if (crossing?.phase !== 'decohering' || !Number.isInteger(crossing.variant)
    || crossing.variant < 0 || crossing.variant > 5) return null;
  const progress = clamp01(crossing.progress ?? crossing.decoherenceProgress);
  const coherence = 1 - progress;
  const side = Number(crossing.seed) >= .5 ? 1 : -1;
  const pulse = (start, end) => progressPulse(progress, start, end);
  let exponent = 1;
  let layers = [];
  if (crossing.variant === 0) {
    // A brief dry break close to the listener, late in the heat distortion.
    layers = [{ gain: .32 * pulse(.52, .98), hz: 1900 + 1500 * progress, pan: .18 * side }];
  } else if (crossing.variant === 1) {
    // One broad damped contact under the slab, with high air falling away first.
    exponent = 2.6;
    layers = [{ gain: .28 * pulse(.02, .58), hz: 190 - 110 * progress, pan: 0 }];
  } else if (crossing.variant === 2) {
    exponent = .55;
    layers = [{ gain: .19 * pulse(.1, .9), hz: 1700 + 3300 * progress, pan: side * (.7 - 1.4 * progress) }];
  } else if (crossing.variant === 3) {
    // Different bands slide across one another, rather than a moving wind bed.
    exponent = .75;
    layers = [
      { gain: .12 * pulse(.04, .85), hz: 2600 + 1900 * progress, pan: side * (.75 - 1.5 * progress) },
      { gain: .1 * pulse(.25, .98), hz: 5600 - 2100 * progress, pan: side * (-.75 + 1.5 * progress) },
    ];
  } else if (crossing.variant === 4) {
    // Fine, separated fractures. Thunder remains on the night's shared clock.
    exponent = .3;
    layers = [
      { gain: .1 * (pulse(.15, .5) + .8 * pulse(.6, .98)), hz: 5100 + 2400 * progress, pan: .55 * side },
      { gain: .07 * pulse(.35, .9), hz: 3100 + 1100 * progress, pan: -.45 * side },
    ];
  } else {
    exponent = 1.5;
  }
  return {
    progress, coherence, layers,
    lowpassHz: ELSEWHERE_SHUT_LOWPASS_HZ
      + (ELSEWHERE_CROSSING_LOWPASS_HZ - ELSEWHERE_SHUT_LOWPASS_HZ) * coherence ** exponent,
  };
}

export function createElsewhereBeds({ context = null, destination = null, random = Math.random } = {}) {
  if (!context || !destination) return { update() {}, stop() {}, activeCount: () => 0 };
  const beds = new Map();
  let noise = null;
  const comfortBuffers = new Map();

  const noiseBuffer = () => {
    if (noise) return noise;
    const length = Math.floor(context.sampleRate * 2);
    noise = context.createBuffer(1, length, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = random() * 2 - 1;
    return noise;
  };

  function build(kind) {
    const nodes = [];
    const own = (node) => { nodes.push(node); return node; };
    const out = own(context.createGain());
    out.gain.value = 0;
    const muffle = own(context.createBiquadFilter());
    muffle.type = 'lowpass';
    muffle.frequency.value = ELSEWHERE_SHUT_LOWPASS_HZ;
    const pan = kind !== 'home-window' && context.createStereoPanner ? own(context.createStereoPanner()) : null;
    muffle.connect(out);
    if (pan) { out.connect(pan); pan.connect(destination); } else out.connect(destination);
    const sources = [];
    const layer = (type, frequency, q, level, spatial = false, playerLocal = false) => {
      const source = own(context.createBufferSource());
      source.buffer = noiseBuffer();
      source.loop = true;
      source.loopStart = random() * 1.5;
      const filter = own(context.createBiquadFilter());
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = q;
      const gain = own(context.createGain());
      gain.gain.value = level;
      source.connect(filter);
      filter.connect(gain);
      const layerPan = spatial && context.createStereoPanner ? own(context.createStereoPanner()) : null;
      if (layerPan) { gain.connect(layerPan); layerPan.connect(muffle); } else gain.connect(playerLocal ? out : muffle);
      source.start(context.currentTime, random() * 1.5);
      sources.push(source);
      return { filter, gain, pan: layerPan };
    };
    const drone = (type, frequency, level) => {
      const oscillator = own(context.createOscillator());
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      const gain = own(context.createGain());
      gain.gain.value = level;
      oscillator.connect(gain);
      gain.connect(muffle);
      oscillator.start();
      sources.push(oscillator);
      return { oscillator, gain };
    };
    const lfo = (param, rate, depth) => {
      const oscillator = own(context.createOscillator());
      oscillator.frequency.value = rate;
      const gain = own(context.createGain());
      gain.gain.value = depth;
      oscillator.connect(gain);
      gain.connect(param);
      oscillator.start();
      sources.push(oscillator);
    };
    const parts = {}, comfort = [];
    if (kind === 'home-window') {
      // Empty room, heard through closed glazing. Each mechanism owns a source
      // position and the same saved 12.8-second phase as its visible movement.
      const mechanism = (name, hz, q) => {
        if (!comfortBuffers.has(name)) comfortBuffers.set(name, comfortBuffer(context, name));
        const filter = own(context.createBiquadFilter());filter.type = 'bandpass';filter.frequency.value = hz;filter.Q.value = q;
        const gain = own(context.createGain());gain.gain.value = 1;
        const voicePan = context.createStereoPanner ? own(context.createStereoPanner()) : null;
        const occlusion = own(context.createBiquadFilter());occlusion.type = 'lowpass';occlusion.frequency.value = 4200;
        filter.connect(gain);
        if (voicePan) { gain.connect(voicePan);voicePan.connect(occlusion); } else gain.connect(occlusion);
        occlusion.connect(muffle);
        const voice = { name, filter, gain, pan: voicePan, occlusion, buffer: comfortBuffers.get(name), source: null };
        comfort.push(voice);parts[name] = voice;
      };
      mechanism('clock', 1750, .8);mechanism('radiator', 1100, 1.2);mechanism('curtain', 700, .7);
      // These unvoiced textures belong to the player, so they bypass the room's
      // panning and wall filter. Neither can suggest another person inside.
      parts.breath = layer('bandpass', 630, .7, 0, false, true);
      parts.clothing = layer('bandpass', 1600, .6, 0, false, true);
    } else if (kind === 'building') {
      // The chapel's air handler and electrical floor, confined to its door.
      // This does not restart the ordinary room bed across the whole station.
      layer('lowpass', 180, 0.4, 0.42);
      drone('sine', 50, 0.025);
      drone('sine', 100, 0.012);
    } else if (kind === 'burning') {
      layer('lowpass', 160, 0.7, 1.0);
      parts.crackle = layer('highpass', 2200, 0.7, 0);
    } else if (kind === 'flood') {
      const swell = layer('lowpass', 520, 0.7, 0.6);
      lfo(swell.gain.gain, 0.07, 0.4);
      const horn = drone('sine', 55, 0.1);
      lfo(horn.gain.gain, 0.03, 0.08);
    } else if (kind === 'wind-high') {
      const wind = layer('bandpass', 1700, 6, 1.4);
      lfo(wind.filter.frequency, 0.11, 500);
    } else if (kind === 'sand') {
      layer('highpass', 3600, 0.7, 0.35);
      drone('triangle', 73.4, 0.08);
    } else if (kind === 'hall') {
      // A hall with its roof gone: room tone with snow falling into it, and the
      // stage lights' mains hum still going.
      layer('lowpass', 700, 0.7, 0.5);
      layer('highpass', 5200, 0.7, 0.10);
      drone('sine', 100, 0.045);
    } else if (kind === 'tape') {
      // Miles of tape in the wind: hiss with the wind combing it.
      const hiss = layer('highpass', 2600, 0.6, 0.55);
      lfo(hiss.gain.gain, 0.13, 0.25);
      const wind = layer('bandpass', 420, 1.0, 0.6);
      lfo(wind.filter.frequency, 0.05, 160);
    } else if (kind === 'ash') {
      // Ash over everything: almost nothing, very low, and dry.
      const dust = layer('lowpass', 300, 0.7, 0.7);
      lfo(dust.gain.gain, 0.04, 0.3);
      layer('highpass', 4200, 0.7, 0.06);
    } else if (kind === 'broadcast') {
      // Dead air off a transmitter: flat static and mains hum at fifty.
      layer('highpass', 1200, 0.5, 0.5);
      drone('sine', 50, 0.07);
      drone('sine', 150, 0.025);
    } else if (kind === 'storm') {
      const wind = layer('bandpass', 650, 1.2, 0.9);
      lfo(wind.filter.frequency, 0.09, 220);
      // No thunder of its own: the night's storm is heard through every door
      // (tickStorm in main.js).
    } else {
      const wind = layer('lowpass', 900, 0.7, 0.9);
      lfo(wind.filter.frequency, 0.06, 300);
    }
    // Dormant layers belong to the existing world graph, so a failure never
    // needs another bed or an independently timed one-shot. Keep them absent
    // from the home/building beds and the tower's additional world kinds.
    const returns = kind === 'burning' ? [layer('highpass', 1900, .7, 0, true)]
      : kind === 'flood' ? [layer('bandpass', 190, 2.2, 0, true)]
        : kind === 'wind-high' ? [layer('bandpass', 1700, 1.6, 0, true)]
          : kind === 'sand' ? [layer('bandpass', 2600, 1.4, 0, true), layer('bandpass', 5600, 1.8, 0, true)]
            : kind === 'storm' ? [layer('bandpass', 5100, 10, 0, true), layer('bandpass', 3100, 8, 0, true)] : [];
    return { kind, out, muffle, pan, sources, nodes, parts, comfort, comfortClock: null, homeListener: null, returns, nextEvent: 0, dyingAt: null };
  }

  function syncComfort(bed, home, crossing, now, attention) {
    const time = Number(home?.time ?? crossing?.realm?.time ?? now) || 0;
    const phase = homeComfortPhase(time), paused = home?.paused === true;
    const clock = bed.comfortClock;
    const expected = clock ? homeComfortPhase(clock.phase + (clock.paused ? 0 : now - clock.at)) : phase;
    const difference = Math.abs(expected - phase);
    if (!clock || clock.paused !== paused || Math.min(difference, HOME_COMFORT_LOOP_SECONDS - difference) > .075) {
      for (const voice of bed.comfort) {
        if (voice.source) {
          try { voice.source.stop(); } catch {}
          try { voice.source.disconnect(); } catch {}
          bed.sources.splice(bed.sources.indexOf(voice.source), 1);
          bed.nodes.splice(bed.nodes.indexOf(voice.source), 1);
        }
        const source = context.createBufferSource();source.buffer = voice.buffer;source.loop = true;
        source.loopStart = 0;source.loopEnd = HOME_COMFORT_LOOP_SECONDS;
        source.playbackRate?.setValueAtTime(paused ? 0 : 1, now);
        source.connect(voice.filter);source.start(now, phase);
        bed.nodes.push(source);bed.sources.push(source);voice.source = source;
      }
      bed.comfortClock = { phase, at: now, paused };
    }
    for (const voice of bed.comfort) {
      const mix = homeWindowAudioMix({ listener: home?.listener, window: home?.window, anchor: HOME_BEDROOM.anchors[voice.name] });
      voice.gain.gain.setTargetAtTime(paused ? 0 : mix.gainFactor, now, .04);
      voice.pan?.pan.setTargetAtTime(mix.pan, now, .04);
      // The pane's main lowpass is shared; individual wall-occluded mechanisms
      // lose their high contact rather than sounding through solid masonry.
      voice.occlusion.frequency.setTargetAtTime(mix.lowpassHz, now, .04);
    }
    const local = home?.listener, prior = bed.homeListener;
    const elapsed = prior ? Math.max(.016, now - prior.at) : 1;
    const movement = prior && local ? Math.min(1, Math.hypot((Number(local.x) || 0) - prior.x, (Number(local.z) || 0) - prior.z) / elapsed / 1.8) : 0;
    // The player breathes on the glass's independent 7.1-second rhythm, never
    // on the room's exact repeating mechanism recording.
    const breath = .018 * attention * (.35 + .65 * (.5 + .5 * Math.sin(Math.max(0, time) * Math.PI * 2 / 7.1)));
    bed.parts.breath.gain.gain.setTargetAtTime(paused ? 0 : breath, now, .08);
    bed.parts.clothing.gain.gain.setTargetAtTime(paused ? 0 : movement * .028 * attention, now, .04);
    bed.homeListener = local ? { x: Number(local.x) || 0, z: Number(local.z) || 0, at: now } : null;
  }

  function events(bed, now) {
    if (now < bed.nextEvent) return;
    if (bed.parts.crackle) {
      const g = bed.parts.crackle.gain.gain;
      g.setTargetAtTime(0.5 + random() * 0.6, now, 0.004);
      g.setTargetAtTime(0, now + 0.03, 0.02);
      bed.nextEvent = now + 0.05 + random() * 0.35;
    } else {
      bed.nextEvent = Infinity;
    }
  }

  function teardown(id, bed) {
    for (const source of bed.sources) { try { source.stop(); } catch {} }
    for (const node of bed.nodes) { try { node.disconnect(); } catch {} }
    beds.delete(id);
  }

  return {
    // leaks: runtime.doorFieldLeaks(); listener: {x, z, yaw} in world metres;
    // crossing: runtime.doorCrossingFrame(); home: local window presentation,
    // {atWindow, intensity, listener:{x,y,z,yaw}, window, time, paused}, with
    // local +z-forward coordinates and saved realm time. Older callers may
    // omit the pose; home is ignored outside an occupied home crossing.
    update({ leaks = [], listener = { x: 0, z: 0, yaw: 0 }, crossing = null, home = null } = {}) {
      const now = context.currentTime;
      const wanted = new Map();
      const inHome = crossing?.home === true;
      const atWindow = inHome && home?.atWindow === true && crossing?.phase !== 'decohering'
        && crossing?.phase !== 'returning' && crossing?.released !== true;
      const homeMix = stationHomePresentation(atWindow ? home.intensity ?? home.attention : 0);
      if (crossing && bedKind(crossing)) {
        wanted.set(crossing.id, { ...crossing, open: true, strength: 1, distanceM: 0, x: listener.x, z: listener.z });
      }
      if (atWindow) wanted.set(HOME_WINDOW_BED_ID, { id: HOME_WINDOW_BED_ID, bed: 'home-window' });
      // Once inside the snow, neighbouring station doors cannot sound inside
      // the bedroom. The close warmth occupies the second bounded bed slot.
      const nearest = (inHome ? [] : Array.isArray(leaks) ? leaks : []).filter((leak) => bedKind(leak))
        .sort((a, b) => (Number(a.distanceM) || 0) - (Number(b.distanceM) || 0));
      for (const leak of nearest) {
        if (wanted.size >= ELSEWHERE_MAX_BEDS) break;
        if (!wanted.has(leak.id)) wanted.set(leak.id, leak);
      }
      // Retiring beds normally fade, but cannot occupy an extra voice while a
      // newly crossed world starts. The total graph stays bounded at two beds.
      const newBeds = [...wanted.keys()].filter((id) => !beds.has(id)).length;
      for (const [id, bed] of [...beds]) {
        if (beds.size + newBeds <= ELSEWHERE_MAX_BEDS) break;
        if (!wanted.has(id)) teardown(id, bed);
      }
      for (const [id, leak] of wanted) {
        const kind = bedKind(leak);
        let bed = beds.get(id);
        if (bed && bed.kind !== kind) { teardown(id, bed); bed = null; }
        if (!bed) { bed = build(kind); beds.set(id, bed); }
        bed.dyingAt = null;
        const bearing = Math.atan2((leak.x ?? 0) - listener.x, -((leak.z ?? 0) - listener.z)) - (Number(listener.yaw) || 0);
        const occupied = crossing?.id === id;
        const signature = occupied ? elsewhereDecoherenceSignature(crossing) : null;
        const mix = elsewhereBedMix({
          distanceM: leak.distanceM, bearing, open: !!leak.open,
          crossing: occupied ? crossing.reveal ?? 1 : 0,
          strength: leak.strength ?? 1,
        });
        if (kind === 'home-window') {
          mix.gain = homeMix.warmthGain;
          mix.lowpassHz = 4200;
          mix.pan = 0;
        } else if (occupied) {
          const coherence = elsewhereDecoherenceEnvelope(crossing);
          mix.gain *= coherence * (inHome ? homeMix.windGain : 1);
          mix.lowpassHz = Math.min(mix.lowpassHz, inHome ? homeMix.windLowpassHz : mix.lowpassHz);
          mix.lowpassHz = Math.round(signature ? Math.min(mix.lowpassHz, signature.lowpassHz)
            : ELSEWHERE_SHUT_LOWPASS_HZ + (mix.lowpassHz - ELSEWHERE_SHUT_LOWPASS_HZ) * coherence);
        }
        for (let index = 0; index < bed.returns.length; index += 1) {
          const part = bed.returns[index], envelope = signature?.layers[index];
          part.gain.gain.setTargetAtTime(envelope?.gain ?? 0, now, .018);
          if (envelope) {
            part.filter.frequency.setTargetAtTime(envelope.hz, now, .025);
            part.pan?.pan.setTargetAtTime(envelope.pan, now, .025);
          }
        }
        const restoringOutside = occupied && inHome && homeMix.attention === 0;
        bed.out.gain.setTargetAtTime(mix.gain, now, restoringOutside ? .025 : .12);
        bed.muffle.frequency.setTargetAtTime(mix.lowpassHz, now, restoringOutside ? .035 : .15);
        bed.pan?.pan.setTargetAtTime(mix.pan, now, 0.1);
        if (kind === 'home-window') {
          syncComfort(bed, home, crossing, now, homeMix.attention);
        } else if (signature && bed.parts.crackle) {
          // Random ordinary fire contacts cannot mask the saved final break or
          // schedule a fresh crack simply because a decohering visit reloaded.
          bed.parts.crackle.gain.gain.cancelScheduledValues(now);
          bed.parts.crackle.gain.gain.setTargetAtTime(0, now, .015);
        } else events(bed, now);
      }
      for (const [id, bed] of [...beds]) {
        if (wanted.has(id)) continue;
        // The window's hold ends locally. Do not leave its graph fading into
        // the station or chapel after departure, even if the caller is stale.
        if (bed.kind === 'home-window') { teardown(id, bed); continue; }
        if (bed.dyingAt == null) {
          bed.out.gain.setTargetAtTime(0, now, 0.25);
          bed.dyingAt = now + 1.5;
        } else if (now >= bed.dyingAt) {
          teardown(id, bed);
        }
      }
    },
    stop() { for (const [id, bed] of [...beds]) teardown(id, bed); },
    activeCount: () => [...beds.values()].filter((bed) => bed.dyingAt == null).length,
  };
}
