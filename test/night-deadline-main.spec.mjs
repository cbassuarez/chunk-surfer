import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as D from '../src/game/night-deadline.js';
import {freshNightClock} from '../src/game/night-clock.js';
import {chunkSurfFinaleRouting,SOURCE_FINALE_ROUTE,SOURCE_FINALE_STAGE} from '../src/game/chunk-surf-state.js';
import {createFirstStrikeScene} from '../src/game/first-strike-scene.js';
import {normalizeFirstStrikeEntry} from '../src/data/first-strike.js';
import {packFirstStrikeConstruction,restoreFirstStrikeConstruction} from '../src/game/first-strike-entry.js';
import {createFirstStrikeAudio} from '../src/audio/first-strike.js';

const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function body(name){
  const match=new RegExp(`(?:async )?function ${name}\\(`).exec(source);assert.ok(match,`${name} exists`);
  const end=source.indexOf('\n}\n',match.index)+3;assert.ok(end>match.index);return source.slice(match.index,end);
}
function entry(){
  const walkCells=[];for(let x=0;x<15;x++)for(let z=0;z<5;z++)walkCells.push({x:x+.5,z:z+.5,floor:0,ceil:3.5,cellSize:1,walkable:true,flags:0});
  return normalizeFirstStrikeEntry({eventId:'night-deadline:main-test',region:'ellery',origin:{x:.5,y:0,z:2.5},yaw:Math.PI/2,pitch:0,
    walkCells,plan:{width:15,height:5},route:[{x:.5,z:2.5,floor:0},{x:12.5,z:2.5,floor:0}],safeEdge:{x:12.5,z:2.5,feet:0,radius:1.1},props:[]});
}
const copy=value=>JSON.parse(JSON.stringify(value));
function fixture(){
  const calls=[],save={run:{id:'main-test',status:'active'},flags:{'work-order.accepted':true},settings:{},nightClock:freshNightClock({elapsedSeconds:30180}),
    nightDeadline:D.freshNightDeadline({runId:'main-test'}),rec:{injuries:2,tapes:[]}};
  let recording=false,listening=false,playing=false,openTake=false,focused=true,top=null,speaking=false,endingResume=null;
  const audio={prepareWarnings:async()=>true,warning:(e,p)=>calls.push(['warning',copy(e),copy(p)]),
    updateWarnings:p=>calls.push(['warning-state',copy(p)]),ready:async()=>true,update:()=>{},stop:()=>calls.push(['audio-stop'])};
  const renderer={initialize:async()=>true,ready:()=>true,render:()=>{calls.push(['render']);return true;},dispose:()=>calls.push(['dispose'])};
  const h={console,performance:{now:()=>1000},structuredClone,Promise,Math,...D,chunkSurfFinaleRouting,SOURCE_FINALE_ROUTE,SOURCE_FINALE_STAGE,packFirstStrikeConstruction,restoreFirstStrikeConstruction,
    getSave:()=>save,saveCommit:patch=>{calls.push(['save',copy(patch)]);Object.assign(save,patch);return save;},
    REC:{isRecording:()=>recording,isListening:()=>listening,saveRecState:()=>copy(save.rec),lightOn:()=>true,batteryLevel:()=>1,
      toggleLight:()=>true,drainLight:()=>false},
    PB:{isPlaying:()=>playing,hasOpenTake:()=>openTake},SPEECH:{isSpeaking:()=>speaking,clearSpeech:()=>calls.push(['speech-stop'])},
    sourceDriveSession:null,sourceDriveStatus:null,sourceContinuationScene:null,sourcePubScene:null,openingVehicleScene:null,openingOvertureScene:null,getInDriveTeaserScene:null,
    sourceReturnFlashbackScene:null,coastalMemoryScene:null,standingTearScene:null,activeRecordingSlate:null,
    activeEndingCutscene:null,finaleActive:false,escape:false,activeBattleId:null,takenActive:false,
    endingSourceResume:()=>endingResume,usingSourceSpace:()=>false,outsideEllery:()=>false,
    px:17,py:19,paused:false,document:{hidden:false},gameplayInputLifecycleActive:()=>focused,
    R3:{r3dViewCamera:()=>({eye:{x:.5,y:1.62,z:2.5},yaw:Math.PI/2,pitch:0}),r3dSetNightWarningProps:p=>calls.push(['warning-props',p.length]),
      r3dCanvas:()=>({width:640,height:360})},
    scenes:{top:()=>top,clear:()=>{calls.push(['clear-scenes']);top=null;},push:scene=>{top=scene;scene.enter?.();},remove:scene=>{calls.push(['remove-scene']);scene.exit?.();top=null;}},
    firstStrikeScene:null,firstStrikeRenderer:null,firstStrikeStarting:false,firstStrikeAudio:audio,firstStrikeEntry:null,nightDeadlineTrace:[],nightStrikeRetryAt:0,nightStrikePreparationError:'',
    nightWarningEntry:null,nightWarningKey:'',nightWarningHeldFrame:null,nightWarningMeshReady:true,nightWarningLoading:null,nightWarningHornReady:true,nightWarningHornLoading:null,
    workOrderAccepted:flags=>flags['work-order.accepted']===true,shakeMode:()=> 'full',flashMode:()=> 'full',flagTest:()=>false,
    pushEvent:value=>calls.push(['notice',value]),prepareNightStrikeMeshes:()=>calls.push(['prepare-meshes']),
    firstStrikeWarningFrame:()=>({props:[]}),buildNightStrikeEntry:()=>entry(),createFirstStrikeRenderer:()=>renderer,
    createFirstStrikeAudio:()=>audio,sourcePresentationTorch:()=>({on:true,power:1}),createFirstStrikeScene,
    sourceContinuationAudio:null,sourcePubAudio:null,pubRoomAudio:null,pubPressureAudio:null,towerBellDirector:null,bellPealPerformance:null,
    STORY:{stopAll:()=>calls.push(['story-stop'])},RT:{setBed:()=>{}},CUES:{CUE:{light:'light'},playCue:()=>calls.push(['cue'])},
    captureExposureFrame:()=>{calls.push(['capture']);return{data:'data:image/webp;base64,AA=='};},
    commitNightFailure:()=>{calls.push(['file-failure']);save.run.status='failed-night';return{id:'return:main-test',endingId:'night-deadline',classification:'failed-night'};},
    showReturnReport:summary=>calls.push(['show-report',copy(summary)]),recordNightClockTravel:()=>{},itemLost:()=>false,actx:null,sfxGain:null,
  };
  for(const name of ['commitSourceContinuation','commitSourcePub','resetMotionInput','cancelLastExposure','cancelApparitionApplause',
    'cancelOutskirtDoorAnswer','stopSourceShoreAudio','stopSourceDockDoorAudio','stopSourceCorridorRain','stopOutskirtsStreetAudio',
    'pauseOutskirtsLastLight','stopAllVoices','stopWorldLayerVoice','silenceAmbientDrone','ensureInteractionFocus'])h[name]=()=>calls.push([name]);
  vm.createContext(h);
  const names=['nightDeadlineTransportProtected','nightDeadlineCommitted','persistNightRestLock','nightDeadlineSafeBoundary','nightDeadlineRegion','nightStrikeEntryPose',
    'deliverNightDeadlineWarnings','beginNightFirstStrike','tickNightDeadline'];
  vm.runInContext(names.map(body).join('\n'),h);
  return{h,save,calls,audio,renderer,record:value=>{recording=value;},listen:value=>{listening=value;},play:value=>{playing=value;},
    open:value=>{openTake=value;},focus:value=>{focused=value;},top:value=>{top=value;},speak:value=>{speaking=value;},
    ending:value=>{endingResume=value;},tick:extra=>h.tickNightDeadline({active:true,foregroundSeconds:1/60,...extra})};
}

