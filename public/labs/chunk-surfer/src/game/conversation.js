// The conversation machine.
//
// Nodes, lines, choices, and a mouth. It owns no pixels: a presenter asks it
// what to draw and draws it. `coldopen.js` puts it on a black screen;
// `thoughts.js` puts it over a corridor that is still moving.
//
// THREE RULES, which are the whole feel of the thing:
//
//   1. NOTHING ADVANCES BY ITSELF. A line finishes speaking and then waits.
//      An earlier version rode the voice and moved on after a beat, and it
//      read as a cutscene playing at you. `hold` survives only as a minimum
//      dwell, so a mashed [space] cannot eat three lines at once.
//
//   2. YOU CHOOSE TO SPEAK. Every `who: 'me'` line — the recordist out loud —
//      is offered as a picker first, even when there is exactly one thing to
//      say. A one-option tree is still a decision: it is the moment you open
//      your mouth. `guard.last` has a `me` line of '...', and offering it as
//      `▸ (say nothing)` is the best beat in the scene.
//
//   3. A HUB SAYS ITS PIECE ONCE. Come back to it and the questions are simply
//      there again, minus the ones you have spent.
//
// Node shape:
//   { speaker, lines:[line], choices:[choice], goto, tape }
// Line shape:
//   { who, text, prompt?, cue?, hold?, rate?, shake?, flash?, say?:false }
// Choice shape:
//   { text, goto?, set?, clear?, exit? }

import { createSamDialogVoice, isVoiced } from '../audio/sam-voice.js';
import { TYPE_GAIN, TYPE_LEVEL } from '../audio/story-audio.js';

const CPS = 38;
const MIN_DWELL = 0.25;         // before [space] is heard at all

export const textOf = (l) => String(l?.text ?? l ?? '');
export const whoOf = (l) => l?.who || 'direction';

// What a picker calls a line he is about to say. Long lines want a `prompt`.
function sayLabel(l) {
  if (l.prompt) return l.prompt;
  const t = textOf(l).trim();
  if (t === '...' || t === '…') return '(say nothing)';
  return `"${t}"`;
}

