import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_REST_COUPERIN_CONVERSATION as story,SOURCE_REST_COUPERIN_CUES as cues} from '../src/data/source-rest-couperin-conversation.js';
import {sourceRestConversation} from '../src/data/source-rest-conversation.js';
import {sourceRestColdOpenNodes} from '../src/game/source-rest-conversation-scene.js';

test('the III graph provides actual early exits, an explicit last offered exit, continuous late lock and one quiet terminal action',()=>{
  const seen=new Set(),queue=[[story.entry,false]];let leaves=0,commits=0;
  while(queue.length){
    const[id,wasLocked]=queue.shift(),key=id+':'+wasLocked;if(seen.has(key))continue;seen.add(key);
    const node=story.nodes[id];assert.ok(node);const locked=wasLocked||!!node.lockExit;
    if(wasLocked)assert.equal(node.lockExit,true,`${id} must not silently reopen leaving`);
    assert.ok(node.lines.length);assert.equal(new Set(node.choices.map(c=>c.id)).size,node.choices.length);
    const nexts=[...(node.next?[node.next]:[]),...node.choices.flatMap(c=>c.next?[c.next]:[])];
    for(const next of nexts){assert.ok(story.nodes[next]);queue.push([next,locked]);}
    for(const c of node.choices){
      assert.notEqual(!!c.next,!!c.action);assert.ok(c.label.trim());
      if(c.action){assert.equal(c.action,'leave');assert.equal(locked,false);leaves++;}
    }
    if(node.action){assert.equal(node.action,'commit');assert.equal(id,'last');assert.equal(locked,true);assert.equal(nexts.length,0);commits++;}
    else assert.ok(nexts.length||node.choices.some(c=>c.action==='leave'));
  }
  assert.deepEqual([...new Set([...seen].map(k=>k.split(':')[0]))].sort(),Object.keys(story.nodes).sort());
  assert.ok(leaves>=5);assert.equal(commits,1);
  assert.deepEqual(story.nodes['threshold-choice'].choices.map(c=>c.label),['Let it finish.','Get up.']);
  assert.equal(story.nodes.revoicing.lockExit,true);assert.equal(story.nodes['threshold-choice'].lockExit,undefined);
  assert.deepEqual(story.nodes.last.lines.slice(-3).map(l=>l.text),['There it is.','Yes.','Leave it there.']);
  assert.ok(story.nodes.last.lines.length>=10,'the sustained black exchange has more than its former two-line payoff');
});

test('language choices are exact ordinary player utterances, never disguised mix commands or another Continue gate',()=>{
  for(const[id,node]of Object.entries(story.nodes))for(const option of node.choices){
    if(!option.next)continue;
    const first=story.nodes[option.next].lines[0];
    if(!id.startsWith('questions-')&&!option.next.startsWith('questions-')){assert.equal(first.who,'you');assert.equal(first.text,option.label,`${id} reply must be delivered exactly as selected`);}
    assert.doesNotMatch(option.label,/continue|select (?:the )?mix|electronic gain|acoustic gain|turn off/i);
  }
  const mapped=sourceRestColdOpenNodes(story);
  for(const node of Object.values(mapped))for(const line of node.lines){assert.equal(line.voice,false);assert.equal(line.say,false);}
  for(const node of Object.values(story.nodes))for(const line of node.lines){assert.equal(line.voice,false);assert.equal(line.say,false);}
});

test('seven cue floors belong to the full-piece lifecycle and preserve the specified personal impetus without inventing a prior performance',()=>{
  assert.equal(story.phase,'catch');assert.equal(story.timed,true);assert.equal(story.cues,cues);
  assert.deepEqual(Object.keys(cues),['arrival','guitar-etudes','harpsichord','recording','revoicing','return','last']);
  assert.ok(Object.values(cues).every((p,i,a)=>p>=0&&p<=1&&(i===0||p>a[i-1])));
  for(const id of Object.keys(cues))assert.ok(story.nodes[id]);
  // The late earthly question is shared with Source II and names people from
  // his life on purpose; test/source-rest-earthly.spec.mjs owns its rules.
  const script=Object.entries(story.nodes).filter(([id])=>!id.startsWith('question')&&!id.startsWith('earthly')).flatMap(([,n])=>n.lines.map(l=>l.text)).join(' ');
  assert.match(script,/guitar études.*marimba.*harpsichord/);
  assert.match(script,/At first the harpsichord was a way back to the marimba/);
  assert.match(script,/microphones/);assert.match(script,/electronics/);assert.match(script,/A revoicing\. Not a correction\./);
  assert.doesNotMatch(script,/short fragment|made a loop|I (?:played|recorded) this|I made (?:this|a version)|Sarah|Lyle|professor|Bach|God|developer|HUSH|Escher|shader|glitch|mix director|run ends|you die/i);
  assert.ok(!('shared' in story.nodes));assert.equal(sourceRestConversation('catch'),story);
});

test('Source II retains its musical history and legitimate Sarah/Lyle variants around the optional questions',()=>{
  const plain=sourceRestConversation('wrong-return'),named=sourceRestConversation('wrong-return',{sarahNamed:true});
  assert.match(plain.nodes.distance.lines.map(l=>l.text).join(' '),/played it for her.*played it for Lyle/i);
  assert.match(named.nodes.distance.lines.map(l=>l.text).join(' '),/played it for Sarah.*played it for Lyle/i);
  assert.deepEqual(plain.nodes.organ,named.nodes.organ);assert.equal(plain.nodes['after-interruption'].next,'questions-entry');
  assert.equal(plain.nodes['questions-entry'].choices[0].next,'ornaments');
  assert.equal(plain.nodes.distance.lockExit,true);assert.equal(plain.nodes.last.action,'commit');assert.ok(plain.nodes.last.lines.length>=10);
});
