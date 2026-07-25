import * as scenes from './scenes.js';
import { uiFill, uiLine, uiSize, uiText } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { createHitRegions } from '../render/hit-regions.js';
import { drawVfdRow, vfdRowStyle } from '../render/vfd-select.js';
import { UI_COLOR, activeTheme } from '../render/palette.js';
import * as AUDIO from '../audio/story-audio.js';

import { BETA_NOTICE_CATEGORIES, BETA_NOTICE_CONTENT } from '../data/beta-notice.js';
import {
  BETA_NOTICE_TABS,
  BETA_NOTICE_TAB_LABEL,
  makeBetaNoticeState,
  normalizeBetaNoticeContent,
  betaNoticeCategoryId,
  betaNoticeCategoryLabel,
  betaNoticeEntriesFor,
  betaNoticeReduce,
  betaNoticeSeverityLabel,
  betaNoticeStatusLabel,
} from './beta-notice-model.js';

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

const BETA_NOTICE_FOOTER_PARTS = Object.freeze([
  { action: 'tabNext', label: 'SECTION' },
  { action: 'select', label: 'ROW' },
  { action: 'set', label: 'CAT' },
  { action: 'confirm', label: 'REPORT' },
  { action: 'back', label: 'CLOSE' },
]);

const BETA_NOTICE_COMPACT_FOOTER_PARTS = Object.freeze([
  { action: 'tabNext', label: 'SECTION' },
  { action: 'select', label: 'ROW' },
  { action: 'confirm', label: 'REPORT' },
  { action: 'back', label: 'CLOSE' },
]);

function betaNoticeFooterParts(width) {
  return width >= 86 ? BETA_NOTICE_FOOTER_PARTS : BETA_NOTICE_COMPACT_FOOTER_PARTS;
}

