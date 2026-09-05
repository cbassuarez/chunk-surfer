import test from 'node:test';
import assert from 'node:assert/strict';

import { mapLayoutFromBag } from '../src/render/map-layout.js';
import { mapActionRail } from '../src/game/map-actions.js';

// A bag content region, at the sizes the field case actually gets.
const bag = (w, h, mode = 'wide') => ({
  mode,
  list: { x: 4, y: 6, w: Math.floor(w * 0.6), h },
  detail: { x: 4 + Math.floor(w * 0.6) + 1, y: 6, w: w - Math.floor(w * 0.6) - 1, h },
});

const SIZES = [[151, 40], [120, 34], [96, 28], [72, 20], [64, 17]];

test('every band of the map has the page to itself', () => {
  // THE BUG THIS EXISTS TO CATCH, twice over. The floor rail, the plan, the
  // caption, the legend and the controls are five stacked rows, and the first
  // pass at making the map full-bleed let the caption and the legend land on the
  // same line — so the selected room's name was printed through the symbol key.
  for (const [w, h] of SIZES) {
    const layout = mapLayoutFromBag(bag(w, h));
    const bands = [
      ['floorRail', layout.floorRail],
      ['mapViewport', layout.mapViewport],
      ['detail', layout.detail],
      ['legendRail', layout.legendRail],
      ['progressRail', layout.progressRail],
    ];
    for (const [name, rect] of bands) {
      assert.ok(rect, `${w}x${h}: ${name} exists`);
      assert.ok(rect.h >= 1, `${w}x${h}: ${name} has height`);
    }
    // Ordered, and no band starts before the one above it ends.
    for (let i = 1; i < bands.length; i += 1) {
      const [prevName, prev] = bands[i - 1];
      const [name, rect] = bands[i];
      assert.ok(rect.y >= prev.y + prev.h,
        `${w}x${h}: ${name} (y=${rect.y}) starts after ${prevName} ends (y=${prev.y + prev.h})`);
    }
  }
});

test('the plan gets the page, not a column of it', () => {
  // The map used to take 72% of the width and hand the rest to a room list,
  // which is why finding somewhere meant reading rather than looking.
  for (const [w, h] of SIZES) {
    const layout = mapLayoutFromBag(bag(w, h));
    const region = bag(w, h);
    const fullWidth = (region.detail.x + region.detail.w) - region.list.x;
    assert.equal(layout.mapViewport.w, fullWidth, `${w}x${h}: the plan spans the whole region`);
    assert.equal(layout.dividerX, null, `${w}x${h}: there is no column to divide off`);
    // And it is the tallest thing on the page by a distance.
    assert.ok(layout.mapViewport.h >= (h - 6), `${w}x${h}: the plan keeps its height`);
  }
});

test('the control rail is short enough that it cannot truncate', () => {
  // It listed six entries with labels like CHANGE FLOOR and CENTER ON YOU, which
  // overran the footer and cut it at "[ENTER / SPACE] SET…" — hiding the one
  // verb a player most needs. That verb moved onto the selected room; what is
  // left has to fit even in the narrowest case.
  const selected = { id: 'room:x', roomId: 'x', waypointable: true, objective: { notes: [{}] } };
  for (const floors of [1, 3, 5]) {
    const rail = mapActionRail(selected, { floorCount: floors });
    const rendered = rail.map(([key, label]) => `[${key}] ${label}`).join('  ');
    // 96 cells: comfortably inside the footer at the narrowest viewport the game
    // supports (960px wide, where the safe-size guard kicks in), and comfortably
    // under the ~125 the six-entry version came to.
    assert.ok(rendered.length <= 96, `${floors} floors: the rail is ${rendered.length} cells`);
    for (const [key, label] of rail) {
      assert.ok(label === label.trim() && label.length > 0, 'every entry is labelled');
      assert.ok(`${key} ${label}`.length <= 24, `"${key} ${label}" is short`);
    }
  }
});
