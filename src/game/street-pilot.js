// Pure prototype of one local crossing. No listeners, global timers, save
// writes, route installation, interaction, damage or player collision live here.
import { STREET_PILOT, STREET_PILOT_MESHES,streetPilotFloorAt } from '../data/street-pilot.js';
import { ZONE } from '../data/floorplan/legend.js';

const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const modulo=(value,period)=>((value%period)+period)%period;

export function streetPilotSignalFrame(timeSec=0){
  const c=STREET_PILOT.cycle,phaseSec=modulo(finite(timeSec),c.seconds);
  let phase,vehicle,pedestrian;
  if(phaseSec<c.pedestrianGreenEnd){
    phase='pedestrian-walk';vehicle='red';pedestrian='green';
  }else if(phaseSec<c.pedestrianClearanceEnd){
    phase='pedestrian-clearance';vehicle='red';pedestrian='blackout';
  }else if(phaseSec<c.vehicleRedAmberStart){
    phase='pedestrian-clearance-all-red';vehicle='red';pedestrian='red';
  }else if(phaseSec<c.vehicleGreenStart){
    phase='red-amber';vehicle='red-amber';pedestrian='red';
  }else if(phaseSec<c.vehicleGreenEnd){
    phase='vehicle-green';vehicle='green';pedestrian='red';
  }else if(phaseSec<c.vehicleAmberEnd){
    phase='vehicle-amber';vehicle='amber';pedestrian='red';
  }else{
    phase='all-red';vehicle='red';pedestrian='red';
  }
  return{pilotId:STREET_PILOT.id,phaseSec,phase,vehicle,pedestrian,
    pedestrianMayStart:pedestrian==='green',
    vehicleMayStart:vehicle==='green'};
}

// A trip is authored from an off-street entry to the stop, held through the
// crossing phase, then released to an off-street exit. There is a real hidden
// interval between exit and the next approach; no on-street position is wrapped.
// Outside the road is not proof of camera occlusion: the integrated final-view
// capture still has to establish that these off-street windows are concealed.
export function streetPilotVehicleSchedule(vehicle){
  const node=typeof vehicle==='string'
    ?STREET_PILOT.vehicles.find(entry=>entry.id===vehicle):vehicle;
  if(!node||!STREET_PILOT[node.kind])throw new Error('Unknown street pilot vehicle');
  const spec=STREET_PILOT[node.kind],m=STREET_PILOT.motion,c=STREET_PILOT.cycle;
  const startX=node.direction>0?m.entryWestX:m.entryEastX;
  const endX=node.direction>0?m.entryEastX:m.entryWestX;
  const stopX=node.stopLineX-node.direction*(spec.envelopeLengthM/2+STREET_PILOT.noseClearanceM);
  const approachDistanceM=Math.abs(stopX-startX),exitDistanceM=Math.abs(endX-stopX);
  const brakingSeconds=m.speedMps/m.brakingMps2;
  const accelerationSeconds=m.speedMps/m.accelerationMps2;
  const brakingDistanceM=m.speedMps*m.speedMps/(2*m.brakingMps2);
  const accelerationDistanceM=m.speedMps*m.speedMps/(2*m.accelerationMps2);
  if(approachDistanceM<brakingDistanceM||exitDistanceM<accelerationDistanceM)
    throw new Error(`Street pilot ${node.id}: insufficient run for authored acceleration`);
  const approachSeconds=(approachDistanceM-brakingDistanceM)/m.speedMps+brakingSeconds;
  const exitSeconds=accelerationSeconds+(exitDistanceM-accelerationDistanceM)/m.speedMps;
  const approachStartSec=c.vehicleAmberEnd-approachSeconds;
  const exitEndSec=c.vehicleGreenStart+exitSeconds;
  if(exitEndSec>=approachStartSec)
    throw new Error(`Street pilot ${node.id}: no hidden interval between trips`);
  return{node,spec,startX,endX,stopX,approachDistanceM,exitDistanceM,
    tripDistanceM:approachDistanceM+exitDistanceM,
    approachStartSec,stopSec:c.vehicleAmberEnd,
    releaseSec:c.vehicleGreenStart,exitEndSec,
    cruiseApproachSeconds:(approachDistanceM-brakingDistanceM)/m.speedMps,
    brakingSeconds,brakingDistanceM,accelerationSeconds,accelerationDistanceM,
    hiddenSeconds:approachStartSec-exitEndSec};
}

