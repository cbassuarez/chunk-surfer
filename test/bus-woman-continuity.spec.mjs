import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseCharacterAsset, sampleCharacterPose } from '../src/render/character-asset.js';
import { BUS_WOMAN_RIG, BUS_WOMAN_CONTACTS } from '../src/data/bus-woman-rig.js';
import { CELL } from '../src/data/floorplan/legend.js';
import { outskirtsArrivalLayout, outskirtsPassLayout } from '../src/data/source-outskirts-arrival.js';
import { outskirtsCollisionBoxes, outskirtsPointBlocked } from '../src/game/outskirts-geometry.js';
import { buildPreTapeGodPreset } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { OUTSKIRTS_BUS_PASSAGE } from '../src/data/outskirts-bus-passage.js';

const layout = outskirtsArrivalLayout();
const women = layout.filter((piece) => /^bus-woman/.test(piece.key));
const fixture = () => {
  const built = buildPreTapeGodPreset(0, { seed: 4417, marbleEyes: 'returned' });
  const runtime = createSourceSpaceRuntime({ initialState: built.state });
  runtime.setPlayerPosition(built.position);
  return runtime;
};
const stand = (runtime, x, z) => {
  const position = { x: x / CELL - .5, y: z / CELL - .5 };
  runtime.setPlayerPosition(position);
  return position;
};
const instances = (runtime, position, viewYaw = 0) => runtime.propInstances(position.x, position.y, { viewYaw });
const bytes = readFileSync(new URL('../public/assets/bus-woman-character.glb', import.meta.url));
const asset = parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const alteredBytes = readFileSync(new URL('../public/assets/outskirts-bus-woman-wrong-origin.glb', import.meta.url));
const alteredAsset = parseCharacterAsset(alteredBytes.buffer.slice(alteredBytes.byteOffset, alteredBytes.byteOffset + alteredBytes.byteLength));
const point = (matrix, p) => [0,1,2].map(axis=>matrix[12+axis]+p.reduce((n,v,k)=>n+matrix[k*4+axis]*v,0));
const ticketFollows = (frame, id) => {
  const parent = frame.find(instance=>instance.id===id), ticket = frame.find(instance=>instance.id===`${id}:return-half`);
  assert.ok(parent && ticket, `${id} lost its return half`);
  assert.equal(ticket.mesh,'bus_woman_ticket');
  assert.deepEqual([...ticket.matrix],[...parent.matrix],'accessory left its authoritative body transform');
  assert.deepEqual(ticket.character,parent.character,'paper and hand use different saved animation samples');
  const bodyAsset=parent.mesh.includes('_wrong_origin_')?alteredAsset:asset;
  const bodyEntry=bodyAsset.entries.find(e=>e.name===parent.mesh),ticketEntry=asset.entries.find(e=>e.name===ticket.mesh);
  const bodyPose=sampleCharacterPose(bodyAsset,bodyEntry,parent.character),paperPose=sampleCharacterPose(asset,ticketEntry,ticket.character);
  const finger=bodyEntry.skin.joints.findIndex(i=>bodyAsset.nodes[i].name==='bus_woman_index_tip_R');
  const fingerRest=BUS_WOMAN_RIG.find(b=>b.name==='index_tip_R');
  const fingertip=point(bodyPose.bones.subarray(finger*16,finger*16+16),fingerRest.tail);
  const paperGrip=point(paperPose.bones.subarray(0,16),BUS_WOMAN_CONTACTS.ticketGrip);
  assert.ok(Math.hypot(...fingertip.map((v,i)=>v-paperGrip[i]))<.004,`${id}: exported ticket loses its actual finger pinch`);
  return parent;
};

test('all thirteen scheduled recurrences and authored duplicate variants retain their canonical source aliases', () => {
  assert.equal(women.length, 13);
  assert.deepEqual([...new Set(women.map((piece) => piece.mesh))], ['outskirts_bus_woman']);
  for (const kind of ['crowd', 'stutter', 'mirrored', 'turned']) {
    const variant = outskirtsPassLayout(5, { break: kind }).filter((piece) => /^bus-woman/.test(piece.id));
    assert.ok(variant.length, `${kind} lost the woman`);
    assert.ok(variant.every((piece) => piece.mesh === 'outskirts_bus_woman'));
  }
});

test('the aboard recurrence stands on the bus floor in the aisle, clear of all seat volumes', () => {
  const woman = women.find((piece) => piece.key === 'bus-woman-aboard');
  const bus = layout.find((piece) => piece.stretch === woman.stretch && piece.key === 'bus');
  const dx = woman.across - bus.across, dz = -(woman.along - bus.along);
  const x = dx * Math.cos(bus.yaw) - dz * Math.sin(bus.yaw);
  const z = dx * Math.sin(bus.yaw) + dz * Math.cos(bus.yaw);
  assert.equal(woman.attachedTo, 'bus');
  assert.equal(woman.y - bus.y, .50);
  assert.equal(outskirtsPointBlocked(outskirtsCollisionBoxes(bus), x, z, .25), false, 'her legs are inside a seat');
});

test('every recurrence carries returned paper at its rendered right hand, including altered bodies and aboard', () => {
  const runtime = fixture();
  runtime.setOutskirtsWorldState({ ticketReturned: true });
  for (const woman of women) {
    const p = runtime.outskirtsPiece(woman.id);
    const position = stand(runtime, p.x - 1, p.z + 1);
    ticketFollows(instances(runtime, position), woman.id);
  }
  runtime.setOutskirtsWorldState({ ticketReturned: false });
  const p = runtime.outskirtsPiece('r0-bus-woman');
  const position = stand(runtime, p.x - 1, p.z + 1);
  assert.ok(!instances(runtime, position).some((item) => /^r\d+-bus-woman.*:return-half$/.test(item.id)), 'return paper appeared before it was given');
});

