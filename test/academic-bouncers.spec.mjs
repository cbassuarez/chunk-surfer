import test from 'node:test';
import assert from 'node:assert/strict';
import {ACADEMIC_BOUNCER_ACTORS as ACTORS,ACADEMIC_BOUNCER_CUE as CUE,
  ACADEMIC_BOUNCER_PHRASE as PHRASE,ACADEMIC_BOUNCER_CLUES as CLUES,
  ACADEMIC_BOUNCER_SPOKEN_CLUES as SPOKEN_CLUES,ACADEMIC_BOUNCER_CLUE_RECEIPT_IDS as CLUE_RECEIPT_IDS,
} from '../src/data/academic-bouncers.js';
import {createAcademicBouncers,createAcademicBouncerState} from '../src/game/academic-bouncers.js';
import {createAcademicBouncerSocietyState} from '../src/game/academic-bouncer-society.js';
import {academicBouncerPanelLayout,academicBouncerSocialPanelLayout,makeAcademicBouncerScene} from '../src/game/academic-bouncer-scene.js';
import {academicBouncerSocialDialogue} from '../src/data/academic-bouncer-society.js';
import * as scenes from '../src/game/scenes.js';

const learn=controller=>controller.learnFromProp('practice-desk-stack-1');
const clueReceipts=(earned={})=>Object.fromEntries(CLUE_RECEIPT_IDS.map(id=>[id,earned[id]===true]));
function gap(controller){controller.beginAttempt();while(controller.view().attempt.currentLine)controller.finishLine();}
function terminal(controller){while(controller.view().attempt?.currentLine)controller.finishLine();}
function steps(controller,seconds,context){for(let index=0;index<Math.round(seconds*10);index++)controller.tick(.1,context);}
function fakeVoice(){
  const voices=[];let stops=0,disposals=0;
  return{voices,get stops(){return stops;},get disposals(){return disposals;},warm(){},
    start(text,opts){const handle={text,opts,finished:false,done(){return this.finished;}};voices.push(handle);return handle;},
    stop(){stops++;},dispose(){disposals++;}};
}
function sceneFixture(options={}){
  const controller=options.controller||createAcademicBouncers(),voice=fakeVoice();
  let done=0,cancelled=0;
  const lines=[];
  const scene=makeAcademicBouncerScene({controller,createVoice:()=>voice,onLine:line=>lines.push(line),
    onDone:()=>done++,onCancel:()=>cancelled++,...options});
  scenes.push(scene);
  const press=(key,extra={})=>{scene.key({key,...extra});scene.keyup({key});};
  return{controller,voice,scene,lines,press,get done(){return done;},get cancelled(){return cancelled;}};
}
test.afterEach(()=>scenes.clear());

test('the real six-topic social picker and complete captions fit a compact panel with a clear lower rim',()=>{
  const dialogue=academicBouncerSocialDialogue(),options=dialogue.nodes.start.choices;
  assert.equal(options.length,6);
  for(const cols of[64,80,100]){
    const menu=academicBouncerSocialPanelLayout({pending:{options,index:4}},{cols,rows:39});
    assert.equal(menu.fits,true);assert.ok(menu.height<=15);
    assert.deepEqual([...new Set(menu.content.filter(row=>Number.isInteger(row.choiceIndex)).map(row=>row.choiceIndex))],[0,1,2,3,4,5]);
    assert.ok(menu.content.filter(row=>row.choiceIndex===4).every(row=>row.cls==='ui-amber'));
    assert.ok(menu.content.length+menu.bottomSafetyRows<=menu.body.h);
    for(const node of Object.values(dialogue.nodes))for(const line of node.lines){
      const layout=academicBouncerSocialPanelLayout({line,typing:false},{cols,rows:39});
      assert.equal(layout.fits,true);assert.ok(layout.height<=10);
    }
  }
});

test('old or malformed saves normalise only earned admission and known source receipts',()=>{
  assert.deepEqual(createAcademicBouncerState(null),{version:2,admitted:false,clues:clueReceipts(),social:createAcademicBouncerSocietyState()});
  const controller=createAcademicBouncers({admitted:'yes',clues:{practice:true,bathroom:1,alien:true},
    knowsPhrase:true,attempt:{outcome:'success'},asideProgress:1});
  assert.equal(controller.view().knowsPhrase,true);assert.equal(controller.view().attempt,null);
  assert.deepEqual(controller.save(),{version:2,admitted:false,clues:clueReceipts({practice:true}),social:createAcademicBouncerSocietyState()});
  assert.equal(createAcademicBouncers({knowsPhrase:true}).view().knowsPhrase,false);
});

