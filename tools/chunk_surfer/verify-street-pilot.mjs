// Bounded task-local verification; run through the shared compute gate.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
const root=path.resolve(import.meta.dirname,'../..');
const out=path.join(root,'artifacts/street-realignment');
const bundleOnly=process.argv.includes('--bundle-only');
const results=bundleOnly?JSON.parse(fs.readFileSync(path.join(out,'verification.json'),'utf8')):[];
function run(args){
  const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
  results.push({args,status:result.status,stdout:result.stdout,stderr:result.stderr});
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(results,null,2)+'\n');
  process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
  if(result.status!==0)throw new Error(`Verification failed: ${args.join(' ')}`);
}
if(!bundleOnly){
  run(['tools/chunk_surfer/build-street-pilot.mjs','--normalize-only']);
  run(['--test','--test-concurrency=1','test/street-pilot.spec.mjs','test/exterior-civic-block.spec.mjs','test/roof-city-continuity.spec.mjs','test/baseboard-freshness.spec.mjs']);
}
await build({entryPoints:[path.join(root,'src/main.js')],bundle:true,write:false,format:'esm',platform:'browser',logLevel:'error',external:['@tauri-apps/*'],loader:{'.mp3':'dataurl','.wav':'dataurl','.md':'text'}});
results.push({check:'Browser code bundle',status:0});
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(results,null,2)+'\n');
console.log('Street pilot browser bundle passed; no distribution build or full-suite claim.');
