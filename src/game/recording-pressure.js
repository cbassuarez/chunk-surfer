import { takeHunterTransport } from './take-hunter.js';

// Presentation only. The hunter owns danger, recovery and transport permission;
// the recorder owns the clock. This controller only remembers which observed
// transitions have already been performed, so a paused frame cannot replay one.
export function createRecordingPressurePerformance({ emit = () => false } = {}) {
  const closedTakes = new Set();
  let take = null;

  const identity = value => value == null ? '' : String(value);
  const snapshot = hunter => ({ ...hunter });
  const emptyTransport = () => takeHunterTransport();

  function session(frame) {
    const id = identity(frame.takeId);
    if (!frame.recording) {
      if (take) { take.closed = true; take.hunter = {}; closedTakes.add(take.takeId); }
      if (id) closedTakes.add(id);
      return null;
    }
    if (!id || closedTakes.has(id)) return null;
    if (!take || take.takeId !== id) {
      if (take) closedTakes.add(take.takeId);
      take = { takeId: id, roomId: identity(frame.roomId), closed: false,
        encounter: 0, wasActive: false, dragOn: false, dragIndex: 0,
        quietReleaseShown: false, releaseIndex: 0, hunter: {},
        attempted: new Set(), events: [] };
    }
    return take;
  }

  function perform(frame, kind, suffix, extra = {}) {
    // The fuller sound treatment is deliberately bounded to the representative
    // B3 passage. takeHunterTransport remains available on every floor.
    if (take.roomId !== 'main_b3') return null;
    const transport = takeHunterTransport(frame.hunter);
    const eventId = `${take.takeId}:recording-pressure:${take.encounter}:${suffix}`;
    if (take.attempted.has(eventId)) return null;
    take.attempted.add(eventId);
    const event = Object.freeze({ kind, eventId, takeId: take.takeId,
      roomId: take.roomId, atSec: frame.atSec, provenance: 'take-hunter',
      encounter: take.encounter, cause: identity(frame.hunter?.cause),
      transportPhase: transport.phase, tries: transport.tries, needs: transport.needs,
      remaining: transport.remaining, warningProgress: transport.warningProgress,
      ...extra });
    // A failed audio submission must not become evidence on the tape. Consume
    // its transition anyway: retrying every rendered frame would invent a late
    // event at a different time. The caller can inspect the absent event.
    let played = false;
    try { played = emit(event) !== false; } catch { /* unavailable audio is not a take event */ }
    if (!played) return null;
    take.events.push(event);
    return event;
  }

  function update(frame = {}) {
    if (!session(frame)) return [];
    take.hunter = snapshot(frame.hunter);
    if (frame.tutorial || frame.slating || frame.stalled
      || !Number.isFinite(frame.atSec) || frame.atSec < 0) return [];

    const events = [];
    const add = event => { if (event) events.push(event); };
    const active = !!frame.hunter?.active;
    const transport = takeHunterTransport(frame.hunter);
    if (active && !take.wasActive) {
      take.encounter += 1;
      take.dragIndex = 0;
      take.releaseIndex = 0;
      take.dragOn = false;
      take.quietReleaseShown = false;
      add(perform(frame, 'recording.answer', 'answer'));
    }
    if (active) {
      const dragging = transport.phase !== 'normal';
      if (dragging && !take.dragOn) {
        take.dragIndex += 1;
        add(perform(frame, 'recording.drag', `drag:${take.dragIndex}`));
      }
      if (transport.quietReleased && !take.quietReleaseShown) {
        take.releaseIndex += 1;
        add(perform(frame, 'recording.release', `release:${take.releaseIndex}`, { reason: 'quiet' }));
      }
      take.dragOn = dragging;
      take.quietReleaseShown = transport.quietReleased;
    } else {
      // An inactive hunter can also mean contact or an interrupted take. Only
      // an explicit authoritative lost result certifies a quiet disappearance.
      if (frame.lost && take.encounter > 0 && !take.quietReleaseShown) {
        take.releaseIndex += 1;
        add(perform(frame, 'recording.release', `release:${take.releaseIndex}`, { reason: 'lost' }));
        take.quietReleaseShown = true;
      }
      take.dragOn = false;
    }
    take.wasActive = active;
    return events;
  }

  // Pass the hunter AFTER tryCancelTake. A newly registered resisted press has
  // a larger cancelTries value; the final, successful force press is not a brake.
  function stopPress(frame = {}) {
    const events = update(frame);
    if (!take || take.closed || take.takeId !== identity(frame.takeId)
      || !frame.recording || frame.tutorial || frame.slating || frame.stalled
      || !Number.isFinite(frame.atSec) || frame.atSec < 0) return events;
    const transport = takeHunterTransport(frame.hunter);
    if (transport.phase !== 'seized' || transport.tries < 1) return events;
    const event = perform(frame, 'recording.brake', `brake:${transport.tries}`);
    if (event) events.push(event);
    return events;
  }

  function reset() {
    if (take) closedTakes.add(take.takeId);
    take = null;
  }

  function inspect() {
    return take ? { takeId: take.takeId, roomId: take.roomId, closed: take.closed,
      encounter: take.encounter, transport: takeHunterTransport(take.hunter),
      events: take.events.map(event => ({ ...event })) }
      : { takeId: null, roomId: null, closed: false, encounter: 0,
        transport: emptyTransport(), events: [] };
  }

  return { update, stopPress, reset, inspect };
}
