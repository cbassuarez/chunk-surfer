// The Horizon portrait is an audience, not a shopkeeper. Recognition earns the
// right to hear the old institution describe itself; only after identity,
// history, route, and consequence have been established does the seal offer a
// choice.

const freezeLines = (lines) => Object.freeze(lines.map((line) => Object.freeze(line)));

const SHARED_AUDIENCE = freezeLines([
  { who: 'you', text: 'What order?' },
  { who: 'bust', text: 'The one respectable men denied at dinner and obeyed after midnight. Six bells, two chapels, one black ledger. We kept the college’s second set of minutes.' },
  { who: 'you', text: 'And the bells?' },
  { who: 'bust', text: 'A door disguised as a peal. The tape ahead will carry you to the chapel and call the account closed. The older road goes by all six and ends beneath the tower, where accounts are opened.' },
  { who: 'you', text: 'What does it want from me?' },
  { who: 'bust', text: 'Nothing so vulgar as payment. An answer, properly witnessed. Lay your hand on the seal and the Order will enter you as a guest; leave it cold and the straight road remains yours.' },
]);

export const HORIZON_BUST_AUDIENCE = Object.freeze({
  carried: freezeLines([
    { who: 'direction', text: 'Inside the equipment case, the loose marble eyes knock once against the brass. The pedestal answers from somewhere under its base.' },
    { who: 'bust', text: 'There you are. I had begun to think the house had sent me another man with excellent ears and no appetite for seeing.' },
    ...SHARED_AUDIENCE,
  ]),
  returned: freezeLines([
    { who: 'direction', text: 'The portrait’s pupils take the Horizon’s wet colour. They are the eyes you returned to the gallery, looking through another face.' },
    { who: 'bust', text: 'There you are. Restitution is the oldest password in the house. It has always preferred a penitent to an innocent.' },
    ...SHARED_AUDIENCE,
  ]),
});

export const HORIZON_BUST_REFUSAL = freezeLines([
  { who: 'direction', text: 'The bronze seal stays black. Whatever attention inhabits the marble does not quite arrive.' },
  { who: 'bust', text: 'You came to the door without the thing that knocks. That is not a crime. Most members managed it for years.' },
  { who: 'bust', text: 'The chapel is still receiving callers. Keep to the lit part of the tape, and do not answer any bell that knows your name.' },
]);

export const HORIZON_BUST_RECOGNITION = Object.freeze({
  who: 'you',
  text: 'The same measured line from Malcolm’s map is cut into the rim of the seal, with six notches along it.',
});

export function horizonBustAudience(mode = 'untouched') {
  return HORIZON_BUST_AUDIENCE[mode] || HORIZON_BUST_REFUSAL;
}

export function horizonBustProposition(lastLine = null, recognition = null) {
  return {
    start: {
      speaker: 'THE PORTRAIT',
      lines: [
        ...(lastLine ? [lastLine] : []),
        ...(recognition ? [recognition] : []),
        { who: 'direction', text: 'A palm-shaped hollow shines on the pedestal. The skull above it has lost its name; the crossed bones below have been worn nearly flat by other hands.' },
      ],
      choices: [
        { text: 'Set your hand in the worn place. Enter by the bells.', goto: 'accepted', sourceFinaleChoice: 'tower' },
        { text: 'Leave the seal cold. Follow the tape to the chapel.', goto: 'declined', sourceFinaleChoice: 'chapel' },
      ],
    },
    accepted: {
      speaker: 'THE PORTRAIT',
      lines: [
        { who: 'you', text: 'If I put my hand there, whose name goes in the ledger?' },
        { who: 'bust', text: 'Yours, if you return to answer for it. Mine, if you do not.' },
        { who: 'direction', text: 'The stone is colder than the rain. Six narrow fractures open behind the pedestal, each holding the afterimage of a bell.' },
        { who: 'bust', text: 'Go carefully. The sixth has always rung for late initiates.' },
      ],
      goto: 'done',
    },
    declined: {
      speaker: 'THE PORTRAIT',
      lines: [
        { who: 'you', text: 'Keep your ledger.' },
        { who: 'bust', text: 'My dear man, it has been keeping us.' },
        { who: 'direction', text: 'The seal dulls. No side road closes; you simply notice that one never opened. The tape ahead continues toward the chapel.' },
      ],
      goto: 'done',
    },
    done: { speaker: 'THE PORTRAIT', lines: [] },
  };
}