function localToWorld(vehicle,point){
  const c=Math.cos(vehicle.yaw),s=Math.sin(vehicle.yaw);
  return{x:vehicle.x+c*point.x-s*point.z,y:vehicle.y+(point.y||0),
    z:vehicle.z+s*point.x+c*point.z};
}

export function streetPilotVehicleFrame(vehicle,timeSec=0){
  const q=streetPilotVehicleSchedule(vehicle),m=STREET_PILOT.motion,c=STREET_PILOT.cycle;
  const time=finite(timeSec),cycleIndex=Math.floor(time/c.seconds),phaseSec=modulo(time,c.seconds);
  let x=q.stopX,velocityMps=0,stage='held',travelledM=q.approachDistanceM;
  if(phaseSec>=q.releaseSec&&phaseSec<q.exitEndSec){
    stage='departing';const t=phaseSec-q.releaseSec;
    const d=t<q.accelerationSeconds ? .5*m.accelerationMps2*t*t
      :q.accelerationDistanceM+(t-q.accelerationSeconds)*m.speedMps;
    velocityMps=Math.min(m.speedMps,m.accelerationMps2*t);
    x=q.stopX+q.node.direction*d;travelledM=q.approachDistanceM+d;
  }else if(phaseSec>=q.exitEndSec&&phaseSec<q.approachStartSec){
    stage='off-street';x=q.endX;travelledM=q.tripDistanceM;
  }else if(phaseSec>=q.approachStartSec&&phaseSec<q.stopSec){
    stage='approaching';const t=phaseSec-q.approachStartSec;
    const brakeT=Math.max(0,t-q.cruiseApproachSeconds);
    const d=t<=q.cruiseApproachSeconds?t*m.speedMps:
      q.cruiseApproachSeconds*m.speedMps+m.speedMps*brakeT-.5*m.brakingMps2*brakeT*brakeT;
    velocityMps=Math.max(0,m.speedMps-m.brakingMps2*brakeT);
    x=q.startX+q.node.direction*d;
    travelledM=q.tripDistanceM+d;
  }else if(phaseSec>=q.stopSec){
    travelledM=q.tripDistanceM+q.approachDistanceM;
  }
  const halfLength=q.spec.envelopeLengthM/2,halfWidth=q.spec.envelopeWidthM/2;
  const bounds={x0:x-halfLength,x1:x+halfLength,
    z0:q.node.laneZ-halfWidth,z1:q.node.laneZ+halfWidth};
  const visible=stage!=='off-street'
    &&bounds.x1>=STREET_PILOT.districtRoad.x0&&bounds.x0<=STREET_PILOT.districtRoad.x1;
  const odometerM=cycleIndex*q.tripDistanceM+travelledM;
  return{id:`exterior-ambient:${q.node.id}`,sourceId:q.node.id,kind:q.node.kind,
    mesh:q.spec.mesh,x,y:STREET_PILOT.road.y,z:q.node.laneZ,yaw:q.node.direction*Math.PI/2,
    direction:q.node.direction,phaseSec,stage,visible,
    velocityMps,signedVelocityXMps:velocityMps*q.node.direction,
    odometerM,wheelAngle:-odometerM/q.spec.wheelRadiusM,bounds,
    noseX:x+q.node.direction*halfLength,tailX:x-q.node.direction*halfLength,
    stopLineX:q.node.stopLineX,headlights:true,
    structural:false,ambient:true,scale:1,zone:ZONE.street,skyExposed:true};
}

export function streetPilotTrafficFrame(timeSec=0){
  return STREET_PILOT.vehicles.map(vehicle=>streetPilotVehicleFrame(vehicle,timeSec));
}

