import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createAcademicSocietyPresentationClock} from '../src/game/academic-society-presentation.js';
import {createAcademicSociety} from '../src/game/academic-society.js';
import {academicSocietyCharacterInstances} from '../src/render/academic-society-characters.js';
import {STUDENT_STRIKE_CUES} from '../src/data/student-strike-film.js';

// Execute the actual main-host functions against the production clock and
// character/controller modules. No source-text assertion stands in for their
// behavior, and this fixture creates no browser, audio or GPU context.
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function production(name){
  const start=main.indexOf(`function ${name}(`);
  assert.ok(start>=0,`${name} exists`);
  const next=main.indexOf('\nfunction ',start+1);
  return main.slice(start,next<0?main.length:next);
}
function host(){
  const h={phase:'playing',elapsed:0,paused:false,blocked:true,onFloor:true,focused:true,nativeFocused:true,
    academicSocietyPresentation:createAcademicSocietyPresentationClock(),
    academicSocietyDialogueScene:null,academicBouncerSocialScene:null,STUDENT_STRIKE_CUES};
  h.document={hidden:false,hasFocus:()=>h.focused};
  h.pointerMode={status:()=>({nativeBackend:{focused:h.nativeFocused}})};
  h.inAcademicSociety=()=>h.onFloor;
  h.studentStrikeScene={id:'student-strike',view:()=>({phase:h.phase,elapsed:h.elapsed})};
  h.top=h.studentStrikeScene;
  h.scenes={blocksInput:()=>h.blocked,blocksWorld:()=>h.blocked,top:()=>h.top};
  vm.createContext(h);
  vm.runInContext([production('tickAcademicSocietyPresentation'),production('studentStrikeNarrationLine')].join('\n'),h);
  return h;
}
const time=h=>h.academicSocietyPresentation.view().timeSec;

test('the actual host grants the ordinary body clock only to the active returned strike view',()=>{
  const h=host();h.tickAcademicSocietyPresentation(.1);assert.equal(time(h),0,'historical actors have their own authored clock');
  h.phase='loading';h.tickAcademicSocietyPresentation(.1);assert.equal(time(h),0);
  h.phase='restoring';h.tickAcademicSocietyPresentation(.1);assert.equal(time(h),0);
  h.phase='returning';h.tickAcademicSocietyPresentation(.1);assert.equal(time(h),.1);
  h.tickAcademicSocietyPresentation(.1);assert.equal(time(h),.2,'Odette can breathe and speak during the returned closing line');
  h.top={id:'another-modal'};h.tickAcademicSocietyPresentation(.1);assert.equal(time(h),.2,'another modal does not inherit the acting lease');
  h.studentStrikeScene=null;h.top=null;h.blocked=false;h.tickAcademicSocietyPresentation(.1);
  assert.ok(Math.abs(time(h)-.3)<1e-12,'ordinary presentation resumes after the film owner leaves');
});

test('pause, covering overlays, hidden windows and focus loss freeze the returned acting clock',()=>{
  const h=host();h.phase='returning';h.tickAcademicSocietyPresentation(.1);
  const before=time(h);
  h.paused=true;h.tickAcademicSocietyPresentation(.1);assert.equal(time(h),before);h.paused=false;
  h.top={id:'pause'};h.tickAcademicSocietyPresentation(.1);assert.equal(time(h),before);h.top=h.studentStrikeScene;
  h.document.hidden=true;h.tickAcademicSocietyPresentation(.1);assert.equal(time(h),before);h.document.hidden=false;
  h.nativeFocused=false;h.tickAcademicSocietyPresentation(.1);assert.equal(time(h),before);
  h.nativeFocused=null;h.focused=false;h.tickAcademicSocietyPresentation(.1);assert.equal(time(h),before);
  h.focused=true;h.tickAcademicSocietyPresentation(.1);assert.ok(Math.abs(time(h)-.2)<1e-12);
});

test('the actual returned narration directs Odette to the operator and advances her native speaking pose',()=>{
  const h=host();h.phase='returning';h.elapsed=61;
  const line=h.studentStrikeNarrationLine();assert.equal(line.actorId,'odette');assert.equal(line.toPlayer,true);
  assert.equal(line.academicSociety,true);assert.equal(line.voiceSpeaker,'society-odette');
  const listener={x:18.6,y:276},society=createAcademicSociety();society.tick(0,{onAcademicFloor:true,listener});
  function pose(){
    h.tickAcademicSocietyPresentation(.1);
    const actors=society.actorFrame({listener,speakingActorId:'odette',voiceActorId:'odette',
      speakingLine:line,performanceTimeSec:time(h)}),odette=actors.find(a=>a.id==='odette');
    assert.equal(odette.gazeKey,'player');assert.deepEqual(odette.gazeAt,listener);
    assert.equal(odette.speaking,true);assert.equal(society.view().activeDialogue,null,'the finished dialogue is not secretly reopened');
    const body=academicSocietyCharacterInstances([odette],{timeSec:time(h)})[0];
    return Object.entries(body.character.joints).find(([name])=>name.endsWith('_jaw'))[1].rotation;
  }
  assert.notDeepEqual(pose(),pose(),'the returned voice is not accompanied by a frozen jaw sample');
  h.phase='loading';assert.equal(h.studentStrikeNarrationLine(),null);
  h.phase='restoring';assert.equal(h.studentStrikeNarrationLine(),null);
  h.phase='playing';h.elapsed=11;
  const student=h.studentStrikeNarrationLine();assert.ok(student.actorId.startsWith('strike-student-'));
  assert.equal(student.toPlayer,false,'historical peers continue addressing one another');
});
