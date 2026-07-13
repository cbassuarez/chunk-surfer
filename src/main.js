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
  AMBIENT_DRONE_GAIN, AMBIENT_BIT_LEVELS, AMBIENT_LOOP_SEC, WORLD_LAYER,
  CELL_SCALE
} from './config.js';
import { MANIFEST, PIECE_CATALOG, files, worldsConfig, SAMPLE_COUNT } from './manifest.js';
import { fft, analyze, biomeFrom } from './audio/analysis.js';
import * as CR from './render/canvas.js';
import * as R3 from './render/r3d.js';
import * as MONITOR from './audio/monitor.js';
import { emitAcousticEvent } from './audio/acoustic-events.js';
import { createHushMix } from './audio/hush-mix.js';
import * as FP from './world/floorplan.js';
import { F as CELL_FLAGS, ZONE, CELL } from './data/floorplan/legend.js';
import * as MUT from './world/mutate.js';
import * as scenes from './game/scenes.js';
import { uiInit, uiClear, uiText, uiSize, uiFill, uiCenter, uiDraw, uiPointFromClient, uiWrap } from './render/ui.js';
import { drawVfdCounter, drawVfdMeter, drawMachinePanel, drawLocationIndicator, drawVfdText } from './render/presentation.js';
import { applyVfdSettings } from './render/palette.js';
import { saveLoad, saveCommit, getSave, newGame, metaCommit, getMeta } from './game/save.js';
import { flagApply, flagTest, flagGet } from './game/flags.js';
// The M2 dialogue runtime (game/dialogue.js, data/prologue.js, the Usher) is
// gone. Conversations are game/conversation.js now, and there is nobody in this
// building to talk to.
import { makeTitleScene } from './game/title.js';
import { makeSettingsScene } from './game/settings.js';
import { terrorInit, once, interpolate } from './game/terror.js';
import * as REC from './game/recordist.js';
import * as RT from './audio/roomtone.js';
import * as PRES from './game/presence.js';
import * as PROPS from './game/props.js';
import * as CUES from './audio/cues.js';
import * as STORY from './audio/story-audio.js';
import * as FEAR from './audio/fear.js';
import * as STAB from './game/stabs.js';
import * as OBJ from './game/objectives.js';
import * as DOC from './game/document.js';
import * as RADIO from './game/radio.js';
import * as PB from './game/playback.js';
import { makeBattleScene } from './game/battle.js';
import * as ENCOUNTERS from './game/encounters.js';
import { natatoriumBattle, practiceBattle, hallBattle, hallPlayback, practicePlayback, natatoriumPlayback, chapelBoss } from './data/battles.js';
import * as MIC from './game/mic.js';
import { takeStamp, WORK_ORDER_STAMP } from './game/clock.js';
import { drawMinimap, drawRecorderReturn } from './render/minimap.js';
import { BUILDING_MAP } from './data/building-map.js';
import { captureDoorMapState, captureFloorplanMapSource, buildMapModel } from './game/map-model.js';
import { createHushTelemetry } from './game/hush-telemetry.js';
import { createHushAudioRuntime } from './game/hush-audio-runtime.js';
import { roomLabel, roomToneCharacter } from './audio/manifest-map.js';
import * as SPEECH from './game/speech.js';
import * as TUT from './game/tutorial.js';
import { objectiveHintsMode, pauseWhenBlurEnabled, tutorialPromptsEnabled } from './game/access.js';
import { makeBagScene } from './game/bag.js';
import { makeColdOpenScene, makeWorldTitleScene } from './game/coldopen.js';
import { makeWarningScene } from './game/warning.js';
import * as CONTROLLER from './game/controller.js';
import * as BINDINGS from './game/bindings.js';
import { makeThoughtScene, thoughtHad, markThought,
         loadThoughtState, saveThoughtState } from './game/thoughts.js';
import { makeBagLabScene } from './game/bag-lab.js';
import { makeMapLabScene } from './game/map-lab.js';
import { makeHushAudioLabScene } from './game/hush-audio-lab.js';
import { makeDifficultySelectScene } from './game/difficulty-select.js';
import { makeArchiveScene } from './game/archive.js';
import { makeReturnIndexScene } from './game/return-index.js';
import { makeReturnReportScene } from './game/return-report.js';
import { makeAchievementNoticeScene } from './game/achievement-notice.js';
import { makeProgressionLabScene } from './game/progression-lab.js';
import { chooseJsonFile, downloadJsonFile } from './game/profile-io.js';
import {
  applyCurrentRuleChange,
  assertProgressionInvariants,
  beginRunProgression,
  commitReturn,
  currentDifficulty,
  emitProgress,
  pendingReturnReport,
  previewCurrentRuleChange,
  progressionInit,
  progressionSnapshot,
} from './progression/runtime.js';
import { EVENT_TYPES } from './progression/events.js';
import { createReplayService } from './progression/knowledge.js';
import { deriveUnlocks } from './progression/unlocks.js';
import { consumeNotice, noticePolicy, peekNotice } from './progression/notifications.js';
import { syncPlatform } from './progression/platform-sync.js';
import { exportProfile, mergeImportedProfile } from './progression/profile.js';
import { currentPlatform } from './platform/index.js';
import { WORK_ORDER, TRANSMISSIONS, SQUELCH_LINES,
         PAGES, ROOM_CELLS, MAIN_EXIT_CELL, TARGETS, COLD_OPEN, AFTER_TITLE, COLD_OPEN_DIALOGUE,
         POST_DOOR, LEVEL_CHECK, FIRST_TAKE, HUSH, RADIO_DEAD,
         BENT_RIG, PLANT_RIG_CELL, TALISMAN, TALISMAN_CELL, roomListen,
         PROLOGUE_THOUGHTS, LINES, HIM_LINES, guestLines,
         CHAPEL_KEY_CHECK,
         endingChoice, sacrificeEnding, INVERT_START, FALSE_DOOR, rescueEnding,
         INVERSION_FINAL, guardEpilogue, helpedEnding, druggedReveal,
         takenLines, foundLine } from './data/conservatory-script.js';
export { fx } from './render/canvas.js';

// M1: canvas glyph renderer is the default; `?renderer=dom` keeps the legacy
// innerHTML path during the parity window (removed in M2).
// M1b: `?renderer=3d` = first-person raymarched world (diffusion-lens base).
const KEY_DEBUG = new URLSearchParams(location.search).has('keydebug');
const NO_THINK = new URLSearchParams(location.search).has('nothink');
const D = (n) => n * CELL_SCALE;
const SCALED_MOVE_MIN = (n) => Math.max(1, Math.round(n / CELL_SCALE));
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
let nextMoveAtMs=0;

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
let renderMove=null;            // frame interpolation between collision cells
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
  catchDistance: D(0.78),
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
  areaDist: D(16),
  areaEnterRadius: D(8),
  grabMinRadius: D(1.8),
  grabMaxRadius: D(3.8),
  killRadiusBase: D(1.05),
  killRadiusFailStep: D(0.18),
  hubDepositRadius: D(2.2),
  approachFreshMs: 320,
  revealMs: 2200,
  darknessStep: 0.15,
  darknessMax: 0.9,
  finalDoorDist: D(22),
  finalCatchRadius: D(1.2),
  finalDriftSpeed: D(0.34),
  finalLossCooldownMs: 1400,
  finalVisionRadius: D(26),
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
let outGain=null;
let dialogGain=null;
let sfxGain=null;
let sfxDirectGain=null;
let musicGain=null;
let menuGain=null;
let outputMonitor=null;
let hushAudioMix=null;
let hushAudioRuntime=null;
let hushLightScale=1;
let audioInitFailed=false;

const clamp01 = (v, fallback = 1) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
};

function setGainNode(node, v, ramp = 0.02) {
  if (!node || !actx) return;
  node.gain.setTargetAtTime(clamp01(v), actx.currentTime, ramp);
}

// GLOBAL. Sits at the very end of the bus so it scales everything without
// changing the authored relationship between dialog, SFX, and music.
function setOutputVolume(v){ setGainNode(outGain, v); }
function setGlobalVolume(v){ setOutputVolume(v); }

// SPOKEN / DIALOG: SAM voice and type/dialog ticks.
function setDialogVolume(v){ setGainNode(dialogGain, paused ? 0 : v); }

// SFX: page turns, stabs, hushes, room tone, object sounds, menu sounds.
function setSfxVolume(v){
  setGainNode(sfxGain, paused ? 0 : v);
  setGainNode(sfxDirectGain, paused ? 0 : v);
  setGainNode(menuGain, v);
}

// MUSIC: title/intro music only.
function setMusicVolume(v){ setGainNode(musicGain, paused ? 0 : v); }
function setMonitorVolume(v){
  const st=getSave().settings||{};
  if(hushAudioMix) hushAudioMix.applyField(
    hushAudioRuntime?.currentField?.() || null,
    st,
    {monitorGain:v,monitorOpen:storyMode&&!itemLost('recorder')},
  );
}

function applyAudioSettings() {
  const st = getSave().settings || {};
  setOutputVolume(st.volume ?? 1);
  setDialogVolume(st.dialog ?? 1);
  setSfxVolume(st.sfx ?? 1);
  setMusicVolume(st.music ?? 1);
  setMonitorVolume(st.monitorGain ?? 1);
}
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
        outputMonitor=MONITOR.monitorInit(actx, actx.destination);

        outGain=actx.createGain();
        dialogGain=actx.createGain();
        sfxGain=actx.createGain();
        sfxDirectGain=actx.createGain();
        musicGain=actx.createGain();
        menuGain=actx.createGain();

        // The HUSH field sits between physical SFX and the output stages. It is
        // neutral at zero pressure, so the existing mix is unchanged until the
        // presence is near. Dialog and UI remain trustworthy and bypass it.
        hushAudioMix=createHushMix(actx,{worldDestination:master,directDestination:limiter});
        dialogGain.connect(master);
        sfxGain.connect(hushAudioMix?.worldInput || master);
        musicGain.connect(master);
        sfxDirectGain.connect(hushAudioMix?.directInput || limiter);
        menuGain.connect(limiter);

        master.connect(limiter);
        limiter.connect(outGain);
        outGain.connect(outputMonitor || actx.destination);

        applyAudioSettings();

        RT.roomToneInit(actx, sfxGain);
        STORY.storyAudioInit(actx, sfxGain, {
          dialog: dialogGain,
          sfx: sfxGain,
          music: musicGain,
          menu: menuGain,
        });
        CUES.cuesInit(actx, sfxDirectGain);
        FEAR.fearAudioInit(actx, sfxGain);
        // The final-output analyser remains in the audible graph. The physical
        // room mic joins its display as RMS only and is never routed to output.
        MONITOR.monitorSetAuxInput(()=>MIC.micActive()?MIC.micLevel():0);

        CUES.preloadAll([...Object.values(CUES.CUE), ...CUES.PAGE_TURNS]);
        STORY.preloadAll();
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
// The monitor opens while you LISTEN — that is when the room is in the cans and
// you can move around in it. It CLOSES the instant you roll: a take is silent,
// tape hiss and nothing else, which is the whole terror of holding one.
function audioRadius(){
  if(!storyMode) return AUDIO_R;
  return REC.isListening() ? ROOM_TONE.monitorRadius : 0;
}
function audioPoly(){
  if(!storyMode) return POLY_MAX;
  return REC.isListening() ? ROOM_TONE.monitorPoly : 0;
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
  return Math.exp(-d / D(12));
}
// Combined voice gain: proximity × per-chunk baseline × biome × world.
// No terrain gate — proximity alone governs audibility, so wilderness/voids
// still hear nearby chunks bleeding in. World membership and biome weight
// scale contribution but never gate to zero, so blends are smooth.
function voiceGain(chunk, d, ctx, emitterGain=1){
  const monitoring=storyMode && REC.isListening();
  const prox=monitoring ? monitorProx(d, audioRadius()) : proxFor(d, audioRadius());
  if(prox<=0) return 0;
  const bw=biomeWeightFor(ctx, chunk);
  const ww=Math.max(0.06, ctx.worldMembership[chunk.worldId]??0);
  // User MONITOR GAIN lives in the monitor bus. Keeping it out of the voice
  // calculation avoids applying the fader twice and keeps HUSH hearing wholly
  // independent from what the operator chooses to hear.
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
    out.push({dx:dx*D(6),  dy:dy*D(6),  w:0.55});
    out.push({dx:dx*D(14), dy:dy*D(14), w:0.22});
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
  panner.connect(hushAudioMix?.programInput || hushAudioMix?.worldInput || master);

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

function sampleFieldSuppressed(){
  return scenes.has('title') || scenes.has('cold-open') || scenes.has('world-title');
}

function silenceSampleField({ roomTone = false } = {}){
  curPlayerCtx = { onTerrain:false, biomeId:null, worldId:(storyMode && inRogue) ? currentWorld() : null, worldMembership:{} };
  if(curChunkKey){ curChunkKey=''; curChunkIdx=-1; }
  if(voices.size>0) stopAllVoices();
  stopWorldLayerVoice();
  silenceAmbientDrone();
  if(!roomTone) RT.bedOff();
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
    c.terrainRadius=clamp(TERRAIN_R_MIN+len*6*CELL_SCALE, TERRAIN_R_MIN, TERRAIN_R_MAX);
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
    const spanX=Math.max(D(10), Math.round((WORLD_TILE_W-D(8))*spread.sx));
    const spanY=Math.max(D(8), Math.round((WORLD_TILE_H-D(8))*spread.sy));
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
      c.wx=clamp(Number.isFinite(wxRaw)?Math.round(wxRaw):Math.round(WORLD_TILE_W/2),D(2),WORLD_TILE_W-D(3));
      c.wy=clamp(Number.isFinite(wyRaw)?Math.round(wyRaw):Math.round(WORLD_TILE_H/2),D(2),WORLD_TILE_H-D(3));
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
    const region={cx, cy, r:Math.max(maxD, D(18))};

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
const KEY_PLACEMENT_MIN = D(90);
const KEY_PLACEMENT_MAX = D(220);
const DOOR_MIN_DIST = D(500);
const DOOR_MAX_DIST = D(1100);
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
    const ox=Math.round(Math.cos(a+Math.PI*0.5) * D(1.6));
    const oy=Math.round(Math.sin(a+Math.PI*0.5) * D(1.6));
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
  out.connect(outputMonitor || actx.destination);

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
  const back=D(24) + Math.random()*D(9);
  const lateral=(Math.random()-0.5)*D(14);
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
  const movingRecently=(nowMs-lastMoveAtMs) < Math.max(SCALED_MOVE_MIN(84), currentMoveIntervalMs()*1.2);
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
    x:px - nx*(D(36)+Math.random()*D(8)) + rx*((Math.random()-0.5)*D(8)),
    y:py - ny*(D(36)+Math.random()*D(8)) + ry*((Math.random()-0.5)*D(8)),
  };
  hushLockedUntilMs=Math.max(hushLockedUntilMs, nowMs+1000);
  hushPingHeat=Math.max(hushPingHeat, 0.5);
  triggerGateFlash(220, 520);
  if(navigator.vibrate) navigator.vibrate([24, 72, 36, 96]);
  pushEvent('// the door sees you. the hush recoils.');
}

