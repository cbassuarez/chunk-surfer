// THE PRACTICE WING — the one encounter with nothing in it.
//
// Every other fight in this game has a thing on the other side of it. The hall
// has a house, the natatorium has water, the chapel has the tower. This room has
// a man, a file, and a bar the file ends at.
//
// NOTHING IN HERE ATTACKS YOU. That is the whole design and it is load-bearing:
// the moment the room wants something, or the phrase takes itself again, this
// becomes a ghost story about a haunted building, and the game stops being about
// what he did to her. So no state in this file describes an adversary. It
// describes a recordist winding a file back.
//
// WHY THE FILE CANNOT BE FINISHED
//
// The phrase stops where it stops because that is where the recording stops, and
// the recording stops because that is where he started talking over her. Nine
// minutes of Sarah playing, behind a conversation he was having. There is no
// clean run to earn. He can take it from the top all night.
//
// So the encounter has two exits and neither is a victory:
//
//   HE PUTS IT DOWN.  Available only once he has played the bar back and heard
//                     what is actually on it. Giving up a repetition to listen
//                     is the hardest thing this man can do, which is why it is
//                     the price of leaving.
//   HE DOES NOT.      Attrition. Not the room winning — nothing in here is
//                     coming for him — just what happens to somebody who will
//                     not stop.
//
// THE CRAFT IS THE WAY OUT. Playing a thing back is the one skill he genuinely
// has, and it is precisely what he never did for her: "You never played me back.
// Not once." Same faculty, pointed at a person instead of a product.
//
// Pure and seeded, like hall-apparitions.js: it takes a session and returns a
// session, so combat-state can own one without an import cycle.

// What is on the bar, in the order he gets to it. Three passes, because the
// third is the one that costs him the story he has been telling himself.
//
// Deliberately not escalating in volume or strangeness. Each pass is quieter and
// more ordinary than the last, and the last is unbearable precisely because it
// is nothing — a man interrupting somebody to say something that did not matter.
export const PRACTICE_REVEALS = Object.freeze([
  Object.freeze({
    id: 'edge',
    label: 'THE EDGE OF IT',
    line: 'Under her right hand, at the bar, there is a room tone that is not this room.',
    note: 'A different space. Smaller. Carpet.',
  }),
  Object.freeze({
    id: 'breath',
    label: 'THE BREATH',
    line: 'Somebody takes a breath a beat before the bar. It is not her breath — she is playing.',
    note: 'Somebody in the room with her, about to speak.',
  }),
  Object.freeze({
    id: 'voice',
    label: 'THE VOICE',
    line: 'It is you. You are saying something about the kettle, and she stops playing to answer you.',
    note: 'That is why the file ends there. That is the whole of it.',
  }),
]);

// He may put it down once he has heard all three. Not a number tuned for pacing
// — it is the count of passes it takes to get from "there is something on this
// bar" to "it is me".
export const PRACTICE_LISTENS_TO_STOP = PRACTICE_REVEALS.length;

// What a repetition costs. Rising, because it is rising — the hand goes, the ear
// goes, and the twelfth time through a bar is worse than the second. Capped so
// the encounter cannot become a slot machine that kills him on a bad roll.
export const PRACTICE_RETAKE_COST = Object.freeze([0, 1, 1, 2, 2, 3, 3, 4]);
export const practiceRetakeCost = (retakes) => PRACTICE_RETAKE_COST[
  Math.max(0, Math.min(PRACTICE_RETAKE_COST.length - 1, Math.trunc(Number(retakes) || 0)))
];

// The eight doors. Every one of them is somebody who did exactly this, and the
// material bleeding through the partitions is theirs — which is what makes the
// surfer's snippets diegetic in this wing and nowhere else. The histories are
// the ones already authored on the props (see conservatory-props.js).
export const PRACTICE_ROOMS = Object.freeze([
  Object.freeze({ id: 'exam-preparation', label: 'P-3', instrument: 'marimba', note: 'booked early' }),
  Object.freeze({ id: 'cello-lesson', label: 'P-5', instrument: 'violin', note: 'a lesson, two voices' }),
  Object.freeze({ id: 'piano-maintenance', label: 'P-1', instrument: 'piano', note: 'the tuned one' }),
  Object.freeze({ id: 'copied-parts', label: 'P-6', instrument: 'piano', note: 'parts copied by hand' }),
  Object.freeze({ id: 'chamber-spillover', label: 'P-2', instrument: 'violin', note: 'more players than chairs' }),
  Object.freeze({ id: 'ensemble-rehearsal', label: 'ENSEMBLE', instrument: 'marimba', note: 'the big room' }),
  Object.freeze({ id: 'hurried-departure', label: 'P-7', instrument: 'piano', note: 'left mid-bar' }),
  Object.freeze({ id: 'coat-and-bag-drop', label: 'P-8', instrument: 'violin', note: 'never practised in' }),
]);

