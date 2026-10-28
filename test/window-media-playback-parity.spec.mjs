import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  WINDOW_MEDIA_PROTOCOL, compileWindowCompositionPlan, createPaneScoreEnvelope, createWindowMediaClock,
  createWindowVideoClock, scoreTimeAt, validatePaneScoreEnvelope, windowMediaContentId,
} from '../src/platform/window-composition.js';

const assignment = (phaseOffsetMs = 0, extra = {}) => ({
  content: { kind: 'video', assetId: 'bellringers-datamosh', playback: 'forward' },
  crop: { x: 0, y: 0, w: 1, h: 1 }, phaseOffsetMs, clockMode: 'source', ...extra,
});
const score = { epochMs: 1000, durationMs: 120000, loop: false };
const duration = { durationSeconds: 12 };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < .000001, `${actual} should equal ${expected}`);

test('application holds preserve the score clock instead of catching up missed cues', () => {
  const clock = createWindowMediaClock({ epochMs: 1000, nowMs: 1000 });
  assert.equal(clock.elapsed(4000), 3000);
  clock.hold(true, 4000); clock.hold(true, 7000);
  assert.equal(clock.now(50000), 4000, 'repeated hold does not advance its anchor');
  clock.hold(false, 50000); clock.hold(false, 60000);
  assert.equal(clock.elapsed(52000), 5000);
  assert.equal(scoreTimeAt({ ...score, durationMs: 6000 }, clock.now(52000)), 5000);
  clock.reset(70000, 70000); assert.equal(clock.elapsed(71000), 1000);
});

test('source-clock assignments sustain real phase agreement without stretching an event-driven score', () => {
  const a = createWindowVideoClock({ score, assignment: assignment(), nowMs: 1000 });
  const b = createWindowVideoClock({ score, assignment: assignment(650), nowMs: 1000 });
  near(a.time(6000, duration), 5); near(b.time(6000, duration), 5.65);
  assert.equal(a.playbackRate(duration), 1, 'a 120-second staging score does not slow the performance tenfold');
  b.assign(assignment(), 6000);
  for (const now of [6000, 9000, 25000, 65000]) near(a.time(now, duration), b.time(now, duration));
  near(a.time(15000, duration), 2, 'the finite staging score does not prevent the real media loop');
});

test('a stopped performed image and its continuing reference survive a separate application pause', () => {
  const source = createWindowVideoClock({ score, assignment: assignment(), nowMs: 1000 });
  const reference = createWindowVideoClock({ score, assignment: assignment(), nowMs: 1000 });
  source.freeze(true, 4000, { currentTimeSeconds: 2.973, ...duration });
  near(source.time(9000, duration), 2.973); near(reference.time(9000, duration), 8);
  source.hold(true, 9000, { currentTimeSeconds: 2.973, ...duration });
  reference.hold(true, 9000, { currentTimeSeconds: 7.981, ...duration });
  near(reference.time(19000, duration), 7.981);
  source.hold(false, 19000); reference.hold(false, 19000);
  near(source.time(20000, duration), 2.973); near(reference.time(20000, duration), 8.981);
  source.freeze(false, 21000); near(source.time(22000, duration), 3.973);
  assert.equal(reference.snapshot(22000, duration).frozen, false, 'application hold never becomes an authored release');
});

test('explicit seeks remain durable and legacy finite playback ends without a wrap', () => {
  const source = createWindowVideoClock({ score, assignment: assignment(), nowMs: 1000 });
  source.seek(2500, 2000, duration); near(source.time(4500, duration), 5);
  const reverse = createWindowVideoClock({ score, assignment: assignment(0, { content: { kind: 'video', playback: 'reverse' } }), nowMs: 1000 });
  reverse.seek(2500, 2000, duration); near(reverse.time(3000, duration), 1.5);
  const finite = createWindowVideoClock({ score: { ...score, durationMs: 12000 }, assignment: assignment(0, { clockMode: 'score' }), nowMs: 1000 });
  near(finite.time(7000, { durationSeconds: 6 }), 3);
  near(finite.time(13000, { durationSeconds: 6 }), 6);
  near(finite.time(50000, { durationSeconds: 6 }), 6);
  assert.equal(finite.playbackRate({ durationSeconds: 6 }), .5);
});

