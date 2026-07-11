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
import { uiSize, uiFill, uiText, uiWrap } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { createConversation, textOf } from './conversation.js';

const COL_W = 66;
const KEEP = 9;

export const STYLE = {
  // No nameplate on your own line. You know who is talking.
  me: { cls: 'ui-primary', alpha: 1, label: '' },
  you: { cls: 'ui-primary', alpha: 1, label: '' },
  guard: { cls: 'ui-amber', alpha: 1, label: 'GUARD' },
  recordist: { cls: 'ui-primary', alpha: 1, label: 'TAKE' },
  surfer: { cls: 'ui-danger', alpha: 1, label: '' },
  radio: { cls: 'ui-amber', alpha: 1, label: 'RADIO' },
  direction: { cls: 'ui-secondary', alpha: 1, label: '' },
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
      uiFill(0, 0, cols, rows, UI_COLOR.glass);

      const w = Math.min(COL_W + 6, cols - 4);
      const x = Math.floor((cols - w) / 2);
      const cs = v.pending?.options || [];

      const textW = Math.max(12, w - 4);
      const rendered = [];
      for (const h of v.history.slice(-KEEP)) {
        for (const l of uiWrap(h.text, textW)) rendered.push({ text: l, who: h.who });
      }
      const cur = v.typed > 0 && v.line
        ? uiWrap(textOf(v.line).slice(0, v.typed), textW).map((t) => ({ text: t, who: v.who }))
        : [];

      const historyRows = [];
      let historyWho = null;
      rendered.forEach((r, k) => {
        const st = STYLE[r.who] || STYLE.direction;
        const prefix=st.label && r.who!==historyWho ? `${st.label}  ` : '';
        historyWho = r.who;
        const age = (rendered.length - k) / Math.max(1, rendered.length);
        historyRows.push({ text:`${prefix}${r.text}`, cls:'ui-secondary', alpha:Math.max(0.50, 0.74-age*0.20), who:r.who });
      });

      const choiceRows = cs.length ? cs.length + 2 : 0;
      const fixedRows = (slate ? 2 : 0) + (v.speaker ? 2 : 0) + cur.length + choiceRows;
      const total = historyRows.length + fixedRows;
      const panelH = Math.min(rows - 4, Math.max(15, total + 7));
      const top = Math.max(2, Math.floor((rows - panelH) / 2));
      const body = drawMachinePanel(x, top, w, panelH, {
        label: 'MONITOR', source: v.who || 'PROGRAM',
        footer: cs.length ? '[↑/↓] SELECT · [ENTER] CONFIRM' : '[SPACE] CONTINUE', meter: true,
      });
      const tx = body.x, tw = body.w;
      const visibleHistory = historyRows.slice(-Math.max(0, body.h - fixedRows));

      // The slate: the header of the form he is about to sign, and the only
      // thing on screen that never moves.
      if (slate) uiText(tx, body.y, slate.slice(0, tw), 'ui-label');

      let y = body.y + (slate ? 2 : 0);
      if (v.speaker) { drawVfdText(tx, y++, v.speaker, {scale:1.22,max:tw}); y++; }

      visibleHistory.forEach((r) => { uiText(tx, y++, r.text.slice(0, tw), r.cls, r.alpha); });

      const stCur = STYLE[v.who] || STYLE.direction;
      cur.forEach((r, k) => {
        uiText(tx, y, r.text.slice(0, tw), stCur.cls, stCur.alpha);
        if (k === cur.length - 1 && v.typing) uiText(tx + r.text.length, y, '▌', 'ui-amber');
        y++;
      });

      if (cs.length) {
        y += 1;
        cs.forEach((c, idx) => {
          const on = idx === v.pending.index;
          const spent = v.spent(c);
          const cls = spent ? 'ui-secondary' : (on ? 'ui-amber' : 'ui-primary');
          const a = spent ? 0.58 : 1;
          uiText(tx, y++, `${on ? '▸' : ' '} ${idx + 1}  ${c.text}${spent ? '   ·' : ''}`.slice(0, tw), cls, a);
        });
      }
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
      uiFill(0, 0, cols, rows, UI_COLOR.glass);

      const out = Math.min(1, Math.max(0, (duration - t) / 2.4));
      const up = (at, over = 1.8) => Math.min(1, Math.max(0, (t - at) / over)) * out;

      const w = Math.min(72, cols - 4), h = Math.min(17, rows - 4);
      const x = Math.floor((cols - w) / 2), y = Math.floor((rows - h) / 2);
      const body = drawMachinePanel(x, y, w, h, { label:'PROGRAM', source:'ELLERY', meter:true });
      drawVfdText(Math.max(body.x, Math.floor((cols - 12) / 2)), body.y + 2, 'CHUNK SURFER', { color:UI_COLOR.primary });
      uiText(Math.max(body.x, Math.floor((cols - 29) / 2)), body.y + 5, 'ELLERY CONSERVATORY OF MUSIC', 'ui-blue', up(2.4));
      uiText(Math.max(body.x, Math.floor((cols - 31) / 2)), body.y + 7, '5 ROOMS / 1 CLEAN MINUTE EACH', 'ui-secondary', up(3.6));
    },
  };
}
