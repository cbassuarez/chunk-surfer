import assert from 'node:assert/strict';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { SOURCE_SURFACE_LETTERING, sourceSurfaceLetteringRows, sourceSurfaceLetteringKey,
  paintSourceSurfaceLettering, sourceSurfaceInkRGBA, sourceSurfaceLetteringPixels, createSourceSurfaceLetteringBaker } from '../src/render/source-surface-lettering.js';

const preset=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_CONTACT,{seed:4417});
const runtime=createSourceSpaceRuntime({initialState:preset.state}),lines=runtime.sourceSurfaceLines();
const rows=sourceSurfaceLetteringRows(lines),spec=SOURCE_SURFACE_LETTERING;
assert.equal(lines.length,96);assert.equal(rows.length,8*11);
for(let layer=1;layer<=8;layer++){
  const original=lines.filter(line=>line.sourceLayer===layer),selected=rows.filter(row=>row.layer===layer);
  assert.equal(original.length,12);assert.equal(selected.length,11);
  assert.deepEqual(selected.map(row=>row.text),original.slice(0,11).map(line=>line.text),'each selected inscription retains its complete copy and semantic band order');
  for(const row of selected){
    assert.equal(row.x,4);assert.equal(row.y,(layer-1)*256+row.row*22+4);
    assert.equal(row.colour,spec.palette[(layer+row.row)%4]);
  }
}
// The existing material has an explicit 11-row budget. No claim is made that
// the twelfth input row in each band was painted by the original renderer.
assert.equal(rows.length,88);
const sparse=[{sourceLayer:1,text:'  raw █ omission; '},{sourceLayer:1,text:'second'}];
const sparseRows=sourceSurfaceLetteringRows(sparse);
assert.equal(sparseRows[0].text,'  raw █ omission; ');assert.equal(sparseRows[2].text,'  raw █ omission; ');
assert.equal(sparseRows[11].text,'  raw █ omission; ','absent bands retain the prior all-line cycling fallback');
assert.notEqual(sourceSurfaceLetteringKey(sparse),sourceSurfaceLetteringKey([{sourceLayer:1,text:'  raw OMITTED omission; '},sparse[1]]));

class Context {
  font='12px test';textBaseline='middle';textAlign='center';fillStyle='#000';drawn=[];stack=[];
  save(){this.stack.push({font:this.font,textBaseline:this.textBaseline,textAlign:this.textAlign,fillStyle:this.fillStyle});}
  restore(){Object.assign(this,this.stack.pop());}
  clearRect(){}fillRect(){}
  measureText(text){const s=parseFloat(this.font);return{width:text.length*s*.6,actualBoundingBoxLeft:s*.04,actualBoundingBoxRight:text.length*s*.6+s*.02,actualBoundingBoxAscent:s*.8,actualBoundingBoxDescent:s*.2};}
  fillText(text,x,y,...extra){this.drawn.push({text,x,y,font:this.font,colour:this.fillStyle,extra});}
}
const c=new Context(),m=new Context(),report=paintSourceSurfaceLettering(c,m,lines);
assert.equal(report.length,88);assert.equal(c.drawn.length,88);assert.equal(m.drawn.length,88);
for(let i=0;i<report.length;i++){
  const row=report[i];assert.equal(row.fits,true);assert.equal(row.text,rows[i].text);
  assert.ok(row.fontSize<=20&&row.fontSize>0);assert.ok(row.width<=2040&&row.ascent+row.descent<=20);
  assert.ok(row.top>=row.y&&row.bottom<=row.y+22);
  assert.ok(row.bottom<(row.layer)*256,'each last row stays within its assigned band');
  assert.ok(c.drawn[i].font.includes('World Lettering Mono'));
  assert.equal(c.drawn[i].text,m.drawn[i].text);assert.equal(c.drawn[i].x,m.drawn[i].x);assert.equal(c.drawn[i].y,m.drawn[i].y);
  assert.equal(m.drawn[i].colour,'#fff');assert.equal(c.drawn[i].extra.length,0,'no maxWidth horizontal compression');
}
assert.equal(c.font,'12px test','painter restores caller state');
const colour=new Uint8Array([0,0,0,255,8,239,67,255,3,120,34,255,6,191,255,255]);
const mask=new Uint8Array([0,0,0,0,255,255,255,255,255,255,255,127,255,255,255,1]);
const merged=sourceSurfaceInkRGBA(colour,mask,{width:2});
for(let i=0;i<colour.length;i++){assert.equal(merged[i],i%4===3?mask[i]:colour[i]);}
assert.equal(colour[3],255,'source colour raster is not mutated');
assert.deepEqual([...sourceSurfaceInkRGBA(colour,mask,{width:2,flipY:true})],[...merged.slice(8),...merged.slice(0,8)]);
assert.throws(()=>sourceSurfaceInkRGBA(colour,new Uint8Array(4)),RangeError);
assert.throws(()=>sourceSurfaceLetteringPixels(lines,{ownerDocument:{fonts:{}}}),/fonts must load/,'no permanent fallback bake before font readiness');

let ready=false,resolveFont,loads=0;const font=new Promise(resolve=>{resolveFont=resolve;}),writes=[];
const baker=createSourceSurfaceLetteringBaker({fontsReady:()=>ready,loadFonts:async()=>{loads++;await font;ready=true;},
  rasterize:input=>({lines:input,key:sourceSurfaceLetteringKey(input)}),onReady:bitmap=>writes.push(bitmap)});
const latest=[{text:'latest exact █ line',sourceLayer:4}];
assert.equal(baker.request([{text:'earlier',sourceLayer:1}]),false);assert.equal(baker.request(latest),false);
latest[0].text='caller mutated after request';assert.equal(writes.length,0);
resolveFont();await baker.whenReady();
assert.equal(loads,1);assert.equal(writes.length,1);assert.equal(writes[0].lines[0].text,'latest exact █ line','only the newest immutable pending snapshot is painted');
assert.equal(baker.status().ready,true);assert.equal(baker.request([{text:'latest exact █ line',sourceLayer:4}]),true);
assert.equal(writes.length,1,'unchanged exact lettering reuses the finished bake');
assert.equal(baker.request([{text:'different exact line',sourceLayer:4}]),true);assert.equal(writes.length,2);
let release;const held=new Promise(resolve=>{release=resolve;}),late=[];
const retired=createSourceSurfaceLetteringBaker({fontsReady:()=>false,loadFonts:()=>held,rasterize:()=>{throw new Error('retired context must never rasterize');},onReady:bitmap=>late.push(bitmap)});
retired.request(lines);retired.dispose();release();await retired.whenReady();assert.equal(late.length,0);assert.equal(retired.status().ready,false);
const failures=[];const failed=createSourceSurfaceLetteringBaker({fontsReady:()=>false,loadFonts:async()=>{throw new Error('missing face');},onReady:()=>assert.fail('failed fonts cannot paint'),onError:error=>failures.push(error.message)});
failed.request(lines);await failed.whenReady();assert.deepEqual(failures,['missing face']);assert.equal(failed.status().ready,false);
console.log('Source material eight-band copy,uniform fit,ink-mask encoding and deferred first-bake contracts pass');
