// First-person 3D renderer — the only shipped world view.
//
// Geometry is architecture, not terrain: a flat floor at y=0, a flat ceiling
// at CEIL, and full-height wall slabs on a corridor lattice (see solidCell).
// Walls are traversed by DDA so faces are exact; floor and ceiling are planes
// solved analytically. Surfaces wear a live Gray-Scott reaction-diffusion skin
// without exposing the retired 2D world's zone-navigation palette.
//
// solidCell() is mirrored bit-for-bit in JS as r3dSolid() for collision —
// both sides use uint hashing only, since float noise diverges between GLSL
// f32 and JS f64 and the player would clip through drawn walls.
//
// Game logic stays untouched: movement is still discrete grid steps; this
// module only owns facing (N/E/S/W) and the camera.

import { assetUrl } from '../platform/paths.js';
import { CELL, EYE as EYE_METERS, MATERIAL, PLAN_SCALE } from '../data/floorplan/legend.js';
import * as P3 from './props3d.js';
import { normalizePixelMeshSettings } from './pixel-mesh/settings.js';
import { PIXEL_MESH_FRAG } from './pixel-mesh/shader.js';
import { getLookProfile } from './look-profiles.js';

const MAX_CHUNKS = 48;
const RD_SIZE = 256;
const WATER_W = 96;
const WATER_H = 54;
const MAX_WATER_SOURCES = 4;
const MAX_LOCAL_LIGHTS = 8;
let RENDER_SCALE = 1;
let localLightCount=0;
const localLightPositions=new Float32Array(MAX_LOCAL_LIGHTS*4);
const localLightColors=new Float32Array(MAX_LOCAL_LIGHTS*4);

export function r3dSetRenderScale(value = 1) {
  const next = Math.max(0.5, Math.min(1, Number(value) || 1));
  if (Math.abs(next - RENDER_SCALE) < 0.001) return RENDER_SCALE;
  RENDER_SCALE = next;
  if (canvas && gl) resize();
  return RENDER_SCALE;
}

export function r3dRenderScale() { return RENDER_SCALE; }
const FOG_TEX = 128;

const BIOME_RGB = {
  drone:     [0.33, 0.47, 0.40],
  shimmer:   [0.63, 0.63, 0.70],
  noise:     [0.53, 0.47, 0.40],
  pulse:     [0.47, 0.53, 0.47],
  resonance: [0.40, 0.53, 0.53],
};
// Zone → tint, indexed by the ZONE ids in data/floorplan/legend.js.
// (none, dock, foyer, studio, natatorium, hall, practice, chapel, plant, stair,
// source-space, outer chapel, bell tower)
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
  0.10, 0.92, 0.24,   // source-space: executable green against the void
  0.72, 0.75, 0.78,   // outer chapel: colder, lower stone
  0.73, 0.61, 0.42,   // bell tower: timber, bronze and dust
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
precision highp sampler2DArray;
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

