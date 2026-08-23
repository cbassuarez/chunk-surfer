import test from 'node:test';
import assert from 'node:assert/strict';
import { hushStatus, minimapTargetReadout, minimapTelemetryCrumbs } from '../src/render/minimap.js';
import { buildMinimapCommands } from '../src/render/map-commands.js';

test('minimap confirms what HUSH knows about the player without drawing a noise layer', () => {
  const active = hushStatus({
    player: { floorId: 'g' },
    floors: [{ id: 'g', label: 'GROUND' }],
    hush: { active: true, floorId: 'g' },
    contacts: [],
  }, 4000);
  assert.deepEqual(active, { label: 'ACTIVE', cls: 'ui-secondary', detail: 'NO FIX', floorDelta: 0 });

  const heard = hushStatus({
    player: { floorId: 'g' },
    floors: [{ id: 'g', label: 'GROUND' }],
    hush: { active: true, floorId: 'g', perception: { mode: 'clue', label: 'HEARD', detail: 'LAST POSITION', cls: 'ui-amber' } },
    contacts: [],
  }, 4000);
  assert.deepEqual(heard, { label: 'HEARD', cls: 'ui-amber', detail: 'LAST POSITION', floorDelta: 0 });

  const locked = hushStatus({
    player: { floorId: 'g' },
    floors: [{ id: 'g', label: 'GROUND' }],
    hush: { active: true, floorId: 'g', perception: { mode: 'locked', label: 'LOCKED', detail: 'YOU', cls: 'ui-danger' } },
    contacts: [],
  }, 4000);
  assert.equal(locked.detail, 'YOU');

  const tracing = hushStatus({
    player: { floorId: 'g' },
    floors: [{ id: 'g', label: 'GROUND' }],
    hush: { active: false },
    contacts: [{ state: 'acquiring', observation: { observedAt: 1000, floorId: 'g', confidence: 0.64 } }],
  }, 4000);
  assert.deepEqual(tracing, { label: 'TRACING', cls: 'ui-amber', detail: '64%', floorDelta: 0 });
});

test('stale minimap telemetry is capped, transformed, and age-faded', () => {
  const contacts = Array.from({ length: 9 }, (_, index) => ({
    id: `c${index}`,
    state: 'decaying',
    observation: {
      observedAt: 1000 + index * 500,
      floorId: 'g',
      confidence: 0.5,
      position: { x: index, y: index + 1 },
    },
  }));
  const model = { player: { floorId: 'g' }, contacts };
  const commands = [{ kind: 'sight', transform: { point: (point) => ({ x: point.x + 10, y: point.y + 20 }) } }];
  const crumbs = minimapTelemetryCrumbs(model, commands, 6000);
  assert.ok(crumbs.length <= 7);
  assert.ok(crumbs.length > 0);
  assert.ok(crumbs.every((crumb) => crumb.alpha > 0 && crumb.alpha < 0.18));
  assert.ok(crumbs.every((crumb) => crumb.point.x >= 10 && crumb.point.y >= 21));
  assert.ok(!crumbs.some((crumb) => crumb.point.x === 18), 'newest contact stays the live observation, not a crumb');
});

test('minimap reveals the HUSH body only during direct visual confirmation', () => {
  const commands = buildMinimapCommands({
    model: {
      player: { resolved: true, floorId: 'g', position: { x: 0, y: 0 }, heading: 0 },
      floors: [{ id: 'g', open: [] }],
      policy: { minimapMode: 'compass' },
      contacts: [],
      hush: { active: true, floorId: 'g', position: { x: 2, y: 3 } },
    },
    viewport: { x: 0, y: 0, w: 20, h: 10 },
  });
  assert.ok(!commands.some((command) => String(command.kind).startsWith('hush')));

  const visible = buildMinimapCommands({
    model: {
      player: { resolved: true, floorId: 'g', position: { x: 0, y: 0 }, heading: 0 },
      floors: [{ id: 'g', open: [] }],
      policy: { minimapMode: 'compass' },
      contacts: [],
      hush: { active: true, visible: true, floorId: 'g', position: { x: 2, y: 3 } },
    },
    viewport: { x: 0, y: 0, w: 20, h: 10 },
  });
  assert.ok(visible.some((command) => command.kind === 'hush-visible'));

  const edge = buildMinimapCommands({
    model: {
      player: { resolved: true, floorId: 'g', position: { x: 0, y: 0 }, heading: 0 },
      floors: [{ id: 'g', open: [] }],
      policy: { minimapMode: 'compass' },
      contacts: [],
      hush: { active: true, visible: true, floorId: 'g', position: { x: 200, y: 3 } },
    },
    viewport: { x: 0, y: 0, w: 20, h: 10 },
  });
  assert.ok(edge.some((command) => command.kind === 'hush-visible-edge'), 'the same confirmed marker clamps to the edge');
});

test('minimap target rail names the actual target and reports bearing and range', () => {
  const model={
    player:{floorId:'g',position:{x:4,y:8}},
    waypoint:{id:'story:key-cabinet',label:'SELECT THE CHAPEL KEY',floorId:'g',position:{x:7,y:4}},
    route:{floorDelta:0},spaces:[],
  };
  assert.deepEqual(minimapTargetReadout(model),{
    label:'SELECT THE CHAPEL KEY',bearing:'NE',distanceM:5,floorDelta:0,sameFloor:true,
  });
  const crossFloor=minimapTargetReadout({...model,waypoint:{...model.waypoint,floorId:'u1',position:null},route:{floorDelta:1}});
  assert.deepEqual(crossFloor,{
    label:'SELECT THE CHAPEL KEY',bearing:'',distanceM:null,floorDelta:1,sameFloor:false,
  });
});

test('minimap carries local route, thresholds, connectors and sanitized HUSH awareness', () => {
  const commands=buildMinimapCommands({
    model:{
      player:{resolved:true,floorId:'g',position:{x:0,y:0},heading:0},
      floors:[{id:'g',open:new Set(['0,0','0,-1'])}],
      policy:{minimapMode:'topology',showMapTopology:true,showRoute:true},
      route:{status:'ok',nextConnectorId:'stairs',points:[{x:0,y:0},{x:0,y:-1}]},
      doors:[{id:'door',floorId:'g',position:{x:0,y:-1},state:'closed'}],
      connectors:[{id:'stairs',a:{floorId:'g',position:{x:1,y:0}},b:{floorId:'u1',position:{x:1,y:0}}}],
      contacts:[],
      hush:{active:true,visible:false,floorId:'g',position:{x:9,y:9},perception:{mode:'clue',label:'HEARD',detail:'YOU'}},
    },
    viewport:{x:0,y:0,w:24,h:12},
  });
  assert.ok(commands.some((command)=>command.kind==='route-local'));
  assert.ok(commands.some((command)=>command.kind==='door-local'));
  assert.ok(commands.some((command)=>command.kind==='connector-local'&&command.selected));
  assert.ok(commands.some((command)=>command.kind==='hush-awareness'));
  assert.ok(!commands.some((command)=>command.kind==='hush-visible'), 'awareness never reveals the unseen body');
});
