import test from 'node:test';
import assert from 'node:assert/strict';
import {createPubLifeDirector} from '../src/game/pub-life.js';
import {PUB_NEW_ACTORS} from '../src/data/pub-population.js';
import {pubPatronConversation,PUB_OVERHEARDS} from '../src/data/pub-patrons.js';
function fixture(){
  const events=[];
  const director=createPubLifeDirector({createDispatch:options=>({sayAll:lines=>events.push({type:'say',options,lines}),cancel:()=>events.push({type:'cancel'})})});
  const tick=(seconds,context={})=>{for(let t=0;t<seconds;t+=.5)director.update({dt:.5,inPub:true,...context});};
  return {director,events,tick};
}
test('pub company cannot speak outside the room and pauses its own waiting clock',()=>{
  const {director,events,tick}=fixture();tick(60,{inPub:false});assert.equal(events.length,0);assert.equal(director.snapshot().elapsed,0);
  tick(8.5);assert.equal(events.length,0);tick(.5);assert.equal(events.filter(e=>e.type==='say').length,1);
  tick(90,{paused:true});assert.equal(events.filter(e=>e.type==='say').length,1);assert.equal(director.snapshot().active,false);
});
test('approaching a person cancels overheard speech and leaves time before another exchange',()=>{
  const {director,events,tick}=fixture();tick(9);assert.equal(director.snapshot().active,true);
  tick(35,{busy:true});assert.equal(director.snapshot().active,false);assert.equal(events.filter(e=>e.type==='say').length,1);
  tick(4);assert.equal(events.filter(e=>e.type==='say').length,1);tick(1);assert.equal(events.filter(e=>e.type==='say').length,2);
  director.update({inPub:false});assert.equal(director.snapshot().active,false);
});
test('every new patron has distinct revisitable conversation and ambient exchanges have named sources',()=>{
  for(const actor of PUB_NEW_ACTORS.filter(actor=>actor.action!=='pub-bartender')){
    const first=pubPatronConversation(actor.id),again=pubPatronConversation(actor.id,{revisited:true});
    assert.ok(first);assert.equal(again.startAt,'again');assert.notEqual(first.tree.start.lines[0].text,again.tree.again.lines[0].text);
    for(const node of Object.values(first.tree))for(const choice of node.choices||[])if(choice.goto)assert.ok(first.tree[choice.goto]);
  }
  for(const exchange of PUB_OVERHEARDS)for(const line of exchange){assert.match(line.voiceSpeaker,/^pub-/);assert.ok(line.sourceLabel);assert.equal(line.who,'unknown');}
  assert.ok(PUB_OVERHEARDS.some(exchange=>exchange.some(line=>/soup/.test(line.text))));
  assert.ok(PUB_OVERHEARDS.some(exchange=>exchange.some(line=>/Tea for the ones/.test(line.text))));
  assert.ok(PUB_OVERHEARDS.every(exchange=>exchange.length<=3),'company remains a brief exchange rather than another compulsory conversation');
});
