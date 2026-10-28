import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {STREET_CROWD_DESIGNS,STREET_CROWD_IDS,streetCrowdDesign} from '../src/data/street-crowd-characters.js';
import {streetCrowdInstances,streetCrowdRenderInstance} from '../src/render/street-crowd-performance.js';
import {VIGIL_VOICES,vigilFigures} from '../src/data/exterior-vigil.js';
import {vigilCharacterIdForMesh,vigilCharacterDescriptor} from '../src/render/vigil-character-performance.js';
import {pubActor} from '../src/data/pub-population.js';
import {pubServiceInstances,pubServiceDrinks} from '../src/render/pub-service-presentation.js';
import {pubQuestState} from '../src/game/pub-quest.js';
import {pubSeatedVigilDescriptor} from '../src/render/pub-character-performance.js';
import {exteriorVigilInstances} from '../src/render/exterior-vigil-instances.js';
import {busWomanExteriorInstances} from '../src/render/bus-woman-exterior-performance.js';
import {isLiveExteriorPerformer} from '../src/render/exterior-performer-visibility.js';
import {ZONE} from '../src/data/floorplan/legend.js';
import {applyInstitutionPosters} from '../src/data/institution-poster-sites.js';
import {hallChandelierInstances} from '../src/data/hall-chandelier-treatment.js';

// Execute the actual main render adapters with controlled world/renderer
// boundaries. This checks their handoff, rather than repeating the readiness
// condition in another helper that production never calls.
const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function productionFunction(name){const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,name+' exists');const end=source.indexOf('\n}',start);assert.ok(end>start,name+' has a top-level closing brace');return source.slice(start,end+2);}
const originals=Object.values(STREET_CROWD_DESIGNS).map((d,index)=>({id:d.id,mesh:d.legacyMesh,x:index*2,y:.12,z:20+index,yaw:.2,zone:ZONE.street,structural:true}));
const named=Object.values(VIGIL_VOICES).map(v=>({id:v.id,mesh:v.mesh,x:v.place.x,y:.12,z:v.place.y,yaw:v.place.yaw,zone:ZONE.street,structural:true}));
let authored=[...originals,...named],ready=false,currentViewGroup='ground',ending=[];
const submitted={static:[],dynamic:[],groups:[],drifts:[]};
const context={
  console,Math,Number,Set,Map,Float32Array,performance:{now:()=>12_000},ZONE,
  renderedWorldPropVisibilityKey:'',worldPropVisibilityKey:({group,zone})=>group+':'+zone,
  isLiveExteriorPerformer,applyInstitutionPosters,
  hallChandelierInstances,hallChandelierRendered:[{id:'stale-hall-fixture'}],
  exteriorRooflineInstance:()=>null,exteriorRoofArchitectureInstances:()=>[],pubHospitalityInstance:v=>v,
  pubHospitalityReady:()=>false,pubHospitalityRenderReady:false,pubHospitalityRendered:[],
  pubServiceInstances,pubServiceDrinks,pubQuestState,pubWaterFirstSeenAt:null,
  STREET_CROWD_IDS,STREET_CROWD_DESIGNS,STREET_CROWD_ACTOR_IDS:new Set(STREET_CROWD_IDS),streetCrowdDesign,streetCrowdInstances,streetCrowdRenderInstance,
  vigilCharacterIdForMesh,vigilCharacterDescriptor,VIGIL_ACTORS:vigilFigures(),pubActor,pubSeatedVigilDescriptor,
  exteriorPeopleClock:4,exteriorConversationFrames:()=>({}),exteriorVigilInstances,busWomanExteriorInstances,
  exteriorAmbientPeopleInstances:v=>[v],boothGuardHeldInstances:()=>[],boothPreviousPose:"idle",boothPoseStartedAt:0,boothPresentationSourceId:"",
  streetCrowdRenderReady:false,streetCrowdSubmitted:[],vigilPosedPropIds:new Set(),vigilActionState:{active:[]},
  px:0,py:0,CELL:.5,storyMode:true,planName:'conservatory',PUB_NEW_ACTORS:[],
  usingSourceSpace:()=>false,usingStairAnomaly:()=>false,usingSpecialSpace:()=>false,FP:{isLoaded:()=>true,logicalToPhysical:(x)=>({x,z:0,y:0,renderGroup:x===100?'academic':currentViewGroup}),zoneAt:()=>ZONE.street},
  PROPS:{setColliderGroupEnabled:()=>{},renderInstances:({group}={})=>{submitted.groups.push(group);return group==='academic'?[]:authored;},attachInscriptions:v=>v,setPropDrift:(id,drift)=>submitted.drifts.push({id,drift})},
  R3:{r3dStreetCrowdStatus:()=>({ready}),r3dSetProps:instances=>{submitted.static=[...instances];},r3dSetDynamicProps:instances=>{submitted.dynamic=[...instances];}},
  RENDERER:'3d',shakeMode:()=>'full',getSave:()=>({settings:{shake:'full'}}),flagTest:()=>false,isOutdoorZone:()=>true,
  syncArchitecturalLocalLights:()=>{},chapelTowerState:()=>({}),CHAPEL_TOWER_PHASE:{TOWER_CLEARED:'cleared',CHAPEL_FINAL:'final',TOWER_ACTIVE:'active'},
  currentNatatoriumWaterRun:()=>null,hiddenCrossEnvelopeProp:()=>false,hideStaticTowerRope:()=>false,
  roofRenMemoryFoldActive:false,roofRenMemoryFoldUntilMs:0,activeEndingCutscene:null,openingVehicleScene:null,boothPresentationPose:'wait',brendanFinale:()=>null,KEY_CABINET_RING:{'C-17':{id:'not-in-fixture'}},playerKeys:new Set(),
  boothGuardRenderInstance:v=>v,worldPaperIndex:()=>-1,propEmissive:()=>null,storyGuidanceEmissive:(_v,base)=>base,
  buildingWindowForObserver:()=>null,doorRenderInstances:()=>[],
  streetPilotTime:()=>null,currentStoryGuidanceFrame:()=>({highlight:null,target:null}),storyGuidanceHighlight:{},storyGuidanceHighlightRenderKey:'false:::0.00',
  doorLeafVisualCache:{ready:true,entries:[]},rebuildDoorLeafVisuals:()=>{},doorDynamicCombined:[],inertBellTowerInstances:null,
  bellPealPerformance:null,bellTowerRuntime:null,presentTowerRuntimeInstances:()=>[],basementWatcherRenderInstance:()=>null,heldNoteParts:()=>[],conservatoryAdversaries:{held:null},
  academicAdversaryParts:()=>[],academicAdversaries:{frame:()=>null},
  academicGalleryPAInstances:()=>[],academicInframusicLevel:()=>0,academicFloorPopulationActors:()=>[],
  recordingHallucinationPropInstances:()=>[],dreamFigurePropInstance:()=>null,pubCharacterInstances:()=>[],currentLeafFlurryInstances:()=>[],brendanTowerInstances:()=>[],
  escape:null,vanDoorInstances:()=>[],endingApproachPropInstances:()=>[],endingWorldPropInstances:()=>ending,
  exteriorAmbientInstances:()=>[],yardBusWomanReplayTime:null,yardBusWomanClock:0,updateAcademicGhostAudio:()=>{},academicSocietyCharacterInstances:()=>[],academicSocietyActors:()=>[],academicSocietyListener:()=>null,academicFloorPopulationInstances:()=>[],academicFloorPopulation:{actorFrame:()=>[]},academicBouncerInstances:()=>[],academicBouncerActors:()=>[],
  RADIO:{radioLocation:()=>null},PLANT:{plantHissing:()=>false},towerWarningReady:false,
};
vm.createContext(context);
vm.runInContext([productionFunction('worldRenderInstances'),productionFunction('refreshWorldProps'),productionFunction('syncDoorDynamicProps')].join('\n'),context);

