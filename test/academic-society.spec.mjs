import test from 'node:test';
import assert from 'node:assert/strict';
import {createAcademicSociety,createAcademicSocietyState,academicSocietyArea} from '../src/game/academic-society.js';
import {ACADEMIC_SOCIETY_ACTORS as ACTORS,ACADEMIC_SOCIETY_BEATS as BEATS,
  ACADEMIC_SOCIETY_TIMING as T,ACADEMIC_SOCIETY_TOPICS as TOPICS,
  ACADEMIC_SOCIETY_PERFORMANCE_CUES as CUES,ACADEMIC_SOCIETY_RESPONSE_CUES as RESPONSES,
  academicSocietyDialogue,academicSocietyBeatLines} from '../src/data/academic-society.js';
import {ACADEMIC_SOCIETY_CHARACTER_DESIGNS as DESIGNS} from '../src/data/academic-society-character-design.js';
import {conservatory,ACADEMIC_ENTRY} from '../src/data/floorplan/conservatory.js';
import {CELL} from '../src/data/floorplan/legend.js';
import * as FP from '../src/world/floorplan.js';
import * as HEAD from '../src/game/marble-head.js';

const byId=Object.fromEntries(ACTORS.map(actor=>[actor.id,actor]));
const context=listener=>({onAcademicFloor:true,listener});
const pair=context({x:10,y:247}),arrival=context(byId.odette),gallery=context(byId.lucien);
const enter=(c=pair)=>{const society=createAcademicSociety();society.tick(0,c);return society;};
const advance=(society,seconds,c=pair)=>{
  const events=[];for(let at=0;at<seconds;at+=.25){
    const issued=society.tick(Math.min(.25,seconds-at),c);events.push(...issued);
    // This state-test harness explicitly completes each emitted local chain;
    // separate tests below exercise pending delivery/cancellation and timeout.
    for(const event of issued)if(event.type==='social')society.settleAmbient(event.id,{completed:true});
  }return events;
};
const choice=(tree,node,action)=>tree.nodes[node].choices.find(c=>c.societyAction===action);
function lend(society){
  const tree=society.beginDialogue('emile');assert.ok(tree);
  const selected=choice(tree,'need','lend');assert.ok(selected);
  return society.endDialogue('emile',{completed:true,choices:[tree.nodes.start.choices.find(c=>c.societyTopic==='emile:need'),selected]});
}
function withdraw(society,id='lucien'){
  const tree=society.beginDialogue(id);return society.endDialogue(id,{completed:true,choices:[choice(tree,'start','withdraw')]});
}

test('seven original named people match their actual character designs and occupy accessible third-floor rooms',()=>{
  assert.deepEqual(ACTORS.map(a=>a.id).sort(),['agathe','celeste','emile','lucien','noe','odette','sabine']);
  FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
    connectors:conservatory.connectors,edgePortals:conservatory.edgePortals,doors:conservatory.doors});
  for(const actor of ACTORS){
    assert.equal(actor.name,DESIGNS[actor.id].name);assert.equal(actor.mesh,DESIGNS[actor.id].mesh);
    assert.equal(actor.height,DESIGNS[actor.id].height);assert.equal(actor.coordinateSpace,'authored-metres');
    assert.equal(actor.blocks,false);assert.equal(actor.floor,10);
    for(let i=0;i<8;i++){
      const x=(actor.x+Math.cos(i*Math.PI/4)*.32)/CELL,y=(actor.y+Math.sin(i*Math.PI/4)*.32)/CELL;
      assert.equal(FP.isSolid(x,y),false,`${actor.id} body clearance`);assert.equal(FP.floorAt(x,y),10);
      assert.equal(FP.logicalToPhysical(x,y).renderGroup,'academic');
    }
  }
  // Only existing unlocked leaves are opened. The six studios/teaching rooms
  // and faculty rooms remain closed against this ordinary route proof.
  for(const door of FP.doorState())if(!door.keyId)FP.setDoorOpen(door.id,true);
  const start=FP.toRuntimePoint(ACADEMIC_ENTRY),seen=new Set([`${start.x},${start.y}`]),queue=[start];
  for(let i=0;i<queue.length;i++)for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
    const a=queue[i],b={x:a.x+dx,y:a.y+dy};
    if(b.x<1||b.x>95||b.y<481||b.y>557||seen.has(`${b.x},${b.y}`))continue;
    if(FP.canStep(a.x,a.y,b.x,b.y,{keys:new Set(['master'])}).ok){seen.add(`${b.x},${b.y}`);queue.push(b);}
  }
  for(const actor of ACTORS){const x=Math.floor(actor.x/CELL),y=Math.floor(actor.y/CELL);
    assert.ok(seen.has(`${x},${y}`),`${actor.id} can be reached from the existing academic landing`);}
});

test('the chamber/corridor pair has a real unobstructed sightline through the existing open mouth',()=>{
  const a=byId.celeste,b=byId.emile;
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<6);
  for(let t=0;t<=1;t+=.02)assert.equal(FP.isSolid((a.x+(b.x-a.x)*t)/CELL,(a.y+(b.y-a.y)*t)/CELL),false);
  const crossX=a.x+(b.x-a.x)*(249-a.y)/(b.y-a.y);assert.ok(crossX>=8&&crossX<11);
});

