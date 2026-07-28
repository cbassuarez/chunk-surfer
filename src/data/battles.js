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
const H = (text, id = '') => ({ text, id, kind: 'hidden' });
const G = (text, id = '') => ({ text, id, kind: 'graft' });
const reading = (id, required, forbidden = [], maxVisible = required.length, meta = {}) => ({
  id, required, forbidden, maxVisible, meaning: meta.meaning || id.replace(/[-_]/g, ' '),
  routeBias: meta.routeBias || null, grants: meta.grants || [], locks: meta.locks || [], pressureDelta: meta.pressureDelta || 0,
});
const challenge = (id, title, source, readings, opponentMoves = [], opts = {}) =>
  authorRedactionChallenge(id, source, { title, claim: opts.claim || '', readings, opponentMoves, terminal: !!opts.terminal });

function natatoriumChallenges() {
  return [
    challenge('natatorium-room', 'THE ROOM',
      'THE ROOM IS EMPTY BUT THE TAPE INSISTS SOMEONE IS WAITING IN WATER', [
        reading('empty-room', ['THE#1', 'ROOM', 'IS', 'EMPTY'], ['SOMEONE', 'WAITING', 'WATER'], 4, { meaning:'The room is empty; the tape is lying.' }),
        reading('tape-insists', ['THE#2', 'TAPE', 'INSISTS'], ['ROOM'], 3, { meaning:'The tape is making the claim, not the room.' }),
        reading('someone-waiting', ['SOMEONE', 'IS#2', 'WAITING'], ['EMPTY'], 3, { meaning:'You let the room contain somebody.', routeBias:'sacrifice', locks:['route.surfaced'], pressureDelta:1 }),
      ], [
        { blackout:['BUT'], scrape:['SOMEONE'], notice:'THE OTHER HAND RESTORES SOMEBODY TO THE EMPTY ROOM.' },
        { blackout:['EMPTY'], scrape:['WAITING'], notice:'THE OTHER HAND REMOVES EMPTY AND LEAVES WAITING.' },
      ]),
    challenge('natatorium-voice', 'THE VOICE',
      'HER VOICE IS ON THE TAPE AND THE TAPE IS NOT HER VOICE IS ONLY PRESSURE', [
        reading('voice-on-tape', ['HER#1', 'VOICE#1', 'IS#1', 'ON', 'THE#1', 'TAPE#1'], ['HER#2'], 6, { meaning:'The voice is on the tape; it is not her.' }),
        reading('only-pressure', ['VOICE#2', 'IS#3', 'ONLY', 'PRESSURE'], ['HER#2'], 4, { meaning:'The room is producing pressure, not a person.' }),
        reading('not-her', ['THE#2', 'TAPE#2', 'IS#2', 'NOT', 'HER#2'], ['VOICE#1'], 5, { meaning:'The tape is not her.' }),
      ], [
        { blackout:['NOT'], scrape:['HER#2'], notice:'THE OTHER HAND SCRAPES HER CLEAN.' },
        { blackout:['AND'], scrape:['VOICE#2'], notice:'THE OTHER HAND SCRAPES VOICE CLEAN AND LEAVES THE CLAIM OPEN.' },
      ]),
    challenge('natatorium-hold', 'THE TAKE',
      'NOTHING MOVED EXCEPT YOU TOWARDS A PIANO THAT WAS NEVER THERE HOLD THE TAKE HOLD YOURSELF', [
        reading('nothing-moved', ['NOTHING', 'MOVED'], ['YOU', 'PIANO'], 2, { meaning:'Nothing moved.' }),
        reading('piano-never-there', ['PIANO', 'WAS', 'NEVER', 'THERE'], ['YOU'], 4, { meaning:'The piano was never there.' }),
        reading('hold-take', ['HOLD#1', 'THE#1', 'TAKE'], ['YOU'], 3, { meaning:'Hold the take.' }),
      ], [
        { blackout:['NEVER'], scrape:['PIANO'], notice:'THE OTHER HAND MAKES THE PIANO POSSIBLE.' },
        { blackout:['EXCEPT'], scrape:['YOU'], notice:'THE OTHER HAND MAKES YOU THE MOVING THING.' },
      ]),
  ];
}

