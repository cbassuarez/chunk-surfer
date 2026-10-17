// Sample the submitted third-floor skin through the actual Source transforms.
// A repeated model must not lose parts, clip the room, or occupy either escape.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {heldNoteParts} from '../src/render/conservatory-adversary-performance.js';
import {SOURCE_RECEPTION_CELESTIALS,SOURCE_RECEPTION_CELESTIAL_MESHES,sourceLastReceptionCelestialInstances} from '../src/render/source-last-reception-celestials.js';
import {SOURCE_LAST_RECEPTION,sourceReceptionSolids} from '../src/data/source-last-reception.js';
import {createSourceSpaceRuntime} from '../src/game/source-space-runtime.js';
import {buildChunkSurfGodPreset,CHUNK_SURF_GOD_PRESET} from '../src/game/chunk-surf-god.js';
import {CELL,ZONE} from '../src/data/floorplan/legend.js';

const raw=readFileSync(new URL('../public/assets/held-note.glb',import.meta.url));
const asset=parseCharacterAsset(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
const byName=new Map(asset.entries.map(entry=>[entry.name,entry]));
const overlaps=(a,b,margin=0)=>a.max[0]>b.minX-margin&&a.min[0]<b.maxX+margin
  &&a.max[1]>b.minY-margin&&a.min[1]<b.maxY+margin
  &&a.max[2]>b.minZ-margin&&a.min[2]<b.maxZ+margin;
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-4,`${a} != ${b}`);

function renderedBounds(instances){
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(const instance of instances){
    const entry=byName.get(instance.mesh),pose=sampleCharacterPose(asset,entry,instance.character),m=instance.matrix;
    assert.ok([...pose.bones,...m].every(Number.isFinite),'the submitted skin and root matrices remain finite');
    for(const primitive of entry.primitives)for(const vertex of new Set(primitive.indices)){
      const point=[0,0,0];
      for(let slot=0;slot<4;slot++){
        const weight=primitive.weights[vertex*4+slot],at=primitive.joints[vertex*4+slot]*16;
        if(!weight)continue;
        const x=primitive.positions[vertex*3],y=primitive.positions[vertex*3+1],z=primitive.positions[vertex*3+2];
        for(let axis=0;axis<3;axis++)point[axis]+=weight*(pose.bones[at+axis]*x+pose.bones[at+4+axis]*y+pose.bones[at+8+axis]*z+pose.bones[at+12+axis]);
      }
      const world=[0,1,2].map(axis=>m[axis]*point[0]+m[axis+4]*point[1]+m[axis+8]*point[2]+m[axis+12]);
      assert.ok(world.every(Number.isFinite),'actual deformed vertices remain finite');
      assert.ok(Math.hypot(world[0]-instance.x,world[1]-instance.y,world[2]-instance.z)<instance.cullRadius,
        'the whole four-wing body and eye wheel fit the renderer culling radius');
      for(let axis=0;axis<3;axis++){
        bounds.min[axis]=Math.min(bounds.min[axis],world[axis]);
        bounds.max[axis]=Math.max(bounds.max[axis],world[axis]);
      }
    }
  }
  return bounds;
}

test('Source retains the original complete third-floor celestial in one ordinary character pass',()=>{
  assert.deepEqual([...SOURCE_RECEPTION_CELESTIAL_MESHES].sort(),asset.entries.map(entry=>entry.name).sort());
  assert.equal(SOURCE_RECEPTION_CELESTIALS.length,3);
  const instances=sourceLastReceptionCelestialInstances({elapsed:19},{origin:{x:300,z:600},zone:ZONE.sourceSpace});
  assert.equal(instances.length,9);
  assert.equal(new Set(instances.map(instance=>instance.id)).size,9);
  for(const actor of SOURCE_RECEPTION_CELESTIALS){
    const parts=instances.filter(instance=>instance.receptionCelestial===actor.id);
    assert.equal(parts.length,3);
    assert.deepEqual(parts.map(part=>part.mesh),SOURCE_RECEPTION_CELESTIAL_MESHES);
    for(const part of parts){
      assert.equal(part.matrix,parts[0].matrix,'body, faces, wings and wheel share the same root');
      assert.equal(part.character,parts[0].character,'all parts sample exactly the same skeleton');
      close(part.matrix[12],actor.x+300);close(part.matrix[13],actor.y);close(part.matrix[14],actor.z+600);
      assert.equal(part.zone,ZONE.sourceSpace);assert.equal(part.structural,false);
      for(const flag of ['pressure','shadowOnly','apparitionVariant','emissive','overlay'])assert.equal(part[flag],undefined,
        'retained celestials use ordinary lit world colour/depth/shadows before final dither');
      assert.equal(byName.get(part.mesh).skin.joints.length,39);
    }
  }
  const original=heldNoteParts({phase:'reveal',elapsed:1.4});
  assert.deepEqual(original.filter(part=>part.character).map(part=>part.mesh).sort(),[...SOURCE_RECEPTION_CELESTIAL_MESHES].sort());
  assert.ok(original.some(part=>part.mesh==='held_note_ceiling_wound'),'the existing chamber dressing stays in its original encounter');
  assert.ok(!instances.some(part=>part.mesh==='held_note_ceiling_wound'),'Source copies do not inherit a wound at an unrelated world position');
});

