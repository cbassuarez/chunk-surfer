// The Horizon portrait is an audience, not a shopkeeper. The eyes earn the
// right to hear the old institution describe itself. The route choice stays
// behind a second conversation layer where identity, history, route, and
// consequence can be interrogated before the seal is touched.

const freezeLines = (lines) => Object.freeze(lines.map((line) => Object.freeze(line)));

const SHARED_AUDIENCE = freezeLines([
    { who: 'you', text: 'Hello?' },
    { who: 'bust', text: 'Bold choice. You made it this far, but have left so much behind. I have been expecting you, however.' },
    { who: 'you', text: 'What choice do I have?' },
    { who: 'bust', text: "You have had many choices tonight. But I'm afraid your possibilities are ending. Beyond me lies the end." },
    { who: 'you', text: 'Of?' },
    { who: 'bust', text: 'Of it all? Of nothing? Of this game? Take your pick... though, there is another way.' },
]);

export const HORIZON_BUST_AUDIENCE = Object.freeze({
  carried: freezeLines([
    { who: 'direction', text: 'Inside your bag, the loose marble eyes knock once against your torch and other belongings; not so nice for a pair of eyes. The bust is blind, but it has ears, and he chimes:' },
    { who: 'bust', text: 'Ah, a man of true regard.' },
    ...SHARED_AUDIENCE,
  ]),
  returned: freezeLines([
    { who: 'direction', text: "The portrait’s pupils slip into the bust's sockets and roll into place. They instantly take the Horizon’s wet colour." },
    { who: 'bust', text: "There we are. My. Your eyes—they've seen quite the folly. I have respite for them, a safer path, if you'd like." },
    ...SHARED_AUDIENCE,
  ]),
});

// The first two refusal beats still happen in the world. The next interaction
// opens the response tree below, so the player gets posture without turning a
// failed audience into a route choice.
export const HORIZON_BUST_REFUSAL = freezeLines([
  { who: 'direction', text: 'The bust stays immobile.' },
  { who: 'bust', text: "Do you have eyes for me?" },
]);

