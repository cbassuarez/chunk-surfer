import assert from 'node:assert/strict';
import test from 'node:test';
import * as FP from '../src/world/floorplan.js';
import * as MUT from '../src/world/mutate.js';

const rows = Array.from({ length: 20 }, (_, y) => {
  if (y === 0 || y === 19) return '############################';
  return y % 3 === 0 ? '#..........................#' : '#..###..###..###..###..###..#';
});
const compile = ({ door = false } = {}) => {
  const layout = rows.slice();
  if (door) layout[3] = '#...........+..............#';
  FP.compile([{ id: 'corridors', rows: layout, origin: { x: 0, y: 0 } }], { width: 28, height: 20,
    doors: door ? [{ id: 'checkpoint-door', archetype: 'academic-wired-glass', at: { x: 12, y: 3 }, widthAxis: 'y', initialState: 'closed' }] : [] });
  MUT.mutateInit();
};
const view = { px: 4, py: 4, facing: [1, 0], light: false };
const planCells = () => {
  const { w, h } = FP.planSize();
  return Array.from({ length: w * h }, (_, i) => FP.mutationCellState(i % w, Math.floor(i / w)));
};

function changeCorridors(first, end) {
  let seed = first + 716;
  const random = Math.random;
  Math.random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  try {
    let applied = 0;
    for (let step = first; step < end; step++) {
      if (MUT.tryMutate(step * 2300, view)) applied++;
    }
    assert.ok(applied > 0);
  } finally {
    Math.random = random;
  }
}

test('a checkpoint restores the same collision and physical embedding to a reused or freshly compiled plan', () => {
  compile();
  const authored = planCells();
  changeCorridors(1, 9);
  const checkpoint = JSON.parse(JSON.stringify(MUT.saveMutationState()));
  assert.ok(checkpoint.cells.length > 0);
  const expected = planCells();
  changeCorridors(9, 18);
  assert.notDeepEqual(planCells(), expected);
  MUT.markHeard(view.px, view.py);
  assert.equal(MUT.loadMutationState(checkpoint), true);
  assert.deepEqual(planCells(), expected);
  assert.equal(MUT.heardAt(view.px, view.py), 0);
  const span = FP.physicalSpanData();
  assert.equal(MUT.loadMutationState(checkpoint), true);
  assert.equal(FP.physicalSpanData(), span, 'an unchanged checkpoint does not rebuild spans');
  compile();
  assert.equal(MUT.loadMutationState(checkpoint), true);
  assert.deepEqual(planCells(), expected);
  assert.equal(MUT.loadMutationState(null), true);
  assert.deepEqual(planCells(), authored);
});

test('malformed sparse mutations leave the current plan and runtime state untouched', () => {
  compile();
  changeCorridors(1, 9);
  const saved = MUT.saveMutationState();
  const before = planCells();
  const row = saved.cells[0];
  assert.equal(MUT.loadMutationState({ ...saved, w: saved.w + 2 }), false);
  assert.equal(MUT.loadMutationState({ ...saved, cells: [...saved.cells, row] }), false);
  assert.equal(MUT.loadMutationState({ ...saved, cells: [{ ...row, original: 'old-layout' }] }), false);
  assert.equal(MUT.loadMutationState({ ...saved, cells: [{ ...row, cell: { ...row.cell, floor: 'bad' } }] }), false);
  assert.deepEqual(planCells(), before);
});

test('a warm checkpoint reuses its projection after changed doors and corridors are restored', () => {
  compile({ door: true });
  changeCorridors(1, 9);
  const corridor = MUT.saveMutationState();
  const doors = FP.saveDoorState();
  const projection = FP.capturePhysicalProjection();
  const slice = FP.physicalRenderPlanFor(4, 4);
  assert.equal(FP.setDoorOpen('checkpoint-door', true), true);
  changeCorridors(9, 18);
  assert.notEqual(FP.physicalSpanData(), projection.physical);
  assert.equal(FP.restorePhysicalProjection(projection, () => {
    assert.equal(MUT.loadMutationState(corridor), true);
    FP.loadDoorState(doors);
    return true;
  }), true);
  assert.equal(FP.physicalSpanData(), projection.physical);
  assert.equal(FP.physicalRenderPlanFor(4, 4), slice);
  assert.deepEqual(MUT.saveMutationState(), corridor);
  assert.deepEqual(FP.saveDoorState(), doors);
});

test('a mismatch publishes the new projection instead of borrowing a stale cached door state', () => {
  compile({ door: true });
  const projection = FP.capturePhysicalProjection();
  assert.equal(FP.restorePhysicalProjection(projection, () => FP.setDoorOpen('checkpoint-door', true)), false);
  assert.equal(FP.doorState().find(door => door.id === 'checkpoint-door').open, true);
  assert.notEqual(FP.physicalSpanData(), projection.physical);
  compile({ door: true });
  assert.equal(FP.restorePhysicalProjection(projection, () => { throw Error('old plan ran'); }), false);
});

test('checkpoint replay can reverse grey-door masonry and reinstall it without a new plan', () => {
  compile({ door: true });
  const door = FP.doorState().find(door => door.id === 'checkpoint-door');
  const opening = FP.capturePhysicalProjection();
  const endpoint = FP.saveDoorState();
  const cell = door.cells[0];
  const before = FP.mutationCellState(cell.x, cell.y);
  assert.equal(FP.setDoorOpen(door.id, true), true);
  assert.equal(FP.retireDoor(door.id), true);
  const masonry = FP.capturePhysicalProjection();
  assert.equal(FP.doorAt(cell.x, cell.y), null);
  assert.equal(FP.isSolid(cell.x, cell.y), true);
  assert.equal(FP.restorePhysicalProjection(opening, () => {
    if (!FP.restoreRetiredDoor(door.id)) return false;
    FP.loadDoorState(endpoint);
    return true;
  }), true);
  assert.equal(FP.physicalSpanData(), opening.physical);
  assert.equal(FP.doorAt(cell.x, cell.y).id, door.id);
  assert.deepEqual(FP.mutationCellState(cell.x, cell.y), before);
  assert.equal(FP.restorePhysicalProjection(masonry, () => FP.retireDoor(door.id)), true);
  assert.equal(FP.physicalSpanData(), masonry.physical);
  assert.equal(FP.doorAt(cell.x, cell.y), null);
  compile({ door: true });
  assert.equal(FP.restoreRetiredDoor(door.id), false);
});
