import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as scenes from '../src/game/scenes.js';
import {
  DISPLAY_NOTICE_SCENE_ID, displayNoticeLines, makeDisplayNoticeScene,
} from '../src/game/display-notice.js';

// The launch advice explains external windows and allows fullscreen until a cue
// needs them. Browser copy describes the in-frame fallback accurately.
{
  const desktop = displayNoticeLines({ desktop: true });
  assert.match(desktop.body, /extra windows around the game/);
  assert.match(desktop.warning, /switches to windowed mode/);
  const browser = displayNoticeLines({ desktop: false });
  assert.match(browser.warning, /inside the game/);
  assert.doesNotMatch(browser.warning, /switches to windowed/);
  assert.match(displayNoticeLines({ fullscreen: true }).warning, /Fullscreen is on/);
}

// The picture is the thing itself in miniature — windows moving around the one
// in the middle — not a diagram of one.
{
  const source = readFileSync('src/game/display-notice.js', 'utf8');
  assert.match(source, /function drawWindowPreview/, 'the screen previews what the game does');
  assert.match(source, /PREVIEW_WINDOWS/, 'with more than one window in it');
  const preview = source.slice(source.indexOf('function drawWindowPreview'),
    source.indexOf('export function makeDisplayNoticeScene'));
  assert.match(preview, /\bt\b/, 'and it moves, or it is just a diagram again');
  assert.ok(preview.indexOf('for (const s of PREVIEW_WINDOWS)') < preview.lastIndexOf('pane(cx - iw'),
    'the satellites are drawn BEFORE the centre window, so they pass behind it');
}

// It is the first thing, it never advances on its own, and it takes any key.
{
  let done = 0;
  const scene = makeDisplayNoticeScene({ onDone: () => { done += 1; } });
  assert.equal(scene.id, DISPLAY_NOTICE_SCENE_ID);
  assert.equal(scene.blocksInput, true);
  assert.equal(scene.suppressesHud, true, 'there is no HUD yet, and none may be drawn under it');

  scenes.push(scene);
  // NO AUTOSKIP. Nothing here is on a timer — sitting on this screen is allowed,
  // and the only way past it is a key.
  for (let i = 0; i < 200; i += 1) scene.update(0.25);
  assert.equal(done, 0, 'fifty seconds of updates do not advance it');
  assert.equal(scenes.has(DISPLAY_NOTICE_SCENE_ID), true);

  scene.key({ key: 'q' });
  assert.equal(done, 1, 'ANY key, not a named one');
  assert.equal(scenes.has(DISPLAY_NOTICE_SCENE_ID), false, 'and it removes itself');

  // A key repeat, or an impatient player, must not run the boot chain twice.
  scene.key({ key: 'q' });
  scene.pointer({ type: 'pointerdown' });
  assert.equal(done, 1, 'it closes exactly once');
}

// A key in the first moments is somebody still releasing the key that launched
// the game, not somebody who has read this.
{
  let done = 0;
  const scene = makeDisplayNoticeScene({ onDone: () => { done += 1; } });
  scenes.push(scene);
  scene.key({ key: 'Enter' });
  assert.equal(done, 0, 'the launch key does not count');
  scene.update(0.4);
  scene.key({ key: 'Enter' });
  assert.equal(done, 1, 'a moment later it does');
}

// It shares no chrome with anything else. Every other screen in the game is a
// machine faceplate; this one is the game speaking as itself.
{
  const source = readFileSync('src/game/display-notice.js', 'utf8');
  assert.doesNotMatch(source, /drawMachinePanel/, 'no faceplate');
  assert.doesNotMatch(source, /frontEndSession|bootWeather|setFrontEndPlate/,
    'no tableau plate and no boot weather — it stands outside the front end');
}

// ── AND THE OPENING SCENE HAS ITS MUSIC ──────────────────────────────────────
//
// enterStory has two arrival paths. The front-end promotion path — which every
// ordinary launch takes — started the rain and nothing else, while the arrival
// scene it does NOT push started both. So the opening bed had stopped playing
// at all, and because that piece hands off to the title on a downbeat at the
// booth, the downbeat hold in front of the guard conversation was skipped too.
{
  const main = readFileSync('src/main.js', 'utf8');
  const branch = main.slice(main.indexOf('if(frontEndPromotion){'),
    main.indexOf('scenes.push(makeArrivalScene('));
  assert.match(branch, /STORY\.startRain/, 'the promotion path still starts the rain');
  assert.match(branch, /STORY\.startOpeningSceneBed/,
    'AND the opening bed — this is the bug: the walk was silent on every ordinary launch');

  const arrival = readFileSync('src/game/coldopen.js', 'utf8');
  assert.match(arrival, /startRain\?\.\(\);\s*audio\?\.startOpeningSceneBed/,
    'the other arrival path is unchanged, and starts both');
}