test('each named person has a complete relationship, local-need and leave hub with valid branches',()=>{
  for(const actor of ACTORS){
    const tree=academicSocietyDialogue(actor.id);
    assert.equal(tree.actorId,actor.id);assert.equal(tree.nodes.start.speaker,actor.name.toUpperCase());
    assert.ok(tree.nodes.start.choices.some(c=>c.goto==='leave'));
    assert.ok(tree.nodes.need?.lines.length>=2);
    for(const topic of TOPICS[actor.id])assert.ok(tree.nodes[topic]);
    for(const node of Object.values(tree.nodes))for(const c of node.choices||[])assert.ok(tree.nodes[c.goto],`${actor.id}:${c.goto}`);
    for(const node of Object.values(tree.nodes))for(const line of node.lines){
      if(line.who==='direction')continue;
      assert.ok(byId[line.actorId]);assert.equal(line.name,byId[line.actorId].name);
      assert.equal(line.voiceSpeaker,`society-${line.actorId}`);
    }
  }
  assert.equal(academicSocietyDialogue('academic-bust-4'),null);
});

test('the actual local pair exchanges reciprocal lines without an E interaction',()=>{
  const society=enter();assert.equal(advance(society,T.firstExchange-.25).length,0);
  const events=advance(society,.25),spoken=events.find(e=>e.type==='social');
  assert.equal(spoken.area,'pair');assert.equal(spoken.beatId,'the-tuesday-argument');
  assert.deepEqual([...new Set(spoken.lines.map(l=>l.actorId))].sort(),['celeste','emile']);
  assert.ok(spoken.lines.every(l=>l.toActorId&&l.toActorId!==l.actorId));
  assert.ok(Object.values(society.save().met).every(n=>n===0));
});

test('arrival and gallery voices stay local instead of broadcasting the pair through intervening rooms',()=>{
  for(const [c,expected]of[[arrival,['odette','agathe']],[gallery,['lucien','noe']]]){
    const society=enter(c),events=advance(society,100,c).filter(e=>e.lines);
    assert.ok(events.length>0);assert.ok(events.every(e=>e.lines.every(l=>expected.includes(l.actorId))));
    assert.deepEqual([...new Set(events.flatMap(e=>e.lines.map(l=>l.actorId)))].sort(),expected.sort(),'each local partner actually gets a turn');
  }
  assert.equal(academicSocietyArea({x:9,y:262}),null,'far corridor does not hear an impossible local exchange');
  assert.equal(academicSocietyArea({x:100,y:100}),null);
});

test('named dialogue completion records topics and produces a distinct remembered revisit',()=>{
  const society=enter(arrival),first=society.beginDialogue('odette');
  const topic=first.nodes.start.choices.find(c=>c.societyTopic==='odette:keys');
  const events=society.endDialogue('odette',{completed:true,choices:[topic]});
  assert.equal(events[0].type,'dialogue-complete');assert.equal(society.save().met.odette,1);
  assert.deepEqual(society.save().topics.odette,['keys']);
  const next=society.beginDialogue('odette');assert.notEqual(next.nodes.start.lines[0].text,first.nodes.start.lines[0].text);
  assert.equal(next.nodes.keys.lines.length,1,'a repeated topic becomes a concise reply');
});

test('cancelling after selecting a loan neither lends the voice nor counts a completed meeting',()=>{
  const society=enter(),tree=society.beginDialogue('emile');
  assert.ok(choice(tree,'need','lend'));
  assert.deepEqual(society.endDialogue('emile',{completed:false,choices:[choice(tree,'need','lend')]}),[]);
  assert.equal(society.save().consent,'unasked');assert.equal(society.save().met.emile,0);
  assert.equal(society.view().activeDialogue,null);
  assert.ok(society.beginDialogue('emile'));
});

test('the loan is informed and offered in front of the actual borrowing person, not remotely in the gallery',()=>{
  const society=enter(),emile=society.dialogue('emile'),lucien=society.dialogue('lucien');
  const warning=emile.nodes.need.lines.map(l=>l.text).join(' ');
  assert.match(warning,/own voice from my mouth/i);assert.match(warning,/back here, or through Lucien/);
  assert.match(warning,/downstairs/);assert.ok(choice(emile,'need','lend'));
  assert.ok(Object.values(lucien.nodes).flatMap(n=>n.choices||[]).some(c=>c.societyAction==='decline'));
  assert.ok(Object.values(lucien.nodes).flatMap(n=>n.choices||[]).every(c=>c.societyAction!=='lend'));
});

test('Lucien can record a refusal before Emile asks, and it remains a complete outcome',()=>{
  const society=enter(gallery),tree=society.beginDialogue('lucien');
  society.endDialogue('lucien',{completed:true,choices:[choice(tree,'start','decline')]});
  assert.equal(society.save().consent,'declined');
  assert.ok(Object.values(society.dialogue('emile').nodes).flatMap(n=>n.choices||[]).every(c=>c.societyAction!=='lend'));
  assert.ok(advance(society,100).every(e=>e.type!=='borrowed-voice'));
});

test('a completed loan yields two actual player-voice lines from Emile and then ends by itself',()=>{
  const society=enter(),events=[...lend(society),...advance(society,30)];
  const pulses=events.filter(e=>e.type==='borrowed-voice');assert.equal(pulses.length,2);
  const own=pulses.flatMap(e=>e.lines).filter(l=>l.who==='me');
  assert.equal(own.length,2);assert.ok(own.every(l=>l.actorId==='emile'&&l.voiceSpeaker==='me'));
  assert.ok(pulses[1].lines.some(l=>l.actorId==='celeste'&&l.who==='unknown'));
  assert.equal(society.save().consent,'expired');assert.equal(society.save().loanRemaining,0);
});

