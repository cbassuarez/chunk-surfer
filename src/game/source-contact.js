import { authoringDocumentsById } from '../narrative/generated-content.js';
import { evaluateCondition } from '../narrative/conditions.js';

// Save compatibility only. These were once three required answers. Reading
// them may still change old saves' scenery, but never gates meeting or combat.
export const SOURCE_CONTACT_INSIGHTS = Object.freeze([
  'music-human-name',
  'surfer-vessel',
  'borrowed-body-return',
]);
export const SOURCE_CONTACT_ACTION = Object.freeze({
  QUESTION: 'question', WARN: 'warn', RETURN: 'return', AWAY: 'away', COMBAT: 'combat',
});
export const SOURCE_CONTACT_CANCEL_CHOICE = 'contact.leave';
// Compatibility export only. Conversation history changes what can be said;
// it never grants permission to fight or to leave the Source field.
export const SOURCE_CONTACT_TALKS_REQUIRED = 0;
// The recordist's own faculties, which speak around a thing that will not.
// `you` (thinking) and `me` (out loud) are the recordist; these are the rest.
export const SOURCE_CONTACT_VOICES = Object.freeze(['meter', 'tape', 'hands', 'ears']);
// What a talk can leave you knowing for the fight. Small on purpose — see
// SOURCE_TELLS in combat-definitions.js. Never a way past it, never a gate.
export const SOURCE_CONTACT_TELLS = Object.freeze(['outline', 'meter', 'stance', 'ears']);
const CONTACT_DOCUMENT_ID = 'source-space.contact';
const LEAD_BRANCHES = Object.freeze(['nerve', 'recorder', 'torch', 'fork', 'rig']);
// story-evidence.js tags, under names a condition can spell.
const EVIDENCE_KEYS = Object.freeze([
  ['reference-pressure', 'reference'], ['student-performance', 'student_performance'],
  ['pre-roll-causality', 'pre_roll'], ['contract-inheritance', 'contract'], ['borrowed-body', 'borrowed_body'],
]);
// What the dock told you about the case of the recordist before you.
const CLUES = Object.freeze(['tallies', 'voice', 'chandelier']);
const BEAT = /^[A-Za-z_]\w*$/;
const unique = (values) => [...new Set((Array.isArray(values) ? values : [])
  .filter((value) => typeof value === 'string' && value))];
const whole = (value) => Math.max(0, Math.floor(Number(value) || 0));

export function freshSourceContactState() {
  return {
    schema: 2, captures: 0, talks: 0, radioCalls: 0, lastTalk: null, insights: [], seenBeats: [], lastChoiceId: null,
    met: false, questions: [], beats: [], tells: [], warningSeen: false, combatCommitted: false,
  };
}

export function normalizeSourceContactState(value = null) {
  const base = freshSourceContactState();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return base;
  const captures = whole(value.captures);
  return {
    ...base,
    captures,
    // Saves from before the counter: every capture was a finished conversation.
    talks: value.talks == null ? captures : whole(value.talks),
    radioCalls: whole(value.radioCalls),
    lastTalk: ['lift', 'radio'].includes(value.lastTalk) ? value.lastTalk : null,
    insights: unique(value.insights).filter((id) => SOURCE_CONTACT_INSIGHTS.includes(id)),
    seenBeats: unique(value.seenBeats),
    lastChoiceId: typeof value.lastChoiceId === 'string' && value.lastChoiceId ? value.lastChoiceId : null,
    met: value.met === true || captures > 0,
    questions: unique(value.questions).filter((id) => ['identity', 'following', 'way-through'].includes(id)),
    // What you have done or asked at the court, across every talk. One-shot
    // checks read it; so do the lines that remember an earlier talk.
    beats: unique(value.beats).filter((beat) => BEAT.test(beat)).slice(-64),
    tells: unique(value.tells).filter((id) => SOURCE_CONTACT_TELLS.includes(id)),
    warningSeen: value.warningSeen === true,
    combatCommitted: value.combatCommitted === true,
  };
}

