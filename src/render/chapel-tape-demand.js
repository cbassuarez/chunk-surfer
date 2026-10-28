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
const finitePoint=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]));
function floorSupportsSpill(plan,x,z,floor,group,radius){
  const cells=plan.physicalSpanData?.()?.cells;
  if(!(cells instanceof Map))return true;
  return[[0,0],[-radius,0],[radius,0],[0,-radius],[0,radius]].every(([dx,dz])=>
    cells.get(`${Math.floor((x+dx)/CELL)},${Math.floor((z+dz)/CELL)}`)?.some(span=>span.renderGroup===group&&Math.abs(span.floor-floor)<.06));
}
// A torn section is ordinary world geometry, placed on the support where it
// actually fell. It stays there after the case is reclaimed and across reload;
// the camera never becomes its parent, and it cannot leak to another floor.
export function chapelTapeSpillInstances(state,{plan,group}={}){
  const spill=state?.spill;
  if(!state?.route||!spill||spill.group!==group||!['departing','caught','released'].includes(state.status)
    ||!Number.isFinite(spill.position?.x)||!Number.isFinite(spill.position?.y)||!finitePoint(spill.anchor)||!plan?.isLoaded?.())return[];
  const at=plan.logicalToPhysical(spill.position.x,spill.position.y);
  if(at?.renderGroup!==group||!Number.isFinite(at.y))return[];
  const floor=at.y,base={x:(at.x+.5)*CELL,y:floor+.006,z:(at.z+.5)*CELL},seed=hash(String(spill.damageId||spill.id||'spill'));
  const zone=plan.zoneAt(spill.position.x,spill.position.y),out=[];
  // Vary the lay of the loops, never the physical tape width.
  const poses=[{dx:0,dz:0,scale:1},{dx:.15,dz:.10,scale:1},{dx:-.10,dz:.16,scale:1}];
  for(const[index,p]of poses.entries()){
    const x=base.x+p.dx,z=base.z+p.dz;
    if(!floorSupportsSpill(plan,x,z,floor,group,.27*p.scale))continue;
    out.push({id:`chapel-tape-demand:spill-coils-${index}`,mesh:'tape_demand_tape_coils',x,y:base.y+index*.002,z,
      yaw:(seed%628)/100+index*1.97,scale:p.scale,zone,structural:false,noShadow:true,blocks:false,spillId:spill.damageId||spill.id||null});
  }
  if(!out.length)return out;
  // Once the player takes the case back these are cut/creased scraps. Keeping
  // an invisible line attached to a carried recorder would invent a new grip.
  if(state.status==='caught'&&state.catch?.holder==='anchor'&&state.catch.group===group){
    const top={...spill.anchor,y:spill.anchor.y-.12};
    const fall={x:(top.x+base.x)/2+.045,y:floor+.40,z:(top.z+base.z)/2};
    const points=[top,fall,{x:base.x,y:floor+.018,z:base.z}];
    for(let i=0;i<points.length-1;i++)out.push({id:`chapel-tape-demand:spill-falling-${i}`,mesh:'tape_demand_tape_strip',matrix:segmentMatrix(points[i],points[i+1]),zone,structural:false,noShadow:true,blocks:false});
  }
  return out;
}
export function chapelTapeDemandInstances(state,{plan,context,group,listener,timeSec=0,reducedMotion=false,warning=null}={}){
  if(!chapelTapeDemandVisible(state,context)||!listener||!plan?.isLoaded?.())return[];
  const key=plan.physicalSpanData?.()||plan;if(key!==planKey){planKey=key;placements=buildChapelTapeDemandWalls(plan);}
  const out=placements.filter(p=>p.group===group&&Math.hypot(p.x-listener.x,p.z-listener.z)<32)
    .sort((a,b)=>Math.hypot(a.x-listener.x,a.z-listener.z)-Math.hypot(b.x-listener.x,b.z-listener.z)).slice(0,112);
  out.push(...chapelTapeSpillInstances(state,{plan,group}));
  const caught=state.status==='caught',held=caught&&state.catch?.holder==='anchor';
  if(!state.route||caught&&state.catch?.group!==group)return out;
  const spatial=state.catch?.mode==='spatial';
  const yaw=Number(listener.yaw)||0,right=[Math.cos(yaw),Math.sin(yaw)],forward=[Math.sin(yaw),-Math.cos(yaw)],p=caught?(spatial?state.catch.strainSeconds||0:state.progress):0;
  const strain=reducedMotion?0:caught?Math.sin(timeSec*11)*.006*Math.sin(Math.PI*p):warning?Math.min(.025,warning.seconds*.018):0;
  // The carried case is below the rendered eye, not below the logical cell's
  // corner. It follows the eased physical yaw while the snag remains fixed in
  // the room. Pitch still lets the player look away from the physical object.
  const eye=listener.eye||{x:listener.x,y:listener.y+EYE,z:listener.z};
  let bag={x:eye.x+forward[0]*(.76-p*.05)+right[0]*(.24+strain),y:eye.y-.43+p*.05,z:eye.z+forward[1]*(.76-p*.05)+right[1]*(.24+strain)};
  let caseYaw=yaw+.12-p*.16;
  if(held){
    const anchor=state.catch.anchor,at=plan.logicalToPhysical(state.catch.position.x,state.catch.position.y);
    const dx=at.x*CELL-anchor.x,dz=at.z*CELL-anchor.z,length=Math.hypot(dx,dz)||1;
    bag={x:anchor.x+dx/length*.20,y:anchor.y-.16,z:anchor.z+dz/length*.20};caseYaw=state.catch.wallYaw;
  }
  const damaged=state.caseDamaged||state.failures>=1;
  out.push({id:'chapel-tape-demand:'+(held?'held-case':caught?'caught-case':'carried-case'),mesh:damaged?'tape_demand_field_case_broken':'tape_demand_field_case',...bag,yaw:caseYaw,zone:listener.zone,structural:false});
  if(damaged)out.push({id:'chapel-tape-demand:loose-tape-leader',mesh:'tape_demand_tape_leader',...bag,yaw:caseYaw,zone:listener.zone,structural:false,noShadow:true});
  if(!caught)return out;
  const ring={x:bag.x-Math.cos(caseYaw)*.145,y:bag.y+.17,z:bag.z-Math.sin(caseYaw)*.145},anchor=state.catch.anchor;
  // Slightly dog-legged slack before tension becomes a direct, taut strap.
  const reach=Math.hypot(listener.x-anchor.x,listener.z-anchor.z),slack=spatial?Math.max(0,Math.min(1,(state.catch.initialDistance-reach)/.65)):1-p;
  const middle={x:(anchor.x+ring.x)/2,y:(anchor.y+ring.y)/2-(held?.025:.055+.18*slack),z:(anchor.z+ring.z)/2};
  out.push({id:'chapel-tape-demand:strap-a',mesh:'tape_demand_strap',matrix:segmentMatrix(anchor,middle),structural:false,zone:listener.zone},
    {id:'chapel-tape-demand:strap-b',mesh:'tape_demand_strap',matrix:segmentMatrix(middle,ring),structural:false,zone:listener.zone});
  if(state.catch.kind!=='congregation')out.push({id:'chapel-tape-demand:wall-catch',mesh:'tape_demand_wall_catch',x:anchor.x,y:anchor.y,z:anchor.z,yaw:state.catch.wallYaw,structural:false,zone:listener.zone});
  if(damaged&&!held){
    // The sprung lid exposes the medium before a second failure. More outward
    // strain draws a longer visible loop; reduced motion retains that causal
    // change while removing the incidental tremor above.
    const t=Math.max(0,Math.min(1,(state.catch.strainSeconds||0)/1.8));
    const mouth={x:bag.x-Math.sin(caseYaw)*.07,y:bag.y+.07,z:bag.z+Math.cos(caseYaw)*.07};
    const loop={x:(mouth.x+anchor.x)/2,y:Math.min(mouth.y,anchor.y)-.10-.23*t,z:(mouth.z+anchor.z)/2};
    out.push({id:'chapel-tape-demand:unreeling-a',mesh:'tape_demand_tape_strip',matrix:segmentMatrix(mouth,loop),zone:listener.zone,structural:false,noShadow:true},
      {id:'chapel-tape-demand:unreeling-b',mesh:'tape_demand_tape_strip',matrix:segmentMatrix(loop,anchor),zone:listener.zone,structural:false,noShadow:true});
  }
  return out;
}
