// Localized sensory absorption. This does not spend torch battery and does not
// modify the HUSH's hearing; it is a player-facing consequence of proximity.

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / Math.max(.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
};

export function inactiveHushField() {
  return {
    schema: 1,
    active: false,
    proximity: 0,
    acousticConnectivity: 0,
    absorption: { audio: 0, light: 0, monitor: 0 },
    pulse: 0,
    direction: { x: 0, y: 0 },
    stage: 'none',
  };
}

export function hushFieldStage(value) {
  if (value >= .92) return 'contact';
  if (value >= .72) return 'engulf';
  if (value >= .45) return 'near';
  if (value >= .20) return 'pressure';
  if (value > .01) return 'trace';
  return 'none';
}

export function computeHushField({ hush, operator, fieldScale = 1, occlusion = 0, now = 0, minDistance = 1.5, maxDistance = 34 } = {}) {
  if (!hush?.active || !hush.position || !operator?.position) return inactiveHushField();
  const dx = hush.position.x - operator.position.x;
  const dy = hush.position.y - operator.position.y;
  const distance = Math.hypot(dx, dy);
  const sameFloor = !hush.floorId || !operator.floorId || hush.floorId === operator.floorId;
  const sameRoom = !!hush.roomId && hush.roomId === operator.roomId;
  const connectivity = clamp01((sameFloor ? 1 : .28) * (sameRoom ? 1 : .78) * (1 - clamp01(occlusion) * .72));
  const proximity = 1 - smoothstep(minDistance, maxDistance, distance);
  const base = clamp01(proximity * connectivity * Math.max(0, Number(fieldScale) || 1));
  const pulse = clamp01(.5 + .28 * Math.sin(now * .0061) + .16 * Math.sin(now * .0173 + 1.7));
  const length = distance || 1;
  const monitor = Math.pow(base, 1.12);
  const field = {
    schema: 1,
    active: base > .001,
    source: { roomId: hush.roomId || null, floorId: hush.floorId || null, position: { ...hush.position } },
    operator: { roomId: operator.roomId || null, floorId: operator.floorId || null, position: { ...operator.position } },
    proximity,
    acousticConnectivity: connectivity,
    absorption: {
      audio: Math.pow(base, 1.32),
      light: Math.pow(base, 1.62),
      monitor,
    },
    pulse,
    direction: { x: dx / length, y: dy / length },
  };
  field.stage = hushFieldStage(field.absorption.monitor);
  return field;
}

export function applyFieldPresentationPolicy(field, settings = {}) {
  if (!field?.active) return field || inactiveHushField();
  const distortionScale = settings.hushAudioDistortion === 'reduced' ? .62 : 1;
  const silenceScale = settings.hushSilence === 'reduced' ? .58 : 1;
  const lightMode = settings.hushLightFlicker || 'full';
  // “Flicker off” removes rapid modulation, not the diegetic fact that the
  // HUSH consumes light. Keep a slower, readable dimming channel so the threat
  // remains legible without strobing.
  const lightScale = lightMode === 'off' ? .68 : lightMode === 'reduced' ? .82 : 1;
  const flickerScale = lightMode === 'off' ? 0 : lightMode === 'reduced' ? .35 : 1;
  return {
    ...field,
    presentation: {
      audio: clamp01(field.absorption.audio * distortionScale * silenceScale),
      monitor: clamp01(field.absorption.monitor * distortionScale),
      light: clamp01(field.absorption.light * lightScale),
      flicker: flickerScale,
      hiss: settings.hushHiss === 'reduced' ? .48 : 1,
      softenCuts: settings.hushSuddenCuts === 'softened',
    },
  };
}

export function effectiveTorchScale(field) {
  if (!field?.active) return 1;
  const absorption = clamp01(field.presentation?.light ?? field.absorption.light);
  const pulse = clamp01(field.pulse);
  const flickerScale = clamp01(field.presentation?.flicker ?? 1);
  const steady = 1 - Math.pow(absorption, 1.48) * .92;
  const flicker = absorption > .42
    ? Math.pow(absorption, 2.2) * Math.max(0, pulse - .58) * .82 * flickerScale
    : 0;
  return clamp01(steady - flicker);
}
