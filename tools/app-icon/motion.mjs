// Shared, deterministic kinematics for the native atlas and the startup film.
// +Z is reverse for the canonical Transit. Distances are metres, time seconds.
import {VAN_ICON_WEATHER} from './weather.mjs';
export const VAN_ICON_LAUNCH=Object.freeze({frameCount:84,cell:256,cellSize:256,columns:8,rows:11,durationSeconds:3.4,
 stages:Object.freeze([{atSeconds:0,name:'arrival'},{atSeconds:.95,name:'brake'},{atSeconds:1.27,name:'settle'},{atSeconds:3.4,name:'parked'}]),
 stagesSeconds:Object.freeze({accelerateEnd:.30,finalAccelerationStart:.80,brakeStart:.95,lockStart:.95,stop:1.27,settleEnd:2.35,smokeEnd:1.65,poolEnd:2.9,tracksEnd:3.25}),weather:VAN_ICON_WEATHER});
export const VAN_ICON_PHYSICS=Object.freeze({travel:1.53,tyreRadius:.33,accelerateUntil:.30,brakeAt:.95,lockAt:.95,stopAt:1.27});
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
const V=1.3,A=V/.30,FINAL_V=2.5,FINAL_A=(FINAL_V-V)/.15,B=FINAL_V/.32;
export function vanTravelAt(time){
 const t=clamp(Number(time)||0,0,VAN_ICON_PHYSICS.stopAt);
 if(t>=VAN_ICON_PHYSICS.stopAt)return VAN_ICON_PHYSICS.travel;
 if(t<.30)return .5*A*t*t;
 if(t<.80)return .195+V*(t-.30);
 if(t<.95){const a=t-.80;return .845+V*a+.5*FINAL_A*a*a;}
 const b=t-.95;return Math.min(1.53,1.13+FINAL_V*b-.5*B*b*b);
}
export function vanSpeedAt(time){const t=Number(time)||0;return t<0||t>=1.27?0:t<.30?A*t:t<.80?V:t<.95?V+FINAL_A*(t-.80):Math.max(0,FINAL_V-B*(t-.95));}
export function vanIconPose(time){
 const t=clamp(Number(time)||0,0,VAN_ICON_LAUNCH.durationSeconds),distance=vanTravelAt(t),p=distance/1.53,b=clamp((t-.95)/.32),brakeP=1.13/1.53;
 const beforeX=-.24*(1-p)**2-.14;
 const x=t>=1.27?0:t<.95?beforeX:(-.24*(1-brakeP)**2-.14)*(1-smooth(b));
 const yaw=t>=1.27?0:t<.95?Math.atan(.32*(1-p)):Math.atan(.32*(1-brakeP))*(1-b)+.22*Math.sin(Math.PI*b);
 const slip=t>=.95&&t<1.27,rollingDistance=vanTravelAt(Math.min(t,.95));
 const load=t<.95?0:t<1.27?smooth((t-.95)/.18):Math.exp(-(t-1.27)*5.3)*Math.cos((t-1.27)*13);
 const fade=1-smooth((t-2.1)/1.15),lightRise=smooth(t/.10);
 return{t,distance,speed:vanSpeedAt(t),x,z:distance-1.53,yaw,
  wheelAngle:(rollingDistance-1.53)/.33,slipping:slip,
  body:{heave:-.075*load,pitch:.065*load,roll:-.045*Math.sin(Math.PI*b)*(t<1.27?1:0)},
  head:lightRise*(1-smooth((t-1.9)/.7)),running:lightRise*(1-smooth((t-2.3)/.8)),
  brake:.28+2.7*smooth((t-.91)/.12)*(1-smooth((t-1.7)/.65)),
  pool:lightRise*(1-smooth((t-2.05)/.85)),tracks:t<.95?0:.85*fade,
  smoke:t<.95?0:1-smooth((t-1.27)/.38),done:t>=VAN_ICON_LAUNCH.durationSeconds};
}

// The app widget approaches and departs in world space. Both sides of the
// splice are outside the camera; the Dock keeps its single parked arrival.
export function startupVanLoopPose(time){
 const pose=vanIconPose(time);
 const t=pose.t;
 if(t<.95){
  const approach=4.3*(1-smooth(t/.95));
  pose.x+=approach;
  pose.z-=approach*.75;
  pose.wheelAngle-=approach*1.25/VAN_ICON_PHYSICS.tyreRadius;
 }
 const drive=smooth((t-1.55)/1.65);
 const distance=5.9*drive;
 pose.x-=distance;
 pose.z+=distance*.72;
 pose.yaw=-.44*Math.sin(drive*Math.PI/2)+pose.yaw;
 pose.wheelAngle+=distance*1.23/VAN_ICON_PHYSICS.tyreRadius;
 if(t>=1.55)pose.brake=.28+(pose.brake-.28)*(1-smooth((t-1.55)/.24));
 pose.head=Math.max(pose.head,smooth(t/.18)*(1-smooth((t-3.06)/.3)));
 return pose;
}

export function vanTyreContact(local,time,groundY){
 const p=vanIconPose(time),c=Math.cos(p.yaw),s=Math.sin(p.yaw);
 return{x:p.x+c*local.x+s*local.z,y:groundY,z:p.z-s*local.x+c*local.z};
}
