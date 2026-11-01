import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_REST_CONVERSATIONS,sourceRestConversation} from '../src/data/source-rest-conversation.js';

// Inspect the authored graph, rather than mistaking a timed choice for a
// requirement to press a continue button. A terminal action is automatic.
test('Source II has a real early exit, a continuous locked final movement, and no identity explanation',()=>{
  const story=sourceRestConversation('wrong-return');assert.equal(story.phase,'wrong-return');
  const seen=new Set(),queue=[[story.entry,false]];let commits=0,leaves=0;
  while(queue.length){
    const [id,wasLocked]=queue.shift(),key=`${id}:${wasLocked}`;if(seen.has(key))continue;seen.add(key);
    const node=story.nodes[id];assert.ok(node,`missing ${id}`);const locked=wasLocked||!!node.lockExit;
    if(wasLocked)assert.equal(node.lockExit,true,`${id} must not reopen exit`);
    assert.ok(node.lines.length>0,`${id} has conversation`);
    for(const line of node.lines){assert.ok(['you','other'].includes(line.who));assert.ok(line.text.trim());}
    assert.equal(new Set(node.choices.map(x=>x.id)).size,node.choices.length,`${id} repeats a choice id`);
    const destinations=[...(node.next?[node.next]:[]),...node.choices.flatMap(c=>c.next?[c.next]:[])];
    for(const next of destinations){assert.ok(story.nodes[next],`${id} leads to missing ${next}`);queue.push([next,locked]);}
    for(const choice of node.choices){assert.ok(choice.label.trim());assert.notEqual(!!choice.next,!!choice.action);if(choice.action==='leave'){assert.equal(locked,false);leaves++;}else if(choice.action)assert.fail(`unexpected choice action ${choice.action}`);}
    if(node.action==='commit'){commits++;assert.equal(id,'last');assert.equal(locked,true);assert.equal(destinations.length,0);}
    else assert.ok(destinations.length||node.choices.some(c=>c.action==='leave'),`${id} has no route forward`);
  }
  assert.ok(leaves>0);assert.equal(commits,1);
  assert.deepEqual([...new Set([...seen].map(k=>k.split(':')[0]))].sort(),Object.keys(story.nodes).sort());
  assert.equal(story.nodes.interruption.choices.some(c=>c.action==='leave'),true);
  assert.equal(story.nodes.distance.lockExit,true);
  const script=Object.values(story.nodes).flatMap(n=>n.lines.map(l=>l.text)).join(' ');
  assert.doesNotMatch(script,/who (?:are you|is talking)|whose memory|what (?:are you|do you represent)|you die|run ends/i);
  assert.match(script,/Bach/);assert.match(script,/marimba/i);assert.match(script,/ornaments/i);assert.match(script,/organist/i);
  assert.match(script,/singing/i);assert.match(script,/John Caid/i);assert.match(script,/Fluxus/i);
  assert.match(story.nodes.last.lines.map(l=>l.text).join(' '),/note/i);
});

test('Source III has its own timed Couperin undertaking instead of the former fragment/shared ending',()=>{
  const story=SOURCE_REST_CONVERSATIONS.catch,nodes=story.nodes;
  const script=Object.values(nodes).flatMap(n=>n.lines.map(l=>l.text)).join(' ');
  assert.equal(story.timed,true);assert.match(script,/Couperin/);assert.match(script,/harpsichord/i);
  assert.match(script,/guitar études/);assert.match(script,/microphones/i);assert.match(script,/electronics/i);assert.match(script,/revoicing/i);
  assert.doesNotMatch(script,/short fragment|made a loop|you die|run ends/i);
  assert.ok(nodes['threshold-choice'].choices.some(c=>c.action==='leave'));
  assert.ok(nodes['threshold-choice'].choices.some(c=>c.label==='Let it finish.'&&c.next==='revoicing'));
  assert.equal(nodes.revoicing.lockExit,true);assert.equal(nodes.last.action,'commit');
  assert.equal(sourceRestConversation('elsewhere'),null);
});

test('the Chaconne was shared with both people without revealing an unspoken name or inventing their responses',()=>{
  const unnamed=sourceRestConversation('wrong-return'),named=sourceRestConversation('wrong-return',{sarahNamed:true});
  const memory=story=>story.nodes.distance.lines.map(line=>line.text).join(' ');
  assert.match(memory(unnamed),/played it for her.*played it for Lyle/i);
  assert.doesNotMatch(memory(unnamed),/Sarah/);
  assert.match(memory(named),/played it for Sarah.*played it for Lyle/i);
  assert.match(memory(named),/not the same version/i);
  assert.match(memory(named),/first in a practice room, early on.*later, at a recital/i);
  assert.deepEqual(named.nodes.distance.choices,unnamed.nodes.distance.choices);
  assert.equal(sourceRestConversation('catch',{sarahNamed:true}),SOURCE_REST_CONVERSATIONS.catch);
  assert.match(unnamed.nodes['after-interruption'].lines.map(line=>line.text).join(' '),/back in the car/i);
});

test('the organ research is framed as the player’s interpretation about instruments',()=>{
  const lines=sourceRestConversation('wrong-return').nodes.organ.lines;
  assert.ok(lines.some(line=>line.who==='you'&&/organists/i.test(line.text)));
  assert.ok(lines.some(line=>line.who==='you'&&/I think.*particular.*change instruments/i.test(line.text)));
  assert.ok(lines.some(line=>line.who==='other'&&/marimba/i.test(line.text)));
});
