import test from 'node:test';
import assert from 'node:assert/strict';
import {planThoughtTextPanel} from '../src/game/thoughts.js';
import {machinePanelBody,machinePanelAperture} from '../src/render/presentation.js';
import {buildPubBartenderDialogue} from '../src/data/pub-dialogue.js';
import {pubQuestState,PUB_FAVORS} from '../src/game/pub-quest.js';

const nodes=buildPubBartenderDialogue(pubQuestState({}),PUB_FAVORS);
const view=(line,history=[])=>({speaker:'IONA REED',who:line.who,line,typed:line.text.length,typing:false,lineAge:2,lineSerial:4,history});
const words=s=>s.replace(/\s+/g,' ').trim();
const bodyText=p=>p.transcript.blocks.flatMap(b=>b.rows.map(r=>r.text)).join(' ');
function insideGlass(p,width){
  const body=machinePanelBody(0,0,width,p.panelH,{footer:'CONTINUE'}),glass=machinePanelAperture(0,0,width,p.panelH);
  const y=body.y+p.headerOffset;
  assert.ok(y+p.availableRows<=glass.y+glass.h,'complete glyph rows fit above lower glass edge');
  assert.ok(p.transcript.height<=p.availableRows,'no forced overheight transcript block');
}

test('actual Iona requests retain their beginning and ending inside production glass at normal and large text',()=>{
  for(const [width,rows] of [[86,40],[86,25],[67,20]])for(const line of nodes.offer.lines){
    const p=planThoughtTextPanel({view:view(line),width,rows,slate:'THE LYRIC / IONA REED'});
    insideGlass(p,width);let text='';
    for(let page=0;page<p.pages;page++)text+=' '+bodyText(planThoughtTextPanel({view:view(line),width,rows,slate:'THE LYRIC / IONA REED',page}));
    assert.equal(words(text),words(line.text));
  }
});
test('container dimensions and page count use full authored line rather than changing typed substring',()=>{
  const v=view(nodes.offer.lines[0]),full=planThoughtTextPanel({view:v,width:86,rows:25,slate:'THE LYRIC'});
  for(const typed of [0,1,50,v.typed]){const p=planThoughtTextPanel({view:{...v,typed,typing:typed<v.typed},width:86,rows:25,slate:'THE LYRIC'});assert.equal(p.panelH,full.panelH);assert.equal(p.pages,full.pages);}
});
test('same-speaker history is removed before it can crop the current request',()=>{
  const v=view(nodes.offer.lines[0],Array.from({length:3},(_,i)=>({...nodes.start.lines[1],serial:i,text:'Earlier words. '.repeat(25)})));
  const p=planThoughtTextPanel({view:v,width:86,rows:25,slate:'THE LYRIC'});
  assert.equal(p.pages,1);assert.equal(words(bodyText(p)),words(v.line.text));assert.ok(!p.transcript.blocks.some(b=>b.clipped));
});
test('an utterance too long for large text is paged from its beginning with every word reachable',()=>{
  const line={who:'unknown',sourceLabel:'IONA REED',text:Array.from({length:160},(_,i)=>`word${i}`).join(' ')},v=view(line);
  const first=planThoughtTextPanel({view:v,width:54,rows:20,slate:'THE LYRIC'});assert.ok(first.pages>1);assert.ok(bodyText(first).startsWith('word0'));
  let all='';for(let page=0;page<first.pages;page++){const p=planThoughtTextPanel({view:v,width:54,rows:20,slate:'THE LYRIC',page});insideGlass(p,54);all+=' '+bodyText(p);}
  assert.equal(words(all),line.text);
});
test('choices reserve their own rows without pushing the last request or controls through the glass',()=>{
  const line=nodes.offer.lines[0],v={...view(line,[{...line,serial:1}]),pending:{kind:'branch',index:0,options:nodes.offer.choices}};
  const p=planThoughtTextPanel({view:v,width:86,rows:40,slate:'THE LYRIC'});insideGlass(p,86);
  assert.equal(words(bodyText(p)),line.text);assert.equal(p.pages,1);
});
