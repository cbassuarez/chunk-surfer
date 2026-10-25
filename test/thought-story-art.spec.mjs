import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planStoryArtInPanel,planStoryArtSideBySide,storyArtSideBySidePanelRows,storyArtSideBySideTextLayout} from '../src/game/story-art-card.js';
import {planThoughtTextPanel} from '../src/game/thoughts.js';

// Exercise the real scene presenter with its draw boundary replaced by a
// recording surface. The authored conversation view stays unchanged.
const source=readFileSync(new URL('../src/game/thoughts.js',import.meta.url),'utf8');
const begin=source.indexOf('export function makeThoughtScene('),end=source.indexOf('// ── which thoughts',begin);
const factoryBody=source.slice(begin,end).replace('export function makeThoughtScene','return function makeThoughtScene');
function render(options={}){
  const art=Object.freeze({id:'guard',mode:'hero'}),view=Object.freeze({art,who:'guard',speaker:'GUARD',pending:{kind:'choice',options:[{text:'Sign the book.'}]}});
  const counts={resolved:0,art:0,transcript:0,choices:0},noop=()=>{};
  const dependencies={
    BAND_W:86,planThoughtTextPanel,scenes:{remove:noop},uiSize:()=>({cols:120,rows:60}),uiScrim:noop,
    createConversation:()=>({view:()=>view,start:noop,stop:noop,update:noop,key:()=>true}),
    withMachinePanel:(x,y,w,h,_options,draw)=>draw({x,y,w,h}),
    resolveStoryArt:value=>{counts.resolved++;return value;},drawStoryArtCard:()=>counts.art++,
    planStoryArtInPanel,planStoryArtSideBySide,storyArtSideBySidePanelRows,storyArtSideBySideTextLayout,
    drawTranscriptHeader:({y})=>({y,rows:1}),layoutTranscriptChoices:()=>({height:2}),fixedTranscriptLanes:()=>({right:{}}),
    layoutTranscript:v=>v,drawTranscript:v=>{
      if(options.showStoryArt===false)assert.deepEqual(v,planThoughtTextPanel({view,width:86,rows:60,slate:options.slate||''}).transcript);
      else assert.equal(v,view);
      counts.transcript++;
    },drawTranscriptChoices:()=>counts.choices++,
    transcriptSource:who=>who,promptLine:()=>'',
  };
  const make=new Function(...Object.keys(dependencies),factoryBody)(...Object.values(dependencies));
  const scene=make(options);scene.render();assert.equal(scene.view(),view);assert.equal(scene.view().art,art);
  return counts;
}

test('thoughts preserve their authored story art by default',()=>{
  assert.deepEqual(render(),{resolved:1,art:1,transcript:1,choices:1});
});
test('a physical conversation suppresses only the illustrated presentation',()=>{
  assert.deepEqual(render({showStoryArt:false,anchor:'bottom',scrim:.12}),{resolved:0,art:0,transcript:1,choices:1});
});
