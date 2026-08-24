import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import {
  applyPerformancePropagation,
  applyPlaybackExposure,
  freshReferenceExposure,
  normalizeReferenceExposure,
  referenceExposureBand,
} from '../src/game/reference-exposure.js';
import { canQualifyBorrowedRecordist, deriveStoryEvidence } from '../src/game/story-evidence.js';
import { OBSCURED_NAME_CAPTION, obscuredNameShape } from '../src/narrative/obscured-name.js';
import {
  hushPerformanceAcousticEvent,
  performanceIntrusionSeed,
  reducePerformanceIntrusion,
} from '../src/game/performance-intrusion.js';
import { attachSignalRole } from '../src/narrative/signal-role.js';
import {
  CAUSAL_SPINE_IDS,
  causalContentHash,
  sealCausalTape,
  validateCausalTape,
} from '../src/causal/tape.js';
import { enactCausalAnchor, makeHushPlayback } from '../src/causal/playback.js';
import { freshSave } from '../src/game/save.js';

let reference=freshReferenceExposure();
reference=applyPlaybackExposure(reference,'main_b3');
assert.deepEqual({density:reference.density,breadth:reference.breadth,count:reference.playbackCounts.main_b3},{density:15,breadth:1,count:1});
reference=applyPlaybackExposure(reference,'main_b3');
assert.equal(reference.density,20);
assert.equal(referenceExposureBand(reference),'TRACE');
reference=applyPlaybackExposure(reference,'the_tub');
assert.equal(reference.density,35);
reference=applyPerformancePropagation(reference,'recording-2');
assert.equal(reference.density,40);
assert.equal(applyPerformancePropagation(reference,'recording-2').density,40,'a battle propagates once');
assert.equal(applyPlaybackExposure({...reference,density:99},'main_b3').density,100,'density caps at 100');
assert.deepEqual(normalizeReferenceExposure(null,{legacyFlags:{'listened.main_b3':true,'listened.the_tub':true}}),{
  schema:1,roomsHeard:['main_b3','the_tub'],playbackCounts:{main_b3:1,the_tub:1},breadth:2,density:30,thresholdsCrossed:['TRACE'],propagatedBattles:[],
});

const fullLedger={
  documentsRead:['faculty-reference-requirement','student-monitoring-notes','pre-roll-analysis','work-order-carbon','page-9'],
  propsInspected:[],propsAuditioned:[],itemsObtained:[],disclosures:[],
};
const evidence=deriveStoryEvidence(fullLedger);
assert.deepEqual([...evidence.tags],[
  'reference-pressure','student-performance','pre-roll-causality','contract-inheritance','borrowed-body',
]);
assert.equal(evidence.combatReadings.length,2);
assert.equal(evidence.sourceGuidance,true);
assert.equal(canQualifyBorrowedRecordist({ledger:fullLedger,hasFork:true,hasRig:true,bodyRedacted:true}),true);
assert.equal(canQualifyBorrowedRecordist({ledger:fullLedger,hasFork:false,hasRig:true,bodyRedacted:true}),false);
assert.equal(deriveStoryEvidence({}).count,0,'zero-clue completion remains eligible for ordinary play');

let intrusion=reducePerformanceIntrusion(0,{missed:true});
assert.deepEqual(intrusion,{value:.2,stage:'MONITOR'});
intrusion=reducePerformanceIntrusion(intrusion.value,{missed:true});
assert.equal(intrusion.stage,'RESONATOR');
intrusion=reducePerformanceIntrusion(.8,{correct:true,movementTransition:true});
assert.equal(intrusion.value,.475,'movement carries half after the deterministic response adjustment');
const performanceEvent=hushPerformanceAcousticEvent({battleId:'hall',stage:'ENSEMBLE',spatial:{roomId:'amplifications'}});
assert.equal(performanceEvent.source.kind,'hush');
assert.equal(performanceEvent.semantics.playerGenerated,undefined);
assert.equal(performanceEvent.semantics.audibleToHush,false);
assert.equal(performanceEvent.semantics.canSpoilTake,false);
assert.equal(performanceIntrusionSeed({density:44}),0);
assert.equal(performanceIntrusionSeed({density:45}),.14);
assert.equal(reducePerformanceIntrusion(performanceIntrusionSeed({density:45}),{missed:true}).stage,'RESONATOR','COHERENT reference reaches the room after one incorrect return');
assert.equal(reducePerformanceIntrusion(performanceIntrusionSeed({density:90}),{correct:true}).stage,'MONITOR','variation can still discharge a saturated head start');

