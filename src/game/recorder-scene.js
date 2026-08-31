//
//  The recorder, brought up.
//
//  [R] used to be a verb: press it and a take started. That is one thing the
//  machine does, and it was the only one the player could reach — playback was
//  a separate key that only ever played the room you were standing in, and the
//  tapes you had already made were not a list anywhere. So the recorder was the
//  single most important object in the game and the player never once looked at
//  it.
//
//  Now [R] takes it out of the bag. REC is under the cursor when it opens, so
//  the old muscle memory still works — press twice and you are rolling — and
//  everything else the machine can do is on the same face beside it.
//
//  TWO RULES THIS SCENE MUST NOT BREAK:
//
//    blocksWorld: FALSE. The take clock, noise decay, the presence and the
//    microphone all live inside `if(!scenes.blocksWorld())` in the frame loop.
//    A blocking scene would freeze the take you are looking at — which is
//    exactly why the bag flatly refuses to open while rolling. Holding the
//    machine up is not a pause; the room carries on.
//
//    blocksInput: TRUE. You cannot walk while you are working the transport,
//    which is correct anyway: during a take you must not move at all.
//
//  The refusals are the machine's, not a line of dialogue. A recordist who
//  cannot roll here looks at an unlit REC and the reason printed under it, the
//  way the sound design already asked for — `recorder_invalid_press`, "a subtle
//  physical rejection, not a UI error beep".
//

import * as scenes from './scenes.js';
import { TRANSPORT, drawRecorderFace, recorderPanelRect } from '../render/recorder-view.js';
import { uiSize } from '../render/ui.js';
import { fitText } from '../render/fit-text.js';
import { createConversation } from './conversation.js';

export const RECORDER_SCENE_ID = 'recorder';

// The keys on the face, and what each one is for. Order is the order they are
// drawn and cursored through, which is the order they sit on the machine.
export const RECORDER_KEY = Object.freeze({
  REC: 'rec',
  STOP: 'stop',
  PLAY: 'play',
  TAKES: 'takes',
  RESUME: 'resume',
});

// What the machine will accept right now. Pure: given a state, it says which
// keys are live and why the dead ones are dead.
export function recorderKeys(state = {}) {
  const { recording = false, stalled = false, playing = false, browsing = false,
    refusal = null, playableHere = false, tapes = 0 } = state;
  if (recording) {
    return stalled
      ? [{ id: RECORDER_KEY.RESUME, label: 'RESUME', enabled: true }, { id: RECORDER_KEY.STOP, label: 'STOP', enabled: true }]
      : [{ id: RECORDER_KEY.STOP, label: 'STOP', enabled: true }];
  }
  if (playing) return [{ id: RECORDER_KEY.STOP, label: 'STOP', enabled: true }];
  return [
    { id: RECORDER_KEY.REC, label: 'REC', enabled: !refusal || !!refusal?.allow, reason: refusal?.reason || '' },
    { id: RECORDER_KEY.PLAY, label: 'PLAY', enabled: playableHere, reason: playableHere ? '' : 'NOTHING ON TAPE IN THIS ROOM' },
    { id: RECORDER_KEY.TAKES, label: browsing ? 'CLOSE' : 'TAKES', enabled: tapes > 0, reason: tapes ? '' : 'NO TAPES YET' },
  ];
}

