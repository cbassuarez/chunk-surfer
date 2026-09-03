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
import { FRONT_END_PLATE_PRESETS, normalizeFrontEndPlate } from './front-end-plate.js';
import { AMBIENT_PLACE_SCALE, CELL, EYE as EYE_METERS, MATERIAL, PLAN_SCALE } from '../data/floorplan/legend.js';
import * as P3 from './props3d.js';
import * as HZ from './horizon3d.js';
import { normalizePixelMeshSettings } from './pixel-mesh/settings.js';
import { PIXEL_MESH_FRAG } from './pixel-mesh/shader.js';
import { isScreen, screenUniforms } from './pixel-mesh/screens.js';
import { MARK_FIELD_SIZE, MARK_FIELD_SOURCE, deriveMarkField } from './mark-field.js';
import { getLookProfile } from './look-profiles.js';
import { LIGHT_KIND } from '../data/conservatory-lights.js';
import { visualEffectsEnabled } from '../game/access.js';
import { PAPER_ATLAS } from '../generated/paper-catalog.js';

const MAX_CHUNKS = 48;
const RD_SIZE = 256;
const WATER_W = 96;
const WATER_H = 54;
const MAX_WATER_SOURCES = 4;
// Eight authored practical slots plus three apparition emitters. Keeping the
// white bodies inside the same lighting path makes their spill hit architecture
// and props identically instead of faking a screen-space halo.
const MAX_LOCAL_LIGHTS = 12;
let RENDER_SCALE = 1;
let localLightCount=0;
const localLightPositions=new Float32Array(MAX_LOCAL_LIGHTS*4);
const localLightColors=new Float32Array(MAX_LOCAL_LIGHTS*4);
const localLightBaseIntensity=new Float32Array(MAX_LOCAL_LIGHTS);
const localLightMunicipal=new Float32Array(MAX_LOCAL_LIGHTS);
const localLightPenetrations=new Float32Array(MAX_LOCAL_LIGHTS);
const localLightEmergency=new Float32Array(MAX_LOCAL_LIGHTS);
let localShadowIndex=-1;
let localShadowLight=null;
let lightingAmbientColor=new Float32Array([.64,.65,.62]);
let lightingAmbientIntensity=.022;
// The room's floor-bounce, and the live dial for it (see __probe.bounce). 0 is
// the flat-ambient behaviour that shipped, which is the A/B for black ceilings.
let lightingBounceColor=new Float32Array([.64,.65,.62]);
let lightingBounceIntensity=0;
let bounceAmount=1;
let bounceLampGain=2.4;
// The weather's gain. 1 is as authored; 0 turns it off, which is the A/B for
// "is the rain drawn at all, or drawn and then lost in the one-bit encode".
let rainAmount=1;
// Weather forced into a space with no sky. 0 everywhere except the source hall.
let indoorRain=0;
// Temporary ending light. 0 is the authored 21:30 night; positive profiles are
// cutscene-only and are cleared before the institutional coda.
let endingWorldLook=0;
let municipalLightPower=1;
// Scales the look profile's white point to the room actually being stood in. 1
// is "use the profile as authored"; a dim interior asks for a fraction of it.
let lightingWhitePointScale=1;
// The taste dial for the above, so the ceiling can be A/B'd live without a
// rebuild. 1 = the authored scale, 0 = the flat profile white point this shipped
// with, which is the before-picture for the whole tone-floor fix.
let whitePointZoneAmount=1;
// Set by the sweep dial only; null means the zone decides.
let whitePointScaleOverride=null;
// Which screen the room asks for, and the dial that overrules it. Both null mean
// the look profile decides, which is the ordinary case.
let lightingScreenId=null;
let screenOverrideId=null;
let windowGeometryMotion=false;
let windowGeometryResizePending=false;
const HUSH_AMBIENT_COLOR=new Float32Array([.26,.76,.54]);

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
// Zone → tint, indexed by the ZONE ids in data/floorplan/legend.js. This array
// is POSITIONAL and must cover every zone: it stopped at 13 (academic) while the
// enum had already grown to danceStudio and store, so those two sampled off the
// end of a GLSL array — undefined, and in practice whatever 13 held.
const ZONE_TINTS = new Float32Array([
  0.60, 0.60, 0.58,   // none
  0.46, 0.56, 0.74,   // loading bay: wet tarmac under a cold overcast
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
  0.67, 0.70, 0.64,   // academic: cold plaster, oxidised metal, dead planting
  0.74, 0.70, 0.60,   // dance wing: sprung maple and mirror
  0.52, 0.50, 0.47,   // prop store: a ceiling you can touch
  0.62, 0.60, 0.55,   // the get-in: sodium and rust, as the old dock room was
  0.43, 0.49, 0.60,   // inhabited street: wet carriageway under town light
  0.58, 0.56, 0.52,   // civic pavement: pale flags darkened by rain
  0.36, 0.39, 0.43,   // service courts: old setts and patched channels
  0.78, 0.80, 0.84,   // st brendan's: limewashed stone, colder than Ellery's chapel
]);

