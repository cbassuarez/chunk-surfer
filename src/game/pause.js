import { uiSize, uiText, uiCenter, uiScrim } from '../render/ui.js';
import { drawMachinePanel } from '../render/presentation.js';

function clip(text, width) {
  const s = String(text || '');
  return s.length > width ? `${s.slice(0, Math.max(0, width - 1))}…` : s;
}

export function makePauseScene({
  onResume,
  onSettings,
  onControls,
  onAudio,
  onObjectives,
  onArchive,
  onRestartRun,
  onReturnToTitle,
  onQuitDesktop,
} = {}) {
  let selected = 0;
  const items = [
    { id: 'resume', label: 'RESUME', detail: 'Return to live monitoring.', action: onResume },
    { id: 'objectives', label: 'OBJECTIVES', detail: 'Review work order and route.', action: onObjectives },
    { id: 'archive', label: 'ARCHIVE / RECORDS', detail: 'Open long-term records.', action: onArchive },
    { id: 'audio', label: 'AUDIO QUICK SETTINGS', detail: 'Jump to levels and monitor controls.', action: onAudio },
    { id: 'controls', label: 'CONTROLS', detail: 'Review keyboard and controller map.', action: onControls },
    { id: 'settings', label: 'SETTINGS…', detail: 'Open full AUDIOCORP configuration.', action: onSettings },
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

    const w = Math.min(78, cols - 4);
    const h = Math.min(25, rows - 4);
    const x = Math.floor((cols - w) / 2);
    const y = Math.floor((rows - h) / 2);
    const body = drawMachinePanel(x, y, w, h, {
      theme: 'amber',
      wordmark: 'AUDIOCORP',
      label: 'SERVICE MENU',
      source: 'RUN INTERRUPT',
      footer: '[↑↓] SELECT · [ENTER] CONFIRM · [ESC] RESUME',
      meter: false,
    });

    const ix = body.x;
    const iy = body.y;
    uiText(ix, iy, 'FIELD SESSION SUSPENDED', 'ui-primary');
    uiText(ix, iy + 1, 'NO NEW TAKE IS WRITTEN WHILE THIS PANEL IS OPEN.', 'ui-secondary');

    const maxItems = Math.max(1, body.h - 7);
    const start = selected >= maxItems ? Math.min(selected - maxItems + 1, items.length - maxItems) : 0;
    const visible = items.slice(start, start + maxItems);
    visible.forEach((item, j) => {
      const index = start + j;
      const on = index === selected;
      const cls = item.danger ? (on ? 'ui-danger' : 'ui-amber') : (on ? 'ui-primary' : 'ui-secondary');
      const prefix = on ? '▸' : ' ';
      uiText(ix, iy + 3 + j, `${prefix} ${clip(item.label, 24)}`, cls);
      if (cols >= 86) uiText(ix + 29, iy + 3 + j, clip(item.detail, Math.max(8, body.w - 31)), on ? 'ui-amber' : 'ui-secondary');
    });

    if (items.length > visible.length) {
      const more = start > 0 ? '▲' : start + visible.length < items.length ? '▼' : '';
      if (more) uiText(x + w - 4, iy + body.h - 4, more, 'ui-secondary');
    }

    uiCenter(y + h - 3, 'SERVICE MENU · CONFIGURATION IS AVAILABLE UNDER SETTINGS…', 'ui-secondary');
  }

  return {
    id: 'pause',
    kind: 'pause-menu',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'calm',
    enter() { document?.body?.classList?.add('pause-open'); },
    exit() { document?.body?.classList?.remove('pause-open'); },
    key,
    render,
  };
}
