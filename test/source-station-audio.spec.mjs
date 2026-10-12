import test from 'node:test';
import assert from 'node:assert/strict';
import { createElsewhereBeds, elsewhereBedMix, elsewhereDecoherenceEnvelope, elsewhereDecoherenceSignature, homeWindowAudioMix } from '../src/audio/elsewhere-beds.js';
import { createPayphoneLine } from '../src/audio/payphone-line.js';
import { HOME_BEDROOM, HOME_COMFORT_LOOP_SECONDS, homeComfortPhase } from '../src/data/childhood-bedroom.js';

function fakeAudio({ panner = true } = {}) {
  const nodes = [], destination = { name: 'world-sfx' };
  const param = () => ({ value: 0, calls: [],
    setValueAtTime(value, at) { this.value = value; this.calls.push({ value, at }); },
    setTargetAtTime(value, at, timeConstant) { this.value = value; this.calls.push({ value, at, timeConstant }); },
    cancelScheduledValues() {},
  });
  const node = (kind) => {
    const value = { kind, connections: [], disconnected: false,
      gain: param(), frequency: param(), Q: param(), pan: param(), playbackRate: param(),
      connect(to) { this.connections.push(to); }, disconnect() { this.disconnected = true; },
    };
    if (kind === 'noise' || kind === 'tone') {
      value.starts = []; value.stops = [];
      value.start = (...args) => value.starts.push(args);
      value.stop = (...args) => value.stops.push(args);
    }
    nodes.push(value); return value;
  };
  const ctx = { currentTime: 10, sampleRate: 8000,
    createGain: () => node('gain'), createBiquadFilter: () => node('filter'),
    createBufferSource: () => node('noise'), createOscillator: () => node('tone'),
    createWaveShaper: () => node('shaper'), createAnalyser: () => node('analyser'),
    createBuffer: (_channels, length, sampleRate) => {
      const data = new Float32Array(length);
      return { length, sampleRate, duration: length / sampleRate, getChannelData: () => data };
    },
  };
  if (panner) ctx.createStereoPanner = () => node('pan');
  return { ctx, destination, nodes };
}
const listener = { x: 0, z: 0, yaw: 0 };
const leak = (id, variant, distanceM = 3, strength = 1) => ({ id, variant, distanceM, strength, open: true, x: 0, z: -distanceM });
const outputs = (audio) => audio.nodes.filter((node) => !node.disconnected && node.connections.includes(audio.destination));
const outputGain = (audio, output) => output.kind === 'gain' ? output : audio.nodes.find((node) => node.connections.includes(output));

test('door audio swells and dies with take-back strength while an occupied world keeps its interior gain', () => {
  const ordinary = elsewhereBedMix({ open: true, distanceM: 3 });
  assert.equal(elsewhereBedMix({ open: true, distanceM: 3, strength: 1.4 }).gain, ordinary.gain * 1.4);
  assert.equal(elsewhereBedMix({ open: true, strength: 0 }).gain, 0);
  assert.equal(elsewhereBedMix({ open: true, strength: -1 }).gain, 0);
  assert.equal(elsewhereBedMix({ open: true, crossing: 1, strength: 0 }).gain, .42);
  const audio = fakeAudio(), sound = createElsewhereBeds({ context: audio.ctx, destination: audio.destination });
  sound.update({ leaks: [leak('burn', 0, 3, 1.4)], listener });
  const out = outputGain(audio, outputs(audio)[0]), count = audio.nodes.length;
  assert.equal(out.gain.value, ordinary.gain * 1.4);
  sound.update({ leaks: [leak('burn', 0, 3, .2)], listener });
  assert.equal(audio.nodes.length, count, 'an envelope update must reuse the physical door graph');
  assert.equal(out.gain.value, ordinary.gain * .2);
  sound.stop();
});

test('the chapel route carries the building bed through the supplied world bus', () => {
  for (const identity of [{ bed: 'building' }, { world: 'building' }, { route: 'chapel' }]) {
    const audio = fakeAudio({ panner: false }), sound = createElsewhereBeds({ context: audio.ctx, destination: audio.destination });
    sound.update({ leaks: [{ id: 'chapel', variant: -1, ...identity, open: true, distanceM: 2 }], listener });
    assert.equal(sound.activeCount(), 1);
    assert.equal(outputs(audio).length, 1);
    assert.ok(audio.nodes.some((node) => node.kind === 'filter' && node.frequency.value === 180));
    assert.deepEqual(audio.nodes.filter((node) => node.kind === 'tone').map((node) => node.frequency.value), [50, 100]);
    sound.stop(); assert.ok(audio.nodes.every((node) => node.disconnected));
  }
});

