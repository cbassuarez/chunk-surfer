import test from 'node:test';
import assert from 'node:assert/strict';
import SOURCE_ATLAS from '../content/chunk-surf/source-atlas.json' with { type:'json' };
import {sourcePrintRows,sourcePrintLayout,sourcePrintUV,SOURCE_PRINT_SURFACE,physicalPrintPixels,paintSourcePrint} from '../src/render/physical-source-print.js';
import {sourceSyntaxSpans,SOURCE_SYNTAX_PALETTE} from '../src/render/source-syntax.js';
import {ensureWorldLetteringFonts} from '../src/render/world-lettering-fonts.js';
import {towerPersonalGeometry,TOWER_RECORDER_PRINT} from '../src/render/tower-personal-meshes.js';
import {printedSurfaceDescriptor} from '../src/render/printed-surface.js';

test('incidental Source material keeps exact existing corpus fragments and row placement',()=>{
  const exact=Object.values(SOURCE_ATLAS.sectors).flatMap(s=>s.sourceLines||[]).map(l=>l.text).filter(t=>t.trim().length>12);
  const divide=sourcePrintRows('divide'),reception=sourcePrintRows('reception');
  assert.equal(divide.length,26);assert.equal(reception.length,33);
  for(const rows of [divide,reception])for(const row of rows)assert.ok(exact.includes(row.text),'material invented or rewrote a source fragment');
  assert.deepEqual(divide.map(r=>r.text),exact.slice(0,26));
  assert.deepEqual(reception.map(r=>r.text),exact.slice(0,33));
  assert.equal(divide[1].x,17);assert.equal(divide[1].y,23);assert.equal(divide[1].text,exact[1]);
  assert.ok(reception.every(r=>r.y+r.height<=510&&r.rule<512),'reception rows leave the actual texture');
  assert.throws(()=>sourcePrintRows('new-copy'),/Unknown Source print profile/);
  assert.deepEqual(printedSurfaceDescriptor(SOURCE_PRINT_SURFACE),SOURCE_PRINT_SURFACE);
});

test('Source material lays out whole exact lines uniformly inside every tile row',()=>{
  const ctx={font:'',measureText(value){const px=Number.parseFloat(this.font);return{width:value.length*px*.6,
    actualBoundingBoxLeft:0,actualBoundingBoxRight:value.length*px*.6,actualBoundingBoxAscent:px*.7,actualBoundingBoxDescent:px*.2};}};
  for(const profile of ['divide','reception'])for(const row of sourcePrintLayout(ctx,profile)){
    assert.equal(row.fit.text,row.text);assert.ok(row.fit.fits);
    assert.ok(row.drawX+row.fit.width<=508.0001);assert.ok(row.baseline+row.fit.descent<=510.0001);
  }
});

test('every vertical source face has forward reader-right and upright UVs',()=>{
  for(const [normal,right] of [[[0,0,1],[1,0,0]],[[0,0,-1],[-1,0,0]],[[1,0,0],[0,0,-1]],[[-1,0,0],[0,0,1]]]){
    const uv=sourcePrintUV([2,3,4],normal,2);
    const next=sourcePrintUV([2+right[0],3,4+right[2]],normal,2);
    const up=sourcePrintUV([2,4,4],normal,2);
    assert.equal(next[0]-uv[0],.5,'world print is reflected from the visible side');
    assert.equal(up[1]-uv[1],-.5,'raw-upload source print is upside down');
  }
});

test('the tower recorder legend is one physical opaque face with a reader-correct map',()=>{
  assert.equal(TOWER_RECORDER_PRINT.copy,'DA1000');
  assert.deepEqual(printedSurfaceDescriptor(TOWER_RECORDER_PRINT.printedSurface),TOWER_RECORDER_PRINT.printedSurface);
  const body=towerPersonalGeometry().find(p=>p.name==='tower_personal_recorder');
  const face=body.groups.find(g=>g.material==='recorder-print');
  assert.equal(face.indices.length,6,'legend regressed into rods or detached glyph meshes');
  assert.ok(face.normals.every((n,i)=>Math.abs(n-(i%3===2?-1:0))<1e-9));
  const left=[];for(let i=0;i<face.positions.length/3;i++)left.push({x:face.positions[i*3],u:face.uvs[i*2],y:face.positions[i*3+1],v:face.uvs[i*2+1]});
  assert.ok(left.filter(v=>v.u===0).every(v=>v.x>-.026),'first glyph is on the reader left');
  assert.ok(left.filter(v=>v.v===0).every(v=>Math.abs(v.y-.126)<1e-9),'top of print maps to top of fascia');
});

test('physical print refuses to cache fallback text before pinned font readiness',()=>{
  assert.throws(()=>physicalPrintPixels({width:1,height:1,ground:'#fff',draw(){}}),/fonts must load/);
});

function printContext(){
  const calls=[],stack=[];
  return{calls,font:'',fontKerning:'normal',textBaseline:'',textAlign:'',fillStyle:'',globalAlpha:1,
    save(){stack.push({fillStyle:this.fillStyle,globalAlpha:this.globalAlpha});},restore(){Object.assign(this,stack.pop());},
    measureText(text){const size=Number.parseFloat(this.font),width=text.length*size*.6+(text.includes('??')?.13:0);
      return{width,actualBoundingBoxLeft:0,actualBoundingBoxRight:width,actualBoundingBoxAscent:size*.7,actualBoundingBoxDescent:size*.2};},
    fillText(text,x,y){calls.push({type:'text',text,x,y,font:this.font,kerning:this.fontKerning,baseline:this.textBaseline,align:this.textAlign,color:this.fillStyle,alpha:this.globalAlpha});},
    fillRect(...args){calls.push({type:'rect',args,color:this.fillStyle,alpha:this.globalAlpha});}};
}

