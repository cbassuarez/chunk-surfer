import { LOADING_BAY_ACCESS, loadingBayStairFloorAt } from '../../src/data/loading-bay-access.js';

export function buildLoadingBayAccess({ mesh, addBox, addBeam, addCylinder, MAT }) {
  const m = mesh('yard_dock_access');
  const { run, meshOrigin: origin, bays, drop } = LOADING_BAY_ACCESS;
  for (const bay of bays) {
    const z = (bay.z0 + bay.z1) / 2 - origin.z, width = bay.z1 - bay.z0;
    for (let i = 0; i < run.steps; i++) {
      const worldX = run.x0 + i, floor = loadingBayStairFloorAt(worldX, bay.z0);
      const x = worldX + .5 - origin.x;
      addBox(m, [x, floor + .018, z], [.94, .036, width - .10], MAT.dark);
      addBox(m, [x + .43, floor + .045, z], [.08, .055, width - .04], MAT.cone);
    }
    for (const edge of [bay.z0 - origin.z - .08, bay.z1 - origin.z + .08]) {
      addBeam(m, [run.x0 - origin.x, .18, edge], [run.x1 - origin.x, .98, edge], .055, MAT.steel);
      for (const [x, floor] of [[run.x0, drop], [48, loadingBayStairFloorAt(48, bay.z0)], [run.x1, 0]]) {
        addBeam(m, [x - origin.x, floor + .04, edge], [x - origin.x, floor + .94, edge], .055, MAT.steel);
      }
      addBox(m, [run.x0 - origin.x, drop + .08, edge], [.22, .16, .22], MAT.cone);
    }
  }
  // End protection belongs to the raised loading face, between the two walks.
  for (const z of [-1.45, .65]) {
    addCylinder(m, [2.28, .42, z], .13, .84, MAT.safetyRed, 10);
    addBox(m, [2.28, .44, z], [.29, .10, .29], MAT.agedWhite);
  }
  return m;
}
