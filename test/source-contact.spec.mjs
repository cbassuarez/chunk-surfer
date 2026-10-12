import test from 'node:test';
import assert from 'node:assert/strict';
import { authoringDocumentsById } from '../src/narrative/generated-content.js';
import { validateNarrativeDocument, reachableNodeIds } from '../src/narrative/contracts.js';
import {
  SOURCE_CONTACT_INSIGHTS, SOURCE_CONTACT_CANCEL_CHOICE, SOURCE_CONTACT_TALKS_REQUIRED,
  recordSourceRadioTalk, sourceContactTalksReady,
  freshSourceContactState, nextSourceContact, normalizeSourceContactState,
  resolveSourceContact, sourceBossExposed, sourceContactChoice, sourceContactDialogue,
} from '../src/game/source-contact.js';
import { makeSourceContactScene } from '../src/game/source-contact-scene.js';
import * as scenes from '../src/game/scenes.js';

test.afterEach(() => { while (scenes.depth()) scenes.pop(); });

const talked = () => normalizeSourceContactState({ talks: SOURCE_CONTACT_TALKS_REQUIRED });

function encounterWithoutVoice(state) {
  const encounter = nextSourceContact(state);
  for (const node of Object.values(encounter.nodes)) {
    for (const line of [...node.lines, ...(node.revisitLines || [])]) line.voice = false;
  }
  return encounter;
}
function menu(scene, nodeId) {
  for (let count = 0; count < 20; count += 1) {
    const view = scene.view();
    if (view.pending?.kind === 'branch') {
      assert.equal(view.nodeId, nodeId);
      return view.pending.options;
    }
    scene.update(30);
    scene.key({ key: 'Enter' });
  }
  assert.fail('conversation did not reach ' + nodeId);
}
function choose(scene, id) {
  const options = scene.view().pending?.options || [];
  const index = options.findIndex((option) => option.id === id);
  assert.ok(index >= 0, 'missing visible choice ' + id);
  scene.key({ key: String(index + 1) });
}
function finish(scene) {
  for (let count = 0; count < 20 && scenes.top() === scene; count += 1) {
    assert.equal(scene.view().pending?.kind === 'branch', false, 'unexpected branch after terminal action');
    scene.update(30);
    scene.key({ key: 'Enter' });
  }
  assert.notEqual(scenes.top(), scene, 'finished contact must release the input lock');
}

