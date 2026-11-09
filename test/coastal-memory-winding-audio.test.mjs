import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoastalWindingAudio } from '../src/audio/coastal-memory-winding.js';
import { MUSIC_BOX_REFERENCE } from '../src/data/music-box-reference.js';
import { musicBoxContext, musicBoxFetcher, musicBoxUrl } from './helpers/music-box-audio-context.mjs';

const make = () => { const context = musicBoxContext(); return { context,
  owner: createCoastalWindingAudio({ context, destination: context.destination, fetcher: musicBoxFetcher, urlFor: musicBoxUrl }) }; };
const state = (phase, playbackSeconds = 0) => ({ phase, playbackSeconds, playbackRate: phase === 'cranking' ? 1 : 0 });

test('the winding owner loads the actual shared performance without a null phrase or synthetic melody', async () => {
  const { owner, context } = make(); assert.equal(await owner.initialize(), true);
  assert.equal(owner.ready(), true); assert.equal(owner.error(), null);
  assert.equal(context.sources.length, 0);
  assert.equal(context.nodes.some(n => n.kind === 'waveshaper'), false);
  owner.dispose();
});

test('supported manual turning plays at original pitch; holding still freezes and resumes the same point', async () => {
  const { owner, context } = make(); await owner.initialize(); owner.setPaused(false);
  owner.update({ state: state('cranking'), events: [], turn: .1, held: true });
  assert.equal(context.sources.length, 1); assert.equal(context.sources[0].playbackRate.value, 1);
  context.currentTime = 2; owner.update({ state: state('held', 2), events: [], held: true });
  assert.equal(context.sources[0].stops, 1); assert.equal(owner.sample().recordingOffset, 2);
  context.currentTime = 20; owner.update({ state: state('cranking', 2), events: [], turn: 4, held: true });
  assert.deepEqual(context.sources[1].starts, [{ at: 20, offset: 2 }]);
  assert.equal(context.sources[1].playbackRate.value, 1, 'turn speed must never transpose the entire comb');
});

test('letting go stops the phrase and voices the pitched recorded comb rake, never a backward tune', async () => {
  const { owner, context } = make(); await owner.initialize(); owner.setPaused(false);
  owner.update({ state: state('cranking'), events: [] }); context.currentTime = 1;
  owner.update({ state: state('slamming', 1), events: [{ type: 'slam-start', at: 0 }], held: false });
  assert.equal(context.sources[0].stops, 1);
  assert.equal(context.sources[1].buffer.duration, MUSIC_BOX_REFERENCE.releaseSeconds);
  assert.match(context.sources[1].buffer.assetName, /release-tonal-slip/);
  assert.equal(context.sources[1].playbackRate.value, 1);
  const count = context.sources.length;
  owner.update({ state: state('rest', 1), events: [{ type: 'pluck', direction: -1, pitch: 84 }, { type: 'tick', pitch: 81 }] });
  assert.equal(context.sources.length, count, 'proxy tine events cannot add a second wrong melody');
});

test('pause requires fresh input after restoration and disposal cancels all recorded voices once', async () => {
  const { owner, context } = make(); await owner.initialize(); owner.setPaused(false);
  owner.update({ state: state('cranking'), events: [] }); owner.setPaused(true);
  context.currentTime = 12; owner.setPaused(false);
  assert.equal(owner.sample().audioRunning, false);
  owner.update({ state: state('held'), events: [] }); assert.equal(owner.sample().audioRunning, false);
  owner.dispose(); owner.dispose(); assert.equal(owner.ready(), false);
  assert.ok(context.sources.every(source => source.stops === 1));
});

test('handled listening consumes real melody time once; rattles, recoil, held time and pauses earn none', async () => {
  const { owner, context } = make(); await owner.initialize(); owner.setPaused(false);
  owner.rattle(.8); context.currentTime = 1; assert.equal(owner.sample().audibleSeconds, 0);
  owner.update({ state: state('cranking'), events: [] });
  let played = 0;
  for (let frame = 1; frame <= 10; frame++) {
    context.currentTime = 1 + frame / 10;
    owner.update({ state: state('cranking', frame / 10), events: [] });
    played += owner.sample().audibleSeconds;
    assert.equal(owner.sample().audibleSeconds, 0, 'every interval is consumed once');
  }
  assert.ok(Math.abs(played - 1) < 1e-8);
  owner.update({ state: state('held', 1), events: [] });
  context.currentTime = 40; assert.equal(owner.sample().audibleSeconds, 0);
  owner.update({ state: state('slamming', 1), events: [{ type: 'slam-start' }] });
  context.currentTime = 41; assert.equal(owner.sample().audibleSeconds, 0);
  owner.setPaused(true); context.currentTime = 80; assert.equal(owner.sample().audibleSeconds, 0);
});

test('lost frames bound listening credit and delayed loading cannot earn retroactive handled time', async () => {
  const { owner, context } = make(); await owner.initialize(); owner.setPaused(false);
  owner.update({ state: state('cranking'), events: [] }); context.currentTime = 20;
  assert.equal(owner.sample().audibleSeconds, .25);
  owner.dispose();
});

test('missing pitched-release audio reports failure and never starts an incomplete handled performance', async () => {
  const context = musicBoxContext();
  const fetcher = url => String(url).includes('release-tonal-slip') ? Promise.resolve({ ok: false, status: 503 }) : musicBoxFetcher(url);
  const owner = createCoastalWindingAudio({ context, destination: context.destination, fetcher, urlFor: musicBoxUrl });
  assert.equal(await owner.initialize(), false); assert.equal(owner.ready(), false);
  assert.match(owner.error(), /pitched.*release/i); owner.setPaused(false);
  owner.update({ state: state('cranking', .2), events: [] });
  assert.equal(context.sources.length, 0); assert.equal(owner.sample().sourceReady, false);
  assert.equal(owner.sample().audibleSeconds, 0); owner.dispose();
});

test('intentional lowering preserves only the current pitched release tail, and later pause still cancels it', async () => {
  const { owner, context } = make(); await owner.initialize(); owner.setPaused(false);
  owner.rattle(.8); owner.update({ state: state('cranking'), events: [] });
  owner.update({ state: state('slamming', .1), events: [{ type: 'slam-start' }] });
  const release = context.sources.find(source => /release-tonal-slip/.test(source.buffer.assetName));
  assert.ok(release);
  owner.dispose({ releaseTail: true }); owner.dispose();
  assert.equal(release.stops, 0, 'lowering must not chop the just-triggered comb rake');
  assert.ok(context.sources.filter(source => source !== release).every(source => source.stops === 1));
  assert.equal(owner.sample().audibleSeconds, 0); assert.equal(owner.sample().audioRunning, false);
  const count = context.sources.length;
  owner.update({ state: state('cranking'), events: [{ type: 'slam-start' }] });
  assert.equal(context.sources.length, count);
  owner.setPaused(true); assert.equal(release.stops, 1, 'focus/pause can cancel even a disposed owner’s permitted tail');
});
