import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {CELL,ZONE} from '../src/data/floorplan/legend.js';
import {MESH_SURFACE as ACADEMIC_CLUE_HOST_SURFACES} from '../src/data/generated/prop-geometry.js';
import {ACADEMIC_BOUNCER_ACTORS,ACADEMIC_BOUNCER_PHRASE,ACADEMIC_BOUNCER_CLUES,
  ACADEMIC_BOUNCER_CLUE_PROPS,ACADEMIC_BOUNCER_SPOKEN_CLUES} from '../src/data/academic-bouncers.js';
import {ACADEMIC_SOCIETY_ACTORS} from '../src/data/academic-society.js';
import {ACADEMIC_BOUNCER_SOCIAL_BEATS,ACADEMIC_BOUNCER_SOCIAL_TIMING} from '../src/data/academic-bouncer-society.js';
import {ACADEMIC_FLOOR_GUESTS,ACADEMIC_FLOOR_POPULATION} from '../src/data/academic-floor-population.js';
import {createAcademicBouncers} from '../src/game/academic-bouncers.js';
import {makeAcademicBouncerScene,renderAcademicBouncerSocialScene} from '../src/game/academic-bouncer-scene.js';
import {freshChapelTapeDemand,chapelTapeDemandBlocksProgress} from '../src/game/chapel-tape-demand.js';
import {academicBouncerAccessForMove,academicBouncerPhysicalFocus} from '../src/game/academic-bouncer-access.js';
import {academicBouncerSocialAudible as bouncerSocialAudible,academicBouncerSegmentClear} from '../src/game/academic-bouncer-audibility.js';
import {academicBouncerInstances} from '../src/render/academic-bouncers.js';
import {createAcademicSociety} from '../src/game/academic-society.js';
import {createAcademicSocietyPresentationClock,academicSocietyAmbientAudible} from '../src/game/academic-society-presentation.js';
import {makeThoughtScene} from '../src/game/thoughts.js';
import {createAcademicFloorPopulation} from '../src/game/academic-floor-population.js';
import {freshSave,getSave,saveCommit,withTransientGameState} from '../src/game/save.js';
import {flagTest} from '../src/game/flags.js';
import {furnitureRecognitionLine} from '../src/data/furniture-recognitions.js';
import {emitProgress} from '../src/progression/runtime.js';
import {EVENT_TYPES} from '../src/progression/events.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import * as OBJ from '../src/game/objectives.js';
import * as scenes from '../src/game/scenes.js';
import * as actualSpeech from '../src/game/speech.js';
import {InputManager} from '../src/input/input-manager.js';
import {createPointerModeController} from '../src/input/pointer-mode.js';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
function island(start,end,from=0){const a=main.indexOf(start,from),b=main.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,`production island ${start} must exist`);return main.slice(a,b);}
function functionSource(name){return name==='converse'?island(`function ${name}(`,'\n}\n')+'\n}':island(`function ${name}(`,'\nfunction ');}
const helpers=island('function academicBouncerActors(){','function inAcademicSociety(){');
const interactPrefix=island('function interact(){','  if(PB.isPlaying())')+'\n}';
const stepStart=main.indexOf('function step(dx,dy){');
// Locate the actual step's admission guard, rather than relying on byte-exact
// spacing and an old canStep invocation. Keep the production gate itself.
const accessAt=main.indexOf('academicBouncerAccessForMove({admitted:',stepStart);
assert.ok(stepStart>=0&&accessAt>stepStart,'production step retains the admission check');
const movementPrelude=main.slice(stepStart,accessAt);
const stepMoves=[...movementPrelude.matchAll(/\b(?:const|let)\s+move\s*=\s*geometry\.canStep\s*\(/g)];
assert.ok(stepMoves.length,'actual movement decision precedes the admission check');
const gateBegin=stepStart+stepMoves.at(-1).index;
const gateEnd=main.indexOf('// Source traversal is a committed world action.',accessAt);
assert.ok(gateEnd>accessAt,'actual Source-traversal boundary follows the admission gate');
const gateBody=main.slice(gateBegin,gateEnd);
const stageBody=island("  if(group==='academic'&&storyMode&&planName==='conservatory'&&!usingSpecialSpace()&&!suppressActors){","  if(group==='academic'){",main.indexOf('const recorded=yardBusWomanReplayTime'));
const hudBody=island('  } else if(focusedAcademicBouncer()){','  } else if(doorHud){').replace('  } else if(','  if(')+'\n  }';

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors,
  edgePortals:conservatory.edgePortals,doors:conservatory.doors});
const gate=FP.edgePortalState().find(p=>p.id==='academic-floor-landing-to-loggia');
const world=actor=>{const p=FP.logicalToPhysical(actor.x*FP.toRuntimeDistance(1),actor.y*FP.toRuntimeDistance(1));return{x:p.x*CELL,y:p.y,z:p.z*CELL};};