const WORLD_RGB = {
  main_b3:         [0.67, 0.74, 0.63],
  the_tub:         [0.57, 0.69, 0.80],
  amplifications:  [0.79, 0.66, 0.90],
  soundnoisemusic: [0.88, 0.73, 0.52],
  lux_nova:        [0.88, 0.92, 1.00],
  st_brendans:      [0.78, 0.82, 0.90],
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
uniform vec3 uTorchColor;
uniform float uTorchReach;
uniform vec2 uTorchCone;
uniform float uTorchSpill;
uniform vec3 uAmbientColor;
uniform float uAmbientIntensity;
// How much ambient survives at distance, 0..1. Tunable live rather than
// authored, because how dark the far end of an unlit corridor should be is a
// judgement nobody can make from the source (see __probe.ambientFloor).
uniform float uAmbientFloor;
// THE BOUNCE. Light that has already hit the floor and come back up.
//
// Ambient is uniform over the sphere, so a ceiling gets exactly what a floor
// gets, and in this building that is nothing: measured raw against a black point
// at byte 1.3, the get-in's ceiling sits at 1.47 unlit and only reaches 2.45 with
// the torch ON, because the torch is a forward cone from eye height and the one
// fitting hangs at 2.1m under a 5.5m ceiling. Walls reach 11.4 in the same frame.
// So ceilings are not merely dark, they are the ONE surface no light source in
// the room can address, which is why they read as pure black everywhere.
//
// This is the return trip, weighted onto downward-facing normals and gained by
// the torch, so lighting the floor lights the ceiling above it the way it should
// have all along.
uniform vec3 uBounceColor;
uniform float uBounceIntensity;
uniform float uBounceLampGain;
// The weather's own gain, so "is it drawn at all" is answerable without a
// rebuild (see __probe.rain). 0 is no weather; 1 is as authored.
uniform float uRainAmount;
// WEATHER WHERE THERE IS NO SKY.
//
// Rain is gated on the eye standing in a cell flagged FLAG_SKY, which is right
// for the building and means the procedural spaces (uUsePlan < .5) can never
// have any. The source corridor wants exactly that and for exactly the wrong
// reason: it is not outside, it is not even a room, and the rain coming through
// it anyway is the point. Driven from the hall's own depth — see
// tickSourceSpace.
uniform float uRainIndoor;
// Strength of the baked per-cell ambient, 0..1. 0 is the old flat per-zone
// constant, which makes this the A/B (see __probe.ambientPlace).
uniform float uAmbientPlace;
uniform float uHushSense;
uniform float uOpticalEffects;
uniform float uReduceMotionOptical;
uniform float uDockHauntingFade;
// One number per run, so the night is the same night for its whole length and a
// different one next time. Drives the moon: where it sits, how full it is, and
// once in a while how close.
uniform float uNightSeed;
uniform float uEndingWorldLook;
uniform int uLocalLightCount;
uniform int uLocalShadowIndex;
uniform vec4 uLocalLightPos[${MAX_LOCAL_LIGHTS}];
uniform vec4 uLocalLightColor[${MAX_LOCAL_LIGHTS}];
uniform float uLocalLightPenetration[${MAX_LOCAL_LIGHTS}];
// 1 for a practical on the emergency circuit. Red is that circuit's word, and
// this is how the lighting pass tells the shading pass who is allowed to use it.
uniform float uLocalLightEmergency[${MAX_LOCAL_LIGHTS}];
uniform int   uChunkCount;
uniform vec4  uChunkA[${MAX_CHUNKS}]; // x, z, radius, activity
uniform vec3  uChunkC[${MAX_CHUNKS}]; // biome rgb
uniform vec4  uKey;          // x, z, active, -
uniform vec4  uDoor;
uniform vec4  uHush;         // x, z, absorption strength, radius in metres
uniform vec4  uHushBody;          // x, z, manifestation, texture ready
uniform vec4  uHushBodyLook;      // height metres, width metres, glow, composite mode
uniform vec4  uHushBodySecondary; // render-only second manifestation
uniform vec4  uHushBodyLookSecondary;
uniform sampler2D uHushBodyTex;
uniform sampler2D uPlan;     // the authored building: R=floor G=ceil B=flags A=zone
uniform sampler2D uMat;      // R=material id
uniform sampler2D uSourceLayer; // R=source corpus layer for this runtime cell
uniform sampler2D uSourceSurface; // exact repository source rendered as a code-native surface
uniform sampler2D uPropColor;
uniform sampler2D uPropDepth;
uniform sampler2D uPropShadow;
uniform mat4 uPropShadowMatrix;
uniform float uPropShadowReady;
uniform vec2 uPropShadowTexel;
uniform sampler2D uWaterHeight;
uniform sampler2DArray uSurfAlbedo, uSurfNormal, uSurfMaterial; // PBR: albedo, normal, and (R roughness, G relief)
// The engraving derived from each generated tile (render/mark-field.js). ONE
// array, not the live/staged pair the dream layer uses: this pass has exactly
// one spare texture unit and no more, so the staged bank's marks are folded in
// behind the live ones at a fixed offset.
uniform sampler2DArray uSurfMarks;
// The marks array uses a FIXED per-slot stride so one allocation serves any
// bank, while the dream array packs at that bank's own frame count. The two
// layer indices are therefore NOT interchangeable and are computed apart.
uniform float uMarkStride;        // layers per slot in the marks array
uniform float uMarksLiveBase;     // first layer of the live half
uniform float uMarksStageBase;    // ...and of the staged half
uniform float uMarksReady[10];    // per slot: 1 once every frame of its boil is engraved
uniform float uMarksReadyNext[10];
uniform sampler2DArray uSurfDream, uSurfDreamNext;             // current + staged generated albedo
uniform float uDreamMix[10];
uniform float uDreamReady;
uniform float uDreamNextReady;
uniform float uDreamBankBlend;
uniform float uDreamDetailGain;
uniform float uDreamChromaDrift;
uniform float uDreamFramesA;      // temporal boil frames resident in the live bank
uniform float uDreamFramesB;      // ...and in the staged one
uniform float uBoilHz;            // crossfade rate between them, before agitation
uniform float uDreamStructureMix; // how much generated RGB, not just its grain
uniform float uDreamLumaLo;
uniform float uDreamLumaHi;
uniform float uDreamLumaHold;     // how hard authored exposure is enforced
uniform float uAgitation;         // fear + onset: how hard the world is boiling
float gBoilGlow=0.0;              // self-lit churn, written by surfaceTile
// The engraving of whatever surface this fragment landed on. R density, GB the
// coherence-weighted doubled-angle grain, A coherence.
//
// R == 0 IS THE SENTINEL for "no engraving here": real material always carries
// some local contrast, so zero cannot occur naturally. It means sky, or a slot
// whose tiles are not derived yet, and the recorder falls back to its
// procedural hash there — exactly the behaviour that shipped before this.
vec4 gMark=vec4(0.0);
float gMarkBlend=0.0;
// WHICH PLANE THE GRAIN LIES IN. The tile UV is axis-aligned (see surfaceUv), so
// the surface tangent basis is one of exactly three, and naming it is all the
// recorder needs to lift a 2D tile-space line field into world space. Written
// beside gMark by architecturalSurface, which is the only place that knows both
// the surface kind and the normal.
//   0.0 = XZ (floor, ceiling): u=X v=Z
//   0.5 = ZY (wall facing X):  u=Z v=Y
//   1.0 = XY (wall facing Z):  u=X v=Y
float gMarkPlane=0.0;
uniform float uDreamRoughnessResponse;
uniform float uDreamNormalResponse;
uniform float uLocalDiffusion;
uniform float uSurfacesReady;
// Accepted work-order takes progressively replace photographed material with
// the generated surface itself. These are multipliers on the current look, so
// zero takes is bit-for-bit the authored profile that was already active.
uniform float uPropsReady;
uniform float uPropNear;
uniform float uPropFar;
uniform vec2  uPlanSize;
uniform vec2  uPlanOrigin;
uniform float uPlanHeightOffset;
uniform float uUsePlan;      // 0 = procedural sample-field lattice, 1 = the conservatory
uniform vec3  uZoneTint[21];
uniform float uSourceReady;
uniform vec4  uWaterBounds;  // min x, min z, max x, max z in runtime cells
uniform vec4  uWaterParams;  // active, level metres, murk, reduce motion
uniform vec4  uWaterCamera;  // submerged, depth metres, soaked, reserved
layout(location=0) out vec4 o;
// The engraving leaves on a second target; see the write at the end of main.
layout(location=1) out vec4 oMark;

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
const int FLAG_WALLED  = 128;
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
const int MAT_ACADEMIC = ${MATERIAL.academicPlaster};
const int MAT_TARMAC = ${MATERIAL.wetTarmac};
const int MAT_PAVING = ${MATERIAL.wetPaving};
const int MAT_SETTS = ${MATERIAL.wetSetts};
const int MAT_GRASS = ${MATERIAL.wetGrass};
const int MAT_SOURCE_VOID = ${MATERIAL.sourceVoid};

bool isRainGroundMat(int mat){return mat==MAT_TARMAC||mat==MAT_PAVING||mat==MAT_SETTS||mat==MAT_GRASS;}

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
  if(uWaterParams.w > 0.5) return 0.0;
  float h = texture(uWaterHeight, waterUv(p)).r - 0.5;
  return h * 0.20;
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
// REAL VALUE NOISE, because noise2 above is not noise.
//
// noise2 is a sum of two sines — a smooth, strictly PERIODIC plaid. That is
// fine for the wobble it was written for (worldIdx, the moon's maria, the
// valley), but stacking four octaves of it and thresholding gives a regular
// lattice of blobs, and a one-bit dither turns a regular lattice of blobs into
// a regular lattice of DOTS. That is what the sky's cloud deck has been: not
// weather, fireflies.
//
// Same signature and same [-1,1] range, so it drops straight into the
// 0.5 + 0.5 * n() the sky already wraps every octave in.
float vnoise(vec2 p, float s, float seed){
  vec2 q = (p + vec2(seed, seed * 1.3)) * s;
  vec2 i = floor(q), f = q - i;
  vec2 u = f * f * (3.0 - 2.0 * f);          // smoothstep fade, C1 at the lattice
  float a = hash01(i.x,       i.y      );
  float b = hash01(i.x + 1.0, i.y      );
  float c = hash01(i.x,       i.y + 1.0);
  float d = hash01(i.x + 1.0, i.y + 1.0);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
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
  vec2 cc = vec2(float(cx)+0.5, float(cz)+0.5); // never entomb the key or exit
  if(uKey.z>0.5  && dot(cc-uKey.xy,  cc-uKey.xy)  < 4.0) return false;
  if(uDoor.z>0.5 && dot(cc-uDoor.xy, cc-uDoor.xy) < 4.0) return false;
  return true;
}
bool hasCeiling(vec2 p){ return !isExpanse(int(floor(p.x)), int(floor(p.y))); }

// A cell of the world. In story mode it is read from the authored floorplan
// texture — the SAME array JS collision reads, so the drawn wall and the solid
// wall cannot disagree. Developer sample-field labs use the procedural lattice.
struct Cell { bool solid; float f; float c; int flags; int zone; int mat; float place; };

Cell cellAtI(ivec2 p){
  Cell r;
  r.flags = 0; r.zone = 0; r.mat = MAT_SERVICE; r.place = 1.0;
  if(uUsePlan < 0.5){
    r.solid = solidCell(vec2(p) + 0.5);
    r.f = 0.0;
    r.c = hasCeiling(vec2(p) + 0.5) ? CEIL : 90.0;
    return r;
  }
  ivec2 local = p - ivec2(uPlanOrigin);
  if(local.x < 0 || local.y < 0 || local.x >= int(uPlanSize.x) || local.y >= int(uPlanSize.y)){
    // PAST THE EDGE OF THE BUILDING THERE IS WEATHER, NOT ROCK.
    //
    // This slice is the whole physical extent, never a moving window (see
    // physicalRenderPlanFor), so a ray only gets here by leaving the building's
    // entire footprint — and every cell on the footprint's rim is an authored
    // wall, so from indoors nothing reaches this at all. It used to return
    // solid, which was invisible for as long as the only way out was a bricked
    // lift shaft. The loading bay opens west across the yard to this edge, and
    // solid made it a black cliff fifty metres out.
    //
    // Open, no floor to land on, and flagged sky: the march runs out at MAXD
    // and the ray resolves as sky.
    r.solid = false; r.f = -1000.0; r.c = 90.0 / CELL_METERS; r.flags = FLAG_SKY;
    return r;
  }
  vec4 t = texelFetch(uPlan, local, 0);
  r.flags = int(t.b * 255.0 + 0.5);
  r.solid = (r.flags & FLAG_SOLID) != 0;
  r.f = (t.r * H_RANGE + H_MIN + uPlanHeightOffset) / CELL_METERS;
  r.c = (t.g * H_RANGE + H_MIN + uPlanHeightOffset) / CELL_METERS;
  r.zone = int(t.a * 255.0 + 0.5);
  vec2 ma = texelFetch(uMat, local, 0).rg;
  r.mat = int(ma.r * 255.0 + 0.5);
  // G is the baked per-cell ambient multiplier: how much spill this PLACE gets,
  // from its distance to an opening and how enclosed it is. AMBIENT_PLACE_SCALE
  // in world/floorplan.js is the encode; 128 is neutral 1.0.
  r.place = ma.g * ${AMBIENT_PLACE_SCALE.toFixed(1)};
  if(r.mat == 0) r.mat = MAT_SERVICE;
  // A sky cell has no ceiling to stop the ray, so its ceiling is pushed out of
  // reach. The number is only ever read by the wall test below (the ceiling and
  // header tests are both gated on FLAG_SKY), which means it is also the height
  // anything solid beside a sky cell is drawn to — ninety metres of black slab.
  //
  // That is correct out in the yard, where nothing solid stands near enough to
  // read, and inside the lift shaft, which wants to look bottomless. It is wrong
  // in a bay with walls on three sides. FLAG_WALLED is the opt-out: the ray still
  // leaves, and the walls stand at the height the glyph authored.
  if((r.flags & FLAG_SKY) != 0 && (r.flags & FLAG_WALLED) == 0) r.c = 90.0 / CELL_METERS;
  return r;
}
// THE BAKED AMBIENT, SAMPLED SMOOTHLY.
//
// cellAt() reads this byte with texelFetch, which is a NEAREST fetch — one
// value per cell, no interpolation — and ambient multiplies straight by it. So
// every cell boundary in the building was a hard step in brightness, and the
// one-bit dither did not cause the square plaid people were seeing, it merely
// made an existing staircase visible. The blocks were the cells.
//
// This is the same byte, bilinear across the four cells around a WORLD point.
// It is deliberately a separate read from cellAt's: the material id shares that
// texel and must stay nearest, because interpolating an id blends brick into
// tile and produces a material that does not exist.
float ambientPlaceAt(vec2 world){
  // Cell centres sit at +0.5, so shift by half a cell before flooring to get the
  // four cells the point actually lies between rather than the four it is inside.
  vec2 g = world - 0.5;
  vec2 base = floor(g);
  vec2 f = g - base;
  float acc = 0.0;
  for(int j = 0; j < 2; j++){
    for(int i = 0; i < 2; i++){
      ivec2 cell = ivec2(base) + ivec2(i, j) - ivec2(uPlanOrigin);
      cell = clamp(cell, ivec2(0), ivec2(uPlanSize) - ivec2(1));
      float w = (i == 0 ? 1.0 - f.x : f.x) * (j == 0 ? 1.0 - f.y : f.y);
      acc += texelFetch(uMat, cell, 0).g * w;
    }
  }
  // ONE STEP OF DITHER ON THE QUANTISATION. The field is a byte, so it arrives in
  // 255 levels across a 0..AMBIENT_PLACE_SCALE range. Interpolating removes the
  // squares but leaves those levels as contour rings, which a hard dither draws
  // as thin bands instead of blocks. A per-pixel offset of about one level puts
  // the contour below the noise floor.
  float step = ${(AMBIENT_PLACE_SCALE / 255).toFixed(6)};
  float jitter = (hash01(gl_FragCoord.x, gl_FragCoord.y) - 0.5) * step;
  return max(0.0, acc * ${AMBIENT_PLACE_SCALE.toFixed(1)} + jitter);
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
  // Supply the world-space footprint explicitly. Raymarch hits arrive through
  // divergent DDA branches, where implicit texture derivatives can collapse at
  // grazing angles and make the same wall acquire a direction as the camera
  // turns. All banks share this footprint, so albedo and generated detail stay
  // registered while the texture unit performs anisotropic filtering.
  vec2 tcDx=dFdx(tc.xy),tcDy=dFdy(tc.xy);
  vec3 base=textureGrad(uSurfAlbedo,tc,tcDx,tcDy).rgb;
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
  // THE BOIL. Each surface holds K generated frames of itself — the same place,
  // further along its own decay — and we crossfade between consecutive frames
  // continuously. The phase is offset per texel by a hash of the world position,
  // so a wall churns unevenly across its own face instead of pulsing as one
  // flat card. That per-pixel desync is the whole difference between a texture
  // fading and a surface boiling.
  float boilPhase=0.0;
  float framesA=max(1.0,uDreamFramesA);
  if(uBoilHz>0.0001&&framesA>1.5){
    float jitter=fract(sin(dot(floor(worldUv*11.0),vec2(12.9898,78.233)))*43758.5453);
    boilPhase=uTime*uBoilHz*(1.0+uAgitation*1.4)+jitter*1.37;
  }
  float slotBase=float(slot)*framesA;
  float fa=floor(boilPhase);
  float ft=smoothstep(0.0,1.0,fract(boilPhase));
  float layerA0=slotBase+mod(fa,framesA);
  float layerA1=slotBase+mod(fa+1.0,framesA);
  vec3 dreamTcA0=vec3(tc.xy+hallucinationWarp,layerA0);
  vec3 dreamTcA1=vec3(tc.xy+hallucinationWarp,layerA1);
  vec3 dreamA=mix(
    textureGrad(uSurfDream,dreamTcA0,tcDx,tcDy).rgb,
    textureGrad(uSurfDream,dreamTcA1,tcDx,tcDy).rgb,
    ft
  );
  // The staged bank samples its own frame zero: a bank change is already a
  // crossfade, and boiling both sides of it costs texture fetches nobody sees.
  vec3 dreamTcB=vec3(tc.xy+hallucinationWarp,float(slot)*max(1.0,uDreamFramesB));
  vec3 dreamB=textureGrad(uSurfDreamNext,dreamTcB,tcDx,tcDy).rgb;
  vec3 dream=mix(dreamA,dreamB,uDreamNextReady>.5?uDreamBankBlend:0.0);
  // The engraving rides the SAME coordinates, boil phase and bank blend as the
  // material it came from. Sharing them rather than recomputing is why the
  // grain cannot slide out of register with its own wall. The arrays differ in
  // resolution (128 against 512) but not in UV, and tcDx/tcDy are normalised
  // derivatives, so one footprint filters both.
  float markBankBlend=uDreamNextReady>.5?uDreamBankBlend:0.0;
  float markSlotBase=float(slot)*uMarkStride;
  vec3 markTcA0=vec3(dreamTcA0.xy,uMarksLiveBase+markSlotBase+mod(fa,framesA));
  vec3 markTcA1=vec3(dreamTcA1.xy,uMarksLiveBase+markSlotBase+mod(fa+1.0,framesA));
  vec4 markA=mix(
    textureGrad(uSurfMarks,markTcA0,tcDx,tcDy),
    textureGrad(uSurfMarks,markTcA1,tcDx,tcDy),
    ft
  );
  vec4 markB=textureGrad(uSurfMarks,vec3(dreamTcB.xy,uMarksStageBase+markSlotBase),tcDx,tcDy);
  // Decode to a signed line field BEFORE applying readiness. The other order is
  // a trap: zeroing the stored 0..1 vector then decoding yields (-1,-1), which
  // is not "no grain" but a confident grain at 225 degrees, on every slot that
  // has not been derived yet.
  markA.gb=markA.gb*2.0-1.0;
  markB.gb=markB.gb*2.0-1.0;
  markA*=uMarksReady[slot];
  markB*=uMarksReadyNext[slot];
  gMark=mix(markA,markB,markBankBlend);
  gMarkBlend=1.0;
  // Transfer material detail, not the generated image's illumination or
  // palette. Dividing by a coarse mip extracts local grain/mortar/weathering;
  // multiplying that into the authored albedo keeps the room from becoming a
  // flat img2img wash while remaining fixed in world-space UVs.
  vec3 dreamLowA=mix(textureLod(uSurfDream,dreamTcA0,4.0).rgb,textureLod(uSurfDream,dreamTcA1,4.0).rgb,ft);
  vec3 dreamLowB=textureLod(uSurfDreamNext,dreamTcB,4.0).rgb;
  vec3 dreamLow=mix(dreamLowA,dreamLowB,uDreamNextReady>.5?uDreamBankBlend:0.0);
  vec3 detail=clamp(dream/max(dreamLow,vec3(.055)),vec3(.36),vec3(2.15));
  float baseLum=max(.035,dot(base,vec3(.2126,.7152,.0722)));
  float dreamLum=max(.035,dot(dreamLow,vec3(.2126,.7152,.0722)));
  vec3 neutralTone=vec3(baseLum);
  vec3 generatedTone=clamp(dreamLow*(baseLum/dreamLum),vec3(0.0),vec3(1.0));
  generatedTone=mix(neutralTone,generatedTone,clamp(uDreamChromaDrift,0.0,1.0));
  vec4 response=dreamSlotResponse(slot);
  vec3 detailed=clamp(base*mix(vec3(1.0),detail,clamp(uDreamDetailGain*response.x,0.0,1.7)),vec3(0.0),vec3(1.0));
  float generatedPresence=clamp((.32+uDreamChromaDrift*1.55)*uDreamMix[slot]*response.y,0.0,.76);
  detailed=mix(detailed,generatedTone,generatedPresence);
  // Past the grain: let the generated image itself onto the wall. In calm rooms
  // this is zero and the lens stays a detail pass; under agitation the model's
  // own structure arrives, which is what makes it a repaint and not a filter.
  float structure=clamp(uDreamStructureMix*(0.6+0.4*uAgitation)*response.y,0.0,0.75);
  detailed=mix(detailed,clamp(dream,vec3(0.0),vec3(1.0)),structure);
  // Exposure leash. baseLum/detailedLum is a CORRECTION that drags generated
  // luminance back onto the authored albedo — so the way to let the lens be
  // seen is to apply less of it, not to widen its bounds. uDreamLumaHold is
  // how much of that correction survives: 1.0 pins exposure exactly (quiet
  // rooms stay legible), 0.2 lets the surface burn out or go black on its own.
  // This matters more than anything else downstream: the VFD encoder buckets
  // cells by luminance, so a boil that cannot move luminance cannot be seen.
  float detailedLum=max(.025,dot(detailed,vec3(.2126,.7152,.0722)));
  float exposureFix=clamp(baseLum/detailedLum,uDreamLumaLo,uDreamLumaHi);
  detailed*=mix(1.0,exposureFix,clamp(uDreamLumaHold,0.0,1.0));
  detailed=clamp(detailed,vec3(0.0),vec3(1.0));
  // A boiling surface is doing something, and a condemned building is dark:
  // let churn contribute its own faint light so the crawl is visible on walls
  // the torch is not pointed at. Multiplied by albedo at the light sum, so it
  // reads as the material glowing rather than a wash laid over the frame.
  gBoilGlow=uAgitation*clamp(uDreamStructureMix*1.3,0.0,1.0)
    *clamp(dot(dream,vec3(.2126,.7152,.0722)),0.0,1.0)
    *uDreamMix[slot]*response.y*0.6;
  return mix(base,detailed,clamp(uDreamMix[slot]*response.x*1.12,0.0,1.0));
}
// One texture per surface, chosen by the room's material and whether we hit a
// wall or a floor. No cross-slot mixing — that is what smeared every texture
// across every surface.
void surfaceSlot(int mat,int surf,vec2 uv,out int slot,out float tileM,out float blend){
  if(surf==1){                                                  // walls — one texture per wall
    if(mat==MAT_ACOUSTIC){slot=9;tileM=1.6;blend=.84;}          // basement (studio) → concrete cladding
    else if(mat==MAT_PRACTICE){slot=8;tileM=1.8;blend=.84;}     // classroom → rammed earth
    else if(mat==MAT_WOOD){slot=2;tileM=2.2;blend=.90;}         // concert hall → dark timber panelling
    else if(mat==MAT_POOL||mat==MAT_WET){slot=5;tileM=1.0;blend=.84;} // natatorium → white ceramic
    else if(mat==MAT_METAL){slot=9;tileM=1.6;blend=.82;}        // plant → concrete cladding
    else if(mat==MAT_CHAPEL){slot=1;tileM=1.4;blend=.82;}       // chapel → split-face stone
    else if(mat==MAT_ACADEMIC){slot=7;tileM=2.2;blend=.80;}     // academic → pale worn stone/plaster
    else if(isRainGroundMat(mat)){slot=9;tileM=1.2;blend=.70;}  // exterior retaining walls → concrete
    else {slot=0;tileM=1.4;blend=.80;}                          // general → reclaimed brick
  } else {                                                      // floor (surf==2)
    if(mat==MAT_ACOUSTIC||mat==MAT_PRACTICE||mat==MAT_ACADEMIC){slot=6;tileM=1.8;blend=.88;} // teaching floors → terrazzo
    else if(mat==MAT_WOOD){slot=2;tileM=1.8;blend=.92;}         // concert hall → worn timber boards
    else if(mat==MAT_CHAPEL){slot=3;tileM=2.0;blend=.90;}       // chapel → quartzite
    else if(mat==MAT_WET){slot=4;tileM=0.9;blend=.92;}          // pool interior → blue mosaic
    else if(mat==MAT_POOL){slot=5;tileM=1.0;blend=.90;}         // pool deck → white ceramic
    else if(mat==MAT_TARMAC){slot=9;tileM=0.42;blend=.52;}      // carriageway → wet aggregate
    else if(mat==MAT_PAVING){slot=3;tileM=1.10;blend=.72;}      // pavement → worn civic flags
    else if(mat==MAT_SETTS){slot=1;tileM=.46;blend=.68;}        // gutter and courts → small stone setts
    // The park. Rammed earth, tiled at blade scale and blended hard enough to
    // read: at .44 over 0.70m the bank was a suggestion under a flat colour,
    // which is a lawn with no grain in it.
    else if(mat==MAT_GRASS){slot=8;tileM=.42;blend=.66;}
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
  if(uSurfacesReady<.001||surf==3)return fallback;
  vec2 uv=surfaceUv(surf,p,n);
  int slot; float tileM; float blend; surfaceSlot(mat,surf,uv,slot,tileM,blend);
  vec3 tinted=mix(fallback,surfaceTile(slot,uv,tileM),blend);
  // Must mirror surfaceUv exactly. If these two ever disagree the grain is
  // lifted into the wrong plane and runs across the wall instead of along it.
  gMarkPlane=surf!=1?0.0:(abs(n.x)>.5?0.5:1.0);
  // Only the blended share of that tile is on the wall; a surface barely showing
  // its generated material must not be engraved as if made entirely of it.
  gMarkBlend*=blend;
  return tinted;
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
  if(mat == MAT_TARMAC){
    // No courses and no boards. A yard has expansion joints and patches, and
    // they run a long way apart.
    return max(line1(p.x, 6.4, 0.020), line1(p.z, 7.9, 0.020)) * 0.14;
  }
  // Grass has no courses, no joints and no grid. Anything regular drawn into
  // it reads as paving that has been painted green.
  if(mat == MAT_GRASS)return 0.0;
  if(mat == MAT_PAVING)return max(line1(p.x,.92,.028),line1(p.z,1.24,.026))*.22;
  if(mat == MAT_SETTS)return grid2(p.xz,.28,.032)*.30;
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
  else if(mat == MAT_TARMAC) base = vec3(0.145, 0.156, 0.180);
  else if(mat == MAT_PAVING) base = vec3(0.34, 0.35, 0.36);
  else if(mat == MAT_SETTS) base = vec3(0.205, 0.22, 0.24);
  // Municipal grass at night in the rain is not green, it is a dark blue-green
  // that only admits to being green where a lamp reaches it. But it was DARKER
  // than the tarmac beside it and had almost no sheen, so at one bit the lawn
  // came out as the emptiest thing in shot — the park read as a hole with a
  // fountain in it. Lifted just clear of tarmac (0.145,0.156,0.180) so the
  // boundary between path and grass is a boundary, not an absence.
  else if(mat == MAT_GRASS) base = vec3(0.148, 0.204, 0.146);
  if(surf == 3) base *= 0.58;
  if(surf == 2) base = mix(base, mix(biome, tint, 0.35), 0.22);
  return base * (0.56 + 0.55 * rdv);
}
float materialSpec(int mat){
  if(mat == MAT_WET) return 0.95;
  if(mat == MAT_TARMAC) return 0.58;   // it has been raining on it all night
  if(mat == MAT_PAVING) return 0.68;
  if(mat == MAT_SETTS) return 0.61;
  // Soaked. It drinks most of the light, but a wet blade does throw some back —
  // and in a one-bit renderer that glint is the only thing that can draw the
  // texture at all, so it may not be zero.
  if(mat == MAT_GRASS) return 0.26;
  if(mat == MAT_POOL) return 0.42;
  if(mat == MAT_DOOR) return 0.48;
  if(mat == MAT_METAL) return 0.36;
  if(mat == MAT_WOOD) return 0.16;
  if(mat == MAT_CHAPEL) return 0.18;
  if(mat == MAT_ACOUSTIC) return 0.035;
  return 0.08;
}
// RED IS THE EMERGENCY CIRCUIT'S WORD, AND NOBODY ELSE IN ELLERY MAY USE IT.
//
// conservatory-lights.js calls the emergency red "the one impossible colour in
// Ellery", and the display honours that by letting chroma survive the one-bit
// encode. But the display can only see the composited pixel, so it was honouring
// red that had nothing to do with the circuit: sodium off a warm wall, a red
// material under the torch, anything whose albedo happened to be red. Everything
// shaded red before the shader came out red after it, and the emergency wash
// stopped being an event because half the building was already speaking in it.
//
// The lighting pass is the only place that knows WHO lit a fragment, so the gate
// belongs here. Redness that the emergency circuit did not pay for is pulled
// back to its own luminance; every other hue is untouched, so sodium stays
// amber, the sky stays cold, and the torch stays warm. It is a reservation of
// one hue, not a desaturation of the room.
float emergencyRedness(vec3 lit){
  return (lit.r - max(lit.g, lit.b)) / max(lit.r, 1e-4);
}
vec3 reserveEmergencyRed(vec3 shaded, float emergencyShare){
  // Amber and sodium live below .55; the authored emergency primary is .98.
  float claim = smoothstep(.55, .84, emergencyRedness(shaded));
  // A little emergency contribution justifies its own red: falloff and
  // occlusion must not make the circuit out-shout a torch to keep its colour.
  float backing = clamp(emergencyShare * 4.0, 0.0, 1.0);
  float grey = dot(shaded, vec3(.2126, .7152, .0722));
  // No residual red. The one-bit pass deliberately preserves saturated red,
  // so leaving even eighteen percent here let every red-painted surface claim
  // the alarm's ink downstream. Provenance is binary: paid for by an emergency
  // contribution, or neutral before acquisition.
  return mix(shaded, vec3(grey), claim * (1.0 - backing));
}
float propFlashShadow(vec3 world,vec3 normal,vec3 lightDir){
  if(uPropShadowReady<.5)return 1.0;
  vec4 clip=uPropShadowMatrix*vec4(world+normal*.008,1.0);if(clip.w<=0.0)return 1.0;
  vec3 q=clip.xyz/clip.w*.5+.5;if(q.x<=0.0||q.x>=1.0||q.y<=0.0||q.y>=1.0||q.z<=0.0||q.z>=1.0)return 1.0;
  float bias=max(.00018,.00115*(1.0-max(dot(normal,lightDir),0.0))),visible=0.0;
  for(int y=0;y<2;y++)for(int x=0;x<2;x++){vec2 tap=(vec2(float(x),float(y))-.5)*uPropShadowTexel;visible+=q.z-bias<=texture(uPropShadow,q.xy+tap).r?1.0:0.0;}
  return mix(.20,1.0,visible*.25);
}
// THE GLOW, WHICH IS A DELIBERATELY BAD SHADOW LOOKUP.
//
// propFlashShadow above is a 2x2 PCF: its penumbra is one texel wide, which is a
// hard edge and cannot carry a halo. This samples the same map on two wide rings
// and returns the BLOCKED fraction, so it reads outside the silhouette and falls
// off smoothly — a bloom around the body rather than an occlusion term. Nothing
// about it is physically defensible and nothing about it needs to be: it is only
// ever multiplied into an emissive white.
//
// IT ASKS "IS SOMETHING STANDING WELL IN FRONT OF ME", NOT "AM I IN SHADOW".
//
// A scaled-up bias is the obvious way to stop a wide tap self-shadowing, and it
// does not work. A tap twenty texels away reads the depth of a DIFFERENT PART of
// the same receiving surface, and on anything the lamp sees at an angle that
// depth is legitimately nearer — so the surface reports itself blocked over
// whole walls, and the auditorium grew a pale rectangle the exact shape of the
// shadow map's frustum. Measured: a big soft patch where the sharp sample found
// three small silhouettes.
//
// A gap test has no such failure. Self-shadowing across a few texels of slope is
// a tiny depth difference; a body standing between this wall and the lamp is a
// large one. GAP is expressed in the map's non-linear depth and works out to
// roughly a metre at ten and a quarter of that up close — comfortably more than
// any slope and comfortably less than a figure's stand-off.
const float HALO_GAP=.00042;
float propFlashHalo(vec3 world,vec3 normal,vec3 lightDir){
  if(uPropShadowReady<.5)return 0.0;
  vec4 clip=uPropShadowMatrix*vec4(world+normal*.008,1.0);if(clip.w<=0.0)return 0.0;
  vec3 q=clip.xyz/clip.w*.5+.5;if(q.x<=0.0||q.x>=1.0||q.y<=0.0||q.y>=1.0||q.z<=0.0||q.z>=1.0)return 0.0;
  float blocked=0.0;
  for(int i=0;i<12;i++){
    float angle=float(i)*.5236,ring=i<6?5.0:11.0;
    vec2 tap=vec2(cos(angle),sin(angle))*ring*uPropShadowTexel;
    blocked+=q.z-texture(uPropShadow,q.xy+tap).r>HALO_GAP?1.0:0.0;
  }
  return blocked/12.0;
}
float architecturalLightVisibility(vec3 fromM,vec3 toM){
  float distanceM=length(toM-fromM);int checks=int(clamp(ceil(distanceM),1.0,8.0));
  for(int i=1;i<8;i++){
    if(i>=checks)break;
    vec3 q=mix(fromM,toM,float(i)/float(checks));Cell blocker=cellAtI(ivec2(floor(q.xz/CELL_METERS)));
    float qHeight=q.y/CELL_METERS;
    if(blocker.solid||qHeight<blocker.f-.05||qHeight>blocker.c+.05)return .16;
  }
  return 1.0;
}
vec3 hushScreen(vec3 base,vec3 layer){
  return 1.0-(1.0-base)*(1.0-clamp(layer,0.0,0.92));
}
vec3 hushColorDodge(vec3 base,vec3 layer){
  return min(vec3(1.0),base/max(vec3(0.075),vec3(1.0)-clamp(layer,0.0,0.90)));
}

// ── THE NIGHT ────────────────────────────────────────────────────────────────
//
// Half nine, raining, a condemned site on the edge of a northern town that still
// has its lights on. Overcast, lit from underneath: there is a city under the
// cloud base and a low deck bouncing its sodium back down, which is why a wet
// British night is never actually dark. It has to sit well above the interior
// ambient or the one opening in this building reads as another black wall.
//
// THIS IS A FUNCTION NOW, AND THAT IS THE POINT. It used to be inlined in the
// ray-left-the-building branch, so the only thing that could see the sky was a
// ray that escaped. The yard is fifty metres of WET TARMAC under all of this,
// and wet tarmac at night is not a diffuse surface with a low albedo — it is a
// bad mirror, and almost everything you can see in it is sky. Calling this with
// a reflected direction is what puts the moon and the lit deck on the ground the
// player is standing on. See the sheen in the floor branch of main().
//
// Rain is deliberately NOT in here. It is in the air between the eye and the
// thing, not a property of the sky, and a reflection of it in a puddle would be
// falling the wrong way.
vec3 nightSky(vec3 dir){
  float up = clamp(dir.y, -1.0, 1.0);
  float horizon = 1.0 - smoothstep(0.0, 0.46, abs(up));
  // A SOLID OVERCAST DOES NOT FALL AWAY THAT FAST. 0.80 put the sky at two
  // thirds of the way to "deep" by thirty degrees up, which is the whole band a
  // clamped neck can see — so the useful sky was a bright strip on the horizon
  // and then night. A lit deck stays lit overhead; it only loses the sodium.
  float zenith  = smoothstep(0.02, 1.05, up);
  // THE NIGHT IS BLUE. It is half nine, it is raining, and the light in this sky
  // is what is left of the day plus a town's worth of streetlamps on the
  // underside of the cloud. The sodium is a stain near the horizon in one
  // direction, not the colour of the sky — an earlier pass had it warm all over
  // and the shot read as a sunset, which is the wrong story and the wrong hour.
  vec3 sodium   = vec3(0.44, 0.25, 0.11);
  // Twilight, not a floodlit blue hour. The deck remains readable against the
  // roofs, but sits one small stop below the earlier almost-daylight exterior.
  vec3 ceiling  = vec3(0.194, 0.249, 0.358);
  vec3 deep     = vec3(0.048, 0.073, 0.136);
  vec3 col = mix(ceiling, deep, zenith) + sodium * horizon * horizon * 0.30;

  // CLOUD.
  //
  // Projected onto a base a little over the roofline, so it drifts with the eye
  // instead of sitting on the far plane like a painted flat. Four octaves, and
  // the amplitudes are deliberately top-heavy: a one-bit dither cannot hold a
  // gentle variation, so the big shapes have to carry it and the small ones only
  // break the edges.
  //
  // The 0.22 floor was half the firefly problem. It is a flat-deck projection, so
  // it goes singular at the horizon: at up = 0 it multiplied the sampling
  // frequency by about nine, precisely where the eye spends its time when it is
  // looking OUT of the bay. Four octaves at nine times frequency under a one-bit
  // dither is a field of sparkle, however good the noise is.
  vec2 cp = dir.xz / max(0.22, abs(up) + 0.22);
  // FAST ENOUGH TO WATCH. 0.0025 was a deck that moved about a degree a minute,
  // which is honest weather and no use at all to a man standing in a yard with
  // his head back. This is a wind, and the whole point of opening the sky was
  // that there is something up there worth stopping for.
  float drift = uTime * 0.0140;
  // THE BASE OCTAVE WAS BIGGER THAN THE SKY. At 0.34 one feature of the largest
  // octave spans about three units of cp, and the whole band a clamped neck can
  // see is barely one — so the shape that carries this deck was, from where the
  // player stands, a constant. Everything overhead was the two small octaves and
  // a dither, which is grain. These are the same four octaves an octave up.
  float cloud = 0.50 * (0.5 + 0.5 * vnoise(cp + drift * 0.6, 0.85, 3.0))
              + 0.27 * (0.5 + 0.5 * vnoise(cp + drift * 1.0, 2.00, 11.0))
              + 0.15 * (0.5 + 0.5 * vnoise(cp + drift * 1.7, 4.60, 29.0))
              + 0.08 * (0.5 + 0.5 * vnoise(cp + drift * 2.6, 9.50, 47.0));
  // THE GATE WAS ABOVE THE EYE LINE.
  //
  // This used to be smoothstep(-0.12, 0.26, up): fully faded below fifteen
  // degrees, fully present above. r3dLook clamps pitch to +-0.62rad, so the neck
  // stops at 35.5 degrees, and from the yard the sky the player actually spends
  // time in runs from the skyline to about thirty. The cloud was computed
  // correctly, four octaves of it, and then multiplied out of the only band it
  // was ever going to be seen in. Exactly the fault the moon's altitude band had,
  // and the same fix.
  //
  // AND THE REMAP WAS BIASED TOWARD CLEAR. Four octaves of value noise average
  // one half, so subtracting 0.32 and scaling by 1.32 left a mean cloud cover of
  // about a quarter — which is to say the sky was mostly the BREAK term, mixing
  // half of every pixel toward the dark. This is an overcast: the deck is the
  // default and a break in it is the event.
  cloud = clamp((cloud - 0.20) * 1.90, 0.0, 1.0) * smoothstep(-0.10, 0.05, up);

  // THE DECK IS THE BRIGHT THING, AND IT WAS THE ONE TERM MISSING.
  //
  // Cloud fed three things and every one of them took light away: the halo round
  // the moon, a thin sodium tint, and a mix toward "deep" on the thick parts.
  // Nothing anywhere added the fact that actually makes an overcast city night
  // legible — the underside of the deck is lit FROM BELOW, by the town, and it is
  // the brightest thing in the frame after the moon. Four octaves of good noise
  // were being computed and then rendered as an absence, which is why this sky
  // dithered down to a flat grain.
  //
  // Thick deck catches the sodium and goes up. A break shows the real depth
  // behind it and goes down. Both read hardest near the horizon, where the cloud
  // is edge-on and there is a town's worth of it between you and the light.
  vec3 deck = mix(ceiling * 1.11, ceiling * 1.27 + sodium * 0.27, horizon);
  col = mix(col, deck, cloud * (0.56 + 0.34 * horizon));
  col = mix(col, deep * 0.62, (1.0 - cloud) * smoothstep(0.02, 0.30, up) * 0.62);
  col += sodium * 0.22 * cloud * (1.0 - zenith);

  // THE MOON, which is behind all of it.
  //
  // Bearing, altitude and phase come from the run seed, so a given night has one
  // moon in one place for its whole length. Every so often it comes in close and
  // reads twice the size — a perigee moon, and the only thing in this game that
  // is unambiguously beautiful.
  //
  // "WEST-ISH, MOSTLY" WAS THE WHOLE CIRCLE. The bearing used to be
  // uNightSeed * 6.28318 - 2.30, which is a full turn: uniform over 360 degrees,
  // with the subtraction only deciding where the seed's zero landed. The yard
  // sees an arc of maybe 120 degrees west; everything else is behind the
  // conservatory or behind the player's own shoulder, so three nights in four the
  // moon was authored somewhere it could not be stood in front of. The ALTITUDE
  // band was narrowed for exactly this reason and the bearing was left alone,
  // which is how "there is no moon" survived that fix.
  //
  // moonDir.x is cos(mAz) and west is -x — the same axis the town glow reads as
  // "the way the bay faces" — so PI is due west, down the gate line.
  float mAz  = 3.14159 + (fract(uNightSeed * 2.71) - 0.5) * 2.10;
  // ALTITUDE HAS TO FIT UNDER THE CAMERA. r3dLook clamps pitch to +-0.62rad, so
  // the eye cannot rise past 35.5 degrees — you cannot crane your neck in this
  // game. 0.26..0.39 is 19.4 to 32.6 degrees: a moon that sits differently every
  // night and is always inside the cone the neck allows.
  float mAlt = 0.26 + 0.13 * fract(uNightSeed * 7.13);
  vec3 moonDir = normalize(vec3(cos(mAz) * (1.0 - mAlt), mAlt, sin(mAz) * (1.0 - mAlt)));
  float super = step(0.82, fract(uNightSeed * 13.77));        // roughly one run in six
  float mR = mix(0.026, 0.052, super);
  float mCos = dot(dir, moonDir);
  float mD = acos(clamp(mCos, -1.0, 1.0));

  // Cloud in front of it eats it, which is what actually sells a moon on a night
  // like this — it comes and goes.
  float thinCloud = 1.0 - smoothstep(0.16, 0.72, cloud);

  // GLOW FIRST, DISC LAST. The halo was being added over the top of the moon,
  // which washed the disc out to the same value as the sky around it and left
  // nothing on screen but a faint ring where the dither happened to break. The
  // light around it has to go down before the thing itself does.
  col += vec3(0.42, 0.46, 0.56) * exp(-mD / (mR * 4.2)) * 0.30 * thinCloud;
  col += vec3(0.26, 0.30, 0.40) * exp(-mD / 0.50) * (0.16 + 0.30 * super);
  // Cloud between you and it takes the moon's light rather than the moon, so the
  // deck in front of it glows and the breaks stay dark.
  col += vec3(0.40, 0.43, 0.52) * cloud * exp(-mD / 0.40) * 0.70;

  // THE DISC.
  //
  // Two things made this render as an outline rather than as a moon. The maria
  // were sampled from dir.xz divided by the disc radius, which at 0.026 is a
  // frequency of about seventeen hundred — noise, not mottling, and the dither
  // turned it into a ring. And the phase and cloud terms multiplied down to under
  // a tenth on a thick night, so the fill sat at the value of the sky it was drawn
  // on and only the edge survived.
  //
  // The moon is the one thing in this game that is unambiguously beautiful. It
  // gets a floor.
  float disc = 1.0 - smoothstep(mR * 0.92, mR * 1.01, mD);
  vec3 toMoon = normalize(dir - moonDir * mCos);
  vec3 mUp = normalize(cross(moonDir, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
  vec2 face = vec2(dot(toMoon, mUp), toMoon.y) * (mD / max(mR, 1e-4));
  float phase = smoothstep(-0.85, 0.75, face.x + (fract(uNightSeed * 3.31) - 0.5) * 2.2);
  float maria = 0.88 + 0.12 * noise2(face * 1.9, 1.0, 5.0);
  float lit = disc * (0.55 + 0.45 * phase) * (0.62 + 0.38 * thinCloud);
  col = mix(col, vec3(1.34, 1.33, 1.26) * maria, lit);

  // The glow the city throws onto the cloud above it, to the west, where the bay
  // faces. Broad and shapeless: the light, not the source.
  col += vec3(0.58, 0.33, 0.13)
       * pow(clamp(-dir.x, 0.0, 1.0), 4.0) * pow(horizon, 2.2) * 0.70;

  // ── THE CITY ───────────────────────────────────────────────────────────────
  //
  // Distant ground is drawn as DIRECTION, not as geometry. It is kilometres out,
  // nothing about it is ever approached, and authoring it as cells was never
  // possible anyway — the sub-basement owns every ground-level cell west of the
  // bay. A skyline and a floor, which is also what this renderer is best at: a
  // one-bit dither cannot hold a subtle gradient but it holds a hard black shape
  // against a lit sky perfectly.
  //
  // IT USED TO BE A VALLEY. Hills, a treeline and a river, with a scatter of
  // sodium in the trough for "a town". That is a lovely thing to stand in and it
  // is the wrong planet: Ellery is a municipal conservatory of music with a
  // chain-link yard, a skip and a barbed-wire fence, in a northern industrial
  // city. You should be able to see what the building is on the edge OF.
  //
  // ONE SKYLINE, AND EVERYTHING UNDER IT IS GROUND. An earlier pass drew ridges
  // as separate dark bands ABOVE the horizon and left the region between them
  // dark, so the authored yard ran into a black stripe and then into a bright
  // sky. Ground does not work like that. There is one edge; below it is the city,
  // above it is weather.
  //
  // Sampled on the unit circle so it is periodic with no seam behind the player
  // at +/-pi.
  float azimuth = atan(dir.z, dir.x);
  vec2 ap = vec2(cos(azimuth), sin(azimuth));
  float west = clamp(-dir.x, 0.0, 1.0);

  // THE ROOFS. A mill town seen from a yard is not a curve, it is a long low run
  // of parallel ridges with the odd taller thing standing out of it. Two octaves
  // of gentle undulation for the ground the city is built on, then a hard square
  // wave at terrace frequency for the roofs themselves — that squared-off edge is
  // the whole difference between a skyline and a hillside.
  float ground = 0.021
    + 0.011 * noise2(ap * 1.7, 1.0, 7.0)
    + 0.005 * noise2(ap * 4.3, 1.0, 19.0);
  float terrace = 0.0125 * step(0.42, 0.5 + 0.5 * noise2(ap * 9.0, 1.0, 37.0))
                + 0.0060 * step(0.55, 0.5 + 0.5 * noise2(ap * 23.0, 1.0, 61.0));
  // Sawtooth: a weaving shed roof, north lights, the one silhouette that says
  // this town made something.
  float saw = 0.0075 * abs(fract(azimuth * 26.0) - 0.5)
            * step(0.62, 0.5 + 0.5 * noise2(ap * 3.1, 1.0, 43.0));
  // Chimney stacks and vent cowls along the ridge, in place of a treeline.
  float stacks = 0.0130 * step(0.955, hash01(floor(azimuth * 90.0), 3.0))
               + 0.0060 * step(0.910, hash01(floor(azimuth * 210.0), 9.0));
  float skyline = ground + terrace + saw + stacks;

  // THE TALL THINGS, each a hard-edged block standing off the general roofline.
  // Placed by bearing rather than by noise so a given night is always the same
  // city and the player can learn it: two post-war housing slabs, a gasholder,
  // a mill chimney and a tower crane, all clustered west and north-west where the
  // bay faces and where he drove in from.
  //
  // A "block" is a window in azimuth with its own height; ridges add, so a block
  // simply raises the skyline over its own arc.
  float blocks = 0.0;
  // slabs: wide, flat-topped, the tallest things out there
  blocks = max(blocks, 0.093 * step(abs(azimuth - 2.86), 0.052));
  blocks = max(blocks, 0.081 * step(abs(azimuth + 2.61), 0.044));
  // the gasholder: a drum, so its top is a shallow arc rather than a line
  {
    float d = (azimuth - 3.02) / 0.105;
    blocks = max(blocks, (0.050 + 0.012 * sqrt(max(0.0, 1.0 - d * d))) * step(abs(d), 1.0));
  }
  // the mill chimney: thin and the highest thing in the frame
  blocks = max(blocks, 0.118 * step(abs(azimuth + 2.93), 0.0075));
  // the tower crane: a mast, and a jib running off it one way
  blocks = max(blocks, 0.104 * step(abs(azimuth - 2.42), 0.0055));
  blocks = max(blocks, 0.101 * step(azimuth - 2.42, 0.0) * step(2.20, azimuth) * 0.985);
  skyline = max(skyline, blocks);

  // Depth below the skyline. The edge itself is the darkest thing in the frame —
  // a wet slate roof against a lit overcast is very nearly black — and it opens
  // out toward the near ground, which is catching the whole sky and has to meet
  // the authored yard's own value without a seam.
  float below = clamp((skyline - up) / 0.34, 0.0, 1.0);
  vec3 land = mix(vec3(0.020, 0.028, 0.046), vec3(0.108, 0.135, 0.188),
                  smoothstep(0.0, 1.0, below));

  // The far side of the city, hazed most of the way back to the sky. Aerial
  // perspective is the only depth cue a silhouette gets, so it is the whole
  // reason this reads as distance and not as a cut-out.
  float shoulder = 0.050
    + 0.026 * noise2(ap * 1.1, 1.0, 23.0)
    + 0.010 * noise2(ap * 3.3, 1.0, 31.0);
  col = mix(col, mix(col, vec3(0.086, 0.108, 0.152), 0.82),
            smoothstep(shoulder + 0.004, shoulder - 0.004, up));

  col = mix(col, land, smoothstep(skyline + 0.0022, skyline - 0.0022, up));

  // LIT WINDOWS, in the slabs. Not a texture — a lattice, because the one thing
  // a tower block does at night is show you which flats are still up. Sampled in
  // a grid tied to the block's own bearing so the columns stay vertical.
  vec2 wp = vec2(azimuth * 620.0, up * 900.0);
  float grid = step(0.62, fract(wp.x)) * step(0.55, fract(wp.y));
  float inSlab = step(abs(azimuth - 2.86), 0.052) + step(abs(azimuth + 2.61), 0.044);
  float windows = grid * clamp(inSlab, 0.0, 1.0)
                * step(up, skyline) * step(0.030, up)
                * step(0.72, hash01(floor(wp.x), floor(wp.y)));
  col += vec3(0.95, 0.78, 0.44) * windows * 0.75;

  // THE STREETS, in the trough under the roofline: points of sodium, never a
  // shape. You never see the city, only that something out there is still
  // switched on.
  float trough = smoothstep(skyline - 0.002, skyline + 0.008, up)
               * (1.0 - smoothstep(shoulder - 0.016, shoulder - 0.002, up));
  vec2 tp = vec2(azimuth * 460.0, (up - skyline) * 2600.0);
  float town = step(0.9800, hash01(floor(tp.x), floor(tp.y)))
             * trough * (0.18 + 0.82 * pow(west, 1.4));
  col += vec3(1.00, 0.58, 0.22) * town * 1.25;

  // THE VIADUCT. A horizontal run of arches below the roofline, catching sky in
  // the openings: the flattest, most legible piece of Victorian infrastructure
  // there is, and the one that says this town was built to move things.
  float viaY = skyline - 0.043;
  float arch = step(0.36, fract(azimuth * 62.0));
  float viaduct = (1.0 - smoothstep(0.0, 0.013, abs(up - viaY)))
                * arch * step(up, skyline)
                * smoothstep(0.35, 0.95, west);
  col += vec3(0.30, 0.34, 0.42) * viaduct * 0.42;

  // The aircraft warning light on the crane, and one on the taller slab. Slow, on
  // a schedule of their own, and the only moving thing in the distance.
  float beaconA = step(0.86, fract(uTime * 0.42))
                * (1.0 - smoothstep(0.0, 0.0055, length(vec2(azimuth - 2.42, up - 0.104))));
  float beaconB = step(0.90, fract(uTime * 0.31 + 0.5))
                * (1.0 - smoothstep(0.0, 0.0045, length(vec2(azimuth - 2.86, up - 0.093))));
  col += vec3(1.00, 0.16, 0.10) * (beaconA + beaconB) * 1.30;

  // Six o'clock municipal dawn: a cold wet deck with a pale eastern floor.
  // Sodium is no longer tinting the sky; ordinary daylight is arriving without
  // becoming picturesque. Van and cathedral variants use the same exterior
  // hour and let their geometry/rain distinguish the frame.
  if(uEndingWorldLook > 0.5){
    float dawnHorizon=1.0-smoothstep(-0.04,0.34,abs(up));
    vec3 dawnDeep=vec3(0.135,0.185,0.265);
    vec3 dawnDeck=vec3(0.42,0.49,0.56);
    vec3 dawn= mix(dawnDeck,dawnDeep,smoothstep(0.02,0.92,up));
    dawn += vec3(0.20,0.18,0.15)*dawnHorizon*0.18;
    col=mix(col,dawn,0.86);
  }

  return col;
}

// RAIN. Actual drops, in the world, with positions.
//
// What was here before was not rain. It was the angular field the rolling sky
// and the fireflies are built from, repurposed: the cell grid was indexed by
// RAY DIRECTION — bearing was rd.x + rd.z*.17, and the other axis rd.y — with the camera
// position folded in only as a scalar offset. Every drop lived on a sphere
// around the head. Its own comment claimed world metres and parallax and the
// maths did neither: turning slid the pattern around the eye, the three "depth
// sheets" were authored constants rather than anywhere a drop actually was, and
// nothing ever converged toward a vanishing point, because a direction field has
// no perspective to converge in.
//
// A drop is a thing in the world. So: sample the view ray at a few real depths,
// take the WORLD POINT at each, and let the world lattice there decide whether a
// drop is falling and where. Turning the camera now moves the eye through a
// standing volume of rain instead of dragging the rain with it, near drops sweep
// past faster than far ones because they genuinely are nearer, and a streak
// leans with the wind because the segment it is drawn from leans.
//
// The cost is bounded by the sample count, not by a march: RAIN_TAPS points, each
// a hash and a segment distance. Everything is derived from the world point P,
// never from the ray direction.

// How many world columns of rain a single ray will walk before giving up. Each
// is one hash and — for the tenth or so that actually hold a drop — one segment
// distance, so the cost is bounded and mostly early-out.
// Thirteen broad cells replace twenty-two narrow ones: forty per cent fewer
// worst-case column tests, with occupancy raised so the weather is denser even
// though the shader does less work.
const int RAIN_COLUMNS = 13;
const float RAIN_CELL_M = 0.95;

// Closest distance from the ray (ro, rd) to the segment a→b. Standard
// segment-segment closest approach, with the ray clamped to s >= 0 so drops
// behind the eye cannot draw.
float rayToSegment(vec3 ro, vec3 rd, vec3 a, vec3 b){
  vec3 u = rd, v = b - a, w = ro - a;
  float A = dot(u,u), B = dot(u,v), C = dot(v,v), D = dot(u,w), E = dot(v,w);
  float den = A*C - B*B;
  float s, t;
  if(den < 1e-6){ s = 0.0; t = clamp(E/max(C,1e-6), 0.0, 1.0); }
  else { s = (B*E - C*D)/den; t = clamp((A*E - B*D)/den, 0.0, 1.0); }
  s = max(s, 0.0);
  return length((ro + u*s) - (a + v*t));
}

// One column of world: does it hold a drop right now, and does this ray cross it?
float rainColumn(vec3 ro, vec3 rd, vec2 cell, float eyeY, float surfaceViewM, float reduced){
  float seed = hash01(cell.x*1.7 + 11.0, cell.y*1.3 - 7.0);
  // Rain is sparse — but not THIS sparse. At 0.90 the streaks read as the odd
  // stray drop; a wet night wants air between them and still a curtain of them.
  if(seed < 0.72) return 0.0;

  float jitterX = hash01(cell.x + 31.0, cell.y - 17.0);
  float jitterZ = hash01(cell.x - 53.0, cell.y + 29.0);
  float clock = uTime * mix(1.0, 0.38, reduced);

  // It falls, and it wraps. Fall speed and the wrap height are per-column, so the
  // field does not pulse in unison the way one shared clock would make it.
  float fallSpeed = mix(17.0, 27.0, seed);
  float span = 7.0 + 5.0 * jitterX;
  float phase = fract(seed*3.3 + clock * fallSpeed / span);
  // Wrapped around the EYE's height, so there is always rain where you are
  // looking without simulating a column from the cloud deck to the ground.
  float topY = eyeY + span * 0.5 - phase * span;

  // The streak is how far it travels while the shutter is open, leaned by wind.
  float streak = mix(0.78, 1.62, seed) * mix(1.0, 0.38, reduced);
  vec3 a = vec3(cell.x*RAIN_CELL_M + jitterX*RAIN_CELL_M, topY,
                cell.y*RAIN_CELL_M + jitterZ*RAIN_CELL_M);
  vec3 b = a - vec3(0.29*streak, streak, 0.10*streak);

  // Thin in METRES, so perspective alone decides how wide it lands on screen.
  float radius = 0.016 + 0.008 * jitterZ;
  float d = rayToSegment(ro, rd, a, b);
  return 1.0 - smoothstep(radius * 0.30, radius, d);
}

// WALK THE COLUMNS, do not sample depths.
//
// Sampling a handful of depths and looking up whatever cell each landed in was
// the first attempt, and it drew specks rather than streaks: neighbouring pixels
// along one drop land their taps in DIFFERENT cells, so each drop got found at a
// point instead of along its length, and the streak came apart. Marching the
// columns means every ray that crosses a drop finds the same drop, which is what
// makes a streak a streak.
//
// A standard 2D DDA over the xz lattice, the same shape as the world march above.
float rainVolume(vec3 ro, vec3 rd, float surfaceViewM){
  float reduced = uReduceMotionOptical;
  float range = min(surfaceViewM, 16.0);
  float horiz = length(rd.xz);

  vec2 pos = ro.xz / RAIN_CELL_M;
  vec2 cell = floor(pos);
  float acc = rainColumn(ro, rd, cell, ro.y, surfaceViewM, reduced);
  // Looking straight up or down there is no horizontal march to make; the column
  // overhead has already been tested and that is the honest answer.
  if(horiz < 1e-3) return acc;

  vec2 dirn = rd.xz / horiz;
  vec2 stp = sign(dirn);
  vec2 safe = max(abs(dirn), vec2(1e-6));
  vec2 tDelta = 1.0 / safe;
  vec2 tMax = (cell + max(stp, vec2(0.0)) - pos) / mix(safe, -safe, step(stp, vec2(-0.5)));
  float travelled = 0.0;

  for(int i = 0; i < RAIN_COLUMNS; i++){
    if(tMax.x < tMax.y){ travelled = tMax.x; tMax.x += tDelta.x; cell.x += stp.x; }
    else               { travelled = tMax.y; tMax.y += tDelta.y; cell.y += stp.y; }
    // Cell units along the horizontal projection back into world metres of view.
    float tWorld = travelled * RAIN_CELL_M / horiz;
    if(tWorld > range || tWorld >= surfaceViewM) break;
    float depthFade = 1.0 - smoothstep(surfaceViewM*0.72, surfaceViewM, tWorld);
    acc = max(acc, rainColumn(ro, rd, cell, ro.y, surfaceViewM, reduced) * depthFade);
  }
  return acc * mix(1.0, 0.35, reduced);
}

// Sparse rings in the wet aggregate. This is surface response, not a second
// particle system: one deterministic impact lives in some metre-wide cells,
// expands, dies, and leaves the existing night-sky reflection to do the actual
// lighting. The pattern is world anchored so it cannot swim under the player.
float rainImpactRings(vec2 worldM){
  float clock=uTime*mix(1.0,.36,uReduceMotionOptical);
  vec2 q=worldM*.92,id=floor(q),p=fract(q)-.5;
  float seed=hash01(id.x+17.0,id.y-43.0);
  float present=step(.48,hash01(id.x-61.0,id.y+23.0));
  vec2 center=vec2(
    hash01(id.x+5.0,id.y+79.0),
    hash01(id.x-37.0,id.y+11.0)
  )*.48-.24;
  float phase=fract(clock*2.18+seed);
  float radius=phase*.44;
  float ring=1.0-smoothstep(.018,.050,abs(length(p-center)-radius));
  float life=smoothstep(.01,.06,phase)*(1.0-smoothstep(.52,.88,phase));
  float strike=(1.0-smoothstep(.025,.105,length(p-center)))
              *(1.0-smoothstep(.018,.12,phase));
  // The crown throws two brief beads back off the tarmac. Analytic discs are
  // substantially cheaper than another particle field and give the impact a
  // visible upward/bounce beat before the spreading ring takes over.
  vec2 gust=normalize(vec2(hash01(id.x+8.0,id.y-2.0)-.5,hash01(id.x-4.0,id.y+6.0)-.5)+vec2(.001));
  float hop=sin(min(phase/.34,1.0)*3.14159)*.20;
  float beadLife=1.0-smoothstep(.10,.38,phase);
  float beadA=1.0-smoothstep(.018,.052,length(p-center-gust*hop));
  float beadB=1.0-smoothstep(.016,.046,length(p-center+gust.yx*hop*.72));
  return present*(ring*life+strike*.88+(beadA+beadB)*beadLife*.48)*mix(1.0,.14,uReduceMotionOptical);
}

void compositeHushBody(
  vec4 bodySpec,
  vec4 bodyLook,
  vec3 ro,
  vec3 rd,
  vec3 fwd,
  inout vec3 col,
  inout float zView
){
  // The cover-art figure is a real presence in the room, not a screen decal.
  // Intersect a vertical cylindrical billboard at the HUSH position and test
  // that depth against the already-composed architecture + prop surface. The
  // body therefore vanishes behind doors, walls and road cases while retaining
  // its authored front silhouette from every approach direction.
  if(bodySpec.w > 0.5 && bodySpec.z > 0.001 && bodyLook.w < 2.5){
    vec2 bodyCenter=bodySpec.xy+vec2(.5);
    vec2 planeNormal=normalize(ro.xz-bodyCenter+vec2(.0001));
    vec2 planeRight=vec2(-planeNormal.y,planeNormal.x);
    float planeDenom=dot(rd.xz,planeNormal);
    float safePlaneDenom=abs(planeDenom)<.0001?-.0001:planeDenom;
    float bodyT=dot(bodyCenter-ro.xz,planeNormal)/safePlaneDenom;
    float bodyView=bodyT*CELL_METERS*max(.001,dot(rd,fwd));
    float bodyRange=length(bodyCenter-ro.xz)*CELL_METERS;
    Cell bodyCell=cellAtI(ivec2(floor(bodyCenter)));
    float bodyBase=bodyCell.f+.025/CELL_METERS;
    vec3 bodyHit=ro+rd*bodyT;
    vec2 bodyUv=vec2(
      dot(bodyHit.xz-bodyCenter,planeRight)*CELL_METERS/max(.1,bodyLook.y)+.5,
      (bodyHit.y-bodyBase)*CELL_METERS/max(.2,bodyLook.x)
    );
    bool insideCard=bodyT>0.0&&bodyUv.x>0.0&&bodyUv.x<1.0&&bodyUv.y>0.0&&bodyUv.y<1.0;
    bool bodyVisible=insideCard&&bodyView<zView+.012&&bodyRange>.22;
    if(bodyVisible){
      vec4 bodySample=texture(uHushBodyTex,bodyUv);
      float sdf=(bodySample.r-.5)*56.0;
      // Never let minification turn the SDF derivative into card coverage.
      // At distance fwidth can span many source texels; unbounded, that makes
      // the zero-crossing wide enough to resolve the transparent billboard as
      // a rectangle.  The authored body only needs a couple of SDF texels of
      // antialiasing at any range.
      float aa=clamp(fwidth(sdf)*1.35,.7,2.6);
      float cardDistance=min(
        min(bodyUv.x,1.0-bodyUv.x),
        min(bodyUv.y,1.0-bodyUv.y)
      );
      // The feet intentionally sit near the bottom of the texture, so the
      // outer glow can reach the card boundary even though the body cannot.
      // Fade the last few transparent texels for every manifestation channel
      // (including depth) so a clipped halo can never draw a straight edge.
      float cardFade=smoothstep(.008,.055,cardDistance);
      // The source-alpha channel carries a faint matte over the original
      // smart-object bounds. Treating it as literal coverage exposed the
      // entire rectangular card. Only the authored opaque figure and the SDF
      // interior are allowed to become body coverage.
      float sourceCoverage=smoothstep(.28,.72,bodySample.g)*cardFade;
      float silhouette=max(sourceCoverage,smoothstep(-aa,aa,sdf))*cardFade;
      float edge=exp(-abs(sdf)/max(1.15,aa*1.4))*cardFade;
      float outsideDistance=max(0.0,-sdf);
      // A Photoshop-style outer glow has finite support. The old exponential
      // had a non-zero tail at every pixel of the billboard, which the
      // recording acquisition pass correctly revealed as a box.
      float haloSupport=1.0-smoothstep(9.0,14.0,outsideDistance);
      float outer=exp(-outsideDistance/5.2)*haloSupport*(1.0-silhouette)*cardFade;
      float rangeFade=smoothstep(.22,.68,bodyRange);
      float manifestation=clamp(bodySpec.z*rangeFade,0.0,1.0);
      // In/out is a material apparition, not character animation: the figure
      // remains perfectly still while its lower and upper contours resolve at
      // slightly different rates. Reduced motion still sees the same static
      // final silhouette because this contains no time-driven motion.
      float resolveBand=1.0-smoothstep(-.18,1.12,bodyUv.y-(manifestation-.5)*1.55);
      float resolved=manifestation*mix(manifestation,resolveBand,.28);
      float mode=bodyLook.w;
      float coreEnabled=mode<1.5?1.0:0.0;
      float glowEnabled=(mode<.5||(mode>1.5&&mode<2.5))?1.0:0.0;
      float bodyAlpha=clamp(silhouette*resolved*coreEnabled,0.0,1.0);
      float outlineAlpha=clamp(edge*resolved*coreEnabled,0.0,1.0);
      float fieldAlpha=clamp(
        (outer*.48+edge*.08)*bodyLook.z*resolved*glowEnabled,
        0.0,
        .72
      );
      // The cover figure is negative first: its surrounding field eats the
      // available light, and the human mass consumes almost everything that
      // remains.  The card itself never participates because every term is
      // derived from the guarded SDF coverage above.
      col*=1.0-clamp(fieldAlpha*.44+bodyAlpha*.88,0.0,.965);
      // Photoshop ordering from the cover, kept deliberately low-energy:
      // a cold Screen haze gives the absence an edge, then Color Dodge raises
      // only the local boundary.  Neither operation fills the person.
      vec3 negativeTint=vec3(.045,.105,.115);
      vec3 glowLayer=negativeTint*(outer*.24+edge*.055)*bodyLook.z*resolved*glowEnabled;
      col=hushScreen(col,glowLayer);
      vec3 bodySeed=negativeTint*(.020+edge*.026)*bodyAlpha;
      col=hushScreen(col,bodySeed);
      vec3 dodgeLayer=vec3(.025,.065,.072)*outlineAlpha;
      vec3 dodged=hushColorDodge(col,dodgeLayer);
      col=mix(col,dodged,outlineAlpha*.24);
      // The recording-acquisition pass intentionally reduces ordinary light
      // to one-bit ink. Reserve two chroma keys for this authored compositor
      // so that pass can reconstruct the PSD ordering *after* acquisition
      // instead of collapsing the figure and its glow into a white contour.
      // These are not visible cards: both keys are bounded by the actual SDF.
      float acquisitionGlow=clamp((outer*.82+edge*.11)*resolved*glowEnabled,0.0,1.0);
      float acquisitionBody=bodyAlpha;
      col=mix(col,vec3(.018,.355,.145),acquisitionGlow*.72);
      // The reserved body key is diagnostic transport, not display colour.
      // The acquisition pass consumes it and restores a light-eating mass;
      // carrying the full silhouette avoids reducing the cover to line art.
      col=mix(col,vec3(.016,.245,.735),acquisitionBody*.94);
      // The billboard is only an intersection aid.  It must never become a
      // rectangular depth surface: doing so makes the fog/post stack reveal
      // the transparent card as a black slab.  Only authored body coverage
      // writes depth; the outer glow remains light with no geometry of its own.
      if(silhouette*resolved>.018) zView=min(zView,bodyView);
    }
  }

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
  // The baked ambient of the cell the ray actually lands in, captured with the
  // hit like zone and material rather than re-fetched during shading.
  float hitPlace = 1.0;
  // Whether the surface we ended up on stands under open sky. Ambient falloff is
  // an indoor model and has to be switched off out there — see below.
  bool  hitSky = false;
  vec3 n = vec3(0.0, 1.0, 0.0);

  ivec2 cell = ivec2(floor(ro.xz));
  Cell eyeCell=cellAtI(cell);
  // SKY on the camera cell is the floorplan's semantic statement that the
  // player is standing in the weather. It gates full-frame rain to the road,
  // yard and open apron without leaking it into the chapel's broken pane or an
  // interior skylight merely because this particular ray happens to see sky.
  bool cameraInWeather=uUsePlan>.5&&(eyeCell.flags&FLAG_SKY)!=0;
  vec2 drd = 1.0 / max(abs(rd.xz), vec2(1e-5));
  ivec2 stp = ivec2(rd.x < 0.0 ? -1 : 1, rd.z < 0.0 ? -1 : 1);
  vec2 sideT = (vec2(cell) + max(vec2(stp), 0.0) - ro.xz) / (rd.xz + 1e-9);

  Cell cur = eyeCell;
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
            tHit = tw; surf = 4; n = vec3(0.0, ro.y<waterY?-1.0:1.0, 0.0); hitZone = cur.zone; hitMat = MAT_WET; hitPlace = cur.place; hitSky = (cur.flags & FLAG_SKY) != 0; break;
          }
        }
      }
      // the floor of the cell you are crossing
      if(rd.y < -1e-4){
        float tf = (cur.f - ro.y) / rd.y;
        if(tf >= tEnter && tf <= tExit){
          tHit = tf; surf = 2; n = vec3(0.0, 1.0, 0.0); hitZone = cur.zone; hitMat = cur.mat; hitPlace = cur.place; hitSky = (cur.flags & FLAG_SKY) != 0; break;
        }
      }
      // and its ceiling, unless it is open to the dark
      if(rd.y > 1e-4 && (cur.flags & FLAG_SKY) == 0){
        float tc = (cur.c - ro.y) / rd.y;
        if(tc >= tEnter && tc <= tExit){
          tHit = tc; surf = 3; n = vec3(0.0, -1.0, 0.0); hitZone = cur.zone; hitMat = cur.mat; hitPlace = cur.place; hitSky = (cur.flags & FLAG_SKY) != 0; break;
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
      // A wall belongs to the room you are standing in, not the rock behind it.
      hitPlace = nc.solid ? cur.place : nc.place;
      hitSky = ((nc.solid ? cur.flags : nc.flags) & FLAG_SKY) != 0;
      break;
    }

    cell = nxt; cur = nc; tEnter = tExit;
    if(xSide) sideT.x += drd.x; else sideT.y += drd.y;
  }

  vec3 col;
  // Stable sensor grain. The previous time-offset hash made stationary walls
  // sparkle even when no authored effect was changing.
  float grain = hash01(gl_FragCoord.x, gl_FragCoord.y);
  if(tHit < 0.0){
    // THE RAY LEFT THE BUILDING.
    //
    // For most of this game's life that could only happen over a bricked lift
    // shaft, so it returned a two-stop black and the comment said "nothing to
    // see up there", which was true. The loading bay opens west onto the yard,
    // and it is the first time anything here looks outward — so this is now a
    // sky, and it is the one in the cold open: half nine at night, raining, a
    // condemned site on the edge of a town that still has its lights on.
    //
    // Source Space and the procedural sample field keep the void. They are not
    // outdoors; they are nowhere, and a horizon would say the wrong thing.
    if(uUsePlan < 0.5){
      float g = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
      col = mix(vec3(0.040, 0.043, 0.050), vec3(0.010, 0.010, 0.014), g);
      col += texture(uRD, rd.xz * 0.4 + uTime * 0.004).g * 0.012;
    } else {
      // ONE CALL. Everything that used to be inlined here — the deck, the
      // moon, the skyline, the streets — lives in nightSky() now, so the wet
      // ground can ask for the same sky it is reflecting. See the sheen below.
      vec3 dir = normalize(rd);
      col = nightSky(dir);

    }
  } else {
    vec3 pos = ro + rd * tHit;
    vec3 posM = pos * CELL_METERS;
    vec3 roM = ro * CELL_METERS;
    // Architecture is differentiated by material and light, never by the old
    // zone-navigation colors. The procedural audio lab may keep its world tint.
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
    // belongs to the sample-field lab; on architecture it reads as rolling fog bands.
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
    bool sourceVoidMaterial=hitMat==MAT_SOURCE_VOID;
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
    } else if(!sourceVoidMaterial && uSurfacesReady > 0.001 && surf != 3 && surf != 4){
      int sslot; float stile, sblend;
      vec2 suv = surfaceUv(surf,posM,n);
      // Read off the SAME normal surfaceUv just used. The normal map perturbs n
      // below, and a plane chosen from the perturbed one would disagree with the
      // UVs the grain was measured in.
      gMarkPlane=surf!=1?0.0:(abs(n.x)>.5?0.5:1.0);
      surfaceSlot(hitMat, surf, suv, sslot, stile, sblend);
      vec3 sc = vec3(suv / stile, float(sslot));
      // Texture coordinates remain fixed to the authoritative world plane.
      // Height still supplies occlusion and reinforces the normal response,
      // but it must not slide the material under the camera: that made a wall
      // change direction and texture density merely because the player turned.
      vec3 T = (surf == 1) ? normalize(vec3(-n.z, 0.0, n.x)) : vec3(1.0, 0.0, 0.0);
      if(dot(T, T) < 0.01) T = vec3(1.0, 0.0, 0.0);
      vec3 B = (surf == 1) ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
      vec2 scDx=dFdx(sc.xy),scDy=dFdy(sc.xy);
      vec2 material=textureGrad(uSurfMaterial,sc,scDx,scDy).rg;
      float h0=material.g;
      vec3 nm = textureGrad(uSurfNormal,sc,scDx,scDy).rgb * 2.0 - 1.0;
      surfRough = material.r;
      // The native reaction field and generated detail participate in the
      // physical response, not only in albedo. Geometry remains a flat,
      // authoritative collision plane; only micro-normal and roughness move.
      vec4 slotResponse=dreamSlotResponse(sslot);
      vec2 materialRdUv=fract(suv/(stile*3.6)+vec2(float(sslot)*.071,float(sslot)*.113));
      float materialRd=texture(uRD,materialRdUv).g-.5;
      // RELIEF IS THE REAL CHANNEL. Albedo changes are luminance-pinned upstream
      // and then point-sampled away by the VFD cell grid, but a change in the
      // surface NORMAL changes how the torch strikes it — which moves shading,
      // which moves edges, and edges are what this display is built to draw.
      // So the generated tile is read as a height field and differentiated.
      //
      // The layer index must follow the boil layout (slot*K + frame); reading
      // float(sslot) here sampled a different material's tile entirely.
      float dFrames=max(1.0,uDreamFramesA);
      float dPhase=0.0;
      if(uBoilHz>0.0001&&dFrames>1.5){
        float dJit=fract(sin(dot(floor(suv*11.0),vec2(12.9898,78.233)))*43758.5453);
        dPhase=uTime*uBoilHz*(1.0+uAgitation*1.4)+dJit*1.37;
      }
      float dBase=float(sslot)*dFrames;
      float dLayer=dBase+mod(floor(dPhase),dFrames);
      vec3 dc=vec3(sc.xy,dLayer);
      vec2 dtex=vec2(1.0/512.0,0.0);
      float dl=dot(textureGrad(uSurfDream,dc-vec3(dtex.x,0.0,0.0),scDx,scDy).rgb,vec3(.2126,.7152,.0722));
      float dr=dot(textureGrad(uSurfDream,dc+vec3(dtex.x,0.0,0.0),scDx,scDy).rgb,vec3(.2126,.7152,.0722));
      float dd=dot(textureGrad(uSurfDream,dc-vec3(0.0,dtex.x,0.0),scDx,scDy).rgb,vec3(.2126,.7152,.0722));
      float du=dot(textureGrad(uSurfDream,dc+vec3(0.0,dtex.x,0.0),scDx,scDy).rgb,vec3(.2126,.7152,.0722));
      vec2 dreamSlope=vec2(dr-dl,du-dd);
      // Agitation deepens the relief rather than merely tinting it: a boiling
      // wall should catch the light differently, not just read a shade darker.
      float reliefGain=uDreamNormalResponse*(1.0+uAgitation*2.2)*(1.0+uDreamStructureMix*1.6);
      nm.xy+=dreamSlope*reliefGain*slotResponse.w*14.0*uSurfacesReady;
      nm.xy+=materialRd*uLocalDiffusion*uDreamNormalResponse*slotResponse.w*uSurfacesReady;
      // Generated detail also roughens and polishes the surface, so the torch's
      // specular lobe crawls across it as the boil advances.
      float dreamRough=(dr+dl+du+dd)*.25-.5;
      surfRough=clamp(surfRough
        +(dreamRough*uDreamRoughnessResponse*(1.0+uAgitation*1.8)*slotResponse.z*2.2
        +materialRd*uLocalDiffusion*uDreamRoughnessResponse*slotResponse.z)*uSurfacesReady,0.04,1.0);
      n = normalize(n + (T * nm.x + B * nm.y) * 0.58);
      surfaceOcclusion=mix(1.0,mix(.68,1.0,smoothstep(.12,.88,h0)),uSurfacesReady);
      // THE RAMP IS THE BLEND. At 0 this leaves pbrBlend at zero and the albedo
      // below is exactly the procedural fallback; at 1 it is exactly the bank.
      // Only the journey between them is new.
      pbrReady=true;pbrSlot=sslot;pbrTile=stile;pbrBlend=sblend*uSurfacesReady;pbrUv=sc.xy*stile;
    }
    if(surf == 4){
      vec2 wuv=waterUv(pos.xz);
      vec2 texel=vec2(1.0/${WATER_W.toFixed(1)},1.0/${WATER_H.toFixed(1)});
      float hL=texture(uWaterHeight,clamp(wuv-vec2(texel.x,0.0),vec2(0.0),vec2(1.0))).r;
      float hR=texture(uWaterHeight,clamp(wuv+vec2(texel.x,0.0),vec2(0.0),vec2(1.0))).r;
      float hD=texture(uWaterHeight,clamp(wuv-vec2(0.0,texel.y),vec2(0.0),vec2(1.0))).r;
      float hU=texture(uWaterHeight,clamp(wuv+vec2(0.0,texel.y),vec2(0.0),vec2(1.0))).r;
      float waterSide=uWaterCamera.x>.5?-1.0:1.0;
      n=normalize(vec3(-(hR-hL)*2.8,waterSide,-(hU-hD)*2.8));
    }
    if(!pbrReady&&!sourceMaterial)seam=materialSeam(hitMat,surf,posM,n);

    // Interior lighting: a lamp the player carries. Inverse-square falloff with
    // Lambert on the true face normal — this is what makes a corridor read as
    // a corridor (near walls bright, the far end swallowed).
    float dist = length(toEyeM);
    vec3 ldir = normalize(toEye);
    float lambert = clamp(dot(n, ldir), 0.0, 1.0);
    float torchReach=max(.35,uTorchReach);
    float falloff = 1.0 / (1.0 + (0.10/torchReach) * dist + (0.045/(torchReach*torchReach)) * dist * dist);
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
    float cone     = smoothstep(uTorchCone.x, uTorchCone.y, axis);        // the disc
    float beamRim  = smoothstep(uTorchCone.x-.04, uTorchCone.x+.015, axis) * 0.30;
    float spill    = smoothstep(0.30, uTorchCone.x-.02, axis) * uTorchSpill;
    float beam = (cone + beamRim + spill) * uLight;
    // Unevenness belongs to the lens edge, never the whole room. The static RD
    // sample breaks the perfect circle without becoming moving fog or noise.
    float lensDirt=texture(uRD,fract(gl_FragCoord.xy/uRes*1.7+vec2(.13,.07))).g;
    float rimMask=clamp(beamRim*3.33*(1.0-cone*.78),0.0,1.0);
    beam*=mix(1.0,mix(.965,1.018,lensDirt),rimMask*uOpticalEffects);
    float propShadow=propFlashShadow(posM,n,ldir);
    float lamp = lambert * falloff * nearSoft * 3.0 * beam * propShadow;   // a torch, not a flare
    if(uLocalShadowIndex>=0)lamp=lambert*falloff*nearSoft*3.0*beam;         // the map belongs to the hero practical
    // THE FIGURES MUST BLOCK THE WHOLE RED FIELD, NOT ONE LAMP OF FIVE.
    //
    // The shadow map belongs to a single hero practical, and the silhouette used
    // to be applied only to that lamp's own contribution. In the concert hall
    // five emergency lamps overlap, so removing one of five was a twenty-percent
    // dip — the apparitions were being submitted, the shadow pass was running,
    // and there was simply nothing on screen to see. Measured: figures 3,
    // shadow.active true, and no visible body.
    //
    // One shadow map, sampled once, applied to every emergency contribution. It
    // is not what five lamps would really do, but the room only has one red in
    // it and a body standing in that red blocks it. Nothing else is touched, so
    // ordinary fittings and the torch keep their honest single-source shadows.
    //
    // AND THE SHADOW IS WHITE. See the long note beside apparitionWhite below.
    float heroShadow=1.0,apparitionBody=0.0,apparitionHalo=0.0;
    if(uLocalShadowIndex>=0){
      vec3 heroDir=normalize(uLocalLightPos[uLocalShadowIndex].xyz-posM);
      // Remapped hard: the normal twenty-percent shadow floor is an ambient
      // occluder, and an apparition is not a mild exposure change.
      float heroLit=clamp((propFlashShadow(posM,n,heroDir)-.20)/.80,0.0,1.0);
      heroShadow=mix(.015,1.0,heroLit);
      apparitionBody=1.0-heroLit;
      // The halo is what the wide sample sees and the sharp one does not, so the
      // glow stands OFF the silhouette instead of doubling its brightness.
      apparitionHalo=max(propFlashHalo(posM,n,heroDir)-apparitionBody,0.0);
    }
    vec3 localLight=vec3(0.0);
    vec3 emergencyLight=vec3(0.0);
    // What the red WOULD have delivered here with nothing standing in the way.
    // The white below is scaled by this and by nothing else, which is the whole
    // discipline of the effect: no lamp reaching this surface, no apparition on
    // it. A silhouette floating on an unlit wall is a decal, not a shadow.
    vec3 emergencyReach=vec3(0.0);
    for(int li=0;li<${MAX_LOCAL_LIGHTS};li++){
      if(li>=uLocalLightCount)break;
      vec3 delta=uLocalLightPos[li].xyz-posM;
      float localDistance=length(delta),radius=max(.01,uLocalLightPos[li].w);
      float attenuation=pow(clamp(1.0-localDistance/radius,0.0,1.0),2.0);
      float localLambert=max(dot(n,normalize(delta)),0.0);
      float emergency=clamp(uLocalLightEmergency[li],0.0,1.0);
      float localShadow=max(float(li==uLocalShadowIndex),emergency)>.5?heroShadow:1.0;
      float architecturalShadow=architecturalLightVisibility(posM,uLocalLightPos[li].xyz);
      architecturalShadow=mix(architecturalShadow,1.0,clamp(uLocalLightPenetration[li],0.0,1.0));
      vec3 unshadowed=uLocalLightColor[li].rgb*uLocalLightColor[li].w*attenuation*localLambert*architecturalShadow;
      vec3 contribution=unshadowed*localShadow;
      localLight+=contribution;
      emergencyLight+=contribution*emergency;
      emergencyReach+=unshadowed*emergency;
    }
    // A SHADOW THAT IS BLACK IS A HOLE. THIS ONE IS A PRESENCE.
    //
    // Subtracting the red where a body stands is what a body does, and it was
    // also unreadable. The beat is the ONLY light in this room and it does not
    // fill it — measured in the auditorium, 19% of the frame carries red and the
    // rest is already black — so an absence of the only light is indistinguishable
    // from the wall it was cast on. Three figures were being projected correctly
    // and disappearing into the surrounding dark.
    //
    // So the occlusion is kept — the red still stops at the body, which is what
    // makes the shape read as cast rather than painted — and the hole it leaves
    // is filled with WHITE. A photographic negative of a shadow: the one thing in
    // a red room that is neither red nor black, and the brightest thing on screen
    // for as long as the beat holds.
    //
    // The red decides WHETHER, not how much. A first pass scaled the white
    // linearly by the light that would have arrived and measured out at scene
    // byte ~50 — brighter than the red around it, and still nowhere near white:
    // the display buckets by luminance against a white point of byte 117, so
    // anything under that lands in palWorldDark..palWorldMid and comes out a
    // grey-blue smudge. A silhouette that is merely lighter than its background
    // is not the note; the note is WHITE.
    //
    // So reach is a gate with a threshold, not a multiplier. Under it there is no
    // apparition at all — a body needs a lamp behind it, and a figure floating on
    // an unlit wall would be a decal. Over it the body is fully white regardless
    // of how far down the room it is standing, which is also what makes the
    // effect legible from the back of the auditorium.
    //
    // Measured against the reach the auditorium actually delivers (mean .36 over
    // the lit frame): .06 is comfortably below anything the hall lamps put on a
    // surface they light, .40 is comfortably above.
    float apparitionReach=max(max(emergencyReach.r,emergencyReach.g),emergencyReach.b);
    float apparitionLit=smoothstep(.06,.40,apparitionReach);
    // AND THE PARTIAL OCCLUSION HAS TO READ AS HARD AS THE FULL.
    //
    // The shadow map is a 2x2 PCF, so occlusion arrives quantised to fifths and
    // most of a silhouette's area is a fringe at a quarter or a half rather than
    // solid. The black version got away with taking that linearly because it
    // MULTIPLIES: a quarter-occluded pixel keeps a quarter of the red and reads
    // as shadow immediately. An additive white taken linearly does the opposite —
    // a quarter-occluded pixel gets a quarter of the white and vanishes, so the
    // body came out as a faint core with nothing around it. The .45 power is the
    // curve that makes a quarter of the occlusion worth half of the white, which
    // is what the eye is already being told by the missing red.
    float apparitionInk=pow(apparitionBody,.45);
    // Aimed at byte ~190 against the display's byte-117 white point, so the body
    // saturates palCream and reads as paper. The halo lands around byte 80 — two
    // thirds of the way into the mauve->cream bucket, which is a white glow
    // rather than a second body.
    vec3 apparitionWhite=vec3(.94,.96,1.0)*apparitionInk*apparitionLit*.78;
    vec3 apparitionGlow=vec3(.90,.93,1.0)*pow(apparitionHalo,.60)*apparitionLit*.34;
    // The unlit floor is deliberately lifted. With the torch off — or taken — a
    // dark-adapted eye still resolves a room: you are not blind, you simply
    // cannot see WELL. A black screen is not horror, it is a bug you cannot play.
    //
    // BUT IT HAS TO FALL OFF, OR IT IS NOT LIGHT. This was a bare constant, so
    // a wall one metre away and one thirty metres down a corridor received the
    // same ambient — and with the torch off that leaves no depth cue at all,
    // only silhouettes. The room read as wireframe: everything equally visible,
    // nothing receding. Dark adaptation lets you resolve what is NEAR you; it
    // does not show you the far end of an unlit building.
    //
    // Falls to a floor rather than to zero, so the original promise holds: the
    // near room is still legible with no torch at all.
    //
    // AND IT IS A PROPERTY OF PLACE. The distance term above shapes ambient
    // within one view; hitPlace decides how much this cell had to begin with,
    // baked from its distance to an opening and how enclosed it is (see
    // bakeAmbientField). Ambient IS spill from the openings, so a room four
    // metres under the atrium skylight should not be lit like a corridor
    // eighteen metres inside the building — which is what one number per zone
    // did. uAmbientPlace is the strength: 0 restores the flat per-zone value.
    // Sampled smoothly at the hit rather than taken from the cell the ray ended
    // in — see ambientPlaceAt. hitPlace is still what the march carries, and is
    // still the right value for anything that needs one number per cell.
    float place = mix(1.0, ambientPlaceAt(pos.xz), uAmbientPlace);
    // AMBIENT FALLS OFF INDOORS AND DOES NOT FALL OFF OUTDOORS.
    //
    // The reach below is an interior model, and a good one: it is what makes an
    // unlit room recede instead of reading as wireframe. It is also squared, so
    // by nine metres a surface keeps a quarter of its ambient and by thirty it
    // keeps a twentieth.
    //
    // That is wrong under open sky, where the source is not a lamp in the room —
    // it is the whole hemisphere, and it is no dimmer over the far end of the
    // yard than over the near end. Applied out there it made fifty metres of
    // authored ground render as a black band under a bright horizon, which is
    // the one arrangement a night sky never produces.
    float ambientReach = mix(3.5, 9.0, clamp(uAmbientIntensity * place * 26.0, 0.0, 1.0));
    if(hitSky) ambientReach = 400.0;
    float ambientFall = 1.0 / (1.0 + dist / max(0.75, ambientReach));
    float ambient = uAmbientIntensity * place * mix(1.0,1.12,uLight)
                  * mix(uAmbientFloor, 1.0, ambientFall * ambientFall);
    // n.y = +1 is a floor and gets least (it is the source, not the receiver);
    // 0 is a wall; -1 is a ceiling and gets all of it. Gained by the torch so the
    // return trip grows when the player actually lights the floor.
    float bounceFacing = mix(0.22, 1.0, clamp(-n.y * 0.5 + 0.5, 0.0, 1.0));
    float bounce = uBounceIntensity * place * bounceFacing
                 * mix(uAmbientFloor, 1.0, ambientFall)
                 * (1.0 + lamp * uBounceLampGain);

    if(surf == 4){
      vec2 wuv=waterUv(pos.xz);
      float waterTime=uTime*(1.0-uWaterParams.w);
      float film=texture(uRD,wuv*1.8+vec2(waterTime*.006,-waterTime*.004)).g;
      float slow=sin((wuv.x*2.7+wuv.y*1.9+waterTime*.11)*6.28318)*.5+.5;
      float scum=waterEdge(pos.xz);
      vec3 deep=vec3(0.010,0.026,0.018);
      vec3 mold=vec3(0.045,0.092,0.050);
      vec3 skin=mix(deep,mold,clamp(film*.75+slow*.18+scum*.52,0.0,1.0));
      float fres=pow(1.0-clamp(dot(normalize(toEye),n),0.0,1.0),3.0);
      float glitter=pow(clamp(dot(reflect(normalize(-toEye),n),normalize(fwd+vec3(0.0,.15,0.0))),0.0,1.0),34.0);
      float murk=clamp(uWaterParams.z,0.0,1.0);
      col=skin*(uAmbientColor*ambient*.82+uTorchColor*lamp*.34)
        + uTorchColor*vec3(.36,.48,.42)*glitter*beam*(1.0-uWaterParams.w*.65)
        + uTorchColor*vec3(.09,.16,.13)*fres*(.22+lamp*.22)
        + vec3(.035,.070,.045)*scum*(.45+.35*film);
      col=mix(col,deep,murk*.34);
    } else {
      vec3 albedo;
      if(sourceVoidMaterial){
        albedo=vec3(1.0);
      }else if(sourceMaterial){
        vec3 ink=sourceSyntaxTint(hitMat);
        albedo=ink*(.06+1.18*smoothstep(.035,.46,sourceHeight));
      }else{
        gBoilGlow=0.0;
        gMark=vec4(0.0);gMarkBlend=0.0;
        albedo=materialBase(hitMat, surf, tint, biome, rdv);
        // The fallback is ALWAYS the base now. It used to be an either/or with
        // the generated tile, which is why arrival was a switch rather than a
        // fade: there was nothing underneath to arrive over.
        albedo=architecturalSurface(hitMat,surf,posM,n,albedo);
        if(pbrReady){
          albedo=mix(albedo,surfaceTile(pbrSlot,pbrUv,pbrTile),pbrBlend);
          gMarkBlend*=pbrBlend;
        }
      }
      // Roughness drives the highlight: a wet/polished tile (low roughness) throws
      // a tight bright spec; brick and wood stay matte. Tighten the lobe as it
      // smooths, so marble and ceramic actually glint under the torch.
      float gloss = (surfRough >= 0.0) ? (1.0 - surfRough) : 0.0;
      float specStr = (surfRough >= 0.0) ? (0.04 + 0.9 * gloss * gloss) : materialSpec(hitMat);
      float spec = specStr * pow(clamp(lambert, 0.0, 1.0), mix(6.0, 48.0, gloss)) * lamp;

      float emis = (surf == 2) ? 0.55 : (surf == 1 ? 0.30 : 0.12);
      vec3 incident = uAmbientColor*ambient*surfaceOcclusion + uBounceColor*bounce*surfaceOcclusion + uTorchColor*lamp + localLight + gBoilGlow;
      col = albedo * incident
          + uTorchColor * vec3(0.55, 0.60, 0.62) * spec
          + rim * tint * (0.22 + uAudio * 0.45) * emis
          + glow * emis
          - seam * 0.30 * (uAmbientColor*ambient + uTorchColor*lamp);
      // Measured against the light that arrived, not against the shaded pixel:
      // a red wall reflects red whatever lit it, and albedo must not be able to
      // buy the circuit's colour.
      col = reserveEmergencyRed(col, dot(emergencyLight, vec3(.2126,.7152,.0722))
        / max(dot(incident, vec3(.2126,.7152,.0722)), 1e-4));
      // Added AFTER the reservation and mostly outside albedo. Both are on
      // purpose: the reservation must judge the red the circuit actually
      // delivered rather than a pixel already whitened, and the apparition is not
      // light landing on a wall — it is the figure, standing where the wall is.
      // A third of the albedo is kept so it takes the surface's grain and does
      // not read as a sticker laid over the room.
      col += mix(vec3(1.0), albedo, .34) * (apparitionWhite + apparitionGlow);

      // THE GROUND UNDER OPEN SKY REFLECTS THE SKY.
      //
      // Everything above is a lamp model: a source somewhere in the room, an
      // occlusion term, a falloff. None of it describes standing outside, where
      // the source is the entire hemisphere and the yard is bright for the same
      // reason the cloud is. Routed through the zone ambient it kept arriving as
      // an attenuated point light and fifty metres of tarmac stayed black under
      // a white horizon.
      //
      // So: a hemispherical term, weighted by how much sky the surface faces —
      // full for the ground, half for a wall — and deliberately immune to
      // distance, because the sky does not get further away as you look further
      // out. Held under the horizon's own value so the ground never out-reads
      // the opening it is lit by.
      if(hitSky){
        float facingSky = 0.34 + 0.66 * clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
        col += albedo * vec3(0.092, 0.110, 0.150) * facingSky;

        // AND WHEN IT IS WET, IT REFLECTS IT PROPERLY.
        //
        // The hemispherical term above is the diffuse half, and on tarmac — five
        // per cent albedo, in the rain — the diffuse half is almost nothing.
        // What you actually see standing in a yard at night is the sky LYING ON
        // IT: the moon, the lit deck, the one sodium lamp on the column, all
        // smeared out by the water. That is a grazing specular reflection, not a
        // brighter floor, and no amount of raising the ambient was ever going to
        // produce it — the yard stayed a black band under a white horizon
        // through three passes of trying.
        //
        // This is why nightSky() is a function. The reflected ray gets the same
        // deck, the same moon and the same skyline the eye gets, so everything
        // authored up there arrives down here for nothing.
        vec3 vDir = normalize(pos - ro);
        vec3 refl = reflect(vDir, n);
        // Only the sky half of the hemisphere. A reflected ray pointing into the
        // ground has nothing to fetch — there is no second bounce here — so it is
        // folded back up and damped rather than sampling the city upside down.
        refl.y = abs(refl.y) * 0.85 + 0.02;
        float fres = pow(1.0 - clamp(dot(-vDir, n), 0.0, 1.0), 4.0);
        // Rain roughens it: a smear, not a mirror, breaking up where the water
        // is moving. Tarmac has been rained on all night; a wall has not.
        float impacts=(isRainGroundMat(hitMat)&&surf==2)
          ?rainImpactRings(posM.xz)*uOpticalEffects
          :0.0;
        float ripple = 0.72 + 0.28 * vnoise(posM.xz * 0.9 + vec2(0.0, uTime * 0.55), 1.0, 13.0)
                     + impacts*.26;
        float wetness = isRainGroundMat(hitMat) ? (surf == 2 ? 1.0 : 0.30) : 0.22;
        col += nightSky(refl) * (0.05 + 0.60 * fres) * wetness * ripple;
        // An impact only catches enough deck light to articulate the ring. It
        // never becomes a glowing decal, and reduced/off optical effects leave
        // the wet material and its static reflection intact.
        col += vec3(.20,.27,.38)*impacts*(.30+.70*fres);
      }
      // HUSH does not carry a lamp. Its playable room-read is a low, static
      // acoustic relief: boundaries and material seams gather density while
      // the architecture remains dark. This is tied to the explicit camera
      // sensory profile, so the story camera keeps its authored lighting.
      float acousticDistance=1.0-smoothstep(4.0,35.0,length(posM-uCam));
      float acousticGrazing=pow(1.0-abs(dot(n,normalize(toEye))),2.0);
      float acousticBand=.5+.5*sin(length(posM-uCam)*3.2+float(hitMat)*.71);
      float acousticRelief=uHushSense*(.34+seam*.92+rim*.28+acousticGrazing*.46+acousticBand*.06+abs(rdv-.5)*.14);
      col+=vec3(.045,.42,.285)*acousticRelief*(.60+.40*acousticDistance);
      col+=albedo*vec3(.09,.28,.20)*uHushSense*(.30+acousticGrazing*.32);
      if(waterActive() && surf == 1 && hitMat == MAT_WET){
        float caustic=(sin(posM.x*9.0+uTime*.9)+sin(posM.z*7.0-uTime*.7))*.5+.5;
        col+=vec3(.05,.08,.07)*caustic*lamp*.18*(1.0-uWaterParams.w*.75);
      }
    }
    col = col / (1.0 + col * 0.30);  // filmic-ish rolloff, tames the near field
    // The white sea is not a brightly lit material. It is the absence of a
    // scene, so it remains paper-white regardless of ambient, torch or tone map.
    // Mesh props composite later and can still resolve as the distant island.
    if(sourceVoidMaterial) col=vec3(1.0);

    // A handful of dust catches only the lit cone. Quantized movement keeps it
    // from reading as snowfall; reduced motion holds the same sparse field.
    float moteTime=mix(floor(uTime*.35),0.0,uReduceMotionOptical);
    vec2 moteCell=floor(gl_FragCoord.xy*.08);
    float moteHash=hash01(moteCell.x+moteTime*13.0,moteCell.y-moteTime*7.0);
    float mote=step(.9991,moteHash)*smoothstep(.22,.82,beam)*uOpticalEffects;
    col+=uTorchColor*mote*uLight*.045;

    // No exploration fog and no distance haze. Darkness now comes only from
    // actual lighting, occlusion and material response, so doorways and the far
    // side of an atrium remain readable before the player crosses them.
  }

  // Shared ground-plane ray for volumetric effects below. Keys and exits remain
  // real objects with map/edge guidance; they must not project world-space light
  // columns. At long range those unbounded columns read as a beacon punched
  // through the opening horizon, before the player has earned any destination.
  vec2 ro2 = ro.xz, rd2 = normalize(rd.xz + vec2(1e-5));
  float span = (tHit > 0.0 ? tHit : 110.0 / CELL_METERS) * length(rd.xz) / max(length(rd), 1e-4);
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

  // BELOW THE COPING. Apply the volume after mesh compositing so props and the
  // height field live in the same water. Red dies first, green-black survives,
  // and reduced motion holds both caustics and particulate perfectly still.
  if(uWaterCamera.x>.5){
    float murk=clamp(uWaterParams.z,0.0,1.0);
    float travel=max(0.0,zView);
    vec3 transmission=exp(-travel*mix(vec3(.17,.085,.13),vec3(.34,.14,.22),murk));
    vec3 deepWater=vec3(.006,.025,.017);
    float absorption=1.0-exp(-travel*(.055+murk*.075));
    col=col*transmission+deepWater*absorption*(.62+murk*.30);
    float heldTime=uTime*(1.0-uWaterParams.w);
    float caustic=(sin(gl_FragCoord.x*.095+heldTime*.72)+sin(gl_FragCoord.y*.071-heldTime*.53))*.5+.5;
    caustic*=smoothstep(.05,.65,abs(rd.y))*(1.0-smoothstep(7.0,28.0,travel));
    col+=vec3(.025,.072,.045)*caustic*.18;
    vec2 particleCell=floor(gl_FragCoord.xy/vec2(6.0,8.0));
    float particle=step(.9925,hash01(particleCell.x+floor(heldTime*.7)*3.0,particleCell.y-floor(heldTime*.5)*5.0));
    col+=vec3(.16,.20,.15)*particle*(.025+.035*murk);
  }

  // Exterior humidity is a shallow, low-contrast veil in the distance, not the
  // exploration fog deliberately excluded from the interior. It thickens at
  // grazing angles and leaves nearby doors, kerbs and props crisp.
  if(cameraInWeather){
    float mug=smoothstep(8.0,34.0,zView)*(1.0-smoothstep(.28,.72,abs(rd.y)));
    col=mix(col,vec3(.085,.108,.145),mug*.065);
  }

  // THE RAIN CROSSES THE WORLD.
  //
  // Compose after the prop pass so the van, fence, lamps and conservatory all
  // receive the same weather as the ray-marched architecture. Each sheet is
  // admitted only when its authored depth is in front of zView, so a nearby
  // wall occludes rain while a distant elevation has real air moving across it.
  // Keeping this before HUSH means the absence can still consume the weather.
  // The indoor drive stands in for the sky gate, so a space with no sky over it
  // can still be rained through when something has asked for it.
  float rainGain=uRainAmount*(cameraInWeather?1.0:clamp(uRainIndoor,0.0,1.0));
  if((cameraInWeather||uRainIndoor>.0)&&uOpticalEffects>.0&&rainGain>.0){
    float rain=rainVolume(ro,rd,zView)*rainGain;
    // A DROP HAS TO REACH SOLID, OR IT IS NOT A LINE.
    //
    // This used to add vec3(.30,.33,.40)*rain*backlight, which is right for a
    // continuous-tone renderer and useless downstream of a one-bit encode.
    // Measured in the yard: the raw pass shows the streaks plainly, and the
    // encoded frame shows NONE of them at any gain. The sky is already a ~50%
    // dense dither, and rain only lifted it from .147 to ~.26 luminance — which
    // the halftone renders as a slightly denser patch of the same field, never as
    // a stroke. Worse, the old backlight term scaled rain UP where the picture
    // was already bright and DOWN over the dark ground where a streak had room to
    // show, so it was loudest exactly where it could not be seen.
    //
    // So a drop is pushed clear of the white point instead of being added to what
    // is behind it. It survives the encode as a solid mark on whatever field it
    // crosses, which is the only way one bit can draw a line.
    col=mix(col,vec3(.78,.83,.90),clamp(rain,0.0,1.0)*.84);
    // A lit torch catches only the closest sheet, kept below the authored
    // weather colour so turning it on does not turn the yard into white noise.
    col+=uTorchColor*rain*uLight*.018;
  }

  // The HUSH is not a dark decal on the walls; it is a volume in which light
  // stops arriving. Apply the absence after the prop composite so furniture,
  // practical highlights and architecture all disappear into the
  // same shadow. Reduced/off effects hold the edge still but never relight it.
  if(uHush.z > 0.001){
    // Clip the volume to the closest composed surface. A HUSH behind a road
    // case may eat the case's rim light; one twenty metres behind it may not
    // paint a silhouette through the case just because the wall is farther.
    float surfaceSpan=min(span,(zView/max(.001,dot(rd,fwd)))*length(rd.xz)/CELL_METERS);
    float s = clamp(dot(uHush.xy - ro2, rd2), 0.0, surfaceSpan);
    vec2 nearest=ro2+rd2*s;
    float d = length(nearest-uHush.xy) * CELL_METERS;
    float radius=max(3.0,uHush.w);
    vec2 hushDelta=uHush.xy-nearest;
    vec2 pullDir=normalize(hushDelta+vec2(.0001));
    vec2 stillUv=fract(nearest*.05);
    vec2 movingUv=fract(nearest*.05+uTime*.01);
    float stillChurn=texture(uRD,stillUv).g;
    float movingChurn=texture(uRD,movingUv).g;
    float pulledChurn=texture(uRD,fract(movingUv+pullDir*.035)).g;
    float churn=mix(stillChurn,mix(movingChurn,pulledChurn,.42),uOpticalEffects);
    float edgeWarp=(churn-.5)*radius*.22;
    float body=1.0-smoothstep(radius*.40+edgeWarp,radius+edgeWarp,d);
    float core=1.0-smoothstep(radius*.05,radius*.34,d);
    float absorption=clamp((body*.78+core*.38)*uHush.z,0.0,.995);
    col*=1.0-absorption;
  }

  // The Scene Dock room disappears before the body card is composed.  Applying
  // this to the finished frame would erase the HUSH too, turning an authored
  // approach into an indiscriminate screen fade.
  col*=1.0-clamp(uDockHauntingFade,0.0,.995);

  // The same SDF compositor is used for both positions. uHush remains a single
  // gameplay field; the secondary card is only a visual contradiction.
  compositeHushBody(uHushBody,uHushBodyLook,ro,rd,fwd,col,zView);
  compositeHushBody(uHushBodySecondary,uHushBodyLookSecondary,ro,rd,fwd,col,zView);

  if(uWaterCamera.z>.5){
    float edge=smoothstep(.28,.76,length(uv));
    col=mix(col,col*vec3(.66,.82,.76),edge*.10);
    float damp=hash01(floor(gl_FragCoord.x/19.0),floor(gl_FragCoord.y/23.0));
    col*=1.0-step(.972,damp)*edge*.045;
  }

  col += (grain - 0.5) * 0.035;             // film grain
  // The expressive post pass owns the fear vignette. A second fixed vignette
  // here used to halve the corners before fear was even applied.

  // DEPTH RIDES IN THE ALPHA CHANNEL. The post pass reads .rgb and writes 1.0,
  // so nothing on screen can see this; the diffusion lens resolves it back out
  // (see r3dDepthInto). Stored as INVERSE depth — near is bright — because that
  // is the convention every SD depth ControlNet was trained on (MiDaS), and
  // handing a depth ControlNet a linear far-is-bright map inverts the room.
  o = vec4(clamp(col,0.0,1.0), 1.0 / (1.0 + zView * 0.14));
  // THE ENGRAVING LEAVES ON A SECOND TARGET. It cannot ride the first — RGB is
  // the image, alpha already carries depth — and it cannot be recovered later:
  // surface UV and slot exist only here, inside the march. The recorder must be
  // handed it in screen space or draw with a procedural hash instead.
  // Blend is applied to the SIGNED line field, before the bias — not to the
  // stored byte afterwards. Scaling the biased value is what the previous write
  // did, and it is wrong in a way that only shows up once anything reads these
  // channels: a half-blended fragment with no grain at all stores 0.25, which
  // decodes to -0.5, a confident grain out of nothing. Alpha now carries the
  // tangent plane, which is an identity rather than a quantity and must not be
  // scaled by anything.
  float markBlend = clamp(gMarkBlend,0.0,1.0);
  oMark = vec4(gMark.r*markBlend, gMark.gb*markBlend*0.5+0.5, gMarkPlane);
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
// stops seeing in colour), and pushes the chromatic split — the picture stops
// holding itself together. Recording grain is a separate acquisition layer:
// fine, luma-shaped, black-protected, and phase-held rather than animated snow.
// The grain of a recorded medium, shared by the two passes that need one: the
// VFD's post stack and the horizon's projector. It lived inside POST_FRAG,
// which is why the projection pass referencing it failed to compile in
// silence — a bad program leaves the previously bound one in place, so the
// horizon kept presenting through the plain copy and looked untouched.
const GRAIN_GLSL = `
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float grainClock(float time, float hz, float reduceMotion){
  return time * max(0.0, hz) * (1.0 - clamp(reduceMotion, 0.0, 1.0));
}
float phaseGrain(vec2 p, float phase){
  // Neighbouring pixels share taps, introducing the slight spatial correlation
  // of a recorded medium without softening the architectural image itself.
  vec2 q=p+vec2(phase*37.0,phase*73.0);
  float fine=h21(q);
  float correlated=(
    h21(q)+
    h21(q+vec2(1.0,0.0))+
    h21(q+vec2(0.0,1.0))+
    h21(q+vec2(1.0,1.0))
  )*.25;
  return mix(fine,correlated,.58);
}
float correlatedGrain(vec2 p, float clock, float temporalSmear){
  float phase=floor(clock);
  float phaseMix=smoothstep(0.0,1.0,fract(clock))*clamp(temporalSmear,0.0,1.0);
  return mix(phaseGrain(p,phase),phaseGrain(p,phase+1.0),phaseMix);
}
`;

const POST_FRAG = COMMON_GLSL + GRAIN_GLSL + `
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform float uFear;      // 0..1
uniform float uTimeP;
uniform float uGlassStrength;
uniform float uGlassFringe;
uniform float uGlassBloom;
uniform float uGlassGrain;
uniform float uRecordingPostGrain;
uniform float uRecordingLumaGrain;
uniform float uRecordingTemporalHz;
uniform float uRecordingTemporalSmear;
uniform float uReduceFlash;
uniform float uReduceMotion;
uniform float uSourceEmergency;
uniform float uSourceWhiteout;
uniform float uSourceTorchMode;
uniform float uSourceTorchPower;
uniform float uFrontEndAmount;
uniform float uFrontEndDetailRetention;
uniform float uFrontEndChromaRetention;
uniform float uFrontEndExposureStops;
uniform float uFrontEndShoulder;
uniform float uFrontEndToe;
out vec4 o;
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
  // Fine acquisition grain belongs to the signal, not a translucent overlay.
  // True black stays black; midtones carry most of the texture; highlights
  // retain their silhouettes instead of dissolving into white snow.
  float lumForGrain=dot(c,vec3(0.2126,0.7152,0.0722));
  float blackProtect=smoothstep(0.003,0.045,lumForGrain);
  float midtone=
    smoothstep(0.04,0.36,lumForGrain)*
    (1.0-smoothstep(0.76,1.0,lumForGrain));
  float flashSafe=mix(1.0,0.45,clamp(uReduceFlash,0.0,1.0));
  float grainMask=blackProtect*mix(1.0,midtone,clamp(uRecordingLumaGrain,0.0,1.0));
  // Hold the correlated field on one phase so it reads as recorded texture,
  // not a full-frame layer flashing independently of the room.
  float heldClock=7.35;
  float g=correlatedGrain(
    gl_FragCoord.xy,
    heldClock,
    uRecordingTemporalSmear
  )-0.5;
  float recordingAmp=
    clamp(uRecordingPostGrain,0.0,0.08)*
    flashSafe*
    grainMask*
    (1.0+f*0.55);
  // Glass grain remains a quiet instrument/eye texture. It can no longer
  // overwhelm the recorded medium or lift an unlit room.
  float eyeAmp=(0.003*uGlassGrain+f*0.012)*flashSafe*blackProtect;
  c+=g*(recordingAmp+eyeAmp);
  // The FOH aperture and its white sea take the exposure before the emergency
  // circuit arrives. Red is applied after this, so the delayed wash can truly
  // replace white rather than tinting a dark room underneath it.
  c=mix(c,vec3(1.0),clamp(uSourceWhiteout,0.0,1.0));
  // SOURCE'S FLASHLIGHT IS A SCREEN OPERATION. The physical cone already lit
  // the surfaces in the march, but Source's x-ray must invert the finished
  // picture (props included), and its red beam must remain visible in the white
  // sea, which is deliberately not a lit material. A crisp oval with a narrow
  // feather reads as the same handheld lens without turning into a vignette.
  vec2 sourceTorchUv=(uv-vec2(.5,.48))*vec2(uRes.x/uRes.y,1.0);
  float sourceTorchCone=1.0-smoothstep(.285,.365,length(sourceTorchUv));
  float sourceTorchRim=(1.0-smoothstep(.365,.405,length(sourceTorchUv)))-sourceTorchCone;
  float sourceTorchMask=clamp((sourceTorchCone+sourceTorchRim*.42)*uSourceTorchPower,0.0,1.0);
  if(uSourceTorchMode>.5&&uSourceTorchMode<1.5){
    c=mix(c,vec3(1.0)-c,sourceTorchMask*.94);
  }else if(uSourceTorchMode>1.5){
    vec3 torchRed=vec3(max(.88,c.r*1.12+.16),c.g*.018,c.b*.008);
    c=mix(c,torchRed,sourceTorchMask*.90);
  }
  // The Scene Dock side of Source still uses the ordinary VFD chain. Apply
  // the wash after fear, glass and acquisition grain so it cannot be erased by
  // the same post stack that previously swallowed the raw emergency light.
  float ePhase=mod(uTimeP,3.2);
  float ePulse=uReduceFlash>.5?.78:(ePhase<.18?1.0:ePhase<.42?.48:ePhase<.64?.92:ePhase<.92?.56:.46+.04*sin((ePhase-.92)*2.4));
  float eLuma=dot(c,vec3(.2126,.7152,.0722));
  float eMask=(.78+.22*(1.0-eLuma))*(.88+.12*smoothstep(.02,.92,uv.y));
  float eWash=clamp(uSourceEmergency*ePulse*eMask,0.0,.94);
  vec3 emergencyRed=vec3(max(.82,c.r*1.18+.18),c.g*.025,c.b*.012);
  c=mix(c,emergencyRed,eWash);

  // FRONT-END DENSITY PLATE. This is deliberately content-driven: no radial
  // vignette and no UI-position glow. At amount zero it is a strict identity.
  float fe=clamp(uFrontEndAmount,0.0,1.0);
  if(fe>0.0001){
    float centerLum=dot(c,vec3(.2126,.7152,.0722));
    vec2 texel=1.0/uRes;
    float neighborLum=(
      dot(texture(uSrc,uv+vec2(texel.x,0.0)).rgb,vec3(.2126,.7152,.0722))+
      dot(texture(uSrc,uv-vec2(texel.x,0.0)).rgb,vec3(.2126,.7152,.0722))+
      dot(texture(uSrc,uv+vec2(0.0,texel.y)).rgb,vec3(.2126,.7152,.0722))+
      dot(texture(uSrc,uv-vec2(0.0,texel.y)).rgb,vec3(.2126,.7152,.0722))
    )*.25;
    float low=mix(centerLum,neighborLum,.45);
    float detail=centerLum-low;
    float targetLum=low+detail*mix(1.0,clamp(uFrontEndDetailRetention,0.0,1.0),fe);
    c*=targetLum/max(centerLum,.0001);
    c*=exp2(uFrontEndExposureStops*fe);
    c=c/(vec3(1.0)+c*max(0.0,uFrontEndShoulder)*fe);
    float y=dot(c,vec3(.2126,.7152,.0722));
    float shadowZone=smoothstep(.015,.13,y)*(1.0-smoothstep(.13,.34,y));
    c+=vec3(shadowZone*max(0.0,uFrontEndToe)*fe);
    float y2=dot(c,vec3(.2126,.7152,.0722));
    vec3 grey=vec3(y2);
    float chroma=length(c-grey);
    float practicalProtect=smoothstep(.16,.42,chroma)*.18;
    float retention=clamp(mix(1.0,uFrontEndChromaRetention,fe)+practicalProtect*fe,0.0,1.0);
    c=mix(grey,c,retention);
  }
  o=vec4(c,1.0);
}`;

// Source Space is a deliberately separate proof: transparent glyph geometry
// over a clear void. It must not inherit the VFD cell mesh, halftone, glass,
// fear or material stack used by the physical building.
const TEXT_SPACE_FRAG = COMMON_GLSL + `
uniform sampler2D uText;
uniform sampler2D uHushBodyTex;
uniform vec2 uRes;
uniform float uSunrise;
uniform float uSourceChroma;
uniform float uPaper;
uniform float uTime;
uniform float uNightSeed;
uniform float uRain;
uniform float uLeaves;
uniform float uReducedMotion;
uniform float uSourceEmergency;
uniform float uSourceWhiteout;
uniform float uSourceTorchMode;
uniform float uSourceTorchPower;
uniform vec2 uView;
uniform vec2 uMoonCloud;
uniform vec4 uHushScreen;
uniform float uHushAmount;
out vec4 o;
float sourceHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
  vec2 uv=gl_FragCoord.xy/uRes;
  float shift=(1.0+2.4*uSourceChroma)/uRes.x;
  vec4 center=texture(uText,uv);
  vec4 left=texture(uText,uv-vec2(shift,0.0));
  vec4 right=texture(uText,uv+vec2(shift,0.0));
  float glyphAlpha=max(center.a,max(left.a,right.a));
  vec3 glyph=mix(center.rgb,vec3(right.r,center.g,left.b),uSourceChroma);
  vec3 voidColor=mix(vec3(.0015,.003,.004),vec3(.014,.020,.031),smoothstep(.08,.92,uv.y));
  float cloudPhase=uNightSeed*91.7+uTime*.006*(1.0-uReducedMotion);
  float cloudBand=sin(uv.x*9.0+cloudPhase)+sin(uv.x*17.0-uv.y*5.0+cloudPhase*.7);
  float clouds=smoothstep(1.0,1.68,cloudBand+sourceHash(floor(uv*vec2(24.0,9.0)))*.7)
    *smoothstep(.34,.62,uv.y)*.13;
  voidColor+=vec3(.055,.064,.083)*clouds*uMoonCloud.y;
  float moonBearing=.785398+(uNightSeed-.5)*.24;
  float moonDelta=atan(sin(moonBearing-uView.x),cos(moonBearing-uView.x));
  vec2 moonCenter=vec2(.5+moonDelta/2.2,.76+fract(uNightSeed*7.1)*.08-uView.y*.45);
  float moon=1.0-smoothstep(.029,.038,length((uv-moonCenter)*vec2(uRes.x/uRes.y,1.0)));
  voidColor=mix(voidColor,vec3(.72,.77,.80),moon*.86*uMoonCloud.x);
  vec3 darkScene=glyph+voidColor*(1.0-glyphAlpha);
  if(uRain>.001){
    vec2 rainUv=uv*vec2(94.0,38.0);
    rainUv.y+=uTime*38.0*(1.0-uReducedMotion);
    rainUv.x+=rainUv.y*.19;
    vec2 rainCell=floor(rainUv),rainLocal=fract(rainUv);
    float admitted=step(.82,sourceHash(rainCell+floor(uNightSeed*101.0)));
    float streak=(1.0-smoothstep(.025,.12,abs(rainLocal.x-.5)))*smoothstep(.0,.16,rainLocal.y)*(1.0-smoothstep(.58,1.0,rainLocal.y));
    darkScene=mix(darkScene,vec3(.34,.43,.54),streak*admitted*uRain*.34);
  }
  // LEAVES, IN A FIELD THAT HAS NO DEPTH.
  //
  // Source is a flat composited image, so leaves here cannot be objects the way
  // the yard's are — there is nothing for them to pass behind. Making them OF
  // the field rather than in front of it is the honest reading: this place is a
  // recording, and what blows through it belongs to the recording.
  //
  // Two drifting cell layers so they do not march in step, each cell holding at
  // most one leaf. The tumble is the trick: scaling the cell's x by |cos| of a
  // per-leaf clock makes the shape narrow to a line and open out again, which is
  // the only part of a leaf that reads at this size.
  if(uLeaves>.001){
    for(int layer=0;layer<2;layer++){
      float depth=layer==0?1.0:1.7;
      vec2 leafUv=uv*vec2(13.0,7.0)*depth;
      // Across the frame on the wind, sagging as they go, and parallaxed
      // against the head so the near layer slides over the far one.
      float drift=uTime*(0.22+float(layer)*0.15)*(1.0-uReducedMotion);
      leafUv.x+=drift-uView.x*(0.7+float(layer));
      leafUv.y+=sin(leafUv.x*0.7+drift*2.1)*0.20-uView.y*0.5;
      vec2 cell=floor(leafUv),local=fract(leafUv)-0.5;
      float pick=sourceHash(cell+floor(uNightSeed*67.0)+float(layer)*31.0);
      if(pick>0.90){
        float clock=uTime*(1.6+pick*3.4)*(1.0-uReducedMotion)+pick*19.0;
        // Edge-on it is a line; broadside it is a blade. Floored so it never
        // vanishes completely between turns.
        float face=max(0.16,abs(cos(clock)));
        float lean=sin(clock*0.6)*0.9;
        vec2 p=vec2(local.x*cos(lean)-local.y*sin(lean),local.x*sin(lean)+local.y*cos(lean));
        p.x/=face;
        float leaf=1.0-smoothstep(0.10,0.24,length(p*vec2(1.0,2.6)));
        // Warm and dry against a cold field, dimmer on the far layer.
        darkScene=mix(darkScene,vec3(.42,.32,.17),leaf*uLeaves*(layer==0?.62:.34));
      }
    }
  }
  if(uHushAmount>.001&&uHushScreen.z>.001&&uHushScreen.w>.001){
    vec2 bodyUv=(uv-uHushScreen.xy)/uHushScreen.zw+vec2(.5);
    float card=min(min(bodyUv.x,1.0-bodyUv.x),min(bodyUv.y,1.0-bodyUv.y));
    if(card>0.0){
      vec4 bodySample=texture(uHushBodyTex,bodyUv);
      float sdf=(bodySample.r-.5)*56.0;
      float aa=clamp(fwidth(sdf)*1.35,.7,2.6);
      float fade=smoothstep(.008,.055,card);
      float silhouette=max(smoothstep(.28,.72,bodySample.g),smoothstep(-aa,aa,sdf))*fade;
      float halo=exp(-max(0.0,-sdf)/5.4)*fade*(1.0-silhouette);
      darkScene=mix(darkScene,vec3(.0001,.0003,.0004),silhouette*uHushAmount*.98);
      darkScene+=vec3(.10,.18,.20)*halo*uHushAmount*.42;
    }
  }
  vec3 paper=vec3(.965,.925,.835);
  vec3 paperScene=mix(paper,vec3(.012,.010,.009),smoothstep(.02,.72,glyphAlpha));
  float lightMix=clamp(max(uSunrise,uPaper*.72),0.0,1.0);
  vec3 composed=mix(darkScene,paperScene,lightMix);
  composed=mix(composed,vec3(1.0),clamp(uSourceWhiteout,0.0,1.0));
  // Text Space bypasses the physical post pass, so it consumes the same Source
  // torch contract here. This also means toggling the real carried flashlight
  // remains visible after the renderer handoff instead of silently becoming an
  // always-on white prop light.
  vec2 sourceTorchUv=(uv-vec2(.5,.48))*vec2(uRes.x/uRes.y,1.0);
  float sourceTorchCone=1.0-smoothstep(.285,.365,length(sourceTorchUv));
  float sourceTorchRim=(1.0-smoothstep(.365,.405,length(sourceTorchUv)))-sourceTorchCone;
  float sourceTorchMask=clamp((sourceTorchCone+sourceTorchRim*.42)*uSourceTorchPower,0.0,1.0);
  if(uSourceTorchMode>.5&&uSourceTorchMode<1.5){
    composed=mix(composed,vec3(1.0)-composed,sourceTorchMask*.94);
  }else if(uSourceTorchMode>1.5){
    vec3 torchRed=vec3(max(.88,composed.r*1.12+.16),composed.g*.018,composed.b*.008);
    composed=mix(composed,torchRed,sourceTorchMask*.90);
  }
  // Text Space bypasses the ordinary pixel mesh. Preserve the emergency
  // circuit after paper, chroma and HUSH have resolved so downstream grading
  // cannot turn the only impossible colour back into grey.
  float ePhase=mod(uTime,3.2);
  float ePulse=uReducedMotion>.5?.78:(ePhase<.18?1.0:ePhase<.42?.48:ePhase<.64?.92:ePhase<.92?.56:.46+.04*sin((ePhase-.92)*2.4));
  float eLuma=dot(composed,vec3(.2126,.7152,.0722));
  float eMask=(.80+.20*(1.0-eLuma))*(.88+.12*smoothstep(.02,.92,uv.y));
  float eWash=clamp(uSourceEmergency*ePulse*eMask,0.0,.94);
  vec3 emergencyRed=vec3(max(.84,composed.r*1.18+.18),composed.g*.022,composed.b*.010);
  composed=mix(composed,emergencyRed,eWash);
  o=vec4(composed,1.0);
}`;

const COPY_FRAG = COMMON_GLSL + `
uniform sampler2D uSrc;
uniform vec2 uRes;
out vec4 o;
void main(){o=texture(uSrc,gl_FragCoord.xy/uRes);}`;

// THE HORIZON IS PROJECTED, NOT DISPLAYED.
//
// Everywhere else in the game the image reaches the screen through the VFD —
// halftone, palette, persistence, the whole instrument. The horizon is
// deliberately the one place that is in colour, and the halftone would take
// that straight back off it. But it was going out through a raw bilinear blit,
// which is not the same decision: it meant the one sequence in the game with no
// optical character at all, a flat texture copy of a float buffer.
//
// So it gets a pass of its own, and the vocabulary is FILM rather than
// electronics — because what the body is walking through is a projection of a
// recording, not a readout of a signal:
//
//   HALATION    bright fields bleed warm and wide into their surroundings, the
//               way emulsion blooms around a hot highlight. Not the vertical
//               aperture-grille halo POST_FRAG uses; that is a CRT artefact and
//               this is not a CRT.
//   GATE WEAVE  a sub-pixel drift and a hair of rotation on a slow irregular
//               clock. One cue, and the strongest one available: nothing reads
//               as "projected" faster than a frame that will not sit still.
//   EMULSION    density-dependent grain, heaviest in the midtones and protected
//               in the blacks, reusing correlatedGrain from GRAIN_GLSL rather
//               than inventing a second grain in the same renderer.
//   DITHER      ordered 4x4, because the tape is almost entirely large smooth
//               gradients and an 8-bit present bands them visibly. This is the
//               cheapest win in the pass.
//   BURN        the edges fall off the way a projected frame does, without the
//               hard circular vignette of a lens.
const PROJECTION_FRAG = COMMON_GLSL + GRAIN_GLSL + `
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform float uTime;
uniform float uHalation;   // warm bleed around bright fields
uniform float uWeave;      // gate instability
uniform float uGrain;      // emulsion density
uniform float uBurn;       // edge falloff
uniform float uCollapse;   // the tail of the tape, taking the picture with it
uniform float uEdge;       // how far out of the frame the body has wandered
uniform float uReduceMotion;
out vec4 o;

// Bayer 4x4, matching src/render/pixel-mesh/dither.js so the two agree.
float bayer4(vec2 p){
  int x=int(mod(p.x,4.0)), y=int(mod(p.y,4.0));
  int i=y*4+x;
  float m[16]=float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return m[i]/16.0;
}

void main(){
  vec2 texel = 1.0 / uRes;
  float still = 1.0 - clamp(uReduceMotion, 0.0, 1.0);

  // GATE WEAVE. Two incommensurate rates so it never finds a loop, plus a rare
  // larger jump — the frame catching in the gate rather than drifting in it.
  float t = uTime;
  float catchPhase = floor(t * 0.37);
  float caught = step(0.86, h21(vec2(catchPhase, 3.7))) * (1.0 - smoothstep(0.0, 0.22, fract(t * 0.37)));
  vec2 weave = vec2(
    sin(t * 1.7) * 0.6 + sin(t * 0.41) * 0.4,
    cos(t * 1.31) * 0.5 + sin(t * 0.27) * 0.5 + caught * 3.4
  ) * uWeave * still * texel;
  float roll = (sin(t * 0.23) * 0.6 + sin(t * 0.61) * 0.4) * uWeave * still * 0.0006;
  vec2 uv = gl_FragCoord.xy * texel + weave;
  vec2 centred = uv - 0.5;
  uv = 0.5 + mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * centred;

  vec3 c = texture(uSrc, uv).rgb;

  // HALATION. A wide cross of taps weighted by their own brightness, so only
  // hot areas bleed, and biased warm because that is what emulsion does.
  if (uHalation > 0.001) {
    vec3 bleed = vec3(0.0);
    float wsum = 0.0;
    for (int i = 1; i <= 4; i += 1) {
      float r = float(i) * 2.5;
      float w = 1.0 / (1.0 + r * 0.55);
      bleed += texture(uSrc, uv + vec2(r, 0.0) * texel).rgb * w;
      bleed += texture(uSrc, uv - vec2(r, 0.0) * texel).rgb * w;
      bleed += texture(uSrc, uv + vec2(0.0, r) * texel).rgb * w;
      bleed += texture(uSrc, uv - vec2(0.0, r) * texel).rgb * w;
      wsum += w * 4.0;
    }
    bleed /= max(0.0001, wsum);
    float hot = smoothstep(0.35, 0.95, dot(bleed, vec3(0.2126, 0.7152, 0.0722)));
    c += bleed * vec3(1.0, 0.78, 0.52) * hot * uHalation;
  }

  // EMULSION. Midtone-weighted and black-protected: grain in the shadows is
  // video noise, and this is not video.
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float density = smoothstep(0.02, 0.30, lum) * (1.0 - smoothstep(0.62, 1.0, lum));
  float g = correlatedGrain(gl_FragCoord.xy, t * 14.0 * still, 0.55) - 0.5;
  c += g * density * uGrain;

  // BURN. Soft, rectangular-ish falloff — a projected frame going off at the
  // edges, not a lens vignetting a circle.
  vec2 e = abs(centred) * 2.0;
  float burn = 1.0 - uBurn * (pow(max(e.x, 0.0), 3.2) * 0.55 + pow(max(e.y, 0.0), 2.6) * 0.75);
  c *= clamp(burn, 0.0, 1.0);

  // WANDERING OUT OF THE PICTURE. The burn closes in from the sides as the body
  // leaves the lit part of the frame — the projected image running out at its
  // own edge rather than the body meeting a wall, which is what is actually
  // happening out there.
  c *= 1.0 - clamp(uEdge, 0.0, 1.0) * 0.5 * smoothstep(0.15, 1.0, abs(centred.x) * 2.0);

  // The tail. The void behind already dims and the splats already fade; this is
  // the projector losing the lamp as well, so the collapse is one gesture.
  c *= 1.0 - clamp(uCollapse, 0.0, 1.0) * 0.55;

  // DITHER, last, against the 8-bit present. The tape is enormous smooth
  // gradients and without this they band.
  c += (bayer4(gl_FragCoord.xy) - 0.5) / 255.0;

  o = vec4(c, 1.0);
}`;

// ── GL plumbing ──────────────────────────────────────────────────────────────
let gl = null, canvas = null;
let progRD, progWater, progMarch, progPost, progDepth, progPixelMesh, progDatamosh, progSourceFault, progTextSpace, progCopy, progProjection;
// How frightened he is, 0..1. main.js owns the number; the post pass spends it.
let fearLevel = 0;
let nightSeed=0.37;
// THE NIGHT IS DECIDED ONCE PER RUN, NOT PER FRAME.
//
// Everything the sky varies — the moon's bearing, its altitude, its phase and
// whether this is the run where it comes in close — hangs off this. It must be
// stable for the length of a run or the moon walks across the sky between
// loads, and it must differ between runs or nobody ever sees the other nights.
// ── the storm ───────────────────────────────────────────────────────────────
// A lightning flash is not a white rectangle over the frame: it is the room
// briefly being lit, which in this renderer means moving the two dials that
// decide what "lit" means. Ambient intensity raises the actual incident light,
// so surfaces face-on to it brighten and the geometry keeps its shading; the
// halftone's white point comes DOWN at the same time, so the dither saturates
// and the frame goes to solid ink the way an over-exposed frame does.
//
// Driving only ambient gives a brighter dither and no drama; driving only the
// white point gives a flat white-out with no shape in it. Both together is a
// photograph.
//
// The caller decides how hard: full under open sky, a fraction of it indoors,
// where the flash should light the room through an aperture rather than blow
// the frame (see main.js stormFlashStrength).
let stormFlash=0;
export function r3dSetStormFlash(v=0){stormFlash=Math.max(0,Math.min(1,Number(v)||0));return stormFlash;}
export function r3dStormFlash(){return stormFlash;}

export function r3dSetNightSeed(v=0.37){nightSeed=Number.isFinite(+v)?((+v%1)+1)%1:0.37;return nightSeed;}
export function r3dNightSeed(){return nightSeed;}
export function r3dSetFear(v) { fearLevel = Math.max(0, Math.min(1, v || 0)); }

export function r3dSetLocalLights(lights=[]){
  P3.setPracticalLightFrame(lights);
  localLightPositions.fill(0);localLightColors.fill(0);localLightBaseIntensity.fill(0);localLightMunicipal.fill(0);localLightPenetrations.fill(0);localLightEmergency.fill(0);
  localShadowIndex=-1;localShadowLight=null;
  localLightCount=Math.min(MAX_LOCAL_LIGHTS,Array.isArray(lights)?lights.length:0);
  for(let i=0;i<localLightCount;i++){
    const light=lights[i]||{},p=i*4,color=light.color||[1,.78,.52];
    localLightPositions[p]=Number(light.x)||0;localLightPositions[p+1]=Number(light.y)||0;localLightPositions[p+2]=Number(light.z)||0;localLightPositions[p+3]=Math.max(.01,Number(light.radius)||4);
    localLightColors[p]=Number(color[0])||0;localLightColors[p+1]=Number(color[1])||0;localLightColors[p+2]=Number(color[2])||0;
    localLightBaseIntensity[i]=Math.max(0,Number(light.intensity)||0);
    const lightId=String(light.id||'');
    localLightMunicipal[i]=lightId.includes('sodium')||/^district-.*-lamp-/.test(lightId)?1:0;
    localLightColors[p+3]=localLightBaseIntensity[i]*(localLightMunicipal[i]>.5?municipalLightPower:1);
    localLightPenetrations[i]=Math.max(0,Math.min(1,Number(light.penetration)||0));
    // Authored kind, never inferred from the colour: a warm lamp and the
    // emergency circuit are both red-dominant and only the rig knows which.
    localLightEmergency[i]=light.kind===LIGHT_KIND.EMERGENCY?1:0;
    if(localShadowIndex<0&&light.castsShadow){
      localShadowIndex=i;
      localShadowLight={x:localLightPositions[p],y:localLightPositions[p+1],z:localLightPositions[p+2],shadowYaw:Number.isFinite(light.shadowYaw)?light.shadowYaw:0,shadowPitch:Number.isFinite(light.shadowPitch)?light.shadowPitch:0};
    }
  }
  return localLightCount;
}

// WHAT THE RENDERER IS ACTUALLY HOLDING, not what the caller believes it sent.
// Every Source lighting bug this session has been a disagreement between those
// two, and there was no way to read the second one.
export function r3dLightingDebug(){
  const lights=[];
  for(let i=0;i<localLightCount;i++){
    const p=i*4;
    lights.push({
      x:localLightPositions[p],y:localLightPositions[p+1],z:localLightPositions[p+2],
      radius:localLightPositions[p+3],
      color:[localLightColors[p],localLightColors[p+1],localLightColors[p+2]],
      intensity:localLightColors[p+3],
      emergency:localLightEmergency[i],
    });
  }
  return {
    localLightCount,
    ambientColor:[...lightingAmbientColor],
    ambientIntensity:lightingAmbientIntensity,
    whitePointScale:whitePointScaleOverride??lightingWhitePointScale,
    sourceEmergency:sourceEmergencyStrength,
    lights,
  };
}

export function r3dSetMunicipalLightPower(value=1){
  const next=Number(value);
  municipalLightPower=Number.isFinite(next)?Math.max(0,Math.min(1,next)):1;
  for(let i=0;i<localLightCount;i++){
    localLightColors[i*4+3]=localLightBaseIntensity[i]*(localLightMunicipal[i]>.5?municipalLightPower:1);
  }
  return municipalLightPower;
}
export function r3dMunicipalLightPower(){return municipalLightPower;}
export function r3dSetLightingContext(context={}){
  const color=Array.isArray(context.ambientColor)?context.ambientColor:[.64,.65,.62];
  lightingAmbientColor=new Float32Array([
    Math.max(0,Number(color[0])||0),Math.max(0,Number(color[1])||0),Math.max(0,Number(color[2])||0),
  ]);
  // The ceiling used to be .12, which is generous for a room and silently ate
  // anything authored for the outdoors — the loading bay asked for .155 and got
  // .12 without a word, so raising the number in conservatory-lights.js did
  // nothing at all. Rooms in this building run .014-.043; the bay is the sky.
  lightingAmbientIntensity=Math.max(.006,Math.min(.45,Number(context.ambientIntensity)||.022));
  // The room's own ceiling for the halftone (see zoneWhitePointScale). Absent or
  // nonsense leaves the look profile's authored white point alone, so a space
  // that never sets one behaves exactly as it did before this existed.
  const scale=Number(context.whitePointScale);
  lightingWhitePointScale=Number.isFinite(scale)&&scale>0?Math.max(.05,Math.min(4,scale)):1;
  lightingScreenId=isScreen(context.screen)?context.screen:null;
  const bounceColor=Array.isArray(context.bounce?.color)?context.bounce.color:color;
  lightingBounceColor=new Float32Array([
    Math.max(0,Number(bounceColor[0])||0),Math.max(0,Number(bounceColor[1])||0),Math.max(0,Number(bounceColor[2])||0),
  ]);
  const bounce=Number(context.bounce?.intensity);
  lightingBounceIntensity=Number.isFinite(bounce)?Math.max(0,Math.min(.6,bounce)):0;
  return{ambientColor:[...lightingAmbientColor],ambientIntensity:lightingAmbientIntensity,
    whitePointScale:lightingWhitePointScale,screen:lightingScreenId,
    bounceIntensity:lightingBounceIntensity};
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
    recording: blendLayer(lookFrom.recording, lookTarget.recording, t),
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
    bypassedByTextSpace: textSpaceActive,
  };
}
let rdTexA, rdTexB, rdFboA, rdFboB, rdFlip = false, rdWarm = 0;
let waterTexA, waterTexB, waterFboA, waterFboB, waterFlip = false, waterWasActive = false;
let sceneTex, sceneFbo, fogTexture, surfaceTexture=null;
// Screen-space engraving, written beside the scene by the march (see oMark).
let markTex=null;
let meshTexA=null, meshTexB=null, meshFboA=null, meshFboB=null, meshFlip=false;
let datamoshSourceTex=null,datamoshSourceFbo=null,datamoshTexA=null,datamoshTexB=null,datamoshFboA=null,datamoshFboB=null,datamoshFlip=false;
let datamoshActive=false,datamoshProgress=0,datamoshReducedMotion=false,lastPostSourceFbo=null;
let sourceFaultTexA=null,sourceFaultTexB=null,sourceFaultFboA=null,sourceFaultFboB=null,sourceFaultFlip=false,sourceFaultWarm=false;
let sourceFaultState={active:false,nvme:0,ps2:0,transition:0,seed:0,slot:0,overflow:0,overflowHead:0,overflowLane:0,overflowDirection:1,overflowRun:0,reduceMotion:false,flashMode:'full'};
let surfAlbedoTex=null, surfNormalTex=null, surfMaterialTex=null, surfDreamTex=null, surfDreamStageTex=null, anisoExt=null, anisoMax=1;
// The engraving, derived from each generated tile as it arrives (see
// render/mark-field.js). It is a strict parallel of the dream arrays — same
// layer layout, same staging, same swap points — and it is deliberately managed
// INSIDE the dream lifecycle functions rather than through an API of its own,
// because a caller who could update one without the other would desync the
// engraving from the material it was derived from.
let surfMarkTex=null;
let markDeriveMs=0, markDeriveCount=0, markLastMs=0;
// Derivation is amortised across frames, and that is not an optimisation.
// Measured: the tensor costs ~6ms and tiles arrive in BURSTS — a bank streams
// ten slots and several land in one frame, which took the worst frame from a
// baseline 9.3ms to 49.2ms. Anything over 33ms disables the lens for the
// session, so a burst of arrivals would have switched the whole layer off.
//
// Only the pixel capture has to happen at arrival, because the caller closes
// the ImageBitmap the moment applySurface returns (see diffusion.js). The
// tensor can lag freely: the staging texture is not sampled until commit.
const markQueue=[];
let markEpoch=0;
const MARK_FRAME_BUDGET_MS=8;
const SURFACE_LAYERS=10,SURFACE_TILE=512;
// Which slots actually have an engraving yet, counted per slot across its
// frames. A slot that is not ready is drawn by the procedural hash — which is
// precisely the behaviour that shipped before this existed, so a queue that has
// not caught up degrades to the old look rather than to wrong data.
//
// This is what makes the flush unnecessary. Deriving every pending tile at the
// commit that makes a bank visible just moved the burst: ten tiles in the one
// frame took the worst frame to 56ms. Now a bank can become visible with its
// engraving still arriving, slot by slot, over the following few frames.
let markLiveBase=0;               // which half the shader reads as live
const markReady=new Uint8Array(SURFACE_LAYERS);
const markStageReady=new Uint8Array(SURFACE_LAYERS);
let hushBodyTex=null,hushBodyReady=false,hushBodyLoadError=null;
let hushBodyMode='live';
const BLUE_NOISE_SIZE=64;
let blueNoiseTex=null;
// A mid-grey 1x1 stands in until the mask decodes. Without it the first frames
// would threshold against an undefined sampler, which on some drivers is black —
// i.e. everything on, a white screen, at exactly the moment the player boots.
function ensureBlueNoise(gl){
  if(blueNoiseTex) return blueNoiseTex;
  blueNoiseTex=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,blueNoiseTex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,1,1,0,gl.RED,gl.UNSIGNED_BYTE,new Uint8Array([128]));
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
  const img=new Image();
  img.onload=()=>{
    gl.bindTexture(gl.TEXTURE_2D,blueNoiseTex);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,gl.RED,gl.UNSIGNED_BYTE,img);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
  };
  img.src=assetUrl('assets/blue-noise-64.png').href||String(assetUrl('assets/blue-noise-64.png'));
  return blueNoiseTex;
}

