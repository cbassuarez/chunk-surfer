import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createFootContactClock,resolveFootContact} from '../src/audio/foot-contact.js';
import {resolveSourceFootingTreatment} from '../src/audio/source-footing-treatment.js';
import { SOURCE_BRAIDED_DIVIDE, sourceDivideDepth } from '../src/data/source-braided-divide.js';
import {MATERIAL,ZONE} from '../src/data/floorplan/legend.js';

const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function production(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,`Missing production adapter ${name}`);
  const end=source.indexOf('\nfunction ',start+10);
  return source.slice(start,end<0?source.length:end);
}
function harness(){
  const model={source:false,held:false,active:true,blocks:false,material:MATERIAL.woodVelvet,
    duration:.045,soft:0,rec:{slow:false,injuries:0},state:{phase:'landscape',landscapeOrigin:{y:0}},
    horizon:{active:false},shore:{active:false},personal:{active:false},void:{},realm:null,bus:null,body:null};
  const events=[],cleared=[],updates=[],prepared=[];
  const geometry={cellAt:()=>({material:model.material,zone:ZONE.hall,sourceDivide:model.divide,sourceEdgeApron:model.apron}),materialAt:()=>model.material};
  const context=vm.createContext({MATERIAL,ZONE,CELL:.5,resolveFootContact,resolveSourceFootingTreatment,SOURCE_BRAIDED_DIVIDE,sourceDivideDepth,createFootContactClock,
    playerFootClock:createFootContactClock(),playerFootTravel:[],playerFootOwner:null,playerFootIndex:0,
    playerFootHeld:false,playerFootPrepareKey:null,
    px:0,py:0,depth:0,planName:'test',storyMode:true,inRogue:true,paused:false,
    performance:{now:()=>1000},document:{hidden:false},
    sourceContinuationScene:null,coastalMemoryScene:null,sourceDriveSession:null,sourcePubScene:null,
    sourceReturnFlashbackScene:null,getInDriveTeaserScene:null,
    usingSourceSpace:()=>model.source,usingSpecialSpace:()=>model.source,usingStairAnomaly:()=>false,usingPlan:()=>true,
    activeGeometry:()=>geometry,physicalPointFor:(x,y)=>({x,z:y}),
    chunkSurfRuntime:{state:()=>model.state,horizonFrame:()=>model.horizon,sourceShoreFrame:()=>model.shore,
      busInteriorFrame:()=>model.body,outskirtsBusPassageFrame:()=>model.bus,towerLandFrame:()=>model.personal,
      stationRealmFrame:()=>model.realm,sourceVoidFrame:()=>model.void},
    PROPS:{softFloorPropAt:()=>model.soft},REC:{recState:()=>model.rec},
    SOURCE_PRE_TAPE:{from:100,roadFrom:50,stillLength:50},natatoriumPlayerInWater:()=>false,outskirtsLosing:()=>0,
    currentStepIntervalMs:()=>model.duration*1000,scenes:{blocksInput:()=>model.blocks},
    movementIntentActive:()=>model.held,gameplayInputLifecycleActive:()=>model.active,
    RT:{footstep:(level,event)=>events.push({level,...event}),prepareFootsteps:d=>prepared.push(d),
      clearFootContacts:o=>cleared.push(o),pauseFootsteps:()=>updates.push({paused:true}),updateFootsteps:d=>updates.push(d)},
    sourceShoreAudio:{footstep:()=>{}},scheduleStairStepEcho:()=>{},
  });
  for(const name of ['resetPlayerFootContacts','playerFootingAt','queuePlayerFootTravel','enqueuePlayerFootDistance',
    'tickPlayerFootsteps','playSceneFootContact','clearSceneFootContacts'])vm.runInContext(production(name),context);
  const descriptor=(extra={})=>({owner:'player:test',surface:'wood',profile:'physical',supported:true,level:.22,...extra});
  return{model,context,events,cleared,updates,prepared,descriptor};
}
function walk(h,{seconds=5,interval=.045,descriptor=h.descriptor()}={}){
  const dt=1/120;let next=0,x=0;
  for(let now=0;now<seconds;now+=dt){
    if(now>=next){
      h.context.queuePlayerFootTravel({x,y:0},{x:x+1,y:0},now*1000,descriptor);x++;next+=interval;
    }
    h.context.tickPlayerFootsteps(dt,dt*1000);
  }
}

