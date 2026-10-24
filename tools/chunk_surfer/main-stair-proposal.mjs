// Drawings for the main stair rebuild proposal: a plan per storey and the
// developed (unrolled) sides and rails. Nothing here changes the game; it draws
// the current stair, what the plan lets you stand on, and the proposed square
// stairwell, landings and guards over them.
//
//   node tools/chunk_surfer/main-stair-proposal.mjs [--out=artifacts/main-stair-audit/proposal]

import fs from 'node:fs';
import path from 'node:path';
import * as A from './main-stair-audit.mjs';

const arg=(name,fallback)=>{const hit=process.argv.find((v)=>v.startsWith(`--${name}=`));return hit?hit.slice(name.length+3):fallback;};
const OUT=path.resolve(A.ROOT,arg('out','artifacts/main-stair-audit/proposal'));
fs.mkdirSync(OUT,{recursive:true});
const {STAIR,CELL,FP}=A,C=STAIR.center,RI=STAIR.innerRadiusM,RO=STAIR.outerRadiusM,DEG=Math.PI/180;
const at=(deg,r)=>[C.x+Math.sin(deg*DEG)*r,C.z-Math.cos(deg*DEG)*r];
const arc=(r,from,to,n=48)=>Array.from({length:n+1},(_,i)=>at(from+(to-from)*i/n,r));
// Where a radial line from the centre leaves the square.
const toSquare=(deg,sq)=>{const s=Math.sin(deg*DEG),c=-Math.cos(deg*DEG);let best=Infinity;
  for(const [v,axis] of[[sq.x0,0],[sq.x1,0],[sq.z0,1],[sq.z1,1]]){const d=axis===0?s:c,o=axis===0?C.x:C.z;if(Math.abs(d)<1e-9)continue;const t=(v-o)/d;if(t<=0)continue;
    const p=[C.x+s*t,C.z+c*t];if(p[0]>=sq.x0-1e-6&&p[0]<=sq.x1+1e-6&&p[1]>=sq.z0-1e-6&&p[1]<=sq.z1+1e-6)best=Math.min(best,t);}return at(deg,best);};

// ── The proposal, as data ────────────────────────────────────────────────────
const F=STAIR.flights,riseDeg=(f)=>f.sweep/f.rises/DEG;
const SQUARE={x0:60,x1:66,z0:33,z1:39};
const f3FirstRiser=F[2].theta0/DEG+riseDeg(F[2]);           // 112.86°: F3's tread 0 is landing
const f4Start=F[3].theta0/DEG;                               // 280°
const f4End=(F[3].theta0+F[3].sweep)/DEG-360;                // 100°
export const PROPOSAL={
  square:SQUARE,
  levels:[
    {id:'ground',height:0,drawn:A.drawnHeight(0),landing:null,
      note:'No built landing: the stairwell floor is the ground floor, drawn by the grid across the whole square. The first tread is the floor; the first riser rises from it.',
      guards:[]},
    {id:'upper',height:4.8,drawn:A.drawnHeight(4.8),
      // Quarter landing: from flight 2's arrival line (0°) round to flight 3's
      // first riser, out to the square's north and east edges, and down the
      // east edge to the walkable band that already ends at z 37.5.
      landing:[[63,SQUARE.z0],[SQUARE.x1,SQUARE.z0],[SQUARE.x1,37.5],
        ...arc(RO,180-Math.acos((37.5-C.z)/RO)/DEG,f3FirstRiser,8),
        at(f3FirstRiser,RI),...arc(RI,f3FirstRiser,0,24),[63,C.z-RO]],
      guards:[arc(RI,0,f3FirstRiser,24),[[SQUARE.x1,37.5],[SQUARE.x1,SQUARE.z1]],[[SQUARE.x1,SQUARE.z1],[SQUARE.x0,SQUARE.z1]],[[63,SQUARE.z0],[63,C.z-RO]]],
      note:'Quarter landing in the north-east corner. Meets the hall floor along x 66 and the hall wall along z 33; open to the well on a curved edge that carries the inner rail round.'},
    {id:'academic',height:10,drawn:A.drawnHeight(10),
      // Half landing: from flight 4's arrival (100°) clockwise through south to
      // flight 4's start line (280°), out to the square's edges.
      landing:[toSquare(f4End,SQUARE),[SQUARE.x1,SQUARE.z1],[SQUARE.x0,SQUARE.z1],toSquare(f4Start,SQUARE),
        at(f4Start,RI),...arc(RI,f4Start,f4End,32),at(f4End,RI)],
      guards:[arc(RI,f4End,f4Start,32),[at(f4Start,RI),toSquare(f4Start,SQUARE)],[toSquare(f4Start,SQUARE),[SQUARE.x0,SQUARE.z0]],
        [[SQUARE.x0,SQUARE.z0],[SQUARE.x1,SQUARE.z0]],[[SQUARE.x1,SQUARE.z0],toSquare(f4End,SQUARE)]],
      note:'Half landing across the south, over flight 3. Flight 4 rises through the open north half; guards run along every floor edge that meets it.'},
  ],
};

