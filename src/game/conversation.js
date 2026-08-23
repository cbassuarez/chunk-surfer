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
//   { who, text, resolveText?, prompt?, cue?, hold?, rate?, shake?, flash?, say?:false }
// Choice shape:
//   { text, goto?, set?, clear?, exit? }

import { createSamDialogVoice, isVoiced } from '../audio/sam-voice.js';
import { TYPE_GAIN, TYPE_LEVEL } from '../audio/story-audio.js';
import { flagTest } from './flags.js';
import { textCps } from './access.js';
import { freshStoryArtShotState, resolveStoryArtShot } from './story-art-shot.js';
const CPS = 38;
const MIN_DWELL = 0.25;         // before [space] is heard at all

export const textOf = (l) => String(l?.text ?? l ?? '');
export const whoOf = (l) => l?.who || 'direction';

// Exported because the battle scene needs exactly this rule and there must not
// be two of it: a line that is invisible in a thought tree and visible in a
// fight is a line that will be wrong in one of them.
export function visibleByFlag(item) {
  const expr = item?.['if'];
  if (expr == null || expr === '') return true;
  try { return flagTest(expr); }
  catch (err) {
    console.warn?.('[conversation] bad condition', expr, err);
    return false;
  }
}

export function visibleList(list = []) {
  return (Array.isArray(list) ? list : []).filter(visibleByFlag);
}

// What a picker calls a line he is about to say. Long lines want a `prompt`.
function sayLabel(l) {
  if (l.prompt) return l.prompt;
  const t = textOf(l).trim();
  if (t === '...' || t === '…') return '(say nothing)';
  return `"${t}"`;
}

