// First-person 3D renderer (`?renderer=3d`) — the world view for the
// diffusion-lens architecture, and the no-GPU fallback when the lens is off.
//
// Geometry is architecture, not terrain: a flat floor at y=0, a flat ceiling
// at CEIL, and full-height wall slabs on a corridor lattice (see solidCell).
// Walls are traversed by DDA so faces are exact; floor and ceiling are planes
// solved analytically. Surfaces wear a live Gray-Scott reaction-diffusion skin
// and the world's biome/world tints; fog-of-war dims unvisited ground.
//
// solidCell() is mirrored bit-for-bit in JS as r3dSolid() for collision —
// both sides use uint hashing only, since float noise diverges between GLSL
// f32 and JS f64 and the player would clip through drawn walls.
//
// Game logic stays untouched: movement is still discrete grid steps; this
// module only owns facing (N/E/S/W) and the camera.

const MAX_CHUNKS = 48;
const RD_SIZE = 256;
const RENDER_SCALE = 0.6;  // half-ish res: perf + the soft 'dream' look
const FOG_TEX = 128;

const BIOME_RGB = {
  drone:     [0.33, 0.47, 0.40],
  shimmer:   [0.63, 0.63, 0.70],
  noise:     [0.53, 0.47, 0.40],
  pulse:     [0.47, 0.53, 0.47],
  resonance: [0.40, 0.53, 0.53],
};
const WORLD_RGB = {
  main_b3:         [0.67, 0.74, 0.63],
  the_tub:         [0.57, 0.69, 0.80],
  amplifications:  [0.79, 0.66, 0.90],
  soundnoisemusic: [0.88, 0.73, 0.52],
  lux_nova:        [0.88, 0.92, 1.00],
};

const COMMON_GLSL = `#version 300 es
precision highp float;
`;

const VERT = COMMON_GLSL + `
void main(){
  vec2 p = vec2((gl_VertexID<<1 & 2), (gl_VertexID & 2));
  gl_Position = vec4(p*2.0-1.0, 0.0, 1.0);
}`;

// ── Gray-Scott reaction-diffusion (ping-pong) ────────────────────────────────
const RD_FRAG = COMMON_GLSL + `
uniform sampler2D uPrev;
uniform float uFeed, uKill;
out vec4 o;
void main(){
  ivec2 q = ivec2(gl_FragCoord.xy);
  ivec2 sz = textureSize(uPrev, 0);
  vec2 c = texelFetch(uPrev, q, 0).rg;
  vec2 lap = -c;
  lap += 0.2 * (texelFetch(uPrev, (q+ivec2( 1, 0)+sz)%sz, 0).rg
              + texelFetch(uPrev, (q+ivec2(-1, 0)+sz)%sz, 0).rg
              + texelFetch(uPrev, (q+ivec2( 0, 1)+sz)%sz, 0).rg
              + texelFetch(uPrev, (q+ivec2( 0,-1)+sz)%sz, 0).rg);
  lap += 0.05 * (texelFetch(uPrev, (q+ivec2( 1, 1)+sz)%sz, 0).rg
               + texelFetch(uPrev, (q+ivec2(-1, 1)+sz)%sz, 0).rg
               + texelFetch(uPrev, (q+ivec2( 1,-1)+sz)%sz, 0).rg
               + texelFetch(uPrev, (q+ivec2(-1,-1)+sz)%sz, 0).rg);
  float A = c.r, B = c.g;
  float r = A * B * B;
  const float DT = 0.85;
  A += (1.0*lap.r - r + uFeed*(1.0-A)) * DT;
  B += (0.5*lap.g + r - (uKill+uFeed)*B) * DT;
  o = vec4(clamp(A,0.0,1.0), clamp(B,0.0,1.0), 0.0, 1.0);
}`;

