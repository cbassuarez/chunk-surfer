// Selective VFD compositor. The full-resolution scene remains authoritative;
// cell-centre samples only decide where phosphor is excited. The previous pass'
// alpha stores excitation memory, never scene colour or depth.
import { CAMERA_FORWARD_GLSL } from '../camera-basis.js';
import { FIRE_ESCAPE_INK_GLSL } from '../fire-escape-ink.js';
import { ROOF_SURFACE_INK_GLSL, ROOF_GLASS_INK_GLSL } from '../roof-surface-ink.js';
import { PRINTED_SURFACE_GLSL } from '../printed-surface.js';
import { PRESSURE_INK_GLSL } from '../pressure-composite.js';

export const PIXEL_MESH_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform sampler2D uDepth;
uniform sampler2D uPrev;
uniform sampler2D uNoise;
uniform vec2 uNoiseSize;
uniform float uBlackPoint;
uniform float uWhitePoint;
uniform float uToneGamma;
// THE PLATE GRADE, APPLIED BEFORE THE DITHER.
//   x  invert    0 = the scene as lit, 1 = a negative
//   y  gamma     curve applied after the invert
//   z  gain      white point of the graded plate
//   w  soften    radius, in cells, of a small pre-grade blur
// Neutral is (0, 1, 1, 0) and every profile but the front end uses it. This is
// the front-end composite's look: the camera really is behind the menu, printed
// as a negative rather than lit as a room.
uniform vec4 uGrade;
// THE PLATE'S OWN BLACK AND WHITE POINT, applied before the invert above.
// The reference curve was fitted to test bars, which use the whole scale. A
// night exterior does not: measured off the title, the composite occupies about
// 0..0.5 and is over half black. Inverting THAT with a curve meant for a
// full-range signal put the entire frame into the top eighth of the scale --
// 126 levels of tone field collapsed to 15, and the building went the same
// white as the sky behind it. Normalising onto the range the curve expects is
// the same move a colourist makes before applying a look, and it is what puts
// the picture back. It sits inside the invert branch, so a neutral profile
// never reaches it; (0, 1) is the identity if it ever needs one.
uniform vec2 uGradePlate;
uniform float uLineAmount;
uniform float uToneAmount;
// The engraving, written beside the scene by the raymarch (see oMark in r3d.js).
// R density, GB the coherence-weighted doubled-angle grain, A coherence.
// R == 0 means no engraving for this fragment — sky, or a material slot whose
// tiles have not been derived yet — and the procedural hash draws it instead.
uniform sampler2D uMarks;
uniform float uMarkDensityGain;
// How hard the engraving follows the grain. 0 is the isotropic hash that
// shipped, which makes it the A/B (see __probe.markGrain).
uniform float uMarkGrainGain;
// Diagnostic ablation: 0 prior acquisition, 1 pigment-edge classification,
// 2 full-resolution printed sampling, 3 solid pigment (production),
// 4 the prior hollow operator, 5 the approved paint resolve before gilt work;
// both controls are retained only for matched art review.
uniform float uPrintedSurfaceMode;
uniform vec2 uRes;
uniform vec3 uCam;
uniform float uYaw;
// Zero retains the ordinary lens for transparent instrument hosts.
uniform float uCameraTanHalfFov;
uniform float uPitch;
uniform float uCellMeters;
uniform float uTime;
uniform float uDt;
uniform float uCellPx;
uniform float uBaseRetention;
uniform float uPaletteAmount;
uniform float uPaletteChroma;
uniform float uShadowLift;
uniform float uAgitation;
uniform float uSignalAmount;
uniform float uEdgeGain;
uniform float uCoverage;
uniform float uGlowAmount;
uniform float uPersistenceMs;
uniform float uAperture;
uniform float uAmberAmount;
uniform float uAudio;
uniform float uFear;
uniform float uReduceFlash;
uniform float uReduceMotion;
uniform float uRecordingCaptureMix;
// Only the academic roof recovers the far-depth sky/city from the raw scene.
// All nearer architecture, props and Ren retain the full one-bit acquisition.
uniform float uRoofSkyRecovery;
uniform float uRoofSkyPackedFar;
uniform float uRecordingExposure;
uniform float uRecordingSensitivity;
uniform float uRecordingPatternScale;
uniform float uRecordingBlackFloor;
uniform float uRecordingDensityGamma;
uniform float uRecordingThresholdNoise;
uniform float uRecordingIrregularity;
uniform float uRecordingTemporalHz;
uniform float uRecordingTemporalSmear;
uniform float uRecordingScenePinning;
uniform float uRecordingFearGain;
uniform float uRecordingAudioGain;
uniform float uDebugSource;
uniform float uForceSignal;
uniform float uMovement;
// x manifestation, y active, z core enabled, w glow enabled. The HUSH body
// is composed before this pass, but its Photoshop-style emissive result must
// be restored after the one-bit recorder has encoded the rest of the world.
uniform vec4 uHushBodyPost;
// THE SCREEN. Which shape a mark is allowed to be — see pixel-mesh/screens.js,
// which owns the catalogue and the CPU mirror these are tested against.
// 0 stochastic (the isolated dots this shipped with), 1 hatch, 2 cross-hatch.
uniform int uScreenKind;
// The van the camera rides in: world to van metres, the van's box, and how
// its cab is screened (0 as the world, 1 hatch, 2 contours and lit only).
uniform float uVehicleActive;
uniform mat4 uWorldToVehicle;
uniform vec3 uVehicleBoxMin;
uniform vec3 uVehicleBoxMax;
uniform float uCabinScreen;
int gScreenKind;
// View metres from the packed depth (the inverse of 1/(1+.14d)).
float cabViewDepth(float packedDepth){ return max(0.0, (1.0 / max(packedDepth, 1e-6) - 1.0) / 0.14); }
// Stroke period in SCREEN PIXELS, not world units. That is the whole reason
// hatching survives distance: a world-space period mips down into the dust it
// was meant to replace, so the frequency belongs to the plate while the
// DIRECTION still comes from the world.
uniform float uScreenPeriodPx;
// Radians added to the grain direction for the three cross-hatch layers.
uniform vec3 uScreenAngles;
// The tone at which the second and third layers arrive. White line on a black
// ground, so extra directions are extra LIGHT and come in as it brightens.
uniform vec2 uScreenBands;
uniform float uScreenSharpness;
uniform float uScreenGrainFollow;
uniform float uScreenJitter;
#ifdef SOURCE_DESKTOP_TRANSPARENT
// The passive desktop surface supplies real coverage separately from the
// recorder's depth and excitation channels. Ordinary r3d does not enable this.
uniform sampler2D uSourceCoverage;
uniform mat4 uSourceProjectionInverse;
uniform mat4 uSourceCameraWorld;
uniform vec4 uSourceViewport;
uniform vec2 uSourceScreenOffset;
uniform float uSourcePressureFinish;
#else
// Physical Pressure supplies its own volume and relief. Engraving on the wall
// behind that volume must not become print on the figure after acquisition.
uniform sampler2D uRecordedPressureGeometry;
uniform vec2 uRecordedPressureNearFar;
uniform float uRecordedPressureReady;
uniform sampler2D uRecordedPressureInk;
uniform float uRecordedPressureInkReady;
#endif
out vec4 o;
${PRESSURE_INK_GLSL}

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

// THE MASK THE PICTURE IS MEASURED AGAINST.
//
// bayer4 below is a 4x4 ORDERED matrix: sixteen levels, repeating every four
// cells. That periodicity is the square plaid on every flat wall, and it is not
// in the signal — it is in the ruler. Blue noise has the same average density
// with no periodic structure at any scale the eye integrates, so the dots stay
// evenly spread at every threshold instead of snapping to a grid.
// See tools/chunk_surfer/build-blue-noise.mjs for how the mask is built.
float blueNoise(vec2 cellId){
  return texture(uNoise, (cellId + 0.5) / uNoiseSize).r;
}

// LEVELS, WHICH IS THE STAGE THAT WAS MISSING.
//
// Everything downstream was being handed a signal that peaked around 0.28
// against a threshold of 0.78, so nothing was ever selected and a room rendered
// as sparse dust. There was no black point, no white point and no curve — only
// a sliding cut point pretending to be one.
//
// Solid black and solid white have to be REACHABLE for a one-bit image to read
// as an engraving rather than as static; the midtones are what the dither is
// for. Authored per look profile, so calm becomes low-contrast-with-full-range
// instead of no-signal.
float levels(float v){
  float lo = min(uBlackPoint, uWhitePoint - 0.001);
  float t = clamp((v - lo) / max(1e-4, uWhitePoint - lo), 0.0, 1.0);
  return pow(t, max(0.05, uToneGamma));
}

float bayer4(ivec2 p){
  int x = p.x & 3;
  int y = p.y & 3;
  int i = y * 4 + x;
  int v = 0;
  if(i==0) v=0; else if(i==1) v=8; else if(i==2) v=2; else if(i==3) v=10;
  else if(i==4) v=12; else if(i==5) v=4; else if(i==6) v=14; else if(i==7) v=6;
  else if(i==8) v=3; else if(i==9) v=11; else if(i==10) v=1; else if(i==11) v=9;
  else if(i==12) v=15; else if(i==13) v=7; else if(i==14) v=13; else v=5;
  return (float(v) + 0.5) / 16.0;
}

float recordingHash(vec2 p);
float recordingHash3(vec3 p);

