import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversation } from '../src/game/conversation.js';
import {
  freshRoofRenState, normalizeRoofRenState, reduceRoofRen, roofRenChecks,
  roofRenDialogue, roofRenOfficeDialogue, roofRenEvidenceDialogue, roofRenStatus,
  ROOF_REN_OFFICE_PROPS, ROOF_REN_EVIDENCE_PROPS,
} from '../src/game/roof-ren.js';

const witnessed = { noticeRead: true, acceptedTakes: 2 };
const roofEntryOnly = { noticeRead: true, acceptedTakes: 1 };
const apply = (state, actions, context = witnessed) => actions.reduce((s, action) => reduceRoofRen(s, action, context).state, state);
const accepted = () => apply(freshRoofRenState(), ['meet', 'ask-warning', 'accept-memory']);
const carrying = () => apply(accepted(), ['office-index', 'office-trace', 'office-cabinet', 'office-envelope', 'office-take']);
const returned = () => apply(carrying(), ['return-memory']);
const withEvidence = state => apply(state, ['evidence-contrary', 'evidence-guarantor']);
const informed = () => withEvidence(returned());
const understanding = ['concern', 'boundary', 'spirits', 'city', 'uncertainty', 'dissent', 'motives', 'previous'];
const disclosure = ['offer-seal', 'terms', 'cost', 'freedom'];

test('the private cassette requires a disclosed warning and a physical chain of office clues', () => {
  let s = freshRoofRenState();
  for (const action of ['accept-memory', 'office-take', 'office-cabinet', 'office-trace']) {
    const result = reduceRoofRen(s, action);
    assert.deepEqual(result.state, s);
    assert.deepEqual(result.effects, []);
  }
  s = accepted();
  assert.equal(s.stage, 'accepted');
  const index = roofRenOfficeDialogue(s, ROOF_REN_OFFICE_PROPS.INDEX);
  assert.ok(index.index.lines.some(l => /reception filing bank/i.test(l.text)));
  assert.equal(index.index.choices?.some(c => c.roofRenAction === 'office-trace'), undefined,
    'the trace cannot be recovered by another choice at the index desk');
  const tooEarly = roofRenOfficeDialogue(s, ROOF_REN_OFFICE_PROPS.TRACE);
  assert.equal(tooEarly.start.choices, undefined);
  s = apply(s, ['office-cabinet', 'office-envelope', 'office-take']);
  assert.equal(s.stage, 'accepted');
  assert.equal(s.cabinetOpened, false);
  s = apply(s, ['office-index', 'office-trace', 'office-cabinet', 'office-envelope']);
  const pad = roofRenOfficeDialogue(s, ROOF_REN_OFFICE_PROPS.TRACE);
  assert.equal(pad.start.choices?.[0].roofRenAction, 'office-trace');
  const taking = reduceRoofRen(s, 'office-take');
  assert.equal(taking.state.stage, 'carrying');
  assert.equal(taking.state.releaseSigned, true);
  assert.deepEqual(taking.effects, [{ type: 'take-memory', itemId: 'ren-home-cassette' }]);
  assert.deepEqual(reduceRoofRen(taking.state, 'office-take').effects, [], 'a signed release cannot duplicate the cassette');
});

