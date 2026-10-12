import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Box3, BoxGeometry, DataTexture, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { COMBAT_TOOL } from '../src/game/combat-state.js';
import { buildBattleHandTool } from '../src/render/battle-hand-tools.js';
import { createBattleHandRig, parseBattleHandTemplate } from '../src/render/battle-hand-rig.js';

test('every equipped combat tool supplies finite physical geometry and anatomically supported finger pads', () => {
  for (const id of Object.values(COMBAT_TOOL)) {
    const tool = buildBattleHandTool(id);
    if (id === 'self') {
      assert.equal(tool.group.children.length, 0);
      assert.equal(tool.contacts.right, null);
      tool.dispose(); continue;
    }
    assert.ok(tool.group.children.length > 0, `${id} has a physical object`);
    tool.group.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(tool.group);
    assert.ok(!bounds.isEmpty(), `${id} bounds`);
    assert.ok([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite), `${id} finite bounds`);
    const grip = tool.contacts.right;
    for (const finger of ['index', 'middle', 'ring', 'pinky', ...(grip.thumb ? ['thumb'] : [])]) {
      const contact = grip[finger];
      assert.ok(contact?.position?.length === 3 && contact.position.every(Number.isFinite), `${id}:${finger} contact`);
      assert.ok(contact.normal?.length === 3 && contact.normal.every(Number.isFinite), `${id}:${finger} normal`);
      assert.ok(Math.abs(Math.hypot(...contact.normal) - 1) < 1e-8, `${id}:${finger} unit normal`);
    }
    assert.equal(grip.little, grip.pinky, `${id} little alias is the same finger`);
    tool.dispose();
  }
});

test('tool updates preserve game snapshots and planted grip targets through actions and hurt', () => {
  for (const id of Object.values(COMBAT_TOOL)) {
    const cosmetics = { faceplate: 'witness', buttons: 'sea-glass', vfd: 'ice', flashlightHousing: 'olive' };
    const beforeCosmetics = structuredClone(cosmetics), tool = buildBattleHandTool(id, cosmetics);
    const grip = JSON.stringify(tool.contacts);
    for (const action of ['monitor', 'playback', 'expose', 'whiteout', 'invert', 'runaway-feedback', 'tune', 'radio-decoy', 'swing', 'steady-hands']) {
      for (const progress of [0, .20, .28, .5, .85, 1]) {
        const frame = { action, progress, impactFired: progress >= .28, hurt: .8, readout: { counter: '00:01', meter: { db: -96 }, recording: action === 'monitor' && progress >= .28 } };
        const before = structuredClone(frame);
        tool.update(frame);
        assert.deepEqual(frame, before, `${id}:${action} leaves simulation input read-only`);
        assert.equal(JSON.stringify(tool.contacts), grip, `${id}:${action} keeps supported pads fixed`);
        tool.group.traverse(object => assert.ok([...object.position.toArray(), ...object.quaternion.toArray()].every(Number.isFinite), `${id}:${action} finite transform`));
      }
    }
    assert.deepEqual(cosmetics, beforeCosmetics);
    tool.dispose();
  }
});

test('switching physical tools disposes every owned geometry and material exactly once', () => {
  for (const id of Object.values(COMBAT_TOOL)) {
    const tool = buildBattleHandTool(id), geometries = new Set(), materials = new Set();
    tool.group.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
    });
    let geometryEvents = 0, materialEvents = 0;
    for (const item of geometries) item.addEventListener('dispose', () => geometryEvents++);
    for (const item of materials) item.addEventListener('dispose', () => materialEvents++);
    tool.dispose(); tool.dispose(); tool.update({ action: 'monitor', progress: .5 });
    assert.equal(geometryEvents, geometries.size, `${id} geometry ownership`);
    assert.equal(materialEvents, materials.size, `${id} material ownership`);
    assert.equal(tool.group.children.length, 0, `${id} no retained render tree`);
  }
});

test('tool disposal preserves borrowed hand geometry, skin materials and maps attached later', () => {
  const tool = buildBattleHandTool('recorder');
  const geometry = new BoxGeometry(.05, .10, .02), map = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const material = new MeshBasicMaterial({ map }), borrowedHand = new Mesh(geometry, material);
  let foreignDisposals = 0;
  for (const resource of [geometry, material, map]) resource.addEventListener('dispose', () => foreignDisposals++);
  tool.group.add(borrowedHand);
  tool.dispose(); tool.dispose();
  assert.equal(foreignDisposals, 0, 'external children are borrowed, not tool-owned');
  assert.equal(borrowedHand.parent, null, 'borrowed child detaches cleanly for reuse');
  geometry.dispose(); material.dispose(); map.dispose();
});

test('radio THROW VOICE presses its physical PTT while the tuning dial stays still', () => {
  const tool = buildBattleHandTool('radio'), cap = tool.group.getObjectByName('radio PTT keycap');
  const dial = tool.group.getObjectByName('radio tuning dial');
  const rest = cap.position.x, contactRest = tool.controls.transmit.position[0], wristRest = tool.controls.transmit.wrist.position[0];
  for (const pressure of [0, .25, 1, .5, 0]) {
    tool.update({ action: 'radio-decoy', side: 'player', active: true, progress: .4, controlPressure: pressure });
    assert.ok(Math.abs(cap.position.x - rest - .0014 * pressure) < 1e-12);
    assert.ok(Math.abs(tool.controls.transmit.position[0] - contactRest - .0014 * pressure) < 1e-12);
    assert.ok(Math.abs(tool.controls.transmit.wrist.position[0] - wristRest - .0014 * pressure) < 1e-12);
    assert.equal(dial.rotation.y, 0, 'PTT does not turn the untouched tuning dial');
  }
  tool.update({ action: 'channel', side: 'player', active: true, progress: .4, controlPressure: 1 });
  assert.ok(dial.rotation.y < 0, 'channel tuning operates the dial');
  assert.equal(cap.position.x, rest, 'tuning leaves the PTT released');
  tool.update({ action: 'radio-decoy', side: 'enemy', active: true, progress: .4, controlPressure: 1 });
  assert.equal(cap.position.x, rest);
  tool.dispose();
});

