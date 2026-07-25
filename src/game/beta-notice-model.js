import {
  BETA_NOTICE_CATEGORIES,
  BETA_NOTICE_CATEGORY_LABEL,
  BETA_NOTICE_SEVERITY_LABEL,
  BETA_NOTICE_STATUS_LABEL,
} from '../data/beta-notice.js';

export const BETA_NOTICE_TABS = Object.freeze([
  'known',
  'expected',
  'report',
  'build',
]);

export const BETA_NOTICE_TAB_LABEL = Object.freeze({
  known: 'KNOWN ISSUES',
  expected: 'EXPECTED BEHAVIOR',
  report: 'REPORTING GUIDE',
  build: 'BUILD INFO',
});

const DEFAULT_ENTRY = Object.freeze({
  id: '',
  title: 'Untitled issue',
  category: 'gameplay',
  severity: 'note',
  status: 'known',
  summary: '',
  workaround: '',
  reportIf: '',
});

export function makeBetaNoticeState() {
  return {
    tab: 'known',
    category: 0,
    sel: 0,
    scroll: 0,
    message: '',
    messageUntil: 0,
  };
}

function cleanText(value, fallback = '') {
  const text = String(value ?? fallback).replace(/[\r\n\t]+/g, ' ').trim();
  return text || fallback;
}

function normalizeCategory(value) {
  const id = cleanText(value, DEFAULT_ENTRY.category).toLowerCase();
  return BETA_NOTICE_CATEGORIES.includes(id) ? id : DEFAULT_ENTRY.category;
}

function normalizeSeverity(value) {
  const id = cleanText(value, DEFAULT_ENTRY.severity).toLowerCase();
  return BETA_NOTICE_SEVERITY_LABEL[id] ? id : DEFAULT_ENTRY.severity;
}

function normalizeStatus(value) {
  const id = cleanText(value, DEFAULT_ENTRY.status).toLowerCase();
  return BETA_NOTICE_STATUS_LABEL[id] ? id : DEFAULT_ENTRY.status;
}

