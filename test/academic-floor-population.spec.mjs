import test from 'node:test';
import assert from 'node:assert/strict';
import {ACADEMIC_FLOOR_POPULATION as ACTORS,ACADEMIC_FLOOR_GUESTS as GUESTS,
  ACADEMIC_FLOOR_HOLLOWS as HOLLOWS,academicFloorPopulationDialogue} from '../src/data/academic-floor-population.js';
import {ACADEMIC_FLOOR_POPULATION_BEATS as BEATS,ACADEMIC_FLOOR_POPULATION_GROUPS as GROUPS} from '../src/data/academic-floor-population.js';
import {ACADEMIC_POPULATION_RAIL_SUPPORT} from '../src/data/academic-floor-population.js';
import {ACADEMIC_SOCIETY_ACTORS} from '../src/data/academic-society.js';
import {createAcademicFloorPopulation,createAcademicFloorPopulationState} from '../src/game/academic-floor-population.js';

const enter=controller=>controller.tick(0,{onAcademicFloor:true});
const first=GUESTS[0].id;

test('eighteen ordinary people and eight hollows congregate with one deliberate room-to-room carrier',()=>{
  assert.equal(ACTORS.length,26);assert.equal(GUESTS.length,18);assert.equal(HOLLOWS.length,8);
  assert.equal(new Set(ACTORS.map(actor=>actor.id)).size,26);assert.equal(GUESTS.filter(actor=>actor.route).length,1);
  for(const actor of ACTORS){
    assert.equal(actor.name,null);assert.equal(actor.identity,null);assert.equal(actor.backstory,null);
    assert.equal(actor.blocks,false);assert.equal(actor.floor,10);assert.equal(actor.coordinateSpace,'authored-metres');
    assert.ok(actor.mesh.startsWith('academic_population_'));
    assert.ok(['attendant','listener','hollow-coat','unfinished-visitor'].includes(actor.designId));
  }
  for(const actor of GUESTS){assert.equal(actor.kind,'npc');assert.equal(actor.subtype,'npc');assert.equal(actor.interactive,true);assert.ok(actor.id.startsWith('academic-guest-'));}
  for(const actor of HOLLOWS){assert.equal(actor.kind,'hollow');assert.equal(actor.subtype,'hollow');assert.equal(actor.interactive,false);assert.equal(actor.voiceSpeaker,null);assert.equal(actor.sourceLabel,null);assert.ok(actor.id.startsWith('academic-hollow-'));}
});

test('ordinary role labels and brief voiced remarks do not invent biography or a quest',()=>{
  for(const actor of GUESTS){
    assert.ok(actor.roleLabel.length>0);assert.doesNotMatch(actor.roleLabel,/placeholder|unassigned|programme|unknown/i);
    assert.ok(['academic-attendant','academic-listener'].includes(actor.voiceSpeaker));
    for(let index=0;index<actor.remarks.length;index++){
      const dialogue=academicFloorPopulationDialogue(actor.id,{remarks:{[actor.id]:index}});
      assert.equal(Object.keys(dialogue.nodes).length,1);
      const node=dialogue.nodes.start;assert.equal(node.speaker,actor.roleLabel.toUpperCase());
      assert.ok(node.lines.length>=1&&node.lines.length<=3);assert.equal(node.choices,undefined);
      for(const line of node.lines){assert.equal(line.actorId,actor.id);assert.equal(line.who,'unknown');assert.equal(line.voiceSpeaker,actor.voiceSpeaker);assert.equal(line.sourceLabel,actor.sourceLabel);assert.equal(line.set,undefined);assert.equal(line.clear,undefined);assert.equal(line.societyAction,undefined);}
    }
  }
  for(const actor of HOLLOWS)assert.equal(academicFloorPopulationDialogue(actor.id),null);
});

