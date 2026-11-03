import test from 'node:test';
import assert from 'node:assert/strict';
import {faultViewCoverage} from './helpers/earthfall-fault-coverage.mjs';
import { SOURCE_EARTHFALL as C, SOURCE_EARTHFALL_STRATA, sourceEarthfallCellLayout } from '../src/data/source-earthfall.js';
import { SOURCE_EARTHFALL_FAULTS as F, sourceEarthfallFaultLayout } from '../src/data/source-earthfall-faults.js';

const sub = (a, b) => a.map((n, axis) => n - b[axis]);
const dot = (a, b) => a.reduce((sum, n, axis) => sum + n * b[axis], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = a => Math.hypot(...a);
const normal = fault => {
  const [a, b, c] = fault.indices.slice(0, 3).map(index => fault.vertices[index]);
  const n = cross(sub(b, a), sub(c, a)), size = length(n);
  return n.map(value => value / size);
};
const area = fault => {
  let total = 0;
  for (let index = 0; index < fault.indices.length; index += 3) {
    const [a, b, c] = fault.indices.slice(index, index + 3).map(i => fault.vertices[i]);
    total += length(cross(sub(b, a), sub(c, a))) / 2;
  }
  return total;
};

test('Torn Address Space is one immutable deterministic world layout across independent loads', async () => {
  const faults = sourceEarthfallFaultLayout();
  const reloaded = await import('../src/data/source-earthfall-faults.js?independent-layout');
  assert.deepEqual(reloaded.sourceEarthfallFaultLayout(), faults);
  assert.equal(sourceEarthfallFaultLayout.length, 0);
  for (const input of [{ camera: [0, 0, 0], elapsed: 0 }, { camera: [80, -100, 12], elapsed: 1234, proximity: 0 }, { reducedMotion: true }]) {
    assert.equal(sourceEarthfallFaultLayout(input), faults);
  }
  assert.equal(faults.length, F.count);
  assert.ok(Object.isFrozen(faults) && Object.isFrozen(F));
  assert.equal(new Set(faults.map(fault => fault.id)).size, faults.length);
  for (const fault of faults) {
    assert.ok(Object.isFrozen(fault) && Object.isFrozen(fault.vertices) && Object.isFrozen(fault.indices));
    assert.ok(fault.vertices.every(Object.isFrozen));
    assert.ok(Object.isFrozen(fault.bounds.min) && Object.isFrozen(fault.bounds.max));
    assert.equal(fault.palette, F.palette[fault.paletteIndex]);
    assert.equal('collision' in fault || 'thickness' in fault || 'pose' in fault, false);
  }
});

test('every fault is a finite zero-thickness torn polygon with valid nonoverlapping coplanar triangles', () => {
  for (const fault of sourceEarthfallFaultLayout()) {
    assert.ok(fault.vertices.length >= 3 && fault.vertices.length <= 6, fault.id);
    assert.ok(fault.vertices.flat().every(Number.isFinite), fault.id);
    assert.equal(fault.indices.length, (fault.vertices.length - 2) * 3, fault.id);
    assert.ok(fault.indices.every(index => Number.isInteger(index) && index >= 0 && index < fault.vertices.length), fault.id);
    const n = normal(fault), anchor = fault.vertices[0];
    assert.ok(n.every(Number.isFinite), fault.id);
    for (const point of fault.vertices) assert.ok(Math.abs(dot(n, sub(point, anchor))) < 1e-8, fault.id);
    const signed = fault.vertices.reduce((sum, point, i) => sum + dot(n, cross(point, fault.vertices[(i + 1) % fault.vertices.length])), 0) / 2;
    assert.ok(area(fault) > .005, fault.id);
    assert.ok(Math.abs(area(fault) - Math.abs(signed)) < 1e-7, `${fault.id}: triangles must leave the torn shoulder open`);
    for (let axis = 0; axis < 3; axis++) {
      assert.equal(fault.bounds.min[axis], Math.min(...fault.vertices.map(point => point[axis])));
      assert.equal(fault.bounds.max[axis], Math.max(...fault.vertices.map(point => point[axis])));
    }
  }
});

test('the forecourt tears spread from the actual failure across its fixed original cap without following cells', () => {
  const faults = sourceEarthfallFaultLayout().filter(fault => fault.scope === 'cap');
  const cellIds = new Set(sourceEarthfallCellLayout().map(cell => cell.id));
  assert.equal(faults.length, F.capCount);
  assert.ok(faults.every(fault => cellIds.has(fault.originCellId)));
  assert.ok(faults.every(fault => Object.isFrozen(fault.anchor) && fault.anchor[1] === C.upperFloor));
  assert.ok(faults.some(fault => Math.hypot(fault.anchor[0] - F.failureOrigin.x, fault.anchor[2] - F.failureOrigin.z) < .1));
  assert.ok(Math.min(...faults.map(fault => fault.bounds.min[0])) < -8.8);
  assert.ok(Math.max(...faults.map(fault => fault.bounds.max[0])) > 8.8);
  assert.ok(Math.min(...faults.map(fault => fault.bounds.min[2])) < -47.8);
  assert.ok(Math.max(...faults.map(fault => fault.bounds.max[2])) > 3.8);
  assert.ok(faults.some(fault => fault.bounds.min[0] < -3 && fault.bounds.max[0] > -3 && fault.bounds.min[2] < -7.5 && fault.bounds.max[2] > -7.5));
  for (const fault of faults) {
    assert.ok(fault.bounds.min[0] >= C.earth.minX && fault.bounds.max[0] <= C.earth.maxX);
    assert.ok(fault.bounds.min[2] >= C.earth.minZ && fault.bounds.max[2] <= C.earth.maxZ);
    assert.ok(Math.abs(fault.bounds.min[1] - (C.upperFloor + .024)) < 1e-8);
    assert.ok(fault.bounds.max[0]<=-1.2||fault.bounds.min[0]>=1.2||fault.bounds.max[2]<=-5+1e-8,
      `${fault.id}: the authored doorway approach cannot start inside a sheet`);
    const cell = sourceEarthfallCellLayout().find(cell => cell.id === fault.originCellId);
    const [x, , z] = fault.anchor;
    const sides = cell.points.map((a, i) => {
      const b = cell.points[(i + 1) % cell.points.length];
      return Math.sign((b[0] - a[0]) * (z - a[2]) - (b[2] - a[2]) * (x - a[0]));
    }).filter(Boolean);
    assert.ok(sides.every(side => side === sides[0]), `${fault.id}: its fixed anchor must originate on the referenced real cap cell`);
  }
});

test('the complete descent stays densely torn at every height and reaches all three printed strata', () => {
  const faults = sourceEarthfallFaultLayout().filter(fault => fault.stage === 'fall');
  assert.equal(faults.length, F.fallCount);
  assert.ok(Math.max(...faults.map(fault => fault.bounds.max[1])) > 99.5);
  assert.ok(Math.min(...faults.map(fault => fault.bounds.min[1])) < .5);
  for (let y = C.lowerFloor; y < C.upperFloor; y += 5) {
    const crossing = faults.filter(fault => fault.bounds.min[1] < y + 5 && fault.bounds.max[1] > y);
    assert.ok(crossing.length >= 24, `${y}..${y + 5}m has only ${crossing.length} surfaces`);
    assert.ok(crossing.some(fault => fault.bounds.max[0] < 0) && crossing.some(fault => fault.bounds.min[0] > 0));
  }
  for (const layer of SOURCE_EARTHFALL_STRATA) {
    const attached = faults.filter(fault => fault.stratumId === layer.id);
    assert.ok(attached.length >= 5, layer.id);
    assert.ok(attached.some(fault => fault.bounds.min[1] <= layer.y && fault.bounds.max[1] >= layer.y), layer.id);
  }
});

test('broad torn sheets fill falling views in every direction instead of leaving a sparse field of edge-on needles', () => {
  const layout=sourceEarthfallFaultLayout(),views=[];
  for(const y of [90,65,40,15])for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const pitch of [-.85,-.35]){
    const coverage=faultViewCoverage(layout,{eye:[0,y,-14],yaw,pitch});views.push(coverage);
    assert.ok(coverage>.40,`height ${y}, yaw ${yaw}, pitch ${pitch}: only ${(coverage*100).toFixed(1)}% of sampled rays meet a fault`);
  }
  assert.ok(views.reduce((sum,value)=>sum+value,0)/views.length>.70,'the full descent needs substantial overlapping material across the view');
  const walk=layout.filter(sheet=>sheet.scope==='cap');
  assert.ok(walk.filter(sheet=>sheet.bounds.max[1]>C.upperFloor+10).length>=12,'large fixed tears must reach above the forecourt architecture');
});

