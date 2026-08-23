// The voice band.
//
// There is no system text in this game. Nothing addresses the player as a
// player. Every line the game says is said BY someone, AT human speed:
//
//   you        the recordist, thinking. Terse, professional, unhaunted.
//   radio      the client's end of a channel that will not stay open.
//   (nothing)  a stage direction. The game narrating its own conventions,
//              which is the only mediation we allow ourselves.
//
// Lines type out and then dwell. They do not block: the building keeps moving
// while the recordist thinks, and the radio talks over your footsteps, because
// nothing in this world waits for a sentence to finish.
//
// [space] hurries a line. It never skips one.

import { uiText, uiWrap, uiSize } from '../render/ui.js';
import { drawMachinePanel } from '../render/presentation.js';
import { textCps } from './access.js';
import { createSamDialogVoice, isVoiced } from '../audio/sam-voice.js';
import { TYPE_GAIN, TYPE_LEVEL } from '../audio/story-audio.js';

const BAND_W = 78;

const q = [];
let cur = null;
let typed = 0;       // characters revealed
let acc = 0;         // seconds into the current line
let dwell = 0;       // seconds of holding a finished line
let onCue = () => {};
let voice = createSamDialogVoice({ volume: 0.20 });
let curVoice = null;
let typing = null;
let contextHandler = () => null;
let nowHandler = () => performance.now();

// The band is a presentation surface, not a mailbox. Every transient line is
// dispatched with a lease: where it was true, how long it may wait before it
// starts, and (for an authored action) whether that action still exists. A
// failed lease drops the whole chain, not just the first stale sentence; the
// second half of an abandoned action is never allowed to arrive on its own.
export const SPEECH_DISPATCH = Object.freeze({
  maxWaitMs: 8_000,
});

const dispatches = new Map();
let dispatchSerial = 0;

export function speechInit({ cue, audio, typing: typingBus, context, now } = {}) {
  if (cue) onCue = cue;
  if (audio) voice = createSamDialogVoice({ volume: 0.20, getAudio: audio });
  if (typingBus) typing = typingBus;
  if (context) contextHandler = context;
  if (now) nowHandler = now;
  voice.warm?.();
}

// A line is a string ("just a thought"), or { who, text, cue, rate, hold }.
//   who: 'you' | 'radio' | 'direction'
function normalize(line) {
  const src = typeof line === 'string' ? { text: line } : { ...line };
  src.who = src.who || 'you';
  src.text = String(src.text ?? '');
  return src;
}

function nowMs() {
  const value = Number(nowHandler?.());
  return Number.isFinite(value) ? value : performance.now();
}

function contextKey() {
  const value = contextHandler?.();
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value.key == null ? null : String(value.key);
  return String(value);
}

function transientByDefault(line) {
  return line.persist !== true && (line.who === 'you' || line.who === 'direction');
}

function invalidateDispatch(token, { stopCurrent = true } = {}) {
  const state = dispatches.get(token);
  if (state) state.active = false;
  let changed = !!state;
  for (let i = q.length - 1; i >= 0; i--) {
    if (q[i].__dispatch?.token === token) { q.splice(i, 1); changed = true; }
  }
  if (stopCurrent && cur?.__dispatch?.token === token) {
    curVoice?.stop?.();
    curVoice = null;
    typing?.stopTyping?.();
    cur = null;
    typed = 0;
    acc = 0;
    dwell = 0;
    changed = true;
  }
  dispatches.delete(token);
  return changed;
}

function supersedeDispatch(token, { interrupt = false } = {}) {
  const state = dispatches.get(token);
  if (!state) return invalidateDispatch(token, { stopCurrent: interrupt });
  // A non-interrupting replacement may let the sentence already on screen
  // finish, but its dependent tail is gone. Give it a private family so another
  // firing does not keep finding it as the replaceable action.
  if (!interrupt && cur?.__dispatch?.token === token) {
    for (let i = q.length - 1; i >= 0; i--) {
      if (q[i].__dispatch?.token === token) q.splice(i, 1);
    }
    state.family = `${state.family}:superseded:${dispatchSerial + 1}`;
    return true;
  }
  return invalidateDispatch(token);
}