let hushBodyManifestation=0;
let hushBodySecondaryManifestation=0;
// HOW FAR THE GENERATED MATERIAL HAS ARRIVED, 0..1.
//
// This used to be the boolean `surfAlbedoTex && surfNormalTex && surfMaterialTex`
// written straight into uSurfacesReady, which meant that on the frame the third
// bank texture appeared EVERY surface in the building changed shading model at
// once — albedo, normal map, roughness and occlusion together. That is the snap
// between an unlit room and a lit one that has nothing to do with the torch.
//
// Same exponential approach the hush body uses below, for the same reason: the
// thing should arrive rather than appear.
let surfacesManifestation=0;
let hushBodyLast={x:0,y:0,strength:.9,heightM:1.83,widthM:.58,glow:null,mode:null};
let hushBodySecondaryLast={x:0,y:0,strength:.9,heightM:1.83,widthM:.58,glow:null,mode:null};
const HUSH_BODY_ASSET='assets/hush/hush-body-sdf.png';
const HUSH_BODY_ASSET_REV='8f52397c';
export const HUSH_BODY_MODES=Object.freeze(['live','core','glow','off']);

export function r3dSetHushBodyMode(mode='live'){
  hushBodyMode=HUSH_BODY_MODES.includes(mode)?mode:'live';
  return hushBodyMode;
}