export function createConversation({
  nodes = null, beats = [], startAt = 'start',
  onChoice, onLine, onDone, cue, fx, audio, getAudio, volume = 0.26,
} = {}) {
  const voice = createSamDialogVoice({ volume, getAudio });
  voice.warm?.();

  let mode = nodes ? 'nodes' : 'beats';
  let nodeId = startAt;
  let lineIdx = 0;
  let beatIdx = 0;
  let typed = 0;
  let acc = 0, held = 0;
  let handle = null;            // the voice, mid-sentence
  let pending = null;           // { kind:'branch'|'say', options, line }
  let choiceIdx = 0;
  let finished = false;
  const history = [];
  const asked = new Set();
  const visited = new Set();

  const node = () => (nodes && nodes[nodeId]) || null;
  const nodeLines = () => node()?.lines || [];
  const line = () => (mode === 'nodes' ? nodeLines()[lineIdx] : beats[beatIdx]);

  const choiceKey = (c) => `${nodeId}:${c.text}`;
  const branchOptions = () => node()?.choices || [];

  function stopVoice() { handle?.stop?.(); handle = null; }
  function resetLine() { typed = 0; acc = 0; held = 0; stopVoice(); }

  function pushHistory(text, who) {
    if (!text) return;
    history.push({ text, who });
    while (history.length > 24) history.shift();
  }

  function fire(l) {
    if (!l) return;
    if (l.cue) cue?.(l.cue, l);
    if (l.shake) fx?.shake?.(l.shake, l.shakeMs || 420);
    if (l.flash) fx?.flash?.(l.flashMs || 160, 'rgba(4,4,6,1)');
  }

  // A line either gets a mouth or a typewriter. Never both.
  function utter(l) {
    fire(l);
    onLine?.(l);
    const who = whoOf(l);
    const text = textOf(l);
    if (text) audio?.duckSoundtrack?.();
    if (text && isVoiced(who) && l.voice !== false) {
      handle = voice.start(text, { speaker: who, rate: l.rate || 1 });
      audio?.stopTyping?.();
    } else if (text) {
      audio?.startTyping?.({ gain: TYPE_GAIN * (TYPE_LEVEL[who === 'direction' ? 'direction' : 'thought'] || 1) });
    }
  }

  // Before he speaks, you decide that he speaks.
  function beginLine() {
    const l = line();
    if (!l) return;
    resetLine();
    if (mode === 'nodes' && whoOf(l) === 'me' && l.say !== false) {
      pending = { kind: 'say', line: l, options: [{ text: sayLabel(l), say: true }] };
      choiceIdx = 0;
      audio?.unduckSoundtrack?.();
      return;
    }
    pending = null;
    utter(l);
  }

  function finish() {
    if (finished) return;
    finished = true;
    stopVoice();
    audio?.stopTyping?.();
    audio?.stopTapeHiss?.({ fade: 0.3 });
    onDone?.();
  }

  function startBeats() {
    stopVoice();
    audio?.stopTyping?.();
    audio?.stopTapeHiss?.({ fade: 0.4 });
    history.length = 0;
    mode = 'beats';
    beatIdx = 0;
    pending = null;
    if (!beats.length) { finish(); return; }
    beginLine();
  }

  function gotoNode(id) {
    if (!nodes?.[id]) { startBeats(); return; }
    stopVoice();
    audio?.stopTyping?.();
    if (nodes[id].tape) audio?.startTapeHiss?.();
    else if (node()?.tape) audio?.stopTapeHiss?.();
    nodeId = id;
    lineIdx = 0;
    choiceIdx = 0;
    history.length = 0;
    pending = null;
    resetLine();

    const n = nodes[id];
    // He does not re-introduce himself. The questions are simply there again.
    if (visited.has(id) && n.choices?.length) {
      const last = n.lines?.[n.lines.length - 1];
      typed = textOf(last).length;
      lineIdx = Math.max(0, (n.lines?.length || 1) - 1);
      openBranch();
      return;
    }
    visited.add(id);
    beginLine();
  }

  function openBranch() {
    stopVoice();
    audio?.stopTyping?.();
    audio?.unduckSoundtrack?.();
    pending = { kind: 'branch', options: branchOptions() };
    choiceIdx = 0;
  }

  function commitLine() {
    const l = line();
    if (l) pushHistory(textOf(l), whoOf(l));
  }

  function advance() {
    if (mode === 'beats') {
      commitLine();
      beatIdx++;
      if (beatIdx >= beats.length) { finish(); return; }
      beginLine();
      return;
    }
    const ls = nodeLines();
    if (lineIdx < ls.length - 1) {
      commitLine();
      lineIdx++;
      beginLine();
      return;
    }
    commitLine();
    if (branchOptions().length) { openBranch(); return; }
    const n = node();
    if (n?.goto) gotoNode(n.goto);
    else startBeats();
  }

  function choose(c) {
    if (!c) return;
    // "Say it" is not a branch. It is permission for the line to happen.
    if (c.say) {
      const l = pending.line;
      pending = null;
      utter(l);
      return;
    }
    audio?.confirm?.();
    asked.add(choiceKey(c));
    onChoice?.(c);
    pending = null;
    if (c.goto) gotoNode(c.goto);
    else startBeats();
  }

  return {
    start() {
      if (mode === 'beats') { if (!beats.length) { finish(); return; } }
      else visited.add(nodeId);
      beginLine();
    },
    stop() { stopVoice(); audio?.stopTyping?.(); },

    // ── the frame loop ───────────────────────────────────────────────────────
    // Nothing here advances anything. It only reveals letters.
    update(dt) {
      if (pending || finished) return;
      const l = line();
      if (!l) return;
      const text = textOf(l);
      held += dt;

      if (handle) {
        typed = handle.done() ? text.length : Math.min(text.length, handle.charsFor());
        return;
      }
      if (typed < text.length) {
        acc += dt;
        typed = Math.min(text.length, Math.floor(acc * CPS * (l.rate || 1)));
        if (typed >= text.length) audio?.stopTyping?.();
      }
    },

    // ── input ────────────────────────────────────────────────────────────────
    key(e) {
      if (finished) return true;

      if (pending) {
        const cs = visibleOptions();
        if (e.key === 'ArrowUp' || e.key === 'w') { choiceIdx = (choiceIdx - 1 + cs.length) % cs.length; audio?.tick?.(); return true; }
        if (e.key === 'ArrowDown' || e.key === 's') { choiceIdx = (choiceIdx + 1) % cs.length; audio?.tick?.(); return true; }
        const num = Number(e.key);
        if (num >= 1 && num <= cs.length) { choose(cs[num - 1]); return true; }
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'z') { choose(cs[choiceIdx]); return true; }
        return true;
      }

      if (e.key === ' ' || e.key === 'Enter' || e.key === 'z') {
        const l = line();
        const text = textOf(l);
        const minDwell = l?.hold != null ? Math.min(l.hold, 0.9) : MIN_DWELL;
        // Hurry the line. Press again — after it has been on screen a moment —
        // and it goes.
        if (typed < text.length) {
          typed = text.length;
          acc = 1e6;
          handle?.finish?.();
          handle = null;
          audio?.stopTyping?.();
          return true;
        }
        if (held < minDwell) return true;
        advance();
        return true;
      }
      return true;
    },

    // ── what a presenter needs to draw ───────────────────────────────────────
    view() {
      const l = line();
      return {
        mode, nodeId, finished,
        speaker: mode === 'nodes' ? (node()?.speaker || '') : '',
        history: history.slice(),
        line: l || null,
        who: whoOf(l),
        typed,
        typing: !!l && typed < textOf(l).length,
        voice: handle && !handle.done() ? handle.progress() : null,
        pending: pending ? { kind: pending.kind, options: visibleOptions(), index: choiceIdx } : null,
        spent: (c) => asked.has(choiceKey(c)),
      };
    },
  };

  function visibleOptions() {
    if (!pending) return [];
    if (pending.kind === 'say') return pending.options;
    return pending.options.filter((c) => !(c.hideWhenAsked && asked.has(choiceKey(c))));
  }
}
