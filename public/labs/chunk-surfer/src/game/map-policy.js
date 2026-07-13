// Navigation information policy. Gameplay difficulty decides which facts are
// supplied; accessibility/presentation may change how those facts are drawn.

const BASE = Object.freeze({
  id: 'directional',
  showMap: true,
  showBearing: true,
  showDistance: true,
  showRoom: true,
  showMapTopology: true,
  showExactPlayer: true,
  showAllTargetLabels: false,
  showWaypoint: true,
  showCrossFloorConnector: true,
  showRoute: false,
  showRouteStatus: false,
  minimapMode: 'topology',
  contactHoldScale: 1,
  contactResolveBias: 0,
  contactShowRoom: true,
});

export function resolveMapPolicy(navigation = null) {
  const value = navigation && typeof navigation === 'object' ? navigation : {};
  return Object.freeze({ ...BASE, ...value, id: value.id || BASE.id });
}

export function mapPresentation(settings = {}) {
  return Object.freeze({
    iconScale: Math.max(0.75, Math.min(1.75, Number(settings.mapIconScale) || 1)),
    labelScale: Math.max(0.8, Math.min(1.5, Number(settings.mapLabelScale) || 1)),
    opacity: Math.max(0.35, Math.min(1, Number(settings.minimapOpacity) || 0.88)),
    highContrast: !!settings.highContrast,
    reducedMotion: !!settings.reducedEffects,
  });
}
