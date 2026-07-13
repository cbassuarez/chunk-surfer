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

import { authorRedactionChallenge } from '../game/redaction.js';

const her = (named) => (named ? 'Sarah' : 'she');
const Her = (named) => (named ? 'Sarah' : 'She');
const reading = (required, forbidden = [], maxVisible = required.length) => ({ required, forbidden, maxVisible });
const challenge = (id, source, readings, opponentMoves = []) =>
  authorRedactionChallenge(id, source, { readings, opponentMoves });

function natatoriumChallenges() {
  return [
    challenge('natatorium-room',
      'THE ROOM IS EMPTY BUT THE TAPE INSISTS SOMEONE IS STANDING IN THE WATER WAITING FOR YOU TO NAME THEM', [
        reading(['THE#1', 'ROOM', 'IS', 'EMPTY'], ['SOMEONE', 'WAITING', 'NAME'], 4),
        reading(['THE#2', 'TAPE', 'INSISTS'], ['SOMEONE', 'YOU'], 3),
      ], [
        { blackout:['BUT'], scrape:['SOMEONE'] },
        { blackout:['WATER'], scrape:['WAITING'] },
      ]),
    challenge('natatorium-voice',
      'HER VOICE IS ON THE TAPE AND THE TAPE IS NOT HER VOICE IS ONLY PRESSURE IN AN EMPTY ROOM', [
        reading(['HER#1', 'VOICE#1', 'IS#1', 'ON', 'THE#1', 'TAPE#1'], ['HER#2'], 6),
        reading(['VOICE#2', 'IS#3', 'ONLY', 'PRESSURE'], ['HER#2'], 4),
      ], [
        { blackout:['AND'], scrape:['HER#2'] },
        { blackout:['NOT'], scrape:['EMPTY'] },
      ]),
    challenge('natatorium-hold',
      'NOTHING MOVED EXCEPT YOU TOWARD A PIANO THAT WAS NEVER THERE HOLD THE TAKE HOLD THE ROOM HOLD YOURSELF', [
        reading(['NOTHING', 'MOVED'], ['YOU', 'PIANO'], 2),
        reading(['PIANO', 'WAS', 'NEVER', 'THERE'], ['YOU'], 4),
        reading(['HOLD#1', 'THE#1', 'TAKE'], ['YOU'], 3),
      ], [
        { blackout:['EXCEPT'], scrape:['YOU'] },
        { blackout:['TOWARD'], scrape:['PIANO'] },
      ]),
  ];
}

function practiceChallenges() {
  return [
    challenge('practice-file',
      'THE MUSIC COMES FROM A FILE YOU KEPT EVERY ROOM EVERY BREATH EVERY ACCIDENT AND CALLED THE KEEPING SILENCE', [
        reading(['THE#1', 'MUSIC', 'COMES', 'FROM', 'A', 'FILE'], ['YOU'], 6),
        reading(['YOU', 'KEPT', 'SILENCE'], ['MUSIC'], 3),
      ], [
        { blackout:['ACCIDENT'], scrape:['YOU'] },
        { blackout:['CALLED'], scrape:['KEPT'] },
      ]),
    challenge('practice-heard',
      'YOU ACCEPTED HER NAME BUT YOU DID NOT HEAR HER YOU KEPT THE SOUND AND LOST WHAT SHE SAID', [
        reading(['YOU#2', 'DID', 'NOT', 'HEAR', 'HER#2'], ['ACCEPTED'], 5),
        reading(['YOU#3', 'KEPT', 'THE', 'SOUND'], ['ACCEPTED'], 4),
        reading(['LOST', 'WHAT', 'SHE', 'SAID'], ['NAME'], 4),
      ], [
        { blackout:['BUT'], scrape:['ACCEPTED'] },
        { blackout:['NAME'], scrape:['HER#2'] },
      ]),
    challenge('practice-pianos',
      'SEVEN PIANOS WAIT WITH BROKEN STRINGS SOME STILL SOUND LIKE PIANOS NONE OF THEM KNOW THE MUSIC YOU HEAR', [
        reading(['SEVEN', 'PIANOS#1', 'WAIT'], ['YOU'], 3),
        reading(['SOME', 'STILL', 'SOUND', 'LIKE', 'PIANOS#2'], ['MUSIC'], 5),
        reading(['NONE', 'OF', 'THEM', 'KNOW'], ['YOU'], 4),
      ], [
        { blackout:['BROKEN'], scrape:['MUSIC'] },
        { blackout:['STRINGS'], scrape:['YOU'] },
      ]),
  ];
}

