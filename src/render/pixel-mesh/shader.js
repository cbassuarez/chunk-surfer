// Selective VFD compositor. The full-resolution scene remains authoritative;
// cell-centre samples only decide where phosphor is excited. The previous pass'
// alpha stores excitation memory, never scene colour or depth.
export const PIXEL_MESH_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform sampler2D uDepth;
uniform sampler2D uPrev;
uniform vec2 uRes;
uniform vec3 uCam;
uniform float uYaw;
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
out vec4 o;

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
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

vec3 cameraRay(vec2 frag){
  vec2 uv = (frag / uRes) * 2.0 - 1.0;
  uv.x *= uRes.x / uRes.y;
  float cy = cos(uYaw), sy = sin(uYaw);
  vec3 fwd = normalize(vec3(sy, uPitch, -cy));
  vec3 rgt = normalize(vec3(cy, 0.0, sy));
  vec3 up = normalize(cross(rgt, fwd));
  return normalize(fwd + uv.x * rgt * 0.95 + uv.y * up * 0.95);
}

vec3 reconstructWorldMetres(vec2 frag, float packedDepth){
  vec3 rd = cameraRay(frag);
  float cy = cos(uYaw), sy = sin(uYaw);
  vec3 fwd = normalize(vec3(sy, uPitch, -cy));
  float safeDepth = max(packedDepth, 1.0 / 256.0);
  float viewDepth = max(0.0, (1.0 / safeDepth - 1.0) / 0.14);
  float gridDistance = viewDepth / max(0.001, uCellMeters * dot(rd, fwd));
  return (uCam + rd * gridDistance) * uCellMeters;
}

