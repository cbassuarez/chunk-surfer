// Everything anyone says.
//
// The client speaks once, in a work order, and never again. The previous
// recordist speaks ten times, in his own notes, to himself. Nobody in this
// building explains anything to the player, because nobody in this building
// knows the player is there.
//
// Three rules held the whole way through:
//
//   · The pages are USEFUL. He was good at his job. Early pages are accurate
//     and will save you time. Later pages describe doors that are bricked and
//     a stair that is gone — because the building has moved since he wrote
//     them, and for no other reason. He never lies and he is never confused.
//     The reader arrives at "he was right and the building changed" on their
//     own, which is the only way anyone believes anything.
//
//   · Nobody has a wound. The recordist has no dead sister. The previous
//     recordist has no dead sister. The client is a company. What the building
//     asks for is not grief, and the last recordist gave it something anyway.
//
//   · He never says what he did. Not obliquely, not in a torn-off corner, not
//     in a last page written in a different hand. The genre's whole apparatus
//     is a slow reveal of the deed. There is no deed here to reveal. There is
//     a man who took a contract, and a building that wanted one thing, and a
//     transaction that closed.
//
// LEGACY PAGE DECAY: `decay` is retained as authored compatibility metadata.
// The offline paper compiler maps it to a physical reproduction profile
// (handled original / copy generation); runtime code never erodes or rewrites
// these strings. It is production history, and it says nothing about his mind.

export const WORK_ORDER = {
  id: 'work-order',
  title: 'Work Order 4417-C',
  byline: 'ARCHIVAL CAPTURE — issued to the contractor named below',
  decay: 0,
    dismiss: '[ esc — fold it and put it in your pocket ]',
    paper: {
      marks: [
        { page: 2, type: 'underline', x: 0.145, y: 0.505, w: 0.43, alpha: 0.50 },
        { page: 2, type: 'note', x: 0.705, y: 0.555, text: '5?', rotate: -7, alpha: 0.58 },
      ],
    },
    body: [
    { raw: 'SITE      Ellery Conservatoire of Music (condemned)' },
    { raw: 'ADDRESS   Ellery Collegiate Buildings — ENGLAND' },
    { raw: 'WINDOW    one night. Demolition begins 06:00 Thursday.' },
    { raw: 'DELIVER   five room tones. Sixty seconds each, unbroken.' },
    '',
    { rule: true },
    '',
    'The building has already been powered down. Bring a light.',
    '',
    'We need the rooms as they are. One clean minute of each, with nothing in it. No handling noise, no clothing, no breath. If you can hear yourself on the take, the take is not the room, and we will not accept it.',
    '',
    'Record: studio B3, the natatorium, the concert hall, the practice wing, and the chapel. Work in whatever order the building permits. It has been altered since the drawings were filed and we do not have current drawings, our apologies.',
    '',
    'You carry the standard key ring. Where it does not open a door, try another route; we concede these buildings are rather old, you may be able to find other pathways where a key does not open a particular door. Do not force anything. Everything here is due to come down regardless, and we are most definitely not paying for a wall.',
    '',
    'Check in on the hour by radio.',
    '',
    { rule: true },
    '',
    'The prior contractor delivered four accepted room tones. The packet was settled for four. The account remains open. We want 5 clean recordings, and it seems the fifth was undelivered.',
    '',
    'Do not provide supplemental material. Do not annotate the takes. Do not describe the building. Acceptance is based on clean minutes received, not on conditions encountered.',
    '',
    'When five clean minutes are received, the account is satisfied.',
    '',
    { raw: '                              W. Ellery Holdings, per pro.' },
    { raw: '                              (signature illegible)' },
  ],
};

// ── the cold open ───────────────────────────────────────────────────────────
// A service booth at twenty to ten, a man with a form, and a pen that does not
// work. Nothing here is ominous. The guard is bored, and being bored is a full
// time job, and he is good at it.
//
// Rules for every line below, because it is very easy to write this badly:
//
//   · NOBODY IS AN AUTHOR. No aphorisms, no line that would look good on a
//     poster. The guard talks about pens because a man in a booth at that hour
//     talks about pens. What he knows, he mentions the way you mention weather,
//     and he does not notice which part of it was terrible.
//
//   · THE RECORDIST TALKS LIKE A PERSON. He has done this four hundred times.
//     He says "yeah" and "hang on". His trade shorthand is real shorthand, and
//     he only uses it with people who would know it, which the guard does not.
//
//   · NO BODY HAS FEELINGS ABOUT IT. Keys do not land with authority, booths
//     do not display nothing, files do not hold their breath. Things are heavy
//     or they are not.
//
// A MOUTH SPEAKS; A MIND TYPES. `me` is the recordist out loud, and it is the
// only voice in the game heard through nothing at all. `you` is the same man
// thinking, and it is typed, because nobody in the room can hear it. So: he
// says `me` lines to the guard and into the radio, and he thinks `you` lines
// while reading the order and while alone in the dark. Getting this backwards
// makes him either a mute or a man muttering at a stranger.
//
// THE TAPE. The third trunk is where the game says what it is about, and it
// says it in the only place it is allowed to: inside a recording, to somebody
// else, five weeks ago. The thing on the tape wants the genre's premise. It
// asks for a dead woman to be. The man on the tape does not have one, and it
// keeps asking, because the demand is the horror and the grief was always the
// cover story.

// COLD_OPEN_DIALOGUE moved out of source. The cold open is now authored
// directly as the single source of record in the studio document
// content/narrative/conservatory.cold_open_dialogue.story.json (+ its
// .layout.json), which the runtime plays via the generated content registry.
// The voice rules above still govern it. There is no longer a JS mirror to
// keep in sync, and no studio:import step for this scene.
// ── the thought trees ───────────────────────────────────────────────────────
// Four of these, drawn over the live world (game/thoughts.js). The building
// does not stop while he thinks. Neither does the thing in it.
//
// THE CONFESSION. He talks aloud in an empty building to steady himself. He is
// alone, so it costs nothing, and this is the first noise he makes on purpose.
// The building changes where it has not been heard, and it has just heard him.
//
// Which question he asks himself depends on what he did at the booth, and the
// mapping is not arbitrary:
//
//   read the order   →  WHY he does not leave. He thinks in money and nouns.
//   talked to the man →  WHO would notice. He watched a finger run up a column
//                        to an empty checkbox marked RETURNED.
//   heard the tape    →  WHAT he is feeling. He has already been asked who he
//                        lost, and he said no, so that is the one question he
//                        will not put to himself. He deflects.
//
// Each writes confession.kind ∈ {reason, name, feeling, nothing}. The building
// uses it later, in the playback, under the noise floor.

const PUSH_BAR = [
  { who: 'direction', text: 'You reach back for the push bar instinctively.' },
  { who: 'direction', text: 'Painted breeze block, cold, and a seam of mortar where your thumb expects a steel push bar.' },
  { who: 'you', text: 'Hmmph.' },
  { who: 'direction', text: 'You go along the wall with the flat of your hand. Two metres to the left, and back to the right.' },
  { who: 'you', text: "Oh Christ oh fuck oh God I came in eleven seconds ago and I have already lost my exit, great great great great grea-" },
  { who: 'direction', text: "Don't panic." },
  { who: 'you', text: "Alright, let's take a breath." },
];

const STEEL_YOURSELF = [
  { who: 'you', text: "I'll find it on the way out, when I'm not standing here like this. When I'm not in the middle of a room with my torch off." },
  { who: 'direction', text: 'Which is true. It is also exactly the reasoning that keeps a man *inside* a building and not darting back home to the kind of cotidian safety only jaffa cakes and Mr. Whiskers can provide.' },
  { who: 'direction', text: 'But for now, you trudge along in the dark.' },
  { who: 'you', text: "Speaking of, let's find that torch. It should be in my bag, I just had it a second ago." },
];

export const POST_DOOR = {
  // ── he read the paperwork: why he does not leave ─────────────────────────
  self: {
    speaker: '',
    art: { id: 'door', mode: 'hero', caption: 'The push bar is not where the push bar is.', status: 'THRESHOLD' },
    lines: [
      ...PUSH_BAR,
      ...STEEL_YOURSELF,
      { who: 'you', text: 'Say it out loud. It works. It has always worked, and there is nobody here to hear it.' },
    ],
    choices: [
      { text: '"I want to hear that natatorium. Six metres of tile and no water."',
        goto: 'done', set: ['confession.kind=reason', 'confession.value=craft'] },
      { text: '"Four hundred quid. I am not walking out on a paid job."',
        goto: 'done', set: ['confession.kind=reason', 'confession.value=money'] },
      { text: '"You don\'t leave a building angry. You finish, and you thank it."',
        goto: 'done', set: ['confession.kind=reason', 'confession.value=superstition'] },
      { text: '(say nothing. get the torch.)',
        goto: 'done', set: ['confession.kind=nothing'] },
    ],
  },

  // ── he talked to the guard: who would notice ─────────────────────────────
  guard: {
    speaker: '',
    art: { id: 'door', mode: 'hero', caption: 'The door is behind you now.', status: 'THRESHOLD' },
    lines: [
      ...PUSH_BAR,
      ...STEEL_YOURSELF,
      { who: 'you', text: 'There is a box in that book with his name on it and nothing written in it.' },
      { who: 'you', text: 'Say something. Out loud. Your own voice in a room is the oldest trick there is.' },
    ],
    choices: [
      { text: '"Nobody\'s expecting me till Thursday. That\'s fine. That has always been fine."',
        goto: 'done', set: ['confession.kind=name', 'confession.value=nobody'] },
      { text: '"Sarah\'ll have gone up. She won\'t check the drive till morning."',
        goto: 'done', set: ['confession.kind=name', 'confession.value=Sarah'] },
      { text: '(close your mouth. finish the job.)',
        goto: 'done', set: ['confession.kind=nothing'] },
    ],
  },

  // ── he heard the tape: what he admits he is feeling ──────────────────────
  tape: {
    speaker: '',
    art: { id: 'recordist-swirled', mode: 'hero', caption: 'The previous take keeps playing back.', status: 'ON THE TAPE' },
    lines: [
      ...PUSH_BAR,
      ...STEEL_YOURSELF,
      // Not him. Something in the building asks him a question, out loud, and he
      // HEARS it — `unknown` is voiced (see sam-voice VOICED) precisely so this
      // line cannot be mistaken for one of his own thoughts. It is the surfer,
      // hours before the game is willing to name it.
      { who: 'unknown', text: 'Who did you lose.' },
      { who: 'you', text: "..." },
      { who: 'you', text: 'I am not actually considering that was someone else, right?.' },
    ],
    choices: [
      { text: "Must be him that was sayin' all that. It's the easiest explanation. Nobody else in the room.",
        goto: 'done', set: ['confession.kind=feeling', 'confession.value=named'] },
      { text: '"I\'m tired. I\'ve been up since five. That is all this is. Get on with the job"',
        goto: 'done', set: ['confession.kind=feeling', 'confession.value=denied'] },
      { text: '"Levels. Slate. Roll. Levels. Slate. Roll."',
        goto: 'done', set: ['confession.kind=feeling', 'confession.value=procedure'] },
      { text: '(say nothing at all. this has nothing to do with your job anyway)',
        goto: 'done', set: ['confession.kind=nothing'] },
    ],
  },

  done: {
    speaker: '',
    lines: [
      { who: 'direction', text: 'Sure, tell yourself that.' },
    ],
  },
};

