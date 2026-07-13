import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildMapCommands, buildMinimapCommands } from '../src/render/map-commands.js';
import { MAP_LAB_CASES, fixtureMapSource, mapLabModel } from '../src/game/map-fixtures.js';
import { initialMapNav } from '../src/game/map-navigation.js';

const protectedFiles = [
  'src/game/map-model.js',
  'src/game/map-navigation.js',
  'src/game/map-routing.js',
  'src/render/map-commands.js',
  'src/render/map-view.js',
  'src/render/minimap.js',
];

for (const file of protectedFiles) {
  const source = await readFile(file, 'utf8');
  assert.equal(
    /from\s+['"][^'"]*presence\.js['"]/.test(source),
    false,
    `${file} must not import presence.js directly`,
  );
  assert.equal(
    /\b(searchMode|attackCooldown|detectionConfidence|chosenPath)\b/.test(source),
    false,
    `${file} exposes hidden AI state`,
  );
}

const source = fixtureMapSource();
for (const testCase of MAP_LAB_CASES.filter((entry) => entry.contact)) {
  const model = mapLabModel(testCase, source);
  const nav = initialMapNav({ model });
  const mapCommands = buildMapCommands({
    model,
    nav,
    layout: { mapViewport: { x: 0, y: 0, w: 52, h: 24 } },
    now: 2000,
  });
  const minimapCommands = buildMinimapCommands({
    model,
    viewport: { x: 0, y: 0, w: 18, h: 8 },
    now: 2000,
  });

  assert.equal(mapCommands.some((command) => command.kind === 'enemy'), false);
  assert.equal(minimapCommands.some((command) => command.kind === 'enemy'), false);
  assert.ok(
    [...mapCommands, ...minimapCommands].some((command) => command.kind.startsWith('anomaly-')),
    `${testCase.id} should expose evidence-derived anomaly commands`,
  );
}

console.log('map information firewall tests ok');
