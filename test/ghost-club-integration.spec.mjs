import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as scenes from '../src/game/scenes.js';
import { makeThoughtScene } from '../src/game/thoughts.js';
import { InputManager } from '../src/input/input-manager.js';
import { createPointerModeController } from '../src/input/pointer-mode.js';
import { createAcademicSociety } from '../src/game/academic-society.js';
import { createAcademicBouncers } from '../src/game/academic-bouncers.js';
import { createAcademicFloorPopulation } from '../src/game/academic-floor-population.js';
import { createAcademicFloorReturns,academicFloorActorPresent,academicFloorProtectedActorIds } from '../src/game/academic-floor-returns.js';
import { ACADEMIC_BOUNCER_ACTORS } from '../src/data/academic-bouncers.js';
import { ACADEMIC_FLOOR_POPULATION, ACADEMIC_FLOOR_GUESTS } from '../src/data/academic-floor-population.js';
import { ACADEMIC_CHARACTER_PACK_MESHES } from '../src/data/academic-society-character-design.js';
import {createAcademicSocietyPresentationClock,academicSocietyAmbientAudible} from '../src/game/academic-society-presentation.js';
import { ACADEMIC_SOCIETY_ACTORS } from '../src/data/academic-society.js';
import { runtimeTree } from '../src/narrative/runtime-content.js';
import { createReceptionConversationPresentation } from '../src/game/reception-conversation-presentation.js';
import { createLastReceptionState, getLastReceptionConversation, finishLastReceptionConversation } from '../src/game/source-last-reception.js';

test.afterEach(()=>scenes.clear());
function advanceToChoice(scene) {
  for(let n=0;n<120;n++) {
    if(scene.view().pending?.kind==='branch')return scene.view().pending.options;
    scenes.update(1);scenes.key({key:' '});
  }
  throw Error('Authored dialogue did not reach a choice');
}
function finishScene(scene) {
  for(let n=0;n<120&&scenes.has(scene.id);n++){scenes.update(1);scenes.key({key:' '});}
  assert.equal(scenes.has(scene.id),false,'the terminal reply completes');
}
function capturedWorld() {
  const input=new InputManager(),target={id:'map'};let releases=0;
  const documentRef={pointerLockElement:target,visibilityState:'visible',hasFocus:()=>true,
    exitPointerLock(){this.pointerLockElement=null;releases++;}};
  const pointer=createPointerModeController({input,documentRef,getTargetElement:()=>target,
    getState:()=>({renderer:'3d',storyMode:true,inRogue:true,blocksInput:scenes.blocksInput(),
      blocksLook:scenes.blocksInput()&&!scenes.allowsLook()})});
  pointer.sync('initial');const stop=scenes.subscribe(()=>pointer.sync('scene-change'));
  return {input,pointer,stop,releases:()=>releases};
}
const known=['host-admission','guest-a-evening','guest-b-curtain','window-seam','warning-service',
  'gallery-no-ending','warning-truth','window-truth','host-truth'];
const ready=()=>createLastReceptionState({phase:'escaped',seen:known});

test('reception selection is tentative, and only a valid authored choice can be committed',()=>{
  const state=ready(),conversation=getLastReceptionConversation(state,'warning');
  const presentation=createReceptionConversationPresentation(conversation);
  presentation.select({receptionChoice:'invented'});
  assert.equal(presentation.choiceId(),null);
  assert.equal(state.windowInvitation.status,'unoffered');
  assert.ok(presentation.nodes.start.lines.every(line=>line.who==='unknown'),'residents speak rather than silently narrate');
  presentation.select(presentation.nodes.start.choices[0]);
  assert.equal(presentation.choiceId(),'accept');
  assert.equal(state.windowInvitation.status,'unoffered','selection alone is not acceptance');
});

test('cancelling an actual jail thought after selecting acceptance does not accept the errand',()=>{
  const state=ready(),conversation=getLastReceptionConversation(state,'warning');
  const p=createReceptionConversationPresentation(conversation);let done=0,cancelled=0;
  const scene=makeThoughtScene({id:'source-reception:quest',nodes:p.nodes,blocksWorld:true,
    onChoice:p.select,onDone:()=>{done++;finishLastReceptionConversation(state,conversation.id,p.choiceId());},
    onCancel:()=>cancelled++});
  scenes.push(scene);advanceToChoice(scene);scenes.key({key:'1'});
  assert.equal(p.choiceId(),'accept');scenes.key({key:'Escape'});
  assert.equal(done,0);assert.equal(cancelled,1);assert.equal(state.windowInvitation.status,'unoffered');
});

