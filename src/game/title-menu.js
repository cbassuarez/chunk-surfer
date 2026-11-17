// Profile state determines available actions; it never creates or resets a run.
export function titleMenuItems(meta = {}, { activeRun = false, desktop = false } = {}) {
  const returns = meta.endingsSeen?.length || 0;
  const filed = Object.keys(meta.knowledge?.documents || {}).length;
  const history = activeRun || returns > 0 || Number(meta.runs) > 0
    || Object.keys(meta.achievements || {}).length > 0
    || Object.values(meta.knowledge || {}).some(records => records && Object.keys(records).length > 0);
  return [
    ...(activeRun ? [{ id: 'continue', label: 'continue' }] : []),
    { id: 'new-run', label: 'new game', confirms: activeRun },
    ...(history ? [{ id: 'archive', label: 'archive' }] : []),
    ...(returns ? [{ id: 'return-index', label: 'endings' }] : []),
    ...(returns || filed ? [{ id: 'transfer-room', label: 'field replays' }] : []),
    { id: 'settings', label: 'settings' },
    { id: 'about', label: 'about' },
    ...(desktop ? [{ id: 'quit', label: 'quit' }] : []),
  ];
}

// Only the action list uses this layout. It cannot change the enclosing frame,
// title, meters, status band, fonts, materials or their established coordinates.
export function titleOptionsLayout(body, {menuY, bottom, itemCount, selected=0, scroll=0} = {}) {
  const rowStep = 1.6;
  const visible = Math.max(1, Math.min(itemCount, 1 + Math.floor((bottom - menuY - .8) / rowStep)));
  let start = Math.max(0, Math.min(scroll, itemCount - visible));
  if (selected < start) start = selected;
  if (selected >= start + visible) start = selected - visible + 1;
  const w = Math.max(1, body.w - 14);
  return {x:body.x + 7, w, rowStep, start, visible};
}
