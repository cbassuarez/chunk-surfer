export const PIXEL_MESH_MODE_OPTIONS = Object.freeze([
  Object.freeze({ id: 'off', label: 'Off' }),
  Object.freeze({ id: 'subtle', label: 'Subtle' }),
  Object.freeze({ id: 'standard', label: 'Standard' }),
  Object.freeze({ id: 'severe', label: 'Severe' }),
]);

export const PIXEL_MESH_MODES = Object.freeze({
  off: Object.freeze({
    id: 'off',
    label: 'Off',
    worldAmount: 0,
    signalAmount: 0,
    glowAmount: 0,
    memoryAmount: 0,
  }),
  subtle: Object.freeze({
    id: 'subtle',
    label: 'Subtle',
    worldAmount: 0.34,
    signalAmount: 0.62,
    glowAmount: 0.14,
    memoryAmount: 0.44,
  }),
  standard: Object.freeze({
    id: 'standard',
    label: 'Standard',
    worldAmount: 0.82,
    signalAmount: 1.0,
    glowAmount: 0.30,
    memoryAmount: 0.72,
  }),
  severe: Object.freeze({
    id: 'severe',
    label: 'Severe',
    worldAmount: 1.0,
    signalAmount: 1.22,
    glowAmount: 0.42,
    memoryAmount: 0.88,
  }),
});

export const PIXEL_MESH_CELL_OPTIONS = Object.freeze(['auto', '6', '8', '10', '12']);
export const PIXEL_MESH_DEBUG_SOURCES = Object.freeze(['final', 'world', 'signal', 'memory', 'edge']);

export const DEFAULT_PIXEL_MESH_SETTINGS = Object.freeze({
  mode: 'off',
  cellSize: 'auto',
  debugSource: 'final',
  reduceFlash: false,
  reduceMotion: false,
  memory: true,
});

export function normalizePixelMeshSettings(input = {}) {
  const mode = PIXEL_MESH_MODES[input.mode] ? input.mode : DEFAULT_PIXEL_MESH_SETTINGS.mode;
  const cellSize = PIXEL_MESH_CELL_OPTIONS.includes(String(input.cellSize))
    ? String(input.cellSize)
    : DEFAULT_PIXEL_MESH_SETTINGS.cellSize;
  const debugSource = PIXEL_MESH_DEBUG_SOURCES.includes(input.debugSource)
    ? input.debugSource
    : DEFAULT_PIXEL_MESH_SETTINGS.debugSource;

  return Object.freeze({
    mode,
    cellSize,
    debugSource,
    reduceFlash: !!input.reduceFlash,
    reduceMotion: !!input.reduceMotion,
    memory: input.memory !== false,
  });
}

export function labelPixelMeshMode(mode) {
  return PIXEL_MESH_MODES[mode]?.label || PIXEL_MESH_MODES.off.label;
}

export function cyclePixelMeshMode(mode, delta) {
  const ids = PIXEL_MESH_MODE_OPTIONS.map((option) => option.id);
  const at = Math.max(0, ids.indexOf(mode));
  return ids[(at + delta + ids.length) % ids.length];
}

export function pixelMeshModeUniforms(settings = {}) {
  const normalized = normalizePixelMeshSettings(settings);
  return PIXEL_MESH_MODES[normalized.mode] || PIXEL_MESH_MODES.off;
}
