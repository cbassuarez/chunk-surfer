// THE SCREEN: what shape a mark is allowed to be.
//
// A one-bit image is a comparison between a tone and a threshold, and the shape
// of the marks is decided ENTIRELY by where that threshold comes from. This is
// the part that was missing. Both screens this game had are dot generators —
// blue noise is defined by placing isolated, evenly spaced samples, and
// formStipple hashes cubic cells that collapse to about a pixel once the mip
// picks up — so no amount of tuning downstream of them could produce a stroke.
// Measured in the get-in: sweeping the grain gain across its whole range moved
// the picture by one percentage point of ink.
//
// So the threshold function becomes pluggable, and a screen is authored data.
//
// WHITE LINE ON A BLACK GROUND. Worth stating because it inverts the usual
// intuition: in this renderer a lit cell is INK, and the ground is black. This
// is a scraperboard, not a woodcut. Cross-hatching therefore adds directions as
// a surface gets BRIGHTER, not darker — the extra layers are extra light.
import { BAYER_4 } from './dither.js';

export { BAYER_4 };

// Integers, because they cross into GLSL as uScreenKind.
export const SCREEN_KIND = Object.freeze({
  STOCHASTIC: 0,
  HATCH: 1,
  CROSSHATCH: 2,
});

// periodPx is a SCREEN-SPACE stroke period. That is the whole trick behind marks
// that stay legible at distance: a world-space period mips down into the dust
// this is meant to replace, so the frequency belongs to the plate while the
// DIRECTION still comes from the world (see grainFollow). Strokes therefore keep
// their weight across the room and still describe the form they lie on.
//
// angles are radians ADDED to the grain direction for the second and third
// cross-hatch layers. bands are the tone at which those layers switch on.
// sharpness shapes the stroke's profile: 1 is a clean wedge, higher keeps the
// stroke thin until the tone is genuinely up.
const SCREEN_DATA = {
  // The look that shipped. Kept reachable so it stays the A/B baseline, and so a
  // space can still ask for dust on purpose.
  stochastic: { kind: SCREEN_KIND.STOCHASTIC, periodPx: 0, angles: [0, 0, 0], bands: [1, 1], sharpness: 1, grainFollow: 0, jitter: 0.35 },
  // One direction, following the material. Floorboards hatch along the board,
  // brick along the course.
  hatch: { kind: SCREEN_KIND.HATCH, periodPx: 5.5, angles: [0, 0, 0], bands: [1, 1], sharpness: 1.15, grainFollow: 1, jitter: 0.22 },
  // Three directions arriving with the light. The 60°/120° offsets are the
  // engraver's habit: anything nearer 90° reads as a woven grid rather than as a
  // second pass of the tool.
  crosshatch: { kind: SCREEN_KIND.CROSSHATCH, periodPx: 6.5, angles: [0, Math.PI / 3, (2 * Math.PI) / 3], bands: [0.34, 0.62], sharpness: 1.25, grainFollow: 0.85, jitter: 0.26 },
  // The same hand, held tighter — for the states that should feel worked over.
  crosshatchTight: { kind: SCREEN_KIND.CROSSHATCH, periodPx: 4.25, angles: [0, Math.PI / 3, (2 * Math.PI) / 3], bands: [0.28, 0.55], sharpness: 1.4, grainFollow: 0.8, jitter: 0.3 },
};

export const SCREENS = Object.freeze(Object.fromEntries(
  Object.entries(SCREEN_DATA).map(([id, s]) => [id, Object.freeze({ id, ...s, angles: Object.freeze([...s.angles]), bands: Object.freeze([...s.bands]) })]),
));

export const SCREEN_IDS = Object.freeze(Object.keys(SCREENS));

export function getScreen(id = 'stochastic') {
  return SCREENS[id] || SCREENS.stochastic;
}

export function isScreen(id) {
  return Object.prototype.hasOwnProperty.call(SCREENS, id);
}

// The flat numbers r3d uploads. Kept in one place so the renderer never has to
// know the shape of a screen, and so a new field cannot be added here and
// silently forgotten at the call site.
export function screenUniforms(id) {
  const s = getScreen(id);
  return {
    kind: s.kind,
    periodPx: s.periodPx,
    angles: [s.angles[0], s.angles[1], s.angles[2]],
    bands: [s.bands[0], s.bands[1]],
    sharpness: s.sharpness,
    grainFollow: s.grainFollow,
    jitter: s.jitter,
  };
}

const fract = (v) => v - Math.floor(v);

// Distance across a stroke, 0 on the line and 1 midway between lines. Wrapped so
// there is no seam, and sign-invariant, which matters because the grain arrives
// as a LINE FIELD: its direction is only defined up to a flip (see
// markGrainWorld), and a screen that cared about the sign would seam wherever
// the decoded angle crossed.
export function strokeDistance(x, y, dirRadians, periodPx, phase = 0) {
  const period = Math.max(2, periodPx);
  // Across the stroke, not along it.
  const nx = -Math.sin(dirRadians), ny = Math.cos(dirRadians);
  const p = (x * nx + y * ny) / period + phase;
  return Math.abs(fract(p + 0.5) - 0.5) * 2;
}

// THE CPU MIRROR of the GLSL. Exists so stroke morphology is testable without a
// GPU — the anisotropy that separates a stroke from a dot is a property of this
// function, not of the driver.
//
// Returns a threshold in 0..1; a cell is lit when tone >= threshold, which is
// the same comparison the shader makes.
export function screenThreshold(id, x, y, dirRadians, tone, jitterValue = 0) {
  const s = getScreen(id);
  if (s.kind === SCREEN_KIND.STOCHASTIC) {
    // The ordered matrix stands in for the blue-noise texture the shader samples:
    // both are isotropic rank tables, which is exactly the property under test.
    return BAYER_4[(Math.abs(Math.floor(y)) % 4) * 4 + (Math.abs(Math.floor(x)) % 4)];
  }
  const phase = (jitterValue - 0.5) * s.jitter;
  const shape = (d) => Math.pow(Math.min(1, Math.max(0, d)), s.sharpness);
  let threshold = shape(strokeDistance(x, y, dirRadians + s.angles[0], s.periodPx, phase));
  if (s.kind === SCREEN_KIND.CROSSHATCH) {
    // Extra directions are extra LIGHT, so they arrive as the tone comes up. min()
    // because a pixel near any active stroke is lit.
    if (tone >= s.bands[0]) {
      threshold = Math.min(threshold, shape(strokeDistance(x, y, dirRadians + s.angles[1], s.periodPx, phase)));
    }
    if (tone >= s.bands[1]) {
      threshold = Math.min(threshold, shape(strokeDistance(x, y, dirRadians + s.angles[2], s.periodPx, phase)));
    }
  }
  return threshold;
}