const WATER_FRAG = COMMON_GLSL + `
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform float uDt;
uniform float uDamping;
uniform float uReduceMotion;
uniform int uSourceCount;
uniform vec4 uSources[${MAX_WATER_SOURCES}]; // u, v, strength, radius
out vec4 o;
void main(){
  vec2 uv=gl_FragCoord.xy*uTexel;
  vec4 p=texture(uPrev,uv);
  float cur=p.r-.5;
  float prev=p.g-.5;
  float l=texture(uPrev,uv-vec2(uTexel.x,0.0)).r-.5;
  float r=texture(uPrev,uv+vec2(uTexel.x,0.0)).r-.5;
  float d=texture(uPrev,uv-vec2(0.0,uTexel.y)).r-.5;
  float u=texture(uPrev,uv+vec2(0.0,uTexel.y)).r-.5;
  float lap=(l+r+d+u-cur*4.0);
  float motion=mix(1.0,.18,clamp(uReduceMotion,0.0,1.0));
  float next=cur+(cur-prev)*uDamping*motion+lap*(0.42*uDt)*motion;
  for(int i=0;i<${MAX_WATER_SOURCES};i++){
    if(i>=uSourceCount)break;
    vec4 s=uSources[i];
    float dist=length((uv-s.xy)/max(vec2(.001),vec2(s.w)));
    next+=exp(-dist*dist*3.2)*s.z*motion;
  }
  float edge=min(min(uv.x,1.0-uv.x),min(uv.y,1.0-uv.y));
  next*=smoothstep(0.0,0.08,edge);
  next=clamp(next,-.48,.48);
  o=vec4(next+.5,cur+.5,0.0,1.0);
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
uniform int uLocalLightCount;
uniform vec4 uLocalLightPos[${MAX_LOCAL_LIGHTS}];
uniform vec4 uLocalLightColor[${MAX_LOCAL_LIGHTS}];
uniform int   uChunkCount;
uniform vec4  uChunkA[${MAX_CHUNKS}]; // x, z, radius, activity
uniform vec3  uChunkC[${MAX_CHUNKS}]; // biome rgb
uniform vec4  uKey;          // x, z, active, -
uniform vec4  uDoor;
uniform vec4  uHush;         // x, z, strength, -
uniform sampler2D uPlan;     // the authored building: R=floor G=ceil B=flags A=zone
uniform sampler2D uMat;      // R=material id
uniform sampler2D uSourceLayer; // R=source corpus layer for this runtime cell
uniform sampler2D uSourceSurface; // exact repository source rendered as a code-native surface
uniform sampler2D uPropColor;
uniform sampler2D uPropDepth;
uniform sampler2D uWaterHeight;
uniform sampler2DArray uSurfAlbedo, uSurfNormal, uSurfRough, uSurfHeight; // PBR surface layers
uniform sampler2DArray uSurfDream, uSurfDreamNext;             // current + staged generated albedo
uniform float uDreamMix[10];
uniform float uDreamReady;
uniform float uDreamNextReady;
uniform float uDreamBankBlend;
uniform float uDreamDetailGain;
uniform float uDreamChromaDrift;
uniform float uDreamRoughnessResponse;
uniform float uDreamNormalResponse;
uniform float uLocalDiffusion;
uniform float uSurfacesReady;
uniform float uPropsReady;
uniform float uPropNear;
uniform float uPropFar;
uniform vec2  uPlanSize;
uniform vec2  uPlanOrigin;
uniform float uUsePlan;      // 0 = procedural lattice (JUST SURF), 1 = the conservatory
uniform vec3  uZoneTint[13];
uniform float uSourceReady;
uniform vec4  uWaterBounds;  // min x, min z, max x, max z in runtime cells
uniform vec4  uWaterParams;  // active, level metres, murk, reduce motion
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
const int FLAG_CLOSED  = 64;
const int MAT_SERVICE = ${MATERIAL.serviceConcrete};
const int MAT_ACOUSTIC = ${MATERIAL.acousticFoam};
const int MAT_POOL = ${MATERIAL.poolTile};
const int MAT_WET = ${MATERIAL.wetTile};
const int MAT_WOOD = ${MATERIAL.woodVelvet};
const int MAT_PRACTICE = ${MATERIAL.practiceFoam};
const int MAT_CHAPEL = ${MATERIAL.chapelStone};
const int MAT_METAL = ${MATERIAL.metalPlant};
const int MAT_DOOR = ${MATERIAL.doorGlassDuct};
const int MAT_SOURCE_FIELD = ${MATERIAL.sourceField};
const int MAT_SOURCE_PATH = ${MATERIAL.sourcePath};
const int MAT_SOURCE_PAGE = ${MATERIAL.sourcePage};
const int MAT_SOURCE_FAULT = ${MATERIAL.sourceFault};

bool waterActive(){ return uWaterParams.x > 0.5 && uUsePlan > 0.5; }
bool inWaterBounds(vec2 p){
  return waterActive()
    && p.x >= uWaterBounds.x && p.x < uWaterBounds.z
    && p.y >= uWaterBounds.y && p.y < uWaterBounds.w;
}
vec2 waterUv(vec2 p){
  return clamp((p - uWaterBounds.xy) / max(vec2(0.001), uWaterBounds.zw - uWaterBounds.xy), vec2(0.0), vec2(1.0));
}
float waterHeightAt(vec2 p){
  if(!inWaterBounds(p)) return 0.0;
  float h = texture(uWaterHeight, waterUv(p)).r - 0.5;
  return h * (uWaterParams.w > 0.5 ? 0.06 : 0.20);
}
float waterEdge(vec2 p){
  if(!inWaterBounds(p)) return 0.0;
  vec2 uv=waterUv(p);
  float d=min(min(uv.x,1.0-uv.x),min(uv.y,1.0-uv.y));
  return 1.0-smoothstep(0.012,0.090,d);
}

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
  ivec2 local = p - ivec2(uPlanOrigin);
  if(local.x < 0 || local.y < 0 || local.x >= int(uPlanSize.x) || local.y >= int(uPlanSize.y)){
    r.solid = true; r.f = 0.0; r.c = 0.0; r.flags = FLAG_SOLID;
    return r;
  }
  vec4 t = texelFetch(uPlan, local, 0);
  r.flags = int(t.b * 255.0 + 0.5);
  r.solid = (r.flags & FLAG_SOLID) != 0;
  r.f = (t.r * H_RANGE + H_MIN) / CELL_METERS;
  r.c = (t.g * H_RANGE + H_MIN) / CELL_METERS;
  r.zone = int(t.a * 255.0 + 0.5);
  r.mat = int(texelFetch(uMat, local, 0).r * 255.0 + 0.5);
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

float line1(float v, float scale, float width){
  float d = abs(fract(v * scale) - 0.5);
  return 1.0 - smoothstep(width, width + 0.018, d);
}
float grid2(vec2 p, float scale, float width){
  vec2 d = abs(fract(p * scale) - 0.5);
  float g = min(d.x, d.y);
  return 1.0 - smoothstep(width, width + 0.015, g);
}
// 4×3 atlas of real PBR tiles. Slots:
//   0 brick   1 stonebrick   2 wood     3 quartzite  4 pool-mosaic  5 ceramic
//   6 terrazzo 7 travertine   8 rammed-earth          9 concrete-cladding
// Texture array + REPEAT wrap: true seamless tiling with mipmaps and anisotropy,
// no atlas-edge inset needed.
vec4 dreamSlotResponse(int slot){
  // detail, chroma, roughness, normal. Material identity is authored here;
  // glazed ceramic cannot react like timber or porous masonry.
  if(slot==0)return vec4(1.00,.48,1.00,.92); // brick
  if(slot==1)return vec4(.96,.38,1.08,1.00); // stone
  if(slot==2)return vec4(.82,.34,.72,.86);   // wood grain
  if(slot==3)return vec4(.74,.28,.58,.70);   // quartzite
  if(slot==4)return vec4(.68,.56,.34,.46);   // pool mosaic glaze
  if(slot==5)return vec4(.62,.22,.24,.38);   // white ceramic
  if(slot==6)return vec4(.78,.44,.62,.68);   // terrazzo
  if(slot==7)return vec4(.84,.36,.74,.80);   // travertine
  if(slot==8)return vec4(1.06,.42,1.14,.96); // rammed earth
  return vec4(.88,.30,.96,.78);              // concrete
}
vec3 surfaceTile(int slot, vec2 worldUv, float metresPerTile){
  vec3 tc=vec3(worldUv/metresPerTile,float(slot));
  vec3 base=texture(uSurfAlbedo,tc).rgb;
  vec2 hallucinationWarp=vec2(0.0);
  if(uLocalDiffusion>.001){
    // A local, material-space reaction-diffusion pass. It is sampled from
    // world UVs, not screen UVs, so the change sticks to brick, wood, concrete,
    // and tile instead of washing over the camera.
    vec2 rdUv=fract(worldUv/(metresPerTile*3.6) + vec2(float(slot)*0.071,float(slot)*0.113));
    float drift=uTime*(.012+.018*uLocalDiffusion);
    vec2 advect=vec2(
      sin(uTime*.31+worldUv.y*.17+float(slot)),
      cos(uTime*.27+worldUv.x*.19-float(slot))
    )*(.018+.028*uLocalDiffusion);
    vec3 rdA=texture(uRD,fract(rdUv+advect+vec2(drift,-drift*.71))).rgb;
    vec3 rdB=texture(uRD,fract(rdUv*1.73-advect+vec2(-drift*.43,drift*.57))).rgb;
    vec3 rd=mix(rdA,rdB,.38+.18*sin(uTime*.41+float(slot)));
    float vein=smoothstep(0.18,0.82,rd.g);
    float pit=smoothstep(0.62,0.96,rd.r-rd.g);
    vec3 oxidized=base*(0.78+0.30*vein) + vec3(0.045,0.040,0.030)*rd.g;
    vec3 etched=base*(0.92-0.18*pit);
    vec4 response=dreamSlotResponse(slot);
    base=mix(base,clamp(mix(oxidized,etched,pit),vec3(0.0),vec3(1.0)),clamp(uLocalDiffusion*response.x,0.0,1.0));
    float boil=(vein-.5)*sin(uTime*.83+rd.r*8.0+float(slot)*.7);
    base=clamp(base*(1.0+boil*.22*uLocalDiffusion*response.y),vec3(0.0),vec3(1.0));
    // Only the generated layer swims. PBR albedo and all geometry remain fixed,
    // so the wall appears to hallucinate instead of the whole camera sliding.
    hallucinationWarp=(rd.rg-.5)*(.11*uLocalDiffusion*response.y);
  }
  if(uDreamReady<.5)return base;
  vec3 dreamTc=vec3(tc.xy+hallucinationWarp,float(slot));
  vec3 dreamA=texture(uSurfDream,dreamTc).rgb;
  vec3 dreamB=texture(uSurfDreamNext,dreamTc).rgb;
  vec3 dream=mix(dreamA,dreamB,uDreamNextReady>.5?uDreamBankBlend:0.0);
  // Transfer material detail, not the generated image's illumination or
  // palette. Dividing by a coarse mip extracts local grain/mortar/weathering;
  // multiplying that into the authored albedo keeps the room from becoming a
  // flat img2img wash while remaining fixed in world-space UVs.
  vec3 dreamLowA=textureLod(uSurfDream,dreamTc,4.0).rgb;
  vec3 dreamLowB=textureLod(uSurfDreamNext,dreamTc,4.0).rgb;
  vec3 dreamLow=mix(dreamLowA,dreamLowB,uDreamNextReady>.5?uDreamBankBlend:0.0);
  vec3 detail=clamp(dream/max(dreamLow,vec3(.055)),vec3(.46),vec3(1.86));
  float baseLum=max(.035,dot(base,vec3(.2126,.7152,.0722)));
  float dreamLum=max(.035,dot(dreamLow,vec3(.2126,.7152,.0722)));
  vec3 neutralTone=vec3(baseLum);
  vec3 generatedTone=clamp(dreamLow*(baseLum/dreamLum),vec3(0.0),vec3(1.0));
  generatedTone=mix(neutralTone,generatedTone,clamp(uDreamChromaDrift,0.0,1.0));
  vec4 response=dreamSlotResponse(slot);
  vec3 detailed=clamp(base*mix(vec3(1.0),detail,clamp(uDreamDetailGain*response.x,0.0,1.7)),vec3(0.0),vec3(1.0));
  float generatedPresence=clamp((.24+uDreamChromaDrift*1.40)*uDreamMix[slot]*response.y,0.0,.58);
  detailed=mix(detailed,generatedTone,generatedPresence);
  // Generated texture may change colour and structure, never exposure. This is
  // the guardrail that lets the diffusion layer become obvious without ever
  // recreating the black-screen failure in the final compositor.
  float detailedLum=max(.025,dot(detailed,vec3(.2126,.7152,.0722)));
  detailed*=clamp(baseLum/detailedLum,.72,1.38);
  detailed=clamp(detailed,vec3(0.0),vec3(1.0));
  return mix(base,detailed,clamp(uDreamMix[slot]*response.x*1.12,0.0,1.0));
}
// One texture per surface, chosen by the room's material and whether we hit a
// wall or a floor. No cross-slot mixing — that is what smeared every texture
// across every surface.
void surfaceSlot(int mat,int surf,vec2 uv,out int slot,out float tileM,out float blend){
  if(surf==1){                                                  // walls — one texture per wall
    if(mat==MAT_ACOUSTIC){slot=9;tileM=1.6;blend=.84;}          // basement (studio) → concrete cladding
    else if(mat==MAT_PRACTICE){slot=8;tileM=1.8;blend=.84;}     // classroom → rammed earth
    else if(mat==MAT_WOOD){slot=7;tileM=1.6;blend=.86;}         // concert hall → travertine
    else if(mat==MAT_POOL||mat==MAT_WET){slot=5;tileM=1.0;blend=.84;} // natatorium → white ceramic
    else if(mat==MAT_METAL){slot=9;tileM=1.6;blend=.82;}        // plant → concrete cladding
    else if(mat==MAT_CHAPEL){slot=1;tileM=1.4;blend=.82;}       // chapel → split-face stone
    else {slot=0;tileM=1.4;blend=.80;}                          // general → reclaimed brick
  } else {                                                      // floor (surf==2)
    if(mat==MAT_ACOUSTIC||mat==MAT_PRACTICE){slot=6;tileM=1.8;blend=.88;} // basement/classroom → terrazzo
    else if(mat==MAT_WOOD||mat==MAT_CHAPEL){slot=3;tileM=2.0;blend=.90;}  // hall/chapel → quartzite
    else if(mat==MAT_WET){slot=4;tileM=0.9;blend=.92;}          // pool interior → blue mosaic
    else if(mat==MAT_POOL){slot=5;tileM=1.0;blend=.90;}         // pool deck → white ceramic
    else {slot=2;tileM=1.8;blend=.84;}                          // general → ash wood
  }
}
vec2 surfaceUv(int surf,vec3 p,vec3 n){
  if(surf!=1)return p.xz;
  return abs(n.x)>.5?vec2(p.z,p.y):vec2(p.x,p.y);
}
bool isSourceMaterial(int mat){
  return mat==MAT_SOURCE_FIELD||mat==MAT_SOURCE_PATH||mat==MAT_SOURCE_PAGE||mat==MAT_SOURCE_FAULT;
}
vec3 sourceSyntaxTint(int mat){
  if(mat==MAT_SOURCE_PATH)return vec3(.03,.70,1.00);
  if(mat==MAT_SOURCE_PAGE)return vec3(.86,.91,.82);
  if(mat==MAT_SOURCE_FAULT)return vec3(1.00,.10,.07);
  return vec3(.03,.92,.18);
}
float sourceGlyph(vec2 uv){
  if(uSourceReady<.5)return 0.0;
  return dot(texture(uSourceSurface,fract(uv)).rgb,vec3(.2126,.7152,.0722));
}
float sourceLayerAt(vec2 worldCell){
  ivec2 local=ivec2(floor(worldCell))-ivec2(uPlanOrigin);
  if(local.x<0||local.y<0||local.x>=int(uPlanSize.x)||local.y>=int(uPlanSize.y))return 0.0;
  return texelFetch(uSourceLayer,local,0).r*255.0;
}
vec3 architecturalSurface(int mat,int surf,vec3 p,vec3 n,vec3 fallback){
  if(uSurfacesReady<.5||surf==3)return fallback;
  vec2 uv=surfaceUv(surf,p,n);
  int slot; float tileM; float blend; surfaceSlot(mat,surf,uv,slot,tileM,blend);
  return mix(fallback,surfaceTile(slot,uv,tileM),blend);
}
float materialSeam(int mat, int surf, vec3 p, vec3 n){
  vec2 faceUv=surfaceUv(surf,p,n);
  if(mat == MAT_ACOUSTIC){
    return surf == 1
      ? max(line1(p.y, 1.65, 0.035), line1(faceUv.x, 0.72, 0.030)) * 0.34
      : grid2(p.xz, 0.62, 0.040) * 0.10;
  }
  if(mat == MAT_POOL || mat == MAT_WET){
    return grid2(faceUv, 1.75, 0.035) * (mat == MAT_WET ? 0.30 : 0.24);
  }
  if(mat == MAT_WOOD){
    float boards = surf == 1 ? line1(p.y, 1.25, 0.030) : line1(p.x + p.z * 0.18, 1.45, 0.030);
    return boards * 0.28;
  }
  if(mat == MAT_PRACTICE){
    return max(line1(p.y, 1.10, 0.035), line1(p.x + p.z, 0.58, 0.020)) * 0.22;
  }
  if(mat == MAT_CHAPEL){
    return max(line1(p.y, 0.52, 0.025), line1(faceUv.x, 0.38, 0.018)) * 0.26;
  }
  if(mat == MAT_METAL){
    return max(line1(p.y, 2.1, 0.030), line1(p.x - p.z, 0.42, 0.020)) * 0.30;
  }
  if(mat == MAT_DOOR){
    return max(line1(p.y, 2.7, 0.030), line1(faceUv.x, 1.1, 0.025)) * 0.38;
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
      if(inWaterBounds(vec2(cell) + 0.5) && cur.mat == MAT_WET && abs(rd.y) > 1e-4){
        float waterY = (uWaterParams.y / CELL_METERS) + waterHeightAt(vec2(cell) + 0.5);
        float tw = (waterY - ro.y) / rd.y;
        if(tw >= tEnter && tw <= tExit){
          vec3 wp = ro + rd * tw;
          if(inWaterBounds(wp.xz)){
            tHit = tw; surf = 4; n = vec3(0.0, 1.0, 0.0); hitZone = cur.zone; hitMat = MAT_WET; break;
          }
        }
      }
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

    // Door collision remains in the logical grid, but the visible leaf is a
    // textured mesh in the depth pass. Treating CLOSED as architecture made a
    // one-cell masonry slab appear in front of that model, with walkable-looking
    // slots at both jambs.
    bool closedLeaf = false;
    bool wall = false;
    if(nc.solid || closedLeaf){
      wall = (yB >= cur.f - 0.001 && yB <= cur.c + 0.001);
    } else {
      if(yB < nc.f) wall = true;                                      // riser
      else if(yB > nc.c && (nc.flags & FLAG_SKY) == 0) wall = true;   // header
    }
    if(wall && tExit <= MAXD){
      tHit = tExit; surf = 1; n = wn;
      hitZone = nc.solid ? cur.zone : nc.zone;
      hitMat = closedLeaf ? MAT_DOOR : (nc.solid ? cur.mat : nc.mat);
      break;
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
    // Architecture is differentiated by material and light, never by the old
    // zone-navigation colors. JUST SURF may keep its procedural world tint.
    vec3 tint = (uUsePlan > 0.5) ? vec3(0.62) : uWorldTint[int(worldIdx(pos.xz))];

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
    // The authored conservatory has real surface textures. Reaction-diffusion
    // belongs to JUST SURF; on architecture it reads as rolling fog bands.
    if(uUsePlan>.5){rdv=.5;rim=0.0;}

    // Procedural courses are fallback geometry only. Drawing them over real
    // PBR mortar/board joints produces the wireframe bands visible at grazing
    // angles.
    float seam = 0.0;

    // PBR surface relief: perturb the face normal by the surface's normal map so
    // brick mortar, wood grain and tile bevels catch the flashlight, and take the
    // per-texel roughness for the specular term. Sampled BEFORE lighting so the
    // Lambert term below sees the bumped normal.
    float surfRough = -1.0, surfaceOcclusion=1.0;
    bool pbrReady=false;int pbrSlot=0;float pbrTile=1.0,pbrBlend=0.0;vec2 pbrUv=vec2(0.0);
    vec3 toEye = ro - pos;
    vec3 toEyeM = roM - posM;
    bool sourceMaterial=isSourceMaterial(hitMat);
    vec2 sourceUv=surfaceUv(surf,posM,n)*vec2(.34,.46);
    float sourceLayer=clamp(sourceLayerAt(pos.xz)-1.0,0.0,7.0);
    sourceUv=vec2(sourceUv.x,fract(sourceUv.y)/8.0+sourceLayer/8.0);
    float sourceHeight=0.0;
    if(sourceMaterial){
      sourceHeight=sourceGlyph(sourceUv);
      float eps=1.0/2048.0;
      vec2 grad=vec2(
        sourceGlyph(sourceUv+vec2(eps,0.0))-sourceGlyph(sourceUv-vec2(eps,0.0)),
        sourceGlyph(sourceUv+vec2(0.0,eps))-sourceGlyph(sourceUv-vec2(0.0,eps))
      );
      vec3 T=(surf==1)?normalize(vec3(-n.z,0.0,n.x)):vec3(1.0,0.0,0.0);
      vec3 B=(surf==1)?vec3(0.0,1.0,0.0):vec3(0.0,0.0,1.0);
      n=normalize(n+T*grad.x*1.8+B*grad.y*1.8);
      surfRough=mix(.96,.48,smoothstep(.08,.82,sourceHeight));
      surfaceOcclusion=mix(.58,1.0,sourceHeight);
    } else if(uSurfacesReady > 0.5 && surf != 3 && surf != 4){
      int sslot; float stile, sblend;
      vec2 suv = surfaceUv(surf,posM,n);
      surfaceSlot(hitMat, surf, suv, sslot, stile, sblend);
      vec3 sc = vec3(suv / stile, float(sslot));
      // Height drives actual view-dependent parallax and reinforces the source
      // normal map. This is still a flat collision plane, but no longer a flat
      // picture pasted onto it: mortar, board joints and tile bevels shift and
      // self-shade as the eye crosses them.
      vec3 T = (surf == 1) ? normalize(vec3(-n.z, 0.0, n.x)) : vec3(1.0, 0.0, 0.0);
      if(dot(T, T) < 0.01) T = vec3(1.0, 0.0, 0.0);
      vec3 B = (surf == 1) ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
      vec3 viewDir=normalize(toEyeM);
      float h0=texture(uSurfHeight,sc).r;
      vec2 viewTs=vec2(dot(viewDir,T),dot(viewDir,B))/max(.30,abs(dot(viewDir,n)));
      sc.xy+=viewTs*(h0-.5)*(surf==1 ? .030 : .018);
      vec3 nm = texture(uSurfNormal, sc).rgb * 2.0 - 1.0;
      surfRough = texture(uSurfRough, sc).r;
      // The native reaction field and generated detail participate in the
      // physical response, not only in albedo. Geometry remains a flat,
      // authoritative collision plane; only micro-normal and roughness move.
      vec4 slotResponse=dreamSlotResponse(sslot);
      vec2 materialRdUv=fract(suv/(stile*3.6)+vec2(float(sslot)*.071,float(sslot)*.113));
      float materialRd=texture(uRD,materialRdUv).g-.5;
      vec3 dc=vec3(sc.xy,float(sslot));
      vec2 dtex=vec2(1.0/512.0,0.0);
      float dl=dot(texture(uSurfDream,dc-vec3(dtex.x,0.0,0.0)).rgb,vec3(.2126,.7152,.0722));
      float dr=dot(texture(uSurfDream,dc+vec3(dtex.x,0.0,0.0)).rgb,vec3(.2126,.7152,.0722));
      float dd=dot(texture(uSurfDream,dc-vec3(0.0,dtex.x,0.0)).rgb,vec3(.2126,.7152,.0722));
      float du=dot(texture(uSurfDream,dc+vec3(0.0,dtex.x,0.0)).rgb,vec3(.2126,.7152,.0722));
      vec2 dreamSlope=vec2(dr-dl,du-dd);
      nm.xy+=dreamSlope*uDreamNormalResponse*slotResponse.w*2.4;
      nm.xy+=materialRd*uLocalDiffusion*uDreamNormalResponse*slotResponse.w;
      surfRough=clamp(surfRough+materialRd*uLocalDiffusion*uDreamRoughnessResponse*slotResponse.z,0.04,1.0);
      n = normalize(n + (T * nm.x + B * nm.y) * 0.58);
      surfaceOcclusion=mix(.68,1.0,smoothstep(.12,.88,h0));
      pbrReady=true;pbrSlot=sslot;pbrTile=stile;pbrBlend=sblend;pbrUv=sc.xy*stile;
    }
    if(surf == 4){
      vec2 wuv=waterUv(pos.xz);
      vec2 texel=vec2(1.0/${WATER_W.toFixed(1)},1.0/${WATER_H.toFixed(1)});
      float hL=texture(uWaterHeight,clamp(wuv-vec2(texel.x,0.0),vec2(0.0),vec2(1.0))).r;
      float hR=texture(uWaterHeight,clamp(wuv+vec2(texel.x,0.0),vec2(0.0),vec2(1.0))).r;
      float hD=texture(uWaterHeight,clamp(wuv-vec2(0.0,texel.y),vec2(0.0),vec2(1.0))).r;
      float hU=texture(uWaterHeight,clamp(wuv+vec2(0.0,texel.y),vec2(0.0),vec2(1.0))).r;
      n=normalize(vec3(-(hR-hL)*2.8,1.0,-(hU-hD)*2.8));
    }
    if(!pbrReady&&!sourceMaterial)seam=materialSeam(hitMat,surf,posM,n);

    // Interior lighting: a lamp the player carries. Inverse-square falloff with
    // Lambert on the true face normal — this is what makes a corridor read as
    // a corridor (near walls bright, the far end swallowed).
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
    vec3 localLight=vec3(0.0);
    for(int li=0;li<${MAX_LOCAL_LIGHTS};li++){
      if(li>=uLocalLightCount)break;
      vec3 delta=uLocalLightPos[li].xyz-posM;
      float localDistance=length(delta),radius=max(.01,uLocalLightPos[li].w);
      float attenuation=pow(clamp(1.0-localDistance/radius,0.0,1.0),2.0);
      float localLambert=max(dot(n,normalize(delta)),0.0);
      localLight+=uLocalLightColor[li].rgb*uLocalLightColor[li].w*attenuation*(.18+.82*localLambert);
    }
    // The unlit floor is deliberately lifted. With the torch off — or taken — a
    // dark-adapted eye still resolves a room: you are not blind, you simply
    // cannot see WELL. A black screen is not horror, it is a bug you cannot play.
    float ambient = mix(0.034, 0.048, uLight);

    if(surf == 4){
      vec2 wuv=waterUv(pos.xz);
      float film=texture(uRD,wuv*1.8+vec2(uTime*.006,-uTime*.004)).g;
      float slow=sin((wuv.x*2.7+wuv.y*1.9+uTime*.11)*6.28318)*.5+.5;
      float scum=waterEdge(pos.xz);
      vec3 deep=vec3(0.010,0.026,0.018);
      vec3 mold=vec3(0.045,0.092,0.050);
      vec3 skin=mix(deep,mold,clamp(film*.75+slow*.18+scum*.52,0.0,1.0));
      float fres=pow(1.0-clamp(dot(normalize(toEye),n),0.0,1.0),3.0);
      float glitter=pow(clamp(dot(reflect(normalize(-toEye),n),normalize(fwd+vec3(0.0,.15,0.0))),0.0,1.0),34.0);
      float murk=clamp(uWaterParams.z,0.0,1.0);
      col=skin*(ambient*.82+lamp*.34)
        + vec3(.36,.48,.42)*glitter*beam*(1.0-uWaterParams.w*.65)
        + vec3(.09,.16,.13)*fres*(.22+lamp*.22)
        + vec3(.035,.070,.045)*scum*(.45+.35*film);
      col=mix(col,deep,murk*.34);
    } else {
      vec3 albedo;
      if(sourceMaterial){
        vec3 ink=sourceSyntaxTint(hitMat);
        albedo=ink*(.06+1.18*smoothstep(.035,.46,sourceHeight));
      }else{
        albedo=materialBase(hitMat, surf, tint, biome, rdv);
        albedo=pbrReady?mix(albedo,surfaceTile(pbrSlot,pbrUv,pbrTile),pbrBlend):architecturalSurface(hitMat,surf,posM,n,albedo);
      }
      // Roughness drives the highlight: a wet/polished tile (low roughness) throws
      // a tight bright spec; brick and wood stay matte. Tighten the lobe as it
      // smooths, so marble and ceramic actually glint under the torch.
      float gloss = (surfRough >= 0.0) ? (1.0 - surfRough) : 0.0;
      float specStr = (surfRough >= 0.0) ? (0.04 + 0.9 * gloss * gloss) : materialSpec(hitMat);
      float spec = specStr * pow(clamp(lambert, 0.0, 1.0), mix(6.0, 48.0, gloss)) * lamp;

      float emis = (surf == 2) ? 0.55 : (surf == 1 ? 0.30 : 0.12);
      col = albedo * (ambient*surfaceOcclusion + lamp + localLight)
          + vec3(0.55, 0.60, 0.62) * spec
          + rim * tint * (0.22 + uAudio * 0.45) * emis
          + glow * emis
          - seam * 0.30 * (ambient + lamp);
      if(waterActive() && surf == 1 && hitMat == MAT_WET){
        float caustic=(sin(posM.x*9.0+uTime*.9)+sin(posM.z*7.0-uTime*.7))*.5+.5;
        col+=vec3(.05,.08,.07)*caustic*lamp*.18*(1.0-uWaterParams.w*.75);
      }
    }
    col = col / (1.0 + col * 0.30);  // filmic-ish rolloff, tames the near field

    // No exploration fog and no distance haze. Darkness now comes only from
    // actual lighting, occlusion and material response, so doorways and the far
    // side of an atrium remain readable before the player crosses them.
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

  // Mesh props were rasterised with the exact same camera before this pass.
  // Reconstruct their view-space depth and compare it to the sector hit: a
  // piano behind a wall stays behind the wall, while a desk in front of it is
  // part of the same conditioning image the diffusion lens receives.
  // The metres to whatever this pixel actually hit. We have marched for it
  // already; before now we threw it away. ControlNet wants it.
  float zView = tHit < 0.0 ? uPropFar : tHit * CELL_METERS * max(0.001, dot(rd, fwd));

  if(uPropsReady > 0.5){
    vec2 propUv = gl_FragCoord.xy / uRes;
    vec4 prop = texture(uPropColor, propUv);
    float depth = texture(uPropDepth, propUv).r;
    if(prop.a > 0.5 && depth < 0.999999){
      float ndc = depth * 2.0 - 1.0;
      float propView = (2.0 * uPropNear * uPropFar) /
        (uPropFar + uPropNear - ndc * (uPropFar - uPropNear));
      float archView = zView;
      if(propView < archView + 0.015){ col = prop.rgb; zView = propView; }
    }
  }

  col += (grain - 0.5) * 0.035;             // film grain
  float vig = 1.0 - 0.42 * pow(length(uv * vec2(0.72, 0.9)), 2.2);
  col *= clamp(vig, 0.0, 1.0);

  // DEPTH RIDES IN THE ALPHA CHANNEL. The post pass reads .rgb and writes 1.0,
  // so nothing on screen can see this; the diffusion lens resolves it back out
  // (see r3dDepthInto). Stored as INVERSE depth — near is bright — because that
  // is the convention every SD depth ControlNet was trained on (MiDaS), and
  // handing a depth ControlNet a linear far-is-bright map inverts the room.
  o = vec4(col, 1.0 / (1.0 + zView * 0.14));
}`;

