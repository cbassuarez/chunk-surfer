import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SET_PIECE as S,createScareDirector,createSetPiece,createStartleMeter} from '../src/game/set-pieces.js';
import {contactHitPlan} from '../src/audio/contact-hit.js';
import {createPressurePerformance} from '../src/game/pressure-performance.js';

const main=readFileSync('src/main.js','utf8');
const body=name=>{const at=main.indexOf(`function ${name}(`);assert.ok(at>=0,name);return main.slice(at,main.indexOf('\n}\n',at));};
const run=(piece,seconds,input={},dt=1/60)=>{const frames=[];for(let t=0;t<seconds;t+=dt)frames.push(piece.step(dt,input));return frames;};

test('each scare needs a calm stretch, never repeats, and a run never gets the whole set',()=>{
  const d=createScareDirector({seed:'run-a'});
  assert.equal(d.ready('document'),false,'nothing in the first minute and a half');
  d.tick(S.calmSeconds-1);assert.equal(d.ready('document'),false);
  d.tick(2);assert.equal(d.ready('document'),true);
  d.spend('document');assert.equal(d.ready('meter'),false,'spending one starts the calm again');
  d.tick(S.calmSeconds+1);assert.equal(d.ready('meter'),true);assert.equal(d.ready('document'),false,'once');
  d.tick(1,{danger:true});assert.equal(d.ready('meter'),false,'a real hunt is not calm');
  const full=createScareDirector({spent:S.ids.slice(0,S.maxPerRun)});full.tick(1000);
  for(const id of S.ids)assert.equal(full.ready(id),false);
  assert.ok(S.maxPerRun>=3&&S.maxPerRun<=5&&S.maxPerRun<S.ids.length);
});

test('the spent set survives a reload, and the patient torch cut waits longer than the rest',()=>{
  const back=createScareDirector({spent:['torch']});back.tick(1000);assert.equal(back.ready('torch'),false);
  const seeds=['a','b','c','d'].map(seed=>createScareDirector({seed}).patience);
  assert.ok(new Set(seeds).size>1,'not the same moment every run');assert.ok(seeds.every(p=>p>=0&&p<=S.patienceSeconds));
  const d=createScareDirector({seed:'x'});d.tick(S.calmSeconds);
  assert.equal(d.ready('torch'),true);assert.equal(d.ready('torch',{patient:true}),d.patience===0);
  const god=createScareDirector({spent:['torch']});god.force('torch');assert.equal(god.ready('torch',{patient:true}),true,'the God menu skips the wait');
  god.spend('torch');assert.equal(god.forced(),'torch','it holds the stage open until the piece ends');assert.equal(god.ready('torch'),false,'without firing twice');
  god.release();assert.equal(god.forced(),null);
});

test('torch: dark, silence, the light returns on the figure, it cuts once more, and it is gone',()=>{
  const c=S.torch,frames=run(createSetPiece('torch'),c.cutSeconds+c.figureSeconds+c.recutSeconds+.1);
  assert.ok(frames[0].torchCut&&!frames[0].figure&&!frames[0].hit);
  assert.equal(frames[0].vacuum,S.vacuumFloor,'the room falls away from the first moment');
  const hit=frames.findIndex(f=>f.hit);assert.ok(hit>0);assert.equal(frames.filter(f=>f.hit).length,1,'one hit');
  assert.ok(frames[hit].figure&&!frames[hit].torchCut,'the light and the body arrive on the same frame as the hit');
  const after=frames.findIndex((f,i)=>i>hit&&!f.figure);assert.ok(frames[after].torchCut,'it goes in a second cut');
  assert.ok(frames.at(-1).done&&!frames.at(-1).torchCut,'and the light is left on');
  assert.equal(frames.at(-1).vacuum,1);
});

test('torch: the player\'s own switch skips the cut, and reduced flash skips the second one',()=>{
  const click=createSetPiece('torch',{entry:'click'}).step(1/60);assert.ok(click.hit&&click.figure&&!click.torchCut);
  const soft=run(createSetPiece('torch',{entry:'click',reducedFlash:true}),S.torch.figureSeconds+.05);
  assert.ok(soft.every(f=>!f.torchCut),'no flicker');assert.ok(soft.at(-1).done);
});

test('meter: it pins while the recorder is up, lowering it shows the figure, and waiting it out shows nothing',()=>{
  const c=S.meter,piece=createSetPiece('meter');
  const up=run(piece,1);assert.ok(up.every(f=>f.pinned&&!f.figure&&!f.hit));assert.equal(up[0].vacuum,S.vacuumFloor);
  const down=piece.step(1/60,{closed:true});assert.ok(down.hit&&down.figure&&down.negative&&!down.pinned);
  const later=run(piece,c.figureSeconds+.05,{closed:true});assert.equal(later.filter(f=>f.hit).length,0);assert.ok(later.at(-1).done);
  const waited=run(createSetPiece('meter'),c.pinSeconds+.05);assert.ok(waited.every(f=>!f.hit&&!f.figure),'the patient are left alone');assert.ok(waited.at(-1).done&&!waited.at(-1).pinned);
});

test('document: it stands behind the page while you read, and is there when you put it down',()=>{
  const piece=createSetPiece('document');
  const reading=run(piece,3);assert.ok(reading.every(f=>f.figure&&!f.hit&&!f.done),'no time limit on reading');
  const down=piece.step(1/60,{closed:true});assert.ok(down.hit&&down.figure&&down.negative);
  const gone=run(piece,S.document.figureSeconds+.05,{closed:true});assert.ok(gone.at(-1).done&&!gone.at(-1).figure);
});

