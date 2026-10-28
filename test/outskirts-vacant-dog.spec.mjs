import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CELL } from '../src/data/floorplan/legend.js';
import { buildPreTapeGodPreset } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { parseCharacterAsset, sampleCharacterPose } from '../src/render/character-asset.js';
import {
  OUTSKIRT_DOG_ENCOUNTER, OUTSKIRT_PASSES, OUTSKIRT_STRETCH_START,
  OUTSKIRT_STRETCH_METRES, outskirtsArrivalLayout,
} from '../src/data/source-outskirts-arrival.js';

const selected = OUTSKIRT_DOG_ENCOUNTER;
assert.deepEqual(OUTSKIRT_PASSES.filter(pass => pass.break === 'stranger').map(pass => pass.k), [selected.pass],
  'the pair must have one reliable sighting');
const layout = outskirtsArrivalLayout();
const stage = layout.filter(piece => piece.stretch === selected.pass);
assert.ok(!stage.some(piece => /^(shelter|shelter-timetable|coat|bin|bench)$/.test(piece.key)),
  'late furniture crowds the dog silhouette and lamp pool');
assert.ok(stage.some(piece => piece.key === 'lamp-2' && !piece.dark),
  'the encounter lamp has gone dark');
const pair = layout.filter(piece => piece.stretch === selected.pass && piece.key.startsWith('dog-walker-'));
assert.deepEqual(pair.map(piece => piece.key).sort(),
  [selected.handlerKey, selected.dogKey, selected.leadKey].sort());
assert.deepEqual(pair.map(piece => piece.mesh).sort(),
  ['outskirts_dog_handler', 'outskirts_vacant_dog', 'outskirts_slack_lead'].sort());
assert.ok(pair.find(piece => piece.key === selected.handlerKey).watcher);
assert.ok(!pair.find(piece => piece.key === selected.dogKey).watcher,
  'the dog must never inherit the handler look-back');
assert.equal(pair.find(piece => piece.key === selected.leadKey).collision, 'none');

const asset = readFileSync(new URL('../public/assets/outskirts-vacant-dog.glb', import.meta.url));
assert.equal(asset.readUInt32LE(0), 0x46546c67);
const gltf = JSON.parse(asset.subarray(20, 20 + asset.readUInt32LE(12)).toString('utf8'));
assert.deepEqual(gltf.meshes.map(mesh => mesh.name).sort(), ['outskirts_slack_lead', 'outskirts_vacant_dog']);
assert.ok(gltf.meshes.find(mesh => mesh.name === 'outskirts_vacant_dog').primitives.length >= 7,
  'the selected body has lost its anatomical material layers');
assert.ok(gltf.meshes.every(mesh => mesh.primitives.every(primitive => primitive.targets == null)),
  'static world meshes must remain on the world prop and dither path');
const handlerBytes = readFileSync(new URL('../public/assets/outskirts-dog-handler.glb', import.meta.url));
const handlerAsset = parseCharacterAsset(handlerBytes.buffer.slice(handlerBytes.byteOffset,
  handlerBytes.byteOffset + handlerBytes.byteLength));
assert.deepEqual(handlerAsset.entries.map(entry => entry.name), ['outskirts_dog_handler']);
assert.ok(handlerAsset.json.materials.every(material => !material.alphaMode || ['OPAQUE', 'MASK'].includes(material.alphaMode)),
  'the skinned handler would be rejected by the opaque/depth/dither renderer');
assert.ok(handlerAsset.json.materials.some(material => material.name === 'handler dark hair exposure' && material.alphaMode === 'MASK'));
assert.ok(sampleCharacterPose(handlerAsset, handlerAsset.entries[0], { clip: 'idle', time: 0 }).bones.length,
  'the handler has no usable skinning pose');