context.refreshWorldProps();context.syncDoorDynamicProps();
assert.equal(context.hallChandelierRendered.length,0,'a street refresh releases the previously submitted Hall practicals');
assert.equal(submitted.static.filter(i=>STREET_CROWD_IDS.includes(i.id)).length,20,'all authored silhouettes remain visible until both optional packs are ready');
assert.equal(submitted.dynamic.filter(i=>STREET_CROWD_IDS.includes(i.id)).length,0,'a partial load cannot overlap the silhouettes with anatomical bodies');
const namedBefore=submitted.dynamic.filter(i=>named.some(n=>n.id===i.id));assert.equal(namedBefore.length,6);assert.ok(namedBefore.every(i=>i.character));

ready=true;context.vigilPosedPropIds.add('vigil-crowd-east-1');context.syncDoorDynamicProps();
assert.equal(submitted.static.filter(i=>STREET_CROWD_IDS.includes(i.id)).length,0,'readiness refresh retires all twenty static bodies in the same handoff');
assert.equal(submitted.dynamic.filter(i=>STREET_CROWD_IDS.includes(i.id)).length,20);
assert.equal(submitted.dynamic.filter(i=>/-(chair|tripod)$/.test(i.id)).length,5);
assert.equal(context.streetCrowdSubmitted.length,25,'review evidence reports the actual submitted bodies and equipment');
assert.deepEqual(submitted.drifts,[{id:'vigil-crowd-east-1',drift:null}],'old whole-prop action drift is cleared before skin animation takes ownership');
const namedAfter=submitted.dynamic.filter(i=>named.some(n=>n.id===i.id));assert.deepEqual(namedAfter,namedBefore,'the established six named performances keep their descriptors');
context.exteriorPeopleClock=12;context.syncDoorDynamicProps();
assert.notDeepEqual(submitted.dynamic.find(i=>i.id===named[0].id).character,namedBefore[0].character,'idle named rigs advance through the live dynamic pass without a prop refresh');
assert.equal(submitted.static.some(i=>named.some(n=>n.id===i.id)),false,'no static duplicate of a live named performer');
for(const id of STREET_CROWD_IDS)assert.equal([...submitted.static,...submitted.dynamic].filter(i=>i.id===id).length,1,'one body per stable identity: '+id);

