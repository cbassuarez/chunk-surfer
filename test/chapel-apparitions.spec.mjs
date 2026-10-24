import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as FP from '../src/world/floorplan.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { ZONE } from '../src/data/floorplan/legend.js';
import { CHAPEL_CEILING, CHAPEL_CEILINGS, CHAPEL_CONGREGATION } from '../src/data/chapel-dressing.js';
import { CHAPEL_DRESSING_BOUNDS } from '../src/data/generated/chapel-dressing-geometry.js';
import { chapelDressingWorldPlacements } from '../src/game/chapel-dressing.js';
import {
  CHAPEL_APPARITION, createChapelApparitions, chapelCeilingPlacements, chapelLineOfSight,
  chapelMurmurAt, chapelMurmurVoices,
} from '../src/game/chapel-apparitions.js';
import { chapelMurmurFrame } from '../src/game/chapel-service.js';
import { CHAPEL_MURMUR, createChapelMurmurRuntime, chapelMurmurMix } from '../src/audio/chapel-murmur.js';
import * as REC from '../src/game/recordist.js';
import { ROOM_TONE } from '../src/config.js';

FP.compile(conservatory.levels, conservatory);
const spans = FP.physicalSpanData().cells;
const congregation = chapelDressingWorldPlacements(FP, CHAPEL_DRESSING_BOUNDS).filter((p) => p.kind === 'presence');
const ceiling = chapelCeilingPlacements(FP, CHAPEL_CEILING);
const canSee = (a, b) => chapelLineOfSight(spans, a, b);
const nave = (x, z) => ({ x, y: 4.8 + 1.62, z });
const det3 = (m) => m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
const bearing = (dx, dz) => Math.atan2(dx, -dz);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function run(eye, { seconds = 2, hz = 20, recording = false, takeSeconds = 60, moving = 0, start = 0 } = {}) {
  const rt = createChapelApparitions();
  let frame;
  for (let f = 0; f <= seconds * hz; f++) {
    const t = start + f / hz;
    frame = rt.frame({ congregation, ceiling, eye, timeSec: t, moving, recording, takeProgress: recording ? t / takeSeconds : 0, canSee });
  }
  return frame;
}

test('every ceiling body is placed against the stone it clings to', () => {
  assert.equal(ceiling.length, CHAPEL_CEILING.length, 'none dropped for want of a ceiling');
  for (const p of ceiling) {
    // The room it is in is the span whose air it is in; floors stacked above are not its ceiling.
    const room = (spans.get(`${Math.floor(p.x * 2)},${Math.floor(p.z * 2)}`) || []).find((s) => p.y > s.floor && p.y < s.ceil + .05);
    assert.ok(room, `${p.id} is inside a room`);
    if (p.surface === 'flat') {
      assert.ok(Math.abs(p.y - room.ceil) < .05, `${p.id} is on the flat ceiling (${p.y.toFixed(2)} at ${room.ceil.toFixed(2)})`);
    } else {
      // The vault is the chapel_vault prop's two pitched planes, drawn under the grid's flat top.
      const v = CHAPEL_CEILINGS.vault, u = Math.abs(p.x - v.ridgeX), base = FP.floorAt(Math.round(v.anchor.x * 2), Math.round(v.anchor.y * 2));
      assert.ok(Math.abs(p.y - (base + v.wall + (v.halfSpan - u) / v.halfSpan * (v.ridge - v.wall))) < .05, `${p.id} is on the vault`);
      assert.ok(room.ceil > p.y, `${p.id} is under the room's top`);
    }
    assert.ok(Math.abs(Math.hypot(...p.normal) - 1) < 1e-6 && p.normal[1] < -.8, `${p.id} faces down into the room`);
    assert.ok([ZONE.chapel, ZONE.chapelOuter].includes(p.zone), p.id);
  }
});

