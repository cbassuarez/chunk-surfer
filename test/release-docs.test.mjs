import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ITCH_CHANNELS} from '../scripts/itch-release.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const readme=read('README.md'),prep=read('STORE_PREP.md'),copy=read('docs/storefront-copy.md');
const version=JSON.parse(read('package.json')).version;
const quoted=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

test('release instructions use the current candidate version and guarded preflight',()=>{
  assert.match(readme,new RegExp('candidate source version is `'+quoted(version)+'`'));
  assert.match(readme,new RegExp('intended release tag is `v'+quoted(version)+'`'));
  assert.match(readme,/npm run release:preflight/);
  assert.doesNotMatch(readme,/Package the macOS Beta 6|The Beta 2 source version|v0\.1\.1-beta\.3/);
  for(const text of [readme,prep,copy])assert.match(text,/not (?:a claim|a publication receipt|evidence that this version)|not announce|not evidence|prepared copy/,
    'prepared release source must not imply a published download');
});

test('release documentation retains the actual four channels and portable runtime prerequisite',()=>{
  for(const {channel}of ITCH_CHANNELS){assert.ok(readme.includes(channel),channel);assert.ok(prep.includes(channel),channel);}
  assert.match(prep,/macOS Apple Silicon DMG, Windows x64 portable\s+ZIP, and Linux x64 AppImage\/deb/);
  assert.match(prep,/macOS Intel and Steam Deck\/Proton are not release\s+platforms/);
  assert.match(readme,/Windows portable builds require the Microsoft Edge WebView2 Runtime/);
  assert.match(readme,/`npm run tauri:build:steam` verifies/);
  assert.doesNotMatch(readme,/`npm run tauri:build` refuses to package/);
  assert.doesNotMatch(prep,/Butler TODO: add channel/);
});

test('storefront release copy describes the ordinary game and current installation contract',()=>{
  const description=read('docs/storefront-copy-itch.html'),install=read('docs/storefront-install-itch.html');
  assert.doesNotMatch(description,/Stable Diffusion|neither 8bit nor diffused|redaction turn-based combat/);
  assert.match(description,/TAKE THE JOB/);
  assert.match(description,/spoken (?:take )?slates and voicemail/);
  assert.doesNotMatch(description,/never records, stores|audio is never recorded/i);
  assert.match(read('docs/storefront-itch.css'),new RegExp('v'+quoted(version)+' / PUBLIC BETA'));
  assert.match(install,/Microsoft Edge WebView2 Runtime/);
  assert.match(install,/Open the downloaded macOS Apple Silicon <code>\.dmg<\/code>/);
  assert.match(install,/<td>R<\/td><td>Open recorder<\/td>/);
  assert.match(install,/Extract <code>chunk-surfer-windows-x64\.zip<\/code> completely/);
  assert.doesNotMatch(install,/your GPU driver is not exposing CUDA|proprietary NVIDIA driver is required|model weights ship inside/);
  assert.match(copy,/Replace with measurements from the actual lean release files/);
});

test('the offline storefront preview contains both current hand-authored paste fragments exactly',()=>{
  const preview=read('docs/storefront-itch-preview.html');
  for(const file of ['docs/storefront-copy-itch.html','docs/storefront-install-itch.html']){
    const source=read(file).replace(/^\s*<!--[\s\S]*?-->\s*/, '').trim();
    assert.ok(source.length>0);
    assert.ok(preview.includes(source),file+' has drifted from its offline preview');
  }
});
