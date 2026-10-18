import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import {encodePrintedAreaSurface,decodePrintedSurface} from '../src/render/printed-surface.js';
import {PAPER_PIGMENT_SURFACE} from '../src/data/paper-pigment.js';
import {strokeDistance,SCREENS} from '../src/render/pixel-mesh/screens.js';
assert.equal(PAPER_PIGMENT_SURFACE.sampling,'area');
const {data,info}=await sharp('assets/paper/world-pigment.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
let clear=0,paragraphCoverage=0,paragraphQuantizedCoverage=0,oldSolidParagraph=0;
for(let y=0;y<181;y++)for(let x=0;x<128;x++){
 const original=data[(y*info.width+x)*4+3]/255,decoded=decodePrintedSurface(encodePrintedAreaSurface(original));
 assert.equal(decoded.area,true);assert.equal(decoded.kind,1);
 assert.ok(Math.abs(decoded.coverage-original)<=1/30+1e-10,'Area quantization exceeded its declared 16-level bound');
 if(original===0){assert.equal(decoded.coverage,0);clear++;}
 if(y>=102&&y<=115){paragraphCoverage+=original;paragraphQuantizedCoverage+=decoded.coverage;oldSolidParagraph+=original>=.5;}
}
assert.equal(oldSolidParagraph,0,'Canonical fixture diagnosis changed');
assert.ok(paragraphQuantizedCoverage>25,'Paragraph area disappeared in the categorical contract');
assert.ok(clear>14000);
const screens=[];
for(const id of['hatch','crosshatch','crosshatchTight']){
 const s=SCREENS[id],levels=[];
 for(let level=0;level<=15;level++){
  let selected=0;const coverage=level/15;
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
   // Same primary screen geometry/phase as production; manufacturing area
   // does not inherit the optical tone sharpness or highlight hatch bands.
   const threshold=strokeDistance(x+.5,y+.5,.6283+s.angles[0],s.periodPx,(.37-.5)*s.jitter);
   selected+=coverage===0?0:coverage===1?1:Number(coverage>=threshold);
  }
  const fraction=selected/(256*256);assert.ok(Math.abs(fraction-coverage)<.003,`${id}/${level}: area ${fraction}`);levels.push(fraction);
 }
 screens.push({id,levels});
}
const p3=fs.readFileSync('src/render/props3d.js','utf8');
assert.ok(!p3.includes('worldPaperMixture')&&!p3.includes('WORLD_PAPER_SAMPLING'),'Failed optical-gain experiment remains in production');
assert.match(p3,/vPaperIndex=aNormal\.y>\.5\?paper:-1/,'Paper back or edge could claim front print');
assert.match(p3,/vPaperIndex<0\)printPolarity=0\.0/);
console.log(JSON.stringify({kind:'world-paper-area-contract',tile:[128,181],clearSupportExact:clear,paragraph:{rows:[102,115],canonicalInkArea:paragraphCoverage,quantizedInkArea:paragraphQuantizedCoverage,oldSolidPixels:oldSolidParagraph},areaErrorBound:1/30,screens,canonicalBytesMutated:false,nativeProof:'separate actual production shader capture; world body-copy reading is not claimed'}));
