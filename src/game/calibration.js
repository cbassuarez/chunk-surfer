import * as scenes from './scenes.js';
import { uiSize, uiFill, uiText, uiWrap, uiStrokeRect } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { activeInputPromptDevice, promptLine } from './bindings.js';
import { TECHNIQUE_DEFS, normalizeCombatBuild, techniqueAvailability } from './combat-progression.js';

export function makeCalibrationScene({ getBuild, hasRig = () => false, onLearn = () => false, onClose = () => {} } = {}) {
  let selected = 0;
  let notice = '';
  let rows = [];
  const build = () => normalizeCombatBuild(getBuild?.());
  const move = (delta) => { selected = (selected + delta + TECHNIQUE_DEFS.length) % TECHNIQUE_DEFS.length; notice = ''; };
  const choose = () => {
    const entry = TECHNIQUE_DEFS[selected];
    const availability = techniqueAvailability(build(), entry.id, { hasRig: hasRig() });
    if (!availability.enabled) { notice = availability.reason; return; }
    notice = onLearn(entry.id) ? `${entry.label} CALIBRATED · LOCKED FOR THIS RUN` : 'CALIBRATION FAILED';
  };
  const close = () => { scenes.pop(); onClose(); };

  return {
    id: 'combat-calibration',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'calm',
    key(e) {
      if (e.key === 'ArrowUp' || e.key === 'w') move(-1);
      else if (e.key === 'ArrowDown' || e.key === 's') move(1);
      else if (e.key === 'Enter' || e.key === ' ' || e.key === 'z' || e.controllerAction === 'confirm') choose();
      else if (e.key === 'Escape' || e.key === 'Backspace' || e.controllerAction === 'back') close();
      return true;
    },
    pointer(e) {
      if (e.type !== 'pointerdown') return true;
      const x = Math.floor(Number(e.cellX)); const y = Math.floor(Number(e.cellY));
      const hit = rows.find((row) => y === row.y && x >= row.x && x < row.x + row.w);
      if (hit) { selected = hit.index; choose(); }
      return true;
    },
    render() {
      const { cols, rows: screenRows } = uiSize();
      uiFill(0, 0, cols, screenRows, 'rgba(2,2,3,.97)');
      const width = Math.min(76, cols - 6); const x = Math.floor((cols - width) / 2);
      const footer = activeInputPromptDevice() === 'controller'
        ? promptLine([{ action: 'select', label: 'SELECT' }, { action: 'confirm', label: 'CALIBRATE' }, { action: 'back', label: 'CLOSE' }])
        : '[↑↓] SELECT · [ENTER] CALIBRATE · [ESC] CLOSE';
      const panel = drawMachinePanel(x, 2, width, screenRows - 4, { label: 'RECORDER MAINTENANCE', source: 'CALIBRATION', footer });
      const current = build();
      drawVfdText(panel.x, panel.y, `CALIBRATION PINS · ${current.unspent}`, { color: UI_COLOR.amber, max: panel.w });
      uiText(panel.x, panel.y + 2, 'TWO PINS. ONE SPECIALIZATION OR TWO FIRST-STAGE MODIFICATIONS.', 'ui-secondary', .75);
      rows = [];
      TECHNIQUE_DEFS.forEach((entry, index) => {
        const y = panel.y + 5 + index * 3;
        const availability = techniqueAvailability(current, entry.id, { hasRig: hasRig() });
        const active = index === selected;
        const learned = current.techniques.includes(entry.id);
        const label = `${active ? '▶' : ' '} ${entry.branch.toUpperCase()} / ${entry.label} / TIER ${entry.tier} ${learned ? '[CALIBRATED]' : availability.enabled ? '[READY]' : `[${availability.reason}]`}`;
        uiText(panel.x, y, label.slice(0, panel.w), learned ? 'ui-counter' : availability.enabled ? active ? 'ui-primary' : 'ui-secondary' : 'ui-danger', active ? 1 : .78);
        uiWrap(entry.detail, panel.w - 2).slice(0, 1).forEach((line) => uiText(panel.x + 2, y + 1, line, 'ui-secondary', .72));
        if (active) uiStrokeRect(panel.x - .3, y - .05, Math.min(panel.w, label.length) + .6, 1, UI_COLOR.primary, .65, 1);
        rows.push({ index, x: panel.x, y, w: Math.min(panel.w, label.length) });
      });
      if (notice) uiText(panel.x, panel.y + panel.h - 3, notice.slice(0, panel.w), 'ui-amber', .8);
    },
  };
}