function practiceChallenges() {
  return [
    challenge('practice-file', 'THE FILE', [
      'THE','MUSIC','COMES','FROM','A','FILE',H('NOT','not1'),'A','ROOM','YOU','KEPT','EVERY','BREATH','AND','CALLED','THE','KEEPING','SILENCE',
    ], [
      reading('music-from-file', ['THE#1', 'MUSIC', 'COMES', 'FROM', 'A#1', 'FILE'], ['YOU'], 6, { meaning:'The music is a file.' }),
      reading('not-a-room', ['NOT', 'A#2', 'ROOM'], ['MUSIC'], 3, { meaning:'The fork reveals: this is not a room.' }),
      reading('you-kept-silence', ['YOU', 'KEPT', 'SILENCE'], ['MUSIC'], 3, { meaning:'You kept silence and called that care.', routeBias:'sacrifice', pressureDelta:1 }),
    ], [
      { blackout:['NOT'], scrape:['YOU'], notice:'THE OTHER HAND BLACKS OUT NOT AND RESTORES YOU.' },
      { blackout:['CALLED'], scrape:['KEPT'], notice:'THE OTHER HAND LEAVES KEPT IN PLACE.' },
    ], { claim:'THE FORK CAN MAKE THE FALSE WORD VISIBLE.' }),
    challenge('practice-heard', 'THE KEPT VOICE', [
      'YOU','ACCEPTED','HER','NAME','BUT','YOU','DID','NOT','HEAR','HER','YOU','KEPT','THE','SOUND','AND','LOST','WHAT','SHE','SAID',H('CONSENT','consent'),
    ], [
      reading('did-not-hear', ['YOU#2', 'DID', 'NOT', 'HEAR', 'HER#2'], ['ACCEPTED'], 5, { meaning:'Acceptance was not listening.' }),
      reading('kept-sound', ['YOU#3', 'KEPT', 'THE', 'SOUND'], ['CONSENT'], 4, { meaning:'You kept the sound.' }),
      reading('lost-what-she-said', ['LOST', 'WHAT', 'SHE', 'SAID'], ['NAME'], 4, { meaning:'The content was lost.' }),
      reading('consent-missing', ['CONSENT'], ['KEPT'], 1, { meaning:'The missing word is consent.', grants:['finale.knowsConsent'] }),
    ], [
      { blackout:['CONSENT'], scrape:['KEPT'], notice:'THE OTHER HAND REMOVES CONSENT AND RESTORES KEPT.' },
      { blackout:['NOT'], scrape:['HEAR'], notice:'THE OTHER HAND TAKES AWAY NOT.' },
    ]),
    challenge('practice-pianos', 'THE INSTRUMENTS',
      'SEVEN PIANOS WAIT WITH BROKEN STRINGS SOME STILL SOUND LIKE PIANOS NONE OF THEM KNOW THE MUSIC YOU HEAR', [
        reading('pianos-wait', ['SEVEN', 'PIANOS#1', 'WAIT'], ['YOU'], 3, { meaning:'The pianos wait; they are not playing.' }),
        reading('some-still-sound', ['SOME', 'STILL', 'SOUND', 'LIKE', 'PIANOS#2'], ['MUSIC'], 5, { meaning:'Some things still sound like themselves.' }),
        reading('none-know', ['NONE', 'OF', 'THEM', 'KNOW'], ['YOU'], 4, { meaning:'The instruments do not know the music.' }),
      ], [
        { blackout:['NONE'], scrape:['MUSIC'], notice:'THE OTHER HAND GIVES THE MUSIC BACK TO THE PIANOS.' },
        { blackout:['BROKEN'], scrape:['YOU'], notice:'THE OTHER HAND RESTORES YOU TO THE MUSIC.' },
      ]),
  ];
}

