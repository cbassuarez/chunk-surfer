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

import { CELL, EYE as EYE_METERS, MATERIAL, PLAN_SCALE } from '../data/floorplan/legend.js';

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
// Zone → tint, indexed by the ZONE ids in data/floorplan/legend.js.
// (none, dock, foyer, studio, natatorium, hall, practice, chapel, plant, stair)
const ZONE_TINTS = new Float32Array([
  0.60, 0.60, 0.58,   // none
  0.62, 0.60, 0.55,   // dock: sodium and rust
  0.72, 0.68, 0.62,   // foyer
  0.67, 0.74, 0.63,   // studio B3
  0.57, 0.69, 0.80,   // natatorium
  0.79, 0.66, 0.90,   // concert hall
  0.88, 0.73, 0.52,   // practice wing
  0.88, 0.92, 1.00,   // chapel
  0.55, 0.52, 0.48,   // plant room
  0.58, 0.58, 0.60,   // stairs
]);

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
uniform float uLight;        // 0 = flashlight off, 1 = on
uniform int   uChunkCount;
uniform vec4  uChunkA[${MAX_CHUNKS}]; // x, z, radius, activity
uniform vec3  uChunkC[${MAX_CHUNKS}]; // biome rgb
uniform vec4  uKey;          // x, z, active, -
uniform vec4  uDoor;
uniform vec4  uHush;         // x, z, strength, -
uniform sampler2D uPlan;     // the authored building: R=floor G=ceil B=flags A=zone
uniform sampler2D uMat;      // R=material id
uniform vec2  uPlanSize;
uniform float uUsePlan;      // 0 = procedural lattice (JUST SURF), 1 = the conservatory
uniform vec3  uZoneTint[10];
out vec4 o;

// Height encoding must match world/floorplan.js exactly.
const float H_MIN = -8.0;
const float H_RANGE = 32.0;
const float CELL_METERS = ${CELL.toFixed(6)};
const float PROC_CEIL = ${ (3.2 / CELL).toFixed(6) };
const int FLAG_SOLID   = 1;
const int FLAG_DOOR    = 2;
const int FLAG_SKY     = 4;
const int FLAG_BRICKED = 32;
const int MAT_SERVICE = ${MATERIAL.serviceConcrete};
const int MAT_ACOUSTIC = ${MATERIAL.acousticFoam};
const int MAT_POOL = ${MATERIAL.poolTile};
const int MAT_WET = ${MATERIAL.wetTile};
const int MAT_WOOD = ${MATERIAL.woodVelvet};
const int MAT_PRACTICE = ${MATERIAL.practiceFoam};
const int MAT_CHAPEL = ${MATERIAL.chapelStone};
const int MAT_METAL = ${MATERIAL.metalPlant};
const int MAT_DOOR = ${MATERIAL.doorGlassDuct};

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
const float CEIL = PROC_CEIL;
const int BLOCK = ${6 * PLAN_SCALE};   // corridor pitch (runtime cells)
const int LANE  = ${2 * PLAN_SCALE};   // corridor width (runtime cells)

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

// A cell of the world. In story mode it is read from the authored floorplan
// texture — the SAME array JS collision reads, so the drawn wall and the solid
// wall cannot disagree. In JUST SURF it is the old procedural lattice.
struct Cell { bool solid; float f; float c; int flags; int zone; int mat; };

Cell cellAtI(ivec2 p){
  Cell r;
  r.flags = 0; r.zone = 0; r.mat = MAT_SERVICE;
  if(uUsePlan < 0.5){
    r.solid = solidCell(vec2(p) + 0.5);
    r.f = 0.0;
    r.c = hasCeiling(vec2(p) + 0.5) ? CEIL : 90.0;
    return r;
  }
  if(p.x < 0 || p.y < 0 || p.x >= int(uPlanSize.x) || p.y >= int(uPlanSize.y)){
    r.solid = true; r.f = 0.0; r.c = 0.0; r.flags = FLAG_SOLID;
    return r;
  }
  vec4 t = texelFetch(uPlan, p, 0);
  r.flags = int(t.b * 255.0 + 0.5);
  r.solid = (r.flags & FLAG_SOLID) != 0;
  r.f = (t.r * H_RANGE + H_MIN) / CELL_METERS;
  r.c = (t.g * H_RANGE + H_MIN) / CELL_METERS;
  r.zone = int(t.a * 255.0 + 0.5);
  r.mat = int(texelFetch(uMat, p, 0).r * 255.0 + 0.5);
  if(r.mat == 0) r.mat = MAT_SERVICE;
  if((r.flags & FLAG_SKY) != 0) r.c = 90.0 / CELL_METERS;
  return r;
}
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

