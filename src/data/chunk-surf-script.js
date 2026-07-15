export const CHUNK_SURF_ENDING_ID = 'surfaced';
export const CHUNK_SURF_ENDING_TITLE = 'THE OTHER RECORDIST';

export const CHUNK_SURF_FLAGS = Object.freeze({
  offered: 'chunkSurf.offered',
  entered: 'chunkSurf.entered',
  completed: 'chunkSurf.completed',
  fork: 'chunkSurf.fork',
  trueLine: 'chunkSurf.trueLine',
  optionalRecordist: 'chunkSurf.optional.recordist',
  optionalSurfer: 'chunkSurf.optional.surfer',
  optionalWorkOrder: 'chunkSurf.optional.workOrder',
  correctRedaction: 'chunkSurf.correctRedaction',
  bestEligible: 'chunkSurf.bestEligible',
});

export const CHUNK_SURF_ROOMS = Object.freeze([
  {
    id: 'approach',
    required: true,
    title: 'THE LONG HALL',
    kind: 'corridor',
    exits: { north: 'fork-room', east: 'work-order-loop', west: 'surfer-origin' },
    inspect: 'The hallway is still the hallway, except the walls are made of clauses from the job.',
    tune: 'The paper edges tremble. One page refuses the draft.',
    record: 'The recorder takes the hall and plays back shoe leather over wet paper.',
  },
  {
    id: 'fork-room',
    required: true,
    title: 'OBJECT: TUNING_FORK',
    kind: 'object',
    exits: { south: 'approach', north: 'recordist-loop' },
    givesFork: true,
    inspect: 'A thin steel fork hangs in the black air. It is not lit. It is sounding anyway.',
    tune: 'The fork answers your hand. The false text shivers before the true line moves.',
    record: 'The recorder catches a clean A, then a man trying not to breathe under it.',
  },
  {
    id: 'recordist-loop',
    required: true,
    title: 'PREVIOUS CONTRACTOR',
    kind: 'room',
    exits: { south: 'fork-room', east: 'body-room', west: 'work-order-loop' },
    optionalFlag: CHUNK_SURF_FLAGS.optionalRecordist,
    inspect: 'Four accepted room tones are stacked in the floor like tiles. The fifth tile is a mouth.',
    tune: 'The variable name lengthens until it becomes a job title, then a man.',
    record: 'The recorder takes: "One more and I am out of here." Then the sentence corrects itself like a machine correcting a man.',
  },
  {
    id: 'surfer-origin',
    required: false,
    title: 'STUDENT FILE',
    kind: 'loop',
    exits: { east: 'approach', north: 'body-room' },
    optionalFlag: CHUNK_SURF_FLAGS.optionalSurfer,
    inspect: 'A rehearsal room made of staff lines. Every measure is a rule about endurance.',
    tune: 'The room does not become clearer. It becomes more willing to accuse itself.',
    record: 'The take is scales, then knuckles, then a sermon on useful silence.',
  },
  {
    id: 'work-order-loop',
    required: false,
    title: 'WORK ORDER SOURCE',
    kind: 'loop',
    exits: { west: 'approach', east: 'recordist-loop', north: 'body-room' },
    optionalFlag: CHUNK_SURF_FLAGS.optionalWorkOrder,
    inspect: 'A desk stands by itself. Its drawer contains no paper. The paper contains the desk.',
    tune: 'The clause underneath the clause lights up.',
    record: 'The recorder captures a pen failing, twelve in a pack, not one of them works.',
  },
  {
    id: 'body-room',
    required: true,
    title: 'BODY RETURN',
    kind: 'room',
    exits: { south: 'surfer-origin', west: 'recordist-loop', east: 'final-page' },
    inspect: 'The room is full of outlines. None of them are empty.',
    tune: 'Every outline turns towards the fork except the one that is trying not to.',
    record: 'The recorder catches the prior recordist saying nothing with perfect diction.',
  },
  {
    id: 'final-page',
    required: true,
    title: 'FINAL PAGE',
    kind: 'final',
    exits: { west: 'body-room' },
    inspect: 'The final page is not on the floor. The floor is printed on it.',
    tune: 'Two lines go bright. One is useful. One is kind.',
    record: 'The recorder takes a scream and prints it as a silence marker.',
    redactions: [
      {
        id: 'comfort',
        label: 'REDACT: RETURN STILL INSIDE',
        correct: false,
        result: 'The page accepts the mercy and gives it to the wrong body.',
      },
      {
        id: 'body',
        label: 'REDACT: BODY BORROWED',
        correct: true,
        result: 'The borrowed body becomes a bad reference. The Surfer loses its edge.',
      },
      {
        id: 'source',
        label: 'REDACT: SOURCE SURFER',
        correct: false,
        result: 'The word SURFER goes black. The thing wearing it remains.',
      },
    ],
  },
]);