function hallChallenges() {
  return [
    challenge('hall-seat', 'THE AUDIENCE',
      'THE EMPTY HALL APPLAUDS BEFORE THE TAKE ENDS NOBODY IS SEATED NOBODY HAS HEARD YOU FINISH', [
        reading('empty-hall', ['THE', 'EMPTY', 'HALL'], ['APPLAUDS'], 3, { meaning:'The hall is empty.' }),
        reading('nobody-seated', ['NOBODY#1', 'IS', 'SEATED'], ['APPLAUDS'], 3, { meaning:'Nobody is seated.' }),
        reading('nobody-heard', ['NOBODY#2', 'HAS', 'HEARD', 'YOU', 'FINISH'], ['APPLAUDS'], 5, { meaning:'Nobody heard you finish.' }),
      ], [
        { blackout:['EMPTY'], scrape:['APPLAUDS'], notice:'THE OTHER HAND RESTORES APPLAUSE.' },
        { blackout:['BEFORE'], scrape:['YOU'], notice:'THE OTHER HAND MAKES YOU AUDIBLE.' },
      ]),
    challenge('hall-stage', 'THE STAGE', [
      'A','GRAND','PIANO','WAITS','ON','THE','STAGE','THE','LID','IS','OPEN','THE','STRINGS','ANSWER','ONLY','WHAT','ENTERS','THE','ROOM',G('RETURN','return'),G('REVERSED','reversed'),
    ], [
      reading('piano-waits', ['A', 'GRAND', 'PIANO', 'WAITS'], ['ANSWER'], 4, { meaning:'The piano waits.' }),
      reading('lid-open', ['THE#2', 'LID', 'IS', 'OPEN'], ['ANSWER'], 4, { meaning:'The lid is open; that is not action.' }),
      reading('return-reversed', ['RETURN', 'REVERSED'], ['STRINGS'], 2, { meaning:'The rig can reverse a return.', grants:['route.inversion'] }),
    ], [
      { insert:['RETURN'], blackout:['ONLY'], scrape:['ANSWER'], notice:'THE OTHER HAND WRITES RETURN AND RESTORES ANSWER.' },
      { blackout:['REVERSED'], scrape:['STRINGS'], notice:'THE OTHER HAND BLACKS OUT REVERSED.' },
    ], { claim:'THE BENT RIG CAN GRAFT SIGNAL WORDS.' }),
    challenge('hall-return', 'THE RETURN',
      'THE ROOM RETURNS EVERY SOUND SMALLER EXCEPT YOUR VOICE WHICH COMES BACK AT THE SAME LEVEL', [
        reading('room-returns-sound', ['THE', 'ROOM', 'RETURNS', 'EVERY', 'SOUND'], ['VOICE'], 5, { meaning:'The room returns sound.' }),
        reading('voice-comes-back', ['YOUR', 'VOICE', 'COMES', 'BACK'], ['SAME'], 4, { meaning:'Your voice comes back.' }),
        reading('same-level', ['THE#2', 'SAME', 'LEVEL'], ['VOICE'], 3, { meaning:'The same level is the trap.', routeBias:'sacrifice', pressureDelta:1 }),
      ], [
        { blackout:['SMALLER'], scrape:['VOICE'], notice:'THE OTHER HAND RESTORES VOICE.' },
        { blackout:['EXCEPT'], scrape:['SAME'], notice:'THE OTHER HAND LEAVES SAME LEVEL.' },
      ]),
  ];
}

