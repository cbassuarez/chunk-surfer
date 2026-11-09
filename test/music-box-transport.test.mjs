import test from 'node:test';
import assert from 'node:assert/strict';
import { createMusicBoxTransport, loadMusicBoxReference, peekMusicBoxReference } from '../src/audio/music-box-transport.js';
import { MUSIC_BOX_REFERENCE } from '../src/data/music-box-reference.js';
import { musicBoxContext, musicBoxFetcher, musicBoxUrl, flushAudio } from './helpers/music-box-audio-context.mjs';

const make = (extra = {}) => { const context = musicBoxContext(); return { context,
  owner: createMusicBoxTransport({ context, destination: context.destination, fetcher: musicBoxFetcher, urlFor: musicBoxUrl, ...extra }) }; };

test('the reference is one decoded recording, shared between owners and never a procedural placeholder', async () => {
  const { context, owner } = make();
  assert.equal(peekMusicBoxReference(context, { urlFor: musicBoxUrl }), null);
  assert.equal(await owner.initialize(), true);
  const reference = await loadMusicBoxReference(context, { fetcher: musicBoxFetcher, urlFor: musicBoxUrl });
  assert.strictEqual(peekMusicBoxReference(context, { urlFor: musicBoxUrl }), reference);
  const second = createMusicBoxTransport({ context, destination: context.destination, fetcher: musicBoxFetcher, urlFor: musicBoxUrl });
  second.play();
  assert.equal(context.decodes, 1); assert.strictEqual(second.source.buffer, reference);
  assert.equal(second.source.playbackRate.value, 1);
  assert.equal(reference.duration, MUSIC_BOX_REFERENCE.durationSeconds);
});

test('pause freezes position; resume starts from that exact point at the recorded pitch', async () => {
  const { context, owner } = make(); await owner.initialize(); owner.play({ offset: 2 });
  context.currentTime = 3; owner.pause();
  assert.equal(owner.sample().position, 5); assert.equal(context.sources[0].stops, 1);
  context.currentTime = 40; assert.equal(owner.sample().position, 5);
  owner.resume(); assert.deepEqual(context.sources[1].starts, [{ at: 40, offset: 5 }]);
  assert.equal(context.sources[1].playbackRate.value, 1);
});

test('mechanical position can resynchronize without changing sample pitch or duplicating sources', async () => {
  const { context, owner } = make(); await owner.initialize();
  owner.sync({ position: 4, playing: true });
  for (let i = 0; i < 30; i++) { context.currentTime += 1 / 60; owner.sync({ position: 4 + context.currentTime, playing: true }); }
  assert.equal(context.sources.length, 1);
  owner.sync({ position: 9, playing: true }); assert.equal(context.sources[0].stops, 1);
  assert.equal(context.sources.length, 2); assert.equal(context.sources[1].playbackRate.value, 1);
  owner.sync({ position: 9, playing: false }); assert.equal(owner.sample().position, 9);
});

test('pause and disposal during a delayed decode cannot start late playback', async () => {
  for (const action of ['pause', 'dispose']) {
    let release;
    const fetcher = () => new Promise(resolve => { release = resolve; });
    const { context, owner } = make({ fetcher }); owner.play(); await flushAudio();
    owner[action](); release(await musicBoxFetcher()); await flushAudio();
    assert.equal(context.sources.length, 0, action); assert.equal(owner.sample().running, false);
  }
});

test('failed assets are retryable and silence does not report running', async () => {
  let calls = 0;
  const fetcher = async () => ++calls === 1 ? { ok: false, status: 503 } : musicBoxFetcher();
  const { owner } = make({ fetcher });
  assert.equal(await owner.initialize(), false); assert.match(owner.error(), /unavailable/);
  assert.equal(owner.sample().running, false); assert.equal(await owner.initialize(), true);
  assert.equal(calls, 2);
});

test('loop wrapping, natural completion and repeated disposal are bounded', async () => {
  const { context, owner } = make(); await owner.initialize(); owner.play({ loop: true, offset: 45 });
  context.currentTime = 3; assert.ok(Math.abs(owner.sample().position - 1.7) < 1e-8);
  owner.play(); const source = owner.source; source.onended();
  assert.equal(owner.sample().state, 'ended'); assert.equal(owner.sample().position, 46.3);
  owner.dispose(); owner.dispose(); assert.equal(owner.sample().running, false); assert.equal(owner.out.disconnected, true);
});

test('recorded handling rattles have a threshold, cooldown and voice cap; release has priority', async () => {
  const { createMusicBoxContacts } = await import('../src/audio/music-box-transport.js');
  const context = musicBoxContext();
  const contacts = createMusicBoxContacts({ context, destination: context.destination, fetcher: musicBoxFetcher, urlFor: musicBoxUrl });
  await contacts.initialize();
  assert.equal(contacts.playRattle({ amount: .001 }), false);
  for (let frame = 0; frame < 60; frame++) { context.currentTime = frame / 60; contacts.playRattle({ amount: .8 }); }
  assert.equal(context.sources.length, 3, 'continuous orbital input cannot build an audio storm');
  assert.ok(context.sources.every(source => source.buffer.duration === .6 && source.playbackRate.value === 1));
  assert.equal(contacts.playRelease(), true); assert.equal(context.sources.length, 4);
  assert.equal(context.sources[0].stops, 1); assert.equal(context.sources[3].buffer.duration, .62);
  contacts.stop(); assert.ok(context.sources.every(source => source.stops === 1)); contacts.dispose();
});

test('every rapid key release starts a pitched voice; release tones have no cooldown or random omission', async () => {
  const { createMusicBoxContacts } = await import('../src/audio/music-box-transport.js');
  const context = musicBoxContext();
  const contacts = createMusicBoxContacts({ context, destination: context.destination, fetcher: musicBoxFetcher, urlFor: musicBoxUrl });
  await contacts.initialize();
  for (let release = 0; release < 16; release++) {
    context.currentTime = release * .025;
    assert.equal(contacts.playRelease(), true, `release ${release} cannot be swallowed`);
  }
  assert.equal(context.sources.length, 16);
  assert.ok(context.sources.every(source => source.starts.length === 1 && /release-tonal-slip/.test(source.buffer.assetName)));
  assert.ok(context.sources.every(source => source.playbackRate.value === 1));
  assert.equal(context.sources.filter(source => source.stops === 0).length, 3, 'voices remain bounded without suppressing new pitched attacks');
  assert.equal(contacts.playRattle({ amount: 1 }), false, 'incidental rattle cannot displace active release tones');
  contacts.dispose(); assert.ok(context.sources.every(source => source.stops === 1));
});

test('an intentional release tail cleans up naturally and cannot queue later playback', async () => {
  const { createMusicBoxContacts } = await import('../src/audio/music-box-transport.js');
  const context = musicBoxContext();
  const contacts = createMusicBoxContacts({ context, destination: context.destination, fetcher: musicBoxFetcher, urlFor: musicBoxUrl });
  await contacts.initialize(); contacts.playRattle({ amount: 1 }); contacts.playRelease();
  const release = context.sources[1]; contacts.dispose({ releaseTail: true });
  assert.equal(context.sources[0].stops, 1); assert.equal(release.stops, 0);
  assert.equal(contacts.playRelease(), false); assert.equal(contacts.playRattle({ amount: 1 }), false);
  release.onended(); assert.equal(release.disconnected, true);
  assert.equal(context.nodes.filter(node => node.kind === 'gain').every(node => node.disconnected), true);
});