function dispatchValid(state, at = nowMs()) {
  if (!state?.active) return false;
  if (state.context != null && contextKey() !== state.context) return false;
  if (state.valid) {
    try { if (!state.valid()) return false; }
    catch (err) {
      console.warn('[speech] dispatch validity failed', err);
      return false;
    }
  }
  // Once a chain has started, its own progress owns its timing. The deadline is
  // only for getting the first line onto the band; otherwise a deliberate
  // three-line action could expire merely because its first two lines were long.
  if (!state.started && Number.isFinite(state.maxWaitMs) && at - state.createdAt > state.maxWaitMs) return false;
  return true;
}

function enqueue(line, state, { delayMs, gapMs } = {}) {
  const next = normalize(line);
  const last = q.length ? q[q.length - 1] : cur;
  if (last && last.who === next.who && last.text === next.text) return false;
  Object.defineProperty(next, '__dispatch', {
    value: {
      token: state.token,
      delayMs: Math.max(0, Number(delayMs ?? next.delayMs) || 0),
      gapMs: Math.max(0, Number(gapMs ?? next.gapMs) || 0),
    },
    enumerable: false,
  });
  q.push(next);
  while (new Set(q.map((entry) => entry.__dispatch?.token)).size > MAX_QUEUED) {
    const oldest = q[0];
    // The cap counts moments, not sentences. One authored six- or seven-line
    // action is one moment and remains intact; the seventh unrelated button
    // press retires the oldest moment atomically.
    supersedeDispatch(oldest.__dispatch?.token);
  }
  return true;
}

// An explicit action lease. `replace` makes a repeated interaction supersede
// an older firing of the same action; `cancel()` is called by an escaped scene;
// and `valid` covers richer state such as "the recorder is still listening".
// Callers that only need a contextual sequence can keep using sayAll().
export function createSpeechDispatch({
  id = 'speech', context = 'auto', maxWaitMs = SPEECH_DISPATCH.maxWaitMs,
  replace = true, interrupt = false, valid = null,
} = {}) {
  const family = String(id || 'speech');
  if (replace) {
    for (const state of [...dispatches.values()]) {
      if (state.family === family) supersedeDispatch(state.token, { interrupt });
    }
  }
  const token = `${family}:${++dispatchSerial}`;
  const state = {
    token, family, active: true, createdAt: nowMs(), started: false,
    lastCompletedAt: null,
    context: context === 'auto' ? contextKey() : (context == null ? null : String(context)),
    maxWaitMs: Number.isFinite(Number(maxWaitMs)) ? Math.max(0, Number(maxWaitMs)) : Infinity,
    valid: typeof valid === 'function' ? valid : null,
  };
  dispatches.set(token, state);
  const api = {
    id: token,
    say(line, options = {}) { if (!state.active) return false; return enqueue(line, state, options); },
    sayAll(lines = [], options = {}) {
      let accepted = 0;
      for (const line of lines) if (enqueue(line, state, options)) accepted++;
      return accepted;
    },
    cancel() { return invalidateDispatch(token); },
    active() { return !!dispatches.get(token)?.active; },
  };
  return Object.freeze(api);
}