test('ordinary accepted half-metre grid moves create a bounded alternating gait, not one sound per grid move',()=>{
  const h=harness();walk(h,{seconds:10});
  assert.ok(h.events.length>=46&&h.events.length<=48,`Got ${h.events.length} plants for 222 accepted moves`);
  assert.deepEqual(h.events.slice(0,6).map(e=>e.footSide),['left','right','left','right','left','right']);
  assert.ok(h.events.every(e=>e.surface==='wood'&&e.profile==='physical'));
});

test('slow bus travel is integrated in frame-sized distances instead of failing the clock hitch guard',()=>{
  const h=harness();h.model.duration=.5/1.35;
  walk(h,{seconds:10,interval:h.model.duration,descriptor:h.descriptor({surface:'body',wetness:1})});
  assert.ok(h.events.length>=12&&h.events.length<=23,`Got ${h.events.length} body plants`);
  assert.ok(h.events.every(e=>e.surface==='body'));
});

test('careful fast travel remains distinct while the default fast gait follows actual speed',()=>{
  const h=harness();walk(h,{seconds:10,descriptor:h.descriptor({careful:true,condition:'slow'})});
  assert.ok(h.events.length>=20&&h.events.length<=23,`Got ${h.events.length} careful plants`);
});

test('stopped, rejected and unsupported travel cannot create audible contacts',()=>{
  const h=harness();
  h.context.queuePlayerFootTravel({x:0,y:0},{x:0,y:0},0,h.descriptor());
  h.context.queuePlayerFootTravel({x:0,y:0},{x:1,y:0},0,h.descriptor({supported:false}));
  for(let i=0;i<90;i++)h.context.tickPlayerFootsteps(1/60,1000/60);
  assert.equal(h.events.length,0);assert.equal(h.updates.at(-1).moving,false);
});

test('relocation and owner change discard old queued travel',()=>{
  const h=harness();
  h.context.queuePlayerFootTravel({x:0,y:0},{x:1,y:0},0,h.descriptor({owner:'old'}));
  h.context.queuePlayerFootTravel({x:0,y:0},{x:1,y:0},0,h.descriptor({owner:'new',surface:'tile'}));
  for(let i=0;i<20;i++)h.context.tickPlayerFootsteps(1/60,1000/60);
  assert.equal(h.events.length,1);assert.equal(h.events[0].owner,'new');assert.ok(h.cleared.includes('old'));
  h.context.queuePlayerFootTravel({x:0,y:0},{x:100,y:0},0,h.descriptor());
  const count=h.events.length;
  for(let i=0;i<60;i++)h.context.tickPlayerFootsteps(1/60,1000/60);
  assert.equal(h.events.length,count);
});

test('pause and long unseen frame gaps cancel queued contacts and do not replay them on return',()=>{
  for(const reason of ['pause','gap']){
    const h=harness();h.context.queuePlayerFootTravel({x:0,y:0},{x:1,y:0},0,h.descriptor());
    h.context.paused=reason==='pause';h.context.tickPlayerFootsteps(1/60,reason==='gap'?1000:1000/60);
    h.context.paused=false;
    for(let i=0;i<60;i++)h.context.tickPlayerFootsteps(1/60,1000/60);
    assert.equal(h.events.length,0,reason);
  }
});

test('low foreground frame rates consume real accepted travel without a post-stop backlog',()=>{
  for(const fps of [12,20,60]){
    const h=harness(),frame=1/fps;let x=0,next=0;
    for(let time=0;time<3;time+=frame){
      if(time>=next){
        h.context.queuePlayerFootTravel({x,y:0},{x:x+1,y:0},time*1000,h.descriptor());x++;
        next+=h.model.duration;if(next<time-h.model.duration)next=time+h.model.duration;
      }
      h.context.tickPlayerFootsteps(Math.min(.05,frame),frame*1000);
    }
    assert.ok(h.context.playerFootTravel.length<=1,`${fps} FPS queued ${h.context.playerFootTravel.length} moves`);
    // Only a remainder of the final committed cell may still be presented.
    for(let i=0;i<Math.ceil(.12*fps);i++)h.context.tickPlayerFootsteps(Math.min(.05,frame),frame*1000);
    assert.equal(h.context.playerFootTravel.length,0,`${fps} FPS kept accepted travel after stopping`);
    const count=h.events.length;
    for(let i=0;i<fps;i++)h.context.tickPlayerFootsteps(Math.min(.05,frame),frame*1000);
    assert.equal(h.events.length,count,`${fps} FPS replayed footsteps while stopped`);
  }
});

