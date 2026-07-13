import { DEFAULT_RULE_VALUES } from './schema.js';

export const DIFFICULTY_PRESETS = Object.freeze({
  story: Object.freeze({
    id: 'story',
    name: 'STORY',
    subtitle: 'ASSISTED',
    rank: 0,
    description: 'For the building, dialogue, and endings. The HUSH is less aggressive and mistakes are more forgiving.',
    intended: false,
    values: Object.freeze({
      presencePressure: 'reduced',
      recordingForgiveness: 'pause',
      redactionAssistance: 'guided',
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
    description: 'The intended first run. Standard pressure, recording rules, navigation, and timing.',
    intended: true,
    values: Object.freeze({ ...DEFAULT_RULE_VALUES }),
  }),
  night: Object.freeze({
    id: 'night',
    name: 'NIGHT SHIFT',
    subtitle: 'SEVERE',
    rank: 2,
    description: 'For players who want the same building with tighter margins and less guidance.',
    intended: false,
    values: Object.freeze({
      presencePressure: 'severe',
      recordingForgiveness: 'strict',
      redactionAssistance: 'severe',
      navigationSignal: 'minimal',
      escapeTimer: 'strict',
      torchDrain: 'scarce',
      involuntaryBreath: 'severe',
    }),
  }),
  'dead-air': Object.freeze({
    id: 'dead-air',
    name: 'DEAD AIR',
    subtitle: 'CHALLENGE',
    rank: 3,
    description: 'The building expects you now. Strict takes, minimal navigation, severe pressure, and run certification.',
    intended: false,
    values: Object.freeze({
      presencePressure: 'dead-air',
      recordingForgiveness: 'strict',
      redactionAssistance: 'dead-air',
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
  redactionAssistance: Object.freeze(['guided', 'standard', 'severe', 'dead-air']),
  navigationSignal: Object.freeze(['full', 'directional', 'minimal']),
  escapeTimer: Object.freeze(['off', 'extended', 'standard', 'strict', 'dead-air']),
  torchDrain: Object.freeze(['slow', 'standard', 'scarce', 'dead-air']),
  involuntaryBreath: Object.freeze(['off', 'standard', 'severe', 'dead-air']),
});

export const RULE_LABELS = Object.freeze({
  presencePressure: 'PRESENCE PRESSURE',
  recordingForgiveness: 'RECORDING FORGIVENESS',
  redactionAssistance: 'REDACTION ASSISTANCE',
  navigationSignal: 'NAVIGATION SIGNAL',
  escapeTimer: 'ESCAPE TIMER',
  torchDrain: 'TORCH DRAIN',
  involuntaryBreath: 'INVOLUNTARY BREATH',
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
  redactionAssistance: Object.freeze({ guided: 0, standard: 1, severe: 2, 'dead-air': 3 }),
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

export const REDACTION_RULES = Object.freeze({
  guided: Object.freeze({ healthBonus: 2, maxAttempts: 3, hintAfterFailures: 2 }),
  standard: Object.freeze({ healthBonus: 0, maxAttempts: 2, hintAfterFailures: null }),
  severe: Object.freeze({ healthBonus: -1, maxAttempts: 2, hintAfterFailures: null }),
  'dead-air': Object.freeze({ healthBonus: -1, maxAttempts: 1, hintAfterFailures: null }),
});

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