test('either Lucien or Emile can return the voice, idempotently',()=>{
  for(const actor of ['lucien','emile']){
    const society=enter();lend(society);const events=withdraw(society,actor);
    assert.ok(events.some(e=>e.type==='released'));assert.equal(society.save().consent,'withdrawn');
    assert.deepEqual(society.endDialogue(actor,{completed:true,choices:[{societyAction:'withdraw'}]}),[]);
    assert.ok(advance(society,30).every(e=>e.type!=='borrowed-voice'));
  }
});

test('moving within the third floor keeps the bounded loan, while descending or leaving ends it',()=>{
  const society=enter();lend(society);society.tick(.25,gallery);
  assert.equal(society.save().consent,'lent');
  const exit=society.tick(0,{onAcademicFloor:false,suspended:true});
  assert.equal(exit[0].type,'released');assert.equal(society.save().consent,'left');
  assert.deepEqual(society.tick(0,{onAcademicFloor:false}),[]);
  society.tick(0,arrival);assert.ok(advance(society,T.firstExchange,arrival).some(e=>e.type==='return'));
});

test('focus, pause, modal dialogue and speech freeze the scheduler and loan clock',()=>{
  const society=enter();advance(society,1);const quiet=society.view().quiet;
  for(const c of [{...pair,suspended:true},{...pair,speechBusy:true}]){
    assert.deepEqual(advance(society,30,c),[]);assert.equal(society.view().quiet,quiet);
  }
  society.beginDialogue('celeste');assert.deepEqual(advance(society,30),[]);
  society.endDialogue('celeste',{completed:false});lend(society);const state=society.save();
  assert.deepEqual(advance(society,30,{...pair,suspended:true}),[]);assert.deepEqual(society.save(),state);
  society.tick(900,pair);assert.equal(society.save().loanRemaining,state.loanRemaining-T.maxTick);
});

test('actual actor frames preserve seven distinct anchors, orient the pair and track the present speaker/player',()=>{
  const society=enter(),frames=society.actorFrame();assert.equal(frames.length,7);
  for(const actor of frames){assert.equal(actor.x,byId[actor.id].x);assert.equal(actor.y,byId[actor.id].y);assert.equal(actor.visible,true);}
  for(const [id,other]of[['celeste','emile'],['emile','celeste']]){
    const a=frames.find(a=>a.id===id),b=byId[other];assert.equal(a.gazeKey,other);
    const d=Math.hypot(b.x-a.x,b.y-a.y);assert.ok((Math.sin(a.yaw)*(b.x-a.x)-Math.cos(a.yaw)*(b.y-a.y))/d>.999);
  }
  society.beginDialogue('celeste');const talking=society.actorFrame({listener:{x:13,y:247},speakingActorId:'celeste'}).find(a=>a.id==='celeste');
  assert.equal(talking.talkingToPlayer,true);assert.equal(talking.speaking,true);assert.equal(talking.gazeKey,'player');
  society.endDialogue('celeste',{completed:false});assert.ok(society.actorFrame().every(a=>!a.talkingToPlayer));
});

test('inside reload retains pulse receipts and visit count; outside reload cannot resurrect a loan',()=>{
  const first=enter();lend(first);advance(first,6);const saved=first.save();assert.equal(saved.loanPulses,2);
  const inside=createAcademicSociety(saved);inside.tick(0,pair);assert.equal(inside.save().visits,saved.visits);
  assert.ok(advance(inside,20).every(e=>e.type!=='borrowed-voice'));assert.equal(inside.save().consent,'expired');
  const outside=createAcademicSociety(saved);assert.equal(outside.tick(0,{onAcademicFloor:false})[0].type,'released');
  outside.tick(0,pair);assert.ok(advance(outside,30).every(e=>e.type!=='borrowed-voice'));
});

test('save normalization rejects foreign cast/topics/beat IDs and snapshots are independent',()=>{
  const state=createAcademicSocietyState({consent:'captured',met:{celeste:4,foreign:10},topics:{celeste:['company','foreign','company']},issuedBeatIds:['the-rest','foreign'],loanPulses:900});
  assert.equal(state.consent,'unasked');assert.equal(state.met.foreign,undefined);
  assert.deepEqual(state.topics.celeste,['company']);assert.deepEqual(state.issuedBeatIds,['the-rest']);assert.equal(state.loanPulses,2);
  const society=enter(),save=society.save();save.topics.celeste.push('company');assert.deepEqual(society.save().topics.celeste,[]);
  const tree=society.dialogue('emile');tree.nodes.start.choices.length=0;assert.ok(society.dialogue('emile').nodes.start.choices.length>0);
});

test('the society never changes the old six-object eyes or unseen-turn decisions',()=>{
  HEAD.loadMarbleHead({phase:'declined',gallery:{spoken:['academic-bust-2'],turned:true}});const before=HEAD.saveMarbleHead();
  const society=enter();advance(society,60);lend(society);advance(society,30);
  assert.deepEqual(HEAD.saveMarbleHead(),before);HEAD.resetMarbleHead();
  assert.ok(BEATS.every(beat=>beat.lines.every(line=>!line.actorId.startsWith('academic-bust'))));
});

test('an ambient greeting turns its real speaker toward the visitor before an E interaction',()=>{
  const society=enter(arrival),visitor={x:14.5,y:277};
  const before=society.actorFrame({listener:visitor}).find(a=>a.id==='odette');
  assert.equal(before.gazeKey,'landing');
  const greeted=society.actorFrame({listener:visitor,speakingActorId:'odette',
    speakingLine:{actorId:'odette',toPlayer:true}}).find(a=>a.id==='odette');
  assert.equal(greeted.gazeKey,'player');assert.equal(greeted.speaking,true);
  assert.deepEqual(greeted.gazeAt,visitor);assert.equal(greeted.talkingToPlayer,false);
  assert.ok(Math.cos(greeted.yaw)<-.99,'Odette faces the arriving visitor south of her, rather than showing her back');
});

