import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {navigatorTelemetryState} from '../src/render/navigator-telemetry.js';
import {paintNavigatorTelemetry} from '../src/render/navigator-lcd.js';
import {recorderPanelRect,liveTakePanelRect} from '../src/render/recorder-view.js';
import {recorderFaceLayout} from '../src/render/recorder-instrument.js';
import {uiSetScale,uiCellMetrics} from '../src/render/ui.js';

// Independent production-artifact measurement: FreeType via Pillow, each
// bundled OTF loaded at1000px, getbbox(anchor='ls') plus advance. Hashes make
// stale outline fixtures fail explicitly. This is ink, not guessed em height.
const FONT_INK={"400":{"file":"NimbusSans-Regular.otf","sha256":"7c25be4d78155523080ab85b10277150657ff7dabbcad7037bdd536c9b6d0d08","emSize":1000,"glyphs":{"A":{"box":[0,-729,667,0],"advance":667.0},"B":{"box":[0,-729,667,0],"advance":667.0},"C":{"box":[0,-741,722,23],"advance":722.0},"D":{"box":[0,-729,722,0],"advance":722.0},"E":{"box":[0,-729,667,0],"advance":667.0},"F":{"box":[0,-729,611,0],"advance":611.0},"G":{"box":[0,-741,778,23],"advance":778.0},"H":{"box":[0,-729,722,0],"advance":722.0},"I":{"box":[0,-729,278,0],"advance":278.0},"J":{"box":[0,-729,500,23],"advance":500.0},"K":{"box":[0,-729,667,0],"advance":667.0},"L":{"box":[0,-729,556,0],"advance":556.0},"M":{"box":[0,-729,833,0],"advance":833.0},"N":{"box":[0,-729,722,0],"advance":722.0},"O":{"box":[0,-741,778,23],"advance":778.0},"P":{"box":[0,-729,667,0],"advance":667.0},"Q":{"box":[0,-741,778,59],"advance":778.0},"R":{"box":[0,-729,722,0],"advance":722.0},"S":{"box":[0,-741,667,23],"advance":667.0},"T":{"box":[0,-729,611,0],"advance":611.0},"U":{"box":[0,-729,722,23],"advance":722.0},"V":{"box":[0,-729,667,0],"advance":667.0},"W":{"box":[0,-729,944,0],"advance":944.0},"X":{"box":[0,-729,667,0],"advance":667.0},"Y":{"box":[0,-729,667,0],"advance":667.0},"Z":{"box":[0,-729,611,0],"advance":611.0},"a":{"box":[0,-539,556,23],"advance":556.0},"b":{"box":[0,-729,556,23],"advance":556.0},"c":{"box":[0,-539,500,23],"advance":500.0},"d":{"box":[0,-729,556,23],"advance":556.0},"e":{"box":[0,-539,556,23],"advance":556.0},"f":{"box":[0,-732,278,0],"advance":278.0},"g":{"box":[0,-539,556,218],"advance":556.0},"h":{"box":[0,-729,556,0],"advance":556.0},"i":{"box":[0,-729,222,0],"advance":222.0},"j":{"box":[-18,-729,222,218],"advance":222.0},"k":{"box":[0,-729,502,0],"advance":500.0},"l":{"box":[0,-729,222,0],"advance":222.0},"m":{"box":[0,-539,833,0],"advance":833.0},"n":{"box":[0,-539,556,0],"advance":556.0},"o":{"box":[0,-539,556,23],"advance":556.0},"p":{"box":[0,-539,556,218],"advance":556.0},"q":{"box":[0,-539,556,218],"advance":556.0},"r":{"box":[0,-539,333,0],"advance":333.0},"s":{"box":[0,-539,500,23],"advance":500.0},"t":{"box":[0,-668,278,23],"advance":278.0},"u":{"box":[0,-524,556,23],"advance":556.0},"v":{"box":[0,-524,500,0],"advance":500.0},"w":{"box":[0,-524,722,0],"advance":722.0},"x":{"box":[0,-524,500,0],"advance":500.0},"y":{"box":[0,-524,500,218],"advance":500.0},"z":{"box":[0,-524,500,0],"advance":500.0},"0":{"box":[0,-723,556,23],"advance":556.0},"1":{"box":[0,-723,556,0],"advance":556.0},"2":{"box":[0,-723,556,0],"advance":556.0},"3":{"box":[0,-723,556,23],"advance":556.0},"4":{"box":[0,-723,556,0],"advance":556.0},"5":{"box":[0,-709,556,23],"advance":556.0},"6":{"box":[0,-723,556,23],"advance":556.0},"7":{"box":[0,-709,556,0],"advance":556.0},"8":{"box":[0,-723,556,23],"advance":556.0},"9":{"box":[0,-723,556,23],"advance":556.0},"-":{"box":[0,-312,333,0],"advance":333.0},"/":{"box":[-8,-729,284,20],"advance":278.0}," ":{"box":[0,0,278,0],"advance":278.0}}},"600":{"file":"NimbusSans-Bold.otf","sha256":"7f33328e6b4d4cd21b45fa625791928c9407dc702db6780e56b09ca9a3ecaa67","emSize":1000,"glyphs":{"A":{"box":[0,-729,722,0],"advance":722.0},"B":{"box":[0,-729,722,0],"advance":722.0},"C":{"box":[0,-741,722,23],"advance":722.0},"D":{"box":[0,-729,722,0],"advance":722.0},"E":{"box":[0,-729,667,0],"advance":667.0},"F":{"box":[0,-729,611,0],"advance":611.0},"G":{"box":[0,-741,778,23],"advance":778.0},"H":{"box":[0,-729,722,0],"advance":722.0},"I":{"box":[0,-729,278,0],"advance":278.0},"J":{"box":[0,-729,556,23],"advance":556.0},"K":{"box":[0,-729,722,0],"advance":722.0},"L":{"box":[0,-729,611,0],"advance":611.0},"M":{"box":[0,-729,833,0],"advance":833.0},"N":{"box":[0,-729,722,0],"advance":722.0},"O":{"box":[0,-741,778,23],"advance":778.0},"P":{"box":[0,-729,667,0],"advance":667.0},"Q":{"box":[0,-741,778,54],"advance":778.0},"R":{"box":[0,-729,722,0],"advance":722.0},"S":{"box":[0,-741,667,23],"advance":667.0},"T":{"box":[0,-729,611,0],"advance":611.0},"U":{"box":[0,-729,722,23],"advance":722.0},"V":{"box":[0,-729,667,0],"advance":667.0},"W":{"box":[0,-729,944,0],"advance":944.0},"X":{"box":[0,-729,667,0],"advance":667.0},"Y":{"box":[0,-729,667,0],"advance":667.0},"Z":{"box":[0,-729,611,0],"advance":611.0},"a":{"box":[0,-549,556,23],"advance":556.0},"b":{"box":[0,-729,611,23],"advance":611.0},"c":{"box":[0,-549,556,23],"advance":556.0},"d":{"box":[0,-729,611,23],"advance":611.0},"e":{"box":[0,-549,556,23],"advance":556.0},"f":{"box":[0,-729,333,0],"advance":333.0},"g":{"box":[0,-549,611,218],"advance":611.0},"h":{"box":[0,-729,611,0],"advance":611.0},"i":{"box":[0,-729,278,0],"advance":278.0},"j":{"box":[0,-729,278,218],"advance":278.0},"k":{"box":[0,-729,556,0],"advance":556.0},"l":{"box":[0,-729,278,0],"advance":278.0},"m":{"box":[0,-549,889,0],"advance":889.0},"n":{"box":[0,-549,611,0],"advance":611.0},"o":{"box":[0,-549,611,23],"advance":611.0},"p":{"box":[0,-549,611,218],"advance":611.0},"q":{"box":[0,-549,611,218],"advance":611.0},"r":{"box":[0,-549,389,0],"advance":389.0},"s":{"box":[0,-549,556,23],"advance":556.0},"t":{"box":[0,-674,333,23],"advance":333.0},"u":{"box":[0,-540,611,23],"advance":611.0},"v":{"box":[0,-540,556,0],"advance":556.0},"w":{"box":[0,-540,778,0],"advance":778.0},"x":{"box":[0,-540,556,0],"advance":556.0},"y":{"box":[0,-540,556,219],"advance":556.0},"z":{"box":[0,-540,500,0],"advance":500.0},"0":{"box":[0,-724,556,23],"advance":556.0},"1":{"box":[0,-709,556,0],"advance":556.0},"2":{"box":[0,-724,556,0],"advance":556.0},"3":{"box":[0,-724,556,23],"advance":556.0},"4":{"box":[0,-709,556,0],"advance":556.0},"5":{"box":[0,-709,556,23],"advance":556.0},"6":{"box":[0,-724,556,23],"advance":556.0},"7":{"box":[0,-709,556,0],"advance":556.0},"8":{"box":[0,-724,556,23],"advance":556.0},"9":{"box":[0,-724,556,24],"advance":556.0},"-":{"box":[0,-342,333,0],"advance":333.0},"/":{"box":[0,-714,278,14],"advance":278.0}," ":{"box":[0,0,278,0],"advance":278.0}}}};
function textInk(value,font){
 const [,weight,sizeString]=/^(400|600) ([\d.]+)px/.exec(font),size=Number(sizeString),source=FONT_INK[weight];
 let x=0,left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
 for(const char of String(value)){
  const g=source.glyphs[char];assert.ok(g,`No measured outline for ${char}`);
  if(g.box[3]!==g.box[1]){left=Math.min(left,x+g.box[0]);right=Math.max(right,x+g.box[2]);top=Math.min(top,g.box[1]);bottom=Math.max(bottom,g.box[3]);}
  x+=g.advance;
 }
 return{width:x*size/1000,left:(Number.isFinite(left)?left:0)*size/1000,right:(Number.isFinite(right)?right:0)*size/1000,
  ascent:(Number.isFinite(top)?-top:0)*size/1000,descent:(Number.isFinite(bottom)?bottom:0)*size/1000,size};
}
function inkContext(){
 const draws=[],stack=[];
 const state={globalAlpha:1,shadowBlur:0,shadowOffsetX:0,shadowOffsetY:0,font:'400 12px "Hardware Sans"',textAlign:'left',textBaseline:'alphabetic',clipping:null};
 let pending=null;
 const fonts={check:()=>true,load:()=>Promise.resolve([])};
 const ctx={canvas:{ownerDocument:{fonts}},
  save(){stack.push({...state,clipping:state.clipping?{...state.clipping}:null});},
  restore(){const prior=stack.pop();assert.ok(prior);Object.assign(state,prior);},
  createLinearGradient(){return{addColorStop(){}};},
  beginPath(){pending=null;},rect(x,y,w,h){pending={x,y,w,h};},
  clip(){if(!pending)return;const c=state.clipping;if(!c){state.clipping={...pending};return;}const x=Math.max(c.x,pending.x),y=Math.max(c.y,pending.y);state.clipping={x,y,w:Math.min(c.x+c.w,pending.x+pending.w)-x,h:Math.min(c.y+c.h,pending.y+pending.h)-y};},
  fillRect(){},
  measureText(value){const m=textInk(value,state.font);return{width:m.width,actualBoundingBoxAscent:m.ascent,actualBoundingBoxDescent:m.descent};},
  fillText(value,x,y,maxWidth){
   const m=textInk(value,state.font),shrink=Math.min(1,maxWidth/m.width);
   const advance=m.width*shrink,origin=x-(state.textAlign==='right'?advance:state.textAlign==='center'?advance/2:0);
   // Nimbus's hhea ascent/descent are729/271 per1000em. This conversion is
   // used only to expose the previous middle-em placement regression.
   const baseline=state.textBaseline==='middle'?y+m.size*(.729-.5):y;
   draws.push({text:String(value),font:state.font,baseline,textBaseline:state.textBaseline,
    ink:{x:origin+m.left*shrink,y:baseline-m.ascent,w:(m.right-m.left)*shrink,h:m.ascent+m.descent},
    clip:state.clipping?{...state.clipping}:null,naturalWidth:m.width,maxWidth,shrink});
  },
 };
 for(const key of Object.keys(state))Object.defineProperty(ctx,key,{get:()=>state[key],set:value=>{state[key]=value;}});
 return{ctx,draws,stack};
}
const contained=(ink,box,epsilon=.01)=>ink.x>=box.x-epsilon&&ink.y>=box.y-epsilon
 &&ink.x+ink.w<=box.x+box.w+epsilon&&ink.y+ink.h<=box.y+box.h+epsilon;
