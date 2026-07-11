// The service menu. One machine, a row of tabs across the top, reached from the
// title and from [Esc] in the field. It is an Akai front panel: amber, flat
// glass, silkscreen legends, and exactly the settings this game has a reason to
// offer — how it looks, how loud it is, whether it may listen to your room, and
// how much of the dread it is allowed to do to you.
//
// It owns no audio and no display state of its own: DISPLAY writes through
// applyVfdSettings, AUDIO/MIC through hooks main.js hands it, and everything
// persists to save.settings the instant it changes.

import * as scenes from './scenes.js';
import { uiSize, uiText, uiCenter, uiScrim } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { getSave, saveCommit } from './save.js';
import { applyVfdSettings, vfdSettings } from '../render/palette.js';

const PHOSPHORS = ['faithful', 'amber', 'green', 'cyan'];
const PHOSPHOR_LABEL = { faithful: 'FAITHFUL', amber: 'AMBER', green: 'GREEN', cyan: 'CYAN' };
const MIC_LABEL = { idle: 'OFF', asking: 'ASKING…', on: 'LIVE', denied: 'BLOCKED', test: 'TEST' };

// A bar like ◀▮▮▮▯▯▶ for a 0..1 value.
function bar(v, n = 10) {
  const lit = Math.round(v * n);
  let s = '◀';
  for (let k = 0; k < n; k++) s += k < lit ? '▮' : '▯';
  return s + '▶';
}

