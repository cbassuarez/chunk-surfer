import assert from 'node:assert/strict';
import fs from 'node:fs';

const title = fs.readFileSync('src/game/title.js', 'utf8');
const titleModel = fs.readFileSync('src/game/title-menu.js', 'utf8');
for (const id of ['continue', 'new-run', 'archive', 'return-index', 'transfer-room', 'settings', 'about', 'quit']) {
  assert.match(titleModel, new RegExp(`id: '${id}'`), `title retains the ${id} action`);
}
assert.doesNotMatch(title,/just-surf|onJustSurf/,'production title removes the sample-field route');
assert.match(title, /let sel = 0/, 'title selects its first available action');
assert.match(title, /withMachinePanel/, 'title keeps the existing instrument material stack');
assert.match(title, /createPathRegisterDisplay/, 'title uses the chosen Path register composition');
assert.match(title, /meterSnapshot:.*monitorSnapshotForRms/, 'the bezel keeps the actual program signal');
assert.match(title, /pathRegisterLayout/, 'the list and hit regions share the options layout');

const archive = fs.readFileSync('src/game/archive.js', 'utf8');
assert.match(archive, /NO ENTRIES IN THIS CATEGORY/, 'archive has an empty category state');
assert.match(archive, /archiveContentLayout/, 'archive computes its text budget from the actual panel well');
assert.match(archive, /maxDetailScroll/, 'long archive requirements and collection rows remain inspectable');

const transferRoom = fs.readFileSync('src/game/transfer-room.js', 'utf8');
assert.match(transferRoom, /let scroll = 0/, 'transfer room scrolls its register');
assert.match(transferRoom, /Nothing filed/, 'transfer room has empty-file copy rather than a blank pane');
assert.match(transferRoom, /withMachinePanel/, 'transfer room renders its readout behind the established case-panel glass');

const returnIndex = fs.readFileSync('src/game/return-index.js', 'utf8');
assert.match(returnIndex, /let scroll = 0/, 'return index scrolls entries');
assert.match(returnIndex, /body\.h - 14/, 'return index caps detail rows to body height');
assert.match(returnIndex, /NO ENDINGS INDEXED/, 'return index handles empty entry lists');

const difficulty = fs.readFileSync('src/game/difficulty-select.js', 'utf8');
assert.match(difficulty, /detailRowsNeeded/, 'difficulty computes height from rule rows');

const settings = fs.readFileSync('src/game/settings.js', 'utf8');
assert.match(settings, /tipRows/, 'settings reserves rows for footer tips');
assert.match(settings, /body\.h - 5 - tipRows/, 'settings list viewport excludes footer tip rows');

console.log('menu layout contract tests ok');