// A thought is a moment, not a mailbox. Never let low-priority chatter (fiddling
// in the bag, repeated marks) pile into minutes of unstoppable monitor text.
//
// Two rules keep the flood from forming. A man does not say the same sentence
// twice in a row, so a line already queued or being spoken is not queued again —
// leaning on a key can no longer buy sixty seconds of backlog. And whatever
// survives that is capped: only the most recent handful is kept, because the
// oldest queued thought is the one least worth hearing by the time it comes up.
const MAX_QUEUED = 6;
export function say(line, options = {}) {
  const next = normalize(line);
  const last = q.length ? q[q.length - 1] : cur;
  if (last && last.who === next.who && last.text === next.text) return;
  const dispatch = createSpeechDispatch({
    id: options.id || `line:${dispatchSerial + 1}`,
    context: options.context !== undefined ? options.context : (transientByDefault(next) ? 'auto' : null),
    maxWaitMs: options.maxWaitMs ?? next.maxWaitMs ?? SPEECH_DISPATCH.maxWaitMs,
    replace: options.replace ?? false,
    interrupt: options.interrupt ?? false,
    valid: options.valid,
  });
  dispatch.say(next, options);
  return dispatch;
}
export function sayAll(lines = [], options = {}) {
  const normalized = (Array.isArray(lines) ? lines : []).map(normalize);
  if (!normalized.length) return null;
  const contextual = normalized.some(transientByDefault);
  const dispatch = createSpeechDispatch({
    id: options.id || `sequence:${dispatchSerial + 1}`,
    context: options.context !== undefined ? options.context : (contextual ? 'auto' : null),
    maxWaitMs: options.maxWaitMs ?? SPEECH_DISPATCH.maxWaitMs,
    replace: options.replace ?? false,
    interrupt: options.interrupt ?? false,
    valid: options.valid,
  });
  dispatch.sayAll(normalized, options);
  return dispatch;
}
export function clearSpeech() {
  q.length = 0;
  dispatches.clear();
  curVoice?.stop?.();
  curVoice = null;
  typing?.stopTyping?.();
  cur = null;
  typed = 0;
  dwell = 0;
}
export function isSpeaking() { return !!cur || q.length > 0; }
export function speaking() { return cur; }

export function speechDispatchSnapshot() {
  return {
    current: cur?.__dispatch?.token || null,
    queued: q.map((line) => line.__dispatch?.token || null),
    dispatches: [...dispatches.values()].map((state) => ({
      id: state.token, family: state.family, active: state.active, started: state.started,
      context: state.context, createdAt: state.createdAt, lastCompletedAt: state.lastCompletedAt,
    })),
  };
}

function cps() { return textCps(42); }

function begin(line) {
  cur = line;
  typed = 0; acc = 0; dwell = 0;
  if (line.cue) onCue(line.cue, line);
  curVoice?.stop?.();
  curVoice = null;
  typing?.stopTyping?.();
  // Only a mouth speaks. A thought and a stage direction are typed, because
  // nobody in the room is saying them.
  if (line.text.trim() && isVoiced(line.who) && line.voice !== false) {
    curVoice = voice.start(line.text, { speaker: line.who, rate: line.rate || 1 });
  }
}

// How long a finished line sits before the next one. Long enough to read it
// twice, because the player is also watching a corridor.
function holdFor(line) {
  if (line.hold != null) return line.hold;
  return Math.max(1.1, line.text.length * 0.031) + (line.who === 'radio' ? 0.55 : 0);
}

export function updateSpeech(dt) {
  const at = nowMs();
  if (cur) {
    const state = dispatches.get(cur.__dispatch?.token);
    if (!dispatchValid(state, at)) invalidateDispatch(cur.__dispatch?.token);
  }
  if (!cur) {
    for (let i = 0; i < q.length;) {
      const candidate = q[i];
      const meta = candidate.__dispatch || {};
      const state = dispatches.get(meta.token);
      if (!dispatchValid(state, at)) {
        invalidateDispatch(meta.token, { stopCurrent: false });
        continue;
      }
      const readyAt = state.started
        ? (state.lastCompletedAt ?? at) + meta.gapMs
        : state.createdAt + meta.delayMs;
      if (at < readyAt) { i++; continue; }
      q.splice(i, 1);
      state.started = true;
      begin(candidate);
      break;
    }
    if (!cur) return;
  }
  if (curVoice && typed < cur.text.length) {
    typing?.stopTyping?.();
    typed = Math.min(cur.text.length, curVoice.done() ? cur.text.length : curVoice.charsFor());
    return;
  }
  const rate = cps() * (cur.rate || 1);
  if (typed < cur.text.length) {
    // Everything that is not spoken is typed. The typewriter is the game's
    // narrating voice, and it is a machine.
    if (!isVoiced(cur.who)) typing?.startTyping?.({ gain: TYPE_GAIN * TYPE_LEVEL.thought });
    else typing?.stopTyping?.();
    acc += dt;
    typed = Math.min(cur.text.length, Math.floor(acc * rate));
    return;
  }
  typing?.stopTyping?.();
  dwell += dt;
  if (dwell >= holdFor(cur)) {
    const token = cur.__dispatch?.token;
    curVoice?.stop?.();
    curVoice = null;
    cur = null;
    const state = dispatches.get(token);
    if (state) {
      state.lastCompletedAt = at;
      if (!q.some((line) => line.__dispatch?.token === token)) dispatches.delete(token);
    }
  }
}

