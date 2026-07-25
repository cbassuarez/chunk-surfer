import { uiSize, uiText, uiCenter, uiScrim, uiFill } from '../render/ui.js';
import { drawVfdRow, vfdRowStyle } from '../render/vfd-select.js';
import { activeTheme } from '../render/palette.js';
import { drawMachinePanel } from '../render/presentation.js';
import { createHitRegions } from '../render/hit-regions.js';
import { promptLine } from './bindings.js';
import * as AUDIO from '../audio/story-audio.js';

const LOCAL_ESCAPE_SCENES = new Set(['pause', 'settings', 'god-menu', 'bag', 'combat-calibration']);

export function shouldOpenPauseForEvent({ storyMode = false, key = '', code = '', topSceneId = '' } = {}) {
  if (!storyMode || (key !== 'Escape' && code !== 'Escape')) return false;
  return !LOCAL_ESCAPE_SCENES.has(topSceneId);
}

function clip(text, width) {
  const s = String(text || '');
  return s.length > width ? `${s.slice(0, Math.max(0, width - 1))}…` : s;
}

export function makePauseScene({
  onResume,
  onSettings,
  onObjectives,
  onArchive,
  onRestartRun,
  onReturnToTitle,
  onQuitDesktop,
  status = () => ({}),
} = {}) {
  let selected = 0;
  const hits = createHitRegions();
  const items = [
    { id: 'resume', label: 'RESUME', detail: 'Return to live monitoring.', action: onResume },
    { id: 'objectives', label: 'WORK ORDER / BAG', detail: 'Review the job, map, and carried equipment.', action: onObjectives },
    { id: 'archive', label: 'ARCHIVE / RECORDS', detail: 'Open long-term records.', action: onArchive },
    { id: 'settings', label: 'SETTINGS…', detail: 'Open display, audio, input, and accessibility.', action: onSettings },
    { id: 'restart', label: 'RESTART RUN…', detail: 'Begin setup again.', danger: true, action: onRestartRun },
    { id: 'title', label: 'RETURN TO TITLE…', detail: 'Leave the current field session.', danger: true, action: onReturnToTitle },
    { id: 'quit', label: 'QUIT TO DESKTOP', detail: 'Close Chunk Surfer.', danger: true, action: onQuitDesktop },
  ];

  function select(index, { sound = true } = {}) {
    if (index < 0 || index >= items.length) return;
    if (selected === index) return;
    selected = index;
    if (sound) AUDIO.menuMove?.();
  }

  function move(delta) {
    select((selected + delta + items.length) % items.length);
  }

  function activate() {
    AUDIO.menuConfirm?.();
    items[selected]?.action?.();
  }

  function activateSelected() {
    activate();
  }

  function key(e) {
    const raw = e.key || '';
    const k = raw.toLowerCase();
    const code = e.code || '';

    if (raw === 'Escape' || code === 'Escape') {
      e.preventDefault?.();
      onResume?.();
      return true;
    }
    if (raw === 'ArrowUp' || k === 'w' || code === 'KeyW') {
      e.preventDefault?.();
      move(-1);
      return true;
    }
    if (raw === 'ArrowDown' || k === 's' || code === 'KeyS') {
      e.preventDefault?.();
      move(1);
      return true;
    }
    if (raw === 'Enter' || code === 'Enter' || raw === ' ' || code === 'Space' || k === 'z' || code === 'KeyZ') {
      e.preventDefault?.();
      activate();
      return true;
    }
    return true;
  }

  function render() {
    hits.reset();

    const { cols, rows } = uiSize();
    uiScrim(0.88);

    const w = Math.min(88, cols - 4);
    const h = Math.min(27, rows - 4);
    const x = Math.floor((cols - w) / 2);
    const y = Math.floor((rows - h) / 2);
    const body = drawMachinePanel(x, y, w, h, {
      theme: 'green',
      wordmark: 'CHUNK SURFER',
      label: 'FIELD HOLD',
      source: 'RUN PAUSED',
      footerParts: [{ action: 'select', label: 'SELECT' }, { action: 'confirm', label: 'CONFIRM' }, { action: 'back', label: 'RESUME' }],
      meter: false,
    });

    const ix = body.x;
    const iy = body.y;
    const live = status() || {};
    uiText(ix, iy, 'FIELD SESSION HELD', 'ui-primary');
    uiText(ix, iy + 1, 'THE BUILDING, TAKE CLOCK, AND HUSH ARE FROZEN.', 'ui-secondary');

    const statusX = ix + Math.max(42, Math.floor(body.w * 0.56));
    if (body.w >= 70) {
      uiText(statusX, iy + 3, 'RUN STATUS', 'ui-label');
      uiText(statusX, iy + 5, `AREA   ${clip(live.area || 'UNKNOWN', 20)}`, 'ui-secondary');
      uiText(statusX, iy + 7, `TAKES  ${live.takes ?? 0} / 5`, 'ui-secondary');
      uiText(statusX, iy + 9, `LIGHT  ${live.light ? 'ON' : 'OFF'}`, live.light ? 'ui-amber' : 'ui-secondary');
      uiText(statusX, iy + 11, `HUSH   ${live.hush || 'QUIET'}`, live.hush === 'CONTACT' ? 'ui-danger' : 'ui-secondary');
      uiText(statusX, iy + 13, `TIME   ${live.time || '00:00:00'}`, 'ui-secondary');
    }

    const maxItems = Math.max(1, body.h - 7);
    const start = selected >= maxItems ? Math.min(selected - maxItems + 1, items.length - maxItems) : 0;
    const visible = items.slice(start, start + maxItems);
    visible.forEach((item, j) => {
      const index = start + j;
      const rowY = iy + 3 + j * 2;
      const on = index === selected;

      hits.add({
        id: item.id,
        kind: 'pause-item',
        x: ix,
        y: rowY - 0.35,
        w: Math.min(34, body.w),
        h: 1.4,
        selected: on,
        danger: item.danger,
        label: item.label,
        data: { index, item },
        onHover: () => select(index),
        onClick: () => {
          select(index, { sound: false });
          activateSelected();
        },
      });

      // Hover and the keyboard cursor drive the same single indicator, exactly
      // as on a panel that only ever had one. Selection is inverse video; the
      // pointer alone only steps the duty factor.
      const style = vfdRowStyle({
        hovered: hits.isHovered(item.id),
        selected: on,
        nowMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
      });
      const cls = item.danger ? (on ? 'ui-danger' : 'ui-amber') : (on ? 'ui-primary' : 'ui-secondary');
      drawVfdRow({ uiFill, uiText, theme: activeTheme, inverseColor: item.danger ? activeTheme().danger : null }, {
        x: ix, y: rowY, w: Math.min(34, body.w), label: clip(item.label, 26), style, role: cls,
      });
      if (body.w < 70) uiText(ix + 2, rowY + 1, clip(item.detail, Math.max(8, body.w - 4)), 'ui-secondary', on ? 0.9 : 0.56);
    });

    if (items.length > visible.length) {
      const more = start > 0 ? '▲' : start + visible.length < items.length ? '▼' : '';
      if (more) uiText(x + w - 4, iy + body.h - 4, more, 'ui-secondary');
    }

    uiCenter(y + h - 3, 'PAUSE HOLDS THE RUN · SETTINGS CONFIGURE THE APPLICATION', 'ui-secondary');
  }


  function pointer(e) {
    if (e.type === 'pointermove') {
      hits.handle(e, { click: false });
      return true;
    }
    if (e.type === 'pointerdown') {
      hits.handle(e);
      return true;
    }
    return true;
  }

  return {
    id: 'pause',
    kind: 'pause-menu',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'calm',
    enter() {
      globalThis.document?.body?.classList?.add('pause-open');
      try { globalThis.document?.exitPointerLock?.(); } catch (_) {}
    },
    exit() { globalThis.document?.body?.classList?.remove('pause-open'); },
    key,
    pointer,
    render,
    view() {
      return {
        selected: items[selected]?.id,
        items: items.map((item) => item.id),
        hitRegions: hits.view(),
        status: status(),
      };
    },
  };
}
