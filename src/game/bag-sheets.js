// Bag-owned sheet metadata and inspection state.
//
// Important sheets opt into a small fact tree. The facts below are copied from
// the physical documents; this layer does not rewrite existing conversations or
// invent replacement character dialogue.

export const BAG_SHEET_SCHEMA = 1;

export const IMPORTANT_SHEET_DIALOGUES = Object.freeze({
  'work-order': Object.freeze({
    id: 'sheet-insight:work-order',
    title: 'WORK ORDER 4417-C',
    prompt: 'WHAT DO I NEED FROM THIS?',
    choices: Object.freeze([
      Object.freeze({ id: 'job', label: 'THE JOB', text: 'Five room tones. Sixty seconds each. Unbroken.' }),
      Object.freeze({ id: 'first-room', label: 'FIRST ROOM', text: 'Studio B3.' }),
      Object.freeze({ id: 'done', label: 'DONE', done: true }),
    ]),
  }),
  'page-6': Object.freeze({
    id: 'sheet-insight:page-6',
    title: 'LOG — 02:10 / SHEET 6',
    prompt: 'WHAT MATTERS HERE?',
    choices: Object.freeze([
      Object.freeze({ id: 'spare', label: 'THE SPARE', text: 'Front of house kept the new spare under key control. Box office cabinet, according to the rekey invoice.' }),
      Object.freeze({ id: 'tag', label: 'THE TAG', text: 'The tag is in their ledger, not on this sheet.' }),
      Object.freeze({ id: 'way-in', label: 'THE WAY IN', text: 'The box office staff door should still answer to the building master key, if the lock has not swollen.' }),
      Object.freeze({ id: 'done', label: 'DONE', done: true }),
    ]),
  }),
});

export function sheetDialogueFor(documentId) {
  return IMPORTANT_SHEET_DIALOGUES[String(documentId || '')] || null;
}

export function freshBagSheetState() {
  return { schema: BAG_SHEET_SCHEMA, inspected: [] };
}

export function normalizeBagSheetState(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const inspected = [...new Set((Array.isArray(source.inspected) ? source.inspected : [])
    .filter((id) => typeof id === 'string' && IMPORTANT_SHEET_DIALOGUES[id]))];
  return { schema: BAG_SHEET_SCHEMA, inspected };
}

export function sheetInsightComplete(value, documentId) {
  return normalizeBagSheetState(value).inspected.includes(String(documentId || ''));
}

export function completeSheetInsight(value, documentId) {
  const state = normalizeBagSheetState(value);
  const id = String(documentId || '');
  if (!IMPORTANT_SHEET_DIALOGUES[id] || state.inspected.includes(id)) return state;
  return { ...state, inspected: [...state.inspected, id] };
}
