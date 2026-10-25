import test from 'node:test';
import assert from 'node:assert/strict';
import { isMapShortcut } from '../src/game/map-shortcut.js';
import { buildBagModel } from '../src/game/bag-model.js';
import { initialBagState, repairBagSelection } from '../src/game/bag-navigation.js';
import { makeBagScene } from '../src/game/bag.js';
import { makePauseScene } from '../src/game/pause.js';
import * as scenes from '../src/game/scenes.js';
import { MAP_LAB_CASES, mapLabModel } from '../src/game/map-fixtures.js';

const map = mapLabModel(MAP_LAB_CASES[1]);
const destination = map.spaces.find((space) => space.selectable !== false && space.roomId);
const lead = { id: 'quest:known', title: 'A known lead', area: 'CONSERVATOIRE', state: 'active',
  category: 'lead', status: {label:'OPEN',tone:'active'}, summary:'Someone asked for help.',
  next:'Return to the room.', evidence:['You agreed to help.'], location:{spaceId:destination.id} };
const key = (key, code, extra = {}) => ({key,code,preventDefault(){},...extra});

test('M belongs to the map; held keys and desktop modifiers keep their owners', () => {
  assert.ok(isMapShortcut(key('m','KeyM')));
  assert.ok(isMapShortcut(key('M','KeyM')));
  assert.ok(isMapShortcut({key:'m'}));
  assert.ok(isMapShortcut({code:'KeyM'}));
  for (const modifier of ['metaKey','ctrlKey','altKey','repeat']) assert.equal(isMapShortcut(key('m','KeyM',{[modifier]:true})),false);
});

test('journal destinations resolve through the available map and do not manufacture places', () => {
  const unknown = {...lead,id:'quest:unknown',location:{spaceId:'space:undiscovered-secret'}};
  const model = buildBagModel({journal:[lead,unknown],map});
  const entries = model.sections.find(section=>section.id==='journal').entries;
  assert.equal(entries[0].mapSpaceId,destination.id);
  assert.equal(entries[1].mapEnabled,false);
  const offline = buildBagModel({journal:[lead],map,mapUnavailableReason:'INDICATOR LOST'});
  assert.equal(offline.sections.find(section=>section.id==='journal').entries[0].mapEnabled,false);
});

test('tracking survives navigation reload and expires when the discovered task resolves', () => {
  const model = buildBagModel({journal:[lead],map});
  const state = {...initialBagState(model,{sectionId:'journal'}),journalPinnedId:lead.id};
  const restored = repairBagSelection(JSON.parse(JSON.stringify(state)),model);
  assert.equal(restored.journalPinnedId,lead.id);
  assert.equal(restored.selected.journal,lead.id);
  assert.equal(repairBagSelection(restored,buildBagModel({journal:[{...lead,state:'resolved'}],map})).journalPinnedId,null);
  assert.equal(repairBagSelection(restored,buildBagModel({journal:[],map})).journalPinnedId,null);
});

test('browsing, tracking and showing a location are separate production scene actions', () => {
  let targets=0,remembered=null;
  const bag = makeBagScene({journal:[lead],map,memory:{},focus:{sectionId:'journal'},
    setMapTarget:()=>{targets++;return true;},onRemember:value=>remembered=value});
  scenes.replace(bag);
  assert.equal(bag.debugState().nav.journalPinnedId,null);
  bag.key(key('Enter','Enter'));
  assert.equal(bag.debugState().nav.journalPinnedId,lead.id);
  assert.equal(remembered.journalPinnedId,lead.id);
  assert.equal(targets,0);
  bag.key(key(' ','Space'));
  assert.equal(bag.debugState().nav.sectionId,'map');
  assert.equal(bag.debugState().mapSelected.id,destination.id);
  assert.equal(targets,0,'viewing the map never sets a navigation destination');
  bag.key(key('Enter','Enter'));
  assert.equal(targets,1,'setting a destination remains the map own deliberate action');
  scenes.replace({id:'cleanup'});
});

test('M switches a root section to the map and closes it without opening another scene', () => {
  let resets=0;
  const bag = makeBagScene({journal:[lead],map,memory:{},focus:{sectionId:'journal'},onClearInput:()=>resets++});
  scenes.replace(bag);
  bag.key(key('m','KeyM'));
  assert.equal(scenes.top(),bag);
  assert.equal(bag.debugState().nav.sectionId,'map');
  bag.key(key('m','KeyM',{repeat:true}));
  assert.equal(scenes.top(),bag);
  bag.key(key('m','KeyM'));
  assert.equal(scenes.top(),null);
  assert.equal(resets,1,'closing releases movement/look input through the existing owner');
});

test('M leaves an inventory action or inspector route in control', () => {
  const bag=makeBagScene({equipment:['light'],map,memory:{},focus:{sectionId:'kit'}});
  scenes.replace(bag);
  bag.key(key('Enter','Enter'));
  const route=bag.debugState().route.type;
  assert.notEqual(route,'root');
  bag.key(key('m','KeyM'));
  assert.equal(bag.debugState().route.type,route);
  assert.equal(bag.debugState().nav.sectionId,'kit');
  scenes.replace({id:'cleanup'});
});

test('pause exposes journal and map destinations and stays underneath a case opened from it', () => {
  let maps=0;
  const pause=makePauseScene({onJournal:()=>{},onMap:()=>maps++});
  assert.ok(pause.view().items.includes('journal'));
  assert.ok(pause.view().items.includes('map'));
  pause.key(key('m','KeyM')); assert.equal(maps,1);
  scenes.replace(pause);
  const bag=makeBagScene({journal:[lead],map,memory:{},focus:{sectionId:'journal'}});
  scenes.push(bag);
  bag.key(key('Escape','Escape'));
  assert.equal(scenes.top(),pause);
  scenes.replace({id:'cleanup'});
});
