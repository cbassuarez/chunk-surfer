import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { mapLayoutFromBag, mapConsoleControls } from '../src/render/map-layout.js';
import { mapActionRail } from '../src/game/map-actions.js';
import { mapFloor } from '../src/game/map-model.js';
import { selectedMapSpace } from '../src/game/map-navigation.js';
import { setActiveInputDevice } from '../src/game/bindings.js';
import { roomHistoryText } from '../src/data/room-history.js';
import { BUILDING_MAP } from '../src/data/building-map.js';
import { fitText } from '../src/render/fit-text.js';
import { uiWrap } from '../src/render/ui.js';

// A bag content region, at the sizes the field case actually gets.
const bag = (w, h, mode = 'wide') => ({
  mode,
  list: { x: 4, y: 6, w: Math.floor(w * 0.6), h },
  detail: { x: 4 + Math.floor(w * 0.6) + 1, y: 6, w: w - Math.floor(w * 0.6) - 1, h },
});

const SIZES = [[151, 40], [120, 34], [96, 28], [88, 22], [80, 20], [78, 14],
  [72, 20], [64, 17], [64, 14], [56, 12], [48, 10], [40, 8]];
const EPS = 1e-8;
const inside = (rect, bounds, message) => {
  assert.ok(rect && [rect.x, rect.y, rect.w, rect.h].every(Number.isFinite), message);
  assert.ok(rect.w > 0 && rect.h > 0, message);
  assert.ok(rect.x >= bounds.x - EPS && rect.y >= bounds.y - EPS
    && rect.x + rect.w <= bounds.x + bounds.w + EPS
    && rect.y + rect.h <= bounds.y + bounds.h + EPS, `${message}: ${JSON.stringify({rect,bounds})}`);
};
const separate = (a, b, message) => assert.ok(a.x + a.w <= b.x + EPS || b.x + b.w <= a.x + EPS
  || a.y + a.h <= b.y + EPS || b.y + b.h <= a.y + EPS, `${message}: ${JSON.stringify({a,b})}`);
const model = { floors: ['b1', 'g', 'u1', 'academic', 'tower'].map((id, i) => ({ id, shortLabel: ['B1', 'G', 'U1', '3F', 'TWR'][i] })),
  spaces: [{ id: 'space:b3', roomId: 'main_b3', floorId: 'b1', waypointable: true, objective: { notes: [{}] } }], playerWaypoint: null };
const nav = { floorId: 'b1', viewMode: 'stack', selectedByFloor: { b1: 'space:b3' } };

test('the architectural window and physical console keep every control and readout inside distinct regions', () => {
  for (const [w, h] of SIZES) {
    const layout = mapLayoutFromBag(bag(w, h));
    const label = `${w}x${h}`, controls = mapConsoleControls(layout, model, nav);
    assert.deepEqual(layout.region, { x: 4, y: 6, w, h });
    for (const key of ['mapWindow', 'mapViewport', 'console', 'detail']) inside(layout[key], layout.region, `${label} ${key}`);
    inside(layout.mapViewport, layout.mapWindow, `${label} plotting aperture`);
    inside(layout.detail, layout.console, `${label} selected-room readout`);
    separate(layout.mapWindow, layout.console, `${label} window and control pane`);
    for (const control of controls) {
      inside(control, layout.console, `${label} ${control.id}`);
      separate(control, layout.detail, `${label} ${control.id} cannot cover the selected-room readout`);
      separate(control, layout.mapViewport, `${label} ${control.id} cannot cover architecture`);
    }
    for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++)
      separate(controls[i], controls[j], `${label} ${controls[i].id}/${controls[j].id}`);
  }
});

test('the architecture remains dominant and short displays use exactly two compact control rows', () => {
  for (const [w, h] of SIZES) {
    const layout = mapLayoutFromBag(bag(w, h));
    if (layout.mode === 'wide') {
      assert.ok(layout.mapWindow.w >= w * .70 - EPS, `${w}x${h}: architecture owns at least 70% of the width`);
      assert.equal(layout.mapWindow.h, h, 'wide mode preserves the full height for architecture');
      assert.ok(layout.console.x > layout.mapWindow.x + layout.mapWindow.w, 'a real mechanical gap separates panes');
    } else {
      assert.equal(layout.mapWindow.w, w, 'compact hardware moves below the full-width drawing');
      assert.ok(layout.console.y > layout.mapWindow.y + layout.mapWindow.h - EPS);
    }
    if (layout.dense) {
      const controls = mapConsoleControls(layout, model, nav), rows = new Map();
      for (const control of controls) {
        const key = control.y.toFixed(6); rows.set(key, (rows.get(key) || 0) + 1);
      }
      assert.equal(rows.size, 2, `${w}x${h}: all sixteen controls fit in two rows`);
      assert.deepEqual([...rows.values()], [8, 8]);
      assert.ok(layout.detail.y >= Math.max(...controls.map(control => control.y + control.h)) - EPS);
    }
  }
});