test('a world-owning scene retires the main queue without holding the shared scene player paused',()=>{
  const h=harness();h.context.queuePlayerFootTravel({x:0,y:0},{x:1,y:0},0,h.descriptor());
  h.context.sourceContinuationScene={};h.model.blocks=true;
  h.context.tickPlayerFootsteps(1/60,1000/60);
  assert.equal(h.events.length,0);assert.equal(h.context.playerFootTravel.length,0);
  assert.equal(h.updates.at(-1).paused,false);
  h.context.playSceneFootContact({owner:'source-continuation',surface:'cold-stone',profile:'physical',level:.12});
  assert.equal(h.events.length,1);assert.equal(h.events[0].owner,'source-continuation');
});

test('the main support adapter distinguishes code tones from remembered street, absence, tape and living bus footing',()=>{
  const h=harness();h.model.source=true;
  for(const [material,tone]of[[MATERIAL.sourceField,'field'],[MATERIAL.sourcePath,'path'],[MATERIAL.sourceFault,'fault']]){
    h.model.material=material;const d=h.context.playerFootingAt();assert.equal(d.profile,'compiled');assert.equal(d.tone,tone);
  }
  h.model.material=MATERIAL.sourceVoid;h.model.horizon={active:true,preTape:true};
  assert.equal(h.context.playerFootingAt(0,75).profile,'glazed');
  assert.equal(h.context.playerFootingAt(0,25).surface,'tarmac');
  h.model.horizon={active:true,onTape:true};assert.equal(h.context.playerFootingAt().profile,'erased');
  h.model.bus={inside:true};assert.equal(h.context.playerFootingAt().surface,'metal');
  h.model.body={active:true};assert.equal(h.context.playerFootingAt().surface,'body');
  h.model.body=null;h.model.bus=null;h.model.horizon={active:false};h.model.shore={active:true,surface:'ledge'};
  assert.equal(h.context.playerFootingAt().surface,'stone');
  h.model.shore={active:true,surface:'void'};assert.equal(h.context.playerFootingAt().profile,'glazed');
});

test('current Divide support tightens by actual depth and locks on its final rise',()=>{
  const h=harness();h.model.source=true;h.model.material=MATERIAL.sourceField;h.model.divide=true;
  const atDepth=depth=>h.context.playerFootingAt(0,(SOURCE_BRAIDED_DIVIDE.frontZ-depth)/.5);
  const entry=atDepth(0),middle=atDepth(97.5),final=atDepth(118);
  assert.equal(entry.sourceDomain,'compiled-divide');assert.equal(entry.humanize,1);
  assert.equal(middle.gaitTreatment,'natural');assert.equal(middle.humanize,.45);
  assert.equal(final.gaitTreatment,'locked');assert.equal(final.humanize,0);
  h.model.divide=false;h.model.apron=true;
  assert.equal(atDepth(148).gaitTreatment,'locked');
  h.model.apron=false;h.model.divide=true;
  // A Source physical encounter retains its material even in these coordinates.
  h.model.body={active:true,progress:.8};
  assert.equal(atDepth(140).gaitTreatment,'resistance');
  h.model.body=null;h.model.bus={inside:true};
  assert.equal(atDepth(140).gaitTreatment,'natural');assert.equal(atDepth(140).surface,'metal');
});

test('real textile footprints and interior station floors override broad wall/realm labels',()=>{
  const h=harness();h.model.material=MATERIAL.academicPlaster;
  assert.equal(h.context.playerFootingAt().surface,'wood');h.model.soft=.7;
  assert.equal(h.context.playerFootingAt().surface,'carpet');
  h.model.source=true;h.model.material=MATERIAL.sourceVoid;h.model.realm={world:'whiteout',stage:'outside'};
  assert.equal(h.context.playerFootingAt().surface,'snow');
  h.model.realm.stage='inside';assert.equal(h.context.playerFootingAt().surface,'wood');
});

