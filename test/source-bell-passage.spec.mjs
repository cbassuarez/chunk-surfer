// THE BELL PASSAGE: THE TOWER ROAD, WALKED.
//
// This suite replaces test/source-tower-transition.spec.mjs, which proved that
// five wireframe masses on sine waves could be steered around inside eight and a
// half seconds of datamosh. That crossing is gone. Taking the bust's detour now
// opens a tier of Source space — four hundred metres of the ground the tape
// stands on, with the tower's own bell meshes standing in it at every size they
// are not, and St Brendan's belfry resolving out of the far end with one wall
// missing.
//
// So what has to hold is different in kind. Not "can the obstacle be dodged" but:
// is the place coherent, is it made of the building's real meshes, does the room
// arrive rather than switch on, does walking into it end the chapter exactly
// once, and does the road it commits to still reach the same belfry.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import {
  SOURCE_BELLS,
  SOURCE_BELLS_ROOM,
  SOURCE_BELL_PASSAGE,
  SOURCE_TIERS,
  SOURCE_TIER_BY_ID,
  inSourceBellsRoom,
  sourceBellsDepth,
  sourceBellsRoomResolve,
  sourceTierAt,
  sourceTierHeightAt,
  BELL_SWING,
  bellSwingAt,
} from '../src/data/source-level.js';
import { PROP_BOUNDS } from '../src/data/generated/prop-geometry.js';
import {
  CHUNK_SURF_PHASE,
  HORIZON_EXIT,
  SOURCE_FINALE_ROUTE,
  SOURCE_FINALE_STAGE,
  chunkSurfCompletion,
  reduceChunkSurf,
} from '../src/game/chunk-surf-state.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';

// ── the ground ──────────────────────────────────────────────────────────────
{
  const tier = SOURCE_TIER_BY_ID.bells;
  assert.ok(tier, 'the passage has a tier of its own');
  assert.equal(tier.field, false, 'it is outside the altitude economy, like the tape');
  assert.equal(tier.height, SOURCE_TIER_BY_ID.horizon.height,
    'walking off the recording into the bells is neither a climb nor a fall');
  const passageMid=(SOURCE_BELLS.from+SOURCE_BELLS.to)/2;
  const horizonMid=(SOURCE_TIER_BY_ID.horizon.from+SOURCE_TIER_BY_ID.horizon.to)/2;
  assert.equal(sourceTierAt(passageMid).id, 'bells');
  assert.equal(sourceTierHeightAt(passageMid), sourceTierHeightAt(horizonMid));
  // It begins exactly where the tape stops. A gap would be undrawn ground.
  assert.equal(SOURCE_BELLS.from, SOURCE_TIER_BY_ID.horizon.to);
  assert.equal(SOURCE_TIERS.at(-1).id, 'bells', 'and nothing is authored past it');
}

// ── the manifest is internally coherent ─────────────────────────────────────
{
  assert.equal(SOURCE_BELLS.from - SOURCE_BELLS.to, SOURCE_BELLS.length);
  const room = SOURCE_BELLS.room;
  assert.ok(room.at < SOURCE_BELLS.from && room.at > SOURCE_BELLS.to,
    'the room stands inside the passage rather than past the end of it');
  assert.ok(room.threshold > room.at, 'you cross the threshold before you reach the middle of the room');
  assert.ok(room.at - room.halfZ > SOURCE_BELLS.to, 'the far wall is still on authored ground');
  // The whole third act is the room getting closer, so the resolve span has to
  // be long, has to end before the door, and has to run the right way.
  assert.ok(SOURCE_BELLS.resolveFrom > SOURCE_BELLS.resolveTo);
  assert.ok(SOURCE_BELLS.resolveTo >= room.at - room.halfZ);
  assert.ok(SOURCE_BELLS.resolveFrom - SOURCE_BELLS.resolveTo >= 150,
    'the room arrives over a long walk, not in the last few strides');
  assert.ok(SOURCE_BELLS.resolveTo > room.threshold,
    'it has finished arriving before the player can walk into it');
}

