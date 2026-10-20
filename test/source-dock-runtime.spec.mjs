import assert from 'node:assert/strict';
import { SOURCE_HANGING_SHORE } from '../src/data/source-hanging-shore.js';
import { test } from 'node:test';
import { CELL, MATERIAL, ZONE } from '../src/data/floorplan/legend.js';
import {
  SOURCE_DOCK_DESIGN,
  SOURCE_GET_IN_BOUNDS,
  SOURCE_LANDING_PORTAL_APERTURE,
  SOURCE_LANDING_PORTAL_LOCAL,
  sourceLandingCellAt,
  sourceLandingPropCollisionAt,
  sourceLandingPropFootprints,
  sourceLandingPropPlacements,
  sourceLandingRecognitions,
} from '../src/data/source-landing.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime, SOURCE_TRANSFORM_SECONDS } from '../src/game/source-space-runtime.js';
import { applyHushTorchInterference, computeHushField } from '../src/game/hush-field.js';
import { fieldKitEffects } from '../src/game/field-kit.js';
import { applyFieldKitTorchLook } from '../src/render/field-kit-torch.js';
import { applySourceEmergencyTorch, resolveTorchLook } from '../src/render/lighting-model.js';

// Every runtime fixture enters through the actual still page. A landing warp
// would skip the covered world swap and conceal a second, different entry.
const D = SOURCE_HANGING_SHORE.dockZ / CELL;
function enterDock({ bearing = 0 } = {}) {
  const preset = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.HAYSTACK, { seed: 4417 });
  const game = createSourceSpaceRuntime({ initialState: preset.state });
  const at = { ...preset.position, facing: bearing };
  game.setPlayerPosition(at);
  const page = game.sourceObjective().target;
  // Facing south approaches the far side of the same sheet.
  at.x = page.x; at.y = page.y + (bearing === 2 ? -3 : 3);
  game.setPlayerPosition(at);
  const oldCell = game.geometry.cellAt(at.x, at.y);
  const found = game.inspectFocused(at.x, at.y, at.facing);
  assert.equal(found.event, 'page-found');
  assert.equal(game.state().phase, 'haystack', 'raising the page must not reveal the new room');
  assert.deepEqual(game.geometry.cellAt(at.x, at.y), oldCell, 'taking the sheet swaps geometry too early');
  assert.equal(found.revealFacing, undefined, 'the page must not author a replacement bearing');
  assert.equal(game.commitStillPageReveal().handled, true);
  const origin = game.state().landscapeOrigin;
  assert.ok(game.geometry.cellAt(at.x, at.y)?.sourceLanding, 'the covered swap lacks a solid arrival threshold');
  game.tick(SOURCE_TRANSFORM_SECONDS, { px: at.x, py: at.y, facing: at.facing });
  assert.equal(game.state().phase, 'landscape');
  assert.equal(game.commitStillPageReveal().handled, false, 'a second reveal must not move the room');
  // The dock's centre: it stands DOCK_Z along the walk from the landscape origin.
  const dock = { x: origin.x, y: origin.y + D };
  return { game, at, origin, dock, door: { x: origin.x + SOURCE_LANDING_PORTAL_LOCAL.x, y: origin.y + SOURCE_LANDING_PORTAL_LOCAL.y } };
}

const tickAt = (game, dt, at) => game.tick(dt, { px: at.x, py: at.y, facing: at.facing ?? 0 });
const snapshot = (game) => ({
  phase: game.state().phase,
  landingDoorOpen: game.state().landingDoorOpen,
  landingDoorSealed: game.state().landingDoorSealed,
  firstLiftCompleted: game.state().firstLiftCompleted,
  sourceApproachDistance: game.state().sourceApproachDistance,
  sourceApproachCompleted: game.state().sourceApproachCompleted,
});

test('the still-page cover owns the swap from either bearing and preserves its physical address', () => {
  for (const bearing of [0, 2]) {
    const { game, at } = enterDock({ bearing });
    assert.ok(game.geometry.canStep(at.x, at.y, at.x, at.y - 1).ok, 'the room in front is blocked');
    assert.ok(game.geometry.canStep(at.x, at.y, at.x, at.y + 1).ok, 'the visible rear hall hides a body barrier');
    assert.equal(game.sourceLandingHushFrame().rear.visible, true);
    assert.deepEqual(SOURCE_GET_IN_BOUNDS, { minX: 58, maxX: 73, minY: 4, maxY: 14 });
    assert.equal(SOURCE_DOCK_DESIGN.freeWalking, true);
    assert.equal(SOURCE_DOCK_DESIGN.orderedRecognitions, false);
  }
});