// Historical API: "exposed" now means there is NO knowledge gate. Route,
// distance, and an explicit warned commitment are the runtime's responsibility.
export function sourceBossExposed() { return true; }

// Historical API retained for the radio and diagnostics. The warning is
// available at the first meeting; only its explicit confirmation commits.
export function sourceContactTalksReady() { return true; }

// A radio call records a talk. It never meets the trace, arms or commits anything.
export function recordSourceRadioTalk(value = null) {
  const state = normalizeSourceContactState(value);
  if (state.combatCommitted) return state;
  return normalizeSourceContactState({ ...state, talks: state.talks + 1, radioCalls: state.radioCalls + 1, lastTalk: 'radio' });
}

// WHAT THE RECORDIST BRINGS TO THE COURT. Numbers the night already keeps,
// read once when a talk opens; nothing here is asked of the player. `leads` is
// patch leads per recorder branch, the game's answer to a skill sheet;
// `evidence` is story-evidence tags from the run ledger; `clues` is the dock.
export function sourceHushContext({ leads = {}, composure = null, ceiling = null, takes = 0, rig = false, evidence = [], clues = {} } = {}) {
  const tags = Array.isArray(evidence) ? evidence : [];
  const ratio = Number(ceiling) > 0 && Number.isFinite(Number(composure))
    ? Math.max(0, Math.min(1, Number(composure) / Number(ceiling)))
    : 1;
  return {
    lead: Object.fromEntries(LEAD_BRANCHES.map((branch) => [branch, whole(leads?.[branch])])),
    composure: Math.round(ratio * 100) / 100,
    takes: whole(takes),
    rig: rig === true,
    evidence: Object.fromEntries(EVIDENCE_KEYS.map(([tag, key]) => [key, tags.includes(tag)])),
    clue: Object.fromEntries(CLUES.map((clue) => [clue, clues?.[clue] === true])),
  };
}

// The vocabulary an authored `when` or check `pass` may use:
//   talk (this talk, from 1), radio (calls made), lastTalk (lift|radio|none),
//   ready (the warning is offered), composure (0..1), takes, rig,
//   lead.<nerve|recorder|torch|fork|rig>,
//   evidence.<reference|student_performance|pre_roll|contract|borrowed_body>,
//   clue.<tallies|voice|chandelier>, now.<beat> (this talk),
//   ever.<beat> (any talk, this one included), tell.<id>.
function conditionContext(state, facts, now) {
  const flags = (list) => Object.fromEntries(list.map((id) => [id, true]));
  return {
    ...facts,
    talk: state.talks + 1,
    radio: state.radioCalls,
    lastTalk: state.lastTalk || 'none',
    ready: sourceContactTalksReady(state),
    now: flags([...now]),
    ever: flags([...state.beats, ...now]),
    tell: flags(state.tells),
  };
}

function contactDocument() {
  const document = authoringDocumentsById.get(CONTACT_DOCUMENT_ID);
  if (!document?.nodes) throw new Error('missing authored Source contact document ' + CONTACT_DOCUMENT_ID);
  return document;
}

