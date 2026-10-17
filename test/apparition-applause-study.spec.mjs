import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { HALL_STUDY, HALL_STUDY_QUESTIONS, freshHallStudy, reserveHallStudyParticipant,
  startHallStudyTrial, interruptHallStudyTrial, finishHallStudyTrial, answerHallStudyQuestion,
  nextHallStudyParticipant, readHallStudyStorage, exportHallStudy } from '../src/game/apparition-applause-study.js';

let serial = 0;
const reserve = (state, extra = {}) => reserveHallStudyParticipant(state, {
  participantId: `hall-anonymous-${++serial}`, freshParticipant: true, comfortableVolume: true,
  device: 'headphones', nowMs: 1000 + serial, random: () => .41, ...extra,
});
const launch = (state) => startHallStudyTrial(state, { configuration: { visualSeed: HALL_STUDY.visualSeed }, nowMs: 2000 });
const finish = (state) => finishHallStudyTrial(state, { trace: { audio: { played: 0 }, director: { emitted: 0 } }, nowMs: 3000 });
function complete(state) {
  let next = state;
  for (const question of HALL_STUDY_QUESTIONS) next = answerHallStudyQuestion(next, {
    questionId: question.id, value: question.type === 'text' ? 'I did not notice anything distinct.' : question.choices[0].value,
    nowMs: 4000 + next.current.questionIndex,
  });
  return next;
}

test('randomized blocks balance all three between-participant arms and keep one visual seed', () => {
  let state = freshHallStudy(), draws = 0;
  const assigned = [];
  const random = () => { draws++; return (draws * .173) % 1; };
  for (let index = 0; index < 12; index++) {
    state = reserve(state, { random, device: index % 2 ? 'headphones' : 'speakers' });
    assigned.push(state.current.condition);
    assert.equal(state.current.visualSeed, HALL_STUDY.visualSeed);
    state = nextHallStudyParticipant(complete(finish(launch(state))));
  }
  for (let index = 0; index < assigned.length; index += 3) {
    assert.deepEqual(assigned.slice(index, index + 3).sort(), [...HALL_STUDY.conditions].sort());
  }
  assert.equal(draws, 8, 'exactly one shuffle per block, never one draw per failed launch');
  assert.equal(state.trials.length, 12);
});

test('freshness, playback device, comfortable volume and anonymous IDs are required before assignment', () => {
  for (const extra of [{ freshParticipant: false }, { comfortableVolume: false },
    { device: '' }, { participantId: 'name@example.com' }, { random: () => 1 }]) {
    const state = freshHallStudy();
    assert.throws(() => reserve(state, extra));
    assert.deepEqual(state, freshHallStudy(), 'failed preparation cannot partly consume an assignment');
  }
  let state = reserve(freshHallStudy(), { participantId: 'hall-anonymous-unique' });
  state = nextHallStudyParticipant(complete(finish(launch(state))));
  assert.throws(() => reserve(state, { participantId: 'hall-anonymous-unique' }));
});

test('assignment is spent before exposure; reservation, startup failure and reload never reroll or repeat', () => {
  const reserved = reserve(freshHallStudy());
  const assigned = reserved.current.condition;
  for (const current of [reserved, launch(reserved), interruptHallStudyTrial(reserved, { reason: 'startup-incomplete', nowMs: 3000 })]) {
    const recovered = readHallStudyStorage(JSON.stringify(current), { nowMs: 4000 });
    assert.equal(recovered.ok, true);
    assert.equal(recovered.state.current.phase, 'interrupted');
    assert.equal(recovered.state.current.condition, assigned);
    assert.deepEqual(recovered.state.queue, reserved.queue);
    assert.throws(() => reserve(recovered.state));
    assert.throws(() => launch(recovered.state));
    assert.equal(finish(recovered.state).current.phase, 'questions', 'partial exposure still receives the same questions');
  }
});

test('free recall and location are exact, sequential and permanently locked before recognition', () => {
  assert.deepEqual(HALL_STUDY_QUESTIONS.slice(0, 2).map((question) => question.label), [
    'What happened?', 'Where did anything seem to happen?',
  ]);
  let state = finish(launch(reserve(freshHallStudy())));
  assert.throws(() => answerHallStudyQuestion(state, { questionId: 'recognition', value: 'applause', nowMs: 4000 }));
  assert.throws(() => answerHallStudyQuestion(state, { questionId: 'recall', value: ' ', nowMs: 4000 }));
  state = answerHallStudyQuestion(state, { questionId: 'recall', value: 'A noise and someone vanished.', nowMs: 4000 });
  assert.throws(() => answerHallStudyQuestion(state, { questionId: 'recall', value: 'Edited after prompting', nowMs: 4100 }));
  assert.throws(() => answerHallStudyQuestion(state, { questionId: 'recognition', value: 'applause', nowMs: 4100 }));
  const recovered = readHallStudyStorage(JSON.stringify(state), { nowMs: 4200 }).state;
  assert.equal(recovered.current.questionIndex, 1);
  assert.equal(recovered.current.answers.recall.value, 'A noise and someone vanished.');
  assert.throws(() => answerHallStudyQuestion(recovered, { questionId: 'recall', value: 'Another edit', nowMs: 4300 }));
});

