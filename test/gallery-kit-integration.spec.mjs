import test from'node:test';
import assert from'node:assert/strict';
import *as FP from'../src/world/floorplan.js';
import *as P from'../src/game/props.js';
import{conservatory as C}from'../src/data/floorplan/conservatory.js';
import{architectureFittingsPlan}from'../src/world/architecture-fittings.js';
import{ARCHITECTURE_HOST_RESERVATIONS}from'../src/data/architecture-fittings.js';
import{loadGalleryGeometry,galleryFixtureFrontObstructions}from'./helpers/gallery-kit-contact.mjs';
FP.compile(C.levels,{width:C.width,height:C.height,widenCorridors:C.widenCorridors,connectors:C.connectors,edgePortals:C.edgePortals,doors:C.doors});
const geometry=loadGalleryGeometry();
const plain=architectureFittingsPlan(FP,{hostReservations:ARCHITECTURE_HOST_RESERVATIONS.filter(h=>h.geometryPack!=='academic-gallery.glb')});
const integrated=architectureFittingsPlan(FP);
P.propsInit(FP,plain.placements);const before=P.renderInstances({inscriptions:false});
P.propsInit(FP,integrated.placements);const after=P.renderInstances({inscriptions:false});
P.propsInit(FP);const full=P.renderInstances({inscriptions:false});

test('actual gallery cladding reconstructs the buried callpoint before reservations',()=>{
  const callpoint=before.find(p=>p.id==='architecture-space-academic-gallery-callpoint');
  assert.deepEqual([callpoint.x,callpoint.y,callpoint.z],[73,11.28,14.75]);
  const [check]=galleryFixtureFrontObstructions(full,{fixtures:[callpoint],geometry});
  assert.equal(check.samples.filter(s=>s.blockers.includes('gallery-treatment-west-bay-2')).length,9,
    'the original callpoint is behind the actual emitted panelled bay from every sampled normal approach');
});

test('three measured cladding reservations rehost exactly eight gallery fittings without changing the finite schedule',()=>{
  const prior=new Map(before.map(p=>[p.id,p]));
  const changed=after.filter(p=>JSON.stringify(prior.get(p.id))!==JSON.stringify(p)).map(p=>p.id).sort();
  const expected=integrated.placements.filter(p=>p.roomId==='space:academic-gallery'&&p.mount==='wall').map(p=>p.id).sort();
  assert.equal(changed.length,8);assert.deepEqual(changed,expected);
  assert.deepEqual(integrated.statistics,plain.statistics,'no room, fitting, host-run or category is added or dropped');
  assert.deepEqual(integrated.statistics.unresolvedRooms,[]);
  assert.equal(integrated.rooms.length,53);
  const r=ARCHITECTURE_HOST_RESERVATIONS.filter(h=>h.geometryPack==='academic-gallery.glb');
  assert.equal(r.length,3);
  for(const h of r)assert.deepEqual(h.bounds,geometry.meshes.get(h.mesh).bounds,'every reservation uses actual packed geometry');
});

test('all seventy-two actual fixture-front rays clear the panelled bays, bench, consoles and planters',()=>{
  const checked=galleryFixtureFrontObstructions(full,{geometry});
  assert.equal(checked.length,8);
  assert.equal(checked.flatMap(p=>p.samples).length,72);
  assert.deepEqual(checked.flatMap(p=>p.samples.filter(s=>s.blockers.length).map(s=>({id:p.id,...s}))),[],
    'wall services must have an exposed working face in front of the existing room finish and furnishings');
});
