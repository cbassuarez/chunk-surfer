// A frame-owned camera never changes the walking camera's saved targets.
// Source's overhead descent uses the same basis in the raster and depth passes.
import { cinematicLens } from './cinematic-lens.js';
export function authoredCameraFrame(value) {
  if (!value || !Array.isArray(value.eye) || value.eye.length !== 3
    || !value.eye.every(Number.isFinite) || !Number.isFinite(value.yaw)
    || !Number.isFinite(value.pitch) || Math.abs(value.pitch) > Math.PI / 2) return null;
  const lens=cinematicLens(value.lens);
  return { eye: [...value.eye], yaw: value.yaw, pitch: value.pitch, ...(lens?{lens}:{}) };
}