function deviceWorld(){
  const input=new InputManager(),target={id:'map'};let releases=0,domFocus=true;
  const documentRef={pointerLockElement:target,hidden:false,visibilityState:'visible',hasFocus:()=>domFocus,
    exitPointerLock(){this.pointerLockElement=null;releases++;}};
  const pointer=createPointerModeController({input,documentRef,getTargetElement:()=>target,
    getState:()=>({renderer:'3d',storyMode:true,inRogue:true,blocksInput:scenes.blocksInput(),blocksLook:scenes.blocksInput()&&!scenes.allowsLook()})});
  pointer.sync('initial');const stop=scenes.subscribe(()=>pointer.sync('scene-change'));
  return{input,pointer,documentRef,stop,releases:()=>releases,setDomFocus:value=>domFocus=value};
}
function fakeVoice(){
  let stops=0;const handles=[];
  return{handles,get stops(){return stops;},warm(){},start(text,options){const handle={text,options,done:()=>false};handles.push(handle);return handle;},stop(){stops++;},dispose(){}};
}
// Only audio completion is simulated. Production code owns beat selection,
// physical audibility, lease validity, scene input, choices and persistence.
function speechAudio(messages){
  let active=null,voicing=true;const leases=[];
  const audio={leases,current:()=>active,setVoicing:value=>voicing=value,
    finish(){active?.complete();},
    advance(){if(active&&++active.index>=active.lines.length)active.complete();},
    api:{say:line=>messages.push(line),speaking:()=>active?.lines[active.index]??null,
      isSpeaking:()=>!!active,isVoicing:()=>!!active&&voicing,
      sayAll(lines,options){
        if(options.replace)active?.cancel();
        const lease={lines,options,index:0,cancelled:false,settled:false,completed:false,
          active(){return !this.settled;},result(){return this.settled?{completed:this.completed}:null;},
          complete(){this.settled=true;this.completed=true;if(active===this)active=null;},
          cancel(){if(this.settled)return;this.settled=true;this.cancelled=true;if(active===this)active=null;}};
        leases.push(lease);active=lease;voicing=true;return lease;
      }}
  };return audio;
}
async function adapter(run,{saved=freshSave()}={}){
  return withTransientGameState({save:saved},async scope=>{
    PROPS.propsInit(FP);PROPS.loadPropState({});scenes.clear();
    const device=deviceWorld(),voice=fakeVoice(),messages=[],prompts=[],dialogueOptions=[];let yaw=0;
    const speech=speechAudio(messages);
    const c={FP,PROPS,OBJ,CELL,ZONE,ACADEMIC_BOUNCER_ACTORS,ACADEMIC_CLUE_HOST_SURFACES,
      // Admission remains a first-visit fixture. Later absence is exercised
      // with the actual common policy in academic-floor-returns-main.
      academicActorPresent:()=>true,academicLinesPresent:()=>true,
      academicActiveActorIds:()=>new Set([...ACADEMIC_BOUNCER_ACTORS,...ACADEMIC_SOCIETY_ACTORS,...ACADEMIC_FLOOR_POPULATION].map(actor=>actor.id)),
      academicFloorReturns:{save:()=>getSave().academicFloorReturns},
      ACADEMIC_BOUNCER_CLUES,ACADEMIC_BOUNCER_CLUE_PROPS,ACADEMIC_BOUNCER_SPOKEN_CLUES,
      ACADEMIC_SOCIETY_ACTORS,ACADEMIC_BOUNCER_SOCIAL_BEATS,ACADEMIC_FLOOR_POPULATION,
      academicBouncerAccessForMove,academicBouncerPhysicalFocus,academicBouncerInstances,bouncerSocialAudible,academicBouncerSegmentClear,
      academicBouncers:createAcademicBouncers(getSave().academicBouncers),
      academicSociety:createAcademicSociety(getSave().academicSociety),academicFloorPopulation:createAcademicFloorPopulation(getSave().academicFloorPopulation),
      academicBouncerScene:null,academicBouncerDialogueLine:null,academicBouncerRefusalAt:-Infinity,
      academicBouncerSocialScene:null,academicBouncerSocialDispatch:null,academicSocietyDialogueScene:null,
      academicSocietyPresentation:createAcademicSocietyPresentationClock(),academicSocietyAmbientAudible,
      academicGhostDispatch:null,academicAmbientDelivery:null,academicPopulationDispatch:null,academicPopulationDelivery:null,
      academicSocietyDialogueLine:null,academicGhostPanner:null,academicGhostGain:null,
      academicGhostAudioFrame:{},actx:null,dialogGain:null,master:null,
      storyMode:true,inRogue:true,planName:'conservatory',usingSpecialSpace:()=>false,paused:false,
      px:gate.pairs[0].from.x+1,py:gate.pairs[0].from.y,IS_TAURI:true,nativeFocus:true,
      document:device.documentRef,pointerMode:{status:()=>({...device.pointer.status(),nativeBackend:{focused:c.nativeFocus}})},
      R3:{r3dWorldYaw:()=>yaw,r3dLookAngles:()=>({yaw,pitch:0}),r3dFacing:()=>0},
      scenes,shakeMode:()=>getSave().settings?.shake||'full',getSave,saveCommit,flagTest,furnitureRecognitionLine,emitProgress,EVENT_TYPES,
      ensureCtx(){},academicGhostSpeechDestination:()=>null,
      // Academic admission takes place without an active Chapel tape-demand.
      chapelTapeDemandBlocksProgress,
      chapelTapeDemandState:()=>freshChapelTapeDemand(getSave().run?.id),
      // This academic encounter has no pending Tower-warning overlay.
      interactTowerWarning:()=>false,
      SPEECH:speech.api,academicAdversaryClaimsQuiet:()=>false,makeThoughtScene,renderAcademicBouncerSocialScene,NO_THINK:false,STORY:{},CR:{fx:{}},RENDERER:'3d',
      createReplayService:()=>null,applyStoryChoice(){},fireCue(){},
      makeAcademicBouncerScene:options=>makeAcademicBouncerScene({...options,createVoice:()=>voice}),
      playerKeys:new Set(),nowMs:10000,pushEvent:text=>messages.push(text),
      hudPromptRow:(...args)=>prompts.push(args),rows:40,cols:120,contextualPromptActive:false,
      group:'academic',suppressActors:false,timeSec:0,count:0,doorDynamicCombined:[],
    };
    vm.createContext(c);
    const productionFunctions=['gameplayInputLifecycleActive','saveAcademicGhostClub','updateAcademicGhostAudio','inspectPropTracked',
      'converse','mapHeading','inAcademicSociety','academicSocietyListener','academicSocietyActors','academicGhostSuspended',
      'tickAcademicSocietyPresentation','settleAcademicAmbientDelivery','dispatchAcademicGhostEvents','tickAcademicSociety',
      'syncAcademicPopulationProxies','talkToAcademicPerson','talkToAcademicFloorGuest'];
    vm.runInContext(helpers+'\n'+productionFunctions.map(functionSource).join('\n')+'\n'+interactPrefix+'\nfunction productionStepGate(dx,dy){const geometry=FP;\n'+gateBody+'\nreturn move;}\nfunction productionHud(){'+hudBody+'}\nfunction productionStage(){count=0;doorDynamicCombined=[];\n'+stageBody+'\nreturn doorDynamicCombined;}',c);
    const productionConverse=c.converse;c.converse=(id,nodes,options)=>{dialogueOptions.push(options);return productionConverse(id,nodes,options);};
    const aimAt=(actor=ACADEMIC_BOUNCER_ACTORS[0],lane=gate.pairs[0])=>{
      c.px=lane.from.x+1;c.py=lane.from.y;const p=FP.logicalToPhysical(c.px,c.py),target=world(actor);
      yaw=Math.atan2(target.x-p.x*CELL,-(target.z-p.z*CELL));
    };
    const standAt=(x,y)=>{c.px=FP.toRuntimeDistance(x);c.py=FP.toRuntimeDistance(y);};
    const aimAtCurrent=(id=ACADEMIC_BOUNCER_ACTORS[1].id)=>{const target=world(c.academicBouncerActors().find(actor=>actor.id===id)),at=FP.logicalToPhysical(c.px,c.py);yaw=Math.atan2(target.x-at.x*CELL,-(target.z-at.z*CELL));};
    const press=key=>{scenes.key({key,code:key===' '?'Space':key});scenes.keyup({key,code:key===' '?'Space':key});};
    const a={c,scope,device,voice,speech,messages,prompts,dialogueOptions,aimAt,aimAtCurrent,standAt,press,setYaw:value=>yaw=value};
    try{return await run(a);}finally{scenes.clear();actualSpeech.clearSpeech();device.stop();}
  });
}

