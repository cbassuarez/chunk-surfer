// Read-only game verification: aggregate separately completed native conditions.
// No browser, server, game source or player save is opened or changed.
import assert from 'node:assert/strict';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { createHash } from 'node:crypto';

const study=resolve(process.env.SOURCE_SUITE_STUDY||'artifacts/source-experience-study');
const frozen=resolve(process.env.SOURCE_SUITE_FROZEN||join(study,'frozen-build'));
const out=resolve(process.env.SOURCE_SUITE_REPORTS||join(study,'prototypes/native'));
const receiptPath=join(study,'support/frozen-snapshot.json');
const sha=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>JSON.stringify(value);
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const safeFrozen=path=>{const target=resolve(frozen,path);assert.ok(target.startsWith(frozen+sep),'Identity path escapes frozen build');return target;};
const receipt=await read(receiptPath);
assert.equal(receipt.frozen,frozen,'Receipt describes another frozen build');
assert.equal(receipt.copyStartEqualsEnd,true);assert.equal(receipt.everyFrozenFileEqualsLiveCopy,true);
const identities={...receipt.sourceIdentity};
assert.ok(identities&&Object.keys(identities).length===receipt.files,'Complete frozen identity receipt required');
for(const adaptation of receipt.adaptations||[]){
  assert.equal(identities[adaptation.file],adaptation.sourceSha256,'Adaptation is not bound to its copied source');
  assert.match(adaptation.frozenSha256,/^[a-f0-9]{64}$/);
  identities[adaptation.file]=adaptation.frozenSha256;
}
// Bounded read concurrency avoids loading every large packed asset together.
const paths=Object.keys(identities);let next=0;
await Promise.all(Array.from({length:12},async()=>{while(next<paths.length){const path=paths[next++];
  assert.equal(sha(await readFile(safeFrozen(path))),identities[path],`Frozen source/asset drift: ${path}`);}}));

const prepared=[];
for(const id of ['guidance','bust']){
  const path=join(frozen,'artifacts/source-experience-study/prototypes',id,id==='guidance'?'manifest.json':'patch-manifest.json');
  const bytes=await readFile(path),manifest=JSON.parse(bytes);
  const sourcePath=id==='guidance'?manifest.requestInterception[0].source:safeFrozen(manifest.sourcePath);
  const sourceSha=id==='guidance'?manifest.requestInterception[0].sourceSha256:manifest.sourceSha256;
  assert.equal(resolve(sourcePath),safeFrozen('src/game/source-space-runtime.js'));
  const source=await readFile(sourcePath,'utf8');assert.equal(sha(source),sourceSha);
  let patched=source;
  const changes=id==='guidance'?manifest.changes.map(change=>({search:change.anchor,replace:change.replacement,expectedCount:1})):manifest.replacements;
  for(const change of changes){assert.equal(patched.split(change.search).length-1,change.expectedCount);patched=patched.replace(change.search,change.replace);}
  const patchedSha=id==='guidance'?manifest.requestInterception[0].replacementSha256:manifest.patchedSourceSha256;
  assert.equal(sha(patched),patchedSha);
  prepared.push({id,path,sha256:sha(bytes),sourceSha,patchedSha,changes:changes.length});
}

const reports=[];
for(const experiment of prepared)for(const condition of ['before','after']){
  const dir=join(out,experiment.id,condition),path=join(dir,'report.json'),r=await read(path);
  assert.equal(r.experiment,experiment.id);assert.equal(r.condition,condition);
  assert.equal(r.passed,true,`${experiment.id}/${condition} did not pass`);
  assert.ok(!r.failure&&!r.captureError&&r.checks?.length&&r.checks.every(check=>check.pass));
  assert.deepEqual(r.errors,[]);
  assert.equal(resolve(r.manifest),experiment.path);assert.equal(r.manifestSha256,experiment.sha256);
  assert.equal(r.productionRuntimeSha256,experiment.sourceSha);
  assert.equal(r.fixtureMainSha256,identities['src/main.js']);
  assert.equal(canonical(r.productionIdentityBefore),canonical(identities),'Condition used another source/asset footprint');
  assert.equal(canonical(r.productionIdentityAfter),canonical(identities),'Condition source/assets drifted');
  const runtime=r.interceptions.filter(entry=>entry.kind==='runtime-intervention');
  assert.equal(runtime.length,1);assert.equal(runtime[0].applied,condition==='after');
  assert.equal(runtime[0].exactReplacements,condition==='after'?experiment.changes:0);
  if(condition==='before')assert.equal(runtime[0].beforeSha256,runtime[0].afterSha256);
  const fixture=r.interceptions.filter(entry=>entry.kind==='shared-eye-ineligible-fixture');
  assert.equal(fixture.length,experiment.id==='bust'?1:0);
  if(fixture.length){assert.equal(fixture[0].applied,true);assert.equal(fixture[0].exactReplacements,1);}
  const c=r.capture;assert.ok(c&&c.bytes>0&&c.framesDrawn>0);
  assert.equal(c.chunkError,null);assert.deepEqual(c.drawingErrors,[]);
  assert.equal(c.continuousAfterInitialFixture,true);
  assert.equal(c.events[0].type,'record-start');assert.equal(c.events.at(-1).type,'record-stop');
  assert.ok(!c.events.some(event=>event.type==='debug-call'));
  assert.ok(c.width===1280&&c.height===800&&c.audio?.microphoneRequested===false);
  const video=join(dir,'encounter.webm');assert.equal((await stat(video)).size,c.bytes);
  let media=null;try{const m=await read(join(dir,'encounter-decoded/report.json'));media={path:join(dir,'encounter-decoded/report.json'),
    strictPass:m.checks.length>0&&m.checks.every(check=>check.pass),checks:m.checks};}catch(error){if(error.code!=='ENOENT')throw error;}
  reports.push({...r,reportPath:path,reportSha256:sha(await readFile(path)),media});
}
const control=value=>({position:value.position,look:value.look,profile:value.source.profile,seed:value.source.seed,phase:value.source.phase,
  landscapeOrigin:value.source.landscapeOrigin,checkpointId:value.source.checkpointId,settings:value.settings,setupFlags:value.fixtureSetupFlags,
  firstLiftCompleted:value.source.firstLiftCompleted,finaleRoute:value.source.finale.route,decision:value.source.finale.bust.decision});
