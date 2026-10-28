import {BUILDING_WINDOWS} from '../data/building-windows.js';
import {CELL,F,MATERIAL,ZONE,isOutdoorZone} from '../data/floorplan/legend.js';
import {GLASS_COURT as C} from '../data/glass-court.js';
import {GLASS_COURT_SIGHTLINES as S} from '../data/glass-court-sightlines.js';

const foyerWindow=()=>BUILDING_WINDOWS.find(w=>w.id===S.windowId);
export function isGreenhouseBorrowedViewObserver({x,z,y,spaceId,renderGroup}={}){
 return renderGroup==='ground'&&spaceId==='natatorium'&&y>-.6&&y<.6
   &&x>=C.bounds.x0&&x<C.bounds.x1&&z>=C.bounds.z0&&z<C.bounds.z1;
}

export function buildingWindowForObserver({x,z,y,spaceId,renderGroup}={}){
 if(isGreenhouseBorrowedViewObserver({x,z,y,spaceId,renderGroup}))return foyerWindow();
 const candidates=BUILDING_WINDOWS.filter(w=>{
  const min=w.observerFloorRange?.min??w.roomFloor,max=w.observerFloorRange?.max??w.roomFloor;
  return w.group===renderGroup&&w.space===spaceId&&y>min-.6&&y<max+.6;
 });
 return candidates.sort((a,b)=>distance(a)-distance(b))[0]||null;
 function distance(w){const p=w.physical;return p.axis==='x'?Math.hypot(x-p.plane,z-(p.from+p.to)/2):Math.hypot(z-p.plane,x-(p.from+p.to)/2);}
}

// Observer y is the physical body-floor datum, as in the ordinary outlook
// selector. The renderer still intersects the actual eye ray with the aperture.
export function buildingWindowForExteriorObserver({x,z,y,zone}={}){
 const w=foyerWindow();
 if(!w||!isOutdoorZone(zone)||![x,z,y].every(Number.isFinite)||Math.abs(y-w.roomFloor)>.6)return null;
 const p=w.physical,outward=p.z0-z;
 return outward>=0&&outward<=S.maximumExteriorDistance
  &&Math.abs(x-(p.from+p.to)/2)<=(p.to-p.from)/2+.65*outward?w:null;
}

// Restore EXISTING occupied rooms, including their opaque walls and their real
// floor/ceiling intervals. This is not an empty cone through the building.
// Only rendering bytes change; physicalCells and all logical movement stay put.
export function applyBuildingWindowInteriorView(slice,observer,physicalCells){
 const window=buildingWindowForExteriorObserver(observer);if(!window||!physicalCells?.get)return null;
 const {w,h,originX=0,originY=0,solid,floor,ceil,flags,zone,material}=slice;
 for(const r of S.enclosures){
  for(let pz=Math.round(r.z0/CELL);pz<Math.round(r.z1/CELL);pz++)for(let px=Math.round(r.x0/CELL);px<Math.round(r.x1/CELL);px++){
   const ix=px-originX,iy=pz-originY;if(ix<0||iy<0||ix>=w||iy>=h)continue;
   const i=iy*w+ix;
   const spans=(physicalCells.get(`${px},${pz}`)||[]).filter(s=>S.enclosures.some(q=>q.spaceId===s.spaceId)
    &&s.renderGroup==='ground'&&s.floor<3.4&&s.ceil>1);
   if(!spans.length){solid[i]=1;floor[i]=ceil[i]=0;flags[i]=F.SOLID;zone[i]=0;continue;}
   const s=spans.reduce((a,b)=>Math.abs(a.floor-observer.y)<=Math.abs(b.floor-observer.y)?a:b);
   solid[i]=0;floor[i]=s.floor;ceil[i]=s.ceil;flags[i]=s.flags;zone[i]=s.zone;material[i]=s.material;
  }
 }
 applyGlassCourtFanlightView(slice);
 return window;
}

export function applyGlassCourtFanlightView({w,h,originX=0,originY=0,solid,floor,ceil,flags}){
 const a=S.fanlight;
 for(let pz=Math.round(a.z0/CELL);pz<Math.round(a.z1/CELL);pz++)for(let px=Math.round(a.x0/CELL);px<Math.round(a.x1/CELL);px++){
  const x=px-originX,y=pz-originY;if(x<0||y<0||x>=w||y>=h)continue;
  const i=y*w+x;
  // Union the high glazed opening with the already present D0 throat. Never
  // invent an opening in a solid cell or raise its logical walking floor.
  if(!solid[i]&&(flags[i]&F.DOOR)&&floor[i]<a.sill&&ceil[i]>=a.sill-.01)ceil[i]=Math.max(ceil[i],a.head);
 }
}

