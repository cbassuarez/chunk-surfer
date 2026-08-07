import assert from 'node:assert/strict';
import fs from 'node:fs';

const title = fs.readFileSync('src/game/title.js', 'utf8');
for (const id of ['continue', 'new-run', 'archive', 'return-index', 'hush-run', 'settings']) {
assert.match(title, new RegExp(`id: '${id}'`), `title keeps stable ${id} slot`);
}
assert.doesNotMatch(title,/just-surf|onJustSurf/,'production title removes the sample-field route');
assert.match(title, /let sel = activeRun \? 0 : 1/, 'title defaults to NEW RUN when CONTINUE is unavailable');
assert.match(title, /drawMachinePanel/, 'title uses the AUDIOCORP case-select panel');
assert.match(title, /drawVfdText/, 'title uses the established VFD wordmark');
assert.match(title, /drawLocationIndicator/, 'title keeps the case-select signal instrument');
assert.doesNotMatch(title, /renderCinematicConservatory/, 'title does not share credit-sequence geometry');
assert.match(title, /THE CASE FILE IS EMPTY/, 'title has empty-profile copy instead of disappearing menu sections');
assert.match(title, /rowsPerColumn = \(\) => Math\.ceil\(items\.length \/ columns\(\)\)/, 'title computes menu rows from stable menu item count');

const archive = fs.readFileSync('src/game/archive.js', 'utf8');
assert.match(archive, /NO ENTRIES FILED IN THIS CATEGORY/, 'archive has an empty category state');
assert.match(archive, /body\.h - 13/, 'archive caps description rows to body height');

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