// The Chunk Surfer has nothing of its own to say. It used to be held to that by
// a list of literal sentences in the engine; it is held to it now by having to
// name WHERE it heard the line — which is the same rule, asked as a question the
// author answers rather than a list they join. See TRACE_SOURCES.
assert.equal(attachSignalRole({who:'surfer',text:'Take five.',quotes:'slate'}).signalRole,'chunkSurferTrace');
assert.equal(attachSignalRole({who:'recordist',text:'Take four.'}).signalRole,'playerShadowReturn');
assert.throws(()=>attachSignalRole({who:'hush',text:'forbidden'}),/nonverbal/);
assert.throws(()=>attachSignalRole({who:'surfer',text:'I can explain what HUSH is.'}),/only repeat recorded or institutional language/);
assert.throws(()=>attachSignalRole({who:'surfer',text:'Take five.',quotes:'somewhere'}),/unknown Chunk Surfer trace source/);

function validateStoryRoles(value,file){
  if(Array.isArray(value)){value.forEach((entry)=>validateStoryRoles(entry,file));return;}
  if(!value||typeof value!=='object')return;
  if(value.who)assert.doesNotThrow(()=>attachSignalRole(value),`${file}:${value.id||'line'} has an invalid semantic speaker role`);
  Object.values(value).forEach((entry)=>validateStoryRoles(entry,file));
}

const storyFiles=readdirSync('content/narrative').filter((file)=>file.endsWith('.story.json'));
for(const file of storyFiles){
  const source=readFileSync(`content/narrative/${file}`,'utf8');
  const document=JSON.parse(source);
  assert.doesNotMatch(source,/"who"\s*:\s*"hush"/i,`${file} must not give HUSH dialogue`);
  assert.doesNotMatch(source,/HUSH:/,`${file} must not use a literal HUSH annotation`);
  assert.doesNotMatch(source,/became the music/i,`${file} must keep student and HUSH ontology separate`);
  validateStoryRoles(document,file);
  for(const node of Object.values(document.nodes||{}))for(const line of [...(node.lines||[]),...(node.revisitLines||[])]){
    if(line.who==='surfer')assert.doesNotMatch(String(line.text),/created HUSH|older than music|acoustic density/i,`${file}:${line.id} explains too much through a trace`);
  }
}