test('explicit scene contacts retain Source IV glazed and coast physical identities',()=>{
  const h=harness();
  h.context.playSceneFootContact({owner:'source-IV',surface:'source-code',profile:'glazed',level:.09});
  assert.equal(h.events[0].surface,'tile');assert.equal(h.events[0].profile,'glazed');
  h.context.playSceneFootContact({owner:'coastal-memory',surface:'coastal-earth',profile:'physical',level:.14});
  assert.equal(h.events[1].surface,'earth');assert.equal(h.events[1].profile,'physical');
  h.context.paused=true;h.context.playSceneFootContact({owner:'coastal-memory',surface:'coastal-earth',profile:'physical'});
  assert.equal(h.events.length,2);
});

function acceptedStepHarness({zero=false,onboarding=false,drag=false}={}){
  const start=source.indexOf('  const stairFootContact=mainStairMoveTouches(');
  const end=source.indexOf('  // An edge portal changes logical drawings',start);
  assert.ok(start>=0&&end>start);
  const receipts=[],queued=[],marked=[];
  const c=vm.createContext({px:2,py:3,dx:zero?0:1,dy:0,planRedirect:null,storyMode:true,nowMs:1000,
    mainStairMoveTouches:()=>false,window:{},RENDERER:'3d',isHorrorActive:()=>false,depth:0,
    isOnboardingActive:()=>onboarding,canMoveInOnboarding:()=>false,
    escape:drag?{kind:'cathedral-carry',drag:{gripped:true}}:null,
    draggedPayloadStep:()=>({allowed:false}),performance:{now:()=>1000},SPEECH:{say:()=>{}},
    activeGeometry:()=>null,PROPS:{propCanOccupy:()=>true},REC:{emitStepNoise:(x,y)=>{receipts.push({x,y});return .22;}},
    sprungFloorAt:()=>1,natatoriumPlayerInWater:()=>false,natatoriumSoaked:()=>false,
    sourceShoreSensoryFrame:()=>({active:false,footstepGain:1}),chunkSurfRuntime:null,stationFootfall:()=>null,
    playerFootingAt:()=>({surface:'wood',profile:'physical',owner:'test',supported:true}),softFloorMuffle:()=>0,
    usingSourceSpace:()=>false,outskirtsLosing:()=>0,outskirtsStepIndex:0,usingStairAnomaly:()=>false,
    playerFootIndex:0,RT:{prepareFootsteps:()=>{}},queuePlayerFootTravel:(...args)=>queued.push(args),
    usingPlan:()=>true,usingSpecialSpace:()=>false,MUT:{markHeard:(...args)=>marked.push(args)},
  });
  vm.runInContext(`function attempt(){${source.slice(start,end)}return true;}`,c);
  return{c,receipts,queued,marked};
}

test('late movement refusals produce no canonical step receipt, wet/scuff sound or heard mutation',()=>{
  for(const mode of [{zero:true},{onboarding:true},{drag:true}]){
    const h=acceptedStepHarness(mode);h.c.attempt();
    assert.equal(h.receipts.length,0,JSON.stringify(mode));assert.equal(h.queued.length,0);assert.equal(h.marked.length,0);
  }
  const h=acceptedStepHarness();assert.equal(h.c.attempt(),true);
  assert.deepEqual(h.receipts,[{x:2,y:3}]);assert.equal(h.queued.length,1);assert.equal(h.marked.length,1);
});

test('owned scene adapters and authored tread contacts use the shared player without duplicate legacy IV steps',()=>{
  for(const name of ['createCoastalMemoryScene','createSourceEarthfallScene','createSourceIVScene']){
    const at=source.indexOf(`scene=${name}(`);
    assert.match(source.slice(at,at+340),/onFootContact:playSceneFootContact,clearFootContacts:clearSceneFootContacts/);
  }
  const continuation=source.match(/sourceContinuationAudio \|\|= createSourceContinuationAudio\(\{\s*onFootContact:playSceneFootContact/g)||[];
  assert.equal(continuation.length,2);
  assert.match(production('advanceMainStairRenderMove'),/RT\.footstep\(move\.footfall\.level,\{\.\.\.move\.footfall\}\)/);
  assert.doesNotMatch(source,/setTimeout\(\(\)=>RT\.footstep\(scuff/);
});
