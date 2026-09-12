import { uiSize } from '../render/ui.js';
import { drawVanWorkbench, vanWorkbenchLayout, vanWorkbenchReady, vanWorkbenchRemaining,
  vanWorkbenchOptions, vanWorkbenchOptionStatus, VAN_WORKBENCH_GROUPS } from '../render/van-workbench-view.js';
import { normalizeFieldKit } from './field-kit.js';
import { pressControl, releaseControl, cancelControlScope } from './control-feedback.js';
import { uiCue, UI_CUE } from '../audio/ui-cues.js';
import { createVanWorkbenchStage, vanWorkbenchModelIds, vanWorkbenchSelectedObject } from '../render/van-workbench-stage.js';

export const VAN_WORKBENCH_SCENE = 'van-workbench';

export function makeVanWorkbenchScene({ getState = () => ({}), onTakeCase = () => {}, onTakeMap = () => {},
  onChooseDifficulty = () => {}, onKitChange = () => {}, onInspect = () => {}, onInspectWitness = () => {},
  onSpannerChoice = () => {}, onContinue = () => {}, onClose = () => {} } = {}) {
  let selectedGroup = 'headphones', focusId = 'van:case', layout = null, notice = '', noticeUntil = 0, time = 0, lastSize = null;
  let closed = false, continuationPending = false, witnessInspectionGeneration = 0;
  let spannerPrompt = false, spannerChoicePending = false;
  const held = new Map();
  const sound=name=>uiCue(name,{scope:'van',profile:'van'});
  const stage = createVanWorkbenchStage();
  let pickedObject = null;
  const state = () => { const value = getState() || {}; return { ...value, spannerPrompt, fieldKit: normalizeFieldKit(value.fieldKit) }; };
  const clear = () => { held.clear(); cancelControlScope('van:'); };
  function refresh(size = null) {
    const measured = uiSize();
    lastSize = size || (measured.cols > 0 ? measured : lastSize) || measured;
    layout = vanWorkbenchLayout(lastSize, state(), selectedGroup, stage.targets());
    if (!layout.regions.some(region => region.id === focusId)) focusId = `van:group:${selectedGroup}`;
    return layout;
  }
  const say = text => { notice = text; noticeUntil = time + 4; };
  function release(input) {
    const id = held.get(input); if (!id) return false;
    held.delete(input); if (![...held.values()].includes(id)) releaseControl(id); return true;
  }
  function group(id) {
    if (!VAN_WORKBENCH_GROUPS.some(entry => entry.id === id)) return false;
    if(selectedGroup!==id)sound(UI_CUE.PAGE);
    selectedGroup = id; focusId = `van:group:${id}`; refresh(); return true;
  }
  function fitKit(groupId, optionId) {
    const live = state(), availability = vanWorkbenchOptionStatus(live, groupId, optionId);
    // Revalidate the current profile, never the rectangle from a prior frame
    // or the ownership snapshot captured when inspection was first opened.
    if (!availability.available) { say(availability.reason); sound(UI_CUE.DENIED); return false; }
    if (!live.bagTaken) { say('Take the field case before fitting equipment.'); sound(UI_CUE.DENIED); return false; }
    const kit = normalizeFieldKit(live.fieldKit);
    const previous = groupId in kit.cosmetics ? kit.cosmetics[groupId] : kit[groupId];
    // A reference model starts as the default fit but is still on the bench.
    // Its first deliberate selection must reach the owner to pack that group.
    const needsPacking = live.requirePacking && ['headphones', 'microphone', 'recorder', 'flashlight'].includes(groupId)
      && !live.packedGroups?.includes(groupId);
    if (previous === optionId && !needsPacking) return true;
    if (groupId in kit.cosmetics) kit.cosmetics[groupId] = optionId;
    else kit[groupId] = optionId;
    if (onKitChange(normalizeFieldKit(kit), { group: groupId, optionId }) === false) {
      say('FITTING NOT SAVED. PLEASE TRY AGAIN.'); sound(UI_CUE.DENIED); return false;
    }
    sound(UI_CUE.FIT); return true;
  }
  function closeSpannerPrompt() {
    spannerPrompt = false; spannerChoicePending = false; clear(); focusId = 'van:spanner'; refresh();
  }
  function chooseSpanner(answer) {
    if (!spannerPrompt || spannerChoicePending || closed) return false;
    if (answer && !state().bagTaken) {
      say('Take the field case before packing the spanner.'); sound(UI_CUE.DENIED); return false;
    }
    spannerChoicePending = true; clear();
    if (onSpannerChoice(!!answer) === false) {
      spannerChoicePending = false; say('CHOICE NOT SAVED. PLEASE TRY AGAIN.'); sound(UI_CUE.DENIED); return false;
    }
    closeSpannerPrompt(); sound(answer ? UI_CUE.FIT : UI_CUE.CONFIRM);
    say(answer ? 'SPANNER PACKED.' : 'SPANNER LEFT ON THE BENCH.'); return true;
  }
  function inspectWitness() {
    const availability = vanWorkbenchOptionStatus(state(), 'faceplate', 'witness');
    if (!availability.visible) { say(availability.reason); sound(UI_CUE.DENIED); return false; }
    clear(); group('faceplate'); focusId = 'van:kit:faceplate:witness';
    say(availability.owned ? 'TURN OVER THE WITNESS ASSEMBLY. FIT WHEN READY.' : availability.reason);
    const generation = ++witnessInspectionGeneration;
    let fitted = false;
    onInspectWitness({ owned: availability.owned, count: availability.count, required: availability.required,
      onFit: () => {
        if (closed || fitted || generation !== witnessInspectionGeneration || !fitKit('faceplate', 'witness')) return false;
        fitted = true; selectedGroup = 'faceplate'; focusId = 'van:kit:faceplate:witness';
        say('WITNESS EDITION FITTED. APPEARANCE ONLY.'); refresh(); return true;
      } });
    refresh(); return true;
  }
  function activate(region, input) {
    if (!region || closed) return false;
    const live = state();
    if (spannerPrompt) return region.kind === 'spanner-choice' ? chooseSpanner(region.answer) : false;
    if (region.kind === 'continue' && !vanWorkbenchReady(live)) { say(`Before leaving: ${vanWorkbenchRemaining(live).join(', ')}.`); sound(UI_CUE.DENIED); return true; }
    if (region.kind === 'inspect-witness' || (region.kind === 'kit' && region.group === 'faceplate' && region.optionId === 'witness')) {
      return inspectWitness();
    }
    if (region.enabled === false) { if (region.kind === 'kit') say('Take the field case before fitting equipment.'); sound(UI_CUE.DENIED); return true; }
    focusId = region.id;
    if (region.id.startsWith('van:object:')) pickedObject = region.id.slice('van:object:'.length);
    if (region.controlId) { pressControl(region.controlId); held.set(input, region.controlId); }
    if (region.kind === 'case' && !live.bagTaken) sound(onTakeCase()===false?UI_CUE.DENIED:UI_CUE.FIT);
    else if (region.kind === 'map' && !live.mapTaken) sound(onTakeMap()===false?UI_CUE.DENIED:UI_CUE.PAGE);
    else if (region.kind === 'group') group(region.group);
    else if (region.kind === 'kit') {
      if (!vanWorkbenchOptions(region.group).some(option => option.id === region.optionId)) return false;
      if (region.object) { selectedGroup = region.group; focusId = region.id; }
      fitKit(region.group, region.optionId);
    } else if (region.kind === 'spanner') {
      clear(); say(''); spannerPrompt = true; spannerChoicePending = false; focusId = 'van:spanner:no'; sound(UI_CUE.PAGE);
    } else if (region.kind === 'difficulty') { release(input); onChooseDifficulty(); }
    else if (region.kind === 'inspect') { release(input); onInspect(region.item); }
    else if (region.kind === 'continue' && !continuationPending) {
      continuationPending = true; release(input);
      if (onContinue(live) === false) {continuationPending = false;sound(UI_CUE.DENIED);}
      else sound(UI_CUE.CONFIRM);
    } else if (region.kind === 'close') { clear();sound(UI_CUE.BACK);onClose(); }
    refresh(); return true;
  }
  function move(dx, dy) {
    refresh();
    const current = layout.regions.find(region => region.id === focusId) || layout.regions[0];
    const center = region => ({ x: region.x + region.w / 2, y: region.y + region.h / 2 });
    const c = center(current);
    const candidates = layout.regions.filter(region => region.id !== current.id && region.enabled !== false).map(region => {
      const p = center(region), primary = dx ? (p.x - c.x) * dx : (p.y - c.y) * dy;
      const cross = dx ? Math.abs(p.y - c.y) : Math.abs(p.x - c.x) * .35;
      return { region, primary, score: primary + cross * 3 };
    }).filter(entry => entry.primary > .1).sort((a, b) => a.score - b.score);
    if (candidates[0]) {focusId = candidates[0].region.id;sound(UI_CUE.MOVE);}
  }
  const scene = {
    id: VAN_WORKBENCH_SCENE, blocksInput: true, blocksWorld: true, allowsLook: false, handlesEscape: true,
    suppressesHud: true, worldPresentation: 'visible', lookProfile: 'calm',
    enter() { closed = false; continuationPending = false; spannerPrompt = false; spannerChoicePending = false; witnessInspectionGeneration++; refresh(); const live = state();
      focusId = !live.bagTaken ? 'van:case' : !live.mapTaken ? 'van:map' : !live.difficultyConfirmed ? 'van:difficulty' : `van:group:${selectedGroup}`; },
    update(dt) { time += Math.max(0, Number(dt) || 0); },
    // Inspector actions complete before their scene is popped. Returning to
    // this scene retires its callback, including canceled/abandoned previews.
    resume() { continuationPending = false; witnessInspectionGeneration++; clear(); stage.resume(); refresh(); },
    suspend() { clear(); stage.suspend(); },
    exit() { closed = true; spannerPrompt = false; spannerChoicePending = false; witnessInspectionGeneration++; clear(); stage.dispose(); },
    key(event = {}) {
      if (closed) return false;
      const key = String(event.key || '').toLowerCase(), action = event.controllerAction;
      // Controller events need the same repeat firewall as their keyboard
      // counterparts. A held Back that dismissed the optional prompt must not
      // then dismiss the workbench; held Inspect must not stack child scenes.
      if (event.repeat && (['enter', ' ', 'escape', 'i'].includes(key)
        || ['confirm', 'back', 'tabNext', 'tabPrev'].includes(action))) return true;
      if (action === 'back' || key === 'escape') {
        if (spannerPrompt) { closeSpannerPrompt(); sound(UI_CUE.BACK); return true; }
        clear();sound(UI_CUE.BACK);onClose();return true;
      }
      if (spannerPrompt) {
        if (event.repeat) return true;
        if (key === 'y' || key === 'n') { chooseSpanner(key === 'y'); return true; }
        if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'tab'].includes(key)
          || ['move_left', 'move_right', 'move_up', 'move_down', 'tabNext', 'tabPrev'].includes(action)) {
          focusId = focusId === 'van:spanner:yes' ? 'van:spanner:no' : 'van:spanner:yes'; sound(UI_CUE.MOVE); return true;
        }
        if (action === 'confirm' || key === 'enter' || key === ' ') chooseSpanner(focusId === 'van:spanner:yes');
        return true;
      }
      const directions = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1],
        move_left: [-1, 0], move_right: [1, 0], move_up: [0, -1], move_down: [0, 1] };
      if (directions[action || key]) { move(...directions[action || key]); return true; }
      if (/^[1-8]$/.test(key)) { group(VAN_WORKBENCH_GROUPS[Number(key) - 1].id); return true; }
      if (action === 'tabNext' || action === 'tabPrev' || key === 'q' || key === 'e') {
        if (event.repeat) return true;
        const delta = action === 'tabPrev' || key === 'q' ? -1 : 1;
        const at = VAN_WORKBENCH_GROUPS.findIndex(entry => entry.id === selectedGroup);
        group(VAN_WORKBENCH_GROUPS[(at + delta + VAN_WORKBENCH_GROUPS.length) % VAN_WORKBENCH_GROUPS.length].id); return true;
      }
      if (key === 'tab') {
        refresh(); const valid = layout.regions.filter(region => region.enabled !== false);
        const index = valid.findIndex(region => region.id === focusId);
        const next=valid[(index + (event.shiftKey ? -1 : 1) + valid.length) % valid.length]?.id || focusId;
        if(next!==focusId)sound(UI_CUE.MOVE);focusId=next;return true;
      }
      if (action === 'confirm' || key === 'enter' || key === ' ') {
        if (event.repeat) return true;
        refresh(); activate(layout.regions.find(region => region.id === focusId), `key:${event.code || key || action}`); return true;
      }
      if (key === 'i') {
        clear(); const focus = layout?.regions.find(entry => entry.id === focusId);
        if (focus?.kind === 'inspect-witness' || (focus?.group === 'faceplate' && focus?.optionId === 'witness')) {
          inspectWitness(); return true;
        }
        const slot = vanWorkbenchSelectedObject(selectedGroup);
        onInspect(focus?.item || (focus?.kind === 'case' ? 'field-case' : focus?.kind === 'map' ? 'map' :
          slot === 'recorder' ? 'recorder' : vanWorkbenchModelIds(state().fieldKit)[slot])); return true;
      }
      return true;
    },
    keyup(event = {}) { return release(`key:${event.code || String(event.key || '').toLowerCase() || event.controllerAction}`); },
    pointer(event = {}) {
      if (closed) return false;
      if (event.type === 'pointercancel' || event.type === 'lostpointercapture') { clear(); return true; }
      const input = `pointer:${event.pointerId ?? 0}`;
      if (event.type === 'pointerup') { release(input); return true; }
      refresh();
      const hit = [...layout.regions].reverse().find(region => event.cellX >= region.x && event.cellX < region.x + region.w
        && event.cellY >= region.y && event.cellY < region.y + region.h);
      if (event.type === 'pointermove' && hit) {if(focusId!==hit.id)sound(UI_CUE.MOVE);focusId = hit.id;}
      if (event.type === 'pointerdown' && (event.button ?? event.originalEvent?.button ?? 0) === 0) activate(hit, input);
      return true;
    },
    render(size = uiSize()) { lastSize = size; layout = drawVanWorkbench({ state: state(), selectedGroup, focusId,
      notice: time < noticeUntil ? notice : '', now: time }, size, stage); },
    debugState() { if (!layout) refresh(); return { state: state(), selectedGroup, focusId,
      notice: time < noticeUntil ? notice : '', continuationPending, ready: vanWorkbenchReady(state()),
      layout, stage: stage.snapshot(), pickedObject, hitRegions: layout.regions.map(region => ({ ...region })) }; },
  };
  return scene;
}
