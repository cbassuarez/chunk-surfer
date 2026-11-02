// The finite V1 collection catalogue. Ambient dressing, repeatable dialogue and
// generated paper never enlarge these denominators. Tests compare these IDs to
// their actual production owners.
export const COMPLETION_CATALOG_VERSION = 1;
export const COMPLETION_ROOMS = Object.freeze([
  { id: 'main_b3', label: 'Studio B3' },
  { id: 'the_tub', label: 'Natatorium' },
  { id: 'amplifications', label: 'Concert hall' },
  { id: 'soundnoisemusic', label: 'Practice wing' },
  { id: 'lux_nova', label: 'Chapel' },
].map(Object.freeze));
export const COMPLETION_PAPERS = Object.freeze([
  'north-gallery-service-word', 'foh-overflow-note', 'pre-roll-analysis',
  'faculty-reference-requirement', 'student-monitoring-notes', 'work-order-carbon',
  ...Array.from({ length: 10 }, (_, index) => `page-${index + 1}`),
]);
export const COMPLETION_DISCLOSURES = Object.freeze(['the_tub', 'amplifications', 'soundnoisemusic']);
export const COMPLETION_LEADS = Object.freeze([
  { id: 'pin.academic', label: 'Atrium lead' },
  { id: 'pin.gallery', label: 'Gallery lead' },
  { id: 'pin.tower', label: 'Tower lead' },
  { id: 'pin.yard', label: 'City-seat lead' },
].map(Object.freeze));
export const SECRET_DEFS = Object.freeze([
  Object.freeze({ id: 'off-air', name: 'Off Air',
    description: 'Hear the transmission on the radio’s unused channel.',
    hint: 'The front desk does not use every channel.',
    solution: 'During a quiet live radio conversation, tune to channel 13 with the radio volume up and hear the entire transmission.',
    owner: 'main.presentRadio / radio-contact-audio.onComplete' }),
  Object.freeze({ id: 'call-yourself', name: 'Nobody in the Van',
    description: 'Call the van from the payphone and answer its car phone.',
    hint: 'The number on the dashboard still reaches somewhere.',
    solution: 'On an early roadside pass, dial the van’s number, leave the kiosk handset hanging while it rings, then walk to the van and finish the car-phone exchange.',
    owner: 'main.payphoneAnswerVan.onDone' }),
]);
export const SECRET_BY_ID = Object.freeze(Object.fromEntries(SECRET_DEFS.map(def => [def.id, def])));
export const COMPLETION_COLLECTIONS = Object.freeze([
  Object.freeze({ id: 'rooms', label: 'Recording manifest', total: COMPLETION_ROOMS.length }),
  Object.freeze({ id: 'papers', label: 'Field papers', total: COMPLETION_PAPERS.length }),
  Object.freeze({ id: 'disclosures', label: 'Playback discoveries', total: COMPLETION_DISCLOSURES.length }),
  Object.freeze({ id: 'leads', label: 'Field patch leads', total: COMPLETION_LEADS.length }),
  Object.freeze({ id: 'secrets', label: 'Easter eggs', total: SECRET_DEFS.length }),
]);