export function r3dHushBodyStatus(){
  return{
    ready:hushBodyReady,
    mode:hushBodyMode,
    manifestation:hushBodyManifestation,
    secondaryManifestation:hushBodySecondaryManifestation,
    asset:HUSH_BODY_ASSET,
    revision:HUSH_BODY_ASSET_REV,
    error:hushBodyLoadError,
  };
}
// Five temporal frames of ten 512² surfaces, live plus staged, is the ceiling
// the texture budget allows. WebGL2 guarantees 256 array layers, so the limit
// here is memory, not the API.
const MAX_DREAM_FRAMES=5;
const MARK_HALF_LAYERS=SURFACE_LAYERS*MAX_DREAM_FRAMES;
// How hard the material's own density pulls the recorder's threshold. This is
// the first number in the engraving that is taste rather than measurement, so
// it is tunable live from the probe rather than authored into look-profiles
// before anybody has looked at it on a wall.
let markDensityGain=0.55;
// How hard the stipple follows the grain direction. 0 restores the isotropic
// hash, which is the A/B for phase 3b.
let markGrainGain=0.70;
const markReadyScratch=new Float32Array(SURFACE_LAYERS);
// A slot counts as engraved only once every frame of its boil is derived, so a
// crossfade never blends a derived frame against an empty one. Anything short
// of that reads as 0 and the recorder draws that slot with its procedural hash.
//
// AND IT ARRIVES OVER A THIRD OF A SECOND, NOT IN ONE FRAME.
//
// This returned a hard 0-or-1, so the instant a slot finished engraving its mark
// snapped in whole. Downstream that moves two things at once: markDensity jumps
// off the 0.22 sentinel and formStipple shifts the global threshold with it, and
// markGrain jumps from "no grain" to a real direction so screenDir rotates the
// screen pattern. Which is exactly the reported fault — every couple of seconds
// the dither snapped to a different density, or held its density and moved.
// Slots finish one at a time, and the live/staged bank swap does the whole field
// at once, which is the couple-of-seconds cadence.
//
// A ramp is safe here only because the surface pass decodes gb to SIGNED before
// it multiplies by this (see the note beside markA.gb in the shader): scaling a
// signed grain toward zero fades its coherence and preserves its direction. On
// the raw 0..1 encoding the same multiply would decode to a confident grain at
// 225 degrees, which is the trap that comment is about.
//
// Readiness itself stays all-or-nothing — a slot is engraved or it is not, and a
// partial boil must never be blended against an empty frame. Only its ARRIVAL is
// smoothed, from the moment it first reports complete.
const MARK_FADE_MS=340;
const markFadeStartLive=new Float32Array(SURFACE_LAYERS).fill(-1);
const markFadeStartStage=new Float32Array(SURFACE_LAYERS).fill(-1);
function markReadyUniform(counts,frames,started,now=performance.now()){
  const k=Math.max(1,Math.min(MAX_DREAM_FRAMES,frames||1));
  for(let i=0;i<SURFACE_LAYERS;i++){
    if(counts[i]<k){ started[i]=-1; markReadyScratch[i]=0; continue; }
    if(started[i]<0) started[i]=now;
    markReadyScratch[i]=Math.min(1,(now-started[i])/MARK_FADE_MS);
  }
  return markReadyScratch;
}
let surfDreamFrames=1,surfDreamStageFrames=1,dreamAgitation=0;
const surfDreamMix=new Float32Array(SURFACE_LAYERS);
let localDiffusionAvailability = 1;
let surfDreamReady=false,surfDreamNextReady=false,surfDreamTransitionStart=0,surfDreamTransitionMs=0;
let surfDreamActiveBank=null,surfDreamPendingBank=null;
let pixelMeshSettings = normalizePixelMeshSettings();
let lastPixelMeshAt = 0;
let vfdMovement = 0;
let vfdPreviousX = null, vfdPreviousZ = null;
let textSpaceActive = false;
let sourceLook = { sunrise: 0, chroma: 1, paper: 0 };
let sourceEmergencyStrength = 0;
let sourceWhiteoutStrength = 0;