${CAMERA_FORWARD_GLSL}

vec3 cameraRay(vec2 frag){
  vec2 uv = (frag / uRes) * 2.0 - 1.0;
  uv.x *= uRes.x / uRes.y;
  float cy = cos(uYaw), sy = sin(uYaw);
  vec3 fwd = cameraForward(uYaw,uPitch);
  vec3 rgt = normalize(vec3(cy, 0.0, sy));
  vec3 up = normalize(cross(rgt, fwd));
  float tanHalfFov=uCameraTanHalfFov>0.0?uCameraTanHalfFov:0.95;
  return normalize(fwd + uv.x * rgt * tanHalfFov + uv.y * up * tanHalfFov);
}

vec3 reconstructWorldMetres(vec2 frag, float packedDepth){
#ifdef SOURCE_DESKTOP_TRANSPARENT
  vec2 ndc = ((frag-uSourceViewport.xy)/uSourceViewport.zw)*2.0-1.0;
  vec4 nearPoint = uSourceProjectionInverse*vec4(ndc,-1.0,1.0);
  vec4 farPoint = uSourceProjectionInverse*vec4(ndc,1.0,1.0);
  nearPoint /= nearPoint.w; farPoint /= farPoint.w;
  float viewDepth = max(0.0,(1.0/max(packedDepth,1e-6)-1.0)/0.14);
  // Solve the camera ray at its acquired view depth. Replacing only z is
  // correct for orthographic images but slides perspective skin and clothing
  // marks sideways as the camera or performer moves.
  float rayAmount = (-viewDepth-nearPoint.z)/(farPoint.z-nearPoint.z);
  vec3 view = mix(nearPoint.xyz,farPoint.xyz,rayAmount);
  return (uSourceCameraWorld*vec4(view,1.0)).xyz;
#else
  vec3 rd = cameraRay(frag);
  float cy = cos(uYaw), sy = sin(uYaw);
  vec3 fwd = cameraForward(uYaw,uPitch);
  float safeDepth = max(packedDepth, 1.0 / 256.0);
  float viewDepth = max(0.0, (1.0 / safeDepth - 1.0) / 0.14);
  float gridDistance = viewDepth / max(0.001, uCellMeters * dot(rd, fwd));
  return (uCam + rd * gridDistance) * uCellMeters;
#endif
}

// The density argument is the generated material's own local contrast, 0
// where there is no engraving. It biases WHERE MARKS CLOT: a busy patch of
// material pulls the threshold down and resolves into more marks, a smooth one
// pushes it up and opens out. Measured across the six banks, this is where the
// lens actually differs from itself — calm sits near 0.05 local contrast and
// rupture near 0.14, a 191% spread — so it is the channel that makes a
// profile's material legible as marks rather than as colour nobody ever sees.
// LIFT THE TILE-SPACE LINE FIELD INTO THE WORLD, AFTER FILTERING.
//
// The mark buffer stores the grain as a doubled-angle vector in the surface's
// own UV plane, with alpha naming which of the three axis-aligned planes that
// is (see gMarkPlane in r3d.js). Decoding is deliberately done HERE, per
// fragment, and not at the write: the doubled angle is the only encoding that
// survives bilinear interpolation, because averaging two perpendicular grains
// cancels to "uncertain" instead of to a confident perpendicular average. A
// world-space direction vector written into the buffer would be filtered as a
// vector and lose exactly that property.
//
// The half-angle is taken without atan. sqrt of the half-angle identities is
// both cheaper and branch-free, and it always returns cos(phi) >= 0, which is a
// canonical sign rather than an arbitrary one.
//
// The sign it picks still flips where the doubled angle crosses 180 degrees,
// and that is FINE, which is the whole reason this works: the warp below uses
// the direction only through dot(p,d)*d, so d and -d give an identical result.
// A line field is what the material has; a line field is all it needs.
//
// Returns the world grain scaled by its coherence, so an isotropic surface
// returns something short and warps by nothing.
vec3 markGrainWorld(vec4 markSample){
  vec2 doubled = markSample.gb * 2.0 - 1.0;
  float coherence = length(doubled);
  if(coherence < 0.004) return vec3(0.0);
  vec2 u = doubled / coherence;
  float c = sqrt(max(0.0, 0.5 * (1.0 + u.x)));
  float sn = sqrt(max(0.0, 0.5 * (1.0 - u.x)));
  if(u.y < 0.0) sn = -sn;
  // Must mirror surfaceUv in r3d.js: 0 = XZ, 0.5 = ZY, 1 = XY.
  float plane = markSample.a;
  vec3 dir = plane < 0.25 ? vec3(c, 0.0, sn)
           : plane < 0.75 ? vec3(0.0, sn, c)
                          : vec3(c, sn, 0.0);
  return dir * min(coherence, 1.0);
}

// THE GRAIN, BROUGHT ONTO THE PLATE.
//
// The stroke frequency has to live in screen space or it mips into dust, but the
// stroke DIRECTION has to come from the world or the hatching stops describing
// anything. Both at once needs the world grain expressed as a screen vector, and
// that does not need a matrix: dFdx/dFdy of the reconstructed world position ARE
// the screen-to-world Jacobian, so projecting the grain onto them maps it back.
//
// Degenerate cases — no grain, or a surface edge-on where the derivatives blow
// up — return the fixed plate angle instead, the same way the markSample.r
// sentinel already falls back for density.
vec2 grainToScreen(vec3 grain, vec3 worldMetres, float fallbackAngle){
  vec2 plate = vec2(cos(fallbackAngle), sin(fallbackAngle));
  if(length(grain) < 0.004) return plate;
  vec3 dWdx = dFdx(worldMetres), dWdy = dFdy(worldMetres);
  vec2 dir = vec2(dot(grain, dWdx), dot(grain, dWdy));
  float len = length(dir);
  if(len < 1e-6) return plate;
  // Coherence rides in the grain's length; a weakly directional surface should
  // drift back to the plate angle rather than follow a direction it barely has.
  float follow = clamp(uScreenGrainFollow * min(1.0, length(grain)), 0.0, 1.0);
  return normalize(mix(plate, dir / len, follow));
}

// Distance ACROSS a stroke: 0 on the line, 1 midway between lines. Wrapped, so
// there is no seam, and sign-invariant, which matters because the grain is a
// LINE field — its direction is only defined up to a flip.
float strokeDistance(vec2 fragPx, vec2 dir, float periodPx, float phase){
  vec2 n = vec2(-dir.y, dir.x);
  float p = dot(fragPx, n) / max(2.0, periodPx) + phase;
  return abs(fract(p + 0.5) - 0.5) * 2.0;
}

vec2 rotateDir(vec2 d, float a){
  float c = cos(a), s = sin(a);
  return vec2(d.x * c - d.y * s, d.x * s + d.y * c);
}

// The screen. Mirrored on the CPU in pixel-mesh/screens.js, which is where the
// stroke morphology is actually tested.
float screenThreshold(vec2 fragPx, vec2 dir, float tone, float jitterValue, float stochastic){
  if(gScreenKind == 0) return stochastic;
  float phase = (jitterValue - 0.5) * uScreenJitter;
  float t = pow(strokeDistance(fragPx, rotateDir(dir, uScreenAngles.x), uScreenPeriodPx, phase),
                max(0.05, uScreenSharpness));
  if(gScreenKind == 2){
    // White line on a black ground: extra directions are extra LIGHT, so they
    // arrive as the surface brightens. min() because a fragment near any active
    // stroke is lit.
    if(tone >= uScreenBands.x){
      t = min(t, pow(strokeDistance(fragPx, rotateDir(dir, uScreenAngles.y), uScreenPeriodPx, phase),
                     max(0.05, uScreenSharpness)));
    }
    if(tone >= uScreenBands.y){
      t = min(t, pow(strokeDistance(fragPx, rotateDir(dir, uScreenAngles.z), uScreenPeriodPx, phase),
                     max(0.05, uScreenSharpness)));
    }
  }
  return clamp(t, 0.0, 1.0);
}

float formStipple(vec3 worldMetres, float irregularity, float density, vec3 grain){
  // Aperiodic samples are pinned to the surface, but they are only consulted
  // in the narrow half-tone region below. There is no material-wide dot,
  // hatch or Bayer screen to turn plaster and boards into diamond plate. A 3D
  // world key avoids choosing an XY/XZ/YZ projection from a reconstructed
  // normal, which used to flip at grazing angles as the player turned.
  float scale = max(12.0, uRecordingPatternScale);
  vec3 finePosition = worldMetres * scale;
  // FOLLOW THE GRAIN. Compressing the sample key along the grain direction makes
  // the hash cells longer that way, so marks elongate ALONG the floorboard
  // instead of sitting on it as isotropic gravel. This is the half of the
  // engraving the density term could not reach: density decides where marks
  // clot, direction decides what they look like once they do.
  //
  // Sign-invariant by construction — d appears only as dot(p,d)*d — so the
  // decoded direction's arbitrary sign cannot show up as a seam.
  float grainStrength = length(grain);
  if(grainStrength > 0.004){
    vec3 d = grain / grainStrength;
    // Negative: k < 0 stretches the feature along d. Clamped well clear of -1,
    // where the coordinate would collapse and the whole surface would smear
    // into a single streak.
    float k = -clamp(uMarkGrainGain * grainStrength, 0.0, 0.82);
    finePosition += d * dot(finePosition, d) * k;
  }
  // Select an isotropic world-space mip from the largest pixel footprint.
  // This removes oblique-angle moire without rotating the mark field toward
  // either the camera or a privileged wall axis.
  vec3 dx = dFdx(finePosition), dy = dFdy(finePosition);
  float footprint = max(length(dx), length(dy));
  float lod = clamp(log2(max(1.0, footprint)), 0.0, 4.0);
  float cellSpan = exp2(floor(lod));
  vec3 fineCellA = floor(finePosition / cellSpan);
  vec3 fineCellB = floor(finePosition / (cellSpan * 2.0)) + vec3(17.0, 31.0, 47.0);
  float fine = mix(recordingHash3(fineCellA), recordingHash3(fineCellB), fract(lod));
  vec3 broadCell = floor(finePosition * 0.173) + vec3(11.0, 29.0, 43.0);
  float broad = recordingHash3(broadCell);
  float threshold = mix(fine, mix(fine, broad, 0.22), clamp(irregularity, 0.0, 1.0));
  // Pivot at the quiet end of the measured range so calm reads close to the
  // procedural behaviour that shipped, and the louder banks earn their extra
  // marks rather than the whole building drifting darker.
  return clamp(threshold - (density - 0.22) * uMarkDensityGain, 0.0, 1.0);
}

