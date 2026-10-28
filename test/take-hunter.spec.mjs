import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  TAKE_HUNTER, freshTakeHunter, armTakeHunter, stepTakeHunter, takeHunterPressure,
  tryCancelTake, takeHunterTransport,
} from '../src/game/take-hunter.js';

// ── THE THING YOUR OWN VOICE FETCHES ─────────────────────────────────────────
//
// A recording hallucination puts bodies in the room while you hold a minute of
// silence, and the microphone is listening to your real one. The honest reaction
// is a sound — and until now a sound during a take did exactly one thing: end
// the take. The hunt began afterwards, in onTakeBroken, by which point the
// minute was over and there was nothing left to be frightened of.
{
  const armed = armTakeHunter(freshTakeHunter(), { cause: 'scream' });
  assert.equal(armed.active, true);
  assert.equal(armed.cells, TAKE_HUNTER.startCells, 'it starts far off');
  assert.equal(armed.cause, 'scream', 'and remembers what fetched it');
}

// It closes while it can hear you — and holding a take means standing still, so
// there is no running from it. Only silence.
{
  let state = armTakeHunter(freshTakeHunter(), {});
  let contactAt = null;
  for (let t = 0; t < 60 && !contactAt; t += 0.1) {
    const result = stepTakeHunter(state, 0.1, { recording: true, heard: 0.3 });
    state = result.state;
    if (result.contact) contactAt = +(t + 0.1).toFixed(1);
  }
  assert.ok(contactAt, 'it arrives');
  assert.ok(contactAt > 8 && contactAt < 20,
    `and it takes long enough to be a decision, not a verdict (${contactAt}s)`);

  // There is a beat where you know and it is not there yet.
  const early = stepTakeHunter(armTakeHunter(freshTakeHunter(), {}), 0.1,
    { recording: true, heard: 0.3 });
  assert.equal(early.state.cells, TAKE_HUNTER.startCells, 'the grace holds it off');
}

// ── SILENCE IS THE COUNTERPLAY ───────────────────────────────────────────────
//
// Your voice fetched it; your silence is what sends it away. That is the same
// verb the whole game is about, which is why it is the answer here rather than a
// dodge or a hiding place. An earlier version took `still` — did the player's
// cell change — which during a take is ALWAYS true, since moving spoils the take
// anyway. The parameter was dead and the hunter closed no matter what you did.
{
  const reach = (heard) => {
    let state = armTakeHunter(freshTakeHunter(), {});
    for (let t = 0; t < 90; t += 0.1) {
      const result = stepTakeHunter(state, 0.1, { recording: true, heard });
      state = result.state;
      if (result.contact) return { contact: +(t + 0.1).toFixed(1) };
      if (result.lost) return { lost: +(t + 0.1).toFixed(1) };
    }
    return {};
  };
  // How fast it comes is how loud you are.
  const shout = reach(0.35), fidget = reach(0.12), breath = reach(0.06);
  assert.ok(shout.contact && fidget.contact && breath.contact, 'noise always brings it eventually');
  assert.ok(shout.contact < fidget.contact && fidget.contact < breath.contact,
    `a bare breath must not draw it as fast as a shout (${shout.contact} / ${fidget.contact} / ${breath.contact})`);
  assert.ok(breath.contact > 20, 'and a near-silent take is survivable');

  // Go quiet and it gives ground, then loses you.
  assert.ok(reach(0).lost, 'perfect silence sends it away');

  // But it has to give back what it gained AND hold quiet long enough to mean
  // it. Distance alone was not enough: without the clock, going silent the
  // instant it armed sent it away in three seconds, because it had not closed
  // any ground to give back yet.
  let closed = armTakeHunter(freshTakeHunter(), {});
  for (let t = 0; t < 7; t += 0.1) closed = stepTakeHunter(closed, 0.1, { recording: true, heard: 0.3 }).state;
  let quiet = 0; let lostAt = null;
  for (let t = 0; t < 60 && !lostAt; t += 0.1) {
    const result = stepTakeHunter(quiet ? quiet : closed, 0.1, { recording: true, heard: 0 });
    quiet = result.state;
    if (result.lost) lostAt = +(t + 0.1).toFixed(1);
  }
  assert.ok(lostAt > 12, `shaking it off once it is close costs real time (${lostAt}s)`);
}

// A second sound does not summon a second one. Your own panic brings the one
// you already have closer.
{
  const once = armTakeHunter(freshTakeHunter(), {});
  const twice = armTakeHunter(once, {});
  assert.equal(twice.active, true);
  assert.ok(twice.cells < once.cells, 'the second sound closes the distance');
  assert.equal(twice.startles, 1);
  assert.ok(armTakeHunter(twice, {}).cells >= TAKE_HUNTER.contactCells,
    'but panicking never teleports it onto you');
}

