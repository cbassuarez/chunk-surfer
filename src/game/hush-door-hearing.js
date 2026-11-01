// A struck door radiates from both faces. Its semantic event and investigation
// target stay at the actual leaf; only the occlusion ray starts on the face
// nearest the listener. Otherwise the source is muffled by its own closed leaf.
// This is intentionally restricted to the production door runtime's events.
export function doorOcclusionSource(event, listener, findDoor) {
  const original = event?.spatial;
  const id = event?.provenance?.doorId;
  const point = listener?.position;
  if (!original?.position || !point || event?.provenance?.system !== 'door-runtime'
      || !['door_open', 'door_close', 'door_rattle'].includes(event.kind)
      || !id || event?.source?.id !== `door:${id}` || typeof findDoor !== 'function') return original;
  const door = findDoor(id);
  if (!door || door.id !== id || !Array.isArray(door.cells) || !door.cells.length
      || !['x', 'y'].includes(door.widthAxis)) return original;
  const axis = door.widthAxis === 'y' ? 'x' : 'y';
  const centre = Number(axis === 'x' ? door.cx : door.cy);
  const listenerCoord = Number(point[axis]);
  if (!Number.isFinite(centre) || !Number.isFinite(listenerCoord)) return original;
  const side = Math.sign(listenerCoord - centre);
  if (!side) return original;
  const coordinates = door.cells.map(cell => Number(cell?.[axis]));
  if (coordinates.some(value => !Number.isFinite(value))) return original;
  // Cell bounds, not a centre offset: a two-cell-deep portal can extend more
  // than one cell from its centre. A tiny epsilon keeps the ray outside it.
  const edge = side > 0 ? Math.max(...coordinates) + 1 : Math.min(...coordinates);
  // On the positive side the boundary itself belongs to the next cell. On the
  // negative side a small epsilon is needed to leave the portal's first cell.
  const face = edge - (side < 0 ? .001 : 0);
  // A listener still inside the portal has no unambiguous outside-facing ray.
  if (side * (listenerCoord - face) < 0) return original;
  return { ...original, position: { ...original.position, [axis]: face } };
}