// The acquisition clock deliberately advances in held phases. Smear crossfades
// neighbouring phases instead of letting every fragment become independent
// frame-rate snow. Reduced motion freezes the phase but preserves the texture.
float recordingClock(float time, float hz, float reduceMotion){
  return time * max(0.0, hz) * (1.0 - clamp(reduceMotion, 0.0, 1.0));
}

float recordingHash(vec2 p){
  p = fract(p * vec2(0.1031, 0.11369));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

float recordingHash3(vec3 p){
  p = fract(p * vec3(0.1031, 0.11369, 0.13787));
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float recordingNoise(vec2 cellId, float clock, float scenePinning, float temporalSmear){
  float phase = floor(clock);
  float phaseMix = smoothstep(0.0, 1.0, fract(clock)) * clamp(temporalSmear, 0.0, 1.0);
  float current = recordingHash(cellId + vec2(phase * 17.0, phase * 31.0));
  float next = recordingHash(cellId + vec2((phase + 1.0) * 17.0, (phase + 1.0) * 31.0));
  float temporal = mix(current, next, phaseMix);
  float stable = recordingHash(cellId * vec2(1.071, 1.113) + vec2(7.3, 19.1));
  return mix(temporal, stable, clamp(scenePinning, 0.0, 1.0));
}

float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// Emergency red is a reserved display primary. Keeping the dominance measure
// named here makes the final acquisition gate auditable alongside the lighting
// passes that remove unbacked red before it reaches this compositor.
float emergencyRedDominance(vec3 color){
  return (color.r-max(color.g,color.b))/max(color.r,1e-4);
}
vec3 palCyan(){ return vec3(0.380, 1.000, 0.900); }
vec3 palCyanHot(){ return vec3(0.780, 1.000, 0.960); }
vec3 palCyanDim(){ return vec3(0.060, 0.480, 0.440); }
vec3 palAmber(){ return vec3(1.000, 0.610, 0.180); }
vec3 palGlass(){ return vec3(0.006, 0.020, 0.018); }
vec3 palWorldDark(){ return vec3(0.020, 0.080, 0.105); }
vec3 palWorldMid(){ return vec3(0.250, 0.305, 0.365); }
vec3 palWorldMauve(){ return vec3(0.520, 0.390, 0.455); }
vec3 palCream(){ return vec3(1.000, 0.820, 0.560); }

float hushCoreKey(vec3 value){
  float blueLead=value.b-max(value.r,value.g);
  float greenLead=value.g-value.r;
  return smoothstep(0.10,0.34,blueLead)*smoothstep(0.055,0.18,greenLead);
}

float hushGlowKey(vec3 value){
  float greenLead=value.g-max(value.r,value.b);
  float blueLift=value.b-value.r;
  return smoothstep(0.055,0.20,greenLead)*smoothstep(0.025,0.10,blueLift);
}

vec3 hushScreen(vec3 base,vec3 layer){
  return 1.0-(1.0-base)*(1.0-clamp(layer,0.0,0.94));
}

vec3 hushColorDodge(vec3 base,vec3 layer){
  return min(vec3(1.0),base/max(vec3(0.07),vec3(1.0)-clamp(layer,0.0,0.91)));
}

${FIRE_ESCAPE_INK_GLSL}
${ROOF_SURFACE_INK_GLSL}
${ROOF_GLASS_INK_GLSL}
${PRINTED_SURFACE_GLSL}
vec2 printedSurfaceTexel(ivec2 pixel){
  ivec2 limit=textureSize(uMarks,0)-1;
  float tag=texelFetch(uMarks,clamp(pixel,ivec2(0),limit),0).a;
  return vec2(printedSurfaceKind(tag),printedSurfaceCoverage(tag));
}
float printedSurfaceAreaTexel(ivec2 pixel){
  ivec2 limit=textureSize(uMarks,0)-1;
  return printedSurfaceArea(texelFetch(uMarks,clamp(pixel,ivec2(0),limit),0).a);
}
float absorptivePigmentTone(float tone,float kind){
  // The generic hatch has thresholds arbitrarily close to zero. That cuts
  // bright diagonal slits through measured dark paint. Reserve a coherent
  // dark range for absorptive pigment; real stronger reflections still enter
  // the same screened highlight range. Light pigment keeps its lit response.
  return kind<1.5?clamp((tone-.25)/.75,0.0,1.0):tone;
}
float printedPigmentFootprint(vec2 uv,float kind,float centreDepth){
  // The line detector samples at cell-centred, bilinear positions. Its paint
  // footprint must include those exact contributors, not only frag +/- 1.
  ivec2 size=textureSize(uMarks,0);
  vec2 p=uv*vec2(size)-.5;
  ivec2 base=ivec2(floor(p));vec2 f=fract(p);
  float coverage=0.0;
  for(int i=0;i<4;i++){
    ivec2 offset=ivec2(i&1,i>>1);
    ivec2 pixel=clamp(base+offset,ivec2(0),size-1);
    vec2 material=printedSurfaceTexel(pixel);
    float same=1.0-step(.5,abs(material.x-kind));
    float depth=texelFetch(uDepth,pixel,0).a;
    same*=1.0-step(.003,abs(depth-centreDepth));
    vec2 weight=mix(vec2(1.0)-f,f,vec2(offset));
    coverage+=material.y*same*weight.x*weight.y;
  }
  return coverage;
}
float roofGlassTexel(ivec2 pixel){
  ivec2 limit=textureSize(uMarks,0)-1;
  return roofGlassInkTag(texelFetch(uMarks,clamp(pixel,ivec2(0),limit),0).a);
}
float roofSurfaceTexel(ivec2 pixel){
  ivec2 limit=textureSize(uMarks,0)-1;
  return roofSurfaceInkTag(texelFetch(uMarks,clamp(pixel,ivec2(0),limit),0).a);
}
float quietMetalTexel(ivec2 pixel){
  ivec2 limit=textureSize(uMarks,0)-1;
  return fireEscapeInkTag(texelFetch(uMarks,clamp(pixel,ivec2(0),limit),0).a);
}
float quietMetalFootprint(vec2 uv){
  // Colour/depth edges use bilinear scene samples. Any of their four actual
  // contributors can be a thin iron bar; interpolating its categorical tag
  // first would erase the identity precisely at the generated white fringe.
  ivec2 pixel=ivec2(floor(uv*vec2(textureSize(uMarks,0))-.5));
  float iron=max(max(quietMetalTexel(pixel),quietMetalTexel(pixel+ivec2(1,0))),
    max(quietMetalTexel(pixel+ivec2(0,1)),quietMetalTexel(pixel+ivec2(1,1))));
  float roof=max(max(roofSurfaceTexel(pixel),roofSurfaceTexel(pixel+ivec2(1,0))),
    max(roofSurfaceTexel(pixel+ivec2(0,1)),roofSurfaceTexel(pixel+ivec2(1,1))));
  return max(iron,roof);
}
float apparitionMark(float value){return step(.68,value)*(1.0-step(.86,value));}
float apparitionCoverage(float value){return apparitionMark(value)*clamp((value-.70)/.14,0.0,1.0);}
float apparitionSoftZone(vec2 uv,vec2 texel,float centre){
  vec2 closeBy=texel*2.0,farAway=texel*4.0;
  float nearMark=max(max(
    apparitionMark(texture(uMarks,uv+vec2(closeBy.x,0.0)).a),
    apparitionMark(texture(uMarks,uv-vec2(closeBy.x,0.0)).a)),max(
    apparitionMark(texture(uMarks,uv+vec2(0.0,closeBy.y)).a),
    apparitionMark(texture(uMarks,uv-vec2(0.0,closeBy.y)).a)));
  float farMark=max(max(
    apparitionMark(texture(uMarks,uv+farAway).a),
    apparitionMark(texture(uMarks,uv-farAway).a)),max(
    apparitionMark(texture(uMarks,uv+vec2(farAway.x,-farAway.y)).a),
    apparitionMark(texture(uMarks,uv+vec2(-farAway.x,farAway.y)).a)));
  return max(apparitionMark(centre),max(nearMark*.92,farMark*.42));
}

void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 plateOffset = vec2(0.0);
#ifdef SOURCE_DESKTOP_TRANSPARENT
  plateOffset = uSourceScreenOffset;
#endif
  vec2 plateFrag = frag + plateOffset;
  vec2 fullUv = clamp(frag / uRes, vec2(0.001), vec2(0.999));
#ifdef SOURCE_DESKTOP_TRANSPARENT
  float sourceCoverage = texture(uSourceCoverage,frag/uRes).a;
  if(sourceCoverage <= 0.0){ o=vec4(0.0); return; }
#endif
  // The world, the engraving and the direction the strokes will run, read once
  // and shared. These used to be reconstructed further down, beside the capture
  // pass that first needed them; the halftone needs the same direction, and two
  // passes disagreeing about which way a mark points is how you get a hatch
  // crossed with a stipple.
  float packedDepth = texture(uDepth, fullUv).a;
  vec3 worldMetres = reconstructWorldMetres(frag, packedDepth);
  // THE CAB RIDES WITH THE CAMERA. Every mark below is keyed to the surface it
  // lands on in world metres, so a fixed wall keeps its marks while the eye
  // moves. The cab is not fixed in the world: it travels with the eye, so in
  // world metres its keys change every frame and its marks crawl. Inside the
  // van's own box the key is the van's metres.
  vec3 pinMetres = worldMetres;
  float inCab = 0.0;
  gScreenKind = uScreenKind;
  if(uVehicleActive > 0.5){
    vec3 local = (uWorldToVehicle * vec4(worldMetres, 1.0)).xyz;
    if(all(greaterThan(local, uVehicleBoxMin)) && all(lessThan(local, uVehicleBoxMax))){
      pinMetres = local; inCab = 1.0;
      if(uCabinScreen > 0.5 && uCabinScreen < 1.5) gScreenKind = 1;
    }
  }
  vec4 markSample = texture(uMarks, fullUv);
  float quietMetal=quietMetalTexel(ivec2(frag));
  float roofSurface=roofSurfaceTexel(ivec2(frag));
  float roofGlass=roofGlassTexel(ivec2(frag));
  float printedOccluded=0.0;
#ifndef SOURCE_DESKTOP_TRANSPARENT
  if(uRecordedPressureReady>.5){
    vec4 pressureGeometry=texture(uRecordedPressureGeometry,fullUv);
    float pressureCore=mod(floor(floor(pressureGeometry.b*255.0+.5)/64.0),2.0);
    float pressureDepth=dot(pressureGeometry.rg,vec2(65280.0,255.0))*uRecordedPressureNearFar.y/65535.0;
    float pressurePackedDepth=1.0/(1.0+pressureDepth*.14);
    // The material pass writes mesh depth only on the visible core. Matching
    // that depth excludes walls in front, transparent glow and stale targets.
    // Compare encoded depth at the RGBA16F acquisition target's precision;
    // a fixed metric epsilon becomes too strict near the far end of the room.
    if(pressureGeometry.a*pressureCore>.018&&abs(pressurePackedDepth-packedDepth)<max(.00006,pressurePackedDepth*.00075)){
      markSample=vec4(0.0);quietMetal=0.0;roofSurface=0.0;roofGlass=0.0;
      printedOccluded=1.0;
    }
  }
#endif
  // R == 0 is the sentinel. Passing the pivot through leaves the threshold
  // exactly as the hash produced it, so an underived slot is not a darker or
  // lighter wall — it is the wall this game already drew.
  float markDensity = markSample.r > 0.0 ? markSample.r : 0.22;
  // The same sentinel governs direction: an underived slot has no grain either,
  // and must warp by nothing rather than by whatever zero decodes to.
  vec3 markGrain = markSample.r > 0.0 ? markGrainWorld(markSample) : vec3(0.0);
  // A fixed plate angle for anything with no grain of its own, offset per screen
  // cell so an entire untextured wall does not become one continuous comb.
  vec2 screenDir = grainToScreen(markGrain, pinMetres, 0.6283);
  float cell = max(1.0, uCellPx);
  vec2 cellId = floor(plateFrag / cell);
  vec2 cellCenter = (cellId + 0.5) * cell - plateOffset;
  vec2 cellUv = clamp(cellCenter / uRes, vec2(0.001), vec2(0.999));

  vec4 srcFull = texture(uSrc, fullUv);
  vec4 srcCell = texture(uSrc, cellUv);
  vec3 c = srcFull.rgb;
  float y = luma(srcCell.rgb);
  vec2 printed=printedSurfaceTexel(ivec2(frag))*(1.0-printedOccluded);
  float printedSampling=step(1.5,uPrintedSurfaceMode)*step(.5,printed.x);
  float areaPaper=printedSurfaceAreaTexel(ivec2(frag))*(1.0-printedOccluded)*printedSampling;
  float printSpanMinimum=areaPaper>.5?.03:.08;
  // Mode 5 preserves the approved paint resolve as a gilt comparison control.
  // Mode 4 retains the older outlined operator; gameplay always uses mode 3.
  float solidPigment=printedSampling*step(2.5,uPrintedSurfaceMode)*max(1.0-step(3.5,uPrintedSurfaceMode),step(4.5,uPrintedSurfaceMode));

  // A SMALL SOFTENING, THEN THE NEGATIVE, THEN THE CURVE — and only then the
  // tone below. The reference stack put a lens blur under the plate and a
  // colour halftone over it; the halftone is this shader's own dither, so the
  // blur has to happen here, before the picture is screened, or it would blur
  // the dots instead of the image.
  if(uGrade.w > 0.0){
    vec2 rad = (1.0 / uRes) * cell * uGrade.w;
    vec3 blurC = texture(uSrc, fullUv + vec2( rad.x, 0.0)).rgb
               + texture(uSrc, fullUv + vec2(-rad.x, 0.0)).rgb
               + texture(uSrc, fullUv + vec2(0.0,  rad.y)).rgb
               + texture(uSrc, fullUv + vec2(0.0, -rad.y)).rgb;
    // Physical print has already been minified in its own UVs. A second
    // acquisition blur borrowed the pale stock into narrow dark stems before
    // the later full-resolution sample could preserve them. Keep the same
    // plate grade below, but acquire the actual lit texel for authored print.
    c = mix((c + blurC) * 0.2,c,printedSampling);
    y = luma(c);
  }
  if(uGrade.x > 0.0){
    // Measured off the reference: greys stay neutral through the whole stack,
    // so one curve serves every channel and the luma the dither reads.
    float span = max(uGradePlate.y - uGradePlate.x, 1e-4);
    c = clamp((c - vec3(uGradePlate.x)) / span, 0.0, 1.0);
    y = clamp((y - uGradePlate.x) / span, 0.0, 1.0);
    vec3 inv = mix(c, vec3(1.0) - c, uGrade.x);
    c = pow(max(inv, vec3(0.0)), vec3(uGrade.y)) * uGrade.z;
    float yi = mix(y, 1.0 - y, uGrade.x);
    y = pow(max(yi, 0.0), uGrade.y) * uGrade.z;
  }
  // TONE FIRST, and it has to be first: the picture is the leveled luminance and
  // everything downstream — material excitation, the halftone, the ink pair — is
  // a modulation of it rather than a replacement for it.
  float tone = levels(y);

  vec2 texel = 1.0 / uRes;
  // Suppress the recorder's bright fringe on either side of a dark iron bar.
  // Nearby tags affect generated outlines only; the facade/street's own tone
  // and light ink are never darkened by a foreground neighbour.
  vec4 sx0 = texture(uSrc, cellUv - vec2(texel.x * cell * 0.45, 0.0));
  vec4 sx1 = texture(uSrc, cellUv + vec2(texel.x * cell * 0.45, 0.0));
  vec4 sy0 = texture(uSrc, cellUv - vec2(0.0, texel.y * cell * 0.45));
  vec4 sy1 = texture(uSrc, cellUv + vec2(0.0, texel.y * cell * 0.45));
  float lumaEdge = abs(luma(sx1.rgb)-luma(sx0.rgb)) + abs(luma(sy1.rgb)-luma(sy0.rgb));
  float depthEdge = abs(sx1.a-sx0.a) + abs(sy1.a-sy0.a);
  float pigmentEdge=0.0;
  float printCoverageSpan=0.0;
  vec2 printLumaEndpoints=vec2(0.0);
  if(printed.x>.5&&uPrintedSurfaceMode>.5){
    // Categorical identity is fetched exactly. A neighbouring board edge,
    // fastener or occluder cannot lend its pigment protection to this pixel.
    for(int i=0;i<4;i++){
      ivec2 offset=i==0?ivec2(-1,0):i==1?ivec2(1,0):i==2?ivec2(0,-1):ivec2(0,1);
      vec2 next=printedSurfaceTexel(ivec2(frag)+offset);
      float same=1.0-step(.5,abs(next.x-printed.x));
      if(areaPaper>.5)same*=printedSurfaceAreaTexel(ivec2(frag)+offset);
      pigmentEdge=max(pigmentEdge,abs(next.y-printed.y)*same);
      float coverageDelta=next.y-printed.y;
      float span=abs(coverageDelta)*same;
      if(printedSampling>.5&&span>max(printSpanMinimum,printCoverageSpan)&&uGrade.x<.001){
        ivec2 sourcePixel=clamp(ivec2(frag)+offset,ivec2(0),textureSize(uSrc,0)-1);
        vec4 adjacent=texelFetch(uSrc,sourcePixel,0);
        // Reconstruct the two locally lit materials before exposure. Exposing
        // their already blended antialias sample instead clipped pale stock
        // into the ink and turned narrow dark glyphs into hollow outlines.
        // These are measured light endpoints, never fixed black/white inks.
        float slope=(luma(adjacent.rgb)-luma(srcFull.rgb))/coverageDelta;
        float expectedContrast=printed.x<1.5?-slope:slope;
        if(expectedContrast>.005&&abs(adjacent.a-srcFull.a)<.003){
          float stock=luma(srcFull.rgb)-slope*printed.y;
          printLumaEndpoints=clamp(vec2(stock,stock+slope),0.0,1.0);
          printCoverageSpan=span;
        }
      }
    }
    if(uPrintedSurfaceMode>2.5&&uPrintedSurfaceMode<3.5&&printed.x>1.5&&printed.y<.5&&printCoverageSpan>.08){
      // Metallic leaf changes the BRDF as coverage changes. Extrapolating two
      // mixed ORM samples can invent a bright enamel reflection in a counter.
      // Prefer measured clear stock of the same material and continuous depth.
      float stockSum=0.0,stockWeight=0.0;
      for(int i=0;i<32;i++){
        int axis=i&7;int radius=2+(i>>3);
        ivec2 direction=axis==0?ivec2(-1,0):axis==1?ivec2(1,0):axis==2?ivec2(0,-1):axis==3?ivec2(0,1):axis==4?ivec2(-1,-1):axis==5?ivec2(1,-1):axis==6?ivec2(-1,1):ivec2(1,1);
        ivec2 pixel=clamp(ivec2(frag)+direction*radius,ivec2(0),textureSize(uSrc,0)-1);
        vec2 material=printedSurfaceTexel(pixel);
        if(abs(material.x-printed.x)<.5&&material.y<.001){
          vec4 stockSample=texelFetch(uSrc,pixel,0);
          if(abs(stockSample.a-srcFull.a)<.003){
            float weight=1.0/length(vec2(direction));
            stockSum+=luma(stockSample.rgb)*weight;stockWeight+=weight;
          }
        }
        if(axis==7&&stockWeight>0.0)break;
      }
      if(stockWeight>0.0)printLumaEndpoints.x=stockSum/stockWeight;
    }
    pigmentEdge=smoothstep(.025,.30,pigmentEdge)*(1.0-smoothstep(.003,.014,depthEdge));
  }
  float pigmentFootprint=pigmentEdge;
  if(solidPigment>.5){
    vec2 tap=texel*cell*.45;
    float pigment=max(printed.y,max(max(
      printedPigmentFootprint(cellUv+vec2(tap.x,0.0),printed.x,packedDepth),
      printedPigmentFootprint(cellUv-vec2(tap.x,0.0),printed.x,packedDepth)),max(
      printedPigmentFootprint(cellUv+vec2(0.0,tap.y),printed.x,packedDepth),
      printedPigmentFootprint(cellUv-vec2(0.0,tap.y),printed.x,packedDepth))));
    pigmentFootprint=max(pigmentFootprint,smoothstep(.001,.07,pigment)*(1.0-smoothstep(.003,.014,depthEdge)));
  }
  float printedCrease=step(.5,abs(uPrintedSurfaceMode-2.0))*step(.5,uPrintedSurfaceMode)*pigmentFootprint;
  float edge = clamp((lumaEdge * 2.8 + depthEdge * 1.7) * uEdgeGain, 0.0, 1.0);
  float quietMetalEdge=max(quietMetal,roofSurface);
  if(edge>.08){
    vec2 quietTap=texel*cell*.45;
    quietMetalEdge=max(quietMetalEdge,max(quietMetalFootprint(cellUv),max(max(
      quietMetalFootprint(cellUv+vec2(quietTap.x,0.0)),
      quietMetalFootprint(cellUv-vec2(quietTap.x,0.0))),max(
      quietMetalFootprint(cellUv+vec2(0.0,quietTap.y)),
      quietMetalFootprint(cellUv-vec2(0.0,quietTap.y))))));
  }
  // The extra mark taps matter only where the display would draw a contour.
  float apparitionZone=edge>.08?apparitionSoftZone(fullUv,texel,markSample.a):0.0;

  float motion = 1.0 - uReduceMotion;
  float n = hash21(cellId);
  float band = sin(cellId.x * 0.073 + cellId.y * 0.021) * 0.5 + 0.5;
  float eventSignal = clamp(uAudio * 0.30 + uFear * 0.28 + n * 0.07 + band * 0.06, 0.0, 1.0);
  eventSignal = max(eventSignal, clamp(uForceSignal, 0.0, 1.0) * (0.84 + n * 0.16));
  eventSignal = min(eventSignal, mix(1.0, 0.62, uReduceFlash));

  // Bright material and structural discontinuities excite the tube. Global
  // story pressure changes gain, but generated-material strength never does.
  // The 0.48 ceiling and the calm 0.58 multiplier below used to stop the tube
  // blowing out. The levels curve owns that job now, so the material is allowed
  // to reach the top of the range and the picture can contain white.
  float materialSignal = tone;
  float excitation = clamp(max(edge, materialSignal) * (0.58 + eventSignal * 0.72)
    + eventSignal * 0.16, 0.0, 1.0);
  // A boiling world excites the tube. Surfaces that are churning glow rather
  // than merely changing colour, so the crawl reads on a display this coarse.
  excitation = clamp(excitation + uAgitation * materialSignal * 0.5, 0.0, 1.0);
  excitation *= uSignalAmount;

  float prev = texture(uPrev, cellUv).a;
  prev *= mix(1.0, 0.68, clamp(uMovement, 0.0, 1.0));
  float safeDt = clamp(uDt, 0.0, 0.25);
  float attack = 1.0 - exp(-safeDt * 14.0);
  float life = max(0.016, (uPersistenceMs * mix(1.0, 0.35, uReduceMotion)) / 1000.0);
  float decay = exp(-safeDt * 0.69314718056 / life);
  float mem = excitation >= prev ? mix(prev, excitation, attack) : prev * decay;
  float signalLevel = max(excitation, mem * 0.76);

  // The world first crosses the recorder's threshold, then excites the tube.
  // Ordered structure protects architectural lines; organic, phase-held noise
  // gives tonal fields the uneven stipple of a captured image. Crucially this
  // perturbs selection, not the final frame as a full-screen static overlay.
  float acquisitionClock = recordingClock(0.0, uRecordingTemporalHz, uReduceMotion);
  float ordered = bayer4(ivec2(cellId));
  float organic = recordingNoise(
    cellId,
    acquisitionClock,
    uRecordingScenePinning,
    uRecordingTemporalSmear
  );
  // Blue noise carries the tonal fields; the ordered matrix is kept where the
  // scene has a hard edge, because the shader's own note is right that ordered
  // structure is what keeps architectural lines coherent. The organic term still rides
  // on top as the acquisition's own unevenness.
  // The screen decides the shape of a mark; the ordered matrix is still kept at
  // hard edges, because the note above is right that ordered structure is what
  // holds an architectural line together, and a hatch running along a wall does
  // nothing for the wall's corner.
  float screenMask = screenThreshold(plateFrag, screenDir, clamp(y, 0.0, 1.0),
    hash21(cellId * 0.317), blueNoise(cellId));
  float maskThreshold = mix(screenMask, ordered, clamp(edge, 0.0, 1.0));
  float threshold = mix(
    maskThreshold,
    organic,
    clamp(uRecordingIrregularity, 0.0, 1.0) * 0.5
  );
  float midtone =
    smoothstep(0.08, 0.45, y) *
    (1.0 - smoothstep(0.72, 0.98, y));
  float sceneSignal = clamp(smoothstep(0.012, 0.080, y) + edge * 0.65, 0.0, 1.0);
  float flashSafe = mix(1.0, 0.42, clamp(uReduceFlash, 0.0, 1.0));
  float pressureGain =
    1.0 +
    clamp(uFear, 0.0, 1.0) * uRecordingFearGain +
    clamp(uAudio, 0.0, 1.0) * uRecordingAudioGain;
  pressureGain = mix(pressureGain, min(pressureGain, 1.15), clamp(uReduceFlash, 0.0, 1.0));
  float instability =
    (organic - 0.5) *
    clamp(uRecordingThresholdNoise, 0.0, 0.20) *
    flashSafe *
    pressureGain *
    sceneSignal *
    (0.30 + 0.50 * midtone + 0.20 * edge);
  float recordedSignal = clamp(signalLevel + instability, 0.0, 1.25);

  // THE HALFTONE. A cell is on when the toned luminance beats the mask at that
  // cell — that is the whole picture, and it is what gives solid blacks, solid
  // whites and a dithered middle. uCoverage biases the exposure rather than
  // gating the signal out of existence.
  //
  // IT USED TO GATE IT OUT OF EXISTENCE. As a straight addition, a coverage
  // under 0.5 subtracts a CONSTANT — and a constant subtraction is a hard floor.
  // calm (coverage .20) took 0.105 off every fragment, so nothing below y=0.037
  // could ever select a cell; the get-in's walls sit at ambient .028 and were
  // arithmetically incapable of a halftone. Measured: ~90% pure black, ~10% pure
  // white, every intermediate bucket empty. Sparse dust, exactly as the levels()
  // comment above warns.
  //
  // So the bias compresses toward the ends instead of translating through them.
  // Negative scales toward black and positive lifts toward white, both
  // proportionally, so a dim room keeps its ordering and its texture and neither
  // end can push a fragment past the limit it is heading for.
  float coverageBias = (clamp(uCoverage, 0.0, 1.0) - 0.5) * 0.35;
  float exposure = coverageBias >= 0.0
    ? tone + coverageBias * (1.0 - tone)
    : tone * (1.0 + coverageBias * 2.0);
  // The tube lifts it: excitation and phosphor memory push cells on early, so
  // fear, audio and a boiling surface still read, and persistence still smears.
  float lift = clamp(recordedSignal, 0.0, 1.25) * 0.45;
  float selected = step(threshold, clamp(exposure + lift, 0.0, 1.0));

  vec2 local = fract(plateFrag / cell) - 0.5;
  vec2 apertureScale = vec2(0.94, mix(0.62, 0.88, clamp(uAperture, 0.0, 1.0)));
  float aperture = 1.0 - smoothstep(0.39, 0.54, length(local / apertureScale));
  float phosphorMask = selected * aperture;

  // A restrained tonal plate still gives the instrument a voice, but it no
  // longer turns the world into coarse 8-bit blocks. Generated material and
  // PBR determine the sampled value and edges; the fine acquisition stipple
  // above owns the visible recording texture.
  vec3 paletted = palWorldDark();
  if(y > 0.56 || (edge > 0.60 && y > 0.18)) {
    paletted = mix(palWorldMauve(), palCream(), clamp(y, 0.0, 1.0));
  } else if(y > 0.20) {
    paletted = mix(palWorldDark(), palWorldMid(), clamp(y * 1.5, 0.0, 1.0));
  } else {
    // THE BOTTOM BUCKET IS WHERE AUTHORED LIGHT LIVES, and it used to crush it.
    // Everything under y=0.20 was compressed into palGlass..palWorldDark, an
    // output span of roughly 0.015..0.07 luma — so a dim practical, which is the
    // whole vocabulary of a building with no mains, could be computed correctly by
    // the raymarcher and still be invisible here.
    //
    // uShadowLift opens that span up. It is shaped by y itself, so an unlit
    // sealed room stays black (nothing to lift) and only light that is actually
    // there comes up — and the bucket's ceiling rises toward palWorldMid, because
    // a ceiling of palWorldDark is still nearly nothing.
    float t = clamp(y * 2.0 + edge * 0.25, 0.0, 1.0);
    float lift = clamp(uShadowLift, 0.0, 1.0) * smoothstep(0.010, 0.160, y);
    t = clamp(t + lift * 0.85, 0.0, 1.0);
    paletted = mix(palGlass(), mix(palWorldDark(), palWorldMid(), lift * 0.65), t);
  }

  vec3 phosphor = mix(palCyanDim(), palCyan(), smoothstep(0.28, 0.82, signalLevel));
  phosphor = mix(phosphor, palCyanHot(), smoothstep(0.82, 1.18, signalLevel));
  float faultSignal = mix(recordedSignal, signalLevel, clamp(uReduceFlash, 0.0, 1.0));
  float fault = step(0.965, faultSignal) * step(0.90, threshold) * uAmberAmount * (1.0-uReduceFlash);
  phosphor = mix(phosphor, palAmber(), fault);

  float replaceAmount = (1.0 - clamp(uBaseRetention, 0.0, 1.0)) * phosphorMask;
  // The block palette is the instrument's voice and it stays. But a palette
  // that quantises by luminance alone throws away everything the generated
  // material said in colour. Let the scene's own chroma bend the block it
  // lands in: the boil survives the encode without leaving the palette.
  vec3 sceneChroma = c - vec3(dot(c, vec3(0.2126, 0.7152, 0.0722)));
  paletted = clamp(paletted + sceneChroma * clamp(uPaletteChroma, 0.0, 0.6), 0.0, 1.0);
  vec3 encodedScene = mix(c, paletted, clamp(uPaletteAmount, 0.0, 1.0));
  vec3 finalColor = mix(encodedScene, phosphor, replaceAmount);

  // ── TWO-TONE ───────────────────────────────────────────────────────────────
  //
  // THE HALFTONE HAS TO BE THE IMAGE. Everything above composites phosphor dots
  // over a scene that is 78-94% raw PBR (uPaletteAmount runs 0.06..0.22), which
  // is why a one-bit look was arithmetically unreachable no matter how good the
  // threshold got: the dither was an overlay on a colour render, not the render.
  //
  // An engraving is two colours and a mask deciding between them. That is this:
  // the ink pair comes from the palette that already exists, selected is the
  // halftone built from levels + blue noise above, and the tube still speaks —
  // excited cells take phosphor, faults take amber, so fear, audio, persistence
  // and the boil all survive into a two-tone frame.
  //
  // uToneAmount is the commitment. At 0 this is exactly the composite that
  // shipped; at 1 it is the engraving. Authored per look profile so the choice
  // stays visible rather than buried in a shader.
  vec3 inkDarkTone = palWorldDark();
  vec3 inkLightTone = mix(palWorldMid(), palCream(), clamp(tone, 0.0, 1.0));
  vec3 engraved = mix(inkDarkTone, inkLightTone, selected);
  engraved = mix(engraved, phosphor, replaceAmount);
  engraved = mix(engraved, palAmber(), fault);
  // The scene's own chroma is allowed to bend the ink, so a boiling material is
  // not flattened into pure monochrome and the generated colour still reads.
  engraved = clamp(engraved + sceneChroma * clamp(uPaletteChroma, 0.0, 0.6) * 0.5, 0.0, 1.0);
  finalColor = mix(finalColor, engraved, clamp(uToneAmount, 0.0, 1.0));
  // THE LINE PASS. In every reference for this look, geometry is carried by
  // crisp UNDITHERED contours and the dithered field only carries tone. That
  // division is most of what separates an engraving from static: once the lines
  // hold the structure, the fields are free to go quiet.
  //
  // Undithered on purpose. It is drawn from the same luma+depth discontinuity
  // the threshold already uses, so it lands exactly on the silhouettes, and it
  // picks black or white by what it sits on so a contour never disappears into
  // the tone behind it.
  // The lit apparition is depth-tested but should never acquire the display's
  // generic crisp cream contour; the room and every other prop keep it.
  float line=smoothstep(.30,.72,edge)*clamp(uLineAmount,0.0,1.0)*(1.0-apparitionZone)*(1.0-quietMetalEdge)*(1.0-printedCrease);
  vec3 inkDark = palWorldDark();
  vec3 inkLight = palCream();
  finalColor = mix(finalColor, tone > 0.5 ? inkDark : inkLight, line);

  float glow = (mem * 0.70 + edge * 0.30) * uGlowAmount * (1.0-uReduceFlash*0.68) * mix(1.0,0.78,uMovement)*(1.0-quietMetalEdge);
  finalColor += palCyan() * glow * (0.22 + phosphorMask * 0.78);

  // The underlying PBR light is the form model. Neighbouring luminance gives
  // us a broad exposure volume; the centre sample restores just enough actual
  // material relief for boards, brick and cloth to remain distinct.
  float sourceLuma = luma(c);
  float neighbourLuma = 0.25 * (
    luma(sx0.rgb) + luma(sx1.rgb) + luma(sy0.rgb) + luma(sy1.rgb)
  );
  float broadForm = mix(neighbourLuma, sourceLuma, 0.71);
  // A baked letter is already filtered in its physical UVs. Sampling its lit
  // centre preserves a narrow stem instead of borrowing the opposite ground.
  // The same exposure, black floor, hatch, two inks and depth still apply.
  broadForm=mix(broadForm,sourceLuma,printedSampling);
  // Expose the captured form before the one-bit decision, rather than making
  // its selected ink brighter. Keep the raw-light gate below: black geometry
  // remains black, and the room still has only its existing two ink values.
  float captureExposure = clamp(uRecordingExposure, 1.0, 12.0);
  float materialRelief = clamp((sourceLuma - neighbourLuma) * 1.35 * captureExposure, -0.10, 0.10);
  materialRelief*=1.0-max(printedSampling*pigmentEdge,solidPigment*step(.001,printed.y));
  // Low-light acquisition measures the sensor floor in the same input units
  // as exposure. Exact zero remains unrecorded; faint real material can pass.
  float sensitivity = clamp(uRecordingSensitivity, 1.0, 12.0);
  float blackFloor = clamp(uRecordingBlackFloor, 0.0, 0.08) / sensitivity;
  float exposed = clamp((broadForm - blackFloor) * captureExposure / max(0.001, 1.0 - blackFloor), 0.0, 1.0);
  float formTone = pow(exposed, clamp(uRecordingDensityGamma, 0.45, 1.5));
  formTone = clamp(formTone + materialRelief, 0.0, 1.0);
  vec2 printEndpointTone=vec2(0.0);
  float printEndpointsReady=0.0;
  if(printCoverageSpan>printSpanMinimum){
    vec2 endpointSignal=max(printLumaEndpoints-vec2(blackFloor),vec2(0.0));
    float brightSignal=max(endpointSignal.x,endpointSignal.y);
    float brightExposure=clamp(brightSignal*captureExposure/max(.001,1.0-blackFloor),0.0,1.0);
    float densityGamma=clamp(uRecordingDensityGamma,.45,1.5);
    // Once the lit stock reaches the sensor ceiling, preserve its measured
    // contrast with the pigment instead of giving each mixture its own gain.
    // The brighter endpoint still earns its tone from actual illumination;
    // no light produces no endpoint signal, for either print polarity.
    vec2 endpointTone=pow(endpointSignal/max(.000001,brightSignal),vec2(densityGamma))*pow(brightExposure,densityGamma);
    printEndpointTone=vec2(endpointTone.x,absorptivePigmentTone(endpointTone.y,printed.x));
    // Reversed lettering has an absorptive ground rather than dark pigment.
    // Give measured black enamel the same coherent shadow range as black
    // paint. The matching highlight shoulder protects lit reversed pigment;
    // both still earn their signal from actual light and use the final screen.
    if(uPrintedSurfaceMode<3.5&&printed.x>1.5){
      printEndpointTone.x=clamp((endpointTone.x-.25)/.75,0.0,1.0);
      // Reserve the matching coherent highlight range for reversed pigment.
      // Real low illumination still screens and exact darkness stays dark.
      printEndpointTone.y=clamp(endpointTone.y/.75,0.0,1.0);
    }
    printEndpointsReady=1.0;
    float printedTone=mix(endpointTone.x,endpointTone.y,printed.y);
    float confidence=smoothstep(.08,.24,printCoverageSpan)*(1.0-smoothstep(.003,.014,depthEdge));
    formTone=mix(formTone,printedTone,confidence*printedSampling);
  }
  if(solidPigment>.5&&printed.y>=.5&&printEndpointsReady<.5)
    formTone=absorptivePigmentTone(formTone,printed.x);
  if(solidPigment>.5&&uPrintedSurfaceMode<3.5&&printed.x>1.5&&printed.y<.5&&printEndpointsReady<.5)
    formTone=clamp((formTone-.25)/.75,0.0,1.0);
  if(solidPigment>.5&&uPrintedSurfaceMode<3.5&&printed.x>1.5&&printed.y>=.5&&printEndpointsReady<.5)
    formTone=clamp(formTone/.75,0.0,1.0);
  float captureBlackProtect = smoothstep(blackFloor, blackFloor + 0.024 / sensitivity, sourceLuma);
  float hasCapturedLight = step(0.18, captureBlackProtect);

  // Resolve only the middle of the light volume into irregular stipple. Deep
  // shadow and strong light become coherent shapes, as in a one-bit engraving,
  // instead of carrying a procedural pattern across every visible surface.
  float halfTone = smoothstep(0.14, 0.76, formTone);
  // The stipple is the stochastic screen; a hatch replaces it outright rather
  // than modulating it, because a stroke crossed with a dot field reads as
  // neither. Density still shifts the threshold either way, so a louder bank
  // still earns its extra marks.
  float stippleThreshold = formStipple(pinMetres, uRecordingIrregularity, markDensity, markGrain);
  if(gScreenKind != 0){
    float hatched = screenThreshold(plateFrag, screenDir, halfTone,
      recordingHash3(floor(pinMetres * 3.1)), stippleThreshold);
    stippleThreshold = clamp(hatched - (markDensity - 0.22) * uMarkDensityGain, 0.0, 1.0);
  }
  float captureBit = step(stippleThreshold, halfTone) * hasCapturedLight;
  captureBit = max(captureBit, step(0.82, formTone) * hasCapturedLight);
  if(solidPigment>.5&&printEndpointsReady>.5){
    // Coverage is area, not another material luminance. Curve and screen the
    // two measured, lit materials first; then resolve their covered areas.
    // Curving their mixture twice erased narrow stems into a white centre.
    vec2 endpointHalfTone=smoothstep(vec2(.14),vec2(.76),printEndpointTone);
    vec2 endpointThreshold=vec2(stippleThreshold);
    if(gScreenKind!=0){
      float jitter=recordingHash3(floor(pinMetres*3.1));
      endpointThreshold=vec2(
        screenThreshold(plateFrag,screenDir,endpointHalfTone.x,jitter,stippleThreshold),
        screenThreshold(plateFrag,screenDir,endpointHalfTone.y,jitter,stippleThreshold));
      endpointThreshold=clamp(endpointThreshold-vec2((markDensity-.22)*uMarkDensityGain),0.0,1.0);
    }
    vec2 endpointBit=max(step(endpointThreshold,endpointHalfTone),step(vec2(.82),printEndpointTone))*hasCapturedLight;
    // Resolve the geometric edge once. A second coverage stipple perforated
    // two-pixel stems, although each material already has the final light
    // screen above. Paint interiors and counters choose one material; their
    // actual illumination still passes through the same dither.
    float pigmentSample=step(.5,printed.y);
    if(areaPaper>.5){
      // A downsampled document texel records occupied ink area, not the
      // geometric edge of a large painted letter. Keep its measured RGB and
      // coverage untouched and resolve that fraction with this same screen.
      // Manufacturing area is linear: the light screen's density curve and
      // extra highlight hatch directions must not curve the area a second time.
      float areaThreshold=stippleThreshold;
      if(gScreenKind!=0){
        float jitter=recordingHash3(floor(pinMetres*3.1));
        areaThreshold=strokeDistance(plateFrag,rotateDir(screenDir,uScreenAngles.x),uScreenPeriodPx,(jitter-.5)*uScreenJitter);
      }
      pigmentSample=printedAreaPigmentSample(printed.y,areaThreshold);
    }
    captureBit=mix(endpointBit.x,endpointBit.y,pigmentSample);
  }

  // Geometry and illumination provide the drawing. Silhouettes emerge as fine
  // light contours in darkness; recesses and material creases cut back into
  // already-lit masses. This restores volume without inventing surface print.
  float silhouette = smoothstep(0.020, 0.105, depthEdge * uEdgeGain);
  float crease = smoothstep(0.035, 0.155, lumaEdge * uEdgeGain);
  float darkSide = 1.0 - smoothstep(0.30, 0.52, neighbourLuma);
  float lightSide = smoothstep(0.34, 0.64, neighbourLuma);
  float brightContour = step(0.42, silhouette * darkSide) * hasCapturedLight * (1.0-apparitionZone)
    *(1.0-quietMetalEdge*(1.0-quietMetal));
  float darkCrease = step(0.52, crease * lightSide);
  darkCrease*=1.0-printedCrease;
  captureBit = max(captureBit, brightContour);
  captureBit *= 1.0 - darkCrease;

  // Colour is a property of the light ink, never a third tonal value. Sample a
  // broad neighbourhood so hue belongs to the form rather than individual
  // dither grains, then renormalise luminance so colour cannot flatten the
  // binary lighting or change which marks are present.
  vec3 broadColor = 0.20 * (c + sx0.rgb + sx1.rgb + sy0.rgb + sy1.rgb);
  float broadColorLuma = max(0.02, luma(broadColor));
  // The same reservation the lighting pass applies (see reserveEmergencyRed in
  // r3d.js), stated in the same units so the two cannot disagree. The old ratio
  // floor of 1.8 admitted plain sodium — [1,.52,.18] measures 1.92 — so the
  // recorder promoted every yard lamp and warm wall to the emergency primary.
  // Upstream the circuit is now the only thing that can be this red at all;
  // this keeps the acquisition honest if that ever stops being true.
  float emergencyRedness=emergencyRedDominance(broadColor);
  float emergencyRed=smoothstep(.025,.14,broadColor.r-max(broadColor.g,broadColor.b))
    // Upstream lighting has already neutralised unbacked red. Require the near-
    // primary purity of the authored wash here as a second lock; warm surfaces,
    // source faults and emissive props cannot reserve this display colour.
    *smoothstep(.82,.94,emergencyRedness)
    *captureBlackProtect;
  vec3 sourceChroma = clamp(
    (broadColor - vec3(broadColorLuma)) / max(0.06, broadColorLuma),
    vec3(-0.55),
    vec3(0.55)
  );
  float chromaRange = max(max(broadColor.r, broadColor.g), broadColor.b)
    - min(min(broadColor.r, broadColor.g), broadColor.b);
  float chromaPresence = smoothstep(0.025, 0.16, chromaRange) * captureBlackProtect;
  vec3 captureDark = vec3(0.0015, 0.0050, 0.0045);
  vec3 neutralLightInk = vec3(0.835, 0.945, 0.885);
  float inkChroma = (0.160 + clamp(uPaletteChroma, 0.0, 0.60) * 0.36) * chromaPresence;
  vec3 captureLight = clamp(neutralLightInk + sourceChroma * inkChroma, 0.62, 1.0);
  captureLight *= luma(neutralLightInk) / max(0.001, luma(captureLight));
  captureLight = clamp(captureLight, 0.0, 1.0);
  // One authored source is allowed to keep its literal colour. Emergency red
  // is itself the event; translating it to the tube's default cyan/cream ink
  // erased the state change and made a correct raw frame look unlit in game.
  // Apply it only to selected light ink. Shadow/unselected marks remain black.
  captureLight=mix(captureLight,vec3(.98,.018,.008),emergencyRed);
  // Charcoal iron has its own dim light ink. It keeps the same acquisition
  // mask and real lighting response; a near bar cannot rival a room window.
  vec3 quietMetalInk=vec3(.135,.170,.175);
  captureLight=mix(captureLight,quietMetalInk,quietMetal);
  vec3 roofSurfaceInk=vec3(.300,.355,.365);
  captureLight=mix(captureLight,roofSurfaceInk,roofSurface);
  captureLight=mix(captureLight,vec3(.55,.66,.69),roofGlass);
  // Contours only: the cab keeps its outlines and what is actually lit (dials,
  // a lamp, the radio window) and drops its tone screen. The world's line pass
  // reads depth normalised to the far plane, which is nearly flat across a cab
  // a metre away; the cab draws its own: the relative second difference of
  // view depth, zero on a flat panel, strong at a silhouette or a crease.
  if(inCab > 0.5 && uCabinScreen > 1.5){
    vec2 tx = 1.0 / uRes;
    float dC = cabViewDepth(packedDepth);
    float dX = cabViewDepth(texture(uDepth, fullUv - vec2(tx.x, 0.0)).a) + cabViewDepth(texture(uDepth, fullUv + vec2(tx.x, 0.0)).a);
    float dY = cabViewDepth(texture(uDepth, fullUv - vec2(0.0, tx.y)).a) + cabViewDepth(texture(uDepth, fullUv + vec2(0.0, tx.y)).a);
    float crease = (abs(dX - 2.0 * dC) + abs(dY - 2.0 * dC)) / max(dC, 0.05);
    captureBit = max(step(0.82, formTone) * hasCapturedLight, max(step(0.35, line), step(0.035, crease)));
  }
  vec3 oneBitScene = mix(captureDark, captureLight, captureBit);
  finalColor = mix(finalColor, oneBitScene, clamp(uRecordingCaptureMix, 0.0, 1.0));
  // Still engraved glass, with enough of its real wet reflection and the
  // descending atrium left to distinguish the supported pane from black zinc.
  finalColor=mix(finalColor,clamp(c*1.35,0.0,1.0),roofGlass*.38);
  // Broad rain-dark zinc and lead planes need a little of their acquired
  // shade too. This retains weathering between the dim engraved marks rather
  // than turning the roof back into a flat black field under a bright sky.
  finalColor=mix(finalColor,clamp(c*1.65,0.0,1.0),roofSurface*.38);
  // From the occupied roof the actual neighbouring frontages are much nearer
  // than the sky, yet still far enough to be below the parapet. Their dark
  // brick planes and sparse lit rooms disappear into one black hatch if they
  // use the same capture as the glass a few metres from the eye. Recover a
  // little of that *real scene* only in the 25-80 m depth band. The nearer
  // parapet, roof, seated glass and Ren keep their full one-bit engraving; the
  // far authored skyline has its own sentinel recovery immediately below.
  float roofNeighbourDepth = smoothstep(uRoofSkyPackedFar + 0.008,
                                        uRoofSkyPackedFar + 0.026, packedDepth)
                           * (1.0 - smoothstep(0.20, 0.25, packedDepth));
  float roofNeighbourMix = roofNeighbourDepth * clamp(uRoofSkyRecovery, 0.0, 1.0) * 0.58;
  finalColor = mix(finalColor, clamp(c * 1.42, 0.0, 1.0), roofNeighbourMix);
  // The source night sky already contains the moon, lit windows and roofline,
  // but one-bit hatching turns that distant detail into a continuous field.
  // The march leaves its far-plane sentinel in depth; foreground props replace
  // that depth, so the supported glass, parapet and Ren stay fully engraved.
  float farSky = 1.0 - smoothstep(uRoofSkyPackedFar + 0.0005,
                                 uRoofSkyPackedFar + 0.0020, packedDepth);
  finalColor = mix(finalColor, c, farSky * clamp(uRoofSkyRecovery, 0.0, 1.0));

  // The lit figure's world pass has already feathered its real depth-tested
  // silhouette. The one-bit threshold can crush that gradient into flat black.
  // Only the transition band borrows back a little of the scene's dark red:
  // the centre stays black, the room keeps its dither, and the boundary reads
  // as a fading negative shape rather than a newly drawn outline.
  float apparitionInk=apparitionCoverage(markSample.a);
  float apparitionFringe=pow(max(0.0,4.0*apparitionInk*(1.0-apparitionInk)),.8);
  finalColor=mix(finalColor,min(c*.55,vec3(.22,.055,.055)),apparitionFringe*.55);
  float apparitionAbsorb=pow(apparitionInk,.65)*.22;
  finalColor*=1.0-apparitionAbsorb;

  // Reconstruct the cover compositor after acquisition. The transport keys
  // carry a full negative body and its finite SDF aura across the one-bit
  // recorder. They are never display colours.
  if(uHushBodyPost.y>.5&&uHushBodyPost.x>.001){
    float body=hushCoreKey(srcFull.rgb)*uHushBodyPost.z*uHushBodyPost.x;
    float authoredAura=hushGlowKey(srcFull.rgb)*uHushBodyPost.w*uHushBodyPost.x;
    // Two restrained radii spread the absence into the surrounding exposure.
    // They never sample the billboard bounds or create a luminous outline.
    vec2 nearPx=vec2(2.25)/uRes;
    vec2 farPx=vec2(5.25)/uRes;
    float nearby=max(
      max(hushCoreKey(texture(uSrc,clamp(fullUv+vec2(nearPx.x,0.0),vec2(.001),vec2(.999))).rgb),
          hushCoreKey(texture(uSrc,clamp(fullUv-vec2(nearPx.x,0.0),vec2(.001),vec2(.999))).rgb)),
      max(hushCoreKey(texture(uSrc,clamp(fullUv+vec2(0.0,nearPx.y),vec2(.001),vec2(.999))).rgb),
          hushCoreKey(texture(uSrc,clamp(fullUv-vec2(0.0,nearPx.y),vec2(.001),vec2(.999))).rgb))
    );
    float distant=max(
      max(hushCoreKey(texture(uSrc,clamp(fullUv+vec2(farPx.x,farPx.y),vec2(.001),vec2(.999))).rgb),
          hushCoreKey(texture(uSrc,clamp(fullUv-vec2(farPx.x,farPx.y),vec2(.001),vec2(.999))).rgb)),
      max(hushCoreKey(texture(uSrc,clamp(fullUv+vec2(farPx.x,-farPx.y),vec2(.001),vec2(.999))).rgb),
          hushCoreKey(texture(uSrc,clamp(fullUv+vec2(-farPx.x,farPx.y),vec2(.001),vec2(.999))).rgb))
    );
    nearby*=uHushBodyPost.w*uHushBodyPost.x;
    distant*=uHushBodyPost.w*uHushBodyPost.x;
    body=smoothstep(.018,.26,body);
    float fieldAbsorb=clamp(authoredAura*.48+nearby*.18+distant*.085,0.0,.72);
    // It is a mass of shadow: first swallow the exposure around it, then make
    // the authored human interior almost entirely absent. A small amount of
    // the underlying image survives so the form feels volumetric, not cut out.
    finalColor*=1.0-fieldAbsorb;
    vec3 swallowed=min(finalColor*.045,vec3(.006,.014,.016));
    finalColor=mix(finalColor,swallowed,body*.96);
    // The cover's glow is the contrast fringe of that absence. Screen and
    // Color Dodge are retained in their PSD order, but at low energy: a dim
    // blue-grey haze around a negative person, never a white emissive sprite.
    float negativeRim=clamp(authoredAura*.34+nearby*(1.0-body)*.12,0.0,.46);
    finalColor=hushScreen(finalColor,vec3(.060,.125,.135)*negativeRim);
    vec3 dodged=hushColorDodge(finalColor,vec3(.028,.070,.078)*negativeRim);
    finalColor=mix(finalColor,dodged,negativeRim*.22);
  }

  // Other display profiles may retain phosphor or raw colour. Keep this
  // material's upper ink bound there too, without touching background pixels.
  finalColor=mix(finalColor,min(finalColor,quietMetalInk),quietMetal);
  finalColor=mix(finalColor,min(finalColor,roofSurfaceInk),roofSurface);

#ifdef SOURCE_DESKTOP_TRANSPARENT
  if(uSourcePressureFinish>.5){
    // Only the desktop Pressure view opts into literal black/white material.
    // Its unlit skin and skinned white hulls supply neutral source RGB; the
    // existing acquisition still decides the pattern and separate coverage.
    vec3 raw=texture(uSourceCoverage,fullUv).rgb/max(sourceCoverage,.000001);
    float hi=max(raw.r,max(raw.g,raw.b)),lo=min(raw.r,min(raw.g,raw.b));
    float neutral=1.0-step(.0001,hi-lo);
    finalColor=pressureRecordedInk(finalColor,vec2(neutral*(1.0-step(.000001,hi)),neutral));
  }
#else
  if(uRecordedPressureInkReady>.5)finalColor=pressureRecordedInk(finalColor,texture(uRecordedPressureInk,fullUv).rg);
#endif

  if(uDebugSource == 1.0) finalColor = c;
  if(uDebugSource == 2.0) finalColor = vec3(signalLevel);
  if(uDebugSource == 3.0) finalColor = vec3(mem);
  if(uDebugSource == 4.0) finalColor = vec3(edge);
  if(uDebugSource == 5.0) finalColor = vec3(phosphorMask);
  if(uDebugSource == 6.0) finalColor = vec3(stippleThreshold);
  if(uDebugSource == 7.0) finalColor = vec3(recordedSignal);
  if(uDebugSource == 8.0) finalColor = vec3(instability * 4.0 + 0.5);

#ifdef SOURCE_DESKTOP_TRANSPARENT
  // The WebView surface expects premultiplied display colour. Excitation must
  // never become native-window opacity or fill the surrounding desktop.
  o = vec4(finalColor*sourceCoverage,sourceCoverage);
#else
  o = vec4(finalColor, clamp(mem, 0.0, 1.0));
#endif
}
`;
