import assert from 'node:assert/strict';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { SOURCE_SURFACE_LETTERING, sourceSurfaceLetteringRows, sourceSurfaceLetteringKey,
  paintSourceSurfaceLettering, sourceSurfaceInkRGBA, sourceSurfaceLetteringPixels, createSourceSurfaceLetteringBaker } from '../src/render/source-surface-lettering.js';
import {SOURCE_SYNTAX_PALETTE} from '../src/render/source-syntax.js';

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
    assert.equal(row.colour,SOURCE_SYNTAX_PALETTE.text);assert.deepEqual(row.tokens,original[row.row].tokens,'exact clauses retain their authored lexical context');
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
assert.match(sourceSurfaceLetteringKey(sparse),/^source-surface-pinned-v2-syntax:/,'syntax paint invalidates the previous uniform-row raster');

class Context {
  font='12px test';fontKerning='auto';textBaseline='middle';textAlign='center';fillStyle='#000';globalAlpha=.25;globalCompositeOperation='copy';shadowBlur=2;drawn=[];rectangles=[];stack=[];
  save(){this.stack.push({font:this.font,fontKerning:this.fontKerning,textBaseline:this.textBaseline,textAlign:this.textAlign,fillStyle:this.fillStyle,globalAlpha:this.globalAlpha,globalCompositeOperation:this.globalCompositeOperation,shadowBlur:this.shadowBlur});}
  restore(){Object.assign(this,this.stack.pop());}
  clearRect(){}fillRect(x,y,width,height){this.rectangles.push({x,y,width,height,colour:this.fillStyle,operation:this.globalCompositeOperation,alpha:this.globalAlpha});}
  measureText(text){const s=parseFloat(this.font);return{width:text.length*s*.6,actualBoundingBoxLeft:s*.04,actualBoundingBoxRight:text.length*s*.6+s*.02,actualBoundingBoxAscent:s*.8,actualBoundingBoxDescent:s*.2};}
  fillText(text,x,y,...extra){this.drawn.push({text,x,y,font:this.font,colour:this.fillStyle,operation:this.globalCompositeOperation,alpha:this.globalAlpha,extra});}
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
  assert.equal(c.drawn[i].colour,'#fff');assert.equal(c.drawn[i].operation,'source-over');assert.equal(c.drawn[i].alpha,1,'the only RGB glyph draw matches original mask coverage');
  assert.equal(row.syntax.map(token=>token.text).join(''),row.text,'syntax paint retains literal copy');
}
assert.equal(c.font,'12px test','painter restores caller state');
assert.equal(c.globalCompositeOperation,'copy');assert.equal(c.globalAlpha,.25);assert.equal(c.shadowBlur,2);
assert.ok(c.rectangles.every(rect=>rect.operation==='source-atop'&&rect.alpha===1),'opaque category strips preserve destination alpha');
assert.ok(new Set(c.rectangles.map(rect=>rect.colour)).size>=6,'Source clauses receive actual token colours across every band');
assert.equal(m.rectangles.length,0,'syntax never repaints the authored mask');

const controlled='const café = read(1);',controlledC=new Context(),controlledM=new Context(),controlledRows=paintSourceSurfaceLettering(controlledC,controlledM,[{text:controlled,sourceLayer:1}]),firstRow=controlledRows[0];
controlledC.font=firstRow.font;
const callPaint=controlledC.rectangles.find(rect=>rect.colour===SOURCE_SYNTAX_PALETTE.function);
assert.equal(callPaint.x,firstRow.drawX+controlledC.measureText('const café = ').width,'function colour uses the original measured prefix');
assert.equal(callPaint.width,controlledC.measureText('const café = read').width-controlledC.measureText('const café = ').width);
const continued='return /* earlier multiline context */',authored=[{text:continued,start:0,end:continued.length,kind:'comment'}],
  authoredRows=paintSourceSurfaceLettering(new Context(),new Context(),[{text:continued,sourceLayer:1,tokens:authored}]);
