import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as scenes from '../src/game/scenes.js';
import { makeRecorderScene, recorderControlState, RECORDER_KEY } from '../src/game/recorder-scene.js';
import { drawRecorderFace, recorderButtons, recorderControlRegions, recorderHitRegions, recorderInstrumentLayout, recorderPanelRect, recorderTranscriptRect, recordingOverlayButtons, TRANSPORT } from '../src/render/recorder-view.js';
import { machinePanelBody } from '../src/render/presentation.js';
import { controlMechanicsSnapshot, cancelControlScope } from '../src/game/control-mechanics.js';

const press = (scene, region, type = 'pointerdown', pointerId = 7) => scene.pointer({
  type, pointerId, cellX: region.x + region.w / 2, cellY: region.y + region.h / 2,
});
const takes = [{ roomId: 'main_b3', label: 'STUDIO B3', playable: true, ordinal: '01', status: 'PLAY' }];

test('every recorder transport returns the same physical body beneath its completed glass cover', () => {
  assert.equal(drawRecorderFace(), null);
  for (const width of [38, 66]) {
    const rect = { x: 4, y: 3, w: width, h: 21, compact: width < 52 };
    const expected = machinePanelBody(rect.x, rect.y, rect.w, rect.h, { footer: 'CONTROLS' });
    for (const mode of Object.values(TRANSPORT)) {
      const view = { rect, mode, counter: '03:24', footer: 'CONTROLS', rows: takes,
        buttons: recordingOverlayButtons({ rolling: mode === TRANSPORT.RECORD }),
        guide: { pending: { kind: 'branch', index: 0, options: [{ text: 'ROLL SOUND' }] } } };
      const hits = recorderHitRegions(view);
      assert.deepEqual(drawRecorderFace(view), expected, `${mode}/${width}: no early transport return skips the panel result`);
      assert.deepEqual(recorderHitRegions(view), hits, `${mode}/${width}: material rendering never moves hit targets`);
    }
  }
});
function harness(extra = {}) {
  const calls = [];
  const scene = makeRecorderScene({
    getState: () => ({ playableHere: true }), getTakes: () => takes,
    onPlay: (id) => calls.push(['play', id]), onRecord: () => calls.push(['record']),
    ...extra,
  });
  scenes.push(scene);
  scene.render();
  return { scene, calls, regions: () => scene.debugState().hitRegions };
}

test('raising the recorder releases first-person look without pausing the room', () => {
  const { scene } = harness();
  assert.equal(scene.blocksInput, true);
  assert.equal(scene.allowsLook, false, 'the machine needs a free pointer, not captured mouse look');
  assert.equal(scene.blocksWorld, false, 'recording, noise decay and the hunter keep running');
  scenes.remove(scene);
});

test('holding R cannot close the newly raised recorder; a fresh press still closes', () => {
  const { scene } = harness();
  scene.key({ key: 'r', code: 'KeyR', repeat: true });
  assert.equal(scenes.has('recorder'), true, 'the opening key repeat is not a second activation');
  scene.keyup({ key: 'r', code: 'KeyR' });
  scene.key({ key: 'r', code: 'KeyR', repeat: false });
  assert.equal(scenes.has('recorder'), false);
});

test('recorder close never arms the unrelated B-release gate and global R rejects repeat before activation', () => {
  const main = readFileSync('src/main.js', 'utf8');
  const open = main.slice(main.indexOf('function openRecorder(){'), main.indexOf('function recorderMachineState(){'));
  assert.match(open, /onClearInput:\(\)=>\{ resetMotionInput\('recorder-close',\{stopRenderMove:true\}\); \}/);
  assert.doesNotMatch(open, /suppressBagReopenUntilRelease/, 'the first B after recorder close must remain available');
  const start = main.indexOf("if(bare && is('KeyR','r')){");
  const handler = main.slice(start, main.indexOf("if(bare && (e.code==='Space'", start));
  assert.ok(handler.indexOf('if(e.repeat)return;') > 0);
  assert.ok(handler.indexOf('if(e.repeat)return;') < handler.indexOf('recordAction()'));
  assert.ok(handler.indexOf('if(e.repeat)return;') < handler.indexOf('openRecorder()'));
});

test('recorder focus cannot power lamps; actual transport owns lamp and latch', () => {
  for (const id of Object.values(RECORDER_KEY)) {
    assert.equal(recorderControlState(id, { selected: true, focused: true }).lit, false);
  }
  assert.deepEqual(recorderControlState('rec', { recording: true }), {
    controlId: 'recorder:rec', lit: true, latched: true, color: 'red',
  });
  assert.equal(recorderControlState('play', { playing: true }).latched, true);
  assert.equal(recorderControlState('takes', { browsing: true }).lit, true);
  assert.equal(recorderControlState('stop', { recording: true }).latched, false);
});

