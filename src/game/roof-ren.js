// Ren's roof encounter is a saved conversation, not a hidden favour counter.
// World code owns props, inventory, presentation and the ending. This reducer
// owns what the player actually agreed to and which confidences Ren will share.
import { buildRoofRenDialogue, buildRoofRenOfficeDialogue, buildRoofRenEvidenceDialogue } from '../data/roof-ren-dialogue.js';

export const ROOF_REN_SCHEMA = 3;
export const ROOF_REN_REWARD = 'ren-service-key';
export const ROOF_REN_ENDING_VARIANT = 'century-stay';
export const ROOF_REN_OFFICE_PROPS = Object.freeze({
  INDEX: 'academic-roof-effects-index',
  TRACE: 'academic-roof-pressure-pad',
  CABINET: 'academic-stripped-office-cabinet',
  CASSETTE: 'academic-roof-home-cassette',
});
export const ROOF_REN_EVIDENCE_PROPS = Object.freeze({
  CONTRARY: 'academic-roof-contrary-account',
  GUARANTOR: 'academic-roof-guarantor-trace',
});

const STAGES = new Set(['new', 'offered', 'accepted', 'carrying', 'returned', 'withheld', 'refused']);
const HISTORY = Object.freeze([
  'askedWant', 'askedWarning', 'concern', 'boundary', 'spirits', 'city',
  'uncertainty', 'dissent', 'motives', 'previous', 'terms', 'cost', 'freedom',
]);
// These two missed confidences are explicit choices in the conversation. Merely
// leaving a conversation never commits either one.
const LOCKS = Object.freeze([
  'deception', 'cruelty', 'transaction', 'warningDismissed',
  'dissentDismissed', 'accountabilityDodged', 'sealRefused',
]);
const boolMap = (keys, value) => Object.fromEntries(keys.map(key => [key, value?.[key] === true]));

export function freshRoofRenState() {
  return {
    schema: ROOF_REN_SCHEMA, stage: 'new', met: false,
    indexRead: false, traceRead: false, cabinetOpened: false, envelopeRead: false,
    contraryAccountHeard: false, guarantorTraceRead: false,
    warningRespected: false, warningDiscussed: false,
    releaseSigned: false, tapeListened: false, tapeHonesty: null,
    rewardGranted: false, history: boolMap(HISTORY), locks: boolMap(LOCKS),
    sealOffered: false, sealConsented: false, ritualComplete: false,
  };
}

export function normalizeRoofRenState(value) {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const base = freshRoofRenState();
  const stage = STAGES.has(v.stage) ? v.stage : 'new';
  const history = boolMap(HISTORY, v.history);
  // The first version recorded several confidences when the player asked a
  // question, before Ren answered. Replay an unfinished conversation from its
  // personal beginning so a migrated save cannot skip the new answers. The
  // completed first errand, its key and any already-given seal consent remain.
  const replayConversation = Number(v.schema || 0) < ROOF_REN_SCHEMA
    && stage === 'returned' && v.sealConsented !== true && v.ritualComplete !== true;
  if (replayConversation) {
    for (const key of HISTORY.slice(2)) history[key] = false;
  }
  const warningRespected = v.warningRespected === true && stage === 'accepted'
    && v.indexRead === true && v.traceRead === true
    && v.cabinetOpened === true && v.envelopeRead === true;
  return {
    ...base, stage, met: v.met === true || stage !== 'new',
    indexRead: v.indexRead === true, traceRead: v.traceRead === true,
    cabinetOpened: v.cabinetOpened === true, envelopeRead: v.envelopeRead === true,
    contraryAccountHeard: v.contraryAccountHeard === true,
    guarantorTraceRead: v.guarantorTraceRead === true,
    warningRespected,
    warningDiscussed: v.warningDiscussed === true && warningRespected,
    releaseSigned: v.releaseSigned === true, tapeListened: v.tapeListened === true,
    tapeHonesty: ['respected', 'admitted', 'lied'].includes(v.tapeHonesty) ? v.tapeHonesty : null,
    rewardGranted: v.rewardGranted === true,
    history, locks: boolMap(LOCKS, v.locks),
    sealOffered: !replayConversation && v.sealOffered === true,
    sealConsented: v.sealConsented === true,
    ritualComplete: v.sealConsented === true && v.ritualComplete === true,
  };
}

