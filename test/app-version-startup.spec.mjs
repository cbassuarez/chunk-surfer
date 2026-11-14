import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const packageBinding=main.match(/import\s*\{\s*version\s+as\s+(\w+)\s*\}\s*from\s*['"]\.\.\/package\.json['"]/)?.[1];
const declaration=main.match(/^const APP_VERSION=.*;$/m)?.[0];
function version(globals={},version=pkg.version){
 assert(packageBinding,'main imports the canonical package version');assert(declaration,'main has one explicit application version binding');
 return runInNewContext(`${declaration}\nAPP_VERSION`,{[packageBinding]:version,...globals});
}

test('the actual main version declaration starts without a bundler-injected global and follows package version changes',()=>{
 assert.equal(version(),pkg.version,'a config-free local server must not throw ReferenceError');
 assert.equal(version({},'9.4.2-local-review'),'9.4.2-local-review','the fallback cannot be a stale hard-coded release');
});

test('normal release defines remain authoritative, while unusable omitted local values use the package',()=>{
 assert.equal(version({__APP_VERSION__:'5.6.7-release'}),'5.6.7-release');
 for(const unavailable of[undefined,null,'','   ',42])assert.equal(version({__APP_VERSION__:unavailable}),pkg.version);
});

test('the isolated icon review server supplies both game build defines from the canonical package',()=>{
 const script=readFileSync(new URL('../tools/chunk_surfer/render-van-icon-study.mjs',import.meta.url),'utf8');
 assert.match(script,/appVersion\s*=\s*JSON\.parse\(await readFile\(new URL\(['"]\.\.\/\.\.\/package\.json['"],import\.meta\.url\)/);
 assert.match(script,/define:\s*\{\s*__APP_VERSION__:\s*JSON\.stringify\(appVersion\),\s*__LOCAL_TEXT_REVIEW__:\s*true\s*\}/);
 assert.match(script,/configFile:false/,'the regression covers the server that bypasses normal Vite configuration');
});
