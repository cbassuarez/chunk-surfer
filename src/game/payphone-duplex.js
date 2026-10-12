// BOTH WAYS DOWN THE LINE.
//
// A real handset is duplex: what you say goes out, and a little of it comes
// back in your own ear (sidetone), which is why a dead line sounds dead before
// anybody tells you. The box does both with the player's own microphone.
//
// Nobody on the line understands a word. What the far end hears is whether you
// spoke — the emergency operator waits for you and asks again, the house hears
// breath and puts the phone down, Lyle's voicemail takes whatever you give it
// until you stop — and that is all it ever hears.
//
// Pure: main feeds levels (mic.js micEffectiveLevel(), RMS 0..1) and elapsed
// milliseconds, and reads decisions.

const freeze = Object.freeze;
const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

export const DUPLEX = freeze({
  speechLevel: 0.02,      // RMS above this is a voice
  silenceLevel: 0.012,    // below this is a room
  speechMs: 300,          // held this long before it counts as speaking
  sidetoneGain: 0.2,      // -14 dB into the earpiece
  feedbackMs: 300,        // mic tracking the earpiece this long is a speaker loop
  feedbackHoldMs: 2500,   // and it stays off this long after
  voicemailMaxSeconds: 30,
  voicemailSilenceSeconds: 2.5,
});

// Speech or silence, with hysteresis; `spoke` latches once for the node.
export function createVoiceActivity({ speechLevel = DUPLEX.speechLevel, silenceLevel = DUPLEX.silenceLevel, speechMs = DUPLEX.speechMs } = {}) {
  let above = 0, below = 0, speaking = false, spoke = false, heardMs = 0;
  return {
    update(level, dtMs) {
      const l = finite(level), dt = Math.max(0, finite(dtMs));
      if (l >= speechLevel) { above += dt; below = 0; }
      else if (l <= silenceLevel) { below += dt; above = 0; }
      else { above = Math.max(0, above - dt * 0.5); }
      if (!speaking && above >= speechMs) { speaking = true; spoke = true; }
      if (speaking && below >= speechMs) speaking = false;
      if (speaking) heardMs += dt;
      return this.state();
    },
    state: () => freeze({ speaking, spoke, silenceMs: below, heardMs }),
    reset() { above = 0; below = 0; speaking = false; spoke = false; heardMs = 0; },
  };
}

// A node with `listen: { speech, silence, seconds }` resolves by what the far
// end hears: speaking at all goes to `speech`; `seconds` of nothing, to `silence`.
export function listenDecision(listen, activity, elapsedMs) {
  if (!listen) return null;
  if (activity?.spoke && listen.speech) return 'speech';
  const seconds = Math.max(0.5, finite(listen.seconds, 4));
  if (finite(elapsedMs) >= seconds * 1000 && !activity?.speaking && listen.silence) return 'silence';
  return null;
}

// SIDETONE, AND THE SPEAKER LOOP IT MUST NOT BECOME. With headphones the mic
// barely hears the earpiece; on laptop speakers it hears it straight back, and
// the level climbs. If the mic follows what is being fed to the earpiece for a
// sustained window, sidetone goes to zero and stays there for a while.
export function createSidetoneGuard({ gain = DUPLEX.sidetoneGain, windowMs = DUPLEX.feedbackMs, holdMs = DUPLEX.feedbackHoldMs } = {}) {
  let tracking = 0, heldFor = 0, prevMic = 0, prevOut = 0, trips = 0;
  return {
    update({ mic = 0, out = 0, dtMs = 16 } = {}) {
      const m = finite(mic), o = finite(out), dt = Math.max(0, finite(dtMs));
      if (heldFor > 0) { heldFor = Math.max(0, heldFor - dt); prevMic = m; prevOut = o; return heldFor > 0 ? 0 : gain; }
      // Both rising together, with the earpiece loud enough to be heard in the room.
      const together = o > DUPLEX.silenceLevel && m > DUPLEX.silenceLevel && (m - prevMic) * (o - prevOut) > 0 && m >= o * 0.5;
      tracking = together ? tracking + dt : Math.max(0, tracking - dt * 0.5);
      prevMic = m; prevOut = o;
      if (tracking >= windowMs) { tracking = 0; heldFor = holdMs; trips += 1; return 0; }
      return gain;
    },
    tripped: () => heldFor > 0,
    trips: () => trips,
  };
}

// Whether a message may be kept: the mic is on, and the player has said the
// game may keep local data about them (the psychological profile's consent).
export function voicemailAllowed({ micOn = false, profileStatus = 'OFF', consented = false } = {}) {
  return !!micOn && !!consented && String(profileStatus || 'OFF') !== 'OFF';
}

// The recording after the beep: it stops on silence after speech, at the
// length a voicemail takes, when the tape runs out, or when he hangs up.
export function createVoicemailTake({ maxSeconds = DUPLEX.voicemailMaxSeconds, silenceSeconds = DUPLEX.voicemailSilenceSeconds } = {}) {
  const activity = createVoiceActivity();
  let seconds = 0, stopped = null;
  return {
    update({ level = 0, dt = 0, tapeLeft = Infinity, hungUp = false } = {}) {
      if (stopped) return stopped;
      seconds += Math.max(0, finite(dt));
      const a = activity.update(level, finite(dt) * 1000);
      if (hungUp) stopped = 'hung-up';
      else if (finite(tapeLeft, Infinity) <= 0) stopped = 'tape-end';
      else if (seconds >= maxSeconds) stopped = 'full';
      else if (a.spoke && a.silenceMs >= silenceSeconds * 1000) stopped = 'silence';
      else if (!a.spoke && seconds >= silenceSeconds * 3) stopped = 'silence';
      return stopped;
    },
    seconds: () => seconds,
    spoke: () => activity.state().spoke,
    stopped: () => stopped,
  };
}