test('leaving the double refusal is remembered, acknowledged, and reversible without losing the clues', () => {
  let s = apply(accepted(), ['office-index', 'office-trace', 'office-cabinet']);
  assert.equal(reduceRoofRen(s, 'office-leave-warning').state.warningRespected, false,
    'the warning cannot be respected before the release is read');
  s = reduceRoofRen(s, 'office-envelope').state;
  const office = roofRenOfficeDialogue(s, ROOF_REN_OFFICE_PROPS.CABINET);
  assert.equal(office.release.choices.find(choice => choice.id === 'roof-ren.office-leave-warning').roofRenAction, 'office-leave-warning');
  const left = reduceRoofRen(s, 'office-leave-warning');
  assert.deepEqual(left.effects, []);
  assert.equal(left.state.stage, 'accepted');
  assert.equal(left.state.warningRespected, true);
  assert.equal(left.state.indexRead && left.state.traceRead && left.state.cabinetOpened && left.state.envelopeRead, true);
  assert.deepEqual(normalizeRoofRenState(JSON.parse(JSON.stringify(left.state))), left.state);
  assert.equal(roofRenStatus(left.state).id, 'warning');

  const ren = roofRenDialogue(left.state, witnessed);
  assert.equal(ren.start.choices.find(choice => choice.id === 'roof-ren.left-tell').goto, 'left-truth');
  assert.equal(ren.start.choices.find(choice => choice.id === 'roof-ren.left-tell').roofRenAction, 'tell-left-warning');
  assert.match(ren['left-truth'].lines.map(line => line.text).join(' '), /Thank you for taking that person seriously/);
  assert.match(ren['left-maybe'].lines.map(line => line.text).join(' '), /Drawer seventeen will still be there/);

  const told = reduceRoofRen(left.state, 'tell-left-warning').state;
  assert.equal(told.warningDiscussed, true);
  assert.deepEqual(normalizeRoofRenState(JSON.parse(JSON.stringify(told))), told);
  const revisit = roofRenDialogue(told, witnessed);
  assert.doesNotMatch(revisit.start.lines.map(line => line.text).join(' '), /Did you leave it/);
  assert.ok(revisit.start.choices.some(choice => choice.id === 'roof-ren.left-change'));
  assert.match(roofRenStatus(told).text, /Ren knows you left/);

  const reconsidered = reduceRoofRen(told, 'office-take');
  assert.equal(reconsidered.state.stage, 'carrying');
  assert.equal(reconsidered.state.warningRespected, false);
  assert.equal(reconsidered.state.warningDiscussed, false);
  assert.equal(reconsidered.state.indexRead && reconsidered.state.traceRead, true);
  assert.deepEqual(reconsidered.effects, [{ type: 'take-memory', itemId: 'ren-home-cassette' }]);
});

test('the useful key is earned once independently of accepting Ren’s larger request', () => {
  const r = reduceRoofRen(carrying(), 'return-memory');
  assert.deepEqual(r.effects, [
    { type: 'return-memory', itemId: 'ren-home-cassette' },
    { type: 'grant-reward', itemId: 'ren-service-key' },
  ]);
  assert.equal(r.state.tapeHonesty, 'respected');
  assert.equal(r.state.rewardGranted, true);
  assert.equal(r.state.sealOffered, false);
  assert.equal(roofRenStatus(r.state, {}).id, 'conversation',
    'the personal conversation comes before any demolition objective');
  assert.match(roofRenStatus(r.state, {}).text, /two refusals/i);
  assert.deepEqual(reduceRoofRen(r.state, 'return-memory').effects, []);
  const s = apply(withEvidence(r.state), [...understanding, ...disclosure, 'refuse-seal']);
  assert.equal(s.rewardGranted, true);
  assert.equal(s.locks.sealRefused, true);
  assert.equal(roofRenStatus(s).id, 'declined');
});

