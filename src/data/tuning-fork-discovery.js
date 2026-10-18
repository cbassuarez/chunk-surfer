import { SEAM } from '../game/practice-seams.js';

// The physical inscription and the sounded reference are different evidence.
// Keep the inspection factual; the existing encounter supplies the player's
// response, including the later spoken insistence on four-forty.
export const TUNING_FORK_EVIDENCE = Object.freeze({
  soundedHz: SEAM.referenceHz,
  engravedHz: SEAM.pressureHz,
});

export const TUNING_FORK_ENGRAVING = `A=${TUNING_FORK_EVIDENCE.engravedHz}`;
export const TUNING_FORK_ENGRAVING_LINE = `It is engraved, badly, by hand, with a knife rather than a tool: ${TUNING_FORK_ENGRAVING}.`;
export const TUNING_FORK_BAG_LINE = `Steel. ${TUNING_FORK_ENGRAVING}, cut by hand below an older stamp.`;
export const TUNING_FORK_DETAIL = Object.freeze({
  id: 'tuning-fork',
  title: 'TUNING FORK',
  source: 'PRACTICE WING',
  body: `A thin steel fork lies across the desk of a music stand. Below the old stamp, someone has cut ${TUNING_FORK_ENGRAVING} into the steel by hand.`,
});