test('actual invitation and delivery branches preserve look and commit only after terminal replies',()=>{
  const state=ready(),world=capturedWorld();
  try {
    for(const [resident,choice] of [['warning','accept'],['window','deliver']]){
      const conversation=getLastReceptionConversation(state,resident),p=createReceptionConversationPresentation(conversation);
      const scene=makeThoughtScene({id:`source-reception:${conversation.id}`,nodes:p.nodes,blocksWorld:true,
        onChoice:p.select,onDone:()=>finishLastReceptionConversation(state,conversation.id,p.choiceId())});
      scenes.push(scene);const choices=advanceToChoice(scene);
      scenes.key({key:String(choices.findIndex(entry=>entry.receptionChoice===choice)+1)});
      assert.equal(world.input.addPointerDelta(11,-4),true,'selected branch keeps look active');
      assert.equal(state.windowInvitation.status,resident==='warning'?'unoffered':'carrying');
      finishScene(scene);assert.equal(world.releases(),0);
      assert.equal(world.input.pointerLocked,true);
    }
    assert.equal(state.windowInvitation.status,'delivered');
    assert.equal(scenes.blocksInput(),false,'ordinary body ownership returns after reply');
  } finally {world.stop();}
});

test('actual named Emile loan cancellation preserves consent; loan and Lucien withdrawal keep look',()=>{
  const society=createAcademicSociety();society.tick(0,{onAcademicFloor:true,listener:{x:9,y:250}});
  const world=capturedWorld();let emitted=[];
  const open=(actorId='emile')=>{
    const tree=society.beginDialogue(actorId),choices=[];
    const scene=makeThoughtScene({id:tree.id,nodes:tree.nodes,blocksWorld:true,
      onChoice:c=>choices.push(c),onDone:()=>emitted.push(...society.endDialogue(actorId,{completed:true,choices})),
      onCancel:()=>society.endDialogue(actorId,{completed:false,choices})});
    scenes.push(scene);return scene;
  };
  const select=(scene,predicate)=>{
    const choices=advanceToChoice(scene),index=choices.findIndex(predicate);
    assert.ok(index>=0);scenes.key({key:String(index+1)});
  };
  const selectLoan=scene=>{
    select(scene,c=>c.societyTopic==='emile:need');
    select(scene,c=>c.societyAction==='lend');
  };
  try {
    let scene=open();selectLoan(scene);scenes.key({key:'Escape'});
    assert.equal(society.save().consent,'unasked');assert.equal(society.save().met.emile,0);assert.deepEqual(emitted,[]);
    scene=open();selectLoan(scene);
    assert.equal(society.save().consent,'unasked','selecting the option is not a completed promise');
    finishScene(scene);
    assert.equal(society.save().consent,'lent');assert.ok(emitted.some(e=>e.type==='borrowed-voice'));
    assert.equal(world.input.addPointerDelta(9,3),true);
    scene=open('lucien');select(scene,c=>c.societyAction==='withdraw');finishScene(scene);
    assert.equal(society.save().consent,'withdrawn');assert.equal(world.releases(),0);
    assert.equal(scenes.blocksInput(),false);assert.equal(world.input.pointerLocked,true);
  } finally {world.stop();}
});

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function adapter() {
  const start=main.indexOf('function inAcademicSociety(){'),end=main.indexOf('function talkToBust(propId){',start);
  assert.ok(start>=0&&end>start,'extract the current production adapter');
  let cancelled=0,lease=null,spoken=null,saved=null;const looseProps=new Map();
  const context={storyMode:true,planName:'conservatory',usingSpecialSpace:()=>false,px:18,py:500,
    FP:{isLoaded:()=>true,toAuthoredCoord:x=>x/2,toRuntimeDistance:x=>x*2,logicalToPhysical:(x,y)=>({x,z:y,renderGroup:'academic'})},ZONE:{academic:8},
    PROPS:{pickProp:()=>null,setLooseProp:(id,prop)=>looseProps.set(id,prop)},R3:{r3dFacing:()=>0,r3dLookAngles:()=>({yaw:0,pitch:0}),r3dWorldYaw:()=>0},mapHeading:()=>0,
    paused:false,document:{hidden:false,hasFocus:()=>true},nativeFocus:true,
    pointerMode:{status:()=>({nativeBackend:{focused:context.nativeFocus}})},
    scenes:{blocksInput:()=>false,blocksWorld:()=>false,top:()=>null},
    academicSociety:createAcademicSociety(),ACADEMIC_SOCIETY_ACTORS,academicSocietyDialogueLine:null,academicBouncerDialogueLine:null,
    academicBouncerSocialScene:null,academicBouncerSocialDispatch:null,academicBouncerActors:()=>[],
    academicAmbientDelivery:null,academicPopulationDispatch:null,academicPopulationDelivery:null,
    academicFloorPopulation:createAcademicFloorPopulation(),ACADEMIC_FLOOR_POPULATION,
    academicFloorReturns:createAcademicFloorReturns(),academicFloorActorPresent,academicFloorProtectedActorIds,
    ACADEMIC_BOUNCER_ACTORS,academicBouncerScene:null,
    academicBouncers:createAcademicBouncers(),academicAdversaryClaimsQuiet:()=>false,
    // This adapter isolates speech/scene lifecycle; compiled physical audibility
    // is exercised separately in academic-bouncer-audibility.spec.mjs.
    academicBouncerSocialAudible:()=>true,
    academicSocietyPresentation:createAcademicSocietyPresentationClock(),academicSocietyAmbientAudible,
    academicSocietyDialogueScene:null,
    academicGhostDispatch:{cancel(){cancelled++;}},academicGhostAudioFrame:{},academicGhostPanner:null,actx:null,dialogGain:null,master:null,
    saveCommit(patch){saved=patch;},
    SPEECH:{isSpeaking:()=>false,isVoicing:()=>false,speaking:()=>spoken,sayAll(lines,options){spoken=lines[0];lease=options;return{cancel(){cancelled++;}};}},
    converse:()=>null,CELL:.5,
  };
  vm.createContext(context);vm.runInContext(main.slice(start,end),context);
  return {context,looseProps,cancelled:()=>cancelled,lease:()=>lease,spoken:()=>spoken,saved:()=>saved};
}
test('real main adapter gates on native focus truth and revokes active speech under a modal',()=>{
  const a=adapter(),c=a.context;
  c.document.hasFocus=()=>false;
  assert.equal(c.academicGhostSuspended(),false,'known native focus wins over stale WebKit');
  c.dispatchAcademicGhostEvents([{type:'social',area:'pair',lines:[{who:'unknown',actorId:'emile',text:'An exchange.'}]}]);
  assert.equal(a.spoken().academicSociety,true);assert.equal(a.spoken().propId,'academic-person-emile');
  assert.equal(a.lease().valid(),true);
  c.nativeFocus=false;c.document.hasFocus=()=>true;
  assert.equal(a.lease().valid(),false,'native blur cancels the live speech lease');
  c.tickAcademicSociety(.1);assert.ok(a.cancelled()>0);
  c.nativeFocus=true;c.scenes.blocksInput=()=>true;
  assert.equal(c.academicGhostSuspended(),true);assert.equal(a.lease().valid(),false);
  c.scenes.blocksInput=()=>false;c.document.hidden=true;
  assert.equal(a.lease().valid(),false);
});

