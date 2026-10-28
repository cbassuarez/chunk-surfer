// The planted approach uses depth-writing glass and thin physical colliders,
// while its pool underlay deliberately remains one open 9.5m volume. Capture
// those loaded barriers for both map routing and architectural cutaway capture.
import {CELL} from '../data/floorplan/legend.js';
import {BUILDING_MAP} from '../data/building-map.js';
import {GLASS_COURT} from '../data/glass-court.js';

export function glassCourtMapPhysical(physical,{active=false,colliders=[],topologyStride=BUILDING_MAP.topologyStride}={}){
  if(!active||!(physical?.cells instanceof Map))return physical;
  const solids=colliders.filter(c=>c.colliderGroup==='glass-court'&&Number.isFinite(c.x)&&Number.isFinite(c.y)
    &&Number.isFinite(c.width)&&Number.isFinite(c.depth));
  if(!solids.length)return physical;
  const stride=Math.max(1,Math.floor(Number(topologyStride)||1)),blocked=new Set();
  const c=GLASS_COURT,x0=c.origin.x,x1=x0+c.changing.x1,z0=c.origin.z,z1=z0+c.changing.z1;
  const ground=span=>span.renderGroup==='ground'&&Math.abs(span.floor-c.floor)<=.05;
  const near=(x,z)=>x>=x0-.5&&x<=x1+.5&&z>=z0-.5&&z<=z1+.5;
  const blockedBy=(span,x,z)=>solids.some(s=>{
    if(span.floor<s.minElevation-.05||span.floor>s.maxElevation+.05)return false;
    const dx=x-s.x,dz=z-s.y,cs=Math.cos(-(s.yaw||0)),sn=Math.sin(-(s.yaw||0));
    // These are the same padded structural OBBs queried by propCanOccupy.
    // Applying another body radius here would silently narrow both real doors.
    return Math.abs(dx*cs-dz*sn)<=s.width/2&&Math.abs(dx*sn+dz*cs)<=s.depth/2;
  });
  for(let z=Math.floor((z0-.5)/CELL);z<=Math.ceil((z1+.5)/CELL);z++)for(let x=Math.floor((x0-.5)/CELL);x<=Math.ceil((x1+.5)/CELL);x++){
    const spans=physical.cells.get(`${x},${z}`)||[],bx=(x+.5)*CELL,bz=(z+.5)*CELL;
    if(!near(bx,bz))continue;
    if(spans.some(span=>ground(span)&&blockedBy(span,bx,bz)))blocked.add(`${Math.floor(x/stride)},${Math.floor(z/stride)}`);
  }
  if(!blocked.size)return physical;
  const cells=new Map(physical.cells);
  for(const bucket of blocked){
    const[bx,bz]=bucket.split(',').map(Number);
    for(let dz=0;dz<stride;dz++)for(let dx=0;dx<stride;dx++){
      const key=`${bx*stride+dx},${bz*stride+dz}`,spans=cells.get(key);if(!spans)continue;
      const kept=spans.filter(span=>!ground(span));
      if(kept.length)cells.set(key,kept);else cells.delete(key);
    }
  }
  return{...physical,cells};
}
