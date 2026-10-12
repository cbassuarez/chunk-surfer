import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { ENDING_CUTSCENES, ENDING_MANIFEST } from '../src/data/endings.js';
import * as FP from '../src/world/floorplan.js';
import { advanceEndingCutscene, createEndingCutsceneState } from '../src/game/ending-cutscene.js';
import { createDraggedPayloadState, draggedPayloadStep, dropDraggedPayload, gripDraggedPayload } from '../src/game/dragged-payload.js';
import {
  cathedralBodiesOutsideWest, cathedralExtractionAnchors, cathedralGroundRuntimePoint,
  createCathedralExtractionCheckpoint, normalizeCathedralExtractionCheckpoint,
  restoreCathedralExtractionCheckpoint,
} from '../src/game/cathedral-extraction.js';
import { evaluateCondition } from '../src/narrative/conditions.js';

FP.compile(conservatory.levels, {
  width: conservatory.width, height: conservatory.height,
  widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [], edgePortals: conservatory.edgePortals || [], doors: conservatory.doors || [],
});

const spec = ENDING_CUTSCENES['tower-won'];
const crossing = cathedralGroundRuntimePoint(FP, { x: 16, y: 73 });
const anchors = cathedralExtractionAnchors(FP, { bodyPosition: crossing });

// These are actual compiled church coordinates. The old yard-local address
// rendered at this same nave position but belonged to a different logical cell.
assert.equal(FP.logicalToPhysical(anchors.nave.x, anchors.nave.y).owner, 'cathedral_ground');
assert.equal(FP.isSolid(anchors.nave.x, anchors.nave.y), false);
assert.notDeepEqual(anchors.nave, FP.toRuntimePoint({ x: 16, y: 64 }));
assert.deepEqual(anchors.westDoors, (() => {
  const door = FP.doorState().find((entry) => entry.id === 'brendan-west-door');
  return { x: door.cx, y: door.cy };
})());

let score = advanceEndingCutscene(createEndingCutsceneState(spec), spec, {
  interaction: 'grip-surfer', position: crossing, anchors,
}).state;
assert.equal(score.cursor, 1);
score = advanceEndingCutscene(score, spec, { position: anchors.nave, anchors }).state;
assert.equal(score.cursor, 2, 'the real nave satisfies the mandatory nave beat');
score = advanceEndingCutscene(score, spec, { position: anchors.westDoors, anchors }).state;
assert.equal(score.cursor, 3, 'the real west threshold satisfies its position beat');
score = advanceEndingCutscene(score, spec, { interaction: 'open-west-doors', position: anchors.westDoors, anchors }).state;
score = advanceEndingCutscene(score, spec, { elapsedMs: 5000, position: anchors.westDoors, anchors }).state;
assert.equal(score.complete, true, 'a real church extraction cannot wait forever on an unrelated logical nave');
assert.equal(spec.beats.some((beat) => beat.effect === 'threshold-regrip'), false);
assert.equal(ENDING_MANIFEST['tower-won'].environment.some((step) => step.action === 'take-weight'), false,
  'the ordinary-weight choice does not silently include the helper handoff');

// Save at a turn with an already-fired grip beat. Restoring must preserve the
// body independently of the player, and the next follower step must be identical.
let drag = gripDraggedPayload(createDraggedPayloadState({ position: crossing, spacing: 2.3 }), crossing);
let player = crossing;
for (const next of [{ x: crossing.x, y: crossing.y - 1 }, { x: crossing.x, y: crossing.y - 2 }, { x: crossing.x + .5, y: crossing.y - 3 }]) {
  drag = draggedPayloadStep(drag, player, next).state;
  player = next;
}
const partialScore = advanceEndingCutscene(createEndingCutsceneState(spec), spec, { interaction: 'grip-surfer' }).state;
const escape = { kind: 'cathedral-carry', stage: 'drag', pace: .52, exitCell: anchors.westDoors, drag, dragVector: { x: .5, y: -1 }, carryProgress: .2 };
const saved = createCathedralExtractionCheckpoint({
  escape, cutscene: { state: partialScore, origin: { ...crossing, yaw: .2, forward: [0, -1] } },
  player, playerPose: { yaw: .4, pitch: -.1, facing: 3 },
});
const restored = restoreCathedralExtractionCheckpoint(JSON.parse(JSON.stringify(saved)));
assert.deepEqual(restored.escape, escape);
assert.deepEqual(restored.player, player);
assert.deepEqual(restored.playerPose, { yaw: .4, pitch: -.1, facing: 3 });
assert.deepEqual(restored.cutscene, partialScore);
assert.deepEqual(restored.cutsceneOrigin, { ...crossing, yaw: .2, forward: [0, -1] });
assert.notDeepEqual(restored.escape.drag.position, player, 'the body does not teleport to the player');
assert.equal(advanceEndingCutscene(restored.cutscene, spec, { interaction: 'grip-surfer' }).events.length, 0,
  'reload does not replay the already-fired grip beat');
