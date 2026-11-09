import test from 'node:test';
import assert from 'node:assert/strict';
import { createCabMusicBoxAudio } from '../src/audio/cab-music-box.js';
import { musicBoxContext, musicBoxFetcher, musicBoxUrl } from './helpers/music-box-audio-context.mjs';

const make = () => { const context = musicBoxContext(); return { context,
  owner: createCabMusicBoxAudio({ context, destination: context.destination, fetcher: musicBoxFetcher, resolve: musicBoxUrl }) }; };

test('the cab and coast use fixed-pitch authentic music with a visible key state during manual turning', async () => {
  const { owner, context } = make(); await owner.initialize(); owner.hold();
  for (let i = 0; i < 30; i++) { context.currentTime += 1 / 60; owner.update(); }
  assert.ok(owner.sample().position > .4);
  assert.notEqual(owner.sample().keyAngle, 0);
  assert.ok(context.sources.every(source => source.playbackRate.value === 1));
  owner.release(); assert.equal(owner.sample().running, false);
  assert.equal(owner.sample().winding.phase, 'slamming');
  assert.ok(context.sources.some(source => source.buffer.duration === .62));
  assert.ok(context.sources.some(source => /release-tonal-slip/.test(source.buffer.assetName)));
});

test('focus cancellation drops held input without playing recoil or restarting on a later tick', async () => {
  const { owner, context } = make(); await owner.initialize(); owner.hold(); owner.update(.2);
  const count = context.sources.length; owner.cancel(); context.currentTime += 20; owner.update();
  assert.equal(context.sources.length, count); assert.equal(owner.sample().running, false);
  assert.equal(owner.sample().held, false); assert.equal(owner.sample().winding.phase, 'rest');
  owner.setPaused(true); owner.setPaused(false); owner.update(.2);
  assert.equal(owner.sample().running, false);
});

test('leaving the cab permanently cancels melody and recoil sources', async () => {
  const { owner, context } = make(); await owner.initialize(); owner.hold(); owner.update(.2); owner.release();
  owner.stop(); owner.stop(); assert.equal(owner.hold(), false); assert.equal(owner.release(), false);
  assert.ok(context.sources.every(source => source.stops === 1));
});

test('a cold short press cannot charge the winding before its required pitched release has decoded', async () => {
  const context = musicBoxContext(); let resolveRelease;
  const fetcher = url => String(url).includes('release-tonal-slip')
    ? new Promise(resolve => { resolveRelease = resolve; }) : musicBoxFetcher(url);
  const owner = createCabMusicBoxAudio({ context, destination: context.destination, fetcher, resolve: musicBoxUrl });
  owner.hold(); const initializing = owner.initialize();
  for (let i = 0; i < 8; i++) await Promise.resolve();
  owner.update(.2); assert.equal(owner.ready(), false);
  assert.equal(owner.sample().winding.wind, 0); assert.equal(owner.sample().winding.playbackSeconds, 0);
  owner.release(); resolveRelease(await musicBoxFetcher('music-box/release-tonal-slip.wav'));
  assert.equal(await initializing, true); owner.update(.2);
  assert.equal(context.sources.length, 0, 'late decoding cannot create a delayed slip or melody');
  owner.stop();
});

test('missing pitched-release audio is explicit and cannot leave a playable but silently slipping cab box', async () => {
  const context = musicBoxContext();
  const fetcher = url => String(url).includes('release-tonal-slip') ? Promise.resolve({ ok: false, status: 503 }) : musicBoxFetcher(url);
  const owner = createCabMusicBoxAudio({ context, destination: context.destination, fetcher, resolve: musicBoxUrl });
  assert.equal(await owner.initialize(), false); assert.equal(owner.ready(), false);
  assert.match(owner.error(), /pitched.*release/i);
  owner.hold(); owner.update(.2); owner.release();
  assert.equal(owner.sample().winding.wind, 0); assert.equal(context.sources.length, 0); owner.stop();
});