export function createConversation({
  nodes = null, beats = [], startAt = 'start', sceneId = 'conversation', replay = null,
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
  let activeLineId = '';
  let activeLineSeenBefore = false;
  let storyArtState = freshStoryArtShotState();
  let currentStoryArt = null;
  let currentStoryArtReason = 'none';
  let accelerateHeld = false;
  let accelerateStartedAt = 0;
    let finished = false;
    let lineSerial = 0;
    const history = [];
  const asked = new Set();
  const visited = new Set();
  let nodeEntryMode = 'normal';

  const node = () => (nodes && nodes[nodeId]) || null;
  const nodeLines = () => {
    const n = node();
    if (!n) return [];
    const list = nodeEntryMode === 'revisit' && n.revisitLines?.length ? n.revisitLines : n.lines || [];
    return visibleList(list);
  };
  // A BEAT LIST IS FILTERED THE SAME WAY A NODE IS.
  //
  // It was not, and nothing noticed for as long as no beat list carried a
  // condition — the endings kept their variants in separate DOCUMENTS, so no
  // authored beat had ever had an `if` on it. The moment one did (the sacrifice
  // collapsing twelve files into one that reads the run) every conditional line
  // played at once, and the ending told the player both that it never touched
  // them and that it reached them three times, in consecutive sentences.
  const visibleBeats = () => visibleList(beats);
  const sourceLine = () => (mode === 'nodes' ? nodeLines()[lineIdx] : visibleBeats()[beatIdx]);
  // A resolved line is a snapshot, not a getter. The level-check count uses
  // this to quote the recorder clock at the Continue press which advanced into
  // the line; keeping that value fixed prevents the displayed text and voice
  // from changing again while the player sits on it.
  let activeLine = null;
  const line = () => activeLine || sourceLine();

  function updateStoryArtShot(l = line()) {
    const sourceId = String(l?.sourceId || l?.id || '');
    const resolved = resolveStoryArtShot({
      mode,
      sceneId,
      nodeId: mode === 'nodes' ? nodeId : 'beats',
      lineId: l ? activeLineId : `${sceneId}:${mode === 'nodes' ? nodeId : 'beats'}:choice`,
      sourceId,
      line: l || null,
      node: mode === 'nodes' ? node() : null,
      previous: storyArtState,
    });
    storyArtState = resolved.state;
    currentStoryArt = resolved.art;
    currentStoryArtReason = resolved.reason;
  }

  const lineContentId = (l = line()) => replay?.lineId?.({
    nodeId: mode === 'nodes' ? nodeId : 'beats',
    line: l,
    index: mode === 'nodes' ? lineIdx : beatIdx,
  }) || `${sceneId}:${mode === 'nodes' ? nodeId : 'beats'}:line:${mode === 'nodes' ? lineIdx : beatIdx}`;
  const choiceContentId = (c, index = branchOptions().indexOf(c)) => replay?.choiceId?.({
    nodeId, choice: c, index: Math.max(0, index),
  }) || `${sceneId}:${nodeId}:choice:${Math.max(0, index)}`;
  const choiceKey = (c, index) => c?.contentId || c?.__choiceKey || choiceContentId(c, index);
  const branchOptions = () => node()?.choices || [];

  function stopVoice() { handle?.stop?.(); handle = null; }
  function resetLine() {
    typed = 0; acc = 0; held = 0;
    accelerateHeld = false; accelerateStartedAt = 0;
    stopVoice();
  }

    function pushHistory(text, who, mask = null) {
      if (!text) return;

      history.push({
        text,
        who,
        // Carried so a line the rain took still looks taken once it has scrolled
        // up into the record. Only the mask's NAME travels; the shape itself is
        // resolved at draw time and never enters the transcript.
        mask,
        serial: lineSerial,
      });

      while (history.length > 24) history.shift();
    }

  function fire(l) {
    if (!l) return;
    if (l.cue) cue?.(l.cue, l);
    if (l.shake) fx?.shake?.(l.shake, l.shakeMs || 420);
    if (l.flash) fx?.flash?.(l.flashMs || 160, 'rgba(4,4,6,1)');
  }

  let maskChoke = null;

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
      const bed = TYPE_GAIN * (TYPE_LEVEL[who === 'direction' ? 'direction' : 'thought'] || 1);
      audio?.startTyping?.({ gain: l?.mask ? bed * 1.15 : bed });
      // THE MACHINE LOSES IT.
      //
      // A masked line is one the rain took, and the typewriter has to fail with
      // it — it starts hard, as if this were an ordinary thing to write down,
      // and then gives out under the rain cue rather than running the length of
      // the line. What is left is the weather, which is the whole point.
      //
      // A timer rather than a reveal hook because the reveal is player-paced:
      // somebody who sits on the line for ten seconds should still hear the
      // machine give up early, not type patiently the entire time.
      if (l?.mask) {
        clearTimeout(maskChoke);
        maskChoke = setTimeout(() => audio?.stopTyping?.({ fade: 0.34 }), 380);
      }
    }
  }

  // Before he speaks, you decide that he speaks.
    function beginLine() {
      const source = sourceLine();
      const l = source && typeof source.resolveText === 'function'
        ? { ...source, text: String(source.resolveText()) }
        : source;
      activeLine = l;
      if (!l) {
        if (mode === 'nodes') {
          if (branchOptions().length) { openBranch(); return; }
          const n = node();
          if (n?.goto) { gotoNode(n.goto); return; }
          // An explicitly empty terminal node is a real ending. Previously it
          // left the thought shell alive with no line, choices, or dismissible
          // input — the get-in investigations all terminate this way.
          startBeats();
          return;
        }
        if (mode === 'beats') finish();
        return;
      }

      resetLine();
      lineSerial++;
      activeLineId = lineContentId(l);
      activeLineSeenBefore = replay?.lineStatus?.(activeLineId) === 'seen-before-run';
      updateStoryArtShot(l);
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
    clearTimeout(maskChoke);
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
    activeLine = null;
    pending = null;
    if (!visibleBeats().length) { finish(); return; }
    beginLine();
  }

  function gotoNode(id) {
    if (!nodes?.[id]) { startBeats(); return; }
    stopVoice();
    audio?.stopTyping?.();
    if (nodes[id].tape) audio?.startTapeHiss?.();
    else if (node()?.tape) audio?.stopTapeHiss?.();
    const revisiting = visited.has(id);
    nodeId = id;
    nodeEntryMode = revisiting ? 'revisit' : 'normal';
    lineIdx = 0;
    choiceIdx = 0;
    history.length = 0;
    pending = null;
    activeLine = null;
    resetLine();

    const n = nodes[id];
    // Hubs do not repeat their whole greeting. If a hub has authored return
    // beats, play those; otherwise reopen the question board immediately.
    if (revisiting && n.choices?.length) {
      const returnLines = visibleList(n.revisitLines || []);
      if (returnLines.length) { beginLine(); return; }
      const ls = visibleList(n.lines || []);
      const last = ls[ls.length - 1];
      typed = textOf(last).length;
      lineIdx = Math.max(0, ls.length - 1);
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
    updateStoryArtShot(null);
  }

  function commitLine() {
    const l = line();
    if (!l) return;
    pushHistory(textOf(l), whoOf(l), l?.mask || null);
    if (activeLineId) replay?.markLine?.(activeLineId);
  }

  function advance() {
    if (mode === 'beats') {
      commitLine();
      beatIdx++;
      if (beatIdx >= visibleBeats().length) { finish(); return; }
      activeLine = null;
      beginLine();
      return;
    }
    const ls = nodeLines();
    if (lineIdx < ls.length - 1) {
      commitLine();
      lineIdx++;
      activeLine = null;
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
    const key = choiceKey(c);
    asked.add(key);
    replay?.markChoice?.(key);
    onChoice?.(c);
    pending = null;
    if (c.goto) gotoNode(c.goto);
    else startBeats();
  }

  return {
    start() {
      if (mode === 'beats') { if (!visibleBeats().length) { finish(); return; } }
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

      const accelerating = activeLineSeenBefore && accelerateHeld
        && performance.now() - accelerateStartedAt >= 180;
      if (accelerating) replay?.noteSeenTextAssist?.();

      if (handle) {
        if (accelerating) {
          handle.finish?.();
          handle = null;
          typed = text.length;
          return;
        }
        typed = handle.done() ? text.length : Math.min(text.length, handle.charsFor());
        return;
      }
      if (typed < text.length) {
        const mode = replay?.seenTextMode?.() || 'normal';
        const scale = accelerating && mode === 'instant' ? 1e6
          : accelerating && mode === 'fast' ? 4 : 1;
        acc += dt * scale;
        typed = Math.min(text.length, Math.floor(acc * textCps(CPS) * (l.rate || 1)));
        if (typed >= text.length) audio?.stopTyping?.();
      }
    },

    // ── input ────────────────────────────────────────────────────────────────
    key(e) {
      if (finished) return true;

      if (pending) {
        const cs = visibleOptions();
        if (choiceIdx >= cs.length) choiceIdx = Math.max(0, cs.length - 1);
        if (!cs.length) {
          pending = null;
          const n = node();
          if (n?.goto) gotoNode(n.goto);
          else startBeats();
          return true;
        }
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
        const replayMode = replay?.seenTextMode?.() || 'normal';
        if (typed < text.length && activeLineSeenBefore && replayMode !== 'normal') {
          if (!accelerateHeld) {
            accelerateHeld = true;
            accelerateStartedAt = performance.now();
          }
          return true;
        }
        // Unseen text retains the original tap-to-reveal behavior.
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

    keyup(e) {
      if (!(e.key === ' ' || e.key === 'Enter' || e.key === 'z')) return false;
      if (!accelerateHeld) return false;
      const heldMs = performance.now() - accelerateStartedAt;
      accelerateHeld = false;
      if (heldMs < 180) {
        const l = line();
        const text = textOf(l);
        if (typed < text.length) {
          typed = text.length; acc = 1e6;
          handle?.finish?.(); handle = null;
          audio?.stopTyping?.();
        }
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
          lineAge: held,
          lineSerial,
          lineContentId: activeLineId,
          seenBeforeRun: activeLineSeenBefore,
          accelerating: accelerateHeld,
          voice: handle && !handle.done() ? handle.progress() : null,
        pending: pending ? { kind: pending.kind, options: visibleOptions(), index: choiceIdx } : null,
        art: currentStoryArt,
        artReason: currentStoryArtReason,
        lineSourceId: l?.sourceId || l?.id || '',
        spent: (c) => asked.has(choiceKey(c)),
      };
    },
  };

  function visibleOptions() {
    if (!pending) return [];
    if (pending.kind === 'say') return pending.options;
    return pending.options
      .map((c, index) => ({ choice: c, index, id: choiceKey(c, index) }))
      .filter(({ choice }) => visibleByFlag(choice))
      .filter(({ choice, id }) => !(choice.hideWhenAsked && asked.has(id)))
      .map(({ choice, id }) => {
        return {
          ...choice,
          contentId: id,
          __choiceKey: id,
          replayState: replay?.choiceStatus?.(id) || 'unseen',
          archiveSignal: !!replay?.archiveSignalsEnabled?.() && (replay?.choiceStatus?.(id) || 'unseen') === 'unseen',
        };
      });
  }
}
