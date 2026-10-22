// Promoted from the verified Source drive study; game lifecycle is source-drive-session.js.
// Bounded single-track van dynamics, not a calibrated vehicle simulator.
import {roadAt,roadSurfaceAt} from './road.js';
export const VEHICLE=Object.freeze({mass:2350,wheelbase:3.1,frontDistance:1.35,rearDistance:1.75,track:1.68,cgHeight:.78,yawInertia:3700,frontStiffness:72000,rearStiffness:90000,driveForce:4300,power:58000,brakeForce:13200,reverseForce:2600,maxSpeed:16,maxReverse:4,maxWheelAngle:.52,steeringRatio:17.5});
export const PHYSICS_STEP=1/120;
const G=9.81,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
const approach=(a,b,rate,h)=>a+clamp(b-a,-rate*h,rate*h);
const defaults={lateralSpeed:0,yawRate:0,wheelAngle:0,steeringWheelAngle:0,gear:1,directionHold:0,throttle:0,brakeAmount:0,brakeHold:false,hillStartDirection:0,bodyRoll:0,bodyPitch:0,bodyHeave:0,rollVelocity:0,pitchVelocity:0,heaveVelocity:0,longitudinalAcceleration:0,lateralAcceleration:0,roadOffset:0,surface:'asphalt',surfaceGrip:.68,engineLoad:0,physicsRemainder:0,wheelRotation:0};
export function ensureVehicle(s){for(const[k,v]of Object.entries(defaults))if(!Number.isFinite(s[k])&&typeof v==='number'||s[k]==null)s[k]=v;s.brakeHold=s.brakeHold===true;return s;}
export function applyRoadImpulse(s,velocityMps=0){ensureVehicle(s);s.heaveVelocity+=clamp(Number(velocityMps)||0,-.5,.5);return s;}
function spring(s,key,velocity,target,h,frequency=1.55,damping=.72){const w=Math.PI*2*frequency;s[velocity]+=(w*w*(target-s[key])-2*damping*w*s[velocity])*h;s[key]+=s[velocity]*h;}
export function stepVehicle(s,h,input={}){
 ensureVehicle(s);const p=VEHICLE,u=s.speed,v=s.lateralSpeed,abs=Math.abs(u);
 const driveDirection=input.forward&&!input.reverse?1:input.reverse&&!input.forward?-1:0;
 const opposing=driveDirection!==0&&u*driveDirection<-.16;
 const directionChange=driveDirection!==0&&driveDirection!==s.gear;
 if(directionChange&&!opposing&&abs<.3&&!input.brake)s.directionHold+=h;else s.directionHold=0;
 if(directionChange&&s.directionHold>=.3){s.gear=driveDirection;s.directionHold=0;}
 const waitingForGear=driveDirection!==0&&driveDirection!==s.gear;
 // A completed Space stop retains service-brake pressure while the player
 // looks/listens. Only an effective, unopposed drive command releases it;
 // selecting reverse still takes the ordinary .3-second gear change.
 if(s.brakeHold&&driveDirection!==0&&!input.brake&&!waitingForGear){s.brakeHold=false;s.hillStartDirection=driveDirection;}
 if(!driveDirection||input.brake||waitingForGear)s.hillStartDirection=0;
 const brakeTarget=input.brake||s.brakeHold?1:opposing?.62:waitingForGear?.55:input.forward&&input.reverse?.7:0;
 s.brakeAmount=approach(s.brakeAmount,brakeTarget,brakeTarget>s.brakeAmount?7:9,h);
 const throttleTarget=driveDirection!==0&&!opposing&&!input.brake&&!s.brakeHold&&driveDirection===s.gear?1:0;
 s.throttle=approach(s.throttle,throttleTarget,throttleTarget>s.throttle?2.5:7,h);
 // Finger input commands a real wheel angle. Slower wheel travel and a smaller
 // angle at speed give the player correction time, without steering the view.
 const steerInput=clamp((input.right?1:0)-(input.left?1:0),-1,1);
 const maxAngle=p.maxWheelAngle/(1+Math.pow(abs/7,1.6));
 const returnRate=.2+.02*abs,turnRate=.64/(1+abs/30);
 s.wheelAngle=approach(s.wheelAngle,steerInput*maxAngle,steerInput?turnRate:returnRate,h);
 s.steer=s.wheelAngle/p.maxWheelAngle;
 s.steeringWheelAngle=s.wheelAngle*p.steeringRatio;
 const c=Math.cos(s.heading),n=Math.sin(s.heading),wheels=[];
 for(const axle of[p.frontDistance,-p.rearDistance])for(const side of[-p.track/2,p.track/2])wheels.push(roadSurfaceAt(s.x+n*axle+c*side,s.z-c*axle+n*side));
 const grip=wheels.reduce((a,w)=>a+w.grip,0)/4,rolling=wheels.reduce((a,w)=>a+w.rolling,0)/4;
 const road=roadSurfaceAt(s.x,s.z);s.roadOffset=road.offset;s.surface=wheels.some(w=>w.kind==='verge')?'verge':wheels.some(w=>w.kind==='shoulder')?'shoulder':'asphalt';s.surfaceGrip=grip;s.roadHeight=road.height;
 const direction=Math.sign(u)||s.gear;
 const taper=s.gear===1?1-smooth(13.2,p.maxSpeed,Math.max(0,u)):1-smooth(2.8,p.maxReverse,Math.max(0,-u));
 let drive=s.throttle*(s.gear===1?Math.min(p.driveForce,p.power/Math.max(5,abs)):p.reverseForce)*s.gear*taper;
 const resistance=(rolling*p.mass*G+1.7*u*u+(s.throttle<.05?130+11*abs:0))*Math.sign(u);
 const brake=s.brakeAmount*p.brakeForce*direction;
 // Static axle load plus bounded fore/aft load transfer; shared tyre budget
 // means hard braking spends grip that cannot also turn the van.
 const transfer=clamp(-s.longitudinalAcceleration*p.mass*p.cgHeight/p.wheelbase,-p.mass*G*.12,p.mass*G*.16);
 const frontLoad=p.mass*G*p.rearDistance/p.wheelbase+transfer,rearLoad=p.mass*G-frontLoad;
 const frontMu=(wheels[0].grip+wheels[1].grip)/2,rearMu=(wheels[2].grip+wheels[3].grip)/2;
 const floorSpeed=Math.max(2,abs),travelSign=Math.sign(u)||s.gear;
 const frontSlip=travelSign*s.wheelAngle-Math.atan2(v+p.frontDistance*s.yawRate,floorSpeed),rearSlip=-Math.atan2(v-p.rearDistance*s.yawRate,floorSpeed);
 let fxFront=-brake*.62,fxRear=drive-brake*.38,fyFront=p.frontStiffness*frontSlip,fyRear=p.rearStiffness*rearSlip;
 const frontScale=Math.min(1,frontMu*frontLoad/Math.max(1,Math.hypot(fxFront,fyFront))),rearScale=Math.min(1,rearMu*rearLoad/Math.max(1,Math.hypot(fxRear,fyRear)));
 fxFront*=frontScale;fyFront*=frontScale;fxRear*=rearScale;fyRear*=rearScale;
 let longitudinal=(fxFront+fxRear-resistance)/p.mass-G*road.grade*Math.cos(s.heading-road.heading);
 let nextU=u+(longitudinal+s.yawRate*v)*h;
 // Overlap the just-released service pressure with clutch take-up. A steep
 // new cliff must not roll backwards during the throttle's short physical
 // rise merely because the held brake was released on the first pedal tick.
 // This reaction exists only after a deliberate held stop; ordinary coasting
 // and an unpowered van retain gravity, and no forward force is invented.
 if(s.hillStartDirection&&Math.abs(u)<.16){
  if(nextU*s.hillStartDirection<0){nextU=0;longitudinal=0;}
  else if(nextU*s.hillStartDirection>.002)s.hillStartDirection=0;
 }else if(Math.abs(u)>=.16)s.hillStartDirection=0;
 // A decaying brake force can stop motion, never create reverse motion from
 // rest as the foot transfers back to the accelerator.
 const braking=brakeTarget>0||s.brakeAmount>0;
 if((braking||s.throttle<.05)&&Math.sign(nextU)!==Math.sign(u)&&abs<.15&&(abs>0||braking))nextU=0;
 nextU=clamp(nextU,-p.maxReverse-.1,p.maxSpeed+.1);
 const dynamicV=v+((fyFront+fyRear)/p.mass-s.yawRate*u)*h,dynamicR=s.yawRate+(p.frontDistance*fyFront-p.rearDistance*fyRear)/p.yawInertia*h;
 const targetR=nextU/p.wheelbase*Math.tan(s.wheelAngle),targetV=targetR*p.rearDistance;
 const blend=smooth(1.5,3.8,abs),follow=1-Math.exp(-h/.1);
 s.lateralSpeed=mix(mix(v,targetV,follow),dynamicV,blend);s.yawRate=mix(mix(s.yawRate,targetR,follow),dynamicR,blend);
 if(abs<.05&&s.throttle<.01){s.lateralSpeed*=Math.exp(-h*12);s.yawRate*=Math.exp(-h*12);}
 if(input.brake&&nextU===0&&Math.abs(s.lateralSpeed)<.02&&Math.abs(s.yawRate)<.02)s.brakeHold=true;
 // Static tyre reaction balances the slope at a deliberate complete stop.
 // Do not integrate the full kinetic brake force as an engine pointing back
 // down the hill. Steering and suspension remain live while held.
 if(s.brakeHold){nextU=0;s.lateralSpeed=0;s.yawRate=0;s.brakeAmount=1;s.throttle=0;longitudinal=0;}
 s.speed=nextU;s.heading+=s.yawRate*h;
 const dx=(Math.sin(s.heading)*s.speed+Math.cos(s.heading)*s.lateralSpeed)*h,dz=(-Math.cos(s.heading)*s.speed+Math.sin(s.heading)*s.lateralSpeed)*h;
 s.x+=dx;s.z+=dz;s.odometer+=Math.hypot(dx,dz);s.wheelRotation+=(s.speed*h)/.34;
 s.longitudinalAcceleration=longitudinal;s.lateralAcceleration=s.brakeHold?0:(fyFront+fyRear)/p.mass;s.engineLoad=s.brakeHold?0:Math.abs(drive)/p.driveForce;s.frontSlip=s.brakeHold?0:frontSlip;s.rearSlip=s.brakeHold?0:rearSlip;
 spring(s,'bodyRoll','rollVelocity',clamp(-s.lateralAcceleration*.011,-.065,.065),h);
 spring(s,'bodyPitch','pitchVelocity',clamp(longitudinal*.011,-.065,.045),h,1.4,.76);
 const rough=wheels.reduce((a,w)=>a+w.roughness,0)/4;
 spring(s,'bodyHeave','heaveVelocity',rough,h,1.8,.67);
 return s;
}
