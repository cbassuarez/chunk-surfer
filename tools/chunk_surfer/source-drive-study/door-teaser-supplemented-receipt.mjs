// Offline only: bind qualified media to immutable failed/full and passing/
// bounded receipts. Never rewrite the primary receipt or its failed latest.
import {readFile,writeFile,stat} from 'node:fs/promises';
import {join,dirname,basename} from 'node:path';
import {createHash} from 'node:crypto';
const primary=process.env.SOURCE_DRIVE_PRIMARY_ATTEMPT,supplement=process.env.SOURCE_DRIVE_RELOAD_SUPPLEMENT;
if(!primary||!supplement)throw Error('Explicit primary attempt and actual reload supplement directories are required.');
const hash=b=>createHash('sha256').update(b).digest('hex'),load=async p=>{const bytes=await readFile(p);return{path:p,sha256:hash(bytes),data:JSON.parse(bytes)};};
const p=await load(join(primary,'report.json')),s=await load(join(supplement,'report.json')),r=p.data,q=s.data,base=dirname(primary),attempt=basename(primary),relative=path=>path.slice(base.length+1),filmPath=join(base,r.film.path),filmBytes=await readFile(filmPath),sourceManifestSha256=hash(JSON.stringify(r.sourceBefore));
const validations={
 originalExplicitlyFailed:r.passed===false,
 originalSixteenTechnicalChecks:r.checks.length===16&&r.checks.every(c=>c.pass===true),
 originalFailurePreserved:/TimeoutError/.test(r.failure||'')&&/at startup/.test(r.failure||''),
 originalFaultClassification:r.errors.length===1&&r.errors[0]==='The declared output budget was exceeded.'&&r.assetFailures.length===0,
 originalFrozenStable:r.sourceStable&&JSON.stringify(r.sourceBefore)===JSON.stringify(r.sourceAfter),
 supplementPassed:q.passed===true&&q.mode==='bounded-recovery'&&q.checks.length===13&&q.checks.every(c=>c.pass)&&q.errors.length===0&&q.assetFailures.length===0,
 supplementBindsOriginal:q.primary===primary&&q.primaryReportSha256===p.sha256&&q.film.sha256===r.film.sha256,
 sameImmutableSources:q.sourceStable&&JSON.stringify(q.sourceBefore)===JSON.stringify(q.sourceAfter)&&JSON.stringify(q.sourceBefore)===JSON.stringify(r.sourceBefore),
 rawFilmHash:hash(filmBytes)===r.film.sha256&&filmBytes.length===r.film.bytes,
 rawFilmDecoded:r.film.decoded&&r.film.streamTiming.every(t=>t.nonMonotonicDts===0)&&r.film.mediaProbe.streams.some(x=>x.codec_type==='audio'&&x.channels===2),
 physicalAudioHash:hash(await readFile(join(primary,'actual-field-take.webm')))===r.storedFieldAudio.sha256,
 filmUnder64MiB:filmBytes.length<64*1024*1024,
 originalTotalBudgetFailureVisible:r.outputBytes>r.outputBudgetBytes,
};
for(const still of r.screenshots)validations['still:'+still.name]=hash(await readFile(join(base,still.path)))===still.sha256;
const qualified=Object.values(validations).every(Boolean);if(!qualified)throw Error('Qualified receipt rejected: '+Object.entries(validations).filter(([,pass])=>!pass).map(([n])=>n).join(', '));
const receipt={kind:'opening-playable-coastal-supplemented-evidence',schema:1,qualifiedTechnicalEvidence:true,originalFullRunPassed:false,fullRunPassed:false,attempt,
 preview:{allowed:true,label:'V8 behavior baseline — separate reload validation; original full receipt failed',scope:'Earlier V8 material appearance and player-control behavior. Not approval of later V9 appearance, fresh-player experience, normal-hardware pacing or a single passing full-run receipt.'},
 primary:{report:relative(p.path),sha256:p.sha256,passed:false,technicalChecksPassed:r.checks.length,snapshot:r.snapshot,sourceStable:r.sourceStable,sourceManifestSha256,sourceCount:r.sourceBefore.length,harnessSha256:r.harnessSha256},
 supplement:{report:relative(s.path),sha256:s.sha256,passed:true,checksPassed:q.checks.length,mode:q.mode,sourceStable:q.sourceStable,sourceManifestSha256:hash(JSON.stringify(q.sourceBefore)),qualification:q.qualification},
 originalFailures:[{kind:'saved-menu-selector',detail:'The preserved full harness timed out in startup() after its actual page reload because its running copy accepted only START A NEW NIGHT. The exact original page at timeout was not captured; the separate actual resumes expose CONTINUE / RESUME THE NIGHT YOU LEFT. The selector in the future tool source is corrected; this original report is unchanged.'},{kind:'total-attempt-output-budget',reportedTotalBytes:r.outputBytes,limitBytes:r.outputBudgetBytes,excessBytes:r.outputBytes-r.outputBudgetBytes,detail:'The primary48.19MB raw film is below64MiB; the entire original attempt including trace, audio, reports and stills exceeded its64MiB total-attempt guard. All originals remain preserved. No retroactive budget-pass claim.'}],
 film:{...r.film,path:r.film.path,verifiedSha256:hash(filmBytes)},screenshots:r.screenshots,
 physicalTape:{path:attempt+'/actual-field-take.webm',sha256:r.storedFieldAudio.sha256,bytes:r.storedFieldAudio.bytes,continuous:r.newTakes[0].continuous},
 recovery:{export:attempt+'/capture-owned-recovery.json',sha256:q.recoverySha256,qualification:'Exact storage was exported after the primary real cold reload, then imported with the matching original blob to a fresh disposable profile. Normal CONTINUE and a second real page reload were verified there. The original disposed browser/profile is not represented as retained.'},
 progression:r.progression,
 measuredTiming:{nativePlayerControlSimulationSeconds:r.progression.freeSimulationSeconds,nativePlayerControlWallSeconds:(r.progression.freeLastMs-r.progression.freeFirstMs)/1000,forcedTailSimulationSeconds:r.progression.forcedSimulationSeconds,qualification:'The finite route was genuinely traversed under ordinary controls, including stopping, looking, reverse and operator corrections. This is not a countdown or fixed journey duration. Capture cadence includes readback/telemetry/encoding plus unrelated concurrent Chrome/Metal load; normal-hardware pacing is unaccepted. The earlier CPU-only operator result (~91.1 simulated seconds) is separate from this108.9-second simulated control window.'},
 inspectedImages:{reviewer:'native QA agent',observations:['Early fall-reference retains the actual limestone face and stranded vehicles/ledge above as a fixed world reference.','The climbing-queue frame places some carnage above/right of the windscreen; it is not a clean composition acceptance.','Sea-contact has a very bright water/near-backscatter response under final dither. V8 material finish remains qualified.','Return frame and independent diagnostics show the exact dark room and the light tutorial.']},
 validations,acceptance:{boundedTechnicalBehavior:true,originalFullRun:false,currentAppearance:false,normalHardwarePacing:false,humanFear:false,independentSoundReview:false,freshPlayerValidation:false},
};
const path=join(primary,'supplemented-evidence.json');await writeFile(path,JSON.stringify(receipt,null,2));const evidenceBytes=await readFile(path);await writeFile(join(base,'supplemented-latest.json'),JSON.stringify({attempt,evidence:attempt+'/supplemented-evidence.json',sha256:hash(evidenceBytes)},null,2));
console.log(JSON.stringify({qualifiedTechnicalEvidence:true,fullRunPassed:false,path,sha256:hash(evidenceBytes),primaryReportSha256:p.sha256,supplementReportSha256:s.sha256,filmSha256:r.film.sha256,filmBytes:(await stat(filmPath)).size},null,2));