test('torch cap follows the authored thumb pressure while emission waits for actual player impact', () => {
  const tool = buildBattleHandTool('torch');
  const cap = tool.group.getObjectByName('torch switch'), lens = tool.group.getObjectByName('torch lens');
  const resting = cap.position.clone();
  for (const pressure of [0, .25, .75, 1, 2, -.5]) {
    tool.update({ action: 'expose', side: 'player', active: true, progress: .1, controlPressure: pressure, impactFired: false });
    assert.ok(Math.abs(cap.position.distanceTo(resting) - .0012 * Math.max(0, Math.min(1, pressure))) < 1e-12);
    assert.equal(lens.material.emissiveIntensity, 0, 'finger approach cannot fabricate an exposed result');
  }
  tool.update({ action: 'whiteout', side: 'player', active: true, progress: .5, controlPressure: .6, impactFired: true });
  assert.ok(lens.material.emissiveIntensity > 0);
  tool.update({ action: 'whiteout', side: 'enemy', active: true, progress: .5, controlPressure: 1, impactFired: true });
  assert.equal(cap.position.distanceTo(resting), 0);
  assert.equal(lens.material.emissiveIntensity, 0);
  tool.update({ action: 'expose', side: 'player', active: true, progress: .4, impactFired: true });
  assert.ok(Math.abs(cap.position.distanceTo(resting) - .0012) < 1e-12, 'legacy callers retain the raw contact timing');
  tool.dispose();
});

test('recorder physical key and left-wrist contact share the authored operation pressure', () => {
  const tool = buildBattleHandTool('recorder');
  const cap = tool.group.getObjectByName('rec keycap');
  const resting = cap.position.z, targetRest = tool.controls.rec.position[2], wristRest = tool.controls.rec.wrist.position[2];
  for (const [progress, pressure] of [[.2, 0], [.28, 1], [.37, 1], [.60, .5], [.86, 0]]) {
    tool.update({ action: 'monitor', side: 'player', active: true, progress, controlPressure: pressure, impactFired: progress >= .28 });
    assert.ok(Math.abs(resting - cap.position.z - pressure * .0015) < 1e-12);
    assert.ok(Math.abs(targetRest - tool.controls.rec.position[2] - pressure * .0015) < 1e-12);
    assert.ok(Math.abs(wristRest - tool.controls.rec.wrist.position[2] - pressure * .0015) < 1e-12);
    assert.equal(tool.group.getObjectByName('takes keycap').position.z, resting, 'only the selected physical key moves');
  }
  tool.update({ action: 'monitor', side: 'enemy', active: true, progress: .4, controlPressure: 1, impactFired: true });
  assert.equal(cap.position.z, resting);
  tool.dispose();
});

test('baked anatomical grips support every tool without intersecting the actual holding body', async () => {
  const bytes = await readFile(new URL('../public/assets/battle-hands/right.glb', import.meta.url));
  const template = await parseBattleHandTemplate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const bodies = {
    recorder: ['DA-1000 chassis'], radio: ['portable short-wave radio'], rig: ['bent interface chassis'],
    torch: ['torch handle'], fork: ['fork stem', 'fork foot'], coffee: ['coffee cup'], spanner: ['adjustable spanner shank'],
  };
  for (const [id, names] of Object.entries(bodies)) {
    const tool = buildBattleHandTool(id), grip = tool.contacts.right;
    const hand = createBattleHandRig(template, { nails: false });
    hand.setRootPose(grip.wrist); hand.setFingerPose(grip.pose);
    const contacts = hand.measureGrip(grip, { space: 'world' });
    for (const [finger, contact] of Object.entries(contacts)) assert.ok(contact.error < .0016, `${id}:${finger} supported within 1.6 mm (${contact.error * 1000})`);
    hand.skin.skeleton.update(); tool.group.updateMatrixWorld(true);
    const point = new Vector3(), local = new Vector3();
    for (const name of names) {
      const mesh = tool.group.getObjectByName(name);
      assert.ok(mesh?.isMesh, `${id} physical holding body ${name}`);
      mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox, cylinder = mesh.geometry.type === 'CylinderGeometry' ? mesh.geometry.parameters : null;
      for (let index = 0; index < hand.skin.geometry.attributes.position.count; index++) {
        hand.skin.getVertexPosition(index, point); hand.skin.localToWorld(point);
        mesh.worldToLocal(local.copy(point));
        let penetration;
        if (cylinder) {
          const y = local.y + cylinder.height / 2;
          if (y <= 0 || y >= cylinder.height) continue;
          const radius = cylinder.radiusBottom + y / cylinder.height * (cylinder.radiusTop - cylinder.radiusBottom);
          penetration = radius - Math.hypot(local.x, local.z);
        } else penetration = Math.min(local.x - bounds.min.x, bounds.max.x - local.x, local.y - bounds.min.y, bounds.max.y - local.y, local.z - bounds.min.z, bounds.max.z - local.z);
        assert.ok(penetration < .001, `${id}:${index} skin penetrates ${name} by ${penetration * 1000} mm`);
      }
    }
    hand.dispose(); tool.dispose();
  }
});
