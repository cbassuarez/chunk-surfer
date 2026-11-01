import { uiSize, uiText, uiWrap, uiFill, uiScrim, uiDraw, uiCellMetrics } from './ui.js';
import { radioContactFrame, RADIO_DESK_CHANNEL } from './radio-contact-performance.js';
import { drawRadioContact3D, radioContactControlRects, radioContact3DDiagnostics } from './radio-contact-3d.js';
import { promptLine } from '../game/bindings.js';
import { registerReviewRegion } from '../game/local-text-review.js';

// The same numbers which appear beside replies are shortcuts. Contact is
// deliberately different: a number only selects, and a sustained press is
// needed to transmit. Describe that exception before any key is pressed.
export function radioChoiceFooter(view = {}) {
  const radio = view.radio || {}, count = view.pending?.options?.length || 0;
  const numbers = count ? (count === 1 ? '1' : `1–${count}`) : '';
  const channel=radio.instrument?.channel;
  if (channel && channel !== RADIO_DESK_CHANNEL) return promptLine([
    ...(radio.canTune ? ['←/→ CHANNEL'] : ['NO CARRIER']),
    ...(!radio.terminal ? [{ action: 'radio', label: 'LOWER' }] : []),
  ]);
  if (radio.contact && count) return promptLine([
    `${numbers} SELECT`, { action: 'select', label: 'SELECT' },
    { action: 'confirm', label: 'HOLD TO TRANSMIT' },
  ]);
  return promptLine([
    ...(count ? [`${numbers} TRANSMIT`, { action: 'select', label: 'SELECT' }] : []),
    { action: 'confirm', label: count ? 'TRANSMIT' : radio.ready ? 'CONTINUE' : 'LISTEN' },
    ...(!radio.terminal ? [{ action: 'radio', label: 'LOWER' }] : []),
  ]);
}

// Keep each physical key legend and its action together on narrow displays;
// ordinary word wrapping can split "[ENTER / SPACE]" across two rows.
export function radioChoiceFooterLines(view = {}, width = 80) {
  const pack = parts => {
    const lines = [];
    for (const part of parts) {
      const tail = lines.at(-1);
      if (!tail || tail.length + 3 + part.length > width) lines.push(part);
      else lines[lines.length - 1] = `${tail} · ${part}`;
    }
    return lines;
  };
  const full = radioChoiceFooter(view).split(' · '), lines = pack(full);
  if (lines.length <= 2) return lines;
  // At compact sizes the numbered cursor still shows selection, so the redundant
  // arrow-key hint can go before the commit and exit instructions do.
  const compact = full.filter(part => !part.endsWith('] SELECT'));
  if (view.radio?.contact) {
    const index = compact.findIndex(part => part.endsWith(' HOLD TO TRANSMIT'));
    if (index >= 0 && compact[index].length > width) {
      const key = compact[index].slice(0, -' HOLD TO TRANSMIT'.length);
      compact[index] = `HOLD ${key} TO SEND`;
    }
  }
  const exit = compact.findIndex(part => part.endsWith('] LOWER'));
  if (exit > 0) compact.splice(1, 0, ...compact.splice(exit, 1));
  return pack(compact);
}

function radioChoiceText(choice = {}) {
  const tag = choice.tag ? `[${String(choice.tag).toUpperCase()}] ` : '';
  return `${choice.archiveSignal ? '◆ ' : ''}${tag}${String(choice.text || '')}`;
}

