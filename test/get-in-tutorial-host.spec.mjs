import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as REC from '../src/game/recordist.js';
import {GET_IN_TUTORIAL_REQUESTED,makeGetInTutorialScene,getInTutorialFinished} from '../src/game/get-in-tutorial-scene.js';
import {SETUP_HANDOFF,beginSetupHandoff,beginSetupSkillsHandoff,advanceSetupHandoff,setupHandoffStage,setupCanLeave,recoverSetupHandoff} from '../src/game/setup-handoff.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function production(name){const start=main.indexOf(`function ${name}(`),end=main.indexOf('\n}',start)+2;assert.ok(start>=0&&end>start,name);return main.slice(start,end);}
function stack(){const rows=[];return{rows,push:s=>rows.push(s),top:()=>rows.at(-1),blocksInput:()=>rows.some(s=>s.blocksInput),blocksWorld:()=>rows.some(s=>s.blocksWorld),remove(s){const i=rows.indexOf(s);if(i<0)return false;rows.splice(i,1);s.exit?.();return true;}};}
function idleRecorder(){if(REC.isRecording())REC.stopRecording();if(REC.isListening())REC.stopListening();REC.recState().takes=[];REC.recState().noise=0;REC.configureDifficulty({minorNoise:'spoil',pauseSeconds:0,recordingNoiseScale:1});}

test('a protected real calibration survives voice, footsteps, direct spoil and pause without awarding a room',()=>{
  idleRecorder();REC.startListening({keepLight:true});REC.startRecording({keepLight:true,protectedSourceId:'setup-calibration'});
  let active=true,ready=0;
  const scene=makeGetInTutorialScene({isActive:()=>active,
    getReading:()=>({recording:REC.isRecording(),spoiled:REC.recState().spoiled,takeElapsed:REC.recState().takeElapsed}),
    advanceRecording:dt=>REC.tickRecording(dt),onCalibrated:()=>ready++});
  assert.equal(scene.blocksWorld,true);assert.equal(scene.key({key:'r'}),true);assert.equal(scene.key({key:'Escape'}),false);
  REC.emitNoise(1,0,0,'voice',{sourceKind:'player',sourceId:'room-mic',playerGenerated:true});
  REC.emitStepNoise(0,0);REC.spoilTake('you moved',{sourceId:'player'});
  for(let n=0;n<12;n++)scene.update(.25);
  assert.equal(REC.recState().spoiled,false);assert.equal(REC.recState().takeElapsed,3);
  active=false;scene.update(10);assert.equal(REC.recState().takeElapsed,3);
  active=true;for(let n=0;n<12;n++)scene.update(.25);
  assert.equal(ready,1);assert.deepEqual(REC.recState().takes,[]);
  scene.exit();idleRecorder();
});

test('an interrupted transport retries a fresh real six seconds rather than completing or stranding the lesson',()=>{
  let reading={recording:true,spoiled:true,takeElapsed:4},retries=0,ready=0;
  const scene=makeGetInTutorialScene({getReading:()=>reading,advanceRecording:dt=>{if(!reading.spoiled)reading.takeElapsed+=dt;},
    onInterrupted:()=>{retries++;reading={recording:true,spoiled:false,takeElapsed:0};},onCalibrated:()=>ready++});
  scene.update(.1);assert.equal(retries,1);assert.equal(ready,0);
  for(let n=0;n<23;n++)scene.update(.25);assert.equal(ready,0);
  scene.update(.25);assert.equal(ready,1);scene.update(.25);assert.equal(ready,1);scene.exit();
});

test('external removal and a changed run release ownership once and retire every callback',()=>{
  for(const kind of ['exit','run-change']){
    let run='a',releases=0,advances=0;
    const scene=makeGetInTutorialScene({runId:'a',getRunId:()=>run,
      getReading:()=>({recording:true,takeElapsed:1}),advanceRecording:()=>advances++,onRelease:()=>releases++});
    if(kind==='exit')scene.exit();else{run='b';scene.update(.25);}
    scene.exit();scene.update(100);
    assert.equal(releases,1);assert.equal(advances,0);
  }
});

function host(initial={}){
  let flags={'bag.taken':true,...initial};const scenes=stack(),calls={dreams:0,cases:0,starts:0};
  const ctx={storyMode:true,usingPlan:()=>true,usingSpecialSpace:()=>false,usingSourceSpace:()=>false,FP:{zoneAt:()=>7},ZONE:{getIn:7},px:0,py:0,
    getSave:()=>({flags,run:{id:'run-a'}}),flagTest:id=>!!flags[id],flagSet:id=>{flags[id]=true;},flagApply:ids=>ids.forEach(id=>{flags[id]=true;}),saveCommit:patch=>{if(patch.flags)flags=patch.flags;},
    GET_IN_TUTORIAL_REQUESTED,getInTutorialFinished,makeGetInTutorialScene,SETUP_HANDOFF,beginSetupHandoff,beginSetupSkillsHandoff,
    scenes,REC,PB:{isPlaying:()=>false,advanceTape(){}},TUT:{tutorialActive:()=>true,startTutorial:()=>calls.starts++,skipTutorial(){}},
    getInTutorialOwner:null,combatRehearsalOwner:null,deferredCombatRequest:null,godBattleOpen:false,daydreamRunning:false,dreamFigure:null,
    document:{hidden:false},paused:false,gameplayInputLifecycleActive:()=>true,resetMotionInput(){},micCheck:null,micCheckCompletion:null,takeRoom:'loading_dock',LEVEL_CHECK_ROOM:'loading_dock',
    onLevelsSet(){flags['setup.levels']=true;if(REC.isRecording())REC.stopRecording();ctx.finishSetupCalibration();},
    stopTake(){if(REC.isRecording())REC.stopRecording();},beginTakeNow(){},beginDaydream:()=>calls.dreams++,tickDreamFigure(){},
    finishSetupRehearsal(){flags=beginSetupSkillsHandoff(flags);calls.cases++;},holdForSetupBag:()=>calls.cases++,
    openEncounterBattle:()=>assert.fail('the setup continuation cannot start a real encounter'),OBJ:{targetRoom:()=>null},fireCue(){},performance:{now:()=>1000},
  };
  runInNewContext(['beginGetInRecorderTutorial','ensureCombatRehearsal','finishCombatRehearsal','finishSetupCalibration'].map(production).join('\n'),ctx);
  return{ctx,calls,scenes,flags:()=>flags,setFlags:value=>{flags=value;},advance:(event,context={})=>{flags=advanceSetupHandoff(flags,event,context);}};
}

