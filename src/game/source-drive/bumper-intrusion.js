// One transient remembered collision. This module owns only a temporary prop
// and its presentation clock: vehicle simulation, camera, tape and saves stay
// with the drive host. Call presented(true) only after a successful native draw.
import {PREDICAMENT_MESH_BOUNDS,PREDICAMENT_LAMP_ANCHORS} from './predicaments/bounds.js';
import {DRIVE_BODY_FOOTPRINT} from './vehicle-contacts.js';

export const BUMPER_INTRUSION=Object.freeze({
  id:'drive-rear-bumper-intrusion',mesh:'dp_wreck_saloon',
  minimumTime:5,fromDistance:75,toDistance:145,minimumSpeed:5,
  farRearDistance:12,nearRearDistance:2.2,quietRearDistance:6,
  approachSeconds:.075,closestHoldSeconds:0,quietHoldSeconds:.10,recoverySeconds:0,
  maximumDreamLift:.60,lampEmissiveScale:.12,lampIntensity:.10,lampRadius:.7,
  rearZ:PREDICAMENT_MESH_BOUNDS.dp_wreck_saloon.max[2],vanNoseZ:-DRIVE_BODY_FOOTPRINT.front,
});
const C=BUMPER_INTRUSION,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const matrixOK=m=>m?.length===16&&Array.from(m).every(finite);
const point=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
const localPoint=(m,p)=>{const d=p.map((v,i)=>v-m[12+i]);return[m[0]*d[0]+m[1]*d[1]+m[2]*d[2],m[4]*d[0]+m[5]*d[1]+m[6]*d[2],m[8]*d[0]+m[9]*d[1]+m[10]*d[2]];};
const sceneOf=f=>f?.renderFrame?.scene;
const bodyOf=f=>sceneOf(f)?.body||f?.vehiclePose?.bodyMatrix;
const isDrive=f=>!!f?.controlsEnabled&&f?.phase==='free-drive'&&!!f?.renderFrame&&f.worldOwner!=='return'&&!f.skipped&&!f.finished;
const ease=n=>n*n;
const owned=object=>object?.id===C.id||String(object?.id||'').startsWith(C.id+'-');
function lampMatrix(car,anchor){
  const centre=point(car,anchor.centre),m=[0,0,0,0,0,0,0,0,0,0,0,0,...centre,1];
  for(const[column,axis]of[[0,anchor.x],[4,anchor.y],[8,anchor.z]])for(let k=0;k<3;k++)m[column+k]=car[k]*axis[0]+car[4+k]*axis[1]+car[8+k]*axis[2];
  return m;
}

/**
 * update(dt, controllerFrame, {allowTrigger=true,reducedMotion=false,
 *   reducedDread=false,effectsMode='full'}) advances active presentation time.
 *   Zero dt freezes time and entry, but still applies accessibility downgrades
 *   and terminal route cancellation. A consumed event never upgrades intensity.
 * apply(controllerFrame) returns a frame containing the temporary prop, without
 *   changing the input or any physics/camera field. Pass that result to renderer.
 * presented(success) acknowledges the most recent apply; returns one impact
 *   event or null. Failed draws never acknowledge a pose or produce sound.
 * cancel() permanently removes the intrusion; snapshot() is detached QA data.
 */
