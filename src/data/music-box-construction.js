// Shared physical frame for Lyle's keepsake. Dimensions are a working fit to
// the supplied photographs, not a measurement of the real object. The coated
// case stays closed in both scenes; the crash changes its exterior only.
export const MUSIC_BOX_CONSTRUCTION = Object.freeze({
  revision: 'closed-keepsake-1',
  dimensions: Object.freeze([0.054, 0.046, 0.032]),
  dimensionsProvisional: true,
  origin: 'centre of base; Y up; portrait faces +Z; rear plate faces -Z',
  casingClosed: true,
  keyPivot: Object.freeze([-0.01134, 0.0253, -0.0171]),
  keyAxis: Object.freeze([0, 0, 1]),
  rearPlate: Object.freeze({ width: 0.0505, height: 0.0425, depth: 0.0007, centreY: 0.023, frontZ: -0.0162 }),
  supportFootprint: Object.freeze([Object.freeze([-0.021,-0.010]),Object.freeze([-0.021,0.010]),Object.freeze([0.021,-0.010]),Object.freeze([0.021,0.010])]),
});
