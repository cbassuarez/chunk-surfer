import {SOURCE_ELLERY_ASIDE_ASSET as ASSET} from './generated/source-earthfall-ellery-aside.js';
import {PROP_BOUNDS} from './generated/prop-geometry.js';
import {STOP_LISTENING_BOUNDS,STOP_LISTENING_FLESH_BOUNDS} from './generated/stop-listening-geometry.js';

// Two real connections out of the Scene Dock make one compact inhabited loop.
// The western goods door is the ordinary way out before noise seals it.
export const EARTHFALL_CHASE=Object.freeze({
 version:1,duration:54,catchLoad:.17,compressionRate:.075,contactRadius:.72,contactArrestSeconds:.22,catchGraceSeconds:2.5,
 hushSpeed:3.10,hushWarningSeconds:1.10,bodyRadius:.22,bodyHeight:1.8,navCell:.25,
 center:{x:65.25,z:9.25},quietExit:{id:'dock-grey-exterior',x:56.20,z:10.25,minZ:8.95,maxZ:11.55},
 rooms:[
  {id:'dock',name:'Scene Dock',minX:57.25,maxX:73.25,minZ:3.25,maxZ:15.25,height:5.5},
  {id:'south-passage',name:'Service passage',minX:63.60,maxX:65.90,minZ:15.25,maxZ:19,height:2.8},
  {id:'practice-copy',name:'Copied practice room',minX:62.25,maxX:69.25,minZ:19,maxZ:25,height:3.5},
  {id:'cross-passage',name:'Returning corridor',minX:69.25,maxX:75.25,minZ:19,maxZ:21.5,height:2.7},
  {id:'dispatch-copy',name:'Copied dispatch room',minX:75.25,maxX:81.25,minZ:12,maxZ:21.5,height:3.8},
  {id:'east-passage',name:'Foyer return',minX:73.25,maxX:75.25,minZ:12.63,maxZ:13.87,height:2.6},
  {id:'quiet-threshold',name:'Grey goods door',minX:54.8,maxX:57.25,minZ:8.75,maxZ:11.75,height:3.2},
 ],
 nodes:[{x:65,z:10},{x:64.75,z:16.4},{x:64.75,z:20.2},{x:66.5,z:22.4},{x:70.5,z:20.25},{x:77,z:20.25},{x:78,z:16},{x:76,z:13.25},{x:72,z:13.25}],
});
const finite=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d,clamp=(v,a,b)=>Math.max(a,Math.min(b,finite(v,a)));
export function freshEarthfallChase({legacy=false}={}){return{version:1,phase:legacy?'legacy':'recognition',elapsed:0,compression:0,catches:0,contactElapsed:0,contactEventId:'',presentedEventId:'',injuryApplied:false,grace:0,hushX:78,hushZ:16,heading:0,quietDoor:0,quietDoorTarget:0,noiseLatched:false,collapseElapsed:0,pathClock:0,path:[],legacy};}
export function normalizeEarthfallChase(v,{legacy=false}={}){
 const n=freshEarthfallChase({legacy});if(!v||v.version!==1)return n;
 const phase=['recognition','quiet','chase','contact','collapse','legacy'].includes(v.phase)?v.phase:n.phase;
 return{...n,phase,legacy:legacy||!!v.legacy,elapsed:clamp(v.elapsed,0,1e7),compression:clamp(v.compression,0,1),catches:clamp(Math.floor(finite(v.catches)),0,100),contactElapsed:clamp(v.contactElapsed,0,1e7),
  contactEventId:String(v.contactEventId||'').slice(0,180),presentedEventId:String(v.presentedEventId||'').slice(0,180),injuryApplied:!!v.injuryApplied,grace:clamp(v.grace,0,10),hushX:finite(v.hushX,78),hushZ:finite(v.hushZ,16),heading:finite(v.heading),
  quietDoor:clamp(v.quietDoor,0,1),quietDoorTarget:clamp(v.quietDoorTarget,0,1),noiseLatched:!!v.noiseLatched,collapseElapsed:clamp(v.collapseElapsed,0,7.8),pathClock:clamp(v.pathClock,0,2),path:Array.isArray(v.path)?v.path.slice(0,600).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)).map(p=>({x:p.x,z:p.z})):[]};
}
export const earthfallChaseActive=c=>c?.phase==='chase'||c?.phase==='contact'||c?.phase==='collapse';
export function earthfallChaseFactors(chase){const p=clamp(chase?.compression,0,1),t=chase?.phase==='collapse'?clamp((finite(chase.collapseElapsed)-4.4)/2.6,0,1):0,s=t*t*(3-2*t);return{xz:(1-.28*p)*(1-.95*s),y:1-.75*s,singularity:s};}
export function earthfallChaseWorldMatrix(chase){const q=earthfallChaseFactors(chase),c=EARTHFALL_CHASE.center;return[q.xz,0,0,0,0,q.y,0,0,0,0,q.xz,0,c.x*(1-q.xz),0,c.z*(1-q.xz),1];}
export function earthfallChaseWorldPoint(p,chase){const q=earthfallChaseFactors(chase),c=EARTHFALL_CHASE.center;return{x:c.x+(p.x-c.x)*q.xz,z:c.z+(p.z-c.z)*q.xz,feet:finite(p.feet)*q.y};}
export function earthfallChaseLocalPoint(p,chase){const q=earthfallChaseFactors(chase),c=EARTHFALL_CHASE.center;return{x:c.x+(p.x-c.x)/q.xz,z:c.z+(p.z-c.z)/q.xz,feet:finite(p.feet)/q.y};}
export function earthfallChaseRoomAt(x,z,{sealed=false}={}){return EARTHFALL_CHASE.rooms.find(r=>(!sealed||r.id!=='quiet-threshold')&&x>=r.minX-1e-7&&x<=r.maxX+1e-7&&z>=r.minZ-1e-7&&z<=r.maxZ+1e-7)||null;}
export function earthfallChaseSupported(x,z,radius=.22,{sealed=false}={}){
 for(const[a,b]of[[0,0],[1,0],[-1,0],[0,1],[0,-1],[.707,.707],[-.707,.707],[.707,-.707],[-.707,-.707]])if(!earthfallChaseRoomAt(x+a*radius,z+b*radius,{sealed}))return false;return true;
}
const source=id=>{const p=ASSET.panels.find(p=>p.id===id);if(!p)throw Error('Copied Ellery panel missing: '+id);return p;};
const mapBounds=(from,to)=>{const s=[0,1,2].map(k=>(to.max[k]-to.min[k])/(from.max[k]-from.min[k]));return[s[0],0,0,0,0,s[1],0,0,0,0,s[2],0,...[0,1,2].map(k=>to.min[k]-from.min[k]*s[k]),1];};
const floor=source('floor-west:1:1'),wall=source('north:0:3');
const architecture=[];
for(const r of EARTHFALL_CHASE.rooms.filter(r=>r.id!=='dock')){
 architecture.push({id:r.id+':floor',room:r.id,kind:'floor',mesh:floor.mesh,matrix:mapBounds(floor.bounds,{min:[r.minX,-.002,r.minZ],max:[r.maxX,.008,r.maxZ]})});
 architecture.push({id:r.id+':ceiling',room:r.id,kind:'ceiling',mesh:floor.mesh,matrix:mapBounds(floor.bounds,{min:[r.minX,r.height,r.minZ],max:[r.maxX,r.height+.01,r.maxZ]})});
 // Subtract neighbouring rectangles from each wall edge. Every join is a
 // real opening; the collision union and the rendered construction agree.
 for(const edge of[{axis:'x',at:r.minZ,a:r.minX,b:r.maxX,side:-1},{axis:'x',at:r.maxZ,a:r.minX,b:r.maxX,side:1},{axis:'z',at:r.minX,a:r.minZ,b:r.maxZ,side:-1},{axis:'z',at:r.maxX,a:r.minZ,b:r.maxZ,side:1}]){
  let spans=[[edge.a,edge.b]];
  for(const n of EARTHFALL_CHASE.rooms.filter(n=>n!==r)){
   const touch=edge.axis==='x'?(edge.side<0?Math.abs(n.maxZ-edge.at)<1e-6:Math.abs(n.minZ-edge.at)<1e-6):(edge.side<0?Math.abs(n.maxX-edge.at)<1e-6:Math.abs(n.minX-edge.at)<1e-6);
   if(!touch)continue;const lo=edge.axis==='x'?n.minX:n.minZ,hi=edge.axis==='x'?n.maxX:n.maxZ;
   spans=spans.flatMap(([a,b])=>hi<=a||lo>=b?[[a,b]]:[[a,Math.max(a,lo)],[Math.min(b,hi),b]].filter(([a,b])=>b-a>.01));
  }
  spans.forEach(([a,b],i)=>{let m;if(edge.axis==='x')m=mapBounds(wall.bounds,{min:[a,0,edge.at-.1],max:[b,r.height,edge.at+.1]});else{const s=(b-a)/(wall.bounds.max[0]-wall.bounds.min[0]),sy=r.height/(wall.bounds.max[1]-wall.bounds.min[1]),sz=.2/(wall.bounds.max[2]-wall.bounds.min[2]);m=[0,0,-s,0,0,sy,0,0,sz,0,0,0,edge.at-(wall.bounds.min[2]+wall.bounds.max[2])*.5*sz,0,b+wall.bounds.min[0]*s,1];}architecture.push({id:r.id+':wall:'+edge.axis+edge.side+':'+i,room:r.id,kind:'wall',mesh:wall.mesh,matrix:m});});
 }
}
export const EARTHFALL_CHASE_ARCHITECTURE=Object.freeze(architecture);
const prop=(id,sourceId,x,z,yaw=0)=>{const p=ASSET.props.find(p=>p.id===sourceId);return{id,mesh:p.mesh,x,y:0,z,yaw,bounds:p.bounds,sourceId};};
export const EARTHFALL_CHASE_FURNITURE=Object.freeze([
 prop('practice-desk','dock-desk-1',66.3,22.6,.4),prop('practice-case','dock-road-case',63.3,23.8,.2),
 prop('dispatch-crates','dock-freight-crates',80.1,15.3,0),prop('dispatch-truck','dock-hand-truck',80.2,18.3,-1.4),prop('dispatch-reel','dock-cable-reel',76.3,16.5,.4),
]);

