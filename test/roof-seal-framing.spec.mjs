import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { ACADEMIC_ROOF } from '../src/data/academic-roof.js';
import { CENTURY_STAY_STAGING, ENDING_VARIANT } from '../src/data/endings.js';
import { ZONE } from '../src/data/floorplan/legend.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { towerPersonalGeometry } from '../src/render/tower-personal-meshes.js';

FP.compile(conservatory.levels, conservatory);
PROPS.propsInit(FP);
const source = readFileSync('src/main.js', 'utf8');
const section = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `runtime boundary ${start}`);
  return source.slice(from, to);
};
const origin = FP.toRuntimePoint(CENTURY_STAY_STAGING.player);
const onSupportedGlass = ({ x, y }) => x >= ACADEMIC_ROOF.glass.x0 && x < ACADEMIC_ROOF.glass.x1
  && y >= ACADEMIC_ROOF.glass.y0 && y < ACADEMIC_ROOF.glass.y1;
assert.ok(onSupportedGlass(CENTURY_STAY_STAGING.player), 'the guarantor makes contact on supported glazing');
assert.ok(onSupportedGlass({ x: CENTURY_STAY_STAGING.ren.x, y: CENTURY_STAY_STAGING.ren.y + 1.15 }),
  'Ren stands on the same supported glazing at the held stage');
assert.ok(onSupportedGlass(CENTURY_STAY_STAGING.camera), 'the final shot has glass under the camera');
const guarantor = towerPersonalGeometry().find(piece => piece.name === 'ending_roof_guarantor');
const exposedSkin = guarantor.groups.find(group => group.material === 'skin')?.positions || [];
const skinFloor = Math.min(...exposedSkin.filter((_, index) => index % 3 === 1));
assert.ok(guarantor.bounds.max[1] > 1.6 && skinFloor < .03,
  'the fully human player is low on one knee with a bare palm physically touching the glass');
const glassContact = [];
for (let index = 0; index < exposedSkin.length; index += 3) {
  if (exposedSkin[index + 1] < .04) glassContact.push({
    x: FP.toAuthoredCoord(origin.x) + exposedSkin[index],
    y: FP.toAuthoredCoord(origin.y) + exposedSkin[index + 2],
  });
}
assert.ok(glassContact.length > 12 && glassContact.every(onSupportedGlass),
  'every low finger and palm vertex actually contacts supported glazing, not the metal curb');
const sandbox = {
  FP, PROPS, ACADEMIC_ROOF, CENTURY_STAY_STAGING, ENDING_VARIANT, CELL: .5, D: metres => metres * 2,
  usingSourceSpace: () => false, usingSpecialSpace: () => false,
  performance: { now: () => 10000 },
  activeEndingCutscene: { spec: { endingId: 'sacrifice', variant: ENDING_VARIANT.CENTURY_STAY },
    origin: { ...origin, yaw: Math.PI, forward: [0, 1] }, startedMs: 0,
    state: { reducedMotion: false }, embodiment: { roofSealStage: 4, finalHold: false } },
};
const staging = vm.runInNewContext([
  section('function endingPropInstance', 'function endingSourcePropInstances'),
  section('function endingWorldPropInstances', '// Review evidence for the physical ending layer.'),
  '({props:endingWorldPropInstances,view:endingCutsceneWorldView})',
].join('\n'), sandbox);
const metres = point => {
  const p = FP.logicalToPhysical(point.x, point.y);
  return { x: p.x * .5, z: p.z * .5 };
};
let referenceView;
for (const reducedMotion of [false, true]) for (const roofSealStage of [4, 5]) {
  sandbox.activeEndingCutscene.state.reducedMotion = reducedMotion;
  sandbox.activeEndingCutscene.embodiment = { roofSealStage, finalHold: roofSealStage === 5 };
  const view = staging.view(), camera = metres(view);
  const pair = staging.props().filter(prop => ['ending-roof-ren', 'ending-roof-guarantor'].includes(prop.id));
  assert.equal(pair.length, 2);
  assert.equal(pair.find(prop => prop.id === 'ending-roof-guarantor').mesh, 'ending_roof_guarantor',
    'the living guarantor uses its complete human contractor mesh, not the generic block figure');
  assert.equal(FP.floorAt(view.x, view.y), 17, 'the held camera rests on the existing roof floor');
  assert.equal(FP.zoneAt(view.x, view.y), ZONE.academicRoof);
  assert.equal(FP.isSolid(view.x, view.y), false, 'the camera is clear of the perimeter and roof solids');
  assert.equal(view.suppressActors, true, 'unrelated gameplay actors cannot obscure the consenting pair');
  const frames = pair.map(prop => {
    const dx = prop.x - camera.x, dz = prop.z - camera.z;
    const depth = dx * Math.sin(view.yaw) - dz * Math.cos(view.yaw);
    return { depth, horizontal: (dx * Math.cos(view.yaw) + dz * Math.sin(view.yaw)) / (depth * .95),
      // Same 0.95 projection scale as the native renderer, at its safe 600px viewport.
      heightPx: (prop.id === 'ending-roof-ren' ? 1.85 : guarantor.bounds.max[1]) / (depth * .95) * 300 };
  });
  assert.ok(frames.every(frame => frame.depth > 2.5 && frame.depth < 5.5), 'both actors remain at a readable conversational distance');
  assert.ok(frames.every(frame => Math.abs(frame.horizontal) < .5 && frame.heightPx > 110),
    'both full-height bodies occupy useful screen area while the city has room around them');
  assert.ok(Math.abs(frames[0].horizontal - frames[1].horizontal) > .20,
    'the Ren and guarantor silhouettes separate in the actual projected view');
  if (referenceView) assert.deepEqual(view, referenceView, 'normal/reduced motion and release share a steady final frame');
  else referenceView = view;
}
sandbox.activeEndingCutscene.embodiment = { roofSealStage: 1, finalHold: false };
const contact = staging.view();
assert.equal(contact.x, origin.x); assert.equal(contact.y, origin.y, 'the first-person contact pose is unchanged');
sandbox.activeEndingCutscene.spec = { endingId: 'sacrifice' };
sandbox.activeEndingCutscene.embodiment = { collapseStage: 0, finalHold: false };
assert.equal(staging.view(), null, 'ordinary Seal does not use the roof variant camera');
console.log('roof seal framing: supported camera, readable separated actors, steady motion modes and ordinary Seal isolation pass');
