import test from 'node:test';
import assert from 'node:assert/strict';
import {ACADEMIC_FLOOR_POPULATION} from '../src/data/academic-floor-population.js';
import {ACADEMIC_SOCIETY_ACTORS,ACADEMIC_SOCIETY_BEATS} from '../src/data/academic-society.js';
import {ACADEMIC_BOUNCER_ACTORS} from '../src/data/academic-bouncers.js';
import {ACADEMIC_FLOOR_POPULATION_BEATS} from '../src/data/academic-floor-population.js';
import {createAcademicSociety} from '../src/game/academic-society.js';
import {createAcademicFloorPopulation} from '../src/game/academic-floor-population.js';
import {createAcademicFloorReturns,normalizeAcademicFloorReturns,academicFloorReturnRegion,
  academicFloorActorPresent,academicFloorProtectedActorIds} from '../src/game/academic-floor-returns.js';

const inside={active:true,inside:true,away:false,admitted:true},away={active:true,inside:false,away:true,admitted:true};
const advance=(controller,seconds,context)=>{const out=[];for(let n=0;n<Math.round(seconds*10);n++)out.push(...controller.tick(.1,context));return out;};
const returns=(controller,n)=>{controller.tick(.1,inside);for(let i=0;i<n;i++){advance(controller,3,away);controller.tick(.1,inside);}return controller;};
const all=[...ACADEMIC_FLOOR_POPULATION,...ACADEMIC_SOCIETY_ACTORS,...ACADEMIC_BOUNCER_ACTORS];
const ids=stage=>new Set(all.filter(actor=>academicFloorActorPresent(actor,stage)).map(actor=>actor.id));

test('three real returns retire whole gatherings in order, leaving the dangerous late guest',()=>{
  const c=createAcademicFloorReturns();assert.equal(c.save().visits,0);
  c.tick(.1,inside);assert.equal(c.save().returns,0);assert.equal(ids(c.save()).size,35);
  const expected=[26,14,1];let previous=ids(c.save());
  for(let i=0;i<3;i++){
    const departureEvents=advance(c,3,away),beforeEntry=ids(c.save());
    assert.equal(departureEvents.filter(event=>event.stageChanged).length,1,'departure happens while physically away');
    const events=c.tick(.1,inside),present=ids(c.save());
    assert.deepEqual(present,beforeEntry,'re-entry cannot make a visible person disappear');
    assert.equal(events.length,1);assert.equal(events[0].stageChanged,false);
    assert.equal(c.save().returns,i+1);assert.equal(present.size,expected[i]);
    for(const id of present)assert.ok(previous.has(id),'departed people cannot reappear');previous=present;
  }
  assert.deepEqual([...ids(c.save())],['academic-hollow-late-guest']);
  advance(c,3,away);assert.equal(c.tick(.1,inside)[0].stageChanged,false);assert.equal(c.save().returns,3);
});

test('a stair render group is not a visit; landing jitter and short departures do not spend returns',()=>{
  assert.deepEqual(academicFloorReturnRegion({renderGroup:'academic',spaceId:'main_stair',flightId:'upper',y:7.2}),{inside:false,away:true});
  assert.deepEqual(academicFloorReturnRegion({renderGroup:'academic',spaceId:'main_stair',y:9.8}),{inside:false,away:false});
  assert.deepEqual(academicFloorReturnRegion({renderGroup:'academic',spaceId:'academic',y:10}),{inside:true,away:false});
  const c=createAcademicFloorReturns();c.tick(.1,inside);
  for(let n=0;n<20;n++){advance(c,2.9,away);advance(c,3,{active:true,inside:false,away:false});c.tick(.1,inside);}
  assert.equal(c.save().returns,0);assert.equal(c.save().visits,1);
});

test('pause, overlays, hidden windows, focus loss and inactive worlds cannot qualify absence',()=>{
  for(const blocked of[{paused:true},{hidden:true},{focused:false},{suspended:true},{active:false}]){
    const c=createAcademicFloorReturns();c.tick(.1,inside);advance(c,2,away);
    const before=c.save();advance(c,60,{...away,...blocked});assert.deepEqual(c.save(),before);
    c.tick(.1,inside);assert.equal(c.save().returns,0);
  }
});