test('the bodies are drawn right-handed, and every part has a finite matrix', () => {
  const frame = run(nave(92.5, 70), { seconds: 3 });
  assert.ok(frame.instances.length >= congregation.length * 2 + ceiling.length * 2);
  for (const i of frame.instances) {
    assert.ok(i.matrix.length === 16 && i.matrix.every(Number.isFinite), i.id);
    assert.ok(det3(i.matrix) > 0, `${i.id} is not mirrored`);
    assert.equal(i.blocks, false); assert.equal(i.interactive, false);
  }
});

test('heads come round to you in jumps; directly behind them you are not seen', () => {
  const body = congregation.find((p) => p.id === 'chapel-dressing:presence-28');
  // In front of the body and off to one side, well inside its sight.
  const eye = { x: body.x + 1.4, y: body.y + 1.62, z: body.z + 2.2 };
  const rt = createChapelApparitions();
  const yaws = [];
  let frame;
  for (let f = 0; f <= 80; f++) {
    frame = rt.frame({ congregation, ceiling, eye, timeSec: f / 20, canSee });
    const head = frame.instances.find((i) => i.id === `${body.id}:head`).matrix;
    yaws.push(bearing(-head[8], -head[10]));
  }
  const want = bearing(eye.x - body.x, eye.z - body.z);
  assert.ok(Math.abs(wrap(yaws.at(-1) - want)) < 22 * Math.PI / 180, 'its head is on you after four seconds');
  const steps = yaws.slice(1).map((y, i) => Math.abs(wrap(y - yaws[i])));
  // Between snaps a head only trembles (about a degree); a snap is several times that in one frame.
  const snaps = steps.filter((s) => s > 4 * Math.PI / 180).length;
  assert.ok(snaps >= 2 && snaps < steps.length / 4, `it turned in a few snaps (${snaps}), not a pan`);
  assert.ok(steps.filter((s) => s < 2.5 * Math.PI / 180).length > steps.length / 2, 'and between snaps it only trembled');
  // Behind: its head stays toward the altar.
  const behind = { x: body.x, y: body.y + 1.62, z: body.z - 2.5 };
  const back = run(behind, { seconds: 3 });
  const voice = back.voices.find((v) => v.id === body.id);
  assert.equal(voice.seen, false);
});

test('stone stands between: the nave cannot watch you through its wall', () => {
  assert.equal(canSee(nave(92.5, 70), nave(92.5, 62)), true, 'open nave');
  assert.equal(canSee(nave(92.5, 70), nave(80.5, 66)), false, 'through the west wall');
  const outside = run(nave(80.5, 66), { seconds: 1.5 });
  assert.equal(outside.watchers, 0);
  assert.ok(chapelMurmurAt(outside.voices, nave(80.5, 66)) < ROOM_TONE.spoilNoise * .25);
});

test('a still take in the chapel is the hardest in the building: most of the nave spoils, the altar-rail corner survives', () => {
  // Measured seconds before the murmur reaches SPOIL for a still recordist.
  const spoilAt = (eye) => {
    const rt = createChapelApparitions();
    for (let f = 0; f <= 60 * 8; f++) {
      const t = f / 8;
      const frame = rt.frame({ congregation, ceiling, eye, timeSec: t, recording: true, takeProgress: t / 60, canSee });
      if (chapelMurmurAt(frame.voices, eye) > ROOM_TONE.spoilNoise) return t;
    }
    return Infinity;
  };
  const underGallery = spoilAt(nave(89.25, 65.75)), middle = spoilAt(nave(92.25, 72.75)), corner = spoilAt(nave(87.25, 82.75));
  assert.ok(underGallery < 10, `under the gallery the ceiling ruins it at once (${underGallery}s)`);
  assert.ok(middle > 5 && middle < ROOM_TONE.minimumTakeSeconds, `the middle of the pews never reaches the minimum (${middle}s)`);
  assert.ok(corner > ROOM_TONE.minimumTakeSeconds, `the corner by the altar rail can be had (${corner}s)`);
  // And the room is worse at the end of a take than at its start, in the same place.
  const eye = nave(92.25, 72.75);
  const early = chapelMurmurAt(run(eye, { recording: true, seconds: 2 }).voices, eye);
  const late = chapelMurmurAt(run(eye, { recording: true, seconds: 2, start: 56 }).voices, eye);
  assert.ok(late > early * 1.6, `a rolling take winds them up (${early.toFixed(3)} → ${late.toFixed(3)})`);
});

