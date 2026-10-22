// Transient, explicitly staged door teaser. The production road, save state
// and vehicle integrator are never edited. Every attached surface and camera
// point receives one rigid vehicle delta; all remaining world matrices stay put.
import {worldAt} from './road.js';
export const DRIVE_TEASER_BREAK=Object.freeze({distance:297,side:1,from:291,to:309});
const IDENTITY=Object.freeze([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const cliffFaces=new Map();
const VEHICLE_MESH=/^drive_(?:cabin|radio(?:_needle)?|vehicle_body|wheel|wiper|speed_needle|tyre|recorder_(?:body|cradle|readout)|mirror_(?:left|right)|(?:left|right)_(?:hand|forearm|sleeve|upper_sleeve))$/;
const point=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
const vector=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2],m[1]*p[0]+m[5]*p[1]+m[9]*p[2],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]];
const unit=p=>{const length=Math.hypot(...p)||1;return p.map(v=>v/length);},dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const multiply=(a,b)=>{const out=Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];return out;};
function checkedRigid(m,label){if(!m||m.length!==16||!Array.from(m).every(Number.isFinite))throw Error(label+' must be a finite rigid4x4 matrix.');const axes=[[m[0],m[1],m[2]],[m[4],m[5],m[6]],[m[8],m[9],m[10]]];if(axes.some(a=>Math.abs(dot(a,a)-1)>.002)||Math.abs(dot(axes[0],axes[1]))>.002||Math.abs(dot(axes[0],axes[2]))>.002||Math.abs(dot(axes[1],axes[2]))>.002||dot(cross(axes[0],axes[1]),axes[2])<.998||Math.abs(m[3])+Math.abs(m[7])+Math.abs(m[11])+Math.abs(m[15]-1)>.002)throw Error(label+' must not scale, reflect or shear the attached vehicle.');return m;}
function inverseRigid(m){const out=[m[0],m[4],m[8],0,m[1],m[5],m[9],0,m[2],m[6],m[10],0,0,0,0,1],t=vector(out,[m[12],m[13],m[14]]);out[12]=-t[0];out[13]=-t[1];out[14]=-t[2];return out;}
function matrixProp(prop,delta){if(!prop.matrix)throw Error('Attached teaser prop lacks its authored instance matrix: '+prop.id);const matrix=multiply(delta,prop.matrix);return{...prop,matrix,x:matrix[12],y:matrix[13],z:matrix[14]};}
function cameraFrame(look,delta=IDENTITY){const yaw=Number(look?.yaw)||0,pitch=Number(look?.pitch)||0,c=Math.cos(yaw),s=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),forward=unit(vector(delta,[s*cp,sp,-c*cp])),right=unit(vector(delta,[c,0,s])),up=unit(vector(delta,[-s*sp,cp,c*sp])),newYaw=Math.atan2(forward[0],-forward[2]),newPitch=Math.asin(clamp(forward[1],-1,1)),levelRight=[Math.cos(newYaw),0,Math.sin(newYaw)],levelUp=[-Math.sin(newYaw)*Math.sin(newPitch),Math.cos(newPitch),Math.cos(newYaw)*Math.sin(newPitch)];return{yaw:newYaw,pitch:newPitch,roll:Math.atan2(dot(right,levelUp),dot(right,levelRight)),forward,right,up};}
function bodyFrame(body){const forward=unit([-body[8],-body[9],-body[10]]);return{yaw:Math.atan2(forward[0],-forward[2]),pitch:Math.asin(clamp(forward[1],-1,1))};}
function gapSettings(value){if(value===false||value===null)return null;const gap={...DRIVE_TEASER_BREAK,...value};if(![gap.distance,gap.from,gap.to].every(Number.isFinite)||gap.to<gap.from||![1,-1].includes(gap.side))throw Error('The teaser break must be one finite route interval and a left/right side.');return gap;}
function intersects(a,b,gap){return b>=gap.from&&a<=gap.to;}
// This stage removes a fixed, visible rail/shoulder section from its FIRST
// frame. The actual carriageway and its closed0.09m pavement edge stay intact.
// Removing only a collider would leave a visibly intact rail across the fall.
function removeAtBreak(prop,gap){if(!gap)return false;const id=String(prop.id||''),side=gap.side<0?'left':'right';let match;
 if((match=id.match(/^route-edge-(left|right)-(-?[\d.]+)$/)))return match[1]===side&&intersects(+match[2],+match[2]+3,gap);
 if((match=id.match(/^(?:cliff-fall|queue-ledge)-(-?1)-(-?[\d.]+)$/)))return +match[1]===gap.side&&intersects(+match[2]-16,+match[2]+16,gap);
 if((match=id.match(/^drive_(?:verge|plain_paving)-(-?[\d.]+)-(-?[\d.]+)$/)))return Math.sign(+match[2])===gap.side&&intersects(+match[1]-1.1,+match[1]+1.1,gap);
 // The approved right-side departure crosses the single saloon at297m. Its
 // fixed omission is specific to this teaser, including the matching horn.
 if(gap.side===1&&gap.from<=297&&gap.to>=297&&(id==='queue-no-road-below'||id.startsWith('queue-no-road-below-')))return true;
 return false;
}
function moveCabinLight(light,delta){const p=point(delta,[light.x,light.y,light.z]),out={...light,x:p[0],y:p[1],z:p[2]};if(Array.isArray(light.direction))out.direction=unit(vector(delta,light.direction));if(Number.isFinite(light.shadowYaw)){const look=cameraFrame({yaw:light.shadowYaw,pitch:light.shadowPitch||0},delta);out.shadowYaw=look.yaw;out.shadowPitch=look.pitch;}return out;}
const cabinLight=light=>/^drive-headlamp-[01]$/.test(light.id)||light.id==='drive-instrument-bounce';
function sourceInNewCabin(source,oldInverse,newInverse){if(!Array.isArray(source.world)||!Array.isArray(source.position))return source;const old=point(oldInverse,source.world),next=point(newInverse,source.world),mic=old.map((v,i)=>v-source.position[i]);return{...source,position:next.map((v,i)=>v-mic[i])};}
function worldGroup(group,{gap,oldInverse,newInverse}){if(!group)return group;return{...group,...(group.props?{props:group.props.filter(p=>!removeAtBreak(p,gap))}:{}),...(group.lights?{lights:group.lights.filter(p=>!removeAtBreak(p,gap))}:{}),...(group.sources?{sources:group.sources.filter(p=>!removeAtBreak(p,gap)).map(p=>sourceInNewCabin(p,oldInverse,newInverse))}:{})};}
function exposedCliff(gap){
 // Retain a real fractured face BELOW the road, receding into the bank.
 // Its top never extends underneath the released car. This fixed reference
 // slides past the side of the windscreen as the cabin falls into the void.
 const key=gap.distance+':'+gap.side;if(cliffFaces.has(key))return cliffFaces.get(key);
 const a=worldAt(gap.distance+5,gap.side*1.7),yaw=-a.heading+(gap.side>0?Math.PI:0),c=Math.cos(yaw),s=Math.sin(yaw);
 const matrix=Object.freeze([c,0,-s,0,0,.9,0,0,s,0,c,0,32+a.x,a.y-.11,32+a.z,1]);
 const face=Object.freeze({id:'teaser-exposed-cliff-face',mesh:'dp_cliff_mass',matrix,x:matrix[12],y:matrix[13],z:matrix[14],structural:true,skyExposed:true,cullRadius:36,sourceStructure:'opening-cliff-face'});
 cliffFaces.set(key,face);return face;
}
export function applyDriveTeaserScene(scene,{vehicleMatrix=scene?.body,breakEdge=DRIVE_TEASER_BREAK,look=scene?.look}={}){
 if(!scene?.body||!Array.isArray(scene.props)||!Array.isArray(scene.eye))throw Error('A prepared drive scene is required for the door teaser.');const oldBody=checkedRigid(scene.body,'Base vehicle'),body=Array.from(checkedRigid(vehicleMatrix,'Teaser vehicle')),oldInverse=inverseRigid(oldBody),newInverse=inverseRigid(body),delta=multiply(body,oldInverse),inverseDelta=inverseRigid(delta),gap=gapSettings(breakEdge),attached=[],removed=[],props=[];
 for(const prop of scene.props){if(VEHICLE_MESH.test(prop.mesh||'')){attached.push(prop.id);props.push(matrixProp(prop,delta));}else if(removeAtBreak(prop,gap))removed.push(prop.id);else props.push(prop);}
 const vehicle=bodyFrame(body),base=bodyFrame(oldBody),camera=cameraFrame(look||{yaw:base.yaw,pitch:scene.roadPitch||base.pitch},delta),lamps=(scene.lamps||[]).filter(light=>!removeAtBreak(light,gap)).map(light=>cabinLight(light)?moveCabinLight(light,delta):light),mirrors=(scene.mirrors||[]).map(mirror=>{const orientation=cameraFrame({yaw:mirror.yaw,pitch:mirror.pitch},delta);return{...mirror,eye:point(delta,mirror.eye),yaw:orientation.yaw,pitch:orientation.pitch,roll:orientation.roll};}),settings={gap,oldInverse,newInverse};
 const out={...scene,props,body,eye:point(delta,scene.eye),lamps,mirrors,targets:(scene.targets||[]).map(target=>({...target,point:point(delta,target.point)})),colliders:(scene.colliders||[]).filter(collider=>!removeAtBreak(collider,gap)),cut:worldGroup(scene.cut,settings),predicaments:worldGroup(scene.predicaments,settings),look:{yaw:camera.yaw,pitch:camera.pitch},cameraRig:camera,cameraRoll:camera.roll,vehicleHeading:vehicle.yaw,roadPitch:vehicle.pitch,teaser:{vehicleOnlyDelta:delta,worldMatricesFixed:true,breakEdge:gap?{...gap}:null,removedIds:removed,attachedIds:attached,physicalGroundOwner:'Unmodified live route; this omission is confined to the transient teaser scene.'}};
 if(gap){const face=exposedCliff(gap);out.props.push(face);if(out.predicaments?.props)out.predicaments.props.push(face);out.teaser.fixedFallReference=face.id;}
 if(scene.recorderMatrix)out.recorderMatrix=multiply(delta,scene.recorderMatrix);if(typeof scene.cabPoint==='function')out.cabPoint=p=>point(delta,scene.cabPoint(p));
 // Optional already-built weather support. Preferred host order is to call
 // driveWeatherFrame after this helper with the returned body/headlamps.
 if(scene.worldToCabin)out.worldToCabin=multiply(scene.worldToCabin,inverseDelta);
 if(scene.weather?.worldToCabin)out.weather={...scene.weather,worldToCabin:multiply(scene.weather.worldToCabin,inverseDelta),headlamps:lamps.filter(l=>/^drive-headlamp-[01]$/.test(l.id)).map(l=>({x:l.x,y:l.y,z:l.z,intensity:l.intensity||0}))};
 return out;
}