test('actual animated skin clears every wall, roof, floor, gallery and escape volume',()=>{
  const architecture=sourceReceptionSolids(),support=architecture.filter(part=>part.support);
  const clocks=[0,.7,2.35,4,8.6,19,37,83,173,499,1000];
  for(const reducedMotion of [false,true])for(const elapsed of clocks){
    const instances=sourceLastReceptionCelestialInstances({elapsed},{reducedMotion});
    for(const actor of SOURCE_RECEPTION_CELESTIALS){
      const bounds=renderedBounds(instances.filter(instance=>instance.receptionCelestial===actor.id));
      for(const solid of architecture)assert.equal(overlaps(bounds,solid,.02),false,
        `${actor.id} at ${elapsed}s ${reducedMotion?'reduced':'ordinary'} motion intersects ${solid.id}`);
      // The complete rendered AABB clears architecture, which also proves all
      // its triangles clear it. Check the highest potentially walkable slab
      // below the body, including stairs/deck rather than only the base floor.
      let floor=SOURCE_LAST_RECEPTION.floor;
      for(const slab of support)if(bounds.max[0]>slab.minX&&bounds.min[0]<slab.maxX
        &&bounds.max[2]>slab.minZ&&bounds.min[2]<slab.maxZ&&slab.maxY<bounds.min[1])floor=Math.max(floor,slab.maxY);
      assert.ok(bounds.min[1]-floor>1.8,`${actor.id} must leave full walking headroom`);
      for(const entrance of SOURCE_LAST_RECEPTION.entrances){
        const exit={minX:entrance.x-2,maxX:entrance.x+2,minY:entrance.floor,maxY:entrance.floor+entrance.height,
          minZ:entrance.z-entrance.width/2,maxZ:entrance.z+entrance.width/2};
        assert.equal(overlaps(bounds,exit),false,`${actor.id} must not occupy the ${entrance.id} escape aperture`);
      }
    }
  }
});

test('held poses pause deterministically and reduced motion freezes the same complete bodies',()=>{
  const before=sourceLastReceptionCelestialInstances({elapsed:12});
  assert.deepEqual(sourceLastReceptionCelestialInstances({elapsed:12}),before,'paused conversation clock cannot drift');
  const later=sourceLastReceptionCelestialInstances({elapsed:28});
  assert.notDeepEqual(later[0].character,before[0].character,'ordinary Source copies retain subtle articulated motion');
  assert.deepEqual(later.map(part=>part.matrix),before.map(part=>part.matrix),'the witnesses never translate into a navigation route');
  assert.deepEqual(sourceLastReceptionCelestialInstances({elapsed:0},{reducedMotion:true}),
    sourceLastReceptionCelestialInstances({elapsed:1000},{reducedMotion:true}),'reduced motion preserves asynchronous held poses without ongoing drift');
});

test('the production runtime includes the retained bodies only beyond the first lift',()=>{
  for(const [preset,count]of [[CHUNK_SURF_GOD_PRESET.LAST_RECEPTION,9],[CHUNK_SURF_GOD_PRESET.FIRST_LIFT,0],[CHUNK_SURF_GOD_PRESET.HALL_ENTRY,0]]){
    const built=buildChunkSurfGodPreset(preset,{seed:4417,injuries:0,hasRig:false});
    const runtime=createSourceSpaceRuntime({initialState:built.state});
    runtime.setPlayerPosition(built.position);
    const actual=runtime.propInstances(built.position.x,built.position.y,{all:true,reducedMotion:true}).filter(part=>part.receptionCelestial);
    assert.equal(actual.length,count,preset);
    if(!count)continue;
    const origin=built.state.landscapeOrigin;
    const expected=sourceLastReceptionCelestialInstances(runtime.lastReceptionFrame(),{
      origin:{x:origin.x*CELL,z:origin.y*CELL},zone:ZONE.sourceSpace,reducedMotion:true,
    });
    for(const instance of actual){
      const comparison=expected.find(part=>part.id===instance.id);assert.ok(comparison);
      assert.deepEqual(instance.matrix,comparison.matrix);assert.deepEqual(instance.character,comparison.character);
    }
  }
});