// ── depth and resolve ───────────────────────────────────────────────────────
{
  assert.equal(sourceBellsDepth(SOURCE_BELLS.from), 0);
  assert.equal(sourceBellsDepth(SOURCE_BELLS.to), SOURCE_BELLS.length);
  assert.equal(sourceBellsDepth(SOURCE_BELLS.from + 500), 0, 'standing short of the seam is the head of the passage');
  assert.equal(sourceBellsDepth(SOURCE_BELLS.to - 500), SOURCE_BELLS.length, 'and it never runs off the end');

  assert.equal(sourceBellsRoomResolve(SOURCE_BELLS.from), 0);
  assert.equal(sourceBellsRoomResolve(SOURCE_BELLS.resolveFrom), 0, 'nothing out there yet');
  assert.equal(sourceBellsRoomResolve(SOURCE_BELLS.resolveTo), 1, 'fully arrived by the time you reach it');
  const mid = sourceBellsRoomResolve((SOURCE_BELLS.resolveFrom + SOURCE_BELLS.resolveTo) / 2);
  assert.ok(mid > .4 && mid < .6, 'and it comes up smoothly in between');
  // Monotone: a room that flickered as you walked would be a switch, not an arrival.
  let previous = -1;
  for (let y = SOURCE_BELLS.from; y >= SOURCE_BELLS.to; y -= 4) {
    const value = sourceBellsRoomResolve(y);
    assert.ok(value >= previous, `the room un-arrives at ${y}`);
    previous = value;
  }
}

// ── the room is a room, and it has three walls ──────────────────────────────
{
  const room = SOURCE_BELLS.room;
  assert.equal(inSourceBellsRoom(0, room.threshold - 1), true);
  assert.equal(inSourceBellsRoom(0, room.threshold + 1), false, 'the threshold is the way in');
  assert.equal(inSourceBellsRoom(room.halfX + 2, room.threshold - 1), false, 'and the walls are walls');

  const walls = SOURCE_BELLS_ROOM.filter((part) => part.mesh === 'tower_louvres');
  assert.ok(walls.length >= 6, 'the walls are courses of the belfry’s own louvres');
  const west = walls.filter((part) => part.x < -1);
  const east = walls.filter((part) => part.x > 1);
  const far = walls.filter((part) => Math.abs(part.x) <= 1 && part.y < room.at);
  assert.ok(west.length && east.length && far.length, 'west, east and far walls are all built');
  // THE FOURTH WALL IS SOURCE SPACE. Nothing is allowed to stand across the way
  // in — that opening is the entire image the passage exists to arrive at.
  const near = walls.filter((part) => part.y > room.at);
  assert.equal(near.length, 0, 'the side you walk in through is left open');

  // And what is hung in it is the ring the player is about to be standing under.
  const bells = SOURCE_BELLS_ROOM.filter((part) => /tower_bell_0/.test(part.mesh));
  assert.equal(bells.length, 6, 'six bells, which is what St Brendan’s has');
  assert.equal(new Set(bells.map((part) => part.mesh)).size, 6, 'and they are the six different bells');
  assert.ok(bells.every((part) => part.scale === 1), 'at true scale, which is the point of arriving');
  assert.ok(SOURCE_BELLS_ROOM.some((part) => part.mesh === 'tower_frame'), 'in a real frame');
  assert.ok(SOURCE_BELLS_ROOM.some((part) => part.mesh === 'tower_catwalk'), 'on a real deck');
}