// ── World raymarcher ──────────────────────────────────────────────────────────
const MARCH_FRAG = COMMON_GLSL + `
uniform vec2  uRes;
uniform float uTime;
uniform vec3  uCam;          // eye (x, height, z=world y)
uniform float uYaw;
uniform float uPitch;
uniform vec2  uTile;         // WORLD_TILE_W/H
uniform float uWorldCount;
uniform vec3  uWorldTint[5];
uniform sampler2D uRD;
uniform sampler2D uFogTex;
uniform vec2  uFogOrigin;
uniform float uAudio;        // 0..1 field energy
uniform int   uChunkCount;
uniform vec4  uChunkA[${MAX_CHUNKS}]; // x, z, radius, activity
uniform vec3  uChunkC[${MAX_CHUNKS}]; // biome rgb
uniform vec4  uKey;          // x, z, active, -
uniform vec4  uDoor;
uniform vec4  uHush;         // x, z, strength, -
out vec4 o;

float hash01(float x, float y){ return fract(abs(sin(x*127.1 + y*311.7) * 43758.5)); }
float noise2(vec2 p, float s, float seed){
  vec2 q = (p + vec2(seed, seed*1.3)) * s;
  return 0.5*sin(q.x*1.7 + cos(q.y*2.3)) + 0.5*cos(q.y*1.1 + sin(q.x*1.9));
}

// Integer hash — bit-identical to the JS mirror in this file (collision must
// agree exactly with what is drawn; float noise diverges between GLSL f32 and
// JS f64, so anything that decides solidity uses uint math only).
uint ihash(uint a){ a ^= a>>16; a *= 0x7feb352du; a ^= a>>15; a *= 0x846ca68bu; a ^= a>>16; return a; }
uint ihash2(int x, int y){ return ihash((uint(x)*1597334677u) ^ (uint(y)*2891336453u)); }

// ── Architecture ─────────────────────────────────────────────────────────────
// Floor: flat plane at y=0. Ceiling: flat plane at CEIL. Walls: full-height
// vertical slabs. Layout: a lattice of LANE-wide corridors on a BLOCK pitch —
// connected by construction, since every lane meets every crossing lane — with
// the interiors between them either open rooms or solid mass. Macro-zones of
// 3x3 blocks open entirely into unroofed EXPANSES.
const float CEIL = 3.2;
const int BLOCK = 6;   // corridor pitch (cells)
const int LANE  = 2;   // corridor width (cells)

bool isExpanse(int cx, int cz){
  int mx = int(floor(float(cx)/float(BLOCK*3)));
  int mz = int(floor(float(cz)/float(BLOCK*3)));
  return ihash2(mx+404, mz+909) % 100u < 22u;
}
bool solidCell(vec2 p){
  int cx = int(floor(p.x)), cz = int(floor(p.y));
  if(isExpanse(cx, cz)) return false;
  int bx = int(floor(float(cx)/float(BLOCK))), bz = int(floor(float(cz)/float(BLOCK)));
  int lx = cx - bx*BLOCK, lz = cz - bz*BLOCK;
  if(lx < LANE || lz < LANE) return false;      // corridor lane: always walkable
  if(ihash2(bx, bz) % 10u < 4u) return false;   // 40% of blocks are open rooms
  vec2 cc = vec2(float(cx)+0.5, float(cz)+0.5); // never entomb a beacon
  if(uKey.z>0.5  && dot(cc-uKey.xy,  cc-uKey.xy)  < 4.0) return false;
  if(uDoor.z>0.5 && dot(cc-uDoor.xy, cc-uDoor.xy) < 4.0) return false;
  return true;
}
bool hasCeiling(vec2 p){ return !isExpanse(int(floor(p.x)), int(floor(p.y))); }
float worldIdx(vec2 p){
  float wx = p.x + (noise2(p, 0.006, 17.0) + 0.5*noise2(p, 0.015, 29.0)) * (uTile.x*0.95);
  float wy = p.y + (noise2(p, 0.007, 41.0) + 0.5*noise2(p, 0.018, 53.0)) * (uTile.y*0.95);
  vec2 t = floor(vec2(wx, wy) / uTile);
  return mod(floor(hash01(t.x*13.7, t.y*91.1) * 1000000.0), uWorldCount);
}
// Flat floor (y=0) — chunk presence is expressed in light and colour, never
// in geometry, so walking is level and the camera never bobs.
float height(vec2 p){ return solidCell(p) ? CEIL : 0.0; }

float fogSeen(vec2 p){
  vec2 uv = (p - uFogOrigin) / ${FOG_TEX}.0;
  if(uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  return texture(uFogTex, uv).r; // 0 unseen · ~0.5 remembered · 1 fresh
}
void main(){
  vec2 uv = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  uv.x *= uRes.x / uRes.y;
  float cy = cos(uYaw), sy = sin(uYaw);
  vec3 fwd = normalize(vec3(sy, uPitch, -cy));
  vec3 rgt = normalize(vec3(cy, 0.0, sy));
  vec3 up  = normalize(cross(rgt, fwd));
  vec3 rd = normalize(fwd + uv.x*rgt*0.72 + uv.y*up*0.72);
  vec3 ro = uCam;

  // DDA voxel traversal: exact wall faces, no sphere-march gaps. Floor and
  // ceiling are planes, so they're solved analytically and compared per step.
  const float MAXD = 78.0;
  float tHit = -1.0;
  int surf = 0;               // 1 wall · 2 floor · 3 ceiling
  vec3 n = vec3(0.0, 1.0, 0.0);

  float tFloor = (rd.y < -1e-4) ? (0.0 - ro.y) / rd.y : 1e9;   // plane y=0
  float tCeilP = (rd.y >  1e-4) ? (CEIL - ro.y) / rd.y : 1e9;  // plane y=CEIL

  ivec2 cell = ivec2(floor(ro.xz));
  vec2 drd = 1.0 / max(abs(rd.xz), vec2(1e-5));
  ivec2 stp = ivec2(rd.x < 0.0 ? -1 : 1, rd.z < 0.0 ? -1 : 1);
  vec2 sideT = (vec2(cell) + max(vec2(stp), 0.0) - ro.xz) / (rd.xz + 1e-9);
  float tWall = -1.0;
  float tCur = 0.0;
  // Which face we entered the current cell through. The DDA knows this
  // exactly; deriving it from fract(pos) at the boundary is numerically
  // ambiguous and makes the normal flicker per pixel (salt-and-pepper walls).
  bool enteredX = false;
  vec3 wallN = vec3(0.0);
  for(int i = 0; i < 128; i++){
    if(tCur > MAXD) break;
    // only wall cells count, and only where the ray is within the slab's span
    if(solidCell(vec2(cell) + 0.5)){
      float ty = ro.y + rd.y * tCur;
      if(ty >= 0.0 && ty <= CEIL){
        tWall = tCur;
        wallN = enteredX ? vec3(float(-stp.x), 0.0, 0.0) : vec3(0.0, 0.0, float(-stp.y));
        break;
      }
    }
    bool xSide = sideT.x < sideT.y;
    tCur = xSide ? sideT.x : sideT.y;
    enteredX = xSide;
    if(xSide){ sideT.x += drd.x; cell.x += stp.x; }
    else     { sideT.y += drd.y; cell.y += stp.y; }
  }
  if(tWall < 0.0) tWall = 1e9;

  // ceiling only exists over roofed cells; expanses are open to the sky
  if(tCeilP < 1e8 && !hasCeiling((ro + rd * tCeilP).xz)) tCeilP = 1e9;

  float tBest = min(tWall, min(tFloor, tCeilP));
  if(tBest < 1e8 && tBest <= MAXD){
    tHit = tBest;
    if(tBest == tWall){ surf = 1; n = wallN; }
    else if(tBest == tFloor){ surf = 2; n = vec3(0.0, 1.0, 0.0); }
    else { surf = 3; n = vec3(0.0, -1.0, 0.0); }
  }

  vec3 col;
  float grain = hash01(gl_FragCoord.x + fract(uTime)*61.0, gl_FragCoord.y + fract(uTime*1.7)*47.0);
  if(tHit < 0.0){
    // open sky above an expanse: near-black, nothing to see up there
    float g = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
    col = mix(vec3(0.040, 0.043, 0.050), vec3(0.010, 0.010, 0.014), g);
    col += texture(uRD, rd.xz * 0.4 + uTime * 0.004).g * 0.012;
  } else {
    vec3 pos = ro + rd * tHit;
    float wid = worldIdx(pos.xz);
    vec3 tint = uWorldTint[int(wid)];

    // nearest-chunk biome blend + emissive glow
    vec3 biome = vec3(0.30, 0.36, 0.36);
    float bw = 0.0;
    vec3 glow = vec3(0.0);
    for(int i = 0; i < ${MAX_CHUNKS}; i++){
      if(i >= uChunkCount) break;
      vec2 d = pos.xz - uChunkA[i].xy;
      float dd = dot(d,d);
      float w = exp(-dd / max(uChunkA[i].z*uChunkA[i].z, 1.0));
      biome += uChunkC[i] * w; bw += w;
      glow += uChunkC[i] * exp(-dd * 0.09) * uChunkA[i].w * (0.9 + 0.4 * sin(uTime * 1.7 + float(i) * 1.3));
    }
    biome /= (1.0 + bw);

    // reaction-diffusion skin, planar-mapped per surface so the crawl never
    // smears into streaks: floors/ceilings by xz, wall faces by their own plane.
    // Walls sample at low frequency (their UVs are magnified up close, and the
    // Gray-Scott field is pixel-fine — sampling it tight is pure salt-and-pepper).
    vec2 rdUv = (surf == 1)
      ? vec2(mix(pos.z, pos.x, abs(n.z)), pos.y) * 0.030
      : pos.xz * 0.05;
    float rdv = texture(uRD, rdUv).g;
    float rdv2 = texture(uRD, rdUv * 0.28 + uTime * 0.002).g;
    rdv = max(rdv, rdv2 * 0.85);
    if(surf == 1) rdv = mix(0.5, rdv, 0.45);   // mottling on walls, not marble
    float rim = smoothstep(0.16, 0.32, rdv) - smoothstep(0.32, 0.58, rdv);

    // tiling: floor slabs, wall courses — architecture needs a legible module
    vec2 fr = abs(fract(pos.xz) - 0.5);
    float slab = smoothstep(0.45, 0.5, max(fr.x, fr.y)) * 0.14;
    float course = smoothstep(0.40, 0.5, abs(fract(pos.y * 2.0) - 0.5)) * 0.10;
    float seam = (surf == 1) ? course : slab;

    // Interior lighting: a lamp the player carries. Inverse-square falloff with
    // Lambert on the true face normal — this is what makes a corridor read as
    // a corridor (near walls bright, the far end swallowed).
    vec3 toEye = ro - pos;
    float dist = length(toEye);
    vec3 ldir = toEye / max(dist, 1e-4);
    float lambert = clamp(dot(n, ldir), 0.0, 1.0);
    float falloff = 1.0 / (1.0 + 0.10 * dist + 0.045 * dist * dist);
    // grazing floor right at the feet would otherwise blow out: soften the
    // near field so the lamp reads as a pool of light, not a flashbulb
    float nearSoft = smoothstep(0.0, 1.4, dist) * 0.55 + 0.45;
    float lamp = lambert * falloff * nearSoft * 3.1;
    float ambient = 0.075;

    vec3 albedo;
    if(surf == 1)      albedo = mix(vec3(0.56, 0.55, 0.53), tint, 0.30) * (0.70 + 0.45 * rdv);
    else if(surf == 3) albedo = mix(vec3(0.30, 0.30, 0.31), tint, 0.14) * (0.60 + 0.35 * rdv);
    else               albedo = mix(mix(biome, tint, 0.42), vec3(0.36), 0.20) * (0.55 + 0.80 * rdv);

    float emis = (surf == 2) ? 0.55 : (surf == 1 ? 0.30 : 0.12);
    col = albedo * (ambient + lamp)
        + rim * tint * (0.22 + uAudio * 0.45) * emis
        + glow * emis
        - seam * 0.30 * (ambient + lamp);
    col = col / (1.0 + col * 0.30);  // filmic-ish rolloff, tames the near field

    // fog of war dims the unvisited, but never overrules the lamp — you always
    // see the wall in front of your face; memory only enriches it
    float seen = fogSeen(pos.xz);
    float shimmer = rim * 0.05;
    col = mix(vec3(0.014, 0.015, 0.02) + shimmer + col * 0.55, col, clamp(seen, 0.30, 1.0));

    // distance haze into the void (corridor ends go black)
    col = mix(col, vec3(0.008, 0.008, 0.012), 1.0 - exp(-tHit * 0.055));
  }

  // beacons: vertical light-beams for key/door (2D ray closest-approach)
  vec2 ro2 = ro.xz, rd2 = normalize(rd.xz + vec2(1e-5));
  float span = (tHit > 0.0 ? tHit : 110.0) * length(rd.xz) / max(length(rd), 1e-4);
  if(uKey.z > 0.5){
    float s = clamp(dot(uKey.xy - ro2, rd2), 0.0, span);
    float d = length(ro2 + rd2*s - uKey.xy);
    float pulse = 0.5 + 0.3*sin(uTime*2.6);
    col += vec3(1.0, 0.98, 0.9) * (exp(-d*d*6.0)*0.9 + exp(-d*d*0.3)*0.22) * pulse;
  }
  if(uDoor.z > 0.5){
    float s = clamp(dot(uDoor.xy - ro2, rd2), 0.0, span);
    float d = length(ro2 + rd2*s - uDoor.xy);
    col += vec3(0.75, 0.85, 1.0) * (exp(-d*d*4.0)*0.8 + exp(-d*d*0.25)*0.2);
  }
  // the hush: an absence — darkens and destabilises everything near its line
  if(uHush.z > 0.001){
    float s = clamp(dot(uHush.xy - ro2, rd2), 0.0, span);
    float d = length(ro2 + rd2*s - uHush.xy);
    float reach = exp(-d*d*0.02) * uHush.z;
    float churn = texture(uRD, fract((ro2 + rd2*s) * 0.05 + uTime*0.01)).g;
    col = mix(col, vec3(0.0), clamp(reach * (0.75 + churn*0.5), 0.0, 0.97));
  }

  col += (grain - 0.5) * 0.035;             // film grain
  float vig = 1.0 - 0.42 * pow(length(uv * vec2(0.72, 0.9)), 2.2);
  col *= clamp(vig, 0.0, 1.0);
  o = vec4(col, 1.0);
}`;

