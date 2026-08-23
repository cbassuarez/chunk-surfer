import * as scenes from './scenes.js';
import { uiFill, uiLine, uiSize, uiText, uiWrap } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { returnIndexEntries } from '../progression/report.js';
import * as AUDIO from '../audio/story-audio.js';
import { promptLine } from './bindings.js';
import { lastReturnRecord } from '../progression/return-history.js';
import { endingHintForEnding } from './post-run-copy.js';

export function makeReturnIndexScene({ meta, onRevealFieldReturn = null, onDeleteFieldReturn = null } = {}) {
  const entries = returnIndexEntries(meta);
  const latestEndingId = lastReturnRecord(meta)?.endingId || null;
  let sel = Math.max(0, entries.findIndex((entry) => entry.seen));
  let scroll = 0;
  let deleteArmed = null;
  const deletedCases = new Set();
  const dossierFor = (entry) => entry?.interference?.caseId && !deletedCases.has(entry.interference.caseId)
    ? entry.interference
    : null;
  return {
    id: 'return-index', blocksInput: true, blocksWorld: true, lensPreset: 'calm',
    enter() { AUDIO.startMenuHiss(); }, exit() { AUDIO.stopMenuHiss(); },
    key(e) {
      const k = String(e.key || '').toLowerCase();
      if (e.key === 'ArrowUp' || k === 'w') { sel = (sel - 1 + entries.length) % entries.length; deleteArmed = null; AUDIO.menuMove(); return true; }
      if (e.key === 'ArrowDown' || k === 's') { sel = (sel + 1) % entries.length; deleteArmed = null; AUDIO.menuMove(); return true; }
      const dossier = dossierFor(entries[sel]);
      if (k === 'r' && dossier) { void onRevealFieldReturn?.(dossier.caseId); return true; }
      if ((e.key === 'Delete' || k === 'x') && dossier) {
        const at = Date.now();
        if (deleteArmed?.caseId === dossier.caseId && deleteArmed.until > at) {
          deleteArmed = null;
          Promise.resolve(onDeleteFieldReturn?.(dossier.caseId)).then((deleted) => {
            if (deleted !== false) deletedCases.add(dossier.caseId);
          });
        } else deleteArmed = { caseId: dossier.caseId, until: at + 2400 };
        return true;
      }
      if (e.key === 'Escape' || k === 'b' || e.key === 'Enter') { scenes.pop(); return true; }
      return true;
    },
    render() {
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, UI_COLOR.glass);
      const w = Math.min(88, cols - 4), h = Math.min(Math.max(30, 13 + entries.length * 3), rows - 4);
      const x = Math.floor((cols - w) / 2), y = Math.floor((rows - h) / 2);
      const entry = entries[sel];
      const dossier = dossierFor(entry);
      const deletePending = dossier && deleteArmed?.caseId === dossier.caseId && deleteArmed.until > Date.now();
      const body = drawMachinePanel(x, y, w, h, {
        label: 'ENDINGS',
        source: `${meta?.endingsSeen?.length || 0} / ${entries.length}`,
        footer: dossier
          ? `R OPEN INTERFERENCE FILE · ${deletePending ? 'DEL CONFIRM DELETE' : 'DEL DELETE INTERFERENCE FILE'} · ESC CLOSE`
          : '↑↓ ENDING · ESC CLOSE',
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
        uiText(body.x + 5, body.y + 6 + j * 3, entry.seen ? 'COMPLETED' : entry.adjacent ? 'HINT' : 'LOCKED', entry.seen ? 'ui-green' : entry.adjacent ? 'ui-blue' : 'ui-secondary');
      });
      const dx = divider + 3, dw = body.x + body.w - dx;
      if (!entry) {
        uiText(dx, body.y + 5, 'NO ENDINGS INDEXED', 'ui-secondary');
        return;
      }
      uiText(dx, body.y + 5, entry.displayTitle, entry.seen ? 'ui-amber' : 'ui-secondary');
      uiText(dx, body.y + 8, `TYPE    ${entry.displayClassification || 'UNKNOWN'}`, entry.displayClassification ? 'ui-blue' : 'ui-secondary');
      uiText(dx, body.y + 10, `STATUS  ${entry.seen ? 'COMPLETED' : entry.adjacent ? 'HINT AVAILABLE' : 'LOCKED'}`, entry.seen ? 'ui-green' : entry.adjacent ? 'ui-blue' : 'ui-secondary');
      if (dossier) {
        uiText(dx, body.y + 12, `CASE    ${dossier.caseId}`, 'ui-amber');
        uiText(dx, body.y + 13, `OPERATOR ${dossier.tokens?.persona?.token || 'UNRESOLVED'}`, 'ui-secondary');
      }
      const copy = entry.seen
        ? 'You have reached this ending.'
        : entry.adjacent
          ? endingHintForEnding(latestEndingId) || 'A hint for this ending is available after your most recent completed run.'
        : 'Another ending exists. Its name and requirements remain hidden.';
      const copyY = dossier ? body.y + 16 : body.y + 13;
      const maxCopyRows = Math.max(1, body.h - 14 - (dossier ? 3 : 0));
      uiWrap(copy, dw).slice(0, maxCopyRows).forEach((line, i) => uiText(dx, copyY + i, line, 'ui-primary'));
    },
  };
}
