import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync('src/main.js', 'utf8');

// ── THE CONCERT HALL FIGHT COULD NOT START ───────────────────────────────────
//
// `maybeBattle` fires the take-two encounter at takeProgress >= 0.18, which on a
// forty-five second take is 8.1 seconds. Just before openEncounterBattle it
// recorded a story spine whose payload used the SHORTHAND `roomId` — and the
// variable in that function is `room`. So it threw a ReferenceError before the
// fight was ever opened, every frame, from 8.1s onward.
//
// The same slip sat in playbackGuest's first-reference spine.
{
  const spine = main.slice(main.indexOf("recordStorySpine('spine:second-recording'"),
    main.indexOf("openEncounterBattle('recording-2'"));
  assert.match(spine, /roomId:room/, 'the take-two spine names the variable that exists');
  assert.doesNotMatch(spine, /[{,]\s*roomId\s*[,}]/,
    'and never the shorthand, which named nothing and threw');

  const reference = main.slice(main.indexOf("recordStorySpine('spine:first-reference'"),
    main.indexOf("SPEECH.say(LINES.guest)"));
  assert.match(reference, /roomId:room/, 'the first-reference spine likewise');
  assert.doesNotMatch(reference, /kind:'exact-reference-return',\s*roomId\s*,/,
    'the shorthand is gone from the playback path too');
}

// ── AND WHY NOBODY COULD SEE IT ──────────────────────────────────────────────
//
// The frame loop caught the error, logged `loop error`, and pushed "runtime
// fault recovered" — EVERY FRAME. Sixty identical lines a second, an event log
// claiming recovery, and a fight that simply never happened.
//
// Surviving the frame is still right; a black screen is worse than a
// half-working one. Saying it once, loudly, with a count, is the difference
// between a bug you can find and one you cannot.
{
  assert.doesNotMatch(main, /pushEvent\('\/\/ runtime fault recovered\.'\)/,
    'the loop no longer claims to have recovered from something it repeats');
  assert.match(main, /function noteLoopFault\(err\)/);
  const note = main.slice(main.indexOf('function noteLoopFault(err)'),
    main.indexOf('function loop()'));
  assert.match(note, /loopFaults/, 'distinct faults are remembered');
  assert.match(note, /seen\.count\s*\+=\s*1/, 'and repeats are counted, not reprinted');
  assert.match(note, /LOOP FAULT/, 'the first one is loud');
}

// The hall keeps its recording-2 slot. Only the natatorium was moved off the
// recording battles, onto its own proximity trigger.
{
  const map = main.slice(main.indexOf('const RECORDING_BATTLES='),
    main.indexOf('function battleForRoom'));
  assert.match(map, /amplifications:hallBattle/, 'the concert hall is still a recording battle');
  assert.match(map, /soundnoisemusic:practiceBattle/);
  assert.doesNotMatch(map, /the_tub/, 'and the natatorium is still not');
}

console.log('hall encounter contracts passed');
