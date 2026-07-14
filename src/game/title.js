// Title screen. Also the audio gate: nothing may call ensureCtx() until a key
// has been pressed here, which satisfies browser autoplay policy and gives the
// first sound of the piece a deliberate moment of silence to arrive out of.
//
// The title keeps a stable case-file layout in every profile state. Empty
// archives/endings are still available; their panels explain that nothing is
// filed yet instead of changing the top-level menu shape.

import * as scenes from './scenes.js';
import { uiSize, uiText, uiDraw } from '../render/ui.js';
import { getMeta, hasActiveRun } from './save.js';
import * as AUDIO from '../audio/story-audio.js';
import { promptLine } from './bindings.js';
import {
  cinematicConservatoryFrame,
  cinematicConservatoryLayout,
  renderCinematicConservatory,
} from './cinematic-conservatory.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function clampRange(value, min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.max(lo, Math.min(hi, Number(value) || 0));
}

function fit(text, width) {
  const s = String(text ?? '');
  const w = Math.max(1, Math.floor(width));
  return s.length <= w ? s : s.slice(0, w);
}

function centerX(text, cols) {
  return Math.max(0, Math.floor((cols - String(text).length) / 2));
}

export function titleScreenLayout({ cols = 80, rows = 30, itemCount = 6, frame = cinematicConservatoryFrame(0) } = {}) {
  const c = Math.max(20, Math.floor(cols));
  const r = Math.max(8, Math.floor(rows));
  const scene = cinematicConservatoryLayout({ cols: c, rows: r, frame });
  const columns = c >= 78 && itemCount > 4 ? 2 : 1;
  const rowCount = Math.ceil(itemCount / columns);
  const menuW = Math.min(c - 6, columns === 2 ? 70 : 36);
  const colW = Math.max(18, Math.floor(menuW / columns));
  const menuX = Math.max(2, Math.floor((c - menuW) / 2));
  const titleY = clampRange(Math.round(r * 0.28 + frame.camera.y), 2, Math.max(2, scene.lowerBand.y - 5));
  const statusY = clampRange(scene.lowerBand.y + 1, Math.min(r - 3, titleY + 3), r - 3);
  const menuY = clampRange(statusY + 2, 2, r - Math.max(2, rowCount * 2));
  return {
    cols: c,
    rows: r,
    lowerBand: scene.lowerBand,
    title: { x: centerX('CHUNK SURFER', c), y: titleY },
    tagline: { x: centerX('FIVE ROOM TONES. ONE BUILDING LISTENING.', c), y: clamp(titleY + 3, 2, r - 2) },
    status: { x: 0, y: statusY },
    menu: { x: menuX, y: menuY, w: menuW, columns, rowCount, colW },
    footer: { x: Math.max(2, menuX), y: r - 2, w: Math.max(1, c - Math.max(2, menuX) * 2) },
  };
}

function drawTitleWordmark(layout, alpha = 1) {
  uiDraw(({ ctx, dpr, cellW, cellH, cols }) => {
    const text = 'CHUNK SURFER';
    const px = cols * cellW * dpr * 0.5;
    const py = (layout.title.y + 0.45) * cellH * dpr;
    const size = clamp(Math.min(cols * cellW * 0.055, cellH * 3.2), cellH * 1.5, cellH * 3.1) * dpr;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `600 ${size}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#d9d5bf';
    ctx.shadowColor = 'rgba(207,194,144,0.34)';
    ctx.shadowBlur = 14 * dpr;
    ctx.fillText(text, px, py);
    ctx.globalAlpha = alpha * 0.38;
    ctx.strokeStyle = 'rgba(242,168,30,0.42)';
    ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath();
    ctx.moveTo(px - text.length * size * 0.19, py + size * 0.68);
    ctx.lineTo(px + text.length * size * 0.19, py + size * 0.68);
    ctx.stroke();
    ctx.restore();
  });
}

export function makeTitleScene({
  buildLabel = '',
  onNewGame,
  onContinue,
  onJustSurf,
  onSettings,
  onArchive = () => {},
  onReturnIndex = () => {},
  onAudioGate = () => {},
} = {}) {
  const meta = getMeta();
  const replay = (meta.endingsSeen?.length || 0) > 0;
  const activeRun = hasActiveRun();

  const items = [
    { id: 'continue', label: 'continue', run: onContinue, disabled: !activeRun },
    { id: 'new-run', label: 'new run', run: onNewGame, confirms: true, stay: true },
    { id: 'archive', label: 'achievements', stay: true, run: onArchive },
    { id: 'return-index', label: 'endings', stay: true, run: onReturnIndex },
    { id: 'just-surf', label: 'just surf', run: onJustSurf },
    { id: 'settings', label: 'settings', stay: true, run: onSettings },
  ];

  let sel = activeRun ? 0 : 1;
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

        if (item.disabled) {
          AUDIO.menuMove();
          disarm();
          return true;
        }

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
      const frame = cinematicConservatoryFrame(t, { duration: 24, variant: 'title' });
      const layout = titleScreenLayout({ cols, rows, itemCount: items.length, frame });
      renderCinematicConservatory(frame, { band: true });
      drawTitleWordmark(layout, Math.min(1, 0.28 + t * 0.9));
      uiText(layout.tagline.x, layout.tagline.y, 'FIVE ROOM TONES. ONE BUILDING LISTENING.', 'ui-primary', 0.90);

      let status = 'THE CASE FILE IS EMPTY.';
      let statusCls = 'ui-secondary';
      if (meta.hushMet) { status = 'THE HUSH HAS YOUR SIGNAL.'; statusCls = 'ui-danger'; }
      else if (meta.leftMidRun) { status = 'UNFINISHED RUN SAVED.'; statusCls = 'ui-danger'; }
      else if (replay) { status = 'ENDINGS AND ACHIEVEMENTS ARE AVAILABLE.'; statusCls = 'ui-amber'; }
      uiText(centerX(status, cols), layout.status.y, status, statusCls, 0.92);

      menuColumns = layout.menu.columns;
      const rowCount = rowsPerColumn();
      const colW = layout.menu.colW;
      const menuX = layout.menu.x;
      const menuY = layout.menu.y;
      items.forEach((item, i) => {
        const on = i === sel;
        const armed = item.confirms && confirmNewRun;
        const prompt = 'START NEW RUN? PRESS ENTER AGAIN';
        const labelText = fit(armed ? prompt : item.label.toUpperCase(), Math.max(8, colW - 4));
        const col = Math.floor(i / rowCount);
        const row = i % rowCount;
        uiText(
          menuX + col * colW,
          menuY + row * 2,
          `${on ? '▸ ' : '  '}${labelText}`,
          item.disabled ? (on ? 'ui-label' : 'ui-secondary') : armed ? 'ui-danger' : on ? 'ui-amber' : 'ui-secondary',
          item.disabled ? 0.48 : 1,
        );
      });

      const footer = promptLine([{ action: 'select', label: 'SELECT' }, { action: 'confirm', label: 'CONFIRM' }]);
      uiText(layout.footer.x, layout.footer.y, fit(footer, layout.footer.w), 'ui-label', 0.64);
      if (buildLabel) {
        uiText(layout.footer.x, Math.max(0, layout.footer.y - 1), fit(String(buildLabel).toUpperCase(), layout.footer.w), 'ui-label', 0.52);
      }
    },
  };
}