test('pointer targets remain on the transport housings as the cap travels', () => {
  assert.deepEqual(recorderControlRegions({ x: 10, y: 20, w: 66, h: 16 }, {
    w: 6, keys: [{ id: 'rec', controlId: 'recorder:rec' }, { id: 'play', enabled: false }],
  }), [
    { kind: 'transport', id: 'rec', index: 0, controlId: 'recorder:rec', x: 63, y: 23, w: 9, h: 1.6, enabled: true },
    { kind: 'transport', id: 'play', index: 1, controlId: 'recorder:play', x: 63, y: 25, w: 9, h: 1.6, enabled: false },
  ]);
});

test('wide and narrow transport labels retain real cap width without crowding instruments', () => {
  for (const width of [38, 44, 46, 52, 60, 66]) {
    for (const meter of [null, { db: -36 }]) {
      const rect = { x: 4, y: 3, w: width, h: 16, compact: width < 52 };
      const buttons = recorderButtons(rect, { w: 6, keys: [{ id: 'rec' }, { id: 'stop' }] });
      const body = machinePanelBody(rect.x, rect.y, rect.w, rect.h, { footer: 'CONTROLS' });
      const layout = recorderInstrumentLayout(body, { compact: rect.compact, buttons, levels: { left: .4, right: .5 }, meter });
      const [control] = recorderControlRegions(rect, buttons);
      assert.ok(control.w >= 7, `${width}: cap is at least 56 logical pixels at native UI scale`);
      assert.ok(body.x + layout.usableW < control.x, `${width}: display remains before transport`);
      assert.ok(layout.bayX + layout.bayW <= body.x + layout.usableW, `${width}: reel bay stays inside display`);
      assert.ok(layout.bayW > 0 && layout.counterW > 0);
      if (layout.channelsW) assert.ok(layout.bayX + layout.bayW < layout.channelsX, 'stereo meters never overprint reels');
    }
  }
});

test('live recording uses the same transport geometry and stable mechanical identities', () => {
  const config = recordingOverlayButtons({ rolling: true });
  assert.equal(config.keys[0].controlId, 'recording:rec');
  assert.equal(config.keys[0].lit, true);
  assert.equal(config.keys[0].latched, true);
  assert.equal(config.keys[1].id, 'stop');
  assert.equal(recordingOverlayButtons({ held: true }).keys[0].label, 'HOLD');
  assert.equal(recordingOverlayButtons({ held: true }).keys[0].lit, false);
  const [rec, stop] = recorderControlRegions({ x: 0, y: 0, w: 66 }, config);
  assert.equal(rec.w, 9);
  assert.equal(stop.y - rec.y, 2);
});

test('recorder transport is actually clickable with immediate activation and release/cancel cleanup', () => {
  const { scene, calls, regions } = harness();
  const play = regions().find((region) => region.id === 'play');
  press(scene, play);
  assert.deepEqual(calls, [['play', null]], 'pointer down reaches the existing verb without waiting for animation');
  assert.ok(controlMechanicsSnapshot().ids.includes('recorder:play'));
  press(scene, play, 'pointerup');
  press(scene, play, 'pointercancel');
  scenes.remove(scene);
  assert.ok(!controlMechanicsSnapshot().ids.some((id) => id.startsWith('recorder:')));
});

test('pointer hover selects without activating; refused keys preserve the refusal', () => {
  const { scene, calls, regions } = harness({ getState: () => ({ refusal: { reason: 'ROOM ALREADY PRINTED' } }) });
  const rec = regions().find((region) => region.id === 'rec');
  press(scene, rec, 'pointermove');
  assert.deepEqual(calls, []);
  press(scene, rec);
  assert.deepEqual(calls, []);
  assert.equal(scene.debugState().notice, 'ROOM ALREADY PRINTED');
  scenes.remove(scene);
});

test('pointer can browse and play a specific tape with no keyboard detour', () => {
  const { scene, calls, regions } = harness();
  press(scene, regions().find((region) => region.id === 'takes'));
  scene.render();
  const tape = regions().find((region) => region.kind === 'take');
  assert.ok(tape);
  press(scene, tape);
  assert.deepEqual(calls, [['play', 'main_b3']]);
  assert.equal(scene.debugState().browsing, false);
  scenes.remove(scene);
});

