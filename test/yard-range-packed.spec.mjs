import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyServicePacked} from '../tools/chunk_surfer/verify-yard-range-frontages.mjs';
const proof=verifyServicePacked();
test('actual packed caretaker/laundry openings have clear depth before furniture or room back',()=>{
  assert.equal(proof.checks.actualWindowsOpen,true);assert.equal(proof.reports.flatMap(r=>r.windowRays.flatMap(w=>w.rays)).length,32);
});
test('actual packed closed door leaves sit in front of the old corrugated/service skins',()=>{
  assert.equal(proof.checks.newDetailsAheadOfSkins,true);assert.equal(proof.reports.flatMap(r=>r.backingDepthRays).length,12);
});
test('actual new parts and complete range meshes respect the padded body clearance',()=>{
  assert.equal(proof.checks.newBodyGeometryWithinCollisionPad,true);
  assert.equal(proof.checks.wholeMeshesWithinCollisionPad,true,'the legacy west drain cannot protrude beyond the actual existing 0.20m body collision padding');
});
test('inspection stands use clear, ordinary compiled cells and permit normal movement beside the building',()=>{
  assert.equal(proof.checks.inspectionStandsClear,true);
  for(const r of proof.reports)for(const s of r.inspectionStands){assert.equal(s.feet,0);assert.equal(s.eye[1],1.62);assert.ok(Math.abs(s.pitch)<=.62);}
});