// ── the level check, in the loading dock ────────────────────────────────────
// The first time he touches the recorder. Nothing is hunting him, nothing is
// at stake, and every rule of the game gets said out loud by a man explaining
// his own trade to himself in the dark, which is what people do at 21:44.
//
// It ends by rolling, and then he has to hold still for six seconds, and the
// six seconds are the point. He learns the posture before it is dangerous.
export const LEVEL_CHECK = {
  start: {
    speaker: '',
    lines: [
      { who: 'you', text: 'Before anything. You never set a level in a room you have not listened to.' },
      { who: 'direction', text: 'The recorder wakes up in your hand. A nifty fluorescent display, and an eleven segment meter that shows how loud your recording is.' },
    ],
    choices: [
      { text: 'what am I actually recording?', goto: 'what' },
      { text: 'set the levels', goto: 'levels' },
    ],
  },
  what: {
    speaker: '',
    lines: [
      { who: 'you', text: 'Room tone. Sixty seconds of a room with nothing in it.' },
      { who: 'you', text: 'Not silence; there is no such thing. The air handler, the glass, the size of the place.' },
      { who: 'you', text: 'They cut it in under dialogue so a scene does not go dead between lines. Every room has one, and every one is different, and nobody has ever noticed a good one.' },
      { who: 'direction', text: 'Five recordings of a building that comes down on Thursday.' },
    ],
    goto: 'start',
  },
  levels: {
    speaker: '',
    lines: [
      { who: 'direction', text: 'The meter finds the dock. Minus fifty-four decibels. As you move, the recorder picks up your ruffling.' },
      { who: 'you', text: 'My jacket, my knee, my breathing can all ruin this recording.' },
    ],
    choices: [
      { text: 'so what spoils a take?', goto: 'spoils' },
      { text: 'kill the light and roll', goto: 'roll' },
    ],
  },
  spoils: {
    speaker: '',
    lines: [
      { who: 'you', text: 'Anything I do. A step. A hand on the torch. The radio, if it ever decides to speak.' },
      { who: 'you', text: 'Their own words: if you can hear yourself on the take, try again.' },
      { who: 'you', text: 'So: light off, feet still, and forty-five seconds of being furniture.' },
    ],
    choices: [
      { text: 'and if I move?', goto: 'move' },
      { text: 'kill the light and roll sound', goto: 'roll' },
    ],
  },
  move: {
    speaker: '',
    lines: [
      { who: 'you', text: "Then the take is spoiled and I just have to do it again. That is all. That's what I like about audio work and the arts; nobody ever dies because of a spoiled take." },
      { who: 'direction', text: 'You have done this for six years and never once said that out loud in a room.' },
    ],
    goto: 'levels',
  },
  roll: {
    speaker: '',
    lines: [
      { who: 'you', text: 'Light off. Easier that way.' },
      { who: 'you', text: 'That is the level. That is the room. Now you keep sixty seconds of it with nothing added.' },
      { who: 'direction', text: 'The headphones are on and the monitor is open. Press [r] to roll sound and start recording — and once you roll: do not move.' },
    ],
  },
};
// todo
// ── the first take ──────────────────────────────────────────────────────────
// The real one, in studio B3, and the largest tree in the game.
//
// It is a hub with a rig on the floor of it. Everything is exhaustible and
// almost all of it is missable: a player who wants to press [space] four times
// and roll can do that, and will never learn what the risers are for, or what a
// music stand tells you about the night a building closed, or why he stopped
// slating out loud.
//
// THE POINT OF THE RIG ON THE FLOOR. He put it down wrong. He knows better; he
// has known better since his first week; and the reason he did it is that this
// room is so quiet that he is hurrying without noticing. Nothing has threatened him.
// The building has not done anything. He is simply not himself in here, and the
// first evidence of that is a piece of kit resting on a drum.
export const FIRST_TAKE = {
  start: {
    speaker: 'STUDIO B3',
    lines: [
      { who: 'direction', text: 'Foam on three walls, carpet, a dead ceiling. The quietest room in the building.' },
      { who: 'direction', text: 'You put the rig down and start unwinding the cable.' },
      { who: 'you', text: '...' },
      { who: 'you', text: 'I have set it on the floor.' },
    ],
    choices: [
      { text: 'so what? it is a floor', goto: 'floor.so' },
      { text: 'pick it up. it goes on its risers.', goto: 'floor.risers' },
    ],
  },
  'floor.so': {
    speaker: 'STUDIO B3',
    lines: [
      { who: 'you', text: 'A floor is a drum. A joist is a drumstick. Everything above it and everything under it goes into the mic as one long low nothing you cannot filter out afterwards.' },
      { who: 'you', text: 'That is why the case has four gum rubber risers on it. Silicone under those. It cost more than the microphone.' },
      { who: 'direction', text: 'You have known that since your first week on a rig.' },
    ],
    goto: 'floor.risers',
  },
  'floor.risers': {
    speaker: 'STUDIO B3',
    lines: [
      { who: 'direction', text: 'You lift it, set it on the case, and feel the risers take it.' },
      { who: 'you', text: 'So why did I do that.' },
      { who: 'you', text: 'Because it is quiet in here, and I was hurrying, and I did not notice I was hurrying.' },
      { who: 'direction', text: 'Nothing has happened. Nobody has touched you. It is 22:04 and you have made your first mistake in a decade.' },
    ],
    goto: 'hub',
  },

  // ── the hub. Everything here is optional, and most of it is lore. ─────────
  hub: {
    speaker: 'STUDIO B3',
    lines: [
      { who: 'you', text: 'Right. Do it properly. Set up, levels, light, roll.' },
    ],
    choices: [
      { text: 'check the levels', goto: 'levels' },
      { text: 'look at the room', goto: 'room' },
      { text: 'the music stand', goto: 'stand' },
      { text: 'slate it, out loud', goto: 'slate' },
      { text: 'kill the light and roll', goto: 'dark' },
    ],
  },

  levels: {
    speaker: 'STUDIO B3',
    lines: [
      { who: 'direction', text: 'The meter finds the room. Minus sixty-one.' },
      { who: 'you', text: 'And the last two decibels of that are me. Jacket, knee, breathing — which you cannot switch off, only slow down.' },
      { who: 'you', text: 'Minus sixty-one in a room with a man in it. This place is a coffin with foam on it.' },
    ],
    choices: [
      { text: 'what is a good floor?', goto: 'levels.floor' },
      { text: 'back', goto: 'hub' },
    ],
  },
  'levels.floor': {
    speaker: 'STUDIO B3',
    lines: [
      { who: 'you', text: 'A live room is minus fifty. A church at four in the morning is minus fifty-five and you are proud of it.' },
      { who: 'you', text: 'Minus sixty-one is a number I have seen twice. Once in an anechoic chamber in Salford.' },
      { who: 'you', text: 'And once on a file the client sent me this afternoon.' },
      { who: 'direction', text: 'Minus fifty-eight, that one. Close enough that it does not comfort you.' },
    ],
    goto: 'hub',
  },

  room: {
    speaker: 'STUDIO B3',
    lines: [
      { who: 'direction', text: 'The torch goes round it. Cable snakes, coiled the way you coil them, which is the way everybody coils them.' },
      { who: 'direction', text: 'A patchbay with every cable pulled. A chair. Foam gone brown at the edges where thirty years of hands went past it.' },
      { who: 'you', text: 'Somebody worked in here for a long time and then one day they did not come back.' },
      { who: 'you', text: 'That is not ominous. That is every building I have ever been paid to record.' },
    ],
    goto: 'hub',
  },

  stand: {
    speaker: 'STUDIO B3',
    lines: [
      { who: 'direction', text: 'A music stand, folded down, leaning in the corner. Somebody folded it. Nobody folds a stand on the day a building is condemned.' },
      { who: 'you', text: 'They thought they were coming back. Everyone in a condemned building thought they were coming back.' },
      { who: 'direction', text: 'There is a sheet still clipped to it. Two bars of something, in pencil, in a hand you cannot read.' },
    ],
    choices: [
      { text: 'take it', goto: 'stand.take' },
      { text: 'leave it', goto: 'stand.leave' },
    ],
  },
  'stand.take': {
    speaker: 'STUDIO B3',
    lines: [
      { who: 'direction', text: 'You put it in the bag, behind the work order, and you could not tell anybody why.' },
      { who: 'you', text: 'It comes down on Thursday. All of it. Somebody may as well have the two bars.' },
    ],
    goto: 'hub',
  },
  'stand.leave': {
    speaker: 'STUDIO B3',
    lines: [
      { who: 'you', text: 'Not mine. None of this is mine. I am here for sixty seconds of the air.' },
      { who: 'direction', text: 'You leave it exactly as you found it, which is a thing you are good at.' },
    ],
    goto: 'hub',
  },

  slate: {
    speaker: 'STUDIO B3',
    lines: [
      { who: 'me', text: 'Ellery, studio B3, room tone, take one.', prompt: 'slate it: "Ellery, studio B3, room tone, take one."' },
      { who: 'direction', text: 'Your own voice comes back off the foam with everything above four hundred hertz taken out of it.' },
      { who: 'you', text: 'You slate out loud so that in eight months, when the file is a number, somebody knows what they are listening to.' },
      { who: 'you', text: 'I stopped doing it years ago, when the recorders started writing the metadata themselves.' },
      { who: 'you', text: 'The last man slated three of his four.' },
    ],
    goto: 'hub',
  },

  dark: {
    speaker: 'STUDIO B3',
    lines: [
      { who: 'you', text: 'The torch is a filament, and a filament in a dead building is a bell. Off it goes.' },
      { who: 'direction', text: 'Dark. The kind with no shape in it, because there is nothing here to make a shape out of.' },
      { who: 'you', text: 'Forty-five seconds. Do not move. Do not touch the light.' },
      { who: 'you', text: 'If I can hear myself on the take, the take is not the room. Their words. Mine first.' },
    ],
    choices: [
      { text: 'wait — go back over the kit', goto: 'hub' },
      { text: 'roll', goto: 'roll' },
    ],
  },
  roll: {
    speaker: 'STUDIO B3',
    lines: [
      { who: 'direction', text: 'The monitor opens. The room comes up in the cans, close and quiet — the foam, the dead air, the size of it.' },
      { who: 'direction', text: 'Headphones on. Press [r] to roll — and the moment you do, the room drops out, and you do not move.' },
    ],
  },
};

