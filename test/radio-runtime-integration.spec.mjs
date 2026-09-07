import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

globalThis.document ||= {title:'Chunk Surfer',baseURI:'http://localhost/'};
globalThis.window ||= globalThis;
const radio = await import('../src/game/radio.js');
const main = readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function source(name) {
  const start=main.indexOf(`function ${name}(`);
  assert.ok(start>=0,`${name} exists`);
  const end=main.indexOf('\n}',start);
  assert.ok(end>start,`${name} closes at top level`);
  return main.slice(start,end+2);
}
const compile=(name,context)=>runInNewContext(`(${source(name)})`,context);
const target={roomId:'amplifications',floorId:'ground',reachable:true,unfinished:true,distanceMeters:4};
const ready=()=>({isTraversal:true,sceneId:'explore',floorId:'ground',completedJobTakes:2,target:{...target}});
function walk(seconds,context=ready()) { for(let i=0;i<seconds*4;i++)radio.updateRadioProgression(.25,context); }
function heard(id) {
  radio.queueRadioCue(id);
  assert.equal(radio.consumeRadioCue(ready())?.id,id);
  radio.resolveRadioCue(id);
  walk(20);
}
function harness() {
  radio.resetRadioState();
  const flags=new Set(['bag.taken','setup.levels']);
  const log={panels:[],noise:[],events:[],saves:[],spoken:[],takes:['main_b3','the_tub'],sceneOpen:false,now:1000};
  const context={
    RADIO:radio,storyMode:true,NO_THINK:false,inRogue:true,paused:false,
    activeBattleId:null,daydreamRunning:false,activeEndingCutscene:null,
    workOrderRead:false,px:0,py:0,performance:{now:()=>log.now},
    radioTargetCache:{key:'',until:0,target:null},
    usingSpecialSpace:()=>false,
    scenes:{top:()=>null,blocksInput:()=>false},
    REC:{isRecording:()=>false,isListening:()=>false,recState:()=>({takes:log.takes}),
      hasTake:id=>log.takes.includes(id),emitNoise:(...args)=>{
        assert.equal(log.sceneOpen,false,'world noise must be deferred until after the scene exits');
        log.noise.push(args);
      }},
    SPEECH:{isSpeaking:()=>false,say:line=>log.spoken.push(line)},
    TARGETS:['main_b3','the_tub','amplifications','soundnoisemusic','lux_nova'],
    flagTest:id=>flags.has(id),flagApply:ids=>ids.forEach(id=>flags.add(id)),
    itemLost:()=>false,setupComplete:()=>true,
    markThought:id=>flags.add(id),saveThoughtState:()=>({}),
    saveCommit:value=>log.saves.push(value),
    acousticFloorIdAt:()=> 'ground',nearestUnrecordedRecordingTarget:()=>({...target}),
    radioHushCurrentlySensed:()=>false,
    radioGuidanceDialogue:()=>({request:{choices:[{goto:'directions'},{goto:'help'},{goto:'lower'}]}}),
    radioDialogue:()=>({start:{lines:[{text:'Martin.'}]}}),
    radioOpeningGuidanceTarget:()=>({id:'story:main-b3'}),
    radioGuidanceContextFor:()=>({}),
    OBJ:{targetRoom:()=>null},getSave:()=>({run:{id:'test-radio'}}),
    roomLabel:id=>id, syncDroppedRadioProp:()=>{},stopTake:()=>{},
    EVENT_TYPES:{RADIO_CUE_STARTED:'started',RADIO_CUE_RESOLVED:'resolved',RADIO_CUE_MISSED:'missed',RADIO_DEAD:'dead'},
    emitRadioCue:(...args)=>log.events.push(args),emitProgress:(...args)=>log.events.push(args),
    RADIO_DEAD:{start:{lines:[{text:'Dead carrier.'}]}},
    presentRadio:(id,nodes,options)=>{
      log.sceneOpen=true;
      const panel={id,nodes,options};log.panels.push(panel);return panel;
    },
  };
  for(const name of ['completedRecordingTakes','radioRuntimeContext','radioCueBlocked','emitManualRadioCallNoise','maybeStartPendingRadioCue','queueRadioStoryCue','maybeQueueRadioProgressionCue','openRadioCallFromBag','openRadio','onRadioCueMissed']) {
    context[name]=compile(name,context);
  }
  return {context,log,flags};
}

