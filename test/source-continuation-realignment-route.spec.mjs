import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as layout from '../src/data/source-continuation.js';
import * as controller from '../src/game/source-continuation.js';
import {createSourceSpaceRuntime} from '../src/game/source-space-runtime.js';
import {buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET} from '../src/game/chunk-surf-god.js';
import {reduceChunkSurf, SOURCE_FINALE_ROUTE, SOURCE_FINALE_STAGE} from '../src/game/chunk-surf-state.js';
import {nextSourceContact, resolveSourceContact} from '../src/game/source-contact.js';
import {freshSave, getSave, withTransientGameState} from '../src/game/save.js';
import {freshMeta, freshRunRecord} from '../src/progression/schema.js';
import {sourceContinuationGeometry, sourceContinuationMeshPayload, sourceContinuationRenderFrame, installSourceContinuationMeshes} from '../src/render/source-continuation-renderer.js';

// Independent route acceptance: the only initial fixture is the chapter's
// declared entry. Walking and drops below use the actual production controller.
// This establishes reachable geometry and state behavior, not player discovery,
// native rendering quality, or an earned earlier-night playthrough.
const C = layout.SOURCE_CONTINUATION;
const clone = value => JSON.parse(JSON.stringify(value));
const close = (actual, expected, tolerance = 1e-5, context = '') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${context}: ${actual} != ${expected}`);
const initialField = () => buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FINAL, {seed: 83931}).state;
const protectedFields = value => clone({
  sourceContacts: value.sourceContacts, finalEncounter: value.finalEncounter,
  finale: value.finale, injuriesAtEntry: value.injuriesAtEntry,
  bestEligible: value.bestEligible, optionalTraces: value.optionalTraces,
});

function contactCommitted() {
  let state = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_CONTACT, {seed: 83931, injuries: 0}).state;
  const encounter = nextSourceContact(state.sourceContacts, {seed: state.seed, victories: 0});
  let contacts = resolveSourceContact(state.sourceContacts, encounter, 'contact.warning');
  contacts = resolveSourceContact(contacts, encounter, 'contact.confirm');
  state = reduceChunkSurf({...state, sourceContacts: contacts}, {type: 'CONTACT_COMMITTED'});
  assert.equal(state.finale.route, SOURCE_FINALE_ROUTE.CONTACT);
  assert.equal(state.finale.stage, SOURCE_FINALE_STAGE.CONTACT_COMMITTED);
  return state;
}

test('the rebuilt chapter cannot acquire Contact or replace a committed chapel/tower decision', () => {
  const horizon = reduceChunkSurf(initialField(), {type: 'SOURCE_NORMAL_EXIT'});
  const sources = [contactCommitted(), ...['accepted', 'declined'].map(decision => ({
    ...horizon, finale: {...horizon.finale, bust: {...horizon.finale.bust, decision}},
  }))];
  for (const source of sources) {
    const runtime = createSourceSpaceRuntime({initialState: source});
    const before = clone(runtime.state());
    assert.equal(runtime.sourceContinuationEntry('forward'), null);
    assert.equal(runtime.sourceContinuationEntry('reverse'), null);
    assert.equal(runtime.completeContinuation(before.sourceContinuation).handled, false);
    assert.deepEqual(runtime.state(), before);
  }
});

test('ordinary local exploration does not write the real recorder, injuries, inventory or unrelated route state', async () => {
  const save = freshSave({run: freshRunRecord({id: 'realignment-no-side-effects', startedAt: 1000})});
  await withTransientGameState({save, meta: freshMeta()}, async scope => {
    const before = clone(getSave());
    let state = controller.resumeSourceContinuation(controller.freshSourceContinuation({
      runId: 'realignment-no-side-effects', returnPose: {x: 19, y: -417, yaw: .4, pitch: -.1},
    }));
    for (let frame = 0; frame < 160; frame++) {
      state = controller.stepSourceContinuation(state, {
        dt: 1 / 30, look: {yaw: frame / 90, pitch: -.2},
        forward: frame < 80 ? .4 : 0,
      }).state;
    }
    assert.deepEqual(getSave(), before, 'local geometry and pressure do not mutate the carried equipment or global run');
    assert.deepEqual(scope.writes, [], 'no storage writes occur behind the host checkpoint owner');
  });
});

function transform(matrix, point) {
  return [0, 1, 2].map(axis => matrix[axis] * point[0] + matrix[axis + 4] * point[1]
    + matrix[axis + 8] * point[2] + matrix[axis + 12]);
}

// This ray test reads the actual uploaded triangle payload and submitted model
// transforms. It does not reconstruct a rectangle/sector from collision data.
function verticalTriangleHeight(a, b, c, x, z) {
  const determinant = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
  if (Math.abs(determinant) < 1e-9) return null;
  const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / determinant;
  const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / determinant;
  const w = 1 - u - v;
  if (Math.min(u, v, w) < -1e-6 || Math.max(u, v, w) > 1 + 1e-6) return null;
  return u * a[1] + v * b[1] + w * c[1];
}

function assertSubmittedSupport(state, context) {
  const frame = sourceContinuationRenderFrame(state);
  const geometries = new Map(sourceContinuationGeometry(state).map(piece => [piece.name, piece]));
  let highest = -Infinity;
  for (const prop of frame.props.filter(p => p.physicalKind === 'surface')) {
    const piece = geometries.get(prop.mesh);
    assert.ok(piece, `${context}: submitted support ${prop.mesh} has inspectable production geometry`);
    const positions = sourceContinuationMeshPayload(piece).positions;
    for (let offset = 0; offset < positions.length; offset += 9) {
      const points = [0, 3, 6].map(k => transform(prop.matrix, Array.from(positions.slice(offset + k, offset + k + 3))));
      const y = verticalTriangleHeight(...points, state.x, state.z);
      if (y != null && y <= state.feet + .05 && y >= state.feet - .6) highest = Math.max(highest, y);
    }
  }
  assert.ok(Number.isFinite(highest), `${context}: no drawn floor exists beneath the supported body`);
  close(highest, state.feet, 2e-4, `${context}: collision and submitted top surface`);
  close(frame.eye[0], state.x, 1e-6, `${context}: first-person x`);
  close(frame.eye[1], state.feet + C.eyeHeight, 1e-6, `${context}: physical eye height`);
  close(frame.eye[2], state.z, 1e-6, `${context}: first-person z`);
  return frame;
}

test('the actual submitted first-person receiving floor agrees with fresh chapter collision', () => {
  const state = controller.resumeSourceContinuation(controller.freshSourceContinuation({runId: 'drawn-entry'}));
  assert.ok(layout.continuationSupportAt(state.x, state.z, state));
  assertSubmittedSupport(state, 'fresh receiving route');
});

const tick = (state, input = {}, events = null) => {
  const result = controller.stepSourceContinuation(state, {dt: .05, renderReady: true, ...input});
  if (events) events.push(...result.events);
  return result.state;
};

function walkTo(state, x, z, {events = [], maxFrames = 2400, context = 'walk'} = {}) {
  for (let frame = 0; frame < maxFrames; frame++) {
    const dx = x - state.x, dz = z - state.z, distance = Math.hypot(dx, dz);
    if (distance < .045 && !state.fall && !state.recovery) return state;
    assert.equal(state.fall, null, `${context}: ordinary walking cannot secretly drop the body`);
    assert.equal(state.recovery, null, `${context}: this planned ordinary walk was interrupted before reaching ${x},${z}`);
    state = tick(state, {forward: Math.min(1, distance / (C.walkSpeed * .05)), look: {yaw: Math.atan2(dx, -dz)}}, events);
    assert.ok([state.x, state.z, state.feet].every(Number.isFinite), `${context}: finite physical pose`);
  }
  assert.fail(`${context}: could not walk to ${x},${z}; body at ${state.x},${state.z}, feet ${state.feet}, phase ${state.phase}`);
}

function waitForFall(state, events) {
  for (let frame = 0; frame < 400 && state.fall; frame++) state = tick(state, {}, events);
  assert.equal(state.fall, null, 'gravity must find the visible lower support without midair input');
  assert.equal(state.recovery, null, 'either taught release is a usable route, rather than an arbitrary wrong-answer recovery');
  assert.ok(layout.continuationSupportAt(state.x, state.z, state));
  return state;
}

function arcAngle(value, stage) {
  let angle = value;
  while (angle < stage.startAngle) angle += Math.PI * 2;
  while (angle > stage.startAngle + Math.PI * 2) angle -= Math.PI * 2;
  return angle;
}

function radialWalk(state, radius, angle, events, context) {
  const point = layout.continuationRadialPoint(radius, angle);
  return walkTo(state, point.x, point.z, {events, context});
}

function catchArc(state, targetAngle, {events = [], radius = null, context = 'catch walk'} = {}) {
  const stage = layout.continuationStage(state.level), center = C.catch.center;
  const walkingRadius = radius ?? (stage.innerRadius + stage.outerRadius) / 2;
  let from = arcAngle(Math.atan2(state.z - center.z, state.x - center.x), stage);
  const to = arcAngle(targetAngle, stage);
  assert.ok(from >= stage.startAngle - .001 && from <= stage.endAngle + .001, `${context}: current angle belongs to this actual sector`);
  assert.ok(to >= stage.startAngle - .001 && to <= stage.endAngle + .001, `${context}: target is reachable around this partial sector`);
  state = radialWalk(state, walkingRadius, from, events, context);
  const steps = Math.max(1, Math.ceil(Math.abs(to - from) / .15));
  for (let step = 1; step <= steps; step++) state = radialWalk(state, walkingRadius, from + (to - from) * step / steps, events, context);
  return state;
}

function visitRefuge(state, events) {
  const stage = layout.continuationStage(state.level), refuge = layout.continuationRefugeAt(state);
  state = catchArc(state, stage.refugeAngle, {events, context: `stage ${state.level} refuge approach`});
  state = walkTo(state, refuge.x, refuge.z, {events, context: `stage ${state.level} refuge neck`});
  assert.equal(controller.sourceContinuationThreatTelemetry(state, {horizonSeconds: 0}).refuge, true);
  assertSubmittedSupport(state, `stage ${state.level} actual refuge`);
  const before = {x: state.x, z: state.z, feet: state.feet};
  for (let frame = 0; frame < 160; frame++) {
    state = tick(state, {}, events);
    assert.equal(state.recovery, null, 'waiting in a visibly separate refuge is genuinely protected');
    assert.deepEqual({x: state.x, z: state.z, feet: state.feet}, before);
  }
  return radialWalk(state, stage.outerRadius - 1, stage.refugeAngle, events, `stage ${state.level} refuge departure`);
}

test('a complete ordinary controller route explores II, crosses its real door and walks every distinct Catch to one onward delivery', t => {
  const runtime = createSourceSpaceRuntime({initialState: {...initialField(), edgeDoorOpen: true}});
  const before = protectedFields(runtime.state());
  const entry = runtime.sourceContinuationEntry('forward', {runId: 'realignment-whole-route'});
  assert.ok(entry?.checkpoint, 'the existing Source authority supplies the chapter entry');
  let state = controller.resumeSourceContinuation(entry.checkpoint);
  const events = [], observedStageSupports = new Set();
  const routes = layout.SOURCE_CONTINUATION_ROUTES;
  assert.ok(routes?.main && routes.groundBranch, 'the authored network exposes a main route and an optional rejoining ground route');

  state = walkTo(state, 0, -3, {events, context: 'receiving route'});
  for (const [x, z] of routes.groundBranch.slice(1)) {
    state = walkTo(state, x, z, {events, context: 'optional ground investigation'});
    assertSubmittedSupport(state, 'optional ground investigation');
  }
  assert.equal(state.phase, 'wrong-return');
  assert.equal(state.closure.mode, 'dormant', 'initial investigation cannot arm an unseen pressure clock');
  assert.equal(state.counterweight.active, false, 'the unentered Catch cannot hunt the initial exploration');
  for (const [x, z] of routes.main.slice(4)) {
    state = walkTo(state, x, z, {events, context: 'interlocked stair network'});
    assertSubmittedSupport(state, 'interlocked stair network');
  }
  close(state.feet, 8.4, 1e-6, 'the full two-storey stair climb');
  assert.equal(state.phase, 'wrong-return', 'reaching the upper observation point is not a phase teleport');
  // The third interlocked flight is a genuine alternate loop, not an ornate
  // staircase one can see but never traverse. Walk it down, then rejoin.
  state = walkTo(state, -16, -30, {events, context: 'upper loop connection'});
  for (const [x, z] of routes.stairLoop.slice(1)) {
    state = walkTo(state, x, z, {events, context: 'optional return stair loop'});
    assertSubmittedSupport(state, 'optional return stair loop');
  }
  close(state.feet, 4.2, 1e-6, 'the alternate stair physically returns to the middle construction');
  for (const [x, z] of routes.main.slice(8)) state = walkTo(state, x, z, {events, context: 'rejoining the onward approach'});

  const onward = layout.continuationDoors(state).find(door => door.id === 'wrong-onward');
  assert.ok(onward);
  state = tick(state, {look: {yaw: -Math.PI / 2}}, events);
  assert.equal(controller.continuationFocus(state)?.id, onward.id, 'the actual upper handle is reachable from its supported approach');
  const closedApproach = clone(state);
  for (let frame = 0; frame < 6; frame++) state = tick(state, {forward: 1}, events);
  assert.equal(state.phase, 'wrong-return', 'a closed door refuses entry to III');
  assert.ok(state.x > onward.x - C.bodyRadius, 'closed visible leaves retain physical occupancy');
  assert.ok(events.some(event=>event.type==='door'&&event.id===onward.id&&event.automatic),'the visible forward approach opened the actual leaves without E');
  assert.equal(state.phase, 'wrong-return', 'opening the door alone does not advance the chapter');
  for (let frame = 0; frame < 25; frame++) state = tick(state, {}, events);
  state = walkTo(state, -26.5, onward.z, {events, context: 'physical II to III crossing'});
  assert.equal(state.phase, 'catch');
  assert.equal(events.filter(event => event.type === 'phase' && event.phase === 'catch').length, 1);
  assert.ok(Math.abs(state.x - closedApproach.x) > 8, 'the body traversed the intervening bridge');
  assert.equal(state.counterweight.active, false, 'the receiving architecture stays inspectable before the first voluntary descent');
  assertSubmittedSupport(state, 'first Catch receiving support');

  // Two choices at every required lip lead to genuine lower supports. This
  // continuous route chooses one, while the companion test below exercises both.
  for (let level = 0; level < C.catch.levels; level++) {
    assert.equal(state.level, level);
    observedStageSupports.add(layout.continuationStage(level).id);
    state = visitRefuge(state, events);
    if (level === C.catch.levels - 1) break;
    const lip = layout.CONTINUATION_DROP_LIPS[level];
    state = catchArc(state, lip.approachAngle, {events, context: `stage ${level} release approach`});
    state = walkTo(state, lip.x, lip.z, {events, context: `stage ${level} release edge`});
    assert.equal(controller.continuationFocus(state)?.id, lip.id);
    assertSubmittedSupport(state, `stage ${level} release support`);
    state = tick(state, {interact: true}, events);
    assert.ok(state.fall, 'a deliberate physical release begins gravity');
    state = waitForFall(state, events);
    assert.equal(state.level, level + 1);
    close(state.feet, layout.continuationCatchFloor(level + 1), 1e-6, 'the actual receiving stage height');
    assertSubmittedSupport(state, `stage ${level + 1} actual landing`);
  }
  assert.equal(observedStageSupports.size, C.catch.levels, 'every receiving stage has a distinct construction identity');
  assert.equal(events.filter(event => event.type === 'counterweight-warning' && event.reason === 'first-voluntary-descent').length, 1);

  state = catchArc(state, 0, {events, context: 'final threshold approach'});
  state = walkTo(state, C.catch.finalApproach.x, C.catch.finalApproach.z, {events, context: 'final supported balcony'});
  state = tick(state, {look: {yaw: C.catch.finalApproach.yaw, pitch: 0}}, events);
  assert.equal(controller.continuationFocus(state)?.id, 'catch-final');
  for(let frame=0;frame<25;frame++)state=tick(state,{},events);
  assert.equal(state.doorOpen['catch-final'],true,'the final approach opens its physical leaves without E');
  assert.equal(state.completed, false, 'an opening is not onward travel');
  for (let frame = 0; frame < 150 && !state.completed; frame++) state = tick(state, {forward: 1}, events);
  assert.equal(state.completed, true, 'the full body crosses the real final threshold');
  assert.equal(events.filter(event => event.type === 'complete').length, 1);
  assert.ok(state.x > C.catch.finalDoor.x, 'the completed body is on the onward side');
  assert.equal(controller.stepSourceContinuation(state, {dt: .2, interact: true, forward: 1}).events.length, 0);

  const result = runtime.completeContinuation(state);
  assert.equal(result.handled, true);
  assert.equal(result.event, 'horizon');
  assert.equal(result.through, 'source-continuation');
  const after = protectedFields(runtime.state());
  for (const key of ['sourceContacts', 'finalEncounter', 'injuriesAtEntry', 'bestEligible', 'optionalTraces']) assert.deepEqual(after[key], before[key], `${key} retains original authority`);
  assert.equal(after.finale.route, before.finale.route);
  assert.equal(after.finale.bust.decision, before.finale.bust.decision);
  assert.equal(runtime.acknowledgeContinuationHandoff(result.receipt), true);
  assert.equal(runtime.completeContinuation(state).handled, false, 'a delivered handoff is not repeated');
  assert.equal(runtime.acknowledgeContinuationHandoff(result.receipt), false);
  t.diagnostic(JSON.stringify({
    proof: 'Authored controller traversal, not uninformed-player discovery or human completion time',
    simulatedSeconds: Math.round(state.elapsed * 1000) / 1000,
    distinctReceivingStages: [...observedStageSupports],
    ordinaryCaptures: events.filter(event => event.type === 'capture').length,
    physicalDrops: events.filter(event => event.type === 'drop').length,
    physicalLandings: events.filter(event => event.type === 'land').length,
    physicalRegionCrossings: events.filter(event => event.type === 'phase').length,
    finalCrossings: events.filter(event => event.type === 'complete').length,
    handoffDelivered: runtime.state().sourceContinuation.exitReceipt.delivered,
  }));
});

test('both releases of every partial receiving stage land on real next-stage support without air correction', () => {
  for (let level = 0; level < C.catch.levels - 1; level++) {
    const lips = layout.continuationDropLips({level});
    assert.equal(lips.length, 2, 'the alternatives are physically available, rather than a hidden binary answer');
    for (const lip of lips) {
      let state = controller.resumeSourceContinuation(controller.freshSourceContinuation({runId: `release-${lip.id}`}));
      // Explicit bounded release fixture: the full unwarped route is checked
      // above; this isolates every alternative without replaying that route.
      state = controller.normalizeSourceContinuation({...state, phase: 'catch', level,
        x: lip.x, z: lip.z, feet: layout.continuationCatchFloor(level),
        lastSafe: {x: lip.x, z: lip.z, feet: layout.continuationCatchFloor(level), level, yaw: 0, pitch: 0},
      });
      const events = [];
      state = tick(state, {interact: true}, events);
      assert.ok(state.fall, `${lip.id} begins a real fall`);
      state = waitForFall(state, events);
      assert.equal(state.level, level + 1);
      assert.ok(events.some(event => event.type === 'land'));
      assertSubmittedSupport(state, `${lip.id} destination`);
    }
  }
});

test('each off-line refuge is enterable with its leaf closed and returns only through its opened physical plane', () => {
  for (let level = 0; level < C.catch.levels; level++) {
    const refuge = layout.continuationRefugeAt({phase: 'catch', level});
    let state = controller.normalizeSourceContinuation({
      ...controller.freshSourceContinuation({runId: `physical-refuge-${level}`}),
      status: 'active', phase: 'catch', level, ...refuge, lastSafe: {...refuge, yaw: 0, pitch: 0},
    });
    assert.ok(controller.sourceContinuationCanOccupy(refuge.x, refuge.z, state), 'a closed return door does not block the safe pocket');
    const door = layout.continuationDoors(state).find(value => value.id === `catch-return-${level}`);
    const outward = door.normal || {x: 0, z: 1};
    state = tick(state, {look: {yaw: Math.atan2(outward.x, -outward.z)}}, []);
    assert.equal(controller.continuationFocus(state)?.id, door.id);
    const events = [];
    state = tick(state, {interact: true}, events);
    assert.equal(state.status, 'active', 'operating the handle does not teleport or return the body');
    for (let frame = 0; frame < 20; frame++) state = tick(state, {}, events);
    for (let frame = 0; frame < 40 && state.status === 'active'; frame++) state = tick(state, {forward: 1}, events);
    assert.equal(state.status, 'returned', 'walking through the actual refuge door requests return');
    const signed = (state.x - door.x) * outward.x + (state.z - door.z) * outward.z;
    assert.ok(signed > C.bodyRadius, 'the complete body clears the outward plane');
    assert.equal(events.filter(event => event.type === 'return').length, 1);
  }
});

test('both regions and the 100m upper ruin remain in the submitted world on either side of the threshold', () => {
  const entry = controller.resumeSourceContinuation(controller.freshSourceContinuation({runId: 'persistent-world'}));
  const crossed = controller.normalizeSourceContinuation({...entry, phase: 'catch', level: 0,
    x: -26.5, z: -12, feet: C.catch.top, lastSafe: {x: -26.5, z: -12, feet: C.catch.top, yaw: 0, pitch: 0, level: 0},
  });
  const frames = [sourceContinuationRenderFrame(entry), sourceContinuationRenderFrame(crossed)];
  const supports = frame => frame.props.filter(prop => prop.physicalKind === 'surface').map(prop => prop.descriptorId).sort();
  assert.deepEqual(supports(frames[0]), supports(frames[1]), 'phase names cannot unload the place behind the player');
  for (const frame of frames) {
    const regions = new Set(frame.props.filter(prop => prop.physicalKind === 'surface').map(prop => prop.region));
    assert.ok(regions.has('wrong-return') && regions.has('catch'));
    const ruins = frame.props.filter(prop => prop.inheritedRuins);
    assert.ok(ruins.length >= 2, 'the actual door remnant and recognisable upper building survive the receiving handoff');
    assert.ok(ruins.every(prop => prop.y >= 99), 'the upper world is retained at its real hundred-metre elevation');
    assert.ok(frame.props.some(prop => prop.onwardPreview), 'the onward threshold has a physical receiving view');
  }
});

function uploadedProceduralTriangles() {
  let currentBuffer = null, currentVao = null;
  const gl = {
    ARRAY_BUFFER:34962, ELEMENT_ARRAY_BUFFER:34963, STATIC_DRAW:35044, FLOAT:5126, UNSIGNED_INT:5125,
    TEXTURE_2D:3553, ACTIVE_TEXTURE:34016, TEXTURE_BINDING_2D:32873, UNPACK_FLIP_Y_WEBGL:37440,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL:37441, SRGB8_ALPHA8:35907, RGBA8:32856, RGBA:6408,
    UNSIGNED_BYTE:5121, LINEAR_MIPMAP_LINEAR:9987, LINEAR:9729, REPEAT:10497, CLAMP_TO_EDGE:33071,
    createBuffer:()=>({}), createVertexArray:()=>({attributes:{}}), createTexture:()=>({}),
    bindBuffer(target, buffer) { currentBuffer = buffer; if (target === gl.ELEMENT_ARRAY_BUFFER && currentVao) currentVao.elements = buffer; },
    bufferData(_target, data) { currentBuffer.data = data.slice(); },
    bindVertexArray(vao) { currentVao = vao; },
    vertexAttribPointer(location) { currentVao.attributes[location] = currentBuffer; },
    enableVertexAttribArray(){}, disableVertexAttribArray(){}, vertexAttribDivisor(){}, vertexAttrib1f(){},
    bindTexture(){}, pixelStorei(){}, texImage2D(){}, generateMipmap(){}, texParameteri(){}, activeTexture(){}, getParameter:()=>0,
  };
  const pack = {catalog: new Map()};
  installSourceContinuationMeshes(gl, pack, {maps:{texture:{}, normalTexture:{}, ormTexture:{}, letteringFinish:{}}});
  const meshes = new Map();
  for (const [name, mesh] of pack.catalog) {
    const triangles = [];
    for (const primitive of mesh.primitives) {
      const positions = primitive.vao.attributes[0].data, indices = primitive.vao.elements.data;
      for (let offset = 0; offset < indices.length; offset += 3) triangles.push(Array.from(indices.slice(offset, offset + 3), index => Array.from(positions.slice(index * 3, index * 3 + 3))));
    }
    meshes.set(name, triangles);
  }
  return meshes;
}

function packedTriangles(file, submittedMeshes) {
  const bytes = readFileSync(new URL(`../public/assets/${file}`, import.meta.url));
  const jsonLength = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + jsonLength)), base = 28 + jsonLength;
  const read = id => {
    const accessor = json.accessors[id], view = json.bufferViews[accessor.bufferView];
    const components = {SCALAR:1, VEC2:2, VEC3:3, VEC4:4}[accessor.type];
    const componentSize = {5126:4, 5125:4, 5123:2, 5121:1}[accessor.componentType];
    const method = {5126:'readFloatLE', 5125:'readUInt32LE', 5123:'readUInt16LE', 5121:'readUInt8'}[accessor.componentType];
    assert.ok(components && componentSize && method, `${file}: supported authored accessor`);
    const stride = view.byteStride || components * componentSize, start = base + (view.byteOffset || 0) + (accessor.byteOffset || 0);
    return Array.from({length:accessor.count}, (_, index) => Array.from({length:components}, (_, component) => bytes[method](start + index * stride + component * componentSize)));
  };
  const result = new Map();
  for (let index = 0; index < json.meshes.length; index++) {
    const mesh = json.meshes[index], nodes = (json.nodes || []).filter(node => node.mesh === index);
    if (!submittedMeshes.has(mesh.name)) continue;
    assert.ok(nodes.every(node => !['matrix','translation','rotation','scale'].some(key => key in node)), `${file}: mesh-node transforms must be incorporated before using this proof`);
    result.set(mesh.name, mesh.primitives.flatMap(primitive => {
      const positions = read(primitive.attributes.POSITION), indices = primitive.indices == null ? positions.map((_, k) => k) : read(primitive.indices).flat();
      return Array.from({length:indices.length / 3}, (_, triangle) => indices.slice(triangle * 3, triangle * 3 + 3).map(id => positions[id]));
    }));
  }
  return result;
}

const subtract3 = (a, b) => a.map((value, axis) => value - b[axis]);
const dot3 = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
const cross3 = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
function segmentTriangle(start, end, [a, b, c]) {
  const direction = subtract3(end, start), edge1 = subtract3(b, a), edge2 = subtract3(c, a), p = cross3(direction, edge2), determinant = dot3(edge1, p);
  if (Math.abs(determinant) < 1e-9) return null;
  const offset = subtract3(start, a), u = dot3(offset, p) / determinant;
  if (u < -1e-6 || u > 1 + 1e-6) return null;
  const q = cross3(offset, edge1), v = dot3(direction, q) / determinant;
  if (v < -1e-6 || u + v > 1 + 1e-6) return null;
  const distance = dot3(edge2, q) / determinant;
  return distance > 1e-5 && distance < 1 - 1e-5 ? distance : null;
}

test('the original lower doorway has a robust 205-pose view through actual split-rail geometry, with an occluded centre-porch control', () => {
  const sightline = layout.CONTINUATION_SIGHTLINES.upperReturn;
  const state = controller.normalizeSourceContinuation({
    ...controller.freshSourceContinuation({runId:'upper-return-sightline'}), status:'active',
    x:sightline.eye.x, z:sightline.eye.z, feet:sightline.feet,
    lastSafe:{x:sightline.eye.x,z:sightline.eye.z,feet:sightline.feet,yaw:0,pitch:0,level:0},
  });
  assert.ok(controller.sourceContinuationCanOccupy(state.x, state.z, state), 'the measured overlook is an occupiable normal standing position');
  close(state.feet + C.eyeHeight, sightline.eye.y, 1e-6, 'actual carried eye height');
  assertSubmittedSupport(state, 'west return overlook');
  const frame = sourceContinuationRenderFrame(state), meshes = uploadedProceduralTriangles(), submittedMeshes = new Set(frame.props.map(prop => prop.mesh));
  for (const file of ['source-continuation-architecture.glb', 'conservatory-props.glb', 'conservatory-doors.glb', 'source-demolition.glb']) for (const [name, triangles] of packedTriangles(file, submittedMeshes)) meshes.set(name, triangles);
  const target = [sightline.target.x,sightline.target.y,sightline.target.z];
  // Bake only the real submitted triangles once. Every ray still intersects the
  // production topology; no simplified collision box stands in for a rail.
  const actualGeometry = frame.props.filter(prop => prop.doorId !== 'wrong-entry-return' && !prop.id.includes('wrong-entry-return')).map(prop => {
    const triangles = meshes.get(prop.mesh);
    assert.ok(triangles, `sightline must inspect actual submitted mesh ${prop.mesh}`);
    return {prop, triangles:triangles.map(triangle => triangle.map(point => transform(prop.matrix, point)))};
  });
  const blockers = eye => {
    const result = [];
    for (const {prop,triangles} of actualGeometry) {
      for (const triangle of triangles) {
        const t = segmentTriangle(eye, target, triangle);
        if (t != null) { result.push({id:prop.id, descriptorId:prop.descriptorId, t}); break; }
      }
    }
    return result.sort((a,b) => a.t - b.t);
  };
  assert.deepEqual(blockers([sightline.eye.x,sightline.eye.y,sightline.eye.z]), [], 'the authored eye sees the lower door through actual submitted geometry');
  let eyeCount = 0;
  for (let xi=0; xi<=40; xi++) for (let zi=0; zi<=4; zi++) {
    const x=3.85+xi*.01,z=2.9+zi*.05;
    const pose=controller.normalizeSourceContinuation({...state,x,z,lastSafe:{...state.lastSafe,x,z}});
    assert.ok(controller.sourceContinuationCanOccupy(x,z,pose), `real standing region ${x.toFixed(2)},${z.toFixed(2)} must be occupiable`);
    close(pose.feet,8.4,1e-6,'standing region uses actual upper support');
    assert.deepEqual(blockers([x,pose.feet+C.eyeHeight,z]),[], `lower door must survive arrival tolerance at eye ${x.toFixed(2)},${z.toFixed(2)}`);
    eyeCount++;
  }
  assert.equal(eyeCount,205,'dense sweep includes the intermediate x=3.90 top-rail regression');
  assert.ok(blockers([6,sightline.eye.y,3]).some(blocker => blocker.descriptorId === 'wrong-false-porch'), 'the negative control still hits the real porch floor; this is not a floorless or x-ray view');
});

test('old six-ring progress migrates monotonically onto the four distinct stages and remains idempotent', () => {
  let previousLevel = -1;
  for (let oldLevel = 0; oldLevel <= 5; oldLevel++) {
    const runId = `legacy-six-ring-${oldLevel}`;
    const old = {...controller.freshSourceContinuation({runId, returnPose: {x: 6.25, y: -343, yaw: -.4, pitch: .1}}),
      layoutVersion: undefined, phase: 'catch', status: 'active', level: oldLevel,
      x: -23, z: 0, feet: 3 - oldLevel * 3.6, elapsed: 20 + oldLevel,
      knowledge: ['earned-case-reference', `catch-${oldLevel}`],
      doorOpen: {'wrong-onward': true},
    };
    const state = controller.normalizeSourceContinuation(old);
    assert.equal(state.layoutVersion, 2);
    assert.equal(state.level, Math.round(oldLevel * 3 / 5));
    assert.ok(state.level >= previousLevel, 'more earned old progress never maps backward');
    previousLevel = state.level;
    assert.ok(state.knowledge.includes('earned-case-reference'));
    assert.deepEqual(state.returnPose, old.returnPose);
    assert.equal(state.doorOpen['wrong-onward'], true);
    assert.ok(layout.continuationSupportAt(state.x, state.z, state), 'migration puts the body on a visible safe support');
    assert.deepEqual(controller.normalizeSourceContinuation(state), state, 'reloading does not remigrate or move the body again');
  }
  const runId = 'legacy-earned-completion';
  const receipt = {id: `${runId}:source-continuation-exit`, delivered: true};
  const completed = controller.normalizeSourceContinuation({
    ...controller.freshSourceContinuation({runId}), layoutVersion: undefined,
    phase: 'catch', level: 5, x: -23.5, z: 0, feet: -15,
    status: 'completed', completed: true, handoff: true, exitReceipt: receipt,
  });
  assert.equal(completed.completed, true);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.level, C.catch.levels - 1, 'earned completion remains on the onward receiving stage');
  close(completed.feet, C.catch.finalApproach.feet, 1e-6, 'earned completion retains the final threshold height');
  assert.deepEqual(completed.exitReceipt, receipt);
  assert.deepEqual(controller.normalizeSourceContinuation(completed), completed);
  const reverse = controller.resumeSourceContinuation(completed, {reverse: true});
  assert.equal(reverse.level, C.catch.levels - 1, 'reverse entry starts at the actual final threshold level');
  close(reverse.feet, C.catch.finalApproach.feet, 1e-6, 'reverse entry physical height');
});

test('II pressure follows the encountered wrong return, leaves an exploration interval and announces the actual closing structure', () => {
  let state = controller.resumeSourceContinuation(controller.freshSourceContinuation({runId: 'demonstration-before-pressure'}));
  const events = [];
  for (const [x, z] of layout.SOURCE_CONTINUATION_ROUTES.main.slice(1)) state = walkTo(state, x, z, {events, context: 'pressure demonstration route'});
  assert.equal(state.closure.mode, 'dormant');
  state = walkTo(state, 6, -12, {events, context: 'wrong-return overlook approach'});
  state = walkTo(state, 6, 3, {events, context: 'the actual raised return porch'});
  assert.equal(state.closure.mode, 'primed', 'the approached open porch now supplies the witnessed altered return without E');
  assert.equal(events.filter(event => event.type === 'return-recognized').length, 1);
  for (let frame = 0; frame < 160; frame++) {
    state = tick(state, {}, events);
    assert.equal(state.closure.mode, 'primed', 'remaining at the observation cannot start an invisible deadline');
    assert.equal(state.recovery, null);
  }
  const falseReturn = layout.continuationDoors(state).find(door => door.id === 'wrong-false-return');
  state = tick(state, {look: {yaw: Math.atan2(falseReturn.x - state.x, state.z - falseReturn.z)}}, events);
  assert.equal(controller.continuationFocus(state)?.id, falseReturn.id);
  assert.equal(state.doorOpen[falseReturn.id], true, 'the actual optional leaf has been opened');
  state = tick(state, {}, events);
  assert.equal(state.closure.mode, 'primed');
  assert.equal(events.filter(event => event.type === 'return-recognized').length, 1);
  state = walkTo(state, 6, -12, {events, context: 'freely leaving the return porch'});
  assert.equal(state.closure.mode, 'primed', 'the player first gets a controllable exploration interval');
  const explorationAtArrival = state.closure.exposure, arrivedAt = state.elapsed;
  for (let frame = 0; frame < 400 && state.closure.mode === 'primed'; frame++) state = tick(state, {}, events);
  assert.equal(state.closure.mode, 'warning');
  close(state.elapsed - arrivedAt, C.wrongReturn.pressureDelay - explorationAtArrival, .051,
    'the actual warning waits for the complete remaining exploration interval');
  assert.equal(events.filter(event => event.type === 'closure-warning').length, 1);
  const warningPosition = state.closure.frontX;
  for (let frame = 0; frame < Math.floor((C.wrongReturn.warningSeconds - .15) / .05); frame++) {
    state = tick(state, {}, events);
    assert.equal(state.closure.mode, 'warning');
    close(state.closure.frontX, warningPosition, 1e-6, 'the warned structure cannot move before its warning ends');
    assert.equal(state.recovery, null);
  }
  state = walkTo(state, 0, -12, {events, context: 'visible refuge cross-arm'});
  state = walkTo(state, 0, -19, {events, context: 'physical II refuge'});
  assertSubmittedSupport(state, 'II refuge');
  const safe = {x: state.x, z: state.z, feet: state.feet};
  for (let frame = 0; frame < 500; frame++) {
    state = tick(state, {}, events);
    assert.equal(state.recovery, null, 'the actual off-line pocket remains safe as the architecture crosses the main route');
    assert.deepEqual({x: state.x, z: state.z, feet: state.feet}, safe);
  }
  assert.equal(state.closure.mode, 'closing');
  assert.ok(state.closure.frontX < warningPosition, 'the actual warned structure made physical progress');
});
