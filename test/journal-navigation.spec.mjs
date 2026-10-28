import test from 'node:test';
import assert from 'node:assert/strict';
import { isMapShortcut } from '../src/game/map-shortcut.js';
import { buildBagModel } from '../src/game/bag-model.js';
import { initialBagState, repairBagSelection } from '../src/game/bag-navigation.js';
import { makeBagScene } from '../src/game/bag.js';
import { makePauseScene } from '../src/game/pause.js';
import * as scenes from '../src/game/scenes.js';
import { MAP_LAB_CASES, mapLabModel } from '../src/game/map-fixtures.js';
import { sampleControl, controlMechanicsSnapshot } from '../src/game/control-mechanics.js';

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

test('controller map and paging verbs are owned by the journal without stealing list navigation', () => {
  const bag=makeBagScene({journal:[lead],map,memory:{},focus:{sectionId:'journal'}});
  scenes.replace(bag);
  assert.deepEqual(bag.modalActions,['mapFile','mapFloorPrev','mapFloorNext']);
  assert.equal(bag.modalActions.includes('mark'),false,'D-pad up retains list navigation');
  bag.key({controllerAction:'mapFile'});
  assert.equal(bag.debugState().nav.sectionId,'map');
  scenes.replace({id:'cleanup'});
});

test('journal hover only points; presses commit and release their original physical control', (t) => {
  let now=0;
  t.mock.method(performance,'now',()=>now);
  const other={...lead,id:'quest:other',title:'Another known lead'};
  for(const release of ['pointerup','pointercancel','lostpointercapture']) {
    now=0;
    const bag=makeBagScene({journal:[lead,other],map,memory:{},focus:{sectionId:'journal'}});
    bag.enter();bag.render();
    const hit=bag.debugState().hitRegions.find(hit=>hit.id==='bag:journal:jog-next');
    const point={pointerId:7,cellX:hit.x+hit.w/2,cellY:hit.y+hit.h/2,button:0};
    bag.pointer({type:'pointermove',...point});
    now=100;
    assert.equal(bag.debugState().nav.selected.journal,lead.id,'hover cannot browse on the player’s behalf');
    assert.deepEqual(sampleControl(hit.id),{travel:0,lampHeat:0});
    bag.pointer({type:'pointerdown',...point});
    assert.equal(bag.debugState().nav.selected.journal,other.id);
    assert.equal(bag.debugState().nav.journalPinnedId,null,'selection does not track');
    now=200; assert.equal(sampleControl(hit.id).travel,1);
    bag.pointer({type:release,pointerId:7,cellX:-100,cellY:-100});
    now=350; assert.equal(sampleControl(hit.id).travel,0,`${release} releases outside the cap`);
    bag.render();
    const track=bag.debugState().hitRegions.find(hit=>hit.id==='bag:journal:track');
    bag.pointer({type:'pointerdown',pointerId:8,cellX:track.x+track.w/2,cellY:track.y+track.h/2,button:0});
    assert.equal(bag.debugState().nav.journalPinnedId,other.id);
    now=450; assert.equal(sampleControl(track.id).travel,1);
    bag.pointer({type:'pointercancel'});
    assert.equal(controlMechanicsSnapshot().ids.some(id=>id.startsWith('bag:')),false,'focus cancellation clears held controls');
    bag.exit();
  }
});

