import assert from 'node:assert/strict';
import test from 'node:test';

import { CausalRecorder } from '../src/causal/recorder.js';
import {
  beginSourceReplayTake,
  buildSourceReprisePlan,
  checkpointSourceReprise,
  completeSourceReplayTake,
  freshSourceReplayManifest,
  normalizeSourceReplayManifest,
  noteSourceReplayBattle,
  noteSourceReplayContact,
  noteSourceReplayEntry,
  sourceReplayFallback,
} from '../src/game/source-replay-manifest.js';

test('same-run manifest preserves completed take order and bounded pose provenance', () => {
  let manifest = freshSourceReplayManifest({ runId: 'night-1' });
  for (let ordinal = 1; ordinal <= 4; ordinal += 1) {
    const pending = beginSourceReplayTake(manifest, {
      ordinal,
      roomId: `room-${ordinal}`,
      place: { x: ordinal, y: ordinal + 1 },
      startedAt: ordinal * 100,
      approach: Array.from({ length: 150 }, (_, t) => ({
        t, x: t / 10, y: ordinal, roomId: `room-${ordinal}`, spaceId: 'conservatory', secret: 'drop-me',
      })),
    });
    manifest = completeSourceReplayTake(manifest, pending, { completedAt: ordinal * 1000 });
  }
  assert.deepEqual(manifest.takes.map((take) => take.roomId), ['room-1', 'room-2', 'room-3', 'room-4']);
  assert.equal(manifest.takes[0].approach.length, 96);
  assert.equal('secret' in manifest.takes[0].approach[0], false);

  manifest = noteSourceReplayEntry(manifest, { at: 9000, locus: { x: 8, y: 9 } });
  const plan = buildSourceReprisePlan(manifest);
  assert.deepEqual(plan['call-site'].segments.map((segment) => segment.roomId), ['room-1', 'room-2']);
  assert.deepEqual(plan['final-clause'].segments.map((segment) => segment.kind), [
    'recording-room', 'recording-room', 'recording-room', 'recording-room', 'source-threshold',
  ]);
});

test('borrowed body recombines only battle and HUSH evidence the run actually contains', () => {
  let manifest = sourceReplayFallback({ runId: 'night-2', takes: [{ roomId: 'main_b3' }] });
  let plan = buildSourceReprisePlan(manifest);
  assert.deepEqual(plan['borrowed-body'].segments.map((segment) => segment.kind), ['recording-room']);

  manifest = noteSourceReplayBattle(manifest, { id: 'natatorium', result: 'win', at: 20 });
  manifest = noteSourceReplayContact(manifest, { reason: 'first-contact', at: 30, injuryCount: 1 });
  plan = buildSourceReprisePlan(manifest);
  assert.deepEqual(plan['borrowed-body'].segments.map((segment) => segment.kind), [
    'battle-space', 'hush-contact', 'recording-room',
  ]);
});

test('a stale manifest is emptied instead of leaking a prior night into replay', () => {
  const stale = sourceReplayFallback({ runId: 'old-night', takes: [{ roomId: 'the_tub' }] });
  const normalized = normalizeSourceReplayManifest(stale, { runId: 'new-night' });
  assert.equal(normalized.runId, 'new-night');
  assert.deepEqual(normalized.takes, []);
});

test('a fresh pre-run manifest adopts the active night id on first write', () => {
  const normalized = normalizeSourceReplayManifest(freshSourceReplayManifest(), { runId: 'active-night' });
  assert.equal(normalized.runId, 'active-night');
});

test('R checkpoint is durable only after the reprise is completed', () => {
  const manifest = freshSourceReplayManifest({ runId: 'night-3' });
  const active = checkpointSourceReprise(manifest, { id: 'call-site', movementIndex: 0, continuation: { hp: 20 } });
  assert.equal(active.encounter.active, 'call-site');
  assert.deepEqual(active.encounter.completed, []);
  const completed = checkpointSourceReprise(active, { id: 'call-site', movementIndex: 1, continuation: { hp: 20 }, completed: true });
  assert.equal(completed.encounter.active, null);
  assert.deepEqual(completed.encounter.completed, ['call-site']);
  assert.equal(completed.encounter.movementIndex, 1);
});

test('causal poseWindow copies and uniformly bounds poses without event payloads', () => {
  const recorder = new CausalRecorder();
  recorder.active = true;
  recorder.frames = Array.from({ length: 20 }, (_, index) => ({
    t: index * 100,
    x: index,
    y: 2,
    yaw: .1,
    pitch: 0,
    roomId: 'main_b3',
    renderGroup: 'basement',
    spaceId: index < 18 ? 'conservatory' : 'source-space',
    microphone: 'must-not-copy',
  }));
  recorder.elapsedMs = 1900;
  const poses = recorder.poseWindow({ fromMs: 200, toMs: 1700, maxFrames: 5, spaceId: 'conservatory' });
  assert.equal(poses.length, 5);
  assert.equal(poses[0].t, 200);
  assert.equal(poses.at(-1).t, 1700);
  assert.equal('microphone' in poses[0], false);
});