float line1(float v, float scale, float width){
  float d = abs(fract(v * scale) - 0.5);
  return 1.0 - smoothstep(width, width + 0.018, d);
}
float grid2(vec2 p, float scale, float width){
  vec2 d = abs(fract(p * scale) - 0.5);
  float g = min(d.x, d.y);
  return 1.0 - smoothstep(width, width + 0.015, g);
}
float materialSeam(int mat, int surf, vec3 p){
  if(mat == MAT_ACOUSTIC){
    return surf == 1
      ? max(line1(p.y, 1.65, 0.035), line1(mix(p.x, p.z, 0.5), 0.72, 0.030)) * 0.34
      : grid2(p.xz, 0.62, 0.040) * 0.10;
  }
  if(mat == MAT_POOL || mat == MAT_WET){
    return grid2(surf == 1 ? vec2(mix(p.x, p.z, 0.5), p.y) : p.xz, 1.75, 0.035) * (mat == MAT_WET ? 0.30 : 0.24);
  }
  if(mat == MAT_WOOD){
    float boards = surf == 1 ? line1(p.y, 1.25, 0.030) : line1(p.x + p.z * 0.18, 1.45, 0.030);
    return boards * 0.28;
  }
  if(mat == MAT_PRACTICE){
    return max(line1(p.y, 1.10, 0.035), line1(p.x + p.z, 0.58, 0.020)) * 0.22;
  }
  if(mat == MAT_CHAPEL){
    return max(line1(p.y, 0.52, 0.025), line1(mix(p.x, p.z, 0.5), 0.38, 0.018)) * 0.26;
  }
  if(mat == MAT_METAL){
    return max(line1(p.y, 2.1, 0.030), line1(p.x - p.z, 0.42, 0.020)) * 0.30;
  }
  if(mat == MAT_DOOR){
    return max(line1(p.y, 2.7, 0.030), line1(mix(p.x, p.z, 0.5), 1.1, 0.025)) * 0.38;
  }
  return (surf == 1 ? line1(p.y, 0.72, 0.026) : grid2(p.xz, 0.55, 0.040)) * 0.18;
}
vec3 materialBase(int mat, int surf, vec3 tint, vec3 biome, float rdv){
  vec3 base = mix(vec3(0.48, 0.48, 0.46), tint, 0.22);
  if(mat == MAT_ACOUSTIC) base = vec3(0.18, 0.20, 0.18);
  else if(mat == MAT_POOL) base = vec3(0.40, 0.57, 0.62);
  else if(mat == MAT_WET) base = vec3(0.22, 0.35, 0.38);
  else if(mat == MAT_WOOD) base = vec3(0.34, 0.22, 0.16);
  else if(mat == MAT_PRACTICE) base = vec3(0.50, 0.42, 0.31);
  else if(mat == MAT_CHAPEL) base = vec3(0.60, 0.63, 0.60);
  else if(mat == MAT_METAL) base = vec3(0.34, 0.35, 0.32);
  else if(mat == MAT_DOOR) base = vec3(0.24, 0.28, 0.29);
  if(surf == 3) base *= 0.58;
  if(surf == 2) base = mix(base, mix(biome, tint, 0.35), 0.22);
  return base * (0.56 + 0.55 * rdv);
}
float materialSpec(int mat){
  if(mat == MAT_WET) return 0.95;
  if(mat == MAT_POOL) return 0.42;
  if(mat == MAT_DOOR) return 0.48;
  if(mat == MAT_METAL) return 0.36;
  if(mat == MAT_WOOD) return 0.16;
  if(mat == MAT_CHAPEL) return 0.18;
  if(mat == MAT_ACOUSTIC) return 0.035;
  return 0.08;
}
void main(){
  vec2 uv = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  uv.x *= uRes.x / uRes.y;
  float cy = cos(uYaw), sy = sin(uYaw);
  vec3 fwd = normalize(vec3(sy, uPitch, -cy));
  vec3 rgt = normalize(vec3(cy, 0.0, sy));
  vec3 up  = normalize(cross(rgt, fwd));
  // FOV. Anything tighter than this and a real building feels like a coffin:
  // you cannot see the floor at your feet or the ceiling above you at once.
  vec3 rd = normalize(fwd + uv.x*rgt*0.95 + uv.y*up*0.95);
  vec3 ro = uCam;

  // SECTOR TRAVERSAL. Each cell carries its own floor and ceiling height, so a
  // stair is a run of cells whose floors climb, and the chapel is a cell whose
  // ceiling is eleven metres up. Doom solved this in 1993; the DDA below is the
  // same idea with the ray clipped against the current cell's two planes, plus
  // three kinds of wall at each boundary:
  //
  //   full  — the next cell is rock
  //   riser — the next floor is above the ray (a step up, a stage, a kerb)
  //   header— the next ceiling is below the ray (a lintel, a low duct)
  //
  // Wall normals come from the DDA's entry face, never from fract(pos): that
  // was the salt-and-pepper flicker.
  const float MAXD = 90.0 / CELL_METERS;
  float tHit = -1.0;
  int surf = 0;                 // 1 wall · 2 floor · 3 ceiling
  int hitZone = 0;
  int hitMat = MAT_SERVICE;
  vec3 n = vec3(0.0, 1.0, 0.0);

  ivec2 cell = ivec2(floor(ro.xz));
  vec2 drd = 1.0 / max(abs(rd.xz), vec2(1e-5));
  ivec2 stp = ivec2(rd.x < 0.0 ? -1 : 1, rd.z < 0.0 ? -1 : 1);
  vec2 sideT = (vec2(cell) + max(vec2(stp), 0.0) - ro.xz) / (rd.xz + 1e-9);

  Cell cur = cellAtI(cell);
  float tEnter = 0.0;

  for(int i = 0; i < 192; i++){
    if(tEnter > MAXD) break;
    bool xSide = sideT.x < sideT.y;
    float tExit = min(sideT.x, sideT.y);

    if(!cur.solid){
      // the floor of the cell you are crossing
      if(rd.y < -1e-4){
        float tf = (cur.f - ro.y) / rd.y;
        if(tf >= tEnter && tf <= tExit){
          tHit = tf; surf = 2; n = vec3(0.0, 1.0, 0.0); hitZone = cur.zone; hitMat = cur.mat; break;
        }
      }
      // and its ceiling, unless it is open to the dark
      if(rd.y > 1e-4 && (cur.flags & FLAG_SKY) == 0){
        float tc = (cur.c - ro.y) / rd.y;
        if(tc >= tEnter && tc <= tExit){
          tHit = tc; surf = 3; n = vec3(0.0, -1.0, 0.0); hitZone = cur.zone; hitMat = cur.mat; break;
        }
      }
    }

    ivec2 nxt = xSide ? ivec2(cell.x + stp.x, cell.y) : ivec2(cell.x, cell.y + stp.y);
    Cell nc = cellAtI(nxt);
    float yB = ro.y + rd.y * tExit;
    vec3 wn = xSide ? vec3(float(-stp.x), 0.0, 0.0) : vec3(0.0, 0.0, float(-stp.y));

    bool wall = false;
    if(nc.solid){
      wall = (yB >= cur.f - 0.001 && yB <= cur.c + 0.001);
    } else {
      if(yB < nc.f) wall = true;                                      // riser
      else if(yB > nc.c && (nc.flags & FLAG_SKY) == 0) wall = true;   // header
    }
    if(wall && tExit <= MAXD){
      tHit = tExit; surf = 1; n = wn; hitZone = nc.solid ? cur.zone : nc.zone; hitMat = nc.solid ? cur.mat : nc.mat; break;
    }

    cell = nxt; cur = nc; tEnter = tExit;
    if(xSide) sideT.x += drd.x; else sideT.y += drd.y;
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
    vec3 posM = pos * CELL_METERS;
    vec3 roM = ro * CELL_METERS;
    // In the conservatory the tint comes from the room you are looking at; in
    // JUST SURF it comes from the procedural world beneath your feet.
    vec3 tint = (uUsePlan > 0.5) ? uZoneTint[hitZone] : uWorldTint[int(worldIdx(pos.xz))];

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
      glow += uChunkC[i] * exp(-(dd * CELL_METERS * CELL_METERS) * 0.09) * uChunkA[i].w * (0.9 + 0.4 * sin(uTime * 1.7 + float(i) * 1.3));
    }
    biome /= (1.0 + bw);

    // reaction-diffusion skin, planar-mapped per surface so the crawl never
    // smears into streaks: floors/ceilings by xz, wall faces by their own plane.
    // Walls sample at low frequency (their UVs are magnified up close, and the
    // Gray-Scott field is pixel-fine — sampling it tight is pure salt-and-pepper).
    vec2 rdUv = (surf == 1)
      ? vec2(mix(posM.z, posM.x, abs(n.z)), posM.y) * 0.030
      : posM.xz * 0.05;
    float rdv = texture(uRD, rdUv).g;
    float rdv2 = texture(uRD, rdUv * 0.28 + uTime * 0.002).g;
    rdv = max(rdv, rdv2 * 0.85);
    if(surf == 1) rdv = mix(0.5, rdv, 0.45);   // mottling on walls, not marble
    float rim = smoothstep(0.16, 0.32, rdv) - smoothstep(0.32, 0.58, rdv);

    // tiling: floor slabs, wall courses — architecture needs a legible module
    float seam = materialSeam(hitMat, surf, posM);

    // Interior lighting: a lamp the player carries. Inverse-square falloff with
    // Lambert on the true face normal — this is what makes a corridor read as
    // a corridor (near walls bright, the far end swallowed).
    vec3 toEye = ro - pos;
    vec3 toEyeM = roM - posM;
    float dist = length(toEyeM);
    vec3 ldir = normalize(toEye);
    float lambert = clamp(dot(n, ldir), 0.0, 1.0);
    float falloff = 1.0 / (1.0 + 0.10 * dist + 0.045 * dist * dist);
    // grazing floor right at the feet would otherwise blow out: soften the
    // near field so the lamp reads as a pool of light, not a flashbulb
    float nearSoft = smoothstep(0.0, 1.4, dist) * 0.55 + 0.45;
    // The flashlight is a CONE, not a global dimmer: a circular pool of light
    // thrown where you are looking, with everything outside it dark. fwd is
    // the view axis, so the pool sits centred on screen and sweeps as you turn.
    // Off: no cone at all, and the ambient drops to almost nothing. You are not
    // blind — the room is still there, you simply cannot see it. Light attracts,
    // so this is a choice, not a setting.
    float axis = dot(normalize(-toEye), fwd);            // 1 = dead ahead
    // A torch throws a defined disc, not a gradient across the room: a hard
    // edge with just enough diffusion at the rim to read as glass, plus a faint
    // spill because no lens is perfect.
    float cone     = smoothstep(0.880, 0.940, axis);        // the disc
    float beamRim  = smoothstep(0.840, 0.895, axis) * 0.30; // soft edge
    float spill    = smoothstep(0.30, 0.86, axis) * 0.05;   // lens leak
    float beam = (cone + beamRim + spill) * uLight;
    float lamp = lambert * falloff * nearSoft * 3.0 * beam;   // a torch, not a flare
    float ambient = mix(0.010, 0.030, uLight);

    vec3 albedo = materialBase(hitMat, surf, tint, biome, rdv);
    float spec = materialSpec(hitMat) * pow(clamp(lambert, 0.0, 1.0), 8.0) * lamp;

    float emis = (surf == 2) ? 0.55 : (surf == 1 ? 0.30 : 0.12);
    col = albedo * (ambient + lamp)
        + vec3(0.55, 0.60, 0.62) * spec
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
    col = mix(col, vec3(0.008, 0.008, 0.012), 1.0 - exp(-(tHit * CELL_METERS) * 0.055));
  }

  // beacons: vertical light-beams for key/door (2D ray closest-approach)
  vec2 ro2 = ro.xz, rd2 = normalize(rd.xz + vec2(1e-5));
  float span = (tHit > 0.0 ? tHit : 110.0 / CELL_METERS) * length(rd.xz) / max(length(rd), 1e-4);
  if(uKey.z > 0.5){
    float s = clamp(dot(uKey.xy - ro2, rd2), 0.0, span);
    float d = length(ro2 + rd2*s - uKey.xy) * CELL_METERS;
    float pulse = 0.5 + 0.3*sin(uTime*2.6);
    col += vec3(1.0, 0.98, 0.9) * (exp(-d*d*6.0)*0.9 + exp(-d*d*0.3)*0.22) * pulse;
  }
  if(uDoor.z > 0.5){
    float s = clamp(dot(uDoor.xy - ro2, rd2), 0.0, span);
    float d = length(ro2 + rd2*s - uDoor.xy) * CELL_METERS;
    col += vec3(0.75, 0.85, 1.0) * (exp(-d*d*4.0)*0.8 + exp(-d*d*0.25)*0.2);
  }
  // the hush: an absence — darkens and destabilises everything near its line
  if(uHush.z > 0.001){
    float s = clamp(dot(uHush.xy - ro2, rd2), 0.0, span);
    float d = length(ro2 + rd2*s - uHush.xy) * CELL_METERS;
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
let planTexture = null, materialTexture = null, planW = 0, planH = 0;
let uniforms = {};
let facing = 0; // 0=N(0,-1) 1=E 2=S 3=W
let yaw = 0, yawTarget = 0;
let camX = 0, camZ = 0, camY = EYE_METERS / CELL;
let lastT = 0;
let fogOrigin = [0, 0];
let lightEase = 0;   // the building starts dark, and so do you

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
export function r3dFacing() { return facing; }
// Corridors are two cells wide, so an arbitrary spawn facing can put a wall
// both ahead of you and behind you — which reads exactly like broken arrow keys.
export function r3dSetFacing(f) {
  facing = ((f % 4) + 4) % 4;
  yaw = yawTarget = facing * Math.PI / 2;
}

// The authored building, as the shader sees it. This is literally the array
// JS collision reads (world/floorplan.js `rgba`), so there is nothing to keep
// in sync — the drawn wall IS the solid wall.
export function r3dSetPlan(rgba, w, h, material = null) {
  if (!gl) return;
  planW = w; planH = h;
  if (planTexture) gl.deleteTexture(planTexture);
  if (materialTexture) gl.deleteTexture(materialTexture);
  planTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, planTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  // NEAREST: a cell is a cell. Interpolating heights would smear the walls.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const mat = material || new Uint8Array(w * h).fill(MATERIAL.serviceConcrete);
  materialTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, materialTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, mat);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

// A mutation touched a few cells: re-upload only those.
export function r3dPatchPlan(rgba, materialOrX, xOrY, yOrW, wOrH, maybeH) {
  if (!gl || !planTexture) return;
  const hasMaterial = materialOrX && typeof materialOrX !== 'number';
  const material = hasMaterial ? materialOrX : null;
  const x = hasMaterial ? xOrY : materialOrX;
  const y = hasMaterial ? yOrW : xOrY;
  const w = hasMaterial ? wOrH : yOrW;
  const h = hasMaterial ? maybeH : wOrH;
  const sub = new Uint8Array(w * h * 4);
  for (let ry = 0; ry < h; ry++) {
    const src = ((y + ry) * planW + x) * 4;
    sub.set(rgba.subarray(src, src + w * 4), ry * w * 4);
  }
  gl.bindTexture(gl.TEXTURE_2D, planTexture);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, sub);
  if (material && materialTexture) {
    const mats = new Uint8Array(w * h);
    for (let ry = 0; ry < h; ry++) {
      const src = (y + ry) * planW + x;
      mats.set(material.subarray(src, src + w), ry * w);
    }
    gl.bindTexture(gl.TEXTURE_2D, materialTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RED, gl.UNSIGNED_BYTE, mats);
  }
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
const CEIL = 3.2 / CELL, BLOCK = 6 * PLAN_SCALE, LANE = 2 * PLAN_SCALE;
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
  // Eye height above whatever floor you are standing on. Eased, so a stair is
  // a climb rather than a series of teleports.
  const floorGoal = ((state.floorH ?? 0) + EYE_METERS) / CELL;
  camY += (floorGoal - camY) * (1 - Math.exp(-dt * 14));
  // A flashlight snaps. The only easing is a filament's breath on the way out.
  const lightGoal = state.light === false ? 0 : 1;
  lightEase += (lightGoal - lightEase) * (1 - Math.exp(-dt * (lightGoal ? 90 : 45)));
  if (Math.abs(lightGoal - lightEase) < 0.004) lightEase = lightGoal;

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
  gl.uniform1f(U('uLight'), lightEase);
  gl.uniform1f(U('uUsePlan'), state.plan ? 1 : 0);
  if (state.plan && planTexture) {
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, planTexture);
    gl.uniform1i(U('uPlan'), 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, materialTexture);
    gl.uniform1i(U('uMat'), 3);
    gl.uniform2f(U('uPlanSize'), planW, planH);
    gl.uniform3fv(U('uZoneTint[0]'), ZONE_TINTS);
  }
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
