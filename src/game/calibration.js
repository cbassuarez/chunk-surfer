import * as scenes from './scenes.js';
import { uiSize, uiFill, uiText, uiWrap, uiStrokeRect, uiLine } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { activeInputPromptDevice, promptLine } from './bindings.js';
import { TECHNIQUE_DEFS, normalizeCombatBuild, techniqueAvailability } from './combat-progression.js';

const BRANCH_LABEL = Object.freeze({
  torch: 'FIELD TORCH',
  recorder: 'RECORDER',
  rig: 'BENT RIG',
});

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
      else if (e.key === 'Escape' || e.key === 'Tab' || e.key === 'Backspace' || e.controllerAction === 'back') close();
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
      const width = Math.min(84, cols - 6); const x = Math.floor((cols - width) / 2);
      const footer = activeInputPromptDevice() === 'controller'
        ? promptLine([{ action: 'select', label: 'SELECT' }, { action: 'confirm', label: 'CALIBRATE' }, { action: 'back', label: 'CLOSE' }])
        : '[↑↓] SELECT · [ENTER] CALIBRATE · [ESC] CLOSE';
      const panel = drawMachinePanel(x, 2, width, screenRows - 4, { label: 'RECORDER MAINTENANCE', source: 'CALIBRATION', footer });
      const current = build();

      drawVfdText(panel.x, panel.y, 'CALIBRATION', { scale: 2 });
      // The pins themselves, as physical slots: earned pins glow, spent pins
      // sit dim behind their technique, empty slots are silkscreen outlines.
      const pinX = panel.x + Math.max(26, Math.floor(panel.w * .55));
      uiText(pinX, panel.y, 'PINS', 'ui-label', .7);
      for (let i = 0; i < 2; i++) {
        const px = pinX + 6 + i * 4;
        const spent = i < current.pinsSpent;
        const ready = !spent && i < current.pinsEarned;
        uiFill(px, panel.y + .12, 2.4, .72, spent ? 'rgba(255,181,54,0.22)' : ready ? 'rgba(255,181,54,0.92)' : 'rgba(255,255,255,0.06)');
        uiStrokeRect(px, panel.y + .12, 2.4, .72, UI_COLOR.amber, ready ? .8 : .3, 1);
      }
      uiText(pinX + 15, panel.y, current.unspent ? `${current.unspent} READY` : 'NONE FREE', current.unspent ? 'ui-counter' : 'ui-secondary', .8);
      uiText(panel.x, panel.y + 2, 'PINS COME BACK FROM FIELD ENCOUNTERS. ONE SPECIALIZATION, OR TWO FIRST-STAGE MODIFICATIONS.', 'ui-secondary', .7);

      rows = [];
      let y = panel.y + 4;
      let lastBranch = null;
      TECHNIQUE_DEFS.forEach((entry, index) => {
        if (entry.branch !== lastBranch) {
          lastBranch = entry.branch;
          uiText(panel.x, y, `— ${BRANCH_LABEL[entry.branch] || entry.branch.toUpperCase()}`, 'ui-label', .6);
          y += 1;
        }
        const availability = techniqueAvailability(current, entry.id, { hasRig: hasRig() });
        const active = index === selected;
        const learned = current.techniques.includes(entry.id);
        const chain = entry.tier > 1 ? '└─ ' : '';
        const status = learned ? '● CALIBRATED' : availability.enabled ? '○ READY' : `× ${availability.reason}`;
        const label = `${active ? '▶' : ' '} ${chain}${entry.label}`;
        uiText(panel.x, y, label.slice(0, Math.floor(panel.w * .38)), learned ? 'ui-counter' : availability.enabled ? (active ? 'ui-primary' : 'ui-secondary') : 'ui-secondary', active ? 1 : .78);
        uiText(panel.x + Math.floor(panel.w * .40), y, status.slice(0, Math.floor(panel.w * .24)), learned ? 'ui-counter' : availability.enabled ? 'ui-blue' : 'ui-danger', active ? .95 : .6);
        uiText(panel.x + Math.floor(panel.w * .40) + Math.floor(panel.w * .26), y, entry.detail.toUpperCase().slice(0, Math.max(8, panel.w - Math.floor(panel.w * .66))), 'ui-secondary', active ? .85 : .5);
        if (active) uiStrokeRect(panel.x - .3, y - .05, panel.w + .6, 1.1, UI_COLOR.primary, .55, 1);
        rows.push({ index, x: panel.x, y, w: panel.w });
        y += 1.4;
      });

      // The selected technique, spelled out in full at the bottom.
      const entry = TECHNIQUE_DEFS[selected];
      const detailY = panel.y + panel.h - 5;
      uiLine(panel.x, detailY - .5, panel.x + panel.w, detailY - .5, UI_COLOR.frame, .5);
      uiText(panel.x, detailY, `${BRANCH_LABEL[entry.branch] || entry.branch.toUpperCase()} / ${entry.label} / TIER ${entry.tier}${entry.requires ? ` · REQUIRES ${TECHNIQUE_DEFS.find((d) => d.id === entry.requires)?.label || ''}` : ''}${entry.requiresRig ? ' · NEEDS THE BENT RIG' : ''}`, 'ui-blue', .8);
      uiWrap(entry.detail, panel.w - 2).slice(0, 2).forEach((line, i) => uiText(panel.x, detailY + 1 + i, line, 'ui-primary', .85));

      if (notice) uiText(panel.x, panel.y + panel.h - 2, notice.slice(0, panel.w), 'ui-amber', .85);
    },
  };
}
