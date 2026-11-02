import { ENDING_IDS, POWER_CIRCUIT_IDS } from './schema.js';
import { EVENT_TYPES } from './events.js';
import { ENDING_VARIANT } from '../data/ending-variants.js';
import { TARGETS } from '../data/conservatory-script.js';
import { completionCollections } from './completion.js';
import { CAUSAL_INJURY_CEILING } from '../causal/tape.js';

export const ACHIEVEMENT_CATALOG_VERSION = 1;
export const ACHIEVEMENT_CATALOG_ID = 'BASE_V1';

const hasManifest = run => TARGETS.every(id => run?.ledger?.takes?.rooms?.includes(id));
const collection = (profile, id) => completionCollections(profile).find(row => row.id === id);
const collectionDone = (profile, id) => { const row = collection(profile, id); return !!row?.target && row.current === row.target; };

const endingDef = (id, name) => ({
  id: `ACH_END_${id.toUpperCase()}`,
  name,
  description: 'File this return.',
  category: 'returns',
  hidden: true,
  events: [EVENT_TYPES.ENDING_COMMITTED],
  test: ({ event }) => event.payload?.endingId === id,
});

const definitions = [
  {
    id: 'ACH_WORK_ORDER', name: '4417-C',
    description: 'Accept the recording contract at Ellery.', category: 'work', hidden: false,
    events: [EVENT_TYPES.WORK_ORDER_ACCEPTED], test: () => true,
  },
  {
    id: 'ACH_FIRST_TAKE', name: 'A Clean Minute',
    description: 'Deliver your first accepted room tone.', category: 'work', hidden: false,
    events: [EVENT_TYPES.TAKE_COMPLETED], test: ({ event }) => TARGETS.includes(event.payload?.roomId),
  },
  {
    id: 'ACH_HUSH_MET', name: 'It Is Still Here',
    description: 'Encounter the HUSH.', category: 'disclosures', hidden: true,
    events: [EVENT_TYPES.HUSH_MET], test: () => true,
  },
  {
    id: 'ACH_PLAYBACK', name: 'Contains What You Did Not Hear',
    description: 'Complete a playback disclosure about something that was not in the room.', category: 'disclosures', hidden: true,
    events: [EVENT_TYPES.DISCLOSURE_HEARD], test: () => true,
  },
  {
    id: 'ACH_CHAPEL_KEY', name: 'C-17',
    description: 'Retrieve the chapel key.', category: 'work', hidden: false,
    events: [EVENT_TYPES.ITEM_OBTAINED], test: ({ event }) => event.payload?.id === 'chapel_key',
  },
  {
    id: 'ACH_FIVE_ROOMS', name: 'Five Rooms',
    description: 'Complete the recording manifest.', category: 'work', hidden: false,
    events: [EVENT_TYPES.TAKE_COMPLETED, EVENT_TYPES.MANIFEST_SLOT_COMPLETED],
    test: ({ run }) => hasManifest(run),
  },
  {
    id: 'ACH_NAME_SARAH', name: 'Say Her Name',
    description: 'Tell the room who she was.', category: 'disclosures', hidden: true,
    events: [EVENT_TYPES.CONFESSION_COMMITTED],
    test: ({ event }) => event.payload?.kind === 'name' && event.payload?.value === 'Sarah',
  },
  {
    id: 'ACH_COFFEE', name: "It's Not Good, But It's Hot",
    description: "Drink the guard's coffee.", category: 'disclosures', hidden: true,
    events: [EVENT_TYPES.COFFEE_DRUNK], test: () => true,
  },
  {
    id: 'ACH_DO_NOT_DISTURB', name: 'Do Not Disturb',
    description: "Let Martin's worried check-in go unanswered.", category: 'method', hidden: true,
    events: [EVENT_TYPES.RADIO_CUE_MISSED],
    test: ({ event }) => event.payload?.id === 'missed_checkin',
  },
  {
    id: 'ACH_RADIO_SILENCE', name: 'Radio Silence',
    description: 'Finish a run without answering, transmitting, or using the radio.', category: 'method', hidden: false,
    events: [EVENT_TYPES.RUN_FINISHED],
    test: ({ summary }) => summary?.radio?.tracked === true && summary.radio.uses === 0,
  },
  {
    id: 'ACH_CATALOGUE', name: 'Serviceable',
    description: 'Finish a run after inspecting eight distinct field objects.', category: 'method', hidden: false,
    events: [EVENT_TYPES.PROP_INSPECTED, EVENT_TYPES.RUN_FINISHED],
    test: ({ event, run }) => event.type === EVENT_TYPES.RUN_FINISHED && (run?.ledger?.propsInspected?.length || 0) >= 8,
  },
  {
    // The figure in the get-in dream walks up the beam. Torch on when it gets
    // there and the drill opens with it; torch off and it goes straight through.
    // See game/dream-figure.js.
    id: 'ACH_LIGHT_OFF', name: 'Whatever That Was',
    description: 'Put your light out before the figure in the dream reaches you.', category: 'method', hidden: true,
    events: [EVENT_TYPES.DREAM_RESOLVED],
    test: ({ event }) => event.payload?.outcome === 'spared',
  },
  {
    id: 'ACH_RELEASE_RECORD', name: 'Release Record',
    description: 'Open the release record.', category: 'method', hidden: false,
    events: [EVENT_TYPES.CREDITS_VIEWED], test: () => true,
  },
  {
    id: 'ACH_ALL_PLAYBACK', name: 'Playback Log',
    description: 'Complete all three playback disclosures across your returns.', category: 'disclosures', hidden: false,
    events: [EVENT_TYPES.DISCLOSURE_HEARD],
    test: ({ profile }) => collectionDone(profile, 'disclosures'),
  },
  endingDef('sacrifice', 'The Seal'),
  {
    id: 'ACH_CENTURY_STAY', name: 'A Hundred More Years',
    description: 'Willingly become the living seal that stays the school from destruction for a century.',
    category: 'returns', hidden: true,
    events: [EVENT_TYPES.RUN_FINISHED],
    test: ({ summary }) => summary?.endingId === 'sacrifice'
      && summary?.endingVariant === ENDING_VARIANT.CENTURY_STAY,
  },
  endingDef('helped', 'He Tried to Help'),
  endingDef('inversion', 'The Other Door'),
  endingDef('drugged', 'Cold, Bitter, Gone'),
  endingDef('surfaced', 'The Other Recordist'),
  // The four that arrived with Contact and the tower. They were missed when
  // those endings landed: ACH_ALL_ENDINGS below has counted all nine since the
  // day they were added, so the collective achievement was reachable while four
  // of its parts were not. Found by tools/audits/progression.
  endingDef('contact-won', 'Open Channel'),
  endingDef('contact-lost', 'No Return'),
  endingDef('tower-won', 'Exit Through the Gift Shop'),
  endingDef('tower-lost', 'The Full Peal'),
  {
    id: 'ACH_ALL_ENDINGS', name: 'All Returns Filed',
    description: 'Complete every ending.', category: 'returns', hidden: true,
    events: [EVENT_TYPES.RUN_FINISHED],
    test: ({ profile }) => ENDING_IDS.every((id) => profile?.endingsSeen?.includes(id)),
  },
  {
    id: 'ACH_UNINJURED', name: 'No Handling Noise',
    description: 'Finish the night without an injury.', category: 'method', hidden: false,
    events: [EVENT_TYPES.RUN_FINISHED], test: ({ summary }) => summary?.injuries === 0,
  },
  {
    id: 'ACH_SECOND_TRACK', name: 'The Other Side',
    description: `Finish a run with no more than ${CAUSAL_INJURY_CEILING} injuries and unlock that run for THE HUSH.`, category: 'method', hidden: false,
    events: [EVENT_TYPES.CAUSAL_TAPE_PROMOTED], test: ({ event }) => !!event.payload?.contentHash,
  },
  {
    id: 'ACH_UNBROKEN', name: 'Unbroken',
    description: 'Complete every accepted take without spoiling one.', category: 'method', hidden: false,
    events: [EVENT_TYPES.RUN_FINISHED],
    test: ({ summary, run }) => hasManifest(run) && summary?.takes?.spoiled === 0,
  },
  {
    id: 'ACH_FIRST_PASS', name: 'Nothing There',
    description: 'Finish a run with three distinct first-attempt signal victories and no defeats.', category: 'method', hidden: false,
    events: [EVENT_TYPES.RUN_FINISHED],
    test: ({ summary, run }) => summary?.battles?.lost === 0
      // The combat compatibility payload calls completed turns `attempts`.
      // Only the persistent entry receipt identifies a first attempt; aborting
      // and reopening the same encounter must not erase that history.
      && Object.values(run?.ledger?.battles?.results || {}).filter(row => row.result === 'win' && row.started === 1).length >= 3,
  },
  {
    id: 'ACH_DEAD_AIR', name: 'Dead Air',
    description: 'Complete the game on Dead Air without lowering gameplay challenge.', category: 'method', hidden: false,
    events: [EVENT_TYPES.RUN_FINISHED],
    test: ({ summary }) => summary?.rules?.startedPreset === 'dead-air'
      && summary?.integrity?.deadAir?.eligible === true,
  },
  {
    id: 'ACH_ONE_TORCH', name: 'The Whole Night on One Torch',
    description: 'Finish without restoring a building circuit.', category: 'method', hidden: false,
    events: [EVENT_TYPES.RUN_FINISHED],
    test: ({ run }) => (run?.ledger?.power?.everRestored?.length || 0) === 0,
  },
  {
    id: 'ACH_BUILDING_ALIVE', name: 'The Building, Briefly Alive',
    description: 'Restore all five distribution circuits in one run.', category: 'method', hidden: false,
    events: [EVENT_TYPES.RUN_FINISHED],
    test: ({ run }) => POWER_CIRCUIT_IDS.every((id) => run?.ledger?.power?.everRestored?.includes(id)),
  },
  {
    id: 'ACH_FIELD_NOTES', name: 'Paper Trail', description: 'Find all sixteen field papers across your returns.',
    category: 'work', hidden: false, events: [EVENT_TYPES.DOCUMENT_READ],
    test: ({ profile }) => collectionDone(profile, 'papers'),
  },
  {
    id: 'ACH_FIELD_LEADS', name: 'Loose Ends', description: 'Find the four optional field leads across your returns.',
    category: 'work', hidden: false, events: [EVENT_TYPES.ITEM_OBTAINED, EVENT_TYPES.RUN_STARTED],
    test: ({ profile }) => collectionDone(profile, 'leads'),
  },
  {
    id: 'ACH_OFF_AIR', name: 'Between Stations', description: 'Stay on channel thirteen until the hidden transmission finishes.',
    category: 'disclosures', hidden: true, events: [EVENT_TYPES.SECRET_DISCOVERED],
    test: ({ profile }) => !!profile?.completion?.secrets?.['off-air'],
  },
  {
    id: 'ACH_CALL_YOURSELF', name: 'Hold the Line', description: 'Call your own van from the roadside box, leave the receiver hanging, and finish answering the van phone.',
    category: 'disclosures', hidden: true, events: [EVENT_TYPES.SECRET_DISCOVERED],
    test: ({ profile }) => !!profile?.completion?.secrets?.['call-yourself'],
  },
  {
    id: 'ACH_HIDDEN_EXCHANGES', name: 'Private Lines', description: 'Complete both hidden exchanges across your returns.',
    category: 'disclosures', hidden: true, events: [EVENT_TYPES.SECRET_DISCOVERED],
    test: ({ profile }) => collectionDone(profile, 'secrets'),
  },
  {
    id: 'ACH_COMPLETE_ARCHIVE', name: 'Master Copy', description: 'Unlock every other achievement, including all challenge achievements.',
    category: 'method', hidden: false, events: Object.values(EVENT_TYPES),
    test: ({ profile }) => definitions.filter(def => def.id !== 'ACH_COMPLETE_ARCHIVE').every(def => !!profile?.achievements?.[def.id]),
  },
];