function hallChallenges() {
  return [
    challenge('hall-seat',
      'THE EMPTY HALL APPLAUDS BEFORE THE TAKE ENDS NOBODY IS SEATED NOBODY HAS HEARD YOU FINISH', [
        reading(['THE', 'EMPTY', 'HALL'], ['APPLAUDS'], 3),
        reading(['NOBODY#1', 'IS', 'SEATED'], ['APPLAUDS'], 3),
        reading(['NOBODY#2', 'HAS', 'HEARD', 'YOU', 'FINISH'], ['APPLAUDS'], 5),
      ], [{blackout:['BEFORE'],scrape:['APPLAUDS']},{blackout:['ENDS'],scrape:['YOU']}]),
    challenge('hall-stage',
      'A GRAND PIANO WAITS ON THE STAGE THE LID IS OPEN THE STRINGS ANSWER ONLY WHAT ENTERS THE ROOM', [
        reading(['A', 'GRAND', 'PIANO', 'WAITS'], ['ANSWER'], 4),
        reading(['THE#2', 'LID', 'IS', 'OPEN'], ['ANSWER'], 4),
        reading(['THE#4', 'ROOM'], ['STRINGS'], 2),
      ], [{blackout:['STAGE'],scrape:['ANSWER']},{blackout:['ONLY'],scrape:['STRINGS']}]),
    challenge('hall-return',
      'THE ROOM RETURNS EVERY SOUND SMALLER EXCEPT YOUR VOICE WHICH COMES BACK AT THE SAME LEVEL', [
        reading(['THE', 'ROOM', 'RETURNS', 'EVERY', 'SOUND'], ['VOICE'], 5),
        reading(['YOUR', 'VOICE', 'COMES', 'BACK'], ['SAME'], 4),
        reading(['THE#2', 'SAME', 'LEVEL'], ['VOICE'], 3),
      ], [{blackout:['SMALLER'],scrape:['VOICE']},{blackout:['EXCEPT'],scrape:['SAME']}]),
  ];
}

