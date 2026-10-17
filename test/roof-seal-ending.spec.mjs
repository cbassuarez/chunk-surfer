import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CENTURY_STAY_CUTSCENE,
  CENTURY_STAY_MANIFEST,
  ENDING_ARRIVAL,
  ENDING_MANIFEST,
  ENDING_VARIANT,
  endingCodaVariant,
  endingContractErrors,
  endingManifest,
  normalizeEndingVariant,
} from '../src/data/endings.js';
import { ENDING_IDS, freshRunRecord, normalizeMeta } from '../src/progression/schema.js';
import { buildEndingDossier, endingDocuments, projectDossierFlags } from '../src/game/ending-runtime.js';
import {
  advanceEndingCutscene, claimEndingCutsceneCompletion, createEndingCutsceneState, endingCutsceneErrors,
} from '../src/game/ending-cutscene.js';
import {
  createEndingEmbodimentState, endingEmbodimentErrors, reduceEndingEmbodiment,
} from '../src/game/ending-embodiment.js';
import { buildRunSummary, returnDefinition, returnIndexEntries } from '../src/progression/report.js';
import { evaluateAchievements } from '../src/progression/achievements.js';
import { EVENT_TYPES } from '../src/progression/events.js';
import { validateNarrativeDocument } from '../src/narrative/contracts.js';

const variant = ENDING_VARIANT.CENTURY_STAY;
const agreed = ENDING_ARRIVAL.AGREED;
assert.equal(ENDING_IDS.length, 9, 'the century stay is not a tenth terminal return');
assert.equal(normalizeEndingVariant('sacrifice', variant, agreed), variant);
for (const id of ENDING_IDS.filter((id) => id !== 'sacrifice')) {
  assert.equal(normalizeEndingVariant(id, variant), null, `${id} cannot borrow Ren's stay`);
  assert.equal(endingManifest(id, { variant }), ENDING_MANIFEST[id]);
}
for (const arrival of [ENDING_ARRIVAL.DEFEATED, ENDING_ARRIVAL.TIMED_OUT, ENDING_ARRIVAL.ESCAPED]) {
  assert.equal(normalizeEndingVariant('sacrifice', variant, arrival), null, 'a forced arrival cannot become a consensual roof seal');
  assert.equal(endingManifest('sacrifice', { variant, arrival }), ENDING_MANIFEST.sacrifice);
}
assert.equal(endingManifest('sacrifice', { variant: 'unknown' }), ENDING_MANIFEST.sacrifice);
assert.equal(endingManifest('sacrifice'), ENDING_MANIFEST.sacrifice, 'ordinary Seal retains its contract');
assert.equal(endingManifest('sacrifice', { variant, arrival: agreed }), CENTURY_STAY_MANIFEST);
assert.equal(CENTURY_STAY_MANIFEST.id, 'sacrifice');
assert.equal(CENTURY_STAY_MANIFEST.objective, null, 'the roof ritual does not send the player down to the chapel');
assert.equal(CENTURY_STAY_MANIFEST.referenceTail, false);
assert.equal(CENTURY_STAY_MANIFEST.dockTail, false);
assert.equal(CENTURY_STAY_MANIFEST.cutscene.worldAnchors.ren.id, 'roof-ren');
assert.equal(CENTURY_STAY_MANIFEST.cutscene.finalAction.mode, 'hold');
assert.ok(CENTURY_STAY_MANIFEST.cutscene.finalAction.holdMs >= 1000);
assert.deepEqual(endingCutsceneErrors(CENTURY_STAY_CUTSCENE), []);
assert.deepEqual(endingEmbodimentErrors({ 'century-stay': CENTURY_STAY_CUTSCENE }), []);
assert.deepEqual(endingContractErrors(), []);
assert.ok(!JSON.stringify(CENTURY_STAY_CUTSCENE).includes('ending.strike.first'), 'the first strike never lands');
assert.ok(!CENTURY_STAY_CUTSCENE.beats.some((beat) => /collapse|blackout|remote-impact/.test(beat.effect || '')));
assert.ok(!CENTURY_STAY_MANIFEST.environment.some((step) => ['circuit', 'possess', 'torch', 'hush', 'vigil'].includes(step.kind)));