const next = { x: player.x + .5, y: player.y - 1 };
assert.deepEqual(draggedPayloadStep(restored.escape.drag, player, next), draggedPayloadStep(drag, player, next),
  'the complete trail gives exactly the same next step after reload');

const dropped = createCathedralExtractionCheckpoint({ escape: { ...escape, drag: dropDraggedPayload(drag) }, cutscene: partialScore, player: next });
const droppedRestore = restoreCathedralExtractionCheckpoint(JSON.parse(JSON.stringify(dropped)));
assert.equal(droppedRestore.escape.drag.gripped, false);
assert.deepEqual(droppedRestore.escape.drag.position, drag.position);
assert.equal(normalizeCathedralExtractionCheckpoint({ schema: 1, drag: { position: { x: null, y: 2 } } }), null);
assert.equal(restoreCathedralExtractionCheckpoint({ schema: 0 }), null, 'legacy recovery must use an authored location');

const exterior={x:257,y:359},doorBody={x:257,y:361.3},clearBody={x:257,y:359.3};
assert.notEqual(FP.zoneAt(doorBody.x,doorBody.y),FP.zoneAt(crossing.x,crossing.y),
  'the logical door volume differs from the church despite still being inside the physical plane');
assert.equal(cathedralBodiesOutsideWest(FP,exterior,doorBody),false,
  'a body in the door volume has not earned the extraction');
assert.equal(cathedralBodiesOutsideWest(FP,{x:257,y:357},clearBody),true,
  'both real centres clear the west plane with a quarter-metre margin');
// The compiled portal centre is55.25m; the real leaf is at55.0m. Test both
// bodies against the latter, including continuous follower positions.
const physicalPoint=(z,x=16)=>{const p=FP.logicalAtPhysical(x/.5,z/.5,{group:'ground',floor:0});assert.ok(p);return{x:p.x,y:p.y};};
const quarterClear=physicalPoint(54.75),tooNear=physicalPoint(54.751),oldFalsePositive=physicalPoint(54.9);
assert.equal(cathedralBodiesOutsideWest(FP,physicalPoint(53.5),quarterClear),true,
  'a centre exactly0.25m beyond the authored leaf clears it');
assert.equal(cathedralBodiesOutsideWest(FP,physicalPoint(53.5),tooNear),false,
  'the trailing body must clear the authored leaf by the full0.25m');
assert.equal(cathedralBodiesOutsideWest(FP,oldFalsePositive,physicalPoint(53.5)),false,
  'the player also needs the full0.25m margin, not the compiled-cell-centre margin');
assert.equal(cathedralBodiesOutsideWest(FP,physicalPoint(53.5),physicalPoint(54.65,17.5)),true,
  'the authored door lane includes its actual1.5m lateral edge');
assert.equal(cathedralBodiesOutsideWest(FP,physicalPoint(53.5),physicalPoint(54.65,17.501)),false,
  'the compiled centre cannot widen the extraction lane past its authored edge');
assert.equal(cathedralBodiesOutsideWest(FP,{x:280,y:357},clearBody),false,
  'being west of the church elsewhere is not the ceremonial door extraction');

const peal = ENDING_CUTSCENES['tower-lost'];
assert.equal(peal.beats.length, 8);
assert.deepEqual(peal.beats.map((beat) => beat.cue), Array.from({ length: 8 }, (_, i) => `ending.bell.${i + 1}`));
assert.equal(peal.finalAction.optional, true);
assert.equal(peal.finalAction.expressionOnly, true);
assert.equal(advanceEndingCutscene(createEndingCutsceneState(peal), peal, { elapsedMs: 10000 }).state.complete, true,
  'the peal completes without any resistance input');

for (const [id, expected] of [['ending.tower-won', 'chair'], ['ending.epilogue.tower-won', 'RECORDING RETAINED'], ['ending.tower-lost', 'chair scrape']]) {
  const document = JSON.parse(readFileSync(new URL(`../content/narrative/${id}.story.json`, import.meta.url), 'utf8'));
  const callback = document.nodes.start.lines.find((line) => line.when === 'station.recordist.complete' && line.text.includes(expected));
  assert.ok(callback, `${id} has a concrete recording callback`);
  assert.equal(evaluateCondition(callback.when, { station: { recordist: { complete: true } } }), true);
  assert.equal(evaluateCondition(callback.when, { station: { recordist: { complete: false } } }), false);
}

console.log('cathedral extraction specs passed');