const telemetry=[
 {takes:0,total:12,monitor:{db:-96,segments:0}},
 {takes:1,total:12,injuries:1,monitor:{db:-48,segments:1}},
 {takes:8,total:12,injuries:12,monitor:{db:-30,segments:4,band:'mid-hot'}},
 {takes:12,total:12,injuries:99,monitor:{db:-18,segments:6,band:'hot'}},
 {takes:5,total:12,monitor:{db:0,segments:12,clipped:true}},
 {takes:2,total:12,monitor:null},
];

test('LCD ink fixtures come from the unchanged production regular and bold outlines',()=>{
 for(const {file,sha256}of Object.values(FONT_INK)){
  const bytes=readFileSync(new URL('../public/assets/fonts/'+file,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),sha256);
 }
});

test('full-size LCD digits and legends retain all measured glyph ink within their real clips',()=>{
 for(const scale of[.8,1,1.5])for(const dpr of[1,2])for(const height of[3.15,4.15]){
  const lcd={x:2,y:15,w:22.9,h:height};
  for(const data of telemetry){
   const h=inkContext();
   paintNavigatorTelemetry(h.ctx,lcd,navigatorTelemetryState(data),{cellW:8.45*scale,cellH:20*scale,dpr});
   assert.equal(h.stack.length,0);
   assert.ok(h.draws.length>=7);
   for(const draw of h.draws){
    assert.ok(contained(draw.ink,draw.clip),`${draw.text} ink crosses its clip atscale${scale},dpr${dpr},h${height}: ${JSON.stringify(draw)}`);
    assert.equal(draw.textBaseline,'alphabetic');
    assert.ok(draw.shrink>.999,`${draw.text} must not be squeezed to hide a layout error`);
   }
   const digits=h.draws.find(d=>d.text===String(data.takes).padStart(2,'0'));
   const size=Number(/ ([\d.]+)px/.exec(digits.font)[1]);
   assert.ok(Math.abs(size-(height<3.7?1.37:1.65)*20*scale*dpr)<1e-8,'large approved numbers keep their font size');
  }
 }
});