export const CHUNK_SURF_REQUIRED_ROOMS = Object.freeze(
  CHUNK_SURF_ROOMS.filter((room) => room.required).map((room) => room.id),
);

export function chunkSurfRoom(id) {
  return CHUNK_SURF_ROOMS.find((room) => room.id === id) || CHUNK_SURF_ROOMS[0];
}

export function chunkSurfRouteProfile({ drankCoffee = false, hasRig = false, endingsSeen = [] } = {}) {
  const replay = Array.isArray(endingsSeen) && endingsSeen.length > 0;
  if (drankCoffee && hasRig) return { id: 'drugged', mandatory: true, bestEligible: true, weight: 'contamination' };
  if (drankCoffee) return { id: 'coffee', mandatory: true, bestEligible: false, weight: 'contamination' };
  if (hasRig) return { id: 'inversion', mandatory: false, bestEligible: true, weight: replay ? 'source' : 'machine' };
  return { id: replay ? 'replay' : 'sober', mandatory: false, bestEligible: false, weight: replay ? 'mixed' : 'institution' };
}

export function chunkSurfIntroLines(profile = {}) {
  const base = [
    'The chapel corridor does not end.',
    'Pages collect along the walls. Most of them are the same page pretending to be separate sheets.',
    'One page waits face-up and clean.',
  ];
  if (profile.mandatory) {
    base.push('The coffee is still behind your teeth. The words know exactly where to bloom.');
  } else {
    base.push('You can step around it. You can also put your hand on the paper.');
  }
  return base;
}

export function chunkSurfCompletionLines({ bestEligible = false, savedRecordist = false } = {}) {
  if (savedRecordist) return [
    { who: 'direction', text: 'The page gives up the body it was using to explain itself.' },
    { who: 'recordist', text: 'I thought if I let it have me, it would stop asking.' },
    { who: 'you', text: 'No. We are going to the chapel.' },
  ];
  if (bestEligible) return [
    { who: 'direction', text: 'The source closes over the wound but does not seal it. Something in the chapel will have to be refused out loud.' },
    { who: 'you', text: 'I can see where it is going to stand.' },
  ];
  return [
    { who: 'direction', text: 'The source folds back into the corridor. The chapel is ahead, actual and waiting.' },
    { who: 'you', text: 'He got four. Then he gave it the rest.' },
  ];
}

export function surfacedEnding({ drankCoffee = false, sourceReading = null } = {}) {
  const sourceText = sourceReading?.text ? String(sourceReading.text) : 'BODY BORROWED RETURN';
  return [
    { who: 'direction', text: 'The chapel door opens on the service road instead of the nave.' },
    { who: 'direction', text: `The source page follows you as an afterimage: ${sourceText}. It does not get to revise itself again.` },
    { who: 'recordist', text: 'I gave it my body because it told me that was the professional thing to do.' },
    { who: 'you', text: 'You can walk?' },
    { who: 'recordist', text: 'I can be carried by anything that does not need me to be music.' },
    { who: 'direction', text: drankCoffee
      ? 'The coffee comes up bitter at the back of your throat, but the road remains where roads remain.'
      : 'Behind you, the building fails to find the file it has been using as a mouth.' },
    { who: 'direction', text: 'Morning does not arrive. You arrive in it.' },
  ];
}
