// THE TRANSFER ROOM.
//
// The office you come back to. Not a mode and not a run — a desk, a terminal
// called TR-4417, and the file the company has been keeping since before any of
// this was your job.
//
// It replaces THE HUSH in the menu. That mode's one genuinely good thing was a
// terminal buried three quarters of the way inside it, holding eight documents
// that exist nowhere else in the game, behind a reader that ejected itself eight
// seconds before the next anchor. This is that terminal, let out.
//
// THE NOTES COLUMN IS THE POINT — the story that no line of dialogue and no
// object in the building ever says. The rows and the notes are authored in
// data/transfer-registry.js, which is pure; this file is the machine they are
// read on, and it is deliberately built in the shape of return-index.js.

import * as scenes from './scenes.js';
import { uiFill, uiLine, uiSize, uiText, uiWrap } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import * as AUDIO from '../audio/story-audio.js';
import { HUSH_DOSSIER } from './hush-dossier.js';
import { PAGES, WORK_ORDER } from '../data/conservatory-script.js';
import { resolvedReturnHistory } from '../progression/return-history.js';
import { fitText } from '../render/fit-text.js';
import {
  REGISTER, fileRegisterRows, holdingsRegisterRows, resolveCitations,
} from '../data/transfer-registry.js';

// Truncation with a mark on it. A word cut off mid-letter reads as a display
// fault; the same word with an ellipsis reads as a column doing its job.
const clip = (text, width) => fitText(text, width);

const TABS = Object.freeze([
  { id: REGISTER.FILE, label: 'FILE' },
  { id: REGISTER.HOLDINGS, label: 'HOLDINGS' },
  { id: REGISTER.NIGHTS, label: 'NIGHTS' },
]);

// Your own nights, filed the same way as everything else. The company does not
// keep a different kind of record for you.
function nightRows(meta) {
  const history = resolvedReturnHistory(meta);
  return history.map((record, index) => {
    const n = String(index + 1).padStart(2, '0');
    const takes = record?.takes?.completed ?? record?.takes?.rooms?.length ?? null;
    const injuries = record?.injuries ?? null;
    return {
      id: `night-${record?.id || index}`,
      register: REGISTER.NIGHTS,
      ref: `NIGHT ${n}`,
      title: String(record?.endingId || 'RETURN NOT CLASSIFIED').toUpperCase(),
      byline: 'W. ELLERY / WORKS · SITE NIGHT',
      date: record?.committedAt ? new Date(record.committedAt).toLocaleDateString('en-GB') : '—',
      issuer: 'ELLERY WORKS',
      reproduction: 'ORIGINAL',
      process: 'IMPACT 24',
      status: '',
      note: '',
      cites: [],
      seen: true,
      lines: [
        takes == null ? '' : `Clean references produced: ${takes}.`,
        injuries == null ? '' : `Operator condition on return: ${injuries ? `${injuries} logged` : 'no entry'}.`,
        '',
        'Filed by the deck. The operator did not sign this sheet.',
      ].filter((line, i, all) => line !== '' || all[i - 1] !== ''),
    };
  });
}