test('every full E clue independently teaches the exact words and the completed question then pause',()=>{
  assert.equal(new Set(CLUES.map(clue=>clue.id)).size,CLUES.length);
  assert.equal(new Set(CLUES.map(clue=>clue.propId)).size,CLUES.length);
  for(const {propId,id} of CLUES){
    const controller=createAcademicBouncers();const clue=controller.learnFromProp(propId);
    assert.equal(clue.teachesPhrase,true);assert.equal(clue.stateChanged,true);assert.equal(controller.view().knowsPhrase,true);
    const text=clue.lines.map(line=>line.text).join(' ');assert.ok(text.includes(PHRASE));assert.ok(text.includes(CUE));
    assert.match(text,/finish/i);assert.match(text,/before|pause/i);
    assert.equal(controller.learnFromProp(propId).stateChanged,false);
    const restored=createAcademicBouncers(controller.save());assert.equal(restored.view().knowsPhrase,true);
    assert.deepEqual(Object.entries(restored.save().clues).filter(([,earned])=>earned),[[id,true]],'one source suffices without filling other receipts');
    gap(restored);assert.ok(restored.view().attempt.options.some(option=>option.text===PHRASE));
  }
  const controller=createAcademicBouncers();
  for(const invalid of ['unknown','boxOffice','hugh-admission-advice',null,undefined,{},'']){
    assert.equal(controller.learnFromProp(invalid),null);
  }
  assert.equal(controller.view().knowsPhrase,false);
});

test('old box-office pointer receipts never invent words until the actual new programme is inspected',()=>{
  const controller=createAcademicBouncers({version:2,clues:{boxOffice:true},knowsPhrase:true});
  assert.equal(controller.save().clues.boxOffice,true);
  assert.equal(controller.save().clues.boxOfficeInstructions,false);
  assert.equal(controller.view().knowsPhrase,false);gap(controller);
  assert.equal(controller.view().attempt.options.some(option=>option.text===PHRASE),false);
  controller.cancelAttempt();controller.load(controller.save());
  assert.equal(controller.view().knowsPhrase,false);
  const clue=controller.learnFromProp('box-office-program-stack');
  assert.equal(clue.id,'boxOfficeInstructions');assert.equal(clue.newlyLearned,true);
  assert.equal(controller.save().clues.boxOffice,true);assert.equal(controller.view().knowsPhrase,true);
  const restored=createAcademicBouncers(controller.save());assert.equal(restored.view().knowsPhrase,true);
  assert.equal(restored.learnFromProp('box-office-program-stack').stateChanged,false);
  assert.equal(restored.save().admitted,false);
});

test('spoken advice is an independent alternative earned only by its completed conversation',()=>{
  const source=SPOKEN_CLUES[0],controller=createAcademicBouncers();
  const text=source.lines.map(line=>line.text).join(' ');
  assert.ok(text.includes(PHRASE));assert.ok(text.includes(CUE));assert.match(text,/finish/i);assert.match(text,/pause before Vera/i);
  assert.ok(source.lines.every(line=>ACTORS.some(actor=>actor.id===line.actorId)));
  for(const options of [undefined,{}, {completed:false},{completed:'yes'}]){
    assert.equal(controller.learnFromConversation(source.sourceId,options),null);
    assert.equal(controller.view().knowsPhrase,false);
  }
  assert.equal(controller.learnFromConversation('unknown',{completed:true}),null);
  assert.equal(controller.learnFromConversation('box-office-program-stack',{completed:true}),null);
  const receipt=controller.learnFromConversation(source.sourceId,{completed:true});
  assert.equal(receipt.stateChanged,true);assert.equal(controller.view().knowsPhrase,true);
  assert.equal(controller.save().admitted,false);assert.equal(controller.view().attempt,null);
  assert.equal(controller.learnFromConversation(source.sourceId,{completed:true}).stateChanged,false);
  assert.deepEqual(Object.entries(controller.save().clues).filter(([,earned])=>earned),[[source.id,true]]);
  const restored=createAcademicBouncers(controller.save());gap(restored);
  assert.equal(restored.interject('guests').accepted,true);
  restored.cancelAttempt();assert.equal(restored.save().admitted,false,'the explanation never bypasses terminal admission');
});

