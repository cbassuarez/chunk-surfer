import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import * as FP from '../src/world/floorplan.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { CHAPEL_DRESSING_MESH as M, CHAPEL_CEILING, CHAPEL_CEILINGS, CHAPEL_CONGREGATION } from '../src/data/chapel-dressing.js';
import { CHAPEL_DRESSING_BOUNDS as BOUNDS, CHAPEL_PRESENCE_PIVOTS as PIVOTS } from '../src/data/generated/chapel-dressing-geometry.js';
import { chapelDressingWorldPlacements, chapelDressingRenderInstances } from '../src/game/chapel-dressing.js';
import { createChapelApparitions, chapelCeilingPlacements, chapelLineOfSight, chapelMurmurAt } from '../src/game/chapel-apparitions.js';
import { chapelServiceFrame, chapelServiceWorldSources } from '../src/game/chapel-service.js';
import { ZONE } from '../src/data/floorplan/legend.js';
import { CHAPEL_CHOIR_PERFORMANCE as recording } from '../src/data/generated/chapel-choir-performance.js';
import { chapelChoirPose, chapelChoirVocalEnergy } from '../src/game/chapel-choir-performance.js';
import { CHAPEL_CHOIR_SCORE } from '../src/data/chapel-choir.js';
import { controlAt } from '../src/audio/chapel-choir-score.js';

const singer = { id: 'test-singer', role: 'congregant', figure: 'kneeling', row: 8,
  bank: 0, seat: 0, x: 0, y: 4.8, z: 0, scale: 1,rapture:{height:1.65,delay:0} };