test('an unseen watcher turns her front toward the remembered player and carries the ticket with her', () => {
  const runtime = fixture();
  runtime.setOutskirtsWorldState({ ticketReturned: true });
  const p = runtime.outskirtsPiece('r5-bus-woman');
  const eye = { x: p.x + 1.2, z: p.z + .7 };
  const position = stand(runtime, eye.x, eye.z);
  assert.equal(runtime.geometry.canStep(position.x, position.y, position.x, position.y).ok, true,
    'the visitor stands on the open east side of the canonical shelter');
  const toward = Math.atan2(p.x - eye.x, -(p.z - eye.z));
  const first = ticketFollows(instances(runtime, position, toward), p.id);
  const turned = ticketFollows(instances(runtime, position, toward + Math.PI), p.id);
  assert.notDeepEqual([...turned.matrix], [...first.matrix], 'the watcher did not turn');
  const direction = [eye.x - p.x, eye.z - p.z], distance = Math.hypot(...direction);
  const facingDot = (-turned.matrix[8] * direction[0] - turned.matrix[10] * direction[1]) / distance;
  assert.ok(facingDot > .999, 'her back faces the player');
});

test('the interior bus encounter follows with its rig while the rear-bay root and useful ticket stay planted', () => {
  const runtime=fixture();runtime.setOutskirtsWorldState({ticketReturned:true});
  const p=runtime.outskirtsPiece('r7-bus-woman'),bus=runtime.outskirtsPiece('r7-bus');
  const at=(x,z)=>({x:bus.x+x*Math.cos(bus.yaw)+z*Math.sin(bus.yaw),z:bus.z-x*Math.sin(bus.yaw)+z*Math.cos(bus.yaw)});
  const inside=at(.5,2.8);
  let position=stand(runtime,inside.x,inside.z),viewYaw=Math.atan2(p.x-inside.x,-(p.z-inside.z));
  assert.ok(runtime.outskirtsStreetFrame({viewYaw}).encounter.stage>=3);
  const first=ticketFollows(instances(runtime,position,viewYaw),p.id);
  assert.equal(first.character.clip,'bus_woman_ticket_wait');
  assert.ok(Math.abs(first.matrix[8]-Math.sin(p.yaw))<.0001,'acknowledgement rotates the planted whole body');
  assert.ok(Math.abs(first.matrix[12]-p.x)<.0001&&Math.abs(first.matrix[14]-p.z)<.0001);
  const outside=at(...OUTSKIRTS_BUS_PASSAGE.exit.outside);
  position=stand(runtime,outside.x,outside.z);viewYaw=Math.atan2(p.x-outside.x,-(p.z-outside.z));
  assert.equal(runtime.outskirtsStreetFrame({viewYaw}).encounter.stage,4);
  assert.equal(runtime.outskirtsCharacterFrame().woman.stepAt,null,'leaving the rear door starts the obsolete roadward root step');
  for(let i=0;i<4;i++){runtime.tickOutskirtsCharacters(.25,{viewYaw});runtime.outskirtsStreetFrame({viewYaw});}
  const end=ticketFollows(instances(runtime,position,viewYaw),p.id);
  assert.equal(end.character.clip,'bus_woman_ticket_wait');
  assert.ok(Math.abs(end.character.joints.bus_woman_head.rotation[1])>.4,'the quiet ticket hold lost its sustained following head turn');
  assert.ok(Math.abs(end.matrix[12]-p.x)<.0001&&Math.abs(end.matrix[14]-p.z)<.0001,'the planted rear figure moved into the passage');
});

test('the crowd inspection uses its physical woman anchor for the ticket action', () => {
  // Run the production handler with an authored crowd pass. Crowd is a
  // supported break variant, though absent from today's deterministic route.
  const source = readFileSync(new URL('../src/game/source-space-runtime.js', import.meta.url), 'utf8');
  const begin = source.indexOf('  function outskirtsPerformAction(');
  const end = source.indexOf('\n  function outskirtsStreetFrame(', begin);
  const called = [];
  const sandbox = {
    inOutskirtsView: () => true,
    outskirtsPassAt: () => 5,
    outskirtPieces: () => [{ stretch: 5, key: 'bus-woman-crowd-1', inspect: 'woman', x: 5.2, z: -12.4 }],
    streetAnchor: (piece) => piece,
    outskirtsEye: () => ({ x: 5.0, z: -12.2 }),
    outskirtsSightClear: () => true,
    streetExperience: { action: (...args) => { called.push(args); return true; }, womanState:()=>{} },
    state:{},setState:()=>{},
    streetActionAt: new Map(), edgeDoorClock: () => 12,
  };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(begin, end), sandbox);
  assert.equal(sandbox.outskirtsPerformAction({ action: 'ticket', pass: 5 }).handled, true);
  assert.equal(called[0][0], 'r5:ticket');
  assert.equal(called[0][2].key, 'bus-woman-crowd-1');
});

test('inspection copy remains spatially true aboard and at the shelter without changing her identity', () => {
  const story = JSON.parse(readFileSync(new URL('../content/narrative/source-space.outskirts.story.json', import.meta.url), 'utf8'));
  const nodes = story.nodes;
  assert.doesNotMatch(JSON.stringify([nodes.woman, nodes['woman-after']]), /at the shelter/);
  assert.match(nodes.woman.lines[0].text, /coat buttoned wrong/);
  assert.match(nodes['woman-given'].lines[0].text, /right pocket/);
  assert.match(story.notes, /The woman is nobody/);
});
