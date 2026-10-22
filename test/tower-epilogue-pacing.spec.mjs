import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as scenes from '../src/game/scenes.js';
import { makeColdOpenScene } from '../src/game/coldopen.js';
import { getSave } from '../src/game/save.js';
import { flagTest } from '../src/game/flags.js';
import { rehydrateTree } from '../src/narrative/runtime-content.js';
import { playTowerPersonalRecording, TOWER_PERSONAL_SECONDS } from '../src/audio/tower-personal-recording.js';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const document = JSON.parse(readFileSync(new URL('../content/narrative/ending.epilogue.tower-won.story.json', import.meta.url), 'utf8'));
function block(start, end) {
  const from = main.indexOf(start), to = main.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `missing production block ${start}`);
  return main.slice(from, to);
}

function audioContext() {
  const sources = [];
  return {
    currentTime: 100, state: 'running', sampleRate: 100, destination: {}, sources,
    advance(seconds) { if (this.state === 'running') this.currentTime += seconds; },
    createBuffer(channels, frames) {
      const data = Array.from({ length: channels }, () => new Float32Array(frames));
      return { getChannelData: (channel) => data[channel] };
    },
    createBufferSource() {
      const source = { connects: [], stops: 0, connect(out) { this.connects.push(out); },
        disconnect() {}, start(...args) { this.startArgs = args; }, stop() { this.stops += 1; } };
      sources.push(source); return source;
    },
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; },
  };
}

function harness({ context = audioContext(), complete = true, replayId = 'guard-epilogue:tower-won' } = {}) {
  scenes.clear(); getSave().flags['station.recordist.complete'] = complete;
  const draws = [];
  let completed = 0;
  const factory = new Function('scenes', 'makeColdOpenScene', 'playTowerPersonalRecording', 'TOWER_PERSONAL_SECONDS', 'flagTest', 'context', 'draws', `
    let towerEndingPlayback=null,paused=false;
    const actx=context,sfxGain=context?.createGain(),master=null,dialogGain=null,sfxDirectGain=null,musicGain=null,whisperBed=null;
    const noOp=()=>{},ensureCtx=noOp,STORY={},fireCue=noOp,CR={fx:{}},createReplayService=()=>null;
    const endingCutsceneWorldView=noOp,applyStoryChoice=noOp,advanceActiveEndingCutscene=noOp,cancelApparitionApplause=noOp;
    const uiSize=()=>({cols:100,rows:40}),uiText=(...args)=>draws.push(args);
    const syncPointerMode=noOp,saveSourceView=noOp,outskirtsStreetAudio=null,pauseOutskirtsLastLight=noOp,lowerTowerPersonalRecorder=noOp;
    const bellPealPerformance=null,towerBellDirector=null,personalWindowEffects={},windowChoreography={};
    const resetMotionInput=noOp,stopAllVoices=noOp,stopWorldLayerVoice=noOp,silenceAmbientDrone=noOp,setGainNode=noOp,pushEvent=noOp;
    const applyAudioSettings=noOp,startAmbientDroneAt=noOp,currentAmbientTarget=noOp,updateAudio=noOp,resumeGameplayInput=noOp,stopTowerPersonalWorldSignal=noOp;
    ${block('function presentFinale(content,', 'function finaleHasFork()')}
    ${block('function noteEndingCutsceneLine(documentId,line){', 'function endingActionKeyMatches(')}
    ${block('function setGameplayPaused(next,', 'function togglePause()')}
    return {presentFinale,noteEndingCutsceneLine,towerEndingRecordingRemaining,setGameplayPaused,handle:()=>towerEndingPlayback};
  `);
  const api = factory(scenes, makeColdOpenScene, playTowerPersonalRecording, TOWER_PERSONAL_SECONDS, flagTest, context, draws);
  // The real adapter supplies sourceId and flag conditions. Voice is disabled
  // only for this headless transcript; the retained take uses its actual PCM.
  const lines = rehydrateTree(document).start.lines.map((line) => ({ ...line, voice: false }));
  api.presentFinale(lines, { replayId,
    onLine: (line) => api.noteEndingCutsceneLine(document.id, line),
    onDone: () => { api.handle()?.stop(); completed += 1; },
  });
  return { api, context, draws, scene: scenes.top(), get completed() { return completed; } };
}
function confirm(h, key = 'Enter') { h.scene.key({ key }); }
function advanceLine(h) { h.scene.update(.3); confirm(h); confirm(h); }
function reach(h, id) {
  for (let safety = 0; safety < 20 && h.scene.view().lineSourceId !== id; safety += 1) advanceLine(h);
  assert.equal(h.scene.view().lineSourceId, id);
}