// ── Depth resolve ───────────────────────────────────────────────────────────
// Pulls the depth back out of the scene texture's alpha as a grey image. This
// is the whole reason a raymarcher beats a screenshot: we do not have to
// *estimate* depth with MiDaS like everyone else, we already know it exactly.
const DEPTH_FRAG = COMMON_GLSL + `
uniform sampler2D uSrc;
uniform vec2 uRes;
out vec4 o;
void main(){
  float d = texture(uSrc, gl_FragCoord.xy / uRes).a;
  o = vec4(vec3(d), 1.0);
}`;

// ── Post: upscale with slight chromatic drift ────────────────────────────────
// Fear is not a number on a bar; it is what the room starts doing to you. It
// tightens a vignette (tunnel vision), pulls the colour out (a frightened man
// stops seeing in colour), adds a grain that is the eye's own noise, and pushes
// the chromatic split — the picture stops holding itself together.
const POST_FRAG = COMMON_GLSL + `
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform float uFear;      // 0..1
uniform float uTimeP;
uniform float uGlassStrength;
uniform float uGlassFringe;
uniform float uGlassBloom;
uniform float uGlassGrain;
uniform float uReduceFlash;
uniform float uReduceMotion;
out vec4 o;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float f = clamp(uFear, 0.0, 1.0);
  float glass=clamp(uGlassStrength,0.0,1.0);
  // Phosphor behind thick instrument glass: restrained RGB separation rather
  // than a generic full-frame glitch.
  vec2 cd = (uv - 0.5) * ((0.0012*uGlassFringe) + f * 0.0075);
  vec3 c = vec3(
    texture(uSrc, uv + cd).r,
    texture(uSrc, uv).g,
    texture(uSrc, uv - cd).b);
  vec2 py=vec2(0.0,1.5/uRes.y);
  vec3 halo=(texture(uSrc,uv+py).rgb+texture(uSrc,uv-py).rgb)*0.5;
  float haloLum=dot(halo,vec3(.2126,.7152,.0722));
  c+=halo*haloLum*uGlassBloom*(1.0-uReduceFlash*.65)*.18;
  // A very fine aperture/grille modulation. It should read as hardware only
  // after the selective cell pass has already established the image.
  float grille=.985+.015*sin(gl_FragCoord.y*3.14159265);
  c*=mix(1.0,grille,glass);
  float reflection=pow(clamp(1.0-length((uv-vec2(.28,.08))*vec2(.72,1.8)),0.0,1.0),6.0);
  c+=vec3(.12,.24,.22)*reflection*glass*.055;
  // tunnel vision
  float d = length(uv - 0.5);
  c *= 1.0 - smoothstep(0.34 - f * 0.16, 0.80 - f * 0.30, d) * (0.25 + f * 0.65);
  // a frightened man stops seeing in colour
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, vec3(lum), f * 0.55);
  // the eye's own noise, which is always there and which you notice when afraid
  float noiseTime=mix(fract(uTimeP),0.0,uReduceMotion);
  float g = h21(gl_FragCoord.xy + noiseTime * 91.7) - 0.5;
  c += g * (0.008*uGlassGrain + f * 0.055);
  o = vec4(c, 1.0);
}`;