test('journal keyboard controls spring back and inactive page/map keys cannot depress', (t) => {
  let now=0;
  t.mock.method(performance,'now',()=>now);
  const bag=makeBagScene({journal:[lead,{...lead,id:'quest:other'}],map,memory:{},focus:{sectionId:'journal'}});
  bag.enter();bag.render();
  const down=key('ArrowDown','ArrowDown');
  bag.key(down);now=100;
  assert.equal(sampleControl('bag:journal:jog-next').travel,1);
  bag.keyup(down);now=250;
  assert.equal(sampleControl('bag:journal:jog-next').travel,0);
  const confirm=key('Enter','Enter');bag.key(confirm);now=350;
  assert.equal(sampleControl('bag:journal:track').travel,1);
  bag.keyup(confirm);now=500;
  assert.equal(sampleControl('bag:journal:track').travel,0);
  assert.equal(bag.debugState().nav.journalPinnedId,'quest:other');
  bag.exit();
  const empty=makeBagScene({journal:[],map,memory:{},focus:{sectionId:'journal'}});
  empty.enter();empty.render();
  empty.key(key('PageDown','PageDown'));empty.key(key(' ','Space'));empty.key(confirm);
  now=700;
  assert.equal(sampleControl('bag:journal:next-page').travel,0);
  assert.equal(sampleControl('bag:journal:map').travel,0);
  assert.equal(sampleControl('bag:journal:track').travel,0);
  empty.exit();
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

test('known leads and call records do not inflate open commitments, and tracking is not acceptance',()=>{
  const opportunity={...lead,nature:'lead',commitment:'none',trackable:true,hasOpenCommitment:false};
  const record={...lead,id:'quest:call',nature:'record',state:'resolved',trackable:false,hasOpenCommitment:false};
  const bag=makeBagScene({journal:[opportunity,record],map,memory:{},focus:{sectionId:'journal'}});
  scenes.replace(bag);
  assert.equal(bag.debugState().model.sections.find(s=>s.id==='journal').countLabel,'0 OPEN');
  bag.key(key('Enter','Enter'));
  assert.equal(bag.debugState().nav.journalPinnedId,opportunity.id);
  assert.equal(bag.debugState().selected.commitment,'none');
  bag.key(key('ArrowDown','ArrowDown'));bag.key(key('Enter','Enter'));
  assert.equal(bag.debugState().nav.journalPinnedId,opportunity.id,'an untrackable record cannot replace a followed lead');
  scenes.replace({id:'cleanup'});
});

test('only presenting a changed journal file acknowledges it; inventory, covered views and reload do not invent updates',()=>{
  let entries=[{...lead,trackable:true,hasOpenCommitment:true}],memory={};
  const options={getJournal:()=>entries,map,onRemember:value=>memory=JSON.parse(JSON.stringify(value))};
  let bag=makeBagScene({...options,memory,focus:{sectionId:'kit'}});
  scenes.replace(bag);bag.render();bag.key(key('Escape','Escape'));
  const before=JSON.stringify(memory.journalReview);
  entries=[{...entries[0],state:'resolved',trackable:false,hasOpenCommitment:false,
    closure:{label:'HELP GIVEN',text:'The tray is back with Iona.'},next:null}];
  bag=makeBagScene({...options,memory,focus:{sectionId:'kit'}});
  scenes.replace(bag);bag.render();
  assert.match(bag.debugState().model.sections.find(s=>s.id==='journal').countLabel,/1 NEW/);
  assert.equal(JSON.stringify(memory.journalReview),before,'opening inventory does not acknowledge a journal change');
  bag.key(key('5','Digit5'));
  const cover={id:'pause',blocksWorld:true,allowsLook:false};scenes.push(cover);bag.render();
  assert.equal(JSON.stringify(memory.journalReview),before,'a covered file has not been presented');
  scenes.pop();bag.render();
  const shown=bag.debugState().model.sections.find(s=>s.id==='journal');
  assert.equal(shown.countLabel,'0 OPEN');assert.equal(shown.entries[0].updated,true);
  assert.equal(shown.entries[0].unseen,false);assert.notEqual(JSON.stringify(memory.journalReview),before);
  assert.equal(entries[0].state,'resolved');
  bag.key(key('Escape','Escape'));
  bag=makeBagScene({...options,memory,focus:{sectionId:'journal'}});scenes.replace(bag);bag.render();
  assert.equal(bag.debugState().selected.updated,false,'reloading a presented change has no repeated announcement');
  scenes.replace({id:'cleanup'});
});

test('explicit empty run memory starts quietly without inheriting prior-run receipts or tracking',()=>{
  let entries=[{...lead,commitment:'accepted',stage:{id:'old',label:'Old run'},trackable:true,hasOpenCommitment:true}];
  const old=makeBagScene({getJournal:()=>entries,map,memory:{},focus:{sectionId:'journal'}});
  scenes.replace(old);old.render();old.key(key('Enter','Enter'));
  assert.equal(old.debugState().nav.journalPinnedId,lead.id);
  old.key(key('Escape','Escape'));

  let memory=null;
  entries=[{...lead,commitment:'none',stage:{id:'new',label:'New run'},trackable:true,hasOpenCommitment:false}];
  const options={getJournal:()=>entries,map,onRemember:value=>memory=JSON.parse(JSON.stringify(value))};
  let fresh=makeBagScene({...options,memory:null,focus:{sectionId:'journal'}});
  scenes.replace(fresh);fresh.render();
  assert.equal(fresh.debugState().nav.journalPinnedId,null,'an explicit absent save cannot adopt another run’s pin');
  assert.equal(fresh.debugState().selected.updated,false,'first presentation establishes a quiet baseline for this run');
  assert.equal(fresh.debugState().selected.unseen,false);
  fresh.key(key('Escape','Escape'));

  entries=[{...entries[0],commitment:'accepted',stage:{id:'accepted',label:'A new agreement'},hasOpenCommitment:true}];
  fresh=makeBagScene({...options,memory,focus:{sectionId:'kit'}});
  scenes.replace(fresh);fresh.render();
  assert.equal(fresh.debugState().model.sections.find(s=>s.id==='journal').entries[0].unseen,true,'later owner changes still become unread');
  fresh.key(key('5','Digit5'));fresh.render();
  assert.equal(fresh.debugState().selected.updated,true);
  assert.equal(fresh.debugState().selected.unseen,false);
  fresh.key(key('Enter','Enter'));fresh.key(key('Escape','Escape'));

  const reopened=makeBagScene({...options,focus:{sectionId:'journal'}});
  scenes.replace(reopened);reopened.render();
  assert.equal(reopened.debugState().selected.updated,false,'omitting memory retains the existing same-session receipt fallback');
  assert.equal(reopened.debugState().nav.journalPinnedId,lead.id);
  scenes.replace({id:'cleanup'});
});

test('a new accepted follow-up leaves its parent fulfilled and needs its own tracking choice',()=>{
  const original={...lead,trackable:true,trackingKey:'quest:known:service',hasOpenCommitment:true,commitment:'accepted'};
  const first=buildBagModel({journal:[original],map});
  const memory={...initialBagState(first,{sectionId:'journal'}),journalPinnedId:lead.id,journalPinnedKey:original.trackingKey};
  const followUp={...original,state:'resolved',commitment:'fulfilled',trackingKey:'quest:known:opener',
    closure:{label:'HELP GIVEN',text:'Service is finished.'},followUp:{id:'opener',label:'The opener',commitment:'accepted'}};
  const bag=makeBagScene({journal:[followUp],map,memory,focus:{sectionId:'journal'}});scenes.replace(bag);
  assert.equal(bag.debugState().nav.journalPinnedId,null);
  assert.equal(bag.debugState().selected.state,'resolved');
  assert.equal(bag.debugState().model.sections.find(s=>s.id==='journal').countLabel,'1 OPEN');
  bag.key(key('Enter','Enter'));
  assert.equal(bag.debugState().nav.journalPinnedKey,followUp.trackingKey);
  assert.equal(bag.debugState().selected.closure.label,'HELP GIVEN');
  scenes.replace({id:'cleanup'});
});
