import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { AUDITS, SYSTEM_MAP_PORT, auditRegistryErrors, auditsForSystem } from '../tools/audits/registry.mjs';
import { buildAudit as buildEndings } from '../tools/audits/endings/audit.mjs';
import { renderAudit as renderEndings } from '../tools/audits/endings/render.mjs';
import { buildAudit as buildProgression } from '../tools/audits/progression/audit.mjs';
import { renderAudit as renderProgression } from '../tools/audits/progression/render.mjs';
import { buildAudit as buildPuzzles } from '../tools/audits/puzzles/audit.mjs';
import { renderAudit as renderPuzzles } from '../tools/audits/puzzles/render.mjs';

// ── the registry ─────────────────────────────────────────────────────────────
assert.deepEqual(auditRegistryErrors(), [], 'the audit registry is internally consistent');
assert.ok(AUDITS.length >= 2);
assert.ok(!AUDITS.some((audit) => audit.port === SYSTEM_MAP_PORT), 'no audit fights the system map for its port');
assert.ok(auditsForSystem('save-progression').length >= 1, 'a system the audits cover can find them');
assert.equal(auditsForSystem('no-such-system').length, 0);
{
  const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;
  for (const audit of AUDITS) {
    assert.ok(scripts[audit.npm]?.includes(audit.entry), `npm run ${audit.npm} runs ${audit.entry}`);
  }
}

// ── they build, and they render ──────────────────────────────────────────────
//
// An audit that throws is worse than no audit, and an audit whose own citations
// have gone stale is a page that cries wolf. Both are checked here for real: the
// builders read the same files the game does.
const endings = await buildEndings();
assert.equal(endings.endings.length, 9);
assert.deepEqual(endings.global.contract, [], 'the ending contract is clean');
assert.deepEqual(endings.global.gates, [], 'the ending gate map is clean');
{
  const html = renderEndings(endings);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(!html.includes('undefined'), 'the endings page renders no undefined values');
  assert.ok(html.includes('no longer there') === false, 'every ending citation still resolves');
  for (const audit of AUDITS) {
    if (audit.id !== 'endings') assert.ok(html.includes(`:${audit.port}/`), `the endings page links to the ${audit.id} audit`);
  }
  assert.ok(html.includes(`:${SYSTEM_MAP_PORT}/`), 'the endings page links back to the system map');
}

const progression = await buildProgression();
assert.deepEqual(progression.global.broken, [], 'nothing in the progression audit disagrees with the code');
assert.ok(progression.achievements.length >= 20);
assert.ok(progression.pins.length >= 6);
assert.ok(progression.skills.length >= 5);
assert.ok(progression.weapons.length >= 6);
{
  // Everything the audit points at has to actually be there, or the page is
  // reporting on itself rather than on the game.
  const cited = [
    ...progression.achievements,
    ...progression.pins,
    ...progression.skills.flatMap((branch) => branch.rungs),
    ...progression.weapons,
    ...progression.weapons.flatMap((tool) => tool.moves),
  ];
  for (const entry of cited) {
    assert.ok(entry.where?.resolved, `${entry.id} points at ${entry.where?.symbol} in ${entry.where?.file}, which is not there`);
  }
  // The moves are read out of a live fight rather than a second list, which is
  // the whole reason they cannot drift. Prove the fight actually produced them.
  const moves = progression.weapons.flatMap((tool) => tool.moves);
  for (const id of ['shout', 'expose', 'monitor', 'playback', 'invert', 'tune', 'whiteout']) {
    assert.ok(moves.some((move) => move.id === id), `the kit is missing ${id}`);
  }
  assert.ok(moves.every((move) => String(move.detail || '').trim()), 'every move says what it does');
}
{
  const html = renderProgression(progression);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(!html.includes('undefined'), 'the progression page renders no undefined values');
  assert.ok(!html.includes('no longer there'), 'every progression citation still resolves');
  for (const section of ['achievements', 'pins', 'skills', 'weapons']) {
    assert.ok(html.includes(`id="${section}"`), `the page has a ${section} section`);
  }
}

// ── the puzzles ──────────────────────────────────────────────────────────────
//
// The audit's own rule is the interesting assertion here: a puzzle that gates
// something and offers no way through is reported as broken, so this passing is
// a statement about the GAME — every locked thing can be got past — and not only
// about the tool.
const puzzles = await buildPuzzles();
assert.deepEqual(puzzles.global.broken, [], 'nothing in the puzzles audit disagrees with the code');
assert.ok(puzzles.counts.all >= 14);
assert.ok(puzzles.counts.puzzles >= 6 && puzzles.counts.microgames >= 5, 'both kinds are represented');
assert.ok(puzzles.counts.gating >= 8, 'most of them open something');
for (const entry of puzzles.puzzles) {
  assert.ok(entry.where?.resolved, `${entry.id} points at ${entry.cite.symbol} in ${entry.cite.file}, which is not there`);
  assert.ok(entry.covered, `${entry.id} names ${entry.spec}, which is not there`);
  assert.ok(!entry.liveError, `${entry.id} could not be read out of the game: ${entry.liveError}`);
  assert.ok(entry.live.length, `${entry.id} reads nothing out of the game and is only a description`);
  for (const field of ['room', 'asks', 'solved', 'fails', 'gates']) {
    assert.ok(String(entry[field] || '').trim(), `${entry.id} does not say its ${field}`);
  }
  if (entry.opens) assert.ok(entry.assist, `${entry.id} opens something with no way through`);
}
{
  const html = renderPuzzles(puzzles);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(!html.includes('undefined'), 'the puzzles page renders no undefined values');
  assert.ok(!html.includes('no longer there'), 'every puzzle citation still resolves');
  for (const entry of puzzles.puzzles) assert.ok(html.includes(`id="${entry.id}"`), `the page has a card for ${entry.id}`);
}

console.log(`audit tools ok — ${AUDITS.length} audits, ${endings.endings.length} endings, `
  + `${progression.achievements.length} achievements, ${progression.pins.length} pin sources, `
  + `${progression.skills.reduce((n, b) => n + b.rungs.length, 0)} skills, `
  + `${progression.weapons.reduce((n, t) => n + t.moves.length, 0)} moves, `
  + `${puzzles.counts.all} puzzles and microgames`);