// ── LISTEN ──────────────────────────────────────────────────────────────────
// Every take begins here: headphones on, the room up in the cans, described.
// It is a dialog beat, not a mode — guided, short, and it ends by rolling, so
// the player always knows what they are doing and is never left in a silent
// limbo. The first take (studio B3) and the dock level check have their own,
// longer trees; this is the quick one for every room after.
//
// The one choice is "roll", which is the forcing: you do not set a level and
// walk away. Setting a level commits you to keeping the minute.
// Per room: the ambience that comes up in the cans, and two things a recordist
// would examine before he rolls — each a small vein of lore that greys out once
// asked (conversation.js handles the greying). Roll is always there. A player
// who wants to work fast rolls; a player who wants the building tells them
// something about it listens first.
const LISTEN_ROOMS = {
  main_b3: {
    amb: 'foam on three walls, carpet, dead air, and the size of a cupboard',
    examine: [
      { q: 'the foam', lines: [
        { who: 'you', text: 'Wedge foam, going to powder at the edges. Somebody treated this room properly, once, and then stopped paying the heating.' },
        { who: 'you', text: 'It eats everything above four hundred hertz. Which is why the only thing left on the take is me.' } ] },
      { q: 'the patchbay', lines: [
        { who: 'direction', text: 'Every cable pulled, coiled, hung. Somebody left this room tidy.' },
        { who: 'you', text: 'You do not tidy a room you think is being knocked down. You tidy a room you are coming back to.' } ] },
    ],
  },
  the_tub: {
    amb: 'six metres of tile and no water, and every sound of yours handed back four times',
    examine: [
      { q: 'the acoustics', lines: [
        { who: 'you', text: 'Hard tile, hard ceiling, nothing to soak it up. A cough in here is a chord.' },
        { who: 'you', text: 'You do not record a room like this. You survive it, for sixty seconds, and you get the file.' } ] },
      { q: 'the empty pool', lines: [
        { who: 'direction', text: 'The deep end goes down into black. There is a ladder, and the ladder goes into the dark, and the dark has a floor to it somewhere.' },
        { who: 'you', text: 'A pool with no water is just a very clean room that is the wrong shape.' } ] },
    ],
  },
  amplifications: {
    amb: 'nine metres of empty seats going back past the dark, dust hanging in it, a hall holding its breath',
    examine: [
      { q: 'the seats', lines: [
        { who: 'direction', text: 'Row on row, receding past where the torch reaches. Horsehair and dust and the smell of a place that was warm for a hundred years.' },
        { who: 'you', text: 'A full hall and an empty hall are the same room with a different amount of breathing in it.' } ] },
      { q: 'the stage', lines: [
        { who: 'you', text: 'I am standing where the sound was made for a hundred years, recording the one night nobody is making any.' },
        { who: 'you', text: 'That is the job. Say it like that and it is almost a nice job.' } ] },
    ],
  },
  soundnoisemusic: {
    amb: 'eight practice rooms and an ensemble room with the doors open, seven uprights with their lids up and none in tune with any other',
    examine: [
      { q: 'the pianos', lines: [
        { who: 'you', text: 'Seven lids up. A piano with the lid up is a hundred and eighty strings waiting for something to happen.' },
        { who: 'you', text: 'Nothing is going to happen. I am going to record nothing happening to a hundred and eighty strings, seven times over.' } ] },
      { q: 'the open doors', lines: [
        { who: 'direction', text: 'Every practice room door standing open, which is how you leave a room you are coming back to after a coffee.' },
        { who: 'you', text: 'Nobody came back from their coffee.' } ] },
    ],
  },
  lux_nova: {
    amb: 'stone, ribbed vault, cold you can hear, and somewhere overhead a broken pane letting the weather in',
    examine: [
      { q: 'the tail', lines: [
        { who: 'you', text: 'Eleven seconds of reverb, maybe twelve. Stone gives everything back to you long after you have stopped saying it.' },
        { who: 'you', text: 'You have to hold still a long time in a room like this. The room keeps talking after you stop.' } ] },
      { q: 'the broken pane', lines: [
        { who: 'direction', text: 'High up, a clerestory window gone, and the weather coming in through it — snow, tonight, indoors, drifting down onto stone.' },
        { who: 'you', text: 'This is the fifth room. This is his room.' } ] },
    ],
  },
};

export function roomListen(room, label) {
  const r = LISTEN_ROOMS[room] || { amb: 'the room', examine: [] };
  const nodes = {
    start: {
      speaker: '',
      lines: [
        { who: 'direction', text: `Headphones on. ${label} comes up in the cans — ${r.amb}.` },
        { who: 'you', text: 'That is the level. That is the room.' },
      ],
      choices: [
        ...r.examine.map((e, i) => ({ text: e.q, goto: `ex${i}`, hideWhenAsked: false })),
        { text: 'kill the light and roll', goto: 'roll' },
      ],
    },
    roll: {
      speaker: '',
      lines: [
        { who: 'direction', text: 'You kill the light. The room drops out of the cans, the tape hiss comes up, and there is you and forty-five seconds and nothing else.' },
        { who: 'you', text: 'Sixty seconds of nothing, with nothing added. Do not move.' },
      ],
    },
  };
  r.examine.forEach((e, i) => { nodes[`ex${i}`] = { speaker: '', lines: e.lines, goto: 'start' }; });
  return nodes;
}

// ── the plant room ──────────────────────────────────────────────────────────
// There is no objective here. There is no take here. The work order does not
// name this room and there is no reason on earth to walk into it.
//
// Which is why the only way out that does not cost you everything is sitting on
// the floor of it, with its lid off.
//
// He was bending it. You bend a machine by soldering across the parts that are
// supposed to decide things — feeding the output back in before it has finished
// being an output. You do it to make a machine sing. He was doing it to make
// one stop singing, which is the same circuit run backwards, and he ran out of
// night before he finished.
//
// Both options here are a choice the player will not understand for hours. Take
// it and you have a second ending. Leave it and you have one.
export const PLANT_RIG_CELL = { x: 38, y: 32 };

// ── the busts ────────────────────────────────────────────────────────────────
// Six plinths in the gallery. Four still have a head on them, and none of them
// has a name, a plaque or an accession mark — nobody in this building ever
// recorded who they were supposed to be.
//
// What this is: a man alone in the dark, holding a conversation. Every answer is
// HIS. The trick is not that the marble speaks; it is that a room this dark takes
// a question the same way a person does, and he keeps going anyway, because the
// alternative is admitting he is talking to a rock. So the questions are `you`
// out loud, and the answers are `you` too — the direction lines only ever report
// silence, a torch beam, and the shape of his own reasoning coming back at him.
//
// One of them moves. See BUST_TURN and PROP drift in main.js: it is a yaw change
// applied while the beam is elsewhere, and it is never explained.
export const BUST_TALK = {
  start: {
    speaker: 'THE GALLERY',
    lines: [
      { who: 'direction', text: 'A head on a plinth, at the height of a person who is standing slightly too close.' },
      { who: 'you', text: 'Evening.' },
      { who: 'direction', text: 'The room does what the room has done all night, which is nothing.' },
      { who: 'you', text: 'Right. Sorry. I know.' },
    ],
    choices: [
      { text: 'ask who he was', goto: 'who' },
      { text: 'ask how long he has been up here', goto: 'long' },
      { text: 'tell him about the job', goto: 'job' },
      { text: 'stop talking to a rock', goto: 'stop' },
    ],
  },
  who: {
    speaker: 'THE GALLERY',
    lines: [
      { who: 'you', text: 'So who were you, then. Founder? Benefactor? Somebody who gave them a organ and got a face out of it?' },
      { who: 'direction', text: 'No plaque. No accession number. Nothing cut into the plinth and nothing screwed to it either — not removed, never fitted.' },
      { who: 'you', text: 'Nobody wrote you down.' },
      { who: 'you', text: 'That is the thing about this place. It kept the marble and lost the paperwork. Four rooms delivered and no name on the fifth.' },
    ],
    choices: [
      { text: 'that could be me', goto: 'me' },
      { text: 'ask something else', goto: 'start' },
      { text: 'leave him to it', goto: 'stop' },
    ],
  },
  long: {
    speaker: 'THE GALLERY',
    lines: [
      { who: 'you', text: 'How long have you been up here in the dark?' },
      { who: 'direction', text: 'Dust on the crown of the head, and none on the front of the face. Somebody wiped it, once, at about eye level.' },
      { who: 'you', text: 'Longer than the lights, anyway.' },
      { who: 'you', text: 'You get used to it, I expect. You stop noticing that nothing is answering.' },
      { who: 'direction', text: 'He hears himself say it.' },
    ],
    choices: [
      { text: 'ask something else', goto: 'start' },
      { text: 'that could be me', goto: 'me' },
      { text: 'leave him to it', goto: 'stop' },
    ],
  },
  job: {
    speaker: 'THE GALLERY',
    lines: [
      { who: 'you', text: 'Five rooms of nothing. That is the job. I record what a room sounds like when nobody is in it.' },
      { who: 'you', text: 'People think that is empty. It is not. It is the loudest thing in the building if you hold still for it.' },
      { who: 'direction', text: 'He waits, out of habit, for the part where the other person says something back.' },
      { who: 'you', text: 'And you would know about holding still.' },
    ],
    choices: [
      { text: 'ask something else', goto: 'start' },
      { text: 'leave him to it', goto: 'stop' },
    ],
  },
  me: {
    speaker: 'THE GALLERY',
    lines: [
      { who: 'you', text: 'A man in a room with no name on him. Building coming down on Friday.' },
      { who: 'you', text: 'Somebody did the first four and did not come out, and nobody has said his name to me once. Not the client. Not the guard.' },
      { who: 'direction', text: 'The beam goes across the other plinths. Blank. Blank. A fragment. Blank.' },
      { who: 'you', text: 'Right. Enough of that.' },
    ],
    choices: [ { text: 'get back to work', goto: 'stop' } ],
  },
  stop: {
    speaker: 'THE GALLERY',
    lines: [
      { who: 'direction', text: 'He puts the beam back on the floor and the head goes out like a switch.' },
      { who: 'you', text: 'Goodnight.' },
    ],
  },
};

