import { CELL, ZONE } from '../data/floorplan/legend.js';
import { CHAPEL_SERVICE_ANCHORS } from '../data/chapel-service-score.js';

export function chapelServiceWorldSources(plan) {
  if (!plan?.isLoaded?.()) return [];
  return CHAPEL_SERVICE_ANCHORS.flatMap(station => {
    // Match the existing apparition's exact prop station. toRuntimePoint's
    // default cell-centre offset is appropriate for a walking warp, but would
    // move this mouth half a metre away from its visible body.
    const rx = Math.round(station.x * 2), ry = Math.round(station.y * 2);
    if (plan.isSolid(rx, ry)) return [];
    const at = plan.logicalToPhysical(rx, ry);
    if (at.renderGroup !== 'upper') return [];
    const ground = plan.floorAt(rx, ry);
    return [{ ...station, rx, ry, group: at.renderGroup, ground,
      x: at.x * CELL + (station.x - rx * CELL),
      y: ground + station.mouthHeight * station.scale,
      z: at.z * CELL + (station.y - ry * CELL) }];
  });
}

export function chapelServiceFrame({ eligible = false, listener = null, sources = [], yaw = 0,
  recording = false, listening = false, playback = false, paused = false,
  blocked = false, battle = false, finale = false, suppressActors = false,
  focused = true, effectsMode = 'full', dialogue = false, occlusion = () => 0,
} = {}) {
  let reason = null;
  if (!eligible) reason = 'outside-building-gameplay';
  else if (!listener || listener.group !== 'upper') reason = 'other-floor';
  else if (![ZONE.chapel, ZONE.chapelOuter].includes(listener.zone)) reason = 'outside-chapel';
  else if (effectsMode === 'off') reason = 'effects-off';
  else if (finale) reason = 'finale';
  if (reason) return { active: false, muted: true, reason, voices: [], yaw, dialogue: false };
  const muted = recording || listening || playback || paused || blocked || battle || suppressActors || !focused;
  const voices = sources.map(source => ({
    id: source.id, presenceId: source.presenceId,
    dx: source.x - listener.x, dz: source.z - listener.z,
    dy: source.y - listener.y, radius: source.radius,
    // A door may leak voices; a different slab/group may not. The chancel's
    // small step belongs to the same service, unlike the organ-loft floor.
    gain: source.group === listener.group && Math.abs(source.ground - listener.ground) < .95 ? 1 : 0,
    occlusionDb: Math.max(0, Math.min(60, Number(occlusion(source)) || 0)),
  }));
  return { active: voices.some(v => v.gain > 0), muted: !!muted,
    reason: muted ? 'protected-or-blocked' : 'service', voices, yaw, dialogue: !!dialogue };
}
