// The battles. Self against self, in a drained pool.
//
// See game/battle.js for the machine. A battle is:
//   { id, enemy, composure, intro, rounds:[{ nature, threat, before, onListen?,
//     after? }], win, lose }
//
// Sarah. She is not a monster and she is not a memory that jumps out of a
// cupboard. She is his wife, she is trans, and the way that lives in the
// writing is through the one thing he is worst at: he records rooms with nobody
// in them for a living, and it never once occurred to him that this suited him.
// She hated being played back. He is a professional listener who did not listen
// to her, and the game lets him work that out in a place with six metres of
// tile and no water in it, which returns everything he says to him four times.
//
// `named` is `confession.kind === 'name' && value === 'Sarah'` — whether he
// said her name out loud in the dark, eleven seconds after the door went. It
// does not add Sarah. It changes the temperature of a scene that happens either
// way. Naming her lets it use her name; not naming her makes it a woman the
// game will not name, whom he plainly knows and the player plainly does not.

const her = (named) => (named ? 'Sarah' : 'she');
const Her = (named) => (named ? 'Sarah' : 'She');

export function natatoriumBattle(named = false) {
  return {
    id: 'natatorium',
    enemy: 'THE SOUND OF SILENCE',
    composure: 1,
    intro: [
      { who: 'direction', text: 'Forty seconds into the take. Six metres of tile, no water, and the meter dead flat at the bottom of the scale.' },
      { who: 'direction', text: 'And then, far off, a piano. Two notes. The wrong two notes.' },
      { who: 'you', text: 'There is no piano in a natatorium.' },
      { who: 'you', text: 'There is no piano in a building that has had its power off since April.' },
    ],
    rounds: [
      {
        nature: 'not there',
        threat: 0.42,
        before: [
          { who: 'direction', text: 'It comes again. Closer, or louder, or you are leaning toward it — you cannot tell which, and not being able to tell which is the whole of the problem.' },
        ],
        onListen: [
          { who: 'you', text: 'No transient. No air moving. No felt on a string.' },
          { who: 'you', text: 'There is nothing there. There is nothing there and I can hear it.' },
        ],
        after: [
          { who: 'direction', text: 'The tile gives it back to you four times and each return is thinner than the last.' },
        ],
      },
      {
        nature: 'on the tape',
        threat: 0.6,
        before: [
          { who: 'sarah', text: 'Don’t record this.', rate: 0.98 },
          { who: 'me', text: "I'm not recording." },
          { who: 'sarah', text: "You're always recording." },
          { who: 'direction', text: 'She is right. The meter is moving.' },
        ],
        onListen: [
          { who: 'you', text: 'That is a take. That is a level and a room and a date, and I made it, and I do not remember making it.' },
          { who: 'you', text: `${Her(named)} hated the playback. Six years of rooms with nobody in them, and I never once asked myself why that suited me.` },
        ],
        after: [
          { who: 'you', text: `I recorded ${her(named)} for three years and I called it not recording.` },
        ],
      },
      {
        nature: 'not there',
        threat: 0.72,
        before: [
          { who: 'sarah', text: 'You never played me back. Not once. I used to think it was kindness.', rate: 0.97 },
          { who: 'me', text: 'It was. You hated it.' },
          { who: 'sarah', text: 'I hated hearing myself. You liked that I hated it. It meant you got to keep me the way you kept a room.' },
        ],
        onListen: [
          { who: 'you', text: 'She is not in the room. She is not on the tape. She was never in the signal at all.' },
          { who: 'you', text: 'I brought her in here. This is the one recording I have ever made that has me all over it.' },
        ],
        after: [
          { who: 'direction', text: 'The meter, which has never lied to you, sits at the bottom of the scale, and there is nobody in the room but you.' },
        ],
      },
    ],
    win: [
      { who: 'you', text: 'Nothing there. Hold the take. Forty-five seconds, and the last five are the ones that count.' },
      { who: 'direction', text: 'The tile stops answering. The meter holds. You have a clean minute of a room with only you in it, which is the job, which was always the job.' },
    ],
    lose: [
      { who: 'direction', text: 'You move. You do not decide to; you are moving before you know it, toward a piano that is not there.' },
      { who: 'direction', text: 'The take dies. Somewhere far off, satisfied, the room stops playing.' },
    ],
  };
}

