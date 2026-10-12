// The reward for quieting the practice wing: the student through the wall. This
// pins that it enacts exactly what Source files under STUDENT FILE and in that
// order, that the student only ever quotes, that the HUSH never speaks, that
// every sound the scene fires is on a line that exists, and what the wall plays.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHUNK_SURF_ROOMS } from '../src/data/chunk-surf-script.js';
import {
  STUDENT_BAR_STOPS, STUDENT_WALL, createStudentWall, studentBarNotes, studentCorrectionTone, studentKnockTimes, studentScaleNotes,
} from '../src/audio/student-wall.js';
import { PRACTICE_RETURN_LAG_MS } from '../src/audio/practice-click.js';
import { SEAM } from '../src/game/practice-seams.js';
import { inferredSignalRole, isTraceSource } from '../src/narrative/signal-role.js';

const near = (a, b, tol, message) => assert.ok(Math.abs(a - b) <= tol, `${message} (${a} vs ${b})`);
const doc = JSON.parse(readFileSync('content/narrative/practice-wing.student.story.json', 'utf8'));
const main = readFileSync('src/main.js', 'utf8');
const lines = Object.values(doc.nodes).flatMap((node) => node.lines || []);

// ── registered and reachable ──────────────────────────────────────────────
{
  const project = JSON.parse(readFileSync('content/project.json', 'utf8'));
  assert.ok(project.narrative.includes('narrative/practice-wing.student.story.json'));
  assert.ok(project.timeline.find((t) => t.id === 'runtime').documents.includes('practice-wing.student'));
  for (const id of ['start', 'wall', 'knock', 'who', 'tune', 'want', 'leave']) assert.ok(doc.nodes[id], `${id} is written`);
  assert.equal(doc.nodes.start.goto, 'wall', 'overheard first, then the wall');
  assert.ok(!doc.nodes.leave.goto && !doc.nodes.leave.choices, 'leaving ends it');
  for (const node of ['knock', 'who', 'tune', 'want']) assert.equal(doc.nodes[node].goto, 'wall', `${node} goes back to the wall`);
}

// ── it is what Source files ──────────────────────────────────────────────
{
  const record = CHUNK_SURF_ROOMS.find((room) => room.id === 'surfer-origin').record.toLowerCase();
  for (const piece of ['scales', 'correction tone', 'retain the reference', 'same bar again', 'emptied']) {
    assert.ok(record.includes(piece), `Source's STUDENT FILE still records "${piece}"`);
  }
  const start = doc.nodes.start.lines.map((line) => line.text.toLowerCase());
  const at = (pattern) => start.findIndex((text) => pattern.test(text));
  const scale = at(/a scale/), correction = at(/correction/), reference = at(/^retain the reference\.$/), bar = at(/^a bar\./), again = at(/the bar again/);
  assert.ok(scale >= 0 && correction > scale && reference > correction && bar > reference && again > bar,
    `the wall plays it in Source's order (${[scale, correction, reference, bar, again].join(', ')})`);
  assert.equal(doc.nodes.start.lines[reference].who, 'institution', 'the teaching voice is the institution');
  assert.match(doc.nodes.start.lines[again].text, /teaching voice does not come back/i, 'the bar goes on after the room has emptied');
}

// ── who may speak ─────────────────────────────────────────────────────────
for (const line of lines) {
  assert.notEqual(String(line.who).toLowerCase(), 'hush', 'the HUSH never speaks');
  assert.doesNotThrow(() => inferredSignalRole(line.who));
  if (line.who === 'surfer') {
    assert.ok(isTraceSource(line.quotes), `${line.id} quotes where it heard it`);
    assert.equal(line.quotes, 'rehearsal', `${line.id} only has the rehearsal room to quote`);
  }
}
assert.ok(lines.filter((line) => line.who === 'surfer').every((line) => ['Again.', 'Retain the reference.', 'Sixteen flat.'].includes(line.text)),
  'the student has nothing of its own to say');
assert.equal(doc.nodes.wall.choices.find((c) => c.goto === 'tune').if, 'practice.trace.marks>=1', 'it can only be told it was in tune by someone who read the marks');
assert.doesNotMatch(JSON.stringify(doc), /\bhold|\bheld/i, 'the scene uses a ruled-out word');
assert.doesNotMatch(JSON.stringify(doc), /\brift\b/i, 'nothing is called a rift');

