// Emergency-light apparitions are a rendering event, never a second HUSH.
// The returned figures are invisible in the colour pass and exist only as
// practical-light occluders, so they cast across real floors and walls without
// gaining collision, pursuit, contact, audio, or minimap state.
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
    radius: STATION_NEAR + random() * (STATION_FAR - STATION_NEAR),
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
    scaleX: .86 + random() * .62,
    scaleY: .92 + random() * .78,
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

  const lightX = Number(light.x) || 0;
  const lightZ = Number(light.z) || 0;
  const listenerX = Number(listener.x) || 0;
  const listenerZ = Number(listener.z) || 0;
  const floorY = Number.isFinite(light.floorY) ? light.floorY : (Number(light.y) || 1.8) - 1.8;
  const wander = emergencyWanderClock(timeSec, { effectsMode });

  // Which side of the fitting they are standing on tonight. Taken from the
  // player because a crowd behind the lamp casts nothing anybody can see, and
  // then quantised to eighths so it is a room fact rather than a camera fact.
  let toListenerX = listenerX - lightX;
  let toListenerZ = listenerZ - lightZ;
  if (Math.hypot(toListenerX, toListenerZ) < .2) {
    const fallback = Number.isFinite(viewYaw)
      ? { x: Math.sin(viewYaw), z: -Math.cos(viewYaw) }
      : fallbackDirection(light.id);
    toListenerX = fallback.x;
    toListenerZ = fallback.z;
  }
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
  const playerGap = Math.hypot(toListenerX, toListenerZ);
  const headroom = playerGap - MIN_APPROACH;
  const behind = headroom < STATION_NEAR;
  const sector = Math.PI * 2 / STAGE_SECTORS;
  const stage = Math.round((Math.atan2(toListenerX, -toListenerZ) + (behind ? Math.PI : 0)) / sector) * sector;
  const cap = behind ? STATION_FAR + MAX_PUSH : Math.min(STATION_FAR + MAX_PUSH, headroom);

  const placed = stationsFor(light.id).map((seed, index) => {
    // Bearing and distance run on the same two rates exchanged, so a figure
    // never moves along a straight line and never traces a closed loop.
    const swing = drift(wander, seed.w1, seed.p1, seed.w2, seed.p2) * seed.swing;
    const reach = drift(wander + 41.7, seed.w2, seed.p2, seed.w1, seed.p1) * seed.reach;
    const bearing = stage + seed.bearing + swing;
    const radius = Math.min(cap, Math.max(1.2, seed.radius + reach));
    return {
      seed, index, bearing, radius, swing,
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

  const instances = placed.map((body) => ({
    id: `emergency-shadow:${light.id}:${body.index}`,
    mesh: 'stair_shadow_figure',
    x: body.x,
    y: floorY,
    z: body.z,
    // Presenting the flat body to the lamp, plus a slow turn of the shoulders.
    // The silhouette narrows and widens as it turns, so a figure that has barely
    // crossed the floor has still visibly done something.
    yaw: Math.atan2(body.x - lightX, -(body.z - lightZ)) + body.swing * body.seed.sway * 4.2,
    scaleX: body.seed.scaleX,
    scaleY: body.seed.scaleY,
    structural: true,
    shadowOnly: true,
    zone: Number(light.zone) || 0,
  }));

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
    // What the monitor is allowed to know: three positions, for as long as the
    // red is actually on. See emergencyContacts in main.js — this is a return of
    // the render event, not a contact, and it must decay with the beat.
    contacts: instances.map((instance) => ({ x: instance.x, z: instance.z })),
  };
}
