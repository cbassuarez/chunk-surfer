// Plain earned acknowledgements shared by the achievement notice and archive.
// Canonical names, requirements and award rules remain in achievement-defs.js.
import {ACHIEVEMENT_BY_ID} from '../progression/achievement-defs.js';
export const ACHIEVEMENT_EARNED_REASONS = Object.freeze({
  "ACH_WORK_ORDER": "Accepted the Ellery recording contract.",
  "ACH_FIRST_TAKE": "Delivered the first accepted room tone.",
  "ACH_HUSH_MET": "Encountered HUSH.",
  "ACH_PLAYBACK": "Heard something new on a recorded take.",
  "ACH_CHAPEL_KEY": "Retrieved the chapel key.",
  "ACH_FIVE_ROOMS": "Completed the recording manifest.",
  "ACH_NAME_SARAH": "Named Sarah to the room.",
  "ACH_COFFEE": "Drank the guard's coffee.",
  "ACH_DO_NOT_DISTURB": "Left Martin's worried check-in unanswered.",
  "ACH_RADIO_SILENCE": "Finished without using the radio.",
  "ACH_CATALOGUE": "Finished after inspecting eight field objects.",
  "ACH_LIGHT_OFF": "Extinguished the light before the figure arrived.",
  "ACH_RELEASE_RECORD": "Opened the release record.",
  "ACH_ALL_PLAYBACK": "Completed all three playback disclosures.",
  "ACH_END_SACRIFICE": "Filed the chapel containment ending.",
  "ACH_CENTURY_STAY": "Chose to remain as the seal for a century.",
  "ACH_END_HELPED": "Filed the ending with the intervention.",
  "ACH_END_INVERSION": "Filed the escape through the other door.",
  "ACH_END_DRUGGED": "Filed the contaminated escape ending.",
  "ACH_END_SURFACED": "Filed the ending that brought the other recordist out.",
  "ACH_END_CONTACT-WON": "Filed the victory at the Source confrontation.",
  "ACH_END_CONTACT-LOST": "Filed the defeat at the Source confrontation.",
  "ACH_END_TOWER-WON": "Filed the extraction after the tower victory.",
  "ACH_END_TOWER-LOST": "Filed the defeat at the tower confrontation.",
  "ACH_ALL_ENDINGS": "Filed all nine different endings.",
  "ACH_UNINJURED": "Finished without an injury.",
  "ACH_SECOND_TRACK": "Unlocked a run for THE HUSH with at most three injuries.",
  "ACH_UNBROKEN": "Completed every accepted take without spoiling one.",
  "ACH_FIRST_PASS": "Finished with three first-attempt wins and no defeats.",
  "ACH_DEAD_AIR": "Finished on Dead Air without lowering the challenge.",
  "ACH_ONE_TORCH": "Finished without restoring a building circuit.",
  "ACH_BUILDING_ALIVE": "Restored all five circuits in one run.",
  "ACH_FIELD_NOTES": "Found all sixteen field papers.",
  "ACH_FIELD_LEADS": "Found all four optional field leads.",
  "ACH_OFF_AIR": "Listened through the channel thirteen transmission.",
  "ACH_CALL_YOURSELF": "Completed the call from the roadside box to the van.",
  "ACH_HIDDEN_EXCHANGES": "Completed both hidden exchanges.",
  "ACH_COMPLETE_ARCHIVE": "Earned all 37 other achievements."
});

export function achievementEarnedReason(id) {
  return typeof id === 'string' && Object.hasOwn(ACHIEVEMENT_EARNED_REASONS,id)
    ? ACHIEVEMENT_EARNED_REASONS[id] : '';
}

// Classification is canonical and independent of earned or selected state.
export function achievementPresentationCategory(id) {
  return typeof id === 'string' && Object.hasOwn(ACHIEVEMENT_BY_ID,id)
    ? ACHIEVEMENT_BY_ID[id].category : 'all';
}
