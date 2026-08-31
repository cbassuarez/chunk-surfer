// Localized sensory absorption. This does not spend torch battery and does not
// modify the HUSH's hearing; it is a player-facing consequence of proximity.

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const lerp = (a, b, t) => a + (b - a) * clamp01(t);
const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / Math.max(.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
};

// Positions in the building runtime are half-metre cells. The old field faded
// from 1.5 to 34 cells: the HUSH could already be a readable body while the
// torch and room remained completely normal, then both effects arrived almost
// at contact distance. Keep the trace broad enough to precede a sighting while
// reserving the violent collapse for the inner band.
export const HUSH_FIELD_RANGE = Object.freeze({
  contactDistance: 1.5,
  traceDistance: 72,
});

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

// The minimap is an instrument the player is carrying, not a debug view of the
// Presence simulation. It may acknowledge HUSH only after the player has an
// embodied fact: direct sight, or enough local absorption to feel/hear/see the
// room changing. A trace below the pressure rung stays beneath perception and
// cannot advertise an adversary merely because the simulation spawned one.
export function hushPhysicallySensed({ visible = false, field = null, authoredPressure = 0 } = {}) {
  if (visible) return true;
  const pressure = clamp01(authoredPressure);
  if (pressure >= .08) return true;
  if (!field?.active) return false;
  const sensation = Math.max(
    clamp01(field.presentation?.audio ?? field.absorption?.audio),
    clamp01(field.presentation?.monitor ?? field.absorption?.monitor),
    clamp01(field.presentation?.light ?? field.absorption?.light),
  );
  return ['pressure', 'near', 'engulf', 'contact'].includes(field.stage) || sensation >= .20;
}

export function computeHushField({
  hush,
  operator,
  fieldScale = 1,
  occlusion = 0,
  now = 0,
  minDistance = HUSH_FIELD_RANGE.contactDistance,
  maxDistance = HUSH_FIELD_RANGE.traceDistance,
} = {}) {
  if (!hush?.active || !hush.position || !operator?.position) return inactiveHushField();
  const dx = hush.position.x - operator.position.x;
  const dy = hush.position.y - operator.position.y;
  const distance = Math.hypot(dx, dy);
  const sameFloor = !hush.floorId || !operator.floorId || hush.floorId === operator.floorId;
  const sameRoom = !!hush.roomId && hush.roomId === operator.roomId;
  const obstruction = clamp01(occlusion);
  const connectivity = clamp01((sameFloor ? 1 : .28) * (sameRoom ? 1 : .78) * (1 - obstruction * .72));
  // Light interference is not an acoustic-room lookup. It is strongest on the
  // same floor and drops sharply behind geometry, while a trace can still leak
  // around a doorway or through a thin partition before the figure is visible.
  const opticalConnectivity = clamp01((sameFloor ? 1 : .12) * (1 - obstruction * .90));
  const proximity = 1 - smoothstep(minDistance, maxDistance, distance);
  const scale = Math.max(0, Number(fieldScale) || 1);
  const acousticBase = clamp01(proximity * connectivity * scale);
  const opticalBase = clamp01(proximity * opticalConnectivity * scale);
  const pulse = clamp01(.5 + .28 * Math.sin(now * .0061) + .16 * Math.sin(now * .0173 + 1.7));
  const length = distance || 1;
  const monitor = Math.pow(acousticBase, 1.12);
  const light = Math.pow(opticalBase, 1.22);
  const field = {
    schema: 1,
    active: Math.max(acousticBase, opticalBase) > .001,
    source: { roomId: hush.roomId || null, floorId: hush.floorId || null, position: { ...hush.position } },
    operator: { roomId: operator.roomId || null, floorId: operator.floorId || null, position: { ...operator.position } },
    proximity,
    acousticConnectivity: connectivity,
    opticalConnectivity,
    absorption: {
      audio: Math.pow(acousticBase, 1.32),
      light,
      monitor,
    },
    pulse,
    direction: { x: dx / length, y: dy / length },
  };
  field.stage = hushFieldStage(Math.max(field.absorption.monitor, field.absorption.light));
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

// One torch contract for architecture and mesh props. The previous integration
// only multiplied the raymarcher's light scalar; reach, cone and prop lighting
// remained clean, which made the interference disappear depending on what the
// player happened to be looking at.
export function applyHushTorchInterference(torch = {}, field = null) {
  const absorption = clamp01(field?.presentation?.light ?? field?.absorption?.light);
  if (!field?.active || absorption <= .001 || Number(torch.power) <= 0) {
    return { ...torch, hushInterference: 0 };
  }
  const powerScale = effectiveTorchScale(field);
  const reachScale = lerp(1, .42, Math.pow(absorption, 1.22));
  const choke = Math.pow(absorption, 1.35);
  const baseColor = Array.isArray(torch.color) ? torch.color : [1, .94, .82];
  const ashen = [baseColor[0] * .72, baseColor[1] * .74, baseColor[2] * .76];
  const coneInner = clamp01((Number(torch.coneInner) || .88) + choke * .055);
  const coneOuter = Math.max(
    coneInner + .015,
    clamp01((Number(torch.coneOuter) || .94) + choke * .035),
  );
  return {
    ...torch,
    power: clamp01((Number(torch.power) || 0) * powerScale),
    reach: Math.max(.35, (Number(torch.reach) || 1) * reachScale),
    color: baseColor.map((channel, index) => lerp(channel, ashen[index], absorption * .58)),
    coneInner: Math.min(.965, coneInner),
    coneOuter: Math.min(.985, coneOuter),
    spill: Math.max(0, (Number(torch.spill) || 0) * (1 - absorption * .92)),
    hushInterference: absorption,
  };
}

// The local absence is a property of the HUSH, not of the flashlight or audio
// graph. It therefore remains present when the operator is too far away for
// bodily interference, and accessibility settings remove motion without ever
// turning the shadow back into an ordinarily lit object.
// LEANING OUT HAS TO SHOW YOU SOMETHING.
//
// The absence is a volume in which light stops arriving, and at full strength it
// takes the surfaces around the body with it — which is precisely how a figure
// becomes invisible rather than terrifying. The emergency apparitions learned
// this the hard way: a black silhouette is unreadable when the thing making the
// dark is the only thing in the room, because an absence of the only light is
// indistinguishable from the wall behind it.
//
// A peek is bought with a noise and with the torch you did not dare use, so it
// must pay. Holding the absence back off the surroundings leaves the body
// something to read AGAINST. It does not brighten the HUSH; nothing does.
const HUSH_PEEK_LEGIBILITY = Object.freeze({ strength: .74, radiusScale: .62 });

export function hushAbsenceLook({ active = false, field = null, dread = 0, peek = 0 } = {}) {
  if (!active) return { active: false, strength: 0, radiusM: 0 };
  const proximity = clamp01(field?.proximity);
  const pressure = Math.max(
    clamp01(field?.presentation?.light ?? field?.absorption?.light),
    clamp01(dread),
  );
  const look = clamp01(peek);
  const strength = lerp(.88, .99, Math.max(proximity, pressure));
  const radiusM = lerp(5.6, 8.2, Math.max(proximity * .72, pressure));
  return {
    active: true,
    strength: lerp(strength, Math.min(strength, HUSH_PEEK_LEGIBILITY.strength), look),
    radiusM: lerp(radiusM, radiusM * HUSH_PEEK_LEGIBILITY.radiusScale, look),
  };
}
