// Title screen. Also the audio gate: nothing may call ensureCtx() until a key
// has been pressed here, which satisfies browser autoplay policy and gives the
// first sound of the piece a deliberate moment of silence to arrive out of.
//
// JUST SURF preserves the original lab — the walkable field of audio, no
// story, no triggers. Nothing that already existed is lost to the game.

import * as scenes from './scenes.js';
import { uiSize, uiCenter, uiText, uiFill } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { hasSave, getMeta } from './save.js';

export function makeTitleScene({ onNewGame, onContinue, onJustSurf, onSettings }) {
  const items = [];
  if (hasSave()) items.push({ label: 'continue', run: onContinue });
  items.push({ label: 'new game', run: onNewGame });
  items.push({ label: 'just surf', run: onJustSurf });
  // Settings sits OVER the title (does not leave it), so the machine you are
  // tuning is the one behind the panel. main.js owns the scene (it has the audio
  // and mic hooks); the title just opens it.
  items.push({ label: 'settings', stay: true, run: onSettings });

  let sel = 0;
  let t = 0;

  return {
    id: 'title',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'calm',

    enter() {
      document.body.classList.add('title-screen');
      // A title reached after fullscreen, reload, or RETURN TO TITLE must take
      // focus back from browser chrome / the lens tuner immediately.
      const map=document.querySelector('.map')||document.querySelector('#map');
      try{map?.setAttribute('tabindex','0');map?.focus({preventScroll:true});}catch(_){}
    },
    exit() { document.body.classList.remove('title-screen'); },

    update(dt) { t += dt; },

    key(e) {
      const k=(e.key||'').toLowerCase(),code=e.code||'';
      if (e.key === 'ArrowUp' || k === 'w' || code === 'KeyW') { sel = (sel - 1 + items.length) % items.length; return true; }
      if (e.key === 'ArrowDown' || k === 's' || code === 'KeyS') { sel = (sel + 1) % items.length; return true; }
      if (e.key === 'Enter' || code === 'Enter' || e.key === ' ' || code === 'Space' || k === 'z' || code === 'KeyZ') {
        const item = items[sel];
        if (item.stay) { item.run(); return true; }
        scenes.pop();
        item.run();
        return true;
      }
      return true;
    },

    render() {
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, UI_COLOR.glass);
      const w = Math.min(78, cols - 4);
      const h = Math.min(24, rows - 4);
      const x = Math.floor((cols - w) / 2), y = Math.floor((rows - h) / 2);
      const body = drawMachinePanel(x, y, w, h, {
        label: 'PROGRAM SELECT', source: 'ROOM TONE', footer: '[↑/↓] SELECT · [ENTER] CONFIRM', meter: true,
      });

      const display = 'CHUNK SURFER';
      drawVfdText(Math.max(body.x, Math.floor((cols - display.length * 1.65) / 2)), body.y + 1, display, { color: UI_COLOR.amber, scale:1.72 });
      uiCenter(body.y + 4, 'A HAUNTING AT ELLERY CONSERVATORY', 'ui-primary');

      // The meta file speaks before the game does.
      const meta = getMeta();
      if (meta.hushMet) uiCenter(body.y + 6, 'it is still here.', 'ui-danger');
      else if (meta.leftMidRun) uiCenter(body.y + 6, 'you left. it stayed.', 'ui-danger');

      const menuY = body.y + 8;
      items.forEach((item, i) => {
        const on = i === sel;
        const label = `${on ? '▸ ' : '  '}${item.label.toUpperCase()}`;
        uiCenter(menuY + i * 2, label, on ? 'ui-amber' : 'ui-secondary');
      });
    },
  };
}