// ── GL plumbing ──────────────────────────────────────────────────────────────
let gl = null, canvas = null;
let progRD, progWater, progMarch, progPost, progDepth, progPixelMesh, progDatamosh;
// How frightened he is, 0..1. main.js owns the number; the post pass spends it.
let fearLevel = 0;
export function r3dSetFear(v) { fearLevel = Math.max(0, Math.min(1, v || 0)); }

export function r3dSetLocalLights(lights=[]){
  localLightPositions.fill(0);localLightColors.fill(0);
  localLightCount=Math.min(MAX_LOCAL_LIGHTS,Array.isArray(lights)?lights.length:0);
  for(let i=0;i<localLightCount;i++){
    const light=lights[i]||{},p=i*4,color=light.color||[1,.78,.52];
    localLightPositions[p]=Number(light.x)||0;localLightPositions[p+1]=Number(light.y)||0;localLightPositions[p+2]=Number(light.z)||0;localLightPositions[p+3]=Math.max(.01,Number(light.radius)||4);
    localLightColors[p]=Number(color[0])||0;localLightColors[p+1]=Number(color[1])||0;localLightColors[p+2]=Number(color[2])||0;localLightColors[p+3]=Math.max(0,Number(light.intensity)||0);
  }
  return localLightCount;
}
let lookFrom = getLookProfile('explore');
let lookTarget = lookFrom;
let lookStartedAt = 0;
let lookTransitionMs = 0;

function blendLayer(a, b, t) {
  const out = {};
  for (const key of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    const av = a?.[key], bv = b?.[key];
    out[key] = Number.isFinite(av) && Number.isFinite(bv) ? av + (bv - av) * t : (t < 1 ? av : bv);
  }
  return out;
}

function lookNowMs(override) {
  if (Number.isFinite(override)) return Number(override);
  return globalThis.performance?.now?.() ?? Date.now();
}

function currentLook(nowMs = lookNowMs()) {
  if (!lookTransitionMs || lookFrom === lookTarget) return lookTarget;
  const t = Math.max(0, Math.min(1, (nowMs - lookStartedAt) / lookTransitionMs));
  if (t >= 1) { lookFrom = lookTarget; lookTransitionMs = 0; return lookTarget; }
  return {
    ...lookTarget,
    material: blendLayer(lookFrom.material, lookTarget.material, t),
    vfd: blendLayer(lookFrom.vfd, lookTarget.vfd, t),
    glass: blendLayer(lookFrom.glass, lookTarget.glass, t),
  };
}

export function r3dSetLookProfile(id = 'explore', options = {}) {
  const now = lookNowMs(options.nowMs);
  const next = getLookProfile(id);
  const active = currentLook(now);
  const changed = next.id !== lookTarget.id;
  const transitionMs = Math.max(0, Number(options.transitionMs ?? next.transitionMs) || 0);

  // Scene-stack synchronization and completed material-bank uploads can both
  // reaffirm the current profile. Treat that as idempotent: restarting the
  // transition here can otherwise leave the compositor permanently between
  // two profiles. An explicit zero duration still acts as a useful snap/reset.
  if (!changed) {
    if (Object.hasOwn(options, 'transitionMs') && transitionMs === 0) {
      lookFrom = next;
      lookTarget = next;
      lookStartedAt = now;
      lookTransitionMs = 0;
    }
    if (options.resetMemory) r3dResetVfdMemory();
    return r3dLookStatus(now);
  }

  lookFrom = active;
  lookTarget = next;
  lookStartedAt = now;
  lookTransitionMs = transitionMs;
  if (changed || options.resetMemory) r3dResetVfdMemory();
  return r3dLookStatus(now);
}