// ── Post: upscale with slight chromatic drift ────────────────────────────────
const POST_FRAG = COMMON_GLSL + `
uniform sampler2D uSrc;
uniform vec2 uRes;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 cd = (uv - 0.5) * 0.0035;
  o = vec4(
    texture(uSrc, uv + cd).r,
    texture(uSrc, uv).g,
    texture(uSrc, uv - cd).b,
    1.0);
}`;

// ── GL plumbing ──────────────────────────────────────────────────────────────
let gl = null, canvas = null;
let progRD, progMarch, progPost;
let rdTexA, rdTexB, rdFboA, rdFboB, rdFlip = false, rdWarm = 0;
let sceneTex, sceneFbo, fogTexture;
let uniforms = {};
let facing = 0; // 0=N(0,-1) 1=E 2=S 3=W
let yaw = 0, yawTarget = 0;
let camX = 0, camZ = 0, camY = 3;
let lastT = 0;
let fogOrigin = [0, 0];

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error('shader: ' + gl.getShaderInfoLog(s));
  return s;
}
function program(fragSrc) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error('link: ' + gl.getProgramInfoLog(p));
  return p;
}
function makeTex(w, h, data = null, format = 'rgba8') {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  if (format === 'r8') gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data);
  // Gray-Scott needs real precision: in RGBA8 the reaction term quantises to
  // 1/255 steps and the field degenerates into salt-and-pepper noise.
  else if (format === 'rgba16f') gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.FLOAT, data);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return t;
}
function makeFbo(tex) {
  const f = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return f;
}