export function makeRecorderScene({
  getState,          // () -> the live machine state
  getTakes,          // () -> [{ roomId, label, ordinal, playable, status, warn }]
  onRecord,          // REC / STOP / RESUME all route to the game's own verb
  onPlay,            // (roomId|null) -> play that tape, or the one in this room
  onStopPlayback,
  onClose,
  onClearInput,
} = {}) {
  const state = () => (typeof getState === 'function' ? getState() : {}) || {};
  const takes = () => (typeof getTakes === 'function' ? getTakes() : []) || [];

  let cursor = 0;
  let browsing = false;
  let row = 0;
  let notice = '';
  let noticeUntil = 0;
  let t = 0;
  let closed = false;
  let guide = null;
  let guideConvo = null;

  const keys = () => recorderKeys({ ...state(), browsing, tapes: takes().length });
  const key = () => keys()[Math.max(0, Math.min(keys().length - 1, cursor))] || null;

  function say(text, seconds = 2.2) { notice = text; noticeUntil = t + seconds; }

  function close({ suppressReopen = false } = {}) {
    if (closed) return false;
    closed = true;
    const removed = scenes.remove(scene);
    if (removed) {
      onClearInput?.({ suppressReopen });
      onClose?.();
    }
    return !!removed;
  }

  function beginGuide(config = {}) {
    if (closed || !config?.nodes) return false;
    guideConvo?.stop?.();
    guide = config;
    guideConvo = createConversation({
      nodes: config.nodes,
      startAt: config.startAt || 'start',
      sceneId: `recorder:${config.id || 'listen'}`,
      replay: config.replay || null,
      onChoice: config.onChoice,
      onLine: config.onLine,
      cue: config.cue,
      fx: config.fx,
      audio: config.audio,
      getAudio: config.getAudio,
      volume: config.volume ?? .24,
      onDone: () => {
        if (!guideConvo) return;
        const completed = guide;
        guideConvo.stop?.();
        guideConvo = null;
        guide = null;
        completed?.onDone?.();
        if (completed?.closeOnDone !== false) close({ suppressReopen: true });
      },
    });
    guideConvo.start();
    return true;
  }

  function activate() {
    const current = key();
    if (!current) return false;
    if (!current.enabled) {
      // The machine refuses physically. No dialogue, no error beep — the reason
      // is already printed on the panel; this only says it louder.
      say(current.reason || 'NOT NOW');
      return true;
    }
    switch (current.id) {
      case RECORDER_KEY.REC:
      case RECORDER_KEY.STOP:
      case RECORDER_KEY.RESUME:
        // One verb. The game's own gate ladder still owns what a press means,
        // so the machine can never get out of step with it.
        onRecord?.({ beginGuide, close });
        // Rolling puts the machine away: he is holding still and listening now,
        // not working the transport.
        if (current.id === RECORDER_KEY.REC && !guideConvo) close();
        return true;
      case RECORDER_KEY.PLAY:
        if (state().playing) onStopPlayback?.(); else onPlay?.(null);
        return true;
      case RECORDER_KEY.TAKES:
        browsing = !browsing;
        row = 0;
        return true;
      default: return false;
    }
  }

  function move(delta) {
    if (browsing) {
      const list = takes();
      if (!list.length) return;
      row = (row + delta + list.length) % list.length;
      return;
    }
    const list = keys();
    if (!list.length) return;
    cursor = (cursor + delta + list.length) % list.length;
  }

  const scene = {
    id: RECORDER_SCENE_ID,
    // See the note at the top of this file. Neither of these is a preference.
    blocksInput: true,
    blocksWorld: false,
    suppressesHud: true,
    allowsLook: true,
    lensPreset: null,

    update(dt) { t += dt || 0; guideConvo?.update?.(dt || 0); },

    keyup(event) {
      if (!guideConvo) return false;
      return guideConvo.keyup?.(event) || false;
    },

    key(event) {
      const code = event?.code || '';
      const raw = event?.key || '';
      const k = String(raw).toLowerCase();
      if (guideConvo) {
        // A guided pre-roll is committed once REC is pressed. Escape and R do
        // not abandon the monitor between "kill the light" and "roll"; the
        // conversation's own Continue/choice inputs own this transport state.
        if (raw === 'Escape' || code === 'Escape' || k === 'r' || code === 'KeyR') return true;
        return guideConvo.key(event);
      }
      if (raw === 'Escape' || code === 'Escape') { close(); return true; }
      // [R] again puts it away. The key that took it out is the key that
      // returns it, which is how every other held thing in this game works.
      if (k === 'r' || code === 'KeyR') { close(); return true; }
      if (raw === 'ArrowUp' || code === 'ArrowUp' || k === 'w') { move(-1); return true; }
      if (raw === 'ArrowDown' || code === 'ArrowDown' || k === 's') { move(1); return true; }
      if (raw === 'ArrowLeft' || code === 'ArrowLeft' || k === 'a') { move(-1); return true; }
      if (raw === 'ArrowRight' || code === 'ArrowRight' || k === 'd') { move(1); return true; }
      if (raw === 'Enter' || code === 'Enter' || k === 'e' || code === 'KeyE') {
        if (browsing) {
          const chosen = takes()[row];
          if (!chosen) return true;
          if (!chosen.playable) { say(chosen.status || 'NOTHING TO PLAY'); return true; }
          onPlay?.(chosen.roomId);
          browsing = false;
          return true;
        }
        return activate();
      }
      // [P] is still the shortcut it always was, even with the machine up.
      if (k === 'p' || code === 'KeyP') {
        if (state().playing) onStopPlayback?.(); else onPlay?.(null);
        return true;
      }
      return true;   // the machine has the keyboard while it is out
    },

    render() {
      const { cols, rows } = uiSize();
      const live = state();
      const list = keys();
      const active = key();
      const browsingNow = browsing && !live.recording && !live.playing;
      const mode = guideConvo ? TRANSPORT.LISTEN
        : browsingNow ? TRANSPORT.BROWSE
        : live.recording ? TRANSPORT.RECORD
          : live.playing ? TRANSPORT.PLAY
            : TRANSPORT.MONITOR;
      const rowsNeeded = guideConvo ? 15
        : browsingNow ? Math.max(6, Math.min(9, takes().length + 2)) : 10;
      const rect = recorderPanelRect({
        cols, rows, progress: live.progress || 0, rowsNeeded, clearBottom: live.clearBottom || 0,
      });

      const showNotice = notice && t < noticeUntil;
      drawRecorderFace({
        ...(live.face || {}),
        mode,
        rect,
        source: live.source || null,
        guide: guideConvo?.view?.() || null,
        progress: live.progress || 0,
        // Nothing is moving on a machine sitting in your hands doing nothing.
        spin: live.recording || live.playing ? (live.spin ?? 0) : 0,
        rows: browsingNow ? takes().map((take, index) => ({
          ordinal: take.ordinal,
          label: take.label,
          status: take.status,
          warn: take.warn,
          playable: take.playable,
          selected: index === row,
        })) : null,
        selected: row,
        // The reason the key under the cursor cannot be pressed, printed where
        // the machine talks about itself.
        note: showNotice ? notice : (active && !active.enabled ? active.reason : (live.note || '')),
        noteTheme: showNotice || (active && !active.enabled) ? 'amber' : (live.noteTheme || 'green'),
        footer: guideConvo
          ? (guideConvo.view()?.pending?.options?.length ? 'SELECT · ENTER TRANSMIT' : 'ENTER CONTINUE')
          : browsingNow
          ? 'ENTER PLAY · R CLOSE'
          : fitText(list.map((entry) => `${entry.id === active?.id ? '▶' : ' '}${entry.label}`).join('  '), Math.max(8, rect.w - 6)),
        buttons: { w: 6, keys: list.map((entry) => ({
          label: entry.label,
          lit: entry.enabled && entry.id === active?.id
            ? (entry.id === RECORDER_KEY.REC || entry.id === RECORDER_KEY.STOP ? 'rec' : 'play')
            : null,
        })) },
      });
    },

    exit() { closed = true; guideConvo?.stop?.(); guideConvo = null; guide = null; },

    // The pattern the bag established: everything a headless test needs, and
    // nothing the game reads.
    debugState() {
      return {
        cursor, browsing, row, notice: t < noticeUntil ? notice : '',
        guide: guide ? { id: guide.id || 'listen', view: guideConvo?.view?.() || null } : null,
        keys: keys().map((entry) => ({ id: entry.id, enabled: entry.enabled, reason: entry.reason || '' })),
        selectedKey: key()?.id || null,
      };
    },
  };
  return scene;
}