test('ambient addressees are local actual people and do not override an active player conversation',()=>{
  const society=enter();
  const talking=society.actorFrame({listener:{x:13,y:247},focusedActor:'emile',speakingActorId:'emile',
    speakingLine:{actorId:'emile',toActorId:'celeste'}}).find(a=>a.id==='emile');
  assert.equal(talking.gazeKey,'celeste');
  const remote=society.actorFrame({speakingLine:{actorId:'odette',toActorId:'lucien'}}).find(a=>a.id==='odette');
  assert.equal(remote.gazeKey,'landing','a distant person behind intervening rooms is not invented as a local addressee');
  const invalid=society.actorFrame({speakingLine:{actorId:'odette',toActorId:'invented'}}).find(a=>a.id==='odette');
  assert.equal(invalid.gazeKey,'landing');
  society.beginDialogue('emile');
  const direct=society.actorFrame({listener:{x:9,y:251},speakingLine:{actorId:'emile',toActorId:'celeste'}}).find(a=>a.id==='emile');
  assert.equal(direct.gazeKey,'player');assert.equal(direct.talkingToPlayer,true);
});

test('reciprocal local subjects leave active quiet and reprise the whole set after a longer pause',()=>{
  const society=enter(),first=advance(society,T.firstExchange).filter(e=>e.type==='social');
  assert.equal(first[0].beatId,'the-tuesday-argument');assert.ok(T.quietBetween>=9&&T.quietBetween<=12);
  assert.deepEqual(advance(society,T.quietBetween-.25),[]);
  const second=advance(society,.25).find(e=>e.type==='social');assert.equal(second.beatId,'the-empty-seat');
  const local=BEATS.filter(b=>b.area==='pair'),remaining=[];
  while(society.save().visitBeatIds.length<local.length)remaining.push(...advance(society,T.quietBetween));
  const subjects=remaining.filter(e=>e.type==='social').map(e=>e.beatId);
  assert.equal(subjects[0],'counting-the-breaths','the visitor is noticed after two completed local exchanges');
  assert.deepEqual(subjects.toSorted(),local.slice(2).map(b=>b.id).toSorted(),'all original and new local subjects still occur');
  assert.equal(new Set(society.save().visitBeatIds).size,11);
  const round=advance(society,T.quietBetween).find(e=>e.type==='ambient-round');assert.equal(round.area,'pair');
  assert.deepEqual(advance(society,T.repriseQuiet-.25),[]);
  const reprise=advance(society,.25).find(e=>e.type==='social');
  assert.ok(local.some(b=>b.id===reprise.beatId),'a fresh local reprise becomes audible');
  const reloaded=createAcademicSociety(society.save());reloaded.tick(0,pair);
  const replay=advance(reloaded,180).filter(e=>e.type==='social');assert.ok(replay.length>6,'the same visit remains social after a full set');
  assert.equal(reloaded.save().visits,society.save().visits,'an inside reload is not a new visit');
  assert.equal(reloaded.save().consent,'unasked');
});

test('the arrival introduction and Lucien rehearsal stay one-shot across real floor visits',()=>{
  for(const [c,oneShot]of[[arrival,'odette-arrival'],[gallery,'lucien-rehearsal']]){
    const society=enter(c),first=advance(society,100,c).filter(e=>e.type==='social');
    assert.ok(first.some(e=>e.beatId===oneShot));
    society.tick(0,{onAcademicFloor:false});society.tick(0,c);
    assert.ok(advance(society,100,c).every(e=>e.beatId!==oneShot));
  }
});

test('an ambient exchange requires every speaker to be in local earshot',()=>{
  const edge=context({x:17,y:241});assert.equal(academicSocietyArea(edge.listener),'pair');
  assert.ok(Math.hypot(edge.listener.x-byId.celeste.x,edge.listener.y-byId.celeste.y)<T.earshot);
  assert.ok(Math.hypot(edge.listener.x-byId.emile.x,edge.listener.y-byId.emile.y)>T.earshot);
  assert.deepEqual(advance(enter(edge),100,edge),[],'hearing one half cannot trigger a whole remote exchange');
});

test('completed personal subjects change each return opening without replaying an introduction',()=>{
  const examples=[['celeste','emile',/pretending not to listen/],['emile','music',/last phrase is still missing/],
    ['odette','need',/Lucien came upstairs himself/],['lucien','need',/Nobody has come to fetch me/]];
  for(const [id,subject,remembered]of examples){
    const society=enter(),first=society.beginDialogue(id);
    const selected=first.nodes.start.choices.find(c=>c.societyTopic===`${id}:${subject}`);assert.ok(selected);
    society.endDialogue(id,{completed:true,choices:[selected]});
    const next=society.dialogue(id);assert.match(next.nodes.start.lines[0].text,remembered);
    assert.equal(next.nodes.start.lines.length,1,'a known person does not reintroduce themself');
    assert.equal(next.nodes[subject].lines.length,1,'a completed personal subject has a concise remembered reply');
    const restored=createAcademicSociety(society.save());assert.equal(restored.dialogue(id).nodes.start.lines[0].text,next.nodes.start.lines[0].text);
  }
});

test('cancelled topics and voice choices do not leak into return lines or ambient variants',()=>{
  const society=enter(),before=society.save(),tree=society.beginDialogue('emile');
  const music=tree.nodes.start.choices.find(c=>c.societyTopic==='emile:music');
  society.endDialogue('emile',{completed:false,choices:[music,choice(tree,'need','decline')]});
  assert.deepEqual(society.save(),before);
  assert.match(society.dialogue('emile').nodes.start.lines[0].text,/being charitable/);
  const rest=BEATS.find(b=>b.id==='the-rest');
  assert.deepEqual(academicSocietyBeatLines(rest,society.save()),rest.lines);
});