function pickApproach(prop){
  const target={x:prop.interactionX??prop.x,y:prop.interactionY??prop.y};
  for(let radius=1;radius<=5;radius++)for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
    const x=Math.round(target.x*2)+dx,y=Math.round(target.y*2)+dy;
    if(FP.isSolid(x,y)||FP.isCollisionOnly(x,y)||!PROPS.propCanOccupy(x,y)||Math.abs(FP.floorAt(x,y)-prop.floor)>.2)continue;
    const mx=(x+.5)*CELL,my=(y+.5)*CELL,distance=Math.hypot(target.x-mx,target.y-my),yaw=Math.atan2(target.x-mx,-(target.y-my));
    const height=Math.max(.12,(prop.h||.55)*(prop.scale||1)),targetY=prop.floor+(prop.elevation||0)+height*.5;
    const pitch=Math.atan2(targetY-(FP.floorAt(x,y)+1.58),distance);
    const picked=PROPS.pickProp(x,y,0,2,{yaw,pitch});
    if(picked?.id===prop.id)return{x,y,yaw,pitch,picked};
  }
  return null;
}
function reachGap(a){for(let n=0;n<4;n++)a.press(' ');assert.equal(a.c.academicBouncerScene.view().phase,'window');}
function terminal(a){for(let n=0;n<3;n++)a.press(' ');assert.equal(a.c.academicBouncerScene.view().phase,'terminal');}
function advanceToChoice(a,scene){
  for(let n=0;n<120;n++){
    const pending=scene.view().pending;if(pending?.kind==='branch')return pending.options;
    scenes.update(1);a.press(' ');
  }
  throw Error('Authored social dialogue did not reach a branch');
}
function selectChoice(a,scene,predicate){const choices=advanceToChoice(a,scene),index=choices.findIndex(predicate);assert.ok(index>=0,'actual authored choice exists');a.press(String(index+1));return choices[index];}
function finishSocialScene(a,scene){for(let n=0;n<120&&scenes.has(scene.id);n++){scenes.update(1);a.press(' ');}assert.equal(scenes.has(scene.id),false,'terminal replies complete the actual scene');}
function socialTicks(c,seconds){for(let t=0;t<seconds;t+=.1)c.tickAcademicBouncers(.1);}

test('actual main E hook focuses both doorkeepers, offers optional advice, then listens into the real timed scene',async()=>adapter(a=>{
  const {c}=a;
  for(let i=0;i<ACADEMIC_BOUNCER_ACTORS.length;i++){
    const actor=ACADEMIC_BOUNCER_ACTORS[i];a.aimAt(actor,gate.pairs[i*2]);
    assert.equal(c.focusedAcademicBouncer().actorId,actor.id);
    assert.ok(Math.hypot(c.px*.5-actor.x,c.py*.5-actor.y)>200,'the fixture must cross the real logical seam');
    c.interact();const advice=c.academicBouncerSocialScene;
    assert.equal(scenes.top().id,'thought:academic-admission-advice');assert.equal(c.academicBouncerScene,null);
    assert.equal(c.academicBouncers.view().knowsPhrase,false);
    selectChoice(a,advice,choice=>choice.admissionRoute==='listen');finishSocialScene(a,advice);
    assert.equal(scenes.top().id,'academic-bouncers');assert.equal(c.academicBouncerScene,scenes.top());
    assert.equal(c.academicBouncerDialogueLine.actorId,ACADEMIC_BOUNCER_ACTORS[0].id);a.press('Escape');
    assert.equal(c.academicBouncerScene,null);assert.equal(c.academicBouncers.view().admitted,false);
  }
}));

