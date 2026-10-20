import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceSpaceRuntime, sourceMatrix } from '../src/game/source-space-runtime.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import { SOURCE_LAST_RECEPTION as S, sourceReceptionGeometry, sourceReceptionPropPlacements } from '../src/data/source-last-reception.js';
import { dividePieceBounds } from '../src/render/source-divide-meshes.js';
import { receptionMeshName } from '../src/render/source-last-reception-meshes.js';

const close = (a, b, message) => assert.ok(Math.abs(a - b) < .08, `${message}: ${a} != ${b}`);
function reception(saved = {}) {
  const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.LAST_RECEPTION, { seed: 4417, injuries: 0, hasRig: false });
  const runtime = createSourceSpaceRuntime({ initialState: { ...built.state, ...saved } });
  const origin = built.state.landscapeOrigin;
  let position = { ...built.position };
  runtime.setPlayerPosition(position);
  function walk(point) {
    const target = typeof point === 'string' ? S.anchors[point] : point;
    const destination = { x: origin.x + target.x / .5, y: origin.y + target.z / .5, facing: 0 };
    const start = { ...position }, steps = Math.max(1, Math.ceil(Math.hypot(destination.x - start.x, destination.y - start.y) / .2));
    for (let n = 1; n <= steps; n++) {
      const next = { x: start.x + (destination.x - start.x) * n / steps, y: start.y + (destination.y - start.y) * n / steps, facing: 0 };
      const result = runtime.geometry.canStep(position.x, position.y, next.x, next.y);
      assert.ok(result.ok, JSON.stringify({ from: position, next, result, probe: runtime.probe().divide }));
      runtime.onStep(position, next); runtime.setPlayerPosition(next); position = next;
      runtime.tick(1 / 48, { px: next.x, py: next.y, facing: 0 });
    }
    // Vertical descent is the production gravity clock rather than a teleport.
    for (let n = 0; n < 40 && runtime.state().sourceDivide?.falling; n++) runtime.tick(.02, { px: position.x, py: position.y, facing: 0 });
    if (Number.isFinite(target.y ?? target.floor)) close(runtime.geometry.renderedFloorAt(), target.y ?? target.floor, typeof point === 'string' ? point : 'walk');
    return runtime.geometry.renderedFloorAt();
  }
  function place(point, floor = point.y ?? point.floor ?? 9) {
    position = { x: origin.x + point.x / .5, y: origin.y + point.z / .5, facing: 0 };
    runtime.setPlayerPosition(position);
    return position;
  }
  return { runtime, origin, walk, place, position: () => position };
}

test('production Last Reception geometry allows an unhurried two-door exploration loop', () => {
  const { runtime, walk } = reception();
  for (const node of ['mainDoor', 'mainInside', 'lounge', 'returnDoor', 'returnRoom', 'release', 'serviceLink', 'serviceRoom', 'serviceDoor', 'serviceOutside']) walk(node);
  for (const node of ['serviceDoor', 'serviceRoom', 'serviceLink', 'returnRoom', 'westLink', 'westLoop', 'window', 'windowNorth', 'suiteNorth', 'suite', 'lounge', 'mainInside', 'mainDoor', 'mainOutside']) walk(node);
  assert.equal(runtime.lastReceptionFrame().phase, 'exploring');
  assert.equal(runtime.state().lastReception.seen.length, 0, 'movement cannot complete or reveal a conversation');
  assert.equal(runtime.state().lastReception.imprint, false);
  assert.equal(runtime.state().sourceContacts.talks, 0, 'the local building does not commit the Listening Court dialogue');
});

test('production player climbs and descends the gallery while the underlying lounge stays walkable', () => {
  const { runtime, walk } = reception();
  for (const node of ['mainDoor', 'mainInside', 'lounge', 'suite', 'suiteNorth', 'windowNorth', 'stairToe']) walk(node);
  walk({ ...S.anchors.stairFoot, y: 9.2 });
  walk('galleryTop'); walk('gallery');
  close(runtime.geometry.renderedFloorAt(), 11.8, 'actual gallery body height');
  assert.equal(runtime.state().sourceDivide.falling, false);
  walk('galleryTop'); walk({ ...S.anchors.stairFoot, y: 9.2 }); walk('stairToe');
  walk('windowNorth'); walk('window'); walk('westLoop');
  close(runtime.geometry.renderedFloorAt(), 9, 'same x/z room volume below gallery');
  assert.equal(runtime.lastReceptionFrame().phase, 'exploring');
});

