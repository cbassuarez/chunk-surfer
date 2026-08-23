import * as scenes from './scenes.js';
import { uiFill, uiLine, uiSize, uiText, uiWrap } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { achievementEntries } from '../progression/achievements.js';
import * as AUDIO from '../audio/story-audio.js';
import { promptLine } from './bindings.js';
import { returnFileEntries } from './second-shift.js';
import { returnDefinition } from '../progression/report.js';
import { endingHintForEnding } from './post-run-copy.js';

const CATEGORY_ORDER = ['work', 'disclosures', 'returns', 'method'];
const CATEGORY_LABEL = { work: 'STORY', disclosures: 'SECRETS', returns: 'ENDINGS', method: 'CHALLENGES' };

export function makeArchiveScene({ meta, onClose = () => {} } = {}) {
  const entries = achievementEntries(meta);
  const files = returnFileEntries(meta);
  let tab = 0;
  let category = 0;
  let sel = 0;
  let scroll = 0;
  // A filed document runs to five paragraphs and the panel holds two or three, so
  // it pages. Up/Down already move between returns; left/right are free on this
  // tab and were doing nothing.
  let docPage = 0;

  const visibleEntries = () => tab === 0 ? entries.filter((entry) => entry.category === CATEGORY_ORDER[category]) : files;
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
      if (e.key === 'Tab') {
        tab = (tab + (e.shiftKey ? -1 : 1) + 2) % 2;
        sel = 0; scroll = 0; AUDIO.menuMove(); return true;
      }
      if (tab === 0 && e.key === 'ArrowRight') {
        category = (category + (e.shiftKey ? -1 : 1) + CATEGORY_ORDER.length) % CATEGORY_ORDER.length;
        sel = 0; scroll = 0; AUDIO.menuMove(); return true;
      }
      if (tab === 0 && e.key === 'ArrowLeft') { category = (category - 1 + CATEGORY_ORDER.length) % CATEGORY_ORDER.length; sel = 0; scroll = 0; AUDIO.menuMove(); return true; }
      if (tab === 1 && e.key === 'ArrowRight') { docPage++; AUDIO.menuMove(); return true; }
      if (tab === 1 && e.key === 'ArrowLeft') { docPage = Math.max(0, docPage - 1); AUDIO.menuMove(); return true; }
      if (e.key === 'ArrowUp' || k === 'w') { sel--; docPage = 0; clamp(); AUDIO.menuMove(); return true; }
      if (e.key === 'ArrowDown' || k === 's') { sel++; docPage = 0; clamp(); AUDIO.menuMove(); return true; }
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
        label: 'ARCHIVE',
        source: 'PROGRESS',
        footerParts: [{ action: 'tabNext', label: 'TAB' }, { action: 'select', label: 'ENTRY' }, { action: 'back', label: 'CLOSE' }],
        meter: false,
      });
      drawVfdText(body.x, body.y, tab === 0 ? 'ACHIEVEMENTS' : 'RUN HISTORY', { color: UI_COLOR.amber, max: body.w });
      uiText(body.x + Math.max(20, body.w - 38), body.y, tab === 0 ? '[ACHIEVEMENTS]  RUN HISTORY' : ' ACHIEVEMENTS  [RUN HISTORY]', 'ui-label');
      let tx = body.x;
      if (tab === 0) CATEGORY_ORDER.forEach((id, i) => {
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
        if (tab === 1) {
          const ending = returnDefinition(entry.summary?.endingId);
          const title = ending?.title || String(entry.summary?.endingId || 'ending').replaceAll('-', ' ').toUpperCase();
          uiText(body.x, body.y + 5 + j, `${on ? '▸' : ' '} ${title}`.slice(0, listW - 12), on ? 'ui-amber' : 'ui-primary');
          uiText(body.x + listW - 9, body.y + 5 + j, 'COMPLETED', 'ui-green');
          return;
        }
        const hidden = entry.hidden && !entry.unlocked;
        const title = hidden ? '████████████' : entry.name.toUpperCase();
        const status = entry.unlocked ? 'DONE' : hidden ? 'LOCKED' : 'OPEN';
        uiText(body.x, body.y + 5 + j, `${on ? '▸' : ' '} ${title}`.slice(0, listW - 9), on ? 'ui-amber' : entry.unlocked ? 'ui-primary' : 'ui-secondary');
        uiText(body.x + listW - status.length, body.y + 5 + j, status, entry.unlocked ? 'ui-green' : 'ui-secondary');
      });

      const entry = list[sel];
      if (!entry) {
        if (tab === 1) {
          uiText(body.x, body.y + 6, 'NO COMPLETED RUNS', 'ui-secondary');
          uiWrap('Finish the story to add its ending, unlocked hint, and archived document here.', body.w).slice(0, Math.max(0, body.h - 10))
            .forEach((line, i) => uiText(body.x, body.y + 8 + i, line, 'ui-secondary', .72));
        } else {
          uiText(body.x, body.y + 6, 'NO ENTRIES IN THIS CATEGORY', 'ui-secondary');
          uiWrap('This index will populate as you make story progress, find endings, and complete challenges.', body.w).slice(0, Math.max(0, body.h - 10))
            .forEach((line, i) => uiText(body.x, body.y + 8 + i, line, 'ui-secondary', .72));
        }
        return;
      }
      const dx = divider + 3, dw = body.x + body.w - dx;
      if (tab === 1) {
        const ending = returnDefinition(entry.summary?.endingId);
        uiText(dx, body.y + 5, ending?.title || String(entry.summary?.endingId || 'ending').replaceAll('-', ' ').toUpperCase(), 'ui-amber');
        uiText(dx, body.y + 7, 'COMPLETED', 'ui-green');
        uiText(dx, body.y + 10, 'HINT FOR ANOTHER ENDING', 'ui-label');
        let ry = body.y + 12;
        uiWrap(endingHintForEnding(entry.summary?.endingId) || 'Try changing a major choice near the end of the story.', dw).slice(0, 3)
          .forEach((line, i) => uiText(dx, ry + i, line, 'ui-primary'));
        ry += 4;
        uiText(dx, ry, 'ARCHIVED STORY DOCUMENT', 'ui-label');
        ry += 2;
        // THE DOCUMENT THE ENDING LEFT BEHIND. This is what W. Ellery wrote about
        // a night nobody at W. Ellery attended — the only voice in this game that
        // was not in the building, and the reason the return files are worth
        // opening twice. See data/ending-archive.js.
        const doc = entry.document;
        if (doc) {
          // PAGE IT RATHER THAN TRUNCATE IT. The first version stopped when it ran
          // out of panel, which on a short terminal meant paragraphs two to five of
          // every filed document were unreachable and nothing said so.
          const room = Math.max(3, body.y + body.h - 1 - (ry + 3));
          const pages = [];
          let page = [];
          let used = 0;
          for (const paragraph of doc.body) {
            const wrapped = uiWrap(paragraph, dw);
            if (page.length && used + wrapped.length + 1 > room) { pages.push(page); page = []; used = 0; }
            page.push(...wrapped, '');
            used += wrapped.length + 1;
          }
          if (page.length) pages.push(page);
          docPage = pages.length ? Math.min(docPage, pages.length - 1) : 0;
          uiText(dx, ry, doc.title.slice(0, dw), 'ui-amber');
          const filing = `${doc.classification} · ${doc.filedBy}`;
          uiText(dx, ry + 1, filing.slice(0, dw), 'ui-label', 0.8);
          if (pages.length > 1) {
            const marker = `${docPage + 1}/${pages.length}  ◂ ▸`;
            uiText(dx + Math.max(0, dw - marker.length), ry + 1, marker, 'ui-blue', 0.9);
          }
          (pages[docPage] || []).slice(0, room).forEach((line, i) => uiText(dx, ry + 3 + i, line, 'ui-primary', 0.86));
        }
        return;
      }
      const hidden = entry.hidden && !entry.unlocked;
      uiText(dx, body.y + 5, hidden ? 'LOCKED ACHIEVEMENT' : entry.name.toUpperCase(), entry.unlocked ? 'ui-amber' : 'ui-secondary');
      uiText(dx, body.y + 7, `CATEGORY  ${CATEGORY_LABEL[entry.category]}`, 'ui-label');
      uiText(dx, body.y + 9, `STATUS    ${entry.unlocked ? 'UNLOCKED' : 'LOCKED'}`, entry.unlocked ? 'ui-green' : 'ui-secondary');
      const description = hidden ? 'Unlock this achievement to reveal its name and requirement.' : entry.description;
      uiWrap(description, dw).slice(0, Math.max(1, body.h - 13)).forEach((line, i) => uiText(dx, body.y + 12 + i, line, entry.unlocked ? 'ui-primary' : 'ui-secondary'));
    },
  };
}
