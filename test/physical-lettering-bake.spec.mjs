import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {bakeLetteringAtlases,printedSurfaceMetadata} from '../tools/chunk_surfer/lettering/physical-lettering.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chunk-print-regression-'));
const job={id:'maker',lines:['ABCDEFGHIJKLMNOPQRSTUVWXYZ','0123456789 / : ? . -'],widthM:3,heightM:.8,capHeightM:.13,category:'personal',palette:{ground:[.7,.68,.6],ink:[.01,.012,.01]}};
const narrow={...job,id:'factory',copy:'STUDIOS / PLANT',lines:undefined,category:'institution'};
try{
 const a=await bakeLetteringAtlases([job,narrow,{...narrow,id:'factory-copy'}],{outputDir:path.join(dir,'a')}),b=await bakeLetteringAtlases([job,narrow,{...narrow,id:'factory-copy'}],{outputDir:path.join(dir,'b')});
 const hash=x=>createHash('sha256').update(x).digest('hex');
 assert.deepEqual(a.pages.map(p=>hash(p.albedo)),b.pages.map(p=>hash(p.albedo)),'Repeated bakes alter physical print');
 assert.deepEqual(a.entries.get('factory').uvRect,a.entries.get('factory-copy').uvRect,'Identical factory labels should share a tile');
 assert.equal(a.entries.get('maker').metrics.glyphs.map(g=>g.character).join(''),job.lines.join('').replaceAll(' ',''));
 assert.ok(a.entries.get('factory').metrics.fontSha256);
 for(const page of a.pages){
  const {data}=await sharp(page.albedo).ensureAlpha().raw().toBuffer({resolveWithObject:true});let clear=0,opaque=0,partial=0;
  for(let i=0;i<data.length;i+=4){if(data[i+3]===0&&data[i]+data[i+1]+data[i+2]>40)clear++;if(data[i+3]===255)opaque++;if(data[i+3]>0&&data[i+3]<255)partial++;}
  assert.ok(clear>100&&opaque>50&&partial>10,'Coverage must retain substrate RGB and antialiased pigment edges');
  assert.deepEqual(printedSurfaceMetadata(page),{version:1,coverage:'baseColorAlpha',polarity:page.polarity,process:page.process,emission:page.emission});
 }
 await assert.rejects(bakeLetteringAtlases([{...job,id:'missing',copy:'\u2603',lines:undefined}],{outputDir:path.join(dir,'bad')}),/No authored brush trajectory/);
 // A direct stamp must preserve the real host texture at zero pigment. Dark
 // original grain is valid RGB, so a brightness threshold cannot prove this.
 const stock=Buffer.alloc(320*96*3);for(let y=0;y<96;y++)for(let x=0;x<320;x++)stock.set([x%173,y%117,32+(x+y)%149],(y*320+x)*3);
 const stockPath=path.join(dir,'host.png');await sharp(stock,{raw:{width:320,height:96,channels:3}}).png().toFile(stockPath);
 const hostNormal=Buffer.alloc(320*96*3),hostOrm=Buffer.alloc(320*96*3);
 for(let y=0;y<96;y++)for(let x=0;x<320;x++){hostNormal.set([110+x%35,117+y%24,248+(x+y)%8],(y*320+x)*3);hostOrm.set([180+x%76,86+(x+y)%150,32+y%84],(y*320+x)*3);}
 const normalPath=path.join(dir,'host-normal.png'),ormPath=path.join(dir,'host-orm.png');
 await sharp(hostNormal,{raw:{width:320,height:96,channels:3}}).png().toFile(normalPath);await sharp(hostOrm,{raw:{width:320,height:96,channels:3}}).png().toFile(ormPath);
 const stamped=await bakeLetteringAtlases([{id:'stock',copy:'A 17',widthM:1,heightM:.3,capHeightM:.1,category:'record',palette:job.palette,substrate:{albedoPath:stockPath,normalPath,ormPath},reliefM:-.0015}],{outputDir:path.join(dir,'stock')}),e=stamped.entries.get('stock'),p=stamped.pages[e.page],rgba=await sharp(p.albedo).ensureAlpha().raw().toBuffer();
 const normalBytes=await sharp(p.normal).removeAlpha().raw().toBuffer(),ormBytes=await sharp(p.orm).removeAlpha().raw().toBuffer();
 assert.equal(p.normalWidth,p.width,'Sampled original normals cannot be silently downsampled');assert.equal(p.ormWidth,p.width,'Sampled original ORM cannot be silently downsampled');
 const left=Math.round(e.uvRect[0]*p.width),top=Math.round(e.uvRect[1]*p.height);let checked=0;
 for(let y=0;y<96;y++)for(let x=0;x<320;x++){const pixel=(top+y)*p.width+left+x,at=pixel*4,source=(y*320+x)*3;if(rgba[at+3]===0){assert.deepEqual([...rgba.subarray(at,at+3)],[...stock.subarray(source,source+3)]);assert.deepEqual([...normalBytes.subarray(pixel*3,pixel*3+3)],[...hostNormal.subarray(source,source+3)]);assert.deepEqual([...ormBytes.subarray(pixel*3,pixel*3+3)],[...hostOrm.subarray(source,source+3)]);checked++;}}
 assert.ok(checked>1000);assert.equal(e.reliefM,-.0015,'Fabrication relief direction was lost');
 const fitted=await bakeLetteringAtlases([{...narrow,id:'band',widthM:1,heightM:.3,capHeightM:.06,glyphLayout:{widthM:.9,heightM:.2}}],{outputDir:path.join(dir,'band')});
 assert.ok(Math.abs(fitted.entries.get('band').metrics.capHeightM-.06)<.005,'Expanding a carrier must preserve fitted glyph scale');
 assert.ok(e.finishEvidence.sampledStockOutsidePigmentImmutable);assert.ok(e.metrics.coverageSha256);
 console.log('physical lettering bake specs passed (determinism, complete brush alphabet, shared factory tiles, exact original RGB/normal/ORM outside ink, missing-glyph failure)');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
