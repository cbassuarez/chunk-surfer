import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {drawElectronicText,measureElectronicText,clearElectronicTextCache,electronicTextCacheStats} from '../src/render/electronic-text.js';
import {vfdGlyph} from '../src/render/vfd-font.js';
import {transcriptRole} from '../src/render/transcript.js';

function context(){
 const commands=[],stack=[],state={globalAlpha:1,shadowBlur:0,fillStyle:''};
 const methods={save(){stack.push({...state});},restore(){Object.assign(state,stack.pop());},
  fillText(){throw Error('Native font leaked into electronic display');},measureText(){throw Error('Native font metrics leaked into electronic display');},
  fillRect(...args){commands.push({kind:'pixel',args,alpha:state.globalAlpha,color:state.fillStyle});},
  arc(...args){commands.push({kind:'dot',args,alpha:state.globalAlpha,color:state.fillStyle});},
  fill(){commands.push({kind:'fill',alpha:state.globalAlpha,color:state.fillStyle});},
  drawImage(...args){commands.push({kind:'tile',args,alpha:state.globalAlpha});},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
 const ctx=new Proxy(state,{get:(target,key)=>key in methods?methods[key]:target[key],set:(target,key,value)=>(target[key]=value,true)});
 return{ctx,commands,state,stack};
}
test('LCD labels are a fixed 5x7 rectangular matrix; no native font or emission',()=>{
 clearElectronicTextCache();const h=context();
 const size=drawElectronicText(h.ctx,'A',10,20,{fontSize:14,mode:'lcd',color:'#bcd2b4',baseline:'top'});
 assert.equal(size.width,measureElectronicText('A',{fontSize:14}));assert.equal(size.height,14);
 assert.equal(h.commands.length,35);assert.ok(h.commands.every(c=>c.kind==='pixel'));
 const lit=vfdGlyph('A').reduce((n,row)=>n+row.toString(2).replaceAll('0','').length,0);
 assert.equal(h.commands.filter(c=>c.alpha===1).length,lit);
 assert.ok(h.commands.every(c=>c.args[2]>0&&c.args[3]>0));assert.equal(h.state.shadowBlur,0);assert.equal(h.stack.length,0);
});
test('VFD prose uses formed phosphor dots and preserves inherited alpha',()=>{
 const h=context();h.state.globalAlpha=.5;
 drawElectronicText(h.ctx,'REC',NaN,0);assert.equal(h.commands.length,0,'invalid coordinates cannot select a font fallback');
 drawElectronicText(h.ctx,'REC',10,20,{fontSize:14,mode:'vfd',alpha:.5,color:'#aceed4'});
 assert.ok(h.commands.some(c=>c.kind==='dot'));assert.ok(h.commands.filter(c=>c.kind==='fill').every(c=>c.alpha===.25));
 assert.equal(h.state.globalAlpha,.5);assert.equal(h.stack.length,0);
});
test('measurement, alignment, explicit cell pitch and maxWidth share one electronic grid',()=>{
 const h=context(),options={fontSize:14,cellWidth:10,tracking:2,mode:'lcd',baseline:'top'};
 assert.equal(measureElectronicText('AB',options),22);assert.equal(measureElectronicText('',options),0);
 const normal=drawElectronicText(h.ctx,'AB',40,20,{...options,align:'right'});
 assert.equal(normal.width,22);assert.ok(h.commands[0].args[0]>=18&&h.commands[0].args[0]<20);
 h.commands.length=0;const fit=drawElectronicText(h.ctx,'AB',40,20,{...options,maxWidth:11,align:'center'});
 assert.equal(fit.width,11);assert.equal(fit.height,7);assert.ok(h.commands[0].args[0]>=34.5&&h.commands[0].args[0]<36);
});
test('unsupported electronic glyphs remain visible and spaces remain empty',()=>{
 const h=context();drawElectronicText(h.ctx,' ',0,0);assert.equal(h.commands.length,0);
 drawElectronicText(h.ctx,'🛸',0,0);assert.equal(h.commands.length,35);
 assert.equal(measureElectronicText('🛸'),measureElectronicText('A'),'measurement counts character codes, not surrogate halves');
});
test('electronic glyph cache is bounded and can be discarded',()=>{
 const owner={createElement(){const h=context();return{width:0,height:0,getContext:()=>h.ctx};}},h=context();h.ctx.canvas={ownerDocument:owner};
 clearElectronicTextCache();for(let size=5;size<850;size++)drawElectronicText(h.ctx,'A',0,0,{fontSize:size,mode:'lcd'});
 const stats=electronicTextCacheStats();assert.ok(stats.entries<=stats.maxEntries);assert.ok(stats.pixels<=stats.maxPixels);
 assert.ok(h.commands.some(c=>c.kind==='tile'));clearElectronicTextCache();assert.equal(electronicTextCacheStats().entries,0);
});
test('shared UI display paths cannot fall back to native type; paper remains physical ink',()=>{
 const ui=readFileSync(new URL('../src/render/ui.js',import.meta.url),'utf8');
 const aside=ui.slice(ui.indexOf('export function uiItalicText'),ui.indexOf('export function uiInk'));
 assert.match(aside,/drawElectronicText/);assert.match(aside,/mode:'vfd'/);assert.doesNotMatch(aside,/\.fillText\(|ctx\.font/);
 assert.match(aside,/uiBrightness\(\)/);assert.match(aside,/uiRoleDim\(cls/);assert.match(aside,/uiFlickerAlpha\(cx,cy,cls\)/);
 const paper=ui.slice(ui.indexOf('export function uiInk'),ui.indexOf('export function uiFill'));
 assert.match(paper,/fillText/);assert.doesNotMatch(paper,/drawElectronicText/);
 const helper=readFileSync(new URL('../src/render/electronic-text.js',import.meta.url),'utf8');
 assert.doesNotMatch(helper,/\.fillText\(|\.measureText\(|\.font\s*=/);
 const atlas=readFileSync(new URL('../src/render/atlas.js',import.meta.url),'utf8');
 assert.match(atlas.slice(atlas.indexOf('function renderUiTile'),atlas.indexOf('function renderTile')),/drawVfdGlyph/);
});
test('active narration stays lit and distinct without relying on native italics',()=>{
 for(const who of ['direction','narration','']){
  const role=transcriptRole(who);
  assert.equal(role.side,'center');assert.equal(role.speaker,'');
  assert.equal(role.bodyCls,'ui-counter');assert.equal(role.cursorCls,'ui-counter');
  assert.ok(role.activeAlpha>=.9,'small emitting dots must not start near the history floor');
 }
});
