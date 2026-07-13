export const PIXEL_MESH_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform sampler2D uPrev;
uniform vec2 uRes;
uniform float uTime;
uniform float uCellPx;
uniform float uWorldAmount;
uniform float uSignalAmount;
uniform float uGlowAmount;
uniform float uMemoryAmount;
uniform float uAudio;
uniform float uFear;
uniform float uLocalDiffusion;
uniform float uReduceFlash;
uniform float uReduceMotion;
uniform float uDebugSource;
uniform float uForceSignal;
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
vec3 palGlass(){ return vec3(0.006, 0.020, 0.018); }
vec3 palWorldDark(){ return vec3(0.020, 0.080, 0.105); }
vec3 palWorldMid(){ return vec3(0.250, 0.305, 0.365); }
vec3 palWorldMauve(){ return vec3(0.520, 0.390, 0.455); }
vec3 palCream(){ return vec3(1.000, 0.820, 0.560); }
vec3 palCyan(){ return vec3(0.380, 1.000, 0.900); }
vec3 palCyanDim(){ return vec3(0.060, 0.480, 0.440); }
vec3 palAmber(){ return vec3(1.000, 0.610, 0.180); }

void main(){
  vec2 frag = gl_FragCoord.xy;
  float cell = max(1.0, uCellPx);
  vec2 cellId = floor(frag / cell);
  vec2 cellCenter = (cellId + 0.5) * cell;
  vec2 uv = clamp(cellCenter / uRes, vec2(0.001), vec2(0.999));

  vec4 src = texture(uSrc, uv);
  vec3 c = src.rgb;
  float y = luma(c);

  vec2 texel = 1.0 / uRes;
  float e1 = abs(luma(texture(uSrc, uv + vec2(texel.x, 0.0)).rgb) - luma(texture(uSrc, uv - vec2(texel.x, 0.0)).rgb));
  float e2 = abs(luma(texture(uSrc, uv + vec2(0.0, texel.y)).rgb) - luma(texture(uSrc, uv - vec2(0.0, texel.y)).rgb));
  float edge = clamp((e1 + e2) * 2.4, 0.0, 1.0);

  float n = hash21(cellId + floor(uTime * mix(0.0, 0.7, 1.0 - uReduceMotion)));
  float band = uReduceMotion > 0.5 ? 0.5 : sin(cellId.x * 0.073 + cellId.y * 0.021 + uTime * 0.9) * 0.5 + 0.5;
  float signal = clamp(uAudio * 0.22 + uFear * 0.20 + uLocalDiffusion * 0.45 + n * 0.08 + band * 0.08, 0.0, 1.0);
  // Debug/proof-of-life pulse: deliberately independent of the diffusion/lens
  // path so the mesh can be verified while the lens service is disconnected.
  signal = max(signal, clamp(uForceSignal, 0.0, 1.0) * (0.82 + n * 0.18));

  float prev = texture(uPrev, uv).a;
  float attack = 0.22;
  float decay = 0.965;
  float mem = signal > prev ? mix(prev, signal, attack) : prev * decay;
  mem *= uMemoryAmount;

  float active = max(signal, mem * 0.72) * uSignalAmount;
  float threshold = bayer4(ivec2(cellId));

  vec3 mesh = palWorldDark();
  float strength = y * uWorldAmount;
  if(strength > 0.56 || (edge > 0.60 && y > 0.18)) {
    mesh = mix(palWorldMauve(), palCream(), clamp(y, 0.0, 1.0));
  } else if(strength > 0.20) {
    mesh = mix(palWorldDark(), palWorldMid(), clamp(y * 1.5, 0.0, 1.0));
  } else {
    mesh = mix(palGlass(), palWorldDark(), clamp(y * 2.0 + edge * 0.25, 0.0, 1.0));
  }

  if(active > 0.42) {
    vec3 sigCol = active > 0.88 ? palCyan() : palCyanDim();
    float lit = active >= threshold ? 1.0 : 0.0;
    mesh = mix(mesh, sigCol, lit * clamp(active, 0.0, 1.0));
  }

  if(active > 0.96 && threshold > 0.86 && uReduceFlash < 0.5) {
    mesh = mix(mesh, palAmber(), 0.78);
  }

  vec3 finalColor = mix(c, mesh, clamp(uWorldAmount, 0.0, 1.0));
  finalColor += palCyan() * mem * uGlowAmount * (1.0 - uReduceFlash * 0.75);

  if(uDebugSource == 1.0) finalColor = vec3(y);
  if(uDebugSource == 2.0) finalColor = vec3(signal);
  if(uDebugSource == 3.0) finalColor = vec3(mem);
  if(uDebugSource == 4.0) finalColor = vec3(edge);

  o = vec4(finalColor, clamp(mem, 0.0, 1.0));
}
`;