test('real main speech lease stops local chatter after walking to another third-floor area',()=>{
  const a=adapter(),c=a.context;
  c.dispatchAcademicGhostEvents([{type:'social',area:'pair',lines:[{actorId:'emile',text:'A local exchange.'}]}]);
  assert.equal(a.lease().valid(),true);
  c.px=51.2;c.py=492.4;
  assert.equal(c.inAcademicSociety(),true);
  assert.equal(a.lease().valid(),false,'a local conversation cannot follow the visitor down the gallery');
});

test('actual presentation adapter runs during its own dialogue and freezes under pause/visibility loss',()=>{
  const {context:c}=adapter();
  c.scenes.blocksWorld=()=>true;c.academicSocietyDialogueScene={id:'society'};
  c.scenes.top=()=>c.academicSocietyDialogueScene;
  c.tickAcademicSocietyPresentation(.05);assert.equal(c.academicSocietyPresentation.view().timeSec,.05);
  c.paused=true;c.tickAcademicSocietyPresentation(.1);assert.equal(c.academicSocietyPresentation.view().timeSec,.05);
  c.paused=false;c.document.hidden=true;c.tickAcademicSocietyPresentation(.1);assert.equal(c.academicSocietyPresentation.view().timeSec,.05);
  c.document.hidden=false;c.scenes.top=()=>({id:'pause'});c.tickAcademicSocietyPresentation(.1);
  assert.equal(c.academicSocietyPresentation.view().timeSec,.05);
  assert.match(main,/tickAcademicSocietyPresentation\(dt\);\s*if\(!scenes\.blocksWorld\(\)\)/,'the call must sit outside the world hold');
});