test('voice outcomes receive specific returns, and a no changes the local argument rather than restarting the offer',()=>{
  const expected={declined:/owe this room nothing/,withdrawn:/should have stopped/,left:/went downstairs/,expired:/breath ran out/};
  for(const [consent,reaction]of Object.entries(expected)){
    const society=createAcademicSociety({version:1,visits:2,met:{emile:1,lucien:1},consent});society.tick(0,pair);
    assert.match(society.dialogue('emile').nodes.start.lines[0].text,reaction);
    assert.ok(Object.values(society.dialogue('emile').nodes).flatMap(n=>n.choices||[]).every(c=>c.societyAction!=='lend'));
    assert.ok(society.dialogue('lucien').nodes.start.lines[0].text.length>0);
  }
  const borrowing=BEATS.find(b=>b.id==='the-borrowing');
  const declined=academicSocietyBeatLines(borrowing,{consent:'declined'});
  assert.ok(declined.some(l=>/guest be a guest/.test(l.text)));assert.ok(declined.every(l=>l.toActorId));
  const heard=academicSocietyBeatLines(BEATS.find(b=>b.id==='the-rest'),{topics:{emile:['music']}});
  assert.match(heard[0].text,/told our visitor/);
});

test('old saves preserve decisions and all-time one-shot receipts while new visit receipts reject foreign IDs',()=>{
  const legacy={version:1,visits:3,met:{emile:2},topics:{emile:['music']},consent:'withdrawn',issuedBeatIds:['odette-arrival']};
  const state=createAcademicSocietyState(legacy);assert.equal(state.version,3);
  assert.deepEqual(state.visitBeatIds,[]);assert.equal(state.consent,'withdrawn');assert.equal(state.met.emile,2);
  assert.deepEqual(state.topics.emile,['music']);assert.deepEqual(state.issuedBeatIds,['odette-arrival']);
  const current=createAcademicSocietyState({...state,visitBeatIds:['the-rest','foreign','the-rest']});
  assert.deepEqual(current.visitBeatIds,['the-rest']);
  const society=createAcademicSociety(current),snapshot=society.save();snapshot.visitBeatIds.push('the-borrowing');
  assert.deepEqual(society.save().visitBeatIds,['the-rest']);
});

test('performance cues bind the actual speaking line to its local reciprocal listener',()=>{
  const society=enter(),line=BEATS[1].lines[1];
  let frames=society.actorFrame({speakingActorId:'emile',speakingLine:line,performanceTimeSec:10});
  const emile=frames.find(a=>a.id==='emile'),celeste=frames.find(a=>a.id==='celeste');
  assert.equal(emile.performance.cue,'interrupt');assert.equal(emile.performance.role,'speaker');
  assert.equal(celeste.performance.cue,'amused');assert.equal(celeste.performance.role,'listener');
  assert.equal(celeste.performance.key,emile.performance.key);assert.equal(celeste.gazeKey,'emile');
  assert.equal(celeste.performance.elapsedSec,0);
  frames=society.actorFrame({speakingActorId:'emile',speakingLine:line,performanceTimeSec:10.4});
  assert.ok(Math.abs(frames.find(a=>a.id==='celeste').performance.elapsedSec-.4)<1e-9);
  assert.deepEqual(society.actorFrame({speakingActorId:'emile',speakingLine:line,performanceTimeSec:10.4}),frames,'same-clock reads are idempotent');
  const stale=society.actorFrame({speakingLine:line,performanceTimeSec:11});
  assert.ok(stale.every(a=>a.performance===null),'a transcript waiting for Space is not an active performance');
  const restarted=society.actorFrame({speakingActorId:'emile',speakingLine:line,performanceTimeSec:12});
  assert.equal(restarted.find(a=>a.id==='emile').performance.elapsedSec,0);
  const remote=society.actorFrame({speakingActorId:'odette',speakingLine:{actorId:'odette',text:'No remote staging.',toActorId:'lucien',performanceCue:'offer',responseCue:'attend'},performanceTimeSec:13});
  assert.equal(remote.find(a=>a.id==='lucien').performance,null);assert.equal(remote.find(a=>a.id==='lucien').gazeKey,'gallery');
});

test('presentation time advances idle bodies during a conversation but freezes at the same clock and resets on load',()=>{
  const society=enter(),line=BEATS[1].lines[1];society.beginDialogue('emile');
  const pose=t=>society.actorFrame({listener:{x:8,y:254},speakingActorId:'emile',speakingLine:line,performanceTimeSec:t});
  const before=pose(20),after=pose(20.25);assert.equal(society.view().idleTime,0);
  assert.equal(after[1].phase-before[1].phase,.25);assert.notEqual(after[1].bodyYaw,before[1].bodyYaw);
  assert.ok(Math.abs(after[1].bodyYaw-before[1].bodyYaw)<=.25*2.2+1e-10,'root turn has bounded angular speed');
  assert.equal(after[1].x,before[1].x);assert.equal(after[1].y,before[1].y);
  assert.deepEqual(pose(20.25),after);
  assert.equal(pose(1)[1].performance.elapsedSec,0,'clock reversal starts a fresh performance');
  society.load(society.save());society.tick(0,pair);
  assert.equal(pose(90)[1].performance.elapsedSec,0,'save reload cannot restore a half-finished gesture');
});

