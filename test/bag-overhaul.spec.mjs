import test from 'node:test';
import assert from 'node:assert/strict';

import * as scenes from '../src/game/scenes.js';
import { makeBagScene } from '../src/game/bag.js';
import { buildBagModel, bagEntry } from '../src/game/bag-model.js';
import { assignCombatGearSlot } from '../src/game/combat-loadout.js';
import { completeSheetInsight, freshBagSheetState } from '../src/game/bag-sheets.js';
import { BUILDING_MAP, FACILITY_SPACE_IDS } from '../src/data/building-map.js';
import * as OBJ from '../src/game/objectives.js';
import { buildMapModel } from '../src/game/map-model.js';
import { buildMapCommands, buildMinimapCommands } from '../src/render/map-commands.js';
import { fixtureMapSource, mapLabJob, MAP_LAB_CASES } from '../src/game/map-fixtures.js';
import { initialMapNav } from '../src/game/map-navigation.js';

const key=(value)=>({key:value,code:value});
const workOrder={id:'work-order',title:'WORK ORDER 4417-C',room:'main_b3',body:[]};
const page6={id:'page-6',title:'LOG — 02:10 / SHEET 6',room:'lux_nova',body:[]};
const job=()=>({
  rooms:[
    {roomId:'main_b3',label:'STUDIO B3',notes:[workOrder],recorded:false,marked:false},
    {roomId:'lux_nova',label:'THE CHAPEL',notes:[page6],recorded:false,marked:false},
  ],
  unfiled:[],done:0,total:2,
});

test('the bag owns nested sheet routes, freezes the world, restores pages, and B always closes',()=>{
  let cleared=0,reads=0;
  const first=makeBagScene({
    job:job(),focus:{sectionId:'sheets',entryId:'file:work-order'},
    readDocument:()=>{reads++;},onClearInput:()=>{cleared++;},
  });
  scenes.replace(first);
  assert.equal(first.blocksWorld,true);
  first.key(key('Enter'));
  assert.equal(first.debugState().route.type,'sheet-reader');
  assert.equal(first.debugState().route.reader.page,0);
  first.key(key('ArrowRight'));
  assert.equal(first.debugState().route.reader.page,1,'the work order keeps its own page');
  first.key({key:'b',code:'KeyB'});
  assert.equal(scenes.top(),null,'B removes the entire bag from inside a sheet');
  assert.equal(cleared,1,'closing clears held gameplay input');

  const reopened=makeBagScene({job:job(),focus:{sectionId:'sheets',entryId:'file:work-order'},readDocument:()=>{reads++;}});
  scenes.push(reopened);
  reopened.key(key('Enter'));
  assert.equal(reopened.debugState().route.reader.page,1,'reopening restores this sheet without tainting another section');
  reopened.key(key('Escape'));
  assert.equal(reopened.debugState().route.type,'sheet-dialog','an unfinished important inspection follows the physical sheet');
  reopened.key({key:'b',code:'KeyB'});
  assert.equal(scenes.top(),null,'B also bypasses an unfinished important-sheet tree safely');
  assert.equal(reads,2);
});

test('important-sheet inspection completes once, then becomes optional REVIEW',()=>{
  let insights=freshBagSheetState(),completions=0;
  const bag=makeBagScene({
    job:job(),focus:{sectionId:'sheets',entryId:'file:work-order'},readDocument:()=>{},
    getSheetInsights:()=>insights,
    onSheetInsight:(id)=>{insights=completeSheetInsight(insights,id);completions++;return true;},
  });
  scenes.replace(bag);
  bag.key(key('Enter'));
  bag.key(key('Escape'));
  assert.equal(bag.debugState().route.type,'sheet-dialog');
  bag.key(key('ArrowDown'));bag.key(key('ArrowDown'));bag.key(key('Enter'));
  assert.equal(bag.debugState().route.type,'root');
  assert.deepEqual(insights.inspected,['work-order']);
  assert.equal(completions,1);
  const entry=bagEntry(bag.debugState().model,'sheets','file:work-order');
  assert.ok(entry.actionList.some((action)=>action.id==='review-insight'));
  bag.key(key('Enter'));bag.key(key('Escape'));
  assert.equal(bag.debugState().route.type,'root','a completed tree is not forced after rereading');
  assert.equal(completions,1);
  bag.key({key:'b',code:'KeyB'});
});

