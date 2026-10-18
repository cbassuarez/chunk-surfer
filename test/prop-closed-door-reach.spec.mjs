import test from 'node:test';
import assert from 'node:assert/strict';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { F } from '../src/data/floorplan/legend.js';

const remote = { id: 'locked-room-item', mesh: 'loose_note', x: 4.25, y: 2.25,
  interaction: 'action', action: 'pickup', inspect: { first: 'An item behind the glazed door.' } };
function setup({ door = true, placements = [remote] } = {}) {
  FP.compile([{ id: 'glazed-door-reach-fixture', origin: { x: 0, y: 0 }, base: 0,
    rows: ['#######', '#FF#FF#', door ? '#FF+FF#' : '#FF#FF#', '#FF#FF#', '#######'] }], {
    width: 7, height: 5,
    doors: door ? [{ id: 'locked-glazed-fixture', archetype: 'academic-wired-glass', at: { x: 3, y: 2 },
      key: 'fixture-key', initialState: 'closed', hinge: 'left', widthAxis: 'y', swing: 'room-in' }] : [],
  });
  PROPS.propsInit(FP, placements);
}

test('a visible item across a closed glazed door cannot be selected through its air cells', () => {
  setup();
  const door = FP.doorState().find((d) => d.id === 'locked-glazed-fixture');
  assert.equal(door.open, false); assert.equal(door.keyId, 'fixture-key');
  assert.equal(FP.isSolid(door.cells[0].x, door.cells[0].y), false, 'rendering throat remains air');
  assert.equal(FP.hasFlag(door.cells[0].x, door.cells[0].y, F.CLOSED), true, 'access is represented by CLOSED');
  assert.equal(PROPS.pickProp(4, 4, 1, 3), null, 'glass visibility never grants item reach');
  assert.equal(FP.canStep(5, 4, 6, 4, { keys: new Set() }).why, 'locked', 'door still refuses traversal');
});

test('opening that same door restores normal item selection and closing it blocks reach again', () => {
  setup();
  FP.setDoorOpen('locked-glazed-fixture', true);
  assert.equal(PROPS.pickProp(4, 4, 1, 3)?.id, remote.id);
  assert.equal(FP.canStep(5, 4, 6, 4, { keys: new Set() }).ok, true);
  FP.setDoorOpen('locked-glazed-fixture', false);
  assert.equal(PROPS.pickProp(4, 4, 1, 3), null);
});

test('closed doors do not suppress reachable items on the player side; masonry remains an obstruction', () => {
  setup({ placements: [{ ...remote, id: 'near-side-item', x: 2.6 }] });
  assert.equal(PROPS.pickProp(4, 4, 1, 3)?.id, 'near-side-item');
  setup({ door: false });
  assert.equal(PROPS.pickProp(4, 4, 1, 3), null);
});

test('a clear window interval blocks item reach as well as body traversal',()=>{
  FP.compile([{id:'window-room',origin:{x:0,y:0},base:0,
    rows:['#######','#FF#FF#','#FF#FF#','#FF#FF#','#######']},
    {id:'clear-fixed-pane',origin:{x:3,y:2},base:0,replace:true,collisionOnly:true,rows:['F']}],{width:7,height:5});
  PROPS.propsInit(FP,[remote]);
  assert.equal(FP.isSolid(6,4),false,'the real view aperture remains rendered air');
  assert.equal(FP.isCollisionOnly(6,4),true);
  assert.equal(FP.hasFlag(6,4,F.CLOSED),false,'fixed glass is not a closed door');
  assert.equal(FP.canStep(5,4,6,4).why,'wall');
  assert.equal(PROPS.pickProp(4,4,1,3),null,'a view must not grant reach through the glass');
});