// ── EVERYTHING OUT THERE CAN ACTUALLY BE REACHED ───────────────────────────
//
// The contract this file was missing, and it cost the whole third act.
//
// Crossing the room's threshold completes the chapter, and past it `inBells`
// clamps the world to the room's own width. So a piece authored beyond the
// threshold is not "further along the walk" — it is scenery nobody will ever
// stand next to. The room used to sit at depth 274 of a passage declared 432
// long, which put all six true-scale bells, their frame, and the entire
// resolution act behind the door. Every other assertion in this file passed
// while that was true.
{
  const depth = (entry) => SOURCE_BELLS.from - entry.y;
  const thresholdDepth = SOURCE_BELLS.from - SOURCE_BELLS.room.threshold;

  for (const entry of SOURCE_BELL_PASSAGE) {
    assert.ok(entry.y > SOURCE_BELLS.room.threshold,
      `${entry.id} stands at depth ${depth(entry).toFixed(0)}, past the threshold at ${thresholdDepth.toFixed(0)} — nobody can reach it`);
  }

  // And the walk uses the length it declares, rather than stopping two thirds
  // of the way down it.
  assert.ok(thresholdDepth > SOURCE_BELLS.length * 0.9,
    `the door is at depth ${thresholdDepth.toFixed(0)} of an authored ${SOURCE_BELLS.length}`);

  // THE LAST HUNDRED AND FORTY METRES IS THE RING. The prose above the act says
  // so, and 432 - 140 = 292, which is where it starts.
  const ring = SOURCE_BELL_PASSAGE.filter((entry) => /^bells-ring-\d/.test(entry.id));
  assert.equal(ring.length, 6);
  const first = depth(ring[0]), last = depth(ring[ring.length - 1]);
  assert.ok(first >= 280 && first <= 300, `the ring starts at ${first.toFixed(0)}, not ~292`);
  assert.ok(last > thresholdDepth - 20, 'and it runs up to the door rather than stopping short');
  assert.ok(last - first >= 100, 'spread across the act, not bunched into forty metres of it');
}

// ── MOTION FOLLOWS THE THREE ACTS ──────────────────────────────────────────
{
  const byId = (id) => SOURCE_BELL_PASSAGE.find((entry) => entry.id === id);
  const act = (prefix) => SOURCE_BELL_PASSAGE.filter((entry) => entry.id.startsWith(prefix));

  // ARCHITECTURE: nothing moves. Too big, half sunk, indifferent to you.
  for (const entry of act('bells-arch')) {
    assert.equal(entry.swing, undefined, `${entry.id} moves, and act one does not`);
    assert.equal(bellSwingAt(entry, 7.3), 0);
  }

  // NULL: it moves, and it is wrong.
  assert.equal(byId('bells-null-wheel').swing.kind, 'turn', 'a wheel with nothing in it, turning');
  assert.equal(byId('bells-null-inverted').swing.kind, 'rock', 'upside down, and rocking about it');
  assert.ok(act('bells-null-coin').every((entry) => entry.swing?.kind === 'shiver'),
    'and the coins shiver');
  // Rates unlinked from size is the whole idea: the smallest things move fastest.
  const coin = byId('bells-null-coin-1'), canopy = byId('bells-null-canopy');
  assert.ok(coin.swing.period < canopy.swing.period / 10,
    'a coin moves an order of magnitude faster than the thing the size of a house');

  // RESOLUTION: six bells, full circle, in order.
  const ring = SOURCE_BELL_PASSAGE.filter((entry) => /^bells-ring-\d/.test(entry.id));
  assert.equal(ring.length, 6);
  assert.ok(ring.every((entry) => entry.swing?.kind === 'ring'));
  assert.ok(ring.every((entry) => entry.swing.amp === BELL_SWING.FULL), 'all the way over');
  assert.ok(BELL_SWING.FULL > Math.PI * 0.9 && BELL_SWING.FULL < Math.PI,
    'a full-circle bell goes up past the balance, and not through it');
  const phases = ring.map((entry) => entry.swing.phase);
  assert.equal(new Set(phases).size, 6, 'in order — no two of them strike together');

  // NOTHING MAY EVER TOUCH THE PLAYER.
  //
  // Collision is the static footprint, so a piece that blocks must not swing far
  // enough to sweep ground it does not own. Large amplitudes live on pieces you
  // can walk through; a wheel is exempt because turning on its own axis covers
  // exactly the same ground at every angle.
  for (const entry of SOURCE_BELL_PASSAGE) {
    if (!entry.swing || !entry.blocks) continue;
    assert.ok(entry.swing.kind === 'turn' || Math.abs(entry.swing.amp || 0) <= 0.12,
      `${entry.id} blocks and swings ${entry.swing.amp} — it would sweep through the player`);
  }

  // The swing is a pure function of the piece and the clock, and it is bounded.
  for (const entry of SOURCE_BELL_PASSAGE) {
    assert.equal(bellSwingAt(entry, 4.2), bellSwingAt(entry, 4.2), 'deterministic');
    for (let t = 0; t < 40; t += 0.37) {
      assert.ok(Number.isFinite(bellSwingAt(entry, t)), `${entry.id} produced a non-finite roll`);
    }
  }
  assert.equal(bellSwingAt({}, 3), 0, 'a piece with no swing does not move');
  assert.equal(bellSwingAt(null, 3), 0);
}

