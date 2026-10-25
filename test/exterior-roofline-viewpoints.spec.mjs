import test from'node:test';import assert from'node:assert/strict';
import{auditExteriorRooflineViews,pointInsideYardRange}from'../tools/chunk_surfer/audit-exterior-roofline-views.mjs';
import{YARD_SERVICE_RANGES}from'../src/data/exterior-district.js';
const audit=auditExteriorRooflineViews();
test('the two rejected native fixtures are inside solid construction and refuse ordinary body occupancy',()=>{
  const annex=audit.views.find(v=>v.id==='invalid-inside-rehearsal-annex'),plant=audit.views.find(v=>v.id==='invalid-inside-baths-plant');
  for(const[v,id]of[[annex,'yard-rehearsal-annex'],[plant,'yard-baths-plant']]){assert.equal(v.bodyOccupancy,false);assert.ok(v.inside.some(r=>r.id===id));assert.equal(v.nearestArchitecturalHit.id,id);assert.ok(v.targetProjection.inside,'visible screen projection alone did not qualify this illegal eye');}
  assert.ok(annex.nearestArchitecturalHit.world[0]-annex.eye[0]<.051,'original failed capture looked into mesh stock5cmfromeye');
});
test('legal school and hall gap cameras see the intended actual crown through the selected static architecture',()=>{
  const school=audit.views.find(v=>v.id==='school-gap-qualified-candidate'),hall=audit.views.find(v=>v.id==='hall-gap-qualified-candidate');
  for(const v of[school,hall]){assert.equal(v.bodyOccupancy,true);assert.deepEqual(v.inside,[]);assert.ok(v.targetProjection.inside);assert.ok(v.targetProjection.pixel[1]>350&&v.targetProjection.pixel[1]<450);assert.ok(v.closureVisible&&v.closureSkyExposed);assert.ok(v.nearestArchitecturalHit.f>.995);}
  assert.equal(school.nearestArchitecturalHit.id,'ellery-west-roofline-closure');assert.equal(hall.nearestArchitecturalHit.id,'bay-west-elevation');
  assert.equal(audit.ordinaryRouteBetweenCandidates.result,'PASS');assert.deepEqual(audit.ordinaryRouteBetweenCandidates.failures,[]);assert.equal(audit.ordinaryRouteBetweenCandidates.samples,37);
});
test('actual facade and roof closure anchors retain the outdoor sky and their expected source positions',()=>{
  const facade=audit.instances.find(i=>i.id==='bay-west-elevation'),closure=audit.instances.find(i=>i.id==='ellery-west-roofline-closure');
  assert.deepEqual([facade.x,facade.y,facade.z,facade.zone],[50,0,7.5,1]);assert.ok(facade.skyEligible);assert.ok(closure.skyEligible&&closure.skyExposed);
  assert.ok(audit.inputs['public/assets/conservatory-props.glb']?.length===64&&audit.inputs['public/assets/ellery-exterior-roofline.glb']?.length===64);
  for(const r of YARD_SERVICE_RANGES)assert.equal(pointInsideYardRange([r.physical.x,r.height+1,r.physical.y],r),false,'roof-height air is not classified as inside its ground body');
  assert.match(audit.qualification,/Native final dither.*remain pending/);
});
