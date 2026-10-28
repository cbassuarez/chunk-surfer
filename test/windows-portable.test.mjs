import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { validateWindowsPortable } from '../scripts/validate-windows-portable.mjs';

function makeFixture() {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'chunk-surfer-portable-'));
  const parent = path.join(temp, `Path with spaces – テスト – ${'x'.repeat(80)}`);
  const appDir = path.join(parent, 'Chunk Surfer');
  mkdirSync(appDir, { recursive: true });
  writeFileSync(path.join(appDir, 'chunk-surfer.exe'), 'game');
  writeFileSync(path.join(appDir, 'EULA.md'), '# Terms\n');
  writeFileSync(path.join(appDir, 'README.txt'), 'Extract the complete folder.');
  return { temp, appDir };
}

test('Windows portable validator accepts a lean payload in a Unicode path', () => {
  const fixture = makeFixture();
  try {
    const result = validateWindowsPortable(fixture.appDir);
    assert.equal(result.exeBytes, 4);
    assert.ok(result.eulaBytes > 0);
    assert.match(result.appDir, /Path with spaces/);
  } finally { rmSync(fixture.temp, { recursive: true, force: true }); }
});

test('Windows portable validator rejects missing and empty core files', () => {
  for (const mutate of [
    ({ appDir }) => rmSync(path.join(appDir, 'chunk-surfer.exe')),
    ({ appDir }) => writeFileSync(path.join(appDir, 'chunk-surfer.exe'), ''),
    ({ appDir }) => rmSync(path.join(appDir, 'EULA.md')),
    ({ appDir }) => writeFileSync(path.join(appDir, 'steam_api64.dll'), ''),
    ({ appDir }) => writeFileSync(path.join(appDir, 'steam_appid.txt'), 'local-test-id'),
  ]) {
    const fixture = makeFixture();
    try {
      mutate(fixture);
      assert.throws(() => validateWindowsPortable(fixture.appDir), /Invalid Windows portable payload/);
    } finally { rmSync(fixture.temp, { recursive: true, force: true }); }
  }
});

test('Windows staging replaces stale SD output and copies only the optional Windows Steamworks redistributable',()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'chunk-windows-stage-'));
  try{
    const staged=path.join(dir,'release','windows','Chunk Surfer'),steam=path.join(dir,'src-tauri','steamworks-runtime');
    mkdirSync(staged,{recursive:true});writeFileSync(path.join(staged,'chunk-lens.exe'),'stale');
    mkdirSync(path.join(staged,'lens','models'),{recursive:true});writeFileSync(path.join(staged,'lens','models','old.bin'),'stale');
    mkdirSync(path.join(dir,'src-tauri','target','release'),{recursive:true});
    writeFileSync(path.join(dir,'src-tauri','target','release','chunk-surfer.exe'),'game');
    mkdirSync(path.join(dir,'LEGAL'));writeFileSync(path.join(dir,'LEGAL','EULA.md'),'general agreement');
    writeFileSync(path.join(dir,'package.json'),JSON.stringify({version:'0.3.0'}));
    mkdirSync(steam,{recursive:true});
    for(const name of ['steam_api64.dll','libsteam_api.dylib','steam_appid.txt','chunk-lens.exe','.gitkeep'])writeFileSync(path.join(steam,name),'local fixture');
    mkdirSync(path.join(steam,'lens'));writeFileSync(path.join(steam,'lens','weights.safetensors'),'local model');
    const packager=fileURLToPath(new URL('../scripts/package-windows-portable.mjs',import.meta.url));
    execFileSync(process.execPath,[packager],{cwd:dir});
    assert.deepEqual(readdirSync(staged).sort(),['EULA.md','README.txt','chunk-surfer.exe','steam_api64.dll']);
    assert.equal(readFileSync(path.join(staged,'EULA.md'),'utf8'),'general agreement');
    assert.match(readFileSync(path.join(staged,'README.txt'),'utf8'),/Chunk Surfer 0\.3\.0/);
    assert.ok(validateWindowsPortable(staged).exeBytes>0);
    // The ordinary non-Steam portable build is valid with no staged DLL.
    rmSync(path.join(steam,'steam_api64.dll'));
    execFileSync(process.execPath,[packager],{cwd:dir});
    assert.deepEqual(readdirSync(staged).sort(),['EULA.md','README.txt','chunk-surfer.exe']);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('Windows portable validator rejects stale model sidecars and weights', () => {
  for (const contaminate of [
    ({ appDir }) => writeFileSync(path.join(appDir, 'chunk-lens.exe'), 'old sidecar'),
    ({ appDir }) => { mkdirSync(path.join(appDir, 'lens', 'models'), { recursive: true }); },
    ({ appDir }) => writeFileSync(path.join(appDir, 'model.safetensors'), 'old weights'),
  ]) {
    const fixture = makeFixture();
    try {
      contaminate(fixture);
      assert.throws(() => validateWindowsPortable(fixture.appDir), /bundled Stable Diffusion content/);
    } finally { rmSync(fixture.temp, { recursive: true, force: true }); }
  }
});