// ── IT CEASES TO EXIST WHEN THE TAKE DOES, HOWEVER THE TAKE ENDS ─────────────
//
// The requirement is "regardless of how it ends" — completed, spoiled, stopped,
// aborted, interrupted by a fight, by a scene, by death. Rather than find every
// exit and remember to tear down in each, existence is a FUNCTION of the take:
// `recording:false` returns the absent state. There is no teardown to forget,
// so there is no exit that can miss one.
{
  let state = armTakeHunter(freshTakeHunter(), { cause: 'scream' });
  for (let t = 0; t < 5; t += 0.1) state = stepTakeHunter(state, 0.1, { recording: true, heard: 0.3 }).state;
  assert.equal(state.active, true, 'it is here');

  const ended = stepTakeHunter(state, 0.1, { recording: false });
  assert.deepEqual(ended.state, freshTakeHunter(), 'and the moment the take stops, it is not');
  assert.equal(ended.ended, true, 'and says so once');
  assert.equal(stepTakeHunter(ended.state, 0.1, { recording: false }).ended, false,
    'and only once');

  // It cannot be armed outside a take either.
  assert.equal(stepTakeHunter(armTakeHunter(freshTakeHunter(), {}), 0.1, { recording: false }).state.active,
    false, 'arming without a take leaves nothing behind');
}

// Pressure for the things the player can feel, without ever printing a distance.
{
  assert.equal(takeHunterPressure(freshTakeHunter()), 0);
  const armed = armTakeHunter(freshTakeHunter(), {});
  assert.ok(takeHunterPressure(armed) < 0.1, 'far off is nearly nothing');
  assert.ok(takeHunterPressure({ ...armed, cells: TAKE_HUNTER.contactCells }) > 0.99,
    'and at contact it is everything');
}

// ── IT IS NOT THE BUILDING'S HUSH, AND NEVER TOUCHES IT ──────────────────────
//
// The presence may already be active and hunting. This must not borrow its body,
// move it, or despawn it.
{
  // Comments stripped: the header explains what this is NOT, which is prose
  // about the presence rather than a call into it.
  const source = readFileSync('src/game/take-hunter.js', 'utf8')
    .split('\n').map((line) => line.replace(/^\s*\/\/.*$/, '')).join('\n');
  assert.doesNotMatch(source, /PRES\.|presence|spawnBehind|despawn/i,
    'the model knows nothing about the presence');

  const main = readFileSync('src/main.js', 'utf8');
  const tick = main.slice(main.indexOf('function tickTakeHunter('),
    main.indexOf('function tickMic('));
  assert.doesNotMatch(tick, /PRES\.[a-z]/i, 'and neither does its wiring');
  assert.match(tick, /HUNTER\.stepTakeHunter/);
  // The tick runs OUTSIDE the isRecording() block, because it is what tears the
  // hunter down and has to run on the frame the take stops.
  const recorder = main.slice(main.indexOf('tickNatatoriumDread(dt);'),
    main.indexOf('const st=REC.tickRecording(dt);'));
  const hunterAt = recorder.indexOf('tickTakeHunter(dt);');
  const guardAt = recorder.indexOf('if(REC.isRecording()){');
  assert.ok(hunterAt >= 0 && hunterAt < guardAt,
    'the hunter ticks before the recording-only block, so a stopped take still tears it down');
}

