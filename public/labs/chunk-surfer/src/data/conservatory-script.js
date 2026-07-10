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
// PAGE DECAY: `decay` 0..1 erodes glyphs (see game/document.js). It rises with
// page number. It is the ink and the paper, and it says nothing about his mind.

export const WORK_ORDER = {
  id: 'work-order',
  title: 'Work Order 4417-C',
  byline: 'ARCHIVAL CAPTURE — issued to the contractor named below',
  decay: 0,
  dismiss: '[ esc — fold it and put it in your pocket ]',
  body: [
    { raw: 'SITE      Ellery Conservatory of Music (condemned)' },
    { raw: 'WINDOW    one night. Demolition begins 06:00 Thursday.' },
    { raw: 'DELIVER   five room tones. Sixty seconds each, unbroken.' },
    '',
    { rule: true },
    '',
    'The building is powered down at the street. Take a light.',
    '',
    'We need the rooms as they are. One clean minute of each, with nothing in it. No handling noise, no clothing, no breath. If you can hear yourself on the take, the take is not the room, and we will not accept it.',
    '',
    'Record: studio B3, the natatorium, the concert hall, the practice wing, and the chapel. Work in whatever order the building permits. It has been altered since the drawings were filed and we do not have current drawings.',
    '',
    'You carry the standard keyring. Where it does not open a door, there will be another way, because there always is in a building of this age. Do not force anything. Everything here is due to come down regardless, and we are not paying for a wall.',
    '',
    'Check in on the hour by radio.',
    '',
    { rule: true },
    '',
    'The prior contractor delivered four accepted room tones. The packet was settled for four. The account remains open because five boxes were commissioned and five boxes close it.',
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

export const COLD_OPEN_DIALOGUE = {
  start: {
    speaker: 'SERVICE BOOTH · 21:38',
    lines: [
      { who: 'direction', text: 'A lit booth at the vehicle gate. Coffee, key hooks, a stack of forms, a small television with the sound off.' },
      { who: 'guard', text: 'Ellery? Christ. They actually sent someone tonight.' },
      { who: 'me', text: "Sound. There should be a work order. Four four one seven?" },
      { who: 'guard', text: 'Came through about four.' },
      { who: 'direction', text: "He finds a pen. It doesn't work. He puts it back in the pot with the others." },
      { who: 'guard', text: 'My wife buys these. Twelve in a pack, and not one of them.' },
      { who: 'direction', text: 'Rain on the roof of the booth, and on the skips out in the yard.' },
      { who: 'guard', text: "Five rooms, it says. That's a lot of rooms." },
      { who: 'me', text: "It's a minute each. It's the waiting about that takes the night." },
      { who: 'guard', text: 'You brought a torch? Nobody brings a torch.' },
      { who: 'me', text: 'I brought a torch.' },
    ],
    choices: [
      {
        text: 'look at the work order again',
        goto: 'order',
        set: ['prologue.knowledge.self'],
        clear: ['prologue.knowledge.guard', 'prologue.knowledge.tape'],
      },
      {
        text: 'ask him about the building',
        goto: 'guard',
        set: ['prologue.knowledge.guard'],
        clear: ['prologue.knowledge.self', 'prologue.knowledge.tape'],
      },
      {
        text: "put the headphones on — the client sent the last man's takes",
        goto: 'tape',
        set: ['prologue.knowledge.tape'],
        clear: ['prologue.knowledge.self', 'prologue.knowledge.guard'],
      },
    ],
  },

  // ── trunk one: the paperwork ──────────────────────────────────────────────
  order: {
    speaker: 'THE WORK ORDER',
    lines: [
      { who: 'direction', text: 'One page. A letterhead, a list, and a signature photocopied enough times to be a smudge.' },
      { who: 'you', text: "Four hundred, half on acceptance. That's fine. That's more than fine." },
    ],
    choices: [
      { text: 'the money', goto: 'order.money' },
      { text: 'the wording', goto: 'order.words' },
      { text: 'the client', goto: 'order.client' },
      { text: 'why Thursday', goto: 'order.deadline' },
      { text: 'the last contractor', goto: 'order.last' },
      { text: 'fold it up', goto: 'threshold' },
    ],
  },
  'order.money': {
    speaker: 'THE WORK ORDER',
    lines: [
      { who: 'you', text: "Four hundred for a night's work in a building with no power in it." },
      { who: 'you', text: "It's about double. I noticed that at four o'clock and I said yes at five past." },
    ],
    goto: 'order',
  },
  'order.words': {
    speaker: 'THE WORK ORDER',
    lines: [
      { who: 'you', text: '"The room as it is." "One clean minute." "If you can hear yourself on the take, the take is not the room."' },
      { who: 'you', text: "That's my own language, back at me." },
      { who: 'you', text: "Somebody there has talked to a recordist before. Which is fine. It only means they know what they are asking for." },
    ],
    goto: 'order',
  },
  'order.client': {
    speaker: 'THE WORK ORDER',
    lines: [
      { who: 'you', text: 'W. Ellery Holdings. Same name as the building, which tells you nothing, because they bought the name with it.' },
      { who: 'you', text: 'No website. A landline and a post box in Croydon.' },
      { who: 'you', text: "I've worked for worse and been paid slower." },
    ],
    goto: 'order',
  },
  'order.deadline': {
    speaker: 'THE WORK ORDER',
    lines: [
      { who: 'you', text: 'Thursday, six in the morning. After that there is no building to be in.' },
      { who: 'you', text: "So there's no coming back on Friday to pick up the ones I missed." },
      { who: 'you', text: "Five, or four, or none. Tonight is the whole job." },
    ],
    goto: 'order',
  },
  'order.last': {
    speaker: 'THE WORK ORDER',
    lines: [
      { who: 'you', text: '"The last contractor delivered four of the five. We have paid his invoice in full."' },
      { who: 'you', text: 'Four out of five.' },
    ],
    choices: [
      { text: 'read that sentence again', goto: 'order.last.paid' },
      { text: 'back to the order', goto: 'order' },
    ],
  },
  'order.last.paid': {
    speaker: 'THE WORK ORDER',
    lines: [
      { who: 'you', text: '"We have paid his invoice in full."' },
      { who: 'you', text: 'Nobody pays for four fifths of anything. Not once, not ever, not without a phone call first.' },
      { who: 'you', text: "That's a sentence written by somebody who did not want to write a longer one." },
      { who: 'you', text: 'And then they sent it to me, in writing, before I said yes.' },
    ],
    goto: 'order',
  },

  // ── trunk two: the guard ──────────────────────────────────────────────────
  guard: {
    speaker: 'NIGHT GUARD',
    lines: [
      { who: 'me', text: "You know the building at all?" },
      { who: 'guard', text: 'Keys and forms. Past the door is nothing to do with me.' },
      { who: 'direction', text: 'He turns the television down. It was already off.' },
    ],
    choices: [
      { text: 'have you ever been inside?', goto: 'guard.inside' },
      { text: 'was there someone here before me?', goto: 'guard.last' },
      { text: "what was his name?", goto: 'guard.name' },
      { text: "who's on after ten?", goto: 'guard.shift' },
      { text: 'anything I should know?', goto: 'guard.know' },
      { text: 'take the keys', goto: 'threshold' },
    ],
  },
  'guard.inside': {
    speaker: 'NIGHT GUARD',
    lines: [
      { who: 'me', text: 'Have you been in?' },
      { who: 'guard', text: 'No.' },
      { who: 'me', text: 'Not allowed?' },
      { who: 'guard', text: 'Not interested.' },
      { who: 'direction', text: 'He says it the way people say they do not like olives.' },
    ],
    choices: [
      { text: 'push him on it', goto: 'guard.inside.why' },
      { text: 'leave it', goto: 'guard' },
    ],
  },
  'guard.inside.why': {
    speaker: 'NIGHT GUARD',
    lines: [
      { who: 'me', text: 'Eleven years on the gate and you have never once had a look?' },
      { who: 'guard', text: 'Not interested.' },
      { who: 'direction', text: 'He says it exactly the same way. Same three words, same speed. It is not a wall. There is nothing behind it.' },
      { who: 'guard', text: "It's a building, mate. I've got a chair." },
    ],
    goto: 'guard',
  },
  'guard.last': {
    speaker: 'NIGHT GUARD',
    lines: [
      { who: 'me', text: 'There was a bloke before me. Few weeks back.' },
      { who: 'guard', text: 'Yeah. Nice enough. Kept his own hours.' },
      { who: 'me', text: 'Did he come out?' },
      { who: 'direction', text: 'The guard turns the form around and taps a box near the bottom.' },
      { who: 'guard', text: 'Initial there as well. They want it twice now.' },
      { who: 'me', text: '...' },
      { who: 'guard', text: 'My shift ends at ten. I was home.' },
    ],
    goto: 'guard',
  },
  'guard.name': {
    speaker: 'NIGHT GUARD',
    lines: [
      { who: 'me', text: "What was he called, the last one?" },
      { who: 'guard', text: 'Hang on.' },
      { who: 'direction', text: 'He turns the book around and runs a finger up the column, past tonight, past the rain, into September.' },
      { who: 'guard', text: 'There. Received, that one. And the box next to it is empty.' },
      { who: 'direction', text: 'It is the same book you are about to sign.' },
      { who: 'guard', text: "Can't read his writing. Nobody can read anybody's writing." },
    ],
    goto: 'guard',
  },
  'guard.shift': {
    speaker: 'NIGHT GUARD',
    lines: [
      { who: 'me', text: "Who's on the gate after you?" },
      { who: 'guard', text: "Nobody. Site's condemned. They stopped paying for the night after they stopped paying for the power." },
      { who: 'me', text: 'So I ring the bell at three in the morning and.' },
      { who: 'guard', text: 'And nothing. Gate code is on your sheet.' },
      { who: 'guard', text: "It's a demolition, not a bank." },
    ],
    goto: 'guard',
  },
  'guard.know': {
    speaker: 'NIGHT GUARD',
    lines: [
      { who: 'guard', text: "Light's gone in the basement stair. Which you knew, because you brought a torch." },
      { who: 'guard', text: 'And the radio. If it goes funny, do not shake it.' },
      { who: 'me', text: 'What happens if I shake it?' },
      { who: 'guard', text: 'Nothing. That is why I said do not.' },
      { who: 'direction', text: 'He laughs. He has been waiting all week to say that to somebody.' },
    ],
    goto: 'guard',
  },

  // ── trunk three: the tape ─────────────────────────────────────────────────
  tape: {
    speaker: 'REFERENCE FILES · 04 (NO SLATE)',
    tape: true,
    lines: [
      { who: 'direction', text: 'Four files on the card. Three are slated and clean. The fourth begins already running.' },
      { who: 'recordist', text: 'Take four.' },
      { who: 'direction', text: 'Forty seconds of a room.' },
      { who: 'recordist', text: "That's clean. That's four." },
      { who: 'direction', text: 'A chair. He stands up.' },
    ],
    choices: [
      { text: 'let it run', goto: 'tape.run' },
      { text: 'check the levels on it', goto: 'tape.levels' },
      { text: "there's no slate on this one", goto: 'tape.slate' },
      { text: 'stop the file', goto: 'threshold' },
    ],
  },
  'tape.levels': {
    speaker: 'REFERENCE FILES · 04 (NO SLATE)',
    tape: true,
    lines: [
      { who: 'you', text: 'Floor sits at fifty-eight. No hum, no traffic, no handling.' },
      { who: 'you', text: "It's a beautiful take. I would have sent it." },
      { who: 'you', text: 'He was better than me.' },
    ],
    goto: 'tape',
  },
  'tape.slate': {
    speaker: 'REFERENCE FILES · 04 (NO SLATE)',
    tape: true,
    lines: [
      { who: 'you', text: 'You slate everything. Room, take, date. You say it out loud before you roll.' },
      { who: 'you', text: "You do it so that in eight months, when the file is a number, somebody knows what they're listening to." },
      { who: 'you', text: 'He slated the other three.' },
      { who: 'you', text: 'So either he stopped bothering, or he did not start this one.' },
    ],
    goto: 'tape',
  },
  'tape.run': {
    speaker: 'REFERENCE FILES · 04 (NO SLATE)',
    tape: true,
    lines: [
      { who: 'recordist', text: "One more and I'm out of here." },
      { who: 'direction', text: 'The file does not end. It goes on not ending for a while.' },
      { who: 'surfer', text: 'Who did you lose.' },
      { who: 'recordist', text: '...say again?' },
      { who: 'surfer', text: 'It is how this goes. You lost her. I am her. You come in and you look for her.' },
      { who: 'recordist', text: "I haven't lost anybody." },
      { who: 'surfer', text: 'Everybody has lost somebody.' },
      { who: 'recordist', text: 'No.' },
      { who: 'direction', text: 'Thirty seconds of the room, at the same level as before.' },
      { who: 'surfer', text: 'Then bring me one.' },
    ],
    choices: [
      { text: 'wind it back', goto: 'tape.run.again' },
      { text: 'listen to the end', goto: 'tape.end' },
      { text: 'take the headphones off', goto: 'threshold' },
    ],
  },
  'tape.run.again': {
    speaker: 'REFERENCE FILES · 04 (NO SLATE)',
    tape: true,
    lines: [
      { who: 'direction', text: 'Back forty seconds. The room, the chair, the man standing up.' },
      { who: 'surfer', text: 'Who did you lose.' },
      { who: 'you', text: 'Same words. Same level. Minus forty-one, both times.' },
      { who: 'direction', text: 'A voice in a room does not arrive at the same level twice. A voice in a room is never the same twice.' },
      { who: 'you', text: "That is not a person in a room. That is on the file." },
      { who: 'you', text: 'Which is worse, and I have not worked out why yet.' },
    ],
    goto: 'tape.run',
  },
  'tape.end': {
    speaker: 'REFERENCE FILES · 04 (NO SLATE)',
    tape: true,
    lines: [
      { who: 'direction', text: 'The rest of the file is a room. Nine minutes of it. He does not speak again, and neither does anything else.' },
      { who: 'you', text: 'That is the best room tone I have ever heard.' },
      { who: 'direction', text: 'The file ends. It does not end on anything.' },
    ],
    goto: 'threshold',
  },

  // ── the threshold ─────────────────────────────────────────────────────────
  threshold: {
    speaker: 'SERVICE BOOTH · 21:44',
    lines: [
      { who: 'direction', text: 'He turns the book around. Two boxes on the line with your name in it.' },
      { who: 'guard', text: 'Sign where it says received.' },
      { who: 'direction', text: 'You sign the first box. The second one says returned, and it is the width of a fingernail, and it is empty all the way up the page.' },
      { who: 'guard', text: "Don't sign the other one. That's for when you come back out." },
      { who: 'direction', text: 'He slides the keys under the glass, and a radio, and the form back.' },
      { who: 'me', text: 'Channel two?' },
      { who: 'guard', text: 'Channel two. They said on the hour.' },
      { who: 'guard', text: "Grey door, end of the yard. I'll be here till ten." },
      { who: 'direction', text: 'He is already looking at the television.' },
    ],
  },
};

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
//                        to an empty box marked returned.
//   heard the tape    →  WHAT he is feeling. He has already been asked who he
//                        lost, and he said no, so that is the one question he
//                        will not put to himself. He deflects.
//
// Each writes confession.kind ∈ {reason, name, feeling, nothing}. The building
// uses it later, in the playback, under the noise floor.

const PUSH_BAR = [
  { who: 'direction', text: 'You reach back for the push bar. You always do, the way you check a door you have just come through.' },
  { who: 'direction', text: 'Painted breeze block, cold, and a seam of mortar where your thumb expects steel.' },
  { who: 'you', text: 'Hm.' },
  { who: 'direction', text: 'You go along the wall with the flat of your hand. Two metres left. Two metres right.' },
  { who: 'you', text: "It's a dark room and I came in eleven seconds ago and I have already lost a door." },
  { who: 'you', text: 'Which is what happens in a dark room. It is the oldest thing that happens in a dark room.' },
  { who: 'you', text: 'My pulse is up. That is the actual news here. Not the door. The pulse.' },
];

const STEEL_YOURSELF = [
  { who: 'you', text: "I'll find it on the way out, when I'm not standing here like this." },
  { who: 'direction', text: 'Which is true. It is also exactly the reasoning that keeps a man inside a building.' },
];

export const POST_DOOR = {
  // ── he read the paperwork: why he does not leave ─────────────────────────
  self: {
    speaker: '',
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
    lines: [
      ...PUSH_BAR,
      ...STEEL_YOURSELF,
      { who: 'you', text: 'Who did you lose.' },
      { who: 'you', text: "That's his sentence. That is a sentence off a file, in a booth, with the rain on it." },
      { who: 'you', text: 'I am not answering a wav.' },
    ],
    choices: [
      { text: '"I\'m frightened. Fine. Noted. Moving on."',
        goto: 'done', set: ['confession.kind=feeling', 'confession.value=named'] },
      { text: '"I\'m tired. I\'ve been up since five. That is all this is."',
        goto: 'done', set: ['confession.kind=feeling', 'confession.value=denied'] },
      { text: '"Levels. Slate. Roll. Levels. Slate. Roll."',
        goto: 'done', set: ['confession.kind=feeling', 'confession.value=procedure'] },
      { text: '(say nothing at all.)',
        goto: 'done', set: ['confession.kind=nothing'] },
    ],
  },

  done: {
    speaker: '',
    lines: [
      { who: 'direction', text: 'The room takes it, the way a room takes anything.' },
      { who: 'you', text: 'Right. Torch.' },
    ],
  },
};

// ── the first take ──────────────────────────────────────────────────────────
// The only place the game says the rule out loud, at the one moment the player
// is about to learn it the hard way. Fires once, in studio B3. Every take after
// this is the bare verb.
export const FIRST_TAKE = {
  start: {
    speaker: '',
    lines: [
      { who: 'you', text: 'Studio B3. Foam on three walls, carpet, a dead ceiling. This is the quietest room in the building and it is going to be the hardest.' },
      { who: 'direction', text: 'The recorder is in your hand. The room is doing nothing, loudly.' },
    ],
    choices: [
      { text: 'set the rig down on the case, not the floor', goto: 'rig' },
    ],
  },
  rig: {
    speaker: '',
    lines: [
      { who: 'direction', text: 'The floor is a drum. The case is not. Thirty years of knowing that.' },
      { who: 'you', text: 'Levels.' },
    ],
    choices: [
      { text: 'check the levels', goto: 'levels' },
    ],
  },
  levels: {
    speaker: '',
    lines: [
      { who: 'direction', text: 'The meter finds the room. Minus sixty-one, and the last two decibels of that are you.' },
      { who: 'you', text: 'Your jacket. Your knee. Your breathing, which you cannot switch off, only slow down.' },
      { who: 'you', text: "And the torch, which is a filament, and a filament in a dead building is a bell." },
    ],
    choices: [
      { text: 'kill the light', goto: 'dark' },
      { text: 'keep the light on a moment longer', goto: 'linger' },
    ],
  },
  linger: {
    speaker: '',
    lines: [
      { who: 'direction', text: 'Foam. Carpet. A music stand somebody folded and left. It is a room.' },
      { who: 'you', text: 'Nothing in here. Right.' },
    ],
    choices: [
      { text: 'kill the light', goto: 'dark' },
    ],
  },
  dark: {
    speaker: '',
    lines: [
      { who: 'direction', text: 'Dark. The kind with no shape in it, because there is nothing to make a shape out of.' },
      { who: 'you', text: 'Forty-five seconds. Do not move. Do not touch the light.' },
      { who: 'you', text: 'If I can hear myself on the take, the take is not the room. Their words. My words first.' },
    ],
    choices: [
      { text: 'roll', goto: 'roll' },
    ],
  },
  roll: {
    speaker: '',
    lines: [
      { who: 'direction', text: 'The monitor opens. The room is louder than it looks.' },
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
      { who: 'direction', text: 'Something in the corridor behind you. Not a sound, exactly. A change in what the silence is shaped like.' },
      { who: 'you', text: 'Right.' },
    ],
    choices: [
      { text: '"That is a building settling. They do that."', goto: 'settle' },
      { text: '"That is footsteps."', goto: 'steps' },
      { text: '(do not turn around.)', goto: 'still' },
    ],
  },
  settle: {
    speaker: '',
    lines: [
      { who: 'you', text: 'Brick lets go of heat all night. Timber moves. Everything in here is on its way down anyway.' },
      { who: 'direction', text: 'All of that is true, and none of it is what you heard.' },
    ],
  },
  steps: {
    speaker: '',
    lines: [
      { who: 'you', text: 'Twenty metres. Slow. Not looking for anything, because it already knows.' },
      { who: 'you', text: 'Say it properly: it went to where I made a noise. It did not come to me.' },
      { who: 'direction', text: 'That is worse, and it is also the only useful thing anybody has said tonight.' },
    ],
  },
  still: {
    speaker: '',
    lines: [
      { who: 'direction', text: 'You do not turn around. You stand in a dead building with your back to a corridor and you are perfectly, professionally still.' },
      { who: 'you', text: 'This is the job. This is literally the job.' },
    ],
  },
};

// ── the radio, afterwards ───────────────────────────────────────────────────
// The guard told him twice. Shaking it is a price the player chooses, and it
// is delivered by dialogue, and the building hears it.
export const RADIO_DEAD = {
  start: {
    speaker: '',
    lines: [
      { who: 'direction', text: 'The carrier is gone. No hiss, no channel, not even the sound of a channel with nobody on it.' },
      { who: 'you', text: 'Dead. And it stays clipped to my belt, because it is their radio.' },
    ],
    choices: [
      { text: 'try channel two again', goto: 'again' },
      { text: 'shake it', goto: 'shake' },
      { text: 'clip it back on and get on with it', goto: 'clip' },
    ],
  },
  again: {
    speaker: '',
    lines: [
      { who: 'me', text: 'Four four one seven, radio check.' },
      { who: 'direction', text: 'Nothing. Not silence — nothing. A silence would have a floor to it.' },
      { who: 'me', text: 'Four four one seven.' },
    ],
    choices: [
      { text: 'shake it', goto: 'shake' },
      { text: 'clip it back on', goto: 'clip' },
    ],
  },
  shake: {
    speaker: '',
    lines: [
      { who: 'direction', text: 'You shake it. Everybody shakes it.', cue: 'squelch', shake: 1.1, shakeMs: 260 },
      { who: 'direction', text: 'A squelch, one syllable long, at about ninety decibels, in a building where the loudest thing all night has been your own knee.' },
      { who: 'you', text: 'He told me not to do that.' },
      { who: 'you', text: 'He told me twice, and he thought it was funny, and it was.' },
    ],
    goto: 'clip',
  },
  clip: {
    speaker: '',
    lines: [
      { who: 'direction', text: 'It goes back on your belt, where it will stay, because it is not yours to leave anywhere.' },
    ],
  },
};

// After the booth: the yard, the door, and the last ordinary sound of the night.
export const COLD_OPEN = [
  { who: 'direction', text: 'The yard. Rain on the skips, and a hundred metres of nothing between the booth and the grey door.', hold: 2.6 },
  { who: 'you', text: 'Basement first. It will be the hardest and I want it behind me.', hold: 2.4 },
  { who: 'direction', text: 'The key turns. The door is heavier than it looks, the way fire doors are.', hold: 2.4 },
  { who: 'direction', text: 'The service door closes behind you.',
    cue: 'door', shake: 2.2, shakeMs: 620, flash: true, flashMs: 220, hold: 3.2 },
  { who: 'you', text: 'Darker than the yard. Which is stupid, because the yard was dark.', hold: 2.6 },
  { who: 'you', text: 'And quieter. No rain in here. No rain, no traffic, no plant, no lift.', hold: 2.8 },
  { who: 'you', text: 'Minus sixty, near enough, before I have taken the recorder out of the bag.', hold: 2.8 },
  { who: 'direction', text: 'You put the bag down and go through it by feel.', cue: 'bag', hold: 2.6 },
  { who: 'you', text: 'Torch. Recorder. Headphones. Radio. Keys. The order, folded twice.', hold: 2.8 },
  { who: 'you', text: 'Five rooms, a minute each, and then I drive home.', hold: 3.2 },
];

// ── the radio ───────────────────────────────────────────────────────────────
// Two transmissions. It works, and then it is a thing on your belt that makes
// noise. It speaks: these go through the voice band, at radio pace, and the
// player hears them the way the recordist does — while standing in a corridor,
// unable to make them go faster.

export const TRANSMISSIONS = [
  // 1 — at the dock, before you go in. Ordinary, bureaucratic, and short.
  [
    { who: 'radio', text: '4417-C, go ahead.' },
    { who: 'me', text: 'On site. Starting in the basement.' },
    { who: 'radio', text: 'Copy. Top of the hour.' },
    { who: 'direction', text: 'A chair, somewhere behind him. Someone else laughing at something else.', hold: 2.4 },
  ],
  // 2 — after the first take. Also ordinary. Until it is not.
  [
    { who: 'radio', text: '4417-C, go ahead.' },
    { who: 'me', text: 'One down. Studio B3. Clean.' },
    { who: 'radio', text: 'Copy. Th—' },
    { who: 'direction', text: 'The carrier opens. It stays open.', hold: 2.6 },
    { who: 'direction', text: 'Something is close to the microphone on the other end.', hold: 2.8 },
    { who: 'direction', text: 'Closer than a person sitting at a desk can be.', hold: 3.0 },
    { who: 'direction', text: 'It is listening to you listen to it.', hold: 3.4 },
    { who: 'direction', text: 'The carrier drops.', hold: 2.2 },
  ],
];

// After this, `radio.js` owns it, and it is a hazard.
export const RADIO_DEAD_LINE = { who: 'you', text: 'Dead. And it stays clipped to my belt, because it is their radio.' };
export const SQUELCH_LINES = [
  { who: 'direction', text: 'The radio squelches. Everything in the building that can hear, heard that.' },
  { who: 'direction', text: 'Static. One syllable of it.' },
  { who: 'direction', text: 'The radio opens, says nothing, and closes.' },
];

// ── the previous recordist ──────────────────────────────────────────────────
// He is a professional writing to himself. Numbers, times, gear. His prose is
// dry in exact proportion to what is happening, which is the only register
// available to a man whose job is to hold still.
//
// `room` is the waypoint a page grants. `at` is where it lies on the floor.

export const PAGES = [
  {
    id: 'page-1', at: { x: 65, y: 13 }, room: 'main_b3', decay: 0.00,
    title: 'log — 21:40', byline: 'sheet 1',
    body: [
      { raw: 'RIG   MKH-8020 pair, ORTF. Sound Devices. No mains.' },
      { raw: 'REF   -60 dBFS floor in the stairwell. Very good.' },
      '',
      'Powered down means powered down. No hum, no fridge, no lift. I have not worked a building this quiet and I have worked at four in the morning.',
      '',
      'Down the west stair to B3 first, because it is the deadest room in the plan and if I can hold a clean minute there I can hold one anywhere. The stair is behind the dock, past the inner door. Standard key.',
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
      'Practice wing next. Up the shaft stair off the ground spine, then west along the upper corridor. Four minutes if you know where you are going.',
      '',
      'Radio check missed. I will get the next one.',
    ],
  },
  {
    id: 'page-5', at: { x: 65, y: 60 }, room: 'lux_nova', decay: 0.20,
    title: 'log — 01:35', byline: 'sheet 5',
    body: [
      { raw: 'PRAC  take 1. Clean. 60s.' },
      '',
      'Eleven practice rooms, all with the door open, all with a piano in, none of them in tune with any of the others. In an empty room the pianos are still the loudest thing, because a piano with the lid up is a hundred and eighty strings waiting for something to happen.',
      '',
      'Something happened in the corridor while I was recording, and it is not on the take, and I was wearing the headphones, and the headphones are the only reason I would have heard it.',
      '',
      'Four down. The chapel is the fifth.',
      '',
      { raw: 'My keys do not open the chapel.' },
    ],
  },
  {
    id: 'page-6', at: { x: 61, y: 30 }, room: 'lux_nova', decay: 0.28,
    title: 'log — 02:10', byline: 'sheet 6',
    body: [
      'Rang the client. Told them the chapel is locked and the key on the ring is for a lock that is not on that door any more. They asked whether there was another way in. I said in a building this old there is always another way in. They said good.',
      '',
      'There is a duct. It runs from the upper corridor east of the chapel door, and it is a metre square, and it comes out somewhere in the nave.',
      '',
      'I have been up here for forty minutes finding a way into a room that I could open in nine seconds with a bar off the truck, and I am not allowed to touch the walls of a building that is going to be rubble on Thursday.',
      '',
      { raw: 'I have started leaving these where I turn around. The plan I was given does not match the floor.' },
    ],
  },
  {
    id: 'page-7', at: { x: 42, y: 21 }, room: null, decay: 0.38,
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
      'The duct is open. I did not open it.',
      '',
      'I have four clean takes and one room and the room is on the other side of a metre of ductwork and I have been sitting outside it for what the recorder says is fifty minutes and what my legs say is longer.',
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
      'I would like it on the record that I was not sad, and I was not haunted, and there was no one I was thinking about. I was on the clock. It asked. It was going to be rubble on Thursday and it asked, and I have spent thirty years being paid to record rooms that nobody will ever stand in again, and not one of them ever asked me for anything.',
      '',
      { raw: 'rolling' },
    ],
  },
];

// The room the client wants, in the order the work order names them. The
// building decides the order you actually get them in.
export const TARGETS = ['main_b3', 'the_tub', 'amplifications', 'soundnoisemusic', 'lux_nova'];

// Where each room's take is made. The waypoint a page grants points here.
export const ROOM_CELLS = {
  main_b3: { x: 15, y: 12 },
  the_tub: { x: 85, y: 30 },
  amplifications: { x: 102, y: 15 },
  soundnoisemusic: { x: 65, y: 65 },
  lux_nova: { x: 90, y: 66 },
};

// What he thinks when the game has to tell the player something. All of it is
// in his voice, all of it is what a professional would actually notice, and
// none of it is addressed to anyone.
//
// The opening choice does not change stats. It changes what kind of knowledge
// is already in his head when the building starts repeating itself.
export const PROLOGUE_THOUGHTS = {
  // He read the paperwork. He is working a job, and he keeps doing sums.
  self: {
    lightOn: { who: 'you', text: 'On. Four hundred quid and I am afraid of a corridor.' },
    recStart: { who: 'you', text: "One clean minute. That's all they asked for." },
    recDone: { who: 'you', text: "That's one. Eighty quid a room, near enough." },
    playback: { who: 'you', text: 'Check it before I count it.' },
    playbackNone: { who: 'you', text: 'Nothing recorded in here yet.' },
    pageRoom: (room) => ({ who: 'you', text: `His log. He hadn't done ${room} either.` }),
    pageAny: { who: 'you', text: "His log. Same list, same order. He was working it the way I am." },
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
    lightOn: { who: 'you', text: 'On. Nothing has asked me anything.' },
    recStart: { who: 'you', text: "Roll. It's a room. It has always just been a room." },
    recDone: { who: 'you', text: "That's one, and there was nobody in it." },
    playback: { who: 'you', text: 'Listen back. Listen properly.' },
    playbackNone: { who: 'you', text: 'Nothing recorded in here yet.' },
    pageRoom: (room) => ({ who: 'you', text: `His log. ${room} still wanted its minute.` }),
    pageAny: { who: 'you', text: "His log. He was fine. Right up until he wasn't, he was fine." },
  },
};

export const LINES = {
  lightOn: { who: 'you', text: 'On. Anything in here with eyes has me now.' },
  lightOff: { who: 'you', text: 'Off.' },
  recStart: { who: 'direction', text: 'The monitor opens. The room is louder than it looks.' },
  recDone: { who: 'you', text: 'Clean. One minute of nothing, and the nothing is theirs.' },
  recSpoiled: (why) => ({ who: 'you', text: `Spoiled. ${why[0].toUpperCase()}${why.slice(1)}.` }),
  recAbort: { who: 'you', text: 'Stopped it.' },
  playback: { who: 'direction', text: 'Headphones on. Whatever plays now, the room cannot hear.' },
  playbackEnd: { who: 'direction', text: 'End of take.' },
  playbackNone: { who: 'you', text: 'Nothing recorded in this room.' },
  pageRoom: (room) => ({ who: 'you', text: `Somebody's log. ${room} still needs tone.` }),
  pageAny: { who: 'you', text: "Somebody's log. He was working the same list I am." },
  caught: (n) => ({ who: 'you', text: n === 1
    ? 'It found me. That is going to be on every take from here.'
    : `It found me again. ${n} now. I am the loudest thing in this building.` }),
  guest: { who: 'direction', text: 'There is something on the tape that was not in the room.' },
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
export function guestLines(kind, value) {
  if (kind === 'name' && value && value !== 'nobody') {
    return [
      { who: 'direction', text: 'Under the noise floor, coming up. Not a word. Then a word.' },
      { who: 'surfer', text: `...${value}?`, rate: 0.9 },
      { who: 'you', text: 'I said that name in a room with nobody in it.' },
    ];
  }
  if (kind === 'name') {
    return [
      { who: 'direction', text: 'Under the noise floor, coming up.' },
      { who: 'surfer', text: 'Nobody is expecting you.', rate: 0.9 },
      { who: 'you', text: 'That is my sentence. That is my sentence with the ends taken off.' },
    ];
  }
  if (kind === 'reason' || kind === 'feeling') {
    return [
      { who: 'direction', text: 'Under the noise floor, coming up. Your own voice, at a level you did not record it at.' },
      { who: 'surfer', text: 'You finish, and you thank it.', rate: 0.88 },
      { who: 'direction', text: 'And again, four seconds later, at exactly the same level.' },
      { who: 'you', text: 'A voice in a room is never the same twice.' },
    ];
  }
  // He gave it nothing, so it uses the last man.
  return [
    { who: 'direction', text: 'Under the noise floor, coming up.' },
    { who: 'recordist', text: 'Take four. Clean.' },
    { who: 'recordist', text: 'Take four. Clean.' },
    { who: 'recordist', text: 'Take four. Clean.' },
    { who: 'you', text: 'Minus forty-one. Three times. Not one decibel between them.' },
  ];
}