// [space] fills the line in. Pressing it again lets the line go.
export function skipSpeech() {
  if (!cur) return false;
  const token = cur.__dispatch?.token;
  const state = dispatches.get(token);
  if (!dispatchValid(state)) { invalidateDispatch(token); return false; }
  if (typed < cur.text.length) {
    typed = cur.text.length;
    acc = cur.text.length / cps();
    curVoice?.finish?.();
    typing?.stopTyping?.();
    return true;
  }
  curVoice?.stop?.();
  curVoice = null;
  typing?.stopTyping?.();
  cur = null;
  if (state) {
    state.lastCompletedAt = nowMs();
    if (!q.some((line) => line.__dispatch?.token === token)) dispatches.delete(token);
  }
  return true;
}

const WHO = {
  me: { tag: 'VOICE', cls: 'ui-primary', alpha: 1 },
  you: { tag: 'THOUGHT', cls: 'ui-primary', alpha: 1 },
  radio: { tag: 'RADIO', cls: 'ui-amber', alpha: 1 },
  guard: { tag: 'GUARD', cls: 'ui-amber', alpha: 1 },
  recordist: { tag: 'TAKE', cls: 'ui-primary', alpha: 1 },
  surfer: { tag: 'SURFER', cls: 'ui-danger', alpha: 1 },
  // Heard, and not named. It is the surfer, hours before the game admits it.
  unknown: { tag: 'UNKNOWN', cls: 'ui-counter', alpha: 1 },
  sarah: { tag: 'SARAH', cls: 'ui-danger', alpha: 1 },
  direction: { tag: 'DIRECTION', cls: 'ui-secondary', alpha: 1 },
};

// Where the band's top edge is right now, or null when nothing is being said.
// The HUD needs this because anything it wants the player to LOOK at — the
// flashing bag prompt at the end of the setup, say — is drawn near the foot of
// the screen and would otherwise end up behind the band.
export function bandTop() {
  if (!cur) return null;
  const { cols, rows } = uiSize();
  const w = Math.min(BAND_W, cols - 8);
  const shown = cur.text.slice(0, typed);
  const panelH = Math.max(1, uiWrap(shown, Math.max(12, w - 8)).length) + 7;
  return rows - panelH - 2;
}

export function drawSpeech() {
  if (!cur) return;
  const { cols, rows } = uiSize();
  const w = Math.min(BAND_W, cols - 8);
  const x = Math.floor((cols - w) / 2);

  const style = WHO[cur.who] || WHO.you;
  const shown = cur.text.slice(0, typed);
  const lines = uiWrap(shown, Math.max(12, w - 8));
  const h = Math.max(1, lines.length);
  const panelH = h + 7;
  const y = rows - panelH - 2;
  const panel = drawMachinePanel(x - 2, y, w + 4, panelH, {
    label: 'MONITOR', source: style.tag || 'VOICE', meter: true,
  });
  const textX = panel.x + 1;
  const textY = Math.max(y + 3, panel.y - 1);
  const textW = Math.max(8, panel.w - 2);
  const safeLines = uiWrap(shown, textW);

  safeLines.slice(0, Math.max(1, panel.h)).forEach((l, i) => {
    // a stage direction wears its parentheses; a thought does not announce
    // itself as one.
    uiText(textX, textY + i, l, style.cls, style.alpha);
  });

  // The cursor: a recordist's blinking level LED, borrowed.
  if (typed < cur.text.length) {
    const visible = safeLines.slice(0, Math.max(1, panel.h));
    const last = visible[visible.length - 1] || '';
    uiText(textX + last.length, textY + visible.length - 1, '▌', 'ui-amber');
  }
}