test('save normalization discards unrelated identity, quest, position and unknown actor state',()=>{
  const state=createAcademicFloorPopulationState({remarks:{[first]:2.9,[GUESTS[1].id]:-5,[GUESTS[2].id]:Infinity,[GUESTS[3].id]:1e9,imaginary:10},quest:'complete',identity:'invented',inside:true,x:8});
  assert.deepEqual(Object.keys(state),['version','remarks']);
  assert.deepEqual(state.remarks,{...Object.fromEntries(GUESTS.map(actor=>[actor.id,0])),[first]:2,[GUESTS[3].id]:9999});
  assert.deepEqual(createAcademicFloorPopulationState(null),createAcademicFloorPopulationState());
});

test('only an ordinary person on this floor can begin a single incidental exchange',()=>{
  const controller=createAcademicFloorPopulation();assert.equal(controller.beginDialogue(first),null);
  enter(controller);assert.equal(controller.beginDialogue(HOLLOWS[0].id),null);assert.equal(controller.beginDialogue('unknown'),null);
  assert.ok(controller.beginDialogue(first));assert.equal(controller.beginDialogue(GUESTS[1].id),null);
  assert.equal(controller.view().activeDialogue,first);
});

test('cancelling or replacing a conversation does not spend its remark',()=>{
  const controller=createAcademicFloorPopulation();enter(controller);
  const initial=controller.beginDialogue(first);assert.deepEqual(controller.endDialogue(first,{completed:false}),[]);
  assert.equal(controller.save().remarks[first],0);assert.equal(controller.view().activeDialogue,null);
  assert.deepEqual(controller.beginDialogue(first),initial);
  assert.deepEqual(controller.endDialogue(GUESTS[1].id,{completed:true}),[]);
  assert.equal(controller.save().remarks[GUESTS[1].id],0);assert.equal(controller.view().activeDialogue,first);
});

test('terminal completion alone advances one remark and save/load retains the next incidental response',()=>{
  const controller=createAcademicFloorPopulation();enter(controller);const initial=controller.beginDialogue(first);
  const events=controller.endDialogue(first,{completed:true});assert.equal(events.length,1);assert.equal(events[0].stateChanged,true);
  assert.equal(controller.save().remarks[first],1);assert.equal(controller.view().activeDialogue,null);
  const loaded=createAcademicFloorPopulation(controller.save());enter(loaded);
  assert.notDeepEqual(loaded.beginDialogue(first).nodes.start.lines,initial.nodes.start.lines);
  loaded.endDialogue(first,{completed:true});assert.equal(loaded.save().remarks[first],2);
  assert.deepEqual(loaded.dialogue(first),initial);
});

test('leaving the floor cancels an unfinished remark without a quest or movement consequence',()=>{
  const controller=createAcademicFloorPopulation();enter(controller);controller.beginDialogue(first);
  assert.deepEqual(controller.tick(.1,{onAcademicFloor:false}),[]);
  assert.equal(controller.view().activeDialogue,null);assert.equal(controller.save().remarks[first],0);
  assert.deepEqual(controller.endDialogue(first,{completed:true}),[]);
  assert.ok(controller.actorFrame().every(actor=>actor.visible===false));
  enter(controller);assert.ok(controller.beginDialogue(first));
});

test('pause, hidden document, focus loss and modal suspension freeze the presentation clock',()=>{
  for(const condition of [{paused:true},{hidden:true},{focused:false},{nativeFocused:false},{suspended:true},{speechBusy:true},{adversaryBusy:true}]){
    const controller=createAcademicFloorPopulation();enter(controller);controller.tick(.1,{onAcademicFloor:true});
    const before=controller.actorFrame();
    controller.tick(60,{onAcademicFloor:true,...condition});assert.equal(controller.view().timeSec,.1);
    assert.deepEqual(controller.actorFrame(),before);
    controller.tick(.1,{onAcademicFloor:true});assert.equal(controller.view().timeSec,.2);
  }
});

test('regrouped hollows turn within their company but never relocate, follow or speak',()=>{
  const controller=createAcademicFloorPopulation();enter(controller);
  const anchors=()=>controller.actorFrame().filter(actor=>actor.kind==='hollow').map(({id,designId,x,y,visible,interactive,speaking})=>({id,designId,x,y,visible,interactive,speaking}));
  const initial=anchors();
  for(let i=0;i<100;i++)controller.tick(.1,{onAcademicFloor:true,listener:{x:i,y:260},visibleIds:i%2?HOLLOWS.map(a=>a.id):[],focusedActor:HOLLOWS[i%3].id});
  assert.deepEqual(anchors(),initial);
  controller.tick(0,{onAcademicFloor:false});enter(controller);assert.deepEqual(anchors(),initial);
});

