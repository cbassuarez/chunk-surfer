// The main open-well stair as construction: one stair, drawn once.
//
// Written before the rebuild and expected to fail against revision 3; it is
// added to test/run-all.mjs only once the rebuilt stair passes it. Every check
// runs and reports, rather than stopping at the first, so the state of the
// whole stair is visible in one run.
//
// The measurements live in tools/chunk_surfer/main-stair-audit.mjs, which is
// also what the inventory export and the camera-station source maps use, so a
// number here is the same number those tools print.

import * as A from '../tools/chunk_surfer/main-stair-audit.mjs';

const tris=A.stairMeshTriangles(),bvh=A.buildBVH(tris),columns=A.regionColumns();
const results=[];
const check=(name,pass,detail)=>{results.push({name,pass:!!pass,detail});};

// ── The mesh is a closed, clean surface ─────────────────────────────────────
const hygiene=A.meshHygiene(tris);
check('mesh: every edge is shared by exactly two triangles (no open edges)',hygiene.boundary===0,{openEdges:hygiene.boundary,byMaterial:hygiene.boundaryByMaterial});
check('mesh: no edge is shared by more than two triangles',hygiene.nonManifold===0,{nonManifold:hygiene.nonManifold,byMaterial:hygiene.nonManifoldByMaterial});
check('mesh: no T-junctions',hygiene.tJunctions===0,{tJunctions:hygiene.tJunctions,byMaterial:hygiene.tByMaterial});
check('mesh: no two faces share a plane and a direction over the same area',hygiene.overlaps===0,{overlaps:hygiene.overlaps,byMaterials:hygiene.overlapByMaterial});

// Shading normals within a few degrees of the analytic surface they stand for:
// treads, risers, the two cylinders and the helicoid soffit.
const normals=A.measureShellNormals(tris);
for(const [surface,stat] of Object.entries(normals))
  check(`mesh: ${surface} shading normals within 3° of the true surface`,stat.max<=3,{maxDeg:+stat.max.toFixed(2),p95Deg:+stat.p95.toFixed(2),corners:stat.count});
for(const surface of['tread','riser','soffit','outer cylinder','inner cylinder'])
  if(!normals[surface])check(`mesh: has a ${surface} to judge`,false,{});

// Nosings mark the edge you step over, flush, at the front of each tread.
const nosings=A.measureNosings(tris);
check('mesh: every nosing is on the front edge of its tread',nosings.atNose===nosings.treads,{treads:nosings.treads,atNose:nosings.atNose,atHeel:nosings.atHeel,missing:nosings.missing});

// ── The block grid is never what you see ────────────────────────────────────
const grid=A.measureGridAgainstMesh(bvh,columns);
check('grid: no stair or landing column draws a floor above the mesh beneath it',grid.above.length===0,
  {columns:grid.above.length,worstM:+(grid.above[0]?.byM||0).toFixed(3),worst:grid.above.slice(0,3).map(({x,z,drawnFloor,byM})=>({x,z,drawnFloor:+drawnFloor.toFixed(3),byM:+byM.toFixed(3)}))});
check('grid: no stair or landing column lies outside the mesh outline',grid.outside.length===0,
  {columns:grid.outside.length,bySource:grid.outside.reduce((m,o)=>(m[o.source]=(m[o.source]||0)+1,m),{})});
{
  const well=A.measureStairwellGrid(columns);
  check('grid: inside the stairwell every column is one air span from its floor to its roof',well.columns>0&&well.bad.length===0,
    {columns:well.columns,bad:well.bad.length,worst:well.bad.slice(0,3)});
}
check('grid: no column is solid where the mesh shows air under the stair',grid.underSoffit.length===0,
  {columns:grid.underSoffit.length,worstM:+(grid.underSoffit[0]?.byM||0).toFixed(2),medianM:+(grid.underSoffit[grid.underSoffit.length>>1]?.byM||0).toFixed(2)});

