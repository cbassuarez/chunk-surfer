import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { buildSceneGraph, layoutSceneGraph } from '../tools/narrative-studio/src/scene-graph.js';

// Saved geometry wins in the saved-position view. Missing positions use the
// scene layout, so new / unplaced beats stay visible without a layout write.
const stories = readdirSync('content/narrative').filter((f) => f.endsWith('.story.json'));

const layoutFor = (story) => `content/layout/${story.replace('.story.json', '.layout.json')}`;
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

test('every authored beat is placed, with saved geometry preserved and missing geometry filled', () => {
  let checked = 0;
  for (const story of stories) {
    const layoutPath = layoutFor(story);
    checked += 1;
    const doc = read(`content/narrative/${story}`), nodes = Object.keys(doc.nodes);
    const saved = existsSync(layoutPath) ? read(layoutPath).positions || {} : {};
    const positions = { ...layoutSceneGraph(buildSceneGraph(doc, { splitChoices: true }), doc), ...saved };
    const missing = nodes.filter((id) => !positions[id]);
    assert.deepEqual(missing, [], `${story} has nodes the studio cannot place: ${missing.join(', ')}`);
    for (const id of nodes) assert.ok(Number.isFinite(positions[id].x) && Number.isFinite(positions[id].y), `${story}: finite position for ${id}`);
    for (const [id, position] of Object.entries(saved)) assert.deepEqual(positions[id], position, `${story}: saved geometry for ${id} is unchanged`);
  }
  assert.ok(checked > 10, 'expected the narrative corpus to be laid out');
});

test('no two nodes are stacked on the same studio coordinate', () => {
  for (const story of stories) {
    const layoutPath = layoutFor(story);
    if (!existsSync(layoutPath)) continue;
    const positions = read(layoutPath).positions || {};
    const seen = new Map();
    for (const [id, at] of Object.entries(positions)) {
      // Internal sequences have their own canvas; normal and return lines may
      // use the same coordinates without overlapping in either view.
      const surface = /^(line|collection):/.test(id) ? id.split(':').slice(1, 3).join(':') : 'scene';
      const key = `${surface}:${at.x},${at.y}`;
      assert.ok(!seen.has(key), `${story}: ${id} is stacked on ${seen.get(key)} at ${key}`);
      seen.set(key, id);
    }
  }
});

test('layout files describe the document they belong to', () => {
  for (const story of stories) {
    const layoutPath = layoutFor(story);
    if (!existsSync(layoutPath)) continue;
    const layout = read(layoutPath);
    const doc = read(`content/narrative/${story}`);
    assert.equal(layout.documentId, doc.id, `${story} layout points at the wrong document`);
  }
});