// A head that is not there any more. Two of the six plinths hold only the bottom
// of a face, and he talks to those too, which is worse.
export const BUST_FRAGMENT = {
  start: {
    speaker: 'THE GALLERY',
    lines: [
      { who: 'direction', text: 'A plinth with the bottom third of a face on it. Jaw, part of a mouth, no eyes.' },
      { who: 'you', text: 'Sorry. I would ask, but.' },
      { who: 'direction', text: 'The break is old and clean, and somebody swept up after it.' },
      { who: 'you', text: 'Somebody tidied you and left you here. That is the most this building has done for anybody.' },
    ],
  },
};

// THE ONE THAT GETS ITS EYES BACK.
//
// Half of this face has been in a fountain in the park across the yard since
// before tonight. Put it back and the bust is the only thing in the building
// that has been in one place the whole time and was facing the right way — so
// what it has to offer is not a secret, it is an eyewitness account. It watched
// a plant engineer come through with a key he was not supposed to still have,
// and it watched where he put it.
//
// It does not hand anything over. A bust with a key in it is nonsense. It tells
// you what it saw, and the walk down is yours.
export const BUST_RESTORED = {
  start: {
    speaker: 'THE GALLERY',
    lines: [
      { who: 'direction', text: 'The break takes first time. Old stone finds old stone and there is a sound like a door closing somewhere else in the building.' },
      { who: 'you', text: 'There. That is the most I can do for you.' },
      { who: 'direction', text: 'Two eyes, wet from the fountain, pointing at the doorway rather than at him.' },
      { who: 'unknown', text: 'Thirty-one years of the same corridor.' },
      { who: 'you', text: '...say again?' },
      { who: 'unknown', text: 'Nobody comes up here. That is what a gallery is for. So I watched the stair instead, and the stair is honest.' },
      { who: 'unknown', text: 'A man came up in March with the plant keys still on him after they had asked for them back. He sat on the bench where you are standing and he did not want to go home.' },
      { who: 'unknown', text: 'He did not hand them in. He put them under the felt, in the base of the head that sits off-square, four along from me. He said he would come back for them and he was telling the truth. He simply did not.' },
      { who: 'you', text: 'Under the felt.' },
      { who: 'unknown', text: 'The spur. Plant services. Whatever it is you can hear down there, he could hear it too, and he wanted to be able to get back in.' },
    ],
  },
};

// Said again, on a later visit. It is the only useful thing it knows and it
// would be cruel to make somebody find the park twice.
export const BUST_RESTORED_AGAIN = {
  start: {
    speaker: 'THE GALLERY',
    lines: [
      { who: 'direction', text: 'Wet marble, and two eyes still pointing at the stair.' },
      { who: 'unknown', text: 'Under the felt. The head that sits off-square, four along. He never came back for it.' },
    ],
  },
};

// THE ONE THAT ANSWERS. It comes back in a voice that is not his — `unknown`, the
// same voice the surfer has, and the only line in the gallery he does not say
// himself. Nothing about this is explained and nothing is granted by it.
export const BUST_ANSWER = {
  start: {
    speaker: 'THE GALLERY',
    lines: [
      { who: 'direction', text: 'The fifth head. Same blank sitter line, same nothing cut into the plinth.' },
      { who: 'you', text: 'And you? Anything to say?' },
      { who: 'direction', text: 'The room does what the room has done all night.', hold: 2.6 },
      { who: 'unknown', text: 'Ask it again.', hold: 3.0 },
      { who: 'direction', text: 'He does not move. The torch does not move.' },
    ],
    choices: [
      { text: 'ask it again', goto: 'again' },
      { text: 'do not ask it again', goto: 'leave' },
    ],
  },
  again: {
    speaker: 'THE GALLERY',
    lines: [
      { who: 'you', text: 'Anything to say.' },
      { who: 'unknown', text: 'No. Nothing. Same as you.', hold: 3.0 },
      { who: 'direction', text: 'Marble, at the height of a person standing slightly too close, with the light on it.' },
      { who: 'you', text: 'Right.' },
      { who: 'you', text: 'Right, that was me. That was me doing a voice. That is what a man on his own does at three in the morning.' },
      { who: 'direction', text: 'He believes that for about four seconds.' },
    ],
  },
  leave: {
    speaker: 'THE GALLERY',
    lines: [
      { who: 'direction', text: 'He puts the beam on the floor and keeps it there while he walks away.' },
      { who: 'you', text: 'No. I am not doing that again.' },
    ],
  },
};

// The one with something in it. A head sitting off-square on its plinth, felt
// under the base, and a calibration pin lost in the felt.
export const BUST_PIN = {
  start: {
    speaker: 'THE GALLERY',
    lines: [
      { who: 'direction', text: 'This one sits off-square on its plinth. There is old felt under the base, packed down.' },
      { who: 'you', text: 'Somebody had you off and put you back in a hurry.' },
      { who: 'direction', text: 'Brass in the felt, on its side, where it rolled when a hand let go of it.' },
    ],
  },
};

// The one that does not hold still. Fires once per run, on a bust he has already
// spoken to, and the movement has ALREADY happened by the time he looks: the map
// of a face he was talking to a second ago is now aimed at him.
export const BUST_TURN = {
  start: {
    speaker: 'THE GALLERY',
    lines: [
      { who: 'direction', text: 'The beam comes back to the plinth on the way past.' },
      { who: 'direction', text: 'It is facing him. It was facing the window.', hold: 2.4 },
      { who: 'you', text: 'No.' },
      { who: 'you', text: 'No, you were — you were pointed at the glass. You were pointed at the glass when I was standing here.' },
      { who: 'direction', text: 'It does not do it again while he is watching, and he watches for a long time.' },
    ],
  },
};

export const BENT_RIG = {
  start: {
    speaker: 'THE PLANT ROOM',
    lines: [
      { who: 'direction', text: 'Chillers, a header tank, forty years of pipework lagged in something they do not let you touch any more.' },
      { who: 'you', text: 'Nothing in here. No objective, no take, no reason to have come in.' },
      { who: 'direction', text: 'The torch finds a recorder on the floor with its lid off.' },
    ],
    choices: [
      { text: 'look at it', goto: 'look' },
      { text: 'leave it. it is not yours.', goto: 'leave' },
    ],
  },
  look: {
    speaker: 'THE PLANT ROOM',
    lines: [
      { who: 'direction', text: 'The same model as yours, eleven years older. The lid is off and it has been off for a while.' },
      { who: 'direction', text: 'Wires soldered across the converter. Out of the case, round, and back into its own input.' },
      { who: 'you', text: 'He was bending it.' },
      { who: 'you', text: 'You solder across the parts that decide things, and you feed the output back in before it has finished being an output.' },
      { who: 'you', text: 'People do that to make a machine sing.' },
    ],
    choices: [
      { text: 'why would he do that here?', goto: 'why' },
      { text: 'reflow the joint. finish what he started.', goto: 'solder', set: ['has.interface'] },
      { text: 'strip it. those are good cells, and my torch is not immortal.', goto: 'gut', set: ['rig.gutted'] },
      { text: 'leave it', goto: 'leave' },
    ],
  },
  why: {
    speaker: 'THE PLANT ROOM',
    lines: [
      { who: 'you', text: 'Same circuit, run backwards, makes one stop.' },
      { who: 'you', text: 'You would only build that if there were something in the signal you wanted out of the signal.' },
      { who: 'direction', text: 'The solder on the last joint is grey and cracked. He did not have time to reflow it.' },
      { who: 'you', text: 'He ran out of night.' },
      { who: 'direction', text: 'There is an iron in your bag, because there is always an iron in your bag. And there are two good cells in the tray, because he never got to use them either.' },
    ],
    choices: [
      { text: 'reflow the joint. finish what he started.', goto: 'solder', set: ['has.interface'] },
      { text: 'strip it. those are good cells, and my torch is not immortal.', goto: 'gut', set: ['rig.gutted'] },
      { text: 'leave it', goto: 'leave' },
    ],
  },
  // The good ending is not FOUND. It is BUILT, by hand, on a plant-room floor, out
  // of a dead man's homework — and it takes the one resource the dark is also
  // asking for. You cannot have both. Nobody gets to have both.
  solder: {
    speaker: 'THE PLANT ROOM',
    lines: [
      { who: 'direction', text: 'You kneel on a plant-room floor at two in the morning and reflow a joint a dead man left grey, because that is the job, and it was always the job.' },
      { who: 'you', text: 'There. That is a circuit. That is a horrible, beautiful, working circuit.' },
      { who: 'direction', text: 'It goes in the bag, against the work order, where it is the heaviest thing you are carrying. The cells stay in it, and the cells are most of the weight, and you put them in anyway.' },
      { who: 'you', text: 'I do not know what I would do with it.' },
      { who: 'direction', text: 'That is true when he says it. It will not be true later.' },
    ],
  },
  gut: {
    speaker: 'THE PLANT ROOM',
    lines: [
      { who: 'direction', text: 'You take the cells and you leave the rig, which is the practical thing, and you are a practical man.' },
      { who: 'you', text: 'Two good cells. That is another few hours of light, and light is the only thing in here that has ever helped me.' },
      { who: 'direction', text: 'The wires he soldered go slack in the tray. You cannot reflow a circuit you have taken the heart out of, and you have taken the heart out of it.' },
      { who: 'you', text: 'He would have understood. He ran out of night too.' },
      { who: 'direction', text: 'He would not have understood. He spent his last hours building this instead of lighting his way, and that is the whole difference between you.' },
    ],
  },
  leave: {
    speaker: 'THE PLANT ROOM',
    lines: [
      { who: 'you', text: 'Not mine. And I have four rooms to do.' },
      { who: 'direction', text: 'You leave it exactly where he left it, which is a thing you are good at.' },
    ],
  },
};

