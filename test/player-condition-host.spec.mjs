import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { playerCondition } from '../src/game/player-condition.js';
import { createPlayerConditionFeedback } from '../src/game/player-condition-feedback.js';
import { fieldDeckLayout } from '../src/render/hud-layout.js';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const combat = readFileSync(new URL('../src/game/combat.js', import.meta.url), 'utf8');
function productionFunction(name) {
  const start = main.indexOf(`function ${name}(`);
  const end = main.indexOf('\nfunction ', start + 1);
  assert.ok(start >= 0 && end > start, `${name} is available`);
  return main.slice(start, end);
}

function host() {
  const body = {value:40, ceiling:40, injuries:0};
  let listener;
  const context = {
    playerCondition, createPlayerConditionFeedback,
    REC:{COMPOSURE_BASE:40, composure:()=>body.value, composureCeiling:()=>body.ceiling,
      recState:()=>({injuries:body.injuries})},
    scenes:{subscribe:callback=>{listener=callback;}, suppressesHud:()=>context.hideHud},
    hideHud:false, storyMode:true, inRogue:true, paused:false,
    document:{hidden:false}, gameplayInputLifecycleActive:()=>context.active,
    active:true, save:{run:{id:'condition-run'}}, getSave:()=>context.save,
    lastExposureEvent:null, fear:0,
  };
  for (const name of ['activeEndingCutscene','sourceRestEndingMusic','sourceContinuationScene',
    'sourceDriveSession','sourcePubScene','coastalMemoryScene','stationFieldScene',
    'sourceReturnFlashbackScene','firstStrikeScene','openingVehicleScene',
    'openingOvertureScene','standingTearScene']) context[name]=null;
  const start=main.indexOf('const playerConditionFeedback=createPlayerConditionFeedback();');
  const end=main.indexOf('\nlet fakeEllerySaveTransaction',start);
  assert.ok(start>=0&&end>start,'production condition adapter is available');
  const api=runInNewContext(`${main.slice(start,end)}\n({current:currentPlayerCondition,
    tick:tickPlayerConditionFeedback, telemetry:playerConditionTelemetry,
    suppressed:playerConditionPresentationSuppressed});`,context);
  return {body, context, ...api, emit:(reason,scene)=>listener({reason,scene})};
}

test('combat condition changes only when the real resolution reaches contact', () => {
  const start=combat.indexOf('    conditionView() {');
  const end=combat.indexOf('\n    textReviewSuspend()',start);
  assert.ok(start>=0&&end>start,'combat publishes its condition');
  const state={composure:31,maxComposure:50,injuries:1,techniques:['deep-reserve'],
    definition:{baseComposure:40},difficulty:{composureBonus:5},sourceDesktop:null};
  const context={state,resolution:{before:{composure:43,maxComposure:50},impactFired:false},GRID:5};
  const view=runInNewContext(`({${combat.slice(start,end)}}).conditionView`,context);
  assert.equal(view().composure,43,'precomputed damage is not an early visible hit');
  assert.equal(view().ceiling,50);
  assert.equal(view().baseline,55,'combat reserve and difficulty remain visible');
  context.resolution.impactFired=true;
  assert.equal(view().composure,31,'the committed contact exposes the live battle value');
  state.composure=0;
  assert.equal(view().composure,0,'a real combat defeat is not clamped to the world reserve');
});

test('combat captions and the condition rail agree at contact rather than anticipating a hit', () => {
  const start=combat.indexOf('  function visualState()');
  const end=combat.indexOf('\n  const scene =',start);
  const context={state:{composure:20,maxComposure:35},resolution:{elapsed:.75,duration:1,
    impactFired:false,before:{composure:35,maxComposure:35,movementIndex:0,movementCoherence:25,movementMaxCoherence:25},
    after:{composure:20,last:{},movementCoherence:25}},ease:t=>t,lerp:(a,b,t)=>a+(b-a)*t};
  const view=runInNewContext(`${combat.slice(start,end)}\nvisualState`,context);
  assert.equal(view().composure,35,'even a late pre-contact frame retains the unspent value');
  context.resolution.impactFired=true;
  assert.equal(view().composure,20,'the contact exposes the actual loss, not an intermediate number');
  assert.equal(view().maxComposure,35);
});

