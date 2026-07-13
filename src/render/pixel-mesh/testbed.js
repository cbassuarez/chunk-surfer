import { ditherCoverage } from './dither.js';
import { normalizePixelMeshSettings } from './settings.js';

export function pixelMeshTestbedSnapshot(settings = {}) {
  const normalized = normalizePixelMeshSettings(settings);
  return Object.freeze({
    settings: normalized,
    bayerHalfCoverage: ditherCoverage(0.5),
    note: 'Use renderer=3d&pixelMesh=1&pixelMeshMode=standard for the live WebGL pass.',
  });
}
