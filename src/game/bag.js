// AUDIOCORP field case.
//
// Inventory, Map, Sheets and Skills share one paused workspace. Navigation
// state is presentation memory; world simulation never advances underneath it.

import * as scenes from './scenes.js';
import * as AUDIO from '../audio/story-audio.js';
import { uiFill, uiScrim, uiSize, uiStrokeRect, uiText, uiWrap } from '../render/ui.js';
import { UI_COLOR } from '../render/palette.js';
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
import { bagGuideRows, bagInventoryGeometry, bagListCapacity, drawBagView } from '../render/bag-view.js';
import { drawSkillsSection, skillsTreeLayout } from '../render/bag-skills.js';
import { learnCombatTechnique, normalizeCombatBuild, pullCombatTechnique, TECHNIQUE_DEFS } from './combat-progression.js';
import { createHitRegions } from '../render/hit-regions.js';
import { makeEmbeddedDocumentReader } from './document.js';
import { sheetDialogueFor, sheetInsightComplete } from './bag-sheets.js';
import { mapLayoutFromBag } from '../render/map-layout.js';

let rememberedNav = null;
let rememberedSheetPages = {};

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
  assignEquipmentSlot = null,
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
  markSpace = null,
  onItemAction = () => false,
  getItemInspection = () => null,
  getSheetInsights = () => null,
  onSheetInsight = () => false,
  onClose = () => {},
  onClearInput = () => {},
  forceLayout = null,
  debug = null,
  memory = null,
  onRemember = () => {},
  getMonitorSource = null,
  embeddedHost = false,
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
  const sheetInsightSource=typeof getSheetInsights==='function'?getSheetInsights:()=>null;

  const settledBuild = normalizeCombatBuild(buildSource());
  let workingBuild = settledBuild;
  // What this session did. `chosenTechniqueIds` is patches; pulls are counted
  // separately because a session can now do only the second, and a session that
  // only pulls still changed the rig.
  let chosenTechniqueIds = [];
  let pulledTechniqueIds = [];
  let skillsApplied = false;
  // The build is DIRTY when it differs from what is on disk — not when
  // something was chosen. That distinction is the whole of the pull feature:
  // the old test was `chosenTechniqueIds.length`, so a session that only pulled
  // a lead committed nothing and the pull silently came back on close.
  const buildIsDirty = () => {
    const before = new Set(settledBuild.techniques);
    const after = new Set(workingBuild.techniques);
    return before.size !== after.size || [...after].some((id) => !before.has(id));
  };
  let model = buildBagModel({
    equipment: equipmentSource(), job: jobSource(), map: mapSource(), loadout: loadoutSource(),
    build: workingBuild, settledBuild, hasRig: rigSource(), sheetInsights:sheetInsightSource(),
  });
  let nav = (memory || rememberedNav) ? repairBagSelection(memory || rememberedNav, model) : initialBagState(model, focus || {});
  let mapNav = initialMapNav({ model: model.map, preferredRoomId: focus?.entryId?.replace(/^room:/, '') || null });
  if (nav.map) mapNav = reduceMapNav(nav.map, { type: 'MODEL_REFRESH' }, model.map);
  let t = 0;
  let notice = '';
  let noticeUntil = 0;
  const hits=createHitRegions();
  const routes=[{type:'root'}];
  const sheetPages={...rememberedSheetPages};
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
    rememberedSheetPages={...sheetPages};
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
      build: workingBuild, settledBuild, hasRig: rigSource(), sheetInsights:sheetInsightSource(),
    });
    nav = reduceBagNav(nav, { type: 'MODEL_REFRESH' }, model);
    mapNav = reduceMapNav(mapNav, { type: 'MODEL_REFRESH' }, model.map);
    if (nav.sectionId === 'map') syncBagSelectionFromMap();
    remember();
  }

  function close({suppressReopen=false}={}) {
    remember();
    // Close the case itself, not whichever overlay happens to be at the top of
    // the stack. Overlay scenes above the bag may decline the key and let the
    // bag handle it; a blind pop() removes the overlay and leaves the player
    // trapped in the case.
    // Labs may host this scene inside their own wrapper so they can add fixture
    // controls without duplicating the bag. In that case the host owns the
    // stack removal and `onClose` is the request to remove it.
    const removed = embeddedHost ? true : scenes.remove(scene);
    if (removed) {
      onClearInput({suppressReopen});
      onClose();
    }
  }

  function currentRoute(){return routes[routes.length-1]||routes[0];}
  function syncActionPresentation(){
    const route=currentRoute();
    nav={...nav,actionFocus:route?.type==='item-actions',actionIndex:route?.type==='item-actions'?route.index||0:0};
  }
  function pushRoute(route){
    if(!route)return;
    routes.push(route);
    syncActionPresentation();
    motion.actionAt=t;
  }
  function popRoute(){
    if(routes.length<=1)return false;
    const route=routes.pop();
    route.reader?.exit?.();
    syncActionPresentation();
    // Backing out is its own verb. This was menuMove — the same sound as
    // travelling down a list — so leaving a panel and stepping through one were
    // indistinguishable with your eyes shut.
    AUDIO.menuBack?.();
    return true;
  }

  function openImportantSheetDialogue(doc,{review=false}={}){
    const tree=sheetDialogueFor(doc?.id);
    if(!tree)return false;
    pushRoute({type:'sheet-dialog',document:doc,tree,index:0,answer:null,review:!!review});
    return true;
  }

  function finishSheetReader(route){
    const top=currentRoute();
    if(top===route)routes.pop();
    syncActionPresentation();
    const doc=route.document;
    const tree=sheetDialogueFor(doc?.id);
    if(tree&&!sheetInsightComplete(sheetInsightSource(),doc.id))openImportantSheetDialogue(doc);
  }

  function openSheet(doc){
    if(!doc)return false;
    // Progression observes the inspection immediately, exactly as it did when
    // the old document scene was pushed. Presentation now stays inside the bag.
    readDocument(doc);
    const route={type:'sheet-reader',document:doc,reader:null};
    route.reader=makeEmbeddedDocumentReader(doc,{
      initialPage:sheetPages[doc.id]||0,
      onSceneTurn:({page})=>{sheetPages[doc.id]=page;remember();},
      onSceneClose:(_closed,{page}={})=>{sheetPages[doc.id]=Number(page)||0;remember();finishSheetReader(route);},
    });
    pushRoute(route);
    route.reader.enter?.();
    return true;
  }

  function openItemInspection(entry){
    if(!entry)return false;
    pushRoute({type:'item-inspect',entryId:entry.id,tree:getItemInspection(entry.sourceId)||null,page:0});
    return true;
  }

  function applyChosenSkills() {
    if (skillsApplied) return;
    skillsApplied = true;
    if (!buildIsDirty() || typeof onApplySkills !== 'function') return;
    // `techniqueIds` is kept as the patched list so existing callers read the
    // same thing they always did; `patched` and `pulled` are the honest pair.
    onApplySkills(workingBuild, {
      techniqueIds: [...chosenTechniqueIds],
      patched: [...chosenTechniqueIds],
      pulled: [...pulledTechniqueIds],
    });
  }

  function setSection(sectionId) {
    if(routes.length>1){routes.splice(1);syncActionPresentation();}
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

  // PULL A LEAD. Any lead, not only one patched in this session — which is the
  // one-line difference that makes the rig re-riggable at all.
  //
  // The cascade is not computed here. pullCombatTechnique removes one id and
  // re-normalizes, and normalizeCombatBuild already drops anything whose chain
  // is broken; the old transitive walk over TECHNIQUE_DEFS was a second copy of
  // that rule, free to disagree with it.
  function pullCable(id){
    const result=pullCombatTechnique(workingBuild,id);
    if(!result.changed)return false;
    workingBuild=result.build;
    const pulled=new Set(result.pulled);
    // A lead patched this session and pulled again in the same session is a
    // no-op, not a pull: it never reached the disk.
    for(const technique of result.pulled){
      if(chosenTechniqueIds.includes(technique))continue;
      if(!pulledTechniqueIds.includes(technique))pulledTechniqueIds.push(technique);
    }
    chosenTechniqueIds=chosenTechniqueIds.filter((technique)=>!pulled.has(technique));
    notice=result.pulled.length>1
      ?`${entryLabelForTechnique(id)} PULLED · ${result.returned} LEADS BACK`
      :`${entryLabelForTechnique(id)} PULLED`;
    noticeUntil=t+2.2;
    return true;
  }

  function entryLabelForTechnique(id){
    return model.sections.find((section)=>section.id==='skills')?.entries.find((entry)=>entry.techniqueId===id)?.label||'CHOICE';
  }

  function actionFor(entry,actionId){
    return entry?.actionList?.find((action)=>action.id===actionId)
      || [entry?.actions?.primary,entry?.actions?.secondary,entry?.actions?.tertiary].find((action)=>action?.id===actionId)
      || null;
  }

  function execute(entry, actionId, {confirmed=false}={}) {
    if (!entry || !actionId) return false;
    const descriptor=actionFor(entry,actionId);
    if(descriptor?.enabled===false){notice=descriptor.reason||'UNAVAILABLE';noticeUntil=t+2.4;AUDIO.menuMove?.();return false;}
    if(descriptor?.confirm&&!confirmed){pushRoute({type:'confirm',entryId:entry.id,actionId,descriptor});AUDIO.menuConfirm?.();return true;}
    let ok = false;

    if (nav.sectionId === 'map') {
      const selected = selectedMapSpace(mapNav, model.map);
      if(actionId==='read-attached')ok=selected?.objective?.notes?.[0]?openSheet(selected.objective.notes[0]):false;
      else ok = resolveMapAction(selected, actionId, { readDocument:openSheet, markRoom, markSpace:markSpace||null });
    } else if (entry.kind === 'file' && actionId === 'read') {
      ok=openSheet(entry.source);
    } else if(entry.kind==='file'&&actionId==='review-insight'){
      ok=openImportantSheetDialogue(entry.source,{review:true});
    } else if (entry.kind === 'file' && (actionId === 'mark-room' || actionId === 'unmark-room')) {
      const selected=model.map?.spaces?.find((space)=>space.roomId===entry.roomId)||null;
      ok=selected&&typeof markSpace==='function'?!!markSpace(selected):(entry.roomId ? markRoom(entry.roomId) : false);
    } else if (entry.kind === 'room' && (actionId === 'mark' || actionId === 'unmark')) {
      const selected=selectedMapSpace(mapNav,model.map);
      ok=selected&&typeof markSpace==='function'?!!markSpace(selected):markRoom(entry.roomId);
    } else if (entry.kind === 'room' && actionId === 'read-attached') {
      if (entry.attached) ok=openSheet(entry.attached);
    } else if(entry.kind==='gear'&&actionId==='set-slot'){
      pushRoute({type:'slot-picker',entryId:entry.id,index:Math.max(0,entry.topIndex)});ok=true;
    } else if(entry.kind==='gear'&&(actionId==='unset-slot'||actionId==='move-storage')){
      const result=typeof moveEquipment==='function'?moveEquipment(entry.sourceId,'storage'):{changed:false,reason:'unavailable'};
      ok=!!result?.changed;
      if(!ok){notice='QUICK SLOT UNCHANGED';noticeUntil=t+2.0;}
    } else if(entry.kind==='gear'&&actionId==='inspect-item'){
      ok=openItemInspection(entry);
    } else if (entry.kind === 'gear' && actionId === 'move-top') {
      pushRoute({type:'slot-picker',entryId:entry.id,index:0});ok=true;
    } else if (entry.kind === 'skill' && actionId === 'patch-cable') {
      const result = learnCombatTechnique(workingBuild, entry.techniqueId, { hasRig: rigSource() });
      ok = !!result.changed;
      if (ok) {
        workingBuild = result.build;
        chosenTechniqueIds = [...chosenTechniqueIds, entry.techniqueId];
        pulledTechniqueIds = pulledTechniqueIds.filter((technique) => technique !== entry.techniqueId);
        notice = `${entry.label} PATCHED · TAKES EFFECT WHEN THE CASE CLOSES`;
        noticeUntil = t + 3.2;
      } else {
        notice = entry.blockedBy || 'NOT AVAILABLE';
        noticeUntil = t + 2.6;
      }
    } else if(entry.kind==='skill'&&actionId==='pull-cable'){
      ok=pullCable(entry.techniqueId);
    } else if (entry.kind === 'gear' && actionId === 'reorder-up') {
      const result = typeof reorderEquipment === 'function' ? reorderEquipment(entry.sourceId, 'up') : { changed: false, reason: 'unavailable' };
      ok = !!result?.changed;
      if (!ok) { notice = 'TRAY ORDER UNCHANGED'; noticeUntil = t + 2.0; }
    } else if (entry.kind === 'gear' && (descriptor||entry.actions?.primary)) {
      const action=descriptor||entry.actions.primary;
      if(action.exitPolicy==='close'||action.closeBefore)close();
      const result=onItemAction({itemId:entry.sourceId,entryId:entry.id,actionId:action.id,mode:action.mode||action.verb});
      ok=result!==false&&result?.handled!==false;
      if(!ok&&typeof entry.source?.action==='function'){entry.source.action();ok=true;}
    }

    if (ok) {
      motion.actionAt = t;
      AUDIO.menuConfirm();
      if(descriptor?.exitPolicy!=='close')refresh();
    } else {
      // EVERY REFUSAL IN THE CASE SOUNDS THE SAME, AND IT IS NOT A MOVE.
      //
      // The blocked branches used to play menuMove — the sound of the selection
      // travelling — which said "something happened" when nothing had. They set
      // their notice and fall through to here now, so one denial sound covers
      // NOT AVAILABLE, TRAY ORDER UNCHANGED, a refused item action and a skill
      // that will not pull.
      AUDIO.menuDenied?.();
    }
    return ok;
  }

  function activatePrimary() {
    const entry = currentBagEntry(nav, model);
    if(nav.sectionId==='kit'&&entry?.kind==='gear'){
      pushRoute({type:'item-actions',entryId:entry.id,index:0});
      AUDIO.menuConfirm?.();
      return;
    }
    if(nav.sectionId==='map'){
      // CONFIRM ON A PLAN MARKS THE PLAN. Enter used to open whatever sheet
      // happened to be pinned to the selected room, so the map's own confirm key
      // read as "open a document" — the one verb the map is for was on a key
      // nobody had been told about. Setting the target is the primary action;
      // the attached file keeps its own action on the rail ([R]).
      activateSecondary();
      return;
    }
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
    if(nav.sectionId==='map'){
      const selected=selectedMapSpace(mapNav,model.map);
      if(!selected||selected.waypointable===false)return;
      const actionId=selected.waypoint?'clear-waypoint':'mark-waypoint';
      const entry=currentBagEntry(nav,model)||{id:`room:${selected.roomId||selected.id}`,kind:'room',roomId:selected.roomId,actionList:[]};
      execute(entry,actionId);
      return;
    }
    const entry = currentBagEntry(nav, model);
    const action = entry?.actions?.secondary;
    if (action) execute(entry, action.id);
  }

  function activateTertiary() {
    if(nav.sectionId==='map'){
      const selected=selectedMapSpace(mapNav,model.map);
      if(selected?.objective?.notes?.[0])openSheet(selected.objective.notes[0]);
      return;
    }
    const entry = currentBagEntry(nav, model);
    const action = entry?.actions?.tertiary;
    if (action) execute(entry, action.id);
  }

  function confirmPending() {
    const pending=currentRoute();
    if(pending?.type!=='confirm')return;
    routes.pop();syncActionPresentation();
    const entry = bagEntry(model, nav.sectionId, pending.entryId);
    execute(entry, pending.actionId,{confirmed:true});
  }

  const confirmInput=(e)=>e.key==='Enter'||e.code==='Enter'||e.key===' '||e.code==='Space'||e.controllerAction==='confirm';
  const backInput=(e)=>e.key==='Escape'||e.code==='Escape'||e.controllerAction==='back'||e.controllerAction==='menu';
  const bagCloseInput=(e)=>String(e.key||'').toLowerCase()==='b'||e.code==='KeyB'||e.controllerAction==='bag';
  const upInput=(e)=>e.key==='ArrowUp'||String(e.key||'').toLowerCase()==='w'||e.code==='KeyW';
  const downInput=(e)=>e.key==='ArrowDown'||String(e.key||'').toLowerCase()==='s'||e.code==='KeyS';

  function handleRouteKey(e){
    const route=currentRoute();
    if(route.type==='root')return false;
    if(route.type==='sheet-reader'){
      if(backInput(e)){route.reader.key?.(e);return true;}
      route.reader.key?.(e);return true;
    }
    if(route.type==='confirm'){
      if(confirmInput(e)){confirmPending();return true;}
      if(backInput(e)){popRoute();return true;}
      return true;
    }
    if(route.type==='item-actions'){
      const entry=bagEntry(model,'kit',route.entryId);
      const actions=entry?.actionList||[];
      if(upInput(e)||downInput(e)){
        route.index=(route.index+(downInput(e)?1:-1)+Math.max(1,actions.length))%Math.max(1,actions.length);
        syncActionPresentation();AUDIO.menuMove?.();return true;
      }
      if(confirmInput(e)){
        const action=actions[route.index||0];
        if(action?.enabled===false){notice=action.reason;noticeUntil=t+2.4;AUDIO.menuMove?.();return true;}
        if(action){routes.pop();syncActionPresentation();execute(entry,action.id);}
        return true;
      }
      if(backInput(e)||e.key==='ArrowLeft'){popRoute();return true;}
      return true;
    }
    if(route.type==='slot-picker'){
      const capacity=Math.max(1,model.loadout?.capacity||4);
      if(upInput(e)||e.key==='ArrowLeft'){route.index=(route.index-1+capacity)%capacity;AUDIO.menuMove?.();return true;}
      if(downInput(e)||e.key==='ArrowRight'){route.index=(route.index+1)%capacity;AUDIO.menuMove?.();return true;}
      if(confirmInput(e)){
        const entry=bagEntry(model,'kit',route.entryId);
        const result=typeof assignEquipmentSlot==='function'?assignEquipmentSlot(entry?.sourceId,route.index):{changed:false,reason:'unavailable'};
        if(result?.changed){popRoute();refresh();AUDIO.menuConfirm?.();}
        else{notice=result?.reason==='already-in-slot'?'ALREADY SET IN THAT SLOT':'QUICK SLOT UNCHANGED';noticeUntil=t+2.2;AUDIO.menuMove?.();}
        return true;
      }
      if(backInput(e)){popRoute();return true;}
      return true;
    }
    if(route.type==='sheet-dialog'){
      if(route.answer){
        if(confirmInput(e)||backInput(e)){route.answer=null;AUDIO.menuMove?.();return true;}
        return true;
      }
      const choices=route.tree?.choices||[];
      if(upInput(e)||downInput(e)){
        route.index=(route.index+(downInput(e)?1:-1)+Math.max(1,choices.length))%Math.max(1,choices.length);
        AUDIO.menuMove?.();return true;
      }
      if(confirmInput(e)){
        const choice=choices[route.index||0];
        if(choice?.done){
          if(!route.review)onSheetInsight(route.document?.id);
          popRoute();refresh();AUDIO.menuConfirm?.();
        }else if(choice){route.answer=choice;AUDIO.menuConfirm?.();}
        return true;
      }
      if(backInput(e)){popRoute();return true;}
      return true;
    }
    if(route.type==='item-inspect'){
      if(backInput(e)||confirmInput(e)){popRoute();return true;}
      return true;
    }
    if(backInput(e)){popRoute();return true;}
    return true;
  }

  const fit=(value,width)=>{const s=String(value??'');const w=Math.max(1,Math.floor(width));return s.length<=w?s:w<=1?'…':`${s.slice(0,w-1)}…`;};
  function contentRegion(layout){
    return layout.mode==='wide'
      ? {x:layout.list.x,y:layout.list.y,w:(layout.detail.x+layout.detail.w)-layout.list.x,h:layout.list.h}
      : {x:layout.list.x,y:layout.detail.y,w:layout.list.w,h:(layout.list.y+layout.list.h)-layout.detail.y};
  }
  function panel(rect,{danger=false}={}){
    uiFill(rect.x,rect.y,rect.w,rect.h,danger?'rgba(70,22,12,.28)':'rgba(255,255,255,.025)');
    uiStrokeRect(rect.x,rect.y,rect.w,rect.h,danger?UI_COLOR.danger:UI_COLOR.frame,danger ? .65 : .35,1);
  }
  function wrapped(textValue,x,y,w,maxRows,cls='ui-secondary',alpha=.76){
    const lines=uiWrap(String(textValue||''),Math.max(8,w)).slice(0,Math.max(0,maxRows));
    lines.forEach((line,index)=>uiText(x,y+index,fit(line,w),cls,alpha));
    return lines.length;
  }

  function drawSubview(route,rect){
    panel(rect,{danger:route.type==='confirm'});
    const x=rect.x+2,y=rect.y+1,w=Math.max(8,rect.w-4),h=Math.max(4,rect.h-2);
    if(route.type==='confirm'){
      const entry=bagEntry(model,nav.sectionId,route.entryId);
      uiText(x,y,fit(route.descriptor?.confirm?.title||`CONFIRM ${entry?.title||'ACTION'}?`,w),'ui-danger',1);
      wrapped(route.descriptor?.confirm?.body||'THIS CANNOT BE UNDONE.',x,y+2,w,Math.max(1,h-5),'ui-primary',.85);
      uiText(x,y+h-2,'[ENTER] CONFIRM','ui-danger',.95);
      uiText(x+Math.max(18,Math.floor(w*.45)),y+h-2,'[ESC] CANCEL','ui-secondary',.75);
      return;
    }
    if(route.type==='slot-picker'){
      const entry=bagEntry(model,'kit',route.entryId),slots=Array.from({length:model.loadout.capacity},(_,index)=>model.loadout.top[index]||null);
      uiText(x,y,`SET ${entry?.title||'ITEM'} · CHOOSE A QUICK SLOT`,'ui-amber',.95);
      uiText(x,y+1,'IF THE SLOT IS FULL, ITS OLD ITEM STAYS IN THE BAG.','ui-secondary',.68);
      const rowY=y+3,rowW=Math.max(10,Math.floor((w-Math.max(0,slots.length-1))/slots.length));
      slots.forEach((itemId,index)=>{
        const bx=x+index*(rowW+1),on=index===(route.index||0);
        uiFill(bx,rowY,rowW,4,on?'rgba(216,138,59,.18)':'rgba(255,255,255,.025)');
        uiStrokeRect(bx,rowY,rowW,4,on?UI_COLOR.amber:UI_COLOR.frame,on ? .9 : .3,on?1.5:1);
        uiText(bx+1,rowY,`[${index+1}]`,on?'ui-amber':'ui-blue',on?1:.65);
        const occupant=model.sections.find((section)=>section.id==='kit')?.entries.find((candidate)=>candidate.sourceId===itemId);
        uiText(bx+1,rowY+2,fit(occupant?.title||'EMPTY',rowW-2),occupant?'ui-primary':'ui-secondary',on ? .9 : .55);
      });
      uiText(x,y+h-2,'[← / →] SLOT   [ENTER] SET   [ESC] BACK   [B] CLOSE BAG','ui-label',.75);
      return;
    }
    if(route.type==='item-inspect'){
      const entry=bagEntry(model,'kit',route.entryId);
      uiText(x,y,fit(`INVENTORY / ${entry?.title||'ITEM'}`,w),'ui-amber',1);
      let cy=y+2;
      cy+=wrapped(entry?.description||'',x,cy,w,3,'ui-primary',.82)+1;
      for(const [label,value] of entry?.facts||[]){
        if(cy>=y+h-3)break;
        uiText(x,cy,fit(label,14),'ui-label',.62);uiText(x+16,cy,fit(value,w-16),'ui-primary',.78);cy++;
      }
      const lines=route.tree?.start?.lines||[];
      if(lines.length&&cy<y+h-2){cy++;for(const line of lines){if(cy>=y+h-2)break;cy+=wrapped(line?.text||line,x,cy,w,2,line?.who==='you'?'ui-amber':'ui-secondary',.78);}}
      uiText(x,y+h-1,'[ESC / ENTER] BACK   [B] CLOSE BAG','ui-label',.72);
      return;
    }
    if(route.type==='sheet-dialog'){
      uiText(x,y,fit(`SHEETS / IMPORTANT / ${route.tree?.title||route.document?.title||''}`,w),'ui-amber',1);
      if(route.answer){
        uiText(x,y+2,route.answer.label,'ui-blue',.86);
        wrapped(route.answer.text,x,y+4,w,Math.max(1,h-7),'ui-primary',.9);
        uiText(x,y+h-1,'[ENTER / ESC] QUESTIONS   [B] CLOSE BAG','ui-label',.72);
        return;
      }
      uiText(x,y+2,route.tree?.prompt||'WHAT MATTERS HERE?','ui-primary',.9);
      (route.tree?.choices||[]).forEach((choice,index)=>{
        const row=y+4+index,on=index===(route.index||0);
        uiText(x,row,on?'▸':' ',on?'ui-amber':'ui-secondary',on?1:.5);
        uiText(x+2,row,choice.label,on?'ui-amber':'ui-primary',on?1:.76);
      });
      uiText(x,y+h-1,'[↑ / ↓] CHOOSE   [ENTER] OPEN   [ESC] BACK   [B] CLOSE BAG','ui-label',.72);
    }
  }

  function selectEntry(sectionId,entryId){
    nav=reduceBagNav(nav,{type:'SELECT_ENTRY',sectionId,entryId},model);
    motion.selectionChangedAt=t;remember();
  }

  function addHit(region){hits.add(region);}
  function registerCommonHits(outer,layout){
    addHit({id:'bag:close',kind:'bag-close',x:outer.x+outer.w-18,y:outer.y,w:18,h:2,label:'CLOSE BAG',onClick:close});
    const sections=model.sections||[],compact=layout.mode==='compact',gap=compact?1:2;
    const labels=sections.map((section)=>{
      const short=section.id==='kit'?'I':section.id==='map'?'M':section.id==='skills'?'K':'S';
      const core=compact?`${short} ${section.countLabel}`:`${section.label} ${section.countLabel}`;
      return section.id===nav.sectionId?`[${compact?'':' '}${core}${compact?'':' '}]`:core;
    });
    const total=labels.reduce((sum,label)=>sum+label.length,0)+gap*Math.max(0,labels.length-1);
    let tabX=layout.tabs.x+Math.max(0,Math.floor((layout.tabs.w-total)/2));
    sections.forEach((section,index)=>{
      const width=Math.min(labels[index].length,Math.max(1,layout.tabs.x+layout.tabs.w-tabX));
      addHit({id:`bag:tab:${section.id}`,kind:'bag-tab',x:tabX,y:layout.tabs.y,w:width,h:2,label:section.label,onClick:()=>setSection(section.id)});
      tabX+=labels[index].length+gap;
    });
  }

  function registerRootHits(layout){
    if(nav.sectionId==='kit'){
      const geo=bagInventoryGeometry(model,nav,layout),entries=model.sections.find((section)=>section.id==='kit')?.entries||[];
      const cap=Math.max(1,Math.floor((geo.list.h-1)/2)),selected=bagEntry(model,'kit',nav.selected?.kit),at=Math.max(0,entries.findIndex((entry)=>entry.id===selected?.id));
      const scroll=Math.max(0,Math.min(at>=cap?at-cap+1:0,Math.max(0,entries.length-cap)));
      entries.slice(scroll,scroll+cap).forEach((entry,index)=>addHit({id:`bag:item:${entry.id}`,kind:'bag-item',x:geo.list.x,y:geo.list.y+1+index*2,w:geo.list.w,h:2,label:entry.title,onHover:()=>selectEntry('kit',entry.id),onClick:()=>{selectEntry('kit',entry.id);pushRoute({type:'item-actions',entryId:entry.id,index:0});}}));
      const detailRows=Math.min(3,Math.max(1,geo.detail.h-8)),start=geo.detail.y+2+detailRows+1;
      const visibleActions=Math.max(1,geo.detail.y+geo.detail.h-start);
      (selected?.actionList||[]).slice(0,visibleActions).forEach((action,index)=>addHit({id:`bag:action:${action.id}`,kind:'bag-action',x:geo.detail.x+1,y:start+index,w:Math.max(1,geo.detail.w-2),h:1,label:action.label,disabled:!action.enabled,onHover:()=>{const route=currentRoute();if(route.type==='item-actions'){route.index=index;syncActionPresentation();}},onClick:()=>{
        if(!action.enabled){notice=action.reason;noticeUntil=t+2.2;return;}
        if(currentRoute().type==='item-actions'){routes.pop();syncActionPresentation();}
        execute(selected,action.id);
      }}));
    }else if(nav.sectionId==='sheets'){
      const section=model.sections.find((candidate)=>candidate.id==='sheets'),cap=bagListCapacity(layout,'sheets'),scroll=nav.scroll?.sheets||0;
      (section?.entries||[]).slice(scroll,scroll+cap).forEach((entry,index)=>addHit({id:`bag:sheet:${entry.id}`,kind:'bag-sheet',x:layout.list.x,y:layout.list.y+2+index*2,w:layout.list.w,h:1,label:entry.title,onHover:()=>selectEntry('sheets',entry.id),onClick:()=>{selectEntry('sheets',entry.id);openSheet(entry.source);}}));
    }else if(nav.sectionId==='map'){
      const mapLayout=mapLayoutFromBag(layout),floors=model.map?.floors||[];
      let floorX=mapLayout.floorRail.x;
      floors.forEach((floor)=>{
        const width=`[${floor.shortLabel||floor.label}]`.length;
        addHit({id:`bag:floor:${floor.id}`,kind:'map-floor',x:floorX,y:mapLayout.floorRail.y,w:width,h:1,label:floor.label,onClick:()=>scene.selectFloor(floor.id)});
        floorX+=width+1;
      });
      const floorSpaces=(model.map?.spaces||[]).filter((space)=>space.floorId===mapNav.floorId&&space.selectable!==false);
      const listRows=Math.max(1,Math.min(floorSpaces.length,Math.floor(mapLayout.detail.h*.44)));
      const selectedAt=Math.max(0,floorSpaces.findIndex((space)=>space.id===selectedMapSpace(mapNav,model.map)?.id));
      const start=Math.max(0,Math.min(selectedAt-Math.floor(listRows/2),floorSpaces.length-listRows));
      floorSpaces.slice(start,start+listRows).forEach((space,index)=>addHit({id:`bag:space:${space.id}`,kind:'map-space',x:mapLayout.detail.x,y:mapLayout.detail.y+1+index,w:mapLayout.detail.w,h:1,label:space.label,onHover:()=>{mapNav=reduceMapNav(mapNav,{type:'SELECT_SPACE',spaceId:space.id},model.map);remember();},onClick:()=>{
        const alreadySelected=selectedMapSpace(mapNav,model.map)?.id===space.id;
        mapNav=reduceMapNav(mapNav,{type:'SELECT_SPACE',spaceId:space.id},model.map);remember();
        if(alreadySelected&&space.waypointable!==false)activateSecondary();
      }}));
    }else if(nav.sectionId==='skills'){
      const section=model.sections.find((candidate)=>candidate.id==='skills'),region=contentRegion(layout),tree=skillsTreeLayout({region,branches:section?.tree?.branches||[],maxTier:section?.tree?.maxTier||1});
      (section?.tree?.branches||[]).forEach((branch,branchIndex)=>branch.entries.forEach((entry)=>addHit({id:`bag:skill:${entry.id}`,kind:'bag-skill',x:tree.columnX(branchIndex)+.5,y:tree.tileY(entry.tier),w:tree.tileW,h:Math.max(1,tree.tileH-.35),label:entry.label,onHover:()=>selectSkill(entry),onClick:()=>{selectSkill(entry);if(entry.actions?.primary)execute(entry,entry.actions.primary.id);}})));
    }
  }

  function registerSubviewHits(route,layout){
    const rect=contentRegion(layout),x=rect.x+2,y=rect.y+1,w=rect.w-4,h=rect.h-2;
    if(route.type==='confirm'){
      addHit({id:'bag:confirm',kind:'bag-confirm',x,y:y+h-3,w:16,h:2,label:'CONFIRM',onClick:confirmPending});
      addHit({id:'bag:cancel',kind:'bag-cancel',x:x+18,y:y+h-3,w:16,h:2,label:'CANCEL',onClick:popRoute});
    }else if(route.type==='slot-picker'){
      const capacity=Math.max(1,model.loadout.capacity),rowW=Math.max(10,Math.floor((w-Math.max(0,capacity-1))/capacity));
      for(let index=0;index<capacity;index++)addHit({id:`bag:slot:${index}`,kind:'bag-slot',x:x+index*(rowW+1),y:y+3,w:rowW,h:4,label:`SLOT ${index+1}`,onHover:()=>{route.index=index;},onClick:()=>{route.index=index;handleRouteKey({key:'Enter',code:'Enter'});}});
    }else if(route.type==='sheet-dialog'&&!route.answer){
      (route.tree?.choices||[]).forEach((choice,index)=>addHit({id:`bag:sheet-choice:${choice.id}`,kind:'sheet-choice',x,y:y+4+index,w,h:1,label:choice.label,onHover:()=>{route.index=index;},onClick:()=>{route.index=index;handleRouteKey({key:'Enter',code:'Enter'});}}));
    }else addHit({id:'bag:subview-back',kind:'bag-back',x,y,w,h,label:'BACK',onClick:popRoute});
  }

  const scene = {
    id: 'bag',
    blocksInput: true,
    blocksWorld: true,
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
      currentRoute()?.reader?.update?.(dt);
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
        route:{...currentRoute(),reader:currentRoute()?.reader?.view?.()||null},hitRegions:hits.view(),sheetPages:{...sheetPages},
      };
    },

    exit() { currentRoute()?.reader?.exit?.(); applyChosenSkills(); },

    key(e) {
      const raw = e.key || '';
      const k = raw.toLowerCase();
      const code = e.code || '';
      if (bagCloseInput(e)) { close({suppressReopen:true}); return true; }
      if(currentRoute().type!=='root')return handleRouteKey(e);
      if (backInput(e)) { close(); return true; }

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

      if (raw === 'Tab'||e.controllerAction==='tabNext'||e.controllerAction==='tabPrev') { e.preventDefault?.(); selectSection(e.shiftKey||e.controllerAction==='tabPrev' ? -1 : 1); return true; }

      if (raw === '1' || code === 'Digit1') { setSection('kit'); return true; }
      if (raw === '2' || code === 'Digit2') { setSection('map'); return true; }
      if (raw === '3' || code === 'Digit3') { setSection('sheets'); return true; }
      if (raw === '4' || code === 'Digit4') { setSection('skills'); return true; }

      if (nav.sectionId === 'skills') {
        if (raw === 'ArrowUp' || k === 'w' || code === 'KeyW') { moveSkill(0, -1); return true; }
        if (raw === 'ArrowDown' || k === 's' || code === 'KeyS') { moveSkill(0, 1); return true; }
        if (raw === 'ArrowLeft' || k === 'a' || code === 'KeyA') { moveSkill(-1, 0); return true; }
        if (raw === 'ArrowRight' || k === 'd' || code === 'KeyD') { moveSkill(1, 0); return true; }
      } else if (nav.sectionId === 'kit') {
        if (k === 't' || code === 'KeyT') { execute(currentBagEntry(nav,model),'set-slot'); return true; }
        if (k === 'r' || code === 'KeyR') { readyOrClearKitEntry('clear'); return true; }
        if (raw === 'ArrowUp' || k === 'w' || code === 'KeyW') { moveList(-1); return true; }
        if (raw === 'ArrowDown' || k === 's' || code === 'KeyS') { moveList(1); return true; }
        if (raw === 'ArrowRight' || k === 'd' || code === 'KeyD') { activatePrimary(); return true; }
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
        if (raw === 'ArrowUp' || k === 'w' || code === 'KeyW') { moveList(-1); return true; }
        if (raw === 'ArrowDown' || k === 's' || code === 'KeyS') { moveList(1); return true; }
      }

      if (raw === 'Enter' || code === 'Enter' || k === 'e' || code === 'KeyE') { activatePrimary(); return true; }
      if (raw === ' ' || code === 'Space' || k === 'z' || code === 'KeyZ') { activateSecondary(); return true; }
      if (k === 'r' || code === 'KeyR') { activateTertiary(); return true; }
      return true;
    },

    pointer(e){
      if(e.type==='pointermove'){hits.handle(e,{click:false});return true;}
      if(e.type==='pointerdown'){hits.handle(e);return true;}
      return true;
    },

    render() {
      hits.reset();
      const route=currentRoute();
      if(route.type==='sheet-reader'){
        const size=uiSize(),reader=route.reader.view?.()||{page:0,total:1};
        route.reader.render?.();
        uiFill(0,0,size.cols,3,'rgba(8,10,11,.94)');
        const compactTabs=size.cols<58,closeW=Math.min(14,Math.max(8,size.cols)),closeX=Math.max(0,size.cols-closeW);
        let tabX=2;
        for(const section of model.sections||[]){
          const short=section.id==='kit'?'I':section.id==='map'?'M':section.id==='skills'?'K':'S';
          const name=compactTabs?short:section.label;
          const label=`[${section.id==='sheets'?' ':''}${name}${section.id==='sheets'?' ':''}]`;
          uiText(tabX,0,label,section.id==='sheets'?'ui-amber':'ui-secondary',section.id==='sheets'?1:.68);
          addHit({id:`bag:sheet-tab:${section.id}`,kind:'bag-tab',x:tabX,y:0,w:label.length,h:2,label:section.label,onClick:()=>setSection(section.id)});
          tabX+=label.length+2;
        }
        uiText(2,1,fit(`FIELD CASE / SHEETS / ${route.document?.title||route.document?.id||'DOCUMENT'}`,Math.max(8,closeX-3)),'ui-label',.72);
        uiText(closeX,1,'[B] CLOSE BAG','ui-amber',.9);
        addHit({id:'bag:sheet-close',kind:'bag-close',x:closeX,y:1,w:closeW,h:2,label:'CLOSE BAG',onClick:close});
        addHit({id:'bag:sheet-back',kind:'bag-back',x:0,y:Math.max(0,size.rows-4),w:Math.max(8,Math.floor(size.cols*.25)),h:4,label:'BACK TO SHEETS',onClick:()=>route.reader.key?.({key:'Escape',code:'Escape'})});
        if(reader.page>0)addHit({id:'bag:sheet-prev',kind:'sheet-page',x:Math.floor(size.cols*.25),y:Math.max(0,size.rows-4),w:Math.floor(size.cols*.25),h:4,label:'PREVIOUS PAGE',onClick:()=>route.reader.key?.({key:'ArrowLeft',code:'ArrowLeft'})});
        if(reader.page<reader.total-1)addHit({id:'bag:sheet-next',kind:'sheet-page',x:Math.floor(size.cols*.5),y:Math.max(0,size.rows-4),w:Math.floor(size.cols*.5),h:4,label:'NEXT PAGE',onClick:()=>route.reader.key?.({key:'ArrowRight',code:'ArrowRight'})});
        debug?.({ model, nav, mapNav, layout:null, selected: currentBagEntry(nav, model), route, hitRegions:hits.view(), t });
        return;
      }
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
      const subview=!['root','item-actions'].includes(route.type);
      const selected=currentBagEntry(nav,model);
      const sectionLabel=model.sections.find((section)=>section.id===nav.sectionId)?.label||nav.sectionId;
      const breadcrumb=`FIELD CASE / ${sectionLabel}${route.type==='item-actions'&&selected?` / ${selected.title} / ACTIONS`:''}`;
      const liveHint = guided ? '' : (notice || (nav.sectionId === 'kit'
        ? 'ONE INVENTORY · NUMBERED QUICK SLOTS FOR FIGHTS · SELECT AN ITEM FOR SET / USE / DROP / INSPECT'
        : skills
          ? 'PATCH THE BACK OF THE RECORDER · PULL A LEAD TO MOVE IT · TAKES EFFECT WHEN THE CASE CLOSES'
          : hintSource()));
      drawBagView({ model, nav, mapNav, layout, hint: liveHint, guide: guided, guideNudge, motion, now: t,
        // The tree owns the content area for its own section; the tabs, task line
        // and action rail around it stay exactly as they are everywhere else.
        drawContent: subview
          ? (region)=>drawSubview(route,region)
          : skills
          ? (region) => drawSkillsSection({ model, layout: region, selectedId: selectedSkill()?.id || null, now: t })
          : null,
        overrideActions:subview?[['ESC','BACK'],['B','CLOSE BAG']]:null,breadcrumb });
      uiText(Math.max(outer.x+2,outer.x+outer.w-18),outer.y,'[B] CLOSE BAG','ui-amber',.9);
      registerCommonHits(outer,layout);
      if(subview)registerSubviewHits(route,layout);else registerRootHits(layout);
      debug?.({ model, nav, mapNav, layout, selected: currentBagEntry(nav, model), route, hitRegions:hits.view(), t });
    },
  };

  return scene;
}