function chapelChallenges(faceLabel) {
  const face = String(faceLabel || 'THE PREVIOUS RECORDIST').replace(/[^A-Z ]/g, '') || 'THE PREVIOUS RECORDIST';
  return [
    challenge('chapel-body',
      `${face} SAYS THE RECORDING NEEDS A BODY BUT A RECORDING NEEDS ONLY A ROOM AND TIME`, [
        reading(['A#2', 'RECORDING#2', 'NEEDS#2', 'ONLY', 'A#3', 'ROOM'], ['BODY'], 6),
        reading(['A#1', 'RECORDING#1', 'NEEDS#1', 'TIME'], ['BODY'], 4),
      ], [{ blackout:['SAYS'], scrape:['BODY'] }, { blackout:['BUT'], scrape:['NEEDS#1'] }]),
    challenge('chapel-face',
      'A FACE IN THE SIGNAL IS STILL A SIGNAL A VOICE IN THE ROOM IS STILL A ROOM', [
        reading(['A#1', 'FACE', 'IN#1', 'THE#1', 'SIGNAL#1', 'IS#1', 'STILL#1', 'A#2', 'SIGNAL#2'], ['VOICE'], 9),
        reading(['A#3', 'VOICE', 'IN#2', 'THE#2', 'ROOM#1', 'IS#2', 'STILL#2', 'A#4', 'ROOM#2'], ['FACE'], 9),
      ], [{ blackout:['FACE'], scrape:['VOICE'] }, { blackout:['IS#1'], scrape:['FACE'] }]),
    challenge('chapel-loss',
      'EVERYBODY HAS LOST SOMEBODY IT SAYS NOBODY IS REQUIRED FOR AN EMPTY ROOM TO REMAIN EMPTY', [
        reading(['NOBODY', 'IS', 'REQUIRED'], ['LOST', 'SOMEBODY'], 3),
        reading(['AN', 'EMPTY#1', 'ROOM', 'TO', 'REMAIN', 'EMPTY#2'], ['SOMEBODY'], 6),
      ], [{ blackout:['EVERYBODY'], scrape:['SOMEBODY'] }, { blackout:['SAYS'], scrape:['LOST'] }]),
    challenge('chapel-five',
      'FIVE ROOMS WERE RECORDED FOUR BY HIM ONE BY YOU THE FIFTH CONTAINS ONLY THE PERSON HOLDING THE RECORDER', [
        reading(['FIVE', 'ROOMS', 'WERE', 'RECORDED'], ['HIM', 'YOU'], 4),
        reading(['THE#1', 'FIFTH', 'CONTAINS', 'ONLY', 'THE#2', 'PERSON', 'HOLDING', 'THE#3', 'RECORDER'], ['HIM'], 9),
      ], [{ blackout:['FOUR'], scrape:['HIM'] }, { blackout:['ONE'], scrape:['YOU'] }]),
    challenge('chapel-nothing',
      'THE ORGAN SOUNDS WITHOUT WIND THE METER READS NOTHING HOLD NOTHING LONG ENOUGH AND NOTHING HAS TO ANSWER', [
        reading(['THE#2', 'METER', 'READS', 'NOTHING#1'], ['ORGAN'], 4),
        reading(['HOLD', 'NOTHING#2', 'LONG', 'ENOUGH'], ['ANSWER'], 4),
        reading(['NOTHING#3', 'HAS', 'TO', 'ANSWER'], ['ORGAN'], 4),
      ], [{ blackout:['WIND'], scrape:['ORGAN'] }, { blackout:['WITHOUT'], scrape:['ANSWER'] }]),
  ];
}

