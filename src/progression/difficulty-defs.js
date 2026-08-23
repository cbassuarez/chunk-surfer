import { DEFAULT_RULE_VALUES } from './schema.js';

export const DIFFICULTY_PRESETS = Object.freeze({
  story: Object.freeze({
    id: 'story',
    name: 'STORY',
    subtitle: 'EASIER',
    rank: 0,
    description: 'Focus on exploration and story. Enemies are less aggressive, recording mistakes are more forgiving, navigation gives more help, escape timers are longer, and the flashlight lasts longer.',
    intended: false,
    values: Object.freeze({
      presencePressure: 'reduced',
      recordingForgiveness: 'pause',
      combatAssistance: 'guided',
      navigationSignal: 'full',
      escapeTimer: 'extended',
      torchDrain: 'slow',
      involuntaryBreath: 'off',
    }),
  }),
  contract: Object.freeze({
    id: 'contract',
    name: 'CONTRACT',
    subtitle: 'RECOMMENDED',
    rank: 1,
    description: 'The recommended first playthrough. Standard enemy behavior, recording rules, navigation, timers, resources, and combat assistance.',
    intended: true,
    values: Object.freeze({ ...DEFAULT_RULE_VALUES }),
  }),
  night: Object.freeze({
    id: 'night',
    name: 'NIGHT SHIFT',
    subtitle: 'HARD',
    rank: 2,
    description: 'A harder playthrough. Enemies are more aggressive, recordings are less forgiving, navigation gives less help, escape timers are shorter, and the flashlight drains faster.',
    intended: false,
    values: Object.freeze({
      presencePressure: 'severe',
      recordingForgiveness: 'strict',
      combatAssistance: 'severe',
      navigationSignal: 'minimal',
      escapeTimer: 'strict',
      torchDrain: 'scarce',
      involuntaryBreath: 'severe',
    }),
  }),
  'dead-air': Object.freeze({
    id: 'dead-air',
    name: 'DEAD AIR',
    subtitle: 'VERY HARD',
    rank: 3,
    description: 'The hardest preset. Enemies are at their most aggressive, recordings use strict failure rules, navigation help is minimal, escape timers are shortest, and resources are most limited.',
    intended: false,
    values: Object.freeze({
      presencePressure: 'dead-air',
      recordingForgiveness: 'strict',
      combatAssistance: 'dead-air',
      navigationSignal: 'minimal',
      escapeTimer: 'dead-air',
      torchDrain: 'dead-air',
      involuntaryBreath: 'dead-air',
    }),
  }),
});

export const PRESET_ORDER = Object.freeze(['story', 'contract', 'night', 'dead-air']);

export const RULE_OPTIONS = Object.freeze({
  presencePressure: Object.freeze(['reduced', 'standard', 'severe', 'dead-air']),
  recordingForgiveness: Object.freeze(['pause', 'standard', 'strict']),
  combatAssistance: Object.freeze(['guided', 'standard', 'severe', 'dead-air']),
  navigationSignal: Object.freeze(['full', 'directional', 'minimal']),
  escapeTimer: Object.freeze(['off', 'extended', 'standard', 'strict', 'dead-air']),
  torchDrain: Object.freeze(['slow', 'standard', 'scarce', 'dead-air']),
  involuntaryBreath: Object.freeze(['off', 'standard', 'severe', 'dead-air']),
});

export const RULE_LABELS = Object.freeze({
  presencePressure: 'ENEMY PRESSURE',
  recordingForgiveness: 'RECORDING FORGIVENESS',
  combatAssistance: 'COMBAT ASSISTANCE',
  navigationSignal: 'NAVIGATION HELP',
  escapeTimer: 'ESCAPE TIME',
  torchDrain: 'FLASHLIGHT DRAIN',
  involuntaryBreath: 'INVOLUNTARY BREATHING',
});


export const RULE_HELP = Object.freeze({
  presencePressure: 'Changes how quickly threats move, how easily they hear you, and how long they track your last known position.',
  recordingForgiveness: 'Changes how much accidental noise can occur before a recording is spoiled.',
  combatAssistance: 'Changes combat difficulty: how reliably your attacks land well, how often the opponent can slip a swing, how wide the parry window is, defensive assistance, and recovery when your available actions run out.',
  navigationSignal: 'Changes how much route, room, distance, map, and waypoint information is shown while navigating.',
  escapeTimer: 'Changes how much time you have during timed escapes. OFF removes the timer.',
  torchDrain: 'Changes how quickly flashlight power is consumed.',
  involuntaryBreath: 'Changes whether panic can make your character breathe loudly without input, and how severe it can become.',
});