function pointInPolygon([x,z],poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,zi]=poly[i],[xj,zj]=poly[j];if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)inside=!inside;}return inside;}

// Walkable cells at a level, and what the proposal would put under each.
function walkable(level){
  const {plan}=A.compileConservatory(),out=[];
  for(let y=0;y<plan.h;y++)for(let x=0;x<plan.w;x++){
    const i=y*plan.w+x;if(plan.solid[i]||plan.collisionOnly?.[i]||Math.abs(plan.floor[i]-level.height)>.01)continue;
    const run=plan.flightId[i]?plan.stairRuns[plan.flightId[i]-1]:null;if(run?.analyticHelix)continue;
    const p=FP.logicalToPhysical(x,y),cx=p.x*CELL+CELL/2,cz=p.z*CELL+CELL/2;
    if(cx<SQUARE.x0-3||cx>SQUARE.x1+3||cz<SQUARE.z0-3||cz>SQUARE.z1+3)continue;
    const inSquare=cx>SQUARE.x0&&cx<SQUARE.x1&&cz>SQUARE.z0&&cz<SQUARE.z1,r=Math.hypot(cx-C.x,cz-C.z);
    let status='floor';
    if(inSquare){
      if(level.landing)status=pointInPolygon([cx,cz],level.landing)?'landing':'void';
      else{
        // Ground: the stairwell floor is everywhere, but not inside a tread.
        let a=Math.atan2(cx-C.x,-(cz-C.z))/DEG;if(a<0)a+=360;
        const tread=r>=RI&&r<=RO&&a>=riseDeg(F[0])&&a<=180;status=tread?'inside a tread':'stairwell floor';
      }
    }
    out.push({x,y,cx,cz,owner:plan.owner[i],status});
  }
  return out;
}

