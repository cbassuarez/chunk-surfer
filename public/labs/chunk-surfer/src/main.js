// ─────────────────────────────────────────────────────────────────────────────
// CHUNK SURFER — cbassuarez.com · main_b3
// a roguelike audio instrument. walk through the sonic world.
// fog lifts as you explore. the sound changes as you move.
// ─────────────────────────────────────────────────────────────────────────────


// ── M0 module split: config/manifest/analysis extracted; the rest of the
// engine remains here verbatim and will be strangler-extracted per system
// (renderer in M1, scenes/input in M2, battle audio in M3, horror in M4).
import {
  CONCURRENCY, SURF_AT, FADE_SEC, FOG_R, FULL_FIELD_VISIBLE, TRAIL_LEN,
  POLY_MAX, MOVE_MS, RMS_TARGET, ONBOARDING_PHASES, INTRO_SCENE,
  WORLD_BOUNDARY_FRICTION, VOID_TRUDGE, VOID_SINK,
  TERRAIN_R_MIN, TERRAIN_R_MAX, TERRAIN_EMITTERS,
  WORLD_SCALE_X, WORLD_SCALE_Y, CHUNK_MIN_SEP, AUDIO_R, ROOM_TONE,
  WORLD_TILE_SCALE_X, WORLD_TILE_SCALE_Y, WORLD_SPREAD_MIN, WORLD_SPREAD_MAX,
  W_BIOME_SAME, W_BIOME_OTHER, W_BIOME_FOREIGN,
  AMBIENT_DRONE_GAIN, AMBIENT_BIT_LEVELS, AMBIENT_LOOP_SEC, WORLD_LAYER
} from './config.js';
import { MANIFEST, PIECE_CATALOG, files, worldsConfig, SAMPLE_COUNT } from './manifest.js';
import { fft, analyze, biomeFrom } from './audio/analysis.js';
import * as CR from './render/canvas.js';
import * as R3 from './render/r3d.js';
import * as FP from './world/floorplan.js';
import * as scenes from './game/scenes.js';
import { uiInit, uiClear, uiText, uiSize } from './render/ui.js';
import { saveLoad, saveCommit, getSave, newGame, hasSave, metaCommit } from './game/save.js';
import { flagApply, flagTest } from './game/flags.js';
import { dialogueInit, loadScript, startDialogue } from './game/dialogue.js';
import { makeTitleScene } from './game/title.js';
import { makeMenuScene } from './game/menu.js';
import { terrorInit, once, interpolate } from './game/terror.js';
import { dialogue as PROLOGUE_DIALOGUE } from './data/prologue.js';
import * as REC from './game/recordist.js';
import * as RT from './audio/roomtone.js';
import * as PRES from './game/presence.js';
import * as CUES from './audio/cues.js';
import * as STAB from './game/stabs.js';
import * as OBJ from './game/objectives.js';
import { drawMinimap } from './render/minimap.js';
import { roomLabel, roomToneCharacter } from './audio/manifest-map.js';
export { fx } from './render/canvas.js';

// M1: canvas glyph renderer is the default; `?renderer=dom` keeps the legacy
// innerHTML path during the parity window (removed in M2).
// M1b: `?renderer=3d` = first-person raymarched world (diffusion-lens base).
const KEY_DEBUG = new URLSearchParams(location.search).has('keydebug');
const RENDERER = (() => {
  const q = new URLSearchParams(location.search).get('renderer');
  return q === 'dom' ? 'dom' : q === '3d' ? '3d' : 'canvas';
})();

// ── State ─────────────────────────────────────────────────────────────────────
let actx=null;
let voices=new Map(); // chunkIdx -> {src,gain,dur,startedAt,target}
let ambientDrone=null; // {src,lfo,filt,gain,target}
let worldLayerVoice=null; // {srcA,srcB,gain,dur,startedAt,target,chunkIdx,worldId}
let worldDroneBanks=new Map(); // worldId -> {all:[chunkIdx], byBiome:{biome:[chunkIdx]}}
let paused=false, looping=true;
let inRogue=false, raf=null, tick=0;
let bootLog=[];
let chunks=[]; // {idx,label,charId,name,buffer,analysis,biome,worldId,biomeId,terrainRadius,baseVol,wx,wy,heard}
let worlds=[]; // template metadata by world id
let worldTemplates=new Map(); // worldId -> {id,label,width,height,terrain,sampleIdxs,region,biomes}
// idx (file index) -> chunk. `chunks` is in LOAD order, so chunkAt(idx) is only
// valid once all 300 files are in. Early callers (enterRogue fires at 14) were
// reading undefined and taking the world build down with them.
let chunkByIdx=new Map();
const chunkAt=(i)=>chunkByIdx.get(i);
let keysDown=new Set();
let moveTimer=null;

// world grid
let WORLD_TILE_W=0, WORLD_TILE_H=0;
let VIEW_W=0, VIEW_H=0;
let fog=new Map();   // Map<"x,y", 1|2>
let px=0, py=0;      // player world pos
let curChunkKey='';  // instance key ("tx,ty:chunkIdx") of currently loudest chunk
let curChunkIdx=-1;  // chunk index for status text/icon
let curPlayerCtx=null; // {onTerrain,biomeId,worldId,worldMembership}
let stepCount=0, seenCount=0;
let trail=[];        // [{x,y}] recent steps
let eventQueue=[];   // messages to show
let weirdShown=new Set();
let showCatalog=false;
let onboardingPhase=ONBOARDING_PHASES.INTRO_PRELUDE;
let introAnchorX=0;
let introAnchorY=0;
let introDistance=0;
let introTitleEl=null;
let voidFatigue=0;             // 0..1, increases while trudging wilderness
let worldBoundaryLatch=false;   // hysteresis latch for seam resistance
let worldBoundaryFriction=0;    // 0..1 smoothed seam resistance
let lastMoveAtMs=0;            // throttles tap/hold movement uniformly
let lastStepDx=0;
let lastStepDy=0;
let allFilesLoaded=false;
let lastVoidSinkMsgStep=-9999;
let gateFlashTimer=null;
let gateFlashUntilMs=0;
let keyMap=new Map();   // "x,y" -> {x,y}; holds at most one active key at a time
let keysTotal=0;
let keysFound=0;
let door=null;          // {x,y} once spawned (after final key)
let nextSpawnAt=0;      // ms timestamp for next scheduled key spawn (0 = none)
let depth=0;            // 0 = overworld; each door descent increments by 1
let onboardingHoldLastMs=0;
let subWorld1Start={x:0,y:0};
let subWorld2Start={x:0,y:0};
let subWorld2HasKeys=false;

const HORROR_SEQUENCE = {
  OFF: 'off',
  HORROR_ONSET: 'horror_onset',
  CHASE_PRESSURE: 'chase_pressure',
  DOOR_SWARM: 'statue_corridor',
  DESCENT_RUPTURE: 'descent_rupture',
};
const HUSH_TUNE = {
  chaseSpeedRatio: 0.85,
  surgeMinRatio: 1.12,
  surgeMaxRatio: 1.82,
  catchDistance: 0.78,
  onsetMs: 1100,
  maxEyes: 56,
};
const SW2_PHASE = {
  OFF: 'off',
  BOOT_SILENCE: 'sw2_boot_silence',
  AREA_LOOP: 'sw2_area_loop',
  FINAL_DARK: 'sw2_final_dark',
  POST_DOOR: 'sw2_post_door',
};
const SW2_TUNE = {
  bootSilenceMs: 2000,
  areaCount: 3,
  areaDist: 16,
  areaEnterRadius: 8,
  grabMinRadius: 1.8,
  grabMaxRadius: 3.8,
  killRadiusBase: 1.05,
  killRadiusFailStep: 0.18,
  hubDepositRadius: 2.2,
  approachFreshMs: 320,
  revealMs: 2200,
  darknessStep: 0.15,
  darknessMax: 0.9,
  finalDoorDist: 22,
  finalCatchRadius: 1.2,
  finalDriftSpeed: 0.34,
  finalLossCooldownMs: 1400,
  finalVisionRadius: 26,
  debugFastAreas: 2,
  punctuationMinMs: 1400,
  punctuationMaxMs: 2600,
};
const SW2_AUDIO_URL = '/labs/chunk-surfer/audio/hapax-recording.mp3';
let horrorPhase=HORROR_SEQUENCE.OFF;
let horrorStartMs=0;
let horrorLastTickMs=0;
let hush={
  active:false,
  x:0,
  y:0,
  vx:0,
  vy:0,
};
let hushEyes=[]; // [{x,y,phase,lastPingAt,nextPingAt}]
let hushPingHeat=0;
let lastHushEventMs=0;
let nextDoorSwarmPulseMs=0;
let doorSwarmStartMs=0;
let doorSwarmArmMs=0;
let doorSwarmRadius=0;
let doorSwarmCenter=null;
let hushHitTimer=null;
let hushJumpTimer=null;
let hushPunishLockUntilMs=0;
let doorRevealCutscene=false;
let doorRevealStartedMs=0;
let doorRevealEndsMs=0;
let doorRevealTriggered=false;
let doorRevealHushTarget=null;
let hushLockedUntilMs=0;
let hushLastDist=Infinity;
let hushLastAdvanceTowardMs=0;
let hushLastRetreatMs=0;
let hushBlinkActive=false;
let hushBlinkEndsMs=0;
let hushBlinkNextAtMs=0;
let hushBlinkStress=0;
let hushBlinkNextLurchMs=0;
let hushBlinkLurchesRemaining=0;
let corridorStatues=[]; // [{t,side,wobble,pulse,x,y,lurch}]
let sw2={
  active:false,
  phase:SW2_PHASE.OFF,
  phaseStartedMs:0,
  startedAtMs:0,
  hubX:0,
  hubY:0,
  areas:[],
  currentAreaIdx:0,
  heldItem:false,
  heldFromArea:-1,
  completedCount:0,
  failCount:0,
  darkness:0,
  doorActive:false,
  doorX:0,
  doorY:0,
  doorArmedAt:0,
  firstLineShown:false,
  finalLineShown:false,
  punctuationAtMs:0,
  caught:false,
  driverEnergy:0,
  lastLossMs:0,
  charge:0,
};
let sw2Audio={
  loaded:false,
  loading:false,
  buffer:null,
  envelope:null,
  bedSrc:null,
  bedGain:null,
  stretchSrc:null,
  stretchGain:null,
  startedAt:0,
  drive:0,
  paulMix:0,
  punctAtMs:0,
};

const WEIRD=[
  [50, '// echo detected in the distance.'],
  [120,'// drift. not sure where centre is anymore.'],
  [250,'// repetition is a form of change.'],
  [400,'// you have been walking for a long time.'],
  [600,'// honor thy error as a hidden intention.'],
  [900,'// is there something missing?'],
];

// ── Single-char IDs for chunks (1-9, A-Z, a-z, then symbols) ─────────────────
function makeCharId(n) {
  if (n<9)  return String(n+1);
  if (n<35) return String.fromCharCode(65+n-9);
  if (n<61) return String.fromCharCode(97+n-35);
  return '!?&#'[n-61]||'#';
}

// ── Audio ─────────────────────────────────────────────────────────────────────
let master=null;
let audioInitFailed=false;
function ensureCtx(){
  if(audioInitFailed) return;
  if(!actx){
    try{
      actx=new(window.AudioContext||window.webkitAudioContext)();
      // Bus chain: light glue compressor → brick-wall safety limiter.
      // Glue stage only catches the loudest peaks (high threshold, gentle
      // ratio, slow attack) so the proximity dynamic range survives — close
      // chunks should genuinely be louder than far ones. The limiter behind
      // it handles anything that would otherwise clip the DAC.
      master=actx.createDynamicsCompressor();
      master.threshold.setValueAtTime(-6, actx.currentTime);
      master.knee.setValueAtTime(8, actx.currentTime);
      master.ratio.setValueAtTime(2, actx.currentTime);
      master.attack.setValueAtTime(0.030, actx.currentTime);
      master.release.setValueAtTime(0.25, actx.currentTime);
      const limiter=actx.createDynamicsCompressor();
      limiter.threshold.setValueAtTime(-1.5, actx.currentTime);
      limiter.knee.setValueAtTime(0, actx.currentTime);
      limiter.ratio.setValueAtTime(20, actx.currentTime);
      limiter.attack.setValueAtTime(0.001, actx.currentTime);
      limiter.release.setValueAtTime(0.06, actx.currentTime);
      master.connect(limiter);
      limiter.connect(actx.destination);
      RT.roomToneInit(actx, master);
      // Cues bypass the proximity mix: a switch is always as loud as a switch.
      CUES.cuesInit(actx, limiter);
      CUES.preloadAll(Object.values(CUES.CUE));
    }catch(err){
      audioInitFailed=true;
      console.error('AudioContext init failed', err);
      return;
    }
  }
  if(actx && actx.state==='suspended'){
    actx.resume().catch((err)=>{
      console.warn('AudioContext resume blocked', err);
    });
  }
}
// Per-chunk baseline volume from analysis — quiet chunks (low RMS) get a boost,
// loud percussive ones get a slight cut, so the polyphonic mix stays balanced.
function baseVolFor(analysis){
  const rms=Math.max(0.01, analysis?.rms||RMS_TARGET);
  return Math.max(0.35, Math.min(1.4, RMS_TARGET/rms));
}
function killNode(s,g){
  try{s&&s.stop();}catch(_){}
  try{s&&s.disconnect();}catch(_){}
  try{g&&g.disconnect();}catch(_){}
}
// Bake a sin envelope into the first/last `fadeMs` of the buffer so that
// data[0] and data[N-1] are both ~0 — native looping then transitions
// silent → silent with no discontinuity, no pop. The same envelope is
// mirrored on both ends (NOT sin/cos): the cos pairing was needed by the
// retired dual-source crossfade design, but for a single looping source it
// left data[N-1] at full amplitude, which clicked on every loop.
function smoothBufferLoop(buffer, fadeMs=60){
  const sr=buffer.sampleRate;
  const N=buffer.length;
  const fadeSamples=Math.min(Math.floor(fadeMs*sr/1000), Math.floor(N/4));
  if(fadeSamples<=0) return 0;
  for(let ch=0;ch<buffer.numberOfChannels;ch++){
    const data=buffer.getChannelData(ch);
    for(let i=0;i<fadeSamples;i++){
      const env=Math.sin(i/fadeSamples * Math.PI*0.5);  // 0 → 1
      data[i]      *= env;   // fade-in:  data[0] = 0
      data[N-1-i]  *= env;   // fade-out: data[N-1] = 0 (mirrored)
    }
  }
  return fadeSamples/sr;
}
// Proximity weight: exponential decay — peaks sharply at d=0 (the chunk's
// cell), drops dramatically over the next ~12 cells, then leaves a long
// quiet tail audible out to AUDIO_R for navigation/follow-the-sound.
// Half-power at ~8 cells, 1/e at ~12 cells, ~1.5% at 50 cells.
// Story mode replaces the lab's wide, dense field with a monitor you can only
// open by kneeling in the dark. These return the active numbers.
function audioRadius(){
  if(!storyMode) return AUDIO_R;
  return REC.isRecording() ? ROOM_TONE.monitorRadius : 0;
}
function audioPoly(){
  if(!storyMode) return POLY_MAX;
  return REC.isRecording() ? ROOM_TONE.monitorPoly : 0;
}
// The monitor is a microphone in headphones, not an ear in a room: it does not
// obey the body's brutal exp(-d/12) falloff. Distant material stays present and
// quiet, which is what makes a room sound like it contains something.
function monitorProx(d, R){
  if(d>=R) return 0;
  return 0.30 + 0.70*Math.exp(-d/ROOM_TONE.monitorNear);
}
function proxFor(d, R){
  if(d>=R) return 0;
  return Math.exp(-d / 12);
}
// Combined voice gain: proximity × per-chunk baseline × biome × world.
// No terrain gate — proximity alone governs audibility, so wilderness/voids
// still hear nearby chunks bleeding in. World membership and biome weight
// scale contribution but never gate to zero, so blends are smooth.
function voiceGain(chunk, d, ctx, emitterGain=1){
  const monitoring=storyMode && REC.isRecording();
  const prox=monitoring ? monitorProx(d, audioRadius()) : proxFor(d, audioRadius());
  if(prox<=0) return 0;
  const bw=biomeWeightFor(ctx, chunk);
  const ww=Math.max(0.06, ctx.worldMembership[chunk.worldId]??0);
  const monitor=monitoring ? ROOM_TONE.monitorGain : 1;
  return prox*(chunk.baseVol||1)*bw*ww*emitterGain*monitor;
}
// Hierarchical biome weight: same biome > different biome same world > different world.
function biomeWeightFor(ctx, chunk){
  if(ctx.biomeId && chunk.biomeId===ctx.biomeId) return W_BIOME_SAME;
  if(ctx.worldId && chunk.worldId===ctx.worldId) return W_BIOME_OTHER;
  return W_BIOME_FOREIGN;
}
function fogKey(x,y){ return `${x},${y}`; }
function fogGet(x,y){ return fog.get(fogKey(x,y)) || 0; }
function fogSet(x,y,v){ if(v>0) fog.set(fogKey(x,y), v); }
function divFloor(n,d){ return Math.floor(n/d); }
function mod(n,d){ const m=n%d; return m<0?m+d:m; }
const WORLD_VISUALS = {
  main_b3: {
    tintClass: 't-world-main_b3',
    borderClass: 't-world-border-main_b3',
    borderGlyphs: ['=', '-', '/', '|']
  },
  the_tub: {
    tintClass: 't-world-the_tub',
    borderClass: 't-world-border-the_tub',
    borderGlyphs: ['~', ':', '/', '\\']
  },
  amplifications: {
    tintClass: 't-world-amplifications',
    borderClass: 't-world-border-amplifications',
    borderGlyphs: ['+', '*', ':', '!']
  },
  soundnoisemusic: {
    tintClass: 't-world-soundnoisemusic',
    borderClass: 't-world-border-soundnoisemusic',
    borderGlyphs: ['x', '+', ':', ';']
  },
  lux_nova: {
    tintClass: 't-world-lux_nova',
    borderClass: 't-world-border-lux_nova',
    borderGlyphs: ['|', '!', ';', ':']
  }
};
function worldVisual(worldId){ return WORLD_VISUALS[worldId] || WORLD_VISUALS.main_b3; }
function worldClassFor(worldId){ return worldVisual(worldId).tintClass; }
function worldBorderClassFor(worldId){ return worldVisual(worldId).borderClass; }
function worldBorderGlyphFor(worldId, x, y){
  const n = hash01(x*0.91, y*0.73);
  const glyphs = worldVisual(worldId).borderGlyphs || ['|'];
  const idx = n>0.78 ? 0 : n>0.52 ? 1 : n>0.26 ? 2 : 3;
  return glyphs[Math.min(idx, glyphs.length - 1)] || '|';
}
function worldIdForWarpedTile(tx, ty){
  // Keep world routing deterministic and stable across refresh/load phases.
  // Do not tie mapping to currently-loaded templates (that causes remap flicker).
  const ids = worldsConfig.map((w) => w.id);
  if(ids.length===0) return 'main_b3';
  if(ids.length===1) return ids[0];
  if(ids.length===2){
    return (Math.abs(tx)+Math.abs(ty))%2===0 ? ids[0] : ids[1];
  }
  const h = Math.floor(hash01(tx*13.7, ty*91.1) * 1000000);
  return ids[h % ids.length];
}
function worldIdAt(x,y){
  // Domain warp breaks axis-aligned tile edges into jagged procedural borders.
  const warpX = (noise2(x,y,0.006,17) + 0.5*noise2(x,y,0.015,29)) * (WORLD_TILE_W*0.95);
  const warpY = (noise2(x,y,0.007,41) + 0.5*noise2(x,y,0.018,53)) * (WORLD_TILE_H*0.95);
  const wx = x + warpX;
  const wy = y + warpY;
  const tx=divFloor(wx, WORLD_TILE_W);
  const ty=divFloor(wy, WORLD_TILE_H);
  return worldIdForWarpedTile(tx, ty);
}
function tileCoordFor(x,y){
  const tx=divFloor(x, WORLD_TILE_W);
  const ty=divFloor(y, WORLD_TILE_H);
  const lx=mod(x, WORLD_TILE_W);
  const ly=mod(y, WORLD_TILE_H);
  return {tx, ty, lx, ly};
}
function isWorldBoundaryAt(x,y,worldId){
  return worldIdAt(x+1,y)!==worldId ||
         worldIdAt(x-1,y)!==worldId ||
         worldIdAt(x,y+1)!==worldId ||
         worldIdAt(x,y-1)!==worldId;
}
function worldBoundaryDistance(x, y, worldId, maxDist){
  if(!worldId) return maxDist + 1;
  if(isWorldBoundaryAt(x, y, worldId)) return 0;
  for(let r=1; r<=maxDist; r++){
    for(let dx=-r; dx<=r; dx++){
      const dy=r-Math.abs(dx);
      if(worldIdAt(x+dx, y+dy)!==worldId) return r;
      if(dy!==0 && worldIdAt(x+dx, y-dy)!==worldId) return r;
    }
  }
  return maxDist + 1;
}
function getCellAt(x,y){
  // Deeper levels are intentionally void — no chunks, biomes, or world
  // boundaries materialise. Render falls through to fog/empty space.
  if(depth > 0) return null;
  const {tx,ty,lx,ly}=tileCoordFor(x,y);
  const worldId=worldIdAt(x,y);
  const tpl=worldTemplates.get(worldId);
  if(!tpl){
    return {char:'.', colorClass:'t-fog', worldId, biomeId:null, isWilderness:true};
  }
  const base=(tpl.terrain[ly]&&tpl.terrain[ly][lx])?tpl.terrain[ly][lx]:{char:'.',colorClass:'t-fog',isWilderness:true};
  const cell={...base, worldId};
  if(!base?.isChunk && isWorldBoundaryAt(x,y,worldId)){
    return {
      ...cell,
      char: worldBorderGlyphFor(worldId, x, y),
      colorClass: worldBorderClassFor(worldId),
      biomeId: null,
      isBorder: true
    };
  }
  if(base?.isChunk){
    cell.chunkKey=`${tx},${ty}:${base.chunkIdx}`;
  }
  return cell;
}
// Soft world membership: instead of one-hot, sample worldId in a small ring
// around the player and weight by inverse distance. Near a world boundary you
// get a fractional membership that lets foreign-world voices bleed audibly
// instead of cutting at the seam — fixes the "all-one-world" stutter on
// crossings.
const WORLD_MEMBERSHIP_SAMPLES = (() => {
  const out=[{dx:0, dy:0, w:1.0}];
  // Two rings of 8 directions each, weighted inversely with distance.
  const dirs=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  for(const [dx,dy] of dirs){
    out.push({dx:dx*6,  dy:dy*6,  w:0.55});
    out.push({dx:dx*14, dy:dy*14, w:0.22});
  }
  return out;
})();
function worldMembership(x, y){
  const out={};
  for(const w of worldsConfig) out[w.id]=0;
  let total=0;
  for(const s of WORLD_MEMBERSHIP_SAMPLES){
    const wid=worldIdAt(Math.round(x+s.dx), Math.round(y+s.dy));
    if(wid && (wid in out)){
      out[wid]+=s.w;
      total+=s.w;
    }
  }
  if(total>0){
    for(const k in out) out[k]/=total;
  }
  return out;
}
function playerContext(){
  const cell=getCellAt(px, py);
  return {
    onTerrain: !!cell?.biomeId,
    biomeId: cell?.biomeId ?? null,
    worldId: cell?.worldId ?? null,
    worldMembership: worldMembership(px, py)
  };
}
// Each voice runs TWO crossfading heads of the same buffer plus a slow
// detune LFO. Periodically (every `cyclePeriod`) the silent head is
// re-spawned from a fresh random offset and the heads crossfade over
// `xfadeDur`. The combined effect: the loop seam is hidden by the
// overlap, AND each iteration enters at a different point with a
// slightly different pitch — the pattern never quite repeats.
function startVoice(chunkIdx, target, initialPan=0){
  const c=chunks[chunkIdx]; if(!c?.buffer) return null;
  ensureCtx();
  const now=actx.currentTime;
  const dur=c.buffer.duration;

  // Stereo panner so the user can localize chunks left/right and follow them.
  const panner=actx.createStereoPanner();
  panner.pan.setValueAtTime(Math.max(-1, Math.min(1, initialPan)), now);
  panner.connect(master);

  const g=actx.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(target, now+FADE_SEC);
  g.connect(panner);

  const headA=actx.createGain();
  const headB=actx.createGain();
  headA.connect(g); headB.connect(g);
  headA.gain.setValueAtTime(1, now);
  headB.gain.setValueAtTime(0, now);

  // Slow detune LFO — ±10 cents over a 25s period. Same LFO modulates
  // both heads so they drift together; combined with random restart
  // offsets, no two iterations sound the same.
  const lfo=actx.createOscillator();
  lfo.frequency.setValueAtTime(1/25, now);
  const lfoGain=actx.createGain();
  lfoGain.gain.setValueAtTime(10, now);
  lfo.connect(lfoGain);
  lfo.start(now);

  const v={
    gain:g, headA, headB, lfo, lfoGain, panner,
    srcA:null, srcB:null,
    dur, startedAt:now, target,
    swapTimer:null, alive:true, chunkIdx
  };

  function spawn(head, fromOffset){
    const s=actx.createBufferSource();
    s.buffer=c.buffer;
    s.loop=looping;
    lfoGain.connect(s.detune);
    s.connect(head);
    s.start(actx.currentTime+0.005, Math.max(0, Math.min(fromOffset, dur-0.05)));
    return s;
  }
  function killSrc(src){
    if(!src) return;
    try{ src.stop(actx.currentTime+0.4); }catch(_){}
    setTimeout(()=>{ try{src.disconnect();}catch(_){} }, 500);
  }

  // Head A starts at offset 0 (clean entry); Head B will spawn fresh on
  // the first swap from a random offset.
  v.srcA = spawn(headA, 0);

  const xfadeDur = Math.max(0.5, Math.min(2.0, dur*0.6));
  const cyclePeriod = Math.max(xfadeDur+0.4, dur);
  let aActive=true;

  function swap(){
    if(!v.alive) return;
    const t=actx.currentTime;
    const incomingHead = aActive ? headB : headA;
    const outgoingHead = aActive ? headA : headB;
    const incomingKey  = aActive ? 'srcB' : 'srcA';
    // Random restart offset within the buffer (avoid the very edges).
    const offset = Math.random() * Math.max(0, dur-0.1);
    killSrc(v[incomingKey]);
    v[incomingKey] = spawn(incomingHead, offset);
    incomingHead.gain.cancelScheduledValues(t);
    incomingHead.gain.setValueAtTime(incomingHead.gain.value, t);
    incomingHead.gain.linearRampToValueAtTime(1, t+xfadeDur);
    outgoingHead.gain.cancelScheduledValues(t);
    outgoingHead.gain.setValueAtTime(outgoingHead.gain.value, t);
    outgoingHead.gain.linearRampToValueAtTime(0, t+xfadeDur);
    aActive = !aActive;
    v.swapTimer = setTimeout(swap, cyclePeriod*1000);
  }
  v.swapTimer = setTimeout(swap, cyclePeriod*1000);

  return v;
}
function rampVoice(v, target){
  if(!v) return;
  const now=actx.currentTime;
  v.gain.gain.cancelScheduledValues(now);
  v.gain.gain.setValueAtTime(v.gain.gain.value, now);
  v.gain.gain.linearRampToValueAtTime(target, now+FADE_SEC);
  v.target=target;
}
function stopVoice(v){
  if(!v) return;
  v.alive=false;
  if(v.swapTimer){ clearTimeout(v.swapTimer); v.swapTimer=null; }
  const now=actx.currentTime;
  v.gain.gain.cancelScheduledValues(now);
  v.gain.gain.setValueAtTime(v.gain.gain.value, now);
  v.gain.gain.linearRampToValueAtTime(0, now+FADE_SEC);
  setTimeout(()=>{
    try{ v.srcA && v.srcA.stop(); v.srcA && v.srcA.disconnect(); }catch(_){}
    try{ v.srcB && v.srcB.stop(); v.srcB && v.srcB.disconnect(); }catch(_){}
    try{ v.lfo  && v.lfo.stop();  v.lfo  && v.lfo.disconnect(); }catch(_){}
    try{ v.lfoGain && v.lfoGain.disconnect(); }catch(_){}
    try{ v.headA && v.headA.disconnect(); }catch(_){}
    try{ v.headB && v.headB.disconnect(); }catch(_){}
    try{ v.gain.disconnect(); }catch(_){}
    try{ v.panner && v.panner.disconnect(); }catch(_){}
  }, (FADE_SEC+0.3)*1000);
}
function stopAllVoices(){
  for(const [,v] of voices) stopVoice(v);
  voices.clear();
}
function stopWorldLayerVoice(){
  if(!worldLayerVoice) return;
  stopVoice(worldLayerVoice);
  worldLayerVoice=null;
}
function terrainDensityWeight(cell){
  if(!cell || !cell.biomeId) return 0;
  const ch = cell.char || '.';
  if(cell.isChunk) return 1;
  if(ch==='.' || ch===',' || ch===':' || ch===';' || ch==='`' || ch==='\'') return 0.22;
  if(ch==='·' || ch===' ' || ch==='¦' || ch==='|') return 0.32;
  if(ch==='~' || ch==='=' || ch==='-') return 0.5;
  if(ch==='%' || ch==='+' || ch==='x' || ch==='*') return 0.72;
  if(ch==='T' || ch==='^' || ch==='O' || ch==='&' || ch==='#') return 0.9;
  return 0.64;
}
function worldLayerScore(chunk){
  const a=chunk.analysis||{};
  const len=Math.max(0.2, a.length||0.2);
  const z=Math.max(0, a.zcr||0);
  const hf=Math.max(0, a.hf||0);
  const centroid=Math.max(20, a.centroid||20);
  return (len*1.8) + (0.12/(0.012+z)) + (0.08/(0.004+hf)) + (1200/centroid);
}
function buildWorldDroneBanks(){
  worldDroneBanks = new Map();
  for(const wc of worldsConfig){
    const byWorld = chunks.filter((c)=>c.worldId===wc.id);
    if(byWorld.length===0){
      worldDroneBanks.set(wc.id, {all:[], byBiome:{}});
      continue;
    }
    const sorted = byWorld.slice().sort((a,b)=>worldLayerScore(b)-worldLayerScore(a));
    const all = sorted.slice(0, Math.min(18, sorted.length)).map((c)=>c.idx);
    const byBiome={};
    for(const c of byWorld){
      if(!byBiome[c.biome]) byBiome[c.biome]=[];
      byBiome[c.biome].push(c);
    }
    for(const biome of Object.keys(byBiome)){
      byBiome[biome] = byBiome[biome]
        .slice()
        .sort((a,b)=>worldLayerScore(b)-worldLayerScore(a))
        .slice(0, Math.min(8, byBiome[biome].length))
        .map((c)=>c.idx);
    }
    worldDroneBanks.set(wc.id, {all, byBiome});
  }
}
function nearestWorldChunk(worldId){
  const tpl=worldTemplates.get(worldId);
  if(!tpl || tpl.sampleIdxs.length===0) return null;
  const center=tileCoordFor(px,py);
  const tileR=Math.max(1, Math.ceil(WORLD_LAYER.range/Math.min(WORLD_TILE_W, WORLD_TILE_H))+1);
  let bestIdx=-1, bestD=Infinity;
  for(let ty=center.ty-tileR; ty<=center.ty+tileR; ty++){
    for(let tx=center.tx-tileR; tx<=center.tx+tileR; tx++){
      const ox=tx*WORLD_TILE_W, oy=ty*WORLD_TILE_H;
      for(const idx of tpl.sampleIdxs){
        const c=chunkAt(idx);
        const wx=ox+c.wx, wy=oy+c.wy;
        if(worldIdAt(wx,wy)!==worldId) continue;
        const d=Math.hypot(px-wx, py-wy);
        if(d<bestD){ bestD=d; bestIdx=idx; }
      }
    }
  }
  if(bestIdx<0) return null;
  return {idx:bestIdx, distance:bestD, proximity:Math.max(0, 1-(bestD/WORLD_LAYER.range))};
}
function chooseWorldLayerChunk(worldId, biome, cell, fallbackIdx=-1){
  const bank=worldDroneBanks.get(worldId);
  if(!bank) return fallbackIdx;
  const list=(biome && bank.byBiome[biome] && bank.byBiome[biome].length>0) ? bank.byBiome[biome] : bank.all;
  if(!list || list.length===0) return fallbackIdx;
  const chCode=(cell?.char||'.').charCodeAt(0);
  const h=Math.floor(Math.abs(hash01(px*0.71+chCode, py*0.43+list.length*9.7))*1000000);
  return list[h % list.length];
}
function updateWorldLayer(){
  if(paused || isOnboardingActive()){
    stopWorldLayerVoice();
    return;
  }
  const cell=getCellAt(px,py);
  if(!cell || !cell.biomeId || !cell.worldId){
    stopWorldLayerVoice();
    return;
  }
  const biomeType = (cell.biomeId.split(':')[1] || '').trim();
  const nearest=nearestWorldChunk(cell.worldId);
  if(!nearest){
    stopWorldLayerVoice();
    return;
  }
  const prox=nearest.proximity*nearest.proximity;
  const density=terrainDensityWeight(cell);
  const targetGain = clamp(WORLD_LAYER.maxGain * prox * density, WORLD_LAYER.minGain, WORLD_LAYER.maxGain);
  if(targetGain<=0.0005){
    stopWorldLayerVoice();
    return;
  }
  const desiredIdx = chooseWorldLayerChunk(cell.worldId, biomeType, cell, nearest.idx);
  if(desiredIdx<0){
    stopWorldLayerVoice();
    return;
  }
  if(!worldLayerVoice || worldLayerVoice.chunkIdx!==desiredIdx){
    stopWorldLayerVoice();
    const v=startVoice(desiredIdx, targetGain);
    if(v){
      v.chunkIdx=desiredIdx;
      v.worldId=cell.worldId;
      worldLayerVoice=v;
    }
  }else{
    rampVoice(worldLayerVoice, targetGain);
  }
}

