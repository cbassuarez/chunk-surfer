// The tutorial, which is a man doing his setup.
//
// It teaches four verbs, and for most of them it never takes a key away — a step
// is a thing the ROOM wants (it is dark, the order is in your jacket, the door is
// at the south end) and the prompt is the recordist noticing it. Do those out of
// order and the tutorial simply agrees with you and moves on.
//
// The level check is the ONE deliberate exception: the recordist will not roll a
// take that counts until he has set his levels at B3, in the dark, and rehearsed
// the room he dreads. This is not a UI lock dressed as fiction — it is the man's
// own discipline. You go to B3 first and set up first because that is the job,
// and until you have, `setup.levels`/`combat.trained` stay unset and the recorder
// refuses (see main.js recordAction / onLevelsSet).
//
// The level check itself is a real take, on the real recorder, in the real dark:
// light out, feet still, monitor open. Six seconds instead of forty-five, and
// nothing is hunting you yet. By the time anything is, the player has already
// learned the posture that makes them prey — and, in the daydream that follows
// it, the shape of the fight.
//
// Nothing here spawns the presence. The building learns someone is in it at the
// first REAL take, which is the first one that counts toward the job.

import * as REC from './recordist.js';
import { inputPrompt, promptLine } from './bindings.js';

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

// A GUIDE is the loud version of a step: the surface it happens on, the one
// control that matters, and — the part the small footer hint could never carry —
// WHY he is doing it. A surface that has a guide locks itself to that control
// and says all of this out loud, so a guided moment can never be mistaken for a
// stray keybind the player is free to ignore.
//
//   surface  which screen owns the step ('bag')
//   section  / entry: what the surface should hold the cursor on
//   action   the binding id the callout names and the lock allows
//   title    what pressing it does
//   why      why the recordist wants it, in his words
//
// ctx: { px, py, light, recording, takeElapsed, spoiled, spoilReason,
//        workOrderRead, marked, slow }
const STEPS = [
  {
    id: 'light',
    // He is standing in a loading dock with the door shut. There is nothing.
    line: { who: 'you', text: "Can't see my hand." },
    prompt: () => `${inputPrompt('light')}  light`,
    done: (c) => c.light,
    exit: { who: 'you', text: 'Light attracts. Everything in here that can hear, can see.' },
  },
  {
    id: 'read',
    line: { who: 'you', text: "Work order's in my jacket. Five rooms, one clean minute each." },
    // Both verbs, because he has both. The order of the setup is his discipline,
    // not a lock: pressing the recorder here already works (firstTakeIntercept
    // opens the level check whenever levels are unset), so a prompt that named
    // only the bag was hiding a key the player already had and making the one it
    // did name look like the only thing the room would accept.
    prompt: () => promptLine([
      { action: 'bag', label: 'bag  -  read the work order' },
      { action: 'recorder', label: 'set levels' },
    ], { separator: '     ' }),
    done: (c) => c.workOrderRead,
    guide: {
      surface: 'bag',
      section: 'files',
      entry: 'file:work-order',
      action: 'confirm',
      title: 'READ THE WORK ORDER',
      why: 'FIVE ROOMS AND ONE CLEAN MINUTE IN EACH. IT ALSO NAMES THE ROOM THE CLIENT WANTS FIRST.',
    },
  },
  {
    // Levels, the mic test, and the daydream that rehearses the fight are one
    // step, because they are one thing he does: he sets up, on the dock, before
    // he goes anywhere. The step does not end when the meter reads good — it ends
    // when he has also run the worst room in his head, or the next step's line
    // lands on top of the drill.
    //
    // This is a level check, NOT a take. It is set here, in the dark, on the
    // dock floor; the five rooms are recorded in the five rooms. (main.js keeps
    // them apart: see LEVEL_CHECK_ROOM / beginTakeNow.)
    id: 'level',
    line: { who: 'you', text: 'Levels, before anything. Headphones on, hear the room — then roll, and hold still.' },
    prompt: () => `${inputPrompt('recorder')}  listen, then ${inputPrompt('recorder')} to roll`,
    done: (c) => c.levelChecked && c.rehearsed !== false,
  },
  {
    // The LAST step, and the hand-off out of the dock: kit honest, six seconds
    // held, and now he writes down where he is going. Nothing is greyed out and
    // nothing is refused — all five rooms are markable — he simply does not get on
    // with the night until he has used the verb once, on the room the order named.
    //
    // It comes after the level check on purpose: a waypoint means nothing to a
    // player who has not yet done anything, and everything to one who is about to
    // walk into a building. The bag prompt flashes while this step is live (see
    // drawStoryHud) because it is the one verb they have not been shown yet.
    id: 'mark',
    line: { who: 'you', text: 'Right. Before I go anywhere — write down where I am going.' },
    prompt: () => promptLine([
      { action: 'bag', label: 'bag  -  mark studio B3' },
    ], { separator: '     ' }),
    done: (c) => c.marked === 'main_b3',
    exit: { who: 'you', text: 'Down the west stair, behind the dock. Mark them off as you go and you never lose an hour.' },
    guide: {
      surface: 'bag',
      section: 'map',
      entry: 'room:main_b3',
      action: 'mark',
      title: 'MARK STUDIO B3',
      why: 'A MARK IS A BEARING — THE ROOM YOU MARK IS THE ONE THE HUD POINTS AT ALL NIGHT. B3 GOES FIRST: IT IS THE DEEPEST ROOM AND THE TORCH IS ONLY EVER THIS FULL ONCE.',
    },
  },
  {
    id: 'go',
    line: { who: 'you', text: 'Inner door, south end. Down to B3 — follow the bearing. That mark is the whole point of making it.' },
    prompt: () => promptLine([{ action: 'move', label: 'move' }, { action: 'quiet', label: 'quietly' }], { separator: '     ' }),
    // Leaving the dock ends the setup. Walking softly is offered, never
    // required — a player who strides out has learned the lesson the building
    // is about to teach them properly, and holding the prompt on screen until
    // they press shift would be the game locking a door.
    done: (c) => c.leftDock,
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
export function tutorialPrompt() {
  if (!tutorialActive()) return null;
  const prompt = STEPS[state.step].prompt;
  return typeof prompt === 'function' ? prompt() : prompt;
}

// The current step's guide, if it has one, tagged with the step id so a surface
// can tell one guided moment from the next. `surface` filters: the bag asks for
// its own and gets null the rest of the night.
export function tutorialGuide(surface = null) {
  if (!tutorialActive()) return null;
  const guide = STEPS[state.step].guide;
  if (!guide) return null;
  if (surface && guide.surface !== surface) return null;
  return { ...guide, step: STEPS[state.step].id };
}

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
