// The service menu. One machine, a row of tabs across the top, reached from the
// title and from [Esc] in the field. It is an AUDIOCORP service panel, not a
// generic options screen: expected game settings, phrased as machine controls.

import * as scenes from './scenes.js';
import { uiSize, uiText, uiCenter, uiScrim } from '../render/ui.js';
import { drawMachinePanel } from '../render/presentation.js';
import { getSave, saveCommit, clearSave, clearAllData } from './save.js';
import { bindingLabel, controllerBindingLabel } from './bindings.js';
import { settingsFooterTips, clipTip } from './settings-tips.js';
import {
  applyVfdSettings, vfdSettings, PHOSPHOR_THEMES, PHOSPHOR_LABEL,
  FLICKER_LEVELS, FLICKER_LABEL, vfdFlickerLevel,
} from '../render/palette.js';
import * as AUDIO from '../audio/story-audio.js';
import { RULE_LABELS, RULE_OPTIONS, VALUE_LABELS } from '../progression/difficulty-defs.js';

const MIC_LABEL = { idle: 'OFF', asking: 'ASKING…', on: 'LIVE', denied: 'BLOCKED', test: 'TEST' };
const FX_MODES = ['off', 'reduced', 'full'];
const FX_LABEL = { off: 'OFF', reduced: 'REDUCED', full: 'FULL' };
const HINT_MODES = ['off', 'reduced', 'full'];
const HINT_LABEL = { off: 'OFF', reduced: 'SPARSE', full: 'FULL' };
const SEEN_TEXT_MODES = ['normal', 'fast', 'instant'];
const SEEN_TEXT_LABEL = { normal: 'NORMAL', fast: 'FAST WHEN HELD', instant: 'INSTANT WHEN HELD' };

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

  const controlValue = (action) => hooks.controllerRemapAction?.() === action
    ? 'PRESS A CONTROLLER BUTTON…'
    : `${bindingLabel(action)} · ${controllerBindingLabel(action)}`;
  const remap = (action) => hooks.beginControllerRemap?.(action);

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
          { id: 'phosphor', label: 'PHOSPHOR',
            value: () => PHOSPHOR_LABEL[vfdSettings.phosphor] ?? String(vfdSettings.phosphor).toUpperCase(),
            adjust: (d) => cycleVfd('phosphor', PHOSPHOR_THEMES, d) },
          { id: 'brightness', label: 'BRIGHTNESS',
            value: () => `${Math.round(vfdSettings.brightness * 100)}%`,
            adjust: (d) => setVfd({ brightness: clamp(vfdSettings.brightness + d * 0.05, 0.55, 1.25) }) },
          { id: 'flicker', label: 'FLICKER',
            value: () => FLICKER_LABEL[vfdFlickerLevel()],
            adjust: (d) => cycleVfd('flicker', FLICKER_LEVELS, d) },
          { id: 'visualFx', label: 'VISUAL FX',
            value: () => setting('fx', true) ? 'ON' : 'OFF',
            adjust: () => set('fx', !setting('fx', true)) },
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
        ],
      },
      {
        id: 'input', name: 'INPUT',
        rows: [
          { id: 'controlMap', label: 'CONTROLLER', value: () => hooks.controllerName?.() || 'NO CONTROLLER' },
          { id: 'move', label: 'MOVE / TURN', value: () => controlValue('move') },
          { id: 'quiet', label: 'QUIET', value: () => controlValue('quiet'), activate: () => remap('quiet') },
          { id: 'light', label: 'LIGHT', value: () => controlValue('light'), activate: () => remap('light') },
          { id: 'bag', label: 'BAG', value: () => controlValue('bag'), activate: () => remap('bag') },
          { id: 'recorder', label: 'RECORDER', value: () => controlValue('recorder'), activate: () => remap('recorder') },
          { id: 'interact', label: 'INTERACT', value: () => controlValue('interact'), activate: () => remap('interact') },
          { id: 'playback', label: 'PLAYBACK', value: () => controlValue('playback'), activate: () => remap('playback') },
          { id: 'menu', label: 'MENU / PAUSE', value: () => controlValue('menu'), activate: () => remap('menu') },
          { id: 'confirm', label: 'CONFIRM', value: () => controlValue('confirm'), activate: () => remap('confirm') },
          { id: 'back', label: 'BACK', value: () => controlValue('back'), activate: () => remap('back') },
          { id: 'resetController', label: 'RESET PAD MAP', value: () => '[ENTER]', activate: () => hooks.resetControllerBindings?.() },
          { id: 'micStatus', label: 'MIC STATUS',
            value: () => MIC_LABEL[hooks.micStatus?.() || 'idle'] || 'OFF' },
          { id: 'mic', label: 'USE ROOM MIC',
            value: () => setting('mic', 'ask') === 'ask' ? 'ASK AT NEW GAME' : setting('mic', 'ask') === 'off' ? 'OFF' : 'ON',
            adjust: () => set('mic', setting('mic', 'ask') === 'on' ? 'off' : 'on') },
          { id: 'enableMic', label: 'ENABLE MIC',
            value: () => '[ENTER]', activate: () => hooks.enableMic?.() },
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
            { id: 'returnTitle', label: 'RETURN TO TITLE', value: () => '[ENTER]', activate: returnToTitle },
            { id: 'resume', label: 'RESUME', value: () => '[ENTER]', activate: () => scenes.pop() },
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
          { id: 'exportProfile', label: 'EXPORT PROFILE', value: () => '[ENTER]',
            activate: () => hooks.exportProfile?.() },
          { id: 'importProfile', label: 'IMPORT PROFILE', value: () => '[ENTER]',
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
        id: 'system', name: 'SYSTEM',
        rows: [
          { id: 'fullscreen', label: 'FULLSCREEN',
            value: () => document.fullscreenElement ? 'ON' : '[ENTER]', activate: () => hooks.requestFullscreen?.() },
          { id: 'panelFocus', label: 'PANEL FOCUS',
            value: () => '[ENTER]', activate: () => hooks.focusPanel?.() },
          { id: 'version', label: 'VERSION', value: () => hooks.version?.() || '0.1.0' },
          { id: 'build', label: 'BUILD', value: () => hooks.build?.() || 'LOCAL' },
        ],
      },
    ];

  const rememberedTab=initialTab || setting('menuTab', inGame ? 'game' : 'display');
  let tab = Math.max(0, tabs.findIndex((t) => t.id === rememberedTab));
  if (tab < 0) tab = 0;
  let sel = 0;
  const rowsOf = () => tabs[tab].rows;
  const clampSel = () => { sel = Math.max(0, Math.min(rowsOf().length - 1, sel)); };

  return {
    id: 'settings',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'calm',

    enter(){ if(inGame) hooks.pauseGame?.(); AUDIO.startMenuHiss(); },
    exit(){ hooks.cancelControllerRemap?.(); AUDIO.stopMenuHiss(); if(inGame) hooks.resumeGame?.(); },

    key(e) {
      const raw=e.key||'', k=raw.toLowerCase(), code=e.code||'';
      const changeTab = (d) => { tab = (tab + d + tabs.length) % tabs.length; sel = 0; armed = null; pendingChallenge = null; set('menuTab',tabs[tab].id); AUDIO.menuMove(); };

        if (raw === 'Tab') {
          changeTab(e.shiftKey ? -1 : 1);
          return true;
        }
        if (raw === ']' || k === 'e' || code === 'KeyE') { changeTab(1); return true; }
        if (raw === '[' || k === 'q' || code === 'KeyQ') { changeTab(-1); return true; }
        
      if (raw === 'ArrowUp' || k === 'w' || code === 'KeyW') { sel = (sel - 1 + rowsOf().length) % rowsOf().length; armed = null; pendingChallenge = null; AUDIO.menuMove(); return true; }
      if (raw === 'ArrowDown' || k === 's' || code === 'KeyS') { sel = (sel + 1) % rowsOf().length; armed = null; pendingChallenge = null; AUDIO.menuMove(); return true; }

      clampSel();
      const row = rowsOf()[sel];

      if (raw === 'ArrowLeft' || k === 'a' || code === 'KeyA') { if(row.adjust){ row.adjust(-1); armed = null; AUDIO.menuMove(); } return true; }
      if (raw === 'ArrowRight' || k === 'd' || code === 'KeyD') { if(row.adjust){ row.adjust(1); armed = null; AUDIO.menuMove(); } return true; }

      if (raw === 'Enter' || code === 'Enter' || raw === ' ' || code === 'Space' || k === 'z' || code === 'KeyZ') {
        AUDIO.menuConfirm();
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

      const w = Math.min(86, cols - 4), h = Math.min(24, R - 2);
      const x = Math.floor((cols - w) / 2), y = Math.floor((R - h) / 2);

      const body = drawMachinePanel(x, y, w, h, {
        theme: 'amber',
        wordmark: 'AUDIOCORP',
        label: inGame ? 'SERVICE MENU' : 'MAIN MENU',
        source: 'SETUP',
        footer: `[TAB] SECTION · [↑↓] ROW · [←→] SET · [ENTER] RUN${inGame ? '' : ' · [ESC] DONE'}`,
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
      const maxRows = Math.max(1, body.h - 5);
      const start = dense && sel >= maxRows ? Math.min(sel - maxRows + 1, rows.length - maxRows) : 0;
      const visible = dense ? rows.slice(start, start + maxRows) : rows;

      visible.forEach((row, j) => {
        const i = start + j;
        const on = i === sel;
        const ry = iy + 3 + j * step;

        uiText(ix, ry, `${on ? '▸' : ' '} ${row.label}`, on ? 'ui-primary' : 'ui-secondary');

        const vx = ix + 22;
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
        if (more) uiText(x + w - 4, iy + body.h - 2, more, 'ui-secondary');
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
          uiText(x + 3, y + h - 4, clipTip(help, footerW).toUpperCase(), 'ui-secondary');
          uiText(x + 3, y + h - 3, clipTip(pro, footerW).toUpperCase(), 'ui-secondary');
        } else {
          const showHelp = Math.floor(now() / 9000) % 2 === 0;
          const one = (showHelp && help) ? help : (pro || help);
          uiCenter(y + h - 3, clipTip(one, footerW).toUpperCase(), 'ui-secondary');
        }
    },
  };
}
