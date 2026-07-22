import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

// Authoring a node into a .story.json is only half the job: the studio draws
// from the matching .layout.json, so a node with no position is a node the
// writer cannot see or reach. Every node added by hand or by script must land
// here too, and no two may sit on the same point.
const stories = readdirSync('content/narrative').filter((f) => f.endsWith('.story.json'));

const layoutFor = (story) => `content/layout/${story.replace('.story.json', '.layout.json')}`;
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

test('every authored node has a studio position', () => {
  let checked = 0;
  for (const story of stories) {
    const layoutPath = layoutFor(story);
    if (!existsSync(layoutPath)) continue;
    checked += 1;
    const nodes = Object.keys(read(`content/narrative/${story}`).nodes);
    const positions = read(layoutPath).positions || {};
    const missing = nodes.filter((id) => !positions[id]);
    assert.deepEqual(missing, [], `${story} has nodes the studio cannot place: ${missing.join(', ')}`);
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
      const key = `${at.x},${at.y}`;
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