export function makeSettingsScene({ inGame = false, initialTab = 'display', hooks = {} } = {}) {
  const s = () => getSave().settings;
  const set = (key, value) => { saveCommit({ settings: { ...s(), [key]: value } }); };

  // ── the tabs ────────────────────────────────────────────────────────────────
  const tabs = [
    {
      id: 'display', name: 'DISPLAY',
      rows: [
        { label: 'PHOSPHOR', value: () => PHOSPHOR_LABEL[vfdSettings.phosphor],
          adjust: (d) => cycle('phosphor', PHOSPHORS, d) },
        { label: 'BRIGHTNESS', value: () => `${Math.round(vfdSettings.brightness * 100)}%`,
          adjust: (d) => setVfd({ brightness: clamp(vfdSettings.brightness + d * 0.05, 0.55, 1.25) }) },
        { label: 'FLICKER', value: () => vfdSettings.flicker ? 'ON' : 'OFF',
          adjust: () => setVfd({ flicker: !vfdSettings.flicker }) },
      ],
    },
    {
      id: 'audio', name: 'AUDIO',
      rows: [
        { label: 'OUTPUT', value: () => `${Math.round(s().volume * 100)}%`, bar: () => s().volume,
          adjust: (d) => { const v = clamp((s().volume ?? 1) + d * 0.1, 0, 1); set('volume', +v.toFixed(2)); hooks.setOutputVolume?.(v); } },
        { label: 'MUSIC', value: () => `${Math.round((s().music ?? 1) * 100)}%`, bar: () => (s().music ?? 1),
          adjust: (d) => { const v = clamp((s().music ?? 1) + d * 0.1, 0, 1); set('music', +v.toFixed(2)); hooks.setMusicVolume?.(v); } },
      ],
    },
    {
      id: 'mic', name: 'MICROPHONE',
      rows: [
        { label: 'STATUS', value: () => MIC_LABEL[hooks.micStatus?.() || 'idle'] || 'OFF' },
        { label: 'ENABLE MIC', value: () => '[ENTER]', activate: () => hooks.enableMic?.() },
        { label: 'USE ROOM MIC', value: () => (s().mic === 'off' ? 'OFF' : 'ON'),
          adjust: () => set('mic', s().mic === 'off' ? 'on' : 'off') },
      ],
    },
    {
      id: 'game', name: 'GAMEPLAY',
      rows: [
        { label: 'TEXT RATE', value: () => `${s().textCps} CPS`,
          adjust: (d) => set('textCps', clamp(s().textCps + d * 6, 12, 120)) },
        { label: 'VISUAL EFFECTS', value: () => s().fx ? 'ON' : 'OFF', adjust: () => set('fx', !s().fx) },
        { label: 'INTENSE EFFECTS', value: () => s().reduceDread ? 'REDUCED' : 'FULL',
          adjust: () => set('reduceDread', !s().reduceDread) },
        ...(inGame ? [
          { label: 'RETURN TO TITLE', value: () => '[ENTER]', activate: () => { scenes.pop(); hooks.onQuitToTitle?.(); } },
          { label: 'RESUME', value: () => '[ENTER]', activate: () => scenes.pop() },
        ] : []),
      ],
    },
  ];

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // Display settings live in vfdSettings (applied live) AND in save.settings.vfd
  // (so they survive a reload). Write both every time.
  function setVfd(patch) {
    applyVfdSettings(patch);
    saveCommit({ settings: { ...s(), vfd: { phosphor: vfdSettings.phosphor, brightness: vfdSettings.brightness, flicker: vfdSettings.flicker } } });
  }
  function cycle(key, list, d) {
    const i = (list.indexOf(vfdSettings[key]) + d + list.length) % list.length;
    setVfd({ [key]: list[i] });
  }

  let tab = Math.max(0, tabs.findIndex((t) => t.id === initialTab));
  let sel = 0;
  const rowsOf = () => tabs[tab].rows;
  const clampSel = () => { sel = Math.max(0, Math.min(rowsOf().length - 1, sel)); };

  return {
    id: 'settings',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'calm',

    key(e) {
      const raw=e.key||'',k=raw.toLowerCase(),code=e.code||'';
      if (raw === 'Tab' || raw === ']' || k === 'e' || code === 'KeyE') { tab = (tab + 1) % tabs.length; sel = 0; return true; }
      if (raw === '[' || k === 'q' || code === 'KeyQ') { tab = (tab - 1 + tabs.length) % tabs.length; sel = 0; return true; }
      if (raw === 'ArrowUp' || k === 'w' || code === 'KeyW') { sel = (sel - 1 + rowsOf().length) % rowsOf().length; return true; }
      if (raw === 'ArrowDown' || k === 's' || code === 'KeyS') { sel = (sel + 1) % rowsOf().length; return true; }
      clampSel();
      const row = rowsOf()[sel];
      if (raw === 'ArrowLeft' || k === 'a' || code === 'KeyA') { row.adjust?.(-1); return true; }
      if (raw === 'ArrowRight' || k === 'd' || code === 'KeyD') { row.adjust?.(1); return true; }
      if (raw === 'Enter' || code === 'Enter' || raw === ' ' || code === 'Space' || k === 'z' || code === 'KeyZ') { if (row.activate) row.activate(); else row.adjust?.(1); return true; }
      if (raw === 'Escape' || code === 'Escape') { scenes.pop(); return true; }
      return true;
    },

    render() {
      const { cols, rows: R } = uiSize();
      if (inGame) uiScrim(0.72);
      const w = Math.min(70, cols - 4), h = Math.min(18, R - 2);
      const x = Math.floor((cols - w) / 2), y = Math.floor((R - h) / 2);
      const body = drawMachinePanel(x, y, w, h, {
        theme: 'amber', wordmark: 'AKAI', label: 'SETUP', source: tabs[tab].name,
        footer: `[TAB] SECTION · [↑↓] ROW · [←→] SET${inGame ? '' : ' · [ESC] DONE'}`, meter: false,
      });

      // Tab strip across the top of the glass.
      let tx = body.x;
      tabs.forEach((t, i) => {
        const on = i === tab;
        const label = on ? `▸${t.name}` : ` ${t.name}`;
        uiText(tx, body.y, label, on ? 'ui-primary' : 'ui-secondary');
        tx += label.length + 2;
      });

      // Rows for the active tab.
      clampSel();
      rowsOf().forEach((row, i) => {
        const on = i === sel;
        const ry = body.y + 2 + i;
        uiText(body.x, ry, `${on ? '▸' : ' '} ${row.label}`, on ? 'ui-primary' : 'ui-secondary');
        const vx = body.x + 18;
        if (row.bar) {
          uiText(vx, ry, `${bar(row.bar())} ${row.value()}`, on ? 'ui-amber' : 'ui-secondary');
        } else {
          const v = row.value ? row.value() : '';
          const chev = row.adjust ? `◀ ${v} ▶` : v;
          uiText(vx, ry, chev, on ? 'ui-amber' : 'ui-secondary');
        }
      });

      uiCenter(body.y + h - 3, 'THE ROOM TONE, PLAYED BACK, CONTAINS WHAT YOU DID NOT HEAR', 'ui-secondary');
    },
  };
}
