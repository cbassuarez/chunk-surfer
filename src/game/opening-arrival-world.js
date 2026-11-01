// Shared physical coordinates for the driver, camera and the kit left in the
// parked van. The building's logical addresses never leak into vehicle maths.
export function openingChildPoint(point,origin,destination){
  const a=destination.yaw-origin.yaw,c=Math.cos(a),s=Math.sin(a),x=point.x-origin.x,z=point.z-origin.z;
  return{x:destination.x+c*x-s*z,y:(point.y||0)+(destination.y-origin.y),z:destination.z+s*x+c*z};
}
export function openingArrivalWorldView(frame,plan,{cell=.5,look=null}={}){
  const e=frame.eye;if(!e)return null;
  const eye=Array.isArray(e)?e:[e.x,e.y,e.z];
  const group=frame.renderGroup||frame.anchor?.group||'ground';
  const floor=frame.observer?.feet??frame.floorH??frame.anchor?.y??0;
  const o=frame.observer||{x:eye[0],z:eye[2]};
  const logical=plan.logicalAtPhysical(o.x/cell,o.z/cell,{group,floor});
  if(!logical)return null;
  const yaw=frame.freeLook&&look?look.yaw:frame.yaw;
  const pitch=frame.freeLook&&look?look.pitch:frame.pitch;
  return{x:logical.x,y:logical.y,floorH:eye[1]-1.62,endingShot:true,
    suppressActors:frame.nativeReturn!==true,ambientPeople:frame.nativeReturn===true||frame.ambientPeople===true,
    openingPresentation:true,openingOverture:frame.openingOverture===true,
    shotId:frame.shotId||'vehicle',sourcePlanId:frame.sourcePlanId||null,performanceSeconds:frame.performanceSeconds,
    nativeReturn:frame.nativeReturn===true,lightingOverride:frame.lightingOverride,lightScales:frame.lightScales,
    cinematicLensStage:frame.openingOverture?'post-print':undefined,renderGroup:group,physicalEye:eye,
    observerFloor:floor,windowPolicy:frame.windowPolicy,
    authoredCamera:Number.isFinite(yaw)&&Number.isFinite(pitch)?{eye,yaw,pitch,...(frame.lens?{lens:frame.lens}:{})}:null,
    ...(!frame.freeLook&&Number.isFinite(yaw)?{yaw,pitch}:{}),
  };
}

export function openingParkedPlacement(raw,origin,destination,plan,{cell=.5}={}){
  const at=plan.logicalToPhysical(raw.x/cell,raw.y/cell);
  const target=openingChildPoint({x:at.x*cell+(raw.renderOffsetX||0),y:at.y,z:at.z*cell+(raw.renderOffsetZ||0)},origin,destination);
  const q=plan.logicalAtPhysical(target.x/cell,target.z/cell,{group:origin.group||'ground',floor:destination.y});
  if(!q)return null;
  const logical={x:q.x*cell,y:q.y*cell},snapped=plan.logicalToPhysical(Math.round(q.x),Math.round(q.y));
  let inspectAt=raw.inspectAt;
  if(inspectAt){
    const p=plan.logicalToPhysical(inspectAt.x/cell,inspectAt.y/cell);
    const t=openingChildPoint({x:p.x*cell,y:p.y,z:p.z*cell},origin,destination);
    const iq=plan.logicalAtPhysical(t.x/cell,t.z/cell,{group:origin.group||'ground',floor:destination.y});
    if(iq)inspectAt={x:iq.x*cell,y:iq.y*cell};
  }
  return{...raw,...logical,yaw:(raw.yaw||0)+destination.yaw-origin.yaw,inspectAt,
    renderOffsetX:target.x-snapped.x*cell,renderOffsetZ:target.z-snapped.z*cell};
}

export function openingDriveColliders(plan,props,park,{cell=.5}={}){
  const result=[];
  // The approach is short. Collect real nearby navigation walls once; swept
  // vehicle contacts, including rotation, operate on these physical faces.
  for(let z=park.z-8;z<=park.z+46;z+=cell){
    let start=null;
    for(let x=park.x-34;x<=park.x+12+cell;x+=cell){
      const p=x<=park.x+12?plan.logicalAtPhysical(x/cell,z/cell,{group:park.group||'ground',floor:park.y}):null;
      const wall=x<=park.x+12&&(!p||plan.isSolid(p.x,p.y)||plan.isCollisionOnly?.(p.x,p.y));
      if(wall&&start===null)start=x;
      if(!wall&&start!==null){result.push({id:`opening-wall:${start}:${z}`,x:(start+x)/2,z:z+cell/2,halfX:(x-start)/2,halfZ:cell/2});start=null;}
    }
  }
  for(const p of props.structuralColliders()){
    if(park.y<p.minElevation-.1||park.y>p.maxElevation+.1)continue;
    const at=plan.logicalToPhysical(p.rx,p.ry);if(at.renderGroup!==park.group)continue;
    const x=at.x*cell,z=at.z*cell;if(Math.hypot(x-park.x,z-park.z)>65)continue;
    result.push({id:p.id,x,z,yaw:p.yaw||0,halfX:Math.max(.025,p.width/2-(p.bodyMargin||0)),halfZ:Math.max(.025,p.depth/2-(p.bodyMargin||0))});
  }
  for(const p of props.allProps()){
    if(!p.blocks||p.id==='yard-van'||p.id.startsWith('yard-van-')||p.renderGroup!==park.group)continue;
    if(Math.abs((p.floor||0)-park.y)>.2||!p.w||!p.d||p.w>12||p.d>12)continue;
    const at=plan.logicalToPhysical(p.rx,p.ry),x=at.x*cell+(p.renderOffsetX||0),z=at.z*cell+(p.renderOffsetZ||0);
    if(Math.hypot(x-park.x,z-park.z)>65)continue;
    result.push({id:p.id,x,z,yaw:p.yaw||0,halfX:p.w*(p.scale||1)/2,halfZ:p.d*(p.scale||1)/2});
  }
  return result;
}
