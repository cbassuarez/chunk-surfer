export const STORY_ROUTE_DOOR_IDS = Object.freeze([
  'pool-lobby',
  'foh-office',
  'chapel-c17',
  'tower-hatch',
  'bell-chamber-entry',
  'organ-loft-service',
  'organ-loft-nave',
]);

const STORY_ROUTE_DOORS = new Set(STORY_ROUTE_DOOR_IDS);

export function doorWinsWorldInteraction(prop, door) {
  if (!door) return false;
  if (!prop) return true;
  const routeDoor = STORY_ROUTE_DOORS.has(door.portal?.id);
  if (routeDoor && door.aimScore <= prop.aimScore + .38) return true;
  return door.aimScore + .08 < prop.aimScore;
}