export const VALUE_LABELS = Object.freeze({
  reduced: 'REDUCED',
  standard: 'STANDARD',
  severe: 'SEVERE',
  'dead-air': 'DEAD AIR',
  pause: 'PAUSE MINOR NOISE',
  strict: 'STRICT',
  guided: 'GUIDED',
  full: 'FULL',
  directional: 'DIRECTIONAL',
  minimal: 'MINIMAL',
  off: 'OFF',
  extended: 'EXTENDED',
  slow: 'SLOW',
  scarce: 'SCARCE',
});

export const RULE_RANK = Object.freeze({
  presencePressure: Object.freeze({ reduced: 0, standard: 1, severe: 2, 'dead-air': 3 }),
  recordingForgiveness: Object.freeze({ pause: 0, standard: 1, strict: 2 }),
  combatAssistance: Object.freeze({ guided: 0, standard: 1, severe: 2, 'dead-air': 3 }),
  navigationSignal: Object.freeze({ full: 0, directional: 1, minimal: 2 }),
  escapeTimer: Object.freeze({ off: 0, extended: 1, standard: 2, strict: 3, 'dead-air': 4 }),
  torchDrain: Object.freeze({ slow: 0, standard: 1, scarce: 2, 'dead-air': 3 }),
  involuntaryBreath: Object.freeze({ off: 0, standard: 1, severe: 2, 'dead-air': 3 }),
});

export const PRESENCE_RULES = Object.freeze({
  reduced: Object.freeze({ baseSpeedScale: 0.72, huntSpeedScale: 0.74, hearingScale: 0.78, memoryScale: 0.85 }),
  standard: Object.freeze({ baseSpeedScale: 1, huntSpeedScale: 1, hearingScale: 1, memoryScale: 1 }),
  severe: Object.freeze({ baseSpeedScale: 1.12, huntSpeedScale: 1.14, hearingScale: 1.10, memoryScale: 1.08 }),
  'dead-air': Object.freeze({ baseSpeedScale: 1.18, huntSpeedScale: 1.21, hearingScale: 1.14, memoryScale: 1.12 }),
});

export const RECORDING_RULES = Object.freeze({
  pause: Object.freeze({ minorNoise: 'pause', spoilNoiseScale: 1.20, pauseSeconds: 0.7 }),
  standard: Object.freeze({ minorNoise: 'spoil', spoilNoiseScale: 1 }),
  strict: Object.freeze({ minorNoise: 'spoil', spoilNoiseScale: 0.90 }),
});

// `pressureBias` is the one lever the presets do not set: it is supplied per
// fight from the psychological profile's adaptive band, and it leans the
// opponent's mood toward pressing or toward giving you a breath. See
// enemy-mind.js — before this, the profile expressed itself by silently
// re-sorting the authored intent array, which the opponent no longer reads in
// order and which therefore did nothing at all.
// HOW MUCH THE FIGHT TALKS YOU THROUGH ITSELF.
//
// One rung removed per preset, so difficulty is a question of how much you are
// told rather than only of how hard you are hit:
//
//   full   the recordist's read, the opponent's mood said out loud, a warning
//          before a chained blow, and a note when a special is worth spending
//   trace  the read, hedged, and it can be wrong
//   tile   no prose at all — the counter still lights green in the command band
//   none   nothing but the opponent's posture, which never lies
//
// The stance readout in the header is NOT part of this ladder. It is the floor
// underneath it and every preset gets it, because it is what makes a fight
// with no prose in it readable at all.
export const COMBAT_GUIDANCE = Object.freeze({
  FULL: 'full', TRACE: 'trace', TILE: 'tile', NONE: 'none',
});

