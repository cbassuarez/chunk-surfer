import assert from 'node:assert/strict';
import { SOURCE_PAGES } from '../src/data/source-pages.js';

const REGISTERS = new Set([
  'take_sheet', 'contamination_log', 'equipment_return', 'fault_ticket',
  'access_sheet', 'time_sheet', 'loose_note',
]);
const VOICES = new Set(['stable', 'pressured', 'intrusive', 'contested', 'deictic', 'assimilative', 'ventriloquial']);
const FORBIDDEN = [
  /\bplayer\b/i, /save slot/i, /frame rate/i, /\busername\b/i,
  /operating system/i, /\byou are next\b/i, /\bget out\b/i,
  /\bsurfer\b/i, /[▓█]/,
];

assert.ok(SOURCE_PAGES.length >= 180 && SOURCE_PAGES.length <= 220,
  `expected a 180–220 sheet authored corpus, got ${SOURCE_PAGES.length}`);

const ids = new Set();
const textOwners = new Map();
for (const page of SOURCE_PAGES) {
  assert.ok(page.id && !ids.has(page.id), `duplicate/missing id ${page.id}`);
  ids.add(page.id);
  assert.ok(page.family, `${page.id}: missing family`);
  assert.ok(REGISTERS.has(page.register), `${page.id}: unknown register ${page.register}`);
  assert.ok(VOICES.has(page.voiceState), `${page.id}: unknown voice state ${page.voiceState}`);
  assert.ok(page.stageMin >= 0 && page.stageMin <= page.stageMax && page.stageMax <= 5, `${page.id}: invalid exposure gate`);
  assert.ok(page.hallMin >= 0 && page.hallMin <= page.hallMax && page.hallMax <= 4, `${page.id}: invalid hall gate`);
  assert.ok(page.dialogicLoad >= 0 && page.dialogicLoad <= 1, `${page.id}: invalid load`);
  assert.ok(page.surferLegibility >= 0 && page.surferLegibility <= 1, `${page.id}: invalid legibility`);
  assert.ok(Array.isArray(page.body) && page.body.length > 0, `${page.id}: missing authored AST`);
  assert.deepEqual(page.lines, page.body.map((node) => node.type === 'field' ? `${node.label}: ${node.value}` : node.type === 'gap' ? '' : node.text || ''),
    `${page.id}: rendered lines diverge from authored AST`);
  assert.equal('speaker' in page, false, `${page.id}: encodes a speaker identity`);
  assert.equal(page.style?.speakerIdentity, undefined, `${page.id}: typography encodes voice`);

  if (page.stageMin < 3) assert.ok(page.surferLegibility < 0.35, `${page.id}: early sheet over-identifies the second voice`);
  if (page.techniques.includes('memory_assimilation') && ['contingent', 'impossible'].includes(page.adaptationTier)) {
    assert.ok(page.requiresFacts.length > 0, `${page.id}: adaptive memory has no lived fact gate`);
  }
  if (page.adaptationTier === 'impossible') assert.ok(page.stageMin >= 5, `${page.id}: impossible assimilation is available too early`);
  if (page.voiceState === 'ventriloquial') assert.ok(page.stageMin >= 5, `${page.id}: ventriloquism is available too early`);

  const prose = page.lines.join('\n');
  for (const rule of FORBIDDEN) assert.doesNotMatch(prose, rule, `${page.id}: forbidden semantic-horror shorthand`);

  const normalized = page.lines.join('\n').trim();
  const owners = textOwners.get(normalized) || [];
  owners.push(page);
  textOwners.set(normalized, owners);
}

for (const owners of textOwners.values()) {
  if (owners.length < 2) continue;
  assert.ok(owners.every((page) => page.intentionalRecurrence === true),
    `accidental duplicate prose: ${owners.map((page) => page.id).join(', ')}`);
  assert.equal(new Set(owners.map((page) => page.family)).size, 1,
    `intentional recurrence crosses families: ${owners.map((page) => page.id).join(', ')}`);
}

assert.ok(SOURCE_PAGES.filter((page) => page.dialogicLoad <= 0.18).length >= 70,
  'ordinary camouflage is not the majority presence it needs to be');
assert.ok(SOURCE_PAGES.some((page) => page.opensThread), 'no cross-page dialogue thread can open');
assert.ok(SOURCE_PAGES.some((page) => page.adaptationTier === 'contingent'), 'no contingent current-run echoes');
assert.ok(SOURCE_PAGES.some((page) => page.adaptationTier === 'impossible'), 'no impossible current-run assimilations');

console.log(`source dialogue corpus specs passed (${SOURCE_PAGES.length} authored sheets)`);