export function streetPilotSafetyFrame(timeSec=0){
  const signal=streetPilotSignalFrame(timeSec),crossing=STREET_PILOT.crossing;
  const vehicles=streetPilotTrafficFrame(timeSec);
  const occupying=vehicles.filter(({bounds})=>bounds.x0<crossing.x1&&bounds.x1>crossing.x0
    &&bounds.z0<crossing.z1&&bounds.z1>crossing.z0).map(({sourceId})=>sourceId);
  return{signal,vehicles,occupying,
    pedestrianConflict:signal.pedestrianMayStart&&occupying.length>0,
    clearanceConflict:signal.pedestrian==='blackout'&&occupying.length>0};
}

export function streetPilotState(timeSec=0){
  return{timeSec:finite(timeSec),pilotId:STREET_PILOT.id,...streetPilotSafetyFrame(timeSec)};
}

// Column-major R_yaw * R_wheel about the wheel's local X axle. Both rotation
// axes and local -Z front match props3d.modelMatrix(); world anchoring is fixed.
export function streetPilotWheelMatrix(vehicle,centre,angle=vehicle.wheelAngle){
  const at=localToWorld(vehicle,centre),cy=Math.cos(vehicle.yaw),sy=Math.sin(vehicle.yaw);
  const cr=Math.cos(angle),sr=Math.sin(angle);
  return[
    cy,0,sy,0,
    -sy*sr,cr,cy*sr,0,
    -sy*cr,-sr,cy*cr,0,
    at.x,at.y,at.z,1,
  ];
}

export function streetPilotVehicleInstances({timeSec=0}={}){
  const instances=[];
  for(const vehicle of streetPilotTrafficFrame(timeSec)){
    if(!vehicle.visible)continue;
    const spec=STREET_PILOT[vehicle.kind];
    instances.push({...vehicle});
    if(!spec.wheelMesh)continue;
    for(const [index,centre]of spec.wheelCentres.entries()){
      const at=localToWorld(vehicle,centre);
      instances.push({id:`${vehicle.id}:wheel-${index+1}`,mesh:spec.wheelMesh,
        x:at.x,y:at.y,z:at.z,yaw:vehicle.yaw,scale:1,
        matrix:streetPilotWheelMatrix(vehicle,centre),
        wheelAngle:vehicle.wheelAngle,wheelOf:vehicle.sourceId,
        structural:false,ambient:true,zone:ZONE.street,skyExposed:true});
    }
  }
  return instances;
}

const fixedInstance=(node,mesh,suffix)=>({
  id:`street-pilot:${node.id}:${suffix}`,mesh,
  x:node.x,y:(streetPilotFloorAt(node.x,node.z)??0)+(node.y||0)-.003,
  z:node.z,yaw:node.yaw,scale:1,structural:false,zone:ZONE.civicCourt,skyExposed:true,
});

const signalEmission={
  red:[1,.055,.025,.65],amber:[1,.56,.08,.58],green:[.12,1,.24,.48],
};

export function streetPilotStaticInstances(){
  return[
    // The editable category meshes remain in the pack for controls; the live
    // street uses their single-material combined receiver to bound draw cost.
    ...['surface'].map(role=>({
      id:`street-pilot:${role}`,mesh:STREET_PILOT_MESHES[role],
      ...STREET_PILOT.groundAnchor,yaw:0,scale:1,structural:true,zone:ZONE.street,skyExposed:true})),
    ...STREET_PILOT.vehicleSignals.map(node=>fixedInstance(node,
      node.id.endsWith('secondary')?STREET_PILOT_MESHES.vehicleHead:STREET_PILOT_MESHES.vehicleHousing,'housing')),
    ...STREET_PILOT.pedestrianSignals.map(node=>fixedInstance(node,STREET_PILOT_MESHES.pedestrianHousing,'housing')),
  ];
}