export function r3dLookStatus(nowMs) {
  const profile = currentLook(lookNowMs(nowMs));
  return { id: lookTarget.id, bankId: lookTarget.bankId, transitioning: lookTransitionMs > 0, profile };
}

export function r3dSetPixelMesh(settings = {}) {
  pixelMeshSettings = normalizePixelMeshSettings({ ...pixelMeshSettings, ...settings });
  if (Number.isFinite(Number(settings.forceSignalUntil))) {
    pixelMeshStatus.forceSignalUntil = Math.max(pixelMeshStatus.forceSignalUntil, Number(settings.forceSignalUntil));
  }
  if (Number.isFinite(Number(settings.forceSignalMs))) {
    pixelMeshStatus.forceSignalUntil = Math.max(pixelMeshStatus.forceSignalUntil, pixelMeshNow() + Number(settings.forceSignalMs) / 1000);
  }
  pixelMeshStatus.enabled = true;
  return pixelMeshSettings;
}
export function r3dPixelMeshSettings() { return pixelMeshSettings; }
export function r3dPulsePixelMesh(ms = 1800) {
  pixelMeshStatus.forceSignalUntil = pixelMeshNow() + Math.max(250, Number(ms) || 1800) / 1000;
  pixelMeshStatus.enabled = true;
  return r3dPixelMeshStatus();
}
export function r3dPixelMeshStatus() {
  return {
    ...pixelMeshStatus,
    settings: pixelMeshSettings,
    forced: pixelMeshStatus.forceSignalUntil > pixelMeshNow(),
  };
}
let rdTexA, rdTexB, rdFboA, rdFboB, rdFlip = false, rdWarm = 0;
let waterTexA, waterTexB, waterFboA, waterFboB, waterFlip = false, waterWasActive = false;
let sceneTex, sceneFbo, fogTexture, surfaceTexture=null;
let meshTexA=null, meshTexB=null, meshFboA=null, meshFboB=null, meshFlip=false;
let datamoshSourceTex=null,datamoshSourceFbo=null,datamoshTexA=null,datamoshTexB=null,datamoshFboA=null,datamoshFboB=null,datamoshFlip=false;
let datamoshActive=false,datamoshProgress=0,datamoshReducedMotion=false,lastPostSourceFbo=null;
let surfAlbedoTex=null, surfNormalTex=null, surfRoughTex=null, surfHeightTex=null, surfDreamTex=null, surfDreamStageTex=null, anisoExt=null, anisoMax=1;
const SURFACE_LAYERS=10,SURFACE_TILE=512;
const surfDreamMix=new Float32Array(SURFACE_LAYERS);
let localDiffusionAvailability = 1;
let surfDreamReady=false,surfDreamNextReady=false,surfDreamTransitionStart=0,surfDreamTransitionMs=0;
let surfDreamActiveBank=null,surfDreamPendingBank=null;
let pixelMeshSettings = normalizePixelMeshSettings();
let lastPixelMeshAt = 0;
let vfdMovement = 0;
let vfdPreviousX = null, vfdPreviousZ = null;
const pixelMeshUniformCache = new Map();
const postUniformCache = new Map();
const pixelMeshStatus = {
  supported: false,
  shaderReady: false,
  enabled: false,
  framesSeen: 0,
  framesRendered: 0,
  lastProfile: 'explore',
  lastError: null,
  lastGlError: 0,
  forceSignalUntil: 0,
  sceneWidth: 0,
  sceneHeight: 0,
};
function pixelMeshNow() {
  return (globalThis.performance?.now?.() || Date.now()) / 1000;
}

export function r3dResetVfdMemory() {
  if (!gl || !meshFboA || !meshFboB) return false;
  const previous = gl.getParameter(gl.FRAMEBUFFER_BINDING);
  gl.clearColor(0, 0, 0, 0);
  for (const fbo of [meshFboA, meshFboB]) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, previous);
  meshFlip = false;
  return true;
}
// Load a vertical strip PNG/JPG (one tile per layer) as a WebGL2 texture array:
// mipmaps, REPEAT wrap and anisotropy — the quality an atlas cannot give a
// tiled surface. sRGB decode for colour, linear for normal/roughness.
function loadTextureArray(url, { srgb=false }={}){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      const size=img.width, layers=Math.round(img.height/size);
      const cv=document.createElement('canvas'); cv.width=size; cv.height=img.height;
      const cx=cv.getContext('2d'); cx.drawImage(img,0,0);
      const data=new Uint8Array(cx.getImageData(0,0,size,img.height).data.buffer);
      const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY,t);
      gl.texImage3D(gl.TEXTURE_2D_ARRAY,0,srgb?gl.SRGB8_ALPHA8:gl.RGBA8,size,size,layers,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.REPEAT);
      if(anisoExt) gl.texParameterf(gl.TEXTURE_2D_ARRAY,anisoExt.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,anisoMax));
      resolve(t);
    };
    img.onerror=reject; img.src=url.href||String(url);
  });
}
function makeSurfaceDreamTexture(){
  const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D_ARRAY,t);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY,0,gl.SRGB8_ALPHA8,SURFACE_TILE,SURFACE_TILE,SURFACE_LAYERS,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.REPEAT);
  if(anisoExt)gl.texParameterf(gl.TEXTURE_2D_ARRAY,anisoExt.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,anisoMax));
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  return t;
}
function initSurfaceDream(){
  surfDreamTex=makeSurfaceDreamTexture();surfDreamStageTex=makeSurfaceDreamTexture();
}
export function r3dBeginSurfaceDreamBank(bankId=null){
  if(!gl)return false;
  if(surfDreamStageTex)gl.deleteTexture(surfDreamStageTex);
  surfDreamStageTex=makeSurfaceDreamTexture();
  surfDreamPendingBank=bankId;
  surfDreamNextReady=false;
  surfDreamTransitionMs=0;
  return true;
}
export function r3dSetSurfaceDream(slot,image,mix=.68){
  if(!gl||!surfDreamStageTex||slot<0||slot>=SURFACE_LAYERS||!image)return false;
  const cv=document.createElement('canvas');cv.width=SURFACE_TILE;cv.height=SURFACE_TILE;
  cv.getContext('2d').drawImage(image,0,0,SURFACE_TILE,SURFACE_TILE);
  // Match loadTextureArray's orientation so generated mortar/grain lands on
  // the exact source texels it was conditioned from.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY,surfDreamStageTex);
  gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,slot,SURFACE_TILE,SURFACE_TILE,1,gl.RGBA,gl.UNSIGNED_BYTE,cv);
  surfDreamMix[slot]=Math.max(0,Math.min(.92,Number(mix)||0));
  return true;
}
export function r3dCommitSurfaceDream(mix=.68,options={}){
  if(!gl||!surfDreamStageTex)return false;
  gl.bindTexture(gl.TEXTURE_2D_ARRAY,surfDreamStageTex);
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  surfDreamMix.fill(Math.max(0,Math.min(.92,Number(mix)||0)));
  const bankId=options.bankId??surfDreamPendingBank;
  const transitionMs=Math.max(0,Number(options.transitionMs)||0);
  if(!surfDreamReady||transitionMs<=0){
    [surfDreamTex,surfDreamStageTex]=[surfDreamStageTex,surfDreamTex];
    surfDreamReady=true;surfDreamNextReady=false;surfDreamActiveBank=bankId;surfDreamPendingBank=null;
    surfDreamTransitionMs=0;
  }else{
    surfDreamNextReady=true;surfDreamPendingBank=bankId;
    surfDreamTransitionStart=globalThis.performance?.now?.()||Date.now();
    surfDreamTransitionMs=transitionMs;
  }
  return true;
}
export function r3dSetSurfaceDreamMix(mix=.68){
  surfDreamMix.fill(Math.max(0,Math.min(.92,Number(mix)||0)));
}
export function r3dClearSurfaceDream(){surfDreamMix.fill(0);surfDreamReady=false;surfDreamNextReady=false;surfDreamActiveBank=null;surfDreamPendingBank=null;}
export function r3dSetLocalDiffusionLevel(v=1){localDiffusionAvailability=Math.max(0,Math.min(1,Number(v)||0));}
function surfaceDreamBlend(nowMs=globalThis.performance?.now?.()||Date.now()){
  if(!surfDreamNextReady||!surfDreamTransitionMs)return 0;
  const t=Math.max(0,Math.min(1,(nowMs-surfDreamTransitionStart)/surfDreamTransitionMs));
  if(t>=1){
    [surfDreamTex,surfDreamStageTex]=[surfDreamStageTex,surfDreamTex];
    surfDreamReady=true;surfDreamNextReady=false;surfDreamActiveBank=surfDreamPendingBank;surfDreamPendingBank=null;surfDreamTransitionMs=0;
    return 0;
  }
  return t*t*(3-2*t);
}
export function r3dSurfaceDreamStats(){const look=currentLook();return{active:[...surfDreamMix].filter((v)=>v>0).length,mix:[...surfDreamMix],local:look.material.localDiffusion*localDiffusionAvailability,bank:surfDreamActiveBank,pendingBank:surfDreamPendingBank,transitioning:surfDreamNextReady};}
export function r3dSurfaceStats(){return{albedo:!!surfAlbedoTex,normal:!!surfNormalTex,roughness:!!surfRoughTex,height:!!surfHeightTex,ready:!!(surfAlbedoTex&&surfNormalTex&&surfRoughTex&&surfHeightTex)};}
let planTexture = null, materialTexture = null, sourceLayerTexture = null, planW = 0, planH = 0;
let planOriginX = 0, planOriginY = 0, sourceSurfaceTexture = null;
let uniforms = {};
let facing = 0; // 0=N(0,-1) 1=E 2=S 3=W
let yaw = 0, yawTarget = 0;
let camX = 0, camZ = 0, camY = EYE_METERS / CELL;
let lastT = 0;
let fogOrigin = [0, 0];
const marchUniformCache=new Map();
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
function reportGlError(label) {
  const code = gl?.getError?.() || 0;
  if (code) {
    const msg = `${label}: WebGL error ${code}`;
    pixelMeshStatus.lastGlError = code;
    pixelMeshStatus.lastError = msg;
    console.warn('[pixel-mesh]', msg);
  }
  return code;
}
function clearGlErrors() {
  if (!gl?.getError) return;
  while (gl.getError()) {}
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
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    console.warn('[r3d] framebuffer incomplete', status);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return f;
}