export function r3dInit(mapEl) {
  canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;';
  // Insert beneath, never wipe: the UI glyph layer and the diffusion overlay
  // are siblings that may already be mounted here.
  mapEl.insertBefore(canvas, mapEl.firstChild);
  // preserveDrawingBuffer: the diffusion client captures this canvas with
  // toBlob() outside the rAF that drew it.
  gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error('webgl2 unavailable');

  progRD = program(RD_FRAG);
  progMarch = program(MARCH_FRAG);
  progPost = program(POST_FRAG);

  gl.getExtension('EXT_color_buffer_float'); // render targets for the RD field

  // RD seed: mostly A=1, scattered B blots
  const seed = new Float32Array(RD_SIZE * RD_SIZE * 4);
  for (let i = 0; i < RD_SIZE * RD_SIZE; i++) {
    seed[i * 4] = 1;
    seed[i * 4 + 1] = Math.random() < 0.015 ? 0.8 : 0;
    seed[i * 4 + 3] = 1;
  }
  rdTexA = makeTex(RD_SIZE, RD_SIZE, seed, 'rgba16f');
  rdTexB = makeTex(RD_SIZE, RD_SIZE, seed, 'rgba16f');
  // trilinear on the RD field (mips regenerated each frame in r3dFrame)
  for (const t of [rdTexA, rdTexB]) {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
  }
  rdFboA = makeFbo(rdTexA);
  rdFboB = makeFbo(rdTexB);
  fogTexture = makeTex(FOG_TEX, FOG_TEX, new Uint8Array(FOG_TEX * FOG_TEX), 'r8');
  resize();
  window.addEventListener('resize', resize);
}

