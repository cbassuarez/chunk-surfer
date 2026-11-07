// The two of them on the real road, walking into the real van's lamps. Both bodies are
// the game's own: you are the contractor, the same knit as the sleeve at the wheel, and
// Alan is the man you carried out, still with no shoes. Everything else goes around them.
import {createSourceDriveRenderer} from '../game/source-drive-renderer.js';
import {makeDriveScene} from '../game/source-drive/scene.js';
import {applyOpeningRoadScene,openingWorldAt} from '../game/source-drive/opening-road.js';
import {applyDriveTeaserScene} from '../game/source-drive/teaser-scene.js';
import {driveWeatherFrame} from '../game/source-drive/weather.js';
import {driveEvolutionFrame} from '../game/source-drive/evolution.js';
import {ENDING_WALK_OFF as C} from '../game/ending-walk-off.js';
import {recordistReleaseActorPose} from './recordist-release.js';
import {RECORDIST_RELEASE_RIG} from '../data/recordist-release-rig.js';
import {assetUrl} from '../platform/paths.js';
import * as P3 from './props3d.js';

const FAR=320,YOU_MESH='recordist_contractor',ALAN_MESH='recordist_release_alan',EYE=1.62;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t;
const point=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
const inverse=m=>{const out=[m[0],m[4],m[8],0,m[1],m[5],m[9],0,m[2],m[6],m[10],0,0,0,0,1],p=point(out,m.slice(12,15));out[12]=-p[0];out[13]=-p[1];out[14]=-p[2];return out;};

