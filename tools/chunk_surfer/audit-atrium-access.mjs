// Compiled body/door route evidence. This does not claim rendered playtesting.
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {conservatory} from '../../src/data/floorplan/conservatory.js';
import * as FP from '../../src/world/floorplan.js';
import * as PROPS from '../../src/game/props.js';
import {ZONE} from '../../src/data/floorplan/legend.js';
import {BUILDING_AMENITY_SURVEY_NODES,BUILDING_AMENITY_PROPS} from '../../src/data/building-amenities.js';

const bodyPoint=({x,y})=>({x:Math.round((x-.25)*2),y:Math.round((y-.25)*2)});
const survey=id=>bodyPoint(BUILDING_AMENITY_SURVEY_NODES.find(p=>p.id===id));
const standard=BUILDING_AMENITY_PROPS.find(p=>p.id==='amenity-standard-wc');
const standardApproach=bodyPoint({x:standard.x-Math.sin(standard.yaw),y:standard.y+Math.cos(standard.yaw)});

export const ATRIUM_ROUTE_TARGETS=Object.freeze([
  {id:'scene-dock',at:{x:147,y:27},door:'dock-foyer-service'},
  {id:'large-wc',at:survey('public-wc-large-interior'),door:'public-wc-large'},
  {id:'standard-wc',at:standardApproach,door:'public-wc-standard'},
  {id:'washroom',at:survey('public-wc-main-wash')},
  {id:'box-office',at:{x:188,y:21},door:'foh-office'},
  {id:'hall-stage-service',at:{x:208,y:21},door:'hall-stage-service'},
  {id:'hall-public',at:{x:199,y:49},door:'hall-vestibule'},
  {id:'greenhouse',at:{x:168,y:34},door:'pool-lobby'},
  {id:'sealed-public-front-approach',at:{x:158,y:9}},
]);
const key=({x,y})=>`${x},${y}`;
export function compileAtriumAccess(){
  FP.compile(conservatory.levels,{...conservatory});PROPS.propsInit(FP);
  PROPS.setColliderGroupEnabled('glass-court',true);
  for(const id of ['dock-foyer-service','public-wc-large','public-wc-standard','foh-office','hall-stage-service','hall-vestibule','pool-lobby'])FP.setDoorOpen(id,true);
}
export function atriumBodyRoute(start,finish){
  if(FP.isSolid(start.x,start.y)||!PROPS.propCanOccupy(start.x,start.y))return null;
  const visited=new Map([[key(start),null]]),queue=[start];
  for(let i=0;i<queue.length;i++){
    const from=queue[i];if(key(from)===key(finish))break;
    for(const[dx,dy]of[[1,0],[0,1],[-1,0],[0,-1]]){
      const wanted={x:from.x+dx,y:from.y+dy};
      const step=FP.canStep(from.x,from.y,wanted.x,wanted.y,{keys:new Set(['master'])});
      if(!step.ok)continue;const to=step.redirect||wanted,k=key(to);
      if(to.x<145||to.x>213||to.y<4||to.y>65||visited.has(k)
        ||FP.zoneAt(to.x,to.y)===ZONE.civicCourt
        ||!PROPS.propCanOccupy(to.x,to.y,{from}))continue;
      visited.set(k,{from,dx,dy,to});queue.push(to);
    }
  }
  if(!visited.has(key(finish)))return null;
  const path=[];let here=finish;
  while(key(here)!==key(start)){const edge=visited.get(key(here));path.push(edge);here=edge.from;}
  return path.reverse();
}
export function atriumAccessReport(){
  compileAtriumAccess();const start={x:150,y:27};
  const routes=ATRIUM_ROUTE_TARGETS.map(target=>{
    const path=atriumBodyRoute(start,target.at),back=path&&atriumBodyRoute(target.at,start);
    const throughDoor=!target.door||!!path?.some(e=>FP.doorAt(e.to.x,e.to.y)?.id===target.door);
    return{...target,reachable:!!path,returnable:!!back,throughDoor,metres:path?path.length*.5:null,path};
  });
  const rearAisle=[];
  // Twenty-one metres of clear cross aisle, four half-metre body rows deep.
  for(let x=150;x<=193;x++)for(let y=24;y<=27;y++){
    if(FP.isSolid(x,y)||!PROPS.propCanOccupy(x,y))rearAisle.push({x,y});
  }
  return{method:'Actual compiled FP.canStep + PROPS.propCanOccupy with loaded glass-court collision, cardinal ordinary-body routes, master key and explicitly opened test leaves. No noclip. CPU proof, not native traversal.',
    start,routes,rearAisle:{widthMetres:2,lengthMetres:22,blocked:rearAisle},
    doors:FP.doorState().filter(d=>ATRIUM_ROUTE_TARGETS.some(t=>t.door===d.id)||d.id==='front-main'),
    pass:routes.every(r=>r.reachable&&r.returnable&&r.throughDoor)&&rearAisle.length===0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const out=process.argv[2]||'artifacts/atrium-access/after-navigation.json';
  const report=atriumAccessReport();await mkdir(new URL('../../artifacts/atrium-access/',import.meta.url),{recursive:true});
  await writeFile(out,JSON.stringify(report,null,2));
  console.log(JSON.stringify({pass:report.pass,routes:report.routes.map(({id,reachable,returnable,throughDoor,metres})=>({id,reachable,returnable,throughDoor,metres})),rearAisle:report.rearAisle},null,2));
  if(!report.pass)process.exitCode=1;
}
