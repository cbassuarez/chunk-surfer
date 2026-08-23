// Emergency-light apparitions are a rendering event, never a second HUSH.
// Like the HUSH body, they occupy world depth: real geometry that can be hidden
// by doors, seats and walls. They are also practical-light occluders, so the
// same bodies stand in the room, cast across it, and emit a local white field
// without gaining collision, pursuit, contact, audio, or minimap state.
//
// THEY MILL. THEY DO NOT HUNT.
//
// The first version staged all three figures on the camera axis — 1.8m, 3.4m and
// 5.6m directly ahead of the player, rebuilt from viewYaw every frame. That is a
// crowd welded to your face: it swung with the mouse, it was in front of you no
// matter where you stood, and because nothing in it was anchored to the building
// there was no such thing as movement. The whole effect collapsed onto finding
// the player, which is the one thing it must never do.
//
// Now the crowd belongs to the ROOM. Each figure holds a station around the
// practical, at its own bearing and its own distance, and wanders that station
// on two slow incommensurate oscillators, so the drift never repeats and never
// resolves into a direction. Nothing here can reach you, close on you, or run
// out of behaviour: you can stand and watch it for an hour and it will still be
// milling, which is the only kind of dread you can milk forever.
//
// The one thing the player's position decides is which SECTOR of the lamp the
// crowd stands in, quantised hard so it cannot follow a camera — walk a third of
// the way round the fitting and the next red beat simply finds them somewhere
// else. That is the weeping-angel note: not "it moved when you blinked", but
// "the light came back and it is not where it was".

import { emergencyWanderClock } from '../data/conservatory-lights.js';
import {
  resolveApparitionComposition,
  validApparitionComposition,
} from '../data/apparition-staging.js';

// Stations sit out in the room, far enough from the fitting to throw a long
// shadow and close enough to stay inside the single shadow-map frustum.
const STATION_NEAR = 2.4;
const STATION_FAR = 6.6;
// Half-width of the arc the crowd occupies. The shadow camera is aimed at the
// crowd's own mean bearing and opens 104°, so this must stay inside 52° with
// room for the angular drift below or a figure falls out of its own shadow pass.
const STATION_ARC = .55;
const STAGE_SECTORS = 8;
// Nothing may loom. If the player walks into a station the figure is pushed out
// along its bearing FROM THE LAMP, never away from the player: a shadow that
// backs off from you is a shadow that has noticed you.
const MIN_APPROACH = 2.2;
const MAX_PUSH = 3.2;
// How far ahead of the player the crowd is aimed — roughly the far wall of a
// room you are standing in. The lamp, the figures and this point are collinear,
// which is what puts the shadow in the shot.
const AIM_AHEAD = 8;

// The projected shadow is already rendered independently from the body's own
// emissive field. Most sightings should therefore read as a real obstruction
// first and a white body second; the old values survive as a rare hard reveal.
const APPARITION_PRESENTATION = Object.freeze({
  shadow: Object.freeze({
    emissive: .82,
    practicalIntensity: .32,
    practicalRadius: 3.8,
  }),
  hard: Object.freeze({
    emissive: 2.6,
    practicalIntensity: 1.05,
    practicalRadius: 4.8,
  }),
});

// Semantic pose identity belongs to the coordinate-blind director. Asset names
// do not: this is the one translation boundary, with the shared legacy body as
// a deliberate fallback for stale/invalid directives and older harnesses.
export const APPARITION_POSE_MESH = Object.freeze({
  neutral: 'apparition_pose_neutral',
  side: 'apparition_pose_side',
  stoop: 'apparition_pose_stoop',
  head_turn: 'apparition_pose_head_turn',
  arm_out: 'apparition_pose_arm_out',
  weight_shift: 'apparition_pose_weight_shift',
  symmetric: 'apparition_pose_symmetric',
});

export function meshForApparitionPose(poseId) {
  return APPARITION_POSE_MESH[poseId] || 'player_shadow_figure';
}

function neutralDirective(wander) {
  return {
    stageKey: null,
    exposure: null,
    card: null,
    hiddenIndex: null,
    shadowOnlyIndices: [],
    poseIds: ['neutral', 'side', 'weight_shift'],
    yawOffsets: [0, 0, 0],
    motionClocks: [wander, wander, wander],
    hardRevealIndex: null,
  };
}

const distanceSq = (a, b) => {
  const dx = (Number(a?.x) || 0) - (Number(b?.x) || 0);
  const dz = (Number(a?.z) || 0) - (Number(b?.z) || 0);
  return dx * dx + dz * dz;
};

