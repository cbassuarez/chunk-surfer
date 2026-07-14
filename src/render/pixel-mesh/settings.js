// The VFD look is authored by scene profile. Player settings only apply the
// existing accessibility ceilings and internal diagnostics; legacy intensity
// modes are deliberately ignored.

export const PIXEL_MESH_CELL_OPTIONS = Object.freeze(['auto', '6', '8', '10', '12']);
export const PIXEL_MESH_DEBUG_SOURCES = Object.freeze(['final', 'world', 'signal', 'memory', 'edge', 'mask']);

export const DEFAULT_PIXEL_MESH_SETTINGS = Object.freeze({
  cellSize: 'auto',
  debugSource: 'final',
  reduceFlash: false,
  reduceMotion: false,
  memory: true,
});

export function normalizePixelMeshSettings(input = {}) {
  const cellSize = PIXEL_MESH_CELL_OPTIONS.includes(String(input.cellSize))
    ? String(input.cellSize)
    : DEFAULT_PIXEL_MESH_SETTINGS.cellSize;
  const debugSource = PIXEL_MESH_DEBUG_SOURCES.includes(input.debugSource)
    ? input.debugSource
    : DEFAULT_PIXEL_MESH_SETTINGS.debugSource;

  return Object.freeze({
    cellSize,
    debugSource,
    reduceFlash: !!input.reduceFlash,
    reduceMotion: !!input.reduceMotion,
    memory: input.memory !== false,
  });
}