export function streetPilotSignalInstances({timeSec=0}={}){
  const state=streetPilotSignalFrame(timeSec),meshes=STREET_PILOT_MESHES,instances=[];
  const aspects=state.vehicle==='red-amber'?['red','amber']:[state.vehicle];
  for(const node of STREET_PILOT.vehicleSignals)for(const aspect of aspects){
    const mesh={red:meshes.vehicleRed,amber:meshes.vehicleAmber,green:meshes.vehicleGreen}[aspect];
    instances.push({...fixedInstance(node,mesh,aspect),emissive:[...signalEmission[aspect]],
      noShadow:true,signalAspect:aspect,signalKind:'vehicle'});
  }
  if(state.pedestrian!=='blackout')for(const node of STREET_PILOT.pedestrianSignals){
    const mesh=state.pedestrian==='green'?meshes.pedestrianGreen:meshes.pedestrianRed;
    instances.push({...fixedInstance(node,mesh,state.pedestrian),emissive:[...signalEmission[state.pedestrian]],
      noShadow:true,signalAspect:state.pedestrian,signalKind:'pedestrian'});
  }
  return instances;
}

export function streetPilotDynamicInstances({timeSec=0}={}){
  return[...streetPilotVehicleInstances({timeSec}),...streetPilotSignalInstances({timeSec})];
}

export function streetPilotHeadlightLights({timeSec=0,origin={x:0,z:0},
  maxVehicles=STREET_PILOT.headlight.maxVehicles,maxDistance=STREET_PILOT.headlight.maxDistanceM}={}){
  const settings=STREET_PILOT.headlight,ox=finite(origin?.x),oz=finite(origin?.z);
  const vehicles=streetPilotTrafficFrame(timeSec).filter(vehicle=>vehicle.visible)
    .map(vehicle=>({...vehicle,distance:Math.hypot(vehicle.x-ox,vehicle.z-oz)}))
    .filter(vehicle=>vehicle.distance<=Math.max(0,finite(maxDistance)))
    .sort((a,b)=>a.distance-b.distance||a.sourceId.localeCompare(b.sourceId))
    .slice(0,Math.max(0,Math.floor(finite(maxVehicles))));
  return vehicles.flatMap(vehicle=>STREET_PILOT[vehicle.kind].headlamps.map((socket,index)=>{
    const lamp=localToWorld(vehicle,socket),forwardX=Math.sin(vehicle.yaw),forwardZ=-Math.cos(vehicle.yaw);
    return{id:`${vehicle.id}:headlight-${index+1}`,headlightOf:vehicle.id,
      x:lamp.x+forwardX*settings.projectionAheadM,y:lamp.y,
      z:lamp.z+forwardZ*settings.projectionAheadM,
      sourcePosition:lamp,color:[...settings.color],intensity:settings.intensity,radius:settings.radiusM,
      penetration:.08,spilling:false,kind:'fitting',circuit:null,maintained:true,
      nominalIntensity:settings.intensity,emissiveScale:1,castsShadow:false,zone:ZONE.street};
  }));
}

export function createStreetPilotClock({timeSec=0,
  maxAdvanceDeltaSec=STREET_PILOT.motion.maxAdvanceDeltaSec}={}){
  let seconds=Math.max(0,finite(timeSec)),discardedSeconds=0;
  return{
    advance(deltaSec,{paused=false,hidden=false,reducedMotion=false,enabled=true}={}){
      const delta=Math.max(0,finite(deltaSec));
      if(!enabled||paused||hidden)return seconds;
      const bounded=Math.min(delta,Math.max(0,finite(maxAdvanceDeltaSec)));
      discardedSeconds+=delta-bounded;
      seconds+=bounded*(reducedMotion?STREET_PILOT.motion.reducedMotionRate:1);
      return seconds;
    },
    inspect(){return{timeSec:seconds,discardedSeconds,signal:streetPilotSignalFrame(seconds)};},
    state(){return{...streetPilotState(seconds),discardedSeconds};},
    time(){return seconds;},
    reset(value=0){seconds=Math.max(0,finite(value));discardedSeconds=0;return seconds;},
  };
}
