// Before anything: what this is, and what it is going to do to you.
//
// Two cards, in front of the title. The first is the disclaimer — a horror game
// is allowed to be frightening and is not allowed to be a surprise. The second
// asks for the microphone, because the piece is about a man being paid to keep a
// room silent, and it wants to know whether YOUR room is silent, and that is not
// a thing you spring on somebody.
//
// The keypress that dismisses card two is also the user gesture the browser needs
// to open an AudioContext and a microphone. One press, honestly earned.

import * as scenes from './scenes.js';
import { uiSize, uiFill, uiText, uiCenter, uiWrap } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';

const WARNINGS = [
  'This is a horror game. It contains sustained dread, sudden loud sounds, and',
  'a small number of deliberate jump scares.',
  'It contains flashing light and high-contrast strobing.',
  '',
  'Every physical effect above can be turned off in the settings menu.',
  '',
];

const MIC = [
  'This game would like to listen to your room.',
  '',
  'You are being paid to capture one clean minute of silence in each of five',
  'rooms. While the tape is rolling, the microphone on this machine is open, and',
  'if the room YOU are sitting in makes a noise the',
  'take is spoiled, exactly as if the recordist had made it himself.',
  '',
  'Nothing is ever recorded. Nothing is uploaded.',
  'Nothing leaves this machine: the audio is only used for loudness.',
  '',
  'It is better with it.',
];

export function makeWarningScene({ onDone = () => {}, onEnableMic = () => {}, onDisableMic = () => {} } = {}) {
  let card = 0;          // 0 = the disclaimer, 1 = the microphone
  let asked = false;

  function next() {
    if (card === 0) { card = 1; return; }
    scenes.pop();
    onDone();
  }

  return {
    id: 'warning',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'calm',

    key(e) {
      const k = (e.key || '').toLowerCase(), code = e.code || '';
      if (card === 1 && (k === 'y' || code === 'KeyY' || e.controllerAction === 'confirm')) {
        if (!asked) { asked = true; onEnableMic(); }   // this keypress IS the gesture
        next(); return true;
      }
      if (card === 1 && (k === 'n' || code === 'KeyN' || e.controllerAction === 'back')) {
        if (!asked) { asked = true; onDisableMic(); }
        next(); return true;
      }
      // The advisory advances normally. The microphone card accepts ONLY an
      // explicit Y/N answer: menu-confirm spam can never grant permission.
      if (card === 0 && (e.key === 'Enter' || code === 'Enter' || e.key === ' ' || code === 'Space' || k === 'z' || e.controllerAction === 'confirm')) {
        next(); return true;
      }
      return true;
    },

    render() {
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, UI_COLOR.glass);
      const lines = card === 0 ? WARNINGS : MIC;
      const w = Math.min(84, cols - 4);
      const textW = w - 4;

      // Wrap first, so the panel is exactly as tall as what it has to say. A
      // blank line stays a blank line: the spacing is doing work.
      const out = [];
      for (const l of lines) {
        if (!l) { out.push({ text: '', cls: 'ui-secondary' }); continue; }
        const cls = /^(It does not|Nothing is|It is better)/.test(l) ? 'ui-blue' : 'ui-secondary';
        for (const t of uiWrap(l, textW)) out.push({ text: t, cls });
      }

      const h = Math.min(rows - 2, out.length + 8);
      const x = Math.floor((cols - w) / 2), y = Math.floor((rows - h) / 2);
      const panel = drawMachinePanel(x, y, w, h, {
        theme: 'amber', wordmark: 'AUDIOCORP',
        label: card === 0 ? 'ADVISORY' : 'INPUT',
        source: card === 0 ? 'READ THIS' : 'MICROPHONE',
        footer: card === 0 ? '[ENTER / A] CONTINUE' : '[Y / A] ALLOW THE MIC · [N / B] PLAY WITHOUT IT',
        meter: false,
      });

      drawVfdText(panel.x, panel.y, card === 0 ? 'BEFORE YOU START' : 'YOUR ROOM', { max: panel.w });
      let ly = panel.y + 3;
      for (const r of out) {
        if (ly >= panel.y + panel.h - 1) break;
        if (r.text) uiText(panel.x, ly, r.text, r.cls);
        ly++;
      }
    },
  };
}