const advance=(controller,seconds,context={})=>{const events=[];for(let i=0;i<Math.round(seconds*10);i++)events.push(...controller.tick(.1,{onAcademicFloor:true,canMove:()=>true,...context}));return events;};

test('the cup carrier moves continuously between rooms, yields to the visitor and keeps distance transient',()=>{
  const c=createAcademicFloorPopulation();enter(c);const initial=c.actorFrame(),walkers=GUESTS.filter(actor=>actor.route);
  advance(c,15);const moved=c.actorFrame();
  for(const actor of walkers){const frame=moved.find(f=>f.id===actor.id);assert.ok(frame.distance>0,actor.id+' never walks');assert.ok(frame.distance<=15*actor.speed);assert.ok(actor.route.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));}
  for(const actor of ACTORS.filter(a=>!a.route)){const before=initial.find(f=>f.id===actor.id),after=moved.find(f=>f.id===actor.id);assert.equal(after.x,before.x);assert.equal(after.y,before.y);}
  const waiter=createAcademicFloorPopulation();enter(waiter);const actor=walkers[0];advance(waiter,15,{listener:{x:actor.x,y:actor.y}});
  const held=waiter.actorFrame().find(f=>f.id===actor.id);assert.equal(held.x,actor.x);assert.equal(held.y,actor.y);assert.equal(held.distance,0);
  assert.deepEqual(Object.keys(c.save()),['version','remarks']);assert.equal('distance' in c.save(),false);
});

test('an active ordinary conversation freezes all walking roots until cancellation or completion',()=>{
  const c=createAcademicFloorPopulation();enter(c);advance(c,12);assert.ok(c.beginDialogue(first));
  const frozen=c.actorFrame().map(f=>({id:f.id,x:f.x,y:f.y,distance:f.distance,bodyYaw:f.bodyYaw}));advance(c,20);
  assert.deepEqual(c.actorFrame().map(f=>({id:f.id,x:f.x,y:f.y,distance:f.distance,bodyYaw:f.bodyYaw})),frozen);
  c.endDialogue(first,{completed:false});advance(c,10);assert.ok(c.actorFrame().some(f=>f.route&&f.distance>frozen.find(p=>p.id===f.id).distance));
});

test('local silent company exchanges produce bounded reciprocal gestures without invented jaw speech',()=>{
  const c=createAcademicFloorPopulation();enter(c);advance(c,.7);
  const lead=GROUPS[0].actors[0],partner=GROUPS[0].actors[1],frames=c.actorFrame();
  assert.equal(frames.find(f=>f.id===lead).performance.role,'speaker');assert.equal(frames.find(f=>f.id===partner).performance.role,'listener');
  assert.ok(frames.every(f=>!f.speaking));assert.equal(frames.find(f=>f.id===lead).performance.silent,true);
  advance(c,2);assert.equal(c.actorFrame().find(f=>f.id===lead).performance,null,'gesture has settled before a long unvoiced hold');
});

test('only actual line identity and voice drive the correct mouth and addressed listener',()=>{
  const c=createAcademicFloorPopulation();enter(c);const line=BEATS[0].lines[0];
  const context={speakingActorId:line.actorId,voiceActorId:line.actorId,speakingLine:line,performanceTimeSec:10};
  const frames=c.actorFrame(context);assert.deepEqual(frames.filter(f=>f.speaking).map(f=>f.id),[line.actorId]);
  assert.equal(frames.find(f=>f.id===line.toActorId).performance.role,'listener');
  const later=c.actorFrame({...context,performanceTimeSec:10.7});assert.ok(Math.abs(later.find(f=>f.id===line.actorId).performance.elapsedSec-.7)<1e-8);
  assert.deepEqual(c.actorFrame(),later,'read-only audio/proxy queries must retain the freshest render line and its clock');
  assert.ok(c.actorFrame({...context,voiceActorId:null}).every(f=>!f.speaking),'held caption is not an active voice');
  assert.ok(c.actorFrame({...context,speakingLine:{...line,actorId:'somebody-else'}}).every(f=>!f.speaking));
});

