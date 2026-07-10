// Thinking, over a corridor that has not stopped.
//
// The same conversation machine as the cold open, drawn over the live world:
//
//   blocksInput: true    you cannot walk while you are deciding what to think
//   blocksWorld: FALSE   the presence keeps hunting. Noise keeps decaying. The
//                        building keeps rearranging behind you.
//
// This is the point. Thinking costs time, in a building that spends it. If it
// reaches you in the middle of a thought, then that is the scene, and it is
// the scene precisely because you were given three ways to reassure yourself
// and you took one.
//
// Four of these exist (see data/conservatory-script.js):
//
//   POST_DOOR   the push bar is not where the push bar is
//   FIRST_TAKE  the only place the game says the rule out loud
//   HUSH        the first time it gets close
//   RADIO_DEAD  the guard told you twice not to shake it

import * as scenes from './scenes.js';
import { uiSize, uiFill, uiText, uiWrap, uiScrim } from '../render/ui.js';
import { createConversation, textOf } from './conversation.js';
import { STYLE } from './coldopen.js';

const BAND_W = 74;

// A thought tree is a scene like any other. `onDone` fires once, when he stops
// thinking and the building is his problem again.
export function makeThoughtScene({
  id = 'thought', nodes, startAt = 'start', onDone, onChoice, cue, fx, audio, getAudio,
  scrim = 0.62, lensPreset = 'calm',
} = {}) {
  const convo = createConversation({
    nodes, startAt, onChoice, cue, fx, audio, getAudio,
    volume: 0.24,
    onDone: () => { scenes.pop(); onDone?.(); },
  });

  return {
    id: `thought:${id}`,
    blocksInput: true,
    blocksWorld: false,          // the corridor is still there. it is still walking.
    lensPreset,

    enter() { convo.start(); },
    exit() { convo.stop(); audio?.stopTyping?.(); },
    update(dt) { convo.update(dt); },
    view() { return convo.view(); },        // for the headless suites
    key(e) {
      if (e.key === 'Escape') return true;   // you do not get to stop thinking
      return convo.key(e);
    },

    render() {
      const v = convo.view();
      const { cols, rows } = uiSize();
      uiScrim(scrim);

      const w = Math.min(BAND_W, cols - 8);
      const x = Math.floor((cols - w) / 2);
      const cs = v.pending?.options || [];

      // Only the last couple of lines: this is a thought, not a transcript,
      // and there is a corridor behind it that the player needs to see.
      const rendered = [];
      for (const h of v.history.slice(-2)) {
        for (const l of uiWrap(h.text, w - 2)) rendered.push({ text: l, who: h.who });
      }
      const cur = v.typed > 0 && v.line
        ? uiWrap(textOf(v.line).slice(0, v.typed), w - 2).map((t) => ({ text: t, who: v.who }))
        : [];

      const body = rendered.length + cur.length;
      const choiceRows = cs.length ? cs.length + 1 : 0;
      const h = body + choiceRows;
      const y0 = rows - 4 - h;

      uiFill(x - 2, y0 - 1, w + 4, h + 2, 'rgba(6,7,9,0.88)');

      let y = y0;
      rendered.forEach((r) => {
        const st = STYLE[r.who] || STYLE.direction;
        uiText(x, y++, r.text, st.cls, 0.30);
      });
      const stCur = STYLE[v.who] || STYLE.direction;
      cur.forEach((r, k) => {
        uiText(x, y, r.text, stCur.cls, stCur.alpha);
        if (k === cur.length - 1 && v.typing) uiText(x + r.text.length, y, '▌', stCur.cls, 0.55);
        y++;
      });

      if (cs.length) {
        y += 1;
        cs.forEach((c, idx) => {
          const on = idx === v.pending.index;
          uiText(x, y++, `${on ? '▸' : ' '} ${idx + 1}  ${c.text}`,
                 on ? 't-chunk-on' : 't-trail-2', on ? 1 : 0.62);
        });
      } else {
        uiText(x + w - 8, rows - 2, '[space]', 't-trail-4', 0.22);
      }
    },
  };
}

// ── which thoughts have already been had ────────────────────────────────────
// A thought tree fires once per run. `terror.js`'s `once()` is keyed on story
// flags and survives a reload, which is right for a scripted beat and wrong
// for a beat that should re-arm after death. Nothing here re-arms.
const had = new Set();
export function thoughtHad(id) { return had.has(id); }
export function markThought(id) { had.add(id); }
export function resetThoughts() { had.clear(); }
export function loadThoughtState(saved = {}) {
  had.clear();
  for (const id of saved.had || []) had.add(id);
}
export function saveThoughtState() { return { had: [...had] }; }
