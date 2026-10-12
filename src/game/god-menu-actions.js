// The developer menu has one action contract. A misspelled callback is an
// authoring error, not a selectable row that plays a sound and does nothing.
export function godActionRow({ id, label, activate, value = '[FIRE]', closeMenu = false, ...options }) {
  const row = { ...options, id, label, value, closeMenu, activate };
  validateGodRow(row);
  return row;
}

export function godStopRows(stops, enter) {
  if (typeof enter !== 'function') throw new TypeError('God stop handler must be a function');
  return stops.map(stop => godActionRow({
    id: stop.id, label: stop.label, value: '[DROP IN]', closeMenu: true,
    activate: () => enter(stop.depth, stop.label),
  }));
}

export function godRowSelectable(row) {
  return !!row && !['section', 'info'].includes(row.kind) && row.selectable !== false
    && (typeof row.activate === 'function' || typeof row.adjust === 'function');
}

export function validateGodRow(row) {
  if (!row || typeof row !== 'object') throw new TypeError('Invalid God-menu row');
  if ('run' in row) throw new TypeError(`God-menu row ${row.id || row.label}: use activate, not run`);
  for (const key of ['activate', 'adjust']) {
    if (row[key] != null && typeof row[key] !== 'function') throw new TypeError(`Invalid ${key}: ${row.id || row.label}`);
  }
  if (row.kind === 'section') return row;
  if (typeof row.id !== 'string' || !row.id.trim()) throw new TypeError('God-menu rows require a stable id');
  if (!godRowSelectable(row) && row.kind !== 'info' && row.selectable !== false) {
    throw new TypeError(`God-menu row ${row.id}: informational rows must be marked kind: 'info'`);
  }
  if (row.closeMenu && typeof row.activate !== 'function') throw new TypeError(`Closing row ${row.id} needs activate`);
  return row;
}

export function validateGodTabs(tabs) {
  const ids = new Set(), tabIds = new Set();
  for (const tab of tabs) {
    if (!tab?.id || tabIds.has(tab.id)) throw new TypeError(`Invalid/duplicate God-menu tab: ${tab?.id}`);
    tabIds.add(tab.id);
    if (!Array.isArray(tab.rows)) throw new TypeError(`Missing God-menu rows: ${tab.id}`);
    for (const row of tab.rows) {
      validateGodRow(row);
      if (!row.id) continue;
      if (ids.has(row.id)) throw new TypeError(`Duplicate God-menu row: ${row.id}`);
      ids.add(row.id);
    }
  }
  return tabs;
}