test('actual main actor frame stops the jaw at audio end while the displayed sentence finishes its gesture',()=>{
  const {context:c}=adapter();let voice=true;
  c.academicSociety.tick(0,{onAcademicFloor:true,listener:{x:9,y:250}});
  c.SPEECH.speaking=()=>({actorId:'emile',text:'You were saying it on Tuesday.',performanceCue:'interrupt',toActorId:'celeste',responseCue:'amused'});
  c.SPEECH.isVoicing=()=>voice;
  let frame=c.academicSocietyActors();assert.equal(frame.find(a=>a.id==='emile').speaking,true);
  voice=false;c.tickAcademicSocietyPresentation(.1);
  frame=c.academicSocietyActors();const emile=frame.find(a=>a.id==='emile');
  assert.equal(emile.speaking,false);assert.equal(emile.mode,'addressing');
  assert.equal(emile.performance.cue,'interrupt');assert.ok(emile.performance.elapsedSec>0);
  assert.equal(frame.find(a=>a.id==='celeste').performance.role,'listener');
  c.academicSocietyDialogueLine={actorId:'celeste',text:'Still here.',performanceCue:'assure'};
  c.academicSocietyDialogueScene={view:()=>({voice:null})};c.SPEECH.isVoicing=()=>true;
  assert.equal(c.academicSocietyActors().find(a=>a.id==='celeste').speaking,false,'a stale ambient handle cannot lend a mouth to a completed dialogue line');
});

