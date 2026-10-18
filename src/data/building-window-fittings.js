// The window meshes are anchored at the inside face of their real wall cut.
// Their reveals run outward through the metre of masonry. Clear panes are
// represented by edges and sparse water lines, without an opaque glass panel.
import { BUILDING_WINDOWS } from './building-windows.js';

const names=Object.freeze({
  'W1-chamber-north':'building_window_chamber',
  'W2-faculty-west':'building_window_faculty',
  'W3-foyer-north':'building_window_foyer',
  'W4-pool-south':'building_window_baths',
});
export const BUILDING_WINDOW_MESHES=Object.freeze(Object.fromEntries(BUILDING_WINDOWS.map(w=>[
  names[w.id],Object.freeze({w:w.physical.to-w.physical.from+(w.wall==='south'?.30:.94),
    h:w.head-w.sill+(w.wall==='south'?.18:.31),d:w.physical.depth+.40,blocks:false}),
])));

export const BUILDING_WINDOW_PROPS=Object.freeze(BUILDING_WINDOWS.map(w=>{
  const n=w.inwardNormal,l=w.logical,p=w.physical;
  const x=n.x>0?l.x1:n.x<0?l.x0-.5:(l.x0+l.x1)/2;
  const y=n.z>0?l.y1:n.z<0?l.y0-.5:(l.y0+l.y1)/2;
  const ax=p.x0+x-l.x0,az=p.z0+y-l.y0;
  const tx=n.x>0?p.x1:n.x<0?p.x0:(p.x0+p.x1)/2;
  const tz=n.z>0?p.z1:n.z<0?p.z0:(p.z0+p.z1)/2;
  return Object.freeze({id:`building-window-unit-${w.id}`,windowId:w.id,mesh:names[w.id],x,y,
    yaw:Math.atan2(-n.x,n.z),scale:1,floorOverride:w.sill,
    renderOffsetX:tx-ax,renderOffsetZ:tz-az,
    renderGroups:Object.freeze([...new Set([w.group,'ground'])]),interactive:false,blocks:false,structural:true,
    glazingRepresentation:'edge-and-rain-lines',opticalRefraction:false,
  });
}));

export const buildingWindowMeshName=id=>names[id]||null;
