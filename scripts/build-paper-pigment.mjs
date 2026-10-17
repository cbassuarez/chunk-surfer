#!/usr/bin/env node
// Fast additive world-mask bake. Existing RGB/inspect/material files are read,
// never regenerated. Future paper builds call this after writing their catalog.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PAPER_PIGMENT_PATH,PAPER_PIGMENT_SURFACE} from '../src/data/paper-pigment.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function buildPaperPigment({root=ROOT}={}){
  const file=p=>path.join(root,p),catalogPath=file('assets/paper/catalog.json');
  const raw=await readFile(catalogPath),catalog=JSON.parse(raw),pages=[],missing=[],mismatch=[];
  for(const doc of Object.values(catalog.documents))for(const [pageIndex,page]of doc.pages.entries()){
    const svgPath=file(path.join('.paper-build',path.basename(page.path).replace(/\.webp$/,'.svg')));
    if(!existsSync(svgPath)){missing.push(path.relative(root,svgPath));continue;}
    const svg=await readFile(svgPath,'utf8');
    const vectorHash=sha(`${catalog.compiler}:paper-raster-v1.4-impact-readable:${JSON.stringify(catalog.fontFingerprint)}:${svg}`);
    if(vectorHash!==page.vectorHash)mismatch.push({svg:path.relative(root,svgPath),expected:page.vectorHash,actual:vectorHash});
    pages.push({id:doc.id,pageIndex,index:page.atlasIndex,svg:svgPath,svgSha256:sha(svg),vectorHash:page.vectorHash,semanticHash:doc.semanticHash});
  }
  if(missing.length||mismatch.length)throw Error(`Paper pigment requires the exact catalog SVGs: ${JSON.stringify({missing,mismatch})}`);
  pages.sort((a,b)=>a.index-b.index);
  if(pages.length!==catalog.atlas.count||pages.some((p,i)=>p.index!==i))throw Error('Paper pigment atlas indices are not contiguous with catalog');
  const rgbSource=file('assets/paper/world-atlas.webp'),rgbSha=sha(await readFile(rgbSource));
  const output=file(PAPER_PIGMENT_PATH),reportPath=output.replace(/\.png$/,'.json');
  const inputKey=sha(JSON.stringify({version:1,rgbSha,catalogSha:sha(raw),
    pages:pages.map(p=>[p.index,p.svgSha256]),raster:sha(await readFile(file('scripts/paper/rasterize_svg.py'))),
    build:sha(await readFile(file('scripts/paper/build_pigment_atlas.py')))}));
  if(existsSync(output)&&existsSync(reportPath)){
    const prior=JSON.parse(await readFile(reportPath));
    if(prior.inputKey===inputKey&&sha(await readFile(output))===prior.pngSha256){
      console.log(`[paper pigment] ${pages.length} unchanged tiles; retained exact coverage atlas`);return prior;
    }
  }
  const manifest={...catalog.atlas,tile:[128,181],canonical:[2048,2896],rgbSource,output,report:reportPath,pages};
  const manifestPath=file('.paper-build/pigment-atlas-manifest.json');await mkdir(path.dirname(manifestPath),{recursive:true});
  await writeFile(manifestPath,JSON.stringify(manifest));
  const python=process.env.PAPER_PYTHON||(existsSync(file('.paper-venv/bin/python'))?file('.paper-venv/bin/python'):'python3');
  await new Promise((resolve,reject)=>{const child=spawn(python,[file('scripts/paper/build_pigment_atlas.py'),manifestPath],{stdio:'inherit'});
    child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error(`Paper pigment raster failed (${code})`)));});
  const report=JSON.parse(await readFile(reportPath));
  if(sha(await readFile(rgbSource))!==rgbSha||sha(await readFile(catalogPath))!==sha(raw))throw Error('Original paper RGB or catalog changed during pigment bake');
  Object.assign(report,{inputKey,path:PAPER_PIGMENT_PATH,printedSurface:PAPER_PIGMENT_SURFACE,
    sourceWorldAtlasSha256:rgbSha,sourceCatalogSha256:sha(raw),fontFingerprint:catalog.fontFingerprint,
    sourcePages:pages.map(({svg,...p})=>({...p,svg:path.relative(root,svg)})),
    preserved:'Existing world-atlas.webp, inspection pages, material maps, wording, style and atlas indices are unchanged.'});
  await writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`);return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildPaperPigment();
