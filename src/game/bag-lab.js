//
//  bag-lab.js
//  
//
//  Created by Sebastian Suarez-Solis on 7/12/26.
//

// Query harness: ?baglab=1

import { uiSize, uiText } from '../render/ui.js';
import { makeBagScene } from './bag.js';
import { BAG_LAB_CASES } from './bag-fixtures.js';
import { mapLabModel } from './map-fixtures.js';
import { assignCombatGearSlot, freshCombatLoadout, moveCombatGear } from './combat-loadout.js';
import { completeSheetInsight, freshBagSheetState } from './bag-sheets.js';
import { normalizeCombatBuild, PIN_SOURCES } from './combat-progression.js';

function cloneFixture(source) {
  const copy = JSON.parse(JSON.stringify(source));
  for (const item of copy.equipment || []) {
    if (item && typeof item === 'object' && (item.id === 'radio' || item.id === 'coffee')) item.action = () => {};
  }
  return copy;
}

export function makeBagLabScene() {
  let caseIndex = 0;
  let compact = false;
  let showDebug = true;
  let fixture = cloneFixture(BAG_LAB_CASES[caseIndex]);
  let lastDebug = null;
  let loadout=freshCombatLoadout();
  let sheetInsights=freshBagSheetState();
  let build=normalizeCombatBuild(null,PIN_SOURCES.encounters);
  let personalWaypoint=null;

  const bag = makeBagScene({
    getEquipment: () => fixture.equipment,
    getLoadout:()=>loadout,
    moveEquipment:(id,destination)=>{
      const result=moveCombatGear(loadout,id,destination);loadout=result.loadout;return result;
    },
    assignEquipmentSlot:(id,slot)=>{
      const result=assignCombatGearSlot(loadout,id,slot);loadout=result.loadout;return result;
    },
    getJob: () => fixture.job,
    getMap: () => mapLabModel({ id: fixture.id, policy:'directional', player:{floorId:'b1',roomId:'main_b3',position:{x:7,y:11}}, target:(fixture.job.rooms||[]).find((room)=>room.marked)?.roomId||null, done:fixture.job.done||0 }),
    getHint: () => `BAG LAB · ${fixture.id}`,
    forceLayout: () => compact ? 'compact' : null,
    readDocument: () => {},
    getSheetInsights:()=>sheetInsights,
    onSheetInsight:(id)=>{sheetInsights=completeSheetInsight(sheetInsights,id);return true;},
    getBuild:()=>build,
    hasRig:()=>true,
    onApplySkills:(next)=>{build=next;},
    onItemAction:()=>({handled:true}),
    markRoom: (roomId) => {
      for (const room of fixture.job.rooms || []) room.marked = room.roomId === roomId ? !room.marked : false;
      fixture.job = { ...fixture.job, rooms: [...fixture.job.rooms] };
      bag.refresh();
      return true;
    },
    markSpace:(space)=>{
      personalWaypoint=personalWaypoint===space.id?null:space.id;
      for(const room of fixture.job.rooms||[])room.marked=personalWaypoint===`space:${room.roomId}`;
      fixture.job={...fixture.job,rooms:[...fixture.job.rooms]};
      bag.refresh();return true;
    },
    debug: (state) => { lastDebug = state; },
  });

  function changeCase(delta) {
    caseIndex = (caseIndex + delta + BAG_LAB_CASES.length) % BAG_LAB_CASES.length;
    fixture = cloneFixture(BAG_LAB_CASES[caseIndex]);
    loadout=freshCombatLoadout();
    sheetInsights=freshBagSheetState();
    personalWaypoint=null;
    bag.refresh();
  }

  return {
    id: 'bag-lab',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'calm',

    enter() { bag.enter?.(); },
    exit() { bag.exit?.(); },
    update(dt) { bag.update?.(dt); },
    pointer(e){return bag.pointer?.(e)??true;},

    key(e) {
      const k = String(e.key || '').toLowerCase();
      if (k === 'c') { changeCase(e.shiftKey ? -1 : 1); return true; }
      if (k === 'n') { compact = !compact; return true; }
      if (k === 'g' || k === 'a') { showDebug = !showDebug; return true; }
      if (k === 'r') { bag.refresh(); return true; }
      return bag.key?.(e) ?? true;
    },

    render() {
      bag.render?.();
      if (!showDebug || !lastDebug) return;
      const { cols } = uiSize();
      const lines = [
        `BAG LAB  CASE ${fixture.id.toUpperCase()}`,
        `LAYOUT ${(lastDebug.layout?.mode||'SHEET').toUpperCase()}  SECTION ${lastDebug.nav.sectionId.toUpperCase()}`,
        `SELECTED ${(lastDebug.selected?.id || 'NONE').toUpperCase()}`,
        `MODE ${(lastDebug.route?.type||lastDebug.nav.mode||'BROWSE').toUpperCase()}  C NEXT  N COMPACT  G DEBUG`,
      ];
      lines.forEach((line, i) => uiText(Math.max(1, cols - line.length - 1), 1 + i, line, 'ui-danger', .72));
    },
  };
}
