import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as scenes from '../src/game/scenes.js';
import { RECORDER_KEY, makeRecorderScene, recorderKeys } from '../src/game/recorder-scene.js';
import { TRANSPORT, recorderPanelRect } from '../src/render/recorder-view.js';

// ── WHAT THE MACHINE WILL ACCEPT ─────────────────────────────────────────────
//
// Pure, so the panel and the key handler can never disagree about which key is
// live: they read the same function.
{
  const idle = recorderKeys({ playableHere: true, tapes: 2 });
  assert.deepEqual(idle.map((k) => k.id), [RECORDER_KEY.REC, RECORDER_KEY.PLAY, RECORDER_KEY.TAKES]);
  assert.ok(idle.every((k) => k.enabled), 'with a tape here and tapes on the machine, all three are live');

  const refused = recorderKeys({ refusal: { reason: 'STUDIO B3 FIRST' }, playableHere: false, tapes: 0 });
  assert.equal(refused[0].enabled, false, 'REC goes dark when the game would refuse the take');
  assert.equal(refused[0].reason, 'STUDIO B3 FIRST',
    'and it says why, on the panel, instead of speaking a line');
  assert.equal(refused[1].enabled, false, 'nothing on tape in this room');
  assert.equal(refused[2].enabled, false, 'and no tapes to browse');

  const warned = recorderKeys({ refusal: { reason: 'MAINS IN THE CANS', allow: true } });
  assert.equal(warned[0].enabled, true, 'an authored warning can leave REC available for deliberate confirmation');

  // Rolling, the only thing you can do is stop — and stop must never be two
  // keystrokes away.
  assert.deepEqual(recorderKeys({ recording: true }).map((k) => k.id), [RECORDER_KEY.STOP]);
  assert.deepEqual(recorderKeys({ recording: true, stalled: true }).map((k) => k.id),
    [RECORDER_KEY.RESUME, RECORDER_KEY.STOP]);
  assert.deepEqual(recorderKeys({ playing: true }).map((k) => k.id), [RECORDER_KEY.STOP]);
}

// The authored LISTEN tree is a transport state of this scene. It does not
// push a generic thought modal, and a committed guide cannot be dismissed
// between the setup instruction and ROLL.
{
  let rolled = 0;
  const scene = makeRecorderScene({
    getState: () => ({ playableHere: false }),
    getTakes: () => [],
    onRecord: ({ beginGuide }) => beginGuide({
      id: 'b3-pre-roll',
      nodes: { start: { lines: [{ who: 'direction', text: 'Kill the light and roll.' }] } },
      onDone: () => { rolled += 1; },
    }),
  });
  scenes.push(scene);
  scene.key({ key: 'Enter', code: 'Enter' });
  assert.equal(scene.debugState().guide?.id, 'b3-pre-roll');
  scene.key({ key: 'r', code: 'KeyR' });
  assert.equal(scenes.has('recorder'), true, 'R cannot abandon a committed pre-roll');
  scene.update(2);
  scene.key({ key: 'Enter', code: 'Enter' });
  assert.equal(rolled, 1);
  assert.equal(scenes.has('recorder'), false, 'completion returns the machine to the recording lifecycle');
}

// ── THE SCENE ────────────────────────────────────────────────────────────────
const tapes = [
  { roomId: 'main_b3', ordinal: '01', label: 'STUDIO B3', playable: true, warn: false, status: 'PLAY' },
  { roomId: 'the_tub', ordinal: '02', label: 'THE TUB', playable: false, warn: true, status: 'NO PRINT' },
];

function harness(state = {}) {
  const calls = { record: 0, play: [], stop: 0, closed: 0 };
  const scene = makeRecorderScene({
    getState: () => ({ playableHere: true, ...state }),
    getTakes: () => tapes,
    onRecord: () => { calls.record += 1; },
    onPlay: (roomId) => calls.play.push(roomId),
    onStopPlayback: () => { calls.stop += 1; },
    onClose: () => { calls.closed += 1; },
  });
  return { scene, calls };
}

// The two flags that are not preferences. A blocking scene would freeze the
// take clock, noise decay, the presence and the microphone — all of which live
// inside `if(!scenes.blocksWorld())` in the frame loop — and holding a recorder
// up is not a pause.
{
  const { scene } = harness();
  assert.equal(scene.blocksWorld, false, 'the room carries on while the machine is out');
  assert.equal(scene.blocksInput, true, 'but you do not walk while working the transport');
  assert.equal(scene.suppressesHud, true, 'the machine draws the transport, so the HUD must not draw it too');
}

// REC is under the cursor when it opens, so the old muscle memory still lands.
{
  const { scene, calls } = harness();
  assert.equal(scene.debugState().selectedKey, RECORDER_KEY.REC);
  scenes.push(scene);
  scene.key({ key: 'Enter', code: 'Enter' });
  assert.equal(calls.record, 1, '[R] then ENTER is still a take');
  assert.equal(calls.closed, 1, 'and rolling puts the machine away');
  scenes.remove(scene);
}

