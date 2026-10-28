// THE ENDLESS ABSORBING PAIRS AT THE FAR EDGE OF THE FIELD.
//
// Isolated, hinged assemblies continue left and right, with lightless faces
// inside their steel joinery. False pairs disappear at a touch. One pair alone
// opens into the outskirts, remains a way back until the bust has his answer,
// and shuts behind the body once it is clear.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CELL } from '../src/data/floorplan/legend.js';
import { SOURCE_PRE_TAPE } from '../src/data/source-level.js';
import { DOOR_ARCHETYPES, DOOR_ARCHETYPE } from '../src/data/conservatory-doors.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { sourceFocusActionLabel } from '../src/game/source-haystack.js';
import { CHUNK_SURF_GOD_PRESET, buildChunkSurfGodPreset } from '../src/game/chunk-surf-god.js';
import { freshChunkSurfState, normalizeChunkSurfState, reduceChunkSurf } from '../src/game/chunk-surf-state.js';

const field = ({ open = false, legacyOnward = false } = {}) => {
  const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FINAL, { seed: 4417 });
  const runtime = createSourceSpaceRuntime({ initialState: { ...built.state, edgeDoorOpen: open,
    ...(legacyOnward?{horizon:{...built.state.horizon,entered:true}}:{}) } });
  const at = runtime.edgeDoorApproach();
  runtime.setPlayerPosition(at);
  return { runtime, at, origin: runtime.state().landscapeOrigin };
};

// The state: closed, opened, shut again, and it survives a save.
{
  assert.equal(freshChunkSurfState().edgeDoorOpen, false);
  const opened = reduceChunkSurf(freshChunkSurfState(), { type: 'SOURCE_EDGE_DOOR_OPENED' });
  assert.equal(opened.edgeDoorOpen, true);
  assert.equal(normalizeChunkSurfState(JSON.parse(JSON.stringify(opened))).edgeDoorOpen, true, 'an open door is shut again by a reload');
  assert.equal(reduceChunkSurf(opened, { type: 'SOURCE_EDGE_DOOR_CLOSED' }).edgeDoorOpen, false);
}

// Each pair has actual joinery, hinged leaves and a grounded threshold. The
// endless copies cannot reveal which is real by their assembly or their core.
{
  const { runtime, at } = field();
  const door = runtime.edgeDoorFrame();
  assert.ok(door, 'the field has no door at its edge');
  const [a, b] = door.threshold;
  assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) * CELL - 3.0) < 1e-3, 'the doors are not the goods pair\'s three metres');
  assert.equal(a.y, b.y, 'the doors stand askew to the edge');
  assert.equal((a.x + b.x) / 2, at.x, 'the doors are not on the axis he is put on');
  const parts = runtime.propInstances(at.x, at.y, { time: 0 }).filter((entry) => entry.id === 'source-edge-door' || entry.id.startsWith('source-edge-door:'));
  const archetype = DOOR_ARCHETYPES[DOOR_ARCHETYPE.BAY_GOODS_PAIR];
  assert.deepEqual(parts.map((entry) => entry.mesh).sort(), [archetype.frameMesh, archetype.mesh, archetype.mesh, 'door_threshold_slab'].sort(), 'the doors lack their own frame, hinged leaves or threshold');
  const focus = runtime.focusAt(at.x, at.y, 0, null);
  assert.equal(focus?.kind, 'source-edge-door', 'standing at the doors, they cannot be tried');
  assert.equal(sourceFocusActionLabel(focus), 'OPEN THE GREY DOORS');
}

