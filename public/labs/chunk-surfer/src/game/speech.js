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
import { getSave } from './save.js';
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

export function speechInit({ cue, audio, typing: typingBus } = {}) {
  if (cue) onCue = cue;
  if (audio) voice = createSamDialogVoice({ volume: 0.20, getAudio: audio });
  if (typingBus) typing = typingBus;
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

export function say(line) { q.push(normalize(line)); }
export function sayAll(lines = []) { for (const l of lines) say(l); }
export function clearSpeech() {
  q.length = 0;
  curVoice?.stop?.();
  curVoice = null;
  typing?.stopTyping?.();
  cur = null;
  typed = 0;
  dwell = 0;
}
export function isSpeaking() { return !!cur || q.length > 0; }
export function speaking() { return cur; }

function cps() {
  const c = getSave().settings?.textCps || 42;
  return Math.max(8, c);
}

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
  if (!cur) {
    if (!q.length) return;
    begin(q.shift());
    return;
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
    curVoice?.stop?.();
    curVoice = null;
    cur = null;
  }
}

// [space] fills the line in. Pressing it again lets the line go.
export function skipSpeech() {
  if (!cur) return false;
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
  return true;
}

const WHO = {
  me: { tag: 'VOICE', cls: 'ui-primary', alpha: 1 },
  you: { tag: 'THOUGHT', cls: 'ui-primary', alpha: 1 },
  radio: { tag: 'RADIO', cls: 'ui-amber', alpha: 1 },
  guard: { tag: 'GUARD', cls: 'ui-amber', alpha: 1 },
  recordist: { tag: 'TAKE', cls: 'ui-primary', alpha: 1 },
  surfer: { tag: 'SURFER', cls: 'ui-danger', alpha: 1 },
  sarah: { tag: 'SARAH', cls: 'ui-danger', alpha: 1 },
  direction: { tag: 'DIRECTION', cls: 'ui-secondary', alpha: 1 },
};

export function drawSpeech() {
  if (!cur) return;
  const { cols, rows } = uiSize();
  const w = Math.min(BAND_W, cols - 8);
  const x = Math.floor((cols - w) / 2);

  const style = WHO[cur.who] || WHO.you;
  const shown = cur.text.slice(0, typed);
  const lines = uiWrap(shown, w - 2);
  const h = Math.max(1, lines.length);
  const panelH = h + 5;
  const y = rows - panelH - 2;
  const panel = drawMachinePanel(x - 2, y, w + 4, panelH, {
    label: 'MONITOR', source: style.tag || 'VOICE', meter: true,
  });

  lines.forEach((l, i) => {
    // a stage direction wears its parentheses; a thought does not announce
    // itself as one.
    uiText(panel.x, panel.y + i, l, style.cls, style.alpha);
  });

  // The cursor: a recordist's blinking level LED, borrowed.
  if (typed < cur.text.length) {
    const last = lines[lines.length - 1] || '';
    uiText(panel.x + last.length, panel.y + h - 1, '▌', 'ui-amber');
  }
}
