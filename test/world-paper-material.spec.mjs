import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {PAPER_ATLAS,PAPER_DOCUMENTS} from '../src/generated/paper-catalog.js';
import {PAPER_WORLD_MATERIAL} from '../src/data/paper-world-material.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const report=JSON.parse(fs.readFileSync(PAPER_WORLD_MATERIAL.path.replace(/\.png$/,'.json'))),png=fs.readFileSync(PAPER_WORLD_MATERIAL.path);
assert.equal(report.sha256,sha(png));assert.equal(report.count,PAPER_ATLAS.count);assert.equal(report.columns,PAPER_ATLAS.columns);assert.equal(report.rows,PAPER_ATLAS.rows);
assert.deepEqual(report.tile,[32,46]);assert.equal(report.width,PAPER_ATLAS.columns*32);assert.equal(report.height,PAPER_ATLAS.rows*46);
assert.ok(report.fullMipBytes<2*1024*1024,'Coarse world paper channels exceed2MiB mipmapped');
for(const [file,hash]of Object.entries(report.preserved))assert.equal(sha(fs.readFileSync(file)),hash,`${file} changed while adding paper material`);
for(const input of report.inputs)assert.equal(sha(fs.readFileSync(input.path)),input.sha256,`${input.path} changed after packing`);
const pages=Object.values(PAPER_DOCUMENTS).flatMap(doc=>doc.pages).sort((a,b)=>a.atlasIndex-b.atlasIndex),atlas=await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject:true});
assert.equal(atlas.info.channels,3);assert.equal(atlas.info.width,report.width);assert.equal(atlas.info.height,report.height);
// Independently inspect widely separated catalog slots. A transposed/flipped
// page atlas can look plausible while assigning another document's handling.
for(const index of [0,Math.min(17,pages.length-1),Math.floor(pages.length/2),pages.length-1]){
 const expected=await sharp(pages[index].materialPath).removeAlpha().resize(32,46,{fit:'fill',kernel:'lanczos3'}).raw().toBuffer(),left=index%PAPER_ATLAS.columns*32,top=Math.floor(index/PAPER_ATLAS.columns)*46;
 for(let y=0;y<46;y++)assert.deepEqual(atlas.data.subarray(((top+y)*report.width+left)*3,((top+y)*report.width+left+32)*3),expected.subarray(y*32*3,(y+1)*32*3),'Packed paper channels assigned to the wrong catalog page');
}
const props=fs.readFileSync('src/render/props3d.js','utf8'),renderer=fs.readFileSync('src/render/r3d.js','utf8');
assert.match(props,/vPaperIndex=aNormal\.y>\.5\?paper:-1/,'World paper back/edge acquired front lettering');
assert.match(props,/if\(uUsePaperAtlas>\.5&&vPaperIndex>=0\)/);assert.match(props,/if\(uUsePaperMaterial>\.5\)/);
assert.match(props,/rough=clamp\(paperMaterial\.r,\.42,\.96\)/,'PackedR is not roughness');
assert.match(props,/propMappedNormal\(vWorld,n,vUv,normalize\(vec3\(-slopes,1\.0\)\)\)/,'Paper height skips shared signed material frame');
assert.match(props,/gl\.RGBA8,gl\.RGBA,gl\.UNSIGNED_BYTE,materialBitmap/,'Packed material incorrectly decoded as sRGB');
assert.match(props,/gl\.activeTexture\(gl\.TEXTURE10\)/);assert.match(props,/paper material unavailable; retaining existing print roughness/);
assert.match(renderer,/materialUrl:assetUrl\(PAPER_WORLD_MATERIAL\.path\)/);
assert.ok(PAPER_WORLD_MATERIAL.heightRangeM*14/255>.000005&&PAPER_WORLD_MATERIAL.heightRangeM*14/255<.00004,'Print impression enlarged to visible geometry');
console.log(JSON.stringify({kind:'world-paper-material',sheets:report.count,dimensions:[report.width,report.height],baseLevelBytes:report.baseLevelBytes,fullMipBytes:report.fullMipBytes,originalColorCoverageUnchanged:true,shaderLink:'separate GPU test'}));
