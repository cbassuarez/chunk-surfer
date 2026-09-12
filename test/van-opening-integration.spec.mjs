import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { freshSave } from '../src/game/save.js';
import { freshMeta, freshRunRecord } from '../src/progression/schema.js';
import { prepareVanDifficultyFinalization } from '../src/progression/van-preparation.js';
import { normalizeFieldKit, normalizeFieldKitOwnership, fieldKitInspection, resolveFieldKit, fieldKitCosmeticSelection } from '../src/game/field-kit.js';
import { witnessEditionStatus } from '../src/progression/unlocks.js';
import { mapAcquired, mapAvailable } from '../src/game/map-ownership.js';
import { normalizeEquipment } from '../src/game/bag-model.js';
import { resolveBagOwnership, resolveBagItemAction, BAG_AUTOMATIC_USE, bagKeyFacts } from '../src/game/bag-items.js';
import { BENCH_PACK_GROUPS, prepareWorkbenchFlags, packedWorkbenchGroups, packWorkbenchGroup,
  workbenchPackingComplete } from '../src/game/bench-preparation.js';

const main=readFileSync('src/main.js','utf8');
const section=(start,end)=>{
  const at=main.indexOf(start),until=main.indexOf(end,at+start.length);
  assert.ok(at>=0&&until>at,`${start} exists before ${end}`);
  return main.slice(at,until);
};
const workbenchSource=section('function takeTheBag(){','function finishVanPacking(){');
const packingSource=section('function finishVanPacking(){','// THE VAN\'S REAR LEAVES.');

function fixture({legacy=false}={}){
  const saved=freshSave({run:freshRunRecord({now:1000,id:'opening-run'})});
  saved.flags=normalizeFieldKitOwnership(legacy?{'bag.taken':true}:{'van.preparation.v1':true,'van.difficulty.pending':true});
  const calls={events:[],cues:[],speech:[],dialogue:[],applied:0,finalized:0,shut:0,spanners:0,plantSaves:0};
  let spannerOwned=false;
  const stack=new Map();
  const meta=freshMeta();
  const context={
    getSave:()=>saved,getMeta:()=>meta,metaCommit:patch=>Object.assign(meta,patch),flagTest:(id)=>!!saved.flags[id],
    flagSet:(id)=>{saved.flags[id]=true;},flagApply:(ids)=>{for(const id of ids)saved.flags[id]=true;},
    saveCommit:(patch)=>Object.assign(saved,patch),normalizeFieldKit,mapAcquired,fieldKitInspection,normalizeEquipment,
    resolveFieldKit,fieldKitCosmeticSelection,witnessEditionStatus,inspectCarriedWitness:()=>false,inspectWitnessRecorder(){},
    prepareWorkbenchFlags,packedWorkbenchGroups,packWorkbenchGroup,workbenchPackingComplete,
    shakeMode:()=> 'full',
    SPEECH:{say:(line)=>calls.speech.push(line)},ensureCtx(){},resetMotionInput(){},
    fireCue:(id)=>calls.cues.push(id),setRecorderAppearance(){},
    scenes:{has:(id)=>stack.has(id),push:(scene)=>stack.set(scene.id,scene),remove:(id)=>stack.delete(id)},
    makeVanWorkbenchScene:(options)=>({id:'van-workbench',...options}),
    makeDifficultySelectScene:(options)=>({id:'difficulty-select',...options}),
    makeItemInspectionScene:(entry)=>({id:'item-inspection',entry}),
    finalizeVanDifficulty:()=>{calls.finalized++;const result=prepareVanDifficultyFinalization(saved,undefined,freshMeta(),2000);if(result.ok)Object.assign(saved,result.patch);return result;},
    progressionEvents:{emit:(event)=>calls.events.push(event)},
    applyCurrentRunDifficulty:()=>calls.applied++,applyAudioSettings(){},
    think:(id,tree,options)=>calls.dialogue.push({id,options}),VAN_KIT_THOUGHT:{},
    PLANT:{hasPlantSpanner:()=>spannerOwned,collectPlantSpanner:()=>{calls.spanners++;spannerOwned=true;return true;}},
    syncPlantIncidentProps(){},savePlantIncident(){calls.plantSaves++;},
    shutTheVan:()=>{calls.shut++;saved.flags['van.closed']=true;},
  };
  vm.createContext(context);vm.runInContext(workbenchSource+packingSource,context);
  return {saved,meta,calls,stack,context,open:()=>context.takeTheBag()};
}