// ── Ambient drone — bit-crushed brown-noise bed, always on under polyphony ────
// Subtle, lo-fi, tasteful. Loops a small noise buffer; lowpass + slow LFO
// give it breath. Mixes with terrain voices through the master compressor.
function makeAmbientNoiseBuffer(){
  const sr=actx.sampleRate;
  const len=Math.floor(sr*AMBIENT_LOOP_SEC);
  const buf=actx.createBuffer(1, len, sr);
  const ch=buf.getChannelData(0);
  // Brown noise via leaky integrator → softer than white, less hissy.
  let last=0;
  const Q=AMBIENT_BIT_LEVELS;
  for(let i=0;i<len;i++){
    const white=Math.random()*2-1;
    last=(last+0.02*white)/1.02;
    // Bit-crush quantisation → vintage character.
    ch[i]=Math.round(last*Q*4)/(Q*4);
  }
  return buf;
}
function ensureAmbientDrone(){
  if(ambientDrone) return ambientDrone;
  ensureCtx();
  if(!actx || !master) return null;
  const now=actx.currentTime;
  const src=actx.createBufferSource();
  src.buffer=makeAmbientNoiseBuffer();
  src.loop=true;
  // Lowpass keeps it from biting; cutoff drifts on a slow LFO.
  const filt=actx.createBiquadFilter();
  filt.type='lowpass';
  filt.frequency.setValueAtTime(420, now);
  filt.Q.setValueAtTime(0.6, now);
  const lfo=actx.createOscillator();
  lfo.type='sine';
  lfo.frequency.setValueAtTime(1/13, now);
  const lfoGain=actx.createGain();
  lfoGain.gain.setValueAtTime(160, now);
  lfo.connect(lfoGain); lfoGain.connect(filt.frequency);
  const gain=actx.createGain();
  gain.gain.setValueAtTime(0, now);
  src.connect(filt); filt.connect(gain); gain.connect(master);
  try{
    src.start(); lfo.start();
  }catch(err){
    console.warn('Ambient drone start blocked', err);
    try{ src.disconnect(); }catch(_){}
    try{ lfo.disconnect(); }catch(_){}
    try{ gain.disconnect(); }catch(_){}
    return null;
  }
  ambientDrone={src, lfo, filt, gain, target:0};
  return ambientDrone;
}
function startAmbientDrone(){
  startAmbientDroneAt(AMBIENT_DRONE_GAIN);
}
function startAmbientDroneAt(targetGain){
  const d=ensureAmbientDrone();
  if(!d) return;
  const goal=clamp(targetGain, 0, 0.25);
  if(ambientDrone.target===goal) return;
  const now=actx.currentTime;
  ambientDrone.gain.gain.cancelScheduledValues(now);
  ambientDrone.gain.gain.setValueAtTime(ambientDrone.gain.gain.value, now);
  ambientDrone.gain.gain.linearRampToValueAtTime(goal, now+FADE_SEC);
  ambientDrone.target=goal;
}
function setAmbientDroneTarget(targetGain, rampSec=FADE_SEC){
  if(!ambientDrone || !actx) return;
  const goal=clamp(targetGain, 0, 0.25);
  const now=actx.currentTime;
  ambientDrone.gain.gain.cancelScheduledValues(now);
  ambientDrone.gain.gain.setValueAtTime(ambientDrone.gain.gain.value, now);
  ambientDrone.gain.gain.linearRampToValueAtTime(goal, now+Math.max(0.04, rampSec));
  ambientDrone.target=goal;
}
function silenceAmbientDrone(){
  if(!ambientDrone) return;
  const now=actx.currentTime;
  ambientDrone.gain.gain.cancelScheduledValues(now);
  ambientDrone.gain.gain.setValueAtTime(ambientDrone.gain.gain.value, now);
  ambientDrone.gain.gain.linearRampToValueAtTime(0, now+FADE_SEC);
  ambientDrone.target=0;
}


// ── Terrain topology — MUD/Angband-style biome palettes + layered noise ───────
// Each biome type has a palette of glyphs distributed by 2D noise so the
// world has hills/valleys/lakes/clearings instead of uniform speckle.
//
// Roles (per palette):
//   base      — most common ground (grass, sand, dirt)
//   secondary — common variation (taller grass, scree, pebbles)
//   primary   — visible feature (trees, peaks, dunes, water)
//   feature   — rare landmark (huts, summits, oases, deep pools)
//   sparse    — outer-ring filler (gap-prone)
const BIOME_PALETTES = {
  drone: {     // forest — dense, organic, cool
    base:',', secondary:'%', primary:'T', feature:'&', sparse:'.',
    color:'t-drone', featureColor:'t-feature'
  },
  shimmer: {   // mountains — rugged, sparse
    base:'.', secondary:',', primary:'^', feature:'*', sparse:'.',
    color:'t-shimmer', featureColor:'t-feature'
  },
  noise: {     // scrub / desert — chaotic
    base:'.', secondary:':', primary:';', feature:'#', sparse:'.',
    color:'t-noise', featureColor:'t-feature'
  },
  pulse: {     // plains — rhythmic, even
    base:',', secondary:'\'', primary:';', feature:'o', sparse:'.',
    color:'t-pulse', featureColor:'t-feature'
  },
  resonance: { // wetland / cave — round, watery
    base:'.', secondary:'=', primary:'~', feature:'O', sparse:'.',
    color:'t-resonance', featureColor:'t-feature'
  }
};
function paletteForBiome(biome){ return BIOME_PALETTES[biome] || BIOME_PALETTES.resonance; }

// Cheap layered noise (fbm-ish via overlapping sines) — gives clusters that
// read as macro features (lakes, ridges) without needing a real Perlin impl.
function noise2(x, y, scale, seed){
  const sx=(x+seed)*scale, sy=(y+seed*1.3)*scale;
  return 0.5*Math.sin(sx*1.7+Math.cos(sy*2.3)) + 0.5*Math.cos(sy*1.1+Math.sin(sx*1.9));
}
function fbm2(x, y, seed){
  return 0.55*noise2(x,y,0.05,seed)
       + 0.30*noise2(x,y,0.18,seed*2.1)
       + 0.15*noise2(x,y,0.55,seed*3.7);
}
function hash01(x, y){
  return Math.abs(Math.sin(x*127.1+y*311.7)*43758.5)%1;
}
function hashString01(s){
  let h=2166136261>>>0;
  for(let i=0;i<s.length;i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h>>>0) / 4294967295);
}
function worldSpreadFor(worldId){
  const hx=hashString01(`${worldId}:x`);
  const hy=hashString01(`${worldId}:y`);
  const sx=WORLD_SPREAD_MIN + hx*(WORLD_SPREAD_MAX-WORLD_SPREAD_MIN);
  const sy=WORLD_SPREAD_MIN + hy*(WORLD_SPREAD_MAX-WORLD_SPREAD_MIN);
  return {sx, sy};
}

// Per-cell glyph — biome palette + layered noise + distance falloff + attack-driven edge softness.
// Always returns a glyph inside R (no holes); outside R returns null so wilderness can fill in.
function terrainChar(chunk, d, cx, cy){
  const R=chunk.terrainRadius;
  if(d>R) return null;
  const palette=paletteForBiome(chunk.biome);
  const distFrac=d/R;

  // Noise tiers — clusters of glyphs read as features.
  const n=fbm2(cx, cy, chunk.idx);
  let glyph;
  if(n>0.55)        glyph=palette.feature;
  else if(n>0.15)   glyph=palette.primary;
  else if(n>-0.20)  glyph=palette.secondary;
  else              glyph=palette.base;

  // Soften toward the edge — outer ring shifts to the lighter sparse glyph.
  if(distFrac>0.75){
    const r=hash01(cx,cy);
    if(glyph!==palette.feature && r>0.4) glyph=palette.sparse;
  }
  return glyph;
}

// ── Wilderness — global background terrain that fills cells with no chunk ─────
// Macro fbm picks a region (forest / plains / scrub / waste); thin noise
// bands carve rivers and ridges. Cells get glyph + color but no biomeId, so
// audio still gates off (wilderness is visual only — only the ambient bed plays).
function wildernessAt(cx, cy){
  // River bands — long, narrow water threads.
  const river=noise2(cx, cy, 0.018, 7) + 0.4*noise2(cx, cy, 0.06, 11);
  if(Math.abs(river)<0.045) return {char:'~', colorClass:'t-void-water'};
  // Mountain ridges — broad bands of peaks.
  const mtn=noise2(cx, cy, 0.022, 23) + 0.3*noise2(cx, cy, 0.09, 31);
  if(mtn>0.7) return {char:'^', colorClass:'t-void-shimmer'};

  const macro=fbm2(cx, cy, 999);
  const micro=fbm2(cx, cy, 1234);
  if(macro>0.45){      // forest
    if(micro>0.4)  return {char:'T', colorClass:'t-void-drone'};
    if(micro>-0.1) return {char:'%', colorClass:'t-void-drone'};
    return {char:',', colorClass:'t-void-drone'};
  }
  if(macro>-0.05){     // plains
    if(micro>0.45) return {char:';', colorClass:'t-void-pulse'};
    if(micro>0)    return {char:',', colorClass:'t-void-pulse'};
    return {char:'\'', colorClass:'t-void-pulse'};
  }
  if(macro>-0.4){      // scrub
    if(micro>0.3)  return {char:':', colorClass:'t-void-noise'};
    if(micro>-0.1) return {char:',', colorClass:'t-void-noise'};
    return {char:'.', colorClass:'t-void-noise'};
  }
  // Sparse waste
  if(micro>0.3) return {char:'.', colorClass:'t-void-noise'};
  return {char:',', colorClass:'t-void-pulse'};
}

// Color a stamped terrain cell. Most cells take the biome's base color;
// specific glyph identities (water, peaks/huts) get accent colors.
function colorFor(biome, glyph){
  const p=paletteForBiome(biome);
  if(glyph==='~' || glyph==='≈') return 't-water';
  if(glyph===p.feature) return p.featureColor;
  return p.color;
}

// ── Sample iconography — micrographic per-sample marker from MIR ──────────────
// Each sample is a "place" on the map: cave, peak, blip, hut, well, shimmer,
// boulder, arch. Type derived from centroid × attack × length.
function iconFor(analysis){
  const c=analysis.centroid||0;
  const a=analysis.attack||0;
  const l=analysis.length||0;
  if(c<800){
    if(a<0.015) return 'O';                 // heavy stone — low + sharp
    return l>1.5 ? '&' : 'o';                // cluster/cave vs boulder
  }
  if(c<2500){
    if(a<0.015) return '*';                  // spark/blip — mid + sharp
    return l>1.5 ? 'Ω' : '+';                 // arch vs crossroads
  }
  // High centroid
  if(a<0.015) return '^';                    // peak — high + sharp
  return l>1.0 ? '~' : '!';                   // shimmer/water vs spike
}
// Symbolic marker for a world's centre — distinguishes worlds at a glance.
// Cycles through a small set; future canonical worlds get distinct markers.
const WORLD_LANDMARKS=['◆','◇','▽','△','◉','○','✦','✧'];
function landmarkFor(worldIdx){ return WORLD_LANDMARKS[worldIdx%WORLD_LANDMARKS.length]; }

// ── World ─────────────────────────────────────────────────────────────────────
function computeViewDims(){
  const mapEl=document.getElementById('map');
  const cw=7.84, ch=13*1.38;
  VIEW_W=Math.max(40, Math.floor(mapEl.clientWidth/cw));
  VIEW_H=Math.max(10, Math.floor(mapEl.clientHeight/ch));
}

// Per-sample terrain radius — longer samples occupy more map area.
function assignTerrainRadii(){
  for(const c of chunks){
    const len=c.analysis?.length||1;
    c.terrainRadius=clamp(TERRAIN_R_MIN+len*6, TERRAIN_R_MIN, TERRAIN_R_MAX);
  }
}
function assignEmittersForChunk(c){
  if(!c) return;
  const r = c.terrainRadius ?? TERRAIN_R_MIN;
  const t = clamp((r - TERRAIN_R_MIN) / Math.max(1, (TERRAIN_R_MAX - TERRAIN_R_MIN)), 0, 1);
  const satCount = Math.round(
    TERRAIN_EMITTERS.minSatellites + t * (TERRAIN_EMITTERS.maxSatellites - TERRAIN_EMITTERS.minSatellites)
  );
  const emitters = [{ x: c.wx, y: c.wy, g: 1, id: 'c' }];
  for(let i=0; i<satCount; i++){
    const aN = hash01((c.idx + 1) * 17.13, (i + 1) * 29.7 + (c.analysis?.centroid || 0) * 0.0007);
    const rN = hash01((c.idx + 1) * 23.91, (i + 1) * 13.11 + (c.analysis?.attack || 0) * 73.1);
    const gN = hash01((c.idx + 1) * 31.07, (i + 1) * 19.73 + (c.analysis?.zcr || 0) * 910);
    const ang = aN * Math.PI * 2;
    const rr = r * (TERRAIN_EMITTERS.radiusFracMin + rN * (TERRAIN_EMITTERS.radiusFracMax - TERRAIN_EMITTERS.radiusFracMin));
    const ex = clamp(Math.round(c.wx + Math.cos(ang) * rr), 1, WORLD_TILE_W - 2);
    const ey = clamp(Math.round(c.wy + Math.sin(ang) * rr * 0.88), 1, WORLD_TILE_H - 2);
    const eg = TERRAIN_EMITTERS.gainMin + gN * (TERRAIN_EMITTERS.gainMax - TERRAIN_EMITTERS.gainMin);
    emitters.push({ x: ex, y: ey, g: eg, id: `s${i}` });
  }
  c.emitters = emitters;
}

function buildWorldTemplates(){
  worldTemplates = new Map();
  worlds = [];

  for(const wc of worldsConfig){
    const sampleIdxs = chunks.filter(c=>wc.fileIdxs.includes(c.idx)).map(c=>c.idx);
    if(sampleIdxs.length===0) continue;

    const templateTerrain = Array.from({length:WORLD_TILE_H},()=>Array(WORLD_TILE_W).fill(null));
    const spread=worldSpreadFor(wc.id);
    const spanX=Math.max(10, Math.round((WORLD_TILE_W-8)*spread.sx));
    const spanY=Math.max(8, Math.round((WORLD_TILE_H-8)*spread.sy));
    const xPad=Math.max(2, Math.round((WORLD_TILE_W-spanX)/2));
    const yPad=Math.max(2, Math.round((WORLD_TILE_H-spanY)/2));
    // Stable placement: each chunk gets deterministic coordinates derived from
    // its own analysis + id. This prevents terrain "morphing" during async load.
    for(const idx of sampleIdxs){
      const c=chunkAt(idx);
      c.worldId=wc.id;
      c.biomeId=`${wc.id}:${c.biome}`;
      const z = clamp(((c.analysis?.zcr ?? 0) - 0.004) / 0.09, 0, 1);
      const h = clamp(((c.analysis?.hf  ?? 0) - 0.002) / 0.022, 0, 1);
      const jitterX = (hash01((idx+1)*17.3, (c.analysis?.centroid ?? 0)*0.0017 + wc.id.length*11.7) - 0.5) * 0.18;
      const jitterY = (hash01((idx+1)*23.9, (c.analysis?.attack ?? 0)*91.0 + wc.id.length*7.1) - 0.5) * 0.18;
      const xNorm = clamp(z + jitterX, 0, 1);
      const yNorm = clamp(1 - h + jitterY, 0, 1);
      const wxRaw=xPad + xNorm * Math.max(1, spanX-1);
      const wyRaw=yPad + yNorm * Math.max(1, spanY-1);
      c.wx=clamp(Number.isFinite(wxRaw)?Math.round(wxRaw):Math.round(WORLD_TILE_W/2),2,WORLD_TILE_W-3);
      c.wy=clamp(Number.isFinite(wyRaw)?Math.round(wyRaw):Math.round(WORLD_TILE_H/2),2,WORLD_TILE_H-3);
      assignEmittersForChunk(c);
    }

    for(let cy=0;cy<WORLD_TILE_H;cy++){
      for(let cx=0;cx<WORLD_TILE_W;cx++){
        let nd=Infinity, nc=null;
        for(const idx of sampleIdxs){
          const ch=chunkAt(idx);
          const d=Math.hypot(cx-ch.wx, cy-ch.wy);
          if(d<nd){nd=d;nc=ch;}
        }
        if(nc && nd<=nc.terrainRadius){
          const g=terrainChar(nc,nd,cx,cy);
          if(g){
            templateTerrain[cy][cx]={
              char:g,
              colorClass:colorFor(nc.biome,g),
              biomeId:nc.biomeId,
              worldId:wc.id
            };
          }
        }
      }
    }

    for(const idx of sampleIdxs){
      const c=chunkAt(idx);
      if(!c.iconChar) c.iconChar=iconFor(c.analysis);
      templateTerrain[c.wy][c.wx]={
        char:c.iconChar,
        colorClass:'t-chunk',
        biomeId:c.biomeId,
        worldId:wc.id,
        isChunk:true,
        chunkIdx:idx
      };
    }

    const cx=sampleIdxs.reduce((acc, idx)=>acc+chunkAt(idx).wx,0)/sampleIdxs.length;
    const cy=sampleIdxs.reduce((acc, idx)=>acc+chunkAt(idx).wy,0)/sampleIdxs.length;
    let maxD=0;
    for(const idx of sampleIdxs){
      const s=chunkAt(idx);
      const d=Math.hypot(s.wx-cx, s.wy-cy)+s.terrainRadius;
      if(d>maxD) maxD=d;
    }
    const region={cx, cy, r:Math.max(maxD, 18)};

    const groups=new Map();
    for(const idx of sampleIdxs){
      const c=chunkAt(idx);
      if(!groups.has(c.biome)) groups.set(c.biome,[]);
      groups.get(c.biome).push(idx);
    }
    const biomes=[...groups].map(([type, ids])=>({id:`${wc.id}:${type}`,type,world:wc.id,sampleIdxs:ids}));
    const landmarkX=clamp(Math.round(region.cx),1,WORLD_TILE_W-2);
    const landmarkY=clamp(Math.round(region.cy),1,WORLD_TILE_H-2);
    if(!templateTerrain[landmarkY][landmarkX]?.isChunk){
      templateTerrain[landmarkY][landmarkX]={
        char:landmarkFor(worlds.length),
        colorClass:'t-landmark',
        biomeId:null,
        worldId:wc.id,
        isLandmark:true
      };
    }

    for(let cy2=0;cy2<WORLD_TILE_H;cy2++){
      for(let cx2=0;cx2<WORLD_TILE_W;cx2++){
        if(templateTerrain[cy2][cx2]!==null) continue;
        const w=wildernessAt(cx2, cy2);
        templateTerrain[cy2][cx2]={char:w.char,colorClass:w.colorClass,isWilderness:true,worldId:wc.id};
      }
    }

    const tpl={id:wc.id,label:wc.label,width:WORLD_TILE_W,height:WORLD_TILE_H,terrain:templateTerrain,sampleIdxs,region,biomes};
    worldTemplates.set(wc.id, tpl);
    worlds.push(tpl);
  }
}

function buildWorld(){
  computeViewDims();
  WORLD_TILE_W=Math.max(36, Math.round(VIEW_W*WORLD_TILE_SCALE_X));
  WORLD_TILE_H=Math.max(24, Math.round(VIEW_H*WORLD_TILE_SCALE_Y));
  assignTerrainRadii();
  buildWorldTemplates();
  buildWorldDroneBanks();
  fog = new Map();
  // Always spawn in a currently loaded world; avoid unresolved world routing
  // during partial boot (prevents null-cell start states).
  const preferredHome = worldTemplates.get(INTRO_SCENE.worldId);
  const hashedHome = worldTemplates.get(worldIdAt(0,0));
  const anyHome = worlds[0] || null;
  const home = preferredHome || hashedHome || anyHome;
  px = py = 0;
  if(home && home.region){
    const rx=Math.round(home.region.cx);
    const ry=Math.round(home.region.cy);
    if(Number.isFinite(rx)) px = rx;
    if(Number.isFinite(ry)) py = ry;
  }
  keyMap = new Map();
  keysFound = 0;
  keysTotal = 0;
  door = null;
  revealAround(px,py);
}

// Placement distance band — once a key is *allowed* to spawn, it lands
// close enough to be findable within ~minute of walking from where the
// player is at that moment, but not literally underfoot.
const KEY_PLACEMENT_MIN = 90;
const KEY_PLACEMENT_MAX = 220;
const DOOR_MIN_DIST = 500;
const DOOR_MAX_DIST = 1100;
// Time-based pacing. The first key materialises 15–30s after you land in
// the live world; subsequent keys arrive 30–60s after each pickup. The
// gating is what gives the universe its rhythm — keys aren't predeposited.
const KEY_FIRST_DELAY_MIN_MS = 15_000;
const KEY_FIRST_DELAY_MAX_MS = 30_000;
const KEY_NEXT_DELAY_MIN_MS  = 30_000;
const KEY_NEXT_DELAY_MAX_MS  = 60_000;

function placeBeacon(cx, cy, minDist, maxDist){
  const angle = Math.random() * Math.PI * 2;
  const dist  = minDist + Math.random() * (maxDist - minDist);
  return {
    x: Math.round(cx + Math.cos(angle) * dist),
    y: Math.round(cy + Math.sin(angle) * dist),
  };
}