// ── the passage is made of the building ─────────────────────────────────────
{
  const all = [...SOURCE_BELL_PASSAGE, ...SOURCE_BELLS_ROOM];
  assert.equal(new Set(all.map((entry) => entry.id)).size, all.length, 'nothing is placed twice');
  for (const entry of all) {
    assert.ok(PROP_BOUNDS[entry.mesh], `${entry.id} uses ${entry.mesh}, which is not in the built prop pack`);
    assert.ok(Number.isFinite(entry.x) && Number.isFinite(entry.y), `${entry.id} has no position`);
    assert.ok(entry.scale > 0, `${entry.id} has no size`);
    assert.ok(entry.y <= SOURCE_BELLS.from && entry.y >= SOURCE_BELLS.to - 10,
      `${entry.id} stands outside the passage`);
    assert.ok(Math.abs(entry.x) <= SOURCE_BELLS.halfWidth, `${entry.id} stands outside the open ground`);
  }
  // Every mesh is the tower's own. Nothing here is invented for the occasion:
  // the whole conceit is that these are the objects from the room at the end.
  assert.ok(all.every((entry) => entry.mesh.startsWith('tower_')),
    'the passage is built from St Brendan’s belfry and nothing else');

  // SCALE IS THE SUBJECT. Three acts, and the middle one is where size stops
  // meaning anything: architecture, then coins, then the ring at true scale.
  const scales = SOURCE_BELL_PASSAGE.map((entry) => entry.scale);
  assert.ok(Math.max(...scales) >= 20, 'something out there is the size of a building');
  assert.ok(Math.min(...scales) <= .5, 'and something out there is the size of a penny');
  const coins = SOURCE_BELL_PASSAGE.filter((entry) => entry.scale < 1);
  assert.ok(coins.length >= 8, 'the coins are a field you wade, not a couple of props');
  assert.ok(coins.every((entry) => !entry.blocks), 'and none of them is a trip hazard');
  // The ring at the end of the walk is in bell order, getting nearer to true.
  const ring = SOURCE_BELL_PASSAGE.filter((entry) => /^bells-ring-\d+$/.test(entry.id));
  assert.equal(ring.length, 6);
  for (let i = 1; i < ring.length; i += 1) {
    assert.ok(ring[i].y < ring[i - 1].y, 'the ring is walked through in order');
  }
  // One thing you pass underneath. Its mouth has to clear a standing body.
  const canopy = SOURCE_BELL_PASSAGE.find((entry) => entry.id === 'bells-null-canopy');
  assert.ok(canopy, 'there is a bell you walk under');
  assert.ok(canopy.elevation - 1.02 * canopy.scale > 2.2, 'and it clears your head');
}

