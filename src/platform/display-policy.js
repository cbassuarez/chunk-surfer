export const DISPLAY_CONTRACT = Object.freeze({
  version: 3,
  design: Object.freeze({ width: 1280, height: 800 }),
  minimum: Object.freeze({ width: 960, height: 600 }),
  safeMinimum: Object.freeze({ width: 960, height: 600 }),
  defaultWindow: Object.freeze({ width: 1280, height: 800 }),
  windowPresets: Object.freeze([
    Object.freeze({ id: '960x600', width: 960, height: 600, label: '960×600 · 16:10' }),
    Object.freeze({ id: '1280x720', width: 1280, height: 720, label: '1280×720 · 16:9' }),
    Object.freeze({ id: '1280x800', width: 1280, height: 800, label: '1280×800 · 16:10 · Recommended' }),
    Object.freeze({ id: '1440x900', width: 1440, height: 900, label: '1440×900 · 16:10' }),
    Object.freeze({ id: '1600x900', width: 1600, height: 900, label: '1600×900 · 16:9' }),
    Object.freeze({ id: '1680x1050', width: 1680, height: 1050, label: '1680×1050 · 16:10' }),
    Object.freeze({ id: '1920x1080', width: 1920, height: 1080, label: '1920×1080 · 16:9' }),
    Object.freeze({ id: '1920x1200', width: 1920, height: 1200, label: '1920×1200 · 16:10' }),
  ]),
  uiScalePresets: Object.freeze([
    Object.freeze({ id: '80', value: 0.8, label: '80%' }),
    Object.freeze({ id: '90', value: 0.9, label: '90%' }),
    Object.freeze({ id: '100', value: 1, label: '100% · Recommended' }),
    Object.freeze({ id: '110', value: 1.1, label: '110%' }),
    Object.freeze({ id: '125', value: 1.25, label: '125%' }),
    Object.freeze({ id: '150', value: 1.5, label: '150%' }),
  ]),
  renderScalePresets: Object.freeze([
    Object.freeze({ id: 'auto', value: 'auto', label: 'Auto · Recommended' }),
    Object.freeze({ id: '50', value: 0.5, label: 'Performance · 50%' }),
    Object.freeze({ id: '75', value: 0.75, label: '75%' }),
    Object.freeze({ id: '100', value: 1, label: 'Native · 100%' }),
  ]),
  displayModes: Object.freeze([
    Object.freeze({ id: 'windowed', label: 'Windowed' }),
    Object.freeze({ id: 'game-mode', label: 'Fullscreen' }),
  ]),
});

export const DESIGNED_VIEWPORT = Object.freeze({
  width: DISPLAY_CONTRACT.design.width,
  height: DISPLAY_CONTRACT.design.height,
});

export const MINIMUM_VIEWPORT = Object.freeze({
  width: DISPLAY_CONTRACT.safeMinimum.width,
  height: DISPLAY_CONTRACT.safeMinimum.height,
});

export const DEFAULT_DISPLAY_SETTINGS = Object.freeze({
  displayMode: 'windowed',
  windowPreset: '1280x800',
  uiScale: 1,
  renderScale: 'auto',
});

function optionValue(option) {
  return Object.prototype.hasOwnProperty.call(option, 'value') ? option.value : option.id;
}

function sameOptionValue(a, b) {
  return String(a) === String(b);
}

function finitePositive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function findWindowPreset(id, contract = DISPLAY_CONTRACT) {
  return contract.windowPresets.find((preset) => preset.id === id)
    || contract.windowPresets.find((preset) => preset.id === DEFAULT_DISPLAY_SETTINGS.windowPreset)
    || contract.windowPresets[0];
}

export function findDisplayOption(key, value, contract = DISPLAY_CONTRACT) {
  const list = contract[key] || [];
  return list.find((option) => sameOptionValue(optionValue(option), value)) || list[0] || null;
}

export function labelDisplayOption(key, value, contract = DISPLAY_CONTRACT) {
  const option = findDisplayOption(key, value, contract);
  return option?.label || String(value ?? '').toUpperCase();
}

export function cycleDisplayOption(key, value, delta, contract = DISPLAY_CONTRACT) {
  const list = contract[key] || [];
  if (!list.length) return value;
  const values = list.map(optionValue);
  const at = Math.max(0, values.findIndex((candidate) => sameOptionValue(candidate, value)));
  return values[(at + delta + values.length) % values.length];
}

