// The studio's view of dialogue still written in code (scripts/export-runtime-narrative.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractModule, documentFor } from '../scripts/export-runtime-narrative.mjs';
import { validateNarrativeDocument } from '../src/narrative/contracts.js';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mergeRuntimeDocuments} from '../tools/narrative-studio/src/runtime-refresh.js';
import {projectStudioTimeline} from '../tools/narrative-studio/src/timeline-model.js';
import {storyMatchesSearch,storySearchNode} from '../tools/narrative-studio/src/story-search.js';
import {transform} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const fixture = `
const RUTH = 'Ruth Mallory';
const WHO = Object.freeze({ GUARD: 'the guard' });
const line = (who, text) => ({ who, text });
const r = text => line('ren', text);
const c = (id, text, goto) => ({ id, text, goto });
const lines = (...items) => items;
const n = (actor, lines) => ({ speaker: actor.toUpperCase(), lines: lines.map(x => x) });
export const VOICES = {
  ruth: { id: 'ruth', tree: { start: { lines: lines(
    { who: RUTH, text: 'Mind the gap by the west doors.' },
    { who: 'me', prompt: 'Ask about the rota.', text: 'What is the rota for?' },
  ) } } },
};
export const ROOF = { start: { lines: [r('Turn it over.'), { who: WHO.GUARD, text: 'Not tonight.' }], choices: [c('a', 'Ask again.', 'start'), c('b', 'Leave.', 'done')] } };
export const PARTY = n('odette', ['Still warm.', 'You cannot have been here long.']);
export const SHEET_LINES = ['For the part that would not play.'];
`;

test('lines built through helpers, constants and prompts all reach the studio', () => {
  const nodes = extractModule(fixture, 'src/data/fixture.js');
  const all = [...nodes.values()].flatMap(n => n.lines.map(l => `${l.who}: ${l.text}`));
  const choices = [...nodes.values()].flatMap(n => n.choices.map(c => c.text));
  for (const expected of ['Ruth Mallory: Mind the gap by the west doors.', 'me: What is the rota for?', 'ren: Turn it over.',
    'the guard: Not tonight.', 'ODETTE: Still warm.', 'ODETTE: You cannot have been here long.', 'text: For the part that would not play.'])
    assert.ok(all.includes(expected), `missing ${expected}\n${all.join('\n')}`);
  for (const expected of ['Ask about the rota.', 'Ask again.', 'Leave.']) assert.ok(choices.includes(expected), `missing choice ${expected}`);
  const doc = documentFor('data/fixture.js', nodes);
  assert.equal(doc.readOnly, true); assert.deepEqual(doc.regions, []); assert.equal(doc.module, 'src/data/fixture.js');
  const back = Object.values(doc.nodes).flatMap(n => n.choices || []).find(c => c.text === 'Ask again.');
  assert.ok(back.goto && doc.nodes[back.goto], 'a choice that names a sibling beat links to it');
  assert.equal(validateNarrativeDocument(doc).ok, true);
});

test('text the studio already owns is not listed twice', () => {
  const nodes = extractModule(fixture, 'src/data/fixture.js');
  const doc = documentFor('data/fixture.js', nodes, { canonicalText: new Set(['Turn it over.', 'Leave.']) });
  const texts = Object.values(doc.nodes).flatMap(n => [...n.lines.map(l => l.text), ...(n.choices || []).map(c => c.text)]);
  assert.ok(!texts.includes('Turn it over.') && !texts.includes('Leave.')); assert.ok(texts.includes('Not tonight.'));
});

