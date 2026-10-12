// The practice floor has two references: the fork's A=440 and the engraved
// A=444. This pins where the engraved one is in the air, that the pair really
// does beat four times a second at the levels authored, and that none of it can
// be mistaken for a sound the player made.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { CELL } from '../src/data/floorplan/legend.js';
import * as FP from '../src/world/floorplan.js';
import { FORK_TONE, forkToneAt } from '../src/audio/fork-tone.js';
import {
  PRACTICE_TRACES, PRACTICE_TRACE_BANDS, SEAM, SEAM_REGIONS,
  practiceTraceByHost, practiceTraceNode, seamAt, seamBeatHz,
} from '../src/game/practice-seams.js';
import { CONSERVATORY_PROPS } from '../src/data/conservatory-props.js';

FP.compile(conservatory.levels, {
  width: conservatory.width,
  height: conservatory.height,
  widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [],
  edgePortals: conservatory.edgePortals || [],
  doors: conservatory.doors || [],
});

// The same conversion main.js makes: an authored point, to the runtime cell, to
// physical metres with the space and render group the plan owns there.
function listenerAtAuthored(x, y) {
  const runtime = FP.toRuntimePoint({ x, y });
  assert.equal(FP.isSolid(runtime.x, runtime.y), false, `${x},${y} must be walkable`);
  const here = FP.logicalToPhysical(runtime.x, runtime.y);
  return { x: here.x * CELL, z: here.z * CELL, renderGroup: here.renderGroup, spaceId: here.spaceId };
}

// ── the two references ─────────────────────────────────────────────────────
assert.equal(SEAM.referenceHz, FORK_TONE.hz, 'the seam reference is the fork tone');
assert.equal(SEAM.pressureHz, FORK_TONE.seamHz, 'the engraved A is the voice fork-tone plays');
assert.equal(seamBeatHz(), 4);
assert.equal(seamBeatHz(440, 440), 0, 'unison does not beat');
{
  const talisman = JSON.parse(readFileSync('content/narrative/conservatory.talisman.story.json', 'utf8'));
  assert.match(talisman.nodes.read.lines[0].text, new RegExp(`A=${SEAM.pressureHz}`), 'the engraving names the pitch the wing plays');
}

// ── where it is in the air ────────────────────────────────────────────────
{
  // Arriving at the north end of the landing (its own logical island), across
  // it, into the wing's arrival hall and down the corridor. Physical z runs
  // straight on even though the logical coordinates jump.
  const walk = [
    listenerAtAuthored(150, 71),   // top of the stair, on the landing
    listenerAtAuthored(150, 78),   // south edge of the landing
    listenerAtAuthored(61, 53),    // wing arrival hall
    listenerAtAuthored(61, 60),    // corridor, first room band
    listenerAtAuthored(61, 70),    // corridor, past the mark
  ];
  assert.equal(walk[0].spaceId, 'main_stair_hall');
  assert.equal(walk[2].spaceId, 'practice');
  const presence = walk.map(seamAt);
  for (let i = 1; i < presence.length; i += 1) {
    assert.ok(presence[i] >= presence[i - 1], `the engraved A never thins walking south (${presence.join(', ')})`);
    assert.ok(walk[i].z > walk[i - 1].z, 'physical z runs south without a jump backwards');
  }
  assert.ok(presence[0] > 0 && presence[0] < 0.5, 'faint, but already there, on the landing');
  assert.equal(presence[3], 1, 'full presence once the room bands begin');
  assert.equal(presence[4], 1, 'and the same at every door after that');
}
{
  // Through the doors, not only along the corridor. Every walkable door cell in
  // the wing belongs to the wing's own space, so the engraved A never drops out
  // for the length of a threshold.
  let doors = 0;
  for (let ay = 56; ay < 86; ay += 0.5) {
    for (let ax = 51; ax < 76; ax += 0.5) {
      const runtime = FP.toRuntimePoint({ x: ax, y: ay });
      if (FP.isSolid(runtime.x, runtime.y) || !FP.doorAt(runtime.x, runtime.y)) continue;
      doors += 1;
      assert.equal(seamAt(listenerAtAuthored(ax, ay)), 1, `door cell ${ax},${ay} keeps the engraved A`);
    }
  }
  assert.ok(doors >= 16, `the wing's doors were found (${doors})`);
}
{
  // Nowhere else. The ground-floor stair hall shares the landing's footprint,
  // and it is the one place a floor check could quietly go wrong.
  const underLanding = listenerAtAuthored(139.5, 32.5);
  assert.equal(underLanding.spaceId, 'main_stair_hall', 'same space id as the landing');
  assert.equal(underLanding.renderGroup, 'ground');
  assert.ok(underLanding.z > 33.5 && underLanding.z < 42.5, 'and physically inside the landing footprint');
  assert.equal(seamAt(underLanding), 0, 'the ground-floor stair hall under the landing is silent');
  assert.equal(seamAt(listenerAtAuthored(15, 12)), 0, 'B3 is silent');
  assert.equal(seamAt({ x: 61, z: 60, renderGroup: 'upper', spaceId: 'academic' }), 0);
  assert.equal(seamAt({ x: 61, z: 60, renderGroup: 'ground', spaceId: 'practice' }), 0);
  assert.equal(seamAt(null), 0);
  assert.equal(SEAM_REGIONS.length, 2);
}

