import assert from 'node:assert/strict';

import { ACHIEVEMENT_BY_ID } from '../src/progression/achievement-defs.js';
import { exportProfile, mergeImportedProfile, validateProfileImport } from '../src/progression/profile.js';
import { freshMeta } from '../src/progression/schema.js';
import { mergeRemoteProfile } from '../src/progression/platform-sync.js';

const local = freshMeta();
local.endingsSeen = ['sacrifice'];
local.achievements.ACH_FIRST_TAKE = { unlockedAt: 100, runId: 'run_a', build: 'LOCAL' };
local.stats.takesCompleted = 2;
local.knowledge.lines.alpha = { firstSeenAt: 100, firstSeenRunId: 'run_a', lastSeenAt: 100, count: 1 };
local.platform.pendingAchievements = ['ACH_FIRST_TAKE'];
local.presentation.pendingNotices = [{ id: 'local-notice' }];

const exported = exportProfile(local, {
  lastDifficulty: 'night',
  seenTextMode: 'instant',
  archiveSignals: 'off',
  condensedCheckIn: true,
  customShiftRules: { presencePressure: 'severe', escapeTimer: 'off' },
}, { build: 'TEST', now: 1000 });
assert.equal(exported.format, 'chunk-surfer-profile');
assert.equal(exported.version, 1);
assert.equal(exported.settings.lastDifficulty, 'night');
assert.equal(exported.settings.customShiftRules.escapeTimer, 'off');
assert.equal('platform' in exported.meta, false);
assert.equal('presentation' in exported.meta, false);
assert.equal(validateProfileImport(exported).ok, true);
assert.equal(validateProfileImport({ format: 'other', version: 1 }).ok, false);

const imported = structuredClone(exported);
imported.meta.endingsSeen.push('inversion', 'unknown');
imported.meta.achievements.ACH_NAME_SARAH = { unlockedAt: 200, runId: 'run_b', build: 'ITCH' };
imported.meta.achievements.ACH_NOT_REAL = { unlockedAt: 1 };
imported.meta.stats.takesCompleted = 7;
imported.meta.knowledge.lines.alpha = { firstSeenAt: 50, firstSeenRunId: 'run_old', lastSeenAt: 300, count: 4 };
imported.meta.knowledge.lines.beta = { firstSeenAt: 200, firstSeenRunId: 'run_b', lastSeenAt: 200, count: 1 };
imported.meta.challengeCompletions.deadAir = true;

const merged = mergeImportedProfile(local, { volume: 0.8 }, imported);
assert.equal(merged.ok, true);
assert.deepEqual(merged.meta.endingsSeen.sort(), ['inversion', 'sacrifice']);
assert.ok(merged.meta.achievements.ACH_FIRST_TAKE);
assert.ok(merged.meta.achievements.ACH_NAME_SARAH);
assert.equal(merged.meta.achievements.ACH_NOT_REAL, undefined);
assert.equal(merged.meta.stats.takesCompleted, 7);
assert.equal(merged.meta.knowledge.lines.alpha.firstSeenAt, 50);
assert.equal(merged.meta.knowledge.lines.alpha.firstSeenRunId, 'run_old');
assert.equal(merged.meta.knowledge.lines.alpha.count, 4);
assert.ok(merged.meta.knowledge.lines.beta);
assert.equal(merged.meta.challengeCompletions.deadAir, true);
assert.deepEqual(merged.meta.platform.pendingAchievements, ['ACH_FIRST_TAKE']);
assert.deepEqual(merged.meta.presentation.pendingNotices, [{ id: 'local-notice' }]);
assert.equal(merged.settings.seenTextMode, 'instant');
assert.equal(merged.settings.volume, 0.8);

const remote = mergeRemoteProfile(local, {
  achievements: ['ACH_NAME_SARAH', 'ACH_NOT_REAL'],
  stats: { STAT_TAKES_COMPLETED: 9, STAT_RUNS_STARTED: 4, UNKNOWN: 500 },
});
assert.ok(remote.achievements.ACH_NAME_SARAH);
assert.equal(remote.achievements.ACH_NOT_REAL, undefined);
assert.equal(remote.stats.takesCompleted, 9);
assert.equal(remote.stats.runsStarted, 4);
assert.equal(remote.stats.UNKNOWN, undefined);
for (const id of Object.keys(remote.achievements)) assert.ok(ACHIEVEMENT_BY_ID[id]);

console.log('progression profile tests ok');
