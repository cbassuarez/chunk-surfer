// AUDIOCORP field case.
//
// Inventory, Map, Sheets and Skills share one paused workspace. Navigation
// state is presentation memory; world simulation never advances underneath it.

import * as scenes from './scenes.js';
import { roomHistory } from '../data/room-history.js';
import * as AUDIO from '../audio/story-audio.js';
import { uiFill, uiScrim, uiSize, uiCellMetrics, uiStrokeRect, uiText, uiWrap } from '../render/ui.js';
import { UI_COLOR } from '../render/palette.js';
import { withMachinePanel, drawLampButton } from '../render/presentation.js';
import { drawPrintedText } from '../render/keycap.js';
import { bagTabRegions, bagTabButtonState, BAG_TABS_HEIGHT } from '../render/bag-tabs.js';
import { buildBagModel, bagEntry, bagSection, EMPTY_JOB, normalizeBagSectionId } from './bag-model.js';
import {
  currentBagEntry,
  ensureBagSelectionVisible,
  initialBagState,
  reduceBagNav,
  repairBagSelection,
} from './bag-navigation.js';
import { initialMapNav, reduceMapNav, selectedMapSpace, moveMapConsoleFocus, MAP_VIEW_DEFAULTS } from './map-navigation.js';
import { resolveMapAction } from './map-actions.js';
import { pointInMapPolygon, mapArchitecturalHeight, createMapAxonometricProjection } from './map-axonometric.js';
import { bagLayout, bagPanelBounds } from '../render/bag-layout.js';
import { bagInventoryGeometry, bagInventoryListLayout, bagInventoryActionLayout, bagListCapacity, drawBagView } from '../render/bag-view.js';
import { bagGuideFrame, drawBagGuideCallouts } from '../render/bag-tour.js';
import { drawSkillsSection, patchBayLayout } from '../render/bag-skills.js';
import { normalizeCombatBuild, pullCombatTechnique } from './combat-progression.js';
import { skillPatchSource, skillPatchAvailability, compatibleSkillInputs, connectSkillPatch } from './skill-patchbay.js';
import { createHitRegions } from '../render/hit-regions.js';
import { makeEmbeddedDocumentReader } from './document.js';
import { mapLayoutFromBag } from '../render/map-layout.js';
import { sheetDialogueFor, sheetInsightComplete } from './bag-sheets.js';
import { pressControl, releaseControl, cancelControlScope } from './control-feedback.js';
import {createItemInspection,itemInspectionStats} from './item-inspection.js';
import {drawItemInspectionView,itemInspectionLayout} from '../render/item-inspection-view.js';
import {preloadItemPortraits} from '../render/item-portraits.js';

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
  getMapUnavailableReason = null,
  hint = '',
  getHint = null,
  focus = null,
  getFocus = null,
  guide = null,
  getGuide = null,
  onGuideEvent = () => {},
  // The SKILLS tab works on a case-local copy. Gameplay truth changes only as
  // the case closes, so browsing and choosing never rewrites the live build out
  // from under the player.
  getBuild = null,
  hasRig = null,
  onApplySkills = null,
  readDocument = () => {},
  markRoom = () => false,
  markSpace = null,
  setMapTarget = null,
  clearMapTarget = null,
  onItemAction = () => false,
  getItemInspection = () => null,
  onInspectEquipment = () => false,
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
  const mapUnavailableSource = typeof getMapUnavailableReason === 'function' ? getMapUnavailableReason : () => '';
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
    mapUnavailableReason: mapUnavailableSource(),
    build: workingBuild, settledBuild, hasRig: rigSource(), sheetInsights:sheetInsightSource(),
  });
  let nav = (memory || rememberedNav) ? repairBagSelection(memory || rememberedNav, model) : initialBagState(model, focus || {});
  let mapNav = initialMapNav({ model: model.map, preferredRoomId: focus?.entryId?.replace(/^room:/, '') || null });
  if (nav.map) mapNav = reduceMapNav({ ...nav.map, ...MAP_VIEW_DEFAULTS, focusedControlId:null }, { type: 'MODEL_REFRESH' }, model.map);
  let t = 0;
  let notice = '';
  let noticeUntil = 0;
  const hits=createHitRegions();
  const heldControls = new Map();
  let patchDrag = null, patchLayout = null, patchLayoutKey = '';
  let mapPresentation = null, mapDrag = null, locatePending = false, mapViewportKey = '';
  const controlInput = (e = {}) => e.type?.startsWith('pointer') || e.type === 'lostpointercapture'
    ? `pointer:${e.pointerId ?? 'primary'}`
    : e.controllerAction ? `controller:${e.controllerAction}` : `key:${e.code || e.key || ''}`;
  function releaseBagControl(e) {
    const input = controlInput(e), id = heldControls.get(input);
    heldControls.delete(input);
    if (id && ![...heldControls.values()].includes(id)) releaseControl(id);
  }
  function pressBagControl(id, e) {
    const input = controlInput(e);
    if (heldControls.get(input) === id) return;
    releaseBagControl(e);
    heldControls.set(input, id);
    pressControl(id);
  }
  function resetBagControls() {
    cancelPatchDrag();
    mapDrag = null;
    mapNav=reduceMapNav(mapNav,{type:'FOCUS_CONTROL',controlId:null},model.map);
    heldControls.clear();
    cancelControlScope('bag:');
  }
  const routes=[{type:'root'}];
  const sheetPages={...rememberedSheetPages};
  let appliedFocusKey = '';
  let guideNudge = 99;   // seconds since the lock last refused a press
  let guidePresentation = null;
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
    // Room/floor selection persists; viewing transforms do not become an old
    // zoom trap on the next opening or pretend to be progression data.
    const { viewMode, rotation, zoom, panX, panY, focusedControlId, ...savedMap } = cloneMapNav(mapNav);
    nav = reduceBagNav(nav, { type: 'SET_MAP_NAV', map: savedMap }, model);
    rememberedNav = {
      ...nav,
      selected: { ...nav.selected },
      scroll: { ...nav.scroll },
      map: savedMap,
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
  // at a menu. Legacy guides stay closable; only an explicit allowClose:false
  // from a mandatory post-training flow holds the case open.
  function guideSnapshot(){return{sectionId:nav.sectionId,workingBuild:structuredClone(workingBuild)};}
  function emitGuideEvent(type,details={}){onGuideEvent({type,...guideSnapshot(),...details});}
  function activeGuide() {
    const g = guideSource(guideSnapshot());
    if (!g?.section) return null;
    return { ...g, kind:g.kind||'action', sectionId: normalizeBagSectionId(g.section) };
  }

  function guideRoomId(g) {
    return String(g?.entry || '').startsWith('room:') ? String(g.entry).slice(5) : null;
  }

  // Hold the cursor on the guided target. Input is locked, but a model refresh
  // after an action can still move a selection out from under it.
  function pinGuide(g) {
    if (!g || g.kind==='section') return;
    if (nav.sectionId !== g.sectionId) nav = reduceBagNav(nav, { type: 'SELECT_SECTION', sectionId: g.sectionId }, model);
    if(g.kind==='skills')return;
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
    return g.action === 'mark' ? {id:'set-target',label:'SET TARGET',enabled:true} : entry.actions?.primary;
  }

  // The guide, but only once it has an action to hand the player. A guide
  // pointing at something this case cannot do is a content fault, and a content
  // fault must never hold the case shut — it falls through to an ordinary bag.
  function lockedGuide() {
    const g = activeGuide();
    if (!g) return null;
    pinGuide(g);
    if(g.kind==='section'||g.kind==='skills'||g.kind==='close')return bagSection(model,g.sectionId)?g:null;
    return guidedAction(g) ? g : null;
  }

  function guideAllowsSection(sectionId,g=activeGuide()){
    return !g || sectionId===g.sectionId;
  }

  function continueGuide(){
    const g=lockedGuide();
    if(g?.kind!=='skills'||!g.continueLabel||g.continueEnabled===false){refuseGuided();return false;}
    cancelPatchDrag();emitGuideEvent('continue');AUDIO.menuConfirm?.();return true;
  }

  function guideAllowsHit(hit,g=lockedGuide()){
    if(!g)return true;
    if(currentRoute().type!=='root'&&g.allowClose!==false)return true;
    if(!hit)return false;
    if(hit.kind==='bag-close')return true;
    if(hit.kind==='bag-guide-continue')return g.kind==='skills';
    if(hit.kind==='bag-tab')return hit.id===`bag:tab:${g.sectionId}`;
    if(g.kind==='section'||g.kind==='close')return false;
    if(g.kind==='skills')return hit.kind==='bag-skill'||hit.kind.startsWith('bag-patch-');
    if(g.action==='mark')return (hit.kind==='map-space' && hit.id===`bag:space:${selectedMapSpace(mapNav,model.map)?.id}`)
      || (hit.kind==='map-control' && hit.data?.action==='set-target');
    return (hit.kind==='bag-sheet' && hit.id===`bag:sheet:${g.entry}`)
      || (hit.kind==='bag-action' && hit.id===`bag:action:${guidedAction(g)?.id}`);
  }

  function refuseGuided() {
    guideNudge = 0;
    AUDIO.menuMove?.();
  }

  function refresh() {
    model = buildBagModel({
      equipment: equipmentSource(), job: jobSource(), map: mapSource(), loadout: loadoutSource(),
      mapUnavailableReason: mapUnavailableSource(),
      build: workingBuild, settledBuild, hasRig: rigSource(), sheetInsights:sheetInsightSource(),
    });
    nav = reduceBagNav(nav, { type: 'MODEL_REFRESH' }, model);
    mapNav = reduceMapNav(mapNav, { type: 'MODEL_REFRESH' }, model.map);
    if (nav.sectionId === 'map') syncBagSelectionFromMap();
    remember();
  }

  function close({suppressReopen=false}={}) {
    const g=lockedGuide();
    if(g?.allowClose===false&&g.kind!=='close'){refuseGuided();return false;}
    resetBagControls();
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
      emitGuideEvent('close');
      onClose();
    }
    return removed;
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
    route.inspection?.dispose();
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
      reservedTopRows:BAG_TABS_HEIGHT,
      onSceneTurn:({page})=>{sheetPages[doc.id]=page;remember();},
      onSceneClose:(_closed,{page}={})=>{sheetPages[doc.id]=Number(page)||0;remember();finishSheetReader(route);},
    });
    pushRoute(route);
    route.reader.enter?.();
    return true;
  }

  function openItemInspection(entry){
    if(!entry)return false;
    if(onInspectEquipment(entry)===true)return true;
    pushRoute({type:'item-inspect',entryId:entry.id,tree:getItemInspection(entry.sourceId)||null,page:0,inspection:createItemInspection(entry)});
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
    const normalized = normalizeBagSectionId(sectionId);
    if(!guideAllowsSection(normalized)){refuseGuided();return false;}
    cancelPatchDrag();
    mapDrag=null;
    mapNav=reduceMapNav(mapNav,{type:'FOCUS_CONTROL',controlId:null},model.map);
    if(routes.length>1){for(const route of routes.splice(1)){route.inspection?.dispose();route.reader?.exit?.();}syncActionPresentation();}
    const before = nav.sectionId;
    nav = reduceBagNav(nav, { type: 'SELECT_SECTION', sectionId: normalized }, model);
    if (nav.sectionId === 'map') syncMapSelectionFromBag();
    if (before !== nav.sectionId) {
      motion.sectionChangedAt = t;
      motion.selectionChangedAt = t;
      AUDIO.menuMove();
    }
    remember();
    emitGuideEvent('section-selected');
    return true;
  }

  function selectSection(delta) {
    const g=activeGuide();
    if(g?.kind==='section')return setSection(g.sectionId);
    const next=reduceBagNav(nav,{type:delta>0?'NEXT_SECTION':'PREV_SECTION'},model);
    return setSection(next.sectionId);
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
    mapNav = reduceMapNav(mapNav, { type: 'MOVE_SPATIAL', vector, projectedPoints:mapPresentation?.projectedPoints }, model.map);
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

  function cancelPatchDrag() {
    const previous = patchDrag;
    patchDrag = null;
    if (previous?.captureTarget && previous.pointerId !== 'primary') {
      try { previous.captureTarget.releasePointerCapture?.(previous.pointerId); } catch (_) { /* native cancellation already released it */ }
    }
  }

  function patchRefusal(message) {
    notice = message || 'PATCH UNCHANGED'; noticeUntil = t + 2.5;
    AUDIO.menuDenied?.();
  }

  function beginPatch(socket, event) {
    if (patchDrag || !socket) return;
    const entry = socket.skillId ? bagEntry(model, 'skills', socket.skillId) : null;
    if (entry) selectSkill(entry);
    let from = socket, rerouteId = null;
    if (socket.kind === 'input') {
      if (!entry?.owned) {
        patchRefusal(entry?.blockedBy || 'DRAG FROM THE MATCHING OUTPUT INTO THIS INPUT');
        return;
      }
      rerouteId = entry.techniqueId;
      const source = skillPatchSource(rerouteId);
      from = patchLayout?.outputs?.find(item => item.id === source?.id)
        || patchLayout?.sources?.find(item => item.id === source?.id);
      if (!from) { patchRefusal('SOURCE OUTPUT IS NOT AVAILABLE'); return; }
    }
    const compatibleIds = compatibleSkillInputs(workingBuild, from, { hasRig: rigSource(), rerouteId });
    if (!rerouteId && !compatibleIds.length) {
      patchRefusal(workingBuild.unspent <= 0 ? 'NO SPARE CABLE · RETURN A PATCH TO SPARES' : 'NO COMPATIBLE INPUT · CHECK THE COLUMN AND PREREQUISITES');
      return;
    }
    patchDrag = {
      from: { ...from }, to: { x: event.cellX, y: event.cellY },
      start: { x: event.cellX, y: event.cellY }, moved: false,
      rerouteId, returnable: !!rerouteId, compatibleIds, valid: false,
      pointerId: event.pointerId ?? 'primary', captureTarget: event.originalEvent?.target || null,
    };
    AUDIO.menuMove?.({scope:'bag:patch',profile:'patch'});
    try { patchDrag.captureTarget?.setPointerCapture?.(event.pointerId); } catch (_) { /* global pointerup is also routed */ }
    notice = rerouteId ? 'MOVE THIS PLUG · DROP ON SPARES TO RETURN ITS RUN' : 'MATCH COLOR AND COLUMN · DROP INTO AN INPUT';
    noticeUntil = t + 5;
  }

  function updatePatchPointer(event) {
    if (!patchDrag || (event.pointerId ?? 'primary') !== patchDrag.pointerId) return false;
    patchDrag.to = { x: event.cellX, y: event.cellY };
    const metrics = uiCellMetrics();
    patchDrag.moved ||= Math.hypot((event.cellX-patchDrag.start.x)*metrics.cellW, (event.cellY-patchDrag.start.y)*metrics.cellH) >= 6;
    const hit = hits.hit(event.cellX, event.cellY);
    patchDrag.valid = hit?.kind === 'bag-patch-return' ? !!patchDrag.rerouteId
      : hit?.kind === 'bag-patch-input' && skillPatchAvailability(workingBuild, patchDrag.from, hit.data?.socket?.techniqueId, {
        hasRig: rigSource(), rerouteId: patchDrag.rerouteId,
      }).enabled;
    return true;
  }

  function finishPatchPointer(event) {
    if (!updatePatchPointer(event)) return;
    const gesture = patchDrag, hit = hits.hit(event.cellX, event.cellY);
    cancelPatchDrag();
    if (hit?.kind === 'bag-patch-return' && gesture.rerouteId && gesture.moved) {
      if (pullCable(gesture.rerouteId)) { refresh(); emitGuideEvent('skills-changed'); AUDIO.menuUnpatch?.(); }
      return;
    }
    if (hit?.kind !== 'bag-patch-input') { notice = 'PATCH UNCHANGED'; noticeUntil = t + 1.2; AUDIO.menuBack?.({scope:'bag:patch'}); return; }
    const result = connectSkillPatch(workingBuild, gesture.from, hit.data?.socket?.techniqueId, {
      hasRig: rigSource(), rerouteId: gesture.rerouteId,
    });
    if (!result.changed) {
      if (result.reason) patchRefusal(result.reason);
      else { notice = ''; noticeUntil = 0; }
      return;
    }
    workingBuild = result.build;
    chosenTechniqueIds = chosenTechniqueIds.filter(id => !result.pulled.includes(id));
    for (const id of result.pulled) if (settledBuild.techniques.includes(id) && !pulledTechniqueIds.includes(id)) pulledTechniqueIds.push(id);
    for (const id of result.patched) if (!chosenTechniqueIds.includes(id)) chosenTechniqueIds.push(id);
    pulledTechniqueIds = pulledTechniqueIds.filter(id => !result.patched.includes(id));
    const target = bagEntry(model, 'skills', hit.data.socket.skillId);
    if (target) selectSkill(target);
    notice = `${target?.label || 'INPUT'} PATCHED · TAKES EFFECT WHEN THE CASE CLOSES`;
    noticeUntil = t + 3; motion.actionAt = t;
    refresh(); emitGuideEvent('skills-changed'); AUDIO.menuPatch?.();
  }

  function mapAction(action, payload = {}) {
    if(nav.sectionId!=='map'||currentRoute().type!=='root')return false;
    const guided=lockedGuide();
    if(guided&&!(guided.kind==='action'&&guided.action==='mark'&&(action==='set-target'
      ||action==='select-space'&&payload.spaceId===selectedMapSpace(mapNav,model.map)?.id))){refuseGuided();return false;}
    const selected=selectedMapSpace(mapNav,model.map);
    const entry=currentBagEntry(nav,model)||{id:`room:${selected?.roomId||selected?.id}`,kind:'room',roomId:selected?.roomId,actionList:[]};
    if(action==='set-target'||action==='clear-target')return execute(entry,action);
    if(action==='read-file'){activateTertiary();return true;}
    if(action==='file-document')return openSheet(selected?.objective?.notes?.[0]||selected?.attached);
    if(action==='file-next'||action==='file-prev'){
      if(!mapNav.roomFile)return false;
      const page=Math.max(0,Math.min((mapPresentation?.filePages||1)-1,mapNav.roomFile.page+(action==='file-next'?1:-1)));
      if(page!==mapNav.roomFile.page)AUDIO.menuPage?.();
      mapNav={...mapNav,roomFile:{...mapNav.roomFile,page}};return true;
    }
    if(action==='floor-prev'||action==='floor-next'){changeFloor(action==='floor-prev'?-1:1);return true;}
    const event = action==='select-space'?{type:'SELECT_SPACE',spaceId:payload.spaceId}
      :action==='select-floor'?{type:'SELECT_FLOOR',floorId:payload.floorId}
      :action==='view-stack'||action==='view-floor'?{type:'SET_VIEW_MODE',mode:action==='view-stack'?'stack':'floor'}
      :action==='rotate-left'||action==='rotate-right'?{type:'ROTATE',delta:action==='rotate-left'?-1:1}
      :action==='zoom-in'||action==='zoom-out'?{type:'ZOOM',factor:action==='zoom-in'?1.15:1/1.15}
      :action==='zoom'?{type:'ZOOM',factor:payload.factor}
      :action==='pan'?{type:'PAN',dx:payload.dx,dy:payload.dy}
      :action==='center-player'?{type:'CENTER_PLAYER'}
      :action==='reset-view'?{type:'RESET_VIEW'}:null;
    if(!event)return false;
    mapNav=reduceMapNav(mapNav,event,model.map);
    if(action==='center-player')locatePending=true;
    syncBagSelectionFromMap();motion.selectionChangedAt=t;
    if(!['pan','zoom'].includes(action))AUDIO.menuMove();remember();return true;
  }

  const mapConsoleControls=()=> (mapPresentation?.hits||[]).filter(hit=>hit.kind==='map-control');
  function focusMapControl(controlId){
    mapNav=reduceMapNav(mapNav,{type:'FOCUS_CONTROL',controlId},model.map);
    mapDrag=null;remember();
  }
  function consoleMapKey(event){
    if(nav.sectionId!=='map'||currentRoute().type!=='root')return false;
    const toggle=event.key==='F6'||event.code==='F6'||event.controllerAction==='mapConsole';
    if(toggle){
      event.preventDefault?.();
      if(!event.repeat){focusMapControl(mapNav.focusedControlId?null:mapConsoleControls()[0]?.id);AUDIO.menuMove();}
      return true;
    }
    if(!mapNav.focusedControlId)return false;
    const k=String(event.key||'').toLowerCase(),code=event.code;
    const vector=event.key==='ArrowUp'||k==='w'||code==='KeyW'?{x:0,y:-1}
      :event.key==='ArrowDown'||k==='s'||code==='KeyS'?{x:0,y:1}
      :event.key==='ArrowLeft'||k==='a'||code==='KeyA'?{x:-1,y:0}
      :event.key==='ArrowRight'||k==='d'||code==='KeyD'?{x:1,y:0}:null;
    if(vector){
      const metrics=uiCellMetrics(),next=moveMapConsoleFocus(mapNav.focusedControlId,vector,mapConsoleControls(),{cellAspect:metrics.cellW/metrics.cellH});
      if(next!==mapNav.focusedControlId){focusMapControl(next);AUDIO.menuMove();}return true;
    }
    if(confirmInput(event)||k==='e'||code==='KeyE'){
      if(!event.repeat){
        const control=mapConsoleControls().find(hit=>hit.id===mapNav.focusedControlId);
        if(control?.enabled!==false&&control){pressBagControl(control.id,event);mapAction(control.action,control.payload);}
        else AUDIO.menuDenied?.();
      }
      return true;
    }
    return false;
  }

  function actionFor(entry,actionId){
    return entry?.actionList?.find((action)=>action.id===actionId)
      || [entry?.actions?.primary,entry?.actions?.secondary,entry?.actions?.tertiary].find((action)=>action?.id===actionId)
      || null;
  }

  function execute(entry, actionId, {confirmed=false}={}) {
    if (!entry || !actionId) return false;
    const targetSpace=nav.sectionId==='map'?selectedMapSpace(mapNav,model.map):null;
    const descriptor=actionFor(entry,actionId);
    if(descriptor?.enabled===false){notice=descriptor.reason||'UNAVAILABLE';noticeUntil=t+2.4;AUDIO.menuDenied?.();return false;}
    if(descriptor?.confirm&&!confirmed){pushRoute({type:'confirm',entryId:entry.id,actionId,descriptor});AUDIO.menuConfirm?.();return true;}
    let ok = false;

    if (nav.sectionId === 'map') {
      const selected = selectedMapSpace(mapNav, model.map);
      if(actionId==='confirm-waypoint')ok=!!selected?.waypoint;
      else if(actionId==='read-attached')ok=selected?.objective?.notes?.[0]||selected?.attached?openSheet(selected.objective?.notes?.[0]||selected.attached):false;
      else ok = resolveMapAction(selected, actionId, { readDocument:openSheet, markRoom, markSpace:markSpace||null,
        setTarget:setMapTarget,clearTarget:clearMapTarget,playerWaypoint:model.map?.playerWaypoint });
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
      const result = connectSkillPatch(workingBuild, skillPatchSource(entry.techniqueId), entry.techniqueId, { hasRig: rigSource() });
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
      if(actionId==='patch-cable')AUDIO.menuPatch?.();
      else if(actionId==='pull-cable')AUDIO.menuUnpatch?.();
      else if(['unset-slot','move-storage'].includes(actionId))AUDIO.menuRemove?.();
      else if(['read','read-attached'].includes(actionId))AUDIO.menuPage?.();
      else AUDIO.menuConfirm();
      if(descriptor?.exitPolicy!=='close')refresh();
      if(entry.kind==='skill')emitGuideEvent('skills-changed');
      if(['mark','mark-room','mark-waypoint','set-target','confirm-waypoint'].includes(actionId))emitGuideEvent('marked',{
        roomId:targetSpace?.roomId||entry.roomId||null,spaceId:targetSpace?.id||null,
      });
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
      const actionId='set-target';
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
      if(roomHistory(selected)){
        mapNav={...mapNav,roomFile:mapNav.roomFile?null:{spaceId:selected.id,page:0}};
        AUDIO.menuPage?.();return;
      }
      const document=selected?.objective?.notes?.[0]||selected?.attached;
      if(document)openSheet(document);
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
        if(action?.enabled===false){notice=action.reason;noticeUntil=t+2.4;AUDIO.menuDenied?.();return true;}
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
        if(result?.changed){popRoute();refresh();AUDIO.menuFit?.();}
        else{notice=result?.reason==='already-in-slot'?'ALREADY SET IN THAT SLOT':'QUICK SLOT UNCHANGED';noticeUntil=t+2.2;AUDIO.menuDenied?.();}
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
      if(route.inspection?.key(e))return true;
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
      if(route.inspection){drawItemInspectionView({entry,inspection:route.inspection,lines:route.tree?.start?.lines||[],rect,active:scenes.top()===scene||embeddedHost});return;}
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
  function hitContainsPoint(hit,event){
    const polygons=hit?.data?.polygons;
    return !polygons?.length || polygons.some(polygon=>pointInMapPolygon({x:event.cellX,y:event.cellY},polygon));
  }
  function mapViewportContains(event){
    const rect=mapPresentation?.layout?.mapViewport;
    return nav.sectionId==='map'&&currentRoute().type==='root'&&rect
      &&event.cellX>=rect.x&&event.cellX<=rect.x+rect.w&&event.cellY>=rect.y&&event.cellY<=rect.y+rect.h;
  }
  function registerCommonHits(outer,layout){
    addHit({id:'bag:close',kind:'bag-close',x:outer.x+outer.w-18,y:outer.y,w:18,h:2,label:'CLOSE BAG',onClick:close});
    for (const tab of bagTabRegions(model, layout)) addHit({ ...tab, kind:'bag-tab', onClick:()=>setSection(tab.sectionId) });
  }

  function registerRootHits(layout){
    if(nav.sectionId==='kit'){
      const geo=bagInventoryGeometry(model,nav,layout),entries=model.sections.find((section)=>section.id==='kit')?.entries||[];
      const list=bagInventoryListLayout(geo.list),cap=list.capacity,selected=bagEntry(model,'kit',nav.selected?.kit),at=Math.max(0,entries.findIndex((entry)=>entry.id===selected?.id));
      const scroll=Math.max(0,Math.min(at>=cap?at-cap+1:0,Math.max(0,entries.length-cap)));
      entries.slice(scroll,scroll+cap).forEach((entry,index)=>addHit({id:`bag:item:${entry.id}`,kind:'bag-item',x:geo.list.x,y:list.startY+index*list.rowH,w:geo.list.w,h:list.rowH,label:entry.title,onHover:()=>selectEntry('kit',entry.id),onClick:()=>{selectEntry('kit',entry.id);pushRoute({type:'item-actions',entryId:entry.id,index:0});}}));
      bagInventoryActionLayout(geo.detail,selected,nav).rows.forEach(({action,index,...rect})=>addHit({id:`bag:action:${action.id}`,kind:'bag-action',...rect,label:action.label,disabled:!action.enabled,onHover:()=>{const route=currentRoute();if(route.type==='item-actions'){route.index=index;syncActionPresentation();}},onClick:()=>{
        if(!action.enabled){notice=action.reason;noticeUntil=t+2.2;return;}
        if(currentRoute().type==='item-actions'){routes.pop();syncActionPresentation();}
        execute(selected,action.id);
      }}));
    }else if(nav.sectionId==='sheets'){
      const section=model.sections.find((candidate)=>candidate.id==='sheets'),cap=bagListCapacity(layout,'sheets'),scroll=nav.scroll?.sheets||0;
      (section?.entries||[]).slice(scroll,scroll+cap).forEach((entry,index)=>addHit({id:`bag:sheet:${entry.id}`,kind:'bag-sheet',x:layout.list.x,y:layout.list.y+2+index*2,w:layout.list.w,h:1,label:entry.title,onHover:()=>selectEntry('sheets',entry.id),onClick:()=>{selectEntry('sheets',entry.id);openSheet(entry.source);}}));
    }else if(nav.sectionId==='map'){
      for(const region of mapPresentation?.hits||[])addHit({...region,
        disabled:region.enabled===false,
        data:{action:region.action,payload:region.payload,polygons:region.polygons},
        // Selecting a plotted room, even twice, is never a waypoint command.
        onClick:()=>region.kind==='map-pan'?false:mapAction(region.action,region.payload),
      });
    }else if(nav.sectionId==='skills'){
      if (!patchLayout) return;
      for (const node of patchLayout.nodes) {
        addHit({ id:`bag:skill:${node.id}`, kind:'bag-skill', ...node.bounds, label:node.entry.label,
          onHover:()=>selectSkill(node.entry), onClick:()=>selectSkill(node.entry) });
      }
      for (const socket of patchLayout.sockets) addHit({
        id:`bag:patch:${socket.id}`, kind:socket.kind==='input'?'bag-patch-input':'bag-patch-output',
        ...socket.hit, label:socket.skillId || socket.branch, data:{socket},
        onHover:()=>{ const entry=bagEntry(model,'skills',socket.skillId); if(entry)selectSkill(entry); },
      });
      if (patchLayout.returnZone) addHit({ id:'bag:patch:return', kind:'bag-patch-return', ...patchLayout.returnZone, label:'SPARES · RETURN CABLE' });
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
    }else if(route.type==='item-inspect'&&route.inspection){
      const {back,reset}=itemInspectionLayout(rect);
      addHit({id:'bag:subview-back',kind:'bag-back',...back,label:'BACK',onClick:popRoute});
      addHit({id:'bag:inspection-reset',kind:'bag-reset',...reset,label:'RESET VIEW',onClick:()=>route.inspection.reset()});
    }else addHit({id:'bag:subview-back',kind:'bag-back',x,y,w,h,label:'BACK',onClick:popRoute});
  }

  const scene = {
    id: 'bag',
    blocksInput: true,
    blocksWorld: true,
    allowsLook: false,
    lensPreset: 'calm',

    // ESCAPE BACKS OUT OF WHAT YOU ARE IN, not out of the game.
    //
    // main.js hands Escape to the pause menu unless the top scene claims it
    // (`shouldOpenPauseForEvent`, localEscape), and the bag never claimed it —
    // so reading a sheet and pressing Escape opened the PAUSE MENU over the
    // sheet. The only way out of a document was [E], which nobody guesses,
    // because E is the interact key everywhere else.
    //
    // Claimed only when there is somewhere to go back TO. At the root of the
    // bag there is nothing to back out of, so Escape keeps its ordinary
    // meaning and opens the menu; a controller's `back` still closes the bag
    // there, which is what backInput is for.
    get handlesEscape() { return currentRoute().type !== 'root'||nav.sectionId==='map'&&!!(mapNav.focusedControlId||mapNav.roomFile); },
    get modalActions() { return currentRoute().type==='root'&&nav.sectionId==='map'
      ? ['mapFloorPrev','mapFloorNext','mapLocate','mapFile','mapConsole'] : []; },

    enter() {
      preloadItemPortraits();
      resetBagControls();
      if (typeof window !== 'undefined') window.addEventListener('blur', resetBagControls);
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
      if(!setSection('map'))return;
      const g=lockedGuide();if(g?.kind==='action'&&guideRoomId(g)&&guideRoomId(g)!==roomId){refuseGuided();return;}
      mapNav = reduceMapNav(mapNav, { type: 'SELECT_ROOM', roomId }, model.map);
      syncBagSelectionFromMap();
      remember();
    },
    selectFloor(floorId){
      if(!setSection('map'))return;
      const g=lockedGuide();if(g?.kind==='action'){refuseGuided();return;}
      mapNav=reduceMapNav(mapNav,{type:'SELECT_FLOOR',floorId},model.map);
      syncBagSelectionFromMap();remember();
    },

    debugState() {
      return {
        viewport:uiSize(),portraitRenderer:itemInspectionStats(),
        model, nav, mapNav, selected: currentBagEntry(nav, model), mapSelected: selectedMapSpace(mapNav, model.map),
        chosenTechniqueIds: [...chosenTechniqueIds], workingBuild: structuredClone(workingBuild),
        route:{...currentRoute(),reader:currentRoute()?.reader?.view?.()||null,inspection:currentRoute()?.inspection?.view()||null},hitRegions:hits.view(),sheetPages:{...sheetPages},guidePresentation,
        mapPresentation:mapPresentation?{hits:mapPresentation.hits,layout:mapPresentation.layout,projectedPoints:mapPresentation.projectedPoints}:null,
        mapDrag:mapDrag?{...mapDrag}:null,
        patchDrag:patchDrag?{from:patchDrag.from,to:patchDrag.to,rerouteId:patchDrag.rerouteId,valid:patchDrag.valid,compatibleIds:patchDrag.compatibleIds}:null,
      };
    },

    exit() {
      resetBagControls();
      if (typeof window !== 'undefined') window.removeEventListener('blur', resetBagControls);
      currentRoute()?.reader?.exit?.(); applyChosenSkills();
      for(const route of routes)route.inspection?.dispose();
    },

    key(e) {
      const raw = e.key || '';
      const k = raw.toLowerCase();
      const code = e.code || '';
      mapDrag=null;
      if (patchDrag) {
        cancelPatchDrag();
        if (backInput(e)) { notice='PATCH UNCHANGED'; noticeUntil=t+1.2; return true; }
      }
      const momentarySection = (sectionId) => {
        if (!e.repeat) pressBagControl(`bag:tab:${sectionId}`,e);
        setSection(sectionId);
      };
      if (bagCloseInput(e)) { close({suppressReopen:true}); return true; }
      if(currentRoute().type!=='root')return handleRouteKey(e);
      if(nav.sectionId==='map'&&mapNav.roomFile){
        if(backInput(e)){mapNav={...mapNav,roomFile:null};AUDIO.menuBack?.();return true;}
        if(confirmInput(e)&&!mapNav.focusedControlId){mapAction('file-document');return true;}
        const delta=['ArrowRight','ArrowDown','PageDown'].includes(raw)?1:['ArrowLeft','ArrowUp','PageUp'].includes(raw)?-1:0;
        if(delta){mapAction(delta>0?'file-next':'file-prev');return true;}
      }
      if(nav.sectionId==='map'&&mapNav.focusedControlId&&backInput(e)){
        focusMapControl(null);AUDIO.menuBack?.();return true;
      }
      if (backInput(e)) { close(); return true; }

      // The lock. One control is live; the rest of the case answers with the
      // callout, not with a refusal he would have to listen to later.
      const guided = lockedGuide();
      if(guided?.kind==='skills'&&(k==='c'||code==='KeyC'||e.controllerAction==='tabNext')){
        if(!e.repeat){pressBagControl('bag:guide:continue',e);continueGuide();}return true;
      }
      if(guided?.kind==='section'&&e.repeat)return true;
      if (raw === 'Tab'||e.controllerAction==='tabNext'||e.controllerAction==='tabPrev') {
        e.preventDefault?.(); selectSection(e.shiftKey||e.controllerAction==='tabPrev' ? -1 : 1);
        if (!e.repeat) pressBagControl(`bag:tab:${nav.sectionId}`,e);
        return true;
      }
      if (raw === '1' || code === 'Digit1') { momentarySection('kit'); return true; }
      if (raw === '2' || code === 'Digit2') { momentarySection('map'); return true; }
      if (raw === '3' || code === 'Digit3') { momentarySection('sheets'); return true; }
      if (raw === '4' || code === 'Digit4') { momentarySection('skills'); return true; }
      if (guided && guided.kind!=='skills') {
        // Exactly one action is live, so every activation key opens it. The
        // callout names one of them; a player who reaches for the other should
        // not be told no by a lock that has nothing else to offer.
        const wants = raw === 'Enter' || code === 'Enter' || k === 'e' || code === 'KeyE'
          || raw === ' ' || code === 'Space' || k === 'z' || code === 'KeyZ'||e.controllerAction==='confirm';
        if (wants&&!e.repeat) {
          if(guided.kind==='section')momentarySection(guided.sectionId);
          else if(guided.kind==='close')close();
          else {
            if(guided.action==='mark')pressBagControl('bag:map:set-target',e);
            execute(currentBagEntry(nav, model), guidedAction(guided).id);
          }
          return true;
        }
        refuseGuided();
        return true;
      }

      if(consoleMapKey(e))return true;

      if (nav.sectionId === 'skills') {
        const entry = currentBagEntry(nav, model);
        const primary = raw === 'Enter' || code === 'Enter' || k === 'e' || code === 'KeyE' || e.controllerAction === 'confirm';
        const secondary = raw === ' ' || code === 'Space' || k === 'z' || code === 'KeyZ';
        const action = primary ? entry?.actions?.primary : secondary ? entry?.actions?.secondary : null;
        if (e.repeat && (primary || secondary)) return true;
        if (secondary && entry?.owned) { execute(entry,'pull-cable'); return true; }
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
        const action = e.controllerAction==='mapFloorPrev'||raw==='PageUp'||code==='PageUp'||raw==='['||code==='BracketLeft'?'floor-prev'
          :e.controllerAction==='mapFloorNext'||raw==='PageDown'||code==='PageDown'||raw===']'||code==='BracketRight'?'floor-next'
          :e.controllerAction==='mapLocate'||k==='c'||code==='KeyC'?'center-player'
          :e.controllerAction==='mapFile'||k==='r'||code==='KeyR'?'read-file'
          :raw==='Delete'||code==='Delete'?'clear-target'
          :raw==='Enter'||code==='Enter'||k==='e'||code==='KeyE'||e.controllerAction==='confirm'?'set-target':null;
        if(action){if(!e.repeat){
          const region=mapPresentation?.hits?.find(hit=>hit.action===action);if(region)pressBagControl(region.id,e);
          mapAction(action);
          if(action==='floor-prev'||action==='floor-next')pressBagControl(`bag:floor:${mapNav.floorId}`,e);
        }return true;}
        if (raw === 'ArrowUp' || k === 'w' || code === 'KeyW') { moveMap({ x: 0, y: -1 }); return true; }
        if (raw === 'ArrowDown' || k === 's' || code === 'KeyS') { moveMap({ x: 0, y: 1 }); return true; }
        if (raw === 'ArrowLeft' || k === 'a' || code === 'KeyA') { moveMap({ x: -1, y: 0 }); return true; }
        if (raw === 'ArrowRight' || k === 'd' || code === 'KeyD') { moveMap({ x: 1, y: 0 }); return true; }
      } else {
        if (raw === 'ArrowUp' || k === 'w' || code === 'KeyW') { moveList(-1); return true; }
        if (raw === 'ArrowDown' || k === 's' || code === 'KeyS') { moveList(1); return true; }
      }

      if (raw === 'Enter' || code === 'Enter' || k === 'e' || code === 'KeyE' || e.controllerAction === 'confirm') { activatePrimary(); return true; }
      if (raw === ' ' || code === 'Space' || k === 'z' || code === 'KeyZ') { activateSecondary(); return true; }
      if (k === 'r' || code === 'KeyR') { activateTertiary(); return true; }
      return true;
    },

    keyup(e) { releaseBagControl(e); return true; },

    pointer(e){
      if(currentRoute()?.inspection?.pointer(e))return true;
      // Global focus/input cancellation must clear both the lifted cable and
      // any simultaneously held screen-selector key, even without a keyup.
      if(e.type==='pointercancel'&&e.pointerId==null){resetBagControls();return true;}
      if(e.type==='wheel'){
        if(!mapViewportContains(e))return false;
        e.preventDefault?.();
        mapAction('zoom',{factor:Math.exp(-Math.max(-240,Math.min(240,Number(e.deltaY)||0))*.0015)});return true;
      }
      if(mapDrag){
        if((e.pointerId??'primary')!==mapDrag.pointerId)return true;
        if(e.type==='pointermove'){
          mapAction('pan',{dx:e.cellX-mapDrag.x,dy:e.cellY-mapDrag.y});mapDrag.x=e.cellX;mapDrag.y=e.cellY;return true;
        }
        if(['pointerup','pointercancel','lostpointercapture'].includes(e.type)){mapDrag=null;releaseBagControl(e);return true;}
      }
      if(patchDrag){
        if((e.type==='pointercancel'||e.type==='lostpointercapture')&&e.pointerId===patchDrag.pointerId){cancelPatchDrag();releaseBagControl(e);return true;}
        if(e.type==='pointermove'){updatePatchPointer(e);return true;}
        if(e.type==='pointerup'){finishPatchPointer(e);releaseBagControl(e);return true;}
      }
      if(e.type==='pointermove'){hits.handle(e,{click:false,filter:hit=>guideAllowsHit(hit)&&hitContainsPoint(hit,e)});return true;}
      if(e.type==='pointerup'||e.type==='pointercancel'||e.type==='lostpointercapture'){releaseBagControl(e);return true;}
      if(e.type==='pointerdown'){
        if(e.button!=null&&e.button!==0)return true;
        const hit=hits.hit(e.cellX,e.cellY,region=>hitContainsPoint(region,e));
        if(!guideAllowsHit(hit)){refuseGuided();return true;}
        if(nav.sectionId==='map'&&mapNav.focusedControlId){
          if(hit?.kind==='map-control')focusMapControl(hit.id);
          else if(hit?.kind==='map-space'||hit?.kind==='map-pan')focusMapControl(null);
        }
        if(hit?.kind==='map-pan'){mapDrag={pointerId:e.pointerId??'primary',x:e.cellX,y:e.cellY};return true;}
        if(hit?.kind==='bag-guide-continue')pressBagControl(hit.id,e);
        if (hit?.kind==='bag-patch-input'||hit?.kind==='bag-patch-output') { beginPatch(hit.data.socket,e); return true; }
        if(hit?.kind==='bag-tab'&&!hit.disabled)pressBagControl(hit.id,e);
        if(hit?.kind==='map-control'&&!hit.disabled)pressBagControl(hit.id,e);
        hits.handle(e,{filter:region=>guideAllowsHit(region)&&hitContainsPoint(region,e)});return true;
      }
      return true;
    },

    render() {
      hits.reset();
      guidePresentation = null;
      mapPresentation = null;
      const route=currentRoute();
      if(route.type==='sheet-reader'){
        const size=uiSize(),reader=route.reader.view?.()||{page:0,total:1};
        route.reader.render?.();
        uiFill(0,0,size.cols,BAG_TABS_HEIGHT,'rgba(8,10,11,.98)');
        const closeW=Math.min(14,Math.max(8,size.cols)),closeX=Math.max(0,size.cols-closeW);
        const readerTabs={tabs:{x:1,y:.1,w:Math.max(1,size.cols-2),h:BAG_TABS_HEIGHT}};
        for(const tab of bagTabRegions(model,readerTabs)){
          drawLampButton(tab.x,tab.y,tab.w,tab.h,bagTabButtonState(tab,'sheets'));
          addHit({...tab,kind:'bag-tab',onClick:()=>setSection(tab.sectionId)});
        }
        uiText(2,3.5,fit(`FIELD CASE / SHEETS / ${route.document?.title||route.document?.id||'DOCUMENT'}`,Math.max(8,closeX-3)),'ui-label',.72);
        uiText(closeX,3.5,'[B] CLOSE BAG','ui-amber',.9);
        addHit({id:'bag:sheet-close',kind:'bag-close',x:closeX,y:3.5,w:closeW,h:1.2,label:'CLOSE BAG',onClick:close});
        addHit({id:'bag:sheet-back',kind:'bag-back',x:0,y:Math.max(0,size.rows-4),w:Math.max(8,Math.floor(size.cols*.25)),h:4,label:'BACK TO SHEETS',onClick:()=>route.reader.key?.({key:'Escape',code:'Escape'})});
        if(reader.page>0)addHit({id:'bag:sheet-prev',kind:'sheet-page',x:Math.floor(size.cols*.25),y:Math.max(0,size.rows-4),w:Math.floor(size.cols*.25),h:4,label:'PREVIOUS PAGE',onClick:()=>route.reader.key?.({key:'ArrowLeft',code:'ArrowLeft'})});
        if(reader.page<reader.total-1)addHit({id:'bag:sheet-next',kind:'sheet-page',x:Math.floor(size.cols*.5),y:Math.max(0,size.rows-4),w:Math.floor(size.cols*.5),h:4,label:'NEXT PAGE',onClick:()=>route.reader.key?.({key:'ArrowRight',code:'ArrowRight'})});
        debug?.({ model, nav, mapNav, layout:null, selected: currentBagEntry(nav, model), route, hitRegions:hits.view(), t });
        return;
      }
      applyFocus(focusSource());
      const size = uiSize();
      const guided = lockedGuide();
      const frame = bagGuideFrame({size,outer:bagPanelBounds({...size,sectionId:nav.sectionId}),guide:guided});
      const outer = frame.outer;
      uiScrim(0.74);
      const skills = nav.sectionId === 'skills';
      const subview=!['root','item-actions'].includes(route.type);
      const mapHardware=nav.sectionId==='map'&&!subview;
      let layout;
      withMachinePanel(outer.x, outer.y, outer.w, outer.h, {
        label: 'FIELD CASE / 4417-C',
        source: getMonitorSource?.() || 'FIELD LIVE',
        footer: '', meter: true, theme: 'amber',
        // Sockets, plugs, cables, and switches are exposed hardware. The case
        // still has its metal faceplate, but never puts a cover over that bay.
        glass: skills && !subview || mapHardware ? false : {},
        aperture: !mapHardware,
      }, (body) => {
      layout = bagLayout({
        body:mapHardware?{x:outer.x+3,y:outer.y+2.6,w:outer.w-6,h:outer.h-3.6}:body,
        sectionId:mapHardware?'map':null,
        forceMode: typeof forceLayout === 'function' ? forceLayout() : forceLayout,
      });
      if(mapHardware){
        const viewport=mapLayoutFromBag(layout).mapViewport,key=JSON.stringify(viewport);
        if(mapViewportKey&&key!==mapViewportKey){
          mapNav=reduceMapNav(mapNav,{type:'PAN',dx:-mapNav.panX,dy:-mapNav.panY},model.map);mapDrag=null;
        }
        mapViewportKey=key;
      }
      if (nav.sectionId !== 'map') {
        nav = ensureBagSelectionVisible(nav, model, bagListCapacity(layout, nav.sectionId));
      }
      if (skills && !subview) {
        const region=contentRegion(layout),section=skillsTree();
        const key=JSON.stringify(region);
        if(patchLayoutKey && key!==patchLayoutKey)cancelPatchDrag();
        patchLayoutKey=key;
        patchLayout=patchBayLayout({region,branches:section?.branches||[],maxTier:section?.maxTier||1});
      } else { patchLayout=null; patchLayoutKey=''; cancelPatchDrag(); }
      const selected=currentBagEntry(nav,model);
      const sectionLabel=model.sections.find((section)=>section.id===nav.sectionId)?.label||nav.sectionId;
      const breadcrumb=`FIELD CASE / ${sectionLabel}${route.type==='item-actions'&&selected?` / ${selected.title} / ACTIONS`:''}`;
      const liveHint = guided ? '' : (notice || (nav.sectionId === 'kit'
        // Short enough to survive the hint row. The long version ran to 97
        // characters and was cut at "INSPE…", which hid the very verbs it was
        // trying to advertise. What each verb does is on the item itself.
        ? 'PICK AN ITEM · [ENTER] FOR ITS ACTIONS'
        : skills
          ? 'DRAG OUTPUT TO MATCHING INPUT · RETURN PLUG TO SPARES · ENTER PATCH / SPACE PULL'
          : hintSource()));
      if(locatePending&&mapHardware){
        const player=model.map?.player,policy=model.map?.policy||{},metrics=uiCellMetrics();
        const anchor=player?.resolved&&policy.showExactPlayer!==false?player:selectedMapSpace(mapNav,model.map);
        if(anchor?.position){
          const viewport=mapLayoutFromBag(layout).mapViewport;
          const anchors=(model.map?.spaces||[]).filter(space=>space.selectable!==false&&space.position)
            .map(space=>({...space.position,height:mapArchitecturalHeight(model.map?.architecture,space),floorId:space.floorId}));
          if(player?.resolved&&player.position&&policy.showExactPlayer!==false)anchors.push({...player.position,
            height:mapArchitecturalHeight(model.map?.architecture,player),floorId:player.floorId});
          const projection=createMapAxonometricProjection({architecture:model.map?.architecture,nav:mapNav,viewport,
            floors:model.map?.floors,anchors,cellAspect:metrics.cellW/metrics.cellH});
          const point=projection.point({...anchor.position,floorId:anchor.floorId,
            height:mapArchitecturalHeight(model.map?.architecture,anchor,anchor.floorId)});
          mapNav=reduceMapNav(mapNav,{type:'PAN',dx:viewport.x+viewport.w/2-point.x,dy:viewport.y+viewport.h/2-point.y},model.map);
        }
        locatePending=false;
      }
      mapPresentation=drawBagView({ model, nav, mapNav, layout, hint: liveHint, guide: guided, guideNudge, motion, now: t,
        // The tree owns the content area for its own section; the tabs, task line
        // and action rail around it stay exactly as they are everywhere else.
        drawContent: subview
          ? (region)=>drawSubview(route,region)
          : skills
          ? (region) => drawSkillsSection({ model, layout: region, selectedId: selectedSkill()?.id || null, now: t, patchDrag })
          : null,
        overrideActions:subview?[['ESC','BACK'],['B','CLOSE BAG']]:null,breadcrumb });
      });
      drawPrintedText(Math.max(outer.x+2,outer.x+outer.w-18),outer.y,
        guided?.allowClose===false&&guided.kind!=='close'?'SETUP IN PROGRESS':'[B] CLOSE BAG',
        {w:16,ink:'#333830',finish:'etched',darkPanel:false});
      registerCommonHits(outer,layout);
      if(subview)registerSubviewHits(route,layout);else registerRootHits(layout);
      // Callout leaders resolve against the exact same registered rectangles
      // the player can use. The guide never borrows a row from the case body.
      guidePresentation = drawBagGuideCallouts({
        size,outer,layout,guide:guided,regions:hits.view(),patchLayout,
        selectedSkillId:selectedSkill()?.id||null,patchDrag,nudge:guideNudge,now:t,frame,
      });
      const continuation=guidePresentation?.continueRegion;
      if(continuation)addHit({id:'bag:guide:continue',kind:'bag-guide-continue',...continuation,
        label:guided.continueLabel,onClick:continueGuide});
      debug?.({ model, nav, mapNav, layout, selected: currentBagEntry(nav, model), route, hitRegions:hits.view(), guidePresentation, t });
    },
  };

  return scene;
}
