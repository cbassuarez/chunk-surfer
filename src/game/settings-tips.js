//
//  settings-tips.js
//  
//
//  Created by Sebastian Suarez-Solis on 7/12/26.
//

// Footer copy for the AUDIOCORP service menu.
//
// Two lanes:
//   SETTING = explains the selected row.
//   PRO TIP = teaches the actual game.
//
// Keep tips non-spoilery, binding-tokenized, and stable over several seconds.
// Do not randomize per frame.

import { getSave } from './save.js';
import { formatBindingTip } from './bindings.js';

const TIP_MS = 9000;

const SETTING_HELP = Object.freeze({
  display: {
    phosphor: 'PHOSPHOR changes the VFD glass, phosphor, or filter look.',
    brightness: 'BRIGHTNESS changes the simulated display panel, not your monitor.',
    flicker: 'LOW flicker adds panel life. FULL makes the display less stable.',
    visualFx: 'VISUAL FX is the master switch for intense screen effects.',
    default: 'Display settings change the service panel, not the save file.',
  },

  audio: {
    global: 'GLOBAL changes the final output level for the whole game.',
    dialog: 'SPOKEN / DIALOG controls voices, speech synthesis, and dialogue ticks.',
    sfx: 'SFX controls page turns, stabs, hushes, room tone, and object sounds.',
    music: 'MUSIC controls title and intro music only, not stabs or hushes.',
    default: 'Separate audio levels let you tune the mix without changing the game.',
  },

  input: {
    controlMap: 'CONTROL MAP is a reference for the current keyboard layout.',
    move: 'MOVE walks the building.',
    quiet: 'QUIET lowers your movement noise.',
    light: 'LIGHT toggles the torch.',
    bag: 'BAG opens your file, gear, and objective list.',
    recorder: 'RECORDER starts listening or recording when the room allows it.',
    mark: 'MARK WAYPOINT stores the selected room as your active waypoint.',
    menu: 'MENU opens this service panel.',
    micStatus: 'MIC STATUS shows whether the room microphone is available.',
    mic: 'USE ROOM MIC can be disabled. The game remains playable without it.',
    enableMic: 'ENABLE MIC asks the browser for microphone access.',
    default: 'Input rows are references for the current control map.',
  },

  access: {
    textRate: 'TEXT RATE changes how quickly unvoiced text types in.',
    instantText: 'INSTANT TEXT removes type-in delay.',
    flash: 'FLASH / STROBE reduces or disables intense flashes.',
    shake: 'SCREEN SHAKE can be lowered independently from other visual effects.',
    dread: 'DREAD SPIKES changes intensity, not story state.',
    default: 'ACCESS settings change presentation, not progression.',
  },

  challenge: {
    shift: 'CURRENT SHIFT is the rules profile selected when this run began.',
    'challenge:presencePressure': 'PRESENCE PRESSURE changes how quickly and how well the HUSH tracks sound.',
    'challenge:recordingForgiveness': 'RECORDING FORGIVENESS changes how minor handling noise affects an active take.',
    'challenge:redactionAssistance': 'REDACTION ASSISTANCE changes health and retry margins in redaction encounters.',
    'challenge:navigationSignal': 'NAVIGATION SIGNAL changes how much waypoint information the field case supplies.',
    'challenge:escapeTimer': 'ESCAPE TIMER changes the final timed window; OFF removes only that timer.',
    'challenge:torchDrain': 'TORCH DRAIN changes battery consumption, not light intensity.',
    'challenge:involuntaryBreath': 'INVOLUNTARY BREATH changes fear breathing and the noise it can create.',
    certification: 'DEAD AIR certification ends only when a gameplay rule is made easier.',
    default: 'Challenge settings change gameplay pressure. Accessibility settings never affect certification.',
  },

  game: {
    tutorialPrompts: 'TUTORIAL PROMPTS can be restored at any time.',
    objectiveHints: 'OBJECTIVE HINTS changes guidance only, not difficulty.',
    pauseOnBlur: 'PAUSE WHEN BLUR prevents stuck keys and accidental movement.',
    seenTextMode: 'Hold confirm to accelerate only dialogue already completed in an earlier run.',
    archiveSignals: 'UNSEEN CHOICE MARKERS mark choices you have not tried without revealing their outcomes.',
    condensedCheckIn: 'CONDENSED CHECK-IN shortens repeated administration on the next new run.',
    returnTitle: 'RETURN TO TITLE leaves the current run through the title screen.',
    resume: 'RESUME closes the service menu.',
    default: 'GAME settings affect guidance and pause behavior.',
  },

  memory: {
    autosave: 'AUTOSAVE is always on.',
    playTime: 'PLAY TIME is the current run time.',
    steps: 'STEPS counts movement in the current run.',
    area: 'CURRENT AREA is the last known area or room.',
    exportProfile: 'EXPORT PROFILE writes endings, achievements, knowledge, and preferences without the active run.',
    importProfile: 'IMPORT PROFILE merges permanent progress and never replaces the active run.',
    clearRun: 'CLEAR RUN resets the current run but keeps global memory.',
    clearMemory: 'CLEAR MEMORY removes run and meta memory.',
    default: 'MEMORY rows describe or clear saved state.',
  },

  system: {
    fullscreen: 'FULLSCREEN may require a fresh click if the browser blocks it.',
    panelFocus: 'PANEL FOCUS restores keyboard control to the game.',
    version: 'VERSION helps identify bug reports.',
    build: 'BUILD identifies the local or deployed build label.',
    default: 'SYSTEM rows control browser-facing shell behavior.',
  },
});

