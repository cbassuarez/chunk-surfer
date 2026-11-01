import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_REST_ALCOVE} from '../src/data/source-rest-alcove.js';
import {freshSourceContinuation,normalizeSourceContinuation,sourceContinuationCanOccupy} from '../src/game/source-continuation.js';
import {recoverSourceRestAlcoveCheckpoint} from '../src/game/source-rest-alcove-recovery.js';
import {createSourceContinuationScene} from '../src/game/source-continuation-scene.js';
const saved=extra=>({...freshSourceContinuation({runId:'alcove-recovery'}),status:'active',phase:'wrong-return',chartId:0,feet:8.4,
  x:.43,z:-21.2,elapsed:183.5,doorOpen:{'wrong-entry-return':true},knowledge:['remembered-earlier-construction'],
  velocity:{x:1,z:2},jumpHeld:true,...extra});

test('only a supported ordinary body blocked by new alcove partitions recovers to the supported discovery',()=>{
  for(const [x,z]of [[1.2,-20.38],[.43,-21.2],[.43,-22.2],[.43,-20.55],[2.18,-21.1]]){
    const old=saved({x,z}),fixed=recoverSourceRestAlcoveCheckpoint(old);
    assert.notEqual(fixed,old);assert.equal(fixed.x,SOURCE_REST_ALCOVE.discovery.x);assert.equal(fixed.z,SOURCE_REST_ALCOVE.discovery.z);
    assert.ok(sourceContinuationCanOccupy(fixed.x,fixed.z,fixed));assert.deepEqual(fixed.velocity,{x:0,z:0});assert.equal(fixed.jumpHeld,false);
    assert.equal(fixed.elapsed,old.elapsed);assert.equal(fixed.knowledge,old.knowledge);assert.equal(fixed.doorOpen,old.doorOpen);assert.equal(fixed.hush,old.hush);
    assert.equal(old.x,x,'the saved object is not mutated');assert.equal(recoverSourceRestAlcoveCheckpoint(fixed),fixed,'repair is idempotent');
    const normalized=normalizeSourceContinuation(old);assert.equal(normalized.x,fixed.x);assert.equal(normalized.z,fixed.z,'production normalization does not send this local change back to spawn');
  }
  const scene=createSourceContinuationScene({checkpoint:saved(),renderer:{render:()=>true}});
  assert.equal(scene.view().x,SOURCE_REST_ALCOVE.discovery.x);assert.equal(scene.serialize().elapsed,183.5);
});

test('all other checkpoint paths and pre-existing obstructions remain untouched by this repair',()=>{
  for(const changes of [{x:-.13},{x:0,z:-19},{chartId:1},{feet:4.2},{phase:'catch'},
    {status:'completed'},{status:'returned'},{layoutVersion:3},{fall:{x:1.43,z:-20.4,feet:8.4}},
    {recovery:{reason:'existing'}},{cameraTransit:{elapsed:0}},{bodyTransit:{elapsed:0}},
    {x:2.95,z:-19.34},{x:100,z:100},{feet:8.41}]){
    const value=saved(changes);assert.equal(recoverSourceRestAlcoveCheckpoint(value),value,JSON.stringify(changes));
  }
});
