import { ZONE } from '../data/floorplan/legend.js';
import { ST_BRENDANS_SOUND } from '../data/st-brendans-audio.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, Number(x) || 0));

export function stBrendansAcousticLevel(level) {
  return level === 'belfry' ? 'belfry' : level === 'turret' ? 'turret'
    : level === 'loft' || level === 'triforium' ? 'triforium' : 'nave';
}

// This is an acoustic presentation contract, never an alarm/gameplay event.
// A battle blocks incidental settling, but must not suppress existing explicit
// bell/combat/ending strikes. Recording/focus/settings/pause protect all paths.
export function stBrendansSoundFrame({ eligible = false, listener = null, level,
  bells = [], anchors = {}, damageAnchors = {}, damage = [], carryProgress = null,
  recording = false, listening = false, playback = false, paused = false,
  blocked = false, battle = false, focused = true, effectsMode = 'full',
  dialogue = false, occlusion = () => 0,
} = {}) {
  const present = !!eligible && !!listener && ['cathedral', 'ground'].includes(listener.group)
    && listener.zone === ZONE.church;
  let reason = !present ? 'outside-st-brendans'
    : recording ? 'recording' : listening ? 'monitoring' : playback ? 'playback'
      : paused ? 'paused' : !focused ? 'unfocused' : null;
  const active = present, muted = !!reason;
  const sources = active ? bells.filter(b => Number.isInteger(b.id) && b.id >= 1 && b.id <= 8
    && [b.pivot?.x, b.pivot?.y, b.pivot?.z].every(Number.isFinite)).map(b => ({
    id: b.id, pivot: { ...b.pivot }, frequency: b.frequency,
    // Read the real door/wall loss; it is not inferred from decorative meshes.
    occlusionDb: clamp(occlusion({ ...b, ...b.pivot }), 0, 60),
  })) : [];
  const positionedAnchors = {};
  for (const [id, anchor] of Object.entries(anchors)) {
    if (![anchor?.x, anchor?.y, anchor?.z].every(Number.isFinite)) continue;
    positionedAnchors[id] = { ...anchor, occlusionDb: clamp(occlusion(anchor), 0, 60) };
  }
  const positionedDamage = {};
  for (const [id, anchor] of Object.entries(damageAnchors)) {
    if (![anchor?.x, anchor?.y, anchor?.z].every(Number.isFinite)) continue;
    positionedDamage[id] = { ...anchor, occlusionDb: clamp(occlusion(anchor), 0, 60) };
  }
  return { active, muted, ambientMuted: muted || !!battle || !!blocked || effectsMode === 'off',
    reason: reason || (battle ? 'battle-explicit-cues-only' : blocked ? 'blocked-explicit-cues-only' : effectsMode === 'off' ? 'effects-off-explicit-cues-only' : 'tower'),
    level: stBrendansAcousticLevel(level), listener, bells: sources, anchors: positionedAnchors, damageAnchors: positionedDamage,
    damage: Array.isArray(damage) ? [...new Set(damage)] : [],
    carryProgress: carryProgress == null ? null : clamp(carryProgress, 0, 1), dialogue: !!dialogue };
}

export function stBrendansSourceMix(point = {}, listener = {}, level = 'belfry') {
  const profile = ST_BRENDANS_SOUND.profiles[stBrendansAcousticLevel(level)];
  const dx = (Number(point.x) || 0) - (Number(listener.x) || 0),
    dy = (Number(point.y) || 0) - (Number(listener.y) || 0),
    dz = (Number(point.z) || 0) - (Number(listener.z) || 0), yaw = Number(listener.yaw) || 0;
  const distance = Math.hypot(dx, dy, dz), horizontal = Math.hypot(dx, dz);
  const bearing = Math.atan2(dx, -dz) - yaw, rear = Math.max(0, -Math.cos(bearing));
  const loss = clamp(point.occlusionDb, 0, 60), falloff = (1 + distance / 12) ** -.85;
  return { dx, dy, dz, distance,
    localX: dx * Math.cos(yaw) + dz * Math.sin(yaw),
    localY: dy, localZ: -dx * Math.sin(yaw) + dz * Math.cos(yaw),
    pan: clamp(Math.sin(bearing) * Math.min(1, horizontal / 2) * .9, -.9, .9),
    direct: profile.direct * falloff * 10 ** (-loss / 20),
    // Occluded sound cannot bypass a shut door through the wet path.
    send: profile.send * falloff * 10 ** (-loss / 23),
    structure: profile.structure * falloff * 10 ** (-loss / 35),
    cutoff: clamp(profile.cutoff * (1 - rear * .29) * 10 ** (-loss / 65), 350, 14000),
  };
}

// A fixed, sparse apparatus clock. No bells are ever struck by this score.
// Return joins air in progress; missed mechanical attacks are never queued.
export function stBrendansAmbienceEvents(now, { swinging = false, carryProgress = null } = {}) {
  const period = ST_BRENDANS_SOUND.cycleSeconds, offset = ST_BRENDANS_SOUND.phaseOffset;
  const cycle = Math.floor((now + offset) / period), events = [];
  const definitions = [
    { at: 0, id: 'louvre-air-a', anchor: 'air', duration: 24, bed: true },
    { at: 34.7, id: 'timber-load', anchor: 'frame', duration: 1.595 },
    { at: 52.1, id: 'louvre-air-b', anchor: 'air', duration: 24, bed: true },
    { at: 87.3, id: 'timber-load', anchor: 'frame', duration: 1.595, gain: .68 },
    { at: 108.6, id: 'louvre-air-a', anchor: 'air', duration: 24, bed: true, gain: .62 },
    ...(swinging ? [
      { at: 16.8, id: 'rope-load-a', anchor: 'rope', duration: 4.1 },
      { at: 72.9, id: 'rope-load-b', anchor: 'rope', duration: 4.55 },
      { at: 119.1, id: 'iron-contact', anchor: 'frame', duration: .396, gain: .6 },
    ] : []),
  ];
  for (let c = cycle - 1; c <= cycle; c++) for (const event of definitions) {
    const at = c * period + event.at - offset, until = at + event.duration;
    if (at > now + .045 || until < now + .03) continue;
    if (!event.bed && now - at > .12) continue;
    const carry = carryProgress == null ? 1 : 1 - clamp(carryProgress, 0, 1);
    events.push({ ...event, at, until, gain: (event.gain ?? 1) * (event.bed ? .22 + .78 * carry : carry), key: `${c}:${event.at}:${event.id}` });
  }
  return events;
}
