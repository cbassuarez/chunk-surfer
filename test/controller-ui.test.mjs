import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { controllerDiagramModel } from '../src/game/controller-ui.js';
import { renderControllerOverlayHtml } from '../src/game/controller-settings.js';
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

test('controller overlay html highlights selected mapping and capture state', () => {
  const settings = normalizeControllerSettings({
    bindings: { interact: { kind: 'button', id: 'north' } },
  });
  const model = controllerDiagramModel({
    width: 1000,
    height: 600,
    settings,
    selectedAction: 'interact',
    captureAction: 'interact',
    padName: 'Xbox Controller',
  });
  const html = renderControllerOverlayHtml(model, { padName: 'Xbox Controller' });
  assert.match(html, /Controller Setup/);
  assert.match(html, /cs-machine-panel/);
  assert.match(html, /cs-machine-glass/);
  assert.match(html, /cs-machine-header/);
  assert.match(html, /cs-machine-footer/);
  assert.match(html, /data-action="interact"/);
  assert.match(html, /is-selected/);
  assert.match(html, /is-capturing/);
  assert.match(html, /PRESS ANY BUTTON/);
});
