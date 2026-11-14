// A bounded lean toward the real instrument. The body and its collision stay
// put; the lens frames the reachable object instead of scaling a second copy.
const finite=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,finite(v,a)));
const lerp=(a,b,t)=>a+(b-a)*t;
const mix3=(a,b,t)=>a.map((v,i)=>lerp(v,b[i],t));
const length=v=>Math.hypot(...v);
const unit=v=>{const n=length(v)||1;return v.map(x=>x/n);};
const shortest=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
function placement(prop){
  if(prop.matrix?.length===16)return prop.matrix;
  const a=finite(prop.yaw),c=Math.cos(a),s=Math.sin(a),scale=finite(prop.scale,1);
  return[c*scale*(prop.scaleX??1),0,s*scale*(prop.scaleX??1),0,0,scale*(prop.scaleY??1),0,0,-s*scale*(prop.scaleZ??1),0,c*scale*(prop.scaleZ??1),0,finite(prop.x),finite(prop.y),finite(prop.z),1];
}
const point=(m,p)=>[0,1,2].map(r=>m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]+m[12+r]);
export const PRACTICE_METRONOME_INSPECTION=Object.freeze({maxLeanM:.85,eyeRadiusM:.075,stepM:.025,frontDistanceM:.70,heightFraction:.64});
export function makePracticeMetronomeInspectionPlan({prop={},originCamera={},aspect=1.6,canOccupyEye=()=>true}={}){
  const C=PRACTICE_METRONOME_INSPECTION,m=placement(prop);
  const object=point(m,[0,.225,-.074]),top=point(m,[0,.421,0]),bottom=point(m,[0,0,0]);
  const front=unit([-m[8],-m[9],-m[10]]),right=unit([m[0],m[1],m[2]]);
  const origin=[finite(originCamera.eye?.x),finite(originCamera.eye?.y),finite(originCamera.eye?.z)];
  const desired=object.map((v,i)=>v+front[i]*C.frontDistanceM+right[i]*.065+(i===1?.065:0));
  const travel=desired.map((v,i)=>v-origin[i]),distance=length(travel),limit=Math.min(1,C.maxLeanM/Math.max(.0001,distance));
  let allowed=0,blocked=false;
  // Sweep at eye height and test a small head-clearance envelope, not the
  // body's floor footprint. This permits looking over a piano without going
  // through its lid, a cello, a wall or a door leaf.
  const steps=Math.max(1,Math.ceil(Math.min(distance,C.maxLeanM)/C.stepM));
  for(let i=1;i<=steps;i++){
    const t=limit*i/steps,eye=mix3(origin,desired,t);
    if(!canOccupyEye({x:eye[0],y:eye[1],z:eye[2],radius:C.eyeRadiusM})){blocked=true;break;}
    allowed=t;
  }
  const eye=mix3(origin,desired,allowed),depth=length(object.map((v,i)=>v-eye[i]));
  const height=length(top.map((v,i)=>v-bottom[i]));
  const tan=clamp(height/(2*C.heightFraction*Math.max(.2,depth)),24/(2*85),24/(2*20));
  // Leave the recorder's right-hand territory intact; the actual instrument
  // is slightly left of centre, with its room visible beyond the far edge.
  const cameraRight=unit([Math.cos(Math.atan2(object[0]-eye[0],eye[2]-object[2])),0,Math.sin(Math.atan2(object[0]-eye[0],eye[2]-object[2]))]);
  const aim=object.map((v,i)=>v+cameraRight[i]*(.12*depth*tan*Math.max(.8,finite(aspect,1.6))));
  const yaw=Math.atan2(aim[0]-eye[0],eye[2]-aim[2]),pitch=Math.atan2(aim[1]-eye[1],Math.hypot(aim[0]-eye[0],aim[2]-eye[2]));
  return{origin:{eye:origin,yaw:finite(originCamera.yaw),pitch:finite(originCamera.pitch),tanHalfFov:clamp(originCamera.tanHalfFov,.1,1.5)},
    // Keep the original eye separately; `eye` above is the final close mark.
    originEye:origin,eye,object,aim,yaw,pitch,tanHalfFov:tan,focusDistanceM:depth,
    diagnostics:{leanM:length(eye.map((v,i)=>v-origin[i])),blocked,sourceDistanceM:length(object.map((v,i)=>v-origin[i])),
      predictedHeightFraction:height/(2*tan*Math.max(.2,depth)),frontFacing:front.reduce((sum,v,i)=>sum+v*(origin[i]-object[i]),0)>0,finalFrontFacing:front.reduce((sum,v,i)=>sum+v*(eye[i]-object[i]),0)>0}};
}
export function practiceMetronomeInspectionCamera(plan,mix=1){
  if(!plan)return null;
  const t=clamp(mix,0,1),eye=mix3(plan.originEye,plan.eye,t),tan=lerp(plan.origin.tanHalfFov,plan.tanHalfFov,t);
  return{eye,yaw:plan.origin.yaw+shortest(plan.origin.yaw,plan.yaw)*t,pitch:lerp(plan.origin.pitch,plan.pitch,t),
    lens:{focalLengthMm:24/(2*tan),sensorHeightMm:24,focusDistanceM:Math.max(.2,length(plan.object.map((v,i)=>v-eye[i]))),
      apertureFNumber:11,maxBlurPx:1.25*t}};
}
