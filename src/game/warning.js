// Before anything: what this is, and what it is going to do to you.
//
// Three cards, in front of the title. The first is the disclaimer — a horror game
// is allowed to be frightening and is not allowed to be a surprise. The second
// asks for the microphone, because the piece is about a man being paid to keep a
// room silent, and it wants to know whether YOUR room is silent, and that is not
// a thing you spring on somebody.
//
// The third asks to read your name, and exists for exactly the same reason. It
// was buried in the settings menu, off by default, where a feature that reads a
// Steam account has no business hiding — the disclaimer card has been promising
// for a while that personalized interference is "off by default" without ever
// offering it to anyone. Desktop only: there is no Steam persona and no window
// to disturb in a browser, so it is skipped there rather than asked and ignored.
//
// The keypress that dismisses card two is also the user gesture the browser needs
// to open an AudioContext and a microphone. One press, honestly earned.

import * as scenes from './scenes.js';
import { uiSize, uiFill, uiText, uiCenter, uiWrap } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { promptLine } from './bindings.js';

const WARNINGS = [
  'This is a horror game. It contains sustained dread, sudden loud sounds, and',
  'a small number of deliberate jump scares.',
  'It contains flashing light and high-contrast strobing.',
  '',
  'Optional personalized interference can alter this game’s own title and windows.',
  'It is off by default and can be stopped at once by holding Escape.',
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
  'Do you want to allow microphone access?',
  '',
  'Nothing is ever recorded. Nothing is uploaded.',
  'Nothing leaves this machine: the audio is only used for loudness.',
  '',
  'If no microphone is available, you can continue without it.',
  '',
  'It is better with it.',
];

const INTERFERENCE = [
  'This game can use your computer’s own names for you.',
  '',
  'With permission it reads the name on your Steam account, this machine’s',
  'hostname, and the name of your microphone, and it interferes with them:',
  'the title bar, the windows, and the text on the machines inside the game.',
  '',
  'It also sets the shape of the name you give the guard at the gate —',
  'which you were never going to be able to read anyway.',
  '',
  'Do you want to allow personalized interference?',
  '',
  'Values are held in memory and masked before anything is written down.',
  'Nothing is stored, nothing is uploaded, nothing is ever spoken aloud.',
  'It can be switched off, and erased, in the settings menu at any time.',
  'Holding Escape stops it at once.',
  '',
  'The game is complete without it.',
];

export function makeWarningScene({
  onDone = () => {}, onEnableMic = () => {}, onDisableMic = () => {},
  onEnableInterference = () => {}, onDisableInterference = () => {},
  askInterference = false,
} = {}) {
  let card = 0;          // 0 = the disclaimer, 1 = the microphone, 2 = your name
  const asked = { mic: false, interference: false };
  const CONSENT = { 1: 'mic', 2: 'interference' };

  function next() {
    if (card === 0) { card = 1; return; }
    if (card === 1 && askInterference) { card = 2; return; }
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
      const consent = CONSENT[card];
      if (consent && (k === 'y' || code === 'KeyY' || e.controllerAction === 'confirm')) {
        // On the microphone card this keypress IS the browser gesture that opens
        // the AudioContext, so it has to be the thing that grants, not a later
        // menu row. The identity card does not need a gesture, but it is held to
        // the same standard because it is asking for the same kind of thing.
        if (!asked[consent]) {
          asked[consent] = true;
          if (consent === 'mic') onEnableMic(); else onEnableInterference();
        }
        next(); return true;
      }
      if (consent && (k === 'n' || code === 'KeyN' || e.controllerAction === 'back')) {
        if (!asked[consent]) {
          asked[consent] = true;
          if (consent === 'mic') onDisableMic(); else onDisableInterference();
        }
        next(); return true;
      }
      // The advisory advances normally. Both consent cards accept ONLY an
      // explicit Y/N answer: menu-confirm spam can never grant permission.
      if (card === 0 && (e.key === 'Enter' || code === 'Enter' || e.key === ' ' || code === 'Space' || k === 'z' || e.controllerAction === 'confirm')) {
        next(); return true;
      }
      return true;
    },

    render() {
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, UI_COLOR.glass);
      const lines = card === 0 ? WARNINGS : card === 1 ? MIC : INTERFERENCE;
      const w = Math.min(84, cols - 4);
      const textW = w - 4;

      // Wrap first, so the panel is exactly as tall as what it has to say. A
      // blank line stays a blank line: the spacing is doing work.
      const out = [];
      for (const l of lines) {
        if (!l) { out.push({ text: '', cls: 'ui-secondary' }); continue; }
        // Amber asks the question; blue is everything that reassures. The
        // identity card carries more of the second kind than the mic card does,
        // because it is asking for more.
        const cls = /^Do you want/.test(l)
          ? 'ui-amber'
          : /^(It does not|Nothing is|It is better|Values are|It can be|Holding Escape|The game is)/.test(l)
            ? 'ui-blue'
            : 'ui-secondary';
        for (const t of uiWrap(l, textW)) out.push({ text: t, cls });
      }

      const h = Math.min(rows - 2, out.length + 8);
      const x = Math.floor((cols - w) / 2), y = Math.floor((rows - h) / 2);
      const panel = drawMachinePanel(x, y, w, h, {
        theme: 'amber', wordmark: 'AUDIOCORP',
        label: card === 0 ? 'ADVISORY' : card === 1 ? 'INPUT' : 'IDENTITY',
        source: card === 0 ? 'READ THIS' : card === 1 ? 'MICROPHONE' : 'LOCAL ONLY',
        footer: card === 0
          ? promptLine([{ action: 'continue', label: 'CONTINUE' }])
          : card === 1
            ? promptLine([{ action: 'allow', label: 'ALLOW THE MIC' }, { action: 'deny', label: 'PLAY WITHOUT IT' }])
            : promptLine([{ action: 'allow', label: 'LET IT KNOW ME' }, { action: 'deny', label: 'KEEP ME OUT OF IT' }]),
        meter: false,
      });

      drawVfdText(panel.x, panel.y,
        card === 0 ? 'BEFORE YOU START' : card === 1 ? 'YOUR ROOM' : 'YOUR NAME',
        { max: panel.w });
      let ly = panel.y + 3;
      for (const r of out) {
        if (ly >= panel.y + panel.h - 1) break;
        if (r.text) uiText(panel.x, ly, r.text, r.cls);
        ly++;
      }
    },
  };
}
