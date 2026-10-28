import { HALL_CHANDELIER_GEOMETRY } from './generated/hall-chandelier-geometry.js';
import { LIGHT_KIND } from './conservatory-lights.js';

export const HALL_CHANDELIER_TREATMENT = Object.freeze({
  fixtureIds: Object.freeze(['acq-hall-chandelier-west', 'acq-hall-chandelier-east']),
  flickerFixtureId: 'acq-hall-chandelier-west',
  color: Object.freeze([1, .66, .32]),
  // A practical approximation, not a photometric claim. Three weighted sector
  // sources keep the existing eighteen lamps spatially distributed at no more
  // than three renderer slots. Tune through matched final-view comparisons.
  peakIntensity: .96,
  radius: 8.2,
  maximumLights: 3,
});

const hallIds = new Set(HALL_CHANDELIER_TREATMENT.fixtureIds);
const finitePoint = (point) => point && ['x', 'y', 'z'].every(axis => Number.isFinite(point[axis]));
const clamp01 = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

// Only the two exact Hall IDs opt into this proof. Corridor supply, the
// disconnected Dock copy, Source memories and chapel lanterns keep their own
// meshes and electrical owners. Incoming physical origins are authoritative.
export function hallChandelierInstances(instances = [], { geometry = HALL_CHANDELIER_GEOMETRY } = {}) {
  const names = geometry.meshNames;
  return instances.flatMap(instance => {
    if (!hallIds.has(instance?.id)) return [instance];
    const west = instance.id === HALL_CHANDELIER_TREATMENT.flickerFixtureId;
    const body = { ...instance, mesh: names.body, fallbackMesh: 'chandelier_03',
      practicalFixture: true, practicalEmissiveScale: 0, fixturePower: 1 };
    const support = { ...instance, id: `${instance.id}:support`,
      mesh: west ? names.westSupport : names.eastSupport, fallbackMesh: null,
      practicalFixture: false, practicalEmissiveScale: 0, fixturePower: 0 };
    return [body, support];
  });
}

export function hallChandelierWorldPoint(instance, localPoint) {
  if (!finitePoint(instance) || !Array.isArray(localPoint) || localPoint.length !== 3
    || !localPoint.every(Number.isFinite)) return null;
  // Exactly the props3d.modelMatrix convention: +yaw rotates local +X toward
  // world +Z. Authored logical coordinates must already have been resolved.
  const scale = Number.isFinite(instance.scale) ? instance.scale : 1;
  const sx = scale * (Number.isFinite(instance.scaleX) ? instance.scaleX : 1);
  const sy = scale * (Number.isFinite(instance.scaleY) ? instance.scaleY : 1);
  const sz = scale * (Number.isFinite(instance.scaleZ) ? instance.scaleZ : 1);
  const yaw = Number.isFinite(instance.yaw) ? instance.yaw : 0;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: instance.x + c * localPoint[0] * sx - s * localPoint[2] * sz,
    y: instance.y + localPoint[1] * sy,
    z: instance.z + s * localPoint[0] * sx + c * localPoint[2] * sz };
}

export function hallChandelierLights(instances = [], frame = {}, { geometry = HALL_CHANDELIER_GEOMETRY } = {}) {
  const power = clamp01(frame.power);
  if (!frame.active || frame.fixtureId !== HALL_CHANDELIER_TREATMENT.flickerFixtureId || power <= 0) return [];
  const instance = instances.find(value => value.id === HALL_CHANDELIER_TREATMENT.flickerFixtureId);
  if (!finitePoint(instance)) return [];
  const sectors = geometry.lightSectors || geometry.sectors || [];
  return sectors.slice(0, HALL_CHANDELIER_TREATMENT.maximumLights).flatMap((sector, index) => {
    const position = hallChandelierWorldPoint(instance, sector.center);
    if (!position || !Number.isFinite(sector.weight) || sector.weight <= 0) return [];
    return [{ id: `hall-chandelier-west-sector-${sector.index ?? index}`, ...position,
      kind: LIGHT_KIND.FITTING, color: [...HALL_CHANDELIER_TREATMENT.color],
      intensity: HALL_CHANDELIER_TREATMENT.peakIntensity * sector.weight * power,
      nominalIntensity: HALL_CHANDELIER_TREATMENT.peakIntensity * sector.weight,
      radius: HALL_CHANDELIER_TREATMENT.radius,
      anchorPropId: instance.id, emissiveScale: power,
      penetration: 0, spilling: false, castsShadow: false,
      circuit: null, powered: true, emergencyPulse: null, shadowReveal: 0,
      floorY: Number.isFinite(instance.floorY) ? instance.floorY : 0,
      zone: instance.zone,
    }];
  });
}
