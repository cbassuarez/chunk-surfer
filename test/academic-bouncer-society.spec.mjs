import test from 'node:test';
import assert from 'node:assert/strict';
import {ACADEMIC_BOUNCER_SOCIAL_BEATS as BEATS,ACADEMIC_BOUNCER_SOCIAL_TOPICS as TOPICS,
  ACADEMIC_BOUNCER_SOCIAL_TIMING as T,academicBouncerSocialDialogue,academicBouncerSocialBeatLines,
} from '../src/data/academic-bouncer-society.js';
import {ACADEMIC_BOUNCER_CUE,ACADEMIC_BOUNCER_PHRASE} from '../src/data/academic-bouncers.js';
import {createAcademicBouncerSociety,createAcademicBouncerSocietyState} from '../src/game/academic-bouncer-society.js';

const all=BEATS.map(beat=>beat.id),before=BEATS.filter(beat=>beat.admission==='before'),after=BEATS.filter(beat=>beat.admission==='after');
const context={admitted:true,present:true,visitId:1,audibleBeatIds:all};
const advance=(controller,seconds,extra={})=>{
  const events=[];for(let index=0;index<Math.round(seconds*2);index++)events.push(...controller.tick(.5,{...context,...extra}));return events;
};
const social=events=>events.filter(event=>event.type==='social');
function complete(controller,topics=[]){controller.beginDialogue();return controller.endDialogue({completed:true,choices:topics.map(bouncerTopic=>({bouncerTopic}))});}

test('old-save normalization retains only valid social receipts and no live encounter',()=>{
  assert.deepEqual(createAcademicBouncerSocietyState(null),{version:1,conversations:0,topics:[],visitId:0,issuedBeatIds:[],visitBeatIds:[]});
  const normalized=createAcademicBouncerSocietyState({conversations:3.9,topics:['stay','stay','invented','music'],visitId:-4,
    issuedBeatIds:[all[0],all[0],'invented'],visitBeatIds:[all[1],'invented'],activeDialogue:true,quiet:0,admitted:true,consent:'lent'});
  assert.deepEqual(normalized,{version:1,conversations:3,topics:['stay','music'],visitId:0,issuedBeatIds:[all[0]],visitBeatIds:[all[1]]});
  assert.equal(createAcademicBouncerSocietyState({conversations:Infinity}).conversations,0);
  assert.equal(createAcademicBouncerSocietyState({conversations:1e9}).conversations,9999);
});

test('eight finite subjects contain mutual guard turns and two genuinely local resident replies',()=>{
  assert.equal(before.length,3);assert.equal(after.length,5);assert.equal(new Set(all).size,8);
  const neighbours=new Set(['odette','agathe']),guards=new Set(['academic-bouncer-formal','academic-bouncer-dry']);
  const residentBeats=BEATS.filter(beat=>beat.lines.some(line=>neighbours.has(line.actorId)));
  assert.equal(residentBeats.length,2);
  for(const beat of BEATS){
    assert.equal(beat.area,'loggia');assert.ok(beat.lines.length>=3&&beat.lines.length<=4);
    assert.ok(new Set(beat.lines.map(line=>line.actorId)).size>=2,'not a one-voice aside');
    for(const line of beat.lines){
      assert.ok(guards.has(line.actorId)||neighbours.has(line.actorId));
      assert.ok(line.toActorId&&line.toActorId!==line.actorId);
      assert.ok(beat.lines.some(other=>other.actorId===line.toActorId),'reciprocal listener is an actual participant');
      assert.ok(line.voiceSpeaker&&line.sourceLabel&&line.performanceCue);
      assert.ok(!line.text.includes(ACADEMIC_BOUNCER_CUE),'ambient cannot accidentally announce the timed opening');
      assert.ok(!line.text.includes(ACADEMIC_BOUNCER_PHRASE),'ambient cannot bypass lower-floor discovery');
    }
  }
  const register=BEATS.find(beat=>beat.id==='hugh-agathe-category');
  assert.ok(!register.lines.some(line=>line.actorId==='academic-bouncer-formal'),'Vera remains outside Agathe\'s8m peer radius');
  const allActors=new Set(BEATS.flatMap(beat=>beat.lines.map(line=>line.actorId)));
  for(const distant of ['emile','celeste','sabine','lucien','noe'])assert.equal(allActors.has(distant),false);
});

test('initial local exchange waits3.5 active quiet seconds and subsequent exchanges wait22',()=>{
  const controller=createAcademicBouncerSociety();
  assert.equal(social(advance(controller,3)).length,0);
  assert.equal(social(advance(controller,.5)).length,1);
  assert.equal(social(advance(controller,21.5)).length,0);
  assert.equal(social(advance(controller,.5)).length,1);
});

