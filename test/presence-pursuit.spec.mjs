import assert from 'node:assert/strict';

globalThis.document ||= { title: 'Chunk Surfer', baseURI: 'http://localhost/' };
globalThis.window ||= globalThis;

const PRES = await import('../src/game/presence.js');

function seedRandom(seed) {
  const original = Math.random;
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => { Math.random = original; };
}

const restore = seedRandom(0x5EB1);

// Silence is no longer a covert player target. The initial manifestation can
// simply stand there; moving the player does not rewrite its search origin.
PRES.spawnBehind(0, 0, 0, 1);
let actor = PRES.presenceState();
const spawn = { x: actor.x, y: actor.y };
PRES.updatePresence(1, 40, -30, null);
assert.deepEqual({ x: actor.x, y: actor.y }, spawn, 'a silent manifestation may stand still');
assert.equal(actor.motionMode, 'stand');
assert.deepEqual({ x: actor.lastSoundX, y: actor.lastSoundY }, spawn, 'silence never replaces belief with player position');

// Once its hold expires it searches around its last sound anchor, not around a
// newly moved player. This search may advance, limp, feint, or stop again.
actor.phaseUntil = -1;
PRES.updatePresence(.25, -80, 70, null);
assert.ok(['investigate', 'limp', 'feint', 'stand'].includes(actor.behaviorMode));
assert.ok(Math.hypot(actor.prowlX - spawn.x, actor.prowlY - spawn.y) < 24, 'search remains local to remembered sound');
assert.ok(Math.hypot(actor.prowlX + 80, actor.prowlY - 70) > 60, 'search does not orbit the player');

// A clue is fallible and produces a searching gait.
PRES.offerSoundTarget({ position: { x: 8, y: 2 }, level: .36, confidence: .38, priority: .52, expiresAt: performance.now() + 5000 });
assert.ok(['limp', 'investigate'].includes(actor.behaviorMode));
assert.notDeepEqual({ x: actor.targetX, y: actor.targetY }, { x: 8, y: 2 }, 'uncertain sound names an area, not an exact transform');

// A hot, certain sound creates a real chase burst, followed by a listening
// hesitation unless renewed by more hot noise.
PRES.offerSoundTarget({ position: { x: 2, y: 1 }, level: 1, confidence: 1, priority: .96, expiresAt: performance.now() + 5000 });
const before = PRES.distanceTo(2, 1);
PRES.updatePresence(.2, 2, 1, null);
assert.equal(actor.behaviorMode, 'chase');
assert.ok(PRES.distanceTo(2, 1) < before, 'pinpoint noise starts a chase');
actor.chaseUntil = -1;
PRES.updatePresence(.1, 2, 1, null);
assert.equal(actor.behaviorMode, 'listen', 'a chase burst stops to listen');
assert.equal(actor.motionMode, 'listen');

// PLAY has a physical consequence: it interrupts a non-hot approach and turns
// the next search into a stand/feint rather than only playing an audio cue.
actor.hasTarget = false;
actor.externalTargetUntil = -1;
actor.externalTargetPriority = 0;
actor.targetPriority = 0;
PRES.offerSoundTarget({ position: { x: 20, y: 4 }, level: .4, confidence: .55, priority: .6, expiresAt: performance.now() + 5000 });
PRES.setDirectorIntent({ kind: 'PLAY' });
PRES.updatePresence(.1, 100, 100, null);
assert.equal(actor.behaviorMode, 'stand');
actor.phaseUntil = -1;
PRES.updatePresence(.1, 100, 100, null);
assert.equal(actor.behaviorMode, 'feint');

// A flashlight is an intermittent, uncertain electrical sound. It can update
// belief when the listening cadence opens, but cannot track a moving player on
// each frame.
PRES.spawnBehind(0, 0, 0, 0);
actor = PRES.presenceState();
actor.nextLightListenAt = -1;
PRES.updatePresence(.016, 5, 0, null, {
  lightSound: { active: true, position: { x: 5, y: 0 }, level: .3, confidence: .38, occlusionDb: 0 },
});
assert.equal(actor.targetReason, 'FLASHLIGHT_ELECTRICAL_HUM');
const firstHumBelief = { x: actor.targetX, y: actor.targetY };
PRES.updatePresence(.016, -30, 25, null, {
  lightSound: { active: true, position: { x: -30, y: 25 }, level: .3, confidence: .38, occlusionDb: 0 },
});
assert.deepEqual({ x: actor.targetX, y: actor.targetY }, firstHumBelief, 'torch sound is sampled, not an exact per-frame tether');

// A sustained-hot forced contact shares awareness/cooldown bookkeeping and
// clears the target so a nearby body cannot immediately punish a second time.
PRES.offerSoundTarget({ position: { x: 1, y: 1 }, level: 1, confidence: 1, priority: 1, expiresAt: performance.now() + 5000 });
const caughtBefore = actor.caughtCount;
const forcedContact = PRES.commitForcedContact();
assert.equal(forcedContact.count, caughtBefore + 1);
assert.equal(actor.hasTarget, false);
assert.equal(actor.behaviorMode, 'stand');

// Source Contact is the exception to sound-belief pursuit: the authored body
// tails the player at exactly three quarters walking speed so forward walking
// opens the gap, then waits for the player to turn and interact. Proximity alone
// cannot spend that contact.
PRES.spawnAtCell(0, 0, { sector: 'source-rear' });
actor = PRES.presenceState();
actor.awareness = 1; // awareness must not inflate the literal Source ratio
actor.spawnedAt = -1e9;
let sourceCollision = 0;
PRES.updatePresence(.6, 100, 0, () => { sourceCollision += 1; }, {
  catchMode: 'source-checkpoint',
  sourceContactTarget: { x: 100, y: 0 },
  sourceContactSpeedRatio: PRES.PRESENCE.sourceContactSpeedRatio,
  suppressContact: true,
});
assert.ok(Math.abs(actor.x - 10) < 1e-6, 'Source Contact does not move at 75% of player locomotion');
assert.equal(actor.motionMode, 'walk');
const gapBefore = 10;
actor.x = 0;
const playerAfterOneSecond = 1000 / 45 + gapBefore;
PRES.updatePresence(1, playerAfterOneSecond, 0, () => { sourceCollision += 1; }, {
  catchMode: 'source-checkpoint',
  sourceContactTarget: { x: playerAfterOneSecond, y: 0 },
  sourceContactSpeedRatio: PRES.PRESENCE.sourceContactSpeedRatio,
  suppressContact: true,
});
assert.ok(playerAfterOneSecond - actor.x > gapBefore, 'walking cleanly does not outpace Source Contact');
actor.x = playerAfterOneSecond;
actor.y = 0;
PRES.updatePresence(.1, playerAfterOneSecond, 0, () => { sourceCollision += 1; }, {
  catchMode: 'source-checkpoint',
  sourceContactTarget: { x: playerAfterOneSecond, y: 0 },
  sourceContactSpeedRatio: PRES.PRESENCE.sourceContactSpeedRatio,
  suppressContact: true,
});
assert.equal(sourceCollision, 0, 'Source proximity resolves contact without the player interacting');

PRES.despawn();
restore();
console.log('presence sound-belief pursuit specs passed');