test('production focus and HUD reject a gaze away and lower treads while naming the actual local interaction',async()=>adapter(a=>{
  const {c}=a;a.aimAt();c.productionHud();assert.equal(c.contextualPromptActive,true);
  assert.equal(a.prompts.at(-1)[1][0].label,'LISTEN TO THE TWO DOORKEEPERS');
  a.setYaw(0);assert.equal(c.focusedAcademicBouncer(),null);
  c.px=268;c.py=124;assert.equal(c.focusedAcademicBouncer(),null,'shared academic render group on lower stairs is insufficient');
  c.storyMode=false;a.aimAt();assert.equal(c.focusedAcademicBouncer(),null);
}));

test('actual step gate holds all incoming landing lanes and leaves outbound and admitted legal movement intact',async()=>adapter(a=>{
  const {c}=a;
  for(const pair of gate.pairs){
    c.px=pair.from.x;c.py=pair.from.y;
    assert.equal(c.productionStepGate(-1,0),undefined,'production guard must return before committing the rejected redirect');
    c.px=pair.to.x;c.py=pair.to.y;assert.equal(c.productionStepGate(1,0).ok,true,'exit is always available');
  }
  c.academicBouncers.load({admitted:true});c.px=gate.pairs[0].from.x;c.py=gate.pairs[0].from.y;
  const allowed=c.productionStepGate(-1,0);assert.equal(allowed.edgePortal,gate.id);assert.deepEqual(plain(allowed.redirect),gate.pairs[0].to);
  assert.ok(a.messages.some(message=>String(message).includes('two doorkeepers')));
}));

test('actual clue staging puts the memo on its measured desk surface and both lower-floor clues can win real PROPS picking',async()=>adapter(a=>{
  const {c}=a,desk=PROPS.propById('practice-desk-stack-1'),mirrorBefore=PROPS.propById('amenity-public-mirror-soap');assert.ok(desk&&mirrorBefore);
  const mirrorAnchor=[mirrorBefore.rx,mirrorBefore.ry,mirrorBefore.floor];
  c.syncAcademicBouncerClueProps();const note=PROPS.propById('academic-admission-note'),mirror=PROPS.propById('amenity-public-mirror-soap');assert.ok(note);
  assert.ok(Math.abs(note.elevation-((desk.elevation||0)+ACADEMIC_CLUE_HOST_SURFACES[desk.mesh]*(desk.scale||1)+.008))<1e-9);
  assert.equal(note.floor,desk.floor);assert.equal(note.rx,desk.rx);assert.equal(note.ry,desk.ry);assert.deepEqual([mirror.rx,mirror.ry,mirror.floor],mirrorAnchor);
  for(const prop of[note,mirror]){const approach=pickApproach(prop);assert.ok(approach,prop.id+' must win an actual traversable E approach');assert.equal(approach.picked.id,prop.id);assert.ok(approach.picked.distance<=2.2);}
  assert.equal(c.academicBouncers.view().knowsPhrase,false,'staging and looking at the physical clues do not learn them');
}));

test('production inspection hook teaches the new full programme and saves the independent floor systems',async()=>adapter(a=>{
  const {c,scope}=a;c.syncAcademicBouncerClueProps();
  const programme=c.inspectPropTracked('box-office-program-stack');assert.ok(programme.includes(ACADEMIC_BOUNCER_PHRASE));
  assert.equal(c.academicBouncers.save().clues.boxOfficeInstructions,true);assert.equal(c.academicBouncers.save().clues.boxOffice,false);
  assert.equal(c.academicBouncers.view().knowsPhrase,true);
  const before=c.academicBouncers.save();c.productionStage();assert.deepEqual(c.academicBouncers.save(),before);
  const text=c.inspectPropTracked('academic-admission-note');assert.ok(text.includes(ACADEMIC_BOUNCER_PHRASE));assert.match(text,/Let him finish/);
  assert.equal(c.academicBouncers.save().clues.practice,true);assert.equal(c.academicBouncers.view().knowsPhrase,true);assert.ok(PROPS.savePropState().inspected.includes('academic-admission-note'));
  const patch=scope.writes.filter(write=>write.type==='save'&&write.patch.academicBouncers).at(-1).patch;
  assert.deepEqual(Object.keys(patch).sort(),['academicBouncers','academicFloorPopulation','academicFloorReturns','academicSociety']);
  assert.deepEqual(getSave().academicBouncers,c.academicBouncers.save());assert.deepEqual(getSave().academicSociety,c.academicSociety.save());assert.deepEqual(getSave().academicFloorPopulation,c.academicFloorPopulation.save());
  const count=scope.writes.length;c.inspectPropTracked('academic-admission-note');assert.equal(scope.writes.length,count,'reinspection does not manufacture a new clue receipt');
}));

test('the independently pickable public mirror teaches through the same real inspection adapter',async()=>adapter(a=>{
  const {c}=a;c.syncAcademicBouncerClueProps();const mirror=PROPS.propById('amenity-public-mirror-soap'),approach=pickApproach(mirror);assert.ok(approach);
  assert.equal(c.academicBouncers.view().knowsPhrase,false);
  const picked=PROPS.pickProp(approach.x,approach.y,0,2,{yaw:approach.yaw,pitch:approach.pitch});
  const text=c.inspectPropTracked(picked.id);assert.ok(text.includes(ACADEMIC_BOUNCER_PHRASE));assert.equal(getSave().academicBouncers.clues.bathroom,true);assert.equal(getSave().academicBouncers.clues.practice,false);
}));

