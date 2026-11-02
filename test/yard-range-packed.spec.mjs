import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyServicePacked} from '../tools/chunk_surfer/verify-yard-range-frontages.mjs';
const proof=verifyServicePacked();
test('actual packed caretaker/laundry openings have clear depth before furniture or room back',()=>{
  assert.equal(proof.checks.actualWindowsOpen,true);assert.equal(proof.reports.flatMap(r=>r.windowRays.flatMap(w=>w.rays)).length,32);
});
test('converted entrances use actual closed/open runtime leaves and packed air, while scenic backing rules remain separate',()=>{
  assert.equal(proof.checks.newDetailsAheadOfSkins,true);
  assert.equal(proof.checks.convertedDoorwaysAccountable,true,JSON.stringify(proof.reports.flatMap(r=>r.runtimeDoorProofs).filter(d=>!d.pass)));
  const doors=proof.reports.flatMap(r=>r.runtimeDoorProofs);
  assert.deepEqual(doors.map(d=>d.id).sort(),['pub-east-entry','pub-west-entry','yard-stores-entry']);
  for(const door of doors){assert.equal(door.closedReason,'closed');assert.equal(door.openedPassageClear,true);assert.equal(door.rays.length,9);assert.ok(door.rays.every(r=>r.pass));}
});
test('actual range geometry is covered by its padded closed mass or exact public-room facade collision',()=>{
  assert.equal(proof.checks.newBodyGeometryCoveredByCollision,true);
  assert.equal(proof.checks.wholeMeshBodyGeometryCoveredByCollision,true,'converted room projections require actual continuous facade coverage, never a global collision waiver');
  for(const r of proof.reports){
    if(!r.publicRoom){assert.equal(r.newGeometryClearancePass,true);assert.equal(r.wholeMeshClearancePass,true);}
    else for(const point of r.collisionCoverage)assert.equal(point.covered,true,JSON.stringify(point));
  }
});
test('inspection stands use clear, ordinary compiled cells and permit normal movement beside the building',()=>{
  assert.equal(proof.checks.inspectionStandsClear,true,JSON.stringify(proof.reports.flatMap(r=>r.inspectionStands).filter(s=>!s.canOccupy||s.solid||!s.canWalkNorth||!s.canWalkSouth||!s.lineClear)));
  for(const r of proof.reports)for(const s of r.inspectionStands){assert.ok(s.feet>=0&&s.feet<=.120001);assert.equal(s.eye[1],s.feet+1.62);assert.ok(Math.abs(s.pitch)<=.62);assert.equal(s.lineClear,true,JSON.stringify({id:s.id,firstHit:s.firstHit}));}
});
