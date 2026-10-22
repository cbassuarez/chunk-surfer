// The ear room: the rule that picks it, the dressing the plan has to carry, and
// the paperwork behind its sounds. See data/stop-listening.js.
import assert from 'node:assert/strict';
import fs from 'node:fs';

import * as FP from '../src/world/floorplan.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { ZONE } from '../src/data/floorplan/legend.js';
import * as PROPS from '../src/game/props.js';
import {
  STOP_LISTENING_PREFIX, freshStopListeningState, normalizeStopListeningState, stopListeningArmed, stopListeningBusyWith,
  stopListeningEnter, stopListeningLoosePlacements, stopListeningPlacements, stopListeningStagedRooms, stopListeningVoices,
} from '../src/game/stop-listening.js';
import {
  STOP_LISTENING_ROOMS, STOP_LISTENING_ROOM_IDS, STOP_LISTENING_COPY, STOP_LISTENING_MESH,
  STOP_LISTENING_SHEET_DOCUMENT, STOP_LISTENING_SOURCES, STOP_LISTENING_AFTER, STOP_LISTENING_TREATMENTS,
} from '../src/data/stop-listening.js';
import { STOP_LISTENING_BOUNDS } from '../src/data/generated/stop-listening-geometry.js';

// ── THE RULE ────────────────────────────────────────────────────────────────
{
  assert.equal(STOP_LISTENING_AFTER, 'main_b3');
  assert.ok(!STOP_LISTENING_ROOM_IDS.includes('main_b3'), 'the ear room comes after B3, never in it');
  assert.ok(!STOP_LISTENING_ROOM_IDS.includes('lux_nova'), 'the chapel is the end of the night, never the ear room');
  const free = () => null;
  assert.deepEqual(stopListeningStagedRooms(null, []), []);
  assert.deepEqual(stopListeningStagedRooms(null, ['the_tub', 'amplifications']), [],
    'two takes that are not B3 do not arm it');
  assert.equal(stopListeningArmed(['main_b3']), true, 'B3 alone arms it: the get-in level check is never a take');
  assert.deepEqual(stopListeningStagedRooms(null, ['main_b3']), ['the_tub', 'amplifications', 'soundnoisemusic']);
  assert.deepEqual(stopListeningStagedRooms(null, ['main_b3', 'the_tub']), ['amplifications', 'soundnoisemusic']);

  // A busy room is never dressed.
  const wing = (id) => id === 'soundnoisemusic' ? 'metronomes' : null;
  assert.deepEqual(stopListeningStagedRooms(null, ['main_b3'], { busy: wing }), ['the_tub', 'amplifications']);

  const takes = ['main_b3'];
  const early = stopListeningEnter(freshStopListeningState(), { roomId: 'the_tub', takes: [], nowMs: 5, busy: free });
  assert.equal(early.chosen, false, 'nothing is waiting before B3');
  assert.equal(early.skipped, undefined, 'and nothing is passed over before it is armed');
  const b3 = stopListeningEnter(freshStopListeningState(), { roomId: 'main_b3', takes, nowMs: 5, busy: free });
  assert.equal(b3.chosen, false);
  const chapel = stopListeningEnter(freshStopListeningState(), { roomId: 'lux_nova', takes, nowMs: 5, busy: free });
  assert.equal(chapel.chosen, false);

  // His second location is the wing with its metronomes still going: passed
  // over, and the ears wait for the next free room.
  const passed = stopListeningEnter(freshStopListeningState(), { roomId: 'soundnoisemusic', takes, nowMs: 9, busy: wing });
  assert.equal(passed.chosen, false);
  assert.equal(passed.skipped, 'soundnoisemusic');
  assert.equal(passed.reason, 'metronomes');
  assert.deepEqual(passed.state.skipped, ['soundnoisemusic']);
  assert.deepEqual(stopListeningStagedRooms(passed.state, takes, { busy: free }), ['the_tub', 'amplifications'],
    'once passed over it stays passed over, even when the metronomes stop');
  const again = stopListeningEnter(passed.state, { roomId: 'soundnoisemusic', takes, nowMs: 10, busy: free });
  assert.equal(again.chosen, false, 'walking back into a passed-over room does not choose it');
  const next = stopListeningEnter(passed.state, { roomId: 'amplifications', takes, nowMs: 42, busy: wing });
  assert.equal(next.chosen, true, 'the next free room is the room');
  assert.equal(next.state.room, 'amplifications');
  assert.equal(next.state.enteredAtMs, 42);
  assert.deepEqual(stopListeningStagedRooms(next.state, takes), ['amplifications'], 'the others are cleared');
  assert.deepEqual(stopListeningStagedRooms(next.state, [...takes, 'amplifications']), ['amplifications'],
    'it stays his for the night, taped or not');
  assert.equal(stopListeningEnter(next.state, { roomId: 'the_tub', takes, nowMs: 50, busy: free }).chosen, false, 'only ever one');

  // Every candidate busy or passed over: the ears never come, rather than
  // sharing a room.
  const allBusy = () => 'something';
  assert.deepEqual(stopListeningStagedRooms(null, takes, { busy: allBusy }), []);

  assert.deepEqual(normalizeStopListeningState({ room: 'lux_nova', sheetRead: true }), freshStopListeningState());
  assert.deepEqual(normalizeStopListeningState({ room: 'main_b3' }), freshStopListeningState(), 'a save from before B3 was excluded');
  assert.deepEqual(normalizeStopListeningState('junk'), freshStopListeningState());
  assert.equal(normalizeStopListeningState({ room: 'the_tub', arrivalSpoken: 1 }).arrivalSpoken, true);
  assert.deepEqual(normalizeStopListeningState({ skipped: ['soundnoisemusic', 'main_b3', 'soundnoisemusic', 'lux_nova'] }).skipped,
    ['soundnoisemusic']);
}

