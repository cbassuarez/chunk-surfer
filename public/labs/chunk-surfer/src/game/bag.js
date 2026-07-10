// The bag.
//
// It is not a pause menu, and it is no longer a pile of paper. It is the job:
// five rooms in the order the client listed them, with whatever the previous
// recordist wrote about each one filed underneath it. A sheet that names no
// room goes in UNFILED, where it is exactly as useful as it was on the floor.
//
// TWO VERBS, and the game teaches the second one in the loading dock using the
// one room the work order insists on:
//
//   [enter]  read a note
//   [space]  mark a room — the waypoint, which is the only navigation you get
//
// Nothing here is greyed out and nothing is refused. All five rooms are
// markable from the first minute. The tutorial simply does not move on until
// he has marked studio B3, because the work order told him to do that one
// first, and because a man learns a verb by using it.

import * as scenes from './scenes.js';
import { uiBox, uiCenter, uiScrim, uiSize, uiText } from '../render/ui.js';

const W = 74;

export function makeBagScene({
  equipment = [],
  job = { rooms: [], unfiled: [], done: 0, total: 5 },
  hint = '',                       // what the night wants from him, right now
  readDocument = () => {},
  markRoom = () => false,
  onClose = () => {},
} = {}) {
  let sel = 0;
  let t = 0;

  // One flat list of rows, because that is what a cursor walks.
  function rows() {
    const out = [];
    out.push({ kind: 'head', label: 'GEAR' });
    for (const item of equipment) out.push({ kind: 'item', label: item });
    out.push({ kind: 'space' });
    out.push({ kind: 'head', label: 'OBJECTIVES', right: `takes ${job.done}/${job.total}` });

    for (const r of job.rooms) {
      out.push({ kind: 'room', room: r, label: r.label });
      for (const n of r.notes) out.push({ kind: 'note', doc: n, label: n.title || n.id });
    }

    if (job.unfiled.length) {
      out.push({ kind: 'space' });
      out.push({ kind: 'head', label: 'UNFILED' });
      for (const n of job.unfiled) out.push({ kind: 'note', doc: n, label: n.title || n.id });
    }
    return out;
  }

  const selectable = () => rows()
    .map((r, i) => (r.kind === 'room' || r.kind === 'note' ? i : -1))
    .filter((i) => i >= 0);

  function clampSel() {
    const picks = selectable();
    if (!picks.length) { sel = 0; return; }
    if (!picks.includes(sel)) sel = picks[0];
  }

  function move(d) {
    const picks = selectable();
    if (!picks.length) return;
    const at = Math.max(0, picks.indexOf(sel));
    sel = picks[(at + d + picks.length) % picks.length];
  }

  const selected = () => rows()[sel] || null;

  return {
    id: 'bag',
    blocksInput: true,
    blocksWorld: false,      // the building does not wait while you do paperwork
    lensPreset: 'calm',

    enter() { clampSel(); },
    update(dt) { t += dt; },

    key(e) {
      if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
        scenes.pop();
        onClose();
        return true;
      }
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { move(-1); return true; }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { move(1); return true; }
      if (e.key === 'Enter' || e.key === 'e' || e.key === 'E') {
        const r = selected();
        if (r?.kind === 'note') readDocument(r.doc);
        return true;
      }
      if (e.key === ' ' || e.key === 'z' || e.key === 'Z') {
        const r = selected();
        // Marking from a note marks the room the note is about. The note is the
        // reason you know the room is there at all.
        if (r?.kind === 'room') markRoom(r.room.roomId);
        else if (r?.kind === 'note' && r.doc.room) markRoom(r.doc.room);
        return true;
      }
      return true;
    },

    render() {
      const { cols, rows: screenRows } = uiSize();
      const list = rows();
      const w = Math.min(W, cols - 4);
      const h = Math.min(screenRows - 4, list.length + 7);
      const x = Math.floor((cols - w) / 2);
      const y = Math.floor((screenRows - h) / 2);
      const view = h - 6;
      const scroll = Math.max(0, Math.min(Math.max(0, list.length - view), sel - Math.floor(view / 2)));

      uiScrim(0.72);
      uiBox(x, y, w, h);
      uiCenter(y + 1, 'BAG', 't-landmark');

      let yy = y + 3;
      for (let i = scroll; i < Math.min(list.length, scroll + view); i++) {
        const r = list[i];
        if (r.kind === 'space') { yy++; continue; }
        if (r.kind === 'head') {
          uiText(x + 3, yy, r.label, 't-gate-frame', 0.75);
          if (r.right) uiText(x + w - 3 - r.right.length, yy, r.right, 't-trail-3', 0.55);
          yy++;
          continue;
        }
        if (r.kind === 'item') { uiText(x + 5, yy++, r.label, 't-trail-3', 0.7); continue; }

        const on = i === sel;
        const cursor = on ? '▸' : ' ';

        if (r.kind === 'room') {
          const st = r.room.recorded ? '✓ done' : r.room.marked ? 'marked' : '';
          const cls = r.room.recorded ? 't-key' : (on ? 't-chunk-on' : 't-trail-1');
          uiText(x + 3, yy, `${cursor} ${r.label}`, cls, r.room.recorded ? 0.8 : on ? 1 : 0.78);
          if (st) uiText(x + w - 3 - st.length, yy, st, r.room.recorded ? 't-key' : 't-trail-2', 0.7);
          yy++;
          continue;
        }
        // a note, indented under the room it is about
        uiText(x + 6, yy++, `${cursor} ${r.label}`.slice(0, w - 9),
               on ? 't-chunk-on' : 't-trail-2', on ? 1 : 0.6);
      }

      const r = selected();
      const keys = r?.kind === 'room'
        ? '[space] mark · [b] close'
        : r?.kind === 'note'
          ? (r.doc.room ? '[enter] read · [space] mark · [b] close' : '[enter] read · [b] close')
          : '[b] close';

      // The night wants something. It blinks, because a man who has not marked
      // a room in thirty years does not need to be told twice.
      if (hint) {
        const pulse = 0.55 + 0.45 * Math.abs(Math.sin(t * 2.2));
        uiCenter(y + h - 3, hint, 't-key', pulse);
      }
      uiCenter(y + h - 2, keys, 't-trail-4', 0.62);
    },
  };
}