test('relief: it waits for the speech to end, then breaks it; if the moment passes, nothing happens',()=>{
  const c=S.relief,piece=createSetPiece('relief');
  assert.ok(run(piece,5,{quiet:0}).every(f=>!f.hit&&!f.figure));
  const hit=piece.step(1/60,{quiet:c.quietSeconds});assert.ok(hit.hit&&hit.figure);
  const gone=createSetPiece('relief');assert.ok(run(gone,c.expireSeconds+.05,{quiet:0}).at(-1).done);
});

test('the startle meter finds a jolt within the window, against what the hand was doing already',()=>{
  const m=createStartleMeter();for(let t=0;t<1000;t+=16)m.move(t,4,0);
  m.hit(1000,'torch');assert.equal(m.settle(1100),null,'not yet');
  for(let t=1000;t<1300;t+=16)m.move(t,t>1150?120:4,0);
  const row=m.settle(1301);assert.equal(row.id,'torch');assert.equal(row.jolt,true);assert.ok(row.reactionMs>=150&&row.reactionMs<=170);
  assert.equal(m.settle(1400),null,'once');
  const busy=createStartleMeter();for(let t=0;t<1000;t+=16)busy.move(t,90,0);busy.hit(1000,'x');for(let t=1000;t<1300;t+=16)busy.move(t,100,0);
  assert.equal(busy.settle(1301).jolt,false,'already turning fast is not a startle');
  const still=createStartleMeter();still.hit(0,'y');assert.equal(still.settle(301).jolt,false);
});

test('the catch keeps its ringing and dull room to itself',()=>{
  const plain=contactHitPlan({plain:true}),catchHit=contactHitPlan();
  assert.equal(plain.ring,null);assert.equal(plain.dull,null);assert.ok(catchHit.ring&&catchHit.dull);assert.equal(plain.thump.peak,catchHit.thump.peak);
  for(const id of ['torch','meter','document','relief','spoil'])assert.ok(S[id].hit<1,`${id} stays under the catch`);
  assert.match(body('revealSetPiece'),/play\(\{plain:true/);assert.match(body('maybeJumpscare'),/play\(\{plain:true/);
});

test('the figure is a performance with no authority: abrupt, still, and it never approaches',()=>{
  const p=createPressurePerformance(),actor={id:'set-piece:torch',role:'recording-hallucination',x:4,y:4,floorH:0,heading:1,motion:'idle',strength:1};
  const first=p.tick(1/60,{secondary:actor}).secondary;assert.equal(first.performance.manifestation,1,'there on the first frame');
  assert.equal(p.tick(1/60,{secondary:null}).secondary,null,'gone on the next');
  const ordinary=createPressurePerformance().tick(1/60,{secondary:{...actor,id:'recording:x'}}).secondary;assert.ok(ordinary.performance.manifestation<.2,'every other body keeps its rise');
  const reveal=body('revealSetPiece'),tick=body('tickSetPieces');
  assert.doesNotMatch(reveal+tick,/REC\.(emitNoise|injure)|MUT\.markHeard|summonPresence|onPresenceCatch|REC\.spoil/,'it hears nothing, hurts nothing, spoils nothing');
  assert.doesNotMatch(body('applySetPieceFrame'),/setPieceActor=/,'and it stays where it was placed');
});

test('a staged catch has the photograph but not the voice, the injury or the memento',()=>{
  const arm=body('armHushJump');
  assert.ok(arm.indexOf('if(staged)return true;')<arm.indexOf('FEAR.playContactExposure'),'no voice');
  assert.ok(arm.indexOf('if(staged)return true;')<arm.indexOf('injuryScareGate.authorize'),'no injury');
  assert.match(arm,/if\(!staged\)lastExposureFrame=null/);assert.match(arm,/captured:!!staged/,'the kept frame stays the last real one');
});

test('no set piece talks over the night\'s own endings, a tape, or the real Hush',()=>{
  const stage=body('setPieceStageOpen'),danger=body('setPieceDanger');
  for(const need of ['usingSourceSpace()','firstStrikeScene','night?.sourceExited','NIGHT_CLOCK_SOURCE_EXIT_SECONDS','REC.isMonitoring()','PB.isPlaying()','TUT.tutorialActive()','setupComplete()','completedRecordingTakes()>=1'])assert.ok(stage.includes(need),need);
  for(const need of ['lastExposureEvent','activeBattleId','recordingFalseHush','hushActiveForPlayer()'])assert.ok(danger.includes(need),need);
  assert.equal(main.includes("flagGet('jumpscares')"),false,'the two-per-run budget is gone');
  assert.match(main,/if\(!contamination&&!witnessed\)queueReliefSetPiece\(\);/,'only a clean, unwitnessed take is a relief');
  assert.match(body('queueReliefSetPiece'),/completedRecordingTakes\(\)<2/,'never the first take');
});

test('the torch cut leaves the player\'s switch alone and always gives the light back',()=>{
  const rec=readFileSync('src/game/recordist.js','utf8');
  assert.match(rec,/lightOn\(\) \{ return state\.light && !lightCut; \}/);
  assert.match(body('endSetPiece'),/REC\.setLightCut\(false\)/);assert.match(body('tickSetPieces'),/if\(!stage&&!lastExposureEvent\?\.staged\)\{endSetPiece\(\);return;\}/);
});