// DIFFICULTY IS A MECHANICS LADDER NOW, NOT ONLY A GUIDANCE ONE.
//
// The guidance rungs above are still the spine — how much the fight says out
// loud is the most humane thing to scale. But CONTRACT and NIGHT SHIFT used to
// play almost identically: a point of composure and a point of guard between
// them, and nothing else. Three levers make the presets differ in PLAY:
//
//   bandFloorBonus     how much of an outgoing damage band the assist hands you
//                      for free (see combat-damage.js). On GUIDED your hits land
//                      well whether or not you read the beat; on DEAD AIR every
//                      point above the floor of the band has to be earned.
//   enemyGuardCooldown how often the opponent may read a committed swing coming
//                      and set to slip it, counted in enemy beats. The guard
//                      already existed and was documented as difficulty-gated;
//                      this is the gate. null means never. It is a COOLDOWN and
//                      not a chance on purpose: a defence that fires on a hidden
//                      die reads as the game cheating, whereas one that fires
//                      whenever the surfer is hurt and has had time to recover
//                      is something a player can learn and bait.
//   parryWindowScale   how wide the reactive-parry window is. STORY gives you
//                      most of the beat; DEAD AIR gives you the end of it.
//
// Composure and guard are in GRID units (combat-damage.js) like every other
// combat number: a point used to be a fifth of a phase and is now a twenty-fifth.
export const COMBAT_RULES = Object.freeze({
  // When the bag has no immediate way to damage or capture, HOLD earns a
  // SECOND BREATH. Story has it immediately; Contract exposes one deliberate
  // empty beat; the challenge modes demand a longer brace but never hard-lock.
  //
  // This matters less than it used to: SHOUT is always in the bag, so a dry kit
  // is slow rather than stranded and SECOND BREATH is a reward for a deliberate
  // brace instead of a rescue from a soft-lock.
  guided: Object.freeze({ guidance: COMBAT_GUIDANCE.FULL, id: 'guided', composureBonus: 10, holdPrevention: 15, intentLookahead: 2, recoveryHolds: 0, recommended: true, safetyRelay: true, variant: 'standard', bandFloorBonus: 0.35, enemyGuardCooldown: null, parryWindowScale: 1.6 }),
  standard: Object.freeze({ guidance: COMBAT_GUIDANCE.TRACE, id: 'standard', composureBonus: 0, holdPrevention: 10, intentLookahead: 1, recoveryHolds: 1, recommended: true, safetyRelay: false, variant: 'standard', bandFloorBonus: 0.12, enemyGuardCooldown: 4, parryWindowScale: 1 }),
  severe: Object.freeze({ guidance: COMBAT_GUIDANCE.TILE, id: 'severe', composureBonus: -5, holdPrevention: 10, intentLookahead: 1, recoveryHolds: 2, recommended: false, safetyRelay: false, variant: 'severe', bandFloorBonus: 0.04, enemyGuardCooldown: 2, parryWindowScale: 0.85 }),
  'dead-air': Object.freeze({ guidance: COMBAT_GUIDANCE.NONE, id: 'dead-air', composureBonus: -10, holdPrevention: 10, intentLookahead: 1, recoveryHolds: 3, recommended: false, safetyRelay: false, variant: 'dead-air', bandFloorBonus: 0, enemyGuardCooldown: 1, parryWindowScale: 0.7 }),
});

// Serialized saves migrate to combatAssistance, but this export keeps older
// integrations from failing during the transition.
export const REDACTION_RULES = COMBAT_RULES;

export const NAVIGATION_RULES = Object.freeze({
  full: Object.freeze({
    id:'full', showMap:true, showBearing:true, showDistance:true, showRoom:true,
    showMapTopology:true, showExactPlayer:true, showAllTargetLabels:true,
    showWaypoint:true, showCrossFloorConnector:true, showRoute:true,
    showRouteStatus:true, minimapMode:'topology', contactHoldScale:1.35,
    contactResolveBias:0.10, contactShowRoom:true,
  }),
  directional: Object.freeze({
    id:'directional', showMap:true, showBearing:true, showDistance:true, showRoom:true,
    showMapTopology:true, showExactPlayer:true, showAllTargetLabels:false,
    showWaypoint:true, showCrossFloorConnector:true, showRoute:false,
    showRouteStatus:false, minimapMode:'topology', contactHoldScale:1,
    contactResolveBias:0, contactShowRoom:true,
  }),
  minimal: Object.freeze({
    id:'minimal', showMap:true, showBearing:true, showDistance:false, showRoom:false,
    showMapTopology:false, showExactPlayer:true, showAllTargetLabels:false,
    showWaypoint:true, showCrossFloorConnector:false, showRoute:false,
    showRouteStatus:false, minimapMode:'compass', contactHoldScale:0.72,
    contactResolveBias:-0.04, contactShowRoom:false,
  }),
});

export const ESCAPE_RULES = Object.freeze({
  off: Object.freeze({ seconds: null }),
  extended: Object.freeze({ seconds: 180 }),
  standard: Object.freeze({ seconds: 120 }),
  strict: Object.freeze({ seconds: 90 }),
  'dead-air': Object.freeze({ seconds: 75 }),
});

export const TORCH_RULES = Object.freeze({
  slow: Object.freeze({ drainScale: 0.5 }),
  standard: Object.freeze({ drainScale: 1 }),
  scarce: Object.freeze({ drainScale: 1.22 }),
  'dead-air': Object.freeze({ drainScale: 1.35 }),
});

export const BREATH_RULES = Object.freeze({
  off: Object.freeze({ enabled: false, fearDecayScale: 1.35, threshold: 2, noiseScale: 0 }),
  standard: Object.freeze({ enabled: true, fearDecayScale: 1, threshold: 0.62, noiseScale: 1 }),
  severe: Object.freeze({ enabled: true, fearDecayScale: 0.82, threshold: 0.54, noiseScale: 1.18 }),
  'dead-air': Object.freeze({ enabled: true, fearDecayScale: 0.72, threshold: 0.48, noiseScale: 1.32 }),
});