export function roofRenChecks(value, context = {}) {
  const s = normalizeRoofRenState(value);
  const noticeRead = context.noticeRead === true || context.demolitionNoticeRead === true;
  const acceptedTakes = Math.max(0, Number(context.acceptedTakes) || 0);
  // The first accepted take admits the player to the roof. Ren asks them to
  // listen again inside before treating their account as a witness.
  const heardSpirits = acceptedTakes >= 2;
  const trustIntact = !s.locks.deception && !s.locks.cruelty && !s.locks.transaction
    && !s.locks.warningDismissed && !s.locks.dissentDismissed && !s.locks.accountabilityDodged;
  const personalWork = s.stage === 'returned' && s.rewardGranted
    && ['respected', 'admitted'].includes(s.tapeHonesty);
  const evidenceReady = s.contraryAccountHeard && s.guarantorTraceRead;
  const understood = ['concern', 'boundary', 'spirits', 'city', 'uncertainty', 'dissent', 'motives', 'previous']
    .every(key => s.history[key]);
  const disclosed = understood && ['terms', 'cost', 'freedom'].every(key => s.history[key]);
  return {
    noticeRead, heardSpirits, acceptedTakes, trustIntact, personalWork, evidenceReady,
    contraryAccountHeard: s.contraryAccountHeard, guarantorTraceRead: s.guarantorTraceRead,
    eligible: personalWork && trustIntact && noticeRead && heardSpirits && evidenceReady && !s.locks.sealRefused,
    offerReady: personalWork && trustIntact && noticeRead && heardSpirits && evidenceReady && understood && !s.locks.sealRefused,
    consentReady: personalWork && trustIntact && noticeRead && heardSpirits && evidenceReady && disclosed && s.sealOffered && !s.locks.sealRefused,
  };
}

