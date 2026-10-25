// Reuses the actual opening van, road, bluff coast, headlamps and acquisition.
// Only this transient owner lowers the shallow seabed and removes the wreck.
import {createSourceDriveRenderer} from '../game/source-drive-renderer.js';
import {createDrive} from '../game/source-drive/drive-state.js';
import {makeDriveScene,rotation,multiply} from '../game/source-drive/scene.js';
import {applyOpeningRoadScene} from '../game/source-drive/opening-road.js';
import {applyDriveTeaserScene,DRIVE_TEASER_BREAK} from '../game/source-drive/teaser-scene.js';
import {makeCoastalMemoryScene} from '../game/coastal-memory/scene.js';
import {createDriveWeather,driveWeatherFrame} from '../game/source-drive/weather.js';
import {driveEvolutionFrame} from '../game/source-drive/evolution.js';
import {COASTAL_WORLD_FROM_LOCAL as SITE,COASTAL_MEMORY_LAYOUT as L} from '../data/coastal-memory.js';
import {assetUrl} from '../platform/paths.js';
import * as P3 from './props3d.js';
const point=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
const inverse=m=>{const out=[m[0],m[4],m[8],0,m[1],m[5],m[9],0,m[2],m[6],m[10],0,0,0,0,1],p=point(out,m.slice(12,15));out[12]=-p[0];out[13]=-p[1];out[14]=-p[2];return out;};
const vehicleMesh=/^drive_(?:cabin|radio(?:_needle)?|vehicle_body|wheel|wiper|speed_needle|tyre|recorder_|mirror_|left_|right_)/;
function instance(mesh,matrix,id,radius=10){return{mesh,matrix,id,x:matrix[12],y:matrix[13],z:matrix[14],structural:true,skyExposed:false,cullRadius:radius,sourceStructure:'source-return'};}
function fauna(time){
 const props=[],base=[L.settledPose.position[0]+24,L.settledPose.position[1],L.settledPose.position[2]];
 // Schools have fixed sea-space lanes. They do not follow the driver's head,
 // and remain behind at depth when the van is pulled back toward the surface.
 for(let i=0;i<18;i++){
  const lane=i%3,a=time*(.19+lane*.027)+i*2.39996,r=2.2+lane*1.35;
  const q=[base[0]+Math.cos(a)*r,-35.7+Math.sin(a*.7+i)*1.45,base[2]-4.2+Math.sin(a)*r];
  const local=rotation(Math.sin(time*1.8+i)*.035,-a-Math.PI/2);local[12]=q[0];local[13]=q[1];local[14]=q[2];
  const m=Array.from(multiply(SITE,local));for(const mesh of['source_return_fish_body','source_return_fish_fins'])props.push(instance(mesh,m,'return-school-'+i+'-'+mesh,1));
 }
 for(let i=0;i<64;i++){
  const a=i*2.39996,tilt=.16+(i%17)/17*.62,r=100*Math.sqrt(1-tilt*tilt),local=[base[0]+Math.cos(a)*r,60+tilt*90,base[2]+Math.sin(a)*r],p=point(SITE,local),m=rotation();
  const size=.70+(i%5)*.11;m[0]=m[5]=m[10]=size;m[12]=p[0];m[13]=p[1];m[14]=p[2];props.push(instance('source_return_star',m,'return-star-'+i,2));
 }
 return props;
}
export function sourceReturnRenderFrame(frame,metrics,{lookOffset={yaw:0,pitch:0}}={}){
 const p=frame.vehicle,s=createDrive();Object.assign(s,{x:p.position.x,z:p.position.z,heading:p.heading,roadHeight:p.position.y,speed:p.speed,gear:p.gear,paused:false,programTime:frame.timeSec,furthest:Math.max(304,p.distance),wheelRotation:frame.timeSec*p.speed/.34,throttle:.3,engineLoad:.4,radioOn:false,openingCinematic:frame.cinematic,cutEnabled:false});
 const weather=createDriveWeather({rain:.68,initialWetness:.55,seed:1947});weather.timeSec=frame.timeSec;weather.cloud=.5;weather.wind=[1.4,.6];
 const pane=driveWeatherFrame(weather),base=applyOpeningRoadScene(makeDriveScene(s,metrics,{headlights:true,wipers:true,showHands:frame.camera.dolly<.1,weather:pane}),s);
 const coast=makeCoastalMemoryScene({timeSec:frame.timeSec,includeWreck:false,mode:'opening',vehicleMetrics:metrics});
 coast.props=coast.props.filter(q=>!/^cm_(?:wreck_seat|music_box|broken_music_box|damp_note)/.test(q.mesh));
 coast.props=coast.props.map(q=>{if(q.mesh!=='cm_seabed')return q;const m=[...q.matrix];m[13]-=52;return{...q,matrix:m,y:m[13]};});
 const scene=applyDriveTeaserScene(base,{vehicleMatrix:p.bodyMatrix,breakEdge:DRIVE_TEASER_BREAK,look:{yaw:s.heading,pitch:0},coastalScene:coast});
 // Camera moves through the actual driver's glazing and outside the rigid van.
 scene.eye=[...frame.camera.eye];scene.look={yaw:frame.camera.yaw+(lookOffset.yaw||0)*(1-frame.camera.dolly),pitch:Math.max(-1.49,Math.min(1.49,frame.camera.pitch+(lookOffset.pitch||0)*(1-frame.camera.dolly)))};
 scene.vehicleHeading=p.heading;scene.roadPitch=p.pitch;scene.mirrors=[];scene.cut={sources:[],lights:[]};scene.predicaments={sources:[],lights:[]};
 if(frame.sourceBlack<.999)scene.props.push(...fauna(frame.timeSec));
 if(frame.sourceBlack>=.999)scene.props=scene.props.filter(q=>vehicleMesh.test(q.mesh));
 const headlamps=scene.lamps.filter(l=>/^drive-headlamp-[01]$/.test(l.id));
 for(const lamp of headlamps){const source=frame.lamps.find(l=>l.id===lamp.id);lamp.direction=[...source.direction];lamp.coneOuterCos=.72;lamp.coneInnerCos=.94;}
 const weatherFrame=driveWeatherFrame(weather,{bodyMatrix:scene.body,cabinMount:metrics.cabinBodyMount,headlamps});
 weatherFrame.active=frame.underwater<.02&&frame.camera.dolly<.15;
 weatherFrame.rain*=1-frame.sourceBlack;weatherFrame.extinction*=1-frame.sourceBlack;weatherFrame.cloud*=1-frame.sourceBlack;weatherFrame.groundY=p.position.y;
 weatherFrame.returnBlack={amount:frame.sourceBlack,worldToBody:inverse(p.bodyMatrix),min:metrics.body.min,max:metrics.body.max};
 // The remembered deep water is clear enough to resolve nearby animals and
 // transmitted starlight. Keep the ordinary crash-site water calibration.
 const coastalMemory=frame.sourceBlack>.999?null:{...frame.coastalMemory,waterOptics:{absorptionScale:.35,scatterScale:.12}};
 return{scene,look:scene.look,driveState:{...s,heading:p.heading},weather:weatherFrame,evolution:driveEvolutionFrame(s),coastalMemory,recording:{level:0},cinematicLook:true,physicalHeadlampCones:true};
}
export function createSourceReturnFlashbackRenderer({createRenderer=createSourceDriveRenderer,props=P3,resolveAsset=assetUrl}={}){
 const renderer=createRenderer();let last=null,release=null,disposed=false,initialized=false,initializing=null;
 function initialize(){if(disposed)return Promise.resolve(false);if(initializing)return initializing;initializing=(async()=>{const acquired=await renderer.initialize({coastalMemory:true});if(disposed||acquired===false)return false;await props.addPropPack(resolveAsset('assets/source-return/fauna.glb'));if(disposed)return false;release=props.setAuthoredPropRange('source-return',320);initialized=true;return true;})();return initializing;}
 function render(frame,metrics,options){if(disposed||!initialized)return false;last=sourceReturnRenderFrame(frame,metrics,options);return renderer.render(last);}
 function dispose(){if(disposed)return;disposed=true;initialized=false;release?.();release=null;renderer.dispose();}
 return{initialize,render,dispose,ready:()=>initialized&&!disposed&&renderer.ready(),last:()=>last,diagnostics:()=>({ready:initialized&&!disposed&&renderer.ready(),phase:last?.driveState?.openingCinematic?.phase,props:last?.scene?.props.length,eye:last?.scene?.eye})};
}
