import {
  CHAPEL_CONGREGATION, CHAPEL_DRESSING, CHAPEL_DRESSING_BUDGET,
} from '../data/chapel-dressing.js';
import { APPARITION_RENDER_VARIANT, APPARITION_LIGHT_STATE } from './emergency-light-runtime.js';
import { wallContactAt } from '../world/wall-contact.js';
import { propWallPose } from '../world/prop-wall-pose.js';

// The congregation is fixed to the chapel, not to the camera. Projection is
// supplied by the actual plan so upper-wing re-embeddings remain authoritative.
// This returns ordinary prop instances only: existing depth, material lights
// and the ONE final acquisition/dither pass handle every surface.
export function chapelDressingWorldPlacements(plan, bounds = {}) {
  if (!plan?.isLoaded?.()) return [];
  const out = [];
  for (const p of [...CHAPEL_DRESSING, ...CHAPEL_CONGREGATION]) {
    const rx = Math.round(p.x * 2), ry = Math.round(p.y * 2);
    if (plan.isSolid(rx, ry)) continue;
    const at = plan.logicalToPhysical(rx, ry);
    if (!at || at.renderGroup !== 'upper') continue;
    let offsetX = p.x - rx * .5, offsetZ = p.y - ry * .5;
    let yaw = p.yaw || 0;
    if (p.mount === 'wall') {
      const contact = wallContactAt(plan, rx + .5, ry + .5, { prefer: p.mountNormal });
      // Fail closed rather than float lettering in the aisle when a future
      // architectural edit removes its supporting wall.
      if (!contact) continue;
      const pose = propWallPose(p, bounds[p.mesh], contact);
      if (pose.x !== null) offsetX = (pose.x - rx) * .5;
      if (pose.y !== null) offsetZ = (pose.y - ry) * .5;
      offsetX += contact.nx * .0035;
      offsetZ += contact.ny * .0035;
      yaw = pose.yaw;
    }
    out.push({
      id: p.id, mesh: p.mesh, x: at.x * .5 + offsetX,
      y: plan.floorAt(rx, ry) + (p.elevation || 0), z: at.z * .5 + offsetZ,
      yaw, scale: p.scale || 1, zone: plan.zoneAt(rx, ry),
      structural: false, noShadow: true,
      kind: p.kind, role: p.role || null, posture: p.posture || null, figure: p.figure || null,
      row: p.row, bank: p.bank, seat: p.seat, watchful: !!p.watchful, rapture: p.rapture || null, ceilingY: plan.ceilAt(rx, ry),
      blocks: false, interactive: false,
    });
  }
  return out;
}

// A constant cold shaft already lights the nave. In its reach the human mass
// is present; beyond it a torch reveals a broken residual charge, then the
// existing unlit variant becomes barely a pressure change. We add no strobe,
// self-light, pursuit, dialog cycle or scare to make these figures legible.
export function chapelPresenceLightState(instance, { lights = [], torchOn = false } = {}) {
  let hasOrdinary = false;
  for (const light of lights) {
    const radius = Math.max(0, Number(light.radius) || 0);
    const distance = Math.hypot(instance.x - (Number(light.x) || 0), instance.z - (Number(light.z) || 0));
    if (distance >= radius || Number(light.intensity) <= .06) continue;
    if (light.kind === 'emergency' && Number(light.shadowReveal) > .08) return APPARITION_LIGHT_STATE.ON;
    if (light.kind !== 'emergency') hasOrdinary = true;
  }
  if (hasOrdinary) return APPARITION_LIGHT_STATE.ON;
  return torchOn ? APPARITION_LIGHT_STATE.OFF : APPARITION_LIGHT_STATE.UNLIT;
}

export function chapelDressingRenderInstances(placements, {
  group = null, lights = [], torchOn = false, listener = null,
  // Actor protection matches borrowed/recorded rooms in main.js. Static paint,
  // tallow and traces remain architecture, never hallucinations on a take.
  // The chapel's own congregation is the exception and is NOT protected from a
  // take: it is the room's rule (game/chapel-apparitions.js).
  suppressActors = false, effectsMode = 'full',
  // With a runtime the congregation moves and the ceiling is occupied; without
  // one the bodies are drawn as authored, still.
  apparitions = null, ceiling = [], eye = null, timeSec = 0, moving = 0,
  recording = false, takeProgress = 0, canSee = null, onFrame = null,
  choir = null, reducedMotion = false,
} = {}) {
  if (group !== 'upper') return [];
  const result = [], bodies = [], hidden = suppressActors || effectsMode === 'off';
  const stateOf = (p) => chapelPresenceLightState(p, { lights, torchOn });
  // Edge charge belongs to the body itself. It never creates local lights.
  const charge = (state) => [.65, .78, .82, state === APPARITION_LIGHT_STATE.ON ? .14 : .06];
  const near = (p) => !listener || Math.hypot(p.x - listener.x, p.z - listener.z) <= CHAPEL_DRESSING_BUDGET.maxPresenceDistance;
  for (const p of placements || []) {
    if (p.kind !== 'presence') { result.push(p); continue; }
    if (hidden || !near(p)) continue;
    if (apparitions) { bodies.push(p); continue; }
    const state = stateOf(p);
    result.push({ ...p, apparitionVariant: 0, emissive: [0, 0, 0, 0] });
  }
  if (apparitions && !hidden) {
    const frame = apparitions.frame({
      congregation: bodies, ceiling: (ceiling || []).filter(near), eye, timeSec, moving, recording,
      takeProgress, effectsMode, canSee, choir, reducedMotion,
      // Congregants carry actual clothing and skin materials through normal world
      // lighting. The legacy pressure variants flatten every surface before
      // material shading, which turned the whole service into uniform dummies.
      // Ceiling apparitions retain their established spectral treatment.
      variantFor: (p) => p.role === 'ceiling' ? APPARITION_RENDER_VARIANT[stateOf(p)] : 0,
      emissiveFor: (p) => p.role === 'ceiling' ? charge(stateOf(p)) : [0, 0, 0, 0],
    });
    for (const instance of frame.instances) result.push(instance);
    onFrame?.(frame);
  } else onFrame?.(null);
  return result;
}