// ── the fork tone carries it ──────────────────────────────────────────────
{
  const stand = { x: 55.25, z: 55.65 };
  const far = forkToneAt({ x: 61, z: 76 }, stand, { seam: 1 });
  assert.equal(far.gain > 0, true, 'still inside the fork radius here');
  const outOfRange = forkToneAt({ x: 55.25, z: 55.65 + FORK_TONE.radius + 1 }, stand, { seam: 1 });
  assert.equal(outOfRange.gain, 0);
  assert.equal(outOfRange.seamGain, FORK_TONE.seamGain, 'the engraved A does not depend on the fork range');
  assert.equal(outOfRange.audible, true);
  assert.equal(outOfRange.seamHz, 444);

  const noSeam = forkToneAt({ x: 56, z: 56 }, stand);
  assert.equal(noSeam.seamGain, 0, 'no seam presence, no engraved A');
  assert.ok(noSeam.gain > 0);

  const muted = forkToneAt({ x: 56, z: 56 }, stand, { active: false, seam: 1 });
  assert.equal(muted.audible, false);
  assert.equal(muted.gain, 0);
  assert.equal(muted.seamGain, 0, 'the mute silences both A\'s');
}

// ── the pair really beats at 4 Hz, deepest where the levels meet ─────────────
{
  const stand = { x: 55.25, z: 55.65 };
  // Walk out from the stand until the fork's A has fallen to the engraved A's
  // ceiling. That distance is where the beat is at full depth.
  let meet = null;
  for (let d = 0; d < FORK_TONE.radius; d += 0.05) {
    const frame = forkToneAt({ x: stand.x + d, z: stand.z }, stand, { seam: 1 });
    if (frame.gain <= frame.seamGain) { meet = d; break; }
  }
  assert.ok(meet > 3 && meet < 12, `the levels meet a few metres out from the stand, not at it or across the wing (${meet})`);

  const rate = 8000;
  const samples = rate * 2;
  const a = FORK_TONE.gain * 0.5, b = FORK_TONE.seamGain;
  const windowSize = rate / 50;   // 20 ms
  const envelope = [];
  for (let start = 0; start + windowSize <= samples; start += windowSize) {
    let sum = 0;
    for (let n = start; n < start + windowSize; n += 1) {
      const t = n / rate;
      const v = a * Math.sin(2 * Math.PI * SEAM.referenceHz * t) + b * Math.sin(2 * Math.PI * SEAM.pressureHz * t);
      sum += v * v;
    }
    envelope.push(Math.sqrt(sum / windowSize));
  }
  // Count the dips, not the swells. Both sines start in phase, so the swells
  // land exactly on the first and last sample, where no neighbour test can see
  // them; the eight dips (every quarter second, offset by an eighth) are all
  // well inside the window.
  const top = Math.max(...envelope), bottom = Math.min(...envelope);
  let dips = 0;
  for (let i = 1; i < envelope.length - 1; i += 1) {
    if (envelope[i] < envelope[i - 1] && envelope[i] <= envelope[i + 1] && envelope[i] < (top + bottom) / 2) dips += 1;
  }
  assert.equal(dips, 8, `two seconds of 440 against 444 dips eight times (${dips})`);
  assert.ok(bottom / top < 0.2, `where the levels meet the beat is deep, not a ripple (${(bottom / top).toFixed(3)})`);
}