const PRO_TIPS = Object.freeze([
  {
    id: 'bag-waypoint',
    text: 'Mark locations in your bag with {mark} to see a waypoint.',
    tabs: ['input', 'game', 'memory', 'challenge'],
    when: ({ inGame }) => inGame,
  },
  {
    id: 'quiet-movement',
    text: 'Hold {quiet} to move quietly when the building is listening.',
    tabs: ['input', 'game', 'challenge'],
    when: ({ inGame }) => inGame,
  },
  {
    id: 'light-tradeoff',
    text: 'Your light helps you read the room, but it also changes what sees you.',
    tabs: ['display', 'input', 'game'],
    when: ({ inGame }) => inGame,
  },
  {
    id: 'listen-first',
    text: 'Listen before recording. A clean take starts with a quiet room.',
    tabs: ['audio', 'game', 'challenge'],
    when: ({ inGame }) => inGame,
  },
  {
    id: 'playback',
    text: 'Use {playback} after a take to hear what the tape kept.',
    tabs: ['audio', 'game'],
    when: ({ inGame, save }) => inGame && Array.isArray(save?.takes) && save.takes.length > 0,
  },
  {
    id: 'bag-review',
    text: 'The bag files notes under rooms. Unfiled pages may still matter.',
    tabs: ['input', 'memory', 'game'],
    when: ({ inGame }) => inGame,
  },
  {
    id: 'access',
    text: 'If motion or strobe effects feel sharp, lower them in ACCESS.',
    tabs: ['access', 'display'],
  },
  {
    id: 'objective-hints',
    text: 'OBJECTIVE HINTS changes guidance only; it does not change progression.',
    tabs: ['game'],
  },
  {
    id: 'mic-optional',
    text: 'The room mic is optional. The game remains playable without it.',
    tabs: ['input'],
  },
  {
    id: 'sfx-mix',
    text: 'If hushes or stabs feel too close, lower SFX before lowering GLOBAL.',
    tabs: ['audio', 'access'],
  },
  {
    id: 'settings-close',
    text: 'Press {menu} to leave the service menu and return to the field.',
    tabs: ['system', 'game'],
    when: ({ inGame }) => inGame,
  },
]);

function settingHelpTip(tabId, rowId) {
  const group = SETTING_HELP[tabId] || {};
  return group[rowId] || group.default || '';
}

function eligibleProTips({ tabId, rowId, inGame, save }) {
  const ctx = { tabId, rowId, inGame, save };

  const scoped = PRO_TIPS.filter((tip) => {
    if (tip.tabs && !tip.tabs.includes(tabId)) return false;
    if (tip.rows && !tip.rows.includes(rowId)) return false;
    if (tip.when && !tip.when(ctx)) return false;
    return true;
  });

  if (scoped.length) return scoped;

  return PRO_TIPS.filter((tip) => {
    if (tip.when && !tip.when(ctx)) return false;
    return true;
  });
}

function proTip({ tabId, rowId, inGame, nowMs }) {
  const save = getSave();
  const pool = eligibleProTips({ tabId, rowId, inGame, save });
  if (!pool.length) return '';

  const index = Math.floor((Number(nowMs) || 0) / TIP_MS) % pool.length;
  return formatBindingTip(pool[index].text);
}

export function settingsFooterTips({ tabId, rowId, inGame = false, nowMs = 0 } = {}) {
  return {
    help: settingHelpTip(tabId, rowId),
    pro: proTip({ tabId, rowId, inGame, nowMs }),
  };
}

export function clipTip(text, width) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  const n = Math.max(8, Math.floor(width || 40));
  return s.length <= n ? s : `${s.slice(0, Math.max(1, n - 1))}…`;
}
