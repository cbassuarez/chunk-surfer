// Recognition comes from paperwork the player already chose to keep. Before
// that, these are ordinary chairs and a console; inspecting one grants nothing.
export const FURNITURE_INVENTORY_PAGE = 'foh-overflow-note';

const RECOGNITIONS = Object.freeze({
  'deadend-ground-armchair': 'The armchair on the inventory. FOH/F-06 is stamped on the rear rail; the same pale suite as the chairs through this wall.',
  'deadend-ground-chair': 'The green chair on the inventory. The paint is nearly gone. It is still facing the same way as the armchair, as though the two of them were waiting together.',
  'deadend-ground-credenza': 'The console on the inventory. The lip of the swollen drawer is bright where somebody worked at it. The return date was left blank.',
});

export function furnitureRecognitionLine(id, { readPageIds = [], fallback = null } = {}) {
  if (!Array.isArray(readPageIds) || !readPageIds.includes(FURNITURE_INVENTORY_PAGE)) return fallback;
  return RECOGNITIONS[id] || fallback;
}