// ── the talisman: a tuning fork ─────────────────────────────────────────────
// The one object in the building whose entire purpose is to be a pure sound. You
// strike it and it gives you the truth, which is A, 440, and nothing else — and
// in here it will not stop giving it, because in here nothing that starts
// sounding has ever worked out how to finish.
//
// This is where the lore lives. It is the only place the Chunk Surfer is said out
// loud, and it is said by a man reading an engraving, not by a ghost.
// WHERE IT LIVES, and why that took two goes to get right.
//
// It used to sit at authored (66,65): flat on the floor of the east coat-and-bag
// room, four metres past a door, six metres from the mark, in the dark. The
// comment here claimed it was one cell off the mark and unmissable. It was not,
// and nobody ever found it — the same failure the calibration pins had before
// they were moved inside furniture (see PIN_HOSTS in main.js).
//
// It now rests on the desk of the music stand in the service room, at chest
// height, through the one open door you are looking straight at while you set up
// the practice-wing take. TALISMAN_STAND is the authority; TALISMAN_CELL is only
// the proximity fallback for a save whose loose props failed to place.
export const TALISMAN_STAND = 'practice-stand-3';
export const TALISMAN_CELL = { x: 55, y: 64 };
export const TALISMAN = {
  start: {
    speaker: 'THE PRACTICE WING',
    lines: [
      { who: 'direction', text: 'On the desk of the music stand, in the dust, a tuning fork. Steel, stamped, older than the last refit.' },
      { who: 'you', text: 'Somebody left a fork where the music goes. That is the least mysterious object I have ever found.' },
    ],
    choices: [
      { text: 'pick it up', goto: 'read' },
      { text: 'leave it. it is a fork.', goto: 'leave' },
    ],
  },
  read: {
    speaker: 'THE PRACTICE WING',
    lines: [
      { who: 'direction', text: 'It is engraved, badly, by hand, with a knife rather than a tool: A=440. And under that, smaller: AND NOTHING ELSE.' },
      { who: 'you', text: '"And nothing else."' },
      { who: 'you', text: 'That is not a joke a tuner makes. That is a joke a man makes at three in the morning about the only thing he still believes.' },
    ],
    choices: [
      { text: 'strike it', goto: 'strike' },
      { text: 'whose was it?', goto: 'whose' },
      { text: 'pocket it and get on', goto: 'pocket', set: ['has.fork'] },
    ],
  },
  whose: {
    speaker: 'THE PRACTICE WING',
    lines: [
      { who: 'you', text: 'A répétiteur, maybe. Somebody who tuned this room every morning for thirty years and never once got to play in it.' },
      { who: 'direction', text: 'There is a name scratched under the stamp, worn to nothing but the shape of a name.' },
      { who: 'you', text: 'They all end up as the shape of a name.' },
    ],
    choices: [
      { text: 'strike it', goto: 'strike' },
      { text: 'pocket it and get on', goto: 'pocket', set: ['has.fork'] },
    ],
  },
  // The lore, delivered the only honest way this game has: as a professional
  // reading a decay curve and not liking the answer.
  strike: {
    speaker: 'THE PRACTICE WING',
    lines: [
      { who: 'direction', text: 'You strike it on your knee and hold it up, the way you have ten thousand times, and it gives you A.' },
      { who: 'you', text: 'Four-forty. Clean as anything.' },
      { who: 'direction', text: 'A struck fork dies in about ninety seconds. You count, because counting is what you are.' },
      { who: 'you', text: 'Ninety. A hundred. A hundred and forty.' },
      { who: 'direction', text: 'It does not decay. It sits exactly where it was struck, at exactly the level it was struck, and it goes on being A.' },
      { who: 'you', text: 'That is not possible. Energy leaves a system. That is not an opinion, that is the whole of physics.' },
      { who: 'surfer', text: '...unless the system likes it.', rate: 0.94 },
      { who: 'you', text: 'What.' },
      { who: 'direction', text: 'The building has been holding this note. Not making it — HOLDING it, the way a man holds a breath, and it has been holding it for a very long time.' },
      { who: 'you', text: 'Something in here listened to a sound so hard it would not let it stop.' },
      { who: 'direction', text: 'And a thing that will not let a sound stop is a thing that has stopped being a listener and started being the sound. That is not a ghost. That is worse. A ghost was a person.' },
    ],
    choices: [
      { text: 'stop it. damp it with your hand.', goto: 'damp' },
      { text: 'pocket it and get on', goto: 'pocket', set: ['has.fork'] },
    ],
  },
  damp: {
    speaker: 'THE PRACTICE WING',
    lines: [
      { who: 'direction', text: 'You close your hand around it. The steel is cold and perfectly still, in a way that makes your fingers secondguess holding on any longer.' },
      { who: 'you', text: "That's an A alright. Real strong, or maybe I'm just hearing things, adjusting to the silence." },
      { who: 'direction', text: 'The tone goes on, in the room, without it. Then it stops, all at once, the way a held breath stops.' },
      { who: 'you', text: 'Hm.' },
    ],
    choices: [
      { text: 'pocket it and get on', goto: 'pocket', set: ['has.fork'] },
    ],
  },
  pocket: {
    speaker: 'THE PRACTICE WING',
    lines: [
      { who: 'you', text: "Let's just hope it wasn't cursed." },
      { who: '???', text: "Let's." },
    ],
  },
  leave: {
    speaker: 'THE PRACTICE WING',
    lines: [
      { who: 'you', text: 'It is a fork on a stand. I have more rooms to do.' },
      { who: 'the fork', text: "Well that's a shame." },
    ],
  },
};

// ── the first time it gets close ────────────────────────────────────────────
// Nothing here has a mechanical effect. The world is running underneath: it is
// still coming, and the three things he can tell himself take exactly as long
// as it takes to arrive.
export const HUSH = {
  start: {
    speaker: '',
    lines: [
      { who: 'direction', text: 'Something in the corridor behind you. Not a sound, exactly... maybe a change in pressure? Regardless, your hair stands on end; your neck begs to snap around.' },
      { who: 'you', text: 'Right.' },
    ],
    choices: [
      { text: '"That is a building settling. They do that."', goto: 'settle' },
      { text: "Don't. Turn. Your. Head.", goto: 'steps' },
      { text: '(say nothing.)', goto: 'still' },
    ],
  },
  settle: {
    speaker: '',
    lines: [
      { who: 'you', text: 'Brick lets go of heat all night. Timber moves. Everything in here is on its way down anyway.' },
      { who: 'direction', text: 'All of that is true; none of it is what you heard, though.' },
    ],
  },
  steps: {
    speaker: '',
    lines: [
      { who: 'you', text: "Whatever that is, at least it's slow..." },
      { who: 'you', text: "...and it looks like it follows noise, not me necessarily." },
    ],
  },
  still: {
    speaker: '',
    lines: [
      { who: 'direction', text: 'You do not turn around. You stand in a dead building with your back to a corridor and you are perfectly, professionally still.' },
      { who: 'you', text: '10 years of training.' },
    ],
  },
};

// After the booth: the yard, in the rain, and a key going into a grey door.
// It ends on the key, because the title card goes here — and the door does not
// shut until the title has faded and the song has gone with it.
// THESE THREE BEATS ARE THINGS HE DOES NOW, NOT THINGS HE IS TOLD.
//
// They used to close the cold open: the yard, the plan, and the key turning —
// narrated over black, between the booth conversation and the title, describing
// a hundred-metre walk the player never took and a door they never opened. Then
// control, outside, in front of that same unopened door.
//
// The walk is the game's now (see the spine in floorplan/conservatory.js), so
// each line has gone to the place it describes:
//
//   the yard        -> ARRIVAL_THOUGHTS.gate, on first leaving the lodge
//   basement first  -> ARRIVAL_THOUGHTS.crossing, out on the tarmac
//   the key turns   -> ARRIVAL_THOUGHTS.door, on the [e] that opens the grey door
//
// The array stays, and stays empty, because makeColdOpenScene still takes beats
// and the god menu still opens the booth conversation with it.
export const COLD_OPEN = [];

// The three redistributed lines. Fired from main.js as ordinary in-world
// thoughts, each once, at the point on the walk it belongs to.
export const ARRIVAL_THOUGHTS = Object.freeze({
  gate: [
    { who: 'direction', text: 'Past the lodge, the old stable wall turns the yard into a chain of courts. Ellery keeps withdrawing behind them: school gables, baths lanterns, then the blind fly tower. Rain finds every roof on the way in.' },
  ],
  crossing: [
    { who: 'you', text: 'Basement first. It will be the hardest and I want it behind me.' },
  ],
  door: [
    { who: 'direction', text: 'The key turns. The door is heavier than it looks, the way fire doors are.' },
  ],
});

// ...and then the title. And THEN the door, into a silence the song has just
// vacated. The loudest thing that happens all night lands on an empty mix.
// It no longer REPORTS the arrival. The player has just walked the yard, turned
// the key and stepped through, and the closer has shut the door behind them on
// screen — so the beat that used to open with "the service door closes behind
// you" now begins where the man actually is, which is standing in the dark on
// the other side of it, listening. "Darker than the yard" finally means
// something, because there was a yard and it was dark and he was in it.
export const AFTER_TITLE = [
  { who: 'you', art: { id: 'door', mode: 'hero', caption: 'Inside / the door shut', status: 'THRESHOLD' }, text: 'Right. That is the weather dealt with.', hold: 2.4 },
  { who: 'you', artClear: true, text: 'Darker than the yard. Which is not great, because the yard was dark.', hold: 2.6 },
  { who: 'you', text: 'And quieter. No rain in here. No rain, no traffic, no plant, no lift.', hold: 2.8 },
  { who: 'you', text: 'Minus sixty decibels, near enough, before I have taken the recorder out of the bag.', hold: 2.8 },
  { who: 'direction', art: { id: 'flashlight', mode: 'hero', caption: 'Kit check / by feel', status: 'KIT' }, text: 'You put the bag down and go through it by feel.', cue: 'bag', hold: 2.6 },
  { who: 'you', text: 'Torch. Recorder. Headphones. Radio. Keys. The order, folded twice.', cue: 'kit', hold: 2.8 },
  { who: 'you', text: 'Five rooms, a minute each, and then I drive home.', hold: 3.2 },
];

// Radio dialogue is authored only in content/narrative/radio.* and
// conservatory.radio_dead. Runtime faults keep only their immediate sensory
// captions here; they are equipment noise, not another dialogue source.
export const SQUELCH_LINES = [
  { who: 'direction', text: 'The carrier lamp flashes. A clipped squelch snaps from the grille.' },
  { who: 'direction', text: 'White static rises for half a second and cuts cleanly off.' },
  { who: 'direction', text: 'The radio gives a relay click, a breath of hiss, then nothing.' },
];

// ── the previous recordist ──────────────────────────────────────────────────
// He is a professional writing to himself. Numbers, times, gear. His prose is
// dry in exact proportion to what is happening, which is the only register
// available to a man whose job is to hold still.
//
// `room` is the waypoint a page grants. `at` is where it lies on the floor.