// And the noise that fetches it comes from the recordist's raw world envelope,
// before spoiling — a step, a dropped case, the radio, or your own voice.
{
  const rec = readFileSync('src/game/recordist.js', 'utf8');
  assert.match(rec, /export function setLoudNoiseSink/,
    'the recordist reports loud noise without knowing what answers it');
  // THE MONITOR TRIP, NOT THE SPOIL. A sink on the spoil threshold is useless:
  // the same noise that fetches something also ends the take, and the take
  // ending is what takes the hunter away — so it arrived and vanished on one
  // frame. Measured, it did exactly that.
  assert.match(rec, /if \(level > worldThreshold \* \.25 && meta\.armsTakeHunter !== false\) loudNoiseSink/,
    'it arms on the raw-world near band, independent of fitted microphone sensitivity');
  // A noise the take already accounted for (it breaking, the hunter arriving)
  // says so, and must not fetch a second hunter on the way out.
  assert.match(rec, /armsTakeHunter = audibleToHush/, 'what the building cannot hear cannot fetch one either');
  assert.match(readFileSync('src/main.js', 'utf8'), /REC\.emitNoise\(0\.6, px, py, reason,\{armsTakeHunter:false\}\)/,
    'the spoil is the HUSH\'s to hear, and fetches no hunter');
  const main = readFileSync('src/main.js', 'utf8');
  assert.match(main, /REC\.setLoudNoiseSink/, 'and main.js is what answers');
  assert.match(main, /if\(REC\.isRecording\(\)\)armTakeHunter\(m>=MIC_LEVEL\.scream/,
    'a scream into the real microphone fetches it too');
}

// ── THE TRANSPORT WARNS BEFORE IT RESISTS STOP ──────────────────────────────
//
// Previously, setting the hunter inside seven cells immediately seized STOP.
// That made a string of startles indistinguishable from dropped input. The
// distance gate now also requires a full, actively presented drag warning.
{
  // No hunter, no resistance: the ordinary stop must stay ordinary.
  const idle = tryCancelTake(freshTakeHunter());
  assert.equal(idle.released, true, 'a take with nothing coming stops on the first press');
  assert.equal(idle.resisted, false);

  // ONLY ONCE IT IS CLOSE. Seizing from the moment it arms made an early,
  // unpanicked stop cost six presses for nothing — the player had done the
  // sensible thing immediately and was punished for it. The clean exit stays
  // clean; it is the LATE one that must not be reliable.
  {
    const armed = armTakeHunter(freshTakeHunter(), { roll: 0.5 });
    assert.ok(armed.cells > TAKE_HUNTER.seizeCells, 'it arms outside the seize range');
    const early = tryCancelTake(armed);
    assert.equal(early.released, true, 'stopping it while it is still far off just works');
    assert.equal(early.resisted, false);
    assert.equal(early.state.cancelTries, 0, 'and an early press is not held against you');

    let close = armed;
    for (let t = 0; t < 9 && close.cells > TAKE_HUNTER.seizeCells; t += 0.1) {
      close = stepTakeHunter(close, 0.1, { recording: true, heard: 0.3 }).state;
    }
    assert.ok(close.cells <= TAKE_HUNTER.seizeCells);
    assert.equal(takeHunterTransport(close).warned, true, 'a natural approach has shown the full warning');
    assert.equal(tryCancelTake(close).resisted, true, 'after that warning a close hunter can seize the transport');
  }

  // A range drawn per arming, so it is never a counted number to learn.
  for (const roll of [0, 0.5, 0.99, 1]) {
    let state = armTakeHunter(freshTakeHunter(), { roll });
    // This represents an approach whose physical warning already completed.
    // Distance alone deliberately no longer establishes seizure.
    state = { ...state, cells: TAKE_HUNTER.seizeCells, warningSeconds: TAKE_HUNTER.dragWarningSeconds };
    assert.ok(state.cancelNeeds >= TAKE_HUNTER.cancelMin && state.cancelNeeds <= TAKE_HUNTER.cancelMax,
      `it takes between ${TAKE_HUNTER.cancelMin} and ${TAKE_HUNTER.cancelMax} presses (${state.cancelNeeds})`);
    let presses = 0;
    for (; presses < 20; presses += 1) {
      const attempt = tryCancelTake(state);
      state = attempt.state;
      if (attempt.released) break;
      assert.equal(attempt.resisted, true, 'each resisted press advances the physical forcing attempt');
      const transport = takeHunterTransport(state);
      assert.equal(transport.tries, presses + 1, 'the instrument can show that the instruction registered');
      assert.equal(transport.remaining, state.cancelNeeds - transport.tries, 'and recovery is bounded');
    }
    assert.equal(presses + 1, state.cancelNeeds, 'it lets go exactly when it said it would');
  }

  // Letting go of the key does not re-roll it. The number is drawn at arming.
  const armed = { ...armTakeHunter(freshTakeHunter(), { roll: 0.99 }), cells: TAKE_HUNTER.seizeCells,
    warningSeconds: TAKE_HUNTER.dragWarningSeconds };
  const once = tryCancelTake(armed).state;
  assert.equal(once.cancelNeeds, armed.cancelNeeds, 'the machine does not change its mind');
  assert.equal(once.cancelTries, 1, 'and it remembers being pressed');
}

// A startle can skip distance, never the active warning interval. Neither a
// large frame nor repeated STOP instructions can manufacture elapsed warning.
{
  let state = armTakeHunter(freshTakeHunter(), { roll: 0 });
  for (let tick = 0; tick < 30; tick += 1) {
    state = stepTakeHunter(state, 0.1, { recording: true, heard: 0.06 }).state;
  }
  assert.ok(state.cells > TAKE_HUNTER.dragCells);
  assert.equal(state.warningSeconds, 0, 'time spent outside the warning range earns no warning credit');
  while (state.cells > TAKE_HUNTER.seizeCells) state = armTakeHunter(state);
  assert.equal(takeHunterTransport(state).phase, 'drag');
  assert.equal(tryCancelTake(state).released, true, 'even a close arrival leaves STOP working before warning');

  const jumped = stepTakeHunter({ ...state, seconds: TAKE_HUNTER.graceSeconds }, 200,
    { recording: true, heard: 0.3 }).state;
  assert.equal(jumped.warningSeconds, 0.25, 'a frame stall cannot skip the warning');
  assert.equal(tryCancelTake(jumped).released, true);

  // Start after the existing approach grace; stay safely above contact while
  // the clock tests the boundary, rather than triggering the contact outcome.
  state = { ...state, seconds: TAKE_HUNTER.graceSeconds, cells: TAKE_HUNTER.seizeCells };
  for (let tick = 0; tick < 23; tick += 1) {
    state = stepTakeHunter(state, 0.1, { recording: true, heard: 0.06 }).state;
    assert.equal(tryCancelTake(state).released, true, 'every STOP works before 2.4 active warning seconds');
  }
  const before = { ...state };
  for (let press = 0; press < 12; press += 1) state = tryCancelTake(state).state;
  state = stepTakeHunter(state, 0, { recording: true, heard: 0.3 }).state;
  assert.equal(state.warningSeconds, before.warningSeconds, 'no simulation tick means no warning progress');
  assert.equal(state.cancelTries, 0, 'unresisted instructions cannot be banked as force presses');

  state = stepTakeHunter(state, 0.1, { recording: true, heard: 0.06 }).state;
  assert.equal(takeHunterTransport(state).phase, 'seized', 'seizure starts only after the whole warning');
  assert.equal(tryCancelTake(state).resisted, true);
}

// Silence releases the machine sooner than it sends the hunter away. It is a
// deliberate alternative to forcing STOP, rather than a required input retry.
{
  let state = { ...armTakeHunter(freshTakeHunter(), { roll: 0.5 }),
    cells: 4, seconds: 9, warningSeconds: TAKE_HUNTER.dragWarningSeconds };
  state = tryCancelTake(state).state;
  const tries = state.cancelTries;
  for (let tick = 0; tick < 17; tick += 1) {
    state = stepTakeHunter(state, 0.1, { recording: true, heard: 0 }).state;
  }
  assert.equal(takeHunterTransport(state).phase, 'seized', 'a momentary pause is not the full recovery');
  state = stepTakeHunter(state, 0.1, { recording: true, heard: 0 }).state;
  const transport = takeHunterTransport(state);
  assert.equal(transport.phase, 'drag');
  assert.equal(transport.quietReleased, true);
  assert.equal(state.active, true, 'the hunter can remain while STOP is free');
  assert.ok(state.cells < TAKE_HUNTER.seizeCells, 'recovery does not depend on reaching safety distance');
  assert.equal(tryCancelTake(state).released, true, 'one STOP now works');
  assert.equal(state.cancelTries, tries, 'silence does not fabricate forcing presses');
}

// A legacy state has no proof that the player saw a warning. It therefore
// keeps a working STOP, even if the old reducer saved it deep inside seizure.
// Presentation is pure and safe before an active state exists.
{
  for (const state of [undefined, null, freshTakeHunter()]) {
    const transport = takeHunterTransport(state);
    assert.equal(transport.phase, 'normal');
    assert.equal(transport.tries, 0);
    assert.equal(transport.needs, 0);
    assert.equal(transport.remaining, 0);
    assert.equal(tryCancelTake(state).released, true);
  }
  const { warningSeconds, ...legacy } = { ...armTakeHunter(freshTakeHunter(), { roll: 0.5 }),
    cells: 3, seconds: 10 };
  const original = { ...legacy };
  assert.equal(takeHunterTransport(legacy).phase, 'drag');
  assert.equal(tryCancelTake(legacy).released, true, 'old distance alone cannot make STOP resist');
  assert.equal(stepTakeHunter(legacy, 0.1, { recording: true, heard: 0.06 }).state.warningSeconds, 0.1,
    'the next active tick starts its warning normally');
  assert.deepEqual(legacy, original, 'presentation and stepping never mutate their input');
}

// Fast repeated sounds used to compress seizure-to-contact to about a second,
// shorter than the bounded STOP forcing route. They can close the distance but
// cannot skip either the warning or the one-shot presented recovery window.
{
  let state = armTakeHunter(freshTakeHunter(), { roll: 1 });
  for (let startle = 0; startle < 12; startle += 1) state = armTakeHunter(state);
  assert.equal(state.cells, TAKE_HUNTER.contactCells);
  assert.equal(state.contactWindowElapsed, null);
  for (let tick = 0; tick < 60 && state.contactWindowElapsed == null; tick += 1) {
    const result = stepTakeHunter(state, 0.1, { recording: true, heard: .3 });
    state = armTakeHunter(result.state);
    assert.equal(result.contact, false, 'startles at contact cannot bypass the pre-seizure warning');
  }
  assert.equal(takeHunterTransport(state).phase, 'seized');
  assert.equal(state.contactWindowElapsed, 0, 'the first presented seizure starts a full window');
  const seeded = { ...state };

  for (let tick = 0; tick < 39; tick += 1) {
    state = armTakeHunter(state);
    const result = stepTakeHunter(state, .1, { recording: true, heard: .3 });
    state = result.state;
    assert.equal(result.contact, false, 'even renewed noise leaves the promised four seconds');
  }
  const caught = stepTakeHunter(armTakeHunter(state), .1, { recording: true, heard: .3 });
  assert.equal(caught.contact, true, 'the fixed window expires rather than granting indefinite protection');

  // Native deliveries were about .3s apart. Allow .75s to recognise the fault,
  // then exercise the maximum eight presses at that cadence against full noise.
  state = seeded;
  const advance = seconds => {
    for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += .15) {
      const result = stepTakeHunter(armTakeHunter(state), .15, { recording: true, heard: .3 });
      state = result.state;
      assert.equal(result.contact, false, 'the force route remains available at the observed native cadence');
    }
  };
  advance(.75);
  let released = false;
  for (let press = 1; press <= TAKE_HUNTER.cancelMax; press += 1) {
    const attempt = tryCancelTake(state);
    state = attempt.state;
    released = attempt.released;
    assert.equal(attempt.tries, press);
    if (released) break;
    advance(.3);
  }
  assert.equal(released, true, 'all eight registered presses can finish before contact');
  assert.ok(state.contactWindowElapsed < TAKE_HUNTER.contactWindowSeconds);
}