// ── take 4 · the practice wing · a battle AND a playback ─────────────────────
// The during-take battle. A mixed practice suite, open pianos, and far-off music that should
// not exist because there are no players and there is no power. Is it a
// recording? Whose? The Sarah beat here is the worst one: not that he did not
// listen to her, but that he KEPT her — hours of her, on tape, that she never
// agreed to.
export function practiceBattle(named = false) {
  return {
    id: 'practice',
    enemy: 'THE SOUND OF SILENCE',
    composure: 1,
    intro: [
      { who: 'direction', text: 'Forty seconds into the take. Eight practice rooms and the ensemble room off one corridor, every door open. Seven uprights with their lids up; stands and cases in the rooms without them.' },
      { who: 'direction', text: 'And then, far off, music. Not a note struck — music, playing, the way it plays from another room in a house.' },
      { who: 'you', text: 'There is no power in this building. There is no one in this building.' },
      { who: 'you', text: 'Is it a recording. It sounds like a recording. Whose recording.' },
    ],
    rounds: [
      {
        nature: 'on the tape',
        threat: 0.46,
        before: [
          { who: 'direction', text: 'It resolves, for a second, into something you know. A phrase. A room, years ago, a phone left running on a table.' },
        ],
        onListen: [
          { who: 'you', text: 'That is off a file. That is off one of my files. I have it. It is on a drive in a box in a spare room.' },
          { who: 'you', text: `I recorded ${her(named)} for three years and called it not recording, and I kept every second of it.` },
        ],
        after: [
          { who: 'you', text: 'She never once said I could. It never once occurred to me to ask.' },
        ],
      },
      {
        nature: 'not there',
        threat: 0.6,
        before: [
          { who: 'sarah', text: 'You have hours of me. You know that, don’t you. Hours.', rate: 0.97 },
          { who: 'me', text: 'They’re just — they’re the house. You in the house. I never did anything with them.' },
          { who: 'sarah', text: 'You kept them. You keep rooms nobody will stand in again. You kept me the same way.' },
        ],
        onListen: [
          { who: 'you', text: 'She is not here. She is on a drive, in a box, and I brought the sound of her into a room that wanted exactly that.' },
        ],
        after: [
          { who: 'direction', text: 'The pianos do not move. Seven uprights, lids up, waiting for something to happen. The stands in the empty rooms do not move either.' },
        ],
      },
      {
        nature: 'not there',
        threat: 0.72,
        before: [
          { who: 'sarah', text: 'Play one back. Go on. You never would, when I could hear you do it.', rate: 0.95 },
          { who: 'you', text: 'No.' },
          { who: 'sarah', text: 'Because then it would be me, and you would have to have heard me, and you never did.' },
        ],
        onListen: [
          { who: 'you', text: 'Nothing there. Nothing in the room. The room is empty and I filled it, and I am the only thing on this take.' },
        ],
        after: [
          { who: 'you', text: 'Hold it. Hold the take. Do not give it what it is asking for.' },
        ],
      },
    ],
    win: [
      { who: 'you', text: 'Nothing there. Hold still. Sixty seconds, and the last five are the ones that count.' },
      { who: 'direction', text: 'The far room stops playing. The pianos are pianos. The empty rooms are empty. You have a clean minute of a wing with only you in it, and a box at home you are going to open when you get back, and delete.' },
    ],
    lose: [
      { who: 'direction', text: 'Your hand is already moving toward the recorder, toward playback, toward her. You stop it. Almost.' },
      { who: 'direction', text: 'The take dies. Somewhere, a phrase you know finishes, and is not played again.' },
    ],
  };
}

