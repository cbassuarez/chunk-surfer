// The tutorial, which is a man doing his setup.
//
// It teaches four verbs and it never takes a key away, because the game's one
// law is that every rule is a price and never a locked door. A step is a thing
// the ROOM wants — it is dark, the order is in your jacket, you always check
// levels before you work, the door is at the south end — and the prompt is the
// recordist noticing it. Do them out of order and the tutorial simply agrees
// with you and moves on.
//
// The level check is the important one. It is a real take, on the real
// recorder, in the real dark: light out, feet still, monitor open. Six seconds
// instead of forty-five, and nothing is hunting you yet. By the time anything
// is, the player has already learned the posture that makes them prey.
//
// Nothing here spawns the presence. The building learns someone is in it at the
// first REAL take, which is the first one that counts toward the job.

import * as REC from './recordist.js';

export const LEVEL_CHECK_SECONDS = 6;

const state = {
  active: false,
  step: 0,
  seen: new Set(),      // steps whose opening line has been said
  slowUsed: false,
  startedAt: 0,
  say: () => {},
  onLevelsGood: () => {},
};

// ctx: { px, py, light, recording, takeElapsed, spoiled, spoilReason,
//        workOrderRead, marked, slow }
const STEPS = [
  {
    id: 'light',
    // He is standing in a loading dock with the door shut. There is nothing.
    line: { who: 'you', text: "Can't see my hand." },
    prompt: '[f]  light',
    done: (c) => c.light,
    exit: { who: 'you', text: 'Light attracts. Everything in here that can hear, can see.' },
  },
  {
    id: 'read',
    line: { who: 'you', text: "Work order's in my jacket. Five rooms, one clean minute each." },
    prompt: '[b]  bag  —  read the work order',
    done: (c) => c.workOrderRead,
  },
  {
    // The one step that will not move until he has done it himself. Nothing is
    // greyed out and nothing is refused — all five rooms are markable from the
    // first minute. He simply does not get on with the night until he has used
    // the verb once, on the room the work order told him to do first.
    id: 'mark',
    line: { who: 'you', text: 'Five rooms. I should mark them off as I go, like a grown man.' },
    prompt: '[space]  mark studio B3',
    done: (c) => c.marked === 'main_b3',
    exit: { who: 'you', text: 'Down the west stair, behind the dock. Mark them off as you go and you never lose an hour.' },
  },
  {
    id: 'level',
    line: { who: 'you', text: 'Levels, before anything. Light off, feet still, forty-five seconds of nothing.' },
    prompt: '[r]  record',
    done: (c) => c.levelChecked,
  },
  {
    id: 'go',
    line: { who: 'you', text: 'Inner door, south end. Down to B3.' },
    prompt: '[w a s d]  move     [shift]  quietly',
    // Leaving the dock ends the setup. Walking softly is offered, never
    // required — a player who strides out has learned the lesson the building
    // is about to teach them properly, and holding the prompt on screen until
    // they press shift would be the game locking a door.
    done: (c) => c.py > 15,
    exit: { who: 'you', text: 'Quietly, then. Everything I do in here, the building keeps.' },
  },
];

export function tutorialInit({ say, onLevelsGood } = {}) {
  if (say) state.say = say;
  if (onLevelsGood) state.onLevelsGood = onLevelsGood;
}

export function startTutorial() {
  state.active = true;
  state.step = 0;
  state.seen.clear();
  state.slowUsed = false;
  state.startedAt = performance.now();
}
export function skipTutorial() { state.active = false; state.step = STEPS.length; }
export function tutorialActive() { return state.active && state.step < STEPS.length; }
export function tutorialStep() { return tutorialActive() ? STEPS[state.step].id : null; }
export function tutorialPrompt() { return tutorialActive() ? STEPS[state.step].prompt : null; }

// The level check owns the recorder for six seconds and then hands it back.
// Spoiling it is allowed, costs nothing, and teaches the whole game.
let levelChecked = false;
let spoiltOnce = false;

export function tickTutorial(dt, ctx) {
  if (!tutorialActive()) return;
  const step = STEPS[state.step];

  if (!state.seen.has(step.id)) {
    state.seen.add(step.id);
    state.say(step.line);
  }

  if (ctx.slow) state.slowUsed = true;

  if (step.id === 'level' && !levelChecked) {
    if (ctx.recording && ctx.spoiled && !spoiltOnce) {
      spoiltOnce = true;
      state.say({ who: 'you', text: `That's me on the take. ${ctx.spoilReason === 'you moved' ? 'Feet.' : 'Hand on the light.'} Again.` });
    }
    if (ctx.recording && !ctx.spoiled && ctx.takeElapsed >= LEVEL_CHECK_SECONDS) {
      levelChecked = true;
      state.say({ who: 'you', text: 'Levels good. Floor is somewhere under sixty. This building is dead.' });
      state.onLevelsGood();
    }
  }

  const full = { ...ctx, slow: state.slowUsed, levelChecked };
  if (step.done(full)) {
    if (step.exit) state.say(step.exit);
    state.step++;
    if (state.step >= STEPS.length) state.active = false;
  }
}

export function loadTutorialState(saved = {}) {
  // A tutorial is a thing you do once, and the save remembers you did it.
  if (saved.done) skipTutorial();
}
export function saveTutorialState() { return { done: !tutorialActive() && state.step >= STEPS.length }; }