test('all authored body cues use the supported local performance vocabulary',()=>{
  const lines=[...BEATS.flatMap(b=>b.lines),...ACTORS.flatMap(a=>Object.values(academicSocietyDialogue(a.id).nodes).flatMap(n=>n.lines))];
  for(const line of lines){
    if(line.who==='direction')continue;
    assert.ok(CUES.includes(line.performanceCue),line.text);
    if(line.responseCue)assert.ok(RESPONSES.includes(line.responseCue),line.text);
    if(line.toActorId){assert.ok(byId[line.toActorId]);assert.ok(Math.hypot(byId[line.actorId].x-byId[line.toActorId].x,byId[line.actorId].y-byId[line.toActorId].y)<=T.earshot);}
  }
});

test('the larger society keeps the original anchors and gives each new local partner a distinct remembered subject',()=>{
  for(const [id,x,y]of[['odette',14.5,274.5],['emile',8.6,250.5],['celeste',12.2,246.6],['lucien',25.6,246.2]]){
    assert.equal(byId[id].x,x);assert.equal(byId[id].y,y);
  }
  const examples=[['agathe','mistake',/same number of people/],['noe','lucien',/useful sort of friend/],['sabine','reviews',/precise sentence/]];
  for(const [id,subject,remembered]of examples){
    const society=enter(context(byId[id])),tree=society.beginDialogue(id);
    assert.ok(TOPICS[id].length>=5);
    const selected=tree.nodes.start.choices.find(c=>c.societyTopic===`${id}:${subject}`);assert.ok(selected);
    assert.ok(tree.nodes[subject].lines.some(l=>l.actorId!==id),'a local friend answers within the subject');
    society.endDialogue(id,{completed:true,choices:[selected]});
    assert.equal(society.save().met[id],1);assert.deepEqual(society.save().topics[id],[subject]);
    assert.match(society.dialogue(id).nodes[subject].lines[0].text,remembered);
    assert.equal(society.dialogue(id).nodes.start.lines.length,1);
  }
});

test('all seven have personal follow-up questions that commit with the same completed conversation',()=>{
  const cases=[['celeste','firstevening','rules'],['emile','audience','silence'],['odette','lastnight','returning'],
    ['lucien','noe','likeness'],['agathe','names','missing'],['noe','unfinished','lastline'],['sabine','reviews','verdict']];
  for(const [id,subject,followup]of cases){
    const society=enter(context(byId[id])),tree=society.beginDialogue(id);
    const first=tree.nodes.start.choices.find(c=>c.societyTopic===`${id}:${subject}`);
    const next=tree.nodes[subject].choices.find(c=>c.societyTopic===`${id}:${followup}`);
    assert.ok(first,`${id} exposes the personal subject`);assert.ok(next,`${id} offers a specific follow-up`);
    assert.ok(tree.nodes[followup].lines.length>=2);
    society.endDialogue(id,{completed:false,choices:[first,next]});
    assert.deepEqual(society.save().topics[id],[],`${id} cancellation discards both pending questions`);
    society.beginDialogue(id);society.endDialogue(id,{completed:true,choices:[first,next]});
    assert.deepEqual(society.save().topics[id],[subject,followup]);
    const restored=createAcademicSociety(society.save());
    assert.deepEqual(restored.save().topics[id],[subject,followup]);
    assert.equal(restored.dialogue(id).nodes[followup].lines.length,1,'the return keeps the answer rather than repeating the whole exchange');
  }
});

test('a completed sincere compliment changes Noe rather than leaving him asking for the same one',()=>{
  const society=enter(gallery),before=society.save(),beat=BEATS.find(b=>b.id==='a-portrait-with-room');
  const tree=society.beginDialogue('noe'),selected=tree.nodes.start.choices.find(c=>c.societyTopic==='noe:need');
  assert.ok(tree.nodes.need.lines.some(l=>l.actorId==='lucien'&&/something to say/.test(l.text)));
  society.endDialogue('noe',{completed:false,choices:[selected]});
  assert.deepEqual(academicSocietyBeatLines(beat,society.save()),academicSocietyBeatLines(beat,before));
  society.beginDialogue('noe');society.endDialogue('noe',{completed:true,choices:[selected]});
  assert.match(society.dialogue('noe').nodes.start.lines[0].text,/He said I make people/);
  assert.match(society.dialogue('noe').nodes.need.lines[0].text,/He meant it/);
  const after=academicSocietyBeatLines(beat,society.save());
  assert.ok(after.some(l=>l.actorId==='lucien'&&l.text==='I meant it.'));
  assert.ok(after.every(l=>l.toActorId&&['lucien','noe'].includes(l.actorId)));
});

test('a four-person version-two save adds unknown neighbours without losing old decisions or finished subjects',()=>{
  const legacy={version:2,visits:4,met:{odette:2,celeste:3,emile:1,lucien:2},topics:{odette:['keys'],celeste:['emile'],emile:['music','need'],lucien:['company']},
    consent:'withdrawn',issuedBeatIds:['odette-arrival','the-tuesday-argument'],visitBeatIds:['the-tuesday-argument'],loanPulses:2};
  const state=createAcademicSocietyState(legacy);assert.equal(state.version,3);
  for(const id of ['agathe','noe','sabine']){assert.equal(state.met[id],0);assert.deepEqual(state.topics[id],[]);}
  for(const id of ['odette','celeste','emile','lucien']){assert.equal(state.met[id],legacy.met[id]);assert.deepEqual(state.topics[id],legacy.topics[id]);}
  assert.equal(state.consent,'withdrawn');assert.equal(state.loanPulses,2);
  assert.deepEqual(state.visitBeatIds,['the-tuesday-argument']);
  const restored=createAcademicSociety(state);
  for(const id of ['agathe','noe','sabine']){
    const intro=restored.dialogue(id).nodes.start.lines;
    assert.equal(intro.length,2,'returning to the floor is not a completed meeting with a newly added person');
    assert.match(intro[1].text,new RegExp(byId[id].name.split(' ')[0]));
  }
});