// THE UNRESOLVED NAME (docs/story-doctrine.md).
//
// This used to be a single assertion that the authored line reads exactly
// '[NAME OBSCURED]'. That was the doctrine's whole guard, and it was guarding
// the wrong thing: the string was doing duty as the performance, so the player
// pressed a button labelled "[NAME OBSCURED]" to say their own name. The line is
// drawn as a shape now and the caption is the accessible fallback it always
// should have been — so the contract has to move up a level rather than away.
const coldOpen=JSON.parse(readFileSync('content/narrative/conservatory.cold_open_dialogue.story.json','utf8'));
const threshold=coldOpen.nodes.threshold.lines;
const masked=threshold.find((line)=>line.id==='threshold.line.name-obscured');
const repeated=threshold.find((line)=>line.id==='threshold.line.name-repeat');
assert.equal(masked.text,OBSCURED_NAME_CAPTION,'the caption survives as the accessible fallback');
assert.equal(masked.mask,'operator-name','and the line is drawn as a shape, not as the caption');
assert.equal(masked.voice,false,'the authored row is typed; local voice never becomes line text');
assert.deepEqual(masked.cues,['booth.name-mask'],'the rain can never be unbound from it');
assert.ok(masked.prompt&&!masked.prompt.includes('OBSCURED'),'you do not press a redaction stamp to speak');
assert.equal(repeated?.text,OBSCURED_NAME_CAPTION,'the requested repeat stays masked too');
assert.equal(repeated?.voice,false,'the repeated literal voice also remains outside the transcript');
assert.deepEqual(repeated?.cues,['booth.name-mask'],'the repeat remains under the rain');
assert.ok(threshold.find((line)=>line.id==='threshold.line.name-accepted'),'he still visibly accepts it');
// The same shape stands in the RETURNED box: somebody was already written in,
// and it is the same illegible thing you just gave.
const returned=threshold.find((line)=>line.id==='threshold.line.returned-shape');
assert.equal(returned?.mask,'operator-name','the returned box carries the same mask');
// No authored line in the whole corpus may carry a literal name for the
// operator. The masked lines are the only ones allowed to reference the mask.
for(const document of readdirSync('content/narrative')){
  if(!document.endsWith('.story.json'))continue;
  const parsed=JSON.parse(readFileSync(`content/narrative/${document}`,'utf8'));
  for(const node of Object.values(parsed.nodes||{})){
    for(const line of node.lines||[]){
      if(!line.mask)continue;
      assert.equal(line.mask,'operator-name',`${document}: unknown mask ${line.mask}`);
      assert.equal(line.text,OBSCURED_NAME_CAPTION,`${document}: a masked line's text is its caption`);
    }
  }
}
// And the shape generator can only ever emit blocks — proved exhaustively in
// test/obscured-name.spec.mjs; spot-checked here so this file fails too if the
// alphabet is ever widened.
for(const runSeed of [0,1,17,4417]){
  assert.match(obscuredNameShape({runSeed}).cells,/^[░▏▯▓▮█ ]+$/u,'a letter reached the masked line');
}
const mainSource=readFileSync('src/main.js','utf8');
assert.match(mainSource,/operator\.name\.received/);
assert.doesNotMatch(mainSource,/operator\.name\s*=/,'only the semantic received fact may persist');
assert.doesNotMatch(JSON.stringify(freshSave()),/operatorName|operator_name|literalName/);
assert.match(mainSource,/speakBoothName\(\{repeat:repeatedName\}\)/,'both masked booth rows own local-only speech');
assert.match(mainSource,/ephemeralOperatorName\|\|fallback/,'missing or disabled identity keeps the obscured voice fallback');
assert.match(mainSource,/speakObscuredNameEcho\(\)/,'the B3 pre-roll uses the non-personal echo path');
assert.doesNotMatch(mainSource,/SPEECH\.say\([^\n]*ephemeralOperatorName/,'the literal persona cannot enter presented text');

const anchors=CAUSAL_SPINE_IDS.map((id,index)=>({
  id,at:1000+index*1000,order:index,verb:id.endsWith('contact')?'contact':'haunt',required:true,
  locus:{x:index,y:index,roomId:index===5?'source_space':'main_b3',spaceId:index===5?'source-space':'conservatory'},
  payload:{resolved:index},
}));
const tape=sealCausalTape({
  runId:'coherence',returnSummaryId:'return:coherence',endingId:'sacrifice',durationMs:12000,
  qualification:{injuries:0,difficulty:'contract',completedAt:1},requireCausalSpine:true,
  shadowFrames:[{t:0,x:0,y:0,spaceId:'conservatory'},{t:6000,x:5,y:5,spaceId:'source-space'},{t:12000,x:8,y:8,spaceId:'conservatory'}],
  anchors,events:[],
});
assert.equal(validateCausalTape(tape).ok,true);
const broken={...tape,anchors:tape.anchors.slice(1)};
broken.contentHash=causalContentHash(broken);
assert.equal(validateCausalTape(broken).reason,'CAUSAL_SPINE_INCOMPLETE');
const playback=makeHushPlayback(tape,{now:0});
assert.equal(enactCausalAnchor(playback,'haunt',{x:0,y:0,spaceId:'source-space'}).reason,'WRONG_SPACE');

const audioProject=JSON.parse(readFileSync('content/audio/audio-project.audio.json','utf8'));
assert.ok(audioProject.cues.find((cue)=>cue.id==='booth.name-mask'));
assert.ok(audioProject.triggers.find((trigger)=>trigger.event.endsWith('threshold.line.name-obscured')));
const doctrine=readFileSync('docs/story-doctrine.md','utf8');
assert.match(doctrine,/HUSH is older than music/);
assert.match(doctrine,/synthesized locally beneath those two booth lines/);
const sourceRuntime=readFileSync('src/game/source-space-runtime.js','utf8');
assert.doesNotMatch(sourceRuntime,/source-hush-|text-actor:hush|pose:\s*['"]standing['"].*source:\s*['"]hush/i,'Source may not assemble a visible HUSH body');
assert.match(sourceRuntime,/source-density-wake-/,'Source visualizes displaced architecture around an unseen agency');

console.log('story and HUSH coherence contracts passed');
