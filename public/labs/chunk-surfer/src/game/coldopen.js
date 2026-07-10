// The cold open: a service booth, a bored man, a form, and a door.
//
// This file is a presenter. The conversation itself lives in conversation.js;
// here we put it on a black screen, in a column, with a slate across the top
// and everything already said receding behind it.
//
// There is no [esc]. This is the only conversation in the game and you are
// going to have it. (`?skiptut=1` exists for people who have to walk this
// building forty times today.)

import * as scenes from './scenes.js';
import { uiSize, uiFill, uiText, uiWrap, uiCenter } from '../render/ui.js';
import { createConversation, textOf } from './conversation.js';

const COL_W = 66;
const KEEP = 9;

export const STYLE = {
  // No nameplate on your own line. You know who is talking.
  me: { cls: 't-chunk-on', alpha: 0.98, label: '' },
  you: { cls: 't-trail-1', alpha: 0.94, label: '' },
  guard: { cls: 't-key', alpha: 0.96, label: 'GUARD' },
  recordist: { cls: 't-trail-1', alpha: 0.90, label: 'TAKE' },
  surfer: { cls: 't-hush-core', alpha: 0.96, label: '' },
  radio: { cls: 't-key', alpha: 1, label: 'RADIO' },
  direction: { cls: 't-trail-2', alpha: 0.70, label: '' },
};

// `ambient: false` is the scene that runs AFTER the title — the door, the dark
// and the bag. The song has already gone and the booth is a hundred metres away
// behind a fire door, so it starts nothing and it stops nothing.
export function makeColdOpenScene({
  id = 'cold-open',
  beats = [], opening = null, slate = '', ambient = true, lensPreset = 'booth',
  onDone, onChoice, cue, fx, audio, getAudio,
} = {}) {
  const convo = createConversation({
    nodes: opening, beats, onChoice, cue, fx, audio, getAudio,
    onDone: () => { scenes.pop(); if (ambient) audio?.stopBoothTone?.({ fade: 0.8 }); onDone?.(); },
  });

  return {
    id,
    blocksInput: true,
    blocksWorld: true,
    lensPreset,

    enter() {
      if (ambient) { audio?.startSoundtrack?.(); audio?.startBoothTone?.(); }
      convo.start();
    },
    exit() { convo.stop(); audio?.stopTyping?.(); },
    update(dt) { convo.update(dt); },
    view() { return convo.view(); },        // for the headless suites
    key(e) {
      if (e.key === 'Escape') return true;   // no way out of a conversation
      return convo.key(e);
    },

    render() {
      const v = convo.view();
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, 'rgba(3,3,4,1)');

      const w = Math.min(COL_W, cols - 10);
      const x = Math.floor((cols - w) / 2);
      const cs = v.pending?.options || [];

      const rendered = [];
      for (const h of v.history.slice(-KEEP)) {
        for (const l of uiWrap(h.text, w)) rendered.push({ text: l, who: h.who });
      }
      const cur = v.typed > 0 && v.line
        ? uiWrap(textOf(v.line).slice(0, v.typed), w).map((t) => ({ text: t, who: v.who }))
        : [];

      const choiceRows = cs.length ? cs.length + 2 : 0;
      const total = rendered.length + cur.length + choiceRows + (v.speaker ? 2 : 0);
      const top = Math.max(3, Math.floor((rows - total) / 2));

      // The slate: the header of the form he is about to sign, and the only
      // thing on screen that never moves.
      if (slate) uiText(x, Math.max(1, top - 3), slate, 't-gate-frame', 0.34);

      let y = top;
      if (v.speaker) { uiText(x, y++, v.speaker, 't-gate-frame', 0.66); y++; }

      let lastWho = null;
      rendered.forEach((r, k) => {
        const age = (rendered.length - k) / Math.max(1, rendered.length);
        const st = STYLE[r.who] || STYLE.direction;
        if (st.label && r.who !== lastWho) uiText(x, y++, st.label, 't-trail-4', 0.18);
        lastWho = r.who;
        uiText(x, y++, r.text, st.cls, 0.12 + 0.26 * (1 - age));
      });

      const stCur = STYLE[v.who] || STYLE.direction;
      if (cur.length && stCur.label && v.who !== lastWho) uiText(x, y++, stCur.label, 't-trail-4', 0.5);
      cur.forEach((r, k) => {
        uiText(x, y, r.text, stCur.cls, stCur.alpha);
        if (k === cur.length - 1 && v.typing) uiText(x + r.text.length, y, '▌', stCur.cls, 0.55);
        y++;
      });

      // A voice is a level meter. This game has one iconography and it is the
      // one on the front of a recorder.
      if (v.voice != null) {
        const bars = 10;
        const on = Math.max(1, Math.round((0.35 + 0.65 * Math.abs(Math.sin(v.voice * 26))) * bars));
        let m = '';
        for (let k = 0; k < bars; k++) m += k < on ? '▮' : '▯';
        uiText(x + w - bars, Math.max(1, top - 3), m, 't-trail-3', 0.35);
      }

      if (cs.length) {
        y += 1;
        cs.forEach((c, idx) => {
          const on = idx === v.pending.index;
          const spent = v.spent(c);
          const cls = spent ? 't-trail-4' : (on ? 't-chunk-on' : 't-trail-2');
          const a = spent ? 0.34 : (on ? 1 : 0.66);
          uiText(x, y++, `${on ? '▸' : ' '} ${idx + 1}  ${c.text}${spent ? '   ·' : ''}`, cls, a);
        });
      }

      uiCenter(rows - 2, cs.length ? '↑ ↓ · enter' : '[space]', 't-trail-4', 0.24);
    },
  };
}

// Long enough that the song gets a verse and the reader gets to sit in it. The
// fade takes the whole back half, so the door lands in a mix that has emptied.
export function makeWorldTitleScene({ onDone, audio, duration = 12.0 } = {}) {
  let t = 0;
  let done = false;

  function finish() {
    if (done) return;
    done = true;
    scenes.pop();
    onDone?.();
  }

  return {
    id: 'world-title',
    blocksInput: true,
    blocksWorld: false,
    lensPreset: 'calm',

    // The song leaves before the title does, so the door slams into an empty mix.
    enter() { audio?.fadeSoundtrack?.({ fade: Math.max(2, duration - 2.4) }); },
    update(dt) { t += dt; if (t >= duration) finish(); },
    key(e) {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'z' || e.key === 'Escape') { finish(); return true; }
      return true;
    },
    exit() { audio?.stopTyping?.(); },

    // Nothing but type, on black. No band, no box, no ornament — the song does
    // the work, and the lens is asleep behind this, so the black is real black.
    // Each line fades up on its own beat and they all leave together.
    render() {
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, 'rgba(0,0,0,1)');

      const out = Math.min(1, Math.max(0, (duration - t) / 2.4));
      const up = (at, over = 1.8) => Math.min(1, Math.max(0, (t - at) / over)) * out;

      const cy = Math.max(4, Math.floor(rows * 0.40));
      uiCenter(cy, 'C H U N K   S U R F E R', 't-player', up(0.5, 2.4));
      uiCenter(cy + 3, 'ellery conservatory of music', 't-trail-1', up(2.4) * 0.72);
      uiCenter(cy + 5, 'five rooms. one clean minute each.', 't-trail-3', up(3.6) * 0.50);
    },
  };
}