test('same-playthrough loading preserves the visit and an earned departure without counting reloads',()=>{
  let c=returns(createAcademicFloorReturns(),1),state=c.save();
  for(let n=0;n<8;n++){c=createAcademicFloorReturns(state);c.tick(.1,inside);state=c.save();}
  assert.equal(state.returns,1);assert.equal(state.visits,2);
  advance(c,1.5,away);c=createAcademicFloorReturns(c.save());advance(c,1.5,away);c.tick(.1,inside);
  assert.equal(c.save().returns,2);assert.equal(createAcademicFloorReturns().save().returns,0,'new playthrough starts full');
});

test('teleports and explicit debug placements rebase the boundary without advancing or arming a return',()=>{
  const c=createAcademicFloorReturns();c.tick(.1,{...inside,position:{x:1,y:10,z:1}});
  advance(c,3,{...away,position:{x:1,y:8,z:1}});
  assert.equal(c.save().returnArmed,false,'large first jump was not a real departure');
  c.tick(.1,inside);
  // Even an already qualified real absence cannot become a return by warp.
  advance(c,3,away);assert.equal(c.save().returnArmed,true);
  c.tick(.1,{...inside,position:{x:100,y:10,z:100}});assert.equal(c.save().returns,0);
  advance(c,3,{...away,debug:true});c.tick(.1,inside);assert.equal(c.save().returns,0);
});

test('old society visit counts establish prior presence without retroactive population depletion',()=>{
  const c=createAcademicFloorReturns(undefined,{legacyVisited:true});
  assert.equal(c.save().visits,1);assert.equal(c.save().returns,0);c.tick(.1,inside);assert.equal(c.save().returns,0);
  advance(c,3,away);c.tick(.1,inside);assert.equal(c.save().returns,1);
  assert.deepEqual(normalizeAcademicFloorReturns({visits:-3,returns:100,presence:'outside',awaySeconds:Infinity}),normalizeAcademicFloorReturns());
  assert.equal(normalizeAcademicFloorReturns({visits:2,returns:3}).returns,1);
});

test('a completed authored roof ladder can cross the floor boundary without becoming a debug return',()=>{
  const c=createAcademicFloorReturns();c.tick(.1,{...inside,position:{x:1,y:10,z:1}});
  c.tick(0,{...away,position:{x:25,y:17,z:1},authorisedTraversal:true});
  advance(c,3,{...away,position:{x:25,y:17,z:1}});
  c.tick(0,{...inside,position:{x:1,y:10,z:1},authorisedTraversal:true});
  assert.equal(c.save().returns,1);
});

test('guards retained for admission do not disappear on the final dialogue close',()=>{
  const c=createAcademicFloorReturns();c.tick(.1,inside);
  for(let n=0;n<3;n++){advance(c,3,{...away,admitted:false});c.tick(.1,{...inside,admitted:false});}
  assert.equal(c.save().populationStage,3);assert.equal(c.save().guardsDeparted,false);
  assert.ok(ACADEMIC_BOUNCER_ACTORS.every(actor=>academicFloorActorPresent(actor,c.save())));
  c.tick(.1,{...inside,admitted:true});
  assert.equal(c.save().guardsDeparted,false,'completed admission while present preserves both bodies');
  advance(c,3,away);assert.equal(c.save().guardsDeparted,true);
  assert.ok(ACADEMIC_BOUNCER_ACTORS.every(actor=>!academicFloorActorPresent(actor,c.save())));
});