// ── Landings meet their flights ─────────────────────────────────────────────
// On the landing side of every radial line where a flight starts or finishes,
// something must be drawn at the landing's height, with air above it. Landings
// are built at the height the eight-bit grid draws that floor (4.8 m exactly,
// 10 m at 9.945 m), so they meet the room floors flush; that drawn height is
// the target. A floor with a built landing must be met by the MESH there. The
// ground has no built landing: the stairwell floor the grid draws is the
// landing, and no mesh may stand above it.
const built=A.STAIR.revision>=4?A.STAIR.flights&&[4.8,10]:[];
for(const seam of A.measureLandingSeams(bvh,columns)){
  const target=A.drawnHeight(seam.height),hasBuilt=built.includes(seam.height);
  const judged=seam.rows.map((r)=>{
    const col=A.gridColumnAt(columns,r.x,r.z),open=!!col?.spans.some((s)=>s.drawnFloor<=target+.001&&s.drawnCeil>=target+2);
    const meshOk=hasBuilt?r.mesh!=null&&Math.abs(r.mesh-target)<=.001:(r.mesh==null||r.mesh<=target+.001);
    const gridOk=hasBuilt||col?.spans.some((s)=>Math.abs(s.drawnFloor-target)<=.001);
    return{...r,open,meshOk:meshOk&&gridOk};
  });
  const bad=judged.filter((r)=>!r.meshOk||!r.open);
  check(`landing: ${seam.flight} ${seam.end} meets ${hasBuilt?'a built landing':'the stairwell floor'} within 1 mm of ${target.toFixed(3)} m, open above`,bad.length===0,
    {samples:judged.length,wrongSurface:judged.filter((r)=>!r.meshOk).length,gridBlocksHeadroom:judged.filter((r)=>!r.open).length,
      worst:bad.slice(0,2).map((r)=>({r:+r.r.toFixed(2),mesh:r.mesh==null?null:+r.mesh.toFixed(4),grid:r.grid==null?null:+r.grid.toFixed(4),gridSource:r.gridSource,open:r.open}))});
}

// Where a built landing meets a floor the grid draws, the two are level. The
// grid's floors are eight-bit (32/255 m), so this is also the check that every
// landing height is one the grid can draw.
{
  const levels=[0,4.8,10],step=.1,B=A.STAIR_BOUNDS,worst=[];
  for(const level of levels){
    for(let x=B.x0+step/2;x<B.x1;x+=step)for(let z=B.z0+step/2;z<B.z1;z+=step){
      // Walkable finish within two centimetres of the level: a landing, not
      // a rail cap or a newel that happens to be near it.
      const drawn=A.drawnHeight(level);
      const hit=A.meshUpHitBelow(bvh,x,level+.2,z,.4);if(!hit||hit.material!=='warm terrazzo'||Math.abs(hit.y-drawn)>.02)continue;
      const mesh=hit.y;
      // The grid floor in this column or a neighbouring one, from a room.
      const px=Math.floor(x/A.CELL),pz=Math.floor(z/A.CELL);
      for(const [dx,dz] of[[0,0],[1,0],[-1,0],[0,1],[0,-1]]){
        const col=columns.find((c)=>c.px===px+dx&&c.pz===pz+dz);if(!col)continue;
        for(const s of col.spans){
          if(![A.SOURCE.HALL_GROUND,A.SOURCE.HALL_UPPER,A.SOURCE.ACADEMIC,A.SOURCE.LANDING].includes(s.source)||Math.abs(s.drawnFloor-level)>.1)continue;
          const err=Math.abs(s.drawnFloor-mesh);if(err>.001)worst.push({level,x:+x.toFixed(2),z:+z.toFixed(2),mesh:+mesh.toFixed(4),grid:+s.drawnFloor.toFixed(4),errM:+err.toFixed(4)});
        }
      }
    }
  }
  worst.sort((a,b)=>b.errM-a.errM);
  const byLevel=worst.reduce((m,w)=>(m[w.level]=Math.max(m[w.level]||0,w.errM),m),{});
  check('landing: built landings and the room floors they meet are level within 1 mm',worst.length===0,{samples:worst.length,worstByLevelM:byLevel,worst:worst.slice(0,3)});
}

// ── Standing ────────────────────────────────────────────────────────────────
// Every walkable cell around the stair stands on something drawn at its own
// height (a room floor at its eight-bit height counts), with air above it.
{
  const bad=A.measureStanding(bvh,columns);
  const groups=bad.reduce((m,c)=>{const k=`${c.owner}@${c.floor} ${c.kind}${c.inWell?' over the well':''}`;m[k]=(m[k]||0)+1;return m;},{});
  check('standing: every walkable cell near the stair stands on a surface drawn at its height',bad.length===0,{cells:bad.length,groups});
}

// ── Walking ─────────────────────────────────────────────────────────────────
const walking=A.measureWalkingLines(bvh);
const walkWorst=walking.reduce((a,b)=>b.worstM>a.worstM?b:a);
check('walking: the camera floor matches the mesh within 1 cm on every lane',walkWorst.worstM<=.01,
  {worstM:+walkWorst.worstM.toFixed(4),flight:walkWorst.flight,lane:walkWorst.lane,at:walkWorst.at});

// ── Report ──────────────────────────────────────────────────────────────────
const failed=results.filter((r)=>!r.pass);
for(const r of results)console.log(`${r.pass?'PASS':'FAIL'}  ${r.name}${r.pass?'':`\n      ${JSON.stringify(r.detail)}`}`);
console.log(`\n${results.length-failed.length}/${results.length} main stair construction checks pass`);
if(failed.length)process.exitCode=1;