function chapelChallenges(faceLabel) {
  const face = String(faceLabel || 'THE PREVIOUS RECORDIST').replace(/[^A-Z ]/g, '') || 'THE PREVIOUS RECORDIST';
  const faceWords = face.split(/\s+/).filter(Boolean);
  return [
    challenge('chapel-room', 'THE ROOM', [
      'THE','ROOM','IS','EMPTY','THE','SIGNAL','SAYS','BODY','THE','ORGAN','SAYS','INSTRUMENT',H('NOT','not'),G('PROCESS','process'),
    ], [
      reading('room-empty', ['THE#1', 'ROOM', 'IS', 'EMPTY'], ['BODY'], 4, { meaning:'The chapel is still a room.' }),
      reading('signal-not-body', ['SIGNAL', 'NOT', 'BODY'], ['INSTRUMENT'], 3, { meaning:'The signal is not a body.', grants:['route.inversion'] }),
      reading('body-instrument', ['BODY', 'INSTRUMENT'], ['EMPTY'], 2, { meaning:'You let the body become the instrument.', routeBias:'sacrifice', locks:['route.surfaced'], pressureDelta:1 }),
      reading('signal-process', ['SIGNAL', 'PROCESS'], ['BODY'], 2, { meaning:'The source is a process in signal.', grants:['route.inversion'] }),
    ], [
      { insert:['PROCESS'], blackout:['NOT'], scrape:['BODY'], notice:'THE OTHER HAND REMOVES NOT AND MAKES BODY SPEAK AGAIN.' },
      { blackout:['EMPTY'], scrape:['INSTRUMENT'], notice:'THE OTHER HAND TAKES AWAY EMPTY.' },
    ], { claim:'THE CHAPEL CLAIMS A BODY IS AN INSTRUMENT.' }),
    challenge('chapel-recordist', 'THE PREVIOUS RECORDIST', [
      ...faceWords,'VANISHED','BECAUSE','HE','AGREED','THE','BODY','IS','BORROWED','AND','RETURN','IS','POSSIBLE',H('NOT','not'),G('STILL','still'),G('HERE','here'),
    ], [
      reading('recordist-vanished', ['VANISHED'], ['BORROWED', 'RETURN'], 1, { meaning:'You accept the old absence.', locks:['route.surfaced'], routeBias:'sacrifice', pressureDelta:1 }),
      reading('he-agreed', ['HE', 'AGREED'], ['BORROWED'], 2, { meaning:'You accept the Surfer’s consent story.', locks:['route.surfaced'], routeBias:'sacrifice', pressureDelta:1 }),
      reading('body-borrowed-return', ['BODY', 'BORROWED', 'RETURN', 'POSSIBLE'], ['AGREED'], 4, { meaning:'The body is borrowed and can be returned.', grants:['route.surfaced'] }),
      reading('still-here', ['STILL', 'HERE'], ['VANISHED'], 2, { meaning:'The prior recordist is still recoverable.', grants:['route.surfaced'] }),
    ], [
      { blackout:['RETURN'], scrape:['AGREED'], notice:'THE OTHER HAND BLACKS OUT RETURN AND RESTORES AGREED.' },
      { blackout:['BORROWED'], scrape:['VANISHED'], notice:'THE OTHER HAND REMOVES BORROWED.' },
    ], { claim:'THE OTHER HAND WANTS VANISHED TO BE CLEANER THAN BORROWED.' }),
    challenge('chapel-surfer', 'THE SURFER', [
      'THE','SURFER','WAS','A','STUDENT','TRAINED','INTO','MUSIC','INSIDE','THE','FILES','MUSIC','WANTS','BODY','MACHINE','WANTS','LANGUAGE',H('NOT','not'),H('GHOST','ghost'),G('PROCESS','process'),
    ], [
      reading('student-trained', ['SURFER', 'WAS', 'A', 'STUDENT'], ['GHOST'], 4, { meaning:'The Surfer was trained, not born supernatural.' }),
      reading('music-inside-files', ['MUSIC#1', 'INSIDE', 'THE#2', 'FILES'], ['GHOST'], 4, { meaning:'The haunting lives inside files.' }),
      reading('not-ghost-process', ['NOT', 'GHOST', 'PROCESS'], ['BODY'], 3, { meaning:'Not ghost: process.', grants:['route.inversion'] }),
      reading('music-wants-body', ['MUSIC#2', 'WANTS#1', 'BODY'], ['PROCESS'], 3, { meaning:'You leave the appetite intact.', routeBias:'sacrifice', pressureDelta:1 }),
    ], [
      { blackout:['NOT'], scrape:['GHOST'], notice:'THE OTHER HAND RESTORES GHOST AND REMOVES NOT.' },
      { blackout:['PROCESS'], scrape:['BODY'], notice:'THE OTHER HAND BLACKS OUT PROCESS.' },
    ], { claim:'IT ARGUES THAT A GHOST IS EASIER THAN A MACHINE.' }),
    challenge('chapel-contract', 'THE CONTRACT', [
      'FIVE','ROOMS','CLEAN','MINUTE','SEAL','CLIENT','ACCOUNT','FEEDS','ANOTHER','BODY',H('NOT','not'),H('WORK','work'),H('ORDER','order'),G('MOUTH','mouth'),
    ], [
      reading('five-rooms', ['FIVE', 'ROOMS', 'CLEAN', 'MINUTE'], ['BODY'], 4, { meaning:'The job was five clean minutes.' }),
      reading('account-feeds-body', ['ACCOUNT', 'FEEDS', 'ANOTHER', 'BODY'], ['NOT'], 4, { meaning:'The account feeds another body.', routeBias:'sacrifice', pressureDelta:1 }),
      reading('not-work-order', ['NOT', 'WORK', 'ORDER'], ['BODY'], 3, { meaning:'The work order is not the work.', grants:['finale.knowsContract'] }),
      reading('contract-mouth', ['ACCOUNT', 'MOUTH'], ['CLEAN'], 2, { meaning:'The account is a mouth.', grants:['finale.knowsContract'] }),
    ], [
      { blackout:['NOT'], scrape:['BODY'], notice:'THE OTHER HAND MAKES BODY THE CLEANEST WORD.' },
      { insert:['MOUTH'], blackout:['CLEAN'], scrape:['ACCOUNT'], notice:'THE OTHER HAND WRITES MOUTH BUT BLACKS OUT CLEAN.' },
    ], { claim:'THE CONTRACT CLAIMS IT WAS ONLY WORK.' }),
    challenge('chapel-source', 'THE SOURCE', [
      'SOURCE','IS','ROOM','SOURCE','IS','BODY','SOURCE','IS','YOU','SILENCE','AGREES',H('NOT','not'),H('BORROWED','borrowed'),H('RETURN','return'),G('SIGNAL','signal'),G('PROCESS','process'),G('RELEASE','release'),
    ], [
      reading('source-not-body', ['SOURCE#2', 'IS#2', 'NOT', 'BODY'], ['YOU'], 4, { meaning:'The source is not the body.', grants:['route.inversion'] }),
      reading('borrowed-body-return', ['BODY', 'BORROWED', 'RETURN'], ['AGREES'], 3, { meaning:'The borrowed body can be returned.', grants:['route.surfaced'] }),
      reading('source-you', ['SOURCE#3', 'IS#3', 'YOU'], ['NOT'], 3, { meaning:'You leave yourself as the source.', routeBias:'sacrifice', locks:['route.surfaced'], pressureDelta:2 }),
      reading('signal-process-release', ['SIGNAL', 'PROCESS', 'RELEASE'], ['BODY'], 3, { meaning:'Signal process release.', grants:['route.inversion','route.surfaced'] }),
    ], [
      { blackout:['NOT'], scrape:['YOU'], notice:'THE OTHER HAND TAKES AWAY NOT AND RESTORES YOU.' },
      { blackout:['RETURN'], scrape:['BODY'], notice:'THE OTHER HAND BLACKS OUT RETURN.' },
    ], { claim:'THE SOURCE PAGE IS TRYING TO DECIDE WHAT REALITY OBEYS.', terminal:true }),
  ];
}

