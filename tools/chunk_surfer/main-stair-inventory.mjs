// Export everything that draws inside the main stair's volume, coloured by who
// authored it, and measure where the authors disagree.
//
//   node tools/chunk_surfer/main-stair-inventory.mjs [--out=artifacts/main-stair-audit/before]
//
// Writes:
//   sources.ply        every surface in physical metres: the hero GLB, and the
//                      floor, ceiling and wall faces of every plan span, at the
//                      heights the GPU actually draws (8-bit decoded)
//   report.json        grid-vs-mesh, landing seams, walking lines, mesh hygiene,
//                      shell normals, nosings
//   section-*.svg      vertical sections: plan columns (air, solid, floor tops by
//                      source) with the mesh's own cut drawn over them
//   plan-*.svg         per-storey plans: which source draws the floor of each
//                      half-metre column, with the stair's true outline over it

import fs from 'node:fs';
import path from 'node:path';
import * as A from './main-stair-audit.mjs';

const arg=(name,fallback)=>{const hit=process.argv.find((v)=>v.startsWith(`--${name}=`));return hit?hit.slice(name.length+3):fallback;};
const OUT=path.resolve(A.ROOT,arg('out','artifacts/main-stair-audit/before'));
fs.mkdirSync(OUT,{recursive:true});
const {CELL,STAIR,SOURCE,SOURCE_COLOR}=A;

const tris=A.stairMeshTriangles(),bvh=A.buildBVH(tris),columns=A.regionColumns();
const colAt=new Map(columns.map((c)=>[`${c.px},${c.pz}`,c]));

// ── PLY ──────────────────────────────────────────────────────────────────────
const faces=[];
for(const t of tris)faces.push({points:[t.a,t.b,t.c],color:SOURCE_COLOR.mesh});
const intervals=(col)=>col?col.spans.map((s)=>[s.drawnFloor,s.drawnCeil,s]):[];
for(const col of columns){
  const {x0,z0}=col,x1=x0+CELL,z1=z0+CELL;
  for(const s of col.spans){
    const color=SOURCE_COLOR[s.source];
    faces.push({points:[[x0,s.drawnFloor,z0],[x0,s.drawnFloor,z1],[x1,s.drawnFloor,z1],[x1,s.drawnFloor,z0]],color});
    faces.push({points:[[x0,s.drawnCeil,z0],[x1,s.drawnCeil,z0],[x1,s.drawnCeil,z1],[x0,s.drawnCeil,z1]],color});
    // Walls: the parts of this span's air that the neighbour does not share.
    for(const [dx,dz] of[[1,0],[-1,0],[0,1],[0,-1]]){
      const n=colAt.get(`${col.px+dx},${col.pz+dz}`),cover=intervals(n).sort((a,b)=>a[0]-b[0]);
      let gaps=[[s.drawnFloor,s.drawnCeil]];
      for(const [f,c] of cover)gaps=gaps.flatMap(([g0,g1])=>{if(c<=g0||f>=g1)return[[g0,g1]];const out=[];if(f>g0)out.push([g0,f]);if(c<g1)out.push([c,g1]);return out;});
      for(const [g0,g1] of gaps){
        if(g1-g0<1e-4)continue;
        // A riser belongs to the span whose floor tops it, a header to the span
        // whose ceiling it hangs from; a wall onto rock belongs to this room.
        const owner=cover.find(([f])=>Math.abs(f-g1)<1e-6)?.[2]||cover.find(([,c])=>Math.abs(c-g0)<1e-6)?.[2]||s;
        const ex=dx>0?x1:dx<0?x0:null,ez=dz>0?z1:dz<0?z0:null;
        const pts=ex!=null?[[ex,g0,z0],[ex,g1,z0],[ex,g1,z1],[ex,g0,z1]]:[[x0,g0,ez],[x1,g0,ez],[x1,g1,ez],[x0,g1,ez]];
        // Face into this column.
        const inward=dx>0||dz<0;faces.push({points:inward?pts:pts.slice().reverse(),color:SOURCE_COLOR[owner.source]});
      }
    }
  }
}
A.writePly(path.join(OUT,'sources.ply'),faces);

