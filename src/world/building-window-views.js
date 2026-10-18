import {BUILDING_WINDOWS} from '../data/building-windows.js';
import {CELL,F,MATERIAL,ZONE} from '../data/floorplan/legend.js';

export function buildingWindowForObserver({x,z,y,spaceId,renderGroup}={}){
 const candidates=BUILDING_WINDOWS.filter(w=>{
  const min=w.observerFloorRange?.min??w.roomFloor,max=w.observerFloorRange?.max??w.roomFloor;
  return w.group===renderGroup&&w.space===spaceId&&y>min-.6&&y<max+.6;
 });
 return candidates.sort((a,b)=>distance(a)-distance(b))[0]||null;
 function distance(w){const p=w.physical;return p.axis==='x'?Math.hypot(x-p.plane,z-(p.from+p.to)/2):Math.hypot(z-p.plane,x-(p.from+p.to)/2);}
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
 return window;
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
