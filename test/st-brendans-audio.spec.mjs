import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { ST_BRENDANS_SOUND, ST_BRENDANS_AUDIO_SOURCES } from '../src/data/st-brendans-audio.js';
import { stBrendansSoundFrame, stBrendansSourceMix, stBrendansAmbienceEvents } from '../src/game/st-brendans-sound.js';
import { createStBrendansAudio, stBrendansImpulse } from '../src/audio/st-brendans.js';
import { ZONE } from '../src/data/floorplan/legend.js';
import { ELLERY_BELLS } from '../src/data/bell-tower.js';
import { createTwoTierBellFrameLayout } from '../src/data/bell-tower-layout.js';

const manifest = JSON.parse(fs.readFileSync('public/audio/st-brendans/manifest.json'));
const stemManifest = JSON.parse(fs.readFileSync('public/assets/audio/bell-tower/manifest.json'));
const bells = createTwoTierBellFrameLayout(ELLERY_BELLS, { centerX: 10, centerZ: 10, lowerFloorY: 10.2, upperPivotY: 15.1 });
const listener = { x: 10, y: 11.8, z: 13, yaw: 0, group: 'cathedral', zone: ZONE.church };
const base = { eligible: true, listener, level: 'belfry', bells };
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

function fixture({ badAmbience = false, badMaterialFile = false, badStems = false, hrtf = true } = {}) {
  const gains = [], sources = [], fetches = [], responses = [];
  const param = () => ({ value: 0, calls: [], setTargetAtTime(...args) { this.value = args[0]; this.calls.push(['target', ...args]); },
    setValueAtTime(...args) { this.value = args[0]; this.calls.push(['set', ...args]); },
    linearRampToValueAtTime(...args) { this.value = args[0]; this.calls.push(['ramp', ...args]); },
    exponentialRampToValueAtTime(...args) { this.value = args[0]; this.calls.push(['exponential', ...args]); }, cancelScheduledValues() {} });
  const node = () => ({ connections: [], connect(other) { this.connections.push(other); return other; }, disconnect() { this.disconnected = true; } });
  const context = { sampleRate: 1000, currentTime: 0,
    createGain() { const n = { ...node(), gain: param() }; gains.push(n); return n; },
    createBiquadFilter: () => ({ ...node(), frequency: param(), Q: {} }),
    createStereoPanner: () => ({ ...node(), pan: param() }),
    createConvolver() { const n = { ...node(), buffers: [] }; Object.defineProperty(n, 'buffer', { get() { return this.buffers.at(-1); }, set(value) { this.buffers.push(value); } }); responses.push(n); return n; },
    createBuffer(n, length, rate) { const channels = Array.from({ length: n }, () => new Float32Array(length)); return { getChannelData: i => channels[i], numberOfChannels: n, sampleRate: rate, duration: length / rate }; },
    createBufferSource() { const n = { ...node(), starts: [], stops: [], playbackRate: {}, start(...args) { this.starts.push(args); }, stop(...args) { this.stops.push(args); } }; sources.push(n); return n; },
    createOscillator() { const n = { ...node(), starts: [], stops: [], frequency: {}, start(...args) { this.starts.push(args); }, stop(...args) { this.stops.push(args); } }; sources.push(n); return n; },
    async decodeAudioData(bytes) { return { duration: new DataView(bytes).getFloat64(0, true), sampleRate: 1000, numberOfChannels: 1 }; },
  };
  if (hrtf) context.createPanner = () => ({ ...node(), positionX: param(), positionY: param(), positionZ: param() });
  const fetcher = async file => {
    fetches.push(file); const bell = file.includes('bell-'); const clip = manifest.clips.find(c => file.endsWith(c.file));
    if (file === '/bank/manifest.json') return { ok: true, json: async () => badAmbience ? { ...manifest, clips: [{ ...manifest.clips[0], file: '../escape.mp3' }] } : manifest };
    if (file === '/stems/manifest.json') return { ok: !badStems, status: badStems ? 404 : 200, json: async () => stemManifest };
    if (badMaterialFile && file.endsWith('louvre-air-b.mp3')) return { ok: false, status: 404 };
    return { ok: true, arrayBuffer: async () => { const b = new ArrayBuffer(8); new DataView(b).setFloat64(0, bell ? 12 : clip.duration, true); return b; } };
  };
  const runtime = createStBrendansAudio({ context, destination: node(), urlFor: f => `/bank/${f}`, fetcher, stemManifestUrl: '/stems/manifest.json' });
  const input = stBrendansSoundFrame(base);
  return { context, runtime, input, gains, sources, fetches, responses };
}

