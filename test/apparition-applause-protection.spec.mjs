import assert from 'node:assert/strict';
import { createApparitionApplauseAudio } from '../src/audio/apparition-applause-audio.js';
import { APPLAUSE_ASSETS, APPARITION_APPLAUSE_MIX, makeApparitionApplauseScore } from '../src/data/apparition-applause-score.js';
import { createSelfAudioMask, effectiveMicMeasurement } from '../src/audio/self-audio-mask.js';
import { emitAcousticEvent, onAcousticEvent, resetAcousticEventsForTest, setAcousticClock } from '../src/audio/acoustic-events.js';
import { createHushAudioRuntime } from '../src/game/hush-audio-runtime.js';

resetAcousticEventsForTest();
setAcousticClock(() => 1000);
const selfAudioMask = createSelfAudioMask({ latencyMs: 0 });
const received = [], offered = [];
const unsubscribe = onAcousticEvent(event => { received.push(event); selfAudioMask.observe(event, 1000); });
const hush = createHushAudioRuntime({
  presence: { publicSnapshot: () => ({ active: true, position: { x: 5, y: 0 }, roomId: 'hall', floorId: 'g', hasTarget: false }),
    offerSoundTarget: target => { offered.push(target); return true; } },
  playerSpatial: () => ({ position: { x: 0, y: 0 }, roomId: 'hall', floorId: 'g' }),
  difficulty: () => ({ values: { presencePressure: 'standard' } }), settings: () => ({}),
  context: () => ({ allowMischief: false, monitorOpen: true }),
  effects: { applyField() {}, maybeResidue() { return false; }, playMischief() { return false; }, reset() {} },
  clock: () => 1000, random: () => 1,
});
const parameter = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} });
const node = () => ({ gain: parameter(), pan: parameter(), playbackRate: parameter(), connect() {}, disconnect() {}, start() {}, stop() {} });
const ctx = { currentTime: 10, state: 'running', sampleRate: 48000, destination: {}, createGain: node, createStereoPanner: node,
  createConvolver: node, createBufferSource: node, decodeAudioData: async bytes => ({ duration: new Float64Array(bytes)[0], sampleRate: 48000, numberOfChannels: 1 }) };
const sourceByUrl = new Map([...Object.values(APPLAUSE_ASSETS.sources), ...Object.values(APPLAUSE_ASSETS.impulses)].map(asset => [asset.url, asset]));
const audio = createApparitionApplauseAudio({ getAudio: () => ({ ctx, destination: ctx.destination }), emitAcoustic: emitAcousticEvent,
  fetchAsset: async url => ({ ok: true, arrayBuffer: async () => new Float64Array([sourceByUrl.get(url).duration]).buffer }),
  setTimer: () => 1, clearTimer() {},
});
assert.equal((await audio.preload(APPLAUSE_ASSETS)).ready, true);
const beforeInterest = hush.currentAudition().interest;
assert.equal(audio.play({ id: 'protection-cue', sourceId: 'apparition-audience', spatial: { roomId: 'hall', floorId: 'g' }, acoustic: { levelDb: -24 } },
  { score: makeApparitionApplauseScore('treatment'), listener: { x: 0, y: 6, yaw: 0 } }), true);
assert.equal(received.length, 1);
const applause = received[0];
assert.ok(applause.acoustic.durationMs >= APPARITION_APPLAUSE_MIX.conditions.treatment.tailEndSeconds * 1000, 'the reference covers the final measured tail');
assert.equal(applause.source.kind, 'environment');
for (const flag of ['playerGenerated', 'audibleToHush', 'audibleToMonitor', 'canSpoilTake', 'canBeMimicked']) assert.equal(applause.semantics[flag], false, flag);
assert.equal(offered.length, 0, 'actual HUSH runtime does not receive a target from the environmental cue');
assert.equal(hush.currentAudition().interest, beforeInterest, 'applause does not increase HUSH audition');

// A distinct, quiet world source and actual program reference continue while
// the applause graph is cancelled. Neither may be erased by the cancellation.
selfAudioMask.observe({ id: 'other-output', emittedAt: 1000, source: { kind: 'environment', id: 'apparition-audience-extra' },
  acoustic: { durationMs: 8000, levelDb: -64 }, semantics: { audibleInWorld: true } }, 1000);
const programSpectrum = [.9, .72, .46, .24, .12, .06, .03, .01];
const voiceSpectrum = [.01, .03, .08, .28, .75, .92, .42, .12];
const before = selfAudioMask.sample(1100, { program: { active: true, rms: .02, peak: .035, spectrum: programSpectrum } });
const quietVoice = { rms: .04, peak: .07, spectrum: voiceSpectrum };
assert.equal(effectiveMicMeasurement(quietVoice, before).playerNoiseLikely, false, 'a stale long envelope would conceal this voice');
assert.equal(audio.cancel('pause'), 5);
assert.equal(selfAudioMask.forgetSource('apparition-audience'), 1);
const after = selfAudioMask.sample(1100);
assert.equal(after.count, 1, 'source cancellation matches the whole id, not its prefix');
assert.ok(after.eventRms > 0 && after.eventRms < before.eventRms, 'the other world-source envelope survives');
assert.equal(after.programActive, true);
assert.equal(after.programRms, before.programRms);
assert.deepEqual(after.programSpectrum, programSpectrum, 'the measured program spectrum survives cue cancellation');
const revealedVoice = effectiveMicMeasurement(quietVoice, after);
assert.equal(revealedVoice.mask.programCorrelated, false);
assert.equal(revealedVoice.playerNoiseLikely, true, 'a real spectrally distinct voice is observable immediately after cancellation');
assert.ok(revealedVoice.effective.rms > .03);
const speakerReturn = effectiveMicMeasurement({ rms: .025, peak: .04, spectrum: programSpectrum.map(value => value * .2) }, after);
assert.equal(speakerReturn.mask.programCorrelated, true, 'spectral protection for other actual game output remains');
assert.ok(speakerReturn.effective.rms < .003);
assert.equal(selfAudioMask.forgetSource('apparition-audience'), 0);
assert.equal(selfAudioMask.forgetSource(null), 0);
assert.equal(selfAudioMask.sample(1100).count, 1);
audio.dispose(); hush.destroy(); unsubscribe(); resetAcousticEventsForTest();
console.log('apparition applause cancellation/protection tests ok');