test('a crossing takes priority over nearby leaks and replacement never exceeds two live bed graphs', () => {
  const audio = fakeAudio(), sound = createElsewhereBeds({ context: audio.ctx, destination: audio.destination });
  sound.update({ leaks: [leak('far', 0, 12), leak('near', 1, 2), leak('middle', 3, 7)], listener });
  assert.equal(sound.activeCount(), 2); assert.equal(outputs(audio).length, 2);
  sound.update({ leaks: [leak('near', 1, 2), leak('middle', 3, 7)], crossing: { id: 'crossed', variant: 4, reveal: 1 }, listener });
  assert.equal(sound.activeCount(), 2); assert.equal(outputs(audio).length, 2);
  const gains = outputs(audio).map((output) => outputGain(audio, output).gain.value);
  assert.ok(gains.includes(.42), 'the world occupied by the listener must sound even when it is not a nearest door');
  sound.update({ leaks: [leak('different-a', 5), leak('different-b', 0)], listener });
  assert.equal(outputs(audio).length, 2, 'retiring doors must not accumulate around replacement beds');
  sound.stop(); sound.stop();
  assert.equal(sound.activeCount(), 0);
  assert.ok(audio.nodes.every((node) => node.disconnected));
  assert.ok(audio.nodes.filter((node) => node.starts).every((node) => node.stops.length === 1));
});

test('a repeated crossing id does not consume another bed slot or restore its exterior envelope', () => {
  const audio = fakeAudio(), sound = createElsewhereBeds({ context: audio.ctx, destination: audio.destination });
  sound.update({ leaks: [leak('same', 0, 0, .01), leak('other', 1, 4)], crossing: { id: 'same', variant: 0, reveal: 1 }, listener });
  assert.equal(outputs(audio).length, 2);
  assert.ok(outputs(audio).some((output) => outputGain(audio, output).gain.value === .42));
  sound.stop();
});

test('window attention quiets the occupied snow, reserves warmth within two beds, and restores the outside on turning away', () => {
  const audio = fakeAudio(), sound = createElsewhereBeds({ context: audio.ctx, destination: audio.destination });
  const crossing = { id: 'snow', variant: 5, home: true, reveal: 1 };
  sound.update({ leaks: [leak('fire', 0), leak('sea', 1)], listener });
  sound.update({ leaks: [leak('fire', 0), leak('sea', 1)], crossing, listener, home: { atWindow: true, intensity: 0 } });
  assert.equal(outputs(audio).length, 2);
  const [wind, warmth] = outputs(audio).map((output) => outputGain(audio, output));
  assert.equal(wind.gain.value, .42);
  assert.equal(warmth.gain.value, .08);
  const count = audio.nodes.length;
  sound.update({ crossing, listener, home: { atWindow: true, intensity: 1 } });
  assert.equal(audio.nodes.length, count, 'voluntary attention must reuse its existing graphs');
  assert.ok(Math.abs(wind.gain.value - .42 * .18) < 1e-10);
  assert.equal(warmth.gain.value, .16);
  const windMuffle = audio.nodes.find((node) => node.connections.includes(wind));
  assert.equal(windMuffle.frequency.value, 600);
  assert.ok(audio.nodes.some((node) => node.kind === 'filter' && node.frequency.value === 1100));
  sound.update({ crossing, listener, home: { atWindow: true, intensity: 0 } });
  assert.equal(wind.gain.value, .42);
  assert.equal(windMuffle.frequency.value, 16000);
  assert.equal(warmth.gain.value, .08);
  const warmNodes = audio.nodes.filter((node) => !node.disconnected && node !== wind && node !== windMuffle);
  sound.update({ crossing, listener, home: { atWindow: false, intensity: 1 } });
  assert.equal(outputs(audio).length, 1, 'the local warmth graph must end when its window presentation ends');
  assert.equal(warmth.disconnected, true);
  assert.ok(warmNodes.some((node) => node.starts && node.stops.length === 1));
  assert.equal(wind.gain.value, .42);
  sound.stop();
  assert.ok(audio.nodes.every((node) => node.disconnected));
  assert.ok(audio.nodes.filter((node) => node.starts).every((node) => node.stops.length === 1));
});

