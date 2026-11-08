// One terminal failed-night passage in the construction the player occupies.
// All body/collision values are world metres. Plan/prop snapshots are rebuilt
// by the host, never serialized into a scene checkpoint.
export const FIRST_STRIKE=Object.freeze({schema:1,duration:42,finalAt:35,fixedStep:1/120,maxFrameDelta:.25,
 walkSpeed:3.15,bodyRadius:.23,bodyHeight:1.82,eyeHeight:1.62,stepHeight:.32,far:110,
 maxCells:12000,maxPieces:72,maxDust:42,slabThickness:.28,gravity:9.8,maximumFallSeconds:2.8});
const finite=(n,f=0)=>typeof n==='number'&&Number.isFinite(n)?n:f;
const hash=s=>{let n=2166136261;for(const c of String(s)){n=Math.imul(n^c.charCodeAt(0),16777619);}return(n>>>0).toString(16);};
const entries=new WeakMap(),normalized=new WeakSet(),pieceCache=new WeakMap(),cellIndices=new WeakMap();
export function firstStrikeEntryKey(entry){return String(entry?.routeHash||entry?.key||hash(JSON.stringify({region:entry?.region,origin:entry?.origin,route:entry?.route,cells:entry?.walkCells?.map(c=>[c.x,c.z,c.floor,c.ceil,c.walkable])})));}
export function normalizeFirstStrikeEntry(value={}){
 if(normalized.has(value))return value;if(entries.has(value))return entries.get(value);
 const origin={x:finite(value.origin?.x,finite(value.x)),y:finite(value.origin?.y,finite(value.feet)),z:finite(value.origin?.z,finite(value.z))};
 const cells=(Array.isArray(value.walkCells)?value.walkCells:[]).slice(0,FIRST_STRIKE.maxCells).filter(c=>[c.x,c.z,c.floor].every(Number.isFinite)).map(c=>({...c,size:finite(c.cellSize,finite(c.size,.5)),ceil:Number.isFinite(c.ceil)?c.ceil:origin.y+10,walkable:c.walkable!==false}));
 const route=(Array.isArray(value.route)?value.route:[]).filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)).map(p=>({...p,floor:finite(p.floor,origin.y)}));
 const end=route.at(-1)||origin,prior=route.at(-2)||origin,dx=end.x-prior.x,dz=end.z-prior.z,length=Math.hypot(dx,dz)||1;
 const target=(p,id)=>p?{...p,id:p.id||id,x:finite(p.x,end.x),z:finite(p.z,end.z),feet:finite(p.feet,finite(p.floor,origin.y)),radius:Math.max(.7,finite(p.radius,1.1)),kind:p.kind||id,
  // An edge is a supported clearance region beyond the final approach, not a
  // tiny point to collect. The host may supply a real doorway's plane normal.
  normal:p.normal&&Number.isFinite(p.normal.x)&&Number.isFinite(p.normal.z)?p.normal:{x:dx/length,z:dz/length}}:null;
 const entry={...value,eventId:String(value.eventId||'night-first-strike'),origin,yaw:finite(value.yaw),pitch:finite(value.pitch),region:['source','drive'].includes(value.region)?value.region:'ellery',walkCells:cells,route,
  safeEdge:target(value.safeEdge||end,'clear-edge'),shelter:target(value.shelter,'shelter'),props:Array.isArray(value.props)?value.props:[],lights:Array.isArray(value.lights)?value.lights:[]};
 entry.routeHash=firstStrikeEntryKey({...entry,routeHash:value.routeHash});normalized.add(entry);entries.set(value,entry);return entry;
}
export function firstStrikeRouteProjection(entry,x,z){
 const route=entry.route||[];let distance=Infinity,progress=0,along=0;
 for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<1e-7)continue;const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(len*len))),d=Math.hypot(x-a.x-dx*t,z-a.z-dz*t);if(d<distance){distance=d;progress=along+len*t;}along+=len;}
 return{distance,progress,length:along};
}
export function firstStrikeCellAt(entry,x,z,feet=entry.origin.y){
 let best=null,error=Infinity;
 let index=cellIndices.get(entry);if(!index){index=new Map();for(const c of entry.walkCells)for(let ix=Math.floor((c.x-c.size/2)/.5);ix<=Math.floor((c.x+c.size/2)/.5);ix++)for(let iz=Math.floor((c.z-c.size/2)/.5);iz<=Math.floor((c.z+c.size/2)/.5);iz++){const key=ix+':'+iz;if(!index.has(key))index.set(key,[]);index.get(key).push(c);}cellIndices.set(entry,index);}
 for(const c of index.get(Math.floor(x/.5)+':'+Math.floor(z/.5))||[]){if(!c.walkable||Math.abs(x-c.x)>c.size/2+1e-6||Math.abs(z-c.z)>c.size/2+1e-6)continue;const e=Math.abs(c.floor-feet);if(e<=FIRST_STRIKE.stepHeight+.001&&c.ceil-c.floor>=FIRST_STRIKE.bodyHeight&&e<error){best=c;error=e;}}
 return best;
}
export function firstStrikeFooting(entry,x,z,feet=entry.origin.y){
 const centre=firstStrikeCellAt(entry,x,z,feet);if(!centre)return null;
 for(let i=0;i<8;i++){const angle=i*Math.PI/4,c=firstStrikeCellAt(entry,x+Math.cos(angle)*FIRST_STRIKE.bodyRadius,z+Math.sin(angle)*FIRST_STRIKE.bodyRadius,centre.floor);if(!c||Math.abs(c.floor-centre.floor)>FIRST_STRIKE.stepHeight)return null;}
 if(typeof entry.canStand==='function'&&entry.canStand(x,z,centre.floor)===false)return null;
 return{y:centre.floor,ceil:centre.ceil};
}
export function firstStrikePieces(entry){
 if(pieceCache.has(entry))return pieceCache.get(entry);
 const candidates=entry.walkCells.filter(c=>c.walkable&&(entry.plan||c.ceilingHostId)&&Number.isFinite(c.ceil)&&c.ceil-c.floor<18&&c.ceil-c.floor>2.25&&(c.flags&4)!==4)
  .map(c=>({...c,projection:firstStrikeRouteProjection(entry,c.x,c.z)})).filter(c=>c.projection.distance<8&&Math.hypot(c.x-entry.origin.x,c.z-entry.origin.z)<48),groups=new Map();
 // Adjacent real cells share a restrained ceiling course; every exported slab
 // still uses its own actual cell footprint, not a guessed rectangular floor.
 for(const c of candidates){const key=[Math.floor(c.x/1.5),Math.floor(c.z/1.5),Math.round(c.ceil*4),Math.round(c.floor*4),entry.plan?'plan':c.ceilingHostId].join(':');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);}
 const pieces=[...groups.values()].sort((a,b)=>Math.hypot(a[0].x-entry.origin.x,a[0].z-entry.origin.z)-Math.hypot(b[0].x-entry.origin.x,b[0].z-entry.origin.z)).slice(0,FIRST_STRIKE.maxPieces).map((cells,index)=>{
  const x=cells.reduce((n,c)=>n+c.x,0)/cells.length,z=cells.reduce((n,c)=>n+c.z,0)/cells.length,floor=cells[0].floor,ceil=cells[0].ceil,projection=firstStrikeRouteProjection(entry,x,z),radius=Math.max(...cells.map(c=>Math.hypot(c.x-x,c.z-z)+c.size*.71)),fallSeconds=Math.sqrt(Math.max(.1,ceil-floor)*2/FIRST_STRIKE.gravity);
  return{id:'course-'+index,index,x,z,floor,ceil,cells,radius,projection,releaseAt:6+index%7*3.8+Math.floor(index/7)*.23,fallSeconds,bodyClearance:radius+FIRST_STRIKE.bodyRadius+FIRST_STRIKE.walkSpeed*fallSeconds+1};
 });
 const props=typeof entry.getProps==='function'?entry.getProps():entry.props;
 const remote=props.filter(p=>entry.hostBounds?.[p.id]&&!p.character&&!p.practical&&!p.decorative&&(p.structural||p.sourceStructure||/building|elevation|wall|roof|tower|facade|canopy|slab|ceiling|conservatory/i.test(p.mesh||''))).map(p=>{
  const b=entry.hostBounds[p.id],x=(b.min[0]+b.max[0])/2,z=(b.min[2]+b.max[2])/2,dx=Math.max(b.min[0]-entry.origin.x,0,entry.origin.x-b.max[0]),dz=Math.max(b.min[2]-entry.origin.z,0,entry.origin.z-b.max[2]);
  return{p,b,x,z,clearance:Math.hypot(dx,dz),distance:Math.hypot(x-entry.origin.x,z-entry.origin.z)};
 }).filter(v=>v.clearance>2&&v.distance<FIRST_STRIKE.far-8&&v.b.max[1]-v.b.min[1]>2.5).sort((a,b)=>a.distance-b.distance).slice(0,2);
 for(const v of remote)pieces.push({id:'host-'+v.p.id,index:pieces.length,structuralHost:true,hostId:v.p.id,x:v.x,z:v.z,floor:v.b.min[1],ceil:v.b.max[1],cells:[],radius:Math.hypot(v.b.max[0]-v.b.min[0],v.b.max[2]-v.b.min[2])/2,projection:firstStrikeRouteProjection(entry,v.x,v.z),releaseAt:1.9,fallSeconds:0,bodyClearance:Infinity});
 pieceCache.set(entry,pieces);return pieces;
}
export function firstStrikePiecePose(piece,releaseAt,elapsed,{reducedMotion=false,mode='fall'}={}){
 const age=Math.max(0,elapsed-releaseAt),ease=t=>{const p=Math.max(0,Math.min(1,t));return p*p*(3-2*p);};
 if(mode==='hang'){
  const final=ease((elapsed-35)/6.5),headroom=2.30-.15*final,drop=Math.max(0,piece.ceil-piece.floor-headroom)*ease(age/1.35);
  return{age,y:piece.ceil+FIRST_STRIKE.slabThickness-drop,bottom:piece.ceil-drop,drop,settled:false,held:true,roll:reducedMotion?0:.012*Math.sin(Math.min(1,age/1.35)*Math.PI)*(piece.index%2?1:-1)};
 }
 const fall=Math.min(piece.ceil-piece.floor,.5*FIRST_STRIKE.gravity*age*age),settled=age>=piece.fallSeconds;
 return{age,y:piece.ceil+FIRST_STRIKE.slabThickness-fall,bottom:piece.ceil-fall,drop:fall,settled,held:false,roll:reducedMotion?0:Math.sin(Math.min(1,age/piece.fallSeconds)*Math.PI)*.055*(piece.index%2?1:-1)};
}
export const FIRST_STRIKE_MESHES=Object.freeze(['first_strike_plaster','first_strike_core','first_strike_girder','first_strike_glass','first_strike_dust','first_strike_water','first_strike_drip','first_strike_lamp']);