test('a physical departure releases borrowed voice without fabricating another society visit',()=>{
  const society=createAcademicSociety();society.tick(0,{onAcademicFloor:true});
  const tree=society.beginDialogue('emile');society.endDialogue('emile',{completed:true,choices:[tree.nodes.need.choices.find(choice=>choice.societyAction==='lend')]});
  assert.equal(society.save().consent,'lent');const visits=society.save().visits;
  const events=society.releaseVoiceOnDeparture();assert.equal(events[0].type,'released');assert.equal(events[0].reason,'leave');
  assert.equal(society.save().consent,'left');assert.equal(society.save().loanRemaining,0);assert.equal(society.save().visits,visits);
  assert.deepEqual(society.releaseVoiceOnDeparture(),[]);
});

test('admission, active conversations and revocable voice loans are the only temporary crowd protections',()=>{
  const unadmitted=academicFloorProtectedActorIds(),admitted=academicFloorProtectedActorIds({admitted:true});
  assert.deepEqual([...unadmitted],ACADEMIC_BOUNCER_ACTORS.map(actor=>actor.id));assert.equal(admitted.size,0);
  const lent=academicFloorProtectedActorIds({admitted:true,consent:'lent',dialogueActorIds:['noe','not-a-real-actor']});
  assert.deepEqual([...lent],['noe','emile','lucien','celeste']);
  assert.ok(academicFloorActorPresent('emile',3,{protectedActorIds:lent}));
  assert.equal(academicFloorActorPresent('emile',3),false);
  for(const id of ['academic-held','academic-bust-5','any-future-classroom-adversary'])assert.equal(academicFloorActorPresent(id,3),true);
});

test('absent named actors cannot greet, emit ambient conversations or accept direct interaction',()=>{
  const society=createAcademicSociety({visits:3,consent:'declined'}),active=ids(1);
  for(let n=0;n<100;n++)assert.deepEqual(society.tick(.1,{onAcademicFloor:true,listener:{x:16.5,y:276},activeActorIds:active}),n===0?[{type:'entered',id:'society:visit:3',stateChanged:true}]:[]);
  assert.equal(society.beginDialogue('odette'),null);assert.ok(society.actorFrame().find(actor=>actor.id==='odette').visible===false);
  assert.ok(society.beginDialogue('celeste'));society.endDialogue('celeste');
  const deserted=ids(3);let events=[];
  for(let n=0;n<200;n++)events.push(...society.tick(.1,{onAcademicFloor:true,listener:{x:12,y:246},activeActorIds:deserted}));
  assert.ok(events.every(event=>!event.lines));assert.ok(society.actorFrame().every(actor=>!actor.visible));
  assert.equal(society.beginDialogue('emile'),null);
});

test('population frames, incidental dialogue and all ambient speakers obey the same present cohort',()=>{
  const c=createAcademicFloorPopulation();let events=[];
  for(let n=0;n<100;n++)events.push(...c.tick(.1,{onAcademicFloor:true,activeActorIds:ids(1),audibleGroupIds:['reception','chamber','north-gallery','corridor']}));
  assert.ok(events.every(event=>event.groupId!=='reception'));
  assert.equal(c.beginDialogue('academic-guest-threshold'),null);
  assert.equal(c.actorFrame().find(actor=>actor.id==='academic-guest-threshold').visible,false);
  c.tick(0,{onAcademicFloor:false,activeActorIds:ids(3)});events=[];
  for(let n=0;n<300;n++)events.push(...c.tick(.1,{onAcademicFloor:true,activeActorIds:ids(3),audibleGroupIds:['reception','chamber','north-gallery','corridor']}));
  assert.deepEqual(events,[]);assert.deepEqual(c.actorFrame().filter(actor=>actor.visible).map(actor=>actor.id),['academic-hollow-late-guest']);
});

test('cohort boundaries never leave half an authored ambient exchange alive',()=>{
  for(const stage of[0,1,2,3])for(const beat of[...ACADEMIC_SOCIETY_BEATS,...ACADEMIC_FLOOR_POPULATION_BEATS]){
    const speakers=beat.lines.filter(line=>line.actorId).map(line=>academicFloorActorPresent(line.actorId,stage));
    assert.equal(new Set(speakers).size,1,`${stage}: ${beat.id} has a stranded speaker`);
  }
});
