// THE BOX TAKES TAPE.
//
// The slot is marked COINS and he has none. The DA-1000's tape fits it, which it
// should not. It goes in, and the box's own mechanism runs it: a paid call is
// recorded onto the tape from wherever its head is, one second of tape for one
// second connected, over whatever he recorded there tonight. A take the call
// records over is gone for the run — out past the grey doors there is no room to
// go back and record again. The window in the coinbox shows the tape turning and
// the name of what is going under the head.
//
// Free, as on a 1988 box: 999, 100, 123, 192. Everything else is pay on answer.
//
// Pure: main reads the transport and the takes out of playback.js and hands them
// over; nothing here touches audio, the save, or a clock.

const freeze = Object.freeze;

// Less tape than this and the slot will not take it.
export const PAYPHONE_TAPE_MIN_SECONDS = 6;
// A key call's `return` beat lands inside this much connected time.
export const PAYPHONE_KEY_RETURN_BUDGET = 20;
// How long the pips run before the far end gives up and puts it down.
export const PAYPHONE_PIPS_SECONDS = 9;

// The beats a story line can mark with `cue: 'phone:<beat>:<sound>'`.
export const PAYPHONE_BEATS = freeze({
  lift: true, answer: true, greeting: true, beep: true, stroke: true, return: true, hang: true,
});

const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

// What the tape buys, from the transport: { headSeconds, endSeconds }.
export function payphoneTapeCredit(transport = {}) {
  const end = Math.max(0, finite(transport?.endSeconds));
  const head = Math.max(0, Math.min(end, finite(transport?.headSeconds, end)));
  const credit = Math.max(0, end - head);
  const fits = credit >= PAYPHONE_TAPE_MIN_SECONDS;
  return freeze({ head, end, credit, fits, reason: fits ? null : end <= 0 ? 'blank' : 'at-end' });
}

// The take under a tape position, if any.
export function payphoneTapeTakeAt(takes = [], seconds = 0) {
  const at = finite(seconds);
  for (const take of takes || []) {
    const start = finite(take?.startSeconds, NaN), end = finite(take?.endSeconds, NaN);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    if (take.voided) continue;
    if (at >= start && at < end) return take;
  }
  return null;
}

// Every take a call recorded over, going from `from` to `to` seconds of tape. A
// take the stretch touches at all is lost: a room with a phone call through the
// middle of it is not a clean take of the room.
export function payphoneTapeOverwrites({ takes = [], from = 0, to = 0 } = {}) {
  const a = Math.min(finite(from), finite(to)), b = Math.max(finite(from), finite(to));
  if (!(b > a)) return freeze([]);
  return freeze((takes || []).filter((take) => {
    const start = finite(take?.startSeconds, NaN), end = finite(take?.endSeconds, NaN);
    return !take?.voided && Number.isFinite(start) && Number.isFinite(end) && end > start && start < b && end > a;
  }).map((take) => freeze({ id: take.id || take.roomId || null, roomId: take.roomId || null })));
}

// What the window in the coinbox shows: the name on what is under the head.
export function payphoneTapeWindow({ takes = [], at = 0, label = (roomId) => roomId } = {}) {
  const take = payphoneTapeTakeAt(takes, at);
  if (!take) return freeze({ roomId: null, label: 'BLANK TAPE' });
  return freeze({ roomId: take.roomId || null, label: String(label(take.roomId) || take.roomId || 'A TAKE').toUpperCase() });
}

// Whether a call that started recording at `head` has run the tape out by `elapsed`.
export function payphoneTapeExpired({ head = 0, end = 0, elapsed = 0 } = {}) {
  return finite(head) + Math.max(0, finite(elapsed)) >= finite(end);
}