function hash32(...parts) {
  let hash = 2166136261;
  for (const char of parts.join(':')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
const integer = (low, high, ...parts) => low + Math.floor((hash32(...parts) / 4294967296) * (high - low + 1));

export function createPracticeSession({ seed = 'practice', bars = 9 } = {}) {
  return {
    seed: String(seed),
    // The file, and the bar it ends at. `bar` is where the playhead is; it never
    // gets past `bars` because there is nothing past `bars` to get to.
    bars: Math.max(2, Math.trunc(Number(bars) || 9)),
    bar: 1,
    retakes: 0,
    listens: 0,
    // Which partition is audible this beat. Rotates so the wing sounds occupied
    // rather than aimed — nobody through those walls is doing anything to him.
    roomIndex: 0,
    // Set once he says it out loud. There is exactly one moment for this and it
    // is not a reward: see practiceStop.
    named: false,
    stopped: false,
  };
}

export const practiceRoom = (session) => PRACTICE_ROOMS[
  Math.abs(Math.trunc(Number(session?.roomIndex) || 0)) % PRACTICE_ROOMS.length
];

// Which instrument is bleeding through this beat. In this wing the instrument is
// the ROOM rather than the intent kind, because in this wing the stems are
// literally what the building held: people practising. The intent kind is still
// legible — enemyAttackVoice prints it as the verb — so nothing is lost by
// letting the sound be honest here.
export const practiceInstrument = (session) => practiceRoom(session)?.instrument || 'piano';

export function advancePracticeBeat(session) {
  if (!session) return session;
  session.roomIndex = (session.roomIndex + 1 + integer(0, 2, session.seed, 'room', session.bar, session.retakes))
    % PRACTICE_ROOMS.length;
  return session;
}

// He plays on. The playhead moves until it reaches the bar the file ends at, and
// then it is at the end, and there is nothing to play.
export function playPracticeBar(session) {
  if (!session || session.stopped) return { bar: session?.bar || 0, atEnd: false };
  session.bar = Math.min(session.bars, session.bar + 1);
  advancePracticeBeat(session);
  return { bar: session.bar, atEnd: session.bar >= session.bars };
}

// THE REFLEX. Winding back is free, always available, and costs him — which is
// the only kind of cost in this room. Nothing did this to him.
export function windPracticeBack(session) {
  if (!session || session.stopped) return { cost: 0, retakes: session?.retakes || 0 };
  const cost = practiceRetakeCost(session.retakes);
  session.retakes += 1;
  session.bar = 1;
  advancePracticeBeat(session);
  return { cost, retakes: session.retakes };
}

// THE CRAFT. He plays the bar back instead of playing over it, which costs him a
// repetition and is the only thing in the room that goes anywhere.
export function listenPracticeBar(session) {
  if (!session || session.stopped) return null;
  if (session.listens >= PRACTICE_LISTENS_TO_STOP) return PRACTICE_REVEALS[PRACTICE_REVEALS.length - 1];
  const reveal = PRACTICE_REVEALS[session.listens];
  session.listens += 1;
  // Playing a bar back leaves you at the top of the fragment, the same as any
  // other stop-and-rewind. It is a lap like the others — he has to work through
  // to the end again before the next pass is available — but it does not carry
  // the retake's cost, because this is the one repetition that is worth
  // something. That asymmetry is the whole argument the wing is making.
  session.bar = 1;
  advancePracticeBeat(session);
  return reveal;
}

export const practiceCanStop = (session) => !!session && session.listens >= PRACTICE_LISTENS_TO_STOP;

// He takes his hand off the transport, and he says her name, plainly, instead of
// playing it. Everything else in the game routes around that name — she is
// `sarah` or `unknown` depending on whether he ever named her — and this is the
// one place he says it with nothing running.
export function practiceStop(session) {
  if (!session || !practiceCanStop(session)) return false;
  session.stopped = true;
  session.named = true;
  return true;
}

// What the deck draws and what the resolve overlay reads. One object, like the
// house's snapshot, so the transport, the reveal list and the cost cannot tell
// the player three different stories.
export function practiceSnapshot(session) {
  if (!session) return null;
  const room = practiceRoom(session);
  return {
    bars: session.bars,
    bar: session.bar,
    atEnd: session.bar >= session.bars,
    retakes: session.retakes,
    // What the NEXT wind-back will cost him. Printed before he presses it,
    // because the point is that he does it anyway.
    nextCost: practiceRetakeCost(session.retakes),
    listens: session.listens,
    listensToStop: PRACTICE_LISTENS_TO_STOP,
    canStop: practiceCanStop(session),
    stopped: session.stopped,
    named: session.named,
    room: room && { id: room.id, label: room.label, instrument: room.instrument, note: room.note },
    // The passes he has already made, in order, so the deck can show what he
    // knows rather than only how far along he is.
    heard: PRACTICE_REVEALS.slice(0, session.listens).map((reveal) => ({
      id: reveal.id, label: reveal.label, note: reveal.note,
    })),
    next: session.listens < PRACTICE_REVEALS.length ? PRACTICE_REVEALS[session.listens].label : null,
  };
}
