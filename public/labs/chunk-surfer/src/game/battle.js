// What's happening to me.
//
// He has no weapons. He has a recorder and thirty years of ears, and the thing
// attacking him is the sound of a room that is supposed to be empty. So the
// fight is the only fight this man could ever have: not "kill it" but "is it in
// the room?" — the exact question the whole piece is about, made into a verb.
//
// TURN-BASED, and the meter is his COMPOSURE, drawn with the same iconography
// as the take meter because it is the same thing: the moment it empties, the
// take is spoiled and he is hurt. Each round a sound arrives — a chunk from the
// stab pool, played far off and low, because there are no instruments in this
// building and there is nobody here to play them. Is it a recording? Whose?
//
// His four verbs:
//   LISTEN     the professional move. It costs almost nothing and it REVEALS
//              what the sound is — in the room, on the tape, or not there. A
//              man who has recorded four hundred rooms should always know.
//              He doesn't any more. That is the horror, and listening is how
//              he claws it back.
//   HOLD STILL brace. Halves the next blow. Does nothing else.
//   BREATHE    recovers composure, but the next thing is louder, because you
//              stopped listening to take a breath.
//   NAME IT    end it. If you have LISTENed and you say what it truly is, it
//              loses its hold. If you are guessing, it costs you everything.
//
// Between the sounds, Sarah. She is not an attack. She is who he stops being a
// recordist long enough to talk to, and every round he spends on her is a round
// he did not spend listening — which is the whole story of them.

import * as scenes from './scenes.js';
import { uiSize, uiFill, uiText, uiWrap, uiCenter } from '../render/ui.js';
import { createSamDialogVoice, isVoiced } from '../audio/sam-voice.js';
import { TYPE_GAIN, TYPE_LEVEL } from '../audio/story-audio.js';

const COL_W = 70;
const CPS = 40;
const NATURES = ['in the room', 'on the tape', 'not there'];

const STYLE = {
  me: { cls: 't-chunk-on', label: '' },
  you: { cls: 't-trail-1', label: '' },
  sarah: { cls: 't-hush-edge', label: 'SARAH' },
  surfer: { cls: 't-hush-core', label: '' },
  recordist: { cls: 't-trail-1', label: 'TAKE' },
  direction: { cls: 't-trail-2', label: '' },
};

const textOf = (l) => String(l?.text ?? l ?? '');
const whoOf = (l) => l?.who || 'direction';

