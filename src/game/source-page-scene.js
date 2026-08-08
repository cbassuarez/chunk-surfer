import * as scenes from './scenes.js';
import { uiSize, uiFill, uiText } from '../render/ui.js';
import { drawMachinePanel } from '../render/presentation.js';

// READING ONE OF THE PAGES IN THE LONG HALL.
//
// Deliberately not speech. These are documents whose horror is in their LAYOUT —
// a field filled in four times, a line losing a word per repetition, a column
// with no opposite column — and speech would read them out as prose and throw
// all of that away. They go on the machine panel, monospaced, as found.
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
// So: cut to black on the frame it is taken, put a door in the dark, and let the
// field fade up behind it. The runtime's transformation runs underneath the
// whole time, so the black lifts on a source space already forming rather than
// on a static plate.
export const SOURCE_THRESHOLD = Object.freeze({ hold: 1.6, fade: 1.8 });

export function makeSourceThresholdScene({ onDone = () => {}, cue = () => {} } = {}) {
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
      alpha: elapsed < SOURCE_THRESHOLD.hold ? 1
        : Math.max(0, 1 - (elapsed - SOURCE_THRESHOLD.hold) / SOURCE_THRESHOLD.fade),
      done,
    }),
    enter() {
      // The door is the only thing in the dark. It lands a beat after the cut, so
      // the black registers as a cut rather than as a transition with a sound on it.
      if (!opened) { opened = true; cue(); }
    },
    update(dt) {
      if (done) return;
      elapsed += Math.max(0, Number(dt) || 0);
      if (elapsed >= SOURCE_THRESHOLD.hold + SOURCE_THRESHOLD.fade) {
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
      const a = elapsed < SOURCE_THRESHOLD.hold ? 1
        : Math.max(0, 1 - (elapsed - SOURCE_THRESHOLD.hold) / SOURCE_THRESHOLD.fade);
      if (a > 0) uiFill(0, 0, cols, rows, `rgba(0,0,0,${a.toFixed(3)})`);
    },
  };
}

export function makeSourcePageScene({ page = null, onClose = () => {} } = {}) {
  const lines = page?.lines || [];
  let closed = false;
  const close = () => { if (closed) return; closed = true; scenes.pop(); onClose(); };

  return {
    id: 'source-page',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'hush',
    pageId: page?.id || null,
    view: () => ({ id: 'source-page', page: page?.id || null, lines: [...lines] }),
    key() { close(); return true; },
    pointer(e) { if (e.type === 'pointerdown') close(); return true; },
    render() {
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, 'rgba(2,2,3,.93)');
      const width = Math.min(72, cols - 8);
      const panel = drawMachinePanel(Math.floor((cols - width) / 2), 3, width, rows - 6, {
        label: 'SOURCE / PAGE', source: 'FOUND', meter: false,
        footer: 'ANY KEY · PUT IT DOWN',
      });
      lines.forEach((line, i) => {
        // The first line is the form's own header; the rest is what happened to
        // it. Later lines dim, because the page is losing its nerve as it goes.
        const fade = i === 0 ? 1 : Math.max(0.42, 1 - i * 0.11);
        uiText(panel.x, panel.y + 1 + i * 1.35, String(line).slice(0, panel.w),
          i === 0 ? 'ui-label' : 'ui-primary', fade);
      });
    },
  };
}