function isHorrorActive(){
  return horrorPhase!==HORROR_SEQUENCE.OFF;
}

function hushDistance(){
  if(!hush.active) return Infinity;
  return Math.hypot(hush.x-px, hush.y-py);
}

function setSubWorld1Checkpoint(x, y){
  subWorld1Start={x:Math.round(x), y:Math.round(y)};
}

function resetSw2State(){
  sw2.active=false;
  sw2.phase=SW2_PHASE.OFF;
  sw2.phaseStartedMs=0;
  sw2.startedAtMs=0;
  sw2.hubX=0;
  sw2.hubY=0;
  sw2.areas=[];
  sw2.currentAreaIdx=0;
  sw2.heldItem=false;
  sw2.heldFromArea=-1;
  sw2.completedCount=0;
  sw2.failCount=0;
  sw2.darkness=0;
  sw2.doorActive=false;
  sw2.doorX=0;
  sw2.doorY=0;
  sw2.doorArmedAt=0;
  sw2.firstLineShown=false;
  sw2.finalLineShown=false;
  sw2.punctuationAtMs=0;
  sw2.caught=false;
  sw2.driverEnergy=0;
  sw2.lastLossMs=0;
  sw2.charge=0;
}

function stopSw2AudioLayer(){
  if(sw2Audio.bedSrc){
    try{ sw2Audio.bedSrc.stop(); }catch(_){}
    try{ sw2Audio.bedSrc.disconnect(); }catch(_){}
    sw2Audio.bedSrc=null;
  }
  if(sw2Audio.stretchSrc){
    try{ sw2Audio.stretchSrc.stop(); }catch(_){}
    try{ sw2Audio.stretchSrc.disconnect(); }catch(_){}
    sw2Audio.stretchSrc=null;
  }
  if(sw2Audio.bedGain){
    try{ sw2Audio.bedGain.disconnect(); }catch(_){}
    sw2Audio.bedGain=null;
  }
  if(sw2Audio.stretchGain){
    try{ sw2Audio.stretchGain.disconnect(); }catch(_){}
    sw2Audio.stretchGain=null;
  }
  sw2Audio.startedAt=0;
}

function buildSw2Envelope(buffer, bins=1024){
  const data=buffer.getChannelData(0);
  const out=new Float32Array(bins);
  const step=Math.max(1, Math.floor(data.length/bins));
  for(let i=0;i<bins;i++){
    const start=i*step;
    const end=Math.min(data.length, start+step);
    let sum=0;
    for(let j=start;j<end;j++) sum += Math.abs(data[j]);
    out[i]=sum/Math.max(1, end-start);
  }
  return out;
}

async function loadSw2DriverAudio(){
  if(sw2Audio.loaded || sw2Audio.loading) return;
  sw2Audio.loading=true;
  try{
    ensureCtx();
    const res=await fetch(SW2_AUDIO_URL);
    if(!res.ok) throw new Error(`audio fetch ${res.status}`);
    const ab=await res.arrayBuffer();
    const buffer=await actx.decodeAudioData(ab.slice(0));
    sw2Audio.buffer=buffer;
    sw2Audio.envelope=buildSw2Envelope(buffer, 1536);
    sw2Audio.loaded=true;
  }catch(err){
    console.warn('sw2 audio driver unavailable', err);
  }finally{
    sw2Audio.loading=false;
  }
}

function startSw2AudioLayer(){
  if(!sw2Audio.loaded || !sw2Audio.buffer || !actx || sw2Audio.bedSrc) return;
  const now=actx.currentTime;
  const dur=Math.max(0.01, sw2Audio.buffer.duration);
  const q=dur*0.25;
  // Bed loop: first quarter only (Fa/Ha air + key-click world).
  const bed=actx.createBufferSource();
  bed.buffer=sw2Audio.buffer;
  bed.loop=true;
  bed.loopStart=0;
  bed.loopEnd=Math.max(0.05, q);
  const bedGain=actx.createGain();
  bedGain.gain.setValueAtTime(0.0001, now);
  bedGain.gain.exponentialRampToValueAtTime(0.2, now+0.6);
  bed.connect(bedGain);
  bedGain.connect(master || actx.destination);
  bed.start(now, Math.random()*Math.max(0.01, q-0.02));
  sw2Audio.bedSrc=bed;
  sw2Audio.bedGain=bedGain;

  // Paulstretch-like ghost layer (off by default, mixed in after "loss" events).
  const stretch=actx.createBufferSource();
  stretch.buffer=sw2Audio.buffer;
  stretch.loop=true;
  stretch.loopStart=0;
  stretch.loopEnd=Math.max(0.05, q);
  stretch.playbackRate.setValueAtTime(0.22, now);
  const stretchGain=actx.createGain();
  stretchGain.gain.setValueAtTime(0.0001, now);
  stretch.connect(stretchGain);
  stretchGain.connect(master || actx.destination);
  stretch.start(now, Math.random()*Math.max(0.01, q-0.02));
  sw2Audio.stretchSrc=stretch;
  sw2Audio.stretchGain=stretchGain;
  sw2Audio.paulMix=0;
  sw2Audio.startedAt=now;
}

function sw2AudioDriveLevel(nowMs, dt){
  if(!sw2Audio.loaded || !sw2Audio.buffer || !sw2Audio.envelope){
    sw2Audio.drive = clamp(sw2Audio.drive + ((0.35 + 0.25*Math.sin(nowMs*0.0017)) - sw2Audio.drive)*0.08, 0, 1);
    return sw2Audio.drive;
  }
  const dur=Math.max(0.001, sw2Audio.buffer.duration);
  const srcTime = sw2Audio.bedSrc && actx
    ? (actx.currentTime - sw2Audio.startedAt)
    : ((nowMs - sw2.startedAtMs)/1000);
  const wrapped=((srcTime%dur)+dur)%dur;
  const idx=Math.floor((wrapped/dur) * sw2Audio.envelope.length) % sw2Audio.envelope.length;
  const raw=sw2Audio.envelope[idx] || 0;
  const target=clamp((raw-0.04)/0.22, 0, 1);
  sw2Audio.drive=clamp(sw2Audio.drive + (target-sw2Audio.drive)*Math.min(1, dt*7.5), 0, 1);
  return sw2Audio.drive;
}

function setSw2PaulstretchMix(mixPct){
  const pct=clamp(mixPct, 0, 1);
  sw2Audio.paulMix=pct;
  if(!actx) return;
  const now=actx.currentTime;
  if(sw2Audio.stretchGain){
    sw2Audio.stretchGain.gain.cancelScheduledValues(now);
    sw2Audio.stretchGain.gain.setValueAtTime(sw2Audio.stretchGain.gain.value, now);
    sw2Audio.stretchGain.gain.linearRampToValueAtTime(0.0001 + pct*0.24, now+0.4);
  }
  if(sw2Audio.bedGain){
    sw2Audio.bedGain.gain.cancelScheduledValues(now);
    sw2Audio.bedGain.gain.setValueAtTime(sw2Audio.bedGain.gain.value, now);
    sw2Audio.bedGain.gain.linearRampToValueAtTime(0.15 + (1-pct)*0.08, now+0.4);
  }
}

function playSw2Punctuation(intensity=0.5){
  if(!sw2Audio.loaded || !sw2Audio.buffer || !actx) return;
  const now=performance.now();
  if(now < sw2Audio.punctAtMs) return;
  sw2Audio.punctAtMs = now + SW2_TUNE.punctuationMinMs + Math.random()*(SW2_TUNE.punctuationMaxMs-SW2_TUNE.punctuationMinMs);
  const t0=actx.currentTime + 0.01;
  const dur=Math.max(0.01, sw2Audio.buffer.duration);
  const start=dur*0.25;
  const end=dur*0.75; // discard last quarter
  const seg=Math.min(2.8, 0.8 + intensity*2.1);
  const s=Math.max(start, Math.min(end-seg-0.02, start + Math.random()*Math.max(0.01, (end-start-seg))));
  const src=actx.createBufferSource();
  src.buffer=sw2Audio.buffer;
  src.playbackRate.setValueAtTime(0.88 + Math.random()*0.35, t0);
  const g=actx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.07 + intensity*0.14, t0+0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t0+seg);
  src.connect(g);
  g.connect(master || actx.destination);
  src.start(t0, s, seg);
  src.stop(t0+seg+0.02);
}

function setSw2Phase(phase, msg=''){
  sw2.phase=phase;
  sw2.phaseStartedMs=performance.now();
  if(msg) pushEvent(msg);
}

function makeSw2Areas(hx, hy){
  const out=[];
  for(let i=0;i<SW2_TUNE.areaCount;i++){
    const a=(-Math.PI/2) + i*((Math.PI*2)/SW2_TUNE.areaCount);
    const anchorX=hx + Math.round(Math.cos(a)*SW2_TUNE.areaDist);
    const anchorY=hy + Math.round(Math.sin(a)*SW2_TUNE.areaDist);
    const ox=Math.round(Math.cos(a+Math.PI*0.5) * 1.6);
    const oy=Math.round(Math.sin(a+Math.PI*0.5) * 1.6);
    out.push({
      idx:i,
      x:anchorX,
      y:anchorY,
      threatX:anchorX+ox,
      threatY:anchorY+oy,
      driftX:0,
      driftY:0,
      caughtLockUntilMs:0,
      revealUntilMs:0,
      wasInside:false,
      grabbed:false,
      complete:false,
    });
  }
  return out;
}

function currentSw2Area(){
  if(!sw2.areas || sw2.areas.length===0) return null;
  return sw2.areas[sw2.currentAreaIdx] || null;
}

function sw2ProgressPct(){
  const heldBonus=sw2.heldItem ? 0.5 : 0;
  return clamp(((sw2.completedCount + heldBonus)/Math.max(1, SW2_TUNE.areaCount))*100, 0, 100);
}

function sw2KillRadius(){
  return SW2_TUNE.killRadiusBase + Math.min(1.0, sw2.failCount*SW2_TUNE.killRadiusFailStep);
}

function nextIncompleteSw2AreaIndex(){
  if(!sw2.areas || sw2.areas.length===0) return -1;
  for(let i=0;i<sw2.areas.length;i++){
    if(!sw2.areas[i].complete) return i;
  }
  return -1;
}

function triggerSw2Loss(nowMs=performance.now(), intensity=0.66){
  if((nowMs-sw2.lastLossMs) < SW2_TUNE.finalLossCooldownMs){
    return false;
  }
  sw2.lastLossMs=nowMs;
  playHushRupture();
  sw2.failCount++;
  sw2.darkness=clamp(sw2.darkness + SW2_TUNE.darknessStep, 0, SW2_TUNE.darknessMax);
  setSw2PaulstretchMix(Math.min(0.9, sw2.failCount*0.15));
  playSw2Punctuation(0.62 + intensity*0.42);
  hushPunishLockUntilMs=nowMs+420;
  return true;
}

function startSw2FinalDark(nowMs){
  sw2.doorActive=true;
  sw2.doorX=sw2.hubX;
  sw2.doorY=sw2.hubY - SW2_TUNE.finalDoorDist;
  sw2.doorArmedAt=nowMs + 420;
  sw2.darkness=Math.max(sw2.darkness, 0.78);
  sw2.charge=100;
  for(const area of sw2.areas){
    area.revealUntilMs=nowMs + 999999;
    area.caughtLockUntilMs=nowMs+500;
  }
  setSw2Phase(SW2_PHASE.FINAL_DARK);
  playSw2Punctuation(0.9);
}

function startSubWorld2Sequence(startProgressAreas=0, isDebug=false){
  resetHorrorState();
  ensureCtx();
  const now=performance.now();
  horrorPhase=HORROR_SEQUENCE.CHASE_PRESSURE;
  horrorStartMs=now;
  horrorLastTickMs=now;
  sw2.active=true;
  sw2.startedAtMs=now;
  sw2.hubX=subWorld2Start.x;
  sw2.hubY=subWorld2Start.y;
  sw2.areas=makeSw2Areas(sw2.hubX, sw2.hubY);
  sw2.currentAreaIdx=0;
  sw2.completedCount=0;
  sw2.heldItem=false;
  sw2.heldFromArea=-1;
  sw2.failCount=0;
  sw2.darkness=0;
  sw2.doorActive=false;
  sw2.caught=false;
  sw2.charge=0;
  sw2.firstLineShown=false;
  sw2.finalLineShown=false;
  sw2.lastLossMs=0;
  sw2.punctuationAtMs=now + 1200;
  if(startProgressAreas>0){
    const fast=Math.min(SW2_TUNE.areaCount, Math.floor(startProgressAreas));
    for(let i=0;i<fast;i++){
      sw2.areas[i].grabbed=true;
      sw2.areas[i].complete=true;
    }
    sw2.completedCount=fast;
    sw2.currentAreaIdx=Math.min(sw2.areas.length-1, Math.max(0, fast));
    if(sw2.completedCount>=SW2_TUNE.areaCount){
      startSw2FinalDark(now);
    }
  }
  if(isDebug){
    sw2.firstLineShown=true; // keep normal run at 2 lines; debug avoids extra narrative.
  }
  if(sw2.phase!==SW2_PHASE.FINAL_DARK){
    setSw2Phase(SW2_PHASE.BOOT_SILENCE, isDebug ? '// debug: dropped into sub world 2.' : '');
  }
  hush.active=false;
  hushEyes=[];
  setSw2PaulstretchMix(0);
  if(sw2Audio.loaded){
    startSw2AudioLayer();
  } else {
    loadSw2DriverAudio().then(()=>startSw2AudioLayer());
  }
}

function completeSubWorld2Rite(){
  triggerGateFlash(240, 540);
  if(navigator.vibrate) navigator.vibrate([32, 56, 90]);
  subWorld2HasKeys=true;
  sw2.darkness=clamp(sw2.darkness + 0.08, 0, 0.98);
  sw2.charge=100;
  setSw2Phase(SW2_PHASE.POST_DOOR);
  sw2.doorActive=true;
  if(!sw2.finalLineShown){
    pushEvent('// you carry it with you now.');
    sw2.finalLineShown=true;
  }
}

function maybeCrossSw2Gate(nowMs){
  if(!sw2.active || !sw2.doorActive || sw2.phase!==SW2_PHASE.FINAL_DARK) return false;
  if(px!==sw2.doorX || py!==sw2.doorY) return false;
  const movingRecently=(nowMs-lastMoveAtMs) <= Math.max(100, currentMoveIntervalMs()*1.35);
  if(nowMs>=sw2.doorArmedAt && movingRecently){
    completeSubWorld2Rite();
    return true;
  }
  return false;
}

function resetHorrorState(){
  horrorPhase=HORROR_SEQUENCE.OFF;
  horrorStartMs=0;
  horrorLastTickMs=0;
  hush.active=false;
  hush.vx=0;
  hush.vy=0;
  hushPingHeat=0;
  hushEyes=[];
  lastHushEventMs=0;
  nextDoorSwarmPulseMs=0;
  doorSwarmStartMs=0;
  doorSwarmArmMs=0;
  doorSwarmRadius=0;
  doorSwarmCenter=null;
  doorRevealCutscene=false;
  doorRevealStartedMs=0;
  doorRevealEndsMs=0;
  doorRevealTriggered=false;
  doorRevealHushTarget=null;
  hushLockedUntilMs=0;
  hushLastDist=Infinity;
  hushLastAdvanceTowardMs=0;
  hushLastRetreatMs=0;
  hushBlinkActive=false;
  hushBlinkEndsMs=0;
  hushBlinkNextAtMs=0;
  hushBlinkStress=0;
  hushBlinkNextLurchMs=0;
  hushBlinkLurchesRemaining=0;
  corridorStatues=[];
  resetSw2State();
  stopSw2AudioLayer();
  if(hushHitTimer!==null){
    clearTimeout(hushHitTimer);
    hushHitTimer=null;
  }
  if(hushJumpTimer!==null){
    clearTimeout(hushJumpTimer);
    hushJumpTimer=null;
  }
  if(MAP_EL) MAP_EL.classList.remove('hush-hit');
  if(HUSH_JUMP_EL){
    HUSH_JUMP_EL.classList.remove('active');
    HUSH_JUMP_EL.classList.remove('blink');
  }
}

function playHushRupture(){
  triggerGateFlash(100, 260);
  setTimeout(()=>triggerGateFlash(80, 180), 70);
  setTimeout(()=>triggerGateFlash(60, 130), 145);
  if(MAP_EL){
    MAP_EL.classList.remove('hush-hit');
    // Force style flush so rapid repeated hits still retrigger animation.
    void MAP_EL.offsetWidth;
    MAP_EL.classList.add('hush-hit');
    if(hushHitTimer!==null) clearTimeout(hushHitTimer);
    hushHitTimer=setTimeout(()=>{
      if(MAP_EL) MAP_EL.classList.remove('hush-hit');
      hushHitTimer=null;
    }, 240);
  }
  if(HUSH_JUMP_EL){
    HUSH_JUMP_EL.classList.remove('active');
    void HUSH_JUMP_EL.offsetWidth;
    HUSH_JUMP_EL.classList.add('active');
    if(hushJumpTimer!==null) clearTimeout(hushJumpTimer);
    hushJumpTimer=setTimeout(()=>{
      if(HUSH_JUMP_EL) HUSH_JUMP_EL.classList.remove('active');
      hushJumpTimer=null;
    }, 460);
  }
  if(navigator.vibrate) navigator.vibrate([14, 24, 170, 34, 220, 18, 160]);
  if(!actx) return;
  const t0=actx.currentTime;
  const out=actx.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(1.0, t0+0.003);
  out.gain.exponentialRampToValueAtTime(0.0001, t0+0.55);
  out.connect(actx.destination);

  const nbuf=actx.createBuffer(1, Math.max(1, Math.floor(actx.sampleRate*0.46)), actx.sampleRate);
  const nd=nbuf.getChannelData(0);
  for(let i=0;i<nd.length;i++){
    const env=1-(i/nd.length);
    nd[i]=(Math.random()*2-1) * env * (0.7 + Math.random()*0.6);
  }
  const nsrc=actx.createBufferSource();
  const nf=actx.createBiquadFilter();
  nf.type='bandpass';
  nf.frequency.setValueAtTime(1700, t0);
  nf.frequency.exponentialRampToValueAtTime(380, t0+0.42);
  nf.Q.setValueAtTime(5.6, t0);
  nsrc.buffer=nbuf;
  nsrc.connect(nf); nf.connect(out);
  nsrc.start(t0); nsrc.stop(t0+0.48);

  const bass=actx.createOscillator();
  const bg=actx.createGain();
  bass.type='triangle';
  bass.frequency.setValueAtTime(88, t0);
  bass.frequency.exponentialRampToValueAtTime(26, t0+0.52);
  bg.gain.setValueAtTime(0.0001, t0);
  bg.gain.exponentialRampToValueAtTime(0.48, t0+0.008);
  bg.gain.exponentialRampToValueAtTime(0.0001, t0+0.46);
  bass.connect(bg); bg.connect(out);
  bass.start(t0); bass.stop(t0+0.55);

  const stab=actx.createOscillator();
  const sg=actx.createGain();
  stab.type='square';
  stab.frequency.setValueAtTime(21, t0);
  sg.gain.setValueAtTime(0.0001, t0);
  sg.gain.exponentialRampToValueAtTime(0.24, t0+0.03);
  sg.gain.exponentialRampToValueAtTime(0.0001, t0+0.5);
  stab.connect(sg); sg.connect(out);
  stab.start(t0); stab.stop(t0+0.56);
}

function spawnHushBehindPlayer(){
  let dx=door?door.x-px:0;
  let dy=door?door.y-py:0;
  let len=Math.hypot(dx,dy);
  if(len<0.001){
    const a=Math.random()*Math.PI*2;
    dx=Math.cos(a);
    dy=Math.sin(a);
    len=1;
  }
  const nx=dx/len;
  const ny=dy/len;
  const rx=-ny;
  const ry=nx;
  const back=24 + Math.random()*9;
  const lateral=(Math.random()-0.5)*14;
  hush.x=px - nx*back + rx*lateral;
  hush.y=py - ny*back + ry*lateral;
  hush.vx=0;
  hush.vy=0;
  hush.active=true;
}

function startHorrorSequence(){
  if(depth!==0 || !door || isOnboardingActive()) return;
  resetHorrorState();
  horrorPhase=HORROR_SEQUENCE.HORROR_ONSET;
  const now=performance.now();
  horrorStartMs=now;
  horrorLastTickMs=now;
  hushBlinkNextAtMs=now + 1200 + Math.random()*600;
  spawnHushBehindPlayer();
  hushLastDist=hushDistance();
  pushEvent('// final key acquired. the hush heard it.');
}

function startDoorSwarm(){
  if(!door) return;
  if(horrorPhase===HORROR_SEQUENCE.DOOR_SWARM || horrorPhase===HORROR_SEQUENCE.DESCENT_RUPTURE) return;
  const now=performance.now();
  doorRevealCutscene=false;
  horrorPhase=HORROR_SEQUENCE.DOOR_SWARM;
  doorSwarmStartMs=now;
  doorSwarmArmMs=now+900;
  doorSwarmRadius=0;
  doorSwarmCenter={x:door.x, y:door.y};
  nextDoorSwarmPulseMs=now+180;
  hushEyes = [];
  corridorStatues=[];
  const rows=9;
  for(let r=0;r<rows;r++){
    const t=(r+1)/(rows+1);
    corridorStatues.push({t, side:-1, wobble:(Math.random()-0.5), pulse:Math.random()*Math.PI*2, x:px, y:py, lurch:0});
    corridorStatues.push({t, side:1, wobble:(Math.random()-0.5), pulse:Math.random()*Math.PI*2, x:px, y:py, lurch:0});
    if((r%3)===1){
      corridorStatues.push({t:t+0.03, side:0, wobble:(Math.random()-0.5)*0.6, pulse:Math.random()*Math.PI*2, x:px, y:py, lurch:0});
    }
  }
  hushBlinkNextAtMs=now + 980;
  hushBlinkStress=Math.max(hushBlinkStress, 0.62);
  hushLockedUntilMs=Math.max(hushLockedUntilMs, now+920);
  if((now-lastHushEventMs)>900){
    pushEvent('// corridor of statues forms. keep advancing.');
    lastHushEventMs=now;
  }
}

function canDescendThroughSwarm(nowMs=performance.now()){
  if(horrorPhase!==HORROR_SEQUENCE.DOOR_SWARM) return true;
  const movingRecently=(nowMs-lastMoveAtMs) < Math.max(84, currentMoveIntervalMs()*1.2);
  return nowMs>=doorSwarmArmMs && movingRecently && !hushBlinkActive;
}

function isDoorInViewportNow(){
  if(!door || depth!==0 || isOnboardingActive()) return false;
  if(VIEW_W===0 || VIEW_H===0) computeViewDims();
  const halfC=Math.floor(VIEW_W/2), halfR=Math.floor(VIEW_H/2);
  const ox=px-halfC, oy=py-halfR;
  return door.x>=ox && door.x<ox+VIEW_W && door.y>=oy && door.y<oy+VIEW_H;
}

function startDoorRevealCutscene(nowMs=performance.now()){
  if(doorRevealTriggered || !door) return;
  doorRevealTriggered=true;
  doorRevealCutscene=true;
  doorRevealStartedMs=nowMs;
  doorRevealEndsMs=nowMs+2450;
  let dx=door.x-px, dy=door.y-py;
  let len=Math.hypot(dx,dy);
  if(len<0.0001){
    const a=Math.random()*Math.PI*2;
    dx=Math.cos(a); dy=Math.sin(a); len=1;
  }
  const nx=dx/len, ny=dy/len;
  const rx=-ny, ry=nx;
  doorRevealHushTarget={
    x:px - nx*(36+Math.random()*8) + rx*((Math.random()-0.5)*8),
    y:py - ny*(36+Math.random()*8) + ry*((Math.random()-0.5)*8),
  };
  hushLockedUntilMs=Math.max(hushLockedUntilMs, nowMs+1000);
  hushPingHeat=Math.max(hushPingHeat, 0.5);
  triggerGateFlash(220, 520);
  if(navigator.vibrate) navigator.vibrate([24, 72, 36, 96]);
  pushEvent('// the door sees you. the hush recoils.');
}

function spawnPeripheralEye(nowMs){
  const a=Math.random()*Math.PI*2;
  const r=18+Math.random()*26;
  hushEyes.push({
    x:px+Math.cos(a)*r,
    y:py+Math.sin(a)*r,
    phase:Math.random()*Math.PI*2,
    lastPingAt:0,
    nextPingAt:nowMs + 700 + Math.random()*1900,
  });
}

function isHushLocked(nowMs=performance.now()){
  return nowMs < hushLockedUntilMs;
}

function lockHushForMercy(nowMs=performance.now(), bonusMs=0){
  const hold=1050 + Math.random()*450 + bonusMs;
  hushLockedUntilMs=Math.max(hushLockedUntilMs, nowMs+hold);
}

function maybeLockHushFromInputKey(key, nowMs=performance.now()){
  if(!isHorrorActive() || !hush.active || depth>1 || isOnboardingActive() || doorRevealCutscene) return false;
  let dx=0, dy=0;
  if(key==='ArrowUp' || key==='w' || key==='W') dy=-1;
  else if(key==='ArrowDown' || key==='s' || key==='S') dy=1;
  else if(key==='ArrowLeft' || key==='a' || key==='A') dx=-1;
  else if(key==='ArrowRight' || key==='d' || key==='D') dx=1;
  else return false;

  const toHushX=hush.x-px;
  const toHushY=hush.y-py;
  const towardDot=(dx*toHushX) + (dy*toHushY);
  const reversal=(dx===-lastStepDx && dy===-lastStepDy && (dx!==0 || dy!==0));
  const qualifies = towardDot>0.01 || (reversal && hushDistance()<52);
  if(!qualifies) return false;

  const hold=3000 + Math.random()*1000; // explicit 3–4s confrontation freeze
  hushLockedUntilMs=Math.max(hushLockedUntilMs, nowMs+hold);
  const minSafe=HUSH_TUNE.catchDistance + 0.9;
  const d=Math.max(0.0001, hushDistance());
  if(d<minSafe){
    const ux=(hush.x-px)/d;
    const uy=(hush.y-py)/d;
    hush.x=px + ux*minSafe;
    hush.y=py + uy*minSafe;
  }
  hushLastAdvanceTowardMs=nowMs;
  hushPingHeat=clamp(hushPingHeat-0.26, 0, 2.4);
  if(hushBlinkActive) stopStressBlink();
  hushBlinkNextAtMs=Math.max(hushBlinkNextAtMs, nowMs+hold+220);
  if((nowMs-lastHushEventMs)>1200){
    pushEvent('// you face it. the hush stalls.');
    lastHushEventMs=nowMs;
  }
  return true;
}

function registerHushApproachStep(prevDist, newDist, moveDx=0, moveDy=0, toHushX=0, toHushY=0, nowMs=performance.now()){
  if(!isHorrorActive() || !hush.active || depth>1) return;
  if(!Number.isFinite(prevDist) || !Number.isFinite(newDist)) return;
  const delta=prevDist-newDist;
  const towardDot=(moveDx*toHushX) + (moveDy*toHushY);
  const steppedToward=towardDot>0.01;
  if(steppedToward || delta>0.02){
    hushLastAdvanceTowardMs=nowMs;
    lockHushForMercy(nowMs);
    hushPingHeat=clamp(hushPingHeat-0.04, 0, 2.4);
  } else if(delta<-0.02 && towardDot<=0){
    hushLastRetreatMs=nowMs;
  }
  hushLastDist=newDist;
}

