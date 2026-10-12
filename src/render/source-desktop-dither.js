// The desktop performer keeps its authored Hush acquisition. Battle view-models
// share the same transparent compositor with the active world look instead.
import { createTransparentPixelMesh } from './pixel-mesh/transparent.js';

export function createSourceDesktopDither(THREE, renderer, options = {}) {
  return createTransparentPixelMesh(THREE, renderer, { ...options, profile: 'hush' });
}