test('absence, native suspension, other speech and an owned conversation cannot spend the social clock',()=>{
  for(const extra of [{present:false},{suspended:true},{paused:true},{hidden:true},{focused:false},{speechBusy:true}]){
    const controller=createAcademicBouncerSociety({visitId:1});advance(controller,1);
    const beforeState=controller.view();assert.equal(social(advance(controller,120,extra)).length,0);
    assert.deepEqual(controller.view(),beforeState);
  }
  const controller=createAcademicBouncerSociety({visitId:1});controller.beginDialogue();const beforeState=controller.view();
  assert.equal(social(advance(controller,120)).length,0);assert.deepEqual(controller.view(),beforeState);
});

test('only explicitly verified audible beat IDs may issue a line',()=>{
  const controller=createAcademicBouncerSociety();
  assert.equal(social(advance(controller,10,{audibleBeatIds:undefined})).length,0);
  assert.equal(social(advance(controller,10,{audibleBeatIds:['invented']})).length,0);
  const allowed=after[3].id;
  const event=social(controller.tick(0,{...context,audibleBeatIds:[allowed]}))[0];
  assert.equal(event.beatId,allowed);assert.equal(event.stateChanged,true);assert.equal(event.type,'social');
});

test('admission switches the available social subjects without replaying any same-visit beat',()=>{
  const controller=createAcademicBouncerSociety();
  const first=social(advance(controller,150,{admitted:false}));assert.deepEqual(first.map(event=>event.beatId),before.map(beat=>beat.id));
  assert.equal(social(advance(controller,150,{admitted:false})).length,0);
  const second=social(advance(controller,150));assert.deepEqual(second.map(event=>event.beatId),after.map(beat=>beat.id));
  assert.equal(social(advance(controller,150)).length,0);
  assert.equal(controller.save().visitBeatIds.length,8);assert.equal(controller.save().issuedBeatIds.length,8);
});

test('issuing an interrupted chain exhausts that subject for the visit, including save/reload',()=>{
  const controller=createAcademicBouncerSociety();const beat=after[0].id;
  assert.equal(social(advance(controller,3.5,{audibleBeatIds:[beat]})).length,1);
  assert.equal(social(advance(controller,100,{present:false,audibleBeatIds:[beat]})).length,0);
  assert.equal(social(advance(controller,100,{audibleBeatIds:[beat]})).length,0);
  const restored=createAcademicBouncerSociety(controller.save());
  assert.equal(social(advance(restored,100,{audibleBeatIds:[beat]})).length,0);
});

test('a true visit change permits relevant repeats but prefers a still unheard subject',()=>{
  const controller=createAcademicBouncerSociety();const known=after[1].id;
  social(advance(controller,3.5,{audibleBeatIds:[known]}));
  const visit=controller.tick(0,{...context,visitId:2});assert.equal(visit[0].type,'visit');assert.equal(visit[0].stateChanged,true);
  assert.deepEqual(controller.save().visitBeatIds,[]);assert.deepEqual(controller.save().issuedBeatIds,[known]);
  const next=social(advance(controller,3.5,{visitId:2}))[0];assert.equal(next.beatId,after[0].id);
  assert.equal(social(advance(controller,22,{visitId:2,audibleBeatIds:[known]}))[0].beatId,known);
});

test('the five-topic conversation has a single owner and cancellation spends no subjects',()=>{
  const controller=createAcademicBouncerSociety();const dialogue=controller.beginDialogue();
  assert.equal(dialogue.id,'academic-bouncer-society');assert.equal(controller.beginDialogue(),null);
  assert.deepEqual(dialogue.nodes.start.choices.filter(choice=>choice.bouncerTopic).map(choice=>choice.bouncerTopic),TOPICS);
  assert.deepEqual(controller.endDialogue({completed:false,choices:[{bouncerTopic:'stay'}]}),[]);
  assert.equal(controller.save().conversations,0);assert.deepEqual(controller.save().topics,[]);
  assert.deepEqual(controller.endDialogue({completed:true,choices:[{bouncerTopic:'stay'}]}),[],'stale close has no ownership');
  assert.deepEqual(controller.beginDialogue(),dialogue,'cancel reopens the same introduction and topics');
});

test('terminal completion commits actual topics once and gives specific later responses',()=>{
  const controller=createAcademicBouncerSociety();const original=controller.beginDialogue();
  controller.endDialogue({completed:true,choices:[{bouncerTopic:'doorwork'},{bouncerTopic:'stay'},{bouncerTopic:'stay'},{bouncerTopic:'invented'}]});
  assert.deepEqual(controller.save().topics,['doorwork','stay']);assert.equal(controller.save().conversations,1);
  const returned=controller.beginDialogue();assert.notDeepEqual(returned.nodes.start.lines,original.nodes.start.lines);
  assert.equal(returned.nodes.start.lines[0].text,'We are both still here.');
  assert.notDeepEqual(returned.nodes.stay.lines,original.nodes.stay.lines);
  assert.deepEqual(returned.nodes.register.lines,original.nodes.register.lines,'an unasked subject does not pretend to be completed');
  assert.equal(controller.view().quiet,22);
});

