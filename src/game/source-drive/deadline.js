// First Strike stays on the actual finite Cut. Existing roadside courses move
// with matching transformed collision; the supported road is never replaced by
// an invisible plane, a new generic road, or an invented cliff fall.
import {roadSurfaceAt,roadAt} from './road.js';
import {roadBoundaryRecords,containsDrivePose,boundaryInnerLateral} from './route-boundaries.js';
import {driveBodyCorners,vehiclePoseIntersects} from './vehicle-contacts.js';

export const DRIVE_FIRST_STRIKE=Object.freeze({schema:1,duration:42,recognizeSeconds:6,settleAt:35,stopSeconds:2.5,maxDelta:.25,
  behindMetres:24,aheadMetres:100,maxCourses:44,maximumBankShift:3.1});
const finite=(n,f=0)=>typeof n==='number'&&Number.isFinite(n)?n:f;
const smooth=n=>{const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t);};
const copy=v=>JSON.parse(JSON.stringify(v));
const phaseAt=t=>t<6?'recognize':t<35?'clearance':t<42?'settling':'terminal';
const multiply=(a,b)=>Array.from({length:16},(_,i)=>{const r=i%4,c=Math.floor(i/4);return a[r]*b[c*4]+a[r+4]*b[c*4+1]+a[r+8]*b[c*4+2]+a[r+12]*b[c*4+3];});
const transform=(m,p)=>[0,1,2].map(i=>m[i]*p[0]+m[i+4]*p[1]+m[i+8]*p[2]+m[i+12]);

export function freshDriveFirstStrike(drive,{eventId=''}={}){
  const road=roadSurfaceAt(drive.x,drive.z),safeSide=road.leftWidth>=road.rightWidth?-1:1;
  const start=road.distance-DRIVE_FIRST_STRIKE.behindMetres,end=Math.min(1243,road.distance+DRIVE_FIRST_STRIKE.aheadMetres);
  const courses=roadBoundaryRecords(start,end).filter(row=>row.id.startsWith(safeSide<0?'route-edge-right-':'route-edge-left-'))
    .sort((a,b)=>Math.abs((a.start+a.end)/2-road.distance)-Math.abs((b.start+b.end)/2-road.distance))
    .slice(0,DRIVE_FIRST_STRIKE.maxCourses).map(row=>row.id);
  return {schema:1,eventId:String(eventId),elapsed:0,phase:'recognize',origin:{x:drive.x,z:drive.z,heading:drive.heading,speed:drive.speed,distance:road.distance},
    safeSide,start,end,courses,stopSeconds:0,safeReached:null,outcome:null,receipts:[],completionDelivered:false};
}
export function normalizeDriveFirstStrike(value){
  if(value?.schema!==1||!String(value.eventId||'')||![value.origin?.x,value.origin?.z,value.origin?.distance,value.start,value.end].every(Number.isFinite))return null;
  const elapsed=Math.max(0,Math.min(42,finite(value.elapsed)));
  const valid=new Set(roadBoundaryRecords(value.start,value.end).map(row=>row.id));
  return {schema:1,eventId:String(value.eventId),elapsed,phase:phaseAt(elapsed),origin:copy(value.origin),safeSide:value.safeSide===1?1:-1,
    start:value.start,end:value.end,courses:[...new Set((value.courses||[]).filter(id=>valid.has(id)))].slice(0,44),
    stopSeconds:Math.max(0,Math.min(2.5,finite(value.stopSeconds))),safeReached:['shoulder','clear-span','goods-door'].includes(value.safeReached)?value.safeReached:null,
    outcome:['survived','enclosed'].includes(value.outcome)?value.outcome:null,receipts:[...new Set((value.receipts||[]).filter(id=>typeof id==='string'))].slice(-96),
    completionDelivered:value.completionDelivered===true};
}

