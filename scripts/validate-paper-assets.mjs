#!/usr/bin/env node
import { stat, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORK_ORDER, PAGES } from '../src/data/conservatory-script.js';
import { SOURCE_PAGES, sourcePageDocument } from '../src/data/source-pages.js';
import { PAPER_ATLAS, PAPER_DOCUMENTS, PAPER_COMPILER_VERSION } from '../src/generated/paper-catalog.js';
import { PAPER_FORMAT, validateBritishPaperDocument } from '../src/data/paper-system.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=(v)=>createHash('sha256').update(String(v)).digest('hex');
const docs=[WORK_ORDER,...PAGES,...SOURCE_PAGES.map(sourcePageDocument),{id:'source-real-still',title:'ELLERY FIELD RECORDING · TAKE SHEET',byline:'W. ELLERY / WORKS',body:[{raw:'SITE      ELLERY CONSERVATOIRE'},{raw:'ROOM      ______________________________'},{raw:'TAKE      ______'},{raw:'START     ______'},{raw:'END       ______'},{rule:true},{raw:'STATUS    ______________________________'}]}];
const errors=[];
for(const doc of docs){
  const record=PAPER_DOCUMENTS[doc.id];if(!record){errors.push(`${doc.id}: missing catalog record`);continue;}
  if(record.format!==PAPER_FORMAT.A4.id)errors.push(`${doc.id}: production paperwork is not A4`);
  const british=validateBritishPaperDocument(doc);for(const issue of british.errors)errors.push(`${doc.id}: ${issue}`);
  const semantic=sha([doc.title,doc.byline,JSON.stringify(doc.body||[])].join('\n'));
  // The real still sheet is defined by the compiler, not an authored JS document.
  if(doc.id!=='source-real-still'&&record.semanticHash!==semantic)errors.push(`${doc.id}: semantic hash stale`);
  if(!Array.isArray(record.pages)||!record.pages.length){errors.push(`${doc.id}: no raster sheets`);continue;}
  for(const [i,page] of record.pages.entries()){
    const file=path.join(ROOT,page.path);if(!existsSync(file)){errors.push(`${doc.id}:${i}: missing ${page.path}`);continue;}
    const size=(await stat(file)).size;if(size<1024)errors.push(`${doc.id}:${i}: raster implausibly small (${size})`);
    if(!page.materialPath||!existsSync(path.join(ROOT,page.materialPath)))errors.push(`${doc.id}:${i}: missing packed paper material map`);
  }
}
const atlasPath=path.join(ROOT,PAPER_ATLAS.path);if(!existsSync(atlasPath))errors.push(`missing world atlas ${PAPER_ATLAS.path}`);
else if((await stat(atlasPath)).size<4096)errors.push('world atlas is implausibly small');
const physicalSheetCount=Object.values(PAPER_DOCUMENTS).reduce((n,d)=>n+(d.pages?.length||0),0);
if(PAPER_ATLAS.count!==physicalSheetCount)errors.push('world atlas sheet count/catalog sheet count mismatch');
if(PAPER_COMPILER_VERSION!=='paper-v1.5.0-paper3d-print-history')errors.push(`paper compiler/catalog is stale (${PAPER_COMPILER_VERSION})`);
if(PAPER_DOCUMENTS['page-1']?.issuer!=='ellery-works'||PAPER_DOCUMENTS['page-1']?.template!=='field-log')errors.push('recordist log did not resolve to contractor field-log stationery');
if(PAPER_DOCUMENTS['source-page:take-main-b3-a']?.template!=='take-sheet')errors.push('Source register template alias failed for take sheet');
if(PAPER_DOCUMENTS['source-page:fault-01']?.template!=='fault-report')errors.push('Source register template alias failed for fault report');
for(const record of Object.values(PAPER_DOCUMENTS)){
  for(const [pageIndex,page] of (record.pages||[]).entries()){
    if(!Number.isInteger(page.atlasIndex)||page.atlasIndex<0||page.atlasIndex>=PAPER_ATLAS.count)errors.push(`${record.id}:${pageIndex}: invalid atlas index`);
  }
}
const documentSource=await readFile(path.join(ROOT,'src/game/document.js'),'utf8');
if(/fillText\(|Courier New|function erode\(|drawTracked\(/.test(documentSource))errors.push('physical document reader contains live glyph rendering');
if(!/paper3dRender/.test(documentSource)||!/drawPhysicalPage/.test(documentSource))errors.push('inspect reader is not using the 3-D physical sheet presentation path');

for(const record of Object.values(PAPER_DOCUMENTS)){
  if(!record.stationeryProcess)errors.push(`${record.id}: missing stationery process`);
  if(!record.entryProcess)errors.push(`${record.id}: missing office-entry process`);
  if(!Array.isArray(record.handlingVector)||record.handlingVector.length!==4)errors.push(`${record.id}: missing causal handling vector`);
}
const sourceRuntime=await readFile(path.join(ROOT,'src/game/source-space-runtime.js'),'utf8');
if(/function pageTextInstances\(/.test(sourceRuntime))errors.push('Source still carries live text decals over physical paper');
if(errors.length){console.error(errors.map((e)=>`[paper] ${e}`).join('\n'));process.exit(1);}
console.log(`[paper] validated ${docs.length} production documents / ${Object.values(PAPER_DOCUMENTS).reduce((n,d)=>n+d.pages.length,0)} physical sheets`);