function computeHushStress(){
  const d=hushDistance();
  if(depth===1 && sw2.active){
    const progress=sw2ProgressPct()/100;
    const darkness=clamp(sw2.darkness, 0, 1);
    const fail=clamp(sw2.failCount/6, 0, 1);
    return clamp(0.22 + progress*0.36 + darkness*0.32 + fail*0.28, 0, 1);
  }
  const prox=clamp(1-(d/32), 0, 1);
  const ping=clamp(hushPingHeat/2.4, 0, 1);
  const phaseBump=horrorPhase===HORROR_SEQUENCE.DOOR_SWARM ? 0.22 : horrorPhase===HORROR_SEQUENCE.CHASE_PRESSURE ? 0.14 : 0.08;
  const doorBump=door ? clamp(1-(Math.hypot(door.x-px, door.y-py)/52), 0, 1)*0.2 : 0;
  return clamp((prox*0.46) + (ping*0.28) + phaseBump + doorBump, 0, 1);
}

function stopStressBlink(){
  hushBlinkActive=false;
  hushBlinkEndsMs=0;
  hushBlinkLurchesRemaining=0;
  if(HUSH_JUMP_EL) HUSH_JUMP_EL.classList.remove('blink');
}

function startStressBlink(nowMs, stress){
  hushBlinkActive=true;
  hushBlinkStress=stress;
  hushBlinkEndsMs=nowMs + (80 + stress*120);
  hushBlinkLurchesRemaining=1 + Math.floor(stress*1.6);
  hushBlinkNextLurchMs=nowMs + 44;
  hushBlinkNextAtMs=nowMs + Math.max(720, (1950 - stress*820) + Math.random()*650);
  if(HUSH_JUMP_EL){
    HUSH_JUMP_EL.classList.remove('blink');
    void HUSH_JUMP_EL.offsetWidth;
    HUSH_JUMP_EL.classList.add('blink');
  }
  triggerGateFlash(70 + stress*80, 150 + stress*200);
  if(navigator.vibrate) navigator.vibrate([10, 26, 52, 32]);
  if(horrorPhase===HORROR_SEQUENCE.DOOR_SWARM && corridorStatues.length>0){
    for(const s of corridorStatues){
      s.lurch=Math.max(s.lurch, 0.8 + Math.random()*1.2);
    }
  }
}

function updateStatueCorridor(nowMs, dt){
  if(!door || corridorStatues.length===0) return;
  const dx=door.x-px;
  const dy=door.y-py;
  const len=Math.max(0.001, Math.hypot(dx,dy));
  const nx=dx/len, ny=dy/len;
  const rx=-ny, ry=nx;
  const maxAlong=Math.max(8, Math.min(28, len*0.88));
  const lockHeld=isHushLocked(nowMs);
  for(const s of corridorStatues){
    const along=1.6 + s.t*maxAlong;
    const latMag=1.8 + s.t*2.6 + s.wobble*0.8;
    const lat=s.side===0 ? 0 : s.side*latMag;
    const targetX=px + nx*along + rx*lat;
    const targetY=py + ny*along + ry*lat;
    if(!hushBlinkActive){
      s.lurch=Math.max(0, s.lurch - dt*(lockHeld ? 5.2 : 3.4));
    }
    const pulse=(lockHeld && !hushBlinkActive) ? 0 : 0.22*Math.sin(nowMs*0.003 + s.pulse);
    const surge=(lockHeld && !hushBlinkActive) ? 0 : (s.lurch + pulse);
    const lureX=targetX + nx*surge;
    const lureY=targetY + ny*surge;
    const ease=hushBlinkActive ? 0.33 : (lockHeld ? 0.08 : 0.16);
    s.x += (lureX - s.x) * ease;
    s.y += (lureY - s.y) * ease;
  }
  if(nowMs>=nextDoorSwarmPulseMs){
    nextDoorSwarmPulseMs=nowMs + 220 + Math.random()*180;
    hushPingHeat=clamp(hushPingHeat + 0.14, 0, 2.4);
  }
}

function updateSpyEyes(nowMs, dt){
  if(!isHorrorActive() || depth>1) return;
  if(depth===1){
    // Sub World 2 avoids the "swarm toy" read: no floating eye crowd.
    hushEyes=[];
    return;
  }
  if(horrorPhase===HORROR_SEQUENCE.DOOR_SWARM){
    updateStatueCorridor(nowMs, dt);
    return;
  }
  const aliveSec=Math.max(0, (nowMs-horrorStartMs)/1000);
  const targetCount=Math.min(HUSH_TUNE.maxEyes, Math.floor(7 + aliveSec*2.25));
  while(hushEyes.length<targetCount) spawnPeripheralEye(nowMs);
  if(hushEyes.length>targetCount+4) hushEyes.length=targetCount+4;

  if(doorRevealCutscene && door){
    const dx=door.x-px;
    const dy=door.y-py;
    const len=Math.max(0.001, Math.hypot(dx,dy));
    const nx=dx/len, ny=dy/len;
    const rx=-ny, ry=nx;
    const eyeCount=Math.max(12, Math.min(26, hushEyes.length));
    for(let i=0;i<eyeCount;i++){
      const t=(i+1)/(eyeCount+1);
      const lateral=((i%2===0)?1:-1) * (1.2 + ((i%4)*0.55));
      const anchorX=px + nx*(2 + t*Math.min(18, len*0.6));
      const anchorY=py + ny*(2 + t*Math.min(18, len*0.6));
      const eye=hushEyes[i];
      eye.x += (anchorX + rx*lateral - eye.x) * 0.14;
      eye.y += (anchorY + ry*lateral - eye.y) * 0.14;
      if((i%3)===0 && (nowMs-eye.lastPingAt)>260){
        eye.lastPingAt=nowMs;
      }
    }
  }

  for(const eye of hushEyes){
    const dx=px-eye.x;
    const dy=py-eye.y;
    const d=Math.hypot(dx,dy) || 0.001;
    const ux=dx/d;
    const uy=dy/d;
    // Eyes hover at middle distance, drifting in an orbit while constantly
    // biasing toward the player.
    const settle=(d>30?1:(d<9?-1:0.28));
    eye.x += ux * settle * dt * 6.4;
    eye.y += uy * settle * dt * 6.4;
    const tx=-uy, ty=ux;
    const orbitSpeed=2.8 + 1.2*Math.sin(nowMs*0.0018 + eye.phase);
    eye.x += tx * orbitSpeed * dt;
    eye.y += ty * orbitSpeed * dt;

    if(nowMs>=eye.nextPingAt){
      eye.lastPingAt=nowMs;
      eye.nextPingAt=nowMs + 560 + Math.random()*1300;
      hushPingHeat=clamp(hushPingHeat + 0.3, 0, 2.2);
      if((nowMs-lastHushEventMs) > 1700){
        pushEvent('// watcher blink. your location relayed.');
        lastHushEventMs=nowMs;
      }
    }
    if(d<7.5){
      hushPingHeat=clamp(hushPingHeat + dt*0.45, 0, 2.3);
    }
  }
  hushEyes = hushEyes.filter((eye)=>Math.hypot(eye.x-px, eye.y-py) < 76);
}

function updateSubWorld2RiteTick(nowMs, dt){
  if(depth!==1 || !sw2.active) return;
  const drive=sw2AudioDriveLevel(nowMs, dt);
  sw2.driverEnergy=drive;
  sw2.caught=(nowMs-sw2.lastLossMs) < 900;
  sw2.charge=sw2ProgressPct();

  if(sw2.phase===SW2_PHASE.BOOT_SILENCE && (nowMs-sw2.phaseStartedMs)>=SW2_TUNE.bootSilenceMs){
    setSw2Phase(SW2_PHASE.AREA_LOOP);
    return;
  }
  if(sw2.phase===SW2_PHASE.BOOT_SILENCE) return;

  if(sw2.phase===SW2_PHASE.POST_DOOR){
    sw2.darkness=clamp(sw2.darkness + dt*0.012, 0, 0.98);
    return;
  }

  const movingRecently=(nowMs-lastMoveAtMs)<=SW2_TUNE.approachFreshMs;
  const hubDist=Math.hypot(px-sw2.hubX, py-sw2.hubY);
  const killRadius=sw2KillRadius();
  const processThreat=(area, lossRadius, allowGrab)=>{
    const dToArea=Math.hypot(px-area.x, py-area.y);
    if(dToArea<=SW2_TUNE.areaEnterRadius){
      if(!area.wasInside){
        area.wasInside=true;
        area.revealUntilMs=nowMs + SW2_TUNE.revealMs;
      } else {
        area.revealUntilMs=Math.max(area.revealUntilMs, nowMs+220);
      }
    }
    const dThreat=Math.hypot(px-area.threatX, py-area.threatY);
    if(!area.complete && nowMs>=area.caughtLockUntilMs && dThreat<=lossRadius){
      const intensity=clamp((lossRadius+0.6-dThreat)/(lossRadius+0.6), 0.35, 1);
      if(triggerSw2Loss(nowMs, intensity)){
        area.caughtLockUntilMs=nowMs + SW2_TUNE.finalLossCooldownMs;
        const bx=(area.threatX-px) || (Math.random()<0.5?-1:1);
        const by=(area.threatY-py) || (Math.random()<0.5?-1:1);
        const bl=Math.max(0.001, Math.hypot(bx, by));
        const push=2.3 + Math.random()*1.2;
        area.threatX=px + (bx/bl)*push;
        area.threatY=py + (by/bl)*push;
      }
    }
    if(!allowGrab || sw2.heldItem || area.grabbed || area.complete) return;
    if(!movingRecently) return;
    if(dThreat>=SW2_TUNE.grabMinRadius && dThreat<=SW2_TUNE.grabMaxRadius){
      area.grabbed=true;
      sw2.heldItem=true;
      sw2.heldFromArea=area.idx;
      area.revealUntilMs=Math.max(area.revealUntilMs, nowMs + SW2_TUNE.revealMs);
      if(!sw2.firstLineShown){
        pushEvent('// take it from their hands. bring it back.');
        sw2.firstLineShown=true;
      }
      playSw2Punctuation(0.54 + drive*0.22);
    }
  };

  if(sw2.phase===SW2_PHASE.AREA_LOOP){
    let area=currentSw2Area();
    if((!area || area.complete) && !sw2.heldItem){
      const nextIdx=nextIncompleteSw2AreaIndex();
      if(nextIdx>=0){
        sw2.currentAreaIdx=nextIdx;
        area=currentSw2Area();
      }
    }
    if(area){
      processThreat(area, killRadius, true);
    }
    if(sw2.heldItem && hubDist<=SW2_TUNE.hubDepositRadius && movingRecently){
      const src=sw2.areas[sw2.heldFromArea];
      if(src && !src.complete){
        src.complete=true;
        src.revealUntilMs=Math.max(src.revealUntilMs, nowMs+1100);
        sw2.completedCount++;
      }
      sw2.heldItem=false;
      sw2.heldFromArea=-1;
      const nextIdx=nextIncompleteSw2AreaIndex();
      if(nextIdx>=0){
        sw2.currentAreaIdx=nextIdx;
      }
      sw2.charge=sw2ProgressPct();
      playSw2Punctuation(0.46 + drive*0.2);
      if(sw2.completedCount>=SW2_TUNE.areaCount){
        startSw2FinalDark(nowMs);
        return;
      }
    }
    return;
  }

  if(sw2.phase===SW2_PHASE.FINAL_DARK){
    sw2.darkness=clamp(Math.max(sw2.darkness, 0.82) + dt*0.02, 0, 0.97);
    for(const area of sw2.areas){
      const dx=px-area.threatX;
      const dy=py-area.threatY;
      const d=Math.max(0.0001, Math.hypot(dx,dy));
      const ux=dx/d;
      const uy=dy/d;
      const jitter=Math.sin((nowMs*0.0018) + area.idx*1.9) * 0.14;
      const tx=-uy, ty=ux;
      const speed=SW2_TUNE.finalDriftSpeed * (0.72 + sw2.failCount*0.08 + drive*0.34);
      area.threatX += (ux*speed + tx*jitter) * dt;
      area.threatY += (uy*speed + ty*jitter) * dt;
      if(nowMs>=area.caughtLockUntilMs && d<=SW2_TUNE.finalCatchRadius){
        if(triggerSw2Loss(nowMs, 1)){
          area.caughtLockUntilMs=nowMs + SW2_TUNE.finalLossCooldownMs;
          const push=3 + Math.random()*1.4;
          area.threatX=px - ux*push;
          area.threatY=py - uy*push;
          sw2.caught=true;
        }
      }
    }
    sw2.charge=sw2ProgressPct();
  }
}

function hushTargetPoint(isMoving){
  if(horrorPhase===HORROR_SEQUENCE.DOOR_SWARM){
    return {x:px, y:py};
  }
  if(isMoving && trail.length>5){
    const idx=Math.max(0, trail.length-5);
    return {x:trail[idx].x, y:trail[idx].y};
  }
  return {x:px, y:py};
}

function updateHushMotion(nowMs, dt){
  if(!hush.active || depth>1) return;
  const stepMs=Math.max(44, currentMoveIntervalMs());
  const playerSpeed=1000/stepMs; // cells/sec
  if(depth===1){
    return;
  }
  if(doorRevealCutscene){
    let tx=doorRevealHushTarget?.x ?? hush.x;
    let ty=doorRevealHushTarget?.y ?? hush.y;
    if(door){
      const dx=door.x-px, dy=door.y-py;
      const len=Math.max(0.001, Math.hypot(dx,dy));
      const nx=dx/len, ny=dy/len;
      tx=px - nx*42;
      ty=py - ny*42;
      doorRevealHushTarget={x:tx, y:ty};
    }
    const dx=tx-hush.x, dy=ty-hush.y;
    const d=Math.hypot(dx,dy);
    if(d>0.0001){
      const ux=dx/d, uy=dy/d;
      const retreatSpeed=playerSpeed*0.92;
      hush.x += ux*retreatSpeed*dt;
      hush.y += uy*retreatSpeed*dt;
      hush.vx=ux*retreatSpeed;
      hush.vy=uy*retreatSpeed;
    }
    return;
  }
  if(isHushLocked(nowMs)) return;
  if(hushBlinkActive){
    while(hushBlinkLurchesRemaining>0 && nowMs>=hushBlinkNextLurchMs){
      const targetX=px;
      const targetY=py;
      const dx=targetX-hush.x;
      const dy=targetY-hush.y;
      const d=Math.max(0.0001, Math.hypot(dx,dy));
      const ux=dx/d, uy=dy/d;
      const lurchDist=0.45 + hushBlinkStress*0.9 + (horrorPhase===HORROR_SEQUENCE.DOOR_SWARM ? 0.25 : 0);
      hush.x += ux*lurchDist;
      hush.y += uy*lurchDist;
      hush.vx=ux*lurchDist*8;
      hush.vy=uy*lurchDist*8;
      hushBlinkLurchesRemaining--;
      hushBlinkNextLurchMs = nowMs + 95 + Math.random()*140;
    }
    return;
  }

  const stress=computeHushStress();
  let speed=playerSpeed * (0.14 + stress*0.14);
  if(horrorPhase===HORROR_SEQUENCE.HORROR_ONSET) speed*=0.62;
  if(horrorPhase===HORROR_SEQUENCE.DOOR_SWARM) speed*=0.72;
  const target=hushTargetPoint(false);
  const dx=target.x-hush.x;
  const dy=target.y-hush.y;
  const d=Math.hypot(dx,dy);
  if(d<0.0001) return;
  const ux=dx/d;
  const uy=dy/d;
  hush.x += ux*speed*dt;
  hush.y += uy*speed*dt;
  hush.vx=ux*speed;
  hush.vy=uy*speed;
  hushPingHeat=clamp(hushPingHeat - dt*0.44, 0, 2.0);
}

function resetSubWorld1AfterHush(msg='// the hush catches you. keys scatter back into the field.'){
  onboardingPhase=ONBOARDING_PHASES.WORLD_LIVE;
  depth=0;
  const cp=subWorld1Start || {x:0,y:0};
  px=cp.x;
  py=cp.y;
  lastStepDx=0;
  lastStepDy=0;
  trail=[];
  fog=new Map();
  keyMap=new Map();
  keysFound=0;
  keysTotal=0;
  door=null;
  nextSpawnAt=0;
  voidFatigue=0;
  worldBoundaryLatch=false;
  worldBoundaryFriction=0;
  curChunkKey='';
  curChunkIdx=-1;
  resetHorrorState();
  revealAroundWithRadius(px, py, Math.max(FOG_R, 9));
  initKeysForSession();
  updateAudio();
  hushPunishLockUntilMs=performance.now()+560;
  pushEvent(msg);
}

function resetSubWorld2AfterHush(msg='// the hush tears through you. you wake at the start of this depth.'){
  depth=1;
  px=subWorld2Start.x;
  py=subWorld2Start.y;
  lastStepDx=0;
  lastStepDy=0;
  trail=[];
  fog=new Map();
  keyMap=new Map();
  keysFound=0;
  keysTotal=0;
  door=null;
  nextSpawnAt=0;
  voidFatigue=0;
  worldBoundaryLatch=false;
  worldBoundaryFriction=0;
  curChunkKey='';
  curChunkIdx=-1;
  resetHorrorState();
  revealAroundWithRadius(px, py, 7);
  updateAudio();
  hushPunishLockUntilMs=performance.now()+560;
  startSubWorld2Sequence();
  pushEvent(msg);
}

function punishByHush(){
  const now=performance.now();
  if(now<hushPunishLockUntilMs) return;
  hushPunishLockUntilMs=now+640;
  playHushRupture();
  if(depth===1){
    triggerSw2Loss(now, 1);
    return;
  }
  if(depth>1){
    resetSubWorld1AfterHush('// the hush drags you back to the first depth.');
    return;
  }
  resetSubWorld1AfterHush();
}

function maybeHushCapture(){
  if(!isHorrorActive() || !hush.active || depth>1) return false;
  if(depth===1 && sw2.active) return false;
  if(depth===0 && doorRevealCutscene) return false;
  if(hushDistance() > HUSH_TUNE.catchDistance) return false;
  punishByHush();
  return true;
}

function updateHorrorTick(){
  if(!isHorrorActive()) return;
  const now=performance.now();
  if(horrorLastTickMs===0) horrorLastTickMs=now;
  const dt=Math.min(0.08, Math.max(0.001, (now-horrorLastTickMs)/1000));
  horrorLastTickMs=now;

  if(paused || depth>1 || isOnboardingActive()){
    return;
  }

  if(depth===1){
    updateSubWorld2RiteTick(now, dt);
    updateSpyEyes(now, dt);
    updateHushMotion(now, dt);
    maybeHushCapture();
    return;
  }

  if(horrorPhase===HORROR_SEQUENCE.HORROR_ONSET && (now-horrorStartMs)>=HUSH_TUNE.onsetMs){
    horrorPhase=HORROR_SEQUENCE.CHASE_PRESSURE;
    if((now-lastHushEventMs)>700){
      pushEvent('// the hush is behind you. stillness feeds it.');
      lastHushEventMs=now;
    }
  }
  if((horrorPhase===HORROR_SEQUENCE.HORROR_ONSET || horrorPhase===HORROR_SEQUENCE.CHASE_PRESSURE) &&
     !doorRevealTriggered && isDoorInViewportNow()){
    startDoorRevealCutscene(now);
  }
  if(doorRevealCutscene && now>=doorRevealEndsMs){
    doorRevealCutscene=false;
    startDoorSwarm();
    if((now-lastHushEventMs)>500){
      pushEvent('// statues wait. keep walking to hold the hush.');
      lastHushEventMs=now;
    }
  }

  const stress=computeHushStress();
  if(hushBlinkActive && now>=hushBlinkEndsMs){
    stopStressBlink();
  }
  if(!hushBlinkActive && now>=hushBlinkNextAtMs){
    if(isHushLocked(now)){
      hushBlinkNextAtMs=now+120;
    } else {
      startStressBlink(now, stress);
    }
  }
  updateSpyEyes(now, dt);
  updateHushMotion(now, dt);
  maybeHushCapture();
}

// Called once when the player crosses out of the intro into the live
// world. Picks a fuzzy 2–4 total target and schedules — but does not
// place — the first key. Placement happens later in maybeSpawnScheduledKey
// so the beacon lands relative to where the player has wandered to.
function initKeysForSession(){
  if(keysTotal>0) return;  // already initialized for this session
  if(depth===0) setSubWorld1Checkpoint(px, py);
  keyMap = new Map();
  keysFound = 0;
  door = null;
  nextSpawnAt = 0;
  resetHorrorState();
  keysTotal = 2 + Math.floor(Math.random() * 3); // 2..4 inclusive
  scheduleNextKey(KEY_FIRST_DELAY_MIN_MS, KEY_FIRST_DELAY_MAX_MS);
  pushEvent(`// ${keysTotal} keys await discovery. listen for them.`);
}

function scheduleNextKey(minDelayMs, maxDelayMs){
  const delay = minDelayMs + Math.random() * (maxDelayMs - minDelayMs);
  nextSpawnAt = Date.now() + delay;
}

// Per-frame check from the main loop. When the scheduled time passes and
// the world has no active key, we materialise one near the player's
// current position — so the new beacon is always within reasonable reach
// of wherever you've wandered while waiting.
function maybeSpawnScheduledKey(){
  if(nextSpawnAt === 0) return;
  if(Date.now() < nextSpawnAt) return;
  if(keyMap.size > 0) return;            // a beacon already exists
  if(keysFound >= keysTotal) return;     // nothing left to spawn
  spawnKeyNear(px, py, KEY_PLACEMENT_MIN, KEY_PLACEMENT_MAX);
  nextSpawnAt = 0;
  pushEvent('// you sense a new presence in the static.');
}

function spawnKeyNear(cx, cy, minDist, maxDist){
  const p = placeBeacon(cx, cy, minDist, maxDist);
  keyMap.set(`${p.x},${p.y}`, p);
  // Pre-reveal a small halo so terrain context illuminates as the player
  // approaches the beacon, instead of the key floating against pure fog.
  revealAroundWithRadius(p.x, p.y, 5);
}

// Place a single door far from current player position, using the same
// scatter mechanic as keys. Called once when the final key is collected.
function spawnDoor(){
  door = placeBeacon(px, py, DOOR_MIN_DIST, DOOR_MAX_DIST);
  revealAroundWithRadius(door.x, door.y, 6);
}

// Step through the door: stop the overworld, drop the player into a
// blank void layer one level deeper. State that belongs to the previous
// level (beacons, fog, trail, voice routing) is wiped so the new level
// reads as a clean slate.
function descendThroughDoor(){
  horrorPhase=HORROR_SEQUENCE.DESCENT_RUPTURE;
  triggerGateFlash(420, 720);
  pulseRevealRings(px, py, [3, 6, 10, 16]);
  if(navigator.vibrate) navigator.vibrate([60, 80, 100, 140]);

  depth++;
  stopAllVoices();
  stopWorldLayerVoice();
  silenceAmbientDrone();

  px = 0; py = 0;
  lastStepDx=0;
  lastStepDy=0;
  trail = [];
  fog = new Map();
  keyMap = new Map();
  keysFound = 0;
  keysTotal = 0;
  door = null;
  nextSpawnAt = 0;
  resetHorrorState();
  subWorld2Start={x:0,y:0};
  subWorld2HasKeys=false;
  voidFatigue = 0;
  worldBoundaryLatch = false;
  worldBoundaryFriction = 0;
  lastMoveAtMs = 0;
  curPlayerCtx = null;
  curChunkIdx = -1;
  curChunkKey = '';

  revealAroundWithRadius(px, py, 6);
  startSubWorld2Sequence();
}

// Sensory feedback on pickup: brief shimmer chime layered over the world
// audio, a localized reveal pulse so the surrounding fog flares open, the
// shared gate-flash vignette, and a haptic tap on supporting devices.
function playKeyPickupChime(isFinal){
  if(!actx) return;
  const t0 = actx.currentTime;
  const out = actx.createGain();
  out.gain.setValueAtTime(0, t0);
  out.gain.linearRampToValueAtTime(isFinal ? 0.32 : 0.22, t0 + 0.01);
  out.gain.exponentialRampToValueAtTime(0.0005, t0 + (isFinal ? 1.4 : 0.9));
  out.connect(actx.destination);
  // Bell-ish stack: fundamental + perfect fifth + octave + sparkle, with
  // light detune so successive picks don't sound identical.
  const detune = (Math.random()-0.5) * 12;
  const partials = isFinal
    ? [880, 1318.5, 1760, 2640]
    : [988, 1480, 1976];
  partials.forEach((freq, i) => {
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = i===0 ? 'sine' : 'triangle';
    o.frequency.value = freq;
    o.detune.value = detune + i*3;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(1/(i+1.5), t0 + 0.005 + i*0.012);
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.55 + i*0.18);
    o.connect(g); g.connect(out);
    o.start(t0);
    o.stop(t0 + 1.6);
  });
}

function onKeyPickup(isFinal){
  pulseRevealRings(px, py, [2, 4, 7, 11]);
  triggerGateFlash(isFinal ? 320 : 180, isFinal ? 520 : 280);
  playKeyPickupChime(isFinal);
  if(navigator.vibrate) navigator.vibrate(isFinal ? [40, 60, 80] : 35);
}

function stampChunk(c){
  if(c.terrainRadius==null){
    const len=c.analysis?.length||1;
    c.terrainRadius=clamp(TERRAIN_R_MIN+len*6, TERRAIN_R_MIN, TERRAIN_R_MAX);
  }
  if(!c.iconChar) c.iconChar=iconFor(c.analysis);
  // Deliberately no live template rebuild here; we finalize once at load end
  // to avoid visible terrain/color oscillation during play.
}

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function rightVector(){
  return { dx: -INTRO_SCENE.forwardDy, dy: INTRO_SCENE.forwardDx };
}
function introForwardDistanceAt(x,y){
  const rx=x-introAnchorX;
  const ry=y-introAnchorY;
  return (rx * INTRO_SCENE.forwardDx) + (ry * INTRO_SCENE.forwardDy);
}
function introLateralOffsetAt(x,y){
  const rx=x-introAnchorX;
  const ry=y-introAnchorY;
  const rv=rightVector();
  return (rx * rv.dx) + (ry * rv.dy);
}
function gatePosAtDistance(dist){
  return {
    x: introAnchorX + (INTRO_SCENE.forwardDx * dist),
    y: introAnchorY + (INTRO_SCENE.forwardDy * dist)
  };
}
function primaryGatePos(){ return gatePosAtDistance(INTRO_SCENE.primaryGateDist); }
function finalGatePos(){ return gatePosAtDistance(INTRO_SCENE.finalGateDist); }
function isOnPrimaryGate(x,y){
  const g=primaryGatePos();
  return x===g.x && y===g.y;
}
function hasCrossedFinalGate(x,y){
  return introForwardDistanceAt(x,y) >= INTRO_SCENE.finalGateDist;
}
function isOnboardingActive(){
  return onboardingPhase===ONBOARDING_PHASES.INTRO_PRELUDE || onboardingPhase===ONBOARDING_PHASES.INTRO_FUNNEL;
}
function isPrelude(){ return onboardingPhase===ONBOARDING_PHASES.INTRO_PRELUDE; }
function isFunnel(){ return onboardingPhase===ONBOARDING_PHASES.INTRO_FUNNEL; }
function funnelWidthAt(forwardDist){
  const start=INTRO_SCENE.funnelStartDist;
  const end=INTRO_SCENE.finalGateDist;
  const t=clamp((forwardDist-start)/Math.max(1,end-start), 0, 1);
  return Math.round(INTRO_SCENE.funnelWidthStart + (INTRO_SCENE.funnelWidthEnd-INTRO_SCENE.funnelWidthStart)*t);
}
function canMoveInOnboarding(nx,ny,dx,dy){
  const deltaAlong=(dx * INTRO_SCENE.forwardDx) + (dy * INTRO_SCENE.forwardDy);
  // No backwards during onboarding.
  if(deltaAlong<0) return false;
  if(isPrelude()){
    // Prelude is intentionally strict: only forward steps to hit the first gate.
    return deltaAlong>0;
  }
  if(!isFunnel()) return true;
  const along=introForwardDistanceAt(nx,ny);
  const lateral=Math.abs(introLateralOffsetAt(nx,ny));
  const w=funnelWidthAt(along);
  return lateral<=w;
}
function startFunnelIntro(){
  onboardingPhase=ONBOARDING_PHASES.INTRO_FUNNEL;
  introDistance=Math.max(introDistance, introForwardDistanceAt(px,py));
  pushEvent('// gate open: follow the funnel.');
  runGateFlashPulse(px, py);
  onboardingHoldLastMs=0;
  updateOnboardingButton();
}