test('masonry aperture stays one metre wide with its real lintel while the independent leaf owns collision', () => {
  const { game, origin, dock, door } = enterDock();
  const local = SOURCE_LANDING_PORTAL_LOCAL;
  const before = game.geometry.renderCellAt(door.x, door.y);
  assert.equal(before.floor, 0);
  assert.equal(before.ceil, SOURCE_LANDING_PORTAL_APERTURE.height);
  assert.equal(before.zone, ZONE.getIn);
  assert.equal(before.material, MATERIAL.serviceConcrete);
  assert.equal(sourceLandingCellAt(local.x, local.y).solid, true);
  assert.equal(sourceLandingCellAt(local.x, local.y, { renderOnly: true }).solid, false);
  assert.equal(sourceLandingCellAt(local.x + 1.01, local.y, { renderOnly: true }).solid, true);
  assert.equal(game.geometry.canStep(door.x, door.y + 1, door.x, door.y - 1).ok, false, 'closed oak is physically passable');
  const observer = { x: door.x, y: door.y + 3, facing: 0 };
  game.setPlayerPosition(observer);
  assert.equal(game.inspectFocused(observer.x, observer.y, 0).event, 'landing-door-opened');
  for (let i = 0; i < 60; i++) {
    tickAt(game, 1 / 60, observer);
    assert.deepEqual(game.geometry.renderCellAt(door.x, door.y), before, 'leaf animation mutates its masonry aperture');
  }
  assert.equal(game.landingPortalFrame().complete, true);
  assert.equal(game.geometry.canStep(door.x-1,door.y+1,door.x-1,door.y-3).ok,false,'a body cannot squeeze through the jamb at the aperture edge');
  assert.equal(game.geometry.canStep(door.x - .4, door.y + 1, door.x - .4, door.y - 1).ok, true);
  assert.ok(game.geometry.cellAt(origin.x, origin.y + D), 'the dock is not where it stands');
});

test('rapid crossing preserves the moving leaf and keeps the original room returnable', () => {
  const { game, door } = enterDock();
  const observer = { x: door.x - .4, y: door.y + 2, facing: 0 };
  game.setPlayerPosition(observer);
  assert.equal(game.inspectFocused(observer.x, observer.y, 0).event, 'landing-door-opened');
  while (!game.landingPortalFrame().passable) tickAt(game, .01, observer);
  const opening = game.landingPortalFrame();
  assert.equal(opening.phase, 'opening');
  const crossed = { x: observer.x, y: door.y - 3, facing: 0 };
  assert.equal(game.geometry.canStep(observer.x, observer.y, crossed.x, crossed.y).ok, true);
  game.onStep(observer,crossed); game.setPlayerPosition(crossed);
  assert.equal(game.state().landingDoorSealed, false);
  assert.equal(game.landingPortalFrame().progress, opening.progress);
  assert.equal(game.landingPortalFrame().motionId, opening.motionId);
  const aperture = game.geometry.renderCellAt(door.x, door.y);
  for (let i = 0; i < 100; i++) tickAt(game, .01, crossed);
  assert.equal(game.landingPortalFrame().phase, 'open');
  assert.deepEqual(game.geometry.renderCellAt(door.x, door.y), aperture);
  assert.equal(game.geometry.canStep(crossed.x,crossed.y,observer.x,observer.y).ok,true,'looking back must lead to a physically returnable room');
});

test('rear HUSH keeps one room address throughout free exploration', () => {
  const { game, origin, dock } = enterDock();
  const before = game.sourceLandingHushFrame().rear;
  for (const [x, y] of [[0, 10], [-6, 4], [6, 4], [0, -2], [6, -8], [0, -12], [0, 20]]) {
    game.setPlayerPosition({ x: dock.x + x, y: dock.y + y, facing: 0 });
    tickAt(game, .1, { x: dock.x + x, y: dock.y + y });
    assert.deepEqual(game.sourceLandingHushFrame().rear, before, 'the surviving body follows the player');
  }
});

