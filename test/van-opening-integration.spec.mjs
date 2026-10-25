import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {vanRearStockState} from '../src/data/van-rear-stock.js';
import { freshSave } from '../src/game/save.js';
import { freshMeta, freshRunRecord } from '../src/progression/schema.js';
import { prepareVanDifficultyFinalization } from '../src/progression/van-preparation.js';
import { normalizeFieldKit, normalizeFieldKitOwnership, fieldKitInspection, fieldKitOptionAvailability, resolveFieldKit, fieldKitCosmeticSelection } from '../src/game/field-kit.js';
import { witnessEditionStatus } from '../src/progression/unlocks.js';
import { mapAcquired, mapAvailable } from '../src/game/map-ownership.js';
import { normalizeEquipment } from '../src/game/bag-model.js';
import { resolveBagOwnership, resolveBagItemAction, BAG_AUTOMATIC_USE, bagKeyFacts } from '../src/game/bag-items.js';
import { BENCH_PACK_GROUPS, prepareWorkbenchFlags, packedWorkbenchGroups, packWorkbenchGroup,
  workbenchPackingComplete } from '../src/game/bench-preparation.js';
import { offeredVanPreparation,prepareVanCaseTake,vanWorkbenchNotesTree,persistVanPreparation } from '../src/game/van-workbench-preparation.js';

const main=readFileSync('src/main.js','utf8');
const section=(start,end)=>{
  const at=main.indexOf(start),until=main.indexOf(end,at+start.length);
  assert.ok(at>=0&&until>at,`${start} exists before ${end}`);
  return main.slice(at,until);
};
const workbenchSource=section('function takeTheBag(){','function finishVanPacking(){');
const persistenceSource=section('let vanPreparationWriteReceipt =','function takeTheBag(){');
const packingSource=section('function finishVanPacking(){','// THE VAN\'S REAR LEAVES.');

function fixture({legacy=false}={}){
  const saved=freshSave({run:freshRunRecord({now:1000,id:'opening-run'})});
  saved.flags=normalizeFieldKitOwnership(legacy?{'bag.taken':true}:{'van.preparation.v1':true,'van.difficulty.pending':true});
  const calls={events:[],cues:[],speech:[],dialogue:[],commits:[],saveWrites:[],profileWrites:[],applied:0,finalized:0,shut:0,spanners:0,plantSaves:0};
  let spannerOwned=false;
  const stack=new Map();
  const meta=freshMeta();
  const storage={save:structuredClone(saved),profile:structuredClone(meta),failSave:false,failProfile:false};
  const context={
    getSave:()=>saved,getMeta:()=>meta,metaCommit:patch=>Object.assign(meta,patch),flagTest:(id)=>!!saved.flags[id],
    flagSet:(id)=>{saved.flags[id]=true;},flagApply:(ids)=>{for(const id of ids)saved.flags[id]=true;},
    saveCommit:(patch)=>{calls.commits.push(structuredClone(patch));return Object.assign(saved,patch);},normalizeFieldKit,mapAcquired,fieldKitInspection,fieldKitOptionAvailability,normalizeEquipment,
    syncVanProps(){},refreshWorldProps(){},
    resolveFieldKit,fieldKitCosmeticSelection,witnessEditionStatus,inspectCarriedWitness:()=>false,inspectWitnessRecorder(){},
    prepareWorkbenchFlags,packedWorkbenchGroups,packWorkbenchGroup,workbenchPackingComplete,offeredVanPreparation,vanWorkbenchNotesTree,persistVanPreparation,
    prepareVanCaseTake:(...args)=>{const result=prepareVanCaseTake(...args);if(result.event)calls.finalized++;return result;},
    saveGameQueued:async value=>{calls.saveWrites.push(structuredClone(value));if(storage.failSave)return false;storage.save=structuredClone(value);return true;},
    saveProfileQueued:async value=>{calls.profileWrites.push(structuredClone(value));if(storage.failProfile)return false;storage.profile=structuredClone(value);return true;},
    currentStorage:()=>({loadSave:async()=>structuredClone(storage.save),loadProfile:async()=>structuredClone(storage.profile)}),
    shakeMode:()=> 'full',
    SPEECH:{say:(line)=>calls.speech.push(line)},ensureCtx(){},resetMotionInput(){},
    fireCue:(id)=>calls.cues.push(id),setRecorderAppearance(){},
    scenes:{has:(id)=>stack.has(id),push:(scene)=>stack.set(scene.id,scene),remove:(id)=>stack.delete(id),top:()=>[...stack.values()].at(-1)},
    makeVanWorkbenchScene:(options)=>({id:'van-workbench',...options}),
    makeDifficultySelectScene:(options)=>({id:'difficulty-select',...options}),
    makeItemInspectionScene:(entry)=>({id:'item-inspection',entry}),
    finalizeVanDifficulty:()=>{calls.finalized++;const result=prepareVanDifficultyFinalization(saved,undefined,freshMeta(),2000);if(result.ok)Object.assign(saved,result.patch);return result;},
    progressionEvents:{emit:(event)=>calls.events.push(event)},
    applyCurrentRunDifficulty:()=>calls.applied++,applyAudioSettings(){},
    think:(id,tree,options)=>calls.dialogue.push({id,tree,options}),VAN_KIT_THOUGHT:JSON.parse(readFileSync('content/narrative/conservatory.van_kit.story.json','utf8')).nodes,
    PLANT:{hasPlantSpanner:()=>spannerOwned,collectPlantSpanner:()=>{calls.spanners++;spannerOwned=true;return true;},savePlantIncident:()=>({spannerOwned})},
    syncPlantIncidentProps(){},savePlantIncident(){calls.plantSaves++;context.saveCommit({plantIncident:{spannerOwned}});},
    shutTheVan:()=>{calls.shut++;saved.flags['van.closed']=true;},
  };
  vm.createContext(context);vm.runInContext(persistenceSource+workbenchSource+packingSource,context);
  return {saved,meta,calls,stack,context,storage,open:()=>context.takeTheBag()};
}

