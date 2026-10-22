// Promoted from the verified Source drive study; game lifecycle is source-drive-session.js.
import{roadAt,worldAt,roadSurfaceAt}from'./road.js';
import{routeLayoutBetween,ORDINARY_BRIDGE,ORDINARY_DESTINATION}from'./route-layout.js';
import{doorAssembly,doorLeafLocalMatrix}from'../../data/source-door-fields.js';
import{JOINT_OFFSETS}from'./road-joints.js';
import{makeCutScene,cutColliders}from'./cut/scene.js';
import{roadBoundaryColliders,roadBoundaryInstances}from'./route-boundaries.js';
import{wheelHandInstances}from'./geometry/wheel-hands-pose.js';
import{driveEvolutionFrame}from'./evolution.js';
import{makePredicamentScene,predicamentColliders}from'./predicaments/scene.js';
export const rotation=(x=0,y=0,z=0)=>{const cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);return[cy*cz+sy*sx*sz,cx*sz,-sy*cz+cy*sx*sz,0,-cy*sz+sy*sx*cz,cx*cz,sy*sz+cy*sx*cz,0,sy*cx,-sx,cy*cx,0,0,0,0,1];};
export function multiply(a,b){const m=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let i=0;i<4;i++)m[c*4+r]+=a[i*4+r]*b[c*4+i];return m;}
const transform=(m,v)=>[m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12],m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];
const offset=(a,b)=>a.map((n,i)=>n+b[i]);
// Project road grade into the vehicle's own axes: a reversing or crosswise van
// must rest on the same surface as one pointing along the road.
export function driveRoadAttitude(s){const road=roadSurfaceAt(s.x,s.z),delta=s.heading-road.heading;return{pitch:Math.atan(road.grade*Math.cos(delta)),roll:Math.atan(-road.grade*Math.sin(delta))};}
function bodyMatrix(s,amount=1){const attitude=driveRoadAttitude(s),r=multiply(rotation(0,-s.heading),rotation(attitude.pitch+(s.bodyPitch||0)*amount,0,attitude.roll+(s.bodyRoll||0)*amount)),pivot=.85;r[12]=32+s.x-r[4]*pivot;r[13]=(s.roadHeight||0)+(s.bodyHeave||0)*amount+pivot-r[5]*pivot;r[14]=32+s.z-r[6]*pivot;return r;}
function placed(mesh,matrix,extra={}){return{id:extra.id||mesh,mesh,x:matrix[12],y:matrix[13],z:matrix[14],matrix,structural:true,...extra};}
// Fixed world solids share roadAt() with their visible placements. This narrow
// query avoids building/skinning the entire cabin twice in a simulation frame.
export function driveColliders(s){const d=roadSurfaceAt(s.x,s.z).distance,out=[...roadBoundaryColliders(d),...cutColliders(s),...predicamentColliders(s)];
 for(const p of routeLayoutBetween(d-28,d+28)){if(!p.collision)continue;const a=worldAt(p.d,p.lateral,p.lift),c=p.collision,local=c.localCentre||[0,0,0],scale=p.scale||[1,1,1],yaw=a.heading-p.yaw;out.push({id:p.id,x:a.x+Math.cos(yaw)*local[0]*scale[0]+Math.sin(yaw)*local[2]*scale[2],z:a.z+Math.sin(yaw)*local[0]*scale[0]-Math.cos(yaw)*local[2]*scale[2],halfX:c.halfSize[0]*Math.abs(scale[0]),halfZ:c.halfSize[2]*Math.abs(scale[2]),yaw});}
 const a=worldAt(ORDINARY_BRIDGE.d);for(const side of[-1,1])out.push({id:'bridge-pier-'+side,x:a.x+Math.cos(a.heading)*side*4.45,z:a.z+Math.sin(a.heading)*side*4.45,halfX:.375,halfZ:1.4,yaw:a.heading});
 const end=worldAt(ORDINARY_DESTINATION.d);out.push({id:'goods-pair-solid',x:end.x,z:end.z,halfX:1.8,halfZ:.18,yaw:end.heading});return out;}
