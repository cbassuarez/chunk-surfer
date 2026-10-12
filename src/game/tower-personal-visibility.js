// One dissolution decision is shared by drawing, collision and inspection.
// Reduced motion changes animation, never whether the body meets an object.
export function towerPersonalPiecePresent(piece, { collapse = 0, stage = '', seed = 0 } = {}) {
  if (stage !== 'return-hall' || piece.permanent || collapse <= 0) return true;
  if (collapse >= 1) return false;
  const key = String(piece.collapseGroup || piece.id || '');
  let hash = (2166136261 ^ (Number(seed) >>> 0)) >>> 0;
  for (let i = 0; i < key.length; i += 1) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619) >>> 0;
  return collapse < .08 + (hash / 4294967296) * .88;
}