test('stale home attention cannot create warmth outside the home crossing or survive its departure', () => {
  const audio = fakeAudio(), sound = createElsewhereBeds({ context: audio.ctx, destination: audio.destination });
  const home = { atWindow: true, intensity: 1 };
  sound.update({ crossing: { id: 'ordinary-snow', variant: 5, reveal: 1 }, listener, home });
  assert.equal(outputs(audio).length, 1);
  assert.equal(outputGain(audio, outputs(audio)[0]).gain.value, .42);
  sound.update({ crossing: { id: 'home-snow', variant: 5, home: true, reveal: 1 }, listener, home });
  assert.equal(outputs(audio).length, 2);
  const warm = outputGain(audio, outputs(audio)[1]);
  sound.update({ crossing: null, leaks: [], listener, home });
  assert.equal(warm.disconnected, true);
  assert.equal(sound.activeCount(), 0);
  sound.stop();
  assert.ok(audio.nodes.every((node) => node.disconnected));
});

const comfortSources = (audio) => audio.nodes.filter((node) => node.kind === 'noise'
  && !node.disconnected && node.buffer?.duration === HOME_COMFORT_LOOP_SECONDS);
const homeCrossing = { id: 'last-clear-pane', variant: 5, home: true, phase: 'inside', reveal: 1 };
const homeListener = { x: -.18, y: 1.62, z: 67, yaw: 0 };

test('bedroom mechanisms transmit at the fixed window, turn with the listener and lose detail behind its wall', () => {
  const front = homeWindowAudioMix({ listener: homeListener, anchor: HOME_BEDROOM.anchors.clock });
  assert.equal(front.occluded, false);
  const offset = { ...homeListener, x: 1.2 };
  const right = homeWindowAudioMix({ listener: offset, anchor: HOME_BEDROOM.anchors.clock });
  const turned = homeWindowAudioMix({ listener: { ...offset, yaw: Math.PI }, anchor: HOME_BEDROOM.anchors.clock });
  assert.ok(right.pan < 0 && turned.pan > 0, 'room sounds did not stay at the pane when turning');
  const beside = homeWindowAudioMix({ listener: { ...homeListener, x: 2, z: 68 }, anchor: HOME_BEDROOM.anchors.clock });
  assert.equal(beside.occluded, true);
  assert.ok(beside.lowpassHz < front.lowpassHz && beside.gainFactor < front.gainFactor);
  const far = homeWindowAudioMix({ listener: { ...homeListener, z: 64 }, anchor: HOME_BEDROOM.anchors.clock });
  assert.ok(far.gainFactor < front.gainFactor);
});

test('the bedroom uses three exact finite recordings with a shared saved comfort phase', () => {
  const audio = fakeAudio(), sound = createElsewhereBeds({ context: audio.ctx, destination: audio.destination });
  const home = { atWindow: true, intensity: .75, listener: homeListener, time: 21.25 };
  sound.update({ crossing: homeCrossing, home, listener });
  const sources = comfortSources(audio);
  assert.equal(sources.length, 3);
  for (const source of sources) {
    assert.equal(source.loop, true);
    assert.equal(source.loopStart, 0);
    assert.equal(source.loopEnd, HOME_COMFORT_LOOP_SECONDS);
    assert.equal(source.starts[0][1], homeComfortPhase(home.time), 'a mechanism restarted its motif at zero');
    assert.equal(source.playbackRate.value, 1);
    assert.ok(source.buffer.getChannelData(0).every((value) => Number.isFinite(value) && Math.abs(value) < .3));
  }
  const energy = (source, from, to) => source.buffer.getChannelData(0)
    .slice(Math.round(from * source.buffer.sampleRate), Math.round(to * source.buffer.sampleRate))
    .reduce((sum, value) => sum + value * value, 0);
  assert.ok(energy(sources[0], 4, 4.075) > 0 && energy(sources[0], 4.2, 4.9) === 0, 'clock contact lost its separation');
  assert.ok(energy(sources[1], 2.1, 2.5) > 0 && energy(sources[1], 2.7, 3.1) > 0);
  assert.equal(energy(sources[1], 4, 6), 0, 'radiator added unrelated contacts outside its repeated double tap');
  assert.ok(energy(sources[2], 7.2, 8.4) > 0 && energy(sources[2], 0, 7.2) === 0);
  const restoredAudio = fakeAudio(), restored = createElsewhereBeds({ context: restoredAudio.ctx, destination: restoredAudio.destination });
  restored.update({ crossing: homeCrossing, home: JSON.parse(JSON.stringify(home)), listener });
  const restoredSources = comfortSources(restoredAudio);
  for (let index = 0; index < sources.length; index++) {
    assert.deepEqual(restoredSources[index].buffer.getChannelData(0), sources[index].buffer.getChannelData(0), 'reload changed the comfort recording');
    assert.equal(restoredSources[index].starts[0][1], sources[index].starts[0][1]);
  }
  sound.stop();restored.stop();
});