test('reduced-motion assignments expose fixed distinct poses and converge to the same fixed phase', () => {
  const clocks = [0, 650, 1350, 2150].map(phaseOffsetMs => createWindowVideoClock({ score, assignment: assignment(phaseOffsetMs), nowMs: 1000, reducedMotion: true }));
  assert.equal(new Set(clocks.map(clock => clock.time(1000, duration))).size, 4);
  for (const clock of clocks) near(clock.time(1000, duration), clock.time(80000, duration));
  clocks[1].assign(assignment(), 6000); clocks[2].assign(assignment(), 9000);
  near(clocks[0].time(10000, duration), clocks[1].time(10000, duration));
  near(clocks[0].time(10000, duration), clocks[2].time(10000, duration));
  near(clocks[3].time(10000, duration), 2.15);
});

function plan({ reducedMotion = false, event = false } = {}) {
  return compileWindowCompositionPlan({
    compositionId: 'playback-parity', sceneId: 'source:study', purpose: 'source-study', epochMs: 1000, reducedMotion,
    surfaces: [{ id: 'a', ...assignment() }, { id: 'b', ...assignment(2150) }],
    score: { durationMs: 120000, loop: false, cues: event ? [{ id: 'release', event: 'performed-release', operations: [
      { type: 'ripple', targets: ['a', 'b'], order: ['a', 'b'], intervalMs: 200, operation: { type: 'freeze', targets: ['a', 'b'] } },
    ] }] : [] },
  });
}

test('native envelopes carry the reduced-motion contract without weakening target ownership', () => {
  const value = plan({ reducedMotion: true });
  const envelope = createPaneScoreEnvelope(value, 'a', { targetLabel: 'window-media-1', sessionToken: 'parity', revision: 1 });
  assert.equal(envelope.reducedMotion, true);
  assert.equal(envelope.score.initial.clockMode, 'source');
  assert.equal(validatePaneScoreEnvelope(envelope, { targetLabel: 'window-media-1' }).ok, true);
  assert.equal(validatePaneScoreEnvelope(envelope, { targetLabel: 'window-media-2' }).reason, 'target');
});

// Execute the real native presenter with a device-free media element, not a
// second implementation of its transport. No Tauri window/GPU is created.
function nativeFixture({ seekOnWrite = false, deferPlay = false } = {}) {
  let now = 1000;
  const videos = [], elements = new Map();
  const element = tag => ({ tagName: tag, dataset: {}, style: {}, children: [], width: 320, height: 180,
    addEventListener() {}, setAttribute(name, value) { this[name] = value; }, removeAttribute(name) { delete this[name]; },
    append(child) { this.children.push(child); }, querySelectorAll(selector) { return this.children.filter(child => child.tagName === selector); },
    getContext: () => null,
  });
  const document = { documentElement: element('html'), body: element('body'),
    getElementById(id) { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); },
    createElement(tag) {
      if (tag !== 'video') return element(tag);
      let decodedTime = 0;
      const listeners = new Map(), media = { ...element(tag), duration: 12, readyState: 0, seeking: false, paused: true,
        playCount: 0, pauseCount: 0, loadCount: 0, loadRequests: [], seekWrites: [], playRequests: [], currentSrc: '', error: null,
        get currentTime() { return decodedTime; },
        set currentTime(value) {
          decodedTime = value; this.seekWrites.push(value);
          if (seekOnWrite) { this.seeking = true; this.readyState = 1; }
        },
        decodedAt(value) { decodedTime = value; },
        completeSeek() { this.seeking = false; this.readyState = 2; this.fire('seeked'); this.fire('canplay'); },
        addEventListener(name, callback, options) { listeners.set(name, { callback, once: !!options?.once }); },
        fire(name) { const listener = listeners.get(name); if (listener?.once) listeners.delete(name); listener?.callback(); },
        play() {
          this.playCount++;
          if (!deferPlay) { this.paused = false; return Promise.resolve(); }
          let resolve;
          const promise = new Promise(done => { resolve = () => { this.paused = false; done(); }; });
          this.playRequests.push({ resolve }); return promise;
        },
        pause() { this.pauseCount++; this.paused = true; },
        load() {
          this.loadCount++;
          const selected = this.src || this.querySelectorAll('source').find(child => child.src)?.src || '';
          this.loadRequests.push(selected); this.currentSrc = selected;
          this.readyState = 0; this.seeking = false; this.error = null; decodedTime = 0;
        },
      };
      videos.push(media); return media;
    },
  };
  class FixtureDate extends Date { static now() { return now; } }
  class FixtureImage { set src(value) { this._src = value; this.onload?.(); } get src() { return this._src; } }
  const context = vm.createContext({ document, Date: FixtureDate, Image: FixtureImage,
    mediaManifest: JSON.parse(readFileSync(new URL('../content/media/window-media.media.json', import.meta.url))),
    WINDOW_SURFACE_LOOK_GLSL: '', WINDOW_MEDIA_PROTOCOL, scoreTimeAt, createWindowMediaClock, createWindowVideoClock,
    validatePaneScoreEnvelope, windowMediaContentId, getCurrentWindow: () => ({ label: 'window-media-1' }),
    emit: () => Promise.resolve(), listen: () => Promise.resolve(), addEventListener() {},
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, performance: { now: () => now },
    setTimeout, clearTimeout, devicePixelRatio: 1, innerWidth: 320, innerHeight: 180,
    location: { href: 'http://fixture/window-media.html', search: '' }, URL, URLSearchParams, console,
  });
  let script = readFileSync(new URL('../src/window-media-surface.js', import.meta.url), 'utf8');
  script = script.replace(/^import[\s\S]*?from\s+['"][^'"]+['"](?:\s+with\s+\{[^}]+\})?;\s*/gm, '')
    .replaceAll('import.meta.env.DEV', 'false').replace('void boot();', '');
  vm.runInContext(`${script}\nglobalThis.presenter={acceptEnvelope,holdScore,triggerEvent,advanceScore,executeAction,clearMediaScore,desiredSeconds,syncVideoPlayback,draw,
    state:()=>({video,source,frozen,scoreSuspended,assignment,clock:scoreClock.snapshot(Date.now()),pending:pendingScoreEvents.length})};`, context);
  const presenter = context.presenter;
  const payload = (value, pane = 'a', revision = 1) => createPaneScoreEnvelope(value, pane,
    { targetLabel: 'window-media-1', sessionToken: 'parity', revision });
  const load = () => { const media = presenter.state().video; media.readyState = 2; media.fire('loadeddata'); return media; };
  return { presenter, payload, load, videos, document, at(value) { now = value; } };
}