// ── the traces ────────────────────────────────────────────────────────────
{
  const doc = JSON.parse(readFileSync('content/narrative/practice-wing.traces.story.json', 'utf8'));
  const project = JSON.parse(readFileSync('content/project.json', 'utf8'));
  assert.ok(project.narrative.includes('narrative/practice-wing.traces.story.json'), 'the traces doc is registered');
  assert.equal(PRACTICE_TRACES.length, 3);
  for (const trace of PRACTICE_TRACES) {
    const host = CONSERVATORY_PROPS.find((prop) => prop.id === trace.host);
    assert.ok(host, `${trace.host} exists`);
    // Not clutter: small paper in the wing is mute by rule, the uprights are not.
    assert.equal(host.mesh, 'upright_piano', `${trace.key} lives inside an upright`);
    assert.notEqual(host.interactive, false, `${trace.host} can be put a hand on`);
    assert.equal(host.roomHistory, trace.roomId, `${trace.key} is in ${trace.roomId}`);
    assert.equal(practiceTraceByHost(trace.host), trace);
    for (let band = 0; band < PRACTICE_TRACE_BANDS; band += 1) {
      assert.ok(doc.nodes[`${trace.key}.b${band}`], `${trace.key}.b${band} is written`);
      assert.ok(doc.entries.includes(`${trace.key}.b${band}`), `${trace.key}.b${band} is an entry`);
    }
  }
  assert.equal(practiceTraceByHost('practice-piano-2'), null, 'the other uprights are only uprights');

  // The first look is always there; the rest waits on the floor being read.
  assert.equal(practiceTraceNode('marks', {}), 'marks.b0');
  assert.equal(practiceTraceNode('marks', { marks: 1 }), null, 'nothing new until another trace is read');
  assert.equal(practiceTraceNode('marks', { marks: 1, parts: 1 }), 'marks.b1');
  assert.equal(practiceTraceNode('marks', { marks: 2, parts: 1 }), null, 'the third look needs all three');
  assert.equal(practiceTraceNode('marks', { marks: 2, parts: 1, 'tuning-log': 1 }), 'marks.b2');
  assert.equal(practiceTraceNode('marks', { marks: 3, parts: 3, 'tuning-log': 3 }), null, 'and then it is spent');
  assert.equal(practiceTraceNode('nope', {}), null);

  // Reading every trace in any order shows every band exactly once.
  for (const order of [['tuning-log', 'marks', 'parts'], ['parts', 'tuning-log', 'marks'], ['marks', 'parts', 'tuning-log']]) {
    const read = {}; const shown = [];
    for (let visit = 0; visit < 12; visit += 1) {
      const key = order[visit % 3];
      const node = practiceTraceNode(key, read);
      if (node) { shown.push(node); read[key] = (read[key] || 0) + 1; }
    }
    assert.equal(new Set(shown).size, 9, `every band shows once reading ${order.join(', ')} (${shown.join(', ')})`);
  }

  const text = JSON.stringify(doc);
  assert.doesNotMatch(text, /\bhold|\bheld/i, 'the traces use a ruled-out word');
  assert.doesNotMatch(text, /"who":\s*"(hush|surfer)"/i, 'nothing on this floor speaks for the HUSH or the Surfer');
  assert.match(doc.nodes['marks.b0'].lines.map((l) => l.text).join(' '), new RegExp(`A=${SEAM.pressureHz}`));
}

// ── it is never the player ────────────────────────────────────────────────
for (const file of ['src/audio/fork-tone.js', 'src/game/practice-seams.js']) {
  const text = readFileSync(file, 'utf8');
  assert.doesNotMatch(text, /acoustic|noise-?event|emitAcoustic|hushNoise/i, `${file} must not reach the noise envelope`);
  assert.doesNotMatch(text, /\bhold|\bheld/i, `${file} uses a ruled-out word`);
}

console.log('practice seams: ok');
