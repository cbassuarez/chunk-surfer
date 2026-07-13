// Title screen. Also the audio gate: nothing may call ensureCtx() until a key
// has been pressed here, which satisfies browser autoplay policy and gives the
// first sound of the piece a deliberate moment of silence to arrive out of.
//
// Replay systems are revealed only after the first filed return. Before that,
// the title does not advertise missing endings, achievements, or locked modes.

import * as scenes from './scenes.js';
import { uiSize, uiCenter, uiFill, uiText } from '../render/ui.js';
import { drawLocationIndicator, drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { getMeta, hasActiveRun } from './save.js';
import { deriveUnlocks } from '../progression/unlocks.js';
import * as AUDIO from '../audio/story-audio.js';

export function makeTitleScene({
  onNewGame,
  onContinue,
  onJustSurf,
  onSettings,
  onArchive = () => {},
  onReturnIndex = () => {},
  onAudioGate = () => {},
} = {}) {
  const meta = getMeta();
  const unlocks = deriveUnlocks(meta);
  const replay = (meta.endingsSeen?.length || 0) > 0;
  const newRunLabel = replay ? 'new run' : 'new game';

  const items = [];
  if (hasActiveRun()) {
    items.push({ id: 'continue', label: 'continue', run: onContinue });
  }
  items.push({ id: 'new-run', label: newRunLabel, run: onNewGame, confirms: true, stay: true });
  if (unlocks.archive) {
    items.push({ id: 'archive', label: 'achievements', stay: true, run: onArchive });
  }
  if (unlocks.returnIndex) {
    items.push({ id: 'return-index', label: 'endings', stay: true, run: onReturnIndex });
  }
  items.push({ id: 'just-surf', label: 'just surf', run: onJustSurf });
  items.push({ id: 'settings', label: 'settings', stay: true, run: onSettings });

  let sel = 0;
  let audioPrimed = false;
  let confirmNewRun = false;
  let t = 0;
  let menuColumns = 1;

  const columns = () => menuColumns;
  const rowsPerColumn = () => Math.ceil(items.length / columns());

  function primeAudio() {
    if (audioPrimed) return;
    audioPrimed = true;
    onAudioGate();
    AUDIO.startMenuHiss();
  }

  function disarm() {
    confirmNewRun = false;
  }

  return {
    id: 'title',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'calm',

    enter() {
      document.body.classList.add('title-screen');
      primeAudio();
      const map = document.querySelector('.map') || document.querySelector('#map');
      try { map?.setAttribute('tabindex', '0'); map?.focus({ preventScroll: true }); } catch (_) {}
    },

    exit() {
      document.body.classList.remove('title-screen');
      AUDIO.stopMenuHiss();
    },

    // Overlay menus stop their own transport bed on exit. Re-acquire the title
    // bed when the title becomes the top scene again without replaying enter().
    resume() {
      primeAudio();
      AUDIO.startMenuHiss();
    },

    key(e) {
      primeAudio();
      const k = String(e.key || '').toLowerCase();
      const code = e.code || '';

      if (e.key === 'ArrowUp' || k === 'w' || code === 'KeyW') {
        sel = (sel - 1 + items.length) % items.length;
        disarm();
        AUDIO.menuMove();
        return true;
      }

      if (e.key === 'ArrowDown' || k === 's' || code === 'KeyS') {
        sel = (sel + 1) % items.length;
        disarm();
        AUDIO.menuMove();
        return true;
      }

      if (e.key === 'ArrowLeft' || k === 'a' || code === 'KeyA') {
        if (columns() > 1) {
          sel = (sel - rowsPerColumn() + items.length) % items.length;
          disarm();
          AUDIO.menuMove();
        }
        return true;
      }

      if (e.key === 'ArrowRight' || k === 'd' || code === 'KeyD') {
        if (columns() > 1) {
          sel = (sel + rowsPerColumn()) % items.length;
          disarm();
          AUDIO.menuMove();
        }
        return true;
      }

      if (
        e.key === 'Enter' || code === 'Enter' ||
        e.key === ' ' || code === 'Space' ||
        k === 'z' || code === 'KeyZ'
      ) {
        const item = items[sel];
        if (!item) return true;

        if (item.confirms && !confirmNewRun) {
          confirmNewRun = true;
          AUDIO.menuConfirm();
          return true;
        }

        AUDIO.menuConfirm();
        if (item.stay) {
          item.run?.();
          disarm();
          return true;
        }

        scenes.pop();
        item.run?.();
        return true;
      }

      return true;
    },

    update(dt) { t += dt; },

    render() {
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, UI_COLOR.glass);

      const w = Math.min(78, cols - 4);
      const h = Math.min(Math.max(24, 12 + items.length * 2), rows - 4);
      const x = Math.floor((cols - w) / 2);
      const y = Math.floor((rows - h) / 2);
      const body = drawMachinePanel(x, y, w, h, {
        label: replay ? 'CASE SELECT' : 'PROGRAM SELECT',
        source: replay ? '4417-C' : 'ROOM TONE',
        footer: '[↑/↓] SELECT · [ENTER] CONFIRM',
        meter: true,
      });

      const display = 'CHUNK SURFER';
      const drift = Math.round(Math.sin(t * 1.3) * 1);
      const pulse = 1.56 + Math.sin(t * 0.9) * 0.08;
      drawVfdText(
        Math.max(body.x, Math.floor((cols - display.length * 1.65) / 2)) + drift,
        body.y + 1,
        display,
        { color: UI_COLOR.amber, scale: pulse },
      );
      drawLocationIndicator(
        Math.max(body.x + 8, Math.floor((cols - 28) / 2)),
        body.y + 4,
        28,
        (Math.sin(t * 0.42) + 1) / 2,
        { theme: 'amber' },
      );
      uiCenter(body.y + 6, 'FIVE ROOM TONES. ONE BUILDING LISTENING.', 'ui-primary');

      if (meta.hushMet) uiCenter(body.y + 8, 'THE HUSH HAS YOUR SIGNAL.', 'ui-danger');
      else if (meta.leftMidRun) uiCenter(body.y + 8, 'UNFINISHED RUN SAVED.', 'ui-danger');
      else if (replay) uiCenter(body.y + 8, 'ENDINGS AND ACHIEVEMENTS ARE AVAILABLE.', 'ui-amber');

      const menuY = body.y + 11;
      menuColumns = body.w >= 58 && items.length > 4 ? 2 : 1;
      const colCount = columns();
      const rowCount = rowsPerColumn();
      const colW = Math.floor((body.w - 12) / colCount);
      const menuX = body.x + 7;
      items.forEach((item, i) => {
        const on = i === sel;
        const armed = item.confirms && confirmNewRun;
        const prompt = replay ? 'START NEW RUN? PRESS ENTER AGAIN' : 'NEW GAME? PRESS ENTER AGAIN';
        const labelText = armed ? prompt : item.label.toUpperCase();
        const col = Math.floor(i / rowCount);
        const row = i % rowCount;
        uiText(
          menuX + col * colW,
          menuY + row * 2,
          `${on ? '▸ ' : '  '}${labelText}`,
          armed ? 'ui-danger' : on ? 'ui-amber' : 'ui-secondary',
        );
      });
    },
  };
}