export function natatoriumBattle(named = false) {
  return {
    id: 'natatorium',
    enemy: 'THE SOUND OF SILENCE',
    // Not the surfer: the hush wearing the drowned pool as a shell (procedural
    // signal-being; the surfer raster is reserved for the finals). A non-surfer/
    // guard id keeps opponentArt on the procedural path.
    art: { id: 'drownedShell', mode: 'boss', caption: 'Borrowed shell / the drowned room', status: 'STILL' },
    composure: 1,
    health: 2,
    challenges: natatoriumChallenges(),
    intro: [
      { who: 'direction', text: 'Forty seconds into the take. Six metres of tile, no water, and the meter dead flat at the bottom of the scale.' },
      { who: 'direction', text: 'And then, far off, a piano. Two notes. The wrong two notes.', cue: 'piano.diegetic.01' },
      { who: 'you', text: 'There is no piano in a natatorium.' },
      { who: 'you', text: 'There is no piano in a building that has had its power off since April.' },
    ],
    rounds: [
      {
        nature: 'not there',
        threat: 0.42,
        before: [
          { who: 'direction', text: 'It comes again. Closer, or louder, or you are leaning towards it — you cannot tell which, and not being able to tell which is the whole of the problem.', cue: 'piano.diegetic.02' },
        ],
        onListen: [
          { who: 'you', text: 'No transient. No air moving. No felt on a string.' },
          { who: 'you', text: 'There is nothing there. There is nothing there and I can hear it.' },
        ],
        after: [
          { who: 'direction', text: 'The tile gives it back to you four times and each return is thinner than the last.', cue: 'piano.diegetic.03' },
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
      { who: 'direction', text: 'You move. You do not decide to; you are moving before you know it, towards a piano that is not there.', cue: 'piano.diegetic.05' },
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
    art: { id: 'tuningFork', mode: 'boss', caption: 'Reference tone / wrong music', status: 'REFERENCE' },
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
          { who: 'direction', text: 'The pianos do not move. Seven uprights, lids up, many strings popped. Some of them still sound like pianos.', cue: 'piano.diegetic.04' },
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
      { who: 'direction', text: 'Your hand is already moving towards the recorder, towards playback, towards her. You stop it. Almost.' },
      { who: 'direction', text: 'The take dies. Somewhere, a phrase you know finishes, and is not played again.' },
    ],
  };
}

export function hallBattle(named = false) {
  return {
    id:'hall',enemy:'THE HOUSE RETURN',art:{ id:'circuitBentInterface', mode:'boss', caption:'House return / monitor path', status:'SIGNAL' },composure:1,health:2,challenges:hallChallenges(),
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
      art: { id: 'recordist', mode: 'hero', caption: 'Playback / a room behind glass', status: 'PLAYBACK' },
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
    [{ who: 'surfer', text: 'It listened until language was an encumbrance. It became the music. Then it wanted a body back. You are a body.' },
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
    // The chapel is the surfer's domain — the later-gen body that grew its own
    // form. It shows the surfer raster, not a shell (the finals earn the image).
    art: { id: 'surfer', mode: 'boss', caption: 'Borrowed body / the surfer', status: 'RETURN' },
    composure: 1.25,                 // longer than the others: this is the last one
    health: 5,
    tools: { fork:true, rig:true },
    challenges: chapelChallenges(face.label),
    intro: [
      { who: 'direction', text: 'The chapel. Two banks of pews, an organ with the wind isolated, and the fifth room tone you were sent for.', cue: 'freeze' },
      { who: 'recordist', text: 'Take five.' },
      { who: 'surfer', text: 'Take five.', rate: 0.94 },
      { who: 'surfer', text: 'COME CLOSER', rate: 0.94 },
      { who: 'you', text: "There is not a person in the chapel... or there shouldn't be, but I'm getting the feeling I'm in heart of the building. Is that...? " },
      { who: 'direction', text: `It has put on a face while you were not looking. It is wearing ${face.label.toLowerCase()}.` },
    ],
    rounds: [
      {
        nature: 'not there', threat: 0.5,
        checkpoint: refuseCheckpoint,
        before: [{ who: face.who, text: offer, rate: 0.98 }],
        onListen: [
          { who: 'you', text: 'No transient. No breath. No felt, no reed, no room.' },
          { who: 'you', text: 'There is nothing there, and it is speaking to me in a voice I have missed so dearly.' },
        ],
        after: [{ who: 'direction', text: 'Back in the booth, the guard turns the television down.' }],
      },
      {
        nature: 'on the tape', threat: 0.66,
        before: [
          { who: 'recordist?', text: 'You never looked for me.' },
          { who: 'you', text: 'Sarah?' },
        ],
        onListen: [
          { who: 'you', text: 'I... what am I doing?' },
          { who: '???', text: "You know what? No. You don't get to be the victim here. I – I had hopes, I dreamed of loving you. You want points for your martyrdom?" },
          { who: 'you', text: "Don't you throw that in my face I fuck– I ca" },
          { who: 'you', text: "You what? You cared about me, just because you allowed me to transition? Oh wow! What an ally! You left! You're the one who gave up!" },
        ],
        after: [{ who: '???', text: "I thought it would be easy. I thought 'one more and we're out of here.'" }],
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
