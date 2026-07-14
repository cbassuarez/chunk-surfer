import { uiSize, uiText, uiScrim } from '../render/ui.js';
import { drawMachinePanel } from '../render/presentation.js';
import * as AUDIO from '../audio/story-audio.js';

const selectable = (row) => !!row && row.kind !== 'section' && row.selectable !== false;

export function resolveGodRowValue(row) {
  if (typeof row?.value === 'function') return row.value();
  if (row?.value != null) return row.value;
  return row?.activate ? '[FIRE]' : '';
}

export function makeGodMenuScene({ tabs = [], onClose = () => {} } = {}) {
  const availableTabs = tabs.filter((tab) => Array.isArray(tab?.rows) && tab.rows.length);
  let tabIndex = 0;
  let selected = 0;

  const currentTab = () => availableTabs[tabIndex] || { id: 'empty', name: 'EMPTY', rows: [] };
  const rows = () => currentTab().rows;

  function firstSelectable() {
    const index = rows().findIndex(selectable);
    return index < 0 ? 0 : index;
  }

  function clampSelection() {
    selected = Math.max(0, Math.min(rows().length - 1, selected));
    if (!selectable(rows()[selected])) selected = firstSelectable();
  }

  function move(delta) {
    const list = rows();
    if (!list.length) return;
    for (let count = 0; count < list.length; count++) {
      selected = (selected + delta + list.length) % list.length;
      if (selectable(list[selected])) break;
    }
    AUDIO.menuMove();
  }

  function changeTab(delta) {
    if (!availableTabs.length) return;
    tabIndex = (tabIndex + delta + availableTabs.length) % availableTabs.length;
    selected = firstSelectable();
    AUDIO.menuMove();
  }

  function close() {
    onClose();
  }

  function activate(row) {
    if (!selectable(row)) return;
    AUDIO.menuConfirm();
    if (row.closeMenu) {
      close();
      row.activate?.();
      return;
    }
    if (row.activate) row.activate();
    else row.adjust?.(1);
  }

  function key(event) {
    const raw = event.key || '';
    const keyName = raw.toLowerCase();
    const code = event.code || '';
    event.preventDefault?.();

    if (raw === 'Escape' || code === 'Escape' || raw === 'F10' || code === 'F10') {
      close();
      return true;
    }
    if (raw === 'Tab') { changeTab(event.shiftKey ? -1 : 1); return true; }
    if (raw === ']' || keyName === 'e' || code === 'KeyE') { changeTab(1); return true; }
    if (raw === '[' || keyName === 'q' || code === 'KeyQ') { changeTab(-1); return true; }
    if (raw === 'ArrowUp' || keyName === 'w' || code === 'KeyW') { move(-1); return true; }
    if (raw === 'ArrowDown' || keyName === 's' || code === 'KeyS') { move(1); return true; }

    clampSelection();
    const row = rows()[selected];
    if (raw === 'ArrowLeft' || keyName === 'a' || code === 'KeyA') {
      row?.adjust?.(-1);
      AUDIO.menuMove();
      return true;
    }
    if (raw === 'ArrowRight' || keyName === 'd' || code === 'KeyD') {
      row?.adjust?.(1);
      AUDIO.menuMove();
      return true;
    }
    if (raw === 'Enter' || code === 'Enter' || raw === ' ' || code === 'Space') {
      activate(row);
      return true;
    }
    return true;
  }

  function render() {
    const { cols, rows: screenRows } = uiSize();
    uiScrim(0.9);
    const width = Math.min(96, cols - 4);
    const height = Math.min(Math.max(30, screenRows - 6), screenRows - 2);
    const x = Math.floor((cols - width) / 2);
    const y = Math.floor((screenRows - height) / 2);
    const body = drawMachinePanel(x, y, width, height, {
      theme: 'red',
      wordmark: 'DEVELOPER',
      label: 'GOD / TESTING MENU',
      source: 'NON-CANONICAL STATE',
      footer: '[TAB/Q/E] GROUP · [↑↓] TEST · [←→] VALUE · [ENTER] FIRE · [F10] CLOSE',
      meter: false,
    });

    let tabX = body.x;
    availableTabs.forEach((tab, index) => {
      const active = index === tabIndex;
      const label = `${active ? '▸' : ' '}${String(tab.name || tab.id).toUpperCase()}`;
      if (tabX + label.length < x + width - 2) {
        uiText(tabX, body.y, label, active ? 'ui-danger' : 'ui-secondary');
      }
      tabX += label.length + 1;
    });

    clampSelection();
    const list = rows();
    const maxRows = Math.max(1, body.h - 5);
    const start = selected >= maxRows
      ? Math.min(selected - maxRows + 1, Math.max(0, list.length - maxRows))
      : 0;

    list.slice(start, start + maxRows).forEach((row, visibleIndex) => {
      const rowIndex = start + visibleIndex;
      const rowY = body.y + 3 + visibleIndex;
      if (row.kind === 'section') {
        uiText(body.x + 1, rowY, `— ${String(row.label || '').toUpperCase()} —`, 'ui-amber');
        return;
      }
      const active = rowIndex === selected;
      const value = resolveGodRowValue(row);
      const label = `${active ? '▸' : ' '} ${String(row.label || row.id || '').toUpperCase()}`;
      uiText(body.x, rowY, label.slice(0, 34), row.danger ? 'ui-danger' : active ? 'ui-primary' : 'ui-secondary');
      const valueX = body.x + 37;
      const rendered = row.adjust ? `◀ ${value} ▶` : String(value);
      uiText(valueX, rowY, rendered.slice(0, Math.max(1, body.x + body.w - valueX)), active ? 'ui-danger' : 'ui-secondary');
    });
  }

  return {
    id: 'god-menu',
    kind: 'developer-menu',
    blocksInput: true,
    blocksWorld: true,
    lookProfile: 'calm',
    enter() { globalThis.document?.body?.classList?.add('god-menu-open'); },
    exit() { globalThis.document?.body?.classList?.remove('god-menu-open'); },
    key,
    render,
    view() {
      clampSelection();
      return {
        tab: currentTab().id,
        row: rows()[selected]?.id || null,
        tabs: availableTabs.map((tab) => ({ id: tab.id, rows: tab.rows.map((row) => row.id).filter(Boolean) })),
      };
    },
  };
}