// ── THE TREATMENTS ARE REAL ─────────────────────────────────────────────────
// A treatment that names a flag nothing sets, or an encounter nothing clears,
// would leave a room busy forever (or free when it should not be). Each one is
// held to the game's own source.
{
  const main = fs.readFileSync('src/main.js', 'utf8');
  for (const [roomId, treatments] of Object.entries(STOP_LISTENING_TREATMENTS)) {
    assert.ok(STOP_LISTENING_ROOM_IDS.includes(roomId), `${roomId} has treatments but is not a candidate`);
    for (const t of treatments) {
      assert.ok(t.while || t.encounter, `${roomId}/${t.id}: no condition`);
      for (const name of (t.while || '').match(/[A-Za-z_][\w.]*/g) || []) {
        assert.ok(main.includes(`flagSet('${name}'`), `${roomId}/${t.id}: nothing sets ${name}`);
      }
      if (t.encounter) assert.ok(main.includes(`'${t.encounter}'`), `${roomId}/${t.id}: no encounter ${t.encounter}`);
    }
  }
  assert.equal(stopListeningBusyWith('soundnoisemusic', (t) => t.id === 'metronomes'), 'metronomes');
  assert.equal(stopListeningBusyWith('amplifications', () => true), null, 'the hall has no set piece of its own');
}

// ── THE DRESSING, ON THE REAL PLAN ──────────────────────────────────────────
FP.compile(conservatory.levels, {
  width: conservatory.width, height: conservatory.height, widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [], edgePortals: conservatory.edgePortals || [], doors: conservatory.doors || [],
});
PROPS.propsInit(FP);
const ZONE_ROOM = { [ZONE.studio]: 'main_b3', [ZONE.natatorium]: 'the_tub', [ZONE.hall]: 'amplifications', [ZONE.practice]: 'soundnoisemusic' };
const canPlace = (roomId) => (x, y) => {
  const rx = Math.round(x * 2), ry = Math.round(y * 2);
  return !FP.isSolid(rx, ry) && !FP.isCollisionOnly(rx, ry) && ZONE_ROOM[FP.zoneAt(rx, ry)] === roomId && PROPS.propCanOccupy(rx, ry);
};

