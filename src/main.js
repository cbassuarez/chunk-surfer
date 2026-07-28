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
import { emitAcousticEvent, onAcousticEvent } from './audio/acoustic-events.js';
import { createHushMix } from './audio/hush-mix.js';
import * as FP from './world/floorplan.js';
import { F as CELL_FLAGS, ZONE, CELL, MATERIAL } from './data/floorplan/legend.js';
import * as MUT from './world/mutate.js';
import * as scenes from './game/scenes.js';
import { uiInit, uiSetScale, uiClear, uiText, uiSize, uiFill, uiCenter, uiDraw, uiPointFromClient, uiWrap } from './render/ui.js';
import { drawVfdCounter, drawVfdMeter, drawVfdWarningTriangle, drawMachinePanel, drawLocationIndicator, drawVfdText } from './render/presentation.js';
import { applyVfdSettings, vfdSettings } from './render/palette.js';
import { saveLoadAsync, saveCommit, getSave, newGame, metaCommit, getMeta } from './game/save.js';
import { currentStorage, exportAllData, exportDiagnosticsForSupport } from './platform/storage/storageService.js';
import { flagApply, flagTest, flagGet, flagSet } from './game/flags.js';
// The M2 dialogue runtime (game/dialogue.js, data/prologue.js, the Usher) is
// gone. Conversations are game/conversation.js now, and there is nobody in this
// building to talk to.
import { makeTitleScene } from './game/title.js';
import { makeSettingsScene } from './game/settings.js';
import { makeBetaNoticeScene } from './game/beta-notice.js';
import { makeCreditsScene } from './game/credits.js';
import { makeStoryArtPreviewScene } from './game/story-art-preview.js';
import { preloadStoryArt, resolveStoryArt, storyArtCacheSnapshot } from './game/story-art.js';
import { terrorInit, once, interpolate } from './game/terror.js';
import * as REC from './game/recordist.js';
import * as RT from './audio/roomtone.js';
import * as PRES from './game/presence.js';
import { createPresenceNavigation } from './game/presence-navigation.js';
import {
  HUSH_BRUSH_OUTCOME,
  HUSH_CONTACT_KIND,
  HUSH_CONTACT_LIMITS,
  HUSH_SENSATION_MODE,
  buildHushReleaseNote,
  buildHushSensationTree,
  classifyHushContactApproach,
  chooseHushReleaseDestination,
  chooseHushContactExperience,
  noteHushWarningShown,
  rememberHushContent,
  resolveHushSensationChoice,
} from './game/hush-contact.js';
import {
  freshHushNoisePerception,
  hushNoiseForcesDirectContact,
  hushNoiseMapConfirmation,
  updateHushNoisePerception,
} from './game/hush-noise-perception.js';
import * as PROPS from './game/props.js';
import * as CUES from './audio/cues.js';
import { authoredCue, authoredAudioProject, authoredCueUrls, dispatchAuthoredCue } from './audio/authored-cues.js';
import * as STORY from './audio/story-audio.js';
import { battleMusicInit, createBattleMusicSession, nextBattleBarAt, preloadBattleMusic } from './audio/battle-music.js';
import * as FEAR from './audio/fear.js';
import { createSamDialogVoice } from './audio/sam-voice.js';
import { createAudioContextRecovery } from './audio/context-recovery.js';
import { createBackgroundAudioFocusPolicy } from './audio/background-audio.js';
import { runtimeBattle, runtimeTree } from './narrative/runtime-content.js';
import { runtimeChapelBattle, runtimeEndingTree } from './narrative/runtime-endings.js';
import { assetUrl, IS_TAURI } from './platform/paths.js';
import { installDesktopMenuBridge } from './platform/desktop-menu-bridge.js';
import { isReservedDesktopShortcut } from './platform/desktop-menu-actions.js';
import { applyGameModeDom, nextGameModeState } from './platform/game-mode.js';
import { makePauseScene, shouldOpenPauseForEvent } from './game/pause.js';
import { makeGodMenuScene } from './game/god-menu.js';
import { drawFearOverlay } from './game/fear-overlay.js';
import { applyDisplayCssVars, normalizeDisplaySettings, resolveRenderScale } from './platform/display-policy.js';
import { minimizeNativeWindow, quitNativeApp, resetNativeWindow, restoreNativeWindow, setNativeGameMode, setNativeWindowPreset } from './platform/desktop-window.js';
import { applyCurrentStageLayout, installViewportGuard } from './platform/viewport-guard.js';
import { resolveDesktopPaths } from './platform/paths/desktopPaths.js';
import { revealPath } from './platform/diagnostics/desktopDiagnostics.js';
import { runtimeParams, runtimeSnapshot } from './platform/launch.js';
import { APP_COPYRIGHT, APP_LINKS, copyText, formatDiagnosticReport, normalizeAboutSnapshot } from './platform/about-system.js';
import { createPerformanceMeter } from './platform/performance-meter.js';
import { visibleSurfaceSlots } from './net/material-mutation.js';
import { LOOK_PROFILE_IDS } from './render/look-profiles.js';
import { resolveRenderer } from './render/renderer-policy.js';
import * as STAB from './game/stabs.js';
import * as OBJ from './game/objectives.js';
import * as DOC from './game/document.js';
import * as RADIO from './game/radio.js';
import * as PB from './game/playback.js';
import { drawPlaybackOverlay } from './render/playback-view.js';
import { makeCombatScene } from './game/combat.js';
import { makeLoadoutBriefingScene } from './game/loadout-briefing.js';
import { sourceCombatBattle, trainingCombatBattle } from './data/combat-definitions.js';
import { BREAKBEAT_CUE, SCREAM_CUE, enemyAttackShape } from './audio/piano-weapon.js';
import { createCombatTutorialDirector } from './game/combat-tutorial.js';
import { normalizeCombatBuild } from './game/combat-progression.js';
import { availableBattleTools, moveCombatGear, reorderCombatGear } from './game/combat-loadout.js';
import * as ENCOUNTERS from './game/encounters.js';
import * as MIC from './game/mic.js';
import { takeStamp, WORK_ORDER_STAMP } from './game/clock.js';
import { drawMinimap, drawRecorderReturn } from './render/minimap.js';
import { BUILDING_MAP } from './data/building-map.js';
import { captureDoorMapState, captureFloorplanMapSource, buildMapModel } from './game/map-model.js';
import { createHushTelemetry } from './game/hush-telemetry.js';
import { createHushAudioRuntime } from './game/hush-audio-runtime.js';
import { applyHushTorchInterference, hushAbsenceLook, inactiveHushField } from './game/hush-field.js';
import { roomLabel, roomToneCharacter } from './audio/manifest-map.js';
import * as SPEECH from './game/speech.js';
import * as TUT from './game/tutorial.js';
import { objectiveHintsMode, tutorialPromptsEnabled } from './game/access.js';
import { doorWinsWorldInteraction } from './game/interaction-focus.js';
import { makeBagScene } from './game/bag.js';
import { makeColdOpenScene, makeWorldTitleScene } from './game/coldopen.js';
import { makeOpeningCreditsScene } from './game/opening-credits.js';
import {
  createGardenWatchState,
  gardenLayoutForEpoch,
  gardenRecallForLayout,
  shouldNoticeGardenShift,
  tickGardenWatch,
} from './game/garden-drift.js';
import { makeLensCalibrationScene } from './game/lens-calibration.js';
import { makeEulaScene } from './game/eula-scene.js';
import { eulaAccepted, eulaVersion } from './game/eula.js';
import { EULA_TEXT } from './game/eula-text.js';
import { makeWarningScene } from './game/warning.js';
import { createPersonalizedInterference } from './game/personalized-interference.js';
import { computeFearPressure } from './game/fear-pressure.js';
import * as CONTROLLER from './game/controller.js';
import * as BINDINGS from './game/bindings.js';
import { drawPromptParts, promptPartsWidth } from './render/prompt-glyphs.js';
import {
  InputManager,
  keyboardCodeRole,
  keyboardLookAxes,
  keyboardMotionAxes,
  movementCodeForEvent,
  normalizeControlMode,
} from './input/input-manager.js';
import { createPointerModeController } from './input/pointer-mode.js';
import { makeControllerSettingsScene } from './game/controller-settings.js';
import { makeThoughtScene, thoughtHad, markThought,
         loadThoughtState, saveThoughtState } from './game/thoughts.js';
import * as WATER from './game/natatorium-water.js';
import { makeBagLabScene } from './game/bag-lab.js';
import { makeMapLabScene } from './game/map-lab.js';
import { makeHushAudioLabScene } from './game/hush-audio-lab.js';
import { makeDifficultySelectScene } from './game/difficulty-select.js';
import { makeArchiveScene } from './game/archive.js';
import { makeReturnIndexScene } from './game/return-index.js';
import { makeReturnReportScene } from './game/return-report.js';
import { makeAchievementNoticeScene } from './game/achievement-notice.js';
import { makeProgressionLabScene } from './game/progression-lab.js';
import {
  CHUNK_SURF_PHASE,
  canOfferChunkSurf,
  freshChunkSurfState,
  normalizeChunkSurfState,
  reduceChunkSurf,
} from './game/chunk-surf-state.js';
import { createSourceSpaceRuntime, SOURCE_ENTRY } from './game/source-space-runtime.js';
import {
  STAIR_ANOMALY_STATUS,
  freshStairAnomalyLedger,
  normalizeStairAnomalyEnvironment,
  normalizeStairAnomalyLedger,
  reduceStairAnomaly,
  stairAnomalyTriggerMatches,
} from './game/stair-anomaly.js';
import { createStairAnomalyRuntime, STAIR_ANOMALY_ENTRY, STAIR_ANOMALY_MODULE_CELLS } from './game/stair-anomaly-runtime.js';
import { resolveLightingContext, resolveLocalLights } from './data/conservatory-lights.js';
import { buildEmergencyShadowFrame } from './game/emergency-light-runtime.js';
import {
  livePowerCircuits,
  normalizePowerState,
  powerCircuitDefinition,
  powerCircuitForPanel,
  togglePowerCircuit,
} from './game/conservatory-power.js';
import { createElectricalHumRuntime, electricalHumAt } from './audio/electrical-hum.js';
import { resolveTorchLook } from './render/lighting-model.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from './game/chunk-surf-god.js';
import {
  CHAPEL_TOWER_PHASE,
  TOWER_RELAY_REQUIRED_INTERRUPTS,
  TOWER_RELAY_STAGE,
  chapelTowerKeyring,
  freshChapelTowerState,
  normalizeChapelTowerState,
  reduceChapelTower,
  towerObjective,
  towerRelayStage,
} from './game/chapel-tower-state.js';
import { createSourceTowerTransitionScene } from './game/source-tower-transition-scene.js';
import { applyTowerRelayAdvantage } from './game/tower-chapel-bridge.js';
import {
  DOCK_HAUNTING_STATUS,
  DOCK_PORTAL,
  deriveDockHauntingEligibility,
  dockExitAttemptShouldSpeak,
  dockEndingBeat,
  dockHauntingLights,
  dockHauntingMoveScale,
  dockHauntingPressure,
  dockHauntingStaging,
  freshDockTransitState,
  makeLoadingDockHauntingScene,
  normalizeDockHauntingState,
  reduceDockTransit,
} from './game/loading-dock.js';
import { createBellTowerRuntime, createInertBellAssemblyInstances } from './game/bell-tower-runtime.js';
import { createBellTowerAudio } from './audio/bell-tower-audio.js';
import { ELLERY_BELLS } from './data/bell-tower.js';
import { DOOR_ARCHETYPE } from './data/conservatory-doors.js';
import {
  BELL_FRAME_AUTHORED,
  BELL_RELAY_CLAMP_AUTHORED,
  BELL_CHAMBER_ANCHOR,
  CHAPEL_OUTER_CHECKPOINT,
  CHAPEL_SCREEN_AUTHORED,
  ORGAN_LOFT_ANCHOR,
  SHUTTER_WINCH_AUTHORED,
  TOWER_ENTRY,
  TOWER_ENTRY_VIEW,
  TOWER_ROUTE_ANCHORS,
  createBellFrameLayout,
  nearAuthoredRuntime,
} from './data/bell-tower-layout.js';
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

// One semantic feed owns the physical meter. It accepts only player-generated
// events; audible program audio never leaks into the HUSH exposure display.
onAcousticEvent((event)=>MONITOR.monitorObserveAcousticEvent(event));

const APP_VERSION=__APP_VERSION__;
// Bump only when the offline inference payload changes. Unlike APP_VERSION,
// this marker does not make an ordinary game update look like another install.
const LENS_RUNTIME_MARKER='offline-lens-v3-cu128-compel-2';
import { WORK_ORDER, SQUELCH_LINES,
         PAGES, ROOM_CELLS, MAIN_EXIT_CELL, TARGETS, COLD_OPEN, AFTER_TITLE,
         PLANT_RIG_CELL, TALISMAN_CELL,
         PROLOGUE_THOUGHTS, LINES, HIM_LINES, guestLines,
         endingChoice,
         takenLines, foundLine } from './data/conservatory-script.js';
import { loadingDockInvestigation } from './data/loading-dock-investigation.js';
import {
  CHUNK_SURF_ENDING_ID,
  CHUNK_SURF_FLAGS,
  chunkSurfCompletionLines,
  chunkSurfRoom,
  surfacedEnding,
} from './data/chunk-surf-script.js';
export { fx } from './render/canvas.js';

// Canonical studio-authored trees. Only the final choice builder remains on a
// compatibility adapter because it derives prose from live combat proof and
// Source outcome state.
const COLD_OPEN_DIALOGUE=runtimeTree('conservatory.cold_open_dialogue');
const POST_DOOR=runtimeTree('conservatory.post_door');
const LEVEL_CHECK=runtimeTree('conservatory.level_check');
const FIRST_TAKE=runtimeTree('conservatory.first_take');
const HUSH=runtimeTree('conservatory.hush');
const RADIO_DEAD=runtimeTree('conservatory.radio_dead');
const BENT_RIG=runtimeTree('conservatory.bent_rig');
const BUST_TALK=runtimeTree('conservatory.bust_talk');
const BUST_FRAGMENT=runtimeTree('conservatory.bust_fragment');
const BUST_ANSWER=runtimeTree('conservatory.bust_answer');
const BUST_PIN=runtimeTree('conservatory.bust_pin');
const BUST_TURN=runtimeTree('conservatory.bust_turn');
const TALISMAN=runtimeTree('conservatory.talisman');
const CHAPEL_KEY_CHECK=runtimeTree('conservatory.chapel_key_check');
const roomListen=(room,label)=>WATER.applyNatatoriumWaterTextVariant(runtimeTree(`room-listen.${room}`,{label}), room === 'the_tub' ? getSave()?.run : null);
const radioDialogue=(cueId,{roomLabel='the next room'}={})=>runtimeTree(`radio.${cueId}`,{roomLabel,ROOMLABEL:String(roomLabel).toUpperCase()});
const authoredVariant=(named)=>named?'named':'unnamed';
const natatoriumBattle=(named=false)=>WATER.applyNatatoriumWaterTextVariant(runtimeBattle(`battle.natatoriumbattle.${authoredVariant(named)}`), getSave()?.run);
const practiceBattle=(named=false)=>runtimeBattle(`battle.practicebattle.${authoredVariant(named)}`);
const hallBattle=(named=false)=>runtimeBattle(`battle.hallbattle.${authoredVariant(named)}`);
const hallPlayback=(named=false)=>runtimeTree(`playback.hallplayback.${authoredVariant(named)}`);
const practicePlayback=(named=false)=>runtimeTree(`playback.practiceplayback.${authoredVariant(named)}`);
const natatoriumPlayback=(named=false)=>WATER.applyNatatoriumWaterTextVariant(runtimeTree(`playback.natatoriumplayback.${authoredVariant(named)}`), getSave()?.run);
const endingLines=(id)=>runtimeEndingTree(id).start.lines;
const chapelBoss=({kind='nothing',value=null}={})=>{
  let variant='nothing';
  if(kind==='name') variant=value==='Sarah'?'name-sarah':'name-other';
  else if(kind==='reason') variant=value==='money'?'reason-money':value==='superstition'?'reason-superstition':'reason-other';
  else if(kind==='feeling') variant='feeling';
  return applyTowerRelayAdvantage(runtimeChapelBattle(`battle.chapel.${variant}`),chapelTowerState());
};
const sacrificeEnding=({injuries=0,named=false}={})=>endingLines(`ending.sacrifice.${authoredVariant(named)}.injuries-${Math.max(0,Math.min(5,Math.floor(Number(injuries)||0)))}`);
const INVERT_START=endingLines('ending.inversion-start');
const FALSE_DOOR=endingLines('ending.false-door');
const rescueEnding=(named=false)=>endingLines(`ending.rescue.${authoredVariant(named)}`);
const INVERSION_FINAL=endingLines('ending.inversion-final');
const helpedEnding=({named=false}={})=>endingLines(`ending.helped.${authoredVariant(named)}`);
const druggedReveal=({takes=5}={})=>endingLines(`ending.drugged.${Number(takes)>=5?'complete':'partial'}`);
const guardEpilogue=(variant='out')=>endingLines(`ending.epilogue.${['out','client','nobody','helped','drugged','surfaced'].includes(variant)?variant:'out'}`);

// The authored game is always first-person 3D. Canvas/DOM survive only as
// explicit development diagnostics and cannot be selected in a release.
const params = () => runtimeParams();
const KEY_DEBUG = params().has('keydebug');
const NO_THINK = params().has('nothink');
const D = (n) => n * CELL_SCALE;
const SCALED_MOVE_MIN = (n) => Math.max(1, Math.round(n / CELL_SCALE));
const RENDERER = resolveRenderer(params().get('renderer'), {development:!!import.meta.env?.DEV});

// ── State ─────────────────────────────────────────────────────────────────────
let actx=null;
let audioRecovery=null;
let backgroundAudioPolicy=null;
let voices=new Map(); // chunkIdx -> {src,gain,dur,startedAt,target}
let ambientDrone=null; // {src,lfo,filt,gain,target}
let worldLayerVoice=null; // {srcA,srcB,gain,dur,startedAt,target,chunkIdx,worldId}
let worldDroneBanks=new Map(); // worldId -> {all:[chunkIdx], byBiome:{biome:[chunkIdx]}}
let paused=false, looping=true;
let inRogue=false, raf=null, tick=0;
// Asset loading may construct the retired field, but only the explicit JUST
// SURF lab can authorize it. Story uses authored room/cue systems.
let sampleFieldEnabled=false;
const godFxOverride={heartbeat:null,monitorHiss:null,visualDread:null};
let godMenuWasPaused=false;
let godDoorDebug=false;
const perfMeter=createPerformanceMeter();
const personalInterference=createPersonalizedInterference();
let bootLog=[];
let chunks=[]; // {idx,label,charId,name,buffer,analysis,biome,worldId,biomeId,terrainRadius,baseVol,wx,wy,heard}
let worlds=[]; // template metadata by world id
let worldTemplates=new Map(); // worldId -> {id,label,width,height,terrain,sampleIdxs,region,biomes}
// idx (file index) -> chunk. `chunks` is in LOAD order, so chunkAt(idx) is only
// valid once all 300 files are in. Early callers (enterRogue fires at 14) were
// reading undefined and taking the world build down with them.
let chunkByIdx=new Map();
const chunkAt=(i)=>chunkByIdx.get(i);
const motionInput = new InputManager();
motionInput.setControllerStateProvider(()=>CONTROLLER.controllerMotionAxes());
let keysDown=motionInput.held;
let nextMoveAtMs=0;
let nextTurnAtMs=0;
let motionResetReason='boot';
let desktopGameMode={enabled:false,previousWindowPreset:'1280x800',enteredAt:null};
let desktopMuteRestoreVolume=null;

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
let motionRig=null;              // spring-smoothed first-person camera rig
let lastStepDx=0;
let lastStepDy=0;
let buildingPresenceNavigation=null;
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
const SW2_AUDIO_URL = assetUrl('audio/game/hapax-recording.mp3');
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
const HUSH_CONTACT_ASSET=Object.freeze({
  id:'hush-surfer-contact',
  url:assetUrl('story-art/surfer.png'),
});
let hushContactStyleInstalled=false;
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
let electricalHumRuntime=null;
let electricalHumFrame={audible:false,gain:0,pan:0,circuits:[],primary:null,sources:[]};
let hushFieldFrame=inactiveHushField();
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

// MUSIC: title, intro, authored scene scores, and the battle-score director.
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
function ensureCtx({resume=true}={}){
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
        battleMusicInit(actx, musicGain);
        CUES.cuesInit(actx, sfxDirectGain);
        // Heartbeat and hush stinger bypass the HUSH field entirely. Routed
        // through sfxGain they went into hushAudioMix.worldInput, which the
        // presence ducks to 10% behind a 620Hz lowpass at close range — so the
        // contact stinger was being silenced by the very thing it announces.
        FEAR.fearAudioInit(actx, dialogGain);
        // The transparent monitor node remains in the audible graph, but its
        // display is fed only by semantic player noise and optional room-mic
        // RMS. Program audio is never treated as HUSH exposure.
        MONITOR.monitorSetAuxInput(()=>MIC.micActive()?MIC.micMeasurement():0);

        CUES.preloadAll(authoredCueUrls({excludeCuePrefixes:['battle.']}));
        preloadBattleMusic();
        preloadPropStems();
        STORY.preloadAll();
        electricalHumRuntime=createElectricalHumRuntime({context:actx,destination:sfxGain});
        audioRecovery?.bind(actx);
    }catch(err){
      audioInitFailed=true;
      console.error('AudioContext init failed', err);
      return;
    }
  }
  if(resume && actx && actx.state!=='running' && actx.state!=='closed'){
    actx.resume().catch((err)=>{
      console.warn('AudioContext resume blocked', err);
    });
  }
  return actx;
}

audioRecovery=createAudioContextRecovery({
  getContext:()=>actx,
  ensureContext:()=>ensureCtx({resume:false}),
  shouldRecover:()=>backgroundAudioPolicy?.shouldRecover() ?? true,
  onRunning:()=>{ if(!paused) applyAudioSettings(); },
  onError:(err,reason)=>console.warn(`${reason}: audio resume blocked`,err),
});
backgroundAudioPolicy=createBackgroundAudioFocusPolicy({
  getContext:()=>actx,
  getMode:()=>getSave().settings?.backgroundAudio,
  getDocument:()=>document,
  recover:(reason)=>audioRecovery?.recover(reason),
  onError:(err,reason)=>console.warn(`${reason}: audio suspend blocked`,err),
});
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
  return !sampleFieldEnabled
    || scenes.has('opening-credits')
    || scenes.has('title')
    || scenes.has('cold-open')
    || scenes.has('world-title')
    || scenes.has('credits');
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
    HUSH_JUMP_EL.classList.remove('active','blink','contact-hit','taken-hit');
    HUSH_JUMP_EL.removeAttribute('data-hush-contact-reason');
  }
}

function ensureHushContactStyle(){
  if(hushContactStyleInstalled || typeof document==='undefined') return;
  hushContactStyleInstalled=true;
  const style=document.createElement('style');
  style.id='chunk-surfer-hush-contact-style';
  style.textContent=`
#hushJump{
  background-image:url("${HUSH_CONTACT_ASSET.url}");
  background-size:cover;
  background-position:50% 50%;
  background-repeat:no-repeat;
  pointer-events:none;
}
#hushJump.contact-hit{
  /* It slams and it STAYS. The previous curve spent most of its runtime at
     0.12-0.55 opacity while scaling and inverting, which is a compositing
     exercise, not a scare: the face was never legibly on screen for a single
     frame. It is now opaque for the whole window with two hard cuts in it. */
  /* Hold the picture. No strobing to near-zero opacity, no darkening filters
     that turn a face into a black rectangle — it is simply THERE, filling the
     frame, and then it is gone. */
  animation:hush-contact-hit 700ms linear both;
  will-change:opacity,transform;
  z-index:21;
}
#hushJump.taken-hit{
  animation-duration:880ms;
}
@keyframes hush-contact-hit{
  0%{opacity:0;transform:scale(1.14);}
  4%{opacity:1;transform:scale(1.02);}
  88%{opacity:1;transform:scale(1.0);}
  100%{opacity:0;transform:scale(1.0);}
}`;
  document.head?.appendChild(style);
}

function ensureHushJumpSurferElement(){
  if(!HUSH_JUMP_EL) return null;
  ensureHushContactStyle();
  HUSH_JUMP_EL.textContent='';
  HUSH_JUMP_EL.style.backgroundImage=`url("${HUSH_CONTACT_ASSET.url}")`;
  HUSH_JUMP_EL.style.backgroundSize='cover';
  HUSH_JUMP_EL.style.backgroundPosition='50% 50%';
  HUSH_JUMP_EL.style.backgroundRepeat='no-repeat';
  HUSH_JUMP_EL.dataset.hushContactAsset=HUSH_CONTACT_ASSET.id;
  return HUSH_JUMP_EL;
}

function assertHushJumpSurferAsset(el=HUSH_JUMP_EL){
  if(!el) return false;
  const bg=getComputedStyle(el).backgroundImage || '';
  const inline=el.style?.backgroundImage || '';
  const ok=el.dataset.hushContactAsset===HUSH_CONTACT_ASSET.id
    && /surfer\.png(?:$|[?#"')])/.test(`${bg} ${inline}`);
  if(!ok){
    console.error('[hush-contact] illegal visual refused',{
      expected:HUSH_CONTACT_ASSET.url,
      assetId:el.dataset.hushContactAsset || null,
      backgroundImage:bg,
      inlineBackground:inline,
      outerHTML:el.outerHTML,
    });
    el.classList.remove('active','blink','contact-hit','taken-hit');
    return false;
  }
  return true;
}

function clearHushJumpClasses(){
  if(!HUSH_JUMP_EL) return;
  HUSH_JUMP_EL.classList.remove('blink','active','contact-hit','taken-hit');
}

function armHushJump({durationMs=460, reason='surfer-signal', contact=false, taken=false}={}){
  // The daydream is not real — nothing has started, so nothing hunts.
  // The tutorial owns the recordist's imagination here; the building only learns
  // someone is in it at the first REAL take, after setup is done.
  if(TUT.tutorialActive()) return false;
  const el=ensureHushJumpSurferElement();
  if(!assertHushJumpSurferAsset(el)) return false;
  clearHushJumpClasses();
  el.dataset.hushContactReason=reason;
  void el.offsetWidth;
  el.classList.add('active');
  if(contact) el.classList.add('contact-hit');
  if(taken) el.classList.add('taken-hit');
  if(hushJumpTimer!==null) clearTimeout(hushJumpTimer);
  hushJumpTimer=setTimeout(()=>{
    if(HUSH_JUMP_EL){
      HUSH_JUMP_EL.classList.remove('active','contact-hit','taken-hit');
      HUSH_JUMP_EL.removeAttribute('data-hush-contact-reason');
    }
    hushJumpTimer=null;
  }, Math.max(100, Number(durationMs)||460));
  return true;
}

function showSurferJumpscare(durationMs=460){
  armHushJump({durationMs, reason:'surfer-signal'});
}

function showHushContactFlash({reason='contact',intensity=1,durationMs=700,blackout=false,stinger=true}={}){
  const hit=armHushJump({durationMs, reason, contact:true, taken:!!blackout});
  const amt=Math.max(0, Math.min(1.5, Number(intensity)||1));
  if(stinger) FEAR.hushStinger?.(amt);
  const flashAlpha=blackout ? 0.96 : 0.82;
  const flashMs=blackout ? 160 : 120;
  CR.fx.flash(flashMs, `rgba(225,244,238,${flashAlpha})`);
  setTimeout(()=>CR.fx.flash(90, blackout ? 'rgba(0,0,0,0.92)' : 'rgba(10,10,12,0.78)'), 80);
  CR.fx.shake(blackout ? 3.2 : 2.2, blackout ? 700 : 520);
  CR.fx.glitch(blackout ? 1 : 0.82, blackout ? 560 : 420);
  applyLensPreset('rupture');
  possess('rupture', blackout ? 4 : 2);
  if(navigator.vibrate) navigator.vibrate(blackout ? [18,24,180,30,220] : [12,20,120,24,160]);
  return hit;
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
  showSurferJumpscare();
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

function maybeLockHushFromInputDelta(dx,dy,nowMs=performance.now()){
  if(!isHorrorActive() || !hush.active || depth>1 || isOnboardingActive() || doorRevealCutscene) return false;
  if(!dx&&!dy)return false;

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
  // The impossible stair is walked exactly like any real stair — the ordinary
  // move interval, no throttle. It is long, not slow.
  if(usingStairAnomaly())return MOVE_MS * storyMoveScale();
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
  if(dockHauntingFrame&&!dockHauntingFrame.resolved){
    ms*=dockHauntingMoveScale(dockHauntingFrame.pressure);
    return Math.round(clamp(ms,SCALED_MOVE_MIN(44),SCALED_MOVE_MIN(480)));
  }
  // Keep motion responsive; difficulty is mostly handled by sink/lateral drag.
  return Math.round(clamp(ms, SCALED_MOVE_MIN(44), SCALED_MOVE_MIN(120)));
}

function currentTurnIntervalMs({ initial=false }={}){
  const base=storyMode ? 185 : 150;
  return initial ? Math.max(260, Math.round(base*1.85)) : base;
}
function resetMotionInput(reason='reset-motion', { stopRenderMove=false }={}){
  motionInput.reset(reason);
  keysDown=motionInput.held;
  nextMoveAtMs=0;
  nextTurnAtMs=0;
  motionResetReason=reason;
  lastLoopMs=0;
  if(stopRenderMove){
    renderMove=null;
    snapMotionRig(reason);
  }
  REC.setSlow(false);
}
function clearMotionClock(reason='clear-motion-clock'){
  nextMoveAtMs=0;
  nextTurnAtMs=0;
  motionResetReason=reason;
}
function recoverMotionFocus(reason='motion-focus'){
  // Focus transitions are not locomotion. Always discard stale held state and
  // let the next real keydown rebuild movement from scratch; preserving a key
  // across WebView focus ordering is what made alt-tab recovery intermittent.
  lastLoopMs=0;
  renderMove=null;
  snapMotionRig(reason);
  resetMotionInput(reason,{stopRenderMove:true});
}

function recoverInteractionAudio(reason='interaction-focus'){
  if(audioInitFailed) return;
  return backgroundAudioPolicy?.sync(reason) ?? audioRecovery?.recover(reason);
}

function recoverInteractionFocus(reason='interaction-focus'){
  recoverMotionFocus(reason);
  recoverInteractionAudio(reason);
  refreshStageLayoutSoon();
  ensureInteractionFocus();
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
  updateElectricalHum();
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
  // Exception: the tutorial level check never fails — it teaches the posture, it
  // does not punish you for it, so the guided sequence can always complete.
  if(storyMode && REC.isRecording() && !REC.isStalled() && !TUT.tutorialActive()) REC.spoilTake('you moved');
  const nowMs=performance.now();
  if(stairTriggerCrossed(dx,dy)){beginStairAnomaly();return;}
  // The first threshold. Until the levels are set and the six seconds held — both
  // of which happen right here, on the dock, in the dark — the recordist does not
  // walk out. This is not a locked door; it is the man's own discipline, and he
  // says which half of the job is still open when you try it. The bag's guided
  // callout and the level-check prompt are what make it satisfiable without
  // leaving (see tutorialGuide / firstTakeIntercept).
  if(storyMode && !setupComplete() && usingPlan() && !usingSpecialSpace()
     && FP.zoneAt(px,py)===ZONE.dock && FP.zoneAt(px+dx,py+dy)!==ZONE.dock){
    const yaw=mapHeading(),forward=[Math.sin(yaw),-Math.cos(yaw)],stepLength=Math.max(.001,Math.hypot(dx,dy));
    const forwardIntent=(dx*forward[0]+dy*forward[1])/stepLength;
    const crossed=FP.doorAt(px,py)||FP.doorAt(px+dx,py+dy)||FP.doorNear(px,py,[dx/stepLength,dy/stepLength],3.5)?.portal;
    // Always hold the setup boundary. Speak only when the player deliberately
    // walks forward through an actual exit; brushing the zone seam or strafing
    // beside a leaf should not summon the tutorial line.
    refuseDockExit({speak:dockExitAttemptShouldSpeak({forwardIntent,hasDoor:!!crossed})}); return;
  }
  // Geometry blocks the step. In the conservatory this is a body test — a wall,
  // a lintel you would brain yourself on, a riser too tall to take — and it
  // reads from the same array the shader draws from.
  let planRedirect=null;
  if(RENDERER==='3d' && depth===0){
    if(usingPlan()&&!usingSpecialSpace()){
      const fromZone=FP.zoneAt(px,py),toZone=FP.zoneAt(px+dx,py+dy),tower=chapelTowerState();
      const crossesInnerScreen=(fromZone===ZONE.chapelOuter&&toZone===ZONE.chapel)||(fromZone===ZONE.chapel&&toZone===ZONE.chapelOuter);
      if(crossesInnerScreen&&![CHAPEL_TOWER_PHASE.TOWER_CLEARED,CHAPEL_TOWER_PHASE.CHAPEL_FINAL].includes(tower.phase)){
        pushEvent('// the inner chapel screen is secured from the tower side.');
        return;
      }
    }
    if(activeGeometry()){
      const geometry=activeGeometry();
      // A diagonal step is only legal if BOTH of its orthogonal halves are, or
      // you would slip through the corner where two walls meet — a gap that is
      // solid to the eye and to the shader. If only one half is walkable, the
      // step degrades to that half rather than refusing: you slide along the
      // wall instead of sticking to it, which is what a shoulder does.
      if(dx&&dy){
        const alongX=geometry.canStep(px, py, px+dx, py, { keys: playerKeys }).ok;
        const alongY=geometry.canStep(px, py, px, py+dy, { keys: playerKeys }).ok;
        if(!(alongX&&alongY)){
          if(alongX) dy=0;
          else if(alongY) dx=0;
          else return;
        }
      }
      const move=geometry.canStep(px, py, px+dx, py+dy, { keys: playerKeys });
      if(!move.ok){
        if(move.why==='locked') pushEvent('// locked. none of your keys.');
        else if(move.why==='closed') pushEvent('// closed. [E] open.');
        else if(move.why==='bricked') pushEvent('// bricked up. it was a door once.');
        return;
      }
      planRedirect=move.redirect||null;
      const tx=planRedirect?.x??px+dx,ty=planRedirect?.y??py+dy;
      if(!usingSpecialSpace()&&natatoriumWaterBlocksAt(tx,ty)) return;
      if(!usingSpecialSpace()&&!PROPS.propCanOccupy(tx,ty)) return;
    } else if(R3.r3dSolid(px+dx, py+dy)) return;
    else if(dx&&dy&&(R3.r3dSolid(px+dx,py)||R3.r3dSolid(px,py+dy))){
      // Same corner rule for the plain solid-grid path.
      if(!R3.r3dSolid(px+dx,py)) dy=0; else if(!R3.r3dSolid(px,py+dy)) dx=0; else return;
    }
  }
  // Your feet are the loudest thing in this building. The noise is left at the
  // cell you are leaving: the presence hunts where you WERE.
  if(storyMode){
    const level=REC.emitStepNoise(px, py);
    RT.footstep(level);
    if(usingStairAnomaly())scheduleStairStepEcho(level);
    // Sound pins the building. Where you were loud, it stays honest.
    if(usingPlan()&&!usingSpecialSpace()) MUT.markHeard(px, py, Math.min(1, level*3));
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
  const stepFrom={x:px,y:py};
  const nx=planRedirect?.x??px+sx;
  const ny=planRedirect?.y??py+sy;
  if(nx===px&&ny===py) return;
  if(isOnboardingActive() && !canMoveInOnboarding(nx,ny,sx,sy)) return;
  beginRenderStep(nx,ny,nowMs);
  lastMoveAtMs=nowMs;
  px=nx; py=ny; stepCount++;
  if(storyMode&&usingPlan()&&!usingSpecialSpace())noteDockTransitStep(stepFrom,{x:px,y:py});
  // Contact is a spatial threshold, so resolve it on the movement frame that
  // actually crossed the body rather than waiting for the next render tick.
  if(dockHauntingScene) dockHauntingScene.update(0);
  if(usingPlan()&&!usingSpecialSpace()&&FP.logicalToPhysical(px,py).renderGroup==='academic'&&!flagGet('academic.entered')){
    flagApply(['academic.entered']);
    facilityMapCache={key:null,model:null};
  }
  if(usingStairAnomaly()){
    stairAnomalyRuntime.onStep(stepFrom,{x:px,y:py,facing:R3.r3dFacing()});
    if(!usingStairAnomaly())return;
    stairAnomalyRuntime.setPlayerPosition({x:px,y:py,facing:R3.r3dFacing()});
    lastStepDx=sx;lastStepDy=sy;trail.push({x:px,y:py});if(trail.length>TRAIL_LEN)trail.shift();
    syncStairAnomalyRender();
    updateAudio();return;
  }
  if(usingSourceSpace()){
    chunkSurfRuntime.onStep({x:px-sx,y:py-sy},{x:px,y:py,facing:R3.r3dFacing()});
    chunkSurfRuntime.setPlayerPosition({x:px,y:py,facing:R3.r3dFacing()});
    lastStepDx=sx;lastStepDy=sy;
    trail.push({x:px,y:py});if(trail.length>TRAIL_LEN)trail.shift();
    syncSourceRender();
    saveCommit({px,py,steps:stepCount,area:'source-space',chunkSurf:chunkSurfRuntime.state()});
    updateAudio();
    return;
  }
  if(storyMode&&usingPlan())saveCommit({px,py,steps:stepCount,area:'conservatory',flags:getSave().flags});
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

function currentControlMode(){return 'direct';}
// One scheme now: the body always walks, the camera is always mouse/right-stick.
function independentControls(){return RENDERER==='3d';}
function combinedIndependentMotionAxes(){
  const keyboard=keyboardMotionAxes(keysDown),controller=CONTROLLER.controllerMotionAxes();
  return{
    moveX:clamp(keyboard.moveX+controller.moveX,-1,1),
    moveY:clamp(keyboard.moveY+controller.moveY,-1,1),
  };
}
function movementIntentActive(){
  if(!independentControls())return!!(forwardHeld()||backHeld());
  const axes=combinedIndependentMotionAxes();
  return Math.max(Math.abs(axes.moveX),Math.abs(axes.moveY))>=.32;
}
function arrowDelta(){
  if(RENDERER==='3d'){
    if(independentControls()){
      const axes=combinedIndependentMotionAxes();
      if(Math.max(Math.abs(axes.moveX),Math.abs(axes.moveY))<.32)return[0,0];
      const forward=R3.r3dStepDelta(1),right=[-forward[1],forward[0]];
      // Collision remains cardinal and deterministic: the dominant input axis
      // wins instead of allowing analog diagonals to cut through wall corners.
      if(Math.abs(axes.moveY)>=Math.abs(axes.moveX)){
        const sign=axes.moveY>=0?1:-1;return[forward[0]*sign,forward[1]*sign];
      }
      const sign=axes.moveX>=0?1:-1;return[right[0]*sign,right[1]*sign];
    }
    // Head-relative grid steps. Eight directions, from the live yaw rather than
    // the quarter-turn index: if you turn your head and walk, you turn your feet.
    if(forwardHeld()) return R3.r3dStepDelta(1);
    if(backHeld()) return R3.r3dStepDelta(-1);
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
  if(usingSpecialSpace()){
    const p=activeGeometry().logicalToPhysical(x,y);
    return{x:p.x,z:p.z};
  }
  if(usingPlan()){
    const p=FP.logicalToPhysical(x,y);
    return{x:p.x,z:p.z};
  }
  return{x,z:y};
}
function motionTargetPoint(){
  return renderMove?.to || physicalPointFor(px,py);
}
function snapMotionRig(reason='snap-motion-rig'){
  const p=physicalPointFor(px,py);
  motionRig={x:p.x,z:p.z,vx:0,vz:0,lastMs:performance.now(),reason};
  return motionRig;
}
function ensureMotionRig(now=performance.now()){
  if(!motionRig) return snapMotionRig('init-motion-rig');
  if(!Number.isFinite(motionRig.x)||!Number.isFinite(motionRig.z)) return snapMotionRig('invalid-motion-rig');
  if(!Number.isFinite(motionRig.lastMs)) motionRig.lastMs=now;
  return motionRig;
}
function renderedPlayerPoint(now=performance.now()){
  const target=motionTargetPoint();
  const rig=ensureMotionRig(now);
  const jumpDist=Math.hypot(target.x-rig.x,target.z-rig.z);
  // Teleports, level repairs, scene exits and save restores must snap. Inertia
  // is a camera feel layer, not permission to coast through walls.
  if(jumpDist>D(3.25)){
    renderMove=null;
    return snapMotionRig('motion-target-jump');
  }
  const dt=Math.max(0,Math.min(0.05,(now-rig.lastMs)/1000));
  rig.lastMs=now;

  const held=movementIntentActive();
  const dx=target.x-rig.x;
  const dz=target.z-rig.z;
  const stiffness=held ? 92 : 62;
  const damping=held ? 15.5 : 18.5;
  rig.vx += dx*stiffness*dt;
  rig.vz += dz*stiffness*dt;
  const damp=Math.exp(-damping*dt);
  rig.vx *= damp;
  rig.vz *= damp;
  rig.x += rig.vx*dt;
  rig.z += rig.vz*dt;

  const remaining=Math.hypot(target.x-rig.x,target.z-rig.z);
  const speed=Math.hypot(rig.vx,rig.vz);
  if(remaining<0.002&&speed<0.004){
    rig.x=target.x; rig.z=target.z; rig.vx=0; rig.vz=0;
    if(renderMove) renderMove=null;
  } else if(renderMove && now-renderMove.startedAt>renderMove.durationMs*4){
    // The spring is now the source of visual motion; don't let stale metadata
    // make future teleports look like walking.
    renderMove=null;
  }
  return{x:rig.x,z:rig.z};
}
function beginRenderStep(nx,ny,now){
  ensureMotionRig(now);
  renderMove={
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
  if(nextMoveAtMs<=0){
    maybeLockHushFromInputDelta(dx,dy,now);
    step(dx,dy);
    armHeldMovement(now);
    return;
  }
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
  if(paused===next){
    syncPointerMode(next ? 'pause-still-on' : 'pause-still-off');
    return;
  }
  paused=next;
  resetMotionInput(paused ? 'pause-enter' : 'pause-exit', {stopRenderMove:paused});
  syncPointerMode(paused ? 'pause-enter' : 'pause-exit');
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
    // Coming back from the pause menu is the single most common way to end up
    // focused-but-not-captured, so take everything back explicitly.
    resumeGameplayInput('pause-exit');
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
let developmentWindowMarker='';
let developmentWindowMarkerPending=false;
const WORLD_HIDDEN_SCENES=Object.freeze([
  'lens-calibration',
  'opening-credits',
  'title',
  'credits',
  'return-report',
]);

function scenePresentationHidesWorld(){
  return WORLD_HIDDEN_SCENES.some((id)=>scenes.has(id));
}

function updateDevelopmentWindowMarker(){
  if(!import.meta.env?.DEV)return;
  const scene=scenes.top()?.id || (inRogue?'game':'boot');
  const marker=`Chunk Surfer · ${APP_VERSION} DEV · ${scene}`;
  if(marker===developmentWindowMarker || developmentWindowMarkerPending)return;
  developmentWindowMarker=marker;
  document.title=marker;
  if(!IS_TAURI)return;
  developmentWindowMarkerPending=true;
  import('@tauri-apps/api/window')
    .then(({getCurrentWindow})=>getCurrentWindow().setTitle(marker))
    .catch((error)=>console.warn('[desktop] development title marker failed',error))
    .finally(()=>{developmentWindowMarkerPending=false;});
}

// A frame gap longer than this means the player was not at the game.
const AWAY_GAP_MS=900;
function settleAfterAway(gapMs){
  STAB.settleAfterAway(gapMs);
  // The hush's schedules are wall-clock too: push them out by exactly as long
  // as nobody was watching, so returning to the window is never the cue.
  if(mischiefNextAtMs) mischiefNextAtMs+=gapMs;
  if(mischiefQuietUntilMs) mischiefQuietUntilMs+=gapMs;
}

function loop(){
  try{
    tick++;
    if(IS_TAURI && (tick % 120)===0) audioRecovery?.watchdog('tauri-frame-watchdog');
    const nowLoopMs=performance.now();
    perfMeter.frame(nowLoopMs);
    const rawGapMs=lastLoopMs ? nowLoopMs-lastLoopMs : 16;
    const dt=Math.min(0.05, lastLoopMs ? rawGapMs/1000 : 0.016);
    lastLoopMs=nowLoopMs;
    // A frame that took most of a second did not happen: the tab was hidden, the
    // window was behind something, the machine slept. Wall-clock timers kept
    // running through it and the dread director did not — so on the way back it
    // believed the player had spent all that time getting comfortable, and fired
    // the moment they returned. Nothing accrues while nobody is here.
    if(rawGapMs>AWAY_GAP_MS) settleAfterAway(rawGapMs);
    const modal = scenes.top?.();
    const modalControllerActions = (() => {
      const id = modal?.id || '';
      if (id.startsWith('battle:')) return ['recorder'];
      if (id === 'chunk-surf') return ['light', 'recorder', 'interact'];
      return [];
    })();
    CONTROLLER.gamepadTick({
      menuContext: scenes.blocksInput(),
      independentMotion: independentControls() && inRogue,
      modalActions: modalControllerActions,
      onPress: controllerPress,
      onRelease: controllerRelease,
    });
    if(inRogue){
      // Keep keyboard focus on the play surface to avoid intermittent movement deadlocks.
      if((tick % 10)===0) ensureInteractionFocus();
      // One frame clock owns held turning and movement. Browser key-repeat
      // and focus transitions never become hidden locomotion timers.
      tickIndependentLook(dt);
      tickHeldTurning(nowLoopMs);
      tickHeldMovement(nowLoopMs);
      if(!scenes.blocksWorld()){
        maybeSpawnScheduledKey();
        updateHorrorTick();
        tickRecorder(dt);
        tickRoomMicAcoustics(dt);
        tickHushNoisePerception(dt);
        tickHushAudio(dt);
        tickChunkSurfOffer();
        tickSourceSpace(dt);
        tickStairAnomaly(dt);
        tickDoorRuntime(dt);
        speakAtExitDoor();
        tickBellTower(dt);
        tickPresence(dt);
        tickHushMischief();
        tickGarden();
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
          tickMicTest(dt);
          TUT.tickTutorial(dt, tutorialCtx());
          // Fallback for a skipped/absent intro tutorial: a clean six-second take
          // at B3 sets levels and drifts into the daydream regardless, so the
          // hard gate can always be cleared.
          if(!flagTest('setup.levels') && currentWorld()==='main_b3'
             && REC.isRecording() && !REC.isStalled()
             && (REC.recState().takeElapsed||0) >= TUT.LEVEL_CHECK_SECONDS){
            onLevelsSet();
          }
        }
      }
      // Calibration, opening/title presentation, and credits fully cover the
      // playfield. Rendering the hidden WebGL world here steals the same GPU
      // time needed to upload the critical material bank, which made startup
      // dramatically slower on software/fallback renderers. Keep the world
      // state frozen as before, and resume drawing when the presentation ends.
      if(RENDERER==='3d'){
        if(!scenePresentationHidesWorld()) render3d();
      }else renderMap();
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
    if(storyMode && inRogue) drawFearOverlay(presentedFearPressure(), nowLoopMs);
    scenes.render();
    updateDevelopmentWindowMarker();
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
let lastUnexpectedPointerUnlockAt=0;
let activeDifficulty=currentDifficulty();
let facilityMapSource=null;
let facilityMapCache={key:'',model:null};
const HUSH_MAP_TELEMETRY=createHushTelemetry({label:BUILDING_MAP.contact.label});
let natatoriumBasinBounds=null;

const pointerMode=createPointerModeController({
  documentRef:document,
  getTargetElement:()=>MAP_EL,
  input:motionInput,
  getState:()=>({
    renderer:RENDERER,
    storyMode,
    inRogue,
    paused,
    blocksInput:scenes.blocksInput(),
  }),
  onUnexpectedUnlock:()=>{
    lastUnexpectedPointerUnlockAt=performance.now();
    if(storyMode&&inRogue&&!paused&&!scenes.blocksInput()) openPauseMenu({fromPointerUnlock:true});
  },
});

function currentNatatoriumWaterRun(){
  return getSave()?.run || null;
}

function natatoriumWaterActive(){
  return WATER.natatoriumWaterActive(currentNatatoriumWaterRun()) && !!natatoriumBasinBounds;
}

function natatoriumWaterBlocksAt(x,y){
  // Compatibility seam: pool water no longer blocks entry in any run state.
  return WATER.natatoriumWaterBlocks(currentNatatoriumWaterRun(), x, y, natatoriumBasinBounds);
}

function currentNatatoriumWaterRenderState({ audio = 0 } = {}){
  if(!natatoriumWaterActive()) return { active:false };
  return {
    active:true,
    basinBounds:natatoriumBasinBounds,
    levelM:0.015,
    murk:0.86,
    rippleSources:WATER.makeNatatoriumRippleSources({
      run:currentNatatoriumWaterRun(),
      player:{x:px,y:py},
      bounds:natatoriumBasinBounds,
      now:performance.now(),
      audio,
      reduceMotion:(getSave().settings?.shake||'full')!=='full',
    }),
    reduceMotion:(getSave().settings?.shake||'full')!=='full',
  };
}

function applyCurrentRunDifficulty(){
  activeDifficulty=currentDifficulty();
  PRES.configurePresence(activeDifficulty.presence);
  REC.configureDifficulty({
    ...activeDifficulty.recording,
    torchDrainScale:activeDifficulty.torch.drainScale,
  });
  return activeDifficulty;
}

let activeLookProfile='explore';
let lookApplySerial=0;
let lookApplyQueue=Promise.resolve();
function applyLookProfile(name='explore',options={}){
  const profiles=window.__lookProfiles||{};
  const profile=profiles[name]||profiles.explore;
  if(!profile)return null;
  const serial=++lookApplySerial;
  activeLookProfile=profile.id||name;
  const transitionMs=Number(options.transitionMs??profile.transitionMs)||0;
  const applyLayers=()=>{
    if(serial!==lookApplySerial)return;
    R3.r3dSetLookProfile?.(activeLookProfile,{transitionMs,resetMemory:!!options.resetMemory});
  };
  const diffusion=window.__diffusion;
  if(diffusion?.activateBank){
    lookApplyQueue=lookApplyQueue.catch(()=>{}).then(async()=>{
      if(serial!==lookApplySerial)return false;
      const committed=await diffusion.activateBank(profile.bankId||activeLookProfile,{
        transitionMs,
        shouldCommit:()=>serial===lookApplySerial,
      });
      if(serial===lookApplySerial)applyLayers();
      return committed;
    }).catch((error)=>console.error(`look bank ${profile.bankId} failed`,error));
  }else applyLayers();
  return profile;
}
// One-release compatibility for probes and older scene metadata.
function applyLensPreset(name){ return applyLookProfile(name); }

// Which building is loaded. Content beats belong to the conservatory; the
// testbed is a geometry proof and must stay free of them.
let planName='';
let chunkSurfRuntime=null;
let stairAnomalyRuntime=null;
let stairPresenceSnapshot=null;
let stairAttentionScene=null;
const stairEnvironmentalTimers=new Set();
let stairEchoSerial=0;
let sourceExitSnapshot=null;
let sourcePaperToneAt=0;
let sourceAlignmentToneAt=0;
let sourceHallDreadAt=0;
let sourcePresenceWasActive=false;
let sourceFinalCombatOpen=false;
let sourceFinalCombatRetryAt=0;
let bellTowerRuntime=null;
let bellTowerAudio=null;
let inertBellTowerInstances=null;
let bellTowerImpactActive=false;
let bellTowerCollisionEnabled=true;
let towerPreviousPlayerCapsule=null;
const towerPlayerCapsules=[
  {x:0,z:0,minY:0,maxY:0,radius:.28},
  {x:0,z:0,minY:0,maxY:0,radius:.28},
];
const towerPlayerSweep={previous:null,current:null};
let towerCapsuleWriteIndex=0;
let sourceTowerTransition=null;
const BUILDING_LOADERS=Object.freeze({
  conservatory:()=>import('./data/floorplan/conservatory.js'),
  testbed:()=>import('./data/floorplan/testbed.js'),
});

function doorMatMultiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
function doorTransform(x,y,z,yaw=0,scaleX=1){const c=Math.cos(yaw),s=Math.sin(yaw);return new Float32Array([c*scaleX,0,s*scaleX,0,0,1,0,0,-s,0,c,0,x,y,z,1]);}
function doorLeafMatrix(door,center,leafIndex,fraction){
  const pair=door.leafCount===2,left=pair?leafIndex===0:door.hinge!=='right';
  const hingeLocal=left?-door.aperture.width/2:door.aperture.width/2;
  const yaw=door.widthAxis==='x'?0:Math.PI/2,hingeX=center.x*CELL+Math.cos(yaw)*hingeLocal,hingeZ=center.z*CELL+Math.sin(yaw)*hingeLocal;
  const inward=String(door.swing).includes('in')?-1:1,angle=(left?-1:1)*inward*Math.PI*.49*fraction;
  return doorMatMultiply(doorTransform(hingeX,center.y,hingeZ,yaw),doorTransform(0,0,0,angle,left?1:-1));
}
const doorLeafVisualCache={group:null,entries:[]};
const doorDynamicCombined=[];
function writeDoorLeafMatrix(entry){
  const {portal,definition,center,leafIndex,matrix}=entry,pair=definition.leafCount===2,left=pair?leafIndex===0:definition.hinge!=='right';
  const hingeLocal=left?-definition.aperture.width/2:definition.aperture.width/2,yaw=portal.widthAxis==='x'?0:Math.PI/2;
  const active=definition.activeLeaves.includes(leafIndex),fraction=active?portal.runtime.openFraction:0;
  const inward=String(definition.swing).includes('in')?-1:1,angle=(left?-1:1)*inward*Math.PI*.49*fraction,theta=yaw+angle,reflect=left?1:-1,c=Math.cos(theta),s=Math.sin(theta);
  matrix[0]=c*reflect;matrix[1]=0;matrix[2]=s*reflect;matrix[3]=0;matrix[4]=0;matrix[5]=1;matrix[6]=0;matrix[7]=0;matrix[8]=-s;matrix[9]=0;matrix[10]=c;matrix[11]=0;
  matrix[12]=center.x*CELL+Math.cos(yaw)*hingeLocal;matrix[13]=center.y;matrix[14]=center.z*CELL+Math.sin(yaw)*hingeLocal;matrix[15]=1;
}
function rebuildDoorLeafVisuals(group){
  doorLeafVisualCache.group=group;doorLeafVisualCache.entries.length=0;
  FP.forEachDoor((portal)=>{
    const center=FP.logicalToPhysical(portal.cx,portal.cy);if(group&&center.renderGroup!==group)return;
    const definition=portal.definition||{leafCount:1,activeLeaves:[0],leaf:{width:1},aperture:{width:1},hinge:'left',swing:'escape',mesh:'door_leaf_service'};
    const zone=FP.zoneAt(Math.floor(portal.cx),Math.floor(portal.cy));
    for(let leafIndex=0;leafIndex<definition.leafCount;leafIndex++){
      const matrix=new Float32Array(16),instance={id:`door-leaf:${portal.id}:${leafIndex}`,doorId:portal.id,mesh:definition.mesh,matrix,zone,structural:true};
      const entry={portal,definition,center,leafIndex,matrix,instance};writeDoorLeafMatrix(entry);doorLeafVisualCache.entries.push(entry);
    }
  });
}
function doorRenderInstances(group=null,{leaves=false}={}){
  if(!FP.isLoaded())return[];
  const out=[];
  for(const door of FP.doorState()){
    const center=FP.logicalToPhysical(door.cx,door.cy);
    if(group&&center.renderGroup!==group)continue;
    const yaw=door.widthAxis==='x'?0:Math.PI/2,zone=FP.zoneAt(Math.floor(door.cx),Math.floor(door.cy));
    if(!leaves){
      const matrix=doorTransform(center.x*CELL,center.y,center.z*CELL,yaw);
      out.push({id:`door-frame:${door.id}`,doorId:door.id,mesh:door.frameMesh,matrix,zone,structural:true});
      out.push({id:`door-head:${door.id}`,doorId:door.id,mesh:door.headMesh,matrix,zone,structural:true});
      if(godDoorDebug){
        out.push({id:`door-debug-aperture:${door.id}`,mesh:'door_debug_aperture',x:center.x*CELL,y:center.y,z:center.z*CELL,yaw,scaleX:door.aperture.width/1.06,scaleY:door.aperture.height/1.70,zone,structural:true});
        out.push({id:`door-debug-hinge:${door.id}`,mesh:'door_debug_hinge',x:center.x*CELL,y:center.y,z:center.z*CELL,yaw,scaleX:door.hinge==='right'?-1:1,zone,structural:true});
        out.push({id:`door-debug-swing:${door.id}`,mesh:'door_debug_swing',x:center.x*CELL,y:center.y,z:center.z*CELL,yaw,scaleX:door.leaf.width,scaleZ:door.leaf.width,zone,structural:true});
      }
    }else{
      for(let leaf=0;leaf<door.leafCount;leaf++){
        const active=door.activeLeaves.includes(leaf),fraction=active?door.openFraction:0;
        out.push({id:`door-leaf:${door.id}:${leaf}`,doorId:door.id,mesh:door.mesh,matrix:doorLeafMatrix(door,center,leaf,fraction),zone,structural:true});
      }
    }
  }
  if(!leaves)for(const scar of FP.sealedDoorways()){
    const center=FP.logicalToPhysical(scar.cx,scar.cy);if(group&&center.renderGroup!==group)continue;
    out.push({id:scar.id,mesh:'door_sealed_scar',matrix:doorTransform(center.x*CELL,center.y,center.z*CELL,scar.widthAxis==='x'?0:Math.PI/2),zone:FP.zoneAt(scar.cx,scar.cy),structural:true});
  }
  return out;
}

function syncDoorDynamicProps(){
  if(usingSourceSpace()||usingStairAnomaly()||!FP.isLoaded()){R3.r3dSetDynamicProps([]);return;}
  const group=FP.logicalToPhysical(px,py).renderGroup;
  if(doorLeafVisualCache.group!==group)rebuildDoorLeafVisuals(group);
  let count=0;for(const entry of doorLeafVisualCache.entries){writeDoorLeafMatrix(entry);doorDynamicCombined[count++]=entry.instance;}
  if(group==='tower'&&!inertBellTowerInstances)inertBellTowerInstances=createInertBellAssemblyInstances(towerBellLayout());
  const bells=group!=='tower'?[]:chapelTowerState().phase===CHAPEL_TOWER_PHASE.TOWER_ACTIVE&&bellTowerRuntime?bellTowerRuntime.renderInstances():(inertBellTowerInstances||[]);
  for(const bell of bells)doorDynamicCombined[count++]=bell;doorDynamicCombined.length=count;
  doorDynamicCombined.length=count;
  R3.r3dSetDynamicProps(doorDynamicCombined);
}

// The building's practicals are AUTHORED now — see src/data/conservatory-lights.js.
// This used to be two hardcoded blocks keyed on render group, which is why seven
// of the nine spaces had no light at all: there was nowhere to put any. All this
// does is resolve the authored rig for where you are standing.
function syncArchitecturalLocalLights(group,{logicalX=px,logicalY=py}={}){
  const settings=getSave().settings||{};
  const physical=FP.logicalToPhysical(logicalX,logicalY);
  const context=resolveLightingContext({group,zone:FP.zoneAt(logicalX,logicalY),spaceId:physical.spaceId});
  R3.r3dSetLightingContext?.(context);
  const ordinaryLights=resolveLocalLights(context,{
    timeSec:performance.now()/1000,
    reducedFlash:(settings.flash||'full')!=='full',
    effectsMode:settings.flash||'full',
    towerCleared:[CHAPEL_TOWER_PHASE.TOWER_CLEARED,CHAPEL_TOWER_PHASE.CHAPEL_FINAL].includes(chapelTowerState().phase),
    liveCircuits:liveLightCircuits(),
    // physicalPointFor is in runtime cells; authored light data is in metres.
    origin:{x:physical.x*CELL,z:physical.z*CELL},
    anchorPosition:lightAnchorPosition,
  });
  const presentedLights=group==='ground'&&dockHauntingFrame&&dockHauntingStagingPoint
    ?dockHauntingLights(dockHauntingFrame,dockHauntingStagingPoint,ordinaryLights)
    :ordinaryLights;
  const shadow=buildEmergencyShadowFrame(presentedLights,{
    listener:{x:physical.x*CELL,z:physical.z*CELL},
    enabled:!dockHauntingFrame&&!settings.reduceDread,
  });
  R3.r3dSetEmergencyShadows?.(shadow?[shadow.instance]:[]);
  R3.r3dSetLocalLights?.(shadow
    ?presentedLights.map((light)=>light.id===shadow.lightId?{...light,...shadow.lightOverride}:light)
    :presentedLights);
}

function liveLightCircuits(){
  return livePowerCircuits(getSave().power);
}

function lightAnchorPosition(propId){
  const prop=PROPS.propById(propId);if(!prop)return null;
  const at=FP.logicalToPhysical(prop.rx,prop.ry);
  return{
    x:at.x*CELL+(Number(prop.renderOffsetX)||0),
    y:(Number(prop.floor)||0)+(Number(prop.elevation)||0)+(Number(prop.renderOffsetY)||0),
    z:at.z*CELL+(Number(prop.renderOffsetZ)||0),
    floorY:Number(prop.floor)||0,
    yaw:Number(prop.yaw)||0,
  };
}

function propEmissive(instance){
  const prop=PROPS.propById(instance.id);
  if(prop?.lightColor){
    const live=!prop.lightCircuit||liveLightCircuits().has(prop.lightCircuit);
    const color=prop.lightColor;
    return live
      ? [Number(color[0])||0,Number(color[1])||0,Number(color[2])||0,prop.lightMaintained?.22:.28]
      : [Number(color[0])||0,Number(color[1])||0,Number(color[2])||0,.015];
  }
  if(instance.mesh==='power_box_01'){
    const circuit=powerCircuitForPanel(instance.id);
    return circuit&&liveLightCircuits().has(circuit.id)?[.10,1,.24,.28]:[.06,.42,.12,.07];
  }
  if(instance.mesh==='tower_bulkhead')return[1,.58,.27,.34];
  return null;
}

function worldRenderInstances(group=null){
  if(usingSourceSpace()){
    // Source owns a void-to-paper sunrise. Do not let the room the player left
    // bleed its fluorescent ambient signature into that authored transition.
    R3.r3dSetLightingContext?.({ambientColor:[.12,.13,.12],ambientIntensity:.006});
    R3.r3dSetLocalLights?.([]);
    R3.r3dSetEmergencyShadows?.([]);
    return chunkSurfRuntime.propInstances(px,py,{time:performance.now()/1000,reducedMotion:(getSave().settings?.shake||'full')!=='full'});
  }
  if(usingStairAnomaly()){
    const settings=getSave().settings||{};
    R3.r3dSetLightingContext?.(resolveLightingContext({group:'stair',zone:ZONE.stair,spaceId:'impossible-stair'}));
    R3.r3dSetLocalLights?.(stairAnomalyRuntime.lightRig(performance.now()/1000,{reducedFlash:(settings.flash||'full')!=='full'}));
    R3.r3dSetEmergencyShadows?.([]);
    return stairAnomalyRuntime.propInstances({reducedDread:!!settings.reduceDread});
  }
  syncArchitecturalLocalLights(group);
  const tower=chapelTowerState();
  const screenOpen=[CHAPEL_TOWER_PHASE.TOWER_CLEARED,CHAPEL_TOWER_PHASE.CHAPEL_FINAL].includes(tower.phase);
  const props=PROPS.renderInstances({group}).filter((instance)=>{
    if(screenOpen&&instance.id==='chapel-inner-screen')return false;
    if(instance.id==='dock-chandelier-spent')return false;
    return true;
  }).map((instance)=>({...instance,emissive:propEmissive(instance)}));
  return[...props,...doorRenderInstances(group)];
}

function usingSourceSpace(){ return !!chunkSurfRuntime; }
function usingStairAnomaly(){ return !!stairAnomalyRuntime; }
function usingSpecialSpace(){ return usingSourceSpace()||usingStairAnomaly(); }
function sourceTextSpaceActive(){
  if(!chunkSurfRuntime)return false;
  return [CHUNK_SURF_PHASE.TRANSFORMING,CHUNK_SURF_PHASE.LANDSCAPE,CHUNK_SURF_PHASE.FINAL,CHUNK_SURF_PHASE.COMPLETED].includes(chunkSurfRuntime.state().phase);
}
function sourceGeometry(){ return usingSourceSpace() ? chunkSurfRuntime.geometry : null; }
function stairGeometry(){ return usingStairAnomaly() ? stairAnomalyRuntime.geometry : null; }
function activeGeometry(){ return sourceGeometry() || stairGeometry() || (usingPlan() ? FP : null); }

function currentStairAnomalyEnvironment(){
  return normalizeStairAnomalyEnvironment(getSave().run?.environment?.stairAnomaly);
}
function currentStairAnomalyLedger(){
  return normalizeStairAnomalyLedger(getSave().run?.ledger?.stairAnomaly);
}
function runWithStairAnomalyLedger(ledger){
  const run=getSave().run;if(!run)return null;
  return{...run,ledger:{...(run.ledger||{}),stairAnomaly:normalizeStairAnomalyLedger(ledger,{missing:'armed'})}};
}
function stairAnomalyReturnPoint(environment=currentStairAnomalyEnvironment()){
  if(environment.stairId==='upper')return{...FP.toRuntimePoint({x:66,y:55}),facing:2};
  if(environment.travel==='up')return{...FP.toRuntimePoint({x:60,y:23}),facing:1};
  return{...FP.toRuntimePoint({x:44,y:23}),facing:3};
}
function stairTriggerCrossed(dx,dy){
  if(!usingPlan()||planName!=='conservatory'||usingSpecialSpace())return false;
  const environment=currentStairAnomalyEnvironment(),ledger=currentStairAnomalyLedger();
  if(ledger.status!==STAIR_ANOMALY_STATUS.ARMED)return false;
  const nx=px+dx,ny=py+dy;
  if(stairAnomalyTriggerMatches(environment,{stairId:'upper',travel:'up'})){
    return dy>0&&py===81&&ny===82&&px>=120&&px<=125;
  }
  // No descent trigger. The way down to B3 is never the impossible stair — see
  // decideStairAnomalyEnvironment. Kept out of the match list entirely so a
  // legacy save that stored a 'down' environment simply never fires.
  if(stairAnomalyTriggerMatches(environment,{stairId:'basement',travel:'up'})){
    return dx>0&&px===95&&nx===96&&py>=44&&py<=49;
  }
  return false;
}

function stairCueCaption(text){
  if(getSave().settings?.hushCueCaptions)pushEvent(`// [${text}]`);
}

function clearStairEnvironmentalTimers(){
  for(const timer of stairEnvironmentalTimers)clearTimeout(timer);
  stairEnvironmentalTimers.clear();stairEchoSerial=0;
}
function scheduleStairEnvironmentalFootstep(level=.12,delay=420){
  const owner=stairAnomalyRuntime;
  const timer=setTimeout(()=>{
    stairEnvironmentalTimers.delete(timer);
    if(owner&&stairAnomalyRuntime===owner)RT.footstep(Math.max(.02,Math.min(.28,Number(level)||.12)));
  },Math.max(0,Number(delay)||0));
  stairEnvironmentalTimers.add(timer);return timer;
}
function scheduleStairStepEcho(level){
  stairEchoSerial+=1;
  const seed=currentStairAnomalyEnvironment().seed;
  scheduleStairEnvironmentalFootstep(level*.26,360+((seed+stairEchoSerial*73)%240));
}

// The impossible stair used to seize the camera and lock input for a beat at
// each stage — which read as "my movement is stuck." The uncanniness now lives
// entirely in the endless continuous climb and its shifting lights, so the
// climb is never interrupted. Left as a no-op so its call sites stay harmless.
function beginStairAttention(_stage){
  if(stairAttentionScene){scenes.remove(stairAttentionScene);stairAttentionScene=null;}
}

function onStairAnomalyStage({stage}){
  if(stage===1){CUES.playCue(CUES.CUE.recorder,{gain:.14,rate:.52});stairCueCaption('the same relay clicks again');}
  if(stage===2){
    const reducedDread=!!getSave().settings?.reduceDread;
    CUES.playCue(CUES.CUE.light,{gain:reducedDread ? .13 : .28,rate:.72});
    scheduleStairEnvironmentalFootstep(reducedDread ? .07 : .16,180);scheduleStairEnvironmentalFootstep(reducedDread ? .045 : .11,640);
    bumpFear(reducedDread ? .09 : .22);stairCueCaption('another step answers behind you');
  }
  if(stage===3){CUES.playCue(CUES.CUE.recorder,{gain:.18,rate:.38});stairCueCaption('the landing settles into place');}
  if(stage===2||stage===3)beginStairAttention(stage);
}

function syncStairAnomalyRender({force=false}={}){
  if(!usingStairAnomaly())return false;
  const plan=stairAnomalyRuntime.geometry.renderPlanFor(px,py),key=`stair:${plan.key}`;
  if(force||key!==r3dCache.physicalKey){
    R3.r3dSetPlan(plan.rgba,plan.w,plan.h,plan.material,{originX:plan.originX,originY:plan.originY});
    r3dCache.physicalGroup='stair-anomaly';r3dCache.physicalKey=key;r3dCache.fogSize=-1;
  }
  R3.r3dSetProps(worldRenderInstances('stair-anomaly'));
  R3.r3dSetDynamicProps([]);
  R3.r3dSetSourceScene({key:'stair-anomaly',corpus:[],staticInstances:[],dynamicInstances:[],look:{sunrise:0,chroma:1,paper:0}});
  return true;
}

function finishStairAnomaly(){
  if(!usingStairAnomaly())return false;
  const environment=stairAnomalyRuntime.environment,ledger=stairAnomalyRuntime.state();
  const destination=stairAnomalyReturnPoint(environment);
  if(stairAttentionScene){scenes.remove(stairAttentionScene);stairAttentionScene=null;}
  clearStairEnvironmentalTimers();stairAnomalyRuntime=null;R3.r3dSetLocalLights?.([]);
  px=destination.x;py=destination.y;R3.r3dSetFacing(destination.facing);renderMove=null;motionRig=null;trail=[];
  if(stairPresenceSnapshot)PRES.loadPresenceState(stairPresenceSnapshot);
  stairPresenceSnapshot=null;
  const run=runWithStairAnomalyLedger(ledger);
  saveCommit({run,px,py,area:'conservatory',presence:PRES.savePresenceState()});
  const plan=FP.physicalRenderPlanFor(px,py);R3.r3dSetPlan(plan.rgba,plan.w,plan.h,plan.material);r3dCache.physicalKey=plan.key;r3dCache.physicalGroup=plan.group;r3dCache.fogSize=-1;
  R3.r3dSetProps(worldRenderInstances(plan.group));syncDoorDynamicProps();revealAround(px,py);updateAudio();
  // Symmetric fade back out onto the ordinary stair — the return teleport lands
  // under the black, so stepping off the impossible flight never flashes either.
  CR.fx.flash(460,'rgba(0,0,0,0.98)');
  return true;
}

function activateStairAnomaly(ledger,{position=null,fresh=false}={}){
  const environment=currentStairAnomalyEnvironment();
  clearStairEnvironmentalTimers();
  if(fresh){stairPresenceSnapshot=PRES.savePresenceState();saveCommit({presence:stairPresenceSnapshot});}
  else stairPresenceSnapshot=getSave().presence||PRES.savePresenceState();
  PRES.despawn();
  stairAnomalyRuntime=createStairAnomalyRuntime({
    environment,initialLedger:ledger,
    onState:(next,{immediate=false}={})=>{
      if(!immediate||next.status===STAIR_ANOMALY_STATUS.COMPLETED)return;
      const run=runWithStairAnomalyLedger(next);
      saveCommit({run,px,py,area:'stair-anomaly',presence:stairPresenceSnapshot});
    },
    onStage:onStairAnomalyStage,
    onComplete:finishStairAnomaly,
  });
  const at=position||stairAnomalyRuntime.checkpointPosition();
  px=Number(at?.x)||0;py=Number(at?.y)||0;R3.r3dSetFacing(Number.isFinite(at?.facing)?at.facing:STAIR_ANOMALY_ENTRY.facing);
  stairAnomalyRuntime.setPlayerPosition({x:px,y:py,facing:R3.r3dFacing()});
  renderMove=null;motionRig=null;trail=[];applyLookProfile('explore',{transitionMs:180});syncStairAnomalyRender({force:true});
  return stairAnomalyRuntime;
}

// ── the way out of the impossible stair ─────────────────────────────────────
// Climbing 640 treads is the long way and nobody should have to find that out by
// doing it. There is a second exit, and it is the thing a person actually does
// when a stairwell stops making sense: they stop, and they check their torch.
//
// Kill the light, stand in the dark long enough to be sure, and put it back on —
// and the stair is just a stair again, with the door where the door should be. It
// is deliberately not signposted; the recordist works it out out loud once he has
// been climbing long enough to be frightened.
const STAIR_ESCAPE = Object.freeze({ dark: 30000, hintAfter: 42000 });
let stairDarkSince=0;
let stairEscapeHinted=false;

function noteStairTorchFlick(on){
  if(!usingStairAnomaly()) return;
  if(!on){ stairDarkSince=performance.now(); return; }
  // Light back on. Was it dark long enough?
  const held=stairDarkSince ? performance.now()-stairDarkSince : 0;
  stairDarkSince=0;
  if(held < STAIR_ESCAPE.dark){
    SPEECH.say({ who:'you', text:'No. Not long enough in the dark to be sure of anything.' });
    return;
  }
  SPEECH.sayAll([
    { who:'direction', text:'The filament comes up on a landing, a smoke door, and a handrail that ends where handrails end.' },
    { who:'you', text:'There. That is a stair. That is an ordinary stair.' },
  ]);
  fireCue('door');
  CR.fx.flash(520,'rgba(0,0,0,0.96)');
  setTimeout(()=>{ if(usingStairAnomaly()) finishStairAnomaly(); }, 420);
}

function beginStairAnomaly(){
  if(usingSpecialSpace())return false;
  stairDarkSince=0; stairEscapeHinted=false; stairAnomalyEnteredAt=performance.now();
  const entered=reduceStairAnomaly(currentStairAnomalyLedger(),{type:'ENTER'});
  const run=runWithStairAnomalyLedger(entered);
  saveCommit({run,px:STAIR_ANOMALY_ENTRY.x,py:STAIR_ANOMALY_ENTRY.y,area:'stair-anomaly'});
  CUES.playCue(CUES.CUE.door,{gain:.34,rate:.78});CUES.playCue(CUES.CUE.light,{gain:.24,rate:.62,delay:.18});
  stairCueCaption('a smoke door closes; one lamp wakes');
  activateStairAnomaly(entered,{position:STAIR_ANOMALY_ENTRY,fresh:true});beginStairAttention(0);
  // Fade in to the impossible stair from black rather than hard-cutting — the
  // switch of scene and position happens under the black, so there is no flash
  // of the ordinary stair before the trick one takes over.
  CR.fx.flash(460,'rgba(0,0,0,0.98)');
  return true;
}

function resumeStairAnomalyFromSave(){
  stairDarkSince=0; stairEscapeHinted=false; stairAnomalyEnteredAt=performance.now();
  const ledger=currentStairAnomalyLedger();
  if(ledger.status!==STAIR_ANOMALY_STATUS.ACTIVE||getSave().area!=='stair-anomaly')return false;
  const sx=Number(getSave().px),sy=Number(getSave().py);
  activateStairAnomaly(ledger,{position:Number.isFinite(sx)&&Number.isFinite(sy)?{x:sx,y:sy,facing:0}:null});
  return true;
}

function stairAnomalyProbePreset(stage=0,reduced=false){
  const selectedStage=Math.max(0,Math.min(3,Math.floor(Number(stage)||0)));
  godRestoreBuildingWorld();
  const save=getSave(),base=normalizeStairAnomalyEnvironment(save.run?.environment?.stairAnomaly);
  const environment=Object.freeze({...base,stairId:'upper',travel:'up',visualSlope:'up',variant:'baseline'});
  const ledger={status:STAIR_ANOMALY_STATUS.ACTIVE,stage:selectedStage,progress:selectedStage/4,checkpoint:selectedStage};
  const run={...save.run,environment:{...(save.run?.environment||{}),stairAnomaly:environment},ledger:{...(save.run?.ledger||{}),stairAnomaly:ledger}};
  const settings={...save.settings,flash:reduced?'reduced':'full',shake:reduced?'reduced':'full',reduceDread:!!reduced};
  const position={x:0,y:-selectedStage*STAIR_ANOMALY_MODULE_CELLS,facing:0};
  saveCommit({run,settings,area:'stair-anomaly',px:position.x,py:position.y});
  activateStairAnomaly(ledger,{position,fresh:true});
  return{
    active:true,reduced:!!reduced,environment:stairAnomalyRuntime.environment,
    ledger:stairAnomalyRuntime.state(),lights:stairAnomalyRuntime.lightRig(performance.now()/1000,{reducedFlash:!!reduced}),
    shadowOnly:stairAnomalyRuntime.propInstances({reducedDread:!!reduced}).filter((entry)=>entry.shadowOnly).length,
  };
}

// Debug: re-arm the impossible stair WITHIN the current run — sets the run's
// stair ledger back to ARMED so the anomaly fires again the next time you cross
// the trigger, regardless of any run-completion data.
function godRearmStairRun(){
  saveCommit({run:runWithStairAnomalyLedger(freshStairAnomalyLedger())});
  pushEvent('// [god] stair anomaly re-armed for this run');
}
// Debug: reset the stair globally, as if it is the first run of the game ever —
// zeroes the cross-game run counter (meta.runs), re-arms this run's ledger, and
// restores the first-run environment (upper / up, F1→F2). Previous completions
// no longer count.
function godResetStairGlobal(){
  metaCommit({runs:0});
  const base=runWithStairAnomalyLedger(freshStairAnomalyLedger());
  const run={...base,environment:{...(base.environment||{}),stairAnomaly:normalizeStairAnomalyEnvironment(undefined)}};
  saveCommit({run});
  pushEvent('// [god] stair anomaly reset (global): runs→0, re-armed, env→upper/up');
}

function chapelTowerState(){return normalizeChapelTowerState(getSave().chapelTower);}
function syncChapelTowerKeyring(tower=chapelTowerState()){
  playerKeys.delete('tower-live');
  playerKeys.delete('tower-cleared');
  for(const key of chapelTowerKeyring(tower))playerKeys.add(key);
}
function towerWaypointFor(tower=chapelTowerState()){
  const objective=towerObjective(tower);
  const authored={
    'enter-source':CHAPEL_SCREEN_AUTHORED,
    'follow-signal':CHAPEL_SCREEN_AUTHORED,
    'ringing-room':{x:25,y:158},
    'clock-hammer':{x:18,y:153},
    'belfry-hatch':TOWER_ROUTE_ANCHORS.belfryDoor,
    'break-relay':BELL_RELAY_CLAMP_AUTHORED,
    'release-winch':TOWER_ROUTE_ANCHORS.winch,
    'bells-settling':TOWER_ROUTE_ANCHORS.winch,
    'descend-nave':TOWER_ROUTE_ANCHORS.naveExit,
    'roll-fifth-take':CHAPEL_SCREEN_AUTHORED,
  }[objective.id];
  return authored?{objective,point:FP.toRuntimePoint(authored)}:{objective,point:null};
}
function towerCheckpointFor(tower=chapelTowerState()){
  const stage=towerRelayStage(tower);
  const authored=stage===TOWER_RELAY_STAGE.INTERRUPT
    ? TOWER_ROUTE_ANCHORS.chamberEntry
    : [TOWER_RELAY_STAGE.RELEASE,TOWER_RELAY_STAGE.SETTLING].includes(stage)
      ? TOWER_ROUTE_ANCHORS.winch
      : {x:25,y:158,facing:0};
  return{...FP.toRuntimePoint(authored),facing:authored.facing||0};
}
function syncTowerWaypoint(tower=chapelTowerState()){
  const {objective,point}=towerWaypointFor(tower);
  if(point)OBJ.setWaypoint(point.x,point.y,objective.id);
  else if(tower.phase===CHAPEL_TOWER_PHASE.CHAPEL_FINAL)OBJ.clearWaypoint();
  return OBJ.saveObjState();
}
function commitChapelTower(event,patch={}){
  const next=reduceChapelTower(chapelTowerState(),event);
  syncChapelTowerKeyring(next);
  const obj=syncTowerWaypoint(next);
  saveCommit({chapelTower:next,obj,...patch});
  return next;
}

function towerBellLayout(){
  const logical=FP.toRuntimePoint(BELL_FRAME_AUTHORED);
  const anchor=FP.logicalToPhysical(logical.x,logical.y);
  return createBellFrameLayout(ELLERY_BELLS,{
    centerX:anchor.x*CELL,
    centerZ:anchor.z*CELL,
    chamberFloorY:FP.floorAt(logical.x,logical.y),
  });
}

function resetTowerPlayerSweep(){
  towerPreviousPlayerCapsule=null;towerCapsuleWriteIndex=0;towerPlayerSweep.previous=null;towerPlayerSweep.current=null;
}

function towerPlayerCapsule(out=towerPlayerCapsules[towerCapsuleWriteIndex]){
  if(!usingPlan())return null;
  const physical=FP.logicalToPhysical(px,py),at=motionRig||physical,floor=FP.floorAt(px,py);
  out.x=at.x*CELL;out.z=at.z*CELL;out.minY=floor+.05;out.maxY=floor+1.78;out.radius=.28;
  return out;
}

function stopBellTowerRuntime(){
  bellTowerRuntime?.destroy?.();bellTowerRuntime=null;bellTowerAudio=null;resetTowerPlayerSweep();syncDoorDynamicProps();
}

function emitDoorArchitecture(portal,type,{playerGenerated=false}={}){
  const opening=type==='door_open';
  fireCue(opening&&portal.keyId?'keyturn':'door');
  emitAcousticEvent({
    kind:type,
    source:{kind:playerGenerated?'player':'environment',id:`door:${portal.id}`},
    spatial:acousticSpatialAt(portal.cx,portal.cy),
    semantics:{playerGenerated,deliberate:playerGenerated,audibleToHush:true,audibleToMonitor:true,audibleInWorld:true,canSpoilTake:true,family:'architecture'},
    provenance:{system:'door-runtime',doorId:portal.id,archetype:portal.definition?.archetype||portal.archetype||'legacy',construction:portal.definition?.construction||portal.construction||'legacy'},
  });
}

function tickDoorRuntime(dt){
  if(!usingPlan()||usingSpecialSpace())return;
  const events=FP.tickDoors(dt,{playerX:px,playerY:py});
  for(const event of events){
    if(event.type==='closing')emitDoorArchitecture(event.portal,'door_close',{playerGenerated:false});
  }
  if(events.some((event)=>event.type==='opened'||event.type==='closed')){
    saveCommit({doors:FP.saveDoorState()});facilityMapCache={key:null,model:null};
  }
  syncDoorDynamicProps();
}

function failBellTower({hazardId='machinery'}={}){
  if(!bellTowerCollisionEnabled||bellTowerImpactActive||chapelTowerState().phase!==CHAPEL_TOWER_PHASE.TOWER_ACTIVE)return;
  bellTowerImpactActive=true;
  const next=commitChapelTower({type:'TOWER_COLLISION',hazardId});
  CR.fx.shake(.8,420);
  const checkpoint=towerCheckpointFor(next);
  let elapsed=0;
  scenes.push({
    id:'tower-impact',blocksInput:true,blocksWorld:true,lookProfile:'rupture',
    update(dt){
      elapsed+=dt;if(elapsed<.6)return;
      scenes.pop();px=checkpoint.x;py=checkpoint.y;R3.r3dSetFacing(checkpoint.facing||0);
      renderMove=null;motionRig=null;trail=[];resetTowerPlayerSweep();
      saveCommit({chapelTower:next,px,py,area:'bell-tower'});
      bellTowerImpactActive=false;
      SPEECH.say({who:'you',text:'Back to the last safe landing. The relay count held.'});
    },
  });
}

function completeBellTower(){
  if(chapelTowerState().phase!==CHAPEL_TOWER_PHASE.TOWER_ACTIVE)return;
  const next=commitChapelTower({type:'BELLS_STOOD'});
  saveCommit({chapelTower:next,doors:FP.saveDoorState(),px,py,area:'bell-tower'});syncDoorDynamicProps();
  SPEECH.say({who:'direction',text:'The last bell reaches the balance and comes down. The silence is larger than the ringing. The service lock releases; open it and descend to the nave.'});
}

function startBellTowerRuntime({retry=false,collisions=true,offsetMs=0}={}){
  ensureCtx();
  bellTowerCollisionEnabled=!!collisions;
  if(!bellTowerAudio)bellTowerAudio=createBellTowerAudio({context:actx,destination:master||actx?.destination});
  if(!bellTowerRuntime)bellTowerRuntime=createBellTowerRuntime({
    bells:towerBellLayout(),audio:bellTowerAudio,emitAcousticEvent,
    onCollision:failBellTower,onCleared:completeBellTower,
  });
  syncChapelTowerKeyring();
  resetTowerPlayerSweep();
  const resolvedOffset=offsetMs==='stop-ready'?bellTowerRuntime.timing().finiteEndMs+25:Math.max(0,Number(offsetMs)||0);
  bellTowerRuntime.start({
    retry,
    offsetMs:resolvedOffset,
    interventions:chapelTowerState().relayInterruptions,
  });
  syncDoorDynamicProps();
  return bellTowerRuntime;
}

function tickBellTower(dt){
  if(usingPlan()&&!usingSpecialSpace()&&FP.zoneAt(px,py)===ZONE.bellTower&&!chapelTowerState().ropeRoomVisited&&FP.floorAt(px,py)<12){
    commitChapelTower({type:'ROPE_ROOM_VISITED'});
    SPEECH.say({who:'you',text:'Rope room. Eight lines into one frame. Find what is driving them before I touch the bells.'});
  }
  if(usingPlan()&&!usingSpecialSpace()&&chapelTowerState().phase===CHAPEL_TOWER_PHASE.TOWER_CLEARED&&!chapelTowerState().chapelReached&&FP.zoneAt(px,py)===ZONE.chapel){
    commitChapelTower({type:'CHAPEL_REACHED'});
    SPEECH.say({who:'direction',text:'The tower is silent above the nave. The recorder meter is moving anyway. Put the fifth take on tape.'});
  }
  if(chapelTowerState().phase!==CHAPEL_TOWER_PHASE.TOWER_ACTIVE||!bellTowerRuntime)return;
  const current=towerPlayerCapsule();
  if(current){towerPlayerSweep.previous=towerPreviousPlayerCapsule||current;towerPlayerSweep.current=current;}
  bellTowerRuntime.tick(dt,current?towerPlayerSweep:null);
  if(current){towerPreviousPlayerCapsule=current;towerCapsuleWriteIndex=(towerCapsuleWriteIndex+1)%towerPlayerCapsules.length;}
  syncDoorDynamicProps();
}

function chapelTowerDiagnostics(){
  if(!FP.isLoaded())return{currentRoom:null,staircase:null,flight:null,physicalFloor:null,nearbyDoor:null,routePhase:'unloaded',activeCompoundHazards:[]};
  const physical=FP.logicalToPhysical(px,py),stairs=(FP.floorplan().stairPortals||[]).filter((entry)=>entry.id);
  const segmentDistance=(entry)=>{
    const ax=entry.p0[0],az=entry.p0[1],bx=entry.p1[0],bz=entry.p1[1],vx=bx-ax,vz=bz-az;
    const t=Math.max(0,Math.min(1,((physical.x-ax)*vx+(physical.z-az)*vz)/Math.max(.0001,vx*vx+vz*vz)));
    return Math.hypot(physical.x-(ax+vx*t),physical.z-(az+vz*t));
  };
  const stair=stairs.sort((a,b)=>segmentDistance(a)-segmentDistance(b))[0];
  const door=FP.doorState().map((entry)=>({...entry,distance:Math.hypot(px-entry.cx,py-entry.cy)})).sort((a,b)=>a.distance-b.distance)[0];
  const tower=chapelTowerState();
  return{
    currentRoom:physical.renderGroup==='tower'?currentAreaLabel():null,
    staircase:stair&&segmentDistance(stair)<=8?stair.id.split(':')[0]:null,
    flight:stair&&segmentDistance(stair)<=8?stair.flight:null,
    physicalFloor:+Number(physical.y||0).toFixed(3),
    nearbyDoor:door&&door.distance<=8?door.id:null,
    routePhase:tower.phase===CHAPEL_TOWER_PHASE.TOWER_ACTIVE?'live-crossing':[CHAPEL_TOWER_PHASE.TOWER_CLEARED,CHAPEL_TOWER_PHASE.CHAPEL_FINAL].includes(tower.phase)?'physical-descent':'quiet-access',
    activeCompoundHazards:(bellTowerRuntime?.hazardVolumes?.()||[]).filter((hazard)=>hazard.moving).map((hazard)=>({id:hazard.id,bell:hazard.bell,component:hazard.component,kind:hazard.kind,x:+hazard.x.toFixed(3),y:[+hazard.minY.toFixed(3),+hazard.maxY.toFixed(3)],z:+hazard.z.toFixed(3)})),
  };
}

function syncSourceRender({ force=false }={}){
  if(!usingSourceSpace()) return false;
  const plan=chunkSurfRuntime.geometry.renderPlanFor(px,py);
  const key=`source:${plan.key}`;
  if(force||key!==r3dCache.physicalKey){
    R3.r3dSetPlan(plan.rgba,plan.w,plan.h,plan.material,{originX:plan.originX,originY:plan.originY,sourceLayer:plan.sourceLayer});
    r3dCache.physicalGroup='source-space';r3dCache.physicalKey=key;r3dCache.fogSize=-1;
  }
  const reducedMotion=(getSave().settings?.shake||'full')!=='full';
  R3.r3dSetProps(chunkSurfRuntime.propInstances(px,py,{time:performance.now()/1000,reducedMotion}));
  R3.r3dSetDynamicProps([]);
  const scene=sourceTextSpaceActive()?chunkSurfRuntime.sourceScene({
    px,py,presence:PRES.publicSnapshot(),time:performance.now()/1000,reducedMotion,
  }):{key:'source:physical',corpus:[],staticInstances:[],dynamicInstances:[],look:{sunrise:0,chroma:1,paper:0}};
  R3.r3dSetSourceScene(scene);
  return true;
}

function beginSourceTowerTransition(){
  if(sourceTowerTransition||chapelTowerState().phase!==CHAPEL_TOWER_PHASE.TRANSITION_READY)return false;
  const reducedMotion=(getSave().settings?.shake||'full')!=='full';
  sourceTowerTransition=createSourceTowerTransitionScene({
    motionInput,renderer:R3,reducedMotion,worldView:()=>TOWER_ENTRY_VIEW,
    onCommit:()=>{
      const next=commitChapelTower({type:'TRANSITION_COMMITTED'});
      px=TOWER_ENTRY.x;py=TOWER_ENTRY.y;R3.r3dSetFacing(TOWER_ENTRY.facing);renderMove=null;motionRig=null;trail=[];
      saveCommit({chapelTower:next,px,py,area:'bell-tower'});
      scenes.remove(sourceTowerTransition);sourceTowerTransition=null;
      startBellTowerRuntime({retry:false});
      SPEECH.say({who:'direction',text:'The Source climbs into eight ropes. Above them, the tenor begins alone. Diagnose the relay before the whole frame takes the building.'});
    },
    onExit:()=>{sourceTowerTransition=null;},
  });
  scenes.push(sourceTowerTransition);
  chunkSurfRuntime=null;PRES.despawn();R3.r3dSetSourceScene({key:'source:exit',corpus:[],staticInstances:[],dynamicInstances:[],look:{sunrise:0,chroma:1,paper:0}});
  px=CHAPEL_OUTER_CHECKPOINT.x;py=CHAPEL_OUTER_CHECKPOINT.y;R3.r3dSetFacing(CHAPEL_OUTER_CHECKPOINT.facing);renderMove=null;motionRig=null;trail=[];
  saveCommit({px,py,area:'conservatory'});
  return true;
}

function restoreFromSourceSpace(completion,exitSnapshot){
  sourceFinalCombatOpen=false;
  const finalState=chunkSurfRuntime?.state?.()||normalizeChunkSurfState(getSave().chunkSurf);
  sourceExitSnapshot=exitSnapshot||chunkSurfRuntime?.exitSnapshot?.()||null;
  flagApply(completion.flags||[]);
  let tower=chapelTowerState();
  if(tower.phase===CHAPEL_TOWER_PHASE.SOURCE_READY)tower=reduceChapelTower(tower,{type:'SOURCE_COMPLETED'});
  saveCommit({chunkSurf:finalState,chapelTower:tower,flags:getSave().flags,area:'source-space',presence:PRES.savePresenceState()});
  const lines=chunkSurfCompletionLines(completion);
  if(lines?.length)presentFinale(lines,{slate:'SOURCE FAULT',replayId:'chunk-surf-complete',onDone:beginSourceTowerTransition});
  else beginSourceTowerTransition();
}

function activateSourceSpace(state,{position=null}={}){
  const normalized=normalizeChunkSurfState(state);
  sourcePresenceWasActive=PRES.isActive();
  sourceFinalCombatOpen=false;
  PRES.despawn();
  chunkSurfRuntime=createSourceSpaceRuntime({
    initialState:normalized,
    onState:(next,{immediate=false}={})=>{
      saveCommit({chunkSurf:next,px,py,area:'source-space',...(immediate?{presence:PRES.savePresenceState()}:{})});
    },
    onScare:()=>{
      STAB.reportThreat();bumpFear(.35);CUES.playCue(CUES.CUE.scream,{gain:.48,rate:.72});
    },
    onComplete:restoreFromSourceSpace,
  });
  const at=position||chunkSurfRuntime.checkpointPosition(normalized.checkpointId);
  px=Number(at?.x)||0;py=Number(at?.y)||0;
  R3.r3dSetFacing(Number.isFinite(at?.facing)?at.facing:SOURCE_ENTRY.facing);
  chunkSurfRuntime.setPlayerPosition({x:px,y:py,facing:R3.r3dFacing()});
  renderMove=null;motionRig=null;trail=[];
  applyLensPreset('explore');
  R3.r3dSetSourceSurface(chunkSurfRuntime.sourceSurfaceLines());
  syncSourceRender({force:true});
  return chunkSurfRuntime;
}

function resumeSourceSpaceFromSave(){
  const state=normalizeChunkSurfState(getSave().chunkSurf);
  if(!state.active)return false;
  const sx=Number(getSave().px),sy=Number(getSave().py);
  activateSourceSpace(state,{position:Number.isFinite(sx)&&Number.isFinite(sy)?{x:sx,y:sy,facing:state.returnPoint?.facing??0}:null});
  return true;
}

function repairLegacyTowerLayout(tower){
  if(!tower.legacyLayout)return tower;
  const ax=FP.toAuthoredCoord(px),ay=FP.toAuthoredCoord(py);
  let destination=null;
  if(tower.phase===CHAPEL_TOWER_PHASE.TOWER_ACTIVE)destination=TOWER_ENTRY;
  else if([CHAPEL_TOWER_PHASE.TOWER_CLEARED,CHAPEL_TOWER_PHASE.CHAPEL_FINAL].includes(tower.phase)){
    if(ax>=44&&ax<=59&&ay>=129&&ay<=141)destination={...FP.toRuntimePoint(TOWER_ROUTE_ANCHORS.organLoft),facing:TOWER_ROUTE_ANCHORS.organLoft.facing};
    else if(ax>=27&&ax<=43&&ay>=129&&ay<=141)destination={...FP.toRuntimePoint(TOWER_ROUTE_ANCHORS.chamberEntry),facing:TOWER_ROUTE_ANCHORS.chamberEntry.facing};
    else if(getSave().area==='bell-tower')destination={...FP.toRuntimePoint(TOWER_ROUTE_ANCHORS.ringingEntry),facing:TOWER_ROUTE_ANCHORS.ringingEntry.facing};
  }
  if(destination){px=destination.x;py=destination.y;R3.r3dSetFacing(destination.facing??0);renderMove=null;motionRig=null;trail=[];}
  const repaired={...tower,legacyLayout:false};
  saveCommit({chapelTower:repaired,px,py,area:getSave().area});
  return repaired;
}

async function loadBuilding(){
  // The real building. `?plan=testbed` still loads the geometry proof.
  const requested=params().get('plan') || 'conservatory';
  const which=Object.hasOwn(BUILDING_LOADERS,requested) ? requested : 'conservatory';
  planName=which;
  try{
    const mod=await BUILDING_LOADERS[which]();
    const data=mod[which] || mod.default;
    FP.compile(data.levels, {width:data.width, height:data.height, widenCorridors:data.widenCorridors,connectors:data.connectors||[],doors:data.doors||[]});
    inertBellTowerInstances=null;
    doorLeafVisualCache.group=null;doorLeafVisualCache.entries.length=0;
    natatoriumBasinBounds = which === 'conservatory' ? WATER.computeNatatoriumBasinBounds(FP) : null;
    facilityMapSource=null; facilityMapCache={key:'',model:null}; HUSH_MAP_TELEMETRY.reset();
    if(data.spawn) FP.setSpawn(data.spawn.x, data.spawn.y);
    // ?at= is a debug spawn and outranks the building's front door.
    const at=params().get('at');
    if(data.spawn && !(at && /^-?\d+,-?\d+$/.test(at))){
      const saved=getSave(),sx=Number(saved.px),sy=Number(saved.py);
      const canRestore=Number(saved.steps)>0&&Number.isFinite(sx)&&Number.isFinite(sy)&&!FP.isSolid(sx,sy);
      const start=canRestore?{x:sx,y:sy}:FP.spawn();
      px=start.x;py=start.y;
    }
    FP.loadDoorState(getSave().doors);
    // The grey door does not come back. There is no room for this in the door
    // save schema (normalizeDoorSave keeps only state/wedge/closerArmed), so it
    // is story state, replayed here before the plan texture is uploaded below —
    // the wall has to already be solid when the renderer first reads it.
    if(which==='conservatory'&&flagTest('door.grey.retired')) FP.retireDoor(GREY_DOOR_ID);
    if(which==='conservatory'&&!normalizeChunkSurfState(getSave().chunkSurf).active){
      const tower=repairLegacyTowerLayout(chapelTowerState());
      if(tower.phase===CHAPEL_TOWER_PHASE.TRANSITION_READY){px=CHAPEL_OUTER_CHECKPOINT.x;py=CHAPEL_OUTER_CHECKPOINT.y;}
      else if(tower.phase===CHAPEL_TOWER_PHASE.TOWER_ACTIVE){const checkpoint=towerCheckpointFor(tower);px=checkpoint.x;py=checkpoint.y;R3.r3dSetFacing(checkpoint.facing);}
      else if([CHAPEL_TOWER_PHASE.TOWER_CLEARED,CHAPEL_TOWER_PHASE.CHAPEL_FINAL].includes(tower.phase)){syncChapelTowerKeyring(tower);}
      else if(FP.zoneAt(px,py)===ZONE.chapel){px=CHAPEL_OUTER_CHECKPOINT.x;py=CHAPEL_OUTER_CHECKPOINT.y;}
    }
    if(which==='conservatory'){
      stopDockHauntingAudio();dockHauntingFrame=null;dockHauntingScene=null;dockHauntingStagingPoint=null;dockCommandUntil=0;
      dockTransit=freshDockTransitState({inside:FP.zoneAt(px,py)===ZONE.dock});
      // A pre-feature save already out in the building has plainly departed.
      // Record that fact without staging the event; only a later walked return
      // can trigger it. Explicit debug spawns remain ineligible.
      if(!flagTest('dock.departed')&&setupComplete()&&Number(getSave().steps)>0
         &&FP.zoneAt(px,py)!==ZONE.dock&&!params().has('at'))flagSet('dock.departed');
    }
    const p=FP.floorplan(),physicalPlan=FP.physicalRenderPlanFor(px,py);
    R3.r3dSetPlan(physicalPlan.rgba,physicalPlan.w,physicalPlan.h,physicalPlan.material);
    r3dCache.physicalGroup=physicalPlan.group;
    r3dCache.physicalKey=physicalPlan.key;
    MUT.mutateInit();
    // He left them where he turned around. Pages already read stay picked up
    // across a reload — the building may move, the paper does not come back.
    if(which==='conservatory'){
      PROPS.propsInit(FP);
      buildingPresenceNavigation=createPresenceNavigation({
        isSolid:(x,y)=>FP.isSolid(x,y)||natatoriumWaterBlocksAt(x,y),
        canStep:(ax,ay,bx,by)=>FP.canStep(ax,ay,bx,by,{keys:playerKeys}),
        canOccupy:(x,y)=>PROPS.propCanOccupy(x,y),
        connectorDestination:FP.connectorDestination,
        planSize:FP.planSize,
        keys:playerKeys,
      });
      syncDroppedRadioProp();
      R3.r3dSetProps(worldRenderInstances(physicalPlan.group));
      syncDoorDynamicProps();
      const read=new Set(OBJ.objState().read);
      for(const pg of PAGES){
        const at=FP.toRuntimePoint(pg.at);
        if(read.has(pg.id) || FP.isSolid(at.x, at.y)) continue;
        OBJ.placePage(at.x, at.y, pg.room, pg.id);
      }
      syncVisiblePages();
      syncStoryObjectProps();
      R3.r3dSetProps(worldRenderInstances(physicalPlan.group));
    } else { buildingPresenceNavigation=null; R3.r3dSetProps([]); }
    if(!resumeStairAnomalyFromSave()&&!resumeSourceSpaceFromSave()&&!resumeDockHauntingFromSave()){
      revealAround(px,py);
      faceOpenDirection();
        if(
          storyMode &&
          chapelTowerState().phase === CHAPEL_TOWER_PHASE.TOWER_ACTIVE
        ){
          startBellTowerRuntime({retry:true});
        }
    }
    if(KEY_DEBUG) pushEvent(`// ${which}: ${p.w}×${p.h} cells.`);
  }catch(err){
    console.error('floorplan failed to load', err);
  }
}

// A run has to start in a silent room.
//
// Almost nothing in this game's audio is short: instrument stems run minutes, the
// scream thirty seconds, the tape hiss and room bed are held open until something
// closes them, and the hush's own runtime holds a mix. Ending a run never asked
// any of them to stop, so restarting one inherited whatever was still ringing
// wherever the last one ended — a held instrument from the natatorium, a stem
// mid-chop, the finale's bed under a loading dock.
//
// This is the one place that reaches for everything, so there is one answer to
// "why can I hear the last run".
function resetRunAudio(reason='run-reset'){
  SPEECH.clearSpeech();
  CUES.stopAllCues(0.06);
  clearInstrument();
  stopHushAudioRuntime();
  stopAllVoices();
  stopWorldLayerVoice();
  silenceAmbientDrone();
  silenceSampleField();
  STORY.stopAll();
  RT.setBed(0, 0.1);
  electricalHumRuntime?.update?.({gain:0,pan:0});
  personalInterference.clear();
  // The dread director and the hush's mischief keep wall-clock schedules; a new
  // run is not owed the last one's timers.
  mischiefNextAtMs=0;
  mischiefQuietUntilMs=0;
  STAB.reportThreat();
  pushEvent(`// audio reset (${reason}).`);
}

function enterStory(){
  sampleFieldEnabled=false;
  storyMode=true;
  resetRunAudio('enter-story');
  silenceSampleField();
  applyCurrentRunDifficulty();
  ensureCtx();
  if(actx && getSave().settings?.mic==='on') startRoomMic();
  setGameChrome(true);
  playerKeys.clear();playerKeys.add('master');
  if((getSave().items||[]).includes('chapel_key'))playerKeys.add('chapel');
  syncChapelTowerKeyring();
  REC.loadRecState(getSave().rec);
  PRES.loadPresenceState(getSave().presence);
  resetHushContactSession();
  OBJ.loadObjState(getSave().obj);
  if(chapelTowerState().phase!==CHAPEL_TOWER_PHASE.FORESHADOW)syncTowerWaypoint();
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
    // Six seconds is a level check. It sets the gate flag, hands the recorder
    // back, and drifts into the daydream (see onLevelsSet).
    onLevelsGood:()=>setTimeout(onLevelsSet, 700) });
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
  const qp=params();
  // ?flags=a,b=2 — force story state for testing
  const flagParam=qp.get('flags');
  if(flagParam) flagApply(flagParam.split(',').filter(Boolean));
  ensureCtx();
  if(inRogue&&RENDERER==='3d') ensureLensStarted(qp,{quietBlocked:true});
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
            // Straight into the dark and the setup. The door he came in through
            // is behind him and still there; losing it is something he has to go
            // and find out (see tryTheGreyDoor), not something the game does to
            // him on a timer before he has even found the torch.
            onDone:()=>TUT.startTutorial(),
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

function authoredAssetUrl(assetId){
  const asset=authoredAudioProject?.()?.assets?.find?.((a)=>a.id===assetId);
  return asset?.path ? assetUrl(asset.path) : null;
}
function cueAssetUrl(cueId){
  const layer=authoredCue?.(cueId)?.layers?.[0];
  return layer?authoredAssetUrl(layer.assetId):null;
}
// The breakbeat is now a LOOP beat's voice rather than a backing, and a weapon
// stem has to be decoded before its first chop or the first hit is silent.
function warmBattleVoices(){
  ensureCtx();
  for(const id of [BREAKBEAT_CUE,'marimba.weapon.01','piano.weapon.01','violin.weapon.01']){
    const url=cueAssetUrl(id);
    if(url) CUES.preload(url);
  }
}

// `shape` overrides the authored layer options for this firing: a voice group
// so the cue can be cut, a slice (trimStart/trimEnd/rate) for a chop, and
// `gainScale` to duck it against whatever the author set. Everything omitted
// stays exactly as authored.
// The one "cue" that is not a sound: the line in the post-door beat where his
// hand finds mortar is the line the door stops existing on. Authored onto the
// line (content/narrative/conservatory.post_door.story.json) rather than run off
// a timer, so it lands exactly when he reads it, however fast he reads.
const CUE_SEAL_GREY_DOOR='door.grey.seal';

function fireCue(name, shape=null){
  if(name===CUE_SEAL_GREY_DOOR){ sealTheGreyDoor(); return true; }
  ensureCtx();
  const { gainScale=1, skipEffects=false, ...override } = shape || {};
  return dispatchAuthoredCue(name, {
    play:(url, options)=>CUES.playCue(url, { ...options, ...override, gain:(options.gain ?? 1) * gainScale }),
    effect:(event)=>{
      // A chop is a quarter-second of a tape, not the authored moment: it does
      // not get that moment's screen shake every time the surfer swings it.
      if(skipEffects) return;
      const [scope, action, a, b]=String(event).split(':');
      if(scope==='fx' && action==='flash') CR.fx.flash(Number(a)||120, 'rgba(6,6,8,0.85)');
      else if(scope==='fx' && action==='shake') CR.fx.shake(Number(a)||1, Number(b)||420);
      else if(scope==='look') applyLensPreset(action);
      else if(scope==='story' && action==='stop-booth') STORY.stopBoothTone({fade:0.35});
      else if(scope==='story' && action==='stop-rain') STORY.stopRain({fade:1.4});
      else if(scope==='threat' && action==='report') STAB.reportThreat();
      else if(scope==='fear' && action==='bump' && storyMode) bumpFear(Number(a)||0, {stinger:Number(b)||0});
    },
    acoustic:(spec)=>{
      if(!storyMode || !spec.emitsWorldNoise) return;
      REC.addNoise(Number(spec.level)||0, px, py, spec.reason||name, {
        kind:spec.kind, sourceKind:spec.sourceKind, sourceId:spec.sourceId,
        playerGenerated:true, deliberate:true,
      });
      if(spec.markHeard) MUT.markHeard(px, py, 1);
    },
  });
}

function roomMicInputOptions(extra = {}) {
  return { ...(getSave().settings?.micInput || {}), ...extra };
}

function startRoomMic(options = {}) {
  ensureCtx();
  if (!actx) return null;
  return MIC.micInit(actx, roomMicInputOptions(options));
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
function converse(id, nodes, { startAt='start', onChoice, onDone, scrim=0.5, anchor='center' }={}){
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
    scrim, anchor,
    onChoice: (c)=>{ applyStoryChoice(c); onChoice?.(c); },
    onDone,
  }));
}

// The push bar is not where the push bar is. Which question he asks himself
// depends entirely on what he did at the booth.
// ── the grey door ───────────────────────────────────────────────────────────
// The door he came in through, and the one beat in the game that used to happen
// TO the player instead of because of them: he panicked about losing his exit on
// a timer, eleven seconds after the title, standing in the middle of a dark room
// with his hands full and nothing behind him to reach for.
//
// Now the door is really there — grey steel, dead centre of the dock's north
// wall, directly ahead of where he starts, locked with his own key. Walking up to
// it and reaching for it is what starts the beat, and the beat is what takes it
// away: the leaf, frame and head are retired mid-sentence and the wall closes
// over them while he has his hand on it (see FP.retireDoor). He is never allowed
// to open it. That is the whole point of putting it there.
//
// It is optional, and being optional is what makes it mean something — see
// greyDoorSearched() for what the ending does with a man who never went looking.
// ── loading dock: LAST LOAD-OUT / impossible return ─────────────────────────
// The event is not a puzzle. The player crosses an ordinary door and the HUSH
// performs it. Transit memory is session-only; the result is persisted before
// the first lamp wakes so a reload can never farm or replay the scene.
let dockTransit=freshDockTransitState({inside:true});
let dockHauntingFrame=null;
let dockHauntingScene=null;
let dockHauntingStagingPoint=null;
let dockCommandUntil=0;
const dockHauntingSources=new Set();
const dockHauntingTimers=new Set();
const dockHauntingVoices=new Set();
let dockCommandVoices=null;

function dockHauntingEffectsMode(){
  const flash=String(getSave().settings?.flash||'full');
  return ['full','reduced','off'].includes(flash)?flash:'full';
}

function syncDockHauntingPresentation({refreshStatic=false}={}){
  if(RENDERER!=='3d'||!usingPlan()||usingSpecialSpace())return;
  const group=FP.logicalToPhysical(px,py).renderGroup;
  if(refreshStatic)R3.r3dSetProps(worldRenderInstances(group));
  else syncArchitecturalLocalLights(group);
  syncDoorDynamicProps();
}

function dockDoorEndpoints(){
  const states=FP.saveDoorState()?.states||{};
  return Object.fromEntries(Object.values(DOCK_PORTAL).filter((id)=>states[id]).map((id)=>[id,{...states[id]}]));
}

function stopDockHauntingAudio(){
  for(const timer of dockHauntingTimers)clearTimeout(timer);
  dockHauntingTimers.clear();
  for(const source of dockHauntingSources){try{source.stop();}catch(_){ }try{source.disconnect();}catch(_){ }}
  dockHauntingSources.clear();
  for(const voice of dockHauntingVoices)voice?.stop?.();
  dockHauntingVoices.clear();
  CUES.stopCueGroup('dock-haunting',.001);
}

function ensureDockCommandVoices(){
  if(dockCommandVoices)return dockCommandVoices;
  const audioFor=(destination)=>()=>{ensureCtx();return actx?{ctx:actx,destination:destination()||actx.destination}:null;};
  dockCommandVoices=[
    createSamDialogVoice({volume:.23,getAudio:audioFor(()=>dialogGain||master)}),
    createSamDialogVoice({volume:.13,getAudio:audioFor(()=>sfxGain||master)}),
    createSamDialogVoice({volume:.08,getAudio:audioFor(()=>outputMonitor||master)}),
  ];
  return dockCommandVoices;
}

function issueDockCommand({coffee=false}={}){
  dockCommandUntil=performance.now()+4200;
  pushEvent('COME CLOSER');
  for(const [index,voice] of ensureDockCommandVoices().entries()){
    const handle=voice.start('COME CLOSER',{speaker:'surfer',rate:(coffee ? .94 : 1)+(index-1)*.018});
    dockHauntingVoices.add(handle);
  }
  const at=dockHauntingStagingPoint?FP.toRuntimePoint(dockHauntingStagingPoint):{x:px,y:py};
  REC.emitNoise(.28,at.x,at.y,'a voice in every return',{
    spoils:false,kind:'voice',sourceKind:'hush',sourceId:'dock-compliance-command',
    playerGenerated:false,audibleToHush:false,audibleToMonitor:false,canSpoilTake:false,deliberate:true,
  });
}

function playDockHauntingStab(milestone,{delayMs=0,opening=false}={}){
  const start=()=>{
    const chunk=STAB.drawFromPool(opening?8:Math.max(10,Math.round(24-milestone*12)));
    ensureCtx();
    if(!actx||!chunk?.buffer||!sfxGain)return;
    const now=actx.currentTime,src=actx.createBufferSource(),filter=actx.createBiquadFilter();
    const room=actx.createGain(),direct=actx.createGain(),pan=actx.createStereoPanner();
    src.buffer=chunk.buffer;
    src.playbackRate.setValueAtTime((dockHauntingFrame?.coffee?.70:.82)+milestone*.33+Math.random()*.08,now);
    filter.type='bandpass';filter.frequency.setValueAtTime(520+milestone*1900,now);filter.Q.setValueAtTime(.5+milestone*1.6,now);
    const peak=(opening?.46:.17+milestone*.36)/(1+Math.max(0,delayMs)/900);
    room.gain.setValueAtTime(0,now);room.gain.linearRampToValueAtTime(peak,now+.004);room.gain.exponentialRampToValueAtTime(.0004,now+.75);
    direct.gain.setValueAtTime(0,now);direct.gain.linearRampToValueAtTime(peak*.22,now+.004);direct.gain.exponentialRampToValueAtTime(.0004,now+.58);
    pan.pan.setValueAtTime((Math.random()*2-1)*.92,now);
    src.connect(filter);filter.connect(room);room.connect(pan);pan.connect(sfxGain);
    filter.connect(direct);direct.connect(sfxDirectGain||master);
    dockHauntingSources.add(src);
    src.onended=()=>{dockHauntingSources.delete(src);try{src.disconnect();filter.disconnect();room.disconnect();direct.disconnect();pan.disconnect();}catch(_){ }};
    src.start(now);src.stop(now+Math.min(1.15,chunk.buffer.duration));
  };
  if(delayMs<=0){start();return;}
  const timer=setTimeout(()=>{dockHauntingTimers.delete(timer);start();},delayMs);
  dockHauntingTimers.add(timer);
}

function onDockHauntingMilestone(milestone,frame){
  const swarm=milestone>=.92?4:milestone>=.73?3:milestone>=.43?2:1;
  for(let index=0;index<swarm;index++)playDockHauntingStab(milestone,{delayMs:index*(frame.coffee?58:92)});
  const active=normalizeDockHauntingState(getSave().dockHaunting);
  saveCommit({dockHaunting:{...active,firedMilestones:frame.firedMilestones}});
}

function onDockHauntingUpdate(frame){
  dockHauntingFrame=frame;
  syncDockHauntingPresentation();
}

function fallbackPresenceSpawn(){
  const [forwardX,forwardY]=R3.r3dDelta(1);
  return PRES.spawnInHabitableSpace(px,py,{navigation:buildingPresenceNavigation,forwardX,forwardY})
    || PRES.spawnBehind(px,py,-forwardX,-forwardY);
}

function resolveDockHaunting(){
  const active=normalizeDockHauntingState(getSave().dockHaunting);
  if(active.status!==DOCK_HAUNTING_STATUS.ACTIVE)return false;
  const scene=dockHauntingScene;
  stopDockHauntingAudio();
  dockCommandUntil=0;
  FP.setDoorOpen(active.entryPortal,true);
  const other=active.entryPortal===DOCK_PORTAL.FOYER?DOCK_PORTAL.SERVICE:DOCK_PORTAL.FOYER;
  FP.setDoorOpen(other,false);
  const hasFirstRecording=REC.recState().takes.length>0;
  if(!hasFirstRecording)PRES.endPresenceTableau({despawn:true});
  else if(!PRES.endPresenceTableau({restore:active.presenceSnapshot}))fallbackPresenceSpawn();
  dockHauntingScene=null;dockHauntingFrame=null;dockHauntingStagingPoint=null;
  const flags=getSave().flags;flags['dock.haunting.spent']=true;flags['dock.haunting.variant']=active.variant;
  saveCommit({
    flags,
    doors:FP.saveDoorState(),
    presence:PRES.savePresenceState(),
    dockHaunting:{...active,status:DOCK_HAUNTING_STATUS.RESOLVED},
  });
  if(scene)scenes.remove(scene);
  syncDockHauntingPresentation({refreshStatic:true});
  return true;
}

function createDockHauntingRuntime(active,{announce=false}={}){
  dockHauntingStagingPoint=dockHauntingStaging({entryPortal:active.entryPortal,variant:active.variant});
  const staged=FP.toRuntimePoint(dockHauntingStagingPoint,{center:false});
  PRES.beginPresenceTableau({x:staged.x,y:staged.y,snapshot:active.presenceSnapshot});
  for(const id of Object.values(DOCK_PORTAL))FP.setDoorOpen(id,false);
  const scene=makeLoadingDockHauntingScene({
    variant:active.variant,entryPortal:active.entryPortal,effects:dockHauntingEffectsMode(),coffee:active.coffee,
    firedMilestones:active.firedMilestones,
    distanceMeters:()=>PRES.distanceTo(px,py)*CELL,
    onMilestone:onDockHauntingMilestone,onUpdate:onDockHauntingUpdate,
    onContact:resolveDockHaunting,
    onRender:()=>{},
    // Stack teardown is not contact. Keep the persisted tableau active so a
    // reload can reconstruct it; only the physical distance threshold may
    // mark the compliance test resolved.
    onExit:()=>{
      if(dockHauntingScene!==scene)return;
      const held=normalizeDockHauntingState(getSave().dockHaunting);
      stopDockHauntingAudio();dockCommandUntil=0;
      dockHauntingScene=null;dockHauntingFrame=null;dockHauntingStagingPoint=null;
      PRES.endPresenceTableau({restore:held.presenceSnapshot});
      syncDockHauntingPresentation({refreshStatic:true});
    },
  });
  dockHauntingScene=scene;dockHauntingFrame=scene.view();
  syncDockHauntingPresentation({refreshStatic:true});
  scenes.push(scene);
  if(announce){
    CUES.playCue(CUES.CUE.door,{gain:.62,rate:.48,lowpassHz:900,group:'dock-haunting'});
    if((getSave().settings?.shake||'full')==='full')CR.fx.shake(.72,260);
    playDockHauntingStab(.04,{opening:true});
    issueDockCommand({coffee:active.coffee});
  }
  scene.update(0);
  return true;
}

function beginDockHaunting(entryPortal){
  if(dockHauntingScene||usingSpecialSpace()||!storyMode)return false;
  const decision=deriveDockHauntingEligibility({
    departed:flagTest('dock.departed'),spent:flagTest('dock.haunting.spent'),
    transitionKind:'step',entryPortal,
  });
  if(!decision.eligible)return false;
  const presenceSnapshot=PRES.capturePresenceTableauState();
  const active=normalizeDockHauntingState({
    status:DOCK_HAUNTING_STATUS.ACTIVE,entryPortal,variant:decision.variant,
    firedMilestones:[],doorEndpoints:dockDoorEndpoints(),presenceSnapshot,
    doorAttempted:false,coffee:flagTest('drank.coffee'),
  });
  const flags=getSave().flags;
  flags['dock.haunting.spent']=true;
  flags['dock.haunting.variant']=decision.variant;
  for(const id of Object.values(DOCK_PORTAL))FP.setDoorOpen(id,false);
  saveCommit({flags,props:PROPS.savePropState(),dockHaunting:active,doors:FP.saveDoorState()});
  return createDockHauntingRuntime(active,{announce:true});
}

function resumeDockHauntingFromSave(){
  if(planName!=='conservatory'||usingSpecialSpace()||params().has('at'))return false;
  const active=normalizeDockHauntingState(getSave().dockHaunting);
  if(active.status!==DOCK_HAUNTING_STATUS.ACTIVE)return false;
  return createDockHauntingRuntime(active,{announce:false});
}

function tryDockHauntingDoor(focus){
  const active=normalizeDockHauntingState(getSave().dockHaunting);
  const id=focus?.door?.portal?.id;
  if(active.status!==DOCK_HAUNTING_STATUS.ACTIVE||!focus?.doorWins||!Object.values(DOCK_PORTAL).includes(id))return false;
  CUES.playCue(CUES.CUE.keys,{gain:.46,rate:.46,lowpassHz:1100,group:'dock-haunting'});
  CUES.playCue(CUES.CUE.door,{gain:.23,rate:.28,lowpassHz:480,group:'dock-haunting'});
  if(!active.doorAttempted){
    saveCommit({dockHaunting:{...active,doorAttempted:true}});
    SPEECH.say({who:'you',text:'No. Something is holding the key.'});
  }
  return true;
}

function noteDockTransitStep(from,to){
  if(planName!=='conservatory'||usingSpecialSpace())return;
  dockTransit=reduceDockTransit(dockTransit,{
    kind:'step',
    fromDock:FP.zoneAt(from.x,from.y)===ZONE.dock,toDock:FP.zoneAt(to.x,to.y)===ZONE.dock,
    fromPortal:FP.doorAt(from.x,from.y)?.id||null,toPortal:FP.doorAt(to.x,to.y)?.id||null,
  });
  if(dockTransit.departedNow&&setupComplete()&&!flagTest('dock.departed'))flagSet('dock.departed');
  if(dockTransit.enteredNow)beginDockHaunting(dockTransit.entryPortal);
}

const GREY_DOOR_ID='dock-grey-exterior';
function greyDoorRetired(){ return flagTest('door.grey.retired'); }
function greyDoorNear(){
  if(!storyMode || !usingPlan() || usingSpecialSpace() || greyDoorRetired()) return null;
  const hit=focusedWorldDoor(4.5);
  return hit?.portal?.id===GREY_DOOR_ID ? hit.portal : null;
}

// The wall closes. Called between the reach and the mortar, so the player is
// looking at the door when it stops being one.
function sealTheGreyDoor(){
  if(greyDoorRetired()) return false;
  if(!FP.retireDoor(GREY_DOOR_ID)) return false;
  flagApply(['door.grey.retired']);
  saveCommit({ flags:getSave().flags, doors:FP.saveDoorState() });
  refreshRetiredDoorWorld();
  // Not a door sound. A low, wrong, settling one — the building taking it back.
  CUES.playCue(CUES.CUE.door, {gain:.5, rate:.42, lowpassHz:520});
  CR.fx.shake(1.1, 520);
  return true;
}

// The masonry is new geometry AND new material, so the raymarcher's plan texture
// and the static instance list both have to be rebuilt — the same refresh a
// mutation does.
function refreshRetiredDoorWorld(){
  if(RENDERER!=='3d' || !usingPlan()) return;
  const p=FP.physicalRenderPlanFor(px,py);
  R3.r3dSetPlan(p.rgba,p.w,p.h,p.material);
  r3dCache.physicalGroup=p.group;
  r3dCache.physicalKey=p.key;
  r3dCache.fogSize=-1;
  doorLeafVisualCache.group=null;doorLeafVisualCache.entries.length=0;
  facilityMapCache={key:null,model:null};
  syncStoryObjectProps();
  syncDoorDynamicProps();
}

// [e] on the grey door. Runs the post-door tree, which is where the panic and the
// confession both live.
//
// It must NEVER be a press that does nothing. The door was offering
// "[E] THE DOOR YOU CAME IN THROUGH" and then swallowing the key, because
// `think()` declines a tree whose id has already been marked had — and `post-door`
// is marked by any earlier run of the beat, including every save made while it
// still fired automatically after the title. So the prompt was live, the verb was
// eaten, and nothing happened.
//
// The DOOR is the once-only gate here: it retires itself, so the beat cannot
// repeat anyway. That makes the thought-bookkeeping gate redundant — hence
// `force` — and if the scene still declines for any reason, the press seals the
// wall itself rather than doing nothing at all.
function tryTheGreyDoor(){
  if(!greyDoorNear()) return false;
  if(!postDoorThought()) {
    sealTheGreyDoor();
    SPEECH.sayAll([
      { who:'direction', text:'Painted breeze block, cold, and a seam of mortar where your thumb expects a steel push bar.' },
      { who:'you', text:'It was here. I came through it. It was here.' },
    ]);
  }
  return true;
}

function postDoorThought(onDone){
  const frame=prologueKnowledgeFrame() || 'self';
  const before=flagGet('confession.kind');
  const opened=think('post-door', POST_DOOR, {
    startAt: frame,
    force: true,
    onDone: ()=>{
      // Going looking for your own exit on night one is the qualification for
      // the ending that sends you back for it (see openEndingChoice), and how
      // you left it decides how that run behaves (see startEscape).
      const said=flagGet('confession.kind');
      flagApply([
        'finale.grant.route.inversion',
        `door.grey.searched=${said && said!=='nothing' ? 'tried' : 'settled'}`,
      ]);
      void before;
      // Whatever else happened, the wall is closed by the end of the beat. This
      // is the backstop for a player who skipped the line that closes it.
      sealTheGreyDoor();
      saveCommit({ flags:getSave().flags });
      onDone?.();
    },
  });
  return !!opened;
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
// Setup is the one hard gate: a real take counts only after the recordist has
// set his levels and held the six seconds. Both happen on the dock, in the dark,
// before the night's work — going to B3 first is not signposted, it is required.
function setupComplete(){ return flagTest('setup.levels') && flagTest('combat.trained'); }

// A level check is not a take, and the dock is not one of the five rooms. It has
// its own id so nothing it does can be filed against studio B3, whose world id
// the dock happens to share (ZONE_WORLD).
const LEVEL_CHECK_ROOM='loading_dock';

// The dock is the ONE room he will not leave with the job half-set, and this is
// the one line in the game that has to be blunt. Everything else in the dock is
// free: look around it, pick things up, try the door he came in through. This is
// the only wall, and it says plainly what is outstanding and which key does it.
//
// Register matters here and the poetry was the bug: "I don't move until I've run
// the worst room in my head" was a nice sentence, useless to a player standing
// at a door that will not open. Concrete, practical, and it names the key.
//
// It also does not merely refuse. When the hold is the only thing left,
// walking at the door is what STARTS it — so the wall is never a thing you have
// to go away and solve somewhere else.
let dockRefuseLockUntilMs=0;
function refuseDockExit({speak=true}={}){
  if(!speak)return false;
  const now=performance.now();
  if(now<dockRefuseLockUntilMs) return false;
  dockRefuseLockUntilMs=now+2600;
  fireCue('bag');
  if(!flagTest('setup.levels')){
    SPEECH.say({ who:'you', text:`No. I know this trick: leave the first check till later and later never comes. ${BINDINGS.inputPrompt('recorder')}. Light out. Six quiet seconds. Then the door.` });
    return true;
  }
  if(!flagTest('combat.trained')){
    SPEECH.say({ who:'you', text:`No, I counted it but I did not hold it. Back on the mark. ${BINDINGS.inputPrompt('recorder')}, feet still. Do it properly and then we go.` });
    return true;
  }
  return false;
}

// The doors out, before the job is set. He has the key to every one of them and
// says so — the discipline is his, not the lock's. Throttled the same way the
// threshold refusal is, and it never stops him: it is a man talking himself out
// of leaving, and after setup these doors open like any other.
const EXIT_DOOR_IDS=new Set([GREY_DOOR_ID,'front-main']);
let exitDoorLockUntilMs=0;
let exitDoorFocusId=null,exitDoorFocusSinceMs=0;
function speakAtExitDoor(){
  if(!storyMode || setupComplete()) {exitDoorFocusId=null;exitDoorFocusSinceMs=0;return;}
  const hit=focusedWorldDoor(3.5);
  const id=hit?.portal?.id;
  if(!id || !EXIT_DOOR_IDS.has(id)){exitDoorFocusId=null;exitDoorFocusSinceMs=0;return;}
  if(id===GREY_DOOR_ID && !greyDoorRetired()){exitDoorFocusId=null;exitDoorFocusSinceMs=0;return;}   // that one has its own beat
  const now=performance.now();
  if(exitDoorFocusId!==id){exitDoorFocusId=id;exitDoorFocusSinceMs=now;return;}
  if(now-exitDoorFocusSinceMs<1100)return;
  if(now<exitDoorLockUntilMs) return;
  exitDoorLockUntilMs=now+9000;
  exitDoorFocusSinceMs=now;
  SPEECH.say({ who:'you', text: flagTest('setup.levels')
    ? "That door can wait. If I leave the check half-done, I will hear it in every room after this one."
    : "In a second. First I listen to the room I am actually standing in." });
}
// The room the running take belongs to — decided when it starts, not re-asked
// from the floor he happens to be standing on when it stops.
let takeRoom=null;
let humRecordConsent=null;       // first [r] refuses; a deliberate second press overrides
let armedTakeContamination=null; // snapshot carried through LISTEN into the take
let activeTakeContamination=null;
// Levels get set where the kit gets set up: the dock. B3 also answers, so a
// player who skipped the intro is never left without a way to set them.
function levelCheckHere(){
  if(!usingPlan() || usingSpecialSpace()) return false;
  return FP.zoneAt(px,py)===ZONE.dock || recordableRoomAt(px,py)==='main_b3';
}


// ── the daydream ────────────────────────────────────────────────────────────
// He is not rehearsing. He does not want a fight and he is not preparing for one.
// He wants six seconds of test audio, and to get them he has to stand perfectly
// still in a dark room with nothing to do, which is the most boring thing a
// person can be asked to do — so he counts, and his mind goes where a bored mind
// goes. He talks himself into a stupid ghost story and then he is IN it.
//
// The fight is an accident of being bored. Nothing in here is allowed to sound
// like a man steeling himself: no rehearsing, no "the worst room", no getting the
// shape of it. Just a tired professional holding a take and amusing himself.
const DAYDREAM_DRIFT = Object.freeze([
  "God, it's dead in here. Minus sixty at least. You could hear a moth.",
  "Five rooms. One of them's got water in it, they said. Who fills a room with water and calls it a job.",
  "A natatorium. Fancy word for a drowned gym.",
  "I could be asleep. I could be anywhere that isn't forty feet under a dead building.",
  "Nothing down there but damp and a raccoon. It's always a raccoon.",
  "Wonder what's actually in that basement, though.",
  "They say the west stair goes down further than the plans admit to. Everyone jokes about that.",
]);
const DAYDREAM_SILLY = Object.freeze([
  "Ooh, spooky. Big horrible demon down there, probably. Me and a torch and a Nagra against it.",
  "Something enormous in the dark going ROOOAR, and me going hold on, let me just get a level on that.",
  "Giant devil in the deep end. I fight it off with a boom pole. They put it in the trade magazines.",
  "And it turns out to be nine feet tall and I beat it to death with a windshield. Front page of Resolution.",
]);

function shufflePick(arr, n){
  const pool=[...arr];
  for(let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
  return pool.slice(0, Math.max(0, Math.min(pool.length, n)));
}

// He counts the hold out loud, drifts between numbers, and by the last one he has
// talked himself into something daft. Drawn fresh each run so the drift is a
// little different, while the shape — count, drift, joke, and then he is in it —
// stays put. A beat, not a battle intro: it plays on its own and hands over.
function daydreamBeat(){
  const drift=shufflePick(DAYDREAM_DRIFT, 3);
  const silly=shufflePick(DAYDREAM_SILLY, 1)[0];
  const pause={ who:'you', text:'...' };
  return [
    { who:'direction', text:'Rolling. Feet still, hands off the light, and nothing to do for six seconds but count them.' },
    { who:'you', text:'One.' },
    pause,
    { who:'you', text:'Two.' },
    pause,
    { who:'you', text:'Three.' },
    { who:'you', text:drift[0] },
    pause,
    { who:'you', text:'Four.' },
    { who:'you', text:drift[1] },
    pause,
    { who:'you', text:'Five.' },
    { who:'you', text:drift[2] },
    { who:'you', text:silly },
    { who:'you', text:'Heh.' },
    pause,
    { who:'you', text:'Six. There. That is a level.' },
    { who:'direction', text:'The needle settles. So do your eyes.' },
  ];
}

// Six clean seconds. The flag goes on and the recorder comes back — and the
// daydream he has been talking himself into for the whole hold takes over. He did
// not decide to do this; he was bored, and now his eyes are shut.
function onLevelsSet(){
  if(flagTest('setup.levels')) return;
  flagApply(['setup.levels']);
  // The recorder KEEPS ROLLING through the daydream. He set out to hold six
  // seconds, got bored, drifted, and is still standing there with the tape
  // running — which is both the truth of the scene and the only way the player
  // can watch the DA-1000 while he counts it out. The take is stopped at the
  // ripple instead (dreamRippleIntoDrill).
  if(REC.isRecording() && !daydreamRunning && !flagTest('combat.trained')) stopTake();
  else if(REC.isRecording() && flagTest('combat.trained')) stopTake();
  saveCommit({ flags:getSave().flags });
  if(flagTest('combat.trained')) return;   // already been through it (legacy save)
  // The beat is normally already running (see roll → beginDaydream). This is the
  // fallback for levels set some other way — a skipped intro, the loop's
  // six-second catch — so the daydream never simply fails to happen.
  if(!daydreamRunning) beginDaydream();
}

// The dream ripple, and then he is in it. The lens goes soft and wrong for a beat
// so the cut into the fight reads as falling asleep rather than as a scene change.
function dreamRippleIntoDrill(){
  // He has been holding the take all the way through the drift. The recorder
  // clicks off as he goes under — this is where the six seconds actually end.
  if(REC.isRecording()) stopTake();
  if(flagTest('combat.trained')) return;
  applyLensPreset('rupture');
  CR.fx.glitch(0.55, 900);
  CR.fx.flash(420, 'rgba(10,14,20,0.55)');
  CUES.playCue(CUES.CUE.recorder, {gain:.28, rate:.34, lowpassHz:700});
  setTimeout(()=>{ if(storyMode && !flagTest('combat.trained')) openTrainingBattle(); }, 1100);
}

// The count, the drift, the daft joke, and then the ripple. Runs on the world
// surface while the take rolls, so the six seconds he is counting are the six
// seconds the recorder is actually holding.
let daydreamRunning=false;
function beginDaydream(){
  if(daydreamRunning || flagTest('combat.trained')) return false;
  daydreamRunning=true;
  // No scrim, and down at the foot of the screen: the DA-1000 take overlay is
  // drawn before scenes (drawStoryHud → scenes.render), so a centred panel over a
  // scrim used to bury the machine this beat is narrating. He counts the seconds
  // and you watch the meter hold them — that is the whole lesson.
  const opened=converse('daydream', { start:{ lines:daydreamBeat() } }, {
    scrim:0, anchor:'bottom',
    onDone:()=>{ daydreamRunning=false; dreamRippleIntoDrill(); },
  });
  // `?nothink=1` and the mechanism suites get no dialog surface at all. The drill
  // still has to happen, or the dock gate can never be cleared.
  if(!opened){ daydreamRunning=false; dreamRippleIntoDrill(); }
  return true;
}

// Out the other side — win or lose, he has had the daft dream and the setup is
// done with it. He opens his eyes on the dock with the levels good, slightly
// embarrassed, and the night's work begins: the bearing down to Studio B3.
function finishSetupRehearsal(){
  fireCue('bag');
  // The kit is honest and the six seconds are held. The last thing he owes
  // himself is a bearing — and the waypoint is the one verb the player has not
  // been walked through yet, so it gets the monitor shell rather than a line in
  // the band: the same small machine that talks to them everywhere else, holding
  // still until they have actually done it. The bag prompt flashes underneath
  // (drawStoryHud) and the case itself locks to the map (tutorialGuide).
  //
  // He does NOT mark it for the player. Marking is the verb being taught.
  converse('waypoint-brief', { start:{ lines:[
    { who:'you', text:"Right. Levels are honest, and I am not telling anybody about the rest of that." },
    { who:'direction', text:'Six seconds on tape. The kit is straight. Nothing else in this building is going to be this easy.' },
    { who:'you', text:"Last thing before I go down: write down where I'm going." },
    { who:'you', text:"Bag. There's a floor plan in it. Studio B3 is the one the order wants first — mark it, and the bearing at the top of my eye points at it until I've done it." },
    { who:'direction', text:'The case is in his left hand. The plan is behind the work order.' },
  ] } }, {
    scrim:0.35,
    onDone:()=>{ waypointBriefShownAt=performance.now(); },
  });
}
// When the bag prompt started flashing, so it can settle to a steady glow rather
// than blinking at the player forever.
let waypointBriefShownAt=0;

// ── the mic test ────────────────────────────────────────────────────────────
// He checks a microphone the way anyone checks a microphone: he says something
// into it and watches the needle. It is YOUR mic and YOUR voice — the same input
// that will spoil takes for the rest of the night — and here it costs exactly
// nothing. Nothing is rolling, nothing is kept, nothing in the building can hear
// it, and there is no way to fail it: talk and he acknowledges it, stay quiet
// and he takes the quiet as the answer.
//
// It is skipped without comment when there is no mic to test (?nomic, mic set to
// off, or a permission the player declined). Setup never waits on hardware.
const MIC_TEST=Object.freeze({ speak:0.045, hold:0.45, settle:1.6, wait:3.0, limit:15 });
let micCheck=null;   // {elapsed, spoke, peak, ack, ackAt, onDone}

function micCheckActive(){ return !!micCheck; }

function beginMicTest(onDone){
  const wanted = storyMode && !params().has('nomic') && getSave().settings?.mic!=='off';
  if(!wanted){ onDone?.(); return false; }
  startRoomMic();
  micCheck={ elapsed:0, spoke:0, peak:0, ack:false, ackAt:0, onDone };
  SPEECH.say({ who:'you', text:"Mic first. Say something into it — check, one two — and watch the meter move. Nothing's rolling. The tape isn't running and this room keeps none of it." });
  return true;
}

function finishMicTest(line){
  if(!micCheck) return;
  const done=micCheck.onDone;
  micCheck=null;
  if(line) SPEECH.say({ who:'you', text:line });
  setTimeout(()=>{ if(storyMode) done?.(); }, line?1200:600);
}

function tickMicTest(dt){
  if(!micCheck) return;
  micCheck.elapsed+=dt;
  const level=MIC.micLevel();
  micCheck.peak=Math.max(micCheck.peak, level);
  if(level>=MIC_TEST.speak) micCheck.spoke+=dt;
  else micCheck.spoke=Math.max(0, micCheck.spoke-dt*0.5);

  // No mic, or one the player declined. Say nothing about it and get on with it.
  if(!MIC.micActive() && MIC.micState()!=='asking' && micCheck.elapsed>=MIC_TEST.wait){ finishMicTest(null); return; }

  if(!micCheck.ack && micCheck.spoke>=MIC_TEST.hold){
    micCheck.ack=true;
    micCheck.ackAt=micCheck.elapsed;
    SPEECH.say({ who:'you', text:"There it is. That's me on the meter — and that is exactly what a take hears if I so much as move wrong. Right. Levels." });
  }
  if(micCheck.ack && micCheck.elapsed>=micCheck.ackAt+MIC_TEST.settle){ finishMicTest(null); return; }
  if(micCheck.elapsed>=MIC_TEST.limit) finishMicTest("Quiet in here. Good — that's the number I want on the meter all night.");
}

// The meter, while he tests it. Deliberately the same green VFD as the take
// meter, with the one thing that matters printed under it: nothing is recording.
function drawMicTestOverlay(cols, rows){
  if(!micCheck) return;
  const w=Math.min(64, cols-8);
  const x=Math.floor((cols-w)/2);
  const y=Math.max(2, Math.floor(rows*0.14));
  const asking=MIC.micState()==='asking';
  // No header meter: the only meter on this panel is the one the player is
  // being asked to move, and it is the room mic, not the monitor bus.
  const panel=drawMachinePanel(x, y, w, 9, {
    theme:'green', label:'MIC TEST', source:'ROOM MIC', meter:false,
    footer:'NOTHING IS RECORDING. NOTHING IS KEPT.',
  });
  uiText(panel.x, panel.y, asking ? 'WAITING ON THE MICROPHONE…' : 'SAY: "CHECK, ONE TWO"', 'ui-amber');
  drawVfdMeter(panel.x, panel.y+1, Math.max(12, Math.min(28, panel.w-4)), MONITOR.monitorSnapshotForRms(MIC.micLevel()), { theme:'green', thresholdDb:-12 });
  uiText(panel.x, panel.y+2,
    micCheck.ack ? 'HEARD. THAT IS WHAT A TAKE WILL HEAR.'
      : MIC.micActive() ? 'THAT NEEDLE IS YOUR REAL ROOM. IT CANNOT SPOIL ANYTHING YET.'
        : 'NO MICROPHONE. THE NIGHT RUNS FINE WITHOUT ONE.',
    micCheck.ack ? 'ui-counter' : 'ui-secondary', .85);
}

function firstTakeIntercept(){
  if(!storyMode || REC.isMonitoring()) return false;
  if(planName!=='conservatory') return false;

  // The level check belongs to Studio B3 and is the one hard gate: until levels
  // are set, no take counts, and levels can only be set here. It fires whenever
  // you record at B3 with levels unset — decoupled from the soft tutorial step,
  // so it holds even if the intro was skipped. First press opens the tree; every
  // retry after a spoil rolls straight, so the lesson can always pass.
  //
  // WHERE: the dock, where he sets up before he goes anywhere — and studio B3
  // too, so a player who skipped the intro can still set levels in the room the
  // order names first. Asked explicitly rather than leaning on `currentWorld()`,
  // which the dock answers as `main_b3` because it shares the basement's room
  // tone; that accident is what made the dock's level check roll a B3 take.
  if(levelCheckHere() && !flagTest('setup.levels')){
    // The tree talks him through the meter, then he tests the real one, then he
    // rolls. A retry after a spoil skips both and rolls straight.
    if(!thoughtHad('level-check')) return !!think('level-check', LEVEL_CHECK, { onDone:()=>beginMicTest(()=>beginTakeNow()) });
    beginTakeNow();
    return true;
  }
  // Levels on tape, but the hold never actually happened — an old save, or the
  // loop's six-second catch firing without the beat. [r] on the dock has to be the
  // way back in. It used to fall through to "that is not a room", which left the
  // player refused by the door AND refused by the recorder, with nothing to press.
  if(levelCheckHere() && !flagTest('combat.trained')){
    beginDaydream();
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
  // Mid mic test, [r] is "yes, I've heard enough" — it ends the test and rolls.
  // The verb is never swallowed and the test is never a wall.
  if(micCheckActive()){ finishMicTest(null); return; }
  if(REC.isRecording()){
    if(REC.isStalled()){ resumeInstrumentTake(); return; }
    stopTake(); return;
  }
  if(usingSourceSpace()){
    if(itemLost('recorder')){SPEECH.say({who:'you',text:'No recorder. The source waits without me.'});return;}
    const result=chunkSurfRuntime.recordFocused(px,py,R3.r3dFacing());
    if(result.handled){
      emitRecorderTransport('source capture');
      if(result.text)SPEECH.say({who:'you',text:result.text});
      syncSourceRender();
    }
    // No landmark in focus: nothing to capture, and no nagging thought — the
    // recorder is only for the source addresses you deliberately face.
    return;
  }
  if(usingStairAnomaly()){CUES.playCue(CUES.CUE.recorder,{gain:.08,rate:.42});return;}
  // It took the one thing the job is made of. Nothing happens until you find it.
  if(itemLost('recorder')){ SPEECH.say({ who:'you', text:'No recorder. There is no job until I have it back.' }); return; }
  // Already listening (the dialog closed, or there was no dialog): the second
  // press is the roll. If a LISTEN dialog is still up, its scene has the key.
  if(REC.isListening()){ if(!scenes.blocksInput()) roll(); return; }
  const room=recordableRoomAt(px,py);
  if(!room){ SPEECH.say(LINES.notARoom); return; }
  // The one hard gate: nothing counts until the kit is honest — levels set and
  // the six seconds held, both of which only happen on the dock. The level check
  // is handled upstream by firstTakeIntercept, so this only ever refuses a REAL
  // take attempted before setup is done.
  if(!setupComplete()){
    // Self-healing: levels on tape but the six seconds never actually held
    // (an old save, or the loop's catch). [r] is the way in — it starts the hold
    // and the count, same as the first time, so the gate can never dead-end and
    // nothing else in the world has to start a fight on the player's behalf.
    if(flagTest('setup.levels') && !flagTest('combat.trained')){
      SPEECH.say({ who:'you', text:"Levels are on tape but I never properly held it. Once more, feet still, and then nothing on this tape is my fault." });
      beginDaydream();
      return;
    }
    SPEECH.say(LINES.needLevels); return;
  }
  // And B3 comes first: no other room takes until Studio B3 has a clean minute.
  if(room!=='main_b3' && room!=='lux_nova' && !REC.hasTake('main_b3')){ SPEECH.say(LINES.basementFirst); return; }
  // The chapel is the fifth room, and it is not a take. It is locked until the
  // other four are on tape, and rolling it opens the confrontation.
  if(room==='lux_nova'){
    if(finaleActive) return;
    if(REC.recState().takes.length < 4){ SPEECH.say(LINES.chapelLocked); return; }
    if(chapelTowerState().phase!==CHAPEL_TOWER_PHASE.TOWER_CLEARED&&chapelTowerState().phase!==CHAPEL_TOWER_PHASE.CHAPEL_FINAL){SPEECH.say({who:'you',text:'The nave is not the way in yet. The tower route is still live.'});return;}
    beginConfrontation(); return;
  }
  if(REC.hasTake(room)&&!REC.takeIsContaminated(room)){ SPEECH.say(LINES.already); return; }
  const hum=currentElectricalHumFrame();
  if(hum.audible){
    const key=`${room}:${hum.circuits.join(',')}`,now=performance.now();
    if(!humRecordConsent||humRecordConsent.key!==key||now>humRecordConsent.until){
      humRecordConsent={key,until:now+12000};
      const circuit=hum.primary?.label||hum.circuits[0]?.toUpperCase()||'A PANEL';
      SPEECH.say({who:'you',text:`No. ${circuit} is still in the cans. That low note is the building, not the room. Kill it at the panel—or ask me again and I will put the mistake on tape.`});
      return;
    }
    armedTakeContamination={room,circuits:[...hum.circuits]};humRecordConsent=null;
    SPEECH.say({who:'you',text:'All right. Their tape, their ballast. I will mark exactly what I heard.'});
  }else{
    armedTakeContamination=null;humRecordConsent=null;
    if(REC.takeIsContaminated(room))SPEECH.say({who:'you',text:'Again. Same room, this time without the building singing through it.'});
  }
  if(maybeForceRadioBreakdownForRoom(room)) return;
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
  takeRoom=room;
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
  const room=takeRoom || currentWorld();
  takeRoom=null;
  armedTakeContamination=null;
  humRecordConsent=null;
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
  activeTakeContamination=armedTakeContamination&&armedTakeContamination.room===(takeRoom||currentWorld())
    ? {...armedTakeContamination,circuits:[...armedTakeContamination.circuits]}
    : null;
  armedTakeContamination=null;
  emitProgress(EVENT_TYPES.TAKE_STARTED, { roomId:currentWorld() }, 'main.roll');
  committedListen=false;
  screamedThisTake=false;
  takeOrigin={x:px,y:py};
  const takeSlot=REC.recState().takes.length+1;
  environmentalTenorFired=false;
  instrArmedThisTake=takeSlot===3 && PROPS.shouldArmHush({tutorial:TUT.tutorialActive()});
  saveCommit({props:PROPS.savePropState()});
  ensureCtx();
  // The recorder is not a metaphor. It opens the actual microphone, and from
  // here the real room you are sitting in can spoil the take. Fire-and-forget:
  // no permission, no mic, and the game is exactly as it was.
  if(!params().has('nomic') && getSave().settings?.mic !== 'off') startRoomMic();
  // The transport is our sound, not the player's. Keep it on the output meter
  // while preventing acoustic speaker bleed from invalidating the new take.
  MIC.micIgnoreSpoilFor(1400);
  CUES.playCue(CUES.CUE.recorder, {gain:0.85});
  emitRecorderTransport('roll');
  updateAudio();                      // monitor closes: the room goes silent
  STORY.startTapeHiss({ gain: TAKE_HISS.min, fade: 1.2 });
  personalInterference.clear();
  SPEECH.say(framedLine('recStart', LINES.recStart));
  // The mic was tested before this roll (see beginMicTest), so the take says
  // nothing more about it. Nothing hunts a man who has not started work.
  if(!TUT.tutorialActive()) summonPresence('first-take');
  // The level check is six seconds of standing still in the dark with nothing to
  // do, so the counting starts with the roll: the numbers he says out loud ARE
  // the seconds the recorder is holding, and by the last one he has talked
  // himself into something stupid (see beginDaydream).
  else if(!flagTest('setup.levels') && !flagTest('combat.trained')) beginDaydream();
}

// Stop the take: a clean minute, a spoiled one, or one you called off.
//
// The room is the one the take BEGAN in, not wherever the recordist is standing
// when it stops. Asking the world again at the end is how a level check set on
// the dock came to be filed against studio B3.
function stopTake(){
  if(!REC.isRecording()) return;
  const room=takeRoom || recordableRoomAt(px,py) || currentWorld();
  const r=REC.stopRecording();
  const contamination=activeTakeContamination;activeTakeContamination=null;
  takeRoom=null;
  clearInstrument();
  instrArmedThisTake=false;
  CUES.playCue(CUES.CUE.recorder, {gain:0.7, rate:0.88});
  emitRecorderTransport('stop');
  STORY.stopTapeHiss({ fade: 0.6 });
  personalInterference.clear();
  updateAudio();
  if(r.completed){
    emitProgress(EVENT_TYPES.TAKE_COMPLETED, {
      roomId:room, elapsed:r.elapsed,
      contaminated:!!contamination,
      circuits:contamination?.circuits||[],
    }, 'main.stopTake');
    PB.sealTake(room);              // choose the guest once. a tape does not re-roll.
    SPEECH.say(contamination
      ? {who:'you',text:`Held. It counts—but ${contamination.circuits.map((id)=>powerCircuitDefinition(id)?.label||id.toUpperCase()).join(' and ')} sits under every second of it. I am writing that down.`}
      : framedLine('recDone', LINES.recDone));
    himBeat();                      // he held a clean minute here too, and then he did not
  } else {
    PB.abortTake(room);
    // The tutorial level check is stopped deliberately at six seconds by the setup
    // sequence, not aborted by the player — the daydream owns the narration from
    // here, so the recorder just clicks off without a "wasted take" line.
    if(r.spoiled){
      emitProgress(EVENT_TYPES.TAKE_SPOILED, { roomId:room, reason:r.reason || 'noise' }, 'main.stopTake');
      if(!TUT.tutorialActive()) SPEECH.say(LINES.recSpoiled(r.reason));
    } else {
      emitProgress(EVENT_TYPES.TAKE_ABORTED, { roomId:room }, 'main.stopTake');
      if(!TUT.tutorialActive()) SPEECH.say(LINES.recAbort);
    }
  }
}

// The dock level check and the first take in B3 ARE the guided LISTEN — they
// narrate setting a level themselves and end on "roll" — so they hand straight
// into a take. The room came up in the cans while their dialog played (the
// monitor opened when the tree started); this just rolls it.
function beginTakeNow(){
  if(REC.isMonitoring()){ roll(); return; }
  // The level check is set on the dock floor, and the dock is not one of the
  // five rooms. It used to fall through to `currentWorld()`, which the dock
  // answers as `main_b3` (it shares the basement's room tone — ZONE_WORLD), so
  // setting levels in the dock opened, rolled and aborted a take of STUDIO B3
  // while standing two floors above it. A level check is its own thing now.
  const room=recordableRoomAt(px,py) || LEVEL_CHECK_ROOM;
  if(!REC.startListening()) return;
  takeRoom=room;
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
let hushSensationMode=null;
let hushSensationSerial=0;
let hushBrushCooldownUntil=0;
let pendingHushBrush=null;
let hushSensationDebug=null;
let hushSensationScene=null;
let hushNoisePerception=freshHushNoisePerception();
let monitorExposureSnapshot=MONITOR.monitorSnapshotForRms(0);
const itemLost=(id)=> lostItem===id;

function resetHushContactSession(){
  const graceUntil=performance.now()+7000;
  hushSensationMode=null;
  pendingHushBrush=null;
  hushSensationDebug=null;
  hushSensationScene=null;
  hushNoisePerception=freshHushNoisePerception();
  monitorExposureSnapshot=MONITOR.monitorSnapshotForRms(0);
  hushBrushCooldownUntil=graceUntil;
}

function makeTakenAftermathScene(onBlack){
  let t=0,finished=false;
  return {
    id:'taken-aftermath',blocksInput:true,blocksWorld:true,lensPreset:'rupture',
    update(dt){
      t+=dt;
      if(t<1.25||finished)return;
      finished=true;scenes.pop();onBlack?.();
    },
    key(){return true;},
    pointer(){return true;},
    render(){
      const {cols,rows}=uiSize();
      uiFill(0,0,cols,rows,'#000');
      // The contact hit itself is the canonical surfer signal in #hushJump.
      // The aftermath is only signal loss; it draws no figure.
      if(t>.62)return;
      uiDraw(({ctx,dpr})=>{
        const w=ctx.canvas.width,h=ctx.canvas.height,p=1-Math.min(1,t/.62);
        ctx.save();
        ctx.globalCompositeOperation='screen';
        ctx.fillStyle=`rgba(225,244,238,${0.18*p})`;
        for(let i=0;i<5;i++){
          const y=h*(0.18+i*.15)+Math.sin((t*34)+i)*h*.012;
          ctx.fillRect(0,y,w,Math.max(1,Math.floor((2+i%2)*dpr)));
        }
        ctx.fillStyle=`rgba(0,0,0,${0.28*(1-p)})`;
        ctx.fillRect(0,0,w,h);
        ctx.restore();
      });
    },
  };
}

function beginHushContactFlash({taken=false,reason='contact',intensity=1}={}){
  return showHushContactFlash({
    reason:taken ? 'taken-contact' : reason,
    intensity:taken ? 1 : intensity,
    durationMs:taken ? 880 : 620,
    blackout:!!taken,
    stinger:true,
  });
}

// The window in which the surfer hit owns the screen. Nothing may paint black
// during it — that is the whole point of this scene existing.
const HUSH_CONTACT_FLASH_MS=720;

// The contact is a scene so that nothing can render over it. Pushing the black
// aftermath in the same tick as the flash meant the aftermath's first render()
// filled the frame before #hushJump was ever seen: the surfer was playing
// underneath a black rectangle for its entire duration.
function makeHushContactSequenceScene({taken=false,reason='contact',intensity=1,onAftermath=null}={}){
  let t=0,handedOff=false;
  return {
    id:'hush-contact',blocksInput:true,blocksWorld:true,lensPreset:'rupture',
    enter(){ beginHushContactFlash({taken,reason,intensity}); },
    update(dt){
      t+=dt;
      if(handedOff || t<HUSH_CONTACT_FLASH_MS/1000) return;
      handedOff=true;
      // Replace rather than pop-then-push: a frame between the two would show
      // the live world behind the flash it is meant to be interrupting.
      if(taken) scenes.replace(makeTakenAftermathScene(onAftermath||wakeUp));
      else scenes.pop();
    },
    key(){return true;},
    pointer(){return true;},
    // Deliberately draws nothing. #hushJump is a DOM layer above the canvas and
    // must be left unobstructed for the whole window.
    render(){},
  };
}

function beginTaken(){
  takenActive=true;
  if(REC.isRecording()) REC.spoilTake('it took you');
  REC.injure();
  fear=1; FEAR.setFear(1);
  scenes.push(makeHushContactSequenceScene({taken:true,reason:'taken-contact',intensity:1,onAftermath:wakeUp}));
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
  px=c.x; py=c.y;
  // Never wake standing in water. Walk the drop point out to the nearest dry
  // cell rather than leaving the player in the basin to discover it.
  if(WATER.pointInNatatoriumBasin(Math.floor(px),Math.floor(py),natatoriumBasinBounds)){
    for(let r=1;r<=8 && WATER.pointInNatatoriumBasin(Math.floor(px),Math.floor(py),natatoriumBasinBounds);r++){
      for(const [ox,oy] of [[r,0],[-r,0],[0,r],[0,-r],[r,r],[-r,r],[r,-r],[-r,-r]]){
        if(!WATER.pointInNatatoriumBasin(Math.floor(c.x+ox),Math.floor(c.y+oy),natatoriumBasinBounds)){
          px=c.x+ox; py=c.y+oy; break;
        }
      }
    }
  }
  trail=[]; revealAround(px,py); faceOpenDirection();
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
  if(usingSpecialSpace())return;
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

function shovePlayerAwayFromPresence(){
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
}

function resolveHardHushContact({attempt=null,reason='presence-contact',speak=true}={}){
  if(attempt?.id && !PRES.confirmContactAttempt(attempt.id))return false;
  STAB.reportThreat();
  bumpFear(0.55, { stinger:0 });
  beginHushContactFlash({taken:false,reason,intensity:0.95});
  const injuries=REC.injure();
  emitProgress(EVENT_TYPES.PLAYER_INJURED, { count:injuries }, 'main.onPresenceCatch');
  if(REC.isRecording()) REC.spoilTake('it found you');
  CR.fx.flash(140, 'rgba(10,10,12,0.9)');
  CR.fx.shake(1.4, 420);
  if(speak)SPEECH.say(LINES.caught(injuries));
  shovePlayerAwayFromPresence();
  applyLensPreset('hush');
  setTimeout(()=>{ if(storyMode) applyLensPreset('explore'); }, 4200);
  saveCommit({ rec:REC.saveRecState(), presence:PRES.savePresenceState() });
  return true;
}

function beginTakenFromContact(attempt=null){
  if(attempt?.id && !PRES.confirmContactAttempt(attempt.id))return false;
  STAB.reportThreat();
  bumpFear(0.55,{stinger:0});
  beginTaken();
  saveCommit({presence:PRES.savePresenceState()});
  return true;
}

function hushContactSeed(salt=0){
  const runSeed=Number(getSave().run?.startedAt)||Date.now();
  const serial=++hushSensationSerial;
  const tag=typeof salt==='number'?salt:String(salt).split('').reduce((sum,ch)=>sum+ch.charCodeAt(0),0);
  return (runSeed+(serial*0x9e3779b1)+(Number(tag)||0))>>>0;
}

function hushContactContext({takeBreak=false,dialogueEligible=false}={}){
  return {
    tutorial:TUT.tutorialActive(),
    sourceSpace:usingSourceSpace(),
    recording:REC.isRecording(),
    thoughtOpen:!!hushSensationMode,
    brushOpen:hushSensationMode===HUSH_SENSATION_MODE.BRUSH,
    takeBreak,
    forceDirect:hushNoiseForcesDirectContact(hushNoisePerception,performance.now()),
    dialogueEligible,
    takenEligible:dialogueEligible&&!takenActive&&!lostItem&&performance.now()>=takenRecoveryUntil&&!TUT.tutorialActive(),
    cooldownReady:performance.now()>=hushBrushCooldownUntil,
    state:PRES.contactDirectorState(),
  };
}

function hushContactApproach(attempt,{forced=false}={}){
  const yaw=mapHeading();
  return classifyHushContactApproach({
    player:{x:px,y:py},
    contact:attempt?.position||null,
    forward:{x:Math.sin(yaw),y:-Math.cos(yaw)},
    behaviorMode:attempt?.behaviorMode||'stand',
    targetPriority:attempt?.targetPriority||0,
    warned:hushSensationMode===HUSH_SENSATION_MODE.PROXIMITY,
    forced,
  });
}

function chooseHushReleaseTarget(seed=1){
  if(!usingPlan()||usingSpecialSpace())return null;
  const current=recordableRoomAt(px,py);
  const minimum=18*CELL_SCALE;
  const listener=acousticSpatialAt(px,py);
  const target=chooseHushReleaseDestination({
    player:{x:px,y:py},currentRoom:current,minimumDistance:minimum,seed,
    candidates:TARGETS
    .filter((id)=>ROOM_CELLS[id])
    .map((id)=>{
      const point=FP.toRuntimePoint(ROOM_CELLS[id]);
      return{id,point,valid:!FP.isSolid(point.x,point.y),occlusion:acousticOcclusionDb(acousticSpatialAt(point.x,point.y),listener)};
    }),
  });
  if(target)return target;
  // A recordable anchor should normally win. The ring search is the promised
  // distant-prowl fallback for a migrated/custom floorplan whose room centres
  // are unavailable or blocked.
  for(let ring=0;ring<4;ring++)for(let i=0;i<16;i++){
    const radius=minimum+ring*4*CELL_SCALE;
    const angle=((seed%360)+i*137.5+ring*31)*Math.PI/180;
    const point={x:px+Math.cos(angle)*radius,y:py+Math.sin(angle)*radius};
    if(!FP.isSolid(point.x,point.y))return{id:null,point,distance:radius,occlusion:8};
  }
  return null;
}

function playHushReleaseNote(target,seed=1){
  if(!target?.point)return false;
  const facing=R3.r3dFacing(),right=[[1,0],[0,1],[-1,0],[0,-1]][facing]||[1,0];
  const note=buildHushReleaseNote({target,player:{x:px,y:py},right:{x:right[0],y:right[1]},seed});
  if(!note)return false;
  fireCue(note.cueId,note.audio);
  emitAcousticEvent({
    ...note.event,
    spatial:acousticSpatialAt(target.point.x,target.point.y),
  });
  pushEvent(`// ${note.caption}`);
  return true;
}

function resolveHushBrushRelease(pending){
  const target=chooseHushReleaseTarget(pending.seed);
  const now=performance.now();
  const expiresAt=now+10000+(pending.seed%4001);
  const redirected=pending.attempt?.id
    ? PRES.releaseContactAttempt(pending.attempt.id,{target:target?.point||null,expiresAt,priority:1})
    : !!(PRES.isActive()&&target&&PRES.offerSoundTarget({position:target.point,level:.2,confidence:1,expiresAt,priority:1}));
  if(target)playHushReleaseNote(target,pending.seed);
  bumpFear(.12,{stinger:0});
  saveCommit({presence:PRES.savePresenceState()});
  return redirected;
}

function finishHushBrushContact(pending){
  if(!pending)return;
  const outcome=pending.choice||{outcome:HUSH_BRUSH_OUTCOME.HARD,choiceId:'unanswered'};
  pendingHushBrush=null;
  if(outcome.outcome===HUSH_BRUSH_OUTCOME.RELEASE){resolveHushBrushRelease(pending);return;}
  resolveHardHushContact({attempt:pending.attempt,reason:'goosebumps-contact'});
}

function openHushSensation(mode,{seed=hushContactSeed(mode),attempt=null}={}){
  if(hushSensationMode)return false;
  const state=PRES.contactDirectorState();
  const built=buildHushSensationTree({
    mode,authoredTree:HUSH,seed,recentContentIds:state.recentContentIds,
  });
  const nextState=mode===HUSH_SENSATION_MODE.PROXIMITY
    ? noteHushWarningShown(state,built.usedContentIds)
    : rememberHushContent(state,built.usedContentIds);
  PRES.setContactDirectorState(nextState);
  hushSensationMode=mode;
  hushSensationDebug={
    mode,seed,choiceCount:built.choiceCount,savingCount:built.savingCount,
    choices:built.tree.start.choices.map((choice)=>({
      id:choice.hushChoiceId,text:choice.text,
      ...(mode===HUSH_SENSATION_MODE.BRUSH?{outcome:choice.hushOutcome}:{}),
    })),
  };
  const fullEffects=(getSave().settings?.shake||'full')==='full'
    && (getSave().settings?.flash||'full')==='full'
    && !getSave().settings?.reduceDread;
  if(mode===HUSH_SENSATION_MODE.BRUSH){
    hushBrushCooldownUntil=performance.now()+HUSH_CONTACT_LIMITS.brushCooldownMs;
    pendingHushBrush={attempt,seed,choice:null};
    bumpFear(.16,{stinger:fullEffects ? .08 : 0});
    if(fullEffects)CR.fx.shake(.16,110);
  }
  saveCommit({presence:PRES.savePresenceState()});
  ensureCtx();
  hushSensationScene=scenes.push(makeThoughtScene({
    id:mode===HUSH_SENSATION_MODE.PROXIMITY?'hush':`hush-brush-${++hushSensationSerial}`,
    nodes:built.tree,
    audio:STORY,
    getAudio:()=>({ctx:actx,destination:dialogGain||master}),
    fx:CR.fx,
    cue:fireCue,
    scrim:.50,
    lensPreset:mode===HUSH_SENSATION_MODE.BRUSH&&fullEffects?'hush':'calm',
    onChoice:(choice)=>{
      applyStoryChoice(choice);
      if(hushSensationDebug)hushSensationDebug.selected=resolveHushSensationChoice(choice);
      if(mode===HUSH_SENSATION_MODE.BRUSH&&pendingHushBrush)pendingHushBrush.choice=resolveHushSensationChoice(choice);
    },
    onDone:()=>{
      const pending=mode===HUSH_SENSATION_MODE.BRUSH?pendingHushBrush:null;
      hushSensationMode=null;
      hushSensationScene=null;
      if(pending)finishHushBrushContact(pending);
    },
  }));
  return true;
}

function dismissHushProximityForContact(){
  if(hushSensationMode!==HUSH_SENSATION_MODE.PROXIMITY)return false;
  const scene=hushSensationScene;
  hushSensationMode=null;
  hushSensationScene=null;
  if(scene)scenes.remove(scene);
  return true;
}

function dismissHushSensationForForcedContact(){
  if(!hushSensationMode)return false;
  const scene=hushSensationScene;
  hushSensationMode=null;
  hushSensationScene=null;
  pendingHushBrush=null;
  hushSensationDebug=null;
  if(scene)scenes.remove(scene);
  return true;
}

function chooseHushSensationDebug(index=0){
  if(!hushSensationMode)return false;
  const scene=scenes.top();
  const view=scene?.view?.();
  if(view?.pending?.kind!=='branch')return false;
  const choices=view.pending.options||[];
  if(!choices.length)return false;
  const target=Math.max(0,Math.min(choices.length-1,Math.floor(Number(index)||0)));
  return !!scene.key?.({key:String(target+1)});
}

function openDebugHushBrush(seed=4417){
  if(usingSpecialSpace()||hushSensationMode)return false;
  if(!PRES.isActive())PRES.spawnBehind(px,py,...R3.r3dDelta(-1));
  const actor=PRES.presenceState();
  actor.x=px;actor.y=py;actor.spawnedAt=-1e9;actor.lastCatchAt=-1e9;
  let opened=false;
  PRES.updatePresence(0,px,py,(attempt)=>{
    opened=openHushSensation(HUSH_SENSATION_MODE.BRUSH,{seed:Number(seed)||4417,attempt});
  },{deferContact:true,suppressContact:false,dreadLevel:presentedFearPressure(),sightOcclusionDb:0});
  return opened;
}

function onPresenceCatch(attemptOrCount,{takeBreak=false,forced=false,silent=false,reason=null}={}){
  if(PRES.presenceTableauActive())return false;
  const attempt=attemptOrCount&&typeof attemptOrCount==='object'?attemptOrCount:null;
  const approach=hushContactApproach(attempt,{forced});
  const decision=chooseHushContactExperience(hushContactContext({
    takeBreak,dialogueEligible:approach.dialogueEligible,
  }),{rng:Math.random});
  PRES.setContactDirectorState(decision.state);
  if(decision.kind===HUSH_CONTACT_KIND.BRUSH&&attempt){
    openHushSensation(HUSH_SENSATION_MODE.BRUSH,{seed:decision.seed,attempt});
    return;
  }
  // A distant warning is superseded, not stacked, when distance becomes touch.
  // Its selection had already made Brush ineligible, so physical arrival can
  // only continue into the existing Hard or Taken paths.
  if(forced)dismissHushSensationForForcedContact();
  else dismissHushProximityForContact();
  if(forced)PRES.commitForcedContact();
  if(decision.kind===HUSH_CONTACT_KIND.TAKEN){beginTakenFromContact(attempt);return;}
  resolveHardHushContact({
    attempt,
    reason:reason||(takeBreak?'take-break-contact':'presence-contact'),
    speak:!silent,
  });
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
  if(usingSpecialSpace()){pageHere=null;return;}
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

// World interaction follows the eye, not the body's nearest quarter turn. This
// keeps two neighboring labels independently selectable and stops a door at the
// edge of the view from taking [E] away from the prop under the reticle.
function focusedWorldProp(maxMeters=2){
  const look=R3.r3dLookAngles?.()||{};
  return PROPS.pickProp(px,py,R3.r3dFacing(),maxMeters,{yaw:mapHeading(),pitch:look.pitch});
}
function focusedTowerRelay(maxMeters=4.2){
  if(towerRelayStage(chapelTowerState())!==TOWER_RELAY_STAGE.INTERRUPT)return null;
  const frame=PROPS.propById('tower-bell-frame');if(!frame)return null;
  const mx=(px+.5)*CELL,mz=(py+.5)*CELL;
  const dx=BELL_RELAY_CLAMP_AUTHORED.x-mx,dz=BELL_RELAY_CLAMP_AUTHORED.y-mz,d=Math.hypot(dx,dz);
  if(d>maxMeters)return null;
  const heading=mapHeading(),dot=(dx*Math.sin(heading)+dz*-Math.cos(heading))/Math.max(.001,d);
  if(dot<.72)return null;
  const aimAngle=Math.abs(Math.atan2(Math.sin(Math.atan2(dx,-dz)-heading),Math.cos(Math.atan2(dx,-dz)-heading)));
  const halfAngle=Math.max(.10,Math.min(.48,Math.atan2(.65,Math.max(.05,d))));
  if(aimAngle>halfAngle*1.2)return null;
  return{
    ...frame,
    id:'tower-bell-relay-clamp',
    label:'bell relay clamp',
    action:'tower-relay-interrupt',
    interactive:true,
    distance:d,
    aimAngle,
    aimScore:aimAngle/halfAngle+d*.025,
  };
}
function focusedWorldDoor(maxCells=5){
  if(!usingPlan()||usingSpecialSpace())return null;
  const yaw=mapHeading(),facing=[Math.sin(yaw),-Math.cos(yaw)];
  const hit=FP.doorNear(px,py,facing,maxCells);if(!hit)return null;
  const dx=hit.portal.cx-px,dz=hit.portal.cy-py,d=Math.max(.001,Math.hypot(dx,dz));
  const ang=Math.abs(Math.atan2(Math.sin(Math.atan2(dx,-dz)-yaw),Math.cos(Math.atan2(dx,-dz)-yaw)));
  const halfCells=Math.max(.7,(Number(hit.portal.aperture?.width)||1.06)/(CELL*2));
  const halfAngle=Math.max(.10,Math.min(.52,Math.atan2(halfCells,d)));
  if(ang>halfAngle*1.05)return null;
  return{...hit,aimAngle:ang,aimScore:ang/halfAngle+d*.012};
}
function worldInteractionFocus(){
  const prop=focusedTowerRelay()||focusedWorldProp(2),door=focusedWorldDoor();
  // Story-route doors win an interaction tie. Several authored plaques and
  // mechanisms sit beside these thresholds; they must never make the only
  // playable route depend on a pixel-perfect reticle.
  const doorWins=doorWinsWorldInteraction(prop,door);
  return{prop,door,doorWins};
}
function lockedDoorThought(keyId){
  if(keyId==='chapel'){
    if(!flagTest('chapel.clue.log'))return'Replacement lock core. Page 6 names the front-of-house office; read it in the bag.';
    if(!flagTest('chapel.clue.ledger'))return'Page 6 points to front of house. I still need the rekey ledger inside the office.';
    return'C-17. The rekey ledger says the tagged key is in the front-of-house cabinet.';
  }
  if(keyId==='services-core')return'PLANT SERVICES — NO CONTRACTOR ACCESS. Nothing behind this door is on tonight’s route.';
  if(keyId==='academic-core')return'ACADEMIC CORE — NO CONTRACTOR ACCESS. These rooms are outside the work order.';
  return'Locked. None of these.';
}

// One centred prompt row on the HUD. Measured before it is drawn because a
// drawn button glyph is a fixed three cells wide regardless of what the
// keyboard fallback text would have been.
function hudPromptRow(y, parts, cols, role='ui-amber'){
  const w = promptPartsWidth(parts);
  drawPromptParts(Math.max(2, Math.floor((cols - w) / 2)), y, parts, { role, cols });
}
// Authored instrument stems the props play. Unlike the surfable worlds, these
// are short discrete takes preloaded as whole buffers (see preloadPropStems), so
// they never enter the chunk-surf world manifest.
const PROP_STEMS={
  piano_player:['01','02','03','04','05'].map((label)=>({label,url:assetUrl(`audio/piano/player/you-play-piano-${label}.mp3`)})),
  marimba_player:['01'].map((label)=>({label,url:assetUrl(`audio/marimba/player/you-play-marimba-168bpm-${label}.mp3`)})),
  violin_player:['01','02'].map((label)=>({label,url:assetUrl(`audio/violin/player/you-play-violin-${label}.mp3`)})),
  // Existing mechanical production recordings, reassigned to the three dock
  // probes. Their source family remains fixed so the HUSH can learn the exact
  // object the player sounded instead of a generic one-shot.
  dock_case:[{label:'01',url:CUES.CUE.keys}],
  dock_reel:[{label:'01',url:CUES.CUE.rewind}],
  dock_shutter:[{label:'01',url:CUES.CUE.door}],
};
const propStemBuffers=new Map(); // `${worldId}:${label}` -> AudioBuffer
async function preloadPropStems(){
  if(!actx)return;
  for(const [worldId,stems] of Object.entries(PROP_STEMS)){
    for(const {label,url} of stems){
      const key=`${worldId}:${label}`;
      if(propStemBuffers.has(key))continue;
      try{
        const res=await fetch(url);const ab=await res.arrayBuffer();
        propStemBuffers.set(key,await actx.decodeAudioData(ab));
      }catch(err){console.warn('prop stem load failed',url,err);}
    }
  }
}
function propChunk(ref){
  if(!ref)return null;
  if(PROP_STEMS[ref.worldId]){
    const buffer=propStemBuffers.get(`${ref.worldId}:${ref.fileLabel}`);
    return buffer?{buffer}:null;
  }
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
// Hold-to-play. The universal rule for playing an instrument in the world: hold
// [e] and a random stem from that instrument's set plays from the top; let go and
// it stops. One voice at a time; a key-repeat on the same prop keeps it going
// rather than restarting it.
let heldPropPlay=null;
function startHeldPropPlay(prop){
  ensureCtx();
  const fam=prop?.sampleFamily||[];
  if(!fam.length) return false;
  if(heldPropPlay){ if(heldPropPlay.propId===prop.id) return true; stopHeldPropPlay(.04); }
  const ref=fam[Math.floor(Math.random()*fam.length)];   // random, per set
  const chunk=propChunk(ref);
  if(!actx||!master||!chunk?.buffer) return false;
  const now=actx.currentTime,src=actx.createBufferSource(),gain=actx.createGain(),pan=actx.createStereoPanner();
  src.buffer=chunk.buffer;
  const mx=(px+.5)*CELL,mz=(py+.5)*CELL,dx=prop.x-mx,dz=prop.y-mz,d=Math.hypot(dx,dz);
  const right=[[1,0],[0,1],[-1,0],[0,-1]][((R3.r3dFacing()%4)+4)%4];
  pan.pan.setValueAtTime(Math.max(-1,Math.min(1,(dx*right[0]+dz*right[1])/4)),now);
  gain.gain.setValueAtTime(Math.max(.05,.30/(1+d*.18)),now);
  src.connect(gain);gain.connect(pan);pan.connect(master);
  src.start(now);   // from the beginning, always
  const entry={src,gain,propId:prop.id};
  heldPropPlay=entry;
  src.onended=()=>{ if(heldPropPlay===entry) heldPropPlay=null; };
  return true;
}
function stopHeldPropPlay(fade=.08){
  const entry=heldPropPlay;
  if(!entry) return;
  heldPropPlay=null;
  try{
    if(actx&&entry.gain){
      const t=actx.currentTime,f=Math.max(.01,fade);
      entry.gain.gain.cancelScheduledValues(t);
      entry.gain.gain.setValueAtTime(entry.gain.gain.value,t);
      entry.gain.gain.linearRampToValueAtTime(.0001,t+f);
      entry.src.stop(t+f+.02);
    } else entry.src.stop();
  }catch{/* already stopped */}
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
  const line=PROPS.inspectProp(id,{aftermath:flagTest('dock.haunting.spent')});
  emitProgress(EVENT_TYPES.PROP_INSPECTED, { id }, 'main.inspectPropTracked');
  return line;
}
function auditionPropTracked(id){
  const ref=PROPS.auditionProp(id);
  emitProgress(EVENT_TYPES.PROP_AUDITIONED, { id }, 'main.auditionPropTracked');
  return ref;
}

function auditionDockInvestigationProp(prop){
  const ref=auditionPropTracked(prop.id);
  if(!ref)return false;
  const started=playPropSample(prop,ref);
  if(started){
    REC.emitNoise(.16,prop.rx,prop.ry,`the ${propLabel(prop).toLowerCase()} sounded`,{
      kind:prop.acousticKind||'handling_noise',sourceKind:'environment',sourceId:prop.id,
      playerGenerated:true,deliberate:true,
    });
  }
  saveCommit({props:PROPS.savePropState()});
  return started;
}

// The dock's objects are not labels. Looking at one opens a small investigation
// in which the player chooses what the recordist touches, tests, or refuses to
// conclude. Only an explicit sound-making choice teaches that sound to HUSH.
function openLoadingDockInvestigation(prop){
  if(!prop?.dockInvestigation)return false;
  const aftermath=flagTest('dock.haunting.spent');
  const stateId=aftermath?`${prop.id}@aftermath`:prop.id;
  const revisited=PROPS.propState().inspected.has(stateId);
  const nodes=loadingDockInvestigation(prop.id,{
    aftermath,revisited,auditioned:PROPS.isAuditioned(prop.id),
  });
  if(!nodes)return false;
  const opened=converse(`dock-investigation:${prop.id}:${aftermath?'after':'before'}`,nodes,{
    scrim:.38,
    onChoice:(choice)=>{
      if(choice?.dockAction==='audition')auditionDockInvestigationProp(prop);
    },
  });
  // `?nothink=1` is a mechanism-test surface. Preserve its old immediate prop
  // behavior instead of swallowing the interaction behind an invisible tree.
  if(!opened)return false;
  inspectPropTracked(prop.id);
  saveCommit({props:PROPS.savePropState()});
  return true;
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
        footerParts: [{ action: 'confirm', label: 'INSPECT' }, { action: 'back', label: 'CLOSE' }],
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
    setTimeout(()=>queueRadioStoryCue(RADIO.RADIO_CUES.INITIAL, { reason:'work-order-read' }), 1400);
  });
}

const NATATORIUM_WATER_THOUGHT = {
  start: {
    speaker: 'THE NATATORIUM',
    lines: [
      { who:'direction', text:'The water is too dark to reflect the ceiling. It keeps a shape anyway, low and patient, as if something under it has leaned forward.' },
      { who:'surfer', text:'Come here.' },
      { who:'you', text:'No. That is not how rooms work.' },
    ],
    choices: [
      { text:'step closer to the coping', goto:'approach', waterChoice:'approach', set:['natatorium.water.bias.seal'] },
      { text:'hold the recorder over the water', goto:'record', waterChoice:'record', set:['natatorium.water.bias.surface'] },
      { text:'step back and name it as only water', goto:'refuse', waterChoice:'refuse', set:['natatorium.water.bias.inversion'] },
    ],
  },
  approach: {
    speaker: 'THE NATATORIUM',
    lines: [
      { who:'direction', text:'The surface dimples in a line from the deep end to your shoes. Not a wave. A finger drawing a route.' },
      { who:'surfer', text:'It was full when I left it.' },
    ],
  },
  record: {
    speaker: 'THE NATATORIUM',
    lines: [
      { who:'direction', text:'The recorder meter rises before you arm it. The water answers with one wet click, close enough to be inside the case.' },
      { who:'you', text:'That is not signal. That is pressure.' },
    ],
  },
  refuse: {
    speaker: 'THE NATATORIUM',
    lines: [
      { who:'direction', text:'You take one step back. The water follows by exactly one step and then remembers it has no legs.' },
      { who:'you', text:'A room. A pool. A bad memory of a pool.' },
    ],
  },
};

function waterEdgeInReach(){
  if(!natatoriumWaterActive() || !usingPlan() || FP.zoneAt(px,py)!==ZONE.natatorium) return false;
  if(WATER.pointInNatatoriumBasin(px,py,natatoriumBasinBounds)) return false;
  const [dx,dy]=R3.r3dDelta(1);
  if(WATER.pointInNatatoriumBasin(px+dx,py+dy,natatoriumBasinBounds)) return true;
  for(const [ox,oy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    if(WATER.pointInNatatoriumBasin(px+ox,py+oy,natatoriumBasinBounds)) return true;
  }
  return false;
}

function interactNatatoriumWater(){
  if(!waterEdgeInReach()) return false;
  const run=currentNatatoriumWaterRun();
  const water=WATER.normalizeNatatoriumWaterLedger(run?.ledger?.natatoriumWater);
  if(water.seen){
    SPEECH.say({who:'you',text:'The water moves like it is still listening.'});
    return true;
  }
  think('natatorium-water', NATATORIUM_WATER_THOUGHT, {
    force:true,
    onChoice:(choice)=>{
      const nextRun=WATER.recordNatatoriumWaterChoice(getSave().run, choice?.waterChoice || 'approach');
      saveCommit({run:nextRun, flags:getSave().flags});
      CR.fx.shake(choice?.waterChoice==='refuse'?0.25:0.55, 380);
    },
  });
  return true;
}

function interactChapelScreen(){
  if(!nearAuthoredRuntime(px,py,CHAPEL_SCREEN_AUTHORED,7))return false;
  if(escape?.kind==='stay'){
    completeSacrificeEnding();
    return true;
  }
  const tower=chapelTowerState(),ordinary=REC.recState().takes.filter((id)=>id&&id!=='lux_nova').length;
  if(ordinary<4){SPEECH.say({who:'you',text:'The collegiate chapel screen is locked from within. Four rooms remain the only honest work.'});return true;}
  if(tower.phase===CHAPEL_TOWER_PHASE.SOURCE_READY){beginChunkSurf({forced:true});return true;}
  if(tower.phase===CHAPEL_TOWER_PHASE.TRANSITION_READY){beginSourceTowerTransition();return true;}
  if(tower.phase===CHAPEL_TOWER_PHASE.TOWER_ACTIVE){SPEECH.say({who:'direction',text:'The screen holds. Above it, the tower is already moving.'});return true;}
  return false;
}

function interact(){
  if(!storyMode) return;
  if(PB.isPlaying()){ PB.stopPlayback(); playbackRoom=null; return; }
  if(usingSourceSpace()){
    const result=chunkSurfRuntime.inspectFocused(px,py,R3.r3dFacing());
    if(result.handled){
      REC.emitNoise(.05,px,py,'source handled',{spoils:false,kind:'handling_noise',sourceKind:'player',sourceId:'source',playerGenerated:true,deliberate:true});
      if(result.text)SPEECH.say({who:result.event==='completed'?'direction':'you',text:result.text});
      syncSourceRender({force:result.event==='page-found'||result.event==='completed'});
    }
    // Nothing in focus: no interaction, and no "nothing here" thought to break
    // the flow of just walking and reading the field.
    return;
  }
  if(usingStairAnomaly()){CUES.playCue(CUES.CUE.door,{gain:.05,rate:.36});return;}
  if(interactChapelScreen())return;
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
  // Reaching for the door he came in through outranks operating it. He never
  // gets to open this one.
  if(tryTheGreyDoor()) return;
  const focus=usingPlan()?worldInteractionFocus():{prop:null,door:null,doorWins:false};
  if(tryDockHauntingDoor(focus))return;
  const lookYaw=mapHeading(),lookForward=[Math.sin(lookYaw),-Math.cos(lookYaw)];
  const doorHit=focus.doorWins?FP.interactDoor(px,py,lookForward,playerKeys):null;
  if(doorHit){
    if(doorHit.id==='tower-hatch'&&!chapelTowerState().hatchInspected){
      commitChapelTower({type:'BELL_HATCH_INSPECTED'});
      SPEECH.say({who:'you',text:'Bell chamber hatch. The hasp follows the inner screen; the relay runs through the frame above it.'});
    }
    if(!doorHit.ok){
      if(doorHit.keyId==='tower-live'){
        if(!chapelTowerState().hatchInspected)commitChapelTower({type:'BELL_HATCH_INSPECTED'});
        SPEECH.say({who:'you',text:'Bell chamber. ACCESS RESTRICTED. The maintenance hasp is linked to the inner screen.'});
      }else SPEECH.say({who:'you',text:lockedDoorThought(doorHit.keyId)});
      return;
    }
    if(doorHit.opened||doorHit.closed||doorHit.removedWedge){
      const portal=FP.doorState().find((door)=>door.id===doorHit.id)||{...doorHit,cx:px,cy:py};
      emitDoorArchitecture(portal,doorHit.opened?'door_open':'door_close',{playerGenerated:true});
      if(doorHit.removedWedge)SPEECH.say({who:'you',text:'The rubber wedge comes free. The closer takes the weight.'});
      saveCommit({doors:FP.saveDoorState()});
      facilityMapCache={key:null,model:null};syncDoorDynamicProps();
    }
    return;
  }
  if(interactNatatoriumWater()) return;
  const hit=focus.prop;
  if(hit){
    if(hit.action==='tower-relay-interrupt'){
      if(towerRelayStage(chapelTowerState())!==TOWER_RELAY_STAGE.INTERRUPT){
        SPEECH.say({who:'you',text:'The frame is not the first fault. Rope, hammer, hatch. Diagnose it in order.'});
        return;
      }
      const result=bellTowerRuntime?.interruptRelay?.()||{ok:false,reason:'inactive'};
      if(!result.ok){
        if(result.reason==='unsafe')SPEECH.say({who:'you',text:'Not against the moving wheel. Wait for the casting to pass balance, then cut the relay.'});
        else if(result.reason==='already-cut')SPEECH.say({who:'you',text:'That clamp is already out. Let the next stroke expose the following one.'});
        else SPEECH.say({who:'you',text:'The relay is not moving yet.'});
        return;
      }
      const next=commitChapelTower({type:'RELAY_INTERRUPTED'});
      CUES.playCue(CUES.CUE.keys,{gain:.36,rate:.52+next.relayInterruptions*.08});
      CR.fx.shake(.24,180);
      SPEECH.say({
        who:result.complete?'direction':'you',
        text:result.complete
          ? 'The third clamp drops. The peal loses its carrier. The shutter winch is free to take the remaining load.'
          : `Relay clamp ${next.relayInterruptions} of ${TOWER_RELAY_REQUIRED_INTERRUPTS}. The next safe stroke is coming.`,
      });
      return;
    }
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
    if(openLoadingDockInvestigation(hit))return;
    if(hit.action?.startsWith('power-panel-')){
      const circuit=powerCircuitForPanel(hit.id);
      if(!circuit)return;
      inspectPropTracked(hit.id);
      const result=togglePowerCircuit(getSave().power,circuit.id);
      saveCommit({power:result.state});
      emitProgress(EVENT_TYPES.POWER_CIRCUIT_CHANGED,{circuit:circuit.id,live:result.live},'main.powerPanel');
      updateElectricalHum();
      const group=FP.logicalToPhysical(px,py).renderGroup;
      R3.r3dSetProps(worldRenderInstances(group));
      if(result.live){
        CUES.playCue(CUES.CUE.light,{gain:.42,rate:.62});
        SPEECH.say({who:'you',text:`${circuit.label}. Up. For a second, nothing—then ${circuit.serves} remembers electricity. Dim tubes, old ballast. Useful light with a note underneath it.`});
      }else{
        CUES.playCue(CUES.CUE.light,{gain:.28,rate:.48});
        SPEECH.say({who:'you',text:`${circuit.label}. Down. The light goes first. The hum takes another breath to understand.`});
      }
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
    if(hit.action==='take-pool-cells'){
      if(flagTest('pool.cells')){SPEECH.say({who:'you',text:'The empty sleeve is still in the cart. I did not imagine taking them.'});return;}
      flagApply(['pool.cells']);REC.addBattery(.5);
      saveCommit({flags:getSave().flags,rec:REC.saveRecState()});
      CUES.playCue(CUES.CUE.keys,{gain:.28,rate:.74});
      SPEECH.say({who:'you',text:'Two alkaline cells in a sealed maintenance sleeve. Wrong department, right torch. Half a night, if I stop spending it on rooms I already know.'});
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
      if(playerKeys.has('chapel')){SPEECH.say({who:'you',text:'C-17. Already on the keyring.'});return;}
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
    if(hit.action==='tower-hammer-isolator'){
      if(chapelTowerState().hammerIsolated){SPEECH.say({who:'you',text:'Clock hammer isolated. The remaining drive is in the bell frame.'});return;}
      commitChapelTower({type:'CLOCK_HAMMER_ISOLATED'});
      if(instr?.propId==='tower-tenor-clock-hammer')silenceInstrument(instr.propId);
      SPEECH.say({who:'you',text:'CLOCK HAMMER — ISOLATED. The linkage falls out of tension.'});
      return;
    }
    if(hit.action==='tower-shutter-winch'){
      if([CHAPEL_TOWER_PHASE.TOWER_CLEARED,CHAPEL_TOWER_PHASE.CHAPEL_FINAL].includes(chapelTowerState().phase)){SPEECH.say({who:'you',text:'The pawl is released. The service stairs are open in both directions.'});return;}
      if(towerRelayStage(chapelTowerState())!==TOWER_RELAY_STAGE.RELEASE){
        const objective=towerObjective(chapelTowerState());
        SPEECH.say({who:'you',text:`Not yet. ${objective.label.replaceAll('  ',' ')}.`});
        return;
      }
      const result=bellTowerRuntime?.requestStop?.()||{ok:false};
      if(!result.ok){SPEECH.say({who:'you',text:'The relay is still carrying the frame. Three clamps, then the pawl.'});return;}
      if(!chapelTowerState().shuttersReleased)commitChapelTower({type:'SHUTTERS_RELEASED'});
      SPEECH.say({who:'direction',text:'The shutters open. The damaged peal takes one short course to rounds and begins to stand.'});
      return;
    }
    // The gallery busts are the one thing on that floor you address rather than
    // inspect. See talkToBust: every answer is his own.
    if(hit.talkable && talkToBust(hit.id)) return;
    const line=inspectPropTracked(hit.id);
    // Some ordinary furniture has a calibration pin in it (see PIN_HOSTS). The
    // pin is announced first and the prop still says its own line underneath.
    const tookPin=takeHostedPin(hit.id);
    if(tookPin){ saveCommit({props:PROPS.savePropState()}); if(line)SPEECH.say({who:'you',text:line}); return; }
    if(hit.sampleFamily?.length){
      // Hold [e] to play a random stem from the top; release stops it (see
      // onKeyUp → stopHeldPropPlay). The first press is the deliberate note the
      // room hears.
      auditionPropTracked(hit.id);
      const started=startHeldPropPlay(hit);
      if(started){
        REC.emitNoise(.16,hit.rx,hit.ry,`the ${propLabel(hit).toLowerCase()} sounded`,{
          kind:hit.acousticKind||'instrument_note',sourceKind:'environment',sourceId:hit.id,playerGenerated:true,deliberate:true,
        });
      }
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
      id:'light',label:'light',present:!torchMissing,battleCapable:true,
      value:torchMissing?'MISSING':`${Math.round(Math.min(1,REC.batteryLevel())*100)}%${REC.batteryLevel()>1?'+ RESERVE':''}`,
      statusTone:torchMissing?'danger':'active',
      location:torchMissing?'UNKNOWN':'CARRIED',
    },
    {
      id:'recorder',label:'recorder + headphones',present:!recorderMissing,battleCapable:true,
      value:recorderMissing?'MISSING':'READY',
      statusTone:recorderMissing?'danger':'active',
      location:recorderMissing?'UNKNOWN':'CARRIED',
    },
    ...(flagTest('has.interface')?[{
      id:'interface',label:'bent rig interface',present:true,battleCapable:true,
      value:'READY',statusTone:'active',location:'CARRIED',
    }]:[]),
    ...((flagTest('has.fork') || flagTest(CHUNK_SURF_FLAGS.fork))?[{
      id:'tuning-fork',label:'tuning fork',present:true,battleCapable:true,
      value:'A440',statusTone:'active',location:'CARRIED',
    }]:[]),
    {
      id:'map',label:'location indicator',present:!itemLost('map'),
      value:itemLost('map')?'MISSING':'LIVE',statusTone:itemLost('map')?'danger':'active',
      location:itemLost('map')?'UNKNOWN':'CARRIED',action:itemLost('map')?null:openMapFromBag,
      actionLabel:'OPEN',destructive:false,
    },
    {
      id:'radio',label:'radio',present:!radioDropped&&!radioMissing,battleCapable:true,
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
      id:'coffee',label:"the guard's coffee",value:'GET COLD',statusTone:'metadata',battleCapable:true,
      action:drinkCoffee,actionLabel:'DRINK',destructive:true,
      confirm:{title:'DRINK THE COFFEE?',body:'THIS CANNOT BE UNDONE.'},
    }]:[]),
  ];
}

function moveBagCombatEquipment(id,destination){
  const result=moveCombatGear(getSave().bagLoadout,id,destination);
  if(result.changed)saveCommit({bagLoadout:result.loadout});
  return result;
}

function reorderBagCombatEquipment(id,direction){
  const result=reorderCombatGear(getSave().bagLoadout,id,direction);
  if(result.changed)saveCommit({bagLoadout:result.loadout});
  return result;
}

// The footer hint is for the un-guided case. A tutorial step is not a hint: it
// takes the case's own callout band (see tutorialGuide / drawBagGuide), which
// locks the surface and says WHY, so a required step can never be mistaken for
// an optional keypress printed next to a button.
function bagHint(){ return ''; }

function bagFocus(){
  if(TUT.tutorialStep()==='read') return {sectionId:'files',entryId:'file:work-order'};
  if(TUT.tutorialStep()==='mark') return {sectionId:'map',roomId:'main_b3',entryId:'room:main_b3',onceKey:'tutorial:mark-main-b3'};
  return null;
}

function openBag({ focus:focusOverride=null }={}){
  if(!storyMode) return;
  if(REC.isRecording()){ SPEECH.say({ who:'you', text:'Not while rolling.' }); return; }
  ensureCtx();
  CUES.playCue(CUES.CUE.bag, {gain:0.72});
  REC.emitNoise(0.05, px, py, 'bag rummage',{
    kind:'bag_rummage',sourceKind:'player',sourceId:'field-case',playerGenerated:true,deliberate:true,
  });
  scenes.push(makeBagScene({
    getEquipment:bagEquipment,
    getLoadout:()=>getSave().bagLoadout,
    moveEquipment:moveBagCombatEquipment,
    reorderEquipment:reorderBagCombatEquipment,
    getJob:bagJob,
    getMap:currentFacilityMapModel,
    getHint:bagHint,
    focus:focusOverride || bagFocus(),
    getFocus:bagFocus,
    getGuide:()=>TUT.tutorialGuide('bag'),
    getBuild:combatBuild,
    hasRig:()=>flagTest('has.interface'),
    onApplySkills:applyCalibrationBuild,
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
    mesh:'tuning_fork',
    label:'tuning fork',
    rx:fork.x,ry:fork.y,
    elevation:.04,
    scale:.74,
    yaw:-0.24,
    blocks:false,
    action:'story-tuning-fork',
    inspect:{
      first:'A tuning fork on the sill. The steel catches the torch as a thin line.',
      again:'A=440. And nothing else.',
    },
  });
}

// Collectible calibration pins — diegetic brass pickups in the building's
// optional corners. Each grants a calibration pin (see combat-progression's
// PIN_SOURCES.flags). Placed off the recording route so finding one is a reason
// to explore the academic gallery, the atrium, and the tower.
// ── the calibration pins ────────────────────────────────────────────────────
// They used to be three loose brass pins lying on the floor of three enormous
// zones, at `elevation: .02`, in the dark, at a position picked by
// `godFindZonePoint` — i.e. an arbitrary walkable cell. Nobody found them, ever,
// including people looking on purpose. A 20mm object flat on the floor of a
// pitch-black gallery is not a collectible, it is a rumour.
//
// So they live INSIDE things you already want to touch. Each host is an ordinary
// inspectable prop; inspecting it the first time turns up the pin as well as its
// own line. The hosts are chosen so the pin makes sense of the object: a bust
// whose base was re-pinned, soil somebody knelt in to service a head, a ringing
// bench with a gap between its boards.
const PIN_HOSTS = Object.freeze({
  'academic-garden-planter-west': {
    flag:'pin.academic',
    found:'A calibration pin, half down in the soil. Somebody knelt out here with a head off and lost it in the dirt. Still true.',
  },
  // The gallery head that sits off-square on its plinth (see BUST_TREES).
  'academic-bust-5': {
    flag:'pin.gallery',
    found:'A calibration pin, on its side in the felt under the base. Somebody had this head off, serviced something out here, and never found it again. Still true.',
  },
  'tower-ringing-bench-west': {
    flag:'pin.tower',
    found:'Something in the gap between the boards. A calibration pin, brass, gone dull. It rings very faintly when the bell settles.',
  },
});

// Inspecting a host prop yields its pin, once. Returns true when a pin was taken,
// so the caller still prints the prop's ordinary inspect line underneath.
function takeHostedPin(propId){
  const host=PIN_HOSTS[propId];
  if(!host || flagTest(host.flag)) return false;
  flagApply([host.flag]);
  saveCommit({flags:getSave().flags});
  fireCue('bag');
  REC.emitNoise(.03,px,py,'calibration pin pocketed',{
    spoils:false,kind:'handling_noise',sourceKind:'equipment',sourceId:'pin',playerGenerated:true,deliberate:true,
  });
  const free=combatBuild().unspent;
  SPEECH.sayAll([
    { who:'you', text:host.found },
    { who:'you', text:free>0
      ? `That is ${free===1?'a modification':`${free} modifications`} the recorder can take. ${BINDINGS.inputPrompt('bag')} — calibration.`
      : 'The recorder can spend that on itself.' },
  ]);
  return true;
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
// It now has three authored cue points instead of two linear transmissions.
// The old speech-band chatter became dialogue trees because "go ahead" is only
// interesting when the player chooses how to answer.
function radioCueBlocked(){
  return scenes.blocksInput() || REC.isRecording() || REC.isListening() || SPEECH.isSpeaking();
}

function completedRecordingTakes(){
  return REC.recState().takes.filter((room)=>room && room!=='lux_nova').length;
}

function nearestUnrecordedRecordingTarget(){
  let best=null;
  for(const room of TARGETS){
    if(room==='lux_nova' || REC.hasTake(room) || !ROOM_CELLS[room]) continue;
    const at=FP.toRuntimePoint(ROOM_CELLS[room]);
    const cells=Math.hypot(at.x-px, at.y-py);
    const meters=FP.toAuthoredCoord(cells);
    if(!best || meters<best.distanceMeters) best={roomId:room, x:at.x, y:at.y, distanceMeters:meters};
  }
  return best;
}

function emitRadioCue(type, cue, source){
  emitProgress(type, {
    id:cue.id,
    roomId:cue.roomId || null,
    reason:cue.reason || null,
  }, source);
}

function queueRadioStoryCue(id, { roomId=null, reason='' } = {}){
  const queued=RADIO.queueRadioCue(id, { roomId, reason });
  const cue=RADIO.pendingRadioCue();
  if(queued && cue) emitRadioCue(EVENT_TYPES.RADIO_CUE_QUEUED, cue, 'main.queueRadioStoryCue');
  if(queued) saveCommit({ radio:RADIO.saveRadioState() });
  return maybeStartPendingRadioCue() || queued;
}

function maybeStartPendingRadioCue(){
  if(radioCueBlocked()) return false;
  const pending=RADIO.pendingRadioCue();
  if(!pending) return false;
  const cue=RADIO.consumeRadioCue();
  if(!cue) return false;
  if(!RADIO.transmit([])){
    RADIO.resolveRadioCue(cue.id);
    saveCommit({ radio:RADIO.saveRadioState() });
    return false;
  }
  emitRadioCue(EVENT_TYPES.RADIO_CUE_STARTED, cue, 'main.maybeStartPendingRadioCue');
  saveCommit({ radio:RADIO.saveRadioState() });
  const nodes=radioDialogue(cue.id, { roomLabel: cue.roomId ? roomLabel(cue.roomId) : 'the next room' });
  const scene=converse(`radio:${cue.id}`, nodes, {
    onDone:()=>{
      const wasDead=RADIO.isDead();
      RADIO.resolveRadioCue(cue.id);
      emitRadioCue(EVENT_TYPES.RADIO_CUE_RESOLVED, cue, 'main.radioCueDone');
      if(!wasDead && RADIO.isDead()){
        emitProgress(EVENT_TYPES.RADIO_DEAD, { id:'radio' }, 'main.radioCueDone');
      }
      saveCommit({ radio:RADIO.saveRadioState() });
    },
  });
  if(!scene){
    const wasDead=RADIO.isDead();
    RADIO.resolveRadioCue(cue.id);
    emitRadioCue(EVENT_TYPES.RADIO_CUE_RESOLVED, cue, 'main.radioCueBypassed');
    if(!wasDead && RADIO.isDead()) emitProgress(EVENT_TYPES.RADIO_DEAD, { id:'radio' }, 'main.radioCueBypassed');
    saveCommit({ radio:RADIO.saveRadioState() });
    return false;
  }
  return true;
}

function maybeQueueRadioProgressionCue(){
  if(!storyMode || RADIO.isDead()) return false;
  const completedTakes=completedRecordingTakes();
  if(RADIO.shouldQueuePostSecondTake({ completedTakes, isRecording:REC.isRecording() })){
    return queueRadioStoryCue(RADIO.RADIO_CUES.POST_SECOND, { reason:'second-take-complete' });
  }
  const target=nearestUnrecordedRecordingTarget();
  if(RADIO.shouldQueuePreThirdBreakdown({
    completedTakes,
    isRecording:REC.isRecording(),
    nearestRoom:target?.roomId || null,
    distanceMeters:target?.distanceMeters ?? Infinity,
  })){
    return queueRadioStoryCue(RADIO.RADIO_CUES.PRE_THIRD, {
      roomId:target.roomId,
      reason:'approaching-third-room',
    });
  }
  return maybeStartPendingRadioCue();
}

function maybeForceRadioBreakdownForRoom(room){
  if(room==='lux_nova') return false;
  if(maybeStartPendingRadioCue()) return true;
  return RADIO.pendingRadioCue()?.id===RADIO.RADIO_CUES.POST_SECOND;
}

function radioTransmit(i){
  const cue=[RADIO.RADIO_CUES.INITIAL, RADIO.RADIO_CUES.POST_SECOND, RADIO.RADIO_CUES.PRE_THIRD][Number(i)||0];
  return cue ? queueRadioStoryCue(cue, { reason:'debug-transmit' }) : false;
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
  maybeQueueRadioProgressionCue();
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
  tickRadioDecoy(dt);
}

// A radio you put down is still a radio: it squelches in an empty corridor and
// the HUSH walks to it. This is the only thing in the bag that can lie for you,
// and it costs you the check-in to use it.
let radioDecoyNextAt=0;
function tickRadioDecoy(dt){
  if(!storyMode || usingSpecialSpace() || !PRES.isActive()) return;
  const at=RADIO.radioLocation();
  if(!at) { radioDecoyNextAt=0; return; }
  const now=performance.now();
  if(!radioDecoyNextAt){ radioDecoyNextAt=now+2200+Math.random()*2600; return; }
  if(now<radioDecoyNextAt) return;
  radioDecoyNextAt=now+3200+Math.random()*4200;
  // Emitted AT THE RADIO, not at the player — that displacement is the entire
  // mechanic. A dead radio still clicks; it just has less to say.
  const level=RADIO.isDead()?0.22:0.38;
  REC.emitNoise(level, at.x, at.y, 'the radio squelches where you left it', {
    kind:'radio_squelch', sourceKind:'equipment', sourceId:'dropped-radio',
    playerGenerated:false, deliberate:false, spoils:false, audibleToHush:true,
  });
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
  if(PB.isPlaying()){ PB.stopPlayback(); playbackRoom=null; return; }
  ensureCtx();
  PB.playbackInit({ ctx:actx, bus:sfxGain || master });
  const playing=PB.playTake(room, { character: roomToneCharacter(room) });
  if(!playing)return;
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
    REC.addBattery(0.75);          // the larger of the building's two cell caches
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
  if(REC.lightOn() && bat<=0.40 && !flagTest('torch.low')){
    flagApply(['torch.low']);
    SPEECH.say({who:'you',text:'The light is shrinking and the white has gone out of it. Forty percent, perhaps. Enough to work with, for now.'});
    saveCommit({flags:getSave().flags});
  }
  if(REC.lightOn() && bat<=0.15 && !flagTest('torch.dying')){
    flagApply(['torch.dying']);
    bumpFear(0.2);
    SPEECH.say({who:'you',text:"Brown at the edge. I don't know that it will last much longer."});
    saveCommit({flags:getSave().flags});
  }
  if(REC.drainLight(dt)){
    CUES.playCue(CUES.CUE.light, {gain:0.5, rate:0.72});
    bumpFear(0.35, { stinger:0.7 });
    SPEECH.say({ who:'you', text:'...no. No, no — come on. Come ON!' });
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
      { who: 'direction', text: 'At the chapel door, with four rooms on tape and one to go, the torch goes out.' },
      { who: 'you', text: 'The torch cells. The good cells. Of course.' },
      { who: 'direction', text: 'You traded a way out for a few hours of light, and the light has just handed the hours back, at the door, in front of the thing you are about to meet.' },
    ]);
    saveCommit({ flags:getSave().flags, rec:REC.saveRecState() });
  }
}

// Past the inner door, the building starts dreaming. Authored `y > 15` is the
// same line the tutorial's `go` step draws, because it is the same threshold.
function maybeWakeLens(){
  if(storyMode&&planName==='conservatory') setLocalDiffusionActive(true);
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
function localDiffusionLevelForOnset(v=window.__lensOnset ?? LENS_FLOOR){
  return Math.max(0,Math.min(1,Number(v)||0));
}
function setLocalDiffusionActive(active=true){
  R3.r3dSetLocalDiffusionLevel(active ? 1 : 0);
}
function tickLensOnset(dt){
  if(!storyMode) return;
  // Sober, the building still works on you — slowly, and only a little.
  if(!flagTest('drank.coffee')) lensTarget = Math.min(0.34, LENS_FLOOR + (getSave().playSeconds||0)/1800*0.22);
  lensOnset += (lensTarget - lensOnset) * Math.min(1, dt / lensTau);
  applyLensOnset(lensOnset);
}
function applyLensOnset(v){
  window.__lensOnset = v;
  if(window.__diffusion?.stats) setLocalDiffusionActive(true);
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

function consumeBattleCoffee(){
  if(flagTest('drank.coffee'))return false;
  flagApply(['drank.coffee']);
  saveCommit({flags:getSave().flags});
  emitProgress(EVENT_TYPES.COFFEE_DRUNK,{},'main.consumeBattleCoffee');
  CUES.playCue(CUES.CUE.recorder,{gain:0.35,rate:0.6});
  lensDrink();
  return true;
}

function chunkSurfRouteProfile(){
  return {
    drankCoffee: flagTest('drank.coffee'),
    hasRig: flagTest('has.interface'),
    endingsSeen: getMeta().endingsSeen || [],
  };
}

function chunkSurfCompleted(){
  return flagTest(CHUNK_SURF_FLAGS.completed);
}

function chunkSurfMandatory(){
  return [CHAPEL_TOWER_PHASE.SOURCE_READY,CHAPEL_TOWER_PHASE.TRANSITION_READY].includes(chapelTowerState().phase);
}

function chunkSurfAvailable(){
  return storyMode
    && planName === 'conservatory'
    && chapelTowerState().phase===CHAPEL_TOWER_PHASE.SOURCE_READY
    && nearAuthoredRuntime(px,py,CHAPEL_SCREEN_AUTHORED,7)
    && canOfferChunkSurf({
      completedTakes: REC.recState().takes.length,
      roomId: recordableRoomAt(px, py) || (currentAreaLabel().toLowerCase().includes('chapel') ? 'chapel_approach' : ''),
      alreadyCompleted: chunkSurfCompleted(),
    });
}

function tickChunkSurfOffer(){
  // Availability is visible at the chapel screen; proximity never enters it.
  return false;
}

function beginChunkSurf({ forced=false } = {}){
  if(!chunkSurfAvailable() && !forced) return false;
  if(usingSpecialSpace()) return true;
  ensureCtx();
  flagApply([CHUNK_SURF_FLAGS.offered, CHUNK_SURF_FLAGS.entered]);
  STORY.stopAll();
  const profile=chunkSurfRouteProfile();
  const returnPoint={x:px,y:py,facing:R3.r3dFacing()};
  let state=freshChunkSurfState({
    ...profile,
    seed:getSave().run?.startedAt||Date.now(),
    returnPoint,
  });
  state=reduceChunkSurf(state,{type:'SOURCE_ENTERED',returnPoint});
  OBJ.clearWaypoint();
  saveCommit({flags:getSave().flags,obj:OBJ.saveObjState(),chunkSurf:state,px:SOURCE_ENTRY.x,py:SOURCE_ENTRY.y,area:'source-space'});
  activateSourceSpace(state,{position:SOURCE_ENTRY});
  return true;
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

function currentFearPressure({ recordingProgress=REC.isRecording()?REC.takeProgress():0 }={}){
  const pressure=computeFearPressure({
    fear,
    recordingProgress,
    recording:REC.isRecording(),
    hushField:hushAudioRuntime?.currentField?.()||null,
    hushAudition:hushAudioRuntime?.currentAudition?.()||null,
    personalInterference:!!personalInterference.active(),
    radio:{dead:RADIO.isDead(),dropped:RADIO.isDropped()},
  });
  window.__fearPressure=pressure;
  return pressure;
}

function presentedFearPressure(pressure=currentFearPressure()){
  const presented={...pressure};
  for(const key of Object.keys(godFxOverride)){
    if(Number.isFinite(godFxOverride[key])) presented[key]=godFxOverride[key];
  }
  presented.overall=Math.max(
    Number(presented.overall)||0,
    Number(presented.heartbeat)||0,
    Number(presented.monitorHiss)||0,
    Number(presented.visualDread)||0,
  );
  window.__presentedFearPressure=presented;
  return presented;
}

function tickFear(dt){
  if(!storyMode){ FEAR.setFear(0); R3.r3dSetFear(0); return; }
  FEAR.startHeartbeat();                // a heart does not need to be asked twice
  // Proximity is its own dread: the closer it is, the less the number falls.
  const near = PRES.isActive() ? PRES.pressure(px,py) : 0;
  fear = Math.max(0, Math.min(1, fear + near*0.22*dt - FEAR_DECAY*activeDifficulty.fear.fearDecayScale*dt));
  const pressure=presentedFearPressure();
  FEAR.setFear(pressure.heartbeat);
  R3.r3dSetFear(pressure.visualDread);  // vignette, grain, desaturation
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
           marked: OBJ.targetRoom(),
           // The level step is not done when the meter reads good — it is done
           // when the rehearsal that follows it is. Otherwise the next step's
           // line lands in the middle of the daydream, over the top of the drill.
           rehearsed: flagTest('combat.trained'),
           // Left the dock = stepped out of its zone in any direction, which is
           // what ends the setup and starts the night.
           leftDock: usingPlan() && !usingSpecialSpace() ? FP.zoneAt(px,py)!==ZONE.dock : true };
}

function tickMutation(dt){
  if(!usingPlan()||usingSpecialSpace()) return;
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

function tickSourceSpace(dt){
  if(!usingSourceSpace())return;
  if(SPEECH.isSpeaking()||scenes.blocksInput())chunkSurfRuntime.protectMoment(.35);
  chunkSurfRuntime.tick(dt,{px,py,facing:R3.r3dFacing()});
  const paper=chunkSurfRuntime.paperTonePoint();
  const now=performance.now();
  // The long hall should tighten toward the still page, not slacken. Feed a
  // gentle depth-scaled dread while advancing so the pressure rises INTO the
  // find instead of decaying to nothing before you reach it — the fear system
  // still eases it back down, so this sustains a curve rather than a spike, and
  // it does not cliff the moment the page is in view. Small and throttled.
  if(chunkSurfRuntime.state().phase===CHUNK_SURF_PHASE.HALL && now>=sourceHallDreadAt){
    const stage=chunkSurfRuntime.state().pageStage; // 0..4, rises with hall depth
    if(stage>0){ bumpFear(.05+stage*.045); sourceHallDreadAt=now+1100; }
  }
  if(paper&&now>=sourcePaperToneAt){
    const dx=paper.x-px,dy=paper.y-py,distance=Math.hypot(dx,dy);
    if(distance<32){
      const facing=R3.r3dFacing(),right=[[1,0],[0,1],[-1,0],[0,-1]][facing];
      const pan=Math.max(-1,Math.min(1,(dx*right[0]+dy*right[1])/Math.max(1,distance)));
      CUES.playPageTurn({gain:.045,pan});
      pushEvent(`// paper tone · ${Math.abs(pan)<.2?'ahead':pan<0?'left':'right'}`);
      sourcePaperToneAt=now+4200;
    }
  }
  const objective=chunkSurfRuntime.sourceObjective();
  if(objective.alignmentPulse&&objective.bearing&&now>=sourceAlignmentToneAt){
    const pan=objective.bearing.includes('W')?-.55:objective.bearing.includes('E')?.55:0;
    CUES.playCue(CUES.CUE.recorder,{gain:.055,rate:.5,pan});
    sourceAlignmentToneAt=now+7000;
  }
  const hush=chunkSurfRuntime.hushMode();
  // The presence is on the board for the whole back half of Source, not only the
  // two scripted pursuits: once the fork wakes it (mode leaves 'absent') it stays
  // spawned and PROWLS at a dread-set distance — a body you can see moving out
  // there — and only escalates to a hunt when the runtime says it is colliding.
  const hushPresent=hush.mode!=='absent';
  if(hushPresent&&!PRES.isActive()){
    PRES.spawnBehind(px,py,0,1);
  }else if(!hushPresent&&PRES.isActive())PRES.despawn();
  if(!sourceFinalCombatOpen&&performance.now()>=sourceFinalCombatRetryAt&&!scenes.blocksInput()){
    const request=chunkSurfRuntime.finalEncounterRequest();
    if(request?.adapter==='combat-v1'){
      sourceFinalCombatOpen=true;
      PRES.despawn();
      openBattle(sourceCombatBattle(),{
        source:{rescueEligible:request.rescueEligible},
        onWin:(metrics={})=>{
          sourceFinalCombatOpen=false;
          const resolved=chunkSurfRuntime?.resolveFinalEncounter({
            outcome:metrics.source?.outcome,
            channels:metrics.source?.channels||{},
            turns:metrics.turns,
            won:true,
            compatibility:{adapter:'combat-v1',sourceReading:metrics.source?.sourceReading||null},
          });
          if(!resolved?.handled)SPEECH.say({who:'you',text:'The return channel did not resolve.'});
        },
        onLose:()=>{
          sourceFinalCombatOpen=false;
          sourceFinalCombatRetryAt=performance.now()+2500;
          const failed=chunkSurfRuntime?.failFinalEncounter();
          const checkpoint=failed?.checkpoint;
          if(checkpoint){px=checkpoint.x;py=checkpoint.y;R3.r3dSetFacing(checkpoint.facing||0);chunkSurfRuntime.setPlayerPosition({x:px,y:py,facing:R3.r3dFacing()});}
          renderMove=null;motionRig=null;trail=[];
          saveCommit({px,py,chunkSurf:chunkSurfRuntime?.state?.(),rec:REC.saveRecState(),area:'source-space'});
          SPEECH.say({who:'you',text:'Fresh monitor path. Same clause. It does not get to choose for me.'});
        },
        onAbort:()=>{sourceFinalCombatOpen=false;sourceFinalCombatRetryAt=performance.now()+1000;},
      });
    }
  }
  syncSourceRender();
}

let stairAnomalyEnteredAt=0;
function tickStairAnomaly(_dt){
  if(!usingStairAnomaly())return;
  syncStairAnomalyRender();
  // He works out the trick himself, once he has been climbing long enough to be
  // properly frightened. Said once, in his own voice, and never repeated — it is a
  // man reasoning, not a hint system.
  if(!stairEscapeHinted && stairAnomalyEnteredAt && performance.now()-stairAnomalyEnteredAt>STAIR_ESCAPE.hintAfter){
    stairEscapeHinted=true;
    SPEECH.sayAll([
      { who:'you', text:'This is not a stair. I have been on this for a minute and a half and it is not a stair.' },
      { who:'you', text:"Right. Nothing in here is real while I can see it. So stop seeing it." },
      { who:'you', text:`${BINDINGS.inputPrompt('light')}. Torch off, stand still, count to thirty, and put it back on.` },
    ]);
  }
}

function onSourcePresenceCatch(){
  if(!usingSourceSpace())return;
  if(!chunkSurfRuntime.hushMode().colliding){
    // It brushed you during the quiet stalk — not a pursuit, so it does not reset
    // you. It withdraws to arm's length and keeps circling instead of despawning,
    // so the watched feeling persists between the scripted runs.
    const actor=PRES.presenceState();
    const ang=Math.atan2(actor.y-py,actor.x-px)||(Math.random()*Math.PI*2);
    actor.x=px+Math.cos(ang)*12;actor.y=py+Math.sin(ang)*12;
    actor.hasTarget=false;actor.velocityX=0;actor.velocityY=0;actor.speed=0;
    return;
  }
  const checkpoint=chunkSurfRuntime.handleHushContact();
  px=checkpoint.x;py=checkpoint.y;R3.r3dSetFacing(checkpoint.facing||0);
  const actor=PRES.presenceState();actor.x=px-14;actor.y=py+10;actor.hasTarget=false;
  renderMove=null;motionRig=null;trail=[];
  CR.fx.flash(100,'rgba(255,255,255,.72)');CR.fx.shake(.55,240);
  SPEECH.say({who:'direction',text:'Contact. The source keeps what you resolved and returns both bodies to the last stable address.'});
  syncSourceRender({force:true});
  saveCommit({px,py,chunkSurf:chunkSurfRuntime.state(),presence:PRES.savePresenceState(),area:'source-space'});
}

// The HUSH arrives once the work starts and then it is simply part of the
// night. It is never re-spawned on top of itself, and it is never gated on a
// process-lifetime flag — the old `once('presence-arrives')` meant a New Game
// in the same tab inherited a building that had already been visited.
function spawnBuildingPresence(){
  if(!buildingPresenceNavigation)return false;
  const [forwardX,forwardY]=RENDERER==='3d'?R3.r3dDelta(1):[0,-1];
  return PRES.spawnInHabitableSpace(px,py,{
    navigation:buildingPresenceNavigation,forwardX,forwardY,
  });
}

function summonPresence(reason='noise'){
  if(!storyMode || usingSpecialSpace()) return false;
  if(PRES.isActive()) return false;
  if(!spawnBuildingPresence())return false;
  emitProgress(EVENT_TYPES.HUSH_MET, {reason}, 'main.summonPresence');
  return true;
}

// The hush's off-hours mischief. Some instruments keep a folder of non-battle
// stems; outside the fight the hush will, RARELY, one-shot a single one of them
// — a violin phrase out of the dark, out of time, from somewhere else in the
// building. Never during a fight (the battle scene blocks the world tick), and
// only once the night's real work has begun.
//
// Three things make it a sound in a building rather than a sound in your ears:
// it comes from a bearing (pan), it is far (quiet, and no top end), and the
// walls between you and it take the rest (occlusion). A mischief cue you can
// hear clearly is a mischief cue standing next to you, which is not the joke.
let mischiefNextAtMs=0;
let mischiefQuietUntilMs=0;
const MISCHIEF_INTERVAL_MS=[150000, 330000];
// After a fight the room has had quite enough. Losing especially: the last
// thing a beaten recordist needs is the thing that beat him noodling at him.
const MISCHIEF_AFTER_BATTLE_MS={ win:120000, lose:240000, abort:120000 };

function hushMischiefQuiet(reason='win'){
  mischiefQuietUntilMs=performance.now()+(MISCHIEF_AFTER_BATTLE_MS[reason]??120000);
  mischiefNextAtMs=Math.max(mischiefNextAtMs, mischiefQuietUntilMs);
}

function tickHushMischief(){
  if(!storyMode || !usingPlan() || usingSpecialSpace() || !setupComplete()) return;
  if(scenes.blocksInput()) return;
  const now=performance.now();
  const reschedule=()=>{ mischiefNextAtMs=now+MISCHIEF_INTERVAL_MS[0]+Math.random()*(MISCHIEF_INTERVAL_MS[1]-MISCHIEF_INTERVAL_MS[0]); };
  if(mischiefNextAtMs===0){ reschedule(); return; }
  if(now<mischiefNextAtMs || now<mischiefQuietUntilMs) return;
  reschedule();
  // A single one-shot, drawn at random from the violin non-battle set, played
  // from somewhere that is not here.
  const n=1+Math.floor(Math.random()*6);
  const shape=farRoomShape();
  fireCue(`violin.mischief.${String(n).padStart(2,'0')}`, shape);
  noteMischiefHeard(shape.pan);
}

// ── the busts ────────────────────────────────────────────────────────────────
// Four anonymous heads in the gallery, and a man who talks to them. Nothing
// answers: the conversation is his, both halves of it, and the tree says so (see
// BUST_TALK). It is worldbuilding, it grants nothing, and it costs nothing.
//
// Except once. The FIRST bust he comes back to after having spoken to it has
// turned to face him — a yaw change applied while he was elsewhere, never while
// he is watching, never explained, never repeated. It is the same visual-only
// drift the garden uses, so the thing he is frightened of has not actually moved
// anywhere he could bump into.
const BUST_TURN_YAW = 0.72;
// SIX STATIONS, SIX DIFFERENT THINGS. They used to share one tree, so every head
// in the gallery said the same words and the whole set read as one prop repeated.
// Now each plinth is somebody else's problem:
//
//   1  the long conversation — who he was, how long, the job, that could be me
//   2  the one that TURNS, on the second visit (see below)
//   3  a fragment: the bottom third of a face
//   4  the one that ANSWERS, in a voice that is not his
//   5  brass in the felt under its base — a calibration pin
//   6  a fragment
const BUST_TREES = Object.freeze({
  'academic-bust-1': 'talk',
  'academic-bust-2': 'talk',
  'academic-bust-fragment-3': 'fragment',
  'academic-bust-4': 'answer',
  'academic-bust-5': 'pin',
  'academic-bust-fragment-6': 'fragment',
});
// The head that does not hold still, and the one holding a pin. Named, so the set
// is authored rather than whichever one you happened to touch twice.
const BUST_THAT_TURNS = 'academic-bust-2';
const BUST_WITH_PIN = 'academic-bust-5';
const spokenBusts = new Set();
let bustTurned = false;

function talkToBust(propId){
  if(!storyMode || planName!=='conservatory') return false;
  if(scenes.blocksInput()) return false;
  const kind = BUST_TREES[propId] || 'talk';
  // The scare, on its own head, the second time he comes back to it. The turn has
  // already happened by the time the beam gets there.
  if(kind === 'talk' && propId === BUST_THAT_TURNS && !bustTurned && spokenBusts.has(propId)){
    bustTurned = true;
    PROPS.setPropDrift(propId, { dyaw: BUST_TURN_YAW });
    if(RENDERER==='3d') syncStoryObjectProps();
    fireCue('violin.mischief.01', { gain:.5, lowpassHz:900 });
    bumpFear(.28, { stinger:.5 });
    think('bust-turn', BUST_TURN, { force:true });
    return true;
  }
  spokenBusts.add(propId);
  // The pin is announced first and the head still says its own piece underneath,
  // the same order ordinary furniture uses (see PIN_HOSTS / takeHostedPin).
  if(propId === BUST_WITH_PIN) takeHostedPin(propId);
  const tree = kind === 'fragment' ? BUST_FRAGMENT
    : kind === 'answer' ? BUST_ANSWER
      : kind === 'pin' ? BUST_PIN
        : BUST_TALK;
  if(kind === 'answer') bumpFear(.16, { stinger:.3 });
  // `force` because this is a thought you may have more than once: it is a
  // conversation, and a man alone in a building has it again.
  think(`bust-talk:${propId}`, tree, { force:true });
  return true;
}

// ── the garden ───────────────────────────────────────────────────────────────
// The ruined atrium garden is never quite as you left it. Nothing is ever seen
// to move: a new authored arrangement is applied only after the player has left
// the room for a while. The change is large enough to recognize and restrained
// enough to make memory—not animation—the unsettling part.
//
// Visual only, via PROPS.setPropDrift: the colliders and the pin in the west
// planter's soil stay exactly where they were authored. The layout offsets stay
// within those broad navigation footprints.
const GARDEN_DRIFT_PROPS = Object.freeze([
  'academic-garden-planter-west', 'academic-garden-planter-east',
  'academic-garden-tree-west', 'academic-garden-tree-east',
  'academic-garden-leaves-north', 'academic-garden-leaves-south',
]);
let gardenEpoch = 0;
let gardenLayoutId = gardenLayoutForEpoch(0).id;
let gardenWatch = createGardenWatchState();
let gardenRecallPending = '';

function inTheGarden(){
  if(!usingPlan() || usingSpecialSpace()) return false;
  const physical=FP.logicalToPhysical(px,py);
  // The academic gallery looks directly into the garden, and the concert hall
  // retains a sightline through its small vestibule. Neither counts as "away"
  // merely because its zone id differs from the ground-floor atrium.
  return physical.spaceId==='front_atrium'
    || physical.spaceId==='hall'
    || physical.renderGroup==='academic';
}

// Called only after a real empty-room interval (or by the explicit debug
// probe). The basin and the structure never move; they are the trustworthy
// frame against which the authored arrangements become obvious.
function shiftGarden(reason='unseen'){
  const previousLayoutId = gardenLayoutId;
  gardenEpoch += 1;
  const layout = gardenLayoutForEpoch(gardenEpoch);
  GARDEN_DRIFT_PROPS.forEach((id)=>{
    PROPS.setPropDrift(id, layout.poses[id]);
  });
  gardenLayoutId = layout.id;
  gardenRecallPending = gardenRecallForLayout(previousLayoutId);
  // setPropDrift mutates the prop records; the renderer owns a copied instance
  // list, so it must be refreshed here or the change never reaches the frame.
  if(RENDERER==='3d') refreshWorldProps();
  return { epoch:gardenEpoch, layout:gardenLayoutId, previousLayout:previousLayoutId, reason };
}

// Torch state is irrelevant: darkness while the player is still in the atrium
// is not permission to move. The room must be unoccupied for the full interval.
function tickGarden(){
  const event=tickGardenWatch(gardenWatch,{inside:inTheGarden(),now:performance.now()});
  gardenWatch=event.state;
  if(event.shouldShift) shiftGarden('room-empty');
  if(event.shouldRecall && gardenRecallPending){
    const recall=gardenRecallPending;
    gardenRecallPending='';
    if(shouldNoticeGardenShift(gardenEpoch))SPEECH.say({who:'you',text:recall});
  }
}

// Where that came from, for the map. The mischief is the hush's doing, so if the
// hush is on the floor it IS the hush's position; otherwise the sound came from
// the bearing it was panned to, which is the only honest answer the recorder has.
// It blinks for a few seconds and then it is gone, because a monitor that keeps
// showing a noise you heard once is a monitor that is lying about the present.
const MISCHIEF_BLINK_MS=4200;
let mischiefHeard=null;
function noteMischiefHeard(pan){
  if(!usingPlan()||usingSpecialSpace()) return;
  let at=null;
  if(PRES.isActive()){
    const actor=PRES.presenceState();
    if(Number.isFinite(actor?.x)&&Number.isFinite(actor?.y)) at={x:actor.x,y:actor.y};
  }
  if(!at){
    // Pan is -1..1 across the front; place it out at a plausible room's distance.
    const ang=mapHeading()+(Number(pan)||0)*(Math.PI*0.75);
    // Far enough to be another room, near enough to land inside the local map's
    // radius — a blink drawn off the edge of the panel is a blink nobody sees.
    const reach=9+Math.random()*7;
    at={x:px+Math.sin(ang)*reach, y:py-Math.cos(ang)*reach};
  }
  mischiefHeard={...at, at:performance.now()};
}
function recentMischief(){
  if(!mischiefHeard) return null;
  const age=performance.now()-mischiefHeard.at;
  if(age>MISCHIEF_BLINK_MS){ mischiefHeard=null; return null; }
  // AUTHORED cells, because that is the space the map model draws in — the sight
  // command's origin is the authored position, not the runtime one. Handing the
  // map a runtime position put the blink at twice its true offset, which on this
  // floor is off the right-hand edge of the panel every single time.
  return {
    x:FP.toAuthoredCoord(mischiefHeard.x),
    y:FP.toAuthoredCoord(mischiefHeard.y),
    age, life:MISCHIEF_BLINK_MS,
  };
}

// A cue as heard through a building: off to one side, quiet, and dulled by
// however much wall is between you and the hush. When the hush is not on the
// floor at all we still place it somewhere — the joke is that it is elsewhere.
function farRoomShape(){
  const bearing=(Math.random()*2-1);
  let occlusionDb=14;
  if(PRES.isActive() && usingPlan()){
    try{ occlusionDb=Math.max(6, acousticOcclusionDb(hushPresenceSnapshot(), acousticSpatialAt(px,py))); }
    catch(_){ /* no field yet: keep the default distance */ }
  }
  // -6 dB is half the level; walls take the rest on top of plain distance.
  const muffle=Math.min(34, occlusionDb+8);
  const attenuation=Math.pow(10, -muffle/20);
  return {
    group:'mischief',
    pan:bearing*0.92,
    gainScale:Math.max(0.05, attenuation),
    // Far things have no top end, run a hair slow, and arrive a touch late.
    lowpassHz:Math.max(380, 2600-muffle*62),
    rate:0.92+Math.random()*0.06,
    delay:0.05+Math.random()*0.25,
    fadeIn:0.12,
    skipEffects:true,
  };
}

function tickHushNoisePerception(dt){
  const now=performance.now();
  const snapshot=MONITOR.monitorSnapshot(now);
  monitorExposureSnapshot=snapshot;
  const enabled=storyMode&&!usingSpecialSpace()&&!TUT.tutorialActive();
  const next=updateHushNoisePerception(hushNoisePerception,{
    now,dt,db:snapshot.hushDb,active:PRES.isActive(),enabled,
  });
  hushNoisePerception=next.state;
  if(!next.action||!PRES.isActive())return;
  const input=snapshot.inputPosition;
  const target=input&&Number.isFinite(input.x)&&Number.isFinite(input.y)
    ? input
    : {x:px,y:py};
  const direct=next.action.kind==='pinpoint'||next.action.kind==='contact';
  PRES.offerSoundTarget({
    position:target,
    level:direct?1:.55,
    confidence:direct?1:.58,
    expiresAt:next.action.expiresAt,
    priority:next.action.priority,
    reason:direct?'PLAYER_NOISE_PINPOINT':'PLAYER_NOISE_CLUE',
  });
  if(next.action.kind==='contact'){
    if(PRES.presenceTableauActive())return;
    onPresenceCatch(null,{forced:true,silent:true,reason:'sustained-player-noise'});
  }
}

function monitorDisplaySnapshot(){
  const snapshot=monitorExposureSnapshot||MONITOR.monitorSnapshot();
  const perceptionEnabled=storyMode&&!usingSpecialSpace()&&!TUT.tutorialActive()&&PRES.isActive();
  if(!perceptionEnabled)return snapshot;
  const band=hushNoisePerception.band;
  const floorDb=band==='hot'
    ? MONITOR.MONITOR_DANGER_THRESHOLDS.hotDb
    : band==='mid-hot'
      ? MONITOR.MONITOR_DANGER_THRESHOLDS.midHotDb
      : -96;
  const bandSegments=MONITOR.MONITOR_THRESHOLDS.reduce((count,threshold)=>count+(threshold<=floorDb?1:0),0);
  return{
    ...snapshot,
    band,
    hushBand:band,
    segments:Math.max(snapshot.segments||0,bandSegments),
  };
}

function tickPresence(dt){
  if(usingStairAnomaly())return;
  if(!storyMode || !PRES.isActive()) return;
  if(chapelTowerState().phase===CHAPEL_TOWER_PHASE.TOWER_ACTIVE)return;
  // The torch attracts it acoustically: filament, driver and battery noise. It
  // is sampled intermittently and attenuated by the same walls as every other
  // sound. No sightline and no exact per-frame player tracking are involved.
  const flashlightOcclusionDb=usingPlan()
    ? acousticOcclusionDb(hushPresenceSnapshot(),acousticSpatialAt(px,py))
    : 0;
  PRES.updatePresence(dt,px,py,usingSourceSpace()?onSourcePresenceCatch:onPresenceCatch,
    usingSourceSpace()
      ? {navigation:chunkSurfRuntime.navigation,catchMode:'source-checkpoint'}
      : {
          navigation:buildingPresenceNavigation,
          dreadLevel:presentedFearPressure(),deferContact:true,
          lightSound:{
            active:REC.lightOn(),position:{x:px,y:py},
            // A tired driver complains a little more loudly; either way this
            // remains a weak clue compared with feet or an open microphone.
            level:.24+(1-REC.batteryLevel())*.10,
            confidence:.38,occlusionDb:flashlightOcclusionDb,
          },
          suppressContact:hushSensationMode===HUSH_SENSATION_MODE.BRUSH,
        });
  // Its nearness bleeds into the room tone: the floor thickens as it closes.
  const fieldAudio=hushAudioRuntime?.currentField?.()?.absorption?.audio||0;
  RT.setBed(ROOM_TONE.bedGain * (1 + PRES.pressure(px,py)*0.65) * (1-fieldAudio*.72), 0.4);

  if(usingSourceSpace())return;

  // HUSH dialogue never opens merely because pressure is high. A body-warning
  // picker is now reserved for a physical catch whose approach was unseen.
  // The proximity variant remains reachable only through explicit debug probes.
}

// A take of nothing that gets louder. The hiss rises with the seconds, because
// the longer you hold still in a dead room the more the room is all there is.
const TAKE_HISS = { min: 0.10, max: 0.60 };
let environmentalTenorFired=false;

function playEnvironmentalTenorStrike(){
  ensureCtx();
  if(actx){
    const when=actx.currentTime+.02;
    for(const [ratio,gain,duration] of [[1,.15,8.2],[2.01,.045,5.2],[2.4,.03,4.2],[3.02,.018,3.1]]){
      const osc=actx.createOscillator(),amp=actx.createGain();osc.type='sine';osc.frequency.value=233.08*ratio;amp.gain.setValueAtTime(.0001,when);amp.gain.exponentialRampToValueAtTime(gain,when+.012);amp.gain.exponentialRampToValueAtTime(.0001,when+duration);osc.connect(amp);amp.connect(master||actx.destination);osc.start(when);osc.stop(when+duration+.1);
    }
  }
  const room=recordableRoomAt(px,py)||currentWorld(),atSec=REC.recState().takeElapsed||20;
  PB.noteDiscrete(room,{cueId:'bell.tenor.clock',atSec,gain:1,pan:.34,provenance:{system:'chapel-clock',bell:8}});
  emitAcousticEvent({kind:'bell_tenor_toll',source:{kind:'environment',id:'tower-tenor-clock-hammer'},spatial:acousticSpatialAt(px,py),semantics:{audibleToHush:true,audibleToMonitor:true,audibleInWorld:true,canBeMimicked:true,canSpoilTake:false,family:'bell',tags:['environmental','tenor']},provenance:{system:'chapel-clock',takeSlot:2}});
  pushEvent('// [one deep bell, somewhere above the chapel]');
}

function tickRecorder(dt){
  if(!storyMode) return;
  REC.decayNoise(dt);
  if(usingSpecialSpace())return;
  // The job has an authored encounter cadence. These are not random stabs and
  // they do not share the thought-once registry: only winning consumes one.
  maybeIndependentBattle();
  maybeBattle();
  tickInstrument();
  if(REC.isRecording()){
    const p=REC.takeProgress();
    if(!environmentalTenorFired&&REC.recState().takes.length===1&&p>=.33&&!REC.isStalled()&&!REC.isAssistPaused()){
      environmentalTenorFired=true;playEnvironmentalTenorStrike();
    }
    personalInterference.tick({
      settings:getSave().settings?.personalInterference,
      recording:true,
      takeSlot:REC.recState().takes.length+1,
      takeProgress:p,
      runSeconds:getSave().playSeconds||0,
      stalled:REC.isStalled()||REC.isAssistPaused(),
      spoiled:REC.recState().spoiled,
      roomId:recordableRoomAt(px,py)||currentWorld(),
    });
    STORY.setTapeHissPressure(currentFearPressure({recordingProgress:p}).tapeHiss, { ...TAKE_HISS, ramp: 0.3 });
    tickMic();
  }
  const st=REC.tickRecording(dt);
  if(st==='complete'){
    const room=takeRoom||recordableRoomAt(px,py)||currentWorld();
    REC.addTake(room,{contaminated:!!activeTakeContamination});
    let sourceBecameReady=false;
    if(REC.recState().takes.filter((id)=>id&&id!=='lux_nova').length===4&&chapelTowerState().phase===CHAPEL_TOWER_PHASE.FORESHADOW){
      const chapelTower=reduceChapelTower(chapelTowerState(),{type:'FOURTH_TAKE_COMPLETED'});
      saveCommit({chapelTower});
      sourceBecameReady=true;
    }
    summonPresence('take-complete');
    STAB.reportRelief(0.55);          // a clean take is the biggest exhale there is
    OBJ.clearWaypoint();
    if(sourceBecameReady){
      const screen=FP.toRuntimePoint(CHAPEL_SCREEN_AUTHORED);
      OBJ.setWaypoint(screen.x,screen.y,'inner chapel screen');
    }
    saveCommit({ rec:REC.saveRecState(), obj:OBJ.saveObjState() });
    stopTake();
    // The second clean room is the last time the radio works. Its final cue is
    // queued after the take result lands, then the carrier dies on resolve.
    if(REC.recState().takes.length===2){
      once('radio-post-second', ()=>setTimeout(
        ()=>queueRadioStoryCue(RADIO.RADIO_CUES.POST_SECOND, { reason:'second-take-complete', roomId:room }),
        1800,
      ));
    }
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
  // The setup is not a trap, and the mic test least of all: the meter moves,
  // and nothing in the building is told a word about it.
  if(TUT.tutorialActive()||micCheckActive()) return;
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
  // The tutorial level check is a lesson, not a trap: your real mic drives the
  // monitor meter (the mic test) but never spoils the take or finds you. Nothing
  // punishes you until setup is done and the night's work has actually begun.
  if(TUT.tutorialActive()) return;
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
  const now=actx.currentTime;
  const lp=actx.createBiquadFilter();lp.type='lowpass';lp.frequency.setValueAtTime(900,now);
  const gain=actx.createGain();gain.gain.setValueAtTime(0,now);
  const pan=actx.createStereoPanner();pan.pan.setValueAtTime(0,now);
  lp.connect(gain);gain.connect(pan);pan.connect(master);
  const interval=prop.hushPlayback?.mode==='interval';
  let src=null;
  if(!interval){src=actx.createBufferSource();src.buffer=chunk.buffer;src.loop=true;src.connect(lp);src.start(now);}
  instr.src=src;instr.nodes=[...(src?[src]:[]),lp,gain,pan];instr.filter=lp;instr.gain=gain;instr.pan=pan;instr.sampleRef=ref;instr.nextTriggerAt=interval?performance.now()+350:null;
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
    const interval=instr.prop.hushPlayback?.mode==='interval',nowMs=performance.now();
    if(interval&&nowMs>=instr.nextTriggerAt){
      const chunk=propChunk(instr.sampleRef),src=actx?.createBufferSource();
      if(src&&chunk?.buffer){src.buffer=chunk.buffer;src.connect(instr.filter);src.start();src.stop(actx.currentTime+Math.min(10,chunk.buffer.duration));}
      const range=instr.prop.hushPlayback,seed=PROPS.propState().hushSeed>>>0,span=Math.max(0,(range.maxMs||6800)-(range.minMs||4200));
      instr.nextTriggerAt=nowMs+(range.minMs||4200)+(seed%Math.max(1,span));
      instr.lastNoiseAt=nowMs;
      REC.emitNoise(.34,instr.prop.rx,instr.prop.ry,`the ${propLabel(instr.prop).toLowerCase()} sounded`,{kind:instr.prop.acousticKind||'instrument_note',sourceKind:'hush',sourceId:instr.propId,playerGenerated:false,audibleToHush:false,canSpoilTake:false});
    }else if(!interval&&nowMs-instr.lastNoiseAt>2000){
      instr.lastNoiseAt=nowMs;
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
  summonPresence('take-spoiled');
  // A quiet spoil only turns the presence toward the sound. A loud one is a
  // catch: an injury, a flash and a shake, and — if it is already in the room —
  // a touch. The jumpscare budget spends itself here, and only here.
  if(!caught) return;
  CR.fx.flash(90, 'rgba(120,0,0,0.35)');
  CR.fx.shake(1.8, 360);
  if(PRES.isActive() && PRES.distanceTo(px,py) < PRES.PRESENCE.recoilCells*1.5){
    onPresenceCatch(REC.recState().injuries+1,{takeBreak:true});
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
  showSurferJumpscare();
  const d=window.__diffusion;
  if(d){
    applyLensPreset('rupture');
    possess('rupture', 2);
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

// The hit layer: synthesized impact sounds on top of the tool cues, so damage
// is heard as damage — a zap that lands on the signal, a body thump when it
// lands on you, a two-note confirmation for a perfect response, and a riser
// when a movement breaks.
function playCombatImpact({dealt=0,received=0,perfect=false,transition=false}={}){
  if(!actx||!master)return;
  const t=actx.currentTime;
  const out=master;
  const env=(g,peak,at,dec)=>{g.gain.setValueAtTime(0,t+at);g.gain.linearRampToValueAtTime(peak,t+at+0.006);g.gain.exponentialRampToValueAtTime(0.0004,t+at+dec);};
  const noise=(seconds)=>{
    const buf=actx.createBuffer(1,Math.max(1,Math.floor(actx.sampleRate*seconds)),actx.sampleRate);
    const data=buf.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    const src=actx.createBufferSource();src.buffer=buf;return src;
  };
  if(perfect){
    [880,1318.5].forEach((freq,i)=>{
      const o=actx.createOscillator();o.type='square';o.frequency.setValueAtTime(freq,t+i*0.07);
      const g=actx.createGain();env(g,0.06,i*0.07,0.18);
      o.connect(g);g.connect(out);o.start(t+i*0.07);o.stop(t+i*0.07+0.24);
    });
  }
  if(dealt>0){
    const n=noise(0.12);
    const bp=actx.createBiquadFilter();bp.type='bandpass';bp.Q.value=1.4;
    bp.frequency.setValueAtTime(2400,t);bp.frequency.exponentialRampToValueAtTime(500,t+0.12);
    const g=actx.createGain();env(g,0.15+Math.min(0.12,dealt*0.03),0,0.12);
    n.connect(bp);bp.connect(g);g.connect(out);n.start(t);n.stop(t+0.14);
    const o=actx.createOscillator();o.type='square';
    o.frequency.setValueAtTime(300,t);o.frequency.exponentialRampToValueAtTime(70,t+0.12);
    const og=actx.createGain();env(og,0.09,0,0.11);
    o.connect(og);og.connect(out);o.start(t);o.stop(t+0.15);
  }
  if(received>0){
    const o=actx.createOscillator();o.type='sine';
    o.frequency.setValueAtTime(96,t);o.frequency.exponentialRampToValueAtTime(34,t+0.2);
    const g=actx.createGain();env(g,0.26+Math.min(0.18,received*0.05),0,0.22);
    o.connect(g);g.connect(out);o.start(t);o.stop(t+0.28);
    const n=noise(0.07);
    const lp=actx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=380;
    const ng=actx.createGain();env(ng,0.11,0,0.07);
    n.connect(lp);lp.connect(ng);ng.connect(out);n.start(t);n.stop(t+0.09);
  }
  if(transition){
    const o=actx.createOscillator();o.type='sawtooth';
    o.frequency.setValueAtTime(140,t);o.frequency.exponentialRampToValueAtTime(560,t+0.4);
    const g=actx.createGain();env(g,0.05,0,0.44);
    o.connect(g);g.connect(out);o.start(t);o.stop(t+0.48);
  }
}

function openBattle(battle, opts={}){
  const { bench=false }=opts;
  // The first real fight opens the tray editor once, so the player learns the
  // loadout is theirs to shape. The bench drill runs on fixed house gear and is
  // exempt; after this the flag keeps it from ever nagging again.
  if(!bench && !flagTest('loadout.introShown')){
    ensureCtx();
    return scenes.push(makeLoadoutBriefingScene({
      getLoadout:()=>getSave().bagLoadout,
      getEquipment:bagEquipment,
      moveEquipment:moveBagCombatEquipment,
      reorderEquipment:reorderBagCombatEquipment,
      onConfirm:()=>{ flagSet('loadout.introShown'); saveCommit({flags:getSave().flags}); pushCombat(battle,opts); },
      onClose:()=>{ flagSet('loadout.introShown'); saveCommit({flags:getSave().flags}); pushCombat(battle,opts); },
    }));
  }
  return pushCombat(battle,opts);
}

function pushCombat(battle, { onWin, onLose, onAbort, source=null, director=null, bench=false }={}){
  ensureCtx();
  // Warm the surfer's breakbeat before the fight can ask for it. The cue player
  // returns silence for a file it has not decoded yet, so a backing that is only
  // ever requested mid-fight was never once actually heard.
  warmBattleVoices();
  const battleToolList=availableBattleTools(getSave().bagLoadout,bagEquipment());
  const battleTools=new Set(battleToolList);
  const physical=usingPlan()&&!usingSpecialSpace()?FP.logicalToPhysical(px,py):null;
  const battleLighting=!bench&&physical?resolveLightingContext({
    group:physical.renderGroup,zone:FP.zoneAt(px,py),spaceId:physical.spaceId,
  }):null;
  if(battleLighting)battleLighting.poolScale=Math.max(.62,Math.min(1.18,.55+battleLighting.ambientIntensity*12));
  const playTool=(tool)=>{
    const cue=tool==='torch'?CUES.CUE.light:tool==='radio'?CUES.CUE.slides:CUES.CUE.recorder;
    const rate=tool==='fork'?1.45:tool==='rig'?0.72:tool==='coffee'?0.58:1;
    CUES.playCue(cue,{gain:tool==='radio'?0.45:0.34,rate});
  };
  return scenes.push(makeCombatScene({
    battle,
    difficulty: currentDifficulty().combat,
    loadout: {
      // The bench drill runs on house gear: torch and recorder patched in,
      // full battery, no injuries — the real bag stays untouched.
      injuries: bench?0:REC.recState().injuries,
      battery: bench?1:REC.batteryLevel(),
      torchDrainScale: currentDifficulty().torch.drainScale,
      techniques: bench?[]:normalizeCombatBuild(getSave().combatBuild, getSave().encounters?.cleared, getSave().flags).techniques,
      tools: bench?{
        torch:true, recorder:true, fork:false, rig:false, radio:false, coffee:false,
        order:['torch','recorder'],
      }:{
        torch: battleTools.has('torch'),
        recorder: battleTools.has('recorder'),
        fork: battleTools.has('fork'),
        rig: battleTools.has('rig'),
        radio: battleTools.has('radio'),
        coffee: battleTools.has('coffee'),
        order:battleToolList,
      },
    },
    resources: bench?{ battery:1, spendBattery:()=>{}, consumeItem:()=>{}, playTool, playImpact:(hit)=>{playCombatImpact(hit);pulseAgitation(hit?.received>0?900:600);} }:{
      battery: REC.batteryLevel(),
      spendBattery: (amount)=>REC.addBattery(-Math.max(0,Number(amount)||0)),
      consumeItem:(id)=>id==='coffee'&&consumeBattleCoffee(),
      playTool,
      playImpact:(hit)=>{
        playCombatImpact(hit);
        // A landed hit shoves the walls. A phase break possesses them.
        pulseAgitation(hit?.received>0?900:600);
        if(hit?.transition)possess('battle',3);
      },
    },
    source,
    director,
    environmentLighting:battleLighting,
    musicSession:createBattleMusicSession({
      combatId:battle.combat?.id||battle.id,
      runId:getSave().run?.id||'',
      musicProfile:battle.combat?.music||{},
    }),
    audio: STORY,
    getAudio: ()=>({ ctx:actx, destination:dialogGain || master }),
    fx: { cue:fireCue, flash:CR.fx.flash, shake:CR.fx.shake, glitch:CR.fx.glitch,
      // No sustained backing. Everything the surfer does is a blow on a beat, and
      // the beat is what ends it (see piano-weapon.js).
      // Every battle voice belongs to the beat that swung it (see cues.js
      // groups). This is how a turn — and a fight — actually ends in the room.
      stopCues:()=>CUES.stopCueGroup('battle', .12) },
    playSound: playFarSound,
    // Whatever the result, the building shuts up for a while afterwards. The
    // worst version of this game is the thing that just beat you noodling at you
    // from the next room thirty seconds later.
    onWin: (metrics)=>{ STORY.stopTapeHiss({fade:0.8}); CUES.stopCueGroup('battle',.2); hushMischiefQuiet('win'); STAB.reportThreat(); saveCommit({rec:REC.saveRecState()}); onWin?.(metrics); },
    onLose:(metrics)=>{ STORY.stopTapeHiss({fade:0.8}); CUES.stopCueGroup('battle',.2); hushMischiefQuiet('lose'); STAB.reportThreat(); saveCommit({rec:REC.saveRecState()}); onLose?.(metrics); },
    onAbort:()=>{ STORY.stopTapeHiss({fade:0.3}); CUES.stopCueGroup('battle',.2); hushMischiefQuiet('abort'); STAB.reportThreat(); saveCommit({rec:REC.saveRecState()}); onAbort?.(); },
  }));
}

let activeBattleId=null;
let godBattleOpen=false;
function combatBuild(){return normalizeCombatBuild(getSave().combatBuild,getSave().encounters?.cleared,getSave().flags);}
function applyCalibrationBuild(build,{techniqueIds=[]}={}){
  if(!techniqueIds.length)return false;
  const next=normalizeCombatBuild(build,getSave().encounters?.cleared,getSave().flags);
  saveCommit({combatBuild:next});
  return true;
}
// A won pin opens the bag on its SKILLS tab. There is no separate calibration
// screen any more: the tree is a section of the case like KIT and MAP, so this is
// the ordinary bag with its cursor put somewhere useful.
function openCombatCalibration(){
  openBag({ focus:{ sectionId:'skills' } });
  return true;
}
function openEncounterBattle(id,battle,{onWin,onLose}={}){
  if(activeBattleId||ENCOUNTERS.encounterCleared(id))return false;
  activeBattleId=id;
  emitProgress(EVENT_TYPES.BATTLE_STARTED, { id }, 'main.openEncounterBattle');
  openBattle(battle,{
    onWin:(metrics={})=>{
      emitProgress(EVENT_TYPES.BATTLE_FINISHED, {
        id, result:'win', attempts:Math.max(1,Number(metrics.attempts)||1), firstPass:Number(metrics.missedCounters??0)===0,
        turns:Number(metrics.turns)||0,damageTaken:Number(metrics.damageTaken)||0,perfectCounters:Number(metrics.perfectCounters)||0,
        torchSpent:Number(metrics.torchSpent)||0,toolsUsed:metrics.toolsUsed||{},source:metrics.source||null,
      }, 'main.openEncounterBattle');
      const unspentBefore=combatBuild().unspent;
      ENCOUNTERS.clearEncounter(id);
      const committed=saveCommit({encounters:ENCOUNTERS.saveEncounterState()});
      activeBattleId=null;
      onWin?.(metrics);
      if((committed.combatBuild?.unspent||0)>unspentBefore)openCombatCalibration();
    },
    onLose:(metrics={})=>{
      emitProgress(EVENT_TYPES.BATTLE_FINISHED, {
        id, result:'lose', attempts:Math.max(1,Number(metrics.attempts)||1), firstPass:false,
        turns:Number(metrics.turns)||0,damageTaken:Number(metrics.damageTaken)||0,perfectCounters:Number(metrics.perfectCounters)||0,
        torchSpent:Number(metrics.torchSpent)||0,toolsUsed:metrics.toolsUsed||{},source:metrics.source||null,
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

function openGodBattle(battle){
  godBattleOpen=true;
  return openBattle(battle,{
    onWin:()=>{ godBattleOpen=false; },
    onLose:()=>{ godBattleOpen=false; },
    onAbort:()=>{ godBattleOpen=false; },
  });
}

// The bench drill: a scripted training fight that runs once before the first
// real encounter. Any exit — win, lose, or walking away — marks it done; one
// pass through the drill is the requirement, not victory.
function openTrainingBattle({withDirector=true}={}){
  // Win or lose, the daydream completes setup and lands the waypoint. Losing is
  // no catastrophe — he blinks and it is the dock again, six seconds later, with a
  // good level and a slightly stupid feeling (see the battle's lose dialog).
  const done=()=>{ const first=!flagTest('combat.trained'); flagSet('combat.trained'); if(first) finishSetupRehearsal(); };
  // The count and the drift already happened on the dock, out loud, during the
  // take (beginDaydream). The battle's own authored intro picks it up from there,
  // so nothing is injected here any more.
  const battle=trainingCombatBattle();
  return openBattle(battle,{
    bench:true,
    director:withDirector?createCombatTutorialDirector():null,
    onWin:done, onLose:done, onAbort:done,
  });
}

function godAbortBattle(){
  let removed=false;
  while(String(scenes.top()?.id || '').startsWith('battle:')){
    scenes.pop();
    removed=true;
  }
  if(activeBattleId){
    activeBattleId=null;
    removed=true;
  }
  godBattleOpen=false;
  STORY.stopTapeHiss({fade:0.3});
  resetMotionInput('god-abort-battle', {stopRenderMove:true});
  if(removed) pushEvent('// god: battle aborted.');
  else pushEvent('// god: no active battle.');
  return removed;
}

// ── M5: the confrontation and its embodied ending routes ────────────────────
let finaleActive=false;
let escape=null;   // playable finale route: inversion, surfaced exit, or chapel commitment
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

function finaleHasFork(){
  return flagTest('has.fork') || flagTest(CHUNK_SURF_FLAGS.fork);
}
function finaleGrant(id){
  return flagTest(`finale.grant.${id}`);
}
function finaleLock(id){
  return flagTest(`finale.lock.${id}`);
}
function applyFinaleConsequences(metrics={}){
  const finale = metrics.finale || {};
  const flags = getSave().flags;
  const readings = Array.isArray(finale.readings) ? finale.readings : [];
  const grants = Array.isArray(finale.grants) ? finale.grants : [];
  const locks = Array.isArray(finale.locks) ? finale.locks : [];
  const routeBiases = Array.isArray(finale.routeBiases) ? finale.routeBiases : [];
  flags['finale.readings'] = readings;
  flags['finale.grants'] = grants;
  flags['finale.locks'] = locks;
  flags['finale.routeBiases'] = routeBiases;
  flags['finale.composure'] = Math.max(0, Number(finale.composure) || 0);
  flags['finale.pressure'] = Number(finale.pressure) || 0;
  flags['finale.sourceReading'] = finale.sourceReading || null;
  for (const r of readings) {
    if (r?.readingId) flags[`finale.reading.${r.readingId}`] = true;
    if (r?.routeBias) flags[`finale.bias.${r.routeBias}`] = true;
  }
  for (const id of grants) flags[`finale.grant.${id}`] = true;
  for (const id of locks) flags[`finale.lock.${id}`] = true;
  saveCommit({ flags });
}

// The fifth room. It wears whatever you confessed; it plays turn-based; and on
// the far side of survival it hands to the ending choice.
function beginConfrontation(){
  if(chapelTowerState().phase===CHAPEL_TOWER_PHASE.TOWER_CLEARED){
    const chapelTower=reduceChapelTower(chapelTowerState(),{type:'CHAPEL_FINALE_STARTED'});saveCommit({chapelTower});
  }
  finaleActive=true;
  if(ENCOUNTERS.encounterCleared('chapel')){openEndingChoice();return;}
  const kind=flagGet('confession.kind')||'nothing';
  const value=flagGet('confession.value')||null;
  const listened=Number(flagGet('listened.count'))||5;
  REC.addTake('lux_nova'); saveCommit({ rec:REC.saveRecState() });   // the chapel is done, however it ends
  openEncounterBattle('chapel',chapelBoss({ kind, value, listened }), {
    onWin: (metrics)=>{ applyFinaleConsequences(metrics); openEndingChoice(); },
    onLose: ()=> endSacrifice(),    // taken → you stay, which is the sacrifice
  });
}

// Which endings the chapel is willing to offer.
//
// Every route needs the physical thing it is performed with — the bent rig for
// both, the fork as well for the surfaced return — and then a QUALIFICATION,
// which is where this used to quietly collapse.
//
// The chapel fight grants `route.*` for whichever proof you landed and LOCKS the
// one you did not (see finishCombat: `locks` is the complement of `grants`). So a
// grant from anywhere else in the game was dead on arrival: the lock always
// followed it. The grey door earns its qualification honestly — a man who went
// looking for his exit on night one, and watched the building take it, has the
// same knowledge the inversion is built on — so it is a second way to qualify
// rather than a flag the chapel immediately overrules.
function canInvertEnding(){
  if(!flagTest('has.interface')) return false;
  const proven = finaleGrant('route.inversion') && !finaleLock('route.inversion');
  const learned = flagTest('door.grey.searched');
  return proven || learned;
}

function openEndingChoice(){
  const hasRig = flagTest('has.interface');
  const canInvert = canInvertEnding();
  const canSurface = flagTest(CHUNK_SURF_FLAGS.bestEligible)
    && hasRig
    && finaleHasFork()
    && finaleGrant('route.surfaced')
    && !finaleLock('route.surfaced');
  presentFinale(endingChoice({
    hasRig,
    canInvert,
    canSurface,
    readings: flagGet('finale.readings') || [],
    grants: flagGet('finale.grants') || [],
    locks: flagGet('finale.locks') || [],
    sourceReading: flagGet('finale.sourceReading') || null,
    composure: flagGet('finale.composure'),
    pressure: flagGet('finale.pressure'),
  }), {
    slate:'THE CHAPEL',
    onDone:()=>{
      const choice = flagGet('ending.choice');
      if(choice===CHUNK_SURF_ENDING_ID) endSurfaced();
      else if(choice==='inversion') beginInversion();
      else endSacrifice();
    },
  });
}

function endSurfaced(){
  const exitCell=FP.toRuntimePoint(MAIN_EXIT_CELL);
  escape={kind:'surfaced',stage:'exit',exitCell,deadlineMs:null};
  OBJ.setWaypoint(exitCell.x,exitCell.y,'main entrance');
  saveCommit({obj:OBJ.saveObjState()});
  applyLensPreset('explore');
  SPEECH.say({who:'recordist',text:'The tower is quiet. Do not let the chapel choose another cut. Walk me to the public door.'});
}

function completeSurfacedExit(){
  escape=null;OBJ.clearWaypoint();
  const drank=flagTest('drank.coffee');
  const beats=[...surfacedEnding({
    drankCoffee:drank,
    sourceReading: flagGet('finale.sourceReading') || null,
    readings: flagGet('finale.readings') || [],
  }),...dockEndingBeat({spent:flagTest('dock.haunting.spent'),variant:flagGet('dock.haunting.variant'),supernatural:true,drankCoffee:drank})];
  presentFinale(beats, {
    slate:'THE SERVICE ROAD',
    replayId:'surfaced-ending',
    onDone:()=> finishEnding(CHUNK_SURF_ENDING_ID),
  });
}

// Ending A — you stay. If you never drank, the seal (the demolition) closes and
// it was all real. If you drank, it was a real guard who tried to help and could
// not: the same staying, reframed by a paper cup.
function endSacrifice(){
  const screenCell=FP.toRuntimePoint(CHAPEL_SCREEN_AUTHORED);
  escape={kind:'stay',stage:'commit',screenCell,deadlineMs:null};
  OBJ.setWaypoint(screenCell.x,screenCell.y,'chapel screen');
  saveCommit({obj:OBJ.saveObjState()});
  applyLensPreset('battle');
  SPEECH.say({
    who:'direction',
    text:'The chapel waits for a final physical answer. Return to the inner screen and put your hand on it.',
  });
}

function completeSacrificeEnding(){
  escape=null;OBJ.clearWaypoint();
  const drank=flagTest('drank.coffee');
  const base = drank ? helpedEnding({ named:isNamed() })
                     : sacrificeEnding({ injuries:REC.recState().injuries, named:isNamed() });
  const beats=[...base,...dockEndingBeat({spent:flagTest('dock.haunting.spent'),variant:flagGet('dock.haunting.variant'),supernatural:!drank,drankCoffee:drank})];
  presentFinale(beats, { slate:'THE CHAPEL', onDone:()=> finishEnding(drank?'helped':'sacrifice') });
}

// Ending B — the inversion. The invert, then the playable run for a door that
// will not be where the door is, then a way out you did not open.
function beginInversion(){
  presentFinale(INVERT_START, { slate:'THE CHAPEL · REVERSED', onDone: startEscape });
}
function startEscape(){
  const door=FP.spawn();                                   // the grey door you came in through
  const resc=FP.toRuntimePoint(MAIN_EXIT_CELL);            // the public door the guard named
  const seconds=currentDifficulty().escape.seconds;
  escape={ kind:'inversion',stage:'door', doorCell:door, rescueCell:resc,
    deadlineMs:seconds==null?null:performance.now()+seconds*1000 };
  // A man who went and put his hand on his exit on night one knows where it is,
  // and gets a true bearing. A man who never looked has only the plan to go on,
  // and the plan is what has been lying to him all night — so his bearing is a
  // little to the left of the truth. The arrival radius still resolves it (see
  // tickFinale), so this is dread, not a dead end.
  const searched=flagGet('door.grey.searched');
  const drift=searched?0:2;
  OBJ.setWaypoint(door.x+drift, door.y, 'grey door');
  // And a man who said something out loud at that wall is quicker back to it.
  if(searched==='tried' && escape.deadlineMs!=null) escape.deadlineMs+=6000;
  applyLensPreset('rupture');
  // The inversion: the building stops holding its own shape, and the lens is
  // what says so.
  possess('rupture', 5);
  SPEECH.say({ who:'direction', text:'The floor is going. Get to the door you came in through.' });
}
// Called each frame from the world tick. Advances the escape as you reach each
// waypoint; running out of time takes Ending A by default.
function tickFinale(){
  if(!escape || scenes.blocksWorld()) return;
  if(escape.kind==='surfaced'){
    if(Math.hypot(px-escape.exitCell.x,py-escape.exitCell.y)<=2.4)completeSurfacedExit();
    return;
  }
  if(escape.kind==='stay')return;
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
    const base = drank ? druggedReveal({ takes:REC.recState().takes.length })
                       : [ ...rescueEnding(isNamed()), ...INVERSION_FINAL ];
    const beats=[...base,...dockEndingBeat({spent:flagTest('dock.haunting.spent'),variant:flagGet('dock.haunting.variant'),supernatural:!drank,drankCoffee:drank})];
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
    id===CHUNK_SURF_ENDING_ID ? 'surfaced' :
    id==='inversion' ? 'out' :
    (flagGet('confession.kind')==='nothing' ? 'nobody' : 'client');
  presentFinale(guardEpilogue(variant), {
    slate:'W. ELLERY HOLDINGS · GATE',
    replayId:`guard-epilogue:${id}`,
    onDone:()=>openEndingCredits(summary),
  });
}

const RECORDING_BATTLES={the_tub:natatoriumBattle,amplifications:hallBattle,soundnoisemusic:practiceBattle};
function battleForRoom(room,named){return RECORDING_BATTLES[room]?.(named)||null;}

// Take two is a signal-combat encounter in whichever public room the player
// chose. It is keyed to recording ordinal, not room or thought history.
function maybeBattle(){
  if(planName!=='conservatory') return;
  if(!REC.isRecording() || scenes.blocksInput()) return;
  const room=recordableRoomAt(px,py),factory=RECORDING_BATTLES[room];
  if(!factory||REC.recState().takes.length!==1)return;
  if(ENCOUNTERS.encounterCleared('recording-2'))return;
  if(REC.takeProgress() < 0.18) return;
  // The daydream happens on the dock during the level check, so combat is already
  // taught by the time real encounters begin. This guard only survives as a safety
  // net for a legacy save that reached the field untaught — it must never leave the
  // player facing signal combat cold.
  if(!flagTest('combat.trained')){ openTrainingBattle(); return; }
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
  if(usingStairAnomaly()){
    saveCommit({steps:stepCount,playSeconds:(getSave().playSeconds||0)+4,hushAudio:hushAudioRuntime?.save?.()||getSave().hushAudio||null});
    return;
  }
  const towerActive=chapelTowerState().phase===CHAPEL_TOWER_PHASE.TOWER_ACTIVE;
  const towerCheckpoint=towerActive?towerCheckpointFor():null;
  saveCommit({ px:towerCheckpoint?towerCheckpoint.x:px, py:towerCheckpoint?towerCheckpoint.y:py, steps:stepCount, area:usingSourceSpace()?'source-space':usingStairAnomaly()?'stair-anomaly':towerActive?'bell-tower':storyMode?'conservatory':getSave().area,
    ...(usingSourceSpace()?{chunkSurf:chunkSurfRuntime.state()}:{}),
    playSeconds:(getSave().playSeconds||0)+4, hushAudio:hushAudioRuntime?.save?.()||getSave().hushAudio||null });
}

// One question, two geometry providers: the authored conservatory in story
// mode, the procedural lattice in JUST SURF. Everything downstream (collision,
// spawn, the presence, mutation) asks this and never the shader.
function solidAt(x,y){
  if(RENDERER!=='3d') return false;
  if(usingSpecialSpace()) return activeGeometry().isSolid(x,y);
  if(natatoriumWaterBlocksAt(x,y)) return true;
  return usingPlan() ? FP.isSolid(x,y) : R3.r3dSolid(x,y);
}
function usingPlan(){ return storyMode && FP.isLoaded(); }
// Which room am I in? One question, asked of the authored building when there
// is one, and of the procedural field otherwise. Every consumer uses this.
function currentWorld(){ return usingSourceSpace()?'source_space':usingStairAnomaly()?'main_b3':usingPlan() ? FP.worldAt(px,py) : worldIdAt(px,py); }
function floorHere(){ return usingSpecialSpace()?activeGeometry().floorAt(px,py):usingPlan() ? FP.floorAt(px,py) : 0; }

// Which of the five rooms on the work order am I standing IN — the actual room
// zone, not the audio-world map. `worldAt` folds every corridor, the dock, the
// plant room and the stairs onto main_b3, which is right for sound and wrong
// for "can I record here": once B3 was done, standing in any corridor read as
// "already did that one". You can only roll a take inside one of the five, and
// only the room you are actually in.
const ZONE_RECORDING_ROOM={ [ZONE.studio]:'main_b3', [ZONE.natatorium]:'the_tub', [ZONE.hall]:'amplifications',
                  [ZONE.practice]:'soundnoisemusic', [ZONE.chapel]:'lux_nova' };
const ZONE_ACOUSTIC_ROOM={...ZONE_RECORDING_ROOM,[ZONE.chapelOuter]:'chapel_outer',[ZONE.bellTower]:'bell_tower'};
const ZONE_AREA={ [ZONE.dock]:'loading dock', [ZONE.foyer]:'front atrium', [ZONE.studio]:'studio B3',
  [ZONE.natatorium]:'the natatorium', [ZONE.hall]:'the concert hall', [ZONE.practice]:'the practice wing',
  [ZONE.chapel]:'chapel nave', [ZONE.chapelOuter]:'outer chapel', [ZONE.bellTower]:'bell tower', [ZONE.academic]:'academic gallery', [ZONE.plant]:'plant room', [ZONE.stair]:'building stair',
  // The dance wing reads as one area on purpose: the recordist has no work order
  // for these rooms and no name for them beyond what is stencilled on the door.
  [ZONE.danceStudio]:'the dance wing', [ZONE.store]:'the prop store' };
function recordableRoomAt(x,y){ return usingSpecialSpace()?null:usingPlan() ? (ZONE_RECORDING_ROOM[FP.zoneAt(x,y)] || null) : currentWorld(); }
function acousticRoomAt(x,y){return usingSourceSpace()?'source_space':usingStairAnomaly()?'stair_anomaly':usingPlan()?(ZONE_ACOUSTIC_ROOM[FP.zoneAt(x,y)]||FP.worldAt(x,y)):currentWorld();}
function currentAreaLabel(){
  if(usingSourceSpace())return'SOURCE FAULT / NO BUILDING PLAN';
  if(usingStairAnomaly())return currentStairAnomalyEnvironment().stairId==='upper'?'PRACTICE STAIR / CIRCUIT':'WEST STAIR / CIRCUIT';
  if(!usingPlan())return roomLabel(currentWorld());
  const physical=FP.logicalToPhysical(px,py);
  if(physical.renderGroup==='tower'){
    if(physical.spaceId==='ringing_room')return'RINGING ROOM';
    if(physical.spaceId==='bell_chamber')return'BELL CHAMBER';
    if(physical.spaceId==='organ_loft')return'ORGAN LOFT';
    if(physical.spaceId==='stair_turret')return'STAIR TURRET';
  }
  return ZONE_AREA[FP.zoneAt(px,py)]||physical.spaceId||'circulation';
}


function acousticFloorIdAt(x,y){
  if(!usingPlan()||usingSpecialSpace()) return null;
  const physical=FP.logicalToPhysical(x,y);
  return BUILDING_MAP.floors.find((floor)=>physical.y>=floor.minHeight&&physical.y<floor.maxHeight)?.id||null;
}

function acousticSpatialAt(x=px,y=py){
  return {
    areaId:usingSourceSpace()?'source-space':usingStairAnomaly()?'stair-anomaly':storyMode?'conservatory':currentWorld(),
    roomId:acousticRoomAt(x,y),
    floorId:acousticFloorIdAt(x,y),
    position:{x,y},
  };
}

function acousticOcclusionDb(source,listener){
  if(!usingPlan()||!source?.position||!listener?.position) return 0;
  if(usingStairAnomaly())return 0;
  if(source.floorId&&listener.floorId&&source.floorId!==listener.floorId) return 15;
  const a=source.position,b=listener.position;
  const distance=Math.hypot(b.x-a.x,b.y-a.y);
  const steps=Math.max(2,Math.min(40,Math.ceil(distance/1.5)));
  let blocked=0;
  for(let i=1;i<steps;i++){
    const t=i/steps;
    const x=Math.round(a.x+(b.x-a.x)*t),y=Math.round(a.y+(b.y-a.y)*t);
    if(solidAt(x,y)) blocked++;
  }
  const roomPenalty=source.roomId&&listener.roomId&&source.roomId!==listener.roomId?4:0;
  const doorLoss=FP.doorAcousticLossBetween(a,b);
  return Math.min(36,roomPenalty+blocked*2.8+doorLoss);
}

function currentElectricalHumFrame(){
  if(!storyMode||!usingPlan()||usingSpecialSpace())return{audible:false,gain:0,pan:0,circuits:[],primary:null,sources:[]};
  const physical=FP.logicalToPhysical(px,py);
  const listener={x:physical.x*CELL,z:physical.z*CELL};
  return electricalHumAt(getSave().power,listener,{
    occlusionDb:(_listener,source)=>{
      const point=FP.toRuntimePoint({x:source.x,y:source.z});
      return acousticOcclusionDb(acousticSpatialAt(point.x,point.y),acousticSpatialAt(px,py));
    },
  });
}

function updateElectricalHum(){
  electricalHumFrame=currentElectricalHumFrame();
  electricalHumRuntime?.update?.(electricalHumFrame);
  return electricalHumFrame;
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
  const room=usingPlan()?acousticRoomAt(base.x,base.y):currentWorld();
  return {...base,roomId:room,floorId:acousticFloorIdAt(base.x,base.y)};
}

let lastHushFieldStage='none';
function initHushAudioRuntime(){
  hushAudioRuntime?.destroy?.();
  REC.setAcousticEmitter(emitRecordistAcoustic);
  roomMicAcousticAt=0;
  hushFieldFrame=inactiveHushField();
  lastHushFieldStage='none';
  hushAudioRuntime=createHushAudioRuntime({
    presence:{
      publicSnapshot:hushPresenceSnapshot,
      offerSoundTarget:(offer)=>PRES.offerSoundTarget(offer),
      setDirectorIntent:(intent)=>PRES.setDirectorIntent(intent),
    },
    playerSpatial:()=>({...acousticSpatialAt(px,py)}),
    occlusionDb:acousticOcclusionDb,
    maskingDb:()=>bellTowerRuntime?.isRinging?.()?bellTowerRuntime.maskingDb():0,
    difficulty:()=>activeDifficulty,
    settings:()=>getSave().settings||{},
    context:()=>({
      allowMischief:storyMode&&chapelTowerState().phase!==CHAPEL_TOWER_PHASE.TOWER_ACTIVE&&!scenes.blocksInput()&&!REC.isRecording()&&!finaleActive&&!activeBattleId,
      recording:REC.isRecording(),
      blocked:scenes.blocksInput(),
      finale:finaleActive,
      battle:!!activeBattleId,
      // The field case monitor is continuously live unless the recorder itself
      // has been lost. LISTEN raises the program feed, not the HUSH's hearing.
      monitorOpen:!itemLost('recorder'),
    }),
    effects:hushAudioMix,
    onField:({field})=>{
      hushFieldFrame=field||inactiveHushField();
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
  hushFieldFrame=inactiveHushField();
  lastHushFieldStage='none';
  hushAudioMix?.reset?.();
}

function tickHushAudio(dt){
  if(!storyMode||!hushAudioRuntime){hushFieldFrame=inactiveHushField();return;}
  hushAudioRuntime.tick(dt);
}

function mapProjectLogical(point,{authored=true}={}){
  const q=authored?FP.toRuntimePoint(point):point;
  const p=FP.logicalToPhysical(q.x,q.y);
  return{x:p.x,z:p.z,height:p.y,layer:p.layer,renderGroup:p.renderGroup,roomId:ZONE_RECORDING_ROOM[FP.zoneAt(q.x,q.y)]||null};
}

function currentFacilityMapSource(){
  if(usingSpecialSpace()||!usingPlan()||planName!=='conservatory')return null;
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
  const hush=currentMapHushMarker();
  const pressure=PRES.pressure(px,py);
  const sensoryField=hushAudioRuntime?.currentField?.();
  const sensoryAudition=hushAudioRuntime?.currentAudition?.();
  return HUSH_MAP_TELEMETRY.sample({
    hush:{
      active:true,
      position:hush.position,
      floorId:hush.floorId,
      roomId:ZONE_RECORDING_ROOM[FP.zoneAt(pst.x,pst.y)]||null,
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

function currentMapHushMarker(){
  if(!PRES.isActive()) return null;
  const pst=PRES.presenceState();
  const physical=FP.logicalToPhysical(pst.x,pst.y);
  const floor=BUILDING_MAP.floors.find((candidate)=>physical.y>=candidate.minHeight&&physical.y<candidate.maxHeight);
  return{
    active:true,
    position:{x:physical.x,y:physical.z},
    floorId:floor?.id||null,
    visible:hushManifestationVisibleToPlayer(pst),
    perception:hushNoiseMapConfirmation(hushNoisePerception,performance.now()),
  };
}

function hushManifestationVisibleToPlayer(pst=PRES.presenceState()){
  if(!PRES.isActive()||!pst||usingSpecialSpace()||scenes.worldView()?.suppressActors)return false;
  const dx=pst.x-px,dy=pst.y-py;
  const distance=Math.hypot(dx,dy);
  if(distance<0.001||distance>D(26))return false;
  const heading=mapHeading();
  const facingX=Math.sin(heading),facingY=-Math.cos(heading);
  if((dx*facingX+dy*facingY)/distance<Math.cos(Math.PI*.34))return false;
  const samples=Math.max(2,Math.ceil(distance/D(.35)));
  for(let index=2;index<samples-1;index++){
    const t=index/samples;
    if(solidAt(px+dx*t,py+dy*t))return false;
  }
  return true;
}

// Where he is looking, continuously. `r3dFacing()` is a quarter-turn index, so a
// cone built from it could only ever point at four compass points; the look yaw is
// the actual direction of the eye.
function mapHeading(){
  if(RENDERER!=='3d') return 0;
  const angles=R3.r3dLookAngles?.();
  return Number.isFinite(angles?.yaw) ? angles.yaw : R3.r3dFacing()*Math.PI/2;
}

function currentFacilityMapModel(){
  if(usingSourceSpace()){
    const model=buildMapModel({source:null,job:bagJob(),navigation:activeDifficulty.navigation});
    return{...model,title:'SOURCE FAULT',subtitle:'NO BUILDING PLAN',fault:'SOURCE FAULT / NO BUILDING PLAN'};
  }
  if(usingStairAnomaly()){
    const model=buildMapModel({source:null,job:bagJob(),navigation:activeDifficulty.navigation});
    return{...model,title:'STAIR CIRCUIT',subtitle:'NO STABLE FLOOR',fault:'STAIR CIRCUIT / ADDRESS REPEATING'};
  }
  const source=currentFacilityMapSource();
  if(!source)return buildMapModel({source:null,job:bagJob(),navigation:activeDifficulty.navigation});
  const physical=FP.logicalToPhysical(px,py);
  const contact=currentMapContact(source);
  const rawHush=currentMapHushMarker();
  const doors=captureDoorMapState({
    doors:FP.doorState(),source,projectLogical:mapProjectLogical,
    hasKey:(keyId)=>playerKeys.has(keyId),
  });
  const job=bagJob();
  const objective=OBJ.objState();
  const doorKey=doors.map((door)=>`${door.id}:${door.state}`).join('|');
  const contactKey=`${contact.state}:${contact.observation?.observedAt||0}:${contact.observation?.floorId||''}`;
  const hushKey=rawHush?`${rawHush.floorId||''}:${Math.round(rawHush.position.x*2)}:${Math.round(rawHush.position.y*2)}:${rawHush.perception?.mode||'none'}:${rawHush.visible?1:0}`:'none';
  const tower=chapelTowerState(),towerKey=`${tower.phase}:${tower.ropeRoomVisited?1:0}:${tower.hatchInspected?1:0}`;
  const discoveredFloorIds=flagGet('academic.entered')?new Set(['academic']):new Set();
  const discoveryKey=discoveredFloorIds.has('academic')?'academic':'base';
  const areaLabel=currentAreaLabel();
  // The heading is PART OF THE KEY. It was not, so turning on the spot never
  // invalidated the cache and the map kept drawing last frame's facing — which is
  // why the old facing tick appeared frozen and why the sight cone would not turn.
  // Quantised to ~6° so an idle mouse does not rebuild the model every frame.
  const headingKey=Math.round(mapHeading()/(Math.PI/30));
  const key=[Math.round(physical.x/2),Math.round(physical.z/2),Math.round(physical.y*4),headingKey,recordableRoomAt(px,py)||'',areaLabel,objective.target||'',job.rooms.map((room)=>room.recorded?'1':'0').join(''),doorKey,activeDifficulty.navigation.id||'',contactKey,hushKey,towerKey,discoveryKey].join('~');
  if(facilityMapCache.key===key&&facilityMapCache.model)return facilityMapCache.model;
  const model=buildMapModel({
    source,job,objectiveState:objective,doors,contacts:[contact],navigation:activeDifficulty.navigation,discoveredFloorIds,
    landmarkState:{
      'landmark:ringing-room':{visible:tower.ropeRoomVisited},
      'landmark:bell-chamber':{visible:tower.hatchInspected||[CHAPEL_TOWER_PHASE.TOWER_ACTIVE,CHAPEL_TOWER_PHASE.TOWER_CLEARED,CHAPEL_TOWER_PHASE.CHAPEL_FINAL].includes(tower.phase),label:tower.phase===CHAPEL_TOWER_PHASE.FORESHADOW||tower.phase===CHAPEL_TOWER_PHASE.SOURCE_READY?'ACCESS RESTRICTED':'BELL CHAMBER'},
      'landmark:organ-loft':{visible:[CHAPEL_TOWER_PHASE.TOWER_CLEARED,CHAPEL_TOWER_PHASE.CHAPEL_FINAL].includes(tower.phase)},
    },
    player:{x:physical.x,y:physical.z,height:physical.y,renderGroup:physical.renderGroup,roomId:recordableRoomAt(px,py),areaLabel,heading:mapHeading()},
  });
  const stride=source.topologyStride||1;
  const hush=rawHush?{
    ...rawHush,
    position:{x:rawHush.position.x/stride,y:rawHush.position.y/stride},
  }:null;
  const liveModel={...model,hush};
  facilityMapCache={key,model:liveModel};
  return liveModel;
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
  const build=params().get('build') || 'LOCAL';
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
  syncControllerSettingsFromSave();
  pushEvent('// profile imported. current run unchanged.');
  syncPlatform().catch(()=>{});
  return true;
}

function syncControllerSettingsFromSave(){
  const st=getSave().settings||{};
  const controller=BINDINGS.setControllerSettings(st.controller || {}, st.controllerBindings);
  CONTROLLER.setControllerSettings(controller);
  return controller;
}

function rendererLabel(){
  if(RENDERER==='3d') return '3D';
  if(RENDERER==='dom') return 'DOM';
  return '2D';
}

function collectAboutSnapshot(){
  const root=document.documentElement;
  const story=STORY.audioState?.() || {};
  const storage=currentStorage();
  return normalizeAboutSnapshot({
    version:APP_VERSION,
    build:params().get('build') || import.meta.env?.MODE || 'LOCAL',
    copyright:APP_COPYRIGHT,
    runtime:{
      mode:IS_TAURI?'desktop':'web',
      platform:currentPlatform().kind || (IS_TAURI?'desktop':'browser'),
      renderer:rendererLabel(),
      lens:!!window.__diffusion && !lensDisabled,
    },
    performance:perfMeter.snapshot(),
    display:{
      width:window.innerWidth,
      height:window.innerHeight,
      dpr:window.devicePixelRatio || 1,
      stageScale:root.dataset.stageScale || getComputedStyle(root).getPropertyValue('--stage-scale') || '1',
      uiScale:getComputedStyle(root).getPropertyValue('--ui-scale') || '1',
      renderScale:root.dataset.renderScale || root.style.getPropertyValue('--render-scale') || 'auto',
    },
    audio:{
      state:actx?.state || story.ctx || 'none',
      sampleRate:actx?.sampleRate || null,
    },
    storage:{
      backend:storage?.kind || (IS_TAURI?'desktop':'browser'),
      healthy:true,
    },
  });
}

async function copyDiagnosticReport(){
  let diagnostics=null;
  try{ diagnostics=await exportDiagnosticsForSupport(); }
  catch(err){ console.warn('[about] diagnostics failed',err); }
  const report=formatDiagnosticReport(collectAboutSnapshot(),{recent:diagnostics?.recent || []});
  const ok=await copyText(report).catch(()=>false);
  pushEvent(ok ? '// diagnostic report copied.' : '// diagnostic report could not access clipboard.');
  return ok;
}

function betaReportTemplate(){
  const about=collectAboutSnapshot();
  const runtime=about.runtime || {};
  const display=about.display || {};
  const audio=about.audio || {};

  return [
    'Chunk Surfer beta report',
    '',
    `Version: ${about.version}`,
    `Build: ${about.build}`,
    `Runtime: ${runtime.mode} / ${runtime.platform}`,
    `Renderer: ${runtime.renderer}`,
    `Lens: ${runtime.lens === true ? 'on' : runtime.lens === false ? 'off' : 'unknown'}`,
    `Display: ${display.width}x${display.height} @ DPR ${display.dpr}`,
    `Audio: ${audio.state}${audio.sampleRate ? ` / ${audio.sampleRate} Hz` : ''}`,
    '',
    'What happened:',
    '',
    'Where it happened:',
    '',
    'What I expected:',
    '',
    'Can I reproduce it?',
    '',
    'Did restarting help?',
    '',
    'Screenshot / clip / save notes:',
    '',
  ].join('\n');
}

async function copyBetaReportTemplate(){
  const ok=await copyText(betaReportTemplate()).catch(()=>false);
  pushEvent(ok ? '// beta report template copied.' : '// beta report template could not access clipboard.');
  return ok;
}

function openBetaNotice(){
  ensureCtx();
  scenes.push(makeBetaNoticeScene({
    buildInfo:collectAboutSnapshot,
    onCopyReportTemplate:copyBetaReportTemplate,
    onCopyDiagnostics:copyDiagnosticReport,
    onOpenReport:()=>openExternalUrl(APP_LINKS.reportProblem),
  }));
}

async function exportSaveBackup(){
  let data=null;
  try{ data=await exportAllData(); }
  catch(err){ console.warn('[about] save backup failed',err); }
  if(!data){ pushEvent('// save backup unavailable.'); return false; }
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const ok=downloadJsonFile(data,`chunk-surfer-save-backup-${stamp}.json`);
  pushEvent(ok ? '// save backup exported.' : '// save backup unavailable.');
  return ok;
}

function resetInputBindings(){
  const controller=BINDINGS.resetControllerSettings();
  const st=getSave().settings||{};
  saveCommit({settings:{...st,controller}});
  CONTROLLER.setControllerSettings(controller);
  CONTROLLER.cancelControllerRemap?.();
  pushEvent('// controller settings reset.');
  return controller;
}

function saveControllerSettings(controller){
  const next=BINDINGS.setControllerSettings(controller);
  const st=getSave().settings||{};
  saveCommit({settings:{...st,controller:next}});
  CONTROLLER.setControllerSettings(next);
  return next;
}

function openControllerSettings(){
  ensureCtx();
  scenes.push(makeControllerSettingsScene({
    onSave:saveControllerSettings,
    getPadName:CONTROLLER.controllerName,
    getControllerSnapshot:CONTROLLER.controllerSnapshot,
    beginControllerRemap:CONTROLLER.beginControllerRemap,
    cancelControllerRemap:CONTROLLER.cancelControllerRemap,
    controllerRemapAction:CONTROLLER.controllerRemapAction,
  }));
}

function openSettings({ inGame=false, initialTab=null }={}){
  ensureCtx();
  MIC.micRefreshDevices?.();
  scenes.push(makeSettingsScene({
    inGame,
    initialTab,
    hooks: {
      setGlobalVolume,
      setDialogVolume,
      setSfxVolume,
      setMusicVolume,
      setMonitorVolume,
      onBackgroundAudioChange: ()=>{ void recoverInteractionAudio('background-audio-setting'); },
      micStatus: ()=>MIC.micState(),
      micSnapshot: ()=>MIC.micSnapshot(),
      enableMic: ()=>startRoomMic({ force:true }),
      refreshMicDevices: ()=>MIC.micRefreshDevices(),
      onMicInputChange: (input)=>{
        if(!MIC.micActive()) return;
        MIC.micStop();
        startRoomMic({ force:true, ...input });
      },
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
      cancelControllerRemap: CONTROLLER.cancelControllerRemap,
      resetControllerBindings: resetInputBindings,
      resetInputBindings,
      openControllerSettings,
      onControllerSettingsChange: saveControllerSettings,
      exportProfile: exportProgressionProfile,
      importProfile: importProgressionProfile,
      currentArea: () => storyMode && inRogue ? roomLabel(currentWorld()) : (getSave().area || 'prologue'),
      version: () => APP_VERSION,
      build: () => params().get('build') || import.meta.env?.MODE || 'LOCAL',
      copyright: () => APP_COPYRIGHT,
      runtimeLabel: () => IS_TAURI ? 'Desktop' : 'Web',
      rendererLabel,
      performanceSnapshot: () => perfMeter.snapshot(),
      openWebsite: () => openExternalUrl(APP_LINKS.website),
      reportProblem: () => openExternalUrl(APP_LINKS.reportProblem),
      // Accepted once at boot, readable forever after. A licence you cannot
      // re-read is a licence you were shown, not one you were given.
      openLicence: () => scenes.push(makeEulaScene({ reviewOnly: true })),
      licenceVersion: () => eulaVersion(EULA_TEXT),
      copyDiagnosticReport,
      exportSaveBackup,
      restartAudioEngine: restartDesktopAudio,
      openCredits,
      resetDisplaySettings: resetDisplaySettingsFromMenu,
      onDisplayChange: updateDisplaySettings,
      onPersonalInterferenceChange: () => personalInterference.clearIdentity(),
    },
  }));
}


function currentDisplaySettings(){
  return normalizeDisplaySettings(getSave().settings?.display || {});
}

function currentPixelMeshSettings(){
  const qp=params();
  const st=getSave().settings||{};
  const display=st.display||{};
  return {
    cellSize:'auto',
    debugSource:qp.get('pixelMeshSource') || (qp.has('pixelMeshDebug') ? 'signal' : 'final'),
    reduceFlash:(st.flash||'full')!=='full',
    reduceMotion:(st.shake||'full')!=='full',
  };
}

function applyPixelMeshSettings(extra={}){
  if(RENDERER!=='3d') return null;
  const applied=R3.r3dSetPixelMesh?.({...currentPixelMeshSettings(),...extra}) || null;
  if(params().has('pixelMeshDebug')){
    console.info('[pixel-mesh] settings', applied, R3.r3dPixelMeshStatus?.());
  }
  return applied;
}

function pulsePixelMesh(ms=1800){
  if(RENDERER!=='3d'){
    pushEvent('// vfd pixel mesh is only active in 3D renderer.');
    return null;
  }
  const status=R3.r3dPulsePixelMesh?.(ms) || applyPixelMeshSettings({forceSignalMs:ms});
  pushEvent('// vfd pixel mesh test pulse.');
  return status;
}

function applyRenderScale(renderScale){
  const effective=resolveRenderScale(renderScale,{devicePixelRatio:window.devicePixelRatio||1});
  document.documentElement.dataset.renderScale=String(renderScale);
  document.documentElement.style.setProperty('--effective-render-scale',String(effective));
  R3.r3dSetRenderScale?.(effective);
  window.dispatchEvent(new CustomEvent('chunk-surfer:render-scale',{detail:{renderScale,effective}}));
}

function refreshStageLayout(){
  applyCurrentStageLayout({allowUpscale:true});
}

function refreshStageLayoutSoon(){
  refreshStageLayout();
  requestAnimationFrame(()=>{
    refreshStageLayout();
    setTimeout(refreshStageLayout, 80);
    setTimeout(refreshStageLayout, 240);
  });
}

async function updateDisplaySettings(patch={}, nextMaybe=null){
  const st=getSave().settings||{};
  const current=normalizeDisplaySettings(st.display||{});
  const next=normalizeDisplaySettings(nextMaybe || {...current,...patch});
  saveCommit({settings:{...st,display:next}});
  applyDisplayCssVars(next);
  uiSetScale(next.uiScale);
  applyRenderScale(next.renderScale);
  applyPixelMeshSettings();
  refreshStageLayoutSoon();

  try{
    if(Object.prototype.hasOwnProperty.call(patch,'displayMode')){
      await setNativeGameMode(next.displayMode==='game-mode');
      if(next.displayMode==='windowed') await setNativeWindowPreset(next.windowPreset);
    }else if(Object.prototype.hasOwnProperty.call(patch,'windowPreset')){
      await setNativeWindowPreset(next.windowPreset);
    }
  }catch(err){
    console.warn('[display] native display change failed',err);
  }
  return next;
}

async function resetWindowFromMenu(){
  desktopGameMode={enabled:false,previousWindowPreset:'1280x800',enteredAt:null};
  applyGameModeDom(false,document);
  document.body.classList.remove('desktop-fullscreen');
  if(!IS_TAURI) exitFullscreenSafe();
  try{ await resetNativeWindow(); }catch(err){ console.warn('[display] reset window failed',err); }
  await updateDisplaySettings({displayMode:'windowed',windowPreset:'1280x800'});
  refreshStageLayoutSoon();
  ensureInteractionFocus();
  pushEvent('// window profile reset: adaptive 1280×800.');
}

async function resetDisplaySettingsFromMenu(){
  desktopGameMode={enabled:false,previousWindowPreset:'1280x800',enteredAt:null};
  applyGameModeDom(false,document);
  document.body.classList.remove('desktop-fullscreen','desktop-high-contrast');
  if(!IS_TAURI) exitFullscreenSafe();
  await updateDisplaySettings({displayMode:'windowed',windowPreset:'1280x800',uiScale:1,renderScale:'auto'});
  applyPixelMeshSettings();
  try{ await resetNativeWindow(); }catch(err){ console.warn('[display] reset defaults failed',err); }
  refreshStageLayoutSoon();
  ensureInteractionFocus();
  pushEvent('// display settings reset.');
}

function openSettingsFromPause(initialTab='display'){
  openSettings({inGame:false,initialTab});
}

const GOD_LEVELS=[null,0,0.25,0.5,0.75,1];
const GOD_LEVEL_LABEL=new Map([[null,'AUTO'],[0,'OFF'],[0.25,'LOW'],[0.5,'MED'],[0.75,'HIGH'],[1,'MAX']]);
const GOD_LOOK_DEBUG=['final','world','signal','memory','edge','mask','threshold','recorded','instability'];
let godLookDebug='final';

function godLevelLabel(value){
  return GOD_LEVEL_LABEL.get(value) || `${Math.round((Number(value)||0)*100)}%`;
}

function godCycleLevel(key,delta){
  const current=godFxOverride[key];
  const at=Math.max(0,GOD_LEVELS.findIndex((value)=>Object.is(value,current)));
  const next=GOD_LEVELS[(at+delta+GOD_LEVELS.length)%GOD_LEVELS.length];
  godFxOverride[key]=next;
  ensureCtx();
  if(key==='heartbeat'){
    FEAR.startHeartbeat();
    FEAR.setFear(next==null ? currentFearPressure().heartbeat : next);
  }
  if(key==='visualDread') R3.r3dSetFear(next==null ? currentFearPressure().visualDread : next);
  if(key==='monitorHiss'){
    if(next==null || next<=0){
      if(!REC.isRecording()) STORY.stopTapeHiss({fade:0.12});
    }else{
      STORY.startTapeHiss({gain:0.08+next*0.42,fade:0.08});
      STORY.setTapeHissPressure(next,{min:0.08,max:0.5,ramp:0.08});
    }
  }
  return next;
}

function godCycleHushBody(delta=1){
  const modes=R3.HUSH_BODY_MODES||['live','core','glow','off'];
  const current=R3.r3dHushBodyStatus?.().mode||'live';
  const at=Math.max(0,modes.indexOf(current));
  return R3.r3dSetHushBodyMode?.(modes[(at+delta+modes.length)%modes.length])||current;
}

function godResetFx(){
  godFxOverride.heartbeat=null;
  godFxOverride.monitorHiss=null;
  godFxOverride.visualDread=null;
  if(!REC.isRecording()) STORY.stopTapeHiss({fade:0.12});
  FEAR.setFear(storyMode ? currentFearPressure().heartbeat : 0);
  R3.r3dSetFear(storyMode ? currentFearPressure().visualDread : 0);
  R3.r3dSetHushBodyMode?.('live');
}

function godClearSpecialWorlds(){
  clearStairEnvironmentalTimers();
  if(stairAttentionScene){scenes.remove(stairAttentionScene);stairAttentionScene=null;}
  stairAnomalyRuntime=null;
  stairPresenceSnapshot=null;
  R3.r3dSetLocalLights?.([]);
  chunkSurfRuntime=null;
  sourceTowerTransition=null;
  sourceExitSnapshot=null;
  sourcePresenceWasActive=false;
  PRES.despawn();
  stopBellTowerRuntime();
  bellTowerImpactActive=false;
  bellTowerCollisionEnabled=true;
  R3.r3dSetSourceScene({key:'source:god-clear',corpus:[],staticInstances:[],dynamicInstances:[],look:{sunrise:0,chroma:1,paper:0}});
  R3.r3dSetSourceSurface([]);
}

function godRestoreBuildingWorld(){
  const sourceState=chunkSurfRuntime?.state?.()||normalizeChunkSurfState(getSave().chunkSurf);
  const wasInSource=usingSourceSpace();
  const wasInStair=usingStairAnomaly();
  const stairState=stairAnomalyRuntime?.state?.()||currentStairAnomalyLedger();
  const wasInSpecialWorld=wasInSource||wasInStair||!!sourceTowerTransition||!!bellTowerRuntime;
  if(!wasInSpecialWorld)return false;
  godClearSpecialWorlds();
  if(wasInSource){
    // A facility warp is an explicit exit from the Source diagnostic. Keep the
    // reached-state data for inspection, but never resume Source coordinates
    // over the building on the next frame or after a restart.
    saveCommit({chunkSurf:{...sourceState,active:false},area:'conservatory'});
  }
  if(wasInStair){
    const completed=reduceStairAnomaly(stairState,{type:'COMPLETE'});
    saveCommit({run:runWithStairAnomalyLedger(completed),area:'conservatory'});
  }
  godLookDebug='final';
  applyPixelMeshSettings({debugSource:'final'});
  applyLookProfile('explore',{transitionMs:0,resetMemory:true});
  return true;
}

function godSyncBuildingRender(){
  if(!FP.isLoaded()||usingSpecialSpace())return false;
  const plan=FP.physicalRenderPlanFor(px,py);
  R3.r3dSetPlan(plan.rgba,plan.w,plan.h,plan.material);
  r3dCache.physicalGroup=plan.group;r3dCache.physicalKey=plan.key;r3dCache.fogSize=-1;
  R3.r3dSetProps(worldRenderInstances(plan.group));
  R3.r3dSetSourceScene({key:'source:building',corpus:[],staticInstances:[],dynamicInstances:[],look:{sunrise:0,chroma:1,paper:0}});
  revealAround(px,py);
  return true;
}

function godEnsureTestRun(){
  while(scenes.depth()) scenes.pop();
  godRestoreBuildingWorld();
  activeBattleId=null;
  godBattleOpen=false;
  STORY.stopTapeHiss({fade:0.2});
  resetMotionInput('god-test-run', {stopRenderMove:true});
  setGameplayPaused(false,{announce:false});
  if(!getSave().run){
    newGame({preset:'contract'});
    beginRunProgression();
  }
  flagApply(['prologueDone']);
  saveCommit({flags:getSave().flags});
  if(!storyMode) enterStory();
  else {
    sampleFieldEnabled=false;
    silenceSampleField();
    setGameChrome(true);
  }
  if(FP.isLoaded()&&FP.isSolid(px,py)){
    const spawn=FP.spawn();px=spawn.x;py=spawn.y;trail=[];renderMove=null;motionRig=null;
    R3.r3dSetFacing(0);saveCommit({px,py,area:'conservatory'});
  }
  godSyncBuildingRender();
}

function godFindZonePoint(zone){
  if(!FP.isLoaded()) return null;
  const plan=FP.floorplan();
  const candidates=[];
  for(let y=0;y<plan.h;y++){
    for(let x=0;x<plan.w;x++){
      const point=FP.toRuntimePoint({x,y});
      if(FP.zoneAt(point.x,point.y)!==zone || FP.isSolid(point.x,point.y)) continue;
      const score=Math.hypot(x-plan.w/2,y-plan.h/2);
      candidates.push({x:point.x,y:point.y,score});
    }
  }
  candidates.sort((a,b)=>a.score-b.score);
  return candidates[0] || null;
}

function godWarpToZone(zone){
  godRestoreBuildingWorld();
  const point=godFindZonePoint(zone);
  if(!point){ pushEvent('// god: area is not loaded yet.'); return false; }
  px=point.x;py=point.y;trail=[];
  revealAround(px,py);faceOpenDirection();
  renderMove=null;motionRig=null;
  godSyncBuildingRender();
  saveCommit({px,py,area:'conservatory'});
  pushEvent(`// god warp: ${currentAreaLabel()}.`);
  return true;
}

function godSetFlag(id,on){
  flagApply(on?[id]:[],on?[]:[id]);
  saveCommit({flags:getSave().flags});
  return !!on;
}

function godSetChapelKey(on){
  const items=new Set(getSave().items||[]);
  if(on){items.add('chapel_key');playerKeys.add('chapel');flagApply(['chapel.keyTaken']);}
  else {items.delete('chapel_key');playerKeys.delete('chapel');flagApply([],['chapel.keyTaken']);}
  saveCommit({items:[...items],flags:getSave().flags});
}

function godSetLostItem(id,on){
  for(const candidate of LOSABLE) flagApply([], [`lost.${candidate}`]);
  if(on){
    lostItem=id;
    lostAt={x:px+1,y:py};
    flagApply([`lost.${id}`]);
  }else if(lostItem===id){
    lostItem=null;lostAt=null;
  }
  saveCommit({flags:getSave().flags});
}

function godCycleBattery(delta){
  const levels=[0,0.25,0.5,1,1.5,2];
  const current=REC.batteryLevel();
  let at=levels.findIndex((value)=>Math.abs(value-current)<0.01);
  if(at<0) at=levels.reduce((best,value,index)=>Math.abs(value-current)<Math.abs(levels[best]-current)?index:best,0);
  const next=levels[(at+delta+levels.length)%levels.length];
  REC.addBattery(next-current);
  saveCommit({rec:REC.saveRecState()});
}

function godSetAllTakes(on){
  for(const id of TARGETS) REC.setTake(id,on);
  saveCommit({rec:REC.saveRecState()});
}

function godColdOpen(){
  scenes.push(makeColdOpenScene({
    id:'god-cold-open',beats:COLD_OPEN,opening:COLD_OPEN_DIALOGUE,
    audio:STORY,getAudio:()=>actx?{ctx:actx,destination:dialogGain||master||actx.destination}:null,
    cue:fireCue,fx:CR.fx,replay:createReplayService('god-cold-open'),onChoice:applyStoryChoice,
  }));
}

function godPostDoorRuntime(){
  godEnsureTestRun();
  think('post-door', POST_DOOR, {
    force:true,
    startAt: prologueKnowledgeFrame() || 'self',
    onDone:()=>{ saveCommit({ flags:getSave().flags }); TUT.startTutorial(); },
  });
  pushEvent('// god: post-door 3D runtime.');
}

function godEnterSourcePreset(preset){
  godEnsureTestRun();
  const returnPoint={x:CHAPEL_OUTER_CHECKPOINT.x,y:CHAPEL_OUTER_CHECKPOINT.y,facing:CHAPEL_OUTER_CHECKPOINT.facing};
  const built=buildChunkSurfGodPreset(preset,{
    drankCoffee:flagTest('drank.coffee'),
    hasRig:flagTest('has.interface'),
    seed:normalizeChunkSurfState(getSave().chunkSurf).seed||4417,
    returnPoint,
  });
  activateSourceSpace(built.state,{position:built.position});
  saveCommit({chunkSurf:built.state,px:built.position.x,py:built.position.y,area:'source-space'});
  if(!REC.lightOn())REC.toggleLight();
  pushEvent(`// god: source-space ${preset}.`);
}

function godEnterTowerPreset(preset){
  godEnsureTestRun();
  let phase=CHAPEL_TOWER_PHASE.FORESHADOW;
  let point={...CHAPEL_OUTER_CHECKPOINT};
  let live=false,offsetMs=0;
  const route=(id)=>{const anchor=TOWER_ROUTE_ANCHORS[id];return{...FP.toRuntimePoint(anchor),facing:anchor.facing??0};};
  if(preset==='lower-stair')point=route('lowerStair');
  else if(preset==='lower-turn')point=route('lowerTurn');
  else if(preset==='ringing-room')point=route('ringingEntry');
  else if(preset==='tower-arrival'){phase=CHAPEL_TOWER_PHASE.TOWER_ACTIVE;point={...TOWER_ENTRY};live=true;}
  else if(preset==='belfry-door'){phase=CHAPEL_TOWER_PHASE.TOWER_ACTIVE;point=route('belfryDoor');live=true;}
  else if(preset==='upper-turn'){phase=CHAPEL_TOWER_PHASE.TOWER_ACTIVE;point=route('upperTurn');live=true;}
  else if(preset==='chamber-entry'){phase=CHAPEL_TOWER_PHASE.TOWER_ACTIVE;point=route('chamberEntry');live=true;}
  else if(preset==='bell-frame'||preset==='crossing'){phase=CHAPEL_TOWER_PHASE.TOWER_ACTIVE;point=route('crossing');live=true;}
  else if(preset==='stop-ready'||preset==='winch'){phase=CHAPEL_TOWER_PHASE.TOWER_ACTIVE;point=route('winch');live=true;offsetMs='stop-ready';}
  else if(preset==='service-stair'){phase=CHAPEL_TOWER_PHASE.TOWER_CLEARED;point=route('serviceStair');}
  else if(preset==='organ-loft'){phase=CHAPEL_TOWER_PHASE.TOWER_CLEARED;point=route('organLoft');}
  else if(preset==='nave-door'){phase=CHAPEL_TOWER_PHASE.TOWER_CLEARED;point=route('naveDoor');}
  else if(preset==='nave-exit'){phase=CHAPEL_TOWER_PHASE.TOWER_CLEARED;point=route('naveExit');}
  else if(preset==='chapel-final'){phase=CHAPEL_TOWER_PHASE.CHAPEL_FINAL;point={...(godFindZonePoint(ZONE.chapel)||CHAPEL_OUTER_CHECKPOINT),facing:0};}
  else if(preset!=='outer-chapel')throw new Error(`unknown tower God preset ${preset}`);

  const chapelTower={
    ...freshChapelTowerState(),
    phase,
    ropeRoomVisited:preset!=='outer-chapel',
    hatchInspected:['bell-frame','crossing','stop-ready','winch','service-stair','organ-loft','nave-door','nave-exit','chapel-final'].includes(preset),
    hammerIsolated:['bell-frame','crossing','stop-ready','winch','service-stair','organ-loft','nave-door','nave-exit','chapel-final'].includes(preset),
    relayInterruptions:['stop-ready','winch','service-stair','organ-loft','nave-door','nave-exit','chapel-final'].includes(preset)?TOWER_RELAY_REQUIRED_INTERRUPTS:0,
    shuttersReleased:[CHAPEL_TOWER_PHASE.TOWER_CLEARED,CHAPEL_TOWER_PHASE.CHAPEL_FINAL].includes(phase),
    chapelReached:preset==='chapel-final',
  };
  px=point.x;py=point.y;trail=[];renderMove=null;motionRig=null;
  playerKeys.add('chapel');
  if(phase!==CHAPEL_TOWER_PHASE.FORESHADOW)playerKeys.add('tower-live');
  if([CHAPEL_TOWER_PHASE.TOWER_CLEARED,CHAPEL_TOWER_PHASE.CHAPEL_FINAL].includes(phase))playerKeys.add('tower-cleared');
  if([CHAPEL_TOWER_PHASE.TOWER_CLEARED,CHAPEL_TOWER_PHASE.CHAPEL_FINAL].includes(phase))for(const id of ['tower-hatch','bell-chamber-entry','organ-loft-service','organ-loft-nave'])FP.setDoorOpen(id,true);
  R3.r3dSetFacing(point.facing??0);
  if(!REC.lightOn())REC.toggleLight();
  saveCommit({chapelTower,px,py,area:'bell-tower'});
  godSyncBuildingRender();
  if(live)startBellTowerRuntime({retry:false,collisions:true,offsetMs});
  pushEvent(`// god: bell tower ${preset}. collisions enabled.`);
}

function godToggleTowerCollision(){
  bellTowerCollisionEnabled=!bellTowerCollisionEnabled;
  pushEvent(`// god: tower collision ${bellTowerCollisionEnabled?'enabled':'disabled'}.`);
  return bellTowerCollisionEnabled;
}

function godSourceTowerCrossing(){
  godEnterSourcePreset(CHUNK_SURF_GOD_PRESET.FINAL);
  const chapelTower={...freshChapelTowerState(),phase:CHAPEL_TOWER_PHASE.TRANSITION_READY};
  saveCommit({chapelTower});
  beginSourceTowerTransition();
  pushEvent('// god: source-to-tower crossing. hold forward or backward.');
}

function godBellTowerLive(){
  godEnterTowerPreset('bell-frame');
}

function godRefreshDoors(){
  saveCommit({doors:FP.saveDoorState()});facilityMapCache={key:null,model:null};
  const group=FP.logicalToPhysical(px,py).renderGroup;R3.r3dSetProps(worldRenderInstances(group));syncDoorDynamicProps();
}

function godWarpToDoorArchetype(archetype){
  godEnsureTestRun();const door=FP.doorState().find((entry)=>entry.archetype===archetype);
  if(!door){pushEvent(`// god: no ${archetype} door.`);return false;}
  const offsets=door.widthAxis==='x'?[[0,-4],[0,4]]:[[-4,0],[4,0]];
  const at=offsets.map(([dx,dy])=>({x:Math.round(door.cx+dx),y:Math.round(door.cy+dy),dx,dy})).find((point)=>!FP.isSolid(point.x,point.y));
  if(!at)return false;px=at.x;py=at.y;trail=[];renderMove=null;motionRig=null;
  const vx=door.cx-px,vy=door.cy-py;R3.r3dSetFacing(Math.abs(vx)>Math.abs(vy)?(vx>0?1:3):(vy>0?2:0));
  godSyncBuildingRender();syncDoorDynamicProps();saveCommit({px,py,area:'conservatory'});pushEvent(`// god door: ${door.id}.`);return true;
}

function godToggleFocusedDoor(){
  const hit=FP.doorNear(px,py,R3.r3dDelta(1),7);if(!hit){pushEvent('// god: no focused door.');return false;}
  FP.setDoorOpen(hit.portal.id,!hit.portal.open);godRefreshDoors();return true;
}
function godSetAllDoors(open){FP.setAllDoorsOpen(open);godRefreshDoors();}
function godRunDoorClosers(){const ids=FP.runDoorCloserCycles();godRefreshDoors();pushEvent(`// god: ${ids.length} closer cycles.`);}
function godResetDoors(){FP.resetDoors();godRefreshDoors();}
function godToggleDoorDebug(){godDoorDebug=!godDoorDebug;godRefreshDoors();return godDoorDebug;}

function godTabs(){
  const section=(label)=>({kind:'section',label});
  const ready=()=>storyMode&&inRogue&&FP.isLoaded();
  const warp=(id,label,zone)=>({id,label,value:()=>ready()?'[WARP]':'START TEST RUN',closeMenu:true,activate:()=>{if(!ready())godEnsureTestRun();else godWarpToZone(zone);}});
  const toggleFlag=(id,label,flag)=>({id,label,value:()=>flagTest(flag)?'ON':'OFF',adjust:()=>godSetFlag(flag,!flagTest(flag))});
  const battle=(id,label,factory)=>({id,label,value:'[OPEN]',closeMenu:true,activate:()=>openGodBattle(factory(isNamed()))});
  return [
    {id:'session',name:'SESSION',rows:[
      section('Run'),
      {id:'bell-tower-live',label:'BELL TOWER LIVE',value:'[OPEN]',closeMenu:true,activate:godBellTowerLive},
      {id:'test-run',label:'ENTER / RESET TEST RUN',value:()=>ready()?'READY':'[START]',danger:!ready(),closeMenu:true,activate:godEnsureTestRun},
      {id:'resume',label:'CLOSE GOD MENU',value:'[RESUME]',activate:closeGodMenu},
      section('Stair anomaly'),
      {id:'stair-rearm-run',label:'RE-ARM STAIR · THIS RUN',value:()=>currentStairAnomalyLedger().status===STAIR_ANOMALY_STATUS.ARMED?'ARMED':'[ARM]',activate:godRearmStairRun},
      {id:'stair-reset-global',label:'RESET STAIR · GLOBAL / FIRST-EVER',value:()=>`RUNS ${getMeta()?.runs||0} · [RESET]`,danger:true,activate:godResetStairGlobal},
      section('Locations'),
      warp('warp-dock','LOADING DOCK',ZONE.dock),
      warp('warp-foyer','FRONT ATRIUM',ZONE.foyer),
      warp('warp-studio','STUDIO B3',ZONE.studio),
      warp('warp-natatorium','NATATORIUM',ZONE.natatorium),
      warp('warp-hall','CONCERT HALL',ZONE.hall),
      warp('warp-practice','PRACTICE WING',ZONE.practice),
      warp('warp-academic','ACADEMIC GALLERY',ZONE.academic),
      warp('warp-chapel','CHAPEL',ZONE.chapel),
      warp('warp-plant','PLANT ROOM',ZONE.plant),
    ]},
    {id:'source-space',name:'SOURCE',rows:[
      section('Infinite Long Hall'),
      {id:'source-hall-entry',label:'LONG HALL / ENTRY',value:'[DROP IN]',closeMenu:true,activate:()=>godEnterSourcePreset(CHUNK_SURF_GOD_PRESET.HALL_ENTRY)},
      {id:'source-hall-storm',label:'LONG HALL / PAGE STORM',value:'[DROP IN]',closeMenu:true,activate:()=>godEnterSourcePreset(CHUNK_SURF_GOD_PRESET.HALL_STORM)},
      {id:'source-haystack',label:'HAYSTACK / SEARCH',value:'[DROP IN]',closeMenu:true,activate:()=>godEnterSourcePreset(CHUNK_SURF_GOD_PRESET.HAYSTACK)},
      section('Open Text Landscape'),
      {id:'source-landscape',label:'LANDSCAPE / ENTRY',value:'[DROP IN]',closeMenu:true,activate:()=>godEnterSourcePreset(CHUNK_SURF_GOD_PRESET.LANDSCAPE)},
      {id:'source-hunt',label:'RECORDIST / BODY RUN',value:'[DROP IN]',closeMenu:true,activate:()=>godEnterSourcePreset(CHUNK_SURF_GOD_PRESET.HUNT)},
      {id:'source-final-run',label:'BODY / FINAL RUN',value:'[DROP IN]',closeMenu:true,activate:()=>godEnterSourcePreset(CHUNK_SURF_GOD_PRESET.FINAL_RUN)},
      {id:'source-final',label:'FINAL SIGNAL COMBAT',value:'[DROP IN]',closeMenu:true,activate:()=>godEnterSourcePreset(CHUNK_SURF_GOD_PRESET.FINAL)},
    ]},
    {id:'bell-tower',name:'TOWER',rows:[
      section('Quiet access'),
      {id:'tower-outer',label:'OUTER CHAPEL / NARTHEX',value:'[DROP IN]',closeMenu:true,activate:()=>godEnterTowerPreset('outer-chapel')},
      {id:'tower-lower-stair',label:'LOWER STAIR / FIRST FLIGHT',value:'[DROP IN]',closeMenu:true,activate:()=>godEnterTowerPreset('lower-stair')},
      {id:'tower-lower-turn',label:'LOWER STAIR / TURN',value:'[DROP IN]',closeMenu:true,activate:()=>godEnterTowerPreset('lower-turn')},
      {id:'tower-ringing-room',label:'RINGING ROOM / QUIET',value:'[DROP IN]',closeMenu:true,activate:()=>godEnterTowerPreset('ringing-room')},
      {id:'tower-crossing',label:'SOURCE → TOWER CROSSING',value:'[PLAY]',closeMenu:true,activate:godSourceTowerCrossing},
      section('Live machinery'),
      {id:'tower-arrival',label:'TOWER ARRIVAL / LIVE',value:'[DROP IN]',closeMenu:true,activate:()=>godEnterTowerPreset('tower-arrival')},
      {id:'tower-belfry-door',label:'BELFRY STAIR / DOOR',value:'[DROP IN]',closeMenu:true,activate:()=>godEnterTowerPreset('belfry-door')},
      {id:'tower-upper-turn',label:'BELFRY STAIR / TURN',value:'[DROP IN]',closeMenu:true,activate:()=>godEnterTowerPreset('upper-turn')},
      {id:'tower-chamber-entry',label:'BELL CHAMBER / VESTIBULE',value:'[DROP IN]',closeMenu:true,activate:()=>godEnterTowerPreset('chamber-entry')},
      {id:'tower-frame',label:'EXPOSED FRAME CROSSING',value:'[DROP IN]',closeMenu:true,activate:()=>godEnterTowerPreset('crossing')},
      {id:'tower-stop-ready',label:'WINCH / STOP READY',value:'[DROP IN]',closeMenu:true,activate:()=>godEnterTowerPreset('stop-ready')},
      section('Cleared route'),
      {id:'tower-service-stair',label:'SERVICE STAIR / CHAMBER',value:'[DROP IN]',closeMenu:true,activate:()=>godEnterTowerPreset('service-stair')},
      {id:'tower-organ-loft',label:'ORGAN LOFT / CLEARED',value:'[DROP IN]',closeMenu:true,activate:()=>godEnterTowerPreset('organ-loft')},
      {id:'tower-nave-door',label:'ORGAN LOFT / NAVE DOOR',value:'[DROP IN]',closeMenu:true,activate:()=>godEnterTowerPreset('nave-door')},
      {id:'tower-nave-exit',label:'NAVE EXIT / LOWER LANDING',value:'[DROP IN]',closeMenu:true,activate:()=>godEnterTowerPreset('nave-exit')},
      {id:'tower-chapel-final',label:'CHAPEL NAVE / FINALE',value:'[DROP IN]',closeMenu:true,activate:()=>godEnterTowerPreset('chapel-final')},
      section('Collision'),
      {id:'tower-collision',label:'MOVING MACHINERY COLLISION',value:()=>bellTowerCollisionEnabled?'ENABLED':'DISABLED',adjust:godToggleTowerCollision,activate:godToggleTowerCollision},
    ]},
    {id:'doors',name:'DOORS',rows:[
      section('Archetype warps'),
      {id:'door-public',label:'PUBLIC GLAZED PAIR',value:'[WARP]',closeMenu:true,activate:()=>godWarpToDoorArchetype(DOOR_ARCHETYPE.PUBLIC_GLAZED_PAIR)},
      {id:'door-hall',label:'HALL ACOUSTIC PAIR',value:'[WARP]',closeMenu:true,activate:()=>godWarpToDoorArchetype(DOOR_ARCHETYPE.HALL_ACOUSTIC_PAIR)},
      {id:'door-chapel',label:'CHAPEL OAK PAIR',value:'[WARP]',closeMenu:true,activate:()=>godWarpToDoorArchetype(DOOR_ARCHETYPE.CHAPEL_OAK_PAIR)},
      {id:'door-practice',label:'PRACTICE ACOUSTIC SINGLE',value:'[WARP]',closeMenu:true,activate:()=>godWarpToDoorArchetype(DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE)},
      {id:'door-fire',label:'SERVICE / FIRE SINGLE',value:'[WARP]',closeMenu:true,activate:()=>godWarpToDoorArchetype(DOOR_ARCHETYPE.SERVICE_FIRE_SINGLE)},
      {id:'door-staff',label:'STAFF HALF-GLAZED',value:'[WARP]',closeMenu:true,activate:()=>godWarpToDoorArchetype(DOOR_ARCHETYPE.STAFF_HALF_GLAZED)},
      {id:'door-pool',label:'POOL FIRE DOOR',value:'[WARP]',closeMenu:true,activate:()=>godWarpToDoorArchetype(DOOR_ARCHETYPE.POOL_FIRE_SINGLE)},
      {id:'door-tower',label:'TOWER SERVICE DOOR',value:'[WARP]',closeMenu:true,activate:()=>godWarpToDoorArchetype(DOOR_ARCHETYPE.TOWER_SERVICE_SINGLE)},
      section('Runtime controls'),
      {id:'door-focused',label:'TOGGLE FOCUSED DOOR',value:'[TOGGLE]',activate:godToggleFocusedDoor},
      {id:'door-open-all',label:'OPEN ALL',value:'[OPEN]',activate:()=>godSetAllDoors(true)},
      {id:'door-close-all',label:'CLOSE ALL',value:'[CLOSE]',activate:()=>godSetAllDoors(false)},
      {id:'door-closers',label:'RUN CLOSER CYCLES',value:'[RUN]',activate:godRunDoorClosers},
      {id:'door-volumes',label:'APERTURE / HINGE / SWING',value:()=>godDoorDebug?'VISIBLE':'HIDDEN',adjust:godToggleDoorDebug,activate:godToggleDoorDebug},
      {id:'door-reset',label:'RESET INITIAL STATES',value:'[RESET]',activate:godResetDoors},
    ]},
    {id:'conditions',name:'CONDITIONS',rows:[
      section('Fear pressure'),
      {id:'fear',label:'BASE FEAR',value:()=>`${Math.round(fear*100)}%`,adjust:(d)=>{fear=Math.max(0,Math.min(1,fear+d*0.25));}},
      {id:'heartbeat',label:'HEARTBEAT',value:()=>godLevelLabel(godFxOverride.heartbeat),adjust:(d)=>godCycleLevel('heartbeat',d)},
      {id:'screen-hiss',label:'HISS / STATIC OVERLAY',value:()=>godLevelLabel(godFxOverride.monitorHiss),adjust:(d)=>godCycleLevel('monitorHiss',d)},
      {id:'visual-dread',label:'DREAD VIGNETTE',value:()=>godLevelLabel(godFxOverride.visualDread),adjust:(d)=>godCycleLevel('visualDread',d)},
      {id:'reset-fx',label:'RESET FEAR FX TO GAME',value:'[RESET]',activate:godResetFx},
      section('Threats'),
      {id:'presence',label:'HUSH / PRESENCE',value:()=>PRES.isActive()?'SPAWNED':'CLEAR',adjust:()=>{if(PRES.isActive())PRES.despawn();else spawnBuildingPresence();}},
      {id:'hush-body',label:'HUSH BODY COMPOSITE',value:()=>R3.r3dHushBodyStatus?.().mode?.toUpperCase()||'UNAVAILABLE',adjust:godCycleHushBody},
      {id:'hush-contact',label:'HUSH CONTACT FLASH',value:'[FIRE]',closeMenu:true,activate:()=>beginHushContactFlash({taken:false,reason:'god-contact',intensity:1})},
      {id:'hush-warning',label:'HUSH BODY WARNING',value:'[FIRE]',closeMenu:true,activate:()=>openHushSensation(HUSH_SENSATION_MODE.PROXIMITY,{seed:hushContactSeed('god-warning')})},
      {id:'hush-brush',label:'HUSH BRUSH CONTACT',value:'[FIRE]',closeMenu:true,activate:()=>openDebugHushBrush(hushContactSeed('god-brush'))},
      {id:'taken',label:'TAKEN SEQUENCE',value:'[FIRE]',closeMenu:true,activate:beginTaken},
      {id:'injury',label:'ADD INJURY',value:()=>String(REC.recState().injuries),activate:()=>{REC.injure();saveCommit({rec:REC.saveRecState()});}},
      {id:'stinger',label:'HUSH STINGER',value:'[FIRE]',activate:()=>FEAR.hushStinger(1)},
      {id:'flash',label:'FULL SCREEN FLASH',value:'[FIRE]',activate:()=>CR.fx.flash(180,'rgba(210,255,244,.95)')},
      {id:'shake',label:'CAMERA SHAKE',value:'[FIRE]',activate:()=>CR.fx.shake(2.2,700)},
    ]},
    {id:'look',name:'LOOK STACK',rows:[
      section('Authored profiles'),
      {id:'look-current',label:'ACTIVE PROFILE',value:()=>activeLookProfile.toUpperCase()},
      ...LOOK_PROFILE_IDS.map((id)=>({
        id:`look-${id}`,label:id,value:()=>activeLookProfile===id?'ACTIVE':'[APPLY]',
        activate:()=>applyLookProfile(id),
      })),
      section('Read-only layer diagnostics'),
      {id:'look-debug',label:'DISPLAY SOURCE',value:()=>godLookDebug.toUpperCase(),adjust:(d)=>{
        const at=Math.max(0,GOD_LOOK_DEBUG.indexOf(godLookDebug));
        godLookDebug=GOD_LOOK_DEBUG[(at+d+GOD_LOOK_DEBUG.length)%GOD_LOOK_DEBUG.length];
        applyPixelMeshSettings({debugSource:godLookDebug});
      }},
      {id:'look-pulse',label:'PHOSPHOR TEST PULSE',value:'[FIRE]',activate:()=>pulsePixelMesh(1800)},
      {id:'look-reset-memory',label:'CLEAR AFTERIMAGE MEMORY',value:'[RESET]',activate:()=>R3.r3dResetVfdMemory?.()},
    ]},
    {id:'inventory',name:'ITEMS',rows:[
      section('Equipment'),
      {id:'chapel-key',label:'CHAPEL KEY C-17',value:()=>playerKeys.has('chapel')?'OWNED':'MISSING',adjust:()=>godSetChapelKey(!playerKeys.has('chapel'))},
      toggleFlag('interface','BENT RIG INTERFACE','has.interface'),
      toggleFlag('cells','SPARE CELLS','rig.cells'),
      toggleFlag('coffee','COFFEE CONSUMED','drank.coffee'),
      {id:'battery',label:'TORCH BATTERY',value:()=>`${Math.round(REC.batteryLevel()*100)}%`,adjust:godCycleBattery},
      section('Lost equipment'),
      ...LOSABLE.map((id)=>({id:`lost-${id}`,label:`LOST ${id}`,value:()=>itemLost(id)?'LOST':'HELD',adjust:()=>godSetLostItem(id,!itemLost(id))})),
      section('Room takes'),
      {id:'all-takes',label:'ALL WORK ORDER TAKES',value:()=>`${REC.recState().takes.length} / ${TARGETS.length}`,adjust:(d)=>godSetAllTakes(d>0)},
      ...TARGETS.map((id)=>({id:`take-${id}`,label:roomLabel(id),value:()=>REC.hasTake(id)?'SEALED':'EMPTY',adjust:()=>{REC.setTake(id,!REC.hasTake(id));saveCommit({rec:REC.saveRecState()});}})),
    ]},
    {id:'scenes',name:'GAME PARTS',rows:[
      section('Presentation'),
      {id:'opening-credits',label:'OPENING CREDITS',value:'[PLAY]',closeMenu:true,activate:()=>scenes.push(makeOpeningCreditsScene())},
      {id:'cold-open',label:'COLD OPEN',value:'[PLAY]',closeMenu:true,activate:godColdOpen},
      {id:'world-title',label:'WORLD TITLE',value:'[PLAY]',closeMenu:true,activate:()=>scenes.push(makeWorldTitleScene({audio:STORY}))},
      {id:'post-door-runtime',label:'POST-DOOR 3D RUNTIME',value:'[DROP IN]',closeMenu:true,activate:godPostDoorRuntime},
      {id:'credits',label:'RELEASE CREDITS',value:'[OPEN]',closeMenu:true,activate:openCredits},
      section('Encounters'),
      {id:'battle-abort',label:'ABORT ACTIVE BATTLE',value:()=>activeBattleId||godBattleOpen?'[ABORT]':'NONE',danger:()=>!!(activeBattleId||godBattleOpen),closeMenu:true,activate:godAbortBattle},
      {id:'possess-rupture',label:'POSSESSION BURST',value:'[FIRE]',closeMenu:true,activate:()=>possess('rupture',4)},
      {id:'battle-training',label:'COMBAT TRAINING',value:'[OPEN]',closeMenu:true,activate:()=>openTrainingBattle()},
      battle('battle-natatorium','NATATORIUM BATTLE',natatoriumBattle),
      // "PRACTICE BATTLE" read as the training drill. It is the practice WING's
      // encounter — one of the five rooms, not the dock rehearsal.
      battle('battle-practice','PRACTICE ROOM BATTLE',practiceBattle),
      battle('battle-hall','CONCERT HALL BATTLE',hallBattle),
      {id:'battle-chapel',label:'CHAPEL CONFRONTATION',value:'[OPEN]',closeMenu:true,activate:beginConfrontation},
      {id:'ending-choice',label:'ENDING CHOICE',value:'[OPEN]',closeMenu:true,activate:openEndingChoice},
      {id:'chunk-surf',label:'CHUNK SURF',value:'[OPEN]',closeMenu:true,activate:()=>beginChunkSurf({forced:true})},
    ]},
    {id:'audio',name:'AUDIO',rows:[
      section('Engine'),
      {id:'audio-state',label:'AUDIO CONTEXT',value:()=>String(actx?.state||'NOT CREATED').toUpperCase()},
      {id:'restart-audio',label:'RESTART AUDIO ENGINE',value:'[RESTART]',activate:restartDesktopAudio},
      {id:'legacy-voices',label:'LEGACY SAMPLE VOICES',value:()=>`${voices.size} ACTIVE`,activate:()=>{sampleFieldEnabled=false;silenceSampleField();}},
      {id:'sample-gate',label:'SAMPLE FIELD AUTHORIZATION',value:()=>sampleFieldEnabled?'GAME MODE':'BOOT LOCKED'},
      {id:'room-tone',label:'ROOM TONE BED',value:()=>RT.roomToneState().active?'ON':'OFF',adjust:()=>{if(RT.roomToneState().active)RT.bedOff();else RT.bedOn();}},
      section('Horror mix'),
      {id:'audio-heartbeat',label:'HEARTBEAT',value:()=>godLevelLabel(godFxOverride.heartbeat),adjust:(d)=>godCycleLevel('heartbeat',d)},
      {id:'audio-hiss',label:'TAPE HISS + OVERLAY',value:()=>godLevelLabel(godFxOverride.monitorHiss),adjust:(d)=>godCycleLevel('monitorHiss',d)},
      {id:'audio-stop',label:'STOP STORY / HISS AUDIO',value:'[STOP]',activate:()=>STORY.stopAll()},
    ]},
  ];
}

function closeGodMenu(){
  if(scenes.top()?.id==='god-menu') scenes.pop();
  resetMotionInput('god-menu-close', {stopRenderMove:true});
  if(!godMenuWasPaused) setGameplayPaused(false,{announce:false});
}

function openGodMenu(){
  if(scenes.top()?.id==='god-menu'){closeGodMenu();return true;}
  godMenuWasPaused=paused;
  setGameplayPaused(true,{announce:false});
  scenes.push(makeGodMenuScene({tabs:godTabs(),onClose:closeGodMenu}));
  return true;
}

async function requestQuitDesktop(){
  if(IS_TAURI){
    const {stopNativeLens}=await import('./platform/lens-service.js');
    await stopNativeLens().catch((err)=>console.warn('[desktop] lens stop failed',err));
    await quitNativeApp().catch((err)=>console.warn('[desktop] quit failed',err));
    return;
  }
  pushEvent('// quit to desktop is available in the desktop build.');
}

function closePauseMenu(){
  if(scenes.top()?.id==='pause') scenes.pop();
  setGameplayPaused(false,{announce:false});
  syncPointerMode('pause-close');
}

function openPauseMenu(){
  if(!storyMode || !inRogue){
    togglePause();
    return false;
  }
  if(scenes.top()?.id==='pause'){
    closePauseMenu();
    return true;
  }
  setGameplayPaused(true,{announce:false});
  scenes.push(makePauseScene({
    onResume: closePauseMenu,
    onSettings: ()=>openSettingsFromPause('display'),
    onObjectives: openBag,
    onArchive: openArchive,
    onRestartRun: ()=>{closePauseMenu();beginNewGameFlow();},
    onReturnToTitle: returnToTitle,
    onQuitDesktop: requestQuitDesktop,
    status:()=>({
      area:currentAreaLabel(),
      takes:REC.recState().takes.length,
      light:REC.lightOn(),
      hush:PRES.isActive()?(PRES.pressure(px,py)>0.82?'CONTACT':'TRACKING'):'QUIET',
      time:(()=>{const total=Math.max(0,Math.floor(getSave().playSeconds||0));const h=Math.floor(total/3600);const m=Math.floor(total%3600/60);const s=total%60;return [h,m,s].map((v)=>String(v).padStart(2,'0')).join(':');})(),
    }),
  }));
  syncPointerMode('pause-open');
  return true;
}

function openArchive(){
  scenes.push(makeArchiveScene({ meta:getMeta() }));
}

function presentCredits({context='menu',onDone=()=>{}}={}){
  let finished=false;
  const finish=()=>{
    if(finished)return;
    finished=true;
    if(scenes.top()?.id==='credits')scenes.pop();
    else scenes.remove('credits');
    onDone();
  };
  scenes.push(makeCreditsScene({
    context,
    onDone:finish,
    onWebsite:()=>openExternalUrl(APP_LINKS.website),
    // The ending's last thirty seconds, as sound: the credits piece leaves under
    // the closing Butler quote, everything else is cut with it, and what is
    // waiting on the other side of the black is tape hiss — the sound the whole
    // game has been made of. The run summary then fades up into that.
    onQuote:()=>{
      STORY.fadeSoundtrack({ fade:4.2 });
      CUES.stopAllCues(1.2);
    },
    onBlack:()=>{
      STORY.stopAll();
      CUES.stopAllCues(0.4);
      if(context==='ending') STORY.startTapeHiss({ gain:TAKE_HISS.min*0.9, fade:3.4 });
    },
  }));
}

function openCredits(){
  ensureCtx();
  emitProgress(EVENT_TYPES.CREDITS_VIEWED, {}, 'main.openCredits');
  presentCredits({context:'menu'});
}

function openEndingCredits(summary){
  ensureCtx();
  emitProgress(EVENT_TYPES.CREDITS_VIEWED, {}, 'main.openEndingCredits');
  presentCredits({context:'ending',onDone:()=>showReturnReport(summary)});
}

function openReturnIndex(){
  scenes.push(makeReturnIndexScene({ meta:getMeta() }));
}

function makeTitle({wantFullscreen=false}={}){
  return makeTitleScene({
    buildLabel: import.meta.env?.DEV ? `BUILD ${APP_VERSION} · CURRENT SOURCE` : '',
    onAudioGate:ensureCtx,
    onNewGame:()=>{ if(wantFullscreen) requestFullscreenSafe(); beginNewGameFlow(); },
    onContinue:()=>{ if(wantFullscreen) requestFullscreenSafe(); enterStory(); },
    onJustSurf:enterJustSurf,
    onSettings:()=>openSettings({inGame:false}),
    onArchive:openArchive,
    onReturnIndex:openReturnIndex,
    onBetaNotice:openBetaNotice,
  });
}

function returnToTitle(){
  stopBellTowerRuntime();
  bellTowerImpactActive=false;
  bellTowerCollisionEnabled=true;

  stopHushAudioRuntime();
  activeBattleId=null;
  godBattleOpen=false;
  sampleFieldEnabled=false;
  storyMode=false;
  setGameplayPaused(false,{announce:false});
  setGameChrome(false);
  // Explicit here as well as inside resetRunAudio: revoking legacy sample
  // playback and silencing the story bus on the way back to the title are
  // contracts of their own (test/sample-field-boot-contract) and are checked
  // against this function's body. Both calls are idempotent.
  silenceSampleField();
  STORY.stopAll();
  resetRunAudio('return-to-title');
  FEAR.setFear(0);
  godFxOverride.heartbeat=null;
  godFxOverride.monitorHiss=null;
  godFxOverride.visualDread=null;
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
        stopBellTowerRuntime();
        bellTowerImpactActive=false;
        bellTowerCollisionEnabled=true;

        // The title remains beneath the selector until authorization is complete.
      // Only now is the previous run replaced.
      activeBattleId=null;
      godBattleOpen=false;
      STORY.stopTapeHiss({fade:0.2});
      resetMotionInput('new-run', {stopRenderMove:true});
      scenes.remove('title');
      newGame({preset,values});
      beginRunProgression();
      enterSelectedRun();
    },
  }));
}

function enterSelectedRun(){
  syncControllerSettingsFromSave();
  applyCurrentRunDifficulty();
  const qp=params();
  if(qp.has('skipwarn')){ enterStory(); return; }
  MIC.micRefreshDevices?.();
  scenes.push(makeWarningScene({
    onEnableMic:()=>{
      const st=getSave().settings||{};
      saveCommit({settings:{...st,mic:'on'}});
      startRoomMic({ force:true });
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


function exitFullscreenSafe(){
  try{
    if(document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch?.(()=>{});
  }catch(_){}
}

function isDesktopMenuInGame(){ return storyMode && inRogue; }

function continueRunFromDesktopMenu(){
  if(getSave().run){
    if(scenes.top()?.id==='title') scenes.pop();
    enterStory();
    return;
  }
  beginNewGameFlow();
}

function openAboutPanel(){
  ensureCtx();
  openSettings({inGame:isDesktopMenuInGame(), initialTab:'system'});
  pushEvent(`// Chunk Surfer ${APP_VERSION}. AUDIOCORP field monitor ready.`);
}

async function toggleDesktopGameMode(force){
  const current=currentDisplaySettings();
  desktopGameMode=nextGameModeState(desktopGameMode,{
    enabled:typeof force==='boolean'?force:undefined,
    previousWindowPreset:current.windowPreset,
    now:performance.now?.()||Date.now(),
  });
  applyGameModeDom(desktopGameMode.enabled, document);
  if(desktopGameMode.enabled){
    ensureCtx();
    if(!IS_TAURI) requestFullscreenSafe();
    pushEvent('// game mode: focus profile engaged. [F11] to leave.');
  } else {
    if(!IS_TAURI) exitFullscreenSafe();
    pushEvent('// game mode: window profile restored.');
  }
  await updateDisplaySettings({displayMode:desktopGameMode.enabled?'game-mode':'windowed'});
  refreshStageLayoutSoon();
  ensureInteractionFocus();
}

function syncNativeFullscreenState(){
  refreshStageLayoutSoon();
  ensureInteractionFocus();
}

function resetDesktopWindowState(){
  resetWindowFromMenu();
}

function setDesktopReduceMotion(checked){
  const st=getSave().settings||{};
  const current=(st.shake||'full')!=='full';
  const on=typeof checked==='boolean' ? checked : !current;
  saveCommit({settings:{...st,shake:on?'reduced':'full'}});
  applyPixelMeshSettings();
  pushEvent(`// reduce motion: ${on?'on':'off'}.`);
}

function setDesktopReduceFlash(checked){
  const st=getSave().settings||{};
  const current=(st.flash||'full')!=='full';
  const on=typeof checked==='boolean' ? checked : !current;
  saveCommit({settings:{...st,flash:on?'reduced':'full'}});
  applyPixelMeshSettings();
  pushEvent(`// reduce flash: ${on?'on':'off'}.`);
}

function setDesktopHighContrast(checked){
  const st=getSave().settings||{};
  const current=!!st.desktopHighContrast;
  const on=typeof checked==='boolean' ? checked : !current;
  const nextVfd={...(st.vfd||{}),brightness:on?Math.max(1.12,vfdSettings.brightness||1):(st.vfd?.brightness||1)};
  applyVfdSettings(nextVfd);
  saveCommit({settings:{...st,desktopHighContrast:on,vfd:nextVfd}});
  document.body.classList.toggle('desktop-high-contrast',on);
  pushEvent(`// VFD boost: ${on?'on':'off'}.`);
}

function toggleDesktopMute(){
  const st=getSave().settings||{};
  const cur=clamp01(st.volume ?? 1,1);
  if(cur>0){
    desktopMuteRestoreVolume=cur;
    saveCommit({settings:{...st,volume:0}});
    setGlobalVolume(0);
    pushEvent('// audio muted.');
  } else {
    const next=clamp01(desktopMuteRestoreVolume ?? 1,1);
    saveCommit({settings:{...st,volume:next}});
    setGlobalVolume(next);
    pushEvent('// audio restored.');
  }
}

function restartDesktopAudio(){
  const resumeBellTowerAudio =
    chapelTowerState().phase === CHAPEL_TOWER_PHASE.TOWER_ACTIVE &&
    !!bellTowerRuntime &&
    !!bellTowerAudio;

  bellTowerAudio?.cut?.();

  void recoverInteractionAudio('menu-restart-audio');
  STORY.stopAll?.();
  stopAllVoices();
  stopWorldLayerVoice();
  silenceAmbientDrone();
  applyAudioSettings();

  if(resumeBellTowerAudio){
    bellTowerAudio?.start?.();
  }

  if(!paused && storyMode && inRogue){
    startAmbientDroneAt(currentAmbientTarget());
    updateAudio();
  }

  pushEvent('// audio engine restarted.');
}

async function openExternalUrl(url){
  try{
    if(IS_TAURI){
      const opener=await import('@tauri-apps/plugin-opener');
      await opener.openUrl(url);
      return true;
    }
  }catch(err){ console.warn('open url failed',err); }
  try{ window.open(url,'_blank','noopener,noreferrer'); return true; }catch(_){ return false; }
}

async function openDesktopSaveFolder(){
  try{
    const paths=await resolveDesktopPaths();
    if(paths?.appData){
      const res=await revealPath(paths.appData);
      if(res?.ok){ pushEvent('// save folder opened.'); return; }
    }
  }catch(err){ console.warn('open save folder failed',err); }
  openSettings({inGame:isDesktopMenuInGame(),initialTab:'memory'});
  pushEvent('// save folder unavailable; memory panel opened.');
}

function openReleasePage(){
  openExternalUrl('https://github.com/cbassuarez/chunk-surfer/releases');
}

function reportDesktopIssue(){
  openExternalUrl(APP_LINKS.reportProblem);
}


async function handleReservedDesktopShortcut(e){
  const key=String(e.key||'').toLowerCase();
  const code=String(e.code||'').toLowerCase();
  const primary=!!(e.metaKey||e.ctrlKey);

  if(!primary && (key==='f11'||code==='f11')){
    await toggleDesktopGameMode();
    return true;
  }
  if(!primary) return false;

  if(key==='q'){
    await quitNativeApp().catch((err)=>console.warn('[desktop] quit shortcut failed',err));
    return true;
  }
  if(key==='m'){
    if(e.shiftKey){ toggleDesktopMute(); return true; }
    await minimizeNativeWindow().catch((err)=>console.warn('[desktop] minimize shortcut failed',err));
    return true;
  }
  if(key===','){
    openSettings({inGame:false,initialTab:'display'});
    return true;
  }
  if(key==='f'){
    await toggleDesktopGameMode();
    return true;
  }
  if(key==='p'){
    openPauseMenu();
    return true;
  }
  if(key==='n'){
    beginNewGameFlow();
    return true;
  }
  if(key==='g' && e.shiftKey){
    openGodMenu();
    return true;
  }
  return false;
}

// The glyph layer is the only surface the diffusion lens cannot repaint, so
// everything the player must be able to trust lives here. M3 adds the compass
// and the facility navigator alongside.
function drawSourceHud(cols,rows){
  const state=chunkSurfRuntime.state();
  const objective=chunkSurfRuntime.sourceObjective();
  const focus=chunkSurfRuntime.focusAt(px,py,R3.r3dFacing());
  uiText(2,1,'SOURCE / PRIMARY TRACE','ui-label');
  uiText(2,2,objective.label.slice(0,Math.max(1,cols-4)),objective.alignmentPulse?'ui-amber':'ui-blue');
  if(state.hasFork)uiText(2,4,`OPTIONAL TRACES  ${objective.optionalProgress.resolved} / ${objective.optionalProgress.total}`,'ui-secondary');
  if(objective.bearing){
    const range=objective.distance>80?'DISTANT':objective.distance>30?'AHEAD':'NEAR';
    uiText(Math.max(2,cols-24),1,`SIGNAL  ${objective.bearing} / ${range}`,objective.alignmentPulse?'ui-amber':'ui-secondary');
  }
  const hush=chunkSurfRuntime.hushMode();
  if(hush.colliding)uiText(Math.max(2,cols-16),3,'HUSH / MOVE','ui-danger');
  else if(hush.protected&&state.pursuitBeat)uiText(Math.max(2,cols-20),3,'HUSH / SUSPENDED','ui-secondary');
  if(focus){
    const label=focus.kind==='haystack-page'?'ENTER THE STILL PAGE'
      :focus.kind==='redaction'?'RESOLVE SOURCE CLAUSE'
        :focus.available===false?'SOURCE UNAVAILABLE':`INSPECT ${(chunkSurfRoom(focus.id)?.title||focus.id).toUpperCase()}`;
    const prompt=focus.kind==='landmark'&&focus.available!==false
      ?BINDINGS.promptLine([{action:'interact',label},{action:'light',label:'TUNE'},{action:'recorder',label:'RECORD'}])
      :`${BINDINGS.inputPrompt('interact')} ${label}`;
    uiText(Math.max(2,Math.floor((cols-prompt.length)/2)),rows-2,prompt.slice(0,Math.max(1,cols-4)),focus.available===false?'ui-secondary':'ui-amber');
  }
  SPEECH.drawSpeech();
}

function drawStoryHud(){
  if(!storyMode || scenes.blocksWorld()) return;
  const { cols, rows }=uiSize();
  if(usingSourceSpace()){drawSourceHud(cols,rows);return;}

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
    drawMinimap(currentFacilityMapModel(),{now:performance.now(),mischief:recentMischief()});
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
  {
    const tower=chapelTowerState();
    if([CHAPEL_TOWER_PHASE.TOWER_ACTIVE,CHAPEL_TOWER_PHASE.TOWER_CLEARED].includes(tower.phase)){
      const objective=towerObjective(tower);
      uiText(2,2,objective.label.slice(0,Math.max(1,cols-4)),objective.id==='bells-settling'?'ui-secondary':'ui-amber');
      if(objective.id==='break-relay'){
        const snapshot=bellTowerRuntime?.snapshot?.();
        const signal=snapshot?.relayWindowOpen?'RELAY WINDOW / CUT NOW':'RELAY WINDOW / HOLD';
        uiText(Math.max(2,cols-signal.length-2),3,signal,snapshot?.relayWindowOpen?'ui-green':'ui-secondary');
      }
    }
  }
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

  const sourceFocus=usingSourceSpace()?chunkSurfRuntime.focusAt(px,py,R3.r3dFacing()):null;
  const interactionFocus=usingPlan()&&!usingSpecialSpace()?worldInteractionFocus():{prop:null,door:null,doorWins:false};
  const doorHud=interactionFocus.doorWins?interactionFocus.door:null;
  const propHit=interactionFocus.prop;

  // The verbs must be discoverable. A player should never have to guess that
  // the recorder exists in a game about recording.
  // While he is setting up, the corner shows only the one key the room is
  // asking for. Everything else is learned by having wanted it.
  const hintMode=objectiveHintsMode();
const teach=tutorialPromptsEnabled() ? TUT.tutorialPrompt() : null;
  // Paper at your feet outranks everything the corner has to say. It is the only
  // thing in the building anyone has left behind on purpose.
  if(escape?.kind==='stay'&&nearAuthoredRuntime(px,py,CHAPEL_SCREEN_AUTHORED,7)){
    hudPromptRow(rows-2,[{action:'interact',label:'PUT YOUR HAND ON THE SCREEN'}],cols,'ui-amber');
  } else if(chunkSurfAvailable()){
    const prompt=`${BINDINGS.inputPrompt('interact')} ENTER SOURCE`;
    uiText(Math.max(2,Math.floor((cols-prompt.length)/2)),rows-2,prompt,'ui-amber');
  } else if(sourceFocus){
    const label=sourceFocus.kind==='haystack-page'?'INSPECT STILL PAGE'
      :sourceFocus.kind==='redaction'?'REDACT SOURCE CLAUSE'
        :sourceFocus.available===false?'SOURCE UNAVAILABLE':`INSPECT ${(chunkSurfRoom(sourceFocus.id)?.title||sourceFocus.id).toUpperCase()}`;
    const parts=sourceFocus.kind==='landmark'&&sourceFocus.available!==false
      ?[{action:'interact',label},{action:'light',label:'TUNE'},{action:'recorder',label:'RECORD'}]
      :[{action:'interact',label}];
    hudPromptRow(rows-2,parts,cols,sourceFocus.available===false?'ui-secondary':'ui-amber');
  } else if(pageHere && !REC.isRecording()){
    hudPromptRow(rows-2,[{action:'interact',label:'PICK UP THE SHEET'}],cols,'ui-amber');
  } else if(doorHud){
    const hasKey=!doorHud.portal.keyId||playerKeys.has(doorHud.portal.keyId);
    const runtime=doorHud.portal.runtime;
    // He does not operate the door he came in through. He reaches for it.
    const action=doorHud.portal.id===GREY_DOOR_ID&&!greyDoorRetired()
      ? 'THE DOOR YOU CAME IN THROUGH'
      : runtime.wedge?'REMOVE WEDGE':runtime.state==='open'||runtime.state==='opening'?'CLOSE DOOR':hasKey?'OPEN DOOR':'TRY LOCKED DOOR';
    hudPromptRow(rows-2,[{action:'interact',label:action}],cols,hasKey?'ui-amber':'ui-secondary');
  } else if(propHit){
    const verb=propHit.action==='tower-relay-interrupt'?'BREAK'
      :propHit.action==='tower-shutter-winch'?'RELEASE'
        :propHit.action==='tower-hammer-isolator'?'ISOLATE'
          :propHit.dockInvestigation?'INVESTIGATE':propHit.sampleFamily?.length?'PLAY':'INSPECT';
    hudPromptRow(rows-2,[{action:'interact',label:`${verb} ${propLabel(propHit)}`}],cols,'ui-amber');
  } else if(teach){
    const prompt=teach.toUpperCase().slice(0,Math.max(1,cols-4));
    const px0=Math.max(2, Math.floor((cols-prompt.length)/2));
    // The waypoint is the last verb the setup teaches and the only one the player
    // has never been shown, so its prompt does not sit there politely: it comes up
    // as VFD text and pulses for the first few seconds after the briefing, then
    // settles. Flashing forever is nagging; flashing once is pointing.
    const flashFor=(TUT.tutorialStep()==='mark' && waypointBriefShownAt)
      ? (performance.now()-waypointBriefShownAt)/1000 : null;
    if(flashFor!=null && flashFor<9){
      const pulse=.55+.45*Math.abs(Math.cos(flashFor*Math.PI*1.25));
      // Above the monitor band if he is mid-sentence — a prompt the player is
      // meant to look at cannot be behind the thing that told them to look.
      const band=SPEECH.bandTop();
      const y=band==null ? rows-2.15 : Math.max(3, band-1.4);
      drawVfdText(px0, y, prompt, { scale:1, theme:'amber', alpha:pulse });
    } else {
      uiText(px0, rows-2, prompt, 'ui-amber');
    }
  } else if(hintMode !== 'off') {
    const done = REC.hasTake(currentWorld());
    const parts = [
      { action: 'light', label: rec.light ? 'LIGHT OFF' : 'LIGHT' },
      ...(done ? [] : [{ action: 'recorder', label: 'LISTEN' }]),
      { action: 'bag', label: 'BAG' },
      ...(hintMode === 'full' && PB.hasTake(currentWorld())
        ? [{ action: 'playback', label: PB.isPlaying() ? 'STOP PLAYBACK' : 'PLAYBACK' }] : []),
      ...(hintMode === 'full' ? [{ action: 'menu', label: 'PAUSE' }] : []),
    ];
    if(cols<72){
      drawPromptParts(2,rows-3,parts.slice(0,2),{role:'ui-secondary',cols});
      drawPromptParts(2,rows-2,parts.slice(2),{role:'ui-secondary',cols});
    } else {
      const w=promptPartsWidth(parts);
      drawPromptParts(Math.max(2, cols - w - 2), rows-2, parts, {role:'ui-secondary',cols});
    }
  }

  const playback=PB.playbackSnapshot();
  if(playback)drawPlaybackOverlay({
    snapshot:playback,cols,rows,roomTitle:roomLabel(playback.roomId),
    takeNumber:Math.max(0,TARGETS.indexOf(playback.roomId)+1),
  });

  const monitorY=cols<72?rows-5:rows-4;
  const monitor=monitorDisplaySnapshot();
  drawVfdMeter(11, monitorY, 12, monitor,{theme:'green',bandThresholds:MONITOR.MONITOR_DANGER_THRESHOLDS});
  uiText(2, monitorY, 'MONITOR', 'ui-label');
  drawVfdWarningTriangle(25,monitorY,monitor);
  if(performance.now()<dockCommandUntil){
    const pulse=.58+.42*Math.abs(Math.sin(performance.now()/92));
    drawVfdText(28,monitorY,'COME CLOSER',{scale:.72,theme:'danger',alpha:pulse});
  }
  drawMicTestOverlay(cols, rows);
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
      : held ? (instr?.silenced
        ? BINDINGS.promptLine(['RETURN TO RECORDER', { action: 'recorder', label: 'RESUME' }])
        : BINDINGS.promptLine(['SOURCE ACTIVE', { action: 'interact', label: 'SILENCE' }]))
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
  const interference=personalInterference.active();
  if(interference && getSave().settings?.personalInterference?.vfdText !== false){
    const msg=String(interference.text||'').toUpperCase().slice(0, Math.max(12, body.w - 2));
    uiCenter(by+11, msg, interference.tone || 'ui-danger');
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
    spawnPresenceHabitable:()=>spawnBuildingPresence(),
    placePresence:(x,y)=>{ const st=PRES.presenceState(); st.active=true; st.x=x; st.y=y; },
    solid:(x,y)=>solidAt(x,y),
    plan:()=>({loaded:FP.isLoaded(), ...FP.planSize()}),
    map:()=>currentFacilityMapModel(),
    mapSource:()=>currentFacilityMapSource(),
    mapContact:()=>HUSH_MAP_TELEMETRY.snapshot(),
    natatoriumWater:()=>currentNatatoriumWaterRenderState({audio:0}),
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
    chunkSurf:()=>({
      available:chunkSurfAvailable(),
      mandatory:chunkSurfMandatory(),
      completed:chunkSurfCompleted(),
      bestEligible:flagTest(CHUNK_SURF_FLAGS.bestEligible),
      offered:flagTest(CHUNK_SURF_FLAGS.offered),
      entered:flagTest(CHUNK_SURF_FLAGS.entered),
      ...(chunkSurfRuntime?.probe?.()||normalizeChunkSurfState(getSave().chunkSurf)),
      exitSnapshot:sourceExitSnapshot,
    }),
    chunkSurfStart:()=>beginChunkSurf({forced:true}),
    sourcePreset:(preset=CHUNK_SURF_GOD_PRESET.HALL_ENTRY)=>{ godEnterSourcePreset(preset); return window.__probe.chunkSurf(); },
    stairAnomaly:()=>usingStairAnomaly()?{
      active:true,environment:stairAnomalyRuntime.environment,ledger:stairAnomalyRuntime.state(),player:stairAnomalyRuntime.player(),
      lights:stairAnomalyRuntime.lightRig(performance.now()/1000,{reducedFlash:(getSave().settings?.flash||'full')!=='full'}),
      shadowOnly:stairAnomalyRuntime.propInstances({reducedDread:!!getSave().settings?.reduceDread}).filter((entry)=>entry.shadowOnly).length,
    }:{active:false,environment:currentStairAnomalyEnvironment(),ledger:currentStairAnomalyLedger()},
    stairAnomalyPreset:(stage=0,reduced=false)=>stairAnomalyProbePreset(stage,reduced),
    testRun:()=>{ godEnsureTestRun(); return true; },
    godWarpDock:()=>godWarpToZone(ZONE.dock),
    dockHaunting:()=>({
      active:!!dockHauntingScene,
      frame:dockHauntingFrame?{...dockHauntingFrame}:null,
      departed:flagTest('dock.departed'),
      spent:flagTest('dock.haunting.spent'),
      variant:getSave().flags?.['dock.haunting.variant']||null,
      staging:dockHauntingStagingPoint?{...dockHauntingStagingPoint}:null,
      persisted:normalizeDockHauntingState(getSave().dockHaunting),
      transit:{...dockTransit},
    }),
    interactionFocus:()=>{
      const focus=usingPlan()&&!usingSpecialSpace()?worldInteractionFocus():{prop:null,door:null,doorWins:false};
      return{propId:focus.prop?.id||null,doorId:focus.door?.portal?.id||null,doorWins:!!focus.doorWins};
    },
    lookProfile:()=>activeLookProfile,
    chapelTower:()=>({
      ...chapelTowerState(),
      ...chapelTowerDiagnostics(),
      runtimeState:bellTowerRuntime?.state?.()||'idle',
      scoreSection:bellTowerRuntime?.snapshot?.().scoreSection||null,
      scoreRow:bellTowerRuntime?.snapshot?.().scoreRow??-1,
      transitionProgress:sourceTowerTransition?.progress?.()??0,
      activeBellAngles:bellTowerRuntime?.snapshot?.().activeBellAngles||[],
      collisionEnabled:bellTowerCollisionEnabled,
      bellPivots:FP.isLoaded()?towerBellLayout().map((bell)=>({id:bell.id,...bell.pivot,visualScale:bell.visualScale})):[],
      audio:bellTowerAudio?.snapshot?.()||null,
    }),
    doors:()=>FP.doorState().map((door)=>({
      id:door.id,archetype:door.archetype,state:door.state,openFraction:door.openFraction,
      leafCount:door.leafCount,aperture:{...door.aperture},hinge:door.hinge,swing:door.swing,
      closer:door.closer,key:door.keyId,wedgeState:door.wedge,acousticLossDb:door.acousticLossDb,
    })),
    openCredits:()=>{ openCredits(); return true; },
    endingCredits:(endingId='sacrifice')=>{
      const summary=commitReturn(endingId,{rec:REC.saveRecState()});
      openEndingCredits(summary);
      return summary;
    },
    cell:(x,y)=>activeGeometry()?.cellAt(x,y),
    materialAt:(x,y)=>activeGeometry()?.materialAt(x,y),
    canStep:(ax,ay,bx,by)=>usingSpecialSpace()?activeGeometry()?.canStep(ax,ay,bx,by):FP.canStep(ax,ay,bx,by,{keys:playerKeys}),
    props:()=>({pack:R3.r3dPropStats(),instances:PROPS.allProps().map((p)=>({id:p.id,mesh:p.mesh,x:p.x,y:p.y,zone:p.zone,blocks:p.blocks})),learned:PROPS.learnedPlayable().map((p)=>p.id)}),
    performance:()=>perfMeter.snapshot(),
    performanceReset:()=>{perfMeter.reset();return true;},
    surfaceDream:()=>R3.r3dSurfaceDreamStats(),
    surfaces:()=>R3.r3dSurfaceStats(),
    pickProp:()=>focusedWorldProp(2),
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
    setTorch:(value)=>{
      const wanted=!!value;
      if(REC.lightOn()!==wanted&&(!wanted||REC.batteryLevel()>0))REC.toggleLight();
      return{on:REC.lightOn(),battery:+REC.batteryLevel().toFixed(3)};
    },
    setTorchBattery:(value)=>{
      const target=Math.max(0,Math.min(2,Number(value)||0));
      if(target<=0)REC.killTorch();
      else REC.addBattery(target-REC.batteryLevel());
      return{on:REC.lightOn(),battery:+REC.batteryLevel().toFixed(3)};
    },
    setFear:(v)=>{ fear=Math.max(0,Math.min(1,Number(v)||0)); return fear; },
    bumpFear:(a)=>bumpFear(Number(a)||0),
    takeMe:()=>beginTaken(),
    hushContact:()=>beginHushContactFlash({taken:false,reason:'probe-contact',intensity:1}),
    hushWarning:(seed=4417)=>openHushSensation(HUSH_SENSATION_MODE.PROXIMITY,{seed:Number(seed)||4417}),
    hushBrush:(seed=4417)=>openDebugHushBrush(seed),
    // Visual-only brush opener for smoke coverage. The release/hard paths above
    // use openDebugHushBrush so they still exercise a real deferred contact
    // attempt; reduced-dread only needs the authored brush scene and lens profile.
    hushBrushVisual:(seed=4417)=>{
      if(usingSpecialSpace()||hushSensationMode)return false;
      return openHushSensation(HUSH_SENSATION_MODE.BRUSH,{seed:Number(seed)||4417,attempt:null});
    },
    hushDecision:(roll=.1,seed=.5,takeBreak=false)=>chooseHushContactExperience(
      hushContactContext({takeBreak:!!takeBreak,dialogueEligible:true}),
      {rng:(()=>{const values=[Number(roll)||0,Number(seed)||0];return()=>values.shift()??0;})()},
    ),
    hushSensation:()=>({mode:hushSensationMode,debug:hushSensationDebug,pending:PRES.pendingContactAttempt(),director:PRES.contactDirectorState()}),
    hushBody:()=>R3.r3dHushBodyStatus?.()||null,
    hushChoice:(index=0)=>chooseHushSensationDebug(index),
    setRecording:(wanted=true)=>{
      if(wanted&&!REC.isRecording()){
        if(!REC.isListening())REC.startListening();
        REC.startRecording();
      }else if(!wanted){
        if(REC.isRecording())REC.stopRecording();
        if(REC.isListening())REC.stopListening();
      }
      return{recording:REC.isRecording(),listening:REC.isListening()};
    },
    sourceContact:()=>{
      if(!usingSourceSpace())return false;
      onSourcePresenceCatch();
      return{source:chunkSurfRuntime.state(),presence:PRES.savePresenceState(),position:{x:px,y:py}};
    },
    itemLost:(id)=>itemLost(id),
    warpToLost:()=>{ if(!lostAt) return false; px=lostAt.x; py=lostAt.y; trail=[]; revealAround(px,py); return true; },
    escapeWarp:()=>{ if(!escape) return false; const wp=escape.stage==='door'?escape.doorCell:escape.rescueCell; px=wp.x; py=wp.y; trail=[]; revealAround(px,py); return escape.stage; },
    setFlags:(arr)=>flagApply(arr||[]),
    flag:(k)=>flagTest(k),
    him:()=>himIdx,
    // The plan is authored in cells; the player lives in runtime metres. A suite
    // that wants to stand in the chapel should say so in the language of the map.
    warpCell:(x,y,f=null)=>{ godRestoreBuildingWorld();const r=FP.toRuntimePoint({x,y});px=r.x;py=r.y;if(f!=null)R3.r3dSetFacing(f);renderMove=null;motionRig=null;trail=[];revealAround(px,py);godSyncBuildingRender();return{x:px,y:py,facing:R3.r3dFacing()}; },
    look:(yawDelta=0,pitchDelta=0)=>R3.r3dLook?.(yawDelta,pitchDelta),
    lookAngles:()=>R3.r3dLookAngles?.()||null,
    stepDelta:(sign=1)=>R3.r3dStepDelta?.(sign)||null,
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
    clearDiagnosticScenes:()=>{
      while(scenes.depth()) scenes.pop();
      // Diagnostic scene removal bypasses a conversation's normal onDone. Do
      // not leave the repeat-contact guard or a deferred attempt stranded just
      // because a smoke harness cleared the overlay out of band.
      if(pendingHushBrush?.attempt?.id)PRES.releaseContactAttempt(pendingHushBrush.attempt.id);
      hushSensationMode=null;hushSensationScene=null;pendingHushBrush=null;
      takenActive=false;
      setGameplayPaused(false,{announce:false});
      resetMotionInput('probe-clear-scenes',{stopRenderMove:true});
      return true;
    },
    godMenu:(tab=null)=>{
      if(scenes.top()?.id!=='god-menu')openGodMenu();
      const scene=scenes.top();
      if(scene?.id!=='god-menu')return null;
      const wanted=tab==null?null:String(tab);
      for(let i=0;wanted&&scene.view?.()?.tab!==wanted&&i<20;i++){
        scene.key?.({key:'e',code:'KeyE',preventDefault(){}});
      }
      return scene.view?.()||null;
    },
    closeGodMenu:()=>{
      if(scenes.top()?.id==='god-menu')closeGodMenu();
      return scenes.top()?.id!=='god-menu';
    },
    read:()=>interact(),
    lensPreset:(n)=>!!applyLensPreset(n),
    typing:()=>STORY.typingState(),
    audio:()=>({ ...STORY.audioState(), actx: actx ? actx.state : 'none',
      buses:{global:outGain?.gain.value??null,dialog:dialogGain?.gain.value??null,sfx:sfxGain?.gain.value??null,direct:sfxDirectGain?.gain.value??null,music:musicGain?.gain.value??null},
      mic:{state:MIC.micState(),level:MIC.micLevel(),maySpoil:MIC.micMaySpoil()},
      monitor:MONITOR.monitorSnapshot(), recovery:audioRecovery?.snapshot?.()||null }),
    audioSuspend:()=>actx?.suspend?.(),
    audioRecover:(reason='probe')=>recoverInteractionAudio(reason),
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
    think:(id)=>{ if(id==='hush')return openHushSensation(HUSH_SENSATION_MODE.PROXIMITY,{seed:4417});
      const T={'post-door':POST_DOOR,'level-check':LEVEL_CHECK,'first-take':FIRST_TAKE,
                           'radio-dead':RADIO_DEAD,'bent-rig':BENT_RIG,
                           talisman:TALISMAN}[id];
      return !!(T && think(id, T, {force:true, startAt: id==='post-door' ? (prologueKnowledgeFrame()||'self') : 'start'})); },
    speech:()=>{ const s=SPEECH.speaking(); return s && {who:s.who, text:s.text}; },
    hush:()=>SPEECH.clearSpeech(),
    tut:()=>({active:TUT.tutorialActive(), step:TUT.tutorialStep(), prompt:TUT.tutorialPrompt()}),
    tutSkip:()=>TUT.skipTutorial(),
    // Start the setup on demand, so a suite can test the dock flow without
    // walking the whole cold open first.
    tutStart:()=>{ TUT.startTutorial(); return TUT.tutorialStep(); },
    tutGuide:(surface)=>TUT.tutorialGuide(surface||null),
    build:()=>combatBuild(),
    flagValue:(name)=>flagGet(name)??null,
    // The grey door, as numbers: is it still a door, is there a scar where it
    // was, is the wall solid, and is he close enough to reach for it.
    greyDoor:()=>{
      let portal=null; FP.forEachDoor((p)=>{ if(p.id===GREY_DOOR_ID) portal=p; });
      const scar=FP.sealedDoorways().some((s)=>Math.abs(s.cx-130.5)<.6&&Math.abs(s.cy-6.5)<.6);
      return { id:GREY_DOOR_ID, present:!!portal, retired:greyDoorRetired(), scar,
               solid:FP.isSolid(130,6)&&FP.isSolid(131,7), near:!!greyDoorNear() };
    },
    // Battle voices, as counts: a fight that has ended must leave none behind.
    cueGroup:(name)=>CUES.cueGroupSize(name||'battle'),
    liveCues:()=>CUES.liveCueCount(),
    resetAudio:(reason)=>{ resetRunAudio(reason||'probe'); return CUES.liveCueCount(); },
    // Which rooms the recorder and the tape actually believe they hold. The dock
    // level check must appear in neither as `main_b3`.
    hasTake:(room)=>REC.hasTake(room),
    takeFor:(room)=>{ const t=PB.takeFor(room); return t && { roomId:t.roomId, sealed:t.sealed }; },
    fire:(id,shape)=>fireCue(id, shape||null),
    stopBattleCues:()=>CUES.stopCueGroup('battle', .05),
    screamShape:()=>enemyAttackShape(SCREAM_CUE, 0, ()=>0.5),
    weaponShape:(beat)=>enemyAttackShape('marimba.weapon.01', Number(beat)||0),
    cueLoaded:(id)=>{ const u=cueAssetUrl(id); return u ? CUES.isLoaded(u) : null; },
    cueDurations:(ids)=>Object.fromEntries((ids||[]).map((id)=>{
      const u=cueAssetUrl(id); return [id, u ? (CUES.bufferSeconds(u) ?? null) : null];
    })),
    mischiefFire:()=>{ mischiefNextAtMs=1; mischiefQuietUntilMs=0; return true; },
    busts:()=>({spoken:[...spokenBusts],turned:bustTurned}),
    talkToBust:(id)=>talkToBust(id),
    // Light state, for the lighting harness: the torch and the resolved rig for
    // where you are standing.
    light:()=>{
      const physical=FP.logicalToPhysical(px,py);
      const context=resolveLightingContext({group:physical?.renderGroup,zone:FP.zoneAt(px,py),spaceId:physical?.spaceId});
      return{on:REC.lightOn(),battery:+REC.batteryLevel().toFixed(3),context,
        rig:resolveLocalLights(context,{
          timeSec:performance.now()/1000,towerCleared:false,liveCircuits:liveLightCircuits(),
          origin:{x:physical.x*CELL,z:physical.z*CELL},anchorPosition:lightAnchorPosition,
        }).map((l)=>({id:l.id,intensity:+l.intensity.toFixed(3),circuit:l.circuit||null}))};
    },
    power:()=>normalizePowerState(getSave().power),
    setPower:(circuit,live=true)=>{
      const before=normalizePowerState(getSave().power);
      const wanted=!!live;
      const isLive=before.live.includes(circuit);
      const next=isLive===wanted?before:togglePowerCircuit(before,circuit,{at:Date.now()}).state;
      saveCommit({power:next});
      godSyncBuildingRender();
      updateElectricalHum();
      return normalizePowerState(getSave().power);
    },
    electricalHum:()=>({...electricalHumFrame}),
    garden:()=>({epoch:gardenEpoch,layout:gardenLayoutId,inside:inTheGarden(),watch:{...gardenWatch},
      poses:GARDEN_DRIFT_PROPS.map((id)=>{const q=PROPS.propById(id);return q?{id,ox:+(q.renderOffsetX||0).toFixed(4),oz:+(q.renderOffsetZ||0).toFixed(4),yaw:+(q.yaw||0).toFixed(4),rx:q.rx,ry:q.ry}:null;})}),
    shiftGarden:(reason='probe')=>shiftGarden(reason),
    mischiefAt:(dx,dy)=>{ mischiefHeard={x:px+(Number(dx)||0),y:py+(Number(dy)||0),at:performance.now()}; return recentMischief(); },
    // Headless Chrome keeps rAF running with the tab hidden, so a suite cannot
    // produce a real away-gap. This is the same call the long-frame path makes.
    awayGap:(ms)=>{ settleAfterAway(Math.max(0, Number(ms)||0)); return true; },
    micCheck:()=>micCheck && { elapsed:+micCheck.elapsed.toFixed(2), peak:+micCheck.peak.toFixed(4),
                               spoke:+micCheck.spoke.toFixed(2), ack:micCheck.ack },
    // Drive a battle without recording two takes to get to it.
    battle:(named)=>{ ensureCtx(); openBattle(natatoriumBattle(!!named),
      { onWin:()=>{}, onLose:()=>{} }); return true; },
    battleId:(id, named)=>{ const F={
      natatorium:natatoriumBattle,
      practice:practiceBattle,
      hall:hallBattle,
      source:()=>sourceCombatBattle(),
      chapel:()=>chapelBoss({kind:'nothing'}),
    }[id||'natatorium'];
      if(!F) return false; ensureCtx(); openBattle(F(!!named), { onWin:()=>{}, onLose:()=>{} }); return true; },
    battleTraining:(bare)=>{ ensureCtx(); openTrainingBattle({withDirector:!bare}); return true; },
    // Lens probes: drive a possession by hand and read what the boil is doing.
    possess:(profileId,seconds)=>{ possess(profileId||'rupture',Number(seconds)||3); return true; },
    boil:()=>({ ...(R3.r3dSurfaceDreamStats?.()||{}), lens:window.__diffusion?.stats||null }),
    battleAbort:()=>godAbortBattle(),
    playbackDialog:(room)=>{ maybePlaybackDialog(room); return scenes.top()?.id||null; },
    battleState:()=>{ const v=scenes.top()?.battleView?.(); return v||null; },
    coldOpen:()=>{godColdOpen();return true;},
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
  window.__chunkParity=()=>({
    launch: runtimeSnapshot(),
    renderer: RENDERER,
    lens: { enabled: !!window.__diffusion, stats: window.__diffusion?.stats || null, disabled: lensDisabled },
    storageKind: currentStorage()?.kind || null,
    save: { area:getSave()?.area||null, hasRun:!!getSave()?.run, runStatus:getSave()?.run?.status||null, steps:getSave()?.steps||0, takes:[...(getSave()?.takes||[])] },
    profile: { endingsSeen:[...(getMeta()?.endingsSeen||[])], achievements:Object.keys(getMeta()?.achievements||{}).sort(), runs:getMeta()?.runs||0 },
    natatoriumWater: {
      active:natatoriumWaterActive(),
      environment:getSave()?.run?.environment||null,
      ledger:getSave()?.run?.ledger?.natatoriumWater||null,
      basin:natatoriumBasinBounds,
      ripples:currentNatatoriumWaterRenderState({audio:0}).rippleSources?.length||0,
    },
    settings: { ...getSave().settings },
    screen: scenes.top()?.id || (inRogue ? 'game' : 'boot'),
    sceneView: scenes.top()?.view?.() || null,
    viewport: { innerWidth:window.innerWidth, innerHeight:window.innerHeight, dpr:window.devicePixelRatio||1, canvas:{ width:MAP_EL?.width||0, height:MAP_EL?.height||0 } },
    audio: { story:STORY.audioState(), actx:actx ? actx.state : 'none', monitor:MONITOR.monitorSnapshot() },
    build: params().get('build') || 'LOCAL',
  });
}


function enterJustSurf(){
  stopHushAudioRuntime();
  sampleFieldEnabled=true;
  storyMode=false;
  STORY.stopAll();
  setGameChrome(false);
  ensureCtx();
  startAmbientDroneAt(currentAmbientTarget());
  pushEvent('// just surf. no story. the field is the field.');
}

async function bootScenes(){
  window.__scenes=scenes;
  installProbe();
  try{ MAP_EL.setAttribute('tabindex','0'); MAP_EL.focus({preventScroll:true}); }catch(_){}
  const qp=params();
  await saveLoadAsync({ gameVersion: qp.get('build') || 'LOCAL' });
  progressionInit({build:qp.get('build') || 'LOCAL'});
  syncControllerSettingsFromSave();
  const displaySettings=currentDisplaySettings();
  applyDisplayCssVars(displaySettings);
  applyRenderScale(displaySettings.renderScale);
  applyPixelMeshSettings();
  installViewportGuard({allowUpscale:true});
  refreshStageLayoutSoon();
  { const vs=getSave().settings?.vfd; if(vs) applyVfdSettings(vs); }
  terrorInit();
  uiInit(MAP_EL);
  uiSetScale(displaySettings.uiScale);
  scenes.scenesInit({ applyLookProfile, applyLensPreset });

  // The shipped 3D renderer and its material-bank upload target must exist
  // before calibration completes. Do not make the native game wait for a
  // threshold of retired 2D audio samples before it can render, pause, or
  // accept a complete generated bank.
  if(RENDERER==='3d' && !inRogue) enterRogue();
  // The authored facility is part of the critical boot payload, not a lazy
  // gameplay enhancement. Starting a run before this import completed made
  // navigation fall back to an unresolved/legacy-looking map for the opening
  // seconds (and indefinitely if the import failed). Calibration and credits
  // now remain ahead of the title until the real plan is resident.
  if(RENDERER==='3d') await loadBuilding();

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

  const afterCredits=()=>{
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
    const pending=pendingReturnReport();
    scenes.push(makeTitle({wantFullscreen}));
    if(pending)showReturnReport(pending);
  };
  // `?firstinstall=1` is a Vite-only visual lab for the release screen; the
  // production browser path cannot impersonate a native payload installation.
  const firstInstall=(IS_TAURI && getMeta().lensRuntimeReady!==LENS_RUNTIME_MARKER)
    || (import.meta.env?.DEV && qp.has('firstinstall'));
  const afterCalibration=()=>{
    if(firstInstall){
      metaCommit({lensRuntimeReady:LENS_RUNTIME_MARKER,lensRuntimeReadyAt:Date.now()});
    }
    // Every launch gets the authored opening. Debug/lab destinations may change
    // what follows it, never the calibration -> credits ordering.
    scenes.push(makeOpeningCreditsScene({onDone:afterCredits}));
    syncPlatform().catch(()=>{});
  };
  const activateStartupBank=async(lens)=>{
    if(!lens)throw new Error('critical diffusion service unavailable');
    await lens.ready;
    const bank=lens.stats?.criticalBank||'calm';
    if(!await lens.activateBank?.(bank,{transitionMs:0}))throw new Error('startup materials could not be activated');
    return lens;
  };
  const calibrate=async()=>activateStartupBank(await requireLensStarted(qp));
  const pushCalibration=()=>scenes.push(makeLensCalibrationScene({
    start:calibrate,
    retry:async()=>{
      const lens=window.__diffusion;
      if(!lens?.retry)return calibrate();
      await lens.retry();
      return activateStartupBank(lens);
    },
    onReady:afterCalibration,
    onQuit:requestQuitDesktop,
    firstInstall,
    minimize:minimizeNativeWindow,
    restore:restoreNativeWindow,
  }));
  // The bundled model licence has to be accepted before the weights are asked
  // to do anything. Calibration is that moment, so the gate stands in front of
  // it — and only once per licence version per installation.
  if(!eulaAccepted(getMeta(),EULA_TEXT)){
    scenes.push(makeEulaScene({
      onAccept:(version)=>{
        metaCommit({eulaAccepted:version,eulaAcceptedAt:Date.now()});
        pushCalibration();
      },
      onDecline:requestQuitDesktop,
    }));
    return;
  }
  pushCalibration();
}


// ── Diffusion lens bootstrap (dev + demo) ─────────────────────────────────────
const LOCAL_LENS_DEFAULT='ws://127.0.0.1:8000';
let lensStarting=null;
let lensDisabled=false;
let lensBlockedEulaLogged=false;
function lensEulaAccepted(){
  return eulaAccepted(getMeta(),EULA_TEXT);
}
function lensStartBlockedByEula(){
  return !lensEulaAccepted();
}
function localLensEndpoint(raw){
  try{
    const u=new URL(raw||LOCAL_LENS_DEFAULT, location.href);
    const loopback=u.hostname==='127.0.0.1'||u.hostname==='localhost'||u.hostname==='[::1]'||u.hostname==='::1';
    if(!loopback || (u.protocol!=='ws:'&&u.protocol!=='wss:')) return null;
    return u.toString();
  }catch(_){ return null; }
}
async function resolveLensConfig(qp){
  // An explicit loopback endpoint is the strongest development/test signal.
  // It must not be shadowed by the one-command runner's default port.
  if(import.meta.env?.DEV && qp.get('diffusion')){
    const explicit=localLensEndpoint(qp.get('diffusion'));
    if(!explicit)throw new Error('diffusion endpoint must be a loopback WebSocket');
    return {url:explicit,ownedByShell:false};
  }
  // Native development uses the same separately launched loopback service as
  // browser development. Production never receives this Vite-only variable
  // and therefore remains owned, authenticated, and hard-gated by Tauri.
  const configuredDevUrl=import.meta.env?.VITE_LENS_DEV_URL;
  const devUrl=import.meta.env?.DEV && configuredDevUrl ? localLensEndpoint(configuredDevUrl) : null;
  if(devUrl) return {url:devUrl,token:import.meta.env?.VITE_LENS_DEV_TOKEN||'',ownedByShell:false};
  if(IS_TAURI){
    const {bootstrapNativeLens}=await import('./platform/lens-service.js');
    return {...await bootstrapNativeLens(),ownedByShell:true};
  }
  if(qp.get('diffusion')){
    const url=localLensEndpoint(qp.get('diffusion'));
    if(!url){ console.warn('remote diffusion endpoint rejected — the lens is local-only'); return null; }
    return {url};
  }
  if(qp.get('lens')==='0' || qp.has('nodiffusion')) return null;
  const localPage=IS_TAURI||location.hostname==='127.0.0.1'||location.hostname==='localhost'||location.hostname==='[::1]'||location.hostname==='::1';
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
  if(window.__diffusion)return window.__diffusion;
  const cfg=await resolveLensConfig(qp);
  if(!cfg?.url)throw new Error('critical diffusion endpoint unavailable');
  const [diffusionModule={},presetsModule={}] = await Promise.all([
    import('./net/diffusion.js'),import('./net/lens-presets.js'),
  ]);
  const {surfaceDiffusionStart}=diffusionModule;
  const {LOOK_PROFILES={},profileBankRecipes}=presetsModule;
  if(!surfaceDiffusionStart||!profileBankRecipes)throw new Error('look profile modules unavailable');
  window.__lookProfiles=LOOK_PROFILES;
  window.__lensPresets=presetsModule.PRESETS||{};
  window.__diffusion=surfaceDiffusionStart({
    url:cfg.url,token:cfg.token,
    restartService:cfg.ownedByShell?async()=>{
      const {bootstrapNativeLens}=await import('./platform/lens-service.js');
      return bootstrapNativeLens({restart:true});
    }:null,
    sourceUrl:assetUrl('assets/surfaces/surface-albedo.jpg'),
    // The authored relief of every material, so the depth ControlNet conditions
    // generated tiles on the geometry the PBR pass is already lighting.
    heightUrl:assetUrl('assets/surfaces/surface-height.png'),
    profiles:profileBankRecipes(),
    beginBank:(bankId,frames)=>R3.r3dBeginSurfaceDreamBank?.(bankId,frames),
    applySurface:(slot,frame,image,mix)=>R3.r3dSetSurfaceDream(slot,frame,image,mix),
    commitSurfaces:(mix,options)=>R3.r3dCommitSurfaceDream(mix,options),
    // Possession bursts: the rendered room and the exact depth the engine
    // marched for it, welded into one message.
    captureBurstFrame:async(size)=>{
      const scene=R3.r3dCaptureSceneCanvas?.(size);
      if(!scene)return null;
      const depth=R3.r3dDepthCanvas?.(size);
      const encode=(canvas)=>new Promise((resolve)=>canvas.toBlob(
        (blob)=>resolve(blob?blob.arrayBuffer():null),'image/jpeg',0.86));
      const [frame,depthBytes]=await Promise.all([encode(scene),depth?encode(depth):null]);
      return frame?{frame,depth:depthBytes||null}:null;
    },
    applyBurst:(image)=>{ if(image)R3.r3dSetBurstFrame?.(image); else R3.r3dEndBurst?.(); },
    onStatus:(s)=>{
      if(s.server?.type==='status')console.info('diffusion server:',JSON.stringify(s.server));
      if(s.state==='error')console.error('diffusion calibration:',s.error);
    },
  });
  setLocalDiffusionActive(true);
  return window.__diffusion;
}
function ensureLensStarted(qp=params(), {quietBlocked=false}={}){
  if(lensStartBlockedByEula()){
    if(!quietBlocked && !lensBlockedEulaLogged){
      console.info('diffusion lens blocked until EULA acceptance');
      lensBlockedEulaLogged=true;
    }
    return null;
  }
  if(window.__diffusion) return window.__diffusion;
  if(lensStarting) return lensStarting;
  lensStarting=startLens(qp)
    .catch((err)=>{
      console.error('lens start failed', err);
      lensDisabled=true;
      throw err;
    })
    .finally(()=>{ lensStarting=null; });
  return lensStarting;
}
async function requireLensStarted(qp=params()){
  const lens=await ensureLensStarted(qp);
  if(!lens)throw new Error('model licence must be accepted before lens startup');
  return lens;
}

function visibleMaterialSlotsAt(x,y){
  if(!usingPlan())return visibleSurfaceSlots([MATERIAL.serviceConcrete]);
  const materialAt=usingSpecialSpace()
    ? (mx,my)=>activeGeometry().materialAt(mx,my)
    : (mx,my)=>FP.materialAt(mx,my);
  const [fx,fy]=R3.r3dDelta(1);
  const offsets=[[0,0],[fx,fy],[-fy,fx],[fy,-fx],[-fx,-fy]];
  return visibleSurfaceSlots(offsets.map(([dx,dy])=>materialAt(x+dx,y+dy)));
}

function render3d(){
  ensureLensStarted(params(),{quietBlocked:true});
  const worldView=scenes.worldView(),viewX=worldView?.x??px,viewY=worldView?.y??py;
  const physical=usingSpecialSpace()?activeGeometry().logicalToPhysical(viewX,viewY):usingPlan()?FP.logicalToPhysical(viewX,viewY):{x:viewX,z:viewY,y:worldView?.floorH??floorHere(),renderGroup:''};
  const rendered=worldView?{x:physical.x,z:physical.z}:renderedPlayerPoint();
  const slice=usingSpecialSpace()?activeGeometry().renderPlanFor(viewX,viewY):usingPlan()?FP.physicalRenderPlanFor(viewX,viewY):null;
  const sliceKey=usingSourceSpace()&&slice?`source:${slice.key}`:usingStairAnomaly()&&slice?`stair:${slice.key}`:slice?.key;
  if(slice&&sliceKey!==r3dCache.physicalKey){
    if(usingSourceSpace())syncSourceRender({force:true});
    else if(usingStairAnomaly())syncStairAnomalyRender({force:true});
    else{R3.r3dSetPlan(slice.rgba,slice.w,slice.h,slice.material);r3dCache.physicalGroup=slice.group;r3dCache.physicalKey=slice.key;r3dCache.fogSize=-1;R3.r3dSetProps(worldRenderInstances(slice.group));}
  }
  // Emergency lamps are a small dynamic layer. Their cadence, emissive glass,
  // and occasional architecture-projected figure update every render frame;
  // static room geometry and the prop pack remain cached.
  if(usingPlan()&&!usingSpecialSpace())syncArchitecturalLocalLights(physical.renderGroup,{logicalX:viewX,logicalY:viewY});
  if(fog.size!==r3dCache.fogSize){
    if(usingSpecialSpace())R3.r3dUpdateFog(()=>2,physical.x,physical.z);
    else if(usingPlan())R3.r3dUpdateFog((fx,fy)=>{const l=FP.logicalAtPhysical(fx,fy,{group:physical.renderGroup,floor:physical.y});return l?fogGet(l.x,l.y):0;},physical.x,physical.z);
    else R3.r3dUpdateFog(fogGet,px,py);
    r3dCache.fogSize=fog.size;
  }
  let voiceSum=0;
  for(const [,v] of voices) voiceSum+=v.target||0;
  const firstKey=keyMap.size>0 ? keyMap.values().next().value : null;
  const mapPoint=(p)=>{if(!p||!usingPlan()||usingSpecialSpace())return p;const q=FP.logicalToPhysical(p.x,p.y);return{...p,x:q.x,y:q.z};};
  const waterAudio=clamp(voiceSum/3, 0, 1);
  const presenceVisible=!worldView?.suppressActors&&!usingSpecialSpace()&&storyMode&&PRES.isActive()
    &&chapelTowerState().phase!==CHAPEL_TOWER_PHASE.TOWER_ACTIVE;
  const absence=presenceVisible
    ? hushAbsenceLook({active:true,field:hushFieldFrame,dread:PRES.dread(px,py)})
    : null;
  const renderedHush=presenceVisible
    ? {...mapPoint({x:PRES.presenceState().x,y:PRES.presenceState().y}),strength:absence.strength,radiusM:absence.radiusM}
    : (!worldView?.suppressActors&&!usingSpecialSpace()&&hush.active
      ? {...mapPoint({x:hush.x,y:hush.y}),strength:1,radiusM:6.4}
      : null);
  const baseTorchLook=resolveTorchLook({
    on:storyMode?REC.lightOn():true,
    battery:storyMode?REC.batteryLevel():1,
    timeSec:performance.now()/1000,
    reducedEffects:(getSave().settings?.flash||'full')!=='full',
  });
  const torchLook=storyMode
    ? applyHushTorchInterference(baseTorchLook,hushFieldFrame)
    : baseTorchLook;
  R3.r3dFrame({
    px:rendered.x, py:rendered.z,
    tileW:WORLD_TILE_W, tileH:WORLD_TILE_H,
    worldCount:worldsConfig.length,
    worldTints:worldsConfig.map(w=>R3.WORLD_RGB[w.id]||[0.6,0.6,0.6]),
    chunks:worldView?.suppressActors||usingSpecialSpace()?[]:r3dNearChunks().map(mapPoint),
    key:worldView?.suppressActors||usingSpecialSpace()?null:mapPoint(firstKey),
    door:worldView?.suppressActors||usingSpecialSpace()?null:mapPoint(door),
    hush:renderedHush,
    hushBodyAllowed:!worldView?.suppressActors&&!usingSpecialSpace(),
    audio:waterAudio,
    light:storyMode?REC.lightOn():true,
    torchLook,
    plan: usingPlan(),
    textSpace: sourceTextSpaceActive(),
    floorH: worldView?.floorH??(usingSpecialSpace()?activeGeometry().floorAt(viewX,viewY):usingPlan()?FP.floorAt(viewX,viewY):floorHere()),
    moveIntervalMs:currentMoveIntervalMs(),
    water:usingSpecialSpace()?{active:false}:currentNatatoriumWaterRenderState({audio:waterAudio}),
  });
  // How hard the world boils: the dread the player is under, the coffee onset,
  // and whatever the last impact asked for. One number, three sources, and it
  // drives boil rate, generated structure, and phosphor excitation together.
  const agitationPulse=Math.max(0,(agitationPulseUntil-performance.now())/700);
  const dockEffectScale=(getSave().settings?.flash||'full')==='full'
    ?1:(getSave().settings?.flash||'full')==='reduced' ? .58 : .34;
  const dockAgitation=(dockHauntingFrame?.effectPressure||0)*dockEffectScale;
  R3.r3dSetAgitation?.(clamp(
    Math.max(dockAgitation,presentedFearPressure()*0.8 + (window.__lensOnset||0)*0.4 + agitationPulse*0.5),
    0,1,
  ));
  window.__diffusion?.tickMutation?.({
    now:performance.now(),
    allowed:!paused && !scenes.blocksWorld() && document.visibilityState!=='hidden',
    visibleSlots:visibleMaterialSlotsAt(viewX,viewY),
    performance:perfMeter.snapshot(),
    transitioning:!!R3.r3dSurfaceDreamStats?.().transitioning,
  });
}

// A hit, a scare, a phase break: a short spike of boil on top of standing dread.
let agitationPulseUntil=0;
function pulseAgitation(ms=700){
  agitationPulseUntil=Math.max(agitationPulseUntil,performance.now()+Math.max(0,ms));
}
// Short full-frame possession. Scenes and impacts ask for it by name; without a
// live sidecar or a profile that authors one, this is a no-op.
function possess(profileId,seconds=3){
  pulseAgitation(seconds*1000);
  window.__diffusion?.burst?.({profileId,seconds});
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
    try{
      R3.r3dInit(MAP_EL);
      applyPixelMeshSettings();
      applyLookProfile(activeLookProfile,{transitionMs:0,resetMemory:true});
    }catch(err){ console.error('r3d init failed', err); }
    disableOnboardingForSession();
    if(storyMode) loadBuilding();
    // ?at=x,y — debug spawn (M2 will generalise this to ?warp=<room>)
    const atParam=params().get('at');
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
    const qp=params();
    ensureLensStarted(qp,{quietBlocked:true});
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
const CONTROLLER_KEY=Object.freeze({
  move_up:['ArrowUp','ArrowUp'], move_down:['ArrowDown','ArrowDown'],
  move_left:['ArrowLeft','ArrowLeft'], move_right:['ArrowRight','ArrowRight'],
  quiet:['Shift','ShiftLeft'], light:['f','KeyF'], bag:['b','KeyB'], recorder:['r','KeyR'],
  interact:['e','KeyE'], playback:['p','KeyP'], mark:[' ','Space'], menu:['Escape','Escape'],
  // `tabNext` used to emit KeyE exactly like `interact`, which made "next
  // section" and "interact" indistinguishable — and `modalActions` injects
  // interact into menu context, so both meanings were live at once. Tab is
  // already the in-fiction step-back key and collides with nothing.
  //
  // `back` deliberately still emits Escape: every scene's close handler keys on
  // it, and scenes that need to tell back from menu read e.controllerAction,
  // which is present on every synthetic event.
  confirm:['Enter','Enter'], back:['Escape','Escape'], tabPrev:['q','KeyQ'], tabNext:['Tab','Tab'],
});
function controllerEvent(action, repeat=false){
  const [key,code]=CONTROLLER_KEY[action]||['',''];
  return {key,code,repeat,metaKey:false,ctrlKey:false,altKey:false,shiftKey:action==='quiet',target:null,
    preventDefault(){},stopPropagation(){},controller:true,controllerAction:action};
}
function controllerPress(action,repeat=false){ if(CONTROLLER_KEY[action]) onKey(controllerEvent(action,repeat)); }
function controllerRelease(action){ if(CONTROLLER_KEY[action]) onKeyUp(controllerEvent(action,false)); }
function movementKey(e){ return movementCodeForEvent(e); }
function movementRole(code){return keyboardCodeRole(code);}
function forwardHeld(){ return keysDown.has('ArrowUp') || keysDown.has('KeyW'); }
function leftHeld(){ return keysDown.has('ArrowLeft') || keysDown.has('KeyA'); }
function rightHeld(){ return keysDown.has('ArrowRight') || keysDown.has('KeyD'); }
function backHeld(){ return keysDown.has('ArrowDown') || keysDown.has('KeyS'); }
// A/D and ←/→ strafe now; nothing on the keyboard turns the body.
function turnHeldDir(){return 0;}
function tickIndependentLook(dt){
  if(RENDERER!=='3d'||paused||(scenes.blocksInput()&&!scenes.allowsLook())){motionInput.endFrame?.();return;}
  const controller=CONTROLLER.controllerMotionAxes();
  const turn=clamp(controller.turnX,-1,1),look=clamp(controller.lookY,-1,1);
  if(Math.abs(turn)>=.01||Math.abs(look)>=.01) R3.r3dLook(turn*dt*2.2,look*dt*1.55);
  // The mouse is a displacement, not a rate: it is already the distance the
  // hand moved this frame, so it must not be scaled by dt as well.
  const dx=Number(motionInput.pointerDx)||0, dy=Number(motionInput.pointerDy)||0;
  if(dx||dy){
    const sens=mouseLookSensitivity();
    R3.r3dLook(dx*sens*0.0048, -dy*sens*0.0048*(mouseInvertY()?-1:1));
  }
  motionInput.clearPointerDeltas?.();
}
function mouseLookSensitivity(){
  const raw=Number(getSave()?.settings?.mouseSensitivity);
  return Number.isFinite(raw)?Math.max(.2,Math.min(10,raw)):2.4;
}
function mouseInvertY(){return !!getSave()?.settings?.mouseInvertY;}
// Pointer lock is a gameplay-input lease. UI/menu state never captures it;
// live unblocked first-person gameplay can request it only from a user gesture.
function gameplayWantsPointerCapture(){
  return RENDERER==='3d'&&storyMode&&inRogue&&!paused&&(!scenes.blocksInput()||scenes.allowsLook());
}
function syncPointerMode(reason='sync'){
  return pointerMode.sync(reason);
}
function ensurePointerLock(reason='world-pointerdown'){
  // Windowed play was the broken case: requestPointerLock is rejected outright
  // when the document is not focused, and the click that focuses a windowed
  // app is frequently consumed by the window manager rather than reaching us
  // as a usable gesture. Take focus first, every time, then ask.
  ensureInteractionFocus();
  try{ if(typeof window!=='undefined' && !document.hasFocus?.()) window.focus?.(); }catch(_){}
  return pointerMode.requestCaptureFromGesture(reason);
}
function performQuarterTurn(dir, now=performance.now()){
  if(!dir || RENDERER!=='3d') return false;
  R3.r3dTurn(dir);
  const d=window.__diffusion;
  if(d?.nudge){
    d.setMoving(true);
    d.nudge({ turn: dir });
    clearTimeout(movingTimer);
    movingTimer=setTimeout(()=>d.setMoving(false), 320);
  }
  nextTurnAtMs=now+currentTurnIntervalMs({initial:true});
  return true;
}
function tickHeldTurning(now){
  if(RENDERER!=='3d') return;
  if(paused||scenes.blocksInput()){nextTurnAtMs=0;return;}
  const dir=turnHeldDir();
  if(!dir){nextTurnAtMs=0;return;}
  if(nextTurnAtMs<=0){nextTurnAtMs=now+currentTurnIntervalMs({initial:true});return;}
  if(now<nextTurnAtMs)return;
  performQuarterTurn(dir, now);
  nextTurnAtMs=now+currentTurnIntervalMs();
}
let lastKeyDebug='';
function onKey(e){
  if(KEY_DEBUG){
    lastKeyDebug=`key=${e.key} code=${e.code||'(none)'} meta=${e.metaKey?1:0} ctrl=${e.ctrlKey?1:0}`
      + ` | story=${storyMode?1:0} rec=${REC.isRecording()?1:0} scenes=${scenes.depth()} rogue=${inRogue?1:0}`;
  }
  if(e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  if(!e.controller) BINDINGS.setActiveInputDevice('keyboard');
  // A keypress IS a user gesture, so it is allowed to take the pointer lock. If
  // you are playing the game from the keyboard, the pointer belongs to the game:
  // recovering it here removes a whole class of "I have to click somewhere first"
  // states, without stealing the cursor from anyone typing (guarded above) or
  // from a scene that wants the mouse.
  if(!e.controller && !e.metaKey && !e.ctrlKey && !e.altKey) resumeGameplayInput('keydown',{recenter:false});
  if(!e.metaKey && !e.ctrlKey && !e.altKey && (e.key==='F10' || e.code==='F10')){
    e.preventDefault();
    openGodMenu();
    return;
  }
  if(IS_TAURI && isReservedDesktopShortcut(e)){
    e.preventDefault();
    handleReservedDesktopShortcut(e);
    return;
  }
  if(!e.repeat) recoverInteractionAudio('keydown');
  // Pause is a run-level command, including during authored dialogue and
  // cutscenes. It must be offered before a blocking scene swallows Escape.
  // Settings/God overlays own their own back behavior above an existing pause.
  const topSceneId=scenes.top()?.id;
  if(topSceneId==='pause'&&(e.key==='Escape'||e.code==='Escape')&&performance.now()-lastUnexpectedPointerUnlockAt<300){
    e.preventDefault();
    return;
  }
  if(shouldOpenPauseForEvent({storyMode,key:e.key,code:e.code,topSceneId})){
    e.preventDefault();
    openPauseMenu();
    return;
  }
  const moveKey=movementKey(e);
  const controlRole=movementRole(moveKey);
  const onboardingBlocksMove=!!(moveKey && controlRole==='move' && isOnboardingActive() && (moveKey==='ArrowDown' || moveKey==='KeyS'));
  const worldCanTrackMotion=!!(moveKey && inRogue && !paused && (!scenes.blocksInput()||scenes.tracksMotion()) && !onboardingBlocksMove);
  const motionAlreadyHeld=worldCanTrackMotion ? motionInput.isHeld(moveKey) : false;
  // Capture movement intent before non-modal overlays see the key. Several
  // overlay scenes render above the world without blocking it; a browser
  // key-repeat that they happen to consume must never clear the held key and
  // reduce motion to one-cell taps. Blocking/modal scenes still reset below.
  if(worldCanTrackMotion) motionInput.keyDown(e);

  // Scenes (title, dialogue, menus) get first refusal on every key — before
  // inRogue, so the title screen works while the field is still loading.
  const wasBlockingScene = scenes.blocksInput();
  if(scenes.depth()>0 && scenes.key(e)){
    e.preventDefault();
    // Only blocking scenes own locomotion. Non-modal overlays may consume a
    // keyboard edge for their own UI, but they must not destroy held movement.
    if(wasBlockingScene&&!scenes.tracksMotion()) resetMotionInput('scene-consumed', {stopRenderMove:true});
    else if(!moveKey) clearMotionClock('scene-consumed-action');
    return;
  }
  if(!inRogue) return;
  if(storyMode){
    // Match on e.code AND e.key: e.code survives non-QWERTY layouts, e.key
    // survives environments that don't populate code (remote input, some IMEs).
    // Only Cmd/Ctrl are reserved for the browser (Cmd+F is Find).
    const bare = !e.metaKey && !e.ctrlKey;
    const is=(code,ch)=> e.code===code || e.key===ch || e.key===ch.toUpperCase();
    if(bare && is('KeyF','f')){
      e.preventDefault();
      if(usingSourceSpace()){
        const result=chunkSurfRuntime.tuneFocused(px,py,R3.r3dFacing());
        if(result.handled){
          REC.emitNoise(.09,px,py,'the tuning fork answered',{spoils:false,kind:'instrument_note',sourceKind:'equipment',sourceId:'source-tuning-fork',playerGenerated:true,deliberate:true});
          if(result.text)SPEECH.say({who:'you',text:result.text});
          syncSourceRender();
          return;
        }
        // Nothing tunable in focus — F is the torch here as anywhere. The fork
        // only answers when you are actually facing a reachable landmark, so
        // moving through the field never steals the flashlight.
      }
      if(itemLost('torch')){ SPEECH.say({ who:'you', text:'No torch. It has the torch.' }); return; }
      if(!REC.lightOn() && REC.batteryLevel()<=0){
        SPEECH.say(usingStairAnomaly()
          ? {who:'you',text:'Flat. And this stair only answered the second click. No second click now—so I leave it by the long way, in the dark.'}
          : { who:'you', text:'Flat. It is flat, and I have nothing to put in it.' });
        return;
      }
      const on=REC.toggleLight();
      CUES.playCue(CUES.CUE.light, {gain:0.7, rate: on ? 1 : 0.92});
      REC.emitNoise(.02,px,py,'torch switch',{
        spoils:false,kind:'handling_noise',sourceKind:'equipment',sourceId:'torch',playerGenerated:true,deliberate:true,
      });
      // On the impossible stair, the torch is the way out (see tickStairAnomaly).
      if(usingStairAnomaly()) noteStairTorchFlick(on);
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
    if(e.key==='Shift' || e.code==='ShiftLeft' || e.code==='ShiftRight'){ motionInput.keyDown(e); REC.setSlow(true); return; }
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
  if(RENDERER==='3d' && controlRole==='turn'){
    // First-person: left/right are quarter turns. They are still stateful: a
    // held key repeats on our frame clock, never on the browser's repeat clock.
    e.preventDefault();
    if(isOnboardingActive()) return;
    const alreadyHeld=worldCanTrackMotion ? motionAlreadyHeld : motionInput.isHeld(moveKey);
    if(!worldCanTrackMotion) motionInput.keyDown(e);
    if(!e.repeat&&!alreadyHeld){
      const dir=(moveKey==='ArrowRight'||moveKey==='KeyD') ? 1 : -1;
      performQuarterTurn(dir, performance.now());
    }
    return;
  }
  if(RENDERER==='3d'&&moveKey&&controlRole==='look'){
    e.preventDefault();
    return;
  }
  if(moveKey){
    e.preventDefault();
    if(onboardingBlocksMove){
      motionInput.keyUp({code:moveKey,target:e.target});
      return;
    }
    const alreadyHeld=worldCanTrackMotion ? motionAlreadyHeld : motionInput.isHeld(moveKey);
    if(!worldCanTrackMotion) motionInput.keyDown(e);
    // Native key-repeat is OS/browser timed and must never become a second
    // movement clock. A new press gets one immediate, responsive step; the RAF
    // cadence owns every held step after it.
    if(!e.repeat&&!alreadyHeld){
      const now=performance.now();
      const [dx,dy]=arrowDelta();
      maybeLockHushFromInputDelta(dx,dy,now);
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
  if(e.key==='Shift' || e.code==='ShiftLeft' || e.code==='ShiftRight'){ motionInput.keyUp(e); REC.setSlow(false); }
  // Release [e] to stop a held instrument. Play lasts exactly as long as you hold.
  if((e.key==='e' || e.code==='KeyE') && heldPropPlay) stopHeldPropPlay();
  const moveKey=movementKey(e);
  if(moveKey){
    motionInput.keyUp(e);
    const [dx,dy]=arrowDelta();
    if(dx===0&&dy===0)nextMoveAtMs=0;
    if(turnHeldDir()===0)nextTurnAtMs=0;
  }
}
function onBlur(){
  // Releasing focus mid-press would otherwise leave keys "stuck".
  resetMotionInput('window-blur', {stopRenderMove:true});
  void recoverInteractionAudio('window-blur');
}
// Focus, capture and a level head, together. Every path back INTO gameplay wants
// all three: a windowed build that has just been clicked, a pause menu that has
// just been dismissed, a keypress arriving while the pointer is loose. Doing only
// one of them is what left the game focused but uncaptured, or captured but
// staring at the ceiling.
function resumeGameplayInput(reason='resume-input',{recenter=true}={}){
  ensureInteractionFocus();
  if(recenter && RENDERER==='3d') R3.r3dRecenterLook?.({pitch:true});
  if(gameplayWantsPointerCapture() && !pointerMode.isTrueLocked?.()) void ensurePointerLock(reason);
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

function pointerEventHitsGameplaySurface(e){
  const target=e?.target || null;
  if(target?.closest?.('button,input,textarea,select,a,[data-no-pointer-lock]')) return false;
  if(!MAP_EL || !target) return true;
  return target===MAP_EL
    || !!MAP_EL.contains?.(target)
    || target===document.body
    || target===document.documentElement;
}

function scenePointerPayload(e){
  const point=uiPointFromClient(e.clientX,e.clientY);
  return {
    type:e.type,
    clientX:e.clientX,
    clientY:e.clientY,
    cellX:point.cellX,
    cellY:point.cellY,
    pointerId:e.pointerId,
    buttons:e.buttons,
    pointerType:e.pointerType,
    originalEvent:e,
  };
}

function onPointerEvent(e){
  if(e.type==='pointerdown'){
    BINDINGS.setActiveInputDevice('keyboard');
    void recoverInteractionAudio('pointerdown');
    ensureInteractionFocus();
  }

  // Scenes get first refusal. Blocking scenes swallow pointer input even when
  // they do not implement pointer(), so a menu click can never become gameplay
  // pointer capture. Entering a scene also hard-releases any look backend via
  // the scene subscription below.
  if(scenes.pointer(scenePointerPayload(e))){
    e.preventDefault?.();
    e.stopPropagation?.();
    return;
  }

  if(e.type==='pointermove' && pointerEventHitsGameplaySurface(e) && pointerMode.handlePointerMove?.(e)){
    e.preventDefault?.();
    e.stopPropagation?.();
    return;
  }

  if(e.type==='pointerdown' && pointerEventHitsGameplaySurface(e)){
    // Click is reserved for interaction/capture request. It must not start
    // button-held camera look; mouse-look only begins after true pointer lock
    // or confirmed native capture owns the pointer.
    void ensurePointerLock('world-pointerdown');
    e.preventDefault?.();
    e.stopPropagation?.();
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot(){
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
  scenes.subscribe(({reason,scene})=>{
    syncPointerMode(`scene-${reason}:${scene?.id||'unknown'}`);
  });
  syncPointerMode('boot');
  // Register input/focus handlers once; avoid missing controls during a partial
  // enterRogue path.
  window.addEventListener('keydown',onKey, {capture:true});
  window.addEventListener('keyup',onKeyUp, {capture:true});
  // One pointer router owns both UI hit-testing and gameplay capture. Scenes
  // get first refusal; unhandled world pointerdown requests camera ownership.
  window.addEventListener('pointerdown', onPointerEvent, {capture:true,passive:false});
  window.addEventListener('pointermove', onPointerEvent, {capture:true,passive:false});
  window.addEventListener('pointerup', onPointerEvent, {capture:true,passive:false});
  window.addEventListener('pointercancel', onPointerEvent, {capture:true,passive:false});
  // The manager only accumulates mouse deltas while pointer mode says gameplay
  // owns look input. That means true DOM pointer lock; native capture feeds
  // deltas through pointermove after it has been confirmed/calibrated.
  document.addEventListener('pointerlockchange', ()=>pointerMode.handlePointerLockChange());
  document.addEventListener('pointerlockerror', (e)=>pointerMode.handlePointerLockError(e));
  window.addEventListener('mousemove', (e)=>{
    // True DOM pointer lock uses MouseEvent.movementX/Y. Soft-capture fallback
    // feeds deltas from pointermove so it can recenter/ignore synthetic drift.
    if(pointerMode.isTrueLocked?.()) motionInput.mouseMove(e);
  }, {capture:true,passive:true});
  // Fullscreen and iframe transitions silently drop keyboard focus.
  document.addEventListener('fullscreenchange', ()=>{ refreshStageLayoutSoon(); ensureInteractionFocus(); });
  window.addEventListener('message', ensureInteractionFocus, {passive:true});
  window.addEventListener('focus', ()=>{
    recoverInteractionFocus('window-focus');
    // Regaining focus is not itself a gesture, so the lock cannot be taken
    // here — but the click that follows must not be spent on focusing again.
    ensureInteractionFocus();
    syncPointerMode('window-focus');
  }, {passive:true});
  // A windowed build only ever gets focus from a click inside it. Treat that
  // click as the capture gesture too, instead of swallowing it.
  window.addEventListener('mousedown', ()=>{
    if(gameplayWantsPointerCapture() && !pointerMode.isTrueLocked?.()) void ensurePointerLock('window-mousedown');
  }, {capture:true,passive:true});
  document.addEventListener('visibilitychange', ()=>{
    if(document.hidden){
      resetMotionInput('visibility-hidden', {stopRenderMove:true});
      void recoverInteractionAudio('visibility-hidden');
    } else {
      recoverInteractionFocus('visibility-visible');
    }
  });
  window.addEventListener('pageshow', ()=>{ recoverInteractionFocus('pageshow'); }, {passive:true});
  window.addEventListener('pagehide',()=>{
    resetMotionInput('pagehide', {stopRenderMove:true});
    void recoverInteractionAudio('pagehide');
  });
  window.addEventListener('blur',onBlur);
  await installDesktopMenuBridge({
    isInGame: isDesktopMenuInGame,
    openAbout: openAboutPanel,
    openSettings,
    beginNewGameFlow,
    continueRun: continueRunFromDesktopMenu,
    openDifficulty: beginNewGameFlow,
    openAchievements: openArchive,
    returnToTitle,
    togglePauseMenu: openPauseMenu,
    openGodMenu,
    toggleGameMode: toggleDesktopGameMode,
    onNativeFullscreenToggled: syncNativeFullscreenState,
    resetWindow: resetDesktopWindowState,
    setReduceMotion: setDesktopReduceMotion,
    setReduceFlash: setDesktopReduceFlash,
    setHighContrast: setDesktopHighContrast,
    toggleMute: toggleDesktopMute,
    restartAudio: restartDesktopAudio,
    openSaveFolder: openDesktopSaveFolder,
    openReleasePage,
    reportIssue: reportDesktopIssue,
  });
  preloadStoryArt();
  if(typeof window!=='undefined'){
    window.__chunkSurferDisplay={
      setWindowPreset:(id)=>updateDisplaySettings({windowPreset:id}),
      setUiScale:(value)=>updateDisplaySettings({uiScale:value}),
      setRenderScale:(value)=>updateDisplaySettings({renderScale:value}),
      setDisplayMode:(id)=>updateDisplaySettings({displayMode:id}),
      pixelMesh:()=>currentPixelMeshSettings(),
      pixelMeshStatus:()=>R3.r3dPixelMeshStatus?.() || null,
      pulsePixelMesh,
      openPause:openPauseMenu,
      openGodMenu,
      openSettings:(tab='display')=>openSettings({initialTab:tab}),
      resetWindow:resetWindowFromMenu,
    };
      window.__chunkSurferPixelMesh={
        settings:()=>currentPixelMeshSettings(),
        status:()=>R3.r3dPixelMeshStatus?.() || null,
        lookStatus:()=>R3.r3dLookStatus?.() || null,
        bankStatus:()=>R3.r3dSurfaceDreamStats?.() || null,
        setDebugSource:(debugSource='final')=>applyPixelMeshSettings({debugSource}),
        setAccessibility:({reduceFlash=false,reduceMotion=false}={})=>applyPixelMeshSettings({reduceFlash,reduceMotion}),
      setProfile:(id='explore')=>applyLookProfile(id),
      pulse:pulsePixelMesh,
      resetMemory:()=>R3.r3dResetVfdMemory?.(),
      forceOn:()=>pulsePixelMesh(2200),
    };
    window.__chunkSurferAbout={
      snapshot:collectAboutSnapshot,
      copyReport:copyDiagnosticReport,
      exportSave:exportSaveBackup,
      restartAudio:restartDesktopAudio,
      openWebsite:()=>openExternalUrl(APP_LINKS.website),
      reportProblem:()=>openExternalUrl(APP_LINKS.reportProblem),
    };
    window.__chunkSurferPointer={
      status:()=>pointerMode.status(),
      sync:(reason='manual')=>pointerMode.sync(reason),
      capture:()=>pointerMode.requestCaptureFromGesture('debug-capture'),
      release:(reason='debug-release')=>pointerMode.release(reason),
      wantsCapture:()=>gameplayWantsPointerCapture(),
      scene:()=>({
        top:scenes.top()?.id||null,
        depth:scenes.depth(),
        blocksInput:scenes.blocksInput(),
        blocksWorld:scenes.blocksWorld(),
      }),
    };
    window.__chunkSurferHushScare={
      forceContact:()=>beginHushContactFlash({taken:false,reason:'debug-contact',intensity:1}),
      forceWarning:(seed=4417)=>openHushSensation(HUSH_SENSATION_MODE.PROXIMITY,{seed:Number(seed)||4417}),
      forceBrush:(seed=4417)=>openDebugHushBrush(seed),
      choose:(index=0)=>chooseHushSensationDebug(index),
      // The whole sequence, not just the flash: surfer hit, then the black
      // aftermath only once the flash window has closed.
      forceTaken:()=>{ beginTaken(); return true; },
      contactFlashMs:()=>HUSH_CONTACT_FLASH_MS,
      sensation:()=>({mode:hushSensationMode,debug:hushSensationDebug,pending:PRES.pendingContactAttempt(),director:PRES.contactDirectorState()}),
      status:()=>{
        const el=HUSH_JUMP_EL;
        const bg=el?getComputedStyle(el).backgroundImage:null;
        const inline=el?.style?.backgroundImage||'';
        return {
          expected:HUSH_CONTACT_ASSET.url,
          assetId:el?.dataset?.hushContactAsset||null,
          reason:el?.dataset?.hushContactReason||null,
          backgroundImage:bg,
          inlineBackground:inline,
          active:!!el?.classList?.contains('active'),
          contactHit:!!el?.classList?.contains('contact-hit'),
          takenHit:!!el?.classList?.contains('taken-hit'),
          blink:!!el?.classList?.contains('blink'),
          topScene:scenes.top()?.id||null,
          ok:/surfer\.png/.test(`${bg||''} ${inline}`),
        };
      },
    };
    window.__chunkSurferHitRegions=window.__chunkSurferHitRegions||{
      show:false,
      labels:true,
      enable(){this.show=true;return this;},
      disable(){this.show=false;return this;},
    };
    window.__chunkSurferMotion={
      status:()=>({
        input:motionInput.debugState(),
        renderer:RENDERER,
        storyMode,
        inRogue,
        paused,
        scene:scenes.top()?.id||null,
        blocksInput:scenes.blocksInput(),
        blocksWorld:scenes.blocksWorld(),
        pointer:pointerMode.status(),
        nextMoveInMs:nextMoveAtMs>0?Math.max(0,Math.round(nextMoveAtMs-performance.now())):0,
        nextTurnInMs:nextTurnAtMs>0?Math.max(0,Math.round(nextTurnAtMs-performance.now())):0,
        motionResetReason,
        px,py,
        rendered:renderedPlayerPoint(),
        arrowDelta:arrowDelta(),
        turnHeldDir:turnHeldDir(),
        facing:RENDERER==='3d'?R3.r3dFacing?.():null,
        facingDelta:RENDERER==='3d'?R3.r3dDelta?.(1):null,
        moveIntervalMs:currentMoveIntervalMs(),
        sinceLastMoveMs:Math.round(performance.now()-lastMoveAtMs),
        lastLoopMs,
        focusRecovery:'reset-and-reacquire',
        motionRig:motionRig?{x:motionRig.x,z:motionRig.z,vx:motionRig.vx,vz:motionRig.vz,reason:motionRig.reason}:null,
      }),
      reset:(reason='manual-reset')=>resetMotionInput(reason,{stopRenderMove:true}),
      press:(code)=>onKey({key:code?.startsWith?.('Key')?code.slice(3).toLowerCase():code,code,repeat:false,metaKey:false,ctrlKey:false,altKey:false,target:null,preventDefault(){},stopPropagation(){}}),
      release:(code)=>onKeyUp({key:code?.startsWith?.('Key')?code.slice(3).toLowerCase():code,code,repeat:false,target:null,preventDefault(){},stopPropagation(){}}),
      blur:()=>resetMotionInput('manual-blur',{stopRenderMove:true}),
      why:()=>window.__probe?.why?.()||null,
    };
    if(import.meta.env?.DEV || params().has('storyArtDebug')){
      window.__chunkSurferStoryArt={
        resolve:resolveStoryArt,
        cache:storyArtCacheSnapshot,
        preload:preloadStoryArt,
        start:(id='guard',mode='hero')=>scenes.push(makeStoryArtPreviewScene({art:id,mode})),
      };
    }
  }
  updateOnboardingButton();
    await bootScenes();
    raf=requestAnimationFrame(loop);
    const qp=params();
    if(!qp.has('baglab')&&!qp.has('progresslab')&&!qp.has('maplab')&&!qp.has('hushaudiolab')){
      loadAll();
      loadSw2DriverAudio();
    }
}

boot().catch((err)=>{
  console.error('boot failed', err);
});
