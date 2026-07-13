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

  const bag = makeBagScene({
    getEquipment: () => fixture.equipment,
    getJob: () => fixture.job,
    getMap: () => mapLabModel({ id: fixture.id, policy:'directional', player:{floorId:'b1',roomId:'main_b3',position:{x:7,y:11}}, target:(fixture.job.rooms||[]).find((room)=>room.marked)?.roomId||null, done:fixture.job.done||0 }),
    getHint: () => `BAG LAB · ${fixture.id}`,
    forceLayout: () => compact ? 'compact' : null,
    readDocument: () => {},
    markRoom: (roomId) => {
      for (const room of fixture.job.rooms || []) room.marked = room.roomId === roomId ? !room.marked : false;
      fixture.job = { ...fixture.job, rooms: [...fixture.job.rooms] };
      bag.refresh();
      return true;
    },
    debug: (state) => { lastDebug = state; },
  });

  function changeCase(delta) {
    caseIndex = (caseIndex + delta + BAG_LAB_CASES.length) % BAG_LAB_CASES.length;
    fixture = cloneFixture(BAG_LAB_CASES[caseIndex]);
    bag.refresh();
  }

  return {
    id: 'bag-lab',
    blocksInput: true,
    blocksWorld: false,
    lensPreset: 'calm',

    enter() { bag.enter?.(); },
    exit() { bag.exit?.(); },
    update(dt) { bag.update?.(dt); },

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
        `LAYOUT ${lastDebug.layout.mode.toUpperCase()}  SECTION ${lastDebug.nav.sectionId.toUpperCase()}`,
        `SELECTED ${(lastDebug.selected?.id || 'NONE').toUpperCase()}`,
        `MODE ${lastDebug.nav.mode.toUpperCase()}  C NEXT  N COMPACT  G DEBUG`,
      ];
      lines.forEach((line, i) => uiText(Math.max(1, cols - line.length - 1), 1 + i, line, 'ui-danger', .72));
    },
  };
}