function hardWrapCellText(text, width) {
  const safeW = Math.max(1, Math.floor(width || 1));
  const words = String(text ?? '').replace(/[\r\n\t]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';

  for (const word of words) {
    const chunks = [];
    for (let i = 0; i < word.length; i += safeW) {
      chunks.push(word.slice(i, i + safeW));
    }

    for (const chunk of chunks) {
      const next = line ? `${line} ${chunk}` : chunk;
      if (next.length > safeW) {
        if (line) lines.push(line.slice(0, safeW));
        line = chunk;
      } else {
        line = next;
      }
    }
  }

  if (line) lines.push(line.slice(0, safeW));
  return lines;
}

function drawWrappedBlock(x, y, width, maxRows, text, role = 'ui-primary', alpha = 0.86) {
  const w = Math.max(1, Math.floor(width || 1));
  const rows = hardWrapCellText(text, w).slice(0, Math.max(0, Math.floor(maxRows || 0)));
  rows.forEach((line, i) => uiText(x, y + i, line.slice(0, w), role, alpha));
  return rows.length;
}

function betaContentRect(body) {
  const top = body.y + 5;
  const bottom = body.y + body.h - 4;
  return {
    top,
    bottom,
    h: Math.max(8, bottom - top),
  };
}

function safeText(value, fallback = '') {
  const text = String(value ?? fallback).replace(/[\r\n\t]+/g, ' ').trim();
  return text || fallback;
}

function clampText(value, max = 1) {
  return safeText(value).toUpperCase().slice(0, Math.max(0, max));
}

function addButton(hits, { id, x, y, w, h = 1.4, label, onClick, onHover = null, selected = false, danger = false }) {
  hits.add({
    id,
    kind: 'button',
    x,
    y: y - 0.25,
    w: Math.max(1, w),
    h,
    label,
    selected,
    danger,
    onHover,
    onClick,
  });
}

function drawSectionLabel(x, y, label, value, width, role = 'ui-primary') {
  const l = safeText(label).toUpperCase();
  uiText(x, y, l.slice(0, Math.max(0, width)), 'ui-label', 0.70);
  const vx = x + Math.min(l.length + 2, Math.max(0, width - 1));
  if (vx < x + width) uiText(vx, y, safeText(value, '—').toUpperCase().slice(0, x + width - vx), role);
}

function formatBuildRows(buildInfo) {
  const about = typeof buildInfo === 'function' ? buildInfo() : buildInfo;
  const runtime = about?.runtime || {};
  const performance = about?.performance || {};
  const display = about?.display || {};
  const audio = about?.audio || {};
  const storage = about?.storage || {};

  return [
    ['VERSION', about?.version || 'unknown'],
    ['BUILD', about?.build || 'local'],
    ['RUNTIME', `${runtime.mode || 'web'} / ${runtime.platform || 'unknown'}`],
    ['RENDERER', runtime.renderer || 'default'],
    ['LENS', runtime.lens === true ? 'on' : runtime.lens === false ? 'off' : 'unknown'],
    ['PERFORMANCE', performance.fps ? `${Math.round(performance.fps)} fps` : 'measuring'],
    ['DISPLAY', `${display.width || 0}x${display.height || 0} @ ${display.dpr || 1} dpr`],
    ['AUDIO', `${audio.state || 'unknown'}${audio.sampleRate ? ` / ${audio.sampleRate} hz` : ''}`],
    ['STORAGE', `${storage.backend || 'unknown'}${storage.healthy === false ? ' / check' : ' / ok'}`],
  ];
}

export function makeBetaNoticeScene({
  content = BETA_NOTICE_CONTENT,
  buildInfo = () => ({}),
  onCopyReportTemplate = () => false,
  onCopyDiagnostics = () => false,
  onOpenReport = () => false,
  onClose = () => {},
} = {}) {
  const normalized = normalizeBetaNoticeContent(content);
  let state = makeBetaNoticeState();
  let t = 0;
  const hits = createHitRegions();

  function dispatch(action) {
    const result = betaNoticeReduce(
      state,
      { now: nowMs(), ...action },
      normalized,
    );

    state = result.state;

    for (const effect of result.effects) {
      if (effect.type === 'close') {
        scenes.pop();
      } else if (effect.type === 'copyReportTemplate') {
        onCopyReportTemplate();
      } else if (effect.type === 'copyDiagnostics') {
        onCopyDiagnostics();
      } else if (effect.type === 'openReport') {
        onOpenReport();
      }
    }
  }

  function move(delta) {
    dispatch({ type: 'move', delta });
    AUDIO.menuMove();
  }

  function drawTabs(body) {
    let tx = body.x;
    BETA_NOTICE_TABS.forEach((tab) => {
      const on = tab === state.tab;
      const label = on ? `[${BETA_NOTICE_TAB_LABEL[tab]}]` : ` ${BETA_NOTICE_TAB_LABEL[tab]} `;
      const remaining = body.x + body.w - tx;
      if (remaining <= 0) return;
      uiText(tx, body.y + 2, label.slice(0, remaining), on ? 'ui-amber' : 'ui-secondary', on ? 1 : 0.78);
      addButton(hits, {
        id: `beta-tab:${tab}`,
        x: tx,
        y: body.y + 2,
        w: Math.min(label.length, remaining),
        label,
        selected: on,
        onClick: () => {
          dispatch({ type: 'setTab', tab });
          AUDIO.menuMove();
        },
      });
      tx += label.length + 1;
    });
  }

  function drawKnownCategoryRail(x, y, w, h) {
    uiText(x, y, 'CATEGORY', 'ui-label', 0.70);
    BETA_NOTICE_CATEGORIES.slice(0, Math.max(0, h - 2)).forEach((id, i) => {
      const cy = y + 2 + i;
      const on = id === betaNoticeCategoryId(state);
      const label = `${on ? '▸ ' : '  '}${betaNoticeCategoryLabel(id)}`;
      uiText(x, cy, label.slice(0, w), on ? 'ui-amber' : 'ui-secondary', on ? 1 : 0.74);
      addButton(hits, {
        id: `beta-category:${id}`,
        x,
        y: cy,
        w,
        label,
        selected: on,
        onClick: () => {
          dispatch({ type: 'setCategory', category: id });
          AUDIO.menuMove();
        },
      });
    });
  }

  function drawEntryList(x, y, w, h, list) {
    uiText(x, y, state.tab === 'known' ? 'ISSUES' : 'ITEMS', 'ui-label', 0.70);
    const cap = Math.max(1, h - 2);
    if (state.sel < state.scroll) state.scroll = state.sel;
    if (state.sel >= state.scroll + cap) state.scroll = Math.max(0, state.sel - cap + 1);

    if (!list.length) {
      uiText(x, y + 2, 'NO ENTRIES FILED', 'ui-secondary', 0.78);
      drawWrappedBlock(
        x,
        y + 4,
        w,
        Math.max(0, cap - 2),
        'If a tester hits something not listed here, it is worth a report.',
        'ui-secondary',
        0.65,
      );
      return;
    }

    list.slice(state.scroll, state.scroll + cap).forEach((entry, j) => {
      const i = state.scroll + j;
      const on = i === state.sel;
      const rowY = y + 2 + j;
      const status = entry.guide ? 'GUIDE' : betaNoticeSeverityLabel(entry.severity);
      const statusW = Math.min(14, Math.max(5, status.length));
      const titleW = Math.max(6, w - statusW - 2);
      uiText(x, rowY, `${on ? '▸' : ' '} ${clampText(entry.title, titleW - 2)}`, on ? 'ui-amber' : 'ui-primary', on ? 1 : 0.80);
      uiText(x + w - statusW, rowY, status.slice(0, statusW), entry.severity === 'blocker' ? 'ui-danger' : 'ui-secondary', 0.72);
      addButton(hits, {
        id: `beta-entry:${entry.id}`,
        x,
        y: rowY,
        w,
        label: entry.title,
        selected: on,
        onHover: () => dispatch({ type: 'setSelection', index: i }),
        onClick: () => dispatch({ type: 'setSelection', index: i }),
      });
    });
  }

  function drawEntryDetail(x, y, w, h, entry) {
    const width = Math.max(1, Math.floor(w || 1));
    const bottom = y + Math.max(1, Math.floor(h || 1));
    uiText(x, y, 'DETAIL', 'ui-label', 0.70);
    if (!entry) {
      const msg = state.tab === 'known'
        ? `No ${betaNoticeCategoryLabel(betaNoticeCategoryId(state)).toLowerCase()} issues are filed in this build.`
        : 'No entries are filed in this section.';
      drawWrappedBlock(x, y + 2, width, Math.max(0, bottom - (y + 2)), msg, 'ui-secondary', 0.78);
      return;
    }

    let cy = y + 2;
    cy += drawWrappedBlock(x, cy, width, Math.min(2, Math.max(0, bottom - cy)), safeText(entry.title, 'UNTITLED').toUpperCase(), 'ui-amber', 1);
    cy += 1;

    if (!entry.guide) {
      if (cy < bottom) {
        const status = `${betaNoticeStatusLabel(entry.status)} / ${betaNoticeSeverityLabel(entry.severity)}`;
        drawSectionLabel(x, cy, 'STATUS', status, width, entry.severity === 'blocker' ? 'ui-danger' : 'ui-primary');
        cy += 2;
      }
      if (cy < bottom) {
        drawSectionLabel(x, cy, 'CATEGORY', betaNoticeCategoryLabel(entry.category), width, 'ui-secondary');
        cy += 2;
      }
    }

    const sections = entry.guide
      ? [['GUIDE', entry.summary, 'ui-primary']]
      : [
          ['SUMMARY', entry.summary, 'ui-primary'],
          ['WORKAROUND', entry.workaround || 'None filed yet.', 'ui-secondary'],
          ['REPORT IF', entry.reportIf || 'Report if this blocks progress or reproduces after restart.', 'ui-secondary'],
        ];

    for (const [label, text, role] of sections) {
      if (cy >= bottom - 1) break;
      uiText(x, cy, String(label).slice(0, width), 'ui-label', 0.70);
      cy += 1;
      const used = drawWrappedBlock(x, cy, width, Math.max(0, bottom - cy), text, role, 0.86);
      cy += used + 1;
    }
  }

  function drawIssueScreen(body) {
    const { top, h: height } = betaContentRect(body);
    const railW = state.tab === 'known' ? Math.max(14, Math.min(17, Math.floor(body.w * 0.20))) : 0;
    const listW = Math.max(24, Math.min(36, Math.floor(body.w * (state.tab === 'known' ? 0.36 : 0.42))));
    const listX = body.x + railW + (railW ? 2 : 0);
    const divider = listX + listW + 1;
    const detailX = divider + 3;
    const detailW = Math.max(18, body.x + body.w - detailX - 1);
    const list = betaNoticeEntriesFor(normalized, state);
    const entry = list[state.sel];

    if (railW) {
      drawKnownCategoryRail(body.x, top, railW, height);
      uiLine(listX - 1, top, listX - 1, top + height, UI_COLOR.frame, 0.42);
    }
    drawEntryList(listX, top, listW, height, list);
    uiLine(divider, top, divider, top + height, UI_COLOR.frame, 0.65);
    drawEntryDetail(detailX, top, detailW, height, entry);
  }

  function drawReportScreen(body) {
    const guide = normalized.reportingGuide;
    const { top, bottom, h: height } = betaContentRect(body);
    const leftW = Math.max(30, Math.floor(body.w * 0.48));
    const divider = body.x + leftW + 2;
    const rightX = divider + 3;
    const rightW = Math.max(20, body.x + body.w - rightX - 1);

    uiText(body.x, top, safeText(guide.title, 'USEFUL FIELD REPORTS').toUpperCase().slice(0, leftW), 'ui-amber');
    drawWrappedBlock(body.x, top + 2, leftW, Math.min(4, Math.max(0, height - 2)), guide.summary, 'ui-primary', 0.84);

    const buttonY = Math.min(top + 8, Math.max(top + 5, bottom - 4));
    if (buttonY < bottom - 1) {
      drawVfdRow({ uiFill, uiText, theme: activeTheme }, {
        x: body.x,
        y: buttonY,
        w: Math.min(leftW, 24),
        label: 'COPY TEMPLATE',
        style: vfdRowStyle({ hovered: hits.isHovered('beta-action:copy-template'), selected: false, nowMs: nowMs() }),
        role: 'ui-amber',
      });
      addButton(hits, {
        id: 'beta-action:copy-template',
        x: body.x,
        y: buttonY,
        w: Math.min(leftW, 26),
        label: 'COPY TEMPLATE',
        onClick: () => {
          dispatch({ type: 'copyReportTemplate' });
          AUDIO.menuConfirm();
        },
      });
    }

    if (buttonY + 2 < bottom) {
      drawVfdRow({ uiFill, uiText, theme: activeTheme }, {
        x: body.x,
        y: buttonY + 2,
        w: Math.min(leftW, 24),
        label: 'OPEN REPORT PAGE',
        style: vfdRowStyle({ hovered: hits.isHovered('beta-action:open-report'), selected: false, nowMs: nowMs() }),
        role: 'ui-secondary',
      });
      addButton(hits, {
        id: 'beta-action:open-report',
        x: body.x,
        y: buttonY + 2,
        w: Math.min(leftW, 26),
        label: 'OPEN REPORT PAGE',
        onClick: () => {
          dispatch({ type: 'openReport' });
          AUDIO.menuConfirm();
        },
      });
    }

    uiLine(divider, top, divider, top + height, UI_COLOR.frame, 0.65);
    uiText(rightX, top, 'REPORT CHECKLIST', 'ui-label', 0.70);
    const rowCap = Math.max(0, Math.floor((height - 2) / 3));
    guide.rows.slice(0, rowCap).forEach((row, i) => {
      const rowY = top + 2 + i * 3;
      if (rowY >= bottom - 1) return;
      uiText(rightX, rowY, clampText(row.label, rightW), 'ui-amber', 0.92);
      drawWrappedBlock(rightX, rowY + 1, rightW, Math.min(2, Math.max(0, bottom - rowY - 1)), row.detail, 'ui-secondary', 0.72);
    });
  }

  function drawBuildScreen(body) {
    const { top, bottom, h: height } = betaContentRect(body);
    const leftW = Math.max(30, Math.floor(body.w * 0.52));
    const divider = body.x + leftW + 2;
    const rightX = divider + 3;
    const rightW = Math.max(20, body.x + body.w - rightX - 1);
    const rows = formatBuildRows(buildInfo);

    uiText(body.x, top, 'BUILD SNAPSHOT', 'ui-amber');
    rows.slice(0, Math.max(0, height - 2)).forEach(([label, value], i) => {
      const rowY = top + 2 + i;
      if (rowY >= bottom) return;
      const labelText = String(label).padEnd(12, ' ').slice(0, 12);
      uiText(body.x, rowY, labelText, 'ui-label', 0.70);
      uiText(body.x + 13, rowY, safeText(value, '—').toUpperCase().slice(0, Math.max(1, leftW - 13)), 'ui-primary', 0.86);
    });

    uiLine(divider, top, divider, top + height, UI_COLOR.frame, 0.65);
    uiText(rightX, top, 'SUPPORT PACKET', 'ui-label', 0.70);
    drawWrappedBlock(
      rightX,
      top + 2,
      rightW,
      Math.min(5, Math.max(0, height - 2)),
      'Copy diagnostics when a bug depends on renderer, audio, storage, platform, or performance state.',
      'ui-secondary',
      0.78,
    );

    const buttonY = Math.min(top + 9, Math.max(top + 5, bottom - 2));
    if (buttonY < bottom) {
      drawVfdRow({ uiFill, uiText, theme: activeTheme }, {
        x: rightX,
        y: buttonY,
        w: Math.min(rightW, 27),
        label: 'COPY DIAGNOSTICS',
        style: vfdRowStyle({ hovered: hits.isHovered('beta-action:copy-diagnostics'), selected: false, nowMs: nowMs() }),
        role: 'ui-amber',
      });
      addButton(hits, {
        id: 'beta-action:copy-diagnostics',
        x: rightX,
        y: buttonY,
        w: Math.min(rightW, 29),
        label: 'COPY DIAGNOSTICS',
        onClick: () => {
          dispatch({ type: 'copyDiagnostics' });
          AUDIO.menuConfirm();
        },
      });
    }
  }

  return {
    id: 'beta-notice',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'calm',

    enter() {
      AUDIO.startMenuHiss();
    },

    exit() {
      AUDIO.stopMenuHiss();
      onClose();
    },

    key(e) {
      const raw = e.key || '';
      const k = String(raw).toLowerCase();
      const code = e.code || '';

      if (raw === 'Tab' || e.controllerAction === 'tabNext') {
        dispatch({ type: e.shiftKey ? 'tabPrev' : 'tabNext' });
        AUDIO.menuMove();
        return true;
      }

      if (raw === '[' || k === 'q' || code === 'KeyQ') {
        dispatch({ type: 'tabPrev' });
        AUDIO.menuMove();
        return true;
      }

      if (raw === ']' || k === 'e' || code === 'KeyE') {
        dispatch({ type: 'tabNext' });
        AUDIO.menuMove();
        return true;
      }

      if (raw === 'ArrowLeft' || k === 'a' || code === 'KeyA') {
        dispatch({ type: 'categoryPrev' });
        AUDIO.menuMove();
        return true;
      }

      if (raw === 'ArrowRight' || k === 'd' || code === 'KeyD') {
        dispatch({ type: 'categoryNext' });
        AUDIO.menuMove();
        return true;
      }

      if (raw === 'ArrowUp' || k === 'w' || code === 'KeyW') {
        move(-1);
        return true;
      }

      if (raw === 'ArrowDown' || k === 's' || code === 'KeyS') {
        move(1);
        return true;
      }

      if (
        raw === 'Enter' || code === 'Enter' ||
        raw === ' ' || code === 'Space' ||
        k === 'z' || code === 'KeyZ' ||
        k === 'r' || code === 'KeyR'
      ) {
        dispatch({ type: 'openReport' });
        AUDIO.menuConfirm();
        return true;
      }

      if (k === 'c' || code === 'KeyC') {
        dispatch({ type: 'copyReportTemplate' });
        AUDIO.menuConfirm();
        return true;
      }

      if (k === 'x' || code === 'KeyX') {
        dispatch({ type: 'copyDiagnostics' });
        AUDIO.menuConfirm();
        return true;
      }

      if (raw === 'Escape' || k === 'b' || code === 'Escape' || e.controllerAction === 'back') {
        dispatch({ type: 'close' });
        return true;
      }

      return true;
    },

    pointer(e) {
      if (e.type === 'pointermove') {
        hits.handle(e, { click: false });
        return true;
      }
      if (e.type === 'pointerdown') {
        hits.handle(e);
        return true;
      }
      return true;
    },

    update(dt) {
      t += dt;
    },

    render() {
      state = betaNoticeReduce(state, { type: 'tick', now: nowMs() }, normalized).state;
      hits.reset();
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, UI_COLOR.glass);

      const w = Math.min(100, cols - 4);
      const h = Math.min(Math.max(34, rows - 8), rows - 4);
      const x = Math.floor((cols - w) / 2);
      const y = Math.floor((rows - h) / 2);
      const body = drawMachinePanel(x, y, w, h, {
        label: 'BETA NOTICE',
        source: `REV ${normalized.revision || 0}`,
        footerParts: betaNoticeFooterParts(w),
        meter: true,
      });

      drawVfdText(body.x, body.y, 'BETA NOTICE', { color: UI_COLOR.amber, max: Math.min(28, body.w) });
      if (normalized.updatedAt) {
        const updated = `UPDATED ${normalized.updatedAt}`.toUpperCase();
        uiText(body.x + body.w - updated.length, body.y, updated, 'ui-label', 0.62);
      }
      drawTabs(body);
      uiLine(body.x, body.y + 4, body.x + body.w, body.y + 4, UI_COLOR.frame, 0.48);

      if (state.tab === 'report') drawReportScreen(body);
      else if (state.tab === 'build') drawBuildScreen(body);
      else drawIssueScreen(body);


      if (state.message && nowMs() < state.messageUntil) {
        const msg = state.message.slice(0, Math.max(0, body.w - 4));
        const mx = body.x + Math.floor((body.w - msg.length) / 2);
        const my = body.y + body.h - 3;
        uiFill(mx - 2, my - 0.25, msg.length + 4, 1.5, activeTheme().dim);
        uiText(mx, my, msg, 'ui-amber', 0.96);
      }
    },
  };
}