function resize() {
  const w = Math.max(1, canvas.parentElement.clientWidth);
  const h = Math.max(1, canvas.parentElement.clientHeight);
  canvas.width = Math.round(w * devicePixelRatio);
  canvas.height = Math.round(h * devicePixelRatio);
  const sw = Math.max(64, Math.round(canvas.width * RENDER_SCALE));
  const sh = Math.max(64, Math.round(canvas.height * RENDER_SCALE));
  if (sceneTex) { gl.deleteTexture(sceneTex); gl.deleteFramebuffer(sceneFbo); }
  sceneTex = makeTex(sw, sh);
  sceneFbo = makeFbo(sceneTex);
  uniforms.sceneW = sw; uniforms.sceneH = sh;
}

// ── Facing / input hooks (main.js calls these in 3d mode) ────────────────────
export function r3dTurn(dir) {
  facing = (facing + dir + 4) % 4;
  yawTarget += dir * Math.PI / 2;
}
export function r3dDelta(sign) {
  const v = [[0, -1], [1, 0], [0, 1], [-1, 0]][facing];
  return [v[0] * sign, v[1] * sign];
}

export function r3dUpdateFog(fogGet, px, py) {
  fogOrigin = [px - FOG_TEX / 2, py - FOG_TEX / 2];
  const buf = new Uint8Array(FOG_TEX * FOG_TEX);
  for (let y = 0; y < FOG_TEX; y++) {
    for (let x = 0; x < FOG_TEX; x++) {
      const v = fogGet(fogOrigin[0] + x, fogOrigin[1] + y);
      buf[y * FOG_TEX + x] = v === 2 ? 255 : v === 1 ? 120 : 0;
    }
  }
  gl.bindTexture(gl.TEXTURE_2D, fogTexture);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, FOG_TEX, FOG_TEX, gl.RED, gl.UNSIGNED_BYTE, buf);
}