test('the main adapter follows the live battle through an overlaid menu without a false hit', () => {
  const h=host();h.tick(0);
  const live={composure:29,ceiling:45,baseline:50,injuries:1};
  const battle={conditionView:()=>live};
  h.emit('push',battle);
  assert.equal(h.tick(0).event,null,'entering a fight is not damage');
  assert.equal(h.current().value,29);
  assert.equal(h.current().ceiling,45);
  assert.equal(h.current().capacityLoss,5);
  h.emit('push',{id:'pause'});
  assert.equal(h.current().value,29,'a menu does not replace the battle body with stale REC data');
  live.composure=25;
  assert.equal(h.tick(0).event.damage,4);
  h.emit('remove',battle);
  assert.equal(h.tick(0).event,null,'return to the world is a change of authority');
  assert.equal(h.current().value,40);
});

test('loading a run and inactive resource changes do not manufacture a new injury cue', () => {
  const h=host();h.body.value=24;h.body.ceiling=30;h.body.injuries=2;
  assert.equal(h.tick(0).event,null,'the first observation is the loaded condition');
  for(const pause of ['paused','hidden','inactive']){
    h.context.paused=pause==='paused';h.context.document.hidden=pause==='hidden';h.context.active=pause!=='inactive';
    h.body.value-=1;
    assert.equal(h.tick(50).event,null);
    h.context.paused=false;h.context.document.hidden=false;h.context.active=true;
    assert.equal(h.tick(0).event,null,'resume cannot replay an unseen state write');
  }
  h.body.value=20;h.body.ceiling=25;h.body.injuries=3;h.context.save.run.id='another-run';
  assert.equal(h.tick(0).event,null,'a new save identity creates a new baseline');
});

test('replacing or clearing a combat owner cannot leave a stale body behind', () => {
  const h=host();h.tick(0);
  const oldBattle={conditionView:()=>({composure:32,ceiling:40,baseline:40,injuries:0})};
  const nextBattle={conditionView:()=>({composure:12,ceiling:30,baseline:40,injuries:2})};
  h.emit('push',oldBattle);h.tick(0);
  h.emit('replace',nextBattle);
  assert.equal(h.tick(0).event,null,'a different battle is not a twenty-point hit');
  assert.equal(h.current().value,12);
  h.emit('remove',oldBattle);
  assert.equal(h.current().value,12,'an old exit callback cannot remove the replacement owner');
  h.emit('clear');
  assert.equal(h.tick(0).event,null);
  assert.equal(h.current().owner,'world');assert.equal(h.current().value,40);
});

test('fear alone cannot spend composure or create hurt feedback', () => {
  const h=host();h.tick(0);h.context.fear=1;
  for(let i=0;i<10;i++){
    const frame=h.tick(.1);
    assert.equal(frame.event,null);assert.equal(frame.impact,0);assert.equal(frame.strain,0);
  }
  assert.equal(h.body.value,40);assert.equal(h.body.injuries,0);
});

test('the HUSH scare preserves one committed injury notice without repeating its impact', () => {
  const h=host();h.tick(0);h.context.lastExposureEvent={hushCatch:true};
  h.body.injuries=1;h.body.ceiling=35;h.body.value=35;
  const first=h.tick(0);
  assert.equal(first.event.kind,'injury');assert.equal(first.event.injuriesAdded,1);
  const covered=h.tick(.72);
  assert.equal(covered.event.serial,first.event.serial);assert.equal(covered.eventAge,0);
  assert.equal(covered.impact,0,'the brief impact runs during the existing contact presentation');
  h.context.lastExposureEvent=null;
  const returned=h.tick(.02),telemetry=h.telemetry();
  assert.equal(returned.event.serial,first.event.serial);assert.equal(returned.impact,0);
  assert.ok(telemetry.conditionEventAge>0);
  assert.equal(telemetry.conditionEvent.capacityLost,5);
  assert.equal(telemetry.condition.ceiling,35);
});