test('interrupting Ren’s handoff, including a confronted lie, does not transfer the cassette or key', () => {
  const listenedTree = roofRenDialogue(apply(carrying(), ['listen-memory']), witnessed);
  assert.equal(listenedTree.start.choices.find(c => c.id === 'roof-ren.return-honest').roofRenAction, undefined);
  assert.equal(listenedTree['memory-shared'].choices.find(c => c.id === 'roof-ren.memory-complete').roofRenAction, 'admit-listening');
  assert.equal(listenedTree.start.choices.find(c => c.id === 'roof-ren.return-lie').roofRenAction, undefined);
  assert.equal(listenedTree['returned-lie'].choices.find(c => c.id === 'roof-ren.lie-complete').roofRenAction, 'lie-listening');
  let state = carrying();
  const effects = [];
  const makeConversation = () => {
    const source = roofRenDialogue(state, witnessed);
    const nodes = Object.fromEntries(Object.entries(source).map(([id, n]) => [id, {
      ...n, lines: n.lines.map(l => ({ ...l, voice: false })),
    }]));
    const conversation = createConversation({ sceneId: 'roof-ren-handoff', nodes,
      onChoice: choice => {
        if (!choice.roofRenAction) return;
        const result = reduceRoofRen(state, choice.roofRenAction, witnessed);
        state = result.state;
        effects.push(...result.effects);
      },
    });
    conversation.start();
    return conversation;
  };
  const choose = (conversation, id) => {
    for (let guard = 0; guard < 100; guard++) {
      const view = conversation.view();
      if (view.pending?.kind === 'branch') {
        const index = view.pending.options.findIndex(choice => choice.id === `roof-ren.${id}`);
        assert.ok(index >= 0, `${id} is reachable at ${view.nodeId}`);
        conversation.selectChoice(index, { sound: false });
        conversation.key({ key: 'Enter' });
        return;
      }
      conversation.update(10);
      conversation.key({ key: 'Enter' });
    }
    assert.fail(`never reached ${id}`);
  };

  let conversation = makeConversation();
  choose(conversation, 'return-sealed');
  let reachedFold = false;
  for (let guard = 0; guard < 100; guard++) {
    const view = conversation.view();
    if (view.nodeId === 'memory-shared' && view.line?.text?.startsWith('Ren answers her before')) {
      reachedFold = true;
      break;
    }
    conversation.update(10);
    conversation.key({ key: 'Enter' });
  }
  assert.equal(reachedFold, true, 'Ren can visibly react before the cassette is handed over');
  assert.equal(state.stage, 'carrying');
  assert.deepEqual(effects, []);
  conversation.stop();
  state = normalizeRoofRenState(JSON.parse(JSON.stringify(state)));
  assert.equal(state.stage, 'carrying', 'interruption still leaves the cassette with the player');
  assert.equal(state.rewardGranted, false);

  conversation = makeConversation();
  choose(conversation, 'return-sealed');
  choose(conversation, 'memory-complete');
  assert.equal(state.stage, 'returned');
  assert.equal(state.rewardGranted, true);
  assert.deepEqual(effects, [
    { type: 'return-memory', itemId: 'ren-home-cassette' },
    { type: 'grant-reward', itemId: 'ren-service-key' },
  ]);
  conversation.stop();

  state = apply(carrying(), ['listen-memory']);
  effects.length = 0;
  conversation = makeConversation();
  choose(conversation, 'return-lie');
  assert.equal(state.stage, 'carrying', 'a detected lie has not yet handed anything to Ren');
  conversation.stop();
  state = normalizeRoofRenState(JSON.parse(JSON.stringify(state)));
  assert.equal(state.locks.deception, false, 'interrupting the confrontation does not secretly lock the seal');
  assert.deepEqual(effects, []);

  conversation = makeConversation();
  choose(conversation, 'return-lie');
  choose(conversation, 'lie-complete');
  assert.equal(state.stage, 'returned');
  assert.equal(state.locks.deception, true);
  assert.equal(state.rewardGranted, true);
  assert.deepEqual(effects, [
    { type: 'return-memory', itemId: 'ren-home-cassette' },
    { type: 'grant-reward', itemId: 'ren-service-key' },
  ]);
  conversation.stop();

  state = apply(carrying(), ['listen-memory']);
  effects.length = 0;
  conversation = makeConversation();
  choose(conversation, 'return-lie');
  choose(conversation, 'lie-correct');
  choose(conversation, 'memory-complete');
  assert.equal(state.tapeHonesty, 'admitted', 'telling the truth after confrontation remains a real repair');
  assert.equal(state.locks.deception, false);
  conversation.stop();
});