test('the dedicated radio entry opens authored radio controls, not the Bag monitor shell',()=>{
  const {context,log}=harness();
  assert.equal(context.openRadio(),true);
  assert.equal(log.panels[0].id,'request');
  assert.equal(log.panels[0].options.startAt,'request');
  assert.equal(log.noise.length,0);
  assert.equal(radio.radioGuidanceState().dangerCallCount,0);
  assert.doesNotMatch(source('openRadio'),/openBag|makeBag|converse\(/);
  assert.match(main,/BINDINGS\.isRadioControlEvent\(e\)[^\n]*openRadio\(\)/);
  assert.match(source('presentRadio'),/makeRadioScene\(/);
});

test('the manual call cannot bypass the same global scene firewall as incoming cues',()=>{
  for(const change of [
    {paused:true},{daydreamRunning:true},{activeBattleId:'training'},
    {activeEndingCutscene:{}},{inRogue:false},{storyMode:false},
    {usingSpecialSpace:()=>true},{scenes:{top:()=>({id:'setup-runtime'}),blocksInput:()=>false}},
    {scenes:{top:()=>({id:'dialogue:other'}),blocksInput:()=>true}},
    {REC:{isRecording:()=>true}},{REC:{isListening:()=>true}},
  ]) {
    const {context,log}=harness();
    for(const [key,value] of Object.entries(change))context[key]=typeof value==='object'?{...context[key],...value}:value;
    assert.equal(context.openRadioCallFromBag({intent:'help'}),false,Object.keys(change).join(','));
    assert.equal(log.panels.length,0);
    assert.equal(radio.radioGuidanceState().dangerCallCount,0);
  }
});

test('the runtime counts unique work-order jobs, not setup, fake IDs, chapel, or duplicated takes',()=>{
  const {context,log}=harness();
  log.takes=['level-check','anything','main_b3','main_b3',null,'lux_nova'];
  assert.equal(context.completedRecordingTakes(),1);
  log.takes.push('the_tub');
  assert.equal(context.radioRuntimeContext().completedJobTakes,2);
});

test('terminal approach finds a real reachable same-floor unfinished room, never just overlapping plan coordinates',()=>{
  const {context,log}=harness();
  heard(radio.RADIO_CUES.INITIAL);heard(radio.RADIO_CUES.POST_SECOND);
  context.ROOM_CELLS={amplifications:{x:1,y:0},soundnoisemusic:{x:4,y:0},lux_nova:{x:0,y:0}};
  context.FP={toRuntimePoint:at=>at,toAuthoredCoord:n=>n};
  let wrongFloor=true,reachable=true;
  context.radioMapRouteFrame=id=>({player:{floorId:'ground'},target:{floorId:id==='amplifications'&&wrongFloor?'basement':'ground'},route:{status:reachable?'ok':'blocked'}});
  const nearest=compile('nearestUnrecordedRecordingTarget',context);
  assert.equal(nearest()?.roomId,'soundnoisemusic');
  assert.equal(nearest()?.reachable,true);
  wrongFloor=false;log.now+=251;
  assert.equal(nearest()?.roomId,'amplifications');
  log.takes.push('amplifications');
  assert.equal(nearest()?.roomId,'soundnoisemusic');
  reachable=false;log.now+=251;
  assert.equal(nearest(),null);
  context.usingSpecialSpace=()=>true;
  assert.equal(nearest(),null);
});

test('the short target cache invalidates player-cell and take identity changes before its timeout',()=>{
  const {context,log}=harness();
  heard(radio.RADIO_CUES.INITIAL);heard(radio.RADIO_CUES.POST_SECOND);
  context.ROOM_CELLS={amplifications:{x:1,y:0},soundnoisemusic:{x:4,y:0}};
  context.FP={toRuntimePoint:at=>at,toAuthoredCoord:n=>n};
  let queries=0,reachable=true;
  context.radioMapRouteFrame=()=>{
    queries++;
    return {player:{floorId:'ground'},target:{floorId:'ground'},route:{status:reachable?'ok':'blocked'}};
  };
  const nearest=compile('nearestUnrecordedRecordingTarget',context);
  assert.equal(nearest()?.roomId,'amplifications');
  const initialQueries=queries;
  context.px=.25;nearest();nearest();
  assert.equal(queries,initialQueries,'same logical cell shares one short-lived route query');
  context.px=1.1;
  assert.equal(nearest()?.roomId,'amplifications');
  assert.ok(queries>initialQueries,'crossing a player cell invalidates immediately');
  const movedQueries=queries;
  log.takes.push('amplifications');
  assert.equal(nearest()?.roomId,'soundnoisemusic');
  assert.ok(queries>movedQueries,'a newly completed job cannot remain the cached unfinished target');
  log.takes=['main_b3','the_tub','soundnoisemusic'];
  assert.equal(nearest()?.roomId,'amplifications','identity, not only the number of takes, invalidates the cache');
  reachable=false;log.now+=251;
  assert.equal(nearest(),null,'changed route topology is refreshed after the bounded cache lifetime');
});

test('the actual progression entry observes heard checkin and active time, with no post-take timer bypass',()=>{
  const {context,log}=harness();
  assert.equal(context.maybeQueueRadioProgressionCue(.25),true);
  assert.equal(log.panels[0]?.id,radio.RADIO_CUES.INITIAL,'legacy progress receives the missing real initial conversation, not a warning');
  log.sceneOpen=false;log.panels[0].options.onDone();log.panels=[];
  context.scenes.blocksInput=()=>true;
  for(let i=0;i<100;i++)context.maybeQueueRadioProgressionCue(.25);
  assert.equal(log.panels.length,0);
  context.scenes.blocksInput=()=>false;
  for(let i=0;i<79;i++)context.maybeQueueRadioProgressionCue(.25);
  assert.equal(log.panels.length,0);
  context.maybeQueueRadioProgressionCue(.25);
  assert.equal(log.panels[0]?.id,radio.RADIO_CUES.POST_SECOND);
  assert.doesNotMatch(main,/once\(['"]radio-post-second['"]/);
  assert.doesNotMatch(source('tickRecorder'),/setTimeout[\s\S]*POST_SECOND/);
});

test('unread dialogue cancellation and failed presentation cannot manufacture a cue outcome',()=>{
  for(const unavailable of [false,true]) {
    const {context,log}=harness();
    radio.queueRadioCue(radio.RADIO_CUES.INITIAL);
    if(unavailable)context.presentRadio=()=>null;
    assert.equal(context.maybeStartPendingRadioCue(),!unavailable);
    if(!unavailable){
      const options=log.panels[0].options;
      log.sceneOpen=false;options.onCancel();options.onDone();
    }
    assert.equal(radio.radioMilestones()[radio.RADIO_CUES.INITIAL],false);
    assert.equal(radio.pendingRadioCue()?.id,radio.RADIO_CUES.INITIAL);
    assert.equal(log.events.some(event=>event[0]==='resolved'),false);
    assert.equal(log.noise.length,0);
  }
});

test('a missed dropped terminal logs a miss, never a false radio-dead event',()=>{
  const {context,log}=harness();
  context.onRadioCueMissed({id:radio.RADIO_CUES.PRE_THIRD,roomId:'amplifications'});
  assert.equal(log.events.filter(event=>event[0]==='missed').length,1);
  assert.equal(log.events.filter(event=>event[0]==='dead').length,0);
});

test('the reseated terminal emits exactly one physical noise after exit, while the held contact stays silent',()=>{
  for(const choice of ['reseat','still']) {
    const {context,log,flags}=harness();
    radio.queueRadioCue(radio.RADIO_CUES.HUSH_RUPTURE,{reason:'manual-danger-repeat'});
    assert.equal(context.maybeStartPendingRadioCue(),true);
    const options=log.panels[0].options;
    assert.equal(options.terminal,true);
    options.onStage('break');
    assert.equal(log.noise.length,0);
    flags.add(choice==='reseat'?'radio.contact.reseated':'radio.contact.held');
    log.sceneOpen=false;options.onDone({choice});options.onDone({choice});
    assert.equal(radio.isDead(),true);
    assert.equal(log.events.filter(event=>event[0]==='resolved').length,1);
    assert.equal(log.noise.length,choice==='reseat'?1:0);
    if(choice==='reseat')assert.equal(log.noise[0][4].kind,'radio_contact');
  }
});

test('the broken carrier is inspected deliberately and never opens an automatic afterthought modal',()=>{
  const {context,log}=harness();
  radio.killRadio();
  assert.equal(context.openRadio(),true);
  assert.equal(log.panels[0].id,'dead-check');
  assert.equal(log.panels[0].options.dead,true);
  assert.doesNotMatch(source('tickRadio'),/think\(|presentRadio\(/);
  assert.match(source('tickRadio'),/maybeQueueRadioProgressionCue\(dt\)/);
});

test('radio mix leases restore the current player mix only after the final lease and respect pause',()=>{
  const levels=new Map(),leases=new Map();
  let settings={sfx:.8,music:.6};
  const context={radioMixLeases:leases,radioWorldGain:()=>leases.size?Math.min(...leases.values()):1,
    paused:false,getSave:()=>({settings}),sfxGain:'sfx',musicGain:'music',whisperBed:{output:'whispers'},
    setGainNode:(node,level)=>levels.set(node,level)};
  const mix=compile('setRadioSceneMix',context);
  mix('first',.2);mix('second',.1);
  assert.ok(Math.abs(levels.get('sfx')-.08)<1e-9);
  settings={sfx:.4,music:.25};
  mix('first');
  assert.ok(Math.abs(levels.get('sfx')-.04)<1e-9,'one released lease cannot unmute the remaining scene');
  mix('second');
  assert.equal(levels.get('sfx'),.4);
  assert.equal(levels.get('music'),.25);
  assert.equal(levels.get('whispers'),1);
  context.paused=true;
  mix('paused-scene',.1);mix('paused-scene');
  assert.deepEqual([...levels.values()],[0,0,0],'last scene exit cannot unmute a paused game');
  context.paused=false;mix('paused-scene');
  assert.deepEqual([...levels.values()],[.4,.25,1]);
});