// A dark key says why and does nothing.
{
  const { scene, calls } = harness({ refusal: { reason: 'THIS ROOM IS ON TAPE' } });
  scenes.push(scene);
  scene.key({ key: 'Enter', code: 'Enter' });
  assert.equal(calls.record, 0, 'a refused REC does not reach the game verb');
  assert.equal(scene.debugState().notice, 'THIS ROOM IS ON TAPE', 'it repeats the reason instead');
  scenes.remove(scene);
}

// Browsing, and playing a chosen tape — the thing that was unreachable before,
// because playback was hardwired to the room the player was standing in.
{
  const { scene, calls } = harness();
  scenes.push(scene);
  scene.key({ key: 'ArrowDown', code: 'ArrowDown' });
  scene.key({ key: 'ArrowDown', code: 'ArrowDown' });
  assert.equal(scene.debugState().selectedKey, RECORDER_KEY.TAKES);
  scene.key({ key: 'Enter', code: 'Enter' });
  assert.equal(scene.debugState().browsing, true);
  scene.key({ key: 'Enter', code: 'Enter' });
  assert.deepEqual(calls.play, ['main_b3'], 'a tape is played by name, not by where you are standing');

  scene.key({ key: 'Enter', code: 'Enter' });   // re-open the list
  scene.key({ key: 'ArrowDown', code: 'ArrowDown' });
  scene.key({ key: 'Enter', code: 'Enter' });
  assert.deepEqual(calls.play, ['main_b3'], 'a tape with no print is not offered');
  assert.equal(scene.debugState().notice, 'NO PRINT');
  scenes.remove(scene);
}

// [R] puts it away again, and closing removes THIS scene rather than whatever
// happens to be on top — the same contract the bag has.
{
  const { scene, calls } = harness();
  scenes.push(scene);
  assert.equal(scene.key({ key: 'r', code: 'KeyR' }), true);
  assert.equal(calls.closed, 1);
  assert.equal(scenes.has('recorder'), false);
}
{
  const source = readFileSync('src/game/recorder-scene.js', 'utf8');
  const close = source.slice(source.indexOf('function close('), source.indexOf('function activate('));
  assert.match(close, /scenes\.remove\(scene\)/, 'close removes the recorder scene by reference');
  assert.doesNotMatch(close, /scenes\.pop\(\)/, 'and never pops an unrelated overlay');
}

// ── ONE FACE ─────────────────────────────────────────────────────────────────
//
// Every transport state is a state OF THE MACHINE. The mic check was the last
// holdout: its own chassis, its own wordmark, dead centre — which said that
// testing the mic was a different activity from working the recorder, when it
// is the same machine with a different meter in front of it.
{
  const source = readFileSync('src/render/recorder-view.js', 'utf8');
  for (const mode of Object.values(TRANSPORT)) {
    const label = source.match(new RegExp(`\\[TRANSPORT\\.${mode.toUpperCase()}\\]:\\s*'([^']+)'`));
    assert.ok(label, `${mode} has a panel label, or the header falls back to RECORD and lies`);
  }
  assert.ok(Object.values(TRANSPORT).includes('check'), 'the mic check is a transport state');

  // The mic check draws through the same rect as every other state, so it is
  // low and off-centre like the rest of the machine. Centre screen is where the
  // recording hallucinations are staged.
  const rect = recorderPanelRect({ cols: 120, rows: 40, rowsNeeded: 4 });
  assert.ok(rect.y > 40 / 2, 'the machine sits in the lower half, whatever it is showing');
  assert.ok(rect.y + rect.h <= 40, 'and inside the screen');
}

// The mic check is drawn by the machine, not by a panel of its own.
{
  const main = readFileSync('src/main.js', 'utf8');
  const overlay = main.slice(main.indexOf('function drawMicTestOverlay('),
    main.indexOf('function firstTakeIntercept('));
  assert.match(overlay, /drawRecorderFace/, 'the mic check draws the DA-1000');
  assert.match(overlay, /TRANSPORT\.CHECK/);
  assert.doesNotMatch(overlay, /drawMachinePanel/, 'and never builds a second chassis');
  assert.match(overlay, /NOTHING IS RECORDING\. NOTHING IS KEPT\./,
    'the promise stays on the panel: this is a meter, not a take, and it is not saved');
}

// First R always produces the machine. The level-check and first-take trees
// are selected only from the machine's REC verb.
{
  const main = readFileSync('src/main.js', 'utf8');
  const rHandler = main.slice(main.indexOf("if(bare && is('KeyR','r'))"),
    main.indexOf("if(bare && (e.code==='Space'", main.indexOf("if(bare && is('KeyR','r'))")));
  assert.match(rHandler, /openRecorder\(\)/);
  assert.doesNotMatch(rHandler, /firstTakeIntercept\(\)/);
  assert.match(main, /onRecord:\(\{beginGuide\}=\{\}\)=>\{ if\(!firstTakeIntercept\(\{beginGuide\}\)\) recordAction\(\{beginGuide\}\); \}/,
    'REC, not the global R handler, owns setup and LISTEN selection');
}

console.log('recorder scene contracts passed');