test('honest boundary breaking remains discussable; deception closes the second request', () => {
  const played = apply(carrying(), ['listen-memory']);
  const honest = reduceRoofRen(played, 'admit-listening').state;
  assert.equal(honest.tapeHonesty, 'admitted');
  assert.equal(roofRenChecks(honest, witnessed).personalWork, true);
  assert.equal(roofRenChecks(honest, witnessed).eligible, false, 'the private errand does not substitute for independent evidence');
  assert.equal(roofRenChecks(withEvidence(honest), witnessed).eligible, true);
  const lie = reduceRoofRen(played, 'lie-listening').state;
  assert.equal(lie.locks.deception, true);
  assert.equal(lie.rewardGranted, true, 'Ren does not revoke the agreed reward');
  const attempted = apply(lie, [...understanding, ...disclosure, 'consent-seal']);
  assert.equal(attempted.sealOffered, false);
  assert.equal(attempted.sealConsented, false);
  assert.equal(roofRenStatus(attempted, witnessed).id, 'closed');
});

test('refusing the small favour or withholding the cassette does not secretly commit or punish the player', () => {
  const refused = apply(freshRoofRenState(), ['meet', 'ask-warning', 'refuse-memory']);
  assert.equal(refused.stage, 'refused');
  assert.equal(apply(refused, ['accept-memory']).stage, 'accepted');
  const withheld = apply(carrying(), ['withhold-memory']);
  assert.equal(withheld.stage, 'withheld');
  assert.equal(withheld.rewardGranted, false);
  assert.equal(withheld.sealOffered, false);
  assert.equal(apply(withheld, ['return-memory']).stage, 'withheld');
  assert.equal(apply(withheld, ['reconsider-memory', 'return-memory']).stage, 'returned');
});

test('the larger quest requires witnessed spirits and a read notice, never generic favour or repeated clicks', () => {
  const s = apply(informed(), understanding);
  for (const context of [{}, { noticeRead: true }, { acceptedTakes: 20 },
    { noticeRead: true, acceptedTakes: 0 }, { noticeRead: true, acceptedTakes: 1, heardSpirit: true }]) {
    const r = reduceRoofRen(s, 'offer-seal', context);
    assert.equal(r.state.sealOffered, false);
    assert.deepEqual(r.effects, []);
  }
  assert.equal(reduceRoofRen(s, 'offer-seal', witnessed).state.sealOffered, true);
  assert.equal(roofRenChecks(informed(), witnessed).offerReady, false, 'independent evidence does not replace the conversation');
});

test('a single accepted take does not satisfy Ren’s independent witness check', () => {
  const s = returned();
  assert.equal(roofRenChecks(s, roofEntryOnly).heardSpirits, false);
  assert.equal(roofRenChecks(s, witnessed).heardSpirits, true);
  assert.equal(reduceRoofRen(s, 'spirits', roofEntryOnly).state.history.spirits, false);
  assert.equal(reduceRoofRen(s, 'spirits', witnessed).state.history.spirits, true);
  assert.equal(roofRenStatus(apply(s, ['concern', 'boundary']), roofEntryOnly).id, 'witness');
  assert.match(roofRenStatus(apply(s, ['concern', 'boundary']), roofEntryOnly).text, /listen in more than one room/i);
  const dialogue = roofRenDialogue(apply(s, ['concern', 'boundary']), roofEntryOnly);
  assert.match(dialogue.grounded.lines.map(line => line.text).join(' '), /listen in more than one of them/i);
  assert.match(roofRenDialogue(s, witnessed).witness.lines.map(line => line.text).join(' '), /more than one room/i);
});