test('actual cancellation keeps learned words, refuses admission and returns movement/look without releasing capture',async()=>adapter(a=>{
  const {c,device}=a;c.syncAcademicBouncerClueProps();c.inspectPropTracked('academic-admission-note');a.aimAt();c.interact();reachGap(a);a.press('3');
  assert.equal(c.academicBouncers.view().attempt.outcome,'success');assert.equal(getSave().academicBouncers.admitted,false);
  assert.equal(device.input.addPointerDelta(6,-2),true);a.press('Escape');
  assert.equal(scenes.blocksInput(),false);assert.equal(scenes.blocksInput()&&!scenes.allowsLook(),false);assert.equal(c.academicBouncerScene,null);assert.equal(c.academicBouncerDialogueLine,null);
  assert.equal(device.input.pointerLocked,true);assert.equal(device.releases(),0);assert.equal(device.input.addPointerDelta(-3,1),true);
  assert.equal(getSave().academicBouncers.admitted,false);assert.equal(getSave().academicBouncers.clues.practice,true);assert.equal(c.academicBouncers.view().attempt,null);
}));

test('real terminal acknowledgment persists admission, opens the gate and stages both controller-owned walks aside',async()=>adapter(a=>{
  const {c,device}=a;c.syncAcademicBouncerClueProps();c.inspectPropTracked('academic-admission-note');a.aimAt();c.interact();reachGap(a);a.press('3');terminal(a);
  assert.equal(getSave().academicBouncers.admitted,false);assert.equal(c.academicBouncers.view().admitted,false);a.press('Enter');
  assert.equal(getSave().academicBouncers.admitted,true);assert.equal(scenes.blocksInput(),false);assert.equal(device.input.pointerLocked,true);assert.equal(device.releases(),0);
  const before=c.productionStage();assert.equal(before.length,2);assert.deepEqual(plain(before.map(body=>body.academicBouncerActor)),ACADEMIC_BOUNCER_ACTORS.map(actor=>actor.id));
  c.tickAcademicBouncers(.1);const frames=c.academicBouncerActors(),after=c.productionStage();assert.ok(frames.every(actor=>actor.mode==='walk'&&actor.distance>0));
  for(const body of after){const actor=frames.find(actor=>actor.id===body.academicBouncerActor),point=world(actor);assert.equal(body.mesh,actor.mesh);assert.equal(body.x,point.x);assert.equal(body.y,10);assert.equal(body.z,point.z);assert.equal(body.zone,ZONE.academic);assert.equal(Object.keys(body.character.joints).length,54);}
  assert.notDeepEqual(before.map(b=>b.x),after.map(b=>b.x));
  const reloaded=createAcademicBouncers(getSave().academicBouncers);assert.equal(reloaded.view().admitted,true);assert.equal(reloaded.view().attempt,null);assert.equal(reloaded.view().asideProgress,1);
  assert.equal(device.input.addPointerDelta(8,3),true);
}));

test('production lifecycle adapter freezes the response gap and stops/replays voice across native blur and pause ownership',async()=>adapter(a=>{
  const {c,voice}=a;a.aimAt();c.interact();const advice=c.academicBouncerSocialScene;
  selectChoice(a,advice,choice=>choice.admissionRoute==='listen');finishSocialScene(a,advice);
  const first=c.academicBouncerScene.view().currentLine.text;
  c.nativeFocus=false;c.tickAcademicBouncers(.1);assert.equal(c.academicBouncerScene.view().suspended,true);assert.ok(voice.stops>0);
  scenes.update(20);assert.equal(c.academicBouncerScene.view().currentLine.text,first);
  c.nativeFocus=true;c.tickAcademicBouncers(.1);assert.equal(c.academicBouncerScene.view().suspended,false);assert.equal(voice.handles.at(-1).text,first);
  reachGap(a);const remaining=c.academicBouncerScene.view().remaining;
  const pause={id:'pause',blocksInput:true,blocksWorld:true,freezesBelow:true};scenes.push(pause);c.tickAcademicBouncers(.1);scenes.update(20);assert.equal(c.academicBouncerScene.view().remaining,remaining);
  scenes.remove(pause);c.tickAcademicBouncers(.1);scenes.update(.1);assert.ok(c.academicBouncerScene.view().remaining<remaining);a.press('Escape');
  assert.equal(c.academicBouncers.view().attempt,null);assert.equal(c.academicBouncerScene,null);
}));

test('production save patch preserves existing named consent and incidental remark progress alongside admission',async()=>{
  const first=ACADEMIC_FLOOR_GUESTS[0].id,saved={...freshSave(),academicSociety:{consent:'declined',visits:4},academicFloorPopulation:{remarks:{[first]:2}},academicBouncers:{admitted:true,clues:{bathroom:true}}};
  await adapter(a=>{const {c}=a;c.saveAcademicGhostClub();assert.equal(getSave().academicSociety.consent,'declined');assert.equal(getSave().academicSociety.visits,4);assert.equal(getSave().academicFloorPopulation.remarks[first],2);assert.equal(getSave().academicBouncers.admitted,true);assert.equal(getSave().academicBouncers.clues.bathroom,true);assert.equal(createAcademicBouncers(getSave().academicBouncers).view().asideProgress,1);},{saved});
});