export function normalizeDisplaySettings(input = {}, contract = DISPLAY_CONTRACT) {
  const displayMode = contract.displayModes.some((p) => p.id === input.displayMode)
    ? input.displayMode
    : DEFAULT_DISPLAY_SETTINGS.displayMode;

  const windowPreset = contract.windowPresets.some((p) => p.id === input.windowPreset)
    ? input.windowPreset
    : DEFAULT_DISPLAY_SETTINGS.windowPreset;

  const uiScale = contract.uiScalePresets.some((p) => sameOptionValue(p.value, input.uiScale))
    ? Number(input.uiScale)
    : DEFAULT_DISPLAY_SETTINGS.uiScale;

  const renderOption = contract.renderScalePresets.find((p) => sameOptionValue(p.value, input.renderScale));
  const renderScale = renderOption ? renderOption.value : DEFAULT_DISPLAY_SETTINGS.renderScale;

  return { displayMode, windowPreset, uiScale, renderScale };
}

export function computeStageLayout(width, height, options = {}) {
  const design = options.design || DESIGNED_VIEWPORT;
  const allowUpscale = options.allowUpscale !== false;
  const viewportWidth = finitePositive(width, design.width);
  const viewportHeight = finitePositive(height, design.height);
  const rawScale = Math.min(viewportWidth / design.width, viewportHeight / design.height);
  const scale = allowUpscale ? rawScale : Math.min(1, rawScale);
  const safeScale = Math.max(0.1, Number.isFinite(scale) ? scale : 1);
  const renderedWidth = design.width * safeScale;
  const renderedHeight = design.height * safeScale;

  return Object.freeze({
    width: viewportWidth,
    height: viewportHeight,
    scale: safeScale,
    left: Math.round((viewportWidth - renderedWidth) / 2),
    top: Math.round((viewportHeight - renderedHeight) / 2),
    renderedWidth,
    renderedHeight,
    scaledDown: safeScale < 0.999,
    scaledUp: safeScale > 1.001,
  });
}

export function applyStageLayout(layout, root = globalThis.document?.documentElement) {
  if (!root?.style?.setProperty) return layout;
  root.style.setProperty('--stage-scale', String(layout.scale));
  root.style.setProperty('--stage-left', `${layout.left}px`);
  root.style.setProperty('--stage-top', `${layout.top}px`);
  root.style.setProperty('--stage-rendered-w', `${layout.renderedWidth}px`);
  root.style.setProperty('--stage-rendered-h', `${layout.renderedHeight}px`);
  root.dataset.stageScale = layout.scale.toFixed(4);
  root.dataset.stageMode = layout.scaledDown ? 'down' : layout.scaledUp ? 'up' : 'native';
  return layout;
}

export function applyDisplayCssVars(settings = {}, root = globalThis.document?.documentElement) {
  const normalized = normalizeDisplaySettings(settings);
  if (!root?.style?.setProperty) return normalized;

  root.style.setProperty('--designed-w', `${DESIGNED_VIEWPORT.width}px`);
  root.style.setProperty('--designed-h', `${DESIGNED_VIEWPORT.height}px`);
  root.style.setProperty('--minimum-w', `${MINIMUM_VIEWPORT.width}px`);
  root.style.setProperty('--minimum-h', `${MINIMUM_VIEWPORT.height}px`);
  root.style.setProperty('--ui-scale', String(normalized.uiScale));
  root.style.setProperty('--render-scale', String(normalized.renderScale));
  root.dataset.displayMode = normalized.displayMode;
  root.dataset.windowPreset = normalized.windowPreset;
  root.dataset.renderScale = String(normalized.renderScale);

  return normalized;
}

export function isViewportTooSmall(width, height, min = DESIGNED_VIEWPORT) {
  return Number(width) < min.width || Number(height) < min.height;
}

export function resolveRenderScale(setting, metrics = {}) {
  if (setting !== 'auto') return Number(setting) || 1;

  const deviceMemory = Number(globalThis.navigator?.deviceMemory || 0);
  const dpr = Number(metrics.devicePixelRatio || globalThis.devicePixelRatio || 1);

  if (deviceMemory && deviceMemory <= 4) return 0.75;
  if (dpr >= 2.5) return 0.75;
  return 1;
}