test('comfort freezes on pause, seeks on resume and never advances from audio wall time alone', () => {
  const audio = fakeAudio(), sound = createElsewhereBeds({ context: audio.ctx, destination: audio.destination });
  const home = { atWindow: true, intensity: 1, listener: homeListener, time: 4.25 };
  sound.update({ crossing: homeCrossing, home, listener });
  const first = comfortSources(audio), count = audio.nodes.length;
  audio.ctx.currentTime += 1;home.time += 1;
  sound.update({ crossing: homeCrossing, home, listener });
  assert.equal(audio.nodes.length, count, 'ordinary synchronized playback rebuilt its graph');
  home.paused = true;
  sound.update({ crossing: homeCrossing, home, listener });
  const frozen = comfortSources(audio), pausedCount = audio.nodes.length;
  assert.ok(first.every((source) => source.disconnected && source.stops.length === 1));
  assert.ok(frozen.every((source) => source.playbackRate.value === 0 && source.starts[0][1] === 5.25));
  audio.ctx.currentTime += 1000;
  sound.update({ crossing: homeCrossing, home, listener });
  assert.equal(audio.nodes.length, pausedCount, 'a paused recording kept seeking with the audio clock');
  home.paused = false;
  sound.update({ crossing: homeCrossing, home, listener });
  assert.ok(comfortSources(audio).every((source) => source.starts[0][1] === 5.25 && source.playbackRate.value === 1));
  audio.ctx.currentTime += 20;
  sound.update({ crossing: homeCrossing, home, listener });
  assert.ok(comfortSources(audio).every((source) => source.starts[0][1] === 5.25), 'stale simulation time advanced the room motif');
  assert.equal(outputs(audio).length, 2);
  sound.stop();
  assert.ok(audio.nodes.every((node) => node.disconnected));
  assert.ok(audio.nodes.filter((node) => node.starts).every((node) => node.stops.length === 1));
});

test('player breath and clothing stay local, and departure silences the room before station reassembly', () => {
  for (const panner of [true, false]) {
    const audio = fakeAudio({ panner }), sound = createElsewhereBeds({ context: audio.ctx, destination: audio.destination });
    const home = { atWindow: true, intensity: 1, listener: { ...homeListener }, time: 6.4 };
    sound.update({ crossing: homeCrossing, home, listener });
    const [wind, warmth] = outputs(audio).map((output) => outputGain(audio, output));
    const breath = audio.nodes.find((node) => node.kind === 'filter' && node.frequency.value === 630).connections[0];
    const clothing = audio.nodes.find((node) => node.kind === 'filter' && node.frequency.value === 1600).connections[0];
    assert.ok(breath.connections.includes(warmth) && clothing.connections.includes(warmth), 'body sounds were panned behind the glass');
    assert.ok(breath.gain.value > 0);
    audio.ctx.currentTime += .05;home.time += .05;home.listener.x += .085;
    sound.update({ crossing: homeCrossing, home, listener });
    assert.ok(clothing.gain.value > 0);
    home.intensity = 0;
    sound.update({ crossing: homeCrossing, home, listener });
    assert.equal(breath.gain.value, 0);assert.equal(clothing.gain.value, 0);
    assert.equal(wind.gain.value, .42);
    assert.equal(wind.gain.calls.at(-1).timeConstant, .025, 'outside restoration kept the slow seduction fade');
    sound.update({ crossing: { ...homeCrossing, phase: 'returning' }, home: { ...home, intensity: 1 }, listener });
    assert.equal(warmth.disconnected, true, 'the room followed the player into the return transition');
    assert.equal(comfortSources(audio).length, 0);
    assert.equal(sound.activeCount(), 1);
    sound.stop();
    assert.ok(audio.nodes.every((node) => node.disconnected));
  }
});