// Actions can be persisted as their string id or carried directly on a choice.
// No action trusts a UI branch to have enforced its prerequisites for it.
export function reduceRoofRen(value, rawAction, context = {}) {
  const s = normalizeRoofRenState(value);
  const action = typeof rawAction === 'string' ? rawAction : rawAction?.type || rawAction?.roofRenAction;
  const effects = [];
  const changed = () => ({ state: s, effects });
  if (s.ritualComplete) return changed();
  switch (action) {
    case 'meet': s.met = true; if (s.stage === 'new') s.stage = 'offered'; break;
    case 'ask-want': s.history.askedWant = true; break;
    case 'ask-warning': s.history.askedWarning = true; break;
    case 'accept-memory':
      if (['offered', 'refused'].includes(s.stage) && s.history.askedWarning) { s.met = true; s.stage = 'accepted'; }
      break;
    case 'refuse-memory':
      if (['new', 'offered'].includes(s.stage)) { s.met = true; s.stage = 'refused'; }
      break;
    case 'office-index': if (s.stage === 'accepted') s.indexRead = true; break;
    case 'office-trace': if (s.stage === 'accepted' && s.indexRead) s.traceRead = true; break;
    case 'office-cabinet': if (s.stage === 'accepted' && s.indexRead && s.traceRead) s.cabinetOpened = true; break;
    case 'office-envelope': if (s.stage === 'accepted' && s.cabinetOpened) s.envelopeRead = true; break;
    case 'office-leave-warning':
      if (s.stage === 'accepted' && s.indexRead && s.traceRead && s.cabinetOpened && s.envelopeRead) {
        s.warningRespected = true;
      }
      break;
    case 'tell-left-warning':
      if (s.stage === 'accepted' && s.warningRespected) s.warningDiscussed = true;
      break;
    case 'office-take':
      if (s.stage === 'accepted' && s.indexRead && s.traceRead && s.cabinetOpened && s.envelopeRead) {
        s.releaseSigned = true; s.warningRespected = false; s.warningDiscussed = false; s.stage = 'carrying';
        effects.push({ type: 'take-memory', itemId: 'ren-home-cassette' });
      }
      break;
    case 'evidence-contrary': s.contraryAccountHeard = true; break;
    case 'evidence-guarantor': s.guarantorTraceRead = true; break;
    case 'listen-memory': if (s.stage === 'carrying') s.tapeListened = true; break;
    case 'withhold-memory': if (s.stage === 'carrying') s.stage = 'withheld'; break;
    case 'reconsider-memory': if (s.stage === 'withheld') s.stage = 'carrying'; break;
    case 'return-memory':
    case 'admit-listening':
    case 'lie-listening':
      if (s.stage !== 'carrying') break;
      // A listened cassette needs an explicit honest admission. The apparently
      // identical "I kept it sealed" choice is a betrayal when it is a lie.
      s.tapeHonesty = action === 'admit-listening' ? 'admitted' : s.tapeListened ? 'lied' : 'respected';
      if (s.tapeHonesty === 'lied') s.locks.deception = true;
      s.stage = 'returned';
      effects.push({ type: 'return-memory', itemId: 'ren-home-cassette' });
      if (!s.rewardGranted) {
        s.rewardGranted = true;
        effects.push({ type: 'grant-reward', itemId: ROOF_REN_REWARD });
      }
      break;
    case 'concern': if (s.stage === 'returned') s.history.concern = true; break;
    // The boundary is recorded only after Ren has answered for the two signed
    // refusals. A question followed by Esc is not understanding or consent.
    case 'boundary': if (s.stage === 'returned' && s.history.concern) s.history.boundary = true; break;
    case 'warning-dismissed':
      if (s.stage === 'returned' && s.history.concern && !s.history.boundary) s.locks.warningDismissed = true;
      break;
    case 'spirits': if (s.stage === 'returned' && roofRenChecks(s, context).heardSpirits) s.history.spirits = true; break;
    case 'city': if (s.stage === 'returned' && roofRenChecks(s, context).noticeRead) s.history.city = true; break;
    case 'uncertainty': if (s.history.spirits && s.history.city) s.history.uncertainty = true; break;
    case 'dissent': if (s.history.uncertainty && s.contraryAccountHeard) s.history.dissent = true; break;
    case 'dissent-dismissed':
      if (s.stage === 'returned' && s.history.uncertainty && s.contraryAccountHeard && !s.history.dissent) s.locks.dissentDismissed = true;
      break;
    case 'motives': if (s.history.dissent) s.history.motives = true; break;
    case 'avoid-accountability':
      if (s.stage === 'returned' && s.history.dissent && !s.history.motives) s.locks.accountabilityDodged = true;
      break;
    case 'previous': if (s.history.motives && s.guarantorTraceRead) s.history.previous = true; break;
    case 'terms': if (roofRenChecks(s, context).offerReady) s.history.terms = true; break;
    case 'cost': if (s.history.terms) s.history.cost = true; break;
    case 'freedom': if (s.history.cost) s.history.freedom = true; break;
    case 'offer-seal': if (roofRenChecks(s, context).offerReady) s.sealOffered = true; break;
    case 'consent-seal':
      if (!s.sealConsented && roofRenChecks(s, context).consentReady) {
        s.sealConsented = true;
        effects.push({ type: 'start-ritual', endingId: 'sacrifice', variant: ROOF_REN_ENDING_VARIANT });
      }
      break;
    case 'complete-ritual': if (s.sealConsented) s.ritualComplete = true; break;
    case 'refuse-seal': if (s.sealOffered && !s.sealConsented) s.locks.sealRefused = true; break;
    case 'cruelty': if (s.stage === 'returned') s.locks.cruelty = true; break;
    case 'transaction': if (s.stage === 'returned') s.locks.transaction = true; break;
    default: break;
  }
  return changed();
}