// Recognizable pieces of the existing game, borrowed at their real scale.
// Source bounds are shared by drawing, player collision and hunter navigation.
// The ear's flat liquid is visible but only the actual tissue blocks a body.
const BROKEN_HEAD_BOUNDS={min:[-.0964185,0,-.1295159],max:[.0964185,.2253318,.1295159]};
const obstacle=(id,mesh,x,z,yaw=0,extra={})=>{
 const bounds=extra.bounds||PROP_BOUNDS[mesh]||STOP_LISTENING_BOUNDS[mesh];if(!bounds)throw Error('Missing original obstacle bounds '+mesh);
 return Object.freeze({id:'memory-'+id,mesh,x,y:extra.y??-bounds.min[1]*(extra.scale??1),z,yaw,scale:extra.scale??1,bounds,sourcePack:extra.sourcePack||'conservatory-props.glb',
  sourceId:extra.sourceId||mesh,domain:extra.domain||'conservatoire',provenance:extra.provenance||'Original project prop; native POSITION bounds from generated/prop-geometry.js',...extra});
};
export const EARTHFALL_CHASE_OBSTACLES=Object.freeze([
 obstacle('street-car','city_parked_car',65.0,6.1,.12,{domain:'exterior-town'}),
 obstacle('recital-piano','grand_piano',68.1,9.8,.85,{domain:'recital-room'}),
 obstacle('service-pew','pew',69.5,12.45,0,{domain:'chapel'}),
 obstacle('picket-fence','demolition_heras_fence',70.4,14.4,0,{domain:'arrival-court'}),
 obstacle('player-chair-a','chair',69.8,10.9,.6),obstacle('player-chair-b','chair',70.5,9.6,-.5),obstacle('player-chair-c','chair',70.5,11.35,1.1),
 obstacle('music-rest-a','music_stand',69.9,8.8,-.6),obstacle('music-rest-b','music_stand',71.5,12.15,.2),
 obstacle('gallery-plinth','academic_bust_plinth',72.35,5.6,.25,{domain:'academic-gallery'}),
 obstacle('gallery-bust','academic_bust_fragment',72.35,5.6,.25,{y:1.085,domain:'academic-gallery'}),
 obstacle('source-plinth','academic_bust_plinth',67.0,14.45,-.2,{domain:'source-proper'}),
 obstacle('source-head','source_bust_broken_head',67.0,14.45,-.2,{y:1.11,scale:2.4,bounds:BROKEN_HEAD_BOUNDS,sourcePack:'source-structures.glb',domain:'source-proper',provenance:'Existing Source broken-bust head; original source-structures.glb POSITION accessor bounds'}),
 obstacle('recording-reel','lane_reel',58.7,4.9,.1,{domain:'recording-lane'}),
 obstacle('plant-manifold','plant_header_manifold',71.4,4.2,0,{domain:'plant-room'}),
 obstacle('dock-cart','equipment_cart',58.9,13.8,.05,{domain:'equipment-store'}),
 obstacle('booth-bollards','district_bollard_pair',60.4,4.2,0,{domain:'arrival-court'}),
 obstacle('school-piano','school_piano',68.3,22.0,-Math.PI/2,{domain:'school-memory'}),
 obstacle('school-desk','school_desk',63.2,20.1,.15,{domain:'school-memory'}),
 obstacle('practice-chair','chair',62.9,21.6,.5),obstacle('practice-rest','music_stand',63.8,22.6,-.4),
 obstacle('chapel-font','cathedral_font',68.5,24.4,.2,{domain:'chapel'}),
 obstacle('waiting-row','school_chair_row',72.25,21.15,0,{domain:'school-memory'}),
 obstacle('source-floor-head','source_bust_broken_head',70.4,19.55,.9,{scale:2,bounds:BROKEN_HEAD_BOUNDS,sourcePack:'source-structures.glb',domain:'source-proper',provenance:'Existing Source broken-bust head; original source-structures.glb POSITION accessor bounds'}),
 obstacle('town-bench','district_bench',76.1,18.25,Math.PI/2,{domain:'exterior-town'}),
 obstacle('yard-sign','yard_sign',80.4,13.8,-Math.PI/2,{domain:'arrival-court'}),
 obstacle('tower-wheel','tower_wheel_01',80.6,16.9,Math.PI/2,{y:1.057,domain:'st-brendans'}),
 obstacle('ear-cart','equipment_cart',80.35,19.2,0,{domain:'ear-room'}),
 obstacle('ear-on-cart','stop_listening_ear_a',80.35,19.2,.3,{y:.635,scale:1.3,collisionBounds:STOP_LISTENING_FLESH_BOUNDS.stop_listening_ear_a,sourcePack:'stop-listening.glb',domain:'ear-room',provenance:'Original ear-room anatomy and generated tissue bounds; flat liquid does not block passage'}),
 obstacle('ear-heap','stop_listening_heap_b',79.25,20.3,-.2,{collisionBounds:STOP_LISTENING_FLESH_BOUNDS.stop_listening_heap_b,sourcePack:'stop-listening.glb',domain:'ear-room',provenance:'Original supported ear heap from stop-listening.glb; only tissue bounds collide'}),
]);
export function earthfallChasePropMatrix(p){const c=Math.cos(p.yaw||0),s=Math.sin(p.yaw||0),k=p.scale??1;return[c*k,0,-s*k,0,0,k,0,0,s*k,0,c*k,0,p.x,p.y||0,p.z,1];}
export function earthfallChasePropBlocks(x,z,r,p,height=1.8){
 return earthfallChasePropPenetration(x,z,r,p,height)>0;
}
export function earthfallChasePropPenetration(x,z,r,p,height=1.8){
 const b=p.collisionBounds||p.bounds;if(!b)return false;const k=p.scale??1,y=p.y||0;
 if(y+b.max[1]*k<=0||y+b.min[1]*k>=height)return 0;
 const c=Math.cos(p.yaw||0),s=Math.sin(p.yaw||0),dx=x-p.x,dz=z-p.z,lx=(c*dx-s*dz)/k,lz=(s*dx+c*dz)/k;
 const outside=Math.hypot(Math.max(b.min[0]-lx,0,lx-b.max[0]),Math.max(b.min[2]-lz,0,lz-b.max[2]));
 return outside?Math.max(0,r-outside*k):r+Math.min(lx-b.min[0],b.max[0]-lx,lz-b.min[2],b.max[2]-lz)*k;
}

