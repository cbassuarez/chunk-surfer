import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { controllerDiagramModel } from '../src/game/controller-ui.js';
import { makeControllerSettingsScene } from '../src/game/controller-settings.js';
import { normalizeControllerSettings } from '../src/game/bindings.js';

test('settings input tab exposes controller setup rows instead of dense action rows', () => {
  const settings = readFileSync('src/game/settings.js', 'utf8');
  const inputStart = settings.indexOf("id: 'input'");
  const inputEnd = settings.indexOf("id: 'access'", inputStart);
  const inputBlock = settings.slice(inputStart, inputEnd);
  for (const label of [
    'CONFIGURE CONTROLLER',
    'LOOK SENSITIVITY',
    'MOVE DEADZONE',
    'LOOK DEADZONE',
    'INVERT LOOK Y',
    'RESET CONTROLLER',
  ]) assert.match(inputBlock, new RegExp(label));
  for (const dense of [
    "label: 'QUIET'",
    "label: 'LIGHT'",
    "label: 'BAG'",
    "label: 'RECORDER'",
    "label: 'INTERACT'",
    "label: 'PLAYBACK'",
  ]) assert.doesNotMatch(inputBlock, new RegExp(dense));
});

test('controller overlay model keeps button callouts inside the diagram', () => {
  const settings = normalizeControllerSettings({
    bindings: { interact: { kind: 'button', id: 'north' } },
  });
  for (const size of [{ width: 620, height: 420 }, { width: 1280, height: 760 }]) {
    const model = controllerDiagramModel({ ...size, settings, selectedAction: 'interact', padName: 'DualSense Wireless Controller' });
    assert.ok(['stacked', 'split'].includes(model.mode));
    assert.equal(model.family, 'playstation');
    assert.equal(model.activeButton, 'north');
    assert.ok(model.actions.find((entry) => entry.id === 'interact')?.selected);
    for (const button of model.buttons) {
      const p = button.pos;
      const x = p.x;
      const y = p.y;
      assert.ok(x >= 0 && x <= 100, `${button.id} x outside svg`);
      assert.ok(y >= 0 && y <= 86, `${button.id} y outside svg`);
    }
  }
});

test('the controller screen reports its selection and capture state', () => {
  // This used to assert on overlay markup. The screen is no longer a DOM
  // overlay — it draws on the glyph layer like every other surface — so the
  // contract is the scene's own view, not a class name.
  const scene = makeControllerSettingsScene({
    getPadName: () => 'Xbox Wireless Controller',
    getWindowSize: () => ({ width: 1280, height: 800 }),
    beginControllerRemap: () => true,
    cancelControllerRemap: () => {},
    controllerRemapAction: () => null,
    onSave: () => {},
  });
  scene.enter();
  const view = scene.view();
  assert.equal(view.id, 'controller-settings');
  assert.equal(view.mode, 'split');
  assert.ok(view.buttonCount >= 17, 'every pad button is on the diagram');
  assert.ok(view.callouts > 0, 'world bindings get leader lines');
  // The first row is the pad option, not a binding, and activating it adjusts
  // rather than opening a capture.
  assert.equal(view.selected, 'family');
  scene.key({ key: 'ArrowDown' });
  assert.equal(scene.view().selected, 'interact');
  scene.key({ key: 'Enter' });
  assert.equal(scene.view().captureAction, 'interact', 'confirm opens a capture on a binding row');
  scene.key({ key: 'Escape' });
  assert.equal(scene.view().captureAction, null, 'escape cancels the capture');
  scene.exit();
});

test('the pad projection keeps the diagram and its labels inside their panel', async () => {
  // render() needs a live canvas, so the geometry is what node can check: the
  // projection both the drawn art and the uiText legends share.
  const { padProjection, calloutLabelCell, PAD_BOX } = await import('../src/render/pad-diagram.js');
  const rect = { x: 4, y: 3, w: 60, h: 22 };
  const proj = padProjection(rect);
  const corners = [
    [PAD_BOX.x, PAD_BOX.y], [PAD_BOX.x + PAD_BOX.w, PAD_BOX.y],
    [PAD_BOX.x, PAD_BOX.y + PAD_BOX.h], [PAD_BOX.x + PAD_BOX.w, PAD_BOX.y + PAD_BOX.h],
  ];
  for (const [px, py] of corners) {
    const cx = proj.cx(px);
    const cy = proj.cy(py);
    assert.ok(cx >= rect.x - 0.01 && cx <= rect.x + rect.w + 0.01, `x ${cx} escapes the panel`);
    assert.ok(cy >= rect.y - 0.01 && cy <= rect.y + rect.h + 0.01, `y ${cy} escapes the panel`);
  }
  // A left-column label is right-aligned to its leader, so its text ends where
  // the rule does instead of running back over the pad.
  const left = calloutLabelCell(proj, { side: 'left', label: 'QUIET', text: { x: -6, y: 40 } });
  const right = calloutLabelCell(proj, { side: 'right', label: 'RECORDER', text: { x: 106, y: 40 } });
  assert.ok(left.x < proj.cx(-6), 'left labels run away from the pad');
  assert.ok(right.x > proj.cx(106), 'right labels run away from the pad');
});

test('the pad silhouette is symmetric and closed', async () => {
  const { PAD_OUTLINE, PAD_PROFILE } = await import('../src/game/controller-ui.js');
  // The old shell was hand-authored and lopsided. The left half is derived
  // from the right, so this asserts the derivation rather than the drawing.
  assert.equal(PAD_OUTLINE.length, PAD_PROFILE.length * 2 - 2);
  for (const [x, y] of PAD_OUTLINE) {
    const mirrored = PAD_OUTLINE.some(([mx, my]) => Math.abs(mx - (100 - x)) < 0.001 && Math.abs(my - y) < 0.001);
    assert.ok(mirrored, `(${x},${y}) has no mirror`);
  }
  // Four features make a pad silhouette legible, and the first shell had none
  // of them. Assert the three that are geometry.
  const ys = PAD_OUTLINE.map(([, y]) => y);
  const xs = PAD_OUTLINE.map(([x]) => x);
  const lowest = Math.max(...ys);
  const waist = PAD_PROFILE[PAD_PROFILE.length - 1][1];
  assert.ok(lowest - waist > 10, 'grips hang well below the waist');
  const widest = Math.max(...xs);
  const topRight = PAD_PROFILE[2][0];
  assert.ok(widest > topRight, 'the sides bulge out past the top corners');
  const ratio = (widest - Math.min(...xs)) / (lowest - Math.min(...ys));
  assert.ok(ratio > 1.4 && ratio < 2.1, `a pad is wider than tall, got ${ratio.toFixed(2)}`);
});
