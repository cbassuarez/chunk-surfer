import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtime = fs.readFileSync('src/game/source-space-runtime.js', 'utf8');
const main = fs.readFileSync('src/main.js', 'utf8');
const pageScene = fs.readFileSync('src/game/source-page-scene.js', 'utf8');

const falseBranch = runtime.slice(runtime.indexOf("focus.kind === 'source-sheet'"), runtime.indexOf("focus.kind === 'haystack-page'"));
const realBranch = runtime.slice(runtime.indexOf("focus.kind === 'haystack-page'"), runtime.indexOf("focus.kind === 'landmark'", runtime.indexOf("focus.kind === 'haystack-page'")));

assert.match(falseBranch, /assignSourceDialoguePage/, 'false sheets bypass the dialogue director');
assert.doesNotMatch(realBranch, /assignSourceDialoguePage|sourceDialogue|SOURCE_PAGES/, 'the still page entered the dialogue system');
assert.match(realBranch, /HAYSTACK_PAGE_FOUND/, 'the still page no longer commits the chapter transition');
assert.match(realBranch, /event: 'page-found'/, 'the still page no longer takes the threshold branch');
assert.doesNotMatch(realBranch, /kind: 'page'/, 'the still page can be rendered as a false document');
assert.match(main, /event==='page-found'\)\{ enterSourceLandscape\(\)/, 'still-page transition no longer cuts through the threshold');
assert.match(pageScene, /makeSourceThresholdScene/, 'threshold scene disappeared');

console.log('source dialogue real-page isolation specs passed');
