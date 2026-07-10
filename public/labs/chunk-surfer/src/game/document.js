// The reader. A page held up in the dark.
//
// Everything the client says and everything the previous recordist wrote
// arrives through this scene. It is deliberately the plainest thing in the
// game: a sheet of paper, a monospace face, and a scrollbar. No portrait, no
// typewriter, no voice. The genre wants an interiority to narrate the horror;
// a document has none. It just says what it says and stops.
//
// Two rules make it dangerous rather than restful:
//
//   · It does NOT block the world. The presence keeps walking while you read.
//     The page is a place you go, and going there costs time in a building
//     that spends it.
//   · Late pages DEGRADE. `decay` erodes the glyphs, not the meaning — the
//     words never become a different sentence, they become fewer sentences.
//     He does not stop making sense. He stops being legible.
//
// The lens drops to `calm` so the paper does not crawl while it is read.

import * as scenes from './scenes.js';
import { uiScrim, uiFill, uiText, uiWrap, uiSize, uiCenter } from '../render/ui.js';
import { interpolate } from './terror.js';

const PAGE_W = 66;             // cells of body text. A sheet of A4 in monospace.
const MARGIN_Y = 3;

let onClose = () => {};
let onTurn = () => {};         // a page turning is a noise event

export function documentInit({ close, turn } = {}) {
  if (close) onClose = close;
  if (turn) onTurn = turn;
}

// The erosion. Decay eats characters, never rewrites them: a hole in a page is
// a hole, and the reader's eye fills it in wrong. That is the whole effect.
//
// Rate rises with the square of decay so the first pages are merely typed on a
// bad ribbon and the last are barely there.
const ROT = '·.,\'`~-';
function erode(line, decay, seed) {
  if (decay <= 0) return line;
  let out = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === ' ') { out += ' '; continue; }
    // A stable hash, so a page does not shimmer while you read it. The same
    // holes are in the same places every time you look, as holes are.
    const h = ((seed * 374761393 + i * 668265263) ^ (line.length * 2246822519)) >>> 0;
    const r = (h % 10000) / 10000;
    if (r < decay * decay) out += ' ';
    else if (r < decay * decay + decay * 0.10) out += ROT[h % ROT.length];
    else out += ch;
  }
  return out;
}

// A doc is { id, title, byline?, decay?, body:[...] }
// A body entry is a string (a paragraph), '' (a blank line), or
// { rule:true } / { raw:'...' } for a typed line that must not be wrapped —
// a signature block, a timestamp, a route scrawled down the margin.
function layout(doc, width) {
  const lines = [];
  for (const entry of doc.body) {
    if (entry === '') { lines.push({ text: '', cls: 't-dim' }); continue; }
    if (typeof entry === 'string') {
      for (const l of uiWrap(interpolate(entry), width)) lines.push({ text: l, cls: 't-chunk' });
      continue;
    }
    if (entry.rule) { lines.push({ text: '─'.repeat(width), cls: 't-dim' }); continue; }
    if (entry.raw != null) { lines.push({ text: interpolate(entry.raw), cls: entry.cls || 't-dim' }); continue; }
  }
  return lines;
}

export function readDocument(doc) {
  if (!doc) return null;
  return scenes.push(makeDocumentScene(doc));
}

function makeDocumentScene(doc) {
  const decay = Math.max(0, Math.min(1, doc.decay || 0));
  let scroll = 0;
  let lines = [];
  let width = PAGE_W;

  return {
    id: `doc:${doc.id}`,
    blocksInput: true,
    blocksWorld: false,        // the building does not wait while you read
    lensPreset: 'calm',

    enter() {
      const { cols } = uiSize();
      width = Math.min(PAGE_W, cols - 8);
      lines = layout(doc, width);
    },

    render() {
      const { cols, rows } = uiSize();
      uiScrim(0.88);
      const x0 = Math.floor((cols - width) / 2);
      const view = rows - MARGIN_Y * 2 - 4;

      uiFill(x0 - 2, MARGIN_Y - 1, width + 4, Math.min(lines.length - scroll, view) + 6, 'rgba(10,10,12,0.96)');

      let y = MARGIN_Y;
      uiText(x0, y++, erode(doc.title.toUpperCase(), decay * 0.5, 1), 't-gate-frame');
      if (doc.byline) uiText(x0, y, erode(doc.byline, decay * 0.7, 2), 't-dim');
      y += 2;

      const end = Math.min(lines.length, scroll + view);
      for (let i = scroll; i < end; i++) {
        const l = lines[i];
        uiText(x0, y++, erode(l.text, decay, i + 3), l.cls);
      }

      y += 1;
      if (end < lines.length) uiText(x0, y, '↓ more', 't-dim');
      else uiCenter(Math.min(rows - 2, y + 1), doc.dismiss || '[ esc ]', 't-dim');
    },

    key(e) {
      const k = e.key;
      const { rows } = uiSize();
      const view = rows - MARGIN_Y * 2 - 4;
      if (k === 'ArrowDown' || k === 'j' || k === ' ') {
        if (scroll + view < lines.length) { scroll++; onTurn(); }
        return true;
      }
      if (k === 'ArrowUp' || k === 'k') { scroll = Math.max(0, scroll - 1); return true; }
      if (k === 'PageDown') { scroll = Math.min(Math.max(0, lines.length - view), scroll + view); onTurn(); return true; }
      if (k === 'PageUp') { scroll = Math.max(0, scroll - view); return true; }
      if (k === 'Escape' || k === 'Enter' || k === 'e') {
        scenes.pop();
        onClose(doc);
        return true;
      }
      return true;   // modal: the building may move, but you may not
    },
  };
}
