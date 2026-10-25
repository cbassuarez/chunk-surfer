import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NodeIO} from '@gltf-transform/core';
import {Ray,Vector3} from 'three';
const doc=await new NodeIO().read(new URL('../public/assets/booth-guard-props.glb',import.meta.url).pathname);
const glazing=doc.getRoot().listMeshes().find(m=>m.getName()==='yard_booth_glazing');
const stats=JSON.parse(fs.readFileSync(new URL('../public/assets/booth-guard-props.stats.json',import.meta.url)));

function intersections(eye,target){
  const from=new Vector3(...eye),to=new Vector3(...target),distance=from.distanceTo(to),ray=new Ray(from,to.sub(from).normalize()),hits=[];
  for(const p of glazing.listPrimitives()){
    const positions=p.getAttribute('POSITION').getArray(),ids=p.getIndices().getArray();
    for(let i=0;i<ids.length;i+=3){const vertices=Array.from(ids.subarray(i,i+3),id=>{const[x,y,z]=positions.subarray(id*3,id*3+3);return new Vector3(24+z,y,14-x);});
      const hit=ray.intersectTriangle(...vertices,false,new Vector3());if(hit&&hit.distanceTo(from)<distance)hits.push({material:p.getMaterial().getName(),position:hit.toArray()});
    }
  }
  return hits;
}

test('the ordinary approach has real clear sightlines to guard face and cap',()=>{
  // Actual production booth/actor placement, ordinary 1.62m standing eye.
  // The old rail intersects the face ray at Y1.756, hiding his eyes; moving
  // the camera pitch could never repair an opaque surface on that ray.
  const eye=[26.25,1.62,14.75];
  assert.deepEqual(intersections([24.9,1.63,14.72],[25.5,1.63,14.72]),[],'the existing hand/key slot is blocked');
  for(const target of[[24.45,1.90,14.38],[24.37,2.02,14.38],[24.40,1.82,14.38]])assert.deepEqual(intersections(eye,target),[],`glazing hides guard point ${target}`);
});

test('the two original panes park aside and the complete rail rests on the sill',()=>{
  assert.deepEqual(stats.paneParking.centres,[[.55,1.91,1.30],[.60,1.91,1.355]]);
  assert.equal(stats.paneParking.retainedTopology,true);
  const rail=glazing.listPrimitives().find(p=>p.getMaterial().getName()==='painted steel').getAttribute('POSITION').getArray();
  const y=Array.from(rail).filter((_,i)=>i%3===1);
  assert.ok(Math.abs(Math.min(...y)-1.5)<1e-5);assert.ok(Math.abs(Math.max(...y)-1.57)<1e-5);
  const panes=glazing.listPrimitives().find(p=>p.getMaterial().getName()==='wired roof glass').getAttribute('POSITION').getArray(),parked=[];
  for(let i=0;i<panes.length;i+=3)if((Math.abs(panes[i+1]-1.71)<1e-4||Math.abs(panes[i+1]-2.11)<1e-4)&&panes[i+2]>1.2774&&panes[i]>.3)parked.push(Array.from(panes.subarray(i,i+3)));
  assert.equal(parked.length,48,'pane boxes lost vertices or rain streaks were moved with them');
  assert.ok(parked.every(p=>p[0]>.31&&p[0]<.84),'a pane still crosses the guard opening');
  for(const p of glazing.listPrimitives()){
    const m=p.getMaterial(),prior=stats.originalMaterialEvidence.yard_booth_glazing.find(a=>a.name===m.getName());
    assert.deepEqual(m.getBaseColorFactor(),prior.baseColor);assert.equal(m.getRoughnessFactor(),prior.roughness);assert.equal(m.getMetallicFactor(),prior.metallic);
  }
});