test('the central lane remains a complete bypass of the optional jail', () => {
  const { runtime, walk, place } = reception({ sourceDivide: { version: 1, feet: 4.2, fallVelocity: 0, falling: false } });
  // On the lane, past the break in the floor short of the case crossing.
  place({ x: 0, z: -442, y: 4.2 });
  for (const z of [-450, -465, -480]) walk({ x: 0, z, y: 4.2 });
  assert.equal(runtime.lastReceptionFrame().inside, false);
  assert.equal(runtime.state().lastReception.entered, false);
  assert.equal(runtime.state().lastReception.visits, 0);
});

test('production instances include exact architectural/furniture transforms and six ordinary 3D residents', () => {
  const { runtime, origin, walk } = reception();
  walk('mainDoor'); walk('mainInside');
  const instances = runtime.propInstances(origin.x - 128, origin.y - 910, { all: true });
  for (const piece of sourceReceptionGeometry()) {
    const instance = instances.find(p => p.mesh === receptionMeshName(piece.id));
    assert.ok(instance, piece.id);
    const bounds = dividePieceBounds(piece), expected = sourceMatrix({ x: origin.x * .5 + bounds.center[0], y: bounds.center[1], z: origin.y * .5 + bounds.center[2] });
    assert.ok(instance.cullRadius >= bounds.radius);
    for (let i = 0; i < 16; i++) close(instance.matrix[i], expected[i], `${piece.id} transform[${i}]`);
  }
  for (const placement of sourceReceptionPropPlacements()) {
    const instance = instances.find(p => p.id === `source-reception:${placement.id}`);
    assert.ok(instance, placement.id); assert.equal(instance.mesh, placement.mesh);
  }
  const residents = instances.filter(p => p.receptionResident);
  assert.equal(residents.length, 6);
  assert.deepEqual(residents.map(p => p.receptionResident).sort(), ['gallery', 'guest-a', 'guest-b', 'host', 'warning', 'window']);
  for (const resident of residents) {
    assert.equal(resident.structural, false, 'resident stays in normal character prop material/depth pass');
    assert.ok(resident.mesh.startsWith('source_reception_'));
    assert.ok(Object.keys(resident.character?.joints || {}).length > 40, 'anatomical character rig');
    assert.equal(resident.apparitionVariant, undefined, 'social residents do not inherit the nearly invisible apparition material');
  }
});

test('a retained seated imprint joins the same production character instance pass after capture', () => {
  const { runtime, origin } = reception({ lastReception: { phase: 'released', imprint: true, outcome: 'captured' } });
  const instances = runtime.propInstances(origin.x - 128, origin.y - 910, { all: true });
  const residents = instances.filter(p => p.receptionResident);
  assert.equal(residents.length, 7);
  const imprint = residents.find(p => p.receptionResident === 'imprint');
  assert.ok(imprint?.character?.joints);
  close(imprint.matrix[12], origin.x * .5 + S.anchors.capture.x, 'retained chair x');
  close(imprint.matrix[14], origin.y * .5 + S.anchors.capture.z, 'retained chair z');
});

test('capture and release retain the elevated room floor and a physically walkable service escape',()=>{
  const {runtime,place,walk}=reception({lastReception:{phase:'captured',imprint:true,outcome:'captured'}});
  runtime.applyReceptionRelocation(S.anchors.capture);place(S.anchors.capture);
  close(runtime.geometry.renderedFloorAt(),9,'capture must not use the 4.2m terrain beneath the bank');
  const saved=runtime.state(),restored=createSourceSpaceRuntime({initialState:saved});
  restored.setPlayerPosition(runtime.applyReceptionRelocation(S.anchors.capture));
  close(restored.geometry.renderedFloorAt(),9,'saved captured body remains on the room floor');
  runtime.applyReceptionRelocation(S.anchors.release);place(S.anchors.release);
  close(runtime.geometry.renderedFloorAt(),9,'release keeps the same physical layer');
  for(const node of ['serviceLink','serviceRoom','serviceDoor','serviceOutside'])walk(node);
  close(runtime.geometry.renderedFloorAt(),9,'local release reaches the same bank');
});

test('the held seated guest occupies the actual armchair before rising into the clear aisle',()=>{
  const {runtime}=reception();
  const instances=runtime.propInstances(),guest=instances.find(p=>p.receptionResident==='guest-a');
  const chair=instances.find(p=>p.id==='source-reception:reception-foyer-armchair-a');
  close(guest.matrix[12],chair.matrix[12],'seated pelvis aligned with chair x');
  close(guest.matrix[14],chair.matrix[14],'seated pelvis aligned with chair z');
  assert.ok(runtime.lastReceptionFrame().residents.find(a=>a.id==='guest-a').x>chair.matrix[12]+.65);
});