export function createBumperIntrusion(){
  let phase='waiting',mode=null,elapsed=0,closestAge=0,recoveryAge=0;
  let basis=null,eyeLocal=null,closestDistance=C.nearRearDistance;
  let triggeredAt=null,reason=null,acknowledged=false,impactEmitted=false;
  let lastApplied=null,presentation=null;
  const active=()=>phase==='approach'||phase==='closest';
  const distance=()=>mode==='full'?C.farRearDistance+(closestDistance-C.farRearDistance)*ease(clamp(elapsed/C.approachSeconds,0,1)):C.quietRearDistance;
  // Deliberate dream perspective: the perceived rear lifts above the bonnet
  // during the last closing image. This is not a physical vehicle trajectory;
  // the real body, eye, road and collisions never receive this translation.
  const dreamLift=()=>active()&&mode==='full'?C.maximumDreamLift*clamp(elapsed/C.approachSeconds,0,1)**3:0;
  function snapshot(){return{phase,mode,elapsed,closestAge,recoveryAge,triggered:triggeredAt!==null,triggeredAt:triggeredAt?{...triggeredAt}:null,
    consumed:phase==='spent'||phase==='cancelled'||triggeredAt!==null,visible:active(),rearDistance:active()?distance():null,
    dreamLift:dreamLift(),physicalVehiclePath:false,
    closestPresented:acknowledged,impactEmitted,reason,cameraChanged:false,collisionAdded:false,
    presentation:presentation?{...presentation}:null};}
  function cancel(){if(phase!=='spent'&&phase!=='cancelled'){phase='cancelled';reason='host-cancelled';}lastApplied=null;return snapshot();}
  function eligible(f,p){
    const v=f?.vehiclePose,l=f?.look,scene=sceneOf(f);
    return p.allowTrigger!==false&&isDrive(f)&&finite(f.timeSec)&&f.timeSec>=C.minimumTime
      &&finite(v?.distance)&&v.distance>=C.fromDistance&&v.distance<C.toDistance
      &&finite(v?.speed)&&v.speed>=C.minimumSpeed&&finite(l?.yaw)&&Math.abs(l.yaw)<=.30
      &&finite(l?.pitch)&&l.pitch>=-.25&&l.pitch<=.15&&matrixOK(bodyOf(f))
      &&scene?.eye?.length===3&&scene.eye.every(finite);
  }
  function update(dt,f,p={}){
    lastApplied=null;
    const step=finite(dt)?Math.max(0,dt):0;
    if(phase==='spent'||phase==='cancelled')return snapshot();
    if(phase!=='waiting'){
      // A pause may remove control ownership without leaving free driving.
      // Skip/fall/return is terminal even if its host tick is held.
      if(f?.phase!=='free-drive'||f.worldOwner==='return'||f.skipped||f.finished){phase='cancelled';reason='drive-no-longer-free';return snapshot();}
      if(p.effectsMode==='off'){
        phase='spent';mode='disabled';reason='effects-disabled';presentation={...presentation,effectsMode:'off'};return snapshot();
      }
      const next=p.reducedDread?'quiet':p.reducedMotion&&mode==='full'?'still':mode;
      if((next==='quiet'&&mode!=='quiet')||(next==='still'&&mode==='full')){
        mode=next;presentation={...presentation,reducedMotion:presentation.reducedMotion||!!p.reducedMotion,reducedDread:presentation.reducedDread||!!p.reducedDread};
        if(active()){phase='closest';closestAge=0;acknowledged=false;}
      }
    }
    // A held host cannot trigger, age, or release the image on elapsed time.
    if(step===0)return snapshot();
    if(phase==='waiting'){
      if(!eligible(f,p))return snapshot();
      triggeredAt={timeSec:f.timeSec,distance:f.vehiclePose.distance,speed:f.vehiclePose.speed};
      presentation={reducedMotion:!!p.reducedMotion,reducedDread:!!p.reducedDread,effectsMode:p.effectsMode||'full'};
      if(p.effectsMode==='off'){phase='spent';mode='disabled';reason='effects-disabled';return snapshot();}
      mode=p.reducedDread?'quiet':p.reducedMotion?'still':'full';
      basis=Array.from(bodyOf(f));eyeLocal=localPoint(basis,sceneOf(f).eye);
      // Even an unusual eye mount must leave the complete saloon rear ahead
      // of the van's physical nose. No guessed camera-near-plane clipping.
      closestDistance=Math.max(C.nearRearDistance,eyeLocal[2]-C.vanNoseZ+.12);
      phase=mode==='full'?'approach':'closest';return snapshot();
    }
    if(!isDrive(f)){phase='cancelled';reason='drive-no-longer-free';return snapshot();}
    if(phase==='approach'){
      elapsed=Math.min(C.approachSeconds,elapsed+step);
      if(elapsed>=C.approachSeconds){phase='closest';closestAge=0;}
    }else if(phase==='closest'){
      closestAge+=step;
      const hold=mode==='full'?C.closestHoldSeconds:C.quietHoldSeconds;
      if(acknowledged&&closestAge>=hold){
        phase=C.recoverySeconds>0?'recovery':'spent';recoveryAge=0;
        if(phase==='spent')reason='completed';
      }
    }else if(phase==='recovery'){
      recoveryAge=Math.min(C.recoverySeconds,recoveryAge+step);
      if(recoveryAge>=C.recoverySeconds){phase='spent';reason='completed';}
    }
    return snapshot();
  }
  function apply(f){
    lastApplied=null;
    if(!active()||!isDrive(f)||!matrixOK(bodyOf(f))){
      const old=sceneOf(f);
      if(!old||(!(old.props||[]).some(owned)&&!(old.lamps||[]).some(owned)))return f;
      const scene={...old,props:(old.props||[]).filter(p=>!owned(p)),lamps:(old.lamps||[]).filter(p=>!owned(p))};delete scene.bumperIntrusion;
      const out={...f,renderFrame:{...f.renderFrame,scene}};delete out.bumperIntrusion;return out;
    }
    const scene=sceneOf(f),body=bodyOf(f),matrix=basis.slice(),rearDistance=distance();
    // Captured orientation, current vehicle translation. Mouse-look never
    // moves the car, and the prop has the saloon's original metre scale.
    matrix[12]=body[12];matrix[13]=body[13];matrix[14]=body[14];
    const lift=dreamLift(),origin=point(matrix,[eyeLocal[0],lift,eyeLocal[2]-rearDistance-C.rearZ]);
    matrix[12]=origin[0];matrix[13]=origin[1];matrix[14]=origin[2];
    const qa={id:C.id,mode,phase,rearDistance,rearPlane:point(matrix,[0,0,C.rearZ]),dreamLift:lift,physicalVehiclePath:false,cameraChanged:false,collisionAdded:false};
    const prop={id:C.id,mesh:C.mesh,matrix,x:origin[0],y:origin[1],z:origin[2],structural:true,skyExposed:true,
      sourceStructure:'drive-memory-intrusion',bumperIntrusion:{...qa},cullRadius:5};
    const powered=[],lights=[];
    for(const anchorName of['rearLeft','rearRight']){
      const anchor=PREDICAMENT_LAMP_ANCHORS[C.mesh][anchorName],m=lampMatrix(matrix,anchor),position=point(m,[0,0,-.014]),id=C.id+'-powered-'+anchorName;
      powered.push({id,mesh:'dp_wreck_broken_lamp',matrix:m,x:m[12],y:m[13],z:m[14],structural:true,skyExposed:true,
        sourceStructure:'drive-memory-intrusion',sourceMemoryFixture:true,practicalEmissiveScale:C.lampEmissiveScale,
        emissive:[1,.004,.001,3],bumperIntrusion:{anchor:anchorName,steady:true},cullRadius:1});
      lights.push({id:id+'-light',anchorPropId:id,x:position[0],y:position[1],z:position[2],color:[1,.004,.001],
        intensity:C.lampIntensity,radius:C.lampRadius,penetration:1,fixture:'remembered-rear-lamp',car:C.id,anchor:anchorName,steady:true});
    }
    const nextScene={...scene,props:[...(scene.props||[]).filter(p=>!owned(p)),prop,...powered],
      lamps:[...(scene.lamps||[]).filter(p=>!owned(p)),...lights],bumperIntrusion:{...qa}};
    lastApplied={phase,mode,rearDistance};
    return{...f,bumperIntrusion:snapshot(),renderFrame:{...f.renderFrame,scene:nextScene}};
  }
  function presented(success){
    const rendered=lastApplied;lastApplied=null;
    if(success!==true||!rendered||rendered.phase!=='closest'||phase!=='closest')return null;
    if(!acknowledged)closestAge=0;
    acknowledged=true;
    if(impactEmitted||mode==='quiet')return null;
    impactEmitted=true;
    return{kind:'bumper-intrusion-impact',id:C.id,strength:mode==='still'?.35:1,mode,
      rearDistance:rendered.rearDistance,cameraChanged:false};
  }
  return{update,apply,presented,cancel,snapshot};
}