test('player breathing follows glass mist independently of the exact room loop and resumes its saved phase', () => {
  const audio = fakeAudio(), sound = createElsewhereBeds({ context: audio.ctx, destination: audio.destination });
  const home = { atWindow: true, intensity: 1, listener: homeListener, time: 7.1 / 4 };
  sound.update({ crossing: homeCrossing, home, listener });
  const breath = audio.nodes.find((node) => node.kind === 'filter' && node.frequency.value === 630).connections[0];
  const peak = breath.gain.value;
  assert.ok(Math.abs(peak - .018) < 1e-10, 'the breath did not crest with the glass mist');
  home.time += HOME_COMFORT_LOOP_SECONDS;
  sound.update({ crossing: homeCrossing, home, listener });
  assert.notEqual(breath.gain.value, peak, 'the player repeated with the room mechanisms');
  home.time = 7.1 / 4 + 7.1;
  sound.update({ crossing: homeCrossing, home, listener });
  assert.ok(Math.abs(breath.gain.value - peak) < 1e-10);
  home.time = 7.1 * 3 / 4;
  sound.update({ crossing: homeCrossing, home, listener });
  const resting = breath.gain.value;
  assert.ok(resting > 0 && resting < peak / 2);
  home.paused = true;
  audio.ctx.currentTime += 1000;
  sound.update({ crossing: homeCrossing, home, listener });
  assert.equal(breath.gain.value, 0);
  home.paused = false;
  sound.update({ crossing: homeCrossing, home, listener });
  assert.equal(breath.gain.value, resting, 'audio wall time advanced the player during pause');
  sound.stop();
});

test('occupied-world decoherence follows saved progress without waiting for another footfall or starting a sound timer', () => {
  assert.equal(elsewhereDecoherenceEnvelope({ phase: 'walking', progress: 1 }), 1);
  assert.equal(elsewhereDecoherenceEnvelope({ phase: 'decohering', progress: -.5 }), 1);
  assert.equal(elsewhereDecoherenceEnvelope({ phase: 'decohering', progress: 5 }), 0);
  assert.equal(elsewhereDecoherenceEnvelope({ phase: 'decohering', decoherenceProgress: .5 }), .5);
  const audio = fakeAudio(), sound = createElsewhereBeds({ context: audio.ctx, destination: audio.destination });
  const crossing = { id: 'sea', variant: 1, phase: 'decohering', reveal: 1, progress: .25 };
  sound.update({ crossing, listener });
  const out = outputGain(audio, outputs(audio)[0]);
  assert.equal(out.gain.value, .42 * .75);
  audio.ctx.currentTime += 1000;
  sound.update({ crossing, listener });
  assert.equal(out.gain.value, .42 * .75, 'audio wall time cannot advance saved decoherence');
  sound.update({ crossing: { ...crossing, progress: 1 }, listener });
  assert.equal(out.gain.value, 0);
  sound.stop();
});

test('ordinary returns keep distinct restrained material envelopes over saved progress', () => {
  assert.equal(elsewhereDecoherenceSignature({ variant: 1, phase: 'inside', progress: .5 }), null);
  assert.equal(elsewhereDecoherenceSignature({ variant: 8, phase: 'decohering', progress: .5 }), null);
  const signature = (variant, progress) => elsewhereDecoherenceSignature({ variant, phase: 'decohering', progress, seed: .8 });
  const materials = Array.from({ length: 6 }, (_, variant) => signature(variant, .4));
  assert.equal(new Set(materials.map((value) => JSON.stringify(value))).size, 6);
  assert.ok(materials[1].lowpassHz < materials[0].lowpassHz, 'flood contact must lose the open air before fire does');
  assert.ok(materials[4].lowpassHz > materials[2].lowpassHz, 'fine glass failures need their upper resonances');
  assert.ok(signature(1, .3).layers[0].gain > 0);
  assert.equal(signature(1, .6).layers[0].gain, 0, 'the submerged contact is one finite envelope');
  assert.ok(signature(0, .75).layers[0].gain > signature(0, .3).layers[0].gain, 'the close dry break belongs late in the fire return');
  assert.ok(signature(2, .8).layers[0].hz > signature(2, .2).layers[0].hz);
  assert.ok(signature(2, .2).layers[0].pan * signature(2, .8).layers[0].pan < 0, 'inverted grit crosses to the wrong side');
  assert.ok(materials[3].layers[0].pan * materials[3].layers[1].pan < 0, 'ash bands shear in opposing directions');
  for (let variant = 0; variant < 6; variant += 1) {
    for (const progress of [0, 1]) assert.ok(signature(variant, progress).layers.every((part) => part.gain === 0));
    for (let step = 0; step <= 20; step += 1) {
      const value = signature(variant, step / 20);
      assert.ok(value.layers.every((part) => part.gain >= 0 && part.gain <= .32 && Math.abs(part.pan) <= 1));
      assert.ok(value.lowpassHz >= 320 && value.lowpassHz <= 16000);
    }
  }
});