// ── Fog ───────────────────────────────────────────────────────────────────────
function currentFovRadius(){
  if(!isOnboardingActive()) return FOG_R;
  if(isPrelude()) return Math.max(8, INTRO_SCENE.primaryGateDist + 2);
  // Keep intro void feeling while always showing enough terrain for movement read.
  const p=introProgress();
  return Math.max(6, Math.round(6 + (FOG_R-6) * Math.pow(p, 2.0)));
}
function revealAround(x,y){
  revealAroundWithRadius(x,y,currentFovRadius());
}

// ── Movement + sound ──────────────────────────────────────────────────────────
function isIntroActive(){ return isOnboardingActive(); }
function isWorldLive(){ return onboardingPhase===ONBOARDING_PHASES.WORLD_LIVE || onboardingPhase===ONBOARDING_PHASES.INTRO_DISABLED_SESSION; }
function introProgress(){
  const d=Math.max(introDistance, introForwardDistanceAt(px,py));
  return clamp(d/INTRO_SCENE.introDistanceSteps, 0, 1);
}
function storyMoveScale(){
  if(!storyMode) return 1;
  return REC.recState().slow ? 1.9 : 1;   // quiet means careful means slow
}
function currentMoveIntervalMs(){
  if(isIntroActive()){
    const p=introProgress();
    return Math.round(INTRO_SCENE.speedStartMs + (INTRO_SCENE.speedEndMs-INTRO_SCENE.speedStartMs)*p);
  }
  let ms = MOVE_MS * storyMoveScale();
  ms *= (1 + worldBoundaryFriction * (WORLD_BOUNDARY_FRICTION.maxMult - 1));
  if(curPlayerCtx && !curPlayerCtx.onTerrain){
    const trudge = VOID_TRUDGE.startPenalty + (VOID_TRUDGE.maxPenalty-VOID_TRUDGE.startPenalty)*voidFatigue;
    ms *= trudge;
  }
  if(doorRevealCutscene && depth===0){
    const span=Math.max(1, doorRevealEndsMs-doorRevealStartedMs);
    const t=clamp((performance.now()-doorRevealStartedMs)/span, 0, 1);
    ms *= (1.68 + 0.34*Math.sin(t*Math.PI));
    return Math.round(clamp(ms, 90, 230));
  }
  if(depth===0 && horrorPhase===HORROR_SEQUENCE.DOOR_SWARM){
    const doorDist=door ? Math.hypot(door.x-px, door.y-py) : 22;
    const nearGate=clamp(1-(doorDist/28), 0, 1);
    ms *= 1.22 + nearGate*0.58 + (hushBlinkActive ? 0.24 : 0);
    return Math.round(clamp(ms, 92, 255));
  }
  if(depth===1 && sw2.active){
    if(sw2.phase===SW2_PHASE.BOOT_SILENCE){
      ms *= 1.3;
      return Math.round(clamp(ms, 84, 220));
    }
    if(sw2.phase===SW2_PHASE.AREA_LOOP){
      ms *= 1.05 + sw2.darkness*0.22;
      return Math.round(clamp(ms, 68, 184));
    }
    if(sw2.phase===SW2_PHASE.FINAL_DARK){
      ms *= 1.34 + sw2.darkness*0.28 + (sw2.caught ? 0.16 : 0);
      return Math.round(clamp(ms, 92, 245));
    }
    if(sw2.phase===SW2_PHASE.POST_DOOR){
      ms *= 1.24;
      return Math.round(clamp(ms, 84, 220));
    }
  }
  // Keep motion responsive; difficulty is mostly handled by sink/lateral drag.
  return Math.round(clamp(ms, 44, 120));
}
function targetBoundaryFriction(){
  if(isOnboardingActive()) return 0;
  const worldId = (curPlayerCtx && curPlayerCtx.worldId) ? curPlayerCtx.worldId : worldIdAt(px, py);
  const d = worldBoundaryDistance(px, py, worldId, WORLD_BOUNDARY_FRICTION.exitDist + 1);
  if(!worldBoundaryLatch && d <= WORLD_BOUNDARY_FRICTION.enterDist){
    worldBoundaryLatch = true;
  } else if(worldBoundaryLatch && d > WORLD_BOUNDARY_FRICTION.exitDist){
    worldBoundaryLatch = false;
  }
  if(!worldBoundaryLatch) return 0;
  const base = 1 - clamp(
    (d - WORLD_BOUNDARY_FRICTION.fullDist) /
    Math.max(1, WORLD_BOUNDARY_FRICTION.exitDist - WORLD_BOUNDARY_FRICTION.fullDist),
    0,
    1
  );
  const n = hash01((px+0.5)*0.63 + stepCount*0.19, (py-0.5)*0.57 - stepCount*0.13);
  const jitter = (n - 0.5) * 2 * WORLD_BOUNDARY_FRICTION.dither;
  return clamp(base + jitter, 0, 1);
}
function shouldSinkLateral(dx, dy){
  if(isOnboardingActive()) return false;
  if(!curPlayerCtx || curPlayerCtx.onTerrain) return false;
  if(Math.abs(dx)===0) return false;
  // Only apply sink to pure lateral strafing, not diagonal forward travel.
  if(Math.abs(dy)!==0) return false;
  // Require deep void (no dominant nearby chunk), otherwise keep controls clean.
  if(curChunkIdx>=0) return false;
  if(voidFatigue < VOID_SINK.startFatigue) return false;
  const t = clamp(
    (voidFatigue - VOID_SINK.startFatigue) / Math.max(0.0001, (VOID_SINK.maxFatigue - VOID_SINK.startFatigue)),
    0,
    1
  );
  let chance = VOID_SINK.lateralChanceMin + t * (VOID_SINK.lateralChanceMax - VOID_SINK.lateralChanceMin);
  if(Math.abs(dy)===0) chance += VOID_SINK.pureLateralBonus;
  chance = clamp(chance, 0, 0.95);
  const n = hash01((px+dx)*0.83 + stepCount*0.29, (py+dy)*1.27 + voidFatigue*9.1);
  return n < chance;
}
function currentAmbientTarget(){
  if(isIntroActive()){
    const p=introProgress();
    return INTRO_SCENE.ambientStart + (INTRO_SCENE.ambientEnd-INTRO_SCENE.ambientStart)*p;
  }
  return AMBIENT_DRONE_GAIN;
}
function applyIntroAudioEnvelope(){
  if(paused || !actx) return;
  if(!ensureAmbientDrone()) return;
  setAmbientDroneTarget(currentAmbientTarget(), isIntroActive()?0.12:0.35);
}
function updateOnboardingButton(){
  if(!ONBOARDING_TOGGLE_BTN) return;
  const off=onboardingPhase===ONBOARDING_PHASES.INTRO_DISABLED_SESSION;
  ONBOARDING_TOGGLE_BTN.textContent = off ? 'onboarding [o] (off this session)' : 'onboarding [o] (on)';
}
function finalizeIntroTransition(targetPhase, reason='world'){
  const keepMove = forwardHeld() || leftHeld() || rightHeld();
  onboardingPhase=targetPhase;
  introDistance=INTRO_SCENE.introDistanceSteps;
  const landing=nearestWildernessCell(px, py, 24);
  px=landing.x; py=landing.y;
  lastStepDx=0;
  lastStepDy=0;
  trail=[];
  fog = new Map();
  if(moveTimer){ clearTimeout(moveTimer); moveTimer=null; }
  if(keepMove) startMoveTimer();
  pushEvent(`// release: ${reason}.`);
  applyIntroAudioEnvelope();
  updateAudio();
  updateOnboardingButton();
  voidFatigue = 0;
  worldBoundaryLatch = false;
  worldBoundaryFriction = 0;
  lastMoveAtMs = 0;
  initKeysForSession();
}
function releaseIntoWorld(reason='world'){
  if(!isOnboardingActive()) return;
  // Dramatic threshold: same shared gate flash as prelude->funnel.
  finalizeIntroTransition(ONBOARDING_PHASES.WORLD_LIVE, reason);
  runGateFlashPulse(px, py);
  // Override the post-intro ambient target with a brief overshoot, then settle.
  if(actx){
    setAmbientDroneTarget(AMBIENT_DRONE_GAIN*1.6, 0.08);
    setTimeout(()=>setAmbientDroneTarget(AMBIENT_DRONE_GAIN, 0.6), 600);
  }
}
function triggerGateFlash(ms=220, vignetteMs=420){
  if(!MAP_EL) return;
  gateFlashUntilMs = Date.now() + Math.max(ms, vignetteMs);
  MAP_EL.classList.add('flash');
  if(gateFlashTimer!==null) clearTimeout(gateFlashTimer);
  gateFlashTimer=setTimeout(()=>{
    MAP_EL.classList.remove('flash');
    gateFlashTimer=null;
    if(Date.now() >= gateFlashUntilMs){
      gateFlashUntilMs = 0;
    }
  }, ms);
}
function runGateFlashPulse(cx, cy){
  triggerGateFlash();
  pulseRevealRings(cx, cy, [2,4,6,9]);
}
function pulseRevealRings(cx, cy, radii=[2,4,6,9]){
  let i=0;
  const tickReveal=()=>{
    if(i>=radii.length) return;
    revealAroundWithRadius(cx, cy, radii[i++]);
    requestAnimationFrame(tickReveal);
  };
  requestAnimationFrame(tickReveal);
}
function disableOnboardingForSession(){
  if(!isOnboardingActive()) return;
  finalizeIntroTransition(ONBOARDING_PHASES.INTRO_DISABLED_SESSION, 'session off');
  revealAroundWithRadius(px, py, INTRO_SCENE.fogReleaseRadius);
  pushEvent('// onboarding off for this session.');
}

function audibleCandidates(){
  const ctx=playerContext();
  const out=[];
  const center=tileCoordFor(px,py);
  const tileR=Math.max(1, Math.ceil(Math.max(1,audioRadius())/Math.min(WORLD_TILE_W, WORLD_TILE_H))+1);
  const worldIds=[...worldTemplates.keys()];
  for(let ty=center.ty-tileR;ty<=center.ty+tileR;ty++){
    for(let tx=center.tx-tileR;tx<=center.tx+tileR;tx++){
      const ox=tx*WORLD_TILE_W;
      const oy=ty*WORLD_TILE_H;
      for(const worldId of worldIds){
        const tpl=worldTemplates.get(worldId);
        if(!tpl) continue;
        for(const idx of tpl.sampleIdxs){
          const c=chunkAt(idx);
          const emitters=(c.emitters && c.emitters.length>0)
            ? c.emitters
            : [{ x:c.wx, y:c.wy, g:1, id:'c' }];
          let bestD=Infinity, bestG=0, bestX=ox+c.wx, bestY=oy+c.wy;
          for(const em of emitters){
            const vx=ox+em.x, vy=oy+em.y;
            // No worldIdAt-mismatch skip: chunks are audible from their tiled
            // position regardless of which world the warped boundary assigns
            // to that exact cell. Foreign-world contribution is governed by
            // worldMembership in voiceGain instead — softer, blendable.
            const d=Math.hypot(px-vx, py-vy);
            if(d<bestD){
              bestD=d;
              bestG=em.g||1;
              bestX=vx;
              bestY=vy;
            }
          }
          if(bestD>=audioRadius()) continue;
          const g=voiceGain(c,bestD,ctx,bestG);
          if(g>0) out.push({key:`${tx},${ty}:${idx}`, idx, d:bestD, g, wx:bestX, wy:bestY, worldId:c.worldId});
        }
      }
    }
  }
  // Dedupe by chunk idx — the same chunk in different world tiles must NOT
  // become multiple simultaneous voices. Two playbacks of the same buffer at
  // independent phase start times produce comb-filter / Haas-like artifacts
  // and double-summed amplitude (clipping). Keep only the loudest instance,
  // and re-key by chunk so tile-crossings ramp instead of restarting.
  const byIdx=new Map();
  for(const e of out){
    const cur=byIdx.get(e.idx);
    if(!cur || e.g>cur.g) byIdx.set(e.idx, {...e, key:`c:${e.idx}`});
  }
  const deduped=[...byIdx.values()];
  deduped.sort((a,b)=>b.g-a.g);
  return { ctx, audible: deduped.slice(0, audioPoly()) };
}

function updateAudio(){
  if(depth > 0){
    // Void layer: shut down all chunk voices and the world drone. The
    // ambient pad is silenced too so the deeper level reads as a held
    // breath. Mirrors the onboarding gate's structure.
    curPlayerCtx = { onTerrain:false, biomeId:null, worldId:null, worldMembership:{} };
    if(curChunkKey){ curChunkKey=''; curChunkIdx=-1; }
    if(voices.size>0) stopAllVoices();
    stopWorldLayerVoice();
    silenceAmbientDrone();
    return;
  }
  // ROOM TONE: walking the building is silent. No chunk voices, no world
  // drone — only the room's noise floor. The catalog exists solely on the
  // other side of the recorder's monitor.
  if(storyMode && !REC.isRecording()){
    curPlayerCtx = { onTerrain:false, biomeId:null, worldId:currentWorld(), worldMembership:{} };
    if(curChunkKey){ curChunkKey=''; curChunkIdx=-1; }
    if(voices.size>0) stopAllVoices();
    stopWorldLayerVoice();
    silenceAmbientDrone();
    RT.bedOn();
    return;
  }
  if(isOnboardingActive()){
    const worldId=INTRO_SCENE.worldId;
    const membership={};
    for(const w of worldsConfig) membership[w.id]=(w.id===worldId?1:0);
    curPlayerCtx = { onTerrain:false, biomeId:null, worldId, worldMembership: membership };
    if(curChunkKey){ curChunkKey=''; curChunkIdx=-1; }
    if(voices.size>0) stopAllVoices();
    stopWorldLayerVoice();
    applyIntroAudioEnvelope();
    return;
  }

  const { ctx, audible } = audibleCandidates();
  curPlayerCtx = ctx;

  // Track loudest chunk for status + event log.
  const newCur=audible.length>0?audible[0]:null;
  const newCurKey=newCur?newCur.key:'';
  if(newCurKey!==curChunkKey){
    if(newCur) pushEvent(`// ${chunkAt(newCur.idx).label} · ${chunkAt(newCur.idx).biome} · ${newCur.worldId}`);
    curChunkKey=newCurKey;
    curChunkIdx=newCur?newCur.idx:-1;
  }
  for(const {idx} of audible){
    const c=chunkAt(idx);
    if(!c.heard){c.heard=true;seenCount++;}
  }

  if(paused) return;
  applyIntroAudioEnvelope();

  // Polyphony: ramp existing, start missing, stop departed.
  const want=new Set(audible.map(a=>a.key));
  for(const [voiceKey,v] of voices){
    if(!want.has(voiceKey)){ stopVoice(v); voices.delete(voiceKey); }
  }
  for(const {key,idx,g,wx,wy} of audible){
    // Stereo pan from chunk's relative X position. PAN_R sets how tight
    // localization is — chunks beyond ±PAN_R cells are fully panned.
    const PAN_R=18;
    const pan=Math.max(-1, Math.min(1, (wx-px)/PAN_R));
    const existing=voices.get(key);
    if(existing){
      rampVoice(existing,g);
      if(existing.panner){
        const t=actx.currentTime;
        existing.panner.pan.cancelScheduledValues(t);
        existing.panner.pan.setValueAtTime(existing.panner.pan.value, t);
        existing.panner.pan.linearRampToValueAtTime(pan, t+0.18);
      }
    } else {
      const v=startVoice(idx,g,pan);
      if(v) voices.set(key,v);
    }
  }
  updateWorldLayer();
}

function step(dx,dy){
  // You can always run. You simply cannot run and still have the take. The
  // earlier version locked movement outright, which reads as broken input.
  if(storyMode && REC.isRecording()) REC.spoilTake('you moved');
  const nowMs=performance.now();
  if(lastMoveAtMs>0 && !isOnboardingActive()){
    const needMs=currentMoveIntervalMs();
    if((nowMs-lastMoveAtMs) < needMs) return;
  }
  // Geometry blocks the step. In the conservatory this is a body test — a wall,
  // a lintel you would brain yourself on, a riser too tall to take — and it
  // reads from the same array the shader draws from.
  if(RENDERER==='3d' && depth===0){
    if(usingPlan()){
      const move=FP.canStep(px, py, px+dx, py+dy, { keys: playerKeys });
      if(!move.ok){
        if(move.why==='locked') pushEvent('// locked. none of your keys.');
        else if(move.why==='bricked') pushEvent('// bricked up. it was a door once.');
        return;
      }
    } else if(R3.r3dSolid(px+dx, py+dy)) return;
  }
  // Your feet are the loudest thing in this building. The noise is left at the
  // cell you are leaving: the presence hunts where you WERE.
  if(storyMode){
    const level=REC.emitStepNoise(px, py);
    RT.footstep(level);
  }
  // Tell the lens the world moved, so it may warp its feedback. Standing still
  // must look like standing still.
  if(window.__diffusion?.setMoving){
    window.__diffusion.setMoving(true);
    // Which way did we actually go, relative to facing? Forward pushes the
    // held image outward; backward pulls it in.
    if(RENDERER==='3d'){
      const [fx,fy]=R3.r3dDelta(1);
      window.__diffusion.nudge({ forward: (dx*fx + dy*fy) >= 0 ? 1 : -1 });
    } else {
      window.__diffusion.nudge({ forward: 1 });
    }
    clearTimeout(movingTimer);
    movingTimer=setTimeout(()=>window.__diffusion?.setMoving(false), 260);
  }
  let sx=dx, sy=dy;
  const preHushDx=(!isOnboardingActive() && depth<=1 && isHorrorActive() && hush.active) ? (hush.x-px) : 0;
  const preHushDy=(!isOnboardingActive() && depth<=1 && isHorrorActive() && hush.active) ? (hush.y-py) : 0;
  const prevHushDist=(!isOnboardingActive() && depth<=1 && isHorrorActive() && hush.active)
    ? Math.hypot(hush.x-px, hush.y-py)
    : Infinity;
  // (void-sink lateral resistance removed: a side-step is always a side-step)
  const nx=px+sx;
  const ny=py+sy;
  if(nx===px&&ny===py) return;
  if(isOnboardingActive() && !canMoveInOnboarding(nx,ny,sx,sy)) return;
  lastMoveAtMs=nowMs;
  px=nx; py=ny; stepCount++;
  lastStepDx=sx;
  lastStepDy=sy;

  trail.push({x:px,y:py});
  if(trail.length>TRAIL_LEN) trail.shift();

  fogSet(px,py,2);
  revealAround(px,py);
  updateAudio();

  if(keyMap.size>0){
    const kk=`${px},${py}`;
    if(keyMap.has(kk)){
      keyMap.delete(kk);
      keysFound++;
      const remaining=keysTotal-keysFound;
      const isFinal = remaining===0;
      onKeyPickup(isFinal);
      if(!isFinal){
        scheduleNextKey(KEY_NEXT_DELAY_MIN_MS, KEY_NEXT_DELAY_MAX_MS);
        pushEvent(`// key acquired. ${keysFound}/${keysTotal} — another forms, slowly.`);
      } else {
        spawnDoor();
        startHorrorSequence();
      }
    }
  }
  if(isHorrorActive() && hush.active && depth<=1){
    registerHushApproachStep(prevHushDist, Math.hypot(hush.x-px, hush.y-py), sx, sy, preHushDx, preHushDy, nowMs);
  }

  if(depth===1 && sw2.active){
    if(maybeCrossSw2Gate(nowMs)) return;
  }

  if(door && px===door.x && py===door.y){
    if(horrorPhase===HORROR_SEQUENCE.HORROR_ONSET || horrorPhase===HORROR_SEQUENCE.CHASE_PRESSURE){
      startDoorSwarm();
    } else if(horrorPhase===HORROR_SEQUENCE.DOOR_SWARM){
      if(canDescendThroughSwarm()){
        descendThroughDoor();
        return;
      }
      if((performance.now()-lastHushEventMs)>1150){
        pushEvent('// statues clamp the path. keep walking through the rupture.');
        lastHushEventMs=performance.now();
      }
    } else {
      descendThroughDoor();
      return;
    }
  }

  if(depth===0){
    WEIRD.forEach(([t,m])=>{
      if(stepCount===t&&!weirdShown.has(t)){weirdShown.add(t);pushEvent(m);}
    });
  }

  if(isOnboardingActive()){
    introDistance=Math.max(introDistance, introForwardDistanceAt(px,py));
    if(isPrelude() && isOnPrimaryGate(px,py)){
      startFunnelIntro();
    } else if(isFunnel() && hasCrossedFinalGate(px,py)){
      releaseIntoWorld('final gate');
    }
    applyIntroAudioEnvelope();
  } else {
    if(curPlayerCtx && !curPlayerCtx.onTerrain){
      voidFatigue = clamp(voidFatigue + VOID_TRUDGE.buildPerStep, 0, 1);
    } else {
      voidFatigue = clamp(voidFatigue - VOID_TRUDGE.decayPerStep, 0, 1);
    }
    const target = targetBoundaryFriction();
    const k = target > worldBoundaryFriction ? WORLD_BOUNDARY_FRICTION.rampIn : WORLD_BOUNDARY_FRICTION.rampOut;
    worldBoundaryFriction = clamp(worldBoundaryFriction + (target - worldBoundaryFriction) * k, 0, 1);
  }
}

function teleport(){
  if(worldTemplates.size===0) return;
  const center=tileCoordFor(px,py);
  const tx=center.tx + Math.floor(Math.random()*5)-2;
  const ty=center.ty + Math.floor(Math.random()*5)-2;
  const worldId=worldIdAt(
    tx*WORLD_TILE_W + Math.floor(WORLD_TILE_W/2),
    ty*WORLD_TILE_H + Math.floor(WORLD_TILE_H/2)
  );
  const tpl=worldTemplates.get(worldId);
  if(!tpl || tpl.sampleIdxs.length===0) return;
  const idx=tpl.sampleIdxs[Math.floor(Math.random()*tpl.sampleIdxs.length)];
  const c=chunkAt(idx);
  px=tx*WORLD_TILE_W + c.wx;
  py=ty*WORLD_TILE_H + c.wy;
  if(RENDERER==='3d'){
    // never land inside a wall: spiral out to the nearest open cell
    let r=0;
    outer: for(; r<6; r++){
      for(let oy2=-r; oy2<=r; oy2++) for(let ox2=-r; ox2<=r; ox2++){
        if(Math.max(Math.abs(ox2),Math.abs(oy2))!==r) continue;
        if(!R3.r3dSolid(px+ox2, py+oy2)){ px+=ox2; py+=oy2; break outer; }
      }
    }
  }
  lastStepDx=0;
  lastStepDy=0;
  trail=[];
  stopAllVoices();
  revealAround(px,py);
  updateAudio();
  if(isHorrorActive() && door) spawnHushBehindPlayer();
  voidFatigue = 0;
  worldBoundaryLatch = false;
  worldBoundaryFriction = 0;
  lastMoveAtMs = 0;
  pushEvent('// teleport.');
}

function arrowDelta(){
  if(RENDERER==='3d'){
    // Facing-relative grid steps: forward/back along the current quarter-turn.
    if(forwardHeld()) return R3.r3dDelta(1);
    if(backHeld()) return R3.r3dDelta(-1);
    return [0,0];
  }
  if(isPrelude()){
    return forwardHeld() ? [INTRO_SCENE.forwardDx, INTRO_SCENE.forwardDy] : [0,0];
  }
  if(isFunnel()){
    let dx=0, dy=0;
    if(leftHeld())  dx-=1;
    if(rightHeld()) dx+=1;
    if(forwardHeld()) dy-=1;
    return [dx,dy];
  }
  let dx=0, dy=0;
  if(leftHeld())  dx-=1;
  if(rightHeld()) dx+=1;
  if(forwardHeld()) dy-=1;
  if(backHeld()) dy+=1;
  return [dx,dy];
}
function startMoveTimer(){
  if(moveTimer) return;
  const run=()=>{
    const [dx,dy]=arrowDelta();
    if(dx===0&&dy===0){ moveTimer=null; return; }
    step(dx,dy);
    // High-frequency polling + in-step interval gating avoids double-throttle lag.
    moveTimer=setTimeout(run, 16);
  };
  moveTimer=setTimeout(run, 16);
}

function togglePause(){
  paused=!paused;
  if(paused){ stopAllVoices(); stopWorldLayerVoice(); silenceAmbientDrone(); pushEvent('// paused.'); }
  else {
    startAmbientDroneAt(currentAmbientTarget());
    pushEvent('// resumed.');
    updateAudio();
  }
}

function jumpToSubWorld2(){
  if(!inRogue) return;
  if(isOnboardingActive()){
    pushEvent('// complete onboarding before forcing depth 2.');
    return;
  }
  depth=1;
  px=0;
  py=0;
  lastStepDx=0;
  lastStepDy=0;
  trail=[];
  fog=new Map();
  keyMap=new Map();
  keysFound=0;
  keysTotal=0;
  door=null;
  nextSpawnAt=0;
  voidFatigue=0;
  worldBoundaryLatch=false;
  worldBoundaryFriction=0;
  curChunkKey='';
  curChunkIdx=-1;
  curPlayerCtx=null;
  subWorld2Start={x:0,y:0};
  subWorld2HasKeys=false;
  stopAllVoices();
  stopWorldLayerVoice();
  silenceAmbientDrone();
  resetHorrorState();
  revealAroundWithRadius(px, py, 6);
  updateAudio();
  startSubWorld2Sequence();
  pushEvent('// debug: dropped into sub world 2.');
}

function grantAllKeysForCurrentLevel(){
  if(!inRogue) return;
  if(isOnboardingActive()){
    pushEvent('// debug: complete onboarding first.');
    return;
  }
  // Level 0 owns the active key-door-horror loop today.
  if(depth===0){
    if(keysTotal===0) initKeysForSession();
    if(keysTotal===0){
      pushEvent('// debug: no key session active.');
      return;
    }
    keyMap = new Map();
    keysFound = keysTotal;
    nextSpawnAt = 0;
    if(!door) spawnDoor();
    if(!isHorrorActive()) startHorrorSequence();
    pushEvent('// debug: all keys granted for depth 0.');
    return;
  }
  // Sub World 2 debug path: fast-forward area completions.
  if(depth===1){
    if(!sw2.active){
      startSubWorld2Sequence(SW2_TUNE.debugFastAreas, true);
    } else {
      const fast=Math.min(SW2_TUNE.areaCount, SW2_TUNE.debugFastAreas);
      for(let i=0;i<sw2.areas.length;i++){
        sw2.areas[i].grabbed = i<fast;
        sw2.areas[i].complete = i<fast;
      }
      sw2.completedCount=fast;
      sw2.heldItem=false;
      sw2.heldFromArea=-1;
      sw2.currentAreaIdx=Math.min(sw2.areas.length-1, Math.max(0, fast));
      if(sw2.phase===SW2_PHASE.BOOT_SILENCE){
        setSw2Phase(SW2_PHASE.AREA_LOOP, '// debug: area loop fast-forward.');
      }
      if(sw2.completedCount>=SW2_TUNE.areaCount){
        startSw2FinalDark(performance.now());
      }
      sw2.charge=sw2ProgressPct();
    }
    pushEvent('// debug: sub world 2 set to late-stage loop.');
    return;
  }
  pushEvent(`// debug: key grant not configured for depth ${depth}.`);
}