test('source bank has explicit CC0 provenance, identities and bounded finite encoded output', () => {
  assert.equal(manifest.clips.length, 7); assert.equal(ST_BRENDANS_AUDIO_SOURCES.length, 5);
  const bytes = manifest.clips.reduce((n, c) => n + c.bytes, 0), seconds = manifest.clips.reduce((n, c) => n + c.duration, 0);
  assert.ok(bytes < 900000 && seconds < 63);
  const licence = fs.readFileSync('third_party/licenses/ST-BRENDANS-AUDIO.md', 'utf8');
  for (const source of ST_BRENDANS_AUDIO_SOURCES) {
    assert.equal(source.licence, 'CC0 1.0'); assert.match(source.provenance, /record|Rope|wind/i);
    const shipped = manifest.sources.find(s => s.id === source.id);
    assert.equal(shipped.audioSHA, source.audioSHA); assert.match(shipped.pageSHA, /^[a-f0-9]{64}$/);
    assert.equal(shipped.url, source.url); assert.ok(licence.includes(source.url));
    assert.equal(shipped.licenceUrl, 'https://creativecommons.org/publicdomain/zero/1.0/');
  }
  for (const c of manifest.clips) {
    assert.equal(sha(fs.readFileSync(`public/audio/st-brendans/${c.file}`)), c.audioSHA);
    assert.ok(c.measured.finite && c.measured.peakDb < -5 && c.duration > .25);
  }
  assert.match(manifest.limitations.join(' '), /clock-hammer/); assert.match(manifest.limitations.join(' '), /pending/);
});

test('all recording and lifecycle protections silence every path; battle/settings only suppress added ambience', () => {
  const input = stBrendansSoundFrame(base);
  assert.ok(input.active && !input.muted && !input.ambientMuted);
  assert.deepEqual(input.bells.map(b => b.pivot), bells.map(b => b.pivot));
  for (const protection of [{ recording: true }, { listening: true }, { playback: true }, { paused: true }, { focused: false }]) {
    const frame = stBrendansSoundFrame({ ...base, ...protection }); assert.ok(frame.active && frame.muted && frame.ambientMuted);
  }
  for (const protection of [{ battle: true }, { blocked: true }, { effectsMode: 'off' }]) {
    const frame = stBrendansSoundFrame({ ...base, ...protection }); assert.ok(frame.active && !frame.muted && frame.ambientMuted);
  }
  assert.ok(!stBrendansSoundFrame({ ...base, listener: { ...listener, group: 'upper' } }).active);
  assert.ok(stBrendansSoundFrame({ ...base, level: 'ground', listener: { ...listener, y: 1.65, group: 'ground' } }).active);
  assert.ok(!stBrendansSoundFrame({ ...base, level: 'ground', listener: { ...listener, y: 1.65, group: 'ground', zone: ZONE.chapel } }).active);
  assert.ok(!stBrendansSoundFrame({ ...base, eligible: false }).active);
});

test('world pivots stay fixed; turn, elevation, real occlusion and each architectural level change the heard path', () => {
  const point = { x: 5, y: 14, z: 10 };
  const a = stBrendansSourceMix(point, listener, 'belfry'), turn = stBrendansSourceMix(point, { ...listener, yaw: Math.PI }, 'belfry');
  assert.equal(a.distance, turn.distance); assert.ok(a.pan * turn.pan < 0); assert.ok(a.localY > 0);
  const up = stBrendansSourceMix({ ...point, y: 40 }, listener, 'belfry'); assert.ok(up.distance > a.distance && up.direct < a.direct);
  const closed = stBrendansSourceMix({ ...point, occlusionDb: 28 }, listener, 'belfry');
  assert.ok(closed.direct < a.direct * .05 && closed.send < a.send * .07 && closed.cutoff < a.cutoff);
  const turret = stBrendansSourceMix(point, listener, 'turret'), nave = stBrendansSourceMix(point, listener, 'ground'), triforium = stBrendansSourceMix(point, listener, 'loft');
  assert.ok(turret.cutoff < triforium.cutoff && triforium.cutoff < nave.cutoff);
  assert.ok(turret.direct < a.direct && nave.send > a.send);
  let calls = 0; const f = stBrendansSoundFrame({ ...base, occlusion: () => { calls++; return 22; } });
  assert.equal(calls, 8); assert.ok(f.bells.every(b => b.occlusionDb === 22));
});