test('changing a count, missing input, danger or injury cannot move the digit baselines or LCD housing',()=>{
 for(const height of[3.15,4.15]){
  const lcd={x:2,y:15,w:26.9,h:height},layouts=[],takeBaselines=[],monitorBaselines=[];
  for(const data of telemetry){
   const h=inkContext();layouts.push(paintNavigatorTelemetry(h.ctx,lcd,navigatorTelemetryState(data),{cellW:8.45,cellH:20,dpr:2}));
   takeBaselines.push(h.draws.find(d=>d.text===String(data.takes).padStart(2,'0')).baseline);
   monitorBaselines.push(h.draws.find(d=>d.text===(data.monitor?String(Math.round(navigatorTelemetryState(data).monitor.db)):'--')).baseline);
  }
  assert.equal(new Set(takeBaselines).size,1);
  assert.equal(new Set(monitorBaselines).size,1);
  for(const l of layouts)assert.deepEqual(l,layouts[0]);
 }
});

test('take progress, changing speech and hold/slate labels cannot resize one recorder at a fixed viewport',()=>{
 for(const scale of[.8,1,1.5]){
  uiSetScale(scale);const{cellW,cellH}=uiCellMetrics();
  for(const [width,height]of [[960,600],[1440,900],[2560,1600]]){
   const viewport={cols:width/cellW,rows:height/cellH};
   const full=[],live=[];
   for(const progress of[0,.1,.4,.7,1])for(const clearBottom of[0,5,10,14])for(const expanded of[false,true]){
    full.push(recorderPanelRect({...viewport,progress,clearBottom}));
    live.push(liveTakePanelRect({...viewport,progress,clearBottom,expanded}));
   }
   for(const set of[full,live])for(const rect of set){
    assert.equal(rect.w,set[0].w);assert.equal(rect.h,set[0].h);
    const face=recorderFaceLayout(rect),base=recorderFaceLayout(set[0]);
    assert.equal(face.unit,base.unit);assert.equal(face.displayRect.h,base.displayRect.h);
    assert.equal(face.buttonSlots[0].h,base.buttonSlots[0].h);
    assert.ok(rect.y>=0&&rect.y+rect.h<=viewport.rows,'viewport fit remains bounded');
   }
  }
 }
 uiSetScale(1);
});