export function roofRenDialogue(value, context = {}) {
  const state = normalizeRoofRenState(value);
  return buildRoofRenDialogue(state, roofRenChecks(state, context));
}

export function roofRenOfficeDialogue(value, propId, context = {}) {
  const state = normalizeRoofRenState(value);
  if (!Object.values(ROOF_REN_OFFICE_PROPS).includes(propId)) return null;
  return buildRoofRenOfficeDialogue(state, propId, context);
}

export function roofRenEvidenceDialogue(value, propId) {
  if (!Object.values(ROOF_REN_EVIDENCE_PROPS).includes(propId)) return null;
  return buildRoofRenEvidenceDialogue(normalizeRoofRenState(value), propId);
}

export function roofRenStatus(value, context = {}) {
  const s = normalizeRoofRenState(value), checks = roofRenChecks(s, context);
  if (s.ritualComplete) return { id: 'sealed', text: 'The place has another hundred years. So do you.' };
  if (s.sealConsented) return { id: 'ritual', text: 'Ren is waiting for your hand.' };
  if (s.locks.sealRefused) return { id: 'declined', text: 'Ren promised not to ask you again.' };
  if (s.stage === 'returned') {
    if (!checks.trustIntact) return { id: 'closed', text: 'Ren keeps their other question to themself.' };
    if (!s.history.concern || !s.history.boundary) return {
      id: 'conversation', text: 'Ren has the cassette. Sit with them and ask about the two refusals they signed.',
    };
    if (!checks.noticeRead) return { id: 'notice', text: 'Ren asked you to read the demolition notice before you promise anything.' };
    if (!checks.heardSpirits) return { id: 'witness', text: 'The first accepted take opened the roof. Ren asked you to make another inside before deciding what these rooms hold.' };
    if (s.history.uncertainty && !s.contraryAccountHeard) return { id: 'contrary', text: 'The cleared room off the breach holds a loose score. Someone there disagrees with Ren about another century.' };
    if (s.history.motives && !s.guarantorTraceRead) return { id: 'guarantor', text: 'A dated slip beneath the chamber piano bench records what a previous guarantor agreed to and lost.' };
    return { id: 'conversation', text: 'Ren has something difficult to ask. Stay and talk if you want to hear it.' };
  }
  if (s.stage === 'carrying') return { id: 'return', text: 'Ren is on the roof. The cassette is warm in your pocket.' };
  if (s.stage === 'withheld') return { id: 'withheld', text: 'You kept the cassette. Ren knows you found it.' };
  if (s.stage === 'accepted') {
    if (s.warningRespected) return { id: 'warning', text: s.warningDiscussed
      ? 'Ren knows you left the HOME cassette in drawer seventeen. You can leave it there, or go back and sign for it.'
      : 'You left the HOME cassette in drawer seventeen after reading Ren’s two refusals. You can tell Ren, or go back and sign for it.' };
    if (!s.indexRead) return { id: 'index', text: 'Stripped office: find the personal-effects index on the old desk.' };
    if (!s.traceRead) return { id: 'trace', text: 'The R page is missing. Its carbon intake pad was filed at the reception bank across the office.' };
    if (!s.cabinetOpened) return { id: 'cabinet', text: 'R. / 17. The cabinet drawer has been filed under a room, not a name.' };
    if (!s.envelopeRead) return { id: 'envelope', text: 'Read the release envelope before you sign for what is inside.' };
    return { id: 'release', text: 'The warning is clear. Taking the cassette is still your choice.' };
  }
  return { id: s.stage, text: 'A person is sitting beside the atrium glass. One whole side of them goes somewhere else.' };
}