const built = buildPreTapeGodPreset(0, { seed: 4417, marbleEyes: 'returned' });
let runtime = createSourceSpaceRuntime({ initialState: built.state });
const axis = built.position.x;
runtime.setPlayerPosition(built.position);
const initialAlong = runtime.outskirtsLastLight().along;
const passStart = OUTSKIRT_STRETCH_START + selected.pass * OUTSKIRT_STRETCH_METRES;
// The canonical van occupies the old centre line. The pair leaves this real
// walking lane clear between the handler and dog, including their loose lead.
const walkingAcross = 2;
const put = (along, across) => {
  const position = { ...built.position, x: axis + across / CELL,
    y: built.position.y - (along - initialAlong) / CELL };
  runtime.setPlayerPosition(position);
  return position;
};
const sample = (position, yaw) => runtime.propInstances(position.x, position.y,
  { viewYaw: yaw, reducedMotion: true, time: 314.15 });
const front = put(passStart + selected.along - 6, walkingAcross);
const handlerPiece = runtime.outskirtsPiece(`r${selected.pass}-${selected.handlerKey}`);
const eye = { x: (front.x + .5) * CELL, z: (front.y + .5) * CELL };
const bearing = Math.atan2(handlerPiece.x - eye.x, -(handlerPiece.z - eye.z));
const before = sample(front, bearing);
assert.ok(runtime.outskirtsDogQuietZone() > .99, 'the page storm hides the only sighting');
assert.ok(runtime.localLights().some(light => light.id === 'outskirts-dog-walker-sodium'),
  'the live lamp does not illuminate the two actual models');
const body = before.find(instance => instance.id === handlerPiece.id);
const dog = before.find(instance => instance.id === `r${selected.pass}-${selected.dogKey}`);
const lead = before.find(instance => instance.id === `r${selected.pass}-${selected.leadKey}`);
assert.ok(body?.character && dog && lead, 'the three independent figures are not in the world submission');
assert.equal(body.mesh, 'outskirts_dog_handler');
assert.equal(dog.mesh, 'outskirts_vacant_dog');
assert.equal(lead.mesh, 'outskirts_slack_lead');
assert.equal(dog.character, undefined);
assert.equal(lead.character, undefined);
assert.ok(runtime.geometry.canStep(front.x, front.y, front.x, front.y - 1).ok,
  'the pair blocks the supported walking lane beside them');
for (let metre = selected.along - 6; metre < selected.along + 6; metre += CELL) {
  const from = put(passStart + metre, walkingAcross);
  const to = { x: from.x, y: from.y - 1 };
  assert.ok(runtime.geometry.canStep(from.x, from.y, to.x, to.y).ok,
    `the pair blocks the walking lane at ${metre.toFixed(1)}m`);
}

const past = put(passStart + selected.along + 6, walkingAcross);
sample(past, 0); // Truly leave the seen pair behind the view.
const after = sample(past, Math.PI);
const changed = after.find(instance => instance.id === handlerPiece.id);
assert.ok(changed?.character?.joints?.head, 'the handler has no skinned head response');
assert.notDeepEqual(changed.character.joints.head.rotation, body.character.joints.head.rotation);
assert.deepEqual(changed.matrix, body.matrix, 'the handler turned as one rigid prop');
assert.deepEqual(after.find(instance => instance.id === dog.id).matrix, dog.matrix,
  'the dog followed the man on the return look');
assert.deepEqual(after.find(instance => instance.id === lead.id).matrix, lead.matrix,
  'the loose lead detached during the return look');

const saved = JSON.parse(JSON.stringify(runtime.state()));
runtime = createSourceSpaceRuntime({ initialState: saved });
runtime.setPlayerPosition(past);
const restored = sample(past, Math.PI).find(instance => instance.id === handlerPiece.id);
assert.deepEqual(restored?.character?.joints, changed.character.joints,
  'reload forgets the head turn while the pair remains visible');
console.log('vacant dog: unique pass, open anatomical pack, world submissions, walk lane, independent look-back and reload passed');