// ── Drawing ─────────────────────────────────────────────────────────────────
const S=56,B={x0:56,x1:70.5,z0:29,z1:43},W=(B.x1-B.x0)*S,H=(B.z1-B.z0)*S,X=(x)=>((x-B.x0)*S).toFixed(1),Z=(z)=>((z-B.z0)*S).toFixed(1);
const poly=(pts)=>pts.map(([x,z])=>`${X(x)},${Z(z)}`).join(' ');
function plan(level){
  const columns=A.regionColumns(),cells=walkable(level),parts=[];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H+96}" font-family="ui-monospace,Menlo,monospace" font-size="13">`,`<rect width="100%" height="100%" fill="#141417"/>`);
  // Rooms at this level today: grey where nothing is open at head height.
  for(const col of columns){
    if(col.x0<B.x0||col.x0>=B.x1||col.z0<B.z0||col.z0>=B.z1)continue;
    const open=col.spans.some((s)=>s.floor<=level.height+.5&&s.ceil>=level.height+1.5);
    if(!open)parts.push(`<rect x="${X(col.x0)}" y="${Z(col.z0)}" width="${CELL*S}" height="${CELL*S}" fill="#33333a"/>`);
  }
  const fill={floor:'#2b4a6b',landing:'#3d6b2b','stairwell floor':'#2b4a6b',void:'#b3261e','inside a tread':'#b3261e'};
  for(const c of cells)parts.push(`<rect x="${X(c.cx-CELL/2+.04)}" y="${Z(c.cz-CELL/2+.04)}" width="${(CELL-.08)*S}" height="${(CELL-.08)*S}" fill="${fill[c.status]}" opacity=".8"/>`);
  // The stair: both rails' circles and every riser line of the flights that
  // pass within two metres of this level.
  for(const r of[RI,RO])parts.push(`<circle cx="${X(C.x)}" cy="${Z(C.z)}" r="${r*S}" fill="none" stroke="#e6e6e6" stroke-width="1.5"/>`);
  for(const f of F){
    if(f.toH<level.height-2.6||f.fromH>level.height+2.6)continue;
    const near=Math.abs((f.fromH+f.toH)/2-level.height)<2.5;
    for(let i=0;i<=f.rises;i++){const a=(f.theta0+f.sweep*i/f.rises)/DEG,[x0,z0]=at(a,RI),[x1,z1]=at(a,RO);
      parts.push(`<line x1="${X(x0)}" y1="${Z(z0)}" x2="${X(x1)}" y2="${Z(z1)}" stroke="#e6e6e6" stroke-width="${i===0||i===f.rises?2.2:.8}" opacity="${near?1:.35}"/>`);}
    const [lx,lz]=at((f.theta0+f.sweep/2)/DEG,(RI+RO)/2);
    parts.push(`<text x="${X(lx)}" y="${Z(lz)}" fill="#fff" font-size="12" text-anchor="middle">${f.fromH.toFixed(1)}→${f.toH.toFixed(1)}</text>`);
  }
  // The proposal.
  parts.push(`<rect x="${X(SQUARE.x0)}" y="${Z(SQUARE.z0)}" width="${(SQUARE.x1-SQUARE.x0)*S}" height="${(SQUARE.z1-SQUARE.z0)*S}" fill="none" stroke="#5ad1ff" stroke-width="2.5" stroke-dasharray="10 6"/>`);
  if(level.landing)parts.push(`<polygon points="${poly(level.landing)}" fill="#ffa600" fill-opacity=".28" stroke="#ffa600" stroke-width="2.5"/>`);
  for(const g of level.guards)parts.push(`<polyline points="${poly(g)}" fill="none" stroke="#ffe066" stroke-width="5" stroke-linecap="round"/>`);
  for(let x=Math.ceil(B.x0);x<=B.x1;x++)parts.push(`<text x="${+X(x)+2}" y="12" fill="#777" font-size="10">${x}</text>`);
  for(let z=Math.ceil(B.z0);z<=B.z1;z++)parts.push(`<text x="2" y="${+Z(z)+4}" fill="#777" font-size="10">${z}</text>`);
  const counts=cells.reduce((m,c)=>(m[c.status]=(m[c.status]||0)+1,m),{});
  const legend=[['#5ad1ff','proposed stairwell (square opening)'],['#ffa600','proposed built landing'],['#ffe066','proposed guard'],['#2b4a6b','walkable, on a floor'],['#3d6b2b','walkable, on the new landing'],['#b3261e','walkable today, over void or inside a tread under the proposal'],['#33333a','closed at head height today']];
  legend.forEach(([c,t],k)=>{const lx=12+(k%3)*(W/3),ly=H+20+Math.floor(k/3)*22;parts.push(`<rect x="${lx}" y="${ly-11}" width="14" height="14" fill="${c}"/><text x="${lx+20}" y="${ly}" fill="#ddd">${t}</text>`);});
  parts.push(`<text x="12" y="${H+88}" fill="#fff">${level.id} floor ${level.height} m (drawn ${level.drawn.toFixed(3)} m) — ${JSON.stringify(counts)}</text>`);
  parts.push('</svg>');
  fs.writeFileSync(path.join(OUT,`plan-${level.id}.svg`),parts.join('\n'));
  return{level:level.id,counts,conflicts:cells.filter((c)=>c.status==='void'||c.status==='inside a tread').map(({x,y,cx,cz,owner,status})=>({x,y,cx:+cx.toFixed(2),cz:+cz.toFixed(2),owner,status}))};
}