test('inventory actions stay explicit and only the radio can be dropped safely',()=>{
  const model=buildBagModel({
    equipment:[
      {id:'light',present:true,battleCapable:true},
      {id:'radio',present:true,battleCapable:true,primaryAction:{id:'radio-deploy',label:'DEPLOY RADIO',enabled:true}},
      {id:'plant-spanner',present:true},
    ],
    loadout:{top:['light','radio']},job:job(),
  });
  for(const id of ['gear:light','gear:radio','gear:plant-spanner']){
    const verbs=bagEntry(model,'kit',id).actionList.map((action)=>action.verb);
    assert.ok(verbs[0]==='set'||verbs[0]==='unset');
    assert.deepEqual(verbs.slice(1,4),['use','drop','inspect']);
  }
  const radioDrop=bagEntry(model,'kit','gear:radio').actionList.find((action)=>action.verb==='drop');
  assert.equal(radioDrop.enabled,true);assert.ok(radioDrop.confirm);assert.equal(radioDrop.exitPolicy,'close');
  const lightDrop=bagEntry(model,'kit','gear:light').actionList.find((action)=>action.verb==='drop');
  assert.equal(lightDrop.enabled,false);assert.match(lightDrop.reason,/WORLD PLACEMENT/);
  const spannerSet=bagEntry(model,'kit','gear:plant-spanner').actionList.find((action)=>action.verb==='set');
  assert.equal(spannerSet.enabled,false);assert.equal(spannerSet.reason,'NOT CONTACT GEAR');
});

test('numbered ready slots replace storage gear and swap already-ready gear',()=>{
  const start={top:['light','recorder','radio']};
  const replaced=assignCombatGearSlot(start,'coffee',1);
  assert.deepEqual(replaced.loadout.top,['light','coffee','radio'],'the displaced recorder returns to storage');
  const swapped=assignCombatGearSlot(start,'radio',0);
  assert.deepEqual(swapped.loadout.top,['radio','recorder','light'],'moving between occupied ready slots swaps them');
});

test('schema-2 personal waypoints migrate legacy rooms and preserve generic spaces independently',()=>{
  OBJ.loadObjState({read:['page-6'],target:'main_b3',waypoint:{x:10,y:20,roomId:'main_b3'}},{validTargets:['main_b3'],validSpaces:FACILITY_SPACE_IDS});
  assert.equal(OBJ.playerWaypoint().spaceId,'space:main_b3');
  assert.equal(OBJ.saveObjState().schema,2);
  OBJ.setPlayerWaypoint({spaceId:'space:academic-gallery',floorId:'academic',x:30,y:250,position:{x:15,y:125},label:'ACADEMIC GALLERY'});
  const saved=OBJ.saveObjState();
  OBJ.loadObjState(saved,{validTargets:['main_b3'],validSpaces:FACILITY_SPACE_IDS});
  assert.equal(OBJ.playerWaypoint().spaceId,'space:academic-gallery');
  assert.equal(OBJ.targetRoom(),null,'a generic personal mark does not impersonate a recording target');
  OBJ.clearWaypoint();
});

test('the canonical map exposes every structural floor, generic spaces, live entrances, and no unseen HUSH point',()=>{
  assert.deepEqual(BUILDING_MAP.floors.map((floor)=>floor.id),['b1','g','u1','academic','tower']);
  assert.ok(BUILDING_MAP.spaces.length>=35);
  assert.equal(new Set(FACILITY_SPACE_IDS).size,FACILITY_SPACE_IDS.length);
  const source={...fixtureMapSource(),spaces:[{
    id:'space:get-in',label:'GET IN',shortLabel:'GETIN',floorId:'g',position:{x:20,y:12},selectable:true,waypointable:true,doorIds:['goods-a','goods-b'],
  }],landmarks:[]};
  const caseData=MAP_LAB_CASES[0];
  const model=buildMapModel({
    source,job:mapLabJob(caseData),
    doors:[{id:'goods-a',floorId:'g',position:{x:19,y:12},state:'open'},{id:'goods-b',floorId:'g',position:{x:21,y:12},state:'locked'}],
    contacts:[{id:'contact:hush',state:'locked',observation:{floorId:'g',position:{x:31,y:9},observedAt:1}}],
    player:{x:7,y:11,height:0,roomId:null,heading:0},navigation:{id:'directional',showMapTopology:true},
  });
  assert.deepEqual(model.spaces.find((space)=>space.id==='space:get-in').entrances.map((door)=>door.state),['open','locked']);
  const nav=initialMapNav({model});
  const commands=buildMapCommands({model,nav:{...nav,floorId:'g'},layout:{mapViewport:{x:0,y:0,w:50,h:20}},now:10});
  assert.equal(commands.some((command)=>command.kind==='anomaly-contact'),false);
  const mini=buildMinimapCommands({model,viewport:{x:0,y:0,w:20,h:10},now:10});
  assert.equal(mini.some((command)=>command.kind==='anomaly-contact'||command.kind==='anomaly-edge'),false);
});