authored=authored.filter(i=>i.id!=='vigil-crowd-west-3');context.syncDoorDynamicProps();
assert.equal(submitted.dynamic.some(i=>i.id==='vigil-crowd-west-3'||i.id==='vigil-crowd-west-3-chair'),false,'inactive/removed authored occupants cannot leave a body or chair in the dynamic pass');
ending=[{id:'ending-demolition-worker',mesh:'exterior_pub_driver',x:2,y:0,z:4,yaw:1,scale:.9,emissive:[1,.5,.1,.2],noShadow:true}];
context.syncDoorDynamicProps();const worker=submitted.dynamic.find(i=>i.id==='ending-demolition-worker');
assert.equal(worker.mesh,'district_pub_driver');assert.ok(worker.character);assert.equal(worker.scale,.9);assert.deepEqual(worker.emissive,ending[0].emissive);assert.equal(worker.noShadow,true);

ready=false;context.syncDoorDynamicProps();
assert.equal(submitted.dynamic.some(i=>STREET_CROWD_IDS.includes(i.id)&&i.character),false,'loss of readiness retires optional dynamic skins');
assert.equal(submitted.static.filter(i=>STREET_CROWD_IDS.includes(i.id)).length,19,'the surviving authored silhouettes are restored on fallback');

// A worldView may render another floor while the saved player stays outside.
// The asynchronous readiness refresh must use the active view's render group.
submitted.groups.length=0;ready=true;context.syncDoorDynamicProps({logicalX:100,logicalY:0});
assert.ok(submitted.groups.includes('academic'),'the view group is rebuilt when optional assets become ready during a remote shot');
assert.equal(submitted.static.some(i=>STREET_CROWD_IDS.includes(i.id)),false);

// Roof sightlines include the ground population. Moving bodies to a dynamic
// pass must not remove that population when the observer goes upstairs.
authored=[...originals,...named];ending=[];currentViewGroup='academicRoof';context.refreshWorldProps();context.syncDoorDynamicProps();
assert.equal(submitted.dynamic.filter(i=>STREET_CROWD_IDS.includes(i.id)).length,20,'all twenty ground bodies remain visible from the academic roof');
assert.equal(submitted.dynamic.filter(i=>/-(chair|tripod)$/.test(i.id)).length,5,'the roof view retains their five fixed pieces of equipment');
assert.equal(submitted.dynamic.filter(i=>named.some(n=>n.id===i.id)).length,6,'roof views retain the six live named participants');
for(const id of STREET_CROWD_IDS)assert.equal([...submitted.static,...submitted.dynamic].filter(i=>i.id===id).length,1,'roof views retain exactly one body per identity: '+id);
// An upper-room window borrows the same live ground actors, rather than
// reinjecting frozen static bodies on a different performance clock.
currentViewGroup='academic';context.buildingWindowForObserver=()=>({id:'actual-window-boundary'});
context.isBuildingWindowScenery=()=>true;context.buildingWindowExteriorPlane=()=>[1,0,0,-1];context.buildingWindowPortal=()=>({id:'actual-window-boundary'});
context.refreshWorldProps();context.syncDoorDynamicProps();
assert.equal(submitted.static.some(i=>STREET_CROWD_IDS.includes(i.id)||named.some(n=>n.id===i.id)),false,'window scenery never reinjects a frozen performer');
assert.equal(submitted.dynamic.filter(i=>STREET_CROWD_IDS.includes(i.id)).length,20,'window has live exterior people despite its different floor group');
assert.ok(submitted.dynamic.filter(i=>STREET_CROWD_IDS.includes(i.id)).every(i=>i.exteriorPortal?.id==='actual-window-boundary'&&i.noShadow),'window bodies inherit the exact scenery portal');
console.log(JSON.stringify({ok:true,productionAdapters:3,authoredCharacters:20,sharedRigCharacters:20,fixedEquipment:5,namedPerformersPreserved:6,readinessFallback:true,inactiveRemoval:true,endingWorker:true,remoteViewGroup:true,roofSightline:true}));
