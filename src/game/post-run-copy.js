export const POST_RUN_STAGE_COPY = Object.freeze({
  filing: Object.freeze({
    panel: 'PREPARING THE HUSH',
    title: 'PREPARING THE HUSH',
    primary: 'SAVING YOUR COMPLETED RUN…',
    secondary: 'THE HUSH WILL BE AVAILABLE WHEN THIS IS COMPLETE.',
  }),
  report: Object.freeze({ panel: 'RUN COMPLETE', title: 'RUN COMPLETE' }),
  achievements: Object.freeze({ panel: 'ACHIEVEMENTS', title: 'ACHIEVEMENTS UNLOCKED' }),
  unlocks: Object.freeze({ panel: 'NEW OPTIONS', title: 'NEW OPTIONS UNLOCKED' }),
  'second-shift': Object.freeze({ panel: 'NEXT PLAYTHROUGH', title: 'NEXT PLAYTHROUGH' }),
  actions: Object.freeze({ panel: 'WHAT NEXT?', title: 'WHAT NEXT?' }),
});

export const POST_RUN_ACTIONS = Object.freeze([
  Object.freeze({
    id: 'replay',
    label: 'PLAY AGAIN',
    body: 'Start a new playthrough with replay options and new difficulty settings.',
  }),
  Object.freeze({
    id: 'hush',
    label: 'THE HUSH',
  }),
  Object.freeze({
    id: 'archive',
    label: 'ACHIEVEMENTS & RUN HISTORY',
    body: 'Review achievements, completed runs, unlocked hints, and archived story documents.',
  }),
  Object.freeze({ id: 'title', label: 'TITLE SCREEN' }),
]);

export const FEATURE_COPY = Object.freeze({
  archive: Object.freeze({
    label: 'ACHIEVEMENTS & RUN HISTORY',
    description: 'Review achievements, completed runs, and archived story documents from the title screen.',
  }),
  returnIndex: Object.freeze({
    label: 'ENDING HINTS',
    description: 'The Endings screen now shows a hint toward another ending.',
  }),
  reopenCase: Object.freeze({
    label: 'NEW PLAYTHROUGH',
    description: 'Start the story again with repeat-playthrough options now available.',
  }),
  deadAir: Object.freeze({
    label: 'DEAD AIR DIFFICULTY',
    description: 'The hardest difficulty preset is now available.',
  }),
  seenTextAcceleration: Object.freeze({
    label: 'FAST-FORWARD SEEN TEXT',
    description: 'Previously read dialogue and documents can be advanced more quickly.',
  }),
  archiveSignals: Object.freeze({
    label: 'UNSEEN CHOICE MARKERS',
    description: 'Optionally mark dialogue choices you have not selected before.',
  }),
  condensedCheckIn: Object.freeze({
    label: 'SHORTENED INTRO',
    description: 'Repeat playthroughs can shorten parts of the opening sequence.',
  }),
  partialReturnClassifications: Object.freeze({
    label: 'MORE ENDING INFO',
    description: 'The Endings screen now reveals more information about endings you have not reached.',
  }),
  customShift: Object.freeze({
    label: 'CUSTOM DIFFICULTY',
    description: 'Adjust individual gameplay difficulty settings.',
  }),
  fullReturnIndex: Object.freeze({
    label: 'ALL ENDINGS SHOWN',
    description: 'The Endings screen now shows every ending by name. How to reach them remains hidden.',
  }),
});

export const NEXT_ENDING_HINTS = Object.freeze({
  sacrifice: 'Take the broken recording rig with you. At the final choice, try using it instead of giving the chapel the agreement it asks for.',
  helped: 'Keep the coffee choice, but take the broken recording rig and look for a way out instead of staying.',
  inversion: 'The broken rig can do more than reverse the signal. Look for proof that the other recordist can still be recovered.',
  drugged: 'Keep the coffee choice, but stay when the chapel asks for its final answer instead of escaping.',
  surfaced: 'Instead of releasing the other recordist, try giving the chapel the agreement it asks for.',
});

export const HUSH_COPY = Object.freeze({
  ready: Object.freeze({
    short: 'PLAY YOUR COMPLETED RUN AS THE HUSH.',
    body: 'Play as THE HUSH beside your completed run and cause the events your past self experienced.',
  }),
  resume: Object.freeze({
    short: 'CONTINUE OR RESTART YOUR HUSH PLAYTHROUGH.',
    body: 'Continue your HUSH playthrough or restart it from the beginning.',
  }),
  filing: Object.freeze({
    short: 'PREPARING YOUR COMPLETED RUN FOR THE HUSH…',
    body: 'Preparing your completed run for THE HUSH…',
  }),
  qualification: Object.freeze({
    short: 'FINISH A RUN WITH NO MORE THAN 1 INJURY TO PLAY.',
    body: 'Finish a run with no more than 1 injury to play THE HUSH.',
  }),
  failed: Object.freeze({
    short: 'FINISH ANOTHER RUN TO PREPARE THE HUSH.',
    body: 'This run could not be prepared for THE HUSH. Finish another run to try again.',
  }),
  incompatible: Object.freeze({
    short: 'FINISH A NEW RUN TO PREPARE THE HUSH.',
    body: 'This saved run is too old for THE HUSH. Finish a new run to play.',
  }),
  unavailable: Object.freeze({
    short: 'FINISH A QUALIFYING RUN TO PLAY THE HUSH.',
    body: 'Finish a qualifying run to play THE HUSH.',
  }),
});

export function endingHintForEnding(endingId) {
  return NEXT_ENDING_HINTS[endingId] || '';
}

export function hushAvailabilityCopy({ status, hasSession = false } = {}) {
  if (status === 'ready') {
    const copy = hasSession ? HUSH_COPY.resume : HUSH_COPY.ready;
    return { enabled: true, ...copy };
  }
  if (status === 'filing') return { enabled: false, ...HUSH_COPY.filing };
  if (status === 'qualification-required' || status === 'not-qualified') {
    return { enabled: false, ...HUSH_COPY.qualification };
  }
  if (status === 'failed') return { enabled: false, ...HUSH_COPY.failed };
  if (status === 'incompatible') return { enabled: false, ...HUSH_COPY.incompatible };
  return { enabled: false, ...HUSH_COPY.unavailable };
}

export function dispatchPostRunAction(actionId, handlers = {}) {
  const handler = {
    replay: handlers.onReopen,
    hush: handlers.onHush,
    archive: handlers.onArchive,
    title: handlers.onTitle,
  }[actionId];
  if (typeof handler !== 'function') return false;
  handler();
  return true;
}
