// Emergency-light apparitions are a rendering event, never a second HUSH.
// The returned figure is invisible in the colour pass and exists only as a
// practical-light occluder, so it casts across real floors and walls without
// gaining collision, pursuit, contact, audio, or minimap state.

const distanceSq = (a, b) => {
  const dx = (Number(a?.x) || 0) - (Number(b?.x) || 0);
  const dz = (Number(a?.z) || 0) - (Number(b?.z) || 0);
  return dx * dx + dz * dz;
};

function fallbackDirection(id) {
  let hash = 2166136261;
  for (const char of String(id || 'emergency')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const angle = ((hash >>> 0) / 0xffffffff) * Math.PI * 2;
  return { x: Math.sin(angle), z: -Math.cos(angle) };
}

export function buildEmergencyShadowFrame(lights, {
  listener = null,
  enabled = true,
  maxDistance = 12,
} = {}) {
  if (!enabled || !listener || !Array.isArray(lights)) return null;
  const limitSq = Math.max(1, Number(maxDistance) || 12) ** 2;
  const candidates = lights
    .filter((light) => Number(light?.shadowReveal) > .08 && Number(light?.intensity) > .01)
    .filter((light) => distanceSq(light, listener) <= limitSq)
    .sort((a, b) => {
      const reveal = Number(b.shadowReveal) - Number(a.shadowReveal);
      return Math.abs(reveal) > .001 ? reveal : distanceSq(a, listener) - distanceSq(b, listener);
    });
  const light = candidates[0];
  if (!light) return null;

  let dx = (Number(listener.x) || 0) - (Number(light.x) || 0);
  let dz = (Number(listener.z) || 0) - (Number(light.z) || 0);
  const length = Math.hypot(dx, dz);
  if (length < .2) ({ x: dx, z: dz } = fallbackDirection(light.id));
  else { dx /= length; dz /= length; }

  const bodyDistance = 1.05;
  const shadowYaw = Math.atan2(dx, -dz);
  const floorY = Number.isFinite(light.floorY) ? light.floorY : (Number(light.y) || 1.8) - 1.8;
  return {
    lightId: light.id,
    lightOverride: {
      castsShadow: true,
      shadowYaw,
      shadowPitch: -.12,
    },
    instance: {
      id: `emergency-shadow:${light.id}:${light.pulseIndex ?? 0}`,
      mesh: 'stair_shadow_figure',
      x: (Number(light.x) || 0) + dx * bodyDistance,
      y: floorY,
      z: (Number(light.z) || 0) + dz * bodyDistance,
      yaw: shadowYaw + Math.PI,
      scaleX: 1.08,
      scaleY: 1.06,
      structural: true,
      shadowOnly: true,
      zone: Number(light.zone) || 0,
    },
  };
}
