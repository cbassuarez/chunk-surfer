import {wallRuns,wallContactAt} from '../world/wall-contact.js';
import {propWallPose} from '../world/prop-wall-pose.js';
import {baseboardPhysicalNormal,physicalWallFaceHasHost} from '../world/baseboard-hosting.js';
import {ZONE,CELL,MATERIAL,EYE} from '../data/floorplan/legend.js';
import {BUILDING_WINDOWS} from '../data/building-windows.js';
import {chapelTapeDemandVisible} from '../game/chapel-tape-demand.js';
const excluded=new Set([ZONE.none,ZONE.street,ZONE.civicCourt,ZONE.dock,ZONE.serviceYard,ZONE.pub,ZONE.stationers,ZONE.church,ZONE.academicRoof]);
const meshes={line:{name:'tape_demand_paint_line',width:2.84,height:.43},block:{name:'tape_demand_paint_block',width:1.28,height:.91}};
const hash=text=>{let h=0;for(const ch of text)h=(Math.imul(h,31)+ch.charCodeAt(0))>>>0;return h;};
let planKey=null,placements=[];
export function chapelTapeDemandOverlapsWindow(mark,windows=BUILDING_WINDOWS){
  return windows.some(window=>{
    if(window.group!==mark.group)return false;
    const n=window.inwardNormal,p=window.physical,normal=mark.wallContact;
    if(normal.nx*n.x+normal.ny*n.z<.99)return false;
    const axis=p.axis,plane=axis==='x'?(n.x>0?p.x1:p.x0):(n.z>0?p.z1:p.z0),across=axis==='x'?mark.x:mark.z,along=axis==='x'?mark.z:mark.x;
    return Math.abs(across-plane)<.08&&along+mark.fit.width/2>p.from-.14&&along-mark.fit.width/2<p.to+.14&&mark.y<window.head+.14&&mark.y+mark.fit.height>window.sill-.14;
  });
}
export function chapelTapeDemandHasPhysicalHost(plan,mark){
  const cell={...mark.wallContact.cell,nx:mark.wallContact.nx,ny:mark.wallContact.ny};
  const normal=baseboardPhysicalNormal(plan,cell);
  // This wall-following kit only uses the straight, translated faces. Rotated
  // analytic architecture keeps its own construction and cannot inherit a
  // logical-grid normal or length.
  if(normal.nx!==cell.nx||normal.ny!==cell.ny)return false;
  const at=plan.logicalToPhysical(cell.x,cell.y),dx=mark.x-(at.x+.5)*CELL,dz=mark.z-(at.z+.5)*CELL;
  return physicalWallFaceHasHost(plan,cell,{bottom:mark.y,height:mark.fit.height,
    halfWidthCells:mark.fit.width/(2*CELL),alongOffsetCells:(-normal.ny*dx+normal.nx*dz)/CELL});
}
// The actual compiled faces own every inscription. A local nearby budget
// follows the player, so unvisited/returned rooms receive the same takeover.
export function buildChapelTapeDemandWalls(plan){
  if(!plan?.isLoaded?.())return[];
  const out=[];
  for(const run of wallRuns(plan)){
    if(excluded.has(run.zone)||run.arcId||!['ground','upper','academic','basement','hall'].includes(run.renderGroup))continue;
    const span=(run.to-run.from)*CELL;if(span<1.40)continue;
    const style=span>=3.15?meshes.line:meshes.block,count=Math.max(1,Math.floor(span/(style.width+.55)));
    for(let index=0;index<count;index++){
      const along=run.from+(run.to-run.from)*(index+.5)/count;
      const cell=run.cells[Math.min(run.cells.length-1,Math.max(0,Math.floor(along-run.from)))];if(!cell)continue;
      const x=run.axis==='x'?along:cell.x+.5,y=run.axis==='y'?along:cell.y+.5;
      const contact=wallContactAt(plan,x,y,{searchCells:2,prefer:{nx:run.nx,ny:run.ny}});if(!contact||contact.gap>.55)continue;
      const wallAt=plan.logicalToPhysical(contact.cell.x,contact.cell.y);
      if(!wallAt||wallAt.renderGroup!==run.renderGroup||Math.abs(contact.floor-run.floor)>.025||plan.zoneAt(contact.cell.x,contact.cell.y)!==run.zone)continue;
      const bound={min:[-style.width/2,0,0],max:[style.width/2,style.height,.002]},pose=propWallPose({frontAxis:'+z'},bound,contact);
      const lx=pose.x??x,ly=pose.y??y,at=plan.logicalToPhysical(Math.floor(x),Math.floor(y));
      if(!at||at.renderGroup!==run.renderGroup)continue;
      const id=`chapel-tape-demand:${run.renderGroup}:${cell.x},${cell.y}:${index}`;
      const seed=hash(id),ceiling=plan.ceilAt?.(cell.x,cell.y)||run.floor+2.7,available=ceiling-run.floor;
      const rows=[{height:.78+(seed%37)/100,scale:1,offset:0},
        ...(seed%4!==0?[{height:.17+(seed%19)/100,scale:.56+(seed%7)/40,offset:((seed%17)/16-.5)*.38}]:[]),
        ...(available>2.8&&seed%5!==0?[{height:1.82+(seed%29)/100,scale:.65+(seed%9)/25,offset:((seed%23)/22-.5)*.46}]:[]),
        ...(available>4.4&&seed%3===0?[{height:3.05+(seed%43)/100,scale:1.08,offset:((seed%13)/12-.5)*.30}]:[])];
      for(const[rowIndex,row]of rows.entries()){
        const rowStyle=rowIndex%2&&span>1.75?meshes.block:style;
        const scale=Math.min(row.scale,(span-.22)/rowStyle.width);
        if(row.height+rowStyle.height*scale>available-.14)continue;
        const centre=(lx*(run.axis==='x'?1:0)+ly*(run.axis==='y'?1:0))*CELL;
        const offset=Math.max(run.from*CELL+rowStyle.width*scale/2+.10-centre,Math.min(run.to*CELL-rowStyle.width*scale/2-.10-centre,row.offset));
        // Bare chapel masonry stays a dark field in the approved final screen.
        // Oxblood on it vanished into that field even under a direct torch;
        // the existing warm pale paint supplies real absorptive contrast.
        const pale=run.material===MATERIAL.woodVelvet||run.material===MATERIAL.chapelStone;
        const mark={id:id+':'+rowIndex,mesh:rowStyle.name+(pale?'_pale':''),x:(wallAt.x+(lx-contact.cell.x))*CELL+contact.nx*.004+(run.axis==='x'?offset:0),y:run.floor+row.height,z:(wallAt.z+(ly-contact.cell.y))*CELL+contact.ny*.004+(run.axis==='y'?offset:0),
          yaw:pose.yaw,scale,zone:run.zone,group:run.renderGroup,structural:false,noShadow:true,wallContact:{nx:contact.nx,ny:contact.ny,gap:contact.gap,cell:{...contact.cell},planeX:contact.planeX,planeY:contact.planeY},copy:'GIVE ME THE TAPES',seed,
          fit:{from:run.from*CELL,to:run.to*CELL,axis:run.axis,centre:centre+offset,width:rowStyle.width*scale,height:rowStyle.height*scale,ceiling,floor:run.floor}};
        if(!chapelTapeDemandOverlapsWindow(mark)&&chapelTapeDemandHasPhysicalHost(plan,mark))out.push(mark);
      }
    }
  }
  return out;
}
function segmentMatrix(a,b,width=1){
  const d=[b.x-a.x,b.y-a.y,b.z-a.z],length=Math.hypot(...d)||.0001,y=d.map(v=>v/length),seed=Math.abs(y[2])>.9?[1,0,0]:[0,0,1];
  let x=[y[1]*seed[2]-y[2]*seed[1],y[2]*seed[0]-y[0]*seed[2],y[0]*seed[1]-y[1]*seed[0]],n=Math.hypot(...x)||1;x=x.map(v=>v/n*width);
  const z=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];
  return new Float32Array([...x,0,...y.map(v=>v*length),0,...z,0,a.x,a.y,a.z,1]);
}
export function chapelTapeDemandInstances(state,{plan,context,group,listener,timeSec=0,reducedMotion=false}={}){
  if(!chapelTapeDemandVisible(state,context)||!listener||!plan?.isLoaded?.())return[];
  const key=plan.physicalSpanData?.()||plan;if(key!==planKey){planKey=key;placements=buildChapelTapeDemandWalls(plan);}
  const out=placements.filter(p=>p.group===group&&Math.hypot(p.x-listener.x,p.z-listener.z)<32)
    .sort((a,b)=>Math.hypot(a.x-listener.x,a.z-listener.z)-Math.hypot(b.x-listener.x,b.z-listener.z)).slice(0,112);
  if(state.status!=='caught'||state.catch?.group!==group)return out;
  const yaw=Number(listener.yaw)||0,right=[Math.cos(yaw),Math.sin(yaw)],forward=[Math.sin(yaw),-Math.cos(yaw)],p=state.progress;
  const strain=reducedMotion?0:Math.sin(timeSec*11)*.006*Math.sin(Math.PI*p);
  // The carried case is below the rendered eye, not below the logical cell's
  // corner. It follows the eased physical yaw while the snag remains fixed in
  // the room. Pitch still lets the player look away from the physical object.
  const eye=listener.eye||{x:listener.x,y:listener.y+EYE,z:listener.z};
  const bag={x:eye.x+forward[0]*(.76-p*.05)+right[0]*(.24+strain),y:eye.y-.43+p*.05,z:eye.z+forward[1]*(.76-p*.05)+right[1]*(.24+strain)};
  const caseYaw=yaw+.12-p*.16;
  out.push({id:'chapel-tape-demand:caught-case',mesh:'tape_demand_field_case',...bag,yaw:caseYaw,zone:listener.zone,structural:false});
  const ring={x:bag.x-Math.cos(caseYaw)*.145,y:bag.y+.17,z:bag.z-Math.sin(caseYaw)*.145},anchor=state.catch.anchor;
  // Slightly dog-legged slack before tension becomes a direct, taut strap.
  const middle={x:(anchor.x+ring.x)/2,y:(anchor.y+ring.y)/2-.055*(1-p),z:(anchor.z+ring.z)/2};
  out.push({id:'chapel-tape-demand:strap-a',mesh:'tape_demand_strap',matrix:segmentMatrix(anchor,middle),structural:false,zone:listener.zone},
    {id:'chapel-tape-demand:strap-b',mesh:'tape_demand_strap',matrix:segmentMatrix(middle,ring),structural:false,zone:listener.zone},
    {id:'chapel-tape-demand:wall-catch',mesh:'tape_demand_wall_catch',x:anchor.x,y:anchor.y,z:anchor.z,yaw:state.catch.wallYaw,structural:false,zone:listener.zone});
  return out;
}
