// Pause menu. Esc.
//
// Settings that matter to the piece: text speed, and `reduce dread` — which
// disables the physical and deceptive layer (infrasound, hard flashes, the
// fake crash) while leaving the dialogue and the dread intact. Horror should
// be refusable without being removed.

import * as scenes from './scenes.js';
import { uiSize, uiBox, uiText, uiCenter, uiScrim } from '../render/ui.js';
import { getSave, saveCommit } from './save.js';

export function makeMenuScene({ onQuitToTitle } = {}) {
  const s = () => getSave().settings;
  let sel = 0;

  const items = [
    { label: () => `text speed        ${s().textCps} cps`,
      left: () => set('textCps', Math.max(12, s().textCps - 6)),
      right: () => set('textCps', Math.min(120, s().textCps + 6)) },
    { label: () => `volume            ${Math.round(s().volume * 100)}%`,
      left: () => set('volume', Math.max(0, +(s().volume - 0.1).toFixed(2))),
      right: () => set('volume', Math.min(1, +(s().volume + 0.1).toFixed(2))) },
    { label: () => `screen effects    ${s().fx ? 'on' : 'off'}`,
      right: () => set('fx', !s().fx), left: () => set('fx', !s().fx) },
    { label: () => `reduce dread      ${s().reduceDread ? 'on' : 'off'}`,
      right: () => set('reduceDread', !s().reduceDread), left: () => set('reduceDread', !s().reduceDread) },
    { label: () => 'return to title', activate: () => { scenes.pop(); onQuitToTitle?.(); } },
    { label: () => 'resume', activate: () => scenes.pop() },
  ];

  function set(key, value) {
    const settings = { ...s(), [key]: value };
    saveCommit({ settings });
  }

  return {
    id: 'menu',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'calm',

    key(e) {
      if (e.key === 'Escape') { scenes.pop(); return true; }
      if (e.key === 'ArrowUp' || e.key === 'w') { sel = (sel - 1 + items.length) % items.length; return true; }
      if (e.key === 'ArrowDown' || e.key === 's') { sel = (sel + 1) % items.length; return true; }
      if (e.key === 'ArrowLeft' || e.key === 'a') { items[sel].left?.(); return true; }
      if (e.key === 'ArrowRight' || e.key === 'd') { items[sel].right?.(); return true; }
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'z') { items[sel].activate?.(); return true; }
      return true;
    },

    render() {
      const { cols, rows } = uiSize();
      uiScrim(0.72);
      const w = 44, h = items.length + 6;
      const x = Math.floor((cols - w) / 2), y = Math.floor((rows - h) / 2);
      uiBox(x, y, w, h);
      uiCenter(y + 1, 'PAUSED', 't-landmark');
      items.forEach((item, i) => {
        const on = i === sel;
        uiText(x + 3, y + 3 + i, `${on ? '▸' : ' '} ${item.label()}`, on ? 't-chunk-on' : 't-trail-2', on ? 1 : 0.7);
      });
      uiCenter(y + h - 2, '← → adjust · esc close', 't-trail-4', 0.6);
    },
  };
}