// ── Developed sides ─────────────────────────────────────────────────────────
// Unrolled at a fixed radius, a helix is a straight line, so every bend in
// these drawings is a bend on screen: the pitch change at each landing, and
// the steps where today's rails stop at newels and start again.
function developed(){
  const radii=[['inner',RI],['outer',RO]],SX=46,SY=46,pad=40;
  // Cumulative bearing through the run: F1 0→180, F2 180→360, landing to
  // F3's start at 460, F3 460→640, F4 640→820, then the head.
  const segs=[];let cum=0;
  F.forEach((f,i)=>{const a0=f.theta0/DEG,start=i===0?0:(()=>{let s=a0;while(s<cum-1e-6)s+=360;return s;})();
    if(start>cum+1e-6)segs.push({kind:'landing',from:cum,to:start,h:f.fromH});segs.push({kind:'flight',f,from:start,to:start+f.sweep/DEG});cum=start+f.sweep/DEG;});
  segs.push({kind:'landing',from:cum,to:cum+60,h:F.at(-1).toH});
  const maxLen=cum+60,parts=[],rows=[];
  const totalW=maxLen*DEG*RO*SX+pad*2,rowH=12*SY+pad;
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW.toFixed(0)} ${(rowH*2+60).toFixed(0)}" font-family="ui-monospace,Menlo,monospace" font-size="13">`,`<rect width="100%" height="100%" fill="#141417"/>`);
  radii.forEach(([name,r],row)=>{
    const oy=row*rowH+pad,X=(deg)=>(pad+deg*DEG*r*SX).toFixed(1),Y=(h)=>(oy+(11.5-h)*SY).toFixed(1);
    parts.push(`<text x="${pad}" y="${oy-12}" fill="#fff">${name} side, r = ${r} m, unrolled (1 m = ${SX}px both ways)</text>`);
    for(let h=0;h<=11;h++)parts.push(`<line x1="${pad-8}" x2="${X(maxLen)}" y1="${Y(h)}" y2="${Y(h)}" stroke="#2a2a30"/><text x="4" y="${+Y(h)+4}" fill="#777" font-size="10">${h}</text>`);
    const tread=[],soffit=[],railNow=[],railNew=[];
    for(const s of segs){
      if(s.kind==='landing'){tread.push([s.from,s.h],[s.to,s.h]);soffit.push([s.from,s.h-.25],[s.to,s.h-.25]);railNew.push([s.from,s.h+STAIR.handrailHeightM],[s.to,s.h+STAIR.handrailHeightM]);continue;}
      const f=s.f,rise=(f.toH-f.fromH)/f.rises,da=(s.to-s.from)/f.rises;
      for(let i=0;i<f.rises;i++){const a=s.from+da*i,h=f.fromH+rise*i;tread.push([a,h],[a+da,h]);tread.push([a+da,h+rise]);}
      const slab=STAIR.slabDepthM;soffit.push([s.from,f.fromH-slab-rise],[s.to,f.toH-slab-rise]);
      railNow.push(null,[s.from,f.fromH+STAIR.handrailHeightM],[s.to,f.toH+STAIR.handrailHeightM]);
      railNew.push([s.from,f.fromH+STAIR.handrailHeightM],[s.to,f.toH+STAIR.handrailHeightM]);
    }
    const line=(pts,stroke,w,dash='')=>{let d='',pen=false;for(const p of pts){if(!p){pen=false;continue;}d+=`${pen?'L':'M'}${X(p[0])},${Y(p[1])} `;pen=true;}parts.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" ${dash?`stroke-dasharray="${dash}"`:''}/>`);};
    line(tread,'#ffffff',1.6);line(soffit,'#9a9aa3',1.4);
    line(railNow,'#e09f6a',3);
    // Proposed: one continuous rail, eased through every change of pitch with
    // a cubic over a quarter metre either side, measured along the developed
    // length at this radius.
    // Flights that meet end to end repeat their shared point; drop repeats so a
    // continuous helix is not mistaken for a change of pitch.
    const rail=railNew.filter((p,k)=>k===0||Math.hypot(p[0]-railNew[k-1][0],p[1]-railNew[k-1][1])>1e-9);
    const ease=[],e=.3/(r*DEG);
    for(let k=0;k<rail.length;k++){
      const p=rail[k],prev=rail[k-1],next=rail[k+1];
      if(!prev||!next){ease.push(p);continue;}
      const s1=(p[1]-prev[1])/((p[0]-prev[0])||1),s2=(next[1]-p[1])/((next[0]-p[0])||1);
      if(Math.abs(s1-s2)<1e-9){continue;}
      const a=[p[0]-e,p[1]-s1*e],b=[p[0]+e,p[1]+s2*e];
      for(let t=0;t<=1;t+=1/12){const u=1-t;ease.push([u*u*a[0]+2*u*t*p[0]+t*t*b[0],u*u*a[1]+2*u*t*p[1]+t*t*b[1]]);}
    }
    line([rail[0],...ease,rail.at(-1)].filter(Boolean),'#5ad1ff',2,'7 4');
    // Today's newel posts: one at each end of every flight, so two stand in the
    // same place wherever flights meet end to end.
    for(const sg of segs)if(sg.kind==='flight')for(const [a,h] of[[sg.from,sg.f.fromH],[sg.to,sg.f.toH]])
      parts.push(`<line x1="${X(a)}" x2="${X(a)}" y1="${Y(h)}" y2="${Y(h+1.16)}" stroke="#e09f6a" stroke-width="5" opacity=".7"/>`);
    const pitch=(f)=>Math.atan2(f.toH-f.fromH,f.sweep*r)/DEG;
    rows.push({side:name,radius:r,pitchDeg:F.map((f)=>+pitch(f).toFixed(1)),goingAtRadiusM:F.map((f)=>+(f.sweep/f.rises*r).toFixed(3))});
    segs.forEach((s)=>{if(s.kind!=='flight')return;parts.push(`<text x="${X((s.from+s.to)/2)}" y="${Y(s.f.toH+1.6)}" fill="#ddd" text-anchor="middle">${s.f.id} pitch ${pitch(s.f).toFixed(1)}°</text>`);});
  });
  parts.push(`<text x="${pad}" y="${rowH*2+40}" fill="#ddd">white: treads and risers · grey: soffit · copper: today's rails (stop at each flight end) · blue dashed: proposed continuous rail, eased through every pitch change</text>`);
  parts.push('</svg>');fs.writeFileSync(path.join(OUT,'developed.svg'),parts.join('\n'));
  return rows;
}

const report={generatedAt:new Date().toISOString(),square:SQUARE,levels:PROPOSAL.levels.map((l)=>({id:l.id,height:l.height,drawn:l.drawn,note:l.note})),
  plans:PROPOSAL.levels.map(plan),developed:developed()};
fs.writeFileSync(path.join(OUT,'proposal.json'),JSON.stringify(report,null,2)+'\n');
for(const p of report.plans)console.log(p.level,JSON.stringify(p.counts),'conflicts',p.conflicts.length);
console.log(JSON.stringify(report.developed));