test('imported, aliased line constructors retain their own scope and current imported words',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'chunk-surfer-studio-dialogue-'));
  try{
    await writeFile(join(dir,'words.js'),"export const NAME='the attendant';export const NOTE='The first recording.';");
    await writeFile(join(dir,'builders.js'),"import{NAME}from'./words.js';const line=(who,text)=>({who,text});export const speak=text=>line(NAME,text);");
    await writeFile(join(dir,'reexport.js'),"export{NOTE as CURRENT_NOTE}from'./words.js';");
    const source="import{speak as other}from'./builders.js';import{CURRENT_NOTE}from'./reexport.js';const scenes={start:{lines:[other(CURRENT_NOTE)]}};";
    const lines=()=>[...extractModule(source,join(dir,'scene.js')).values()].flatMap(n=>n.lines);
    assert.ok(lines().some(l=>l.who==='the attendant'&&l.text==='The first recording.'));
    await writeFile(join(dir,'words.js'),"export const NAME='the attendant';export const NOTE='The corrected recording.';");
    const updated=lines();
    assert.ok(updated.some(l=>l.text==='The corrected recording.'),'a later export must read an edited dependency');
    assert.ok(!updated.some(l=>l.text==='The first recording.'),'the imported-value cache cannot preserve stale prose');
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('conditional line arrays keep both authored variants and named answer builders keep their choices',()=>{
  const nodes=extractModule(`function scene(repeated){const options=()=>[{id:'inspect',text:'Inspect the return.',goto:'return'}, {id:'leave',text:'Leave the desk.'}];return {start:{speaker:'YOU',lines:repeated?['It happened again.']:['That was on the tape.'],choices:options()}};}`,'src/data/conditional-fixture.js');
  const all=[...nodes.values()];
  for(const text of ['It happened again.','That was on the tape.'])assert.ok(all.some(n=>n.lines.some(l=>l.text===text)));
  assert.ok(all.some(n=>n.path.some(p=>p.startsWith('when-'))));
  assert.ok(all.some(n=>n.path.some(p=>p.startsWith('otherwise-'))));
  for(const text of ['Inspect the return.','Leave the desk.'])assert.ok(all.some(n=>n.choices.some(c=>c.text===text)));
});

test('recent academic social exchanges and B3 investigation variants are visible in the source view',async()=>{
  const textIn=async file=>[...extractModule(await readFile(file,'utf8'),file).values()].flatMap(n=>[...n.lines,...n.choices]).map(v=>v.text);
  const social=await textIn('src/data/academic-bouncer-society.js');
  assert.ok(social.includes('Agathe wanted a time for the opening.'));
  assert.ok(social.includes('I gave her a heading.'));
  const b3=await textIn('src/data/b3-investigation-dialogue.js');
  assert.ok(b3.includes('Same phrase. Same speakers. A second length of tape, and exactly the same fault.'));
  assert.ok(b3.some(t=>t.includes('pull the mains plug')));
});

test('live code refresh replaces only derived documents while preserving unsaved authoring and media',()=>{
  const authored={readOnly:false,document:{id:'authored',nodes:{start:{text:'Unsaved new text'}}}},old={readOnly:true,document:{id:'old'}},replacement={readOnly:true,document:{id:'runtime'}},audio={unsaved:true},media={unsaved:true};
  const current={documents:[authored,old],audio,media,project:{unsaved:true}},fresh={documents:[{document:{id:'authored',text:'older disk text'}},replacement],audio:{},media:{}};
  const merged=mergeRuntimeDocuments(current,fresh);
  assert.deepEqual(merged.documents,[authored,replacement]);
  assert.equal(merged.documents[0],authored);assert.equal(merged.audio,audio);assert.equal(merged.media,media);assert.equal(merged.project,current.project);
});

test('bench and Ophanim views are discoverable by player terms and open on actual conversation entries',async()=>{
  const specs=[
    ['data/source-rest-conversation.js','Source II','bench','phaseOpenings.wrong-return.arrival'],
    ['data/source-rest-couperin-conversation.js','Source III','bench','nodes.arrival'],
    ['data/opening-prologue.js','Ophanim','opening','nodes.start'],
  ];
  for(const[relative,title,tag,entry]of specs){
    const source=await readFile('src/'+relative,'utf8'),doc=documentFor(relative,extractModule(source,'src/'+relative),{canonicalText:new Set(['There you are.','Yes.'])});
    assert.ok(doc.title.includes(title));assert.ok(doc.tags.includes(tag));assert.equal(doc.entry,entry);
    assert.ok(doc.nodes[entry].lines.length>0,'opening the document must show real dialogue');
    assert.ok(Object.values(doc.nodes).some(node=>node.choices?.length),'actual choices must be browseable');
    assert.ok(!Object.values(doc.nodes).flatMap(node=>node.lines).some(line=>line.text==='"{text}"'),'a helper declaration is not a spoken opening');
    if(title==='Ophanim'){
      assert.equal(doc.nodes[entry].lines[0].text,'You have been driving for a long time. It is raining on the road. The wipers go.');
      assert.equal(doc.nodes[entry].goto,'nodes.there');
    }else if(title==='Source II'){
      assert.equal(doc.nodes[entry].lines[0].text,'There you are.','unrelated canonical text must not erase the actual bench opening');
      assert.equal(doc.nodes[entry].goto,'phaseOpenings.wrong-return.first-choice');
    }else{
      assert.equal(doc.nodes[entry].goto,'nodes.arrival-choice');
    }
  }
});

test('the default timeline places actual Ophanim and bench conversations in their own sequence groups',async()=>{
  const project=JSON.parse(await readFile('content/project.json','utf8')),before=JSON.stringify(project),documents=[];
  for(const path of project.narrative)documents.push({path,document:JSON.parse(await readFile('content/'+path,'utf8'))});
  for(const name of ['opening-prologue','source-rest-conversation','source-rest-couperin-conversation','source-rest-questions','source-rest-earthly']){
    const path=`narrative-runtime/runtime.data.${name}.story.json`,document=JSON.parse(await readFile('content/'+path,'utf8'));
    documents.push({path,document,module:document.module,readOnly:true});
  }
  const entries=projectStudioTimeline(project,documents),opening=entries.find(e=>e.id==='opening'),source=entries.find(e=>e.id==='source-space');
  assert.equal(opening.documents[0],'runtime.data.opening-prologue');
  assert.deepEqual(source.documents.slice(1,5),['runtime.data.source-rest-conversation','runtime.data.source-rest-couperin-conversation','runtime.data.source-rest-questions','runtime.data.source-rest-earthly']);
  assert.equal(JSON.stringify(project),before,'derived source references cannot rewrite the editable manifest');
  assert.ok(documents.filter(d=>d.readOnly).every(d=>d.document.readOnly));
  for(const entry of entries)assert.equal(new Set(entry.documents).size,entry.documents.length);

  // Render the real workspace, so passing the adapter data alone cannot hide
  // these conversations behind a different tab or the generic source index.
  const src=await readFile('tools/narrative-studio/src/TimelineWorkspace.tsx','utf8');
  const compiled=await transform(src,{loader:'tsx',format:'cjs',jsx:'transform'}),module={exports:{}};
  new Function('module','exports','require','React',compiled.code)(module,module.exports,name=>{
    assert.equal(name,'./timeline-model.js');return{projectStudioTimeline};
  },React);
  const selected=[],view=module.exports.TimelineWorkspace({project,documents,selectedDocumentId:'',onSelect:id=>selected.push(id),runtimeDocumentCount:5});
  const html=renderToStaticMarkup(view),sections=html.split('<section');
  const openingHtml=sections.find(section=>section.includes('<h2>Opening and title flow</h2>'));
  const sourceHtml=sections.find(section=>section.includes('Source Space · Contact and listening'));
  assert.ok(openingHtml?.includes('Ophanim · Opening drive dialogue'));
  for(const title of ['Source II · Bench dialogue · Bach Chaconne','Source III · Bench dialogue · Couperin'])assert.ok(sourceHtml?.includes(title));
  assert.ok(sourceHtml.includes('From game code · read-only'));
  assert.ok(!html.includes('Missing document'));
  const elements=[];const visit=node=>{if(Array.isArray(node)){node.forEach(visit);return;}if(!React.isValidElement(node))return;elements.push(node);visit(node.props.children);};visit(view);
  for(const id of ['runtime.data.opening-prologue','runtime.data.source-rest-conversation','runtime.data.source-rest-couperin-conversation']){
    const title=documents.find(d=>d.document.id===id).document.title;
    const button=elements.find(node=>node.type==='button'&&React.Children.toArray(node.props.children).some(child=>React.isValidElement(child)&&child.props.children===title));
    assert.ok(button,`${title} has a normal visible timeline button`);button.props.onClick();assert.equal(selected.at(-1),id);
  }
});

test('named bench search opens its beginning while a sentence search opens the matching beat',async()=>{
  const document=JSON.parse(await readFile('content/narrative-runtime/runtime.data.source-rest-conversation.story.json','utf8'));
  const item={document,module:document.module,readOnly:true};
  for(const query of ['bench','Source II',document.module]){
    assert.equal(storyMatchesSearch(item,query),true);
    assert.equal(storySearchNode(item,query),document.entry);
  }
  const sentence='Then they can sit on the same bench.';
  assert.equal(storyMatchesSearch(item,sentence),true);
  assert.equal(storySearchNode(item,sentence),'shared.both');
  assert.equal(storyMatchesSearch(item,'unrelated sentence that nobody said'),false);
});