// ── Measurements ─────────────────────────────────────────────────────────────
const grid=A.measureGridAgainstMesh(bvh,columns);
const seams=A.measureLandingSeams(bvh,columns);
const walking=A.measureWalkingLines(bvh);
const hygiene=A.meshHygiene(tris);
const normals=A.measureShellNormals(tris);
const nosings=A.measureNosings(tris);
const count=(list,key)=>list.reduce((m,o)=>{m[o[key]]=(m[o[key]]||0)+1;return m;},{});
const summary={
  generatedAt:new Date().toISOString(),stairRevision:STAIR.revision,
  heightQuantumM:32/255,
  spansBySource:columns.reduce((m,c)=>{for(const s of c.spans)m[s.source]=(m[s.source]||0)+1;return m;},{}),
  grid:{judged:grid.columnsJudged,samples:grid.samples,
    aboveMesh:{columns:grid.above.length,bySource:count(grid.above,'source'),worstM:grid.above[0]?.byM||0,worst:grid.above.slice(0,8)},
    outsideMesh:{columns:grid.outside.length,bySource:count(grid.outside,'source'),
      stairFillBeyondOuterRail:grid.outside.filter((o)=>o.source===SOURCE.STAIR_FILL&&o.r>STAIR.outerRadiusM).length,
      stairFillInsideWell:grid.outside.filter((o)=>o.source===SOURCE.STAIR_FILL&&o.r<STAIR.innerRadiusM+.25).length},
    solidUnderSoffit:{columns:grid.underSoffit.length,bySource:count(grid.underSoffit,'source'),worstM:grid.underSoffit[0]?.byM||0,
      medianM:grid.underSoffit[grid.underSoffit.length>>1]?.byM||0,worst:grid.underSoffit.slice(0,8)}},
  landingSeams:seams.map(({rows,...s})=>({...s,surfaces:rows.reduce((m,r)=>{const k=`${r.mesh!=null?'mesh':'-'}/${r.gridSource||'-'}@${r.grid!=null?r.grid.toFixed(3):'-'}`;m[k]=(m[k]||0)+1;return m;},{})})),
  walking:walking.map((w)=>({flight:w.flight,lane:w.lane,radiusM:+w.radius.toFixed(3),worstM:w.worstM,at:w.at})),
  hygiene:{...hygiene},normals,nosings,
};
fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(summary,null,2)+'\n');