// ── Event log ─────────────────────────────────────────────────────────────────
function pushEvent(msg){
  eventQueue.push(msg);
  if(eventQueue.length>3) eventQueue.shift();
  document.getElementById('event').textContent=eventQueue[eventQueue.length-1]||'';
}

// ── Render ─────────────────────────────────────────────────────────────────────
const MAP_EL    = document.getElementById('map');
const HUSH_JUMP_EL = document.getElementById('hushJump');
const CATALOG_EL = document.getElementById('catalog');
const CATALOG_CTL_EL = document.getElementById('catalogCtl');
const CATALOG_TOGGLE_BTN = document.getElementById('catalogToggleBtn');
const ONBOARDING_TOGGLE_BTN = document.getElementById('onboardingToggleBtn');
const SUBWORLD2_BTN = document.getElementById('subWorld2Btn');
const DEBUG_KEYS_BTN = document.getElementById('debugKeysBtn');
const STATUS_EL = document.getElementById('status');
const KEYMETER_EL = document.getElementById('keymeter');
const SENSE_EL = document.getElementById('sense');
introTitleEl = document.getElementById('introTitle');
const INTRO_VIGNETTE_EL = document.getElementById('introVignette');

// Cell sinks: renderMap streams (glyph, class, alpha) cells through one of
// these; the DOM sink reproduces the legacy innerHTML byte-for-byte, the
// canvas sink feeds the glyph-grid compositor. One logic path, two backends.
if(RENDERER==='canvas') CR.canvasSetup(MAP_EL);
const domSink = {
  lines: [], row: '',
  begin(){ this.lines.length = 0; this.row = ''; },
  cell(glyph, cls, alpha){
    this.row += alpha != null
      ? `<span class="${cls}" style="opacity:${alpha}">${glyph}</span>`
      : `<span class="${cls}">${glyph}</span>`;
  },
  space(){ this.row += ' '; },
  endRow(){ this.lines.push(this.row); this.row = ''; },
  end(){ MAP_EL.innerHTML = this.lines.join('\n'); },
};
const canvasSink = {
  begin(){ CR.begin(VIEW_W, VIEW_H); },
  cell(glyph, cls, alpha){ CR.cell(glyph, cls, alpha); },
  space(){ CR.space(); },
  endRow(){},
  end(){ CR.end(); },
};
const mapSink = RENDERER==='canvas' ? canvasSink : domSink;

const trailMap = new Map(); // "x,y" -> recency index (newer = higher)
function wrapText(text, width=88){
  const words=String(text||'').split(/\s+/).filter(Boolean);
  const lines=[];
  let line='';
  for(const w of words){
    const next=line?`${line} ${w}`:w;
    if(next.length>width){
      if(line) lines.push(line);
      line=w;
    } else {
      line=next;
    }
  }
  if(line) lines.push(line);
  return lines.join('\n');
}
function fogGlyph(x,y){
  const n=hash01(x*0.73,y*1.11);
  if(n>0.82) return '\'';
  if(n>0.60) return '.';
  if(n>0.34) return '·';
  return ',';
}
function renderIntroTitle(){
  if(!introTitleEl) return;
  if(!isIntroActive()){
    introTitleEl.style.opacity='0';
    if(INTRO_VIGNETTE_EL) INTRO_VIGNETTE_EL.style.opacity='0';
    return;
  }
  const p=introProgress();
  const v=INTRO_SCENE.voidEnd;
  const t=INTRO_SCENE.thresholdStart;
  let opacity;
  if(p<v) opacity=1;                                       // Void: hold full
  else if(p<t) opacity=1 - ((p-v)/(t-v))*0.92;             // Stirring: fade
  else opacity=Math.max(0, 0.08*(1-(p-t)/(1-t)));          // Threshold: collapse
  introTitleEl.style.opacity=String(opacity);
  // Score lifts gently upward as it retires (max ~18px over the journey).
  introTitleEl.style.setProperty('--introLift', `${-Math.round(p*18)}px`);
  // Tunnel-vision vignette: full dark over the Void, eases off through Stirring,
  // gone by Threshold. Mirrors the title curve but ends earlier so the gate is clear.
  if(INTRO_VIGNETTE_EL){
    // Never mix vignette with gate flash/funnel visuals.
    if(gateFlashUntilMs > Date.now() || isFunnel()){
      INTRO_VIGNETTE_EL.style.opacity='0';
      return;
    }
    let vig;
    if(p<v) vig=1;
    else if(p<t) vig=Math.max(0, 1 - ((p-v)/(t-v))*1.0);
    else vig=0;
    INTRO_VIGNETTE_EL.style.opacity=String(vig);
  }
}
function introSceneCell(wx, wy){
  const rx=wx-introAnchorX;
  const ry=wy-introAnchorY;
  const inIntroDepth = Math.abs(ry) <= (INTRO_SCENE.introDistanceSteps+14);
  if(!inIntroDepth) return {char:fogGlyph(wx,wy), colorClass:'t-fog'};

  const p=introProgress();
  const pg=primaryGatePos();
  const fg=finalGatePos();
  const dPrimary=Math.hypot(wx-pg.x, wy-pg.y);
  const dFinal=Math.hypot(wx-fg.x, wy-fg.y);
  const prelude=isPrelude();

  // Prelude: almost empty void + one bright primary gate target.
  if(prelude){
    if(wx===pg.x && wy===pg.y) return {char:'█', colorClass:'t-gate-mark'};
    if(dPrimary<=1.35) return {char:'·', colorClass:'t-gate-spectral'};
    return {char:fogGlyph(wx,wy), colorClass:'t-fog'};
  }

  // Funnel phase: world-space downstream flow.
  const flow = (rx * INTRO_SCENE.forwardDx) + (ry * INTRO_SCENE.forwardDy);
  const flowDelta = flow - introDistance;
  const ahead = flowDelta >= 0;
  const wakeLag = introDistance - flow;
  const WAKE_LEN = 8;
  const flowWake = ahead ? 0 : clamp((WAKE_LEN - wakeLag) / WAKE_LEN, 0, 1);
  const pAhead = ahead ? (0.12 + p * 0.88) : (0.14 + flowWake * 0.26);
  const along=introForwardDistanceAt(wx,wy);
  const lateral=Math.abs(introLateralOffsetAt(wx,wy));
  const width=funnelWidthAt(along);
  const inFunnel=along>=INTRO_SCENE.funnelStartDist-1 && along<=INTRO_SCENE.finalGateDist+2 && lateral<=width+2;

  // Primary gate is now de-emphasized after unlock.
  if(wx===pg.x && wy===pg.y) return {char:'□', colorClass:'t-gate-frame'};
  if(dPrimary<=1.25) return {char:'.', colorClass:'t-gate-frame'};

  // Final gate remains dominant target.
  if(wx===fg.x && wy===fg.y) return {char:'█', colorClass:'t-gate-mark'};
  if(dFinal<=1.35) return {char:'·', colorClass:'t-gate-spectral'};

  if(!inFunnel) return {char:fogGlyph(wx,wy), colorClass:'t-fog'};

  if(lateral===0){
    if(!ahead && flowWake < 0.35){
      if(Math.abs(flow)%4===0) return {char:'¦', colorClass:'t-intro-halo'};
      return {char:'|', colorClass:'t-intro-halo'};
    }
    if(Math.abs(flow+introDistance)%3===0) return {char:'¦', colorClass:'t-intro-trail'};
    return {char:'|', colorClass:'t-intro-trail'};
  }
  if(lateral===1){
    if(!ahead && flowWake < 0.35){
      if(Math.abs(flow)%5===0) return {char:':', colorClass:'t-fog'};
      return {char:'.', colorClass:'t-fog'};
    }
    if(Math.abs(flow+introDistance)%4===0) return {char:':', colorClass:'t-intro-halo'};
    return {char:'.', colorClass:'t-intro-halo'};
  }

  const haloR=Math.max(2, Math.round(width + pAhead*1.6));
  if(lateral>haloR+1) return {char:fogGlyph(wx,wy), colorClass:'t-fog'};
  const ringFalloff=1-(lateral/(haloR+1.25));
  const noise=hash01(wx*0.93, wy*1.37);
  const density=clamp(pAhead*ringFalloff*1.24, 0, 1);
  if(noise>1-density){
    const g = noise>0.94 ? '°'
            : noise>0.88 ? '*'
            : noise>0.78 ? "'"
            : noise>0.62 ? ','
            : '·';
    const cls = (!ahead && flowWake < 0.6) ? 't-fog'
              : p>=INTRO_SCENE.thresholdStart ? 't-intro-bloom'
              : p>0.55 ? 't-intro-trail'
              : 't-intro-halo';
    return {char:g, colorClass:cls};
  }
  return {char:fogGlyph(wx,wy), colorClass:'t-fog'};
}

function nearestWildernessCell(startX, startY, maxR=28){
  const startCell=getCellAt(startX,startY);
  if(startCell && !startCell.biomeId && !startCell.isChunk){
    return {x:startX,y:startY};
  }
  for(let r=1;r<=maxR;r++){
    for(let dx=-r;dx<=r;dx++){
      const dy=r-Math.abs(dx);
      const candidates = dy===0 ? [[startX+dx,startY]] : [[startX+dx,startY+dy],[startX+dx,startY-dy]];
      for(const [cx,cy] of candidates){
        const c=getCellAt(cx,cy);
        if(c && !c.biomeId && !c.isChunk) return {x:cx,y:cy};
      }
    }
  }
  return {x:startX,y:startY};
}

function revealAroundWithRadius(x,y,radius){
  const ringR=radius+1;
  const r2=radius*radius;
  const ringR2=ringR*ringR;
  for(let cy=y-ringR;cy<=y+ringR;cy++){
    for(let cx=x-ringR;cx<=x+ringR;cx++){
      const dx=cx-x, dy=cy-y;
      const d2=dx*dx+dy*dy;
      if(d2<=r2){
        fogSet(cx,cy,1);
        continue;
      }
      if(d2<=ringR2){
        if(hash01(cx*1.93, cy*1.37) > 0.52){
          fogSet(cx,cy,1);
        }
      }
    }
  }
  fogSet(x,y,2);
}

// Cast a ray from the player toward an off-screen target and return the
// (rounded, clamped) cell where it exits the inner viewport rectangle.
// Used to position the periodic ! alert in the beacon's bearing direction.
function projectToViewportEdge(targetX, targetY, ox, oy){
  const dx = targetX - px;
  const dy = targetY - py;
  if(dx===0 && dy===0) return null;
  const xMin = ox + 1, xMax = ox + VIEW_W - 2;
  const yMin = oy + 1, yMax = oy + VIEW_H - 2;
  const ts = [];
  if(dx > 0) ts.push((xMax - px) / dx);
  if(dx < 0) ts.push((xMin - px) / dx);
  if(dy > 0) ts.push((yMax - py) / dy);
  if(dy < 0) ts.push((yMin - py) / dy);
  const positiveTs = ts.filter(t => t > 0 && Number.isFinite(t));
  if(positiveTs.length === 0) return null;
  const t = Math.min(...positiveTs);
  return {
    x: clamp(Math.round(px + t * dx), xMin, xMax),
    y: clamp(Math.round(py + t * dy), yMin, yMax),
  };
}

function renderMap(){
  computeViewDims();
  const halfC=Math.floor(VIEW_W/2), halfR=Math.floor(VIEW_H/2);
  const ox=px-halfC, oy=py-halfR;
  if(isIntroActive()) revealAround(px,py);
  // Guarantee player cell visibility even if fog map resets between frames.
  if(fogGet(px,py)===0) fogSet(px,py,2);

  // Rebuild trail map: position → recency (0=oldest, n-1=newest). Newer
  // positions overwrite older ones if the player crossed the same cell
  // twice, so the freshest tier always wins.
  trailMap.clear();
  for(let i=0;i<trail.length;i++){
    trailMap.set(`${trail[i].x},${trail[i].y}`, i);
  }
  const trailMaxIdx = Math.max(1, trail.length-1);

  const introNow = isIntroActive();
  const sw2Now = (!introNow && depth===1 && sw2.active);
  const playerCls = 't-player';
  const nowMs = performance.now();
  const sw2Progress = sw2Now ? clamp(sw2ProgressPct()/100, 0, 1) : 0;
  const sw2Dark = sw2Now ? clamp(sw2.darkness, 0, 1) : 0;
  const sw2FinalMask = sw2Now && (sw2.phase===SW2_PHASE.FINAL_DARK || sw2.phase===SW2_PHASE.POST_DOOR);
  const hushCell = (!introNow && hush.active)
    ? {x:Math.round(hush.x), y:Math.round(hush.y)}
    : null;
  const hushBodyLookup = new Map();
  if(hushCell){
    const hushMask = [
      [0,1,1,0,0],
      [1,2,4,2,0],
      [2,4,5,3,1],
      [1,3,4,2,1],
      [0,1,2,1,0],
    ];
    for(let my=-2;my<=2;my++){
      for(let mx=-2;mx<=2;mx++){
        const w=hushMask[my+2][mx+2];
        if(w<=0) continue;
        const flicker=Math.floor((nowMs/92) + hushCell.x*0.43 + hushCell.y*0.37 + mx*1.9 + my*1.3);
        let cls='t-hush-aura';
        let glyph='░';
        if(w>=4){
          cls='t-hush-core';
          if(mx===0 && my===0){
            const coreGlyphs=['█','▉','▓','█','╳'];
            glyph=coreGlyphs[Math.abs(flicker)%coreGlyphs.length];
          } else {
            glyph=(Math.abs(flicker)%4===0) ? '█' : (Math.abs(flicker)%4===1 ? '▓' : (Math.abs(flicker)%4===2 ? '▉' : '▒'));
          }
        } else if(w===3){
          cls='t-hush-edge';
          const edgeGlyphs=['▓','▒','╬','╫'];
          glyph=edgeGlyphs[Math.abs(flicker)%edgeGlyphs.length];
        } else if(w===2){
          cls='t-hush-edge';
          const edgeGlyphs=['▒','░','╫','╬'];
          glyph=edgeGlyphs[Math.abs(flicker+1)%edgeGlyphs.length];
        } else {
          cls='t-hush-aura';
          const auraGlyphs=['░','·','┆','░'];
          glyph=auraGlyphs[Math.abs(flicker)%auraGlyphs.length];
        }
        if(hushBlinkActive && w>=3 && (Math.abs(flicker)%2===0)){
          cls='t-hush-core';
          glyph=(Math.abs(flicker)%4===0) ? '█' : '╳';
        }
        hushBodyLookup.set(`${hushCell.x+mx},${hushCell.y+my}`, {cls, glyph, w});
      }
    }
  }
  const eyeLookup = new Map();
  if(!introNow && isHorrorActive()){
    for(const eye of hushEyes){
      const ex=Math.round(eye.x), ey=Math.round(eye.y);
      const k=`${ex},${ey}`;
      const pinging=(nowMs-eye.lastPingAt) < 220;
      const d=Math.hypot(ex-px, ey-py);
      const prev=eyeLookup.get(k);
      if(!prev || pinging || d<prev.d){
        eyeLookup.set(k, { pinging, d });
      }
    }
  }
  const statueLookup = new Map();
  if(!introNow && isHorrorActive() && horrorPhase===HORROR_SEQUENCE.DOOR_SWARM){
    for(const s of corridorStatues){
      const sx=Math.round(s.x), sy=Math.round(s.y);
      const k=`${sx},${sy}`;
      const phase=Math.floor((nowMs/120) + sx*0.27 + sy*0.21 + s.pulse);
      const lurching=(s.lurch>0.44) || hushBlinkActive;
      let glyph='◉';
      if(s.side===0){
        glyph=(Math.abs(phase)%2===0) ? '◍' : '◉';
      } else if(lurching){
        glyph=(Math.abs(phase)%3===0) ? '◈' : '◎';
      } else {
        glyph=(Math.abs(phase)%4===0) ? '◌' : '○';
      }
      const prev=statueLookup.get(k);
      if(!prev || (lurching && !prev.lurching)){
        statueLookup.set(k, {glyph, lurching});
      }
    }
  }
  const sw2ThreatLookup = new Map();
  if(sw2Now){
    for(const area of sw2.areas){
      const tx=Math.round(area.threatX);
      const ty=Math.round(area.threatY);
      const k=`${tx},${ty}`;
      const visible = sw2FinalMask || nowMs<area.revealUntilMs || area.grabbed || area.complete;
      if(!visible) continue;
      const p=Math.floor((nowMs/130) + area.idx*2.1 + tx*0.17 + ty*0.11);
      const armed = !area.complete;
      const glyph = sw2FinalMask
        ? (Math.abs(p)%3===0 ? '█' : Math.abs(p)%3===1 ? '▮' : '▊')
        : (armed ? (Math.abs(p)%2===0 ? '▮' : '▯') : (Math.abs(p)%2===0 ? '┆' : '│'));
      sw2ThreatLookup.set(k, {
        glyph,
        cls: sw2FinalMask ? 't-sw2-adversary-dark' : (armed ? 't-sw2-adversary' : 't-sw2-adversary-dim')
      });
      if(sw2FinalMask){
        const ringR = 1 + (Math.abs(p)%2);
        for(let oy2=-ringR; oy2<=ringR; oy2++){
          for(let ox2=-ringR; ox2<=ringR; ox2++){
            if(ox2===0 && oy2===0) continue;
            if((ox2*ox2 + oy2*oy2) > (ringR*ringR)) continue;
            const kk=`${tx+ox2},${ty+oy2}`;
            if(!sw2ThreatLookup.has(kk)){
              sw2ThreatLookup.set(kk, {glyph:'·', cls:'t-sw2-adversary-aura'});
            }
          }
        }
      }
    }
  }

  // Pre-compute a single edge-alert cell for the closest off-screen beacon.
  // Keys take priority; fall back to the door once all keys are picked.
  let edgeAlert = null;
  if(!introNow){
    const inViewport = (x,y) => x>=ox && x<ox+VIEW_W && y>=oy && y<oy+VIEW_H;
    let target=null, kind=null, minD=Infinity;
    for(const k of keyMap.values()){
      if(inViewport(k.x, k.y)) continue;
      const d = Math.hypot(k.x-px, k.y-py);
      if(d < minD){ minD=d; target=k; kind='key'; }
    }
    if(!target && door && !inViewport(door.x, door.y)){
      target = door; kind='door';
    }
    if(target){
      const e = projectToViewportEdge(target.x, target.y, ox, oy);
      if(e){
        // Sine-pulse opacity, ~1.6s period, with a baseline of 0.25 so the
        // glyph never fully disappears (the rebuild-each-frame DOM means we
        // can't rely on CSS keyframes for this).
        const period = kind==='door' ? 2000 : 1600;
        const phase = (Date.now() % period) / period;          // 0..1
        const pulse = 0.5 - 0.5 * Math.cos(phase * Math.PI*2); // 0..1 sine
        const opacity = (0.25 + pulse * 0.75).toFixed(3);
        edgeAlert = {
          x:e.x, y:e.y,
          cls: kind==='door' ? 't-alert-door' : 't-alert-key',
          opacity,
        };
      }
    }
  }

  // Stream cells through the active sink (DOM innerHTML or canvas grid) —
  // one logic path, two backends, so the renderers cannot drift apart.
  const S=mapSink;
  S.begin();
  for(let vy=0;vy<VIEW_H;vy++){
    const wy=oy+vy;
    for(let vx=0;vx<VIEW_W;vx++){
      const wx=ox+vx;
      if(wx===px&&wy===py && !(sw2Now && sw2FinalMask)){
        S.cell('█', playerCls);
        continue;
      }
      if(hushCell){
        const hushTile=hushBodyLookup.get(`${wx},${wy}`);
        if(hushTile){
          S.cell(hushTile.glyph, hushTile.cls);
          continue;
        }
      }
      if(sw2Now && sw2FinalMask){
        if(sw2.doorActive){
          const ddx=wx-sw2.doorX, ddy=wy-sw2.doorY;
          if(ddx===0 && ddy===0){
            S.cell('█', 't-sw2-gate');
            continue;
          }
          if((ddx*ddx + ddy*ddy)<=2){
            S.cell('·', 't-sw2-gate-aura');
            continue;
          }
        }
        const tInfo=sw2ThreatLookup.get(`${wx},${wy}`);
        if(tInfo){
          S.cell(tInfo.glyph, tInfo.cls);
          continue;
        }
        S.space();
        continue;
      }
      if(sw2Now){
        const tInfo=sw2ThreatLookup.get(`${wx},${wy}`);
        if(tInfo){
          S.cell(tInfo.glyph, tInfo.cls);
          continue;
        }
        if(wx===sw2.hubX && wy===sw2.hubY){
          S.cell(sw2.heldItem?'◉':'○', 't-sw2-hub');
          continue;
        }
        const area=currentSw2Area();
        if(area){
          const dA=Math.hypot(wx-area.x, wy-area.y);
          if(dA<=SW2_TUNE.areaEnterRadius && dA>SW2_TUNE.areaEnterRadius-0.7){
            S.cell('·', 't-sw2-rite');
            continue;
          }
          if(wx===area.x && wy===area.y){
            S.cell(area.complete?'┆':'╳', 't-sw2-anchor');
            continue;
          }
        }
        const n=hash01(wx*0.73 + nowMs*0.00025, wy*0.69 - nowMs*0.0002);
        const threshold=0.965 - sw2Progress*0.05 - sw2Dark*0.12;
        if(n>threshold){
          S.cell((Math.floor(nowMs/130 + wx*0.27 + wy*0.13)%2===0)?'▒':'░', 't-sw2-mass');
          continue;
        }
      }
      // Beacons render *before* fog so keys and the door act as visible
      // markers across the dark map, the way the player does.
      if(!introNow){
        if(keyMap.size>0 && keyMap.has(`${wx},${wy}`)){
          S.cell('⚷', 't-key');
          continue;
        }
        if(door){
          const ddx=wx-door.x, ddy=wy-door.y;
          if(ddx===0 && ddy===0){
            S.cell('█', 't-door-core');
            continue;
          }
          if((ddx*ddx + ddy*ddy) <= 2){
            S.cell('·', 't-door-aura');
            continue;
          }
        }
        if(edgeAlert && edgeAlert.x===wx && edgeAlert.y===wy){
          S.cell('!', edgeAlert.cls, edgeAlert.opacity);
          continue;
        }
        const statueInfo=statueLookup.get(`${wx},${wy}`);
        if(statueInfo!==undefined){
          S.cell(statueInfo.glyph, statueInfo.lurching?'t-statue-lurch':'t-statue');
          continue;
        }
        if(!sw2Now){
          const eyeInfo=eyeLookup.get(`${wx},${wy}`);
          if(eyeInfo!==undefined){
            const phase=Math.floor((nowMs/120) + wx*0.41 + wy*0.37);
            const eyeGlyph = eyeInfo.pinging
              ? (phase%2===0 ? '◉' : '◎')
              : (phase%5===0 ? '◌' : phase%5===1 ? '◍' : phase%5===2 ? '◎' : phase%5===3 ? '◉' : '◈');
            const cls = eyeInfo.pinging ? 't-eye-ping' : (eyeInfo.d<7.5 ? 't-eye-near' : 't-eye');
            S.cell(eyeGlyph, cls);
            continue;
          }
        }
      }

      const fv=fogGet(wx,wy);
      if(fv===0){
        S.cell(fogGlyph(wx,wy), 't-fog');
        continue;
      }

      const cell=introNow ? introSceneCell(wx,wy) : getCellAt(wx,wy);

      if(cell?.isChunk){
        const cls=cell.chunkKey===curChunkKey?'t-chunk-on':'t-chunk';
        S.cell(cell.char, cls);
        continue;
      }

      if(cell){
        const worldClass = (cell.worldId && !cell.noWorldTint && !introNow) ? ` ${worldClassFor(cell.worldId)}` : '';
        S.cell(cell.char, `${cell.colorClass||'t-resonance'}${worldClass}`);
        continue;
      }

      // Trail: tier the after-image by recency. Freshest cells use a
      // dense block with a luminous halo; oldest fade to a single dot.
      const trailAge = trailMap.get(`${wx},${wy}`);
      if(trailAge !== undefined){
        const r = trailAge / trailMaxIdx;  // 0=oldest, 1=newest
        if(r > 0.85)      S.cell('▓', 't-trail-1');
        else if(r > 0.55) S.cell('▒', 't-trail-2');
        else if(r > 0.25) S.cell('░', 't-trail-3');
        else              S.cell('·', 't-trail-4');
        continue;
      }

      S.space();
    }
    S.endRow();
  }
  S.end();
  renderIntroTitle();
}