// ── the walk ────────────────────────────────────────────────────────────────
{
  const completions = [];
  const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.NORMAL_EXIT, { seed: 4417 });
  const state = { ...built.state, profile: { ...built.state.profile, marbleEyes: 'returned' } };
  const runtime = createSourceSpaceRuntime({
    initialState: state,
    onComplete: (completion) => completions.push(completion),
  });
  runtime.setPlayerPosition(built.position);
  runtime.completeNormalExit();
  for (let beat = 0; beat < 3; beat += 1) runtime.talkToHorizonBust();
  runtime.decideHorizonBust(true);

  // Taking the detour opens the passage and does NOT close the chapter.
  const taken = runtime.takeHorizonBustDetour();
  assert.equal(taken.entered, 'bells');
  assert.equal(runtime.state().phase, CHUNK_SURF_PHASE.BELLS);
  assert.equal(runtime.state().active, true);
  assert.equal(runtime.state().completed, false);
  assert.equal(completions.length, 0, 'nothing is reported to the world yet');
  // The route commits at the bust, so a reload in the passage cannot re-choose.
  assert.equal(runtime.state().finale.route, SOURCE_FINALE_ROUTE.TOWER);
  assert.equal(runtime.state().finale.stage, SOURCE_FINALE_STAGE.TOWER_COMMITTED);

  const origin = runtime.state().landscapeOrigin || { x: 0, y: -252 };
  const head = runtime.bellsFrame();
  assert.equal(head.active, true);
  assert.equal(head.depth, SOURCE_BELLS.entryStandoff, 'he is put over the seam, not on it');
  assert.equal(head.resolve, 0);
  assert.equal(head.atRoom, false);

  // Halfway down, the room is on its way and the walk has something left in it.
  runtime.setPlayerPosition({ x: origin.x, y: origin.y + (SOURCE_BELLS.resolveFrom + SOURCE_BELLS.resolveTo) / 2, facing: 0 });
  const middle = runtime.bellsFrame();
  assert.ok(middle.resolve > .4 && middle.resolve < .6);
  assert.ok(middle.remaining > 0);

  // And walking in through the missing wall ends the chapter, once.
  const outside = { x: origin.x, y: origin.y + SOURCE_BELLS.room.threshold + 2 };
  const doorway = { x: origin.x, y: origin.y + SOURCE_BELLS.room.threshold - 1 };
  runtime.setPlayerPosition({ ...outside, facing: 0 });
  assert.equal(runtime.bellsFrame().atRoom, false);
  runtime.onStep(outside, doorway);
  assert.equal(runtime.state().phase, CHUNK_SURF_PHASE.COMPLETED);
  assert.equal(completions.length, 1, 'the room reports exactly once');
  runtime.onStep(doorway, { x: origin.x, y: doorway.y - 1 });
  assert.equal(completions.length, 1, 'and walking further into it does not report again');

  const completion = completions[0];
  assert.equal(completion.route, SOURCE_FINALE_ROUTE.TOWER);
  assert.equal(completion.transitionTarget, 'cathedral', 'the road still ends in the belfry');
  assert.ok(completion.flags.includes('chunkSurf.horizon.exit.tower'));
}

// ── the reducer grammar ─────────────────────────────────────────────────────
{
  const dispatch = (state, type, details = {}) => reduceChunkSurf(state, { type, ...details });
  let state = dispatch(buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FINAL, { seed: 4417, marbleEyes: 'returned' }).state, 'SOURCE_NORMAL_EXIT');
  state = dispatch(state, 'HORIZON_BUST_RECOGNIZED', { eligible: true });
  state = dispatch(state, 'HORIZON_BUST_DECIDED', { decision: 'accepted' });
  state = dispatch(state, 'HORIZON_EXIT_CHOSEN', { exit: HORIZON_EXIT.TOWER });
  assert.equal(state.phase, CHUNK_SURF_PHASE.BELLS);
  // The room is the only way out of the passage.
  assert.deepEqual(dispatch(state, 'SOURCE_NORMAL_EXIT'), state);
  const done = dispatch(state, 'BELLS_ROOM_ENTERED');
  assert.equal(done.completed, true);
  assert.equal(chunkSurfCompletion(done).transitionTarget, 'cathedral');
  // And it only fires from inside the passage.
  assert.deepEqual(dispatch(done, 'BELLS_ROOM_ENTERED'), done);
}

// ── the datamosh is gone ────────────────────────────────────────────────────
{
  assert.equal(existsSync('src/game/source-tower-transition-scene.js'), false,
    'the crossing scene was deleted, not left behind as dead code');
  const main = readFileSync('src/main.js', 'utf8');
  assert.doesNotMatch(main, /createSourceTowerTransitionScene/,
    'and nothing in the game still reaches for it');
  const handover = main.slice(
    main.indexOf('function beginSourceTowerTransition()'),
    main.indexOf('function resumeSourceTowerTransitionFromSave()'),
  );
  assert.ok(handover.length > 200);
  assert.doesNotMatch(handover, /Datamosh/, 'the tower road is a place, not an encoder effect');
  assert.match(handover, /GOD_LOCATION_HOOKS\['cathedral-belfry'\]/, 'it hands over into the real bell chamber');
}

console.log(`source bell passage specs passed (${SOURCE_BELL_PASSAGE.length} placements, ${SOURCE_BELLS_ROOM.length} room parts, ${SOURCE_BELLS.length}m)`);