test('new-run startup enters a pending van run without presenting or committing the title difficulty selector',()=>{
  const startup=section('function beginNewGameFlow(','function enterSelectedRun(');
  assert.match(startup,/newGame\(\{prepareInVan:true,launchPlan\}\)/);
  assert.match(startup,/enterSelectedRun\(/);
  assert.doesNotMatch(startup,/makeDifficultySelectScene|beginRunProgression\(/);
  assert.match(workbenchSource,/onChooseDifficulty:[\s\S]*makeDifficultySelectScene/);
});

test('case and Survey Indicator are separate physical pickups; neither silently chooses difficulty',()=>{
  const f=fixture();f.open();let scene=f.stack.get('van-workbench');
  assert.equal(scene.onContinue(),false);
  scene.onTakeCase();assert.equal(f.saved.flags['bag.taken'],true);
  assert.equal(f.saved.flags['kit.taken'],true);assert.equal(mapAcquired(f.saved.flags),false);
  assert.equal(scene.onContinue(),false);
  scene.onTakeMap();assert.equal(mapAcquired(f.saved.flags),true);
  assert.equal(scene.onContinue(),false);
  assert.equal(f.calls.finalized,0);assert.equal(f.saved.flags['kit.fitted'],undefined);
  scene.onClose();f.open();scene=f.stack.get('van-workbench');
  assert.equal(scene.getState().bagTaken,true);assert.equal(scene.getState().mapTaken,true);
  assert.equal(scene.getState().difficultyConfirmed,false);
  assert.equal(f.calls.dialogue.length,0);
});

test('difficulty can be revised while fitting, and only Continue finalizes one RUN_STARTED event',()=>{
  const f=fixture();f.open();const scene=f.stack.get('van-workbench');
  scene.onTakeCase();scene.onTakeMap();
  scene.onChooseDifficulty();f.stack.get('difficulty-select').onConfirm({preset:'night'});
  assert.equal(f.saved.run.rules.startedPreset,'contract');assert.equal(f.saved.flags['kit.fitted'],undefined);
  scene.onChooseDifficulty();assert.equal(f.stack.get('difficulty-select').initialPreset,'night');
  f.stack.get('difficulty-select').onConfirm({preset:'story'});
  scene.onKitChange({headphones:'closed',cosmetics:{faceplate:'olive'}},{group:'headphones'});
  assert.equal(f.saved.fieldKit.headphones,'closed');
  assert.equal(scene.onContinue(),false,'the other three hardware families are still on the bench');
  for(const group of BENCH_PACK_GROUPS.filter(group=>group!=='headphones'))scene.onKitChange(f.saved.fieldKit,{group});
  assert.deepEqual(Array.from(scene.getState().packedGroups),BENCH_PACK_GROUPS);
  assert.equal(scene.onContinue(),true);
  assert.equal(f.saved.run.rules.startedPreset,'story');assert.equal(f.saved.flags['kit.fitted'],true);
  assert.equal(f.calls.events.length,1);assert.equal(f.calls.events[0].payload.preset,'story');
  assert.equal(f.saved.run.ledger.seq,1);assert.equal(f.calls.finalized,1);
  assert.equal(f.stack.has('van-workbench'),false);assert.equal(f.calls.dialogue.length,1);
  assert.equal(f.calls.shut,0,'packing narration is not skipped');
  f.calls.dialogue[0].options.onDone();assert.equal(f.calls.shut,1);
  f.open();assert.equal(f.calls.finalized,1);assert.equal(f.calls.events.length,1);
});

test('legacy bag continues its existing shelf/door flow without losing map or rewriting difficulty',()=>{
  const f=fixture({legacy:true});const before=structuredClone(f.saved.run.rules);
  f.open();assert.equal(f.stack.has('van-workbench'),false);
  assert.equal(mapAcquired(f.saved.flags),true);assert.equal(f.calls.dialogue.length,1);
  f.calls.dialogue[0].options.onDone();assert.equal(f.calls.shut,1);
  assert.deepEqual(f.saved.run.rules,before);assert.equal(f.calls.finalized,0);assert.deepEqual(f.calls.events,[]);
});

test('workbench inspection resolves the selected physical variant and shows workbench rather than carried position',()=>{
  const f=fixture();f.open();const scene=f.stack.get('van-workbench');
  assert.equal(scene.getState().reduceMotion,false);
  f.context.shakeMode=()=> 'off';assert.equal(scene.getState().reduceMotion,true);
  for(const [group,variant] of [['headphones','closed'],['headphones','open'],['microphone','directional'],['microphone','wide'],['recorder','headroom']]){
    const kit={...f.saved.fieldKit,[group]:variant};f.saved.fieldKit=kit;
    const id=group==='recorder'?'recorder':`${group}-${variant}`;
    scene.onInspect(id);
    const entry=f.stack.get('item-inspection').entry;
    assert.equal(entry.sourceId,id);assert.equal(entry.id,`gear:${id}`);
    assert.equal(entry.description,fieldKitInspection(kit,group).description);
    assert.equal(entry.facts.find(([label])=>label==='POSITION')[1],'VAN WORKBENCH');
    assert.equal(f.saved.flags['bag.taken'],undefined,'inspection does not acquire equipment');
  }
  scene.onInspect('map');assert.equal(f.stack.get('item-inspection').entry.sourceId,'map');
  f.stack.delete('item-inspection');scene.onInspect('headphones-counterfeit');
  assert.equal(f.stack.has('item-inspection'),false);
});

test('unselected bench variants inspect their own exact stats and never silently fit or pack',()=>{
  const f=fixture();f.open();const scene=f.stack.get('van-workbench');
  f.saved.fieldKit=normalizeFieldKit({headphones:'reference',microphone:'reference',recorder:'reference',flashlight:'reference',
    cosmetics:{flashlightHousing:'olive'}});
  const before=structuredClone(f.saved.fieldKit);
  for(const [id,group,variant] of [['headphones-closed','headphones','closed'],['microphone-wide','microphone','wide'],
    ['amp-headroom','amp','headroom'],['amp-low-draw','amp','low-draw'],['flashlight-throw','flashlight','throw'],['flashlight-flood','flashlight','flood']]){
    scene.onInspect(id);const entry=f.stack.get('item-inspection').entry;
    const kit={...before,[group==='amp'?'recorder':group]:variant};
    assert.equal(entry.sourceId,id);assert.equal(entry.description,fieldKitInspection(kit,group).description);
    assert.equal(entry.facts.find(([key])=>key==='POSITION')[1],'VAN WORKBENCH');
    if(group==='flashlight')assert.equal(entry.source.materialColors['flashlight-housing'],'#686c48');
    assert.deepEqual(f.saved.fieldKit,before);assert.deepEqual(Array.from(scene.getState().packedGroups),[]);
  }
  scene.onInspect('plant-spanner');assert.equal(f.stack.get('item-inspection').entry.sourceId,'plant-spanner');
  assert.equal(scene.getState().spannerTaken,false);
  for(const id of ['amp-forged','flashlight-forged']){f.stack.delete('item-inspection');scene.onInspect(id);assert.equal(f.stack.has('item-inspection'),false);}
});

test('production fitting checks current ownership and persists only an authorized cosmetic preference',()=>{
  const f=fixture();f.open();const scene=f.stack.get('van-workbench');
  const kit=normalizeFieldKit({headphones:'closed',microphone:'wide',recorder:'headroom',
    cosmetics:{faceplate:'witness',buttons:'sea-glass',vfd:'ice'}});
  const initial=structuredClone(f.saved.fieldKit);
  assert.equal(scene.onKitChange(kit),false,'no case cannot fit');
  scene.onTakeCase();f.meta.endingsSeen=['sacrifice'];
  assert.equal(scene.onKitChange(kit),false,'one ending cannot fit');
  assert.deepEqual(f.saved.fieldKit,initial);
  f.meta.endingsSeen=['sacrifice','helped'];
  assert.equal(scene.getState().witness.owned,true);
  assert.equal(scene.onKitChange(kit),true);
  assert.deepEqual(f.saved.fieldKit,kit);
  assert.equal(f.meta.cosmetics.selected,'witness');
  assert.ok(f.meta.cosmetics.unlocked.includes('witness'));
});

test('the optional bench spanner uses real plant ownership and never appears as a second dialogue choice',()=>{
  const f=fixture();f.open();const scene=f.stack.get('van-workbench');
  assert.equal(scene.getState().spannerTaken,false);
  assert.equal(scene.onSpannerChoice(true),false,'case must be acquired first');
  assert.equal(f.calls.spanners,0);assert.equal(f.saved.flags['van.spanner.decided'],undefined);
  assert.equal(scene.onSpannerChoice(false),true);
  assert.equal(scene.getState().spannerDecided,true);assert.equal(scene.getState().spannerTaken,false);
  assert.equal(f.calls.spanners,0);assert.equal(f.calls.plantSaves,0);
  scene.onTakeCase();assert.equal(scene.onSpannerChoice(true),true);
  assert.equal(scene.getState().spannerTaken,true);assert.equal(f.saved.flags['van.spanner.taken'],true);
  assert.equal(f.calls.spanners,1);assert.equal(f.calls.plantSaves,1);
  scene.onClose();f.open();assert.equal(f.stack.get('van-workbench').getState().spannerTaken,true,'reopening keeps the actual tool');
  f.saved.flags['van.closed']=true;assert.equal(scene.onSpannerChoice(true),false);assert.equal(f.calls.spanners,1);
  assert.doesNotMatch(packingSource,/spanner|collectPlantSpanner/,'post-packing dialogue no longer grants or offers the tool');
  const story=JSON.parse(readFileSync('content/narrative/conservatory.van_kit.story.json','utf8'));
  assert.doesNotMatch(JSON.stringify(story.nodes),/spanner/i,'player-facing dialogue no longer offers the spanner');
});

test('production carried WITNESS inspection is read-only and never redirects a missing or ordinary recorder',()=>{
  const f=fixture(),opened=[];
  f.context.inspectWitnessRecorder=options=>opened.push(options);
  vm.runInContext(section('function inspectCarriedWitness(entry){','function takeTheBag(){'),f.context);
  const entry={sourceId:'recorder',id:'gear:recorder',present:true};
  assert.equal(f.context.inspectCarriedWitness(entry),false);
  f.meta.endingsSeen=['sacrifice','helped'];
  f.saved.fieldKit=normalizeFieldKit({cosmetics:{faceplate:'witness'}});
  assert.equal(f.context.inspectCarriedWitness({...entry,present:false}),false);
  assert.equal(f.context.inspectCarriedWitness({sourceId:'radio'}),false);
  assert.equal(f.context.inspectCarriedWitness(entry),true);
  assert.deepEqual(opened,[undefined],'carried inspection receives no fit callback');
  assert.match(main,/onInspectEquipment:inspectCarriedWitness/);
});

test('actual bag equipment exposes fitted variants only with case ownership and keeps them noncombat',()=>{
  const f=fixture(),missing=new Set();
  Object.assign(f.context,{
    PLANT:{plantIncidentState:()=>({spannerOwned:false})},resolveBagOwnership,resolveBagItemAction,BAG_AUTOMATIC_USE,bagKeyFacts,
    CHUNK_SURF_FLAGS:{fork:'source.fork'},HEAD:{carryingMarbleHead:()=>false},playerKeys:new Set(),chapelKeyIsIdentified:()=>false,
    REC:{sheetsCarried:()=>0,lightOn:()=>false,isListening:()=>false,isRecording:()=>false,
      composure:()=>10,composureCeiling:()=>10,batteryLevel:()=>1},
    itemLost:(id)=>missing.has(id),activeBattleId:null,usingSpecialSpace:()=>false,
    RADIO:{isDropped:()=>false,isDead:()=>false,radioPresentation:()=>({phase:'READY',activity:'IDLE'}),
      pendingRadioCue:()=>null,activeRadioCue:()=>null,radioCalling:()=>false},
  });
  f.context.scenes.top=()=>null;f.context.SPEECH.isSpeaking=()=>false;
  vm.runInContext(section('function bagEquipment(){','function moveBagCombatEquipment('),f.context);
  f.saved.fieldKit=normalizeFieldKit({headphones:'open',microphone:'wide',recorder:'low-draw',flashlight:'throw',
    cosmetics:{flashlightHousing:'ivory'}});
  assert.equal(f.context.bagEquipment().length,0,'nothing is granted merely by selecting hardware');
  f.saved.flags['bag.taken']=true;f.saved.flags['kit.fitted']=true;
  let items=f.context.bagEquipment();
  assert.deepEqual(Array.from(items,item=>item.id),['light','recorder','headphones-open','microphone-wide','amp-low-draw','radio']);
  for(const id of ['headphones-open','microphone-wide','amp-low-draw']){
    const part=items.find(item=>item.id===id);
    assert.equal(part.present,true);assert.equal(part.battleCapable,false);
    assert.equal(part.value,'FITTED');assert.equal(part.automaticUse,null);
    assert.equal(normalizeEquipment(part).sourceId,id);
  }
  assert.equal(items.find(item=>item.id==='recorder').title,'FIELD RECORDER');
  assert.equal(items.find(item=>item.id==='recorder').battleCapable,true);
  const torch=items.find(item=>item.id==='light');
  assert.equal(torch.modelId,'flashlight-throw');assert.equal(torch.materialColors['flashlight-housing'],'#c5c5ad');
  assert.equal(torch.battleCapable,true);assert.match(torch.description,/25% farther/);
  f.saved.flags['map.taken']=true;assert.ok(f.context.bagEquipment().some(item=>item.id==='map'));
  missing.add('recorder');items=f.context.bagEquipment();
  for(const id of ['recorder','headphones-open','microphone-wide','amp-low-draw']){
    const part=items.find(item=>item.id===id);
    assert.equal(part.present,false);assert.equal(part.value,'MISSING');
    assert.equal(part.facts.find(([label])=>label==='POSITION')[1],'NOT CARRIED');
  }
});

test('automatic closing still plays the latch only when the physical leaves land',()=>{
  const shut=section('function shutTheVan(){','// WHERE THE PLAYER IS STANDING');
  const tick=section('function tickVanDoors(){','// The interior lamp exists');
  assert.match(packingSource,/onDone:\(\)=>\{\s*shutTheVan\(\)/);
  assert.match(shut,/vanDoors\.closingAtMs=performance\.now\(\)/);
  assert.doesNotMatch(shut,/fireCue\(['"]door['"]\)/);
  const calls=[],state={closed:false},vanDoors={closingAtMs:0,landed:false};let now=10,open=1;
  const context={vanDoors,flagTest:()=>state.closed,flagSet:()=>state.closed=true,getSave:()=>({flags:{}}),saveCommit(){},
    performance:{now:()=>now},SPEECH:{say(){}},vanDoorOpenFraction:()=>open,fireCue:(id)=>calls.push(id),syncVanProps(){},refreshWorldProps(){}};
  vm.createContext(context);vm.runInContext(shut+tick,context);
  context.shutTheVan();assert.deepEqual(calls,[]);context.tickVanDoors();assert.deepEqual(calls,[]);
  now=2000;open=0;context.tickVanDoors();context.tickVanDoors();assert.deepEqual(calls,['door']);
});

test('lodge and world guidance preserve the separate map/fitting firewall',()=>{
  const lodge=section('function talkToTheLodge(){','function ');
  assert.match(lodge,/van\.preparation\.v1/);assert.match(lodge,/!flagTest\('van.closed'\)/);
  assert.match(main,/kitReady:!flagTest\('van.preparation.v1'\)\|\|\(mapAcquired\(getSave\(\).flags\)&&flagTest\('kit.fitted'\)\)/);
  const story=JSON.parse(readFileSync('content/narrative/conservatory.van_kit.story.json','utf8'));
  assert.equal(story.entry,'start');assert.ok(story.nodes.hub);assert.ok(story.nodes.leave);
  assert.doesNotMatch(JSON.stringify(story),/"set"\s*:\s*\[[^\]]*"(?:map.taken|kit.fitted|van.difficulty.chosen)"/,
    'prose choices cannot bypass the workbench pickup or finalization');
});

test('the actual HUD never renders a plan or minimal-signal legend before acquiring the Survey Indicator',()=>{
  const source=section('  const guidance=currentStoryGuidanceFrame();\n  const nav=activeDifficulty.navigation;',
    '  // The compass line exposes');
  for(const [owned,lost,showMap,expected] of [
    [false,false,true,'none'],[false,false,false,'none'],
    [true,false,true,'map'],[true,false,false,'minimal'],[true,true,true,'missing'],
  ]){
    const flags={'van.preparation.v1':true,'bag.taken':true,...(owned?{'map.taken':true}:{})},calls=[];
    const context={mapAvailable,getSave:()=>({flags}),itemLost:()=>lost,flagTest:id=>!!flags[id],
      currentStoryGuidanceFrame:()=>({point:{x:1,y:1},target:{id:'story:yard-van'}}),
      activeDifficulty:{navigation:{showMap}},deck:{navigator:{},objective:{x:0,y:0}},
      drawMinimap:()=>calls.push('map'),currentFacilityMapModel:()=>({}),performance:{now:()=>0},
      recentMischief:()=>[],recentApparitions:()=>[],uiText:(_x,_y,text)=>calls.push(text.includes('MISSING')?'missing':'minimal')};
    vm.createContext(context);vm.runInContext(source,context);
    assert.deepEqual(calls,expected==='none'?[]:[expected],`${owned}/${lost}/${showMap}`);
  }
});