test('new local people neither acquire loan powers nor forge another person\'s completed subject',()=>{
  for(const id of ['agathe','noe','sabine']){
    const society=enter(context(byId[id])),tree=society.beginDialogue(id);
    assert.ok(Object.values(tree.nodes).flatMap(n=>n.choices||[]).every(c=>!c.societyAction));
    society.endDialogue(id,{completed:true,choices:[{societyAction:'lend'},{societyTopic:'emile:music'}]});
    assert.equal(society.save().consent,'unasked');assert.deepEqual(society.save().topics.emile,[]);
    assert.ok(advance(society,60,context(byId[id])).every(e=>e.type!=='borrowed-voice'));
  }
});

test('new local speakers cause the addressed neighbours to react without recruiting distant people',()=>{
  const cases=[['agathe','odette','the-name-column'],['noe','lucien','the-unflattering-profile'],['sabine','emile','the-word-promising']];
  for(const [id,friend,beatId]of cases){
    const society=enter(context(byId[id])),line=BEATS.find(b=>b.id===beatId).lines.find(l=>l.actorId===id&&l.toActorId===friend);
    assert.ok(line);const frames=society.actorFrame({speakingActorId:id,speakingLine:line,performanceTimeSec:10});
    assert.equal(frames.find(a=>a.id===id).performance.role,'speaker');
    assert.equal(frames.find(a=>a.id===friend).performance.role,'listener');
    assert.ok(frames.filter(a=>a.performance&&!a.performance.ambient).every(a=>[id,friend].includes(a.id)));
    assert.ok(frames.filter(a=>a.performance?.ambient).every(a=>a.performance.sourceActorId!==id||Math.hypot(a.x-byId[id].x,a.y-byId[id].y)<=T.earshot),'background listening stays attached to its own real local partner');
  }
});


