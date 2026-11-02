import { uiSize, uiCellMetrics, uiWrap } from '../render/ui.js';
import { CREDITS } from '../data/credits.js';
import { creditSignalLayout, wrapCreditSignalText, renderCreditSignal, renderCreditSignalControls, renderCreditRecord, creditRecordLayout, warmCreditRecordFont } from '../render/credit-signal.js';
import { createCreditProgram, creditRecordPages, CREDIT_PROGRAM_BLACK_HOLD } from './credit-program.js';
import * as AUDIO from '../audio/story-audio.js';

export const END_CREDITS_OPENING_DURATION = 3.8;
export const END_CREDITS_CLOSING_HOLD = 4;
export const CLOSING_QUOTE = Object.freeze({ fadeIn: 2.4, hold: 6.4, fadeOut: 3 });
const QUOTE_SECONDS = CLOSING_QUOTE.fadeIn + CLOSING_QUOTE.hold + CLOSING_QUOTE.fadeOut;
const QUOTE = 'There is no security against the ultimate development of mechanical consciousness, in the fact of machines possessing little consciousness now.';
const ATTRIBUTION = ['SAMUEL BUTLER · EREWHON', 'THE BOOK OF THE MACHINES'];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));
const smooth = n => { const t = clamp(n, 0, 1); return t * t * (3 - 2 * t); };
export function closingQuoteAlpha(elapsed) {
  const t = Math.max(0, Number(elapsed) || 0);
  return t < CLOSING_QUOTE.fadeIn ? smooth(t / CLOSING_QUOTE.fadeIn)
    : t < CLOSING_QUOTE.fadeIn + CLOSING_QUOTE.hold ? 1
      : 1 - smooth((t - CLOSING_QUOTE.fadeIn - CLOSING_QUOTE.hold) / CLOSING_QUOTE.fadeOut);
}
export function closingQuoteBlock(width = 46) {
  const wrap = text => uiWrap(text, Math.max(18, Math.floor(width)));
  const quote = wrap(QUOTE), attribution = ATTRIBUTION.flatMap(wrap);
  return { quote, attribution, lines: [...quote, '', ...attribution] };
}