export function natatoriumBattle(named = false) {
  return {
    id: 'natatorium',
    enemy: 'THE SOUND OF SILENCE',
    composure: 1,
    health: 2,
    challenges: natatoriumChallenges(),
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
    health: 2,
    challenges: practiceChallenges(),
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
          { who: 'sarah', text: "You kept them. You keep rooms nobody will stand in again. You kept me the same way. You think accepting my transition is some noble work but you couldn't accept any other part of me." },
        ],
        onListen: [
          { who: 'you', text: "She is not here. She is on a drive, in a box... you're hallucinating again. You can stop it." },
        ],
        after: [
          { who: 'direction', text: 'The pianos do not move. Seven uprights, lids up, many strings popped. Some of them still sound like pianos.' },
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

export function hallBattle(named = false) {
  return {
    id:'hall',enemy:'THE HOUSE RETURN',composure:1,health:2,challenges:hallChallenges(),
    intro:[
      {who:'direction',text:'The hall takes your silence and returns it from the stage, the balconies, and the empty seats.'},
      {who:'you',text:'That is a return. That is architecture. Keep it architecture.'},
      named?{who:'sarah',text:'You always did like a room that answered for me.'}:{who:'direction',text:'A voice uses the return without entering the room.'},
    ],
    win:[
      {who:'you',text:'Empty hall. Empty stage. A long return and nothing inside it.'},
      {who:'direction',text:'The last reflection decays below the machine noise.'},
    ],
    lose:[
      {who:'direction',text:'You answer the return. The hall keeps the answer.'},
      {who:'direction',text:'The take dies with a full house listening.'},
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

export function natatoriumPlayback(named = false) {
  return {
    start:{
      speaker:'PLAYBACK · THE NATATORIUM',
      lines:[
        {who:'direction',text:'The drained pool plays back as six metres of tile and a noise floor with nowhere to go.'},
        {who:'direction',text:'Under it: one wet footstep from the bottom of a basin that has been dry since April.'},
        {who:'you',text:'I was on the deck. I never went down there.'},
        named?{who:'sarah',text:'Play it again.'}:{who:'direction',text:'The footstep happens again without the transport moving.'},
      ],
      choices:[{text:'play the step once more',goto:'again'},{text:'stop playback',goto:'off'}],
    },
    again:{
      speaker:'PLAYBACK · THE NATATORIUM',
      lines:[
        {who:'direction',text:'One step. Then the small sound of somebody deciding not to take another.'},
        {who:'you',text:'That is not in the room. It is on the take. Those are different problems.'},
      ],goto:'off',
    },
    off:{speaker:'PLAYBACK · THE NATATORIUM',lines:[{who:'direction',text:'You stop the tape. The basin remains empty.'}]},
  };
}

// ── take 5 · the chapel · the confrontation ──────────────────────────────────
// Both of them: the recordist who did not come out, and the Chunk Surfer that is
// sounding out of him — one voice each (recordist / surfer). It wears whatever
// you said in the dark eleven seconds after the door: named Sarah, it is Sarah;
// gave a reason, it gives the reason back; gave nothing, it arrives as the last
// recordist. The fight is turn-based and its checkpoints do not reward. The
// RIGHT read is always the professional refusal — "it is a recording, there is
// nothing there" — and the WRONG read is to accept the wound it is offering,
// which is the whole thesis: the genre wants you to have lost someone, and the
// recordist has not, and saying you have is what feeds it.
//
// Surviving hands to the ending choice (main.js): feed it → the sacrifice; or,
// only if you took the bent rig, invert the signal → the inversion.
export function chapelBoss({ kind = 'nothing', value = null, listened = 5 } = {}) {
  const named = kind === 'name' && value === 'Sarah';
  const wearsName = kind === 'name' && value && value !== 'nobody';
  const wearsReason = kind === 'reason';
  const wearsFeeling = kind === 'feeling';
  // What it puts on. `who` picks the voice/label the confrontation speaks in.
  const face = named ? { label: 'SARAH', who: 'sarah' }
    : wearsName ? { label: 'A WOMAN YOU KNOW', who: 'sarah' }
      : wearsReason ? { label: 'THE REASON YOU CAME', who: 'surfer' }
        : wearsFeeling ? { label: 'WHAT YOU WOULD NOT NAME', who: 'surfer' }
          : { label: 'THE PREVIOUS RECORDIST', who: 'recordist' };
  // The thing it offers you to accept — the wound the genre demands.
  const wound = named ? 'that you lost Sarah'
    : wearsName ? 'that you lost her'
      : wearsReason ? (value === 'money' ? 'that you did this for the money and hated yourself for it'
        : value === 'superstition' ? 'that you always knew this building was wrong'
          : 'that the work was ever about anything but the work')
        : wearsFeeling ? 'that you have been carrying something into every empty room for years'
          : 'that you are him, and that this is where you were always going to end';
  const offer = named ? 'I am Sarah. You came in and you looked for me.'
    : wearsName ? 'I am her. You came in and you looked for me.'
      : wearsReason ? 'Say the reason again. Say it the way you said it in the dark.'
        : wearsFeeling ? 'You felt it at the door. Name it now and I will be it.'
          : 'You know this coat. You were always going to be wearing it.';

  const CP = (prompt, options) => ({ prompt, options });
  // A checkpoint: the refusal is neutral; taking the wound multiplies threat.
  const refuseCheckpoint = CP(
    [{ who: face.who, text: offer }, { who: 'direction', text: 'It is waiting for you to agree with it. Agreeing is the only thing it cannot do for itself.' }],
    [
      { text: 'It is a recording of a room. Nothing is in here.', harder: 1.0 },          // right: hold the line
      { text: `Say it: ${wound}.`, harder: 1.5 },                                          // wrong: feed it
      { text: 'Who did you lose. — Nobody. I have not lost anybody.', harder: 1.0 },       // right: the refusal
    ],
  );
  const secondCheckpoint = CP(
    [{ who: 'surfer', text: 'It listened to the music so hard it became the music. Then it wanted a body back. You are a body.' },
     { who: 'direction', text: 'The organ blower is off and the organ is sounding anyway.' }],
    [
      { text: 'That is on the file. That is not a person in a room.', harder: 1.0 },
      { text: 'Give it what it wants and it will stop.', harder: 1.6 },                     // bargaining feeds it
      { text: 'Hold the take. Say nothing. Let it be nothing.', harder: 1.0 },
    ],
  );

  return {
    id: 'chapel',
    enemy: face.label,
    composure: 1.25,                 // longer than the others: this is the last one
    health: 3,
    challenges: chapelChallenges(face.label),
    intro: [
      { who: 'direction', text: 'The chapel. Two banks of pews, an organ with the wind isolated, and the fifth room tone you were sent for.', cue: 'freeze' },
      { who: 'recordist', text: 'Take five.' },
      { who: 'surfer', text: 'Take five.', rate: 0.94 },
      { who: 'you', text: 'There are two of them in here and one of them is me in eleven years.' },
      { who: 'direction', text: `It has put on a face while you were not looking. It is wearing ${face.label.toLowerCase()}.` },
    ],
    rounds: [
      {
        nature: 'not there', threat: 0.5,
        checkpoint: refuseCheckpoint,
        before: [{ who: face.who, text: offer, rate: 0.98 }],
        onListen: [
          { who: 'you', text: 'No transient. No breath. No felt, no reed, no room.' },
          { who: 'you', text: 'There is nothing there, and it is speaking to me in a voice I have missed.' },
        ],
        after: [{ who: 'direction', text: 'The pews return it four times, and each return is more certain than you are.' }],
      },
      {
        nature: 'on the tape', threat: 0.66,
        before: [
          { who: 'recordist', text: 'I did the first four. You did the chapel. They said it did not matter who, so long as it was somebody.' },
          { who: 'you', text: '...four and one. Yours and mine. It overlapped.' },
        ],
        onListen: [
          { who: 'you', text: 'That is a take. That is a level and a room and a date, and the date is wrong by eleven years.' },
          { who: 'you', text: 'He is not haunting me. He is the reference file, and I am the room he is playing in.' },
        ],
        after: [{ who: 'recordist', text: 'One more and I am out of here. That is what I said too.' }],
      },
      {
        nature: 'not there', threat: 0.8,
        checkpoint: secondCheckpoint,
        before: [{ who: face.who, text: `Then bring me one. Bring me the one you lost and I will let the rest of it be nothing.`, rate: 0.97 }],
        onListen: [
          { who: 'you', text: `It wants me to agree ${wound}.` },
          { who: 'you', text: 'I record rooms with nobody in them. It never once occurred to me that this suited me. That is not a wound. That is a man who is bad at something.' },
        ],
        after: [{ who: 'direction', text: 'The meter, which has never lied to you, sits flat at the bottom of the scale.' }],
      },
      {
        nature: 'not there', threat: 0.92,
        before: [
          { who: 'surfer', text: 'Everybody has lost somebody.' },
          { who: 'me', text: 'No.' },
          { who: 'surfer', text: '...no?' },
          { who: 'me', text: 'No. I came here to record five rooms. I have recorded five rooms.' },
        ],
        onListen: [
          { who: 'you', text: 'It is not in the room. It is not on the tape. It was never in the signal at all.' },
          { who: 'you', text: `Five of five listened. ${listened >= 5 ? 'So did it. It has been at the level of the room the whole time.' : 'And the last one is this.'}` },
        ],
        after: [{ who: 'direction', text: 'It has run out of faces to wear. There is only the one it started with, which is his.' }],
      },
    ],
    win: [
      { who: 'you', text: 'Nothing there. Hold it. Five clean rooms and the last one has only me in it.' },
      { who: 'direction', text: 'The organ stops. The face it was wearing does not come off so much as stop being worn. Both of them are looking at you now, and it is your move.' },
    ],
    lose: [
      { who: 'direction', text: 'You agree with it. You do not decide to; you are nodding before you know it.' },
      { who: face.who, text: 'There. That did not cost you anything you were using.' },
      { who: 'direction', text: 'The take dies. It has a body back, and the body is yours, and it fits.' },
    ],
  };
}
