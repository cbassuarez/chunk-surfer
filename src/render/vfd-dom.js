import { themeForSurface, uiBrightness, vfdFlickerLevel } from './palette.js';

const VARIABLE = Object.freeze({
  phosphor: '--cs-vfd-phosphor',
  dim: '--cs-vfd-dim',
  counter: '--cs-vfd-counter',
  marker: '--cs-vfd-marker',
  accent: '--cs-vfd-accent',
  glass: '--cs-vfd-glass',
  silkscreen: '--cs-vfd-silkscreen',
  wordmark: '--cs-vfd-wordmark',
  strip: '--cs-vfd-strip',
  danger: '--cs-vfd-danger',
});

export function vfdDomTheme(surface = 'amber') {
  const theme = themeForSurface(surface);
  return {
    variables: Object.fromEntries(Object.entries(VARIABLE).map(([role, property]) => [property, theme[role]])),
    brightness: uiBrightness(),
    flicker: vfdFlickerLevel(),
    surface,
  };
}

export function applyVfdDomTheme(element, surface = 'amber') {
  const resolved = vfdDomTheme(surface);
  if (!element) return resolved;
  for (const [property, value] of Object.entries(resolved.variables)) element.style?.setProperty?.(property, value);
  element.style?.setProperty?.('--cs-vfd-brightness', String(resolved.brightness));
  if (element.dataset) {
    element.dataset.vfdSurface = resolved.surface;
    element.dataset.vfdFlicker = resolved.flicker;
  }
  return resolved;
}