export function makeCreditsScene({ credits = CREDITS, context = 'menu', onDone, onWebsite, onQuote, onBlack,
  suppressSoundtrack = false, quietEnding = false, soundtrack = AUDIO, getMusicPosition = null,
  getPresentationHeld = null, openingDuration = END_CREDITS_OPENING_DURATION,
  closingHold = END_CREDITS_CLOSING_HOLD, initialCols = 80, initialRows = 30 } = {}) {
  const presentationContext = context === 'ending' ? 'ending' : 'menu';
  let cols = initialCols, rows = initialRows, cellW = 8.45, cellH = 20;
  let programme, record, phase = 'opening', card = 0, cardElapsed = 0, cardDuration = 0;
  let elapsed = 0, phaseElapsed = 0, paused = false, done = false, quoteFired = false, blackFired = false;
  let reader = false, section = 0, page = 0, focus = 'pause', pointerDown = null, manualEnd = false;
  let cachedSize = '', hits = [];
  const held = new Set();
  const metrics = () => ({ cols, rows, cellW, cellH });
  const finalSeconds = () => quietEnding ? 0 : QUOTE_SECONDS + CREDIT_PROGRAM_BLACK_HOLD;

  function refresh(nextCols = cols, nextRows = rows, nextCellW = cellW, nextCellH = cellH) {
    cols = Math.max(20, Math.floor(nextCols)); rows = Math.max(8, Math.floor(nextRows));
    cellW = Number(nextCellW) || 8.45; cellH = Number(nextCellH) || 20;
    const key = `${cols}:${rows}:${cellW}:${cellH}`;
    if (key === cachedSize) return;
    cachedSize = key;
    const oldCard = programme?.cards[card], oldId = oldCard?.id;
    const recordAnchor = record?.[section]?.pages[page]?.fragments[0];
    programme = createCreditProgram({ credits, quiet: quietEnding, openingSeconds: openingDuration,
      closingSeconds: closingHold, quoteSeconds: QUOTE_SECONDS, paginate(item) {
        const measured = creditSignalLayout({ ...metrics(), label: item.label, lines: item.lines, kind: item.kind || 'body' });
        const width = measured.bodyWidthPx || measured.box.w * cellW;
        const lines = item.lines.flatMap(line => wrapCreditSignalText(line, width, measured.bodyFontPx));
        const capacity = Math.max(1, measured.maxBodyLines);
        const pages = [];
        for (let i = 0; i < lines.length; i += capacity) pages.push(lines.slice(i, i + capacity));
        return pages.length ? pages : [[]];
      } });
    if (oldId) {
      let found = programme.cards.findIndex(item => item.id === oldId);
      if (found < 0) found = programme.cards.findIndex(item => item.id.split('-page-')[0] === oldId.split('-page-')[0]);
      if (found >= 0) card = found;
    }
    card = clamp(card, 0, Math.max(0, programme.cards.length - 1));
    if (phase === 'card') { phaseElapsed = 0; cardElapsed = 0; cardDuration = durationFor(card); }
    record = creditRecordPages({ credits,
      capacity(item) { return Math.max(1, creditRecordLayout({ ...metrics(), heading: item.heading, lines: [] }).maxBodyLines); },
      wrapLine(text, item) {
        const measured = creditRecordLayout({ ...metrics(), heading: item.heading, lines: [] });
        return wrapCreditSignalText(text, measured.bodyWidthPx || measured.box.w * cellW,
          measured.bodyFontPx, { uppercase: false });
      } });
    section = clamp(section, 0, Math.max(0, record.length - 1));
    if (recordAnchor) {
      const pages = record[section]?.pages || [];
      let found = pages.findIndex(item => item.fragments.some(fragment => fragment.sourceLineIndex === recordAnchor.sourceLineIndex && fragment.fragmentIndex === recordAnchor.fragmentIndex));
      if (found < 0) found = pages.findIndex(item => item.fragments.some(fragment => fragment.sourceLineIndex === recordAnchor.sourceLineIndex));
      if (found >= 0) page = found;
    }
    page = clamp(page, 0, Math.max(0, (record[section]?.pages.length || 1) - 1));
  }
  refresh();

  function musicState() {
    if (manualEnd || presentationContext !== 'ending' || typeof getMusicPosition !== 'function') return null;
    let state; try { state = getMusicPosition(); } catch { return null; }
    if (!state || state.failed || state.paused || typeof state.duration !== 'number' || typeof state.currentTime !== 'number'
      || !Number.isFinite(state.duration) || state.duration <= 0 || !Number.isFinite(state.currentTime) || state.currentTime < 0) return null;
    if (state.ended === true || state.currentTime >= state.duration) return { remaining: 0, ended: true };
    return state.playing === true ? { remaining: state.duration - state.currentTime, ended: false } : null;
  }
  function durationFor(index) {
    const item = programme.cards[index]; if (!item) return 0;
    const music = musicState();
    if (!music) return item.duration;
    if (music.ended) return item.minHold;
    const nominal = programme.cards.slice(index).reduce((sum, current) => sum + current.duration, 0);
    const budget = Math.max(0, music.remaining - closingHold - finalSeconds());
    return Math.max(item.minHold, item.duration * budget / Math.max(.001, nominal));
  }
  function fireQuote() { if (!quoteFired && presentationContext === 'ending') { quoteFired = true; onQuote?.(); } }
  function fireBlack() { if (!blackFired) { blackFired = true; onBlack?.(); } }
  function finish() { if (!done) { done = true; fireQuote(); fireBlack(); onDone?.(); } return true; }
  function enterCard(index, manual = false) {
    card = clamp(index, 0, Math.max(0, programme.cards.length - 1));
    phase = 'card'; phaseElapsed = 0; cardElapsed = 0; cardDuration = durationFor(card);
    if (manual) { paused = true; manualEnd = false; }
  }
  function moveCard(delta) {
    if (!programme.cards.length) return;
    enterCard(phase === 'opening' ? 0 : phase === 'closing' || phase === 'quote' || phase === 'black'
      ? programme.cards.length - 1 : card + delta, true);
  }
  function openRecord() { reader = true; section = programme.cards[card]?.sectionIndex || 0; page = 0; focus = 'programme'; }
  function moveSection(delta) { section = clamp(section + delta, 0, Math.max(0, record.length - 1)); page = 0; }
  function movePage(delta) {
    const pages = record[section]?.pages || [];
    if (page + delta < 0 && section > 0) { section--; page = record[section].pages.length - 1; }
    else if (page + delta >= pages.length && section < record.length - 1) { section++; page = 0; }
    else page = clamp(page + delta, 0, Math.max(0, pages.length - 1));
  }
  function actions() {
    return reader ? [
      { id: 'section-prev', label: 'PREV SECTION', disabled: section === 0 },
      { id: 'page-prev', label: 'PREV', disabled: section === 0 && page === 0 },
      { id: 'page-next', label: 'NEXT', disabled: section === record.length - 1 && page === (record[section]?.pages.length || 1) - 1 },
      { id: 'section-next', label: 'NEXT SECTION', disabled: section === record.length - 1 },
      { id: 'programme', label: 'PROGRAMME' }, { id: 'website', label: 'WEBSITE' },
      { id: 'back', label: presentationContext === 'ending' ? 'SKIP' : 'BACK' },
    ] : [
      { id: 'prev', label: 'PREV', disabled: phase === 'opening' },
      { id: 'pause', label: paused ? 'RESUME' : 'PAUSE' },
      { id: 'next', label: 'NEXT', disabled: phase === 'black' },
      { id: 'record', label: 'RELEASE RECORD' }, { id: 'website', label: 'WEBSITE' },
      { id: 'back', label: presentationContext === 'ending' ? 'SKIP' : 'BACK' },
    ];
  }
  function activate(id) {
    if (actions().find(item => item.id === id)?.disabled) return;
    if (id === 'back') finish();
    else if (id === 'website') { paused = true; onWebsite?.(); }
    else if (id === 'record') openRecord();
    else if (id === 'programme') { reader = false; focus = 'pause'; }
    else if (id === 'pause') paused = !paused;
    else if (id === 'prev') moveCard(-1);
    else if (id === 'next') {
      if (phase === 'card' && card === programme.cards.length - 1 || phase === 'closing' || phase === 'quote') {
        phase = 'closing'; phaseElapsed = 0; manualEnd = true; paused = true;
      } else moveCard(1);
    } else if (id === 'section-prev') moveSection(-1);
    else if (id === 'section-next') moveSection(1);
    else if (id === 'page-prev') movePage(-1);
    else if (id === 'page-next') movePage(1);
  }
  function moveFocus(delta) {
    const available = actions().filter(item => !item.disabled);
    let index = available.findIndex(item => item.id === focus);
    index = (index + delta + available.length) % available.length;
    focus = available[index]?.id || 'pause';
  }
  return {
    id: 'credits', handlesEscape: true, blocksInput: true, blocksWorld: true, lensPreset: 'calm',
    enter() { void warmCreditRecordFont(); if (!suppressSoundtrack) soundtrack.startSoundtrack({ track: 'credits', fade: 2.2 }); },
    exit() { if (!suppressSoundtrack) soundtrack.fadeSoundtrack({ fade: 3.2 }); held.clear(); pointerDown = null; },
    resume() { held.clear(); pointerDown = null; },
    update(dt = 0) {
      if (done || reader || paused) return;
      if (typeof getPresentationHeld === 'function') { try { if (getPresentationHeld()) return; } catch {} }
      let remaining = Math.max(0, Number(dt) || 0); elapsed += remaining;
      // Consume bounded phase transitions, not the browser's frame count. A
      // stall cannot skip callbacks or leave the final frame stranded.
      for (let guard = 0; remaining > 0 && guard < programme.cards.length + 8 && !done; guard++) {
        let duration = phase === 'opening' ? openingDuration : phase === 'card' ? cardDuration
          : phase === 'closing' ? closingHold : phase === 'quote' ? QUOTE_SECONDS : CREDIT_PROGRAM_BLACK_HOLD;
        if (phase === 'closing' && !manualEnd) {
          const music = musicState();
          if (music && !music.ended) duration = Math.max(duration, phaseElapsed + music.remaining - finalSeconds());
        }
        const used = Math.min(remaining, Math.max(0, duration - phaseElapsed));
        phaseElapsed += used; if (phase === 'card') cardElapsed = phaseElapsed; remaining -= used;
        if (phaseElapsed < duration - 1e-7) break;
        if (phase === 'opening') enterCard(0);
        else if (phase === 'card') {
          if (card < programme.cards.length - 1) enterCard(card + 1);
          else { phase = 'closing'; phaseElapsed = 0; }
        } else if (phase === 'closing') {
          if (presentationContext === 'menu') break;
          if (quietEnding) { finish(); break; }
          phase = 'quote'; phaseElapsed = 0; fireQuote();
        } else if (phase === 'quote') { phase = 'black'; phaseElapsed = 0; fireBlack(); }
        else finish();
      }
    },
    key(e = {}) {
      if (done) return true;
      const key = e.key || '', code = e.code || '', lower = key.toLowerCase();
      const token = e.controllerAction || code || key;
      const directional = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(key);
      if (!directional) { if (e.repeat || held.has(token)) return true; held.add(token); }
      if (key === 'Escape' || code === 'Escape' || key === 'Backspace' || e.controllerAction === 'back') {
        if (reader) { reader = false; focus = 'record'; } else finish(); return true;
      }
      if (key === 'Tab' || e.controllerAction === 'tabPrev' || e.controllerAction === 'tabNext') { moveFocus(e.shiftKey || e.controllerAction === 'tabPrev' ? -1 : 1); return true; }
      if (key === 'ArrowUp' || key === 'ArrowDown') { moveFocus(key === 'ArrowUp' ? -1 : 1); return true; }
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const delta = key === 'ArrowLeft' ? -1 : 1;
        if (reader) movePage(delta); else moveCard(delta); return true;
      }
      if (key === 'PageUp' || key === 'PageDown') {
        const delta = key === 'PageUp' ? -1 : 1;
        if (reader) moveSection(delta); else moveCard(delta); return true;
      }
      if (key === 'Home') { if (reader) { section = 0; page = 0; } else enterCard(0, true); return true; }
      if (key === 'End') {
        if (reader) { section = Math.max(0, record.length - 1); page = Math.max(0, (record[section]?.pages.length || 1) - 1); }
        else { phase = 'closing'; phaseElapsed = 0; manualEnd = true; paused = true; }
        return true;
      }
      if (lower === 'r' && !e.controller) { if (reader) { reader = false; focus = 'record'; } else openRecord(); return true; }
      if (key === ' ' || code === 'Space') { if (!reader) paused = !paused; return true; }
      if (key === 'Enter' || code === 'Enter' || e.controllerAction === 'confirm') activate(focus);
      return true;
    },
    keyup(e = {}) { held.delete(e.controllerAction || e.code || e.key || ''); return true; },
    pointer(e = {}) {
      const hit = hits.find(item => !item.disabled && e.cellX >= item.x && e.cellX < item.x + item.w && e.cellY >= item.y && e.cellY < item.y + item.h);
      if (e.type === 'pointermove' && hit) focus = hit.id;
      if (e.type === 'pointerdown') { pointerDown = hit?.id || null; if (hit) focus = hit.id; }
      if (e.type === 'pointerup') { const id = pointerDown; pointerDown = null; if (hit && id === hit.id) activate(id); }
      if (e.type === 'pointercancel') pointerDown = null;
      return true;
    },
    resize(nextCols, nextRows) { refresh(nextCols, nextRows); },
    view() { return { id: 'credits', context: presentationContext, phase: reader ? 'record' : phase,
      programmePhase: phase, paused, elapsed, card, cards: programme.cards.length, cardElapsed, cardDuration,
      programmeSeconds: programme.totalSeconds, section, sections: record.length, page,
      pages: record[section]?.pages.length || 0, focus, done,
      hitRegions: hits.map(item => ({id:item.id,x:item.x,y:item.y,w:item.w,h:item.h,disabled:!!item.disabled})),
      sourceLines: record.reduce((sum, item) => sum + item.sourceLines.length, 0),
      content: reader ? record[section]?.pages[page] : programme.cards[card], controls: actions() }; },
    render() {
      const size = uiSize(), metric = uiCellMetrics();
      if (size.cols > 0 && size.rows > 0) refresh(size.cols, size.rows, metric.cellW || metric.w, metric.cellH || metric.h);
      if (reader) {
        const current = record[section], currentPage = current?.pages[page];
        renderCreditRecord({ heading: current?.heading || 'RELEASE RECORD', lines: currentPage?.lines || [],
          sectionLabel: `RELEASE RECORD · ${section + 1}/${record.length}`, pageLabel: `PAGE ${page + 1}/${current?.pages.length || 1}` });
      } else if (phase === 'quote') {
        renderCreditSignal({ label: '', lines: [QUOTE], attribution: ATTRIBUTION, kind: 'quote', alpha: paused ? 1 : closingQuoteAlpha(phaseElapsed), quiet: quietEnding });
      } else if (phase === 'black' || done) renderCreditSignal({ lines: [], alpha: 0, quiet: true });
      else if (phase === 'opening') renderCreditSignal({ label: 'RELEASE CREDITS', lines: ['CHUNK SURFER'],
        attribution: ['A HAUNTING AT ELLERY CONSERVATOIRE'], kind: 'names', alpha: smooth(phaseElapsed / .75), quiet: quietEnding });
      else if (phase === 'closing') renderCreditSignal({ label: 'END OF RECORD', lines: ['THANK YOU FOR LISTENING.'],
        attribution: ['CBASSUAREZ.COM'], kind: 'names', quiet: quietEnding });
      else {
        const item = programme.cards[card], fade = paused ? 1 : Math.min(smooth(cardElapsed / .65), smooth((cardDuration - cardElapsed) / .65));
        renderCreditSignal({ label: item?.label || '', lines: item?.lines || [], kind: item?.kind || 'body', alpha: fade,
          time: elapsed, transition: 1 - fade, quiet: quietEnding });
      }
      // Controls retain their own fixed coordinates; website is an intentional
      // focus target, never the default action for narrative advance.
      hits = phase === 'black' || done ? [] : renderCreditSignalControls(actions(), { activeId: focus }) || [];
    },
  };
}