// THE HORIZON. Set by main.js from the runtime's horizonFrame(); the renderer
// never works out where on the tape the body is, it is told.
let horizonState = {
  active: false, slice: 0, lateral: 0, edge: 0, collapse: 0, exposure: 1,
  // The walkable corridor, at the body and a hundred-odd metres on. The floor
  // draws it (see drawHorizon); without it there is nothing out here telling
  // anybody which way the recording goes.
  band: null, bandAhead: null, bandLookahead: 110,
};
let horizonReadyState = false;

export function r3dSetHorizon(frame = null) {
  if (!frame?.active) { horizonState = { ...horizonState, active: false }; return false; }
  horizonState = {
    active: true,
    slice: Number(frame.slice || 0) + Math.max(0, Math.min(1, Number(frame.sliceFraction) || 0)),
    // Where across the corridor he is standing, in the tape's own metres. The
    // pass needs this for the same reason it needs the slice: the tape is not
    // in world space and the renderer is told, never works it out.
    //
    // THE CORRIDOR IS MAPPED ONTO THE PICTURE, NOT CONVERTED INTO IT.
    //
    // The two spaces do not share a scale, and it took getting this wrong twice
    // to see why. On the Z axis one runtime CELL is one tape unit — forced by
    // the slice mapping, since 512 cells and 512 tape units are both 256 slices
    // — so treating lateral as metres and halving it was wrong, and it put the
    // bust eighty-four units from the camera that was supposed to be beside him.
    //
    // But passing it straight through is wrong too: the walkable corridor is
    // +-96 and the picture only +-64, so the body could walk clean off the side
    // of the frame. The corridor is therefore SCALED onto the picture — walk to
    // the edge of what you are allowed and you are at the edge of the image.
    lateral: (Number(frame.lateral) || 0) * HORIZON_LATERAL_SCALE,
    // How far outside the picture the body has strayed. The projector loses the
    // frame at the edges rather than the world ending at a line.
    edge: Math.max(0, Math.min(1, Number(frame.edge) || 0)),
    collapse: Math.max(0, Math.min(1, Number(frame.collapse) || 0)),
    exposure: Math.max(0, Math.min(2, Number(frame.exposure ?? 1))),
    // The corridor comes across in CELLS and goes onto the floor in the tape's
    // own units, through the same mapping the body's own lateral takes. Two
    // spaces, one scale, applied in one place.
    band: horizonBandInTape(frame.band),
    bandAhead: horizonBandInTape(frame.bandAhead || frame.band),
    bandLookahead: Math.max(1, Number(frame.bandLookahead) || 110),
  };
  return true;
}

function horizonBandInTape(band) {
  if (!band) return null;
  return {
    centre: (Number(band.centre) || 0) * HORIZON_LATERAL_SCALE,
    reach: Math.max(2, (Number(band.reach) || 24) * HORIZON_LATERAL_SCALE),
    // THE OTHER TWO CHANNELS OF THE BAND, WHICH USED TO DIE HERE.
    // horizonBand() has always measured the recording's own brightness and its
    // macroblock damage off the bake and returned them every frame. This
    // function copied the two geometric channels and dropped the two expressive
    // ones on the floor, so the tape rendered at one flat exposure with one
    // flat crawl from the first metre to the last. They are what gives the
    // crossing its three acts.
    lum: Math.max(0, Math.min(1, Number(band.lum ?? 0.5))),
    mosh: Math.max(0, Math.min(1, Number(band.mosh ?? 0))),
  };
}

export async function r3dLoadHorizon() {
  if (horizonReadyState) return true;
  try {
    HZ.horizonInit(gl);
    await HZ.horizonLoad({
      bin: assetUrl('assets/horizon-tape.bin'),
      json: assetUrl('assets/horizon-tape.json'),
      bust: assetUrl('assets/horizon-bust.glb'),
    });
    horizonReadyState = HZ.horizonReady();
    // He stands beside the walk, at the depth the runtime puts him. Built here
    // because the tape's own scales and floor are only known once the manifest
    // has landed.
    if (horizonReadyState) HZ.horizonSetBust({ ...horizonBust, centreY: horizonBustCentre(horizonBust.height) });
  } catch (error) {
    // The tape is a built asset. A run that has not baked it should still be
    // playable — the horizon goes dark rather than taking the renderer down.
    console.warn('horizon tape unavailable:', error?.message || error);
    horizonReadyState = false;
  }
  return horizonReadyState;
}

export function r3dHorizonReady() { return horizonReadyState; }

// What the horizon pass is actually being told, for the probe. The tape is
// authored in its OWN space (see horizon-tape.json: floor, sliceMetres, span)
// and the camera is fed from the world, so being able to read both at once is
// the difference between diagnosing this and guessing at it.
let horizonSuppress = false;
export function r3dHorizonSuppress(v) { horizonSuppress = !!v; return horizonSuppress; }

export function r3dHorizonDebug() {
  const m = HZ.horizonManifest?.() || null;
  return {
    ...horizonState,
    ready: horizonReadyState,
    stats: { ...HZ.horizonStats }, suppressed: horizonSuppress,
    bust: { ...horizonBust, present: HZ.horizonBustPresent?.() || false, eyeY: horizonEyeHeight(), groundY: horizonGroundHeight() },
    tape: m ? { slices: m.slices, floor: m.floor, sliceMetres: m.sliceMetres, span: m.span } : null,
    cam: { camX, camY, camZ, CELL, worldX: camX * CELL, worldY: camY * CELL, worldZ: camZ * CELL,
           yaw, planYaw, pitch },
  };
}

// The void the tape hangs in. Not black: the recording's own tail collapses
// through magenta into a very dark plum, and the ground it stands on should
// already be that colour before he gets there.
const HORIZON_VOID = [0.035, 0.008, 0.042];
// Where the eye sits up the frame, as a fraction of its height. Slightly under
// half: dead centre reads as a screen, and a little low keeps some of the sense
// that the recording is taller than you are without burying you under it.
// IT USED TO BE 0.44, AND THAT IS WHY THERE WAS NO FLOOR.
//
// The picture is forty metres tall and hangs with its bottom edge on the tier
// floor, so putting the eye 44% up it stood the body seventeen and a half metres
// in the air. Nothing was drawn down there — there was nothing to draw — and the
// result reads exactly as reported: a video at full height with no ground under
// it and no sense of scale anywhere in the frame.
//
// Low enough that the tape's bottom edge is under the feet rather than under a
// ledge, high enough that the recording still towers. The floor is drawn at the
// feet (drawHorizon) and the tape below it is cut, so the picture rises out of
// the ground instead of hanging in front of it.
const HORIZON_EYE_AT = 0.115;
// Live tuning surface for the horizon's feel, so the values can be found by
// looking rather than by rebuilding. See __probe.horizonTune().
const horizonTune = {
  // NEARFADE IS THE AURORA DIAL. Every slice inside this distance is drawn
  // translucent, so a pixel is the sum of that many veils rather than one splat
  // on a wall — which is the difference between walking through hanging light
  // and walking between two painted surfaces. Nine gave a dozen; the crossing
  // wants curtains it can see through, so it gets twice that.
  //
  // `reach` is how far down the tube is drawn, and it is what the far end is
  // made of: more slices converging is more wormhole. It costs draws, so it is
  // raised rather than opened.
  nearFade: 18, reach: 56, eyeAt: HORIZON_EYE_AT,
  // How much taller the flat fields are drawn than they were measured, how far
  // they drift, and how opaque they are allowed to get. See uCurtain, uShimmer
  // and uVeil in horizon3d.js. Veil under 1 is the whole aurora idea: the
  // picture arrives by a dozen translucent depths summing rather than by the
  // nearest slice covering everything behind it.
  curtain: 2.1, shimmer: 0.85, veil: 0.9,
  // How much of the tape the corridor takes out of its own volume, and how tall
  // that corridor is. See the bore note in horizon3d.js.
  //
  // 0.96 EMPTIED THE CORRIDOR IT WAS SUPPOSED TO CLEAR. At that amount every
  // splat inside the tube is multiplied to 4%, so the run down the middle ended
  // in a black point and the far end — "the whole point of the crossing and the
  // one thing you could not see" — was still the one thing you could not see,
  // because the carve had deleted it. Thinned rather than emptied, the picture
  // stays visible down the length of the corridor and the crossing has
  // somewhere to be going.
  bore: 0.72, boreHeight: 34,
};
// The projection's own look. Not a `glass` block and not a `vfd` block: those
// describe an instrument, and this describes a lamp and a strip of film.
const HORIZON_PROJECTION = { halation: 0.34, weave: 0.9, grain: 0.055, burn: 0.30 };
// Where the bust stands, in TAPE metres. Mirrors HORIZON_BUST_DEPTH / _LATERAL
// in source-space-runtime.js, converted from cells; r3dSetHorizonBust lets the
// runtime correct it rather than leaving two constants to drift.
// Picture half-width over corridor half-width: 64 / 96.
const HORIZON_LATERAL_SCALE = 64 / 96;
let horizonBust = { x: -26 * HORIZON_LATERAL_SCALE, depth: 168, height: 13, eyes: false, eyeMode: 'untouched' };
// The height the view is centred on, in tape units — where the bust has to live
// if he is to be looked at rather than looked over.
function horizonEyeHeight() {
  const tape = HZ.horizonManifest();
  return (Number(tape?.floor) || 0) + (Number(tape?.span?.y) || 40) * horizonTune.eyeAt;
}

// Where the floor is, in tape units — the standing eye less a standing body.
// The ground is drawn here and the tape is cut here, so they are the same
// number by construction rather than by two people remembering.
function horizonGroundHeight() {
  return horizonEyeHeight() - EYE_METERS;
}