test('the second request needs both a dissenting spirit and a previous guarantor, heard in separate open rooms', () => {
  const accounts = [
    [ROOF_REN_EVIDENCE_PROPS.CONTRARY, 'account', 'evidence-contrary'],
    [ROOF_REN_EVIDENCE_PROPS.GUARANTOR, 'trace', 'evidence-guarantor'],
  ];
  for (const [propId, answerNode, action] of accounts) {
    const nodes = roofRenEvidenceDialogue(freshRoofRenState(), propId);
    assert.ok(nodes.start.choices?.length, `${propId} can be investigated`);
    assert.equal(nodes.start.choices[0].roofRenAction, undefined, 'opening the evidence does not count as reading it');
    assert.equal(nodes[answerNode].choices[0].roofRenAction, action, 'the state changes after the account is complete');
  }
  assert.equal(roofRenEvidenceDialogue(freshRoofRenState(), 'unrelated-prop'), null);
  const full = apply(informed(), [...understanding, 'offer-seal']);
  assert.equal(full.sealOffered, true);
  for (const missing of ['evidence-contrary', 'evidence-guarantor']) {
    const partial = apply(returned(), [
      ...['evidence-contrary', 'evidence-guarantor'].filter(action => action !== missing),
      ...understanding, 'offer-seal',
    ]);
    assert.equal(partial.sealOffered, false, `${missing} cannot be inferred from Ren's claim`);
  }
  const afterUncertainty = apply(returned(), ['concern', 'boundary', 'spirits', 'city', 'uncertainty']);
  assert.equal(roofRenDialogue(afterUncertainty, witnessed).start.choices[0].goto, 'dissent-where');
  const afterDissent = apply(withEvidence(afterUncertainty), ['dissent', 'motives']);
  assert.equal(roofRenDialogue(afterDissent, witnessed).start.choices[0].goto, 'precedent');
});

test('empathy without a boundary, or knowledge without challenging Ren, cannot unlock the seal', () => {
  for (const omitted of ['concern', 'boundary', 'uncertainty', 'dissent', 'motives', 'previous']) {
    const s = apply(informed(), [...understanding.filter(a => a !== omitted), ...disclosure, 'consent-seal']);
    assert.equal(s.sealConsented, false, omitted);
  }
  for (const action of ['cruelty', 'transaction']) {
    const s = apply(informed(), [action, ...understanding, ...disclosure, 'consent-seal']);
    assert.equal(s.sealConsented, false, action);
  }
});

test('only informed, explicit consent starts the roof rite, with the existing sacrifice ending ID', () => {
  let s = apply(informed(), [...understanding, 'offer-seal']);
  assert.equal(s.sealOffered, true);
  assert.deepEqual(reduceRoofRen(s, 'consent-seal', witnessed).effects, []);
  s = apply(s, ['terms', 'cost', 'freedom']);
  const ritual = reduceRoofRen(s, 'consent-seal', witnessed);
  assert.equal(ritual.state.sealConsented, true);
  assert.deepEqual(ritual.effects, [{ type: 'start-ritual', endingId: 'sacrifice', variant: 'century-stay' }]);
  assert.deepEqual(reduceRoofRen(ritual.state, 'consent-seal', witnessed).effects, [], 'one consent cannot start two ending scenes');
  assert.equal(reduceRoofRen(ritual.state, 'complete-ritual').state.ritualComplete, true);
  assert.equal(reduceRoofRen(s, 'complete-ritual').state.ritualComplete, false);
});

test('every disclosure check is required and final refusal survives a reload', () => {
  for (const omitted of ['terms', 'cost', 'freedom']) {
    const s = apply(informed(), [...understanding, ...disclosure.filter(a => a !== omitted), 'consent-seal']);
    assert.equal(s.sealConsented, false, omitted);
  }
  const s = normalizeRoofRenState(JSON.parse(JSON.stringify(apply(informed(), [...understanding, ...disclosure, 'refuse-seal']))));
  const r = reduceRoofRen(s, 'consent-seal');
  assert.equal(r.state.sealConsented, false);
  assert.deepEqual(r.effects, []);
  const nodes = roofRenDialogue(s, witnessed);
  assert.equal(nodes.start.choices[0].goto, 'declined');
});

test('a chosen question does not grant trust until Ren has answered it', () => {
  const initial = returned();
  const nodes = roofRenDialogue(initial, witnessed);
  assert.equal(nodes.personal.choices.find(c => c.id === 'roof-ren.mother').roofRenAction, undefined);
  assert.equal(nodes.boundary.choices.find(c => c.id === 'roof-ren.boundary-clear').roofRenAction, undefined);
  assert.equal(nodes['why-you'].choices.find(c => c.id === 'roof-ren.motives-suspicion').roofRenAction, undefined);
  assert.equal(nodes.witness.choices.find(c => c.id === 'roof-ren.witness-skeptic').roofRenAction, undefined);
  assert.equal(reduceRoofRen(initial, 'boundary', witnessed).state.history.boundary, false,
    'leaving before Ren answers the personal question cannot satisfy the boundary');
  const asked = reduceRoofRen(initial, 'concern', witnessed).state;
  assert.equal(asked.history.boundary, false);
  assert.equal(reduceRoofRen(asked, 'boundary', witnessed).state.history.boundary, true);
});

