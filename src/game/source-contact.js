import { authoringDocumentsById } from '../narrative/generated-content.js';

export const SOURCE_CONTACT_INSIGHTS = Object.freeze([
  'music-human-name',
  'surfer-vessel',
  'borrowed-body-return',
]);

const CONTACT_DOCUMENT_ID = 'source-space.contact';
const unique = (values) => [...new Set((Array.isArray(values) ? values : [])
  .filter((value) => typeof value === 'string' && value))];

export function freshSourceContactState() {
  return { schema: 1, captures: 0, insights: [], seenBeats: [], lastChoiceId: null };
}

export function normalizeSourceContactState(value = null) {
  const base = freshSourceContactState();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return base;
  return {
    schema: 1,
    captures: Math.max(0, Math.floor(Number(value.captures) || 0)),
    insights: unique(value.insights).filter((id) => SOURCE_CONTACT_INSIGHTS.includes(id)),
    seenBeats: unique(value.seenBeats),
    lastChoiceId: typeof value.lastChoiceId === 'string' && value.lastChoiceId ? value.lastChoiceId : null,
  };
}

export function sourceBossExposed(value = null) {
  const state = normalizeSourceContactState(value);
  return SOURCE_CONTACT_INSIGHTS.every((id) => state.insights.includes(id));
}

function contactDocument() {
  const document = authoringDocumentsById.get(CONTACT_DOCUMENT_ID);
  if (!document?.nodes) throw new Error(`missing authored Source contact document ${CONTACT_DOCUMENT_ID}`);
  return document;
}

function candidatesForInsight(document, insightId) {
  return Object.values(document.nodes).filter((node) => node?.insightId === insightId);
}

export function nextSourceContact(value = null, { seed = 4417 } = {}) {
  const state = normalizeSourceContactState(value);
  const document = contactDocument();
  const unresolved = SOURCE_CONTACT_INSIGHTS.filter((id) => !state.insights.includes(id));
  const insightId = unresolved[0] || null;
  let candidates = insightId ? candidatesForInsight(document, insightId) : [document.nodes['residue-1']];
  const unseen = candidates.filter((node) => !state.seenBeats.includes(node.id));
  if (unseen.length) candidates = unseen;
  const index = Math.abs((Number(seed) || 4417) + state.captures * 17 + state.seenBeats.length * 7) % candidates.length;
  const node = candidates[index] || candidates[0];
  const choices = (node?.choices || []).map((choice) => ({
    id: String(choice.id || ''),
    text: String(choice.text || ''),
    aligns: choice.aligns === true,
  })).filter((choice) => choice.id && choice.text);
  return {
    id: node.id,
    insightId,
    speaker: node.speaker || 'SOURCE / UNATTRIBUTED',
    lines: (node.lines || []).map((line) => ({
      id: line.id,
      who: line.who,
      signalRole: line.signalRole,
      text: String(line.text || ''),
    })),
    choices,
  };
}

export function resolveSourceContact(value, encounter, choiceId) {
  const state = normalizeSourceContactState(value);
  const choice = encounter?.choices?.find((entry) => entry.id === choiceId) || null;
  const insight = choice?.aligns && SOURCE_CONTACT_INSIGHTS.includes(encounter?.insightId)
    ? encounter.insightId : null;
  return normalizeSourceContactState({
    ...state,
    captures: state.captures + 1,
    insights: insight ? [...state.insights, insight] : state.insights,
    seenBeats: encounter?.id ? [...state.seenBeats, encounter.id] : state.seenBeats,
    lastChoiceId: choice?.id || null,
  });
}
