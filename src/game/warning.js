// The one durable permission boundary. The advisory explains the physical
// horror; the dossier makes one explicit all-on/all-off offer. Settings can
// subsequently turn each disclosed module off independently.

import * as scenes from './scenes.js';
import { uiSize, uiFill, uiText, uiWrap } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { promptLine } from './bindings.js';

const WARNINGS = [
  'This is a horror game. It contains sustained dread, sudden loud sounds, and',
  'a small number of deliberate jump scares.',
  'It contains flashing light and high-contrast strobing.',
  '',
  'With permission, authored moments can alter this game’s own title, frame,',
  'and temporary game-owned panes. Hold Escape to restore every game window.',
  '',
  'Every physical effect can be reduced or disabled in Settings.',
];

const PROFILE = [
  'THIS GAME MEASURES YOU PSYCHOLOGICALLY.',
  '',
  'PROFILE ON permits these local-only modules:',
  '• Room-microphone loudness during declared authored moments. No recording',
  '  and no speech recognition.',
  '• Steam display name only—never Steam ID, friends, or account enumeration.',
  '• OS username, computer hostname, and selected microphone label.',
  '• Measurement of choices, noise, HUSH contacts, battle responses, and',
  '  emergency window restores to build a fictional local response profile.',
  '• Adaptive horror, movement/resizing of game-owned windows, and up to three',
  '  temporary, non-focus-stealing, game-owned echo windows.',
  '• AUDIOCORP field-return files in Chunk Surfer’s local game-data folder.',
  '',
  'Processing is local. Nothing is uploaded. Raw audio is never stored.',
  'Names never affect psychological scoring and are not written to returns.',
  'Settings can disable any module, restore windows, reset inference, open the',
  'return folder, or erase all profile data and artifacts.',
  '',
  'PROFILE OFF requests nothing and enables none of these modules.',
  'The complete game remains available.',
  '',
  'Choose PROFILE ON or PROFILE OFF.',
];

export function makeWarningScene({
  onDone = () => {},
  onProfileOn = () => {},
  onProfileOff = () => {},
  askProfile = true,
} = {}) {
  let card = 0;
  let answered = false;

  function finish() {
    scenes.pop();
    onDone();
  }

  function next() {
    if (card === 0 && askProfile) { card = 1; return; }
    finish();
  }

  return {
    id: 'warning',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'calm',

    key(e) {
      const key = (e.key || '').toLowerCase();
      const code = e.code || '';
      if (card === 1 && (key === 'y' || code === 'KeyY' || e.controllerAction === 'confirm')) {
        if (!answered) {
          answered = true;
          // This explicit confirmation is also the user gesture used to launch
          // the OS microphone request. A denial does not revoke the profile.
          onProfileOn();
        }
        finish();
        return true;
      }
      if (card === 1 && (key === 'n' || code === 'KeyN' || e.controllerAction === 'back')) {
        if (!answered) {
          answered = true;
          onProfileOff();
        }
        finish();
        return true;
      }
      if (card === 0 && (
        e.key === 'Enter' || code === 'Enter' || e.key === ' ' || code === 'Space'
        || key === 'z' || e.controllerAction === 'confirm'
      )) {
        next();
        return true;
      }
      return true;
    },

    render() {
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, UI_COLOR.glass);
      const lines = card === 0 ? WARNINGS : PROFILE;
      const w = Math.min(92, cols - 4);
      const textW = w - 4;
      const out = [];
      for (const line of lines) {
        if (!line) { out.push({ text: '', cls: 'ui-secondary' }); continue; }
        const cls = /^(THIS GAME|Choose PROFILE)/.test(line)
          ? 'ui-amber'
          : /^(Processing|Names never|Settings can|PROFILE OFF|The complete)/.test(line)
            ? 'ui-blue'
            : 'ui-secondary';
        for (const text of uiWrap(line, textW)) out.push({ text, cls });
      }
      const h = Math.min(rows - 2, out.length + 8);
      const x = Math.floor((cols - w) / 2);
      const y = Math.floor((rows - h) / 2);
      const panel = drawMachinePanel(x, y, w, h, {
        theme: 'amber',
        wordmark: 'AUDIOCORP',
        label: card === 0 ? 'ADVISORY' : 'PSYCHOLOGICAL PROFILE',
        source: card === 0 ? 'READ THIS' : 'LOCAL DOSSIER',
        footer: card === 0
          ? promptLine([{ action: 'continue', label: 'CONTINUE' }])
          : promptLine([{ action: 'allow', label: 'PROFILE ON' }, { action: 'deny', label: 'PROFILE OFF' }]),
        meter: false,
      });
      drawVfdText(panel.x, panel.y, card === 0 ? 'BEFORE YOU START' : 'CONSENT REQUIRED', { max: panel.w });
      let lineY = panel.y + 3;
      for (const row of out) {
        if (lineY >= panel.y + panel.h - 1) break;
        if (row.text) uiText(panel.x, lineY, row.text, row.cls);
        lineY += 1;
      }
    },
  };
}