test('parent save and load retain completed social topics without inventing admission or resuming a conversation',()=>{
  const controller=createAcademicBouncers({clues:{practice:true}});
  controller.society.beginDialogue();
  controller.society.endDialogue({completed:true,choices:[{bouncerTopic:'stay'}]});
  const saved=controller.save();
  assert.deepEqual(saved.social.topics,['stay']);assert.equal(saved.social.conversations,1);
  assert.equal(saved.admitted,false);assert.equal(saved.clues.practice,true);
  controller.society.beginDialogue();
  controller.load(saved);
  assert.equal(controller.society.view().activeDialogue,false);
  assert.deepEqual(controller.save(),saved);
  const fresh=createAcademicBouncers(saved);
  assert.deepEqual(fresh.society.save(),saved.social);
  assert.equal(fresh.view().knowsPhrase,true);assert.equal(fresh.view().admitted,false);
});

test('unknown phrase is neither exposed nor accepted by a forged choice id',()=>{
  const controller=createAcademicBouncers();gap(controller);
  assert.equal(controller.view().attempt.options.some(option=>option.text===PHRASE),false);
  assert.equal(controller.interject('guests'),false);assert.equal(controller.view().attempt.phase,'window');
});

test('the same learned phrase fails early and late, with explicit recoverable feedback',()=>{
  for(const reason of ['early','late']){
    const controller=createAcademicBouncers();learn(controller);
    if(reason==='early')controller.beginAttempt();else{gap(controller);steps(controller,4);}
    assert.equal(controller.interject('guests').reason,reason);
    assert.equal(controller.view().attempt.currentLine.who,'me');
    assert.equal(controller.view().attempt.currentLine.text,PHRASE);
    terminal(controller);assert.equal(controller.acknowledge(),false);assert.equal(controller.save().admitted,false);
    assert.ok(controller.beginAttempt(),'failure spends no retry or admission');
  }
});

test('a wrong phrase inside the turn fails without an inventory reward or penalty',()=>{
  const controller=createAcademicBouncers();learn(controller);gap(controller);
  assert.deepEqual(controller.interject('invitation').reason,'phrase');terminal(controller);
  assert.equal(controller.acknowledge(),false);assert.equal(controller.view().attempt,null);
  assert.equal(controller.view().knowsPhrase,true);assert.equal(controller.save().admitted,false);
});

test('right words at the gap remain pending through player speech and both guard responses',()=>{
  const controller=createAcademicBouncers();learn(controller);gap(controller);
  assert.equal(controller.view().attempt.remaining,4);assert.equal(controller.interject('guests').accepted,true);
  assert.equal(controller.view().attempt.phase,'player');assert.equal(controller.acknowledge(),false);
  assert.equal(controller.save().admitted,false);controller.finishLine();
  assert.equal(controller.view().attempt.phase,'response');assert.equal(controller.view().attempt.currentLine.text,'Then we are late.');
  assert.equal(controller.acknowledge(),false);terminal(controller);assert.equal(controller.view().attempt.phase,'terminal');
  assert.equal(controller.save().admitted,false);assert.equal(controller.acknowledge(),true);
  assert.equal(controller.save().admitted,true);assert.equal(controller.beginAttempt(),null);
});

test('cancelling or saving/reloading after the correct interruption never grants admission',()=>{
  for(const completeResponses of [false,true]){
    const controller=createAcademicBouncers();learn(controller);gap(controller);controller.interject('guests');
    if(completeResponses)terminal(controller);
    const saved=controller.save();assert.equal(saved.admitted,false);assert.equal(saved.attempt,undefined);
    controller.cancelAttempt();assert.equal(controller.view().attempt,null);assert.equal(controller.acknowledge(),false);
    controller.load(saved);assert.equal(controller.view().attempt,null);assert.equal(controller.save().admitted,false);
    assert.equal(controller.view().timeSec,0);assert.ok(controller.beginAttempt());
  }
});

test('gap is four active seconds and freezes for pause/hidden/focus/suspension',()=>{
  for(const context of [{paused:true},{hidden:true},{focused:false},{suspended:true}]){
    const controller=createAcademicBouncers();learn(controller);gap(controller);steps(controller,1);
    const before=controller.view();steps(controller,60,context);assert.deepEqual(controller.view(),before);
    steps(controller,2.9);assert.equal(controller.view().attempt.phase,'window');
    steps(controller,.1);assert.equal(controller.view().attempt.phase,'closing');
  }
});