test('root presenters never auto-complete failed scenes; original six busts remain independent strange objects',()=>{
  const section=main.slice(main.indexOf("if(result.event==='reception-talk'"),main.indexOf('// THE PAGE THAT MATTERS'));
  assert.match(section,/if\(!scene\)close\(false\)/);
  assert.match(section,/finishReceptionConversation\(conversation.id,presentation.choiceId\(\)\)/);
  const a=adapter();assert.equal(a.context.talkToAcademicPerson('emile'),false);
  assert.equal(a.context.academicSociety.save().met.emile,0);assert.equal(a.context.academicSociety.view().activeDialogue,null);
  const start=main.indexOf('function talkToBust(propId){'),end=main.indexOf('// ── the garden',start);
  const bust=main.slice(start,end);assert.doesNotMatch(bust,/beginDialogue|tryAcademicGhostClubDialogue|societyAction/);
  for(const beat of ['BUST_RESTORED','BUST_RESTORED_AGAIN','BUST_TURN'])assert.ok(bust.includes(beat));
  assert.match(bust,/HEAD\.returnMarbleHead/);assert.match(bust,/takeServicesKey/);assert.match(bust,/takeHostedPin/);
  assert.doesNotMatch(main,/tickAcademicGhostClub\(/,'the old passive bust society is dormant');
});

test('the actual six-bust interaction still selects its original trees without entering the people’s loan',()=>{
  const start=main.indexOf('function talkToBust(propId){'),end=main.indexOf('// ── the garden',start);
  const mapStart=main.indexOf('const BUST_TREES = Object.freeze('),mapEnd=main.indexOf('});',mapStart)+3;
  let presented=null;
  const context={storyMode:true,planName:'conservatory',scenes:{blocksInput:()=>false},
    HEAD:{carryingMarbleHead:()=>false,marbleHeadReturned:()=>false,noteGalleryBustSpoken(){}},
    BUST_THAT_TURNS:'academic-bust-2',BUST_WITH_PIN:'academic-bust-5',bustTurned:false,spokenBusts:new Set(),
    academicGhostDispatch:null,saveMarbleHead(){},takeServicesKey:()=>false,takeHostedPin(){},bumpFear(){},
    BUST_TALK:runtimeTree('conservatory.bust_talk'),BUST_FRAGMENT:runtimeTree('conservatory.bust_fragment'),
    BUST_SOCKETED:runtimeTree('conservatory.bust_socketed'),BUST_ANSWER:runtimeTree('conservatory.bust_answer'),
    BUST_PIN:runtimeTree('conservatory.bust_pin'),BUST_TURN:runtimeTree('conservatory.bust_turn'),
    think(id,nodes){presented={id,nodes};return{};},
  };
  vm.createContext(context);vm.runInContext(main.slice(mapStart,mapEnd)+'\n'+main.slice(start,end),context);
  const expected=[['academic-bust-1','BUST_TALK'],['academic-bust-2','BUST_TALK'],
    ['academic-bust-fragment-3','BUST_SOCKETED'],['academic-bust-4','BUST_ANSWER'],
    ['academic-bust-5','BUST_PIN'],['academic-bust-fragment-6','BUST_FRAGMENT']];
  for(const [id,key]of expected){
    assert.equal(context.talkToBust(id),true);assert.equal(presented.nodes,context[key]);
    assert.ok(Object.values(presented.nodes).flatMap(node=>node.choices||[]).every(choice=>!choice.societyAction&&!choice.clubAction));
  }
  assert.equal(context.BUST_ANSWER.start.lines.find(line=>line.text==='Ask it again.').who,'unknown');
});

test('pause immediately cancels active gallery audio even though the paused loop cannot tick it',()=>{
  const a=main.indexOf('function setGameplayPaused('),b=main.indexOf('function togglePause()',a);
  let cancelled=0,saved=0;
  const context={paused:false,storyMode:true,inRogue:true,sourceDriveSession:null,sourcePubScene:null,pubRoomAudio:null,sourcePubAudio:null,getInDriveTeaserScene:null,
    sourceContinuationAudio:null,sourceContinuationScene:null,coastalMemoryScene:null,sourceReturnFlashbackScene:null,standingTearScene:null,towerWarningAudio:null,
    syncChapelTapeDemandTimelineHold(){},
    academicGhostDispatch:{cancel(){cancelled++;}},saveAcademicGhostClub(){saved++;},
    cancelApparitionApplause(){},pauseTowerEndingRecording(){},saveSourceView(){},
    outskirtsStreetAudio:null,pauseOutskirtsLastLight(){},lowerTowerPersonalRecorder(){},stopTowerPersonalWorldSignal(){},
    bellPealPerformance:null,towerBellDirector:null,personalWindowEffects:{},windowChoreography:{},
    resetMotionInput(){},syncPointerMode(){},stopAllVoices(){},stopWorldLayerVoice(){},silenceAmbientDrone(){},
    setGainNode(){},dialogGain:null,sfxGain:null,sfxDirectGain:null,musicGain:null,whisperBed:null,
  };
  vm.createContext(context);vm.runInContext(main.slice(a,b),context);
  context.setGameplayPaused(true,{announce:false});
  assert.equal(cancelled,1);assert.equal(saved,1);assert.equal(context.academicGhostDispatch,null);
  context.setGameplayPaused(true,{announce:false});assert.equal(cancelled,1,'repeated pause is idempotent');
});

test('the regular autosave checkpoints loan time before either normal or anomaly save branches',()=>{
  const a=main.indexOf('function saveTick(dt){'),b=main.indexOf('// One question, two geometry providers',a);
  let saved=null;const society=createAcademicSociety();society.tick(0,{onAcademicFloor:true,listener:{x:9,y:250}});
  const tree=society.beginDialogue('emile');society.endDialogue('emile',{completed:true,choices:[tree.nodes.need.choices.find(c=>c.societyAction==='lend')]});
  for(let n=0;n<12;n++)society.tick(.25,{onAcademicFloor:true,listener:{x:9,y:250}});
  const context={saveAcc:0,saveAcademicGhostClub(){saved=society.save();},rememberChapelTapeDemandDeparture(){},usingStairAnomaly:()=>true,
    saveCommit(){},stepCount:0,storyMode:false,getSave:()=>({}),hushAudioRuntime:null,sourceDriveSession:null,sourcePubScene:null,sourceContinuationScene:null,coastalMemoryScene:null,sourceReturnFlashbackScene:null,standingTearScene:null};
  vm.createContext(context);vm.runInContext(main.slice(a,b),context);
  context.saveTick(4);assert.equal(saved.loanRemaining,9);assert.equal(saved.loanPulses,1);
});

test('spatial society audio uses actual actor positions, metre distances and rendered yaw',()=>{
  const a=main.indexOf('function updateAcademicGhostAudio(){'),b=main.indexOf('function talkToAcademicPerson',a);
  const values={};
  const emile=ACADEMIC_SOCIETY_ACTORS.find(actor=>actor.id==='emile');
  const context={SPEECH:{speaking:()=>({academicSociety:true,actorId:'emile'})},academicSocietyDialogueLine:null,academicBouncerDialogueLine:null,ACADEMIC_SOCIETY_ACTORS,ACADEMIC_FLOOR_POPULATION,
    academicActorPresent:()=>true,
    FP:{logicalToPhysical:(x,y)=>({x,z:y}),toRuntimeDistance:x=>x*2},px:emile.x*2-20,py:emile.y*2,CELL:.5,
    R3:{r3dWorldYaw:()=>0,r3dLookAngles:()=>({yaw:Math.PI})},actx:{currentTime:0},
    academicGhostPanner:{pan:{setTargetAtTime:v=>values.pan=v}},academicGhostGain:{gain:{setTargetAtTime:v=>values.gain=v}},
    academicGhostAudioFrame:{},};
  vm.createContext(context);vm.runInContext(main.slice(a,b),context);context.updateAcademicGhostAudio();
  assert.ok(Math.abs(values.pan-.86)<1e-8,'the real Emile anchor is on rendered camera right');
  assert.ok(Math.abs(values.gain-1/1.75)<1e-8,'twenty half-metre cells are ten metres');
  context.SPEECH.speaking=()=>null;context.updateAcademicGhostAudio();
  assert.equal(context.academicGhostAudioFrame.active,false);assert.equal(context.academicGhostAudioFrame.propId,null);
});

test('actual renderer pack registration admits every named and hollow mesh in the generated GLB',async()=>{
  const source=fs.readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
  const call=source.split('\n').find(line=>line.includes("P3.addCharacterPack(assetUrl('assets/academic-society-characters.glb')"));
  assert.ok(call,'execute the production registration, not a separate test whitelist');
  let registered=null;
  const context={ACADEMIC_CHARACTER_PACK_MESHES,assetUrl:x=>x,
    P3:{addCharacterPack(url,options){registered={url,options};return Promise.resolve();}},console};
  vm.runInNewContext(call,context);
  const bytes=fs.readFileSync(new URL('../public/assets/academic-society-characters.glb',import.meta.url));
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  const actual=json.meshes.map(mesh=>mesh.name).sort();
  assert.equal(actual.length,11);
  assert.deepEqual([...registered.options.allowedMeshes].sort(),actual,'a new body must not silently disappear behind the old four-person loader filter');
});

test('actual main keeps each walking incidental interaction proxy at its current actor frame',()=>{
  const a=adapter(),c=a.context;
  c.syncAcademicPopulationProxies();
  const walking=c.academicFloorPopulation.actorFrame().filter(actor=>actor.interactive&&actor.route);
  assert.equal(walking.length,1);
  assert.equal(a.looseProps.size,walking.length);
  for(const actor of walking){
    const proxy=a.looseProps.get(actor.id);
    assert.equal(proxy.rx,actor.x*c.FP.toRuntimeDistance(1));
    assert.equal(proxy.ry,actor.y*c.FP.toRuntimeDistance(1));
    assert.equal(proxy.populationId,actor.id);assert.equal(proxy.action,'academic-floor-population-talk');
    assert.equal(proxy.floorOverride,10);assert.equal(proxy.blocks,false);
  }
  const before={x:walking[0].x,y:walking[0].y};
  // Route passability is separately checked against compiled FP/PROPS. Here
  // advance the real carrier to test the main proxy adapter after movement.
  for(let n=0;n<300;n++)c.academicFloorPopulation.tick(.05,{onAcademicFloor:true,
    listener:{x:30,y:250},audibleGroupIds:[],canMove:()=>true});
  c.syncAcademicPopulationProxies();
  const moved=c.academicFloorPopulation.actorFrame().find(actor=>actor.id===walking[0].id),proxy=a.looseProps.get(moved.id);
  assert.ok(Math.hypot(moved.x-before.x,moved.y-before.y)>.1,'the actual carrier must move, rather than only increment a proxy counter');
  assert.equal(proxy.rx,moved.x*c.FP.toRuntimeDistance(1));assert.equal(proxy.ry,moved.y*c.FP.toRuntimeDistance(1));
});

test('actual incidental dialogue presenter commits only a terminal remark, and preserves look through cancel/complete',()=>{
  const a=adapter(),c=a.context,world=capturedWorld();let options;
  c.converse=(id,nodes,opts)=>{
    options=opts;const scene=makeThoughtScene({id,nodes,...opts});scenes.push(scene);return scene;
  };
  const actor=ACADEMIC_FLOOR_GUESTS[0];
  try{
    assert.equal(c.talkToAcademicFloorGuest(actor.id),true);
    assert.equal(c.academicFloorPopulation.view().activeDialogue,actor.id);
    scenes.key({key:'Escape'});
    assert.equal(c.academicFloorPopulation.save().remarks[actor.id],0);
    assert.equal(c.academicSocietyDialogueScene,null);assert.equal(c.academicSocietyDialogueLine,null);
    assert.equal(a.saved(),null);
    assert.equal(c.talkToAcademicFloorGuest(actor.id),true);
    const scene=c.academicSocietyDialogueScene;
    assert.equal(c.academicSocietyDialogueLine.academicPopulation,true);
    assert.equal(c.academicSocietyDialogueLine.actorId,actor.id);
    assert.equal(world.input.addPointerDelta(10,2),true);
    finishScene(scene);
    assert.equal(c.academicFloorPopulation.save().remarks[actor.id],1);
    assert.equal(a.saved().academicFloorPopulation.remarks[actor.id],1);
    options.onDone();options.onCancel();
    assert.equal(c.academicFloorPopulation.save().remarks[actor.id],1,'stale completion is idempotent');
    assert.equal(world.releases(),0);assert.equal(scenes.blocksInput(),false);
    assert.equal(world.input.addPointerDelta(8,-1),true);
  }finally{world.stop();}
});

test('failed incidental scene creation leaves no dialogue lease or committed remark; hollows stay silent',()=>{
  const a=adapter(),c=a.context;
  assert.equal(c.talkToAcademicFloorGuest(ACADEMIC_FLOOR_GUESTS[1].id),false);
  assert.equal(c.academicFloorPopulation.view().activeDialogue,null);
  assert.ok(Object.values(c.academicFloorPopulation.save().remarks).every(n=>n===0));
  assert.equal(a.saved(),null);
  for(const hollow of ACADEMIC_FLOOR_POPULATION.filter(p=>!p.interactive)){
    assert.equal(c.talkToAcademicFloorGuest(hollow.id),false);
  }
});

test('incidental voice audio uses the actual anonymous proxy anchor and clears after its line',()=>{
  const {context:c}=adapter(),actor=ACADEMIC_FLOOR_GUESTS[2],values={};
  c.px=actor.x*2-4;c.py=actor.y*2;
  c.actx={currentTime:0};c.academicGhostGain={gain:{setTargetAtTime:v=>values.gain=v}};
  c.academicGhostPanner={pan:{setTargetAtTime:v=>values.pan=v}};
  c.academicSocietyDialogueLine={academicPopulation:true,actorId:actor.id};
  c.updateAcademicGhostAudio();
  assert.equal(c.academicGhostAudioFrame.propId,actor.id);
  assert.ok(Math.abs(values.gain-1/1.15)<1e-8);assert.ok(Math.abs(values.pan-.86)<1e-8);
  c.academicSocietyDialogueLine=null;c.updateAcademicGhostAudio();
  assert.equal(c.academicGhostAudioFrame.active,false);
});
