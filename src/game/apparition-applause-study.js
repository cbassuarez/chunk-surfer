// Local experimental accounting, independent of the game's audio and geometry.
// An assignment is committed before exposure, and answers advance only forward.
export const HALL_STUDY = Object.freeze({
  version: 1,
  storageKey: 'chunk-surfer:hall-encounter-study:v1',
  visualSeed: 'hall-applause-study-v1',
  conditions: Object.freeze(['silent', 'ordinary', 'treatment']),
});

const choice = (value, label) => Object.freeze({ value, label });
const rating = Object.freeze(Array.from({ length: 7 }, (_, value) => choice(String(value), String(value))));
export const HALL_STUDY_QUESTIONS = Object.freeze([
  Object.freeze({ id: 'recall', label: 'What happened?', type: 'text' }),
  Object.freeze({ id: 'location', label: 'Where did anything seem to happen?', type: 'text' }),
  Object.freeze({ id: 'recognition', label: 'Which, if any, best describes what you noticed?', type: 'choice', choices: Object.freeze([
    choice('nothing', 'Nothing distinct'), choice('applause', 'Applause or handclaps'), choice('impact', 'A click or impact'),
    choice('mechanical', 'A mechanical sound'), choice('voice-music', 'A voice or music'), choice('other', 'Something else'), choice('unsure', 'Unsure'),
  ]) }),
  Object.freeze({ id: 'presence', label: 'How strongly did you sense another presence in the room?', type: 'choice',
    hint: '0 = not at all; 6 = very strongly', choices: rating }),
  Object.freeze({ id: 'startle', label: 'How startled were you?', type: 'choice', hint: '0 = not at all; 6 = extremely', choices: rating }),
  Object.freeze({ id: 'spatialFit', label: 'How well did what you noticed fit the visible room?', type: 'choice',
    hint: '0 = did not fit; 6 = fit completely', choices: Object.freeze([...rating,
      choice('nothing', 'I did not notice anything distinct'), choice('unsure', 'Unsure')]) }),
  Object.freeze({ id: 'confidence', label: 'How confident are you about your description?', type: 'choice',
    hint: '0 = not at all; 6 = very confident', choices: rating }),
  Object.freeze({ id: 'recordingDevice', label: 'Was this session recorded outside this study page?', type: 'choice', choices: Object.freeze([
    choice('none', 'No external recording'), choice('browser', 'Browser or computer screen recording'),
    choice('external', 'An external recorder'), choice('unknown', 'Other or unknown'),
  ]) }),
]);

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const timestamp = (value) => {
  if (!Number.isFinite(value) || value < 0) throw new Error('A valid local timestamp is required.');
  return value;
};

export function freshHallStudy() {
  return { version: HALL_STUDY.version, block: 0, queue: [], current: null, trials: [] };
}

function shuffledBlock(random) {
  const block = [...HALL_STUDY.conditions];
  for (let index = block.length - 1; index > 0; index--) {
    const draw = random();
    if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error('Invalid random draw.');
    const selected = Math.floor(draw * (index + 1));
    [block[index], block[selected]] = [block[selected], block[index]];
  }
  return block;
}

export function reserveHallStudyParticipant(state, {
  participantId, freshParticipant = false, device, comfortableVolume = false, nowMs, random,
} = {}) {
  if (state.current) throw new Error('This exposure is already assigned. It cannot be restarted or rerolled.');
  if (freshParticipant !== true || comfortableVolume !== true) throw new Error('Complete both declarations before beginning.');
  if (!['headphones', 'speakers'].includes(device)) throw new Error('Choose the playback device.');
  if (typeof participantId !== 'string' || !/^hall-[a-zA-Z0-9-]{8,80}$/.test(participantId)
    || state.trials.some((trial) => trial.participantId === participantId)) throw new Error('A new anonymous participant ID is required.');
  const next = clone(state);
  if (next.queue.length === 0) {
    if (typeof random !== 'function') throw new Error('A random source is required.');
    next.queue = shuffledBlock(random);
    next.block += 1;
  }
  const condition = next.queue.shift();
  next.current = { participantId, condition, visualSeed: HALL_STUDY.visualSeed, block: next.block,
    phase: 'reserved', reservedAtMs: timestamp(nowMs), startedAtMs: null, finishedAtMs: null,
    freshParticipant: true, comfortableVolume: true, playbackDevice: device,
    questionIndex: 0, answers: {}, interruptions: [], configuration: null, trace: null };
  return next;
}