export function makeDriveScene(s,metrics,{headlights=true,wipers=false,showHands=true,handControl=null,weather=null}={}){
 const attitude=driveRoadAttitude(s),body=bodyMatrix(s),head=bodyMatrix(s,.38),mount=metrics.cabinBodyMount||[0,0,-1.6],props=[],colliders=driveColliders(s),targets=[];
 const bodyPoint=p=>transform(body,p),cabPoint=p=>bodyPoint(offset(p,mount));
 const cabMatrix=(p=[0,0,0],rx=0,rz=0)=>{const m=multiply(body,rotation(rx,0,rz)),q=cabPoint(p);m[12]=q[0];m[13]=q[1];m[14]=q[2];return m;};
 const cab=(mesh,p=[0,0,0],rx=0,rz=0,extra={})=>{const instance=placed(mesh,cabMatrix(p,rx,rz),extra);props.push(instance);return instance;};
 cab('drive_cabin');cab('drive_radio');props.push(placed('drive_vehicle_body',body,{skyExposed:true}));
 cab('drive_wheel',metrics.wheel.center,metrics.wheel.tiltX,-s.steeringWheelAngle);
 const toWheel=(p,point=true)=>{const a=metrics.wheel.tiltX,c=Math.cos(a),sn=Math.sin(a),d=point?p.map((v,i)=>v-metrics.wheel.center[i]):p;return[d[0],c*d[1]+sn*d[2],-sn*d[1]+c*d[2]];};
 const recorderKeys=Object.fromEntries(['record','play','stop'].map((id,i)=>[id,[.0340638587+i*99*.274/736,-.05547011,.0299]])),rc=metrics.recorder,ct=Math.cos(rc.tiltX),st=Math.sin(rc.tiltX);
 const recorderCab=k=>[rc.center[0]+k[0],rc.center[1]+ct*k[1]-st*k[2],rc.center[2]+st*k[1]+ct*k[2]];
 const handTargets={tune:{target:toWheel([[ -.0198,.025,.0698 ][handControl?.preset??['service','company','music'].indexOf(s.station)],1.07592,-.379]),normal:toWheel([0,0,1],false)},power:{target:toWheel([-.065,1.10,-.36]),normal:toWheel([0,0,1],false)},...Object.fromEntries(Object.entries(recorderKeys).map(([id,key])=>[id,{target:toWheel(recorderCab(key)),normal:toWheel([0,-st,ct],false)}]))};
 const reach=handControl&&handTargets[handControl.kind]?{kind:handControl.kind,elapsed:handControl.elapsed,...handTargets[handControl.kind]}:null;
 if(showHands)props.push(...wheelHandInstances(cabMatrix(metrics.wheel.center,metrics.wheel.tiltX),-s.steeringWheelAngle,{timeSec:s.programTime,reach}));
 const wiperAngles=weather?.wiperAngles||[-1.42,1.42],wiperTilt=weather?.wiperTiltX??Math.atan2(.40,.86);
 const wiperPivot=metrics.wiper.pivot.map((v,i)=>v+([0,Math.sin(wiperTilt)*.025,-Math.cos(wiperTilt)*.025][i]));
 cab('drive_wiper',wiperPivot,wiperTilt,wiperAngles[0],{id:'drive-wiper-left'});
 cab('drive_wiper',[.45,wiperPivot[1],wiperPivot[2]],wiperTilt,wiperAngles[1],{id:'drive-wiper-right'});
 if(metrics.speedNeedle)cab('drive_speed_needle',metrics.speedNeedle.center,0,metrics.speedNeedle.rotationZAtMin+(metrics.speedNeedle.rotationZAtMax-metrics.speedNeedle.rotationZAtMin)*Math.abs(s.speed)*3.6/180);
 const needle=metrics.radioNeedle,ix=['service','company','music'].indexOf(s.station);cab('drive_radio_needle',[needle.xRange[0]+(needle.xRange[1]-needle.xRange[0])*ix/2,needle.center[1],needle.center[2]]);
 const rec=metrics.recorder,recM=cabMatrix(rec.center,rec.tiltX);props.push(placed(rec.bodyMesh,recM),placed(rec.cradleMesh,recM));const screenM=new Float32Array(recM),screenPos=transform(recM,rec.readoutLocalCenter);screenM[12]=screenPos[0];screenM[13]=screenPos[1];screenM[14]=screenPos[2];props.push(placed(rec.readoutMesh,screenM));
 for(const side of[-1,1])for(const axle of[-1.35,1.75]){const m=multiply(body,rotation(s.wheelRotation,axle<0?-s.wheelAngle:0,0)),q=bodyPoint([side*.84,.34,axle]);m[12]=q[0];m[13]=q[1];m[14]=q[2];props.push(placed('drive_tyre',m,{id:`tyre-${side}-${axle}`}));}
 const mirrors=metrics.mirrors.map(m=>{cab(m.mesh,m.center);const eye=cabPoint([m.center[0]*1.10,m.center[1],m.center[2]-.12]);return{mesh:m.mesh,eye,yaw:s.heading+Math.PI+(m.center[0]>0?-.12:.12),pitch:-.035,aspect:m.size[0]/m.size[1]};});
 const d=roadSurfaceAt(s.x,s.z).distance,first=Math.max(-16,Math.floor((d-180)/2)),last=Math.min(622,Math.ceil((d+220)/2));
 const worldPart=(mesh,distance,lateral=0,{yaw=0,pitchWithRoad=false,scaleX=1,scaleY=1,scaleZ=1,y=0,id=mesh+'-'+distance+'-'+lateral}={})=>{const a=worldAt(distance,lateral,y),m=rotation(pitchWithRoad?a.pitch:0,-a.heading+yaw);for(let r=0;r<3;r++){m[r]*=scaleX;m[4+r]*=scaleY;m[8+r]*=scaleZ;}m[12]=32+a.x;m[13]=a.y;m[14]=32+a.z;props.push(placed(mesh,m,{id,skyExposed:true}));return{...a,matrix:m};};
 // Painted carriageway remains on the route centre. The stopping bay and
 // finite service courts are separate unmarked paving, never a stretched lane.
 for(let i=first;i<=last;i++){const distance=i*2,a=roadAt(distance),plain=a.treatment.pinch>.35||a.treatment.expanse>.12,mesh=a.treatment.snowCover>.45?'dp_snow_paving':plain?'drive_plain_paving':'drive_road';worldPart(mesh,distance,0,{id:'drive_road-'+distance+'-0',scaleX:a.halfWidth/3.25,scaleZ:2.08*a.longitudinalScale,pitchWithRoad:true});for(const side of[-1,1]){const width=side<0?a.leftWidth:a.rightWidth,extra=width-a.halfWidth;if(extra>.001)worldPart('drive_plain_paving',distance,side*(a.halfWidth+extra/2),{scaleX:(extra+.025)/6.5,scaleZ:2.08*a.longitudinalScale,pitchWithRoad:true,y:-.002});worldPart('drive_verge',distance,side*(width+a.shoulderWidth/2),{scaleX:a.shoulderWidth/1.6,scaleZ:2.10*a.longitudinalScale,pitchWithRoad:true});}}
 props.push(...roadBoundaryInstances(d));
 for(const p of routeLayoutBetween(d-200,d+250))worldPart(p.mesh,p.d,p.lateral,{id:p.id,y:p.lift,yaw:p.yaw,pitchWithRoad:p.pitchWithRoad,scaleX:p.scale[0],scaleY:p.scale[1],scaleZ:p.scale[2]});
 const bridge=worldPart(ORDINARY_BRIDGE.mesh,ORDINARY_BRIDGE.d,0,{id:ORDINARY_BRIDGE.id});
 for(const delta of JOINT_OFFSETS)worldPart('drive_road_joint',ORDINARY_BRIDGE.d+delta);
 const destination=worldAt(ORDINARY_DESTINATION.d),doorM=rotation(0,-destination.heading);doorM[12]=32+destination.x;doorM[13]=destination.y;doorM[14]=32+destination.z;const assembly=doorAssembly('bay-goods-pair',{activeLeaves:'all'});
 props.push(placed(assembly.frameMesh,doorM,{id:'canonical-goods-frame',skyExposed:true}));for(let i=0;i<2;i++)props.push(placed(assembly.leafMesh,multiply(doorM,doorLeafLocalMatrix(assembly,i,0)),{id:'canonical-goods-leaf-'+i,skyExposed:true}));
 const threshold=rotation();threshold[0]=3.45;threshold[13]=.012;props.push(placed('door_threshold_slab',multiply(doorM,threshold),{id:'canonical-goods-threshold',skyExposed:true}));
 const lamps=(metrics.body?.headlamps||[[-.66,1.02,-3.215],[.66,1.02,-3.215]]).map((p,i)=>{const q=bodyPoint(p);return{id:'drive-headlamp-'+i,x:q[0],y:q[1],z:q[2],color:[1,.89,.72],intensity:headlights?5:0,radius:95,penetration:1,castsShadow:i===0,shadowYaw:s.heading,shadowPitch:attitude.pitch-.02};});
 // The receiver/instrument spill originates at the fascia. A floating point
 // beside the driver's head bleached the roof before final acquisition.
 const cabinLamp=cabPoint([.20,1.10,-.35]);lamps.push({id:'drive-instrument-bounce',x:cabinLamp[0],y:cabinLamp[1],z:cabinLamp[2],color:[.72,.66,.52],intensity:.62,radius:1.65,penetration:1});
 for(let i=0;i<3;i++)targets.push({id:'tune',preset:i,label:`PRESET ${i+1} · ${['SERVICE','COMPANY','MUSIC'][i]}`,point:cabPoint([[-.0198,.025,.0698][i],1.07592,-.379])});
 targets.push({id:'power',label:'VOLUME / OFF',point:cabPoint([-.065,1.10,-.36])},{id:'record',label:'REC / STOP · R',point:transform(recM,recorderKeys.record)});
 targets.push({id:'play',label:'PLAY LAST TAKE · E',point:transform(recM,recorderKeys.play)},{id:'stop',label:'STOP TRANSPORT · X',point:transform(recM,recorderKeys.stop)});
 const evolution=driveEvolutionFrame(s),cut=makeCutScene(s,evolution),predicaments=makePredicamentScene(s);props.push(...cut.props,...predicaments.props);lamps.push(...cut.lights,...predicaments.lights);const mic=offset(metrics.eye,mount),cabinSource=source=>{const d=source.world.map((v,i)=>v-body[12+i]);return{...source,position:[body[0]*d[0]+body[1]*d[1]+body[2]*d[2]-mic[0],body[4]*d[0]+body[5]*d[1]+body[6]*d[2]-mic[1],body[8]*d[0]+body[9]*d[1]+body[10]*d[2]-mic[2]]};};cut.sources=cut.sources.map(cabinSource);predicaments.sources=predicaments.sources.map(cabinSource);
 const rainShelter={x:bridge.matrix[12],y:bridge.y+ORDINARY_BRIDGE.clearance,z:bridge.matrix[14],heading:bridge.heading};
 const eye=transform(head,offset(metrics.eye,mount));return{cut,predicaments,evolution,props,colliders,eye,lamps,mirrors,targets,body,bridge,rainShelter,recorderMatrix:recM,cabPoint,roadPitch:attitude.pitch};
}