export const PAGES = [
  {
    // In the credenza drawer in the ground-floor dead end. Its `at` is the
    // credenza's own cell: hostedPageFor grants it on inspecting the furniture
    // rather than by treading on it, so the sheet is found where a sheet would
    // actually be. Never placed as a loose prop — see syncVisiblePages.
    id:'foh-overflow-note',at:{x:73.6,y:23.5},room:'amplifications',decay:.09,hosted:'deadend-ground-credenza',
    title:'FURNITURE OFF THE FLOOR',byline:'FRONT OF HOUSE · UNSIGNED',
    body:[
      {raw:'FOH/F-06   armchair        east corridor'},
      {raw:'FOH/F-07   green chair     east corridor'},
      {raw:'FOH/F-08   console         east corridor'},
      '',
      'Taken out of the front room before the photographs and not put back. The corridor is dry and nobody walks it, and there is a rail on that wall already, so the big canvas went round too rather than into the store where it would have been stacked face-in.',
      '',
      'It is a better room than the one it came out of. That is not a complaint about the corridor.',
      '',
      {raw:'RETURN BY: —'},
    ],
  },
  {
    id:'pre-roll-analysis',at:{x:68,y:14},room:'main_b3',decay:.05,
    title:'PRE-ROLL ANALYSIS',byline:'TRANSFER BENCH · B3',
    body:[
      {raw:'DECK       TASCAM 122 Mk III · transport verified'},
      {raw:'OFFSET     -01.8 s before recorded slate'},
      '',
      'The fragment precedes the source slate on the source reel and both safety copies. Azimuth, head timing, and timecode agree. Do not describe this as print-through unless a later pass produces a leading analogue of the complete phrase.',
      '',
      {raw:'RECORDER FAULT: NOT INDICATED'},
    ],
  },
  {
    id:'faculty-reference-requirement',at:{x:100,y:16},room:'soundnoisemusic',decay:.12,
    title:'REFERENCE REQUIREMENT',byline:'FACULTY PERFORMANCE OFFICE',
    body:[
      {raw:'MINIMUM   6 monitored corrections / student / week'},
      {raw:'RETAKES   exact reference retained until match'},
      '',
      'A correction session is complete only when the student can reproduce the retained reference without deviation. Practice-room decks are not to be stopped between attempts. Missed sessions are referred to Performance Standards.',
    ],
  },
  {
    id:'student-monitoring-notes',at:{x:104,y:16},room:'soundnoisemusic',decay:.26,
    title:'THE SECOND PERFORMANCE',byline:'STUDENT MONITORING BOOK · TRANSFER LABEL ATTACHED',
    body:[
      {raw:'TRANSFER   CHUNK SURFER'},
      {raw:'SOURCE     corrections 17–46 / reference deck B'},
      '',
      'Again from the first bar. The playback is in the room before I am. By the fourth pass the ensemble and the reference are one mishmash and I cannot tell which one I am correcting.',
      '',
      'Everyone else stopped at 23:10. I continued monitoring.',
    ],
  },
  {
    id:'work-order-carbon',at:{x:66,y:14},room:'main_b3',decay:.18,
    title:'WORK ORDER 4417-C · CARBON',byline:'SITE COPY / AUTHORITY UNCONFIRMED',
    body:[
      {raw:'AUTHORISED   20:14 · day before issue'},
      {raw:'RETURNED     impressed before RECEIVED'},
      '',
      'Five rooms. Names and consent at the gate. Demolition after delivery. The owner field contains W. Ellery Holdings; the living authorising officer field is blank beneath every carbon layer.',
    ],
  },
  {
    id: 'page-1', at: { x: 65, y: 13 }, room: 'main_b3', decay: 0.00,
    title: 'log — 21:40', byline: 'sheet 1',
    body: [
      { raw: 'RIG   MKH-8020 pair, ORTF. Sound Devices. No mains.' },
      { raw: 'REF   -60 dBFS floor in the stairwell. Very good.' },
      '',
      'It was powered down when we arrived. No fridge, no lift, no accidental hum. If anything is singing now, I put it back into the walls myself; I know which board will shut it up.',
      '',
      "Down the west stair to B3 first, because it is the deadest room in the plan and if I can hold a clean minute there I can hold one anywhere. Oh who am I kidding?! I just really hate basements.",
      '',
      'The trick is the same trick it always is: stop moving before you press record, and stay stopped for ten seconds after you think you are done. The room does not settle when you do.',
    ],
  },
  {
    id: 'page-2', at: { x: 15, y: 17 }, room: 'the_tub', decay: 0.04,
    title: 'log — 22:15', byline: 'sheet 2',
    body: [
      { raw: 'B3    take 3. Clean. 60s. Floor -61.' },
      '',
      'Two spoiled before it. My own knee, and then my own jacket. The room is so absorbent that the only thing in the take is me, so there is nothing to do but stop being there while still being there.',
      '',
      'Next is the natatorium, which is the opposite problem. Tile, water gone, six metres of ceiling. Everything you do arrives back four times. Up the stair, along the ground spine, through the foyer, and it is off the foyer to the south.',
      '',
      'The pool is drained. There are steps at the shallow end. Do not step off the coping in the dark; it is a metre and a half onto tile and nobody is coming.',
    ],
  },
  {
    id: 'page-3', at: { x: 85, y: 29 }, room: 'amplifications', decay: 0.08,
    title: 'log — 23:02', byline: 'sheet 3',
    body: [
      { raw: 'TUB   take 1. Clean. 60s. Floor -54, and the -54 is the room.' },
      '',
      'It has a note. An empty concrete tank with a hard ceiling has a note, and this one is a low E, and it is there whether or not anything excites it. I have the take. Whether the client wants a room tone with a pitch in it is between the client and the building.',
      '',
      'Concert hall next. The direct door off the foyer is bricked up — recently, badly, by somebody who was not a bricklayer. The long way is through the natatorium and up the east side.',
      '',
      { raw: '21:40 → 23:02. Ahead of schedule.' },
    ],
  },
  {
    id: 'page-4', at: { x: 102, y: 14 }, room: 'soundnoisemusic', decay: 0.13,
    title: 'log — 00:20', byline: 'sheet 4',
    body: [
      { raw: 'HALL  take 2. Clean. 60s.' },
      '',
      'Nine metres and every one of them full of nothing. I sat in the fourth row with the recorder on my knees and did not move for a minute and ten.',
      '',
      'I want to write down that I heard the hall breathe, so I am writing it down and then I am writing down that a hall of this size has a thermal cycle and the seats are horsehair and it was breathing in the sense that a building breathes.',
      '',
      'Practice wing next. Through the open stair hall off the ground spine, then straight across the upper landing. Four minutes if you know where you are going.',
      '',
      'Radio check missed. I will get the next one.',
    ],
  },
  {
    id: 'page-5', at: { x: 65, y: 60 }, room: 'lux_nova', decay: 0.20,
    title: 'log — 01:35', byline: 'sheet 5',
    paper: {
      marks: [
        { page: 0, type: 'underline', x: 0.160, y: 0.795, w: 0.48, alpha: 0.44 },
        { page: 0, type: 'note', x: 0.670, y: 0.820, text: 'key', rotate: -5, alpha: 0.50 },
      ],
    },
    body: [
      { raw: 'PRAC  take 1. Clean. 60s.' },
      '',
      'Eight practice rooms and an ensemble room, all with the door open. Seven uprights with their lids up, none of them in tune with any of the others. Stands and cases in the rooms without them. In an empty room the pianos are still the loudest thing. A hundred and eighty strings apiece, nothing touching any of them, and still the loudest thing in the building.',
      '',
      'Something happened in the corridor while I was recording, and it is not on the take, and I was wearing the headphones, and the headphones are the only reason I would have heard it.',
      '',
      'Four down. The chapel is the fifth.',
      '',
      { raw: 'My keys do not open the chapel.' },
    ],
  },
  {
    id: 'page-6', at: { x: 138, y: 27 }, room: 'lux_nova', decay: 0.28,
    title: 'log — 02:10', byline: 'sheet 6',
    body: [
      'Rang the client. Told them the chapel is locked and the key on the key ring is for the original chapel lock, not the replacement lock.',
      '',
      'Front of house kept the new spare under key control. Box office cabinet, according to the rekey invoice. The tag is in their ledger, not on this sheet.',
      '',
      'The box office staff door should still answer to the building master key, if the lock has not swollen.',
      '',
      { raw: 'I have started leaving these where I turn around. The plan I was given does not match the floor.' },
    ],
  },
  {
    id: 'page-7', at: { x: 27, y: 31 }, room: null, decay: 0.38,
    title: 'log — 02:5?', byline: 'sheet 7',
    body: [
      'Went back to the dock for the bar. The west stair is not where the west stair is.',
      '',
      'I want to be precise, because I am going to read this later and I am going to want to know exactly how precise I was being. I came up the west stair from B3 at 21:52. I went down it again at 22:08. At 02:51 I walked the ground spine from end to end twice with the light on and the corridor runs straight through and there is no stair off it.',
      '',
      'The stair I came up is behind me somewhere and the corridor I am standing in has one turning in it that I have never seen before.',
      '',
      'I am not lost. I know exactly where every room in this building is. What I do not know is what is between them.',
    ],
  },
  {
    id: 'page-8', at: { x: 35, y: 9 }, room: null, decay: 0.50,
    title: 'log — ??:??', byline: 'sheet 8',
    body: [
      'Test. Stood in the plant room with the light off and the recorder running and did not move for six minutes.',
      '',
      'Nothing changed. Walked the corridor out with the light on and it was the corridor I came in by, every cell of it.',
      '',
      'Test. Same corridor. Light off, and I ran.',
      '',
      'It was a different corridor by the time I stopped.',
      '',
      { raw: 'It moves where it has not been heard. It moves where it has not been heard. It moves where' },
      { raw: 'it has not been heard.' },
      '',
      'So make noise, and it stands still, and the noise brings the other thing. Or hold still, and it rearranges, and the other thing does not know where you are.',
      '',
      'That is not a trap. That is a price list.',
    ],
  },
  {
    id: 'page-9', at: { x: 95, y: 56 }, room: 'lux_nova', decay: 0.64,
    title: 'log — ??:??', byline: 'sheet 9',
    body: [
      'The box-office key cabinet is open. I did not open it.',
      '',
      'I have four clean takes and one room and three nearly identical keys under three different tags. The rekey sheet says the answer is in the front-of-house ledger. I have been sitting outside the chapel for what the recorder says is fifty minutes and what my legs say is longer.',
      '',
      'The client has not answered since midnight. I do not think they have gone home. I think this is what the contract is.',
      '',
      'It wants one thing and it has been extremely clear and extremely patient about what the one thing is, and it is not my life, and it is not my mind, and I am so tired of the way people write about buildings like this.',
      '',
      'It wants a minute of me on the tape.',
      '',
      'That is all. It wants to be a room with something in it.',
    ],
  },
  {
    id: 'page-10', at: { x: 90, y: 68 }, room: null, decay: 0.80,
    title: '—', byline: 'sheet 10',
    body: [
      'Set the rig at the crossing. Levels good. Floor -58.',
      '',
      'Sixty seconds is nothing. I have held sixty seconds a thousand times. I have held it in worse rooms than this for clients who paid less.',
      '',
      'The difference is that this time I am going to be in it.',
      '',
      { raw: 'take 1' },
      '',
      'I would like it on the record that I was not sad, and I was not haunted, and there was no one I was thinking about. I was on the clock. It asked. It was going to be rubble on Thursday and it asked, and I have spent six years being paid to record rooms that nobody will ever stand in again, and not one of them ever asked me for anything.',
      '',
      { raw: 'rolling' },
    ],
  },
];