// ── the playback dialogs ─────────────────────────────────────────────────────
// Take 3 (the concert hall) and take 4 (the practice wing) get a DIALOG when
// you play them back — the "contains what you did not hear" beat, extended into
// a scene. These are conversation trees, not composure battles: nothing is at
// stake but what he lets himself understand.
//
// Concert hall: she told him something once, in a hall like this, and he
// recorded it instead of hearing it. Now the recording is all he has, and the
// recording is playing it back at him.
export function hallPlayback(named = false) {
  return {
    start: {
      speaker: 'PLAYBACK · THE CONCERT HALL',
      lines: [
        { who: 'direction', text: 'The take rolls. A hall holding its breath, minus fifty-four, and then, under the noise floor, coming up, her.' },
        { who: 'sarah', text: 'You’re not even here. You’re behind the glass. You’re always behind the glass.', rate: 0.96 },
        { who: 'you', text: 'She said that to me in a hall like this. Row F. I had the recorder on my knee.' },
        { who: 'you', text: 'I have it. I have the exact sentence, at minus fifty-four, and I have never once been able to tell you what it was about.' },
      ],
      choices: [
        { text: 'because you were recording it', goto: 'recording' },
        { text: 'turn it off', goto: 'off' },
      ],
    },
    recording: {
      speaker: 'PLAYBACK · THE CONCERT HALL',
      lines: [
        { who: 'you', text: 'I was setting a level. She was telling me something that mattered and I was watching a meter.' },
        { who: 'sarah', text: 'You got a beautiful take of it. You always do.', rate: 0.95 },
        { who: 'you', text: 'It is the best recording I own. I could not tell you a word she said.' },
      ],
      goto: 'off',
    },
    off: {
      speaker: 'PLAYBACK · THE CONCERT HALL',
      lines: [
        { who: 'direction', text: 'You take the headphones off. The hall is exactly as empty as it was.' },
        { who: 'you', text: 'Two rooms left.' },
      ],
    },
  };
}

// Practice wing: the plainest and the worst. He kept her, on tape, for years,
// and never asked, and never played it back where she could hear — and the
// playback is where he finally does, to nobody, too late.
export function practicePlayback(named = false) {
  return {
    start: {
      speaker: 'PLAYBACK · THE PRACTICE WING',
      lines: [
        { who: 'direction', text: 'The take rolls. Eight practice rooms and an ensemble room of nothing, and then, rising, a kitchen. A tap. Her, humming, not knowing she is on.' },
        { who: 'you', text: 'That is the box in the spare room. That is a Tuesday. She is doing the washing up.' },
      ],
      choices: [
        { text: 'listen to it', goto: 'listen' },
        { text: 'you never let her hear these', goto: 'never' },
        { text: 'turn it off', goto: 'off' },
      ],
    },
    listen: {
      speaker: 'PLAYBACK · THE PRACTICE WING',
      lines: [
        { who: 'sarah', text: 'This is nice. You’re not recording, are you.', rate: 0.97 },
        { who: 'me', text: 'No.' },
        { who: 'direction', text: 'He was recording. It is why he can hear her now.' },
        { who: 'you', text: 'I have hundreds of these. She is on hundreds of these and she is gone and I still have her voice and she never once got to decide that.' },
      ],
      goto: 'off',
    },
    never: {
      speaker: 'PLAYBACK · THE PRACTICE WING',
      lines: [
        { who: 'you', text: 'She hated being played back. Hearing herself. So I never did it in front of her. I told myself that was kindness.' },
        { who: 'you', text: 'It was not kindness. It was that I got to keep her the way I keep a room — exactly, forever, and without ever having to ask.' },
      ],
      goto: 'off',
    },
    off: {
      speaker: 'PLAYBACK · THE PRACTICE WING',
      lines: [
        { who: 'direction', text: 'You take the headphones off. There is one room left, and it is the fifth room, and it is his.' },
      ],
    },
  };
}

// ── take 5 · the chapel · the boss ───────────────────────────────────────────
// SCAFFOLD ONLY. The confrontation is built separately, with the endings. It is
// both of them — the recordist and the Chunk Surfer, one voice each, already
// wired (recordist / surfer). What it offers is `confession.kind`/`value`, and
// it spends the approved `battle` lens preset exactly once. Do not flesh this
// out here; it belongs with M5.
export const CHAPEL_BOSS = {
  id: 'chapel',
  scaffold: true,
};
