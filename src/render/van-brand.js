import { vanBrandFit } from '../data/van-brand.js';

// Clone only presentation state from an already submitted real vehicle. A
// rolled/mirrored Source return keeps its exact matrix; missing bodies cannot
// leave floating paint behind. No gameplay or animation identity is inherited.
const FIELDS = Object.freeze(['x', 'y', 'z', 'yaw', 'scale', 'scaleX', 'scaleY', 'scaleZ', 'matrix',
  'zone', 'ambient', 'skyExposed', 'sourceStructure', 'outskirtsFoldVisibility', 'sourceSurroundingsSide',
  'exteriorClipPlane', 'exteriorPortal', 'portalClipPlanes', 'portalExcludePlanes',
  'reflectionOnly', 'noReflection', 'shadowOnly', 'cullRadius', 'fixturePower']);
const detached = value => ArrayBuffer.isView(value) ? new value.constructor(value)
  : Array.isArray(value) ? value.map(detached) : value;
export function vanBrandInstances(renderedHosts = []) {
  if (!Array.isArray(renderedHosts)) return [];
  const out = [], seen = new Set(), existing = new Set(renderedHosts.map(p => p?.id));
  for (const host of renderedHosts) {
    const fit = vanBrandFit(host?.mesh);
    if (!fit || host.visible === false || host.hidden === true) continue;
    const id = `${host.id || host.mesh}:service-paint`;
    if (seen.has(id) || existing.has(id)) continue;
    const matrix = host.matrix;
    if (matrix != null ? matrix.length !== 16 || !Array.from(matrix).every(Number.isFinite)
      : !Number.isFinite(host.x) || !Number.isFinite(host.z)) continue;
    const mark = { id, mesh: fit.mesh, paintOf: host.id || host.mesh, structural: false, noShadow: true };
    const fallback=vanBrandFit(host.fallbackMesh);if(fallback)mark.fallbackMesh=fallback.mesh;
    for (const field of FIELDS) if (host[field] !== undefined) mark[field] = detached(host[field]);
    out.push(mark); seen.add(id);
  }
  return out;
}
