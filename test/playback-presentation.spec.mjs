import assert from 'node:assert/strict';

import { buildPlaybackSnapshot, PLAYBACK } from '../src/game/playback.js';
import { buildPlaybackViewModel, drawPlaybackOverlay, formatPlaybackTime } from '../src/render/playback-view.js';

const take = {
  roomId: 'soundnoisemusic',
  at: 123456,
  audible: [[4, .12], [8, .22], [12, .08]],
  discrete: [{ cueId: 'bell.tenor.clock', atSec: 30 }],
  guest: { id: 'hidden-audio-layer' },
};
const playing = { roomId: take.roomId, startedAt: 10, endsAt: 10 + PLAYBACK.seconds };
const early = buildPlaybackSnapshot({ take, playing, now: 12 });
const late = buildPlaybackSnapshot({ take, playing, now: 27 });

assert.equal(early.roomId, take.roomId);
assert.equal(early.sourceCount, 3);
assert.equal(early.eventCount, 1);
assert.equal(early.markers.length, 1);
assert.ok(early.progress > 0 && early.progress < 1);
assert.ok(late.progress > early.progress);
assert.ok(late.tapeDrift > early.tapeDrift, 'the trace can become visually less stable without naming why');
assert.ok(late.signalLeft >= 0 && late.signalLeft <= 1);
assert.ok(late.signalRight >= 0 && late.signalRight <= 1);

const view = buildPlaybackViewModel(late, { roomTitle: 'the practice wing', takeNumber: 4 });
assert.equal(view.takeLabel, 'TAKE 04');
assert.equal(view.roomTitle, 'THE PRACTICE WING');
assert.equal(view.elapsedLabel, '00:17');
assert.match(view.printLabel, /3 SOURCES/);
assert.match(view.printLabel, /1 EVENT/);
assert.doesNotMatch(JSON.stringify(view), /guest|hidden-audio-layer/i,
  'the transport never acknowledges or classifies the extra voice');

assert.equal(formatPlaybackTime(0), '00:00');
assert.equal(formatPlaybackTime(65.9), '01:05');
assert.equal(buildPlaybackSnapshot({}), null);
assert.equal(buildPlaybackViewModel(null), null);
assert.equal(drawPlaybackOverlay({
  snapshot: late, cols: 120, rows: 37, roomTitle: 'the practice wing', takeNumber: 4,
}), true, 'the full 960×600-class transport renders without requiring a DOM-backed test canvas');
assert.equal(drawPlaybackOverlay({
  snapshot: late, cols: 60, rows: 24, roomTitle: 'the practice wing', takeNumber: 4,
}), true, 'the compact transport also renders without overflowing its code path');

console.log('playback presentation contracts passed');
