// The gate itself. It stands ahead of lens calibration, because calibration is
// the moment the model weights are first asked to do work. Declining is a real
// option and it closes the game: the EULA says do not use the Game if you do
// not agree, so the button has to mean that.
import * as scenes from './scenes.js';
import { uiCenter, uiFill, uiSize, uiText, uiWrap, uiStrokeRect } from '../render/ui.js';
import { UI_COLOR } from '../render/palette.js';
import { drawMachinePanel } from '../render/presentation.js';
import { eulaPreamble, eulaSections, eulaVersion } from './eula.js';
import { EULA_TEXT } from './eula-text.js';

const AGREEMENT_TITLE = 'END USER LICENCE AGREEMENT';
const FIRST_RUN_NOTICE = 'This game generates its materials locally with bundled AI models. Their licence requires you to read and accept these terms first.';

export function makeEulaScene({
  onAccept = () => {},
  onDecline = () => {},
  reviewOnly = false,
  text = EULA_TEXT,
} = {}) {
  const version = eulaVersion(text);
  // Acceptance applies to the whole agreement. The old first-run view only
  // selected the three model clauses (Sections 5–7), which made the EULA look
  // truncated even though the remaining sections shipped in the file.
  const sections = eulaSections(text);
  const preamble = eulaPreamble(text);
  let scroll = 0;
  let selected = 0;
  let maxScroll = 0;
  let scene = null;

  const close = () => { scenes.remove(scene); };

  function lines(width) {
    const out = [];
    for (const paragraph of preamble) {
      for (const line of uiWrap(paragraph, width)) out.push({ text: line, role: 'ui-primary' });
      out.push({ text: '', role: 'ui-secondary' });
    }
    for (const section of sections) {
      out.push({ text: section.title.toUpperCase(), role: 'ui-amber' });
      out.push({ text: '', role: 'ui-secondary' });
      for (const paragraph of section.lines) {
        for (const line of uiWrap(paragraph, width)) out.push({ text: line, role: 'ui-primary' });
      }
      out.push({ text: '', role: 'ui-secondary' });
    }
    return out;
  }

  scene = {
    id: 'eula',
    blocksInput: true,
    blocksWorld: true,
    lookProfile: 'calm',
    view() { return { version, reviewOnly, scroll, selected, sections: sections.length }; },
    key(event) {
      event.preventDefault?.();
      const key = event.key;
      if (key === 'ArrowDown' || key === 's') { scroll = Math.min(maxScroll, scroll + 1); return true; }
      if (key === 'ArrowUp' || key === 'w') { scroll = Math.max(0, scroll - 1); return true; }
      if (key === 'PageDown') { scroll = Math.min(maxScroll, scroll + 10); return true; }
      if (key === 'PageUp') { scroll = Math.max(0, scroll - 10); return true; }
      if (reviewOnly) {
        if (key === 'Escape' || key === 'Enter' || key === ' ' || key === 'Tab' || event.controllerAction === 'back') close();
        return true;
      }
      if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Tab' || key === 'a' || key === 'd') {
        selected = selected ? 0 : 1;
        return true;
      }
      if (key === 'Enter' || key === ' ' || event.controllerAction === 'confirm') {
        if (selected === 0) { close(); onAccept(version); }
        else onDecline();
      }
      return true;
    },
    pointer(event) {
      if (event.type !== 'pointerdown' || reviewOnly) return true;
      const y = Math.floor(Number(event.cellY));
      const hit = scene.buttonRows?.find((row) => row.y === y);
      if (hit) {
        selected = hit.index;
        if (hit.index === 0) { close(); onAccept(version); } else onDecline();
      }
      return true;
    },
    render() {
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, 'rgba(2,2,3,0.98)');
      const width = Math.min(96, cols - 4);
      const x = Math.floor((cols - width) / 2);
      const footer = reviewOnly
        ? '[↑↓] SCROLL · [ESC] CLOSE'
        : '[↑↓] SCROLL · [←→] CHOOSE · [ENTER] CONFIRM';
      const panel = drawMachinePanel(x, 1, width, rows - 2, {
        label: 'LICENCE', source: 'EULA', meter: false, footer,
      });

      const stamp = `VERSION ${version}`;
      const splitHeading = AGREEMENT_TITLE.length + stamp.length + 2 > panel.w;
      uiText(panel.x, panel.y, AGREEMENT_TITLE.slice(0, panel.w), 'ui-amber');
      uiText(
        splitHeading ? panel.x : panel.x + panel.w - stamp.length,
        panel.y + (splitHeading ? 1 : 0),
        stamp.slice(0, panel.w),
        'ui-secondary',
        .7,
      );

      const headingRows = splitHeading ? 2 : 1;
      const noticeLines = reviewOnly ? [] : uiWrap(FIRST_RUN_NOTICE, panel.w);
      noticeLines.forEach((line, index) => {
        uiText(panel.x, panel.y + headingRows + index, line, 'ui-secondary', .78);
      });
      if (!reviewOnly && noticeLines.length) {
        const markerY = panel.y + headingRows + noticeLines.length;
        uiText(panel.x, markerY, `FULL AGREEMENT · ${sections.length} SECTIONS`, 'ui-label', .65);
      }

      const bodyTop = panel.y + headingRows + noticeLines.length + (reviewOnly ? 1 : 2);
      const bodyBottom = panel.y + panel.h - (reviewOnly ? 2 : 4);
      const bodyHeight = Math.max(3, bodyBottom - bodyTop);
      const all = lines(panel.w - 2);
      maxScroll = Math.max(0, all.length - bodyHeight);
      scroll = Math.min(scroll, maxScroll);
      all.slice(scroll, scroll + bodyHeight).forEach((line, index) => {
        if (line.text) uiText(panel.x, bodyTop + index, line.text.slice(0, panel.w), line.role, line.role === 'ui-primary' ? .88 : .8);
      });
      if (maxScroll > 0) {
        const barTop = bodyTop + Math.round((bodyHeight - 1) * (scroll / maxScroll));
        uiText(panel.x + panel.w, bodyTop, '▲', 'ui-secondary', scroll > 0 ? .8 : .25);
        uiText(panel.x + panel.w, barTop, '█', 'ui-amber', .7);
        uiText(panel.x + panel.w, bodyTop + bodyHeight - 1, '▼', 'ui-secondary', scroll < maxScroll ? .8 : .25);
      }

      scene.buttonRows = [];
      if (reviewOnly) {
        uiCenter(panel.y + panel.h - 1, 'THE FULL AGREEMENT SHIPS AS EULA.md WITH THE GAME', 'ui-secondary', .6);
        return;
      }
      const buttonY = panel.y + panel.h - 2;
      const labels = ['I ACCEPT', 'DECLINE AND QUIT'];
      let bx = panel.x;
      labels.forEach((label, index) => {
        const active = index === selected;
        uiText(bx, buttonY, `${active ? '▶ ' : '  '}${label}`, active ? (index ? 'ui-danger' : 'ui-primary') : 'ui-secondary', active ? 1 : .6);
        if (active) uiStrokeRect(bx - .4, buttonY - .1, label.length + 3, 1.2, index ? UI_COLOR.danger : UI_COLOR.amber, .6, 1);
        scene.buttonRows.push({ index, y: buttonY, x: bx, w: label.length + 3 });
        bx += label.length + 8;
      });
      const note = 'ACCEPTING RECORDS ONLY THIS VERSION NUMBER, LOCALLY.';
      uiText(panel.x + Math.max(0, panel.w - note.length), buttonY, note, 'ui-secondary', .5);
    },
  };
  return scene;
}
