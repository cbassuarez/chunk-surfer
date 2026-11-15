// Approved ALBION performance shared by loader, Dock export and motion review.
// Canonical Transit: forward -Z, rear +Z, all distances metres.
export const SPEC=Object.freeze({duration:3.4,hz:480,radius:.33,track:1.66,
  frontZ:-1.3,rearZ:1.535,centerZ:.137,wheelbase:2.835,
  reverseStart:.08,reverseCruise:.59,brakeStart:.88,stop:1.42,
  depart:1.94,departureRamp:1.20,reverseDistance:1.1,forwardPeak:2.7});
export const STAGES=Object.freeze([{at:0,name:'Take up reverse'},{at:.08,name:'Reverse and align'},
  {at:.88,name:'Brake'},{at:1.42,name:'Settle · change gear'},{at:1.94,name:'Pull forward'}]);
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const ease=t=>{t=clamp(t);return t*t*(3-2*t);};
const reverseArea=(SPEC.reverseCruise-SPEC.reverseStart)/2+(SPEC.brakeStart-SPEC.reverseCruise)+(SPEC.stop-SPEC.brakeStart)/2;
const reversePeak=SPEC.reverseDistance/reverseArea;
export function speedAt(t){
 if(t<SPEC.reverseStart)return 0;
 if(t<SPEC.reverseCruise)return-reversePeak*ease((t-SPEC.reverseStart)/(SPEC.reverseCruise-SPEC.reverseStart));
 if(t<SPEC.brakeStart)return-reversePeak;
 if(t<SPEC.stop)return-reversePeak*(1-ease((t-SPEC.brakeStart)/(SPEC.stop-SPEC.brakeStart)));
 if(t<SPEC.depart)return 0;
 return SPEC.forwardPeak*ease((t-SPEC.depart)/SPEC.departureRamp);
}
function curvatureAt(t,reverseDistance){
 // A small real steering correction, unwound before stopping. No independent yaw tween.
 if(t<SPEC.stop)return .14*Math.sin(2*Math.PI*clamp(reverseDistance/SPEC.reverseDistance));
 if(t<SPEC.depart)return 0;
 return .17*ease((t-SPEC.depart)/.65);
}
const wheels=[{name:'front-left',x:-SPEC.track/2,z:SPEC.frontZ},
 {name:'front-right',x:SPEC.track/2,z:SPEC.frontZ},
 {name:'rear-left',x:-SPEC.track/2,z:SPEC.rearZ},
 {name:'rear-right',x:SPEC.track/2,z:SPEC.rearZ}];