// ── every sound is on a line that exists ────────────────────────────────────
{
  const table = main.slice(main.indexOf('const PRACTICE_STUDENT_SOUNDS=Object.freeze({'), main.indexOf('function practiceStudentLine('));
  const hooked = [...table.matchAll(/'([a-z]+\.line\.\d+)':'([a-z]+)'/g)].map((m) => ({ id: m[1], sound: m[2] }));
  assert.ok(hooked.length >= 8, 'the scene is scored');
  const ids = new Set(lines.map((line) => line.id));
  for (const { id, sound } of hooked) {
    assert.ok(ids.has(id), `${id} (${sound}) is a real line`);
    assert.ok(['scale', 'correction', 'bar', 'sharp', 'knock', 'stop'].includes(sound), `${sound} is a sound the wall makes`);
  }
  const byId = Object.fromEntries(hooked.map((h) => [h.id, h.sound]));
  assert.equal(byId['start.line.2'], 'scale');
  assert.equal(byId['start.line.3'], 'correction');
  assert.equal(byId['tune.line.4'], 'sharp', 'played sharp when it is told it was in tune');
  assert.equal(byId['leave.line.3'], 'stop', 'and stops for good when he leaves');
  // It waits for a safe moment rather than opening over anything.
  const tick = main.slice(main.indexOf('function tickPracticeStudent(){'), main.indexOf('function openPracticeStudent(){'));
  for (const gate of ['REC.isRecording()', 'scenes.blocksInput()', 'activeBattleId', 'usingSpecialSpace()', 'metronomeQuiet']) {
    assert.ok(tick.includes(gate), `the scene waits on ${gate}`);
  }
  assert.match(main, /function onPracticeWingQuieted\(voice\)\{[\s\S]*?flagSet\('practice\.student\.pending',true\)/, 'quieting the wing owes the scene');
}

// ── what the wall plays ───────────────────────────────────────────────────
{
  const scale = studentScaleNotes({ start: 1 });
  assert.equal(scale.length, 15, 'up eight and back down seven');
  near(scale[0].hz, SEAM.referenceHz / 2, 1e-9, 'the scale starts an octave under the fork');
  near(scale[7].hz, SEAM.referenceHz, 1e-9, 'and turns at the fork');
  near(scale[14].hz, SEAM.referenceHz / 2, 1e-9, 'and comes home');
  for (let i = 1; i < 8; i += 1) assert.ok(scale[i].hz > scale[i - 1].hz, 'up');
  for (let i = 8; i < 15; i += 1) assert.ok(scale[i].hz < scale[i - 1].hz, 'down');
  near(scale[1].at - scale[0].at, STUDENT_WALL.scaleNoteSeconds, 1e-9, 'slowly');

  assert.equal(studentCorrectionTone().hz, SEAM.pressureHz, 'the correction is the engraving, not the fork');

  const inTune = studentBarNotes();
  const sharp = studentBarNotes({ sharp: true });
  assert.equal(inTune.length, STUDENT_BAR_STOPS.inTune, 'in tune, it stops in the same place');
  assert.equal(sharp.length, STUDENT_BAR_STOPS.inTune + 2, 'sharp, it gets two notes further');
  near(sharp[0].hz / inTune[0].hz, SEAM.pressureHz / SEAM.referenceHz, 1e-9, 'sharp means against 444');
  assert.deepEqual(studentBarNotes().map((n) => n.hz), studentBarNotes().map((n) => n.hz), 'the same bar every time');
  assert.equal(studentKnockTimes().length, 2, 'two knuckles');
}
{
  const starts = [];
  let stopped = 0;
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
  const node = (extra = {}) => ({ connect() {}, disconnect() {}, ...extra });
  const context = {
    currentTime: 3,
    createGain: () => node({ gain: param() }),
    createStereoPanner: () => node({ pan: param() }),
    createBiquadFilter: () => node({ type: '', frequency: param() }),
    createOscillator: () => node({ type: '', frequency: param(), start: (at) => starts.push(at), stop: () => { stopped += 1; } }),
  };
  const wall = createStudentWall({ context, destination: node() });
  assert.equal(wall.scale(), 15);
  assert.equal(starts.length, 30, 'every note, and every note back off the partition');
  near(starts[1] - starts[0], PRACTICE_RETURN_LAG_MS / 1000, 1e-9, 'the partition lag is the practice room\'s own');
  assert.equal(wall.bar({ sharp: true }), 6);
  assert.equal(wall.knock(), 2);
  const before = stopped;
  wall.stop();
  assert.ok(stopped > before, 'stop silences what is still sounding');
  assert.equal(createStudentWall({}).scale(), 0, 'no audio, nothing thrown');
}
for (const file of ['src/audio/student-wall.js']) {
  const text = readFileSync(file, 'utf8');
  assert.doesNotMatch(text, /emitAcoustic|hushNoise|emitNoise/i, `${file} must not reach the noise envelope`);
  assert.doesNotMatch(text, /\bhold|\bheld/i, `${file} uses a ruled-out word`);
}

console.log('practice student: ok');
