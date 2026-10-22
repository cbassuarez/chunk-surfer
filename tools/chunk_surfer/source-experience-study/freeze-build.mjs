// Copy the current complete local runtime before native comparisons. No source writes.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir, symlink, rename, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, relative } from 'node:path';
import { productionIdentity, sha } from './prototype-session-contract.mjs';

const root=process.cwd(),frozen=resolve('artifacts/source-experience-study/frozen-build');
let prior=false;try{await access(frozen);prior=true;}catch{}
if(prior)await rename(frozen,frozen+'-preflight-missing-content');
await mkdir(frozen);
const before=await productionIdentity();
const extra=[];
for(const dir of ['tools/chunk_surfer/source-experience-study','artifacts/source-experience-study/prototypes/guidance','artifacts/source-experience-study/prototypes/bust']){
  for(const entry of await readdir(dir,{withFileTypes:true}))if(entry.isFile())extra.push(dir+'/'+entry.name);
}
const all=[...Object.keys(before),...extra].sort();
for(const file of all){
  const target=frozen+'/'+file;await mkdir(dirname(target),{recursive:true});
  const clone=spawnSync('/bin/cp',['-c',root+'/'+file,target],{encoding:'utf8'});
  assert.equal(clone.status,0,`APFS clone failed ${file}: ${clone.stderr}`);
}
await symlink(root+'/node_modules',frozen+'/node_modules','dir');
const after=await productionIdentity();
assert.deepEqual(before,after,'Live source changed during freeze; preserve incomplete snapshot and retry explicitly.');
for(const [file,hash] of Object.entries(before))assert.equal(sha(await readFile(frozen+'/'+file)),hash,`Frozen clone mismatch ${file}`);
const externalImports=[];
for(const file of Object.keys(before).filter(path=>path.startsWith('src/')&&path.endsWith('.js'))){
  const source=await readFile(frozen+'/'+file,'utf8');
  for(const match of source.matchAll(/(?:from\s*|import\s*\(?\s*)['"]([^'"]+)['"]/g)){
    const spec=match[1];if(!spec.startsWith('.'))continue;
    const target=relative(frozen,resolve(frozen,dirname(file),spec.split('?')[0]));
    if(target.startsWith('src/'))continue;
    await access(frozen+'/'+target);externalImports.push({importer:file,target});
  }
}
const configPath=frozen+'/vite.config.js',config=await readFile(configPath,'utf8');
const anchor='export default defineConfig({';assert.equal(config.split(anchor).length,2);
await writeFile(configPath,config.replace(anchor,anchor+"\n  cacheDir: resolve(import.meta.dirname, '.vite-cache'),"));
const receipt={schema:2,kind:'source-experience-frozen-production-snapshot',copiedAt:Date.now(),root,frozen,
  files:Object.keys(before).length,copyStartEqualsEnd:true,everyFrozenFileEqualsLiveCopy:true,sourceIdentity:before,toolAndPrototypeFiles:extra,externalImports,
  adaptations:[{file:'vite.config.js',reason:'Isolate Vite dependency optimizer cache from shared node_modules symlink. Same adapted configuration in every condition.',sourceSha256:sha(config),frozenSha256:sha(await readFile(configPath))}],
  nodeModules:{kind:'symlink',target:root+'/node_modules',limitation:'Installed dependencies shared read-only; package-lock frozen, no install performed.'},
  limitations:['Snapshot is a declared current-build fixture, not a production build, first-entry route or human test.','Later live-source drift is reported separately and cannot change this server.']};
await writeFile('artifacts/source-experience-study/support/frozen-snapshot.json',JSON.stringify(receipt,null,2));
console.log(JSON.stringify({frozen,files:receipt.files,externalImports:externalImports.length,sourceRuntime:before['src/game/source-space-runtime.js'],main:before['src/main.js'],pack:before['public/assets/conservatory-props.glb']}));