// ── Collision mirror of the GLSL architecture (uint math: exact parity) ─────
// Every branch here must match solidCell() in MARCH_FRAG exactly, or the
// player walks through drawn walls / into invisible ones.
const CEIL = 3.2, EYE = 1.62, BLOCK = 6, LANE = 2;
let lastBeacons = { key: null, door: null };
function ihashJs(a) {
  a = a >>> 0;
  a ^= a >>> 16; a = Math.imul(a, 0x7feb352d) >>> 0;
  a ^= a >>> 15; a = Math.imul(a, 0x846ca68b) >>> 0;
  a ^= a >>> 16; return a >>> 0;
}
function ihash2Js(x, y) {
  return ihashJs(((Math.imul(x | 0, 1597334677) >>> 0) ^ (Math.imul(y | 0, 2891336453 | 0) >>> 0)) >>> 0);
}
function isExpanseJs(cx, cz) {
  const mx = Math.floor(cx / (BLOCK * 3)), mz = Math.floor(cz / (BLOCK * 3));
  return ihash2Js(mx + 404, mz + 909) % 100 < 22;
}
export function r3dSolid(x, y) {
  const cx = Math.floor(x), cz = Math.floor(y);
  if (isExpanseJs(cx, cz)) return false;
  const bx = Math.floor(cx / BLOCK), bz = Math.floor(cz / BLOCK);
  const lx = cx - bx * BLOCK, lz = cz - bz * BLOCK;
  if (lx < LANE || lz < LANE) return false;
  if (ihash2Js(bx, bz) % 10 < 4) return false;
  const ccx = cx + 0.5, ccz = cz + 0.5;
  for (const b of [lastBeacons.key, lastBeacons.door]) {
    if (b && ((ccx - b.x) ** 2 + (ccz - b.y) ** 2) < 4.0) return false;
  }
  return true;
}
export function r3dIsExpanse(x, y) { return isExpanseJs(Math.floor(x), Math.floor(y)); }