export function startHallStudyTrial(state, { configuration = null, nowMs } = {}) {
  if (state.current?.phase !== 'reserved') throw new Error('This exposure cannot be started again.');
  const next = clone(state);
  Object.assign(next.current, { phase: 'playing', startedAtMs: timestamp(nowMs), configuration: clone(configuration) });
  return next;
}

export function interruptHallStudyTrial(state, { reason = 'reload', nowMs } = {}) {
  if (!['reserved', 'playing'].includes(state.current?.phase)) return state;
  const next = clone(state);
  next.current.phase = 'interrupted';
  next.current.interruptions.push({ reason: String(reason), atMs: timestamp(nowMs) });
  return next;
}

export function finishHallStudyTrial(state, { trace = null, nowMs } = {}) {
  if (!['playing', 'interrupted'].includes(state.current?.phase)) throw new Error('No active exposure can be ended.');
  const next = clone(state);
  Object.assign(next.current, { phase: 'questions', finishedAtMs: timestamp(nowMs), trace: clone(trace) });
  return next;
}

export function answerHallStudyQuestion(state, { questionId, value, nowMs } = {}) {
  const trial = state.current;
  const question = HALL_STUDY_QUESTIONS[trial?.questionIndex];
  if (trial?.phase !== 'questions' || !question || question.id !== questionId || Object.hasOwn(trial.answers, questionId)) {
    throw new Error('Answers are locked in order and cannot be edited after continuing.');
  }
  const answer = typeof value === 'string' ? value.trim() : '';
  if (question.type === 'text' ? !answer || answer.length > 10000 : !question.choices.some((entry) => entry.value === answer)) {
    throw new Error('Enter an answer before continuing.');
  }
  const next = clone(state);
  next.current.answers[questionId] = { value: answer, lockedAtMs: timestamp(nowMs) };
  next.current.questionIndex += 1;
  if (next.current.questionIndex === HALL_STUDY_QUESTIONS.length) {
    next.current.phase = 'complete';
    next.current.completedAtMs = nowMs;
  }
  return next;
}

export function nextHallStudyParticipant(state) {
  if (state.current?.phase !== 'complete') throw new Error('Finish this response before handing over to a new participant.');
  const next = clone(state);
  next.trials.push(next.current);
  next.current = null;
  return next;
}

export function readHallStudyStorage(raw, { nowMs } = {}) {
  if (raw == null) return { ok: true, state: freshHallStudy() };
  try {
    const state = JSON.parse(raw);
    if (state?.version !== HALL_STUDY.version || !Number.isInteger(state.block) || state.block < 0
      || !Array.isArray(state.queue) || state.queue.length > 3 || new Set(state.queue).size !== state.queue.length
      || !state.queue.every((arm) => HALL_STUDY.conditions.includes(arm)) || !Array.isArray(state.trials)) throw new Error('Invalid study storage.');
    if (state.current && (!HALL_STUDY.conditions.includes(state.current.condition)
      || !['reserved', 'playing', 'interrupted', 'questions', 'complete'].includes(state.current.phase)
      || !Number.isInteger(state.current.questionIndex) || state.current.questionIndex < 0
      || state.current.questionIndex > HALL_STUDY_QUESTIONS.length || !state.current.answers
      || !Array.isArray(state.current.interruptions))) throw new Error('Invalid participant storage.');
    return { ok: true, state: interruptHallStudyTrial(state, { reason: 'page-reloaded', nowMs }) };
  } catch (_) {
    return { ok: false, state: null, error: 'Local study storage needs facilitator review. No new exposure was assigned.' };
  }
}

export function exportHallStudy(state, { nowMs } = {}) {
  return { format: 'hall-encounter-study', version: HALL_STUDY.version, exportedAtMs: timestamp(nowMs),
    evidenceScope: 'Participant answers and runtime traces. Scheduling does not establish audibility, presence or spatial impossibility.',
    protocol: { assignment: 'randomized balanced blocks of three; between participants',
      visualSeed: HALL_STUDY.visualSeed, freshExposureRequired: true, freeRecallLockedBeforeRecognition: true,
      repeatsAllowed: false, storage: 'this browser only; no external submission' },
    trials: clone([...state.trials, ...(state.current ? [state.current] : [])]),
    assignmentState: { block: state.block, queue: [...state.queue] } };
}
