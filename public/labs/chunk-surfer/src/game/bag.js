// AUDIOCORP field case.
//
// One scrolling index, one persistent detail pane, three stable sections:
// KIT, MANIFEST, and FILES. The world continues behind it.

import * as scenes from './scenes.js';
import * as AUDIO from '../audio/story-audio.js';
import { uiScrim, uiSize } from '../render/ui.js';
import { drawMachinePanel } from '../render/presentation.js';
import { buildBagModel, bagEntry, EMPTY_JOB } from './bag-model.js';
import {
  currentBagEntry,
  ensureBagSelectionVisible,
  initialBagState,
  reduceBagNav,
  repairBagSelection,
} from './bag-navigation.js';
import { bagLayout, bagPanelBounds } from '../render/bag-layout.js';
import { bagListCapacity, drawBagView } from '../render/bag-view.js';

let rememberedNav = null;

function actionContext(entry, action) {
  return {
    entryId: entry?.id,
    actionId: action?.id,
    confirm: action?.confirm || null,
  };
}

export function makeBagScene({
  equipment = [],
  job = EMPTY_JOB,
  getEquipment = null,
  getJob = null,
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
  const hintSource = typeof getHint === 'function' ? getHint : () => hint;
  const focusSource = typeof getFocus === 'function' ? getFocus : () => focus;

  let model = buildBagModel({ equipment: equipmentSource(), job: jobSource() });
  let nav = (memory || rememberedNav) ? repairBagSelection(memory || rememberedNav, model) : initialBagState(model, focus || {});
  let t = 0;
  let appliedFocusKey = '';
  const motion = { openedAt: 0, sectionChangedAt: 0, selectionChangedAt: 0, actionAt: 0 };

  function applyFocus(nextFocus) {
    if (!nextFocus?.sectionId) return;
    const key = `${nextFocus.sectionId}:${nextFocus.entryId || ''}`;
    if (key === appliedFocusKey) return;

    nav = reduceBagNav(nav, { type: 'SELECT_SECTION', sectionId: nextFocus.sectionId }, model);
    if (nextFocus.entryId) nav = reduceBagNav(nav, {
      type: 'SELECT_ENTRY',
      sectionId: nextFocus.sectionId,
      entryId: nextFocus.entryId,
    }, model);
    appliedFocusKey = key;
    motion.sectionChangedAt = t;
    motion.selectionChangedAt = t;
    remember();
  }

  applyFocus(focusSource());

  function remember() {
    rememberedNav = {
      ...nav,
      selected: { ...nav.selected },
      scroll: { ...nav.scroll },
      mode: 'browse',
      pendingAction: null,
    };
    onRemember(rememberedNav);
  }

  function refresh() {
    model = buildBagModel({ equipment: equipmentSource(), job: jobSource() });
    nav = reduceBagNav(nav, { type: 'MODEL_REFRESH' }, model);
    remember();
  }

  function close() {
    remember();
    scenes.pop();
    onClose();
  }

  function selectSection(delta) {
    nav = reduceBagNav(nav, { type: delta > 0 ? 'NEXT_SECTION' : 'PREV_SECTION' }, model);
    motion.sectionChangedAt = t;
    motion.selectionChangedAt = t;
    AUDIO.menuMove();
    remember();
  }

  function move(delta) {
    const before = currentBagEntry(nav, model)?.id;
    nav = reduceBagNav(nav, { type: 'MOVE_SELECTION', delta }, model);
    if (currentBagEntry(nav, model)?.id !== before) {
      motion.selectionChangedAt = t;
      AUDIO.menuMove();
      remember();
    }
  }

  function execute(entry, actionId) {
    if (!entry || !actionId) return false;
    let ok = false;

    if (entry.kind === 'file' && actionId === 'read') {
      readDocument(entry.source);
      ok = true;
    } else if (entry.kind === 'file' && (actionId === 'mark-room' || actionId === 'unmark-room')) {
      ok = entry.roomId ? markRoom(entry.roomId) : false;
    } else if (entry.kind === 'room' && (actionId === 'mark' || actionId === 'unmark')) {
      ok = markRoom(entry.roomId);
    } else if (entry.kind === 'room' && actionId === 'read-attached') {
      if (entry.attached) {
        readDocument(entry.attached);
        ok = true;
      }
    } else if (entry.kind === 'gear' && typeof entry.source?.action === 'function') {
      entry.source.action();
      ok = true;
    }

    if (ok) {
      motion.actionAt = t;
      AUDIO.menuConfirm();
      refresh();
    }

    return ok;
  }

  function activatePrimary() {
    const entry = currentBagEntry(nav, model);
    const action = entry?.actions?.primary;
    if (!action) return;

    if (action.destructive) {
      nav = reduceBagNav(nav, {
        type: 'OPEN_CONFIRM',
        action: actionContext(entry, action),
      }, model);
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
    },

    update(dt) { t += dt; },

    refresh,

    debugState() {
      return {
        model,
        nav,
        selected: currentBagEntry(nav, model),
      };
    },

    key(e) {
      const raw = e.key || '';
      const k = raw.toLowerCase();
      const code = e.code || '';

      if (nav.mode === 'confirm') {
        if (raw === 'Enter' || code === 'Enter' || raw === ' ' || code === 'Space') {
          confirmPending();
          return true;
        }
        if (raw === 'Escape') {
          nav = reduceBagNav(nav, { type: 'CANCEL' }, model);
          AUDIO.menuMove();
          return true;
        }
        if (k === 'b' || code === 'KeyB') {
          close();
          return true;
        }
        return true;
      }

      if (raw === 'Escape' || k === 'b' || code === 'KeyB') {
        close();
        return true;
      }

      if (raw === 'Tab') {
        selectSection(e.shiftKey ? -1 : 1);
        return true;
      }
      if (raw === 'ArrowLeft' || raw === '[') { selectSection(-1); return true; }
      if (raw === 'ArrowRight' || raw === ']') { selectSection(1); return true; }

      if (raw === '1' || code === 'Digit1') {
        nav = reduceBagNav(nav, { type: 'SELECT_SECTION', sectionId: 'kit' }, model);
        motion.sectionChangedAt = motion.selectionChangedAt = t; AUDIO.menuMove(); remember(); return true;
      }
      if (raw === '2' || code === 'Digit2') {
        nav = reduceBagNav(nav, { type: 'SELECT_SECTION', sectionId: 'manifest' }, model);
        motion.sectionChangedAt = motion.selectionChangedAt = t; AUDIO.menuMove(); remember(); return true;
      }
      if (raw === '3' || code === 'Digit3') {
        nav = reduceBagNav(nav, { type: 'SELECT_SECTION', sectionId: 'files' }, model);
        motion.sectionChangedAt = motion.selectionChangedAt = t; AUDIO.menuMove(); remember(); return true;
      }

      if (raw === 'ArrowUp' || k === 'w' || code === 'KeyW') { move(-1); return true; }
      if (raw === 'ArrowDown' || k === 's' || code === 'KeyS') { move(1); return true; }

      if (raw === 'Enter' || code === 'Enter' || k === 'e' || code === 'KeyE') {
        activatePrimary();
        return true;
      }

      if (raw === ' ' || code === 'Space' || k === 'z' || code === 'KeyZ') {
        activateSecondary();
        return true;
      }

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
        footer: '',
        meter: true,
        theme: 'amber',
      });

      const layout = bagLayout({ body, forceMode: typeof forceLayout === 'function' ? forceLayout() : forceLayout });
      const capacity = bagListCapacity(layout, nav.sectionId);
      nav = ensureBagSelectionVisible(nav, model, capacity);

      drawBagView({
        model,
        nav,
        layout,
        hint: hintSource(),
        motion,
        now: t,
      });

      debug?.({ model, nav, layout, selected: currentBagEntry(nav, model), t });
    },
  };

  return scene;
}