// Quiet still releases STOP in 1.8s. It and later startles do not re-seed the
// contact window; freezing presentation supplies dt=0 and cannot spend it.
{
  let state = { ...armTakeHunter(freshTakeHunter(), { roll: .5 }),
    cells: 4, seconds: 9, warningSeconds: TAKE_HUNTER.dragWarningSeconds };
  state = stepTakeHunter(state, .1, { recording: true, heard: .3 }).state;
  assert.equal(state.contactWindowElapsed, 0);
  state = tryCancelTake(state).state;
  for (let tick = 0; tick < 10; tick += 1) {
    state = stepTakeHunter(state, .1, { recording: true, heard: .3 }).state;
  }
  const frozenAt = state.contactWindowElapsed;
  for (let tick = 0; tick < 20; tick += 1) {
    state = stepTakeHunter(state, 0, { recording: true, heard: .3 }).state;
  }
  assert.equal(state.contactWindowElapsed, frozenAt, 'pause and suppressed presentation do not spend the window');
  for (let tick = 0; tick < 18; tick += 1) {
    state = stepTakeHunter(state, .1, { recording: true, heard: 0 }).state;
  }
  assert.equal(takeHunterTransport(state).quietReleased, true);
  assert.equal(tryCancelTake(state).released, true);
  assert.ok(state.contactWindowElapsed > frozenAt + 1.7, 'quiet does not hold the contact clock');
  const beforeStartle = state.contactWindowElapsed;
  state = armTakeHunter(state);
  assert.equal(state.contactWindowElapsed, beforeStartle, 'a startle cannot reset or extend the promise');
  state = stepTakeHunter(state, .1, { recording: true, heard: .3 }).state;
  assert.equal(takeHunterTransport(state).phase, 'seized');
  assert.ok(state.contactWindowElapsed > beforeStartle, 'renewed seizure continues the original clock');
  let contact = false;
  for (let tick = 0; tick < 15 && !contact; tick += 1) {
    const result = stepTakeHunter(armTakeHunter(state), .1, { recording: true, heard: .3 });
    state = result.state;
    contact = result.contact;
  }
  assert.equal(contact, true, 'quiet/startle cycling cannot make a new four-second window');
  assert.deepEqual(stepTakeHunter(state, 0, { recording: false }).state, freshTakeHunter());
}

console.log('take hunter contracts passed');