for (const roomId of STOP_LISTENING_ROOM_IDS) {
  const room = STOP_LISTENING_ROOMS[roomId];
  const placements = stopListeningPlacements(roomId, { canPlace: canPlace(roomId) });
  assert.deepEqual(placements.map((p) => p.id), stopListeningPlacements(roomId, { canPlace: canPlace(roomId) }).map((p) => p.id),
    `${roomId}: the scatter is deterministic`);
  // Exactly the path main.js takes: posed here, placed as loose props.
  for (const p of PROPS.allProps().filter((q) => q.id.startsWith(STOP_LISTENING_PREFIX)).map((q) => q.id)) PROPS.setLooseProp(p, null);
  const staged = stopListeningLoosePlacements(placements, FP, STOP_LISTENING_BOUNDS)
    .map((p) => PROPS.setLooseProp(p.id, p)).filter(Boolean);
  const kind = (k) => staged.filter((p) => p.id.split(':')[2] === k);

  // Many ears, not a pair: at least nine in ten of what each field asked for.
  const wanted = room.fields.reduce((sum, f) => sum + f.count, 0);
  assert.ok(kind('ear').length >= wanted * .9, `${roomId}: only ${kind('ear').length} of ${wanted} ears found floor`);
  assert.equal(kind('heap').length, room.heaps.length, `${roomId}: a heap landed on nothing`);
  assert.equal(kind('sheet').length, 1, `${roomId}: the take sheet has no floor`);
  for (const p of staged) {
    assert.ok(STOP_LISTENING_BOUNDS[p.mesh], `${p.id}: ${p.mesh} is not in the pack`);
    assert.equal(p.blocks, false, `${p.id} must never block`);
    if (p.mount !== 'wall') assert.equal(ZONE_ROOM[FP.zoneAt(p.rx, p.ry)], roomId, `${p.id} is outside ${roomId}`);
  }
  // The sheet is somewhere he will look: within six metres of where he comes in.
  const sheet = kind('sheet')[0];
  assert.ok(Math.hypot(room.sheet.x - room.entry.x, room.sheet.y - room.entry.y) < 6, `${roomId}: the sheet is too far in`);
  assert.equal(sheet.action, 'stop-listening-sheet');

  // Paint is on a wall: the face it names, solid behind its full width, and
  // under the ceiling.
  for (const w of kind('writing')) {
    assert.ok(w.wallContact, `${w.id}: no wall within reach`);
    assert.deepEqual([w.wallContact.nx, w.wallContact.ny], [w.mountNormal.nx, w.mountNormal.ny], `${w.id}: snapped to the wrong face`);
    const b = STOP_LISTENING_BOUNDS[w.mesh], half = (b.max[0] - b.min[0]) * (w.scale || 1) / 2;
    const cx = w.rx * .5 + (w.renderOffsetX || 0), cy = w.ry * .5 + (w.renderOffsetZ || 0);
    const { nx, ny } = w.wallContact, tx = -ny, ty = nx;
    const bottom = FP.floorAt(w.rx, w.ry) + w.elevation, top = bottom + (b.max[1] - b.min[1]) * (w.scale || 1);
    for (let s = -half; s <= half + 1e-6; s += .25) {
      const bx = cx + tx * s - nx * .3, by = cy + ty * s - ny * .3;
      assert.ok(FP.isSolid(Math.floor(bx * 2), Math.floor(by * 2)),
        `${w.id}: hangs over an opening ${s.toFixed(2)} m along (${bx.toFixed(2)}, ${by.toFixed(2)})`);
      // In front of the wall, the floor and ceiling the paint has to sit between
      // (the hall's aisle climbs under it; the arm's soffit comes down over it).
      const fx = Math.floor((cx + tx * s + nx * .3) * 2), fy = Math.floor((cy + ty * s + ny * .3) * 2);
      assert.ok(bottom > FP.floorAt(fx, fy) + .15, `${w.id}: runs into the floor ${s.toFixed(2)} m along`);
      assert.ok(top < FP.ceilAt(fx, fy) - .05, `${w.id}: top ${top.toFixed(2)} runs into a ${FP.ceilAt(fx, fy).toFixed(2)} ceiling ${s.toFixed(2)} m along`);
    }
  }
  assert.ok(stopListeningVoices(roomId).length >= 3, `${roomId}: the sound needs more than one place to come from`);
}
for (const id of PROPS.allProps().filter((p) => p.id.startsWith(STOP_LISTENING_PREFIX)).map((p) => p.id)) PROPS.setLooseProp(id, null);
assert.equal(PROPS.allProps().some((p) => p.id.startsWith(STOP_LISTENING_PREFIX)), false, 'clearing the stage clears it');