const collectionProgress = id => ({ profile }) => { const row = collection(profile, id); return { current: row.current, target: row.target, label: row.label, scope: 'ACROSS RUNS' }; };
const progress = {
  ACH_FIVE_ROOMS: ({ run }) => ({ current: TARGETS.filter(id => run?.ledger?.takes?.rooms?.includes(id)).length, target: TARGETS.length, label: 'Accepted manifest rooms', scope: 'SINGLE RUN' }),
  ACH_CATALOGUE: ({ run }) => ({ current: Math.min(8, new Set(run?.ledger?.propsInspected || []).size), target: 8, label: 'Distinct field objects; finish the run', scope: 'SINGLE RUN' }),
  ACH_ALL_PLAYBACK: collectionProgress('disclosures'), ACH_FIELD_NOTES: collectionProgress('papers'),
  ACH_FIELD_LEADS: collectionProgress('leads'), ACH_HIDDEN_EXCHANGES: collectionProgress('secrets'),
  ACH_ALL_ENDINGS: ({ profile }) => ({ current: ENDING_IDS.filter(id => profile?.endingsSeen?.includes(id)).length, target: ENDING_IDS.length, label: 'Different returns filed', scope: 'ACROSS RUNS' }),
  ACH_BUILDING_ALIVE: ({ run }) => ({ current: POWER_CIRCUIT_IDS.filter(id => run?.ledger?.power?.everRestored?.includes(id)).length, target: POWER_CIRCUIT_IDS.length, label: 'Distribution circuits; finish the run', scope: 'SINGLE RUN' }),
  ACH_COMPLETE_ARCHIVE: ({ profile }) => ({ current: definitions.filter(def => def.id !== 'ACH_COMPLETE_ARCHIVE' && profile?.achievements?.[def.id]).length, target: definitions.length - 1, label: 'All other achievements', scope: 'ACROSS RUNS' }),
};
const hints = {
  ACH_HUSH_MET: 'The building is not empty. Pay attention when it starts answering the recorder.',
  ACH_PLAYBACK: 'A completed take can contain something you did not notice while making it. Listen back.',
  ACH_NAME_SARAH: 'When you are asked to name what you brought, silence is not the only answer.',
  ACH_COFFEE: 'The man at the desk has been keeping something warm.',
  ACH_DO_NOT_DISTURB: 'Martin can worry about a check-in that you choose not to answer.',
  ACH_LIGHT_OFF: 'The dream figure approaches along the beam of your torch.',
  ACH_END_SACRIFICE: 'Consider the chapel’s proposal, and who would remain behind.',
  ACH_CENTURY_STAY: 'Choosing to remain is different from being kept there by defeat.',
  ACH_END_HELPED: 'Coffee can change what happens if you stay at the final agreement.',
  ACH_END_INVERSION: 'Carry the broken rig through the end. It can still be used as an instrument.',
  ACH_END_DRUGGED: 'What you accepted at the desk may matter when you try to leave.',
  ACH_END_SURFACED: 'The broken rig may carry another recordist’s signal as well as your own.',
  'ACH_END_CONTACT-WON': 'The confrontation at the Source fault has two separately filed outcomes.',
  'ACH_END_CONTACT-LOST': 'The confrontation at the Source fault has two separately filed outcomes.',
  'ACH_END_TOWER-WON': 'The eyes and the Horizon bust can change your way out. The bells have two outcomes.',
  'ACH_END_TOWER-LOST': 'The eyes and the Horizon bust can change your way out. The bells have two outcomes.',
  ACH_ALL_ENDINGS: 'Final agreements, escape choices and confrontation outcomes leave different returns. Filed runs offer leads for the next night.',
  ACH_OFF_AIR: 'The portable set has more than twelve channels. A quiet carrier can be worth waiting for.',
  ACH_CALL_YOURSELF: 'The roadside directory is not the only place with a telephone number. Check your own van.',
  ACH_HIDDEN_EXCHANGES: 'One exchange travels by portable radio. Another travels between two telephones.',
  ACH_FIELD_LEADS: 'Look beyond the job: garden, gallery, tower, and the seat above the city.',
  ACH_ALL_PLAYBACK: 'Listen back after the pool, hall and practice-wing recordings.',
};
export const ACHIEVEMENT_DEFS = Object.freeze(definitions.map(def => Object.freeze({
  ...def, icon: def.id, hint: hints[def.id] || (def.hidden ? 'This entry concerns a discovery or a different return. Reveal its requirement only if you want the spoiler.' : def.description),
  scope: ['ACH_ALL_ENDINGS', 'ACH_ALL_PLAYBACK', 'ACH_FIELD_NOTES', 'ACH_FIELD_LEADS', 'ACH_HIDDEN_EXCHANGES', 'ACH_COMPLETE_ARCHIVE'].includes(def.id) ? 'ACROSS RUNS' : 'SINGLE RUN',
  ...(progress[def.id] ? { progress: progress[def.id] } : {}),
})));

export const ACHIEVEMENT_BY_ID = Object.freeze(
  Object.assign(Object.create(null), Object.fromEntries(ACHIEVEMENT_DEFS.map((def) => [def.id, def]))),
);

export const ACHIEVEMENTS_BY_EVENT = (() => {
  const map = new Map();
  for (const def of ACHIEVEMENT_DEFS) {
    for (const type of def.events) {
      const list = map.get(type) || [];
      list.push(def);
      map.set(type, list);
    }
  }
  return map;
})();