test('interrupting a live answer does not skip it on the next conversation', () => {
  let state = returned();
  const source = roofRenDialogue(state, witnessed);
  const nodes = Object.fromEntries(Object.entries(source).map(([id, n]) => [id, {
    ...n, lines: n.lines.map(l => ({ ...l, voice: false })),
  }]));
  const conversation = createConversation({ sceneId: 'roof-ren-interrupted', nodes,
    onChoice: choice => {
      if (choice.roofRenAction) state = reduceRoofRen(state, choice.roofRenAction, witnessed).state;
    },
  });
  conversation.start();
  for (const desired of ['resume', 'mother']) {
    for (let guard = 0; guard < 200; guard++) {
      const view = conversation.view();
      if (view.pending?.kind === 'branch') {
        const index = view.pending.options.findIndex(c => c.id === `roof-ren.${desired}`);
        assert.ok(index >= 0, `${desired} is reachable`);
        conversation.selectChoice(index, { sound: false });
        conversation.key({ key: 'Enter' });
        break;
      }
      conversation.update(10);
      conversation.key({ key: 'Enter' });
    }
  }
  conversation.stop();
  assert.equal(state.history.concern, false);
  assert.equal(roofRenDialogue(state, witnessed).start.choices[0].goto, 'personal');
});

test('explicitly waving away the warning or Ren’s accountability closes the seal; asking its value does not', () => {
  const personal = apply(returned(), ['concern']);
  const missedWarning = reduceRoofRen(personal, 'warning-dismissed', witnessed).state;
  assert.equal(missedWarning.locks.warningDismissed, true);
  assert.equal(roofRenChecks(missedWarning, witnessed).trustIntact, false);
  assert.equal(roofRenDialogue(missedWarning, witnessed).start.choices[0].goto, 'closed');
  const beforeAdmission = apply(informed(), ['concern', 'boundary', 'spirits', 'city', 'uncertainty', 'dissent']);
  const dodged = reduceRoofRen(beforeAdmission, 'avoid-accountability', witnessed).state;
  assert.equal(dodged.locks.accountabilityDodged, true);
  assert.equal(roofRenChecks(dodged, witnessed).offerReady, false);
  const nodes = roofRenDialogue(beforeAdmission, witnessed);
  assert.equal(nodes.precedent.choices.find(c => c.id === 'roof-ren.previous-price').roofRenAction, undefined);
  assert.match(nodes['previous-worth'].lines.map(l => l.text).join(' '), /no number I can put against your life outside/i);
  assert.equal(roofRenChecks(apply(beforeAdmission, ['motives', 'previous']), witnessed).trustIntact, true);
  const dissentDismissed = reduceRoofRen(apply(informed(), ['concern', 'boundary', 'spirits', 'city', 'uncertainty']), 'dissent-dismissed').state;
  assert.equal(dissentDismissed.locks.dissentDismissed, true);
  assert.equal(dissentDismissed.rewardGranted, true, 'Ren does not take back the service key');
  assert.equal(roofRenDialogue(dissentDismissed, witnessed).start.choices[0].goto, 'closed');
});

test('returning the private tape makes its effect perceptible without changing the ordinary recording', () => {
  const nodes = roofRenDialogue(carrying(), witnessed);
  assert.equal(nodes['returned-sealed'].goto, 'memory-shared');
  assert.equal(nodes['returned-honest'].goto, 'memory-shared');
  assert.equal(nodes['memory-shared'].lines.find(l => l.roofRenVisual === 'memory-fold')?.who, 'direction');
  assert.match(nodes['memory-shared'].lines.map(l => l.text).join(' '), /tape itself has not changed/i);
  assert.doesNotMatch(nodes['memory-shared'].lines.map(l => l.text).join(' '), /practice-room door knocks/i,
    'Ren hearing a private family tape does not itself release a building-wide threat');
});