function makeMeshTex(w, h) {
  const t = makeTex(w, h);
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function debugSourceToNumber(source) {
  if (source === 'world') return 1;
  if (source === 'signal') return 2;
  if (source === 'memory') return 3;
  if (source === 'edge') return 4;
  if (source === 'mask') return 5;
  return 0;
}

function resolvePixelMeshCellScenePx() {
  const raw = pixelMeshSettings.cellSize;
  const authored = currentLook().vfd.cellPx || 8;
  const cssCell = raw === 'auto' ? authored : Math.max(4, Math.min(24, Number(raw) || authored));
  return Math.max(1, cssCell * (globalThis.devicePixelRatio || 1) * RENDER_SCALE);
}

function pixelMeshU(name) {
  if (!pixelMeshUniformCache.has(name)) pixelMeshUniformCache.set(name, gl.getUniformLocation(progPixelMesh, name));
  return pixelMeshUniformCache.get(name);
}

function postU(name) {
  if (!postUniformCache.has(name)) postUniformCache.set(name, gl.getUniformLocation(progPost, name));
  return postUniformCache.get(name);
}

const DATAMOSH_FRAG=`#version 300 es
precision highp float;
uniform sampler2D uSource;
uniform sampler2D uTower;
uniform sampler2D uPrevious;
uniform vec2 uResolution;
uniform float uProgress;
uniform float uTime;
uniform float uReducedMotion;
out vec4 outColor;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(){
  vec2 uv=gl_FragCoord.xy/uResolution;
  vec2 blockId=floor(uv*vec2(40.0,23.0));
  float seed=hash(blockId+floor(uProgress*36.0));
  vec2 motion=vec2(hash(blockId+11.0)-.5,hash(blockId+29.0)-.5);
  motion*=mix(.002,.045,uProgress)*(1.0-uReducedMotion);
  motion.x+=sin(uTime*1.7+blockId.y)*.006*uProgress*(1.0-uReducedMotion);
  vec3 source=texture(uSource,uv+motion*.25).rgb;
  vec3 tower=texture(uTower,uv-motion).rgb;
  vec3 previous=texture(uPrevious,uv-motion*.7).rgb;
  float reveal=smoothstep(seed-.12,seed+.12,uProgress);
  vec3 current=mix(source,tower,reveal);
  float retention=(1.0-uReducedMotion)*mix(.15,.78,uProgress)*step(.18,seed);
  vec3 carried=mix(current,previous,retention);
  float chroma=.009*uProgress*(1.0-uReducedMotion);
  carried.r=mix(carried.r,texture(uTower,uv+vec2(chroma,0)).r,reveal);
  carried.b=mix(carried.b,texture(uSource,uv-vec2(chroma,0)).b,1.0-reveal);
  outColor=vec4(carried,1.0);
}`;

export function r3dBeginDatamosh({reducedMotion=false}={}){
  if(!gl||!lastPostSourceFbo||!datamoshSourceFbo)return false;
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER,lastPostSourceFbo);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,datamoshSourceFbo);
  gl.blitFramebuffer(0,0,uniforms.sceneW,uniforms.sceneH,0,0,uniforms.sceneW,uniforms.sceneH,gl.COLOR_BUFFER_BIT,gl.NEAREST);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  datamoshActive=true;datamoshProgress=0;datamoshReducedMotion=!!reducedMotion;datamoshFlip=false;
  return true;
}
export function r3dSetDatamoshProgress(value){datamoshProgress=Math.max(0,Math.min(1,Number(value)||0));return datamoshProgress;}
export function r3dEndDatamosh(){datamoshActive=false;datamoshProgress=0;return true;}
export function r3dDatamoshStatus(){return{active:datamoshActive,progress:datamoshProgress,reducedMotion:datamoshReducedMotion};}

function runDatamoshPass(towerTex,now){
  if(!datamoshActive||!progDatamosh||!datamoshSourceTex)return towerTex;
  const dstFbo=datamoshFlip?datamoshFboA:datamoshFboB,dstTex=datamoshFlip?datamoshTexA:datamoshTexB,previous=datamoshFlip?datamoshTexB:datamoshTexA;datamoshFlip=!datamoshFlip;
  gl.useProgram(progDatamosh);gl.bindFramebuffer(gl.FRAMEBUFFER,dstFbo);gl.viewport(0,0,uniforms.sceneW,uniforms.sceneH);
  const u=(name)=>gl.getUniformLocation(progDatamosh,name);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,datamoshSourceTex);gl.uniform1i(u('uSource'),0);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,towerTex);gl.uniform1i(u('uTower'),1);
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,previous||datamoshSourceTex);gl.uniform1i(u('uPrevious'),2);
  gl.uniform2f(u('uResolution'),uniforms.sceneW,uniforms.sceneH);gl.uniform1f(u('uProgress'),datamoshProgress);gl.uniform1f(u('uTime'),now);gl.uniform1f(u('uReducedMotion'),datamoshReducedMotion?1:0);
  gl.drawArrays(gl.TRIANGLES,0,3);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return dstTex;
}

function runPixelMeshPass(state, now) {
  pixelMeshStatus.framesSeen += 1;
  pixelMeshStatus.shaderReady = !!progPixelMesh;
  pixelMeshStatus.supported = !!(gl && progPixelMesh && meshTexA && meshTexB && meshFboA && meshFboB);
  pixelMeshStatus.sceneWidth = uniforms.sceneW || 0;
  pixelMeshStatus.sceneHeight = uniforms.sceneH || 0;

  const forceSignal = Math.max(0, Math.min(1, pixelMeshStatus.forceSignalUntil > now ? 1 : 0));
  const effectiveSettings = pixelMeshSettings;
  const look = currentLook();
  pixelMeshStatus.lastProfile = look.id;
  pixelMeshStatus.enabled = true;

  if (!pixelMeshStatus.supported) {
    if (pixelMeshStatus.enabled) pixelMeshStatus.lastError = pixelMeshStatus.lastError || 'pixel mesh WebGL resources unavailable';
    return sceneTex;
  }
  const dstFbo = meshFlip ? meshFboA : meshFboB;
  const dstTex = meshFlip ? meshTexA : meshTexB;
  const prevTex = meshFlip ? meshTexB : meshTexA;
  meshFlip = !meshFlip;

  // Other passes may leave a WebGL diagnostic behind. Clear before the pixel
  // pass so __chunkSurferPixelMesh.status() reports this layer, not stale GL.
  clearGlErrors();
  gl.useProgram(progPixelMesh);
  gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo);
  gl.viewport(0, 0, uniforms.sceneW, uniforms.sceneH);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sceneTex);
  gl.uniform1i(pixelMeshU('uSrc'), 0);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, prevTex);
  gl.uniform1i(pixelMeshU('uPrev'), 1);

  gl.uniform2f(pixelMeshU('uRes'), uniforms.sceneW, uniforms.sceneH);
  gl.uniform1f(pixelMeshU('uTime'), now);
  const dt = lastPixelMeshAt > 0 ? Math.max(0, Math.min(0.25, now - lastPixelMeshAt)) : 1 / 60;
  lastPixelMeshAt = now;
  gl.uniform1f(pixelMeshU('uDt'), dt);
  gl.uniform1f(pixelMeshU('uCellPx'), resolvePixelMeshCellScenePx());
  gl.uniform1f(pixelMeshU('uBaseRetention'), look.vfd.baseRetention);
  gl.uniform1f(pixelMeshU('uPaletteAmount'), look.vfd.paletteAmount);
  gl.uniform1f(pixelMeshU('uSignalAmount'), forceSignal > 0 ? Math.max(look.vfd.signalGain, 1.15) : look.vfd.signalGain);
  gl.uniform1f(pixelMeshU('uEdgeGain'), look.vfd.edgeGain);
  gl.uniform1f(pixelMeshU('uCoverage'), look.vfd.coverage);
  gl.uniform1f(pixelMeshU('uGlowAmount'), forceSignal > 0 ? Math.max(look.vfd.glow, 0.48) : look.vfd.glow);
  gl.uniform1f(pixelMeshU('uPersistenceMs'), effectiveSettings.memory ? look.vfd.persistenceMs : 16);
  gl.uniform1f(pixelMeshU('uAperture'), look.vfd.aperture);
  gl.uniform1f(pixelMeshU('uAmberAmount'), look.vfd.amber);
  gl.uniform1f(pixelMeshU('uAudio'), Math.max(0, Math.min(1, Number(state?.audio) || 0)));
  gl.uniform1f(pixelMeshU('uFear'), fearLevel);
  gl.uniform1f(pixelMeshU('uReduceFlash'), effectiveSettings.reduceFlash ? 1 : 0);
  gl.uniform1f(pixelMeshU('uReduceMotion'), effectiveSettings.reduceMotion ? 1 : 0);
  gl.uniform1f(pixelMeshU('uDebugSource'), debugSourceToNumber(effectiveSettings.debugSource));
  gl.uniform1f(pixelMeshU('uForceSignal'), forceSignal);
  gl.uniform1f(pixelMeshU('uMovement'), vfdMovement);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
  pixelMeshStatus.framesRendered += 1;
  pixelMeshStatus.lastError = null;
  reportGlError('pixel mesh pass');
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  lastPostSourceFbo=dstFbo;
  return dstTex;
}
function loadImageTexture(url){
  return new Promise((resolve,reject)=>{
    const img=new Image();img.onload=()=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.SRGB8_ALPHA8,gl.RGBA,gl.UNSIGNED_BYTE,img);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);resolve(t);};img.onerror=reject;img.src=url.href||String(url);
  });
}

