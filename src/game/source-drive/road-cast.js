// Lays the roadside out through the same centreline the tyres and rails use. The
// caller passes its road so this module stays free of it.
import {ROAD_CAST,ROAD_CAST_LAMPS,ROAD_CAST_SOLIDS,ROAD_STUDS,ROAD_CAB_CUP,roadServicesWiden} from '../../data/road-cast.js';
import {ROAD_FLORA} from '../../data/ellery-flora.js';
import {ukRoadStudsBetween} from '../../data/uk-road-markings.js';

const SHOWN_BEHIND=150,SHOWN_AHEAD=280,FLORA_BEHIND=30,FLORA_AHEAD=90;

function pose(worldAt,row){
  const a=worldAt(row.d,row.lateral,row.lift||0),yaw=row.worldAligned?0:-a.heading+(row.yaw||0),c=Math.cos(yaw),s=Math.sin(yaw),scale=row.scale||[1,1,1],local=row.local||[0,0,0];
  const x=a.x+c*local[0]+s*local[2],z=a.z-s*local[0]+c*local[2],y=(a.y||0)+local[1];
  return{matrix:[c*scale[0],0,-s*scale[0],0,0,scale[1],0,0,s*scale[2],0,c*scale[2],0,32+x,y,32+z,1],x:32+x,y,z:32+z};
}
const prop=(mesh,id,placed)=>({id,mesh,matrix:placed.matrix,x:placed.x,y:placed.y,z:placed.z,structural:true,skyExposed:true,sourceStructure:'road-cast'});

/** Props and practical lamps within range of a van at road distance `d`. */
export function roadCastScene(d,worldAt){
  const props=[],lamps=[];
  for(const row of ROAD_CAST)if(row.d-d<SHOWN_AHEAD&&d-row.d<SHOWN_BEHIND)props.push(prop(row.mesh,row.id,pose(worldAt,row)));
  // What's growing on the verge, by headlamp only: it is low and it doesn't stay.
  for(const row of ROAD_FLORA)if(row.d-d<FLORA_AHEAD&&d-row.d<FLORA_BEHIND&&!(row.lateral<0&&roadServicesWiden(row.d)>.05))props.push({...prop(row.mesh,row.id,pose(worldAt,{...row,lift:.03,scale:[row.scale,row.scale,row.scale]})),...(row.emissive?{emissive:[...row.emissive]}:{})});
  // Cat's eyes in the gaps of whichever line is painted here (uk-road-markings.js).
  // The Source route past the join lays its own (scene.js); these stop short of it.
  const{from,to,behind,ahead,mesh}=ROAD_STUDS,retroreflectors=[];
  for(const at of ukRoadStudsBetween(Math.max(from,d-behind),Math.min(to,d+ahead),at=>at<to)){const placed=pose(worldAt,{d:at,lateral:0,lift:.002});props.push(prop(mesh,`road-stud-${at}`,placed));retroreflectors.push({x:placed.x,y:placed.y,z:placed.z});}
  for(const row of ROAD_CAST_LAMPS){
    if(Math.abs(row.d-d)>row.reach)continue;
    const at=pose(worldAt,{...row,lift:row.y});
    lamps.push({id:row.id,x:at.x,y:at.y,z:at.z,color:[...row.color],intensity:row.intensity,radius:row.radius,penetration:1});
  }
  return{props,lamps,retroreflectors};
}

/** Boxes in the shape the drive's contacts take, near a van at road distance `d`. */
export function roadCastSolids(d,worldAt){
  return ROAD_CAST_SOLIDS.filter(row=>Math.abs(row.d-d)<38).map(row=>{
    const at=pose(worldAt,row),heading=worldAt(row.d,row.lateral).heading;
    return{id:row.id,contactGroup:row.id,x:at.x-32,z:at.z-32,halfX:row.halfX,halfZ:row.halfZ,yaw:heading-(row.yaw||0)};
  });
}

/** The cup rides with the van. Same rigid frame as the cabin, so it tumbles with it. */
export function roadCabCup(scene){
  const m=scene?.body,q=scene?.cabPoint?.(ROAD_CAB_CUP.at);
  if(!m||!q)return null;
  const matrix=Array.from(m);matrix[12]=q[0];matrix[13]=q[1];matrix[14]=q[2];
  return{id:'road-cab-cup',mesh:ROAD_CAB_CUP.mesh,matrix,x:q[0],y:q[1],z:q[2],structural:true};
}
