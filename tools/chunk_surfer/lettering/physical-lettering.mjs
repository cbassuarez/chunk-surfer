// Deterministic physical print sheets for static props and draped surfaces.
// RGB and coverage are authored independently. PNG alpha is pigment coverage,
// never face transparency; all returned materials must use alphaMode OPAQUE.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export function printedSurfaceMetadata(page,{coverage='baseColorAlpha'}={}){
 return {version:1,coverage,polarity:page.polarity,process:page.process,emission:page.emission||'none'};
}
export async function bakeLetteringAtlases(jobs,{outputDir,pageSize=1024}={}){
 if(!outputDir)throw new TypeError('A task-owned atlas output directory is required');
 if(!Array.isArray(jobs)||new Set(jobs.map(j=>j.id)).size!==jobs.length)throw new TypeError('Lettering jobs need unique ids');
 for(const job of jobs){if(!job.id||!Number.isFinite(job.widthM)||!Number.isFinite(job.heightM)||job.widthM<=0||job.heightM<=0)throw new TypeError(`Invalid physical lettering surface ${job.id}`);}
 fs.mkdirSync(outputDir,{recursive:true});
 const input=path.join(outputDir,'lettering-jobs.json');fs.writeFileSync(input,JSON.stringify({version:1,pageSize,jobs},null,2)+'\n');
 const bundled='/Users/seb/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
 const python=process.env.CHUNK_SURFER_LETTERING_PYTHON||(fs.existsSync(bundled)?bundled:'python3');
 const run=spawnSync(python,[path.join(HERE,'rasterize.py'),input,outputDir],{encoding:'utf8',maxBuffer:4*1024*1024});
 if(run.status!==0)throw new Error(`Physical lettering bake failed: ${run.stderr||run.stdout||run.error}`);
 const manifest=JSON.parse(fs.readFileSync(path.join(outputDir,'atlas-manifest.json'),'utf8'));
 const pages=manifest.pages.map(page=>({...page,...Object.fromEntries(['albedo','normal','orm'].map(role=>[role,fs.readFileSync(path.join(outputDir,page[role]))]))}));
 return{pages,entries:new Map(manifest.entries.map(entry=>[entry.id,entry])),manifest,inputSha256:sha(fs.readFileSync(input))};
}
export function mapLetteringUv(rect,u,v){return[rect[0]+(rect[2]-rect[0])*u,rect[1]+(rect[3]-rect[1])*v];}
