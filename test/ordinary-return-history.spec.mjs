import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { isOrdinaryReturnRecord, normalizeReturnHistory, resolvedReturnHistory, lastReturnRecord } from '../src/progression/return-history.js';
import { freshMeta, normalizeMeta } from '../src/progression/schema.js';
import { returnIndexEntries } from '../src/progression/report.js';
import { returnFileEntries } from '../src/game/second-shift.js';
import { decideNatatoriumWaterEnvironment, NATATORIUM_ROUTE_TRUNKS } from '../src/game/natatorium-water.js';
import { retainedNightMediaKeys } from '../src/game/night-failure-archive.js';

function mixedHistory() {
  const meta = freshMeta();
  const records = [
    { id: 'return:legacy', runId: 'legacy', endingId: 'sacrifice', completedAt: 1000 },
    { id: 'return:real', runId: 'real', endingId: 'surfaced', completedAt: 2000,
      integrity: { achievements: { eligible: true } } },
    { id: 'return:dev', runId: 'dev', endingId: 'sacrifice', endingVariant: 'century-stay', completedAt: 3000,
      developerRun: true, recordings: { schema: 1, tapes: [], mediaRefs: [{ key: 'kept:dev-audio' }] } },
    { id: 'return:unranked', runId: 'unranked', endingId: 'contact-lost', endingVariant: 'source-rest', completedAt: 4000,
      integrity: { achievements: { eligible: false } } },
  ];
  meta.endingsSeen = ['sacrifice', 'surfaced'];
  meta.returns = { records: Object.fromEntries(records.map(record => [record.id, record])), history: records.map(record => record.id) };
  return meta;
}

test('ordinary history preserves legacy and legitimate failures but excludes either explicit developer marker', () => {
  for (const record of [{}, { endingId: 'helped' }, { integrity: {} },
    { integrity: { achievements: { eligible: true } } }, { classification: 'failed-night', endingId: 'night-deadline' }])
    assert.equal(isOrdinaryReturnRecord(record), true);
  for (const record of [null, undefined, false, 0, 'return:legacy', [], { developerRun: true },
    { integrity: { achievements: { eligible: false } } },
    { classification: 'failed-night', integrity: { achievements: { eligible: false } } }])
    assert.equal(isOrdinaryReturnRecord(record), false);
});

test('persisted ID histories select only ordinary rows by default without deleting diagnostic rows', () => {
  const meta = mixedHistory(), before = JSON.stringify(meta);
  meta.returns.history = [...meta.returns.history, 'missing', { summaryId: 'return:real' }];
  assert.deepEqual(normalizeReturnHistory(meta.returns.history), ['return:legacy', 'return:real', 'return:dev', 'return:unranked', 'missing']);
  assert.deepEqual(resolvedReturnHistory(meta).map(row => row.id), ['return:legacy', 'return:real']);
  assert.equal(lastReturnRecord(meta).id, 'return:real');
  assert.equal(lastReturnRecord(meta, { includeDeveloper: true }).id, 'return:unranked');
  assert.equal(resolvedReturnHistory(meta, { includeDeveloper: true }).length, 4);
  assert.equal(Object.keys(meta.returns.records).length, 4);
  assert.deepEqual(resolvedReturnHistory(JSON.parse(before)), resolvedReturnHistory(meta));
});

test('actual water, return-file and ending-variant readers ignore later developer endings and retain failed nights', () => {
  const meta = mixedHistory();
  assert.equal(decideNatatoriumWaterEnvironment({ meta }).routeTrunk, NATATORIUM_ROUTE_TRUNKS.FLOODED_SURFACE);
  assert.deepEqual(returnFileEntries(meta).map(row => row.summary.id), ['return:legacy', 'return:real']);
  const index = returnIndexEntries(meta), sacrifice = index.find(row => row.id === 'sacrifice');
  assert.equal(sacrifice.endingVariant, null, 'a developer Century Stay cannot overwrite the actual filed sacrifice');
  assert.equal(sacrifice.variantTitle, '');
  assert.equal(index.find(row => row.id === 'contact-lost').endingVariant, null);
  const failure = { id: 'return:failure', runId: 'failure', endingId: 'night-deadline', classification: 'failed-night', completedAt: 5000,
    failure: { outcome: 'survived' }, integrity: { achievements: { eligible: true } }, recordings: { schema: 1, tapes: [], mediaRefs: [] } };
  meta.returns.records[failure.id] = failure; meta.returns.history.push(failure.id);
  assert.equal(lastReturnRecord(meta).id, failure.id);
  const files = returnFileEntries(meta);
  assert.equal(files.length, 3); assert.equal(files.at(-1).document.title, 'DEMOLITION RECORD');
  const clean = structuredClone(meta);
  delete clean.returns.records['return:dev']; delete clean.returns.records['return:unranked'];
  assert.deepEqual(decideNatatoriumWaterEnvironment({ meta }), decideNatatoriumWaterEnvironment({ meta: clean }));
});

test('missing completed-run stats count ordinary completed returns while raw diagnostic media remains retained', () => {
  const meta = mixedHistory();
  meta.returns.records.failure = { id: 'failure', endingId: 'night-deadline', classification: 'failed-night' };
  meta.returns.history.push('failure', 'missing'); delete meta.stats.runsCompleted;
  const normalized = normalizeMeta(JSON.parse(JSON.stringify(meta)));
  assert.equal(normalized.stats.runsCompleted, 2);
  assert.deepEqual(normalized.returns.history, meta.returns.history);
  assert.equal(normalized.returns.records['return:dev'].developerRun, true);
  // Media retention intentionally scans all stored records, including DEV.
  // Give the genuine failed night its required factual audio envelope.
  normalized.returns.records.failure.recordings = { schema: 1, tapes: [], mediaRefs: [] };
  assert.deepEqual(retainedNightMediaKeys(normalized), ['kept:dev-audio']);
});

