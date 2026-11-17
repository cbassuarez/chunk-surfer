import assert from 'node:assert/strict';
import {TITLE_HEADER_DIRECTIONS,titleHeaderAction,titleHeaderLayout} from '../src/render/title-header-directions.js';
import {DISPLAY_CONTRACT,computeStageLayout} from '../src/platform/display-policy.js';
import {vfdGlyphMissing} from '../src/render/vfd-font.js';
import {titleMenuItems} from '../src/game/title-menu.js';

const states=[
  {meta:{},activeRun:false,filed:0},
  {meta:{leftMidRun:true},activeRun:false,filed:0},
  {meta:{},activeRun:true,filed:0},
  {meta:{endingsSeen:['a']},filed:1},
  {meta:{endingsSeen:['a','b','c']},filed:12},
  {meta:{endingsSeen:new Array(999)},filed:999999},
];
let cases=0;
for(const preset of DISPLAY_CONTRACT.windowPresets)for(const uiScale of DISPLAY_CONTRACT.uiScalePresets)for(const dpr of [1,2]){
 const stage=computeStageLayout(preset.width,preset.height),cellW=8.45*uiScale.value,cellH=20*uiScale.value;
 const cols=Math.floor(stage.stageWidth/cellW),rows=Math.floor(stage.stageHeight/cellH),w=Math.min(78,cols-4),h=Math.min(28,rows-4);
 const body={x:Math.floor((cols-w)/2)+3,y:Math.floor((rows-h)/2)+4,w:w-6,h:h-6};
 for(const direction of TITLE_HEADER_DIRECTIONS)for(const state of states)for(const item of titleMenuItems(state.meta,{activeRun:!!state.activeRun,desktop:true})){
  const ops=titleHeaderLayout(direction,{body,metrics:{cellW,cellH,dpr},action:titleHeaderAction(item)});
  for(const op of ops){
   const description=`${direction}, ${preset.id}, UI ${uiScale.id}, DPR ${dpr}: ${op.text||op.kind}`;
   assert(op.x>=body.x&&op.x+op.w<=body.x+body.w,`horizontal fit: ${description}`);
   assert(op.y>=body.y&&op.y+op.h<body.y+11.3,`header/menu separation: ${description}`);
   assert(Math.abs(op.x*cellW*dpr-Math.round(op.x*cellW*dpr))<1e-8,`pixel x: ${description}`);
   assert(Math.abs(op.y*cellH*dpr-Math.round(op.y*cellH*dpr))<1e-8,`pixel y: ${description}`);
   if(op.kind==='text')assert(Math.abs(op.scale*cellW*dpr-Math.round(op.scale*cellW*dpr))<1e-8,`character pitch: ${description}`);
   for(const ch of op.text||'')assert(!vfdGlyphMissing(ch.toUpperCase()),`ROM coverage: ${description}, ${ch}`);
  }
  for(let a=0;a<ops.length;a++)for(let b=a+1;b<ops.length;b++){
   const one=ops[a],two=ops[b];
   assert(!(one.x<two.x+two.w&&one.x+one.w>two.x&&one.y<two.y+two.h&&one.y+one.h>two.y),`core overlap: ${direction} ${one.text||one.kind}/${two.text||two.kind}`);
  }
  cases++;
 }
}
assert.equal(titleHeaderAction({id:'new-run'}),'START A NEW NIGHT.');
assert.equal(titleHeaderAction({id:'continue'}),'CONTINUE THE NIGHT.');
assert.equal(titleHeaderAction({id:'continue',disabled:true}),'NO SAVED NIGHT.');
console.log(`PASS ${cases} layouts: supported windows/UI scales, DPR 1–2, all three directions and every action available to six profile states; bounds, core separation, pixel origins/pitch and ROM coverage.`);