// ── THE PACK AND THE SHEET ──────────────────────────────────────────────────
{
  const glb = fs.readFileSync('public/assets/stop-listening.glb');
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
  const names = new Set(json.meshes.map((m) => m.name));
  const writing = Object.values(STOP_LISTENING_MESH.writing).flatMap((n) => [n, `${n}_pale`]);
  for (const name of [...STOP_LISTENING_MESH.ears, ...STOP_LISTENING_MESH.heaps, ...writing, STOP_LISTENING_MESH.sheet]) {
    assert.ok(names.has(name), `the pack has no ${name}`);
    assert.ok(STOP_LISTENING_BOUNDS[name], `no bounds for ${name}`);
  }
  assert.equal(json.extensionsUsed, undefined, 'the runtime refuses glTF extensions');
  assert.ok(fs.existsSync(STOP_LISTENING_SHEET_DOCUMENT.path), 'the take sheet has no reading image');
}

// ── WHAT HE SAYS ────────────────────────────────────────────────────────────
{
  const copy = JSON.stringify(STOP_LISTENING_COPY);
  assert.doesNotMatch(copy, /\bhold|\bheld/i, 'banned words in the ear room copy');
  assert.ok(STOP_LISTENING_COPY.arrival.length && STOP_LISTENING_COPY.sheetRead.length);
}

// ── THE SOUNDS ARE CHECKED, CREDITED AND NEVER SHARE-ALIKE ──────────────────
{
  const flat = (await import('../src/data/credits.js')).flattenCredits().map((entry) => entry.text).join('\n');
  for (const s of STOP_LISTENING_SOURCES) {
    assert.ok(['CC0', 'Public domain', 'CC BY 3.0', 'CC BY 4.0'].includes(s.licence), `${s.id}: licence ${s.licence}`);
    assert.doesNotMatch(s.licence, /SA/, `${s.id}: share-alike is refused`);
    assert.match(s.url, /^https:\/\/(freesound\.org|commons\.wikimedia\.org)\//, `${s.id}: no source page`);
    assert.ok(flat.includes(s.title) && flat.includes(s.author.split(' ')[0]), `${s.id} is not in the credits`);
  }
}

// ── THE BANK ────────────────────────────────────────────────────────────────
{
  const manifest = JSON.parse(fs.readFileSync('public/audio/stop-listening/manifest.json', 'utf8'));
  for (const s of STOP_LISTENING_SOURCES) {
    assert.ok(manifest.events.some((e) => e.source === s.id), `${s.id} gave the room nothing`);
    assert.ok(manifest.sources.some((m) => m.id === s.id && /^[0-9a-f]{64}$/.test(m.sha256)), `${s.id}: no hash`);
  }
  for (const entry of [...manifest.events, ...manifest.beds]) {
    assert.ok(fs.existsSync(`public/audio/stop-listening/${entry.file}`), `${entry.file} was not built`);
  }
  assert.ok(manifest.events.filter((e) => e.role === 'gut').length > manifest.events.length / 2, 'it should be mostly gut');
  assert.ok(manifest.crush.mix >= .65 && manifest.crush.mix <= 1, 'the requested digital grain is dominant');
  for (const entry of [...manifest.events, ...manifest.beds]) {
    assert.ok(entry.crush.bits >= 8 && entry.crush.bits <= 12, `${entry.id}: not 8–12-bit grain`);
    assert.ok(entry.crush.rate >= 20000 && entry.crush.rate <= 36000, `${entry.id}: not a 20–36 kHz held clock`);
  }
  const licences = fs.readFileSync('third_party/licenses/STOP-LISTENING-AUDIO.md', 'utf8');
  for (const m of manifest.sources) assert.ok(licences.includes(m.sha256), `${m.id}: hash not recorded in the licence table`);
}

console.log('stop-listening: ok');
