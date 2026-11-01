import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {layoutTranscriptChoices,fitTranscriptChoices} from '../src/render/transcript.js';
import {machinePanelBody} from '../src/render/presentation.js';
import {planThoughtTextPanel} from '../src/game/thoughts.js';
import {planStoryArtInPanel,planStoryArtSideBySide,storyArtSideBySidePanelRows,storyArtSideBySideTextLayout} from '../src/game/story-art-card.js';

const word='antidisestablishmentarianism'.repeat(14);
const view=(index=0)=>({nodeId:'entry',who:'guard',pending:{kind:'branch',index,options:[{text:'Stay here.'},{text:`Please listen ${word} before choosing.`},{text:'Leave.'}]},spent:()=>false});

test('complete choice words wrap without loss and keep action metadata',()=>{
 const layout=layoutTranscriptChoices(view(1),30,{lane:{x:0,w:30,align:'left'}});
 const rows=layout.rows.filter(row=>row.choiceIndex===1);
 assert.ok(rows.length>2);
 assert.equal(rows.map(row=>row.bodyText).join('').replace(/\s/g,''),`Pleaselisten${word}beforechoosing.`);
 assert.equal(rows[0].firstLine,true);assert.ok(rows.every(row=>row.selected&&row.choiceIndex===1));
 assert.ok(rows.every(row=>row.text.length<=layout.lane.w));
});

test('bounded choices follow selection and expose long selected text through page offsets',()=>{
 const layout=layoutTranscriptChoices(view(1),30,{lane:{x:0,w:30,align:'left'}});
 const first=fitTranscriptChoices(layout,3);
 assert.equal(first.rows.length,3);assert.equal(first.selectedScroll,true);assert.equal(first.rows[1].choiceIndex,1);
 assert.ok(first.selectedMaxOffset>0);
 const next=fitTranscriptChoices(layout,3,{selectedOffset:1});
 assert.equal(next.selectedOffset,1);assert.equal(next.rows[1].firstLine,true);assert.equal(next.rows[1].choiceIndex,1);
 const tiny=fitTranscriptChoices(layout,1,{selectedOffset:1});
 assert.equal(tiny.rows.length,1);assert.equal(tiny.rows[0].choiceIndex,1);assert.equal(tiny.rows[0].firstLine,true);
 const last=fitTranscriptChoices(layout,3,{selectedOffset:999});
 assert.equal(last.selectedOffset,last.selectedMaxOffset);
});

const source=readFileSync(new URL('../src/game/thoughts.js',import.meta.url),'utf8');
const start=source.indexOf('export function makeThoughtScene('),end=source.indexOf('// ── which thoughts',start);
const factoryBody=source.slice(start,end).replace('export function makeThoughtScene','return function makeThoughtScene');
function thought(anchor){
 let current=view(1),panelY=null,drawn=null,confirmed=0;
 const deps={BAND_W:86,planThoughtTextPanel,scenes:{remove(){}},uiSize:()=>({cols:60,rows:24}),uiScrim(){},
  createConversation:()=>({view:()=>current,start(){},stop(){},update(){},key(e){if(e.key==='ArrowDown')current=view(2);if(e.key==='Enter')confirmed++;return true;}}),
  withMachinePanel:(x,y,w,h,o,draw)=>{panelY=y;draw(machinePanelBody(x,y,w,h,{footer:o.footer}));},
  resolveStoryArt:()=>null,drawStoryArtCard(){},planStoryArtInPanel,planStoryArtSideBySide,storyArtSideBySidePanelRows,storyArtSideBySideTextLayout,
  drawTranscriptHeader:({y})=>({y,rows:0}),layoutTranscriptChoices,fitTranscriptChoices,
  layoutTranscript:()=>({blocks:[],height:0}),drawTranscript(){},drawTranscriptChoices:layout=>{drawn=layout;},
  fixedTranscriptLanes:()=>({right:{}}),transcriptSource:who=>who,promptLine:()=>'',activeInputPromptDevice:()=> 'keyboard',
 };
 const make=new Function(...Object.keys(deps),factoryBody)(...Object.values(deps));
 const scene=make({anchor,showStoryArt:false});
 return{scene,render(){scene.render();return{panelY,drawn,confirmed};}};
}

test('lower placement maps to bottom and retains deliberate choice and look',()=>{
 const center=thought('center'),bottom=thought('bottom'),lower=thought('lower');
 const a=center.render(),b=bottom.render(),c=lower.render();
 assert.ok(c.panelY>=a.panelY);assert.equal(c.panelY,b.panelY);assert.equal(lower.scene.allowsLook,true);assert.equal(c.confirmed,0);
});

test('long selected choice pages without committing and selection change resets scroll',()=>{
 const h=thought('bottom');let r=h.render();assert.ok(r.drawn.selectedScroll);
 h.scene.key({key:'PageDown'});r=h.render();assert.equal(h.scene.view().choiceScrollOffset,1);assert.equal(r.drawn.rows[1].firstLine,true);assert.equal(r.confirmed,0);
 h.scene.key({key:'',controllerAction:'tabNext'});r=h.render();assert.equal(h.scene.view().choiceScrollOffset,2);assert.equal(r.confirmed,0);
 h.scene.key({key:'ArrowDown'});r=h.render();assert.equal(h.scene.view().choiceScrollOffset,0);assert.equal(r.drawn.selectedIndex,2);assert.equal(r.confirmed,0);
 h.scene.key({key:'Enter'});assert.equal(h.render().confirmed,1);
});
