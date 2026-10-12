import * as scenes from './scenes.js';
import { uiSize, uiFill, uiDraw } from '../render/ui.js';
import { sourcePageDocument } from '../data/source-pages.js';
import { makeDocumentScene, documentInspectRect, drawPhysicalPage } from './document.js';

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

// THE STILL SHEET IS THE WIPE.
//
// The hand owns the transition. Raise the same physical A4 into its ordinary
// inspection view, commit only while the surround is completely opaque, then
// lower it into a room that has already rendered. No camera turn is hidden in
// the paper and closing it never removes the inspection in one frame.
export const SOURCE_STILL_DOCUMENT = Object.freeze({
  id: 'source-real-still',
  title: 'ELLERY FIELD RECORDING · TAKE SHEET',
  byline: 'W. ELLERY / WORKS',
  decay: 0,
  body: Object.freeze([
    Object.freeze({ raw: 'SITE: ELLERY CONSERVATOIRE' }),
    Object.freeze({ raw: 'ROOM: ______________________________' }),
    Object.freeze({ raw: 'TAKE: ______' }),
    Object.freeze({ raw: 'START: ______' }),
    Object.freeze({ raw: 'END: ______' }),
    Object.freeze({ rule: true }),
    Object.freeze({ raw: 'STATUS: ______________________________' }),
  ]),
  paper: Object.freeze({
    issuer: 'ellery-works',
    template: 'take-sheet',
    reproduction: 'original-handled',
  }),
});

export const SOURCE_STILL_ARRIVAL = Object.freeze({ raise: .6, cover: .08, lower: .6, reduced: .18 });

export function makeSourceStillPageScene({
  onCovered = () => {}, onReveal = () => {}, onClose = () => {}, reducedMotion = false,
} = {}) {
  let stage = 'raising', elapsed = 0, closeRequested = false, covered = false, done = false;
  const duration = () => reducedMotion ? SOURCE_STILL_ARRIVAL.reduced
    : stage === 'lowering' ? SOURCE_STILL_ARRIVAL.lower : SOURCE_STILL_ARRIVAL.raise;
  const ease = (value) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
  function lower() {
    if (stage === 'lowering' || done) return;
    stage = 'lowering'; elapsed = 0;
    onReveal();
  }
  const scene = makeDocumentScene(SOURCE_STILL_DOCUMENT, {
    id: 'source-still-page',
    onRequestClose: lower,
    // The paper has its own light. The world keeps its material calibration
    // while covered, rather than changing look again as the hand drops away.
    lookProfile: 'explore',
  });
  return {
    ...scene,
    transitionCover: true,
    suppressesHud: true,
    enter() { scene.enter?.(); },
    update(dt) {
      if (done) return;
      const delta = Math.max(0, Number(dt) || 0);
      elapsed += delta;
      scene.update?.(delta);
      if (stage === 'raising' && elapsed >= duration()) {
        stage = 'covered'; elapsed = 0; covered = true;
        onCovered();
      } else if (stage === 'covered' && elapsed >= SOURCE_STILL_ARRIVAL.cover) {
        stage = 'held'; elapsed = 0;
        if (closeRequested) lower();
      } else if (stage === 'lowering' && elapsed >= duration()) {
        done = true; stage = 'done';
        // Remove this exact scene; a pause or other overlay must never be popped
        // in its place if it arrived during the short lowering action.
        scenes.remove(this);
        onClose();
      }
    },
    key(event) {
      if (done) return true;
      if (stage === 'held') return scene.key(event);
      const key = String(event?.key || '').toLowerCase();
      if (stage === 'raising' || stage === 'covered') {
        if (['e', 'escape', 'enter', ' '].includes(key) || event?.controllerAction === 'back') closeRequested = true;
      }
      return true;
    },
    view: () => ({
      ...scene.view(),
      id: 'source-still-page',
      lines: SOURCE_STILL_DOCUMENT.body.map((entry) => entry.raw || ''),
      arrival: {
        stage, covered, done, reducedMotion,
        progress: stage === 'raising' || stage === 'lowering' ? Math.min(1, elapsed / duration()) : 1,
        coverage: stage === 'raising' ? ease(elapsed / duration())
          : stage === 'lowering' ? 1 - ease(elapsed / duration()) : done ? 0 : 1,
      },
    }),
    render() {
      const { cols, rows } = uiSize();
      if (stage === 'held' || stage === 'covered') {
        uiFill(0, 0, cols, rows, '#000');
        scene.render();
        return;
      }
      if (done) return;
      const t = ease(elapsed / duration());
      const coverage = stage === 'lowering' ? 1 - t : t;
      uiFill(0, 0, cols, rows, `rgba(0,0,0,${coverage.toFixed(4)})`);
      uiDraw((surface) => {
        const rect = documentInspectRect(surface);
        const travel = stage === 'lowering' ? t : 1 - t;
        const scale = reducedMotion ? 1 : 1 - travel * (stage === 'lowering' ? .07 : .22);
        const width = rect.w * scale, height = rect.h * scale;
        const moved = {
          ...rect, w: width, h: height,
          x: rect.x + (rect.w - width) / 2,
          y: rect.y + (rect.h - height) / 2 + (reducedMotion ? 0 : surface.rows * surface.cellH * surface.dpr * travel * .92),
        };
        if (reducedMotion) surface.ctx.globalAlpha *= coverage;
        drawPhysicalPage(surface.ctx, SOURCE_STILL_DOCUMENT, 0, moved);
      });
    },
  };
}