// HE STANDS ON IT, RATHER THAN BEING CENTRED ON THE EYE.
//
// horizonSetBust centres the figure on whatever it is handed, and it used to be
// handed the eye height — which was fine while the eye sat halfway up a picture
// hanging in a void and nothing had a floor. Now there is a floor, and a
// thirteen-metre head centred on a 1.62m eye is a head buried to the brow.
function horizonBustCentre(height) {
  return horizonGroundHeight() + (Number(height) || 13) * 0.5;
}

export function r3dSetHorizonBust({ lateral = null, depth = null, height = null, eyes = null, eyeMode = null } = {}) {
  horizonBust = {
    ...horizonBust,
    ...(lateral == null ? {} : { x: lateral * HORIZON_LATERAL_SCALE }),
    ...(depth == null ? {} : { depth }),
    ...(height == null ? {} : { height }),
    ...(eyes == null ? {} : { eyes: !!eyes }),
    ...(eyeMode == null ? {} : { eyeMode: String(eyeMode) }),
  };
  if (horizonReadyState) HZ.horizonSetBust({ ...horizonBust, centreY: horizonBustCentre(horizonBust.height) });
  return { ...horizonBust };
}
export function r3dHorizonProjection(next = {}) { Object.assign(HORIZON_PROJECTION, next); return { ...HORIZON_PROJECTION }; }

function presentProjection(texture, now) {
  gl.useProgram(progProjection);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  const u = (name) => gl.getUniformLocation(progProjection, name);
  gl.uniform1i(u('uSrc'), 0);
  gl.uniform2f(u('uRes'), canvas.width, canvas.height);
  gl.uniform1f(u('uTime'), now);
  gl.uniform1f(u('uHalation'), HORIZON_PROJECTION.halation);
  gl.uniform1f(u('uWeave'), HORIZON_PROJECTION.weave);
  gl.uniform1f(u('uGrain'), HORIZON_PROJECTION.grain);
  gl.uniform1f(u('uBurn'), HORIZON_PROJECTION.burn);
  // The edge reads as the same failure as the tail, because it is the same
  // failure: the recording running out. One rides depth, one rides sideways.
  gl.uniform1f(u('uCollapse'), Math.max(horizonState.collapse, horizonState.edge * 0.72));
  gl.uniform1f(u('uEdge'), horizonState.edge);
  gl.uniform1f(u('uReduceMotion'), pixelMeshSettings.reduceMotion ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
export function r3dHorizonTune(next = {}) { Object.assign(horizonTune, next); return { ...horizonTune }; }

function drawHorizon(now) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
  gl.viewport(0, 0, uniforms.sceneW, uniforms.sceneH);
  // THE ENGRAVING TARGET IS NOT WANTED OUT HERE.
  //
  // sceneFbo is MRT — colour plus the mark/engraving buffer the march writes so
  // downstream passes can recover a surface. Nothing past the perimeter is made
  // of the building, so there is no surface to recover, and leaving both draw
  // buffers live meant ~29k blended instances paid for a second write nobody
  // reads. The shader still declares both outputs (it must, or the draws are
  // rejected outright); this stops the second one costing bandwidth.
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]);
  const dim = 1 - horizonState.collapse * 0.85;
  gl.clearColor(HORIZON_VOID[0] * dim, HORIZON_VOID[1] * dim, HORIZON_VOID[2] * dim, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  if (horizonReadyState && !horizonSuppress) {
    // THE TAPE IS NOT IN WORLD SPACE.
    //
    // It is baked in its own metres: x across the corridor about zero, z running
    // 0 to -512 back from the head of the tape, and y up from the tier floor
    // (build-horizon-tape.mjs, FLOOR = SOURCE_TIER_BY_ID.horizon.height — which
    // is why the height, alone of the three, IS the world's).
    //
    // This passed the world camera straight in. Measured at the head of the
    // tape, that put the eye at z = -298.75 while the slice it was meant to be
    // standing on sat at z = -6, so the entire recording was 293 metres behind a
    // far plane of 120 and not one splat was ever inside the frustum. The
    // horizon has never drawn; what everyone saw was the void clear behind it.
    const tape = HZ.horizonManifest();
    const sliceMetres = Number(tape?.sliceMetres) || 2;
    // STAND IN THE PICTURE, NOT UNDERNEATH IT.
    //
    // The bake hangs the frame with its BOTTOM edge on the tier floor and makes
    // it forty metres tall, while the eye sits 1.62m up. So the centre of the
    // picture was 18.4 metres overhead at every distance and the body walked
    // along beneath it seeing the bottom sliver — which is exactly what the
    // first screenshots showed: picture in the upper third, void below.
    //
    // Lifting the tape camera is render-side and costs nothing; re-hanging the
    // frame would mean a re-bake. The standing eye height comes off first and
    // the wanted height up the frame goes back on, so head bob and any crouch
    // still move the view.
    const spanY = Number(tape?.span?.y) || 40;
    const eyeUpTheFrame = spanY * horizonTune.eyeAt;
    const tapeCamY = camY * CELL - EYE_METERS + eyeUpTheFrame;
    const tapeCamZ = -horizonState.slice * sliceMetres;
    const { view, projection } = HZ.horizonCamera({
      camX: horizonState.lateral,
      camY: tapeCamY,
      camZ: tapeCamZ,
      yaw: yaw + planYaw, pitch,
      aspect: uniforms.sceneW / Math.max(1, uniforms.sceneH),
    });
    // THE GROUND, FIRST, AND THE CORRIDOR ON IT.
    //
    // Under the feet, not under the picture's bottom edge — the recording is
    // allowed to be buried in it and the body is not allowed to be standing on
    // air. Drawn before the splats and without depth, so the tape composites
    // over it in the same painter's order everything else out here uses.
    const feetY = tapeCamY - EYE_METERS;
    HZ.horizonGround({
      view, projection,
      camZ: tapeCamZ,
      floorY: feetY,
      collapse: horizonState.collapse,
      exposure: horizonState.exposure,
      band: horizonState.band,
      bandAhead: horizonState.bandAhead,
      // Cells along the tape are tape metres, so the lookahead needs no scale.
      aheadZ: horizonState.bandLookahead,
      far: horizonTune.reach * sliceMetres,
      near: 4,
    });
    const band = horizonState.band || { centre: 0, reach: 24, lum: 0.5, mosh: 0 };
    const bandAhead = horizonState.bandAhead || band;
    HZ.horizonRender({
      // The tape is cut off at the ground. Without this the buried bottom of
      // every slice is drawn over the floor it is supposed to be standing in,
      // and the floor stops being a floor again.
      floorCut: feetY,
      // And a corridor is carved out of it along the walking band, so the tape
      // becomes the walls of a passage rather than the inside of a box.
      bore: {
        centre: band.centre, centreAhead: bandAhead.centre,
        reach: band.reach, reachAhead: bandAhead.reach,
        z: tapeCamZ, aheadZ: horizonState.bandLookahead,
        axisY: tapeCamY, height: horizonTune.boreHeight, amount: horizonTune.bore,
      },
      // How hard the damage crawls here. See uMosh in horizon3d.js.
      mosh: band.mosh,
      curtain: horizonTune.curtain,
      shimmer: horizonTune.shimmer,
      veil: horizonTune.veil,
      view, projection,
      slice: horizonState.slice,
      collapse: horizonState.collapse,
      exposure: horizonState.exposure,
      nearFade: horizonTune.nearFade,
      reach: horizonTune.reach,
      boil: now * 0.6,
    });
  }
  // The VFD never runs out here. This is the one place in the game that is in
  // colour and the halftone would take it straight back off again.
  pixelMeshStatus.enabled = false;
  // Hand the framebuffer back the way every other pass expects to find it.
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  const resolved = runDatamoshPass(sceneTex, now);
  // Out through the projector, not through a texture copy. See PROJECTION_FRAG.
  presentProjection(resolved, now);
  lastPostSourceFbo = sceneFbo;
}
let sourceWeather = { rain: 0, moon: 1, clouds: 1, leaves: 0 };
const pixelMeshUniformCache = new Map();
const postUniformCache = new Map();
const textSpaceUniformCache = new Map();
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
      if(anisoExt) gl.texParameterf(gl.TEXTURE_2D_ARRAY,anisoExt.TEXTURE_MAX_ANISOTROPY_EXT,anisoMax);
      resolve(t);
    };
    img.onerror=reject; img.src=url.href||String(url);
  });
}
// Roughness and relief are each ONE CHANNEL sampled at the SAME coordinates,
// three lines apart, and each was costing a whole texture unit. Packing them
// into one array — R roughness, G relief — frees a unit, and this pass has none
// left: an M4 Pro reports MAX_TEXTURE_IMAGE_UNITS 16 and all sixteen are bound.
//
// That freed unit is what lets the engraving reach the recorder at all. The
// alternative was folding the two dream arrays together, which would have meant
// a fixed worst-case layer stride and turned a one-frame calm bank from 21MB of
// texture into 105MB.
//
// Merged here rather than in the surface build so the authored assets stay two
// legible greyscale maps that a person can open and look at.
function loadPackedMaterialArray(roughUrl, heightUrl){
  const plane=(url)=>new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      const size=img.width;
      const cv=document.createElement('canvas');cv.width=size;cv.height=img.height;
      cv.getContext('2d',{willReadFrequently:true}).drawImage(img,0,0);
      resolve({size,layers:Math.round(img.height/size),
        data:cv.getContext('2d',{willReadFrequently:true}).getImageData(0,0,size,img.height).data});
    };
    img.onerror=reject;img.src=url.href||String(url);
  });
  return Promise.all([plane(roughUrl),plane(heightUrl)]).then(([rough,height])=>{
    if(rough.size!==height.size||rough.layers!==height.layers){
      throw new Error(`roughness and relief atlases disagree: ${rough.size}x${rough.layers} vs ${height.size}x${height.layers}`);
    }
    const texels=rough.size*rough.size*rough.layers;
    const packed=new Uint8Array(texels*4);
    for(let i=0;i<texels;i++){
      packed[i*4]=rough.data[i*4];       // roughness
      packed[i*4+1]=height.data[i*4];    // relief
      packed[i*4+3]=255;
    }
    const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D_ARRAY,t);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY,0,gl.RGBA8,rough.size,rough.size,rough.layers,0,gl.RGBA,gl.UNSIGNED_BYTE,packed);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.REPEAT);
    if(anisoExt)gl.texParameterf(gl.TEXTURE_2D_ARRAY,anisoExt.TEXTURE_MAX_ANISOTROPY_EXT,anisoMax);
    return t;
  });
}
// A dream bank is SURFACE_LAYERS surfaces × K temporal frames, laid out as
// layer = slot*K + frame. K is authored per look profile; one frame is the old
// still behaviour, five is a surface visibly cooking.
function makeSurfaceDreamTexture(frames=1){
  const k=Math.max(1,Math.min(MAX_DREAM_FRAMES,Math.floor(frames)||1));
  const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D_ARRAY,t);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY,0,gl.SRGB8_ALPHA8,SURFACE_TILE,SURFACE_TILE,SURFACE_LAYERS*k,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.REPEAT);
  if(anisoExt)gl.texParameterf(gl.TEXTURE_2D_ARRAY,anisoExt.TEXTURE_MAX_ANISOTROPY_EXT,anisoMax);
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  return t;
}
// The mark array mirrors the dream array's layer layout exactly, at a quarter
// the side. A mark field is low-frequency by nature — where marks clot and
// which way they run — so 128px carries it, and the whole six-bank set costs
// about a sixteenth of what the albedo does.
//
// NOT sRGB. The dream tiles are SRGB8_ALPHA8 because they are colour; this is
// data. Density and a doubled-angle direction vector pushed through a gamma
// decode would come out silently wrong in a way that looks plausible.
// ONE texture for both halves, because the pass has exactly one spare unit.
// Live occupies layers [0, MARK_HALF_LAYERS), staged [MARK_HALF_LAYERS, 2x), and
// the swap flips which base the shader reads rather than exchanging textures.
// A fixed stride wastes layers for a one-frame bank, which at 128px costs about
// 3MB in total — the same trick on the 512px dream arrays would have cost 84MB.
function makeSurfaceMarkTexture(){
  const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D_ARRAY,t);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY,0,gl.RGBA8,MARK_FIELD_SIZE,MARK_FIELD_SIZE,MARK_HALF_LAYERS*2,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.REPEAT);
  if(anisoExt)gl.texParameterf(gl.TEXTURE_2D_ARRAY,anisoExt.TEXTURE_MAX_ANISOTROPY_EXT,anisoMax);
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  return t;
}
function initSurfaceDream(){
  surfDreamTex=makeSurfaceDreamTexture(1);surfDreamStageTex=makeSurfaceDreamTexture(1);
  surfMarkTex=makeSurfaceMarkTexture();markLiveBase=0;
  surfDreamFrames=1;surfDreamStageFrames=1;
}
export function r3dBeginSurfaceDreamBank(bankId=null,frames=1){
  if(!gl)return false;
  if(surfDreamStageTex)gl.deleteTexture(surfDreamStageTex);
  const k=Math.max(1,Math.min(MAX_DREAM_FRAMES,Math.floor(Number(frames))||1));
  surfDreamStageTex=makeSurfaceDreamTexture(k);
  // Anything still queued was staged for the texture just deleted.
  markQueue.length=0;markEpoch+=1;markStageReady.fill(0);
  if(!surfDreamStageTex)return false;
  surfDreamStageFrames=k;
  surfDreamPendingBank=bankId;
  surfDreamNextReady=false;
  surfDreamTransitionMs=0;
  return true;
}
export function r3dSetSurfaceDream(slot,frame,image,mix=.68){
  if(!gl||!surfDreamStageTex||slot<0||slot>=SURFACE_LAYERS||!image)return false;
  const k=Math.max(1,surfDreamStageFrames);
  const f=Math.max(0,Math.min(k-1,Math.floor(Number(frame))||0));
  const cv=document.createElement('canvas');cv.width=SURFACE_TILE;cv.height=SURFACE_TILE;
  cv.getContext('2d').drawImage(image,0,0,SURFACE_TILE,SURFACE_TILE);
  // Match loadTextureArray's orientation so generated mortar/grain lands on
  // the exact source texels it was conditioned from.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY,surfDreamStageTex);
  gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,slot*k+f,SURFACE_TILE,SURFACE_TILE,1,gl.RGBA,gl.UNSIGNED_BYTE,cv);
  surfDreamMix[slot]=Math.max(0,Math.min(.98,Number(mix)||0));
  stageMarkField(image,slot,f);
  return true;
}
// Derive the engraving from the tile that just arrived.
//
// Deliberately from a MARK_FIELD_SOURCE-sized copy rather than the 512 canvas
// above: at full resolution this costs ~28ms, and material-mutation.js kills
// the whole lens for the session if generation overlaps a frame longer than
// 33ms. The measurement behind that number, and what survives the downsample,
// is documented on MARK_FIELD_SOURCE.
function stageMarkField(image,slot,frame){
  if(!surfMarkTex||!image)return false;
  try{
    // The only part that cannot wait: the bitmap is closed by the caller as
    // soon as this returns.
    const cv=document.createElement('canvas');cv.width=MARK_FIELD_SOURCE;cv.height=MARK_FIELD_SOURCE;
    const ctx=cv.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(image,0,0,MARK_FIELD_SOURCE,MARK_FIELD_SOURCE);
    markQueue.push({
      pixels:ctx.getImageData(0,0,MARK_FIELD_SOURCE,MARK_FIELD_SOURCE).data,
      slot,frame,epoch:markEpoch,
    });
  }catch(err){
    // A tile without an engraving is drawn by the procedural hash, which is
    // exactly the behaviour that shipped before this existed. Never fatal.
    console.warn('[r3d] mark field capture failed',err);
    return false;
  }
  return true;
}
function deriveQueuedMark(entry){
  // A bank that began while this was queued deleted the texture it was staged
  // for; its tile belongs to a material nobody is looking at any more.
  if(entry.epoch!==markEpoch||!surfMarkTex)return false;
  const started=globalThis.performance?.now?.()||Date.now();
  try{
    const field=deriveMarkField(entry.pixels,MARK_FIELD_SOURCE,MARK_FIELD_SOURCE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY,surfMarkTex);
    // Always into the half that is NOT live, so an arriving bank never rewrites
    // the engraving currently on the walls.
    const stageBase=markLiveBase?0:MARK_HALF_LAYERS;
    const layer=stageBase+entry.slot*MAX_DREAM_FRAMES+entry.frame;
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,layer,field.size,field.size,1,gl.RGBA,gl.UNSIGNED_BYTE,field.data);
    // A slot is only engraved once every frame of its boil is, or the crossfade
    // would blend a derived frame against an empty one.
    const k=Math.max(1,surfDreamStageFrames);
    if(entry.slot>=0&&entry.slot<SURFACE_LAYERS){
      markStageReady[entry.slot]=Math.min(k,markStageReady[entry.slot]+1);
    }
  }catch(err){
    console.warn('[r3d] mark field derivation failed',err);
    return false;
  }
  markLastMs=(globalThis.performance?.now?.()||Date.now())-started;
  markDeriveMs+=markLastMs;markDeriveCount+=1;
  return true;
}
// Drained from the frame loop under a time budget, so a ten-tile arrival costs
// ten quiet frames instead of one that kills the lens.
// Exported because the banks stream during the opening credits and the menu,
// when r3dFrame is not being called at all — the world is not being rendered
// yet. Without a tick that runs regardless, every engraving for the first bank
// sits in the queue until the player reaches gameplay.
export function r3dDrainMarkFields(budgetMs=MARK_FRAME_BUDGET_MS){return drainMarkQueue(budgetMs);}
function drainMarkQueue(budgetMs=MARK_FRAME_BUDGET_MS){
  if(!markQueue.length)return 0;
  const started=globalThis.performance?.now?.()||Date.now();
  let done=0;
  while(markQueue.length){
    deriveQueuedMark(markQueue.shift());done+=1;
    if(((globalThis.performance?.now?.()||Date.now())-started)>=budgetMs)break;
  }
  return done;
}
export function r3dCommitSurfaceDream(mix=.68,options={}){
  if(!gl||!surfDreamStageTex)return false;
  gl.bindTexture(gl.TEXTURE_2D_ARRAY,surfDreamStageTex);
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  if(surfMarkTex){gl.bindTexture(gl.TEXTURE_2D_ARRAY,surfMarkTex);gl.generateMipmap(gl.TEXTURE_2D_ARRAY);}
  surfDreamMix.fill(Math.max(0,Math.min(.98,Number(mix)||0)));
  const bankId=options.bankId??surfDreamPendingBank;
  const transitionMs=Math.max(0,Number(options.transitionMs)||0);
  if(!surfDreamReady||transitionMs<=0){
    [surfDreamTex,surfDreamStageTex]=[surfDreamStageTex,surfDreamTex];
    markLiveBase=markLiveBase?0:MARK_HALF_LAYERS;
    markReady.set(markStageReady);markStageReady.fill(0);
    [surfDreamFrames,surfDreamStageFrames]=[surfDreamStageFrames,surfDreamFrames];
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
  surfDreamMix.fill(Math.max(0,Math.min(.98,Number(mix)||0)));
}
export function r3dClearSurfaceDream(){surfDreamMix.fill(0);surfDreamReady=false;surfDreamNextReady=false;surfDreamActiveBank=null;surfDreamPendingBank=null;}
export function r3dSetLocalDiffusionLevel(v=1){localDiffusionAvailability=Math.max(0,Math.min(1,Number(v)||0));}
// How hard the world is boiling right now: dread, the coffee onset, and battle
// impacts all push here. It scales the boil rate, how much generated structure
// reaches the wall, and phosphor excitation in the VFD pass.
// 1 restores the flat constant this shipped with — the A/B for the falloff.
let ambientFloor=0.18;
export function r3dSetAmbientFloor(v=0.18){ambientFloor=Math.max(0,Math.min(1,Number(v)||0));return ambientFloor;}
export function r3dAmbientFloor(){return ambientFloor;}
let ambientPlace=1;
export function r3dWorldYaw(){return yaw+planYaw;}
export function r3dSetAmbientPlace(v=1){ambientPlace=Math.max(0,Math.min(1,v==null?1:Number(v)));return ambientPlace;}
export function r3dAmbientPlace(){return ambientPlace;}
export function r3dSetAgitation(v=0){dreamAgitation=Math.max(0,Math.min(1,Number(v)||0));}
// How hard the generated material's density pulls the recorder's threshold.
// 0 is exactly the procedural hash this game shipped with, which makes it the
// A/B: set it to zero and the walls go back to being drawn by noise.
export function r3dSetMarkDensityGain(v=0.55){markDensityGain=Math.max(0,Math.min(2,Number(v)||0));return markDensityGain;}
export function r3dMarkDensityGain(){return markDensityGain;}
export function r3dSetMarkGrainGain(v=0.70){markGrainGain=Math.max(0,Math.min(2,Number(v)||0));return markGrainGain;}
export function r3dMarkGrainGain(){return markGrainGain;}
// 0 restores the flat per-profile white point every room used to share, which is
// the A/B for the tone floor: does a room lit to .028 read as an engraving, or
// as sparse dust.
export function r3dSetWhitePointZoneAmount(v=1){whitePointZoneAmount=Math.max(0,Math.min(1,Number(v)??1));return whitePointZoneAmount;}
export function r3dWhitePointZoneAmount(){return whitePointZoneAmount;}
export function r3dWhitePointScale(){return whitePointScaleOverride??lightingWhitePointScale;}
// Forces the scale regardless of zone, so the ceiling can be SWEPT against
// measured ink instead of derived from an authored ambient that turns out not to
// predict screen luminance. null hands the room back its own.
// The bounce A/B. 0 is the flat ambient every room shared, which is the black
// ceiling; lampGain is how much lighting the floor lights what is over it.
export function r3dSetBounceAmount(v=1){bounceAmount=Math.max(0,Math.min(6,Number(v)??1));return bounceAmount;}
export function r3dSetBounceLampGain(v=2.4){bounceLampGain=Math.max(0,Math.min(12,Number(v)??2.4));return bounceLampGain;}
export function r3dBounce(){return{amount:bounceAmount,lampGain:bounceLampGain,
  zoneIntensity:lightingBounceIntensity,effective:lightingBounceIntensity*bounceAmount};}
export function r3dSetRainAmount(v=1){rainAmount=Math.max(0,Math.min(8,Number(v)??1));return rainAmount;}
export function r3dRainAmount(){return rainAmount;}
export function r3dSetIndoorRain(v=0){indoorRain=Math.max(0,Math.min(1,Number(v)||0));return indoorRain;}
export function r3dIndoorRain(){return indoorRain;}
export function r3dSetEndingWorldLook(id=null){
  const key=String(id||'');
  endingWorldLook=key?({
    'dawn-0600':1,'conservatoire-0600':1,'cathedral-dawn':1,'van-rain-0500':2,
  }[key]||1):0;
  return endingWorldLook;
}
export function r3dEndingWorldLook(){return endingWorldLook;}
// The screen A/B. null hands it back to the room, then to the look profile.
export function r3dSetScreenOverride(id=null){
  screenOverrideId=isScreen(id)?id:null;
  return screenOverrideId;
}
export function r3dScreen(){
  return{override:screenOverrideId,zone:lightingScreenId,
    effective:screenOverrideId??lightingScreenId??currentLook().vfd.screen??'stochastic'};
}
export function r3dSetWhitePointScaleOverride(v=null){
  whitePointScaleOverride=v==null?null:Math.max(.002,Math.min(4,Number(v)||0));
  return whitePointScaleOverride;
}
export function r3dAgitation(){return dreamAgitation;}
function surfaceDreamBlend(nowMs=globalThis.performance?.now?.()||Date.now()){
  if(!surfDreamNextReady||!surfDreamTransitionMs)return 0;
  const t=Math.max(0,Math.min(1,(nowMs-surfDreamTransitionStart)/surfDreamTransitionMs));
  if(t>=1){
    [surfDreamTex,surfDreamStageTex]=[surfDreamStageTex,surfDreamTex];
    markLiveBase=markLiveBase?0:MARK_HALF_LAYERS;
    markReady.set(markStageReady);markStageReady.fill(0);
    [surfDreamFrames,surfDreamStageFrames]=[surfDreamStageFrames,surfDreamFrames];
    surfDreamReady=true;surfDreamNextReady=false;surfDreamActiveBank=surfDreamPendingBank;surfDreamPendingBank=null;surfDreamTransitionMs=0;
    return 0;
  }
  return t*t*(3-2*t);
}
export function r3dSurfaceDreamStats(){const look=currentLook();return{active:[...surfDreamMix].filter((v)=>v>0).length,mix:[...surfDreamMix],local:look.material.localDiffusion*localDiffusionAvailability,bank:surfDreamActiveBank,pendingBank:surfDreamPendingBank,transitioning:surfDreamNextReady,frames:surfDreamFrames,stagedFrames:surfDreamStageFrames,boilHz:look.material.boilHz??0,structureMix:look.material.structureMix??0,agitation:dreamAgitation,burst:burstMix,
  // The engraving, and what it costs. lastMs is watched because the lens
  // disables itself for the session on a single 33ms frame, so this number
  // going up is the early warning for that.
  marks:{ready:!!surfMarkTex,size:MARK_FIELD_SIZE,source:MARK_FIELD_SOURCE,
    derived:markDeriveCount,queued:markQueue.length,lastMs:+markLastMs.toFixed(2),densityGain:markDensityGain,grainGain:markGrainGain,
    avgMs:markDeriveCount?+(markDeriveMs/markDeriveCount).toFixed(2):0,
    // Slots currently engraved rather than drawn by the procedural hash.
    engraved:[...markReady].filter((v)=>v>0).length,staging:[...markStageReady].filter((v)=>v>0).length}};}
export function r3dSurfaceStats(){return{albedo:!!surfAlbedoTex,normal:!!surfNormalTex,
  // Roughness and relief share one array now (R and G), so they are ready together.
  roughness:!!surfMaterialTex,height:!!surfMaterialTex,
  ready:!!(surfAlbedoTex&&surfNormalTex&&surfMaterialTex)};}
let planTexture = null, materialTexture = null, sourceLayerTexture = null, planW = 0, planH = 0;
// The material/ambient bytes as last uploaded, so a region patch can rewrite
// material without having to re-derive the baked ambient sharing the texture.
let planMatAmb = null;
let planOriginX = 0, planOriginY = 0, planHeightOffset = 0, sourceSurfaceTexture = null;
let uniforms = {};
let facing = 0; // 0=N(0,-1) 1=E 2=S 3=W
let yaw = 0, yawTarget = 0, pitch = 0, pitchTarget = 0;
// HOW FAR THE WORLD IS TURNED UNDER THE PLAYER AT THIS POSITION.
//
// Non-zero only on the spiral. `yaw` stays the LOGICAL look angle — the thing
// the mouse and r3dStepDelta's eight-way snap both write — and the offset is
// added on the way into the shader, so "forward" on screen and "forward" in the
// logical corridor stay the same direction on every tread. That is why nothing
// about movement needs to change on a curved stair.
//
// Eased on its own clock. The offset is derived from position, and a raster
// cannot put tread centres at even angles: the measured step is monotone but
// uneven, 8.8 to 33.7 degrees against an 18.0 mean. Smoothing the camera is the
// right answer to that; distorting the ring to hide it is not.
let planYaw = 0, planYawTarget = 0;
let camX = 0, camZ = 0, camY = EYE_METERS / CELL;
// The peek. A lateral offset on the EYE, in cells, eased so the head moves like
// a head. main.js clamps it against the geometry (game/cover.js) and hands the
// clamped value down; nothing in here decides how far you may lean.
let leanEase = 0;
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
// `extra` attaches further colour targets. Only the scene uses it: the march is
// the one pass that knows a fragment's surface UV and slot, so the engraving has
// to leave alongside the image or it cannot be recovered downstream at all.
function makeFbo(tex, extra = []) {
  const f = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (extra.length) {
    extra.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1 + i, gl.TEXTURE_2D, t, 0));
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, ...extra.map((_, i) => gl.COLOR_ATTACHMENT1 + i)]);
  }
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
  if (source === 'threshold') return 6;
  if (source === 'recorded') return 7;
  if (source === 'instability') return 8;
  return 0;
}

function resolvePixelMeshCellScenePx() {
  const raw = pixelMeshSettings.cellSize;
  const authored = currentLook().vfd.cellPx || 2;
  const cssCell = raw === 'auto' ? authored : Math.max(2, Math.min(24, Number(raw) || authored));
  return Math.max(1, cssCell * (globalThis.devicePixelRatio || 1) * RENDER_SCALE);
}

function pixelMeshU(name) {
  if (!pixelMeshUniformCache.has(name)) pixelMeshUniformCache.set(name, gl.getUniformLocation(progPixelMesh, name));
  return pixelMeshUniformCache.get(name);
}

let frontEndPlate = normalizeFrontEndPlate(FRONT_END_PLATE_PRESETS.gameplay);
export function r3dSetFrontEndPlate(value='gameplay'){ frontEndPlate=normalizeFrontEndPlate(value); return {...frontEndPlate}; }
export function r3dFrontEndPlate(){ return {...frontEndPlate}; }

function postU(name) {
  if (!postUniformCache.has(name)) postUniformCache.set(name, gl.getUniformLocation(progPost, name));
  return postUniformCache.get(name);
}

function textSpaceU(name) {
  if (!textSpaceUniformCache.has(name)) textSpaceUniformCache.set(name, gl.getUniformLocation(progTextSpace, name));
  return textSpaceUniformCache.get(name);
}

function sourceHushProjection(body=hushBodyLast,amount=hushBodyManifestation){
  if(!hushBodyReady||hushBodyMode==='off'||amount<=.001)return{x:.5,y:.5,w:0,h:0,amount:0};
  const floorM=Number.isFinite(Number(body.floorH))?Number(body.floorH):0;
  const base=r3dProjectWorld({x:(body.x+.5)*CELL,y:floorM+.02,z:(body.y+.5)*CELL});
  const top=r3dProjectWorld({x:(body.x+.5)*CELL,y:floorM+body.heightM,z:(body.y+.5)*CELL});
  if(!base.visible&&!top.visible)return{x:.5,y:.5,w:0,h:0,amount:0};
  const h=Math.max(.012,Math.abs(base.y-top.y));
  const aspect=Math.max(.1,(uniforms.sceneW||1)/(uniforms.sceneH||1));
  const w=Math.max(.006,h*(body.widthM/body.heightM)/aspect);
  return{x:(base.x+top.x)*.5,y:1-(base.y+top.y)*.5,w,h,amount:Math.max(0,Math.min(1,amount))};
}

function presentTexture(texture){
  gl.useProgram(progCopy);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  gl.viewport(0,0,canvas.width,canvas.height);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.uniform1i(gl.getUniformLocation(progCopy,'uSrc'),0);
  gl.uniform2f(gl.getUniformLocation(progCopy,'uRes'),canvas.width,canvas.height);
  gl.drawArrays(gl.TRIANGLES,0,3);
}