assert.equal(authoredRows[0].syntax[0].kind,'comment','verified authored context takes precedence over standalone fallback lexing');
assert.notEqual(sourceSurfaceLetteringKey([{text:continued,tokens:authored}]),sourceSurfaceLetteringKey([{text:continued,tokens:[{...authored[0],kind:'text'}]}]),'changed lexical context cannot reuse a stale coloured bake');

class CoverageContext extends Context{
  pixels=new Map();
  clearRect(){this.pixels.clear();}
  fillText(text,x,y,...extra){
    super.fillText(text,x,y,...extra);
    for(let index=0;index<text.length;index++)if(!/\s/.test(text[index])){
      const key=[Math.floor(x+this.measureText(text.slice(0,index)).width),Math.floor(y-2)].join(',');
      this.pixels.set(key,{alpha:[1,63,128,207,255][index%5],colour:this.fillStyle});
    }
  }
  fillRect(x,y,width,height){
    super.fillRect(x,y,width,height);assert.equal(this.globalCompositeOperation,'source-atop');
    for(const [key,pixel] of this.pixels){const [px,py]=key.split(',').map(Number);if(px>=x&&px<x+width&&py>=y&&py<y+height)this.pixels.set(key,{...pixel,colour:this.fillStyle});}
  }
}
const coveredC=new CoverageContext(),coveredM=new CoverageContext();paintSourceSurfaceLettering(coveredC,coveredM,[{text:controlled,sourceLayer:1}]);
assert.deepEqual(new Map([...coveredC.pixels].map(([key,pixel])=>[key,pixel.alpha])),new Map([...coveredM.pixels].map(([key,pixel])=>[key,pixel.alpha])),'every antialiased coverage byte survives token tinting');
assert.ok(new Set([...coveredC.pixels.values()].map(pixel=>pixel.colour)).size>=4);
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
const latestText='latest exact █ line',latestTokens=[{text:latestText,start:0,end:latestText.length,kind:'comment'}],latest=[{text:latestText,sourceLayer:4,tokens:latestTokens.map(token=>({...token}))}];
assert.equal(baker.request([{text:'earlier',sourceLayer:1}]),false);assert.equal(baker.request(latest),false);
latest[0].text='caller mutated after request';latest[0].tokens[0].kind='text';assert.equal(writes.length,0);
resolveFont();await baker.whenReady();
assert.equal(loads,1);assert.equal(writes.length,1);assert.equal(writes[0].lines[0].text,'latest exact █ line','only the newest immutable pending snapshot is painted');
assert.deepEqual(writes[0].lines[0].tokens,latestTokens,'pending token metadata is snapshotted alongside its literal copy');
assert.equal(baker.status().ready,true);assert.equal(baker.request([{text:'latest exact █ line',sourceLayer:4,tokens:latestTokens}]),true);
assert.equal(writes.length,1,'unchanged exact lettering reuses the finished bake');
assert.equal(baker.request([{text:'different exact line',sourceLayer:4}]),true);assert.equal(writes.length,2);
let release;const held=new Promise(resolve=>{release=resolve;}),late=[];
const retired=createSourceSurfaceLetteringBaker({fontsReady:()=>false,loadFonts:()=>held,rasterize:()=>{throw new Error('retired context must never rasterize');},onReady:bitmap=>late.push(bitmap)});
retired.request(lines);retired.dispose();release();await retired.whenReady();assert.equal(late.length,0);assert.equal(retired.status().ready,false);
const failures=[];const failed=createSourceSurfaceLetteringBaker({fontsReady:()=>false,loadFonts:async()=>{throw new Error('missing face');},onReady:()=>assert.fail('failed fonts cannot paint'),onError:error=>failures.push(error.message)});
failed.request(lines);await failed.whenReady();assert.deepEqual(failures,['missing face']);assert.equal(failed.status().ready,false);
console.log('Source material eight-band copy,uniform fit,ink-mask encoding and deferred first-bake contracts pass');