for (const documentId of ['ending.sacrifice.century-stay', 'ending.epilogue.century-stay']) {
  const document = JSON.parse(readFileSync(`content/narrative/${documentId}.story.json`, 'utf8'));
  assert.deepEqual(validateNarrativeDocument(document).errors, [], `${documentId} is valid authored content`);
  const lines = Object.values(document.nodes).flatMap((node) => node.lines || []);
  for (const beat of CENTURY_STAY_CUTSCENE.beats) {
    for (const source of beat.dialogue || []) {
      const [id, lineId] = source.split('#');
      if (id === documentId) assert.ok(lines.some((line) => line.id === lineId), `${source} reaches an authored line`);
    }
  }
}
const riteStory = JSON.parse(readFileSync('content/narrative/ending.sacrifice.century-stay.story.json', 'utf8'));
const codaStory = JSON.parse(readFileSync('content/narrative/ending.epilogue.century-stay.story.json', 'utf8'));
const riteText = riteStory.nodes.start.lines.map(line => line.text).join(' ');
const codaText = codaStory.nodes.start.lines.map(line => line.text).join(' ');
assert.match(riteText, /another hundred years|a hundred years/i);
assert.match(riteText, /you will not be walking through the gate/i);
assert.match(riteText, /loose score lifts toward the breach/i, 'the dissenting resident remains present in the ritual');
assert.match(codaText, /funeral notice/i, 'the century cost reaches an ordinary personal event');
assert.match(codaText, /school opens a room at a time/i, 'people still have to sustain the school');
assert.match(codaText, /cannot prove that the seal spared them/i, 'city risk remains uncertain');
assert.match(codaText, /wanted to try the door have no answer yet/i, 'the stay does not claim every spirit wanted it');
assert.doesNotMatch(codaText, /same hand has added one hundred|ink is dry/i,
  'a magically amended demolition order should not replace the lived century');

const save = { run: freshRunRecord({ id: 'roof-stay-test', now: 1000 }), playSeconds: 480 };
const authoritative = { endingVariant: variant, endingArrival: agreed };
const dossier = buildEndingDossier({ endingId: 'sacrifice', arrival: agreed, save, authoritative, now: 2000 });
assert.equal(dossier.variant, variant);
assert.equal(projectDossierFlags(dossier)['ending.variant.centuryStay'], true);
assert.deepEqual(endingDocuments('sacrifice', agreed, dossier), [{ id: 'ending.sacrifice.century-stay', kind: 'ending', slate: '' }]);
assert.equal(endingCodaVariant('sacrifice', dossier), 'century-stay');
assert.equal(endingCodaVariant('sacrifice', { confession: { kind: 'nothing' } }), 'nobody');
const defeated = buildEndingDossier({ endingId: 'sacrifice', arrival: ENDING_ARRIVAL.DEFEATED, save, authoritative });
assert.equal(defeated.variant, null);
assert.equal(defeated.summary.endingVariant, null, 'the dossier and its filed preview agree about forced arrival');
assert.equal(projectDossierFlags(defeated)['ending.variant.centuryStay'], false);
assert.equal(endingDocuments('sacrifice', ENDING_ARRIVAL.DEFEATED, defeated).at(-1).id, 'ending.sacrifice');

// Reading speed holds the physical ritual at the appropriate hand and shadow
// poses; a fast elapsed clock cannot perform the seal before its authored lines.
let state = createEndingCutsceneState(CENTURY_STAY_CUTSCENE);
let body = createEndingEmbodimentState('sacrifice');
let next = advanceEndingCutscene(state, CENTURY_STAY_CUTSCENE, { elapsedMs: 90000 });
assert.equal(next.state.cursor, 1);
for (const event of next.events) body = reduceEndingEmbodiment(body, event);
state = next.state;
assert.equal(body.roofSealStage, 1);
assert.equal(body.cityStayed, false);
for (const [line, stage] of [['contact', 2], ['bind', 3], ['stay', 4], ['release', 5]]) {
  next = advanceEndingCutscene(state, CENTURY_STAY_CUTSCENE, { dialogueComplete: [`ending.sacrifice.century-stay#start.line.${line}`] });
  for (const event of next.events) body = reduceEndingEmbodiment(body, event);
  state = next.state;
  assert.equal(body.roofSealStage, stage);
}
assert.equal(body.cityStayed, true);
assert.equal(body.collapseStage, 0);
assert.equal(body.bodyStage, 0, 'the living guarantor is not staged as a corpse');
assert.equal(state.complete, true);
assert.equal(state.completionId, 'ending-cutscene:sacrifice:complete');
const claimed = claimEndingCutsceneCompletion(state, state.completionId);
assert.equal(claimed.claimed, true);
assert.equal(claimEndingCutsceneCompletion(claimed.state, state.completionId).claimed, false);
const skipped = advanceEndingCutscene(createEndingCutsceneState(CENTURY_STAY_CUTSCENE), CENTURY_STAY_CUTSCENE, { skip: true });
const skippedBody = skipped.events.reduce((acc, event) => reduceEndingEmbodiment(acc, event), createEndingEmbodimentState('sacrifice'));
assert.equal(skippedBody.cityStayed, true, 'skipping presentation preserves the already-consented stay');
const reduced = createEndingCutsceneState(CENTURY_STAY_CUTSCENE, { reducedMotion: true });
assert.deepEqual(advanceEndingCutscene(reduced, CENTURY_STAY_CUTSCENE, { skip: true }).state.fired, skipped.state.fired);

