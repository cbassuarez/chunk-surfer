// Diagnostic: list every wall-mounted conservatory prop that fails to resolve a
// wall (i.e. is floating in space), and those whose resolved wall normal disagrees
// with the authored mountNormal. Run: node tools/chunk_surfer/find-floating-props.mjs
import { CONSERVATORY_PROPS } from '../../src/data/conservatory-props.js';
import { conservatory } from '../../src/data/floorplan/conservatory.js';
import * as FP from '../../src/world/floorplan.js';
import { wallContactAt } from '../../src/world/wall-contact.js';

FP.compile(conservatory.levels, {
  width: conservatory.width, height: conservatory.height, widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [], edgePortals: conservatory.edgePortals || [], doors: conservatory.doors || [],
});
const plan = () => ({ size: FP.planSize, isSolid: FP.isSolid, floorAt: FP.floorAt, zoneAt: FP.zoneAt, materialAt: FP.materialAt, doorAt: FP.doorAt, logicalToPhysical: FP.logicalToPhysical });
const P = plan();

const floating = [], wrongNormal = [];
let mounted = 0;
for (const p of CONSERVATORY_PROPS) {
  if (p.mount !== 'wall') continue;
  mounted += 1;
  const rx = Math.round(p.x * 2), ry = Math.round(p.y * 2);
  const contact = wallContactAt(P, rx + 0.5, ry + 0.5, { prefer: p.mountNormal || null });
  if (!contact) floating.push(`${p.id}  @(${p.x},${p.y})  mesh=${p.mesh}`);
  else if (p.mountNormal && (Math.sign(contact.nx) !== Math.sign(p.mountNormal.nx) || Math.sign(contact.ny) !== Math.sign(p.mountNormal.ny))) {
    wrongNormal.push(`${p.id}  authored(nx:${p.mountNormal.nx},ny:${p.mountNormal.ny}) resolved(nx:${contact.nx},ny:${contact.ny})`);
  }
}
console.log(`\nmount:'wall' props: ${mounted}`);
console.log(`\n=== FLOATING (no wall in reach) — ${floating.length} ===`);
for (const f of floating) console.log('  ' + f);
console.log(`\n=== WRONG WALL NORMAL — ${wrongNormal.length} ===`);
for (const w of wrongNormal) console.log('  ' + w);