// The row is generated around the body, with no lateral end or capped floor.
// Querying geometry and warping the camera cannot touch an echo.
{
  const { runtime, at } = field();
  const row = runtime.edgeDoorField();
  assert.ok(row.length >= 30, 'the spaced pairs do not continue across the horizon');
  const pitch = row.find((door) => door.index === 1).x - row.find((door) => door.real).x;
  assert.ok(pitch * CELL >= 10, 'the pairs still crowd together instead of standing in generous void');
  assert.equal(row.filter((door) => door.real).length, 1, 'more than one pair is real');
  assert.ok(row.some((door) => door.x < at.x - 100) && row.some((door) => door.x > at.x + 100));
  const fake = row.find((door) => door.index === 1);
  const before = Math.ceil(fake.y), approach = { x: Math.round(fake.x), y: before + 1, facing: 0 };
  runtime.setPlayerPosition(approach);
  for (let k = 0; k < 3; k += 1) runtime.geometry.canStep(approach.x, approach.y, approach.x, before);
  assert.equal(runtime.edgeDoorField().find((door) => door.id === fake.id).erased, false, 'a geometry read touched the pair');
  assert.ok(runtime.edgeDoorOpenings().every((door) => door.front.every((value) => value === 0)), 'a door core responds to the field lighting');
  for (const x of [-5000, 5000]) {
    assert.equal(runtime.geometry.canStep(x, at.y, x + 1, at.y).ok, true, 'the row ends at an invisible side boundary');
    const far = runtime.edgeDoorField(x, at.y);
    assert.ok(far.some((door) => door.x < x - 100) && far.some((door) => door.x > x + 100), 'the visible row has an endpoint');
    assert.equal(far.some((door) => door.real), false, 'the real portal is cloned beside a distant player');
    assert.equal(runtime.geometry.canStep(x, before, x, before - 1).ok, false, 'the extended apron bypasses the real portal');
  }
}

// Touch, not a quest item or a second interaction: one successful body step
// removes all of a fake pair and its hole. Its erased position still cannot
// carry the body across the field boundary, and a reload remembers the touch.
{
  const { runtime } = field();
  const fake = runtime.edgeDoorField().find((door) => door.index === -1);
  const x = Math.round(fake.x), before = Math.ceil(fake.y);
  const from = { x, y: before + 1 }, to = { x, y: before };
  runtime.setPlayerPosition(from);
  assert.equal(runtime.geometry.canStep(from.x, from.y, to.x, to.y).ok, true, 'the fake refuses the touching step');
  const result = runtime.onStep(from, to);
  assert.equal(result?.event, 'edge-door-zapped', 'touching the fake pair does not erase it');
  assert.equal(result.id, fake.id);
  assert.equal(runtime.state().edgeDoorOpen, false, 'touching a fake opens the real pair');
  assert.equal(runtime.edgeDoorField().find((door) => door.id === fake.id).erased, true);
  assert.equal(runtime.edgeDoorOpenings().some((door) => door.id === `${fake.id}:absence`), false, 'the fake leaves its black hole behind');
  assert.equal(runtime.propInstances(x, before, { reducedMotion: true }).some((part) => part.id === fake.id || part.id.startsWith(`${fake.id}:`)), false, 'the erased fake retains joinery');
  assert.equal(runtime.geometry.canStep(x, before, x, before - 1).ok, false, 'the erased fake becomes a second real portal');
  const restored = createSourceSpaceRuntime({ initialState: JSON.parse(JSON.stringify(runtime.state())) });
  assert.equal(restored.edgeDoorField(x, before).find((door) => door.id === fake.id).erased, true, 'reload resurrects a touched fake');
  assert.equal(restored.openEdgeDoor('source-edge-door').event, 'edge-door-opened', 'the remaining real pair no longer works');
}

// Reaching out with the interact key has the same effect as a body touch. The
// actual portal index is protected even against malformed saved/event data.
{
  const { runtime } = field();
  const fake = runtime.edgeDoorField().find((door) => door.index === 2);
  runtime.setPlayerPosition({ x: Math.round(fake.x), y: Math.ceil(fake.y) + 3, facing: 0 });
  assert.equal(runtime.inspectFocused(Math.round(fake.x), Math.ceil(fake.y) + 3, 0).event, 'edge-door-zapped');
  const normalized = normalizeChunkSurfState({ ...runtime.state(), edgeDoorEchoesErased: [0, 1, 1, '2', Infinity, 1.5, -7] });
  assert.deepEqual(normalized.edgeDoorEchoesErased, [1, -7]);
  assert.deepEqual(reduceChunkSurf(normalized, { type: 'SOURCE_EDGE_DOOR_ECHO_ERASED', index: 0 }).edgeDoorEchoesErased, [1, -7]);
}

