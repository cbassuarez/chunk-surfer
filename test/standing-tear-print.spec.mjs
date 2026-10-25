import test from 'node:test';
import assert from 'node:assert/strict';
import SOURCE_ATLAS from '../content/chunk-surf/source-atlas.json' with {type:'json'};
import {SOURCE_SURFACE_LETTERING} from '../src/render/source-surface-lettering.js';
import {STANDING_TEAR_SOURCE_PRINT,STANDING_TEAR_PRINT_SCALE,STANDING_TEAR_STOCK_RGB,standingTearSourceLines,standingTearSourceRows,standingTearSourceBand,standingTearSourceStock,standingTearSourceUV} from '../src/render/standing-tear-print.js';

test('primordial stock retains actual Source I clauses and canonical coloured ink without invented instructions',()=>{
  const originals=new Set(Object.values(SOURCE_ATLAS.sectors).flatMap(s=>s.sourceLines.map(l=>l.text))),lines=standingTearSourceLines(),rows=standingTearSourceRows();
  assert.equal(lines.length,96);assert.equal(rows.length,88);assert.ok(rows.every(row=>originals.has(row.text)));
  assert.ok(rows.every(row=>SOURCE_SURFACE_LETTERING.palette.includes(row.colour)));
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
});