// Dialogue lives beside the carried radio. The physical LCD contains channel
// and carrier information only; it is never another transcript screen.
export function radioSceneLayout({ cols = 120, rows = 38 } = {}, view = {}) {
  cols = cols > 4 ? cols : 120; rows = rows > 4 ? rows : 38;
  const margin = 2, footerY = rows - 2, lineStep = 1.1;
  const options = view.pending?.options || [];
  // The model keeps a useful physical height when text is enlarged. A short
  // viewport borrows the lower foreground for captions instead of compressing
  // a 3D object and every one of its controls into a one-row ribbon.
  const measure = width => {
    const lines = uiWrap(radioCaptionText(view), width);
    const heights = options.map(choice => Math.max(1.75, uiWrap(radioChoiceText(choice), width - 4).length * lineStep + .4));
    return { lines, heights, total: heights.reduce((sum, h) => sum + h + .35, 0) };
  };
  const sideW = Math.max(20, Math.floor(cols * .47) - 5);
  const side = measure(sideW);
  const overlaid = cols < 54 || side.lines.length * lineStep + side.total + 5.6 > rows;
  const x = cols >= 90 ? 4 : margin, w = overlaid ? cols - x - margin : sideW;
  const { lines, heights, total } = overlaid ? measure(w) : side;
  let choiceY = footerY - 1 - total;
  const choices = options.map((choice, index) => {
    const rect = { x, y: choiceY, w, h: heights[index], choice };
    choiceY += rect.h + .35; return rect;
  });
  const bottom = (choices[0]?.y ?? footerY - .7) - .7;
  const textHeight = Math.max(1, lines.length) * lineStep;
  const textY = Math.max(2.2, overlaid ? bottom - textHeight : Math.min(8, bottom - textHeight));
  const stage = { x: cols * .40, y: .5, w: cols * .60 - .75, h: rows - 3 };
  // Only ink receives a local wash. These same regions keep a click on a
  // caption from reaching an obscured physical button behind it.
  const captionRects = lines.map((line, i) => ({ x: x - .55, y: textY + i * lineStep - .18,
    w: Math.min(w, line.length) + 1.1, h: 1.38 }));
  const choiceInk = choices.flatMap(rect => [
    { x: rect.x - .55, y: rect.y - .12, w: 4.1, h: 1.45 },
    ...uiWrap(radioChoiceText(rect.choice), rect.w - 4).map((line, i) => ({ x: rect.x + 3.45,
      y: rect.y + i * lineStep - .12, w: line.length + 1.1, h: 1.45 })),
  ]);
  const occlusion = [...captionRects, ...choiceInk, { x: x - .55, y: textY - 1.6, w: Math.min(w, 16) + 1.1, h: 1.35 }];
  const frame = radioContactFrame(view, { reducedMotion: !!view.radio?.reducedMotion });
  const metrics = uiCellMetrics(), cw = metrics.cellW || 8, ch = metrics.cellH || 16;
  const projected = radioContactControlRects({ width: stage.w * cw, height: stage.h * ch, frame });
  const controls = Object.fromEntries(Object.entries(projected).flatMap(([id, r]) => {
    const center = { x: stage.x + r.center.x / cw, y: stage.y + r.center.y / ch };
    if (center.x < stage.x || center.x > stage.x + stage.w || center.y < stage.y || center.y > stage.y + stage.h
      || occlusion.some(o => center.x >= o.x && center.x <= o.x + o.w && center.y >= o.y && center.y <= o.y + o.h)) return [];
    return [[id, { ...r, x: stage.x + r.x / cw, y: stage.y + r.y / ch, w: r.w / cw, h: r.h / ch, center }]];
  }));
  return { x, w, textY, textRows: Math.max(1, lines.length), lineStep, lines, choices,
    choiceTextInset: 4, overlaid, captionRects, occlusionRects: occlusion, stage, portrait: stage, controls, footerY,
    panel: { x: 1, y: 1, w: cols - 2, h: rows - 2 } };
}

function radioCaptionText(view, typed = false) {
  const channel = view.radio?.instrument?.channel;
  if (channel && channel !== RADIO_DESK_CHANNEL) return 'No front desk carrier. Channel two is still there.';
  return String(view.line?.text || '').slice(0, typed ? view.typed ?? Infinity : Infinity);
}

// A feathered strip follows the ink rather than enclosing the conversation.
// The room and instrument remain visible between lines and around short words.
function captionWash(x, y, text, max) {
  if (!String(text).trim()) return;
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const left = Math.max(0, x - .65) * cellW * dpr;
    const width = (Math.min(max, String(text).length) + 1.3) * cellW * dpr;
    const top = (y - .22) * cellH * dpr;
    const shade = ctx.createLinearGradient(left, 0, left + width, 0);
    shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(.09, 'rgba(0,0,0,.44)');
    shade.addColorStop(.88, 'rgba(0,0,0,.44)'); shade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shade; ctx.fillRect(left, top, width, 1.45 * cellH * dpr);
  });
}

