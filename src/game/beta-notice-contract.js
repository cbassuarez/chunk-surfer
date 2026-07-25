import {
  BETA_NOTICE_CATEGORIES,
  BETA_NOTICE_CONTENT,
} from '../data/beta-notice.js';

import {
  BETA_NOTICE_TABS,
  makeBetaNoticeState,
  normalizeBetaNoticeContent,
  betaNoticeEntriesFor,
  betaNoticeReduce,
} from './beta-notice-model.js';

export function assertBetaNoticeContent(content = BETA_NOTICE_CONTENT) {
  const normalized = normalizeBetaNoticeContent(content);
  const ids = new Set();

  for (const entry of [
    ...normalized.knownIssues,
    ...normalized.expectedBehavior,
  ]) {
    if (!entry.id) throw new Error('beta notice entry missing id');
    if (ids.has(entry.id)) throw new Error(`duplicate beta notice id: ${entry.id}`);
    ids.add(entry.id);

    if (!entry.title) throw new Error(`beta notice entry missing title: ${entry.id}`);

    if (!BETA_NOTICE_CATEGORIES.includes(entry.category)) {
      throw new Error(`bad beta notice category: ${entry.id}`);
    }
  }

  return true;
}

export function assertBetaNoticeNavigation(content = BETA_NOTICE_CONTENT) {
  const normalized = normalizeBetaNoticeContent(content);
  let state = makeBetaNoticeState();

  for (let i = 0; i < BETA_NOTICE_TABS.length * 2; i++) {
    state = betaNoticeReduce(state, { type: 'tabNext' }, normalized).state;
    if (!BETA_NOTICE_TABS.includes(state.tab)) {
      throw new Error(`invalid beta notice tab: ${state.tab}`);
    }
  }

  state = betaNoticeReduce(state, { type: 'setTab', tab: 'known' }, normalized).state;
  for (const category of BETA_NOTICE_CATEGORIES) {
    state = betaNoticeReduce(state, { type: 'setCategory', category }, normalized).state;
    if (state.category < 0 || state.category >= BETA_NOTICE_CATEGORIES.length) {
      throw new Error('beta notice category escaped bounds');
    }
  }

  state = betaNoticeReduce(state, { type: 'move', delta: 999 }, normalized).state;
  const list = betaNoticeEntriesFor(normalized, state);

  if (list.length && state.sel >= list.length) {
    throw new Error('beta notice selection escaped list bounds');
  }

  state = betaNoticeReduce(state, { type: 'move', delta: -999 }, normalized).state;

  if (state.sel < 0) {
    throw new Error('beta notice selection below zero');
  }

  return true;
}

export function assertBetaNoticeContracts(content = BETA_NOTICE_CONTENT) {
  assertBetaNoticeContent(content);
  assertBetaNoticeNavigation(content);
  return true;
}