test('the entire town and sky are occupied, and the old exposed ground is covered by fixed flat cut faces',()=>{
  const layout=sourceEarthfallFaultLayout(),town=layout.filter(sheet=>sheet.scope==='town'),sky=layout.filter(sheet=>sheet.scope==='sky'),ground=layout.filter(sheet=>sheet.scope==='ground');
  assert.equal(town.length,F.townCount);assert.equal(sky.length,F.skyCount);assert.equal(ground.length,F.groundCount);
  assert.ok(Math.min(...town.map(sheet=>sheet.bounds.min[0]))<-90);
  assert.ok(Math.max(...town.map(sheet=>sheet.bounds.max[0]))>70);
  assert.ok(Math.min(...town.map(sheet=>sheet.bounds.min[2]))<-100);
  assert.ok(Math.max(...town.map(sheet=>sheet.bounds.max[2]))>60);
  assert.ok(sky.every(sheet=>sheet.bounds.min[1]>=116-1e-8));
  assert.ok(Math.max(...sky.map(sheet=>sheet.bounds.max[1]))>220,'the corruption must fill overhead space far above the town roofs');
  const cells=sourceEarthfallCellLayout();
  for(const cell of cells){
    const sheet=ground.find(sheet=>sheet.originCellId===cell.id);assert.ok(sheet);
    assert.deepEqual(sheet.vertices.map(([x,,z])=>[x,z]),cell.points.map(([x,,z])=>[x,z]));
    assert.ok(sheet.vertices.every(point=>point[1]===C.upperFloor+.042));
  }
  const views=[];
  for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const pitch of [-.8,0,.65,1.2]){
    const coverage=faultViewCoverage(layout,{eye:[0,101.62,-2],yaw,pitch,stage:'all'});views.push(coverage);
    assert.ok(coverage>.70,`town yaw ${yaw}, pitch ${pitch}: sparse world coverage ${(coverage*100).toFixed(1)}%`);
  }
  assert.ok(views.reduce((sum,value)=>sum+value,0)/views.length>.93,'full town, ground and overhead views must stay immersed in corruption');
});

