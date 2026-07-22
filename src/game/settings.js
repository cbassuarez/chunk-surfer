// The service menu. One machine, a row of tabs across the top, reached from the
// title and from [Esc] in the field. It is an AUDIOCORP service panel, not a
// generic options screen: expected game settings, phrased as machine controls.

import * as scenes from './scenes.js';
import { uiSize, uiText, uiCenter, uiScrim } from '../render/ui.js';
import { drawMachinePanel } from '../render/presentation.js';
import { getSave, saveCommit, clearSave, clearAllData } from './save.js';
import { controllerSettings, inputPrompt, promptLine } from './bindings.js';
import { settingsFooterTips, clipTip } from './settings-tips.js';
import {
  applyVfdSettings, vfdSettings, PHOSPHOR_THEMES, PHOSPHOR_LABEL,
  FLICKER_LEVELS, FLICKER_LABEL, vfdFlickerLevel,
} from '../render/palette.js';
import * as AUDIO from '../audio/story-audio.js';
import { RULE_LABELS, RULE_OPTIONS, VALUE_LABELS } from '../progression/difficulty-defs.js';
import {
  cycleDisplayOption,
  labelDisplayOption,
  normalizeDisplaySettings,
} from '../platform/display-policy.js';
import { formatFps } from '../platform/about-system.js';
import {
  PERSONAL_INTERFERENCE_INTENSITIES,
  PERSONAL_INTERFERENCE_LABEL,
  normalizePersonalInterferenceSettings,
} from './personalized-interference.js';

const MIC_LABEL = {
  idle: 'OFF',
  asking: 'ASKING…',
  on: 'LIVE',
  denied: 'BLOCKED',
  unavailable: 'NO INPUT',
  error: 'ERROR',
  test: 'TEST',
};
const MIC_CHANNEL_MODES = ['mono', 'left', 'right'];
const MIC_CHANNEL_LABEL = { mono: 'MONO MIX', left: 'LEFT', right: 'RIGHT' };
const FX_MODES = ['off', 'reduced', 'full'];
const FX_LABEL = { off: 'OFF', reduced: 'REDUCED', full: 'FULL' };
const HINT_MODES = ['off', 'reduced', 'full'];
const HINT_LABEL = { off: 'OFF', reduced: 'SPARSE', full: 'FULL' };
const SEEN_TEXT_MODES = ['normal', 'fast', 'instant'];
const SEEN_TEXT_LABEL = { normal: 'NORMAL', fast: 'FAST WHEN HELD', instant: 'INSTANT WHEN HELD' };
const HUSH_AUDIO_MODES = ['reduced', 'full'];
const HUSH_AUDIO_LABEL = { reduced: 'REDUCED', full: 'FULL' };
const HUSH_LIGHT_MODES = ['off', 'reduced', 'full'];
const BACKGROUND_AUDIO_MODES = ['continue', 'pause'];
const BACKGROUND_AUDIO_LABEL = { continue: 'CONTINUE', pause: 'PAUSE WHEN UNFOCUSED' };

// A bar like ◀▮▮▮▯▯▶ for a 0..1 value.
function bar(v, n = 10) {
  const lit = Math.round(Math.max(0, Math.min(1, Number(v) || 0)) * n);
  let s = '◀';
  for (let k = 0; k < n; k++) s += k < lit ? '▮' : '▯';
  return s + '▶';
}