test('the console exposes five floor selectors and explicit set/clear actions with truthful enabled states', () => {
  const layout = mapLayoutFromBag(bag(120, 34));
  const controls = mapConsoleControls(layout, model, nav), get = action => controls.find(control => control.action === action);
  assert.equal(controls.length, 16); assert.equal(new Set(controls.map(control => control.id)).size, 16);
  assert.deepEqual(controls.filter(c => c.action === 'select-floor').map(c => c.payload.floorId), ['b1', 'g', 'u1', 'academic', 'tower']);
  assert.equal(get('set-target').id, 'bag:map:set-target'); assert.equal(get('set-target').enabled, true);
  assert.equal(get('clear-target').enabled, false); assert.equal(get('read-file').enabled, true);
  assert.equal(get('view-stack').lit, true); assert.equal(get('view-floor').lit, false);
  const marked = mapConsoleControls(layout, { ...model, playerWaypoint: { spaceId: 'space:b3' } }, nav);
  assert.equal(marked.find(c => c.action === 'set-target').enabled, false, 'SET cannot silently become CLEAR');
  assert.equal(marked.find(c => c.action === 'clear-target').enabled, true);
  const none = mapConsoleControls(layout, { ...model, spaces: [] }, nav);
  assert.equal(none.find(c => c.action === 'set-target').enabled, false);
  assert.equal(none.find(c => c.action === 'read-file').enabled, false);
});

test('the control rail is short enough that it cannot truncate', () => {
  // The physical console owns the actions. The short device-aware reminder
  // must still fit without obscuring them or becoming another instruction wall.
  const selected = { id: 'room:x', roomId: 'x', waypointable: true, objective: { notes: [{}] } };
  for (const floors of [1, 3, 5]) {
    const rail = mapActionRail(selected, { floorCount: floors });
    const rendered = rail.map(([key, label]) => `[${key}] ${label}`).join('  ');
    // 96 cells: comfortably inside the footer at the narrowest viewport the game
    // supports (960px wide, where the safe-size guard kicks in), and comfortably
    // under the ~125 the six-entry version came to.
    assert.ok(rendered.length <= 96, `${floors} floors: the rail is ${rendered.length} cells`);
    for (const [key, label] of rail) {
      assert.ok(label === label.trim() && label.length > 0, 'every entry is labelled');
      assert.ok(`${key} ${label}`.length <= 24, `"${key} ${label}" is short`);
    }
  }
});

test('short keyboard rails preserve F6, Enter and close in both room and control focus', () => {
  setActiveInputDevice('keyboard');
  for (const width of [40, 48, 64, 80, 96]) for (const consoleFocused of [false, true]) {
    const actions = mapActionRail(model.spaces[0], { width, floorCount: 5, consoleFocused });
    const rendered = actions.map(([key, label]) => `[${key}] ${label}`).join('   ');
    assert.ok(rendered.length <= width, `${width} cells: ${rendered}`);
    for (const key of ['F6', 'ENTER', 'B']) assert.ok(actions.some(action => action[0] === key),
      `${width} cells, ${consoleFocused ? 'console' : 'room'} focus must retain ${key}`);
    assert.deepEqual(actions.find(action => action[0] === 'ENTER'), ['ENTER', consoleFocused ? 'PRESS' : 'SET']);
  }
  assert.deepEqual(mapActionRail(null, { width: 40, offline: true }), [['B', 'CLOSE']],
    'an offline instrument only offers its working close action');
});

// Run the actual view against a recording drawing backend. Geometry, control
// generation, selection and prompts remain the production implementations.
function consoleHarness() {
  const commands = [], note = (kind, data = {}) => commands.push({ kind, ...data });
  const ctx = { fillRect() {}, strokeRect() {}, createLinearGradient: () => ({ addColorStop() {} }) };
  const bindings = {
    uiDraw: fn => fn({ ctx, cellW: 1, cellH: 1, dpr: 1 }),
    uiText: (x, y, text) => note('text', { x, y, text }), uiWrap,
    uiWithClip: (rect, fn) => { note('clip', { rect }); fn(); },
    drawInstrumentWell: (_, rect) => note('well', { rect }),
    drawInstrumentGlass: (_, rect) => note('glass', { rect }),
    drawLampButton: (x, y, w, h, state) => note('button', { x, y, w, h, state }),
    drawVfdText: (x, y, text) => note('text', { x, y, text }),
    drawPrintedText: (x, y, text) => note('print', { x, y, text }),
    drawHardwarePrint: (_, text) => note('annunciator', { text }),
    hardwareMotionReduced: () => true,
    drawArchitecturalMap: () => { note('architecture'); return { hits: [], projectedPoints: {}, geometryAvailable: true }; },
    mapLayoutFromBag, mapConsoleControls, selectedMapSpace, mapFloor, mapActionRail, fitText, BUILDING_MAP, roomHistoryText,
  };
  const source = readFileSync(new URL('../src/render/map-view.js', import.meta.url), 'utf8')
    .replace(/^import .+;\s*$/gm, '').replace(/export function /g, 'function ');
  const api = new Function(...Object.keys(bindings), `${source};return {mapConsoleStatus,drawMapView,drawMapOffline};`)(...Object.values(bindings));
  return { ...api, commands };
}

