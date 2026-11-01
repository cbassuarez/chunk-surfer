import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ENDING_ARRIVAL,ENDING_MANIFEST,ENDING_VARIANT,SOURCE_REST_CUTSCENE,SOURCE_REST_MANIFEST,endingContractErrors,endingManifest,normalizeEndingVariant} from '../src/data/endings.js';
import {normalizeEndingCutsceneCheckpoint} from '../src/game/save.js';
import {advanceEndingCutscene,claimEndingCutsceneCompletion,createEndingCutsceneState,endingCutsceneErrors} from '../src/game/ending-cutscene.js';
import {endingEmbodimentErrors} from '../src/game/ending-embodiment.js';
import {buildEndingDossier,endingDocuments,projectDossierFlags} from '../src/game/ending-runtime.js';
import {buildRunSummary,returnDefinition,returnIndexEntries} from '../src/progression/report.js';
import {ENDING_IDS,freshRunRecord} from '../src/progression/schema.js';
import {validateNarrativeDocument} from '../src/narrative/contracts.js';

test('rest is a distinct arrival of the existing terminal ending, never a Contact fight',()=>{
  const {SOURCE_REST:variant}=ENDING_VARIANT,{RESTED:arrival}=ENDING_ARRIVAL;
  assert.equal(ENDING_IDS.length,9);
  assert.equal(normalizeEndingVariant('contact-lost',variant,arrival),variant);
  assert.equal(normalizeEndingVariant('contact-lost',variant,ENDING_ARRIVAL.DEFEATED),null);
  assert.equal(normalizeEndingVariant('sacrifice',variant,arrival),null);
  assert.equal(endingManifest('contact-lost',{variant,arrival}),SOURCE_REST_MANIFEST);
  assert.equal(endingManifest('contact-lost',{arrival:ENDING_ARRIVAL.DEFEATED}),ENDING_MANIFEST['contact-lost']);
  assert.deepEqual(endingCutsceneErrors(SOURCE_REST_CUTSCENE),[]);
  assert.deepEqual(endingEmbodimentErrors({'source-rest':SOURCE_REST_CUTSCENE}),[]);
  assert.deepEqual(endingContractErrors(),[]);
  const doc=JSON.parse(readFileSync('content/narrative/ending.source-rest.story.json','utf8'));
  assert.deepEqual(validateNarrativeDocument(doc).errors,[]);
  assert.doesNotMatch(doc.nodes.start.lines.map(line=>line.text).join(' '),/\bfight\b|\bbattle\b|fault was closed/i);
});

test('rest checkpoint, dossier and return preserve the truthful variant after reload',()=>{
  const variant=ENDING_VARIANT.SOURCE_REST,arrival=ENDING_ARRIVAL.RESTED;
  const checkpoint={schema:1,endingId:'contact-lost',arrival,variant};
  assert.deepEqual(normalizeEndingCutsceneCheckpoint(JSON.parse(JSON.stringify(checkpoint))),checkpoint);
  assert.equal(normalizeEndingCutsceneCheckpoint({...checkpoint,arrival:ENDING_ARRIVAL.DEFEATED}).variant,undefined);
  const save={run:freshRunRecord({id:'source-rest-test',now:1000}),playSeconds:8};
  const authoritative={endingVariant:variant,endingArrival:arrival};
  const dossier=buildEndingDossier({endingId:'contact-lost',arrival,save,authoritative,now:2000});
  assert.equal(dossier.variant,variant);
  assert.equal(projectDossierFlags(dossier)['ending.arrival.rested'],true);
  assert.equal(projectDossierFlags(dossier)['ending.arrival.defeated'],false);
  assert.equal(projectDossierFlags(dossier)['ending.variant.sourceRest'],true);
  assert.deepEqual(endingDocuments('contact-lost',arrival,dossier),[{id:'ending.source-rest',kind:'ending',slate:''}]);
  const summary=buildRunSummary({endingId:'contact-lost',save,authoritative,now:2000});
  assert.equal(summary.endingArrival,arrival);assert.equal(summary.endingVariant,variant);assert.equal(summary.seal,null);
  assert.equal(returnDefinition('contact-lost',{variant}).classification,'SOURCE / REST');
  const index=returnIndexEntries({endingsSeen:['contact-lost'],returns:{records:{[summary.id]:summary},history:[summary.id]}});
  const entry=index.find(row=>row.id==='contact-lost');
  assert.equal(entry.variantTitle,'THE PLACE TO REST');assert.equal(entry.displayClassification,'SOURCE / REST');
});

test('rest and battle defeat have distinct, idempotent completion receipts',()=>{
  const step=advanceEndingCutscene(createEndingCutsceneState(SOURCE_REST_CUTSCENE),SOURCE_REST_CUTSCENE,{elapsedMs:5000});
  assert.equal(step.state.complete,true);
  assert.equal(step.state.completionId,'ending-cutscene:contact-lost:source-rest:complete');
  assert.notEqual(step.state.completionId,'ending-cutscene:contact-lost:complete');
  const once=claimEndingCutsceneCompletion(step.state,step.state.completionId);
  assert.equal(once.claimed,true);assert.equal(claimEndingCutsceneCompletion(once.state,step.state.completionId).claimed,false);
});