/** Joint offsets from a flat rig's rest pose. The rig's bone names, under the mesh's own prefix. */
export function walkingCharacter(prefix,time){
  const joints={},pose=recordistReleaseActorPose('walk',time);
  for(const bone of RECORDIST_RELEASE_RIG){
    const at=pose.joints[bone.name];if(!at)continue;
    joints[prefix+bone.name]={translation:at.translation.map((v,k)=>v-bone.head[k]),rotation:[...at.rotation]};
  }
  return{joints};
}
function figure(id,mesh,prefix,distance,lateral,gaitTime,fade){
  const a=openingWorldAt(distance,lateral),yaw=-a.heading,c=Math.cos(yaw),s=Math.sin(yaw),x=32+a.x,y=a.y||0,z=32+a.z;
  return{id,mesh,matrix:[c,0,-s,0,0,1,0,0,s,0,c,0,x,y,z,1],x,y,z,character:walkingCharacter(prefix,gaitTime),solid:false,figure:true,figureFade:fade,structural:true,skyExposed:true,sourceStructure:'ending-walk-off'};
}
/** Pure apart from the camera it remembers once it has stopped following. */
export function endingWalkOffRenderFrame(controller,metrics,memory={}){
  const v=controller.view(),s=controller.drive,pane=driveWeatherFrame(controller.weather);
  const base=applyOpeningRoadScene(makeDriveScene(s,metrics,{headlights:true,wipers:false,showHands:false,weather:pane}),s);
  const you=openingWorldAt(v.youDistance,C.youLateral),heading=you.heading;
  const bob=v.reducedMotion?0:Math.sin(v.gaitTime*Math.PI*2/.525)*.012;
  const firstEye=[32+you.x,(you.y||0)+EYE+bob,32+you.z];
  if(v.dolly<=0)memory.eye=null;
  else if(!memory.from)memory.from={eye:firstEye,distance:v.youDistance};
  // It stays behind them but doesn't let them go: you need to see who is left.
  const from=memory.from?.distance??v.youDistance,anchor=from+(v.youDistance-from)*.58,up=openingWorldAt(anchor-3.4,C.youLateral+1.6,3.15),rest=[32+up.x,up.y,32+up.z];
  const start=memory.from?.eye||firstEye,eye=v.dolly>0?start.map((n,k)=>mix(n,rest[k],v.dolly)):firstEye;
  // Third person looks past the two of them at the lamps, and doesn't follow.
  const toward=openingWorldAt(Math.min(C.vanDistance,v.alanDistance+9),0,1.15),dx=32+toward.x-eye[0],dz=32+toward.z-eye[2],dy=toward.y-eye[1];
  const aimYaw=Math.atan2(dx,-dz),aimPitch=Math.atan2(dy,Math.hypot(dx,dz));
  const look={yaw:v.dolly>0?mix(heading+v.look.yaw,aimYaw,v.dolly):heading+v.look.yaw,pitch:v.dolly>0?mix(v.look.pitch,aimPitch,v.dolly):v.look.pitch};
  const scene=applyDriveTeaserScene(base,{vehicleMatrix:base.body,breakEdge:false,look});
  scene.cut={sources:[],lights:[]};scene.predicaments={sources:[],lights:[]};
  scene.eye=eye;scene.look=look;scene.mirrors=[];
  // Your own body only exists once the camera has left it.
  if(v.dolly>.06&&v.youFade<1)scene.props.push(figure('walk-off-you',YOU_MESH,'contractor_',v.youDistance,C.youLateral,v.gaitTime,v.youFade));
  if(v.alanFade<1)scene.props.push(figure('walk-off-alan',ALAN_MESH,'recordist_release_alan_',v.alanDistance,C.alanLateral,v.gaitTime+.31,v.alanFade));
  const headlamps=scene.lamps.filter(l=>/^drive-headlamp-[01]$/.test(l.id)),weather=driveWeatherFrame(controller.weather,{bodyMatrix:scene.body,cabinMount:metrics.cabinBodyMount,headlamps});
  weather.active=false;weather.groundY=you.y||0;
  weather.rain*=1-v.gone*.8;weather.extinction*=1-v.gone;weather.cloud*=1-v.gone;
  // The road between them and the van is the last of the world. Everything past that
  // has gone, and the strip shortens as they walk it.
  const reach=clamp(C.vanDistance-v.youDistance+3,6,60);
  // The van faces back along the road and stands off its centre, so the box is lopsided
  // in van space: its edges fall just outside the rails, not across the tarmac.
  weather.returnBlack={amount:v.gone,worldToBody:inverse(scene.body),min:[-6.5,-1,metrics.body.min[2]-reach],max:[4.1,4,metrics.body.max[2]+.4]};
  return{scene,look,driveState:{...s,heading:s.heading},weather,evolution:driveEvolutionFrame(s),coastalMemory:null,recording:{level:0},
    cinematicLook:true,timeSec:v.time,reducedMotion:v.reducedMotion};
}
export function createEndingWalkOffRenderer({createRenderer=createSourceDriveRenderer,props=P3,resolveAsset=assetUrl}={}){
  const renderer=createRenderer(),memory={};let last=null,release=null,disposed=false,initialized=false,initializing=null;
  function initialize(){
    if(disposed)return Promise.resolve(false);if(initializing)return initializing;
    initializing=(async()=>{
      const acquired=await renderer.initialize({coastalMemory:false});if(disposed||acquired===false)return false;
      const resident=()=>props.characterStats().meshes||[];
      if(!resident().includes(ALAN_MESH))await props.addCharacterPack(resolveAsset('assets/alan-recordist.glb'));if(disposed)return false;
      if(!resident().includes(YOU_MESH))await props.addCharacterPack(resolveAsset('assets/recordist-characters.glb'));if(disposed)return false;
      release=props.setAuthoredPropRange('ending-walk-off',FAR);initialized=true;return true;
    })();
    return initializing;
  }
  function render(controller,metrics){if(disposed||!initialized)return false;last=endingWalkOffRenderFrame(controller,metrics,memory);return renderer.render(last);}
  function dispose(){if(disposed)return;disposed=true;initialized=false;release?.();release=null;renderer.dispose();}
  return{initialize,render,dispose,ready:()=>initialized&&!disposed&&renderer.ready(),last:()=>last};
}