export function makeTransferRoomScene({ meta = {} } = {}) {
  const knowledge = meta?.knowledge?.documents || {};
  const registers = {
    [REGISTER.FILE]: fileRegisterRows({ knowledge, pages: PAGES, workOrder: WORK_ORDER }),
    [REGISTER.HOLDINGS]: holdingsRegisterRows({ dossier: HUSH_DOSSIER }),
    [REGISTER.NIGHTS]: nightRows(meta),
  };
  const everyRow = TABS.flatMap((tab) => registers[tab.id]);

  let tab = 0;
  let sel = 0;
  let scroll = 0;
  let bodyScroll = 0;

  const rows = () => registers[TABS[tab].id] || [];
  const current = () => rows()[sel] || null;
  const reset = () => { sel = 0; scroll = 0; bodyScroll = 0; };

  // Following a citation is the only verb in here beyond reading, and it may
  // cross registers: the sheet you carried out and the copy the company has been
  // holding for thirty years are in different drawers on purpose.
  function follow() {
    const row = current();
    const cited = resolveCitations(row, everyRow);
    if (!cited.length) return false;
    const target = cited[0];
    const nextTab = TABS.findIndex((t) => t.id === target.register);
    if (nextTab < 0) return false;
    tab = nextTab;
    sel = Math.max(0, registers[target.register].findIndex((r) => r.id === target.id));
    scroll = 0; bodyScroll = 0;
    AUDIO.menuMove();
    return true;
  }

  return {
    id: 'transfer-room', blocksInput: true, blocksWorld: true, lensPreset: 'calm',
    enter() { AUDIO.startMenuHiss(); },
    exit() { AUDIO.stopMenuHiss(); },
    key(e) {
      const k = String(e.key || '').toLowerCase();
      const list = rows();
      if (e.key === 'Escape' || k === 'b') { scenes.pop(); return true; }
      if (e.key === 'Tab') {
        tab = (tab + (e.shiftKey ? TABS.length - 1 : 1)) % TABS.length;
        reset(); AUDIO.menuMove(); return true;
      }
      if (k === '1' || k === '2' || k === '3') {
        tab = Number(k) - 1; reset(); AUDIO.menuMove(); return true;
      }
      if (list.length) {
        if (e.key === 'ArrowUp' || k === 'w') { sel = (sel - 1 + list.length) % list.length; bodyScroll = 0; AUDIO.menuMove(); return true; }
        if (e.key === 'ArrowDown' || k === 's') { sel = (sel + 1) % list.length; bodyScroll = 0; AUDIO.menuMove(); return true; }
        if (e.key === 'PageDown') { bodyScroll += 6; return true; }
        if (e.key === 'PageUp') { bodyScroll = Math.max(0, bodyScroll - 6); return true; }
        if (e.key === 'Enter') { follow(); return true; }
      }
      return true;
    },
    render() {
      const { cols, rows: screenRows } = uiSize();
      uiFill(0, 0, cols, screenRows, UI_COLOR.glass);
      const w = Math.min(96, cols - 4), h = Math.min(38, screenRows - 4);
      const x = Math.floor((cols - w) / 2), y = Math.floor((screenRows - h) / 2);
      const list = rows();
      const row = current();
      const cited = resolveCitations(row, everyRow);

      const body = drawMachinePanel(x, y, w, h, {
        label: 'TRANSFER ROOM',
        source: 'TR-4417',
        footer: cited.length
          ? '↑↓ ROW · TAB REGISTER · ENTER FOLLOW REFERENCE · ESC CLOSE'
          : '↑↓ ROW · TAB REGISTER · ESC CLOSE',
        meter: false,
      });
      drawVfdText(body.x, body.y, 'W. ELLERY / WORKS', { color: UI_COLOR.amber, max: body.w });

      // Registers along the top.
      let tx = body.x;
      TABS.forEach((entry, i) => {
        const on = i === tab;
        const label = `[${i + 1}] ${entry.label}`;
        uiText(tx, body.y + 2, label, on ? 'ui-amber' : 'ui-secondary');
        tx += label.length + 3;
      });

      // Half the panel. At 0.42 an ordinary reference ("E.C.M./B F-06") and a
      // filing date could not both fit, and the column cut them mid-word, which
      // reads as a broken display rather than as a narrow one.
      const listW = Math.max(34, Math.floor(body.w * 0.50));
      const divider = body.x + listW + 1;
      uiLine(divider, body.y + 4, divider, body.y + body.h - 1, UI_COLOR.frame, 0.65);

      // A marked column, the way a register does it. See the row comment below
      // for why this is not a colour.
      uiText(body.x, body.y + 4, 'REF            DATE', 'ui-label');
      uiText(body.x + listW - 3, body.y + 4, 'N', 'ui-label');
      const cap = Math.max(1, body.h - 8);
      if (sel < scroll) scroll = sel;
      if (sel >= scroll + cap) scroll = sel - cap + 1;

      if (!list.length) {
        // An empty file is a legitimate reading, not a failure. Say what would
        // put something in it, in the company's voice rather than the game's.
        const copy = tab === 0
          ? 'Nothing filed. The file holds what comes back in the bag; the building keeps the rest.'
          : 'No entries.';
        uiWrap(copy, listW - 1).slice(0, 4).forEach((line, i) => uiText(body.x, body.y + 6 + i, line, 'ui-secondary'));
      }

      list.slice(scroll, scroll + cap).forEach((entry, j) => {
        const i = scroll + j;
        const on = i === sel;
        const ref = clip(entry.ref, 14).padEnd(14);
        const dateW = Math.max(6, listW - 19);
        const line = `${on ? '▸' : ' '} ${ref} ${clip(entry.date, dateW)}`;
        uiText(body.x, body.y + 6 + j, line, on ? 'ui-amber' : 'ui-primary');
        // AN ANNOTATED ROW IS MARKED, NOT COLOURED. The notes are the reason to
        // be in here and they were invisible from the list, so a reader had to
        // open every row to find the few worth reading. Colour cannot say it:
        // this is a monochrome phosphor and palette.js maps 'ui-green' straight
        // onto it, so a green row and a plain one are the same pixels. A mark in
        // a column with a heading is also simply what a register does.
        if (entry.note) uiText(body.x + listW - 3, body.y + 6 + j, '*', on ? 'ui-amber' : 'ui-primary');
      });

      const dx = divider + 3, dw = Math.max(20, body.x + body.w - dx - 1);
      if (!row) return;

      let dy = body.y + 4;
      uiWrap(row.title, dw).slice(0, 2).forEach((line) => uiText(dx, dy++, line, 'ui-amber'));
      if (row.byline) uiText(dx, dy++, clip(row.byline, dw), 'ui-secondary');
      if (row.fullDate) uiText(dx, dy++, clip(row.fullDate, dw), 'ui-secondary');
      dy++;

      const facts = [row.issuer, row.reproduction, row.process].filter(Boolean).join('  ·  ');
      if (facts) uiText(dx, dy++, facts.slice(0, dw), 'ui-blue');
      if (row.status) uiWrap(row.status, dw).slice(0, 2).forEach((line) => uiText(dx, dy++, line, 'ui-secondary'));

      // The notes column, given the room it deserves. It is the reason anyone
      // opens this.
      if (row.note) {
        dy++;
        uiText(dx, dy++, 'NOTES', 'ui-label');
        uiWrap(row.note, dw).slice(0, 4).forEach((line) => uiText(dx, dy++, line, 'ui-green'));
      }

      dy++;
      const remaining = Math.max(1, body.y + body.h - dy - (cited.length ? 3 : 1));
      const wrapped = row.lines.flatMap((line) => (line ? uiWrap(line, dw) : ['']));
      const maxScroll = Math.max(0, wrapped.length - remaining);
      if (bodyScroll > maxScroll) bodyScroll = maxScroll;
      wrapped.slice(bodyScroll, bodyScroll + remaining)
        .forEach((line, i) => uiText(dx, dy + i, line, 'ui-primary'));
      if (maxScroll > 0) {
        uiText(dx + dw - 9, body.y + body.h - 1, `PGDN ${String(bodyScroll + 1).padStart(3)}`, 'ui-secondary');
      }

      if (cited.length) {
        const refs = cited.map((entry) => entry.ref).join('  ');
        uiText(dx, body.y + body.h - 2, `SEE ALSO  ${refs}`.slice(0, dw), 'ui-amber');
      }
    },
  };
}