test('guards walk actual clear polyline at one metre per active second, then load fully aside',()=>{
  const controller=createAcademicBouncers();learn(controller);gap(controller);controller.interject('guests');terminal(controller);controller.acknowledge();
  assert.ok(controller.actorFrame().every(actor=>actor.mode==='walk'&&actor.speed===1));
  steps(controller,1);const one=controller.actorFrame();
  assert.equal(one[0].x,11.5);assert.equal(one[0].y,277.5);assert.ok(Math.abs(one[0].distance-1)<1e-8);
  assert.equal(one[1].x,11.5);assert.equal(one[1].y,278.5);
  const frozen=controller.actorFrame();steps(controller,10,{suspended:true});assert.deepEqual(controller.actorFrame(),frozen);
  steps(controller,3.2);const turn=controller.actorFrame();assert.equal(turn[0].x,8.5);assert.ok(Math.abs(turn[0].y-277.3)<1e-8);
  assert.equal(turn[1].mode,'idle');assert.equal(turn[1].speed,0);
  const loaded=createAcademicBouncers(controller.save());
  assert.equal(loaded.view().asideProgress,1);assert.equal(loaded.view().attempt,null);
  const final=loaded.actorFrame();assert.deepEqual(final.map(({x,y})=>({x,y})),[{x:8.5,y:277},{x:10.5,y:278.5}]);
  assert.ok(final.every(actor=>actor.mode==='idle'&&actor.speed===0));
  assert.deepEqual(controller.actorFrame(),controller.actorFrame(),'reading a pose does not advance the path');
});

test('actual speaking metadata maps guard cues and preserves authoritative freeze clock',()=>{
  const controller=createAcademicBouncers();controller.beginAttempt();controller.tick(.1);
  const frame=controller.actorFrame({voiceActorId:ACTORS[0].id,speakingActorId:ACTORS[0].id,timeSec:12,reducedMotion:true});
  assert.equal(frame[0].performance.role,'speaker');assert.equal(frame[0].performance.cue,'object');assert.equal(frame[0].speaking,true);
  assert.equal(frame[1].performance.role,'listener');assert.equal(frame[1].speaking,false);assert.equal(frame[0].phase,12);
  assert.ok(frame.every(actor=>Number.isFinite(actor.x)&&Number.isFinite(actor.y)));
});

test('scene waits for actual cue voice completion; finishing cue with Space opens the entire gap',()=>{
  const fixture=sceneFixture();const {scene,voice,controller,press}=fixture;
  assert.equal(scene.id,'academic-bouncers');assert.equal(scene.allowsLook,true);assert.equal(scene.blocksInput,true);assert.equal(scene.blocksWorld,true);
  for(let index=0;index<3;index++){voice.voices.at(-1).finished=true;scene.update(.1);}
  assert.equal(scene.view().currentLine.text,CUE);assert.equal(scene.view().phase,'exchange');
  for(let index=0;index<50;index++)scene.update(.1);
  assert.equal(scene.view().phase,'exchange','an unfinished actual voice cannot be replaced by a duration estimate');
  press(' ');assert.equal(scene.view().phase,'window');assert.equal(scene.view().remaining,4);
  press(' ');assert.equal(scene.view().phase,'window');assert.equal(scene.view().remaining,4);
  assert.equal(controller.save().admitted,false);
});

test('held/repeated Space cannot skip several voices and never consumes the gap',()=>{
  const {scene}=sceneFixture();scene.key({key:' '});const key=scene.view().lineKey;
  scene.key({key:' '});scene.key({key:' ',repeat:true});assert.equal(scene.view().lineKey,key);
  scene.keyup({key:' '});scene.key({key:' '});assert.notEqual(scene.view().lineKey,key);
});

test('external suspension stops sound immediately and resumes the same complete utterance',()=>{
  const {scene,voice}=sceneFixture();const first=voice.voices[0];
  scene.setSuspended(true);assert.equal(scene.view().suspended,true);assert.equal(scene.view().voice,false);assert.ok(voice.stops>0);
  first.finished=true;scene.update(60);assert.equal(scene.view().currentLine.text,first.text);
  scene.setSuspended(false);assert.equal(voice.voices.length,2);assert.equal(voice.voices[1].text,first.text);
  assert.equal(scene.view().voice,true);assert.equal(scene.view().phase,'exchange');
});

test('native-focus predicate suspends input and replays current line without moving the window',()=>{
  let active=true;const {scene,voice,press}=sceneFixture({isActive:()=>active});
  active=false;scene.update(.1);assert.equal(scene.view().voice,false);press('1');assert.equal(scene.view().phase,'exchange');
  active=true;scene.update(.1);assert.equal(voice.voices.length,2);assert.equal(scene.view().phase,'exchange');
});

