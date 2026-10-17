// Isolated environmental lettering studies. Every variant is ordinary opaque
// P3 geometry; light, depth, occlusion and the final acquisition remain shared.
// No production placements are replaced by importing this module.
export const LETTERING_STUDY_PACK_URL = '/assets/lettering-study/signs.glb';
export const LETTERING_STUDY_VARIANTS = Object.freeze(['baseline', 'type-flat', 'fabricated']);
export const LETTERING_STUDY_CASES = Object.freeze({
  services: Object.freeze({
    id: 'services', sourceMesh: 'scene_dock_sign_services', copy: 'STUDIOS / PLANT',
    widthM: 2.70, heightM: .86, centerY: 0, faceZ: -.0475,
    faceWidthM: 2.62, faceHeightM: .78, capHeightM: .2405078125, stemWidthM: .0409375,
    process: 'Screen-printed vitreous-enamel service sign; existing ivory frame retained.',
    reading: Object.freeze({ requiredDistanceM: 3, closeDistanceM: 1.25, minCapPixels: 12, minStrokePixels: 1.5, humanValidation: 'pending' }),
    fontFile: 'NimbusSansNarrow-Bold.otf',
  }),
  placard: Object.freeze({
    id: 'placard', sourceMesh: 'vigil_part_sign_save', copy: 'SAVE ELLERY',
    widthM: 1.32, heightM: .84, centerY: 1.78, faceZ: -.248,
    faceWidthM: 1.32, faceHeightM: .84, capHeightM: .162421875, stemWidthM: .020625,
    process: 'Hand-painted brush lettering on existing reused board; existing tape and stick retained.',
    reading: Object.freeze({ recognitionDistanceM: 5, requiredDistanceM: 3, closeDistanceM: 1.0, minCapPixels: 12, minStrokePixels: 1.5, humanValidation: 'pending' }),
    fontFile: null, letteringSource: 'authored brush trajectories',
  }),
});

export function letteringStudyCase(id) {
  const study = LETTERING_STUDY_CASES[id];
  if (!study) throw new RangeError(`Unknown lettering study ${id}`);
  return study;
}

export function letteringStudyMesh(id, variant = 'fabricated') {
  letteringStudyCase(id);
  if (!LETTERING_STUDY_VARIANTS.includes(variant)) throw new RangeError(`Unknown lettering variant ${variant}`);
  return `lettering_study_${id}_${variant.replaceAll('-', '_')}`;
}

export function letteringStudyInstance(id, variant = 'fabricated', placement = {}) {
  const study = letteringStudyCase(id);
  const mesh = letteringStudyMesh(id, variant);
  // Supplied positions are already metres, exactly as P3.addPropPack expects.
  return { id: `${mesh}:inspection`, mesh, x: 0, y: -study.centerY + 1.7, z: 0, yaw: 0, zone: 6, ...placement };
}

export async function loadLetteringStudy(propsRenderer, url = LETTERING_STUDY_PACK_URL) {
  if (typeof propsRenderer?.addPropPack !== 'function') throw new TypeError('An initialized production props renderer is required');
  return propsRenderer.addPropPack(url);
}

// A planning metric, not evidence of human readability. width foreshortens with
// yaw; vertical cap height does not. Supply the actual internal acquisition
// resolution rather than the CSS viewport or a supersampled material target.
export function projectedLetterMetrics({ capHeightM, strokeWidthM, distanceM, verticalFovRadians, acquisitionHeightPx, yawRadians = 0 } = {}) {
  if (![capHeightM, strokeWidthM, distanceM, verticalFovRadians, acquisitionHeightPx, yawRadians].every(Number.isFinite)
      || capHeightM <= 0 || strokeWidthM <= 0 || distanceM <= 0 || verticalFovRadians <= 0
      || verticalFovRadians >= Math.PI || acquisitionHeightPx <= 0) throw new RangeError('Positive physical and camera dimensions are required');
  const pixelsPerMeter = acquisitionHeightPx / (2 * distanceM * Math.tan(verticalFovRadians / 2));
  return { capHeightPx: capHeightM * pixelsPerMeter,
    horizontalStrokePx: strokeWidthM * pixelsPerMeter * Math.abs(Math.cos(yawRadians)),
    verticalStrokePx: strokeWidthM * pixelsPerMeter, pixelsPerMeter };
}

export function meetsLetteringSamplingTarget(metrics, reading) {
  return metrics.capHeightPx >= reading.minCapPixels && Math.min(metrics.horizontalStrokePx, metrics.verticalStrokePx) >= reading.minStrokePixels;
}