// A battle definition (see data/battles.js):
//   { id, composure, intro:[line], rounds:[{ nature, threat, before:[line],
//     onListen:[line], after:[line] }], win:[line], lose:[line] }
export function makeBattleScene({
  battle, drawSound, playSound, fx, audio, getAudio,
  onWin = () => {}, onLose = () => {},
} = {}) {
  const voice = createSamDialogVoice({ volume: 0.26, getAudio });
  voice.warm?.();

  const MAX = battle.composure ?? 1;
  let composure = MAX;
  let roundIdx = -1;                 // -1 = intro
  let phase = 'talk';                // talk | menu | resolve | done
  let queue = [];                    // lines still to type this beat
  let cur = null, typed = 0, acc = 0, held = 0, handle = null;
  let known = null;                  // the revealed nature of THIS round's sound
  let braced = false, exposed = false;
  let menuIdx = 0;
  let result = null;                 // 'win' | 'lose'
  let onEnd = () => {};

  const round = () => battle.rounds[roundIdx] || null;

  function stopVoice() { handle?.stop?.(); handle = null; }

  function speak(lines, then) {
    queue = (lines || []).slice();
    onEnd = then || (() => {});
    phase = 'talk';
    nextLine();
  }

  function nextLine() {
    stopVoice();
    audio?.stopTyping?.();
    cur = queue.shift() || null;
    typed = 0; acc = 0; held = 0;
    if (!cur) { onEnd(); return; }
    const who = whoOf(cur);
    const text = textOf(cur);
    if (cur.cue) fx?.cue?.(cur.cue);
    if (text && isVoiced(who) && cur.voice !== false) {
      handle = voice.start(text, { speaker: who, rate: cur.rate || 1 });
    } else if (text) {
      audio?.startTyping?.({ gain: TYPE_GAIN * (TYPE_LEVEL[who === 'direction' ? 'direction' : 'thought'] || 1) });
    }
  }

  // ── the round ──────────────────────────────────────────────────────────────
  function beginRound() {
    roundIdx++;
    if (roundIdx >= battle.rounds.length) { finish('win'); return; }
    known = null; braced = false; exposed = false;
    const r = round();
    // A sound arrives, far off. It is one of the composer's own chunks, and it
    // is the wrong thing to be hearing in a drained pool.
    playSound?.(r);
    speak(r.before, openMenu);
  }

  function openMenu() { phase = 'menu'; menuIdx = 0; }

  const VERBS = ['LISTEN', 'HOLD STILL', 'BREATHE', 'NAME IT'];

  function damage(base) {
    let d = base;
    if (braced) d *= 0.5;
    if (exposed) d *= 1.5;
    composure = Math.max(0, composure - d);
  }

  // Only LISTEN keeps the turn — you may listen and THEN act. Everything else
  // ends the round and moves the sound on, so a breath cannot be farmed and a
  // man cannot stand in a drained pool holding still forever.
  const step = () => (composure <= 0 ? finish('lose') : beginRound());
  const stay = () => (composure <= 0 ? finish('lose') : openMenu());

  function choose(verb) {
    const r = round();
    phase = 'resolve';
    if (verb === 'LISTEN') {
      known = r.nature;
      damage(r.threat * 0.15);          // leaning toward it to hear it costs a little
      const rev = r.onListen || [{ who: 'you', text: natureLine(r.nature) }];
      speak(rev, stay);
      return;
    }
    if (verb === 'HOLD STILL') {
      damage(r.threat * 0.5);           // brace: the honest, expensive, safe move
      speak(r.after || [{ who: 'direction', text: 'You are furniture. You are very good at it.' }], step);
      return;
    }
    if (verb === 'BREATHE') {
      // A breath buys composure and costs attention: the sound lands full while
      // you are not listening to it, and then the round is over.
      composure = Math.min(MAX, composure + 0.16);
      damage(r.threat * 1.1);
      speak([{ who: 'direction', text: 'You take a breath, and for as long as it lasts you are not listening to anything.' }], step);
      return;
    }
    // NAME IT — the finisher. Right if you listened; a full blow if you guessed.
    if (known === r.nature) {
      speak(r.after || [{ who: 'me', text: nameLine(r.nature) }], step);
    } else {
      damage(r.threat);
      speak([{ who: 'you', text: 'You say what it is. You are wrong, and it knows you are wrong.' }], step);
    }
  }

  function natureLine(n) {
    if (n === 'in the room') return 'That is in the room. That is actually in the room.';
    if (n === 'on the tape') return 'It is on the tape. It is on a tape that is not running.';
    return 'There is nothing there. There is nothing there and I can hear it.';
  }
  function nameLine(n) {
    if (n === 'in the room') return "You're in the room. All right. I know you're in the room.";
    if (n === 'on the tape') return "You're on the tape. I recorded you. I did this.";
    return 'There is nothing there. Say it and mean it. There is nothing there.';
  }

  function finish(kind) {
    result = kind;
    phase = 'done';
    speak(kind === 'win' ? battle.win : battle.lose, () => {
      stopVoice(); audio?.stopTyping?.();
      scenes.pop();
      (kind === 'win' ? onWin : onLose)();
    });
  }

  return {
    id: `battle:${battle.id}`,
    blocksInput: true,
    blocksWorld: true,           // this is self against self. the building waits.
    lensPreset: 'battle',

    enter() { speak(battle.intro, beginRound); },
    exit() { stopVoice(); audio?.stopTyping?.(); },

    // for the headless suite
    battleView() {
      return {
        phase, round: roundIdx, rounds: battle.rounds.length,
        composure: +(composure / MAX).toFixed(3), known, result,
        line: cur ? textOf(cur) : '', who: whoOf(cur), typed,
        verbs: phase === 'menu' ? VERBS : null,
      };
    },

    update(dt) {
      if (!cur) return;
      const text = textOf(cur);
      held += dt;
      if (handle) { typed = handle.done() ? text.length : Math.min(text.length, handle.charsFor()); return; }
      if (typed < text.length) {
        acc += dt;
        typed = Math.min(text.length, Math.floor(acc * CPS * (cur.rate || 1)));
        if (typed >= text.length) audio?.stopTyping?.();
      }
    },

    key(e) {
      if (e.key === 'Escape') return true;    // you do not get to leave

      if (phase === 'menu') {
        if (e.key === 'ArrowUp' || e.key === 'w') { menuIdx = (menuIdx - 1 + VERBS.length) % VERBS.length; return true; }
        if (e.key === 'ArrowDown' || e.key === 's') { menuIdx = (menuIdx + 1) % VERBS.length; return true; }
        const num = Number(e.key);
        if (num >= 1 && num <= VERBS.length) { choose(VERBS[num - 1]); return true; }
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'z') { choose(VERBS[menuIdx]); return true; }
        return true;
      }

      // during dialogue, [space] hurries then advances
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'z') {
        if (!cur) return true;
        const text = textOf(cur);
        if (typed < text.length) { typed = text.length; handle?.finish?.(); handle = null; audio?.stopTyping?.(); return true; }
        if (held < 0.2) return true;
        nextLine();
        return true;
      }
      return true;
    },

    render() {
      const { cols, rows } = uiSize();
      uiScrimBlack(cols, rows);

      const w = Math.min(COL_W, cols - 8);
      const x = Math.floor((cols - w) / 2);

      // The enemy has a name and it is at the top, because you are looking at
      // it even when you cannot see it.
      uiCenter(3, battle.enemy || 'THE SOUND OF SILENCE', 't-hush-core', 0.9);

      // Composure: the take meter, worn as HP.
      const bw = Math.min(46, cols - 8);
      const bx = Math.floor((cols - bw) / 2);
      const filled = Math.round((composure / MAX) * (bw - 2));
      const low = composure / MAX < 0.34;
      uiText(bx, 5, '[', 't-trail-2');
      for (let i = 0; i < bw - 2; i++) {
        uiText(bx + 1 + i, 5, i < filled ? '▓' : '░', i < filled ? (low ? 't-hush-core' : 't-key') : 't-trail-4', i < filled ? 1 : 0.35);
      }
      uiText(bx + bw - 1, 5, ']', 't-trail-2');
      uiText(bx, 6, 'composure', 't-trail-3', 0.5);
      if (known) uiText(bx + bw - 12, 6, known, 't-trail-2', 0.6);

      // the current line
      const lines = cur ? uiWrap(textOf(cur).slice(0, typed), w) : [];
      let y = Math.max(9, Math.floor(rows * 0.42));
      const st = STYLE[whoOf(cur)] || STYLE.direction;
      if (cur && st.label) uiText(x, y++, st.label, 't-trail-4', 0.5);
      lines.forEach((l, i) => {
        uiText(x, y, l, st.cls, 0.95);
        if (i === lines.length - 1 && cur && typed < textOf(cur).length) uiText(x + l.length, y, '▌', st.cls, 0.55);
        y++;
      });

      if (phase === 'menu') {
        y += 1;
        VERBS.forEach((v, i) => {
          const on = i === menuIdx;
          const hint = v === 'LISTEN' ? 'what is it?'
            : v === 'HOLD STILL' ? 'brace'
              : v === 'BREATHE' ? 'recover — but stop listening'
                : known ? 'say what it is' : 'guess';
          uiText(x, y++, `${on ? '▸' : ' '} ${i + 1}  ${v.padEnd(11)}  ${on ? hint : ''}`,
                 on ? 't-chunk-on' : 't-trail-2', on ? 1 : 0.6);
        });
      }

      uiCenter(rows - 2, phase === 'menu' ? '↑ ↓ · enter' : '[space]', 't-trail-4', 0.24);
    },
  };
}

function uiScrimBlack(cols, rows) { uiFill(0, 0, cols, rows, 'rgba(2,2,3,0.93)'); }