// The same original mesh bounds and submitted matrix produce each collider.
// Hinge/ground movement remains continuous; no new wall appears around the car.
export function driveFirstStrikeCourses(state){
  if(!state)return[];
  const selected=new Set(state.courses),side=-state.safeSide;
  return roadBoundaryRecords(state.start,state.end).filter(row=>selected.has(row.id)).map((row,index)=>{
    const d=(row.start+row.end)/2,road=roadAt(d),offset=Math.abs(d-state.origin.distance),releaseAt=1.9+Math.min(5,offset/24),
      settle=smooth((state.elapsed-releaseAt)/26),rock=Math.sin(Math.min(1,Math.max(0,(state.elapsed-releaseAt)/1.2))*Math.PI)*.03,
      angle=-(.68*settle+rock),c=Math.cos(angle),s=Math.sin(angle),rotation=[c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1],matrix=multiply(row.matrix,rotation),
      shift=DRIVE_FIRST_STRIKE.maximumBankShift*settle;
    matrix[12]-=side*Math.cos(road.heading)*shift;matrix[14]-=side*Math.sin(road.heading)*shift;matrix[13]-=.24*settle;
    const points=[];for(const x of[row.localBounds.min[0],row.localBounds.max[0]])for(const y of[row.localBounds.min[1],row.localBounds.max[1]])for(const z of[row.localBounds.min[2],row.localBounds.max[2]])points.push(transform(matrix,[x,y,z]));
    const yaw=row.collider.yaw,co=Math.cos(yaw),si=Math.sin(yaw),local=points.map(p=>({x:(p[0]-32)*co+(p[2]-32)*si,z:-(p[0]-32)*si+(p[2]-32)*co})),
      minX=Math.min(...local.map(p=>p.x)),maxX=Math.max(...local.map(p=>p.x)),minZ=Math.min(...local.map(p=>p.z)),maxZ=Math.max(...local.map(p=>p.z)),cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
    return {id:row.id,mesh:row.mesh,matrix,structural:true,skyExposed:true,sourceStructure:'drive-deadline-boundary',
      releaseAt,settle,collider:{id:row.id,contactGroup:'demolition-bank',x:co*cx-si*cz,z:si*cx+co*cz,halfX:(maxX-minX)/2,halfZ:(maxZ-minZ)/2,yaw},
      bounds:{min:points[0].map((_,i)=>Math.min(...points.map(p=>p[i]))),max:points[0].map((_,i)=>Math.max(...points.map(p=>p[i])))}};
  });
}
export function driveFirstStrikeColliders(state,ordinary){
  if(!state)return ordinary;
  const courses=driveFirstStrikeCourses(state),ids=new Set(courses.map(course=>course.id));
  return [...ordinary.filter(solid=>!ids.has(solid.id)),...courses.map(course=>course.collider)];
}
export function driveFirstStrikeSafety(state,drive){
  if(!state||!containsDrivePose(drive))return {safe:false,kind:null};
  const corners=driveBodyCorners(drive),roads=corners.map(p=>roadSurfaceAt(p.x,p.z));
  if(roads.some(r=>![r.distance,r.offset,r.height].every(Number.isFinite)))return{safe:false,kind:null};
  if(driveFirstStrikeCourses(state).some(course=>vehiclePoseIntersects(drive,course.collider)))return{safe:false,kind:null};
  const outside=roads.every(r=>r.distance>state.end+4)||roads.every(r=>r.distance<state.start-4);
  if(outside)return{safe:true,kind:'clear-span'};
  const shoulder=roads.every(r=>state.safeSide*r.offset>=(state.safeSide<0?r.leftWidth:r.rightWidth)-1.9
    &&state.safeSide*r.offset<=Math.abs(boundaryInnerLateral(r.distance,state.safeSide))-.015);
  return{safe:shoulder&&Math.hypot(drive.speed,drive.lateralSpeed||0)<.65,kind:shoulder?'shoulder':null};
}
export function stepDriveFirstStrike(value,drive,{dt=0,protected:held=false,doorCrossing=null}={}){
  const state=normalizeDriveFirstStrike(value),events=[];if(!state||held||state.outcome)return{state,events};
  const previous=state.elapsed,delta=Math.max(0,Math.min(.25,finite(dt)));state.elapsed=Math.min(42,state.elapsed+delta);state.phase=phaseAt(state.elapsed);
  const safety=driveFirstStrikeSafety(state,drive);
  state.stopSeconds=safety.safe&&safety.kind==='shoulder'?Math.min(2.5,state.stopSeconds+delta):0;
  state.safeReached=safety.safe&&(safety.kind==='clear-span'||state.stopSeconds>=2.5)?safety.kind:null;
  const emit=(type,key,position)=>{const id=state.eventId+':drive:'+key;if(state.receipts.includes(id))return;state.receipts.push(id);events.push({type,id,position,at:state.elapsed,gain:1});};
  for(const[type,at]of[['strain',.15],['first-strike',1.9],['final-settlement',35]])if(previous<at&&state.elapsed>=at){const a=roadAt(state.origin.distance+24);emit(type,type,{x:32+a.x,y:a.height+1,z:32+a.z});}
  if(doorCrossing?.complete){state.safeReached='goods-door';state.outcome='survived';state.phase='terminal';emit('terminal','terminal',{x:32+drive.x,y:drive.roadHeight+1,z:32+drive.z});}
  else if(state.elapsed>=42){state.phase='terminal';state.outcome=state.safeReached?'survived':'enclosed';emit('terminal','terminal',{x:32+drive.x,y:drive.roadHeight+1,z:32+drive.z});}
  return{state,events};
}
export function applyDriveFirstStrikeFrame(frame,state){
  if(!frame||!state)return frame;
  const courses=driveFirstStrikeCourses(state),map=new Map(courses.map(course=>[course.id,course]));
  frame.scene.props=frame.scene.props.map(prop=>{const course=map.get(prop.id);return course?{...prop,matrix:course.matrix,x:course.matrix[12],y:course.matrix[13],z:course.matrix[14],driveFirstStrike:true}:prop;});
  frame.scene.colliders=driveFirstStrikeColliders(state,frame.scene.colliders);frame.props=frame.scene.props;
  const dust=smooth((state.elapsed-4)/29),enclosing=state.safeReached?0:smooth((state.elapsed-35)/7);
  frame.weather={...frame.weather,fog:Math.max(frame.weather.fog||0,.55*dust+.4*enclosing),
    extinction:Math.max(frame.weather.extinction||0,.012*dust+.065*enclosing)};
  frame.firstStrike={...copy(state),courseCount:courses.length,instruction:`DEMOLITION · CLEAR ${state.safeSide<0?'LEFT':'RIGHT'} EDGE AND BRAKE`,
    dust,enclosing,events:[]};
  return frame;
}
