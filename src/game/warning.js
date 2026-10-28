// A photosensitivity advisory, durable profile consent and a separate,
// session-only microphone choice. Permission choices never imply one another.

import * as scenes from './scenes.js';
import { uiSize, uiFill, uiText, uiWrap } from '../render/ui.js';
import { withMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { promptLine } from './bindings.js';

const WARNINGS = [
  'This game contains flashing lights and high-contrast patterns.',
  '',
  'These may trigger seizures or discomfort in people with photosensitivity.',
  'If you feel unwell, stop playing and consult a medical professional.',
  'Visual effects can be reduced in Settings.',
];

const PROFILE = [
  'THIS GAME MEASURES YOU PSYCHOLOGICALLY.',
  '',
  'PROFILE ON permits these local-only modules:',
  '• Room-microphone loudness during declared authored moments, subject to',
  '  the separate microphone choice. No speech recognition.',
  '• Steam display name only—never Steam ID, friends, or account enumeration.',
  '• OS username, computer hostname, and selected microphone label.',
  '• Measurement of choices, noise, HUSH contacts, battle responses, and',
  '  emergency fireball-surface closes to build a fictional local response profile.',
  '• Authored main-frame motion, four combat panes, and up to eight silent media panes during',
  '  battles and the post-FOH Source crossing. They never show personal data.',
  '• AUDIOCORP field-return files in Chunk Surfer’s local game-data folder.',
  '',
  'Processing is local. Nothing is uploaded. Profiling never stores raw audio.',
  'Names never affect psychological scoring and are not written to returns.',
  'Settings can disable any module, restore the game window, reset inference, open the',
  'return folder, or erase all profile data and artifacts.',
  '',
  'PROFILE OFF enables none of these profiling modules.',
  'The complete game remains available.',
  '',
  'Choose PROFILE ON or PROFILE OFF.',
];

const MICROPHONE = [
  'Allow microphone use for this session?',
  '',
  'The game measures room noise during play. You can also record a short',
  'spoken slate with a take; that audio stays on this device.',
  'No speech recognition is used and audio is not uploaded.',
  '',
  'You can play without a microphone.',
];

export function makeWarningScene({
  onDone = () => {},
  onProfileOn = () => {},
  onProfileOff = () => {},
  onMicAllow = () => {},
  onMicDeny = () => {},
  showWarning = true,
  askProfile = true,
  askMic = false,
} = {}) {
  const cards = [showWarning && 'warning', askProfile && 'profile', askMic && 'microphone'].filter(Boolean);
  let index = 0;
  let answered = false, closed = false, selected = 1;

  function finish() {
    if (closed) return;
    closed = true;
    scenes.remove(scene);
    onDone();
  }

  function next() {
    if (++index >= cards.length) finish();
    else { answered = false; selected = 1; }
  }

  const scene = {
    id: 'warning',
    blocksInput: true,
    blocksWorld: true,
    worldPresentation: 'hidden',
    lensPreset: 'calm',
    enter() { if (!cards.length) finish(); },

    key(e) {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || closed) return true;
      const key = (e.key || '').toLowerCase();
      const code = e.code || '';
      const card = cards[index];
      if (card === 'profile' || card === 'microphone') {
        if (['ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key) || ['left', 'right'].includes(e.controllerAction)) {
          selected = 1 - selected;
          return true;
        }
        const yes = key === 'y' || code === 'KeyY';
        const no = key === 'n' || code === 'KeyN' || e.controllerAction === 'back';
        const confirm = e.key === 'Enter' || code === 'Enter' || e.key === ' ' || code === 'Space' || e.controllerAction === 'confirm';
        if (!(yes || no || confirm)) return true;
        const allow = yes || (!no && selected === 0);
        if (!answered) {
          answered = true;
          if (card === 'profile') (allow ? onProfileOn : onProfileOff)();
          else (allow ? onMicAllow : onMicDeny)();
        }
        next();
        return true;
      }
      if (card === 'warning' && (
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
      const card = cards[index];
      const lines = card === 'warning' ? WARNINGS : card === 'profile' ? PROFILE : MICROPHONE;
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
      withMachinePanel(x, y, w, h, {
        theme: 'amber',
        wordmark: 'AUDIOCORP',
        label: card === 'warning' ? 'PHOTOSENSITIVITY' : card === 'profile' ? 'PSYCHOLOGICAL PROFILE' : 'MICROPHONE',
        source: card === 'warning' ? 'READ THIS' : card === 'profile' ? 'LOCAL DOSSIER' : 'THIS SESSION',
        footer: card === 'warning'
          ? promptLine([{ action: 'continue', label: 'CONTINUE' }])
          : `${selected === 0 ? '▶ ' : '  '}${card === 'profile' ? 'PROFILE ON' : 'ALLOW'}  ${selected === 1 ? '▶ ' : '  '}${card === 'profile' ? 'PROFILE OFF' : 'NOT NOW'}   [←→] CHOOSE  [ENTER] CONFIRM  [Y/N]`,
        meter: false,
      }, (panel) => {
      drawVfdText(panel.x, panel.y, card === 'warning' ? 'BEFORE YOU START' : card === 'profile' ? 'CONSENT REQUIRED' : 'YOUR MICROPHONE', { max: panel.w });
      let lineY = panel.y + 3;
      for (const row of out) {
        if (lineY >= panel.y + panel.h - 1) break;
        if (row.text) uiText(panel.x, lineY, row.text, row.cls);
        lineY += 1;
      }
      });
    },
  };
  return scene;
}