test('the first Get In recorder press owns setup → existing dream → earned Skills → Map → restored agency',()=>{
  idleRecorder();const h=host();assert.equal(h.ctx.beginGetInRecorderTutorial(),false,'the same press continues to the recorder guide');
  const owner=h.ctx.getInTutorialOwner;
  assert.equal(h.flags()[GET_IN_TUTORIAL_REQUESTED],true);assert.equal(h.scenes.blocksWorld(),true);assert.equal(h.calls.dreams,0);
  REC.startListening();REC.startRecording({protectedSourceId:'setup-calibration'});
  for(let n=0;n<24;n++)owner.update(.25);
  assert.equal(h.flags()['setup.levels'],true);assert.equal(h.calls.dreams,1);assert.equal(REC.isRecording(),false);
  assert.equal(h.scenes.top().id,'combat-rehearsal');assert.equal(setupCanLeave(h.flags()),false);
  // The unchanged imagined fight earns this receipt; no capture or take can.
  h.setFlags(beginSetupSkillsHandoff({...h.flags(),'combat.trained':true}));
  h.advance({type:'bag-opened'});h.advance({type:'section-selected',sectionId:'skills'});
  h.advance({type:'continue'},{workingBuild:{pinsEarned:0}});h.advance({type:'close'});
  assert.equal(h.ctx.finishCombatRehearsal(),true);assert.equal(h.flags()[SETUP_HANDOFF.mode],'recording');
  assert.equal(getInTutorialFinished(h.flags()),false,'Skills does not stand in for the unvisited map');
  h.advance({type:'bag-opened'});h.advance({type:'section-selected',sectionId:'map'});
  h.setFlags({...h.flags(),'setup.waypoint':true});h.advance({type:'close'},{markedRoom:'main_b3'});
  assert.equal(setupHandoffStage(h.flags(),{markedRoom:'main_b3'}),'follow');
  owner.update(.01);assert.equal(h.ctx.getInTutorialOwner,null);assert.equal(h.scenes.rows.length,0);
  assert.equal(setupCanLeave(h.flags()),true);assert.deepEqual(REC.recState().takes,[]);idleRecorder();
});

test('reload after the spared-figure receipt resumes missing Skills without replaying or bypassing the fight',()=>{
  idleRecorder();const flags={[GET_IN_TUTORIAL_REQUESTED]:true,'setup.levels':true,'combat.trained':true,'bag.taken':true};
  const recovered=recoverSetupHandoff(flags,{atGetIn:true});assert.equal(recovered[SETUP_HANDOFF.mode],'skills');
  const h=host(recovered);assert.equal(h.ctx.beginGetInRecorderTutorial(),true);
  assert.equal(h.calls.dreams,0);assert.equal(h.flags()[SETUP_HANDOFF.mode],'skills');
  assert.equal(h.scenes.top().id,'combat-rehearsal');assert.equal(setupCanLeave(h.flags()),false);
  h.scenes.remove(h.ctx.combatRehearsalOwner);h.scenes.remove(h.ctx.getInTutorialOwner);idleRecorder();
});

test('removing a live owner clears the actual host reference so a later press gets a new lease',()=>{
  idleRecorder();const h=host();h.ctx.beginGetInRecorderTutorial();const first=h.ctx.getInTutorialOwner;
  h.scenes.remove(first);assert.equal(h.ctx.getInTutorialOwner,null);
  h.ctx.beginGetInRecorderTutorial();assert.notEqual(h.ctx.getInTutorialOwner,first);assert.equal(h.scenes.blocksWorld(),true);
  h.scenes.remove(h.ctx.getInTutorialOwner);
});

test('microphone handoff runs on active frame time and cannot leak into a different run',()=>{
  for(const changedRun of [false,true]){
    let run='a',done=0;
    const ctx={micCheck:{onDone:()=>done++},micCheckCompletion:null,SPEECH:{say(){}},getSave:()=>({run:{id:run}}),storyMode:true,
      paused:false,document:{hidden:false},gameplayInputLifecycleActive:()=>true};
    runInNewContext([production('finishMicTest'),production('tickMicTest')].join('\n'),ctx);
    ctx.finishMicTest(null);ctx.paused=true;ctx.tickMicTest(10);assert.equal(done,0);
    ctx.paused=false;if(changedRun)run='b';ctx.tickMicTest(.6);assert.equal(done,changedRun?0:1);assert.equal(ctx.micCheckCompletion,null);
  }
});