test('loading abandons a live conversation while retaining completed knowledge and finite visit receipts',()=>{
  const controller=createAcademicBouncerSociety();complete(controller,['music']);advance(controller,22);
  const saved=controller.save();controller.beginDialogue();assert.equal(controller.view().activeDialogue,true);
  controller.load(saved);assert.equal(controller.view().activeDialogue,false);assert.equal(controller.view().quiet,3.5);
  assert.deepEqual(controller.save(),saved);assert.equal(saved.activeDialogue,undefined);assert.equal(saved.quiet,undefined);
  assert.deepEqual(controller.endDialogue({completed:true,choices:[{bouncerTopic:'stay'}]}),[]);
  assert.deepEqual(controller.save().topics,['music']);
});

test('completed subjects alter suitable ambient exchanges; a cancelled selection cannot invent agreement',()=>{
  const controller=createAcademicBouncerSociety(),beat=BEATS.find(beat=>beat.id==='an-invitation-for-both');
  const original=academicBouncerSocialBeatLines(beat,controller.save());
  controller.beginDialogue();controller.endDialogue({completed:false,choices:[{bouncerTopic:'stay'}]});
  assert.deepEqual(academicBouncerSocialBeatLines(beat,controller.save()),original);
  complete(controller,['stay']);assert.notDeepEqual(academicBouncerSocialBeatLines(beat,controller.save()),original);
  for(const line of academicBouncerSocialBeatLines(beat,controller.save()))assert.ok(line.toActorId);
});

test('real named-society knowledge is explicitly reported by the player, with no distant actor voiced',()=>{
  const base=academicBouncerSocialDialogue();
  const loan=academicBouncerSocialDialogue({}, {societyState:{consent:'lent'}});
  const reviews=academicBouncerSocialDialogue({}, {societyState:{topics:{sabine:['reviews']}}});
  assert.notDeepEqual(loan.nodes.music.lines,base.nodes.music.lines);assert.notDeepEqual(reviews.nodes.music.lines,base.nodes.music.lines);
  for(const dialogue of [loan,reviews]){
    assert.equal(dialogue.nodes.music.lines[0].who,'me');assert.equal(dialogue.nodes.music.lines[0].voiceSpeaker,'me');
    assert.equal(dialogue.nodes.start.choices.find(choice=>choice.bouncerTopic==='music').text,dialogue.nodes.music.lines[0].text);
  }
  const laterLoan=academicBouncerSocialDialogue({topics:['music'],conversations:1},{societyState:{consent:'lent'}});
  assert.equal(laterLoan.nodes.music.lines[0].text,'Emile is using my voice.','a completed old subject cannot swallow the player\'s newly relevant report');
  for(const dialogue of [base,loan,reviews])for(const node of Object.values(dialogue.nodes))for(const line of node.lines){
    assert.ok(!line.actorId||line.actorId.startsWith('academic-bouncer-'));
    assert.equal(line.societyAction,undefined);assert.equal(line.set,undefined);assert.equal(line.clear,undefined);
  }
});

test('every authored topic and back/leave route resolves without new gate or quest actions',()=>{
  for(const topics of [[],TOPICS]){
    const dialogue=academicBouncerSocialDialogue({topics,conversations:topics.length?1:0});
    for(const [id,node]of Object.entries(dialogue.nodes)){
      assert.ok(node.lines.length>0,id);
      for(const choice of node.choices||[]){assert.ok(dialogue.nodes[choice.goto],`${id} resolves ${choice.goto}`);assert.equal(choice.societyAction,undefined);assert.equal(choice.set,undefined);}
      for(const line of node.lines)if(line.actorId)assert.ok(line.toActorId&&line.toActorId!==line.actorId);
    }
    assert.equal(dialogue.nodes.leave.choices,undefined);
  }
});

test('admission and nearby dialogue can defer social chatter without a wall-clock timer',()=>{
  const controller=createAcademicBouncerSociety({visitId:1});controller.defer();
  assert.equal(controller.view().quiet,T.quietBetween);assert.equal(social(advance(controller,21.5)).length,0);
  assert.equal(social(advance(controller,.5)).length,1);
  controller.defer(40);assert.equal(controller.view().quiet,40);controller.defer(2);assert.equal(controller.view().quiet,40);
});