test('the main deadline protects recording, listening, playback, open/decode interval and slate owners',()=>{
  const f=fixture();
  for(const [on,off] of [[()=>f.record(true),()=>f.record(false)],[()=>f.listen(true),()=>f.listen(false)],
    [()=>f.play(true),()=>f.play(false)],[()=>f.open(true),()=>f.open(false)]]){on();assert.equal(f.h.nightDeadlineTransportProtected(),true);off();}
  f.h.activeRecordingSlate={};assert.equal(f.h.nightDeadlineTransportProtected(),true);f.h.activeRecordingSlate=null;
  f.h.sourceDriveSession={status:()=>({recordingFinalizing:true})};assert.equal(f.h.nightDeadlineTransportProtected(),true);
});

test('real main new-transport entry points deny an expired night before cues, voice, microphone or deck mutation; admitted monitor may finish',()=>{
  const f=fixture();f.save.nightDeadline={...f.save.nightDeadline,phase:'pending'};let starts=0,finishes=0;
  f.h.REC.isMonitoring=()=>false;f.h.REC.startListening=()=>{starts++;return true;};f.h.PB.isPlaying=()=>false;
  f.h.PB.hasOpenTake=()=>false;vm.runInContext(['openListen','beginTakeNow','roll','playTakeFrom'].map(body).join('\n'),f.h);
  for(const [name,args] of [['openListen',['main_b3']],['beginTakeNow',[]],['roll',[]],['playTakeFrom',['main_b3']]])
    assert.equal(f.h[name](...args),false,name);
  assert.equal(starts,0);assert.equal(f.calls.some(c=>['cue','notice','clear-scenes'].includes(c[0])),false);
  f.h.REC.isMonitoring=()=>true;f.h.roll=()=>{finishes++;};f.h.beginTakeNow();assert.equal(finishes,1,'existing admitted monitor delegates to its completion owner');
});