// A long walk must not resurrect an earlier copy when the player comes back.
{
  const { runtime, at } = field();
  const first = runtime.edgeDoorField().find((door) => door.index === 1);
  const spacing = first.x - at.x, before = Math.ceil(first.y), touched = [];
  for (let index = 1; index <= 540; index += 1) {
    const x = Math.round(at.x + spacing * index), from = { x, y: before + 1 }, to = { x, y: before };
    runtime.setPlayerPosition(from);
    assert.equal(runtime.geometry.canStep(from.x, from.y, to.x, to.y).ok, true, `copy ${index} is unreachable`);
    const result = runtime.onStep(from, to);
    assert.equal(result?.event, 'edge-door-zapped', `copy ${index} does not disappear on body touch`);
    touched.push(result.index);
  }
  assert.equal(runtime.state().edgeDoorEchoesErased.length, 540, 'long traversal forgets previously touched copies');
  const restored = createSourceSpaceRuntime({ initialState: JSON.parse(JSON.stringify(runtime.state())) });
  assert.deepEqual(restored.state().edgeDoorEchoesErased, touched, 'reload forgets old touched copies');
  for (const index of [1, 2, 511, 512, 513, 540]) {
    const x = at.x + spacing * index;
    assert.equal(restored.edgeDoorField(x, before).find((door) => door.index === index).erased, true, `copy ${index} resurrects when approached again`);
    assert.equal(restored.edgeDoorOpenings(x, before).some((door) => door.id === `source-edge-echo:${index}:absence`), false, `copy ${index} resurrects its hole`);
  }
  assert.equal(restored.state().edgeDoorEchoesErased.includes(0), false, 'the real portal is erased during the long traversal');
  assert.equal(restored.edgeDoorField(at.x, at.y).find((door) => door.real).erased, false);
}

// Shut, they refuse; beside them the edge refuses; open, through them is out.
{
  const { runtime, at } = field();
  const lineY = runtime.edgeDoorFrame().threshold[0].y, before = Math.ceil(lineY), after = before - 1;
  assert.equal(runtime.geometry.canStep(at.x, before, at.x, after).ok, false, 'the shut doors let the body through');
  assert.equal(runtime.inspectFocused(at.x, at.y, 0, null).event, 'edge-door-opened');
  assert.equal(runtime.state().edgeDoorOpen, true);
  assert.equal(runtime.geometry.canStep(at.x, before, at.x, after).ok, false, 'the doors are walked through before they have swung');

  // Preserve the original outward/return contract for saves already beyond
  // this seam. Fresh crossings are covered by source-continuation-integration.
  const open = field({ open: true, legacyOnward: true });
  const step = (from, to) => open.runtime.geometry.canStep(from.x, from.y, to.x, to.y).ok;
  assert.equal(step({ x: open.at.x, y: before }, { x: open.at.x, y: after }), true, 'the open doors refuse the body');
  for (const dx of [-12, -5, 5, 40]) assert.equal(step({ x: open.at.x + dx, y: before }, { x: open.at.x + dx, y: after }), false, `the edge lets the body across ${dx} cells from the doors`);
  let pos = { x: open.at.x, y: open.at.y }, crossed = null;
  while (pos.y > after) {
    const next = { x: pos.x, y: pos.y - 1 };
    open.runtime.setPlayerPosition({ ...next, facing: 0 });
    const result = open.runtime.onStep(pos, next);
    if (result?.event) crossed = result;
    pos = next;
  }
  assert.equal(crossed?.event, 'horizon', 'walking through the doors is not the way out');
  assert.equal(crossed.through, 'edge-door');
  assert.equal(open.runtime.state().phase, 'horizon');
  assert.equal(open.runtime.horizonFrame().preTapeProgress, 0, 'the doors are not at the very edge of the field');
  assert.equal(open.runtime.state().edgeDoorOpen, true, 'the doors slammed on him in the doorway');
  // Clear of them, they shut behind him.
  const events = [];
  for (let k = 0; k < 8; k += 1) {
    const next = { x: pos.x, y: pos.y - 1 };
    open.runtime.setPlayerPosition({ ...next, facing: 0 });
    open.runtime.onStep(pos, next);
    pos = next;
    events.push(...open.runtime.outskirtsBeatFrame({ viewYaw: 0 }).events.map((event) => event.id));
  }
  assert.equal(open.runtime.state().edgeDoorOpen, false, 'the doors stand open behind him');
  assert.ok(events.includes('edge-door-closed'), 'the doors shut without a sound');
  assert.equal(open.runtime.geometry.canStep(pos.x, after, pos.x, before).ok, false, 'the shut doors let him back into the field');
  // From outside, until the bust has had his answer, they open again.
  assert.equal(open.runtime.openEdgeDoor().event, 'edge-door-opened');
}