float formStipple(vec3 worldMetres, float irregularity){
  // Aperiodic samples are pinned to the surface, but they are only consulted
  // in the narrow half-tone region below. There is no material-wide dot,
  // hatch or Bayer screen to turn plaster and boards into diamond plate. A 3D
  // world key avoids choosing an XY/XZ/YZ projection from a reconstructed
  // normal, which used to flip at grazing angles as the player turned.
  float scale = max(12.0, uRecordingPatternScale);
  vec3 finePosition = worldMetres * scale;
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
  return mix(fine, mix(fine, broad, 0.22), clamp(irregularity, 0.0, 1.0));
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
vec3 palCyan(){ return vec3(0.380, 1.000, 0.900); }
vec3 palCyanHot(){ return vec3(0.780, 1.000, 0.960); }
vec3 palCyanDim(){ return vec3(0.060, 0.480, 0.440); }
vec3 palAmber(){ return vec3(1.000, 0.610, 0.180); }
vec3 palGlass(){ return vec3(0.006, 0.020, 0.018); }
vec3 palWorldDark(){ return vec3(0.020, 0.080, 0.105); }
vec3 palWorldMid(){ return vec3(0.250, 0.305, 0.365); }
vec3 palWorldMauve(){ return vec3(0.520, 0.390, 0.455); }
vec3 palCream(){ return vec3(1.000, 0.820, 0.560); }

void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 fullUv = clamp(frag / uRes, vec2(0.001), vec2(0.999));
  float cell = max(1.0, uCellPx);
  vec2 cellId = floor(frag / cell);
  vec2 cellCenter = (cellId + 0.5) * cell;
  vec2 cellUv = clamp(cellCenter / uRes, vec2(0.001), vec2(0.999));

  vec4 srcFull = texture(uSrc, fullUv);
  vec4 srcCell = texture(uSrc, cellUv);
  vec3 c = srcFull.rgb;
  float y = luma(srcCell.rgb);

  vec2 texel = 1.0 / uRes;
  vec4 sx0 = texture(uSrc, cellUv - vec2(texel.x * cell * 0.45, 0.0));
  vec4 sx1 = texture(uSrc, cellUv + vec2(texel.x * cell * 0.45, 0.0));
  vec4 sy0 = texture(uSrc, cellUv - vec2(0.0, texel.y * cell * 0.45));
  vec4 sy1 = texture(uSrc, cellUv + vec2(0.0, texel.y * cell * 0.45));
  float lumaEdge = abs(luma(sx1.rgb)-luma(sx0.rgb)) + abs(luma(sy1.rgb)-luma(sy0.rgb));
  float depthEdge = abs(sx1.a-sx0.a) + abs(sy1.a-sy0.a);
  float edge = clamp((lumaEdge * 2.8 + depthEdge * 1.7) * uEdgeGain, 0.0, 1.0);

  float motion = 1.0 - uReduceMotion;
  float n = hash21(cellId);
  float band = sin(cellId.x * 0.073 + cellId.y * 0.021) * 0.5 + 0.5;
  float eventSignal = clamp(uAudio * 0.30 + uFear * 0.28 + n * 0.07 + band * 0.06, 0.0, 1.0);
  eventSignal = max(eventSignal, clamp(uForceSignal, 0.0, 1.0) * (0.84 + n * 0.16));
  eventSignal = min(eventSignal, mix(1.0, 0.62, uReduceFlash));

  // Bright material and structural discontinuities excite the tube. Global
  // story pressure changes gain, but generated-material strength never does.
  float materialSignal = smoothstep(0.18, 0.82, y) * 0.48;
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
  float threshold = mix(
    ordered,
    organic,
    clamp(uRecordingIrregularity, 0.0, 1.0)
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

  float coverageThreshold = mix(0.92, 0.20, clamp(uCoverage, 0.0, 1.0));
  float selected = smoothstep(coverageThreshold - 0.10, coverageThreshold + 0.10, recordedSignal);
  selected *= step(threshold, clamp(recordedSignal * (0.72 + uCoverage * 0.62), 0.0, 1.0));

  vec2 local = fract(frag / cell) - 0.5;
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
  float glow = (mem * 0.70 + edge * 0.30) * uGlowAmount * (1.0-uReduceFlash*0.68) * mix(1.0,0.78,uMovement);
  finalColor += palCyan() * glow * (0.22 + phosphorMask * 0.78);

  float packedDepth = texture(uDepth, fullUv).a;
  vec3 worldMetres = reconstructWorldMetres(frag, packedDepth);
  // The underlying PBR light is the form model. Neighbouring luminance gives
  // us a broad exposure volume; the centre sample restores just enough actual
  // material relief for boards, brick and cloth to remain distinct.
  float sourceLuma = luma(c);
  float neighbourLuma = 0.25 * (
    luma(sx0.rgb) + luma(sx1.rgb) + luma(sy0.rgb) + luma(sy1.rgb)
  );
  float broadForm = mix(neighbourLuma, sourceLuma, 0.71);
  float materialRelief = clamp((sourceLuma - neighbourLuma) * 1.35, -0.10, 0.10);
  float blackFloor = clamp(uRecordingBlackFloor, 0.0, 0.08);
  float exposed = clamp((broadForm - blackFloor) / max(0.001, 1.0 - blackFloor), 0.0, 1.0);
  float formTone = pow(exposed, clamp(uRecordingDensityGamma, 0.45, 1.5));
  formTone = clamp(formTone + materialRelief, 0.0, 1.0);
  float captureBlackProtect = smoothstep(blackFloor, blackFloor + 0.024, sourceLuma);
  float hasCapturedLight = step(0.18, captureBlackProtect);

  // Resolve only the middle of the light volume into irregular stipple. Deep
  // shadow and strong light become coherent shapes, as in a one-bit engraving,
  // instead of carrying a procedural pattern across every visible surface.
  float halfTone = smoothstep(0.14, 0.76, formTone);
  float stippleThreshold = formStipple(worldMetres, uRecordingIrregularity);
  float captureBit = step(stippleThreshold, halfTone) * hasCapturedLight;
  captureBit = max(captureBit, step(0.82, formTone) * hasCapturedLight);

  // Geometry and illumination provide the drawing. Silhouettes emerge as fine
  // light contours in darkness; recesses and material creases cut back into
  // already-lit masses. This restores volume without inventing surface print.
  float silhouette = smoothstep(0.020, 0.105, depthEdge * uEdgeGain);
  float crease = smoothstep(0.035, 0.155, lumaEdge * uEdgeGain);
  float darkSide = 1.0 - smoothstep(0.30, 0.52, neighbourLuma);
  float lightSide = smoothstep(0.34, 0.64, neighbourLuma);
  float brightContour = step(0.42, silhouette * darkSide) * hasCapturedLight;
  float darkCrease = step(0.52, crease * lightSide);
  captureBit = max(captureBit, brightContour);
  captureBit *= 1.0 - darkCrease;

  // Colour is a property of the light ink, never a third tonal value. Sample a
  // broad neighbourhood so hue belongs to the form rather than individual
  // dither grains, then renormalise luminance so colour cannot flatten the
  // binary lighting or change which marks are present.
  vec3 broadColor = 0.20 * (c + sx0.rgb + sx1.rgb + sy0.rgb + sy1.rgb);
  float broadColorLuma = max(0.02, luma(broadColor));
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
  vec3 oneBitScene = mix(captureDark, captureLight, captureBit);
  finalColor = mix(finalColor, oneBitScene, clamp(uRecordingCaptureMix, 0.0, 1.0));

  if(uDebugSource == 1.0) finalColor = c;
  if(uDebugSource == 2.0) finalColor = vec3(signalLevel);
  if(uDebugSource == 3.0) finalColor = vec3(mem);
  if(uDebugSource == 4.0) finalColor = vec3(edge);
  if(uDebugSource == 5.0) finalColor = vec3(phosphorMask);
  if(uDebugSource == 6.0) finalColor = vec3(stippleThreshold);
  if(uDebugSource == 7.0) finalColor = vec3(recordedSignal);
  if(uDebugSource == 8.0) finalColor = vec3(instability * 4.0 + 0.5);

  o = vec4(finalColor, clamp(mem, 0.0, 1.0));
}
`;