test('moving brings more heads round, and the murmur with them', () => {
  const eye = nave(95.5, 76);
  const still = chapelMurmurAt(run(eye, { seconds: 3 }).voices, eye);
  const moving = chapelMurmurAt(run(eye, { seconds: 3, moving: 1 }).voices, eye);
  assert.ok(moving > still, `${moving} > ${still}`);
});

test('the murmur reaches the audio as a few positioned mouths', () => {
  const eye = nave(92.5, 70), frame = run(eye, { seconds: 2 });
  const voices = chapelMurmurVoices(frame.voices, eye);
  assert.ok(voices.length > 0 && voices.length <= CHAPEL_APPARITION.murmur.voices);
  assert.ok(voices.every((v, i) => i === 0 || v.gain <= voices[i - 1].gain), 'loudest first');
  const total = Math.hypot(...voices.map((v) => v.gain)) * ROOM_TONE.spoilNoise;
  assert.ok(total <= chapelMurmurAt(frame.voices, eye) + 1e-9, 'the mouths never add up to more than the room');
});

test('the recorder marks a steady murmur every few seconds, and always marks the spoil', () => {
  REC.startListening(); assert.equal(REC.startRecording({ slate: false }), true);
  for (let i = 0; i < 120; i++) {
    REC.emitRoomSourceNoise(ROOM_TONE.spoilNoise * .6, 0, 0, 'the congregation', { sourceId: 'chapel-congregation', continuous: true });
    REC.tickRecording(1 / 20);
  }
  assert.equal(REC.recState().spoiled, false);
  assert.equal(REC.recState().takeEvents.length, 3, 'six seconds of murmur is three near misses, not a hundred and twenty');
  REC.emitRoomSourceNoise(ROOM_TONE.spoilNoise * 1.2, 0, 0, 'the congregation', { sourceId: 'chapel-congregation', continuous: true });
  assert.equal(REC.recState().spoiled, true);
  assert.equal(REC.recState().spoilReason, 'the congregation');
  assert.equal(REC.recState().takeEvents.at(-1).kind, 'spoil');
  assert.equal(REC.recState().spoilMeta.audibleToHush, false, 'the room is not him: nothing is sent after him for it');
});

test('a take never mutes the murmur; pause, a fight and playback do', () => {
  const listener = { x: 92.5, y: 6.42, z: 70, group: 'upper', zone: ZONE.chapel };
  const voices = [{ id: 'a', x: 92, y: 6, z: 72, gain: .8 }];
  assert.equal(chapelMurmurFrame({ eligible: true, listener, voices }).muted, false);
  for (const key of ['playback', 'paused', 'blocked', 'battle', 'suppressActors'])
    assert.equal(chapelMurmurFrame({ eligible: true, listener, voices, [key]: true }).muted, true, key);
  assert.equal(chapelMurmurFrame({ eligible: true, listener, voices, effectsMode: 'off' }).active, false);
  assert.equal(chapelMurmurFrame({ eligible: true, listener: { ...listener, zone: ZONE.church }, voices }).active, false);
  assert.doesNotMatch(chapelMurmurFrame.toString(), /recording|listening/, 'the take is what it is for');
});

