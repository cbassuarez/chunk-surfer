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
