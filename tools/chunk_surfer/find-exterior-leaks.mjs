// Diagnostic: which authored props are interior dressing but sit OUTSIDE the
// exterior-observer hide envelope (x 49.5..129, z -0.5..93.5) in prop-visibility.js,
// i.e. they would be drawn floating in front of the building shell from the yard.
// Run: node tools/chunk_surfer/find-exterior-leaks.mjs
import { CONSERVATORY_PROPS } from '../../src/data/conservatory-props.js';
import { conservatory } from '../../src/data/floorplan/conservatory.js';
import * as FP from '../../src/world/floorplan.js';
FP.compile(conservatory.levels, {
  width: conservatory.width, height: conservatory.height, widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [], edgePortals: conservatory.edgePortals || [], doors: conservatory.doors || [],
});

const ENV = { x0: 49.5, x1: 129.0, z0: -0.5, z1: 93.5 };
const inside = (p) => p.x >= ENV.x0 && p.x <= ENV.x1 && p.y >= ENV.z0 && p.y <= ENV.z1;

const wallMounted = CONSERVATORY_PROPS.filter((p) => p.mount === 'wall');
const outside = wallMounted.filter((p) => !inside(p));
const insideButSuspicious = wallMounted.filter((p) => inside(p) && !['portrait_frame', 'power_box_01', 'acoustic_foam_panel', 'tower_peal_board', 'atrium_public_fittings'].includes(p.mesh));

console.log(`wall-mounted props: ${wallMounted.length}; outside the exterior-hide envelope: ${outside.length}\n`);
console.log('=== WALL-MOUNTED, OUTSIDE ENVELOPE (drawn from the yard) ===');
for (const p of outside) {
  const z = FP.zoneAt(Math.round(p.x * 2), Math.round(p.y * 2));
  console.log(`  ${p.id.padEnd(34)} @(${String(p.x).padStart(6)},${String(p.y).padStart(6)})  mesh=${p.mesh}  zone=${z}`);
}
console.log('\n=== wall-mounted INSIDE envelope, by mesh ===');
const byMesh = {};
for (const p of insideButSuspicious) byMesh[p.mesh] = (byMesh[p.mesh] || 0) + 1;
for (const [m, n] of Object.entries(byMesh)) console.log(`  ${m}: ${n}`);
