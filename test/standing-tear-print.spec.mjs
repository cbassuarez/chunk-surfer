import test from 'node:test';
import assert from 'node:assert/strict';
import SOURCE_ATLAS from '../content/chunk-surf/source-atlas.json' with {type:'json'};
import {SOURCE_SURFACE_LETTERING} from '../src/render/source-surface-lettering.js';
import {STANDING_TEAR_SOURCE_PRINT,STANDING_TEAR_PRINT_SCALE,STANDING_TEAR_STOCK_RGB,STANDING_TEAR_SOURCE_CODE_STOCK,standingTearSourceLines,standingTearSourceRows,standingTearSourceBand,standingTearSourceStock,standingTearSourceMaps,standingTearSourceUV} from '../src/render/standing-tear-print.js';
import {sourceSyntaxSpans,SOURCE_SYNTAX_PALETTE} from '../src/render/source-syntax.js';
import {ensureWorldLetteringFonts} from '../src/render/world-lettering-fonts.js';

test('primordial stock retains actual Source I clauses and their token colours without invented instructions',()=>{
  const originals=new Set(Object.values(SOURCE_ATLAS.sectors).flatMap(s=>s.sourceLines.map(l=>l.text))),lines=standingTearSourceLines(),rows=standingTearSourceRows();
  assert.equal(lines.length,96);assert.equal(rows.length,88);assert.ok(rows.every(row=>originals.has(row.text)));
  assert.ok(rows.every(row=>SOURCE_SURFACE_LETTERING.palette.includes(row.colour)));
  const colours=new Set();
  for(const row of rows){
    assert.ok(Array.isArray(row.tokens));const spans=sourceSyntaxSpans(row.text,row.tokens);
    assert.equal(spans.map(span=>span.text).join(''),row.text);for(const span of spans)colours.add(span.color);
  }
  assert.ok(colours.size>=6);assert.ok(colours.has(SOURCE_SYNTAX_PALETTE.function));
  assert.equal(STANDING_TEAR_SOURCE_PRINT.polarity,'light-on-dark');assert.equal(STANDING_TEAR_SOURCE_PRINT.emission,'pigment');assert.equal(STANDING_TEAR_SOURCE_PRINT.coverage,'baseColorAlpha');
});

test('band extraction keeps colour and pigment coverage separate, with the original8to1 glyph aspect',()=>{
  const w=2048,h=2048,pixels=new Uint8Array(w*h*4),start=3*256*w*4;pixels.set([8,239,67,173],start);
  const band=standingTearSourceBand({pixels},4);assert.equal(band.width,2048);assert.equal(band.height,256);assert.deepEqual([...band.pixels.slice(0,4)],[8,239,67,173]);
  assert.equal(band.layer,4);assert.ok(Object.values(STANDING_TEAR_PRINT_SCALE).every(([x,y])=>x/y===8),'canonical glyphs must keep their aspect on actual physical surfaces');
  band.pixels[0]=99;assert.equal(pixels[start],8);
});

test('floor and vertical clauses use physical surface coordinates, never screen position or camera',()=>{
  assert.deepEqual(standingTearSourceUV([24,0,3],[0,1,0]),[1,1]);
  assert.deepEqual(standingTearSourceUV([96,12,0],[0,0,1],STANDING_TEAR_PRINT_SCALE.wall),[1,-1]);
  assert.deepEqual(standingTearSourceUV([0,12,96],[1,0,0],STANDING_TEAR_PRINT_SCALE.wall),[-1,-1]);
});

test('local cool stock changes only zero-coverage background while actual Source pigment RGB and alpha stay exact',()=>{
  const raw={width:3,height:1,pixels:new Uint8Array([0,0,0,0,8,239,67,255,6,191,255,73])},stock=standingTearSourceStock(raw);
  assert.deepEqual([...stock.pixels.slice(0,3)],STANDING_TEAR_STOCK_RGB);assert.equal(stock.pixels[3],0);
  assert.deepEqual(stock.pixels.slice(4),raw.pixels.slice(4),'both solid and antialiased pigment retain their original Source colours and coverage');
  assert.deepEqual([...raw.pixels.slice(0,4)],[0,0,0,0],'canonical band data is not recoloured in place');
  assert.deepEqual(stock.sourceCodeStock,STANDING_TEAR_STOCK_RGB.map(channel=>channel/255));
  assert.equal(stock.sourceCodeStock,STANDING_TEAR_SOURCE_CODE_STOCK);assert.ok(Object.isFrozen(stock.sourceCodeStock));
});

test('the real map cache exposes normalized sRGB stock alongside its existing single texture',async()=>{
  const previous=globalThis.document,owner={fonts:{add(){}},createElement(){
    const canvas={width:0,height:0},ctx={font:'',save(){},restore(){},clearRect(){},fillRect(){},fillText(){},
      measureText(text){const size=parseFloat(this.font);return{width:text.length*size*.6,actualBoundingBoxLeft:0,actualBoundingBoxRight:text.length*size*.6,actualBoundingBoxAscent:size*.8,actualBoundingBoxDescent:size*.2};},
      getImageData(){return{data:new Uint8ClampedArray(canvas.width*canvas.height*4)};}};
    canvas.getContext=()=>ctx;return canvas;}};
  globalThis.document=owner;
  try{
    class Font{async load(){return this;}}
    await ensureWorldLetteringFonts({ownerDocument:owner,FontFaceClass:Font,assetUrl:path=>path});
    let textures=0;const uploaded=[],names=['ACTIVE_TEXTURE','TEXTURE_BINDING_2D','UNPACK_FLIP_Y_WEBGL','UNPACK_PREMULTIPLY_ALPHA_WEBGL','TEXTURE_2D','SRGB8_ALPHA8','RGBA8','RGBA','UNSIGNED_BYTE','TEXTURE_MIN_FILTER','LINEAR_MIPMAP_LINEAR','TEXTURE_MAG_FILTER','LINEAR','TEXTURE_WRAP_S','TEXTURE_WRAP_T','REPEAT','CLAMP_TO_EDGE'],
      gl={...Object.fromEntries(names.map(name=>[name,name])),createTexture:()=>({id:++textures}),getParameter:key=>key==='ACTIVE_TEXTURE'?0:key==='TEXTURE_BINDING_2D'?null:false,
        bindTexture(){},pixelStorei(){},texImage2D(...args){uploaded.push(args.at(-1));},generateMipmap(){},texParameteri(){},activeTexture(){}};
    const maps=standingTearSourceMaps(gl,{layer:4});
    assert.deepEqual(maps.sourceCodeStock,[24/255,31/255,35/255]);assert.equal(maps.sourceCodeStock,STANDING_TEAR_SOURCE_CODE_STOCK);
    assert.equal(maps.printedSurface,STANDING_TEAR_SOURCE_PRINT);assert.equal(maps.normalTexture,null);assert.equal(maps.ormTexture,null);
    assert.deepEqual([...uploaded[0].slice(0,4)],[24,31,35,0],'uncovered stock RGB and pigment alpha remain separate');
    assert.equal(standingTearSourceMaps(gl,{layer:4}),maps);assert.equal(textures,1,'stock metadata introduces no texture or sampler');
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