// A required release holds the authored clock and cannot be dismissed early.
{
  let ticks = 0, calls = 0, done = 0, settle;
  const underlying = scenes.push({ id: 'release-test', update: () => ticks++ });
  const notice = scenes.push(makeDisplayNoticeScene({
    transition: () => { calls++; return new Promise(resolve => { settle = resolve; }); },
    onDone: () => done++,
  }));
  scenes.update(0.5);
  notice.key({ key: 'Escape' });
  assert.equal(ticks, 0);
  assert.equal(done, 0);
  scenes.update(2);
  await Promise.resolve();
  assert.equal(calls, 1);
  notice.key({ key: 'Enter' });
  settle(false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(done, 0, 'failed release keeps the gate');
  notice.key({ key: 'Enter' });
  await Promise.resolve();
  assert.equal(calls, 2);
  settle(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(done, 0, 'confirmation stays visible while the window settles');
  scenes.update(0.7);
  assert.equal(done, 1);
  scenes.update(0.1);
  assert.equal(ticks, 1);
  scenes.remove(underlying);
}

// The second advisory explains microphone feedback and requires a fresh input.
{
  const { makeHeadphoneNoticeScene, headphoneNoticeLines } = await import('../src/game/display-notice.js');
  assert.match(headphoneNoticeLines().body, /microphone to measure room noise/);
  assert.match(headphoneNoticeLines().body, /speakers.*lose faster/);
  let done = 0;
  const windowNotice = scenes.push(makeDisplayNoticeScene({
    onDone: () => scenes.push(makeHeadphoneNoticeScene({ onDone: () => done++ })),
  }));
  windowNotice.update(1);
  scenes.key({ key: 'Enter' });
  assert.equal(scenes.top().id, 'headphone-notice');
  scenes.update(30);
  scenes.key({ key: 'Enter', repeat: true });
  assert.equal(done, 0);
  scenes.pointer({ type: 'pointerdown' });
  assert.equal(done, 1);
  assert.equal(scenes.depth(), 0);
}

// Replacing a scene during an OS transition must not resume a discarded beat.
{
  let finish, done = 0, cancelled = 0;
  const notice = scenes.push(makeDisplayNoticeScene({
    transition: () => new Promise(resolve => { finish = resolve; }),
    onDone: () => done++, onCancel: () => cancelled++,
  }));
  notice.update(3);
  scenes.replace({ id: 'replacement' });
  finish(true);
  await new Promise(resolve => setImmediate(resolve));
  notice.update(3);
  assert.equal(done, 0);
  assert.equal(cancelled, 1);
  assert.equal(scenes.top().id, 'replacement');
  scenes.pop();
}

// Aborting an unstarted transition never changes the display or blocks input.
{
  const controller = new AbortController();
  let calls = 0, cancelled = 0;
  const notice = scenes.push(makeDisplayNoticeScene({
    signal: controller.signal, transition: () => { calls++; return true; },
    onCancel: () => cancelled++,
  }));
  controller.abort();
  notice.update(4);
  assert.equal(calls, 0);
  assert.equal(cancelled, 1);
  assert.equal(scenes.depth(), 0);
}

// Failed/rejected native exits are retried once per fresh input, never per frame.
{
  let calls = 0, done = 0;
  const notice = scenes.push(makeDisplayNoticeScene({
    transition: () => { calls++; throw new Error('native exit failed'); },
    onDone: () => done++,
  }));
  notice.update(3);
  await Promise.resolve();
  notice.update(30);
  notice.key({ key: 'Enter', repeat: true });
  assert.equal(calls, 1);
  notice.pointer({ type: 'pointerdown', button: 2 });
  assert.equal(calls, 1);
  notice.pointer({ type: 'pointerdown', button: 0 });
  assert.equal(calls, 2);
  assert.equal(done, 0);
  scenes.pop();
}

// A display/system shortcut and modifiers cannot skip the next launch screen.
{
  let done = 0;
  const notice = scenes.push(makeDisplayNoticeScene({ onDone: () => done++ }));
  notice.update(1);
  for (const event of [{ key: 'f', ctrlKey: true }, { key: 'F11' }, { key: 'Shift' }]) notice.key(event);
  assert.equal(done, 0);
  notice.key({ key: 'Enter', controller: true });
  assert.equal(done, 1);
}



// Slow startup frames cannot stretch the fresh-input guard beyond real reading time.
{
  let time = 0, done = 0;
  const notice = scenes.push(makeDisplayNoticeScene({ now: () => time, onDone: () => done++ }));
  notice.update(.016);
  time = .2;
  notice.pointer({ type: 'pointerdown', originalEvent: { button: 0 } });
  assert.equal(done, 0);
  time = .8;
  notice.pointer({ type: 'pointerdown', originalEvent: { button: 2 } });
  assert.equal(done, 0);
  notice.pointer({ type: 'pointerdown', originalEvent: { button: 0 } });
  assert.equal(done, 1, 'fresh input is accepted after real reading time despite clamped dt');
}

console.log('advisory lifecycle, copy, and opening bed contracts passed');
