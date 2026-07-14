import assert from 'node:assert/strict';
import { computeFearPressure } from '../src/game/fear-pressure.js';

const quiet = computeFearPressure();
assert.equal(quiet.heartbeat, 0);
assert.equal(quiet.tapeHiss, 0);
assert.equal(quiet.monitorHiss, 0);
assert.equal(quiet.visualDread, 0);

const recording = computeFearPressure({ recording: true, recordingProgress: .5 });
assert.equal(recording.inputs.take, .5);
assert.ok(recording.tapeHiss > .49 && recording.tapeHiss < .51);
assert.ok(recording.monitorHiss > .30 && recording.monitorHiss < .32);
assert.equal(recording.heartbeat, 0, 'recording hiss does not create heartbeat by itself');

const field = {
  absorption: { audio: .7, monitor: .8, light: .6 },
  presentation: { audio: .5, monitor: .65, light: .4 },
};
const hush = computeFearPressure({
  fear: .22,
  recording: true,
  recordingProgress: .62,
  hushField: field,
  hushAudition: { interest: .7, certainty: .5, agitation: .4, pressure: { recentEnergy: .6, impulsiveNoise: .2 } },
});
assert.equal(hush.inputs.hushMonitor, .65);
assert.ok(hush.heartbeat > .22, 'near HUSH raises bodily pressure modestly');
assert.ok(hush.tapeHiss > recording.tapeHiss, 'HUSH pressure roughens an active take');
assert.ok(hush.tapeHiss < 1, 'secondary pressure remains bounded');
assert.ok(hush.mapDisturbance > .45, 'map disturbance reflects acoustic evidence');

const personal = computeFearPressure({
  recording: true,
  recordingProgress: .9,
  personalInterference: true,
  radio: { dead: true, dropped: true },
});
assert.equal(personal.tapeHiss, 1, 'late-take plus interference may saturate the tape, but only through the reducer');
assert.ok(personal.heartbeat <= .11, 'personal interference does not impersonate a full threat meter');

const clamp = computeFearPressure({
  fear: 10,
  recording: true,
  recordingProgress: 10,
  hushField: { absorption: { audio: 10, monitor: 10, light: 10 } },
  hushAudition: { interest: 10, certainty: 10, agitation: 10, pressure: { recentEnergy: 10, impulsiveNoise: 10 } },
  personalInterference: true,
  radio: { dead: true, dropped: true },
});
for (const [key, value] of Object.entries(clamp)) {
  if (key === 'inputs') continue;
  assert.ok(value >= 0 && value <= 1, `${key} is clamped`);
}

console.log('fear pressure tests ok');

