import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as FP from '../src/world/floorplan.js';
import * as P from '../src/game/props.js';
import {conservatory as C} from '../src/data/floorplan/conservatory.js';
import {CELL,ZONE} from '../src/data/floorplan/legend.js';
import {freshChunkSurfState,reduceChunkSurf} from '../src/game/chunk-surf-state.js';
import {createSourceSpaceRuntime} from '../src/game/source-space-runtime.js';
import {worldPropVisibilityKey,shouldPortalOwnScenery,shouldHideCrossEnvelopeProp} from '../src/game/prop-visibility.js';
import {buildingWindowsForObserver,buildingWindowExteriorPlane,buildingWindowPortal,isBuildingWindowScenery,applyBuildingWindowView} from '../src/world/building-window-views.js';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const takeoverCode=main.slice(main.indexOf('let windowTakeover=null,'),main.indexOf('// The same sentence',main.indexOf('let windowTakeover=null,')));
function runtime(){let state=freshChunkSurfState({seed:4417});state=reduceChunkSurf(state,{type:'SOURCE_ENTERED'});state=reduceChunkSurf(state,{type:'HALL_ADVANCED',distance:96});return createSourceSpaceRuntime({initialState:state});}
function mainHost(){
 let began=0,active=false,top=null,options=null;
 const flags={recording:false,slating:false,listening:false,playback:false,lifecycle:true};
 const context={paused:false,gameplayInputLifecycleActive:()=>flags.lifecycle,RECORDER_SCENE_ID:'recorder',IS_TAURI:false,
  REC:{isRecording:()=>flags.recording,isSlating:()=>flags.slating,isListening:()=>flags.listening},PB:{isPlaying:()=>flags.playback},
  scenes:{top:()=>top,has:()=>false},getSave:()=>({settings:{}}),getMeta:()=>({}),
  currentPsychProfileSettings:()=>({modules:{windowChoreography:false}}),windowTakeoverMode:()=> 'in-window',
  createWindowTakeover:()=>({active:()=>active,begin(_id,value){began++;active=true;options=value;return true;}})};
 const api=vm.runInNewContext(takeoverCode+'\n({beginWindowTakeover,windowTakeoverYields})',context);
 return{api,context,flags,get began(){return began;},setTop:value=>{top=value;},finish(){active=false;options.onDone({shown:true});}};
}

