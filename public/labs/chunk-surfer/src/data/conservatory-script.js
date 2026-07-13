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
    paper: {
      marks: [
        { page: 2, type: 'underline', x: 0.145, y: 0.505, w: 0.43, alpha: 0.50 },
        { page: 2, type: 'note', x: 0.705, y: 0.555, text: '5?', rotate: -7, alpha: 0.58 },
      ],
    },
    body: [
    { raw: 'SITE      Ellery Conservatory of Music (condemned)' },
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
    'You carry the standard keyring. Where it does not open a door, try another route; we concede these buildings are rather old, you may be able to find other pathways where a key does not open a particular door. Do not force anything. Everything here is due to come down regardless, and we are most definitely not paying for a wall.',
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

export const COLD_OPEN_DIALOGUE = {
  start: {
    speaker: 'SERVICE BOOTH · 21:38',
    lines: [
      { who: 'direction', text: 'A lit booth at the vehicle gate. Coffee, key hooks, a stack of forms, a small television with the sound off.' },
      { who: 'direction', text: 'There is a little perch by the booth window covered by a small roof; you stand on it so as to keep from the rain.' },
      { who: 'direction', text: 'Uncomfortable to say the least.' },
      { who: 'guard', text: 'You here for the Ellery gig? Christ. They actually sent someone tonight.' },
      { who: 'me', text: "Yeah, the sound job. Should be a work order there for me? Requisition number 4-4-1-7." },
      { who: 'guard', text: 'Came through around five today.' },
      { who: 'direction', text: "He finds a pen... it doesn't work. He puts it back in the pot with the others.", cue: 'pens' },
      { who: 'guard', text: 'My wife buys these. Twelve in a pack, and not one of them works.' },
      { who: 'direction', text: 'Rain bounces off the roof of the booth, and on the skips out in the yard; you keep closer to the window.' },
      { who: 'guard', text: "Five rooms, it says. That's a lot of rooms." },
      { who: 'me', text: "It's only a minute each. Really it's the waiting about that takes the night." },
      { who: 'guard', text: 'You brought a torch? Nobody brings a torch.' },
      { who: 'me', text: 'Not my first gig.' },
      { who: 'guard', text: "There's coffee if you want it. I made too much. It's not good but it's hot, and it's a long night you have ahead." },
    ],
    choices: [
      {
        knowledgeId: 'coldopen.route.order',
        text: 'look at the work order again',
        goto: 'order',
        set: ['prologue.knowledge.self'],
        clear: ['prologue.knowledge.guard', 'prologue.knowledge.tape'],
      },
      {
        knowledgeId: 'coldopen.route.guard',
        text: 'ask him about the building',
        goto: 'guard',
        set: ['prologue.knowledge.guard'],
        clear: ['prologue.knowledge.self', 'prologue.knowledge.tape'],
      },
      {
        knowledgeId: 'coldopen.route.tape',
        text: "put the headphones on — the client sent the last man's takes",
        goto: 'tape',
        set: ['prologue.knowledge.tape'],
        clear: ['prologue.knowledge.self', 'prologue.knowledge.guard'],
      },
      // Orthogonal to the three knowledge trunks and one-shot (greyed once taken).
      // The whole ending hinges on it, and it is offered like nothing at all.
      { knowledgeId: 'coldopen.route.coffee', text: 'take the coffee he offered.', goto: 'coffee', set: ['has.coffee'] },
      // Also orthogonal, also load-bearing: the only light in the game, and the
      // only place its batteries are a subject before they are a decision.
      { knowledgeId: 'coldopen.route.torch', text: 'the torch. check the torch.', goto: 'torch' },
    ],
  },

  // Replay-only administrative compression. This skips only the already-known
  // greeting and preserves every branch, side effect, and route-bearing choice.
  // It is authored rather than simulated so no stateful choice is silently made.
  'replay-condensed': {
    speaker: 'SERVICE BOOTH · RETURN CHECK-IN',
    lines: [
      { id: 'coldopen.condensed.01', who: 'direction', text: 'The same booth. The same rain. Work order 4417-C is already on the glass.' },
      { id: 'coldopen.condensed.02', who: 'guard', text: 'You know the form. Five rooms, one clean minute each. Anything you need before I turn you loose?' },
    ],
    choices: [
      {
        id: 'coldopen.condensed.order', knowledgeId: 'coldopen.route.order',
        text: 'review the work order', goto: 'order',
        set: ['prologue.knowledge.self'],
        clear: ['prologue.knowledge.guard', 'prologue.knowledge.tape'],
      },
      {
        id: 'coldopen.condensed.guard', knowledgeId: 'coldopen.route.guard',
        text: 'ask about the building', goto: 'guard',
        set: ['prologue.knowledge.guard'],
        clear: ['prologue.knowledge.self', 'prologue.knowledge.tape'],
      },
      {
        id: 'coldopen.condensed.tape', knowledgeId: 'coldopen.route.tape',
        text: "play the previous contractor's takes", goto: 'tape',
        set: ['prologue.knowledge.tape'],
        clear: ['prologue.knowledge.self', 'prologue.knowledge.guard'],
      },
      {
        id: 'coldopen.condensed.coffee', knowledgeId: 'coldopen.route.coffee',
        text: 'take the coffee he offered.', goto: 'coffee', set: ['has.coffee'],
      },
      {
        id: 'coldopen.condensed.torch', knowledgeId: 'coldopen.route.torch',
        text: 'check the torch', goto: 'torch',
      },
      {
        id: 'coldopen.condensed.threshold',
        text: 'finish check-in and enter the building', goto: 'threshold',
      },
    ],
  },

  // ── the torch ─────────────────────────────────────────────────────────────
  // Our protagonist is going to spend the night deciding, over and over, whether to be able to
  // see. Every one of those decisions is cheaper if he has already said out loud,
  // in a lit booth, in front of a witness, what light costs him.
  torch: {
    speaker: 'SERVICE BOOTH · 21:38',
    lines: [
      { who: 'direction', text: 'A standard Maglite three-cell torch, the anodising worn back to bare metal where a hand goes. You thumb it on against your palm and off again.' },
      { who: 'you', text: "Working. Cells are good. I'm pretty sure I remembered to push in fresh ones in earlier today." },
      { who: 'guard', text: 'Most of them turn up with a phone. A phone! in there...' },
    ],
    choices: [
      { text: 'how long will it last?', goto: 'torch.cells' },
      { text: 'why you will not use it', goto: 'torch.dark' },
      { text: 'did the last recordist have one?', goto: 'torch.him' },
      { text: 'put the torch back in the bag', goto: 'start' },
    ],
  },
  'torch.cells': {
    speaker: 'SERVICE BOOTH · 21:38',
    lines: [
      { who: 'you', text: "Alkalines. I've got a good, continuous four or five hours of light on standby, but I don't want to get anywhere near an empty charge." },
      { who: 'guard', text: "I'd have brought spares." },
      { who: 'me', text: "Everyone should bring spares... nobody really ever does though." },
    ],
    goto: 'torch',
  },
  'torch.dark': {
    speaker: 'SERVICE BOOTH · 21:38',
    lines: [
      { who: 'guard', text: "You'll want it on in there. It's black as anything past the foyer." },
      { who: 'me', text: 'It goes off when the tape rolls.' },
      { who: 'guard', text: 'Off? Why off? A torch makes no noise, it–' },
      { who: 'me', text: 'It makes a noise like a hand moving or a filament buzzing. It clicks. I mean, you cannot hold still with a torch on. You sweep it, and the sweep is on the tape, in your shoulder, in your coat, on your breath.' },
      { who: 'guard', text: '...right.' },
      { who: 'me', text: "I work in the dark. It's part the job. It's really most of the job." },
    ],
    goto: 'torch',
  },
  'torch.him': {
    speaker: 'SERVICE BOOTH · 21:38',
    lines: [
      { who: 'guard', text: 'The last one? Had a head torch. Little red one, for the night vision, he said.' },
      { who: 'me', text: 'That is a good bit of kit yeah.' },
      { who: 'guard', text: 'He came out the first two nights. Third night he went in at ten and I did my rounds and the gate was shut and his van was still there Thursday.' },
      { who: 'direction', text: "The rain gets briefly heavier and then lifts. It comes in patches, it's soothing white noise waxing and waning as the night slowly drags on." },
      { who: 'guard', text: 'Van was gone come Friday though. Who knows.' },
      { who: 'you', text: 'Who knows indeed... but why are you telling me this right before I head inside?' },
    ],
    goto: 'torch',
  },

  // Take it or leave it. A paper cup from a stranger in a hi-vis jacket, and the
  // game will not tell you for hours whether that was a mistake.
  coffee: {
    speaker: 'SERVICE BOOTH · 21:38',
    lines: [
      { who: 'direction', text: 'He fills a second cup without asking how you take it and slides it across the form.' },
      { who: 'guard', text: 'There. You look like you need it more than I do.' },
      { who: 'you', text: 'Thanks?' },
    ],
    goto: 'start',
  },

  // ── trunk one: the paperwork ──────────────────────────────────────────────
  order: {
    speaker: 'THE WORK ORDER',
    lines: [
      { who: 'direction', text: "A letterhead, a list, and a signature. That signature block has been photocopied so many times it barely passes for a smudge." },
      { who: 'direction', text: "You don't argue with the pay though." },
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
      { who: 'you', text: "It's about double what I usually get. I saw the dispatch call come up on my job board at four and I said yes almost as soon as I saw it." },
    ],
    goto: 'order',
  },
  'order.words': {
    speaker: 'THE WORK ORDER',
    lines: [
      { who: 'you', text: '"The room as it is." "One clean minute." "If you can hear yourself on the take, you must start again."' },
      { who: 'you', text: "That's fair." },
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
      { who: 'you', text: 'Thursday, six in the morning. After that there is no building to be in, only dust and the land rights to a new development project.' },
      { who: 'you', text: "So there's no coming back on Friday to pick up the ones I missed." },
      { who: 'you', text: "Five or none. Tonight is the whole job." },
    ],
    goto: 'order',
  },
  'order.last': {
    speaker: 'THE WORK ORDER',
    lines: [
      { who: 'you', text: '"The prior contractor delivered four accepted room tones. The packet was settled for four."' },
      { who: 'you', text: "Settled for four. So they got paid, and they stopped. Maybe they just couldn't bare the dark? Happens all the time." },
    ],
    choices: [
      { text: 'read that sentence again', goto: 'order.last.paid' },
      { text: 'back to the order', goto: 'order' },
    ],
  },
  'order.last.paid': {
    speaker: 'THE WORK ORDER',
    lines: [
      { who: 'you', text: "The account remains open. We want 5 clean recordings, and it seems the fifth was undelivered." },
      { who: 'you', text: 'Nobody settles for 80% of work for anything. Not once, not ever, not without a phone call first.' },
      { who: 'direction', text: 'And they sent it to you, in writing, before you said yes. First class mail; by the looks of the stationery it was waiting to be mailed out.' },
    ],
    goto: 'order',
  },

  // ── trunk two: the guard ──────────────────────────────────────────────────
  guard: {
    speaker: 'NIGHT GUARD',
    lines: [
      { who: 'me', text: "You know anything about the building at all?" },
      { who: 'guard', text: 'Keys and forms. Past the door is nothing to do with me.' },
      { who: 'direction', text: 'He turns the television down, but the sound was already off.' },
    ],
    choices: [
      { text: 'have you ever been inside?', goto: 'guard.inside' },
      { text: 'was there someone here before me?', goto: 'guard.last' },
      { text: "what was the other recordist's name?", goto: 'guard.name' },
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
      { who: 'direction', text: 'He says it the way people say they do not like anchovies.' },
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
      { who: 'direction', text: "He says it exactly the same way. Same three words, same speed. It's not quite a façade." },
      { who: 'guard', text: "It's a building, mate. I've got me chair here, and me 'telly. No need to go inside, they had other people for that." },
    ],
    goto: 'guard',
  },
  'guard.last': {
    speaker: 'NIGHT GUARD',
    lines: [
      { who: 'me', text: 'There was someone before me. Few weeks back.' },
      { who: 'guard', text: 'Yeah. Nice enough. Kept his own hours.' },
      { who: 'me', text: 'Did he come out?' },
      { who: 'direction', text: 'The guard turns the form around and taps a box near the bottom.' },
      { who: 'guard', text: 'Initial there as well. They want it twice now.' },
      { who: 'me', text: '...' },
      { who: 'guard', text: 'My shift ended at ten. I was home...' },
    ],
    goto: 'guard',
  },
  'guard.name': {
    speaker: 'NIGHT GUARD',
    lines: [
      { who: 'me', text: "What was he called, the last bloke?" },
      { who: 'guard', text: 'Hang on.' },
      { who: 'direction', text: 'He turns the book around and runs a finger up the column, past tonight, past the rain, into September.' },
      { who: 'guard', text: 'There. Received, that one. And the box next to it is empty.' },
      { who: 'direction', text: 'It is the same ledger you are about to sign.' },
      { who: 'guard', text: "Can't read his writing. Nobody can read anybody's writing anymore." },
    ],
    goto: 'guard',
  },
  'guard.shift': {
    speaker: 'NIGHT GUARD',
    lines: [
      { who: 'me', text: "So who's on the gate after you?" },
      { who: 'guard', text: "Nobody. Site's condemned. They stopped paying for the night after they stopped paying for the power. Tonight is my last night on the job." },
      { who: 'me', text: 'So I ring the bell at three in the morning and.' },
      { who: 'guard', text: 'And nothing. Gate code is on your sheet.' },
      { who: 'guard', text: "It's a demolition, not a bank." },
    ],
    goto: 'guard',
  },
  'guard.know': {
    speaker: 'NIGHT GUARD',
    lines: [
      { who: 'guard', text: "Light's gone in the basement stair. Which you knew by the looks of it, seeing as you brought yer torch." },
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
      { who: 'direction', text: 'Four files on the card. Three are slated and clean: the previous recordist clearly announced the take number and room for each take. Take three is already running.' },
      { who: 'recordist', text: 'Take three.' },
      { who: 'direction', text: 'Sixty clean seconds of bare room noise.' },
      { who: 'recordist', text: "That's clean. That's three." },
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
      { who: 'you', text: 'Floor sits at fifty-eight decibels. No hum, no traffic, no weird handling.' },
      { who: 'you', text: "It's a beautiful take. I would have sent it." },
      { who: 'you', text: 'He was better than me. I need to make these recordings count.' },
    ],
    goto: 'tape',
  },
  'tape.slate': {
    speaker: 'REFERENCE FILES · 04 (NO SLATE)',
    tape: true,
    lines: [
      { who: 'you', text: 'You slate everything. Room, take, date. You say it out loud after you roll the take.' },
      { who: 'you', text: "You do it so that in eight months, when the file is a number, somebody knows what they're listening to." },
      { who: 'direction', text: 'You flip the tape over to the reverse side. Take four, unslated.' },
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
      { who: 'surfer', text: 'Who did you lose?' },
      { who: 'recordist', text: 'the fuck? ...say again?' },
      { who: 'surfer', text: "It is how this goes. You lost her. You lost me. Now come in and look for her." },
      { who: 'recordist', text: "I haven't lost anybody." },
      { who: 'surfer', text: 'Everybody has lost somebody.' },
      { who: 'recordist', text: "Not m-." },
      { who: 'surfer', text: "You did everything you could to keep from losing her. It drove her away, didn't it?." },
      { who: 'recordist', text: 'No! Why do you know this?! Who are you?' },
      { who: 'direction', text: 'Thirty seconds of the room, at the same level as before.' },
      { who: 'surfer', text: 'Come closer.' },
      { who: 'direction', text: 'Vague nothings you cannot make out.' },
      { who: 'surfer', text: 'Closer. Bring forth to me your body.' },
      { who: 'direction', text: '.' },
      { who: 'direction', text: '..' },
      { who: 'direction', text: '...' },
      { who: 'surfer', text: 'You will bring me another, and will lose them together.' },

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
      { who: 'direction', text: 'Back forty seconds. The room, the chair, the man standing up.', cue: 'rewind' },
      { who: 'surfer', text: 'Who did you lose.' },
      { who: 'you', text: 'Same words. Same level. Minus forty-one decibels, both times.' },
      { who: 'direction', text: "You have a feeling you're going to need to check your recordings extra carefully tonight." },
    ],
    goto: 'tape.run',
  },
  'tape.end': {
    speaker: 'REFERENCE FILES · 04 (NO SLATE)',
    tape: true,
    lines: [
      { who: 'direction', text: 'The rest of the file is pure, clean ambient room sounds. Nine minutes of it. He does not speak again, and neither does anything else.' },
      { who: 'you', text: 'That is the best goddamned room tone I have ever heard.' },
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
      { who: 'direction', text: 'You sign the first box. The second one says returned, and it is about the width of a fingernail; it is empty all the way up the page.', cue: 'signature' },
      { who: 'guard', text: "Don't sign the other one. That's for when you come back out." },
      { who: 'direction', text: 'In one single gesture (likely the toughest amount of labor for him this evening), he slides the keys under the glass along with a radio in one hand, and takes form back with the other.', cue: 'slides' },
      { who: 'me', text: 'Channel two?' },
      { who: 'guard', text: 'Aye. Check in on the hour.' },
      { who: 'guard', text: "Grey door, end of the yard is the service entrance. I'll be here till ten." },
      { who: 'guard', text: "If the service leaf sticks, don't shoulder it. Main doors are through the front foyer, past the box office. Longer walk, same yard." },
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
  { who: 'direction', text: 'You reach back for the push bar instinctively.' },
  { who: 'direction', text: 'Painted breeze block, cold, and a seam of mortar where your thumb expects a steel push bar.' },
  { who: 'you', text: 'Hmmph.' },
  { who: 'direction', text: 'You go along the wall with the flat of your hand. Two metres to the left, and back to the right.' },
  { who: 'you', text: "Oh Christ oh fuck oh God I came in eleven seconds ago and I have already lost my exit, great great great great grea-" },
  { who: 'direction', text: "Don't panic." },
  { who: 'you', text: "Alright, let's take a breath." },
];

const STEEL_YOURSELF = [
  { who: 'you', text: "I'll find it on the way out, when I'm not standing here like this. When I'm not in the middle of a room with my flashlight off." },
  { who: 'direction', text: 'Which is true. It is also exactly the reasoning that keeps a man *inside* a building and not darting back home to the kind of cotidian safety only jaffa cakes and Mr. Whiskers can provide.' },
  { who: 'direction', text: 'But for now, you trudge along in the dark.' },
  { who: 'you', text: "Speaking of, let's find that flashlight. It should be in my bag, I just had it a second ago." },
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
export const PLANT_RIG_CELL = { x: 38, y: 12 };

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
      { who: 'direction', text: 'It goes in the bag, against the work order, where it is the heaviest thing you are carrying. The cells stay in it, because a rig with no cells is a paperweight.' },
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
// On the sill of the practice wing, one cell off the mark you have been sent to
// stand on. You cannot set up for that take without coming within arm's reach.
export const TALISMAN_CELL = { x: 66, y: 65 };
export const TALISMAN = {
  start: {
    speaker: 'THE PRACTICE WING',
    lines: [
      { who: 'direction', text: 'On the sill, in the dust, a tuning fork. Steel, stamped, older than the last refit.' },
      { who: 'you', text: 'Somebody left a fork on a windowsill. That is the least mysterious object I have ever found.' },
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
      { who: 'direction', text: 'You close your hand around it. The steel is cold and perfectly still, and it has been perfectly still the whole time.' },
      { who: 'you', text: '...it was not the fork.' },
      { who: 'direction', text: 'The A goes on, in the room, without it. Then it stops, all at once, the way a held breath stops.' },
      { who: 'you', text: 'That was not the fork. That was in here with me and it was being polite.' },
    ],
    choices: [
      { text: 'pocket it and get on', goto: 'pocket', set: ['has.fork'] },
    ],
  },
  pocket: {
    speaker: 'THE PRACTICE WING',
    lines: [
      { who: 'direction', text: 'It goes in the top pocket, where a professional keeps the one tool he trusts.' },
      { who: 'you', text: 'A=440. And nothing else. Right.' },
    ],
  },
  leave: {
    speaker: 'THE PRACTICE WING',
    lines: [
      { who: 'you', text: 'It is a fork on a sill. I have four rooms.' },
      { who: 'direction', text: 'You leave the one object in this building that would have told you the truth.' },
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

// After the booth: the yard, in the rain, and a key going into a grey door.
// It ends on the key, because the title card goes here — and the door does not
// shut until the title has faded and the song has gone with it.
export const COLD_OPEN = [
  { who: 'direction', text: 'The yard. Rain on the skips, and a hundred metres of nothing between the booth and the grey door.', hold: 2.6 },
  { who: 'you', text: 'Basement first. It will be the hardest and I want it behind me.', hold: 2.4 },
  { who: 'direction', text: 'The key turns. The door is heavier than it looks, the way fire doors are.', cue: 'keyturn', hold: 2.6 },
];

// ...and then the title. And THEN the door, into a silence the song has just
// vacated. The loudest thing that happens all night lands on an empty mix.
export const AFTER_TITLE = [
  { who: 'direction', text: 'The service door closes behind you.',
    cue: 'door', shake: 2.2, shakeMs: 620, flash: true, flashMs: 220, hold: 3.4 },
  { who: 'you', text: 'Darker than the yard. Which is not great, because the yard was dark.', hold: 2.6 },
  { who: 'you', text: 'And quieter. No rain in here. No rain, no traffic, no plant, no lift.', hold: 2.8 },
  { who: 'you', text: 'Minus sixty decibels, near enough, before I have taken the recorder out of the bag.', hold: 2.8 },
  { who: 'direction', text: 'You put the bag down and go through it by feel.', cue: 'bag', hold: 2.6 },
  { who: 'you', text: 'Torch. Recorder. Headphones. Radio. Keys. The order, folded twice.', cue: 'kit', hold: 2.8 },
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
    // Eight seconds of a man working out what is on the other end, and then it
    // is not a jump scare, because he already knew.
    { who: 'direction', text: 'It is listening to you listen to it.', cue: 'scream', shake: 2.6, shakeMs: 900, hold: 4.2 },
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
    paper: {
      marks: [
        { page: 0, type: 'underline', x: 0.160, y: 0.795, w: 0.48, alpha: 0.44 },
        { page: 0, type: 'note', x: 0.670, y: 0.820, text: 'key', rotate: -5, alpha: 0.50 },
      ],
    },
    body: [
      { raw: 'PRAC  take 1. Clean. 60s.' },
      '',
      'Eight practice rooms and an ensemble room, all with the door open. Seven uprights with their lids up, none of them in tune with any of the others. Stands and cases in the rooms without them. In an empty room the pianos are still the loudest thing, because a piano with the lid up is a hundred and eighty strings waiting for something to happen.',
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
      'Rang the client. Told them the chapel is locked and the key on the ring is for the original ward, not the replacement core.',
      '',
      'Front of house kept the new spare under key control. Box office cabinet, according to the rekey invoice. The tag is in their ledger, not on this sheet.',
      '',
      'The box office staff leaf should still answer to the building master. That is the useful key on the ring, if the lock has not swollen.',
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
  start: {
    speaker:'FRONT OF HOUSE · KEY CONTROL',
    lines:[
      {who:'direction',text:'Three hooks still carry keys. The ledger gives the replacement core one tag.'},
      {who:'you',text:'Replacement core. Chapel. C-seventeen.'},
    ],
    choices:[
      {text:'CH-04 / ORIGINAL WARD',keyTag:'CH-04',goto:'wrong'},
      {text:'C-17 / REPLACEMENT CORE',keyTag:'C-17',goto:'right'},
      {text:'FOH-M / MASTER',keyTag:'FOH-M',goto:'wrong'},
    ],
  },
  wrong:{
    speaker:'FRONT OF HOUSE · KEY CONTROL',
    lines:[
      {who:'direction',text:'The wrong ring drops against the steel cabinet. The sound leaves the office before you do.'},
      {who:'you',text:'No. Read it properly.'},
    ],
    goto:'start',
  },
  right:{
    speaker:'FRONT OF HOUSE · KEY CONTROL',
    lines:[
      {who:'direction',text:'C-17 comes off its hook. Brass, two cuts newer than everything else on the ring.'},
      {who:'you',text:'Chapel key. Replacement core.'},
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
  soundnoisemusic: { x: 65, y: 65 },
  lux_nova: { x: 90, y: 66 },
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
  { who: 'you', text: "Then he was generous and I am not. I have nothing in me it wants. No sister, no wife, no boy on a bike. I have a job, a torch, and a card with four minutes of nothing on it, and it can starve." },
];

export const LINES = {
  lightOn: { who: 'you', text: 'On. Anything in here with eyes has me now.' },
  lightOff: { who: 'you', text: 'Off.' },
  // LISTEN: the room comes up in the cans, and you can still move.
  listen: { who: 'direction', text: 'Headphones on. The room comes up in the cans — the size of it, the drip somewhere, the hum in the walls. [r] again to roll.' },
  listenOff: { who: 'you', text: 'Not yet. Off it comes.' },
  mustRoll: { who: 'you', text: "No. Levels are set. You don't set a level and walk away — you roll. [r]." },
  already: { who: 'you', text: "Done that one. Clean minute, in the bag. I'm not doing it twice." },
  chapelLocked: { who: 'you', text: 'Not the chapel. Not yet. You do the chapel last, when the other four are on the card.' },
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
// LISTENING IS THE WOUND, and the game has never said so.
//
// Recording a room does nothing to you. Playing it back does. The previous
// recordist listened to four of these rooms and then went up to the chapel and
// listened to the fifth, and that is the entire mechanism of what happened to
// him — not the takes, not the building, not a deed in his past. He heard all
// five. The thing in the signal only needs an ear that has heard all of it.
//
// So `n` is how many rooms the player has now played back, and it is the only
// number in this game that goes one way. The player is never told. They are
// simply allowed to press [p] as often as they like.
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
export function endingChoice(hasRig) {
  const invert = hasRig ? [{ text: '[take the bent rig out of the bag]', goto: 'invert', set: ['ending.choice=inversion'] }] : [];
  return {
    start: {
      speaker: 'THE CHAPEL',
      lines: [
        { who: 'direction', text: 'It is not attacking any more. It is waiting, the recorder still running on the floor between the three of you.' },
        { who: 'surfer', text: 'Well. Bring me one.' },
      ],
      choices: [
        { text: 'Give it what it is asking for.', goto: 'feed', set: ['ending.choice=sacrifice'] },
        ...invert,
        { text: 'Say nothing. There is nothing to say.', goto: 'nothing' },
      ],
    },
    nothing: {
      speaker: 'THE CHAPEL',
      lines: [
        { who: 'you', text: 'There is nothing there.' },
        { who: 'direction', text: 'You hold it. A room can wait longer than a man can, and it knows the number.' },
      ],
      choices: [
        { text: 'Give it what it is asking for.', goto: 'feed', set: ['ending.choice=sacrifice'] },
        ...invert,
      ],
    },
    feed: { speaker: 'THE CHAPEL', lines: [{ who: 'you', text: 'All right. All right. Here — take it.' }], goto: 'done' },
    invert: { speaker: 'THE CHAPEL', lines: [{ who: 'you', text: 'He soldered across the parts that decide things. Somebody did that for me, once, and ran out of night.' }], goto: 'done' },
  };
}

// Ending A — the sacrifice. You stay; the seal (the demolition) closes. Graded
// by whether you named it and how badly the night used you.
export function sacrificeEnding({ injuries = 0, named = false } = {}) {
  const ordinal = ['', 'first', 'second', 'third', 'fourth', 'fifth'][Math.min(5, injuries)] || 'newest';
  return [
    { who: 'direction', text: 'You agree with it. It does not take the shape of a blow. It takes the shape of a sentence you finish for it.' },
    named
      ? { who: 'me', text: 'I lost Sarah. There. Is that what you wanted. I lost Sarah.' }
      : { who: 'me', text: 'I lost somebody. Everybody has lost somebody. There. Take it.' },
    { who: 'surfer', text: 'Thank you. That is all it ever wanted — somebody to say it out loud in a room.' },
    { who: 'direction', text: 'The recorder clicks off. The seal was never the five takes. The seal was always a building coming down on a recordist, and now the building has one.' },
    injuries > 0
      ? { who: 'direction', text: `You are the ${ordinal} thing it caught tonight, and the last.` }
      : { who: 'direction', text: 'It never caught you, not once, all night. It did not need to. It only needed you to stay for the end.' },
    { who: 'direction', text: 'Demolition is booked for 06:00. The clock reads 05:5?, and the clock was always the seal, and it is nearly closed.' },
  ];
}

// Ending B — the inversion. Needs the rig. The invert, then the collapse (the one
// real clock), then a run for a door that will not be where the door is, then a
// way out you did not open — and a yard that is not there.
export const INVERT_START = [
  { who: 'direction', text: 'You feed the output back into its own input before it has finished being an output. The oldest trick there is: run the circuit that makes a machine sing, backwards, to make one stop.' },
  { who: 'you', text: 'He built this to get something OUT of the signal.' },
  { who: 'surfer', text: 'That is cheating.' },
  { who: 'you', text: 'It is engineering. You would not know the difference. Nobody in here ever did.' },
  { who: 'direction', text: 'The organ chokes off. Somewhere below, the first wall lets go. The only clock in this building that was ever real starts to run.' },
];
export const FALSE_DOOR = [
  { who: 'direction', text: 'The grey service door. The one you came in through, where the plan says it is.' },
  { who: 'you', text: 'There you are. Fine. I was tired. I was anxious and I walked past it.' },
  { who: 'direction', text: 'Relief arrives all at once: the guard, the returned box, the wet yard eleven seconds away. Your exit is incoming.' },
  { who: 'direction', text: 'It is right there and it does not open. And then it is not right there — a foot to the left, and then a wall.' },
  { who: 'surfer', text: 'You did not vanquish me. There is no version of this where you vanquish me. I am the room.' },
  { who: 'direction', text: 'The door goes on not being where the door is. Your waypoint blinks out, and re-draws, pointing somewhere you never marked.' },
];
export function rescueEnding(named) {
  return [
    { who: 'direction', text: 'The new mark is a door you never wrote down. It is open. A shape holds it open, backlit, and you do not get to see the face.' },
    named ? { who: 'me', text: '...Sarah?' } : { who: 'you', text: 'Who is that. Who is holding the door.' },
    { who: 'direction', text: 'It could be her. It could be the man who did the first four rooms and did not come out. It could be nobody, and the door simply failed open. You go through it, because it is open and the building is coming down.' },
  ];
}
export const INVERSION_FINAL = [
  { who: 'direction', text: 'You come out into the yard. The yard is not there.' },
  { who: 'direction', text: 'A clock restarts in front of you: --:--. Further off there is another grey door, exactly like the one you just came out of.' },
  { who: 'recordist', text: 'Ha.' },
  { who: 'direction', text: 'The recordist begins to laugh, low, and it does not stop when he stops, because the Chunk Surfer is sounding out of him now. You did not save him. Somebody saved you. You will spend a while working out who — and whether they got out either.' },
];

// If you drank the guard's coffee, the ending is reframed — and the mechanic
// never says which reading is true. You stayed: he was a real guard who put a
// stimulant in a hot drink to hold the thing off, and it was kind, and it was
// real, and it was not enough.
export function helpedEnding({ named = false } = {}) {
  return [
    { who: 'direction', text: 'You agree with it, and the coffee is still somewhere behind your teeth, and it did not save you, because it was only ever coffee with something kind in it.' },
    { who: 'you', text: 'He put something in it. A stimulant. To hold the thing off, to buy me the night.' },
    { who: 'direction', text: 'A guard on a gate read a work order for a building that eats recordists, and he did the one thing a man in a booth can do — he made you a hot drink and he hoped.' },
    { who: named ? 'me' : 'direction', text: named ? 'It was real. He tried. And I still said her name.' : 'It was real, and it was kind, and it was not enough. The seal closes at 06:00 with you inside it.' },
  ];
}

// You got out — but you drank it, so there was never anything to get out of. A
// psychedelic night in an empty building; the takes are ruined and the job is a
// faux pas. Do not take the coffee from the man in the hi-vis jacket.
export function druggedReveal({ takes = 5 } = {}) {
  return [
    { who: 'direction', text: 'You are in the car park. It is the car park. The skips are where the skips are, and the building stands, unlit, four storeys of nothing, and there was never anything in it but you.' },
    { who: 'you', text: '...what was in that coffee.' },
    { who: 'direction', text: 'You put the headphones on, out of thirty years of habit, and you play the night back.' },
    { who: 'recordist', text: 'Take one.' },
    { who: 'you', text: 'That is me. Breathing. Talking to a room. Take two is footsteps. Take three is a man saying a name into a space with nobody in it.' },
    { who: 'direction', text: `${takes >= 5 ? 'Five files' : 'Every file'}, and not one clean minute among them. You did not record five rooms. You wandered a condemned building for eight hours, off your face on a stranger's coffee, narrating.` },
    { who: 'you', text: 'No money. No takes. A note in a file somewhere: this contractor could not be relied upon.' },
    { who: 'direction', text: 'Do not take the coffee from the man in the hi-vis jacket. That is the whole of it. That is the only thing the night had to teach.' },
  ];
}

// The frame closes on the guard's ledger. Variant:
//   'out' | 'client' | 'nobody' (the supernatural readings), or
//   'helped' | 'drugged' (if you drank the coffee).
export function guardEpilogue(variant) {
  if (variant === 'drugged') return [
    { who: 'direction', text: 'The gate booth, lit, at dawn. The same bored man. He does not ask how it went; he watches the little television with the sound off.' },
    { who: 'you', text: 'What did you put in it.' },
    { who: 'guard', text: 'In what?' },
    { who: 'direction', text: 'There is one paper cup in the bin by his foot, and it is not yours — yours is still in your hand, empty, and you do not remember finishing it.' },
    { who: 'guard', text: 'Long night. You signing out, or not.' },
  ];
  if (variant === 'helped') return [
    { who: 'direction', text: 'The gate booth. The bored man is not bored now. He has been up all night, and he keeps looking at the door you went in by.' },
    { who: 'guard', text: '...that is longer than the last one lasted.' },
    { who: 'direction', text: 'He made you a coffee with something in it to hold the thing off, because it was the only help a man in a booth had to give, and he knew when he did it that it might not be enough.' },
    { who: 'guard', text: 'I did what I could think of. I am sorry. I am.' },
  ];
  if (variant === 'out') return [
    { who: 'direction', text: 'The gate booth. The same bored man, the same book, the two columns he never explained.' },
    { who: 'guard', text: 'You came back.' },
    { who: 'you', text: 'I came back.' },
    { who: 'guard', text: 'Huh.' },
    { who: 'direction', text: 'He turns the book around. The left column is full of names, all the way up the page. The right column — RETURNED — has been empty the whole time. He writes in it. Yours is the first.' },
    { who: 'guard', text: 'Sign here. And here. The second one is new. I have never once had to use it.' },
  ];
  if (variant === 'client') return [
    { who: 'direction', text: 'The gate booth. The bored man is not alone. Someone in a good coat is at the desk who was not here when you went in.' },
    { who: 'client', text: 'Is it done?' },
    { who: 'guard', text: 'It is done.' },
    { who: 'direction', text: 'The client signs the account closed. Nobody at W. Ellery has ever seen a ghost. They have seen a schedule of consent and an open account, and now a closed one. The left column got one more name. The right stays empty.' },
    { who: 'client', text: 'Good. Book the machines for 06:00.' },
  ];
  return [
    { who: 'direction', text: 'The gate booth. The bored man, the book, and nobody else. Not the client, who did not need to come. Not you, who did not come out.' },
    { who: 'direction', text: 'He writes the date and the time in the left column, beside a name, and he leaves the right column empty, the way it has been empty all the way up the page. The building took a man and gave back a file with nothing on it.' },
    { who: 'guard', text: 'Next.' },
  ];
}
