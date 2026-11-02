import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_REST_FUNERAL_BELLS,SOURCE_REST_FUNERAL_RULES,sourceRestFuneralPlan,createSourceRestFuneralDirector} from '../src/game/source-rest-funeral-director.js';

const phase='wrong-return',first=sourceRestFuneralPlan(phase)[0],close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const sample=(director,t,extra={})=>director.update({phase,mediaTime:t,audioTime:t,...extra});

test('one funeral company shares duty differently without becoming a note-sequenced accompaniment',()=>{
  const a=sourceRestFuneralPlan(phase),b=sourceRestFuneralPlan('catch');
  assert.deepEqual(new Set(a.map(v=>v.bellId)),new Set(b.map(v=>v.bellId)));
  assert.deepEqual(a.slice(0,3).map(v=>v.bellId),['rest-bell-far','rest-bell-left','rest-bell-right']);
  assert.deepEqual(b.slice(0,3).map(v=>v.bellId),['rest-bell-right','rest-bell-left','rest-bell-far']);
  for(const plan of[a,b]){
    assert.equal(new Set(plan.map(v=>v.id)).size,plan.length);
    assert.equal(plan[0].responseTo,null);
    for(let n=1;n<plan.length;n++){
      assert.equal(plan[n].responseTo,plan[n-1].id);
      assert.ok(plan[n].at-plan[n-1].at>=28,'solemn handoffs leave room for each strike and tail');
    }
    assert.ok(new Set(plan.slice(1).map((v,n)=>Math.round((v.at-plan[n].at)*10))).size>8,'pauses are individually authored, not a beat grid');
    for(const bell of SOURCE_REST_FUNERAL_BELLS[phase]){
      const strokes=plan.filter(v=>v.bellId===bell.id);
      for(let n=1;n<strokes.length;n++)assert.notEqual(strokes[n].stroke,strokes[n-1].stroke);
    }
    assert.ok(plan.every(v=>v.energy>0&&v.energy<=1));
  }
  assert.equal(sourceRestFuneralPlan('elsewhere'),null);
  assert.ok(Object.isFrozen(a)&&Object.isFrozen(a[0])&&Object.isFrozen(a[0].position));
});

test('phase anchors preserve Source II and give III its own finite chart-local positions and the same pitches',()=>{
  const a=SOURCE_REST_FUNERAL_BELLS[phase],b=SOURCE_REST_FUNERAL_BELLS.catch;
  assert.deepEqual(a.map(v=>v.position),[{x:-9.5,y:13.2,z:-25.6},{x:-10.7,y:13.600000000000001,z:-16.799999999999997},{x:-20.5,y:17,z:-20.95}]);
  assert.deepEqual(a.map(v=>[v.id,v.sample,v.note,v.frequency,v.audioUrl]),b.map(v=>[v.id,v.sample,v.note,v.frequency,v.audioUrl]));
  assert.ok(b.every(v=>v.phase==='catch'&&v.chartId===0&&Object.values(v.position).every(Number.isFinite)));
  assert.notDeepEqual(a.map(v=>v.position),b.map(v=>v.position));
  assert.match(SOURCE_REST_FUNERAL_RULES.palette,/not key-neutral/);
  assert.match(SOURCE_REST_FUNERAL_RULES.sourceIIIAnchors,/production geometry/);
});

test('contact has one identity across tolerant exact ticks, duplicate frames and subsequent observations',()=>{
  const d=createSourceRestFuneralDirector();sample(d,first.at-.02);
  const hit=sample(d,first.at-1e-12);assert.equal(hit.contacts.length,1);assert.equal(hit.bellEvents,hit.contacts);
  assert.equal(hit.contacts[0].id,first.id);assert.deepEqual(hit.contacts[0].position,first.position);
  assert.equal(hit.contacts[0].audioAt,first.at-1e-12);
  for(const t of[first.at-1e-12,first.at,first.at+1e-12,first.at+.02])assert.equal(sample(d,t).contacts.length,0);
  assert.equal(sample(d,first.at+.04).diagnostics.totalContacts,1);
});

test('contact visual preparation leads the same mouth and its clapper lands when the sound event is due',()=>{
  const d=createSourceRestFuneralDirector(),pre=sample(d,first.at-.45),bell=pre.bells.find(v=>v.id===first.bellId);
  assert.equal(pre.contacts.length,0);assert.equal(bell.preparing,true);assert.ok(Math.abs(bell.angle)>.2);assert.ok(bell.clapperAngle>.1);
  const hit=sample(d,first.at),mouth=hit.bells.find(v=>v.id===first.bellId);
  assert.equal(hit.contacts.length,1);assert.equal(mouth.lastStrikeId,hit.contacts[0].id);assert.equal(mouth.preparing,false);
  assert.equal(mouth.impact,1);assert.ok(Math.abs(mouth.angle)>.35&&mouth.clapperAngle>.2);
  assert.ok(hit.bells.filter(v=>v.id!==first.bellId).every(v=>v.impact===0&&v.angle===0));
});

test('open and half-muffled strikes contact opposite sides of the fitted clapper pad',()=>{
  const events=sourceRestFuneralPlan(phase).filter(v=>v.bellId==='rest-bell-far');
  const contacts=events.slice(0,2).map(event=>{const d=createSourceRestFuneralDirector();return sample(d,event.at).bells.find(b=>b.id===event.bellId);});
  assert.equal(contacts[0].stroke,'open');assert.equal(contacts[1].stroke,'muffled');
  assert.ok(contacts[0].angle<0&&contacts[0].clapperAngle>0);
  assert.ok(contacts[1].angle>0&&contacts[1].clapperAngle<0);
});