test('fast confirmation reveals the guard recognition but credits wait for the complete actual take', () => {
  const h = harness();
  try {
    reach(h, 'start.line.9');
    assert.equal(h.context.sources.length, 1);
    assert.deepEqual(h.context.sources[0].startArgs, [100, 0]);
    advanceLine(h);
    assert.equal(h.scene.view().lineSourceId, 'start.line.10');
    assert.equal(h.scene.view().typing, true);
    confirm(h);
    assert.equal(h.scene.view().typing, false, 'the hold must still permit tap-to-reveal');
    h.scene.update(.3);
    for (const key of ['Enter', ' ', 'z']) confirm(h, key);
    assert.equal(h.completed, 0);
    h.scene.render();
    assert.match(h.draws.at(-1)[2], /^LISTENING · 14s$/);
    for (const time of [3.1, 7.4, 11.7, 13.99]) {
      h.context.currentTime = 100 + time;
      confirm(h);
      assert.equal(h.completed, 0, `credits cut the take at ${time}s`);
    }
    h.context.currentTime = 114;
    confirm(h);
    assert.equal(h.completed, 1);
    assert.equal(h.context.sources[0].stops, 1);
    assert.equal(scenes.depth(), 0);
  } finally { scenes.clear(); }
});

test('gameplay pause preserves unheard audio and resumes the same PCM at its saved offset', () => {
  const h = harness();
  try {
    reach(h, 'start.line.10'); h.scene.update(.3); confirm(h);
    h.context.advance(5.5);
    h.api.setGameplayPaused(true, { announce: false });
    assert.equal(h.context.sources[0].stops, 1);
    assert.equal(h.api.towerEndingRecordingRemaining(), 8.5);
    h.api.setGameplayPaused(true, { announce: false });
    h.context.advance(30);
    assert.equal(h.api.towerEndingRecordingRemaining(), 8.5, 'muted time must not count as listening');
    confirm(h);
    assert.equal(h.completed, 0);
    h.api.setGameplayPaused(false, { announce: false });
    assert.equal(h.context.sources.length, 2);
    assert.deepEqual(h.context.sources[1].startArgs, [135.5, 5.5]);
    assert.equal(h.context.sources[1].buffer, h.context.sources[0].buffer, 'resume changed the recorded material');
    h.context.advance(8.49); confirm(h);
    assert.equal(h.completed, 0);
    h.context.advance(.02); confirm(h);
    assert.equal(h.completed, 1);
    h.api.setGameplayPaused(true, { announce: false });
    h.api.setGameplayPaused(false, { announce: false });
    assert.equal(h.context.sources.length, 2, 'a finished take must not start again after pause');
  } finally { scenes.clear(); }
});

test('AudioContext suspension freezes the listening gate without inventing playback progress', () => {
  const h = harness();
  try {
    reach(h, 'start.line.10'); h.scene.update(.3); confirm(h);
    h.context.advance(7); h.context.state = 'suspended';
    h.context.advance(60); h.scene.update(60); confirm(h);
    assert.equal(h.api.towerEndingRecordingRemaining(), 7);
    assert.equal(h.completed, 0);
    h.context.state = 'running'; h.context.advance(7); confirm(h);
    assert.equal(h.completed, 1);
  } finally { scenes.clear(); }
});

test('unavailable playback does not strand the epilogue and an unearned take never plays', () => {
  const unavailable = harness({ context: null });
  try {
    reach(unavailable, 'start.line.10'); advanceLine(unavailable);
    assert.equal(unavailable.api.towerEndingRecordingRemaining(), 0);
    assert.equal(unavailable.completed, 1);
  } finally { scenes.clear(); }
  const unearned = harness({ complete: false });
  try {
    reach(unearned, 'start.line.8'); advanceLine(unearned);
    assert.equal(unearned.completed, 1);
    assert.equal(unearned.context.sources.length, 0);
    assert.equal(unearned.api.towerEndingRecordingRemaining(), 0);
  } finally { scenes.clear(); }
});
