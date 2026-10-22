import test from 'node:test';
import assert from 'node:assert/strict';
import * as scenes from '../src/game/scenes.js';
import { makeDocumentScene } from '../src/game/document.js';
import { makeBagScene } from '../src/game/bag.js';
import { shouldOpenPauseForEvent } from '../src/game/pause.js';
import { PAGES } from '../src/data/conservatory-script.js';

const paper = PAGES.find(page => page.id === 'foh-overflow-note');
const key = value => ({ key: value, code: value === 'z' ? 'KeyZ' : value });

// This order matters: main's run-level pause policy precedes scene.key. A
// direct key() call alone would miss the advertised Escape being intercepted.
function dispatch(event, onPause) {
  const top = scenes.top();
  if (shouldOpenPauseForEvent({ storyMode: true, ...event, topSceneId: top?.id || '', localEscape: !!top?.handlesEscape })) {
    onPause();
    return;
  }
  top?.key?.(event);
}

test('Escape reaches the actual ordinary paper reader before run-level pause and closes once', () => {
  let closed = 0, pauses = 0;
  const world = { id: 'world-fixture' };
  const document = makeDocumentScene(paper, { onSceneClose() { closed++; } });
  try {
    scenes.replace(world);
    scenes.push(document);
    dispatch(key('Escape'), () => { pauses++; });
    assert.equal(pauses, 0, 'the paper owns its advertised close key instead of opening a pause above it');
    assert.equal(closed, 1);
    assert.equal(scenes.top(), world);
    assert.equal(scenes.depth(), 1);
    dispatch(key('Escape'), () => { pauses++; });
    assert.equal(pauses, 1, 'Escape resumes its ordinary run-level meaning after the paper closes');
    assert.equal(closed, 1, 'the removed paper receives no second close');
  } finally { scenes.clear(); }
});

test('Escape backs out of reading zoom before a second press closes the physical sheet', () => {
  let closed = 0, pauses = 0;
  const world = { id: 'world-fixture' };
  const document = makeDocumentScene(paper, { onSceneClose() { closed++; } });
  try {
    scenes.replace(world);
    scenes.push(document);
    dispatch(key('z'), () => { pauses++; });
    dispatch(key('ArrowDown'), () => { pauses++; });
    assert.equal(document.view().reading, true);
    assert.equal(document.view().scroll, 90);
    dispatch(key('Escape'), () => { pauses++; });
    assert.equal(pauses, 0);
    assert.equal(document.view().reading, false);
    assert.equal(document.view().scroll, 0);
    assert.equal(scenes.top(), document);
    assert.equal(closed, 0, 'backing out of zoom does not close the document');
    dispatch(key('Escape'), () => { pauses++; });
    assert.equal(pauses, 0);
    assert.equal(closed, 1);
    assert.equal(scenes.top(), world);
  } finally { scenes.clear(); }
});

test('a real bag-hosted inventory keeps its host while Escape unwinds its reader', () => {
  let bagClosed = 0, reads = 0, pauses = 0;
  const bag = makeBagScene({
    job: { rooms: [{ roomId: paper.room, label: 'THE HALL', notes: [paper], recorded: false, marked: false }], unfiled: [], done: 0, total: 1 },
    focus: { sectionId: 'sheets', entryId: `file:${paper.id}` },
    readDocument() { reads++; },
    onClose() { bagClosed++; },
  });
  try {
    scenes.replace(bag);
    dispatch(key('Enter'), () => { pauses++; });
    assert.equal(bag.debugState().route.type, 'sheet-reader');
    dispatch(key('z'), () => { pauses++; });
    assert.equal(bag.debugState().route.reader.reading, true);
    dispatch(key('Escape'), () => { pauses++; });
    assert.equal(bag.debugState().route.reader.reading, false);
    assert.equal(bag.debugState().route.type, 'sheet-reader');
    dispatch(key('Escape'), () => { pauses++; });
    assert.equal(bag.debugState().route.type, 'root');
    assert.equal(scenes.top(), bag, 'the embedded document cannot pop its host');
    assert.equal(scenes.depth(), 1);
    assert.equal(pauses, 0);
    assert.equal(bagClosed, 0);
    assert.equal(reads, 1, 'unwinding is not another acquisition');
    dispatch({ key: 'b', code: 'KeyB' }, () => { pauses++; });
    assert.equal(bagClosed, 1);
    assert.equal(scenes.depth(), 0);
  } finally { scenes.clear(); }
});