test('the actual native presenter holds an exact decoded frame and resumes without wall-clock correction', async () => {
  const f = nativeFixture(), payload = f.payload(plan());
  await f.presenter.acceptEnvelope(payload); const media = f.load();
  assert.equal(media.playbackRate, 1); assert.equal(media.loop, true);
  f.at(4000); media.currentTime = 2.973;
  assert.equal(f.presenter.holdScore({ ...payload, held: true }), true);
  f.at(100000); f.presenter.advanceScore();
  near(f.presenter.desiredSeconds(), 2.973);
  assert.equal(f.presenter.state().scoreSuspended, true);
  const plays = media.playCount;
  f.presenter.holdScore({ ...payload, held: false });
  near(media.currentTime, 2.973); assert.equal(media.playCount, plays + 1);
  f.at(101000); near(f.presenter.desiredSeconds(), 3.973);
  assert.equal(f.presenter.state().frozen, false, 'application pause is not performed-action release');
});

test('the actual native reduced presenter never autoplays and later phase-zero assignments stay at the same still', async () => {
  const f = nativeFixture(), payload = f.payload(plan({ reducedMotion: true }), 'b');
  await f.presenter.acceptEnvelope(payload); const old = f.load();
  near(old.currentTime, 2.15); assert.equal(old.playCount, 0);
  assert.notEqual(f.presenter.state().source, old, 'the fixed nonzero pose keeps its poster until seeked, avoiding a frame-zero flash');
  old.fire('seeked'); assert.equal(f.presenter.state().source, old);
  f.at(80000); f.presenter.advanceScore(); near(f.presenter.desiredSeconds(), 2.15);
  f.presenter.executeAction({ type: 'assignment', assignment: assignment(), transition: 'cut' }, 'converge');
  const media = f.load(); near(media.currentTime, 0); assert.equal(media.playCount, 0);
  old.fire('loadeddata'); old.fire('seeked');
  assert.equal(f.presenter.state().video, media, 'retired decoder callbacks cannot replace the new assignment');
  assert.equal(f.presenter.state().source, media, 'a retired seek cannot restore the old still');
});

