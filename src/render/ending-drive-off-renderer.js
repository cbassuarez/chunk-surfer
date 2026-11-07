// The real opening van and road. Everything past the windscreen goes the way the
// return flashback takes it, and the camera leaves by the flashback's own path.
import {createSourceDriveRenderer} from '../game/source-drive-renderer.js';
import {makeDriveScene} from '../game/source-drive/scene.js';
import {applyOpeningRoadScene} from '../game/source-drive/opening-road.js';
import {applyDriveTeaserScene} from '../game/source-drive/teaser-scene.js';
import {driveWeatherFrame} from '../game/source-drive/weather.js';
import {driveEvolutionFrame} from '../game/source-drive/evolution.js';
import {sourceReturnDollyLocal} from '../game/source-return-flashback.js';
import {assetUrl} from '../platform/paths.js';
import * as P3 from './props3d.js';

const FAR=320,LAMP_MESH='source_return_star';
const VEHICLE=/^drive_(?:cabin|radio(?:_needle)?|vehicle_body|wheel|wiper|speed_needle|tyre|recorder_|mirror_|left_|right_)/;
const point=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
const inverse=m=>{const out=[m[0],m[4],m[8],0,m[1],m[5],m[9],0,m[2],m[6],m[10],0,0,0,0,1],p=point(out,m.slice(12,15));out[12]=-p[0];out[13]=-p[1];out[14]=-p[2];return out;};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),ease=x=>{const t=clamp(x,0,1);return t*t*t*(10+t*(-15+6*t));},mix=(a,b,t)=>a+(b-a)*t;
const angularMix=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
// The last you see of it, once the road has gone and it is going without you.
function tailLamps(body,metrics){
  const rear=metrics.body.max[2],y=(metrics.body.min[1]+metrics.body.max[1])*.42;
  return[-1,1].map(side=>{
    const p=point(body,[side*metrics.body.max[0]*.74,y,rear+.02]),m=new Float32Array([.17,0,0,0,0,.17,0,0,0,0,.17,0,p[0],p[1],p[2],1]);
    return{id:`drive-off-tail-${side}`,mesh:LAMP_MESH,matrix:m,x:p[0],y:p[1],z:p[2],structural:true,skyExposed:false,cullRadius:2,sourceStructure:'ending-drive-off'};
  });
}
/** Pure apart from the camera it remembers once it has stopped following. */
export function endingDriveOffRenderFrame(controller,metrics,memory={}){
  const v=controller.view(),p=controller.pose(),s=controller.drive,gone=v.gone,dolly=v.dolly;
  const pane=driveWeatherFrame(controller.weather);
  const base=applyOpeningRoadScene(makeDriveScene(s,metrics,{headlights:true,wipers:true,showHands:dolly<.1,weather:pane}),s);
  const scene=applyDriveTeaserScene(base,{vehicleMatrix:p.bodyMatrix,breakEdge:false,
    look:{yaw:s.heading+(dolly>0?0:v.look.yaw),pitch:base.roadPitch+(dolly>0?0:v.look.pitch)}});
  scene.cut={sources:[],lights:[]};scene.predicaments={sources:[],lights:[]};
  if(dolly>0){
    const body=p.bodyMatrix,target=point(body,[0,1.1,-.4]);
    if(!v.away)memory.eye=point(body,sourceReturnDollyLocal(dolly,metrics));
    // Once released the camera stays where it stopped, and the van goes on.
    const eye=memory.eye||point(body,sourceReturnDollyLocal(1,metrics)),direction=target.map((x,k)=>x-eye[k]),
      aim=ease(dolly/.5),yaw=Math.atan2(direction[0],-direction[2]),pitch=Math.atan2(direction[1],Math.hypot(direction[0],direction[2]));
    scene.eye=eye;scene.look={yaw:angularMix(scene.look.yaw,yaw,aim),pitch:mix(scene.look.pitch,pitch,aim)};
    scene.mirrors=[];
  }
  if(gone>=.999)scene.props=scene.props.filter(q=>VEHICLE.test(q.mesh)&&q.sourceStructure!=='road-cast');
  if(dolly>.3)scene.props.push(...tailLamps(p.bodyMatrix,metrics));
  const headlamps=scene.lamps.filter(l=>/^drive-headlamp-[01]$/.test(l.id));
  const weather=driveWeatherFrame(controller.weather,{bodyMatrix:scene.body,cabinMount:metrics.cabinBodyMount,headlamps});
  weather.active=dolly<.15;
  weather.rain*=1-gone;weather.extinction*=1-gone;weather.cloud*=1-gone;weather.groundY=p.position.y;
  weather.returnBlack={amount:gone,worldToBody:inverse(p.bodyMatrix),min:metrics.body.min,max:metrics.body.max};
  return{scene,look:scene.look,driveState:{...s,heading:p.heading},weather,evolution:driveEvolutionFrame(s),coastalMemory:null,recording:{level:0},
    cinematicLook:true,timeSec:v.time,reducedMotion:v.reducedMotion};
}
export function createEndingDriveOffRenderer({createRenderer=createSourceDriveRenderer,props=P3,resolveAsset=assetUrl}={}){
  const renderer=createRenderer(),memory={};let last=null,release=null,disposed=false,initialized=false,initializing=null;
  function initialize(){
    if(disposed)return Promise.resolve(false);if(initializing)return initializing;
    initializing=(async()=>{
      const acquired=await renderer.initialize({coastalMemory:false});if(disposed||acquired===false)return false;
      await props.addPropPack(resolveAsset('assets/source-return/fauna.glb'));if(disposed)return false;
      release=props.setAuthoredPropRange('ending-drive-off',FAR);initialized=true;return true;
    })();
    return initializing;
  }
  function render(controller,metrics){if(disposed||!initialized)return false;last=endingDriveOffRenderFrame(controller,metrics,memory);return renderer.render(last);}
  function dispose(){if(disposed)return;disposed=true;initialized=false;release?.();release=null;renderer.dispose();}
  return{initialize,render,dispose,ready:()=>initialized&&!disposed&&renderer.ready(),last:()=>last};
}