test('player actually speaks the chosen words; successful terminal needs a fresh acknowledgment',()=>{
  const controller=createAcademicBouncers();learn(controller);const fixture=sceneFixture({controller});
  const {scene,voice,press}=fixture;
  for(let index=0;index<4;index++)press(' ');
  press('3');assert.equal(scene.view().phase,'player');assert.equal(voice.voices.at(-1).text,PHRASE);assert.equal(voice.voices.at(-1).opts.speaker,'me');
  assert.equal(controller.save().admitted,false);
  for(let index=0;index<3;index++)press(' ');
  assert.equal(scene.view().phase,'terminal');assert.equal(fixture.done,0);assert.equal(controller.save().admitted,false);
  press('Enter');assert.equal(fixture.done,1);assert.equal(fixture.cancelled,0);assert.equal(controller.save().admitted,true);assert.equal(scenes.depth(),0);
  scene.exit();assert.equal(fixture.done,1);assert.equal(fixture.cancelled,0);
});

test('Escape, external removal and replacement cancel pending successful attempts exactly once',()=>{
  for(const close of ['escape','remove','replace']){
    const controller=createAcademicBouncers();learn(controller);const fixture=sceneFixture({controller});
    for(let index=0;index<4;index++)fixture.press(' ');fixture.press('3');
    if(close==='escape')fixture.press('Escape');else if(close==='remove')scenes.remove(fixture.scene);else scenes.replace({id:'other'});
    fixture.scene.exit();assert.equal(fixture.done,0);assert.equal(fixture.cancelled,1);assert.equal(controller.save().admitted,false);
    assert.equal(controller.view().attempt,null);scenes.clear();
  }
});

test('failure acknowledgment calls cancel and permits a fresh E encounter',()=>{
  const fixture=sceneFixture();fixture.press('1');for(let index=0;index<3;index++)fixture.press(' ');
  assert.equal(fixture.scene.view().phase,'terminal');fixture.press('Enter');assert.equal(fixture.cancelled,1);assert.equal(fixture.done,0);
  assert.equal(fixture.controller.save().admitted,false);assert.ok(fixture.controller.beginAttempt());
});

test('measured bottom monitor keeps current captions and every choice below doorkeeper faces',()=>{
  const snapshots=[];
  for(const known of [false,true]){
    for(const outcome of ['early','late','phrase',...(known?['success']:[])]){
      const controller=createAcademicBouncers();if(known)learn(controller);controller.beginAttempt();
      const capture=()=>snapshots.push({...controller.view(),selected:0});
      capture();
      if(outcome!=='early'){
        while(controller.view().attempt.currentLine){controller.finishLine();capture();}
        if(outcome==='late'){
          steps(controller,4);capture();
          controller.finishLine();capture();
        }
      }
      controller.interject(outcome==='success'?'guests':'invitation');capture();
      while(controller.view().attempt.currentLine){controller.finishLine();capture();}
    }
  }
  for(const current of snapshots){
    for(const rows of [38,40]){
      const layout=academicBouncerPanelLayout(current,{cols:96,rows});
      assert.equal(layout.width,86);assert.equal(layout.chromeRows,6);
      assert.ok(layout.fits,`all ${current.attempt.phase} text fits its measured glass`);
      assert.equal(layout.bottomSafetyRows,1);
      assert.ok(layout.body.h-layout.content.length>=1,'last choice glyph clears the lower hardware rim by a full unused row');
      assert.ok(layout.height<=14,`no tall empty panel in ${current.attempt.phase}`);
      assert.ok(layout.y>=Math.ceil(rows*.6),'panel stays within the bottom40% of the native grid');
      assert.ok(layout.y+layout.height<rows,'bottom margin remains in the viewport');
      if(current.attempt.phase!=='terminal'){
        const paintedChoices=new Set(layout.content.filter(row=>row.choiceId).map(row=>row.choiceId));
        assert.deepEqual([...paintedChoices],current.attempt.options.map(option=>option.id));
        assert.equal(paintedChoices.size,current.knowsPhrase?3:2);
      }else{
        assert.equal(layout.content[0].text,current.attempt.outcome==='success'?'Vera and Hugh wait for you to pass.':'Neither attendant has moved.');
        assert.equal(layout.footer,current.attempt.outcome==='success'?'[ENTER] PASS THEM · [ESC] STEP BACK':'[ENTER] STEP BACK · [ESC] LEAVE');
        assert.doesNotMatch(layout.content.map(row=>row.text).join(' '),/accept admission|continue/i);
      }
      const line=current.attempt.currentLine;
      if(line){
        const rendered=layout.content.filter(row=>!row.choiceId).map(row=>row.text).join(' ');
        assert.ok(rendered.includes(line.text),'the complete actual caption remains visible');
      }
    }
  }
  assert.ok(snapshots.some(current=>current.attempt.phase==='window'));
  assert.ok(snapshots.some(current=>current.attempt.phase==='terminal'));
});