// A bounded grid route avoids the real corners. Visibility skipping keeps the
// hunter from following cell centres when an ordinary straight path is clear.
export function earthfallChasePath(start,target,canStand){
 const distance=Math.hypot(target.x-start.x,target.z-start.z),steps=Math.max(1,Math.ceil(distance/.2));let direct=true;for(let i=1;i<=steps;i++)if(!canStand(start.x+(target.x-start.x)*i/steps,start.z+(target.z-start.z)*i/steps)){direct=false;break;}if(direct)return[{x:target.x,z:target.z}];
 const cell=EARTHFALL_CHASE.navCell,key=(x,z)=>x+','+z,round=p=>[Math.round(p.x/cell),Math.round(p.z/cell)],a=round(start),b=round(target),open=[a],came=new Map(),cost=new Map([[key(...a),0]]),closed=new Set();let best=a,bestD=Infinity;
 for(let count=0;open.length&&count<3500;count++){
  let index=0,score=Infinity;for(let i=0;i<open.length;i++){const n=open[i],v=cost.get(key(...n))+Math.hypot(n[0]-b[0],n[1]-b[1]);if(v<score){score=v;index=i;}}
  const n=open.splice(index,1)[0],k=key(...n);if(closed.has(k))continue;closed.add(k);const d=Math.hypot(n[0]-b[0],n[1]-b[1]);if(d<bestD){bestD=d;best=n;}if(d<=1)break;
  for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){const next=[n[0]+dx,n[1]+dz],nk=key(...next);if(closed.has(nk)||!canStand(next[0]*cell,next[1]*cell)||dx&&dz&&(!canStand((n[0]+dx)*cell,n[1]*cell)||!canStand(n[0]*cell,(n[1]+dz)*cell)))continue;const g=cost.get(k)+Math.hypot(dx,dz);if(g<(cost.get(nk)??Infinity)){cost.set(nk,g);came.set(nk,n);open.push(next);}}
 }
 const path=[];let n=best;for(let i=0;i<3500&&key(...n)!==key(...a);i++){path.push({x:n[0]*cell,z:n[1]*cell});n=came.get(key(...n));if(!n)break;}return path.reverse();
}