test('authored Source and ending owners retire generic injury feedback', () => {
  for(const name of ['sourceContinuationScene','sourceRestEndingMusic','activeEndingCutscene',
    'firstStrikeScene','standingTearScene']){
    const h=host();h.tick(0);h.body.value=35;assert.equal(h.tick(0).event.kind,'damage');
    h.context[name]={};assert.equal(h.suppressed(),true);assert.equal(h.tick(.1).event,null);
    h.context[name]=null;assert.equal(h.tick(.1).event,null,'leaving an authored shell cannot replay its damage');
  }
  const h=host(),live={composure:20,ceiling:40,baseline:40,injuries:0,authored:true};
  h.emit('push',{conditionView:()=>live});assert.equal(h.suppressed(),true);
});

test('both production navigator paths receive the same condition and injury receipt', () => {
  const condition=playerCondition({composure:25,ceiling:35,injuries:1});
  const telemetry={condition,conditionEvent:{kind:'damage',damage:10},conditionEventAge:.3};
  const save={run:{id:'hud-condition',status:'active',ledger:{}},flags:{'bag.taken':true,'map.taken':true}};
  const maps=[],context={
    getSave:()=>save,scenes:{top:()=>null,blocksWorld:()=>false,suppressesHud:()=>false},
    faceplateUsesCurrentRunModules:()=>false,scenePresentationHidesWorld:()=>false,
    storyMode:true,inRogue:true,FP:{isLoaded:()=>false},usingSpecialSpace:()=>false,
    towerWarningOwnsMoment:()=>false,frontEndSession:null,px:0,py:0,
    REC:{recState:()=>({injuries:1,takes:[]}),isRecording:()=>false,batteryLevel:()=>1,isListening:()=>true},
    flagTest:()=>true,mapAcquired:()=>true,mapAvailable:()=>true,itemLost:()=>false,
    currentFacilityMapModel:()=>({}),readOnlyBagMap:value=>value,paused:false,document:{hidden:false},
    gameplayInputLifecycleActive:()=>true,performance:{now:()=>1000},nightClockReadout:()=>({}),
    recentMischief:()=>[],recentApparitions:()=>[],workOrderAccepted:()=>false,
    playerConditionTelemetry:()=>telemetry,monitorDisplaySnapshot:()=>({}),dockCommandUntil:0,
    activeDifficulty:{navigation:{showMap:true}},lastExposureEvent:null,faceplateModuleStatus:()=>({enabled:false}),
    usingSourceSpace:()=>false,usingPlan:()=>false,towerPersonalHud:null,
    uiSize:()=>({cols:128,rows:50}),fieldDeckLayout,currentStoryGuidanceFrame:()=>({target:null}),
    fieldInventoryVisible:()=>false,drawMinimap:(map,options)=>maps.push(options),storyGuidanceBearing:()=>null,KEY_DEBUG:false,
    chapelTowerState:()=>({phase:'recording'}),chunkSurfFinaleRouting:()=>({route:null}),
    SOURCE_FINALE_ROUTE:{TOWER:'tower'},CHAPEL_TOWER_PHASE:{},
  };
  for(const name of ['openingVehicleScene','openingOvertureScene','studentStrikeScene','activeEndingCutscene',
    'standingTearScene','sourceDriveSession','coastalMemoryScene','stationFieldScene',
    'sourceReturnFlashbackScene','firstStrikeScene'])context[name]=null;
  const result=runInNewContext(`${productionFunction('sharedFaceplateContext')}\n${productionFunction('drawStoryHud')}
    const shared=sharedFaceplateContext();drawStoryHud();({shared});`,context);
  assert.equal(result.shared.enabled,true);
  assert.equal(result.shared.telemetry.condition,condition);
  assert.equal(result.shared.telemetry.conditionEvent,telemetry.conditionEvent);
  assert.equal(maps.length,1);
  assert.equal(maps[0].telemetry.condition,condition);
  assert.equal(maps[0].telemetry.conditionEvent,telemetry.conditionEvent);
});
