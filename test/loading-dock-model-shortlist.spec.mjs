import assert from 'node:assert/strict';
import fs from 'node:fs';

const path = new URL('../tools/chunk_surfer/loading-dock-model-shortlist.json', import.meta.url);
const shortlist = JSON.parse(fs.readFileSync(path, 'utf8'));

assert.equal(shortlist.status, 'approval-required', 'external dock models stay behind explicit approval');
assert.deepEqual(shortlist.licensePolicy, ['CC0-1.0', 'CC-BY-4.0']);
assert.equal(shortlist.pack.output, 'public/assets/conservatory-dock.glb');
assert.equal(shortlist.pack.maxBytes, 8 * 1024 * 1024);
assert.equal(shortlist.pack.maxTriangles, 45_000);
assert.equal(shortlist.pack.heroTextureMax, 2048);
assert.equal(shortlist.pack.repeatTextureMax, 1024);
assert.equal(shortlist.pack.axis, 'Y-up');
assert.equal(shortlist.pack.unit, 'metre');

const expectedCategories = [
  'hand-truck',
  'crates',
  'cable-reel',
  'road-case',
  'industrial-worklight',
  'chandelier-and-freight-frame',
];
assert.deepEqual(shortlist.categories.map((entry) => entry.id), expectedCategories);

for (const category of shortlist.categories) {
  assert.ok(category.candidates.length >= 2, `${category.id} needs at least two visual candidates`);
  for (const candidate of category.candidates) {
    for (const key of ['id', 'title', 'source', 'preview', 'author', 'license', 'sourceTriangles', 'targetTriangles', 'targetTextureMax', 'intendedUse', 'contourGrade']) {
      assert.ok(candidate[key], `${category.id}/${candidate.id} is missing ${key}`);
    }
    assert.ok(shortlist.licensePolicy.includes(candidate.license), `${candidate.id} has an unapproved license`);
    assert.match(candidate.source, /^https:\/\//);
    assert.match(candidate.preview, /^https:\/\//);
    assert.ok(['A', 'B'].includes(candidate.contourGrade), `${candidate.id} needs an explicit contour review`);
    assert.equal(candidate.attributionRequired, candidate.license === 'CC-BY-4.0');
    if (candidate.downloadedAt !== 'existing-approved-pack') assert.equal(candidate.downloadedAt, null);
    assert.ok(candidate.targetTextureMax <= 2048);
    assert.ok(candidate.targetTriangles < shortlist.pack.maxTriangles);
  }
}

const recommendedIds = [
  'hand-truck-poly-haven',
  'plastic-crate-poly-haven',
  'cable-drum-yodha',
  'transport-case-sousinho',
  'work-light-hippostance',
  'chandelier-03-industrial-pipe-frame',
];
const candidates = shortlist.categories.flatMap((entry) => entry.candidates);
const recommendedTriangles = recommendedIds.reduce((sum, id) => {
  const candidate = candidates.find((entry) => entry.id === id);
  assert.ok(candidate, `missing recommended candidate ${id}`);
  return sum + candidate.targetTriangles;
}, 0);
assert.ok(recommendedTriangles <= shortlist.pack.maxTriangles, 'recommended pass must leave room inside pack budget');
assert.equal(recommendedTriangles, 39_000);

console.log('loading dock model shortlist: 6 categories, 12 reviewed candidates, approval gate intact');