const pose = (phase, options = {}) => chapelChoirPose({ phase, presence: singer, fervour:1,elapsed:phase,...options });
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} ~= ${b}`);
const quiet = { singing: false, jaw: 0, breathe: 0, lift: 0, headPitch: 0, roll: 0,
  activity: 0, phraseLift: 0 };
const assertQuiet = p => {
  assert.equal(p.singing, false);
  for (const key of Object.keys(quiet).filter(k => k !== 'singing')) near(p[key], 0);
};

function shippedPCM() {
  const wav = fs.readFileSync(new URL('../public/audio/chapel-choir/sicut-kyrie-i.wav', import.meta.url));
  let sampleRate, channels, bits, pcm;
  for (let at = 12; at + 8 <= wav.length;) {
    const name = wav.toString('ascii', at, at + 4), size = wav.readUInt32LE(at + 4);
    if (name === 'fmt ') {
      assert.equal(wav.readUInt16LE(at + 8), 1, 'uncompressed PCM source');
      channels = wav.readUInt16LE(at + 10);
      sampleRate = wav.readUInt32LE(at + 12);
      bits = wav.readUInt16LE(at + 22);
    }
    if (name === 'data') pcm = wav.subarray(at + 8, at + 8 + size);
    at += 8 + size + (size & 1);
  }
  assert.equal(channels, 1); assert.equal(bits, 16); assert.ok(pcm);
  const rms = (from, to) => {
    let sum = 0, count = 0;
    for (let i = Math.ceil(from * sampleRate); i < Math.min(pcm.length / 2, to * sampleRate); i++) {
      sum += (pcm.readInt16LE(i * 2) / 32768) ** 2; count++;
    }
    return Math.sqrt(sum / Math.max(1, count));
  };
  return { wav, sampleRate, duration: pcm.length / 2 / sampleRate, rms };
}

test('the vocal envelope identifies the shipped raw recording, including its actual quiet tail', () => {
  const source = shippedPCM();
  assert.equal(createHash('sha256').update(source.wav).digest('hex'), recording.sourceSHA256);
  assert.equal(recording.duration, source.duration);
  assert.equal(recording.hz, 40);
  assert.equal(recording.levels.length, Math.ceil(source.duration * recording.hz) + 1);
  assert.ok(recording.levels.every(n => Number.isInteger(n) && n >= 0 && n <= 255));
  assert.ok(source.rms(30, 60) > .02, 'the unmodulated recording really contains voices');
  assert.ok(source.rms(82, 88) < 1 / 32768, 'the padded quiet interval is in the PCM, not an invented rest');
  assert.ok(chapelChoirVocalEnergy(48) > .7);
  assert.equal(chapelChoirVocalEnergy(84), 0);
  assert.equal(pose(48).singing, true);
  assertQuiet(pose(84));
});

test('vocal activity interpolates within raw frames and rejects a phase outside the recording', () => {
  const index = 101, from = index / recording.hz, to = (index + 1) / recording.hz;
  near(chapelChoirVocalEnergy((from + to) / 2), (recording.levels[index] + recording.levels[index + 1]) / 510);
  for (const phase of [-1, 88, 100, NaN, Infinity, -Infinity]) {
    assert.equal(chapelChoirVocalEnergy(phase), 0);
    assert.deepEqual(pose(phase), quiet);
  }
});

test('electronic interruptions do not close mouths or drop bodies on every gain pulse', () => {
  const rows = [];
  for (let i = 0; i < 500; i++) {
    const phase = 48 + i / 1000;
    rows.push({ control: controlAt(phase, 0, CHAPEL_CHOIR_SCORE), pose: pose(phase) });
  }
  const shut = rows.filter(r => r.control < .01), open = rows.filter(r => r.control > .8);
  assert.ok(shut.length > 100 && open.length > 20, 'this window exercises real open and closed PWM intervals');
  for (const r of rows) {
    assert.equal(r.pose.singing, true);
    assert.ok(r.pose.jaw > .2, 'sustained raw singing underneath the electronic gate');
    near(r.pose.lift, 1.65);
  }
  assert.ok(Math.max(...rows.slice(1).map((r, i) => Math.abs(r.pose.jaw - rows[i].pose.jaw))) < .01,
    'presentation changes at vocal-envelope speed, not the electronic carrier rate');
});

test('ascent gathers through the passage, releases before the loop, and can re-enter at the current phrase', () => {
  near(pose(0).lift, 0);
  assert.ok(pose(16).lift > pose(6).lift);
  assert.ok(pose(32).lift > pose(16).lift);
  near(pose(52).lift, 1.65);
  assert.ok(pose(68).lift < pose(58).lift && pose(77).lift < pose(68).lift);
  near(pose(81).lift, 0);
  assertQuiet(pose(87.999));
  assertQuiet(pose(0));
  assert.deepEqual(pose(52, { active: false }), quiet);
  assert.deepEqual(pose(52), pose(52), 'joining mid-passage is a deterministic target, not a new private timeline');
});

test('row release, grounded celebrant, smaller server ascent and motion preference retain an understandable song', () => {
  const front = pose(16, { presence: { ...singer, row: 8 } });
  const rear = pose(16, { presence: { ...singer, row: 0, bank: 1, seat: 2 } });
  assert.ok(front.lift > rear.lift, 'the authored row release is spatial rather than random');
  const full = pose(52), reduced = pose(52, { reducedMotion: true });
  assert.equal(reduced.singing, true);
  assert.ok(reduced.jaw > 0 && reduced.jaw <= full.jaw);
  near(reduced.lift, full.lift * .32);
  assert.equal(reduced.roll, 0);
  const celebrant = pose(52, { presence: { ...singer, role: 'celebrant', figure: 'celebrant' } });
  assert.equal(celebrant.lift, 0); assert.equal(celebrant.singing, true);
  assert.equal(pose(52, { presence: { ...singer, role: 'acolyte', figure: 'acolyte' } }).lift,0);
});

test('a low ceiling limits ascent, with explicit clearance, including actor scale and ground datum', () => {
  for (const scale of [.7, 1, 1.3]) {
    const presence = { ...singer, scale }, room = presence.y + 1.77 * scale + .35 + .42;
    near(pose(52, { presence, ceilingY: room }).lift, .42);
    assert.equal(pose(52, { presence, ceilingY: presence.y + 1.77 * scale + .34 }).lift, 0);
    assert.ok(pose(52, { presence, ceilingY: room }).lift <= room - presence.y - 1.77 * scale - .35 + 1e-9);
  }
  const full = pose(52);
  near(pose(52, { amount: .5 }).lift, full.lift * .5);
  near(pose(52, { amount: .5 }).jaw, full.jaw * .5);
  assert.equal(pose(52, { amount: -1 }).lift, 0);
  near(pose(52, { amount: 2 }).lift, full.lift);
  for (let i = 0; i <= recording.duration * 40; i++) {
    const p = pose(i / 40, { ceilingY: 8.45 });
    assert.ok(Object.entries(p).every(([key, value]) => key === 'singing' || Number.isFinite(value)));
    assert.ok(p.jaw >= 0 && p.jaw <= .4 && p.lift >= 0 && p.lift <= 1.65);
  }
});

FP.compile(conservatory.levels, conservatory);
const placements = chapelDressingWorldPlacements(FP, BOUNDS);
const congregation = placements.filter(p => p.kind === 'presence');
const ceiling = chapelCeilingPlacements(FP, CHAPEL_CEILING);
const spans = FP.physicalSpanData().cells;
const eye = { x: 92.25, y: 6.42, z: 72.75 };
const canSee = (a, b) => chapelLineOfSight(spans, a, b);
const choirAt = phase => ({ audible: true, loaded: true, phase,elapsed:phase,fervour:1,arrivalEnvelope:1 });
const apply = (m, p) => [0, 1, 2].map(r => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
function transformedBounds(instance) {
  const b = BOUNDS[instance.mesh]; assert.ok(b, `packed bounds for ${instance.mesh}`);
  const points = [];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]])
    points.push(apply(instance.matrix, [x, y, z]));
  return { min: [0, 1, 2].map(i => Math.min(...points.map(p => p[i]))),
    max: [0, 1, 2].map(i => Math.max(...points.map(p => p[i]))) };
}
const determinant = m => m[0] * (m[5] * m[10] - m[6] * m[9])
  - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);

test('world placement carries the real floor, row and ceiling metadata into musical poses', () => {
  assert.equal(congregation.length, 48);
  for (const p of congregation) {
    const authored = CHAPEL_CONGREGATION.find(v => v.id === p.id); assert.ok(authored);
    assert.equal(p.row, authored.row); assert.equal(p.bank, authored.bank); assert.equal(p.seat, authored.seat);
    assert.ok(Number.isFinite(p.ceilingY) && p.ceilingY > p.y);
    assert.equal(p.blocks, false); assert.equal(p.interactive, false);
  }
});

test('singing changes presentation while canonical sight, recording murmur and ceiling figures stay exact through two audio wraps', () => {
  const ordinary = createChapelApparitions(), musical = createChapelApparitions();
  const times = [...Array.from({ length: 40 }, (_, i) => i / 10),
    ...Array.from({ length: 31 }, (_, i) => 47 + i / 10),
    ...Array.from({ length: 61 }, (_, i) => 86 + i / 20),
    ...Array.from({ length: 61 }, (_, i) => 174 + i / 20)];
  let presented = false;
  for (const timeSec of times) {
    const input = { congregation, ceiling, eye, timeSec: 1000 + timeSec, moving: .3,
      recording: true, takeProgress: .6, canSee };
    const a = ordinary.frame(input), b = musical.frame({ ...input, choir: choirAt(timeSec % 88) });
    assert.equal(b.watchers, a.watchers);
    assert.equal(b.agitation, a.agitation);
    assert.deepEqual(b.voices, a.voices, `canonical voices at ${timeSec}s`);
    assert.equal(chapelMurmurAt(b.voices, eye), chapelMurmurAt(a.voices, eye));
    const ceilingIds = new Set(ceiling.map(p => p.id));
    const ceilingParts = frame => frame.instances.filter(i => ceilingIds.has(i.id.replace(/:head$/, '')));
    assert.deepEqual(ceilingParts(b), ceilingParts(a), 'ceiling crawlers keep their existing rule');
    if (timeSec >= 47 && timeSec < 50) presented ||= b.instances.some(i => i.id.endsWith(':jaw'));
  }
  assert.ok(presented, 'the comparison actually exercised the singing presentation');
});

test('the complete transformed body, head and hinged jaw fit under the actual chapel ceiling at peak ascent', () => {
  const rt = createChapelApparitions();
  let frame;
  for (let i = 0; i <= 180; i++) {
    frame = rt.frame({ congregation, eye, timeSec: 400 + i / 20, choir: choirAt(48 + i / 20), canSee });
    for (const instance of frame.instances) {
      const p = congregation.find(v => instance.id === v.id || instance.id.startsWith(`${v.id}:`)); assert.ok(p);
      assert.equal(instance.matrix.length, 16);
      assert.ok(instance.matrix.every(Number.isFinite), instance.id);
      assert.ok(determinant(instance.matrix) > 0, `${instance.id} is right-handed`);
      assert.equal(instance.blocks, false); assert.equal(instance.interactive, false); assert.equal(instance.noShadow, true);
      const bounds = transformedBounds(instance);
      // The pitched vault is drawn beneath the plan's bounding ceiling.
      const vault = CHAPEL_CEILINGS.vault;
      const base = FP.floorAt(Math.round(vault.anchor.x * 2), Math.round(vault.anchor.y * 2));
      const pitchedY = base + vault.wall + (vault.halfSpan - Math.abs(p.x - vault.ridgeX)) / vault.halfSpan * (vault.ridge - vault.wall);
      const actualCeiling = Math.min(p.ceilingY, pitchedY);
      assert.ok(bounds.max[1] <= actualCeiling - .35 + 1e-6,
        `${instance.id} top ${bounds.max[1]} clears ${actualCeiling}`);
      assert.ok(bounds.min[1] >= p.y - .025, `${instance.id} never drops through the floor`);
      near(instance.matrix[12], instance.x); near(instance.matrix[13], instance.y); near(instance.matrix[14], instance.z);
    }
  }
  assert.equal(frame.singing.length, 48);
  for (const p of congregation.filter(p => p.role === 'congregant')) {
    const performed = frame.singing.find(v => v.id === p.id);
    const target = chapelChoirPose({ phase: 57, presence: p,fervour:1,elapsed:57 });
    near(performed.lift, target.lift, 1e-5);
    assert.equal(performed.lift>0,!!p.rapture, `${p.id} has an individual, explicit ascent assignment`);
  }
  for (const p of congregation) {
    const head = frame.instances.find(i => i.id === `${p.id}:head`);
    const jaw = frame.instances.find(i => i.id === `${p.id}:jaw`);
    assert.equal(head.mesh, M.singingHead); assert.equal(jaw.mesh, M.singingJaw);
    assert.equal(head.apparitionVariant, 0); assert.equal(jaw.apparitionVariant, 0);
    const hinge = apply(head.matrix, PIVOTS[p.figure].jaw);
    for (let axis = 0; axis < 3; axis++) near(jaw.matrix[12 + axis], hinge[axis], 1e-7);
    const mouth = frame.singing.find(i => i.id === p.id).mouth;
    const expected = apply(head.matrix, [0, -.04, -.14]);
    for (const [axis, key] of ['x', 'y', 'z'].entries()) near(mouth[key], expected[axis], 1e-7);
  }
});

test('pause or focus protection freezes the musical pose, then recovers smoothly and retires the singing rig', () => {
  const rt = createChapelApparitions(), p = congregation.filter(p => p.role === 'congregant')
    .sort((a, b) => chapelChoirPose({ phase: 52, presence: b,fervour:1,elapsed:52 }).lift - chapelChoirPose({ phase: 52, presence: a,fervour:1,elapsed:52 }).lift)[0];
  const input = { congregation: [p], eye: null, timeSec: 100, choir: choirAt(52) };
  assert.equal(rt.frame({...input,timeSec:90}).singing[0].lift,0,'a fresh runtime never pops bodies into the air');
  for(let t=90.05;t<100;t+=.05)rt.frame({...input,timeSec:t});
  const initial = rt.frame(input), first = initial.singing[0];
  near(first.lift, chapelChoirPose({ phase: 52, presence: p,fervour:1,elapsed:52 }).lift,1e-5);
  assert.ok(first.lift > 0 && first.jaw > .2);
  const upwardHead = initial.instances.find(i => i.id === `${p.id}:head`);
  assert.ok(-upwardHead.matrix[9] > .1, 'the singing face intentionally tips up, rather than looking from an obsolete floor-height neck');
  for (let i = 1; i <= 20; i++) {
    const frozen = rt.frame({ ...input, timeSec: 100 + i / 10, choir: { ...choirAt(0), audible: false, frozen: true } }).singing[0];
    for (const key of ['lift', 'jaw', 'breathe', 'blend']) near(frozen[key], first[key]);
  }
  let frame = rt.frame({ ...input, timeSec: 102.05, choir: { audible: false, loaded: true, phase: 0 } });
  assert.ok(frame.singing[0].lift < first.lift && frame.singing[0].lift > first.lift - .25);
  for (let i = 2; i <= 100; i++) frame = rt.frame({ ...input, timeSec: 102 + i / 20,
    choir: { audible: false, loaded: true, phase: 0 } });
  assert.ok(frame.singing[0].lift < .002 && frame.singing[0].jaw < .001);
  assert.equal(frame.instances.some(i => i.id.endsWith(':jaw')), false);
  assert.equal(frame.instances.find(i => i.id.endsWith(':head')).mesh, M.head);
  const unready = createChapelApparitions().frame({ ...input, choir: { audible: true, loaded: false, phase: 52 } });
  assert.equal(unready.instances.some(i => i.id.endsWith(':jaw')), false, 'no pretend singing while the real bank is unavailable');
});

test('the presentation reaches the normal dressing path and respects actor suppression and motion settings', () => {
  const rt = createChapelApparitions();
  let captured;
  for(let t=90;t<100;t+=.05)chapelDressingRenderInstances(placements,{group:'upper',apparitions:rt,listener:eye,eye,timeSec:t,choir:choirAt(52),reducedMotion:true});
  const props = chapelDressingRenderInstances(placements, { group: 'upper', apparitions: rt,
    listener: eye, eye, timeSec: 100, choir: choirAt(52), reducedMotion: true,
    onFrame: f => captured = f });
  assert.ok(props.some(p => p.mesh === M.singingJaw));
  assert.ok(captured.singing.some(p => p.lift > .4 && p.lift < .6));
  for (const options of [{ suppressActors: true }, { effectsMode: 'off' }]) {
    captured = 'not called';
    const hidden = chapelDressingRenderInstances(placements, { group: 'upper', apparitions: rt,
      choir: choirAt(52), onFrame: f => captured = f, ...options });
    assert.equal(captured, null);
    assert.ok(hidden.length > 0 && hidden.every(p => p.kind !== 'presence'), 'authored paint remains after actors disappear');
  }
});

test('the actual production audio tick follows the raised front station without changing the floor, rear projection or murmur', () => {
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const code = main.match(/function tickChapelServiceAudio\(\)\{[\s\S]*?\n\}/)?.[0]; assert.ok(code);
  const sources = chapelServiceWorldSources(FP);
  const input = chapelServiceFrame({ eligible: true, sources,
    listener: { ...eye, ground: 4.8, group: 'upper', zone: ZONE.chapel } });
  const original = structuredClone(input), calls = [];
  const context = { currentChapelServiceInput: () => input, currentChapelMurmurInput: () => ({ murmur: true }),
    chapelChoirAudioFrame: {}, chapelServiceAudioFrame: {}, chapelMurmurAudioFrame: {},
    chapelApparitionLast: { singing: [{ id: 'chapel-dressing:presence-44', lift: 1.5 }] },
    chapelChoirAudio: { update: value => { calls.push(['choir', value]); return { loaded: true }; } },
    chapelServiceAudio: { update: value => calls.push(['legacy', value]) },
    chapelMurmurAudio: { update: value => calls.push(['murmur', value]) } };
  vm.createContext(context); vm.runInContext(code, context); context.tickChapelServiceAudio();
  const musical = calls.find(c => c[0] === 'choir')[1];
  for (const voice of input.voices) {
    const moved = musical.voices.find(v => v.id === voice.id);
    near(moved.dy, voice.dy + (voice.id === 'front' ? 1.5 : 0));
    for (const key of ['dx', 'dz', 'gain', 'occlusionDb']) assert.equal(moved[key], voice[key]);
  }
  assert.deepEqual(input, original, 'canonical service input is not mutated');
  assert.equal(musical.muted, false);
  assert.equal(musical.voices.find(p => p.id === 'front').gain, 1, 'a risen singer is still on the chapel slab');
  assert.equal(calls.find(c => c[0] === 'legacy')[1].muted, true);
  assert.equal(calls.find(c => c[0] === 'murmur')[1].murmur, true);
  assert.match(main, /choir:\{\.\.\.chapelChoirAudioFrame,frozen:paused\|\|!gameplayInputLifecycleActive\(\)\}/);
  assert.match(main, /reducedMotion:shakeMode\(\)!=='full'/);
});