test('material return graphs resume current saved envelopes without timer drift or fresh scheduled impacts', () => {
  const snapshot = (audio) => audio.nodes.filter((node) => !node.disconnected)
    .map((node) => [node.kind, node.gain.value, node.frequency.value, node.pan.value]);
  for (let variant = 0; variant < 6; variant += 1) {
    const audio = fakeAudio(), sound = createElsewhereBeds({ context: audio.ctx, destination: audio.destination, random: () => .5 });
    const crossing = { id: 'material', variant, phase: 'decohering', reveal: 1, progress: .7, seed: .8 };
    sound.update({ crossing, listener });
    const current = snapshot(audio), nodeCount = audio.nodes.length;
    audio.ctx.currentTime += 1000;
    sound.update({ crossing, listener });
    assert.deepEqual(snapshot(audio), current, 'wall time cannot move a material envelope');
    assert.equal(audio.nodes.length, nodeCount, 'progress updates reuse the material graph');
    assert.ok(audio.nodes.flatMap((node) => [node.gain, node.frequency, node.pan])
      .flatMap((param) => param.calls).every((call) => call.at === 10 || call.at === 1010), 'return contacts must not schedule later impacts');
    const restoredAudio = fakeAudio(), restored = createElsewhereBeds({ context: restoredAudio.ctx, destination: restoredAudio.destination, random: () => .5 });
    restored.update({ crossing: JSON.parse(JSON.stringify(crossing)), listener });
    assert.deepEqual(snapshot(restoredAudio), current, 'a restored visit starts at the saved failure instead of replaying it');
    sound.update({ crossing: { ...crossing, progress: 1 }, listener });
    assert.equal(outputGain(audio, outputs(audio)[0]).gain.value, 0);
    assert.equal(outputs(audio).length, 1);
    sound.stop(); restored.stop();
    assert.ok(audio.nodes.every((node) => node.disconnected));
    assert.ok(audio.nodes.filter((node) => node.starts).every((node) => node.stops.length === 1));
  }
});

test('nearby phone-box ringing uses the GPO double bell and the caller wall destination and gain', () => {
  const audio = fakeAudio(), wall = { name: 'station-wall' }, box = { name: 'kiosk' };
  const line = createPayphoneLine({ context: audio.ctx, destination: audio.destination, box });
  const first = audio.nodes.length;
  const ring = line.ringBellNearby({ destination: wall, pan: -.5, distance01: 1, gain: .5 });
  const ringNodes = audio.nodes.slice(first), tones = ringNodes.filter((node) => node.kind === 'tone');
  assert.deepEqual(tones.map((node) => node.frequency.value), [1150, 1612, 2380, 3170, 20]);
  assert.ok(ringNodes.some((node) => node.connections.includes(wall)));
  assert.ok(ringNodes.every((node) => !node.connections.includes(box) && !node.connections.includes(audio.destination)), 'the ring bypassed the caller wall graph');
  assert.equal(ring.panner.pan.value, -.5);
  assert.equal(ring.seconds, 3);
  const hammerDepth = tones.at(-1).connections[0];
  assert.ok(Math.abs(hammerDepth.gain.value - .022) < 1e-10);
  const gate = ringNodes.find((node) => node.kind === 'gain' && node.gain.calls.some((call) => call.value === 1));
  assert.deepEqual(gate.gain.calls.filter((call) => call.value === 1).map((call) => call.at), [10, 10.6]);
  ring.stop(); ring.stop();
  assert.ok(ringNodes.every((node) => node.disconnected));
  line.destroy();
});

test('finite bells detach on natural completion and line teardown cancels still-ringing bells', () => {
  for (const panner of [true, false]) {
    const audio = fakeAudio({ panner }), line = createPayphoneLine({ context: audio.ctx, destination: audio.destination });
    let first = audio.nodes.length;
    line.ringBellNearby();
    const finished = audio.nodes.slice(first);
    for (const source of finished.filter((node) => node.starts)) source.onended?.();
    assert.ok(finished.every((node) => node.disconnected));
    first = audio.nodes.length;
    line.ringBellNearby();
    const pending = audio.nodes.slice(first);
    line.destroy();
    assert.ok(pending.every((node) => node.disconnected));
    assert.ok(pending.filter((node) => node.starts).every((node) => node.stops.length === 2));
  }
});