test('the actual main desktop-composition callback uses the ordinary latest return', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = source.indexOf('getCompositionContext:()=>{'), end = source.indexOf('\n  },', start);
  assert.ok(start >= 0 && end > start);
  const callback = source.slice(start + 'getCompositionContext:'.length, end + 4);
  const result = vm.runInNewContext('(' + callback + ')()', {
    getMeta: mixedHistory, getSave: () => ({ settings: { reduceDread: true } }), flashMode: () => 'reduced', lastReturnRecord,
  });
  assert.equal(result.lastEndingId, 'surfaced'); assert.equal(result.reduceDread, true);
});

test('real mixed return filing, pending reports, profile merge, New Game and reload preserve ordinary history', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    globalThis.localStorage={map:new Map(),getItem(k){return this.map.get(k)??null},setItem(k,v){this.map.set(k,String(v))},removeItem(k){this.map.delete(k)}};
    globalThis.window=undefined;
    const S=await import('./src/game/save.js'),P=await import('./src/progression/runtime.js');
    const {lastReturnRecord,resolvedReturnHistory}=await import('./src/progression/return-history.js');
    const {freshMeta,normalizeMeta}=await import('./src/progression/schema.js');
    const {exportProfile,mergeImportedProfile}=await import('./src/progression/profile.js');
    const {returnFileEntries}=await import('./src/game/second-shift.js');
    const {returnIndexEntries}=await import('./src/progression/report.js');
    const {decideNatatoriumWaterEnvironment,NATATORIUM_ROUTE_TRUNKS}=await import('./src/game/natatorium-water.js');
    const {freshNightDeadline,stepNightDeadline,completeNightDeadline}=await import('./src/game/night-deadline.js');
    S.saveLoad();P.progressionInit();S.newGame({preset:'contract'});P.beginRunProgression();
    // Supplied terminal receipts exercise actual filing, not an earned player route.
    const ordinary=P.commitReturn('surfaced',{endingArrival:'carried'});
    assert.equal(P.pendingReturnReport().id,ordinary.id);P.consumeReturnReport(ordinary.id);
    S.newGame({preset:'contract'});P.beginRunProgression();P.markDeveloperRun('GOD_MENU:ending-review');
    const dev=P.commitReturn('sacrifice',{endingVariant:'century-stay',endingArrival:'agreed'});
    assert.equal(dev.developerRun,true);assert.equal(P.pendingReturnReport(),null);
    S.saveLoad();assert.equal(P.pendingReturnReport(),null);assert.equal(lastReturnRecord(S.getMeta()).id,ordinary.id);
    assert.equal(lastReturnRecord(S.getMeta(),{includeDeveloper:true}).id,dev.id);
    assert.equal(returnFileEntries(S.getMeta()).length,1);
    assert.equal(decideNatatoriumWaterEnvironment({meta:S.getMeta()}).routeTrunk,NATATORIUM_ROUTE_TRUNKS.FLOODED_SURFACE);
    assert.equal(returnIndexEntries(S.getMeta()).find(row=>row.id==='sacrifice').endingVariant,null);
    const exported=exportProfile(S.getMeta(),{}),merged=mergeImportedProfile(freshMeta(),{},exported);
    assert.equal(merged.ok,true);assert.equal(Object.keys(merged.meta.returns.records).length,2);
    assert.equal(lastReturnRecord(merged.meta).id,ordinary.id);assert.equal(returnFileEntries(merged.meta).length,1);
    const missing=structuredClone(merged.meta);delete missing.stats.runsCompleted;assert.equal(normalizeMeta(missing).stats.runsCompleted,1);
    S.newGame({preset:'contract'});P.beginRunProgression();
    assert.equal(S.getSave().run.environment.routeTrunk,NATATORIUM_ROUTE_TRUNKS.FLOODED_SURFACE);
    const runId=S.getSave().run.id,input={runId,runActive:true,workOrderAccepted:true,active:true,elapsedSeconds:30180,
      safeBoundary:true,assetsReady:true,region:'ellery'};
    let deadline=stepNightDeadline(freshNightDeadline({runId}),input).state;
    deadline=stepNightDeadline(deadline,{...input,claimPresentation:true}).state;
    deadline=completeNightDeadline(deadline,{outcome:'survived'});S.saveCommit({nightDeadline:deadline});
    const failure=P.commitNightFailure();assert.equal(failure.classification,'failed-night');
    // The unranked report at the queue head cannot conceal the real failure.
    assert.equal(P.pendingReturnReport().id,failure.id);assert.equal(lastReturnRecord(S.getMeta()).id,failure.id);
    assert.equal(returnFileEntries(S.getMeta()).length,2);assert.equal(S.getMeta().stats.runsCompleted,1);
    P.consumeReturnReport(failure.id);assert.equal(P.pendingReturnReport(),null);
    S.saveLoad();assert.equal(P.pendingReturnReport(),null);assert.equal(lastReturnRecord(S.getMeta()).id,failure.id);
    assert.equal(S.getMeta().returns.history.length,3);assert.equal(resolvedReturnHistory(S.getMeta()).length,2);
    assert.ok(S.getMeta().returns.records[dev.id]);assert.deepEqual(S.getMeta().endingsSeen,['surfaced']);
  `], { cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
