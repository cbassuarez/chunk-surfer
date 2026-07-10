// PROLOGUE — draft prose, for Seb to rewrite. Engine-verified, not authored.
//
// Register: frame. The Usher greets you, addresses a "you", and loses track of
// whose. Nothing is explained. Nothing is a metaphor yet.
//
// Talk to the Usher a second time to see the `decay` register work: lines the
// conversation has already spoken are struck through and not spoken again.

export const dialogue = {
  'usher.intro': {
    speaker: 'THE USHER',
    portrait: 'usher.neutral',
    register: 'straight',
    lines: [
      'you came in through the fog again.',
      { direction: 'the usher does not look up. the usher never looks up. you knew that before you arrived.' },
      'there is a "you" in this story. someone lost, someone owed.',
      'we have stopped checking whose.',
    ],
    choices: [
      { text: 'ask who "you" is', goto: 'usher.who', set: ['askedWho'] },
      { text: 'say nothing', goto: 'usher.silence', aside: 'the game expected this' },
    ],
    set: ['metUsher'],
  },

  'usher.who': {
    speaker: 'THE USHER',
    portrait: 'usher.averted',
    register: 'ironic',
    lines: [
      'that is the question the door is for.',
      { direction: 'a pause of exactly the length this genre requires.' },
      'you have walked {steps} steps. mostly in circles. that is not a criticism; it is the shape of the building.',
    ],
    goto: 'usher.after',
  },

  'usher.silence': {
    speaker: 'THE USHER',
    portrait: 'usher.averted',
    register: 'ironic',
    lines: [
      'good. the silence is doing most of the work anyway.',
    ],
    goto: 'usher.after',
  },

  'usher.after': {
    speaker: 'THE USHER',
    portrait: 'usher.neutral',
    register: 'straight',
    lines: [
      'go on, then. it is only a corridor.',
      { direction: 'it is not only a corridor.' },
    ],
    set: ['prologueDone'],
  },

  // Second visit. The decay register: the conversation wears out as you use it.
  'usher.again': {
    speaker: 'THE USHER',
    portrait: 'usher.neutral',
    register: 'decay',
    if: 'prologueDone',
    lines: [
      'you came in through the fog again.',
      'there is a "you" in this story.',
      'we have stopped checking whose.',
      { direction: 'the usher says all of it again, and less of it each time.' },
    ],
  },
};