function spawnPeripheralEye(nowMs){
  const a=Math.random()*Math.PI*2;
  const r=D(18)+Math.random()*D(26);
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
  const minSafe=HUSH_TUNE.catchDistance + D(0.9);
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
  const prox=clamp(1-(d/D(32)), 0, 1);
  const ping=clamp(hushPingHeat/2.4, 0, 1);
  const phaseBump=horrorPhase===HORROR_SEQUENCE.DOOR_SWARM ? 0.22 : horrorPhase===HORROR_SEQUENCE.CHASE_PRESSURE ? 0.14 : 0.08;
  const doorBump=door ? clamp(1-(Math.hypot(door.x-px, door.y-py)/D(52)), 0, 1)*0.2 : 0;
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
  const maxAlong=Math.max(D(8), Math.min(D(28), len*0.88));
  const lockHeld=isHushLocked(nowMs);
  for(const s of corridorStatues){
    const along=D(1.6) + s.t*maxAlong;
    const latMag=D(1.8) + s.t*D(2.6) + s.wobble*D(0.8);
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
      const lateral=((i%2===0)?1:-1) * (D(1.2) + ((i%4)*D(0.55)));
      const anchorX=px + nx*(D(2) + t*Math.min(D(18), len*0.6));
      const anchorY=py + ny*(D(2) + t*Math.min(D(18), len*0.6));
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
    const settle=(d>D(30)?1:(d<D(9)?-1:0.28));
    eye.x += ux * settle * dt * D(6.4);
    eye.y += uy * settle * dt * D(6.4);
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
    if(d<D(7.5)){
      hushPingHeat=clamp(hushPingHeat + dt*0.45, 0, 2.3);
    }
  }
  hushEyes = hushEyes.filter((eye)=>Math.hypot(eye.x-px, eye.y-py) < D(76));
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
      const intensity=clamp((lossRadius+D(0.6)-dThreat)/(lossRadius+D(0.6)), 0.35, 1);
      if(triggerSw2Loss(nowMs, intensity)){
        area.caughtLockUntilMs=nowMs + SW2_TUNE.finalLossCooldownMs;
        const bx=(area.threatX-px) || (Math.random()<0.5?-1:1);
        const by=(area.threatY-py) || (Math.random()<0.5?-1:1);
        const bl=Math.max(0.001, Math.hypot(bx, by));
        const push=D(2.3) + Math.random()*D(1.2);
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
          const push=D(3) + Math.random()*D(1.4);
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
      tx=px - nx*D(42);
      ty=py - ny*D(42);
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
      const lurchDist=D(0.45 + hushBlinkStress*0.9 + (horrorPhase===HORROR_SEQUENCE.DOOR_SWARM ? 0.25 : 0));
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
  revealAroundWithRadius(px, py, Math.max(FOG_R, D(9)));
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
  revealAroundWithRadius(px, py, D(7));
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
  revealAroundWithRadius(p.x, p.y, D(5));
}

// Place a single door far from current player position, using the same
// scatter mechanic as keys. Called once when the final key is collected.
function spawnDoor(){
  door = placeBeacon(px, py, DOOR_MIN_DIST, DOOR_MAX_DIST);
  revealAroundWithRadius(door.x, door.y, D(6));
}

// Step through the door: stop the overworld, drop the player into a
// blank void layer one level deeper. State that belongs to the previous
// level (beacons, fog, trail, voice routing) is wiped so the new level
// reads as a clean slate.
function descendThroughDoor(){
  horrorPhase=HORROR_SEQUENCE.DESCENT_RUPTURE;
  triggerGateFlash(420, 720);
  pulseRevealRings(px, py, [D(3), D(6), D(10), D(16)]);
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

  revealAroundWithRadius(px, py, D(6));
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
  out.connect(outputMonitor || actx.destination);
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
  pulseRevealRings(px, py, [D(2), D(4), D(7), D(11)]);
  triggerGateFlash(isFinal ? 320 : 180, isFinal ? 520 : 280);
  playKeyPickupChime(isFinal);
  if(navigator.vibrate) navigator.vibrate(isFinal ? [40, 60, 80] : 35);
}

function stampChunk(c){
  if(c.terrainRadius==null){
    const len=c.analysis?.length||1;
    c.terrainRadius=clamp(TERRAIN_R_MIN+len*6*CELL_SCALE, TERRAIN_R_MIN, TERRAIN_R_MAX);
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
  updateOnboardingButton();
}

// ── Fog ───────────────────────────────────────────────────────────────────────
function currentFovRadius(){
  if(!isOnboardingActive()) return FOG_R;
  if(isPrelude()) return Math.max(D(8), INTRO_SCENE.primaryGateDist + D(2));
  // Keep intro void feeling while always showing enough terrain for movement read.
  const p=introProgress();
  return Math.max(D(6), Math.round(D(6) + (FOG_R-D(6)) * Math.pow(p, 2.0)));
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
    return Math.round(clamp(ms, SCALED_MOVE_MIN(90), SCALED_MOVE_MIN(230)));
  }
  if(depth===0 && horrorPhase===HORROR_SEQUENCE.DOOR_SWARM){
    const doorDist=door ? Math.hypot(door.x-px, door.y-py) : D(22);
    const nearGate=clamp(1-(doorDist/D(28)), 0, 1);
    ms *= 1.22 + nearGate*0.58 + (hushBlinkActive ? 0.24 : 0);
    return Math.round(clamp(ms, SCALED_MOVE_MIN(92), SCALED_MOVE_MIN(255)));
  }
  if(depth===1 && sw2.active){
    if(sw2.phase===SW2_PHASE.BOOT_SILENCE){
      ms *= 1.3;
      return Math.round(clamp(ms, SCALED_MOVE_MIN(84), SCALED_MOVE_MIN(220)));
    }
    if(sw2.phase===SW2_PHASE.AREA_LOOP){
      ms *= 1.05 + sw2.darkness*0.22;
      return Math.round(clamp(ms, SCALED_MOVE_MIN(68), SCALED_MOVE_MIN(184)));
    }
    if(sw2.phase===SW2_PHASE.FINAL_DARK){
      ms *= 1.34 + sw2.darkness*0.28 + (sw2.caught ? 0.16 : 0);
      return Math.round(clamp(ms, SCALED_MOVE_MIN(92), SCALED_MOVE_MIN(245)));
    }
    if(sw2.phase===SW2_PHASE.POST_DOOR){
      ms *= 1.24;
      return Math.round(clamp(ms, SCALED_MOVE_MIN(84), SCALED_MOVE_MIN(220)));
    }
  }
  // Keep motion responsive; difficulty is mostly handled by sink/lateral drag.
  return Math.round(clamp(ms, SCALED_MOVE_MIN(44), SCALED_MOVE_MIN(120)));
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
  ONBOARDING_TOGGLE_BTN.textContent = off ? '[O] ONBOARDING · OFF THIS SESSION' : '[O] ONBOARDING · ON';
}
function finalizeIntroTransition(targetPhase, reason='world'){
  const keepMove = forwardHeld() || leftHeld() || rightHeld();
  onboardingPhase=targetPhase;
  introDistance=INTRO_SCENE.introDistanceSteps;
  const landing=nearestWildernessCell(px, py, D(24));
  px=landing.x; py=landing.y;
  lastStepDx=0;
  lastStepDy=0;
  trail=[];
  fog = new Map();
  nextMoveAtMs=keepMove ? performance.now()+currentMoveIntervalMs() : 0;
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
  pulseRevealRings(cx, cy, [D(2),D(4),D(6),D(9)]);
}
function pulseRevealRings(cx, cy, radii=[D(2),D(4),D(6),D(9)]){
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
  hushAudioMix?.setProgramMode?.(storyMode&&REC.isListening()?'monitor':'world');
  if(sampleFieldSuppressed()){
    silenceSampleField();
    return;
  }
  if(depth > 0){
    // Void layer: shut down all chunk voices and the world drone. The
    // ambient pad is silenced too so the deeper level reads as a held
    // breath. Mirrors the onboarding gate's structure.
    curPlayerCtx = { onTerrain:false, biomeId:null, worldId:null, worldMembership:{} };
    silenceSampleField();
    return;
  }
  // ROOM TONE: walking the building is silent. No chunk voices, no world
  // drone — only the room's noise floor. The catalog exists solely on the
  // other side of the recorder's monitor, and the monitor is only open while
  // you LISTEN. Once you roll, it is silent again: hiss, and whatever the hiss
  // is hiding.
  if(storyMode && !REC.isListening()){
    curPlayerCtx = { onTerrain:false, biomeId:null, worldId:currentWorld(), worldMembership:{} };
    silenceSampleField({ roomTone:true });
    RT.bedOn();
    return;
  }
  if(isOnboardingActive()){
    const worldId=INTRO_SCENE.worldId;
    const membership={};
    for(const w of worldsConfig) membership[w.id]=(w.id===worldId?1:0);
    curPlayerCtx = { onTerrain:false, biomeId:null, worldId, worldMembership: membership };
    silenceSampleField();
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
    // What you HEARD is what you heard while listening — and the take, which is
    // silent, plays that back to you later with one voice added that was never
    // in your ears. So we write down the room while the monitor is open, which
    // is the LISTEN phase, not the roll.
    if(storyMode && REC.isListening()) PB.noteAudible(currentWorld(), idx, g);
    // Stereo pan from chunk's relative X position. PAN_R sets how tight
    // localization is — chunks beyond ±PAN_R cells are fully panned.
    const PAN_R=D(18);
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
  // A blocking scene (title, settings, bag, a dialogue) owns input: a key held
  // when it opened must not keep driving the player behind it. This is the guard
  // that keeps the title screen from walking you around the basement.
  if(scenes.blocksInput()) return;
  // You can always run. You simply cannot run and still have the take. The
  // earlier version locked movement outright, which reads as broken input.
  if(storyMode && REC.isRecording() && !REC.isStalled()) REC.spoilTake('you moved');
  const nowMs=performance.now();
  // Geometry blocks the step. In the conservatory this is a body test — a wall,
  // a lintel you would brain yourself on, a riser too tall to take — and it
  // reads from the same array the shader draws from.
  let planRedirect=null;
  if(RENDERER==='3d' && depth===0){
    if(usingPlan()){
      const move=FP.canStep(px, py, px+dx, py+dy, { keys: playerKeys });
      if(!move.ok){
        if(move.why==='locked') pushEvent('// locked. none of your keys.');
        else if(move.why==='closed') pushEvent('// closed. [E] open.');
        else if(move.why==='bricked') pushEvent('// bricked up. it was a door once.');
        return;
      }
      planRedirect=move.redirect||null;
      const tx=planRedirect?.x??px+dx,ty=planRedirect?.y??py+dy;
      if(!PROPS.propCanOccupy(tx,ty)) return;
    } else if(R3.r3dSolid(px+dx, py+dy)) return;
  }
  // Your feet are the loudest thing in this building. The noise is left at the
  // cell you are leaving: the presence hunts where you WERE.
  if(storyMode){
    const level=REC.emitStepNoise(px, py);
    RT.footstep(level);
    // Sound pins the building. Where you were loud, it stays honest.
    if(usingPlan()) MUT.markHeard(px, py, Math.min(1, level*3));
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
  const nx=planRedirect?.x??px+sx;
  const ny=planRedirect?.y??py+sy;
  if(nx===px&&ny===py) return;
  if(isOnboardingActive() && !canMoveInOnboarding(nx,ny,sx,sy)) return;
  beginRenderStep(nx,ny,nowMs);
  lastMoveAtMs=nowMs;
  px=nx; py=ny; stepCount++;
  if(storyMode&&usingPlan()){
    const closedDoors=FP.closePassedDoors(px,py);
    if(closedDoors.length){
      fireCue('door');
      REC.emitNoise(.13,px,py,'a door closed behind you',{
        kind:'door_close',sourceKind:'environment',sourceId:'passed-door',playerGenerated:false,
      });
      saveCommit({doors:FP.saveDoorState()});
      R3.r3dSetProps(worldRenderInstances(FP.logicalToPhysical(px,py).renderGroup));
    }
  }
  if(storyMode&&usingPlan())saveCommit({px,py,steps:stepCount,area:'conservatory'});
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
    outer: for(; r<D(6); r++){
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
function physicalPointFor(x,y){
  if(usingPlan()){
    const p=FP.logicalToPhysical(x,y);
    return{x:p.x,z:p.z};
  }
  return{x,z:y};
}
function renderedPlayerPoint(now=performance.now()){
  const base=physicalPointFor(px,py);
  if(!renderMove)return base;
  // Any position change that did not come through step() is a teleport, load,
  // wake-up, or floor repair. It must not inherit a stale walking segment.
  if(Math.hypot(base.x-renderMove.to.x,base.z-renderMove.to.z)>.001){renderMove=null;return base;}
  const t=Math.max(0,Math.min(1,(now-renderMove.startedAt)/renderMove.durationMs));
  const point={
    x:renderMove.from.x+(renderMove.to.x-renderMove.from.x)*t,
    z:renderMove.from.z+(renderMove.to.z-renderMove.from.z)*t,
  };
  if(t>=1)renderMove=null;
  return point;
}
function beginRenderStep(nx,ny,now){
  renderMove={
    from:renderedPlayerPoint(now),
    to:physicalPointFor(nx,ny),
    startedAt:now,
    durationMs:Math.max(16,currentMoveIntervalMs()),
  };
}
function armHeldMovement(now=performance.now()){
  const [dx,dy]=arrowDelta();
  nextMoveAtMs=(dx||dy) ? now+currentMoveIntervalMs() : 0;
}
function tickHeldMovement(now){
  if(paused||scenes.blocksInput()){nextMoveAtMs=0;return;}
  const [dx,dy]=arrowDelta();
  if(dx===0&&dy===0){nextMoveAtMs=0;return;}
  if(nextMoveAtMs<=0){armHeldMovement(now);return;}
  if(now<nextMoveAtMs)return;
  step(dx,dy);
  const interval=currentMoveIntervalMs();
  // Preserve the time cadence, but never burst several grid steps after a
  // dropped frame or a background-tab pause.
  nextMoveAtMs+=interval;
  if(nextMoveAtMs<now-interval)nextMoveAtMs=now+interval;
}

function setGameplayPaused(next, { announce=true }={}){
  next=!!next;
  if(paused===next) return;
  paused=next;
  keysDown.clear();
  nextMoveAtMs=0;
  if(paused){
    stopAllVoices(); stopWorldLayerVoice(); silenceAmbientDrone();
    setGainNode(dialogGain,0);setGainNode(sfxGain,0);setGainNode(sfxDirectGain,0);setGainNode(musicGain,0);
    if(announce) pushEvent('// paused.');
  }
  else {
    applyAudioSettings();
    startAmbientDroneAt(currentAmbientTarget());
    if(announce) pushEvent('// resumed.');
    updateAudio();
  }
}
function togglePause(){ setGameplayPaused(!paused); }

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
  revealAroundWithRadius(px, py, D(6));
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
  const el=document.getElementById('event');
  if(el) el.textContent=eventQueue[eventQueue.length-1]||'';
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

function nearestWildernessCell(startX, startY, maxR=D(28)){
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
  const presenceCell = (!introNow && storyMode && PRES.visibleFrom(px, py))
    ? {x:Math.round(PRES.presenceState().x), y:Math.round(PRES.presenceState().y)}
    : null;
  const hushBodyLookup = new Map();
  for(const bodyCell of [hushCell, presenceCell].filter(Boolean)){
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
        const flicker=Math.floor((nowMs/92) + bodyCell.x*0.43 + bodyCell.y*0.37 + mx*1.9 + my*1.3);
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
        const k=`${bodyCell.x+mx},${bodyCell.y+my}`;
        const prev=hushBodyLookup.get(k);
        if(!prev || w>=prev.w) hushBodyLookup.set(k, {cls, glyph, w});
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
      if(hushBodyLookup.size){
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
  if(!STATUS_EL) return;
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
  if(!CATALOG_EL) return;
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
  if(!CATALOG_EL||!CATALOG_TOGGLE_BTN) return;
  showCatalog=!showCatalog;
  CATALOG_TOGGLE_BTN.textContent = showCatalog ? '[C] CATALOG · ON' : '[C] CATALOG';
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
  if(CATALOG_EL){CATALOG_EL.textContent='';CATALOG_EL.style.display='none';}
  if(STATUS_EL) STATUS_EL.textContent='';
  const eventEl=document.getElementById('event');
  if(eventEl) eventEl.textContent='';
  if(SENSE_EL) SENSE_EL.innerHTML='';
  if(KEYMETER_EL){ KEYMETER_EL.innerHTML=''; KEYMETER_EL.style.display='none'; }
}

function tickProgressionNotices(){
  const notice=peekNotice();
  if(!notice || scenes.has(`achievement-notice:${notice.id}`)) return;
  const top=scenes.top();
  if(top?.blocksInput || top?.blocksWorld) return;
  const dialoguePending=!!top?.view?.()?.pending;
  const policy=noticePolicy({
    recording:REC.isRecording(),
    battle:!!activeBattleId,
    finale:finaleActive || !!pendingReturnReport(),
    dialoguePending,
    threat:PRES.isActive()?PRES.pressure(px,py):0,
    platformKind:currentPlatform().kind,
  });
  if(policy==='defer') return;
  if(policy==='pulse'){
    pushEvent('// archive updated.');
    consumeNotice(notice.id);
    return;
  }
  scenes.push(makeAchievementNoticeScene({notice}));
}

// ── Main loop ─────────────────────────────────────────────────────────────────
function loop(){
  try{
    tick++;
    const nowLoopMs=performance.now();
    const dt=Math.min(0.05, lastLoopMs ? (nowLoopMs-lastLoopMs)/1000 : 0.016);
    lastLoopMs=nowLoopMs;
    CONTROLLER.gamepadTick({
      menuContext: scenes.blocksInput(),
      onPress: controllerPress,
      onRelease: controllerRelease,
    });
    if(inRogue){
      // Keep keyboard focus on the play surface to avoid intermittent movement deadlocks.
      if((tick % 10)===0) ensureInteractionFocus();
      // One clock owns held movement. Browser key-repeat and independent
      // setTimeout polling used to race this frame loop and produce uneven
      // half-cell advances even while the camera itself was smoothly eased.
      tickHeldMovement(nowLoopMs);
      if(!scenes.blocksWorld()){
        maybeSpawnScheduledKey();
        updateHorrorTick();
        tickRecorder(dt);
        tickRoomMicAcoustics(dt);
        tickHushAudio(dt);
        tickPresence(dt);
        tickStabs(dt);
        tickPages();
        tickRadio(dt);
        tickFinale();
        tickLensOnset(dt);
        tickFear(dt);
        tickTorch(dt);
        tickLostItem();
        tickMutation(dt);
        maybeWakeLens();
      }
      // Playback runs through scenes and through the document reader: the tape
      // does not stop because you looked at a piece of paper. Neither does he
      // stop thinking, and neither does the radio stop talking.
      if(!paused){
        tickPlayback();
        // The cold open and the beats after the title own the voice themselves.
        if(storyMode && !scenes.has('cold-open') && !scenes.has('after-title')){
          SPEECH.updateSpeech(dt);
          TUT.tickTutorial(dt, tutorialCtx());
        }
      }
      if(RENDERER==='3d') render3d(); else renderMap();
      // Instrument readouts only exist in JUST SURF; in story mode they are
      // hidden by body.game, so don't pay to rebuild their DOM every frame.
      if(!storyMode && !sampleFieldSuppressed()){ renderCatalog(); renderStatus(); renderSense(); renderKeymeter(); }
      else if(sampleFieldSuppressed()) clearFieldReadouts();
      if(hush.active) once('hush-met', ()=>metaCommit({hushMet:true}));
    }
    else renderBoot();

    // Progress notices wait until dialogue, danger, recording, and finales have
    // cleared. They never interrupt the authoritative action that unlocked them.
    tickProgressionNotices();

    // Scenes draw over whatever the world drew, on their own glyph layer —
    // and during boot too, so the title screen exists before the field does.
    // Gameplay pause freezes movement, presence, recording, and world audio
    // above. Scene clocks are UI/authored presentation clocks: freezing them
    // traps blocking scenes such as the post-prologue title on screen forever
    // after a blur/settings pause.
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
let r3dCache={px:null,py:null,list:[],fogSize:-1,physicalGroup:'',physicalKey:''};
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
    r3dCache={px, py, list:list.slice(0,48), fogSize:r3dCache.fogSize,physicalGroup:r3dCache.physicalGroup,physicalKey:r3dCache.physicalKey};
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
let activeDifficulty=currentDifficulty();
let facilityMapSource=null;
let facilityMapCache={key:'',model:null};
const HUSH_MAP_TELEMETRY=createHushTelemetry({label:BUILDING_MAP.contact.label});

function applyCurrentRunDifficulty(){
  activeDifficulty=currentDifficulty();
  PRES.configurePresence(activeDifficulty.presence);
  REC.configureDifficulty({
    ...activeDifficulty.recording,
    torchDrainScale:activeDifficulty.torch.drainScale,
  });
  return activeDifficulty;
}

function applyLensPreset(name){
  const d=window.__diffusion;
  const P=window.__lensPresets;
  if(!d || !P || !P[name]) return;
  d.resetFeedback();
  d.tune(P[name]);
  const locked=!!P[name].prompt;
  // A preset that carries a prompt (booth, battle, rupture, hush) OWNS the
  // lens while it is up. Handing back means handing the zone its prompt again
  // — and updateZonePrompt only fires on a zone CHANGE, so without this the
  // booth's coffee cup and key hooks keep painting the loading dock forever.
  if(window.__lensPromptLocked && !locked) lastZoneKey='';
  window.__lensPromptLocked=locked;
}

// Which building is loaded. Content beats belong to the conservatory; the
// testbed is a geometry proof and must stay free of them.
let planName='';

const METAL_DOOR_WIDTH=1.2162;
function doorRenderInstances(group=null){
  if(!FP.isLoaded())return[];
  const out=[];
  for(const door of FP.doorState()){
    const center=FP.logicalToPhysical(door.cx,door.cy);
    if(group&&center.renderGroup!==group)continue;
    const width=Math.max(CELL,door.cells.length*CELL);
    const count=Math.max(1,Math.round(width/METAL_DOOR_WIDTH));
    const bay=width/count;
    for(let i=0;i<count;i++){
      const offset=(i-(count-1)/2)*bay;
      out.push({
        id:`door:${door.id}:${i}`,
        mesh:door.open?'metal_door_open':'metal_door_closed',
        x:center.x*CELL+(door.widthAxis==='x'?offset:0),
        y:center.y,
        z:center.z*CELL+(door.widthAxis==='y'?offset:0),
        yaw:door.widthAxis==='x'?0:Math.PI/2,
        scaleX:bay/METAL_DOOR_WIDTH,
        scaleY:1.25,
        zone:FP.zoneAt(Math.floor(door.cx),Math.floor(door.cy)),
        structural:true,
      });
    }
  }
  return out;
}

function worldRenderInstances(group=null){
  return[...PROPS.renderInstances({group}),...doorRenderInstances(group)];
}

async function loadBuilding(){
  // The real building. `?plan=testbed` still loads the geometry proof.
  const which=new URLSearchParams(location.search).get('plan') || 'conservatory';
  planName=which;
  try{
    const mod=await import(`./data/floorplan/${which}.js`);
    const data=mod[which] || mod.default;
    FP.compile(data.levels, {width:data.width, height:data.height, widenCorridors:data.widenCorridors,connectors:data.connectors||[]});
    facilityMapSource=null; facilityMapCache={key:'',model:null}; HUSH_MAP_TELEMETRY.reset();
    if(data.spawn) FP.setSpawn(data.spawn.x, data.spawn.y);
    // ?at= is a debug spawn and outranks the building's front door.
    const at=new URLSearchParams(location.search).get('at');
    if(data.spawn && !(at && /^-?\d+,-?\d+$/.test(at))){
      const saved=getSave(),sx=Number(saved.px),sy=Number(saved.py);
      const canRestore=Number(saved.steps)>0&&Number.isFinite(sx)&&Number.isFinite(sy)&&!FP.isSolid(sx,sy);
      const start=canRestore?{x:sx,y:sy}:FP.spawn();
      px=start.x;py=start.y;
    }
    for(const d of data.doors||[]) FP.setDoorKey(d.x,d.y,d.key,{open:d.open===true});
    FP.loadDoorState(getSave().doors);
    const p=FP.floorplan(),physicalPlan=FP.physicalRenderPlanFor(px,py);
    R3.r3dSetPlan(physicalPlan.rgba,physicalPlan.w,physicalPlan.h,physicalPlan.material);
    r3dCache.physicalGroup=physicalPlan.group;
    r3dCache.physicalKey=physicalPlan.key;
    MUT.mutateInit();
    // He left them where he turned around. Pages already read stay picked up
    // across a reload — the building may move, the paper does not come back.
    if(which==='conservatory'){
      PROPS.propsInit(FP);
      syncDroppedRadioProp();
      R3.r3dSetProps(worldRenderInstances(physicalPlan.group));
      const read=new Set(OBJ.objState().read);
      for(const pg of PAGES){
        const at=FP.toRuntimePoint(pg.at);
        if(read.has(pg.id) || FP.isSolid(at.x, at.y)) continue;
        OBJ.placePage(at.x, at.y, pg.room, pg.id);
      }
      syncVisiblePages();
      syncStoryObjectProps();
      R3.r3dSetProps(worldRenderInstances(physicalPlan.group));
    } else R3.r3dSetProps([]);
    revealAround(px,py);
    faceOpenDirection();
    if(KEY_DEBUG) pushEvent(`// ${which}: ${p.w}×${p.h} cells.`);
  }catch(err){
    console.error('floorplan failed to load', err);
  }
}

function enterStory(){
  storyMode=true;
  applyCurrentRunDifficulty();
  ensureCtx();
  if(actx && getSave().settings?.mic==='on') MIC.micInit(actx);
  setGameChrome(true);
  playerKeys.clear();playerKeys.add('master');
  if((getSave().items||[]).includes('chapel_key'))playerKeys.add('chapel');
  REC.loadRecState(getSave().rec);
  PRES.loadPresenceState(getSave().presence);
  OBJ.loadObjState(getSave().obj);
  STAB.loadStabState(getSave().stabs);
  RADIO.loadRadioState(getSave().radio);
  PROPS.loadPropState(getSave().props);
  ENCOUNTERS.loadEncounterState(getSave().encounters);
  loadThoughtState(getSave().thoughts);
  stepCount=Math.max(0,Number(getSave().steps)||0);
  himIdx = getSave().him || 0;
  if(inRogue && RENDERER==='3d') loadBuilding();
  initHushAudioRuntime();
  STAB.stabsInit({ onStab:playStab });
    DOC.documentInit({
      // Reading is not free. A sheet of paper turning is the quietest noise in
      // the game, and it is still a noise, and something is listening for it.
      turn:({ dir = 1 } = {})=>{
        ensureCtx();
        CUES.playPageTurn({ dir });
        if(storyMode) REC.emitNoise(0.06, px, py, 'a page turning',{
          kind:'page_turn',sourceKind:'equipment',sourceId:'document',playerGenerated:true,deliberate:true,
        });
      },
      close:()=>saveCommit({ obj:OBJ.saveObjState() }),
    });
  RADIO.radioInit({ squelch:onSquelch });
  SPEECH.speechInit({
    audio:()=>{ ensureCtx(); return actx ? { ctx:actx, destination:dialogGain || master || actx.destination } : null; },
    typing:STORY,
    cue:fireCue,
  });
  TUT.tutorialInit({ say:SPEECH.say,
    // Six seconds is a level check. The recorder is handed straight back.
    onLevelsGood:()=>setTimeout(()=>{ if(REC.isRecording()) stopTake(); }, 700) });
  PB.playbackInit({ chunkById:chunkAt, pickGuest,
    // It heard what he said in the dark, eleven seconds after the door went.
    // This is where it gives it back.
    onGuest:(room)=>{
      CR.fx.shake(0.35, 900);
      STAB.reportThreat();
      // LISTENING IS THE WOUND. Recording a room costs you nothing. Hearing it
      // back is what took the last man: four rooms, and then the chapel. The
      // count only ever goes up, and nobody is ever told it exists.
      const first=!flagTest(`listened.${room}`);
      if(first) flagApply([`listened.${room}`, `listened.count=${(Number(flagGet('listened.count'))||0)+1}`]);
      const n=Number(flagGet('listened.count'))||1;
      if(n>=5) flagApply(['listened.all']);
      SPEECH.say(LINES.guest);
      SPEECH.sayAll(guestLines(flagGet('confession.kind'), flagGet('confession.value'), n));
      saveCommit({ flags:getSave().flags });
    } });
  if(chunks.length) STAB.buildStabPool(chunks);
  const qp=new URLSearchParams(location.search);
  // ?flags=a,b=2 — force story state for testing
  const flagParam=qp.get('flags');
  if(flagParam) flagApply(flagParam.split(',').filter(Boolean));
  ensureCtx();
  if(inRogue&&RENDERER==='3d') ensureLensStarted(qp);
  // The cold open, then a man doing his setup in the dark. `?skiptut=1` for
  // anyone who has to walk this building forty times today.
  if(!flagTest('prologueDone') && !qp.has('skiptut')){
    const run=getSave().run;
    const condensedCheckIn=!!run?.replay?.isReplay && !!run?.replay?.condensedCheckIn;
    if(condensedCheckIn && !run.replay.condensedCheckInUsed){
      run.replay.condensedCheckInUsed=true;
      saveCommit({run});
    }
    scenes.push(makeColdOpenScene({
      beats: COLD_OPEN,
      opening: COLD_OPEN_DIALOGUE,
      startAt: condensedCheckIn ? 'replay-condensed' : 'start',
      audio: STORY,
      slate: 'W. ELLERY HOLDINGS · WORK ORDER 4417-C · ARCHIVAL CAPTURE',
      getAudio: ()=>({ ctx:actx, destination:dialogGain || master }),
      cue: fireCue,
      fx: CR.fx,
      replay: createReplayService('cold-open'),
      onChoice: applyStoryChoice,
      onDone: ()=>{
        flagApply(['prologueDone']);
        // The key turns · THE TITLE · the door shuts · the push bar is gone ·
        // he reaches for the torch. The song leaves during the title, so the
        // loudest thing that happens all night lands on an empty mix.
        scenes.push(makeWorldTitleScene({
          audio: STORY,
          onDone:()=>scenes.push(makeColdOpenScene({
            id: 'after-title',
            beats: AFTER_TITLE,
            ambient: false,
            lensPreset: 'calm',
            audio: STORY,
            getAudio: ()=>({ ctx:actx, destination:dialogGain || master }),
            cue: fireCue,
            fx: CR.fx,
            replay: createReplayService('after-title'),
            onDone:()=>postDoorThought(()=>TUT.startTutorial()),
          })),
        }));
      },
    }));
    silenceSampleField();
  } else {
    STORY.stopAll();
    TUT.skipTutorial();
    updateAudio();
  }
}

function fireCue(name){
  ensureCtx();
  switch(name){
    case 'freeze':
      // The moment it arrives. Spend the lens sample-and-hold: the frame stops
      // being a frame and starts being a held sample of the last true one.
      CR.fx.flash(120, 'rgba(6,6,8,0.85)'); CR.fx.shake(1.6, 700);
      applyLensPreset('rupture');
      break;
    case 'door':
      CUES.playCue(CUES.CUE.door, {gain:0.95});
      // The booth was the last lit room, and the rain was on the roof of it.
      // Neither follows him in.
      STORY.stopBoothTone({fade:0.35});
      break;
    case 'scream':
      // Not a jump scare. It arrives at the end of eight seconds of a man
      // working out what is on the other end, and he already knew.
      CUES.playCue(CUES.CUE.scream, {gain:0.95});
      // The speech band has no `fx`, and this line is heard there. Shake here.
      CR.fx.shake(2.6, 900);
      STAB.reportThreat();
      break;
    case 'squelch':
      // He shook it. The guard told him twice. The building is entitled to
      // know that he did it anyway.
      CUES.playCue(CUES.CUE.recorder, {gain:0.55, rate:0.4});
      if(storyMode){
        // The squelch STACKS on whatever noise is already in the air. Alone it
        // spoils the take; on top of a footstep you were already making, the two
        // together are loud enough to be caught.
        REC.addNoise(RADIO.RADIO.noiseLevel, px, py, 'the radio',{
          kind:'radio_squelch',sourceKind:'equipment',sourceId:'radio',playerGenerated:true,deliberate:true,
        });
        MUT.markHeard(px, py, 1);
        STAB.reportThreat();
        bumpFear(0.22, { stinger:0.5 });   // your own belt gave you away
      }
      break;
    case 'keyturn': CUES.playCue(CUES.CUE.keyturn, {gain:0.85}); STORY.stopRain({fade:1.4}); break;
    // The transport, running backwards. The bed underneath it is the same
    // machine, and it is still there when the rewind stops.
    case 'rewind':  CUES.playCue(CUES.CUE.rewind, {gain:0.80}); break;
    case 'bag':     CUES.playCue(CUES.CUE.bag, {gain:0.75}); break;
    case 'pens':    CUES.playCue(CUES.CUE.pens, {gain:0.62}); break;
    case 'signature': CUES.playCue(CUES.CUE.signature, {gain:0.70}); break;
    case 'slides':  CUES.playCue(CUES.CUE.slides, {gain:0.78}); break;
    case 'keys':    CUES.playCue(CUES.CUE.keys, {gain:0.70}); break;
    case 'kit':     CUES.playCue(CUES.CUE.kit, {gain:0.72}); break;
    default: break;
  }
}

function applyStoryChoice(choice){
  if(choice?.set || choice?.clear) flagApply(choice.set || [], choice.clear || []);
  const touched = [...(choice?.set || []), ...(choice?.clear || [])]
    .some((entry)=>String(entry).startsWith('confession.'));
  if(!touched) return;
  const kind=flagGet('confession.kind');
  const value=flagGet('confession.value');
  if(kind==='nothing' || (kind==='name' && value)){
    emitProgress(EVENT_TYPES.CONFESSION_COMMITTED, { kind, value:value || null }, 'main.applyStoryChoice');
  }
}

// ── thinking, over a corridor that has not stopped ──────────────────────────
// Every thought tree goes through here, so they all get the same voice, the
// same typewriter, the same clicks — and none of them stop the building.
function think(id, nodes, { startAt='start', onChoice, onDone, force=false }={}){
  if(!storyMode) return null;
  // Thought trees are conservatory content, and they block input while they are
  // open. `?nothink=1` is how a mechanism suite presses [r] without being asked
  // how it feels about the corridor.
  if(!force && (NO_THINK || planName!=='conservatory')) return null;
  if(!force && thoughtHad(id)) return null;
  markThought(id);
  ensureCtx();
  saveCommit({ thoughts:saveThoughtState() });
  return scenes.push(makeThoughtScene({
    id, nodes, startAt,
    audio: STORY,
    getAudio: ()=>({ ctx:actx, destination:dialogGain || master }),
    fx: CR.fx,
    cue: fireCue,
    replay: createReplayService(`thought:${id}`),
    onChoice: (c)=>{ applyStoryChoice(c); onChoice?.(c); },
    onDone,
  }));
}

// A repeatable dialog beat — not a once-in-a-run thought. The LISTEN before a
// take uses this: every take is guided by it. `?nothink=1` still bypasses.
function converse(id, nodes, { startAt='start', onChoice, onDone }={}){
  // No dialog here (a mechanism suite, or not story): the caller is left in
  // whatever state it set up, to be driven by the bare verbs. It does NOT
  // auto-advance, because the whole point of the two phases is that the second
  // one is a separate, deliberate press.
  if(!storyMode || NO_THINK) return null;
  ensureCtx();
  return scenes.push(makeThoughtScene({
    id, nodes, startAt,
    audio: STORY, getAudio: ()=>({ ctx:actx, destination:dialogGain || master }), fx: CR.fx, cue: fireCue,
    replay: createReplayService(`conversation:${id}`),
    scrim: 0.5,
    onChoice: (c)=>{ applyStoryChoice(c); onChoice?.(c); },
    onDone,
  }));
}

// The push bar is not where the push bar is. Which question he asks himself
// depends entirely on what he did at the booth.
function postDoorThought(onDone){
  const frame=prologueKnowledgeFrame() || 'self';
  think('post-door', POST_DOOR, {
    startAt: frame,
    onDone: ()=>{ saveCommit({ flags:getSave().flags }); onDone?.(); },
  });
}

function prologueKnowledgeFrame(){
  if(flagTest('prologue.knowledge.tape')) return 'tape';
  if(flagTest('prologue.knowledge.guard')) return 'guard';
  if(flagTest('prologue.knowledge.self')) return 'self';
  return null;
}

function framedLine(kind, fallback, ...args){
  const frame=prologueKnowledgeFrame();
  const line=frame ? PROLOGUE_THOUGHTS[frame]?.[kind] : null;
  const pick=line || fallback;
  return typeof pick === 'function' ? pick(...args) : pick;
}

// The first take in studio B3 is the one moment the game gets to say the rule
// out loud — do not move, do not touch the light — immediately before the
// player learns it the hard way. It intercepts [r] exactly once.
//
// Three things it must never intercept: a take already running, a non-B3
// tutorial room, and the testbed, whose studio also answers to `main_b3` and
// whose whole job is to let the mechanism suites press [r] and get a recorder.
function firstTakeIntercept(){
  if(!storyMode || REC.isMonitoring()) return false;
  if(planName!=='conservatory') return false;

  // The level check belongs to Studio B3. Elsewhere [r] is just the recorder.
  if(TUT.tutorialStep()==='level' && currentWorld()==='main_b3'){
    // The tutorial owns this specific check: the first press opens the tree,
    // and every retry after a spoil rolls straight, so the lesson can pass.
    if(!thoughtHad('level-check')) return !!think('level-check', LEVEL_CHECK, { onDone:()=>beginTakeNow() });
    beginTakeNow();
    return true;
  }
  if(TUT.tutorialActive()) return false;

  if(!usingPlan() || currentWorld()!=='main_b3' || REC.hasTake('main_b3')) return false;
  if(thoughtHad('first-take')) return false;
  // If the tree declined to open, [r] must still record. Never swallow a verb.
  return !!think('first-take', FIRST_TAKE, { onDone:()=>beginTakeNow() });
}

// [r]. It rolls the take if one is running (stop). Otherwise it begins the
// LISTEN — a short, guided dialog with the room up in the cans — which ends by
// rolling into a take. You can only record inside one of the five rooms, and
// only one you have not already done.
function recordAction(){
  if(REC.isRecording()){
    if(REC.isStalled()){ resumeInstrumentTake(); return; }
    stopTake(); return;
  }
  // It took the one thing the job is made of. Nothing happens until you find it.
  if(itemLost('recorder')){ SPEECH.say({ who:'you', text:'No recorder. There is no job until I have it back.' }); return; }
  // Already listening (the dialog closed, or there was no dialog): the second
  // press is the roll. If a LISTEN dialog is still up, its scene has the key.
  if(REC.isListening()){ if(!scenes.blocksInput()) roll(); return; }
  const room=recordableRoomAt(px,py);
  if(!room){ SPEECH.say(LINES.notARoom); return; }
  // The chapel is the fifth room, and it is not a take. It is locked until the
  // other four are on the card, and rolling it opens the confrontation.
  if(room==='lux_nova'){
    if(finaleActive) return;
    if(REC.recState().takes.length < 4){ SPEECH.say(LINES.chapelLocked); return; }
    beginConfrontation(); return;
  }
  if(REC.hasTake(room)){ SPEECH.say(LINES.already); return; }
  openListen(room);
}

function emitRecorderTransport(action='transport'){
  REC.emitNoise(.025,px,py,`recorder ${action}`,{
    spoils:false,
    kind:'recorder_transport',
    sourceKind:'equipment',
    sourceId:'recorder',
    playerGenerated:true,
    deliberate:true,
  });
}

// Headphones on. The monitor opens, the room comes up under the dialog, and the
// tape (for playback) starts collecting what you can hear. The dialog ends on
// "roll", and there is no other way out of it: setting a level commits you.
function openListen(room){
  if(!REC.startListening()) return;
  ensureCtx();
  PB.beginTake(room, {x:px, y:py});
  CUES.playCue(CUES.CUE.recorder, {gain:0.7, rate:1.02});
  emitRecorderTransport('monitor-on');
  updateAudio();                                 // the monitor opens: room in the cans
  committedListen=true;
  converse(`listen:${room}`, roomListen(room, roomLabel(room)), { onDone:()=>roll() });
}

// The first time — taught by the level check, and the first take in B3 — you
// are not allowed to just audition a room and walk off. Setting a level commits
// you to rolling. After that the game trusts you to listen and leave freely.
let committedListen=false;

// Leaving a room without rolling. You heard it; you decided not to keep it —
// unless the game has decided for you that this one you finish.
function cancelListen(){
  if(!REC.isListening()) return false;
  if(committedListen){ SPEECH.say(LINES.mustRoll); return true; }
  const room=currentWorld();
  REC.stopListening();
  PB.abortTake(room);
  CUES.playCue(CUES.CUE.recorder, {gain:0.5, rate:0.9});
  emitRecorderTransport('monitor-off');
  updateAudio();
  SPEECH.say(LINES.listenOff);
  return true;
}

// Roll. The room drops out of the cans, the hiss comes up, and now you must not
// move for forty-five seconds. This is the first thing that tells the building
// someone is in it.
function roll(){
  if(!REC.startRecording()) return;
  emitProgress(EVENT_TYPES.TAKE_STARTED, { roomId:currentWorld() }, 'main.roll');
  committedListen=false;
  screamedThisTake=false;
  takeOrigin={x:px,y:py};
  const takeSlot=REC.recState().takes.length+1;
  instrArmedThisTake=takeSlot===3 && PROPS.shouldArmHush({tutorial:TUT.tutorialActive()});
  saveCommit({props:PROPS.savePropState()});
  ensureCtx();
  // The recorder is not a metaphor. It opens the actual microphone, and from
  // here the real room you are sitting in can spoil the take. Fire-and-forget:
  // no permission, no mic, and the game is exactly as it was.
  if(!new URLSearchParams(location.search).has('nomic') && getSave().settings?.mic !== 'off') MIC.micInit(actx);
  // The transport is our sound, not the player's. Keep it on the output meter
  // while preventing acoustic speaker bleed from invalidating the new take.
  MIC.micIgnoreSpoilFor(1400);
  CUES.playCue(CUES.CUE.recorder, {gain:0.85});
  emitRecorderTransport('roll');
  updateAudio();                      // monitor closes: the room goes silent
  STORY.startTapeHiss({ gain: TAKE_HISS.min, fade: 1.2 });
  SPEECH.say(framedLine('recStart', LINES.recStart));
  if(!TUT.tutorialActive()) once('presence-arrives', ()=>{
    PRES.spawnBehind(px, py, -lastStepDx||0, -lastStepDy||1);
    emitProgress(EVENT_TYPES.HUSH_MET, {}, 'main.presenceArrives');
  });
}

// Stop the take: a clean minute, a spoiled one, or one you called off.
function stopTake(){
  if(!REC.isRecording()) return;
  const room=currentWorld();
  const r=REC.stopRecording();
  clearInstrument();
  instrArmedThisTake=false;
  CUES.playCue(CUES.CUE.recorder, {gain:0.7, rate:0.88});
  emitRecorderTransport('stop');
  STORY.stopTapeHiss({ fade: 0.6 });
  updateAudio();
  if(r.completed){
    emitProgress(EVENT_TYPES.TAKE_COMPLETED, { roomId:room, elapsed:r.elapsed }, 'main.stopTake');
    PB.sealTake(room);              // choose the guest once. a tape does not re-roll.
    SPEECH.say(framedLine('recDone', LINES.recDone));
    himBeat();                      // he held a clean minute here too, and then he did not
  } else {
    PB.abortTake(room);
    if(r.spoiled){
      emitProgress(EVENT_TYPES.TAKE_SPOILED, { roomId:room, reason:r.reason || 'noise' }, 'main.stopTake');
      SPEECH.say(LINES.recSpoiled(r.reason));
    } else {
      emitProgress(EVENT_TYPES.TAKE_ABORTED, { roomId:room }, 'main.stopTake');
      SPEECH.say(LINES.recAbort);
    }
  }
}

// The dock level check and the first take in B3 ARE the guided LISTEN — they
// narrate setting a level themselves and end on "roll" — so they hand straight
// into a take. The room came up in the cans while their dialog played (the
// monitor opened when the tree started); this just rolls it.
function beginTakeNow(){
  if(REC.isMonitoring()){ roll(); return; }
  const room=recordableRoomAt(px,py) || currentWorld();
  if(!REC.startListening()) return;
  PB.beginTake(room, {x:px, y:py});
  roll();
}


// Contact. No death: a spoiled take, a lasting injury, and a presence that
// knows you a little better than it did. The world is worse now, permanently.
// ── TAKEN ───────────────────────────────────────────────────────────────────
// It does not always hurt you. Half the time it TAKES you, and the taking is the
// one thing in this game you are not allowed to watch: a light too bright to be a
// light, in a colour that is nowhere in this building, and then nothing.
//
// You come to somewhere you did not walk to, with time gone out of the night and
// one of your things gone out of the bag. What it took decides the next hour: the
// recorder stops the job dead, the torch takes the light, the map takes the plan,
// and the radio takes nothing at all — which is somehow the worst of the four.
const LOSABLE=['recorder','torch','map','radio'];
let takenActive=false;
let lostItem=null, lostAt=null;
let takenRecoveryUntil=0;
const itemLost=(id)=> lostItem===id;

function makeTakenFlashScene(onBlack){
  let t=0,finished=false;
  return {
    id:'taken-flash',blocksInput:true,blocksWorld:true,lensPreset:'rupture',
    update(dt){
      t+=dt;
      if(t<1.75||finished)return;
      finished=true;scenes.pop();onBlack?.();
    },
    key(){return true;},
    render(){
      const {cols,rows}=uiSize();
      uiFill(0,0,cols,rows,'#000');
      if(t>=.18)return;
      // A single, unavoidable close contact. The field presence is deliberately
      // illegible at range; here its two highlights and split mouth consume the
      // camera for six frames before the signal collapses to black.
      uiDraw(({ctx,dpr})=>{
        const w=ctx.canvas.width,h=ctx.canvas.height,p=1-Math.min(1,t/.18);
        ctx.save();ctx.globalCompositeOperation='screen';
        ctx.fillStyle=`rgba(225,244,238,${.48+.48*p})`;
        ctx.shadowColor='rgba(210,255,244,.95)';ctx.shadowBlur=42*dpr;
        ctx.beginPath();ctx.ellipse(w*.5,h*.48,w*.24*(1+p*.18),h*.55,0,0,Math.PI*2);ctx.fill();
        ctx.globalCompositeOperation='source-over';ctx.shadowBlur=10*dpr;ctx.fillStyle='rgba(0,0,0,.98)';
        ctx.fillRect(w*.365,h*.31,w*.09,h*.075);ctx.fillRect(w*.545,h*.31,w*.09,h*.075);
        ctx.fillRect(w*.485,h*.44,w*.03,h*.44);
        for(let i=0;i<11;i++){
          const x=w*(.29+i*.042),j=((i*37)%9-4)*dpr;
          ctx.fillRect(x+j,h*.58,w*.012,h*(.22+(i%3)*.055));
        }
        ctx.restore();
      });
    },
  };
}

function beginTaken(){
  takenActive=true;
  if(REC.isRecording()) REC.spoilTake('it took you');
  REC.injure();
  fear=1; FEAR.setFear(1); FEAR.hushStinger(1);
  const hue=Math.floor(Math.random()*360);
  CR.fx.flash(110, `hsla(${hue},95%,74%,0.94)`);   // a colour that is not in the building
  CR.fx.shake(3.2, 700); CR.fx.glitch(1, 520);
  applyLensPreset('rupture');
  scenes.push(makeTakenFlashScene(wakeUp));
}

function wakeUp(){
  PRES.despawn();                                   // it is not standing over you. it has gone.
  // Never choose the room the player already occupies. The public-room rebuild
  // made B3 a valid destination as well as the most common test start; waking
  // on the same cell makes the taking read as a time skip instead of transport.
  const elsewhere=TARGETS.filter((r)=>{
    if(r==='lux_nova')return false;
    const at=FP.toRuntimePoint(ROOM_CELLS[r]);
    return Math.hypot(at.x-px,at.y-py)>4;
  });
  const room=pick(elsewhere.length?elsewhere:TARGETS.filter(r=>r!=='lux_nova'));
  const c=FP.toRuntimePoint(ROOM_CELLS[room]);
  px=c.x; py=c.y; trail=[]; revealAround(px,py); faceOpenDirection();
  const minutes=6+Math.floor(Math.random()*9);      // the night is shorter than it was
  saveCommit({ playSeconds:(getSave().playSeconds||0)+minutes*60 });
  takeAnItem();
  fear=0.55;
  scenes.push(makeColdOpenScene({
    id:'taken-dialogue',beats:takenLines(minutes,lostItem,roomLabel(room)),
    slate:'SIGNAL LOSS / RECOVERY',ambient:false,lensPreset:'hush',
    audio:STORY,getAudio:()=>actx?{ctx:actx,destination:dialogGain||master||actx.destination}:null,
    cue:fireCue,fx:CR.fx,
    onDone:()=>{
      takenActive=false;applyLensPreset('explore');
      saveCommit({flags:getSave().flags,rec:REC.saveRecState(),presence:PRES.savePresenceState()});
    },
  }));
}

// It puts your thing somewhere real. He then GUESSES where, like a professional,
// and he is usually wrong, because a man who has just been taken is not a reliable
// witness to where he has been. The waypoint is his guess, not the answer.
function takeAnItem(){
  lostItem=pick(LOSABLE.filter(id=> id!=='radio' || !RADIO.isDropped()));
  const where=pick(TARGETS.filter(r=>r!=='lux_nova'));
  const c=FP.toRuntimePoint(ROOM_CELLS[where]);
  lostAt={ x:c.x+(Math.random()<0.5?-2:2), y:c.y+(Math.random()<0.5?-2:2) };
  flagApply([`lost.${lostItem}`]);
  const guessRoom = Math.random()<0.25 ? where : pick(TARGETS.filter(r=>r!=='lux_nova' && r!==where));
  const g=FP.toRuntimePoint(ROOM_CELLS[guessRoom]);
  OBJ.setWaypoint(g.x, g.y, `your ${lostItem}?`);
}

// Walk over it and it is yours again. Nothing marks it. You simply find it.
function tickLostItem(){
  if(!lostItem || !lostAt || scenes.blocksWorld()) return;
  if(Math.hypot(px-lostAt.x, py-lostAt.y) > 2.0) return;
  const id=lostItem;
  lostItem=null; lostAt=null;
  takenRecoveryUntil=performance.now()+12000;
  flagApply([], [`lost.${id}`]);
  OBJ.clearWaypoint();
  fireCue('bag');
  SPEECH.say(foundLine(id));
  saveCommit({ flags:getSave().flags });
  emitProgress(EVENT_TYPES.EQUIPMENT_RECOVERED, { id }, 'main.tickLostItem');
}

function onPresenceCatch(count){
  STAB.reportThreat();
  bumpFear(0.55, { stinger:1 });
  // Half the time it hurts you. Half the time it TAKES you — and you do not get
  // to watch that happen. Never during the tutorial: nothing hunts a man who has
  // not started.
  if(!takenActive && !lostItem && performance.now()>=takenRecoveryUntil
     && !TUT.tutorialActive() && Math.random() < 0.5){ beginTaken(); return; }
  const injuries=REC.injure();
  emitProgress(EVENT_TYPES.PLAYER_INJURED, { count:injuries }, 'main.onPresenceCatch');
  if(REC.isRecording()) REC.spoilTake('it found you');
  CR.fx.flash(140, 'rgba(10,10,12,0.9)');
  CR.fx.shake(1.4, 420);
  SPEECH.say(LINES.caught(injuries));
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

  // While the tape rolls, nothing plays but the hiss. Stabs and phantoms belong
  // to walking the halls, not to a take: in a take there is only you, the thing
  // that makes noise, and the rising hiss. (This is a guard; tickStabs is also
  // gated off while recording, so a stab should not reach here mid-take.)
  if(REC.isRecording()) return;
  if(ev.kind==='true'){
    CR.fx.shake(0.5, 180);
    bumpFear(0.30, { stinger:0.9 });    // something really moved
  } else {
    CR.fx.glitch(0.4, 120);
    bumpFear(0.16, { stinger:0.45 });   // a thing you are not sure you heard
  }
  pushEvent(ev.kind==='true' ? '// something moved.' : '// ...did you hear that?');
}

function tickStabs(dt){
  if(!storyMode || !STAB.poolSize()) return;
  // Not while the tape rolls. A take is only hiss.
  if(REC.isRecording()) return;
  const pressure = PRES.isActive() ? PRES.pressure(px,py) : 0;
  STAB.updateStabs(dt, pressure);
}

// Pages: walk over one, read it, get a waypoint and a room to record.
// ── the previous recordist's log ────────────────────────────────────────────
// Walking over a page picks it up and hands you the sheet. It is the only
// reading in the game that happens standing in the dark with the light off,
// because the reader does not turn your light on for you.
const pageById=new Map(PAGES.map(p=>[p.id,p]));

// Walking over a dead man's paperwork does not put it in your bag. The tick only
// notices it is there; taking it is a thing you do with your hand, on purpose,
// with [e], and the HUD says so.
function tickPages(){
  if(!storyMode){ pageHere=null; return; }
  pageHere = OBJ.pageNear(px,py);
}
let pageHere=null;

// [e], standing on a sheet of paper.
function pickUpPage(){
  const found=OBJ.tryPickup(px,py);
  if(!found) return false;
  pageHere=null;
  PROPS.setLooseProp(`loose-page:${found.id}`,null);
  if(RENDERER==='3d'){
    const group=FP.logicalToPhysical(px,py).renderGroup;
    R3.r3dSetProps(worldRenderInstances(group));
  }
  const page=pageById.get(found.id);
  CUES.playCue(CUES.CUE.light, {gain:0.35, rate:1.4});
  STAB.reportRelief(0.3);    // finding something is a small exhale
  // A PAGE NEVER MOVES THE MARK. It files itself under the room it talks about
  // and it says which room that is; where you go next is a decision you make in
  // the bag, on purpose, with your own hands. Picking a sheet off the floor and
  // watching the minimap swing round to point at the swimming pool is a game
  // telling a man what he wants, and this game does not do that.
  const room=page?.room || found.roomId;
  if(room && !REC.hasTake(room)) SPEECH.say(framedLine('pageRoom', LINES.pageRoom, roomLabel(room)));
  else SPEECH.say(framedLine('pageAny', LINES.pageAny));
  saveCommit({ obj:OBJ.saveObjState() });
  if(page) readDocumentTracked(page);
  himBeat();     // you read his handwriting, and then you think about him
  return true;
}

// ── him ─────────────────────────────────────────────────────────────────────
// One rung of the ladder at a time, on the beats the player is already hitting:
// reading his logs, finishing a take he also finished, and being abandoned by
// the dark. Ten lines across a whole run, so he accumulates rather than lectures.
function himBeat(){
  if(!storyMode || planName!=='conservatory') return false;
  if(himIdx >= HIM_LINES.length) return false;
  const line=HIM_LINES[himIdx++];
  saveCommit({ him:himIdx });
  SPEECH.say(line);
  return true;
}

// ── interaction: [e] ────────────────────────────────────────────────────────
// One verb, and it reads whatever is at your feet. There is nothing else in
// this building to do with your hands.
function propLabel(prop){ return String(prop?.label || prop?.mesh || 'object').replaceAll('_',' ').toUpperCase(); }
function propChunk(ref){
  if(!ref)return null;
  const file=files.find((f)=>f.worldId===ref.worldId&&f.label===ref.fileLabel);
  return file ? chunkAt(file.idx) : null;
}
function playPropSample(prop,ref){
  ensureCtx();
  const chunk=propChunk(ref);if(!actx||!master||!chunk?.buffer)return false;
  const now=actx.currentTime,src=actx.createBufferSource(),gain=actx.createGain(),pan=actx.createStereoPanner();
  src.buffer=chunk.buffer;
  const mx=(px+.5)*CELL,mz=(py+.5)*CELL,dx=prop.x-mx,dz=prop.y-mz,d=Math.hypot(dx,dz);
  const right=[[1,0],[0,1],[-1,0],[0,-1]][((R3.r3dFacing()%4)+4)%4];
  pan.pan.setValueAtTime(Math.max(-1,Math.min(1,(dx*right[0]+dz*right[1])/4)),now);
  gain.gain.setValueAtTime(Math.max(.05,.28/(1+d*.18)),now);
  src.connect(gain);gain.connect(pan);pan.connect(master);src.start(now);
  return true;
}
function progressionDocumentId(doc){
  return String(doc?.id || doc?.title || 'document').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}
function readDocumentTracked(doc){
  if(!doc) return false;
  DOC.readDocument(doc);
  emitProgress(EVENT_TYPES.DOCUMENT_READ, { id:progressionDocumentId(doc) }, 'main.readDocumentTracked');
  return true;
}
function inspectPropTracked(id){
  const line=PROPS.inspectProp(id);
  emitProgress(EVENT_TYPES.PROP_INSPECTED, { id }, 'main.inspectPropTracked');
  return line;
}
function auditionPropTracked(id){
  const ref=PROPS.auditionProp(id);
  emitProgress(EVENT_TYPES.PROP_AUDITIONED, { id }, 'main.auditionPropTracked');
  return ref;
}

function makeObjectDetailScene({ id, title, source = 'OBJECT', body = '', onContinue } = {}) {
  let closed = false;
  const scene = {
    id: `object-detail:${id || source}`,
    blocksInput: true,
    blocksWorld: false,
    lensPreset: 'calm',
    key(e) {
      const k = String(e.key || '').toLowerCase();
      const code = e.code || '';
      if (e.key === 'Escape') {
        e.preventDefault?.();
        if (!closed) { closed = true; scenes.remove(scene); }
        return true;
      }
      if (e.key === 'Enter' || code === 'Enter' || e.key === ' ' || code === 'Space' || k === 'z' || code === 'KeyZ' || k === 'e' || code === 'KeyE') {
        e.preventDefault?.();
        if (!closed) {
          closed = true;
          scenes.remove(scene);
          onContinue?.();
        }
        return true;
      }
      return true;
    },
    render() {
      const { cols, rows } = uiSize();
      const text = String(body || '').trim();
      const w = Math.min(66, cols - 6);
      const lines = uiWrap(text, Math.max(12, w - 8));
      const h = Math.min(rows - 4, Math.max(14, 9 + lines.length));
      const x = Math.floor((cols - w) / 2);
      const y = Math.floor((rows - h) / 2);
      const panel = drawMachinePanel(x, y, w, h, {
        label: 'INSPECT',
        source,
        footer: '[ENTER] INSPECT · [ESC] CLOSE',
        meter: true,
      });
      drawVfdText(panel.x + 1, panel.y - 1, String(title || source).toUpperCase(), {
        scale: 0.82,
        alpha: 0.94,
      });
      lines.slice(0, Math.max(1, panel.h - 4)).forEach((line, i) => {
        uiText(panel.x + 1, panel.y + 3 + i, line, 'ui-primary');
      });
    },
  };
  return scene;
}

function openObjectDetail(opts) {
  scenes.push(makeObjectDetailScene(opts));
}

let workOrderRead=false;
function markWorkOrderRead(){
  once('work-order-read', ()=>{
    workOrderRead=true;
    // He gets back on the radio the moment he has read what he is here for.
    // He does NOT mark studio B3 for himself: the tutorial's `mark` step is the
    // one place the game teaches the only navigation verb it has, and doing it
    // for him would teach nothing and skip the step.
    setTimeout(()=>radioTransmit(0), 1400);
  });
}
function interact(){
  if(!storyMode) return;
  if(PB.isPlaying()){ PB.stopPlayback(); return; }
  // A sheet at your feet. Crouching for it is not free — a man bending down in a
  // coat is the second quietest noise in this game, and something is listening.
  if(pageHere){
    if(REC.isRecording() && !REC.isStalled()){
      SPEECH.say({who:'you',text:'Not mid-take. It has been on that floor for three weeks; it will keep.'});
      return;
    }
    REC.emitNoise(0.08, px, py, 'you crouched for a page',{
      kind:'handling_noise',sourceKind:'player',sourceId:'player',playerGenerated:true,deliberate:true,
    });
    if(pickUpPage()) return;
  }
  const doorHit=usingPlan()?FP.interactDoor(px,py,R3.r3dDelta(1),playerKeys):null;
  if(doorHit){
    if(!doorHit.ok){
      SPEECH.say({who:'you',text:doorHit.keyId==='chapel'?'Replacement core. Not on the standard ring.':'Locked. None of these.'});
      return;
    }
    if(doorHit.opened){
      fireCue(doorHit.keyId?'keyturn':'door');
      REC.emitNoise(doorHit.keyId?.length ? .20 : .13,px,py,'a door opened',{
        kind:'door_open',sourceKind:'environment',sourceId:doorHit.id||'door',playerGenerated:true,deliberate:true,
      });
      saveCommit({doors:FP.saveDoorState()});
      const p=FP.physicalRenderPlanFor(px,py);R3.r3dSetPlan(p.rgba,p.w,p.h,p.material);
      r3dCache.physicalGroup=p.group;r3dCache.physicalKey=p.key;r3dCache.fogSize=-1;
      R3.r3dSetProps(worldRenderInstances(p.group));
    }
    return;
  }
  const hit=usingPlan() ? PROPS.pickProp(px,py,R3.r3dFacing(),2) : null;
  if(hit){
    if(hit.id==='dropped-radio'){
      if(RADIO.pickUpRadio(px,py)){
        syncDroppedRadioProp();saveCommit({radio:RADIO.saveRadioState()});fireCue('bag');
        REC.emitNoise(.04,px,py,'radio recovered',{
          spoils:false,kind:'handling_noise',sourceKind:'equipment',sourceId:'radio',playerGenerated:true,deliberate:true,
        });
        emitProgress(EVENT_TYPES.EQUIPMENT_RECOVERED, { id:'radio' }, 'main.radioPickup');
        SPEECH.say({who:'you',text:'Back on the belt. Still dead.'});
      }
      return;
    }
    if(instr&&!instr.silenced&&hit.id===instr.propId){silenceInstrument(hit.id);return;}
    if(REC.isRecording()){
      SPEECH.say({who:'you',text:'Not while the take is held. Find the source.'});
      return;
    }
    if(hit.action==='story-bent-rig'){
      openObjectDetail({
        id:'bent-rig',
        title:'CIRCUIT-BENT RECORDER',
        source:'INTERFACE',
        body:'The case is open. The converter output is patched back into its own input, a feedback circuit built to make a machine stop singing.',
        onContinue:()=>interactRig(true),
      });
      return;
    }
    if(hit.action==='story-tuning-fork'){
      openObjectDetail({
        id:'tuning-fork',
        title:'TUNING FORK',
        source:'A=440',
        body:'A thin steel fork lies on the sill. The stamp is old. The hand-cut engraving below it reads: A=440. AND NOTHING ELSE.',
        onContinue:()=>interactTalisman(true),
      });
      return;
    }
    if(hit.action==='rekey-ledger'){
      const line=inspectPropTracked(hit.id);
      flagApply(['chapel.clue.ledger']);
      saveCommit({flags:getSave().flags,props:PROPS.savePropState()});
      if(line)SPEECH.say({who:'you',text:line});
      return;
    }
    if(hit.action==='chapel-key-cabinet'){
      if(playerKeys.has('chapel')){SPEECH.say({who:'you',text:'C-17. Already on the ring.'});return;}
      if(!flagTest('chapel.clue.log')||!flagTest('chapel.clue.ledger')){
        SPEECH.say({who:'you',text:'Three tags, two generations of lock. I need the rekey sheet and the office ledger before I guess.'});return;
      }
      converse('chapel-key-check',CHAPEL_KEY_CHECK,{
        onChoice:(choice)=>{
          if(choice?.keyTag==='C-17'){
            const items=new Set(getSave().items||[]);items.add('chapel_key');
            playerKeys.add('chapel');flagApply(['chapel.keyTaken']);
            saveCommit({items:[...items],flags:getSave().flags});fireCue('keys');
            emitProgress(EVENT_TYPES.ITEM_OBTAINED, { id:'chapel_key' }, 'main.chapelKey');
          }else if(choice?.keyTag){
            fireCue('keys');REC.emitNoise(.46,hit.rx,hit.ry,'keys struck the cabinet',{
              kind:'keys_impact',sourceKind:'equipment',sourceId:'key-cabinet',playerGenerated:true,deliberate:true,
            });STAB.reportThreat();
          }
        },
      });
      return;
    }
    const line=inspectPropTracked(hit.id);
    if(hit.sampleFamily?.length){
      const ref=auditionPropTracked(hit.id);
      playPropSample(hit,ref);
      REC.emitNoise(.16,hit.rx,hit.ry,`the ${propLabel(hit).toLowerCase()} sounded`,{
        kind:'instrument_note',sourceKind:'environment',sourceId:hit.id,playerGenerated:true,deliberate:true,
      });
    }
    saveCommit({props:PROPS.savePropState()});
    if(line)SPEECH.say({who:'you',text:line});
    return;
  }
  // Safety net for old saves/debug positions: the story objects are visible
  // props now, but proximity still opens them if a loose prop failed to load.
  if(interactRig()||interactTalisman())return;
  // The work order lives in your pocket for the whole night.
  readDocumentTracked(WORK_ORDER);
  markWorkOrderRead();
}

// The only navigation the game gives you: a room, not a route.
//
// Until studio B3 is in the bag, he will not write another room down. This is
// not a locked door — every door in this building is open and he can walk into
// any of them. It is a man who has read a work order and intends to do the
// hardest room while he is still fresh, and who says so when you try to make
// him do otherwise.
function markRoom(room){
  if(!room) return false;
  const cell=ROOM_CELLS[room];
  if(!cell) return false;

  // Marking is reversible. The bag calls the same authority for MARK and
  // CLEAR, so waypoint state and save commits cannot diverge from the world.
  if(OBJ.targetRoom()===room){
    OBJ.clearWaypoint();
    saveCommit({ obj:OBJ.saveObjState() });
    fireCue('bag');
    SPEECH.say({ who:'you', text:`${roomLabel(room)}. Clear.` });
    return true;
  }

  if(room!=='main_b3' && !REC.hasTake('main_b3')){
    SPEECH.say(LINES.basementFirst);
    return false;
  }

  const waypoint = FP.toRuntimePoint(cell);
  OBJ.setWaypoint(waypoint.x, waypoint.y, room);
  saveCommit({ obj:OBJ.saveObjState() });
  fireCue('bag');
  SPEECH.say({ who:'you', text:`${roomLabel(room)}. Marked.` });
  return true;
}

// The paper, as the bag sees it: everything he has actually picked up, plus the
// work order, which files under studio B3 because that is the room it tells him
// to do first.
function bagNotes(){
  const read=new Set(OBJ.objState().read);
  // Print does not rot. His hand does, and so does yours. Keep issue time as
  // metadata so the field-case renderer does not have to parse it from title.
  const notes=[{
    ...WORK_ORDER,
    title:WORK_ORDER.title,
    issued:WORK_ORDER_STAMP,
    type:'ARCHIVAL CAPTURE',
    preview:'Five room tones. Sixty seconds each. Unbroken.',
    read:workOrderRead,
    room:'main_b3',
  }];
  for(const pg of PAGES){
    if(read.has(pg.id)) notes.push(pg);
  }
  return notes;
}

function bagJob(){
  const takes=REC.recState().takes;
  return OBJ.objectives({
    rooms: TARGETS,
    notes: bagNotes(),
    hasTake: (r)=>REC.hasTake(r),
    label: roomLabel,
    // The recorder wrote a timestamp on every file and the recorder was right.
    // What rots is the reading of it. Nobody is ever told why. See game/clock.js.
    stamp: (r)=>takeStamp(takes.indexOf(r)),
  });
}


function bagEquipment(){
  const torchMissing=itemLost('torch');
  const recorderMissing=itemLost('recorder');
  const radioDropped=RADIO.isDropped();
  const radioMissing=itemLost('radio');

  return [
    {
      id:'light',label:'light',present:!torchMissing,
      value:torchMissing?'MISSING':'READY',
      statusTone:torchMissing?'danger':'active',
      location:torchMissing?'UNKNOWN':'CARRIED',
    },
    {
      id:'recorder',label:'recorder + headphones',present:!recorderMissing,
      value:recorderMissing?'MISSING':'READY',
      statusTone:recorderMissing?'danger':'active',
      location:recorderMissing?'UNKNOWN':'CARRIED',
    },
    {
      id:'map',label:'location indicator',present:!itemLost('map'),
      value:itemLost('map')?'MISSING':'LIVE',statusTone:itemLost('map')?'danger':'active',
      location:itemLost('map')?'UNKNOWN':'CARRIED',action:itemLost('map')?null:openMapFromBag,
      actionLabel:'OPEN',destructive:false,
    },
    {
      id:'radio',label:'radio',present:!radioDropped&&!radioMissing,
      value:radioDropped?'DROPPED':radioMissing?'MISSING':RADIO.isDead()?'DEAD / DECOY':'LIVE',
      statusTone:radioDropped||radioMissing?'danger':'active',
      location:radioDropped?'IN FIELD':radioMissing?'UNKNOWN':'CARRIED',
      action:(!radioDropped&&!radioMissing)?dropRadioFromBag:null,
      actionLabel:'SET DOWN',
      destructive:true,
      confirm:{title:'SET DOWN RADIO?',body:'THE RADIO WILL REMAIN IN THIS ROOM.'},
    },
    {
      id:'keyring',label:'standard keyring',value:'CARRIED',statusTone:'dim',
    },
    ...(playerKeys.has('chapel')?[{
      id:'chapel-key',label:'chapel key · C-17',value:'ADDED',statusTone:'complete',
    }]:[]),
    ...(flagTest('has.coffee') && !flagTest('drank.coffee')?[{
      id:'coffee',label:"the guard's coffee",value:'GET COLD',statusTone:'metadata',
      action:drinkCoffee,actionLabel:'DRINK',destructive:true,
      confirm:{title:'DRINK THE COFFEE?',body:'THIS CANNOT BE UNDONE.'},
    }]:[]),
  ];
}

function bagHint(){
  return TUT.tutorialStep()==='read'
    ? '[ENTER] READ THE WORK ORDER — FIND WHAT THEY WANT'
    : TUT.tutorialStep()==='mark'
      ? '[SPACE] MARK STUDIO B3 — SET THE WAYPOINT'
      : '';
}

function bagFocus(){
  if(TUT.tutorialStep()==='read') return {sectionId:'files',entryId:'file:work-order'};
  if(TUT.tutorialStep()==='mark') return {sectionId:'map',roomId:'main_b3',entryId:'room:main_b3',onceKey:'tutorial:mark-main-b3'};
  return null;
}

function openBag(){
  if(!storyMode) return;
  if(REC.isRecording()){ SPEECH.say({ who:'you', text:'Not while rolling.' }); return; }
  ensureCtx();
  CUES.playCue(CUES.CUE.bag, {gain:0.72});
  REC.emitNoise(0.05, px, py, 'bag rummage',{
    kind:'bag_rummage',sourceKind:'player',sourceId:'field-case',playerGenerated:true,deliberate:true,
  });
  scenes.push(makeBagScene({
    getEquipment:bagEquipment,
    getJob:bagJob,
    getMap:currentFacilityMapModel,
    getHint:bagHint,
    focus:bagFocus(),
    getFocus:bagFocus,
    memory:getSave().bagNav,
    onRemember:(bagNav)=>saveCommit({bagNav}),
    getMonitorSource:()=>MIC.micActive()?'ROOM MIC LIVE':'FIELD LIVE',
    readDocument:(doc)=>{
      readDocumentTracked(doc);
      if(doc?.id==='work-order') markWorkOrderRead();
      if(doc?.id==='page-6'){
        flagApply(['chapel.clue.log']);saveCommit({flags:getSave().flags});
      }
    },
    markRoom,
  }));
}

function openMapFromBag(){
  const bag=scenes.top();
  if(bag?.id==='bag'&&typeof bag.selectSection==='function'){
    bag.selectSection('map');
    return true;
  }
  return false;
}

function syncDroppedRadioProp(){
  if(!FP.isLoaded())return;
  const at=RADIO.radioLocation();
  PROPS.setLooseProp('dropped-radio',at?{
    mesh:'equipment_rack',rx:at.x,ry:at.y,scale:.22,yaw:0,
    inspect:{first:'The radio lies where you put it.',again:'Still there. Still listening.'},
  }:null);
  if(RENDERER==='3d'){
    const group=FP.logicalToPhysical(px,py).renderGroup;
    R3.r3dSetProps(worldRenderInstances(group));
  }
}

function refreshWorldProps(){
  if(RENDERER!=='3d' || !FP.isLoaded())return;
  const group=FP.logicalToPhysical(px,py).renderGroup;
  R3.r3dSetProps(worldRenderInstances(group));
}

function syncVisiblePages(){
  if(!FP.isLoaded())return;
  const live=new Set(OBJ.allPages().map((p)=>`loose-page:${p.id}`));
  for(const p of PROPS.allProps()){
    if(p.id.startsWith('loose-page:')&&!live.has(p.id))PROPS.setLooseProp(p.id,null);
  }
  OBJ.allPages().forEach((p,i)=>PROPS.setLooseProp(`loose-page:${p.id}`,{
    mesh:'loose_note',rx:p.x,ry:p.y,elevation:.025,scale:1,
    yaw:(i%5-2)*.17,interactive:false,
  }));
}

function syncStoryObjectProps(){
  if(!FP.isLoaded() || planName!=='conservatory')return;
  const rig=FP.toRuntimePoint(PLANT_RIG_CELL);
  const rigResolved=flagTest('has.interface') || flagTest('rig.gutted');
  PROPS.setLooseProp('story-bent-rig', rigResolved ? null : {
    mesh:'equipment_rack',
    label:'circuit-bent recorder',
    rx:rig.x,ry:rig.y,
    elevation:.02,
    scale:.24,
    yaw:Math.PI/2,
    blocks:false,
    action:'story-bent-rig',
    inspect:{
      first:'A portable recorder with its lid off. Wires loop from output back into input.',
      again:'The feedback loop waits for a hand.',
    },
  });
  const fork=FP.toRuntimePoint(TALISMAN_CELL);
  PROPS.setLooseProp('story-tuning-fork', flagTest('has.fork') ? null : {
    mesh:'loose_note',
    label:'tuning fork',
    rx:fork.x,ry:fork.y,
    elevation:.04,
    scale:.82,
    yaw:-0.24,
    blocks:false,
    action:'story-tuning-fork',
    inspect:{
      first:'A tuning fork on the sill. The steel catches the torch as a thin line.',
      again:'A=440. And nothing else.',
    },
  });
}

function dropRadioFromBag(){
  if(!RADIO.dropRadio(px,py))return;
  scenes.pop();
  syncDroppedRadioProp();
  saveCommit({radio:RADIO.saveRadioState()});
  fireCue('bag');REC.emitNoise(.08,px,py,'radio set on the floor',{
    kind:'radio_drop',sourceKind:'equipment',sourceId:'radio',playerGenerated:true,deliberate:true,
  });
  emitProgress(EVENT_TYPES.EQUIPMENT_DROPPED, { id:'radio' }, 'main.dropRadioFromBag');
  SPEECH.say({who:'you',text:RADIO.isDead()?'Leave it here. If it opens again, it opens here.':'Radio down. I can come back for it.'});
}

// ── the radio ───────────────────────────────────────────────────────────────
// It speaks through the same band the recordist thinks in, at radio pace. The
// player cannot hurry it, cannot answer it, and has to keep walking while it
// talks — which is the entire relationship.
function radioTransmit(i){
  const lines=TRANSMISSIONS[i];
  if(!lines || !RADIO.transmit(lines)) return;
  SPEECH.sayAll(lines);
  saveCommit({ radio:RADIO.saveRadioState() });
}

// A dead radio that makes noise is a hazard. On the belt it is local; on the
// floor it is a spatial source the presence hears without forging a hit on the
// recorder at the player's body.
function onSquelch(ev){
  if(!actx || !master) return;
  if(ev.dropped){
    const dx=(ev.x??px)-px,dy=(ev.y??py)-py,d=Math.hypot(dx,dy);
    const [fx,fy]=RENDERER==='3d'?R3.r3dDelta(1):[0,-1];
    const pan=d>.001?Math.max(-1,Math.min(1,(dx*(-fy)+dy*fx)/d)):0;
    // Still audible across a large wing, but plainly attached to the radio on
    // the floor rather than to the player's head or transcript.
    CUES.playCue(CUES.CUE.recorder,{gain:Math.max(.045,.46/(1+d*.035)),rate:.42,pan});
  }else{
    CUES.playCue(CUES.CUE.recorder, {gain:0.5, rate:0.42});
    CR.fx.shake(0.5, 160);
    SPEECH.say(SQUELCH_LINES[(ev.index-1) % SQUELCH_LINES.length]);
  }
  MUT.markHeard(ev.x??px, ev.y??py, 1);
  STAB.reportThreat();
}

function tickRadio(dt){
  if(!storyMode) return;
  // It has stopped being a radio. The moment the scream has finished and the
  // carrier line has been said, he is standing in a corridor holding a dead
  // object, and he gets to decide once whether to do the thing he was told
  // twice not to do. Waiting on the speech queue rather than on a stopwatch:
  // a timeout guessed wrong every time the player hurried a line.
  if(RADIO.isDead() && !thoughtHad('radio-dead') && !SPEECH.isSpeaking() && !scenes.blocksInput()){
    think('radio-dead', RADIO_DEAD);
    return;
  }
  RADIO.tickRadio(dt, { expectation: STAB.expectation(), px, py });
}

// ── playback ────────────────────────────────────────────────────────────────
// The guest: a voice from this room's own catalogue that the monitor never
// passed. Same material as the room, and plainly not of it.
function pickGuest(roomId, audibleIds){
  if(!chunks.length) return null;
  const heard=new Set(audibleIds);
  const pool=chunks.filter(c=>c && c.buffer && !heard.has(c.idx));
  if(!pool.length) return null;
  // Prefer something long and low: it has to rise for nine seconds without
  // ever becoming an event.
  const scored=pool.map(c=>({c, s:(c.analysis?.length||1) * (1/(0.2+(c.analysis?.zcr||0.3)))}))
    .sort((a,b)=>b.s-a.s).slice(0, 8);
  return scored[Math.floor(Math.random()*scored.length)]?.c || null;
}

let playbackRoom=null;
function playCurrentTake(){
  const room=currentWorld();
  if(!PB.hasTake(room)){ SPEECH.say(framedLine('playbackNone', LINES.playbackNone)); return; }
  if(PB.isPlaying()){ PB.stopPlayback(); return; }
  ensureCtx();
    PB.playbackInit({ ctx:actx, bus:sfxGain || master });
  PB.playTake(room, { character: roomToneCharacter(room) });
  playbackRoom=room;
  SPEECH.say(framedLine('playback', LINES.playback));
}

function tickPlayback(){
  if(!storyMode) return;
  if(PB.tickPlayback()==='ended'){
    SPEECH.say(LINES.playbackEnd);
    // Take 3 (the concert hall) and take 4 (the practice wing) turn playback
    // into a scene: the tape does not just contain a guest, it says the thing.
    maybePlaybackDialog(playbackRoom);
    playbackRoom=null;
  }
}

// The plant room has no objective, no take, and no reason to walk into it. The
// only way out that does not cost you everything is on the floor of it.
function interactRig(force=false){
  if(!storyMode || planName!=='conservatory') return false;
  if(thoughtHad('bent-rig') || (!force && scenes.blocksInput())) return false;
  const rig=FP.toRuntimePoint(PLANT_RIG_CELL);
  if(!force && Math.hypot(rig.x-px, rig.y-py) > D(1.6)) return false;
  think('bent-rig', BENT_RIG, { onDone:()=>{ reconcileRig(); } });
  return true;
}

// Gutting it buys light: two good cells the last man never got to use, and the
// circuit that would have let you out goes slack in the tray.
//
// The grant hangs off the FLAG, not off the callback of the one function that
// happens to open the tree. A consequence that only fires when it is asked
// politely is a consequence you will one day forget to ask for.
function reconcileRig(){
  if(flagTest('rig.gutted') && !flagTest('rig.cells')){
    flagApply(['rig.cells']);
    REC.addBattery(0.75);          // the only spare cells in the building
  }
  saveCommit({ flags:getSave().flags, rec:REC.saveRecState() });
  syncStoryObjectProps();
  refreshWorldProps();
}

// The tuning fork. The one object in the building that is only ever a sound —
// and the only place the thing in the walls is named out loud, by a man reading
// an engraving, which is the only kind of lore this game is willing to hand you.
function interactTalisman(force=false){
  if(!storyMode || planName!=='conservatory') return false;
  if(thoughtHad('talisman') || (!force && scenes.blocksInput())) return false;
  const t=FP.toRuntimePoint(TALISMAN_CELL);
  if(!force && Math.hypot(t.x-px, t.y-py) > D(1.6)) return false;
  think('talisman', TALISMAN, {
    onChoice:(c)=>{
      // It is struck once and it does not stop. The tone is real, it is A, and
      // it outlives the line that says a struck fork cannot.
      if(c?.goto==='strike') strikeFork();
      if(c?.goto==='damp' || c?.goto==='pocket' || c?.goto==='leave') dampFork();
    },
    onDone:()=>{ dampFork(); saveCommit({ flags:getSave().flags }); syncStoryObjectProps(); refreshWorldProps(); },
  });
  return true;
}

// A=440, held by the room rather than by the steel, which is why damping the
// steel does nothing and why the building has to decide to let it go.
let forkOsc=null, forkGain=null;
function strikeFork(){
  ensureCtx(); if(!actx || forkOsc) return;
  forkOsc=actx.createOscillator(); forkGain=actx.createGain();
  forkOsc.type='sine'; forkOsc.frequency.value=440;
  forkGain.gain.setValueAtTime(0.0001, actx.currentTime);
  forkGain.gain.exponentialRampToValueAtTime(0.09, actx.currentTime+0.01);
  forkOsc.connect(forkGain).connect(master);
  forkOsc.start();
  bumpFear(0.18);
}
function dampFork(){
  if(!forkOsc) return;
  const o=forkOsc, g=forkGain; forkOsc=null; forkGain=null;
  try{
    g.gain.setTargetAtTime(0.0001, actx.currentTime, 0.35);
    o.stop(actx.currentTime+2);
  }catch{ try{ o.stop(); }catch{} }
}

// The torch burns only while it is burning, and light is the one thing the dark
// is also asking for. When it dies, it dies mid-sentence.
function tickTorch(dt){
  if(!storyMode) return;
  if(flagTest('rig.gutted') && !flagTest('rig.cells')) reconcileRig();
  // It browns out before it dies. Two warnings, once each per run, so that a flat
  // torch is always something you watched happen and chose not to prevent.
  const bat=REC.batteryLevel();
  if(REC.lightOn() && bat<=0.22 && !flagTest('torch.low')){
    flagApply(['torch.low']);
    SPEECH.say({who:'you',text:'The beam has gone yellow. That is the cells going, and there are no more cells.'});
    saveCommit({flags:getSave().flags});
  }
  if(REC.lightOn() && bat<=0.07 && !flagTest('torch.dying')){
    flagApply(['torch.dying']);
    bumpFear(0.2);
    SPEECH.say({who:'you',text:'Minutes. I have got minutes of light left and I am going to want them later. Off it goes.'});
    saveCommit({flags:getSave().flags});
  }
  if(REC.drainLight(dt)){
    CUES.playCue(CUES.CUE.light, {gain:0.5, rate:0.72});
    bumpFear(0.35, { stinger:0.7 });
    SPEECH.say({ who:'you', text:'...no. No, no — come on. Come ON.' });
    SPEECH.say({ who:'direction', text:'The torch dies in your hand, and the room does not go dark so much as stop pretending it was ever anything else.' });
    himBeat();     // he worked in the dark too. that is the thought you did not want.
  }
  // If you stripped the rig for its cells, the light you bought with the good
  // ending abandons you at the door of the last room. It was always going to.
  if(flagTest('rig.gutted') && !flagTest('torch.betrayed')
     && REC.recState().takes.length >= 4 && recordableRoomAt(px,py)==='lux_nova'){
    flagApply(['torch.betrayed']);
    REC.killTorch();
    CR.fx.flash(90, 'rgba(0,0,0,0.9)'); bumpFear(0.5, { stinger:0.9 });
    SPEECH.sayAll([
      { who: 'direction', text: 'At the chapel door, with four rooms on the card and one to go, the torch goes out.' },
      { who: 'you', text: 'The cells. The good cells. Of course.' },
      { who: 'direction', text: 'You traded a way out for a few hours of light, and the light has just handed the hours back, at the door, in front of the thing you are about to meet.' },
    ]);
    saveCommit({ flags:getSave().flags, rec:REC.saveRecState() });
  }
}

// Past the inner door, the building starts dreaming. Authored `y > 15` is the
// same line the tutorial's `go` step draws, because it is the same threshold.
function maybeWakeLens(){
  if(!storyMode || planName!=='conservatory') return;
  const d=window.__diffusion;
  if(!d?.isBypassed?.()) return;
  if(py <= FP.toRuntimeCoord(15)) return;
  once('lens-wakes', ()=>{ d.setBypass(false); R3.r3dSetLocalDiffusionLevel(Math.max(0.16, 0.18 + (window.__lensOnset ?? LENS_FLOOR) * 0.46)); lastZoneKey=''; });
}

// ── the lens onset (scaffold) ────────────────────────────────────────────────
// The diffusion is not a switch. It comes on gradually and it never fully leaves
// — a dark-adapted eye makes its own snow (phosphenes, eigengrau). One 0..1 level
// holds it: a phosphene FLOOR at all times, a slow drift over the night, and a
// bloom to full once the guard's coffee is in you. Whether that cup was a drug
// or a stimulant is answered only by the ending, never by the mechanic.
//
// NOTE: the visual hookup here is deliberately thin. We are moving to bundled
// LOCAL diffusion; applyLensOnset() is the single seam that work plugs into. For
// now it rides the diffusion strength when a lens is present and publishes the
// level (window.__lensOnset) for the phosphene grain the local pass will own.
const LENS_FLOOR = 0.12;
let lensOnset = LENS_FLOOR;
let lensTarget = LENS_FLOOR;
let lensTau = 240;                       // seconds; the sober drift is slow
function lensDrink(){                     // the bloom begins the moment you swallow
  lensTarget = 1.0; lensTau = 90;        // ~a minute and a half to come up full
  applyLensPreset('hush');
}
function tickLensOnset(dt){
  if(!storyMode) return;
  // Sober, the building still works on you — slowly, and only a little.
  if(!flagTest('drank.coffee')) lensTarget = Math.min(0.34, LENS_FLOOR + (getSave().playSeconds||0)/1800*0.22);
  lensOnset += (lensTarget - lensOnset) * Math.min(1, dt / lensTau);
  applyLensOnset(lensOnset);
}
function applyLensOnset(v){
  window.__lensOnset = v;                                    // the phosphene grain reads this
  const d = window.__diffusion;
  if(d?.tune && !d.isBypassed?.()){
    const strength = Math.max(0.10, Math.min(0.45, 0.18 + v * 0.27));
    const local = Math.max(0.12, Math.min(0.72, 0.18 + v * 0.46));
    d.tune({ strength, mix: Math.max(0.62, Math.min(0.92, 0.72 + v * 0.18)) });
    R3.r3dSetLocalDiffusionLevel(local);
  } else {
    R3.r3dSetLocalDiffusionLevel(0);
  }
}

// The guard's coffee. Drinking it is the hinge of the whole ending, and it is
// offered like nothing at all. It starts the bloom; the ending decides what it was.
function drinkCoffee(){
  if(flagTest('drank.coffee')) return;
  flagApply(['drank.coffee']); saveCommit({ flags:getSave().flags });
  emitProgress(EVENT_TYPES.COFFEE_DRUNK, {}, 'main.drinkCoffee');
  if(scenes.top()?.id==='bag') scenes.pop();
  CUES.playCue(CUES.CUE.recorder, {gain:0.35, rate:0.6});
  SPEECH.say({ who:'you', text:'Cold, bitter, gone in three swallows. There. Whatever that was.' });
  lensDrink();
}

// ── fear ────────────────────────────────────────────────────────────────────
// You are frightened, and the game knows the number. It rises when you HEAR
// something — a stab, a squelch, the thing coming closer — and it falls slowly,
// because a body takes far longer to calm down than it takes to startle.
//
// It is not cosmetic. Past the top of the scale the recordist breathes audibly,
// and a breath is a noise in a room he is being paid to keep silent. Being
// frightened spoils takes. You cannot roll until you have got hold of yourself.
let fear=0;
let breathAcc=0;
let hushArtifactAcc=0;
// How far up the ladder of thinking about the dead man you have climbed.
let himIdx=0;
const FEAR_DECAY=0.085;                 // per second. slow.

function bumpFear(amount, { stinger=0 }={}){
  if(!storyMode) return;
  fear=Math.min(1, fear+amount);
  if(stinger>0) FEAR.hushStinger(Math.min(1, stinger*(0.5+fear*0.7)));
}

function tickFear(dt){
  if(!storyMode){ FEAR.setFear(0); R3.r3dSetFear(0); return; }
  FEAR.startHeartbeat();                // a heart does not need to be asked twice
  // Proximity is its own dread: the closer it is, the less the number falls.
  const near = PRES.isActive() ? PRES.pressure(px,py) : 0;
  fear = Math.max(0, Math.min(1, fear + near*0.22*dt - FEAR_DECAY*activeDifficulty.fear.fearDecayScale*dt));
  FEAR.setFear(fear);
  R3.r3dSetFear(fear);                  // vignette, grain, desaturation
  window.__fear = fear;

  // The HUSH acquires bandwidth as it approaches: sparse, low-passed fragments
  // at the edge of the map become frequent full-spectrum tears at contact.
  if(PRES.isActive()&&near>.04&&!hushAudioRuntime){
    hushArtifactAcc+=dt;
    const every=Math.max(.55,5.8-near*5.0);
    if(hushArtifactAcc>=every){
      hushArtifactAcc=0;FEAR.hushStinger(.08+near*.72);
      CR.fx.glitch(.08+near*.24,55+near*135);
    }
  }else hushArtifactAcc=0;

  // Breathing you cannot control. Past the threshold he is audible, and audible
  // is noise, and noise in a take is a dead take.
  const breath=activeDifficulty.fear;
  if(breath.enabled && fear > breath.threshold){
    breathAcc += dt;
    const every = 3.4 - fear*1.6;       // the worse it is, the harder he breathes
    if(breathAcc >= every){
      breathAcc = 0;
      const level=(0.10 + Math.max(0,fear-breath.threshold)*0.5)*breath.noiseScale;
      REC.emitNoise(level, px, py, 'you could not keep your breath quiet',{
        kind:'breath_fear',sourceKind:'player',sourceId:'player',playerGenerated:true,
      });
    }
  } else breathAcc = 0;
}

// What the tutorial is allowed to know: the state of a man and his kit.
function tutorialCtx(){
  const r=REC.recState();
  return { px, py, light:r.light, recording:REC.isRecording(), takeElapsed:r.takeElapsed,
           spoiled:r.spoiled, spoilReason:r.spoilReason, slow:r.slow, workOrderRead,
           marked: OBJ.targetRoom(), leftDock: py > FP.toRuntimeCoord(15) };
}

function tickMutation(dt){
  if(!usingPlan()) return;
  MUT.decayHeard(dt);
  const facing = RENDERER==='3d' ? R3.r3dDelta(1) : [0,-1];
  const anchors = [];
  const wp = OBJ.waypoint();
  if(wp) anchors.push({x:wp.x, y:wp.y});
  const home = FP.spawn();
  if(home) anchors.push({x:home.x, y:home.y});
  const change = MUT.tryMutate(performance.now(),
    { px, py, facing, light: REC.lightOn() }, anchors);
  if(change){
    // Patch only what moved. The building is silent when it does this — the
    // presence makes noise, the building does not. Keep them separate.
    const p=FP.physicalRenderPlanFor(px,py);R3.r3dSetPlan(p.rgba,p.w,p.h,p.material);r3dCache.physicalGroup=p.group;r3dCache.physicalKey=p.key;r3dCache.fogSize=-1;
  }
}

function tickPresence(dt){
  if(!storyMode || !PRES.isActive()) return;
  PRES.updatePresence(dt, px, py, onPresenceCatch);
  // Its nearness bleeds into the room tone: the floor thickens as it closes.
  const fieldAudio=hushAudioRuntime?.currentField?.()?.absorption?.audio||0;
  RT.setBed(ROOM_TONE.bedGain * (1 + PRES.pressure(px,py)*0.65) * (1-fieldAudio*.72), 0.4);

  // The first time it gets close, he has a think about it. The world does not
  // stop for that — it is still coming, and the three things he can tell
  // himself take exactly as long as it takes to arrive. But we will not open
  // the tree with it already on top of him: that is an ambush, not a thought.
  if(!thoughtHad('hush') && !scenes.blocksInput()
     && PRES.pressure(px,py) > 0.45
     && PRES.distanceTo(px,py) > PRES.PRESENCE.recoilCells){
    think('hush', HUSH);
  }
}

// A take of nothing that gets louder. The hiss rises with the seconds, because
// the longer you hold still in a dead room the more the room is all there is.
const TAKE_HISS = { min: 0.10, max: 0.60 };

function tickRecorder(dt){
  if(!storyMode) return;
  REC.decayNoise(dt);
  // The job has an authored encounter cadence. These are not random stabs and
  // they do not share the thought-once registry: only winning consumes one.
  maybeIndependentBattle();
  maybeBattle();
  tickInstrument();
  if(REC.isRecording()){
    const p=REC.takeProgress();
    STORY.setTapeHiss(TAKE_HISS.min + (TAKE_HISS.max-TAKE_HISS.min)*p, 0.3);
    tickMic();
  }
  const st=REC.tickRecording(dt);
  if(st==='complete'){
    const room=currentWorld();
    REC.addTake(room);
    if(!PRES.isActive()) once('presence-arrives',()=>{
      PRES.spawnBehind(px,py,-lastStepDx||0,-lastStepDy||1);
      emitProgress(EVENT_TYPES.HUSH_MET, {}, 'main.presenceArrives');
    });
    STAB.reportRelief(0.55);          // a clean take is the biggest exhale there is
    OBJ.clearWaypoint();
    saveCommit({ rec:REC.saveRecState() });
    stopTake();
    // The second transmission is bought with the first take, and it is the
    // last thing the radio ever does for you.
    once('radio-2', ()=>setTimeout(()=>radioTransmit(1), 2600));
  } else if(st==='spoiled'){
    if(!spoilPendingMs){ spoilPendingMs=performance.now()+900; onTakeBroken(REC.recState().spoilReason); }
    else if(performance.now()>spoilPendingMs){ spoilPendingMs=0; stopTake(); }
  }
}

// The real room, through the real mic. Above a threshold, your actual noise
// spoils the take the same as your character's knee would. Above a much higher
// one — a shout, a scream — the recordist screams too, because the game's room
// and the room you are sitting in have stopped being two rooms.
const MIC_LEVEL = { spoil: 0.06, scream: 0.26 };
let screamedThisTake=false;
let roomMicAcousticAt=0;
function tickRoomMicAcoustics(dt){
  if(!storyMode||REC.isRecording()||!MIC.micActive()||!MIC.micMaySpoil()) return;
  const level=MIC.micLevel();
  if(level<0.035) return;
  const now=performance.now();
  if(now-roomMicAcousticAt<520) return;
  roomMicAcousticAt=now;
  emitAcousticEvent({
    kind:'operator_voice_activity',
    source:{kind:'player',id:'room-mic'},
    spatial:acousticSpatialAt(px,py),
    acoustic:{levelDb:Math.max(-48,Math.min(-12,-46+level*105)),durationMs:420},
    semantics:{
      playerGenerated:true,deliberate:false,audibleToHush:true,
      audibleToMonitor:false,audibleInWorld:true,canBeMimicked:false,canSpoilTake:false,
      family:'voice',tags:['optional-mic','rms-only'],
    },
    provenance:{system:'room-mic',activityOnly:true},
  });
}
function tickMic(){
  if(!MIC.micActive()) return;
  const m=MIC.micLevel();
  if(!MIC.micMaySpoil()) return;
  if(m < MIC_LEVEL.spoil) return;
  if(m >= MIC_LEVEL.scream && !screamedThisTake){
    screamedThisTake=true;
    CR.fx.flash(120, 'rgba(120,0,0,0.4)'); CR.fx.shake(2.6, 500);
    SPEECH.say(LINES.scream);
  }
  // Your noise, in the game's room, scaled by how loud it actually was: a quiet
  // room-tone at the spoil threshold only loses the take, a shout at scream
  // level clears catchNoise and finds you. It spoils exactly like his body does.
  const t=(m - MIC_LEVEL.spoil)/(MIC_LEVEL.scream - MIC_LEVEL.spoil);
  const level=Math.max(0.20, Math.min(0.6, 0.20 + t*0.30));
  REC.emitNoise(level, px, py, 'you made a sound',{
    kind:'operator_voice_activity',sourceKind:'player',sourceId:'room-mic',playerGenerated:true,
  });
}

// ── HUSH instrument hunt ─────────────────────────────────────────────────────
// A take may wake one instrument the player has already auditioned. Its fixed
// sample family belongs to the prop, not the room. The take remains held until
// the physical source is silenced and the player returns to the recorder mark.
let takeOrigin=null;
let instr=null;                 // session-only active HUSH source
let instrArmedThisTake=false;

function startInstrumentSound(prop,ref){
  ensureCtx();
  const chunk=propChunk(ref);if(!actx||!master||!chunk?.buffer)return false;
  const now=actx.currentTime,src=actx.createBufferSource();src.buffer=chunk.buffer;src.loop=true;
  const lp=actx.createBiquadFilter();lp.type='lowpass';lp.frequency.setValueAtTime(900,now);
  const gain=actx.createGain();gain.gain.setValueAtTime(0,now);
  const pan=actx.createStereoPanner();pan.pan.setValueAtTime(0,now);
  src.connect(lp);lp.connect(gain);gain.connect(pan);pan.connect(master);src.start(now);
  instr.src=src;instr.nodes=[src,lp,gain,pan];instr.filter=lp;instr.gain=gain;instr.pan=pan;
  return true;
}
function stopInstrumentSound(fade=.35){
  if(!instr?.gain||!actx)return;
  const now=actx.currentTime,g=instr.gain.gain,nodes=instr.nodes;
  g.cancelScheduledValues(now);g.setValueAtTime(g.value,now);g.linearRampToValueAtTime(0,now+fade);
  setTimeout(()=>{for(const n of nodes||[]){try{n.stop?.();}catch(_){}try{n.disconnect();}catch(_){}}},fade*1000+80);
}
function updateInstrumentAcoustics(force=false){
  if(!instr||instr.silenced||!actx)return;
  const cellKey=`${Math.round(px)},${Math.round(py)}`;if(!force&&cellKey===instr.pathCell)return;
  instr.pathCell=cellKey;instr.path=PROPS.pathToProp(px,py,instr.propId,playerKeys);
  const now=actx.currentTime;
  if(!instr.path){
    instr.gain.gain.setTargetAtTime(.002,now,.12);instr.filter.frequency.setTargetAtTime(260,now,.18);return;
  }
  const bearing=PROPS.pathBearing(instr.path,R3.r3dFacing()),d=bearing.distance;
  instr.gain.gain.setTargetAtTime(Math.max(.018,.38/(1+d*.24)),now,.10);
  instr.filter.frequency.setTargetAtTime(Math.max(380,6200/(1+d*.20)),now,.16);
  instr.pan.pan.setTargetAtTime(bearing.pan*.82,now,.12);
}
function wakeInstrument(){
  if(instr||!REC.isRecording()||REC.isStalled())return false;
  const choice=PROPS.nextHushChoice(px,py,playerKeys);if(!choice)return false;
  const prop=choice.prop,ref=PROPS.hushSampleFor(prop.id);if(!propChunk(ref)?.buffer)return false;
  instr={propId:prop.id,prop,silenced:false,path:null,pathCell:'',lastNoiseAt:0};
  if(!startInstrumentSound(prop,ref)){instr=null;return false;}
  REC.stallTake();PROPS.markHushEvent();saveCommit({props:PROPS.savePropState()});
  R3.r3dSetHushProp(prop.id);updateInstrumentAcoustics(true);
  STAB.reportThreat();CR.fx.shake(.6,260);
  SPEECH.say({who:'you',text:`Somewhere in the building, a ${propLabel(prop).toLowerCase()} has started to play.`});
  return true;
}
function silenceInstrument(propId){
  if(!instr||instr.silenced||propId!==instr.propId)return false;
  instr.silenced=true;stopInstrumentSound(.4);R3.r3dSetHushProp(null);
  CUES.playCue(CUES.CUE.recorder,{gain:.5,rate:.7});
  SPEECH.say({who:'you',text:'Off. Back to the recorder. Same place, same take.'});
  return true;
}
function resumeInstrumentTake(){
  if(!instr||!REC.isStalled())return false;
  if(!instr.silenced){SPEECH.say({who:'you',text:'Not yet. I have to shut it off.'});return true;}
  if(!PROPS.atRecorder(takeOrigin,px,py)){
    SPEECH.say({who:'you',text:'The recorder is where I left it. I have to go back.'});return true;
  }
  instr=null;R3.r3dSetHushProp(null);REC.resumeTake();
  CUES.playCue(CUES.CUE.recorder,{gain:.6,rate:1});SPEECH.say(framedLine('recStart',LINES.recStart));
  return true;
}
function clearInstrument(){
  if(instr)stopInstrumentSound(.25);
  instr=null;takeOrigin=null;R3.r3dSetHushProp(null);
}
function tickInstrument(){
  if(!REC.isRecording()){if(instr)clearInstrument();return;}
  if(instr){
    if(instr.silenced)return;
    updateInstrumentAcoustics();
    if(performance.now()-instr.lastNoiseAt>2000){
      instr.lastNoiseAt=performance.now();
      REC.emitNoise(.34,instr.prop.rx,instr.prop.ry,`the ${propLabel(instr.prop).toLowerCase()} sounded`,{
        kind:'instrument_note',sourceKind:'hush',sourceId:instr.propId,playerGenerated:false,audibleToHush:false,
      });
    }
    return;
  }
  if(!instrArmedThisTake||scenes.blocksInput()||REC.takeProgress()<.32)return;
  if(wakeInstrument())instrArmedThisTake=false;
}

// A spoiled take breaks two ways, and the difference is one number: how loud the
// sound was. Any noise loses the minute. But a LOUD one — a shout, a fall, a
// squelch stacked on a step, anything past catchNoise — doesn't just lose it. It
// finds you: the presence turns, you take an injury, and once or twice a night
// the corner of your eye pays for it. A quiet slip is only a wasted take.
function onTakeBroken(reason){
  STAB.reportThreat();
  const caught = REC.currentNoise() >= ROOM_TONE.catchNoise;
  const byYou = reason==='you moved' || reason==='you reached for the light';
  SPEECH.say(pick(byYou ? LINES.flinch : LINES.whatWasThat));
  // The dock level check is a lesson, not a take: nothing hunts a man who has
  // not started, so spoiling it costs nothing but the take.
  if(TUT.tutorialActive()) return;
  // It heard where you are. It goes there: the presence hunts the cell the
  // last noise was made in, so make the last noise here.
  MUT.markHeard(px, py, 1);
  REC.emitNoise(0.6, px, py, reason,{audibleToHush:false});
  if(!PRES.isActive()) once('presence-arrives', ()=>PRES.spawnBehind(px, py, -lastStepDx||0, -lastStepDy||1));
  // A quiet spoil only turns the presence toward the sound. A loud one is a
  // catch: an injury, a flash and a shake, and — if it is already in the room —
  // a touch. The jumpscare budget spends itself here, and only here.
  if(!caught) return;
  CR.fx.flash(90, 'rgba(120,0,0,0.35)');
  CR.fx.shake(1.8, 360);
  if(PRES.isActive() && PRES.distanceTo(px,py) < PRES.PRESENCE.recoilCells*1.5){
    onPresenceCatch(REC.recState().injuries+1);
  } else {
    REC.injure();
    saveCommit({ rec:REC.saveRecState() });
  }
  maybeJumpscare();
}

const pick = (a)=> Array.isArray(a) ? a[Math.floor(Math.random()*a.length)] : a;

// A budget of two per run. Something at the edge of the frame, gone before you
// can look at it. Spends the lens if it is awake, and a flash and a shake if
// it is not.
function maybeJumpscare(){
  const seen=Number(flagGet('jumpscares'))||0;
  if(seen>=2) return;
  flagApply([`jumpscares=${seen+1}`]);
  CR.fx.flash(90, 'rgba(200,200,205,0.5)');
  CR.fx.shake(2.2, 260);
  CR.fx.glitch(1, 320);
  const d=window.__diffusion;
  if(d && !d.isBypassed?.()){
    applyLensPreset('rupture');
    setTimeout(()=>{ if(storyMode) applyLensPreset('explore'); }, 700);
  }
}
// ── the battles: what's happening to me ─────────────────────────────────────
// A sound from the composer's own catalogue, played FAR OFF — low, dark, and
// behind you, because there are no instruments in this building and there is
// nobody here to play them. The battle asks the only question this man has:
// is it in the room?
function playFarSound(round){
  const chunk=STAB.drawFromPool(20);
  if(!actx || !master || !chunk?.buffer) return;
  const now=actx.currentTime;
  const src=actx.createBufferSource();
  src.buffer=chunk.buffer;
  src.playbackRate.setValueAtTime(0.55 + Math.random()*0.2, now);   // slow, wrong
  const lp=actx.createBiquadFilter(); lp.type='lowpass';
  lp.frequency.setValueAtTime(700 + (round?.threat||0.3)*900, now);  // far things have no top
  const g=actx.createGain();
  const peak=0.05 + (round?.threat||0.3)*0.10;                       // quiet. always quiet.
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(peak, now+0.4);
  g.gain.exponentialRampToValueAtTime(0.0004, now+2.4);
  const pan=actx.createStereoPanner();
  pan.pan.setValueAtTime((Math.random()*2-1)*0.9, now);              // never in front
  src.connect(lp); lp.connect(g); g.connect(pan); pan.connect(master);
  src.start(now); src.stop(now+2.6);
  STORY.startTapeHiss({ gain: 0.20, fade: 0.6 });                    // is it a recording?
}

function openBattle(battle, { onWin, onLose, onAbort }={}){
  ensureCtx();
  return scenes.push(makeBattleScene({
    battle,
    difficulty: currentDifficulty().redaction,
    audio: STORY,
    getAudio: ()=>({ ctx:actx, destination:dialogGain || master }),
    fx: { cue:fireCue },
    playSound: playFarSound,
    onWin: (metrics)=>{ STORY.stopTapeHiss({fade:0.8}); onWin?.(metrics); },
    onLose:(metrics)=>{ STORY.stopTapeHiss({fade:0.8}); onLose?.(metrics); },
    onAbort:()=>{ STORY.stopTapeHiss({fade:0.3}); onAbort?.(); },
  }));
}

let activeBattleId=null;
function openEncounterBattle(id,battle,{onWin,onLose}={}){
  if(activeBattleId||ENCOUNTERS.encounterCleared(id))return false;
  activeBattleId=id;
  emitProgress(EVENT_TYPES.BATTLE_STARTED, { id }, 'main.openEncounterBattle');
  openBattle(battle,{
    onWin:(metrics={})=>{
      emitProgress(EVENT_TYPES.BATTLE_FINISHED, {
        id, result:'win', attempts:Math.max(1,Number(metrics.attempts)||1), firstPass:Number(metrics.failedSubmissions||0)===0,
      }, 'main.openEncounterBattle');
      ENCOUNTERS.clearEncounter(id);
      saveCommit({encounters:ENCOUNTERS.saveEncounterState()});
      activeBattleId=null;
      onWin?.(metrics);
    },
    onLose:(metrics={})=>{
      emitProgress(EVENT_TYPES.BATTLE_FINISHED, {
        id, result:'lose', attempts:Math.max(1,Number(metrics.attempts)||1), firstPass:false,
      }, 'main.openEncounterBattle');
      activeBattleId=null;
      onLose?.(metrics);
    },
    onAbort:()=>{
      emitProgress(EVENT_TYPES.BATTLE_FINISHED, { id, result:'abort', attempts:1, firstPass:false }, 'main.openEncounterBattle');
      activeBattleId=null;
    },
  });
  return true;
}

// ── M5: the confrontation and the two endings ───────────────────────────────
let finaleActive=false;
let escape=null;   // the playable escape state: { stage, doorCell, rescueCell, deadlineMs }
const isNamed=()=> flagGet('confession.kind')==='name' && flagGet('confession.value')==='Sarah';

// Put a finale beat sequence (array) or node tree (object) on the cold-open
// surface — the same presenter the guard and the tape use.
function presentFinale(content, { slate='', replayId='finale', onDone=()=>{}, onChoice }={}){
  ensureCtx();
  const nodes = content && !Array.isArray(content);
  scenes.push(makeColdOpenScene({
    id:'finale',
    ...(nodes ? { opening: content } : { beats: content }),
    ambient:false, lensPreset:'battle', slate,
    audio: STORY, getAudio: ()=>({ ctx:actx, destination:dialogGain || master }),
    cue: fireCue, fx: CR.fx,
    replay: createReplayService(`finale:${replayId}`),
    onChoice: (choice)=>{ applyStoryChoice(choice); onChoice?.(choice); }, onDone,
  }));
}

// The fifth room. It wears whatever you confessed; it plays turn-based; and on
// the far side of survival it hands to the ending choice.
function beginConfrontation(){
  finaleActive=true;
  if(ENCOUNTERS.encounterCleared('chapel')){openEndingChoice();return;}
  const kind=flagGet('confession.kind')||'nothing';
  const value=flagGet('confession.value')||null;
  const listened=Number(flagGet('listened.count'))||5;
  REC.addTake('lux_nova'); saveCommit({ rec:REC.saveRecState() });   // the chapel is done, however it ends
  openEncounterBattle('chapel',chapelBoss({ kind, value, listened }), {
    onWin: openEndingChoice,
    onLose: ()=> endSacrifice(),    // taken → you stay, which is the sacrifice
  });
}

function openEndingChoice(){
  presentFinale(endingChoice(flagTest('has.interface')), {
    slate:'THE CHAPEL',
    onDone:()=>{ if(flagGet('ending.choice')==='inversion') beginInversion(); else endSacrifice(); },
  });
}

// Ending A — you stay. If you never drank, the seal (the demolition) closes and
// it was all real. If you drank, it was a real guard who tried to help and could
// not: the same staying, reframed by a paper cup.
function endSacrifice(){
  escape=null; OBJ.clearWaypoint();
  const drank=flagTest('drank.coffee');
  const beats = drank ? helpedEnding({ named:isNamed() })
                      : sacrificeEnding({ injuries:REC.recState().injuries, named:isNamed() });
  presentFinale(beats, { slate:'THE CHAPEL', onDone:()=> finishEnding(drank?'helped':'sacrifice') });
}

// Ending B — the inversion. The invert, then the playable run for a door that
// will not be where the door is, then a way out you did not open.
function beginInversion(){
  presentFinale(INVERT_START, { slate:'THE PLANT ROOM · REVERSED', onDone: startEscape });
}
function startEscape(){
  const door=FP.spawn();                                   // the grey door you came in through
  const resc=FP.toRuntimePoint(MAIN_EXIT_CELL);            // the public door the guard named
  const seconds=currentDifficulty().escape.seconds;
  escape={ stage:'door', doorCell:door, rescueCell:resc,
    deadlineMs:seconds==null?null:performance.now()+seconds*1000 };
  OBJ.setWaypoint(door.x, door.y, 'grey door');
  applyLensPreset('rupture');
  SPEECH.say({ who:'direction', text:'The floor is going. Get to the door you came in through.' });
}
// Called each frame from the world tick. Advances the escape as you reach each
// waypoint; running out of time takes Ending A by default.
function tickFinale(){
  if(!escape || scenes.blocksWorld()) return;
  if(escape.deadlineMs!=null && performance.now() > escape.deadlineMs){ escape=null; OBJ.clearWaypoint(); endSacrifice(); return; }
  const wp = escape.stage==='door' ? escape.doorCell : escape.rescueCell;
  if(Math.hypot(px-wp.x, py-wp.y) > 2.4) return;
  if(escape.stage==='door'){
    escape.stage='at-door';
    presentFinale(FALSE_DOOR, { slate:'THE GREY DOOR', onDone:()=>{
      escape.stage='rescue';
      OBJ.setWaypoint(escape.rescueCell.x, escape.rescueCell.y, 'main entrance');
    }});
  } else if(escape.stage==='rescue'){
    escape=null; OBJ.clearWaypoint();
    // You got out. Sober, the yard is not there and the clock restarts. Drunk,
    // the yard is exactly there, the building stands, and the takes are ruined.
    const drank=flagTest('drank.coffee');
    const beats = drank ? druggedReveal({ takes:REC.recState().takes.length })
                        : [ ...rescueEnding(isNamed()), ...INVERSION_FINAL ];
    presentFinale(beats, { onDone:()=> finishEnding(drank?'drugged':'inversion') });
  }
}

// Commit the return before the epilogue so a crash cannot erase it, but defer
// all report/achievement presentation until the guard has finished writing.
function finishEnding(id){
  finaleActive=false;
  const missingEquipment=LOSABLE.filter((item)=>itemLost(item));
  if(RADIO.isDropped() && !missingEquipment.includes('radio')) missingEquipment.push('radio');
  const summary=commitReturn(id, {
    rec:REC.saveRecState(),
    presence:PRES.savePresenceState(),
    encounters:ENCOUNTERS.saveEncounterState(),
    missingEquipment,
  });
  const variant =
    id==='drugged' ? 'drugged' :
    id==='helped' ? 'helped' :
    id==='inversion' ? 'out' :
    (flagGet('confession.kind')==='nothing' ? 'nobody' : 'client');
  presentFinale(guardEpilogue(variant), {
    slate:'W. ELLERY HOLDINGS · GATE',
    replayId:`guard-epilogue:${id}`,
    onDone:()=>showReturnReport(summary),
  });
}

const RECORDING_BATTLES={the_tub:natatoriumBattle,amplifications:hallBattle,soundnoisemusic:practiceBattle};
function battleForRoom(room,named){return RECORDING_BATTLES[room]?.(named)||null;}

// Take two is a redaction sheet in whichever public room the player chose. It
// is keyed to recording ordinal, not room or thought history.
function maybeBattle(){
  if(planName!=='conservatory') return;
  if(!REC.isRecording() || scenes.blocksInput()) return;
  const room=recordableRoomAt(px,py),factory=RECORDING_BATTLES[room];
  if(!factory||REC.recState().takes.length!==1)return;
  if(ENCOUNTERS.encounterCleared('recording-2'))return;
  if(REC.takeProgress() < 0.18) return;
  const named = flagGet('confession.kind')==='name' && flagGet('confession.value')==='Sarah';
  openEncounterBattle('recording-2',factory(named), {
    onWin: ()=>{ REC.recState().takeElapsed = ROOM_TONE.takeSeconds; },  // you held it
    onLose:()=>{ REC.spoilTake('you moved'); },
  });
}

// A second fight waits between takes three and four, in whichever unfinished
// room the player approaches. Losing requires leaving that room before retry.
let routeBattleRetryRoom=null;
function maybeIndependentBattle(){
  if(planName!=='conservatory'||REC.isMonitoring()||scenes.blocksInput())return;
  const room=recordableRoomAt(px,py),factory=RECORDING_BATTLES[room];
  if(routeBattleRetryRoom&&room!==routeBattleRetryRoom)routeBattleRetryRoom=null;
  if(!factory||routeBattleRetryRoom===room||REC.recState().takes.length!==3||REC.hasTake(room))return;
  if(ENCOUNTERS.encounterCleared('pre-recording-4'))return;
  const named=flagGet('confession.kind')==='name'&&flagGet('confession.value')==='Sarah';
  openEncounterBattle('pre-recording-4',battleForRoom(room,named),{
    onLose:()=>{
      routeBattleRetryRoom=room;
      REC.injure();
      saveCommit({rec:REC.saveRecState()});
    },
  });
}

// The playback dialogs: the concert hall (take 3) and the practice wing (take
// 4) each get a scene when you play them back — the "contains what you did not
// hear" beat, extended. Fires once per room.
const PLAYBACK_DIALOGS={ the_tub:natatoriumPlayback, amplifications:hallPlayback, soundnoisemusic:practicePlayback };
function maybePlaybackDialog(room){
  const factory=PLAYBACK_DIALOGS[room];
  if(!factory || thoughtHad(`playback-${room}`)) return;
  const named = flagGet('confession.kind')==='name' && flagGet('confession.value')==='Sarah';
  emitProgress(EVENT_TYPES.PLAYBACK_DISCOVERED, { id:room }, 'main.maybePlaybackDialog');
  think(`playback-${room}`, factory(named));
}

let spoilPendingMs=0;
let movingTimer=null;
const playerKeys=new Set(['master']);   // the standard set. it does not open everything.
let bootTextCache='';
function clearFieldReadouts(){
  if(CATALOG_EL){CATALOG_EL.textContent='';CATALOG_EL.style.display='none';}
  if(STATUS_EL) STATUS_EL.textContent='';
  if(SENSE_EL) SENSE_EL.innerHTML='';
  if(KEYMETER_EL){ KEYMETER_EL.innerHTML=''; KEYMETER_EL.style.display='none'; }
}
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
  saveCommit({ px, py, steps:stepCount, area:storyMode?'conservatory':getSave().area, playSeconds:(getSave().playSeconds||0)+4, hushAudio:hushAudioRuntime?.save?.()||getSave().hushAudio||null });
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

// Which of the five rooms on the work order am I standing IN — the actual room
// zone, not the audio-world map. `worldAt` folds every corridor, the dock, the
// plant room and the stairs onto main_b3, which is right for sound and wrong
// for "can I record here": once B3 was done, standing in any corridor read as
// "already did that one". You can only roll a take inside one of the five, and
// only the room you are actually in.
const ZONE_ROOM={ [ZONE.studio]:'main_b3', [ZONE.natatorium]:'the_tub', [ZONE.hall]:'amplifications',
                  [ZONE.practice]:'soundnoisemusic', [ZONE.chapel]:'lux_nova' };
const ZONE_AREA={ [ZONE.dock]:'loading dock', [ZONE.foyer]:'front atrium', [ZONE.studio]:'studio B3',
  [ZONE.natatorium]:'the natatorium', [ZONE.hall]:'the concert hall', [ZONE.practice]:'the practice wing',
  [ZONE.chapel]:'the chapel', [ZONE.plant]:'plant room', [ZONE.stair]:'building stair' };
function recordableRoomAt(x,y){ return usingPlan() ? (ZONE_ROOM[FP.zoneAt(x,y)] || null) : currentWorld(); }
function currentAreaLabel(){return usingPlan()?(ZONE_AREA[FP.zoneAt(px,py)]||FP.logicalToPhysical(px,py).spaceId||'circulation'):roomLabel(currentWorld());}


function acousticFloorIdAt(x,y){
  if(!usingPlan()) return null;
  const physical=FP.logicalToPhysical(x,y);
  return BUILDING_MAP.floors.find((floor)=>physical.y>=floor.minHeight&&physical.y<floor.maxHeight)?.id||null;
}

function acousticSpatialAt(x=px,y=py){
  return {
    areaId:storyMode?'conservatory':currentWorld(),
    roomId:usingPlan()?(ZONE_ROOM[FP.zoneAt(x,y)]||null):currentWorld(),
    floorId:acousticFloorIdAt(x,y),
    position:{x,y},
  };
}

function acousticOcclusionDb(source,listener){
  if(!usingPlan()||!source?.position||!listener?.position) return 0;
  if(source.floorId&&listener.floorId&&source.floorId!==listener.floorId) return 15;
  const a=source.position,b=listener.position;
  const distance=Math.hypot(b.x-a.x,b.y-a.y);
  const steps=Math.max(2,Math.min(40,Math.ceil(distance/1.5)));
  let blocked=0;
  for(let i=1;i<steps;i++){
    const t=i/steps;
    const x=Math.round(a.x+(b.x-a.x)*t),y=Math.round(a.y+(b.y-a.y)*t);
    if(FP.isSolid(x,y)) blocked++;
  }
  const roomPenalty=source.roomId&&listener.roomId&&source.roomId!==listener.roomId?4:0;
  return Math.min(24,roomPenalty+blocked*2.8);
}

function emitRecordistAcoustic(raw={}){
  const spatial=acousticSpatialAt(raw.x??px,raw.y??py);
  return emitAcousticEvent({
    kind:raw.kind,
    level:raw.level,
    source:raw.source||{kind:'player',id:'player'},
    spatial,
    semantics:{
      playerGenerated:raw.playerGenerated ?? (raw.source?.kind||'player')==='player',
      deliberate:!!raw.deliberate,
      audibleToHush:raw.audibleToHush!==false,
      audibleToMonitor:true,
      audibleInWorld:true,
      canSpoilTake:!!raw.spoils,
    },
    provenance:{system:'recordist',reason:raw.reason||'',sampleId:raw.sampleId||null},
  });
}

function hushPresenceSnapshot(){
  const base=PRES.publicSnapshot();
  const room=usingPlan()?(ZONE_ROOM[FP.zoneAt(base.x,base.y)]||null):currentWorld();
  return {...base,roomId:room,floorId:acousticFloorIdAt(base.x,base.y)};
}

let lastHushFieldStage='none';
function initHushAudioRuntime(){
  hushAudioRuntime?.destroy?.();
  REC.setAcousticEmitter(emitRecordistAcoustic);
  roomMicAcousticAt=0;
  hushLightScale=1;
  lastHushFieldStage='none';
  hushAudioRuntime=createHushAudioRuntime({
    presence:{
      publicSnapshot:hushPresenceSnapshot,
      offerSoundTarget:(offer)=>PRES.offerSoundTarget(offer),
    },
    playerSpatial:()=>({...acousticSpatialAt(px,py)}),
    occlusionDb:acousticOcclusionDb,
    difficulty:()=>activeDifficulty,
    settings:()=>getSave().settings||{},
    context:()=>({
      allowMischief:storyMode&&!scenes.blocksInput()&&!REC.isRecording()&&!finaleActive&&!activeBattleId,
      recording:REC.isRecording(),
      blocked:scenes.blocksInput(),
      finale:finaleActive,
      battle:!!activeBattleId,
      // The field case monitor is continuously live unless the recorder itself
      // has been lost. LISTEN raises the program feed, not the HUSH's hearing.
      monitorOpen:!itemLost('recorder'),
    }),
    effects:hushAudioMix,
    onField:({field,torchScale})=>{
      hushLightScale=REC.lightOn()?torchScale:0;
      const stage=field.stage||'none';
      if(stage!==lastHushFieldStage){
        const captions=!!getSave().settings?.hushCueCaptions;
        if(captions&&['near','engulf','contact'].includes(stage)){
          pushEvent(stage==='contact'?'// [monitor signal collapses]':'// [monitor bandwidth narrows]');
        }
        lastHushFieldStage=stage;
      }
    },
    onMischief:({cue,pan})=>{
      if(!getSave().settings?.hushCueCaptions||!cue?.caption?.text)return;
      const direction=!cue.caption.spatial?'':pan<-.28?' · LEFT':pan>.28?' · RIGHT':' · NEAR';
      pushEvent(`// [${cue.caption.text}${direction}]`);
    },
  });
  hushAudioRuntime.load(getSave().hushAudio);
  return hushAudioRuntime;
}

function stopHushAudioRuntime(){
  hushAudioRuntime?.destroy?.();
  hushAudioRuntime=null;
  REC.setAcousticEmitter(null);
  hushLightScale=1;
  lastHushFieldStage='none';
  hushAudioMix?.reset?.();
}

function tickHushAudio(dt){
  if(!storyMode||!hushAudioRuntime){hushLightScale=REC.lightOn()?1:0;return;}
  hushAudioRuntime.tick(dt);
}

function mapProjectLogical(point,{authored=true}={}){
  const q=authored?FP.toRuntimePoint(point):point;
  const p=FP.logicalToPhysical(q.x,q.y);
  return{x:p.x,z:p.z,height:p.y,layer:p.layer,roomId:ZONE_ROOM[FP.zoneAt(q.x,q.y)]||null};
}

function currentFacilityMapSource(){
  if(!usingPlan()||planName!=='conservatory')return null;
  if(facilityMapSource)return facilityMapSource;
  try{
    facilityMapSource=captureFloorplanMapSource({
      definition:BUILDING_MAP,
      physical:FP.physicalSpanData(),
      stairPortals:FP.floorplan().stairPortals||[],
      projectLogical:mapProjectLogical,
      labelForRoom:roomLabel,
    });
  }catch(error){
    console.error('[map] source capture failed',error);
    facilityMapSource=null;
  }
  return facilityMapSource;
}

function currentMapContact(source){
  if(!source||!PRES.isActive()){
    return HUSH_MAP_TELEMETRY.sample({story:{contactDisplayEnabled:false},policy:activeDifficulty.navigation});
  }
  const playerPhysical=FP.logicalToPhysical(px,py);
  const pst=PRES.presenceState();
  const hushPhysical=FP.logicalToPhysical(pst.x,pst.y);
  const floor=BUILDING_MAP.floors.find((candidate)=>hushPhysical.y>=candidate.minHeight&&hushPhysical.y<candidate.maxHeight);
  const pressure=PRES.pressure(px,py);
  const sensoryField=hushAudioRuntime?.currentField?.();
  const sensoryAudition=hushAudioRuntime?.currentAudition?.();
  return HUSH_MAP_TELEMETRY.sample({
    hush:{
      active:true,
      position:{x:hushPhysical.x,y:hushPhysical.z},
      floorId:floor?.id||null,
      roomId:ZONE_ROOM[FP.zoneAt(pst.x,pst.y)]||null,
      emittedEnergy:Math.min(1,.44+pressure*.34+(pst.hasTarget ? .08 : 0)+(sensoryAudition?.interest||0)*.18),
      detectionRadius:92,
      forceLock:pressure>.74&&(REC.isListening()||(sensoryField?.absorption?.monitor||0)>.72),
    },
    player:{position:{x:playerPhysical.x,y:playerPhysical.z}},
    recorder:{monitorOpen:!itemLost('recorder'),available:!itemLost('recorder')},
    story:{contactDisplayEnabled:true},
    policy:activeDifficulty.navigation,
  });
}

function currentFacilityMapModel(){
  const source=currentFacilityMapSource();
  if(!source)return buildMapModel({source:null,job:bagJob(),navigation:activeDifficulty.navigation});
  const physical=FP.logicalToPhysical(px,py);
  const contact=currentMapContact(source);
  const doors=captureDoorMapState({
    doors:FP.doorState(),source,projectLogical:mapProjectLogical,
    hasKey:(keyId)=>playerKeys.has(keyId),
  });
  const job=bagJob();
  const objective=OBJ.objState();
  const doorKey=doors.map((door)=>`${door.id}:${door.state}`).join('|');
  const contactKey=`${contact.state}:${contact.observation?.observedAt||0}:${contact.observation?.floorId||''}`;
  const key=[Math.round(physical.x/2),Math.round(physical.z/2),Math.round(physical.y*4),recordableRoomAt(px,py)||'',objective.target||'',job.rooms.map((room)=>room.recorded?'1':'0').join(''),doorKey,activeDifficulty.navigation.id||'',contactKey].join('~');
  if(facilityMapCache.key===key&&facilityMapCache.model)return facilityMapCache.model;
  const model=buildMapModel({
    source,job,objectiveState:objective,doors,contacts:[contact],navigation:activeDifficulty.navigation,
    player:{x:physical.x,y:physical.z,height:physical.y,roomId:recordableRoomAt(px,py),heading:RENDERER==='3d'?R3.r3dFacing()*Math.PI/2:0},
  });
  facilityMapCache={key,model};
  return model;
}


function faceOpenDirection(){
  if(RENDERER!=='3d') return;
  const dirs=[[0,-1],[1,0],[0,1],[-1,0]];
  for(let f=0; f<4; f++){
    const [dx,dy]=dirs[f];
    if(!solidAt(px+dx, py+dy)){ R3.r3dSetFacing(f); return; }
  }
}

// The service menu, opened over whatever called it. main.js owns it because it
// is the only place with the audio bus and the mic; the scene reads and writes
// save.settings itself. `inGame` adds RETURN TO TITLE / RESUME.
function exportProgressionProfile(){
  const build=new URLSearchParams(location.search).get('build') || 'LOCAL';
  const profile=exportProfile(getMeta(), getSave().settings, {build});
  const ok=downloadJsonFile(profile, `chunk-surfer-profile-${new Date().toISOString().slice(0,10)}.json`);
  pushEvent(ok ? '// profile exported.' : '// profile export unavailable.');
  return ok;
}

async function importProgressionProfile(){
  const picked=await chooseJsonFile();
  if(!picked.ok){
    if(picked.error!=='CANCELLED') pushEvent(`// profile import failed: ${picked.error.toLowerCase().replaceAll('_',' ')}.`);
    return false;
  }
  const merged=mergeImportedProfile(getMeta(), getSave().settings, picked.value);
  if(!merged.ok){
    pushEvent(`// profile import rejected: ${merged.error.toLowerCase().replaceAll('_',' ')}.`);
    return false;
  }
  metaCommit(merged.meta);
  saveCommit({settings:merged.settings});
  BINDINGS.setControllerBindings(getSave().settings?.controllerBindings);
  pushEvent('// profile imported. current run unchanged.');
  syncPlatform().catch(()=>{});
  return true;
}

function openSettings({ inGame=false }={}){
  ensureCtx();
  scenes.push(makeSettingsScene({
    inGame,
    initialTab: null,
    hooks: {
      setGlobalVolume,
      setDialogVolume,
      setSfxVolume,
      setMusicVolume,
      setMonitorVolume,
      micStatus: ()=>MIC.micState(),
      enableMic: ()=>{ ensureCtx(); if(actx) MIC.micInit(actx); },
      onQuitToTitle: returnToTitle,
      requestFullscreen: requestFullscreenSafe,
      focusPanel: ensureInteractionFocus,
      pauseGame: ()=>setGameplayPaused(true, {announce:false}),
      resumeGame: ()=>setGameplayPaused(false, {announce:false}),
      challengeRules: ()=>getSave().run?.rules || null,
      challengeIntegrity: ()=>getSave().run?.integrity?.deadAir || null,
      previewChallengeChange: (key,nextValue)=>previewCurrentRuleChange(key,nextValue),
      applyChallengeChange: (change)=>{
        applyCurrentRuleChange(change);
        applyCurrentRunDifficulty();
      },
      replayUnlocks: ()=>deriveUnlocks(getMeta()),
      setReplaySetting: (key,value)=>{
        const run=getSave().run;
        if(!run) return;
        if(key==='seenTextMode') run.replay.seenTextMode=value;
        else if(key==='archiveSignals') run.replay.archiveSignals=value!=='off';
        else if(key==='condensedCheckIn') run.replay.condensedCheckIn=!!value;
        saveCommit({run});
      },
      controllerName: CONTROLLER.controllerName,
      controllerRemapAction: CONTROLLER.controllerRemapAction,
      beginControllerRemap: (action)=>CONTROLLER.beginControllerRemap(action, (token)=>{
        if(!BINDINGS.setControllerBinding(action, token)) return;
        const st=getSave().settings||{};
        saveCommit({settings:{...st,controllerBindings:BINDINGS.controllerBindings()}});
      }),
      cancelControllerRemap: CONTROLLER.cancelControllerRemap,
      resetControllerBindings: ()=>{
        const controllerBindings=BINDINGS.resetControllerBindings();
        const st=getSave().settings||{};
        saveCommit({settings:{...st,controllerBindings}});
      },
      exportProfile: exportProgressionProfile,
      importProfile: importProgressionProfile,
      currentArea: () => storyMode && inRogue ? roomLabel(currentWorld()) : (getSave().area || 'prologue'),
      version: () => '0.1.0',
      build: () => new URLSearchParams(location.search).get('build') || 'LOCAL',
    },
  }));
}

function openArchive(){
  scenes.push(makeArchiveScene({ meta:getMeta() }));
}

function openReturnIndex(){
  scenes.push(makeReturnIndexScene({ meta:getMeta() }));
}

function makeTitle({wantFullscreen=false}={}){
  return makeTitleScene({
    onAudioGate:ensureCtx,
    onNewGame:()=>{ if(wantFullscreen) requestFullscreenSafe(); beginNewGameFlow(); },
    onContinue:()=>{ if(wantFullscreen) requestFullscreenSafe(); enterStory(); },
    onJustSurf:enterJustSurf,
    onSettings:()=>openSettings({inGame:false}),
    onArchive:openArchive,
    onReturnIndex:openReturnIndex,
  });
}

function returnToTitle(){
  stopHushAudioRuntime();
  storyMode=false;
  setGameChrome(false);
  stopAllVoices();
  scenes.replace(makeTitle());
}

function showReturnReport(summary){
  if(!summary){ returnToTitle(); return; }
  scenes.push(makeReturnReportScene({
    summary,
    onReopen:()=>{ returnToTitle(); beginNewGameFlow(); },
    onArchive:()=>{ returnToTitle(); openArchive(); },
    onTitle:returnToTitle,
  }));
}

function beginNewGameFlow(){
  const meta=getMeta();
  const initialPreset=getSave().settings?.lastDifficulty || 'contract';
  scenes.push(makeDifficultySelectScene({
    meta,
    initialPreset,
    initialCustomValues:getSave().settings?.customShiftRules,
    onCancel:()=>{},
    onConfirm:({preset,values})=>{
      // The title remains beneath the selector until authorization is complete.
      // Only now is the previous run replaced.
      if(scenes.top()?.id==='title') scenes.pop();
      newGame({preset,values});
      beginRunProgression();
      enterSelectedRun();
    },
  }));
}

function enterSelectedRun(){
  BINDINGS.setControllerBindings(getSave().settings?.controllerBindings);
  applyCurrentRunDifficulty();
  const qp=new URLSearchParams(location.search);
  if(qp.has('skipwarn')){ enterStory(); return; }
  scenes.push(makeWarningScene({
    onEnableMic:()=>{
      ensureCtx();
      const st=getSave().settings||{};
      saveCommit({settings:{...st,mic:'on'}});
      if(actx)MIC.micInit(actx);
    },
    onDisableMic:()=>{
      const st=getSave().settings||{};
      saveCommit({settings:{...st,mic:'off'}});
      MIC.micStop();
    },
    onDone:enterStory,
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
// and the facility navigator alongside.
function drawStoryHud(){
  if(!storyMode || scenes.blocksWorld()) return;
  const { cols, rows }=uiSize();

  // ROLLING. The take takes over the screen: the dark room you are locked in,
  // and one instruction. Nothing else, because there is nothing else you may
  // do. He still speaks — his own body on the tape, and the thing that isn't.
  if(REC.isRecording()){ drawTakeOverlay(cols, rows); SPEECH.drawSpeech(); return; }

  const rec=REC.recState();
  if(!rec.light && !REC.isListening()) uiText(2, 3, 'LIGHT  OFF', 'ui-secondary');
  // The battery only becomes a fact when it starts being a problem.
  {
    const b=REC.batteryLevel();
    if(b<=0) uiText(14, 3, 'CELL  FLAT', 'ui-danger');
    else if(b<0.35) uiText(14, 3, `CELL  ${Math.round(b*100)}%`, b<0.15?'ui-danger':'ui-amber');
  }

  // The field navigator projects the same facility model used by the bag MAP.
  // If the issued plan is lost, the building remains but its instrumented
  // representation does not.
  const wp=OBJ.waypoint();
  const nav=activeDifficulty.navigation;
  if(itemLost('map')){
    uiText(2, 5, 'PLAN  MISSING', 'ui-danger');
  } else if(nav.showMap){
    drawMinimap(currentFacilityMapModel(),{now:performance.now()});
  } else if(wp){
    uiText(2, 5, 'PLAN  SIGNAL MINIMAL', 'ui-secondary');
  }

  // The compass line exposes only the fields authorized by the current shift.
  const bear=OBJ.bearingTo(px,py);
  if(bear && nav.showBearing){
    const parts=['TARGET'];
    if(nav.showRoom) parts.push(roomLabel(OBJ.targetRoom()));
    parts.push(bear.bearing);
    if(nav.showDistance) parts.push(bear.far);
    const loc=parts.join(' / ').toUpperCase();
    uiText(2, 4, loc.slice(0, Math.max(12, cols-28)), 'ui-blue');
  }

  // Takes: the job, counted.
  const takes=rec.takes.length;
  uiText(2, 1, 'TAKES', 'ui-label');
  drawVfdCounter(9, 1, String(takes));
  uiText(11, 1, '/ 5', 'ui-blue');
  if(rec.injuries) uiText(16, 1, `HURT ×${rec.injuries}`, 'ui-danger');
  if(KEY_DEBUG){
    if(lastKeyDebug) uiText(2, 4, lastKeyDebug.slice(0,130), 't-key', 0.9);
    try{
      const w=window.__probe.why();
      uiText(2, 5, `delta=[${w.arrowDelta}] wallAhead=${w.wallAhead} onboard=${w.onboardingActive}`
        +` rec=${w.recording} interval=${Math.round(w.moveIntervalMs)}ms keys=${w.keysDown.join(',')||'-'}`, 't-key', 0.9);
    }catch(_){}
  }

  // LISTEN is a dialog beat now (openListen), and it draws itself. Nothing to
  // add here — the monitor is open under it and the room is in the cans.
  if(REC.isListening()) return;

  const doorHud=usingPlan()?FP.doorNear(px,py,R3.r3dDelta(1)):null;
  const propHit=usingPlan()?PROPS.pickProp(px,py,R3.r3dFacing(),2):null;

  // The verbs must be discoverable. A player should never have to guess that
  // the recorder exists in a game about recording.
  // While he is setting up, the corner shows only the one key the room is
  // asking for. Everything else is learned by having wanted it.
  const hintMode=objectiveHintsMode();
const teach=tutorialPromptsEnabled() ? TUT.tutorialPrompt() : null;
  // Paper at your feet outranks everything the corner has to say. It is the only
  // thing in the building anyone has left behind on purpose.
  if(pageHere && !REC.isRecording()){
    const prompt='[E] PICK UP THE SHEET';
    uiText(Math.max(2, Math.floor((cols-prompt.length)/2)), rows-2, prompt, 'ui-amber');
  } else if(doorHud){
    const hasKey=!doorHud.portal.keyId||playerKeys.has(doorHud.portal.keyId);
    const prompt=hasKey?'[E] OPEN DOOR':'[E] TRY LOCKED DOOR';
    uiText(Math.max(2,Math.floor((cols-prompt.length)/2)),rows-2,prompt,hasKey?'ui-amber':'ui-secondary');
  } else if(propHit){
    const verb=propHit.sampleFamily?.length?'PLAY':'INSPECT';
    const prompt=(`[E] ${verb} ${propLabel(propHit)}`).slice(0,Math.max(1,cols-4));
    uiText(Math.max(2,Math.floor((cols-prompt.length)/2)),rows-2,prompt,'ui-amber');
  } else if(teach){
    const prompt=teach.toUpperCase().slice(0,Math.max(1,cols-4));
    uiText(Math.max(2, Math.floor((cols-prompt.length)/2)), rows-2, prompt, 'ui-amber');
  } else if(hintMode !== 'off') {
    const done = REC.hasTake(currentWorld());
    const back = hintMode === 'full' && PB.hasTake(currentWorld()) ? ' · [P] PLAYBACK' : '';
    const rk = done ? '' : ' · [R] LISTEN';
    const pause = hintMode === 'full' ? ' · [ESC] PAUSE' : '';
    const hint = (rec.light ? '[F] LIGHT OFF' : '[F] LIGHT') + rk + ' · [B] BAG' + back + pause;

    if(cols<72){
      const first=((rec.light?'[F] LIGHT OFF':'[F] LIGHT')+rk).slice(0,cols-4);
      const second=('[B] BAG'+back+pause).slice(0,cols-4);
      uiText(2,rows-3,first,'ui-secondary');
      uiText(2,rows-2,second,'ui-secondary');
    } else {
      uiText(Math.max(2, cols - hint.length - 2), rows-2, hint, 'ui-secondary');
    }
  }

  // Playback has its own meter, and it is deliberately identical to the take
  // meter. The one difference is that this one is safe, and the player has to
  // remember which one they are looking at.
  if(PB.isPlaying()){
    const w=Math.min(46, cols-8);
    const x=Math.floor((cols-w)/2), y=rows-5;
    const filled=Math.round(PB.progress()*(w-2));
    uiText(x, y-1, '▶ PLAYBACK', 'ui-blue');
    for(let i=0;i<w-2;i++) uiText(x+1+i, y, i<filled ? '▓' : '░', i<filled?'ui-blue':'ui-frame', i<filled ? 1 : 0.45);
  }

  const monitorY=cols<72?rows-5:rows-4;
  if(MIC.micActive()){
    uiText(2,monitorY-1,'ROOM MIC','ui-label');
    drawVfdMeter(11,monitorY-1,12,MONITOR.monitorSnapshotForRms(MIC.micLevel()),{theme:'green',thresholdDb:-12});
  }
  uiText(2, monitorY, 'MONITOR', 'ui-label');
  drawVfdMeter(11, monitorY, 12, MONITOR.monitorSnapshot());
  SPEECH.drawSpeech();
}

// The take screen. Not a menu, not a modal — the world is still there, and you
// are still in it, and the only thing you can do is not move. Letterbox bars
// close in as the seconds pass; a pulse; a noise gauge that is the whole of the
// fear made legible; and, everywhere, do not move.
// The take screen IS a hi ta chi DA-1000: a green LOCATION INDICATOR for the
// progress of the minute, a pale-cyan TIME COUNTER, a level meter, and a
// dread-closing letterbox around it. The dark room stays visible behind.
function drawTakeOverlay(cols, rows){
  const rec=REC.recState();
  const p=REC.takeProgress();
  const spoiled=rec.spoiled;
  const held=REC.isStalled();
  const assisted=REC.isAssistPaused();
  const t=performance.now()/1000;

  // The dark closes in as the seconds run.
  const bar=2+Math.round(p*3);
  uiFill(0, 0, cols, bar, 'rgba(2,3,3,0.96)');
  uiFill(0, rows-bar, cols, bar, 'rgba(2,3,3,0.96)');
  uiFill(0, 0, 3, rows, 'rgba(2,3,3,0.55)');
  uiFill(cols-3, 0, 3, rows, 'rgba(2,3,3,0.55)');

  const w=Math.min(64, cols-10);
  const x=Math.floor((cols-w)/2);
  const h=15;
  const y=Math.max(bar+1, Math.floor((rows-h)/2));
  const dot=(Math.floor(t*2)%2===0);
  const body=drawMachinePanel(x, y, w, h, {
    theme:'green', wordmark:'hi ta chi', model:'DA-1000', label:held?'TAKE HOLD':assisted?'CLOCK HOLD':'RECORD',
    footer: spoiled ? `— ${rec.spoilReason.toUpperCase()} —`
      : held ? (instr?.silenced?'RETURN TO RECORDER · [R] RESUME':'SOURCE ACTIVE · [E] SILENCE')
      : assisted ? 'MINOR HANDLING NOISE · CLOCK HELD'
      : "DON'T MOVE",
    meter:false,
    buttons:{ w:6, keys:[ {label:held||assisted?'HOLD':'REC', lit: spoiled||held||assisted?null:'rec'}, {label:'STOP'} ] },
  });
  const bx=body.x, by=body.y;

  // ● REC, blinking. SPOILED takes the red.
  uiText(
    bx,
    by,
    spoiled ? 'X SPOILED' : held ? 'Ⅱ TAKE HELD' : assisted ? 'Ⅱ CLOCK HELD' : (dot ? '● REC' : '  REC'),
    spoiled ? 'ui-danger' : held || assisted ? 'ui-blue' : 'ui-marker',
  );

  // LOCATION INDICATOR — the minute, as a bargraph with a red position marker.
  uiText(bx, by+2, 'LOCATION INDICATOR', 'ui-label');
  drawLocationIndicator(bx, by+3, w-8, p, { theme:'green' });

  // TIME COUNTER — pale-cyan 7-seg, MIN·SEC.
  const mins=Math.floor(rec.takeElapsed/60), secs=Math.floor(rec.takeElapsed%60);
  uiText(bx, by+5, 'TIME COUNTER', 'ui-label');
  drawVfdCounter(bx, by+6, `${mins}:${String(secs).padStart(2,'0')}`, { scale:1.6, theme:'green' });
  uiText(bx+18, by+7, `/ 0:${String(ROOM_TONE.takeSeconds).padStart(2,'0')}`, 'ui-secondary');

  // LEVEL — the noise gauge, the whole of the fear made a bargraph.
  const nz=Math.min(1, REC.currentNoise()/ROOM_TONE.spoilNoise);
  uiText(bx, by+8, 'LEVEL', 'ui-label');
  drawVfdMeter(bx+6, by+8, 14, MONITOR.monitorSnapshotForRms(nz*0.9), { theme:'green', thresholdDb:-6 });

  // The room is live. The mic is on, and it is not the game's mic.
  if(MIC.micActive()){
    uiText(bx, by+9, 'ROOM MIC', 'ui-label');
    drawVfdMeter(bx+9, by+9, 12, MONITOR.monitorSnapshotForRms(MIC.micLevel()), { theme:'green', thresholdDb:-12 });
    uiCenter(y-1, '● YOUR ROOM IS LIVE', 'ui-danger');
  }
  if(held&&instr?.silenced&&takeOrigin){
    {const q=FP.logicalToPhysical(takeOrigin.x,takeOrigin.y);drawRecorderReturn(currentFacilityMapModel(),{x:q.x/(currentFacilityMapSource()?.topologyStride||1),y:q.z/(currentFacilityMapSource()?.topologyStride||1)},{now:performance.now()});}
  }
}

// Test surface. Silence and noise are invisible, so acceptance has to assert
// on the actual numbers rather than on screenshots.
function installProbe(){
  window.__probe={
    voices:()=>voices.size,
    pos:()=>({x:px,y:py}),
    rec:()=>({...REC.recState(), recording:REC.isRecording(), listening:REC.isListening()}),
    floor:()=>REC.noiseFloor(),
    noise:(v)=>REC.emitNoise(v, px, py, 'the room was not empty'),
    injure:()=>REC.injure(),
    world:()=>currentWorld(),
    presence:()=>({...PRES.presenceState(), dist:PRES.distanceTo(px,py), pressure:PRES.pressure(px,py)}),
    spawnPresence:(d=6)=>PRES.spawnBehind(px,py,0,d/Math.abs(d||1)),
    placePresence:(x,y)=>{ const st=PRES.presenceState(); st.active=true; st.x=x; st.y=y; },
    solid:(x,y)=>solidAt(x,y),
    plan:()=>({loaded:FP.isLoaded(), ...FP.planSize()}),
    map:()=>currentFacilityMapModel(),
    mapSource:()=>currentFacilityMapSource(),
    mapContact:()=>HUSH_MAP_TELEMETRY.snapshot(),
    hushAudio:()=>hushAudioRuntime?.snapshot?.()||null,
    hushAudioSave:()=>hushAudioRuntime?.save?.()||null,
    hushNoise:(kind='bag_rummage',level=null)=>emitAcousticEvent({
      kind,
      source:{kind:'player',id:'probe'},
      spatial:acousticSpatialAt(px,py),
      ...(level==null?{}:{acoustic:{levelDb:Number(level)}}),
      semantics:{playerGenerated:true,deliberate:true,audibleToHush:true,audibleToMonitor:true,audibleInWorld:true},
      provenance:{system:'probe'},
    }),
    forceMapContact:(roomId='main_b3', duration=1600)=>{
      const source=currentFacilityMapSource();
      const target=source?.targets?.find((entry)=>entry.roomId===roomId);
      if(!target?.position||!target.floorId)return false;
      const beatId=`probe:${roomId}:${Date.now()}`;
      const stride=source.topologyStride||1;
      const ok=HUSH_MAP_TELEMETRY.forceLock({
        beatId,
        floorId:target.floorId,
        roomId,
        position:{x:target.position.x*stride,y:target.position.y*stride},
        duration:Number(duration)||1600,
      });
      facilityMapCache={key:null,model:null};
      return ok;
    },
    clearMapContact:()=>{ HUSH_MAP_TELEMETRY.reset(); facilityMapCache={key:null,model:null}; return true; },
    cell:(x,y)=>FP.cellAt(x,y),
    materialAt:(x,y)=>FP.materialAt(x,y),
    canStep:(ax,ay,bx,by)=>FP.canStep(ax,ay,bx,by,{keys:playerKeys}),
    props:()=>({pack:R3.r3dPropStats(),instances:PROPS.allProps().map((p)=>({id:p.id,mesh:p.mesh,x:p.x,y:p.y,zone:p.zone,blocks:p.blocks})),learned:PROPS.learnedPlayable().map((p)=>p.id)}),
    surfaceDream:()=>R3.r3dSurfaceDreamStats(),
    surfaces:()=>R3.r3dSurfaceStats(),
    pickProp:()=>PROPS.pickProp(px,py,R3.r3dFacing(),2),
    warp:(x,y,f)=>{ px=x; py=y; if(f!=null) R3.r3dSetFacing(f); trail=[]; revealAround(px,py); },
    // ── M5 finale test surface ──
    beginConfrontation:()=>beginConfrontation(),
    finale:()=>({ active:finaleActive, escape:escape&&escape.stage, ending:flagGet('ending.choice')||null, endingsSeen:getMeta().endingsSeen||[] }),
    coffee:()=>({ has:flagTest('has.coffee'), drank:flagTest('drank.coffee'), lensOnset:+lensOnset.toFixed(3), target:+lensTarget.toFixed(3) }),
    drinkCoffee:()=>drinkCoffee(),
    // ── fear + taken ──
    fear:()=>({ level:+fear.toFixed(3), taken:takenActive, lost:lostItem, lostAt }),
    torch:()=>({ on:REC.lightOn(), battery:+REC.batteryLevel().toFixed(3),
                 soldered:flagTest('has.interface'), gutted:flagTest('rig.gutted'), betrayed:flagTest('torch.betrayed') }),
    drainTorch:(s)=>{ REC.drainLight(Number(s)||0); return REC.batteryLevel(); },
    setFear:(v)=>{ fear=Math.max(0,Math.min(1,Number(v)||0)); return fear; },
    bumpFear:(a)=>bumpFear(Number(a)||0),
    takeMe:()=>beginTaken(),
    itemLost:(id)=>itemLost(id),
    warpToLost:()=>{ if(!lostAt) return false; px=lostAt.x; py=lostAt.y; trail=[]; revealAround(px,py); return true; },
    escapeWarp:()=>{ if(!escape) return false; const wp=escape.stage==='door'?escape.doorCell:escape.rescueCell; px=wp.x; py=wp.y; trail=[]; revealAround(px,py); return escape.stage; },
    setFlags:(arr)=>flagApply(arr||[]),
    flag:(k)=>flagTest(k),
    him:()=>himIdx,
    // The plan is authored in cells; the player lives in runtime metres. A suite
    // that wants to stand in the chapel should say so in the language of the map.
    warpCell:(x,y)=>{ const r=FP.toRuntimePoint({x,y}); px=r.x; py=r.y; trail=[]; revealAround(px,py); return {x:px,y:py}; },
    hushInstrument:()=>instr?{propId:instr.propId,silenced:instr.silenced,origin:takeOrigin,pathLength:instr.path?.length||0}:null,
    wakeHush:()=>wakeInstrument(),
    silenceHush:()=>silenceInstrument(instr?.propId),
    floorH:()=>floorHere(),
    rgbaAt:(x,y)=>{ const p=FP.floorplan(); const i=(y*p.w+x)*4; return [...p.rgba.slice(i,i+4)]; },
    heardAt:(x,y)=>MUT.heardAt(x,y),
    mutStats:()=>MUT.mutateStats(),
    mutTune:(o)=>Object.assign(MUT.MUTATE,o),
    forceMutate:()=>{
      const facing = RENDERER==='3d' ? R3.r3dDelta(1) : [0,-1];
      const wp=OBJ.waypoint(); const home=FP.spawn();
      const anchors=[]; if(wp) anchors.push({x:wp.x,y:wp.y}); if(home) anchors.push({x:home.x,y:home.y});
      const c=MUT.tryMutate(performance.now()+1e9, {px,py,facing,light:REC.lightOn()}, anchors);
      if(c){const p=FP.physicalRenderPlanFor(px,py);R3.r3dSetPlan(p.rgba,p.w,p.h,p.material);r3dCache.physicalGroup=p.group;r3dCache.physicalKey=p.key;r3dCache.fogSize=-1;}
      return c;
    },
    facing:()=>R3.r3dDelta(1),
    stabs:()=>STAB.stabStats(),
    stabFire:(k)=>STAB.stab(k),
    stabPool:()=>STAB.poolSize(),
    stabTune:(o)=>Object.assign(STAB.STABS,o),
    stabRelief:(a)=>STAB.reportRelief(a),
    stabThreat:()=>STAB.reportThreat(),
    setReduceDread:(v)=>{ const st=getSave(); st.settings.reduceDread=!!v; saveCommit({settings:st.settings}); },
    obj:()=>({wp:OBJ.waypoint(), target:OBJ.targetRoom(), read:OBJ.pagesRead()}),
    // Its own id namespace: an auto id would collide with the previous
    // recordist's sheets and a test page would inherit his waypoint.
    placePage:(dx,dy,room)=>OBJ.placePage(px+dx,py+dy,room||'the_tub',
      `probe-${OBJ.allPages().length+1}`),
    // ── M4.2: the reader, the radio, the tape ──────────────────────────────
    scene:()=>scenes.top()?.id||null,
    read:()=>interact(),
    lensPreset:(n)=>{ applyLensPreset(n); return !!window.__lensPromptLocked; },
    typing:()=>STORY.typingState(),
    audio:()=>({ ...STORY.audioState(), actx: actx ? actx.state : 'none',
      buses:{global:outGain?.gain.value??null,dialog:dialogGain?.gain.value??null,sfx:sfxGain?.gain.value??null,direct:sfxDirectGain?.gain.value??null,music:musicGain?.gain.value??null},
      mic:{state:MIC.micState(),level:MIC.micLevel(),maySpoil:MIC.micMaySpoil()},
      monitor:MONITOR.monitorSnapshot() }),
    monitor:()=>MONITOR.monitorSnapshot(),
    monitorTest:(level)=>MONITOR.monitorInject(level),
    // Whatever conversation is on top, as data: the line, who says it, how much
    // of it has been revealed, and what you are being offered.
    convo:()=>{ const v=scenes.top()?.view?.(); if(!v) return null;
      return { speaker:v.speaker, who:v.who, text:v.line?.text||'', typed:v.typed,
               typing:v.typing, node:v.nodeId,
               pending:v.pending && { kind:v.pending.kind, index:v.pending.index,
                                      options:v.pending.options.map(o=>o.text) } }; },
    // ── thought trees ──────────────────────────────────────────────────────
    thoughts:()=>({ had:saveThoughtState().had,
                    confession:{ kind:flagGet('confession.kind')||null,
                                 value:flagGet('confession.value')||null },
                    // The two numbers that decide how this night ends.
                    interface:!!flagTest('has.interface'),
                    listened:Number(flagGet('listened.count'))||0 }),
    job:()=>bagJob(),
    think:(id)=>{ const T={'post-door':POST_DOOR,'level-check':LEVEL_CHECK,'first-take':FIRST_TAKE,
                           hush:HUSH,'radio-dead':RADIO_DEAD,'bent-rig':BENT_RIG,
                           talisman:TALISMAN}[id];
      return !!(T && think(id, T, {force:true, startAt: id==='post-door' ? (prologueKnowledgeFrame()||'self') : 'start'})); },
    speech:()=>{ const s=SPEECH.speaking(); return s && {who:s.who, text:s.text}; },
    hush:()=>SPEECH.clearSpeech(),
    tut:()=>({active:TUT.tutorialActive(), step:TUT.tutorialStep(), prompt:TUT.tutorialPrompt()}),
    tutSkip:()=>TUT.skipTutorial(),
    // Drive a battle without recording two takes to get to it.
    battle:(named)=>{ ensureCtx(); openBattle(natatoriumBattle(!!named),
      { onWin:()=>{}, onLose:()=>{} }); return true; },
    battleId:(id, named)=>{ const F={natatorium:natatoriumBattle, practice:practiceBattle}[id||'natatorium'];
      if(!F) return false; ensureCtx(); openBattle(F(!!named), { onWin:()=>{}, onLose:()=>{} }); return true; },
    playbackDialog:(room)=>{ maybePlaybackDialog(room); return scenes.top()?.id||null; },
    battleState:()=>{ const v=scenes.top()?.battleView?.(); return v||null; },
    encounters:()=>({
      ...ENCOUNTERS.encounterState(),active:activeBattleId,
      gates:{planName,recording:REC.isRecording(),monitoring:REC.isMonitoring(),room:currentWorld(),
        takes:[...REC.recState().takes],progress:REC.takeProgress(),scene:scenes.top()?.id||null,
        blocksInput:scenes.blocksInput()},
    }),
    seedTake:(room)=>REC.addTake(room||'main_b3'),
    // The real mic. Headless cannot grant one, so inject a level to prove that
    // your own room spoils the take, and a scream makes him scream.
    mic:()=>({ state:MIC.micState(), level:MIC.micLevel() }),
    micTest:(lvl)=>MIC.micTest(lvl),
    settings:()=>({ ...getSave().settings }),
    radio:()=>RADIO.radioState(),
    radioTransmit:(i)=>radioTransmit(i),
    radioKill:()=>RADIO.killRadio(),
    radioTune:(o)=>Object.assign(RADIO.RADIO,o),
    radioTick:()=>RADIO.tickRadio(0.016,{expectation:STAB.expectation(),px,py}),
    // Forty-five seconds is the game. It is not the test.
    tuneRoomTone:(o)=>Object.assign(ROOM_TONE,o),
    take:(room)=>{ const t=PB.takeFor(room||currentWorld());
      return t && { sealed:t.sealed, audible:(t.audible||[]).map(([id,g])=>({id,g})),
                    guest:t.guest?t.guest.idx:null }; },
    playback:()=>({playing:PB.isPlaying(), progress:PB.progress()}),
    play:()=>playCurrentTake(),
    stopPlay:()=>PB.stopPlayback(),
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
    fieldAudio:()=>({ voices:voices.size, worldLayer:!!worldLayerVoice,
      ambient:ambientDrone?.target || 0, suppressed:sampleFieldSuppressed() }),
  };
}


function enterJustSurf(){
  stopHushAudioRuntime();
  storyMode=false;
  STORY.stopAll();
  setGameChrome(false);
  ensureCtx();
  startAmbientDroneAt(currentAmbientTarget());
  pushEvent('// just surf. no story. the field is the field.');
}

function bootScenes(){
  window.__scenes=scenes;
  installProbe();
  try{ MAP_EL.setAttribute('tabindex','0'); MAP_EL.focus({preventScroll:true}); }catch(_){}
  saveLoad();
  const qp=new URLSearchParams(location.search);
  progressionInit({build:qp.get('build') || 'LOCAL'});
  BINDINGS.setControllerBindings(getSave().settings?.controllerBindings);
  { const vs=getSave().settings?.vfd; if(vs) applyVfdSettings(vs); }
  terrorInit();
  uiInit(MAP_EL);
  scenes.scenesInit({ applyLensPreset });

  if(qp.has('debug') || qp.has('progresslab')){
    window.__progress={
      snapshot:progressionSnapshot,
      emit:(type,payload={})=>emitProgress(type,payload,'dev.console'),
      finalize:(endingId)=>commitReturn(endingId,{rec:REC.saveRecState()}),
      assert:()=>assertProgressionInvariants(),
      sync:()=>syncPlatform(),
    };
  }

  if(!qp.has('debug')){
    if(SUBWORLD2_BTN) SUBWORLD2_BTN.style.display='none';
    if(DEBUG_KEYS_BTN) DEBUG_KEYS_BTN.style.display='none';
  }

  if(qp.has('progresslab')){ scenes.push(makeProgressionLabScene()); return; }
  if(qp.has('baglab')){ scenes.push(makeBagLabScene()); return; }
  if(qp.has('maplab')){ scenes.push(makeMapLabScene()); return; }
  if(qp.has('hushaudiolab')){
    ensureCtx();
    scenes.push(makeHushAudioLabScene({
      playCue:(intent,field)=>{
        const cue={delivery:'monitor',audio:{sound:intent?.kind==='PLAY'?'hush-fragment':'instrument',gain:.22,pitchRange:[.78,.96]}};
        hushAudioMix?.playMischief?.(cue,{intensity:intent?.intensity||field?.absorption?.monitor||.6,pan:.55});
      },
      applyField:(field,{settings,monitorGain})=>hushAudioMix?.applyField?.(field,settings,{monitorGain,monitorOpen:true}),
      resetField:()=>hushAudioMix?.reset?.(),
    }));
    return;
  }

  const mode=qp.get('mode');
  if(mode==='surf'){ enterJustSurf(); return; }
  if(mode==='story' || qp.has('talk')){
    if(!getSave().run){ newGame({preset:'contract'}); beginRunProgression(); }
    enterStory();
    return;
  }

  const wantFullscreen=qp.has('fullscreen');
  scenes.push(makeTitle({wantFullscreen}));
  const pending=pendingReturnReport();
  if(pending) showReturnReport(pending);
  syncPlatform().catch(()=>{});
}


// ── Diffusion lens bootstrap (dev + demo) ─────────────────────────────────────
const LOCAL_LENS_DEFAULT='ws://127.0.0.1:8000';
let lensStarting=null;
let lensDisabled=false;
function localLensEndpoint(raw){
  try{
    const u=new URL(raw||LOCAL_LENS_DEFAULT, location.href);
    const loopback=u.hostname==='127.0.0.1'||u.hostname==='localhost'||u.hostname==='[::1]'||u.hostname==='::1';
    if(!loopback || (u.protocol!=='ws:'&&u.protocol!=='wss:')) return null;
    return u.toString();
  }catch(_){ return null; }
}
async function resolveLensConfig(qp){
  if(qp.get('diffusion')){
    const url=localLensEndpoint(qp.get('diffusion'));
    if(!url){ console.warn('remote diffusion endpoint rejected — the lens is local-only'); return null; }
    return {url};
  }
  if(qp.get('lens')==='0' || qp.has('nodiffusion')) return null;
  const localPage=location.hostname==='127.0.0.1'||location.hostname==='localhost'||location.hostname==='[::1]'||location.hostname==='::1';
  if(!localPage && !qp.has('lens')) return null;
  try{
    const res=await fetch('./lens.local.json', {cache:'no-store'});
    if(!res.ok) throw new Error(res.status);
    const cfg=await res.json(),url=localLensEndpoint(cfg?.url);
    if(!url) throw new Error('lens.local.json must name a loopback WebSocket');
    return {url};
  }catch(err){
    console.info(`local lens config unavailable (${err.message||err}); trying ${LOCAL_LENS_DEFAULT}`);
    return {url:LOCAL_LENS_DEFAULT};
  }
}
async function startLens(qp){
  if(window.__diffusion){
    if(storyMode&&!qp.has('skiptut')&&FP.isLoaded()&&py<=FP.toRuntimeCoord(15)){
      window.__diffusion.setBypass(true);
      R3.r3dSetLocalDiffusionLevel(0);
    } else if(!window.__diffusion.isBypassed?.()){
      R3.r3dSetLocalDiffusionLevel(Math.max(0.16, Math.min(0.72, 0.18 + (window.__lensOnset ?? LENS_FLOOR) * 0.46)));
    }
    return window.__diffusion;
  }   // one lens, one socket
  const cfg=await resolveLensConfig(qp);
  if(!cfg?.url){ lensDisabled=true; R3.r3dSetLocalDiffusionLevel(0); return null; }
  const [diffusionModule={}, presetsModule={}, tunerModule={}] = await Promise.all([
    import('./net/diffusion.js'), import('./net/lens-presets.js'), import('./net/tuner.js'),
  ]).catch((err)=>{ console.error('lens modules failed', err); return []; });
  const {surfaceDiffusionStart}=diffusionModule;
  const {PRESETS={}}=presetsModule;
  const {mountTuner}=tunerModule;
  if(!surfaceDiffusionStart){ lensDisabled=true; R3.r3dSetLocalDiffusionLevel(0); return null; }
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
  // Generate enough variation to recover physical detail, then transfer only
  // that detail in the shader; broad generated colour/lighting never replaces
  // the authored material.
  const surfaceOpts={strength:num('dstrength',.32),passes:1,guidance:num('dguidance',1.0),mix:num('dmix',.88)};
  // undefined (not '') so the zone prompt owns it from the first frame
  const prompt=qp.get('dprompt') || preset.prompt || undefined;
  if(prompt) window.__lensPromptLocked=true;

  window.__diffusion=surfaceDiffusionStart({
    url:cfg.url,
    sourceUrl:new URL('../assets/surfaces/surface-albedo.jpg',import.meta.url),
    applySurface:(slot,image,mix)=>R3.r3dSetSurfaceDream(slot,image,mix),
    commitSurfaces:(mix)=>R3.r3dCommitSurfaceDream(mix),
    setSurfaceMix:(mix)=>R3.r3dSetSurfaceDreamMix(mix),
    clearSurfaces:()=>R3.r3dClearSurfaceDream(),
    prompt,
    ...opts,
    ...surfaceOpts,
    onStatus:(s)=>{
      if(s.server) console.info('diffusion server:', JSON.stringify(s.server));
      if(s.state!=='streaming') console.info('diffusion:', s.state);
      if(s.bypassed) R3.r3dSetLocalDiffusionLevel(0);
      else R3.r3dSetLocalDiffusionLevel(Math.max(0.16, Math.min(0.72, 0.18 + (window.__lensOnset ?? LENS_FLOOR) * 0.46)));
    },
  });
  R3.r3dSetLocalDiffusionLevel(Math.max(0.16, Math.min(0.72, 0.18 + (window.__lensOnset ?? LENS_FLOOR) * 0.46)));

  // THE LENS SLEEPS IN THE DOCK.
  //
  // The title, the cold open, the door, and the whole of the setup run on the
  // raymarcher's raw geometry: hard-edged, dark, honest. The loading dock is
  // the last ordinary place the recordist stands in, and a building that has
  // not met him yet has nothing to dream about. `setBypass` closes the socket
  // and fades the overlay, so we do not pay a GPU for a black screen either.
  //
  // It wakes the first time he steps out of the dock, and never sleeps again.
  if(storyMode && !qp.has('skiptut') && FP.isLoaded() && py<=FP.toRuntimeCoord(15)){
    window.__diffusion.setBypass(true);
    R3.r3dSetLocalDiffusionLevel(0);
  }

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
    if(st.bypassed){
      hud.textContent = '';                       // asleep. say nothing.
    } else if(st.mode==='surfaces'&&st.state==='ready'&&st.resident){
      hud.textContent = `lens ● surfaces ${st.framesIn}/${st.total}   [t] tuner`;
    } else if(st.mode==='surfaces'&&st.state==='generating'){
      hud.textContent = `lens ◐ material ${Math.max(1,st.slot+1)}/${st.total} · visible`;
    } else if(st.state!=='streaming'){
      hud.textContent = `lens ○ ${st.state} — base render`;
    } else if(fps>0){
      hud.textContent = `lens ● ${fps}fps ${Math.round(st.lastRttMs)}ms   [t] tuner`;
    } else if(st.framesIn>0){
      // No frames arriving. With sample-and-hold that is the design; without it
      // the stream has stalled and the player should not be told it is fine.
      hud.textContent = st.held>0 ? `lens ◍ held   [t] tuner`
                                  : `lens ◍ stalled ${Math.round(st.lastRttMs)}ms`;
    } else {
      hud.textContent = `lens ○ warming — base render`;
    }
  }, 1000);

  if(qp.get('tuner')!=='0'){
    const t=mountTuner(MAP_EL, ()=>window.__diffusion, {
      keys:()=>[
        {id:'master',label:'STANDARD / FOH',granted:playerKeys.has('master'),defaultGranted:true},
        {id:'chapel',label:'CHAPEL · C-17',granted:playerKeys.has('chapel'),defaultGranted:false},
      ],
      setKey:(id,granted)=>{ if(granted) playerKeys.add(id); else playerKeys.delete(id); },
      takes:()=>TARGETS.map((id)=>({id,label:roomLabel(id).toUpperCase(),taken:REC.hasTake(id)})),
      setTake:(id,taken)=>{REC.setTake(id,taken);saveCommit({rec:REC.saveRecState()});},
    });
    t.setState(surfaceOpts);
  }
}
function ensureLensStarted(qp=new URLSearchParams(location.search)){
  if(RENDERER!=='3d') return null;
  if(lensDisabled) return null;
  if(window.__diffusion) return window.__diffusion;
  if(lensStarting) return lensStarting;
  lensStarting=startLens(qp)
    .catch((err)=>{ console.error('lens start failed', err); lensDisabled=true; R3.r3dSetLocalDiffusionLevel(0); return null; })
    .finally(()=>{ lensStarting=null; });
  return lensStarting;
}

// Zone changes update the authored prompt but never repaint resident surfaces.
// A material regeneration is an explicit tuner/preset operation, so ordinary
// walking cannot produce texture swaps or camera-relative jitter.
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
  ensureLensStarted();
  const physical=usingPlan()?FP.logicalToPhysical(px,py):{x:px,z:py,y:floorHere(),renderGroup:''};
  const rendered=renderedPlayerPoint();
  const slice=usingPlan()?FP.physicalRenderPlanFor(px,py):null;
  if(slice&&slice.key!==r3dCache.physicalKey){
    R3.r3dSetPlan(slice.rgba,slice.w,slice.h,slice.material);r3dCache.physicalGroup=slice.group;r3dCache.physicalKey=slice.key;r3dCache.fogSize=-1;R3.r3dSetProps(worldRenderInstances(slice.group));
  }
  if(fog.size!==r3dCache.fogSize){
    if(usingPlan())R3.r3dUpdateFog((fx,fy)=>{const l=FP.logicalAtPhysical(fx,fy,{group:physical.renderGroup,floor:physical.y});return l?fogGet(l.x,l.y):0;},physical.x,physical.z);
    else R3.r3dUpdateFog(fogGet,px,py);
    r3dCache.fogSize=fog.size;
  }
  updateZonePrompt();
  let voiceSum=0;
  for(const [,v] of voices) voiceSum+=v.target||0;
  const firstKey=keyMap.size>0 ? keyMap.values().next().value : null;
  const mapPoint=(p)=>{if(!p||!usingPlan())return p;const q=FP.logicalToPhysical(p.x,p.y);return{...p,x:q.x,y:q.z};};
  R3.r3dFrame({
    px:rendered.x, py:rendered.z,
    tileW:WORLD_TILE_W, tileH:WORLD_TILE_H,
    worldCount:worldsConfig.length,
    worldTints:worldsConfig.map(w=>R3.WORLD_RGB[w.id]||[0.6,0.6,0.6]),
    chunks:r3dNearChunks().map(mapPoint),
    key:mapPoint(firstKey),
    door:mapPoint(door),
    hush: (storyMode && PRES.isActive())
      ? {...mapPoint({x:PRES.presenceState().x,y:PRES.presenceState().y}),
         strength: 0.65 + PRES.dread(px,py)*0.55}
      : (hush.active?{...mapPoint({x:hush.x,y:hush.y}),strength:1}:null),
    audio:clamp(voiceSum/3, 0, 1),
    light: storyMode ? (REC.lightOn()?hushLightScale:0) : true,
    plan: usingPlan(),
    floorH: floorHere(),
    moveIntervalMs:currentMoveIntervalMs(),
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
  // opened duplicate local lens sessions.
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
      const p=storyMode ? FP.toRuntimePoint({x:ax,y:ay}) : {x:ax,y:ay};
      px=p.x; py=p.y; trail=[]; revealAround(px,py);
    }
    faceOpenDirection();   // never start facing a wall in a 2-wide lane
    // never spawn inside a wall slab
    if(R3.r3dSolid(px,py)){
      outer: for(let r=1;r<D(12);r++){
        for(let oy2=-r;oy2<=r;oy2++) for(let ox2=-r;ox2<=r;ox2++){
          if(Math.max(Math.abs(ox2),Math.abs(oy2))!==r) continue;
          if(!solidAt(px+ox2,py+oy2)){ px+=ox2; py+=oy2; break outer; }
        }
      }
      revealAround(px,py);
    }
    // Diffusion lens. `?lens=1` reads the ignored loopback config; an explicit
    // `?diffusion=ws://127.0.0.1:...` is useful when testing another local port.
    // Remote endpoints are rejected. Any failure leaves the base render up.
    const qp=new URLSearchParams(location.search);
    ensureLensStarted(qp);
  }
  try{
    MAP_EL.setAttribute('tabindex','0');
    MAP_EL.focus({ preventScroll:true });
  }catch(_){}
  if(storyMode) disableOnboardingForSession();
  updateOnboardingButton();
  if(!sampleFieldSuppressed()) startAmbientDroneAt(currentAmbientTarget());
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
const MOVE_CODE=Object.freeze({KeyA:'a',KeyD:'d',KeyW:'w',KeyS:'s',ArrowLeft:'ArrowLeft',ArrowRight:'ArrowRight',ArrowUp:'ArrowUp',ArrowDown:'ArrowDown'});
const CONTROLLER_KEY=Object.freeze({
  move_up:['ArrowUp','ArrowUp'], move_down:['ArrowDown','ArrowDown'],
  move_left:['ArrowLeft','ArrowLeft'], move_right:['ArrowRight','ArrowRight'],
  quiet:['Shift','ShiftLeft'], light:['f','KeyF'], bag:['b','KeyB'], recorder:['r','KeyR'],
  interact:['e','KeyE'], playback:['p','KeyP'], menu:['Escape','Escape'],
  confirm:['Enter','Enter'], back:['Escape','Escape'],
});
function controllerEvent(action, repeat=false){
  const [key,code]=CONTROLLER_KEY[action]||['',''];
  return {key,code,repeat,metaKey:false,ctrlKey:false,altKey:false,shiftKey:action==='quiet',target:null,
    preventDefault(){},stopPropagation(){},controller:true,controllerAction:action};
}
function controllerPress(action,repeat=false){ if(CONTROLLER_KEY[action]) onKey(controllerEvent(action,repeat)); }
function controllerRelease(action){ if(CONTROLLER_KEY[action]) onKeyUp(controllerEvent(action,false)); }
function movementKey(e){
  const key=MOVE_KEYS.has(e?.key)?e.key:(MOVE_CODE[e?.code]||null);
  return key&&key.length===1?key.toLowerCase():key;
}
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
  const moveKey=movementKey(e);

  // Scenes (title, dialogue, menus) get first refusal on every key — before
  // inRogue, so the title screen works while the field is still loading.
  if(scenes.depth()>0 && scenes.key(e)){
    e.preventDefault();
    // A scene now owns input: drop any movement key held from before it opened,
    // so the player does not keep walking behind the title/menu. Non-modal
    // scenes may decline the key and allow normal world input to continue.
    keysDown.clear();
    nextMoveAtMs=0;
    return;
  }
  if(!inRogue) return;
  if(storyMode && e.key==='Escape'){
    e.preventDefault();
    // Esc is the service menu — settings and the way back to the title. It does
    // NOT stop a take: once you have rolled, the only way out is [r].
    openSettings({inGame:true});
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
      if(itemLost('torch')){ SPEECH.say({ who:'you', text:'No torch. It has the torch.' }); return; }
      if(!REC.lightOn() && REC.batteryLevel()<=0){ SPEECH.say({ who:'you', text:'Flat. It is flat, and I have nothing to put in it.' }); return; }
      const on=REC.toggleLight();
      CUES.playCue(CUES.CUE.light, {gain:0.7, rate: on ? 1 : 0.92});
      REC.emitNoise(.02,px,py,'torch switch',{
        spoils:false,kind:'handling_noise',sourceKind:'equipment',sourceId:'torch',playerGenerated:true,deliberate:true,
      });
      // He says it the first time. After that a man who flicks his own torch
      // on does not narrate it, and neither do we.
      once(on ? 'said-light-on' : 'said-light-off', ()=>SPEECH.say(on ? framedLine('lightOn', LINES.lightOn) : LINES.lightOff));
      return;
    }
    if(bare && is('KeyR','r')){
      e.preventDefault();
      if(!firstTakeIntercept()) recordAction();
      return;
    }
    // [space]/[enter] hurries or clears the line he is currently thinking.
    // Enter remains inert only when there is no active inspection/speech band.
    if(bare && (e.code==='Space' || e.key===' ' || e.key==='Enter' || e.code==='Enter' || e.key==='z' || e.key==='Z') && SPEECH.isSpeaking()){
      e.preventDefault(); SPEECH.skipSpeech(); return;
    }
    if(bare && is('KeyB','b')){ e.preventDefault(); openBag(); return; }
    if(bare && is('KeyE','e')){ e.preventDefault(); interact(); return; }
    if(bare && is('KeyP','p')){ e.preventDefault(); playCurrentTake(); return; }
    if(e.key==='Shift'){ REC.setSlow(true); return; }
  }
  // [enter] talks to nobody. There is nobody in this building.
  //
  // This used to summon the Usher — an M2 placeholder who told you "there is a
  // 'you' in this story", which is the exact move ROOM TONE exists to refuse.
  // It also bricked: `usher.again` was never written, so a second press pushed
  // a dialogue scene with no node and swallowed every key after it.
  if(storyMode && (e.key==='Enter' || e.key==='z' || e.key==='Z')){
    e.preventDefault();
    return;
  }
  if(RENDERER==='3d' && (moveKey==='ArrowLeft'||moveKey==='a'||moveKey==='A'||moveKey==='ArrowRight'||moveKey==='d'||moveKey==='D')){
    // First-person: left/right are quarter turns, not strafes.
    e.preventDefault();
    if(!e.repeat){
      const dir=(moveKey==='ArrowRight'||moveKey==='d'||moveKey==='D') ? 1 : -1;
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
  if(moveKey){
    e.preventDefault();
    if(isOnboardingActive() && (moveKey==='ArrowDown' || moveKey==='s' || moveKey==='S')) return;
    const alreadyHeld=keysDown.has(moveKey);
    keysDown.add(moveKey);
    // Native key-repeat is OS/browser timed and must never become a second
    // movement clock. A new press gets one immediate, responsive step; the RAF
    // cadence owns every held step after it.
    if(!e.repeat&&!alreadyHeld){
      const now=performance.now();
      maybeLockHushFromInputKey(moveKey,now);
      const [dx,dy]=arrowDelta();
      if(dx||dy)step(dx,dy);
      armHeldMovement(now);
    }
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
  if(scenes.depth() && scenes.keyup(e)) e.preventDefault?.();
  if(e.key==='Shift') REC.setSlow(false);
  const moveKey=movementKey(e);
  if(moveKey){
    keysDown.delete(moveKey);
    const [dx,dy]=arrowDelta();
    if(dx===0&&dy===0)nextMoveAtMs=0;
  }
}
function onBlur(){
  // Releasing focus mid-press would otherwise leave keys "stuck".
  keysDown.clear();
  nextMoveAtMs=0;
  if(storyMode && inRogue && !paused && pauseWhenBlurEnabled()) togglePause();
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

function onScenePointer(e){
  if(!scenes.depth()) return;
  const point=uiPointFromClient(e.clientX,e.clientY);
  if(!scenes.pointer({
    type:e.type,clientX:e.clientX,clientY:e.clientY,
    cellX:point.cellX,cellY:point.cellY,
    pointerId:e.pointerId,buttons:e.buttons,pointerType:e.pointerType,
  })) return;
  e.preventDefault();
  if(e.type==='pointerdown') ensureInteractionFocus();
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
  if(CATALOG_TOGGLE_BTN) CATALOG_TOGGLE_BTN.addEventListener('click', ()=>toggleCatalog());
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
  window.addEventListener('pointerdown', onScenePointer, {capture:true,passive:false});
  window.addEventListener('pointermove', onScenePointer, {capture:true,passive:false});
  window.addEventListener('pointerup', onScenePointer, {capture:true,passive:false});
  window.addEventListener('pointercancel', onScenePointer, {capture:true,passive:false});
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
    const qp=new URLSearchParams(location.search);
    if(!qp.has('baglab')&&!qp.has('progresslab')&&!qp.has('maplab')&&!qp.has('hushaudiolab')){
      loadAll();
      loadSw2DriverAudio();
    }
}

boot();
