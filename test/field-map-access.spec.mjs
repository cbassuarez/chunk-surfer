import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBagModel,readOnlyBagMap} from '../src/game/bag-model.js';
import {makeBagScene} from '../src/game/bag.js';
import * as scenes from '../src/game/scenes.js';
import {readFileSync} from 'node:fs';
import {mapAcquired,mapAvailable} from '../src/game/map-ownership.js';

const model=()=>({context:'exterior',player:{resolved:true,floorId:'district',position:{x:1,y:2},heading:0},
  floors:[{id:'district',label:'DISTRICT',order:0,bounds:{minX:0,minY:0,maxX:60,maxY:80},open:new Set()}],
  spaces:[{id:'public:lyric',roomId:'lyric',floorId:'district',label:'THE LYRIC',position:{x:3,y:4},current:true,waypointable:true},
    {id:'public:ellery',roomId:'ellery',floorId:'district',label:'ELLERY',position:{x:12,y:14},waypointable:true}],
  route:null,policy:{showMap:true,showMapTopology:true,showWaypoint:true},doors:[],connectors:[],contacts:[]});
const job={rooms:[{roomId:'lyric',label:'THE LYRIC',notes:[]},{roomId:'ellery',label:'ELLERY',notes:[]}],unfiled:[],done:0,total:5};

test('map-only model reuses the canonical map while excluding inventory, skills and journal on every build',()=>{
  const source=model();
  assert.deepEqual(buildBagModel({map:source,job,sectionIds:['map']}).sections.map(s=>s.id),['map']);
  assert.deepEqual(buildBagModel({map:source,job,sectionIds:['manifest']}).sections.map(s=>s.id),['map']);
  assert.equal(buildBagModel({map:source,job,sectionIds:['map']}).map,source);
  assert.deepEqual(buildBagModel({map:source,job}).sections.map(s=>s.id),['kit','map','sheets','skills','journal']);
});

test('public survey preview is non-mutating and cannot assign or clear a personal destination',()=>{
  const source=model();source.playerWaypoint={spaceId:'public:lyric'};
  source.waypoint={spaceId:'public:lyric',position:{x:3,y:4}};
  source.route={points:[{x:1,y:2},{x:3,y:4}],status:'ready'};source.spaces[0].waypoint=true;
  const preview=readOnlyBagMap(source);
  assert.equal(preview.playerWaypoint,null);assert.equal(preview.policy.readOnly,true);
  assert.equal(preview.waypoint,null);assert.equal(preview.route,null);assert.ok(preview.spaces.every(space=>space.waypoint===false));
  assert.ok(preview.spaces.every(space=>space.waypointable===false));
  assert.deepEqual(source.playerWaypoint,{spaceId:'public:lyric'});assert.equal(source.policy.readOnly,undefined);
  assert.deepEqual(source.waypoint,{spaceId:'public:lyric',position:{x:3,y:4}});assert.equal(source.route.points.length,2);assert.equal(source.spaces[0].waypoint,true);
  assert.ok(source.spaces.every(space=>space.waypointable));
});

test('standalone map opens, refreshes, navigates and closes without claiming gear, selecting a shift or applying a build',()=>{
  const save={flags:{'bag.taken':false,'map.taken':false,'van.preparation.v1':false},difficulty:null};
  const original=structuredClone(save),commits=[];let current=model(),closed=0;
  const scene=makeBagScene({sectionIds:['map'],sceneId:'field-map',readOnly:true,getMap:()=>current,getJob:()=>job,
    equipment:['light','recorder'],hasRig:()=>true,focus:{sectionId:'skills'},
    setMapTarget:()=>{commits.push('target');return true;},clearMapTarget:()=>{commits.push('clear');return true;},
    onApplySkills:()=>commits.push('skills'),moveEquipment:()=>commits.push('equipment'),onItemAction:()=>commits.push('item'),
    readDocument:()=>commits.push('read'),onClose:()=>closed++});
  scenes.push(scene);
  try{
    assert.equal(scene.id,'field-map');assert.equal(scene.handlesEscape,true);
    assert.deepEqual(scene.debugState().model.sections.map(s=>s.id),['map']);assert.equal(scene.debugState().nav.sectionId,'map');
    for(const event of[{key:'1',code:'Digit1'},{key:'4',code:'Digit4'},{key:'5',code:'Digit5'},{key:'Tab',code:'Tab'}])scene.key(event);
    assert.equal(scene.debugState().nav.sectionId,'map','unavailable sections cannot be reached through shortcuts');
    scene.key({key:'ArrowRight',code:'ArrowRight'});scene.key({key:'Enter',code:'Enter'});scene.key({key:'Delete',code:'Delete'});
    assert.deepEqual(commits,[]);
    current={...model(),player:{...model().player,position:{x:8,y:12}}};scene.refresh();
    assert.deepEqual(scene.debugState().model.map.player.position,{x:8,y:12});
    assert.deepEqual(scene.debugState().model.sections.map(s=>s.id),['map'],'refresh cannot restore locked inventory tabs');
    scene.key({key:'Escape',code:'Escape'});assert.equal(closed,1);assert.notEqual(scenes.top(),scene);
    scene.exit();assert.deepEqual(commits,[]);assert.deepEqual(save,original);
  }finally{scenes.remove(scene);}
});