export function horizonBustRefusalTree() {
  return {
    start: {
      speaker: 'THE PORTRAIT',
      lines: [],
      choices: [
        { text: 'Like, do I like you?', goto: 'like' },
        { text: 'No.', goto: 'no' },
        { text: 'Yes.', goto: 'yes' },
        { text: 'What kind of eyes?', goto: 'kind' },
        { text: 'Is that a metaphor?', goto: 'metaphor' },
      ],
    },
    like: {
      speaker: 'THE PORTRAIT',
      lines: [
        { who: 'you', text: "Like, do I like you?" },
        { who: 'bust', text: "I'm flattered. Nobody really visits anymore. But no, I mean, do you have eyeballs for me with which to see?" },
        { who: 'you', text: "That... makes more sense, oddly. And no. I don't." },
      ],
      goto: 'refused',
    },
    no: {
      speaker: 'THE PORTRAIT',
      lines: [
        { who: 'you', text: 'No.' },
        { who: 'bust', text: "That's a shame, I would have made it worth your while." },
        { who: 'you', text: "In what way?" },
        { who: 'bust', text: "Can't say now." },
      ],
      goto: 'refused',
    },
    yes: {
      speaker: 'THE PORTRAIT',
      lines: [
        { who: 'you', text: 'Yes.' },
        { who: 'bust', text: 'Wonderful. Put them in.' },
        { who: 'you', text: 'My eyes?' },
        { who: 'bust', text: 'Your spare ones.' },
        { who: 'you', text: 'Right. No yeah, of course.' },
      ],
      goto: 'refused',
    },
    kind: {
      speaker: 'THE PORTRAIT',
      lines: [
        { who: 'you', text: 'What kind of eyes?' },
        { who: 'bust', text: 'Eyeballs. Marble. A pair. Mine, ideally.' },
        { who: 'you', text: "That... makes more sense, oddly. And no. I don't." },
      ],
      goto: 'refused',
    },
    metaphor: {
      speaker: 'THE PORTRAIT',
      lines: [
        { who: 'you', text: 'Is that a metaphor?' },
        { who: 'bust', text: 'No. I mean eyeballs with almost offensive literalness.' },
        { who: 'you', text: "Right. No, I don't." },
      ],
      goto: 'refused',
    },
    refused: {
      speaker: 'THE PORTRAIT',
      lines: [
        { who: 'bust', text: "Pity. Then I can't show you the other way." },
        { who: 'you', text: "Because you can't see me?" },
        { who: 'bust', text: "Because that's how deals work lad." },
      ],
      // A LOCKED DOOR WITH A JOKE ON IT IS NOT A BEAT.
      //
      // This used to go straight to stone, which meant a player who never found
      // the fountain got two lines and a punchline and then four hundred more
      // metres of nobody. He cannot give them the road — that is what the eyes
      // buy, and the trade has to stay real — but he is the only thing out here
      // that has stood in this recording and can talk about it, and telling them
      // where they are costs him nothing he was selling.
      choices: [
        { text: 'Then what CAN you do?', goto: 'told' },
        { text: 'Leave him to it.', goto: 'stone' },
      ],
    },
    told: {
      speaker: 'THE PORTRAIT',
      lines: [
        { who: 'you', text: 'Then what can you do?' },
        { who: 'bust', text: "Talk. I'm very good at it and there's no queue." },
        { who: 'bust', text: "You're inside a recording of somewhere, walking up its length. That's not a figure of speech — the far end of this is later, and the way you've come is earlier, and it's all still standing because nothing here knows how to throw a picture away." },
        { who: 'you', text: 'I noticed the middle of it is ruined.' },
        { who: 'bust', text: "It is. It comes apart around where I'm standing and it puts itself back together a good way on, and nobody repaired anything in between. Whatever decided it should be legible again did that on its own." },
        { who: 'bust', text: "Keep to the bright of it. The picture wanders and the walkable part wanders with it, and the dark at the sides is where the recording simply stops having anything. You won't fall. You'll just stop being anywhere." },
        { who: 'you', text: 'And the end?' },
        { who: 'bust', text: "Goes out. Not dramatically — it's a tape, it runs out of tape. Then you're in the nave, and the nave is a different problem, and I'd tell you about that one too if you'd brought my eyes." },
      ],
      goto: 'stone',
    },
    stone: {
      speaker: 'THE PORTRAIT',
      lines: [
        { who: 'direction', text: 'The bust returns to stone with a dazzling immediacy. Even immobile objects know how to end conversations faster than you.' },
      ],
      goto: 'done',
    },
    done: { speaker: 'THE PORTRAIT', lines: [] },
  };
}

export function horizonBustAudience(mode = 'untouched') {
  return HORIZON_BUST_AUDIENCE[mode] || HORIZON_BUST_REFUSAL;
}