function drawTextSpace(texture,now,{torchPower=0,sourceTorchMode=0}={}) {
  gl.useProgram(progTextSpace);
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
  // The scene framebuffer normally carries both colour and the architectural
  // mark field. Text Space has no mark output: leaving attachment 1 active
  // makes drawArrays INVALID_OPERATION on conforming WebGL2 drivers, so the
  // compositor writes nothing and the last black frame remains on screen.
  // Narrow this one draw to colour, then restore the raymarcher's two targets.
  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  gl.viewport(0, 0, uniforms.sceneW, uniforms.sceneH);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(textSpaceU('uText'), 0);
  gl.uniform2f(textSpaceU('uRes'), uniforms.sceneW, uniforms.sceneH);
  gl.uniform1f(textSpaceU('uSunrise'), Math.max(0, Math.min(1, Number(sourceLook.sunrise) || 0)));
  gl.uniform1f(textSpaceU('uSourceChroma'), Math.max(0, Math.min(1, Number(sourceLook.chroma) || 0)));
  gl.uniform1f(textSpaceU('uPaper'), Math.max(0, Math.min(1, Number(sourceLook.paper) || 0)));
  gl.uniform1f(textSpaceU('uTime'),now);
  gl.uniform1f(textSpaceU('uNightSeed'),nightSeed);
  gl.uniform1f(textSpaceU('uRain'),Math.max(0,Math.min(1,Number(sourceWeather.rain)||indoorRain||0)));
  gl.uniform1f(textSpaceU('uLeaves'),Math.max(0,Math.min(1,Number(sourceWeather.leaves)||0)));
  gl.uniform1f(textSpaceU('uReducedMotion'),pixelMeshSettings.reduceMotion?1:0);
  gl.uniform1f(textSpaceU('uSourceEmergency'),sourceEmergencyStrength);
  gl.uniform1f(textSpaceU('uSourceWhiteout'),sourceWhiteoutStrength);
  gl.uniform1f(textSpaceU('uSourceTorchMode'),sourceTorchMode);
  gl.uniform1f(textSpaceU('uSourceTorchPower'),torchPower);
  gl.uniform2f(textSpaceU('uView'),yaw+planYaw,pitch);
  gl.uniform2f(textSpaceU('uMoonCloud'),Math.max(0,Math.min(1,Number(sourceWeather.moon)||0)),Math.max(0,Math.min(1,Number(sourceWeather.clouds)||0)));
  const body=sourceHushProjection();
  gl.uniform4f(textSpaceU('uHushScreen'),body.x,body.y,body.w,body.h);
  gl.uniform1f(textSpaceU('uHushAmount'),body.amount);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,hushBodyReady?hushBodyTex:texture);
  gl.uniform1i(textSpaceU('uHushBodyTex'),1);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
  pixelMeshStatus.enabled = false;
  const faulted=runSourceFaultPass(sceneTex,now);
  const resolved=runDatamoshPass(faulted,now);
  presentTexture(resolved);
  lastPostSourceFbo = sceneFbo;
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
uniform float uSourceEmergency;
uniform float uSourceWhiteout;
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
  float sourceLuma=dot(source,vec3(.2126,.7152,.0722));
  float towerLuma=dot(tower,vec3(.2126,.7152,.0722));
  // Blocks break on picture energy as well as time. Bright Source structure
  // tears through first while the hall's darker macroblocks persist as P-frame
  // residue, so this reads as a damaged physical transition rather than a wipe.
  float lumaBreak=(towerLuma-sourceLuma)*.22*(1.0-uReducedMotion);
  float reveal=smoothstep(seed-.12,seed+.12,uProgress+lumaBreak);
  vec3 current=mix(source,tower,reveal);
  float retention=(1.0-uReducedMotion)*mix(.15,.78,uProgress)*step(.18,seed);
  vec3 carried=mix(current,previous,retention);
  float chroma=.009*uProgress*(1.0-uReducedMotion);
  carried.r=mix(carried.r,texture(uTower,uv+vec2(chroma,0)).r,reveal);
  carried.b=mix(carried.b,texture(uSource,uv-vec2(chroma,0)).b,1.0-reveal);
  carried=mix(carried,vec3(1.0),clamp(uSourceWhiteout,0.0,1.0));
  // This pass can be the final writer for both physical and Text Space Source
  // frames during a threshold. Reassert the circuit here as well, after motion
  // retention, or old non-red P-frames can cover the maintained wash.
  float ePhase=mod(uTime,3.2);
  float ePulse=uReducedMotion>.5?.78:(ePhase<.18?1.0:ePhase<.42?.48:ePhase<.64?.92:ePhase<.92?.56:.46+.04*sin((ePhase-.92)*2.4));
  float eLuma=dot(carried,vec3(.2126,.7152,.0722));
  float eWash=clamp(uSourceEmergency*ePulse*(.78+.22*(1.0-eLuma)),0.0,.94);
  vec3 emergencyRed=vec3(max(.82,carried.r*1.18+.18),carried.g*.025,carried.b*.012);
  carried=mix(carried,emergencyRed,eWash);
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
  gl.uniform2f(u('uResolution'),uniforms.sceneW,uniforms.sceneH);gl.uniform1f(u('uProgress'),datamoshProgress);gl.uniform1f(u('uTime'),now);gl.uniform1f(u('uReducedMotion'),datamoshReducedMotion?1:0);gl.uniform1f(u('uSourceEmergency'),sourceEmergencyStrength);gl.uniform1f(u('uSourceWhiteout'),sourceWhiteoutStrength);
  gl.drawArrays(gl.TRIANGLES,0,3);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return dstTex;
}

const SOURCE_FAULT_FRAG=`#version 300 es
precision highp float;
uniform sampler2D uCurrent;
uniform sampler2D uPrevious;
uniform vec2 uResolution;
uniform float uNvme;
uniform float uPs2;
uniform float uTransition;
uniform float uSeed;
uniform float uSlot;
uniform float uReduceMotion;
uniform float uOverflow;
uniform float uOverflowHead;
uniform float uOverflowLane;
uniform float uOverflowDirection;
uniform float uOverflowRun;
uniform int uFlashMode;
out vec4 outColor;
float hash21(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
void main(){
  vec2 uv=gl_FragCoord.xy/uResolution;
  vec2 centred=uv-.5;
  float angle=atan(centred.y,centred.x);
  float wedgeId=floor((angle+3.141593)*3.82);
  float wedgeHash=hash21(vec2(wedgeId,uSlot+uSeed));
  float wedgeGate=step(1.0-uPs2*.58,wedgeHash);
  vec2 ps2uv=centred;
  float stretch=1.0+(wedgeHash-.42)*uPs2*.52*wedgeGate;
  ps2uv.x*=stretch;
  ps2uv.y*=1.0-(wedgeHash-.5)*uPs2*.34*wedgeGate;
  ps2uv.x+=(wedgeHash-.5)*uPs2*.095*wedgeGate*(1.0-uReduceMotion);
  ps2uv=clamp(ps2uv+.5,vec2(0.001),vec2(.999));

  vec2 sector=floor(gl_FragCoord.xy/vec2(116.0,48.0));
  float cell=hash21(sector+vec2(uSlot*5.3,uSeed));
  float band=hash21(vec2(floor(gl_FragCoord.y/13.0),uSlot+uSeed*.17));
  float broken=step(1.0-uNvme*.55,cell);
  vec2 nvmeUv=ps2uv;
  nvmeUv.x+=(cell-.5)*uNvme*.18*broken;
  nvmeUv.y+=(band-.5)*uNvme*.065*step(1.0-uNvme*.28,band);
  nvmeUv=clamp(nvmeUv,vec2(.001),vec2(.999));
  float held=max(broken,step(1.0-uNvme*.40,hash21(sector.yx+uSeed+8.7)));
  vec3 current=texture(uCurrent,nvmeUv).rgb;
  vec3 previous=texture(uPrevious,nvmeUv+vec2((cell-.5)*.025,0.0)).rgb;
  vec3 color=mix(current,previous,held);

  // A coherent bad-sector train. The head crosses one authored lane while the
  // tail retains displaced history in stepped packets; it is intentionally
  // much more legible than the ambient single-sector holds above.
  float direction=uOverflowDirection<0.0?-1.0:1.0;
  float travel=direction>0.0?uOverflowHead:1.0-uOverflowHead;
  float steppedRow=floor(gl_FragCoord.y/36.0);
  float headPx=travel*uResolution.x+(hash21(vec2(steppedRow,uSeed+uOverflowRun*3.7))-.5)*72.0;
  float behind=direction*(headPx-gl_FragCoord.x);
  float laneCenter=(.17+clamp(uOverflowLane,0.0,3.0)*.22)*uResolution.y;
  float laneDistance=abs(gl_FragCoord.y-laneCenter);
  float laneMask=1.0-smoothstep(uResolution.y*.075,uResolution.y*.145,laneDistance);
  float headMask=1.0-smoothstep(0.0,74.0,abs(behind));
  float tailMask=step(0.0,behind)*(1.0-smoothstep(120.0,680.0,behind));
  vec2 runSector=floor(gl_FragCoord.xy/vec2(58.0,31.0));
  float packet=step(.24,hash21(runSector+vec2(uOverflowRun*11.0,uSeed+17.0)));
  float runMask=uOverflow*laneMask*max(headMask*.95,tailMask*packet);
  vec2 runUv=nvmeUv;
  float packetShift=.035+hash21(runSector.yx+uSeed+uOverflowRun)*.115;
  runUv.x-=direction*packetShift;
  runUv.y+=(hash21(runSector+uSeed+41.0)-.5)*.055;
  vec3 retained=texture(uPrevious,clamp(runUv,vec2(.001),vec2(.999))).rgb;
  color=mix(color,retained,clamp(runMask*.96,0.0,1.0));
  float failedPacket=runMask*step(.86,hash21(runSector.yx+vec2(uSeed,uOverflowRun+73.0)));
  color=mix(color,vec3(.002,.003,.009),failedPacket);
  if(headMask*uOverflow*laneMask>.72&&uFlashMode==0)color=mix(color,vec3(.78,.86,1.0),.34);

  float flatField=step(1.0-uPs2*.16,hash21(vec2(wedgeId,uSlot*.31+uSeed+51.0)))*wedgeGate;
  vec3 fieldColor=mix(vec3(.17,.15,.20),vec3(.46,.08,.37),step(.55,wedgeHash));
  color=mix(color,fieldColor,flatField*(.42+.35*uTransition));
  float dropout=step(1.0-uNvme*.075,hash21(sector+vec2(23.0,uSlot+uSeed)));
  float hard=step(1.0-uNvme*.025,hash21(sector.yx+vec2(91.0,uSlot+uSeed)));
  color=mix(color,vec3(.002,.003,.009),dropout);
  if(hard>.5&&uFlashMode==0)color=vec3(.94,.96,1.0);
  else if(hard>.5&&uFlashMode==1)color=vec3(.09,.10,.25);
  else if(hard>.5&&uFlashMode==2)color=vec3(.002,.003,.009);
  outColor=vec4(color,1.0);
}`;

export function r3dSetSourceFault(value=0){
  if(!value||value.active===false){sourceFaultState={active:false,nvme:0,ps2:0,transition:0,seed:0,slot:0,overflow:0,overflowHead:0,overflowLane:0,overflowDirection:1,overflowRun:0,reduceMotion:false,flashMode:'full'};sourceFaultWarm=false;return sourceFaultState;}
  sourceFaultState={
    active:true,nvme:Math.max(0,Math.min(1,Number(value.nvme)||0)),ps2:Math.max(0,Math.min(1,Number(value.ps2)||0)),
    transition:Math.max(0,Math.min(1,Number(value.transition)||0)),seed:Number(value.seed)||0,slot:Math.max(0,Math.floor(Number(value.slot)||0)),
    overflow:Math.max(0,Math.min(1,Number(value.overflow)||0)),overflowHead:Math.max(0,Math.min(1,Number(value.overflowHead)||0)),
    overflowLane:Math.max(0,Math.min(3,Math.floor(Number(value.overflowLane)||0))),overflowDirection:Number(value.overflowDirection)<0?-1:1,
    overflowRun:Math.max(0,Math.floor(Number(value.overflowRun)||0)),
    reduceMotion:!!value.reduceMotion,flashMode:['full','reduced','off'].includes(value.flashMode)?value.flashMode:'full',
  };
  return sourceFaultState;
}
export function r3dSourceFaultStatus(){return{...sourceFaultState,warm:sourceFaultWarm};}
function runSourceFaultPass(inputTex,now){
  if(!sourceFaultState.active||!progSourceFault||!sourceFaultTexA)return inputTex;
  const dstFbo=sourceFaultFlip?sourceFaultFboA:sourceFaultFboB,dstTex=sourceFaultFlip?sourceFaultTexA:sourceFaultTexB;
  const history=sourceFaultWarm?(sourceFaultFlip?sourceFaultTexB:sourceFaultTexA):inputTex;
  sourceFaultFlip=!sourceFaultFlip;
  gl.useProgram(progSourceFault);gl.bindFramebuffer(gl.FRAMEBUFFER,dstFbo);gl.viewport(0,0,uniforms.sceneW,uniforms.sceneH);
  const u=(name)=>gl.getUniformLocation(progSourceFault,name);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,inputTex);gl.uniform1i(u('uCurrent'),0);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,history);gl.uniform1i(u('uPrevious'),1);
  gl.uniform2f(u('uResolution'),uniforms.sceneW,uniforms.sceneH);gl.uniform1f(u('uNvme'),sourceFaultState.nvme);gl.uniform1f(u('uPs2'),sourceFaultState.ps2);gl.uniform1f(u('uTransition'),sourceFaultState.transition);gl.uniform1f(u('uSeed'),sourceFaultState.seed);gl.uniform1f(u('uSlot'),sourceFaultState.slot);gl.uniform1f(u('uReduceMotion'),sourceFaultState.reduceMotion?1:0);gl.uniform1f(u('uOverflow'),sourceFaultState.overflow);gl.uniform1f(u('uOverflowHead'),sourceFaultState.overflowHead);gl.uniform1f(u('uOverflowLane'),sourceFaultState.overflowLane);gl.uniform1f(u('uOverflowDirection'),sourceFaultState.overflowDirection);gl.uniform1f(u('uOverflowRun'),sourceFaultState.overflowRun);gl.uniform1i(u('uFlashMode'),sourceFaultState.flashMode==='off'?2:sourceFaultState.flashMode==='reduced'?1:0);
  gl.drawArrays(gl.TRIANGLES,0,3);gl.bindFramebuffer(gl.FRAMEBUFFER,null);sourceFaultWarm=true;return dstTex;
}

// ── the possession burst ────────────────────────────────────────────────────
// The rendered room, handed back to the model and returned a second later as
// something that remembers being a room. It composites BEFORE the pixel mesh,
// so the VFD pass encodes it like everything else and possession stays inside
// the instrument instead of looking like a screenshot of another program.
//
// Latency is the honest problem: the reply describes the frame the player was
// looking at, not the one in front of them. So the mix is damped by camera
// motion — turn your head and the possession recedes; hold still and it takes
// the room. Standing still in a horror game is not a limitation. It is the game.
const BURST_FRAG=`#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uBurst;
uniform vec2 uRes;
uniform float uMix;
uniform float uTime;
out vec4 outColor;
float bayer4(vec2 p){
  int x=int(mod(p.x,4.0)),y=int(mod(p.y,4.0));
  int i=y*4+x;
  float m[16]=float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return m[i]/16.0;
}
void main(){
  vec2 uv=gl_FragCoord.xy/uRes;
  vec3 scene=texture(uScene,uv).rgb;
  vec3 burst=texture(uBurst,uv).rgb;
  // Ordered dither on the blend: the repaint arrives as a spreading rash of
  // cells rather than a clean dissolve, which reads as the display failing.
  float threshold=bayer4(gl_FragCoord.xy);
  float amount=clamp(uMix*1.35-threshold*0.35,0.0,1.0);
  // Keep the room's own luminance structure underneath. The possession changes
  // what the walls are made of, never where they are.
  float sceneLum=dot(scene,vec3(.2126,.7152,.0722));
  float burstLum=max(.03,dot(burst,vec3(.2126,.7152,.0722)));
  vec3 relit=burst*mix(1.0,sceneLum/burstLum,0.45);
  outColor=vec4(mix(scene,clamp(relit,0.0,1.0),amount),1.0);
}`;
let progBurst=null,burstTex=null,burstFbo=null,burstOutTex=null,burstOutFbo=null;
let burstMix=0,burstTarget=0,burstLastAt=0,burstW=0,burstH=0;
function burstU(name){return gl.getUniformLocation(progBurst,name);}
export function r3dSetBurstFrame(image,{seconds=0}={}){
  if(!gl||!image)return false;
  if(!burstTex||burstW!==image.width||burstH!==image.height){
    if(burstTex)gl.deleteTexture(burstTex);
    burstW=image.width;burstH=image.height;
    burstTex=makeTex(burstW,burstH);
  }
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.bindTexture(gl.TEXTURE_2D,burstTex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  burstTarget=1;
  burstLastAt=globalThis.performance?.now?.()||Date.now();
  return true;
}
export function r3dEndBurst(){burstTarget=0;}
export function r3dBurstActive(){return burstMix>0.004;}
function runBurstPass(sceneSource,now){
  const nowMs=(globalThis.performance?.now?.()||Date.now());
  // A reply that never came: fade out rather than hold a stale room forever.
  if(burstTarget>0&&burstLastAt&&nowMs-burstLastAt>2200)burstTarget=0;
  const dt=Math.max(0,Math.min(.25,now-(lastBurstTickAt||now)));
  lastBurstTickAt=now;
  const rate=burstTarget>burstMix?dt/0.30:dt/1.20;   // attack .3s, release 1.2s
  burstMix+=Math.max(-1,Math.min(1,burstTarget-burstMix))*Math.min(1,rate);
  if(burstMix<0.004){burstMix=0;return sceneSource;}
  if(!progBurst||!burstTex||!burstOutFbo)return sceneSource;
  // Camera motion damping: the repaint is always a moment stale, so it only
  // asserts itself while the recordist is holding still.
  const damped=burstMix*(1-Math.min(.8,vfdMovement*1.1));
  if(damped<0.004)return sceneSource;
  gl.useProgram(progBurst);
  gl.bindFramebuffer(gl.FRAMEBUFFER,burstOutFbo);
  gl.viewport(0,0,uniforms.sceneW,uniforms.sceneH);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,sceneSource);gl.uniform1i(burstU('uScene'),0);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,burstTex);gl.uniform1i(burstU('uBurst'),1);
  gl.uniform2f(burstU('uRes'),uniforms.sceneW,uniforms.sceneH);
  gl.uniform1f(burstU('uMix'),damped);
  gl.uniform1f(burstU('uTime'),now);
  gl.drawArrays(gl.TRIANGLES,0,3);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  return burstOutTex;
}
let lastBurstTickAt=0;

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

  // The possession composites first so the VFD encodes it as part of the world.
  const worldTex = runBurstPass(sceneTex, now);

  // Other passes may leave a WebGL diagnostic behind. Clear before the pixel
  // pass so __chunkSurferPixelMesh.status() reports this layer, not stale GL.
  clearGlErrors();
  gl.useProgram(progPixelMesh);
  gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo);
  gl.viewport(0, 0, uniforms.sceneW, uniforms.sceneH);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, worldTex);
  gl.uniform1i(pixelMeshU('uSrc'), 0);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, prevTex);
  gl.uniform1i(pixelMeshU('uPrev'), 1);

  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, sceneTex);
  gl.uniform1i(pixelMeshU('uDepth'), 2);

  // The engraving, in screen space. Unit 3 — this pass uses three samplers
  // against a limit of sixteen, so unlike the raymarch it has room to spare.
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, markTex);
  gl.uniform1i(pixelMeshU('uMarks'), 3);
  gl.uniform1f(pixelMeshU('uMarkDensityGain'), markDensityGain);
  gl.uniform1f(pixelMeshU('uMarkGrainGain'), markGrainGain);

  // THE SCREEN. The dial overrules the room, the room overrules the look, and
  // the look is what an ordinary frame uses.
  const screen = screenUniforms(screenOverrideId ?? lightingScreenId ?? look.vfd.screen ?? 'stochastic');
  gl.uniform1i(pixelMeshU('uScreenKind'), screen.kind);
  gl.uniform1f(pixelMeshU('uScreenPeriodPx'), screen.periodPx);
  gl.uniform3f(pixelMeshU('uScreenAngles'), screen.angles[0], screen.angles[1], screen.angles[2]);
  gl.uniform2f(pixelMeshU('uScreenBands'), screen.bands[0], screen.bands[1]);
  gl.uniform1f(pixelMeshU('uScreenSharpness'), screen.sharpness);
  gl.uniform1f(pixelMeshU('uScreenGrainFollow'), screen.grainFollow);
  gl.uniform1f(pixelMeshU('uScreenJitter'), screen.jitter);

  // The blue-noise threshold mask, on unit 4. NEAREST and REPEAT: it is a rank
  // table, not an image — interpolating between two ranks invents a threshold
  // that belongs to neither cell and reintroduces structure.
  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, ensureBlueNoise(gl));
  gl.uniform1i(pixelMeshU('uNoise'), 4);
  gl.uniform2f(pixelMeshU('uNoiseSize'), BLUE_NOISE_SIZE, BLUE_NOISE_SIZE);
  // The profile says how this LOOK reads; the zone says how much light this ROOM
  // has to read by. BOTH ENDS have to move together: scaling only the white point
  // was the first version of this and it changed nothing, because the black point
  // is the end the interiors actually fail. Measured raw, in byte terms against a
  // black point at 1.3: the loading bay's walls sit at 51 with 0.2% underneath it,
  // and the get-in's at 1.3 with 63% underneath — six times below the floor at the
  // median. Nothing downstream of that can draw a mark.
  // The strike pulls the ceiling down as it raises the floor of light, so the
  // dither runs out of headroom and the frame solidifies.
  const scale = (whitePointScaleOverride ?? lightingWhitePointScale) / (1 + stormFlash * 3.6);
  const blend = (authored, zoned) => zoned + (authored - zoned) * (1 - whitePointZoneAmount);
  const authoredWhite = look.vfd.whitePoint ?? 1.0;
  const authoredBlack = look.vfd.blackPoint ?? 0.0;
  const black = blend(authoredBlack, authoredBlack * scale);
  gl.uniform1f(pixelMeshU('uBlackPoint'), black);
  // Floored clear of the black point so a scale can never invert the curve.
  gl.uniform1f(pixelMeshU('uWhitePoint'),
    Math.max(black + 0.002, blend(authoredWhite, authoredWhite * scale)));
  gl.uniform1f(pixelMeshU('uToneGamma'), look.vfd.toneGamma ?? 1.0);
  gl.uniform1f(pixelMeshU('uLineAmount'), look.vfd.lineAmount ?? 0.0);
  gl.uniform1f(pixelMeshU('uToneAmount'), look.vfd.toneAmount ?? 0.0);

  gl.uniform2f(pixelMeshU('uRes'), uniforms.sceneW, uniforms.sceneH);
  gl.uniform3f(pixelMeshU('uCam'), camX, camY, camZ);
  // World bearing, not the logical one. This uniform drives the VFD temporal
  // reprojection: if the scene pass rotates on the spiral and this does not, the
  // whole climb smears.
  gl.uniform1f(pixelMeshU('uYaw'), yaw + planYaw);
  gl.uniform1f(pixelMeshU('uPitch'), pitch);
  gl.uniform1f(pixelMeshU('uCellMeters'), CELL);
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
  gl.uniform1f(pixelMeshU('uRecordingCaptureMix'), look.recording.captureMix);
  gl.uniform1f(pixelMeshU('uRecordingPatternScale'), look.recording.patternScale);
  gl.uniform1f(pixelMeshU('uRecordingBlackFloor'), look.recording.blackFloor);
  gl.uniform1f(pixelMeshU('uRecordingDensityGamma'), look.recording.densityGamma);
  gl.uniform1f(pixelMeshU('uRecordingThresholdNoise'), look.recording.thresholdNoise);
  gl.uniform1f(pixelMeshU('uRecordingIrregularity'), look.recording.thresholdIrregularity);
  gl.uniform1f(pixelMeshU('uRecordingTemporalHz'), look.recording.temporalHz);
  gl.uniform1f(pixelMeshU('uRecordingTemporalSmear'), look.recording.temporalSmear);
  gl.uniform1f(pixelMeshU('uRecordingScenePinning'), look.recording.scenePinning);
  gl.uniform1f(pixelMeshU('uRecordingFearGain'), look.recording.fearGain);
  gl.uniform1f(pixelMeshU('uRecordingAudioGain'), look.recording.audioGain);
  gl.uniform1f(pixelMeshU('uDebugSource'), debugSourceToNumber(effectiveSettings.debugSource));
  gl.uniform1f(pixelMeshU('uForceSignal'), forceSignal);
  gl.uniform1f(pixelMeshU('uMovement'), vfdMovement);
  gl.uniform1f(pixelMeshU('uPaletteChroma'), look.vfd.paletteChroma ?? 0);
  gl.uniform1f(pixelMeshU('uShadowLift'), look.vfd.shadowLift ?? 0);
  gl.uniform1f(pixelMeshU('uAgitation'), dreamAgitation);
  const hushBodyModeIndex=Math.max(0,HUSH_BODY_MODES.indexOf(hushBodyMode));
  const hushBodyPostManifestation=Math.max(hushBodyManifestation,hushBodySecondaryManifestation);
  const hushBodyPostActive=state?.hushBodyAllowed!==false&&hushBodyReady&&hushBodyPostManifestation>.001&&hushBodyModeIndex<3;
  gl.uniform4f(
    pixelMeshU('uHushBodyPost'),
    hushBodyPostManifestation,
    hushBodyPostActive?1:0,
    hushBodyModeIndex<2?1:0,
    hushBodyModeIndex===0||hushBodyModeIndex===2?1:0,
  );

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

// Linear data texture: the HUSH asset stores signed distance and coverage,
// not display colour. sRGB decoding would bend the distance field and thicken
// the body differently at each mip/range.
function loadDataTexture(url){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      const t=gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D,t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,img);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      resolve(t);
    };
    img.onerror=()=>reject(new Error(`failed to load data texture ${url}`));
    img.src=url.href||String(url);
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
  progSourceFault = program(SOURCE_FAULT_FRAG);
  canvas.dataset.sourceFaultShader='ready';
  progCopy = program(COPY_FRAG);
  progProjection = program(PROJECTION_FRAG);
  try { progBurst = program(BURST_FRAG); } catch (_) { progBurst = null; }
  progTextSpace = program(TEXT_SPACE_FRAG);
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
    .then(()=>P3.addPropPack(assetUrl('assets/conservatory-acquisitions.glb')))
    .then(()=>P3.addPropPack(assetUrl('assets/opening-street.glb')))
    // Hero vegetation deliberately overrides the conservative tree, hedge and
    // ruined-garden meshes. A missing optional pack falls back to those names
    // without preventing later structural packs from loading.
    .then(()=>P3.addPropPack(assetUrl('assets/vegetation.glb')).catch((err)=>console.warn('vegetation pack unavailable; retaining procedural fallbacks',err)))
    .then(()=>P3.addPropPack(assetUrl('assets/source-structures.glb')))
    .then(()=>P3.addPropPack(assetUrl('assets/conservatory-doors.glb')))
    .then(()=>P3.addPropPack(assetUrl('assets/tuning-fork.glb')))
    .then(()=>P3.addPropPack(assetUrl('assets/conservatory-main-stair.glb')))
    .catch((err)=>console.warn('prop pack unavailable',err));
  P3.loadPortraitAtlas(assetUrl('assets/portraits/portrait-atlas.webp'))
    .catch((err)=>console.warn('portrait atlas unavailable',err));
  P3.loadPaperAtlas(assetUrl(PAPER_ATLAS.path),{columns:PAPER_ATLAS.columns,rows:PAPER_ATLAS.rows})
    .catch((err)=>console.warn('paper atlas unavailable; sheets retain stock material',err));
  Promise.all([
    loadTextureArray(assetUrl('assets/surfaces/surface-albedo.jpg'),{srgb:true}),
    loadTextureArray(assetUrl('assets/surfaces/surface-normal.png')),
    loadPackedMaterialArray(assetUrl('assets/surfaces/surface-rough.jpg'),
                            assetUrl('assets/surfaces/surface-height.png')),
  ]).then(([a,n,m])=>{surfAlbedoTex=a;surfNormalTex=n;surfMaterialTex=m;surfaceTexture=a;})
    .catch((err)=>console.warn('surface arrays unavailable; using native material fallback',err));
  // The body is generated data, not an ordinary colour texture. Fingerprint
  // its URL so a running desktop/webview cannot retain an older matte/card
  // from the same filename after an asset-only rebuild.
  const hushBodyAssetUrl=assetUrl(HUSH_BODY_ASSET);
  loadDataTexture(`${hushBodyAssetUrl}${hushBodyAssetUrl.includes('?')?'&':'?'}v=${HUSH_BODY_ASSET_REV}`)
    .then((texture)=>{hushBodyTex=texture;hushBodyReady=true;hushBodyLoadError=null;})
    .catch((err)=>{hushBodyReady=false;hushBodyLoadError=err?.message||String(err);console.warn('HUSH body unavailable; retaining absence field',err);});
  window.addEventListener('resize', resize);
}

function resize() {
  if(windowGeometryMotion){windowGeometryResizePending=true;return;}
  const w = Math.max(1, canvas.parentElement.clientWidth);
  const h = Math.max(1, canvas.parentElement.clientHeight);
  canvas.width = Math.round(w * devicePixelRatio);
  canvas.height = Math.round(h * devicePixelRatio);
  const sw = Math.max(64, Math.round(canvas.width * RENDER_SCALE));
  const sh = Math.max(64, Math.round(canvas.height * RENDER_SCALE));
  if (sceneTex) { gl.deleteTexture(sceneTex); gl.deleteFramebuffer(sceneFbo); }
  if (markTex) { gl.deleteTexture(markTex); markTex = null; }
  if (meshTexA) {
    gl.deleteTexture(meshTexA); gl.deleteTexture(meshTexB);
    gl.deleteFramebuffer(meshFboA); gl.deleteFramebuffer(meshFboB);
  }
  for(const item of [[datamoshSourceTex,datamoshSourceFbo],[datamoshTexA,datamoshFboA],[datamoshTexB,datamoshFboB]]){if(item[0])gl.deleteTexture(item[0]);if(item[1])gl.deleteFramebuffer(item[1]);}
  for(const item of [[sourceFaultTexA,sourceFaultFboA],[sourceFaultTexB,sourceFaultFboB]]){if(item[0])gl.deleteTexture(item[0]);if(item[1])gl.deleteFramebuffer(item[1]);}
  if(burstOutTex){gl.deleteTexture(burstOutTex);gl.deleteFramebuffer(burstOutFbo);}
  burstOutTex=makeMeshTex(sw,sh);burstOutFbo=makeFbo(burstOutTex);
  // Preserve ray distance beyond eight alpha bits. The acquisition pass pins
  // its marks to reconstructed world space; quantised depth made that position
  // crawl sideways as the camera changed angle. RGB is explicitly clamped in
  // the raymarch shader, so this precision upgrade does not alter exposure.
  sceneTex = makeTex(sw, sh, null, 'rgba16f');
  // RGBA8, not the scene's rgba16f: density, a doubled-angle direction and a
  // coherence all live in 0..1, and test/mark-field.spec.mjs shows eight bits
  // resolve the grain to about a tenth of a degree, far finer than the warp
  // that consumes it. Half the bandwidth of matching the scene.
  markTex = makeTex(sw, sh, null, 'rgba8');
  sceneFbo = makeFbo(sceneTex, [markTex]);
  meshTexA = makeMeshTex(sw, sh);
  meshTexB = makeMeshTex(sw, sh);
  meshFboA = makeFbo(meshTexA);
  meshFboB = makeFbo(meshTexB);
  datamoshSourceTex=makeMeshTex(sw,sh);datamoshSourceFbo=makeFbo(datamoshSourceTex);
  datamoshTexA=makeMeshTex(sw,sh);datamoshTexB=makeMeshTex(sw,sh);datamoshFboA=makeFbo(datamoshTexA);datamoshFboB=makeFbo(datamoshTexB);
  sourceFaultTexA=makeMeshTex(sw,sh);sourceFaultTexB=makeMeshTex(sw,sh);sourceFaultFboA=makeFbo(sourceFaultTexA);sourceFaultFboB=makeFbo(sourceFaultTexB);sourceFaultFlip=false;sourceFaultWarm=false;
  meshFlip = false;
  lastPixelMeshAt = 0;
  pixelMeshStatus.sceneWidth = sw;
  pixelMeshStatus.sceneHeight = sh;
  pixelMeshStatus.supported = !!progPixelMesh;
  P3.props3dResize(sw, sh, { shadowMapSize: RENDER_SCALE < .75 ? 512 : 1024 });
  uniforms.sceneW = sw; uniforms.sceneH = sh;
  r3dResetVfdMemory();
}

// Native window choreography can deliver thirty resize events per second. A
// normal resize rebuilds every scene/mesh/datamosh framebuffer, so doing that
// for every interpolation tick stalls the render stack. Keep one logical image
// during the tween (CSS presents it in the changing frame), then reconcile the
// native size exactly once when the cue settles.
export function r3dSetWindowGeometryMotion(active=false){
  windowGeometryMotion=!!active;
  if(!windowGeometryMotion&&windowGeometryResizePending){
    windowGeometryResizePending=false;
    resize();
  }
  return windowGeometryMotion;
}

