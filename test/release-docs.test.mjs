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

test('storefront candidate copy excludes live SD claims and keeps measured package size pending',()=>{
  const description=read('docs/storefront-copy-itch.html'),install=read('docs/storefront-install-itch.html');
  assert.match(description,/development-only, outside the downloadable game/);
  assert.match(description,/No local AI model is required to play/);
  assert.doesNotMatch(description,/only 3D psychological horror game with a local Stable Diffusion|neither 8bit nor diffused|Now out for public beta testing/);
  assert.match(description,/candidate and does not announce a published download/);
  assert.match(install,/No Stable Diffusion model or Python runtime is bundled or downloaded on first launch/);
  assert.match(install,/Microsoft Edge WebView2 Runtime/);
  assert.match(install,/Open the downloaded macOS Apple Silicon <code>\.dmg<\/code>/);
  assert.doesNotMatch(install,/your GPU driver is not exposing CUDA|proprietary NVIDIA driver is required|model weights ship inside/);
  assert.match(copy,/Replace with measurements from the actual lean release files/);
});

test('the offline storefront preview contains both current hand-authored paste fragments exactly',()=>{
  const preview=read('docs/storefront-itch-preview.html');
  for(const file of ['docs/storefront-copy-itch.html','docs/storefront-install-itch.html']){
    const source=read(file),start=source.indexOf('<p class="custom-index">');assert.ok(start>=0);
    assert.ok(preview.includes(source.slice(start).trim()),file+' has drifted from its offline preview');
  }
});