// `defeats` is how many times the cathedral fight has already been lost — the
// promise in `consequence` made good. At zero this is the first meeting and
// nothing below changes. Above zero the bust has already been proved right, so
// it says so, and the choice it offers is no longer a choice: the option to
// leave the way you were going is BUILT OUT of the array rather than greyed,
// which is how this game has always removed a thing (see endingChoice).
export function horizonBustProposition(lastLine = null, { defeats = 0 } = {}) {
  const again = Math.max(0, Math.floor(Number(defeats) || 0));
  const returning = again > 0;
  return {
    start: {
      speaker: 'THE PORTRAIT',
      lines: returning ? [
        ...(lastLine ? [lastLine] : []),
        { who: 'direction', text: 'The bevel is warm. Your own hand did that, and not long ago.' },
        again === 1
          ? { who: 'bust', text: 'There you are. I did say.' }
          : { who: 'bust', text: 'Again. I am starting to feel responsible for you, which is new, and I do not care for it.' },
      ] : [
        ...(lastLine ? [lastLine] : []),
        { who: 'direction', text: 'A palm-shaped bevel shines on the pedestal. The skull above it has lost its name; the crossed bones below have been worn nearly flat by other hands.' },
        { who: 'bust', text: 'There. That is the other way.' },
      ],
      goto: returning ? 'decision' : 'questions',
    },
    questions: {
      speaker: 'THE PORTRAIT',
      lines: [],
      choices: [
        { text: 'Who are you?', goto: 'identity', hideWhenAsked: true },
        { text: 'What are the Second Minutes?', goto: 'history', hideWhenAsked: true },
        { text: 'Where does this go?', goto: 'route', hideWhenAsked: true },
        { text: "What's the catch?", goto: 'consequence', hideWhenAsked: true },
        { text: 'Enough. Show me the choice.', goto: 'decision' },
      ],
    },
    identity: {
      speaker: 'THE PORTRAIT',
      lines: [
        { who: 'you', text: 'Who are you?' },
        { who: 'bust', text: 'A bust. These days.' },
        { who: 'you', text: 'Of who?' },
        { who: 'bust', text: "Does a bust know who they're made in image of? At least I don't. Who knows. I've gone through many names in my eternal boredom, Maximilian de la Visconty de Routledge, Saint-Fernandique-du-Tabernaque, Jacobo 'Ojos Piedras' Baxoreicoacha, maybe my true identity lies somewhere in between the many names I've given myself." },
      ],
      goto: 'questions',
    },
    history: {
      speaker: 'THE PORTRAIT',
      lines: [
        { who: 'you', text: 'What are the Second Minutes?' },
        { who: 'bust', text: 'The minutes after the meeting ended. The things nobody wanted in the first set.' },
        { who: 'you', text: "That's an organization?" },
        { who: 'bust', text: 'Eventually.' },
      ],
      goto: 'questions',
    },
    route: {
      speaker: 'THE PORTRAIT',
      lines: [
        { who: 'you', text: 'Where does this go?' },
        { who: 'bust', text: "A detour. Some would call it a French exit." },
        { who: 'you', text: 'How much longer?' },
        { who: 'bust', text: "How should I know? I'm marble and metal, and this place is empty and timeless. Regardless, probably about another 20 minutes if all goes well." },
      ],
      goto: 'questions',
    },
    consequence: {
      speaker: 'THE PORTRAIT',
      lines: [
        { who: 'you', text: "What's the catch?" },
        { who: 'bust', text: "It's easier as long as you don't lose." },
        { who: 'you', text: 'And if I lose?' },
        { who: 'bust', text: "Then I'll see you here again, but you'll have no choice but to continue." },
      ],
      goto: 'questions',
    },
    decision: {
      speaker: 'THE PORTRAIT',
      lines: returning ? [
        { who: 'you', text: 'Can I go back? Take the other way?' },
        again === 1
          ? { who: 'bust', text: 'No. I told you that part before you agreed, which is more than most get.' }
          : { who: 'bust', text: 'You know the answer. Ask me something you do not know.' },
        { who: 'direction', text: 'There is one bevel, and it is the one your hand already knows.' },
      ] : [
        { who: 'bust', text: 'So. Keep going, or let me introduce you.' },
      ],
      // The chapel is simply not here on a return. "No choice but to continue"
      // is one row, not two rows with one of them dimmed.
      choices: returning ? [
        { text: 'Set your hand in the bevel. Again.', goto: 'accepted', sourceFinaleChoice: 'tower' },
      ] : [
        { text: "Set your hand in the bevel. Take the Bust's path.", goto: 'accepted', sourceFinaleChoice: 'tower' },
        { text: "Leave the way you were going.", goto: 'declined', sourceFinaleChoice: 'chapel' },
      ],
    },
    accepted: {
      speaker: 'THE PORTRAIT',
      lines: returning ? [
        { who: 'direction', text: 'The fractures are already open. They never closed.' },
        again === 1
          ? { who: 'bust', text: 'They still know you are coming. That was never the hard part.' }
          : { who: 'bust', text: 'Last time I will watch you do this. One way or the other.' },
      ] : [
        { who: 'you', text: 'If I put my hand there, what happens?' },
        { who: 'bust', text: "To be honest, it's more fun to press something to make it happen. You've already agreed, the button is just symbolic. Call it user experience." },
        { who: 'direction', text: 'The stone is colder than the rain. Six narrow fractures open behind the pedestal, each holding a small imprint of a bell-like sigil.' },
        { who: 'bust', text: "There. Now they know you're coming." },
        { who: 'you', text: 'Fun.' },
      ],
      goto: 'done',
    },
    declined: {
      speaker: 'THE PORTRAIT',
      lines: [
        { who: 'you', text: "I'm alright for now." },
        { who: 'bust', text: "Don't say I didn't warn you." },
        { who: 'direction', text: "Something tells you that you narrowly missed a twenty minute detour." },
      ],
      goto: 'done',
    },
    done: { speaker: 'THE PORTRAIT', lines: [] },
  };
}