test('main persists pending on a protected06:00 crossing without warning attacks, camera takeover, scene replacement or transport cues',()=>{
  for(const mode of ['record','listen','play','open']){
    const f=fixture();f[mode](true);f.tick();
    assert.equal(f.save.nightDeadline.phase,'pending',mode);assert.equal(f.calls.filter(c=>c[0]==='warning').length,0);
    assert.equal(f.calls.filter(c=>['clear-scenes','cue','cancelLastExposure'].includes(c[0])).length,0);
    assert.equal(f.calls.some(c=>c[0]==='warning-props'&&c[1]>0),false);
    const warningState=f.calls.find(c=>c[0]==='warning-state');assert.equal(warningState[1].protected,true);
    assert.equal(f.save.rec.injuries,2);assert.equal(f.h.firstStrikeScene,null);
  }
});

test('the saved pending boundary atomically includes current protected recorder/tape state rather than a stale last autosave',()=>{
  const f=fixture();f.record(true);const live={injuries:2,tapes:[{id:'take:7',roomId:'amplifications',status:'rolling',durationSeconds:19.25}],takeElapsed:19.25};
  f.h.REC.saveRecState=()=>copy(live);f.tick();
  const boundary=f.calls.find(c=>c[0]==='save'&&c[1].nightDeadline?.phase==='pending');assert.ok(boundary);
  assert.deepEqual(boundary[1].rec,live);assert.equal(f.calls.some(c=>c[0]==='clear-scenes'),false);
});

test('a real warning audio graph already sounding is stopped by the main protected-owner update with no new attack',async()=>{
  const f=fixture(),sources=[];
  const param=()=>({value:1,cancelScheduledValues(){}}),node=()=>({gain:param(),frequency:param(),positionX:param(),positionY:param(),positionZ:param(),
    connect(target){return target;},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;}});
  const ctx={currentTime:0,state:'running',createGain:node,createBiquadFilter:node,createPanner:node,
    createBufferSource:()=>{const n=node();sources.push(n);return n;},decodeAudioData:async()=>({numberOfChannels:1,duration:2.6})};
  // Keep the destination stable: a real audio owner has one persistent bus.
  const destination=node();f.h.firstStrikeAudio=createFirstStrikeAudio({getAudio:()=>({ctx,destination}),material:{ready:async()=>true,update(){},stop(){}},
    fetcher:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1600)}),urlFor:()=> 'memory-horn'});
  await f.h.firstStrikeAudio.prepareWarnings();
  assert.equal(f.h.firstStrikeAudio.warning({id:'already-playing',position:{x:3,y:2,z:4},age:0},{listener:{x:0,y:1.62,z:0}}),true);
  assert.equal(f.h.firstStrikeAudio.snapshot().horn.voices,1);f.record(true);f.tick();
  assert.equal(f.h.firstStrikeAudio.snapshot().horn.voices,0);assert.equal(sources.length,1);assert.equal(sources[0].stopped,true);
});