test('controller and keyboard transport presses retain the same keyup path', () => {
  const { scene, calls } = harness();
  scene.key({ key: 'ArrowDown', code: 'ArrowDown', controller: true });
  scene.key({ key: 'Enter', code: 'Enter', controller: true, controllerAction: 'confirm' });
  assert.deepEqual(calls, [['play', null]]);
  assert.equal(scene.keyup({ key: 'Enter', code: 'Enter', controller: true }), true);
  scenes.remove(scene);
});

test('focus-loss cancellation releases both keyboard and pointer holds', () => {
  const { scene, regions } = harness();
  const play = regions().find((region) => region.id === 'play');
  press(scene, play);
  scene.key({ key: 'Enter', code: 'Enter' });
  scene.pointer({ type: 'pointercancel' });
  assert.ok(!controlMechanicsSnapshot().ids.some((id) => id.startsWith('recorder:')));
  assert.equal(scene.keyup({ key: 'Enter', code: 'Enter' }), false);
  scenes.remove(scene);
});

test('guide choice hit regions use the exact wrapped transcript rows', () => {
  const regions = recorderHitRegions({
    rect: { x: 10, y: 20, w: 66, h: 21 }, mode: TRANSPORT.LISTEN,
    guide: { pending: { kind: 'branch', index: 0, options: [{ text: 'ROLL SOUND' }, { text: 'CHECK THE ROOM' }] } },
  });
  const choices = regions.filter((region) => region.kind === 'choice');
  assert.deepEqual(choices.map((region) => region.index), [0, 1]);
  assert.equal(regions.at(-1).kind, 'guide', 'explicit options take priority over generic advance');
  assert.ok(choices.every((region) => region.h === 1 && region.w > 0));
  cancelControlScope('');
});

test('enlarged pre-roll keeps both choices and controls in frame, below the annunciator rows', () => {
  // 960×600 CSS pixels at UI scale 1.5 is 75×20 cells. The previous 21-row
  // pre-roll began at row3 and lost its second choice and footer offscreen.
  for (const size of [{ cols: 75, rows: 20 }, { cols: 150, rows: 38 }]) {
    const rect = recorderPanelRect({ ...size, rowsNeeded: 15 });
    const view = { rect, mode: TRANSPORT.LISTEN, footer: 'ENTER PRESS · R CLOSE',
      buttons: { keys: [{ id: 'rec' }, { id: 'play' }, { id: 'takes' }] },
      guide: { pending: { kind: 'branch', index: 0, options: [{ text: 'ROLL SOUND' }, { text: 'CHECK THE ROOM' }] } } };
    const body = machinePanelBody(rect.x, rect.y, rect.w, rect.h, { footer: view.footer });
    const buttons = recorderButtons(rect, view.buttons);
    const content = recorderTranscriptRect(body, { usableW: body.w - buttons.w - 2, compact: rect.compact });
    const hits = recorderHitRegions(view), choices = hits.filter(hit => hit.kind === 'choice');
    assert.ok(rect.y + rect.h < size.rows, 'complete lower bezel stays inside the viewport');
    assert.ok(content.y >= body.y + (rect.compact ? 2 : 1), 'first sentence begins below all indicator text');
    assert.equal(choices.length, 2);
    assert.ok(choices[0].y + choices[0].h <= choices[1].y);
    assert.ok(choices.every(hit => hit.y >= content.y && hit.y + hit.h <= content.y + content.h));
    assert.ok(choices.at(-1).y + choices.at(-1).h <= rect.y + rect.h - 2, 'footer never covers a choice');
    assert.deepEqual(hits.filter(hit => hit.kind === 'transport'), recorderControlRegions(rect, view.buttons),
      'the existing transport housing arithmetic is unchanged');
  }
});

test('pointer pre-roll advances speech and chooses the clicked authored option', () => {
  const chosen = [];
  const { scene, regions } = harness({
    onRecord: ({ beginGuide }) => beginGuide({
      id: 'pointer-pre-roll',
      nodes: { start: { lines: [{ who: 'direction', text: 'Kill the light and roll.' }],
        choices: [{ id: 'wait', text: 'WAIT' }, { id: 'roll', text: 'ROLL SOUND' }] } },
      onChoice: (choice) => chosen.push(choice.id),
    }),
  });
  press(scene, regions().find((region) => region.id === 'rec'));
  assert.equal(scene.debugState().guide?.id, 'pointer-pre-roll');
  scene.update(2);
  scene.render();
  press(scene, regions().find((region) => region.kind === 'guide'));
  scene.render();
  press(scene, regions().find((region) => region.kind === 'choice' && region.index === 1));
  assert.deepEqual(chosen, ['roll']);
  assert.equal(scenes.has('recorder'), false, 'guide completion retains its existing close lifecycle');
});
