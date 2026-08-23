// AUDIOCORP field case.
//
// KIT, MAP, and FILES share one live model. The field continues behind the
// case; navigation state is presentation memory, never gameplay truth.

import * as scenes from './scenes.js';
import * as AUDIO from '../audio/story-audio.js';
import { uiScrim, uiSize } from '../render/ui.js';
import { drawMachinePanel } from '../render/presentation.js';
import { buildBagModel, bagEntry, bagSection, EMPTY_JOB, normalizeBagSectionId } from './bag-model.js';
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
import { bagGuideRows, bagListCapacity, drawBagView } from '../render/bag-view.js';
import { drawSkillsSection } from '../render/bag-skills.js';
import { learnCombatTechnique, normalizeCombatBuild } from './combat-progression.js';

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
  loadout = null,
  getLoadout = null,
  moveEquipment = null,
  reorderEquipment = null,
  getJob = null,
  getMap = null,
  hint = '',
  getHint = null,
  focus = null,
  getFocus = null,
  guide = null,
  getGuide = null,
  // The SKILLS tab works on a case-local copy. Gameplay truth changes only as
  // the case closes, so browsing and choosing never rewrites the live build out
  // from under the player.
  getBuild = null,
  hasRig = null,
  onApplySkills = null,
  readDocument = () => {},
  markRoom = () => false,
  onItemAction = () => false,
  onClose = () => {},
  forceLayout = null,
  debug = null,
  memory = null,
  onRemember = () => {},
  getMonitorSource = null,
} = {}) {
  const equipmentSource = typeof getEquipment === 'function' ? getEquipment : () => equipment;
  const loadoutSource = typeof getLoadout === 'function' ? getLoadout : () => loadout;
  const jobSource = typeof getJob === 'function' ? getJob : () => job;
  const mapSource = typeof getMap === 'function' ? getMap : () => map;
  const hintSource = typeof getHint === 'function' ? getHint : () => hint;
  const focusSource = typeof getFocus === 'function' ? getFocus : () => focus;
  const guideSource = typeof getGuide === 'function' ? getGuide : () => guide;
  const buildSource = typeof getBuild === 'function' ? getBuild : () => null;
  const rigSource = typeof hasRig === 'function' ? hasRig : () => false;

  const settledBuild = normalizeCombatBuild(buildSource());
  let workingBuild = settledBuild;
  let chosenTechniqueIds = [];
  let skillsApplied = false;
  let model = buildBagModel({
    equipment: equipmentSource(), job: jobSource(), map: mapSource(), loadout: loadoutSource(),
    build: workingBuild, settledBuild, hasRig: rigSource(),
  });
  let nav = (memory || rememberedNav) ? repairBagSelection(memory || rememberedNav, model) : initialBagState(model, focus || {});
  let mapNav = initialMapNav({ model: model.map, preferredRoomId: focus?.entryId?.replace(/^room:/, '') || null });
  if (nav.map) mapNav = reduceMapNav(nav.map, { type: 'MODEL_REFRESH' }, model.map);
  let t = 0;
  let notice = '';
  let noticeUntil = 0;
  let appliedFocusKey = '';
  let guideNudge = 99;   // seconds since the lock last refused a press
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

  // ── guided steps ──────────────────────────────────────────────────────────
  // A guided step holds the case on one control. It is a lock, and it is meant
  // to read as one: the callout says so in as many words, the rail stops
  // advertising the keys that are held, and a refused press flashes the callout
  // instead of pushing another line of monitor text at a player who is looking
  // at a menu. Closing the case is never refused — nothing here traps anyone.
  function activeGuide() {
    const g = guideSource();
    if (!g?.section) return null;
    return { ...g, sectionId: normalizeBagSectionId(g.section) };
  }

  function guideRoomId(g) {
    return String(g?.entry || '').startsWith('room:') ? String(g.entry).slice(5) : null;
  }

  // Hold the cursor on the guided target. Input is locked, but a model refresh
  // after an action can still move a selection out from under it.
  function pinGuide(g) {
    if (!g) return;
    if (nav.sectionId !== g.sectionId) nav = reduceBagNav(nav, { type: 'SELECT_SECTION', sectionId: g.sectionId }, model);
    const roomId = guideRoomId(g);
    if (roomId) {
      if (selectedMapSpace(mapNav, model.map)?.roomId !== roomId) {
        mapNav = reduceMapNav(mapNav, { type: 'SELECT_ROOM', roomId }, model.map);
        syncBagSelectionFromMap();
      }
    } else if (g.entry && currentBagEntry(nav, model)?.id !== g.entry) {
      nav = reduceBagNav(nav, { type: 'SELECT_ENTRY', sectionId: g.sectionId, entryId: g.entry }, model);
    }
  }

  function guidedAction(g) {
    const entry = currentBagEntry(nav, model);
    if (!entry) return null;
    return g.action === 'mark' ? entry.actions?.secondary : entry.actions?.primary;
  }

  // The guide, but only once it has an action to hand the player. A guide
  // pointing at something this case cannot do is a content fault, and a content
  // fault must never hold the case shut — it falls through to an ordinary bag.
  function lockedGuide() {
    const g = activeGuide();
    if (!g) return null;
    pinGuide(g);
    return guidedAction(g) ? g : null;
  }

  function refuseGuided() {
    guideNudge = 0;
    AUDIO.menuMove?.();
  }

  function refresh() {
    model = buildBagModel({
      equipment: equipmentSource(), job: jobSource(), map: mapSource(), loadout: loadoutSource(),
      build: workingBuild, settledBuild, hasRig: rigSource(),
    });
    nav = reduceBagNav(nav, { type: 'MODEL_REFRESH' }, model);
    mapNav = reduceMapNav(mapNav, { type: 'MODEL_REFRESH' }, model.map);
    if (nav.sectionId === 'map') syncBagSelectionFromMap();
    remember();
  }

  function close() {
    remember();
    // Close the case itself, not whichever overlay happens to be at the top of
    // the stack. Overlay scenes above the bag may decline the key and let the
    // bag handle it; a blind pop() removes the overlay and leaves the player
    // trapped in the case.
    const removed = scenes.remove(scene);
    if (removed) onClose();
  }

  function applyChosenSkills() {
    if (skillsApplied) return;
    skillsApplied = true;
    if (!chosenTechniqueIds.length || typeof onApplySkills !== 'function') return;
    onApplySkills(workingBuild, { techniqueIds: [...chosenTechniqueIds] });
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


  function kitEntries() {
    return bagSection(model, 'kit')?.entries || [];
  }

  function selectKitEntry(entry) {
    if (!entry) return;
    const before = currentBagEntry(nav, model)?.id;
    nav = reduceBagNav(nav, { type: 'SELECT_ENTRY', sectionId: 'kit', entryId: entry.id }, model);
    if (currentBagEntry(nav, model)?.id !== before) {
      motion.selectionChangedAt = t;
      AUDIO.menuMove();
      remember();
    }
  }

  function moveKitSpatial(dx, dy) {
    const entries = kitEntries();
    const current = currentBagEntry(nav, model);
    if (!entries.length || !current) return;

    const ready = entries
      .filter((entry) => entry.compartment === 'top')
      .sort((a, b) => a.topIndex - b.topIndex);
    const storage = entries.filter((entry) => entry.compartment !== 'top');

    if (current.compartment === 'top') {
      const readyAt = Math.max(0, ready.findIndex((entry) => entry.id === current.id));
      if (dy > 0 && storage.length) {
        selectKitEntry(storage[Math.min(storage.length - 1, readyAt)]);
        return;
      }
      if (dx && ready.length > 1) {
        selectKitEntry(ready[(readyAt + dx + ready.length) % ready.length]);
      }
      return;
    }

    const storageAt = Math.max(0, storage.findIndex((entry) => entry.id === current.id));
    const cols = 3;
    if (dy < 0 && ready.length) {
      selectKitEntry(ready[Math.min(ready.length - 1, storageAt % cols)]);
      return;
    }
    if (dy > 0) {
      selectKitEntry(storage[Math.min(storage.length - 1, storageAt + cols)]);
      return;
    }
    if (dx && storage.length > 1) {
      selectKitEntry(storage[(storageAt + dx + storage.length) % storage.length]);
    }
  }

  function readyOrClearKitEntry(direction) {
    const entry = currentBagEntry(nav, model);
    if (nav.sectionId !== 'kit' || entry?.kind !== 'gear') return false;
    const action = entry.actions?.secondary;
    if (!action) return false;
    if (direction === 'ready' && action.id !== 'move-top') return false;
    if (direction === 'clear' && action.id !== 'move-storage') return false;
    return execute(entry, action.id);
  }

  // The tree is two-dimensional, so it does not use the list reducer: left/right
  // walks branches, up/down walks tiers, and a shorter branch clamps to its
  // deepest tile rather than swallowing the press.
  function skillsTree() { return model.sections.find((section) => section.id === 'skills')?.tree || null; }
  function selectedSkill() {
    const tree = skillsTree();
    if (!tree) return null;
    const id = nav.selected?.skills;
    const all = tree.branches.flatMap((b) => b.entries);
    return all.find((e) => e.id === id) || all[0] || null;
  }
  function selectSkill(entry) {
    if (!entry) return;
    nav = reduceBagNav(nav, { type: 'SELECT_ENTRY', sectionId: 'skills', entryId: entry.id }, model);
    motion.selectionChangedAt = t;
    AUDIO.menuMove();
    remember();
  }
  function moveSkill(dBranch, dTier) {
    const tree = skillsTree();
    const current = selectedSkill();
    if (!tree || !current) return;
    const index = tree.branches.findIndex((b) => b.id === current.branch);
    if (dBranch) {
      const next = tree.branches[(index + dBranch + tree.branches.length) % tree.branches.length];
      const deepest = next.entries[next.entries.length - 1];
      selectSkill(next.entries.find((e) => e.tier === current.tier) || deepest);
      return;
    }
    const branch = tree.branches[index];
    const tier = Math.max(1, Math.min(branch.entries.length, current.tier + dTier));
    selectSkill(branch.entries.find((e) => e.tier === tier) || current);
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
    } else if (entry.kind === 'gear' && (actionId === 'move-top' || actionId === 'move-storage')) {
      const result = typeof moveEquipment === 'function'
        ? moveEquipment(entry.sourceId, actionId === 'move-top' ? 'top' : 'storage')
        : { changed: false, reason: 'unavailable' };
      ok = !!result?.changed;
      if (!ok) {
        notice = result?.reason === 'top-full'
          ? `TOP COMPARTMENT FULL · ${model.loadout.capacity}/${model.loadout.capacity} · MOVE ONE TO STORAGE FIRST`
          : 'LOADOUT UNCHANGED';
        noticeUntil = t + 2.4;
        AUDIO.menuMove?.();
      }
    } else if (entry.kind === 'skill' && actionId === 'fit-skill') {
      const result = learnCombatTechnique(workingBuild, entry.techniqueId, { hasRig: rigSource() });
      ok = !!result.changed;
      if (ok) {
        workingBuild = result.build;
        chosenTechniqueIds = [...chosenTechniqueIds, entry.techniqueId];
        notice = `${entry.label} CHOSEN · TAKES EFFECT WHEN THE CASE CLOSES`;
        noticeUntil = t + 3.2;
      } else {
        notice = entry.blockedBy || 'NOT AVAILABLE';
        noticeUntil = t + 2.6;
        AUDIO.menuMove?.();
      }
    } else if (entry.kind === 'gear' && actionId === 'reorder-up') {
      const result = typeof reorderEquipment === 'function'
        ? reorderEquipment(entry.sourceId, 'up')
        : { changed: false, reason: 'unavailable' };
      ok = !!result?.changed;
      if (!ok) { notice = 'TRAY ORDER UNCHANGED'; noticeUntil = t + 2.0; AUDIO.menuMove?.(); }
    } else if (entry.kind === 'gear' && entry.actions?.primary?.id === actionId) {
      const action = entry.actions.primary;
      if (action.closeBefore) close();
      const result = onItemAction({
        itemId: entry.sourceId,
        entryId: entry.id,
        actionId: action.id,
        mode: action.mode,
      });
      ok = result !== false && result?.handled !== false;
      // Compatibility for isolated presentation fixtures that still pass the
      // pre-registry callback shape. The live inventory never takes this path.
      if (!ok && typeof entry.source?.action === 'function') {
        entry.source.action();
        ok = true;
      }
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

  function activateTertiary() {
    const entry = currentBagEntry(nav, model);
    const action = entry?.actions?.tertiary;
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

    update(dt) {
      t += dt;
      guideNudge += dt;
      if (notice && t >= noticeUntil) notice = '';
      pinGuide(activeGuide());
    },
    refresh,
    selectSection: setSection,
    selectRoom(roomId) {
      setSection('map');
      mapNav = reduceMapNav(mapNav, { type: 'SELECT_ROOM', roomId }, model.map);
      syncBagSelectionFromMap();
      remember();
    },
    selectFloor(floorId){
      setSection('map');
      mapNav=reduceMapNav(mapNav,{type:'SELECT_FLOOR',floorId},model.map);
      syncBagSelectionFromMap();remember();
    },

    debugState() {
      return {
        model, nav, mapNav, selected: currentBagEntry(nav, model), mapSelected: selectedMapSpace(mapNav, model.map),
        chosenTechniqueIds: [...chosenTechniqueIds], workingBuild: structuredClone(workingBuild),
      };
    },

    exit() { applyChosenSkills(); },

    key(e) {
      const raw = e.key || '';
      const k = raw.toLowerCase();
      const code = e.code || '';
      const closeKey = raw === 'Escape' || code === 'Escape' || k === 'b' || code === 'KeyB';

      if (nav.mode === 'confirm') {
        if (raw === 'Enter' || code === 'Enter' || raw === ' ' || code === 'Space') { confirmPending(); return true; }
        if (closeKey) { close(); return true; }
        return true;
      }

      if (closeKey) { close(); return true; }

      // The lock. One control is live; the rest of the case answers with the
      // callout, not with a refusal he would have to listen to later.
      const guided = lockedGuide();
      if (guided) {
        // Exactly one action is live, so every activation key opens it. The
        // callout names one of them; a player who reaches for the other should
        // not be told no by a lock that has nothing else to offer.
        const wants = raw === 'Enter' || code === 'Enter' || k === 'e' || code === 'KeyE'
          || raw === ' ' || code === 'Space' || k === 'z' || code === 'KeyZ';
        if (wants) { execute(currentBagEntry(nav, model), guidedAction(guided).id); return true; }
        refuseGuided();
        return true;
      }

      if (raw === 'Tab') { e.preventDefault?.(); selectSection(e.shiftKey ? -1 : 1); return true; }

      if (raw === '1' || code === 'Digit1') { setSection('kit'); return true; }
      if (raw === '2' || code === 'Digit2') { setSection('map'); return true; }
      if (raw === '3' || code === 'Digit3') { setSection('files'); return true; }
      if (raw === '4' || code === 'Digit4') { setSection('skills'); return true; }

      if (nav.sectionId === 'skills') {
        if (raw === 'ArrowUp' || k === 'w' || code === 'KeyW') { moveSkill(0, -1); return true; }
        if (raw === 'ArrowDown' || k === 's' || code === 'KeyS') { moveSkill(0, 1); return true; }
        if (raw === 'ArrowLeft' || k === 'a' || code === 'KeyA') { moveSkill(-1, 0); return true; }
        if (raw === 'ArrowRight' || k === 'd' || code === 'KeyD') { moveSkill(1, 0); return true; }
      } else if (nav.sectionId === 'kit') {
        if (k === 't' || code === 'KeyT') { readyOrClearKitEntry('ready'); return true; }
        if (k === 'r' || code === 'KeyR') { readyOrClearKitEntry('clear'); return true; }
        if (raw === 'ArrowUp' || k === 'w' || code === 'KeyW') { moveKitSpatial(0, -1); return true; }
        if (raw === 'ArrowDown' || k === 's' || code === 'KeyS') { moveKitSpatial(0, 1); return true; }
        if (raw === 'ArrowLeft' || k === 'a' || code === 'KeyA') { moveKitSpatial(-1, 0); return true; }
        if (raw === 'ArrowRight' || k === 'd' || code === 'KeyD') { moveKitSpatial(1, 0); return true; }
      } else if (nav.sectionId === 'map') {
        if (raw === '[' || code === 'BracketLeft') { changeFloor(-1); return true; }
        if (raw === ']' || code === 'BracketRight') { changeFloor(1); return true; }
        if (k === 'c' || code === 'KeyC') {
          mapNav = reduceMapNav(mapNav, { type: 'CENTER_PLAYER' }, model.map);
          syncBagSelectionFromMap();
          motion.selectionChangedAt = t;
          AUDIO.menuMove();
          remember();
          return true;
        }
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
      if (k === 'r' || code === 'KeyR') { activateTertiary(); return true; }
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
      const guided = lockedGuide();
      const layout = bagLayout({
        body,
        forceMode: typeof forceLayout === 'function' ? forceLayout() : forceLayout,
        guideRows: bagGuideRows(guided, body.w),
      });
      if (nav.sectionId !== 'map') {
        nav = ensureBagSelectionVisible(nav, model, bagListCapacity(layout, nav.sectionId));
      }
      const skills = nav.sectionId === 'skills';
      const liveHint = guided ? '' : (notice || (nav.sectionId === 'kit'
        ? 'READY NOW WORKS DURING CONTACT · BAG STORAGE DOES NOT · [T] READY · [R] CLEAR'
        : skills
          ? 'CHOOSE RECORDER MODIFICATIONS · THEY TAKE EFFECT WHEN THE CASE CLOSES'
          : hintSource()));
      drawBagView({ model, nav, mapNav, layout, hint: liveHint, guide: guided, guideNudge, motion, now: t,
        // The tree owns the content area for its own section; the tabs, task line
        // and action rail around it stay exactly as they are everywhere else.
        drawContent: skills
          ? (region) => drawSkillsSection({ model, layout: region, selectedId: selectedSkill()?.id || null, now: t })
          : null });
      debug?.({ model, nav, mapNav, layout, selected: currentBagEntry(nav, model), t });
    },
  };

  return scene;
}
