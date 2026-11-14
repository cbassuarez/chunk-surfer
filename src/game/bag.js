// AUDIOCORP field case.
//
// Inventory, Map, Sheets and Skills share one paused workspace. Navigation
// state is presentation memory; world simulation never advances underneath it.

import * as scenes from './scenes.js';
import { roomHistory } from '../data/room-history.js';
import * as AUDIO from '../audio/story-audio.js';
import { uiDraw, uiFill, uiScrim, uiSize, uiCellMetrics, uiStrokeRect, uiText, uiWrap } from '../render/ui.js';
import { UI_COLOR } from '../render/palette.js';
import { withMachinePanel, drawLampButton, drawVfdText, machinePanelBezelRail } from '../render/presentation.js';
import { drawInstrumentPlate } from '../render/instrument-material.js';
import { drawPrintedText } from '../render/keycap.js';
import { bagTabRegions, bagTabButtonState, BAG_TABS_HEIGHT, BAG_TAB_CAP_HEIGHT } from '../render/bag-tabs.js';
import { buildBagModel, bagEntry, bagSection, EMPTY_JOB, normalizeBagSectionId, readOnlyBagMap } from './bag-model.js';
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
import { bagLayout, bagPanelBounds, bagInventoryGridLayout, bagInventoryMoveIndex } from '../render/bag-layout.js';
import { bagInventoryGeometry, bagInventoryActionLayout, bagListCapacity, drawBagView } from '../render/bag-view.js';
import { bagGuideFrame, drawBagGuideCallouts } from '../render/bag-tour.js';
import { hardwareMotionReduced } from '../render/hardware-material.js';
import { drawServiceLockoutTag } from '../render/service-lockout-tag.js';
import { serviceTagBounds } from '../render/patch-channel-strip.js';
import { drawSkillsSection, nextPatchBayNode, patchBayLayout } from '../render/bag-skills.js';
import { normalizeCombatBuild, pullCombatTechnique, techniquePullPreview } from './combat-progression.js';
import { skillPatchSource, skillPatchAvailability, compatibleSkillInputs, connectSkillPatch } from './skill-patchbay.js';
import { createHitRegions } from '../render/hit-regions.js';
import { makeEmbeddedDocumentReader } from './document.js';
import { mapLayoutFromBag } from '../render/map-layout.js';
import { sheetDialogueFor, sheetInsightComplete } from './bag-sheets.js';
import { pressControl, releaseControl, cancelControlScope } from './control-feedback.js';
import {createItemInspection,itemInspectionStats} from './item-inspection.js';
import {drawItemInspectionView,itemInspectionLayout} from '../render/item-inspection-view.js';
import {preloadItemPortraits} from '../render/item-portraits.js';
import { drawJournalView, journalListCapacity } from '../render/journal-view.js';
import { isMapShortcut } from './map-shortcut.js';
import { inputPromptLabel, activeInputPromptDevice } from './bindings.js';
import { createJournalReview, journalTrackingKey } from './journal-review.js';
import {projectInventoryStacks,inventoryStackForEntry,nextInventoryStackMember} from './inventory-stacks.js';

let rememberedNav = null;
let rememberedSheetPages = {};

function actionContext(entry, action) {
  return { entryId: entry?.id, actionId: action?.id, confirm: action?.confirm || null };
}

function cloneMapNav(value) {
  if (!value) return null;
  return { ...value, selectedByFloor: { ...(value.selectedByFloor || {}) } };
}

const SERVICE_TAG = {
  title: 'DO NOT LINK',
  prompt: 'A warning in pencil. Someone answered underneath.',
  choices: [
    { id:'why', label:'Why did you cut the seal?', text:'“I needed one clean hit. With those two contacts tied together, it hits harder. I could have stopped there.”' },
    { id:'arc', label:'What happens when it sparks?', text:'“I pressed INVERT. Heard the deck start recording. The thing still hit me. What I had loaded was gone. It had put a little piece of the attack in its place.”' },
    { id:'cool', label:'How do I keep it from doing that?', text:'“When it says HOT, give it a beat. HOLD will cool the wire. A strong take can still push it. Pull the lead if you need to know what will happen.”' },
    { id:'filed', label:'Can it wipe the tapes in my case?', text:'“Only the one you have loaded for the fight. I played the filed tapes back twice to make sure.”' },
    { id:'back', label:'Fold the tag back', done:true },
  ],
};