test('pending is saved before actual main presentation claim, then real scene/controller initializes from that supported entry',async()=>{
  const f=fixture();f.listen(true);f.tick();assert.equal(f.save.nightDeadline.phase,'pending');
  f.listen(false);assert.equal(await f.h.beginNightFirstStrike(),true);
  assert.equal(f.save.nightDeadline.phase,'presenting');assert.equal(f.h.firstStrikeScene.view().ready,true);
  const saves=f.calls.map((call,index)=>({call,index})).filter(v=>v.call[0]==='save');
  const pending=saves.find(v=>v.call[1].nightDeadline?.phase==='pending'),presenting=saves.find(v=>v.call[1].nightDeadline?.phase==='presenting');
  const firstClear=f.calls.findIndex(c=>c[0]==='clear-scenes');assert.ok(pending.index<presenting.index&&presenting.index<firstClear);
  assert.ok(f.save.nightDeadline.entryPose.construction.cells.length);assert.equal(f.save.nightDeadline.sceneCheckpoint.elapsed,0);
  f.h.firstStrikeScene.exit();
});

test('SourceIV/committed wrong-door finale wins before deadline; a current transfer/fall/contact only defers safe presentation',()=>{
  for(const mode of ['source-IV','ending-wrong-door-demolition']){
    const f=fixture();f.h.sourceContinuationScene={id:mode,view:()=>({ready:true})};f.tick();
    assert.equal(f.save.nightDeadline.phase,'superseded');assert.equal(f.h.firstStrikeScene,null);
  }
  const f=fixture();f.ending({stage:'source-IV'});assert.equal(f.h.nightDeadlineCommitted(),true);
  for(const owner of [{id:'source-earthfall',view:()=>({ready:true,frame:{fall:true}})},
    {id:'source-false-return',view:()=>({ready:true,aside:{chase:{phase:'contact'}}})},
    {id:'source-continuation',view:()=>({ready:false})}]){
    f.ending(null);f.h.sourceContinuationScene=owner;assert.equal(f.h.nightDeadlineSafeBoundary(),false);
  }
});

test('the actual predeadline irreversible Source rest lock durably preserves the chosen ending without skipping its remaining performance',()=>{
  const f=fixture(),checkpoint={phase:'catch',chartId:'catch',x:3,z:4,feet:0},writes=[];
  f.h.ENDING_ARRIVAL={RESTED:'rested'};f.h.ENDING_VARIANT={SOURCE_REST:'source-rest'};
  f.h.chunkSurfRuntime={setContinuationCheckpoint:value=>{writes.push(value);return true;},state:()=>({sourceContinuation:checkpoint})};
  const scene={id:'source-continuation',serialize:()=>checkpoint,view:()=>({ready:true}),sourceRest:{view:()=>({mode:'seated',locked:true,committed:false})}};
  f.h.sourceContinuationScene=scene;f.save.nightClock.elapsedSeconds=30119;
  assert.equal(f.h.persistNightRestLock(scene,{locked:false}),false);
  assert.equal(f.h.persistNightRestLock(scene,{locked:true,seatId:'catch-seat'}),true);
  assert.deepEqual(copy(f.save.endingCutscene),{schema:1,endingId:'contact-lost',arrival:'rested',variant:'source-rest',restLock:{runId:'main-test',seatId:'catch-seat'}});
  assert.deepEqual(writes,[checkpoint]);assert.equal(f.calls.some(c=>c[0]==='clear-scenes'),false);
  f.save.nightClock.elapsedSeconds=30180;f.tick();assert.equal(f.save.nightDeadline.phase,'superseded');
  assert.equal(f.h.persistNightRestLock(scene,{locked:true,seatId:'catch-seat'}),true);assert.equal(writes.length,1,'deduplicates the durable choice');
  assert.equal(f.h.firstStrikeScene,null);
});

