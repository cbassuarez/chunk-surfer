import * as scenes from './scenes.js';
import { uiSize, uiFill } from '../render/ui.js';
import { sourcePageDocument } from '../data/source-pages.js';
import { makeDocumentScene } from './document.js';

// READING ONE OF THE PAGES IN THE LONG HALL.
//
// Deliberately not speech. These are documents whose horror is in their LAYOUT —
// a field filled in four times, a line losing a word per repetition, a column
// with no opposite column — and speech would read them out as prose and throw
// all of that away. They use the ordinary physical-document renderer so the
// wrongness remains in the authored form, not in a separate UI dialect.
//
// It blocks input, because reading requires stopping. It does NOT call the
// runtime's protectMoment: stopping to read is not progress and must not buy a
// pause from what is behind you. The hall keeps tightening while you read.
// THE PAGE THAT MATTERS, AND WHAT HAPPENS INSTEAD OF A LINE.
//
// Taking the still page used to answer with a caption — "One sheet does not
// move…" — spoken over the top of a five-second transformation. The hardest walk
// in the game ended on a subtitle.
//
// So: cover only the unsafe render-mode switch, then hold the final physical
// frame inside a four-second macroblock resolve into the reconstructed landing.
// Reduced Motion receives the same geography as stepped blocks, without smear,
// chroma displacement or flashes.
export const SOURCE_THRESHOLD = Object.freeze({ cover: 0.12, total: 4.0, reducedSteps: 8 });

export function makeSourceThresholdScene({
  onDone = () => {}, cue = () => {}, renderer = null, reducedMotion = false,
} = {}) {
  let elapsed = 0;
  let done = false;
  let opened = false;

  return {
    id: 'source-threshold',
    blocksInput: true,
    blocksWorld: false,       // the field keeps forming under the black
    lensPreset: 'rupture',
    view: () => ({
      id: 'source-threshold',
      elapsed: +elapsed.toFixed(3),
      alpha: Math.max(0, 1 - elapsed / SOURCE_THRESHOLD.cover),
      progress: Math.max(0, Math.min(1, (elapsed - SOURCE_THRESHOLD.cover) / (SOURCE_THRESHOLD.total - SOURCE_THRESHOLD.cover))),
      reducedMotion,
      done,
    }),
    enter() {
      // The door is the only thing in the dark. It lands a beat after the cut, so
      // the black registers as a cut rather than as a transition with a sound on it.
      if (!opened) { opened = true; cue(); }
      renderer?.r3dSetDatamoshProgress?.(0);
    },
    update(dt) {
      if (done) return;
      elapsed += Math.max(0, Number(dt) || 0);
      const raw = Math.max(0, Math.min(1, (elapsed - SOURCE_THRESHOLD.cover) / (SOURCE_THRESHOLD.total - SOURCE_THRESHOLD.cover)));
      const progress = reducedMotion ? Math.floor(raw * SOURCE_THRESHOLD.reducedSteps) / SOURCE_THRESHOLD.reducedSteps : raw;
      renderer?.r3dSetDatamoshProgress?.(progress);
      if (elapsed >= SOURCE_THRESHOLD.total) {
        done = true;
        scenes.pop();
        onDone();
      }
    },
    // No key handler: this one is not skippable. It is four seconds, it is the
    // hinge of the whole chapter, and there is nothing behind it to get back to.
    key() { return true; },
    render() {
      const { cols, rows } = uiSize();
      const a = Math.max(0, 1 - elapsed / SOURCE_THRESHOLD.cover);
      if (a > 0) uiFill(0, 0, cols, rows, `rgba(0,0,0,${a.toFixed(3)})`);
    },
    exit() { renderer?.r3dEndDatamosh?.(); },
  };
}

export function makeSourcePageScene({ page = null, onClose = () => {} } = {}) {
  const doc = sourcePageDocument(page);
  if (!doc) return null;

  const scene = makeDocumentScene(doc, {
    id: 'source-page',
    onSceneClose: onClose,
    lookProfile: 'hush',
    // Locomotion stops so the page can be read; Source does not. main.js uses
    // this semantic marker to avoid turning blocksInput into HUSH protection.
    sourcePressureLive: true,
  });

  return {
    ...scene,
    pageId: page?.id || null,
    view: () => ({
      id: 'source-page',
      page: page?.id || null,
      lines: [...(page?.lines || [])],
      documentId: doc.id,
    }),
  };
}