test('main tick issues autonomous local pre-admission company from the real stair landing and arbitrates the shared speech band',async()=>adapter(a=>{
  const {c,speech}=a;a.aimAt();const opening=ACADEMIC_BOUNCER_SOCIAL_BEATS.find(beat=>beat.id==='opening-rota');
  assert.ok(c.academicBouncerSocialContext());assert.equal(c.academicBouncerSocialAudible(opening),true,'physical landing and guard rays must cross the compiled stair seam');
  socialTicks(c,ACADEMIC_BOUNCER_SOCIAL_TIMING.firstExchange+.2);
  assert.equal(speech.leases.length,1);const lease=speech.current();
  assert.equal(lease.options.id,'academic-bouncer-society');assert.equal(lease.options.valid(),true);
  assert.deepEqual(plain(lease.lines.map(line=>line.actorId)),opening.lines.map(line=>line.actorId));
  assert.ok(lease.lines.every(line=>line.bouncerSocial&&line.academicBouncer&&!line.academicSociety));
  assert.deepEqual(getSave().academicBouncers.social.issuedBeatIds,['opening-rota']);
  assert.equal(getSave().academicBouncers.knowsPhrase,undefined);assert.equal(c.academicBouncers.view().knowsPhrase,false,'idle exchanges do not teach the admission trick');
  const quiet=c.academicBouncers.society.view().quiet;
  socialTicks(c,30);c.tickAcademicSociety(5);
  assert.equal(speech.leases.length,1,'neither controller overwrites a live speech chain');assert.equal(c.academicBouncers.society.view().quiet,quiet);
  speech.finish();socialTicks(c,ACADEMIC_BOUNCER_SOCIAL_TIMING.quietBetween+.2);
  assert.equal(speech.leases.length,2);assert.equal(c.academicBouncers.save().social.issuedBeatIds[1],'closing-complaint');
  assert.equal(c.academicBouncers.view().admitted,false);
}));

test('production social routing requires every actual reciprocal speaker, clear compiled segments and the correct physical floor',async()=>adapter(a=>{
  const {c,speech}=a;c.academicBouncers.load({admitted:true});a.standAt(12,278);
  const resident=ACADEMIC_BOUNCER_SOCIAL_BEATS.find(beat=>beat.id==='hugh-odette-closing'),context=c.academicBouncerSocialContext();
  assert.equal(c.academicBouncerSocialAudible(resident),true);assert.equal(c.academicBouncerSocialAudible(ACADEMIC_BOUNCER_SOCIAL_BEATS.find(beat=>beat.id==='hugh-agathe-category')),true);
  c.dispatchAcademicBouncerSocialEvents([resident]);const lease=speech.current();assert.ok(lease);
  const reply=lease.lines.find(line=>line.actorId==='odette');assert.equal(reply.bouncerSocial,true);assert.equal(reply.academicSociety,true);assert.equal(reply.academicBouncer,false);assert.equal(reply.voiceSpeaker,'society-odette');
  for(const actors of [context.actors.filter(actor=>actor.id!=='odette'),context.actors.map(actor=>actor.id==='odette'?{...actor,visible:false}:actor),[...context.actors,context.actors.find(actor=>actor.id==='odette')]])
    assert.equal(c.academicBouncerSocialAudible(resident,{...context,actors}),false);
  assert.equal(c.academicBouncerSocialAudible({lines:[{actorId:'nonexistent'}]},context),false);
  const blocked={listener:{x:66.25,y:10,z:1.25},actors:[{id:'a',x:66.25,y:10,z:1.25},{id:'b',x:68.25,y:10,z:1.25}]};
  assert.equal(c.academicBouncerSocialAudible({lines:[{actorId:'a'},{actorId:'b'}]},blocked),false,'actual solid partition refuses the adapter ray');
  a.standAt(21.5,274.5);assert.ok(Math.hypot(21.5-14.5,274.5-274.5)<=8);assert.equal(c.academicBouncerSocialAudible(resident),false,'being near Odette alone cannot relay distant Hugh');
  assert.equal(lease.options.valid(),false);
  // The real speech queue revalidates the same main-owned lease on update,
  // dropping both the current sentence and every dependent reply.
  speech.finish();a.standAt(12,278);c.SPEECH=actualSpeech;c.dispatchAcademicBouncerSocialEvents([resident]);actualSpeech.updateSpeech(0);
  assert.equal(actualSpeech.speaking().actorId,resident.lines[0].actorId);assert.equal(actualSpeech.isSpeaking(),true);
  a.standAt(21.5,274.5);actualSpeech.updateSpeech(0);assert.equal(actualSpeech.isSpeaking(),false);assert.deepEqual(actualSpeech.speechDispatchSnapshot().queued,[]);
  c.px=268;c.py=124;assert.equal(c.academicBouncerSocialContext(),null,'lower main treads share the render group but not floor height');
  assert.equal(c.academicBouncerSocialAudible(resident),false);
}));

test('ambient speech leases cancel on native blur, a modal or leaving, and cannot consume a new exchange while blocked',async()=>adapter(a=>{
  const {c,speech}=a;a.aimAt();socialTicks(c,3.7);const lease=speech.current(),receipt=c.academicBouncers.society.save();assert.ok(lease);
  c.nativeFocus=false;assert.equal(lease.options.valid(),false);c.tickAcademicBouncers(.1);assert.equal(lease.cancelled,true);assert.equal(speech.current(),null);
  socialTicks(c,30);assert.deepEqual(c.academicBouncers.society.save(),receipt);
  c.nativeFocus=true;c.document.hasFocus=()=>false;
  socialTicks(c,22.2);const restored=speech.current();assert.ok(restored,'confirmed native focus wins over stale DOM focus');
  const modal={id:'blocking-menu',blocksInput:true,blocksWorld:true,allowsLook:true};scenes.push(modal);assert.equal(restored.options.valid(),false);c.tickAcademicBouncers(.1);assert.equal(restored.cancelled,true);
  const held=c.academicBouncers.society.save();socialTicks(c,30);assert.deepEqual(c.academicBouncers.society.save(),held);scenes.remove(modal);
  c.planName='source';c.tickAcademicBouncers(.1);assert.equal(c.academicBouncerSocialContext(),null);assert.equal(speech.current(),null);
}));

