// Skirting is attached to the rendered physical wall, not to a logical seam
// where two separately authored spaces happen to meet in the same air volume.
import {F} from '../data/floorplan/legend.js';
import {wallRuns,wallRunsDigest} from './wall-contact.js';

export const BASEBOARD_HEIGHT=.115;

export function baseboardPhysicalNormal(fp,cell){
  const nx=cell.nx,ny=cell.ny,inX=cell.x+nx,inY=cell.y+ny;
  if(fp.isSolid(inX,inY))return{nx,ny};
  const a=fp.logicalToPhysical(cell.x,cell.y),b=fp.logicalToPhysical(inX,inY);
  const dx=b.x-a.x,dz=b.z-a.z;
  if(Math.abs(dx)+Math.abs(dz)<1e-6)return{nx,ny};
  return Math.abs(dx)>=Math.abs(dz)?{nx:Math.sign(dx),ny:0}:{nx:0,ny:Math.sign(dz)};
}

export function physicalWallFaceHasHost(fp,cell,{bottom=cell.floor+.001,height=BASEBOARD_HEIGHT-.002,
  halfWidthCells=.42,alongOffsetCells=0}={}){
  // Small analytic readers without a physical renderer keep the old contract.
  if(typeof fp.physicalRenderPlanFor!=='function')return true;
  const slice=fp.physicalRenderPlanFor(cell.x,cell.y),at=fp.logicalToPhysical(cell.x,cell.y);
  const normal=baseboardPhysicalNormal(fp,cell),nx=normal.nx,nz=normal.ny;
  const wallX=at.x+.5-nx*.5,wallZ=at.z+.5-nz*.5;
  if(!Number.isFinite(bottom)||!Number.isFinite(height)||height<=0
    ||!Number.isFinite(halfWidthCells)||halfWidthCells<0||!Number.isFinite(alongOffsetCells))return false;
  const top=bottom+height;
  const shape=(x,z)=>{
    const ix=Math.floor(x)-slice.originX,iz=Math.floor(z)-slice.originY;
    if(ix<0||iz<0||ix>=slice.w||iz>=slice.h)return{solid:true};
    const i=iz*slice.w+ix;
    return{solid:!!slice.solid[i],floor:slice.floor[i],ceil:slice.ceil[i],sky:!!(slice.flags[i]&F.SKY)};
  };
  // Sample both ends and the middle of each half-metre face, just inside and
  // behind it. A small riser must support the full section, not just its foot.
  const steps=Math.max(1,Math.ceil(halfWidthCells*2/.5)),samples=new Set([0]);
  for(let i=0;i<=steps;i++)samples.add(-halfWidthCells+halfWidthCells*2*i/steps);
  for(const along of samples){
    const x=wallX-nz*(along+alongOffsetCells),z=wallZ+nx*(along+alongOffsetCells);
    const inside=shape(x+nx*.01,z+nz*.01),behind=shape(x-nx*.01,z-nz*.01);
    if(inside.solid||inside.floor>bottom+.0001||!inside.sky&&inside.ceil<top-.0001)return false;
    // The entire requested section must be outside the neighbour's air
    // interval. Checking a few heights would miss a narrow opening between.
    if(!behind.solid&&top>behind.floor+.0001&&(behind.sky||bottom<behind.ceil-.0001))return false;
  }
  return true;
}

export function baseboardFaceHasPhysicalHost(fp,cell){
  // The existing roof perimeter is depth-writing masonry curb geometry, not
  // the generic slice (which deliberately remains air for the open railing).
  // Keep that mesh-owned assembly; this filter does not redesign its joinery.
  if(cell.renderGroup==='academicRoof')return true;
  return physicalWallFaceHasHost(fp,cell);
}

export function baseboardWallRuns(fp){
  const out=[];
  for(const run of wallRuns(fp)){
    let cells=[];
    const flush=()=>{
      if(cells.length){const coords=cells.map(c=>run.axis==='x'?c.x:c.y);
        out.push({...run,cells,from:Math.min(...coords),to:Math.max(...coords)+1});}
      cells=[];
    };
    for(const cell of run.cells){if(!baseboardFaceHasPhysicalHost(fp,cell)){flush();continue;}cells.push(cell);}
    flush();
  }
  return out;
}

export function baseboardWallRunsDigest(runs,fp){
  // Physical mapping and the measured normal determine the baked geometry too.
  return JSON.stringify({runs:wallRunsDigest(runs),physical:runs.map(run=>run.cells.map(cell=>{
    const p=fp.logicalToPhysical(cell.x,cell.y),n=baseboardPhysicalNormal(fp,cell);
    return[p.x,p.y,p.z,n.nx,n.ny];
  }))});
}