// ── Drawings ─────────────────────────────────────────────────────────────────
const hex=(rgb)=>`#${rgb.map((v)=>v.toString(16).padStart(2,'0')).join('')}`;
// The mesh cut by a plane: one segment per triangle that crosses it.
function meshCut(axis,value){
  const segs=[];
  for(const t of tris){
    const p=[t.a,t.b,t.c],d=p.map((q)=>q[axis]-value),hits=[];
    for(let i=0;i<3;i++){const j=(i+1)%3;if((d[i]<0)!==(d[j]<0)){const s=d[i]/(d[i]-d[j]);hits.push(p[i].map((v,k)=>v+(p[j][k]-v)*s));}}
    if(hits.length===2)segs.push({a:hits[0],b:hits[1],material:t.material});
  }
  return segs;
}
function section({name,axis,value,title}){
  // axis 'z': cut at z=value, look north (-z), horizontal = x. axis 'x': cut
  // at x=value, look west (-x), horizontal = -z so the drawing is not mirrored.
  const S=60,B=A.STAIR_BOUNDS,y0=-1,y1=14.5,h0=axis==='z'?B.x0:-B.z1,h1=axis==='z'?B.x1:-B.z0;
  const W=(h1-h0)*S,H=(y1-y0)*S,X=(h)=>(h-h0)*S,Y=(y)=>(y1-y)*S;
  const parts=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(0)} ${(H+70).toFixed(0)}" font-family="ui-monospace,Menlo,monospace" font-size="13">`,
    `<rect width="100%" height="100%" fill="#16161a"/>`,`<text x="12" y="${H+28}" fill="#ddd">${title}</text>`];
  const cut=axis==='z'?Math.floor(value/CELL):Math.floor(value/CELL);
  for(const col of columns){
    if(axis==='z'&&col.pz!==cut)continue;if(axis==='x'&&col.px!==cut)continue;
    const ha=axis==='z'?col.x0:-(col.z0+CELL),hb=ha+CELL;
    // Solid first, then air over it, then each floor top coloured by source.
    parts.push(`<rect x="${X(ha)}" y="0" width="${CELL*S}" height="${H}" fill="#3a3a40"/>`);
    for(const s of col.spans){const top=Math.min(s.drawnCeil,y1),bot=Math.max(s.drawnFloor,y0);if(top<=bot)continue;
      parts.push(`<rect x="${X(ha)}" y="${Y(top)}" width="${CELL*S}" height="${(top-bot)*S}" fill="#0c0c0e"/>`);}
    for(const s of col.spans){
      const c=hex(SOURCE_COLOR[s.source]);
      if(s.drawnFloor>=y0&&s.drawnFloor<=y1)parts.push(`<rect x="${X(ha)}" y="${Y(s.drawnFloor)}" width="${CELL*S}" height="5" fill="${c}"/>`);
      if(s.drawnCeil>=y0&&s.drawnCeil<=y1)parts.push(`<rect x="${X(ha)}" y="${Y(s.drawnCeil)-3}" width="${CELL*S}" height="3" fill="${c}" opacity=".7"/>`);
    }
  }
  const segColor={'warm terrazzo':'#ffffff','cast concrete':'#bfbfbf','blackened steel':'#7fd0ff','aged brass':'#ffd166','dark oak':'#e09f6a','opal glass':'#fff3c4'};
  for(const s of meshCut(axis==='z'?2:0,value)){
    const ha=axis==='z'?s.a[0]:-s.a[2],hb=axis==='z'?s.b[0]:-s.b[2];
    parts.push(`<line x1="${X(ha).toFixed(1)}" y1="${Y(s.a[1]).toFixed(1)}" x2="${X(hb).toFixed(1)}" y2="${Y(s.b[1]).toFixed(1)}" stroke="${segColor[s.material]||'#fff'}" stroke-width="1.6"/>`);
  }
  for(let y=Math.ceil(y0);y<=y1;y++)parts.push(`<line x1="0" x2="10" y1="${Y(y)}" y2="${Y(y)}" stroke="#888"/><text x="14" y="${Y(y)+4}" fill="#888">${y}m</text>`);
  legend(parts,W,H);
  parts.push('</svg>');fs.writeFileSync(path.join(OUT,`${name}.svg`),parts.join('\n'));
}
function legend(parts,W,H){
  let x=12;const used=[SOURCE.STAIR_FILL,SOURCE.LANDING,SOURCE.WELL,SOURCE.HALL_GROUND,SOURCE.HALL_UPPER,SOURCE.ACADEMIC,SOURCE.OTHER];
  parts.push(`<text x="${x}" y="${H+54}" fill="#fff">mesh cut: white tread, grey concrete, blue steel, gold brass</text>`);x+=480;
  for(const s of used){parts.push(`<rect x="${x}" y="${H+44}" width="12" height="12" fill="${hex(SOURCE_COLOR[s])}"/><text x="${x+16}" y="${H+54}" fill="#ddd">${s}</text>`);x+=s.length*8+40;}
}
function plan({name,lo,hi,title,cutHeights}){
  const S=48,B=A.STAIR_BOUNDS,W=(B.x1-B.x0)*S,H=(B.z1-B.z0)*S,X=(x)=>(x-B.x0)*S,Z=(z)=>(z-B.z0)*S;
  const parts=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(0)} ${(H+70).toFixed(0)}" font-family="ui-monospace,Menlo,monospace" font-size="12">`,
    `<rect width="100%" height="100%" fill="#16161a"/>`,`<text x="12" y="${H+28}" fill="#ddd">${title}</text>`];
  for(const col of columns){
    const inBand=col.spans.filter((s)=>s.drawnFloor>=lo&&s.drawnFloor<hi);
    if(!inBand.length){if(!col.spans.length)parts.push(`<rect x="${X(col.x0)}" y="${Z(col.z0)}" width="${CELL*S}" height="${CELL*S}" fill="#3a3a40"/>`);continue;}
    const top=inBand.reduce((a,b)=>b.drawnFloor>a.drawnFloor?b:a);
    parts.push(`<rect x="${X(col.x0)}" y="${Z(col.z0)}" width="${CELL*S-1}" height="${CELL*S-1}" fill="${hex(SOURCE_COLOR[top.source])}" opacity=".85"/>`);
    parts.push(`<text x="${X(col.x0)+2}" y="${Z(col.z0)+CELL*S/2+4}" fill="#000" font-size="9">${top.drawnFloor.toFixed(2)}</text>`);
  }
  // The mesh cut at a few heights inside the band shows its true plan.
  for(const h of cutHeights)for(const s of meshCut(1,h))
    parts.push(`<line x1="${X(s.a[0]).toFixed(1)}" y1="${Z(s.a[2]).toFixed(1)}" x2="${X(s.b[0]).toFixed(1)}" y2="${Z(s.b[2]).toFixed(1)}" stroke="#fff" stroke-width="1.2"/>`);
  for(const r of[STAIR.innerRadiusM,STAIR.outerRadiusM,STAIR.collisionOuterRadiusM])
    parts.push(`<circle cx="${X(STAIR.center.x)}" cy="${Z(STAIR.center.z)}" r="${r*S}" fill="none" stroke="${r===STAIR.collisionOuterRadiusM?'#ff5d8f':'#ffffff'}" stroke-dasharray="${r===STAIR.collisionOuterRadiusM?'6 4':'none'}" stroke-width="1.5"/>`);
  for(let x=Math.ceil(B.x0);x<=B.x1;x++)parts.push(`<text x="${X(x)+2}" y="12" fill="#777" font-size="10">${x}</text>`);
  for(let z=Math.ceil(B.z0);z<=B.z1;z++)parts.push(`<text x="2" y="${Z(z)+4}" fill="#777" font-size="10">${z}</text>`);
  legend(parts,W,H);parts.push('</svg>');fs.writeFileSync(path.join(OUT,`${name}.svg`),parts.join('\n'));
}
section({name:'section-z36',axis:'z',value:36.25,title:'Section through the well at z=36.25, looking north. Columns: dark=air, grey=solid; bars=floor tops (thick) and ceilings (thin) by source. Lines: the hero mesh cut.'});
section({name:'section-x63',axis:'x',value:63.25,title:'Section through the well at x=63.25, looking west.'});
plan({name:'plan-ground',lo:-.5,hi:2.45,title:'Floors drawn between -0.5 and 2.4 m (ground hall and the first half-turn). White: the mesh cut at 0.9 and 1.8 m.',cutHeights:[.9,1.8]});
plan({name:'plan-mid-lower',lo:2.4,hi:4.79,title:'Floors drawn between 2.4 and 4.8 m (second half-turn).',cutHeights:[3.3,4.2]});
plan({name:'plan-upper',lo:4.79,hi:7.4,title:'Floors drawn between 4.8 and 7.4 m (upper landing, third half-turn). Mesh cut at 4.81 and 6.1 m.',cutHeights:[4.81,6.1]});
plan({name:'plan-academic',lo:7.4,hi:10.2,title:'Floors drawn between 7.4 and 10.2 m (fourth half-turn, academic head). Mesh cut at 8.7 and 10.01 m.',cutHeights:[8.7,10.01]});

console.log(`wrote ${path.relative(A.ROOT,OUT)}: ${faces.length} faces`);
console.log(JSON.stringify({grid:{above:summary.grid.aboveMesh.columns,worstAboveM:+summary.grid.aboveMesh.worstM.toFixed(3),outside:summary.grid.outsideMesh,
  underSoffit:summary.grid.solidUnderSoffit.columns,medianUnderM:+summary.grid.solidUnderSoffit.medianM.toFixed(2)},
  seams:summary.landingSeams.map((s)=>`${s.flight}:${s.end} ${s.pass?'pass':'FAIL'} ${s.worstM.toFixed(4)}`),
  walkingWorstM:Math.max(...walking.map((w)=>w.worstM)),
  hygiene:{boundary:hygiene.boundary,nonManifold:hygiene.nonManifold,tJunctions:hygiene.tJunctions,overlaps:hygiene.overlaps},
  soffitNormalMaxDeg:+normals.soffit?.max.toFixed(1),nosings},null,1));
