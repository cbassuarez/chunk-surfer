import test from 'node:test';
import assert from 'node:assert/strict';
import { hushStatus, minimapTelemetryCrumbs } from '../src/render/minimap.js';

test('minimap HUSH status meanings remain unchanged', () => {
  const active = hushStatus({
    player: { floorId: 'g' },
    floors: [{ id: 'g', label: 'GROUND' }],
    hush: { active: true, floorId: 'g' },
    contacts: [],
  }, 4000);
  assert.deepEqual(active, { label: 'ACTIVE', cls: 'ui-danger', detail: 'ON MAP', floorDelta: 0 });

  const tracing = hushStatus({
    player: { floorId: 'g' },
    floors: [{ id: 'g', label: 'GROUND' }],
    hush: { active: false },
    contacts: [{ state: 'acquiring', observation: { observedAt: 1000, floorId: 'g', confidence: 0.64 } }],
  }, 4000);
  assert.deepEqual(tracing, { label: 'TRACING', cls: 'ui-amber', detail: '64%', floorDelta: 0 });
});

test('stale minimap telemetry is capped, transformed, and age-faded', () => {
  const contacts = Array.from({ length: 9 }, (_, index) => ({
    id: `c${index}`,
    state: 'decaying',
    observation: {
      observedAt: 1000 + index * 500,
      floorId: 'g',
      confidence: 0.5,
      position: { x: index, y: index + 1 },
    },
  }));
  const model = { player: { floorId: 'g' }, contacts };
  const commands = [{ kind: 'sight', transform: { point: (point) => ({ x: point.x + 10, y: point.y + 20 }) } }];
  const crumbs = minimapTelemetryCrumbs(model, commands, 6000);
  assert.ok(crumbs.length <= 7);
  assert.ok(crumbs.length > 0);
  assert.ok(crumbs.every((crumb) => crumb.alpha > 0 && crumb.alpha < 0.18));
  assert.ok(crumbs.every((crumb) => crumb.point.x >= 10 && crumb.point.y >= 21));
  assert.ok(!crumbs.some((crumb) => crumb.point.x === 18), 'newest contact stays the live observation, not a crumb');
});
