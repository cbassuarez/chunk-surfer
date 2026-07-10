// Title screen. Also the audio gate: nothing may call ensureCtx() until a key
// has been pressed here, which satisfies browser autoplay policy and gives the
// first sound of the piece a deliberate moment of silence to arrive out of.
//
// JUST SURF preserves the original lab — the walkable field of audio, no
// story, no triggers. Nothing that already existed is lost to the game.

import * as scenes from './scenes.js';
import { uiSize, uiCenter, uiText, uiFill, uiScrim } from '../render/ui.js';
import { hasSave, getMeta } from './save.js';

const LOGO = [
  '  ██████ ██   ██ ██    ██ ███    ██ ██   ██',
  ' ██      ██   ██ ██    ██ ████   ██ ██  ██ ',
  ' ██      ███████ ██    ██ ██ ██  ██ █████  ',
  ' ██      ██   ██ ██    ██ ██  ██ ██ ██  ██ ',
  '  ██████ ██   ██  ██████  ██   ████ ██   ██',
];

export function makeTitleScene({ onNewGame, onContinue, onJustSurf }) {
  const items = [];
  if (hasSave()) items.push({ label: 'continue', run: onContinue });
  items.push({ label: 'new game', run: onNewGame });
  items.push({ label: 'just surf', run: onJustSurf });

  let sel = 0;
  let t = 0;

  return {
    id: 'title',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'calm',

    update(dt) { t += dt; },

    key(e) {
      if (e.key === 'ArrowUp' || e.key === 'w') { sel = (sel - 1 + items.length) % items.length; return true; }
      if (e.key === 'ArrowDown' || e.key === 's') { sel = (sel + 1) % items.length; return true; }
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'z') {
        const item = items[sel];
        scenes.pop();
        item.run();
        return true;
      }
      return true;
    },

    render() {
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, 'rgba(4,4,6,0.97)');
      uiScrim(0.2);

      const top = Math.max(2, Math.floor(rows * 0.22));
      LOGO.forEach((line, i) => {
        const shimmer = 0.72 + 0.28 * Math.sin(t * 0.9 + i * 0.7);
        uiCenter(top + i, line, 't-player', shimmer);
      });
      uiCenter(top + LOGO.length + 2, 'surfer', 't-trail-1', 0.9);
      uiCenter(top + LOGO.length + 4, 'cbassuarez', 't-trail-3', 0.7);

      // The meta file speaks before the game does.
      const meta = getMeta();
      if (meta.hushMet) uiCenter(top + LOGO.length + 6, 'it is still here.', 't-hush-edge', 0.75);
      else if (meta.leftMidRun) uiCenter(top + LOGO.length + 6, 'you left. it stayed.', 't-hush-edge', 0.7);

      const menuY = top + LOGO.length + 9;
      items.forEach((item, i) => {
        const on = i === sel;
        const label = `${on ? '▸ ' : '  '}${item.label}`;
        uiCenter(menuY + i * 2, label, on ? 't-chunk-on' : 't-trail-2', on ? 1 : 0.65);
      });

      uiCenter(rows - 3, '↑ ↓ · enter', 't-trail-4', 0.6);
    },
  };
}