test('actual fall triangles clear a continuous central corridor and the existing receiving floor', () => {
  const faults = sourceEarthfallFaultLayout().filter(fault => fault.stage === 'fall');
  for (const fault of faults) {
    const side = fault.vertices[0][0] < 0 ? -1 : 1;
    assert.ok(fault.vertices.every(point => side * point[0] >= F.fallClearanceHalfWidth), fault.id);
    assert.ok(fault.bounds.min[1] > C.lowerFloor && fault.bounds.max[1] < C.upperFloor, fault.id);
  }
  assert.ok(F.fallClearanceHalfWidth >= C.bodyRadius + 1);
});

test('silhouette, orientation and scale vary strongly instead of forming a regular panel grid', () => {
  const faults = sourceEarthfallFaultLayout();
  const stocks = faults.filter(fault => fault.palette === 'black' || fault.palette === 'silver');
  assert.ok(stocks.length / faults.length >= .25 && stocks.length / faults.length <= .35);
  assert.equal(new Set(faults.map(fault => fault.vertices.length)).size, 4);
  assert.ok(faults.filter(fault => fault.vertices.length > 3).length > faults.length / 2);
  const normals = new Set(faults.map(fault => normal(fault).map(n => Math.round(n * 4)).join(',')));
  assert.ok(normals.size > 35);
  const spans = faults.map(fault => {
    let longest = 0;
    for (const a of fault.vertices) for (const b of fault.vertices) longest = Math.max(longest, length(sub(a, b)));
    return { longest, thinness: longest * longest / area(fault) };
  });
  assert.ok(spans.filter(span => span.longest >= 10 && span.longest <= 27).length >= 20);
  assert.ok(spans.some(span => span.longest >= 20));
  assert.ok(spans.some(span => span.longest < 3));
  assert.ok(spans.filter(span => span.thinness > 45).length >= 25);
  assert.ok(spans.filter(span => span.thinness < 12).length >= 15);
  assert.equal(new Set(faults.map(fault => fault.palette)).size, F.palette.length);
});
