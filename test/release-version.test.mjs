import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';

const files=['scripts/release-preflight.mjs','scripts/apply-release-version.mjs','package.json','package-lock.json','src-tauri/tauri.conf.json',
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
const applyFiles=['scripts/apply-release-version.mjs','package.json','package-lock.json','src-tauri/Cargo.toml',
 'src-tauri/Cargo.lock','src-tauri/tauri.conf.json','CHANGELOG.md'];
function apply(version,change,extraEnv={}){
 const dir=mkdtempSync(path.join(tmpdir(),'chunk-apply-version-'));
 for(const file of applyFiles){const target=path.join(dir,file);mkdirSync(path.dirname(target),{recursive:true});copyFileSync(file,target);}
 change?.(dir);
 return {dir,result:spawnSync(process.execPath,['scripts/apply-release-version.mjs',version],{cwd:dir,encoding:'utf8',env:{...process.env,CI:'true',...extraEnv}})};
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
test('apply-release-version propagates a bare version into every version-bearing file and stubs a missing changelog section',()=>{
 const {dir,result}=apply('0.4.0');
 try{
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/Applied version 0\.4\.0/);
  assert.equal(JSON.parse(readFileSync(path.join(dir,'package.json'),'utf8')).version,'0.4.0');
  const lock=JSON.parse(readFileSync(path.join(dir,'package-lock.json'),'utf8'));
  assert.equal(lock.version,'0.4.0');
  assert.equal(lock.packages[''].version,'0.4.0');
  assert.match(readFileSync(path.join(dir,'src-tauri/Cargo.toml'),'utf8'),/^version = "0\.4\.0"$/m);
  assert.match(readFileSync(path.join(dir,'src-tauri/Cargo.lock'),'utf8'),/name = "chunk-surfer"\nversion = "0\.4\.0"/);
  assert.equal(JSON.parse(readFileSync(path.join(dir,'src-tauri/tauri.conf.json'),'utf8')).version,'0.4.0');
  const changelog=readFileSync(path.join(dir,'CHANGELOG.md'),'utf8');
  assert.equal((changelog.match(/^## 0\.4\.0$/gm)||[]).length,1);
  assert.match(changelog,/placeholder notes/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('apply-release-version normalizes the leading v and surrounding space and is idempotent',()=>{
 const {dir,result}=apply('  v0.4.0-beta.1  ');
 try{
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(readFileSync(path.join(dir,'package.json'),'utf8')).version,'0.4.0-beta.1');
  const again=spawnSync(process.execPath,['scripts/apply-release-version.mjs','v0.4.0-beta.1'],{cwd:dir,encoding:'utf8',env:{...process.env,CI:'true'}});
  assert.equal(again.status,0,again.stderr);
  assert.match(again.stdout,/already applied/);
  assert.equal((readFileSync(path.join(dir,'CHANGELOG.md'),'utf8').match(/^## 0\.4\.0-beta\.1$/gm)||[]).length,1,
   'reapplying the same version must not duplicate the changelog section');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('a version propagated by apply-release-version passes the real release preflight',()=>{
 let applied;
 const r=preflight(dir=>{applied=spawnSync(process.execPath,['scripts/apply-release-version.mjs','0.4.0'],{cwd:dir,encoding:'utf8'});},'v0.4.0');
 assert.equal(applied.status,0,applied.stderr);
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/passed for v0\.4\.0/);
});
test('apply-release-version exports the normalized version and tag through GITHUB_ENV',()=>{
 const envFile=path.join(tmpdir(),`chunk-gh-env-${process.pid}.txt`);
 const {dir,result}=apply('0.4.0',null,{GITHUB_ENV:envFile});
 try{
  assert.equal(result.status,0,result.stderr);
  const exported=readFileSync(envFile,'utf8');
  assert.match(exported,/RELEASE_VERSION=0\.4\.0/);
  assert.match(exported,/RELEASE_TAG=v0\.4\.0/);
 }finally{rmSync(dir,{recursive:true,force:true});rmSync(envFile,{force:true});}
});
test('apply-release-version rejects a malformed version',()=>{
 const {dir,result}=apply('0.4');
 try{
  assert.equal(result.status,1);
  assert.match(result.stderr,/Invalid release version/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