const table=[];
let rearX=0,rearZ=0,yaw=0,travel=0,reverseTravel=0;
const rolls=[0,0,0,0],susp={pitch:0,pitchV:0,roll:0,rollV:0,heave:0,heaveV:0};
function spring(name,target,dt,frequency,damping){
 const w=2*Math.PI*frequency;
 susp[name+'V']+=(w*w*(target-susp[name])-2*damping*w*susp[name+'V'])*dt;
 susp[name]+=susp[name+'V']*dt;
}
for(let i=0;i<=Math.round(SPEC.duration*SPEC.hz);i++){
 const t=i/SPEC.hz,dt=i?1/SPEC.hz:0,mid=t-dt/2,v=speedAt(Math.max(0,mid));
 const a=(speedAt(Math.max(0,mid+.0001))-speedAt(Math.max(0,mid-.0001)))/.0002;
 const curvature=curvatureAt(mid,reverseTravel),omega=v*curvature;
 const headingMid=yaw+omega*dt/2;
 rearX+=-v*Math.sin(headingMid)*dt;rearZ+=-v*Math.cos(headingMid)*dt;yaw+=omega*dt;
 travel+=v*dt;if(v<0)reverseTravel-=v*dt;
 const lateral=v*v*curvature;
 spring('pitch',clamp(a*.0065,-.028,.028),dt,3.2,.72);
 spring('roll',clamp(-lateral*.014,-.021,.021),dt,2.7,.76);
 spring('heave',-Math.min(.012,Math.abs(a)*.0024),dt,3.7,.80);
 const wheelState=wheels.map((wheel,index)=>{
  const wheelbase=SPEC.rearZ-wheel.z;
  const localForward=1+curvature*wheel.x;
  const steer=wheelbase?Math.atan2(wheelbase*curvature,localForward):0;
  const signedWheelSpeed=v*Math.hypot(localForward,wheelbase*curvature);
  rolls[index]-=signedWheelSpeed*dt/SPEC.radius;
  return{...wheel,steer,spin:rolls[index],signedSpeed:signedWheelSpeed,
   distance:-rolls[index]*SPEC.radius};
 });
 const rearOffset=SPEC.rearZ-SPEC.centerZ;
 table.push({t,rearX,rearZ,x:rearX-Math.sin(yaw)*rearOffset,z:rearZ-Math.cos(yaw)*rearOffset,
  yaw,speed:speedAt(t),acceleration:a,curvature,omega,lateral,travel,reverseTravel,
  body:{pitch:susp.pitch,roll:susp.roll,heave:susp.heave},wheels:wheelState});
}
const parked=table[Math.round(SPEC.stop*SPEC.hz)];
// Choose the parked chassis as the world coordinate system. Rotate the entire
// path once; never correct heading separately from wheel travel.
const parkedX=parked.x,parkedZ=parked.z,parkedYaw=parked.yaw;
for(const row of table){
 for(const [x,z] of [['x','z'],['rearX','rearZ']]){
  const dx=row[x]-parkedX,dz=row[z]-parkedZ,c=Math.cos(parkedYaw),s=Math.sin(parkedYaw);
  row[x]=c*dx-s*dz;row[z]=s*dx+c*dz;
 }
 row.yaw-=parkedYaw;
}
export const samples=table;
export function maneuverAt(time,{presentation='loader',baseline=false}={}){
 let t=clamp(Number(time)||0,0,SPEC.duration);
 // Dock keeps the icon resident after the shared arrival and suspension settle.
 if(presentation==='dock')t=Math.min(t,SPEC.depart-1/SPEC.hz);
 const row=table[Math.min(table.length-1,Math.round(t*SPEC.hz))];
 const phase=STAGES.filter(stage=>stage.at<=t).at(-1)?.name||STAGES[0].name;
 const braking=t>=SPEC.brakeStart-.035&&t<SPEC.depart;
 const release=ease((t-(SPEC.stop+.16))/(SPEC.depart-SPEC.stop-.16));
 const pose={...row,body:{...row.body},wheels:row.wheels.map(w=>({...w})),phase,
   head:1,running:1,brake:braking?.28+2.7*(1-release):.28,pool:1,tracks:0,smoke:0,slipping:false,
   wheelAngle:row.wheels[2].spin,done:time>=SPEC.duration};
 if(presentation==='dock'){const lights=1-ease((t-1.55)/(SPEC.depart-1.55));pose.head*=lights;pose.pool*=lights;}
 if(baseline){pose.x=0;pose.z=0;pose.yaw=0;pose.body={heave:0,pitch:0,roll:0};pose.wheels=pose.wheels.map(w=>({...w,spin:0,steer:0}));pose.wheelAngle=0;pose.brake=.28;pose.head=0;pose.pool=0;}
 return pose;
}
export function wheelContact(pose,wheel){
 const c=Math.cos(pose.yaw),s=Math.sin(pose.yaw);
 const localZ=wheel.z-SPEC.centerZ;
 return{x:pose.x+c*wheel.x+s*localZ,z:pose.z-s*wheel.x+c*localZ,y:0};
}
export function verifyMotion(){
 let lateralError=0,rollingError=0,wheelLateralError=0,maxSteer=0,maxPitch=0,maxAcceleration=0;
 for(let i=1;i<table.length;i++){
  const a=table[i-1],b=table[i];
  const heading=(a.yaw+b.yaw)/2;
  lateralError=Math.max(lateralError,Math.abs((b.rearX-a.rearX)*Math.cos(heading)-(b.rearZ-a.rearZ)*Math.sin(heading)));
  b.wheels.forEach((wheel,k)=>{
    // Independent check: measure the world-space wheel-centre path, rather
    // than comparing the stored spin with the distance used to generate it.
    const p=wheelContact(a,a.wheels[k]),q=wheelContact(b,wheel);
    const h=heading+(a.wheels[k].steer+wheel.steer)/2,dx=q.x-p.x,dz=q.z-p.z;
    const ds=-dx*Math.sin(h)-dz*Math.cos(h);
    const dtheta=wheel.spin-a.wheels[k].spin;
    rollingError=Math.max(rollingError,Math.abs(ds+dtheta*SPEC.radius));
    wheelLateralError=Math.max(wheelLateralError,Math.abs(dx*Math.cos(h)-dz*Math.sin(h)));
    maxSteer=Math.max(maxSteer,Math.abs(wheel.steer));});
  maxPitch=Math.max(maxPitch,Math.abs(b.body.pitch));maxAcceleration=Math.max(maxAcceleration,Math.abs(b.acceleration));
 }
 return{lateralError,rollingError,wheelLateralError,maxSteer,maxPitch,maxAcceleration,
  reverseDistance:parked.reverseTravel,parkedYaw:parked.yaw,
  suspensionAtRest:table[Math.round(1.9*SPEC.hz)].body,
  slip:false};
}
// Proposed lifecycle resolver: pure, review-only. Native uptime supplies elapsed;
// the webview samples the same launch timeline rather than replaying frame zero.
export function presentationTime(elapsed,{readyAt=null,lateJoin=0,reduced=false,hidden=false,presentation='loader'}={}){
 const parkedTime=SPEC.depart-1/SPEC.hz;
 if(reduced)return{time:parkedTime,visible:presentation==='dock'||readyAt===null||elapsed<readyAt,stage:'Reduced Motion: still'};
 if(presentation==='loader'&&elapsed<lateJoin)return{time:elapsed,visible:false,stage:'Webview not attached'};
 // A ready event before the settled pose simply retires optional artwork.
 if(readyAt!==null&&readyAt<SPEC.depart&&presentation==='loader'&&elapsed>=readyAt)
  return{time:Math.min(elapsed,parkedTime),visible:false,stage:'Early readiness: artwork retired; input live'};
 const departing=readyAt!==null&&elapsed>=readyAt&&presentation==='loader';
 const time=departing?Math.min(SPEC.duration,SPEC.depart+elapsed-readyAt):Math.min(elapsed,parkedTime);
 return{time,visible:(!hidden||presentation==='dock')&&(!departing||time<SPEC.duration),
  stage:departing?'Input live · optional departure':elapsed>=SPEC.depart?'Waiting: settled still':'Shared launch clock'};
}
