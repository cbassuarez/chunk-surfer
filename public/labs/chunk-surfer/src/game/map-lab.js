// Query-driven MAP laboratory: ?maplab=1

import { makeBagScene } from './bag.js';
import { MAP_LAB_CASES, mapLabJob, mapLabModel } from './map-fixtures.js';
import { uiText, uiSize } from '../render/ui.js';

export function makeMapLabScene() {
  let index = 0;
  let snapshot = null;
  let bag = null;
  const current = () => MAP_LAB_CASES[index];

  function rebuild() {
    bag?.refresh?.();
    bag?.selectSection?.('map');
  }

  bag = makeBagScene({
    getEquipment: () => ['light', 'recorder + headphones', 'location indicator', 'standard keyring'],
    getJob: () => mapLabJob(current()),
    getMap: () => mapLabModel(current()),
    getHint: () => `MAP LAB · ${current().id}`,
    focus: { sectionId: 'map', roomId: 'main_b3' },
    markRoom: () => true,
    readDocument: () => {},
    getMonitorSource: () => 'MAP LAB',
    debug: (value) => { snapshot = value; },
  });

  return {
    id: 'map-lab', blocksInput: true, blocksWorld: true, lensPreset: 'calm',
    enter() { bag.enter?.(); bag.selectSection?.('map'); },
    exit() { bag.exit?.(); },
    update(dt) { bag.update?.(dt); },
    key(e) {
      const k = String(e.key || '').toLowerCase();
      if (k === 'c') {
        index = (index + (e.shiftKey ? -1 : 1) + MAP_LAB_CASES.length) % MAP_LAB_CASES.length;
        rebuild(); return true;
      }
      if (k === 'r') { rebuild(); return true; }
      return bag.key?.(e) ?? true;
    },
    render() {
      bag.render?.();
      const { rows } = uiSize();
      const state = snapshot?.mapNav || snapshot?.nav?.map;
      uiText(2, Math.max(1, rows - 2), `CASE ${current().id.toUpperCase()} · POLICY ${current().policy.toUpperCase()} · FLOOR ${state?.floorId || '--'} · [C] CASE`, 'ui-secondary', .72);
    },
    debugState() { return { case: current(), snapshot }; },
  };
}