test('real furniture blocks the body while a broad room grid remains connected', () => {
  const { game, origin, dock } = enterDock();
  for (const footprint of sourceLandingPropFootprints()) {
    const x = (footprint.minX + footprint.maxX) / (2 * CELL);
    const y = (footprint.minZ + footprint.maxZ) / (2 * CELL);
    assert.equal(sourceLandingPropCollisionAt(x, y + D)?.id, footprint.id);
    const movement = game.geometry.canStep(dock.x + x + 2, dock.y + y, dock.x + x, dock.y + y);
    assert.equal(movement.ok, false);
    assert.equal(movement.why, game.geometry.cellAt(dock.x + x, dock.y + y) ? 'furniture' : 'wall');
  }
  const key = (x, y) => `${x},${y}`;
  const seen = new Set([key(0, 0)]), queue = [[0, 0]];
  for (let n = 0; n < queue.length; n++) {
    const [x, y] = queue[n];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
      const nx = x + dx, ny = y + dy, id = key(nx, ny);
      if (Math.abs(nx) > 9 || ny < -14 || ny > 14 || seen.has(id)) continue;
      if (!game.geometry.canStep(dock.x + x, dock.y + y, dock.x + nx, dock.y + ny).ok) continue;
      seen.add(id); queue.push([nx, ny]);
    }
  }
  let targets = 0;
  for (const y of [10, 4, -2, -8, -12]) for (const x of [-6, 0, 6]) {
    if (!sourceLandingPropCollisionAt(x, y + D)) {
      assert.ok(seen.has(key(x, y)), `free floor at ${x},${y} is disconnected`); targets++;
    }
  }
  assert.ok(targets >= 12, `only ${targets} of fifteen broad room samples remain open`);
  for (const anchor of sourceLandingRecognitions(origin)) {
    assert.equal(sourceLandingPropCollisionAt(anchor.standX - origin.x, anchor.standY - origin.y), null, `${anchor.id} has no clear standing point`);
  }
  const roof = sourceLandingPropPlacements(origin).find(prop => prop.sourcePropId === 'dock-scene-roof');
  assert.equal(roof.mesh, 'scene_dock_roof_structure', 'the authored roof is missing from the Source copy');
  for (const [x, y] of [[0, 0], [6, 10], [0, -12]]) {
    const cell = game.geometry.cellAt(dock.x + x, dock.y + y);
    assert.equal(cell.floor, 0); assert.equal(cell.ceil, 5.5);
    assert.equal(cell.zone, ZONE.getIn); assert.equal(cell.material, MATERIAL.serviceConcrete);
  }
});

test('three recognitions are optional, repeat coherently and never become a progression gate', () => {
  const { game, origin, dock, door } = enterDock();
  const anchors = sourceLandingRecognitions(origin), untouched = snapshot(game);
  assert.deepEqual(anchors.map(anchor => anchor.id), ['source-dock:desk', 'source-dock:case', 'source-dock:chandelier']);
  for (const anchor of anchors) {
    assert.equal(anchor.optional, true);
    const dx = anchor.x - anchor.standX, dy = anchor.y - anchor.standY;
    const facing = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 1 : 3 : dy > 0 ? 2 : 0;
    const at = { x: anchor.standX, y: anchor.standY, facing };
    game.setPlayerPosition(at);
    assert.equal(game.focusAt(at.x, at.y, facing)?.id, anchor.id);
    const first = game.inspectFocused(at.x, at.y, facing), again = game.inspectFocused(at.x, at.y, facing);
    assert.equal(first.event, 'dock-inspect'); assert.equal(first.text, anchor.first);
    assert.equal(again.event, 'dock-inspect'); assert.equal(again.text, anchor.again);
    assert.deepEqual(snapshot(game), untouched, 'an optional memory changes movement or exit progression');
  }
  const noInspection = enterDock(), at = { x: noInspection.door.x, y: noInspection.door.y + 3, facing: 0 };
  noInspection.game.setPlayerPosition(at);
  assert.equal(noInspection.game.inspectFocused(at.x, at.y, 0).event, 'landing-door-opened', 'the leaf requires optional inspections');
  game.setPlayerPosition({ x: door.x, y: door.y + 3, facing: 0 });
  assert.equal(game.inspectFocused(door.x, door.y + 3, 0).event, 'landing-door-opened');
});

