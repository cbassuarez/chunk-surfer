import { SOURCE_CONTINUATION as C, continuationSurfaces } from './source-continuation.js';

// Fixed Source-II gluing charts, authored from the existing physical decks.
// These are spatial addresses, not recovery destinations. The live crossing
// never looks for support, chooses a safer point, or reads the departure X/Z.
const surfaces = continuationSurfaces();
const rows = [
  ['wrong-entry', -1.8, 1.8, -2.6, -1.3],
  ['wrong-mid-east-head', 14.5, 20.5, -31.8, -28.2],
  ['wrong-upper-west-head', -16.6, -7.4, -31.8, -28.2],
  ['journey-receiving-0-1', -68.5, -65, -6.8, -5.2],
  ['journey-receiving-1-1', -119.8, -118.2, -33.5, -30],
  ['journey-receiving-2-1', -140, -136.5, -40.8, -39.2],
  ['journey-receiving-3-1', -165.8, -164.2, -61, -57.5],
];

// Every real intermediate stair plane has its own fixed address. The two
// near-head treads use the exposed south strip; the covered part is a ceiling
// of the next deck, not an eligible receiving column. No runtime search.
for (let n = 1; n < 28; n++) {
  if (n === 14) continue;
  const id = n < 14 ? `wrong-east-stair-${14 - n}` : `wrong-return-stair-${28 - n}`;
  const s = surfaces.find(row => row.id === id);
  if (!s) throw Error(`Source-II fixed void chart has no support ${id}`);
  rows.push([id, s.minX + .30, s.maxX - .30,
    n === 13 || n === 27 ? -26.75 : s.minZ + .30, s.maxZ - .30]);
}

const key = (chartId, elevation) => `${chartId}:${Math.round(elevation * 10000)}`;
export const continuationVoidDomains = Object.freeze(rows.map(([surfaceId, minX, maxX, minZ, maxZ]) => {
  const s = surfaces.find(row => row.id === surfaceId);
  if (!s || s.region !== 'wrong-return' || s.kind !== 'rect') throw Error(`Invalid Source-II void support ${surfaceId}`);
  // Apertures identify BODY-CENTRE planes. The receiving root is 1.80m above
  // the real floor; 2.75m clears both HUSH's contour and an ordinary jump eye.
  const chartId = s.chartId ?? 0, elevation = s.y, exitY = C.bounds.minY - 4, entryY = elevation + 2.75;
  return Object.freeze({ version: 1, id: `source-ii-void:${key(chartId, elevation)}`, chartId, elevation, surfaceId,
    minX, maxX, minZ, maxZ, periodX: maxX - minX, periodZ: maxZ - minZ,
    exitY, entryY, entryFeetY: entryY - C.bodyHeight / 2, exitFeetY: exitY - C.bodyHeight / 2,
    crossingPoint: 'body-centre', translationY: entryY - exitY });
}));
const byId = new Map(continuationVoidDomains.map(d => [d.id, d]));
const byPlane = new Map(continuationVoidDomains.map(d => [key(d.chartId, d.elevation), d]));
const uniqueChart = new Map([1,2,3,4].map(chartId => [chartId, continuationVoidDomains.find(d => d.chartId === chartId)]));
export const continuationVoidDomainForChart = chartId => uniqueChart.get(chartId) || null;

export function continuationVoidDomain(value) {
  if (typeof value === 'string') return byId.get(value) || null;
  if (value?.domainId) return byId.get(value.domainId) || null;
  const elevation = value?.elevation ?? value?.feet;
  return Number.isFinite(elevation) ? byPlane.get(key(value.chartId ?? 0, elevation)) || null : null;
}