// state: { px, py, tileW, tileH, worldCount, worldTints:[[r,g,b]×5],
//          chunks:[{x,y,r,act,col}], key:{x,y}|null, door:{x,y}|null,
//          hush:{x,y,strength}|null, audio:0..1 }
export function r3dFrame(state) {
  if (!gl) return;
  lastBeacons = { key: state.key || null, door: state.door || null };
  const now = performance.now() / 1000;
  const dt = Math.min(0.1, now - (lastT || now));
  lastT = now;

  // camera: glide to the player cell, fixed eye height over the flat floor
  const k = 1 - Math.exp(-dt * 11);
  camX += (state.px + 0.5 - camX) * k;
  camZ += (state.py + 0.5 - camZ) * k;
  yaw += (yawTarget - yaw) * (1 - Math.exp(-dt * 12));
  camY = EYE;

  gl.disable(gl.DEPTH_TEST);

  // reaction-diffusion: 2 steps/frame, audio drives feed/kill drift
  gl.useProgram(progRD);
  gl.viewport(0, 0, RD_SIZE, RD_SIZE);
  // seed frames need many iterations to settle into structure; steady state
  // only needs a couple to keep crawling
  const rdSteps = rdWarm < 400 ? 12 : 2;
  rdWarm += rdSteps;
  for (let i = 0; i < rdSteps; i++) {
    const src = rdFlip ? rdTexB : rdTexA;
    const dst = rdFlip ? rdFboA : rdFboB;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(gl.getUniformLocation(progRD, 'uPrev'), 0);
    gl.uniform1f(gl.getUniformLocation(progRD, 'uFeed'), 0.037 + state.audio * 0.012);
    gl.uniform1f(gl.getUniformLocation(progRD, 'uKill'), 0.06 - state.audio * 0.004);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    rdFlip = !rdFlip;
  }
  const rdTex = rdFlip ? rdTexB : rdTexA;
  // mipmap the RD field: without it, minified samples on distant walls and
  // floors shimmer into salt-and-pepper as the camera moves
  gl.bindTexture(gl.TEXTURE_2D, rdTex);
  gl.generateMipmap(gl.TEXTURE_2D);

  // march into low-res scene buffer
  gl.useProgram(progMarch);
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
  gl.viewport(0, 0, uniforms.sceneW, uniforms.sceneH);
  const U = (n) => gl.getUniformLocation(progMarch, n);
  gl.uniform2f(U('uRes'), uniforms.sceneW, uniforms.sceneH);
  gl.uniform1f(U('uTime'), now);
  gl.uniform3f(U('uCam'), camX, camY, camZ);
  gl.uniform1f(U('uYaw'), yaw);
  gl.uniform1f(U('uPitch'), 0.0); // level: corridors read as corridors
  gl.uniform2f(U('uTile'), state.tileW, state.tileH);
  gl.uniform1f(U('uWorldCount'), state.worldCount);
  gl.uniform3fv(U('uWorldTint[0]'), state.worldTints.flat());
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, rdTex);
  gl.uniform1i(U('uRD'), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, fogTexture);
  gl.uniform1i(U('uFogTex'), 1);
  gl.uniform2f(U('uFogOrigin'), fogOrigin[0], fogOrigin[1]);
  gl.uniform1f(U('uAudio'), state.audio);
  const n = Math.min(state.chunks.length, MAX_CHUNKS);
  gl.uniform1i(U('uChunkCount'), n);
  if (n > 0) {
    const a = new Float32Array(MAX_CHUNKS * 4), c = new Float32Array(MAX_CHUNKS * 3);
    for (let i = 0; i < n; i++) {
      const ch = state.chunks[i];
      a.set([ch.x, ch.y, ch.r, ch.act], i * 4);
      c.set(ch.col, i * 3);
    }
    gl.uniform4fv(U('uChunkA[0]'), a);
    gl.uniform3fv(U('uChunkC[0]'), c);
  }
  gl.uniform4f(U('uKey'), state.key?.x ?? 0, state.key?.y ?? 0, state.key ? 1 : 0, 0);
  gl.uniform4f(U('uDoor'), state.door?.x ?? 0, state.door?.y ?? 0, state.door ? 1 : 0, 0);
  gl.uniform4f(U('uHush'), state.hush?.x ?? 0, state.hush?.y ?? 0, state.hush?.strength ?? 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // post upscale to screen
  gl.useProgram(progPost);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sceneTex);
  gl.uniform1i(gl.getUniformLocation(progPost, 'uSrc'), 0);
  gl.uniform2f(gl.getUniformLocation(progPost, 'uRes'), canvas.width, canvas.height);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

export function r3dCanvas() { return canvas; }

export { BIOME_RGB, WORLD_RGB };
