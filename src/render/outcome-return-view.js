import { uiDraw, uiFill, uiSize, uiText, uiWrap } from './ui.js';
import { drawVfdText } from './presentation.js';
import { UI_COLOR } from './palette.js';
import { returnDefinition } from '../progression/report.js';

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const residue = Object.freeze({
  sacrifice: 'The screen, and no light on it.',
  helped: 'He tried to help.',
  inversion: 'The far grey door is behind you.',
  drugged: 'The files were rejected.',
  surfaced: 'Two recordists returned.',
  'contact-won': 'You stopped it. You did not survive.',
  'contact-lost': 'No return was recorded.',
  'tower-won': 'Two bodies outside. The bells have stopped.',
  'tower-lost': 'Two bodies remain bound to the peal.',
});

// Completion is not survival. These facts are drawn from the actual ending,
// independently of the institution's optional interpretation of the return.
export function returnExposureIdentity(summary = {}, saveStatus = 'unknown') {
  const def = returnDefinition(summary.endingId, summary);
  const century = !!def?.variantTitle;
  // The arrival is authoritative: staying by choice and being defeated into
  // containment share an ending identity but are not the same outcome.
  // Historical records without an arrival do not acquire an invented defeat.
  const arrival = summary.endingArrival || summary.arrival;
  const failed = summary.endingId === 'contact-lost' || summary.endingId === 'tower-lost'
    || (!century && ['sacrifice', 'helped'].includes(summary.endingId)
      && ['defeated', 'timed-out'].includes(arrival));
  return {
    title: failed ? 'GAME OVER' : 'THE END',
    endingTitle: def?.variantTitle || def?.title || String(summary.endingId || 'RETURN').toUpperCase(),
    state: failed ? 'GAME OVER' : 'THE END',
    residue: century ? 'Demolition stayed for one hundred years.' : residue[summary.endingId] || '',
    save: saveStatus === 'saved' ? 'PROGRESS SAVED'
      : saveStatus === 'saving' ? 'SAVING PROGRESS'
        : saveStatus === 'failed' ? 'PROGRESS COULD NOT BE SAVED' : '',
  };
}

export function returnExposureLayout({ cols = 80, rows = 30, title = '', actions = [] } = {}) {
  const tiny = rows < 16;
  const pad = tiny ? 1 : cols < 42 ? 2 : Math.max(3, Math.floor(cols * .06));
  const width = Math.max(10, cols - pad * 2);
  const scale = tiny ? 1 : cols < 42 ? 1.65 : cols < 90 ? 2.6 : 3.4;
  const titleLines = uiWrap(title, Math.max(8, Math.floor(width / scale)));
  const lineStep = tiny ? 1 : Math.max(1.4, scale * 1.45);
  const actionsY = Math.max(1, rows - actions.length - (tiny ? 1 : 3));
  const textY = tiny ? 0 : Math.max(1, Math.min(rows * .54, actionsY - titleLines.length * lineStep - 5));
  return { x: pad, width, scale, titleLines, lineStep, textY, actionsY, tiny };
}

// The snapshot is the final world output and already includes its dither. It
// is sampled once, without another quantizer or a synthetic replacement room.
export function drawReturnExposure({ summary, snapshot = null, elapsed = 0, saveStatus = 'unknown', actions = [], selected = 0, hitRegions = null } = {}) {
  const { cols, rows } = uiSize();
  const identity = returnExposureIdentity(summary, saveStatus);
  const layout = returnExposureLayout({ cols, rows, title: identity.title, actions });
  const a = clamp01(elapsed / 2.2);
  const fade = a * a * (3 - 2 * a);
  uiFill(0, 0, cols, rows, '#020403');
  uiDraw(({ ctx }) => {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const sw = snapshot?.naturalWidth || snapshot?.width || 0;
    const sh = snapshot?.naturalHeight || snapshot?.height || 0;
    if (sw && sh) {
      // Preserve the whole ending composition, including bodies at its edges.
      const scale = Math.min(w / sw, h / sh);
      const dw = sw * scale, dh = sh * scale;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha *= fade * .82;
      ctx.drawImage(snapshot, (w - dw) / 2, (h - dh) / 2, dw, dh);
      ctx.restore();
    }
    const g = ctx.createLinearGradient(0, h * .28, 0, h);
    g.addColorStop(0, 'rgba(2,4,3,0)');
    g.addColorStop(.46, 'rgba(2,4,3,.72)');
    g.addColorStop(1, '#020403');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  const textAlpha = fade;
  let y = layout.textY;
  for (const line of layout.titleLines) {
    drawVfdText(layout.x, y, line, { scale: layout.scale, max: layout.width, alpha: textAlpha, color: UI_COLOR.primary });
    y += layout.lineStep;
  }
  const compact = rows < 24;
  // The hero already says GAME OVER or THE END. A second status line would
  // repeat it; the named ending belongs only in the optional account/history.
  const stateLines = !layout.tiny && identity.save ? uiWrap(identity.save, layout.width) : [];
  if (!compact && identity.residue) {
    for (const line of uiWrap(identity.residue, layout.width)) {
      if (y + stateLines.length + 1 >= layout.actionsY) break;
      uiText(layout.x, y++, line, 'ui-primary', textAlpha * .85);
    }
    y += .5;
  }
  stateLines.forEach((line, index) => uiText(layout.x, Math.min(layout.actionsY - stateLines.length - .5, y) + index, line, 'ui-secondary', textAlpha * .9));
  if (elapsed < 2.2) return { identity, layout };
  actions.forEach((entry, index) => {
    const ay = layout.actionsY + index;
    const label = `${index === selected ? '▸' : ' '} ${entry.label}`;
    uiText(layout.x, ay, label, index === selected ? 'ui-amber' : 'ui-secondary', entry.disabled ? .4 : 1, layout.width);
    hitRegions?.add({ id: entry.id, x: layout.x, y: ay - .15, w: layout.width, h: 1.05, disabled: entry.disabled, label: entry.label });
  });
  return { identity, layout };
}