export const CHAPEL_KEY_CHECK = {
  early_drop: {
    speaker:'FRONT OF HOUSE · KEY CONTROL',
    lines:[
      {who:'direction',text:'The key ring slips from the hook, strikes the steel and swings back into place. The sound leaves the office before you do.'},
    ],
  },
  known_drop:{
    speaker:'FRONT OF HOUSE · KEY CONTROL',
    lines:[
      {who:'direction',text:'The key ring slips from the hook, strikes the steel and swings back into place. The sound leaves the office before you do.'},
      {who:'you',text:'Not C-seventeen.'},
    ],
  },
  early_take:{
    speaker:'FRONT OF HOUSE · KEY CONTROL',
    lines:[
      {who:'direction',text:'C-17 comes off its hook.'},
      {who:'you',text:'C-seventeen.'},
    ],
  },
  known_take:{
    speaker:'FRONT OF HOUSE · KEY CONTROL',
    lines:[
      {who:'direction',text:'C-17 comes off its hook. Brass, two cuts newer than the keys beside it.'},
      {who:'you',text:'C-seventeen. Chapel.'},
    ],
  },
};

// The room the client wants, in the order the work order names them. The
// building decides the order you actually get them in.
export const TARGETS = ['main_b3', 'the_tub', 'amplifications', 'soundnoisemusic', 'lux_nova'];

// Where each room's take is made. The waypoint a page grants points here.
export const ROOM_CELLS = {
  main_b3: { x: 15, y: 12 },
  the_tub: { x: 85, y: 30 },
  amplifications: { x: 102, y: 15 },
  soundnoisemusic: { x: 60, y: 65 },
  lux_nova: { x: 92, y: 74 },
};
export const MAIN_EXIT_CELL = { x:79, y:4 };

// What he thinks when the game has to tell the player something. All of it is
// in his voice, all of it is what a professional would actually notice, and
// none of it is addressed to anyone.
//
// The opening choice does not change stats. It changes what kind of knowledge
// is already in his head when the building starts repeating itself.
export const PROLOGUE_THOUGHTS = {
  // He read the paperwork. He is working a job, and he keeps doing sums.
  self: {
    lightOn: { who: 'you', text: "On. Four hundred quid. Maybe if I keep saying it I won't be so scared." },
    recStart: { who: 'you', text: "One clean minute. That's all they asked for." },
    recDone: { who: 'you', text: "That's one. Eighty quid a room, near enough." },
    playback: { who: 'you', text: 'Check it before I count it.' },
    playbackNone: { who: 'you', text: 'Nothing recorded in here yet.' },
    pageRoom: (room) => ({ who: 'you', text: `His log. He hadn't done ${room} either.` }),
    pageAny: { who: 'you', text: 'His log. Same rooms, same order. He started where I did. I can still leave.' },
  },
  // He talked to the guard. He keeps thinking about a man who went home at ten.
  guard: {
    lightOn: { who: 'you', text: 'On. The guard said the stair light was gone. He was right.' },
    recStart: { who: 'you', text: 'Light off, feet still. Same as it has always been.' },
    recDone: { who: 'you', text: "That's one. Four to go and then I sign the other box." },
    playback: { who: 'you', text: 'Listen back. He would have listened back.' },
    playbackNone: { who: 'you', text: 'Nothing recorded in here yet.' },
    pageRoom: (room) => ({ who: 'you', text: `His log. He still had ${room} to do.` }),
    pageAny: { who: 'you', text: "His log. Nice hand. Kept his own hours, the guard said." },
  },
  // He listened to the tape. He is not frightened. He is arguing with it.
  tape: {
    lightOn: { who: 'you', text: 'On.' },
    recStart: { who: 'you', text: "Roll. It's a room. It has always just been a room." },
    recDone: { who: 'you', text: "That's one, and there was nobody in it." },
    playback: { who: 'you', text: 'Listen back. Listen properly.' },
    playbackNone: { who: 'you', text: 'Nothing recorded in here yet.' },
    pageRoom: (room) => ({ who: 'you', text: `His log. ${room} still wanted its minute.` }),
    pageAny: { who: 'you', text: "His log. He was fine. Right up until he wasn't, he was fine." },
  },
};

// ── him ─────────────────────────────────────────────────────────────────────
// The man who did this job three weeks ago and did not come out of it. He is the
// only other person in the building and he is not in the building.
//
// The protagonist thinks about him the way one tradesman thinks about another
// who died on a site: not with grief, which would be a lie, but with the far
// more frightening thing, which is PROFESSIONAL INTEREST. He wants to know where
// the man's technique failed, because if the technique failed then the man was
// careless, and if the man was careless then this cannot happen to him.
//
// It escalates: respect → identification → the arithmetic → refusal. The last
// rung is the whole thesis of the game, and he says it to nobody, in a corridor.
export const HIM_LINES = [
  { who: 'you', text: "Three weeks ago a man stood exactly here with better mics than mine and did not finish. I keep wanting to know what he did wrong. There is a reason I want that." },
  { who: 'you', text: 'His logs are good. That is the problem. A sloppy log I could dismiss. This is a man who wrote down his floor in dBFS at four in the morning because it was true and it mattered.' },
  { who: 'you', text: 'Six years he had on me. He would have heard this room before he was in it.' },
  { who: 'you', text: 'He slated every take. Take three. Take four. Even at the end, when — no. Especially at the end. Slating is what you do instead of panicking.' },
  { who: 'you', text: 'I have started walking the way he walked. Heel down slow, weight to the outside. I did not decide to do that.' },
  { who: 'you', text: 'The client did not say he died. The client said the job was incomplete. Those are different sentences and they picked the second one on purpose.' },
  { who: 'you', text: 'Here is the arithmetic. He was better than me and it got him. So being better is not the axis. Something else is the axis, and I have been walking around inside it for two hours looking for a fault in his mic technique.' },
  { who: 'you', text: "It wanted something off him. It got it. I have listened to enough of him tonight to know he had it to give — whatever it was, he had lost somebody, or he could be talked into believing he had, and in this place that is the same thing." },
  { who: 'surfer', text: 'he gave it to me. he gave it and gave it and gave it.', rate: 0.9 },
  { who: 'you', text: "Then he was generous and I am not. I have nothing in me it wants. No sister, no wife, no boy on a bike. I have a job, a torch, and a tape with four minutes of nothing on it, and it can starve." },
];

export const LINES = {
  lightOn: { who: 'you', text: 'On. Anything in here with eyes has me now.' },
  lightOff: { who: 'you', text: 'Off.' },
  // LISTEN: the room comes up in the cans, and you can still move.
  listen: { who: 'direction', text: 'Headphones on. The room comes up in the cans — the size of it, the drip somewhere, the hum in the walls. [r] again to roll.' },
  listenOff: { who: 'you', text: 'Not yet. Off it comes.' },
  mustRoll: { who: 'you', text: "No. Levels are set. You don't set a level and walk away — you roll. [r]." },
  already: { who: 'you', text: "Done that one. Clean minute, in the bag. I'm not doing it twice." },
  chapelLocked: { who: 'you', text: 'Not the chapel. Not yet. You do the chapel last, when the other four are on tape.' },
  // ROLL: the room drops out and the hiss comes up, and you must not move.
  recStart: { who: 'direction', text: 'The room drops out of the cans. Tape hiss, and under it nothing, and you have forty-five seconds to hold still inside it.' },
  recDone: { who: 'you', text: 'Clean. One minute of nothing, and the nothing is theirs.' },
  recSpoiled: (why) => ({ who: 'you', text: `Spoiled. ${why[0].toUpperCase()}${why.slice(1)}.` }),
  recAbort: { who: 'you', text: 'Stopped it.' },
  // Moving in a take: he hears his own body on the tape, and now something
  // heard where the body was.
  flinch: [
    { who: 'you', text: "My own knee. That's me on the take. Bloody hell." },
    { who: 'you', text: 'I shifted. I actually shifted. Six years and I shifted.' },
    { who: 'you', text: 'That was me. My jacket, my breathing, me.' },
  ],
  // The real room, through the real mic. His body on the take is yours.
  micNoise: [
    { who: 'you', text: 'That was me. In the room. On the take. Again.' },
    { who: 'you', text: 'Something moved out there and it was me. Hold still. Actually hold still.' },
  ],
  // The player screamed. So does he. The two rooms are the same room now.
  scream: { who: 'me', text: 'AH— no. No. That was — was that me? Was that me?', rate: 1.15 },
  // A sound that is not yours, in a take. The one thing worse than being heard.
  whatWasThat: [
    { who: 'you', text: '...what was that.' },
    { who: 'you', text: 'That was not the tape. That was not me.' },
    { who: 'you', text: "Say it wasn't in the room. Say it out loud. — I can't." },
  ],
  playback: { who: 'direction', text: 'Headphones on. Whatever plays now, the room cannot hear.' },
  playbackEnd: { who: 'direction', text: 'End of take.' },
  playbackNone: { who: 'you', text: 'Nothing recorded in this room.' },
  pageRoom: (room) => ({ who: 'you', text: `Somebody's log. ${room} still needs tone.` }),
  pageAny: { who: 'you', text: "Somebody's log. He was working the same list I am." },
  caught: (n) => ({ who: 'you', text: n === 1
    ? 'It found me. That is going to be on every take from here.'
    : `It found me again. ${n} now. I am the loudest thing in this building.` }),
  guest: { who: 'direction', text: 'There is something on the tape that was not in the room.' },
  // He will not write down another room until the basement is done. He is not
  // being prevented from walking there; he is declining to plan it.
  basementFirst: { who: 'you', text: "No. I really want the basement out of the way while I've still got my legs." },
  // The one thing the recordist will not do out of order: roll a real take
  // before he has set his levels, in the dark, at B3. Nothing counts until then.
  // Levels are set on the dock, not here — this refuses a REAL take attempted
  // before setup is done, so it has to say where setup happens and with what.
  needLevels: { who: 'you', text: "Not yet. I never set the levels — six seconds of test audio and then I can head down to the basement." },
};

