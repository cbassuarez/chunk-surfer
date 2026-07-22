// Selective VFD compositor. The full-resolution scene remains authoritative;
// cell-centre samples only decide where phosphor is excited. The previous pass'
// alpha stores excitation memory, never scene colour or depth.
export const PIXEL_MESH_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform sampler2D uPrev;
uniform vec2 uRes;
uniform float uTime;
uniform float uDt;
uniform float uCellPx;
uniform float uBaseRetention;
uniform float uPaletteAmount;
uniform float uPaletteChroma;
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
  float n = hash21(cellId + floor(uTime * 0.7 * motion));
  float band = uReduceMotion > 0.5 ? 0.5 : sin(cellId.x * 0.073 + cellId.y * 0.021 + uTime * 0.9) * 0.5 + 0.5;
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

  float threshold = bayer4(ivec2(cellId));
  float coverageThreshold = mix(0.92, 0.20, clamp(uCoverage, 0.0, 1.0));
  float selected = smoothstep(coverageThreshold - 0.10, coverageThreshold + 0.10, signalLevel);
  selected *= step(threshold, clamp(signalLevel * (0.72 + uCoverage * 0.62), 0.0, 1.0));

  vec2 local = fract(frag / cell) - 0.5;
  vec2 apertureScale = vec2(0.94, mix(0.62, 0.88, clamp(uAperture, 0.0, 1.0)));
  float aperture = 1.0 - smoothstep(0.39, 0.54, length(local / apertureScale));
  float phosphorMask = selected * aperture;

  // Restore the authored block-palette image that made the original 8-bit
  // layer legible and forceful. Generated material and PBR still determine
  // the sampled value/edges; this is a display encoding of that image, not a
  // competing navigation/world renderer.
  vec3 paletted = palWorldDark();
  if(y > 0.56 || (edge > 0.60 && y > 0.18)) {
    paletted = mix(palWorldMauve(), palCream(), clamp(y, 0.0, 1.0));
  } else if(y > 0.20) {
    paletted = mix(palWorldDark(), palWorldMid(), clamp(y * 1.5, 0.0, 1.0));
  } else {
    paletted = mix(palGlass(), palWorldDark(), clamp(y * 2.0 + edge * 0.25, 0.0, 1.0));
  }

  vec3 phosphor = mix(palCyanDim(), palCyan(), smoothstep(0.28, 0.82, signalLevel));
  phosphor = mix(phosphor, palCyanHot(), smoothstep(0.82, 1.18, signalLevel));
  float fault = step(0.965, signalLevel) * step(0.90, threshold) * uAmberAmount * (1.0-uReduceFlash);
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

  if(uDebugSource == 1.0) finalColor = c;
  if(uDebugSource == 2.0) finalColor = vec3(signalLevel);
  if(uDebugSource == 3.0) finalColor = vec3(mem);
  if(uDebugSource == 4.0) finalColor = vec3(edge);
  if(uDebugSource == 5.0) finalColor = vec3(phosphorMask);

  o = vec4(finalColor, clamp(mem, 0.0, 1.0));
}
`;