const pairedInitialConditions=[],pairedEncounterCameras=[];
for(const id of ['guidance','bust']){
  const before=reports.find(r=>r.experiment===id&&r.condition==='before'),after=reports.find(r=>r.experiment===id&&r.condition==='after');
  const a=control(before.snapshots[0]),b=control(after.snapshots[0]);
  assert.equal(canonical(a),canonical(b),`${id} initial fixtures differ`);
  const beforeRuntime=before.interceptions.find(e=>e.kind==='runtime-intervention'),afterRuntime=after.interceptions.find(e=>e.kind==='runtime-intervention');
  assert.equal(beforeRuntime.beforeSha256,afterRuntime.beforeSha256,`${id} transformed production response differs`);
  if(id==='bust')assert.equal(canonical(before.interceptions.filter(e=>e.kind==='shared-eye-ineligible-fixture').map(e=>[e.beforeSha256,e.afterSha256])),
    canonical(after.interceptions.filter(e=>e.kind==='shared-eye-ineligible-fixture').map(e=>[e.beforeSha256,e.afterSha256])),'Bust fixture main replacement differs');
  pairedInitialConditions.push({experiment:id,paired:true,equal:true,productionIdentityEqual:true,before:a,after:b});
  const names=id==='guidance'?['00-initial-fixture','01-grey-door-approach','02-raised-recorder']
    :['00-initial-fixture','01-bust-approach','02-interaction-1','03-interaction-2'];
  const views=names.map(name=>{
    const sa=before.snapshots.find(s=>s.name===name),sb=after.snapshots.find(s=>s.name===name);
    assert.ok(sa&&sb,`${id}/${name} matched view missing`);
    const camera=s=>({position:s.position,look:s.look});
    const ca=camera(sa),cb=camera(sb);assert.equal(canonical(ca),canonical(cb),`${id}/${name} camera differs`);
    return{name,equal:true,before:ca,after:cb};
  });
  pairedEncounterCameras.push({experiment:id,paired:true,views,
    limitation:'Body position/look agree exactly. Live lighting, noise, dialogue duration and departure timestamps are not asserted pixel-identical.'});
}
const strictMediaPass=reports.every(r=>r.media?.strictPass===true);
const summary={kind:'source-experience-native-bounded-prototypes',verifiedAt:Date.now(),frozenBuild:frozen,
  nativeInteractionVerified:true,strictMediaPass,humanReady:false,chapterNativeVerified:false,
  sourceSnapshot:{path:receiptPath,sha256:sha(await readFile(receiptPath)),files:paths.length},
  results:reports.map(r=>({experiment:r.experiment,condition:r.condition,passed:r.passed,report:r.reportPath,reportSha256:r.reportSha256,
    checks:r.checks,capture:{bytes:r.capture.bytes,width:r.capture.width,height:r.capture.height,video:r.capture.video,
      continuousAfterInitialFixture:r.capture.continuousAfterInitialFixture,limitations:r.capture.limitations},media:r.media})),
  pairedInitialConditions,pairedEncounterCameras,
  limitations:['Four declared encounter fixtures; not an earned or unbriefed chapter route.','Native interaction acceptance does not waive failed saved-media gap/sampling checks.',
    'Human launcher smoke, current whole-chapter/tower/reload and fresh-player understanding remain separate pending evidence.',
    'No performed last-light after exists. No native OS window, room microphone or physical headphone result is implied.']};
await writeFile(join(out,'summary.json'),JSON.stringify(summary,null,2));
const snapshot={schema:1,kind:'source-experience-native-verified-snapshot',verifiedAt:summary.verifiedAt,
  summary:join(out,'summary.json'),frozenBuild:frozen,productionIdentity:identities,
  manifests:prepared.map(({id,path,sha256})=>({id,path,sha256})),
  status:'native-interaction-verified-strict-media-and-human-launcher-pending',
  nativeInteractionVerified:true,strictMediaPass,humanReady:false,chapterNativeVerified:false,
  allowedExperiments:['guidance','bust'],technicalSmokeOnly:true,
  limitations:summary.limitations};
await writeFile(join(out,'verified-snapshot.json'),JSON.stringify(snapshot,null,2));
console.log(JSON.stringify({summary:join(out,'summary.json'),snapshot:join(out,'verified-snapshot.json'),
  conditions:reports.length,identityFiles:paths.length,nativeInteractionVerified:true,strictMediaPass,humanReady:false,
  matchedCameras:pairedEncounterCameras.map(pair=>({experiment:pair.experiment,views:pair.views.map(view=>view.name)}))}));