test('new-run startup enters a pending van run without presenting or committing the title difficulty selector',()=>{
  const startup=section('function beginNewGameFlow(','function enterSelectedRun(');
  assert.match(startup,/newGame\(\{prepareInVan:true,launchPlan\}\)/);
  assert.match(startup,/enterSelectedRun\(/);
  assert.doesNotMatch(startup,/makeDifficultySelectScene|beginRunProgression\(/);
  assert.match(workbenchSource,/onChooseDifficulty:[\s\S]*makeDifficultySelectScene/);
});

test('opening and inspecting the offered complete case grants and writes nothing',()=>{
 const f=fixture(),before=structuredClone(f.saved);f.open();const scene=f.stack.get('van-workbench'),view=scene.getState();
 assert.equal(view.bagTaken,true);assert.equal(view.mapTaken,true);assert.equal(view.caseClaimed,false);assert.equal(view.difficultyLabel,'CONTRACT');assert.equal(view.difficultyConfirmed,true);
 assert.deepEqual(Array.from(view.packedGroups),BENCH_PACK_GROUPS);scene.onInspect('field-case');assert.match(f.stack.get('item-inspection').entry.facts.find(([key])=>key==='STATE')[1],/OPEN \/ OFFERED/);
 scene.onClose();assert.deepEqual(f.saved,before);assert.equal(f.calls.commits.length,0);assert.equal(f.calls.saveWrites.length,0);assert.equal(f.calls.events.length,0);
});
test('one Take Case atomically packs defaults, confirms its displayed shift once and closes directly',async()=>{
 const f=fixture();f.saved.settings.lastDifficulty='night';f.open();const scene=f.stack.get('van-workbench');assert.equal(scene.getState().difficultyLabel,'NIGHT');assert.equal(await scene.onContinue(),true);
 assert.equal(f.calls.commits.length,1);const patch=f.calls.commits[0];for(const flag of ['bag.taken','kit.taken','map.taken','kit.fitted'])assert.equal(patch.flags[flag],true);
 for(const group of BENCH_PACK_GROUPS){assert.equal(patch.flags[`van.packed.${group}`],true);assert.equal(patch.fieldKit[group],'reference');}
 assert.equal(f.saved.run.rules.startedPreset,'night');assert.equal(f.saved.run.ledger.seq,1);assert.equal(f.calls.finalized,1);assert.equal(f.calls.events.length,1);assert.equal(f.calls.shut,1);assert.equal(f.calls.dialogue.length,0);
 assert.equal(await scene.onContinue(),false);assert.equal(f.calls.events.length,1);
});
test('optional shift confirmation is a revisable draft without taking the case',async()=>{
 const f=fixture();f.open();const scene=f.stack.get('van-workbench');scene.onChooseDifficulty();await f.stack.get('difficulty-select').onConfirm({preset:'night'});
 assert.equal(f.saved.flags['bag.taken'],undefined);assert.equal(f.saved.run.rules.startedPreset,'contract');scene.onChooseDifficulty();assert.equal(f.stack.get('difficulty-select').initialPreset,'night');
 await f.stack.get('difficulty-select').onConfirm({preset:'story'});assert.equal(scene.getState().difficultyLabel,'STORY');assert.equal(await scene.onContinue(),true);assert.equal(f.saved.run.rules.startedPreset,'story');
});
test('failed shift confirmation retries the identical draft without granting a case or accepting a replacement',async()=>{
 const f=fixture();f.open();const scene=f.stack.get('van-workbench');scene.onChooseDifficulty();const sheet=f.stack.get('difficulty-select');
 f.storage.failSave=true;assert.equal((await sheet.onConfirm({preset:'night'})).ok,false);const commits=f.calls.commits.length;
 assert.equal((await sheet.onConfirm({preset:'story'})).reason,'RETRY_REQUIRED');assert.equal(f.calls.commits.length,commits);
 f.storage.failSave=false;assert.equal((await sheet.onConfirm({preset:'night'})).ok,true);assert.equal(f.calls.commits.length,commits);
 assert.equal(f.storage.save.vanPreparation.difficulty.preset,'night');assert.equal(f.saved.flags['bag.taken'],undefined);assert.equal(f.calls.events.length,0);
});
test('explicit Apply packs the offered case while changing only its requested category',async()=>{
 const f=fixture();f.saved.flags['van.packed.headphones']=true;f.saved.fieldKit.headphones='closed';f.open();const scene=f.stack.get('van-workbench');
 const request=normalizeFieldKit({headphones:'open',microphone:'directional',recorder:'headroom',cosmetics:{faceplate:'olive'}});assert.equal((await scene.onKitChange(request,{group:'microphone'})).ok,true);
 assert.equal(f.calls.commits.length,1);assert.equal(f.saved.fieldKit.headphones,'closed');assert.equal(f.saved.fieldKit.microphone,'directional');assert.equal(f.saved.fieldKit.recorder,'reference');assert.equal(f.saved.fieldKit.cosmetics.faceplate,'aluminum');
 for(const flag of ['bag.taken','kit.taken','map.taken'])assert.equal(f.saved.flags[flag],true);assert.deepEqual(packedWorkbenchGroups(f.saved.flags),BENCH_PACK_GROUPS);assert.equal(f.saved.flags['kit.fitted'],undefined);assert.equal(f.calls.events.length,0);
});
test('failed Apply keeps session choice and guards all subsequent commitments until retry',async()=>{
 const f=fixture();f.open();const scene=f.stack.get('van-workbench');f.storage.failSave=true;assert.equal((await scene.onKitChange({...scene.getState().fieldKit,microphone:'wide'},{group:'microphone'})).ok,false);
 assert.equal(scene.getState().saveError,true);assert.equal(f.saved.fieldKit.microphone,'wide');assert.equal(f.storage.save.flags['bag.taken'],undefined);const commits=f.calls.commits.length;
 assert.equal((await scene.onKitChange({...f.saved.fieldKit,flashlight:'throw'},{group:'flashlight'})).reason,'RETRY_REQUIRED');assert.equal((await scene.onContinue()).reason,'RETRY_REQUIRED');assert.equal(f.calls.commits.length,commits);
 f.storage.failSave=false;assert.equal((await scene.onRetrySave()).ok,true);assert.equal(scene.getState().saveError,false);assert.equal(f.storage.save.fieldKit.microphone,'wide');assert.equal(f.calls.shut,0);
});
test('failed Take receipt blocks departure and retry completes the same take without duplicate finalization',async()=>{
 const f=fixture();f.open();const scene=f.stack.get('van-workbench');f.storage.failSave=true;assert.equal((await scene.onContinue()).ok,false);assert.equal(f.calls.shut,0);assert.equal(f.calls.applied,0);
 assert.equal(f.saved.flags['kit.fitted'],true);assert.equal(f.saved.run.ledger.seq,1);assert.equal(scene.getState().takePending,true);const run=structuredClone(f.saved.run),commits=f.calls.commits.length;
 assert.equal((await scene.onContinue()).reason,'RETRY_REQUIRED');f.storage.failSave=false;assert.equal(await scene.onRetrySave(),true);assert.deepEqual(f.saved.run,run);assert.equal(f.calls.commits.length,commits);assert.equal(f.calls.events.length,1);assert.equal(f.calls.shut,1);
});
test('concurrent Take requests cannot duplicate a pending owner transaction',async()=>{
 const f=fixture();f.open();const scene=f.stack.get('van-workbench'),first=scene.onContinue();assert.equal(await scene.onContinue(),false);assert.equal(await first,true);assert.equal(f.calls.events.length,1);assert.equal(f.calls.commits.length,1);
});
test('partial and legacy kit and original rules survive one-action departure',async()=>{
 for(const legacy of [false,true]){const f=fixture({legacy});f.saved.fieldKit=normalizeFieldKit({headphones:'closed',microphone:'wide',recorder:'headroom',flashlight:'throw',cosmetics:{faceplate:'olive'}});
 if(!legacy){f.saved.flags['van.bench.v2']=true;f.saved.flags['van.packed.microphone']=true;f.saved.vanPreparation={schema:1,difficulty:{preset:'story'}};}
 const rules=structuredClone(f.saved.run.rules);f.open();const scene=f.stack.get('van-workbench');assert.equal(await scene.onContinue(),true);assert.equal(f.saved.fieldKit.microphone,'wide');assert.equal(f.saved.fieldKit.cosmetics.faceplate,'olive');assert.equal(f.calls.shut,1);assert.equal(f.calls.dialogue.length,0);
 if(legacy){assert.deepEqual(f.saved.run.rules,rules);assert.equal(f.calls.events.length,0);assert.equal(f.saved.fieldKit.headphones,'closed');}else{assert.equal(f.saved.run.rules.startedPreset,'story');assert.equal(f.saved.fieldKit.headphones,'reference');}}
});
test('optional notes preserve badge choices and return to the same unclaimed bench',()=>{
 const f=fixture();f.open();const scene=f.stack.get('van-workbench');scene.onReadNotes();const note=f.calls.dialogue[0];assert.equal(note.id,'van-notes');assert.equal(note.options.startAt,'hub');assert.match(note.tree.hub.choices.find(c=>c.goto==='leave').text,/back to the workbench/);
 assert.ok(note.tree.badge.choices.some(c=>c.set?.includes('badge.taken')));note.options.onDone();note.options.onCancel();assert.equal(f.stack.get('van-workbench'),scene);assert.equal(f.saved.flags['bag.taken'],undefined);assert.equal(f.calls.shut,0);assert.equal(f.calls.events.length,0);
});

test('workbench inspection resolves the selected physical variant and shows workbench rather than carried position',()=>{
  const f=fixture();f.open();const scene=f.stack.get('van-workbench');
  assert.equal(scene.getState().reduceMotion,false);
  f.context.shakeMode=()=> 'off';assert.equal(scene.getState().reduceMotion,true);
  for(const [group,variant] of [['headphones','closed'],['headphones','open'],['microphone','directional'],['microphone','wide'],['recorder','headroom']]){
    const kit={...f.saved.fieldKit,[group]:variant};f.saved.fieldKit=kit;f.saved.flags[`van.packed.${group}`]=true;
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
    assert.deepEqual(f.saved.fieldKit,before);assert.deepEqual(Array.from(scene.getState().packedGroups),BENCH_PACK_GROUPS);assert.deepEqual(packedWorkbenchGroups(f.saved.flags),[]);
  }
  scene.onInspect('plant-spanner');assert.equal(f.stack.get('item-inspection').entry.sourceId,'plant-spanner');
  assert.equal(scene.getState().spannerTaken,false);
  for(const id of ['amp-forged','flashlight-forged']){f.stack.delete('item-inspection');scene.onInspect(id);assert.equal(f.stack.has('item-inspection'),false);}
});

test('appearance Apply rechecks WITNESS ownership and only changes the requested finish',async()=>{
 const f=fixture();f.open();const scene=f.stack.get('van-workbench'),kit=normalizeFieldKit({headphones:'closed',cosmetics:{faceplate:'witness',buttons:'sea-glass'}}),before=structuredClone(f.saved.fieldKit);
 assert.equal(await scene.onKitChange(kit,{group:'faceplate'}),false);f.meta.endingsSeen=['sacrifice'];assert.equal(await scene.onKitChange(kit,{group:'faceplate'}),false);assert.deepEqual(f.saved.fieldKit,before);
 f.meta.endingsSeen=['sacrifice','helped'];assert.equal((await scene.onKitChange(kit,{group:'faceplate'})).ok,true);assert.equal(f.saved.fieldKit.cosmetics.faceplate,'witness');assert.equal(f.saved.fieldKit.headphones,'reference');assert.equal(f.saved.fieldKit.cosmetics.buttons,'classic');assert.equal(f.meta.cosmetics.selected,'witness');assert.equal(f.saved.flags['bag.taken'],true);
});
test('spanner refusal grants no case, while explicit packing saves actual tool and case ownership once',async()=>{
 const f=fixture();f.open();const scene=f.stack.get('van-workbench');assert.equal((await scene.onSpannerChoice(false)).ok,true);assert.equal(f.saved.flags['bag.taken'],undefined);assert.equal(f.saved.flags['van.spanner.decided'],true);
 assert.equal((await scene.onSpannerChoice(true)).ok,true);assert.equal(f.saved.flags['bag.taken'],true);assert.equal(scene.getState().spannerTaken,true);assert.equal(f.saved.plantIncident.spannerOwned,true);assert.equal(f.saved.flags['van.spanner.taken'],true);
 assert.equal((await scene.onSpannerChoice(true)).ok,true);assert.equal(f.calls.spanners,1);assert.equal(f.calls.events.length,0);f.saved.flags['van.closed']=true;assert.equal(await scene.onSpannerChoice(true),false);
});

test('production carried WITNESS inspection is read-only and never redirects a missing or ordinary recorder',()=>{
  const f=fixture(),opened=[];
  f.context.inspectWitnessRecorder=options=>opened.push(options);
  vm.runInContext(section('function inspectCarriedWitness(entry){','// Preparation reports durable success'),f.context);
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

test('production bench WITNESS inspection cannot commit a considered faceplate',()=>{
  const f=fixture(),opened=[];f.meta.endingsSeen=['sacrifice','helped'];
  f.context.inspectWitnessRecorder=options=>opened.push(options);
  f.open();const scene=f.stack.get('van-workbench'),before=structuredClone(f.saved.fieldKit);
  scene.onInspectWitness({onFit:()=>assert.fail('inspection must never call a fitting callback')});
  assert.deepEqual(opened,[undefined]);assert.deepEqual(f.saved.fieldKit,before);
  assert.equal(f.saved.flags['bag.taken'],undefined);assert.deepEqual(f.meta.cosmetics,freshMeta().cosmetics);
});

test('actual bag equipment exposes fitted variants only with case ownership and keeps them noncombat',()=>{
  const f=fixture(),missing=new Set();
  Object.assign(f.context,{
    PLANT:{plantIncidentState:()=>({spannerOwned:false})},resolveBagOwnership,resolveBagItemAction,BAG_AUTOMATIC_USE,bagKeyFacts,
    CHUNK_SURF_FLAGS:{fork:'source.fork'},HEAD:{carryingMarbleHead:()=>false},playerKeys:new Set(),chapelKeyIsIdentified:()=>false,
    // The station's errand (door-field-station): nothing carried from the worlds.
    stationRelics:()=>[],STATION_RELIC_LABEL:{},
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
  const calls=[],removed=[],state={closed:false},vanDoors={closingAtMs:0,landed:false};let now=10,open=1;
  const context={vanDoors,flagTest:()=>state.closed,flagSet:()=>state.closed=true,getSave:()=>({flags:{}}),saveCommit(){},
    performance:{now:()=>now},SPEECH:{say(){}},vanDoorOpenFraction:()=>open,fireCue:(id)=>calls.push(id),syncVanProps(){},refreshWorldProps(){},
    PROPS:{setLooseProp:(id,value)=>removed.push({id,value})}};
  vm.createContext(context);vm.runInContext(shut+tick,context);
  context.shutTheVan();assert.deepEqual(removed,[{id:'yard-van-field-case',value:null}],'the packed case leaves before the doors swing over it');
  assert.deepEqual(calls,[]);context.tickVanDoors();assert.deepEqual(calls,[]);
  now=2000;open=0;context.tickVanDoors();context.tickVanDoors();assert.deepEqual(calls,['door']);
});

test('reload derives world case, remaining stock and dome fixture from real packing and closed-door flags',()=>{
 const sync=section('function syncVanProps(){','// Two instances, hung');
 for(const [flags,expected] of [[{},['yard-van-field-case-open']],[{'kit.fitted':true},['yard-van-field-case','yard-van-field-case-open']],[{'van.closed':true},['yard-van-lamp','yard-van-field-case','yard-van-field-case-open']]]){
  const removed=[],restored=[],kit=normalizeFieldKit(),present=new Set();
  const context={planName:'conservatory',FP:{isLoaded:()=>true},flagTest:id=>!!flags[id],
   getSave:()=>({flags,fieldKit:kit}),getMeta:()=>freshMeta(),resolveFieldKit,packedWorkbenchGroups,vanRearStockState,
   vanDoorOpenFraction:()=>flags['van.closed']?0:1,
   PROPS:{setLooseProp:(id,value)=>{assert.equal(value,null);removed.push(id);},propById:id=>present.has(id),restoreAuthoredProp:id=>{restored.push(id);present.add(id);}}};
  vm.createContext(context);vm.runInContext(sync,context);context.syncVanProps();
  assert.deepEqual(removed.filter(id=>!id.startsWith('yard-van-stock-')),expected);
  const stock=vanRearStockState({closed:!!flags['van.closed'],bagTaken:false,fieldKit:resolveFieldKit(kit,freshMeta()),packedGroups:[]});
  assert.deepEqual(restored.filter(id=>id.startsWith('yard-van-stock-')).sort(),stock.filter(p=>p.visible).map(p=>p.id).sort());
  assert.deepEqual(removed.filter(id=>id.startsWith('yard-van-stock-')).sort(),stock.filter(p=>!p.visible).map(p=>p.id).sort());
 }
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
      // The combined navigator paints mapStatus whenever navigation is hidden.
      drawMinimap:(_model,options)=>calls.push(options.navigationVisible===false
        ? options.mapStatus?.includes('MISSING')?'missing':'minimal' : 'map'),
      currentFacilityMapModel:()=>({}),performance:{now:()=>0},rec:{takes:[],injuries:0},
      monitorDisplaySnapshot:()=>({}),dockCommandUntil:0,
      recentMischief:()=>[],recentApparitions:()=>[],uiText:(_x,_y,text)=>calls.push(text.includes('MISSING')?'missing':'minimal')};
    vm.createContext(context);vm.runInContext(source,context);
    assert.deepEqual(calls,expected==='none'?[]:[expected],`${owned}/${lost}/${showMap}`);
  }
});