export function drawRadioScene(view, { reducedMotion = false } = {}) {
  const radio = view.radio || {}, layout = radioSceneLayout(uiSize(), view);
  const source = ['radio', 'martin'].includes(String(view.who).toLowerCase()) ? 'MARTIN'
    : ['me', 'you'].includes(String(view.who).toLowerCase()) ? 'YOU' : '';
  const instrument = radio.instrument || {}, offChannel = instrument.channel && instrument.channel !== RADIO_DESK_CHANNEL;
  const frame = radioContactFrame(view, { reducedMotion });
  uiScrim(.18);
  let drawn = false;
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const r = layout.stage, x = r.x * cellW * dpr, y = r.y * cellH * dpr;
    ctx.save();
    try {
      ctx.beginPath(); ctx.rect(x, y, r.w * cellW * dpr, r.h * cellH * dpr); ctx.clip();
      drawn = drawRadioContact3D({ ctx, x, y, width: r.w * cellW * dpr, height: r.h * cellH * dpr, pixelRatio: dpr, frame });
    } finally { ctx.restore(); }
  });
  // Never flash an unscreened inventory portrait while acquisition loads.
  // Captions and keyboard operation remain available on a device failure.
  if (!drawn) { const r = layout.stage; uiText(r.x + 1, r.y + 3, radioContact3DDiagnostics().error ? 'RADIO VIEW UNAVAILABLE' : 'RAISING RADIO…', 'ui-label', .7); }
  const dead = frame.dead;
  const label = dead ? 'NO CARRIER' : offChannel ? `CHANNEL ${String(instrument.channel).padStart(2, '0')}` : source || 'RADIO';
  captionWash(layout.x, layout.textY - 1.5, label, layout.w);
  uiText(layout.x, layout.textY - 1.5, label, 'ui-label', .85);
  const shown = radioCaptionText(view, true);
  uiWrap(shown, layout.w).slice(-layout.textRows).forEach((line, index) => {
    const y = layout.textY + index * layout.lineStep;
    captionWash(layout.x, y, line, layout.w);
    uiText(layout.x, y, line, source ? 'ui-primary' : 'ui-secondary', 1);
    if (!offChannel && line.trim()) registerReviewRegion(view.line?.reviewTarget,
      { x: layout.x, y, w: Math.min(line.length, layout.w), h: 1, active: view.pending?.kind !== 'branch' });
  });
  layout.choices.forEach((r, index) => {
    const selected = view.pending.index === index;
    const enabled = !offChannel && radio.ready !== false;
    const spent = !!view.spent?.(r.choice);
    // These changing replies are electronic captions beside the instrument.
    // Keep the four-cell inset and response hit rectangle; the radio's actual
    // PTT/keypad remains physical and contact still requires its sustained hold.
    const number = String(index + 1), markerY = r.y + .1;
    const markerAlpha = !enabled ? .48 : selected ? 1 : spent ? .48 : .82;
    const markerRole = selected ? 'ui-amber' : spent ? 'ui-secondary'
      : r.choice.archiveSignal ? 'ui-blue' : 'ui-primary';
    if (selected) uiText(r.x, markerY, '▸', 'ui-amber', enabled ? 1 : .48);
    uiText(r.x + 3 - number.length, markerY, number, markerRole, markerAlpha);
    uiWrap(radioChoiceText(r.choice), r.w - layout.choiceTextInset).forEach((text, row) => {
      const x = r.x + layout.choiceTextInset, y = r.y + .1 + row * layout.lineStep;
      captionWash(x, y, text, r.w - layout.choiceTextInset);
      const color = selected ? 'ui-primary' : r.choice.archiveSignal ? 'ui-blue' : 'ui-secondary';
      uiText(x, y, text, color, offChannel || spent ? .48 : selected ? 1 : .8);
      if (text.trim()) registerReviewRegion(r.choice.reviewTarget,
        { x, y, w: Math.min(text.length, r.w - layout.choiceTextInset), h: 1, selected });
    });
    if (selected && radio.contact) {
      const progress = Math.max(0, Math.min(1, (Number(radio.hold) || 0) / (radio.holdDuration || .65)));
      uiFill(r.x + 4, r.y + r.h - .14, Math.max(0, r.w - 4), .08, 'rgba(216,179,108,.24)');
      if (progress > 0) uiFill(r.x + 4, r.y + r.h - .14, Math.max(0, r.w - 4) * progress, .08, '#d8b36c');
    }
  });
  radioChoiceFooterLines(view, uiSize().cols - 4).slice(0, 2)
    .forEach((line, i) => uiText(2, layout.footerY + i, line, 'ui-label', .8));
  if (radio.canTune) {
    const hint = '←/→ CHANNEL   −/+ VOLUME', y = layout.stage.y + layout.stage.h - 1;
    if (!layout.overlaid) { captionWash(layout.stage.x + 1, y, hint, layout.stage.w - 2); uiText(layout.stage.x + 1, y, hint, 'ui-label', .8, layout.stage.w - 2); }
  }
  return drawn;
}
