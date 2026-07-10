// The bag.
//
// It is not a pause menu. It is the one physical inventory surface: light,
// recorder, radio, keys, work order, and every sheet picked up off the floor.
// Notes are useful because they remember where the building used to connect;
// the waypoint they set is a room, not a route.

import * as scenes from './scenes.js';
import { uiBox, uiCenter, uiScrim, uiSize, uiText } from '../render/ui.js';

const W = 72;

export function makeBagScene({
  equipment = [],
  documents = [],
  waypoint = null,
  readDocument = () => {},
  setWaypoint = () => false,
  onClose = () => {},
} = {}) {
  let sel = 0;
  let currentWaypoint = waypoint;

  function rows() {
    const out = [];
    out.push({ kind: 'head', label: 'GEAR' });
    for (const item of equipment) out.push({ kind: 'item', label: item });
    out.push({ kind: 'space' });
    out.push({ kind: 'head', label: 'PAPER' });
    if (documents.length) {
      for (const doc of documents) {
        const active = currentWaypoint?.roomId && doc.room && currentWaypoint.roomId === doc.room;
        out.push({ kind: 'doc', doc, label: `${doc.title}${doc.where ? ` — ${doc.where}` : ''}${active ? '  *' : ''}` });
      }
    } else {
      out.push({ kind: 'empty', label: 'no loose notes yet' });
    }
    return out;
  }

  function selectable() {
    return rows().map((r, i) => r.kind === 'doc' ? i : -1).filter((i) => i >= 0);
  }

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

  function selectedDoc() {
    const r = rows()[sel];
    return r?.kind === 'doc' ? r.doc : null;
  }

  function openSelected() {
    const doc = selectedDoc();
    if (!doc) return false;
    readDocument(doc.doc);
    return true;
  }

  function waypointSelected() {
    const doc = selectedDoc();
    if (!doc) return false;
    const ok = setWaypoint(doc);
    if (ok && doc.room) currentWaypoint = { roomId: doc.room };
    return ok;
  }

  return {
    id: 'bag',
    blocksInput: true,
    blocksWorld: false,
    lensPreset: 'calm',

    enter() { clampSel(); },

    key(e) {
      if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
        scenes.pop();
        onClose();
        return true;
      }
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { move(-1); return true; }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { move(1); return true; }
      if (e.key === 'Enter' || e.key === 'e' || e.key === 'E') { openSelected(); return true; }
      if (e.key === ' ' || e.key === 'z' || e.key === 'Z') { waypointSelected(); return true; }
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
        if (r.kind === 'head') { uiText(x + 3, yy++, r.label, 't-gate-frame', 0.75); continue; }
        const on = i === sel;
        const mark = on ? '▸' : ' ';
        const cls = r.kind === 'doc' ? (on ? 't-chunk-on' : 't-trail-1') : 't-trail-3';
        const alpha = r.kind === 'empty' ? 0.45 : on ? 1 : 0.72;
        uiText(x + 3, yy++, `${mark} ${r.label}`.slice(0, w - 6), cls, alpha);
      }

      const doc = selectedDoc();
      const hint = doc
        ? doc.room ? '[enter] read · [space] waypoint · [b] close' : '[enter] read · [b] close'
        : '[b] close';
      uiCenter(y + h - 2, hint, 't-trail-4', 0.62);
    },
  };
}
