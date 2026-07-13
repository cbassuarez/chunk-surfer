//
//  bag-navigation.js
//  
//
//  Created by Sebastian Suarez-Solis on 7/12/26.
//

// Pure navigation for the field case. No canvas, scenes, saves, or audio.

import { bagEntry, bagSection } from './bag-model.js';

function sectionIds(model) {
  return (model?.sections || []).map((section) => section.id);
}

function firstEntryId(model, sectionId) {
  return bagSection(model, sectionId)?.entries?.[0]?.id || null;
}

export function initialBagState(model, focus = {}) {
  const ids = sectionIds(model);
  const fallbackSection = ids.includes('kit') ? 'kit' : (ids[0] || 'kit');
  const sectionId = ids.includes(focus.sectionId) ? focus.sectionId : fallbackSection;

  const selected = {};
  const scroll = {};

  for (const id of ids) {
    selected[id] = firstEntryId(model, id);
    scroll[id] = 0;
  }

  if (focus.entryId && bagEntry(model, sectionId, focus.entryId)) {
    selected[sectionId] = focus.entryId;
  }

  return {
    sectionId,
    selected,
    scroll,
    mode: 'browse',
    pendingAction: null,
  };
}

export function currentBagSection(state, model) {
  return bagSection(model, state?.sectionId);
}

export function currentBagEntry(state, model) {
  const sectionId = state?.sectionId;
  return bagEntry(model, sectionId, state?.selected?.[sectionId]);
}

export function repairBagSelection(state, model) {
  const ids = sectionIds(model);
  if (!ids.length) return initialBagState(model);

  let sectionId = ids.includes(state?.sectionId) ? state.sectionId : ids[0];
  const selected = { ...(state?.selected || {}) };
  const scroll = { ...(state?.scroll || {}) };

  for (const id of ids) {
    const section = bagSection(model, id);
    const wanted = selected[id];
    if (!section?.entries?.some((entry) => entry.id === wanted)) {
      selected[id] = section?.entries?.[0]?.id || null;
      scroll[id] = 0;
    }
    if (!Number.isFinite(scroll[id])) scroll[id] = 0;
  }

  return {
    sectionId,
    selected,
    scroll,
    mode: state?.mode || 'browse',
    pendingAction: state?.pendingAction || null,
  };
}

function changeSection(state, delta, model) {
  const ids = sectionIds(model);
  if (!ids.length) return state;
  const at = Math.max(0, ids.indexOf(state.sectionId));
  const sectionId = ids[(at + delta + ids.length) % ids.length];
  return { ...state, sectionId, mode: 'browse', pendingAction: null };
}

function moveSelection(state, delta, model) {
  const section = currentBagSection(state, model);
  const entries = section?.entries || [];
  if (!entries.length) return state;

  const selectedId = state.selected?.[section.id];
  const at = Math.max(0, entries.findIndex((entry) => entry.id === selectedId));
  const next = entries[(at + delta + entries.length) % entries.length];

  return {
    ...state,
    selected: { ...state.selected, [section.id]: next.id },
    mode: 'browse',
    pendingAction: null,
  };
}

function selectSection(state, sectionId, model) {
  if (!bagSection(model, sectionId)) return state;
  return { ...state, sectionId, mode: 'browse', pendingAction: null };
}

function selectEntry(state, sectionId, entryId, model) {
  if (!bagEntry(model, sectionId, entryId)) return state;
  return {
    ...state,
    sectionId,
    selected: { ...state.selected, [sectionId]: entryId },
    mode: 'browse',
    pendingAction: null,
  };
}

function setScroll(state, sectionId, value) {
  return {
    ...state,
    scroll: {
      ...state.scroll,
      [sectionId]: Math.max(0, Math.floor(Number(value) || 0)),
    },
  };
}

export function ensureBagSelectionVisible(state, model, visibleCount) {
  const section = currentBagSection(state, model);
  const entries = section?.entries || [];
  if (!entries.length) return setScroll(state, state.sectionId, 0);

  const count = Math.max(1, Math.floor(visibleCount || 1));
  const selectedId = state.selected?.[section.id];
  const index = Math.max(0, entries.findIndex((entry) => entry.id === selectedId));
  let scroll = Math.max(0, state.scroll?.[section.id] || 0);

  if (index < scroll) scroll = index;
  if (index >= scroll + count) scroll = index - count + 1;
  scroll = Math.min(scroll, Math.max(0, entries.length - count));

  return setScroll(state, section.id, scroll);
}

export function reduceBagNav(state, event, model) {
  switch (event?.type) {
    case 'NEXT_SECTION': return changeSection(state, 1, model);
    case 'PREV_SECTION': return changeSection(state, -1, model);
    case 'SELECT_SECTION': return selectSection(state, event.sectionId, model);
    case 'MOVE_SELECTION': return moveSelection(state, event.delta, model);
    case 'SELECT_ENTRY': return selectEntry(state, event.sectionId, event.entryId, model);
    case 'SET_SCROLL': return setScroll(state, event.sectionId, event.value);
    case 'OPEN_CONFIRM':
      return { ...state, mode: 'confirm', pendingAction: event.action || null };
    case 'CANCEL':
      return state.mode === 'browse'
        ? state
        : { ...state, mode: 'browse', pendingAction: null };
    case 'MODEL_REFRESH': return repairBagSelection(state, model);
    default: return state;
  }
}