test('native pending event delays survive application hold and stale revisions cannot release a new score', async () => {
  const f = nativeFixture(), payload = f.payload(plan({ event: true }), 'b');
  await f.presenter.acceptEnvelope(payload); f.load();
  f.at(1200); f.presenter.triggerEvent({ ...payload, event: 'performed-release', effectiveAtMs: 1300 });
  f.at(1250); f.presenter.holdScore({ ...payload, held: true });
  f.at(9000); f.presenter.advanceScore(); assert.equal(f.presenter.state().frozen, false);
  f.presenter.holdScore({ ...payload, held: false });
  f.at(9249); f.presenter.advanceScore(); assert.equal(f.presenter.state().frozen, false);
  f.at(9250); f.presenter.advanceScore(); assert.equal(f.presenter.state().frozen, true);
  const replacement = f.payload(plan(), 'a', 2);
  await f.presenter.acceptEnvelope(replacement); f.load();
  assert.equal(f.presenter.holdScore({ ...payload, held: true }), false);
  assert.equal(f.presenter.triggerEvent({ ...payload, event: 'performed-release', effectiveAtMs: 10000 }), false);
  f.at(12000); f.presenter.advanceScore(); assert.equal(f.presenter.state().frozen, false);
  assert.equal(f.presenter.state().pending, 0);
});

test('native drift correction gives an in-flight decoder seek time to finish instead of replacing it each frame', async () => {
  const f = nativeFixture({ seekOnWrite: true }), payload = f.payload(plan(), 'b');
  await f.presenter.acceptEnvelope(payload); const media = f.load();
  assert.equal(media.seeking, true); assert.equal(media.readyState, 1);
  assert.equal(media.seekWrites.length, 1, 'initial assignment requests exactly one nonzero phase seek');
  const requested = media.seekWrites[0];
  for (let frame = 0; frame < 12; frame++) {
    const at = 1300 + frame * 200; f.at(at); f.presenter.draw(at);
  }
  assert.deepEqual(media.seekWrites, [requested], 'metadata-only frames must not starve the pending decoder with newer drift targets');
  media.seeking = false; // The browser may finish seeking before it has a decoded frame.
  for (const at of [3900, 4100]) { f.at(at); f.presenter.draw(at); }
  assert.equal(media.readyState, 1);
  assert.deepEqual(media.seekWrites, [requested], 'HAVE_METADATA alone also cannot authorize another drift seek');
  media.decodedAt(f.presenter.desiredSeconds()); media.completeSeek();
  assert.equal(media.readyState, 2); assert.equal(media.seeking, false);
  assert.ok(media.playCount > 0, 'completion can enter ordinary playback rather than remaining a poster forever');
  assert.equal(f.presenter.state().source, media);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(media.paused, false);
});

test('a pending native play promise cannot restart a video after application hold', async () => {
  const f = nativeFixture({ deferPlay: true }), payload = f.payload(plan());
  await f.presenter.acceptEnvelope(payload); const media = f.load();
  assert.equal(media.playRequests.length, 1);
  f.presenter.holdScore({ ...payload, held: true });
  const pausesBeforeResolution = media.pauseCount;
  media.playRequests[0].resolve();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(media.paused, true, 'late play completion must re-check the held state');
  assert.ok(media.pauseCount > pausesBeforeResolution);
  assert.equal(f.presenter.state().scoreSuspended, true);
});

test('rapid native hold/resume protects the newer play request on the same media element', async () => {
  const f = nativeFixture({ deferPlay: true }), payload = f.payload(plan());
  await f.presenter.acceptEnvelope(payload); const media = f.load();
  f.presenter.holdScore({ ...payload, held: true });
  f.presenter.holdScore({ ...payload, held: false });
  assert.equal(media.playRequests.length, 2, 'resume may replace the held request without waiting for its old promise');
  media.playRequests[0].resolve();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  f.presenter.syncVideoPlayback();
  assert.equal(media.playRequests.length, 2, 'old completion must not clear the new request ticket and permit a third play');
  f.presenter.holdScore({ ...payload, held: true });
  media.playRequests[1].resolve();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(media.paused, true, 'the latest request still checks the later hold before continuing');
});