test('four short ambient exchanges require explicit audibility, acknowledgement and a24-second quiet interval',()=>{
  const c=createAcademicFloorPopulation();enter(c);assert.deepEqual(advance(c,10),[]);
  const firstEvents=advance(c,.1,{audibleGroupIds:['reception']});assert.equal(firstEvents.length,1);const event=firstEvents[0];
  assert.equal(event.type,'population-exchange');assert.equal(event.lines.length,2);assert.equal(c.view().issuedBeatIds.length,0);
  assert.deepEqual(advance(c,40,{audibleGroupIds:GROUPS.map(g=>g.id)}),[],'unacknowledged family cannot issue another beat');
  c.settleAmbient(event.id,{completed:true});assert.deepEqual(c.view().issuedBeatIds,[event.beatId]);
  assert.deepEqual(advance(c,23.9,{audibleGroupIds:['chamber']}),[]);
  const next=advance(c,.1,{audibleGroupIds:['chamber']})[0];assert.equal(next.groupId,'chamber');
  c.settleAmbient(next.id,{completed:false});assert.equal(c.view().issuedBeatIds.includes(next.beatId),false);
  c.tick(0,{onAcademicFloor:false});assert.equal(c.view().pending,null);enter(c);assert.deepEqual(c.view().issuedBeatIds,[]);
  assert.equal('issuedBeatIds' in c.save(),false);
  const cancelled=createAcademicFloorPopulation();enter(cancelled);const attempt=advance(cancelled,8,{audibleGroupIds:['reception']})[0];
  cancelled.settleAmbient(attempt.id,{completed:false});assert.deepEqual(advance(cancelled,23.9,{audibleGroupIds:['reception']}),[]);
  assert.equal(advance(cancelled,.1,{audibleGroupIds:['reception']}).length,1,'cancelled first attempt still gets the full quiet interval');
});

test('all ordinary remarks retain legacy counts and new guests begin unspent on reload',()=>{
  const c=createAcademicFloorPopulation({remarks:{'academic-guest-piano':4,'academic-guest-window':2}});
  assert.equal(c.save().remarks['academic-guest-piano'],4);assert.equal(c.save().remarks['academic-guest-window'],2);
  assert.ok(GUESTS.slice(4).every(actor=>c.save().remarks[actor.id]===0));
  for(const actor of GUESTS)assert.equal(actor.remarks.length,2,actor.id+' needs two complete small remark sets');
  for(const beat of BEATS){assert.equal(beat.lines.length,2);assert.equal(new Set(beat.lines.map(line=>line.actorId)).size,2);assert.equal(beat.lines[0].toActorId,beat.lines[1].actorId);}
});

test('presentation phase and active dialogue stay transient while saved state remains remarks only',()=>{
  const controller=createAcademicFloorPopulation();enter(controller);controller.tick(.1,{onAcademicFloor:true});controller.beginDialogue(first);
  const saved=controller.save();assert.deepEqual(Object.keys(saved),['version','remarks']);
  controller.load(saved);assert.equal(controller.view().inside,false);assert.equal(controller.view().timeSec,0);assert.equal(controller.view().activeDialogue,null);
  assert.ok(controller.actorFrame().every(actor=>!actor.visible));
});