test('the physical Source paper/search remains available without any automatic paper window owner',()=>{
 const source=runtime(),before=JSON.stringify(source.state()),h=mainHost();
 assert.equal(source.searchSpanActive(),true);assert.ok(source.paperTonePoint(),'the actual paper still has its world location');
 assert.equal(h.api.beginWindowTakeover('paper-close',{owner:{id:'source-haystack-paper',runtime:source,token:1}}),false);
 assert.equal(h.api.beginWindowTakeover('paper-close'),false);assert.equal(h.began,0);
 assert.equal(JSON.stringify(source.state()),before,'rejected ambient ownership cannot spend a physical search or exposure');
 assert.doesNotMatch(main,/tickHaystackPaperOpportunity|claimHaystackPaperOpportunity\s*\(|ownsHaystackTakeover/);
});

test('an explicit archive player protects real controls and loses its lease to another owner',()=>{
 const h=mainHost(),archive={id:'transfer-room'};h.setTop(archive);
 assert.equal(h.api.beginWindowTakeover('clouds',{owner:{id:'transfer-room'}}),false,'the live top owner must match by identity');
 assert.equal(h.api.beginWindowTakeover('clouds',{owner:archive}),true);assert.equal(h.api.windowTakeoverYields(),false);
 for(const flag of ['recording','slating','listening','playback']){h.flags[flag]=true;assert.equal(h.api.windowTakeoverYields(),true,flag);h.flags[flag]=false;}
 h.context.paused=true;assert.equal(h.api.windowTakeoverYields(),true);h.context.paused=false;
 h.flags.lifecycle=false;assert.equal(h.api.windowTakeoverYields(),true);h.flags.lifecycle=true;
 h.setTop({id:'settings'});assert.equal(h.api.windowTakeoverYields(),true);h.finish();
});

FP.compile(C.levels,C);
const interiorHelper=main.slice(main.indexOf('function interiorOutlookKey('),main.indexOf('let renderedWorldPropVisibilityKey=',main.indexOf('function interiorOutlookKey(')));
test('actual atrium→greenhouse movement changes both stored and compared static-prop aperture keys',()=>{
 const stored=main.split('\n').find(line=>line.includes('renderedWorldPropVisibilityKey=worldPropVisibilityKey('));
 const compared=main.split('\n').find(line=>line.includes('const propVisibilityChanged='));assert.ok(stored&&compared);
 const context={FP,CELL,buildingWindowsForObserver,worldPropVisibilityKey,group:'ground',observer:{x:168,y:24},exteriorWindow:null,
  renderedWorldPropVisibilityKey:'',viewX:168,viewY:24,slice:{group:'ground'},usingSpecialSpace:()=>false,currentExteriorWindow:()=>null};
 vm.runInNewContext(interiorHelper,context);
 vm.runInNewContext(stored,context);const atriumKey=context.renderedWorldPropVisibilityKey;
 const compare=()=>vm.runInNewContext('(()=>{'+compared+'return propVisibilityChanged;})()',context);
 assert.equal(compare(),false);context.viewY=40;assert.equal(compare(),true,'ordinary D0 crossing must rebuild side scenery');
 context.observer={x:168,y:40};vm.runInNewContext(stored,context);const greenhouseKey=context.renderedWorldPropVisibilityKey;
 assert.notEqual(greenhouseKey,atriumKey);assert.equal(compare(),false,'the rebuilt room reuses its own aperture set');
 context.viewY=24;assert.equal(compare(),true,'returning through D0 retires the side-owned prop set');
 assert.equal(worldPropVisibilityKey({group:'ground',zone:ZONE.glasshouse,interiorWindowIds:['GH-east','W3-foyer-north','GH-west','GH-east']}),
  worldPropVisibilityKey({group:'ground',zone:ZONE.glasshouse,interiorWindowIds:['W3-foyer-north','GH-west','GH-east']}),'set ordering or duplicates cannot cause a rebuild every frame');
});

test('the current greenhouse admits scenery only through one owned submission per aperture, without an unclipped duplicate',()=>{
 P.propsInit(FP);const observer={x:168,y:40},physical=FP.logicalToPhysical(observer.x,observer.y);
 const all=P.renderInstances({group:'ground',inscriptions:false});
 assert.ok(all.some(p=>shouldPortalOwnScenery(p,physical)),'the check must contain actual exterior scenery');
 const props=all.filter(p=>!shouldHideCrossEnvelopeProp(p,{observerZone:ZONE.glasshouse})&&!shouldPortalOwnScenery(p,physical));
 assert.equal(props.some(p=>isBuildingWindowScenery(p)),false,'there is no raw unframed copy left inside the greenhouse');
 assert.equal(shouldPortalOwnScenery({id:'glass-court-frame',mesh:'glass_court_frame'},physical),false,'the actual greenhouse remains normally submitted');
 assert.equal(shouldPortalOwnScenery({id:'yard-caretaker-room'},{spaceId:'front_atrium'}),false,'ordinary rooms keep their existing ownership');
 const from=main.indexOf('  const windowPosition=FP.logicalToPhysical(observer.x,observer.y);',main.indexOf('function worldRenderInstances('));
 const to=main.indexOf('  const architecture=doorRenderInstances()',from);assert.ok(from>0&&to>from);
 const context={FP,CELL,observer,props,PROPS:P,buildingWindowsForObserver,isBuildingWindowScenery,buildingWindowExteriorPlane,buildingWindowPortal,
  streetCrowdRenderReady:false,isLiveExteriorPerformer:()=>false};
 vm.runInNewContext(main.slice(from,to),context);
 const ids=new Set(props.map(p=>p.id));assert.equal(ids.size,props.length,'the actual submission loop has unique surface identities');
 const eligible=all.filter(p=>isBuildingWindowScenery(p));let submitted=0;
 for(const original of eligible){
  for(const instance of props.filter(p=>p.id===original.id||p.id===`${original.id}:GH-west`||p.id===`${original.id}:GH-east`)){
   submitted++;assert.ok(instance.exteriorClipPlane&&instance.exteriorPortal,'only a real aperture owns '+instance.id);
  }
 }
 assert.ok(submitted>50,'the real multi-aperture town/yard population is exercised');
 assert.ok(main.includes('if(shouldPortalOwnScenery(instance,observerPhysical))return false;'),'production raw filter uses the same tested ownership');
});

function index(slice,x,z){return(Math.floor(z/CELL)-slice.originY)*slice.w+Math.floor(x/CELL)-slice.originX;}
const fields=['solid','floor','ceil','flags','zone','material'];
const values=(s,x,z)=>Object.fromEntries(fields.map(f=>[f,s[f][index(s,x,z)]]));
test('both greenhouse side cones preserve actual neighboring occupied rooms and actual garden overhangs',()=>{
 const before=FP.physicalRenderPlanFor(168,24),greenhouse=FP.physicalRenderPlanFor(168,40);
 for(const[x,z]of[[100.25,21.25],[110.25,21.25],[120.25,21.25],[70.25,21.25]]){
  assert.deepEqual(values(greenhouse,x,z),values(before,x,z),'the side pane must not manufacture a street at '+x+','+z);
 }
 assert.equal(values(greenhouse,100.25,21.25).zone,ZONE.hall);assert.ok(values(greenhouse,100.25,21.25).floor<-.7);
 for(const[x,z]of[[75.25,21.25],[93.25,21.25]]){
  const actual=FP.physicalSpanData().cells.get(`${Math.floor(x/CELL)},${Math.floor(z/CELL)}`).find(s=>s.zone===ZONE.civicCourt);
  const view=values(greenhouse,x,z);assert.equal(view.floor,actual.floor);assert.equal(view.ceil,actual.ceil);assert.equal(view.flags,actual.flags);
 }
 const copy={...greenhouse,...Object.fromEntries(fields.map(f=>[f,greenhouse[f].slice()]))};
 applyBuildingWindowView(copy,{x:84,z:20,y:0,spaceId:'greenhouse',renderGroup:'ground'},FP.physicalSpanData().cells);
 for(const[x,z]of[[100.25,21.25],[110.25,21.25],[70.25,21.25]])assert.deepEqual(values(copy,x,z),values(before,x,z));
});