test('actual admitted E opens the five-topic converse tree; cancellation and scene replacement preserve save and look leases',async()=>adapter(a=>{
  const {c,device}=a;c.academicBouncers.load({admitted:true,clues:{practice:true}});a.standAt(12.5,278);a.aimAtCurrent();
  assert.equal(c.focusedAcademicBouncer().actorId,ACADEMIC_BOUNCER_ACTORS[1].id);c.interact();const scene=c.academicBouncerSocialScene;
  assert.ok(scene);assert.equal(scenes.top(),scene);assert.equal(scene.id,'thought:academic-bouncer-society');assert.equal(c.academicBouncerScene,null);
  assert.equal(c.academicBouncerDialogueLine.academicBouncer,true);assert.equal(device.input.addPointerDelta(5,-2),true);assert.equal(scenes.allowsLook(),true);
  const options=advanceToChoice(a,scene);assert.deepEqual(plain(options.map(option=>option.bouncerTopic).filter(Boolean)),['doorwork','register','music','portraits','stay']);
  selectChoice(a,scene,choice=>choice.bouncerTopic==='stay');assert.equal(c.academicBouncers.society.view().activeDialogue,true);
  c.saveAcademicGhostClub();assert.deepEqual(getSave().academicBouncers.social.topics,[]);assert.equal(getSave().academicBouncers.social.conversations,0);
  const savedDuring=createAcademicBouncers(getSave().academicBouncers);assert.equal(savedDuring.society.view().activeDialogue,false);assert.equal(savedDuring.view().asideProgress,1);
  a.press('Escape');assert.equal(c.academicBouncerSocialScene,null);assert.equal(c.academicBouncerDialogueLine,null);assert.equal(c.academicBouncers.society.view().activeDialogue,false);
  assert.deepEqual(c.academicBouncers.save().social.topics,[]);assert.equal(device.input.pointerLocked,true);assert.equal(device.releases(),0);assert.equal(scenes.blocksInput(),false);
  c.interact();const second=c.academicBouncerSocialScene;selectChoice(a,second,choice=>choice.bouncerTopic==='register');
  scenes.replace({id:'replacement',blocksInput:true,allowsLook:true});assert.equal(c.academicBouncerSocialScene,null);assert.equal(c.academicBouncers.society.view().activeDialogue,false);assert.deepEqual(c.academicBouncers.save().social.topics,[]);
  const stale=a.dialogueOptions.at(-1);stale.onDone();stale.onCancel();assert.equal(c.academicBouncers.save().social.conversations,0,'late callbacks cannot turn abandonment into completion');
  scenes.clear();assert.equal(device.input.addPointerDelta(2,1),true);assert.equal(device.releases(),0);
}));

test('the real social terminal saves completed subjects once, preserves all other floor states and changes the reloaded opening',async()=>{
  const first=ACADEMIC_FLOOR_GUESTS[0].id,saved={...freshSave(),academicSociety:{consent:'lent',visits:4},academicFloorPopulation:{remarks:{[first]:2}},academicBouncers:{admitted:true,clues:{bathroom:true}}};
  await adapter(a=>{
    const {c,device}=a;a.standAt(12.5,278);a.aimAtCurrent();c.interact();const scene=c.academicBouncerSocialScene;
    for(const id of['doorwork','register','music','portraits','stay']){
      selectChoice(a,scene,choice=>choice.bouncerTopic===id);
      if(id==='music')assert.match(c.academicBouncerDialogueLine.text,/Emile is using my voice/,'named consent is read by the production tree');
      assert.deepEqual(c.academicBouncers.save().social.topics,[],'questions remain tentative until the terminal exit');
      selectChoice(a,scene,choice=>choice.goto==='start');
    }
    selectChoice(a,scene,choice=>choice.goto==='leave');assert.equal(c.academicBouncers.society.save().conversations,0);
    finishSocialScene(a,scene);assert.equal(c.academicBouncerSocialScene,null);assert.equal(c.academicBouncerDialogueLine,null);
    const result=getSave().academicBouncers;assert.equal(result.version,2);assert.equal(result.admitted,true);assert.equal(result.clues.bathroom,true);assert.equal(result.social.conversations,1);
    assert.deepEqual(result.social.topics,['doorwork','register','music','portraits','stay']);assert.equal(getSave().academicSociety.consent,'lent');assert.equal(getSave().academicSociety.visits,4);assert.equal(getSave().academicFloorPopulation.remarks[first],2);
    const stale=a.dialogueOptions.at(-1);stale.onDone();stale.onCancel();assert.equal(c.academicBouncers.society.save().conversations,1);
    c.academicBouncers.load(result);c.interact();assert.match(c.academicBouncerDialogueLine.text,/both still here/);assert.equal(c.academicBouncers.view().asideProgress,1);a.press('Escape');
    assert.equal(device.input.pointerLocked,true);assert.equal(device.releases(),0);assert.equal(device.input.addPointerDelta(6,3),true);assert.equal(scenes.blocksInput(),false);
  },{saved});
});

