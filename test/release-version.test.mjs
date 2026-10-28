import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';

const files=['scripts/release-preflight.mjs','package.json','package-lock.json','src-tauri/tauri.conf.json',
 'src-tauri/tauri.windows.conf.json','src-tauri/Cargo.toml','src-tauri/Cargo.lock','.github/workflows/release.yml',
 'scripts/release-matrix.mjs','scripts/package-windows-portable.mjs','scripts/validate-windows-portable.mjs',
 'vite.config.js','LEGAL/EULA.md','public/assets/surfaces/surfaces.json','src/main.js',
 'src/platform/stable-diffusion-policy.js','src/game/eula-text.js','CHANGELOG.md'];
function preflight(change,tag){
 const dir=mkdtempSync(path.join(tmpdir(),'chunk-release-version-'));
 try{
  for(const file of files){const target=path.join(dir,file);mkdirSync(path.dirname(target),{recursive:true});copyFileSync(file,target);}
  change?.(dir);
  return spawnSync(process.execPath,['scripts/release-preflight.mjs',...(tag?[tag]:[])],{cwd:dir,encoding:'utf8',env:{...process.env,CI:'true'}});
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test('the prepared 0.3.0 metadata and notes pass the real preflight CLI without an implicit old tag',()=>{
 const r=preflight();assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/passed for v0\.3\.0/);
});
test('release preflight rejects a stale root package-lock version before packaging',()=>{
 const r=preflight(dir=>{const p=path.join(dir,'package-lock.json'),d=JSON.parse(readFileSync(p,'utf8'));d.packages[''].version='0.2.1-beta.1';writeFileSync(p,JSON.stringify(d));});
 assert.equal(r.status,1);assert.match(r.stderr,/packageLockRoot version is 0\.2\.1-beta\.1; v0\.3\.0 requires 0\.3\.0/);
});
test('release preflight rejects a stale local Cargo.lock package even when Cargo.toml matches',()=>{
 const r=preflight(dir=>{const p=path.join(dir,'src-tauri/Cargo.lock');writeFileSync(p,readFileSync(p,'utf8').replace(/(name = "chunk-surfer"\nversion = ")[^"]+/, '$10.2.1-beta.1'));});
 assert.equal(r.status,1);assert.match(r.stderr,/cargoLock version is 0\.2\.1-beta\.1; v0\.3\.0 requires 0\.3\.0/);
});
test('release preflight refuses a tag that does not identify the prepared source',()=>{
 const r=preflight(null,'v0.3.1');assert.equal(r.status,1);assert.match(r.stderr,/v0\.3\.1 requires 0\.3\.1/);
});
test('release preflight rejects loss of the standard no-SD calibration bypass',()=>{
 const r=preflight(dir=>{const p=path.join(dir,'src/main.js');writeFileSync(p,readFileSync(p,'utf8').replace('if(stableDiffusionOff()){afterCalibration();return;}','if(false){afterCalibration();return;}'));});
 assert.equal(r.status,1);assert.match(r.stderr,/forbid lens services and bypass SD calibration/);
});