// Main: a new crossing belongs to the moving journey, whose actual black UI
// and running sound bridge replace the old frozen frame. A walked revisit
// after returning keeps the earlier short hold. Door cores remain lightless.
{
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /if\(sourceStep\.through==='edge-door'&&getSave\(\)\.sourceDrive\?\.status==='returned'\)\{CR\.fx\.hold\(/, 'only a returned on-foot crossing retains the old frame hold');
  assert.match(main, /entry:review\?'review':movingEntry\?'moving-cut':null/, 'the fresh crossing does not install its cinematic moving entry');
  assert.match(main, /R3\.r3dSetSourceOpenings\?\.\(chunkSurfRuntime\.edgeDoorOpenings\?\.\(x,y\)/, 'the door row does not submit its black cores');
  const transport = main.slice(main.indexOf('function openHorizonTransport('), main.indexOf('function openHorizonTransport(') + 4000);
  assert.doesNotMatch(transport, /completeNormalExit/, 'threading the transport still puts him over the seam');
  assert.match(main, /if\(chosen!=='away'\)return;\s*walkToEdgeDoor\(\);/, 'walking away still puts him over the seam');
  assert.doesNotMatch(main, /The structures stop here\. I can still go back\./, 'the old threshold line is still said');
  const r3d = readFileSync(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
  assert.match(r3d, /P3\.renderSourceOpenings\?\.\(\{camX:camX\*CELL/, 'the doorway is not drawn in the field');
  const props = readFileSync(new URL('../src/render/props3d.js', import.meta.url), 'utf8');
  assert.match(props, /export function renderSourceOpenings\(/);
  assert.match(props, /layout\(location=1\) out vec4 absence;/, 'black doors share an ambiguous glyph-alpha channel');
  assert.match(props, /gl\.clearBufferfv\(gl\.COLOR,1,/, 'a disappeared pair leaves its previous coverage mask');
  const text = r3d.slice(r3d.indexOf('const TEXT_SPACE_FRAG'), r3d.indexOf('const COPY_FRAG'));
  assert.ok(text.indexOf('float doorAbsence=') > text.indexOf('composed=mix(composed,emergencyRed,eWash)'), 'paper, x-ray or emergency grading can relight the door absence');
  // Door absence is the text pass's last word; the Pressure volume is merged
  // over that finished frame afterwards, so it can stand in front of a hole.
  assert.match(text, /float doorAbsence=[^;]+;\s*composed=mix\(composed,vec3\(0\.0\),doorAbsence\);\s*o=vec4\(composed,1\.0\);/, 'the door absence is not the last composite');
  const textDraw = r3d.slice(r3d.indexOf('function drawTextSpace'), r3d.indexOf('function sourceRoomU'));
  assert.ok(textDraw.indexOf('gl.useProgram(progTextSpace)') >= 0 && textDraw.indexOf('gl.useProgram(progTextSpace)') < textDraw.indexOf('finishPressure(sceneTex,{acquired})'), 'the aperture mask swallows Pressure standing in front of it');
}

console.log('source edge door specs passed');
