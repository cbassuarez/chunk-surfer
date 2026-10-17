// The Horizon portrait is an audience, not a shopkeeper. The eyes earn the
// right to hear the old institution describe itself. The route choice stays
// behind a second conversation layer where identity, history, route, and
// consequence can be interrogated before the seal is touched.

const freezeLines = (lines) => Object.freeze(lines.map((line) => Object.freeze(line)));

const SHARED_AUDIENCE = freezeLines([
    { who: 'you', text: 'Hello?' },
    { who: 'bust', text: 'Bold choice. You made it this far, but have left so much behind. I have been expecting you, however.' },
    { who: 'you', text: 'What choice do I have?' },
    { who: 'bust', text: "You can keep walking to the chapel without my help. Beyond me lies the end." },
    { who: 'you', text: 'Of?' },
    { who: 'bust', text: "Of the road's career as a road. Those lamps and telephone boxes are turning back into their recording. What's gone stays gone. The ground stays under your feet; take your time. Rather bad for property values. Though I do have another way." },
]);

export const HORIZON_BUST_AUDIENCE = Object.freeze({
  carried: freezeLines([
    { who: 'direction', text: 'Inside your bag, the loose marble eyes knock once against your torch and other belongings; not so nice for a pair of eyes. The bust is blind, but it has ears, and he chimes:' },
    { who: 'bust', text: 'Ah, a man of true regard.' },
    ...SHARED_AUDIENCE,
  ]),
  returned: freezeLines([
    { who: 'direction', text: "The eyes you returned are still in the gallery. Here, bronze shutters withdraw from a matching pair of sockets. Mineral pupils settle behind the rims and take the Horizon’s wet colour." },
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
        { who: 'bust', text: "The street you came by is turning into its own recording. That was a telephone box a moment ago. Now it's light remembering the shape of one. Very poor weatherproofing." },
        { who: 'you', text: 'Can it put itself back?' },
        { who: 'bust', text: "No. Turn round if you like. What's gone stays gone. I'm marble; I find this distressingly casual." },
        { who: 'bust', text: "The ground stays under your feet. Stop to listen, look about — you're allowed. Walk beside the picture if you like; it won't take away the road you've walked. No need to walk it twice on my account." },
        { who: 'you', text: 'And the end?' },
        { who: 'bust', text: "The chapel is ahead. Keep going when you're ready; it doesn't require my eyes or my permission. The nave is a different problem, of course. I remain available for complaints." },
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
        { who: 'direction', text: 'The hand-shaped hollow is warm. Your own hand did that, and not long ago.' },
        { who: 'bust', text: 'The same phase. I will give you your breath and enough battery to answer. The damage stays. Two returns, then the full peal.' },
        again === 1
          ? { who: 'bust', text: 'There you are. I did say.' }
          : { who: 'bust', text: 'Again. I am starting to feel responsible for you, which is new, and I do not care for it.' },
      ] : [
        ...(lastLine ? [lastLine] : []),
        { who: 'direction', text: 'An open hand is cut low in the stone. Its dark palm and fingertips have been worn smooth.' },
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
        { who: 'bust', text: "A detour. Some would call it a French exit. A path beside this pedestal, out of the side of the picture. Bells beyond it; the tower at the far end." },
        { who: 'you', text: 'Do the bells ring?' },
        { who: 'bust', text: "Most have the good manners not to. A few don't. Make enough noise and you'll have to walk that part again. I recommend a quiet entrance." },
        { who: 'you', text: 'How much longer?' },
        { who: 'bust', text: "How should I know? I'm marble and metal. There is time to look around. The bells do not object to patience." },
      ],
      goto: 'questions',
    },
    consequence: {
      speaker: 'THE PORTRAIT',
      lines: [
        { who: 'you', text: "What's the catch?" },
        { who: 'bust', text: "Once I open it, you're committed to the tower. No going back to the thing by the lift. No taking the nave instead." },
        { who: 'you', text: 'And the tower?' },
        { who: 'bust', text: "It's easier as long as you don't lose." },
        { who: 'you', text: 'And if I lose?' },
        { who: 'bust', text: "Then I'll see you here again, but you'll have no choice but to continue." },
        { who: 'bust', text: 'The first two defeats bring you back to me. The third is final. There is no fourth attempt.' },
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
        { who: 'direction', text: 'There is one hand-shaped hollow, and it is the one your hand already knows.' },
        { who: 'bust', text: again === 1 ? 'Two attempts remain. The third defeat is final.' : 'This is your last attempt. A third defeat is final.' },
      ] : [
        { who: 'bust', text: 'So. Keep going to the chapel, or take my path. Agree, and it is the tower: no going back to the lift, no choosing the nave later.' },
        { who: 'bust', text: 'The first two defeats bring you back to me. The third is final. There is no fourth attempt. Put your hand in the worn seal only if you accept that.' },
      ],
      // The chapel is simply not here on a return. "No choice but to continue"
      // is one row, not two rows with one of them dimmed.
      choices: returning ? [
        { text: 'Set your hand in the hollow. Again.', goto: 'accepted', sourceFinaleChoice: 'tower' },
      ] : [
        { text: "Set your hand in the hollow. Commit to the tower.", goto: 'accepted', sourceFinaleChoice: 'tower' },
        { text: "Leave the way you were going.", goto: 'declined', sourceFinaleChoice: 'chapel' },
      ],
    },
    accepted: {
      speaker: 'THE PORTRAIT',
      lines: returning ? [
        { who: 'direction', text: 'The path is still there, leading away from the picture. It never closed.' },
        again === 1
          ? { who: 'bust', text: 'They still know you are coming. That was never the hard part.' }
          : { who: 'bust', text: 'Last time I will watch you do this. One way or the other.' },
      ] : [
        { who: 'you', text: 'All that, and it is a button?' },
        { who: 'bust', text: "You've already agreed. The button is ceremonial. Call it user experience." },
        { who: 'direction', text: 'The dark inlay warms under your palm. A narrow path opens beside the pedestal and bends out of the picture. Bells hang beyond it.' },
        { who: 'bust', text: "There. Walk it. Most of the bells are silent; not all. Make enough noise and you'll have to walk that bit again, from the last quiet clearing. Reach the next clearing and the noise settles. They know you're coming. No need to announce yourself." },
        { who: 'you', text: 'Fun.' },
      ],
      goto: 'done',
    },
    declined: {
      speaker: 'THE PORTRAIT',
      lines: [
        { who: 'you', text: "I'm alright for now." },
        { who: 'bust', text: "Don't say I didn't warn you." },
        { who: 'direction', text: 'Your hand stays off the seal. Beyond the pedestal, the chapel light holds.' },
      ],
      goto: 'done',
    },
    done: { speaker: 'THE PORTRAIT', lines: [] },
  };
}