export function r3dInit(mapEl) {
  canvas = document.createElement('canvas');
  canvas.className = 'r3d';
  canvas.style.cssText = 'display:block;width:100%;height:100%;';
  // Insert beneath, never wipe: the UI glyph layer and the diffusion overlay
  // are siblings that may already be mounted here.
  mapEl.insertBefore(canvas, mapEl.firstChild);
  // preserveDrawingBuffer: the diffusion client captures this canvas with
  // toBlob() outside the rAF that drew it.
  gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error('webgl2 unavailable');

  progRD = program(RD_FRAG);
  progWater = program(WATER_FRAG);
  progMarch = program(MARCH_FRAG);
  progPost = program(POST_FRAG);
  progDepth = program(DEPTH_FRAG);
  progDatamosh = program(DATAMOSH_FRAG);
  try {
    progPixelMesh = program(PIXEL_MESH_FRAG);
    pixelMeshStatus.shaderReady = true;
    pixelMeshStatus.supported = true;
    pixelMeshStatus.lastError = null;
  } catch (err) {
    progPixelMesh = null;
    pixelMeshStatus.shaderReady = false;
    pixelMeshStatus.supported = false;
    pixelMeshStatus.lastError = err?.message || String(err);
    console.error('pixel mesh shader unavailable; continuing without VFD mesh', err);
  }
  P3.props3dInit(gl);

  gl.getExtension('EXT_color_buffer_float'); // render targets for the RD field
  anisoExt = gl.getExtension('EXT_texture_filter_anisotropic');
  if(anisoExt) anisoMax = gl.getParameter(anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
  initSurfaceDream();

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
  const waterSeed = new Float32Array(WATER_W * WATER_H * 4);
  for (let i = 0; i < WATER_W * WATER_H; i += 1) {
    waterSeed[i * 4] = 0.5;
    waterSeed[i * 4 + 1] = 0.5;
    waterSeed[i * 4 + 3] = 1;
  }
  waterTexA = makeTex(WATER_W, WATER_H, waterSeed, 'rgba16f');
  waterTexB = makeTex(WATER_W, WATER_H, waterSeed, 'rgba16f');
  for (const t of [waterTexA, waterTexB]) {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  waterFboA = makeFbo(waterTexA);
  waterFboB = makeFbo(waterTexB);
  fogTexture = makeTex(FOG_TEX, FOG_TEX, new Uint8Array(FOG_TEX * FOG_TEX).fill(255), 'r8');
  resize();
  P3.loadPropPack(assetUrl('assets/conservatory-props.glb'))
    .then(()=>P3.addPropPack(assetUrl('assets/conservatory-doors.glb')))
    .then(()=>P3.addPropPack(assetUrl('assets/tuning-fork.glb')))
    .catch((err)=>console.warn('prop pack unavailable',err));
  P3.loadPortraitAtlas(assetUrl('assets/portraits/portrait-atlas.webp'))
    .catch((err)=>console.warn('portrait atlas unavailable',err));
  Promise.all([
    loadTextureArray(assetUrl('assets/surfaces/surface-albedo.jpg'),{srgb:true}),
    loadTextureArray(assetUrl('assets/surfaces/surface-normal.png')),
    loadTextureArray(assetUrl('assets/surfaces/surface-rough.jpg')),
    loadTextureArray(assetUrl('assets/surfaces/surface-height.png')),
  ]).then(([a,n,r,h])=>{surfAlbedoTex=a;surfNormalTex=n;surfRoughTex=r;surfHeightTex=h;surfaceTexture=a;})
    .catch((err)=>console.warn('surface arrays unavailable; using native material fallback',err));
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
  if (meshTexA) {
    gl.deleteTexture(meshTexA); gl.deleteTexture(meshTexB);
    gl.deleteFramebuffer(meshFboA); gl.deleteFramebuffer(meshFboB);
  }
  for(const item of [[datamoshSourceTex,datamoshSourceFbo],[datamoshTexA,datamoshFboA],[datamoshTexB,datamoshFboB]]){if(item[0])gl.deleteTexture(item[0]);if(item[1])gl.deleteFramebuffer(item[1]);}
  sceneTex = makeTex(sw, sh);
  sceneFbo = makeFbo(sceneTex);
  meshTexA = makeMeshTex(sw, sh);
  meshTexB = makeMeshTex(sw, sh);
  meshFboA = makeFbo(meshTexA);
  meshFboB = makeFbo(meshTexB);
  datamoshSourceTex=makeMeshTex(sw,sh);datamoshSourceFbo=makeFbo(datamoshSourceTex);
  datamoshTexA=makeMeshTex(sw,sh);datamoshTexB=makeMeshTex(sw,sh);datamoshFboA=makeFbo(datamoshTexA);datamoshFboB=makeFbo(datamoshTexB);
  meshFlip = false;
  lastPixelMeshAt = 0;
  pixelMeshStatus.sceneWidth = sw;
  pixelMeshStatus.sceneHeight = sh;
  pixelMeshStatus.supported = !!progPixelMesh;
  P3.props3dResize(sw, sh);
  uniforms.sceneW = sw; uniforms.sceneH = sh;
  r3dResetVfdMemory();
}

// ── Facing / input hooks (main.js calls these in 3d mode) ────────────────────
export function r3dTurn(dir) {
  facing = (facing + dir + 4) % 4;
  yawTarget += dir * Math.PI / 2;
  r3dResetVfdMemory();
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
  r3dResetVfdMemory();
}

// The authored building, as the shader sees it. This is literally the array
// JS collision reads (world/floorplan.js `rgba`), so there is nothing to keep
// in sync — the drawn wall IS the solid wall.
export function r3dSetPlan(rgba, w, h, material = null, options = {}) {
  if (!gl) return;
  planW = w; planH = h;
  planOriginX = Number(options.originX) || 0;
  planOriginY = Number(options.originY) || 0;
  if (planTexture) gl.deleteTexture(planTexture);
  if (materialTexture) gl.deleteTexture(materialTexture);
  if (sourceLayerTexture) gl.deleteTexture(sourceLayerTexture);
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

  const sourceLayer = options.sourceLayer || new Uint8Array(w * h);
  sourceLayerTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, sourceLayerTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, sourceLayer);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

export function r3dSetProps(instances) { P3.setPropInstances(instances); }
export function r3dSetDynamicProps(instances) { P3.setDynamicPropInstances(instances); }
export function r3dSetSourceTextInstances(instances) { P3.setSourceTextInstances(instances); }
export function r3dSetHushProp(id) { P3.setHushProp(id); }
export function r3dPropStats() { return P3.propPackStats(); }

// Rasterise only exact corpus lines into the material atlas. The texture is a
// data source for albedo, glyph-edge normals and roughness; source materials do
// not sample the conventional surface arrays.
export function r3dSetSourceSurface(lines = []) {
  if (!gl || typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 2048;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '20px monospace'; ctx.textBaseline = 'top';
  const exact = (Array.isArray(lines) ? lines : []).map((line) => String(line?.text ?? line)).filter(Boolean);
  const palette = ['#08ef43', '#06bfff', '#eff3df', '#ff3028'];
  const grouped=new Map();
  for(const line of Array.isArray(lines)?lines:[]){const layer=Math.max(1,Math.min(8,Number(line?.sourceLayer)||1));if(!grouped.has(layer))grouped.set(layer,[]);grouped.get(layer).push(String(line?.text??line));}
  for(let layer=1;layer<=8;layer+=1){
    const layerLines=grouped.get(layer)||exact;
    for(let row=0;row<11;row+=1){
      const text=layerLines.length?layerLines[row%layerLines.length]:'';
      ctx.fillStyle=palette[(layer+row)%palette.length];
      ctx.fillText(text,4,(layer-1)*256+row*22+4);
    }
  }
  if (sourceSurfaceTexture) gl.deleteTexture(sourceSurfaceTexture);
  sourceSurfaceTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, sourceSurfaceTexture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  return true;
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
  // Retained as a compatibility no-op for the 2D exploration map. The 3D
  // architecture and prop passes receive a permanently clear texture.
  fogOrigin = [px - FOG_TEX / 2, py - FOG_TEX / 2];
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

function resetWaterField() {
  if (!gl || !waterFboA || !waterFboB) return;
  const previous = gl.getParameter(gl.FRAMEBUFFER_BINDING);
  gl.clearColor(0.5, 0.5, 0, 1);
  for (const fbo of [waterFboA, waterFboB]) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, previous);
  waterFlip = false;
}

function updateWaterField(water, dt) {
  const active = !!water?.active;
  if (active !== waterWasActive) {
    resetWaterField();
    waterWasActive = active;
  }
  if (!gl || !progWater || !waterTexA || !waterTexB || !active) return waterFlip ? waterTexB : waterTexA;
  const src = waterFlip ? waterTexB : waterTexA;
  const dst = waterFlip ? waterFboA : waterFboB;
  gl.useProgram(progWater);
  gl.bindFramebuffer(gl.FRAMEBUFFER, dst);
  gl.viewport(0, 0, WATER_W, WATER_H);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, src);
  gl.uniform1i(gl.getUniformLocation(progWater, 'uPrev'), 0);
  gl.uniform2f(gl.getUniformLocation(progWater, 'uTexel'), 1 / WATER_W, 1 / WATER_H);
  gl.uniform1f(gl.getUniformLocation(progWater, 'uDt'), Math.max(0.05, Math.min(1.6, dt * 60)));
  gl.uniform1f(gl.getUniformLocation(progWater, 'uDamping'), 0.985);
  gl.uniform1f(gl.getUniformLocation(progWater, 'uReduceMotion'), water.reduceMotion ? 1 : 0);
  const rawSources = Array.isArray(water.rippleSources) ? water.rippleSources : [];
  const n = Math.min(MAX_WATER_SOURCES, rawSources.length);
  const packed = new Float32Array(MAX_WATER_SOURCES * 4);
  for (let i = 0; i < n; i += 1) {
    const source = rawSources[i] || {};
    packed.set([
      Math.max(0, Math.min(1, Number(source.u) || 0)),
      Math.max(0, Math.min(1, Number(source.v) || 0)),
      Math.max(-0.5, Math.min(0.5, Number(source.strength) || 0)),
      Math.max(0.015, Math.min(0.75, Number(source.radius) || 0.1)),
    ], i * 4);
  }
  gl.uniform1i(gl.getUniformLocation(progWater, 'uSourceCount'), n);
  gl.uniform4fv(gl.getUniformLocation(progWater, 'uSources[0]'), packed);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  waterFlip = !waterFlip;
  return waterFlip ? waterTexB : waterTexA;
}

// state: { px, py, tileW, tileH, worldCount, worldTints:[[r,g,b]×5],
//          chunks:[{x,y,r,act,col}], key:{x,y}|null, door:{x,y}|null,
//          hush:{x,y,strength}|null, audio:0..1 }
export function r3dFrame(state) {
  if (!gl) return;
  lastBeacons = { key: state.key || null, door: state.door || null };
  const now = performance.now() / 1000;
  const dt = Math.min(0.1, now - (lastT || now));
  lastT = now;

  // main.js supplies a frame-interpolated physical player position. The camera
  // is that position—never a follower with its own lag or acceleration state.
  const nextCamX=state.px+0.5, nextCamZ=state.py+0.5;
  const travel=vfdPreviousX==null?0:Math.hypot(nextCamX-vfdPreviousX,nextCamZ-vfdPreviousZ);
  if(travel>1.25)r3dResetVfdMemory();
  vfdMovement=Math.max(0,Math.min(1,travel/Math.max(dt*3.0,0.001)));
  vfdPreviousX=nextCamX;vfdPreviousZ=nextCamZ;
  camX=nextCamX;
  camZ=nextCamZ;
  yaw += (yawTarget - yaw) * (1 - Math.exp(-dt * 12));
  // Eye height above whatever floor you are standing on. Eased, so a stair is
  // a climb rather than a series of teleports.
  const floorGoal = ((state.floorH ?? 0) + EYE_METERS) / CELL;
  camY += (floorGoal - camY) * (1 - Math.exp(-dt * 14));
  // A flashlight snaps. The only easing is a filament's breath on the way out.
  const lightGoal = typeof state.light === 'number'
    ? Math.max(0, Math.min(1, state.light))
    : state.light === false ? 0 : 1;
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
  const waterTex = updateWaterField(state.water, dt);

  P3.renderPropPass({
    camX: camX * CELL, camY: camY * CELL, camZ: camZ * CELL,
    yaw, light: lightEase, fogTexture, fogOrigin, fogSize:FOG_TEX,
    cellMeters:CELL, zoneTints:ZONE_TINTS,
    localLightCount,localLightPositions,localLightColors,
  });

  // march into low-res scene buffer
  gl.useProgram(progMarch);
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
  gl.viewport(0, 0, uniforms.sceneW, uniforms.sceneH);
  const U = (n) => {if(!marchUniformCache.has(n))marchUniformCache.set(n,gl.getUniformLocation(progMarch,n));return marchUniformCache.get(n);};
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
  gl.uniform1i(U('uLocalLightCount'),localLightCount);
  gl.uniform4fv(U('uLocalLightPos[0]'),localLightPositions);
  gl.uniform4fv(U('uLocalLightColor[0]'),localLightColors);
  gl.uniform1f(U('uUsePlan'), state.plan ? 1 : 0);
  if (state.plan && planTexture) {
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, planTexture);
    gl.uniform1i(U('uPlan'), 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, materialTexture);
    gl.uniform1i(U('uMat'), 3);
    gl.uniform2f(U('uPlanSize'), planW, planH);
    gl.uniform2f(U('uPlanOrigin'), planOriginX, planOriginY);
    gl.uniform3fv(U('uZoneTint[0]'), ZONE_TINTS);
  }
  gl.uniform1f(U('uSourceReady'), sourceSurfaceTexture ? 1 : 0);
  gl.activeTexture(gl.TEXTURE13);gl.bindTexture(gl.TEXTURE_2D,sourceSurfaceTexture);gl.uniform1i(U('uSourceSurface'),13);
  gl.activeTexture(gl.TEXTURE14);gl.bindTexture(gl.TEXTURE_2D,sourceLayerTexture);gl.uniform1i(U('uSourceLayer'),14);
  const propTargets=P3.propTargets();
  gl.uniform1f(U('uPropsReady'),propTargets.ready?1:0);
  gl.uniform1f(U('uPropNear'),propTargets.near);
  gl.uniform1f(U('uPropFar'),propTargets.far);
  if(propTargets.ready){
    gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,propTargets.color);gl.uniform1i(U('uPropColor'),4);
    gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,propTargets.depth);gl.uniform1i(U('uPropDepth'),5);
  }
  gl.activeTexture(gl.TEXTURE12);gl.bindTexture(gl.TEXTURE_2D,waterTex || waterTexA);gl.uniform1i(U('uWaterHeight'),12);
  const water=state.water||{};
  const bounds=water.basinBounds||{};
  gl.uniform4f(U('uWaterBounds'), bounds.minX||0, bounds.minY||0, bounds.maxX||0, bounds.maxY||0);
  gl.uniform4f(U('uWaterParams'), water.active?1:0, Number(water.levelM ?? -0.06), Number(water.murk ?? 0.85), water.reduceMotion?1:0);
  const look=currentLook();
  const bankBlend=surfaceDreamBlend();
  gl.uniform1f(U('uSurfacesReady'),surfAlbedoTex&&surfNormalTex&&surfRoughTex&&surfHeightTex?1:0);
  if(surfAlbedoTex&&surfNormalTex&&surfRoughTex&&surfHeightTex){
    gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D_ARRAY,surfAlbedoTex);gl.uniform1i(U('uSurfAlbedo'),6);
    gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D_ARRAY,surfNormalTex);gl.uniform1i(U('uSurfNormal'),7);
    gl.activeTexture(gl.TEXTURE8);gl.bindTexture(gl.TEXTURE_2D_ARRAY,surfRoughTex);gl.uniform1i(U('uSurfRough'),8);
    gl.activeTexture(gl.TEXTURE9);gl.bindTexture(gl.TEXTURE_2D_ARRAY,surfDreamTex);gl.uniform1i(U('uSurfDream'),9);
    gl.activeTexture(gl.TEXTURE10);gl.bindTexture(gl.TEXTURE_2D_ARRAY,surfHeightTex);gl.uniform1i(U('uSurfHeight'),10);
    gl.activeTexture(gl.TEXTURE11);gl.bindTexture(gl.TEXTURE_2D_ARRAY,surfDreamStageTex);gl.uniform1i(U('uSurfDreamNext'),11);
  }
  gl.uniform1f(U('uDreamReady'),surfDreamReady&&surfDreamMix.some((v)=>v>0)?1:0);
  gl.uniform1f(U('uDreamNextReady'),surfDreamNextReady?1:0);
  gl.uniform1f(U('uDreamBankBlend'),bankBlend);
  gl.uniform1f(U('uDreamDetailGain'),look.material.detailGain);
  gl.uniform1f(U('uDreamChromaDrift'),look.material.chromaDrift);
  gl.uniform1f(U('uDreamRoughnessResponse'),look.material.roughnessResponse);
  gl.uniform1f(U('uDreamNormalResponse'),look.material.normalResponse);
  gl.uniform1f(U('uLocalDiffusion'),look.material.localDiffusion*localDiffusionAvailability);
  gl.uniform1fv(U('uDreamMix[0]'),surfDreamMix);
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

  const pixelSourceTex = runPixelMeshPass(state, now);
  const postSourceTex = runDatamoshPass(pixelSourceTex,now);

  // post upscale to screen
  gl.useProgram(progPost);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, postSourceTex);
  gl.uniform1i(postU('uSrc'), 0);
  gl.uniform2f(postU('uRes'), canvas.width, canvas.height);
  gl.uniform1f(postU('uFear'), fearLevel);
  gl.uniform1f(postU('uTimeP'), performance.now() * 0.001);
  const postLook=currentLook();
  gl.uniform1f(postU('uGlassStrength'), postLook.glass.strength);
  gl.uniform1f(postU('uGlassFringe'), postLook.glass.fringe);
  gl.uniform1f(postU('uGlassBloom'), postLook.glass.bloom);
  gl.uniform1f(postU('uGlassGrain'), postLook.glass.grain);
  gl.uniform1f(postU('uReduceFlash'), pixelMeshSettings.reduceFlash?1:0);
  gl.uniform1f(postU('uReduceMotion'), pixelMeshSettings.reduceMotion?1:0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

export function r3dCanvas() { return canvas; }

// ── The depth the lens gets ─────────────────────────────────────────────────
// Resolves the alpha channel of the last rendered frame into a grey depth image
// on a 2D canvas the diffusion client can encode. Pulled ON DEMAND — only when
// a frame is actually being sent to the GPU (~10fps), never once per rAF —
// because readPixels is a stall, and a stall in the render loop is a stutter in
// a horror game.
//
// Exact, not estimated. Every other img2img pipeline in the world runs MiDaS to
// GUESS the depth of a picture. We marched the room; we know.
let depthTex=null, depthFbo=null, depthSize=0, depthCanvas=null, depthCtx=null, depthPix=null, depthImg=null;
export function r3dDepthCanvas(size = 512) {
  if (!gl || !sceneTex) return null;
  if (depthSize !== size) {
    if (depthTex) { gl.deleteTexture(depthTex); gl.deleteFramebuffer(depthFbo); }
    depthTex = makeTex(size, size);
    depthFbo = makeFbo(depthTex);
    depthCanvas = document.createElement('canvas');
    depthCanvas.width = depthCanvas.height = size;
    depthCtx = depthCanvas.getContext('2d');
    depthPix = new Uint8Array(size * size * 4);
    depthImg = depthCtx.createImageData(size, size);
    depthSize = size;
  }

  gl.useProgram(progDepth);
  gl.bindFramebuffer(gl.FRAMEBUFFER, depthFbo);
  gl.viewport(0, 0, size, size);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sceneTex);
  gl.uniform1i(gl.getUniformLocation(progDepth, 'uSrc'), 0);
  gl.uniform2f(gl.getUniformLocation(progDepth, 'uRes'), size, size);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, depthPix);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // NORMALISE. Raw inverse depth inside one small room occupies a narrow slice
  // of the range — a wall at five metres and a wall at nine are both "mid grey",
  // and a ControlNet handed a low-contrast map politely ignores it. Every depth
  // map these things were trained on (MiDaS) is rescaled to fill the range, so
  // we fill the range: the CONTRAST is the signal, not the metres.
  let lo = 255, hi = 0;
  for (let i = 0; i < depthPix.length; i += 4) {
    const v = depthPix[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const k = 255 / Math.max(1, hi - lo);

  // GL is bottom-up and a canvas is top-down. Flip, or the lens is handed a
  // room standing on its head and dutifully paints one.
  const row = size * 4, out = depthImg.data;
  for (let y = 0; y < size; y++) {
    let s = (size - 1 - y) * row, d = y * row;
    for (let x = 0; x < size; x++, s += 4, d += 4) {
      const v = (depthPix[s] - lo) * k;
      out[d] = out[d + 1] = out[d + 2] = v;
      out[d + 3] = 255;
    }
  }
  depthCtx.putImageData(depthImg, 0, 0);
  return depthCanvas;
}

export { BIOME_RGB, WORLD_RGB };
