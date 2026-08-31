// Making text fit the box it is drawn in.
//
// `uiText` has no width and no bounds check — it draws a glyph per cell and
// keeps going, past the panel bezel and past the edge of the canvas. So every
// caller has to cut its own strings, and for a long time every caller did:
// there were TEN near-duplicate `fit`/`clip` helpers across the renderer and
// the scenes, in two flavours, plus about thirty-five bare `.slice(0, w)` calls
// in the combat chrome.
//
// The two flavours mattered. `…` tells the player a name was shortened;
// `.slice()` does not, so `MASTER TAKE` became `MASTER TA` and read as a
// different move. **Amputation without a mark is the bug**; this module always
// marks it.
//
// None of this replaces having enough room. Where a label genuinely cannot fit
// its column the answer is a wider column, and `fitReport` exists so a test can
// say which ones those are rather than waiting for someone to notice on screen.

const ELLIPSIS = '…';

const width = (value) => Math.max(0, Math.floor(Number(value) || 0));

// One line, cut to `max` cells, with a mark where it was cut. `max` of null or
// 0 means "no limit" — the common case of a caller that has not been given a
// budget yet, and which should behave exactly as it did before.
export function fitText(text, max = null) {
  const value = String(text ?? '');
  if (max == null) return value;
  const w = width(max);
  if (w <= 0) return '';
  if (value.length <= w) return value;
  if (w === 1) return ELLIPSIS;
  return `${value.slice(0, w - 1)}${ELLIPSIS}`;
}

// Wrap, then mark only the last line if the text ran past `maxLines`.
//
// The shape is lifted from `wrappedChoice` in render/transcript.js, which had
// it right: an ellipsis belongs at the end of the last line you kept, not at
// the end of every line. Unlike `uiWrap`, a single word longer than the width
// is broken rather than emitted over-wide.
export function fitLines(text, max, maxLines = Infinity) {
  const w = Math.max(1, width(max));
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  const push = () => { if (line) { lines.push(line); line = ''; } };
  for (const word of words) {
    if (word.length > w) {
      push();
      for (let i = 0; i < word.length; i += w) lines.push(word.slice(i, i + w));
      line = lines.length && lines[lines.length - 1].length < w ? lines.pop() : '';
      continue;
    }
    const next = line ? `${line} ${word}` : word;
    if (next.length > w) { push(); line = word; } else line = next;
  }
  push();
  if (!Number.isFinite(maxLines) || lines.length <= maxLines) return lines;
  const kept = lines.slice(0, Math.max(1, maxLines));
  const last = kept[kept.length - 1];
  kept[kept.length - 1] = last.length >= w ? `${last.slice(0, Math.max(1, w - 1))}${ELLIPSIS}` : `${last}${ELLIPSIS}`;
  return kept;
}

// Did it fit? For tests and for the audit of authored labels against the
// budgets the layouts actually hand out.
export function fits(text, max) {
  return String(text ?? '').length <= width(max);
}

// Everything that did not fit, named. `entries` is [{ label, text, max }].
export function fitReport(entries = []) {
  return entries
    .filter((entry) => !fits(entry.text, entry.max))
    .map((entry) => ({
      ...entry,
      length: String(entry.text ?? '').length,
      over: String(entry.text ?? '').length - width(entry.max),
    }));
}