// A view interval changes rendered air only. All logical collision, keys,
// acoustic paths and room ownership continue to come from the actual plan.
export function applyBuildingWindowView(slice,observer){
 const window=buildingWindowForObserver(observer);if(!window)return null;
 const p=window.physical,n=window.inwardNormal;
 const plane=p.axis==='x'?(n.x>0?p.x0:p.x1):(n.z>0?p.z0:p.z1);
 const center=(p.from+p.to)/2,half=(p.to-p.from)/2;
 const {w,h,originX=0,originY=0,solid,floor,ceil,flags,zone,material}=slice;
 for(let iy=0;iy<h;iy++)for(let ix=0;ix<w;ix++){
  const x=(ix+originX)*CELL,z=(iy+originY)*CELL;
  const i=iy*w+ix;
  // A lower observer can select an older basement span at this column instead
  // of the high sill's air interval. Restore only the approved aperture, with
  // its real sill and head; neither the jambs nor body collision are changed.
  if(x>=p.x0&&x<p.x1&&z>=p.z0&&z<p.z1){
   solid[i]=0;floor[i]=window.sill;ceil[i]=window.head;flags[i]=0;zone[i]=window.zone;material[i]=MATERIAL.doorGlassDuct;
   continue;
  }
  const outward=p.axis==='x'?(plane-x)*n.x:(plane-z)*n.z;
  const along=p.axis==='x'?z:x;
  // On a south/east face the first exterior cell starts exactly at the outer
  // plane. Skipping zero leaves a half-metre masonry strip behind the glass.
  if(outward<0||Math.abs(along-center)>half+.65*outward)continue;
  solid[i]=0;floor[i]=0;ceil[i]=24;flags[i]=F.SKY|F.WALLED;zone[i]=ZONE.street;material[i]=MATERIAL.wetTarmac;
  // The chapel/practice floors are real overhead construction south of the
  // baths. Looking out below them must retain their soffit, not open the sky.
  if(window.id==='W4-pool-south'&&x>=86&&x<100&&z<84.5){ceil[i]=4.6;flags[i]=0;}
 }
 if(window.id===S.windowId)applyGlassCourtFanlightView(slice);
 return window;
}

export function buildingWindowInteriorPlane(window){
 if(!window)return[0,0,0,0];
 const p=window.physical,n=window.inwardNormal;
 const plane=p.axis==='x'?(n.x>0?p.x1:p.x0):(n.z>0?p.z1:p.z0);
 return[n.x,0,n.z,p.axis==='x'?-n.x*plane:-n.z*plane];
}

export function buildingWindowExteriorPlane(window){
 if(!window)return[0,0,0,0];
 const p=window.physical,n=window.inwardNormal;
 const plane=p.axis==='x'?(n.x>0?p.x0:p.x1):(n.z>0?p.z0:p.z1);
 return[-n.x,0,-n.z,p.axis==='x'?n.x*plane:n.z*plane];
}

export function buildingWindowPortal(window){
 const p=window.physical,n=window.inwardNormal;
 return[p.axis==='x'?1:0,p.axis==='x'?(n.x>0?p.x0:p.x1):(n.z>0?p.z0:p.z1),p.from,p.to,window.sill,window.head];
}

export function isBuildingWindowScenery(instance,window=null){
 const id=String(instance?.id||'');
  if(id==='ellery-actual-public-front'||id==='ellery-public-forecourt')return true;
 if(id==='bay-west-elevation')return true;
 if(!(id.startsWith('district-')||id.startsWith('yard-')||id.startsWith('bay-city-')))return false;
 if(!window)return true;
 const p=window.physical,n=window.inwardNormal;
 const plane=p.plane;
 const outward=p.axis==='x'?(plane-instance.x)*n.x:(plane-instance.z)*n.z;
 const along=p.axis==='x'?instance.z:instance.x,center=(p.from+p.to)/2;
 // Large background rows retain their measured facade reach. Ordinary yard
 // furniture on the far side of the observer cannot be seen through this cut.
 const allowance=String(instance.mesh||'').includes('frontage')?35:3;
 return outward>=-allowance&&Math.abs(along-center)<(p.to-p.from)/2+Math.max(0,outward)*1.8+allowance;
}
