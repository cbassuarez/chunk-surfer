// AUDIOCORP field case.
//
// KIT, MAP, and FILES share one live model. The field continues behind the
// case; navigation state is presentation memory, never gameplay truth.

import * as scenes from './scenes.js';
import * as AUDIO from '../audio/story-audio.js';
import { uiScrim, uiSize } from '../render/ui.js';
import { drawMachinePanel } from '../render/presentation.js';
import { buildBagModel, bagEntry, EMPTY_JOB, normalizeBagSectionId } from './bag-model.js';
import {
  currentBagEntry,
  ensureBagSelectionVisible,
  initialBagState,
  reduceBagNav,
  repairBagSelection,
} from './bag-navigation.js';
import { initialMapNav, reduceMapNav, selectedMapSpace } from './map-navigation.js';
import { resolveMapAction } from './map-actions.js';
import { bagLayout, bagPanelBounds } from '../render/bag-layout.js';
import { bagListCapacity, drawBagView } from '../render/bag-view.js';

let rememberedNav = null;

function actionContext(entry, action) {
  return { entryId: entry?.id, actionId: action?.id, confirm: action?.confirm || null };
}

function cloneMapNav(value) {
  if (!value) return null;
  return { ...value, selectedByFloor: { ...(value.selectedByFloor || {}) } };
}