test('apparatus score has no unsolicited bell strikes, no mechanical backlog, and joins natural air quietly', () => {
  const events = stBrendansAmbienceEvents(0); assert.equal(events.length, 1); assert.equal(events[0].id, 'louvre-air-a'); assert.ok(events[0].at < 0);
  assert.ok(events.every(e => !/bell|priest|amen|choir/.test(e.id)));
  const missed = stBrendansAmbienceEvents(17); assert.ok(!missed.some(e => e.id === 'timber-load'));
  assert.ok(!stBrendansAmbienceEvents(54).some(e => e.id.startsWith('rope')));
  assert.ok(stBrendansAmbienceEvents(53.61, { swinging: true }).some(e => e.id.startsWith('rope')));
  const end = stBrendansAmbienceEvents(0, { carryProgress: 1 }); assert.ok(end.every(e => e.bed && e.gain <= .22));
  for (let t = 0; t < 13700; t += .71) assert.ok(stBrendansAmbienceEvents(t, { swinging: true }).length <= 2);
});

test('synthetic room responses are deterministic, finite, level-specific and bounded', () => {
  const f = fixture();
  const a = stBrendansImpulse(f.context, 'belfry'), b = stBrendansImpulse(f.context, 'belfry'), nave = stBrendansImpulse(f.context, 'nave');
  assert.deepEqual(a.getChannelData(0), b.getChannelData(0)); assert.ok(nave.duration > a.duration);
  assert.ok(nave.duration < 7.3); assert.ok([...nave.getChannelData(0)].every(Number.isFinite));
});

test('banks decode once, 3D bell is world-anchored, battle preserves exact explicit strikes and hard mute cuts all sources', async () => {
  const f = fixture(); const ready = await f.runtime.ready(); assert.deepEqual(ready, { ambience: true, bells: true });
  const fetchCount = f.fetches.length; assert.equal(fetchCount, 2 + manifest.clips.length + stemManifest.entries.length);
  const first = f.runtime.update(f.input); assert.equal(first.ambientCount, 1); assert.match(first.positioning, /HRTF/);
  assert.ok(f.sources[0].starts[0][1] > 19, 're-entry joins current air offset');
  f.runtime.update(f.input); assert.equal(f.runtime.snapshot().scheduled, first.scheduled); assert.equal(f.fetches.length, fetchCount);
  const battle = { ...f.input, ambientMuted: true }; f.runtime.update(battle);
  assert.equal(f.runtime.snapshot().ambientCount, 0);
  assert.ok(f.runtime.strike({ bell: 8, stroke: 'hand', place: 8 }, ELLERY_BELLS[7], { gain: .72 }));
  const strike = f.runtime.snapshot().lastStrike; assert.deepEqual(strike.point, bells[7].pivot); assert.equal(strike.gain, .72); assert.match(strike.mode, /stem/);
  const bellSources = [...f.sources].slice(1); f.context.currentTime = .2; f.runtime.update(battle);
  assert.ok(f.runtime.snapshot().sourceCount > 0, 'battle tick preserves bell tail');
  f.runtime.update({ ...battle, muted: true }); assert.equal(f.runtime.snapshot().sourceCount, 0);
  assert.equal(f.runtime.strike({ bell: 8, stroke: 'hand' }), false); assert.ok(bellSources.every(s => s.stops.length));
  f.runtime.destroy(); assert.equal(f.runtime.update(f.input).active, false);
});

test('long absence stays bounded; no saved damage is replayed, while new breaks keep their physical timing', async () => {
  const f = fixture(); await f.runtime.ready();
  f.runtime.update({ ...f.input, damage: ['frame-shaken'] });
  assert.ok(!f.runtime.snapshot().playing.some(v => v.kind === 'damage'));
  const damageAnchors = { 'lantern-out': { x: 12, y: .2, z: 8 }, 'pulpitum-split': { x: 9, y: 1.2, z: 5 } };
  f.runtime.update({ ...f.input, ambientMuted: true, damage: ['frame-shaken', 'lantern-out'], damageAnchors });
  assert.ok(f.runtime.snapshot().playing.some(v => v.kind === 'damage'));
  f.runtime.update({ ...f.input, ambientMuted: true, damage: ['frame-shaken', 'lantern-out', 'pulpitum-split'], damageAnchors });
  assert.deepEqual(f.runtime.snapshot().sources.find(s => s.id === 'bell:damage:pulpitum-split').point, damageAnchors['pulpitum-split']);
  f.runtime.stop(); f.context.currentTime = 10000;
  f.runtime.update({ ...f.input, damage: ['frame-shaken', 'lantern-out'] });
  assert.ok(!f.runtime.snapshot().playing.some(v => v.kind === 'damage'));
  for (let i = 0; i < 80; i++) f.runtime.strike({ bell: i % 8 + 1, stroke: 'hand' });
  assert.ok(f.runtime.snapshot().sourceCount <= ST_BRENDANS_SOUND.maxSources);
  assert.equal(f.runtime.snapshot().scheduledStrikes, 80, 'new meaningful contacts steal old tails rather than disappear at the voice cap');
  f.runtime.update({ active: false }); assert.equal(f.runtime.snapshot().sourceCount, 0);
});

