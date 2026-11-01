// A borrowed-room contact is separate from ordinary taking/recovery. The
// caller supplies the real local actor and the checkpoint being committed.
// A rendered body and a completed active-time exposure precede consequence.
export function createFakeElleryContact({ protectedNow = () => false,
  bodyReady = () => false, bodyDrawn = () => false, setExposure = () => false,
  play = () => {}, cancelAudio = () => {}, commit = () => false,
  reduced = () => false, duration = .62 } = {}) {
  let attempt = null, serial = 0;
  const completed = new Set();
  const cancel = () => {
    if (attempt) { setExposure(null); cancelAudio(); }
    attempt = null;
  };
  return {
    present({ eventId, anchor, elapsed = 0, checkpoint } = {}) {
      if (completed.has(eventId)) return true;
      if (protectedNow() || !eventId || !anchor || !bodyReady()) { cancel(); return false; }
      const time = Math.max(0, Number(elapsed) || 0);
      if (!attempt || attempt.id !== eventId || time < attempt.last) {
        cancel();
        if (!bodyDrawn(anchor)) return false;
        attempt = { id: eventId, exposureId: `${eventId}:presentation:${++serial}`,
          start: time, last: time, rendered: false,
          anchor: JSON.parse(JSON.stringify(anchor)) };
        const value = { eventId: attempt.exposureId, kind: 'taken', anchor,
          elapsed: 0, duration, reduced: !!reduced() };
        if (setExposure(value) === false) { cancel(); return false; }
        play({ ...value, physical: true });
        return false;
      }
      const activeTime = time - attempt.start;
      attempt.last = time;
      // Outcome exposure captures this actual world root once. The room may
      // continue compressing beneath its simulation actor during the hold;
      // verification must follow the captured rendered root, not a new one.
      const captured = attempt.anchor;
      attempt.rendered ||= bodyDrawn(captured);
      // Never turn a renderer failure or a timer by itself into an injury.
      // The authored exposure deliberately reaches zero geometry in its last
      // fade. That tail can complete from earlier verified visible frames;
      // requiring a new nonzero draw at zero would restart it forever.
      const fading = activeTime >= duration * .82 && attempt.rendered;
      if (!attempt.rendered || !bodyDrawn(captured) && !fading) { cancel(); return false; }
      if (activeTime + 1e-8 < duration) {
        if (setExposure({ eventId: attempt.exposureId, kind: 'taken', anchor:captured,
          elapsed: activeTime, duration, reduced: !!reduced() }) === false) cancel();
        return false;
      }
      const ok = commit({ eventId, exposureId: attempt.exposureId, checkpoint }) === true;
      if (ok) { completed.add(eventId); cancel(); }
      return ok;
    }, cancel,
    snapshot: () => attempt ? JSON.parse(JSON.stringify(attempt)) : null,
  };
}
