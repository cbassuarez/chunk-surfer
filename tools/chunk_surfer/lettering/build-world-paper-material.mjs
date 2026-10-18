// Add a bounded world material LOD from committed packed inspect materials.
// Never rasterize copy or rewrite canonical page/color/coverage/compiler data.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {PAPER_ATLAS,PAPER_DOCUMENTS} from '../../../src/generated/paper-catalog.js';
import {PAPER_WORLD_MATERIAL} from '../../../src/data/paper-world-material.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const [tw,th]=PAPER_WORLD_MATERIAL.tile,width=PAPER_ATLAS.columns*tw,height=PAPER_ATLAS.rows*th;
const pages=Object.values(PAPER_DOCUMENTS).flatMap(doc=>doc.pages.map((page,pageIndex)=>({id:doc.id,pageIndex,...page}))).sort((a,b)=>a.atlasIndex-b.atlasIndex);
if(pages.length!==PAPER_ATLAS.count||pages.some((page,index)=>page.atlasIndex!==index||!page.materialPath))throw new Error('World paper material requires the exact contiguous compiled page catalog');
const preservedPaths=['src/generated/paper-catalog.js','assets/paper/catalog.json','assets/paper/world-atlas.webp','assets/paper/world-pigment.png'];
const preserved=Object.fromEntries(await Promise.all(preservedPaths.map(async name=>[name,sha(await fs.readFile(path.join(ROOT,name)))])));
const rgb=Buffer.alloc(width*height*3);for(let i=0;i<rgb.length;i+=3){rgb[i]=222;rgb[i+1]=128;rgb[i+2]=25;}
const inputs=[];
// Serial decoding bounds peak memory. Numeric channels are resized without a
// gamma transform; no cosmetic lighting, grain or print damage is introduced.
for(const page of pages){
 const source=await fs.readFile(path.join(ROOT,page.materialPath)),decoded=await sharp(source).removeAlpha().resize(tw,th,{fit:'fill',kernel:'lanczos3'}).raw().toBuffer({resolveWithObject:true});
 if(decoded.info.channels!==3)throw new Error(`Packed paper channels changed: ${page.materialPath}`);
 const x=page.atlasIndex%PAPER_ATLAS.columns*tw,y=Math.floor(page.atlasIndex/PAPER_ATLAS.columns)*th;
 for(let row=0;row<th;row++)decoded.data.copy(rgb,((y+row)*width+x)*3,row*tw*3,(row+1)*tw*3);
 inputs.push({id:page.id,pageIndex:page.pageIndex,index:page.atlasIndex,path:page.materialPath,sha256:sha(source)});
}
const output=path.join(ROOT,PAPER_WORLD_MATERIAL.path);await fs.mkdir(path.dirname(output),{recursive:true});
const png=await sharp(rgb,{raw:{width,height,channels:3}}).png().toBuffer();await fs.writeFile(output,png);
for(const [name,expected]of Object.entries(preserved))if(sha(await fs.readFile(path.join(ROOT,name)))!==expected)throw new Error(`Canonical paper source changed during material build: ${name}`);
let mipBytes=0;for(let w=width,h=height;;w=Math.max(1,Math.floor(w/2)),h=Math.max(1,Math.floor(h/2))){mipBytes+=w*h*4;if(w===1&&h===1)break;}
const report={version:1,date:new Date().toISOString(),descriptor:PAPER_WORLD_MATERIAL,path:PAPER_WORLD_MATERIAL.path,sha256:sha(png),width,height,tile:[tw,th],columns:PAPER_ATLAS.columns,rows:PAPER_ATLAS.rows,count:pages.length,channels:PAPER_WORLD_MATERIAL.channels,format:'RGBA8 linear on GPU; RGB lossless PNG',baseLevelBytes:width*height*4,fullMipBytes:mipBytes,encodedBytes:png.length,preserved,inputs,
 builderSha256:sha(await fs.readFile(fileURLToPath(import.meta.url))),limits:['This is a coarse world-view LOD; inspect materials remain unchanged at full resolution.','Micro-height scale is an authored normal calibration, not measured depth or geometry.','Transmission is retained in the packed map; the opaque world material does not add unsupported back-light transport.','Base-level canonical albedo/pigment bytes are unchanged; final moving-frame acceptance is separate.']};
await fs.writeFile(output.replace(/\.png$/,'.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({path:report.path,width,height,pages:pages.length,baseLevelBytes:report.baseLevelBytes,fullMipBytes:report.fullMipBytes,encodedBytes:report.encodedBytes}));