test('failed material bank is silent independently; bell-bank failure preserves the established audible fallback', async () => {
  const material = fixture({ badAmbience: true, hrtf: false }); assert.deepEqual(await material.runtime.ready(), { ambience: false, bells: true });
  const state = material.runtime.update(material.input); assert.equal(state.ambientCount, 0); assert.ok(state.bankFailure); assert.match(state.positioning, /stereo/);
  assert.ok(material.runtime.strike({ bell: 8, stroke: 'hand' })); assert.match(material.runtime.snapshot().lastStrike.mode, /stem/);
  const partial = fixture({ badMaterialFile: true }); assert.deepEqual(await partial.runtime.ready(), { ambience: false, bells: true });
  partial.runtime.update(partial.input); partial.runtime.strike({ bell: 8, stroke: 'hand' });
  assert.equal(partial.runtime.snapshot().sourceCount, 1, 'a partial bank cannot leak its already-loaded iron contact');
  const tonal = fixture({ badStems: true }); assert.deepEqual(await tonal.runtime.ready(), { ambience: true, bells: false });
  tonal.runtime.update(tonal.input); assert.ok(tonal.runtime.strike({ bell: 8, stroke: 'hand' }));
  assert.equal(tonal.runtime.snapshot().lastStrike.mode, 'synthesis-fallback');
  assert.equal(createStBrendansAudio().update({ active: true }).audible, false);
});

test('room impulses are cached across walks and all convolution memory clears only at hard-protection edges', async () => {
  const f = fixture(); await f.runtime.ready(); f.runtime.update(f.input);
  for (const level of ['turret', 'loft', 'ground', 'belfry']) f.runtime.update({ ...f.input, level });
  const allocated = f.responses.flatMap(r => r.buffers).filter(Boolean);
  const identities = new Set(allocated); assert.equal(identities.size, 4);
  for (const level of ['turret', 'loft', 'ground', 'belfry']) f.runtime.update({ ...f.input, level });
  assert.equal(new Set(f.responses.flatMap(r => r.buffers).filter(Boolean)).size, 4);
  f.runtime.update({ ...f.input, muted: true });
  assert.ok(f.responses.every(r => r.buffers.at(-2) === null), 'all three histories reset before returning');
  const assignments = f.responses.map(r => r.buffers.length); f.runtime.update({ ...f.input, muted: true });
  assert.deepEqual(f.responses.map(r => r.buffers.length), assignments, 'holding REC does not allocate/reset every frame');
  f.runtime.update(f.input); f.runtime.stop(); assert.ok(f.responses.every(r => r.buffers.at(-2) === null));
  assert.equal(new Set(f.responses.flatMap(r => r.buffers).filter(Boolean)).size, 4);
});

test('leaving and re-entering cannot replay saved breaks; hard protections discard missed damage reactions', async () => {
  const f = fixture(); await f.runtime.ready();
  const marks = ['frame-shaken', 'pulpitum-split', 'lantern-out', 'bell-fallen'];
  const damageAnchors = Object.fromEntries(marks.map((mark, index) => [mark, { x: 10 + index, y: index ? 1 : 12, z: 8 }]));
  const damaged = { ...f.input, damage: marks, damageAnchors };
  f.runtime.update(damaged);
  assert.ok(!f.runtime.snapshot().playing.some(v => v.kind === 'damage'), 'first entry only establishes the saved state');
  f.runtime.update(stBrendansSoundFrame({ eligible: false }));
  f.context.currentTime = 3;
  f.runtime.update(damaged);
  assert.ok(!f.runtime.snapshot().playing.some(v => v.kind === 'damage'), 'an empty inactive helper frame cannot look like repaired architecture');
  // Each protection receives changing world state while inaudible. Returning
  // must establish that current state, not deliver a delayed crack or impact.
  for (const protection of [{ recording: true }, { paused: true }, { focused: false }, { listening: true }, { playback: true }]) {
    f.runtime.update({ ...f.input, damage: [], damageAnchors });
    f.runtime.update(stBrendansSoundFrame({ ...base, ...protection, damage: marks, damageAnchors }));
    f.context.currentTime += .2;
    f.runtime.update(damaged);
    assert.ok(!f.runtime.snapshot().playing.some(v => v.kind === 'damage'), `no deferred damage after ${Object.keys(protection)[0]}`);
  }
  // Ordinary battle/world blocking remains different: live physical break
  // reactions still accompany the existing explicit combat event timing.
  f.runtime.update({ ...f.input, damage: [], damageAnchors, ambientMuted: true });
  f.runtime.update({ ...damaged, ambientMuted: true });
  assert.equal(f.runtime.snapshot().playing.filter(v => v.kind === 'damage').length, marks.length);
});