// ── what the building does with what it heard ───────────────────────────────
// He said something out loud, once, in the dark, eleven seconds after the door
// went. The playback is where it comes back. `playback.js` chooses the buffer;
// this chooses the words.
//
// The `nothing` case is the worst, and it is worth being precise about why. It
// has nothing of his to give back, so it gives him the dead man instead — the
// same four words, three times, at an identical level. `tape.run.again` already
// taught the player that a voice in a room is never the same twice. So this is
// not a voice in a room.
// Exact reference is the pressure, and the game lets the player infer that
// before it names it. Recording remains technically safe; every complete
// playback gives the same diffuse density another identical route through a
// room. Breadth and repetition let that density cohere, while variation breaks
// the match. The previous contractor heard the sequence before this operator;
// the conservatory student endured it as compulsory practice until the
// performance no longer stopped with the session. Neither person created HUSH.
// `n` remains a compatibility input; ReferenceExposureV1 is now authoritative.
export function guestLines(kind, value, n = 1) {
  const under = n >= 4
    ? { who: 'direction', text: 'It is not under the noise floor. It is at the level of the room, and it always was.' }
    : n >= 2
      ? { who: 'direction', text: 'Under the noise floor, and closer up than it was in the last room.' }
      : { who: 'direction', text: 'Under the noise floor, coming up. Not a word. Then a word.' };

  const after = n >= 5
    ? [
      { who: 'you', text: 'Five rooms. I have listened to five rooms.' },
      { who: 'recordist', text: 'So did I.' },
    ]
    : [];

  if (kind === 'name' && value && value !== 'nobody') {
    return [
      under,
      { who: 'surfer', text: `...${value}?`, rate: 0.9 },
      { who: 'you', text: 'I said that name in a room with nobody in it.' },
      ...after,
    ];
  }
  if (kind === 'name') {
    return [
      under,
      { who: 'surfer', text: 'Nobody is expecting you.', rate: 0.9 },
      { who: 'you', text: 'That is my sentence. That is my sentence with the ends taken off.' },
      ...after,
    ];
  }
  if (kind === 'reason' || kind === 'feeling') {
    return [
      under,
      { who: 'surfer', text: 'You finish, and you thank it.', rate: 0.88 },
      { who: 'direction', text: 'And again, four seconds later, at exactly the same level.' },
      { who: 'you', text: 'A voice in a room is never the same twice.' },
      ...after,
    ];
  }
  // He gave it nothing, so it uses the last man.
  return [
    under,
    { who: 'recordist', text: 'Take four. Clean.' },
    { who: 'recordist', text: 'Take four. Clean.' },
    { who: 'recordist', text: 'Take four. Clean.' },
    { who: 'you', text: 'Minus forty-one. Three times. Not one decibel between them.' },
    ...after,
  ];
}

// ── TAKEN ────────────────────────────────────────────────────────────────────
// You wake where you did not lie down, short of time and short of kit. He does
// not panic. He inventories, which is worse, because a man doing an inventory in
// a condemned building at four in the morning has decided to carry on.
const LOST_LINE = {
  recorder: [
    { who: 'you', text: 'The recorder. It has taken the recorder.' },
    { who: 'you', text: 'Without it I am a man standing in the dark for no money at all. I have to find it. There is no version of the night where I do not find it.' },
  ],
  torch: [
    { who: 'you', text: 'The torch is gone.' },
    { who: 'you', text: 'Fine. The eyes come up in twenty minutes. They always do. You can work in this — you can just about work in this.' },
  ],
  map: [
    { who: 'you', text: 'The plan. It has taken the plan out of the bag.' },
    { who: 'you', text: 'Which is a joke, because the drawings were wrong anyway. Now I have got nothing to be wrong with.' },
  ],
  radio: [
    { who: 'you', text: 'It has taken the radio.' },
    { who: 'you', text: 'The dead radio. The one thing in the bag that does nothing.' },
    { who: 'direction', text: 'That is not a theft. That is a message, and he has understood it.' },
  ],
};
const FOUND_LINE = {
  recorder: { who: 'you', text: 'There. On the floor, lid open, still running. It has been recording the whole time it had it.' },
  torch: { who: 'you', text: 'The torch. Still on. Pointing at nothing, the way it was left.' },
  map: { who: 'you', text: 'The plan, folded the way I do not fold it.' },
  radio: { who: 'you', text: 'The radio. Squelching, for nobody. Back on the belt.' },
};
export function takenLines(minutes, item, roomLabel) {
  return [
    { who: 'direction', text: `You come to on the floor of ${roomLabel}, which is not a room you walked into.` },
    { who: 'you', text: `${minutes} minutes. I have lost ${minutes} minutes and they were not mine to lose.` },
    { who: 'direction', text: 'The bag is open. He goes through it on his knees, in the dark, the way you check for a wallet.' },
    ...(LOST_LINE[item] || []),
    { who: 'you', text: 'It went that way. I think it went that way. I am going to mark it and I am going to be wrong.' },
  ];
}
export function foundLine(item) { return FOUND_LINE[item] || { who: 'you', text: 'Got it.' }; }

// ── M5 · the endings ─────────────────────────────────────────────────────────
// After the confrontation you survive: it stops wearing faces and it waits. This
// is the fork. `ending.choice` is set here and read by main.js. The rig option
// only exists if you took the bent recorder from the plant room (`has.interface`).
export function endingChoice(options = {}, legacyCanSurface = false) {
  const opts = typeof options === 'object' && options !== null
    ? options
    : { hasRig: !!options, canInvert: !!options, canSurface: !!legacyCanSurface };
  const readings = Array.isArray(opts.readings) ? opts.readings : [];
  const locks = new Set(Array.isArray(opts.locks) ? opts.locks : []);
  // Combat proofs arrive as { readingId, meaning, text }; the challengeId
  // field only existed under the retired redact battles, kept as a fallback
  // for old saves.
  const readingKey = (r) => String(r.readingId || r.challengeId || '');
  const source = opts.sourceReading || readings.find((r) => /source/i.test(readingKey(r))) || null;
  const byProof = (needle) => readings.find((r) => readingKey(r).includes(needle));
  const sourceLine = source?.text
    ? `The last page still reads: ${source.text}.`
    : 'The last page is still sounding. Nobody has read it onto tape.';
  const lines = [
    { who: 'direction', text: readings.length
      ? 'The five pages keep the shape you gave them. The recorder is still running on the floor between the three of you.'
      : 'It is not attacking any more. It is waiting, the recorder still running on the floor between the three of you.' },
    { who: 'direction', text: sourceLine },
  ];
  const recordist = byProof('recordist');
  if (recordist) lines.push({ who: 'recordist', text: readingKey(recordist) === 'return.recordist'
    || recordist.meaning === 'The prior recordist is still recoverable.'
    ? 'I am still in here. That is what your take proves. Do not hand it the master.'
    : 'Careful. The sentence it likes best is the sentence where I agreed.' });
  if (opts.canSurface) lines.push({ who: 'direction', text: 'The fork and the rig answer the same line. The borrowed body is not sealed.' });
  else if (locks.has('route.surfaced')) lines.push({ who: 'direction', text: 'RETURN is missing from too many pages. Something could still be saved, but not cleanly.' });
  if (opts.canInvert) lines.push({ who: 'direction', text: 'The bent rig has enough of the source to feed the signal back into itself.' });
  lines.push({ who: 'surfer', text: 'Well. Bring me one.' });

  const invert = opts.canInvert
    ? [{ text: 'Play the room back to itself through the broken rig.', goto: 'invert', set: ['ending.choice=inversion'] }]
    : [];
  const surface = opts.canSurface
    ? [{ text: 'Tune the borrowed body loose from the source.', goto: 'surface', set: ['ending.choice=surfaced'] }]
    : [];
  const choices = [
    { text: 'Give the room the agreement it is asking for.', goto: 'feed', set: ['ending.choice=sacrifice'] },
    ...invert,
    ...surface,
    { text: 'Refuse to author another line.', goto: 'nothing' },
  ];

  return {
    start: { speaker: 'THE CHAPEL', lines, choices },
    nothing: {
      speaker: 'THE CHAPEL',
      lines: [
        { who: 'you', text: 'There is nothing there.' },
        { who: 'direction', text: 'You hold it. A room can wait longer than a man can, and it knows the number.' },
      ],
      choices: [
        { text: 'Give the room the agreement it is asking for.', goto: 'feed', set: ['ending.choice=sacrifice'] },
        ...invert,
        ...surface,
      ],
    },
    feed: { speaker: 'THE CHAPEL', lines: [
      { who: 'you', text: 'All right. All right. Here — take it.' },
      { who: 'surfer', text: 'There. See. A clear reading.' },
    ], goto: 'done' },
    invert: { speaker: 'THE CHAPEL', lines: [
      { who: 'you', text: 'No. The source is not a body. It is a signal with a habit of asking.' },
      { who: 'direction', text: 'The bent recorder plays the room back to itself, and the agreement loses its addressee.' },
    ], goto: 'done' },
    surface: { speaker: 'THE CHAPEL', lines: [
      { who: 'you', text: 'No. That body is not an instrument.' },
      { who: 'recordist', text: 'Then make the room read it.' },
      { who: 'direction', text: 'The tuning fork sounds once, and the room loses the line it was using to stand upright.' },
    ], goto: 'done' },
  };
}

// ENDING A AND THE COFFEE VERSION OF IT ARE AUTHORED CONTENT NOW.
//
// sacrificeEnding() and helpedEnding() lived here and were migrated to
// content/narrative/ending.sacrifice.*.story.json as twelve and two files — the
// same six lines with one substituted ordinal and one substituted name. Both are
// single conditional documents now (ending.sacrifice, ending.helped) that read
// the run's dossier, so there is nothing left here to keep in sync. See
// data/endings.js for the contract and game/ending-runtime.js for the dossier.

// ENDING B AND THE DRUGGED READING OF IT ARE AUTHORED CONTENT NOW.
//
// INVERT_START and FALSE_DOOR survive as authored documents because they are not
// endings — they are the invert and the door that is not where the door is, both
// of which happen mid-escape. rescueEnding(), INVERSION_FINAL and druggedReveal()
// were migrated and then rewritten: ending.inversion and ending.drugged are
// single conditional documents that read the run's dossier. See data/endings.js.

// THE SIX GATE EPILOGUES ARE AUTHORED CONTENT NOW.
//
// guardEpilogue() lived here and was migrated to content/narrative/
// ending.epilogue.*.story.json, and then rewritten: they are the last page of the
// game and they were five lines each, and three of the six never touched the
// RETURNED column, which is the best object in this story. See data/endings.js —
// each ending declares which coda closes it, and every coda reads the dossier.
