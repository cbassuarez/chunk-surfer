import { ENDING_IDS } from './schema.js';
import { EVENT_TYPES } from './events.js';

const endingDef = (id, name) => ({
  id: `ACH_END_${id.toUpperCase()}`,
  name,
  description: 'File this return.',
  category: 'returns',
  hidden: true,
  events: [EVENT_TYPES.ENDING_COMMITTED],
  test: ({ event }) => event.payload?.endingId === id,
});

export const ACHIEVEMENT_DEFS = Object.freeze([
  {
    id: 'ACH_WORK_ORDER', name: '4417-C',
    description: 'Read the complete work order.', category: 'work', hidden: false,
    events: [EVENT_TYPES.DOCUMENT_READ],
    test: ({ event }) => event.payload?.id === 'work-order',
  },
  {
    id: 'ACH_FIRST_TAKE', name: 'A Clean Minute',
    description: 'Deliver your first accepted room tone.', category: 'work', hidden: false,
    events: [EVENT_TYPES.TAKE_COMPLETED], test: () => true,
  },
  {
    id: 'ACH_HUSH_MET', name: 'It Is Still Here',
    description: 'Encounter the HUSH.', category: 'disclosures', hidden: true,
    events: [EVENT_TYPES.HUSH_MET], test: () => true,
  },
  {
    id: 'ACH_PLAYBACK', name: 'Contains What You Did Not Hear',
    description: 'Find something in playback that was not in the room.', category: 'disclosures', hidden: true,
    events: [EVENT_TYPES.PLAYBACK_DISCOVERED], test: () => true,
  },
  {
    id: 'ACH_CHAPEL_KEY', name: 'C-17',
    description: 'Retrieve the chapel key.', category: 'work', hidden: false,
    events: [EVENT_TYPES.ITEM_OBTAINED], test: ({ event }) => event.payload?.id === 'chapel_key',
  },
  {
    id: 'ACH_FIVE_ROOMS', name: 'Five Rooms',
    description: 'Complete the recording manifest.', category: 'work', hidden: false,
    events: [EVENT_TYPES.TAKE_COMPLETED],
    test: ({ run }) => new Set(run?.ledger?.takes?.rooms || []).size >= 5,
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
    id: 'ACH_CATALOGUE', name: 'Serviceable',
    description: 'Inspect every field-relevant object in one run.', category: 'method', hidden: false,
    events: [EVENT_TYPES.PROP_INSPECTED, EVENT_TYPES.RUN_FINISHED],
    test: ({ event, run }) => event.type === EVENT_TYPES.RUN_FINISHED && (run?.ledger?.propsInspected?.length || 0) >= 8,
  },
  {
    id: 'ACH_ALL_PLAYBACK', name: 'Playback Log',
    description: 'Hear every available recorded disclosure.', category: 'disclosures', hidden: false,
    events: [EVENT_TYPES.PLAYBACK_DISCOVERED],
    test: ({ run }) => ['the_tub', 'amplifications', 'soundnoisemusic']
      .every((id) => run?.ledger?.disclosures?.includes(id)),
  },
  endingDef('sacrifice', 'The Seal'),
  endingDef('helped', 'He Tried to Help'),
  endingDef('inversion', 'The Other Door'),
  endingDef('drugged', 'Cold, Bitter, Gone'),
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
    id: 'ACH_UNBROKEN', name: 'Unbroken',
    description: 'Complete every accepted take without spoiling one.', category: 'method', hidden: false,
    events: [EVENT_TYPES.RUN_FINISHED],
    test: ({ summary }) => summary?.takes?.completed >= 5 && summary?.takes?.spoiled === 0,
  },
  {
    id: 'ACH_FIRST_PASS', name: 'Nothing There',
    description: 'Clear every redaction encounter without losing one.', category: 'method', hidden: false,
    events: [EVENT_TYPES.RUN_FINISHED],
    test: ({ summary }) => summary?.battles?.started >= 3
      && summary?.battles?.lost === 0
      && summary?.battles?.firstPassWon >= summary?.battles?.started,
  },
  {
    id: 'ACH_DEAD_AIR', name: 'Dead Air',
    description: 'Complete the game on Dead Air without lowering gameplay challenge.', category: 'method', hidden: false,
    events: [EVENT_TYPES.RUN_FINISHED],
    test: ({ summary }) => summary?.rules?.startedPreset === 'dead-air'
      && summary?.integrity?.deadAir?.eligible === true,
  },
]);

export const ACHIEVEMENT_BY_ID = Object.freeze(
  Object.fromEntries(ACHIEVEMENT_DEFS.map((def) => [def.id, def])),
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