test('presence, startle, spatial fit, confidence and recording metadata remain distinct measures', () => {
  assert.deepEqual(HALL_STUDY_QUESTIONS.slice(2).map((question) => question.id), [
    'recognition', 'presence', 'startle', 'spatialFit', 'confidence', 'recordingDevice',
  ]);
  const fit = HALL_STUDY_QUESTIONS.find((question) => question.id === 'spatialFit');
  assert.ok(fit.choices.some((entry) => entry.value === 'nothing'));
  assert.ok(fit.choices.some((entry) => entry.value === 'unsure'));
  const state = complete(finish(launch(reserve(freshHallStudy()))));
  assert.equal(state.current.phase, 'complete');
  assert.equal(Object.keys(state.current.answers).length, 8);
  assert.throws(() => launch(state));
});

test('incomplete data cannot be replaced by a new participant; completed data is retained', () => {
  const state = reserve(freshHallStudy());
  assert.throws(() => nextHallStudyParticipant(state));
  const finished = complete(finish(launch(state)));
  const next = nextHallStudyParticipant(finished);
  assert.equal(next.current, null);
  assert.deepEqual(next.trials, [finished.current]);
  assert.deepEqual(next.queue, state.queue);
  assert.equal(finished.trials.length, 0, 'transitions do not mutate earlier snapshots');
});

test('local exports keep raw answers and traces without inferring that a sound or tail was heard', () => {
  const state = complete(finish(launch(reserve(freshHallStudy()))));
  const result = exportHallStudy(state, { nowMs: 5000 });
  assert.equal(result.trials.length, 1);
  assert.equal(result.trials[0].trace.audio.played, 0);
  assert.match(result.evidenceScope, /Scheduling does not establish audibility/);
  for (const forbidden of ['heard', 'horrifying', 'successful', 'audienceRecognized', 'spatialImpossible']) {
    assert.equal(Object.hasOwn(result.trials[0], forbidden), false);
  }
  result.trials[0].answers.recall.value = 'mutated export';
  assert.notEqual(state.current.answers.recall.value, 'mutated export');
});

test('corrupt, incompatible or unavailable stored state fails closed instead of assigning a replacement exposure', () => {
  assert.equal(readHallStudyStorage(null, { nowMs: 1000 }).ok, true);
  for (const raw of ['{', 'null', JSON.stringify({ ...freshHallStudy(), version: 99 }),
    JSON.stringify({ ...freshHallStudy(), queue: ['ordinary', 'ordinary'] }),
    JSON.stringify({ ...freshHallStudy(), current: { phase: 'playing' } })]) {
    const loaded = readHallStudyStorage(raw, { nowMs: 1000 });
    assert.equal(loaded.ok, false);
    assert.equal(loaded.state, null);
  }
});

test('the participant page embeds the actual game and invokes only the study bridge, without automatic legal acceptance or camera control', () => {
  const html = readFileSync(new URL('../apparition-applause-study.html', import.meta.url), 'utf8');
  assert.match(html, /<title>Hall encounter study<\/title>/);
  assert.match(html, /<iframe[^>]+src="\.\/index\.html\?nomic=1"/);
  assert.doesNotMatch(html, /allow="[^\"]*microphone/);
  assert.match(html, /apparitionApplauseStudyStart/);
  assert.match(html, /apparitionApplauseStudyFinish/);
  assert.match(html, /reserveHallStudyParticipant[\s\S]+await game\.apparitionApplauseStudyStart/);
  assert.doesNotMatch(html, /acceptEula|acceptEULA|lookAtWorld|apparitionForce|apparitionHardReveal|\.click\(.*[Ee][Uu][Ll][Aa]/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|<canvas/);
  assert.doesNotMatch(html, /textContent\s*=\s*[^;]*(?:\.condition|\.queue)/);
  assert.match(html, /pagehide/);
  assert.match(html, /game-reloaded/);
});