function normalizeEntry(entry, index = 0, prefix = 'entry') {
  const base = { ...DEFAULT_ENTRY, ...(entry || {}) };
  const id = cleanText(base.id, `${prefix}-${index + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || `${prefix}-${index + 1}`;

  return {
    id,
    title: cleanText(base.title, DEFAULT_ENTRY.title),
    category: normalizeCategory(base.category),
    severity: normalizeSeverity(base.severity),
    status: normalizeStatus(base.status),
    summary: cleanText(base.summary, ''),
    workaround: cleanText(base.workaround, ''),
    reportIf: cleanText(base.reportIf, ''),
  };
}

function normalizeEntries(entries, prefix = 'entry') {
  return Array.isArray(entries) ? entries.map((entry, i) => normalizeEntry(entry, i, prefix)) : [];
}

function normalizeGuide(raw = {}) {
  const rows = Array.isArray(raw?.rows) ? raw.rows : [];
  return {
    title: cleanText(raw?.title, 'USEFUL FIELD REPORTS'),
    summary: cleanText(raw?.summary, 'Copy the report template, then add the smallest reproducible description you can.'),
    rows: rows.map((row, i) => ({
      id: cleanText(row?.id, `guide-${i + 1}`)
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-') || `guide-${i + 1}`,
      label: cleanText(row?.label, `STEP ${i + 1}`),
      detail: cleanText(row?.detail, ''),
    })),
  };
}

export function normalizeBetaNoticeContent(raw = {}) {
  return {
    revision: Number(raw?.revision) || 0,
    updatedAt: cleanText(raw?.updatedAt, ''),
    knownIssues: normalizeEntries(raw?.knownIssues, 'known'),
    expectedBehavior: normalizeEntries(raw?.expectedBehavior, 'expected'),
    reportingGuide: normalizeGuide(raw?.reportingGuide),
  };
}

export function betaNoticeCategoryId(state) {
  const index = Math.max(0, Math.min(BETA_NOTICE_CATEGORIES.length - 1, Number(state?.category) || 0));
  return BETA_NOTICE_CATEGORIES[index] || BETA_NOTICE_CATEGORIES[0];
}

export function betaNoticeCategoryLabel(id) {
  return BETA_NOTICE_CATEGORY_LABEL[id] || String(id || '').toUpperCase();
}

export function betaNoticeStatusLabel(id) {
  return BETA_NOTICE_STATUS_LABEL[id] || String(id || '').toUpperCase();
}

export function betaNoticeSeverityLabel(id) {
  return BETA_NOTICE_SEVERITY_LABEL[id] || String(id || '').toUpperCase();
}

function guideRowsAsEntries(guide) {
  return (guide?.rows || []).map((row) => ({
    id: row.id,
    title: row.label,
    category: 'gameplay',
    severity: 'note',
    status: 'known',
    summary: row.detail,
    workaround: '',
    reportIf: '',
    guide: true,
  }));
}

export function betaNoticeEntriesFor(content, state) {
  switch (state?.tab) {
    case 'known':
      return (content?.knownIssues || []).filter((entry) => entry.category === betaNoticeCategoryId(state));
    case 'expected':
      return content?.expectedBehavior || [];
    case 'report':
      return guideRowsAsEntries(content?.reportingGuide);
    case 'build':
      return [];
    default:
      return [];
  }
}

function nextTab(tab, delta) {
  const i = BETA_NOTICE_TABS.indexOf(tab);
  const base = i >= 0 ? i : 0;
  return BETA_NOTICE_TABS[(base + delta + BETA_NOTICE_TABS.length) % BETA_NOTICE_TABS.length];
}

function resetSelection(state) {
  state.sel = 0;
  state.scroll = 0;
}

function wrapCategory(category, delta) {
  const n = BETA_NOTICE_CATEGORIES.length;
  return (Number(category || 0) + delta + n) % n;
}

function moveSelection(state, delta, entries) {
  const n = Array.isArray(entries) ? entries.length : 0;
  if (n <= 0) {
    state.sel = 0;
    state.scroll = 0;
    return;
  }
  state.sel = Math.max(0, Math.min(n - 1, Number(state.sel || 0) + Number(delta || 0)));
}

export function betaNoticeReduce(state, action, content) {
  const next = { ...makeBetaNoticeState(), ...(state || {}) };
  const effects = [];
  const type = action?.type;
  const now = Number(action?.now) || 0;

  if (next.message && next.messageUntil && now > next.messageUntil) {
    next.message = '';
    next.messageUntil = 0;
  }

  switch (type) {
    case 'tabNext':
      next.tab = nextTab(next.tab, 1);
      resetSelection(next);
      break;

    case 'tabPrev':
      next.tab = nextTab(next.tab, -1);
      resetSelection(next);
      break;

    case 'setTab':
      if (BETA_NOTICE_TABS.includes(action.tab)) {
        next.tab = action.tab;
        resetSelection(next);
      }
      break;

    case 'categoryNext':
      if (next.tab === 'known') {
        next.category = wrapCategory(next.category, 1);
        resetSelection(next);
      }
      break;

    case 'categoryPrev':
      if (next.tab === 'known') {
        next.category = wrapCategory(next.category, -1);
        resetSelection(next);
      }
      break;

    case 'setCategory':
      if (next.tab === 'known') {
        const i = BETA_NOTICE_CATEGORIES.indexOf(action.category);
        if (i >= 0) {
          next.category = i;
          resetSelection(next);
        }
      }
      break;

    case 'move':
      moveSelection(next, action.delta, betaNoticeEntriesFor(content, next));
      break;

    case 'setSelection': {
      const entries = betaNoticeEntriesFor(content, next);
      const n = entries.length;
      next.sel = n > 0 ? Math.max(0, Math.min(n - 1, Number(action.index) || 0)) : 0;
      break;
    }

    case 'copyReportTemplate':
      effects.push({ type: 'copyReportTemplate' });
      next.message = 'REPORT TEMPLATE COPIED';
      next.messageUntil = now + 2200;
      break;

    case 'copyDiagnostics':
      effects.push({ type: 'copyDiagnostics' });
      next.message = 'DIAGNOSTIC REPORT COPIED';
      next.messageUntil = now + 2200;
      break;

    case 'openReport':
      effects.push({ type: 'openReport' });
      next.message = 'REPORT PAGE OPENED';
      next.messageUntil = now + 2200;
      break;

    case 'close':
      effects.push({ type: 'close' });
      break;
  }

  moveSelection(next, 0, betaNoticeEntriesFor(content, next));
  return { state: next, effects };
}