test('remembered-room light is calibrated to real surfaces and releases its profile beyond FOH', () => {
  const { game, origin, dock, door } = enterDock();
  const inside = { x: dock.x, y: dock.y, facing: 0 };
  game.setPlayerPosition(inside);
  const frame = game.sourceFlashlightFrame();
  assert.equal(frame.mode, 'normal'); assert.equal(frame.profile, 'dock'); assert.equal(frame.xray, false);
  const ambient = game.sourceAmbient();
  assert.equal(ambient.captureExposure, 3.8, 'the recording compositor loses the room acquisition gain');
  assert.equal(ambient.intensity, .036); assert.equal(ambient.whitePointScale, .24);
  const props = game.propInstances(inside.x, inside.y, { reducedMotion: true })
    .filter(prop => prop.id.startsWith('source-landing:'));
  assert.ok(props.length >= 20);
  assert.ok(props.every(prop => prop.zone === ZONE.getIn), 'remembered objects borrow the field green instead of the get-in material treatment');

  const hush = computeHushField({
    hush: { active: true, position: { x: 20, y: 0 }, roomId: 'dock', floorId: 'g' },
    operator: { position: { x: 0, y: 0 }, roomId: 'dock', floorId: 'g' }, now: 1000,
  });
  const fitted = {};
  for (const flashlight of ['reference', 'throw', 'flood']) {
    const lens = fieldKitEffects({ flashlight });
    for (const battery of [0, .1, .3, 1]) for (const on of [false, true]) {
      const base = applyFieldKitTorchLook(resolveTorchLook({ on, battery, perception: .4, reducedEffects: true }), lens);
      const attenuated = applyHushTorchInterference(base, hush);
      const dock = applySourceEmergencyTorch(attenuated, frame);
      assert.equal(dock.sourceTorchMode, 'none', 'the dock torch enables full-screen inversion');
      assert.equal(dock.sourceEmergencyTorch, 'none');
      assert.equal(dock.health, attenuated.health); assert.equal(dock.band, attenuated.band);
      assert.equal(dock.perception, attenuated.perception); assert.equal(dock.hushInterference, attenuated.hushInterference);
      assert.equal(dock.reach, attenuated.reach, 'softening restores reach lost to the battery, lens or HUSH');
      assert.ok(dock.power <= attenuated.power);
      assert.equal(dock.power, attenuated.power * .74);
      if (!on || battery === 0) assert.equal(dock.power, 0, 'the soft room profile revives an unlit torch');
      assert.ok(dock.shoulder > 0 && dock.spill <= .12);
    }
    fitted[flashlight] = applySourceEmergencyTorch(applyFieldKitTorchLook(resolveTorchLook(), lens), frame);
  }
  assert.ok(fitted.throw.reach > fitted.reference.reach && fitted.reference.reach > fitted.flood.reach);
  assert.ok(fitted.throw.coneInner > fitted.reference.coneInner && fitted.reference.coneInner > fitted.flood.coneInner);
  const clean = applySourceEmergencyTorch(resolveTorchLook(), frame);
  const dimmed = applySourceEmergencyTorch(applyHushTorchInterference(resolveTorchLook(), hush), frame);
  assert.ok(dimmed.power < clean.power && dimmed.reach < clean.reach, 'the room profile erases HUSH attenuation');

  const observer = { x: door.x, y: door.y + 3, facing: 0 };
  game.setPlayerPosition(observer);
  assert.equal(game.inspectFocused(observer.x, observer.y, 0).event, 'landing-door-opened');
  tickAt(game, 1, observer);
  const outside = { x: door.x - .4, y: door.y - 3, facing: 0 };
  assert.equal(game.geometry.canStep(door.x - .4, door.y + 1, outside.x, outside.y).ok, true);
  game.setPlayerPosition(outside);
  const later = game.sourceFlashlightFrame();
  assert.equal(later.mode, 'normal'); assert.equal(later.xray, false); assert.equal(later.profile, 'shore');
  assert.deepEqual(game.sourceAmbient().color, [.60,.66,.74]);
  const shore = applySourceEmergencyTorch(resolveTorchLook(), later);
  assert.equal(shore.sourceTorchMode, 'none'); assert.ok(shore.power > 0);
});