export function sourceContactDialogue(value = null, { context = null, live = null } = {}) {
  const state = normalizeSourceContactState(value);
  const facts = context?.lead ? context : sourceHushContext(context || {});
  const now = live?.now instanceof Set ? live.now : new Set();
  const read = () => conditionContext(state, facts, now);
  // The presenter (conversation.js) filters on `if`; a function there is read
  // against this talk's context instead of the save's story flags.
  const gated = (item) => {
    const copy = { ...item };
    if (item.when) copy.if = () => evaluateCondition(item.when, read());
    return copy;
  };
  const choice = (authored) => {
    const copy = gated(authored);
    const check = authored.check;
    if (!check) return copy;
    // A check you get one try at, ever: gone once tried, pass or fail.
    if (check.once && authored.beat) {
      const shown = copy.if;
      copy.if = () => !read().ever[authored.beat] && (!shown || shown());
    }
    copy.tag = String(check.voice || '').toUpperCase() + (check.once ? ' · ONCE' : '');
    // No dice. It passes or it does not on what the night has already given
    // you, and the failure is somewhere to go, not a closed door.
    Object.defineProperty(copy, 'goto', {
      enumerable: true, configurable: true,
      get: () => (evaluateCondition(check.pass, read()) ? authored.goto : check.fail),
    });
    return copy;
  };
  // The shared embodied conversation presenter consumes these authored nodes.
  // Copy mutable arrays so replay/presentation cannot edit the source document.
  return Object.fromEntries(Object.entries(contactDocument().nodes).map(([id, node]) => {
    const lines = (node.lines || []).map(gated);
    return [id, {
      ...node,
      lines,
      // Lowering the hand must not turn a later approach into a one-key fight.
      ...(id === 'warning' ? { revisitLines: lines.map((line) => ({ ...line })) } : {}),
      ...(node.choices ? { choices: node.choices.map(choice) } : {}),
    }];
  }));
}

export function nextSourceContact(value = null, { context = null } = {}) {
  const state = normalizeSourceContactState(value);
  const facts = context?.lead ? context : sourceHushContext(context || {});
  const live = { now: new Set() };
  const nodes = sourceContactDialogue(state, { context: facts, live });
  const startAt = state.met ? 'return' : 'approach';
  const node = nodes[startAt];
  return {
    id: startAt,
    startAt,
    speaker: node.speaker,
    lines: node.lines,
    // Compatibility for callers that inspect the entry menu. The scene itself
    // follows the node graph, including the separate warning confirmation.
    choices: nodes.ask.choices,
    nodes,
    context: facts,
    // The presenter calls this as a choice is taken, so `now.*` is true for the
    // rest of the talk before the runtime has saved anything.
    markChoice(choiceId) {
      const chosen = sourceContactChoice({ nodes }, choiceId);
      if (chosen?.beat && BEAT.test(chosen.beat)) live.now.add(chosen.beat);
    },
  };
}

export function sourceContactChoice(encounter, choiceId) {
  if (!encounter?.nodes || typeof choiceId !== 'string') return null;
  for (const node of Object.values(encounter.nodes)) {
    const choice = node.choices?.find((entry) => entry.id === choiceId);
    if (choice) return { ...choice, nodeId: node.id };
  }
  return null;
}

// Did a check pass? A check routes to its fail node when it did not.
export function sourceContactCheckPassed(choice) {
  return !choice?.check || choice.goto !== choice.check.fail;
}

export function resolveSourceContact(value, encounter, choiceId) {
  const state = normalizeSourceContactState(value);
  const choice = sourceContactChoice(encounter, choiceId);
  if (!choice || state.combatCommitted) return state;
  // Do not turn an isolated confirm ID (or a stale legacy answer) into consent.
  // The caller records every node choice, so only opening this warning arms it.
  if (choice.requiresWarning && (state.lastChoiceId !== 'contact.warning' || !state.warningSeen)) return state;
  const terminal = choice.terminal === true;
  const tell = choice.check ? (sourceContactCheckPassed(choice) ? choice.check.tell : null) : choice.tell;
  return normalizeSourceContactState({
    ...state,
    met: true,
    captures: state.captures + (terminal ? 1 : 0),
    talks: state.talks + (terminal ? 1 : 0),
    lastTalk: terminal ? 'lift' : state.lastTalk,
    questions: choice.questionId ? [...state.questions, choice.questionId] : state.questions,
    beats: choice.beat ? [...state.beats, choice.beat] : state.beats,
    tells: tell ? [...state.tells, tell] : state.tells,
    seenBeats: [...state.seenBeats, encounter.id, choice.nodeId],
    lastChoiceId: choice.id,
    warningSeen: state.warningSeen || choice.sourceContactAction === SOURCE_CONTACT_ACTION.WARN,
    combatCommitted: choice.sourceContactAction === SOURCE_CONTACT_ACTION.COMBAT,
  });
}