test('silver fracture retains the blueprint row geometry and exact authored token slices',()=>{
  const blueprint=sourcePrintRows('blueprint'),silver=sourcePrintRows('silver-fracture'),
    authored=Object.values(SOURCE_ATLAS.sectors).flatMap(sector=>sector.sourceLines||[]).filter(line=>line.text.trim().length>12);
  assert.deepEqual(silver,blueprint);
  for(const [index,row] of silver.entries())assert.deepEqual(row.tokens,authored[index].tokens);
  for(const profile of ['divide','reception','blueprint'])assert.ok(sourcePrintRows(profile).every(row=>Array.isArray(row.tokens)),'all Source code profiles retain actual token metadata');
  const layout=sourcePrintLayout(printContext(),'silver-fracture');
  assert.deepEqual(layout,sourcePrintLayout(printContext(),'blueprint'));
});

test('colored glyphs use exact measured prefixes while the original full-line mask and registration stay identical',()=>{
  const blueColor=printContext(),blueMask=printContext(),color=printContext(),mask=printContext();
  paintSourcePrint(blueColor,blueMask,'blueprint');paintSourcePrint(color,mask,'silver-fracture');
  assert.deepEqual(mask.calls,blueMask.calls,'all mask draw operations, fonts, positions, alpha and registration are unchanged');
  const rows=sourcePrintLayout(printContext(),'silver-fracture'),maskText=mask.calls.filter(call=>call.type==='text'),paint=color.calls.filter(call=>call.type==='text');
  assert.equal(maskText.length,rows.length);assert.deepEqual(maskText.map(call=>call.text),rows.map(row=>row.text));
  const expected=[];
  for(const row of rows){
    const metric=printContext();metric.font=row.fit.font;
    for(const token of sourceSyntaxSpans(row.text,row.tokens))if(token.kind!=='whitespace')expected.push({text:token.text,x:row.drawX+metric.measureText(row.text.slice(0,token.start)).width,y:row.baseline,color:token.color,font:row.fit.font});
  }
  assert.deepEqual(paint.map(({text,x,y,color,font})=>({text,x,y,color,font})),expected);
  assert.ok(paint.every(call=>call.kerning==='none'));assert.ok(new Set(paint.map(call=>call.color)).size>=5);
  assert.ok(paint.some(call=>call.color===SOURCE_SYNTAX_PALETTE.function));
  assert.deepEqual(color.calls.filter(call=>call.type==='rect'),blueColor.calls.filter(call=>call.type==='rect'),'registration keeps the same physical positions and fractional coverage');
  for(const profile of ['divide','reception','blueprint']){
    const c=printContext(),m=printContext();paintSourcePrint(c,m,profile);
    assert.equal(m.calls.filter(call=>call.type==='text').length,sourcePrintRows(profile).length,'each original clause still owns one unchanged mask draw');
    assert.ok(new Set(c.calls.filter(call=>call.type==='text').map(call=>call.color)).size>=5,'most Source profiles retain lexical syntax colors');
  }
});

function bitmapDocument(colour,coverage){
  const contexts=[];
  const owner={fonts:{add(){}},createElement(){
    const calls=[],index=contexts.length,ctx={calls,fillStyle:'',fillRect(...args){calls.push(['fill',...args]);},clearRect(...args){calls.push(['clear',...args]);},
      getImageData(_x,_y,width,height){calls.push(['read',width,height]);return{data:new Uint8ClampedArray(index%2===0&&width===1&&height===1?[0,0,170,255]:index%2===0?colour:coverage)};}};
    contexts.push(ctx);return{width:0,height:0,getContext:()=>ctx};}};
  return{owner,contexts};
}

test('pigment-only pixels retain literal antialiased RGB, exact mask bytes and the same material relief',async()=>{
  const colour=[220,165,255,64, 0,0,0,0, 128,234,255,255, 255,238,138,128],
    coverage=[0,0,0,96, 0,0,0,0, 0,0,0,247, 0,0,0,32],
    fixture=bitmapDocument(colour,coverage),previous=globalThis.document;
  globalThis.document=fixture.owner;
  try{
    class Font{async load(){return this;}}
    await ensureWorldLetteringFonts({ownerDocument:fixture.owner,FontFaceClass:Font,assetUrl:path=>path});
    const bake=(pigmentOnly,finish=null)=>physicalPrintPixels({width:2,height:2,ground:'#0000aa',pigmentOnly,finish,draw(){}});
    const raw=bake(true);
    assert.deepEqual([...raw.pixels],[220,165,255,96, 0,0,170,0, 128,234,255,247, 255,238,138,32]);
    assert.deepEqual(fixture.contexts[0].calls.slice(0,3),[['fill',0,0,1,1],['read',1,1],['clear',0,0,2,2]],'pigment RGB is painted over clear backing');
    const finish={profile:'paper',widthM:8,heightM:8,seed:'source-blueprint',repeat:true},normal=bake(false,finish),syntax=bake(true,finish);
    for(let pixel=0;pixel<4;pixel++){
      assert.equal(syntax.pixels[pixel*4+3],coverage[pixel*4+3]);assert.equal(normal.pixels[pixel*4+3],coverage[pixel*4+3]);
      if(coverage[pixel*4+3])assert.deepEqual([...syntax.pixels.slice(pixel*4,pixel*4+3)],colour.slice(pixel*4,pixel*4+3),'material finish cannot tint an antialiased syntax category');
    }
    assert.deepEqual(syntax.normalPixels,normal.normalPixels);assert.deepEqual(syntax.ormPixels,normal.ormPixels);
    assert.deepEqual(fixture.contexts[2].calls[0],['fill',0,0,2,2],'default RGB path still starts with its full opaque stock');
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
