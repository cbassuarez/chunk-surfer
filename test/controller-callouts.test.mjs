import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUTTON_POSITIONS,
  PAD_VIEWBOX,
  controllerCalloutModel,
  controllerDiagramModel,
} from '../src/game/controller-ui.js';
import {
  CONTROLLER_FAMILIES,
  controllerSettings,
  cycleControllerFamily,
  resetControllerSettings,
  resolveControllerFamily,
  setControllerFamily,
} from '../src/game/bindings.js';

const VIEWBOX = PAD_VIEWBOX.split(' ').map(Number);
const BOX = { x0: VIEWBOX[0], y0: VIEWBOX[1], x1: VIEWBOX[0] + VIEWBOX[2], y1: VIEWBOX[1] + VIEWBOX[3] };

function model(overrides = {}) {
  return controllerDiagramModel({
    width: 1280,
    height: 800,
    // The live module settings, exactly as the scene reads them — the family
    // override writes module state, so a detached object would never see it.
    settings: controllerSettings(),
    padName: 'Xbox Wireless Controller',
    ...overrides,
  });
}

test('every world action gets exactly one leader, anchored to its own button', () => {
  const m = model({ selectedAction: 'interact' });
  const world = m.actions.filter((a) => a.group.startsWith('WORLD'));
  // Actions can share a button (INTERACT and CONFIRM are both south), so the
  // count is unique buttons, not unique actions.
  const expected = new Set(world.map((a) => a.binding?.id).filter(Boolean));
  assert.equal(m.callouts.length, expected.size);
  assert.equal(new Set(m.callouts.map((c) => c.id)).size, m.callouts.length, 'no duplicate leaders');
  for (const callout of m.callouts) {
    const pos = BUTTON_POSITIONS[callout.id];
    assert.ok(pos, `${callout.id} is a real button`);
    assert.equal(callout.anchor.y, pos.y, 'leader leaves the button it labels');
  }
});

test('leaders and their labels stay inside the drawing box', () => {
  const CHAR = 1.9;
  for (const callout of model().callouts) {
    for (const point of [callout.anchor, callout.knee, callout.text]) {
      assert.ok(point.x >= BOX.x0 && point.x <= BOX.x1, `${callout.id} leader escapes horizontally`);
      assert.ok(point.y >= BOX.y0 && point.y <= BOX.y1, `${callout.id} leader escapes vertically`);
    }
    // The label runs away from its anchor edge, so check the far end too.
    const end = callout.side === 'left'
      ? callout.text.x - callout.label.length * CHAR
      : callout.text.x + callout.label.length * CHAR;
    assert.ok(end >= BOX.x0 && end <= BOX.x1, `${callout.id} label "${callout.label}" is clipped`);
  }
});

test('only the selected action lights its leader', () => {
  const m = model({ selectedAction: 'light' });
  const lit = m.callouts.filter((c) => c.selected);
  assert.equal(lit.length, 1);
  assert.match(lit[0].label, /LIGHT/);
});

test('the stacked layout drops the leaders it has no room for', () => {
  assert.equal(model({ width: 960, height: 600 }).mode, 'stacked');
  assert.equal(model({ width: 960, height: 600 }).callouts.length, 0);
});

test('a callout model with nothing bound produces nothing rather than throwing', () => {
  assert.deepEqual(controllerCalloutModel(), []);
  assert.deepEqual(controllerCalloutModel({ actions: [{ group: 'WORLD', binding: null }] }), []);
});

test('the family override writes the setting detection could only guess at', () => {
  resetControllerSettings();
  // Detection is a guess from a USB string. Before this existed the stored
  // value was permanently 'auto' because no surface ever wrote it.
  assert.equal(resolveControllerFamily({ family: 'auto' }, 'Pro Controller'), 'nintendo');
  assert.equal(setControllerFamily('playstation'), true);
  assert.equal(model().family, 'playstation', 'the override beats the pad name');
  assert.equal(setControllerFamily('not-a-pad'), false, 'unknown families are refused');
  resetControllerSettings();
});

test('cycling the family walks the whole list and wraps', () => {
  resetControllerSettings();
  const seen = [];
  for (let i = 0; i < CONTROLLER_FAMILIES.length; i += 1) seen.push(cycleControllerFamily(1));
  assert.deepEqual([...seen].sort(), [...CONTROLLER_FAMILIES].sort(), 'every family is reachable');
  assert.equal(seen[seen.length - 1], CONTROLLER_FAMILIES[0], 'and it wraps back to auto');
  assert.equal(cycleControllerFamily(-1), CONTROLLER_FAMILIES[CONTROLLER_FAMILIES.length - 1]);
  resetControllerSettings();
});

test('the option row reports the detected family while set to auto', () => {
  resetControllerSettings();
  const option = model({ padName: 'Pro Controller' }).options.find((o) => o.id === 'family');
  assert.equal(option.stored, 'auto');
  assert.match(option.value, /AUTO/);
  assert.match(option.value, /SWITCH/, 'auto shows what it resolved to, by its short name');
  setControllerFamily('xbox');
  assert.equal(model({ padName: 'Pro Controller' }).options[0].value, 'XBOX');
  resetControllerSettings();
});