export function makeBagScene({
  equipment = [],
  job = EMPTY_JOB,
  map = null,
  getEquipment = null,
  getJob = null,
  getMap = null,
  hint = '',
  getHint = null,
  focus = null,
  getFocus = null,
  readDocument = () => {},
  markRoom = () => false,
  onClose = () => {},
  forceLayout = null,
  debug = null,
  memory = null,
  onRemember = () => {},
  getMonitorSource = null,
} = {}) {
  const equipmentSource = typeof getEquipment === 'function' ? getEquipment : () => equipment;
  const jobSource = typeof getJob === 'function' ? getJob : () => job;
  const mapSource = typeof getMap === 'function' ? getMap : () => map;
  const hintSource = typeof getHint === 'function' ? getHint : () => hint;
  const focusSource = typeof getFocus === 'function' ? getFocus : () => focus;

  let model = buildBagModel({ equipment: equipmentSource(), job: jobSource(), map: mapSource() });
  let nav = (memory || rememberedNav) ? repairBagSelection(memory || rememberedNav, model) : initialBagState(model, focus || {});
  let mapNav = initialMapNav({ model: model.map, preferredRoomId: focus?.entryId?.replace(/^room:/, '') || null });
  if (nav.map) mapNav = reduceMapNav(nav.map, { type: 'MODEL_REFRESH' }, model.map);
  let t = 0;
  let appliedFocusKey = '';
  const motion = { openedAt: 0, sectionChangedAt: 0, selectionChangedAt: 0, actionAt: 0 };

  function syncBagSelectionFromMap() {
    const selected = selectedMapSpace(mapNav, model.map);
    if (!selected) return;
    const entryId = `room:${selected.roomId}`;
    if (bagEntry(model, 'map', entryId)) {
      nav = reduceBagNav(nav, { type: 'SELECT_ENTRY', sectionId: 'map', entryId }, model);
    }
  }

  function syncMapSelectionFromBag() {
    const entry = bagEntry(model, 'map', nav.selected?.map);
    if (entry?.roomId) mapNav = reduceMapNav(mapNav, { type: 'SELECT_ROOM', roomId: entry.roomId }, model.map);
  }

  function remember() {
    nav = reduceBagNav(nav, { type: 'SET_MAP_NAV', map: cloneMapNav(mapNav) }, model);
    rememberedNav = {
      ...nav,
      selected: { ...nav.selected },
      scroll: { ...nav.scroll },
      map: cloneMapNav(mapNav),
      mode: 'browse',
      pendingAction: null,
    };
    onRemember(rememberedNav);
  }

  function applyFocus(nextFocus) {
    if (!nextFocus?.sectionId) return;
    const sectionId = normalizeBagSectionId(nextFocus.sectionId);
    const key = nextFocus.onceKey || `${sectionId}:${nextFocus.entryId || nextFocus.roomId || ''}`;
    if (key === appliedFocusKey) return;

    nav = reduceBagNav(nav, { type: 'SELECT_SECTION', sectionId }, model);
    const roomId = nextFocus.roomId || String(nextFocus.entryId || '').replace(/^room:/, '');
    if (sectionId === 'map' && roomId) {
      mapNav = reduceMapNav(mapNav, { type: 'SELECT_ROOM', roomId }, model.map);
      syncBagSelectionFromMap();
    } else if (nextFocus.entryId) {
      nav = reduceBagNav(nav, { type: 'SELECT_ENTRY', sectionId, entryId: nextFocus.entryId }, model);
    }
    appliedFocusKey = key;
    motion.sectionChangedAt = t;
    motion.selectionChangedAt = t;
    remember();
  }

  function refresh() {
    model = buildBagModel({ equipment: equipmentSource(), job: jobSource(), map: mapSource() });
    nav = reduceBagNav(nav, { type: 'MODEL_REFRESH' }, model);
    mapNav = reduceMapNav(mapNav, { type: 'MODEL_REFRESH' }, model.map);
    if (nav.sectionId === 'map') syncBagSelectionFromMap();
    remember();
  }

  function close() {
    remember();
    scenes.pop();
    onClose();
  }

  function setSection(sectionId) {
    const normalized = normalizeBagSectionId(sectionId);
    const before = nav.sectionId;
    nav = reduceBagNav(nav, { type: 'SELECT_SECTION', sectionId: normalized }, model);
    if (nav.sectionId === 'map') syncMapSelectionFromBag();
    if (before !== nav.sectionId) {
      motion.sectionChangedAt = t;
      motion.selectionChangedAt = t;
      AUDIO.menuMove();
    }
    remember();
  }

  function selectSection(delta) {
    const before = nav.sectionId;
    nav = reduceBagNav(nav, { type: delta > 0 ? 'NEXT_SECTION' : 'PREV_SECTION' }, model);
    if (nav.sectionId === 'map') syncMapSelectionFromBag();
    if (before !== nav.sectionId) {
      motion.sectionChangedAt = t;
      motion.selectionChangedAt = t;
      AUDIO.menuMove();
    }
    remember();
  }

  function moveList(delta) {
    const before = currentBagEntry(nav, model)?.id;
    nav = reduceBagNav(nav, { type: 'MOVE_SELECTION', delta }, model);
    if (currentBagEntry(nav, model)?.id !== before) {
      motion.selectionChangedAt = t;
      AUDIO.menuMove();
      remember();
    }
  }

  function moveMap(vector) {
    const before = selectedMapSpace(mapNav, model.map)?.id;
    mapNav = reduceMapNav(mapNav, { type: 'MOVE_SPATIAL', vector }, model.map);
    syncBagSelectionFromMap();
    if (selectedMapSpace(mapNav, model.map)?.id !== before) {
      motion.selectionChangedAt = t;
      AUDIO.menuMove();
      remember();
    }
  }

  function changeFloor(delta) {
    const before = mapNav.floorId;
    mapNav = reduceMapNav(mapNav, { type: delta > 0 ? 'NEXT_FLOOR' : 'PREV_FLOOR' }, model.map);
    syncBagSelectionFromMap();
    if (mapNav.floorId !== before) {
      motion.sectionChangedAt = t;
      motion.selectionChangedAt = t;
      AUDIO.menuMove();
      remember();
    }
  }

  function execute(entry, actionId) {
    if (!entry || !actionId) return false;
    let ok = false;

    if (nav.sectionId === 'map') {
      const selected = selectedMapSpace(mapNav, model.map);
      ok = resolveMapAction(selected, actionId, { readDocument, markRoom });
    } else if (entry.kind === 'file' && actionId === 'read') {
      readDocument(entry.source); ok = true;
    } else if (entry.kind === 'file' && (actionId === 'mark-room' || actionId === 'unmark-room')) {
      ok = entry.roomId ? markRoom(entry.roomId) : false;
    } else if (entry.kind === 'room' && (actionId === 'mark' || actionId === 'unmark')) {
      ok = markRoom(entry.roomId);
    } else if (entry.kind === 'room' && actionId === 'read-attached') {
      if (entry.attached) { readDocument(entry.attached); ok = true; }
    } else if (entry.kind === 'gear' && typeof entry.source?.action === 'function') {
      entry.source.action(); ok = true;
    }

    if (ok) {
      motion.actionAt = t;
      AUDIO.menuConfirm();
      // Callbacks such as radio/coffee may have removed this scene already.
      if (scenes.top()?.id === 'bag') refresh();
    }
    return ok;
  }

  function activatePrimary() {
    const entry = currentBagEntry(nav, model);
    const action = entry?.actions?.primary;
    if (!action) return;
    if (action.destructive) {
      nav = reduceBagNav(nav, { type: 'OPEN_CONFIRM', action: actionContext(entry, action) }, model);
      AUDIO.menuConfirm();
      return;
    }
    execute(entry, action.id);
  }

  function activateSecondary() {
    const entry = currentBagEntry(nav, model);
    const action = entry?.actions?.secondary;
    if (action) execute(entry, action.id);
  }

  function confirmPending() {
    const pending = nav.pendingAction;
    if (!pending) return;
    const entry = bagEntry(model, nav.sectionId, pending.entryId);
    nav = reduceBagNav(nav, { type: 'CANCEL' }, model);
    execute(entry, pending.actionId);
  }

  const scene = {
    id: 'bag',
    blocksInput: true,
    blocksWorld: false,
    lensPreset: 'calm',

    enter() {
      motion.openedAt = t;
      motion.sectionChangedAt = t;
      motion.selectionChangedAt = t;
      refresh();
      applyFocus(focusSource());
    },

    update(dt) { t += dt; },
    refresh,
    selectSection: setSection,
    selectRoom(roomId) {
      setSection('map');
      mapNav = reduceMapNav(mapNav, { type: 'SELECT_ROOM', roomId }, model.map);
      syncBagSelectionFromMap();
      remember();
    },

    debugState() { return { model, nav, mapNav, selected: currentBagEntry(nav, model), mapSelected: selectedMapSpace(mapNav, model.map) }; },

    key(e) {
      const raw = e.key || '';
      const k = raw.toLowerCase();
      const code = e.code || '';

      if (nav.mode === 'confirm') {
        if (raw === 'Enter' || code === 'Enter' || raw === ' ' || code === 'Space') { confirmPending(); return true; }
        if (raw === 'Escape') { nav = reduceBagNav(nav, { type: 'CANCEL' }, model); AUDIO.menuMove(); return true; }
        if (k === 'b' || code === 'KeyB') { close(); return true; }
        return true;
      }

      if (raw === 'Escape' || k === 'b' || code === 'KeyB') { close(); return true; }
      if (raw === 'Tab') { e.preventDefault?.(); selectSection(e.shiftKey ? -1 : 1); return true; }

      if (raw === '1' || code === 'Digit1') { setSection('kit'); return true; }
      if (raw === '2' || code === 'Digit2') { setSection('map'); return true; }
      if (raw === '3' || code === 'Digit3') { setSection('files'); return true; }

      if (nav.sectionId === 'map') {
        if (raw === '[' || code === 'BracketLeft') { changeFloor(-1); return true; }
        if (raw === ']' || code === 'BracketRight') { changeFloor(1); return true; }
        if (raw === 'ArrowUp' || k === 'w' || code === 'KeyW') { moveMap({ x: 0, y: -1 }); return true; }
        if (raw === 'ArrowDown' || k === 's' || code === 'KeyS') { moveMap({ x: 0, y: 1 }); return true; }
        if (raw === 'ArrowLeft' || k === 'a' || code === 'KeyA') { moveMap({ x: -1, y: 0 }); return true; }
        if (raw === 'ArrowRight' || k === 'd' || code === 'KeyD') { moveMap({ x: 1, y: 0 }); return true; }
      } else {
        if (raw === 'ArrowLeft' || raw === '[') { selectSection(-1); return true; }
        if (raw === 'ArrowRight' || raw === ']') { selectSection(1); return true; }
        if (raw === 'ArrowUp' || k === 'w' || code === 'KeyW') { moveList(-1); return true; }
        if (raw === 'ArrowDown' || k === 's' || code === 'KeyS') { moveList(1); return true; }
      }

      if (raw === 'Enter' || code === 'Enter' || k === 'e' || code === 'KeyE') { activatePrimary(); return true; }
      if (raw === ' ' || code === 'Space' || k === 'z' || code === 'KeyZ') { activateSecondary(); return true; }
      return true;
    },

    render() {
      applyFocus(focusSource());
      const size = uiSize();
      const outer = bagPanelBounds(size);
      uiScrim(0.74);
      const body = drawMachinePanel(outer.x, outer.y, outer.w, outer.h, {
        label: 'FIELD CASE / 4417-C',
        source: getMonitorSource?.() || 'FIELD LIVE',
        footer: '', meter: true, theme: 'amber',
      });
      const layout = bagLayout({ body, forceMode: typeof forceLayout === 'function' ? forceLayout() : forceLayout });
      if (nav.sectionId !== 'map') {
        nav = ensureBagSelectionVisible(nav, model, bagListCapacity(layout, nav.sectionId));
      }
      drawBagView({ model, nav, mapNav, layout, hint: hintSource(), motion, now: t });
      debug?.({ model, nav, mapNav, layout, selected: currentBagEntry(nav, model), t });
    },
  };

  return scene;
}