test('a genuine same-interaction playback failure revokes only its provisional rest receipt and re-evaluates the unchanged deadline',()=>{
  const f=fixture();f.h.ENDING_ARRIVAL={RESTED:'rested'};f.h.ENDING_VARIANT={SOURCE_REST:'source-rest'};
  let locked=true;const scene={id:'source-continuation',view:()=>({ready:true}),sourceRest:{view:()=>({mode:'seated',locked,committed:false})}};
  f.h.sourceContinuationScene=scene;f.save.endingCutscene={schema:1,endingId:'contact-lost',arrival:'rested',variant:'source-rest',restLock:{runId:'main-test',seatId:'catch-seat'}};
  f.tick();assert.equal(f.save.nightDeadline.phase,'superseded');locked=false;f.tick();
  assert.equal(f.save.endingCutscene,null);assert.equal(f.save.nightDeadline.phase,'pending');assert.equal(f.save.nightClock.elapsedSeconds,30180);
  const g=fixture();g.h.sourceContinuationScene=scene;g.save.endingCutscene={schema:1,endingId:'contact-lost',arrival:'rested',variant:'source-rest'};
  g.h.persistNightRestLock(scene,{locked:false,mode:'idle'});assert.ok(g.save.endingCutscene,'final receipts cannot be revoked');
});

test('reversible/released rest, a stale scene and a new choice after deadline cannot manufacture saved ending immunity',()=>{
  const f=fixture();let writes=0;f.h.chunkSurfRuntime={setContinuationCheckpoint:()=>{writes++;return true;},state:()=>({})};
  f.h.ENDING_ARRIVAL={RESTED:'rested'};f.h.ENDING_VARIANT={SOURCE_REST:'source-rest'};
  const scene={id:'source-continuation',serialize:()=>({phase:'return'}),sourceRest:{view:()=>({mode:'seated'})},view:()=>({ready:true})};
  f.h.sourceContinuationScene=scene;
  assert.equal(f.h.persistNightRestLock(scene,{locked:false}),false);
  assert.equal(f.h.persistNightRestLock({}, {locked:true}),false);
  f.save.nightDeadline={...f.save.nightDeadline,phase:'pending'};
  assert.equal(f.h.persistNightRestLock(scene,{locked:true}),false);
  assert.equal(writes,0);assert.equal(f.save.endingCutscene,undefined);assert.equal(f.h.nightDeadlineCommitted(),false);
});

test('SourceII/III direct checkpoint fall/recovery/portal ownership defers takeover until the actual body is supported',()=>{
  const f=fixture();
  // This is SourceContinuationScene.view's real public shape: these fields
  // live directly on its snapshot, not inside a fictional frame wrapper.
  for(const field of ['fall','recovery','handoff','bodyTransit','cameraTransit','reveal']){
    f.h.sourceContinuationScene={id:'source-continuation',view:()=>({ready:true,[field]:{active:true}}),
      stillnessPose:()=>({ready:true,transitioning:true})};
    assert.equal(f.h.nightDeadlineSafeBoundary(),false,field);
  }
  f.h.sourceContinuationScene={id:'source-continuation',view:()=>({ready:true}),stillnessPose:()=>({ready:true,transitioning:false})};
  assert.equal(f.h.nightDeadlineSafeBoundary(),true);
});