function renderStatus(){
  const c=curChunkIdx>=0?chunkAt(curChunkIdx):null;
  const v=curChunkKey?voices.get(curChunkKey):null;
  const dur=v?v.dur:0;
  const elapsed=(v&&actx)?((actx.currentTime-v.startedAt)%dur):0;
  const fmt=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${(s%60).toFixed(1).padStart(4,'0')}`;
  const barW=Math.max(12,VIEW_W-72);
  const p=dur>0?elapsed/dur:0;
  const bar='▓'.repeat(Math.round(p*barW))+'░'.repeat(barW-Math.round(p*barW));
  const playingNow=!paused;
  const icon=c?(c.iconChar||c.charId||'·'):'·';
  const chunkStr=c?`[ ${playingNow?'▶':'■'} ] ${icon} ${c.label}  ${fmt(elapsed)} / ${fmt(dur)}  ${bar}`:'[ - ]';
  const wId=curPlayerCtx?.worldId || '—';
  const bId=curPlayerCtx?.biomeId ? curPlayerCtx.biomeId.split(':').slice(-1)[0] : '—';
  const introMeta=isIntroActive()?`  intro:${Math.round(introProgress()*100)}%`: '';
  const hushMeta=isHorrorActive() && depth===0 && Number.isFinite(hushDistance())
    ? `  hush:${horrorPhase.replace(/_/g,'-')} d:${Math.max(0,Math.round(hushDistance()))}`
    : '';
  const sw2Meta=(depth===1 && sw2.active)
    ? `  rite:${sw2.phase.replace(/sw2_/g,'').replace(/_/g,'-')} ${Math.round(sw2ProgressPct())}%  fails:${sw2.failCount}`
    : '';
  const metaStr = depth > 0
    ? `depth:${depth}  void  vox:${voices.size}/${POLY_MAX}  step:${stepCount}  loop:${looping?'on':'off'}${sw2Meta}`
    : `world:${wId}  biome:${bId}  vox:${voices.size}/${POLY_MAX}  step:${stepCount}  loop:${looping?'on':'off'}${introMeta}${hushMeta}`;
  const pad=Math.max(0,VIEW_W-chunkStr.length-metaStr.length);
  STATUS_EL.textContent=chunkStr+' '.repeat(pad)+metaStr;
}

// Compass bearing for a vector in world coordinates. World y grows
// downward, so we negate dy to match cardinal intuition (north = up).
function bearingName(dx, dy){
  const angle = Math.atan2(-dy, dx);                // 0 = east, π/2 = north
  const deg   = (angle * 180/Math.PI + 360) % 360;
  const dirs  = ['east','northeast','north','northwest','west','southwest','south','southeast'];
  return dirs[Math.round(deg/45) % 8];
}

// MUD-style proximity descriptor + the verb that matches it. Tuned around
// our beacon distance bands so the wording escalates as you close in.
function distanceDescriptor(d){
  if(d <  18) return {label:'right beside you', verb:'pulses'};
  if(d <  60) return {label:'very close',       verb:'shimmers'};
  if(d < 140) return {label:'nearby',           verb:'flickers'};
  if(d < 280) return {label:'far off',          verb:'glimmers'};
  if(d < 520) return {label:'very far',         verb:'whispers'};
  return            {label:'somewhere distant', verb:'whispers'};
}

function renderSense(){
  if(!SENSE_EL) return;
  if(depth===1 && sw2.active){
    if(sw2.phase===SW2_PHASE.BOOT_SILENCE){
      SENSE_EL.innerHTML =
        `<span class="sense-prefix">// sense:</span> ` +
        `<span class="sense-dist">silence.</span>`;
      return;
    }
    if(sw2.phase===SW2_PHASE.AREA_LOOP){
      if(sw2.heldItem){
        const dxH=sw2.hubX-px, dyH=sw2.hubY-py;
        const bear=bearingName(dxH,dyH);
        SENSE_EL.innerHTML =
          `<span class="sense-prefix">// sense:</span> ` +
          `return to hub <span class="sense-bearing">${bear}</span>.`;
        return;
      }
      const area=currentSw2Area();
      if(area){
        const dxA=area.x-px, dyA=area.y-py;
        const dT=Math.hypot(px-area.threatX, py-area.threatY);
        const bear=bearingName(dxA,dyA);
        SENSE_EL.innerHTML =
          `<span class="sense-prefix">// sense:</span> ` +
          `area <span class="sense-bearing">${bear}</span>. ` +
          `<span class="sense-dist">too close at ${sw2KillRadius().toFixed(1)}</span>.`;
        return;
      }
    }
    if(sw2.phase===SW2_PHASE.FINAL_DARK){
      const dxD=sw2.doorX-px, dyD=sw2.doorY-py;
      const dBear=bearingName(dxD,dyD);
      let nearest=null;
      for(const area of sw2.areas){
        const d=Math.hypot(px-area.threatX, py-area.threatY);
        if(nearest===null || d<nearest) nearest=d;
      }
      SENSE_EL.innerHTML =
        `<span class="sense-prefix">// sense:</span> ` +
        `door <span class="t-door-sense">█</span> to the ` +
        `<span class="sense-bearing">${dBear}</span>. ` +
        `<span class="sense-dist">nearest ${nearest===null?'—':nearest.toFixed(1)}</span>.`;
      return;
    }
    if(sw2.phase===SW2_PHASE.POST_DOOR){
      SENSE_EL.innerHTML =
        `<span class="sense-prefix">// sense:</span> ` +
        `<span class="sense-dist">it does not leave.</span>`;
      return;
    }
    SENSE_EL.innerHTML='';
    return;
  }
  if(isIntroActive() || keysTotal===0){
    SENSE_EL.innerHTML='';
    return;
  }
  if(isHorrorActive() && depth===0 && door){
    const dxH=hush.x-px, dyH=hush.y-py;
    const hDist=Math.hypot(dxH,dyH);
    const hBear=bearingName(dxH,dyH);
    const hDesc=distanceDescriptor(hDist);
    const dxD=door.x-px, dyD=door.y-py;
    const dBear=bearingName(dxD,dyD);
    if(doorRevealCutscene){
      SENSE_EL.innerHTML =
        `<span class="sense-prefix">// sense:</span> ` +
        `door <span class="t-door-sense">█</span> fixed to the ` +
        `<span class="sense-bearing">${dBear}</span>. ` +
        `<span class="t-hush-sense">☍</span> retreats to the ` +
        `<span class="sense-bearing">${hBear}</span>. ` +
        `<span class="sense-dist">your legs feel heavy.</span>`;
    } else if(horrorPhase===HORROR_SEQUENCE.DOOR_SWARM){
      const nowMs=performance.now();
      const lockLeft=Math.max(0, hushLockedUntilMs-nowMs);
      const lockText=isHushLocked(nowMs)
        ? `lock holds ${Math.round(lockLeft)}ms`
        : 'lock broken';
      SENSE_EL.innerHTML =
        `<span class="sense-prefix">// sense:</span> ` +
        `statues line the corridor to the ` +
        `<span class="sense-bearing">${dBear}</span>. ` +
        `<span class="sense-dist">${lockText}</span>. ` +
        `<span class="t-hush-sense">☍</span> waits at the ` +
        `<span class="sense-bearing">${hBear}</span> until the blink.`;
    } else {
      SENSE_EL.innerHTML =
        `<span class="sense-prefix">// sense:</span> ` +
        `<span class="t-hush-sense">☍</span> hush ` +
        `<span class="sense-dist">${hDesc.label}</span> to the ` +
        `<span class="sense-bearing">${hBear}</span>. ` +
        `door <span class="t-door-sense">█</span> to the ` +
        `<span class="sense-bearing">${dBear}</span>. ` +
        `<span class="sense-dist">do not stop.</span>`;
    }
    return;
  }
  // Pick the nearest active beacon. Keys outrank the door so the current
  // objective always wins; once all keys are picked the door takes over.
  let target=null, kind=null, minD=Infinity;
  for(const k of keyMap.values()){
    const dx=k.x-px, dy=k.y-py;
    const d=Math.hypot(dx,dy);
    if(d<minD){ minD=d; target=k; kind='key'; }
  }
  if(!target && door){
    const dx=door.x-px, dy=door.y-py;
    minD=Math.hypot(dx,dy); target=door; kind='door';
  }
  if(!target){
    // No active beacon yet — usually the gap between pickup and next spawn.
    if(nextSpawnAt > 0 && keysFound < keysTotal){
      SENSE_EL.innerHTML =
        `<span class="sense-prefix">// sense:</span> ` +
        `<span class="sense-dist">silence. another presence is forming.</span>`;
    } else {
      SENSE_EL.innerHTML = '';
    }
    return;
  }
  const dx=target.x-px, dy=target.y-py;
  const bearing=bearingName(dx,dy);
  const dd=distanceDescriptor(minD);
  const noun = kind==='door' ? 'door'  : 'key';
  const glyph = kind==='door' ? '█'    : '⚷';
  const cls   = kind==='door' ? 't-door-sense' : 't-key-sense';
  // Prose deliberately mirrors the sparse cadence of the existing event
  // lines ("// release: …") so it reads as part of the world voice.
  SENSE_EL.innerHTML =
    `<span class="sense-prefix">// sense:</span> a faint ${noun} ` +
    `<span class="${cls}">${glyph}</span> ${dd.verb} to the ` +
    `<span class="sense-bearing">${bearing}</span> — ` +
    `<span class="sense-dist">${dd.label}</span>.`;
}

function renderKeymeter(){
  if(!KEYMETER_EL) return;
  if(depth===1 && sw2.active){
    KEYMETER_EL.style.display='block';
    const done=Math.max(0, Math.min(SW2_TUNE.areaCount, sw2.completedCount));
    const held=sw2.heldItem ? '◉' : '·';
    const meter='●'.repeat(done) + '○'.repeat(Math.max(0, SW2_TUNE.areaCount-done));
    let tail=`<span class="km-danger">— dark ${Math.round(sw2.darkness*100)}%</span>`;
    if(sw2.phase===SW2_PHASE.BOOT_SILENCE){
      tail=`<span class="km-danger">— silence</span>`;
    } else if(sw2.phase===SW2_PHASE.FINAL_DARK){
      tail=`<span class="km-danger">— reach door</span>`;
    } else if(sw2.phase===SW2_PHASE.POST_DOOR){
      tail=`<span class="km-danger">— complete</span>`;
    }
    const carry=`<span class="km-label"> carry ${held}</span>`;
    KEYMETER_EL.innerHTML = `<span class="km-lit">${meter}</span>${carry}${tail}`;
    return;
  }
  if(keysTotal===0 || isIntroActive()){
    KEYMETER_EL.style.display='none';
    return;
  }
  KEYMETER_EL.style.display='block';
  // Progressive reveal: only render slots for what currently exists in the
  // world (found + active). Future picks are hinted by a single pending
  // ellipsis when a spawn is scheduled, never as N dim slots — that would
  // wrongly imply all keys are already out there.
  let row='';
  for(let i=0;i<keysFound;i++){
    row += `<span class="km-lit">⚷</span>`;
  }
  if(keyMap.size > 0){
    row += `<span class="km-active">⚷</span>`;
  } else if(nextSpawnAt > 0 && keysFound < keysTotal){
    row += `<span class="km-pending">…</span>`;
  }
  let tail='';
  if(isHorrorActive() && depth===0){
    tail = `<span class="km-danger">— HUSH ACTIVE</span>`;
  } else {
    tail = door
      ? `<span class="km-door">— door active</span>`
      : `<span class="km-label">${keysFound}/${keysTotal}</span>`;
  }
  KEYMETER_EL.innerHTML = `${row}${tail}`;
}

function renderCatalog(){
  if(!showCatalog){
    CATALOG_EL.style.display='none';
    return;
  }
  CATALOG_EL.style.display='block';
  const worldId=curPlayerCtx?.worldId || worldIdAt(px, py);
  const piece=PIECE_CATALOG[worldId] || {
    title:(worldId||'unknown world').toUpperCase(),
    year:'—',
    description:'Catalog entry pending.'
  };
  const header=`+---------------- piece catalog ----------------+\n` +
               `piece: ${piece.title}\n` +
               `year: ${piece.year}\n` +
               `world id: ${worldId || '—'}\n` +
               `description:\n`;
  CATALOG_EL.textContent = `${header}${wrapText(piece.description, Math.max(52, VIEW_W-4))}`;
}

function toggleCatalog(){
  showCatalog=!showCatalog;
  CATALOG_TOGGLE_BTN.textContent = showCatalog ? 'catalog [c] (on)' : 'catalog [c]';
  if(!showCatalog){
    CATALOG_EL.textContent='';
    CATALOG_EL.style.display='none';
  } else {
    renderCatalog();
  }
}

function renderBoot(){
  if(introTitleEl) introTitleEl.style.opacity='0';
  const done=files.filter(f=>f.status==='done').length;
  const loading=files.filter(f=>f.status==='loading');
  const dots='.'.repeat((tick%3)+1).padEnd(3);
  const cols=8;
  const rows=Math.max(1, Math.ceil(SAMPLE_COUNT/cols));

  const grid=[];
  for(let r=0;r<rows;r++){
    const cells=[];
    for(let c=0;c<cols;c++){
      const f=files[r*cols+c]; if(!f){cells.push('   ');continue;}
      cells.push(f.status==='done'?` ${f.label}`:f.status==='loading'?(tick%2?' ↓':' ·'):f.status==='error'?' !!':' ··');
    }
    grid.push(cells.join(''));
  }

  const bW=36, pct=Math.round(done/SAMPLE_COUNT*100);
  const bar='[' + '▓'.repeat(Math.round(pct/100*bW))+'░'.repeat(bW-Math.round(pct/100*bW))+']';
  const active=loading.slice(0,3).map(f=>{
    const p=f.total>0?Math.min(100,Math.floor(f.recv/f.total*100)):0;
    return `  ${f.label}  [${'▓'.repeat(Math.round(p/100*16))+'░'.repeat(16-Math.round(p/100*16))}]  ${String(p).padStart(3)}%`;
  });

  const bootText=[
    ...bootLog,'',
    ...grid,'',
    ...active,
    active.length===0?'  initializing...':null,'',
    `${bar} ${done}/${SAMPLE_COUNT}`,
    done<SURF_AT?`// entering at ${SURF_AT} · loading${dots}`:`// ${done} loaded · building world${dots}`,
  ].filter(l=>l!==null).join('\n');
  if(RENDERER==='canvas'){
    CR.textScreen(bootText);
  } else if(RENDERER==='3d'){
    // NEVER wipe MAP_EL here: the ui glyph layer and the diffusion overlay are
    // its children. The loading screen is drawn on the ui layer instead.
    bootTextCache=bootText;
  } else {
    MAP_EL.innerHTML='';
    MAP_EL.textContent=bootText;
  }
  CATALOG_EL.textContent='';
  CATALOG_EL.style.display='none';
  STATUS_EL.textContent='';
  document.getElementById('event').textContent='';
  if(SENSE_EL) SENSE_EL.innerHTML='';
  if(KEYMETER_EL){ KEYMETER_EL.innerHTML=''; KEYMETER_EL.style.display='none'; }
}

// ── Main loop ─────────────────────────────────────────────────────────────────
function loop(){
  try{
    tick++;
    const nowLoopMs=performance.now();
    const dt=Math.min(0.05, lastLoopMs ? (nowLoopMs-lastLoopMs)/1000 : 0.016);
    lastLoopMs=nowLoopMs;
    if(inRogue){
      // Keep keyboard focus on the play surface to avoid intermittent movement deadlocks.
      if((tick % 10)===0) ensureInteractionFocus();
      // Onboarding fail-safe: movement should continue while key is held,
      // independent of timer/focus edge cases.
      if(isOnboardingActive()){
        const [dx,dy]=arrowDelta();
        if(dx!==0 || dy!==0){
          const now=performance.now();
          if((now - onboardingHoldLastMs) >= currentMoveIntervalMs()){
            step(dx,dy);
            onboardingHoldLastMs=now;
          }
        }
      }
      if(!scenes.blocksWorld()){
        maybeSpawnScheduledKey();
        updateHorrorTick();
        tickRecorder(dt);
        tickPresence(dt);
        tickStabs(dt);
        tickPages();
      }
      if(RENDERER==='3d') render3d(); else renderMap();
      // Instrument readouts only exist in JUST SURF; in story mode they are
      // hidden by body.game, so don't pay to rebuild their DOM every frame.
      if(!storyMode){ renderCatalog(); renderStatus(); renderSense(); renderKeymeter(); }
      if(hush.active) once('hush-met', ()=>metaCommit({hushMet:true}));
    }
    else renderBoot();

    // Scenes draw over whatever the world drew, on their own glyph layer —
    // and during boot too, so the title screen exists before the field does.
    scenes.update(dt);
    uiClear();
    if(!inRogue && RENDERER==='3d') drawBootText();
    drawStoryHud();
    scenes.render();
    if(storyMode && inRogue) saveTick(dt);
  }catch(err){
    console.error('loop error', err);
    pushEvent('// runtime fault recovered.');
  }finally{
    raf=requestAnimationFrame(loop);
  }
}

// ── 3D world-state bridge (M1b) ───────────────────────────────────────────────
// Positions cached per player cell; voice activity refreshed every frame.
let r3dCache={px:null,py:null,list:[],fogSize:-1};
function r3dNearChunks(){
  if(r3dCache.px!==px || r3dCache.py!==py){
    const list=[];
    const center=tileCoordFor(px,py);
    for(let ty=center.ty-1;ty<=center.ty+1;ty++){
      for(let tx=center.tx-1;tx<=center.tx+1;tx++){
        const oxT=tx*WORLD_TILE_W, oyT=ty*WORLD_TILE_H;
        for(const [wid,tpl] of worldTemplates){
          for(const idx of tpl.sampleIdxs){
            const c=chunkAt(idx);
            if(!c) continue;
            const wx=oxT+c.wx, wy=oyT+c.wy;
            const d=Math.hypot(px-wx, py-wy);
            if(d>70) continue;
            if(worldIdAt(wx,wy)!==wid) continue;
            list.push({x:wx, y:wy, r:(c.terrainRadius??12)*0.5, d,
                       instKey:`${tx},${ty}:${idx}`,
                       col:R3.BIOME_RGB[c.biome]||[0.4,0.5,0.5], act:0});
          }
        }
      }
    }
    list.sort((a,b)=>a.d-b.d);
    r3dCache={px, py, list:list.slice(0,48), fogSize:r3dCache.fogSize};
  }
  for(const ch of r3dCache.list){
    const v=voices.get(ch.instKey);
    ch.act=v?clamp((v.target||0)*6,0,1):0;
  }
  return r3dCache.list;
}
// ── M2: scenes, dialogue, save, title, terror ────────────────────────────────
// `storyMode` gates the narrative layer. JUST SURF (and ?mode=surf) keeps the
// original lab exactly as it was: a walkable field of audio, no triggers.
let storyMode=false;
let lastLoopMs=0;

function applyLensPreset(name){
  const d=window.__diffusion;
  const P=window.__lensPresets;
  if(!d || !P || !P[name]) return;
  d.resetFeedback();
  d.tune(P[name]);
  window.__lensPromptLocked=!!P[name].prompt;
}

// Effect strings from dialogue nodes (see data/script-schema.md).
function runEffect(spec){
  const [kind, arg]=String(spec).split(':');
  switch(kind){
    case 'fx':
      if(arg==='glitch') CR.fx.glitch(1, 260);
      else if(arg==='shake') CR.fx.shake(1, 240);
      else if(arg==='flash') CR.fx.flash(90);
      break;
    case 'lens': applyLensPreset(arg); break;
    case 'warp': { const [x,y]=arg.split(',').map(Number); px=x; py=y; trail=[]; revealAround(px,py); break; }
    case 'battle': pushEvent(`// battle:${arg} — M3`); break;
    case 'give': pushEvent(`// acquired: ${arg}`); break;
    default: console.warn('unknown effect', spec);
  }
}

// A speaker's typewriter blip: a short pitched tick through the master bus.
function speakerBlip(speaker){
  if(!actx || !master || paused) return;
  try{
    const now=actx.currentTime;
    const o=actx.createOscillator();
    const g=actx.createGain();
    const base=520 + (hashString01(String(speaker||'')) * 240);
    o.frequency.setValueAtTime(base, now);
    o.type='square';
    g.gain.setValueAtTime(0.0, now);
    g.gain.linearRampToValueAtTime(0.012, now+0.004);
    g.gain.exponentialRampToValueAtTime(0.0005, now+0.045);
    o.connect(g); g.connect(master);
    o.start(now); o.stop(now+0.05);
  }catch(_){}
}

async function loadBuilding(){
  const which=new URLSearchParams(location.search).get('plan') || 'testbed';
  try{
    const mod=await import(`./data/floorplan/${which}.js`);
    const data=mod[which] || mod.default;
    FP.compile(data.levels, {width:data.width, height:data.height});
    if(data.spawn) FP.setSpawn(data.spawn.x, data.spawn.y);
    // ?at= is a debug spawn and outranks the building's front door.
    const at=new URLSearchParams(location.search).get('at');
    if(data.spawn && !(at && /^-?\d+,-?\d+$/.test(at))){ px=data.spawn.x; py=data.spawn.y; }
    for(const d of data.doors||[]) FP.setDoorKey(d.x, d.y, d.key);
    const p=FP.floorplan();
    R3.r3dSetPlan(p.rgba, p.w, p.h);
    revealAround(px,py);
    faceOpenDirection();
    pushEvent(`// ${which}: ${p.w}×${p.h} cells.`);
  }catch(err){
    console.error('floorplan failed to load', err);
  }
}

function enterStory(){
  storyMode=true;
  setGameChrome(true);
  REC.loadRecState(getSave().rec);
  PRES.loadPresenceState(getSave().presence);
  OBJ.loadObjState(getSave().obj);
  STAB.loadStabState(getSave().stabs);
  if(inRogue && RENDERER==='3d') loadBuilding();
  STAB.stabsInit({ onStab:playStab });
  if(chunks.length) STAB.buildStabPool(chunks);
  const qp=new URLSearchParams(location.search);
  // ?flags=a,b=2 — force story state for testing
  const flagParam=qp.get('flags');
  if(flagParam) flagApply(flagParam.split(',').filter(Boolean));
  ensureCtx();
  startAmbientDroneAt(currentAmbientTarget());
  // ?talk=<node> jumps straight into a conversation
  pushEvent('// [f] flashlight · [r] recorder · [shift] move quietly');
  const talk=qp.get('talk');
  if(talk) startDialogue(talk);
  else if(!flagTest('prologueDone')) startDialogue('usher.intro');
}

function enterJustSurf(){
  storyMode=false;
  setGameChrome(false);
  ensureCtx();
  startAmbientDroneAt(currentAmbientTarget());
  pushEvent('// just surf. no story. the field is the field.');
}

function toggleRecorder(){
  if(REC.isRecording()){
    const r=REC.stopRecording();
    CUES.playCue(CUES.CUE.recorder, {gain:0.7, rate:0.88});
    updateAudio();                    // monitor closes: the room goes silent
    if(r.completed) pushEvent('// take complete. one clean minute.');
    else if(r.spoiled) pushEvent(`// take spoiled — ${r.reason}.`);
    else pushEvent(`// take aborted at ${r.elapsed.toFixed(0)}s.`);
    return;
  }
  REC.startRecording();
  ensureCtx();
  CUES.playCue(CUES.CUE.recorder, {gain:0.8});
  updateAudio();                      // monitor opens: you can hear the room
  pushEvent('// recording. hold still. light off.');
  // The first take is what tells the building someone is in it.
  once('presence-arrives', ()=>{
    PRES.spawnBehind(px, py, -lastStepDx||0, -lastStepDy||1);
    metaCommit({hushMet:true});
  });
}

// Contact. No death: a spoiled take, a lasting injury, and a presence that
// knows you a little better than it did. The world is worse now, permanently.
function onPresenceCatch(count){
  STAB.reportThreat();
  const injuries=REC.injure();
  if(REC.isRecording()) REC.spoilTake('it found you');
  CR.fx.flash(140, 'rgba(10,10,12,0.9)');
  CR.fx.shake(1.4, 420);
  pushEvent(`// it found you. you are hurt (${injuries}). you are louder now.`);
  // Shove the player away from it — not to safety, just away. Try the direction
  // that points away first, then the other cardinals: in a corridor the "away"
  // direction is often a wall, and standing still after being caught reads as
  // nothing having happened.
  const st=PRES.presenceState();
  let ax=px-st.x, ay=py-st.y;
  let m=Math.hypot(ax,ay);
  if(m<0.001 && st.escapeDir){ ax=-st.escapeDir[0]; ay=-st.escapeDir[1]; m=1; }
  if(m<0.001){ ax=0; ay=1; m=1; }
  ax/=m; ay/=m;
  const dirs=[[0,-1],[1,0],[0,1],[-1,0]]
    .sort((u,v)=>(v[0]*ax+v[1]*ay)-(u[0]*ax+u[1]*ay));   // most "away" first
  const open=(x,y)=> RENDERER!=='3d' || !solidAt(x,y);
  for(const [dx,dy] of dirs){
    if(!open(px+dx,py+dy)) continue;
    for(let k=0;k<5 && open(px+dx,py+dy);k++){ px+=dx; py+=dy; }
    break;
  }
  trail=[]; revealAround(px,py);
  faceOpenDirection();
  applyLensPreset('hush');
  setTimeout(()=>{ if(storyMode) applyLensPreset('explore'); }, 4200);
  saveCommit({ rec:REC.saveRecState(), presence:PRES.savePresenceState() });
}

// A stab is a catalogue transient played once, loud, and never explained.
// It bypasses the proximity mix: it is not "a sound in the room", it is the
// room speaking. FALSE stabs are quieter and further away — a thing you are
// not sure you heard.
function playStab(ev){
  if(!actx || !master || !ev?.chunk?.buffer) return;
  const now=actx.currentTime;
  const src=actx.createBufferSource();
  src.buffer=ev.chunk.buffer;
  src.playbackRate.setValueAtTime(ev.kind==='false' ? 0.82 : 1.0, now);
  const g=actx.createGain();
  const peak = ev.kind==='false' ? 0.22 : 0.62;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(peak, now+0.004);   // no attack. that is the point
  g.gain.exponentialRampToValueAtTime(0.0004, now+ (ev.kind==='false'?0.5:0.9));
  const pan=actx.createStereoPanner();
  // behind you, or beside you. never in front.
  pan.pan.setValueAtTime((Math.random()*2-1)*0.85, now);
  src.connect(g); g.connect(pan); pan.connect(master);
  src.start(now); src.stop(now+1.2);

  if(ev.kind==='true'){
    // Something really moved. The presence hears it too, and so should you.
    CR.fx.shake(0.5, 180);
    REC.emitNoise(0.5, px, py, 'something moved in the room');
  } else {
    CR.fx.glitch(0.4, 120);
  }
  pushEvent(ev.kind==='true' ? '// something moved.' : '// ...did you hear that?');
}

function tickStabs(dt){
  if(!storyMode || !STAB.poolSize()) return;
  const pressure = PRES.isActive() ? PRES.pressure(px,py) : 0;
  STAB.updateStabs(dt, pressure);
}

// Pages: walk over one, read it, get a waypoint and a room to record.
function tickPages(){
  if(!storyMode) return;
  const page=OBJ.tryPickup(px,py);
  if(!page) return;
  CUES.playCue(CUES.CUE.light, {gain:0.35, rate:1.4});
  OBJ.setWaypoint(page.x + 40, page.y - 30, page.roomId);
  pushEvent(`// a page. ${roomLabel(page.roomId)} still needs tone.`);
  STAB.reportRelief(0.3);    // finding something is a small exhale
  saveCommit({ obj:OBJ.saveObjState() });
}

function tickPresence(dt){
  if(!storyMode || !PRES.isActive()) return;
  PRES.updatePresence(dt, px, py, onPresenceCatch);
  // Its nearness bleeds into the room tone: the floor thickens as it closes.
  RT.setBed(ROOM_TONE.bedGain * (1 + PRES.pressure(px,py)*2.6), 0.4);
}

function tickRecorder(dt){
  if(!storyMode) return;
  REC.decayNoise(dt);
  const st=REC.tickRecording(dt);
  if(st==='complete'){
    const room=currentWorld();
    REC.addTake(room);
    STAB.reportRelief(0.55);          // a clean take is the biggest exhale there is
    OBJ.clearWaypoint();
    saveCommit({ rec:REC.saveRecState() });
    toggleRecorder();
  } else if(st==='spoiled'){
    STAB.reportThreat();
    // Let the player watch the meter die for a beat before it closes.
    if(!spoilPendingMs) spoilPendingMs=performance.now()+900;
    else if(performance.now()>spoilPendingMs){ spoilPendingMs=0; toggleRecorder(); }
  }
}
let spoilPendingMs=0;
let movingTimer=null;
const playerKeys=new Set(['master']);   // the standard set. it does not open everything.
let bootTextCache='';
function drawBootText(){
  if(!bootTextCache) return;
  const lines=bootTextCache.split('\n');
  for(let i=0;i<lines.length;i++) uiText(2, 1+i, lines[i].slice(0,140), 't-trail-2', 0.75);
}

// Autosave is cheap and the save doubles as a diegetic object (steps quoted
// back at you in dialogue), so keep it current rather than checkpointed.
let saveAcc=0;
function saveTick(dt){
  saveAcc+=dt;
  if(saveAcc<4) return;
  saveAcc=0;
  saveCommit({ px, py, steps:stepCount, playSeconds:(getSave().playSeconds||0)+4 });
}

// One question, two geometry providers: the authored conservatory in story
// mode, the procedural lattice in JUST SURF. Everything downstream (collision,
// spawn, the presence, mutation) asks this and never the shader.
function solidAt(x,y){
  if(RENDERER!=='3d') return false;
  return usingPlan() ? FP.isSolid(x,y) : R3.r3dSolid(x,y);
}
function usingPlan(){ return storyMode && FP.isLoaded(); }
// Which room am I in? One question, asked of the authored building when there
// is one, and of the procedural field otherwise. Every consumer uses this.
function currentWorld(){ return usingPlan() ? FP.worldAt(px,py) : worldIdAt(px,py); }
function floorHere(){ return usingPlan() ? FP.floorAt(px,py) : 0; }

function faceOpenDirection(){
  if(RENDERER!=='3d') return;
  const dirs=[[0,-1],[1,0],[0,1],[-1,0]];
  for(let f=0; f<4; f++){
    const [dx,dy]=dirs[f];
    if(!solidAt(px+dx, py+dy)){ R3.r3dSetFacing(f); return; }
  }
}

function returnToTitle(){
  storyMode=false;
  setGameChrome(false);
  stopAllVoices();
  scenes.push(makeTitleScene({
    onNewGame:()=>{ newGame(); enterStory(); },
    onContinue:()=>{ enterStory(); },
    onJustSurf:enterJustSurf,
  }));
}