// Deliveries below deliberately bypass the auto-completion state-test helper.
function nextSocial(society,c=pair,limit=500){
  for(let n=0;n<limit;n++){const e=society.tick(.25,c).find(e=>e.type==='social');if(e)return e;}
  throw Error('No bounded local social delivery became eligible');
}
test('an emitted exchange is pending, not heard; only its matching completed delivery commits once',()=>{
  const society=enter(),event=nextSocial(society),before=society.save();
  assert.equal(event.stateChanged,false);assert.deepEqual(before.issuedBeatIds,[]);assert.deepEqual(before.visitBeatIds,[]);
  assert.equal(before.beatIndex,0);assert.equal(society.view().pendingAmbient.id,event.id);
  assert.equal(Object.hasOwn(society.save(),'pendingAmbient'),false);
  assert.deepEqual(society.settleAmbient('stale',{completed:true}),[]);assert.deepEqual(society.save(),before);
  const ack=society.settleAmbient(event.id,{completed:true});assert.equal(ack[0].type,'ambient-complete');assert.equal(ack[0].stateChanged,true);
  assert.deepEqual(society.save().issuedBeatIds,[event.beatId]);assert.deepEqual(society.save().roundBeatIds,[event.beatId]);
  assert.deepEqual(society.save().visitBeatIds,[event.beatId]);assert.equal(society.save().beatIndex,1);
  assert.deepEqual(society.settleAmbient(event.id,{completed:true}),[]);assert.equal(society.save().beatIndex,1);
});
test('cancellation retries once, then skips that unheard subject for this visit while other company continues',()=>{
  const society=enter(),one=nextSocial(society);society.settleAmbient(one.id,{completed:false});
  const two=nextSocial(society);assert.equal(two.beatId,one.beatId);assert.equal(two.attempt,2);assert.notEqual(two.id,one.id);
  assert.deepEqual(society.settleAmbient(one.id,{completed:true}),[],'stale first attempt cannot complete the second');
  society.settleAmbient(two.id,{completed:false});const next=nextSocial(society);assert.notEqual(next.beatId,one.beatId);
  society.settleAmbient(next.id,{completed:true});const later=advance(society,500).filter(e=>e.type==='social');
  assert.ok(later.length>10);assert.ok(later.every(e=>e.beatId!==one.beatId));assert.ok(!society.save().issuedBeatIds.includes(one.beatId));
  society.tick(0,{onAcademicFloor:false});society.tick(0,pair);assert.equal(nextSocial(society).beatId,one.beatId,'a real later visit may try again');
});
test('a stuck delivery times out without inventing a heard receipt or repeatedly issuing over occupied speech',()=>{
  const society=enter(),event=nextSocial(society);let timedOut=[];
  for(let t=0;t<T.pendingSeconds;t+=.25)timedOut.push(...society.tick(.25,{...pair,speechBusy:true}));
  assert.equal(timedOut.filter(e=>e.type==='ambient-cancelled').length,1);assert.equal(timedOut.at(-1).reason,'delivery-timeout');
  assert.equal(society.view().pendingAmbient,null);assert.deepEqual(society.save().issuedBeatIds,[]);
  assert.deepEqual(society.settleAmbient(event.id,{completed:true}),[]);
});
test('earshot loss and direct conversation cancel pending work, and load/new controller reject stale delivery identities',()=>{
  const society=enter(),event=nextSocial(society);const cancelled=society.tick(.1,{...gallery,speechBusy:true});
  assert.equal(cancelled[0].type,'ambient-cancelled');assert.equal(society.view().pendingAmbient,null);
  assert.deepEqual(society.save().issuedBeatIds,[]);society.tick(0,pair);const retry=nextSocial(society);
  society.beginDialogue('emile');assert.equal(society.view().pendingAmbient,null);assert.deepEqual(society.settleAmbient(retry.id,{completed:true}),[]);
  society.endDialogue('emile',{completed:false});society.load(society.save());society.tick(0,pair);const loaded=nextSocial(society);
  assert.notEqual(loaded.id,retry.id);assert.deepEqual(society.settleAmbient(retry.id,{completed:true}),[]);
  const another=enter(),fresh=nextSocial(another);assert.notEqual(fresh.id,event.id,'even separate controller instances cannot reuse a live attempt id');
});
test('safety quiet claim cancels pending company while preserving the loan and all completed decisions',()=>{
  const society=enter(),event=nextSocial(society),before=society.save();
  const stop=society.tick(.1,{...pair,quietClaimed:true});assert.equal(stop[0].reason,'safety-presentation');
  assert.equal(society.view().pendingAmbient,null);assert.deepEqual(society.save(),before);
  assert.deepEqual(society.settleAmbient(event.id,{completed:true}),[]);
  lend(society);const loan=society.save();society.tick(.5,{...pair,quietClaimed:true});assert.deepEqual(society.save(),loan);
});
test('outsider attention requires completed local company, then turns only its actual group without speech, motion or a consent cost',()=>{
  const target=BEATS.find(b=>b.id==='counting-the-breaths');
  const heard=BEATS.filter(b=>b.area==='pair'&&b.id!==target.id).map(b=>b.id);
  const society=createAcademicSociety({version:3,visits:1,issuedBeatIds:heard,visitBeatIds:heard,roundBeatIds:heard});society.tick(0,pair);
  const event=nextSocial(society);assert.equal(event.beatId,target.id);assert.equal(society.view().attention,null);
  const before=society.save();society.settleAmbient(event.id,{completed:true});assert.deepEqual(society.view().attention.actorIds,['celeste','emile','sabine']);
  const frames=society.actorFrame({listener:pair.listener,performanceTimeSec:10});
  assert.deepEqual(frames.filter(a=>a.socialAttention).map(a=>a.id).sort(),['celeste','emile','sabine']);
  for(const actor of frames){assert.equal(actor.x,byId[actor.id].x);assert.equal(actor.y,byId[actor.id].y);assert.equal(actor.speaking,false);if(actor.socialAttention){assert.equal(actor.gazeKey,'player');assert.equal(actor.performance.role,'listener');}}
  const age=society.view().attention.elapsed;advance(society,20,{...pair,suspended:true});assert.equal(society.view().attention.elapsed,age);
  society.tick(.1,{...pair,quietClaimed:true});assert.equal(society.view().attention,null);
  assert.equal(society.save().consent,before.consent);assert.deepEqual(society.save().met,before.met);assert.deepEqual(society.save().topics,before.topics);
});
test('ordinary silent company uses finite reciprocal listener gestures, never false speaking mouths or new anchors',()=>{
  const society=enter(),frames=society.actorFrame({performanceTimeSec:.1});const active=frames.filter(a=>a.performance);
  assert.ok(active.length>0);assert.ok(active.every(a=>a.performance.role==='listener'&&a.performance.elapsedSec<2.2));
  for(const actor of frames){assert.equal(actor.speaking,false);assert.equal(actor.x,byId[actor.id].x);assert.equal(actor.y,byId[actor.id].y);}
  const withLine=society.actorFrame({speakingActorId:'emile',speakingLine:BEATS[1].lines[1],performanceTimeSec:.5});
  assert.ok(withLine.filter(a=>a.performance&&!a.performance.ambient).every(a=>['emile','celeste'].includes(a.id)),'actual line ownership overrides background gestures on its speaker and listener');
});
test('the richer floor has28local exchanges, with reciprocal outsider beats in every area and unchanged voice/position contracts',()=>{
  assert.equal(BEATS.length,28);assert.equal(BEATS.filter(b=>b.area==='loggia').length,9);assert.equal(BEATS.filter(b=>b.area==='pair').length,11);assert.equal(BEATS.filter(b=>b.area==='gallery').length,8);
  for(const area of['loggia','pair','gallery'])assert.equal(BEATS.filter(b=>b.area===area&&b.outsider).length,2);
  for(const beat of BEATS){
    if(beat.outsider)assert.ok(beat.minVisitBeats>=2);
    for(const line of beat.lines){assert.ok(byId[line.actorId]);if(line.toActorId){assert.ok(byId[line.toActorId]);assert.ok(Math.hypot(byId[line.actorId].x-byId[line.toActorId].x,byId[line.actorId].y-byId[line.toActorId].y)<=T.earshot);}}
    assert.ok(beat.lines.every(line=>line.who!=='me'),'ordinary outsider attention never borrows the player voice');
  }
});

test('other local groups keep quiet reciprocal activity while the player reads one person, without eavesdropping or fake mouths',()=>{
  const society=enter();society.beginDialogue('celeste');
  const frames=society.actorFrame({listener:pair.listener,performanceTimeSec:10.1});
  const independent=frames.filter(a=>a.performance?.ambient);assert.ok(independent.some(a=>['noe','lucien'].includes(a.id)));
  for(const actor of independent){const partner=byId[actor.performance.sourceActorId];assert.ok(partner);assert.ok(Math.hypot(actor.x-partner.x,actor.y-partner.y)<=T.earshot);assert.equal(actor.speaking,false);assert.equal(actor.talkingToPlayer,false);}
  assert.equal(frames.find(a=>a.id==='celeste').gazeKey,'player');
});