test('inactive, unready and loading owners cannot claim the pending scene; explicit scene pause/focus clears held motion',async()=>{
  const f=fixture();f.save.nightDeadline=D.stepNightDeadline(f.save.nightDeadline,{runId:'main-test',runActive:true,workOrderAccepted:true,active:true,elapsedSeconds:30180}).state;
  let begins=0;f.h.beginNightFirstStrike=()=>{begins++;return Promise.resolve(false);};
  f.tick({active:false});f.h.nightWarningMeshReady=false;f.tick();f.h.nightWarningMeshReady=true;
  f.top({blocksInput:true});f.tick();assert.equal(begins,0);
  const g=fixture();g.listen(true);g.tick();g.listen(false);await g.h.beginNightFirstStrike();const scene=g.h.firstStrikeScene;
  scene.key({key:'w'});scene.update(.1);const before=scene.serialize();assert.ok(before.x>.5);
  scene.pause();scene.update(20);assert.equal(scene.serialize().elapsed,before.elapsed);
  g.focus(false);scene.update(20);assert.equal(scene.serialize().elapsed,before.elapsed);
  g.focus(true);scene.focus();scene.update(.1);assert.equal(scene.serialize().x,before.x,'focus does not retain the old held W');
  scene.exit();
});

test('actual main terminal handoff retains rendered frame before terminal save and failed-night report without credits or added injury',async()=>{
  const f=fixture();f.listen(true);f.tick();f.listen(false);await f.h.beginNightFirstStrike();const scene=f.h.firstStrikeScene;
  for(let i=0;i<170;i++){scene.update(.25);scene.render();}
  for(let i=0;i<5;i++)await Promise.resolve();
  assert.equal(f.save.nightDeadline.phase,'terminal');assert.equal(f.save.nightDeadline.consequenceReceipt.outcome,'entombed');
  assert.equal(f.save.rec.injuries,2);assert.equal(f.save.run.status,'failed-night');assert.equal(f.calls.filter(c=>c[0]==='file-failure').length,1);
  assert.equal(f.calls.filter(c=>c[0]==='show-report').length,1);assert.equal(f.save.endingExposure.endingId,'night-deadline');
  const capture=f.calls.findIndex(c=>c[0]==='capture'),terminal=f.calls.findIndex(c=>c[0]==='save'&&c[1].nightDeadline?.phase==='terminal'),report=f.calls.findIndex(c=>c[0]==='show-report');
  assert.ok(capture>=0&&capture<terminal&&terminal<report);assert.equal(f.h.firstStrikeScene,null);
});

test('resume entry construction uses stored logical location and saved physical route; a mismatched Source owner holds safely',()=>{
  const f=fixture(),planQueries=[],saved={logicalX:101,logicalY:202,origin:{x:.5,y:0,z:2.5},yaw:.7,pitch:.2,region:'ellery',owner:'world',construction:packFirstStrikeConstruction(entry())};
  Object.assign(f.h,{P3:{stillnessNativeReceiverScene:()=>({instances:[],catalog:new Map()})},
    activeGeometry:()=>({renderPlanFor:(x,y)=>{planQueries.push(['plan',x,y]);return{};},logicalToPhysical:(x,y)=>{planQueries.push(['point',x,y]);return{y:0,renderGroup:'test'};}}),
    FP:{decodeH:n=>n},PROPS:{propCanOccupy:()=>true},CELL:1,usingSpecialSpace:()=>false,
    firstStrikeEntryFromPlan:()=>entry(),firstStrikeEntryFromSubmittedGeometry:()=>entry(),firstStrikeSubmittedHostBounds:()=>({})});
  f.h.R3.r3dLightingDebug=()=>({lights:[]});vm.runInContext(body('buildNightStrikeEntry'),f.h);
  const restored=f.h.buildNightStrikeEntry(saved);assert.deepEqual(planQueries,[['plan',101,202],['point',101,202]]);
  assert.equal(restored.routeHash,saved.construction.routeHash);assert.deepEqual(copy(restored.route),saved.construction.route);
  assert.equal(f.h.buildNightStrikeEntry({...saved,region:'source',owner:'source-continuation'}),null);
});

