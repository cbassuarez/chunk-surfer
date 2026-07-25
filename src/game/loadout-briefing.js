import * as scenes from './scenes.js';
import { uiSize, uiFill, uiText, uiStrokeRect } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { activeInputPromptDevice, promptLine } from './bindings.js';
import { buildBagModel } from './bag-model.js';
import { BATTLE_GEAR } from './combat-loadout.js';

// The one time the game shows the player they own their battle loadout.
//
// It runs once, before the first fight, gated by a save flag — the field bag
// can be re-packed any time, but a modal before every battle would be a tax.
// This is a focused tray editor: patch gear between the reachable battle tray
// and storage, order the tray (which is the in-fight tool rail order), and go.
export function makeLoadoutBriefingScene({
  getLoadout = () => ({}),
  getEquipment = () => [],
  moveEquipment = () => ({ changed: false }),
  reorderEquipment = () => ({ changed: false }),
  onConfirm = () => {},
  onClose = () => {},
} = {}) {
  let selected = 0;
  let notice = '';
  let rows = [];

  const kit = () => buildBagModel({ equipment: getEquipment() || [], loadout: getLoadout() })
    .sections.find((section) => section.id === 'kit')?.entries
    // Only battle-capable gear is relevant to a loadout; the rest is field kit.
    .filter((entry) => entry.battleCapable && entry.present) || [];

  const clampSel = (list) => { selected = Math.max(0, Math.min(selected, Math.max(0, list.length - 1))); };
  const move = (delta) => { const list = kit(); selected = (selected + delta + list.length) % Math.max(1, list.length); notice = ''; };

  function act(kind) {
    const list = kit();
    clampSel(list);
    const entry = list[selected];
    if (!entry) return;
    if (kind === 'toggle') {
      const dest = entry.compartment === 'top' ? 'storage' : 'top';
      const result = moveEquipment(entry.sourceId, dest);
      notice = result?.changed
        ? `${entry.title} → ${dest === 'top' ? 'BATTLE TRAY' : 'STORAGE'}`
        : result?.reason === 'top-full' ? 'TRAY FULL · MOVE ONE OUT FIRST' : 'UNCHANGED';
    } else if (kind === 'up') {
      const result = reorderEquipment(entry.sourceId, 'up');
      if (result?.changed) { selected = Math.max(0, selected - 1); notice = `${entry.title} MOVED UP`; }
      else notice = 'ALREADY FIRST';
    }
  }

  const close = () => { scenes.pop(); onClose(); };
  const confirm = () => { scenes.pop(); onConfirm(); };

  return {
    id: 'loadout-briefing',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'calm',
    key(e) {
      const k = String(e.key || '').toLowerCase();
      const code = e.code || '';
      if (e.key === 'ArrowUp' || k === 'w' || code === 'KeyW') move(-1);
      else if (e.key === 'ArrowDown' || k === 's' || code === 'KeyS') move(1);
      else if (e.key === ' ' || code === 'Space' || e.controllerAction === 'confirm') act('toggle');
      else if (k === 'r' || code === 'KeyR' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') act('up');
      else if (e.key === 'Enter' || code === 'Enter') confirm();
      else if (e.key === 'Escape' || e.key === 'Tab' || e.controllerAction === 'back') close();
      return true;
    },
    pointer(e) {
      if (e.type !== 'pointerdown') return true;
      const x = Math.floor(Number(e.cellX));
      const y = Math.floor(Number(e.cellY));
      const hit = rows.find((row) => y === row.y && x >= row.x && x < row.x + row.w);
      if (hit) { selected = hit.index; act('toggle'); }
      return true;
    },
    view() {
      const list = kit();
      clampSel(list);
      return {
        id: 'loadout-briefing',
        top: list.filter((entry) => entry.compartment === 'top').map((entry) => entry.sourceId),
        selected: list[selected]?.sourceId || null,
        capacity: getLoadout()?.capacity ?? null,
      };
    },
    render() {
      const { cols, rows: screenRows } = uiSize();
      uiFill(0, 0, cols, screenRows, 'rgba(2,2,3,.97)');
      const width = Math.min(88, cols - 6);
      const x = Math.floor((cols - width) / 2);
      const footer = activeInputPromptDevice() === 'controller'
        ? promptLine([{ action: 'select', label: 'GEAR' }, { action: 'confirm', label: 'PATCH' }, { action: 'start', label: 'BEGIN' }])
        : '[↑↓] GEAR · [SPACE] PATCH IN/OUT · [R] ORDER · [ENTER] BEGIN';
      const panel = drawMachinePanel(x, 2, width, screenRows - 4, { label: 'FIELD CASE / BATTLE TRAY', source: 'LOADOUT', footer });

      drawVfdText(panel.x, panel.y, 'BATTLE TRAY', { scale: 2 });
      const list = kit();
      clampSel(list);
      const top = list.filter((entry) => entry.compartment === 'top');
      uiText(panel.x + Math.max(24, Math.floor(panel.w * .5)), panel.y, `TRAY ${top.length}/${getLoadout()?.capacity ?? 4}`, 'ui-counter', .85);
      uiText(panel.x, panel.y + 2, 'THE TRAY IS WHAT YOU CAN REACH MID-FIGHT. ITS ORDER IS YOUR TOOL RAIL. REPACK ANYTIME FROM THE BAG.', 'ui-secondary', .72);

      rows = [];
      let y = panel.y + 4;
      const drawGroup = (label, entries, showOrder) => {
        uiText(panel.x, y, `— ${label}`, 'ui-label', .6); y += 1;
        if (!entries.length) { uiText(panel.x + 2, y, 'EMPTY', 'ui-secondary', .5); y += 1.4; }
        entries.forEach((entry) => {
          const index = list.indexOf(entry);
          const active = index === selected;
          const rail = showOrder ? `${entry.topIndex + 1}· ` : '';
          const verb = BATTLE_GEAR[entry.sourceId]?.toolId?.toUpperCase() || '';
          uiText(panel.x, y, `${active ? '▶' : ' '} ${rail}${entry.title}`.slice(0, Math.floor(panel.w * .5)), active ? 'ui-primary' : 'ui-secondary', active ? 1 : .78);
          uiText(panel.x + Math.floor(panel.w * .52), y, verb.slice(0, Math.floor(panel.w * .44)), active ? 'ui-blue' : 'ui-secondary', active ? .85 : .5);
          if (active) uiStrokeRect(panel.x - .3, y - .05, panel.w + .6, 1.1, UI_COLOR.primary, .55, 1);
          rows.push({ index, x: panel.x, y, w: panel.w });
          y += 1.4;
        });
        y += .5;
      };
      drawGroup('BATTLE TRAY · REACHABLE', top, true);
      drawGroup('STORAGE · NOT IN THIS FIGHT', list.filter((entry) => entry.compartment !== 'top'), false);

      if (notice) uiText(panel.x, panel.y + panel.h - 2, notice.slice(0, panel.w), 'ui-amber', .85);
    },
  };
}
