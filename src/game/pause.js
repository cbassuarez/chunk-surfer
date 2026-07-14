import { uiSize, uiText, uiCenter, uiScrim } from '../render/ui.js';
import { drawMachinePanel } from '../render/presentation.js';

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
  const items = [
    { id: 'resume', label: 'RESUME', detail: 'Return to live monitoring.', action: onResume },
    { id: 'objectives', label: 'WORK ORDER / BAG', detail: 'Review the job, map, and carried equipment.', action: onObjectives },
    { id: 'archive', label: 'ARCHIVE / RECORDS', detail: 'Open long-term records.', action: onArchive },
    { id: 'settings', label: 'SETTINGS…', detail: 'Open display, audio, input, and accessibility.', action: onSettings },
    { id: 'restart', label: 'RESTART RUN…', detail: 'Begin setup again.', danger: true, action: onRestartRun },
    { id: 'title', label: 'RETURN TO TITLE…', detail: 'Leave the current field session.', danger: true, action: onReturnToTitle },
    { id: 'quit', label: 'QUIT TO DESKTOP', detail: 'Close Chunk Surfer.', danger: true, action: onQuitDesktop },
  ];

  function move(delta) {
    selected = (selected + delta + items.length) % items.length;
  }

  function activate() {
    items[selected]?.action?.();
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
      footer: '[↑↓] SELECT · [ENTER] CONFIRM · [ESC] RESUME',
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
      const on = index === selected;
      const cls = item.danger ? (on ? 'ui-danger' : 'ui-amber') : (on ? 'ui-primary' : 'ui-secondary');
      const prefix = on ? '▸' : ' ';
      uiText(ix, iy + 3 + j * 2, `${prefix} ${clip(item.label, 26)}`, cls);
      if (body.w < 70) uiText(ix + 2, iy + 4 + j * 2, clip(item.detail, Math.max(8, body.w - 4)), 'ui-secondary', on ? 0.9 : 0.56);
    });

    if (items.length > visible.length) {
      const more = start > 0 ? '▲' : start + visible.length < items.length ? '▼' : '';
      if (more) uiText(x + w - 4, iy + body.h - 4, more, 'ui-secondary');
    }

    uiCenter(y + h - 3, 'PAUSE HOLDS THE RUN · SETTINGS CONFIGURE THE APPLICATION', 'ui-secondary');
  }

  return {
    id: 'pause',
    kind: 'pause-menu',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'calm',
    enter() { globalThis.document?.body?.classList?.add('pause-open'); },
    exit() { globalThis.document?.body?.classList?.remove('pause-open'); },
    key,
    render,
    view() { return { selected: items[selected]?.id, items: items.map((item) => item.id), status: status() }; },
  };
}