test('resuming a presenting failure keeps its saved entry pose while the physical scene checkpoint retains later body progress',async()=>{
  const f=fixture(),savedPose={logicalX:17,logicalY:19,origin:{x:.5,y:0,z:2.5},yaw:1.2,pitch:-.15,region:'ellery',owner:'world',construction:packFirstStrikeConstruction(entry())};
  let state=D.stepNightDeadline(f.save.nightDeadline,{runId:'main-test',runActive:true,workOrderAccepted:true,active:true,elapsedSeconds:30180}).state;
  state=D.stepNightDeadline(state,{runId:'main-test',runActive:true,workOrderAccepted:true,active:true,elapsedSeconds:30180,safeBoundary:true,assetsReady:true,claimPresentation:true}).state;
  f.save.nightDeadline={...state,entryPose:savedPose};
  assert.equal(await f.h.beginNightFirstStrike(),true);
  assert.equal(f.save.nightDeadline.entryPose.yaw,1.2);assert.equal(f.save.nightDeadline.entryPose.pitch,-.15);
  assert.deepEqual(copy(f.save.nightDeadline.entryPose.origin),savedPose.origin);f.h.firstStrikeScene.exit();
});

test('an unsupported small span keeps the pending body, bounds expensive reconstruction retries and does not flood repeated messages',async()=>{
  const f=fixture();f.save.nightDeadline={...f.save.nightDeadline,phase:'pending'};let attempts=0,now=1000;
  f.h.performance.now=()=>now;f.h.buildNightStrikeEntry=()=>{attempts++;return null;};
  assert.equal(await f.h.beginNightFirstStrike(),false);
  for(let i=0;i<60;i++)await f.h.beginNightFirstStrike();assert.equal(attempts,1);assert.equal(f.calls.filter(c=>c[0]==='notice').length,1);
  now+=1600;assert.equal(await f.h.beginNightFirstStrike(),false);assert.equal(attempts,2);assert.equal(f.calls.filter(c=>c[0]==='notice').length,1);
  assert.equal(f.save.nightDeadline.phase,'pending');assert.equal(f.h.firstStrikeScene,null);assert.equal(f.calls.some(c=>c[0]==='clear-scenes'),false);
});

test('main failed-report archive callback forwards current-run recording request and initializes audio without autoplay',()=>{
  const f=fixture();let received=null,audioPrepared=0;
  f.h.ensureTapeAudio=()=>{audioPrepared++;};f.h.makeArchiveScene=options=>{received=options;return{};};f.h.getMeta=()=>({returns:{}});
  vm.runInContext(body('openArchive'),f.h);
  f.h.openArchive({summaryId:'return:main-test',recordings:true});
  assert.equal(audioPrepared,1);assert.equal(received.summaryId,'return:main-test');assert.equal(received.recordings,true);
  const report=body('showReturnReport');assert.match(report,/onArchive:request=>\{ returnToTitle\(\); openArchive\(request\); \}/);
  assert.equal(f.calls.filter(c=>c[0]==='cue').length,0);
});

test('the bell fight commits the tower road, and walking the cathedral before it does not',()=>{
  const road=stage=>{const f=fixture();f.save.chunkSurf={schema:5,phase:'completed',finale:{route:SOURCE_FINALE_ROUTE.TOWER,stage}};return f;};
  assert.equal(road(SOURCE_FINALE_STAGE.CATHEDRAL).h.nightDeadlineCommitted(),false);
  for(const stage of[SOURCE_FINALE_STAGE.CATHEDRAL_FIGHT,SOURCE_FINALE_STAGE.TOWER_ESCAPE]){
    const f=road(stage);assert.equal(f.h.nightDeadlineCommitted(),true,stage);
    f.save.nightClock.elapsedSeconds=D.NIGHT_DEADLINE_SECONDS-60;f.tick();assert.equal(f.save.nightDeadline.phase,'superseded','winning the fight cannot then lose to the demolition');
  }
  const walking=road(SOURCE_FINALE_STAGE.CATHEDRAL);walking.save.nightClock.elapsedSeconds=D.NIGHT_DEADLINE_SECONDS;walking.tick();
  assert.equal(D.nightDeadlinePending(walking.save.nightDeadline),true,'but 06:01 still reaches a player who has not begun it');
});