export function makeBagScene({
  sectionIds = null,
  sceneId = 'bag',
  readOnly = false,
  mapReadOnly = false,
  equipment = [],
  job = EMPTY_JOB,
  map = null,
  getEquipment = null,
  loadout = null,
  getLoadout = null,
  moveEquipment = null,
  assignEquipmentSlot = null,
  reorderEquipment = null,
  selectHeldEquipmentSlot = null,
  renderInventoryEmbodiment = null,
  renderItemInspection = null,
  getLoadoutLocked = null,
  getJob = null,
  journal = [],
  getJournal = null,
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
  memory = undefined,
  onRemember = () => {},
  getMonitorSource = null,
  embeddedHost = false,
} = {}) {
  const mapOnly=Array.isArray(sectionIds)&&sectionIds.length>0&&sectionIds.every(id=>normalizeBagSectionId(id)==='map');
  const readOnlyMap=readOnly===true||mapReadOnly===true;
  const equipmentSource = typeof getEquipment === 'function' ? getEquipment : () => equipment;
  const loadoutSource = typeof getLoadout === 'function' ? getLoadout : () => loadout;
  const loadoutLockedSource = typeof getLoadoutLocked === 'function' ? getLoadoutLocked : () => '';
  const jobSource = typeof getJob === 'function' ? getJob : () => job;
  const journalSource = typeof getJournal === 'function' ? getJournal : () => journal;
  const liveMapSource = typeof getMap === 'function' ? getMap : () => map;
  const mapSource = ()=>readOnlyMap?readOnlyBagMap(liveMapSource()):liveMapSource();
  const mapUnavailableSource = typeof getMapUnavailableReason === 'function' ? getMapUnavailableReason : () => '';
  const hintSource = typeof getHint === 'function' ? getHint : () => hint;
  const focusSource = typeof getFocus === 'function' ? getFocus : () => focus;
  const guideSource = mapOnly?()=>null:typeof getGuide === 'function' ? getGuide : () => guide;
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
  // Omitted memory supports case-local callers. An explicit null comes from
  // a save with no navigation record, including a fresh run: never borrow the
  // previous run's tracking or seen-update receipts for that save.
  const sourceMemory = memory === undefined ? (mapOnly?null:rememberedNav) : memory;
  const journalReview = createJournalReview(sourceMemory?.journalReview);
  let model = buildBagModel({
    equipment: equipmentSource(), job: jobSource(), journal: journalReview.decorate(journalSource()), map: mapSource(), loadout: loadoutSource(),
    mapUnavailableReason: mapUnavailableSource(), loadoutLocked:loadoutLockedSource(),
    build: workingBuild, settledBuild, hasRig: rigSource(), sheetInsights:sheetInsightSource(),sectionIds,
  });
  let nav = sourceMemory ? repairBagSelection(sourceMemory, model) : initialBagState(model, focus || {});
  let mapNav = initialMapNav({ model: model.map, preferredRoomId: focus?.entryId?.replace(/^room:/, '') || null });
  if (nav.map) mapNav = reduceMapNav({ ...nav.map, ...MAP_VIEW_DEFAULTS, focusedControlId:null, roomFile:null }, { type: 'MODEL_REFRESH' }, model.map);
  let t = 0;
  let notice = '';
  let noticeUntil = 0;
  const hits=createHitRegions();
  function debugHitRegions(){
    const stackData=new Map(hits.list().filter(hit=>hit.kind==='bag-item'&&hit.data).map(hit=>[hit.id,hit.data]));
    return hits.view().map(hit=>stackData.has(hit.id)?{...hit,data:stackData.get(hit.id)}:hit);
  }
  let inventoryGeometry=null,inventoryFocus='grid',inventorySlot=0,lastInventoryClick=null;
  const inventoryMembers={};
  const heldControls = new Map();
  let patchDrag = null, patchSeat = null, patchReturn = null, patchLayout = null, patchLayoutKey = '';
  let mapPresentation = null, mapDrag = null, locatePending = false, mapViewportKey = '';
  let journalPresentation = null, journalPage = 0;
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
    patchSeat = null;
    patchReturn = null;
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
    const { viewMode, rotation, zoom, panX, panY, focusedControlId, roomFile, ...savedMap } = cloneMapNav(mapNav);
    nav = reduceBagNav({ ...nav, journalReview: journalReview.memory() }, { type: 'SET_MAP_NAV', map: savedMap }, model);
    const nextMemory = {
      ...nav,
      selected: { ...nav.selected },
      scroll: { ...nav.scroll },
      map: savedMap,
      mode: 'browse',
      pendingAction: null,
    };
    if(!mapOnly){rememberedNav=nextMemory;rememberedSheetPages={...sheetPages};}
    onRemember(nextMemory);
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

  function openMapSurvey() {
    if (!setSection('map')) return false;
    if (!lockedGuide()) {
      mapNav = reduceMapNav({ ...mapNav, ...MAP_VIEW_DEFAULTS, roomFile: null }, { type: 'CENTER_PLAYER' }, model.map);
      syncBagSelectionFromMap();
      remember();
    }
    return true;
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
      equipment: equipmentSource(), job: jobSource(), journal: journalReview.decorate(journalSource()), map: mapSource(), loadout: loadoutSource(),
      mapUnavailableReason: mapUnavailableSource(), loadoutLocked:loadoutLockedSource(),
      build: workingBuild, settledBuild, hasRig: rigSource(), sheetInsights:sheetInsightSource(),sectionIds,
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
    if(readOnly)return;
    const doc=route.document;
    const tree=sheetDialogueFor(doc?.id);
    if(tree&&!sheetInsightComplete(sheetInsightSource(),doc.id))openImportantSheetDialogue(doc);
  }

  function openSheet(doc){
    if(!doc)return false;
    // Progression observes the inspection immediately, exactly as it did when
    // the old document scene was pushed. Presentation now stays inside the bag.
    if(!readOnly)readDocument(doc);
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
    const actions=entry.inspectionActions||[],first=Math.max(0,actions.findIndex(action=>action.enabled!==false));
    const drawer=entry.readyCapable&&entry.present!==false&&typeof renderItemInspection==='function'
      ?(rect,view)=>renderItemInspection(rect,entry,view):null;
    const inspection=entry.present===false?null:createItemInspection(entry,{draw:drawer});
    inspection?.setView(actions[first]?.view||{yaw:0,pitch:0});
    pushRoute({type:'item-inspect',entryId:entry.id,tree:getItemInspection(entry.sourceId)||null,page:0,
      facetIndex:first,activeFacetIndex:first,detailScroll:0,presentation:null,inspection});
    return true;
  }

  function moveInspectionFacet(route,direction){
    const actions=bagEntry(model,'kit',route.entryId)?.inspectionActions||[];
    for(let offset=1;offset<=actions.length;offset++){
      const index=((route.facetIndex||0)+direction*offset+actions.length)%actions.length;
      if(actions[index].enabled!==false){route.facetIndex=index;AUDIO.menuMove?.();return;}
    }
  }

  function activateInspectionFacet(route,index=route.facetIndex||0){
    const action=bagEntry(model,'kit',route.entryId)?.inspectionActions?.[index];
    if(!action||action.enabled===false){AUDIO.menuDenied?.();return false;}
    route.facetIndex=index;route.activeFacetIndex=index;route.detailScroll=0;
    route.inspection?.setView(action.view||{yaw:0,pitch:0});AUDIO.menuConfirm?.();return true;
  }

  function scrollInspection(route,delta){
    route.detailScroll=Math.max(0,Math.min(route.presentation?.maxScroll??0,(route.detailScroll||0)+delta));
  }

  function applyChosenSkills() {
    if(!bagSection(model,'skills'))return;
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
    if(!bagSection(model,normalized))return false;
    if(!guideAllowsSection(normalized)){refuseGuided();return false;}
    cancelPatchDrag();
    mapDrag=null;
    mapNav=reduceMapNav(mapNav,{type:'FOCUS_CONTROL',controlId:null},model.map);
    if(routes.length>1){for(const route of routes.splice(1)){route.inspection?.dispose();route.reader?.exit?.();}syncActionPresentation();}
    const before = nav.sectionId;
    nav = reduceBagNav(nav, { type: 'SELECT_SECTION', sectionId: normalized }, model);
    if (nav.sectionId === 'map') syncMapSelectionFromBag();
    if (before !== nav.sectionId) {
      journalPage = 0;
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
      journalPage = 0;
      motion.selectionChangedAt = t;
      AUDIO.menuMove();
      remember();
    }
  }


  function kitEntries() {
    return bagSection(model, 'kit')?.entries || [];
  }

  function kitStacks(){return projectInventoryStacks(kitEntries(),{selectedId:nav.selected?.kit,preferredMembers:inventoryMembers});}

  function stackMemberInput(e){
    return e.key==='['||e.code==='BracketLeft'||e.controllerAction==='mapFloorPrev'?-1
      :e.key===']'||e.code==='BracketRight'||e.controllerAction==='mapFloorNext'?1:0;
  }

  function selectStackMember(direction){
    const stack=inventoryStackForEntry(kitStacks(),nav.selected?.kit);
    if(!stack||stack.memberCount<2)return false;
    const entry=nextInventoryStackMember(stack,nav.selected.kit,direction),route=currentRoute();
    inventoryFocus='grid';selectKitEntry(entry);
    if(route.type==='item-actions'){
      route.entryId=entry.id;route.index=Math.min(route.index||0,Math.max(0,entry.actionList.length-1));syncActionPresentation();
    }
    lastInventoryClick=null;return true;
  }

  function selectKitEntry(entry) {
    if (!entry) return;
    const stack=inventoryStackForEntry(kitStacks(),entry.id);
    if(stack)inventoryMembers[stack.id]=entry.id;
    const before = currentBagEntry(nav, model)?.id;
    nav = reduceBagNav(nav, { type: 'SELECT_ENTRY', sectionId: 'kit', entryId: entry.id }, model);
    if (currentBagEntry(nav, model)?.id !== before) {
      motion.selectionChangedAt = t;
      AUDIO.menuMove();
      remember();
    }
  }

  function moveKitSpatial(dx, dy) {
    if(currentRoute().type==='item-actions'){routes.pop();syncActionPresentation();}
    const entries = kitEntries();
    const stacks=kitStacks();
    const current = currentBagEntry(nav, model);
    if (!entries.length || !current) return;
    const geo=inventoryGeometry||bagInventoryGeometry(model,nav,bagLayout({body:{x:0,y:0,w:100,h:22},sectionId:'kit'}));
    const at=Math.max(0,stacks.findIndex(stack=>stack.memberIds.includes(current.id)));
    const grid=bagInventoryGridLayout(geo.grid,stacks.length,at,nav.scroll?.kit||0);
    if(inventoryFocus==='equipment'){
      if(dx>0&&inventorySlot%geo.equipmentColumns===geo.equipmentColumns-1){inventoryFocus='grid';selectKitEntry(stacks[Math.min(stacks.length-1,Math.floor(inventorySlot/geo.equipmentColumns)*grid.columns)]?.entry);return;}
      inventorySlot=bagInventoryMoveIndex(inventorySlot,4,geo.equipmentColumns,dx,dy);
      const entry=entries.find(item=>item.sourceId===model.loadout.top[inventorySlot]);
      if(entry)selectKitEntry(entry);
      return;
    }
    if(dx<0&&at%grid.columns===0){
      inventoryFocus='equipment';inventorySlot=Math.min(3,Math.floor(at/grid.columns)%4);
      const entry=entries.find(item=>item.sourceId===model.loadout.top[inventorySlot]);
      if(entry)selectKitEntry(entry);
      return;
    }
    const next=bagInventoryMoveIndex(at,stacks.length,grid.columns,dx,dy);
    selectKitEntry(stacks[next]?.entry);
    const nextGrid=bagInventoryGridLayout(geo.grid,stacks.length,next,nav.scroll?.kit||0);
    nav={...nav,scroll:{...nav.scroll,kit:nextGrid.offset}};
  }

  function holdInventorySlot(index){
    if(model.loadoutLocked){notice=String(model.loadoutLocked);noticeUntil=t+2.2;return false;}
    const entry=index==null?null:kitEntries().find(item=>item.sourceId===model.loadout.top[index]);
    if(index!=null&&(!entry||entry.present===false||entry.source?.deployed)){
      notice=entry&&(entry.present===false||entry.source?.deployed)?'RECOVER THE ITEM FIRST':'EMPTY SLOT · EQUIP AN ITEM FIRST';noticeUntil=t+2.2;return false;
    }
    const action=entry?.actionList?.find(candidate=>candidate.id==='hold-item'||candidate.id==='lower-item');
    if(action?.enabled===false){notice=action.reason;noticeUntil=t+2.2;return false;}
    if(typeof selectHeldEquipmentSlot!=='function')return false;
    const result=selectHeldEquipmentSlot(index);
    if(result===false||(result?.changed===false&&result.reason&&!String(result.reason).startsWith('already'))){notice='HANDS UNCHANGED';noticeUntil=t+2.2;return false;}
    refresh();return true;
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
  function openServiceTag() {
    if (!selectedSkill()?.circuitBend || lockedGuide()) return false;
    pushRoute({type:'sheet-dialog',tree:SERVICE_TAG,index:0,answer:null,review:true});
    AUDIO.menuPage?.();
    return true;
  }
  function selectSkill(entry) {
    if (!entry) return;
    nav = reduceBagNav(nav, { type: 'SELECT_ENTRY', sectionId: 'skills', entryId: entry.id }, model);
    motion.selectionChangedAt = t;
    AUDIO.menuMove();
    remember();
  }
  function moveSkill(dx, dy) {
    const current = selectedSkill();
    if (patchLayout && current) selectSkill(nextPatchBayNode(patchLayout, current.id, dx, dy));
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

  function returnHeldPatch(gesture) {
    if (!gesture?.rerouteId || !gesture.moved || hardwareMotionReduced()) return;
    patchReturn = {id:gesture.rerouteId,from:gesture.displayTo,time:t};
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
        || patchLayout?.sources?.find(item => item.id === source?.id)
        || patchLayout?.terminals?.find(item => item.id === source?.id);
      if (!from) { patchRefusal('SOURCE OUTPUT IS NOT AVAILABLE'); return; }
    }
    const compatibleIds = compatibleSkillInputs(workingBuild, from, { hasRig: rigSource(), rerouteId });
    if (!rerouteId && !compatibleIds.length) {
      const reason=entry?.circuitBend && skillPatchAvailability(workingBuild,from,entry.techniqueId,{hasRig:rigSource()}).reason;
      patchRefusal(reason || (workingBuild.unspent <= 0 ? 'NO SPARE CABLE · RETURN A PATCH TO SPARES' : 'NO COMPATIBLE INPUT · CHECK THE CHANNEL AND PREREQUISITES'));
      return;
    }
    patchReturn = null;
    patchDrag = {
      from: { ...from }, to: { x: event.cellX, y: event.cellY },
      start: { x: event.cellX, y: event.cellY }, moved: false,
      displayTo: { x: event.cellX, y: event.cellY },
      rerouteId, returnable: !!rerouteId, compatibleIds, valid: false, targetId: null, returnHover: false,
      returnCount: rerouteId ? techniquePullPreview(workingBuild, rerouteId).returns : 0,
      pointerId: event.pointerId ?? 'primary', captureTarget: event.originalEvent?.target || null,
    };
    AUDIO.menuMove?.({scope:'bag:patch',profile:'patch'});
    try { patchDrag.captureTarget?.setPointerCapture?.(event.pointerId); } catch (_) { /* global pointerup is also routed */ }
    notice = rerouteId ? 'MOVE THIS PLUG · DROP ON SPARES TO RETURN ITS RUN' : 'DROP INTO A MARKED INPUT';
    noticeUntil = t + 5;
  }

  function updatePatchPointer(event) {
    if (!patchDrag || (event.pointerId ?? 'primary') !== patchDrag.pointerId) return false;
    patchDrag.to = { x: event.cellX, y: event.cellY };
    const metrics = uiCellMetrics();
    patchDrag.moved ||= Math.hypot((event.cellX-patchDrag.start.x)*metrics.cellW, (event.cellY-patchDrag.start.y)*metrics.cellH) >= 6;
    const hit = hits.hit(event.cellX, event.cellY);
    const target = hit?.kind === 'bag-patch-input' ? hit.data?.socket : null;
    const returnHover = hit?.kind === 'bag-patch-return' && !!patchDrag.rerouteId && patchDrag.moved;
    const candidate = target && skillPatchAvailability(workingBuild, patchDrag.from, target.techniqueId, {
      hasRig: rigSource(), rerouteId: patchDrag.rerouteId,
    });
    patchDrag.targetId = target?.id ?? null;
    patchDrag.returnHover = returnHover;
    patchDrag.valid = returnHover || !!candidate?.enabled;
    patchDrag.reason = returnHover ? '' : candidate?.reason || '';
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
    if (hit?.kind !== 'bag-patch-input') { returnHeldPatch(gesture); notice = 'PATCH UNCHANGED'; noticeUntil = t + 1.2; AUDIO.menuBack?.({scope:'bag:patch'}); return; }
    const result = connectSkillPatch(workingBuild, gesture.from, hit.data?.socket?.techniqueId, {
      hasRig: rigSource(), rerouteId: gesture.rerouteId,
    });
    if (!result.changed) {
      if (result.reason) { returnHeldPatch(gesture); patchRefusal(result.reason); }
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
    patchSeat = {id:target?.techniqueId,time:t};
    refresh(); emitGuideEvent('skills-changed'); AUDIO.menuPatch?.();
  }

  function mapAction(action, payload = {}) {
    if(nav.sectionId!=='map'||currentRoute().type!=='root')return false;
    if(readOnlyMap&&['set-target','clear-target'].includes(action))return false;
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
    if(readOnlyMap&&['mark','unmark','mark-waypoint','clear-waypoint','set-target','clear-target','confirm-waypoint'].includes(actionId))return false;
    const targetSpace=nav.sectionId==='map'?selectedMapSpace(mapNav,model.map):null;
    const descriptor=actionFor(entry,actionId);
    if(descriptor?.enabled===false){notice=descriptor.reason||'UNAVAILABLE';noticeUntil=t+2.4;AUDIO.menuDenied?.();return false;}
    if(descriptor?.confirm&&!confirmed){pushRoute({type:'confirm',entryId:entry.id,actionId,descriptor});AUDIO.menuConfirm?.();return true;}
    let ok = false;

    if (entry.kind === 'quest' && actionId === 'journal-track') {
      const following = nav.journalPinnedId === entry.id && nav.journalPinnedKey === journalTrackingKey(entry);
      nav = { ...nav, journalPinnedId: following ? null : entry.id, journalPinnedKey: following ? null : journalTrackingKey(entry) };
      remember(); ok = true;
    } else if (entry.kind === 'quest' && actionId === 'journal-map') {
      const space = model.map?.spaces?.find((candidate) => candidate.id === entry.mapSpaceId);
      if (space && setSection('map')) {
        mapNav = reduceMapNav(mapNav, { type: 'SELECT_FLOOR', floorId: space.floorId }, model.map);
        mapNav = reduceMapNav(mapNav, { type: 'SELECT_SPACE', spaceId: space.id }, model.map);
        syncBagSelectionFromMap(); remember(); ok = true;
      }
    } else if (nav.sectionId === 'map') {
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
    } else if(entry.kind==='gear'&&actionId==='hold-item'){
      ok=holdInventorySlot(entry.topIndex);
    } else if(entry.kind==='gear'&&actionId==='lower-item'){
      ok=holdInventorySlot(null);
    } else if(entry.kind==='gear'&&actionId==='set-slot'){
      pushRoute({type:'slot-picker',entryId:entry.id,index:Math.max(0,entry.topIndex)});ok=true;
    } else if(entry.kind==='gear'&&(actionId==='unset-slot'||actionId==='move-storage')){
      const result=typeof moveEquipment==='function'?moveEquipment(entry.sourceId,'storage'):{changed:false,reason:'unavailable'};
      ok=!!result?.changed;
      if(!ok){notice='REACHABLE EQUIPMENT UNCHANGED';noticeUntil=t+2.0;}
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
  const upInput=(e)=>e.key==='ArrowUp'||String(e.key||'').toLowerCase()==='w'||e.code==='KeyW'||e.controllerAction==='move_up';
  const downInput=(e)=>e.key==='ArrowDown'||String(e.key||'').toLowerCase()==='s'||e.code==='KeyS'||e.controllerAction==='move_down';

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
      const memberDirection=stackMemberInput(e);
      if(memberDirection&&selectStackMember(memberDirection))return true;
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
      if(upInput(e)||e.key==='ArrowLeft'||e.controllerAction==='move_left'){route.index=(route.index-1+capacity)%capacity;AUDIO.menuMove?.();return true;}
      if(downInput(e)||e.key==='ArrowRight'||e.controllerAction==='move_right'){route.index=(route.index+1)%capacity;AUDIO.menuMove?.();return true;}
      if(confirmInput(e)){
        const entry=bagEntry(model,'kit',route.entryId);
        const result=typeof assignEquipmentSlot==='function'?assignEquipmentSlot(entry?.sourceId,route.index):{changed:false,reason:'unavailable'};
        if(result?.changed){popRoute();refresh();AUDIO.menuFit?.();}
        else{notice=result?.reason==='already-in-slot'?'ALREADY EQUIPPED HERE':'REACHABLE EQUIPMENT UNCHANGED';noticeUntil=t+2.2;AUDIO.menuDenied?.();}
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
      const actions=bagEntry(model,'kit',route.entryId)?.inspectionActions||[];
      if(backInput(e)){popRoute();return true;}
      if(actions.length&&(e.key==='Tab'||e.controllerAction==='tabNext'||e.controllerAction==='tabPrev')){
        e.preventDefault?.();moveInspectionFacet(route,e.shiftKey||e.controllerAction==='tabPrev'?-1:1);return true;
      }
      if(actions.length&&confirmInput(e)){activateInspectionFacet(route);return true;}
      if(e.controllerAction==='mapLocate'){route.inspection?.reset();return true;}
      if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(e.key)||['move_up','move_down','mapFloorPrev','mapFloorNext'].includes(e.controllerAction)){
        if(e.key==='Home')route.detailScroll=0;
        else if(e.key==='End')route.detailScroll=route.presentation?.maxScroll||0;
        else scrollInspection(route,(e.key==='PageUp'||e.controllerAction==='mapFloorPrev'?-1:e.key==='PageDown'||e.controllerAction==='mapFloorNext'?1:e.key==='ArrowUp'||e.controllerAction==='move_up'?-1:1)*
          (e.key==='PageUp'||e.key==='PageDown'||['mapFloorPrev','mapFloorNext'].includes(e.controllerAction)?route.presentation?.rows||1:1));
        return true;
      }
      if(route.inspection?.key(e))return true;
      if(confirmInput(e)){popRoute();return true;}
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
      uiText(x,y,`EQUIP ${entry?.title||'ITEM'} · CHOOSE A REACHABLE SLOT`,'ui-amber',.95);
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
      const slotHint=activeInputPromptDevice()==='controller'?'← / → SLOT':'[← / →] SLOT';
      uiText(x,y+h-2,`${slotHint}   [${inputPromptLabel('confirm')}] SET   [${inputPromptLabel('back')}] BACK   [${inputPromptLabel('bag')}] CLOSE BAG`,'ui-label',.75,w);
      return;
    }
    if(route.type==='item-inspect'){
      const entry=bagEntry(model,'kit',route.entryId);
      route.presentation=drawItemInspectionView({entry,inspection:route.inspection,lines:route.tree?.start?.lines||[],rect,
        active:scenes.top()===scene||embeddedHost,focusIndex:route.facetIndex,activeIndex:route.activeFacetIndex,scroll:route.detailScroll});
      route.detailScroll=route.presentation.scroll;
      return;
    }
    if(route.type==='sheet-dialog'){
      const service=route.tree===SERVICE_TAG;
      const hasTagSpace=service&&w>=42&&h>=9;
      const textWidth=hasTagSpace?Math.floor(w*.64):w;
      if (hasTagSpace) uiDraw(({ctx,dpr,cellW,cellH})=>{
        const tagWidth=Math.min(w*.32*cellW,280);
        const tagHeight=tagWidth*.48;
        const tagX=(x+w)*cellW-tagWidth-5;
        const tagY=(y+2.7)*cellH;
        ctx.scale(dpr,dpr);
        drawServiceLockoutTag(ctx,{x:tagX,y:tagY,w:tagWidth,h:tagHeight});
      });
      const heading=service?'SERVICE INTERFACE / DO NOT LINK':`SHEETS / IMPORTANT / ${route.tree?.title||route.document?.title||''}`;
      uiText(x,y,fit(heading,w),'ui-amber',1);
      if(route.answer){
        uiText(x,y+2,route.answer.label,'ui-blue',.86);
        wrapped(route.answer.text,x,y+4,textWidth,Math.max(1,h-7),'ui-primary',.9);
        uiText(x,y+h-1,`[${inputPromptLabel('confirm')}] QUESTIONS   [${inputPromptLabel('back')}] BACK`,'ui-label',.72);
        return;
      }
      uiText(x,y+2,route.tree?.prompt||'WHAT MATTERS HERE?','ui-primary',.9);
      (route.tree?.choices||[]).forEach((choice,index)=>{
        const row=y+4+index,on=index===(route.index||0);
        uiText(x,row,on?'▸':' ',on?'ui-amber':'ui-secondary',on?1:.5);
        uiText(x+2,row,choice.label,on?'ui-amber':'ui-primary',on?1:.76);
      });
      uiText(x,y+h-1,`[↑ / ↓] CHOOSE   [${inputPromptLabel('confirm')}] OPEN   [${inputPromptLabel('back')}] BACK`,'ui-label',.72);
    }
  }

  function selectEntry(sectionId,entryId){
    if (nav.selected?.[sectionId] !== entryId) journalPage = 0;
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
    if(nav.sectionId==='journal'){
      for(const hit of journalPresentation?.hits || []) addHit({ ...hit, disabled: hit.enabled === false,
        onClick: () => {
          if (hit.kind === 'journal-entry') { selectEntry('journal', hit.entryId); return; }
          if (hit.actionId === 'journal-prev-page' || hit.actionId === 'journal-next-page') {
            journalPage = Math.max(0, Math.min((journalPresentation?.detailPages || 1) - 1,
              journalPage + (hit.actionId === 'journal-next-page' ? 1 : -1))); return;
          }
          execute(currentBagEntry(nav,model),hit.actionId);
        },
      });
    }else if(nav.sectionId==='kit'){
      const geo=bagInventoryGeometry(model,nav,layout),entries=model.sections.find((section)=>section.id==='kit')?.entries||[];
      inventoryGeometry=geo;
      const selected=bagEntry(model,'kit',nav.selected?.kit),stacks=kitStacks(),at=Math.max(0,stacks.findIndex(stack=>stack.memberIds.includes(selected?.id)));
      const grid=bagInventoryGridLayout(geo.grid,stacks.length,at,nav.scroll?.kit||0);
      grid.cells.forEach(cell=>{
        const stack=stacks[cell.index],entry=stack?.entry;if(!entry)return;
        addHit({id:`bag:item:${entry.id}`,kind:'bag-item',...cell,label:stack.key?`${stack.label} · ${stack.availableQuantity}`:entry.title,data:{stackId:stack.id,memberIds:stack.memberIds,quantity:stack.quantity,availableQuantity:stack.availableQuantity},onClick:(_hit,event)=>{
          inventoryFocus='grid';
          const twice=lastInventoryClick?.id===entry.id&&t-lastInventoryClick.at<.4;
          if(currentRoute().type==='item-actions'){routes.pop();syncActionPresentation();}
          selectKitEntry(entry);lastInventoryClick={id:entry.id,at:t};
          if(twice||(event?.originalEvent?.detail||0)>=2)activatePrimary();
        }});
      });
      geo.slots.forEach(slot=>addHit({id:`bag:equipment:${slot.index}`,kind:'bag-equipment',...slot,label:`REACHABLE SLOT ${slot.index+1}`,onClick:()=>{
        if(currentRoute().type==='item-actions'){routes.pop();syncActionPresentation();}
        inventoryFocus='equipment';inventorySlot=slot.index;
        const entry=entries.find(item=>item.sourceId===model.loadout.top[slot.index]);if(entry)selectKitEntry(entry);
        if(holdInventorySlot(slot.index))AUDIO.menuConfirm?.();else AUDIO.menuDenied?.();
      }}));
      addHit({id:'bag:lower-hands',kind:'bag-held-action',...geo.lower,label:'LOWER HANDS',disabled:model.heldSlot==null,onClick:()=>{
        if(holdInventorySlot(null))AUDIO.menuRemove?.();else AUDIO.menuDenied?.();
      }});
      addHit({id:'bag:inventory-prev',kind:'bag-grid-page',...grid.previous,label:'PREVIOUS ITEMS',disabled:grid.offset<=0,onClick:()=>{inventoryFocus='grid';moveKitSpatial(0,-grid.rows);}});
      addHit({id:'bag:inventory-next',kind:'bag-grid-page',...grid.next,label:'NEXT ITEMS',disabled:grid.offset+grid.capacity>=stacks.length,onClick:()=>{inventoryFocus='grid';moveKitSpatial(0,grid.rows);}});
      const actionGeometry=bagInventoryActionLayout(geo.detail,selected,{...nav,inventoryStack:inventoryStackForEntry(stacks,selected?.id)});
      if(actionGeometry.stack){
        addHit({id:'bag:stack-member-prev',kind:'bag-stack-member',...actionGeometry.stack.previous,label:'PREVIOUS ITEM IN STACK',onClick:()=>selectStackMember(-1)});
        addHit({id:'bag:stack-member-next',kind:'bag-stack-member',...actionGeometry.stack.next,label:'NEXT ITEM IN STACK',onClick:()=>selectStackMember(1)});
      }
      actionGeometry.rows.forEach(({action,index,...rect})=>addHit({id:`bag:action:${action.id}`,kind:'bag-action',...rect,label:action.label,disabled:!action.enabled,onHover:()=>{const route=currentRoute();if(route.type==='item-actions'){route.index=index;syncActionPresentation();}},onClick:()=>{
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
      if (selectedSkill()?.circuitBend && !lockedGuide() && !patchDrag) {
        const tag=serviceTagBounds(patchLayout.detail,patchLayout.returnZone,patchLayout.strip.side,uiCellMetrics());
        addHit({id:'bag:service-tag',kind:'bag-service-tag',...tag,label:'READ WARNING TAG',onClick:openServiceTag});
      }
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
    }else if(route.type==='sheet-dialog'){
      if(route.answer) addHit({id:'bag:sheet-questions',kind:'bag-sheet-choice',x,y:y+h-1,w,h:1,label:'QUESTIONS',onClick:()=>handleRouteKey({key:'Enter',code:'Enter'})});
      else for (const [index,choice] of (route.tree?.choices||[]).entries()) {
        const choiceWidth=route.tree===SERVICE_TAG&&w>=42&&h>=9?Math.floor(w*.64):w;
        addHit({id:`bag:sheet-choice:${choice.id}`,kind:'bag-sheet-choice',x,y:y+4+index,w:choiceWidth,h:1,label:choice.label,
          onHover:()=>{route.index=index;},onClick:()=>{route.index=index;handleRouteKey({key:'Enter',code:'Enter'});}});
      }
    }else if(route.type==='item-inspect'){
      const entry=bagEntry(model,'kit',route.entryId),actions=entry?.inspectionActions||[];
      const presentation=route.presentation||itemInspectionLayout(rect,{actions,focusIndex:route.facetIndex});
      const {back,reset}=presentation;
      addHit({id:'bag:subview-back',kind:'bag-back',...back,label:'BACK',onClick:popRoute});
      addHit({id:'bag:inspection-reset',kind:'bag-reset',...reset,label:'RESET VIEW',disabled:!route.inspection,onClick:()=>route.inspection?.reset()});
      for(const facet of presentation.facets)addHit({id:`bag:inspection-facet:${actions[facet.index].id}`,kind:'bag-inspection-facet',...facet,
        label:actions[facet.index].label,disabled:actions[facet.index].enabled===false,onClick:()=>activateInspectionFacet(route,facet.index)});
      if(presentation.facetPrev)addHit({id:'bag:inspection-facet-prev',kind:'bag-inspection-page',...presentation.facetPrev,label:'PREVIOUS DETAIL',onClick:()=>moveInspectionFacet(route,-1)});
      if(presentation.facetNext)addHit({id:'bag:inspection-facet-next',kind:'bag-inspection-page',...presentation.facetNext,label:'NEXT DETAIL',onClick:()=>moveInspectionFacet(route,1)});
      if(presentation.maxScroll){
        addHit({id:'bag:inspection-scroll-up',kind:'bag-inspection-scroll',...presentation.scrollUp,label:'PREVIOUS TEXT',onClick:()=>scrollInspection(route,-presentation.rows)});
        addHit({id:'bag:inspection-scroll-down',kind:'bag-inspection-scroll',...presentation.scrollDown,label:'NEXT TEXT',onClick:()=>scrollInspection(route,presentation.rows)});
      }
    }else addHit({id:'bag:subview-back',kind:'bag-back',x,y,w,h,label:'BACK',onClick:popRoute});
  }

  const scene = {
    id: sceneId,
    blocksInput: true,
    blocksWorld: true,
    allowsLook: false,
    lensPreset: 'calm',
    // Inventory browsing and its action drawer share the navigator. An item
    // inspection uses the full workspace to show the object and its controls.
    get faceplate() {
      const route = currentRoute().type;
      return nav.sectionId === 'kit' && route !== 'root' && route !== 'item-actions' ? false : undefined;
    },

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
    get handlesEscape() { return mapOnly||currentRoute().type !== 'root'||nav.sectionId==='map'&&!!(mapNav.focusedControlId||mapNav.roomFile); },
    get inventoryModalActions() {
      const route=currentRoute();
      if(route.type==='item-inspect'){
        return route.inspection
          ? ['mapFloorPrev','mapFloorNext','mapLocate']
          : ['mapFloorPrev','mapFloorNext'];
      }
      if(route.type==='root'&&nav.sectionId==='skills'&&selectedSkill()?.circuitBend&&!lockedGuide())return ['mapFile'];
      if(nav.sectionId==='kit'&&['root','item-actions'].includes(route.type)){
        const stack=inventoryStackForEntry(kitStacks(),nav.selected?.kit);
        return stack?.memberCount>1?['mapFloorPrev','mapFloorNext']:[];
      }
      return [];
    },
    get modalActions() { return currentRoute().type!=='root' ? [] : nav.sectionId==='map'
      ? ['mapFloorPrev','mapFloorNext','mapLocate','mapFile','mapConsole']
      : nav.sectionId==='journal' ? ['mapFile','mapFloorPrev','mapFloorNext'] : []; },

    enter() {
      if(!mapOnly)preloadItemPortraits();
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
      if (patchSeat && t-patchSeat.time>=.11) patchSeat=null;
      if (patchReturn && t-patchReturn.time>=.17) patchReturn=null;
      if (patchDrag) {
        const tracking = hardwareMotionReduced() ? 1 : 1-Math.exp(-Math.max(0,dt)*33);
        const {displayTo,to} = patchDrag;
        displayTo.x += (to.x-displayTo.x)*tracking;
        displayTo.y += (to.y-displayTo.y)*tracking;
      }
      guideNudge += dt;
      if (notice && t >= noticeUntil) notice = '';
      pinGuide(activeGuide());
    },
    refresh,
    selectSection: setSection,
    openMapSurvey,
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
        inventory:{focus:inventoryFocus,slot:inventorySlot,geometry:inventoryGeometry,stacks:kitStacks()},
        chosenTechniqueIds: [...chosenTechniqueIds], workingBuild: structuredClone(workingBuild),
        route:{...currentRoute(),reader:currentRoute()?.reader?.view?.()||null,inspection:currentRoute()?.inspection?.view()||null},hitRegions:debugHitRegions(),sheetPages:{...sheetPages},guidePresentation,
        mapPresentation:mapPresentation?{hits:mapPresentation.hits,layout:mapPresentation.layout,projectedPoints:mapPresentation.projectedPoints}:null,
        journalPresentation, journalPage,
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
        if (backInput(e)) returnHeldPatch(patchDrag);
        cancelPatchDrag();
        if (backInput(e)) { notice='PATCH UNCHANGED'; noticeUntil=t+1.2; return true; }
      }
      const momentarySection = (sectionId) => {
        if (!e.repeat) pressBagControl(`bag:tab:${sectionId}`,e);
        setSection(sectionId);
      };
      if (bagCloseInput(e)) { close({suppressReopen:true}); return true; }
      if(currentRoute().type!=='root')return handleRouteKey(e);
      if (isMapShortcut(e)) {
        e.preventDefault?.();
        if (nav.sectionId === 'map') close({suppressReopen:true});
        else { pressBagControl('bag:tab:map', e); openMapSurvey(); }
        return true;
      }
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
      if (raw === '5' || code === 'Digit5') { momentarySection('journal'); return true; }
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
      if (nav.sectionId === 'journal' && (raw === 'PageUp' || raw === 'PageDown' || e.controllerAction === 'mapFloorPrev' || e.controllerAction === 'mapFloorNext')) {
        const next = raw === 'PageDown' || e.controllerAction === 'mapFloorNext';
        const page = Math.max(0, Math.min((journalPresentation?.detailPages || 1) - 1, journalPage + (next ? 1 : -1)));
        if (!e.repeat && page !== journalPage) pressBagControl(next ? 'bag:journal:next-page' : 'bag:journal:prev-page', e);
        journalPage = page;
        return true;
      }
      if (nav.sectionId === 'journal' && (confirmInput(e) || raw === ' ' || code === 'Space' || e.controllerAction === 'mapFile')) {
        if (!e.repeat) {
          const showMap = raw === ' ' || code === 'Space' || e.controllerAction === 'mapFile';
          const entry = currentBagEntry(nav,model), actionId = showMap ? 'journal-map' : 'journal-track';
          const action = actionFor(entry,actionId);
          if (action && action.enabled !== false) pressBagControl(showMap ? 'bag:journal:map' : 'bag:journal:track', e);
          execute(entry,actionId);
        }
        return true;
      }
      if (nav.sectionId === 'journal' && (raw === 'ArrowUp' || raw === 'ArrowDown' || k === 'w' || k === 's' || code === 'KeyW' || code === 'KeyS')) {
        const previous = raw === 'ArrowUp' || k === 'w' || code === 'KeyW';
        moveList(previous ? -1 : 1);
        if (!e.repeat && currentBagEntry(nav,model)) pressBagControl(journalPresentation?.geometry?.mode !== 'wide'
          ? previous ? 'bag:journal:jog-prev' : 'bag:journal:jog-next'
          : `bag:journal:entry:${nav.selected.journal}`, e);
        return true;
      }

      if (nav.sectionId === 'skills') {
        if ((k==='r'||code==='KeyR'||e.controllerAction==='mapFile') && selectedSkill()?.circuitBend && !guided) {
          if (!e.repeat) openServiceTag();
          return true;
        }
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
        const memberDirection=stackMemberInput(e);
        if(memberDirection&&selectStackMember(memberDirection))return true;
        if (k === 't' || code === 'KeyT') { execute(currentBagEntry(nav,model),'set-slot'); return true; }
        if (k === 'r' || code === 'KeyR') { readyOrClearKitEntry('clear'); return true; }
        if (raw === 'ArrowUp' || k === 'w' || code === 'KeyW'||e.controllerAction==='move_up') { moveKitSpatial(0,-1); return true; }
        if (raw === 'ArrowDown' || k === 's' || code === 'KeyS'||e.controllerAction==='move_down') { moveKitSpatial(0,1); return true; }
        if (raw === 'ArrowLeft' || k === 'a' || code === 'KeyA'||e.controllerAction==='move_left') { moveKitSpatial(-1,0); return true; }
        if (raw === 'ArrowRight' || k === 'd' || code === 'KeyD'||e.controllerAction==='move_right') { moveKitSpatial(1,0); return true; }
        if(raw==='PageUp'||raw==='PageDown'){
          const geo=inventoryGeometry||bagInventoryGeometry(model,nav,bagLayout({body:{x:0,y:0,w:100,h:22},sectionId:'kit'}));
          const grid=bagInventoryGridLayout(geo.grid,kitStacks().length,0,0);inventoryFocus='grid';moveKitSpatial(0,grid.rows*(raw==='PageDown'?1:-1));return true;
        }
        if(inventoryFocus==='equipment'&&(raw===' '||code==='Space')){
          if(!e.repeat){if(holdInventorySlot(null))AUDIO.menuRemove?.();else AUDIO.menuDenied?.();}return true;
        }
        if(inventoryFocus==='equipment'&&confirmInput(e)){
          if(!e.repeat){if(holdInventorySlot(inventorySlot))AUDIO.menuConfirm?.();else AUDIO.menuDenied?.();}return true;
        }
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
        if(currentRoute().type==='item-inspect'){
          const route=currentRoute(),rect=route.presentation?.text;
          if(rect&&e.cellX>=rect.x&&e.cellX<rect.x+rect.w&&e.cellY>=rect.y&&e.cellY<rect.y+rect.h){
            scrollInspection(route,Math.sign(Number(e.deltaY)||0)*3);e.preventDefault?.();return true;
          }
          return false;
        }
        if(nav.sectionId==='kit'&&inventoryGeometry&&['root','item-actions'].includes(currentRoute().type)){
          const contains=rect=>e.cellX>=rect.x&&e.cellX<rect.x+rect.w&&e.cellY>=rect.y&&e.cellY<rect.y+rect.h;
          const direction=Math.sign(Number(e.deltaY)||0);
          if(contains(inventoryGeometry.grid)){inventoryFocus='grid';if(direction)moveKitSpatial(0,direction);e.preventDefault?.();return true;}
          if(contains(inventoryGeometry.detail)){
            if(direction){if(currentRoute().type==='root')pushRoute({type:'item-actions',entryId:currentBagEntry(nav,model)?.id,index:0});
              const route=currentRoute(),count=bagEntry(model,'kit',route.entryId)?.actionList?.length||1;
              route.index=Math.max(0,Math.min(count-1,(route.index||0)+direction));syncActionPresentation();}
            e.preventDefault?.();return true;
          }
        }
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
        if((hit?.kind==='journal-entry'||hit?.kind==='journal-action')&&!hit.disabled)pressBagControl(hit.id,e);
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
        // The same fixed case selectors remain mounted in metal while a
        // sheet is open. This strip is reserved by the document reader.
        uiDraw(({ctx,dpr,cellW,cellH})=>drawInstrumentPlate(ctx,{
          x:0,y:0,w:size.cols*cellW*dpr,h:BAG_TABS_HEIGHT*cellH*dpr,
          dpr,finish:'aluminum',seed:'field-case-reader-selectors',
        }));
        const closeW=Math.min(14,Math.max(8,size.cols)),closeX=Math.max(0,size.cols-closeW);
        const readerTabs={tabs:{x:1,y:.65,w:Math.max(1,size.cols-2),h:BAG_TABS_HEIGHT}};
        for(const tab of bagTabRegions(model,readerTabs)){
          drawLampButton(tab.x,tab.y,tab.w,tab.h,bagTabButtonState(tab,'sheets',{hovered:hits.hoveredId()===tab.id}));
          addHit({...tab,kind:'bag-tab',onClick:()=>setSection(tab.sectionId)});
        }
        drawPrintedText(2,3.5,fit(`FIELD CASE / SHEETS / ${route.document?.title||route.document?.id||'DOCUMENT'}`,Math.max(8,closeX-3)),
          {w:Math.max(8,closeX-3),ink:'#333830',finish:'etched',darkPanel:false});
        drawPrintedText(closeX,3.5,'[B] CLOSE BAG',{w:closeW,ink:'#333830',finish:'etched',darkPanel:false});
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
      const skills = nav.sectionId === 'skills';
      const subview=!['root','item-actions'].includes(route.type);
      const exposedSkills=skills&&!subview;
      const shallowSkills=exposedSkills&&size.rows>0&&size.rows<30;
      const standardOuter=bagPanelBounds({...size,sectionId:nav.sectionId});
      const caseBounds=shallowSkills&&!guided
        ? {...standardOuter,y:.3,h:Math.max(5,size.rows-.6)} : standardOuter;
      const frame = bagGuideFrame({size,outer:caseBounds,guide:guided,fullHeight:shallowSkills});
      const outer = frame.outer;
      uiScrim(0.74);
      const mapHardware=nav.sectionId==='map'&&!subview;
      const journalHardware=nav.sectionId==='journal'&&!subview;
      const inventoryHardware=nav.sectionId==='kit';
      const compactInventory=nav.sectionId==='kit'&&outer.h-5<26;
      const selectorRail=mapHardware||journalHardware?null:machinePanelBezelRail(
        outer.x,outer.y,outer.w,outer.h,{edge:'top',controlHeight:compactInventory||exposedSkills?1.7:BAG_TAB_CAP_HEIGHT});
      let layout;
      withMachinePanel(outer.x, outer.y, outer.w, outer.h, {
        label: mapOnly?'SURVEY INDICATOR / SI-1':'FIELD CASE / 4417-C',
        source: getMonitorSource?.() || 'FIELD LIVE',
        footer: '', meter: true, theme: 'amber',
        // Sockets, plugs, cables, and switches are exposed hardware. The case
        // still has its metal faceplate, but never puts a cover over that bay.
        glass: skills && !subview || mapHardware || journalHardware || inventoryHardware ? false : {},
        aperture: !(mapHardware || journalHardware || exposedSkills),
        apertureBounds:selectorRail?.apertureBounds,
      }, (body) => {
      if(compactInventory)body={x:outer.x+3,y:outer.y+2.6,w:outer.w-6,h:outer.h-4};
      if(exposedSkills){
        const y=selectorRail.apertureBounds.y;
        body={x:outer.x+3,y,w:outer.w-6,h:outer.y+outer.h-y-1.85};
      }
      layout = bagLayout({
        body:mapHardware||journalHardware?{x:outer.x+3,y:outer.y+2.6,w:outer.w-6,h:outer.h-3.6}:body,
        sectionId:mapHardware?'map':journalHardware?'journal':nav.sectionId==='kit'?'kit':null,
        compactSkills:exposedSkills,
        forceMode: typeof forceLayout === 'function' ? forceLayout() : forceLayout,
      });
      if(selectorRail)layout.tabs.capY=selectorRail.controlY;
      if(mapHardware){
        const viewport=mapLayoutFromBag(layout).mapViewport,key=JSON.stringify(viewport);
        if(mapViewportKey&&key!==mapViewportKey){
          mapNav=reduceMapNav(mapNav,{type:'PAN',dx:-mapNav.panX,dy:-mapNav.panY},model.map);mapDrag=null;
        }
        mapViewportKey=key;
      }
      if (nav.sectionId !== 'map'&&nav.sectionId!=='kit') {
        nav = ensureBagSelectionVisible(nav, model, journalHardware ? journalListCapacity(contentRegion(layout)) : bagListCapacity(layout, nav.sectionId));
      }
      if(nav.sectionId==='kit'){
        inventoryGeometry=bagInventoryGeometry(model,nav,layout);
        const stacks=kitStacks(),at=Math.max(0,stacks.findIndex(stack=>stack.memberIds.includes(nav.selected.kit)));
        const grid=bagInventoryGridLayout(inventoryGeometry.grid,stacks.length,at,nav.scroll?.kit||0);
        nav={...nav,scroll:{...nav.scroll,kit:grid.offset}};
      }
      if (exposedSkills) {
        const region=contentRegion(layout),section=skillsTree();
        const key=JSON.stringify(region);
        if(patchLayoutKey && key!==patchLayoutKey){cancelPatchDrag();patchReturn=null;}
        patchLayoutKey=key;
        patchLayout=patchBayLayout({region,branches:section?.branches||[]});
        if (patchSeat && !hardwareMotionReduced()) {
          const remaining = 1-Math.min(1,(t-patchSeat.time)/.11);
          patchLayout.seating={id:patchSeat.id,progress:1-remaining*remaining};
        }
        if (patchReturn && !hardwareMotionReduced()) {
          const remaining = 1-Math.min(1,(t-patchReturn.time)/.17);
          patchLayout.reseating={...patchReturn,progress:1-remaining*remaining};
        }
      } else { patchLayout=null; patchLayoutKey=''; patchReturn=null; cancelPatchDrag(); }
      const selected=currentBagEntry(nav,model);
      const sectionLabel=model.sections.find((section)=>section.id===nav.sectionId)?.label||nav.sectionId;
      const breadcrumb=`${mapOnly?'SURVEY INDICATOR':'FIELD CASE'} / ${sectionLabel}${route.type==='item-actions'&&selected?` / ${selected.title} / ACTIONS`:''}`;
      const selectedStack=nav.sectionId==='kit'?inventoryStackForEntry(kitStacks(),selected?.id):null;
      const liveHint = guided || (skills && patchDrag) ? '' : (notice || (nav.sectionId === 'kit'
        // Short enough to survive the hint row. The long version ran to 97
        // characters and was cut at "INSPE…", which hid the very verbs it was
        // trying to advertise. What each verb does is on the item itself.
        ? selectedStack?.memberCount>1?`${activeInputPromptDevice()==='controller'?`${inputPromptLabel('mapFloorPrev')} / ${inputPromptLabel('mapFloorNext')}`:'[ / ]'} CHOOSE STACK ITEM`:'EQUIP TO KEEP WITHIN REACH · HOLD TO CARRY'
        : journalHardware
          ? nav.journalPinnedId ? `FOLLOWING: ${bagEntry(model,'journal',nav.journalPinnedId)?.title || 'NONE'}` : ''
        : skills ? '' : hintSource()));
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
      mapPresentation=drawBagView({ model, nav:{...nav,inventoryFocus,inventorySlot,inventoryMembers,hoveredControlId:hits.hoveredId()}, mapNav, layout, hint: liveHint, guide: guided, guideNudge, motion, now: t,renderInventoryEmbodiment,patchStrip:exposedSkills,
        sheetPage: selected?.kind === 'file' ? sheetPages[selected.source?.id] : 0,
        // The tree owns the content area for its own section; the tabs, task line
        // and action rail around it stay exactly as they are everywhere else.
        drawContent: subview
          ? (region)=>drawSubview(route,region)
          : journalHardware
          ? (region) => { journalPresentation = drawJournalView({ entries: bagSection(model,'journal')?.entries || [],
            selectedId: nav.selected.journal, pinnedId: nav.journalPinnedId, hoveredId: hits.hoveredId(), region, scroll: nav.scroll.journal || 0, now: t, detailPage: journalPage }); return journalPresentation; }
          : skills
          ? (region) => drawSkillsSection({ model, layout: region, selectedId: selectedSkill()?.id || null, patchDrag, patchLayout,
            notePrompt: guided ? '' : `[${inputPromptLabel('mapFile')}] READ TAG` })
          : null,
        overrideActions:route.type==='item-inspect'&&selected?.inspectionActions?.length
          ?[[activeInputPromptDevice()==='controller'?`${inputPromptLabel('tabPrev')} / ${inputPromptLabel('tabNext')}`:'TAB','DETAIL'],[inputPromptLabel('confirm'),'EXAMINE'],['↑↓','READ'],[inputPromptLabel('back'),'BACK']]
          :subview?[['ESC','BACK'],['B','CLOSE BAG']]:nav.sectionId==='kit'&&inventoryFocus==='equipment'
          ?[[inputPromptLabel('confirm'),'HOLD'],['SPACE','LOWER'],['→','BACKPACK'],[inputPromptLabel('bag'),'CLOSE']]:null,breadcrumb });
      });
      const closeLabel=guided?.allowClose===false&&guided.kind!=='close'?'SETUP IN PROGRESS':mapHardware?'[M] CLOSE MAP':`[${inputPromptLabel('bag')}] CLOSE BAG`;
      const closeX=Math.max(outer.x+2,outer.x+outer.w-18);
      if(nav.sectionId==='kit'){
        uiFill(closeX-.3,outer.y-.05,16.6,1,'#0a130e');
        drawVfdText(closeX,outer.y,closeLabel,{scale:1,role:'ui-primary',max:16});
      }else drawPrintedText(closeX,outer.y,closeLabel,{w:16,ink:'#333830',finish:'etched',darkPanel:false});
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
      // Seeing a file acknowledges only its presentation receipt. It never
      // changes knowledge, consent or progress. Keep UPDATED visible until the
      // next opening, even after the count of unseen files drops.
      if (journalHardware && (scenes.top() === scene || embeddedHost && scenes.top()?.id !== 'pause')
        && journalReview.presented(nav.selected.journal)) refresh();
    },
  };

  return scene;
}