test('four named-anchored gatherings are deliberately heterogeneous, including an apparition majority',()=>{
  assert.equal(GROUPS.length,4);
  const counts={};
  for(const group of GROUPS){
    const members=ACTORS.filter(actor=>actor.groupId===group.id),ordinary=members.filter(a=>a.kind==='npc'),hollows=members.filter(a=>a.kind==='hollow');
    assert.deepEqual(group.members,members.map(a=>a.id));assert.ok(ordinary.length&&hollows.length&&group.namedActors.length);
    const named=group.namedActors.map(id=>ACADEMIC_SOCIETY_ACTORS.find(a=>a.id===id));assert.ok(named.every(Boolean));
    for(const actor of members)assert.ok(named.some(n=>Math.hypot(n.x-actor.x,n.y-actor.y)<8),actor.id+' has no physically local OC anchor');
    counts[group.id]=[ordinary.length,hollows.length,named.length];
  }
  assert.deepEqual(counts,{reception:[6,1,2],chamber:[8,1,2],'north-gallery':[1,4,2],corridor:[3,2,1]});
  assert.ok(counts['north-gallery'][1]>counts['north-gallery'][0]+counts['north-gallery'][2]);
});

test('ordinary activities carry concrete props and the rail lean preserves its measured support and planted heading',()=>{
  for(const actor of GUESTS){assert.ok(['talk','smoke','drink','lean'].includes(actor.activity));assert.ok(['cup','glass','cigarette'].includes(actor.heldProp));}
  const lean=GUESTS.find(a=>a.activity==='lean');assert.equal(lean.id,'academic-guest-window');
  assert.equal(lean.support,ACADEMIC_POPULATION_RAIL_SUPPORT);assert.deepEqual(lean.support,{id:'academic-gallery-west-crown',x:28.84,y:249.2,height:1.208,side:'R',kind:'rail'});
  assert.ok(Math.abs(Math.hypot(lean.x-lean.support.x,lean.y-lean.support.y)-.54)<1e-10);
  const c=createAcademicFloorPopulation();enter(c);advance(c,20);const frame=c.actorFrame().find(a=>a.id===lean.id);
  assert.equal(frame.bodyYaw,Math.PI/2);assert.notEqual(frame.yaw,frame.bodyYaw,'head can attend to the nearby named company while planted support remains fixed');
});

test('a carrier waits for actual live route clearance and reverses only at its two social stops',()=>{
  const actor=GUESTS.find(a=>a.route),c=createAcademicFloorPopulation();enter(c);
  for(let i=0;i<300;i++)c.tick(.1,{onAcademicFloor:true});
  let frame=c.actorFrame().find(a=>a.id===actor.id);assert.equal(frame.distance,0,'missing door/prop evidence fails closed');
  advance(c,20,{canMove:()=>false});assert.equal(c.actorFrame().find(a=>a.id===actor.id).distance,0);
  const samples=[];for(let i=0;i<1400;i++){c.tick(.1,{onAcademicFloor:true,canMove:()=>true});samples.push(c.actorFrame().find(a=>a.id===actor.id));}
  assert.ok(samples.some(a=>Math.abs(a.x-23)<1e-8&&Math.abs(a.y-244.5)<1e-8));
  assert.ok(samples.some((a,i)=>i>0&&a.x<samples[i-1].x),'returns along the same connecting path');
  const far=samples.findIndex(a=>Math.abs(a.x-23)<1e-8&&Math.abs(a.y-244.5)<1e-8);
  assert.ok(samples.slice(far+1,far+80).every(a=>a.x===23&&a.y===244.5&&a.mode==='idle'),'social endpoint retains an eight-second pause after the arrival frame');
  assert.equal(actor.routeMode,'shuttle');assert.deepEqual(actor.routeGroupIds,['chamber','north-gallery']);
});

test('own-dialogue presentation keeps unrelated activities alive while all walking roots remain fixed',()=>{
  const c=createAcademicFloorPopulation();enter(c);advance(c,17);c.beginDialogue(first);
  const before=c.actorFrame({performanceTimeSec:30}),roots=before.map(a=>[a.id,a.x,a.y,a.distance]);advance(c,3);
  const after=c.actorFrame({performanceTimeSec:33});assert.deepEqual(after.map(a=>[a.id,a.x,a.y,a.distance]),roots);
  assert.ok(after.every((a,i)=>a.activityPhase-before[i].activityPhase===3));
  assert.deepEqual(c.actorFrame({performanceTimeSec:33}),after,'frozen presentation clock is idempotent');
});