// Story mode hides every lab readout and fills the viewport (see styles.css
// body.game). The essentials are redrawn on the glyph layer by drawStoryHud().
function setGameChrome(on){
  document.body.classList.toggle('game', on);
  if(introTitleEl) introTitleEl.style.display = on ? 'none' : '';
  if(INTRO_VIGNETTE_EL) INTRO_VIGNETTE_EL.style.display = on ? 'none' : '';
}

function requestFullscreenSafe(){
  // Must be called from a user gesture; iframed labs need allowfullscreen.
  const el=document.documentElement;
  if(document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen().then(ensureInteractionFocus).catch(()=>{});
}

// The glyph layer is the only surface the diffusion lens cannot repaint, so
// everything the player must be able to trust lives here. M3 adds the compass
// and the shitty minimap alongside.
function drawStoryHud(){
  if(!storyMode || scenes.blocksWorld()) return;
  const { cols, rows }=uiSize();
  const msg=eventQueue[eventQueue.length-1];
  if(msg) uiText(2, rows-2, msg.slice(0,110), 't-trail-2', 0.55);

  const rec=REC.recState();
  if(!rec.light && !rec.recording) uiText(2, 2, '(dark)', 't-trail-3', 0.5);

  // A very shitty map: you, and a waypoint. No walls, no routes.
  const wp=OBJ.waypoint();
  drawMinimap(px, py, wp, { label: roomLabel(currentWorld()) });

  // The compass line, the way a person estimates: a bearing and a vague sense.
  const bear=OBJ.bearingTo(px,py);
  if(bear) uiText(2, 2 + (rec.light?0:1), `${roomLabel(OBJ.targetRoom())} lies ${bear.bearing} — ${bear.far}`, 't-trail-2', 0.6);

  // Takes: the job, counted.
  const takes=rec.takes.length;
  uiText(2, 1, `takes ${takes}/5${rec.injuries?`   hurt ×${rec.injuries}`:''}`, takes?'t-key':'t-trail-3', 0.75);
  if(KEY_DEBUG){
    if(lastKeyDebug) uiText(2, 4, lastKeyDebug.slice(0,130), 't-key', 0.9);
    try{
      const w=window.__probe.why();
      uiText(2, 5, `delta=[${w.arrowDelta}] wallAhead=${w.wallAhead} onboard=${w.onboardingActive}`
        +` rec=${w.recording} interval=${Math.round(w.moveIntervalMs)}ms keys=${w.keysDown.join(',')||'-'}`, 't-key', 0.9);
    }catch(_){}
  }

  // The verbs must be discoverable. A player should never have to guess that
  // the recorder exists in a game about recording.
  if(!rec.recording){
    const hint = rec.light
      ? '[f] light off   [r] record   [shift] slow   [esc] pause'
      : '[f] light       [r] record   [shift] slow   [esc] pause';
    uiText(Math.max(2, cols - hint.length - 2), rows-2, hint, 't-trail-3', 0.45);
  } else {
    const hint='[r] stop recording';
    uiText(Math.max(2, cols - hint.length - 2), rows-2, hint, 't-trail-3', 0.45);
  }

  if(rec.recording){
    // A tape meter. It fills for forty-five seconds, and any noise kills it.
    const w=Math.min(46, cols-8);
    const x=Math.floor((cols-w)/2), y=rows-5;
    const p=REC.takeProgress();
    const filled=Math.round(p*(w-2));
    const spoiled=rec.spoiled;
    const cls=spoiled ? 't-hush-core' : 't-key';
    uiText(x, y-1, spoiled ? `TAKE SPOILED — ${rec.spoilReason}` : '● REC', cls);
    uiText(x, y, '[', 't-trail-2');
    for(let i=0;i<w-2;i++){
      uiText(x+1+i, y, i<filled ? '▓' : '░', i<filled ? cls : 't-trail-4',
             i<filled ? 1 : 0.4);
    }
    uiText(x+w-1, y, ']', 't-trail-2');
    const left=Math.max(0, ROOM_TONE.takeSeconds - rec.takeElapsed);
    uiText(x+w+2, y, `${left.toFixed(0)}s`, 't-trail-2', 0.7);
    // Noise is the thing that kills a take. Show it, so the fear is legible.
    const nz=Math.min(1, REC.currentNoise()/ROOM_TONE.spoilNoise);
    uiText(x, y+2, 'noise ', 't-trail-3', 0.6);
    for(let i=0;i<12;i++){
      uiText(x+6+i, y+2, i < Math.round(nz*12) ? '▮' : '▯',
             nz>0.85 ? 't-hush-core' : 't-trail-2', nz>0.05?0.9:0.35);
    }
  }
}

// Test surface. Silence and noise are invisible, so acceptance has to assert
// on the actual numbers rather than on screenshots.
function installProbe(){
  window.__probe={
    voices:()=>voices.size,
    pos:()=>({x:px,y:py}),
    rec:()=>({...REC.recState()}),
    floor:()=>REC.noiseFloor(),
    noise:(v)=>REC.emitNoise(v, px, py, 'the room was not empty'),
    injure:()=>REC.injure(),
    world:()=>currentWorld(),
    presence:()=>({...PRES.presenceState(), dist:PRES.distanceTo(px,py), pressure:PRES.pressure(px,py)}),
    spawnPresence:(d=6)=>PRES.spawnBehind(px,py,0,d/Math.abs(d||1)),
    placePresence:(x,y)=>{ const st=PRES.presenceState(); st.active=true; st.x=x; st.y=y; },
    solid:(x,y)=>solidAt(x,y),
    plan:()=>({loaded:FP.isLoaded(), ...FP.planSize()}),
    cell:(x,y)=>FP.cellAt(x,y),
    canStep:(ax,ay,bx,by)=>FP.canStep(ax,ay,bx,by,{keys:playerKeys}),
    floorH:()=>floorHere(),
    rgbaAt:(x,y)=>{ const p=FP.floorplan(); const i=(y*p.w+x)*4; return [...p.rgba.slice(i,i+4)]; },
    facing:()=>R3.r3dDelta(1),
    stabs:()=>STAB.stabStats(),
    stabFire:(k)=>STAB.stab(k),
    stabPool:()=>STAB.poolSize(),
    stabTune:(o)=>Object.assign(STAB.STABS,o),
    stabRelief:(a)=>STAB.reportRelief(a),
    stabThreat:()=>STAB.reportThreat(),
    setReduceDread:(v)=>{ const st=getSave(); st.settings.reduceDread=!!v; saveCommit({settings:st.settings}); },
    obj:()=>({wp:OBJ.waypoint(), target:OBJ.targetRoom(), read:OBJ.pagesRead()}),
    placePage:(dx,dy,room)=>OBJ.placePage(px+dx,py+dy,room||'the_tub'),
    // Why did a step not happen? Report every gate, in order.
    why:()=>{
      const [dx,dy]=arrowDelta();
      const fwd=RENDERER==='3d'?R3.r3dDelta(1):[0,-1];
      return {
        renderer:RENDERER, storyMode, inRogue, depth,
        onboardingActive:isOnboardingActive(), onboardingPhase,
        recording:REC.isRecording(),
        keysDown:[...keysDown],
        arrowDelta:[dx,dy],
        wallAhead:RENDERER==='3d'?R3.r3dSolid(px+fwd[0],py+fwd[1]):false,
        canMoveOnboarding:isOnboardingActive()?canMoveInOnboarding(px+fwd[0],py+fwd[1],fwd[0],fwd[1]):true,
        moveIntervalMs:currentMoveIntervalMs(), sinceLastMoveMs:performance.now()-lastMoveAtMs,
      };
    },
    audible:()=>{ const a=audibleCandidates(); return {n:a.audible.length, r:audioRadius(), poly:audioPoly(), chunks:chunks.length, paused, depth, tpl:worldTemplates.size, ctx:!!actx}; },
  };
}

function bootScenes(){
  window.__scenes=scenes;
  installProbe();
  // Focusable from the first frame, so the title screen answers the keyboard.
  try{ MAP_EL.setAttribute('tabindex','0'); MAP_EL.focus({preventScroll:true}); }catch(_){}
  saveLoad();
  terrorInit();
  uiInit(MAP_EL);
  scenes.scenesInit({ applyLensPreset });
  dialogueInit({ effects:runEffect, blip:speakerBlip });
  loadScript(PROLOGUE_DIALOGUE);

  const qp=new URLSearchParams(location.search);
  if(!qp.has('debug')){
    if(SUBWORLD2_BTN) SUBWORLD2_BTN.style.display='none';
    if(DEBUG_KEYS_BTN) DEBUG_KEYS_BTN.style.display='none';
  }
  const mode=qp.get('mode');
  if(mode==='surf'){ enterJustSurf(); return; }
  if(mode==='story' || qp.has('talk')){ enterStory(); return; }

  const wantFs=qp.has('fullscreen');
  scenes.push(makeTitleScene({
    onNewGame:()=>{ if(wantFs) requestFullscreenSafe(); newGame(); enterStory(); },
    onContinue:()=>{ if(wantFs) requestFullscreenSafe(); enterStory(); },
    onJustSurf:enterJustSurf,
  }));
}

// ── Diffusion lens bootstrap (dev + demo) ─────────────────────────────────────
async function resolveLensConfig(qp){
  if(qp.get('diffusion')) return { url:qp.get('diffusion'), token:qp.get('dtoken')||'' };
  if(!qp.has('lens')) return null;
  try{
    const res=await fetch('./lens.local.json', {cache:'no-store'});
    if(!res.ok) throw new Error(res.status);
    return await res.json();
  }catch(err){
    console.warn('lens.local.json missing — base render only. See tools/chunk_surfer/diffusion_server/README.md');
    return null;
  }
}
async function startLens(qp){
  if(window.__diffusion) return;   // one lens, one socket
  const cfg=await resolveLensConfig(qp);
  if(!cfg?.url) return;
  const [{diffusionStart}, {PRESETS}, {mountTuner}] = await Promise.all([
    import('./net/diffusion.js'), import('./net/lens-presets.js'), import('./net/tuner.js'),
  ]).catch((err)=>{ console.error('lens modules failed', err); return []; });
  if(!diffusionStart) return;
  window.__lensPresets=PRESETS;

  const preset=PRESETS[qp.get('preset')||'explore'] || PRESETS.explore;
  const num=(k,d)=>qp.has(k)?parseFloat(qp.get(k)):d;
  const opts={
    strength:num('dstrength', preset.strength),
    passes:qp.has('dpasses')?parseInt(qp.get('dpasses'),10):preset.passes,
    feedback:num('dfeedback', preset.feedback),
    drift:num('ddrift', preset.drift),
    guidance:num('dguidance', preset.guidance),
  };
  // undefined (not '') so the zone prompt owns it from the first frame
  const prompt=qp.get('dprompt') || preset.prompt || undefined;
  if(prompt) window.__lensPromptLocked=true;

  window.__diffusion=diffusionStart({
    sourceCanvas:R3.r3dCanvas(),
    hostEl:MAP_EL,
    url:cfg.url,
    token:cfg.token||'',
    prompt,
    ...opts,
    onStatus:(s)=>{
      if(s.server) console.info('diffusion server:', JSON.stringify(s.server));
      if(s.state!=='streaming') console.info('diffusion:', s.state);
    },
  });

  MAP_EL.style.position='relative';
  // lens HUD: always visible so fallback vs streaming is unambiguous
  const hud=document.createElement('div');
  hud.style.cssText='position:absolute;top:6px;right:10px;z-index:5;font:11px "Courier New",monospace;color:#9fb8a5;opacity:0.85;pointer-events:none;text-shadow:0 0 4px #000;';
  MAP_EL.appendChild(hud);
  let lastIn=0;
  setInterval(()=>{
    const st=window.__diffusion?.stats;
    if(!st){ hud.textContent=''; return; }
    const fps=st.framesIn-lastIn; lastIn=st.framesIn;
    if(st.state!=='streaming'){
      hud.textContent = `lens ○ ${st.state} — base render`;
    } else if(fps>0){
      hud.textContent = `lens ● ${fps}fps ${Math.round(st.lastRttMs)}ms   [t] tuner`;
    } else if(st.framesIn>0){
      // Sample-and-hold: no frames is the design, not a stall.
      hud.textContent = `lens ◍ held   [t] tuner`;
    } else {
      hud.textContent = `lens ○ warming — base render`;
    }
  }, 1000);

  if(qp.get('tuner')!=='0'){
    const t=mountTuner(MAP_EL, ()=>window.__diffusion);
    t.setState(opts);
  }
}

// The lens repaints per zone: crossing into another world, or in/out of an
// expanse, swaps the prompt (see net/zone-prompts.js). A manual prompt from
// the tuner or ?dprompt/preset takes precedence until cleared.
let lastZoneKey='';
function updateZonePrompt(){
  const d=window.__diffusion;
  if(!d || !zonePromptFor || window.__lensPromptLocked) return;
  const worldId=currentWorld();
  const expanse=usingPlan() ? (FP.ceilAt(px,py)-FP.floorAt(px,py) > 6) : R3.r3dIsExpanse(px,py);
  const key=`${worldId}:${expanse?'e':'c'}`;
  if(key===lastZoneKey) return;
  lastZoneKey=key;
  // prompt AND seed: a world is the same world every time you walk into it
  d.setZone(zonePromptFor(worldId, expanse), zoneSeedFor(worldId, expanse));
}
let zonePromptFor=null, zoneSeedFor=()=>undefined;
import('./net/zone-prompts.js').then((m)=>{ zonePromptFor=m.promptFor; zoneSeedFor=m.seedFor; }).catch(()=>{});

function render3d(){
  if(fog.size!==r3dCache.fogSize){
    R3.r3dUpdateFog(fogGet, px, py);
    r3dCache.fogSize=fog.size;
  }
  updateZonePrompt();
  let voiceSum=0;
  for(const [,v] of voices) voiceSum+=v.target||0;
  const firstKey=keyMap.size>0 ? keyMap.values().next().value : null;
  R3.r3dFrame({
    px, py,
    tileW:WORLD_TILE_W, tileH:WORLD_TILE_H,
    worldCount:worldsConfig.length,
    worldTints:worldsConfig.map(w=>R3.WORLD_RGB[w.id]||[0.6,0.6,0.6]),
    chunks:r3dNearChunks(),
    key:firstKey,
    door,
    hush: (storyMode && PRES.isActive())
      ? {x:PRES.presenceState().x, y:PRES.presenceState().y,
         strength: 0.55 + PRES.pressure(px,py)*0.45}
      : (hush.active?{x:hush.x, y:hush.y, strength:1}:null),
    audio:clamp(voiceSum/3, 0, 1),
    light: storyMode ? REC.lightOn() : true,
    plan: usingPlan(),
    floorH: floorHere(),
  });
}

// ── Loading ───────────────────────────────────────────────────────────────────
async function fetchFile(file){
  file.status='loading';
  try{
    const res=await fetch(file.url);
    if(!res.ok) throw new Error(res.status);
    const cl=res.headers.get('content-length');
    file.total=cl?parseInt(cl):0;
    const reader=res.body.getReader(), parts=[];
    while(true){const{done,value}=await reader.read();if(done)break;parts.push(value);file.recv+=value.length;}
    const flat=new Uint8Array(file.recv);
    let off=0; for(const p of parts){flat.set(p,off);off+=p.length;}
    ensureCtx();
    file.buffer=await actx.decodeAudioData(flat.buffer.slice(0));
    file.status='done';
    file.analysis=analyze(file.buffer);
    file.biome=biomeFrom(file.analysis);
    // Smooth loop boundaries before any voice ever plays this buffer.
    file.loopFadeSec=smoothBufferLoop(file.buffer, 60);

    const charId=makeCharId(chunks.length);
    const chunk={idx:file.idx,label:file.label,charId,
                 iconChar:iconFor(file.analysis),
                 name:`${file.worldId}_${file.label}.mp3`,
                 buffer:file.buffer,analysis:file.analysis,biome:file.biome,
                 loopFadeSec:file.loopFadeSec,
                 worldId:file.worldId,
                 biomeId:`${file.worldId}:${file.biome}`,
                 baseVol:baseVolFor(file.analysis),
                 wx:0,wy:0,heard:false};
    chunks.push(chunk);
    chunkByIdx.set(chunk.idx, chunk);

    if(!inRogue&&chunks.length>=SURF_AT) enterRogue();
    else if(inRogue) stampChunk(chunk); // late arrival
  }catch(e){file.status='error';}
}

async function loadAll(){
  let qi=0;
  const worker=async()=>{while(qi<files.length)await fetchFile(files[qi++]);};
  await Promise.all(Array.from({length:CONCURRENCY},()=>worker()));
  allFilesLoaded=true;
  if(storyMode) STAB.buildStabPool(chunks);
  if(inRogue){
    buildWorldTemplates();
    buildWorldDroneBanks();
    revealAround(px,py);
    updateAudio();
    pushEvent('// world sync complete.');
  }
}

// ── Enter roguelike ────────────────────────────────────────────────────────────
let enteringRogue=false;
function enterRogue(){
  // CONCURRENCY=8 loaders race here: several can pass the !inRogue check in
  // fetchFile before any of them sets it. Re-entry built the world twice and
  // opened two diffusion sockets, which then evicted each other (close 1012).
  if(inRogue || enteringRogue) return;
  enteringRogue=true;
  bootTextCache='';
  // Never enter active mode until world build succeeds.
  try{
    // Set intro phase first so buildWorld's initial revealAround uses the tiny
    // intro FOV (currentFovRadius()) instead of the full FOG_R.
    onboardingPhase=ONBOARDING_PHASES.INTRO_PRELUDE;
    introDistance=0;
    buildWorld();
    introAnchorX=px;
    introAnchorY=py;
    inRogue=true;
  }catch(err){
    inRogue=false;
    enteringRogue=false;
    pushEvent('// boot error: world init failed.');
    console.error('enterRogue failed', err);
    return;
  }
  enteringRogue=false;
  if(RENDERER==='3d'){
    // 3D mode boots straight into the live field: the 2D funnel intro is a
    // top-down construction; its 3D replacement is an M4 cutscene.
    try{ R3.r3dInit(MAP_EL); }catch(err){ console.error('r3d init failed', err); }
    disableOnboardingForSession();
    if(storyMode) loadBuilding();
    // ?at=x,y — debug spawn (M2 will generalise this to ?warp=<room>)
    const atParam=new URLSearchParams(location.search).get('at');
    if(atParam && /^-?\d+,-?\d+$/.test(atParam)){
      const [ax,ay]=atParam.split(',').map(Number);
      px=ax; py=ay; trail=[]; revealAround(px,py);
    }
    faceOpenDirection();   // never start facing a wall in a 2-wide lane
    // never spawn inside a wall slab
    if(R3.r3dSolid(px,py)){
      outer: for(let r=1;r<12;r++){
        for(let oy2=-r;oy2<=r;oy2++) for(let ox2=-r;ox2<=r;ox2++){
          if(Math.max(Math.abs(ox2),Math.abs(oy2))!==r) continue;
          if(!solidAt(px+ox2,py+oy2)){ px+=ox2; py+=oy2; break outer; }
        }
      }
      revealAround(px,py);
    }
    // Diffusion lens. Either explicit (?diffusion=<wss>&dtoken=<tok>) or, for
    // local work, ?lens=1 which reads lens.local.json (gitignored) so the
    // token never lives in a URL. Any failure leaves the base render up.
    const qp=new URLSearchParams(location.search);
    startLens(qp);
  }
  try{
    MAP_EL.setAttribute('tabindex','0');
    MAP_EL.focus({ preventScroll:true });
  }catch(_){}
  if(storyMode) disableOnboardingForSession();
  updateOnboardingButton();
  startAmbientDroneAt(currentAmbientTarget());
  updateAudio();
  if(!storyMode) pushEvent('// onboarding: advance forward into the field.');
  // Aggressive initial focus lock for the first second of onboarding.
  setTimeout(ensureInteractionFocus, 0);
  setTimeout(ensureInteractionFocus, 120);
  setTimeout(ensureInteractionFocus, 300);
  setTimeout(ensureInteractionFocus, 650);
}

// ── Keys ──────────────────────────────────────────────────────────────────────
const ARROW_KEYS=new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown']);
const MOVE_KEYS=new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','a','A','d','D','w','W','s','S']);
function forwardHeld(){ return keysDown.has('ArrowUp') || keysDown.has('w') || keysDown.has('W'); }
function leftHeld(){ return keysDown.has('ArrowLeft') || keysDown.has('a') || keysDown.has('A'); }
function rightHeld(){ return keysDown.has('ArrowRight') || keysDown.has('d') || keysDown.has('D'); }
function backHeld(){ return keysDown.has('ArrowDown') || keysDown.has('s') || keysDown.has('S'); }
let lastKeyDebug='';
function onKey(e){
  if(KEY_DEBUG){
    lastKeyDebug=`key=${e.key} code=${e.code||'(none)'} meta=${e.metaKey?1:0} ctrl=${e.ctrlKey?1:0}`
      + ` | story=${storyMode?1:0} rec=${REC.isRecording()?1:0} scenes=${scenes.depth()} rogue=${inRogue?1:0}`;
  }
  // typing in the lens tuner must not drive the player
  if(e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  if(e.key==='t' || e.key==='T') return; // owned by the tuner panel

  // Scenes (title, dialogue, menus) get first refusal on every key — before
  // inRogue, so the title screen works while the field is still loading.
  if(scenes.depth()>0){
    e.preventDefault();
    scenes.key(e);
    return;
  }
  if(!inRogue) return;
  if(storyMode && e.key==='Escape'){
    e.preventDefault();
    scenes.push(makeMenuScene({ onQuitToTitle:returnToTitle }));
    return;
  }
  if(storyMode){
    // Match on e.code AND e.key: e.code survives non-QWERTY layouts, e.key
    // survives environments that don't populate code (remote input, some IMEs).
    // Only Cmd/Ctrl are reserved for the browser (Cmd+F is Find).
    const bare = !e.metaKey && !e.ctrlKey;
    const is=(code,ch)=> e.code===code || e.key===ch || e.key===ch.toUpperCase();
    if(bare && is('KeyF','f')){
      e.preventDefault();
      const on=REC.toggleLight();
      CUES.playCue(CUES.CUE.light, {gain:0.7, rate: on ? 1 : 0.92});
      pushEvent(on ? '// light on. it can see that.' : '// light off.');
      return;
    }
    if(bare && is('KeyR','r')){
      e.preventDefault();
      toggleRecorder();
      return;
    }
    if(e.key==='Shift'){ REC.setSlow(true); return; }
  }
  // Talk to whatever is in front of you. (M4 gives this real NPCs; for now
  // the Usher is wherever you started.)
  if(storyMode && (e.key==='Enter' || e.key==='z' || e.key==='Z')){
    e.preventDefault();
    const nodeId = flagTest('prologueDone') ? 'usher.again' : 'usher.intro';
    startDialogue(nodeId);
    return;
  }
  if(RENDERER==='3d' && (e.key==='ArrowLeft'||e.key==='a'||e.key==='A'||e.key==='ArrowRight'||e.key==='d'||e.key==='D')){
    // First-person: left/right are quarter turns, not strafes.
    e.preventDefault();
    if(!e.repeat){
      const dir=(e.key==='ArrowRight'||e.key==='d'||e.key==='D') ? 1 : -1;
      R3.r3dTurn(dir);
      const d=window.__diffusion;
      if(d?.nudge){
        d.setMoving(true);
        d.nudge({ turn: dir });
        clearTimeout(movingTimer);
        movingTimer=setTimeout(()=>d.setMoving(false), 320);
      }
    }
    return;
  }
  if(MOVE_KEYS.has(e.key)){
    e.preventDefault();
    if(isOnboardingActive() && (e.key==='ArrowDown' || e.key==='s' || e.key==='S')) return;
    keysDown.add(e.key);
    if(!e.repeat) maybeLockHushFromInputKey(e.key, performance.now());
    const [dx,dy]=arrowDelta();
    if(dx||dy){
      step(dx,dy);
      onboardingHoldLastMs=performance.now();
    }
    if(!isOnboardingActive()) startMoveTimer();
    return;
  }
  switch(e.key){
    case ' ':
      e.preventDefault(); togglePause(); break;
    case 'r': case 'R':
      e.preventDefault();
      if(isIntroActive()) break;
      teleport();
      break;
    case 'l': case 'L':
      e.preventDefault();
      looping=!looping;
      for(const [,v] of voices){
        if(v.srcA) v.srcA.loop=looping;
        if(v.srcB) v.srcB.loop=looping;
      }
      pushEvent(`// loop: ${looping?'on':'off'}`);
      break;
    case 'c': case 'C':
      e.preventDefault();
      toggleCatalog();
      pushEvent(`// catalog: ${showCatalog?'open':'closed'}.`);
      break;
    case 'o': case 'O':
      e.preventDefault();
      if(isIntroActive()){
        disableOnboardingForSession();
      } else {
        pushEvent('// onboarding already complete this session.');
      }
      break;
  }
}
function onKeyUp(e){
  if(e.key==='Shift') REC.setSlow(false);
  if(MOVE_KEYS.has(e.key)) keysDown.delete(e.key);
}
function onBlur(){
  // Releasing focus mid-press would otherwise leave keys "stuck".
  keysDown.clear();
  if(moveTimer){ clearTimeout(moveTimer); moveTimer=null; }
}
function ensureInteractionFocus(){
  // Must work before inRogue too: the title screen is keyboard-driven, and an
  // iframed lab starts unfocused until something inside it takes focus.
  if(!MAP_EL) return;
  try{
    if(document.activeElement!==MAP_EL){
      MAP_EL.focus({ preventScroll:true });
    }
  }catch(_){}
}

// ── Boot ──────────────────────────────────────────────────────────────────────
function boot(){
  const worldSummary = MANIFEST.worlds.map((w) => `${w.label}:${w.files.length}`).join(' · ');
  const lines=[
    'chunk surfer // cbassuarez.com',
    worldSummary,
    '',
    '[ok] AudioContext',
    `[ok] ${SAMPLE_COUNT} samples queued`,
    '[  ] fetching ...'
  ];
  let i=0;
  const next=()=>{if(i<lines.length){bootLog.push(lines[i++]);setTimeout(next,i<3?40:100);}};
  next();
  CATALOG_TOGGLE_BTN.addEventListener('click', ()=>toggleCatalog());
  if(ONBOARDING_TOGGLE_BTN){
    ONBOARDING_TOGGLE_BTN.addEventListener('click', ()=>{
      if(isIntroActive()) disableOnboardingForSession();
      else pushEvent('// onboarding already complete this session.');
    });
  }
  if(SUBWORLD2_BTN){
    SUBWORLD2_BTN.addEventListener('click', ()=>jumpToSubWorld2());
  }
  if(DEBUG_KEYS_BTN){
    DEBUG_KEYS_BTN.addEventListener('click', ()=>grantAllKeysForCurrentLevel());
  }
  // Register input/focus handlers once; avoid missing controls during a partial
  // enterRogue path.
  window.addEventListener('keydown',onKey, {capture:true});
  window.addEventListener('keyup',onKeyUp, {capture:true});
  window.addEventListener('pointerdown', ensureInteractionFocus, {passive:true});
  // Fullscreen and iframe transitions silently drop keyboard focus.
  document.addEventListener('fullscreenchange', ensureInteractionFocus);
  window.addEventListener('message', ensureInteractionFocus, {passive:true});
  window.addEventListener('focus', ensureInteractionFocus, {passive:true});
  document.addEventListener('visibilitychange', ()=>{
    if(!document.hidden) ensureInteractionFocus();
  });
  window.addEventListener('blur',onBlur);
  updateOnboardingButton();
  bootScenes();
  raf=requestAnimationFrame(loop);
  loadAll();
  loadSw2DriverAudio();
}

boot();