// ── Facing / input hooks (main.js calls these in 3d mode) ────────────────────
export function r3dTurn(dir) {
  const quarter=Math.PI/2,base=Math.round(yawTarget/quarter)+dir;
  facing = ((base % 4) + 4) % 4;
  yawTarget = base * quarter;
  r3dResetVfdMemory();
}
// These caps are a rail against GARBAGE INPUT — a wild delta from a lost
// pointer lock, a hot-plugged pad — and nothing else. They were ±.16 and ±.12
// radians, which is not a garbage threshold: it is roughly what a hand actually
// moves in one frame, so it silently became the sensitivity ceiling. The
// clamp bit whenever dx*sensitivity exceeded 33, which at the top of the slider
// is a movement of THREE PIXELS, making every setting above about 1.7
// indistinguishable and the maximum feel slow.
//
// Pixel-space deltas are already bounded upstream (clampDelta in
// pointer-mode.js), so these only need to be beyond anything a hand produces.
const LOOK_YAW_LIMIT=.9;    // ~51 degrees in one frame
const LOOK_PITCH_LIMIT=.35;
export function r3dLook(yawDelta=0,pitchDelta=0) {
  yawTarget += Math.max(-LOOK_YAW_LIMIT,Math.min(LOOK_YAW_LIMIT,Number(yawDelta)||0));
  pitchTarget = Math.max(-.62,Math.min(.62,pitchTarget+Math.max(-LOOK_PITCH_LIMIT,Math.min(LOOK_PITCH_LIMIT,Number(pitchDelta)||0))));
  facing=((Math.round(yawTarget/(Math.PI/2))%4)+4)%4;
  r3dResetVfdMemory();
  return {yaw:yawTarget,pitch:pitchTarget,facing};
}
export function r3dLookAngles(){return{yaw:yawTarget,pitch:pitchTarget,facing};}
// Where the eye actually ended up, for the pixel harness: the lean is eased, so
// the camera lags the requested value and only this can say where it is.
export function r3dEyePoint(){return{x:camX,y:camY,z:camZ,lean:leanEase};}
// Project a physical world point (metres) through the same basis and 0.95 FOV
// used by the raymarcher. UI attached to architecture can then follow the thing
// itself while the player looks around instead of being painted at screen centre.
export function r3dProjectWorld(point={}){
  const tx=(Number(point.x)||0)/CELL,ty=(Number(point.y)||0)/CELL,tz=(Number(point.z)||0)/CELL;
  const dx=tx-camX,dy=ty-camY,dz=tz-camZ,worldYaw=yaw+planYaw;
  const cy=Math.cos(worldYaw),sy=Math.sin(worldYaw),pitchLength=Math.hypot(1,pitch);
  const forward=[sy/pitchLength,pitch/pitchLength,-cy/pitchLength];
  const right=[cy,0,sy];
  const up=[-right[2]*forward[1],right[2]*forward[0]-right[0]*forward[2],right[0]*forward[1]];
  const depth=dx*forward[0]+dy*forward[1]+dz*forward[2];
  if(depth<=.01)return{x:.5,y:.5,depth,visible:false};
  const viewX=(dx*right[0]+dz*right[2])/(depth*.95);
  const viewY=(dx*up[0]+dy*up[1]+dz*up[2])/(depth*.95);
  const aspect=Math.max(.1,(uniforms.sceneW||canvas?.width||1)/(uniforms.sceneH||canvas?.height||1));
  const ndcX=viewX/aspect,ndcY=viewY;
  return{x:(ndcX+1)*.5,y:(1-ndcY)*.5,depth,visible:Math.abs(ndcX)<=1.08&&Math.abs(ndcY)<=1.08};
}
export function r3dSetLookAngles({ yaw: nextYaw = yawTarget, pitch: nextPitch = pitchTarget, immediate = true } = {}) {
  yawTarget = Number.isFinite(Number(nextYaw)) ? Number(nextYaw) : yawTarget;
  pitchTarget = Math.max(-.62, Math.min(.62, Number.isFinite(Number(nextPitch)) ? Number(nextPitch) : pitchTarget));
  facing = ((Math.round(yawTarget / (Math.PI / 2)) % 4) + 4) % 4;
  if (immediate) { yaw = yawTarget; pitch = pitchTarget; }
  r3dResetVfdMemory();
  return { yaw: yawTarget, pitch: pitchTarget, facing };
}
// Put the head back level. Windowed play could leave pitch parked near its
// upper clamp — you spend the whole session looking at the ceiling — because
// nothing ever recentred it after focus was lost and regained.
export function r3dRecenterLook({ pitch: resetPitch = true, yaw: resetYaw = false, immediate = true } = {}) {
  if (resetPitch) pitchTarget = 0;
  if (resetYaw) { const q = Math.PI / 2; const k = Math.round(yawTarget / q); facing = ((k % 4) + 4) % 4; yawTarget = k * q; }
  if (immediate) {
    if (resetPitch) pitch = pitchTarget;
    if (resetYaw) yaw = yawTarget;
  }
  r3dResetVfdMemory();
  return { yaw: yawTarget, pitch: pitchTarget, facing };
}
export function r3dDelta(sign) {
  const v = [[0, -1], [1, 0], [0, 1], [-1, 0]][facing];
  return [v[0] * sign, v[1] * sign];
}
// The direction the FEET go, from where the HEAD is actually pointed.
//
// `facing` is a quarter-turn index, so anything built on r3dDelta walked due
// north while you were looking north-east: the body refusing to follow the eyes.
// This reads the continuous yaw and snaps it to eight directions instead of
// four, which is as free as movement can be while collision is still resolved
// one grid cell at a time (see the diagonal guard in main.js step()).
const STEP_RING = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
export function r3dStepDelta(sign = 1) {
  const eighth = Math.PI / 4;
  const k = ((Math.round(yawTarget / eighth) % 8) + 8) % 8;
  const v = STEP_RING[k];
  return [v[0] * sign, v[1] * sign];
}
export function r3dFacing() { return facing; }
// Corridors are two cells wide, so an arbitrary spawn facing can put a wall
// both ahead of you and behind you — which reads exactly like broken arrow keys.
export function r3dSetFacing(f) {
  facing = ((f % 4) + 4) % 4;
  yaw = yawTarget = facing * Math.PI / 2;
  pitch = pitchTarget = 0;
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
  planHeightOffset = Number(options.heightOffset) || 0;
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

  // RG8, not R8: G carries the baked per-cell ambient (world/floorplan.js
  // bakeAmbientField). It rides here rather than in a texture of its own
  // because MAX_TEXTURE_IMAGE_UNITS is 16 on the target M4 Pro and all 16 are
  // bound — adding a sampler to the scene pass costs one that does not exist.
  // 255/AMBIENT_PLACE_SCALE is the neutral multiplier, so a plan slice with no
  // baked field renders exactly as it did before this existed.
  const mat = material || new Uint8Array(w * h).fill(MATERIAL.serviceConcrete);
  const amb = options.ambient || null;
  const matAmb = new Uint8Array(w * h * 2);
  const neutral = Math.round(255 / AMBIENT_PLACE_SCALE);   // encodes to exactly 1.0
  for (let i = 0; i < w * h; i++) { matAmb[i * 2] = mat[i]; matAmb[i * 2 + 1] = amb ? amb[i] : neutral; }
  planMatAmb = matAmb;
  materialTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, materialTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, w, h, 0, gl.RG, gl.UNSIGNED_BYTE, matAmb);
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
export function r3dSetDiagnosticProps(instances) { P3.setDiagnosticPropInstances(instances); }
export function r3dSetPropDiagnostics(enabled,options=null) { return P3.setPropDiagnostics(enabled,options); }
export function r3dSetEmergencyShadows(instances) { P3.setEmergencyShadowInstances(instances); }
export function r3dSetSourceTextInstances(instances) { P3.setSourceTextInstances(instances); }
export function r3dSetSourceScene(scene = {}) {
  P3.setSourceScene(scene);
  sourceLook = scene.look && typeof scene.look === 'object'
    ? { sunrise: scene.look.sunrise, chroma: scene.look.chroma, paper: scene.look.paper }
    : { sunrise: 0, chroma: 1, paper: 0 };
  sourceWeather = scene.weather && typeof scene.weather === 'object'
    ? { rain: scene.weather.rain, moon: scene.weather.moon, clouds: scene.weather.clouds }
    : { rain: 0, moon: 1, clouds: 1 };
}
export function r3dSetSourceEmergency(value = 0) {
  const strength = value && typeof value === 'object'
    ? (value.enabled === false ? 0 : Number(value.strength ?? 1))
    : Number(value);
  sourceEmergencyStrength = Math.max(0, Math.min(1.5, Number.isFinite(strength) ? strength : 0));
  return sourceEmergencyStrength;
}
export function r3dSetSourceWhiteout(value = 0) {
  sourceWhiteoutStrength = Math.max(0, Math.min(1, Number(value) || 0));
  return sourceWhiteoutStrength;
}
export function r3dSetHushProp(id) { P3.setHushProp(id); }
export function r3dPropStats() { return P3.propPackStats(); }
export function r3dPropInstanceIds() { return P3.propInstanceIds(); }

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
    // The texture is RG8 now, so this cannot upload RED — the format has to
    // match the internal format's base format or the call throws. Patching from
    // the retained packed buffer also keeps the baked ambient in G intact: a
    // mutation moves a wall, it does not relight the building.
    const mats = new Uint8Array(w * h * 2);
    for (let ry = 0; ry < h; ry++) {
      for (let rx = 0; rx < w; rx++) {
        const src = (y + ry) * planW + x + rx, dst = (ry * w + rx) * 2;
        mats[dst] = material[src];
        mats[dst + 1] = planMatAmb ? planMatAmb[src * 2 + 1] : Math.round(255 / AMBIENT_PLACE_SCALE);
        if (planMatAmb) planMatAmb[src * 2] = material[src];
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, materialTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RG, gl.UNSIGNED_BYTE, mats);
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
//          hush:{x,y,strength}|null, dockHauntingFade:0..1, audio:0..1 }
export function r3dFrame(state) {
  if (!gl) return;
  lastBeacons = { key: state.key || null, door: state.door || null };
  const now = performance.now() / 1000;
  const dt = Math.min(0.1, now - (lastT || now));
  lastT = now;
  // Spend a slice of this frame on any engraving still owed. Doing it before
  // the scene keeps the cost inside the frame's own budget rather than landing
  // on top of an already-long one.
  //
  // NOT IN THE BRANCHES THAT NEVER DRAW THE BUILDING. main.js already drains
  // once per frame outside the world guard, so banks keep streaming through the
  // credits and the menu; this second drain exists to put the cost in the frame
  // that spends it. But the horizon and the text space both return before the
  // march below and neither ever samples surfMarkTex — so out there this was a
  // whole second budget spent engraving something nobody is looking at.
  //
  // Two drains, two budgets, one frame, and the budget is checked AFTER a tile
  // rather than before: a ~6ms tile does not trip an 8ms check, so each call can
  // run to ~12ms and the pair to ~24ms. That is the frame, not a slice of it.
  if (!state.textSpace && !horizonState.active) drainMarkQueue();

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
  planYawTarget = Number(state.yawOffset) || 0;
  // Shortest way round, so crossing the atan2 branch does not spin the camera.
  const planYawDelta = Math.atan2(Math.sin(planYawTarget - planYaw), Math.cos(planYawTarget - planYaw));
  planYaw += planYawDelta * (1 - Math.exp(-dt * 9));
  const worldYaw = yaw + planYaw;
  // LEANING OUT OF COVER MOVES THE EYE AND NOTHING ELSE.
  //
  // It goes in here, after the camera has been placed from state.px/py and after
  // the VFD travel above has been measured off the BODY. Doing it in main.js by
  // shifting the rendered point instead would be quietly wrong: that same point
  // keys the render-slice cache and the prop-group rebuild, and feeds the audio
  // listener, so a man leaning his head would reload the world and walk his own
  // ears across the room.
  //
  // The offset is along the camera's own right vector — the same `rgt` the march
  // builds at vec3(cos yaw, 0, sin yaw) — so it propagates for free to the
  // raymarch, the prop and shadow passes, pixel-mesh, and r3dProjectWorld, which
  // is why world-anchored HUD tracks the lean without being told.
  const leanGoal = Number(state.lean) || 0;
  leanEase += (leanGoal - leanEase) * (1 - Math.exp(-dt * 11));
  if (leanEase) {
    camX += leanEase * Math.cos(worldYaw);
    camZ += leanEase * Math.sin(worldYaw);
  }
  pitch += (pitchTarget - pitch) * (1 - Math.exp(-dt * 14));
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
  const torch=state.torchLook||{};
  const torchPower=lightEase*Math.max(0,Math.min(1,Number(torch.power??1)||0));
  const sourceTorchMode=torch.sourceTorchMode==='xray'?1:torch.sourceTorchMode==='emergency'?2:0;
  const torchColor=Array.isArray(torch.color)?torch.color:[1,.94,.82];
  const torchReach=Math.max(.35,Math.min(1.1,Number(torch.reach)||1));
  const torchConeInner=Math.max(.72,Math.min(.94,Number(torch.coneInner)||.88));
  const torchConeOuter=Math.max(torchConeInner+.015,Math.min(.98,Number(torch.coneOuter)||.94));
  const torchSpill=Math.max(0,Math.min(.12,Number(torch.spill??.05)||0));
  const opticalEffects=visualEffectsEnabled()?1:0;
  const sensoryProfile=String(state.sensoryProfile||'story');
  const hushSense=sensoryProfile==='hush-prowl'?1:sensoryProfile==='hush-listen'?.75:0;
  const frameAmbientColor=hushSense>0?HUSH_AMBIENT_COLOR:lightingAmbientColor;
  const baseAmbientIntensity=hushSense>0?Math.max(lightingAmbientIntensity,.24):lightingAmbientIntensity;
  // Twelve times ambient at full strike. Interiors run .014-.043 and the bay
  // runs .155, so this is the difference between a room you are feeling your
  // way around and one you can read a work order in — for eighty milliseconds.
  const frameAmbientIntensity=baseAmbientIntensity*(1+stormFlash*19);

  // Keep the gameplay presence authoritative while giving only its drawing a
  // short material resolve. Despawn keeps the last world position long enough
  // to dissolve there; it does not retain collision, pursuit or awareness.
  const hushBodyRenderAllowed=state.hushBodyAllowed!==false;
  const incomingHush=hushBodyRenderAllowed&&state.hush&&Number.isFinite(state.hush.x)&&Number.isFinite(state.hush.y)
    ? state.hush
    : null;
  const incomingHushSecondary=hushBodyRenderAllowed&&state.hushSecondary
    &&Number.isFinite(state.hushSecondary.x)&&Number.isFinite(state.hushSecondary.y)
    ?state.hushSecondary:null;
  if(incomingHush){
    hushBodyLast={
      x:Number(incomingHush.x),
      y:Number(incomingHush.y),
      strength:Math.max(0,Math.min(1,Number(incomingHush.strength)||0)),
      heightM:Math.max(1.2,Math.min(2.4,Number(incomingHush.heightM)||1.83)),
      widthM:Math.max(.35,Math.min(1.0,Number(incomingHush.widthM)||.58)),
      glow:Number.isFinite(Number(incomingHush.glow))?Math.max(.4,Math.min(3.2,Number(incomingHush.glow))):null,
      mode:typeof incomingHush.mode==='string'?incomingHush.mode:null,
      floorH:Number.isFinite(Number(incomingHush.floorH))?Number(incomingHush.floorH):0,
    };
  }
  if(incomingHushSecondary){
    hushBodySecondaryLast={
      x:Number(incomingHushSecondary.x),
      y:Number(incomingHushSecondary.y),
      strength:Math.max(0,Math.min(1,Number(incomingHushSecondary.strength)||0)),
      heightM:Math.max(1.2,Math.min(2.4,Number(incomingHushSecondary.heightM)||1.83)),
      widthM:Math.max(.35,Math.min(1.0,Number(incomingHushSecondary.widthM)||.58)),
      glow:Number.isFinite(Number(incomingHushSecondary.glow))?Math.max(.4,Math.min(3.2,Number(incomingHushSecondary.glow))):null,
      mode:typeof incomingHushSecondary.mode==='string'?incomingHushSecondary.mode:null,
    };
  }
  const surfacesTarget=(surfAlbedoTex&&surfNormalTex&&surfMaterialTex)?1:0;
  // Slower than the hush body on the way in: this is a whole building's worth of
  // surface changing, and it should read as the light finding the material, not
  // as a cut. Instant on the way out, because losing the textures is a fault.
  surfacesManifestation+= surfacesTarget
    ? (surfacesTarget-surfacesManifestation)*(1-Math.exp(-dt*1.35))
    : (surfacesTarget-surfacesManifestation);
  if(Math.abs(surfacesTarget-surfacesManifestation)<.002)surfacesManifestation=surfacesTarget;
  const hushBodyTarget=incomingHush?1:0;
  const hushBodySecondaryTarget=incomingHushSecondary?1:0;
  const hushBodyRate=hushBodyTarget?7.2:4.0;
  const hushBodySecondaryRate=hushBodySecondaryTarget?5.4:4.0;
  hushBodyManifestation+=(hushBodyTarget-hushBodyManifestation)*(1-Math.exp(-dt*hushBodyRate));
  hushBodySecondaryManifestation+=(hushBodySecondaryTarget-hushBodySecondaryManifestation)*(1-Math.exp(-dt*hushBodySecondaryRate));
  if(Math.abs(hushBodyTarget-hushBodyManifestation)<.002)hushBodyManifestation=hushBodyTarget;
  if(Math.abs(hushBodySecondaryTarget-hushBodySecondaryManifestation)<.002)hushBodySecondaryManifestation=hushBodySecondaryTarget;

  gl.disable(gl.DEPTH_TEST);
  textSpaceActive = !!state.textSpace;

  // PAST THE PERIMETER. Its own branch, before the text space and before the
  // march, for the same reason the text space has one: nothing out there is made
  // of the building. No reaction-diffusion, no water, no props, no marks, no
  // VFD — a splat cloud in a void, in colour, and then straight to the screen.
  if (horizonState.active) {
    drawHorizon(now);
    return;
  }

  if (textSpaceActive) {
    P3.renderPropPass({
      camX: camX * CELL, camY: camY * CELL, camZ: camZ * CELL,
      yaw: worldYaw, pitch, light: torchPower, fogTexture, fogOrigin, fogSize: FOG_TEX,
      timeSec:now,reducedMotion:pixelMeshSettings.reduceMotion,
      cellMeters: CELL, zoneTints: ZONE_TINTS,
      localLightCount, localLightPositions, localLightColors, localLightPenetrations, localLightEmergency,
      localShadowIndex,shadowLight:localShadowLight,
      torch:{power:torchPower,color:torchColor,reach:torchReach,coneInner:torchConeInner,coneOuter:torchConeOuter,spill:torchSpill},
      ambientColor:lightingAmbientColor,ambientIntensity:lightingAmbientIntensity,
      planTexture,planSize:[planW,planH],planOrigin:[planOriginX,planOriginY],
    });
    drawTextSpace(P3.propTargets().color,now,{torchPower,sourceTorchMode});
    return;
  }

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
    yaw: worldYaw, pitch, light: torchPower, fogTexture, fogOrigin, fogSize:FOG_TEX,
    timeSec:now,reducedMotion:pixelMeshSettings.reduceMotion,
    cellMeters:CELL, zoneTints:ZONE_TINTS,
    localLightCount,localLightPositions,localLightColors,localLightPenetrations,localLightEmergency,
    localShadowIndex,shadowLight:localShadowLight,
    torch:{power:torchPower,color:torchColor,reach:torchReach,coneInner:torchConeInner,coneOuter:torchConeOuter,spill:torchSpill},
    ambientColor:frameAmbientColor,ambientIntensity:frameAmbientIntensity,
    planTexture,planSize:[planW,planH],planOrigin:[planOriginX,planOriginY],
  });

  // march into low-res scene buffer
  gl.useProgram(progMarch);
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
  gl.viewport(0, 0, uniforms.sceneW, uniforms.sceneH);
  const U = (n) => {if(!marchUniformCache.has(n))marchUniformCache.set(n,gl.getUniformLocation(progMarch,n));return marchUniformCache.get(n);};
  gl.uniform2f(U('uRes'), uniforms.sceneW, uniforms.sceneH);
  gl.uniform1f(U('uTime'), now);
  gl.uniform3f(U('uCam'), camX, camY, camZ);
  gl.uniform1f(U('uYaw'), worldYaw);
  gl.uniform1f(U('uPitch'), pitch);
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
  gl.uniform1f(U('uLight'), torchPower);
  gl.uniform3fv(U('uTorchColor'),torchColor);
  gl.uniform1f(U('uTorchReach'),torchReach);
  gl.uniform2f(U('uTorchCone'),torchConeInner,torchConeOuter);
  gl.uniform1f(U('uTorchSpill'),torchSpill);
  gl.uniform3fv(U('uAmbientColor'),frameAmbientColor);
  gl.uniform1f(U('uAmbientIntensity'),frameAmbientIntensity);
  gl.uniform1f(U('uAmbientFloor'),ambientFloor);
  gl.uniform1f(U('uAmbientPlace'),ambientPlace);
  gl.uniform3fv(U('uBounceColor'),lightingBounceColor);
  gl.uniform1f(U('uBounceIntensity'),lightingBounceIntensity*bounceAmount);
  gl.uniform1f(U('uBounceLampGain'),bounceLampGain);
  gl.uniform1f(U('uRainAmount'),rainAmount);
  gl.uniform1f(U('uRainIndoor'),indoorRain);
  gl.uniform1f(U('uNightSeed'),nightSeed);
  gl.uniform1f(U('uEndingWorldLook'),endingWorldLook);
  gl.uniform1f(U('uHushSense'),hushSense);
  gl.uniform1f(U('uOpticalEffects'),opticalEffects);
  gl.uniform1f(U('uReduceMotionOptical'),pixelMeshSettings.reduceMotion?1:0);
  gl.uniform1f(U('uDockHauntingFade'),Math.max(0,Math.min(.995,Number(state.dockHauntingFade)||0)));
  gl.uniform1i(U('uLocalLightCount'),localLightCount);
  gl.uniform1i(U('uLocalShadowIndex'),localShadowIndex);
  gl.uniform4fv(U('uLocalLightPos[0]'),localLightPositions);
  gl.uniform4fv(U('uLocalLightColor[0]'),localLightColors);
  gl.uniform1fv(U('uLocalLightPenetration[0]'),localLightPenetrations);
  gl.uniform1fv(U('uLocalLightEmergency[0]'),localLightEmergency);
  gl.uniform1f(U('uUsePlan'), state.plan ? 1 : 0);
  gl.uniform1f(U('uPlanHeightOffset'), planHeightOffset);
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
  // WebGL2 only guarantees sixteen fragment samplers and this pass already
  // uses them all. Source Space suppresses building actors, so its corpus atlas
  // and the HUSH SDF safely share unit 13 without ever being sampled together.
  const hushBodyTextureActive=hushBodyRenderAllowed&&hushBodyReady
    &&(hushBodyManifestation>.001||hushBodySecondaryManifestation>.001)&&hushBodyMode!=='off';
  const unit13Texture=hushBodyTextureActive?hushBodyTex:sourceSurfaceTexture;
  gl.uniform1f(U('uSourceReady'),sourceSurfaceTexture&&!hushBodyTextureActive?1:0);
  gl.activeTexture(gl.TEXTURE13);gl.bindTexture(gl.TEXTURE_2D,unit13Texture);gl.uniform1i(U('uSourceSurface'),13);gl.uniform1i(U('uHushBodyTex'),13);
  gl.activeTexture(gl.TEXTURE14);gl.bindTexture(gl.TEXTURE_2D,sourceLayerTexture);gl.uniform1i(U('uSourceLayer'),14);
  const propTargets=P3.propTargets();
  gl.uniform1f(U('uPropsReady'),propTargets.ready?1:0);
  gl.uniform1f(U('uPropNear'),propTargets.near);
  gl.uniform1f(U('uPropFar'),propTargets.far);
  gl.uniform1f(U('uPropShadowReady'),propTargets.shadowReady?1:0);
  gl.uniformMatrix4fv(U('uPropShadowMatrix'),false,propTargets.shadowMatrix);
  gl.uniform2fv(U('uPropShadowTexel'),propTargets.shadowTexel);
  gl.activeTexture(gl.TEXTURE15);gl.bindTexture(gl.TEXTURE_2D,propTargets.shadow);gl.uniform1i(U('uPropShadow'),15);
  if(propTargets.ready){
    gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,propTargets.color);gl.uniform1i(U('uPropColor'),4);
    gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,propTargets.depth);gl.uniform1i(U('uPropDepth'),5);
  }
  gl.activeTexture(gl.TEXTURE12);gl.bindTexture(gl.TEXTURE_2D,waterTex || waterTexA);gl.uniform1i(U('uWaterHeight'),12);
  const water=state.water||{};
  const bounds=water.basinBounds||{};
  gl.uniform4f(U('uWaterBounds'), bounds.minX||0, bounds.minY||0, bounds.maxX||0, bounds.maxY||0);
  gl.uniform4f(U('uWaterParams'), water.active?1:0, Number(water.levelM ?? -0.06), Number(water.murk ?? 0.85), water.reduceMotion?1:0);
  gl.uniform4f(U('uWaterCamera'), water.cameraSubmerged?1:0, Number(water.submersionDepthM)||0, water.soaked?1:0, 0);
  const look=currentLook();
  const bankBlend=surfaceDreamBlend();
  gl.uniform1f(U('uSurfacesReady'),surfacesManifestation);
  if(surfAlbedoTex&&surfNormalTex&&surfMaterialTex){
    gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D_ARRAY,surfAlbedoTex);gl.uniform1i(U('uSurfAlbedo'),6);
    gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D_ARRAY,surfNormalTex);gl.uniform1i(U('uSurfNormal'),7);
    gl.activeTexture(gl.TEXTURE8);gl.bindTexture(gl.TEXTURE_2D_ARRAY,surfMaterialTex);gl.uniform1i(U('uSurfMaterial'),8);
    gl.activeTexture(gl.TEXTURE9);gl.bindTexture(gl.TEXTURE_2D_ARRAY,surfDreamTex);gl.uniform1i(U('uSurfDream'),9);
    gl.activeTexture(gl.TEXTURE11);gl.bindTexture(gl.TEXTURE_2D_ARRAY,surfDreamStageTex);gl.uniform1i(U('uSurfDreamNext'),11);
    // Unit 10, freed by packing roughness and relief into one array.
    gl.activeTexture(gl.TEXTURE10);gl.bindTexture(gl.TEXTURE_2D_ARRAY,surfMarkTex);gl.uniform1i(U('uSurfMarks'),10);
    gl.uniform1f(U('uMarkStride'),MAX_DREAM_FRAMES);
    gl.uniform1f(U('uMarksLiveBase'),markLiveBase);
    gl.uniform1f(U('uMarksStageBase'),markLiveBase?0:MARK_HALF_LAYERS);
    gl.uniform1fv(U('uMarksReady[0]'),markReadyUniform(markReady,surfDreamFrames,markFadeStartLive));
    gl.uniform1fv(U('uMarksReadyNext[0]'),markReadyUniform(markStageReady,surfDreamStageFrames,markFadeStartStage));
  }
  gl.uniform1f(U('uDreamReady'),surfDreamReady&&surfDreamMix.some((v)=>v>0)?1:0);
  gl.uniform1f(U('uDreamNextReady'),surfDreamNextReady?1:0);
  gl.uniform1f(U('uDreamBankBlend'),bankBlend);
  gl.uniform1f(U('uDreamDetailGain'),look.material.detailGain);
  gl.uniform1f(U('uDreamChromaDrift'),look.material.chromaDrift);
  gl.uniform1f(U('uDreamFramesA'),surfDreamFrames);
  gl.uniform1f(U('uDreamFramesB'),surfDreamStageFrames);
  gl.uniform1f(U('uBoilHz'),look.material.boilHz??0);
  gl.uniform1f(U('uDreamStructureMix'),look.material.structureMix??0);
  gl.uniform1f(U('uDreamLumaLo'),look.material.lumaClampLo??.62);
  gl.uniform1f(U('uDreamLumaHi'),look.material.lumaClampHi??1.48);
  gl.uniform1f(U('uDreamLumaHold'),look.material.lumaHold??1);
  gl.uniform1f(U('uAgitation'),dreamAgitation);
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
  gl.uniform4f(U('uHush'), state.hush?.x ?? 0, state.hush?.y ?? 0, state.hush?.strength ?? 0, state.hush?.radiusM ?? 0);
  const hushBodyModeIndex=Math.max(0,HUSH_BODY_MODES.indexOf(hushBodyMode));
  const hushBodyLastMode=HUSH_BODY_MODES.includes(hushBodyLast.mode)?HUSH_BODY_MODES.indexOf(hushBodyLast.mode):hushBodyModeIndex;
  const hushBodySecondaryMode=HUSH_BODY_MODES.includes(hushBodySecondaryLast.mode)?HUSH_BODY_MODES.indexOf(hushBodySecondaryLast.mode):hushBodyModeIndex;
  gl.uniform4f(U('uHushBody'),hushBodyLast.x,hushBodyLast.y,hushBodyRenderAllowed?hushBodyManifestation:0,hushBodyTextureActive?1:0);
  gl.uniform4f(U('uHushBodyLook'),hushBodyLast.heightM,hushBodyLast.widthM,
    hushBodyLast.glow??(.88+hushBodyLast.strength*.22),hushBodyLastMode);
  gl.uniform4f(U('uHushBodySecondary'),hushBodySecondaryLast.x,hushBodySecondaryLast.y,
    hushBodyRenderAllowed?hushBodySecondaryManifestation:0,hushBodyTextureActive?1:0);
  gl.uniform4f(U('uHushBodyLookSecondary'),hushBodySecondaryLast.heightM,hushBodySecondaryLast.widthM,
    hushBodySecondaryLast.glow??(.88+hushBodySecondaryLast.strength*.22),hushBodySecondaryMode);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  const pixelSourceTex = runPixelMeshPass(state, now);
  const faultedSourceTex = runSourceFaultPass(pixelSourceTex,now);
  const postSourceTex = runDatamoshPass(faultedSourceTex,now);

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
  gl.uniform1f(postU('uRecordingPostGrain'), postLook.recording.postGrain);
  gl.uniform1f(postU('uRecordingLumaGrain'), postLook.recording.lumaGrain);
  gl.uniform1f(postU('uRecordingTemporalHz'), postLook.recording.temporalHz);
  gl.uniform1f(postU('uRecordingTemporalSmear'), postLook.recording.temporalSmear);
  gl.uniform1f(postU('uReduceFlash'), pixelMeshSettings.reduceFlash?1:0);
  gl.uniform1f(postU('uReduceMotion'), pixelMeshSettings.reduceMotion?1:0);
  gl.uniform1f(postU('uSourceEmergency'),sourceEmergencyStrength);
  gl.uniform1f(postU('uSourceWhiteout'),sourceWhiteoutStrength);
  gl.uniform1f(postU('uSourceTorchMode'),sourceTorchMode);
  gl.uniform1f(postU('uSourceTorchPower'),torchPower);
  gl.uniform1f(postU('uFrontEndAmount'),frontEndPlate.amount);
  gl.uniform1f(postU('uFrontEndDetailRetention'),frontEndPlate.detailRetention);
  gl.uniform1f(postU('uFrontEndChromaRetention'),frontEndPlate.chromaRetention);
  gl.uniform1f(postU('uFrontEndExposureStops'),frontEndPlate.exposureStops);
  gl.uniform1f(postU('uFrontEndShoulder'),frontEndPlate.shoulder);
  gl.uniform1f(postU('uFrontEndToe'),frontEndPlate.toe);
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
// The scene as the model will see it. Read back at burst resolution only while
// a possession is running — never per frame — because readPixels is a stall.
let burstCapCanvas=null,burstCapCtx=null,burstCapPix=null,burstCapImg=null,burstCapSize=0;
export function r3dCaptureSceneCanvas(size=384){
  if(!gl||!sceneTex||!sceneFbo)return null;
  if(burstCapSize!==size){
    burstCapCanvas=document.createElement('canvas');
    burstCapCanvas.width=burstCapCanvas.height=size;
    burstCapCtx=burstCapCanvas.getContext('2d');
    burstCapPix=new Uint8Array(size*size*4);
    burstCapImg=burstCapCtx.createImageData(size,size);
    burstCapSize=size;
  }
  // Downsample through the post program into the burst target, then read that:
  // the scene FBO is larger than the model wants and reading it whole costs
  // more than the inference does.
  gl.bindFramebuffer(gl.FRAMEBUFFER,burstOutFbo);
  gl.viewport(0,0,uniforms.sceneW,uniforms.sceneH);
  gl.useProgram(progPost);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,sceneTex);gl.uniform1i(postU('uSrc'),0);
  gl.uniform2f(postU('uRes'),uniforms.sceneW,uniforms.sceneH);
  gl.drawArrays(gl.TRIANGLES,0,3);
  const sx=Math.max(0,Math.floor((uniforms.sceneW-Math.min(uniforms.sceneW,uniforms.sceneH))/2));
  const sy=Math.max(0,Math.floor((uniforms.sceneH-Math.min(uniforms.sceneW,uniforms.sceneH))/2));
  const side=Math.min(uniforms.sceneW,uniforms.sceneH);
  const raw=new Uint8Array(side*side*4);
  gl.readPixels(sx,sy,side,side,gl.RGBA,gl.UNSIGNED_BYTE,raw);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  // GL is bottom-up; a canvas is top-down. Flip while scaling to the model size.
  const tmp=document.createElement('canvas');tmp.width=tmp.height=side;
  const tmpCtx=tmp.getContext('2d');
  const tmpImg=tmpCtx.createImageData(side,side);
  const row=side*4;
  for(let y=0;y<side;y++){
    const s=(side-1-y)*row,d=y*row;
    tmpImg.data.set(raw.subarray(s,s+row),d);
  }
  tmpCtx.putImageData(tmpImg,0,0);
  burstCapCtx.drawImage(tmp,0,0,side,side,0,0,size,size);
  return burstCapCanvas;
}
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
