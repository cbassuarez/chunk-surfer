import * as scenes from './scenes.js';
import { uiFill, uiLine, uiSize, uiText, uiWrap } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { returnIndexEntries } from '../progression/report.js';
import * as AUDIO from '../audio/story-audio.js';
import { promptLine } from './bindings.js';

export function makeReturnIndexScene({ meta } = {}) {
  const entries = returnIndexEntries(meta);
  let sel = Math.max(0, entries.findIndex((entry) => entry.seen));
  let scroll = 0;
  return {
    id: 'return-index', blocksInput: true, blocksWorld: true, lensPreset: 'calm',
    enter() { AUDIO.startMenuHiss(); }, exit() { AUDIO.stopMenuHiss(); },
    key(e) {
      const k = String(e.key || '').toLowerCase();
      if (e.key === 'ArrowUp' || k === 'w') { sel = (sel - 1 + entries.length) % entries.length; AUDIO.menuMove(); return true; }
      if (e.key === 'ArrowDown' || k === 's') { sel = (sel + 1) % entries.length; AUDIO.menuMove(); return true; }
      if (e.key === 'Escape' || k === 'b' || e.key === 'Enter') { scenes.pop(); return true; }
      return true;
    },
    render() {
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, UI_COLOR.glass);
      const w = Math.min(88, cols - 4), h = Math.min(Math.max(30, 13 + entries.length * 3), rows - 4);
      const x = Math.floor((cols - w) / 2), y = Math.floor((rows - h) / 2);
      const body = drawMachinePanel(x, y, w, h, {
        label: 'ENDINGS',
        source: `${meta?.endingsSeen?.length || 0} / ${entries.length}`,
        footer: promptLine([{ action: 'select', label: 'ENDING' }, { action: 'back', label: 'CLOSE' }]),
        meter: false,
      });
      drawVfdText(body.x, body.y, 'ENDINGS', { color: UI_COLOR.amber, max: body.w });
      const listW = Math.max(30, Math.floor(body.w * 0.44));
      const divider = body.x + listW + 1;
      uiLine(divider, body.y + 3, divider, body.y + body.h - 1, UI_COLOR.frame, 0.65);
      const cap = Math.max(1, Math.floor((body.h - 7) / 3));
      if (sel < scroll) scroll = sel;
      if (sel >= scroll + cap) scroll = sel - cap + 1;
      entries.slice(scroll, scroll + cap).forEach((entry, j) => {
        const i = scroll + j;
        const on = i === sel;
        const n = String(entry.order).padStart(2, '0');
        uiText(body.x, body.y + 5 + j * 3, `${on ? '▸' : ' '} ${n}  ${entry.displayTitle}`.slice(0, listW - 1), on ? 'ui-amber' : entry.seen ? 'ui-primary' : 'ui-secondary');
        uiText(body.x + 5, body.y + 6 + j * 3, entry.seen ? 'SEEN' : 'LOCKED', entry.seen ? 'ui-green' : 'ui-secondary');
      });
      const entry = entries[sel];
      const dx = divider + 3, dw = body.x + body.w - dx;
      if (!entry) {
        uiText(dx, body.y + 5, 'NO ENDINGS INDEXED', 'ui-secondary');
        return;
      }
      uiText(dx, body.y + 5, entry.displayTitle, entry.seen ? 'ui-amber' : 'ui-secondary');
      uiText(dx, body.y + 8, `TYPE    ${entry.displayClassification || 'UNKNOWN'}`, entry.displayClassification ? 'ui-blue' : 'ui-secondary');
      uiText(dx, body.y + 10, `STATUS  ${entry.seen ? 'SEEN' : 'LOCKED'}`, entry.seen ? 'ui-green' : 'ui-secondary');
      const copy = entry.seen
        ? 'You have reached this ending. The index records the outcome, not a step-by-step route.'
        : 'Another ending exists. Its title and route stay hidden until you reach it.';
      uiWrap(copy, dw).slice(0, Math.max(1, body.h - 14)).forEach((line, i) => uiText(dx, body.y + 13 + i, line, 'ui-primary'));
    },
  };
}