test('authored contact is a reachable conversation, not a scored knowledge test', () => {
  const document = authoringDocumentsById.get('source-space.contact');
  assert.deepEqual(validateNarrativeDocument(document).errors, []);
  assert.equal(reachableNodeIds(document).size, Object.keys(document.nodes).length);
  assert.doesNotMatch(JSON.stringify(document), /"who":"hush"|"aligns"|"insightId"/);
  const encounter = nextSourceContact();
  assert.equal(encounter.startAt, 'approach');
  assert.match(encounter.lines[0].text, /human outline.*service court.*few paces.*way past/i, 'the opening matches the approach and speaking distance');
  assert.doesNotMatch(encounter.lines[0].text, /foot of the lift|arm's length/i);
  assert.equal(sourceBossExposed(freshSourceContactState()), true, 'no prior answers are required');
  assert.equal(SOURCE_CONTACT_TALKS_REQUIRED, 0, 'conversation count must not qualify battle');
  assert.ok(encounter.choices.some((choice) => choice.sourceContactAction === 'warn'), 'the first meeting must offer the warning');
  assert.ok(nextSourceContact(talked()).choices.some((choice) => choice.sourceContactAction === 'warn'), 'conversation history must not withhold the warning');
  assert.ok(encounter.choices.some((choice) => choice.sourceContactAction === 'away'));
  assert.ok(encounter.choices.every((choice) => choice.sourceContactAction !== 'combat'), 'a fight requires the warning branch');
  assert.match(encounter.nodes.warning.lines.map((line) => line.text).join(' '), /fight.*retreat.*die/i);
  assert.equal(encounter.nodes.warning.choices[0].sourceContactAction, 'return', 'the default selection is safe');
});

test('old answers are retained for save compatibility without granting or withholding access', () => {
  const legacy = {
    schema: 1, captures: 4,
    insights: [...SOURCE_CONTACT_INSIGHTS, 'invented'],
    seenBeats: ['body-1', 'body-1'], lastChoiceId: 'body-1.return',
  };
  const normalized = normalizeSourceContactState(legacy);
  assert.equal(normalized.schema, 2);
  assert.equal(normalized.met, true);
  assert.equal(normalized.combatCommitted, false);
  assert.deepEqual(normalized.insights, SOURCE_CONTACT_INSIGHTS);
  assert.deepEqual(normalized.seenBeats, ['body-1']);
  assert.equal(nextSourceContact(normalized).startAt, 'return');
  assert.equal(sourceBossExposed(normalized), sourceBossExposed());
  assert.deepEqual(normalizeSourceContactState(JSON.parse(JSON.stringify(normalized))), normalized);
});

test('questions can be asked in any order, never score answers or commit combat', () => {
  let state = freshSourceContactState();
  const encounter = nextSourceContact(state);
  for (const id of ['contact.way-through', 'contact.identity', 'contact.following', 'contact.identity']) {
    state = resolveSourceContact(state, encounter, id);
    assert.equal(state.combatCommitted, false);
    assert.deepEqual(state.insights, []);
  }
  assert.deepEqual(state.questions, ['way-through', 'identity', 'following']);
  assert.equal(state.captures, 0, 'questions are not repeated captures');
  state = resolveSourceContact(state, encounter, SOURCE_CONTACT_CANCEL_CHOICE);
  assert.equal(state.captures, 1);
  assert.equal(state.talks, 1, 'a finished conversation is one talk');
  assert.equal(state.met, true);
  assert.equal(nextSourceContact(state).startAt, 'return');
  assert.deepEqual(resolveSourceContact(state, encounter, 'music-1.name'), state, 'legacy correct answers do nothing');
});

test('combat requires opening the explicit warning followed by confirmation', () => {
  const initial = freshSourceContactState();
  const encounter = nextSourceContact(initial);
  assert.deepEqual(resolveSourceContact(initial, encounter, 'contact.confirm'), initial);
  const warned = resolveSourceContact(initial, encounter, 'contact.warning');
  assert.equal(warned.warningSeen, true);
  assert.equal(warned.combatCommitted, false);
  const lowered = resolveSourceContact(warned, encounter, 'contact.lower-hand');
  assert.deepEqual(resolveSourceContact(lowered, encounter, 'contact.confirm'), lowered, 'lowering the hand disarms contact');
  const warnedAgain = resolveSourceContact(lowered, encounter, 'contact.warning');
  const committed = resolveSourceContact(warnedAgain, encounter, 'contact.confirm');
  assert.equal(committed.combatCommitted, true);
  assert.equal(committed.captures, 1);
  assert.deepEqual(resolveSourceContact(committed, encounter, 'contact.leave'), committed, 'a committed fight cannot become a walk-away');
});

test('exported authored nodes are isolated from presenter mutations and warnings repeat', () => {
  const tree = sourceContactDialogue();
  tree.ask.choices[0].text = 'changed';
  tree.warning.lines[0].text = 'changed';
  const fresh = sourceContactDialogue();
  assert.notEqual(fresh.ask.choices[0].text, 'changed');
  assert.notEqual(fresh.warning.lines[0].text, 'changed');
  assert.deepEqual(fresh.warning.revisitLines, fresh.warning.lines, 'approaching twice still shows the warning');
  assert.equal(sourceContactChoice(nextSourceContact(), 'contact.confirm').nodeId, 'warning');
  assert.equal(sourceContactChoice(nextSourceContact(), 'unknown'), null);
});

test('embodied contact keeps the world and look live; Escape releases only its own scene safely', () => {
  let resolutions = 0;
  const child = { id: 'next-scene' };
  const scene = makeSourceContactScene({
    encounter: encounterWithoutVoice(),
    onResolve(id, meta) {
      resolutions += 1;
      assert.equal(id, SOURCE_CONTACT_CANCEL_CHOICE);
      assert.equal(meta.action, 'away');
      scenes.push(child);
    },
  });
  assert.equal(scene.blocksWorld, false);
  assert.equal(scene.allowsLook, true);
  assert.equal(scene.sourcePressureLive, false, 'talking must not expose the immobile player to a catch/reset');
  assert.equal(scene.view().transcriptBackground, 'rgba(2,4,5,.94)', 'Source text stays readable over the bright paper world');
  scenes.push(scene);
  menu(scene, 'ask');
  choose(scene, 'contact.identity');
  scene.key({ key: 'Escape' });
  assert.equal(scenes.top(), child);
  assert.equal(scenes.has(scene.id), false);
  scene.key({ key: 'Escape' });
  assert.equal(scenes.top(), child);
  assert.equal(resolutions, 1);
});

test('the actual conversation can ask, decline, return, and confirm contact without a quiz or stale modal', () => {
  let state = talked();
  const encounter = encounterWithoutVoice(state);
  const resolutions = [];
  const scene = makeSourceContactScene({
    encounter,
    onChoice(id) { state = resolveSourceContact(state, encounter, id); },
    onResolve(id, meta) { resolutions.push({ id, meta }); },
  });
  scenes.push(scene);
  menu(scene, 'ask');
  choose(scene, 'contact.name');
  menu(scene, 'ask');
  choose(scene, 'contact.warning');
  assert.equal(state.combatCommitted, false);
  menu(scene, 'warning');
  choose(scene, 'contact.lower-hand');
  menu(scene, 'ask');
  choose(scene, 'contact.warning');
  assert.equal(scene.view().pending, null, 'the repeated warning must be read again');
  menu(scene, 'warning');
  choose(scene, 'contact.confirm');
  assert.equal(state.combatCommitted, true);
  scene.key({ key: 'Escape' });
  assert.equal(scenes.top(), scene, 'Escape after explicit commitment does not cancel combat');
  finish(scene);
  assert.equal(resolutions.length, 1);
  assert.equal(resolutions[0].meta.action, 'combat');
  assert.equal(scenes.blocksInput(), false);
});

test('choosing walk-away after the warning closes the presenter without starting combat', () => {
  const encounter = encounterWithoutVoice(talked());
  const resolutions = [];
  const scene = makeSourceContactScene({ encounter, onResolve: (id, meta) => resolutions.push({ id, meta }) });
  scenes.push(scene);
  menu(scene, 'ask');
  choose(scene, 'contact.warning');
  menu(scene, 'warning');
  choose(scene, 'contact.leave-warning');
  finish(scene);
  assert.equal(resolutions.length, 1);
  assert.equal(resolutions[0].meta.action, 'away');
  assert.equal(resolutions[0].meta.combat, false);
});

test('conversation history changes dialogue without qualifying battle or arming its warning', () => {
  let state = freshSourceContactState();
  assert.equal(sourceContactTalksReady(state), true);
  const first = nextSourceContact(state);
  assert.ok(first.choices.some((choice) => choice.id === 'contact.warning'));
  const warned = resolveSourceContact(state, first, 'contact.warning');
  assert.equal(warned.warningSeen, true, 'the first meeting permits a warned choice');
  assert.equal(warned.talks, 0, 'the warning requires no finished conversation');
  assert.equal(warned.combatCommitted, false, 'the warning is not commitment');
  for (const id of ['contact.identity', 'contact.following', 'contact.way-through']) state = resolveSourceContact(state, first, id);
  assert.equal(state.talks, 0, 'questions inside one conversation are not separate talks');
  state = resolveSourceContact(state, first, SOURCE_CONTACT_CANCEL_CHOICE);
  assert.equal(state.talks, 1);
  state = recordSourceRadioTalk(state);
  assert.equal(state.talks, 2, 'a radio call still records conversation history');
  assert.equal(state.warningSeen, false, 'a radio call arms nothing');
  assert.equal(state.combatCommitted, false);
  assert.ok(nextSourceContact(state).choices.some((choice) => choice.id === 'contact.warning'));
  state = recordSourceRadioTalk(state);
  assert.equal(sourceContactTalksReady(state), true);
  assert.deepEqual(normalizeSourceContactState(JSON.parse(JSON.stringify(state))), state, 'talks survive a save');
  assert.equal(normalizeSourceContactState({ captures: 2 }).talks, 2, 'old saves keep their finished conversations');
});

test('the radio call is authored in the contact document, and the HUSH still never speaks', () => {
  const tree = sourceContactDialogue();
  assert.ok(tree.radio?.lines.length, 'missing the radio entry');
  assert.ok(tree.radio.lines.every((line) => ['you', 'direction'].includes(line.who)), 'the radio call gives the HUSH a voice');
  assert.equal(tree.radio.goto, 'radio-done');
});

// ── TALK ONE: VOICES, TWO MENUS, CHECKS, BODY, TELLS ────────────────────────
import { readFileSync } from 'node:fs';
import {
  SOURCE_CONTACT_TELLS, SOURCE_CONTACT_VOICES, sourceHushContext, sourceContactCheckPassed,
} from '../src/game/source-contact.js';
import { HUSH_BODY_CUES, hushPoseAt, isHushBodyCue } from '../src/render/hush-pose.js';
import { transcriptRole } from '../src/render/transcript.js';
import { inferredSignalRole } from '../src/narrative/signal-role.js';
import { validateConditionExpression } from '../src/narrative/conditions.js';
import { SOURCE_TELL_IDS, sourceCombatBattle, sourceCombatDefinition } from '../src/data/combat-definitions.js';

const contactDoc = () => authoringDocumentsById.get('source-space.contact');
const allLines = (doc) => Object.values(doc.nodes).flatMap((node) => node.lines || []);
const shown = (item) => (typeof item.if === 'function' ? item.if() : true);
const choiceIn = (encounter, id) => sourceContactChoice(encounter, id);

test('the HUSH is answered by the recordist\'s own faculties, and still never speaks', () => {
  const lines = allLines(contactDoc());
  const speakers = new Set(lines.map((line) => line.who));
  assert.deepEqual([...speakers].filter((who) => !['direction', 'you', 'me', ...SOURCE_CONTACT_VOICES].includes(who)), [], 'an unknown speaker at the lift');
  for (const voice of SOURCE_CONTACT_VOICES) {
    assert.ok(lines.filter((line) => line.who === voice).length >= 3, `${voice} barely speaks`);
    assert.equal(transcriptRole(voice).speaker, voice.toUpperCase(), `${voice} has no label on the transcript`);
    assert.equal(inferredSignalRole(voice), 'human', `${voice} is not the recordist`);
  }
  assert.ok(lines.some((line) => line.who === 'me'), 'the recordist never says anything out loud');
});

test('talk one has two menus — ask and examine — and enough in each to explore', () => {
  const doc = contactDoc();
  assert.ok(Object.keys(doc.nodes).length >= 25, 'the conversation is thin');
  assert.ok(allLines(doc).length >= 80, 'the conversation is thin');
  const ask = doc.nodes.ask.choices, examine = doc.nodes.examine.choices;
  assert.ok(ask.some((choice) => choice.goto === 'examine'), 'no way from asking to looking');
  assert.ok(examine.some((choice) => choice.goto === 'ask'), 'no way from looking back to asking');
  assert.ok(examine.filter((choice) => !['ask', 'leave'].includes(choice.goto)).length >= 5, 'too few things to do');
  assert.ok(examine.some((choice) => choice.terminal && choice.sourceContactAction === 'away'), 'examine has no way to leave');
  const checks = Object.values(doc.nodes).flatMap((node) => node.choices || []).filter((choice) => choice.check);
  assert.ok(checks.length >= 3, 'no checks');
  for (const choice of checks) {
    assert.deepEqual(validateConditionExpression(choice.check.pass), [], `${choice.id} check does not parse`);
    assert.ok(SOURCE_CONTACT_VOICES.includes(choice.check.voice), `${choice.id} is made by an unknown voice`);
  }
  for (const choice of Object.values(doc.nodes).flatMap((node) => node.choices || [])) {
    const tell = choice.check?.tell || choice.tell;
    if (tell) assert.ok(SOURCE_CONTACT_TELLS.includes(tell), `${choice.id} leaves an unknown tell`);
  }
});

test('every body cue is one the renderer knows, and a pose eases in and relaxes back', () => {
  const cues = allLines(contactDoc()).filter((line) => line.body).map((line) => line.body);
  assert.deepEqual(cues.filter((cue) => !isHushBodyCue(cue)), [], 'a line names a body cue the renderer does not have');
  assert.ok(new Set(cues).size >= 8, 'the body has too few ways to answer');
  assert.ok(contactDoc().nodes.approach.lines[0].body, 'it arrives without moving');
  assert.deepEqual(hushPoseAt(null, 0, 1), hushPoseAt('nothing', 0, 1), 'an unknown cue is not neutral');
  assert.equal(hushPoseAt('double', 0, 0).ghost, 0, 'a pose snaps in');
  assert.ok(hushPoseAt('double', 0, 1).ghost > .7, 'the second outline never shows');
  assert.equal(hushPoseAt('double', 0, HUSH_BODY_CUES.double.hold + 2).ghost, 0, 'a pose never relaxes');
  assert.ok(hushPoseAt('recoil', 0, 1).scale < 1, 'a recoil does not draw back');
  assert.equal(hushPoseAt('flicker', 0, .6, { reducedMotion: true }).flicker, 0, 'reduced motion still strobes');
});

test('checks read what the night gave you — no dice, and failing is somewhere to go', () => {
  const at = (context) => nextSourceContact(normalizeSourceContactState({ met: true, talks: 1 }), { context });
  assert.equal(choiceIn(at({ takes: 0 }), 'contact.following-offer').goto, 'following-blank');
  assert.equal(choiceIn(at({ takes: 1 }), 'contact.following-offer').goto, 'following-offer');
  assert.equal(choiceIn(at({ composure: 10, ceiling: 40 }), 'contact.stance').goto, 'stance-shaking');
  assert.equal(choiceIn(at({ composure: 30, ceiling: 40 }), 'contact.stance').goto, 'stance-held');
  assert.equal(choiceIn(at({ composure: 10, ceiling: 40, leads: { nerve: 1 } }), 'contact.stance').goto, 'stance-held', 'a nerve lead does not steady the hands');
  assert.equal(choiceIn(at({ takes: 0 }), 'contact.listen').goto, 'listen-nothing');
  assert.equal(choiceIn(at({ leads: { recorder: 2 } }), 'contact.listen').goto, 'listen-heard');
  assert.equal(choiceIn(at({}), 'contact.stance').tag, 'HANDS · ONCE');
  assert.equal(choiceIn(at({}), 'contact.following-offer').tag, 'TAPE');
  assert.deepEqual(sourceHushContext({ leads: { nerve: 2, bogus: 9 }, composure: 20, ceiling: 40, takes: 3, evidence: ['contract-inheritance', 'nonsense'], clues: { voice: true, bogus: true } }), {
    lead: { nerve: 2, recorder: 0, torch: 0, fork: 0, rig: 0 }, composure: .5, takes: 3, rig: false,
    evidence: { reference: false, student_performance: false, pre_roll: false, contract: true, borrowed_body: false },
    clue: { tallies: false, voice: true, chandelier: false },
  });
});

test('a one-shot check is gone once tried, for the rest of the talk and every talk after', () => {
  const state = normalizeSourceContactState({ met: true, talks: 1 });
  const encounter = nextSourceContact(state, { context: { composure: 5, ceiling: 40 } });
  const stance = () => encounter.nodes.examine.choices.find((choice) => choice.id === 'contact.stance');
  assert.equal(shown(stance()), true);
  const after = resolveSourceContact(state, encounter, 'contact.stance');
  encounter.markChoice('contact.stance');
  assert.equal(shown(stance()), false, 'tried, and still offered this talk');
  assert.ok(after.beats.includes('stance'));
  const later = nextSourceContact(after, { context: { composure: 40, ceiling: 40 } });
  assert.equal(shown(later.nodes.examine.choices.find((choice) => choice.id === 'contact.stance')), false, 'tried, and offered again next talk');
  assert.equal(shown(later.nodes.examine.choices.find((choice) => choice.id === 'contact.torch')), true, 'an ordinary action went away');
});

test('tells are small, remembered, and a check leaves one only when it passes', () => {
  assert.deepEqual([...SOURCE_CONTACT_TELLS].sort(), [...SOURCE_TELL_IDS].sort(), 'the conversation and the fight disagree about tells');
  let state = normalizeSourceContactState({ met: true, talks: 1 });
  const shaky = nextSourceContact(state, { context: { composure: 5, ceiling: 40 } });
  state = resolveSourceContact(state, shaky, 'contact.torch');
  assert.deepEqual(state.tells, ['outline']);
  const failed = resolveSourceContact(state, shaky, 'contact.stance');
  assert.equal(sourceContactCheckPassed(choiceIn(shaky, 'contact.stance')), false);
  assert.deepEqual(failed.tells, ['outline'], 'a failed check left a tell');
  const steady = nextSourceContact(state, { context: { composure: 40, ceiling: 40 } });
  state = resolveSourceContact(state, steady, 'contact.stance');
  assert.deepEqual(state.tells, ['outline', 'stance']);
  assert.deepEqual(normalizeSourceContactState(JSON.parse(JSON.stringify(state))), state, 'tells do not survive a save');
  assert.equal(sourceContactTalksReady(state), true, 'battle permission is independent of tells');
  assert.equal(state.combatCommitted, false, 'learning a tell does not commit combat');

  const plain = sourceCombatDefinition();
  const told = sourceCombatDefinition({ tells: ['outline', 'stance', 'nonsense', 'outline'] });
  const coherence = (combat, id) => combat.movements.find((entry) => entry.id === id).coherence;
  assert.deepEqual(told.tells, ['outline', 'stance']);
  assert.equal(coherence(told, 'borrowed-body'), coherence(plain, 'borrowed-body') - 2);
  assert.equal(coherence(told, 'call-site'), coherence(plain, 'call-site'));
  assert.equal(told.baseComposure, plain.baseComposure + 2);
  const everything = sourceCombatDefinition({ tells: SOURCE_TELL_IDS });
  const total = (combat) => combat.movements.reduce((sum, entry) => sum + entry.coherence, 0);
  assert.ok(total(plain) - total(everything) <= .1 * total(plain), 'every tell together is not small');
  assert.ok(sourceCombatBattle({ tells: ['outline'] }).intro.some((line) => line.who === 'tape'), 'the fight never mentions what you learned');
});

test('the return remembers the last talk', () => {
  const plain = nextSourceContact(normalizeSourceContactState({ met: true, talks: 1, lastTalk: 'lift' }));
  assert.deepEqual(plain.lines.filter(shown).map((line) => line.who), ['direction', 'tape'], 'an ordinary second talk says too much, or forgets it is the second');
  const remembered = nextSourceContact(normalizeSourceContactState({ met: true, talks: 1, lastTalk: 'radio', beats: ['mic'], tells: ['stance'] }));
  const said = remembered.lines.filter(shown).map((line) => line.who);
  for (const who of ['tape', 'meter', 'hands']) assert.ok(said.includes(who), `the return forgot what ${who} knows`);
});

test('the scene hands body cues to the renderer as the lines are spoken', () => {
  const cues = [];
  const scene = makeSourceContactScene({ encounter: encounterWithoutVoice(), onBody: (cue) => cues.push(cue) });
  scenes.push(scene);
  menu(scene, 'ask');
  assert.deepEqual(cues, ['still', 'lean']);
  choose(scene, 'contact.examine');
  menu(scene, 'examine');
  choose(scene, 'contact.torch');
  menu(scene, 'examine');
  assert.deepEqual(cues.slice(2), ['flicker', 'double']);
});

test('main, the runtime and the renderer are wired to the voices, the body and the tells', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const r3d = readFileSync(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
  const runtime = readFileSync(new URL('../src/game/source-space-runtime.js', import.meta.url), 'utf8');
  assert.match(main, /beginHushContact\?\.\(sourceHushContactFacts\(\)\)/, 'the talk opens without the night\'s facts');
  assert.match(main, /onBody:\(cue\)=>R3\.r3dHushPose\?\.\(cue\)/, 'body cues never reach the renderer');
  assert.match(main, /sourceCombatBattle\(\{bodyReturn:request\.bodyReturnAssist,tells:request\.tells\}\)/, 'the fight never hears the tells');
  assert.match(runtime, /tells: \[\.\.\.\(state\.sourceContacts\?\.tells \|\| \[\]\)\]/);
  const textSpace = r3d.slice(r3d.indexOf('const TEXT_SPACE_FRAG'), r3d.indexOf('function drawTextSpace'));
  assert.match(textSpace, /uniform vec4 uHushPose;/);
  assert.match(textSpace, /uniform vec4 uHushPoseFx;/);
  const draw = r3d.slice(r3d.indexOf('function drawTextSpace'), r3d.indexOf('function drawTextSpace') + 4000);
  assert.match(draw, /textSpaceU\('uHushPose'\)/);
  assert.match(draw, /textSpaceU\('uHushPoseFx'\)/);
});

test('talk two opens the case of the recordist before you; talk three asks what it agreed to', () => {
  const talk = (talks, context = {}) => nextSourceContact(normalizeSourceContactState({ met: talks > 0, talks }), { context });
  const offered = (encounter, node) => encounter.nodes[node].choices.filter(shown).map((choice) => choice.id);
  assert.ok(!offered(talk(0), 'ask').includes('contact.case'), 'the case is offered on the first talk');
  assert.ok(offered(talk(1), 'ask').includes('contact.case'), 'the second talk does not open the case');
  assert.ok(!offered(talk(1), 'ask').includes('contact.consent'), 'consent is offered before the third talk');
  assert.ok(offered(talk(2), 'ask').includes('contact.consent'), 'the third talk does not ask what it agreed to');
  const third = talk(2).lines.filter(shown).map((line) => line.text).join(' ');
  assert.match(third, /does not turn this time/, 'the third talk opens like the second');
  assert.doesNotMatch(third, /turns before you speak/);
  const bare = offered(talk(1), 'case');
  for (const id of ['contact.case-tallies', 'contact.case-latch', 'contact.case-chandelier', 'contact.case-minute']) assert.ok(!bare.includes(id), id + ' is offered without its clue');
  const found = offered(talk(1, { clues: { tallies: true, voice: true, chandelier: true }, evidence: ['borrowed-body'] }), 'case');
  for (const id of ['contact.case-tallies', 'contact.case-latch', 'contact.case-chandelier', 'contact.case-minute']) assert.ok(found.includes(id), id + ' is not offered with its clue');
});

test('the case and consent checks read the papers, the leads and the body', () => {
  const at = (talks, context) => nextSourceContact(normalizeSourceContactState({ met: true, talks }), { context });
  assert.equal(choiceIn(at(1, {}), 'contact.case-client').goto, 'case-client-blank');
  assert.equal(choiceIn(at(1, { evidence: ['contract-inheritance'] }), 'contact.case-client').goto, 'case-client');
  assert.equal(choiceIn(at(1, {}), 'contact.case-preroll').goto, 'case-preroll-missed');
  assert.equal(choiceIn(at(1, { leads: { fork: 1 } }), 'contact.case-preroll').goto, 'case-preroll');
  assert.equal(choiceIn(at(2, { composure: 10, ceiling: 40 }), 'contact.consent-body').goto, 'consent-body-flinch');
  assert.equal(choiceIn(nextSourceContact(normalizeSourceContactState({ met: true, talks: 2, tells: ['stance'] }), { context: { composure: 10, ceiling: 40 } }), 'contact.consent-body').goto, 'consent-body', 'having matched its stance does not steady the question');
  assert.equal(choiceIn(at(2, {}), 'contact.consent-return').goto, 'consent-return-silence');
  assert.equal(choiceIn(at(2, { rig: true }), 'contact.consent-return').goto, 'consent-return');
  const later = (beats, tells = []) => nextSourceContact(normalizeSourceContactState({ met: true, talks: 2, beats, tells }));
  const consent = (encounter) => encounter.nodes.consent.choices.filter(shown).map((choice) => choice.id);
  assert.ok(!consent(later([])).includes('contact.consent-minute'), 'the minute is offered before it was quoted');
  assert.ok(consent(later(['case_minute'])).includes('contact.consent-minute'));
  assert.ok(consent(later([], ['outline'])).includes('contact.consent-small'), 'seeing both outlines does not let you ask about the small one');
});

test('the warning is an argument between the voices that have earned a side', () => {
  const warning = (state, context = {}) => nextSourceContact(normalizeSourceContactState({ met: true, talks: 3, ...state }), { context })
    .nodes.warning.lines.filter(shown);
  const quiet = warning({}, { composure: 40, ceiling: 40 });
  assert.deepEqual(quiet.map((line) => line.who), ['direction', 'hands', 'you'], 'a warning with nothing learned is not plain');
  const loud = warning({ tells: ['meter', 'ears'], beats: ['name', 'consent_minute', 'consent_small', 'consent_return'] }, { composure: 5, ceiling: 40 });
  const voices = new Set(loud.map((line) => line.who));
  for (const who of ['meter', 'tape', 'ears', 'hands', 'you']) assert.ok(voices.has(who), who + ' has no say in the warning');
  assert.match(loud.at(-1).text, /fight.*retreat.*die/i, 'the argument does not end on the terms');
  assert.ok(loud.filter((line) => line.who === 'you').length === 2, 'the recordist never argues for it');
});

test('every menu fits the number keys, whatever has been unlocked', () => {
  const everything = { tells: SOURCE_CONTACT_TELLS, beats: ['smaller', 'case_minute'] };
  const context = { clues: { tallies: true, voice: true, chandelier: true }, evidence: ['borrowed-body', 'student-performance', 'contract-inheritance', 'pre-roll-causality'] };
  for (const talks of [0, 1, 2, 3, 5]) {
    const encounter = nextSourceContact(normalizeSourceContactState({ met: talks > 0, talks, ...everything }), { context });
    for (const [id, node] of Object.entries(encounter.nodes)) {
      const offered = (node.choices || []).filter(shown);
      assert.ok(offered.length <= 9, `${id} offers ${offered.length} choices on talk ${talks + 1}`);
    }
    const ask = encounter.nodes.ask.choices.filter(shown).map((choice) => choice.id);
    const consent = encounter.nodes.consent.choices.filter(shown).map((choice) => choice.id);
    assert.equal(ask.includes('contact.way-through'), talks < 2, 'whether you can get past it is still asked on the third talk');
    assert.ok(ask.includes('contact.hurt') !== consent.includes('contact.consent-hurt'), 'the one on the floor is asked about twice, or not at all');
  }
});