function fmtTime(seconds = 0) {
  const t = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function makeSettingsScene({ inGame = false, initialTab = null, hooks = {} } = {}) {
  const s = () => getSave().settings || {};
  const setting = (key, fallback) => s()[key] ?? fallback;
  const set = (key, value) => { saveCommit({ settings: { ...s(), [key]: value } }); };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  let armed = null; // { key, until }
  let pendingChallenge = null; // { key, change, until }
  const now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

  function clearExpiredArm() {
    const t = now();
    if (armed && t > armed.until) armed = null;
    if (pendingChallenge && t > pendingChallenge.until) pendingChallenge = null;
  }

  function arm(key, fn) {
    clearExpiredArm();
    if (armed?.key === key) {
      armed = null;
      fn?.();
      return;
    }
    armed = { key, until: now() + 2400 };
  }

  function armedValue(key) {
    clearExpiredArm();
    return armed?.key === key ? 'CONFIRM' : 'ARM';
  }

  function cycleSetting(key, list, d, fallback = list[0]) {
    const cur = setting(key, fallback);
    const i = list.indexOf(cur);
    set(key, list[(Math.max(0, i) + d + list.length) % list.length]);
  }

  function displaySettings() {
    return normalizeDisplaySettings(s().display || {});
  }

  function patchDisplaySettings(patch) {
    const current = displaySettings();
    const next = normalizeDisplaySettings({ ...current, ...patch });
    if (hooks.onDisplayChange) {
      hooks.onDisplayChange(patch, next);
      return;
    }
    saveCommit({ settings: { ...s(), display: next } });
  }

  function cycleDisplay(key, contractKey, d) {
    const current = displaySettings()[key];
    patchDisplaySettings({
      [key]: cycleDisplayOption(contractKey, current, d),
    });
  }

  function displayLabel(key, contractKey) {
    return labelDisplayOption(contractKey, displaySettings()[key]);
  }

  const controllerPrefs = () => setting('controller', controllerSettings());
  const controllerPatch = (patch) => {
    const next = { ...controllerPrefs(), ...patch };
    set('controller', next);
    hooks.onControllerSettingsChange?.(next);
  };
  const pctController = (key, fallback = 1) => `${Math.round(Number(controllerPrefs()[key] ?? fallback) * 100)}%`;
  const micSnapshot = () => hooks.micSnapshot?.() || { state: hooks.micStatus?.() || 'idle', devices: [], devicesKnown: false };
  const micInputPrefs = () => {
    const source = setting('micInput', {});
    return {
      deviceId: typeof source.deviceId === 'string' && source.deviceId ? source.deviceId : 'default',
      channelMode: MIC_CHANNEL_MODES.includes(source.channelMode) ? source.channelMode : 'mono',
      echoCancellation: source.echoCancellation !== false,
      noiseSuppression: !!source.noiseSuppression,
      autoGainControl: !!source.autoGainControl,
      lastDeviceLabel: typeof source.lastDeviceLabel === 'string' ? source.lastDeviceLabel : '',
    };
  };
  const micDeviceChoices = () => {
    const seen = new Set(['default']);
    const choices = [{ deviceId: 'default', label: 'SYSTEM DEFAULT' }];
    for (const device of micSnapshot().devices || []) {
      if (!device.deviceId || seen.has(device.deviceId)) continue;
      seen.add(device.deviceId);
      choices.push({
        deviceId: device.deviceId,
        label: String(device.label || 'MICROPHONE').toUpperCase(),
      });
    }
    return choices;
  };
  const patchMicInput = (patch) => {
    const next = { ...micInputPrefs(), ...patch };
    set('micInput', next);
    hooks.onMicInputChange?.(next);
  };
  const micInputLabel = () => {
    const snap = micSnapshot();
    if (snap.devicesKnown && !(snap.devices || []).length) return 'NO INPUT FOUND';
    const prefs = micInputPrefs();
    if (prefs.deviceId === 'default') {
      if (!snap.devicesKnown && snap.state !== 'on' && snap.state !== 'test') return 'SYSTEM DEFAULT';
      return 'SYSTEM DEFAULT';
    }
    const match = (snap.devices || []).find((d) => d.deviceId === prefs.deviceId);
    if (match?.label) return String(match.label).toUpperCase().slice(0, 28);
    return String(prefs.lastDeviceLabel || 'SELECTED INPUT').toUpperCase().slice(0, 28);
  };
  const cycleMicInput = (d) => {
    const choices = micDeviceChoices();
    if (choices.length <= 1) {
      hooks.refreshMicDevices?.();
      return;
    }
    const prefs = micInputPrefs();
    const at = Math.max(0, choices.findIndex((choice) => choice.deviceId === prefs.deviceId));
    const next = choices[(at + d + choices.length) % choices.length];
    patchMicInput({ deviceId: next.deviceId, lastDeviceLabel: next.deviceId === 'default' ? '' : next.label });
  };
  const cycleMicChannel = (d) => {
    const prefs = micInputPrefs();
    const at = Math.max(0, MIC_CHANNEL_MODES.indexOf(prefs.channelMode));
    patchMicInput({ channelMode: MIC_CHANNEL_MODES[(at + d + MIC_CHANNEL_MODES.length) % MIC_CHANNEL_MODES.length] });
  };

  function personalInterference() {
    return normalizePersonalInterferenceSettings(s().personalInterference);
  }

  function setPersonalInterference(patch) {
    const current = personalInterference();
    set('personalInterference', normalizePersonalInterferenceSettings({ ...current, ...patch }));
    hooks.onPersonalInterferenceChange?.();
  }

  function cyclePersonalInterferenceIntensity(d) {
    const cur = personalInterference().intensity;
    const i = Math.max(0, PERSONAL_INTERFERENCE_INTENSITIES.indexOf(cur));
    setPersonalInterference({
      intensity: PERSONAL_INTERFERENCE_INTENSITIES[(i + d + PERSONAL_INTERFERENCE_INTENSITIES.length) % PERSONAL_INTERFERENCE_INTENSITIES.length],
    });
  }

  // Display settings live in vfdSettings (applied live) AND in save.settings.vfd
  // (so they survive a reload). Write both every time.
  function setVfd(patch) {
    applyVfdSettings(patch);
    saveCommit({
      settings: {
        ...s(),
        vfd: {
          phosphor: vfdSettings.phosphor,
          brightness: vfdSettings.brightness,
          flicker: vfdFlickerLevel(),
        },
      },
    });
  }

  function cycleVfd(key, list, d) {
    const cur = key === 'flicker' ? vfdFlickerLevel() : vfdSettings[key];
    const i = list.indexOf(cur);
    setVfd({ [key]: list[(Math.max(0, i) + d + list.length) % list.length] });
  }

  function returnToTitle() {
    scenes.pop();
    hooks.onQuitToTitle?.();
  }
    
    function pct(key, fallback = 1) {
      return `${Math.round(setting(key, fallback) * 100)}%`;
    }

    function section(label) {
      return { kind: 'section', label, selectable: false };
    }

    function isSelectable(row) {
      return !!row && row.kind !== 'section' && row.selectable !== false;
    }

    function firstSelectableIndex(rows = rowsOf()) {
      const at = rows.findIndex(isSelectable);
      return at >= 0 ? at : 0;
    }

    function moveSelection(delta) {
      const rows = rowsOf();
      if (!rows.length) { sel = 0; return; }
      for (let n = 0; n < rows.length; n++) {
        sel = (sel + delta + rows.length) % rows.length;
        if (isSelectable(rows[sel])) break;
      }
      armed = null;
      pendingChallenge = null;
      AUDIO.menuMove();
    }

    function setAudioLevel(key, hookName, d) {
      const v = clamp(setting(key, 1) + d * 0.1, 0, 1);
      const next = +v.toFixed(2);
      set(key, next);
      hooks[hookName]?.(next);
    }

    function setReplaySetting(key, value) {
      set(key, value);
      hooks.setReplaySetting?.(key, value);
    }

    function cycleReplaySetting(key, values, d, fallback = values[0]) {
      const current = setting(key, fallback);
      const at = Math.max(0, values.indexOf(current));
      setReplaySetting(key, values[(at + d + values.length) % values.length]);
    }


    const challengeRules = () => hooks.challengeRules?.() || null;
    const challengeIntegrity = () => hooks.challengeIntegrity?.() || null;
    const challengeValue = (key) => challengeRules()?.values?.[key];

    function requestChallengeChange(key, d) {
      const options = RULE_OPTIONS[key] || [];
      if (!options.length) return;
      const current = challengeValue(key) || options[0];
      const at = Math.max(0, options.indexOf(current));
      const next = options[(at + d + options.length) % options.length];
      const preview = hooks.previewChallengeChange?.(key, next) || {
        allowed: true,
        needsIntegrityWarning: false,
        change: { key, from: current, to: next },
      };
      if (!preview.allowed) return;
      if (preview.needsIntegrityWarning) {
        pendingChallenge = {
          key,
          change: preview.change,
          until: now() + 6000,
        };
        return;
      }
      hooks.applyChallengeChange?.(preview.change);
      pendingChallenge = null;
    }

    function challengeDisplay(key) {
      clearExpiredArm();
      if (pendingChallenge?.key === key) return 'END DEAD AIR? ENTER';
      return VALUE_LABELS[challengeValue(key)] || String(challengeValue(key) || 'STANDARD').toUpperCase();
    }

    function confirmPendingChallenge(key) {
      clearExpiredArm();
      if (pendingChallenge?.key !== key) return false;
      hooks.applyChallengeChange?.(pendingChallenge.change);
      pendingChallenge = null;
      return true;
    }
    
    const tabs = [
      {
        id: 'display', name: 'DISPLAY',
        rows: [
          { id: 'displayMode', label: 'DISPLAY MODE',
            value: () => displayLabel('displayMode', 'displayModes').toUpperCase(),
            adjust: (d) => cycleDisplay('displayMode', 'displayModes', d) },
          { id: 'windowPreset', label: 'RESOLUTION',
            value: () => displaySettings().displayMode === 'game-mode'
              ? 'DESKTOP NATIVE'
              : displayLabel('windowPreset', 'windowPresets'),
            adjust: (d) => {
              if (displaySettings().displayMode !== 'game-mode') cycleDisplay('windowPreset', 'windowPresets', d);
            } },
          { id: 'uiScale', label: 'INTERFACE SCALE',
            value: () => displayLabel('uiScale', 'uiScalePresets'),
            adjust: (d) => cycleDisplay('uiScale', 'uiScalePresets', d) },
          { id: 'renderScale', label: 'RENDER QUALITY',
            value: () => displayLabel('renderScale', 'renderScalePresets').toUpperCase(),
            adjust: (d) => cycleDisplay('renderScale', 'renderScalePresets', d) },
          { id: 'phosphor', label: 'PHOSPHOR',
            value: () => PHOSPHOR_LABEL[vfdSettings.phosphor] ?? String(vfdSettings.phosphor).toUpperCase(),
            adjust: (d) => cycleVfd('phosphor', PHOSPHOR_THEMES, d) },
          { id: 'brightness', label: 'VFD BRIGHTNESS',
            value: () => `${Math.round(vfdSettings.brightness * 100)}%`,
            adjust: (d) => setVfd({ brightness: clamp(vfdSettings.brightness + d * 0.05, 0.55, 1.25) }) },
          { id: 'flicker', label: 'VFD FLICKER',
            value: () => FLICKER_LABEL[vfdFlickerLevel()],
            adjust: (d) => cycleVfd('flicker', FLICKER_LEVELS, d) },
          { id: 'visualFx', label: 'VISUAL FX',
            value: () => setting('fx', true) ? 'ON' : 'OFF',
            adjust: () => set('fx', !setting('fx', true)) },
          { id: 'resetDisplaySettings', label: 'RESET DISPLAY SETTINGS',
            value: () => armedValue('resetDisplaySettings'),
            activate: () => arm('resetDisplaySettings', () => hooks.resetDisplaySettings?.()) },
        ],
      },
      {
        id: 'audio', name: 'AUDIO',
        rows: [
          { id: 'global', label: 'GLOBAL',
            value: () => pct('volume', 1), bar: () => setting('volume', 1),
            adjust: (d) => setAudioLevel('volume', 'setGlobalVolume', d) },
          { id: 'dialog', label: 'SPOKEN / DIALOG',
            value: () => pct('dialog', 1), bar: () => setting('dialog', 1),
            adjust: (d) => setAudioLevel('dialog', 'setDialogVolume', d) },
          { id: 'sfx', label: 'SFX',
            value: () => pct('sfx', 1), bar: () => setting('sfx', 1),
            adjust: (d) => setAudioLevel('sfx', 'setSfxVolume', d) },
          { id: 'music', label: 'MUSIC',
            value: () => pct('music', 1), bar: () => setting('music', 1),
            adjust: (d) => setAudioLevel('music', 'setMusicVolume', d) },
          { id: 'monitorGain', label: 'MONITOR GAIN',
            value: () => pct('monitorGain', 1), bar: () => setting('monitorGain', 1),
            adjust: (d) => setAudioLevel('monitorGain', 'setMonitorVolume', d) },
          { id: 'backgroundAudio', label: 'BACKGROUND AUDIO',
            value: () => BACKGROUND_AUDIO_LABEL[setting('backgroundAudio', 'continue')] || 'CONTINUE',
            adjust: (d) => {
              cycleSetting('backgroundAudio', BACKGROUND_AUDIO_MODES, d, 'continue');
              hooks.onBackgroundAudioChange?.();
            } },
        ],
      },
      {
        id: 'input', name: 'INPUT',
        rows: [
          // The scheme is fixed: WASD/arrows walk and strafe, the mouse looks.
          // What is left to tune is the hand, not the contract.
          { id: 'mouseSensitivity', label: 'MOUSE LOOK',
            value: () => `${Math.round(Number(setting('mouseSensitivity', 1)) * 100)}%`,
            adjust: (d) => set('mouseSensitivity', clamp(Number(setting('mouseSensitivity', 1)) + d * 0.1, 0.2, 3)) },
          { id: 'mouseInvertY', label: 'INVERT LOOK',
            value: () => (setting('mouseInvertY', false) ? 'ON' : 'OFF'),
            adjust: () => set('mouseInvertY', !setting('mouseInvertY', false)) },
          { id: 'controlMap', label: 'CONTROLLER', value: () => controllerPrefs().enabled === false ? 'OFF' : (hooks.controllerName?.() || 'NO CONTROLLER'),
            adjust: () => controllerPatch({ enabled: controllerPrefs().enabled === false }) },
          { id: 'configureController', label: 'CONFIGURE CONTROLLER', value: () => inputPrompt('confirm'), activate: () => hooks.openControllerSettings?.() },
          { id: 'controllerLookSensitivity', label: 'LOOK SENSITIVITY',
            value: () => pctController('lookSensitivity', 1),
            adjust: (d) => controllerPatch({ lookSensitivity: clamp(Number(controllerPrefs().lookSensitivity ?? 1) + d * 0.1, 0.25, 2.5) }) },
          { id: 'controllerMoveDeadzone', label: 'MOVE DEADZONE',
            value: () => pctController('moveDeadzone', 0.12),
            adjust: (d) => controllerPatch({ moveDeadzone: clamp(Number(controllerPrefs().moveDeadzone ?? 0.12) + d * 0.02, 0, 0.6) }) },
          { id: 'controllerLookDeadzone', label: 'LOOK DEADZONE',
            value: () => pctController('lookDeadzone', 0.16),
            adjust: (d) => controllerPatch({ lookDeadzone: clamp(Number(controllerPrefs().lookDeadzone ?? 0.16) + d * 0.02, 0, 0.7) }) },
          { id: 'controllerInvertLookY', label: 'INVERT LOOK Y',
            value: () => controllerPrefs().invertLookY ? 'ON' : 'OFF',
            adjust: () => controllerPatch({ invertLookY: !controllerPrefs().invertLookY }) },
          { id: 'resetInputBindings', label: 'RESET CONTROLLER',
            value: () => armedValue('resetInputBindings'),
            activate: () => arm('resetInputBindings', () => hooks.resetInputBindings?.() || hooks.resetControllerBindings?.()) },
          { id: 'micStatus', label: 'MIC STATUS',
            value: () => MIC_LABEL[micSnapshot().state || 'idle'] || 'OFF' },
          { id: 'mic', label: 'USE ROOM MIC',
            value: () => setting('mic', 'ask') === 'ask' ? 'ASK AT NEW GAME' : setting('mic', 'ask') === 'off' ? 'OFF' : 'ON',
            adjust: () => set('mic', setting('mic', 'ask') === 'on' ? 'off' : 'on') },
          { id: 'micInput', label: 'MIC INPUT',
            value: micInputLabel,
            adjust: cycleMicInput,
            activate: () => hooks.refreshMicDevices?.() },
          { id: 'micChannel', label: 'MIC CHANNEL',
            value: () => MIC_CHANNEL_LABEL[micInputPrefs().channelMode] || 'MONO MIX',
            adjust: cycleMicChannel },
          { id: 'enableMic', label: 'ENABLE MIC',
            value: () => inputPrompt('confirm'), activate: () => hooks.enableMic?.() },
          { id: 'testMic', label: 'TEST MIC',
            value: () => {
              const snap = micSnapshot();
              if (snap.state === 'on' || snap.state === 'test') return `${Math.round(Number(snap.level || 0) * 100)}%`;
              if (snap.state === 'unavailable') return 'NO INPUT';
              return inputPrompt('confirm');
            },
            activate: () => hooks.enableMic?.() },
          { id: 'rescanMic', label: 'RESCAN INPUTS',
            value: () => inputPrompt('confirm'), activate: () => hooks.refreshMicDevices?.() },
        ],
      },
      {
        id: 'access', name: 'ACCESSIBILITY',
        rows: [
          { id: 'textRate', label: 'TEXT RATE',
            value: () => `${setting('textCps', 42)} CPS`,
            adjust: (d) => set('textCps', clamp(Number(setting('textCps', 42)) + d * 6, 12, 120)) },
          { id: 'instantText', label: 'INSTANT TEXT',
            value: () => setting('instantText', false) ? 'ON' : 'OFF',
            adjust: () => set('instantText', !setting('instantText', false)) },
          { id: 'flash', label: 'FLASH / STROBE',
            value: () => FX_LABEL[setting('flash', 'full')] || 'FULL',
            adjust: (d) => cycleSetting('flash', FX_MODES, d, 'full') },
          { id: 'shake', label: 'SCREEN SHAKE',
            value: () => FX_LABEL[setting('shake', 'full')] || 'FULL',
            adjust: (d) => cycleSetting('shake', FX_MODES, d, 'full') },
          { id: 'dread', label: 'DREAD SPIKES',
            value: () => setting('reduceDread', false) ? 'REDUCED' : 'FULL',
            adjust: () => set('reduceDread', !setting('reduceDread', false)) },
          section('Privacy & Horror'),
          { id: 'personalInterference', label: 'PERSONALIZED INTERFERENCE',
            value: () => personalInterference().enabled ? 'ON' : 'OFF',
            adjust: () => setPersonalInterference({ enabled: !personalInterference().enabled }) },
          { id: 'personalSourcesSteam', label: 'USE STEAM NAME',
            value: () => personalInterference().sourceSteam ? 'ON' : 'OFF',
            adjust: () => setPersonalInterference({ sourceSteam: !personalInterference().sourceSteam }) },
          { id: 'personalSourcesOs', label: 'USE OS USERNAME',
            value: () => personalInterference().sourceOs ? 'ON' : 'OFF',
            adjust: () => setPersonalInterference({ sourceOs: !personalInterference().sourceOs }) },
          { id: 'personalVfdText', label: 'USE IN VFD TEXT',
            value: () => personalInterference().vfdText ? 'ON' : 'OFF',
            adjust: () => setPersonalInterference({ vfdText: !personalInterference().vfdText }) },
          { id: 'personalSpeech', label: 'USE LOCAL SPEECH',
            value: () => personalInterference().localSpeech ? 'ON' : 'OFF',
            adjust: () => setPersonalInterference({ localSpeech: !personalInterference().localSpeech }) },
          { id: 'personalIntensity', label: 'INTERFERENCE INTENSITY',
            value: () => PERSONAL_INTERFERENCE_LABEL[personalInterference().intensity] || 'STANDARD',
            adjust: (d) => cyclePersonalInterferenceIntensity(d) },
          { id: 'hushDistortion', label: 'HUSH DISTORTION',
            value: () => HUSH_AUDIO_LABEL[setting('hushAudioDistortion', 'full')] || 'FULL',
            adjust: (d) => cycleSetting('hushAudioDistortion', HUSH_AUDIO_MODES, d, 'full') },
          { id: 'hushSilence', label: 'HUSH SILENCE DEPTH',
            value: () => HUSH_AUDIO_LABEL[setting('hushSilence', 'full')] || 'FULL',
            adjust: (d) => cycleSetting('hushSilence', HUSH_AUDIO_MODES, d, 'full') },
          { id: 'hushHiss', label: 'HUSH HISS',
            value: () => HUSH_AUDIO_LABEL[setting('hushHiss', 'full')] || 'FULL',
            adjust: (d) => cycleSetting('hushHiss', HUSH_AUDIO_MODES, d, 'full') },
          { id: 'hushCuts', label: 'SUDDEN AUDIO CUTS',
            value: () => setting('hushSuddenCuts', 'full') === 'softened' ? 'SOFTENED' : 'FULL',
            adjust: () => set('hushSuddenCuts', setting('hushSuddenCuts', 'full') === 'softened' ? 'full' : 'softened') },
          { id: 'hushLight', label: 'HUSH LIGHT FLICKER',
            value: () => FX_LABEL[setting('hushLightFlicker', 'full')] || 'FULL',
            adjust: (d) => cycleSetting('hushLightFlicker', HUSH_LIGHT_MODES, d, 'full') },
          { id: 'hushCaptions', label: 'HUSH CUE CAPTIONS',
            value: () => setting('hushCueCaptions', false) ? 'ON' : 'OFF',
            adjust: () => set('hushCueCaptions', !setting('hushCueCaptions', false)) },
        ],
      },
      ...(inGame && hooks.challengeRules ? [{
        id: 'challenge', name: 'CHALLENGE',
        rows: [
          { id: 'shift', label: 'CURRENT SHIFT',
            value: () => String(challengeRules()?.currentPreset || challengeRules()?.startedPreset || 'contract').replaceAll('-', ' ').toUpperCase() },
          ...Object.keys(RULE_LABELS).map((key) => ({
            id: `challenge:${key}`,
            challengeKey: key,
            label: RULE_LABELS[key],
            value: () => challengeDisplay(key),
            adjust: (d) => requestChallengeChange(key, d),
          })),
          { id: 'certification', label: 'DEAD AIR STATUS',
            value: () => {
              const integrity = challengeIntegrity();
              if (!integrity?.startedEligible) return 'NOT APPLICABLE';
              return integrity.eligible ? 'CERTIFIED' : 'ENDED';
            } },
        ],
      }] : []),
      {
        id: 'game', name: 'GAME',
        rows: [
          { id: 'tutorialPrompts', label: 'TUTORIAL PROMPTS',
            value: () => setting('tutorialPrompts', true) ? 'ON' : 'OFF',
            adjust: () => set('tutorialPrompts', !setting('tutorialPrompts', true)) },
          { id: 'objectiveHints', label: 'OBJECTIVE HINTS',
            value: () => HINT_LABEL[setting('objectiveHints', 'full')] || 'FULL',
            adjust: (d) => cycleSetting('objectiveHints', HINT_MODES, d, 'full') },
          { id: 'pauseOnBlur', label: 'PAUSE WHEN BLUR',
            value: () => setting('pauseOnBlur', true) ? 'ON' : 'OFF',
            adjust: () => set('pauseOnBlur', !setting('pauseOnBlur', true)) },
          ...(hooks.replayUnlocks?.()?.seenTextAcceleration ? [
            { id: 'seenTextMode', label: 'SEEN TEXT',
              value: () => SEEN_TEXT_LABEL[setting('seenTextMode', 'fast')] || 'FAST WHEN HELD',
              adjust: (d) => cycleReplaySetting('seenTextMode', SEEN_TEXT_MODES, d, 'fast') },
          ] : []),
          ...(hooks.replayUnlocks?.()?.archiveSignals ? [
            { id: 'archiveSignals', label: 'UNSEEN CHOICE MARKERS',
              value: () => setting('archiveSignals', 'subtle') === 'off' ? 'OFF' : 'SUBTLE',
              adjust: () => setReplaySetting('archiveSignals', setting('archiveSignals', 'subtle') === 'off' ? 'subtle' : 'off') },
          ] : []),
          ...(hooks.replayUnlocks?.()?.condensedCheckIn ? [
            { id: 'condensedCheckIn', label: 'CONDENSED CHECK-IN',
              value: () => setting('condensedCheckIn', false) ? 'ON' : 'OFF',
              adjust: () => setReplaySetting('condensedCheckIn', !setting('condensedCheckIn', false)) },
          ] : []),
          ...(inGame ? [
            { id: 'returnTitle', label: 'RETURN TO TITLE', value: () => inputPrompt('confirm'), activate: returnToTitle },
            { id: 'resume', label: 'RESUME', value: () => inputPrompt('confirm'), activate: () => scenes.pop() },
          ] : []),
        ],
      },
      {
        id: 'memory', name: 'MEMORY',
        rows: [
          { id: 'autosave', label: 'AUTOSAVE', value: () => 'ON' },
          { id: 'playTime', label: 'PLAY TIME', value: () => fmtTime(getSave().playSeconds) },
          { id: 'steps', label: 'STEPS', value: () => String(getSave().steps || 0).padStart(6, '0') },
          { id: 'area', label: 'CURRENT AREA',
            value: () => String(hooks.currentArea?.() || getSave().area || 'PROLOGUE').toUpperCase().slice(0, 22) },
          { id: 'exportProfile', label: 'EXPORT PROFILE', value: () => inputPrompt('confirm'),
            activate: () => hooks.exportProfile?.() },
          { id: 'importProfile', label: 'IMPORT PROFILE', value: () => inputPrompt('confirm'),
            activate: () => hooks.importProfile?.() },
          { id: 'clearRun', label: 'CLEAR RUN',
            value: () => armedValue('clearRun'),
            activate: () => arm('clearRun', () => { clearSave(); returnToTitle(); }) },
          { id: 'clearMemory', label: 'CLEAR MEMORY',
            value: () => armedValue('clearAll'),
            activate: () => arm('clearAll', () => { clearAllData(); returnToTitle(); }) },
        ],
      },
      {
        id: 'system', name: 'ABOUT',
        rows: [
          section('Chunk Surfer'),
          { id: 'about:version', label: 'VERSION', value: () => hooks.version?.() || '0.1.0' },
          { id: 'about:build', label: 'BUILD', value: () => hooks.build?.() || 'LOCAL' },
          { id: 'about:website', label: 'WEBSITE', value: () => 'cbassuarez.com', activate: () => hooks.openWebsite?.() },
          { id: 'about:report', label: 'REPORT A PROBLEM', value: () => inputPrompt('confirm'), activate: () => hooks.reportProblem?.() },
          { id: 'about:copyright', label: 'COPYRIGHT', value: () => hooks.copyright?.() || '© 2026 Sebastian Suarez-Solis' },
          { id: 'about:licence', label: 'LICENCE / EULA', value: () => hooks.licenceVersion?.() || 'VIEW', activate: () => hooks.openLicence?.() },

          section('Performance'),
          { id: 'about:fps', label: 'FPS', value: () => formatFps(hooks.performanceSnapshot?.()?.fps) },
          { id: 'about:runtime', label: 'RUNTIME', value: () => hooks.runtimeLabel?.() || 'Web' },

          section('Support'),
          { id: 'about:copyReport', label: 'COPY DIAGNOSTIC REPORT', value: () => inputPrompt('confirm'), activate: () => hooks.copyDiagnosticReport?.() },
          { id: 'about:exportSave', label: 'EXPORT SAVE BACKUP', value: () => inputPrompt('confirm'), activate: () => hooks.exportSaveBackup?.() },
          { id: 'about:restartAudio', label: 'RESTART AUDIO ENGINE', value: () => inputPrompt('confirm'), activate: () => hooks.restartAudioEngine?.() },

          section('Credits'),
          { id: 'about:credits', label: 'CREDITS', value: () => inputPrompt('confirm'), activate: () => hooks.openCredits?.() },
        ],
      },
    ];

  const rememberedTab=initialTab || setting('menuTab', inGame ? 'game' : 'display');
  let tab = Math.max(0, tabs.findIndex((t) => t.id === rememberedTab));
  if (tab < 0) tab = 0;
  let sel = 0;
  const rowsOf = () => tabs[tab].rows;
  const clampSel = () => {
    const rows = rowsOf();
    sel = Math.max(0, Math.min(rows.length - 1, sel));
    if (!isSelectable(rows[sel])) sel = firstSelectableIndex(rows);
  };

  return {
    id: 'settings',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'calm',

    enter(){ if(inGame) hooks.pauseGame?.(); AUDIO.startMenuHiss(); },
    exit(){ hooks.cancelControllerRemap?.(); AUDIO.stopMenuHiss(); if(inGame) hooks.resumeGame?.(); },

    key(e) {
      const raw=e.key||'', k=raw.toLowerCase(), code=e.code||'';
      const changeTab = (d) => { tab = (tab + d + tabs.length) % tabs.length; sel = firstSelectableIndex(); armed = null; pendingChallenge = null; set('menuTab',tabs[tab].id); AUDIO.menuMove(); };

        if (raw === 'Tab') {
          changeTab(e.shiftKey ? -1 : 1);
          return true;
        }
        if (raw === ']' || k === 'e' || code === 'KeyE') { changeTab(1); return true; }
        if (raw === '[' || k === 'q' || code === 'KeyQ') { changeTab(-1); return true; }
        
      if (raw === 'ArrowUp' || k === 'w' || code === 'KeyW') { moveSelection(-1); return true; }
      if (raw === 'ArrowDown' || k === 's' || code === 'KeyS') { moveSelection(1); return true; }

      clampSel();
      const row = rowsOf()[sel];

      if (raw === 'ArrowLeft' || k === 'a' || code === 'KeyA') { if(isSelectable(row) && row.adjust){ row.adjust(-1); armed = null; AUDIO.menuMove(); } return true; }
      if (raw === 'ArrowRight' || k === 'd' || code === 'KeyD') { if(isSelectable(row) && row.adjust){ row.adjust(1); armed = null; AUDIO.menuMove(); } return true; }

      if (raw === 'Enter' || code === 'Enter' || raw === ' ' || code === 'Space' || k === 'z' || code === 'KeyZ') {
        AUDIO.menuConfirm();
        if (!isSelectable(row)) return true;
        if (row.challengeKey && confirmPendingChallenge(row.challengeKey)) return true;
        if (row.activate) row.activate();
        else if (row.adjust) { row.adjust(1); armed = null; }
        return true;
      }

      if (raw === 'Escape' || code === 'Escape') { scenes.pop(); return true; }
      return true;
    },

    render() {
      clearExpiredArm();

      const { cols, rows: R } = uiSize();
      uiScrim(1);

      const w = Math.min(90, cols - 4), h = Math.min(Math.max(28, R - 8), R - 2);
      const x = Math.floor((cols - w) / 2), y = Math.floor((R - h) / 2);

      const body = drawMachinePanel(x, y, w, h, {
        theme: 'amber',
        wordmark: 'AUDIOCORP',
        label: inGame ? 'SERVICE MENU' : 'MAIN MENU',
        source: 'SETUP',
        footer: promptLine([
          { action: 'tabNext', label: 'SECTION' },
          { action: 'select', label: 'ROW' },
          { action: 'set', label: 'SET' },
          { action: 'confirm', label: 'RUN' },
          ...(inGame ? [] : [{ action: 'back', label: 'DONE' }]),
        ]),
        meter: false,
      });

      const ix = body.x, iy = body.y;
      let tx = ix;

      tabs.forEach((t, i) => {
        const on = i === tab;
        const label = on ? `▸${t.name}` : ` ${t.name}`;
        if (tx + label.length < x + w - 2) uiText(tx, iy, label, on ? 'ui-primary' : 'ui-secondary');
        tx += label.length + 1;
      });

      clampSel();

      const rows = rowsOf();
      const dense = rows.length > 7;
      const step = dense ? 1 : 2;
      const tipRows = cols >= 72 && h >= 22 ? 4 : 3;
      const maxRows = Math.max(1, body.h - 5 - tipRows);
      const start = dense && sel >= maxRows ? Math.min(sel - maxRows + 1, rows.length - maxRows) : 0;
      const visible = dense ? rows.slice(start, start + maxRows) : rows;

      visible.forEach((row, j) => {
        const i = start + j;
        const on = i === sel;
        const ry = iy + 3 + j * step;

        if (row.kind === 'section') {
          const label = String(row.label || '').toUpperCase();
          uiText(ix + 1, ry, label, 'ui-amber');
          const ruleStart = ix + 3 + label.length;
          if (ruleStart < x + w - 4) uiText(ruleStart, ry, '─'.repeat(Math.max(1, x + w - ruleStart - 4)), 'ui-secondary');
          return;
        }

        uiText(ix, ry, `${on ? '▸' : ' '} ${row.label}`, on ? 'ui-primary' : 'ui-secondary');

        const vx = ix + 25;
        const cls = on ? 'ui-amber' : 'ui-secondary';

        if (row.bar) {
          uiText(vx, ry, `${bar(row.bar())} ${row.value()}`, cls);
        } else {
          const v = row.value ? row.value() : '';
          const chev = row.adjust ? `◀ ${v} ▶` : v;
          uiText(vx, ry, String(chev).slice(0, Math.max(1, x + w - vx - 3)), cls);
        }
      });

      if (dense && rows.length > visible.length) {
        const more = start > 0 ? '▲' : start + visible.length < rows.length ? '▼' : '';
        if (more) uiText(x + w - 4, iy + body.h - tipRows - 1, more, 'ui-secondary');
      }

        const selectedRow = rowsOf()[sel] || {};
        const tips = settingsFooterTips({
          tabId: tabs[tab]?.id,
          rowId: selectedRow.id,
          inGame,
          nowMs: now(),
        });

        const footerW = Math.max(12, w - 6);
        const help = tips.help ? `SETTING: ${tips.help}` : '';
        const pro = tips.pro ? `PRO TIP: ${tips.pro}` : '';

        if (cols >= 72 && h >= 22 && help && pro) {
          uiText(body.x, body.y + body.h - 3, clipTip(help, Math.min(footerW, body.w)).toUpperCase(), 'ui-secondary');
          uiText(body.x, body.y + body.h - 2, clipTip(pro, Math.min(footerW, body.w)).toUpperCase(), 'ui-secondary');
        } else {
          const showHelp = Math.floor(now() / 9000) % 2 === 0;
          const one = (showHelp && help) ? help : (pro || help);
          uiCenter(y + h - 3, clipTip(one, footerW).toUpperCase(), 'ui-secondary');
        }
    },
  };
}
