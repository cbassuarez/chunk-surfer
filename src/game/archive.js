import * as scenes from './scenes.js';
import { uiFill, uiLine, uiSize, uiText, uiWrap } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { achievementEntries } from '../progression/achievements.js';
import * as AUDIO from '../audio/story-audio.js';
import { promptLine } from './bindings.js';

const CATEGORY_ORDER = ['work', 'disclosures', 'returns', 'method'];
const CATEGORY_LABEL = { work: 'STORY', disclosures: 'SECRETS', returns: 'ENDINGS', method: 'CHALLENGES' };

export function makeArchiveScene({ meta, onClose = () => {} } = {}) {
  const entries = achievementEntries(meta);
  let category = 0;
  let sel = 0;
  let scroll = 0;

  const visibleEntries = () => entries.filter((entry) => entry.category === CATEGORY_ORDER[category]);
  const clamp = () => {
    const list = visibleEntries();
    sel = Math.max(0, Math.min(sel, Math.max(0, list.length - 1)));
  };

  return {
    id: 'archive', blocksInput: true, blocksWorld: true, lensPreset: 'calm',
    enter() { AUDIO.startMenuHiss(); },
    exit() { AUDIO.stopMenuHiss(); onClose(); },
    key(e) {
      const k = String(e.key || '').toLowerCase();
      if (e.key === 'Tab' || e.key === 'ArrowRight') {
        category = (category + (e.shiftKey ? -1 : 1) + CATEGORY_ORDER.length) % CATEGORY_ORDER.length;
        sel = 0; scroll = 0; AUDIO.menuMove(); return true;
      }
      if (e.key === 'ArrowLeft') { category = (category - 1 + CATEGORY_ORDER.length) % CATEGORY_ORDER.length; sel = 0; scroll = 0; AUDIO.menuMove(); return true; }
      if (e.key === 'ArrowUp' || k === 'w') { sel--; clamp(); AUDIO.menuMove(); return true; }
      if (e.key === 'ArrowDown' || k === 's') { sel++; clamp(); AUDIO.menuMove(); return true; }
      if (e.key === 'Escape' || k === 'b' || e.key === 'Enter') { scenes.pop(); return true; }
      return true;
    },
    render() {
      clamp();
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, UI_COLOR.glass);
      const w = Math.min(94, cols - 4), h = Math.min(Math.max(32, rows - 8), rows - 4);
      const x = Math.floor((cols - w) / 2), y = Math.floor((rows - h) / 2);
      const body = drawMachinePanel(x, y, w, h, {
        label: 'ACHIEVEMENTS',
        source: 'PROGRESS',
        footerParts: [{ action: 'tabNext', label: 'CATEGORY' }, { action: 'select', label: 'ENTRY' }, { action: 'back', label: 'CLOSE' }],
        meter: false,
      });
      drawVfdText(body.x, body.y, 'ACHIEVEMENTS', { color: UI_COLOR.amber, max: body.w });
      let tx = body.x;
      CATEGORY_ORDER.forEach((id, i) => {
        const on = i === category;
        const label = on ? `[${CATEGORY_LABEL[id]}]` : ` ${CATEGORY_LABEL[id]} `;
        uiText(tx, body.y + 2, label, on ? 'ui-amber' : 'ui-secondary');
        tx += label.length + 2;
      });

      const list = visibleEntries();
      const listW = Math.max(28, Math.floor(body.w * 0.42));
      const divider = body.x + listW + 1;
      uiLine(divider, body.y + 4, divider, body.y + body.h - 1, UI_COLOR.frame, 0.65);
      const cap = Math.max(4, body.h - 7);
      if (sel < scroll) scroll = sel;
      if (sel >= scroll + cap) scroll = sel - cap + 1;
      list.slice(scroll, scroll + cap).forEach((entry, j) => {
        const i = scroll + j, on = i === sel;
        const hidden = entry.hidden && !entry.unlocked;
        const title = hidden ? '████████████' : entry.name.toUpperCase();
        const status = entry.unlocked ? 'DONE' : hidden ? 'LOCKED' : 'OPEN';
        uiText(body.x, body.y + 5 + j, `${on ? '▸' : ' '} ${title}`.slice(0, listW - 9), on ? 'ui-amber' : entry.unlocked ? 'ui-primary' : 'ui-secondary');
        uiText(body.x + listW - status.length, body.y + 5 + j, status, entry.unlocked ? 'ui-green' : 'ui-secondary');
      });

      const entry = list[sel];
      if (!entry) {
        uiText(body.x, body.y + 6, 'NO ENTRIES FILED IN THIS CATEGORY', 'ui-secondary');
        uiWrap('This index is available now. It will populate as the case records story progress, endings, and challenges.', body.w).slice(0, Math.max(0, body.h - 10)).forEach((line, i) => uiText(body.x, body.y + 8 + i, line, 'ui-secondary', .72));
        return;
      }
      const dx = divider + 3, dw = body.x + body.w - dx;
      const hidden = entry.hidden && !entry.unlocked;
      uiText(dx, body.y + 5, hidden ? 'LOCKED ACHIEVEMENT' : entry.name.toUpperCase(), entry.unlocked ? 'ui-amber' : 'ui-secondary');
      uiText(dx, body.y + 7, `CATEGORY  ${CATEGORY_LABEL[entry.category]}`, 'ui-label');
      uiText(dx, body.y + 9, `STATUS    ${entry.unlocked ? 'UNLOCKED' : 'LOCKED'}`, entry.unlocked ? 'ui-green' : 'ui-secondary');
      const description = hidden ? 'Unlock this achievement to reveal its name and requirement.' : entry.description;
      uiWrap(description, dw).slice(0, Math.max(1, body.h - 13)).forEach((line, i) => uiText(dx, body.y + 12 + i, line, entry.unlocked ? 'ui-primary' : 'ui-secondary'));
    },
  };
}