function hash32(text) {
  let hash = 2166136261;
  for (const char of String(text || 'emergency')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// A stable 0..1 stream per figure, so every constant below is authored as a
// range and the individual is drawn from it once and never drifts off it.
function seedStream(key) {
  let state = hash32(key) || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 4294967296;
  };
}

function fallbackDirection(id) {
  const angle = (hash32(id) / 0xffffffff) * Math.PI * 2;
  return { x: Math.sin(angle), z: -Math.cos(angle) };
}

// Two oscillators whose periods share no common multiple the player will ever
// sit through. One sine is a pendulum and reads as machinery; two is a body
// shifting its weight and never arriving anywhere.
const drift = (time, w1, p1, w2, p2) =>
  Math.sin(time * w1 + p1) * .62 + Math.sin(time * w2 + p2) * .38;

function station(lightId, index) {
  const random = seedStream(`${lightId}:station:${index}`);
  const spread = index - 1;
  return {
    // Fanned across the arc, then nudged, so three figures never line up.
    bearing: spread * STATION_ARC * .78 + (random() - .5) * STATION_ARC * .34,
    // Held as a FRACTION of the available depth, not an absolute distance. When
    // the player stands close to the fitting the band has to shrink, and
    // clipping absolute radii against that cap pinned whoever was furthest out
    // to a fixed point — a figure that has stopped moving is the one thing this
    // whole system is not allowed to contain.
    depth: random(),
    // Metres and radians of wander, and the rates that spend them. At these
    // rates a figure covers roughly five centimetres a second while you are
    // watching it, and the dark beat multiplies that — see emergencyWanderClock.
    swing: .17 + random() * .13,
    reach: .42 + random() * .55,
    sway: .26 + random() * .22,
    w1: .052 + random() * .043,
    w2: .031 + random() * .027,
    p1: random() * Math.PI * 2,
    p2: random() * Math.PI * 2,
    // Human variation, not monster scaling. The previous 1.48x-wide/1.70x-tall
    // range turned a 1.7m body into a three-metre slab and erased the anatomy.
    scaleX: .88 + random() * .16,
    scaleY: .96 + random() * .12,
  };
}

const STATIONS = new Map();
function stationsFor(lightId) {
  let list = STATIONS.get(lightId);
  if (!list) {
    list = [0, 1, 2].map((index) => station(lightId, index));
    STATIONS.set(lightId, list);
  }
  return list;
}

export function buildEmergencyShadowFrame(lights, {
  listener = null,
  enabled = true,
  maxDistance = 56,
  viewYaw = null,
  timeSec = 0,
  effectsMode = 'full',
  stageKey = 'unknown',
  director = null,
  renderGroup = null,
  compositionResolver = resolveApparitionComposition,
  preferredLightId = null,
} = {}) {
  // OFF and Reduce Dread suppression must be structural. Do not rely on the
  // light resolver happening to zero shadowReveal/intensity upstream.
  if (!enabled || effectsMode === 'off' || !listener || !Array.isArray(lights)) return null;
  const limitSq = Math.max(1, Number(maxDistance) || 12) ** 2;
  // THE BODY AND ITS SHADOW OCCUPY THE SAME ROOM.
  //
  // The figure now owns world-depth geometry and a white practical of its own,
  // but its cast shadow still has to land honestly. A shadow lands on a surface
  // only when the figure is BETWEEN the lamp and that surface. The
  // surface the player is looking at is ahead of them, so the lamp has to be
  // behind them and the figures between the two — the ordinary experience of
  // somebody standing behind you in a doorway, thrown ten metres up the wall you
  // are facing.
  //
  // Staging the crowd between the lamp and the PLAYER (which is what "so their
  // shadows are thrown where the player can see them" produced) casts every
  // shadow backwards, past the camera, onto the wall behind. And last round I
  // then made the hero lamp prefer fittings IN FRONT of the player, which is the
  // worst possible pick: figures on the near side of a lamp you are facing throw
  // their shadows directly away from you. Composed correctly, projected
  // correctly, and landing where nobody would ever be looking.
  //
  // So: prefer a lamp behind the shoulder, and aim the crowd along the lamp →
  // (the wall ahead of the player) line. Still stations, still milling, still
  // incapable of approach — only the sector is chosen, and it is quantised.
  const facing = Number.isFinite(viewYaw) ? { x: Math.sin(viewYaw), z: -Math.cos(viewYaw) } : null;
  const behindShoulder = (light) => {
    if (!facing) return 0;
    const dx = (Number(light.x) || 0) - (Number(listener.x) || 0);
    const dz = (Number(light.z) || 0) - (Number(listener.z) || 0);
    const length = Math.hypot(dx, dz);
    if (length < .001) return 0;
    // Anything from beside you to directly behind throws forward into the view.
    return (dx * facing.x + dz * facing.z) / length < .30 ? 1 : 0;
  };
  const candidates = lights
    // Cross-zone light may leak through a real doorway, but the bodies belong
    // to the practical's home room. A spilled hall source can tint the atrium;
    // it cannot stage hall apparitions there.
    .filter((light) => !light?.spilling)
    .filter((light) => !Number.isFinite(light?.sourceZone) || !Number.isFinite(light?.zone)
      || light.sourceZone === light.zone)
    .filter((light) => Number(light?.shadowReveal) > .08 && Number(light?.intensity) > .01)
    .filter((light) => distanceSq(light, listener) <= limitSq)
    .sort((a, b) => {
      const reveal = Number(b.shadowReveal) - Number(a.shadowReveal);
      if (Math.abs(reveal) > .001) return reveal;
      const throwing = behindShoulder(b) - behindShoulder(a);
      if (throwing) return throwing;
      return distanceSq(a, listener) - distanceSq(b, listener);
    });
  // Capture/debug tooling may pin the practical after it has observed a real
  // candidate. This keeps a probe-directed camera turn from selecting a second
  // lamp and invalidating the shot it was turning to inspect. Ordinary play
  // never supplies the option and retains the established ranking unchanged.
  // Multi-level rooms share a render group. Prefer a practical on the player's
  // current landing before applying the established planar ranking; otherwise
  // a tower lamp five metres overhead can stage ordinary-sized bodies against
  // the ceiling and make them loom through perspective alone.
  const levelCandidates = Number.isFinite(listener.y)
    ? candidates.filter((candidate) => Math.abs(
      (Number.isFinite(candidate.floorY) ? candidate.floorY : (Number(candidate.y) || 1.8) - 1.8)
        - listener.y,
    ) <= 2.6)
    : candidates;
  const rankedCandidates = levelCandidates.length ? levelCandidates : candidates;
  const light = rankedCandidates.find((candidate) => candidate.id === preferredLightId)
    || rankedCandidates[0];
  if (!light) return null;

  const lightX = Number(light.x) || 0;
  const lightZ = Number(light.z) || 0;
  const listenerX = Number(listener.x) || 0;
  const listenerZ = Number(listener.z) || 0;
  let floorY = Number.isFinite(light.floorY) ? light.floorY : (Number(light.y) || 1.8) - 1.8;
  const wander = emergencyWanderClock(timeSec, { effectsMode });
  const resolvedStageKey = `${String(stageKey || 'unknown')}:${light.id}`;
  const directive = director?.resolve?.({
    stageKey: resolvedStageKey,
    pulseIndex: Number.isFinite(Number(light.pulseIndex)) ? Number(light.pulseIndex) : 0,
    timeSec,
    effectsMode,
    wanderClock: wander,
  }) || neutralDirective(wander);
  let composition = null;
  try {
    const candidate = compositionResolver?.({
      lightId: light.id,
      zone: Number(light.zone),
      group: renderGroup,
    });
    composition = validApparitionComposition(candidate) ? candidate : null;
  } catch {
    // Authored staging is optional art direction. A malformed/custom resolver
    // must lose the composition, never the apparition or its safety proof.
    composition = null;
  }
  if (composition?.floorMode === 'listener' && Number.isFinite(listener.y)) floorY = listener.y;

  // The crowd is aimed at the wall the player is facing, not at the player. The
  // lamp, the figures and that wall have to be collinear or there is no shadow
  // in the shot; standing them between the lamp and the camera throws everything
  // backwards over the player's shoulder onto a wall behind them.
  const focusX = listenerX + (facing ? facing.x * AIM_AHEAD : 0);
  const focusZ = listenerZ + (facing ? facing.z * AIM_AHEAD : 0);
  let toListenerX = focusX - lightX;
  let toListenerZ = focusZ - lightZ;
  if (Math.hypot(toListenerX, toListenerZ) < .2) {
    const fallback = facing || fallbackDirection(light.id);
    toListenerX = fallback.x;
    toListenerZ = fallback.z;
  }
  // The no-loom cap is still measured against the PLAYER, never against the aim
  // point — the guarantee is about bodies and cameras, not about staging.
  const playerReach = Math.hypot(listenerX - lightX, listenerZ - lightZ);
  // NOTHING MAY LOOM, AND THE CLAMP MUST BE GEOMETRY RATHER THAN A NUDGE.
  //
  // Pushing an offending figure further along its own bearing does not work: the
  // bearing points at the player, so the push walks the body straight through
  // them and out the other side, and the first version could seat a silhouette
  // exactly on the camera. Bound the STATION instead. A figure standing r from
  // the fitting while the player stands g from it is never closer than g - r, so
  // capping r at g - MIN_APPROACH makes the guarantee unconditional.
  //
  // When the player walks up to the fitting there is no room in front of it at
  // all, so the crowd takes the far side. You are then standing at the lamp with
  // three shadows thrown away from you across the room, which is not a downgrade.
  const playerGap = playerReach;
  const headroom = playerGap - MIN_APPROACH;
  const behind = headroom < STATION_NEAR;
  const sector = Math.PI * 2 / STAGE_SECTORS;
  // If the player is too close to leave the normal station band between them
  // and the fitting, put the entire crowd on the fitting's far side. The old
  // branch added PI to the wall-facing aim instead; depending on camera yaw that
  // could rotate the crowd *onto* the player. Quantising the opposite of the
  // lamp→player bearing preserves the same sector contract and makes the safety
  // distance independent of where the camera is looking.
  const playerBearing = playerGap > .001
    ? Math.atan2(listenerX - lightX, -(listenerZ - lightZ))
    : 0;
  const stageAim = behind
    ? playerBearing + Math.PI
    : composition?.stageYaw ?? Math.atan2(toListenerX, -toListenerZ);
  // The close-to-fitting branch always wins and remains quantised away from the
  // player. At ordinary distances an authored world yaw is intentionally stable
  // under camera motion; procedural staging retains the established sectors.
  const stage = !behind && composition
    ? composition.stageYaw
    : Math.round(stageAim / sector) * sector;
  // The band the crowd may occupy, and the drift is scaled INTO it rather than
  // clipped against it, so a tight band makes the milling smaller and never
  // makes it stop.
  const authoredFar = STATION_FAR * (composition?.farScale || 1);
  const authoredNear = STATION_NEAR * (composition?.nearScale || 1);
  const far = behind ? authoredFar : Math.min(authoredFar, Math.max(1.6, headroom));
  const near = Math.min(authoredNear, far * .55);
  const squeeze = (far - near) / (STATION_FAR - STATION_NEAR);

  const placed = stationsFor(light.id).map((seed, index) => {
    // Bearing and distance run on the same two rates exchanged, so a figure
    // never moves along a straight line and never traces a closed loop.
    const bodyWander = Number.isFinite(directive.motionClocks?.[index])
      ? directive.motionClocks[index]
      : wander;
    const slot = composition?.stations[index] || null;
    const swing = drift(bodyWander, seed.w1, seed.p1, seed.w2, seed.p2)
      * seed.swing * (slot?.swingScale ?? 1);
    const reach = drift(bodyWander + 41.7, seed.w2, seed.p2, seed.w1, seed.p1)
      * seed.reach * (slot?.reachScale ?? 1) * squeeze;
    const bearing = stage + (slot?.bearingOffset ?? seed.bearing) + swing;
    const radialFloor = behind ? Math.max(near * .7, MIN_APPROACH) : near * .7;
    const depth = slot?.depth ?? seed.depth;
    const radius = Math.min(far, Math.max(radialFloor, near + depth * (far - near) + reach));
    return {
      seed, index, bearing, radius, swing, bodyWander,
      x: lightX + Math.sin(bearing) * radius,
      z: lightZ - Math.cos(bearing) * radius,
    };
  });

  // The shadow camera follows the CROWD, not the player: their own mean bearing,
  // pitched through the middle of their bodies. Aiming it at the player is what
  // let a fitting mounted above eye height throw its figures out of frame.
  const aimX = placed.reduce((total, body) => total + Math.sin(body.bearing), 0);
  const aimZ = placed.reduce((total, body) => total - Math.cos(body.bearing), 0);
  const shadowYaw = Math.hypot(aimX, aimZ) > .001
    ? Math.atan2(aimX, -aimZ)
    : Math.atan2(toListenerX, -toListenerZ);
  const bodyDistance = placed.reduce((total, body) => total + body.radius, 0) / placed.length;

  // Absence is a continuity error, not a new formation. Solve all three
  // stations first, then omit one identity without re-spacing the survivors.
  const visiblePlaced = placed.filter((body) => body.index !== directive.hiddenIndex);
  const instances = visiblePlaced.slice(0, 3).map((body) => {
    const shadowOnly = directive.shadowOnlyIndices?.includes(body.index) === true;
    const presentation = !shadowOnly && directive.hardRevealIndex === body.index
      ? APPARITION_PRESENTATION.hard
      : APPARITION_PRESENTATION.shadow;
    return {
      id: `emergency-shadow:${light.id}:${body.index}`,
      apparitionIndex: body.index,
      poseId: directive.poseIds?.[body.index] || 'neutral',
      mesh: meshForApparitionPose(directive.poseIds?.[body.index]),
      x: body.x,
      y: floorY,
      z: body.z,
      // Presenting the flat body to the lamp, plus a slow turn of the shoulders.
      // Director yaw is an authored continuity offset, never a player-facing
      // calculation: this runtime remains the sole owner of world geometry.
      yaw: Math.atan2(body.x - lightX, -(body.z - lightZ))
        + body.swing * body.seed.sway * 4.2
        + (Number(directive.yawOffsets?.[body.index]) || 0),
      scaleX: body.seed.scaleX,
      scaleY: body.seed.scaleY,
      scaleZ: .92,
      emissive: [1.0, .985, 1.0, presentation.emissive],
      structural: true,
      shadowOnly,
      zone: Number(light.zone) || 0,
    };
  });

  // A white body that does not affect its room is still a sprite. These are
  // deliberately compact practicals: enough to lift the floor, nearby seat
  // backs and the edge of another figure, never enough to replace the red wash.
  const apparitionLights = instances.filter((instance) => !instance.shadowOnly).map((instance) => {
    const presentation = directive.hardRevealIndex === instance.apparitionIndex
      ? APPARITION_PRESENTATION.hard
      : APPARITION_PRESENTATION.shadow;
    return {
      id: `apparition-white:${light.id}:${instance.apparitionIndex}`,
      x: instance.x,
      y: floorY + 1.12 * instance.scaleY,
      z: instance.z,
      color: [1.0, .97, 1.0],
      intensity: presentation.practicalIntensity,
      radius: presentation.practicalRadius,
      penetration: 0,
      kind: 'apparition',
      zone: Number(light.zone) || 0,
    };
  });

  const minimumPlayerDistance = instances.reduce((best, instance) => Math.min(
    best,
    Math.hypot(instance.x - listenerX, instance.z - listenerZ),
  ), Infinity);
  const stageSector = ((Math.round(stage / sector) % STAGE_SECTORS) + STAGE_SECTORS) % STAGE_SECTORS;

  return {
    lightId: light.id,
    lightOverride: {
      castsShadow: true,
      shadowYaw,
      // Aim through the body, not horizontally over its head. The previous
      // fixed seven-degree dip put a floor-standing figure outside the shadow
      // camera whenever the practical was mounted above eye height.
      shadowPitch: Math.atan2(floorY + 1.15 - (Number(light.y) || 1.8), Math.max(.2, bodyDistance)),
    },
    instance: instances[0],
    instances,
    apparitionLights,
    director: {
      stageKey: directive.stageKey || resolvedStageKey,
      exposure: directive.exposure ?? null,
      card: directive.card || null,
      poseIds: Array.isArray(directive.poseIds) ? [...directive.poseIds] : null,
      shadowOnlyIndices: Array.isArray(directive.shadowOnlyIndices)
        ? [...directive.shadowOnlyIndices]
        : [],
      hardRevealIndex: directive.hardRevealIndex ?? null,
    },
    composition: {
      id: composition?.id || 'procedural',
      source: composition ? 'authored' : 'procedural',
      stageYaw: stage,
    },
    contract: {
      version: 1,
      figures: instances.length,
      visibleBodies: instances.filter((instance) => !instance.shadowOnly).length,
      shadowOnlyFigures: instances.filter((instance) => instance.shadowOnly).length,
      shadowOnlyIndices: instances.filter((instance) => instance.shadowOnly)
        .map((instance) => instance.apparitionIndex),
      maximumFigures: 3,
      minimumPlayerDistance,
      minimumAllowedDistance: MIN_APPROACH,
      stageSector,
      effectsMode,
      pulseIndex: Number.isFinite(Number(light.pulseIndex)) ? Number(light.pulseIndex) : null,
    },
    // What the monitor is allowed to know: three positions, for as long as the
    // red is actually on. See emergencyContacts in main.js — this is a return of
    // the render event, not a contact, and it must decay with the beat.
    contacts: instances.map((instance) => ({ x: instance.x, z: instance.z })),
  };
}