test('a retired native play continuation cannot revive old media or clear the newer pending-play guard', async () => {
  const f = nativeFixture({ deferPlay: true }), payload = f.payload(plan());
  await f.presenter.acceptEnvelope(payload); const retired = f.load();
  f.presenter.executeAction({ type: 'assignment', assignment: assignment(650), transition: 'cut' }, 'new-source');
  const current = f.load();
  assert.notEqual(current, retired); assert.equal(current.playRequests.length, 1);
  retired.playRequests[0].resolve();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(retired.paused, true, 'old media cannot resume after assignment ownership changes');
  f.presenter.syncVideoPlayback();
  assert.equal(current.playCount, 1, 'old promise cleanup cannot permit duplicate current play requests');
  current.playRequests[0].resolve();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(current.paused, false); assert.equal(f.presenter.state().video, current);
});

test('a native decode failure retries the alternate packaged codec without resetting the source clock', async () => {
  const f = nativeFixture(), payload = f.payload(plan(), 'b');
  await f.presenter.acceptEnvelope(payload); const media = f.load();
  assert.match(media.currentSrc, /\.webm$/); near(media.currentTime, 2.15);
  f.at(5000); media.error = { code: 3, message: 'PIPELINE_ERROR_DECODE' }; media.fire('error');
  assert.match(media.src, /\.mp4$/); assert.match(media.currentSrc, /\.mp4$/);
  assert.equal(media.loadCount, 2, 'one alternate reload follows the original source-list selection');
  assert.equal(f.presenter.state().video, media, 'codec recovery does not create a new assignment/transport');
  assert.notEqual(f.presenter.state().source, media, 'poster covers decoder recovery');
  f.at(7000); media.duration = 12; f.load();
  near(media.currentTime, 8.15);
  assert.equal(f.presenter.state().clock.elapsedMs, 6000, 'the shared application clock was not restarted');
  assert.equal(media.playbackRate, 1); assert.equal(media.loop, true);
  assert.ok(media.playCount >= 2, 'the persistent loadeddata handler starts the alternate format');
  assert.equal(f.presenter.state().source, media);
});

test('native codec recovery preserves an exact application-held frame and resumes from it', async () => {
  const f = nativeFixture(), payload = f.payload(plan(), 'b');
  await f.presenter.acceptEnvelope(payload); const media = f.load();
  f.at(4000); media.decodedAt(4.973); f.presenter.holdScore({ ...payload, held: true });
  media.error = { code: 3 }; media.fire('error');
  const plays = media.playCount;
  f.at(99000); f.load();
  near(media.currentTime, 4.973); assert.equal(media.playCount, plays); assert.equal(media.paused, true);
  assert.equal(f.presenter.state().clock.elapsedMs, 3000);
  f.presenter.holdScore({ ...payload, held: false });
  near(media.currentTime, 4.973); assert.equal(media.playCount, plays + 1);
  f.at(100000); near(f.presenter.desiredSeconds(), 5.973);
});

test('exhausted native codec formats stop retrying and late play completions cannot revive the failed stream', async () => {
  const f = nativeFixture({ deferPlay: true }), payload = f.payload(plan());
  await f.presenter.acceptEnvelope(payload); const media = f.load();
  media.error = { code: 3 }; media.fire('error');
  assert.match(media.currentSrc, /\.mp4$/);
  media.error = { code: 3 }; media.fire('error');
  const loads = media.loadCount, plays = media.playCount;
  for (let index = 0; index < 4; index++) media.fire('error');
  assert.equal(media.loadCount, loads, 'each packaged format receives at most one attempt');
  f.presenter.syncVideoPlayback();
  assert.equal(media.playCount, plays, 'an exhausted stream stays a poster instead of retrying play');
  for (const request of media.playRequests) request.resolve();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(media.paused, true); assert.notEqual(f.presenter.state().source, media);
});

test('a retired native decoder error cannot retry or reclaim media, and destruction clears source-child URLs', async () => {
  const f = nativeFixture(), payload = f.payload(plan());
  await f.presenter.acceptEnvelope(payload); const retired = f.load();
  assert.ok(retired.querySelectorAll('source').every(child => child.src));
  f.presenter.executeAction({ type: 'assignment', assignment: assignment(650), transition: 'cut' }, 'replacement');
  const current = f.load(), retiredLoads = retired.loadCount, currentLoads = current.loadCount;
  assert.ok(retired.querySelectorAll('source').every(child => !child.src));
  assert.equal(retired.loadRequests.at(-1), '', 'cleanup load cannot negotiate an old child source again');
  retired.error = { code: 3 }; retired.fire('error');
  assert.equal(retired.loadCount, retiredLoads); assert.equal(current.loadCount, currentLoads);
  assert.equal(f.presenter.state().video, current); assert.equal(f.presenter.state().source, current);
});