test('main actor routing gives a reciprocal resident the actual voice and gives the addressed guard the listener performance',async()=>adapter(a=>{
  const {c,speech}=a;c.academicBouncers.load({admitted:true});a.standAt(12,278);c.tickAcademicSociety(0);
  for(const id of['hugh-odette-closing','hugh-agathe-category']){
    const event=ACADEMIC_BOUNCER_SOCIAL_BEATS.find(beat=>beat.id===id);c.dispatchAcademicBouncerSocialEvents([event]);assert.ok(speech.current());
    for(const line of event.lines){
      const actual=c.SPEECH.speaking();assert.equal(actual.actorId,line.actorId);assert.equal(actual.voiceSpeaker,line.voiceSpeaker);
      const guards=c.academicBouncerActors(),residents=c.academicSocietyActors(),cast=[...guards,...residents],speaker=cast.find(actor=>actor.id===line.actorId),target=cast.find(actor=>actor.id===line.toActorId);
      assert.deepEqual(cast.filter(actor=>actor.speaking).map(actor=>actor.id),[line.actorId]);assert.equal(speaker.performance.role,'speaker');assert.equal(target.performance.role,'listener');
      assert.equal(target.gazeKey,line.actorId);assert.equal(speaker.gazeKey,line.toActorId);assert.equal(speaker.performance.cue,line.performanceCue);
      speech.setVoicing(false);const held=[...c.academicBouncerActors(),...c.academicSocietyActors()];assert.ok(held.every(actor=>!actor.speaking),'a held caption cannot borrow a mouth');assert.equal(held.find(actor=>actor.id===line.actorId).performance.role,'speaker');
      speech.setVoicing(true);speech.advance();
    }
  }
}));

test('both live social controllers arbitrate locally through the same occupied speech band',async()=>adapter(a=>{
  const {c,speech}=a;c.academicBouncers.load({admitted:true});a.standAt(13,276);
  for(let n=0;n<27;n++)c.tickAcademicSociety(.1);
  assert.equal(speech.leases.length,1);assert.equal(speech.current().options.id,'academic-society');
  for(let n=0;n<50;n++)c.tickAcademicBouncers(.1);
  assert.deepEqual(c.academicBouncers.society.save().issuedBeatIds,[],'nearby doorkeepers cannot speak over a named resident exchange');
  speech.finish();c.settleAcademicAmbientDelivery();
  assert.deepEqual(c.academicSociety.save().issuedBeatIds,['odette-arrival'],'only the completed real delivery records the named subject');
  socialTicks(c,3.7);assert.equal(speech.leases.length,2);assert.equal(speech.current().options.id,'academic-bouncer-society');
  const issued=c.academicSociety.save().issuedBeatIds;
  for(let n=0;n<200;n++)c.tickAcademicSociety(.1);
  assert.equal(speech.leases.length,2);assert.deepEqual(c.academicSociety.save().issuedBeatIds,issued,'reciprocal arbitration must also protect the bouncer exchange');
}));

test('main settles a cancelled named delivery without inventing a completed subject, then retries in actual quiet time',async()=>adapter(a=>{
  const {c,speech}=a;c.academicBouncers.load({admitted:true});a.standAt(13,276);
  for(let n=0;n<27;n++)c.tickAcademicSociety(.1);
  const lease=speech.current();assert.equal(lease.options.id,'academic-society');
  assert.equal(lease.active(),true);assert.equal(lease.result(),null);
  lease.cancel();assert.deepEqual(lease.result(),{completed:false});c.settleAcademicAmbientDelivery();
  assert.deepEqual(c.academicSociety.save().issuedBeatIds,[]);assert.equal(c.academicSociety.view().pendingAmbient,null);
  for(let n=0;n<42;n++)c.tickAcademicSociety(.1);
  assert.equal(speech.leases.length,2);assert.equal(speech.current().lines[0].actorId,'odette');
  assert.deepEqual(c.academicSociety.save().issuedBeatIds,[],'reissuing still is not a completed hearing');
  speech.finish();c.settleAcademicAmbientDelivery();assert.deepEqual(c.academicSociety.save().issuedBeatIds,['odette-arrival']);
}));

test('an admitted conversation keeps its own acting clocks live while pause and native focus hold them without losing look',async()=>adapter(a=>{
  const {c,device}=a;c.academicBouncers.load({admitted:true});a.standAt(12.5,278);a.aimAtCurrent();c.interact();
  const scene=c.academicBouncerSocialScene;assert.ok(scene);
  c.tickAcademicSocietyPresentation(.1);c.tickAcademicBouncers(.1);
  assert.equal(c.academicSocietyPresentation.view().timeSec,.1);assert.equal(c.academicBouncers.view().timeSec,.1);
  assert.equal(device.input.addPointerDelta(6,-1),true);const frames=plain(c.academicBouncerActors());
  const pause={id:'pause',blocksInput:true,blocksWorld:true,freezesBelow:true,allowsLook:true};scenes.push(pause);
  c.tickAcademicSocietyPresentation(.1);c.tickAcademicBouncers(.1);scenes.update(10);
  assert.equal(c.academicSocietyPresentation.view().timeSec,.1);assert.deepEqual(plain(c.academicBouncerActors()),frames);scenes.remove(pause);
  c.nativeFocus=false;c.tickAcademicSocietyPresentation(.1);c.tickAcademicBouncers(.1);assert.deepEqual(plain(c.academicBouncerActors()),frames);assert.equal(c.academicSocietyPresentation.view().timeSec,.1);
  c.nativeFocus=true;c.tickAcademicSocietyPresentation(.1);c.tickAcademicBouncers(.1);assert.equal(c.academicSocietyPresentation.view().timeSec,.2);assert.equal(c.academicBouncers.view().timeSec,.2);
  a.press('Escape');assert.equal(c.academicBouncerSocialScene,null);assert.equal(scenes.blocksInput(),false);assert.equal(device.input.pointerLocked,true);assert.equal(device.input.addPointerDelta(-4,2),true);assert.equal(device.releases(),0);
}));