test('state normalization is JSON-safe, bounded to authored keys, and preserves unfinished conversations', () => {
  const s = apply(returned(), ['concern', 'boundary', 'spirits', 'city']);
  assert.deepEqual(normalizeRoofRenState(JSON.parse(JSON.stringify(s))), s);
  assert.equal(roofRenDialogue(s, witnessed).start.choices[0].goto, 'displaced');
  const normalized = normalizeRoofRenState({ stage: '__proto__', history: { concern: true, bogus: true }, ritualComplete: true });
  assert.equal(normalized.stage, 'new');
  assert.equal(normalized.history.concern, true);
  assert.equal('bogus' in normalized.history, false);
  assert.equal(normalized.ritualComplete, false);
});

test('older saves retain the completed errand and consent but replay an unearned new evidence conversation', () => {
  for (const schema of [1, 2]) {
    const old = {
      ...returned(), schema,
      history: { ...returned().history, concern: true, boundary: true, spirits: true, city: true,
        uncertainty: true, motives: true, previous: true, terms: true, cost: true, freedom: true },
      sealOffered: true,
    };
    const migrated = normalizeRoofRenState(JSON.parse(JSON.stringify(old)));
    assert.equal(migrated.schema, 3);
    assert.equal(migrated.stage, 'returned');
    assert.equal(migrated.rewardGranted, true);
    assert.equal(migrated.contraryAccountHeard, false);
    assert.equal(migrated.guarantorTraceRead, false);
    assert.equal(migrated.history.concern, false, 'old unfinished answers must be heard anew');
    assert.equal(migrated.sealOffered, false);
    assert.equal(roofRenDialogue(migrated, witnessed).start.choices[0].goto, 'personal');
    const declined = normalizeRoofRenState({ ...old, locks: { sealRefused: true } });
    assert.equal(declined.locks.sealRefused, true);
    const consented = normalizeRoofRenState({ ...old, sealConsented: true });
    assert.equal(consented.sealConsented, true);
    assert.equal(consented.history.previous, true);
    assert.equal(consented.sealOffered, true);
  }
});

test('the actual authored happy path accumulates the same checks before the explicit consent choice', () => {
  let s = withEvidence(carrying());
  const nodes = roofRenDialogue(s, witnessed);
  const route = [
    'return-sealed', 'memory-complete', 'reward-stay', 'mother', 'home-boundary', 'boundary-clear',
    'warning-hold-boundary', 'witness-skeptic', 'witness-careful-next',
    'city-consequence', 'uncertainty-demand', 'dissent-account', 'dissent-ask-ren', 'motives-suspicion',
    'admission-accountable', 'previous-question', 'previous-terms', 'seal-hear-terms',
    'terms-cost', 'cost-read-back', 'cost-right-to-no', 'freedom-consent', 'consent-explicit',
  ];
  let current = 'start';
  const spoken = [];
  const effects = [];
  for (const choiceId of route) {
    while (!nodes[current].choices?.length && nodes[current].goto) {
      spoken.push(...nodes[current].lines.map(l => l.text));
      current = nodes[current].goto;
    }
    const n = nodes[current];
    spoken.push(...n.lines.map(l => l.text));
    const choice = n.choices?.find(c => c.id === `roof-ren.${choiceId}`);
    assert.ok(choice, `choice ${choiceId} exists at ${current}`);
    if (choice.roofRenAction) {
      const r = reduceRoofRen(s, choice.roofRenAction, witnessed);
      s = r.state; effects.push(...r.effects);
    }
    current = choice.goto;
  }
  assert.equal(s.sealConsented, true);
  assert.equal(current, 'ritual');
  assert.ok(spoken.some(text => text.includes('You cannot go home')));
  assert.ok(spoken.some(text => text.includes('I cannot reverse it')));
  assert.ok(spoken.some(text => text.includes('It is not the money')));
  assert.deepEqual(effects.filter(e => e.type === 'start-ritual'), [{ type: 'start-ritual', endingId: 'sacrifice', variant: 'century-stay' }]);
});