const summary = buildRunSummary({ endingId: 'sacrifice', save, authoritative, now: 2000 });
assert.equal(summary.endingVariant, variant);
assert.deepEqual(summary.seal, { years: 100, guarantor: 'player', demolitionStayed: true, spiritsRemainHoused: true });
assert.equal(returnDefinition(summary.endingId, summary).title, 'THE SEAL');
assert.equal(returnDefinition(summary.endingId, summary).variantTitle, 'A HUNDRED MORE YEARS');
assert.equal(returnDefinition('sacrifice').variantTitle, undefined);
for (const endingId of ['helped', 'tower-won']) {
  const other = buildRunSummary({ endingId, save, authoritative, now: 2000 });
  assert.equal(other.endingVariant, null);
  assert.equal(other.seal, null);
}
const ordinary = buildRunSummary({ endingId: 'sacrifice', save, now: 2000 });
const event = { type: EVENT_TYPES.RUN_FINISHED, payload: { summary } };
assert.ok(evaluateAchievements({ event, profile: {}, run: save.run, summary }).includes('ACH_CENTURY_STAY'));
assert.ok(!evaluateAchievements({ event, profile: {}, run: save.run, summary: ordinary }).includes('ACH_CENTURY_STAY'));
assert.ok(!evaluateAchievements({ event, profile: {}, run: save.run, summary: { ...summary, endingId: 'helped' } }).includes('ACH_CENTURY_STAY'));

// The real return transaction grants both The Seal and its variant achievement,
// files one terminal id, survives profile normalization, and cannot pay twice.
class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.get(key) || null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}
globalThis.localStorage = new MemoryStorage();
globalThis.window = undefined;
const saveApi = await import('../src/game/save.js');
const progression = await import('../src/progression/runtime.js');
assert.equal(saveApi.normalizeEndingCutsceneCheckpoint({ endingId: 'sacrifice', arrival: agreed, variant })?.variant, variant,
  'a reload keeps the roof ritual variant on its ending checkpoint');
assert.equal(saveApi.normalizeEndingCutsceneCheckpoint({ endingId: 'sacrifice', arrival: ENDING_ARRIVAL.DEFEATED, variant })?.variant, undefined,
  'a forced Seal cannot inherit Ren\'s ritual through a save');
saveApi.saveLoad();
progression.progressionInit({ build: 'ROOF-SEAL-TEST' });
saveApi.newGame({ now: 3000 });
progression.beginRunProgression();
const filed = progression.commitReturn('sacrifice', authoritative, 4000);
assert.ok(filed.unlockedAchievements.includes('ACH_END_SACRIFICE'));
assert.ok(filed.unlockedAchievements.includes('ACH_CENTURY_STAY'));
assert.deepEqual(saveApi.getMeta().endingsSeen, ['sacrifice']);
assert.equal(filed.endingsAtCompletion, 1);
assert.equal(progression.commitReturn('sacrifice', {}, 5000).endingVariant, variant);
const normalized = normalizeMeta(saveApi.getMeta());
assert.equal(normalized.returns.records[filed.id].endingVariant, variant);
assert.equal(normalized.returns.records[filed.id].seal.years, 100);
const index = returnIndexEntries(normalized).find((row) => row.id === 'sacrifice');
assert.equal(index.endingVariant, variant);
assert.equal(index.displayTitle, 'THE SEAL');
assert.equal(index.variantTitle, 'A HUNDRED MORE YEARS');
assert.equal(index.displayClassification, 'CONTAINMENT / CENTURY STAY');
assert.equal(normalized.stats.endingsSeen, 1);
assert.equal(normalized.stats.runsCompleted, 1);
console.log('roof seal ending tests ok');
