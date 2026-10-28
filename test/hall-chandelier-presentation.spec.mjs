import test from 'node:test';
import assert from 'node:assert/strict';
import { HALL_CHANDELIER_GEOMETRY } from '../src/data/generated/hall-chandelier-geometry.js';
import { HALL_CHANDELIER_TREATMENT, hallChandelierInstances, hallChandelierLights, hallChandelierWorldPoint } from '../src/data/hall-chandelier-treatment.js';

const west = { id: 'acq-hall-chandelier-west', mesh: 'chandelier_03', x: 20, y: 7.1, z: 30, scale: 3, yaw: 0, zone: 4 };
const east = { ...west, id: 'acq-hall-chandelier-east', x: 29 };
const frame = { active: true, power: .8, fixtureId: west.id };

test('only the matched Hall IDs receive separate bodies and their maintenance-specific supports', () => {
  const others = ['deadend-ground-chandelier', 'dock-chandelier-intact', 'source-dock:dock-chandelier-intact', 'acq-chapel-lantern-nave']
    .map(id => ({ ...west, id }));
  const input = [west, east, ...others], output = hallChandelierInstances(input);
  assert.equal(output.length, input.length + 2);
  for (const other of others) assert.equal(output.find(instance => instance.id === other.id), other);
  for (const original of [west, east]) {
    const body = output.find(instance => instance.id === original.id), support = output.find(instance => instance.id === `${original.id}:support`);
    assert.equal(body.mesh, HALL_CHANDELIER_GEOMETRY.meshNames.body);
    assert.equal(body.fallbackMesh, 'chandelier_03');
    assert.equal(body.practicalFixture, true); assert.equal(body.practicalEmissiveScale, 0); assert.equal(body.fixturePower, 1);
    assert.equal(support.mesh, original === west ? HALL_CHANDELIER_GEOMETRY.meshNames.westSupport : HALL_CHANDELIER_GEOMETRY.meshNames.eastSupport);
    for (const key of ['x', 'y', 'z', 'yaw', 'scale', 'zone']) assert.equal(support[key], original[key], `${key} must use the same origin`);
  }
  assert.equal(west.mesh, 'chandelier_03', 'authored instance is not mutated');
  assert.equal(west.practicalFixture, undefined);
});

test('the generated lamp sectors cover all eighteen actual emitter envelopes exactly once', () => {
  const lamps = HALL_CHANDELIER_GEOMETRY.bulbs || HALL_CHANDELIER_GEOMETRY.lamps;
  const sectors = HALL_CHANDELIER_GEOMETRY.lightSectors || HALL_CHANDELIER_GEOMETRY.sectors;
  assert.equal(lamps.length, 18); assert.equal(sectors.length, 3);
  assert.deepEqual(sectors.flatMap(sector => sector.bulbIndices).sort((a, b) => a - b), Array.from({ length: 18 }, (_, i) => i));
  assert.ok(Math.abs(sectors.reduce((sum, sector) => sum + sector.weight, 0) - 1) < 1e-8);
  for (const sector of sectors) {
    assert.equal(sector.count, 6); assert.equal(sector.bulbIndices.length, 6);
    const group = sector.bulbIndices.map(index => lamps.find(lamp => lamp.index === index));
    for (let axis = 0; axis < 3; axis++) {
      const average = group.reduce((sum, lamp) => sum + lamp.emitterCenter[axis], 0) / group.length;
      assert.ok(Math.abs(average - sector.center[axis]) < 1e-6, 'illumination derives from emitted glass, not the whole component centre');
    }
  }
});

test('the light sectors register to the physical body at every yaw and preserve total bounded output', () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const instance = { ...west, yaw }, lights = hallChandelierLights([instance, east], frame);
    const sectors = HALL_CHANDELIER_GEOMETRY.lightSectors || HALL_CHANDELIER_GEOMETRY.sectors;
    assert.equal(lights.length, 3);
    for (let index = 0; index < lights.length; index++) {
      const local = sectors[index].center, light = lights[index];
      assert.ok(Math.abs(light.x - (west.x + Math.cos(yaw) * local[0] * 3 - Math.sin(yaw) * local[2] * 3)) < 1e-8);
      assert.ok(Math.abs(light.y - (west.y + local[1] * 3)) < 1e-8);
      assert.ok(Math.abs(light.z - (west.z + Math.sin(yaw) * local[0] * 3 + Math.cos(yaw) * local[2] * 3)) < 1e-8);
      assert.equal(light.kind, 'fitting'); assert.equal(light.anchorPropId, west.id); assert.equal(light.emissiveScale, frame.power);
      assert.equal(light.castsShadow, false); assert.equal(light.shadowReveal, 0); assert.equal(light.emergencyPulse, null);
      assert.equal(light.circuit, null); assert.equal(light.penetration, 0);
    }
    assert.ok(Math.abs(lights.reduce((sum, light) => sum + light.intensity, 0) - HALL_CHANDELIER_TREATMENT.peakIntensity * frame.power) < 1e-8);
  }
});

test('dark, absent, east, cancelled and invalid frames cannot leave an orphan light', () => {
  for (const input of [{}, { ...frame, active: false }, { ...frame, power: 0 }, { ...frame, power: NaN }, { ...frame, power: Infinity },
    { ...frame, fixtureId: east.id }]) assert.deepEqual(hallChandelierLights([west, east], input), []);
  assert.deepEqual(hallChandelierLights([east], frame), []);
  assert.deepEqual(hallChandelierLights([{ ...west, y: NaN }], frame), []);
  assert.deepEqual(hallChandelierLights([west, east], frame).filter(light => light.anchorPropId === east.id), []);
  assert.equal(hallChandelierWorldPoint(west, [0, NaN, 0]), null);
  const transformed = hallChandelierWorldPoint({ ...west, scaleX: 2, scaleY: .5, scaleZ: 3 }, [1, 2, 3]);
  assert.deepEqual(transformed, { x: 26, y: 10.1, z: 57 });
});