test('all generated trees have valid destinations, authored action ids, and no fake automatic acceptance', () => {
  const examples = [
    freshRoofRenState(), accepted(), carrying(), returned(), informed(),
    apply(accepted(), ['office-index', 'office-trace', 'office-cabinet', 'office-envelope', 'office-leave-warning']),
    apply(accepted(), ['office-index', 'office-trace', 'office-cabinet', 'office-envelope', 'office-leave-warning', 'tell-left-warning']),
    apply(returned(), ['concern', 'boundary']),
    apply(informed(), [...understanding, ...disclosure]),
    apply(returned(), ['cruelty']),
    apply(informed(), [...understanding, ...disclosure, 'refuse-seal']),
  ];
  for (const state of examples) {
    const trees = [roofRenDialogue(state, witnessed),
      ...Object.values(ROOF_REN_OFFICE_PROPS).map(id => roofRenOfficeDialogue(state, id)),
      ...Object.values(ROOF_REN_EVIDENCE_PROPS).map(id => roofRenEvidenceDialogue(state, id))];
    for (const nodes of trees) {
      assert.ok(nodes.start);
      for (const [id, n] of Object.entries(nodes)) {
        if (n.goto) assert.ok(nodes[n.goto], `${id} -> ${n.goto}`);
        for (const c of n.choices || []) {
          assert.ok(nodes[c.goto], `${id}: ${c.id} -> ${c.goto}`);
          assert.ok(c.id && c.sourceId);
          assert.equal(c.roofRenAction === 'consent-seal' && !c.text.includes('I choose to stay for one hundred years'), false);
        }
      }
    }
  }
  assert.equal(roofRenOfficeDialogue(accepted(), 'unrelated-prop'), null);
});

test('the live conversation machine carries custom actions through the full roof rite without a stale-tree dead end', () => {
  let state = withEvidence(carrying()), done = 0;
  const route = [
    'return-sealed', 'memory-complete', 'reward-stay', 'stay-with-memory', 'quiet-boundary', 'boundary-flattery',
    'boundary-corrected', 'warning-hold-boundary', 'witness-human', 'witness-habit-next',
    'demolition-denial', 'freedom-city', 'uncertainty-easy', 'uncertainty-corrected',
    'dissent-account', 'dissent-ask-ren',
    'motives-question', 'ren-cannot-admission', 'admission-accountable',
    'previous-accountability', 'previous-terms', 'seal-hear-terms', 'terms-cost', 'cost-freedom',
    'freedom-consent', 'consent-explicit',
  ];
  const source = roofRenDialogue(state, witnessed);
  const nodes = Object.fromEntries(Object.entries(source).map(([id, n]) => [id, {
    ...n, lines: n.lines.map(l => ({ ...l, voice: false })),
  }]));
  const conversation = createConversation({
    sceneId: 'roof-ren-integration', nodes,
    onChoice: choice => {
      if (choice.roofRenAction) state = reduceRoofRen(state, choice.roofRenAction, witnessed).state;
    },
    onDone: () => { done++; },
  });
  conversation.start();
  let choices = 0;
  for (let guard = 0; guard < 600 && !conversation.view().finished; guard++) {
    const view = conversation.view();
    if (view.pending?.kind === 'branch') {
      const wanted = route[choices++];
      const index = view.pending.options.findIndex(choice => choice.id === `roof-ren.${wanted}`);
      assert.ok(index >= 0, `authored ${wanted} reachable at ${view.nodeId}`);
      conversation.selectChoice(index, { sound: false });
    } else conversation.update(10);
    conversation.key({ key: 'Enter' });
  }
  assert.equal(choices, route.length);
  assert.equal(done, 1);
  assert.equal(state.sealConsented, true);
  assert.equal(conversation.view().finished, true);
});