test('the murmur is grains of the service, low-passed past words, and bounded', () => {
  const sources = [], filters = [];
  const param = () => ({ value: 0, setTargetAtTime(v) { this.value = v; }, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} });
  const node = () => ({ connect(other) { return other; }, disconnect() {} });
  const context = { currentTime: 0, sampleRate: 1000,
    createGain: () => ({ ...node(), gain: param() }), createConvolver: () => node(),
    createBiquadFilter: () => { const f = { ...node(), frequency: param(), Q: {}, type: '' }; filters.push(f); return f; },
    createStereoPanner: () => ({ ...node(), pan: param() }),
    createBuffer: (n, length) => { const c = Array.from({ length: n }, () => new Float32Array(length)); return { getChannelData: (i) => c[i] }; },
    createBufferSource() { const s = { ...node(), playbackRate: { value: 1 }, starts: [], start(...a) { this.starts.push(a); }, stop() {} }; sources.push(s); return s; },
  };
  const asked = [];
  const runtime = createChapelMurmurRuntime({ context, destination: node(),
    bufferFor: (id) => { asked.push(id); return { duration: 12 }; }, random: () => .5 });
  const listener = { x: 92.5, y: 6.42, z: 70 };
  const voices = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, x: 90 + i, y: 6, z: 72, gain: 1 }));
  for (let f = 0; f < 120; f++) { context.currentTime = f / 60; runtime.update({ active: true, voices, listener }); }
  // The fake never ends a grain, so the cap is what stops the count.
  assert.equal(sources.length, CHAPEL_MURMUR.maxGrains, 'a steady babble at the spoil level, and never more than the cap');
  assert.ok(new Set(asked).size > 1 && [...new Set(asked)].every((id) => CHAPEL_MURMUR.clips.includes(id)), 'cut from the service recitation only');
  assert.ok(sources.every((s) => s.playbackRate.value >= CHAPEL_MURMUR.rate[0] && s.playbackRate.value <= CHAPEL_MURMUR.rate[1]));
  assert.ok(sources.every((s) => s.starts[0][2] <= CHAPEL_MURMUR.grainSeconds[1] * CHAPEL_MURMUR.rate[1] + 1e-9), 'grains, not phrases');
  assert.ok(filters.filter((f) => f.type === 'lowpass').every((f) => f.frequency.value <= CHAPEL_MURMUR.cutoffHz), 'no word survives');
  assert.ok(runtime.frame().grains <= CHAPEL_MURMUR.maxGrains);
  const before = sources.length;
  for (let f = 120; f < 180; f++) { context.currentTime = f / 60; runtime.update({ active: true, muted: true, voices, listener }); }
  assert.equal(sources.length, before, 'muted, nothing new is cut');
  assert.equal(runtime.frame().grains, 0);
  const behind = chapelMurmurMix({ x: 92.5, y: 6, z: 74 }, listener, 0), ahead = chapelMurmurMix({ x: 92.5, y: 6, z: 66 }, listener, 0);
  assert.ok(behind.cutoff < ahead.cutoff, 'from behind it is darker');
  assert.equal(createChapelMurmurRuntime().update({ active: true }).audible, false, 'no audio, nothing thrown');
});

test('main gives the chapel its own rule and nobody else', () => {
  const main = fs.readFileSync('src/main.js', 'utf8');
  assert.match(main, /suppressActors:suppressActors\|\|PB\.isPlaying\(\)\|\|\(REC\.isRecording\(\)&&!recording\)/, 'a chapel take does not hide the chapel');
  assert.match(main, /tickRecorder\(dt\);\n\s+landChapelMurmurOnTake\(\);/, 'the murmur lands on the take on the world tick');
  assert.match(main, /'the congregation',\{sourceId:'chapel-congregation',kind:'congregation_murmur',continuous:true\}/);
  const brendan = main.slice(main.indexOf('brendanPresenceSubmitted=stBrendansPresenceRenderInstances'));
  assert.match(brendan.slice(0, 600), /REC\.isRecording\(\)/, "St Brendan's keeps its own rule for a take");
  for (const file of ['src/game/chapel-apparitions.js', 'src/audio/chapel-murmur.js'])
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /\bhold|\bheld/i, `${file} uses a ruled-out word`);
  assert.equal(CHAPEL_CONGREGATION.length, 48);
});