test('standalone survey selection does not replace the full case navigation memory',()=>{
  const full=makeBagScene({job,map:model(),focus:{sectionId:'journal'},memory:null});full.selectSection('journal');
  const before=makeBagScene({job,map:model()});assert.equal(before.debugState().nav.sectionId,'journal');
  const standalone=makeBagScene({job,map:model(),sectionIds:['map'],sceneId:'field-map'});
  standalone.selectRoom('ellery');standalone.refresh();
  const after=makeBagScene({job,map:model()});assert.equal(after.debugState().nav.sectionId,'journal');
  assert.deepEqual(after.debugState().model.sections.map(s=>s.id),['kit','map','sheets','skills','journal']);
});

test('host map shortcut permits a public survey before optional shift selection while preserving owned-map loss',()=>{
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),start=source.indexOf('function openFieldMap(){'),end=source.indexOf('function syncDroppedRadioProp()',start);
  assert.ok(start>=0&&end>start);
  const host=source.slice(start,end),save={flags:{},difficulty:null},stack=[],operations=[];let missing=false;
  const canonical=model(),dependencies={
    scenes:{top:()=>stack.at(-1),push:scene=>stack.push(scene),remove:scene=>{const at=stack.indexOf(scene);if(at>=0)stack.splice(at,1);}},
    storyMode:true,inRogue:true,REC:{isRecording:()=>false},flagTest:key=>!!save.flags[key],mapAcquired,mapAvailable,
    getSave:()=>save,itemLost:()=>missing,makeBagScene:options=>({id:options.sceneId,options}),getJob:()=>job,bagJob:()=>job,
    currentFacilityMapModel:()=>canonical,markRoom:()=>operations.push('mark-room'),markMapSpace:()=>operations.push('mark-space'),
    setMapTarget:()=>operations.push('set-target'),clearMapTarget:()=>operations.push('clear-target'),
    resetMotionInput:()=>operations.push('clear-input'),openMapFromBag:()=>true,
    openBag:()=>{operations.push('open-bag');stack.push({id:'bag'});},
  };
  const open=Function(...Object.keys(dependencies),host+'; return openFieldMap;')(...Object.values(dependencies));
  const initial=structuredClone(save);assert.equal(open(),true);
  let options=stack.at(-1).options;assert.equal(stack.at(-1).id,'field-map');assert.equal(options.readOnly,true);
  assert.deepEqual(options.sectionIds,['map']);assert.equal(options.getMap(),canonical);
  assert.equal(options.setMapTarget,undefined);assert.equal(options.markRoom,undefined);assert.deepEqual(save,initial);
  assert.equal(open(),true);assert.equal(stack.length,0,'the same shortcut closes its own map');
  save.flags['map.taken']=true;assert.equal(open(),true);options=stack.at(-1).options;
  assert.equal(options.readOnly,false);assert.equal(options.getMap(),canonical);assert.equal(typeof options.setMapTarget,'function');
  open();missing=true;assert.equal(open(),true);options=stack.at(-1).options;
  assert.equal(options.readOnly,false);assert.equal(options.getMap(),null);assert.match(options.getMapUnavailableReason(),/Recover/);
  assert.equal(save.flags['bag.taken'],undefined);assert.equal(save.difficulty,null);assert.deepEqual(operations,[]);
  open();save.flags['bag.taken']=true;missing=false;assert.equal(open(),true);assert.equal(stack.at(-1).id,'bag');
  assert.deepEqual(operations,['open-bag']);
});