test('console lamps and route status distinguish live, restricted, missing and unresolved facts', () => {
  const { mapConsoleStatus } = consoleHarness();
  const live = { architecture: { levels: [{}] }, waypoint: { spaceId: 'space:b3' },
    route: { status: 'ok' }, policy: { showRouteStatus: true } };
  assert.deepEqual(mapConsoleStatus(live), { plan: true, target: true, route: 'NEXT LEG AVAILABLE', planLabel: 'PLAN LOADED' });
  for (const policy of [{ showMapTopology: false }, { showMap: false }]) {
    const restricted = mapConsoleStatus({ ...live, architecture: null, policy: { ...policy, showWaypoint: false } });
    assert.deepEqual(restricted, { plan: false, target: false, route: 'ROUTE ASSIST OFF', planLabel: 'PLAN RESTRICTED' },
      'a deliberately withheld plan is not misreported as a missing asset');
  }
  assert.equal(mapConsoleStatus({}).planLabel, 'PLAN UNAVAILABLE');
  assert.equal(mapConsoleStatus({ ...live, waypoint: null }).target, false);
  assert.equal(mapConsoleStatus({ ...live, route: { status: 'blocked' } }).route, 'NEXT LEG BLOCKED');
  assert.equal(mapConsoleStatus({ ...live, policy: { showRoute: true, showRouteStatus: true },
    route: { status: 'ok', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] } }).route, 'ROUTE HEIGHT UNRESOLVED',
    'an available 2D path is not an authoritative 3D route through multi-height floors');
  for (const route of [null, {}, { status: 'unknown' }])
    assert.equal(mapConsoleStatus({ ...live, route }).route, 'ROUTE UNRESOLVED');
});

test('offline hardware keeps dark disabled controls without invented progress, position or room facts', () => {
  for (const [w, h] of [[120, 34], [64, 17], [48, 10]]) {
    const harness = consoleHarness(), reason = 'The survey indicator has not been packed.';
    const result = harness.drawMapOffline({ bagLayout: { ...bag(w, h), actionRail: { w } }, reason });
    const labels = harness.commands.filter(c => c.kind === 'text').map(c => c.text).join('\n');
    assert.equal(result.hits.length, 0); assert.equal(result.geometryAvailable, false);
    assert.equal(result.status.plan, false); assert.equal(result.status.target, false);
    assert.equal(harness.commands.some(c => c.kind === 'architecture'), false);
    assert.match(labels, /SURVEY INDICATOR OFFLINE/); assert.match(labels, /NO SURVEY LINK/);
    assert.doesNotMatch(labels, /\d+\/\d+ TAKES|YOU|TAKE OUTSTANDING|TAKE RECORDED|NOT VISITED|NEXT LEG/);
    assert.deepEqual(result.actions, [['B', 'CLOSE']]);
    const buttons = harness.commands.filter(c => c.kind === 'button');
    assert.equal(buttons.length, 16, 'the instrument is physically present, not replaced by an unrelated text panel');
    assert.ok(buttons.every(c => c.state.enabled === false && c.state.lit === false && c.state.latched === false));
  }
});

test('map and readout paint behind separate glass while physical controls remain outside both covers', () => {
  const harness = consoleHarness(), live = { ...model, architecture: { levels: [{}] }, progress: { done: 1, total: 5 } };
  const result = harness.drawMapView({ model: live, nav, bagLayout: bag(120, 34) });
  const commands = harness.commands, indexes = kind => commands.flatMap((c, i) => c.kind === kind ? [i] : []);
  const wells = indexes('well'), glass = indexes('glass'), buttons = indexes('button'), architecture = indexes('architecture');
  assert.equal(wells.length, 2); assert.equal(glass.length, 2);
  assert.ok(wells[0] < architecture[0] && architecture[0] < glass[0]);
  assert.ok(glass[0] < wells[1] && wells[1] < indexes('clip')[0] && indexes('clip')[0] < glass[1]);
  assert.ok(buttons.every(index => index > glass[1]), 'moving key caps do not receive a screen cover');
  assert.ok(buttons.every(index => commands[index].state.latched === false));
  assert.deepEqual(commands.filter(c => c.kind === 'annunciator').map(c => c.text), ['PLAN', 'TARGET']);
  assert.equal(result.hits.length, 17, 'only the map aperture and sixteen physical controls are hit targets');
  assert.ok(!result.hits.some(hit => /annunciator|indication/i.test(hit.id)), 'passive status lamps are not fake buttons');
});
