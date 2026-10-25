// CPU clearance proof, not a native controls or perceptual signoff.
// Usage: node tools/chunk_surfer/audit-exterior-escape.mjs [report.json]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import * as FP from '../../src/world/floorplan.js';
import * as PROPS from '../../src/game/props.js';
import {conservatory} from '../../src/data/floorplan/conservatory.js';
import {isExteriorObserver} from '../../src/game/prop-visibility.js';
import {slideBlockedPropStep} from '../../src/world/prop-body-contact.js';
import {EXTERIOR_PUB} from '../../src/data/exterior-pub.js';
import {EXTERIOR_COLLISION_ASSETS} from './build-exterior-collision.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const sources=[
  'src/world/floorplan.js','src/world/exterior-facade-collision.js','src/world/prop-body-contact.js',
  'src/game/props.js','src/game/prop-visibility.js','src/data/floorplan/conservatory.js',
  'src/data/conservatory-props.js','src/data/exterior-district.js','src/data/exterior-pub.js',
  'src/data/exterior-pub-furnishings.js','src/data/exterior-vigil.js','src/data/generated/exterior-collision.js',
  'src/data/generated/prop-geometry.js','tools/chunk_surfer/audit-exterior-escape.mjs',
  ...EXTERIOR_COLLISION_ASSETS.map(s=>s.asset),
];
const fingerprint=()=>Object.fromEntries(sources.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));

export function auditExteriorEscape({onProgress=null}={}){
  const started=performance.now(),before=fingerprint();
  FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
  PROPS.setColliderGroupEnabled('opening-street',true);PROPS.setColliderGroupEnabled('street-pilot',true);
  for(const door of EXTERIOR_PUB.doors)FP.setDoorOpen(door.id,true);
  const outside=p=>isExteriorObserver({zone:FP.zoneAt(p.x,p.y)});
  const key=p=>`${p.x},${p.y}`;
  const body=p=>{const w=FP.logicalToPhysical(p.x,p.y);return{x:(w.x+.5)*.5,z:(w.z+.5)*.5,feet:FP.floorAt(p.x,p.y)};};
  const canStep=(ax,ay,bx,by)=>FP.canStep(ax,ay,bx,by,{keys:new Set()});
  const canOccupy=(x,y,options)=>PROPS.propCanOccupy(x,y,options);
  const move=(p,dx,dy)=>{
    if(dx&&dy){
      const ax=canStep(p.x,p.y,p.x+dx,p.y).ok,ay=canStep(p.x,p.y,p.x,p.y+dy).ok;
      if(!(ax&&ay)){if(ax)dy=0;else if(ay)dx=0;else return null;}
    }
    let step=canStep(p.x,p.y,p.x+dx,p.y+dy);if(!step.ok)return null;
    let q=step.redirect||{x:p.x+dx,y:p.y+dy};
    if(!outside(q))return null;
    if(!canOccupy(q.x,q.y,{from:p})){
      const slide=slideBlockedPropStep({from:p,dx,dy,canStep,canOccupy});
      if(!slide)return null;step=slide.move;q=step.redirect||{x:p.x+slide.dx,y:p.y+slide.dy};
      if(!outside(q))return null;
    }
    return q;
  };
  const start={x:conservatory.spawn.x*2,y:conservatory.spawn.y*2};
  if(!outside(start)||FP.isSolid(start.x,start.y)||!canOccupy(start.x,start.y))throw Error('The actual opening spawn is not clear');
  const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]],queue=[start];
  const seen=new Set([key(start)]),back=new Map(),edges=[],deadEnds=[];
  for(let i=0;i<queue.length;i++){
    if(i>=100000)throw Error('Exterior graph exceeded its bounded domain');
    const p=queue[i],pk=key(p),destinations=new Map();
    for(const [dx,dy] of dirs){const q=move(p,dx,dy);if(q)destinations.set(key(q),q);}
    if(destinations.size<=1)deadEnds.push({logical:p,physical:body(p),exits:destinations.size});
    for(const [qk,q] of destinations){
      edges.push(`${pk}>${qk}`);if(!back.has(qk))back.set(qk,[]);back.get(qk).push(pk);
      if(!seen.has(qk)){seen.add(qk);queue.push(q);}
    }
    if(onProgress&&i%5000===0)onProgress({visited:i,discovered:queue.length});
  }
  const returned=new Set([key(start)]),reverse=[key(start)];
  for(let i=0;i<reverse.length;i++)for(const p of back.get(reverse[i])||[])if(!returned.has(p)){returned.add(p);reverse.push(p);}
  const traps=queue.filter(p=>!returned.has(key(p))).map(p=>({logical:p,physical:body(p)}));
  const after=fingerprint(),changedSources=sources.filter(file=>before[file]!==after[file]);
  return{
    kind:'exterior-escape-clearance-audit',version:1,passed:traps.length===0&&changedSources.length===0,
    controls:'Eight ordinary half-metre grid requests; floorplan corner slides, physical seam redirects, prop/facade sweeps and checked prop-contact slides',
    fixture:'Actual opening spawn, setup/progression gates excluded, both optional exterior packs active, both ordinary pub entry doors open',
    limits:['CPU collision reachability only; no browser or GPU used','Does not prove native handling, perceived route clarity, timed door events or dynamic character collision'],
    start:{logical:start,physical:body(start)},reachableCells:queue.length,returnableCells:returned.size,
    uniqueDirectedEdges:edges.length,graphSha256:sha(edges.sort().join('\n')),trappedCells:traps,
    oneExitPockets:deadEnds,elapsedMs:Math.round(performance.now()-started),sourceSha256:before,changedSources,
  };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=auditExteriorEscape({onProgress:p=>process.stderr.write(`${JSON.stringify(p)}\n`)});
  if(process.argv[2]){
    const destination=path.resolve(process.argv[2]);fs.mkdirSync(path.dirname(destination),{recursive:true});
    fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n');
  }
  console.log(JSON.stringify({passed:report.passed,reachableCells:report.reachableCells,returnableCells:report.returnableCells,
    trappedCells:report.trappedCells.length,changedSources:report.changedSources,elapsedMs:report.elapsedMs}));
  if(!report.passed)process.exitCode=1;
}