test('walking time-stretch keeps media contacts fixed but physical recovery on actual audio seconds',()=>{
  const slow=createSourceRestFuneralDirector(),normal=createSourceRestFuneralDirector();
  sample(slow,first.at-.1,{audioTime:19.8,playbackRate:.5});sample(normal,first.at-.1,{audioTime:19.9});
  const a=sample(slow,first.at,{audioTime:20,playbackRate:.5}),b=sample(normal,first.at,{audioTime:20});
  assert.equal(a.contacts[0].at,b.contacts[0].at);assert.equal(a.contacts[0].audioAt,b.contacts[0].audioAt);
  const as=sample(slow,first.at+.5,{audioTime:21,playbackRate:.5}),bs=sample(normal,first.at+1,{audioTime:21});
  close(as.bells[2].angle,bs.bells[2].angle);close(as.bells[2].clapperAngle,bs.bells[2].clapperAngle);close(as.musicDuck.gain,bs.musicDuck.gain);
  assert.equal(as.diagnostics.clockSource,'audio-context');
});

test('the performance stays at unity before a duty and after the struck bell has recovered or expired',()=>{
  const d=createSourceRestFuneralDirector();
  assert.equal(sample(d,0).musicDuck.gain,1);
  sample(d,first.at-.1);
  close(sample(d,first.at).musicDuck.gain,SOURCE_REST_FUNERAL_RULES.duckGain);
  close(sample(d,first.at+.1,{audioTime:first.at+3}).musicDuck.gain,1);
  const expired=sample(d,first.at+.2,{audioTime:first.at+20});
  assert.equal(expired.diagnostics.livePoses,0);
  assert.equal(expired.musicDuck.gain,1);
  assert.equal(sample(d,0,{phase:'no-place'}).musicDuck.gain,1);
});

test('stalls, inactive range, backward seeks and resume never accumulate a catch-up volley',()=>{
  const d=createSourceRestFuneralDirector();sample(d,0);assert.equal(sample(d,100).contacts.length,0);
  assert.equal(sample(d,100).diagnostics.totalContacts,0);
  sample(d,106.8);assert.equal(sample(d,106.9).contacts.length,1);
  sample(d,72.1);assert.equal(sample(d,72.1).contacts.length,0,'backward seek does not invent earlier contacts');
  sample(d,106.8);assert.equal(sample(d,106.9).contacts.length,0,'already consumed contact cannot replay');
  sample(d,143.1,{active:false});assert.equal(sample(d,143.3).contacts.length,0,'range return starts at its actual media position');
  assert.ok(sample(d,143.4).diagnostics.skippedDiscontinuities>0);
});

test('ordinary range loss retains physical decay while lifecycle hold releases it without replay',()=>{
  const d=createSourceRestFuneralDirector();sample(d,first.at-.01);sample(d,first.at);
  const outside=sample(d,first.at+.2,{active:false});assert.ok(Math.abs(outside.bells[2].angle)>.3);assert.ok(outside.musicDuck.gain<1);
  const held=sample(d,first.at+.3,{hold:true});assert.ok(held.bells.every(v=>v.angle===0&&v.impact===0));assert.equal(held.musicDuck.gain,1);
  assert.equal(sample(d,first.at+.3).contacts.length,0);assert.equal(sample(d,first.at+.3).diagnostics.totalContacts,1);
});

test('explicit cycle and phase changes admit new duties while preserving finite IDs and response links',()=>{
  const d=createSourceRestFuneralDirector();const original=sample(d,first.at);assert.equal(original.contacts.length,1);
  const again=sample(d,first.at,{cycle:1});assert.equal(again.contacts.length,1);assert.notEqual(again.contacts[0].id,original.contacts[0].id);
  const second=sourceRestFuneralPlan(phase)[1];sample(d,second.at-.1,{cycle:1});
  assert.equal(sample(d,second.at,{cycle:1}).contacts[0].responseTo,again.contacts[0].id);
  const c=sample(d,sourceRestFuneralPlan('catch')[0].at,{phase:'catch'});assert.equal(c.contacts.length,1);assert.equal(c.bells[0].phase,'catch');
  assert.equal(c.diagnostics.totalContacts,1);
});

test('the visual departure stops new duties while a struck object recovers and the duck remains bounded',()=>{
  const d=createSourceRestFuneralDirector();sample(d,first.at);const quiet=sample(d,first.at+.2,{progress:.96});
  assert.equal(quiet.active,false);assert.equal(quiet.contacts.length,0);assert.ok(Math.abs(quiet.bells[2].angle)>0);
  assert.ok(quiet.musicDuck.gain>=SOURCE_REST_FUNERAL_RULES.duckGain&&quiet.musicDuck.gain<1);
  close(sample(d,first.at+4,{progress:.96}).musicDuck.gain,1);
  const invalid=sample(d,0,{phase:'no-place'});assert.equal(invalid.active,false);assert.deepEqual(invalid.bells,[]);assert.deepEqual(invalid.contacts,[]);
});

test('a full slow or ordinary performance has bounded state and exactly one contact per planned duty',()=>{
  for(const p of[phase,'catch'])for(const rate of[1,.72]){
    const d=createSourceRestFuneralDirector(),found=[];
    for(let t=0;t<850;t+=.04){const f=sample(d,t,{phase:p,audioTime:t/rate,playbackRate:rate});found.push(...f.contacts);assert.ok(f.diagnostics.livePoses<=3);}
    assert.equal(found.length,sourceRestFuneralPlan(p).length);assert.equal(new Set(found.map(v=>v.id)).size,found.length);
    const done=sample(d,850,{phase:p,audioTime:850/rate,playbackRate:rate});assert.equal(done.diagnostics.seen,sourceRestFuneralPlan(p).length);
  }
});
