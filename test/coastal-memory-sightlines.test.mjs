import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { COASTAL_MEMORY_LAYOUT as layout } from '../src/data/coastal-memory.js';
import { makeCoastalMemoryScene } from '../src/game/coastal-memory/scene.js';
import { walkCoastalMemoryPose } from '../src/game/coastal-memory-scene.js';
import { coastalGlbMeshes, coastalMeshTriangles, coastalGeometrySightline, createCoastalVisibilityQuery, coastalVertexVisibility, coastalSurfaceSampleVisibility } from '../tools/chunk_surfer/source-drive-study/coastal-sightlines.mjs';

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const triangles = coastalMeshTriangles(coastalGlbMeshes(await readFile(new URL('../public/assets/source-drive/coastal-memory/coastal-memory.glb', import.meta.url))),
  makeCoastalMemoryScene({ worldFromLocal: identity }).props);
const m = layout.settledBodyLocal, wreck = [m[12] + m[4] * 1.2, m[13] + m[5] * 1.2, m[14] + m[6] * 1.2];
const sight = (x, z, target) => coastalGeometrySightline([x, layout.supportAt(x, z).height + 1.62, z], target, triangles);

test('actual acquired GLB rejects the former hidden wreck views and clears the reachable shoulder', () => {
  for (const [x, z] of [[33, 42], [35, 44]]) {
    const result = sight(x, z, wreck);
    assert.equal(result.clear, false); assert.equal(result.obstruction.mesh, 'cm_grass_bank');
  }
  for (const [x, z] of [[34.6, 42.5], [35, 43]]) {
    assert.ok(layout.canOccupy(x, z)); assert.equal(sight(x, z, wreck).clear, true);
  }
});

test('the distant pier clears the actual bank and outcrops before the physical road trench', () => {
  assert.equal(sight(10, 74, layout.pier.position).clear, false);
  assert.equal(sight(13.07639, 86, layout.pier.position).clear, true);
  assert.ok(layout.canOccupy(13.07639, 86));
});

test('the moving pier approach clears actual pier vertices and surface samples against every submitted opaque mesh', async () => {
  const meshes = [...coastalGlbMeshes(await readFile(new URL('../public/assets/source-drive/coastal-memory/coastal-memory.glb', import.meta.url))),
    ...coastalGlbMeshes(await readFile(new URL('../public/assets/source-drive/drive.glb', import.meta.url))),
    ...coastalGlbMeshes(await readFile(new URL('../public/assets/source-drive/coastal-memory/van-wreck.glb', import.meta.url)))];
  const metrics=JSON.parse(await readFile(new URL('../public/assets/source-drive/geometry/metrics.json',import.meta.url),'utf8'));
  const scene=makeCoastalMemoryScene({worldFromLocal:identity,includeWreck:true,vehicleMetrics:metrics});
  const all=coastalMeshTriangles(meshes,scene.props,{allOpaque:true});
  for(const name of ['cm_seabed','cm_shingle_beach','cm_foam_lace','van_wreck_hull','van_wreck_cab_door','van_wreck_rear_door','drive_tyre'])assert.ok(all.some(t=>t.mesh===name),'must include '+name);
  const query=createCoastalVisibilityQuery(all),mesh=meshes.find(m=>m.name==='cm_distant_pier'),matrix=scene.props.find(p=>p.mesh===mesh.name).matrix;
  for(const[x,z]of[[17.706081,74],[16.1,77],[14.388407,80],[13.4,83],[13.07639,86]])for(const dx of[-.25,0,.25]){
    assert.ok(layout.canOccupy(x+dx,z),'sample must be an ordinarily supported foot position');
    const eye=[x+dx,layout.supportAt(x+dx,z).height+1.62,z],options={mesh,matrix,eye,query,minimumY:layout.seaY};
    for(const result of[coastalVertexVisibility(options),coastalSurfaceSampleVisibility(options)]){
      assert.ok(result.considered>1000,'a pier-anchor ray is insufficient');
      assert.equal(result.occluded,0,JSON.stringify({pose:[x+dx,z],occluders:result.occluderIds}));
    }
  }
});

test('the same swept player controls walk the shingle past the van in plain sight and on under the point', () => {
  let pose = { ...layout.spawn }, reached = [];
  const route = [...layout.arrivalPath.slice(1), ...layout.coastalPath.slice(1), [6.3, layout.pierReturnPlane.point.z + .7]];
  for (const [x, z] of route) {
    let ticks = 0;
    while (Math.hypot(pose.x - x, pose.z - z) > .08 && ticks++ < 2400) {
      pose.yaw = Math.atan2(x - pose.x, -(z - pose.z));
      pose = walkCoastalMemoryPose(pose, { dt: .025, forward: 1 }, layout);
    }
    assert.ok(Math.hypot(pose.x - x, pose.z - z) < .08, `ordinary sweep reaches ${x},${z}: ${JSON.stringify(pose)}`);
    reached.push({ ...pose });
  }
  // Where we crashed is where we are: the van is in sight from where the walk
  // begins and from every step of the approach beside it.
  for (const p of [{ ...layout.spawn }, ...reached.slice(0, 3)])
    assert.equal(coastalGeometrySightline([p.x, p.feet + 1.62, p.z], wreck, triangles).clear, true, `the van is hidden from ${p.x},${p.z}`);
  assert.ok(reached.every((p) => p.feet > -.5 && p.feet < 2), 'the whole walk stays on the shingle');
  assert.ok(pose.z > layout.pierReturnPlane.point.z);
});
