import { ZONE } from './floorplan/legend.js';

const station = (bearingOffset, depth, swingScale, reachScale) => Object.freeze({
  bearingOffset,
  depth,
  swingScale,
  reachScale,
});

// Composition only. This module never receives player coordinates and never
// solves a safe world position; emergency-light-runtime owns both responsibilities.
export const APPARITION_COMPOSITIONS = Object.freeze([
  Object.freeze({
    id: 'foyer-threshold-group',
    zones: Object.freeze([ZONE.foyer]),
    groups: Object.freeze(['ground', 'hall']),
    lightIds: Object.freeze([
      'hall-entrance-maintained-north',
      'hall-entrance-maintained-south',
      'hall-stage-door-maintained',
      'hall-galleria-west-foot',
      'hall-galleria-east-foot',
    ]),
    // Along the public/hall threshold rather than spread across the lobby.
    // The maintained hall fitting sits east of the public lobby. Stage back
    // through its west threshold into occupiable foyer floor; +X put the group
    // behind the auditorium wall and made a valid formation invisible.
    stageYaw: -Math.PI / 2,
    floorMode: 'listener',
    nearScale: .92,
    farScale: .84,
    stations: Object.freeze([
      station(-.22, .30, .48, .46),
      station(0, .52, .38, .40),
      station(.22, .38, .48, .46),
    ]),
  }),
  Object.freeze({
    id: 'hall-aisle-breadth',
    zones: Object.freeze([ZONE.hall]),
    groups: Object.freeze(['hall']),
    lightIds: Object.freeze([
      'hall-entrance-maintained-north',
      'hall-entrance-maintained-south',
      'hall-stage-door-maintained',
      'hall-galleria-west-foot',
      'hall-galleria-east-foot',
    ]),
    stageYaw: Math.PI / 2,
    nearScale: 1,
    farScale: 1,
    // The centre owns its own depth, so absence leaves a readable hole rather
    // than two survivors closing ranks around it.
    stations: Object.freeze([
      station(-.48, .32, .82, .76),
      station(0, .58, .62, .68),
      station(.48, .40, .82, .76),
    ]),
  }),
  Object.freeze({
    id: 'natatorium-pool-edge',
    zones: Object.freeze([ZONE.natatorium]),
    groups: Object.freeze(['ground']),
    lightIds: Object.freeze([
      'natatorium-emergency-entry',
      'natatorium-emergency-west',
      'natatorium-emergency-east',
      'natatorium-emergency-far',
    ]),
    // The east fitting throws west across the dry east deck, parallel to the
    // coping. South placed the group inside the cubicle/service furniture.
    stageYaw: -Math.PI / 2,
    nearScale: .96,
    farScale: .84,
    stations: Object.freeze([
      station(-.36, .24, .64, .64),
      station(-.04, .72, .52, .58),
      station(.38, .38, .64, .64),
    ]),
  }),
  Object.freeze({
    id: 'academic-corridor-termination',
    zones: Object.freeze([ZONE.academic]),
    groups: Object.freeze(['academic']),
    lightIds: Object.freeze([
      'academic-emergency-west',
      'academic-emergency-east-failing',
      'main-stair-loggia-maintained',
    ]),
    stageYaw: 0,
    floorMode: 'listener',
    nearScale: .90,
    farScale: .78,
    stations: Object.freeze([
      station(-.18, .28, .40, .38),
      station(0, .48, .32, .34),
      station(.18, .36, .40, .38),
    ]),
  }),
  Object.freeze({
    id: 'tower-landing-severe',
    zones: Object.freeze([ZONE.bellTower]),
    groups: Object.freeze(['tower']),
    lightIds: Object.freeze([
      'access-low',
      'access-high',
      'ringing-pendant',
      'chamber-entry',
      'winch-lamp',
      'service-landing',
      'organ-loft-exit',
      'nave-exit',
    ]),
    stageYaw: Math.PI / 2,
    nearScale: .82,
    farScale: .72,
    stations: Object.freeze([
      station(-.13, .26, .30, .30),
      station(0, .48, .22, .26),
      station(.13, .64, .30, .30),
    ]),
  }),
]);

export function validApparitionComposition(profile) {
  if (!profile || typeof profile.id !== 'string' || !profile.id.trim()) return false;
  if (!Array.isArray(profile.stations) || profile.stations.length !== 3) return false;
  if (profile.stageYaw != null && !Number.isFinite(profile.stageYaw)) return false;
  if (profile.floorMode != null && profile.floorMode !== 'listener') return false;
  if (!Number.isFinite(profile.nearScale) || profile.nearScale < .5 || profile.nearScale > 1.2) return false;
  if (!Number.isFinite(profile.farScale) || profile.farScale < .5 || profile.farScale > 1.2) return false;
  return profile.stations.every((slot) => slot
    && Number.isFinite(slot.bearingOffset) && Math.abs(slot.bearingOffset) <= .65
    && Number.isFinite(slot.depth) && slot.depth >= 0 && slot.depth <= 1
    && Number.isFinite(slot.swingScale) && slot.swingScale >= 0 && slot.swingScale <= 1.2
    && Number.isFinite(slot.reachScale) && slot.reachScale >= 0 && slot.reachScale <= 1.2);
}

export function resolveApparitionComposition({ lightId, zone, group } = {}) {
  const profile = APPARITION_COMPOSITIONS.find((candidate) =>
    candidate.lightIds.includes(String(lightId || ''))
    && candidate.zones.includes(Number(zone))
    && (!group || candidate.groups.includes(String(group))));
  return validApparitionComposition(profile) ? profile : null;
}
